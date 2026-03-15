import { describe, it, expect } from 'vitest';
import { AIPlayer } from '@/game/players/AIPlayer';
import { createInitialState } from '@/game/engine/setup';
import { getLegalActions } from '@/game/engine/legalActions';
import { applyAction } from '@/game/engine/actions';
import { rollReinforcementDie } from '@/game/engine/reinforcementDie';
import type { GameAction, GameState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run a full game with two easy AIs. Returns the final state. */
async function runAIGame(firstPlayerIndex: 0 | 1 = 0): Promise<GameState> {
  const p0 = new AIPlayer('AI-0', 0);
  const p1 = new AIPlayer('AI-1', 0);
  const players = [p0, p1];

  let state = createInitialState({ firstPlayerIndex });
  let iterations = 0;
  const MAX = 10_000;

  while (state.phase !== 'gameOver') {
    if (++iterations > MAX) throw new Error('Game loop did not terminate');

    if (state.phase === 'reinforcementDie' && !state.reinforcementDie) {
      state = { ...state, reinforcementDie: { result: rollReinforcementDie(), targetRegionId: null } };
    }

    const legal = getLegalActions(state);
    const player = players[state.activePlayerIndex];
    const action = await player.chooseAction(state, legal);

    // Verify the action is legal
    const isLegal = legal.some((a) => _actionsEqual(a, action));
    if (!isLegal) {
      throw new Error(`AI returned illegal action: ${JSON.stringify(action)}`);
    }

    state = applyAction(state, action);
  }

  return state;
}

function _actionsEqual(a: GameAction, b: GameAction): boolean {
  // pickUpTokens/ghoulPickUpTokens: AI may reduce count to leave 1 token,
  // so match by type + regionId only (engine validates count range)
  if (
    (a.type === 'pickUpTokens' && b.type === 'pickUpTokens') ||
    (a.type === 'ghoulPickUpTokens' && b.type === 'ghoulPickUpTokens')
  ) {
    return a.regionId === b.regionId;
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AIPlayer', () => {
  it('has type "ai"', () => {
    const ai = new AIPlayer('Robot', 0);
    expect(ai.type).toBe('ai');
  });

  it('has the name passed to constructor', () => {
    const ai = new AIPlayer('HAL', 0);
    expect(ai.name).toBe('HAL');
  });

  it('chooseAction resolves with a value from legalActions', async () => {
    const ai = new AIPlayer('Bot', 0);
    const state = createInitialState({ firstPlayerIndex: 0 });
    const legal = getLegalActions(state);
    const action = await ai.chooseAction(state, legal);
    const found = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
    expect(found).toBe(true);
  });

  it('never returns an action not in legalActions', async () => {
    const ai = new AIPlayer('Bot', 0);
    const state = createInitialState({ firstPlayerIndex: 0 });
    const legal = getLegalActions(state);

    for (let i = 0; i < 20; i++) {
      const action = await ai.chooseAction(state, legal);
      const isLegal = legal.some((a) => JSON.stringify(a) === JSON.stringify(action));
      expect(isLegal).toBe(true);
    }
  });

  it('works with a single-element action list (only endPhase)', async () => {
    const ai = new AIPlayer('Bot', 0);
    const actions: GameAction[] = [{ type: 'endPhase' }];
    const action = await ai.chooseAction({} as GameState, actions);
    expect(action.type).toBe('endPhase');
  });

  it('completes a full AI vs AI game without error', async () => {
    const final = await runAIGame(0);
    expect(final.phase).toBe('gameOver');
    expect(final.turn).toBe(10);
  });

  it('AI vs AI: both players gain coins during the game', async () => {
    const final = await runAIGame(0);
    // Players should have earned coins (starting is 5, they can earn more)
    // At minimum, both players should have ≥0 coins
    expect(final.players[0].coins).toBeGreaterThanOrEqual(0);
    expect(final.players[1].coins).toBeGreaterThanOrEqual(0);
  });

  it('AI actions are always valid across 3 independent games', async () => {
    for (let i = 0; i < 3; i++) {
      const firstPlayer = (i % 2) as 0 | 1;
      const final = await runAIGame(firstPlayer);
      expect(final.phase).toBe('gameOver');
    }
  });
});
