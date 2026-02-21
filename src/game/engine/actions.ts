import type {
  GameState, GameAction, PlayerState, RegionState, GameLogEntry,
} from '@/game/state/types';
import { getLegalActions } from '@/game/engine/legalActions';
import { applySelectCombo } from '@/game/engine/comboShop';
import { applyScoring } from '@/game/engine/scoring';
import { calculateConquestCost } from '@/game/engine/conquestCost';
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
    case 'conquer':        return applyConquer(state, action.regionId, logEntry);
    case 'ghoulConquer':   return applyGhoulConquer(state, action.regionId, logEntry);
    case 'placeDragon':    return applyPlaceDragon(state, action.regionId, logEntry);
    case 'sorcererConvert':return applySorcererConvert(state, action.regionId, logEntry);
    case 'useReinforcement': return applyUseReinforcement(state, action.regionId, action.dieResult, logEntry);
    case 'redeploy':       return applyRedeploy(state, action.deployment, logEntry);
    case 'defenderRedeploy': return appendLog(state, logEntry); // handled implicitly
    case 'placeHeroes':    return applyPlaceHeroes(state, action.regionIds, logEntry);
    case 'placeEncampments': return applyPlaceEncampments(state, action.regionIds, logEntry);
    case 'selectDiplomatAlly': return applyDiplomatAlly(state, action.playerIndex, logEntry);
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
  // Transition phase (ghoulConquest if ghouls in decline, else readyTroops)
  const nextPhase = getNextPhase(next, logEntry.action);
  // Replace log tail added by applySelectCombo to avoid double-entry
  const log = [...state.log, logEntry];
  return { ...next, phase: nextPhase, log };
}

// ── pickUpTokens ──────────────────────────────────────────────────────────────

function applyPickUpTokens(
  state: GameState, regionId: number, count: number, logEntry: GameLogEntry,
): GameState {
  const region = getRegion(state, regionId);
  // Clamp: leave at least 1 token
  const actualCount = Math.min(count, region.tokens - 1);
  if (actualCount <= 0) return appendLog(state, logEntry);

  const player = state.players[state.activePlayerIndex];
  const race = player.activeRace!;

  return {
    ...appendLog(state, logEntry),
    board: patchRegions(state, regionId, { tokens: region.tokens - actualCount }),
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: player.availableTokens + actualCount,
      activeRace: { ...race, tokensOnBoard: race.tokensOnBoard - actualCount },
    }),
  };
}

// ── conquer ───────────────────────────────────────────────────────────────────

function applyConquer(
  state: GameState, regionId: number, logEntry: GameLogEntry,
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
  s = {
    ...s,
    board: patchRegions(s, regionId, {
      owner: s.activePlayerIndex,
      tokens: cost,
      isDeclined: false,
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
      availableTokens: attacker.availableTokens - cost,
      activeRace: {
        ...attackerRace,
        tokensOnBoard: attackerRace.tokensOnBoard + cost,
        conquestsThisTurn: newConquests,
      },
    }),
  };

  // ── Skeleton token generation ─────────────────────────────────────────────
  const mods = getActiveModifiers(s.players[s.activePlayerIndex]);
  for (const gen of mods.tokenGenerators) {
    if (newConquests > 0 && newConquests % gen.nonEmptyConquestsRequired === 0) {
      const updatedPlayer = s.players[s.activePlayerIndex];
      const updatedRace = updatedPlayer.activeRace!;
      const extraTokens = Math.min(
        gen.tokensGained,
        updatedRace.maxSupply - updatedRace.totalTokens,
      );
      if (extraTokens > 0) {
        s = {
          ...s,
          players: patchPlayer(s, s.activePlayerIndex, {
            availableTokens: updatedPlayer.availableTokens + extraTokens,
            activeRace: {
              ...updatedRace,
              totalTokens: updatedRace.totalTokens + extraTokens,
            },
          }),
        };
      }
    }
  }

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
    // Declined tokens are simply removed from play (no survivors, no redeploy)
    // Update the defender's activeRace.tokensOnBoard if they match the region's race
    // (Spirit power keeps declined races, but tokens are still lost)
    const updatedDeclined = defender.declinedRaces.map((dr) => {
      // We can't directly tie a declined race to specific regions here without
      // more state — just reduce tokensOnBoard tracking best-effort
      return dr;
    });
    // Declined tokens leave the game
    return {
      ...state,
      players: patchPlayer(state, defenderIndex, {
        declinedRaces: updatedDeclined,
      }),
    };
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
  // For now, treat like a regular conquer but attribute to declined Ghouls.
  // Full implementation deferred to Task 11 (Decline Mechanics).
  const region = getRegion(state, regionId);
  const cost = Math.max(2, region.tokens + (region.hasLostTribe ? 1 : 0) +
    (region.hasMountain ? 1 : 0) + (region.hasTrollLair ? 1 : 0) +
    (region.hasFortress ? 1 : 0) + (region.hasEncampment ? 1 : 0) + 1);

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
      hasLostTribe: false,
    }),
    players: patchPlayer(s, s.activePlayerIndex, {
      availableTokens: player.availableTokens - cost,
    }),
  };

  return appendLog(s, logEntry);
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
    reinforcementDie: null,
  };

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

  const s: GameState = {
    ...state,
    board: { regions: newRegions },
    players: patchPlayer(state, state.activePlayerIndex, {
      availableTokens: Math.max(0, remaining),
      activeRace: { ...race, tokensOnBoard: totalDeployed },
    }),
  };

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
  for (const id of regionIds) {
    s = { ...s, board: patchRegions(s, id, { hasHero: true }) };
  }
  s = {
    ...s,
    players: patchPlayer(s, s.activePlayerIndex, {
      activeRace: { ...player.activeRace, heroRegions: regionIds },
    }),
  };

  return appendLog(s, logEntry);
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

function applyDiplomatAlly(
  state: GameState,
  allyIndex: 0 | 1,
  logEntry: GameLogEntry,
): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return appendLog(state, logEntry);

  return appendLog({
    ...state,
    players: patchPlayer(state, state.activePlayerIndex, {
      activeRace: { ...player.activeRace, diplomatAlly: allyIndex },
    }),
  }, logEntry);
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

  // Reduce each active region to 1 token and mark as declined
  const newRegions = state.board.regions.map((r) => {
    if (r.owner !== state.activePlayerIndex || r.isDeclined) return r;
    // Ghouls keep all tokens in decline
    const declineTokens = mods.keepAllTokensInDecline ? r.tokens : 1;
    return { ...r, tokens: declineTokens, isDeclined: true };
  });

  // The new declined race entry
  const newDeclinedRace = {
    raceId: race.raceId,
    powerId: race.powerId,
    isSpirit: race.powerId === 'spirit',
  };

  // Determine which previous declined races survive
  // Spirit power: Spirit race survives alongside the new one (max 2 declined)
  const survivingDeclined = player.declinedRaces.filter((dr) => dr.isSpirit);
  const newDeclinedRaces = [...survivingDeclined, newDeclinedRace];

  let s: GameState = {
    ...state,
    board: { regions: newRegions },
    players: patchPlayer(state, state.activePlayerIndex, {
      activeRace: null,
      availableTokens: 0,
      declinedRaces: newDeclinedRaces,
    }),
  };

  // Transition phase
  const nextPhase = getNextPhase(s, logEntry.action);
  return appendLog({ ...s, phase: nextPhase }, logEntry);
}

// ── endPhase ──────────────────────────────────────────────────────────────────

function applyEndPhase(state: GameState, logEntry: GameLogEntry): GameState {
  const nextPhase = getNextPhase(state, logEntry.action);

  // Score phase is applied here (coins transferred to player)
  const scored = state.phase === 'score' ? applyScoring(state) : state;

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
    resetState = {
      ...resetState,
      players: patchPlayer(resetState, resetState.activePlayerIndex, {
        activeRace: {
          ...activePlayer.activeRace,
          conquestsThisTurn: 0,
          hasDeclinedThisTurn: false,
          dragonRegion: undefined,
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

  return appendLog({
    ...resetState,
    phase: nextPhase,
    activePlayerIndex: nextPlayerIndex,
    turn: newTurn,
    round: newRound,
  }, logEntry);
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
    case 'conquer':       return (b as typeof a).regionId === a.regionId;
    case 'ghoulConquer':  return (b as typeof a).regionId === a.regionId;
    case 'placeDragon':   return (b as typeof a).regionId === a.regionId;
    case 'sorcererConvert': return (b as typeof a).regionId === a.regionId;
    case 'useReinforcement': return (b as typeof a).regionId === a.regionId;
    case 'placeHeroes':   {
      const ba = b as typeof a;
      return ba.regionIds[0] === a.regionIds[0] && ba.regionIds[1] === a.regionIds[1];
    }
    case 'placeEncampments': return true; // validated by phase
    case 'selectDiplomatAlly': return (b as typeof a).playerIndex === a.playerIndex;
    case 'redeploy':      return true; // validated by phase
    case 'defenderRedeploy': return true;
    case 'decline':       return true;
    case 'endPhase':      return true;
    default: return false;
  }
}

// Re-export getStartingPhaseForNextPlayer so GameController can use it
export { getStartingPhaseForNextPlayer };
