import type { GameState, GameAction } from '@/game/state/types';
import { getActiveModifiers } from '@/game/abilities/modifiers';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { getFinalConquestTargets, getGhoulFinalConquestTargets, ghoulConquestCost } from '@/game/engine/reinforcementDie';
import { RACE_HANDLERS } from '@/game/abilities/raceAbilities';
import { POWER_HANDLERS } from '@/game/abilities/powerAbilities';

// ── Legal Action Generation ────────────────────────────────────────────────────
//
// Returns every GameAction the active player may legally submit in the
// current phase. The set is used by:
//   • HumanPlayer — Board/HUD only emit actions that appear in this list.
//   • AI players   — choose from this list.
//   • applyAction  — validates submitted action is in the list.
//
// Key conquest eligibility rules (PRD FR-13 to FR-18):
//   First conquest  → target must be a border region (edge of board, or adjacent
//                     to an edge sea) — interior lake shores don't count
//                     (unless Flying → any non-sea/lake; or Halflings → anywhere)
//   Subsequent     → target must be adjacent to an own active region
//                     (unless Flying → any non-sea/lake)
//                     Underworld: own underworld regions are also adjacent to all other underworld regions
//   Sea / Lake      → only conquerable by Seafaring
//   Protected       → hasHoleInTheGround, hasHero, hasDragon block all standard conquest
//   Cost            → player must have enough tokens in hand (availableTokens ≥ cost)

// ── Entry point ───────────────────────────────────────────────────────────────

export function getLegalActions(state: GameState): readonly GameAction[] {
  switch (state.phase) {
    case 'selectCombo':      return selectComboActions(state);
    case 'ghoulReadyTroops': return ghoulReadyTroopsActions(state);
    case 'ghoulConquest':    return ghoulConquestActions(state);
    case 'ghoulRedeploy':          return ghoulRedeployActions(state);
    case 'ghoulReinforcementDie':  return ghoulReinforcementDieActions(state);
    case 'readyTroops':            return readyTroopsActions(state);
    case 'conquest':         return conquestActions(state);
    case 'reinforcementDie': return reinforcementDieActions(state);
    case 'redeploy':         return redeployActions(state);
    case 'placeHeroes':      return placeHeroesActions(state);
    case 'score':            return [{ type: 'endPhase' }];
    case 'optionalDecline':  return [{ type: 'decline' }, { type: 'endPhase' }];
    case 'decline':          return [{ type: 'decline' }];
    case 'gameOver':         return [];
    default: {
      const _exhaustive: never = state.phase;
      return [_exhaustive];
    }
  }
}

// ── selectCombo ───────────────────────────────────────────────────────────────

function selectComboActions(state: GameState): GameAction[] {
  const { visible } = state.comboShop;
  const playerCoins = state.players[state.activePlayerIndex].coins;
  const actions: GameAction[] = [];
  for (let i = 0; i < visible.length; i++) {
    if (i <= playerCoins) {
      actions.push({ type: 'selectCombo', comboIndex: i });
    }
  }
  // If no combos available (exhausted shop), player must end phase to skip selection
  if (actions.length === 0) {
    actions.push({ type: 'endPhase' });
  }
  return actions;
}

// ── readyTroops ───────────────────────────────────────────────────────────────
// Player may pick up tokens from any owned active region (leaving ≥ 1).
// pickUpTokens actions enumerate each eligible region with the maximum
// pickup count (all but 1). applyAction validates the actual count submitted.

function readyTroopsActions(state: GameState): GameAction[] {
  const actions: GameAction[] = [{ type: 'endPhase' }];
  // Player may decline instead of conquering (FR-22)
  if (state.players[state.activePlayerIndex].activeRace) {
    actions.push({ type: 'decline' });
  }
  // Batch deploy placeholder for interactive human gathering (FR-13a/b)
  actions.push({ type: 'readyTroopsDeploy', deployment: new Map() });
  for (const region of state.board.regions) {
    if (region.owner !== state.activePlayerIndex) continue;
    if (region.isDeclined) continue;
    if (region.tokens > 0) {
      actions.push({
        type: 'pickUpTokens',
        regionId: region.id,
        count: region.tokens, // allow full pickup including abandon (FR-13b)
      });
    }
  }
  return actions;
}

// ── ghoulReadyTroops ──────────────────────────────────────────────────────────
// Ghouls in decline gather tokens from their declined regions before conquest.
// Works like readyTroops but for declined regions (not active).

function ghoulReadyTroopsActions(state: GameState): GameAction[] {
  const actions: GameAction[] = [{ type: 'endPhase' }];
  // Player may decline their active race before Ghouls act, but only if the active race
  // has already been deployed (tokensOnBoard > 0). On the first turn after selecting a new
  // combo, tokensOnBoard === 0 so decline is not yet available (FR-23b).
  const activeRace = state.players[state.activePlayerIndex].activeRace;
  if (activeRace && activeRace.tokensOnBoard > 0) {
    actions.push({ type: 'decline' });
  }
  // Batch deploy placeholder for interactive human gathering
  actions.push({ type: 'ghoulReadyTroopsDeploy', deployment: new Map() });
  for (const region of state.board.regions) {
    if (region.owner !== state.activePlayerIndex) continue;
    if (!region.isDeclined) continue; // Only declined (Ghoul) regions
    if (region.tokens > 0) {
      actions.push({
        type: 'ghoulPickUpTokens',
        regionId: region.id,
        count: region.tokens, // allow full pickup including abandon
      });
    }
  }
  return actions;
}

// ── ghoulConquest ─────────────────────────────────────────────────────────────
// In-Decline Ghouls conquer using the same adjacency rules as normal conquest,
// but only using declined tokens gathered during ghoulReadyTroops.
// Ghouls can conquer any region adjacent to their current declined regions
// (or any edge/coastal if none yet), provided they have enough tokens.

function ghoulConquestActions(state: GameState): GameAction[] {
  const player = state.players[state.activePlayerIndex];
  const declinedGhouls = player.declinedRaces.find((r) => r.raceId === 'ghouls');
  if (!declinedGhouls) return [{ type: 'endPhase' }];

  const ghoulRegions = state.board.regions.filter(
    (r) => r.owner === state.activePlayerIndex && r.isDeclined,
  );

  const reachable = buildReachableSet(
    state,
    ghoulRegions.map((r) => r.id),
    /* isFirst= */ ghoulRegions.length === 0,
    /* ignoreAdjacency= */ false,
    /* firstConquestAnywhere= */ false,
    /* underworldAreAdjacent= */ false,
  );

  const actions: GameAction[] = [{ type: 'endPhase' }];
  for (const region of state.board.regions) {
    if (!reachable.has(region.id)) continue;
    if (region.owner === state.activePlayerIndex && region.isDeclined) continue;
    if (region.terrain === 'sea' || region.terrain === 'lake') continue;
    if (region.hasHoleInTheGround || region.hasHero || region.hasDragon) continue;
    const cost = ghoulConquestCost(region);
    if (player.availableTokens >= cost) {
      actions.push({ type: 'ghoulConquer', regionId: region.id });
    }
  }

  // Offer ghoul final conquest when tokens available and valid die targets exist
  if (player.availableTokens > 0) {
    const ghoulDieTargets = getGhoulFinalConquestTargets(state);
    if (ghoulDieTargets.some((a) => a.type === 'ghoulUseReinforcement')) {
      actions.push({ type: 'startGhoulFinalConquest' });
    }
  }

  return actions;
}

// ── ghoulReinforcementDie ────────────────────────────────────────────────────
// Two-step phase (mirrors reinforcementDie):
//   Step 1 (die not rolled): Player selects target. Show regions conquerable with max die (3).
//   Step 2 (die rolled): Controller resolved — only endPhase remains.

function ghoulReinforcementDieActions(state: GameState): readonly GameAction[] {
  if (!state.reinforcementDie) {
    // Step 1: region selection before rolling
    return getGhoulFinalConquestTargets(state);
  }
  // Step 2: die already rolled, controller resolved.
  const { result, targetRegionId } = state.reinforcementDie;
  if (targetRegionId === null) return [{ type: 'endPhase' }];
  const region = state.board.regions.find((r) => r.id === targetRegionId);
  if (!region) return [{ type: 'endPhase' }];
  const player = state.players[state.activePlayerIndex];
  const cost = ghoulConquestCost(region);
  const actions: GameAction[] = [{ type: 'endPhase' }];
  if (player.availableTokens + result >= cost) {
    actions.unshift({ type: 'ghoulUseReinforcement', regionId: targetRegionId, dieResult: result });
  }
  return actions;
}

// ── ghoulRedeploy ────────────────────────────────────────────────────────────
// Redistribute declined Ghoul tokens across owned declined regions.

function ghoulRedeployActions(_state: GameState): GameAction[] {
  return [{ type: 'ghoulRedeploy', deployment: new Map() }, { type: 'endPhase' }];
}

// ── conquest ──────────────────────────────────────────────────────────────────

function conquestActions(state: GameState): GameAction[] {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return [{ type: 'endPhase' }];

  const mods = getActiveModifiers(player);
  const isFirst = player.activeRace.tokensOnBoard === 0;

  const ownActiveRegionIds = state.board.regions
    .filter((r) => r.owner === state.activePlayerIndex && !r.isDeclined)
    .map((r) => r.id);

  const reachable = buildReachableSet(
    state,
    ownActiveRegionIds,
    isFirst,
    mods.ignoreAdjacency,
    mods.firstConquestAnywhere,
    mods.underworldAreAdjacent,
  );

  // Berserk: die roll supplements every conquest attempt (max die = 3)
  // Player needs at least 1 token in hand to attempt Berserk conquest.
  const effectiveTokens = mods.berserkDie
    ? player.availableTokens + 3
    : player.availableTokens;
  const berserkAttempted = new Set(player.activeRace.berserkAttemptedRegions ?? []);

  const standardConquests: GameAction[] = [];
  const berserkFails: GameAction[] = [];
  for (const region of state.board.regions) {
    if (!reachable.has(region.id)) continue;
    // Own active region — cannot conquer
    if (region.owner === state.activePlayerIndex && !region.isDeclined) continue;
    // Seas/lakes blocked unless Seafaring
    if ((region.terrain === 'sea' || region.terrain === 'lake') && !mods.canConquerSeas) continue;
    // Protected regions
    if (region.hasHoleInTheGround) continue;
    if (region.hasHero) continue;
    if (region.hasDragon) continue;
    // Berserk: skip regions already attempted this turn
    if (mods.berserkDie && berserkAttempted.has(region.id)) continue;
    // Berserk: player must have at least 1 token to attempt
    if (mods.berserkDie && player.availableTokens < 1) continue;
    // Affordability (Berserk gets +3 potential from die)
    if (effectiveTokens < calculateConquestCost(state, region.id)) continue;

    standardConquests.push({ type: 'conquer', regionId: region.id });
    // Berserk: berserkFail is legal for any target the player might click
    if (mods.berserkDie) {
      berserkFails.push({ type: 'berserkFail', regionId: region.id });
    }
  }

  // Assemble base actions
  let actions: GameAction[] = [...standardConquests, ...berserkFails, { type: 'endPhase' }];

  // Offer final conquest when the player has tokens and valid die targets exist
  if (player.availableTokens > 0) {
    const finalTargets = getFinalConquestTargets(state);
    const hasTargets = finalTargets.some((a) => a.type === 'useReinforcement');
    if (hasTargets) {
      actions.push({ type: 'startFinalConquest' });
    }
  }

  // Apply custom race handler (e.g. Sorcerer convert)
  const raceHandler = RACE_HANDLERS[player.activeRace.raceId];
  if (raceHandler?.modifyLegalActions) {
    actions = raceHandler.modifyLegalActions(state, actions);
  }

  // Apply custom power handler (e.g. Dragon Master)
  const powerHandler = POWER_HANDLERS[player.activeRace.powerId];
  if (powerHandler?.modifyLegalActions) {
    actions = powerHandler.modifyLegalActions(state, actions);
  }

  return actions;
}

// ── reinforcementDie ──────────────────────────────────────────────────────────
// Two-step phase:
//   Step 1 (die not rolled): Player selects a target region. Show all regions
//     conquerable assuming max die (3). Controller rolls die on click.
//   Step 2 (die rolled): Controller has already resolved — only endPhase remains.

function reinforcementDieActions(state: GameState): readonly GameAction[] {
  if (!state.reinforcementDie) {
    // Step 1: region selection before rolling
    return getFinalConquestTargets(state);
  }
  // Step 2: die already rolled, controller resolved.
  // Include the target region as a legal useReinforcement action so the
  // controller's emitted action passes the legality check in applyAction.
  const { result, targetRegionId } = state.reinforcementDie;
  if (targetRegionId === null) return [{ type: 'endPhase' }];
  const player = state.players[state.activePlayerIndex];
  const cost = calculateConquestCost(state, targetRegionId);
  const actions: GameAction[] = [{ type: 'endPhase' }];
  if (player.availableTokens + result >= cost) {
    actions.unshift({ type: 'useReinforcement', regionId: targetRegionId, dieResult: result });
  }
  return actions;
}

// ── redeploy ──────────────────────────────────────────────────────────────────
// The full deployment map is submitted by the UI as a single action.
// We only signal that endPhase (= submit final deployment) is available.

function redeployActions(_state: GameState): GameAction[] {
  // A placeholder redeploy action — actionsMatch() for 'redeploy' returns true
  // for any Map, so this entry validates any deployment the player submits.
  return [{ type: 'redeploy', deployment: new Map() }, { type: 'endPhase' }];
}

// ── placeHeroes ────────────────────────────────────────────────────────────
// Heroic power: place 2 heroes on any 2 distinct owned active regions.

function placeHeroesActions(state: GameState): GameAction[] {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return [{ type: 'endPhase' }];

  const ownedActive = state.board.regions
    .filter((r) => r.owner === state.activePlayerIndex && !r.isDeclined)
    .map((r) => r.id);

  if (ownedActive.length < 2) return [{ type: 'endPhase' }];

  const actions: GameAction[] = [];
  for (let i = 0; i < ownedActive.length; i++) {
    for (let j = i + 1; j < ownedActive.length; j++) {
      actions.push({
        type: 'placeHeroes',
        regionIds: [ownedActive[i], ownedActive[j]] as [number, number],
      });
    }
  }
  actions.push({ type: 'endPhase' }); // skip hero placement
  return actions;
}

// ── Shared helpers ────────────────────────────────────────────────────────────

/**
 * A border region is at the edge of the board, or adjacent to a Sea/Lake
 * that is itself at the edge. Interior lake shores do NOT count.
 */
export function isBorderRegion(state: GameState, region: { isEdge: boolean; adjacentRegionIds: readonly number[] }): boolean {
  if (region.isEdge) return true;
  return region.adjacentRegionIds.some((adjId) => {
    const adj = state.board.regions.find((r) => r.id === adjId);
    return adj !== undefined && adj.isEdge && (adj.terrain === 'sea' || adj.terrain === 'lake');
  });
}

/**
 * Build the set of region IDs that are "reachable" for conquest given the
 * owned active region IDs and relevant modifier flags.
 */
function buildReachableSet(
  state: GameState,
  ownRegionIds: readonly number[],
  isFirst: boolean,
  ignoreAdjacency: boolean,
  firstConquestAnywhere: boolean,
  underworldAreAdjacent: boolean,
): Set<number> {
  const reachable = new Set<number>();

  if (ignoreAdjacency) {
    // Flying: every region on the board is reachable
    state.board.regions.forEach((r) => reachable.add(r.id));
    return reachable;
  }

  if (isFirst) {
    if (firstConquestAnywhere) {
      state.board.regions.forEach((r) => reachable.add(r.id));
    } else {
      // Default first conquest: border regions only
      state.board.regions
        .filter((r) => isBorderRegion(state, r))
        .forEach((r) => reachable.add(r.id));
    }
    return reachable;
  }

  // Subsequent conquests: regions adjacent to owned active regions
  const ownSet = new Set(ownRegionIds);
  for (const regionId of ownRegionIds) {
    const region = state.board.regions.find((r) => r.id === regionId);
    if (!region) continue;
    for (const adjId of region.adjacentRegionIds) {
      if (!ownSet.has(adjId)) reachable.add(adjId);
    }
  }

  // Underworld adjacency: all underworld regions are mutually adjacent
  if (underworldAreAdjacent) {
    const ownsUnderworld = ownRegionIds.some((id) => {
      const r = state.board.regions.find((region) => region.id === id);
      return r?.hasUnderworld ?? false;
    });
    if (ownsUnderworld) {
      state.board.regions
        .filter((r) => r.hasUnderworld && !ownSet.has(r.id))
        .forEach((r) => reachable.add(r.id));
    }
  }

  return reachable;
}
