import type { RaceId } from '@/game/state/types';
import type { AbilityModifiers } from '@/game/abilities/modifiers';

export interface RaceDefinition {
  readonly id: RaceId;
  readonly name: string;
  readonly baseTokens: number;
  readonly maxSupply: number;     // Finite token cap — abilities cannot exceed this
  readonly modifiers: AbilityModifiers;
  readonly customHandler?: string; // Key for complex ability logic (see raceAbilities.ts)
  readonly tooltip: string;
}

export const RACES: Readonly<Record<RaceId, RaceDefinition>> = {
  amazons: {
    id: 'amazons',
    name: 'Amazons',
    baseTokens: 6,
    maxSupply: 15,
    modifiers: { conquestOnlyTokens: 4 },
    customHandler: 'amazons',
    tooltip: '+4 tokens for conquest only. Remove 4 from map after redeployment.',
  },
  dwarves: {
    id: 'dwarves',
    name: 'Dwarves',
    baseTokens: 3,
    maxSupply: 8,
    modifiers: {
      bonusPerRegionFeature: { feature: 'mine', bonus: 1, appliesInDecline: true },
    },
    tooltip: '+1 Victory Coin per Mine region (Active or In Decline).',
  },
  elves: {
    id: 'elves',
    name: 'Elves',
    baseTokens: 6,
    maxSupply: 11,
    modifiers: { noDefeatCasualties: true },
    tooltip: 'When defeated, suffer no casualties — all tokens return to hand.',
  },
  ghouls: {
    id: 'ghouls',
    name: 'Ghouls',
    baseTokens: 5,
    maxSupply: 10,
    modifiers: { keepAllTokensInDecline: true },
    customHandler: 'ghouls',
    tooltip: 'Keep all tokens when going In Decline. In Decline Ghouls can still conquer.',
  },
  giants: {
    id: 'giants',
    name: 'Giants',
    baseTokens: 6,
    maxSupply: 11,
    modifiers: { conquestCostAdjacentOwnMountainModifier: -1 },
    tooltip: 'Conquest cost -1 for regions adjacent to a Mountain region you occupy.',
  },
  halflings: {
    id: 'halflings',
    name: 'Halflings',
    baseTokens: 6,
    maxSupply: 11,
    modifiers: { firstConquestAnywhere: true },
    customHandler: 'halflings',
    tooltip: 'May enter at any region. Place a Hole-in-the-Ground in first 2 regions conquered (immune to conquest/powers).',
  },
  humans: {
    id: 'humans',
    name: 'Humans',
    baseTokens: 5,
    maxSupply: 10,
    modifiers: { bonusPerTerrain: { terrain: 'farmland', bonus: 1 } },
    tooltip: '+1 Victory Coin per Farmland region.',
  },
  orcs: {
    id: 'orcs',
    name: 'Orcs',
    baseTokens: 5,
    maxSupply: 10,
    modifiers: { bonusPerNonEmptyConquest: 1 },
    tooltip: '+1 Victory Coin per non-empty region conquered this turn.',
  },
  ratmen: {
    id: 'ratmen',
    name: 'Ratmen',
    baseTokens: 8,
    maxSupply: 13,
    modifiers: {},
    tooltip: 'No special ability — high token count is the advantage.',
  },
  skeletons: {
    id: 'skeletons',
    name: 'Skeletons',
    baseTokens: 6,
    maxSupply: 20,
    modifiers: {
      tokensPerNonEmptyConquests: { nonEmptyConquestsRequired: 2, tokensGained: 1 },
    },
    customHandler: 'skeletons',
    tooltip: 'Gain 1 Skeleton token per 2 non-empty regions conquered this turn (capped at max supply).',
  },
  sorcerers: {
    id: 'sorcerers',
    name: 'Sorcerers',
    baseTokens: 5,
    maxSupply: 18,
    modifiers: {},
    customHandler: 'sorcerers',
    tooltip: 'Once per turn per opponent: replace an adjacent lone enemy Active token with one of yours (theirs is discarded).',
  },
  tritons: {
    id: 'tritons',
    name: 'Tritons',
    baseTokens: 6,
    maxSupply: 11,
    modifiers: { conquestCostCoastalModifier: -1 },
    tooltip: 'Conquest cost -1 for Coastal regions (bordering Sea or Lake).',
  },
  trolls: {
    id: 'trolls',
    name: 'Trolls',
    baseTokens: 5,
    maxSupply: 10,
    modifiers: { placesLair: true },
    tooltip: "Place a Troll's Lair in every occupied region (+1 defense). Lairs remain In Decline.",
  },
  wizards: {
    id: 'wizards',
    name: 'Wizards',
    baseTokens: 5,
    maxSupply: 10,
    modifiers: {
      bonusPerRegionFeature: { feature: 'magicSource', bonus: 1 },
    },
    tooltip: '+1 Victory Coin per Magic Source region.',
  },
};
