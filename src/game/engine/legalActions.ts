import type { GameState, GameAction } from '@/game/state/types';
import { getActiveModifiers } from '@/game/abilities/modifiers';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { getLegalReinforcementTargets } from '@/game/engine/reinforcementDie';
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
//   First conquest  → target must be an edge OR coastal region
//                     (unless Flying → any non-sea/lake; or Halflings → anywhere)
//   Subsequent     → target must be adjacent to an own active region
//                     (unless Flying → any non-sea/lake)
//                     Underworld: own cavern regions are also adjacent to all other caverns
//   Sea / Lake      → only conquerable by Seafaring
//   Protected       → hasHoleInTheGround, hasHero, hasDragon block all standard conquest
//   Cost            → player must have enough tokens in hand (availableTokens ≥ cost)

// ── Entry point ───────────────────────────────────────────────────────────────

export function getLegalActions(state: GameState): readonly GameAction[] {
  switch (state.phase) {
    case 'selectCombo':      return selectComboActions(state);
    case 'readyTroops':      return readyTroopsActions(state);
    case 'ghoulConquest':    return ghoulConquestActions(state);
    case 'conquest':         return conquestActions(state);
    case 'reinforcementDie': return reinforcementDieActions(state);
    case 'redeploy':         return redeployActions(state);
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
  return actions;
}

// ── readyTroops ───────────────────────────────────────────────────────────────
// Player may pick up tokens from any owned active region (leaving ≥ 1).
// pickUpTokens actions enumerate each eligible region with the maximum
// pickup count (all but 1). applyAction validates the actual count submitted.

function readyTroopsActions(state: GameState): GameAction[] {
  const actions: GameAction[] = [{ type: 'endPhase' }];
  for (const region of state.board.regions) {
    if (region.owner !== state.activePlayerIndex) continue;
    if (region.isDeclined) continue;
    if (region.tokens > 1) {
      actions.push({
        type: 'pickUpTokens',
        regionId: region.id,
        count: region.tokens - 1, // max pickup (leave 1 behind)
      });
    }
  }
  return actions;
}

// ── ghoulConquest ─────────────────────────────────────────────────────────────
// In-Decline Ghouls conquer using the same adjacency rules as normal conquest,
// but only using declined tokens (tracked in declinedRaces).
// Simplified: Ghouls can conquer any region adjacent to their current declined
// regions (or any edge/coastal if none yet), provided they have enough tokens.

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
    /* cavernsAreAdjacent= */ false,
  );

  const actions: GameAction[] = [{ type: 'endPhase' }];
  for (const region of state.board.regions) {
    if (!reachable.has(region.id)) continue;
    if (region.owner === state.activePlayerIndex && region.isDeclined) continue;
    if (region.terrain === 'sea' || region.terrain === 'lake') continue;
    if (region.hasHoleInTheGround || region.hasHero || region.hasDragon) continue;
    // Cost for Ghouls uses availableTokens from the player hand
    const cost = Math.max(2, region.tokens + (region.hasLostTribe ? 1 : 0) +
      (region.hasMountain ? 1 : 0) + (region.hasTrollLair ? 1 : 0) +
      (region.hasFortress ? 1 : 0) + (region.hasEncampment ? 1 : 0) + 1);
    if (player.availableTokens >= cost) {
      actions.push({ type: 'ghoulConquer', regionId: region.id });
    }
  }
  return actions;
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
    mods.cavernsAreAdjacent,
  );

  const standardConquests: GameAction[] = [];
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
    // Affordability
    if (player.availableTokens < calculateConquestCost(state, region.id)) continue;

    standardConquests.push({ type: 'conquer', regionId: region.id });
  }

  // Assemble base actions
  let actions: GameAction[] = [...standardConquests, { type: 'endPhase' }];

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
// Die result is on state.reinforcementDie. Player picks one more conquest
// target reachable with (availableTokens + dieResult) budget, or ends phase.

function reinforcementDieActions(state: GameState): readonly GameAction[] {
  const die = state.reinforcementDie;
  if (!die) return [{ type: 'endPhase' }];
  return getLegalReinforcementTargets(state, die.result);
}

// ── redeploy ──────────────────────────────────────────────────────────────────
// The full deployment map is submitted by the UI as a single action.
// We only signal that endPhase (= submit final deployment) is available.

function redeployActions(_state: GameState): GameAction[] {
  // A placeholder redeploy action — actionsMatch() for 'redeploy' returns true
  // for any Map, so this entry validates any deployment the player submits.
  return [{ type: 'redeploy', deployment: new Map() }, { type: 'endPhase' }];
}

// ── Shared helpers ────────────────────────────────────────────────────────────

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
  cavernsAreAdjacent: boolean,
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
      // Default first conquest: edge or coastal regions
      state.board.regions
        .filter((r) => r.isEdge || r.isCoastal)
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

  // Underworld cavern adjacency
  if (cavernsAreAdjacent) {
    const ownsCavern = ownRegionIds.some((id) => {
      const r = state.board.regions.find((region) => region.id === id);
      return r?.hasCavern ?? false;
    });
    if (ownsCavern) {
      state.board.regions
        .filter((r) => r.hasCavern && !ownSet.has(r.id))
        .forEach((r) => reachable.add(r.id));
    }
  }

  return reachable;
}
