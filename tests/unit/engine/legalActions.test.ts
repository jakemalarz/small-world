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

  it('redeploy → only endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchState(state, { phase: 'redeploy' });
    expect(actionTypes(state)).toEqual(['endPhase']);
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

  it('does not include pickUpTokens for region with exactly 1 token', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchState(state, { phase: 'readyTroops' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    const pickup = getLegalActions(state).filter((a) => a.type === 'pickUpTokens');
    const has20 = pickup.some(
      (a) => (a as { type: 'pickUpTokens'; regionId: number }).regionId === 20,
    );
    expect(has20).toBe(false);
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

  it('includes conquer for coastal regions (first conquest)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 2 isCoastal:true (borders Sea)
    const has2 = conquests.some(
      (a) => (a as { type: 'conquer'; regionId: number }).regionId === 2,
    );
    expect(has2).toBe(true);
  });

  it('does not include non-edge/non-coastal interior regions (first conquest)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 0 });
    state = patchState(state, { phase: 'conquest' });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Region 8 (Rolling Farms) — isEdge:false, isCoastal:true (borders lake!)
    // Let's check for region 14 (Bogmoss) — isEdge:true so it's valid
    // Actually check region 15 (Meadow Run): isEdge:false, isCoastal:true — valid!
    // Find a region that is neither edge nor coastal
    // Region 17 (River Bend): isEdge:false, isCoastal:false
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
});

// ── conquest — subsequent conquests ──────────────────────────────────────────

describe('conquest phase — subsequent conquests', () => {
  it('only allows conquest of regions adjacent to owned active regions', () => {
    // Player owns region 20 (active, tokens=1). Region 20 is adjacent to 13,16,17,18,19.
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 1 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    const conquests = getLegalActions(state)
      .filter((a) => a.type === 'conquer')
      .map((a) => (a as { type: 'conquer'; regionId: number }).regionId);

    // Should include region 19 (adjacent to 20)
    expect(conquests).toContain(19);
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
    state = patchRegion(state, 19, { owner: 0, tokens: 1, isDeclined: false });
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    // Both own active — neither should appear
    const regionIds = conquests.map((a) => (a as { type: 'conquer'; regionId: number }).regionId);
    expect(regionIds).not.toContain(20);
    expect(regionIds).not.toContain(19);
  });

  it('can conquer own declined regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist', { tokensOnBoard: 1 });
    state = patchState(state, { phase: 'conquest' });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false }); // active
    state = patchRegion(state, 19, { owner: 0, tokens: 1, isDeclined: true });  // declined, adjacent to 20
    const conquests = getLegalActions(state).filter((a) => a.type === 'conquer');
    const regionIds = conquests.map((a) => (a as { type: 'conquer'; regionId: number }).regionId);
    expect(regionIds).toContain(19);
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
    // Region 17 (River Bend, interior farmland) should be reachable
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
