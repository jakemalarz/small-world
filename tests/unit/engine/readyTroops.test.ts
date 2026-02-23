import { describe, it, expect } from 'vitest';
import { applyAction } from '@/game/engine/actions';
import { createInitialState } from '@/game/engine/setup';
import { getLegalActions } from '@/game/engine/legalActions';
import type { GameState, PlayerState, RegionState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => (i === idx ? { ...p, ...patch } : p)) as unknown as typeof state.players,
  };
}

function patchRegion(state: GameState, id: number, patch: Partial<RegionState>): GameState {
  return {
    ...state,
    board: { regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
  };
}

/** Construct a readyTroops state with an active race and some occupied regions. */
function readyTroopsState(): GameState {
  let state = createInitialState({ firstPlayerIndex: 0 });

  // Assign active race
  state = patchPlayer(state, 0, {
    activeRace: {
      raceId: 'ratmen' as never,
      powerId: 'bivouacking' as never,
      maxSupply: 20,
      totalTokens: 10,
      tokensOnBoard: 5,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
    },
    availableTokens: 5,
  });

  // Give two owned regions (19 and 20) with tokens
  state = patchRegion(state, 19, { owner: 0, tokens: 3, isDeclined: false });
  state = patchRegion(state, 20, { owner: 0, tokens: 2, isDeclined: false });

  return { ...state, phase: 'readyTroops' };
}

// ── pickUpTokens ──────────────────────────────────────────────────────────────

describe('readyTroops — pickUpTokens', () => {
  it('reduces region tokens and adds to availableTokens', () => {
    const state = readyTroopsState();
    const next = applyAction(state, { type: 'pickUpTokens', regionId: 19, count: 2 });
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(1); // 3-2=1
    expect(next.players[0].availableTokens).toBe(7); // 5+2
  });

  it('picking up all tokens abandons the region (FR-13b)', () => {
    const state = readyTroopsState();
    // Pick up all 3 from region 19 — region abandoned
    const next = applyAction(state, { type: 'pickUpTokens', regionId: 19, count: 3 });
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(0);
    expect(next.board.regions.find((r) => r.id === 19)!.owner).toBeNull();
    expect(next.players[0].availableTokens).toBe(8); // 5+3
  });

  it('picking 0 tokens is a no-op', () => {
    const state = readyTroopsState();
    const next = applyAction(state, { type: 'pickUpTokens', regionId: 19, count: 0 });
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(3);
    expect(next.players[0].availableTokens).toBe(5);
  });

  it('updates tokensOnBoard on active race', () => {
    const state = readyTroopsState();
    const before = state.players[0].activeRace!.tokensOnBoard; // 5
    const next = applyAction(state, { type: 'pickUpTokens', regionId: 19, count: 2 });
    expect(next.players[0].activeRace!.tokensOnBoard).toBe(before - 2);
  });

  it('does not affect other regions', () => {
    const state = readyTroopsState();
    const before20 = state.board.regions.find((r) => r.id === 20)!.tokens;
    const next = applyAction(state, { type: 'pickUpTokens', regionId: 19, count: 1 });
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBe(before20);
  });

  it('legal actions include pickUpTokens for owned regions with > 1 token', () => {
    const state = readyTroopsState();
    const legal = getLegalActions(state);
    const pickUps = legal.filter((a) => a.type === 'pickUpTokens');
    // Regions 19 (3 tokens) and 20 (2 tokens) should each have a pickUp action
    expect(pickUps.some((a) => (a as { regionId: number }).regionId === 19)).toBe(true);
    expect(pickUps.some((a) => (a as { regionId: number }).regionId === 20)).toBe(true);
  });

  it('region with exactly 1 token appears in pickUpTokens (allows abandon FR-13b)', () => {
    let state = readyTroopsState();
    state = patchRegion(state, 20, { tokens: 1 });
    const legal = getLegalActions(state);
    const pickUp20 = legal.filter(
      (a) => a.type === 'pickUpTokens' && (a as { regionId: number }).regionId === 20,
    );
    expect(pickUp20).toHaveLength(1);
  });

  it('endPhase is always legal during readyTroops', () => {
    const state = readyTroopsState();
    const legal = getLegalActions(state);
    expect(legal.some((a) => a.type === 'endPhase')).toBe(true);
  });

  it('original state is not mutated', () => {
    const state = readyTroopsState();
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: 'pickUpTokens', regionId: 19, count: 2 });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

// ── readyTroopsDeploy ──────────────────────────────────────────────────────

describe('readyTroops — readyTroopsDeploy', () => {
  it('reduces region tokens and adds to availableTokens', () => {
    const state = readyTroopsState();
    // Gather 2 from region 19 (3→1) and 1 from region 20 (2→1)
    const deployment = new Map([[19, 1], [20, 1]]);
    const next = applyAction(state, { type: 'readyTroopsDeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(1);
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBe(1);
    expect(next.players[0].availableTokens).toBe(8); // 5+2+1
  });

  it('abandons region when set to 0 tokens (FR-13b)', () => {
    const state = readyTroopsState();
    const deployment = new Map([[19, 0], [20, 2]]);
    const next = applyAction(state, { type: 'readyTroopsDeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(0);
    expect(next.board.regions.find((r) => r.id === 19)!.owner).toBeNull();
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBe(2);
    expect(next.players[0].availableTokens).toBe(8); // 5+3
  });

  it('is a no-op when deployment matches current state', () => {
    const state = readyTroopsState();
    const deployment = new Map([[19, 3], [20, 2]]);
    const next = applyAction(state, { type: 'readyTroopsDeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(3);
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBe(2);
    expect(next.players[0].availableTokens).toBe(5); // unchanged
  });

  it('updates tokensOnBoard on active race', () => {
    const state = readyTroopsState();
    const deployment = new Map([[19, 1], [20, 1]]);
    const next = applyAction(state, { type: 'readyTroopsDeploy', deployment });
    // Originally 5 on board, picked up 3 → 2 on board
    expect(next.players[0].activeRace!.tokensOnBoard).toBe(2);
  });

  it('appears in legal actions during readyTroops', () => {
    const state = readyTroopsState();
    const legal = getLegalActions(state);
    expect(legal.some((a) => a.type === 'readyTroopsDeploy')).toBe(true);
  });

  it('does not affect declined regions', () => {
    let state = readyTroopsState();
    state = patchRegion(state, 19, { isDeclined: true });
    const deployment = new Map([[19, 0]]);
    const next = applyAction(state, { type: 'readyTroopsDeploy', deployment });
    // Region 19 is declined — should not be affected
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(3);
    expect(next.board.regions.find((r) => r.id === 19)!.owner).toBe(0);
  });

  it('original state is not mutated', () => {
    const state = readyTroopsState();
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: 'readyTroopsDeploy', deployment: new Map([[19, 1]]) });
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
