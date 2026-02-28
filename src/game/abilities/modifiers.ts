import type { Terrain, PlayerState } from '@/game/state/types';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';

// Declarative modifier flags that cover ~70% of race/power abilities.
// Complex abilities (Sorcerers, Dragon Master, Halflings, etc.) use
// custom handlers registered in raceAbilities.ts / powerAbilities.ts.

export interface AbilityModifiers {
  // ── Conquest cost ────────────────────────────────────────────────────────────
  /** Flat modifier on all conquests (e.g. Commando: -1) */
  conquestCostModifier?: number;
  /** Terrain-specific conquest cost modifier (e.g. Mounted: -1 on hill/farmland) */
  conquestCostTerrainModifier?: {
    readonly terrains: readonly Terrain[];
    readonly modifier: number;
  };
  /** Cost modifier for coastal regions (Tritons: -1) */
  conquestCostCoastalModifier?: number;
  /** Cost modifier when target is adjacent to an own mountain region (Giants: -1) */
  conquestCostAdjacentOwnMountainModifier?: number;
  /** Cost modifier for underworld regions (Underworld: -1) */
  conquestCostUnderworldModifier?: number;

  // ── Movement / adjacency ─────────────────────────────────────────────────────
  /** May conquer any region ignoring adjacency (Flying) */
  ignoreAdjacency?: boolean;
  /** May conquer sea and lake regions (Seafaring) */
  canConquerSeas?: boolean;
  /** First conquest may target any region, not just edge/coastal (Halflings) */
  firstConquestAnywhere?: boolean;
  /** All underworld regions are considered mutually adjacent (Underworld) */
  underworldAreAdjacent?: boolean;

  // ── Scoring bonuses ──────────────────────────────────────────────────────────
  /** +N coin per region of the specified terrain (Humans, Forest, Hill, Swamp powers) */
  bonusPerTerrain?: {
    readonly terrain: Terrain;
    readonly bonus: number;
  };
  /** +N coin per region with the specified feature; optionally applies in decline */
  bonusPerRegionFeature?: {
    readonly feature: 'mine' | 'magicSource' | 'underworld';
    readonly bonus: number;
    readonly appliesInDecline?: boolean;
  };
  /** +N coin per occupied region, stacks with base scoring (Merchant) */
  bonusPerRegion?: number;
  /** +N coin per non-empty region conquered this turn (Orcs, Pillaging) */
  bonusPerNonEmptyConquest?: number;
  /** Flat bonus coins each active turn (Alchemist: +2) */
  flatBonusPerTurn?: number;
  /** One-time bonus on the first scoring turn with this race (Wealthy: +7) */
  firstTurnBonus?: number;

  // ── Token generation ─────────────────────────────────────────────────────────
  /** Extra tokens available during conquest only; removed after redeployment (Amazons: +4) */
  conquestOnlyTokens?: number;
  /** Gain tokens from supply after conquering N non-empty regions (Skeletons) */
  tokensPerNonEmptyConquests?: {
    readonly nonEmptyConquestsRequired: number;
    readonly tokensGained: number;
  };

  // ── Defense ──────────────────────────────────────────────────────────────────
  /** Place a lair marker in every occupied region, each adding +1 defense (Trolls) */
  placesLair?: boolean;
  /** When defeated, no tokens are discarded — all return to hand (Elves) */
  noDefeatCasualties?: boolean;

  // ── Decline behaviour ────────────────────────────────────────────────────────
  /** Keep all tokens (don't reduce to 1 per region) when going In Decline (Ghouls) */
  keepAllTokensInDecline?: boolean;
  /** In Decline tokens are exempt from the single-declined-race limit (Spirit) */
  declineRacesSurvive?: boolean;
  /** May go In Decline at end of a regular conquest turn instead of a whole turn (Stout) */
  canDeclineAfterConquest?: boolean;

  // ── Reinforcement die ────────────────────────────────────────────────────────
  /** Use the reinforcement die on every conquest attempt, not just the last (Berserk) */
  berserkDie?: boolean;
}

// ── Merged/resolved modifier view ────────────────────────────────────────────
// This is what game engine functions (conquestCost, scoring, legalActions)
// consume. Arrays allow both race and power to each contribute bonuses.

export interface MergedModifiers {
  // Conquest cost deltas (summed; minimum total cost enforced at call site)
  readonly conquestCostFlat: number;
  readonly conquestCostCoastal: number;
  readonly conquestCostAdjacentOwnMountain: number;
  readonly conquestCostUnderworld: number;
  readonly terrainCostModifiers: readonly {
    readonly terrains: readonly Terrain[];
    readonly modifier: number;
  }[];
  // Movement / adjacency
  readonly ignoreAdjacency: boolean;
  readonly canConquerSeas: boolean;
  readonly firstConquestAnywhere: boolean;
  readonly underworldAreAdjacent: boolean;
  // Scoring — arrays so race AND power can each contribute
  readonly terrainBonuses: readonly {
    readonly terrain: Terrain;
    readonly bonus: number;
  }[];
  readonly featureBonuses: readonly {
    readonly feature: 'mine' | 'magicSource' | 'underworld';
    readonly bonus: number;
    readonly appliesInDecline: boolean;
  }[];
  readonly bonusPerRegion: number;
  readonly bonusPerNonEmptyConquest: number;
  readonly flatBonusPerTurn: number;
  readonly firstTurnBonus: number;
  // Token generation
  readonly conquestOnlyTokens: number;
  readonly tokenGenerators: readonly {
    readonly nonEmptyConquestsRequired: number;
    readonly tokensGained: number;
  }[];
  // Defense
  readonly placesLair: boolean;
  readonly noDefeatCasualties: boolean;
  // Decline
  readonly keepAllTokensInDecline: boolean;
  readonly declineRacesSurvive: boolean;
  readonly canDeclineAfterConquest: boolean;
  // Die
  readonly berserkDie: boolean;
}

export const EMPTY_MODIFIERS: MergedModifiers = {
  conquestCostFlat: 0,
  conquestCostCoastal: 0,
  conquestCostAdjacentOwnMountain: 0,
  conquestCostUnderworld: 0,
  terrainCostModifiers: [],
  ignoreAdjacency: false,
  canConquerSeas: false,
  firstConquestAnywhere: false,
  underworldAreAdjacent: false,
  terrainBonuses: [],
  featureBonuses: [],
  bonusPerRegion: 0,
  bonusPerNonEmptyConquest: 0,
  flatBonusPerTurn: 0,
  firstTurnBonus: 0,
  conquestOnlyTokens: 0,
  tokenGenerators: [],
  placesLair: false,
  noDefeatCasualties: false,
  keepAllTokensInDecline: false,
  declineRacesSurvive: false,
  canDeclineAfterConquest: false,
  berserkDie: false,
};

/** Merge race + power modifiers for the active player's race/power combo. */
export function getActiveModifiers(player: PlayerState): MergedModifiers {
  if (!player.activeRace) return EMPTY_MODIFIERS;
  const race = RACES[player.activeRace.raceId];
  const power = POWERS[player.activeRace.powerId];
  return mergeModifiers(race.modifiers, power.modifiers);
}

function mergeModifiers(r: AbilityModifiers, p: AbilityModifiers): MergedModifiers {
  const terrainBonuses: { terrain: Terrain; bonus: number }[] = [];
  if (r.bonusPerTerrain) terrainBonuses.push(r.bonusPerTerrain);
  if (p.bonusPerTerrain) terrainBonuses.push(p.bonusPerTerrain);

  const featureBonuses: {
    feature: 'mine' | 'magicSource' | 'underworld';
    bonus: number;
    appliesInDecline: boolean;
  }[] = [];
  if (r.bonusPerRegionFeature) {
    featureBonuses.push({ ...r.bonusPerRegionFeature, appliesInDecline: r.bonusPerRegionFeature.appliesInDecline ?? false });
  }
  if (p.bonusPerRegionFeature) {
    featureBonuses.push({ ...p.bonusPerRegionFeature, appliesInDecline: p.bonusPerRegionFeature.appliesInDecline ?? false });
  }

  const terrainCostModifiers = [
    ...(r.conquestCostTerrainModifier ? [r.conquestCostTerrainModifier] : []),
    ...(p.conquestCostTerrainModifier ? [p.conquestCostTerrainModifier] : []),
  ];

  const tokenGenerators = [
    ...(r.tokensPerNonEmptyConquests ? [r.tokensPerNonEmptyConquests] : []),
    ...(p.tokensPerNonEmptyConquests ? [p.tokensPerNonEmptyConquests] : []),
  ];

  return {
    conquestCostFlat: (r.conquestCostModifier ?? 0) + (p.conquestCostModifier ?? 0),
    conquestCostCoastal: (r.conquestCostCoastalModifier ?? 0) + (p.conquestCostCoastalModifier ?? 0),
    conquestCostAdjacentOwnMountain: (r.conquestCostAdjacentOwnMountainModifier ?? 0) + (p.conquestCostAdjacentOwnMountainModifier ?? 0),
    conquestCostUnderworld: (r.conquestCostUnderworldModifier ?? 0) + (p.conquestCostUnderworldModifier ?? 0),
    terrainCostModifiers,
    ignoreAdjacency: (r.ignoreAdjacency ?? false) || (p.ignoreAdjacency ?? false),
    canConquerSeas: (r.canConquerSeas ?? false) || (p.canConquerSeas ?? false),
    firstConquestAnywhere: (r.firstConquestAnywhere ?? false) || (p.firstConquestAnywhere ?? false),
    underworldAreAdjacent: (r.underworldAreAdjacent ?? false) || (p.underworldAreAdjacent ?? false),
    terrainBonuses,
    featureBonuses,
    bonusPerRegion: (r.bonusPerRegion ?? 0) + (p.bonusPerRegion ?? 0),
    bonusPerNonEmptyConquest: (r.bonusPerNonEmptyConquest ?? 0) + (p.bonusPerNonEmptyConquest ?? 0),
    flatBonusPerTurn: (r.flatBonusPerTurn ?? 0) + (p.flatBonusPerTurn ?? 0),
    firstTurnBonus: (r.firstTurnBonus ?? 0) + (p.firstTurnBonus ?? 0),
    conquestOnlyTokens: (r.conquestOnlyTokens ?? 0) + (p.conquestOnlyTokens ?? 0),
    tokenGenerators,
    placesLair: (r.placesLair ?? false) || (p.placesLair ?? false),
    noDefeatCasualties: (r.noDefeatCasualties ?? false) || (p.noDefeatCasualties ?? false),
    keepAllTokensInDecline: (r.keepAllTokensInDecline ?? false) || (p.keepAllTokensInDecline ?? false),
    declineRacesSurvive: (r.declineRacesSurvive ?? false) || (p.declineRacesSurvive ?? false),
    canDeclineAfterConquest: (r.canDeclineAfterConquest ?? false) || (p.canDeclineAfterConquest ?? false),
    berserkDie: (r.berserkDie ?? false) || (p.berserkDie ?? false),
  };
}
