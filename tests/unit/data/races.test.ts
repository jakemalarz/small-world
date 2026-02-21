import { describe, it, expect } from 'vitest';
import { RACES } from '@/game/data/races';
import type { RaceId } from '@/game/state/types';

const RACE_IDS: RaceId[] = [
  'amazons', 'dwarves', 'elves', 'ghouls', 'giants',
  'halflings', 'humans', 'orcs', 'ratmen', 'skeletons',
  'sorcerers', 'tritons', 'trolls', 'wizards',
];

// Expected values from the PRD race table
const EXPECTED: Record<RaceId, { base: number; max: number }> = {
  amazons:   { base: 6,  max: 15 },
  dwarves:   { base: 3,  max: 8  },
  elves:     { base: 6,  max: 11 },
  ghouls:    { base: 5,  max: 10 },
  giants:    { base: 6,  max: 11 },
  halflings: { base: 6,  max: 11 },
  humans:    { base: 5,  max: 10 },
  orcs:      { base: 5,  max: 10 },
  ratmen:    { base: 8,  max: 13 },
  skeletons: { base: 6,  max: 20 },
  sorcerers: { base: 5,  max: 18 },
  tritons:   { base: 6,  max: 11 },
  trolls:    { base: 5,  max: 10 },
  wizards:   { base: 5,  max: 10 },
};

describe('RACES data table', () => {
  it('defines all 14 races', () => {
    expect(Object.keys(RACES)).toHaveLength(14);
    for (const id of RACE_IDS) {
      expect(RACES[id], `Missing race: ${id}`).toBeDefined();
    }
  });

  it('has correct base token counts', () => {
    for (const id of RACE_IDS) {
      expect(RACES[id].baseTokens, id).toBe(EXPECTED[id].base);
    }
  });

  it('has correct max supply values', () => {
    for (const id of RACE_IDS) {
      expect(RACES[id].maxSupply, id).toBe(EXPECTED[id].max);
    }
  });

  it('maxSupply is always >= baseTokens', () => {
    for (const id of RACE_IDS) {
      expect(RACES[id].maxSupply).toBeGreaterThanOrEqual(RACES[id].baseTokens);
    }
  });

  it('each race has a non-empty tooltip', () => {
    for (const id of RACE_IDS) {
      expect(RACES[id].tooltip.length, id).toBeGreaterThan(0);
    }
  });

  it('Dwarves modifier applies in decline', () => {
    expect(RACES.dwarves.modifiers.bonusPerRegionFeature?.appliesInDecline).toBe(true);
  });

  it('Amazons have conquestOnlyTokens: 4', () => {
    expect(RACES.amazons.modifiers.conquestOnlyTokens).toBe(4);
  });

  it('Elves have noDefeatCasualties', () => {
    expect(RACES.elves.modifiers.noDefeatCasualties).toBe(true);
  });

  it('Ghouls have keepAllTokensInDecline', () => {
    expect(RACES.ghouls.modifiers.keepAllTokensInDecline).toBe(true);
  });

  it('Tritons have coastal conquest cost modifier of -1', () => {
    expect(RACES.tritons.modifiers.conquestCostCoastalModifier).toBe(-1);
  });
});
