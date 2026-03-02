import { describe, it, expect } from 'vitest';
import { applyAction } from '@/game/engine/actions';
import { createInitialState } from '@/game/engine/setup';
import { calculateConquestCost } from '@/game/engine/conquestCost';
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

function bivouackingState(): GameState {
  let state = createInitialState({ firstPlayerIndex: 0 });
  state = patchPlayer(state, 0, {
    activeRace: {
      raceId: 'humans' as never,
      powerId: 'bivouacking' as never,
      maxSupply: 20,
      totalTokens: 7,
      tokensOnBoard: 3,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
    },
    availableTokens: 4,
  });
  state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
  state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
  return { ...state, phase: 'placeEncampments' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Encampment placement', () => {
  it('distributes encampments according to deployment map', () => {
    const state = bivouackingState();
    const deployment = new Map([[19, 3], [20, 2]]);
    const next = applyAction(state, { type: 'placeEncampments', deployment });
    expect(next.board.regions.find((r) => r.id === 19)!.encampmentCount).toBe(3);
    expect(next.board.regions.find((r) => r.id === 20)!.encampmentCount).toBe(2);
  });

  it('caps total encampments at 5', () => {
    const state = bivouackingState();
    // Try to place 6 total — should be capped
    const deployment = new Map([[19, 4], [20, 3]]);
    const next = applyAction(state, { type: 'placeEncampments', deployment });
    const total = next.board.regions
      .filter((r) => r.owner === 0 && !r.isDeclined)
      .reduce((sum, r) => sum + r.encampmentCount, 0);
    expect(total).toBeLessThanOrEqual(5);
  });

  it('clears existing encampments before placing new ones', () => {
    let state = bivouackingState();
    state = patchRegion(state, 19, { encampmentCount: 3 });
    const deployment = new Map([[20, 2]]);
    const next = applyAction(state, { type: 'placeEncampments', deployment });
    // Region 19 should have encampments cleared (was 3, now 0 since not in deployment)
    expect(next.board.regions.find((r) => r.id === 19)!.encampmentCount).toBe(0);
    expect(next.board.regions.find((r) => r.id === 20)!.encampmentCount).toBe(2);
  });

  it('each encampment adds +1 to conquest defense', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchPlayer(state, 0, {
      activeRace: {
        raceId: 'humans' as never,
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
    // Region 14 with 1 enemy token and 2 encampments (clear lost tribe so cost is predictable)
    state = patchRegion(state, 14, { owner: 1, tokens: 1, isDeclined: false, encampmentCount: 2, hasLostTribe: false });
    // Cost = 2 base + 1 token + 2 encampments = 5
    expect(calculateConquestCost(state, 14)).toBe(5);
  });

  it('encampments disappear on decline', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchPlayer(state, 0, {
      activeRace: {
        raceId: 'humans' as never,
        powerId: 'bivouacking' as never,
        maxSupply: 20,
        totalTokens: 3,
        tokensOnBoard: 3,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 0,
    });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, encampmentCount: 3 });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false, encampmentCount: 2 });
    state = { ...state, phase: 'decline' };
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 19)!.encampmentCount).toBe(0);
    expect(next.board.regions.find((r) => r.id === 20)!.encampmentCount).toBe(0);
  });

  it('encampments are cleared when region is conquered', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchPlayer(state, 0, {
      activeRace: {
        raceId: 'humans' as never,
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
    state = patchRegion(state, 14, { owner: 1, tokens: 1, isDeclined: false, encampmentCount: 2 });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'ratmen' as never,
        powerId: 'bivouacking' as never,
        maxSupply: 20,
        totalTokens: 5,
        tokensOnBoard: 1,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 4,
    });
    state = { ...state, phase: 'conquest' };
    const next = applyAction(state, { type: 'conquer', regionId: 14 });
    expect(next.board.regions.find((r) => r.id === 14)!.encampmentCount).toBe(0);
  });

  it('transitions to score after placeEncampments endPhase (no heroic)', () => {
    const state = bivouackingState();
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('score');
  });
});
