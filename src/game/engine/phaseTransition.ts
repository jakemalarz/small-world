import type { GameState, TurnPhase, GameAction, PlayerState } from '@/game/state/types';

/**
 * Computes the next TurnPhase given the current state and the action that
 * just completed. Pure function — no side effects, no state mutation.
 *
 * State mutation (incrementing turn counter, switching active player) is
 * handled by applyAction(); this function only determines the *phase*.
 */
export function getNextPhase(state: GameState, completedAction: GameAction): TurnPhase {
  switch (state.phase) {
    case 'selectCombo':
      // Shop exhausted — skip to readyTroops (or ghoulConquest)
      if (completedAction.type === 'endPhase') {
        return hasGhoulsInDecline(state.players[state.activePlayerIndex])
          ? 'ghoulConquest'
          : nextAfterCombo(state);
      }
      // After picking a combo, Ghoul In-Decline tokens act before the active race
      return hasGhoulsInDecline(state.players[state.activePlayerIndex])
        ? 'ghoulConquest'
        : nextAfterCombo(state);

    case 'ghoulConquest':
      // Player explicitly ends the ghoul conquest phase
      if (completedAction.type === 'endPhase') return nextAfterCombo(state);
      return 'ghoulConquest';

    case 'readyTroops':
      // Decline from readyTroops applies immediately → skip to scoring
      if (completedAction.type === 'decline') return 'score';
      if (completedAction.type === 'endPhase') return 'conquest';
      return 'readyTroops';

    case 'conquest':
      if (completedAction.type === 'decline') return 'decline';
      if (completedAction.type === 'startFinalConquest') return 'reinforcementDie';
      if (completedAction.type === 'endPhase') return 'redeploy';
      return 'conquest';

    case 'reinforcementDie':
      // Die always ends the conquest phase — success or failure
      return 'redeploy';

    case 'redeploy':
      if (completedAction.type === 'endPhase') return nextAfterRedeploy(state);
      return 'redeploy';

    case 'placeHeroes':
      return 'score';

    case 'score':
      if (completedAction.type === 'endPhase') {
        // Stout: offer optional decline after a conquest turn
        // (activeRace is non-null iff the player just finished conquering,
        //  because a decline turn moves activeRace → declinedRaces)
        if (canDeclineWithStout(state)) return 'optionalDecline';
        return advanceTurn(state);
      }
      return 'score';

    case 'optionalDecline':
      if (completedAction.type === 'decline') return advanceTurn(state);
      if (completedAction.type === 'endPhase') return advanceTurn(state);
      return 'optionalDecline';

    case 'decline':
      // Score immediately after declining
      return 'score';

    case 'gameOver':
      return 'gameOver';

    default: {
      // Exhaustive check — TypeScript will error if a phase is unhandled
      const _exhaustive: never = state.phase;
      return _exhaustive;
    }
  }
}

/**
 * Determines the starting phase for the next player's turn.
 * Also handles game-over detection (after both players complete turn 10).
 *
 * NOTE: applyAction() is responsible for actually updating
 * activePlayerIndex, turn, and round in the state. This function
 * only computes the *phase* the next player should start in.
 */
export function getStartingPhaseForNextPlayer(state: GameState): TurnPhase {
  const nextPlayerIndex: 0 | 1 = state.activePlayerIndex === 0 ? 1 : 0;

  // A new game round begins when the next player is the first player
  // (i.e., one full round — both players — has just completed)
  const isNewRound = nextPlayerIndex === state.firstPlayerIndex;

  if (isNewRound && state.turn >= 10) {
    return 'gameOver';
  }

  const nextPlayer = state.players[nextPlayerIndex];

  if (nextPlayer.activeRace === null) {
    return 'selectCombo';
  }

  return hasGhoulsInDecline(nextPlayer) ? 'ghoulConquest' : 'readyTroops';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Skip readyTroops on turn 1 (no tokens on board to pick up). */
function nextAfterCombo(state: GameState): TurnPhase {
  const player = state.players[state.activePlayerIndex];
  const hasTokensOnBoard = player.activeRace !== null && player.activeRace.tokensOnBoard > 0;
  return hasTokensOnBoard ? 'readyTroops' : 'conquest';
}

function hasGhoulsInDecline(player: PlayerState): boolean {
  return player.declinedRaces.some((r) => r.raceId === 'ghouls');
}

/** After redeployment, go to placeHeroes if Heroic, otherwise score. */
function nextAfterRedeploy(state: GameState): TurnPhase {
  const player = state.players[state.activePlayerIndex];
  if (player.activeRace?.powerId === 'heroic') {
    // Need at least 2 owned active regions to place heroes
    const ownedActive = state.board.regions.filter(
      (r) => r.owner === state.activePlayerIndex && !r.isDeclined,
    );
    if (ownedActive.length >= 2) return 'placeHeroes';
  }
  return 'score';
}

function canDeclineWithStout(state: GameState): boolean {
  const player = state.players[state.activePlayerIndex];
  // activeRace is non-null only if the player finished a conquest turn
  // (a decline turn moves activeRace to declinedRaces, making it null)
  return player.activeRace?.powerId === 'stout' &&
    !player.activeRace.hasDeclinedThisTurn;
}

function advanceTurn(state: GameState): TurnPhase {
  return getStartingPhaseForNextPlayer(state);
}
