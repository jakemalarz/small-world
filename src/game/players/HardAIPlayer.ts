import type { GameState, GameAction, RegionState, RaceId, PowerId } from '@/game/state/types';
import type { IPlayer } from '@/game/players/IPlayer';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { calculateScore } from '@/game/engine/scoring';
import { getActiveModifiers } from '@/game/abilities/modifiers';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';

// ── HardAIPlayer ──────────────────────────────────────────────────────────────
//
// Hard difficulty: uses evaluation functions to reason about board position,
// opponent denial, decline timing, and multi-turn strategy. Key improvements
// over MediumAIPlayer:
//
//   - Combo selection: god-tier auto-select, race/power tier bonuses,
//     map synergy + income projection + opponent denial - slot cost
//   - Conquest targeting: per-region value/cost efficiency scoring with
//     zero-sum opponent denial (active > declined > lost tribe > empty)
//   - Decline: economic comparison of current vs new race projected income
//   - Redeployment: border stacking, equalized defense, new-race anticipation
//   - Game-end rush: spread-1-per-region, ignore defense on final turn
//   - Special placements: strategic fortress/encampment/hero/dragon selection

// ── Tier Tables ──────────────────────────────────────────────────────────────

const GOD_TIER_COMBOS: ReadonlyArray<{ raceId: RaceId; powerId: PowerId }> = [
  { raceId: 'amazons', powerId: 'commando' },
  { raceId: 'sorcerers', powerId: 'flying' },
  { raceId: 'skeletons', powerId: 'merchant' },
];

const RACE_TIER_BONUS: Partial<Record<RaceId, number>> = {
  amazons: 4.0, ghouls: 4.0, ratmen: 4.0, tritons: 4.0, giants: 4.0, skeletons: 4.0,
  humans: 2.0, wizards: 2.0, halflings: 2.0,
  // elves, dwarves, sorcerers: 0 (Tier 3)
};

const POWER_TIER_BONUS: Partial<Record<PowerId, number>> = {
  commando: 4.0, berserk: 4.0, pillaging: 4.0,
  merchant: 2.0, flying: 2.0, stout: 2.0,
  // wealthy: 0 (Tier 3)
};

export class HardAIPlayer implements IPlayer {
  readonly type = 'ai' as const;
  readonly name: string;
  private readonly delayMs: number;
  // Track whether we've submitted a deployment action this phase.
  // After submitting redeploy/readyTroopsDeploy/placeEncampments, we need
  // to follow up with endPhase to advance the phase state machine.
  private _deployedThisPhase = false;
  private _lastPhase: string = '';

  constructor(name: string, delayMs = 300) {
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

    // Reset deployment tracking when phase changes
    if (state.phase !== this._lastPhase) {
      this._deployedThisPhase = false;
      this._lastPhase = state.phase;
    }

    const action = _pickAction(state, legalActions, this._deployedThisPhase);

    // Track if we just submitted a deployment action
    if (
      action.type === 'readyTroopsDeploy' ||
      action.type === 'ghoulReadyTroopsDeploy' ||
      action.type === 'redeploy' ||
      action.type === 'ghoulRedeploy' ||
      action.type === 'placeEncampments'
    ) {
      this._deployedThisPhase = true;
    }

    return action;
  }
}

// ── Main dispatcher ─────────────────────────────────────────────────────────

function _pickAction(state: GameState, actions: readonly GameAction[], deployedThisPhase: boolean): GameAction {
  // If we already submitted a deployment action this phase, endPhase to advance
  if (deployedThisPhase && actions.some((a) => a.type === 'endPhase')) {
    return { type: 'endPhase' };
  }

  // --- Combo selection -------------------------------------------------------
  const comboActions = actions.filter((a) => a.type === 'selectCombo');
  if (comboActions.length > 0) {
    return _chooseCombo(state, comboActions);
  }

  // --- Sorcerer convert: always use (free conquest) --------------------------
  const sorcererActions = actions.filter((a) => a.type === 'sorcererConvert');
  if (sorcererActions.length > 0) {
    return _chooseSorcererConvert(state, sorcererActions);
  }

  // --- Dragon: use on highest-defense target ---------------------------------
  const dragonActions = actions.filter((a) => a.type === 'placeDragon');
  if (dragonActions.length > 0) {
    return _chooseDragon(state, dragonActions);
  }

  // --- Conquest / reinforcement: efficiency-based ----------------------------
  const conquestActions = actions.filter(
    (a) => a.type === 'conquer' || a.type === 'useReinforcement' || a.type === 'ghoulUseReinforcement',
  );
  if (conquestActions.length > 0) {
    return _chooseConquest(state, actions, conquestActions);
  }

  // --- Ghoul conquest --------------------------------------------------------
  const ghoulActions = actions.filter((a) => a.type === 'ghoulConquer');
  if (ghoulActions.length > 0) {
    return _chooseConquest(state, actions, ghoulActions);
  }

  // --- Decline decision: check BEFORE readyTroopsDeploy/pickUp so it's -----
  // --- actually reachable during the readyTroops phase ---------------------
  const declineAction = actions.find((a) => a.type === 'decline');
  if (declineAction && shouldDecline(state, state.activePlayerIndex)) {
    return declineAction;
  }

  // --- Ready troops: deploy map ----------------------------------------------
  const readyDeploy = actions.find(
    (a) => a.type === 'readyTroopsDeploy' || a.type === 'ghoulReadyTroopsDeploy',
  );
  if (readyDeploy) {
    return _chooseReadyTroops(state, actions);
  }

  // --- pickUpTokens during readyTroops: gather from low-value regions --------
  const pickUpActions = actions.filter((a) => a.type === 'pickUpTokens' || a.type === 'ghoulPickUpTokens');
  if (pickUpActions.length > 0) {
    return _choosePickUp(state, actions, pickUpActions);
  }

  // --- Final conquest: always attempt ----------------------------------------
  const finalConquest = actions.find(
    (a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest',
  );
  if (finalConquest) {
    return finalConquest;
  }

  // --- Place heroes: most threatened regions ---------------------------------
  const heroActions = actions.filter((a) => a.type === 'placeHeroes');
  if (heroActions.length > 0) {
    return _chooseHeroes(state, heroActions);
  }

  // --- Place fortress: highest priority region -------------------------------
  const fortressActions = actions.filter((a) => a.type === 'placeFortress');
  if (fortressActions.length > 0) {
    return _chooseFortress(state, fortressActions);
  }

  // --- Place encampments: submit deployment (endPhase handled above) ---------
  const encampmentActions = actions.filter((a) => a.type === 'placeEncampments');
  if (encampmentActions.length > 0) {
    return _chooseEncampments(state, encampmentActions);
  }

  // --- Redeploy: submit custom deployment (endPhase handled above) -----------
  const redeployAction = actions.find(
    (a) => a.type === 'redeploy' || a.type === 'ghoulRedeploy',
  );
  if (redeployAction) {
    return _chooseRedeploy(state, actions);
  }

  // --- Fallback: endPhase or random from remaining ---------------------------
  const fallback = actions.filter((a) =>
    a.type !== 'readyTroopsDeploy' &&
    a.type !== 'ghoulReadyTroopsDeploy' &&
    a.type !== 'ghoulRedeploy' &&
    a.type !== 'redeploy' &&
    a.type !== 'placeEncampments',
  );
  return fallback.length > 0 ? fallback[0] : actions[0];
}

// ── Combo Selection ─────────────────────────────────────────────────────────

function _chooseCombo(state: GameState, comboActions: readonly GameAction[]): GameAction {
  const playerIdx = state.activePlayerIndex;

  // God-tier auto-select: take these combos regardless of slot cost
  for (const action of comboActions) {
    if (action.type !== 'selectCombo') continue;
    const slot = state.comboShop.visible[action.comboIndex];
    if (!slot) continue;
    const isGodTier = GOD_TIER_COMBOS.some(
      (gt) => gt.raceId === slot.raceId && gt.powerId === slot.powerId,
    );
    if (isGodTier) return action;
  }

  let bestAction = comboActions[0];
  let bestScore = -Infinity;

  for (const action of comboActions) {
    if (action.type !== 'selectCombo') continue;
    const slot = state.comboShop.visible[action.comboIndex];
    if (!slot) continue;
    const score = evaluateCombo(state, slot.raceId, slot.powerId, action.comboIndex, playerIdx);
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}

/** Score a combo based on token count, map synergy, income projection, and denial. */
export function evaluateCombo(
  state: GameState,
  raceId: RaceId,
  powerId: PowerId,
  comboIndex: number,
  playerIndex: 0 | 1,
): number {
  const race = RACES[raceId];
  const power = POWERS[powerId];
  if (!race || !power) return 0;

  const tokenCount = race.baseTokens + power.bonusTokens;
  const remainingTurns = Math.max(1, 10 - state.turn + 1);
  const landRegions = state.board.regions.filter(
    (r) => r.terrain !== 'sea' && r.terrain !== 'lake',
  );
  const totalLand = landRegions.length;

  // Coins sitting on this slot (free money)
  const slotCoins = state.comboShop.visible[comboIndex]?.coinsOnSlot ?? 0;

  // --- Token count score ---
  let score = tokenCount * 1.0;

  // --- Synergy with map terrain/features ---
  const rMods = race.modifiers;
  const pMods = power.modifiers;

  // Terrain bonuses
  for (const mods of [rMods, pMods]) {
    if (mods.bonusPerTerrain) {
      const matching = landRegions.filter((r) => r.terrain === mods.bonusPerTerrain!.terrain).length;
      score += (matching / totalLand) * 5 * mods.bonusPerTerrain.bonus;
    }
  }

  // Feature bonuses
  for (const mods of [rMods, pMods]) {
    if (mods.bonusPerRegionFeature) {
      const feat = mods.bonusPerRegionFeature.feature;
      const matching = landRegions.filter((r) => _regionHasFeature(r, feat)).length;
      score += matching * 1.5 * mods.bonusPerRegionFeature.bonus;
    }
  }

  // Conquest cost reducers (how many regions benefit)
  for (const mods of [rMods, pMods]) {
    if (mods.conquestCostModifier) {
      score += 3.0; // Commando: universal discount
    }
    if (mods.conquestCostCoastalModifier) {
      const coastal = landRegions.filter((r) => r.isCoastal).length;
      score += (coastal / totalLand) * 3;
    }
    if (mods.conquestCostTerrainModifier) {
      const matching = landRegions.filter((r) =>
        mods.conquestCostTerrainModifier!.terrains.includes(r.terrain),
      ).length;
      score += (matching / totalLand) * 3;
    }
    if (mods.conquestCostAdjacentOwnMountainModifier) {
      score += 1.5; // Conditional but powerful
    }
    if (mods.conquestCostUnderworldModifier) {
      const underworld = landRegions.filter((r) => r.hasUnderworld).length;
      score += underworld * 0.5;
    }
  }

  // Movement abilities
  for (const mods of [rMods, pMods]) {
    if (mods.ignoreAdjacency) score += 2.5; // Flying: very powerful
    if (mods.firstConquestAnywhere) score += 1.0;
    if (mods.underworldAreAdjacent) score += 1.0;
  }

  // Per-region bonus (Merchant)
  const bonusPerRegion = (rMods.bonusPerRegion ?? 0) + (pMods.bonusPerRegion ?? 0);
  if (bonusPerRegion > 0) score += 2.5;

  // Per-conquest bonus (Orcs/Pillaging)
  const bonusPerConquest = (rMods.bonusPerNonEmptyConquest ?? 0) + (pMods.bonusPerNonEmptyConquest ?? 0);
  if (bonusPerConquest > 0) {
    const opponentRegions = state.board.regions.filter(
      (r) => r.owner !== null && r.owner !== playerIndex,
    ).length;
    score += opponentRegions * 0.3 * bonusPerConquest;
  }

  // Flat bonus per turn (Alchemist)
  const flatBonus = (rMods.flatBonusPerTurn ?? 0) + (pMods.flatBonusPerTurn ?? 0);
  if (flatBonus > 0) score += flatBonus * Math.min(remainingTurns, 3) * 0.5;

  // First turn bonus (Wealthy) — decays with game progress
  const firstTurnBonus = (rMods.firstTurnBonus ?? 0) + (pMods.firstTurnBonus ?? 0);
  if (firstTurnBonus > 0) score += firstTurnBonus * (1.0 - (state.turn - 1) / 9) * 0.5;

  // Decline-relevant abilities
  for (const mods of [rMods, pMods]) {
    if (mods.keepAllTokensInDecline) score += 2.0; // Ghouls: strong late persistence
    if (mods.placesLair) score += 1.5; // Trolls: passive defense in decline
    if (mods.noDefeatCasualties) score += 1.0; // Elves: defensive value
    if (mods.canDeclineAfterConquest) score += 2.0; // Stout: tempo advantage
    if (mods.conquestOnlyTokens) score += mods.conquestOnlyTokens * 0.3; // Amazons
    if (mods.berserkDie) score += 1.5; // Expected +1 per conquest
  }

  // Token generation (Skeletons)
  for (const mods of [rMods, pMods]) {
    if (mods.tokensPerNonEmptyConquests) score += 2.0;
  }

  // --- Opponent denial bonus ---
  const opIdx = (1 - playerIndex) as 0 | 1;
  const opponent = state.players[opIdx];
  if (opponent.activeRace) {
    const oppMods = getActiveModifiers(opponent);
    // If this combo would synergize with what the opponent needs, it's worth denying
    for (const tb of oppMods.terrainBonuses) {
      for (const mods of [rMods, pMods]) {
        if (mods.bonusPerTerrain?.terrain === tb.terrain) score += 1.0;
      }
    }
  }

  // --- Cost penalty: higher index = more expensive (coins spent to skip) ---
  score -= comboIndex * 0.5;

  // --- Free coins on slot ---
  score += slotCoins * 1.0;

  // --- Race & power tier bonuses ---
  score += RACE_TIER_BONUS[raceId] ?? 0;
  score += POWER_TIER_BONUS[powerId] ?? 0;

  return score;
}

// ── Conquest Selection ──────────────────────────────────────────────────────

function _chooseConquest(
  state: GameState,
  allActions: readonly GameAction[],
  conquestActions: readonly GameAction[],
): GameAction {
  const playerIdx = state.activePlayerIndex;
  const player = state.players[playerIdx];

  // Evaluate each conquest target
  let bestAction = conquestActions[0];
  let bestEfficiency = -Infinity;

  for (const action of conquestActions) {
    let regionId: number | undefined;
    if (action.type === 'conquer') regionId = action.regionId;
    else if (action.type === 'useReinforcement') regionId = action.regionId;
    else if (action.type === 'ghoulConquer') regionId = action.regionId;
    else if (action.type === 'ghoulUseReinforcement') regionId = action.regionId;
    else continue;

    const value = evaluateRegionForConquest(state, regionId, playerIdx);

    let cost: number;
    try {
      cost = calculateConquestCost(state, regionId);
    } catch {
      cost = Infinity;
    }

    const efficiency = cost > 0 ? value / cost : value;
    if (efficiency > bestEfficiency) {
      bestEfficiency = efficiency;
      bestAction = action;
    }
  }

  // Decide whether to stop conquering
  const hasEndPhase = allActions.some((a) => a.type === 'endPhase');
  if (hasEndPhase && bestEfficiency < 0.4 && player.availableTokens <= 1) {
    // Check if final conquest is available — that's often better than stopping
    const hasFinalConquest = allActions.some(
      (a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest',
    );
    if (hasFinalConquest) {
      return allActions.find(
        (a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest',
      )!;
    }
    return allActions.find((a) => a.type === 'endPhase')!;
  }

  return bestAction;
}

/** Evaluate how valuable it is to conquer a specific region. */
export function evaluateRegionForConquest(
  state: GameState,
  regionId: number,
  playerIndex: 0 | 1,
): number {
  const region = state.board.regions.find((r) => r.id === regionId);
  if (!region) return 0;

  const player = state.players[playerIndex];
  const opIdx = (1 - playerIndex) as 0 | 1;
  const isFinalTurn = state.turn >= 10;

  let value = 1.0; // Base: 1 coin for owning a region

  // --- Scoring bonuses from current race/power ---
  if (player.activeRace) {
    const mods = getActiveModifiers(player);

    // Terrain bonus
    for (const tb of mods.terrainBonuses) {
      if (region.terrain === tb.terrain) value += tb.bonus;
    }

    // Feature bonus
    for (const fb of mods.featureBonuses) {
      if (_regionHasFeature(region, fb.feature)) value += fb.bonus;
    }

    // Merchant: +1 per region
    if (mods.bonusPerRegion > 0) value += mods.bonusPerRegion;

    // Orcs/Pillaging: bonus for conquering non-empty regions
    if (mods.bonusPerNonEmptyConquest > 0 && region.tokens > 0) {
      value += mods.bonusPerNonEmptyConquest;
    }
  }

  // --- Occupation type priority (opponent active > declined > lost tribe > empty) ---
  if (region.owner === opIdx) {
    if (region.isDeclined) {
      value += 0.5; // Declined: still worth denying passive income
    } else {
      value += 1.0; // Active: higher priority — removes future threat
    }
  } else if (region.hasLostTribe) {
    // Lost tribe: baseline (no bonus)
  } else if (region.owner === null) {
    value -= 0.3; // Empty: least valuable target
  }

  // --- Opponent denial (zero-sum: denying opponent income = gaining your own) ---
  if (region.owner === opIdx) {
    if (region.isDeclined) {
      // Wiping declined tokens starves opponent economy
      value += 0.8;
    } else {
      // Active race displacement — disrupts opponent's plans
      value += 2.0;
    }

    // Deny terrain bonuses the opponent gets from this region
    const opponent = state.players[opIdx];
    if (opponent.activeRace && !region.isDeclined) {
      const oppMods = getActiveModifiers(opponent);
      for (const tb of oppMods.terrainBonuses) {
        if (region.terrain === tb.terrain) value += 1.0;
      }
      for (const fb of oppMods.featureBonuses) {
        if (_regionHasFeature(region, fb.feature)) value += 1.0;
      }
    }
  }

  // --- Giants strategy: conquer mountains first, then expand to adjacent ---
  if (player.activeRace?.raceId === 'giants') {
    if (region.terrain === 'mountain') {
      value += 3.0; // Take mountains first for the adjacency discount
    } else {
      // Bonus for regions adjacent to own mountains (leverage -1 cost)
      const adjToOwnMountain = region.adjacentRegionIds.some((adjId) => {
        const adj = state.board.regions.find((r) => r.id === adjId);
        return adj && adj.owner === playerIndex && !adj.isDeclined && adj.terrain === 'mountain';
      });
      if (adjToOwnMountain) value += 1.5;
    }
  }

  // --- Expansion potential ---
  if (!isFinalTurn) {
    const unconqueredAdj = region.adjacentRegionIds.filter((adjId) => {
      const adj = state.board.regions.find((r) => r.id === adjId);
      return adj && adj.owner !== playerIndex && adj.terrain !== 'sea' && adj.terrain !== 'lake';
    }).length;
    value += unconqueredAdj * 0.15;
  }

  // --- Defensibility ---
  if (!isFinalTurn) {
    if (region.terrain === 'mountain') value += 0.5; // Hard to retake
    if (region.isEdge) value += 0.1; // Fewer attack vectors

    // Clustering: adjacent own regions
    const ownAdj = region.adjacentRegionIds.filter((adjId) => {
      const adj = state.board.regions.find((r) => r.id === adjId);
      return adj && adj.owner === playerIndex && !adj.isDeclined;
    }).length;
    value += ownAdj * 0.1;
  }

  // --- Sorcerer risk: avoid leaving 1 token if opponent has Sorcerers ---
  if (!isFinalTurn) {
    const opponent = state.players[opIdx];
    if (opponent.activeRace?.raceId === 'sorcerers') {
      const oppRegions = state.board.regions.filter(
        (r) => r.owner === opIdx && !r.isDeclined,
      );
      const adjToSorcerer = oppRegions.some((opp) =>
        opp.adjacentRegionIds.includes(regionId),
      );
      if (adjToSorcerer) value -= 0.5;
    }
  }

  return value;
}

// ── Sorcerer Convert ────────────────────────────────────────────────────────

function _chooseSorcererConvert(
  state: GameState,
  sorcererActions: readonly GameAction[],
): GameAction {
  const playerIdx = state.activePlayerIndex;
  let bestAction = sorcererActions[0];
  let bestValue = -Infinity;

  for (const action of sorcererActions) {
    if (action.type !== 'sorcererConvert') continue;
    const value = evaluateRegionForConquest(state, action.regionId, playerIdx);
    if (value > bestValue) {
      bestValue = value;
      bestAction = action;
    }
  }

  return bestAction;
}

// ── Dragon Placement ────────────────────────────────────────────────────────

function _chooseDragon(
  state: GameState,
  dragonActions: readonly GameAction[],
): GameAction {
  // Dragon gives a free conquest — use it on the highest-cost target
  let bestAction = dragonActions[0];
  let bestCost = -1;

  for (const action of dragonActions) {
    if (action.type !== 'placeDragon') continue;
    let cost: number;
    try {
      cost = calculateConquestCost(state, action.regionId);
    } catch {
      cost = 0;
    }
    // Tiebreak by strategic value
    const value = evaluateRegionForConquest(state, action.regionId, state.activePlayerIndex);
    const score = cost * 2 + value;
    if (score > bestCost) {
      bestCost = score;
      bestAction = action;
    }
  }

  return bestAction;
}

// ── Ready Troops ────────────────────────────────────────────────────────────

function _chooseReadyTroops(
  state: GameState,
  allActions: readonly GameAction[],
): GameAction {
  const playerIdx = state.activePlayerIndex;
  const isGhoulPhase = allActions.some((a) => a.type === 'ghoulReadyTroopsDeploy');

  const ownedRegions = state.board.regions.filter((r) => {
    if (isGhoulPhase) return r.owner === playerIdx && r.isDeclined;
    return r.owner === playerIdx && !r.isDeclined;
  });

  // Build deployment map: keep 1 token on all regions to avoid costly
  // re-conquest (2 tokens to conquer an empty region vs 1 token to hold it).
  // Never abandon regions — even on the final turn.
  const deployment = new Map<number, number>();

  for (const region of ownedRegions) {
    deployment.set(region.id, 1);
  }

  const actionType = isGhoulPhase ? 'ghoulReadyTroopsDeploy' : 'readyTroopsDeploy';
  // Check if this action type exists in legal actions
  const templateAction = allActions.find((a) => a.type === actionType);
  if (templateAction) {
    return { type: actionType, deployment } as GameAction;
  }

  // Fallback to endPhase
  return allActions.find((a) => a.type === 'endPhase') ?? allActions[0];
}

function _choosePickUp(
  state: GameState,
  allActions: readonly GameAction[],
  pickUpActions: readonly GameAction[],
): GameAction {
  const playerIdx = state.activePlayerIndex;

  // Only consider regions with excess tokens (more than 1) — leave 1 to hold
  const excessActions = pickUpActions.filter((a) => a.count > 1);
  if (excessActions.length === 0) {
    // No excess tokens to gather — end the pickup phase
    return allActions.find((a) => a.type === 'endPhase') ?? allActions[0];
  }

  // Pick up excess from the lowest-value region
  let bestAction: GameAction | null = null;
  let lowestValue = Infinity;

  for (const action of excessActions) {
    let regionId: number;
    if (action.type === 'pickUpTokens') regionId = action.regionId;
    else if (action.type === 'ghoulPickUpTokens') regionId = action.regionId;
    else continue;

    const region = state.board.regions.find((r) => r.id === regionId);
    if (!region) continue;

    const value = _regionRetainValue(state, region, playerIdx);
    if (value < lowestValue) {
      lowestValue = value;
      bestAction = action;
    }
  }

  // Pick up excess (leave 1 token), or end if regions are too valuable
  const player = state.players[playerIdx];
  if (bestAction && (lowestValue < 1.5 || player.availableTokens < 3)) {
    // Leave 1 token — pick up count - 1
    return { ...bestAction, count: (bestAction as { count: number }).count - 1 } as GameAction;
  }

  // Otherwise end the pickup phase
  return allActions.find((a) => a.type === 'endPhase') ?? allActions[0];
}

/** How valuable is it to keep tokens in this region vs gathering them? */
function _regionRetainValue(state: GameState, region: RegionState, playerIdx: 0 | 1): number {
  const opIdx = (1 - playerIdx) as 0 | 1;
  let value = 0;

  // Mountain: hard to retake
  if (region.terrain === 'mountain') value += 1.0;

  // Scoring bonus region
  const player = state.players[playerIdx];
  if (player.activeRace) {
    const mods = getActiveModifiers(player);
    for (const tb of mods.terrainBonuses) {
      if (region.terrain === tb.terrain) value += 1.0;
    }
    for (const fb of mods.featureBonuses) {
      if (_regionHasFeature(region, fb.feature)) value += 1.0;
    }
  }

  // Border threat: adjacent to opponent
  const oppAdjCount = region.adjacentRegionIds.filter((adjId) => {
    const adj = state.board.regions.find((r) => r.id === adjId);
    return adj && adj.owner === opIdx;
  }).length;
  if (oppAdjCount === 0) {
    // Interior region — safe to gather from
    value -= 0.5;
  }

  return value;
}

// ── Decline Decision ────────────────────────────────────────────────────────

/** Decide whether to go into decline based on economic analysis. */
export function shouldDecline(state: GameState, playerIndex: 0 | 1): boolean {
  const player = state.players[playerIndex];

  // Never decline on last turn
  if (state.turn >= 10) return false;

  // No active race — decline is clearly better
  if (!player.activeRace) return true;

  // Turn 9: only decline if current income is very low
  const currentIncome = calculateScore(state, playerIndex);
  if (state.turn === 9 && currentIncome > 3) return false;

  const remainingTurns = 10 - state.turn + 1;

  // Evaluate best available combo
  const bestComboScore = _evaluateBestNewCombo(state, playerIndex);
  const estimatedRegionsPerCombo = bestComboScore / 3.5; // rough regions from a fresh combo
  const estimatedNewIncome = estimatedRegionsPerCombo * 1.5; // regions * avg value

  // Effective conquest potential: tokens in hand + gatherable excess from regions
  const ownedRegions = state.board.regions.filter(
    (r) => r.owner === playerIndex && !r.isDeclined,
  );
  let gatherable = 0;
  for (const r of ownedRegions) {
    gatherable += Math.max(0, r.tokens - 1);
  }
  const effectiveAvailable = player.availableTokens + gatherable;

  // Declined residual: regions on mountains/hard-to-crack spots survive longer
  const declinedResidual = ownedRegions.filter(
    (r) => r.terrain === 'mountain' || r.hasTrollLair,
  ).length * 0.5;

  // Economic comparison
  const projectedCurrent = currentIncome * Math.min(remainingTurns, 3) * 0.8;
  const projectedNew = (estimatedNewIncome * (Math.min(remainingTurns, 3) - 1)) + declinedResidual * remainingTurns;

  // Stout power check — if this is optionalDecline phase, it's free
  const isStoutDecline = state.phase === 'optionalDecline';
  if (isStoutDecline) {
    // Free decline: take it if new combo is decent
    return bestComboScore > 6;
  }

  // Race is spent — can barely conquer anything meaningful
  if (effectiveAvailable < 4) return true;

  // Race is running low on conquest potential — decline if better combo exists
  if (effectiveAvailable < 6 && bestComboScore > currentIncome) return true;

  // General threshold: new path must be significantly better (15%)
  return projectedNew > projectedCurrent * 1.15;
}

function _evaluateBestNewCombo(state: GameState, playerIndex: 0 | 1): number {
  let bestScore = 0;
  for (let i = 0; i < state.comboShop.visible.length; i++) {
    const slot = state.comboShop.visible[i];
    if (!slot) continue;
    const score = evaluateCombo(state, slot.raceId, slot.powerId, i, playerIndex);
    if (score > bestScore) bestScore = score;
  }
  return bestScore;
}

// ── Redeployment ────────────────────────────────────────────────────────────

/** Compute optimal token distribution across owned regions. */
export function computeRedeployment(state: GameState, playerIndex: 0 | 1): Map<number, number> {
  const player = state.players[playerIndex];
  const isGhoulPhase = state.phase === 'ghoulRedeploy';
  const isFinalTurn = state.turn >= 10;

  const ownedRegions = state.board.regions.filter((r) => {
    if (isGhoulPhase) return r.owner === playerIndex && r.isDeclined;
    return r.owner === playerIndex && !r.isDeclined;
  });

  if (ownedRegions.length === 0) return new Map();

  // Count total deployable tokens
  let totalTokens = 0;
  for (const r of ownedRegions) totalTokens += r.tokens;
  totalTokens += player.availableTokens;

  // Remove conquest-only tokens (Amazons)
  if (!isGhoulPhase && player.activeRace) {
    const mods = getActiveModifiers(player);
    totalTokens -= mods.conquestOnlyTokens;
  }

  totalTokens = Math.max(totalTokens, ownedRegions.length); // At least 1 per region

  const deployment = new Map<number, number>();

  if (isFinalTurn) {
    // Final turn: spread exactly 1 per region for max territory.
    // Ignore all defense — there is no next turn.
    for (const r of ownedRegions) deployment.set(r.id, 1);
    return deployment;
  }

  const opIdx = (1 - playerIndex) as 0 | 1;
  const opponent = state.players[opIdx];

  // Classify regions as border (adjacent to enemy) or interior
  const borderRegions: RegionState[] = [];
  const interiorRegions: RegionState[] = [];
  for (const r of ownedRegions) {
    const isBorder = r.adjacentRegionIds.some((adjId) => {
      const adj = state.board.regions.find((a) => a.id === adjId);
      return adj && adj.owner === opIdx;
    });
    if (isBorder) {
      borderRegions.push(r);
    } else {
      interiorRegions.push(r);
    }
  }

  // Assign minimum 1 to every region
  for (const r of ownedRegions) deployment.set(r.id, 1);
  let remaining = totalTokens - ownedRegions.length;

  if (borderRegions.length > 0) {
    // --- Border stacking: pile all remaining tokens onto border regions ---
    const priorities = borderRegions.map((r) => ({
      id: r.id,
      priority: _regionDefensePriority(state, r, playerIndex),
    })).sort((a, b) => b.priority - a.priority);

    // Anticipate new race entry: if opponent has no active race (just declined),
    // boost edge regions since the new race must enter from the edge
    if (!opponent.activeRace) {
      for (const p of priorities) {
        const region = borderRegions.find((r) => r.id === p.id);
        if (region?.isEdge) p.priority += 4.0;
      }
      // Also boost edge interior regions
      for (const r of interiorRegions) {
        if (r.isEdge && remaining > 0) {
          const current = deployment.get(r.id)!;
          deployment.set(r.id, current + 1);
          remaining--;
        }
      }
      priorities.sort((a, b) => b.priority - a.priority);
    }

    // Distribute remaining to border regions by priority
    while (remaining > 0) {
      for (const p of priorities) {
        if (remaining <= 0) break;
        const current = deployment.get(p.id)!;
        deployment.set(p.id, current + 1);
        remaining--;
      }
    }
  } else {
    // --- No borders: equalize defense across all regions ---
    // Spread tokens so each region has roughly equal defense
    const tokensPerRegion = Math.floor(totalTokens / ownedRegions.length);
    const extraTokens = totalTokens % ownedRegions.length;

    for (let i = 0; i < ownedRegions.length; i++) {
      deployment.set(ownedRegions[i].id, tokensPerRegion + (i < extraTokens ? 1 : 0));
    }
  }

  return deployment;
}

function _regionDefensePriority(
  state: GameState,
  region: RegionState,
  playerIdx: 0 | 1,
): number {
  const opIdx = (1 - playerIdx) as 0 | 1;
  const player = state.players[playerIdx];
  let priority = 0;

  // Border threat: count adjacent opponent regions and tokens
  for (const adjId of region.adjacentRegionIds) {
    const adj = state.board.regions.find((r) => r.id === adjId);
    if (adj && adj.owner === opIdx) {
      priority += 0.5;
      priority += adj.tokens * 0.2;
    }
  }

  // Mountain: valuable in decline
  if (region.terrain === 'mountain') priority += 2.0;

  // Scoring bonus region
  if (player.activeRace) {
    const mods = getActiveModifiers(player);
    for (const tb of mods.terrainBonuses) {
      if (region.terrain === tb.terrain) priority += 1.0;
    }
    for (const fb of mods.featureBonuses) {
      if (_regionHasFeature(region, fb.feature)) priority += 1.0;
    }
    if (mods.bonusPerRegion > 0) priority += 0.5;
  }

  // Sorcerer defense: MUST stack 2+ if adjacent to opponent sorcerers
  const opponent = state.players[opIdx];
  if (opponent.activeRace?.raceId === 'sorcerers') {
    const oppSorcererRegions = state.board.regions.filter(
      (r) => r.owner === opIdx && !r.isDeclined,
    );
    const adjToSorcerer = oppSorcererRegions.some((opp) =>
      opp.adjacentRegionIds.includes(region.id),
    );
    if (adjToSorcerer) priority += 3.0; // High priority to stack tokens here
  }

  return priority;
}

function _chooseRedeploy(state: GameState, _allActions: readonly GameAction[]): GameAction {
  const playerIdx = state.activePlayerIndex;
  const isGhoulPhase = state.phase === 'ghoulRedeploy';
  const deployment = computeRedeployment(state, playerIdx);
  const actionType = isGhoulPhase ? 'ghoulRedeploy' : 'redeploy';

  return { type: actionType, deployment } as GameAction;
}

// ── Special Placements ──────────────────────────────────────────────────────

function _chooseHeroes(state: GameState, heroActions: readonly GameAction[]): GameAction {
  const playerIdx = state.activePlayerIndex;

  // Pick the pair with highest combined threat
  let bestAction = heroActions[0];
  let bestScore = -Infinity;

  for (const action of heroActions) {
    if (action.type !== 'placeHeroes') continue;
    let score = 0;
    for (const rId of action.regionIds) {
      const region = state.board.regions.find((r) => r.id === rId);
      if (!region) continue;
      score += _regionDefensePriority(state, region, playerIdx);
    }
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}

function _chooseFortress(state: GameState, fortressActions: readonly GameAction[]): GameAction {
  const playerIdx = state.activePlayerIndex;
  let bestAction = fortressActions[0];
  let bestScore = -Infinity;

  for (const action of fortressActions) {
    if (action.type !== 'placeFortress') continue;
    const region = state.board.regions.find((r) => r.id === action.regionId);
    if (!region) continue;
    let score = _regionDefensePriority(state, region, playerIdx);
    // Prefer mountains (fortress + mountain = very hard to crack)
    if (region.terrain === 'mountain') score += 2.0;
    if (score > bestScore) {
      bestScore = score;
      bestAction = action;
    }
  }

  return bestAction;
}

function _chooseEncampments(state: GameState, encampmentActions: readonly GameAction[]): GameAction {
  // If only one option, take it
  if (encampmentActions.length === 1) return encampmentActions[0];

  const playerIdx = state.activePlayerIndex;

  // Build our own encampment deployment: spread across most-threatened borders
  const ownedRegions = state.board.regions.filter(
    (r) => r.owner === playerIdx && !r.isDeclined,
  );

  const ranked = ownedRegions.map((r) => ({
    id: r.id,
    priority: _regionDefensePriority(state, r, playerIdx),
  })).sort((a, b) => b.priority - a.priority);

  const deployment = new Map<number, number>();
  let remaining = 5;

  // Spread: max 2 per region to cover more attack vectors
  for (const r of ranked) {
    if (remaining <= 0) break;
    const count = Math.min(remaining, 2);
    deployment.set(r.id, count);
    remaining -= count;
  }

  // If still remaining, add more to top regions
  for (const r of ranked) {
    if (remaining <= 0) break;
    const current = deployment.get(r.id) ?? 0;
    deployment.set(r.id, current + 1);
    remaining--;
  }

  return { type: 'placeEncampments', deployment } as GameAction;
}

// ── Utilities ───────────────────────────────────────────────────────────────

function _regionHasFeature(
  region: RegionState,
  feature: 'mine' | 'magicSource' | 'underworld',
): boolean {
  switch (feature) {
    case 'mine': return region.hasMine;
    case 'magicSource': return region.hasMagicSource;
    case 'underworld': return region.hasUnderworld;
  }
}


function _sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
