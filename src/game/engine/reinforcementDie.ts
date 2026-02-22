import type { GameState, GameAction } from '@/game/state/types';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { getActiveModifiers } from '@/game/abilities/modifiers';
import { isBorderRegion } from '@/game/engine/legalActions';

// ── Reinforcement Die ─────────────────────────────────────────────────────────
//
// After the active player ends conquest with at least 1 token remaining,
// they may attempt ONE more conquest using their tokens + a die result.
//
// Die sides (uniform): [0, 0, 0, 1, 2, 3]  — expected value = 1.
// On success (tokens + die ≥ conquest cost): normal conquest.
// On failure: tokens are kept in hand for redeployment. No more conquests.
// Die phase always ends conquest regardless of result.

const DIE_SIDES: readonly (0 | 1 | 2 | 3)[] = [0, 0, 0, 1, 2, 3];

/** Roll the reinforcement die. Returns one of: 0, 0, 0, 1, 2, 3 (uniform). */
export function rollReinforcementDie(): 0 | 1 | 2 | 3 {
  return DIE_SIDES[Math.floor(Math.random() * DIE_SIDES.length)];
}

/**
 * Returns all regions the active player could potentially conquer with a
 * final conquest attempt, assuming the maximum die roll (3).
 *
 * Used during step 1 of the reinforcement phase (before the die is rolled)
 * to highlight valid target regions for the player to select.
 */
export function getFinalConquestTargets(state: GameState): readonly GameAction[] {
  return getLegalReinforcementTargets(state, 3);
}

/**
 * Returns all valid conquest targets the active player can attempt with
 * their current available tokens boosted by `dieResult` extra tokens.
 *
 * The returned actions are `conquer` (not `useReinforcement`); the caller
 * should swap to useReinforcement when wiring to the HumanPlayer event bus.
 */
export function getLegalReinforcementTargets(
  state: GameState,
  dieResult: 0 | 1 | 2 | 3,
): readonly GameAction[] {
  const player = state.players[state.activePlayerIndex];
  if (!player.activeRace) return [{ type: 'endPhase' }];

  const mods = getActiveModifiers(player);
  const effectiveTokens = player.availableTokens + dieResult;
  const isFirst = player.activeRace.tokensOnBoard === 0;

  const ownActiveRegionIds = new Set(
    state.board.regions
      .filter((r) => r.owner === state.activePlayerIndex && !r.isDeclined)
      .map((r) => r.id),
  );

  const targets: GameAction[] = [];

  for (const region of state.board.regions) {
    // Reachability (same rules as conquest phase)
    if (!isFirst && !mods.ignoreAdjacency) {
      const isAdjacent = region.adjacentRegionIds.some((id) => ownActiveRegionIds.has(id));
      if (!isAdjacent) continue;
    }
    if (isFirst && !mods.firstConquestAnywhere && !mods.ignoreAdjacency) {
      if (!isBorderRegion(state, region)) continue;
    }

    // Can't conquer own active regions
    if (region.owner === state.activePlayerIndex && !region.isDeclined) continue;
    // Seas/lakes without Seafaring
    if ((region.terrain === 'sea' || region.terrain === 'lake') && !mods.canConquerSeas) continue;
    // Protected
    if (region.hasHoleInTheGround || region.hasHero || region.hasDragon) continue;

    const cost = calculateConquestCost(state, region.id);
    if (effectiveTokens >= cost) {
      targets.push({ type: 'useReinforcement', regionId: region.id, dieResult });
    }
  }

  return targets.length > 0
    ? [...targets, { type: 'endPhase' }]
    : [{ type: 'endPhase' }];
}
