import { describe, it, expect } from 'vitest';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';
import { getActiveModifiers, EMPTY_MODIFIERS } from '@/game/abilities/modifiers';
import type { PlayerState } from '@/game/state/types';

function makePlayer(raceId: string, powerId: string): PlayerState {
  return {
    coins: 5,
    activeRace: {
      raceId: raceId as never,
      powerId: powerId as never,
      maxSupply: 10,
      totalTokens: 10,
      tokensOnBoard: 0,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
    },
    declinedRaces: [],
    availableTokens: 10,
  };
}

describe('EMPTY_MODIFIERS', () => {
  it('has zero/empty values for all fields', () => {
    expect(EMPTY_MODIFIERS.conquestCostFlat).toBe(0);
    expect(EMPTY_MODIFIERS.bonusPerRegion).toBe(0);
    expect(EMPTY_MODIFIERS.terrainBonuses).toEqual([]);
    expect(EMPTY_MODIFIERS.featureBonuses).toEqual([]);
    expect(EMPTY_MODIFIERS.tokenGenerators).toEqual([]);
    expect(EMPTY_MODIFIERS.ignoreAdjacency).toBe(false);
    expect(EMPTY_MODIFIERS.canConquerSeas).toBe(false);
  });
});

describe('getActiveModifiers', () => {
  it('returns EMPTY_MODIFIERS structure when player has no active race', () => {
    const player: PlayerState = {
      coins: 5,
      activeRace: null,
      declinedRaces: [],
      availableTokens: 0,
    };
    const mods = getActiveModifiers(player);
    expect(mods.conquestCostFlat).toBe(0);
    expect(mods.terrainBonuses).toEqual([]);
    expect(mods.ignoreAdjacency).toBe(false);
  });

  it('merges Humans (farmland bonus) + Alchemist (flatBonusPerTurn)', () => {
    const player = makePlayer('humans', 'alchemist');
    const mods = getActiveModifiers(player);
    // Humans have bonusPerTerrain: { farmland: 1 }
    expect(mods.terrainBonuses.some((b) => b.terrain === 'farmland' && b.bonus === 1)).toBe(true);
    // Alchemist gives +2 coins at end of turn (flatBonusPerTurn)
    expect(mods.flatBonusPerTurn).toBe(2);
  });

  it('merges Dwarves (mine bonus) + Merchant (bonusPerRegion)', () => {
    const player = makePlayer('dwarves', 'merchant');
    const mods = getActiveModifiers(player);
    // Dwarves: +1 per mine region (featureBonus)
    const dwarfMine = mods.featureBonuses.find((b) => b.feature === 'mine');
    expect(dwarfMine).toBeDefined();
    expect(dwarfMine!.bonus).toBeGreaterThanOrEqual(1);
    // Merchant: +1 per occupied region
    expect(mods.bonusPerRegion).toBeGreaterThanOrEqual(1);
  });

  it('merges terrainBonuses from both race and power', () => {
    // Humans (farmland bonus) + Forest power (forest bonus)
    const player = makePlayer('humans', 'forest');
    const mods = getActiveModifiers(player);
    const hasFarmland = mods.terrainBonuses.some((b) => b.terrain === 'farmland');
    const hasForest = mods.terrainBonuses.some((b) => b.terrain === 'forest');
    expect(hasFarmland).toBe(true);
    expect(hasForest).toBe(true);
  });

  it('flying power sets ignoreAdjacency flag', () => {
    const player = makePlayer('elves', 'flying');
    const mods = getActiveModifiers(player);
    expect(mods.ignoreAdjacency).toBe(true);
  });

  it('seafaring power sets canConquerSeas flag', () => {
    const player = makePlayer('tritons', 'seafaring');
    const mods = getActiveModifiers(player);
    expect(mods.canConquerSeas).toBe(true);
  });

  it('underworld power sets underworldAreAdjacent and conquestCostUnderworld', () => {
    const player = makePlayer('sorcerers', 'underworld');
    const mods = getActiveModifiers(player);
    expect(mods.underworldAreAdjacent).toBe(true);
    expect(mods.conquestCostUnderworld).toBe(-1);
  });

  it('berserk power sets berserkDie flag', () => {
    const player = makePlayer('orcs', 'berserk');
    const mods = getActiveModifiers(player);
    expect(mods.berserkDie).toBe(true);
  });

  it('ghouls keepAllTokensInDecline stays true through merge', () => {
    const player = makePlayer('ghouls', 'stout');
    const mods = getActiveModifiers(player);
    expect(mods.keepAllTokensInDecline).toBe(true);
    expect(mods.canDeclineAfterConquest).toBe(true);
  });

  it('trolls placesLair stays true', () => {
    const player = makePlayer('trolls', 'wealthy');
    const mods = getActiveModifiers(player);
    expect(mods.placesLair).toBe(true);
    expect(mods.firstTurnBonus).toBe(7);
  });

  it('elves noDefeatCasualties flag merges correctly', () => {
    const player = makePlayer('elves', 'commando');
    const mods = getActiveModifiers(player);
    expect(mods.noDefeatCasualties).toBe(true);
    expect(mods.conquestCostFlat).toBeLessThan(0); // Commando: -1 conquest cost
  });

  it('all 14 races × all 20 powers merge without throwing', () => {
    const raceIds = Object.keys(RACES);
    const powerIds = Object.keys(POWERS);
    for (const raceId of raceIds) {
      for (const powerId of powerIds) {
        expect(() => getActiveModifiers(makePlayer(raceId, powerId))).not.toThrow();
      }
    }
  });
});
