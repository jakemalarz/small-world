# Development Roadmap: Small World — Web-Based Board Game

## Overview

This roadmap captures the phased delivery plan for the Small World digital board game. **Phase 1** is the current implementation scope, tracked in Task Master. Subsequent phases are documented here for future planning.

---

## Phase 1: Core Game (Current Scope)

**Goal:** A fully playable, rules-accurate 2-player Small World game with heuristic AI opponents and placeholder visuals.

**Status:** In progress — 30 tasks in Task Master

### Milestones

| Milestone | Description | Tasks |
|-----------|-------------|-------|
| M1: Core Engine | Game state types, map data, phase state machine, basic conquest, Board + HUD scenes | 1, 2, 5, 9, 16, 17, 20, 21, 29 |
| M2: Complete Rules | All 14 races, 20 powers, decline, scoring, reinforcement die, ready troops, redeployment | 3, 4, 6, 7, 8, 10, 11, 12, 13, 14, 15 |
| M3: Presentation | Placeholder tokens, region overlays, combo shop UI, animation choreographer, stubbed audio | 18, 19, 22, 23, 24 |
| M4: AI & Polish | Easy + Medium AI, end game screen, main menu with mode selection, contextual tooltips | 25, 26, 27, 28, 30 |

### AI Opponent (Phase 1)

- **Easy:** Random valid moves with slight bias toward undefended regions
- **Medium:** Greedy heuristic evaluation — prioritize high-value targets, smart decline timing, defensive redeployment
- Both run entirely in-browser, zero latency, no external dependencies
- `IPlayer` interface is async (`Promise<GameAction>`) to support future LLM-based players

### What Ships

- Human vs. Human (hot-seat)
- Human vs. AI (Easy, Medium)
- AI vs. AI spectator mode
- All 14 races and 20 powers
- Placeholder art (colored circles, text labels)
- Stubbed audio (wired but silent)
- Vitest unit tests for game engine
- Playwright E2E tests for UI

---

## Phase 2: Post-Phase 1 Fixes & UX Enhancements

**Goal:** Address visual and game rule bugs discovered during Phase 1 testing, and improve the player experience before moving into visual polish.

**Depends on:** Phase 1 complete

### Visual Bug Fixes

**Map**
- Map image is clipped at the bottom, cutting off the round 8, 9, and 10 markers — fix viewport/container sizing

**Race & Power HUD**
- Region tooltips activate through the Race & Power selection HUD when hovering over options — disable map tooltips and all map interactions while the HUD is open `FR-55`

**Zoom**
- Map loads in a zoomed-in state — start at maximum zoom-out; resize region hit polygons to match `FR-58`
- Map tooltips scale with zoom level — lock tooltip font size and dimensions to screen space, independent of zoom `FR-59`

### Game Rule Fixes

**Decline**
- Decline option is not presented to the player — add and test the full decline flow `FR-22`

**Conquest**
- First conquest incorrectly allows any region — enforce the rule that the first conquest must target a border (map edge) or coastal (Sea/Lake-adjacent) region, unless overridden by race/power ability (e.g., Halflings) `FR-13`
- Conquest cost tooltip shows a flat 2 tokens regardless of defenders — fix calculation to: 2 (base) + 1 per Mountain/Encampment/Fortress/Troll's Lair + 1 per Lost Tribe token + 1 per enemy race token `FR-15`

### UX Enhancements

**Race & Power HUD**
- Display race and power names as text placeholders until visual assets ship in Phase 3 `FR-53`
- Add tooltips explaining each race's special ability and each power `FR-33` `FR-35`
- Allow players to open the HUD to browse upcoming combo options at any time during their turn `FR-54`

**Conquest**
- Visually highlight eligible first-conquest regions (border and coastal) to guide the player `FR-56`

**Reinforcement Die**
- Show the rolled value visually when the die result lands `FR-20` `FR-21`
- Present the reinforcement die roll option on the final conquest before showing the End Conquest button — the last roll and conquest belong to the conquest phase `FR-19`

**Player Interaction**
- Left-click adds tokens to a region; right-click removes one — primary interaction model for redeployment (freely add/remove tokens across allowable regions until confirmed) `FR-57`
- Add a toggle between Interaction mode (take game actions on the map) and Pan mode (drag to navigate without triggering actions) `FR-60` `US-15`
- Add tooltips to Player boxes (race, power, token count, coin count) showing special abilities for the active race and power `FR-61` `US-16`
- Redraw region polygons to more closely match what the background map image depicts `FR-62`

---

## Phase 3: Visual Polish

**Goal:** Replace placeholder art with polished visuals matching the Small World board game aesthetic, redesign the HUD, and upgrade gameplay interactions and animations.

**Depends on:** Phase 2 complete

**Status:** In progress

### Task 1: Map Region Redraw

Manually redraw all region polygons to closely match the physical board game map, and label each region to match the board game's named territories.

- Trace region boundaries from the `src/assets/reference/2-player-map.jpeg` reference image
- Replace existing polygon coordinates in `src/game/data/map2p.ts` with redrawn shapes
- Label each region with its board-game name (e.g. "The Cavern", "The Forest of Death", etc.)
- Verify all adjacency relationships still hold after redraw
- Update hit polygon overlays in `Board.ts` to match new shapes
- **Note:** This is an offline/manual task before implementation can begin

### Task 2: Map Token Replacement

Replace colored-circle placeholder tokens with image-based tokens per race.

- Source or generate token artwork for each of the 14 races
- Replace `TokenRenderer.ts` placeholder circles with sprite-based rendering
- Implement `SpriteTokenRenderer` as a drop-in replacement via the existing `ITokenRenderer` interface
- Include token states: active, declined, and special markers (Lost Tribe, Troll Lair, Fortress, Encampment)
- Race banners and power badges as illustrated cards in the combo shop

### Task 3: HUD Redesign

Redesign the HUD to match the Small World board game's visual style and improve usability.

- Replace placeholder text-based race/power display with illustrated cards and banners
- Redesign the combo shop to show race+power cards with artwork
- Redesign the turn track, score display, and player dashboards
- Redesign action buttons (Conquer, Decline, End Turn, etc.) with polished styling
- Redesign the reinforcement die with a visual die face

### Task 4: Gameplay Interactions Redesign + Animations

Polish all gameplay interactions and add animation choreography.

- Refined tween curves and timing for conquest, token placement, redeployment
- Particle effects for conquest impacts and coin scoring
- Camera choreography: smooth auto-focus during key moments
- Dice roll: 3D tumble effect (sprite sequence or procedural)
- Token pickup/placement feel: lift, drag, and drop animations
- Combo card selection animation (slide in, flip, select)
- Turn transition animations

---

## Phase 4: Audio

**Goal:** Full tabletop-style audio design.

**Depends on:** Phase 1 M3 (stubbed audio manager wired in)

### Sound Effects

- Token placement: wooden piece-on-board thud
- Token movement: sliding wood on wood
- Conquest: impact sound + scattered token clatter
- Dice roll: dice tumbling on wooden table
- Coin scoring: coins clinking as counted
- Card/banner interaction: card sliding / paper shuffling
- Decline: muted, somber tone
- Turn transition: subtle chime or bell
- Victory: celebratory fanfare

### Ambient Audio

- Soft tavern/hearth background ambiance (toggleable)
- Volume controls in settings

### Implementation

- Replace `StubAudioManager` with `PhaserAudioManager`
- Audio sprites (single file with multiple sounds) for efficiency
- Assets sourced, generated, or licensed

---

## Phase 5: Online Multiplayer

**Goal:** Real-time networked 2-player games.

**Depends on:** Phase 1 (game engine)

### Architecture Considerations

- Game state is already immutable and serializable (designed for this)
- `IPlayer` interface already async — remote player is just another implementation
- Options: WebSocket server (Node.js), WebRTC peer-to-peer, or cloud-hosted game rooms
- State synchronization: server-authoritative (server runs `GameEngine`, clients render)
- Lobby system: create/join game rooms with shareable links
- No accounts required (anonymous play with session tokens)

### Scope

- 2-player only (matches Phase 1)
- No matchmaking or ranking
- Game state persisted server-side for reconnection
- Latency compensation for animations

---

## Phase 6: Quality of Life

**Goal:** Features that improve the play experience but aren't core gameplay.

### Undo/Redo

- Immutable state architecture makes this straightforward — maintain a state history stack
- Undo last action, redo to re-apply
- Consider limiting undo scope (e.g., can't undo after die roll or after seeing opponent's response)

### Save/Load

- Serialize `GameState` to JSON and persist to `localStorage` or downloadable file
- Load game from file or browser storage
- State is already designed for serialization

### Game Replay

- Action log (`GameLogEntry[]`) already captured in state
- Replay mode: step through actions with animation playback
- Export replay as shareable JSON

### Accessibility

- Colorblind-friendly palette options (swap player colors)
- High-contrast mode for region borders and tokens
- Screen reader support for game state announcements
- Keyboard navigation for all actions

### Mobile Optimization

- Touch-optimized controls: tap to select, pinch to zoom, drag to pan
- Responsive layout adjustments for portrait/landscape
- Larger hit targets for touch input

---

## Phase 7: MCP Bridge & Hard AI

**Goal:** Expose the game engine as an MCP server so external AI (LLMs, custom bots) can play. Build a hybrid "Hard" AI that combines heuristics with LLM strategic reasoning.

**Depends on:** Phase 1 complete

### MCP Game Server

- Expose game state and actions as MCP tools:
  - `sw_get_state` — serialized GameState as JSON
  - `sw_get_legal_actions` — available actions for current player
  - `sw_take_action` — apply an action, return new state
  - `sw_get_score` — current scores
  - `sw_get_game_log` — action history
- MCP server wraps the existing `GameEngine` — thin adapter layer
- Enables any MCP-compatible client (Claude Desktop, custom agents) to play
- JSON state serialization uses descriptive region names for LLM comprehension
- Project already has MCP infrastructure in `.claude-plugin/.mcp.json`

### Hybrid "Hard" AI

- Decision routing: LLM for strategic decisions, heuristics for tactical execution
- **LLM handles:** Combo selection (synergy evaluation), decline timing (opportunity cost reasoning)
- **Heuristics handle:** Conquest ordering (minimize token spend), redeployment (border defense), reinforcement die target
- ~2-3 LLM calls per turn instead of 8-15 — manages latency and cost
- Estimated cost: ~$0.10-$0.50 per game
- Requires API key (opt-in — players without keys use Medium AI)
- "AI is thinking..." indicator during LLM calls

### Estimated Effort

- MCP bridge: 1-2 weeks
- Hybrid agent + prompt engineering: 2-3 weeks
- Integration and tuning: 1 week

---

## Deferred Ideas (Unscoped)

These are ideas mentioned during design discussions that don't have a phase assignment yet:

- **MCTS AI (Option 5 from AI design doc):** Monte Carlo Tree Search running in a Web Worker. Zero external dependencies, self-improving with compute time. Could serve as an alternative "Hard" difficulty without LLM costs. Requires a fast simulation engine (~10K games/sec in browser).
- **Browser automation AI (Option 3):** A VLM agent that plays via screenshots. Not recommended as primary AI but could be a fun demo. Very fragile with canvas-based rendering.
- **AI personality traits:** Give AI opponents distinct play styles (aggressive, defensive, economic, chaotic) beyond just difficulty levels.
- **AI "thinking" visualization:** Show the AI's reasoning during its turn (considered regions, evaluated combos, decline probability). Educational and entertaining for spectators.
- **Tournament mode:** Series of games with aggregate scoring.
- **Custom game rules:** House rules toggles (hidden vs. visible coins, different turn counts, banned combos).
- **Expansion content:** Additional races, powers, or maps beyond the base game.

---

## Revision History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-02-20 | Initial roadmap based on PRD, technical design, and AI opponent design discussions |
| 1.1 | 2026-02-21 | Reordered phases: Visual Polish → P2, Audio → P3, Online Multiplayer → P4, QoL → P5, MCP Bridge & Hard AI → P6; removed Additional Player Counts |
| 1.2 | 2026-02-21 | Inserted Phase 2: Post-Phase 1 Fixes & UX Enhancements; renumbered Visual Polish → P3, Audio → P4, Online Multiplayer → P5, QoL → P6, MCP Bridge → P7 |
| 1.3 | 2026-03-01 | Expanded Phase 3 into 4 explicit tasks: Map Region Redraw, Map Token Replacement, HUD Redesign, Gameplay Interactions + Animations; marked Phase 2 complete |
