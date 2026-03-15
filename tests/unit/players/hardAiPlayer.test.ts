import { describe, it, expect } from 'vitest';
import {
  HardAIPlayer,
  evaluateCombo,
  evaluateRegionForConquest,
  shouldDecline,
  computeRedeployment,
} from '@/game/players/HardAIPlayer';
import { createInitialState } from '@/game/engine/setup';
import { getLegalActions } from '@/game/engine/legalActions';
import { applyAction } from '@/game/engine/actions';
import { rollReinforcementDie } from '@/game/engine/reinforcementDie';
import type { GameAction, GameState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Run a full game with two hard AIs. Returns the final state. */
async function runHardAIGame(firstPlayerIndex: 0 | 1 = 0): Promise<GameState> {
  const p0 = new HardAIPlayer('Hard-0', 0);
  const p1 = new HardAIPlayer('Hard-1', 0);
  const players = [p0, p1];

  let state = createInitialState({ firstPlayerIndex });
  let iterations = 0;
  const MAX = 10_000;

  while (state.phase !== 'gameOver') {
    if (++iterations > MAX) throw new Error('Game loop did not terminate');

    // Inject die state for both regular and ghoul reinforcement phases
    if ((state.phase === 'reinforcementDie' || state.phase === 'ghoulReinforcementDie') && !state.reinforcementDie) {
      state = { ...state, reinforcementDie: { result: rollReinforcementDie(), targetRegionId: null } };
    }

    const legal = getLegalActions(state);
    const player = players[state.activePlayerIndex];
    const action = await player.chooseAction(state, legal);

    // For actions with deployment Maps, validate by type match instead of JSON
    const isLegal = legal.some((a) => _actionsMatch(a, action));
    if (!isLegal) {
      throw new Error(
        `HardAI returned illegal action type=${action.type} in phase=${state.phase}, ` +
        `legal types: [${legal.map((a) => a.type).join(', ')}]`
      );
    }

    state = applyAction(state, action);
  }

  return state;
}

/**
 * Match actions: for Map-based actions (deploy/redeploy/encampments),
 * match by type only since the AI constructs custom Maps.
 * For all other actions, use JSON equality.
 */
function _actionsMatch(legal: GameAction, chosen: GameAction): boolean {
  // Map-based actions: match by type only
  if (
    chosen.type === 'readyTroopsDeploy' ||
    chosen.type === 'ghoulReadyTroopsDeploy' ||
    chosen.type === 'redeploy' ||
    chosen.type === 'ghoulRedeploy' ||
    chosen.type === 'placeEncampments'
  ) {
    return legal.type === chosen.type;
  }
  // pickUpTokens: AI may reduce count to leave 1 token — match by regionId only
  if (
    (chosen.type === 'pickUpTokens' && legal.type === 'pickUpTokens') ||
    (chosen.type === 'ghoulPickUpTokens' && legal.type === 'ghoulPickUpTokens')
  ) {
    return (legal as { regionId: number }).regionId === (chosen as { regionId: number }).regionId;
  }
  return JSON.stringify(legal) === JSON.stringify(chosen);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('HardAIPlayer', () => {
  it('has type "ai"', () => {
    const ai = new HardAIPlayer('Robot', 0);
    expect(ai.type).toBe('ai');
  });

  it('has the name passed to constructor', () => {
    const ai = new HardAIPlayer('HAL-9000', 0);
    expect(ai.name).toBe('HAL-9000');
  });

  it('chooseAction always returns a legal action', async () => {
    const ai = new HardAIPlayer('Bot', 0);
    const state = createInitialState({ firstPlayerIndex: 0 });
    const legal = getLegalActions(state);

    for (let i = 0; i < 20; i++) {
      const action = await ai.chooseAction(state, legal);
      const isLegal = legal.some((a) => _actionsMatch(a, action));
      expect(isLegal).toBe(true);
    }
  });

  it('completes a full Hard vs Hard game without error', async () => {
    const final = await runHardAIGame(0);
    expect(final.phase).toBe('gameOver');
    expect(final.turn).toBe(10);
  });

  it('both players end with non-negative coins', async () => {
    const final = await runHardAIGame(0);
    expect(final.players[0].coins).toBeGreaterThanOrEqual(0);
    expect(final.players[1].coins).toBeGreaterThanOrEqual(0);
  });

  it('Hard AI actions are always valid across 3 independent games', async () => {
    for (let i = 0; i < 3; i++) {
      const firstPlayer = (i % 2) as 0 | 1;
      const final = await runHardAIGame(firstPlayer);
      expect(final.phase).toBe('gameOver');
    }
  });
});

describe('evaluateCombo', () => {
  it('scores higher token count combos higher when no synergy differences', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    // Ratmen (8 base) vs Elves (6 base) with same neutral power
    // Both have minimal synergy bonuses, so token count difference should dominate
    const scoreRatmen = evaluateCombo(state, 'ratmen', 'flying', 0, 0);
    const scoreElves = evaluateCombo(state, 'elves', 'flying', 0, 0);
    expect(scoreRatmen).toBeGreaterThan(scoreElves);
  });

  it('scores Wealthy higher in early turns than late turns', () => {
    const earlyState = createInitialState({ firstPlayerIndex: 0 });
    const lateState = { ...earlyState, turn: 9 };
    const earlyScore = evaluateCombo(earlyState, 'ratmen', 'wealthy', 0, 0);
    const lateScore = evaluateCombo(lateState, 'ratmen', 'wealthy', 0, 0);
    expect(earlyScore).toBeGreaterThan(lateScore);
  });

  it('penalizes higher combo indices (slot cost)', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const score0 = evaluateCombo(state, 'ratmen', 'alchemist', 0, 0);
    const score3 = evaluateCombo(state, 'ratmen', 'alchemist', 3, 0);
    expect(score0).toBeGreaterThan(score3);
  });
});

describe('evaluateRegionForConquest', () => {
  it('values all conquerable regions positively', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const regionWithTribe = state.board.regions.find((r) => r.hasLostTribe);
    const emptyRegion = state.board.regions.find(
      (r) => !r.hasLostTribe && r.terrain !== 'sea' && r.terrain !== 'lake' && r.owner === null,
    );
    if (regionWithTribe && emptyRegion) {
      const v1 = evaluateRegionForConquest(state, regionWithTribe.id, 0);
      const v2 = evaluateRegionForConquest(state, emptyRegion.id, 0);
      expect(v1).toBeGreaterThanOrEqual(1.0);
      expect(v2).toBeGreaterThanOrEqual(1.0);
    }
  });

  it('values mountains higher for defensibility', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const mountain = state.board.regions.find((r) => r.terrain === 'mountain');
    const nonMountain = state.board.regions.find(
      (r) => r.terrain !== 'mountain' && r.terrain !== 'sea' && r.terrain !== 'lake',
    );
    if (mountain && nonMountain) {
      const vMountain = evaluateRegionForConquest(state, mountain.id, 0);
      const vOther = evaluateRegionForConquest(state, nonMountain.id, 0);
      expect(vMountain).toBeGreaterThan(vOther);
    }
  });
});

describe('shouldDecline', () => {
  it('returns false on turn 10', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const lateState = { ...state, turn: 10 };
    expect(shouldDecline(lateState, 0)).toBe(false);
  });

  it('returns true when player has no active race on a non-final turn', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    // Turn 1, no active race → should decline (pick a new combo)
    const noRaceState = {
      ...state,
      turn: 5,
      players: [
        { ...state.players[0], activeRace: null },
        state.players[1],
      ] as typeof state.players,
    };
    expect(shouldDecline(noRaceState, 0)).toBe(true);
  });
});

describe('computeRedeployment', () => {
  it('returns a Map', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const lateState = { ...state, turn: 10 };
    const deployment = computeRedeployment(lateState, 0);
    expect(deployment).toBeInstanceOf(Map);
  });

  it('assigns at least 1 token to every region', async () => {
    const p0 = new HardAIPlayer('H0', 0);
    const p1 = new HardAIPlayer('H1', 0);
    const players = [p0, p1];
    let state = createInitialState({ firstPlayerIndex: 0 });
    let iterations = 0;

    // Play until we reach a redeploy phase
    while (state.phase !== 'redeploy' && state.phase !== 'gameOver' && iterations < 500) {
      iterations++;
      if ((state.phase === 'reinforcementDie' || state.phase === 'ghoulReinforcementDie') && !state.reinforcementDie) {
        state = { ...state, reinforcementDie: { result: rollReinforcementDie(), targetRegionId: null } };
      }
      const legal = getLegalActions(state);
      const player = players[state.activePlayerIndex];
      const action = await player.chooseAction(state, legal);
      state = applyAction(state, action);
    }

    if (state.phase === 'redeploy') {
      const deployment = computeRedeployment(state, state.activePlayerIndex);
      for (const count of deployment.values()) {
        expect(count).toBeGreaterThanOrEqual(1);
      }
    }
  });
});
