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

/**
 * Choose one action from the legal list.
 *
 * Priority (highest → lowest):
 *   1. Conquest/reinforcement actions (attack empty regions first)
 *   2. selectCombo (pick the cheapest available)
 *   3. decline  (only if explicitly listed as legal)
 *   4. endPhase / any other action (random pick)
 */
function _pickAction(state: GameState, actions: readonly GameAction[]): GameAction {
  // --- Conquest targets: prefer empty regions (lower cost = empty) ----------
  const conquestActions = actions.filter(
    (a) => a.type === 'conquer' || a.type === 'useReinforcement' || a.type === 'ghoulUseReinforcement' ||
           a.type === 'placeDragon',
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

  // --- Redeploy: placeholder redeploy has empty Map — skip it.
  // AI always commits redeployment by picking endPhase (accepts default layout).
  // (Real UI-submitted redeploy actions have non-empty Maps and are validated.)

  // --- Ghoul conquest -------------------------------------------------------
  const ghoulActions = actions.filter((a) => a.type === 'ghoulConquer');
  if (ghoulActions.length > 0 && Math.random() < 0.7) {
    return _randomFrom(ghoulActions);
  }

  // --- Decline: check BEFORE pickUpTokens so AI doesn't skip decline ------
  const declineAction = actions.find((a) => a.type === 'decline');
  if (declineAction && _shouldDecline(state)) {
    return declineAction;
  }

  // --- pickUpTokens during readyTroops: sometimes pick up excess tokens -----
  // Leave 1 token on each region to avoid abandoning and having to re-conquer
  const pickUpActions = actions.filter((a) =>
    (a.type === 'pickUpTokens' || a.type === 'ghoulPickUpTokens') && a.count > 1,
  );
  if (pickUpActions.length > 0 && Math.random() < 0.4) {
    const action = _randomFrom(pickUpActions);
    return { ...action, count: action.count - 1 } as GameAction;
  }

  // --- placeHeroes: pick the first valid pair --------------------------------
  const heroAction = actions.find((a) => a.type === 'placeHeroes');
  if (heroAction) return heroAction;

  // --- placeFortress: pick first valid region --------------------------------
  const fortressAction = actions.find((a) => a.type === 'placeFortress');
  if (fortressAction) return fortressAction;

  // --- Final conquest: 50% chance to attempt if available --------------------
  const finalConquest = actions.find((a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest');
  if (finalConquest && Math.random() < 0.5) {
    return finalConquest;
  }

  // --- Fallback: random from remaining actions (includes endPhase) ----------
  // Filter out human-only interactive placeholders
  const fallback = actions.filter((a) =>
    a.type !== 'readyTroopsDeploy' &&
    a.type !== 'ghoulReadyTroopsDeploy' &&
    a.type !== 'ghoulRedeploy' &&
    a.type !== 'redeploy' &&
    a.type !== 'placeEncampments',
  );
  return _randomFrom(fallback);
}

/**
 * Decline when the race can't make meaningful conquests.
 * Estimates how many tokens are available (in hand + gatherable excess from
 * regions). If too few to conquer anything, it's time for a new race.
 */
function _shouldDecline(state: GameState): boolean {
  const player = state.players[state.activePlayerIndex];
  const active = player.activeRace;
  if (!active) return true;

  // Never decline on last turn — no time to benefit from a new race
  if (state.turn >= 10) return false;

  // Count effective available tokens: in hand + excess on board (tokens - 1 per region)
  const ownedRegions = state.board.regions.filter(
    (r) => r.owner === state.activePlayerIndex && !r.isDeclined,
  );
  let gatherable = 0;
  for (const r of ownedRegions) {
    gatherable += Math.max(0, r.tokens - 1);
  }
  const effectiveAvailable = player.availableTokens + gatherable;

  // If the race can barely conquer (need ≥ 2 for an empty region), decline
  if (effectiveAvailable < 4) return true;

  // If running low, decline with some probability
  if (effectiveAvailable < 6) return Math.random() < 0.4;

  // Otherwise small random chance
  return Math.random() < 0.1;
}

function _randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
