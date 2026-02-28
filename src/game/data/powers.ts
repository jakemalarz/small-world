import type { PowerId } from '@/game/state/types';
import type { AbilityModifiers } from '@/game/abilities/modifiers';

export interface PowerDefinition {
  readonly id: PowerId;
  readonly name: string;
  readonly bonusTokens: number; // Added to race base token count
  readonly modifiers: AbilityModifiers;
  readonly customHandler?: string; // Key for complex ability logic (see powerAbilities.ts)
  readonly tooltip: string;
}

export const POWERS: Readonly<Record<PowerId, PowerDefinition>> = {
  alchemist: {
    id: 'alchemist',
    name: 'Alchemist',
    bonusTokens: 4,
    modifiers: { flatBonusPerTurn: 2 },
    tooltip: '+4 tokens. Collect 2 bonus Victory Coins every turn the race is Active.',
  },
  berserk: {
    id: 'berserk',
    name: 'Berserk',
    bonusTokens: 4,
    modifiers: { berserkDie: true },
    tooltip: '+4 tokens. Use the Reinforcement Die for every conquest attempt, not just the last.',
  },
  bivouacking: {
    id: 'bivouacking',
    name: 'Bivouacking',
    bonusTokens: 5,
    modifiers: {},
    customHandler: 'bivouacking',
    tooltip: '+5 tokens. Deploy up to 5 Encampment tokens (+1 defense each). Repositionable each turn. Disappear In Decline.',
  },
  commando: {
    id: 'commando',
    name: 'Commando',
    bonusTokens: 4,
    modifiers: { conquestCostModifier: -1 },
    tooltip: '+4 tokens. Conquest cost -1 on any region.',
  },
  dragonMaster: {
    id: 'dragonMaster',
    name: 'Dragon Master',
    bonusTokens: 5,
    modifiers: {},
    customHandler: 'dragonMaster',
    tooltip: '+5 tokens. Once per turn: conquer any region with 1 token (ignores defense). Dragon moves each turn; its region is immune to conquest.',
  },
  flying: {
    id: 'flying',
    name: 'Flying',
    bonusTokens: 5,
    modifiers: { ignoreAdjacency: true },
    tooltip: '+5 tokens. May conquer any region regardless of adjacency (not Seas/Lakes).',
  },
  forest: {
    id: 'forest',
    name: 'Forest',
    bonusTokens: 4,
    modifiers: { bonusPerTerrain: { terrain: 'forest', bonus: 1 } },
    tooltip: '+4 tokens. +1 Victory Coin per Forest region.',
  },
  fortified: {
    id: 'fortified',
    name: 'Fortified',
    bonusTokens: 3,
    modifiers: {},
    customHandler: 'fortified',
    tooltip: '+3 tokens. Place 1 Fortress per turn (max 6 total). +1 Victory Coin per Fortress (Active). +1 defense (Active and In Decline).',
  },
  heroic: {
    id: 'heroic',
    name: 'Heroic',
    bonusTokens: 2,
    modifiers: {},
    customHandler: 'heroic',
    tooltip: '+2 tokens. Place 2 Heroes in 2 occupied regions — those regions become immune to conquest.',
  },
  hill: {
    id: 'hill',
    name: 'Hill',
    bonusTokens: 4,
    modifiers: { bonusPerTerrain: { terrain: 'hill', bonus: 1 } },
    tooltip: '+4 tokens. +1 Victory Coin per Hill region.',
  },
  merchant: {
    id: 'merchant',
    name: 'Merchant',
    bonusTokens: 2,
    modifiers: { bonusPerRegion: 1 },
    tooltip: '+2 tokens. +1 Victory Coin for every region occupied (stacks with base scoring).',
  },
  mounted: {
    id: 'mounted',
    name: 'Mounted',
    bonusTokens: 5,
    modifiers: {
      conquestCostTerrainModifier: { terrains: ['hill', 'farmland'], modifier: -1 },
    },
    tooltip: '+5 tokens. Conquest cost -1 on Hill and Farmland regions.',
  },
  pillaging: {
    id: 'pillaging',
    name: 'Pillaging',
    bonusTokens: 5,
    modifiers: { bonusPerNonEmptyConquest: 1 },
    tooltip: '+5 tokens. +1 Victory Coin per non-empty region conquered this turn.',
  },
  seafaring: {
    id: 'seafaring',
    name: 'Seafaring',
    bonusTokens: 5,
    modifiers: { canConquerSeas: true },
    tooltip: '+5 tokens. May conquer Seas and Lakes (treated as empty regions). Keep them In Decline.',
  },
  stout: {
    id: 'stout',
    name: 'Stout',
    bonusTokens: 4,
    modifiers: { canDeclineAfterConquest: true },
    tooltip: '+4 tokens. Can go In Decline at the end of a regular conquest turn (Conquer → Redeploy → Score → Decline).',
  },
  swamp: {
    id: 'swamp',
    name: 'Swamp',
    bonusTokens: 4,
    modifiers: { bonusPerTerrain: { terrain: 'swamp', bonus: 1 } },
    tooltip: '+4 tokens. +1 Victory Coin per Swamp region.',
  },
  underworld: {
    id: 'underworld',
    name: 'Underworld',
    bonusTokens: 5,
    modifiers: {
      conquestCostUnderworldModifier: -1,
      underworldAreAdjacent: true,
    },
    tooltip: '+5 tokens. Conquest cost -1 on Underworld regions. All Underworld regions are adjacent to each other.',
  },
  wealthy: {
    id: 'wealthy',
    name: 'Wealthy',
    bonusTokens: 4,
    modifiers: { firstTurnBonus: 7 },
    tooltip: '+4 tokens. Gain 7 bonus Victory Coins at the end of your first turn with this race.',
  },
};
