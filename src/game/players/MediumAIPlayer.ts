import type { GameState, GameAction } from '@/game/state/types';
import type { IPlayer } from '@/game/players/IPlayer';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';

// ── MediumAIPlayer ────────────────────────────────────────────────────────────
//
// Medium difficulty: uses simple heuristics to make better decisions than the
// easy AI. Key improvements over AIPlayer:
//   - Combo selection: picks highest (baseTokens + bonusTokens) affordable combo
//   - Conquest targeting: prefers cheaper targets (lower conquest cost)
//   - Decline: declines when active race is unproductive (0 conquests) and a
//     better combo is available; otherwise skips with 25% chance
//   - Redeploy / pickUpTokens: same as easy AI

export class MediumAIPlayer implements IPlayer {
  readonly type = 'ai' as const;
  readonly name: string;
  private readonly delayMs: number;

  constructor(name: string, delayMs = 400) {
    this.name = name;
    this.delayMs = delayMs;
  }

  async chooseAction(
    state: GameState,
    legalActions: readonly GameAction[],
  ): Promise<GameAction> {
    if (this.delayMs > 0) {
      await _sleep(this.delayMs);
    }

    return _pickAction(state, legalActions);
  }
}

// ── Action selection heuristics ────────────────────────────────────────────────

function _pickAction(state: GameState, actions: readonly GameAction[]): GameAction {
  // --- Combo selection: pick highest token-count affordable combo -------------
  const comboActions = actions.filter((a) => a.type === 'selectCombo');
  if (comboActions.length > 0) {
    return _bestCombo(state, comboActions);
  }

  // --- Conquest / reinforcement: prefer lowest-cost target -------------------
  const conquestActions = actions.filter(
    (a) => a.type === 'conquer' || a.type === 'useReinforcement',
  );
  if (conquestActions.length > 0) {
    // 80% chance to conquer rather than endPhase (keeps AI aggressive)
    if (Math.random() < 0.8) {
      return _cheapestConquest(state, conquestActions);
    }
  }

  // --- Ghoul conquest: prefer cheapest target --------------------------------
  const ghoulActions = actions.filter((a) => a.type === 'ghoulConquer');
  if (ghoulActions.length > 0 && Math.random() < 0.7) {
    return _cheapestConquest(state, ghoulActions);
  }

  // --- pickUpTokens: 40% chance (same as easy AI) ----------------------------
  const pickUpActions = actions.filter((a) => a.type === 'pickUpTokens');
  if (pickUpActions.length > 0 && Math.random() < 0.4) {
    return _randomFrom(pickUpActions);
  }

  // --- Decline heuristic -----------------------------------------------------
  const declineAction = actions.find((a) => a.type === 'decline');
  if (declineAction) {
    if (_shouldDecline(state)) {
      return declineAction;
    }
  }

  // --- Final conquest: always attempt if available ----------------------------
  const finalConquest = actions.find((a) => a.type === 'startFinalConquest');
  if (finalConquest) {
    return finalConquest;
  }

  // --- Fallback: random from remaining (includes endPhase) -------------------
  return _randomFrom(actions);
}

// ── Combo scoring ─────────────────────────────────────────────────────────────

/**
 * Score a combo slot by total token count (baseTokens + bonusTokens).
 * Higher score = more tokens = more conquest potential.
 */
function _comboScore(raceId: string, powerId: string): number {
  const race = RACES[raceId as keyof typeof RACES];
  const power = POWERS[powerId as keyof typeof POWERS];
  if (!race || !power) return 0;
  return race.baseTokens + power.bonusTokens;
}

/**
 * From the available selectCombo actions, pick the one with the highest
 * (baseTokens + bonusTokens) score. Ties broken randomly.
 */
function _bestCombo(state: GameState, comboActions: readonly GameAction[]): GameAction {
  const { visible } = state.comboShop;
  let bestAction = comboActions[0];
  let bestScore = -1;

  for (const action of comboActions) {
    if (action.type !== 'selectCombo') continue;
    const slot = visible[action.comboIndex];
    if (!slot) continue;
    const score = _comboScore(slot.raceId, slot.powerId);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}

// ── Conquest targeting ────────────────────────────────────────────────────────

/**
 * Among conquest/ghoulConquer/useReinforcement actions, prefer the target
 * with the lowest conquest cost (fewer defenders = safer, cheaper conquest).
 * Ties broken randomly.
 */
function _cheapestConquest(state: GameState, actions: readonly GameAction[]): GameAction {
  let bestAction = actions[0];
  let bestCost = Infinity;

  for (const action of actions) {
    let regionId: number | undefined;
    if (action.type === 'conquer') regionId = action.regionId;
    else if (action.type === 'useReinforcement') regionId = action.regionId;
    else if (action.type === 'ghoulConquer') regionId = action.regionId;
    else continue;

    let cost: number;
    try {
      cost = calculateConquestCost(state, regionId);
    } catch {
      cost = Infinity;
    }

    if (cost < bestCost) {
      bestCost = cost;
      bestAction = action;
    }
  }

  return bestAction;
}

// ── Decline heuristic ─────────────────────────────────────────────────────────

/**
 * Decide whether to go into decline.
 *
 * Decline eagerly when:
 *   - The active race made 0 conquests this turn (unproductive), AND
 *   - There are combos in the shop with more tokens than the current race
 *
 * Otherwise decline with a 25% base chance (same as medium aggression).
 */
function _shouldDecline(state: GameState): boolean {
  const player = state.players[state.activePlayerIndex];
  const active = player.activeRace;

  if (!active) return true; // no active race — decline is clearly better

  // If the race made 0 conquests this turn it's unproductive
  if (active.conquestsThisTurn === 0) {
    const currentTokens = active.totalTokens;
    const { visible } = state.comboShop;
    const betterComboExists = visible.some((slot) => {
      const score = _comboScore(slot.raceId, slot.powerId);
      return score > currentTokens;
    });
    if (betterComboExists) return true;
  }

  // 25% chance to decline even for productive races
  return Math.random() < 0.25;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
