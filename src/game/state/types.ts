// ─── Turn Phase ───────────────────────────────────────────────────────────────

export type TurnPhase =
  | 'selectCombo'
  | 'ghoulReadyTroops'  // Ghouls in decline: gather tokens before conquest
  | 'ghoulConquest'     // Ghouls in decline act before active race
  | 'ghoulRedeploy'        // Ghouls in decline: redistribute after conquest
  | 'ghoulReinforcementDie' // Ghouls in decline: final conquest with die
  | 'readyTroops'
  | 'conquest'
  | 'reinforcementDie'
  | 'redeploy'
  | 'placeFortress'     // Fortified power: place 1 fortress after redeployment
  | 'placeEncampments'  // Bivouacking power: place up to 5 encampments after redeployment
  | 'placeHeroes'       // Heroic power: place 2 heroes after redeployment
  | 'score'
  | 'optionalDecline'   // Stout power: decline offered after scoring
  | 'decline'
  | 'gameOver';

// ─── Terrain ──────────────────────────────────────────────────────────────────

export type Terrain =
  | 'mountain'
  | 'forest'
  | 'farmland'
  | 'hill'
  | 'swamp'
  | 'sea'
  | 'lake';

// ─── Race IDs ─────────────────────────────────────────────────────────────────

export type RaceId =
  | 'amazons'
  | 'dwarves'
  | 'elves'
  | 'ghouls'
  | 'giants'
  | 'halflings'
  | 'humans'
  | 'orcs'
  | 'ratmen'
  | 'skeletons'
  | 'sorcerers'
  | 'tritons'
  | 'trolls'
  | 'wizards';

// ─── Power IDs ────────────────────────────────────────────────────────────────

export type PowerId =
  | 'alchemist'
  | 'berserk'
  | 'bivouacking'
  | 'commando'
  | 'dragonMaster'
  | 'flying'
  | 'forest'
  | 'fortified'
  | 'heroic'
  | 'hill'
  | 'merchant'
  | 'mounted'
  | 'pillaging'
  | 'seafaring'
  | 'stout'
  | 'swamp'
  | 'underworld'
  | 'wealthy';

// ─── Game Actions ─────────────────────────────────────────────────────────────

export type GameAction =
  | { readonly type: 'selectCombo'; readonly comboIndex: number }
  | { readonly type: 'pickUpTokens'; readonly regionId: number; readonly count: number }
  | { readonly type: 'conquer'; readonly regionId: number; readonly dieResult?: 0 | 1 | 2 | 3 }
  | { readonly type: 'ghoulConquer'; readonly regionId: number }
  | { readonly type: 'ghoulPickUpTokens'; readonly regionId: number; readonly count: number }
  | { readonly type: 'ghoulReadyTroopsDeploy'; readonly deployment: ReadonlyMap<number, number> }
  | { readonly type: 'ghoulRedeploy'; readonly deployment: ReadonlyMap<number, number> }
  | { readonly type: 'ghoulUseReinforcement'; readonly regionId: number; readonly dieResult: 0 | 1 | 2 | 3 }
  | { readonly type: 'startGhoulFinalConquest' }
  | { readonly type: 'useReinforcement'; readonly regionId: number; readonly dieResult: 0 | 1 | 2 | 3 }
  | { readonly type: 'readyTroopsDeploy'; readonly deployment: ReadonlyMap<number, number> }
  | { readonly type: 'redeploy'; readonly deployment: ReadonlyMap<number, number> }
  | { readonly type: 'defenderRedeploy'; readonly deployment: ReadonlyMap<number, number> }
  | { readonly type: 'placeDragon'; readonly regionId: number }
  | { readonly type: 'sorcererConvert'; readonly regionId: number }
  | { readonly type: 'placeHeroes'; readonly regionIds: readonly [number, number] }
  | { readonly type: 'placeEncampments'; readonly deployment: ReadonlyMap<number, number> }
  | { readonly type: 'placeFortress'; readonly regionId: number }
  | { readonly type: 'startFinalConquest' }
  | { readonly type: 'berserkFail'; readonly regionId: number }
  | { readonly type: 'decline' }
  | { readonly type: 'endPhase' };

// ─── Game Log ─────────────────────────────────────────────────────────────────

export interface GameLogEntry {
  readonly turn: number;
  readonly playerIndex: 0 | 1;
  readonly phase: TurnPhase;
  readonly action: GameAction;
}

// ─── Region State ─────────────────────────────────────────────────────────────

export interface RegionState {
  readonly id: number;
  readonly terrain: Terrain;
  readonly adjacentRegionIds: readonly number[];
  readonly isEdge: boolean;
  readonly isCoastal: boolean;      // Borders a Sea or Lake region
  readonly hasMountain: boolean;    // Mountain symbol (adds +1 to conquest cost)
  readonly hasMine: boolean;
  readonly hasMagicSource: boolean;
  readonly hasUnderworld: boolean;
  // Dynamic ownership & tokens
  readonly owner: 0 | 1 | null;    // Player index, or null if unoccupied
  readonly tokens: number;          // Number of race tokens on this region
  readonly isDeclined: boolean;     // True if occupied by an In Decline race
  readonly declinedRaceId: RaceId | null; // Which declined race occupies this region (null if active or empty)
  readonly hasLostTribe: boolean;   // Lost Tribe token present (removed on conquest)
  // Special markers
  readonly hasTrollLair: boolean;
  readonly hasFortress: boolean;
  readonly encampmentCount: number;    // Number of encampments (0-5, stackable)
  readonly hasHoleInTheGround: boolean; // Halflings — immune to conquest/powers
  readonly hasHero: boolean;        // Heroic power — immune to conquest
  readonly hasDragon: boolean;      // Dragon Master — immune to conquest
}

// ─── Board State ──────────────────────────────────────────────────────────────

export interface BoardState {
  readonly regions: readonly RegionState[];
}

// ─── Active Race State ────────────────────────────────────────────────────────

export interface ActiveRaceState {
  readonly raceId: RaceId;
  readonly powerId: PowerId;
  readonly maxSupply: number;          // Finite token cap — cannot exceed this
  readonly totalTokens: number;        // Total tokens ever in play (on board + in hand)
  readonly tokensOnBoard: number;      // Tokens currently placed on regions
  readonly conquestsThisTurn: number;  // Non-empty regions conquered this turn
                                       //   (used by Orcs, Pillaging, Skeletons)
  readonly hasDeclinedThisTurn: boolean; // Stout: tracks decline within same turn
  readonly sorcererConversionsThisTurn: number; // Sorcerer: once per turn per opponent
  // Power-specific persistent state (undefined = not applicable)
  readonly fortressesPlaced?: number;    // Fortresses currently on board
  readonly fortressesLost?: number;      // Fortresses permanently destroyed (conquered/abandoned)
  readonly encampmentRegions?: readonly number[];
  readonly heroRegions?: readonly [number, number];
  readonly dragonRegion?: number | null;
  readonly dragonUsedThisTurn?: boolean; // Dragon Master: true after dragon conquest this turn
  readonly halflingHoles?: readonly number[];
  readonly trollLairsOnBoard?: number;   // Trolls: count of lairs currently on board
  readonly wealthyBonusApplied?: boolean;  // Wealthy: +7 applied on first scoring turn
  readonly berserkAttemptedRegions?: readonly number[]; // Berserk: regions failed this turn
}

// ─── Declined Race State ──────────────────────────────────────────────────────

export interface DeclinedRaceState {
  readonly raceId: RaceId;
  readonly powerId: PowerId;
}

// ─── Player State ─────────────────────────────────────────────────────────────

export interface PlayerState {
  readonly coins: number;
  readonly activeRace: ActiveRaceState | null;
  readonly declinedRaces: readonly DeclinedRaceState[];
  readonly availableTokens: number;  // Tokens in hand (not yet placed on board)
  // Stashed active-race tokens during Ghoul phases (restored after ghoulRedeploy)
  readonly ghoulSavedTokens?: number;
  // Ghoul tokens recovered when an opponent conquers a Ghoul In Decline region
  // (1 token is permanently lost; N-1 survivors wait here until next Ghoul turn)
  readonly ghoulTokensInReserve?: number;
}

// ─── Combo Shop ───────────────────────────────────────────────────────────────

export interface ComboSlot {
  readonly raceId: RaceId;
  readonly powerId: PowerId;
  readonly coinsOnSlot: number; // Coins left on this slot by players who skipped it
}

export interface ComboShopState {
  readonly visible: readonly ComboSlot[];  // 6 visible combos
  readonly raceDeck: readonly RaceId[];    // Remaining undealt races
  readonly powerDeck: readonly PowerId[]; // Remaining undealt powers
}

// ─── Reinforcement Die State ──────────────────────────────────────────────────

export interface DieState {
  readonly result: 0 | 1 | 2 | 3;
  readonly targetRegionId: number | null;
}

// ─── Game State ───────────────────────────────────────────────────────────────

export interface GameState {
  readonly turn: number;                       // Current turn number (1–10)
  readonly round: number;                      // Full rounds elapsed (both players)
  readonly phase: TurnPhase;
  readonly activePlayerIndex: 0 | 1;
  readonly firstPlayerIndex: 0 | 1;           // Randomly assigned at game start
  readonly players: readonly [PlayerState, PlayerState];
  readonly board: BoardState;
  readonly comboShop: ComboShopState;
  readonly reinforcementDie: DieState | null; // Non-null only during reinforcementDie phase
  readonly log: readonly GameLogEntry[];       // Full action history for replay/debug
}
