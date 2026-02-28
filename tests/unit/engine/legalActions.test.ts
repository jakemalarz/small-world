import { describe, it, expect } from 'vitest';
import { getLegalActions } from '@/game/engine/legalActions';
import { createInitialState } from '@/game/engine/setup';
import type { GameState, PlayerState, RegionState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch };
}

function patchRegion(state: GameState, id: number, patch: Partial<RegionState>): GameState {
  return {
    ...state,
    board: {
      regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    },
  };
}

function patchPlayer(state: GameState, playerIndex: 0 | 1, patch: Partial<PlayerState>): GameState {
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, ...patch } : p,
    ) as unknown as typeof state.players,
  };
}

function withRace(
  state: GameState,
  raceId: string,
  powerId: string,
  extra: Record<string, unknown> = {},
): GameState {
  return patchPlayer(state, state.activePlayerIndex, {
    activeRace: {
      raceId: raceId as never,
      powerId: powerId as never,
      maxSupply: 20,
      totalTokens: 10,
      tokensOnBoard: 0,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
      ...extra,
    },
    availableTokens: 10,
  });
}

function actionTypes(state: GameState): string[] {
  return getLegalActions(state).map((a) => a.type);
}

// ── Phase routing ─────────────────────────────────────────────────────────────

describe('phase routing', () => {
  it('score phase → only endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchState(state, { phase: 'score' });
    expect(actionTypes(state)).toEqual(['endPhase']);
  });

  it('optionalDecline phase → decline and endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchState(state, { phase: 'optionalDecline' });
    expect(actionTypes(state)).toContain('decline');
    expect(actionTypes(state)).toContain('endPhase');
  });

  it('decline phase → only decline', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchState(state, { phase: 'decline' });
    expect(actionTypes(state)).toEqual(['decline']);
  });

  it('gameOver → empty list', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchState(state, { phase: 'gameOver' });
    expect(getLegalActions(state)).toHaveLength(0);
  });

  it('redeploy → includes endPhase (and placeholder redeploy for UI validation)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchState(state, { phase: 'redeploy' });
    const types = actionTypes(state);
    expect(types).toContain('endPhase');
  });
});

// ── selectCombo ───────────────────────────────────────────────────────────────

describe('selectCombo phase', () => {
  it('player with 5 coins can pick indices 0–5', () => {
    const state = createInitialState({ firstPlayerIndex: 0 }); // phase: selectCombo
    const actions = getLegalActions(state);
    const types = actions.map((a) => a.type);
    expect(types.every((t) => t === 'selectCombo')).toBe(true);
    expect(actions).toHaveLength(6); // indices 0–5 all affordable with 5 coins
  });

  it('player with 0 coins can only pick index 0', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchPlayer(state, 0, { coins: 0 });
    const actions = getLegalActions(state);
    expect(actions).toHaveLength(1);
    expect((actions[0] as { type: 'selectCombo'; comboIndex: number }).comboIndex).toBe(0);
  });

  it('player with 2 coins can pick indices 0, 1, 2', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchPlayer(state, 0, { coins: 2 });
    const actions = getLegalActions(state);
    expect(actions).toHaveLength(3);
  });
});

// ── readyTroops ───────────────────────────────────────────────────────────────

describe('readyTroops phase', () => {
  it('always includes endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchState(state, { phase: 'readyTroops' });
    expect(actionTypes(state)).toContain('endPhase');
  });

  it('includes pickUpTokens for owned active regions with >1 token', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchState(state, { phase: 'readyTroops' });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    const actions = getLegalActions(state);
    const pickup = actions.filter((a) => a.type === 'pickUpTokens');
    expect(pickup.length).toBeGreaterThanOrEqual(1);
    const pickupRegion20 = pickup.find(
      (a) => (a as { type: 'pickUpTokens'; regionId: number }).regionId === 20,
    );
    expect(pickupRegion20).toBeDefined();
  });

  it('includes pickUpTokens for region with exactly 1 token (allows abandon FR-13b)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchState(state, { phase: 'readyTroops' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    const pickup = getLegalActions(state).filter((a) => a.type === 'pickUpTokens');
    const has20 = pickup.some(
      (a) => (a as { type: 'pickUpTokens'; regionId: number }).regionId === 20,
    );
    expect(has20).toBe(true);
  });

  it('does not include pickUpTokens for declined regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchState(state, { phase: 'readyTroops' });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: true });
    const pickup = getLegalActions(state).filter((a) => a.type === 'pickUpTokens');
    const has20 = pickup.some(
      (a) => (a as { type: 'pickUpTokens'; regionId: number }).regionId === 20,
    );
    expect(has20).toBe(false);
  });
});

// ── conquest — first conquest adjacency ───────────────────────────────────────

describe('conquest phase — first conquest', () => {
  it('includes conquer for edge regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 20 is isEdge:true
    const has20 = conquests.some(
      (a) => (a as { type: 'conquer'; regionId: number }).regionId === 20,
    );
    expect(has20).toBe(true);
  });

  it('includes conquer for regions adjacent to edge sea (first conquest)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 2 is isEdge:true and borders Sea (1) — valid border region
    const has2 = conquests.some(
      (a) => (a as { type: 'conquer'; regionId: number }).regionId === 2,
    );
    expect(has2).toBe(true);
  });

  it('excludes interior lake-adjacent regions (first conquest)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 8 borders Lake (9) but lake is not at edge — NOT a border region
    const has8 = conquests.some(
      (a) => (a as { type: 'conquer'; regionId: number }).regionId === 8,
    );
    expect(has8).toBe(false);
  });

  it('does not include fully interior regions (first conquest)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 17 (Hollow Ridge): isEdge:false, not adjacent to any edge water
    const has17 = conquests.some(
      (a) => (a as { type: 'conquer'; regionId: number }).regionId === 17,
    );
    expect(has17).toBe(false);
  });

  it('always includes endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    expect(actionTypes(state)).toContain('endPhase');
  });

  it('enforces border restriction for player 2 first conquest (after player 1 played)', () => {
    // Simulate: player 1 conquered region 8 (interior, lake-adjacent), then
    // it's player 2's first turn. Player 2 should NOT be able to conquer region 8.
    let state = createInitialState({ firstPlayerIndex: 0 });
    // Player 1 owns region 8 with tokens
    state = patchRegion(state, 8, { owner: 0, tokens: 3, hasLostTribe: false });
    // Switch to player 2 (index 1) for their first conquest
    state = patchState(state, { activePlayerIndex: 1, phase: 'conquest' });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'orcs' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20,
        totalTokens: 10,
        tokensOnBoard: 0,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 10,
    });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const regionIds = conquests.map((a) => (a as { regionId: number }).regionId);
    // Region 8 is interior (lake-adjacent, not edge) — should NOT be a target
    expect(regionIds).not.toContain(8);
    // Region 17 is fully interior — should NOT be a target
    expect(regionIds).not.toContain(17);
    // Region 20 is edge — should be a target
    expect(regionIds).toContain(20);
  });
});

// ── conquest — subsequent conquests ──────────────────────────────────────────

describe('conquest phase — subsequent conquests', () => {
  it('only allows conquest of regions adjacent to owned active regions', () => {
    // Player owns region 20 (active, tokens=1). Region 20 is adjacent to 16,17,18,21,22,23.
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 1 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    const conquests = getLegalActions(state)
      .filter((a) => a.type === 'conquer')
      .map((a) => (a as { type: 'conquer'; regionId: number }).regionId);

    // Should include region 17 (adjacent to 20)
    expect(conquests).toContain(17);
    // Should NOT include non-adjacent far regions like region 1 (Sea)
    expect(conquests).not.toContain(1);
    // Should NOT include region 20 itself
    expect(conquests).not.toContain(20);
  });

  it('cannot conquer own active (non-declined) regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 1 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    state = patchRegion(state, 22, { owner: 0, tokens: 1, isDeclined: false });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Both own active — neither should appear
    const regionIds = conquests.map((a) => (a as { type: 'conquer'; regionId: number }).regionId);
    expect(regionIds).not.toContain(20);
    expect(regionIds).not.toContain(22);
  });

  it('can conquer own declined regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 1 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false }); // active
    state = patchRegion(state, 22, { owner: 0, tokens: 1, isDeclined: true });  // declined, adjacent to 20
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const regionIds = conquests.map((a) => (a as { type: 'conquer'; regionId: number }).regionId);
    expect(regionIds).toContain(22);
  });
});

// ── conquest — sea / protected regions ───────────────────────────────────────

describe('conquest phase — seas and protected regions', () => {
  it('sea region not conquerable without Seafaring', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 1 is sea
    const hasSea = conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 1);
    expect(hasSea).toBe(false);
  });

  it('sea region IS conquerable with Seafaring (Tritons + Seafaring)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'tritons', 'seafaring', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 1 (Sea) is isEdge:true, so reachable on first conquest. With Seafaring, conquerable.
    const hasSea = conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 1);
    expect(hasSea).toBe(true);
  });

  it('region with hasDragon cannot be conquered', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { hasDragon: true });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const has20 = conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 20);
    expect(has20).toBe(false);
  });

  it('region with hasHoleInTheGround cannot be conquered', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { hasHoleInTheGround: true });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    expect(conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 20)).toBe(false);
  });

  it('region too expensive is not included', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // Give player only 1 token in hand
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 9 });
    state = patchPlayer(state, 0, { availableTokens: 1 });
    state = patchState(state, { phase: 'conquest' });
    // Region 20 normally costs 2 (empty) — can't afford with 1 token
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    expect(conquests).toHaveLength(0);
  });
});

// ── Flying power ──────────────────────────────────────────────────────────────

describe('conquest — Flying power (ignore adjacency)', () => {
  it('Flying first conquest can target any non-sea/lake region', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'elves', 'flying', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 17 (Hollow Ridge, interior hill) should be reachable
    const has17 = conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 17);
    expect(has17).toBe(true);
  });

  it('Flying subsequent conquest can still target any non-sea/lake region', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'elves', 'flying', { tokensOnBoard: 1 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const has17 = conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 17);
    expect(has17).toBe(true);
  });
});

// ── Halflings — first conquest anywhere ──────────────────────────────────────

describe('conquest — Halflings (first conquest anywhere)', () => {
  it('Halflings can target interior non-edge, non-coastal region on first conquest', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'halflings', 'bivouacking', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const has17 = conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 17);
    expect(has17).toBe(true);
  });
});

// ── conquest — startFinalConquest ─────────────────────────────────────────────

describe('conquest — startFinalConquest availability', () => {
  it('includes startFinalConquest when player has tokens and valid die targets', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 3 });
    state = patchPlayer(state, 0, { availableTokens: 2 });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    state = patchState(state, { phase: 'conquest' });
    const types = actionTypes(state);
    expect(types).toContain('startFinalConquest');
    expect(types).toContain('endPhase');
  });

  it('excludes startFinalConquest when player has no tokens', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 10 });
    state = patchPlayer(state, 0, { availableTokens: 0 });
    state = patchState(state, { phase: 'conquest' });
    const types = actionTypes(state);
    expect(types).not.toContain('startFinalConquest');
    expect(types).toContain('endPhase');
  });
});

// ── reinforcementDie — two-step flow ────────────────────────────────────────

describe('reinforcementDie phase — two-step flow', () => {
  it('step 1 (die not rolled): returns useReinforcement targets + endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 3 });
    state = patchPlayer(state, 0, { availableTokens: 2 });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    state = patchState(state, { phase: 'reinforcementDie', reinforcementDie: null });
    const types = actionTypes(state);
    expect(types).toContain('endPhase');
    expect(types).toContain('useReinforcement');
  });

  it('step 2 (die rolled): returns only endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 3 });
    state = patchPlayer(state, 0, { availableTokens: 2 });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    state = patchState(state, {
      phase: 'reinforcementDie',
      reinforcementDie: { result: 2, targetRegionId: 20 },
    });
    expect(actionTypes(state)).toEqual(['endPhase']);
  });

  it('step 1 with no valid targets: returns only endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // No active race → no targets
    state = patchState(state, { phase: 'reinforcementDie', reinforcementDie: null });
    const actions = getLegalActions(state);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('endPhase');
  });
});

// ── Feature 7: Berserk die on every conquest ──────────────────────────────────

describe('conquest — Berserk die supplements affordability', () => {
  it('Berserk includes regions affordable with availableTokens + 3', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // First conquest scenario (tokensOnBoard=0): any border region is reachable.
    // Player has exactly 1 token in hand. Without Berserk, cost 2 is unaffordable.
    // With Berserk effectiveTokens = 1 + 3 = 4 >= 2 → region 20 should be included.
    state = withRace(state, 'ratmen', 'berserk', { tokensOnBoard: 0 });
    state = patchPlayer(state, 0, { availableTokens: 1 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    expect(conquests.length).toBeGreaterThan(0);
  });

  it('Berserk allows conquering a region that costs more than availableTokens alone', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // Region 20 is empty → base cost 2.
    // First conquest; player has 1 token only (normally cannot afford), but Berserk +3 = effective 4.
    state = withRace(state, 'ratmen', 'berserk', { tokensOnBoard: 0 });
    state = patchPlayer(state, 0, { availableTokens: 1 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const has20 = conquests.some(
      (a) => (a as { type: 'conquer'; regionId: number }).regionId === 20,
    );
    expect(has20).toBe(true);
  });

  it('Berserk does not include regions beyond availableTokens + 3', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // First conquest; player has 0 tokens in hand; effectiveTokens = 0 + 3 = 3.
    // Region 20 is at an edge (border), cost = 3 (defender 2 tokens + 1 = 3).
    // 3 <= 3 → would be included. Make it cost 4 to exceed the effective cap.
    state = withRace(state, 'ratmen', 'berserk', { tokensOnBoard: 0 });
    state = patchPlayer(state, 0, { availableTokens: 0 });
    state = patchState(state, { phase: 'conquest' });
    // Give player 1 three tokens on region 20 + a mountain: cost = 3 + 1 (mountain) + 1 = 5
    state = patchRegion(state, 20, {
      owner: 1, tokens: 3, isDeclined: false, hasMountain: true,
    });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'humans' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20, totalTokens: 5, tokensOnBoard: 3,
        conquestsThisTurn: 0, hasDeclinedThisTurn: false, sorcererConversionsThisTurn: 0,
      },
      availableTokens: 2,
    });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const has20 = conquests.some(
      (a) => (a as { type: 'conquer'; regionId: number }).regionId === 20,
    );
    // effectiveTokens = 0 + 3 = 3; cost = 3 + 1 (mountain) + 1 = 5; 3 < 5 → excluded
    expect(has20).toBe(false);
  });

  it('non-Berserk player does not get +3 effective tokens', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // First conquest; player has 1 token; empty border region costs 2. Without Berserk → too expensive.
    state = withRace(state, 'ratmen', 'bivouacking', { tokensOnBoard: 0 });
    state = patchPlayer(state, 0, { availableTokens: 1 });
    state = patchState(state, { phase: 'conquest' });
    // Empty region costs 2; player has 1 token → too expensive without Berserk
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    expect(conquests).toHaveLength(0);
  });
});

// ── Feature 8: Heroic placeHeroes phase ───────────────────────────────────────

describe('placeHeroes phase', () => {
  function heroicState(): GameState {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'heroic', { tokensOnBoard: 3 });
    state = patchState(state, { phase: 'placeHeroes' });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    return state;
  }

  it('generates placeHeroes actions for all pairs of owned active regions', () => {
    const state = heroicState();
    const actions = getLegalActions(state);
    const heroActions = actions.filter((a) => a.type === 'placeHeroes');
    // 2 regions → C(2,2) = 1 pair
    expect(heroActions).toHaveLength(1);
    const first = heroActions[0] as { type: 'placeHeroes'; regionIds: [number, number] };
    const ids = new Set(first.regionIds);
    expect(ids.has(19)).toBe(true);
    expect(ids.has(20)).toBe(true);
  });

  it('generates pairs for 3 owned regions — C(3,2) = 3 pairs', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'heroic', { tokensOnBoard: 4 });
    state = patchState(state, { phase: 'placeHeroes' });
    state = patchRegion(state, 18, { owner: 0, tokens: 1, isDeclined: false });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    const heroActions = getLegalActions(state).filter((a) => a.type === 'placeHeroes');
    expect(heroActions).toHaveLength(3);
  });

  it('always includes endPhase (can skip hero placement)', () => {
    const state = heroicState();
    expect(actionTypes(state)).toContain('endPhase');
  });

  it('returns only endPhase when fewer than 2 owned active regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'heroic', { tokensOnBoard: 1 });
    state = patchState(state, { phase: 'placeHeroes' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    const actions = getLegalActions(state);
    expect(actions).toHaveLength(1);
    expect(actions[0].type).toBe('endPhase');
  });

  it('does not include declined regions as hero targets', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'heroic', { tokensOnBoard: 2 });
    state = patchState(state, { phase: 'placeHeroes' });
    state = patchRegion(state, 19, { owner: 0, tokens: 1, isDeclined: true }); // declined
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false }); // active
    const heroActions = getLegalActions(state).filter((a) => a.type === 'placeHeroes');
    // Only 1 active region → no valid pair → no placeHeroes actions
    expect(heroActions).toHaveLength(0);
  });
});

// ── Sorcerer — once per turn per opponent ──────────────────────────────────

describe('conquest — Sorcerer conversion limit', () => {
  function sorcererState(): GameState {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'sorcerers', 'bivouacking', { tokensOnBoard: 3 });
    state = patchState(state, { phase: 'conquest' });
    // Player 0 owns region 20 (active)
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    // Opponent (player 1) has a lone token adjacent to region 20
    // Region 22 is adjacent to 20
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'humans' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20,
        totalTokens: 5,
        tokensOnBoard: 1,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 4,
    });
    state = patchRegion(state, 22, { owner: 1, tokens: 1, isDeclined: false });
    return state;
  }

  it('sorcerer can convert an adjacent lone enemy token', () => {
    const state = sorcererState();
    const types = actionTypes(state);
    expect(types).toContain('sorcererConvert');
  });

  it('sorcerer cannot convert after already using conversion this turn', () => {
    let state = sorcererState();
    // Mark that a conversion was already used this turn
    state = patchPlayer(state, 0, {
      activeRace: {
        ...state.players[0].activeRace!,
        sorcererConversionsThisTurn: 1,
      },
    });
    const types = actionTypes(state);
    expect(types).not.toContain('sorcererConvert');
  });
});
