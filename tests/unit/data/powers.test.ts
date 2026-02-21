import { describe, it, expect } from 'vitest';
import { POWERS } from '@/game/data/powers';
import type { PowerId } from '@/game/state/types';

const POWER_IDS: PowerId[] = [
  'alchemist', 'berserk', 'bivouacking', 'commando', 'diplomat',
  'dragonMaster', 'flying', 'forest', 'fortified', 'heroic',
  'hill', 'merchant', 'mounted', 'pillaging', 'seafaring',
  'spirit', 'stout', 'swamp', 'underworld', 'wealthy',
];

// Expected bonus token counts from the PRD power table
const EXPECTED_BONUS: Record<PowerId, number> = {
  alchemist: 4, berserk: 4, bivouacking: 5, commando: 4, diplomat: 5,
  dragonMaster: 5, flying: 5, forest: 4, fortified: 3, heroic: 2,
  hill: 4, merchant: 2, mounted: 5, pillaging: 5, seafaring: 5,
  spirit: 5, stout: 4, swamp: 4, underworld: 5, wealthy: 4,
};

describe('POWERS data table', () => {
  it('defines all 20 powers', () => {
    expect(Object.keys(POWERS)).toHaveLength(20);
    for (const id of POWER_IDS) {
      expect(POWERS[id], `Missing power: ${id}`).toBeDefined();
    }
  });

  it('has correct bonus token counts', () => {
    for (const id of POWER_IDS) {
      expect(POWERS[id].bonusTokens, id).toBe(EXPECTED_BONUS[id]);
    }
  });

  it('each power has a non-empty tooltip', () => {
    for (const id of POWER_IDS) {
      expect(POWERS[id].tooltip.length, id).toBeGreaterThan(0);
    }
  });

  it('Flying has ignoreAdjacency modifier', () => {
    expect(POWERS.flying.modifiers.ignoreAdjacency).toBe(true);
  });

  it('Seafaring has canConquerSeas modifier', () => {
    expect(POWERS.seafaring.modifiers.canConquerSeas).toBe(true);
  });

  it('Spirit has declineRacesSurvive modifier', () => {
    expect(POWERS.spirit.modifiers.declineRacesSurvive).toBe(true);
  });

  it('Stout has canDeclineAfterConquest modifier', () => {
    expect(POWERS.stout.modifiers.canDeclineAfterConquest).toBe(true);
  });

  it('Commando has -1 conquest cost modifier', () => {
    expect(POWERS.commando.modifiers.conquestCostModifier).toBe(-1);
  });

  it('Mounted targets hill and farmland terrains', () => {
    const mod = POWERS.mounted.modifiers.conquestCostTerrainModifier;
    expect(mod?.terrains).toContain('hill');
    expect(mod?.terrains).toContain('farmland');
    expect(mod?.modifier).toBe(-1);
  });

  it('Underworld has both cavern modifiers', () => {
    expect(POWERS.underworld.modifiers.conquestCostCavernModifier).toBe(-1);
    expect(POWERS.underworld.modifiers.cavernsAreAdjacent).toBe(true);
  });

  it('Berserk has berserkDie modifier', () => {
    expect(POWERS.berserk.modifiers.berserkDie).toBe(true);
  });
});
