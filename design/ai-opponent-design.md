# AI Opponent Design Analysis for Small World (Web)

## 0. CC Prompt

Help me think through and decide on how to implement the       
  following feature in the game.  I want the ability for the     
  user to play the game against the computer component.  The     
  challenge is that the rules of this game are farily complex.   
  See the @"src/assets/reference/small world rule book.pdf" for  
  the complete set of rules.  What are some options for          
  developing a computer-based oponent for this game?  Recall     
  that this will be a web-based game played in the browser.  I   
  also want to have the ability for two human players, but don't 
   focus on that requirement in this analysis, just keep it in   
  mind.  Some options for developing the computer component that 
   come to mind include: 1. building the rules engine and the    
  component into the game, 2. esposing a set of APIs, or perhaps 
   an MCP, so that out of the box AI tools can play the game, 3. 
   Using a generic AI tool to play the game via the browser, 4.  
   developing a special-built agent to play the game (either via 
   the browser, or the apis/mcp).  Critique and expand on thse   
  options, and also offer additional suggestion.  Output your    
  analysis in the design folder in the file                      
  ai-opponent-design.md  

## 1. Overview

This document analyzes approaches for implementing a computer opponent in the web-based Small World board game. The project uses Phaser.js v3 + TypeScript + Vite, currently containing only UI scaffolding (Boot, MainMenu, Game scenes) with no game logic, state management, or rules engine.

**Key constraint**: The game must support both human-vs-human and human-vs-computer play. This means a rules engine and game state manager are required regardless of which AI approach is chosen. The only exception is Option 3 (browser-based generic AI), which could theoretically play against a fully manual human-vs-human implementation — but even that scenario benefits enormously from a proper state manager for validation and UI rendering.

**The real question is not "rules engine vs. no rules engine" but rather "where does the AI decision-making logic live?"**

### Decision Space Complexity

Small World's branching factor per turn is significant:

| Decision Point | Approximate Options per Turn |
|---|---|
| Race/Power combo selection | 5 visible + skip option (pay coins) |
| First conquest target | ~6-10 edge regions |
| Subsequent conquest targets | ~3-8 adjacent regions per step |
| Token redeployment | Combinatorial across N controlled regions |
| Decline timing | Binary per turn, but evaluating "when" is the hard part |
| Reinforcement die usage | 1 target region (with 0-3 random bonus) |

A single turn may involve 5-15 sequential decisions. Over a 10-turn game, the total decision tree is enormous but narrower than Chess or Go because many branches are clearly suboptimal (e.g., attacking a heavily defended interior region when an undefended edge region exists).

---

## 2. The Foundational Layer: Rules Engine and Game State

Before evaluating AI approaches, it is critical to acknowledge that **all approaches require a shared foundation**. This section defines what that foundation must contain.

### 2.1 Game State Model (required by all approaches)

```
src/game/state/
  GameState.ts          // Top-level state: turn, phase, players, board, combos
  Player.ts             // Coins, active race, declined race, token counts
  Board.ts              // Region graph: adjacency, terrain, tokens, ownership
  RacePowerCombo.ts     // The 280 possible combos, with abilities
  Region.ts             // Terrain type, lost tribe, mountain, symbols
```

Minimum state representation (conceptual TypeScript):

```typescript
interface GameState {
  turn: number;                    // 1-10
  phase: TurnPhase;                // 'selectCombo' | 'conquest' | 'redeploy' | 'score'
  activePlayer: 0 | 1;
  players: [PlayerState, PlayerState];
  board: RegionState[];            // ~16 regions for 2-player map
  comboTrack: RacePowerCombo[];    // 5 visible + coins placed on skipped
  reinforcementDieResult?: number; // 0-3, rolled once per turn
}

interface PlayerState {
  coins: number;                   // Victory points (hidden from opponent)
  activeRace: ActiveRace | null;
  declinedRace: DeclinedRace | null;
  availableTokens: number;
}

interface RegionState {
  id: number;
  terrain: Terrain;
  adjacentTo: number[];
  isEdge: boolean;                 // Can be first conquest target
  hasLostTribe: boolean;
  hasMountain: boolean;
  hasMine: boolean;
  hasMagicSource: boolean;
  owner: number | null;            // Player index or null
  tokens: number;
  isDeclined: boolean;             // Tokens from declined race
  specialDefense: number;          // Troll lairs, fortifications, etc.
}
```

### 2.2 Rules Engine (required by all approaches except possibly Option 3)

```
src/game/engine/
  RulesEngine.ts        // Validates moves, computes conquest costs
  TurnManager.ts        // Phase sequencing, turn transitions
  ScoringEngine.ts      // Computes coins per race/power/region
  AbilityResolver.ts    // Race and power special abilities
  ConquestCalculator.ts // Tokens needed = 2 + defenders + terrain mods
```

The rules engine must handle:
- **Legal move generation**: Given a state, enumerate all valid actions
- **State transitions**: Apply an action to produce a new state
- **Conquest cost calculation**: 2 base + occupant tokens + terrain modifiers - power discounts
- **Scoring**: Per-region coin calculation with race/power bonuses
- **Decline mechanics**: Flip active race, remove all-but-one token per region, clear abilities
- **Race/power abilities**: 14 races × 20 powers = 34 unique ability effects

### 2.3 Action Interface

All AI approaches benefit from a clean action interface:

```typescript
type GameAction =
  | { type: 'selectCombo'; comboIndex: number }
  | { type: 'conquer'; regionId: number }
  | { type: 'useReinforcement'; regionId: number }
  | { type: 'redeploy'; deployment: Map<number, number> }
  | { type: 'decline' }
  | { type: 'endTurn' };

interface GameEngine {
  getState(): GameState;
  getLegalActions(): GameAction[];
  applyAction(action: GameAction): GameState;
  simulateAction(action: GameAction): GameState; // Non-mutating
}
```

---

## 3. Option 1: Built-in Rules Engine + Algorithmic AI

### 3.1 Architecture

All game logic and AI decision-making lives in the TypeScript codebase. The AI is a module that receives `GameState`, calls `getLegalActions()`, evaluates positions using heuristics, and returns a `GameAction`.

```
src/game/ai/
  AIPlayer.ts           // Main entry: receives state, returns action
  Evaluator.ts          // Board evaluation heuristics
  ConquestPlanner.ts    // Greedy/search-based conquest ordering
  DeclineOracle.ts      // "Should I decline this turn?" heuristic
  ComboRanker.ts        // Evaluate race/power combo value
  TokenDeployer.ts      // Optimal defensive redeployment
```

### 3.2 AI Strategy Implementation

**Combo Selection**: Score each visible combo based on:
- Token count (more = more conquests)
- Synergy with current board state (e.g., Hill Giants when hills are available)
- Opponent vulnerability (e.g., Sorcerers when opponent has many lone tokens)
- Coin cost of skipping (opportunity cost)

**Conquest Ordering**: Greedy approach with lookahead:
1. Enumerate all legal conquest targets
2. Score each by: coins gained, strategic position, tokens required, opponent disruption
3. Use Dijkstra-like pathfinding (as in the [existing C# reference implementation](https://github.com/Julien-Marcou/SmallWorld)) for multi-step conquest chains
4. Optionally: 1-2 ply minimax for critical decisions

**Decline Timing**: The hardest heuristic. Evaluate:
- Current race's remaining productivity (tokens vs. available targets)
- Best available combo on the track
- Turns remaining (declining on turn 9 is almost always wrong)
- Opponent's race strength (if they are about to decline, timing matters)

**Redeployment**: Minimize vulnerability:
- At least 1 token per region (minimum)
- Extra tokens on borders adjacent to opponent
- Consider race abilities (Trolls want lairs everywhere)

### 3.3 Difficulty Levels

| Level | Strategy |
|---|---|
| Easy | Random legal moves with slight bias toward undefended regions |
| Medium | Greedy heuristic evaluation, no lookahead |
| Hard | Greedy + 1-ply lookahead for conquests, smart decline timing |

### 3.4 Pros

- **Zero latency**: All computation is local, instant response
- **No external dependencies**: Works offline, no API keys, no network
- **Deterministic and testable**: Unit test every heuristic, replay games for debugging
- **Full control**: Can tune difficulty precisely, add personality traits
- **Minimal bundle size impact**: AI logic is lightweight TypeScript
- **Privacy**: No game state leaves the browser

### 3.5 Cons

- **Significant development effort** for sophisticated heuristics (the rules engine is already required; this adds the strategy layer)
- **Hard ceiling on quality**: Heuristic AI will never discover novel strategies
- **Maintenance burden**: Every new race/power/expansion requires AI updates
- **The "decline timing" problem**: This is notoriously hard to solve with heuristics — the [official digital game's AI still gets it wrong](https://steamcommunity.com/app/235620/discussions/0/558756255722402919/)

### 3.6 Implementation Complexity

- **Rules engine**: High (3-5 weeks) — required regardless
- **AI layer**: Medium-High (2-4 weeks for medium-quality AI)
- **Total**: 5-9 weeks

### 3.7 Expected AI Quality

Medium. With good heuristics, the AI will play competently (better than the criticized Small World 2 AI) but will have predictable weaknesses. Decline timing will remain the Achilles heel unless significant effort is invested in evaluating future-turn value.

---

## 4. Option 2: API/MCP Interface for External AI

### 4.1 Architecture

The game exposes its state and actions through a programmatic interface (REST API, WebSocket, or MCP tools). An external AI process connects to this interface, reads game state as structured data, and submits actions.

```
                    +------------------+
                    |  Phaser.js UI    |
                    |  (Browser)       |
                    +--------+---------+
                             |
                    +--------+---------+
                    |  Game Engine     |  <-- Rules engine (in-browser)
                    |  + State Manager |
                    +--------+---------+
                             |
                    +--------+---------+
                    |  API Layer       |  <-- WebSocket or HTTP or MCP
                    |  (Bridge)        |
                    +--------+---------+
                             |
              +--------------+--------------+
              |                             |
    +---------+----------+    +-------------+----------+
    |  LLM Agent         |    |  Custom Python Bot     |
    |  (Claude/GPT via   |    |  (MCTS, RL, etc.)      |
    |   MCP or API)      |    |                        |
    +--------------------+    +------------------------+
```

#### 4.1a MCP Variant

Expose game actions as MCP tools that an LLM can call directly:

```
Tools:
  sw_get_state          -> Returns full GameState as JSON
  sw_get_legal_actions  -> Returns legal actions
  sw_select_combo       -> { comboIndex: number }
  sw_conquer            -> { regionId: number }
  sw_redeploy           -> { deployment: Record<number, number> }
  sw_decline            -> {}
  sw_end_turn           -> {}
```

This would be implemented as an MCP server (Node.js) that communicates with the game engine. The MCP server could run alongside the Vite dev server or as a separate process. The project already has MCP infrastructure configured in `.claude-plugin/.mcp.json`.

#### 4.1b REST/WebSocket Variant

A lightweight HTTP or WebSocket server exposes the same interface. Any client (Python, Rust, another JS process) can connect.

### 4.2 Pros

- **Separation of concerns**: Game engine and AI are independently developable and testable
- **LLM-powered strategy**: An LLM can reason about "should I decline?" in ways heuristics cannot — it can evaluate narrative strategy ("my Skeletons have 3 tokens left and the Elves combo is available, so declining now gives me a fresh army next turn")
- **Extensible**: Swap AI implementations without touching game code
- **Multi-agent experimentation**: Pit different AIs against each other
- **MCP ecosystem**: If using MCP, the AI can be any MCP-compatible client (Claude Desktop, custom agents, etc.)
- **Community/hackability**: Other developers could build their own AI opponents

### 4.3 Cons

- **Latency**: LLM API calls take 1-5 seconds per decision; a turn with 5-8 decisions means 5-40 seconds of waiting
- **Cost**: LLM API calls cost money. A full game might be 100-200 decisions = $0.50-$5.00 per game depending on model and context size
- **Reliability**: API failures, rate limits, malformed responses require robust error handling and retry logic
- **State serialization**: Game state must be serialized to JSON in a way the LLM can understand (~16 regions with various properties — manageable but requires careful prompt engineering)
- **External dependency**: Requires API keys, network access, and a running LLM service
- **Prompt engineering effort**: Getting an LLM to play well requires iterating on system prompts, state formatting, and possibly few-shot examples
- **Still requires rules engine**: The LLM proposes actions; the engine must validate them

### 4.4 Implementation Complexity

- **Rules engine**: High (3-5 weeks) — same as Option 1
- **API/MCP bridge**: Low-Medium (1-2 weeks)
- **LLM prompt engineering**: Medium (2-3 weeks of iteration)
- **Total**: 6-10 weeks

### 4.5 Expected AI Quality

Potentially high, but inconsistent. LLMs excel at strategic reasoning when given clear state representations. [Research on LLM game agents](https://github.com/lmgame-org/GamingAgent) shows they can match or exceed heuristic AI for strategy games when properly prompted. However:
- LLMs may make occasional nonsensical moves
- Quality depends heavily on prompt engineering
- Decline timing (the hardest decision) is where LLMs could shine — they can reason about opportunity cost in natural language
- Quality will improve over time as models improve, with zero code changes

### 4.6 Latency Mitigation Strategies

- **Pre-compute during opponent's turn**: Start the AI thinking while the human is playing
- **Batch decisions**: Send full turn context and ask for a complete turn plan rather than one action at a time
- **Streaming responses**: Show "AI is thinking..." with a progress indicator
- **Smaller models**: Use a fast model (Claude Haiku, GPT-4o-mini) for tactical decisions, larger model for strategic decisions (decline timing)

---

## 5. Option 3: Generic AI via Browser Automation

### 5.1 Architecture

A generic AI agent (such as [browser-use](https://github.com/browser-use/browser-use), Playwright-based agent, or a vision-language model) interacts with the game entirely through the browser UI. It reads the screen (screenshots or DOM), interprets the game state visually, and clicks UI elements to play.

```
    +-------------------+
    |  Phaser.js Game   |  <-- Renders to <canvas>
    |  (Browser Tab)    |
    +--------+----------+
             |  (screenshots / DOM)
    +--------+----------+
    |  Browser Agent    |  <-- browser-use, Playwright, etc.
    |  (VLM + actions)  |
    +-------------------+
```

### 5.2 Pros

- **No rules engine strictly required for AI**: The AI plays the game as a human would (though you still need one for human-vs-human validation and UI rendering logic)
- **Tests the UI naturally**: The AI is also a user-experience test
- **Impressive demo**: "Watch the AI play in the browser" is visually compelling
- **Model-agnostic**: Any VLM that can see and click can play

### 5.3 Cons

- **Fundamentally unreliable**: Phaser renders to `<canvas>`, which is opaque to DOM inspection. The agent must rely on screenshots, which means:
  - It cannot reliably read small text (coin counts, token numbers)
  - It cannot distinguish similar-looking tokens or terrain types
  - Region boundaries are irregular polygons that are hard to parse visually
  - Any UI redesign breaks the agent
- **Extremely slow**: Each action requires: screenshot → VLM inference → coordinate calculation → click → wait for animation → screenshot again. A single turn could take 2-5 minutes.
- **Very expensive**: Every screenshot requires a VLM call. A game might need 200+ screenshots = significant API cost.
- **Fragile**: UI changes, animation timing, popups, or any visual variation can break the agent.
- **Poor play quality**: The agent spends most of its "intelligence budget" on understanding the UI rather than strategy.
- **Debugging nightmare**: When the AI makes a bad move, was it because it misread the screen or because it had bad strategy? Nearly impossible to diagnose.
- **You still need game logic**: Even for human-vs-human, you need move validation, state tracking, scoring, etc.

### 5.4 Implementation Complexity

- **Rules engine**: Still High (3-5 weeks) for the game itself
- **Browser agent setup**: Medium (1-2 weeks for browser-use integration)
- **VLM prompt engineering for visual game understanding**: Very High (4-8 weeks, and may never be reliable)
- **Total**: 8-15 weeks, with high uncertainty

### 5.5 Expected AI Quality

Low. The [GamingAgent research (ICLR 2026)](https://github.com/lmgame-org/GamingAgent) shows VLM agents struggle with board games that require precise spatial reasoning and counting. Small World's map has overlapping tokens, terrain symbols, and irregular region shapes that are hard for VLMs to parse reliably.

### 5.6 Verdict

**Not recommended as a primary approach.** Could serve as a secondary "fun mode" or demo, but should not be the primary AI opponent strategy.

---

## 6. Option 4: Special-built Hybrid Agent

### 6.1 Architecture

A dedicated agent built specifically for Small World, combining structured game knowledge with AI capabilities. Unlike Option 3, this agent uses the API/state interface (not raw screenshots) but is more sophisticated than a simple LLM prompt.

```
    +-------------------+
    |  Game Engine      |  <-- Rules engine + state (in-browser or server)
    +--------+----------+
             | (structured API)
    +--------+----------+
    |  SW Agent         |
    |  +--------------+ |
    |  | Strategy LLM | |  <-- High-level: "decline or keep going?"
    |  +--------------+ |
    |  | Tactical Eng. | |  <-- Heuristic: conquest ordering, token math
    |  +--------------+ |
    |  | Memory/Learn  | |  <-- Game history, opponent modeling
    |  +--------------+ |
    +-------------------+
```

This is a hybrid architecture: the agent uses an LLM for high-level strategic decisions (combo selection, decline timing) but uses fast local heuristics for tactical execution (conquest ordering, redeployment, token math).

### 6.2 Decision Routing

| Decision Type | Handler | Rationale |
|---|---|---|
| Combo selection | LLM | Requires evaluating synergies, board state, opponent strategy |
| Decline timing | LLM | Requires reasoning about future turns, opportunity cost |
| Conquest target selection | Heuristic with LLM override | Usually greedy-optimal, but LLM can override for strategic reasons |
| Conquest ordering | Heuristic | Pure math: minimize token expenditure |
| Reinforcement die target | Heuristic | Simple: pick the region that gains the most from 0-3 bonus |
| Token redeployment | Heuristic | Minimize vulnerability, protect borders |
| Scoring | Engine | Deterministic calculation |

### 6.3 Pros

- **Best potential quality**: Combines LLM strategic reasoning with fast tactical execution
- **Manageable latency**: Only 2-3 LLM calls per turn (strategic decisions), not 8-15
- **Manageable cost**: ~$0.10-$0.50 per game instead of $2-$5
- **Extensible**: Can add opponent modeling, learning from past games, personality
- **Testable**: Heuristic components are unit-testable; LLM components can be evaluated against replay logs

### 6.4 Cons

- **Highest total development effort**: Requires rules engine + heuristics + LLM integration + agent orchestration
- **Architectural complexity**: Three interacting systems (engine, heuristics, LLM) increase debugging surface
- **Still requires API/network**: LLM calls need connectivity (unless using a local model)
- **Over-engineered for the current stage**: The project has zero game logic; building a sophisticated agent before the rules engine is premature

### 6.5 Implementation Complexity

- **Rules engine**: High (3-5 weeks)
- **Heuristic tactical layer**: Medium (1-2 weeks)
- **LLM strategic layer + agent orchestration**: Medium-High (2-3 weeks)
- **Integration and tuning**: Medium (1-2 weeks)
- **Total**: 7-12 weeks

### 6.6 Expected AI Quality

High. This approach has the best ceiling because it uses each tool where it is strongest. The LLM handles the nuanced decisions (decline timing, combo evaluation) that heuristics struggle with, while heuristics handle the mechanical optimization (conquest math, redeployment) where LLMs waste tokens and add latency.

---

## 7. Option 5: Monte Carlo Tree Search (MCTS)

An approach not in the original list but worth considering, given its success in other territory control games.

### 7.1 Architecture

MCTS simulates thousands of random game playouts from the current state, builds a tree of promising move sequences, and selects the move that leads to the best average outcome.

```
src/game/ai/
  MCTSPlayer.ts         // Main MCTS loop
  SimulationEngine.ts   // Lightweight game simulation (fast clone + random playout)
  UCBSelector.ts        // Upper Confidence Bound for tree policy
```

### 7.2 Feasibility for Small World

MCTS works well when:
- The game state is small enough to simulate quickly — **Yes** (~16 regions, 2 players)
- Random playouts produce meaningful signal — **Partially** (random play in Small World is noisy)
- The branching factor is manageable — **Moderate** (higher than Go at the decision level, but many branches are prunable)

**Key challenge**: Small World has hidden information (coin counts). MCTS handles this via information set sampling, but it adds complexity.

### 7.3 Pros

- **No LLM dependency**: Runs entirely in-browser, zero latency, zero cost
- **Proven technique**: Works well for Risk, Settlers of Catan, and similar games
- **Self-improving with compute**: More simulation time = better play
- **No hand-crafted heuristics**: Discovers strategy through simulation (though heuristics can improve playout quality)

### 7.4 Cons

- **Requires a fast simulation engine**: The rules engine must be cloneable and executable at ~10,000 games/second for MCTS to work well in a browser
- **JavaScript performance**: 10K simulations per second is achievable in optimized TypeScript but requires careful engineering (no allocations in hot loops, typed arrays, etc.)
- **Playout quality**: Random Small World play is very noisy; enhanced playouts (biased toward heuristically good moves) are needed
- **Development effort**: The simulation engine is the rules engine but faster and allocation-free — essentially writing it twice

### 7.5 Expected AI Quality

Medium-High with enhanced playouts, Medium with pure random playouts. MCTS would handle decline timing reasonably well because it simulates future turns and sees the consequences.

---

## 8. Comparison Matrix

| Criterion | Option 1: Built-in Heuristic | Option 2: API/MCP + LLM | Option 3: Browser Agent | Option 4: Hybrid Agent | Option 5: MCTS |
|---|---|---|---|---|---|
| **Rules engine required?** | Yes | Yes | Yes (for the game) | Yes | Yes |
| **AI quality ceiling** | Medium | Medium-High | Low | High | Medium-High |
| **AI quality floor** | Medium (predictable) | Low (LLM failures) | Very Low | Medium | Medium |
| **Latency per turn** | <100ms | 5-40s | 2-5 min | 2-10s | 1-5s (configurable) |
| **Cost per game** | $0 | $0.50-$5.00 | $5-$20 | $0.10-$0.50 | $0 |
| **Works offline?** | Yes | No | No | No (LLM parts) | Yes |
| **Development effort** | 5-9 weeks | 6-10 weeks | 8-15 weeks | 7-12 weeks | 6-10 weeks |
| **Maintenance burden** | High (hand-tuned) | Low (update prompts) | Very High (fragile) | Medium | Low |
| **Testability** | Excellent | Good | Poor | Good | Good |
| **Difficulty levels** | Easy to tune | Hard (prompt-based) | Not practical | Moderate | Easy (vary sim count) |
| **Extensibility** | Low (rewrite for expansions) | High (update prompts) | Low | High | Medium |
| **Improves over time?** | Only manually | Yes (better models) | Yes (better VLMs) | Yes (better models) | Only manually |

---

## 9. Recommended Approach: Phased Hybrid

Given the project's current state (zero game logic), the most pragmatic path is a phased approach that builds incrementally.

### Phase 1: Rules Engine + Simple AI (Weeks 1-6)

**Goal**: Playable game with a basic computer opponent.

Build the rules engine and game state manager as the foundation. Implement a simple heuristic AI (Option 1, "Easy" and "Medium" difficulty) as the first computer opponent. This gets a working game into players' hands quickly.

**Key architectural decision**: Design the `IPlayer` interface from day one. This interface is the integration point for all future AI approaches.

```typescript
interface IPlayer {
  chooseAction(state: GameState, legalActions: GameAction[]): Promise<GameAction>;
}

class HumanPlayer implements IPlayer {
  // Resolves when the human clicks a UI element
  async chooseAction(state, legalActions) { ... }
}

class SimpleAIPlayer implements IPlayer {
  // Returns immediately with heuristic choice
  async chooseAction(state, legalActions) { ... }
}
```

The `async` return type is critical — it allows both instant (heuristic) and delayed (LLM) AI implementations behind the same interface.

**Deliverables**:
- Complete rules engine with all 14 races and 20 powers
- `IPlayer` interface used by both human and AI
- Heuristic AI with Easy and Medium difficulty
- Human-vs-human and human-vs-computer modes both functional

### Phase 2: MCP/API Bridge (Weeks 7-8)

**Goal**: Enable external AI experimentation.

Expose the `GameEngine` as an MCP server. This is a thin wrapper — the engine already exists from Phase 1, and MCP tooling is already configured in the project (`.claude-plugin/.mcp.json`).

```
MCP Tools:
  sw_get_state          -> Serialized GameState
  sw_get_legal_actions  -> Available actions
  sw_take_action        -> Apply an action, return new state
  sw_get_score          -> Current scores
  sw_get_game_log       -> History of actions taken
```

This enables anyone to write an AI opponent using any LLM or custom logic.

**Deliverables**:
- MCP server wrapping GameEngine
- JSON serialization of all game state
- Example prompts for LLM-based play

### Phase 3: Hybrid Agent — "Hard" Difficulty (Weeks 9-12)

**Goal**: A strong AI opponent that combines heuristics and LLM reasoning.

Build the Option 4 hybrid agent using the MCP interface from Phase 2. Use the heuristic AI from Phase 1 for tactical decisions, and add LLM calls for strategic decisions (decline timing, combo selection).

This is opt-in: players who want fast, free AI use the built-in heuristic. Players who want stronger AI (and have API access) use the hybrid agent.

**Deliverables**:
- Hybrid agent with decision routing (heuristic vs. LLM)
- "Hard" difficulty option in the UI (with note about API requirement)
- Opponent modeling (track opponent's scoring patterns)

### Phase 4 (Optional): MCTS or Browser Agent

If the rules engine from Phase 1 is performant enough, MCTS can be added as another difficulty level with zero external dependencies. The browser agent (Option 3) could be a fun demo/experiment but should never be the primary AI.

---

## 10. Key Technical Considerations

### 10.1 Game State Serialization for LLMs

For Options 2 and 4, the game state must be serialized to JSON that an LLM can understand:

- **Region names, not IDs**: "The Forest of Amur (region 7, forest terrain, your 3 Elf tokens)" is better than `{id: 7, terrain: 2, owner: 0, tokens: 3}` for LLM comprehension
- **Omit irrelevant details**: During conquest phase, the LLM does not need the full combo track
- **Include derived information**: "You need 4 tokens to conquer this region" saves the LLM from doing arithmetic
- **Keep token budget in mind**: A full Small World state serializes to ~2-3KB of descriptive JSON — well within context window limits

### 10.2 Hidden Information

Victory coins are hidden in Small World. For AI:
- **Built-in AI (Option 1/5)**: Can choose whether to use hidden info (easier) or estimate opponent coins (more fair)
- **LLM AI (Option 2/4)**: Explicitly omit opponent coin count from the state. The LLM can estimate based on visible board state + known scoring rules.
- **Browser agent (Option 3)**: Cannot see hidden coins (correct behavior by accident)

### 10.3 Race/Power Ability Complexity

The 34 unique abilities (14 races + 20 powers) represent the highest implementation complexity:

| Ability Type | Examples | AI Impact |
|---|---|---|
| Conquest modifiers | Commando (-1 cost), Mounted (-1 in hills/farms) | Changes ConquestCalculator |
| Token generation | Skeletons (+1 per conquered), Amazons (+4 during conquest) | Changes available tokens |
| Defense modifiers | Trolls (lairs), Fortified (+1 fort per turn) | Changes opponent's conquest math |
| Special actions | Sorcerers (convert lone tokens), Diplomat (choose non-attack) | New action types |
| Scoring modifiers | Alchemist (+2/turn), Forest (bonus for forests) | Changes ScoringEngine |
| Movement modifiers | Flying (no adjacency), Seafaring (sea regions) | Changes legal move generation |

The AI must understand these abilities to play well. For heuristic AI, each ability needs custom evaluation logic. For LLM AI, the abilities can be described in the system prompt (dramatically simpler).

### 10.4 Phaser.js Integration

The AI player must integrate with Phaser's scene-based architecture without blocking the render loop:

```typescript
// In Game.ts scene
class Game extends Phaser.Scene {
  private engine: GameEngine;
  private players: [IPlayer, IPlayer];

  async executeTurn(): Promise<void> {
    const currentPlayer = this.players[this.engine.getState().activePlayer];
    if (currentPlayer instanceof AIPlayer) {
      this.showThinkingIndicator();
    }
    const action = await currentPlayer.chooseAction(
      this.engine.getState(),
      this.engine.getLegalActions()
    );
    await this.animateAction(action);
    this.engine.applyAction(action);
    this.hideThinkingIndicator();
  }
}
```

### 10.5 Web Worker Considerations

For Options 1 and 5 (MCTS), heavy computation should run in a Web Worker to avoid janking the Phaser render loop:

```typescript
// ai.worker.ts
self.onmessage = (e: MessageEvent<{ state: GameState; legalActions: GameAction[] }>) => {
  const bestAction = computeBestAction(e.data.state, e.data.legalActions);
  self.postMessage(bestAction);
};
```

Vite has built-in Web Worker support: `new Worker(new URL('./ai.worker.ts', import.meta.url), { type: 'module' })`.

---

## 11. Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Rules engine has subtle bugs | High | High | Extensive unit tests, replay-based regression testing |
| Race/power interactions create edge cases | High | Medium | Fuzz testing with random games, community bug reports |
| LLM makes illegal moves | Medium | Low | Rules engine validates all moves; retry with error feedback |
| LLM API costs become prohibitive | Low | Medium | Offer heuristic-only mode as default; LLM is opt-in |
| AI is too weak to be fun | Medium | High | Phase 3 hybrid approach addresses this; MCTS as backup |
| AI is too strong and unfun | Low | Medium | Difficulty levels, handicap systems |
| Performance issues with MCTS in browser | Medium | Medium | Web Workers, configurable simulation budget, fallback to heuristic |

---

## 12. Conclusion

**The rules engine is not optional.** Every approach requires it. The question is purely about where AI decision-making lives.

**The recommended path is a phased hybrid** that:
1. Ships a playable game with heuristic AI quickly (Phase 1)
2. Opens the door for external AI experimentation via MCP (Phase 2)
3. Builds a strong hybrid agent for players who want a challenge (Phase 3)

This approach avoids building a sophisticated AI before the game itself works. It also avoids the trap of building only heuristic AI, which has a hard quality ceiling and high maintenance cost.

**Avoid Option 3 (browser automation) as a primary strategy.** It is the highest-effort, lowest-quality approach for this specific game (canvas-rendered, complex visual state).

**Do not underestimate the rules engine.** It is 60-70% of the total work for any AI approach. Start there.

---

## References

- [Small World rules (UltraBoardGames)](https://www.ultraboardgames.com/smallworld/game-rules.php)
- [Small World Special Powers (Fandom Wiki)](https://smallworld.fandom.com/wiki/Small_World_Special_Powers)
- [Small World 2 AI discussion (Steam)](https://steamcommunity.com/app/235620/discussions/0/558756255722402919/)
- [Small World C# implementation (GitHub)](https://github.com/Julien-Marcou/SmallWorld)
- [GamingAgent — LLM/VLM game agents (GitHub)](https://github.com/lmgame-org/GamingAgent)
- [browser-use — AI browser automation (GitHub)](https://github.com/browser-use/browser-use)
- [RTS game with AI agents (seangoedecke.com)](https://www.seangoedecke.com/wargame-agents/)
- [Small World (Wikipedia)](https://en.wikipedia.org/wiki/Small_World_(board_game))
