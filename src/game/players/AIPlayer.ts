import type { GameState, GameAction } from '@/game/state/types';
import type { IPlayer } from '@/game/players/IPlayer';

// ── AIPlayer ──────────────────────────────────────────────────────────────────
//
// Easy difficulty: picks randomly from the legal action list with a slight
// bias toward conquest actions over endPhase (so the AI plays aggressively).
//
// Between actions there is a configurable delay to pace visual playback.
// Pass delayMs = 0 for instant (useful in tests and AI-vs-AI fast mode).

export class AIPlayer implements IPlayer {
  readonly type = 'ai' as const;
  readonly name: string;
  private readonly delayMs: number;

  constructor(name: string, delayMs = 600) {
    this.name = name;
    this.delayMs = delayMs;
  }

  async chooseAction(
    _state: GameState,
    legalActions: readonly GameAction[],
  ): Promise<GameAction> {
    if (this.delayMs > 0) {
      await _sleep(this.delayMs);
    }

    return _pickAction(legalActions);
  }
}

// ── Action selection heuristics ────────────────────────────────────────────────

/**
 * Choose one action from the legal list.
 *
 * Priority (highest → lowest):
 *   1. Conquest/reinforcement actions (attack empty regions first)
 *   2. selectCombo (pick the cheapest available)
 *   3. decline  (only if explicitly listed as legal)
 *   4. endPhase / any other action (random pick)
 */
function _pickAction(actions: readonly GameAction[]): GameAction {
  // --- Conquest targets: prefer empty regions (lower cost = empty) ----------
  const conquestActions = actions.filter(
    (a) => a.type === 'conquer' || a.type === 'useReinforcement',
  );
  if (conquestActions.length > 0) {
    // 80% chance to conquer rather than endPhase (keeps AI aggressive)
    if (Math.random() < 0.8) {
      return _randomFrom(conquestActions);
    }
  }

  // --- Combo selection: pick index 0 (cheapest) when possible ---------------
  const comboAction = actions.find((a) => a.type === 'selectCombo');
  if (comboAction) {
    // Prefer the first (cheapest) combo 70% of the time
    if (Math.random() < 0.7) return comboAction;
    const combos = actions.filter((a) => a.type === 'selectCombo');
    return _randomFrom(combos);
  }

  // --- Redeploy: pick a random deployment from legal list -------------------
  const redeployAction = actions.find((a) => a.type === 'redeploy');
  if (redeployAction) return redeployAction;

  // --- Ghoul conquest -------------------------------------------------------
  const ghoulActions = actions.filter((a) => a.type === 'ghoulConquer');
  if (ghoulActions.length > 0 && Math.random() < 0.7) {
    return _randomFrom(ghoulActions);
  }

  // --- pickUpTokens during readyTroops: sometimes pick up tokens to attack --
  const pickUpActions = actions.filter((a) => a.type === 'pickUpTokens');
  if (pickUpActions.length > 0 && Math.random() < 0.4) {
    return _randomFrom(pickUpActions);
  }

  // --- Decline: only 15% chance per turn if it's offered -------------------
  const declineAction = actions.find((a) => a.type === 'decline');
  if (declineAction && Math.random() < 0.15) {
    return declineAction;
  }

  // --- Fallback: random from remaining actions (includes endPhase) ----------
  return _randomFrom(actions);
}

function _randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
