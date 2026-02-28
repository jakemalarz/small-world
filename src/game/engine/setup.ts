import type { GameState, PlayerState, RegionState, ComboSlot, RaceId, PowerId } from '@/game/state/types';
import { MAP_2P } from '@/game/data/map2p';

const ALL_RACE_IDS: readonly RaceId[] = [
  'amazons', 'dwarves', 'elves', 'ghouls', 'giants',
  'halflings', 'humans', 'orcs', 'ratmen', 'skeletons',
  'sorcerers', 'tritons', 'trolls', 'wizards',
];

const ALL_POWER_IDS: readonly PowerId[] = [
  'alchemist', 'berserk', 'bivouacking', 'commando', 'diplomat',
  'dragonMaster', 'flying', 'forest', 'fortified', 'heroic',
  'hill', 'merchant', 'mounted', 'pillaging', 'seafaring',
  'spirit', 'stout', 'swamp', 'underworld', 'wealthy',
];

/** Fisher-Yates shuffle — returns a new array. */
function shuffle<T>(arr: readonly T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export interface GameConfig {
  /** Which player goes first. If omitted, chosen randomly. */
  readonly firstPlayerIndex?: 0 | 1;
}

export function createInitialState(config: GameConfig = {}): GameState {
  const firstPlayerIndex: 0 | 1 =
    config.firstPlayerIndex ?? (Math.random() < 0.5 ? 0 : 1);

  // Shuffle decks
  const raceDeck = shuffle(ALL_RACE_IDS);
  const powerDeck = shuffle(ALL_POWER_IDS);

  // Deal 6 combos to the shop (taken from the END of the deck so deck is easy to pop from)
  const visible: ComboSlot[] = [];
  for (let i = 0; i < 6; i++) {
    visible.push({
      raceId: raceDeck.pop()!,
      powerId: powerDeck.pop()!,
      coinsOnSlot: 0,
    });
  }

  // Build initial RegionState from static map data
  const regions: RegionState[] = MAP_2P.regions.map((r) => ({
    id: r.id,
    terrain: r.terrain,
    adjacentRegionIds: r.adjacentRegionIds,
    isEdge: r.isEdge,
    isCoastal: r.isCoastal,
    hasMountain: r.hasMountain,
    hasMine: r.hasMine,
    hasMagicSource: r.hasMagicSource,
    hasUnderworld: r.hasUnderworld,
    // Dynamic state — all start at defaults
    owner: null,
    tokens: 0,
    isDeclined: false,
    declinedRaceId: null,
    hasLostTribe: r.hasLostTribe,
    hasTrollLair: false,
    hasFortress: false,
    hasEncampment: false,
    hasHoleInTheGround: false,
    hasHero: false,
    hasDragon: false,
  }));

  const emptyPlayer: PlayerState = {
    coins: 5,
    activeRace: null,
    declinedRaces: [],
    availableTokens: 0,
  };

  const player0: PlayerState = { ...emptyPlayer };
  const player1: PlayerState = { ...emptyPlayer };

  return {
    turn: 1,
    round: 0,
    phase: 'selectCombo',
    activePlayerIndex: firstPlayerIndex,
    firstPlayerIndex,
    players: [player0, player1],
    board: { regions },
    comboShop: { visible, raceDeck, powerDeck },
    reinforcementDie: null,
    log: [],
  };
}
