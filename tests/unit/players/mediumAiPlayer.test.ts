import { describe, it, expect } from 'vitest';
import { MediumAIPlayer } from '@/game/players/MediumAIPlayer';
import { createInitialState } from '@/game/engine/setup';
import { getLegalActions } from '@/game/engine/legalActions';
import { applyAction } from '@/game/engine/actions';
import { rollReinforcementDie } from '@/game/engine/reinforcementDie';
import type { GameAction, GameState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run a full game with two medium AIs. Returns the final state. */
async function runMediumAIGame(firstPlayerIndex: 0 | 1 = 0): Promise<GameState> {
  const p0 = new MediumAIPlayer('Medium-0', 0);
  const p1 = new MediumAIPlayer('Medium-1', 0);
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
      throw new Error(`MediumAI returned illegal action: ${JSON.stringify(action)}`);
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

describe('MediumAIPlayer', () => {
  it('has type "ai"', () => {
    const ai = new MediumAIPlayer('Robot', 0);
    expect(ai.type).toBe('ai');
  });

  it('has the name passed to constructor', () => {
    const ai = new MediumAIPlayer('HAL-9000', 0);
    expect(ai.name).toBe('HAL-9000');
  });

  it('chooseAction always returns a legal action', async () => {
    const ai = new MediumAIPlayer('Bot', 0);
    const state = createInitialState({ firstPlayerIndex: 0 });
    const legal = getLegalActions(state);

    for (let i = 0; i < 20; i++) {
      const action = await ai.chooseAction(state, legal);
      const isLegal = legal.some((a) => _actionsEqual(a, action));
      expect(isLegal).toBe(true);
    }
  });

  it('completes a full AI vs AI (medium vs medium) game without error', async () => {
    const final = await runMediumAIGame(0);
    expect(final.phase).toBe('gameOver');
    expect(final.turn).toBe(10);
  });

  it('medium AI vs medium AI: both players end with non-negative coins', async () => {
    const final = await runMediumAIGame(0);
    expect(final.players[0].coins).toBeGreaterThanOrEqual(0);
    expect(final.players[1].coins).toBeGreaterThanOrEqual(0);
  });

  it('prefers combo with more tokens when affordable (mock state test)', async () => {
    // Run multiple trials — the medium AI should consistently pick the higher
    // token combo when both are affordable. We check it picks the best combo
    // at least 80% of the time across many trials on the initial state.
    const ai = new MediumAIPlayer('Bot', 0);

    // Build a fixed initial state and manually inspect which combo has more tokens
    const state = createInitialState({ firstPlayerIndex: 0 });
    const legal = getLegalActions(state); // only selectCombo actions at turn start
    const comboActions = legal.filter((a) => a.type === 'selectCombo');

    // Only test if there are at least 2 affordable combos to compare
    if (comboActions.length < 2) return;

    // Compute the expected best combo index (highest token count)
    const { RACES } = await import('@/game/data/races');
    const { POWERS } = await import('@/game/data/powers');
    const { visible } = state.comboShop;

    let bestScore = -1;
    let bestIndex = -1;
    for (const action of comboActions) {
      if (action.type !== 'selectCombo') continue;
      const slot = visible[action.comboIndex];
      if (!slot) continue;
      const race = RACES[slot.raceId];
      const power = POWERS[slot.powerId];
      const score = (race?.baseTokens ?? 0) + (power?.bonusTokens ?? 0);
      if (score > bestScore) {
        bestScore = score;
        bestIndex = action.comboIndex;
      }
    }

    // Run 30 trials and count how often the medium AI picks the highest-token combo
    let bestPickCount = 0;
    const TRIALS = 30;
    for (let i = 0; i < TRIALS; i++) {
      const action = await ai.chooseAction(state, legal);
      if (action.type === 'selectCombo' && action.comboIndex === bestIndex) {
        bestPickCount++;
      }
    }

    // Medium AI should pick the best combo the majority of the time
    expect(bestPickCount).toBeGreaterThanOrEqual(TRIALS * 0.8);
  });

  it('medium AI actions are always valid across 3 independent games', async () => {
    for (let i = 0; i < 3; i++) {
      const firstPlayer = (i % 2) as 0 | 1;
      const final = await runMediumAIGame(firstPlayer);
      expect(final.phase).toBe('gameOver');
    }
  });
});
