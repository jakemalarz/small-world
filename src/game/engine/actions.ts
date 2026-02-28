import type {
  GameState, GameAction, PlayerState, RegionState, GameLogEntry,
} from '@/game/state/types';
import { getLegalActions } from '@/game/engine/legalActions';
import { applySelectCombo } from '@/game/engine/comboShop';
import { applyScoring } from '@/game/engine/scoring';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { ghoulConquestCost } from '@/game/engine/reinforcementDie';
import { getNextPhase, getStartingPhaseForNextPlayer } from '@/game/engine/phaseTransition';
import { getActiveModifiers } from '@/game/abilities/modifiers';
import { RACE_HANDLERS } from '@/game/abilities/raceAbilities';

// ── applyAction ───────────────────────────────────────────────────────────────
//
// The central state transition function. Validates that action is legal,
// applies it to produce a new immutable GameState, appends to the action log,
// and transitions the phase (including switching active player when a full
// turn completes).
//
// Throws if the action is illegal (caller should guard with getLegalActions).

export function applyAction(state: GameState, action: GameAction): GameState {
  // Validate legality — expensive but critical for correctness
  const legal = getLegalActions(state);
  if (!isLegalAction(action, legal)) {
    throw new Error(
      `Illegal action ${JSON.stringify(action)} in phase '${state.phase}'`,
    );
  }

  const logEntry: GameLogEntry = {
    turn: state.turn,
    playerIndex: state.activePlayerIndex,
    phase: state.phase,
    action,
  };

  switch (action.type) {
    case 'selectCombo':    return applySelectComboAction(state, action.comboIndex, logEntry);
    case 'pickUpTokens':   return applyPickUpTokens(state, action.regionId, action.count, logEntry);
    case 'conquer':        return applyConquer(state, action.regionId, action.dieResult, logEntry);
    case 'ghoulConquer':   return applyGhoulConquer(state, action.regionId, logEntry);
    case 'ghoulPickUpTokens': return applyGhoulPickUpTokens(state, action.regionId, action.count, logEntry);
    case 'ghoulReadyTroopsDeploy': return applyGhoulReadyTroopsDeploy(state, action.deployment, logEntry);
    case 'ghoulRedeploy':  return applyGhoulRedeploy(state, action.deployment, logEntry);
    case 'ghoulUseReinforcement': return applyGhoulUseReinforcement(state, action.regionId, action.dieResult, logEntry);
    case 'startGhoulFinalConquest': return applyStartGhoulFinalConquest(state, logEntry);
    case 'placeDragon':    return applyPlaceDragon(state, action.regionId, logEntry);
    case 'sorcererConvert':return applySorcererConvert(state, action.regionId, logEntry);
    case 'useReinforcement': return applyUseReinforcement(state, action.regionId, action.dieResult, logEntry);
    case 'readyTroopsDeploy': return applyReadyTroopsDeploy(state, action.deployment, logEntry);
    case 'redeploy':       return applyRedeploy(state, action.deployment, logEntry);
    case 'defenderRedeploy': return appendLog(state, logEntry); // handled implicitly
    case 'placeHeroes':    return applyPlaceHeroes(state, action.regionIds, logEntry);
    case 'placeEncampments': return applyPlaceEncampments(state, action.regionIds, logEntry);
    case 'startFinalConquest': return applyStartFinalConquest(state, logEntry);
    case 'berserkFail':    return applyBerserkFail(state, action.regionId, logEntry);
    case 'decline':        return applyDecline(state, logEntry);
    case 'endPhase':       return applyEndPhase(state, logEntry);
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

// ── selectCombo ───────────────────────────────────────────────────────────────

function applySelectComboAction(
  state: GameState, comboIndex: number, logEntry: GameLogEntry,
): GameState {
  // Delegate to comboShop which handles coin math, shop refresh, and token setup
  const next = applySelectCombo(state, comboIndex);
  // Transition phase (ghoulReadyTroops if ghouls in decline, else readyTroops)
  const nextPhase = getNextPhase(next, logEntry.action);
  // Replace log tail added by applySelectCombo to avoid double-entry
  const log = [...state.log, logEntry];
  let result = { ...next, phase: nextPhase, log };
  // Amazons: inject conquest-only tokens at the start of the combat turn.
  // On turn 1 the player goes directly to conquest (no tokens on board to gather).
  // On subsequent turns with Ghouls In Decline the tokens are stashed below and
  // restored after Ghoul phases so they're available for the Amazon combat turn.
  if (nextPhase === 'conquest' || nextPhase === 'ghoulReadyTroops') {
    result = addConquestOnlyTokens(result, result.activePlayerIndex);
  }
  // Stash active race tokens during Ghoul phases
  if (nextPhase === 'ghoulReadyTroops') {
    result = stashTokensForGhouls(result);
  }
  return result;
}

// ── Ghoul token stash/restore ─────────────────────────────────────────────────

/** Stash active race's availableTokens so Ghouls can use availableTokens. */
function stashTokensForGhouls(state: GameState): GameState {
  const player = state.players[state.activePlayerIndex];
  const reserve = player.ghoulTokensInReserve ?? 0;
  return {
    ...state,
    players: patchPlayer(state, state.activePlayerIndex, {
      ghoulSavedTokens: player.availableTokens,
      availableTokens: reserve, // Start with any tokens recovered from conquered Ghoul regions
      ghoulTokensInReserve: undefined, // Consumed
    }),
  };
}

/**
 * Add conquest-only tokens (e.g. Amazon +4) to the active player's hand.
 * Called when the player enters readyTroops or conquest so the tokens are
 * available for the full combat turn, not just during conquest itself.
 */
function addConquestOnlyTokens(state: GameState, playerIndex: 0 | 1): GameState {
  const player = state.players[playerIndex];
  if (!player.activeRace) return state;
  const mods = getActiveModifiers(player);
  if (mods.conquestOnlyTokens <= 0) return state;
  return {
    ...state,
    players: patchPlayer(state, playerIndex, {
      availableTokens: player.availableTokens + mods.conquestOnlyTokens,
      activeRace: {
        ...player.activeRace,
        totalTokens: player.activeRace.totalTokens + mods.conquestOnlyTokens,
      },
    }),
  };
}

/** Restore active race's availableTokens after Ghoul phases end. */
function restoreTokensFromGhouls(state: GameState): GameState {
  const player = state.players[state.activePlayerIndex];
  const savedTokens = player.ghoulSavedTokens ?? 0;
  return {
    ...state,
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: savedTokens,
      ghoulSavedTokens: undefined,
    }),
  };
}

// ── pickUpTokens ──────────────────────────────────────────────────────────────

function applyPickUpTokens(
  state: GameState, regionId: number, count: number, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  // Clamp to available tokens (allow picking up all — FR-13b abandon)
  const actualCount = Math.min(count, region.tokens);
  if (actualCount <= 0) return appendLog(state, logEntry);

  const player = state.players[state.activePlayerIndex];
  const race = player.activeRace!;
  const remaining = region.tokens - actualCount;

  // If all tokens removed, abandon the region (FR-13b)
  // Clear hasHoleInTheGround so Halfling holes disappear on abandon.
  const regionPatch: Partial<RegionState> = remaining === 0
    ? { tokens: 0, owner: null, hasHoleInTheGround: false }
    : { tokens: remaining };

  return {
    ...appendLog(state, logEntry),
    board: patchRegions(state, regionId, regionPatch),
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: player.availableTokens + actualCount,
      activeRace: { ...race, tokensOnBoard: race.tokensOnBoard - actualCount },
    }),
  };
}

// ── readyTroopsDeploy ─────────────────────────────────────────────────────
// Batch token gathering during readyTroops (FR-13a/b). The deployment map
// specifies the desired token count for each owned active region. Regions
// set to 0 are abandoned. Tokens removed are added to the player's hand.

function applyReadyTroopsDeploy(
  state: GameState,
  deployment: ReadonlyMap<number, number>,
  logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return appendLog(state, logEntry);

  const race = player.activeRace;
  let tokensPickedUp = 0;

  const newRegions = state.board.regions.map((region) => {
    if (region.owner !== state.activePlayerIndex || region.isDeclined) return region;
    const newCount = deployment.get(region.id);
    if (newCount === undefined) return region; // not in map = no change
    const diff = region.tokens - newCount;
    tokensPickedUp += diff;
    if (newCount === 0) {
      // Abandoned region: clear hole-in-the-ground (Halflings lose protection on abandon)
      return { ...region, tokens: 0, owner: null, hasHoleInTheGround: false };
    }
    return { ...region, tokens: Math.max(0, newCount) };
  });

  return appendLog({
    ...state,
    board: { regions: newRegions },
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: player.availableTokens + tokensPickedUp,
      activeRace: { ...race, tokensOnBoard: race.tokensOnBoard - tokensPickedUp },
    }),
  }, logEntry);
}

// ── conquer ───────────────────────────────────────────────────────────────────

function applyConquer(
  state: GameState, regionId: number, dieResult: 0 | 1 | 2 | 3 | undefined, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  const attacker = state.players[state.activePlayerIndex];
  const attackerRace = attacker.activeRace!;
  const cost = calculateConquestCost(state, regionId);

  // Was the region non-empty? (counts for Orcs/Skeletons/Pillaging scoring)
  const wasNonEmpty = region.tokens > 0 || region.hasLostTribe;

  // ── Defender resolution ──────────────────────────────────────────────────
  let s = state;
  if (region.owner !== null) {
    s = resolveDefender(s, region);
  }

  // ── Update conquered region ───────────────────────────────────────────────
  // Berserk: die reduces cost, but player still places at least 1 token.
  // Formula: max(1, cost - dieResult). Without dieResult: place exactly cost.
  const tokensPlaced = dieResult !== undefined
    ? Math.max(1, cost - dieResult)
    : cost;

  s = {
    ...s,
    board: patchRegions(s, regionId, {
      owner: s.activePlayerIndex,
      tokens: tokensPlaced,
      isDeclined: false,
      declinedRaceId: null,
      hasLostTribe: false,
      // Hero and Dragon protection ends when region changes hands
      hasHero: false,
      hasDragon: false,
    }),
  };

  // ── Update attacker tokens ────────────────────────────────────────────────
  const newConquests = attackerRace.conquestsThisTurn + (wasNonEmpty ? 1 : 0);
  s = {
    ...s,
    players: patchPlayer(s, s.activePlayerIndex, {
      availableTokens: attacker.availableTokens - tokensPlaced,
      activeRace: {
        ...attackerRace,
        tokensOnBoard: attackerRace.tokensOnBoard + tokensPlaced,
        conquestsThisTurn: newConquests,
      },
    }),
  };

  // ── Race-specific conquest hooks ──────────────────────────────────────────
  const raceHandler = RACE_HANDLERS[attackerRace.raceId];
  if (raceHandler?.onConquest) {
    s = raceHandler.onConquest(s, regionId);
  }

  return appendLog(s, logEntry);
}

/** Handle defender token casualties and returns. */
function resolveDefender(state: GameState, region: RegionState): GameState {
  const defenderIndex = region.owner!;
  const defender = state.players[defenderIndex];
  const defenderRace = region.isDeclined ? null : defender.activeRace;

  if (region.isDeclined) {
    if (region.declinedRaceId === 'ghouls') {
      // Ghoul In Decline tokens follow normal combat rules: 1 permanently discarded,
      // rest returned to the owner's reserve for use on their next Ghoul turn.
      const survivingGhouls = Math.max(0, region.tokens - 1);
      return {
        ...state,
        players: patchPlayer(state, defenderIndex, {
          ghoulTokensInReserve: (defender.ghoulTokensInReserve ?? 0) + survivingGhouls,
        }),
      };
    }
    // All other declined tokens are simply removed from play (no survivors)
    return state;
  }

  // Active race tokens: 1 discarded, rest return to hand (unless Elves)
  const defMods = getActiveModifiers(defender);
  const survivingTokens = defMods.noDefeatCasualties
    ? region.tokens      // Elves: no casualties
    : region.tokens - 1; // Normal: 1 token discarded

  const totalLost = region.tokens - survivingTokens;

  if (!defenderRace) return state;

  return {
    ...state,
    players: patchPlayer(state, defenderIndex, {
      availableTokens: defender.availableTokens + survivingTokens,
      activeRace: {
        ...defenderRace,
        tokensOnBoard: defenderRace.tokensOnBoard - region.tokens,
        totalTokens: defenderRace.totalTokens - totalLost,
      },
    }),
  };
}

// ── ghoulConquer ──────────────────────────────────────────────────────────────
// Ghouls In Decline conquer — same mechanics as conquer but uses declined tokens.
// Simplified: delegate to conquer logic since declined region tracking
// is not separately maintained for tokens.

function applyGhoulConquer(
  state: GameState, regionId: number, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  const cost = ghoulConquestCost(region);
  const player = state.players[state.activePlayerIndex];

  let s = state;
  if (region.owner !== null) {
    s = resolveDefender(s, region);
  }

  s = {
    ...s,
    board: patchRegions(s, regionId, {
      owner: s.activePlayerIndex,
      tokens: cost,
      isDeclined: true, // Ghouls conquer as declined tokens
      declinedRaceId: 'ghouls',
      hasLostTribe: false,
    }),
    players: patchPlayer(s, s.activePlayerIndex, {
      availableTokens: player.availableTokens - cost,
    }),
  };

  return appendLog(s, logEntry);
}

// ── ghoulPickUpTokens ────────────────────────────────────────────────────────
// Like pickUpTokens but for declined (Ghoul) regions.

function applyGhoulPickUpTokens(
  state: GameState, regionId: number, count: number, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  const actualCount = Math.min(count, region.tokens);
  if (actualCount <= 0) return appendLog(state, logEntry);

  const player = state.players[state.activePlayerIndex];
  const remaining = region.tokens - actualCount;

  const regionPatch: Partial<RegionState> = remaining === 0
    ? { tokens: 0, owner: null, isDeclined: false, declinedRaceId: null }
    : { tokens: remaining };

  return appendLog({
    ...state,
    board: patchRegions(state, regionId, regionPatch),
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: player.availableTokens + actualCount,
    }),
  }, logEntry);
}

// ── ghoulReadyTroopsDeploy ───────────────────────────────────────────────────
// Like readyTroopsDeploy but for declined (Ghoul) regions.

function applyGhoulReadyTroopsDeploy(
  state: GameState,
  deployment: ReadonlyMap<number, number>,
  logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  let tokensPickedUp = 0;

  const newRegions = state.board.regions.map((region) => {
    if (region.owner !== state.activePlayerIndex || !region.isDeclined) return region;
    const newCount = deployment.get(region.id);
    if (newCount === undefined) return region;
    const diff = region.tokens - newCount;
    tokensPickedUp += diff;
    if (newCount === 0) {
      return { ...region, tokens: 0, owner: null, isDeclined: false, declinedRaceId: null };
    }
    return { ...region, tokens: Math.max(0, newCount) };
  });

  return appendLog({
    ...state,
    board: { regions: newRegions },
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: player.availableTokens + tokensPickedUp,
    }),
  }, logEntry);
}

// ── ghoulRedeploy ────────────────────────────────────────────────────────────
// Like redeploy but for declined (Ghoul) regions. After completion, restores
// the active race's stashed tokens.

function applyGhoulRedeploy(
  state: GameState,
  deployment: ReadonlyMap<number, number>,
  logEntry: GameLogEntry,
): GameState {
  // Apply the deployment map to owned declined regions
  let newRegions = [...state.board.regions];
  let totalDeployed = 0;

  for (const region of newRegions) {
    if (region.owner !== state.activePlayerIndex || !region.isDeclined) continue;
    const count = deployment.get(region.id) ?? 1; // default 1 if not specified
    const idx = newRegions.indexOf(region);
    newRegions[idx] = { ...region, tokens: Math.max(1, count) };
    totalDeployed += Math.max(1, count);
  }

  // Remaining Ghoul tokens go back to box (no longer usable)
  return appendLog({
    ...state,
    board: { regions: newRegions },
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: 0, // Ghoul tokens not deployed are lost
    }),
  }, logEntry);
}

// ── placeDragon ───────────────────────────────────────────────────────────────

function applyPlaceDragon(
  state: GameState, regionId: number, logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return appendLog(state, logEntry);

  // Cost: 1 token. Dragon region becomes unconquerable until next turn.
  const s: GameState = {
    ...state,
    board: patchRegions(state, regionId, { hasDragon: true }),
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: player.availableTokens - 1,
      activeRace: {
        ...player.activeRace,
        tokensOnBoard: player.activeRace.tokensOnBoard + 1,
        dragonRegion: regionId,
      },
    }),
  };

  return appendLog(s, logEntry);
}

// ── sorcererConvert ───────────────────────────────────────────────────────────

function applySorcererConvert(
  state: GameState, regionId: number, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  if (region.owner === null || region.tokens !== 1) return appendLog(state, logEntry);

  const defenderIndex = region.owner;
  const defender = state.players[defenderIndex];
  const attacker = state.players[state.activePlayerIndex];
  if (!attacker.activeRace) return appendLog(state, logEntry);

  // Remove 1 token from defender, add it to attacker, take the region
  const defenderRace = defender.activeRace;
  let s = state;

  if (defenderRace) {
    s = {
      ...s,
      players: patchPlayer(s, defenderIndex, {
        activeRace: {
          ...defenderRace,
          tokensOnBoard: defenderRace.tokensOnBoard - 1,
          totalTokens: defenderRace.totalTokens - 1,
        },
      }),
    };
  }

  s = {
    ...s,
    board: patchRegions(s, regionId, {
      owner: s.activePlayerIndex,
      tokens: 1,
      isDeclined: false,
    }),
    players: patchPlayer(s, s.activePlayerIndex, {
      // Sorcerer spends 1 of their tokens to claim the region
      availableTokens: attacker.availableTokens - 1,
      activeRace: {
        ...attacker.activeRace,
        tokensOnBoard: attacker.activeRace.tokensOnBoard + 1,
        sorcererConversionsThisTurn: (attacker.activeRace.sorcererConversionsThisTurn ?? 0) + 1,
      },
    }),
  };

  return appendLog(s, logEntry);
}

// ── useReinforcement ──────────────────────────────────────────────────────────
//
// One final conquest attempt: dieResult supplements available tokens.
// Tokens placed = min(availableTokens, cost) — player may have fewer tokens
// than cost if the die made up the difference. Phase → redeploy either way.

function applyUseReinforcement(
  state: GameState, regionId: number, _dieResult: 0 | 1 | 2 | 3, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return appendLog(state, logEntry);

  const cost = calculateConquestCost(state, regionId);

  // Resolve defender (same as normal conquest)
  let s = state;
  if (region.owner !== null) {
    s = resolveDefender(s, region);
  }

  // Place min(available, cost) tokens — die covers any shortfall
  const tokensPlaced = Math.min(player.availableTokens, cost);
  const wasNonEmpty = region.tokens > 0 || region.hasLostTribe;

  s = {
    ...s,
    board: patchRegions(s, regionId, {
      owner: s.activePlayerIndex,
      tokens: tokensPlaced,
      isDeclined: false,
      hasLostTribe: false,
      hasHero: false,
      hasDragon: false,
    }),
    players: patchPlayer(s, s.activePlayerIndex, {
      availableTokens: player.availableTokens - tokensPlaced,
      activeRace: {
        ...player.activeRace,
        tokensOnBoard: player.activeRace.tokensOnBoard + tokensPlaced,
        conquestsThisTurn: player.activeRace.conquestsThisTurn + (wasNonEmpty ? 1 : 0),
      },
    }),
  };

  // Skeletons: grant tokens earned from conquests at the start of redeployment
  s = addSkeletonTokensForRedeploy(s);

  const nextPhase = getNextPhase(s, logEntry.action);
  return appendLog({ ...s, phase: nextPhase }, logEntry);
}

// ── redeploy ──────────────────────────────────────────────────────────────────

function applyRedeploy(
  state: GameState,
  deployment: ReadonlyMap<number, number>,
  logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return applyEndPhase(state, logEntry);

  // Apply the deployment map to owned active regions
  let newRegions = [...state.board.regions];
  let totalDeployed = 0;

  for (const region of newRegions) {
    if (region.owner !== state.activePlayerIndex || region.isDeclined) continue;
    const count = deployment.get(region.id) ?? 1; // default 1 if not specified
    const idx = newRegions.indexOf(region);
    newRegions[idx] = { ...region, tokens: Math.max(1, count) };
    totalDeployed += Math.max(1, count);
  }

  // Tokens not deployed are returned to hand (extra go back to box in score phase)
  const race = player.activeRace;
  const totalTokens = race.tokensOnBoard + player.availableTokens;
  const remaining = totalTokens - totalDeployed;

  let s: GameState = {
    ...state,
    board: { regions: newRegions },
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: Math.max(0, remaining),
      activeRace: { ...race, tokensOnBoard: totalDeployed },
    }),
  };

  // Amazons: remove conquestOnlyTokens from the board after redeployment.
  // The tokens are removed from regions (largest stacks first, leaving min 1).
  const redeployedPlayer = s.players[s.activePlayerIndex];
  const redeployedRace = redeployedPlayer.activeRace!;
  const redeployMods = getActiveModifiers(redeployedPlayer);
  if (redeployMods.conquestOnlyTokens > 0) {
    let tokensToRemove = redeployMods.conquestOnlyTokens;
    // Build list of active owned regions sorted by descending token count
    const ownedActive = s.board.regions
      .filter((r) => r.owner === s.activePlayerIndex && !r.isDeclined)
      .sort((a, b) => b.tokens - a.tokens);
    const removals = new Map<number, number>(); // regionId → tokens to remove
    for (const region of ownedActive) {
      if (tokensToRemove <= 0) break;
      const removable = region.tokens - 1; // must leave at least 1
      if (removable <= 0) continue;
      const take = Math.min(removable, tokensToRemove);
      removals.set(region.id, take);
      tokensToRemove -= take;
    }
    // Apply removals to board
    const afterRemoval = s.board.regions.map((r) => {
      const rem = removals.get(r.id);
      return rem ? { ...r, tokens: r.tokens - rem } : r;
    });
    const totalRemoved = redeployMods.conquestOnlyTokens - tokensToRemove;
    s = {
      ...s,
      board: { regions: afterRemoval },
      players: patchPlayer(s, s.activePlayerIndex, {
        activeRace: {
          ...redeployedRace,
          tokensOnBoard: redeployedRace.tokensOnBoard - totalRemoved,
          totalTokens: redeployedRace.totalTokens - totalRemoved,
        },
      }),
    };
  }

  const nextPhase = getNextPhase(s, logEntry.action);
  return appendLog({ ...s, phase: nextPhase }, logEntry);
}

// ── placeHeroes ───────────────────────────────────────────────────────────────

function applyPlaceHeroes(
  state: GameState,
  regionIds: readonly [number, number],
  logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return appendLog(state, logEntry);

  let s = state;

  // Clear any existing hero markers first
  if (player.activeRace.heroRegions) {
    for (const id of player.activeRace.heroRegions) {
      s = { ...s, board: patchRegions(s, id, { hasHero: false }) };
    }
  }

  // Place new heroes
  for (const id of regionIds) {
    s = { ...s, board: patchRegions(s, id, { hasHero: true }) };
  }
  s = {
    ...s,
    players: patchPlayer(s, s.activePlayerIndex, {
      activeRace: { ...player.activeRace, heroRegions: regionIds },
    }),
  };

  // Transition to score phase
  const nextPhase = getNextPhase(s, logEntry.action);
  return appendLog({ ...s, phase: nextPhase }, logEntry);
}

// ── placeEncampments ──────────────────────────────────────────────────────────

function applyPlaceEncampments(
  state: GameState,
  regionIds: readonly number[],
  logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return appendLog(state, logEntry);

  let s = state;
  // Clear existing encampments first
  s = {
    ...s,
    board: {
      regions: s.board.regions.map((r) =>
        r.owner === s.activePlayerIndex ? { ...r, hasEncampment: false } : r,
      ),
    },
  };
  // Place new encampments
  for (const id of regionIds) {
    s = { ...s, board: patchRegions(s, id, { hasEncampment: true }) };
  }
  s = {
    ...s,
    players: patchPlayer(s, s.activePlayerIndex, {
      activeRace: { ...player.activeRace, encampmentRegions: regionIds },
    }),
  };

  return appendLog(s, logEntry);
}

// ── selectDiplomatAlly ────────────────────────────────────────────────────────



// ── startFinalConquest ────────────────────────────────────────────────────────
// Simple phase transition: conquest → reinforcementDie.

function applyStartFinalConquest(state: GameState, logEntry: GameLogEntry): GameState {
  const nextPhase = getNextPhase(state, logEntry.action);
  return appendLog({ ...state, phase: nextPhase }, logEntry);
}

// ── startGhoulFinalConquest ──────────────────────────────────────────────────
// Simple phase transition: ghoulConquest → ghoulReinforcementDie.

function applyStartGhoulFinalConquest(state: GameState, logEntry: GameLogEntry): GameState {
  const nextPhase = getNextPhase(state, logEntry.action);
  return appendLog({ ...state, phase: nextPhase }, logEntry);
}

// ── berserkFail ───────────────────────────────────────────────────────────────
// Record a failed Berserk conquest attempt so the region cannot be tried again this turn.

function applyBerserkFail(
  state: GameState, regionId: number, logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  const race = player.activeRace;
  if (!race) return appendLog(state, logEntry);

  const existing = race.berserkAttemptedRegions ?? [];
  return appendLog({
    ...state,
    players: patchPlayer(state, state.activePlayerIndex, {
      activeRace: {
        ...race,
        berserkAttemptedRegions: [...existing, regionId],
      },
    }),
  }, logEntry);
}

// ── ghoulUseReinforcement ────────────────────────────────────────────────────
// Like applyGhoulConquer but places min(available, cost) tokens — die covers shortfall.

function applyGhoulUseReinforcement(
  state: GameState, regionId: number, _dieResult: 0 | 1 | 2 | 3, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  const cost = ghoulConquestCost(region);
  const player = state.players[state.activePlayerIndex];

  let s = state;
  if (region.owner !== null) {
    s = resolveDefender(s, region);
  }

  // Place min(available, cost) tokens — die covers any shortfall
  const tokensPlaced = Math.min(player.availableTokens, cost);

  s = {
    ...s,
    board: patchRegions(s, regionId, {
      owner: s.activePlayerIndex,
      tokens: tokensPlaced,
      isDeclined: true, // Ghouls conquer as declined tokens
      declinedRaceId: 'ghouls',
      hasLostTribe: false,
      hasHero: false,
      hasDragon: false,
    }),
    players: patchPlayer(s, s.activePlayerIndex, {
      availableTokens: player.availableTokens - tokensPlaced,
    }),
  };

  const nextPhase = getNextPhase(s, logEntry.action);
  return appendLog({ ...s, phase: nextPhase }, logEntry);
}

// ── decline ───────────────────────────────────────────────────────────────────
// The player's active race goes Into Decline:
//   • Each owned active region → isDeclined = true, tokens = 1
//   • activeRace → declinedRaces (old decline cleared unless Spirit survives)
//   • availableTokens → 0

function applyDecline(state: GameState, logEntry: GameLogEntry): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return appendLog(state, logEntry);

  const race = player.activeRace;
  const mods = getActiveModifiers(player);

  // Reduce each active region to 1 token and mark as declined.
  // Bivouacking encampments disappear when going In Decline.
  // Heroic heroes disappear when going In Decline.
  // Seafaring: sea/lake regions are kept In Decline (per rulebook).
  //   Non-Seafaring races can never own sea/lake regions, so no special
  //   exclusion needed — just leave them as declined normally.
  //
  // Clear board regions belonging to previous declined races (e.g. Ghouls — FR-24).
  const newRegions = state.board.regions.map((r) => {
    if (r.owner !== state.activePlayerIndex) return r;
    if (r.isDeclined) {
      // Previous declined region → remove from board
      return { ...r, tokens: 0, owner: null as 0 | 1 | null, isDeclined: false, declinedRaceId: null };
    }
    // Active region → mark as declined
    const declineTokens = mods.keepAllTokensInDecline ? r.tokens : 1;
    return { ...r, tokens: declineTokens, isDeclined: true, declinedRaceId: race.raceId, hasEncampment: false, hasHero: false, hasHoleInTheGround: false };
  });

  // The new declined race entry (replaces any previous)
  const newDeclinedRaces = [{
    raceId: race.raceId,
    powerId: race.powerId,
  }];

  let s: GameState = {
    ...state,
    board: { regions: newRegions },
    players: patchPlayer(state, state.activePlayerIndex, {
      activeRace: null,
      availableTokens: 0,
      declinedRaces: newDeclinedRaces,
    }),
  };

  const nextPhase = getNextPhase(s, logEntry.action);

  // optionalDecline + decline: applyEndPhase is NOT called, so we must
  // switch the active player here directly (it won't go through score phase).
  if (state.phase === 'optionalDecline') {
    const nextPlayerIndex: 0 | 1 = s.activePlayerIndex === 0 ? 1 : 0;
    const isNewRound = nextPlayerIndex === s.firstPlayerIndex;
    const newTurn = isNewRound && nextPhase !== 'gameOver' ? s.turn + 1 : s.turn;
    const newRound = isNewRound && nextPhase !== 'gameOver' ? s.round + 1 : s.round;
    let switched: GameState = {
      ...s,
      phase: nextPhase,
      activePlayerIndex: nextPlayerIndex,
      turn: newTurn,
      round: newRound,
      reinforcementDie: null,
    };
    if (nextPhase === 'readyTroops' || nextPhase === 'ghoulReadyTroops') {
      switched = addConquestOnlyTokens(switched, nextPlayerIndex);
    }
    if (nextPhase === 'ghoulReadyTroops') {
      switched = stashTokensForGhouls(switched);
    }
    return appendLog(switched, logEntry);
  }

  return appendLog({ ...s, phase: nextPhase }, logEntry);
}

// ── endPhase ──────────────────────────────────────────────────────────────────

function applyEndPhase(state: GameState, logEntry: GameLogEntry): GameState {
  const nextPhase = getNextPhase(state, logEntry.action);

  // Score phase is applied here (coins transferred to player)
  let scored = state.phase === 'score' ? applyScoring(state) : state;

  // Restore active race tokens when leaving ghoulRedeploy
  if (state.phase === 'ghoulRedeploy') {
    scored = restoreTokensFromGhouls(scored);
  }

  // Skeletons: grant tokens earned from conquests at the start of redeployment
  if (state.phase === 'conquest') {
    scored = addSkeletonTokensForRedeploy(scored);
  }

  // Determine if we switch to the next player
  if (!needsPlayerSwitch(state, logEntry.action)) {
    return appendLog({ ...scored, phase: nextPhase }, logEntry);
  }

  // ── Player switch ─────────────────────────────────────────────────────────
  const nextPlayerIndex: 0 | 1 = scored.activePlayerIndex === 0 ? 1 : 0;
  const isNewRound = nextPlayerIndex === scored.firstPlayerIndex;

  // Reset active player's conquestsThisTurn for next turn
  const activePlayer = scored.players[scored.activePlayerIndex];
  let resetState = scored;
  if (activePlayer.activeRace) {
    // Clear hero markers from the board (heroes are re-placed each turn)
    if (activePlayer.activeRace.heroRegions) {
      const heroIds = new Set(activePlayer.activeRace.heroRegions);
      resetState = {
        ...resetState,
        board: {
          regions: resetState.board.regions.map((r) =>
            heroIds.has(r.id) ? { ...r, hasHero: false } : r,
          ),
        },
      };
    }
    // Clear dragon marker from the board
    if (activePlayer.activeRace.dragonRegion != null) {
      resetState = {
        ...resetState,
        board: patchRegions(resetState, activePlayer.activeRace.dragonRegion, { hasDragon: false }),
      };
    }
    resetState = {
      ...resetState,
      players: patchPlayer(resetState, resetState.activePlayerIndex, {
        activeRace: {
          ...activePlayer.activeRace,
          conquestsThisTurn: 0,
          hasDeclinedThisTurn: false,
          sorcererConversionsThisTurn: 0,
          dragonRegion: undefined,
          heroRegions: undefined,
          berserkAttemptedRegions: undefined,
        },
      }),
    };
  }

  const newTurn = isNewRound && nextPhase !== 'gameOver'
    ? resetState.turn + 1
    : resetState.turn;
  const newRound = isNewRound && nextPhase !== 'gameOver'
    ? resetState.round + 1
    : resetState.round;

  let switchedState: GameState = {
    ...resetState,
    phase: nextPhase,
    activePlayerIndex: nextPlayerIndex,
    turn: newTurn,
    round: newRound,
    reinforcementDie: null,
  };

  // Amazons: inject conquest-only tokens at the start of the combat turn.
  // Injection happens before stashing so they're preserved through Ghoul phases.
  if (nextPhase === 'readyTroops' || nextPhase === 'ghoulReadyTroops') {
    switchedState = addConquestOnlyTokens(switchedState, nextPlayerIndex);
  }

  // Stash tokens if next player starts with Ghoul phases
  if (nextPhase === 'ghoulReadyTroops') {
    switchedState = stashTokensForGhouls(switchedState);
  }

  return appendLog(switchedState, logEntry);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true if submitting this action in the current state requires a player switch. */
function needsPlayerSwitch(state: GameState, action: GameAction): boolean {
  if (state.phase === 'score' && action.type === 'endPhase') {
    // Stout power offers optional decline — not switching yet
    const player = state.players[state.activePlayerIndex];
    const hasStoutOption = player.activeRace?.powerId === 'stout' &&
      !player.activeRace.hasDeclinedThisTurn;
    return !hasStoutOption;
  }
  if (state.phase === 'optionalDecline') {
    return action.type === 'decline' || action.type === 'endPhase';
  }
  return false;
}

function getRegion(state: GameState, id: number): RegionState {
  const r = state.board.regions.find((region) => region.id === id);
  if (!r) throw new Error(`Unknown region id: ${id}`);
  return r;
}

function patchRegions(
  state: GameState, id: number, patch: Partial<RegionState>,
): typeof state.board {
  return {
    regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  };
}

/**
 * Grant Skeleton (tokenGenerator) tokens earned from conquests this turn.
 * Called when transitioning from conquest to redeploy so tokens are available
 * for deployment but cannot be used for additional conquests.
 */
function addSkeletonTokensForRedeploy(state: GameState): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return state;

  const mods = getActiveModifiers(player);
  if (mods.tokenGenerators.length === 0) return state;

  let s = state;
  const conquests = player.activeRace.conquestsThisTurn;

  for (const gen of mods.tokenGenerators) {
    const tokensToGrant =
      Math.floor(conquests / gen.nonEmptyConquestsRequired) * gen.tokensGained;
    if (tokensToGrant <= 0) continue;

    const p = s.players[s.activePlayerIndex];
    const race = p.activeRace!;
    const extraTokens = Math.min(tokensToGrant, race.maxSupply - race.totalTokens);
    if (extraTokens <= 0) continue;

    s = {
      ...s,
      players: patchPlayer(s, s.activePlayerIndex, {
        availableTokens: p.availableTokens + extraTokens,
        activeRace: {
          ...race,
          totalTokens: race.totalTokens + extraTokens,
        },
      }),
    };
  }

  return s;
}

function patchPlayer(
  state: GameState, playerIndex: 0 | 1, patch: Partial<PlayerState>,
): typeof state.players {
  return state.players.map((p, i) =>
    i === playerIndex ? { ...p, ...patch } : p,
  ) as unknown as typeof state.players;
}

function appendLog(state: GameState, logEntry: GameLogEntry): GameState {
  return { ...state, log: [...state.log, logEntry] };
}

/** Check if a given action appears in the legal action list. */
function isLegalAction(
  action: GameAction, legal: readonly GameAction[],
): boolean {
  return legal.some((la) => actionsMatch(la, action));
}

function actionsMatch(a: GameAction, b: GameAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'selectCombo':   return (b as typeof a).comboIndex === a.comboIndex;
    case 'pickUpTokens':  return (b as typeof a).regionId === a.regionId;
    case 'conquer':       return (b as typeof a).regionId === a.regionId &&
                            ((b as typeof a).dieResult === undefined || a.dieResult === undefined ||
                             (b as typeof a).dieResult === a.dieResult);
    case 'ghoulConquer':  return (b as typeof a).regionId === a.regionId;
    case 'ghoulPickUpTokens': return (b as typeof a).regionId === a.regionId;
    case 'ghoulReadyTroopsDeploy': return true; // validated by phase
    case 'ghoulRedeploy': return true; // validated by phase
    case 'ghoulUseReinforcement': return (b as typeof a).regionId === a.regionId;
    case 'startGhoulFinalConquest': return true;
    case 'placeDragon':   return (b as typeof a).regionId === a.regionId;
    case 'sorcererConvert': return (b as typeof a).regionId === a.regionId;
    case 'useReinforcement': return (b as typeof a).regionId === a.regionId;
    case 'placeHeroes':   {
      const ba = b as typeof a;
      return ba.regionIds[0] === a.regionIds[0] && ba.regionIds[1] === a.regionIds[1];
    }
    case 'placeEncampments': return true; // validated by phase
    case 'selectDiplomatAlly': return (b as typeof a).playerIndex === a.playerIndex;
    case 'readyTroopsDeploy': return true; // validated by phase
    case 'redeploy':      return true; // validated by phase
    case 'defenderRedeploy': return true;
    case 'startFinalConquest': return true;
    case 'berserkFail':   return (b as typeof a).regionId === a.regionId;
    case 'decline':       return true;
    case 'endPhase':      return true;
    default: return false;
  }
}

// Re-export getStartingPhaseForNextPlayer so GameController can use it
export { getStartingPhaseForNextPlayer };
