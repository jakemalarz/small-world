import type { GameState } from '@/game/state/types';
import { getActiveModifiers } from '@/game/abilities/modifiers';

// ── Conquest Cost ─────────────────────────────────────────────────────────────
//
// Formula (per game rules):
//   cost = max(2, totalDefenseTokens + 1)
//   then apply ability modifiers (some reduce cost)
//   then enforce minimum of 1
//
// Defense tokens = region.tokens (enemy race) + hasLostTribe (+1) +
//   hasMountain (+1) + hasTrollLair (+1) + hasFortress (+1) + hasEncampment (+1)
//
// Modifiers (all from MergedModifiers, may be negative):
//   conquestCostFlat         — Commando: -1 on all conquests
//   terrainCostModifiers     — Mounted: -1 on farmland/hill
//   conquestCostCoastal      — Tritons: -1 on coastal regions
//   conquestCostCavern       — Underworld: -1 on cavern regions
//   conquestCostAdjacentOwnMountain — Giants: -1 if adjacent to own mountain

/**
 * Calculate how many tokens the active player must spend to conquer regionId.
 * Returns an integer >= 1.
 *
 * Does NOT validate whether the conquest is legal — call getLegalActions() for that.
 */
export function calculateConquestCost(state: GameState, regionId: number): number {
  const region = state.board.regions.find((r) => r.id === regionId);
  if (!region) throw new Error(`Unknown region id: ${regionId}`);

  // ── Defense tokens ─────────────────────────────────────────────────────────
  let defenseTokens = 0;
  defenseTokens += region.tokens;                     // enemy race tokens
  if (region.hasLostTribe)  defenseTokens += 1;
  if (region.hasMountain)   defenseTokens += 1;
  if (region.hasTrollLair)  defenseTokens += 1;
  if (region.hasFortress)   defenseTokens += 1;
  if (region.hasEncampment) defenseTokens += 1;

  // Base cost: always at least 2 (the "+1 more than defenders, min 2" rule)
  let cost = Math.max(2, defenseTokens + 1);

  // ── Ability modifiers ──────────────────────────────────────────────────────
  const mods = getActiveModifiers(state.players[state.activePlayerIndex]);

  // Flat modifier (Commando: -1)
  cost += mods.conquestCostFlat;

  // Terrain modifiers (Mounted: -1 on farmland/hill)
  for (const terrainMod of mods.terrainCostModifiers) {
    if (terrainMod.terrains.includes(region.terrain)) {
      cost += terrainMod.modifier;
    }
  }

  // Coastal modifier (Tritons: -1 on coastal)
  if (region.isCoastal) cost += mods.conquestCostCoastal;

  // Cavern modifier (Underworld: -1 on cavern)
  if (region.hasCavern) cost += mods.conquestCostCavern;

  // Giants: -1 when target is adjacent to an own active mountain region
  if (mods.conquestCostAdjacentOwnMountain !== 0) {
    const adjacentOwnMountain = region.adjacentRegionIds.some((adjId) => {
      const adj = state.board.regions.find((r) => r.id === adjId);
      return (
        adj !== undefined &&
        adj.owner === state.activePlayerIndex &&
        !adj.isDeclined &&
        adj.terrain === 'mountain'
      );
    });
    if (adjacentOwnMountain) cost += mods.conquestCostAdjacentOwnMountain;
  }

  // Minimum cost is always 1
  return Math.max(1, cost);
}
