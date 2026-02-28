# Technical Design: Small World — Web-Based Board Game

## 0. Design Decisions Summary

| # | Decision | Choice |
|---|----------|--------|
| 1 | Game state architecture | Immutable — each action produces a new state object |
| 2 | Entity/logic modeling | Data-driven hybrid — plain TS interfaces + pure functions, no classes |
| 3 | Phaser scene structure | Parallel scenes — Board (pan/zoom) + HUD (fixed overlay) |
| 4 | Map data representation | Hand-authored JSON — manually traced polygons from reference image |
| 5 | Race/power ability system | Modifier/tag system — declarative data for ~70% of abilities, custom handlers for complex ones |
| 6 | Map rendering | Pre-rendered map image + invisible hit polygons + vector overlays |
| 7 | Turn flow & phase management | Explicit finite state machine — phase is part of game state |
| 8 | Camera & canvas navigation | Phaser built-in camera (scroll, zoom, pan, lerp) |
| 9 | Token rendering | Hybrid — geometric placeholders now, sprite-ready for later swap |
| 10 | Animation system | Centralized animation choreographer — awaitable, speed-controllable |
| 11 | Audio | Stubbed audio manager now, real assets in M5 |
| 12 | Testing | Vitest (unit) for pure game logic + Playwright (E2E) for UI |

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                      Browser                            │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Board Scene  │  │  HUD Scene   │  │  Menu Scene  │  │
│  │  (pan/zoom)   │  │  (fixed)     │  │  (title)     │  │
│  │              │  │              │  │              │  │
│  │  - Map image  │  │  - Turn track│  │  - New Game  │  │
│  │  - Hit polys  │  │  - Phase     │  │  - Settings  │  │
│  │  - Tokens     │  │  - Scores    │  │              │  │
│  │  - Overlays   │  │  - Actions   │  │              │  │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘  │
│         │                 │                             │
│  ┌──────┴─────────────────┴───────┐                     │
│  │      Presentation Layer        │                     │
│  │  - AnimationChoreographer      │                     │
│  │  - AudioManager (stubbed)      │                     │
│  │  - TokenRenderer               │                     │
│  │  - RegionRenderer              │                     │
│  └──────────────┬─────────────────┘                     │
│                 │                                       │
│  ┌──────────────┴─────────────────┐                     │
│  │        Game Engine             │                     │
│  │  (pure functions, immutable)   │                     │
│  │                                │                     │
│  │  - State transitions           │                     │
│  │  - Legal move generation       │                     │
│  │  - Conquest cost calculation   │                     │
│  │  - Scoring                     │                     │
│  │  - Ability resolution          │                     │
│  │  - Phase state machine         │                     │
│  └──────────────┬─────────────────┘                     │
│                 │                                       │
│  ┌──────────────┴─────────────────┐                     │
│  │        Player Interface        │                     │
│  │  IPlayer.chooseAction()        │                     │
│  │                                │                     │
│  │  - HumanPlayer (UI input)      │                     │
│  │  - AIPlayer (heuristic)        │                     │
│  │  - HybridAIPlayer (future)     │                     │
│  └────────────────────────────────┘                     │
└─────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

- **Phaser Scenes**: Rendering and input only. No game logic. Scenes read state and dispatch actions.
- **Presentation Layer**: Translates state changes into visuals and audio. The AnimationChoreographer receives actions and plays tween sequences. Scenes delegate to this layer rather than creating animations directly.
- **Game Engine**: Pure functions operating on immutable state. Zero Phaser dependency. Fully unit-testable.
- **Player Interface**: Async abstraction over human input and AI decision-making. The game loop doesn't know or care which type of player is acting.

---

## 2. Game State Model

All state is represented as plain TypeScript interfaces. State is immutable — every action produces a new state object.

```typescript
// src/game/state/types.ts

interface GameState {
  turn: number;                        // 1-10
  round: number;                       // Tracks full rounds (both players)
  phase: TurnPhase;
  activePlayerIndex: 0 | 1;
  firstPlayerIndex: 0 | 1;            // Randomly assigned at game start
  players: readonly [PlayerState, PlayerState];
  board: BoardState;
  comboShop: ComboShopState;
  reinforcementDie: DieState | null;   // Non-null only during die phase
  log: readonly GameLogEntry[];        // Action history for replay/debugging
}

type TurnPhase =
  | 'selectCombo'
  | 'readyTroops'
  | 'conquest'
  | 'reinforcementDie'
  | 'redeploy'
  | 'score'
  | 'decline'
  | 'gameOver';

interface PlayerState {
  coins: number;
  activeRace: ActiveRaceState | null;
  declinedRaces: readonly DeclinedRaceState[];  // 0-1 declined races
  availableTokens: number;                       // Tokens in hand for placement
}

interface ActiveRaceState {
  raceId: RaceId;
  powerId: PowerId;
  totalTokens: number;                 // Total ever received
  tokensOnBoard: number;               // Currently placed on regions
  // Power-specific persistent state
  fortressesPlaced?: number;           // Fortified power tracking
  encampmentRegions?: readonly number[];
  heroRegions?: readonly [number, number];
  dragonRegion?: number;
  halflingHoles?: readonly number[];
}

interface DeclinedRaceState {
  raceId: RaceId;
  powerId: PowerId;
}

interface BoardState {
  regions: readonly RegionState[];
}

interface RegionState {
  id: number;
  terrain: Terrain;
  adjacentRegionIds: readonly number[];
  isEdge: boolean;
  isCoastal: boolean;                  // Borders a Sea/Lake
  hasMountain: boolean;
  hasMine: boolean;
  hasMagicSource: boolean;
  hasCavern: boolean;
  // Dynamic state
  owner: number | null;                // Player index
  tokens: number;
  isDeclined: boolean;
  hasLostTribe: boolean;
  // Special markers
  hasTrollLair: boolean;
  hasFortress: boolean;
  hasEncampment: boolean;
  hasHoleInTheGround: boolean;
  hasHero: boolean;
  hasDragon: boolean;
}

interface ComboShopState {
  visible: readonly ComboSlot[];       // 6 visible combos
  raceDeck: readonly RaceId[];         // Remaining races
  powerDeck: readonly PowerId[];       // Remaining powers
}

interface ComboSlot {
  raceId: RaceId;
  powerId: PowerId;
  coinsOnSlot: number;                 // Coins placed by players who skipped
}

type Terrain = 'mountain' | 'forest' | 'farmland' | 'hill'
             | 'swamp' | 'sea' | 'lake';

type RaceId = 'amazons' | 'dwarves' | 'elves' | 'ghouls' | 'giants'
            | 'halflings' | 'humans' | 'orcs' | 'ratmen' | 'skeletons'
            | 'sorcerers' | 'tritons' | 'trolls' | 'wizards';

type PowerId = 'alchemist' | 'berserk' | 'bivouacking' | 'commando'
             | 'dragonMaster' | 'flying' | 'forest'
             | 'fortified' | 'heroic' | 'hill' | 'merchant'
             | 'mounted' | 'pillaging' | 'seafaring'
             | 'stout' | 'swamp' | 'underworld' | 'wealthy';
```

---

## 3. Game Engine (Pure Functions)

The engine is a collection of pure functions. No side effects, no Phaser dependency, no mutation.

### 3.1 Project Structure

```
src/game/
  engine/
    actions.ts              # applyAction() — main state transition
    legalActions.ts         # getLegalActions() — enumerate valid moves
    conquestCost.ts         # calculateConquestCost()
    scoring.ts              # calculateScore()
    phaseTransition.ts      # getNextPhase() — state machine logic
    decline.ts              # applyDecline()
    comboShop.ts            # selectCombo(), replenishShop()
    redeployment.ts         # applyRedeployment()
    reinforcementDie.ts     # rollDie(), resolveReinforcement()
    setup.ts                # createInitialState()
  abilities/
    raceAbilities.ts        # Race modifier definitions + custom handlers
    powerAbilities.ts       # Power modifier definitions + custom handlers
    modifiers.ts            # Modifier types and resolution logic
  state/
    types.ts                # All TypeScript interfaces (from section 2)
  data/
    races.ts                # Race data: token counts, modifier tags
    powers.ts               # Power data: bonus tokens, modifier tags
    map2p.ts                # 2-player map: regions, polygons, adjacency
```

### 3.2 Core Action Interface

```typescript
// src/game/engine/actions.ts

type GameAction =
  | { type: 'selectCombo'; comboIndex: number }
  | { type: 'pickUpTokens'; regionId: number; count: number }
  | { type: 'conquer'; regionId: number }
  | { type: 'useReinforcement'; regionId: number; dieResult: number }
  | { type: 'redeploy'; deployment: ReadonlyMap<number, number> }
  | { type: 'decline' }
  | { type: 'endPhase' }
  | { type: 'ghoulConquer'; regionId: number }       // Ghouls in decline
  | { type: 'placeDragon'; regionId: number }         // Dragon Master
  | { type: 'sorcererConvert'; regionId: number }     // Sorcerers ability
  | { type: 'placeHeroes'; regionIds: [number, number] }
  | { type: 'placeEncampments'; regionIds: number[] }
  | { type: 'defenderRedeploy'; deployment: ReadonlyMap<number, number> };

function applyAction(state: GameState, action: GameAction): GameState {
  // 1. Validate action is legal
  // 2. Produce new state
  // 3. Append to log
  // Returns new GameState (original untouched)
}

function getLegalActions(state: GameState): GameAction[] {
  // Based on current phase + board state + active abilities
  // Returns all valid actions for the active player
}
```

### 3.3 Phase State Machine

```typescript
// src/game/engine/phaseTransition.ts

function getNextPhase(state: GameState, completedAction: GameAction): TurnPhase {
  const current = state.phase;
  const player = state.players[state.activePlayerIndex];

  switch (current) {
    case 'selectCombo':
      // If player has Ghouls in decline, they act first
      return hasGhoulsInDecline(player) ? 'ghoulConquest' : 'readyTroops';

    case 'readyTroops':
      return 'conquest';

    case 'conquest':
      if (completedAction.type === 'endPhase') {
        return canUseReinforcementDie(state) ? 'reinforcementDie' : 'redeploy';
      }
      return 'conquest'; // Stay in conquest phase

    case 'reinforcementDie':
      return 'redeploy';

    case 'redeploy':
      return 'score';

    case 'score':
      // Stout power: can decline after scoring
      if (hasStoutPower(player) && !hasDeclinedThisTurn(state)) {
        return 'optionalDecline';
      }
      return advanceTurn(state);

    case 'decline':
      return 'score'; // Score after declining

    // ... etc
  }
}

function advanceTurn(state: GameState): TurnPhase {
  // Switch active player, advance turn counter if needed
  // Check for game over (turn 10 complete)
  // Return 'selectCombo' if new player needs a race, else 'readyTroops'
}
```

---

## 4. Ability System (Modifier/Tag)

### 4.1 Modifier Types

```typescript
// src/game/abilities/modifiers.ts

interface AbilityModifiers {
  // Conquest cost modifiers
  conquestCostModifier?: number;                     // Flat modifier (e.g., Commando: -1)
  conquestCostTerrainModifier?: {                    // Terrain-specific (e.g., Mounted: -1 on hill/farmland)
    terrains: Terrain[];
    modifier: number;
  };
  conquestCostCoastalModifier?: number;              // Tritons: -1 coastal
  conquestCostAdjacentTerrainModifier?: {            // Giants: -1 adjacent to own mountain
    terrain: Terrain;
    modifier: number;
  };
  conquestCostCavernModifier?: number;               // Underworld: -1 cavern

  // Movement modifiers
  ignoreAdjacency?: boolean;                         // Flying
  canConquerSeas?: boolean;                          // Seafaring
  firstConquestAnywhere?: boolean;                   // Halflings
  cavernsAdjacent?: boolean;                         // Underworld

  // Scoring modifiers
  bonusPerTerrain?: {                                // Humans, Wizards, Forest, Hill, Swamp
    terrain: Terrain;
    bonus: number;
  };
  bonusPerRegionFeature?: {                          // Dwarves (mines)
    feature: 'mine' | 'magic' | 'cavern';
    bonus: number;
    appliesInDecline?: boolean;
  };
  bonusPerRegion?: number;                           // Merchant: +1 per region
  bonusPerNonEmptyConquest?: number;                 // Orcs, Pillaging
  flatBonusPerTurn?: number;                         // Alchemist: +2
  firstTurnBonus?: number;                           // Wealthy: +7

  // Token modifiers
  conquestOnlyTokens?: number;                       // Amazons: +4 during conquest only
  tokensPerConquests?: {                             // Skeletons: +1 per 2 non-empty conquests
    nonEmptyConquestsRequired: number;
    tokensGained: number;
  };

  // Defense modifiers
  placesLair?: boolean;                              // Trolls
  noDefeatCasualties?: boolean;                      // Elves

  // Decline modifiers
  keepAllTokensInDecline?: boolean;                  // Ghouls
  // (Spirit power removed — declineRacesSurvive no longer needed)
  canDeclineAfterConquest?: boolean;                 // Stout

  // Conquest die
  berserkDie?: boolean;                              // Berserk: die on every conquest
}
```

### 4.2 Race & Power Data

```typescript
// src/game/data/races.ts

interface RaceDefinition {
  id: RaceId;
  name: string;
  baseTokens: number;
  modifiers: AbilityModifiers;
  customHandler?: string;   // Key to lookup custom logic for complex abilities
  tooltip: string;
}

const RACES: Record<RaceId, RaceDefinition> = {
  amazons: {
    id: 'amazons',
    name: 'Amazons',
    baseTokens: 6,
    modifiers: { conquestOnlyTokens: 4 },
    tooltip: '+4 tokens for conquest only. Remove 4 from map after redeployment.',
  },
  dwarves: {
    id: 'dwarves',
    name: 'Dwarves',
    baseTokens: 3,
    modifiers: { bonusPerRegionFeature: { feature: 'mine', bonus: 1, appliesInDecline: true } },
    tooltip: '+1 Victory Coin per Mine region (Active or In Decline).',
  },
  // ... etc for all 14 races
};
```

### 4.3 Custom Handlers

For abilities too complex to express as modifiers (Sorcerers, Dragon Master, Halflings, Heroic):

```typescript
// src/game/abilities/raceAbilities.ts

type CustomAbilityHandler = {
  modifyLegalActions?: (state: GameState, actions: GameAction[]) => GameAction[];
  onConquest?: (state: GameState, regionId: number) => GameState;
  onDecline?: (state: GameState) => GameState;
  onTurnEnd?: (state: GameState) => GameState;
  onTurnStart?: (state: GameState) => GameState;
};

const CUSTOM_HANDLERS: Record<string, CustomAbilityHandler> = {
  sorcerers: {
    modifyLegalActions: (state, actions) => {
      // Add sorcererConvert actions for adjacent lone enemy tokens
      // Limited to once per opponent per turn
    },
  },
  dragonMaster: {
    modifyLegalActions: (state, actions) => {
      // Add placeDragon action (1 token conquers, ignores defense)
    },
  },
  halflings: {
    onConquest: (state, regionId) => {
      // Place Hole-in-the-Ground on first 2 conquered regions
    },
  },
  // ... etc
};
```

### 4.4 Modifier Resolution

```typescript
// src/game/engine/conquestCost.ts

function calculateConquestCost(state: GameState, regionId: number): number {
  const region = getRegion(state, regionId);
  const player = getActivePlayer(state);
  const modifiers = getActiveModifiers(player); // Merged from race + power

  let cost = 2; // Base cost

  // Region contents
  cost += region.tokens;
  cost += region.hasLostTribe ? 1 : 0;
  cost += region.hasMountain ? 1 : 0;
  cost += region.hasTrollLair ? 1 : 0;
  cost += region.hasFortress ? 1 : 0;
  cost += region.hasEncampment ? 1 : 0;

  // Apply modifiers
  if (modifiers.conquestCostModifier) {
    cost += modifiers.conquestCostModifier;
  }
  if (modifiers.conquestCostTerrainModifier &&
      modifiers.conquestCostTerrainModifier.terrains.includes(region.terrain)) {
    cost += modifiers.conquestCostTerrainModifier.modifier;
  }
  if (modifiers.conquestCostCoastalModifier && region.isCoastal) {
    cost += modifiers.conquestCostCoastalModifier;
  }
  // ... etc

  return Math.max(1, cost); // Minimum 1 token to conquer
}
```

---

## 5. Phaser Scene Architecture

### 5.1 Scene Graph

```
Boot Scene (sequential)
  └─→ MainMenu Scene (sequential)
       └─→ Board Scene + HUD Scene (parallel, launched together)
```

### 5.2 Board Scene

Responsible for: map rendering, token rendering, region interaction, pan/zoom camera.

```
Board Scene
├── Map Layer
│   ├── Background image (pre-rendered map)
│   └── Region hit zones (invisible interactive polygons)
├── Overlay Layer
│   ├── Region highlights (valid targets, selection, ownership borders)
│   └── Special markers (mountains, fortresses, lairs, holes, etc.)
├── Token Layer
│   ├── Race tokens (colored circles w/ race initial, grouped per region)
│   └── Lost Tribe tokens
└── Camera
    ├── Pan: pointer drag
    ├── Zoom: scroll wheel (clamped min/max)
    └── Auto-focus: smooth pan/zoom to relevant area during key moments
```

### 5.3 HUD Scene

Fixed camera, overlays the Board Scene. Responsible for: turn info, player dashboards, action buttons, phase indicator.

```
HUD Scene (fixed camera, no pan/zoom)
├── Turn Track (top or left)
│   └── Turn markers 1-10, current turn highlighted
├── Phase Indicator (top center)
│   └── Current phase name + active player
├── Player 1 Dashboard (bottom-left)
│   ├── Race banner + power badge
│   ├── Token count (available in hand)
│   └── Victory coin total
├── Player 2 Dashboard (bottom-right)
│   └── (same as Player 1)
├── Action Panel (bottom center)
│   ├── Context-sensitive buttons (End Conquest, Decline, Roll Die, etc.)
│   └── Confirm / Cancel for redeployment
├── Combo Shop Panel (right side or modal)
│   └── 6 visible combos with costs
└── Reinforcement Die Area
    └── Die display + roll button
```

### 5.4 Scene Communication

Scenes communicate through a shared event bus and a reference to the game engine:

```typescript
// src/game/GameController.ts

class GameController {
  private state: GameState;
  private players: [IPlayer, IPlayer];
  private eventBus: Phaser.Events.EventEmitter;
  private choreographer: AnimationChoreographer;

  async gameLoop(): Promise<void> {
    while (this.state.phase !== 'gameOver') {
      const player = this.players[this.state.activePlayerIndex];
      const legalActions = getLegalActions(this.state);

      // Emit state for scenes to render
      this.eventBus.emit('stateChanged', this.state, legalActions);

      // Wait for player decision
      const action = await player.chooseAction(this.state, legalActions);

      // Compute new state
      const newState = applyAction(this.state, action);

      // Animate the transition
      await this.choreographer.playAction(action, this.state, newState);

      // Commit new state
      this.state = newState;
    }

    this.eventBus.emit('gameOver', this.state);
  }
}
```

---

## 6. Animation Choreographer

Centralized module that translates game actions into Phaser tween sequences.

```typescript
// src/game/presentation/AnimationChoreographer.ts

class AnimationChoreographer {
  private scene: Phaser.Scene;  // Board scene reference
  private speed: number = 1;    // Playback multiplier (for AI-vs-AI)

  async playAction(
    action: GameAction,
    prevState: GameState,
    nextState: GameState
  ): Promise<void> {
    switch (action.type) {
      case 'conquer':
        await this.playConquest(action, prevState, nextState);
        break;
      case 'selectCombo':
        await this.playComboSelection(action, prevState, nextState);
        break;
      case 'decline':
        await this.playDecline(prevState, nextState);
        break;
      case 'redeploy':
        await this.playRedeployment(action, prevState, nextState);
        break;
      case 'useReinforcement':
        await this.playDieRoll(action, prevState, nextState);
        break;
      // ... etc
    }
  }

  private async playConquest(
    action: GameAction,
    prev: GameState,
    next: GameState
  ): Promise<void> {
    const duration = 400 / this.speed;
    // 1. Camera auto-focus on target region
    // 2. Attacking tokens slide into region
    // 3. Defending tokens scatter/discard (if any)
    // 4. Impact effect + sound stub
    // 5. Region border updates to attacker's color
  }

  setSpeed(multiplier: number): void {
    this.speed = multiplier;
  }
}
```

---

## 7. Audio Manager (Stubbed)

```typescript
// src/game/presentation/AudioManager.ts

interface IAudioManager {
  playTokenPlace(): void;
  playTokenSlide(): void;
  playConquest(): void;
  playDieRoll(): void;
  playCoinScore(): void;
  playDecline(): void;
  playTurnTransition(): void;
  playVictory(): void;
  setAmbient(on: boolean): void;
  setVolume(volume: number): void;
}

class StubAudioManager implements IAudioManager {
  playTokenPlace(): void { /* no-op, log in dev */ }
  playTokenSlide(): void { /* no-op */ }
  playConquest(): void { /* no-op */ }
  playDieRoll(): void { /* no-op */ }
  playCoinScore(): void { /* no-op */ }
  playDecline(): void { /* no-op */ }
  playTurnTransition(): void { /* no-op */ }
  playVictory(): void { /* no-op */ }
  setAmbient(on: boolean): void { /* no-op */ }
  setVolume(volume: number): void { /* no-op */ }
}

// In M5, replace with:
// class PhaserAudioManager implements IAudioManager { ... }
```

---

## 8. Player Interface

```typescript
// src/game/players/IPlayer.ts

interface IPlayer {
  readonly type: 'human' | 'ai';
  readonly name: string;
  chooseAction(state: GameState, legalActions: GameAction[]): Promise<GameAction>;
}
```

### 8.1 Human Player

Resolves when the user clicks a valid UI element. The Board and HUD scenes display legal actions as interactive highlights/buttons. Clicking one resolves the promise.

```typescript
class HumanPlayer implements IPlayer {
  readonly type = 'human';

  chooseAction(state: GameState, legalActions: GameAction[]): Promise<GameAction> {
    return new Promise((resolve) => {
      this.eventBus.once('playerAction', (action: GameAction) => {
        resolve(action);
      });
    });
  }
}
```

### 8.2 AI Player (Heuristic)

Returns immediately (wrapped in async). Difficulty levels determine strategy sophistication.

```typescript
class AIPlayer implements IPlayer {
  readonly type = 'ai';
  private difficulty: 'easy' | 'medium' | 'hard';

  async chooseAction(state: GameState, legalActions: GameAction[]): Promise<GameAction> {
    // Add small delay for visual pacing
    await delay(500 / this.speed);

    switch (this.difficulty) {
      case 'easy':   return this.randomChoice(legalActions);
      case 'medium': return this.heuristicChoice(state, legalActions);
      case 'hard':   return this.lookaheadChoice(state, legalActions);
    }
  }
}
```

---

## 9. Map Data (Hand-Authored JSON)

### 9.1 Structure

```typescript
// src/game/data/map2p.ts

interface MapRegionData {
  id: number;
  name: string;                        // Descriptive name for tooltips/LLM
  terrain: Terrain;
  polygon: readonly [number, number][]; // Vertex coordinates (relative to map image)
  center: [number, number];            // Token placement anchor
  adjacentRegionIds: readonly number[];
  isEdge: boolean;
  isCoastal: boolean;
  // Initial setup markers
  hasLostTribe: boolean;
  hasMountain: boolean;
  hasMine: boolean;
  hasMagicSource: boolean;
  hasCavern: boolean;
}

interface MapData {
  imageKey: string;                    // Phaser asset key for map background
  imageWidth: number;
  imageHeight: number;
  regions: readonly MapRegionData[];
}
```

### 9.2 Coordinate System

- Coordinates are in pixels, relative to the top-left corner of the map image
- Polygons are arrays of `[x, y]` vertex pairs, wound clockwise
- The map image will be placed at `(0, 0)` in the Board scene; all polygon coords are in the same space
- Region `center` is the visual centroid used for token placement and camera focus

---

## 10. Token Rendering (Placeholder → Sprite-Ready)

```typescript
// src/game/presentation/TokenRenderer.ts

interface ITokenRenderer {
  renderRegionTokens(region: RegionState, center: [number, number]): void;
  clearRegion(regionId: number): void;
  animateTokenMovement(from: [number, number], to: [number, number]): Promise<void>;
}

class PlaceholderTokenRenderer implements ITokenRenderer {
  // Draws colored circles with race initial letter
  // Player 1: blue tones, Player 2: red tones
  // Active: solid fill, bold border
  // Declined: gray fill, dashed border, reduced alpha
  // Stacks tokens in a tight cluster around region center
}

// Future:
// class SpriteTokenRenderer implements ITokenRenderer { ... }
```

### Token Stacking

When a region has multiple tokens, they arrange in a tight cluster:
- 1 token: centered
- 2-3 tokens: triangular arrangement
- 4+ tokens: circular arrangement with count label overlay

---

## 11. Testing Strategy

### 11.1 Vitest (Unit Tests)

All pure game engine functions tested in isolation:

```
tests/unit/
  engine/
    actions.test.ts           # State transitions for each action type
    legalActions.test.ts      # Legal move generation per phase
    conquestCost.test.ts      # Conquest cost with all modifier combos
    scoring.test.ts           # Scoring with all race/power bonuses
    phaseTransition.test.ts   # State machine transitions
    decline.test.ts           # Decline mechanics (Ghouls, Stout)
    comboShop.test.ts         # Combo selection and shop replenishment
  abilities/
    raceAbilities.test.ts     # Each of 14 races
    powerAbilities.test.ts    # Each of 20 powers
    interactions.test.ts      # Race + power combo edge cases
  data/
    map2p.test.ts             # Map adjacency consistency, all regions have required fields
```

### 11.2 Playwright (E2E)

UI interaction and rendering verification:

```
tests/e2e/
  gameSetup.spec.ts           # Game starts, map renders, shop displays
  comboSelection.spec.ts      # Clicking a combo works, coins animate
  conquest.spec.ts            # Clicking valid targets conquers them
  turnFlow.spec.ts            # Full turn cycle completes
  endGame.spec.ts             # Game ends at turn 10, scores display
```

---

## 12. Project File Structure (Target)

```
src/
  main.ts                            # Phaser game bootstrap
  game/
    config.ts                        # Phaser GameConfig
    GameController.ts                # Game loop orchestrator
    scenes/
      Boot.ts                        # Asset preloading
      MainMenu.ts                    # Title screen + game setup
      Board.ts                       # Map, tokens, regions (pan/zoom camera)
      HUD.ts                         # Fixed overlay: turn track, dashboards, actions
    engine/
      actions.ts                     # applyAction()
      legalActions.ts                # getLegalActions()
      conquestCost.ts                # calculateConquestCost()
      scoring.ts                     # calculateScore()
      phaseTransition.ts             # Phase state machine
      decline.ts                     # Decline logic
      comboShop.ts                   # Shop management
      redeployment.ts                # Token redistribution
      reinforcementDie.ts            # Die mechanics
      setup.ts                       # createInitialState()
    abilities/
      modifiers.ts                   # Modifier types and resolution
      raceAbilities.ts               # Race-specific custom handlers
      powerAbilities.ts              # Power-specific custom handlers
    state/
      types.ts                       # All game state interfaces
    data/
      races.ts                       # 14 race definitions
      powers.ts                      # 20 power definitions
      map2p.ts                       # 2-player map data (polygons, adjacency)
    players/
      IPlayer.ts                     # Player interface
      HumanPlayer.ts                 # UI-driven player
      AIPlayer.ts                    # Heuristic AI
    presentation/
      AnimationChoreographer.ts      # Centralized animation sequencing
      AudioManager.ts                # IAudioManager + StubAudioManager
      TokenRenderer.ts               # ITokenRenderer + PlaceholderTokenRenderer
      RegionRenderer.ts              # Hit zones, highlights, overlays
  assets/
    images/                          # Map image, placeholder art
    reference/                       # Rulebook, map photo
tests/
  unit/                              # Vitest tests for game engine
  e2e/                               # Playwright tests for UI
```

---

## 13. Implementation Milestones (Aligned with PRD)

### M1: Core Engine
- Game state types and immutable state management
- Phase state machine
- Basic conquest mechanics (cost calculation, legal moves)
- 2-player map data (hand-authored polygons)
- Board + HUD scenes with placeholder rendering
- Human vs. Human hot-seat (basic)

### M2: Complete Rules
- All 14 races with abilities
- All 20 powers with abilities
- Decline mechanics (Ghouls, Stout edge cases)
- Scoring with all bonuses
- Reinforcement die
- Ready troops phase
- Defender redeployment
- Comprehensive Vitest test suite

### M3: Map & Visuals
- Pre-rendered map image (AI-generated or hand-painted)
- Region overlays (ownership borders, highlights)
- Sprite-based tokens (replace placeholders)
- Combo shop visual layout
- Player dashboards

### M4: Animations
- AnimationChoreographer with sequences for all actions
- Camera auto-focus during key moments
- Token movement, conquest impact, decline transitions
- Dice roll animation
- Coin cascade scoring animation

### M5: Audio
- Replace StubAudioManager with PhaserAudioManager
- Source/generate all sound effects
- Ambient background track
- Volume controls

### M6: AI Opponents
- Easy AI (random valid moves)
- Medium AI (heuristic strategy)
- Hard AI (lookahead / hybrid with LLM)
- AI vs. AI spectator mode with speed controls

### M7: Canvas & Polish
- Pan/zoom tuning (elastic bounds, min/max zoom)
- Contextual tooltips for all game elements
- End-game screen with score breakdown
- Minimap or quick-nav shortcuts

### M8: Playtesting & Launch
- Bug fixes from playtesting
- Balance tuning for AI
- Performance optimization
- Playwright E2E test coverage
