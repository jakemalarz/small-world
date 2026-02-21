import type { Terrain } from '@/game/state/types';

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
  /** Cost modifier for cavern regions (Underworld: -1) */
  conquestCostCavernModifier?: number;

  // ── Movement / adjacency ─────────────────────────────────────────────────────
  /** May conquer any region ignoring adjacency (Flying) */
  ignoreAdjacency?: boolean;
  /** May conquer sea and lake regions (Seafaring) */
  canConquerSeas?: boolean;
  /** First conquest may target any region, not just edge/coastal (Halflings) */
  firstConquestAnywhere?: boolean;
  /** All cavern regions are considered mutually adjacent (Underworld) */
  cavernsAreAdjacent?: boolean;

  // ── Scoring bonuses ──────────────────────────────────────────────────────────
  /** +N coin per region of the specified terrain (Humans, Forest, Hill, Swamp powers) */
  bonusPerTerrain?: {
    readonly terrain: Terrain;
    readonly bonus: number;
  };
  /** +N coin per region with the specified feature; optionally applies in decline */
  bonusPerRegionFeature?: {
    readonly feature: 'mine' | 'magicSource' | 'cavern';
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
