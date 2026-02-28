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

/** State with an active race, some owned regions, and tokens to redeploy. */
function redeployState(availableTokens = 4, tokensOnBoard = 3): GameState {
  let state = createInitialState({ firstPlayerIndex: 0 });

  state = patchPlayer(state, 0, {
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

  // Two owned regions: 19 (2 tokens), 20 (1 token)
  state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
  state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });

  return { ...state, phase: 'redeploy' };
}

// ── redeploy ──────────────────────────────────────────────────────────────────

describe('redeployment phase', () => {
  it('distributes tokens according to the deployment map', () => {
    const state = redeployState();
    const deployment = new Map([[19, 3], [20, 4]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 19)!.tokens).toBe(3);
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBe(4);
  });

  it('defaults unspecified regions to at least 1 token', () => {
    const state = redeployState();
    // Only specify region 19; region 20 should get at least 1
    const deployment = new Map([[19, 6]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBeGreaterThanOrEqual(1);
  });

  it('enforces minimum of 1 token per occupied region', () => {
    const state = redeployState();
    const deployment = new Map([[19, 7], [20, 0]]); // 0 on region 20 → should become 1
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBeGreaterThanOrEqual(1);
  });

  it('stays in redeploy phase after deployment (endPhase commits)', () => {
    // Submitting a redeploy action does not advance phase — player can adjust
    // deployment multiple times before committing with endPhase.
    const state = redeployState();
    const deployment = new Map([[19, 2], [20, 1]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.phase).toBe('redeploy');
  });

  it('transitions to placeEncampments when Bivouacking, or score otherwise', () => {
    // Bivouacking power → placeEncampments
    const state = redeployState();
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('placeEncampments');
  });

  it('updates tokensOnBoard on active race', () => {
    const state = redeployState();
    const deployment = new Map([[19, 3], [20, 4]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.players[0].activeRace!.tokensOnBoard).toBe(7);
  });

  it('does not affect declined regions during redeployment', () => {
    let state = redeployState();
    // Add a declined region to the mix
    state = patchRegion(state, 18, { owner: 0, tokens: 2, isDeclined: true });
    const deployment = new Map([[19, 4], [20, 3]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    // Declined region should not be touched
    expect(next.board.regions.find((r) => r.id === 18)!.tokens).toBe(2);
  });

  it('original state is not mutated', () => {
    const state = redeployState();
    const snapshot = JSON.stringify(state);
    const deployment = new Map([[19, 3], [20, 4]]);
    applyAction(state, { type: 'redeploy', deployment });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('appends a log entry', () => {
    const state = redeployState();
    const deployment = new Map([[19, 3], [20, 4]]);
    const next = applyAction(state, { type: 'redeploy', deployment });
    expect(next.log).toHaveLength(1);
    expect(next.log[0].action.type).toBe('redeploy');
  });
});
