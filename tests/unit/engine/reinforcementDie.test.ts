import { describe, it, expect } from 'vitest';
import { rollReinforcementDie, getLegalReinforcementTargets, getFinalConquestTargets } from '@/game/engine/reinforcementDie';
import { createInitialState } from '@/game/engine/setup';
import { isBorderRegion } from '@/game/engine/legalActions';
import type { GameState, PlayerState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchPlayer(state: GameState, playerIndex: 0 | 1, patch: Partial<PlayerState>): GameState {
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, ...patch } : p,
    ) as unknown as typeof state.players,
  };
}

function patchRegion(
  state: GameState, id: number,
  patch: Partial<(typeof state.board.regions)[number]>,
): GameState {
  return {
    ...state,
    board: {
      regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    },
  };
}

/** State with an active race assigned to player 0 and tokens in hand */
function withActivePlayer(
  state: GameState,
  tokensOnBoard = 0,
  availableTokens = 5,
): GameState {
  return patchPlayer(state, 0, {
    activeRace: {
      raceId: 'ratmen' as never,
      powerId: 'bivouacking' as never,
      maxSupply: 20,
      totalTokens: availableTokens + tokensOnBoard,
      tokensOnBoard,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
    },
    availableTokens,
  });
}

// ── rollReinforcementDie ───────────────────────────────────────────────────────

describe('rollReinforcementDie', () => {
  it('always returns a value in {0, 1, 2, 3}', () => {
    const valid = new Set([0, 1, 2, 3]);
    for (let i = 0; i < 200; i++) {
      expect(valid.has(rollReinforcementDie())).toBe(true);
    }
  });

  it('returns 0 at least occasionally (biased toward 0)', () => {
    // Die has three 0-faces out of six — expect at least one 0 in 200 rolls
    const results = Array.from({ length: 200 }, () => rollReinforcementDie());
    expect(results.includes(0)).toBe(true);
  });

  it('returns values no greater than 3', () => {
    for (let i = 0; i < 100; i++) {
      expect(rollReinforcementDie()).toBeLessThanOrEqual(3);
    }
  });
});

// ── getLegalReinforcementTargets ───────────────────────────────────────────────

describe('getLegalReinforcementTargets', () => {
  it('returns only endPhase when player has no active race', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    // No activeRace assigned (initial state before selectCombo)
    const actions = getLegalReinforcementTargets(state, 3);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('endPhase');
  });

  it('returns only endPhase when effective tokens < minimum conquest cost', () => {
    // Region 20 (Southern Shore) is an edge region with cost 2 (empty).
    // With 0 availableTokens + dieResult 0 → can't conquer anything.
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 0); // 0 tokens in hand
    const actions = getLegalReinforcementTargets(state, 0);
    expect(actions.every((a) => a.type === 'endPhase')).toBe(true);
  });

  it('returns useReinforcement targets when effective tokens >= cost', () => {
    // Player first conquest, edge region 20 costs 2, dieResult 1 + 1 token = 2
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 1); // 1 token, first conquest
    const actions = getLegalReinforcementTargets(state, 1);
    const reinforcementActions = actions.filter((a) => a.type === 'useReinforcement');
    expect(reinforcementActions.length).toBeGreaterThan(0);
  });

  it('always includes endPhase in the result', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 5);
    const actions = getLegalReinforcementTargets(state, 3);
    expect(actions.some((a) => a.type === 'endPhase')).toBe(true);
  });

  it('actions have type useReinforcement (not conquer)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 5);
    const actions = getLegalReinforcementTargets(state, 3);
    const nonEndPhase = actions.filter((a) => a.type !== 'endPhase');
    expect(nonEndPhase.every((a) => a.type === 'useReinforcement')).toBe(true);
  });

  it('carries the dieResult in each useReinforcement action', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 5);
    const actions = getLegalReinforcementTargets(state, 2);
    const reinforcementActions = actions.filter(
      (a): a is Extract<typeof a, { type: 'useReinforcement' }> => a.type === 'useReinforcement',
    );
    expect(reinforcementActions.every((a) => a.dieResult === 2)).toBe(true);
  });

  it('does not include player\'s own active regions as targets', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // Own region 20, tokensOnBoard > 0 (subsequent conquest)
    state = withActivePlayer(state, 3, 5);
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    const actions = getLegalReinforcementTargets(state, 3);
    const reinforcementActions = actions.filter(
      (a): a is Extract<typeof a, { type: 'useReinforcement' }> => a.type === 'useReinforcement',
    );
    expect(reinforcementActions.every((a) => a.regionId !== 20)).toBe(true);
  });

  it('respects adjacency for non-first conquests', () => {
    // Player owns region 20 (adjacent to 16,17,18,21,22,23 per map data).
    // Non-adjacent regions (e.g. region 1) should not appear.
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 3, 5); // tokensOnBoard > 0 → not first
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });

    const actions = getLegalReinforcementTargets(state, 3);
    const reinforcementActions = actions.filter(
      (a): a is Extract<typeof a, { type: 'useReinforcement' }> => a.type === 'useReinforcement',
    );
    // Region 1 is far from region 20 on the map
    const adjacentToOwned = [16, 17, 18, 21, 22, 23]; // neighbours of 20
    for (const a of reinforcementActions) {
      const isAdjacentOrOwned = adjacentToOwned.includes(a.regionId) || a.regionId === 20;
      expect(isAdjacentOrOwned).toBe(true);
    }
  });

  it('first conquest targets only border regions (no Flying)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 5); // tokensOnBoard === 0 → first
    const actions = getLegalReinforcementTargets(state, 3);
    const reinforcementActions = actions.filter(
      (a): a is Extract<typeof a, { type: 'useReinforcement' }> => a.type === 'useReinforcement',
    );
    // All targets must be border regions (edge or adjacent to edge sea/lake)
    // Interior lake-adjacent regions (e.g. region 8) should be excluded
    for (const a of reinforcementActions) {
      const region = state.board.regions.find((r) => r.id === a.regionId)!;
      expect(isBorderRegion(state, region)).toBe(true);
    }
  });

  it('more tokens + higher die result → more valid targets', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 5);
    const lowTargets = getLegalReinforcementTargets(state, 0).filter((a) => a.type !== 'endPhase');
    const highTargets = getLegalReinforcementTargets(state, 3).filter((a) => a.type !== 'endPhase');
    expect(highTargets.length).toBeGreaterThanOrEqual(lowTargets.length);
  });
});

// ── getFinalConquestTargets ──────────────────────────────────────────────────

describe('getFinalConquestTargets', () => {
  it('returns same results as getLegalReinforcementTargets with max die (3)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 5);
    const finalTargets = getFinalConquestTargets(state);
    const maxDieTargets = getLegalReinforcementTargets(state, 3);
    expect(finalTargets).toEqual(maxDieTargets);
  });

  it('returns only endPhase when no active race', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const actions = getFinalConquestTargets(state);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('endPhase');
  });

  it('includes targets reachable with max die but not with 0 tokens alone', () => {
    // Player has 0 tokens but die max (3) could reach cost-2 targets
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 0); // 0 tokens in hand
    const targets = getFinalConquestTargets(state);
    const reinforcements = targets.filter((a) => a.type === 'useReinforcement');
    // With 0 tokens + max die 3, can reach regions costing up to 3
    expect(reinforcements.length).toBeGreaterThan(0);
  });

  it('returns useReinforcement actions with dieResult 3', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActivePlayer(state, 0, 5);
    const targets = getFinalConquestTargets(state);
    const reinforcements = targets.filter(
      (a): a is Extract<typeof a, { type: 'useReinforcement' }> => a.type === 'useReinforcement',
    );
    expect(reinforcements.every((a) => a.dieResult === 3)).toBe(true);
  });
});
