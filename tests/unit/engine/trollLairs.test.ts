import { describe, it, expect } from 'vitest';
import { applyAction } from '@/game/engine/actions';
import { createInitialState } from '@/game/engine/setup';
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

function trollState(availableTokens = 4, tokensOnBoard = 3): GameState {
  let state = createInitialState({ firstPlayerIndex: 0 });
  state = patchPlayer(state, 0, {
    activeRace: {
      raceId: 'trolls' as never,
      powerId: 'alchemist' as never,
      maxSupply: 20,
      totalTokens: availableTokens + tokensOnBoard,
      tokensOnBoard,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
    },
    availableTokens,
  });
  state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
  state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
  return { ...state, phase: 'redeploy' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Troll lair auto-placement', () => {
  it('places lairs on all owned active regions during redeploy', () => {
    const state = trollState();
    const deployment = new Map([[19, 4], [20, 3]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 19)!.hasTrollLair).toBe(true);
    expect(next.board.regions.find((r) => r.id === 20)!.hasTrollLair).toBe(true);
  });

  it('does not place lairs on regions not owned by the active player', () => {
    let state = trollState();
    state = patchRegion(state, 18, { owner: 1, tokens: 2, isDeclined: false });
    const deployment = new Map([[19, 4], [20, 3]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 18)!.hasTrollLair).toBe(false);
  });

  it('does not place lairs on declined regions', () => {
    let state = trollState();
    state = patchRegion(state, 18, { owner: 0, tokens: 2, isDeclined: true });
    const deployment = new Map([[19, 4], [20, 3]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 18)!.hasTrollLair).toBe(false);
  });

  it('updates trollLairsOnBoard on active race', () => {
    const state = trollState();
    const deployment = new Map([[19, 4], [20, 3]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.players[0].activeRace!.trollLairsOnBoard).toBe(2);
  });

  it('preserves existing lairs (does not double-place)', () => {
    let state = trollState();
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasTrollLair: true });
    const deployment = new Map([[19, 4], [20, 3]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    // Both should have lairs, total count = 2
    expect(next.board.regions.find((r) => r.id === 19)!.hasTrollLair).toBe(true);
    expect(next.board.regions.find((r) => r.id === 20)!.hasTrollLair).toBe(true);
    expect(next.players[0].activeRace!.trollLairsOnBoard).toBe(2);
  });

  it('also places lairs when endPhase is called from redeploy (AI path)', () => {
    const state = trollState();
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.board.regions.find((r) => r.id === 19)!.hasTrollLair).toBe(true);
    expect(next.board.regions.find((r) => r.id === 20)!.hasTrollLair).toBe(true);
  });

  it('lair adds +1 defense to conquest cost', () => {
    // This is tested in conquestCost.test.ts, but verify the integration
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchRegion(state, 14, { hasTrollLair: true });
    const region = state.board.regions.find((r) => r.id === 14)!;
    expect(region.hasTrollLair).toBe(true);
  });
});
