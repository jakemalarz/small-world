import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/game/engine/setup';
import { getLegalActions } from '@/game/engine/legalActions';
import { applyAction } from '@/game/engine/actions';
import { rollReinforcementDie } from '@/game/engine/reinforcementDie';
import type { GameState } from '@/game/state/types';

// ── Headless game loop (no Phaser) ────────────────────────────────────────────
//
// Simulates a complete game by randomly picking from getLegalActions() each
// turn. Verifies the state machine terminates correctly in 10 turns.

function pickRandom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Run one complete game to conclusion.
 * Returns the final state (phase === 'gameOver').
 */
function runGame(firstPlayerIndex: 0 | 1 = 0): GameState {
  let state = createInitialState({ firstPlayerIndex });
  let iterations = 0;
  const MAX_ITER = 10_000; // safety guard — game must end within this many actions

  while (state.phase !== 'gameOver') {
    if (++iterations > MAX_ITER) {
      throw new Error(
        `Game did not terminate after ${MAX_ITER} iterations. ` +
        `Phase: ${state.phase}, Turn: ${state.turn}`,
      );
    }

    // Inject die result before getLegalActions reads it
    if (state.phase === 'reinforcementDie' && !state.reinforcementDie) {
      state = {
        ...state,
        reinforcementDie: { result: rollReinforcementDie(), targetRegionId: null },
      };
    }

    const legal = getLegalActions(state);
    expect(legal.length).toBeGreaterThan(0); // there must always be a legal action

    const action = pickRandom(legal);
    state = applyAction(state, action);
  }

  return state;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Full game loop (headless, random legal actions)', () => {
  it('game terminates in gameOver phase', () => {
    const final = runGame(0);
    expect(final.phase).toBe('gameOver');
  });

  it('final turn is 10', () => {
    const final = runGame(0);
    expect(final.turn).toBe(10);
  });

  it('both players have non-negative coins', () => {
    const final = runGame(0);
    expect(final.players[0].coins).toBeGreaterThanOrEqual(0);
    expect(final.players[1].coins).toBeGreaterThanOrEqual(0);
  });

  it('log has entries (actions were taken)', () => {
    const final = runGame(0);
    expect(final.log.length).toBeGreaterThan(0);
  });

  it('state is always immutable (snapshot matches after action)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    const snapshot = JSON.stringify(state);

    // Inject die if needed for first legal call
    if (state.phase === 'reinforcementDie' && !state.reinforcementDie) {
      state = { ...state, reinforcementDie: { result: 0, targetRegionId: null } };
    }

    const legal = getLegalActions(state);
    applyAction(state, legal[0]);
    // Original state must be unchanged
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('completes 5 independent games without error', () => {
    for (let i = 0; i < 5; i++) {
      const firstPlayer = (i % 2) as 0 | 1;
      const final = runGame(firstPlayer);
      expect(final.phase).toBe('gameOver');
    }
  });

  it('legal actions list is never empty during any phase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    let iterations = 0;

    while (state.phase !== 'gameOver' && iterations < 5000) {
      iterations++;
      if (state.phase === 'reinforcementDie' && !state.reinforcementDie) {
        state = { ...state, reinforcementDie: { result: rollReinforcementDie(), targetRegionId: null } };
      }
      const legal = getLegalActions(state);
      expect(legal.length, `Empty legal actions in phase: ${state.phase}`).toBeGreaterThan(0);
      state = applyAction(state, pickRandom(legal));
    }
  });
});
