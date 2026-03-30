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
  // Expected active turns before next decline (typically 2-3 turns)
  const expectedActiveTurns = Math.min(remainingTurns, 3);
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

  // Terrain bonuses — scale by how many matching regions are AVAILABLE to conquer
  for (const mods of [rMods, pMods]) {
    if (mods.bonusPerTerrain) {
      const matching = landRegions.filter((r) => r.terrain === mods.bonusPerTerrain!.terrain).length;
      // Available matching regions we could realistically hold
      const conquerable = Math.min(matching, Math.floor(tokenCount / 2));
      score += conquerable * mods.bonusPerTerrain.bonus * 0.8;
    }
  }

  // Feature bonuses
  for (const mods of [rMods, pMods]) {
    if (mods.bonusPerRegionFeature) {
      const feat = mods.bonusPerRegionFeature.feature;
      const matching = landRegions.filter((r) => _regionHasFeature(r, feat)).length;
      const conquerable = Math.min(matching, Math.floor(tokenCount / 2));
      score += conquerable * mods.bonusPerRegionFeature.bonus * 0.8;
    }
  }

  // Conquest cost reducers (how many regions benefit)
  for (const mods of [rMods, pMods]) {
    if (mods.conquestCostModifier) {
      // Commando: -1 on ALL conquests = effectively +1 extra token per conquest
      // More tokens means more regions, which compounds with per-region scoring
      score += 3.5;
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

  // Per-region bonus (Merchant) — scales with expected regions held
  const bonusPerRegion = (rMods.bonusPerRegion ?? 0) + (pMods.bonusPerRegion ?? 0);
  if (bonusPerRegion > 0) {
    const estimatedRegions = Math.floor(tokenCount / 3);
    score += estimatedRegions * bonusPerRegion * 0.7;
  }

  // Per-conquest bonus (Orcs/Pillaging) — scales with opponent presence
  const bonusPerConquest = (rMods.bonusPerNonEmptyConquest ?? 0) + (pMods.bonusPerNonEmptyConquest ?? 0);
  if (bonusPerConquest > 0) {
    const opponentRegions = state.board.regions.filter(
      (r) => r.owner !== null && r.owner !== playerIndex,
    ).length;
    // More valuable when opponent has lots of regions to attack
    score += Math.min(opponentRegions, Math.floor(tokenCount / 3)) * 0.5 * bonusPerConquest;
  }

  // Flat bonus per turn (Alchemist) — scales with expected active turns
  const flatBonus = (rMods.flatBonusPerTurn ?? 0) + (pMods.flatBonusPerTurn ?? 0);
  if (flatBonus > 0) score += flatBonus * expectedActiveTurns * 0.5;

  // First turn bonus (Wealthy) — decays with game progress
  const firstTurnBonus = (rMods.firstTurnBonus ?? 0) + (pMods.firstTurnBonus ?? 0);
  if (firstTurnBonus > 0) score += firstTurnBonus * (1.0 - (state.turn - 1) / 9) * 0.5;

  // Decline-relevant abilities
  for (const mods of [rMods, pMods]) {
    if (mods.keepAllTokensInDecline) {
      // Ghouls: all tokens persist in decline AND can still conquer — very strong
      score += 3.0;
    }
    if (mods.placesLair) score += 1.5; // Trolls: passive defense in decline
    if (mods.noDefeatCasualties) score += 1.0; // Elves: defensive value
    if (mods.canDeclineAfterConquest) {
      // Stout: free decline saves an entire turn — more valuable with more turns left
      score += remainingTurns >= 4 ? 3.0 : 1.5;
    }
    if (mods.conquestOnlyTokens) score += mods.conquestOnlyTokens * 0.3; // Amazons
    if (mods.berserkDie) score += 1.5; // Expected +1 per conquest
  }

  // Token generation (Skeletons) — scales with opponent presence (non-empty conquests)
  for (const mods of [rMods, pMods]) {
    if (mods.tokensPerNonEmptyConquests) {
      const opponentRegions = state.board.regions.filter(
        (r) => r.owner !== null && r.owner !== playerIndex,
      ).length;
      score += Math.min(opponentRegions, 4) * 0.5;
    }
  }

  // --- Opponent denial: hate-draft combos that would be great for opponent ---
  const opIdx = (1 - playerIndex) as 0 | 1;
  const opponent = state.players[opIdx];

  // If opponent just declined or has no race, they'll pick next turn — deny strong combos
  if (!opponent.activeRace) {
    // Opponent will pick from this same shop next turn. If this combo is strong,
    // taking it denies them a powerful option.
    const isGodTier = GOD_TIER_COMBOS.some(
      (gt) => gt.raceId === raceId && gt.powerId === powerId,
    );
    if (isGodTier) score += 3.0; // Extra incentive to deny
  }

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
  // Also factor in actual coin balance — paying 4 coins when you have 6 hurts more
  const player = state.players[playerIndex];
  const netCoinCost = comboIndex - slotCoins;
  if (netCoinCost > 0 && player.coins < 10) {
    score -= netCoinCost * 0.7;
  } else {
    score -= comboIndex * 0.5;
    score += slotCoins * 1.0;
  }

  // --- Race & power tier bonuses — scaled by remaining turns ---
  // Tier 1 races/powers are less impactful if picked on turn 9 (only 2 active turns)
  const turnScale = Math.min(1.0, remainingTurns / 5);
  score += (RACE_TIER_BONUS[raceId] ?? 0) * turnScale;
  score += (POWER_TIER_BONUS[powerId] ?? 0) * turnScale;

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
  if (hasEndPhase) {
    const hasFinalConquest = allActions.some(
      (a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest',
    );
    const isFinalTurn = state.turn >= 10;

    // Count how many regions we own (for defense token budget)
    const ownedRegions = state.board.regions.filter(
      (r) => r.owner === playerIdx && !r.isDeclined,
    ).length;

    // Estimate tokens remaining after this conquest
    let conquestCostEstimate = 3;
    if (bestAction.type === 'conquer') {
      try { conquestCostEstimate = calculateConquestCost(state, (bestAction as { regionId: number }).regionId); } catch { /* use default */ }
    }
    const tokensAfterConquest = player.availableTokens - conquestCostEstimate;

    // Stop if: low efficiency AND we'd be dipping into defense reserves
    if (bestEfficiency < 0.4 && (player.availableTokens <= 1 || tokensAfterConquest < 0)) {
      if (hasFinalConquest) {
        return allActions.find(
          (a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest',
        )!;
      }
      return allActions.find((a) => a.type === 'endPhase')!;
    }

    // Also stop if we have many regions to defend and efficiency is marginal
    if (!isFinalTurn && bestEfficiency < 0.6 && player.availableTokens <= 2 && ownedRegions >= 4) {
      if (hasFinalConquest) {
        return allActions.find(
          (a) => a.type === 'startFinalConquest' || a.type === 'startGhoulFinalConquest',
        )!;
      }
      return allActions.find((a) => a.type === 'endPhase')!;
    }
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
  const opponent = state.players[opIdx];
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

  // --- Own declined tokens: almost never conquer your own passive income ---
  if (region.owner === playerIndex && region.isDeclined) {
    // Conquering our own declined region destroys passive income (net 0 gain:
    // we lose 1 declined income but gain 1 active income). It also costs tokens.
    // Only worth it if the active race earns significantly MORE from this region
    // (e.g., terrain/feature bonuses) or it unlocks critical expansion paths.
    // Apply a heavy penalty so this only happens in exceptional cases.
    value -= 5.0;
  }

  // --- Opponent denial (zero-sum: denying opponent income = gaining your own) ---
  if (region.owner === opIdx) {
    if (region.isDeclined) {
      // Wiping declined tokens is a TOP PRIORITY in 2-player.
      // Each declined region you wipe is a -1 swing (they lose 1 income, you gain 1).
      // That's a 2-point swing per region, compounding every remaining turn.
      const remainingTurns = Math.max(1, 10 - state.turn + 1);
      const swingPerTurn = 2.0; // -1 opponent income + 1 your income
      // Value over remaining turns, discounted (tokens may be reconquered)
      value += swingPerTurn * Math.min(remainingTurns, 3) * 0.4;

      // Extra bonus if we can wipe ALL their declined regions (eliminates passive income)
      const totalDeclinedRegions = state.board.regions.filter(
        (r) => r.owner === opIdx && r.isDeclined,
      ).length;
      if (totalDeclinedRegions <= 3) {
        // Few declined regions left — high incentive to finish them off
        value += 1.5;
      }
    } else {
      // Active race displacement — disrupts opponent's plans
      value += 2.0;

      // Deny terrain/feature bonuses the opponent earns from this region
      if (opponent.activeRace) {
        const oppMods = getActiveModifiers(opponent);
        for (const tb of oppMods.terrainBonuses) {
          if (region.terrain === tb.terrain) value += tb.bonus;
        }
        for (const fb of oppMods.featureBonuses) {
          if (_regionHasFeature(region, fb.feature)) value += fb.bonus;
        }
        // Deny Merchant bonus
        if (oppMods.bonusPerRegion > 0) value += oppMods.bonusPerRegion;
      }
    }
  } else if (region.hasLostTribe) {
    // Lost tribe: baseline (no bonus beyond the base 1.0)
  } else if (region.owner === null) {
    value -= 0.3; // Empty: least valuable target
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

  // --- Conquest chain bonus: how many valuable targets does this region unlock? ---
  if (!isFinalTurn) {
    let chainValue = 0;
    for (const adjId of region.adjacentRegionIds) {
      const adj = state.board.regions.find((r) => r.id === adjId);
      if (!adj || adj.terrain === 'sea' || adj.terrain === 'lake') continue;
      if (adj.owner === playerIndex) continue; // Already ours

      // Check if this adjacent region is ONLY reachable through the target region
      // (i.e., we don't already border it from another owned region)
      const alreadyAdjacent = adj.adjacentRegionIds.some((id) => {
        if (id === regionId) return false; // Don't count the region we're evaluating
        const r2 = state.board.regions.find((r) => r.id === id);
        return r2 && r2.owner === playerIndex && !r2.isDeclined;
      });

      if (!alreadyAdjacent) {
        // This region opens up a new target — value based on what's there
        if (adj.owner === opIdx && adj.isDeclined) {
          chainValue += 0.6; // Opens up declined token wiping
        } else if (adj.owner === opIdx) {
          chainValue += 0.4; // Opens up active opponent displacement
        } else {
          chainValue += 0.15; // Opens up generic expansion
        }
      }
    }
    value += chainValue;
  }

  // --- Expansion potential (unconquered adjacent for future turns) ---
  if (!isFinalTurn) {
    const unconqueredAdj = region.adjacentRegionIds.filter((adjId) => {
      const adj = state.board.regions.find((r) => r.id === adjId);
      return adj && adj.owner !== playerIndex && adj.terrain !== 'sea' && adj.terrain !== 'lake';
    }).length;
    value += unconqueredAdj * 0.1;
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

  // Be more aggressive about gathering when we have few tokens in hand
  // (we need them for conquests), but more conservative about stripping
  // high-value or threatened regions
  const desperateForTokens = player.availableTokens < 3;
  const threshold = desperateForTokens ? 2.0 : 1.5;

  if (bestAction && (lowestValue < threshold || player.availableTokens < 2)) {
    // Leave 1 token — pick up count - 1
    return { ...bestAction, count: (bestAction as { count: number }).count - 1 } as GameAction;
  }

  // Otherwise end the pickup phase
  return allActions.find((a) => a.type === 'endPhase') ?? allActions[0];
}

/** How valuable is it to keep tokens in this region vs gathering them? */
function _regionRetainValue(state: GameState, region: RegionState, playerIdx: 0 | 1): number {
  const opIdx = (1 - playerIdx) as 0 | 1;
  const player = state.players[playerIdx];
  const opponent = state.players[opIdx];
  let value = 0;

  // Mountain: hard to retake (costs +1 to conquer)
  if (region.terrain === 'mountain') value += 1.5;

  // Scoring bonus region
  if (player.activeRace) {
    const mods = getActiveModifiers(player);
    for (const tb of mods.terrainBonuses) {
      if (region.terrain === tb.terrain) value += tb.bonus;
    }
    for (const fb of mods.featureBonuses) {
      if (_regionHasFeature(region, fb.feature)) value += fb.bonus;
    }
    // Merchant: every region counts
    if (mods.bonusPerRegion > 0) value += mods.bonusPerRegion * 0.5;
  }

  // Border threat: count adjacent opponent regions and tokens
  let oppAdjCount = 0;
  let oppAdjTokens = 0;
  for (const adjId of region.adjacentRegionIds) {
    const adj = state.board.regions.find((r) => r.id === adjId);
    if (adj && adj.owner === opIdx && !adj.isDeclined) {
      oppAdjCount++;
      oppAdjTokens += adj.tokens;
    }
  }

  if (oppAdjCount === 0) {
    // Interior region — safe to gather from
    value -= 0.5;
  } else {
    // Threatened region — more tokens nearby = more danger = more value in keeping
    value += oppAdjCount * 0.3 + oppAdjTokens * 0.1;
  }

  // If opponent just declined (no active race), border regions are safer to strip
  if (!opponent.activeRace) {
    value -= 0.3;
  }

  // Isolated region (no adjacent owned regions) — less valuable to hold,
  // since it doesn't connect our territory
  const ownAdj = region.adjacentRegionIds.filter((adjId) => {
    const adj = state.board.regions.find((r) => r.id === adjId);
    return adj && adj.owner === playerIdx && !adj.isDeclined;
  }).length;
  if (ownAdj === 0) value -= 0.3;

  return value;
}

// ── Decline Decision ────────────────────────────────────────────────────────

/** Decide whether to go into decline based on economic analysis. */
export function shouldDecline(state: GameState, playerIndex: 0 | 1): boolean {
  const player = state.players[playerIndex];

  // Never decline on last turn — maximize active conquest income
  if (state.turn >= 10) return false;

  // No active race — must pick a new combo
  if (!player.activeRace) return true;

  const currentIncome = calculateScore(state, playerIndex);
  const remainingTurns = 10 - state.turn + 1;

  // Stout power check — declining is FREE (no tempo cost, happens after scoring)
  if (state.phase === 'optionalDecline') {
    // Since there's no tempo loss, just check if best available combo tokens
    // are worth more than our current race's remaining potential
    const bestCombo = _getBestNewCombo(state, playerIndex);
    if (!bestCombo) return false;
    const newTokens = RACES[bestCombo.raceId].baseTokens + POWERS[bestCombo.powerId].bonusTokens;
    // Free decline: take it if the new combo has enough tokens to conquer well
    return newTokens >= 8;
  }

  // Turn 9: declining costs our only remaining active turn — only if income is terrible
  if (state.turn === 9 && currentIncome > 3) return false;

  // ── Effective conquest potential ────────────────────────────────────────────
  const ownedRegions = state.board.regions.filter(
    (r) => r.owner === playerIndex && !r.isDeclined,
  );
  let gatherable = 0;
  for (const r of ownedRegions) {
    gatherable += Math.max(0, r.tokens - 1);
  }
  const effectiveAvailable = player.availableTokens + gatherable;

  // Estimate new conquests possible with current race (avg cost ~3 tokens)
  const estimatedNewConquests = Math.floor(effectiveAvailable / 3);

  // Race is completely spent AND income is low — decline
  if (estimatedNewConquests === 0 && currentIncome < 5) return true;

  // If we're still scoring well (7+ per turn), don't decline just because
  // tokens are low — holding territory has value
  if (currentIncome >= 7 && estimatedNewConquests >= 1) return false;

  // ── Economic projection: STAY vs DECLINE ───────────────────────────────────
  // Use actual token counts from best combo to estimate new race income,
  // not the abstract evaluation score (which includes tier bonuses, synergies, etc.)
  const bestCombo = _getBestNewCombo(state, playerIndex);
  if (!bestCombo) return false; // no combo available, can't decline

  const newRaceTokens = RACES[bestCombo.raceId].baseTokens + POWERS[bestCombo.powerId].bonusTokens;
  // New race conquests: tokens / avg cost of ~3 (mix of empty=2 and occupied=3-4)
  const estimatedNewRegions = Math.floor(newRaceTokens / 3);
  // New race per-turn income: 1 per region + some bonus (avg ~1.3x for abilities)
  const estimatedNewIncome = estimatedNewRegions * 1.3;

  // Declined residual: how many current regions survive in decline
  const regionCount = ownedRegions.length;
  // Mountains and troll lairs are expensive to retake — they persist longer
  const durableRegions = ownedRegions.filter(
    (r) => r.terrain === 'mountain' || r.hasTrollLair,
  ).length;
  // Rough estimate: durable regions persist, others get wiped within 1-2 turns
  const declinedResidualPerTurn = durableRegions * 1.0 + (regionCount - durableRegions) * 0.4;

  // Projection horizon: min(remaining, 4) turns to avoid wild extrapolation
  const horizon = Math.min(remainingTurns, 4);

  // STAY path: current income with gradual attrition as opponent conquers our regions
  let stayProjection = 0;
  for (let t = 0; t < horizon; t++) {
    // ~10% attrition per turn as opponent picks off our spread-thin regions
    const decay = Math.max(0.5, 1.0 - t * 0.10);
    stayProjection += currentIncome * decay;
  }

  // DECLINE path: lose THIS turn (only earn from declined residual),
  // then new race income + declining residual starting next turn
  let declineProjection = declinedResidualPerTurn; // turn 0: decline, only residual
  for (let t = 1; t < horizon; t++) {
    // New race active income + residual (residual decays as opponent wipes declined tokens)
    const residualDecay = Math.pow(0.65, t);
    declineProjection += estimatedNewIncome + declinedResidualPerTurn * residualDecay;
  }

  // Decline must be CLEARLY better to justify the tempo loss (25% threshold).
  // This is deliberately conservative — the cost of premature decline is high
  // because you waste an entire turn not conquering.
  return declineProjection > stayProjection * 1.25;
}

/** Return the best new combo's race/power IDs (for token count estimation). */
function _getBestNewCombo(state: GameState, playerIndex: 0 | 1): { raceId: RaceId; powerId: PowerId } | null {
  let bestScore = -Infinity;
  let bestCombo: { raceId: RaceId; powerId: PowerId } | null = null;
  for (let i = 0; i < state.comboShop.visible.length; i++) {
    const slot = state.comboShop.visible[i];
    if (!slot) continue;
    const score = evaluateCombo(state, slot.raceId, slot.powerId, i, playerIndex);
    if (score > bestScore) {
      bestScore = score;
      bestCombo = { raceId: slot.raceId, powerId: slot.powerId };
    }
  }
  return bestCombo;
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

  // Pre-decline positioning: if we're likely to decline next turn,
  // prioritize mountains and troll-lair regions (they persist longer in decline)
  const likelyToDecllineSoon = _isLikelyToDeclineSoon(state, playerIndex, totalTokens, ownedRegions.length);

  if (likelyToDecllineSoon) {
    // Pre-decline mode: stack tokens on durable regions (mountains, troll lairs)
    // and spread 1 per region elsewhere to maximize decline coverage
    const durableRegions = ownedRegions.filter(
      (r) => r.terrain === 'mountain' || r.hasTrollLair,
    );
    const otherRegions = ownedRegions.filter(
      (r) => r.terrain !== 'mountain' && !r.hasTrollLair,
    );

    // 1 per non-durable region
    for (const r of otherRegions) deployment.set(r.id, 1);
    let afterMinimum = remaining - otherRegions.length; // remaining after initial 1-per-region above
    // Actually we already set 1 per region above, so remaining is already totalTokens - ownedRegions.length
    // Distribute remaining to durable regions
    if (durableRegions.length > 0) {
      const perDurable = Math.floor(remaining / durableRegions.length);
      const extraDurable = remaining % durableRegions.length;
      for (let i = 0; i < durableRegions.length; i++) {
        const current = deployment.get(durableRegions[i].id)!;
        deployment.set(durableRegions[i].id, current + perDurable + (i < extraDurable ? 1 : 0));
      }
      remaining = 0;
    }
    // If no durable regions, fall through to normal border stacking
  }

  if (remaining > 0 && borderRegions.length > 0) {
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

    // Predict if opponent is likely to decline — if so, border defense is less critical
    if (opponent.activeRace && _isOpponentLikelyToDecline(state, opIdx)) {
      // Opponent is weak — spread more evenly instead of heavy border stacking
      // Give border regions a modest +1 instead of dumping all tokens there
      for (const p of priorities) {
        if (remaining <= 0) break;
        const current = deployment.get(p.id)!;
        deployment.set(p.id, current + 1);
        remaining--;
      }
      // Distribute leftovers evenly across all regions
      while (remaining > 0) {
        for (const r of ownedRegions) {
          if (remaining <= 0) break;
          const current = deployment.get(r.id)!;
          deployment.set(r.id, current + 1);
          remaining--;
        }
      }
    } else {
      // Normal border stacking by priority
      while (remaining > 0) {
        for (const p of priorities) {
          if (remaining <= 0) break;
          const current = deployment.get(p.id)!;
          deployment.set(p.id, current + 1);
          remaining--;
        }
      }
    }
  } else if (remaining > 0) {
    // --- No borders: equalize defense across all regions ---
    // Spread tokens so each region has roughly equal defense
    while (remaining > 0) {
      for (const r of ownedRegions) {
        if (remaining <= 0) break;
        const current = deployment.get(r.id)!;
        deployment.set(r.id, current + 1);
        remaining--;
      }
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

/** Predict whether we're likely to decline on our next turn. */
function _isLikelyToDeclineSoon(
  state: GameState,
  playerIndex: 0 | 1,
  totalTokens: number,
  regionCount: number,
): boolean {
  // Never pre-position for decline on the last two turns
  if (state.turn >= 9) return false;

  const player = state.players[playerIndex];
  if (!player.activeRace) return false;

  // Estimate tokens available next turn (roughly: totalTokens - regionCount = excess)
  const excessTokens = totalTokens - regionCount;

  // If we have very few excess tokens, we're likely to decline
  if (excessTokens <= 2) return true;

  // If we're scoring poorly relative to our token investment, likely to decline
  const currentIncome = calculateScore(state, playerIndex);
  if (currentIncome <= 4 && excessTokens <= 4) return true;

  return false;
}

/** Predict whether the opponent is likely to decline on their next turn. */
function _isOpponentLikelyToDecline(state: GameState, opIdx: 0 | 1): boolean {
  const opponent = state.players[opIdx];
  if (!opponent.activeRace) return false; // Already declined

  // Count opponent's active regions and tokens
  const oppRegions = state.board.regions.filter(
    (r) => r.owner === opIdx && !r.isDeclined,
  );
  let oppTotalTokens = opponent.availableTokens;
  for (const r of oppRegions) oppTotalTokens += r.tokens;

  const excessTokens = oppTotalTokens - oppRegions.length;

  // Opponent has very few excess tokens — likely to decline
  if (excessTokens <= 2) return true;

  // Opponent has few regions left — likely to decline
  if (oppRegions.length <= 2 && excessTokens <= 4) return true;

  return false;
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
