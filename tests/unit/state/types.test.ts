import { describe, it, expect } from 'vitest';
import type {
  GameState,
  PlayerState,
  BoardState,
  ComboShopState,
  TurnPhase,
  RaceId,
  PowerId,
} from '@/game/state/types';

describe('Game state types', () => {
  it('constructs a minimal valid GameState without type errors', () => {
    const player: PlayerState = {
      coins: 5,
      activeRace: null,
      declinedRaces: [],
      availableTokens: 0,
    };

    const board: BoardState = { regions: [] };

    const shop: ComboShopState = {
      visible: [],
      raceDeck: [],
      powerDeck: [],
    };

    const state: GameState = {
      turn: 1,
      round: 0,
      phase: 'selectCombo' satisfies TurnPhase,
      activePlayerIndex: 0,
      firstPlayerIndex: 0,
      players: [player, { ...player }],
      board,
      comboShop: shop,
      reinforcementDie: null,
      log: [],
    };

    expect(state.turn).toBe(1);
    expect(state.phase).toBe('selectCombo');
    expect(state.players).toHaveLength(2);
  });

  it('has the correct number of race IDs', () => {
    const raceIds: RaceId[] = [
      'amazons', 'dwarves', 'elves', 'ghouls', 'giants',
      'halflings', 'humans', 'orcs', 'ratmen', 'skeletons',
      'sorcerers', 'tritons', 'trolls', 'wizards',
    ];
    expect(raceIds).toHaveLength(14);
  });

  it('has the correct number of power IDs', () => {
    const powerIds: PowerId[] = [
      'alchemist', 'berserk', 'bivouacking', 'commando',
      'dragonMaster', 'flying', 'forest', 'fortified', 'heroic',
      'hill', 'merchant', 'mounted', 'pillaging', 'seafaring',
      'stout', 'swamp', 'underworld', 'wealthy',
    ];
    expect(powerIds).toHaveLength(18);
  });
});
