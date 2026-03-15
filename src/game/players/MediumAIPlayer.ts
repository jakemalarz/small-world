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
  // --- Dragon Master: always use dragon on highest-defense target if available
  const dragonActions = actions.filter((a) => a.type === 'placeDragon');
  if (dragonActions.length > 0 && Math.random() < 0.7) {
    // Pick the highest-defense region (best value for dragon)
    let bestDragon = dragonActions[0];
    let bestDefense = -1;
    for (const action of dragonActions) {
      if (action.type !== 'placeDragon') continue;
      let cost: number;
      try { cost = calculateConquestCost(state, action.regionId); } catch { cost = 0; }
      if (cost > bestDefense) { bestDefense = cost; bestDragon = action; }
    }
    return bestDragon;
  }

  const conquestActions = actions.filter(
    (a) => a.type === 'conquer' || a.type === 'useReinforcement' || a.type === 'ghoulUseReinforcement',
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

  // --- Decline: check BEFORE pickUpTokens so AI doesn't skip decline ------
  const declineAction = actions.find((a) => a.type === 'decline');
  if (declineAction && _shouldDecline(state)) {
    return declineAction;
  }

  // --- pickUpTokens: gather excess tokens, leaving 1 to avoid re-conquest ---
  const pickUpActions = actions.filter((a) =>
    (a.type === 'pickUpTokens' || a.type === 'ghoulPickUpTokens') && a.count > 1,
  );
  if (pickUpActions.length > 0 && Math.random() < 0.4) {
    return _cheapestPickUp(state, pickUpActions);
  }

  // --- placeHeroes: pick the first valid pair --------------------------------
  const heroAction = actions.find((a) => a.type === 'placeHeroes');
  if (heroAction) return heroAction;

  // --- placeFortress: pick first valid region --------------------------------
  const fortressAction = actions.find((a) => a.type === 'placeFortress');
  if (fortressAction) return fortressAction;

  // --- Final conquest: always attempt if available ----------------------------
  const finalConquest = actions.find((a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest');
  if (finalConquest) {
    return finalConquest;
  }

  // --- Fallback: random from remaining (includes endPhase) -------------------
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
    else if (action.type === 'ghoulUseReinforcement') regionId = action.regionId;
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
 * Evaluates how many effective tokens the race has for conquest (in hand +
 * gatherable excess from owned regions). If too few to make meaningful
 * conquests, and a decent combo is available, decline.
 */
function _shouldDecline(state: GameState): boolean {
  const player = state.players[state.activePlayerIndex];
  const active = player.activeRace;

  if (!active) return true; // no active race — decline is clearly better

  // Never decline on last turn — no time to benefit from a new race
  if (state.turn >= 10) return false;

  // Count effective available tokens: in hand + excess on board
  const ownedRegions = state.board.regions.filter(
    (r) => r.owner === state.activePlayerIndex && !r.isDeclined,
  );
  let gatherable = 0;
  for (const r of ownedRegions) {
    gatherable += Math.max(0, r.tokens - 1);
  }
  const effectiveAvailable = player.availableTokens + gatherable;

  // Check if a decent combo is available in the shop
  const bestComboTokens = Math.max(
    ...state.comboShop.visible.map((slot) => _comboScore(slot.raceId, slot.powerId)),
  );

  // Race is spent — can barely conquer anything
  if (effectiveAvailable < 4) return true;

  // Race is running low — decline if a better combo is available
  if (effectiveAvailable < 6 && bestComboTokens >= 6) return true;

  // Race has some gas but a much better combo exists
  if (effectiveAvailable < 8 && bestComboTokens > effectiveAvailable + 3) {
    return Math.random() < 0.5;
  }

  // Small random chance for productive races
  return Math.random() < 0.1;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

/**
 * Pick up excess tokens (leaving 1) from the cheapest-to-conquer region,
 * so the AI gathers from places it can easily retake if lost.
 */
function _cheapestPickUp(state: GameState, pickUpActions: readonly GameAction[]): GameAction {
  let bestAction = pickUpActions[0];
  let bestCost = Infinity;

  for (const action of pickUpActions) {
    let regionId: number | undefined;
    if (action.type === 'pickUpTokens') regionId = action.regionId;
    else if (action.type === 'ghoulPickUpTokens') regionId = action.regionId;
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

  // Leave 1 token — pick up count - 1
  return { ...bestAction, count: (bestAction as { count: number }).count - 1 } as GameAction;
}

function _randomFrom<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
