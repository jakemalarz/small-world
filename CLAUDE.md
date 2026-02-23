# Small World — Board Game (Web)

A web-based implementation of the Small World board game (by Days of Wonder) for 2 players, built with Phaser.js.

## Project Status

### Phase 1 — Core Game Engine (COMPLETE)
All 35 tasks done. Full game loop working: game state types, map data, race/power definitions, ability modifier system, combo shop, conquest, decline, scoring, reinforcement die, redeployment, legal action generation, phase state machine, Board + HUD scenes, token/region rendering, animation choreographer, audio manager (stub), GameController, HumanPlayer, Easy AI, Medium AI, end game screen, tooltips, main menu with mode selection (HvH, HvAI, AivAI). Unit tests (Vitest, 266 tests) and E2E tests (Playwright) passing.

### Phase 2 — UX Enhancements & Bug Fixes (IN PROGRESS — stabilization)
All 18 implementation tasks (36–53) done. E2E tests written and passing (288 unit / 79 E2E per browser). Fixes: map viewport clipping, camera zoom, HUD interaction passthrough, tooltip zoom scaling, conquest cost calculation, first conquest entry rule, decline flow, reinforcement die sequencing, region polygon redraw, final conquest token placement, die result HUD persistence. Features: race/power text labels, ability tooltips, player box tooltips, first-conquest highlighting, browse combo mode, left/right-click redeployment, pan/interact mode toggle, interactive token gathering during readyTroops with abandon confirmation.

**Current workflow**: Manual playtesting to surface UI/logic bugs, then fixing them one by one with E2E test coverage for each fix. No new regressions allowed — all unit and E2E tests must pass before committing. This stabilization pass must be complete before moving to Phase 3.

### Missing Features Audit (2026-02-22)
A comprehensive audit of implemented features vs PRD/rulebook identified 18 gaps documented in `design/missing-features.md`. Key findings:
- **2 scoring bugs**: Troll Lair incorrectly awards coins (should be defense-only); Wealthy bonus applied at wrong time
- **7 power ability gaps**: Berserk, Bivouacking, Diplomat, Dragon Master, Fortified, Heroic, Seafaring — ranging from minor fixes to entirely missing mechanics
- **2 race ability gaps**: Amazons conquest-only token removal not implemented; Sorcerer once-per-opponent limit not enforced
- **Game mechanics**: Defender deferred redeployment (FR-18b) not implemented
- **Polish/AI**: Hard AI, audio system, animation polish, minimap still pending

Next development session will begin working through these in priority order (bugs first, then high-value/low-effort ability fixes).

---

## Architecture

- **Engine**: Phaser.js v3 (2D game framework — scenes, sprites, input, physics)
- **Bundler**: Vite v7 (fast HMR, manual chunking for Phaser)
- **Language**: TypeScript (strict mode)
- **Canvas**: 1280x720 with `Phaser.Scale.FIT` scaling (responsive 16:9)
- **Scene flow**: Boot → MainMenu → Game (with Board + HUD parallel scenes)

## Project Structure

```
small-world/
├── src/
│   ├── main.ts                  # Phaser game bootstrap
│   ├── game/
│   │   ├── config.ts            # GameConfig: 1280x720, FIT, scene list
│   │   ├── GameController.ts    # Game loop orchestrator (state → render → input → animate)
│   │   ├── state/types.ts       # All TypeScript interfaces (GameState, PlayerState, etc.)
│   │   ├── data/
│   │   │   ├── map2p.ts         # 2-player map: polygons, adjacency, terrain, markers
│   │   │   ├── races.ts         # 14 race definitions (tokens, abilities, maxSupply)
│   │   │   └── powers.ts        # 20 power definitions (bonuses, modifiers)
│   │   ├── engine/              # Pure-function game logic (no Phaser dependency)
│   │   │   ├── actions.ts       # applyAction — central state transition
│   │   │   ├── legalActions.ts  # getLegalActions — valid moves per phase
│   │   │   ├── phaseTransition.ts # Phase state machine
│   │   │   ├── setup.ts         # createInitialState
│   │   │   ├── comboShop.ts     # Combo selection + shop replenishment
│   │   │   ├── conquestCost.ts  # Conquest cost with ability modifiers
│   │   │   ├── decline.ts       # Decline mechanics (Spirit, Ghoul exceptions)
│   │   │   ├── scoring.ts       # End-of-turn scoring with race/power bonuses
│   │   │   ├── reinforcementDie.ts # Die roll + final conquest attempt
│   │   │   └── redeployment.ts  # Token redistribution
│   │   ├── abilities/
│   │   │   ├── modifiers.ts     # AbilityModifiers interface + getActiveModifiers
│   │   │   ├── raceAbilities.ts # Custom handlers (Sorcerers, Halflings, etc.)
│   │   │   └── powerAbilities.ts # Custom handlers (Dragon Master, Heroic, etc.)
│   │   ├── scenes/
│   │   │   ├── Boot.ts          # Asset preloading with progress bar
│   │   │   ├── MainMenu.ts      # Mode selection (HvH, HvAI, AivAI) + difficulty
│   │   │   ├── Game.ts          # Orchestrates Board + HUD scenes
│   │   │   ├── Board.ts         # Map image, hit polygons, camera pan/zoom
│   │   │   └── HUD.ts           # Turn track, dashboards, action buttons, combo shop
│   │   ├── players/
│   │   │   ├── IPlayer.ts       # Async IPlayer interface
│   │   │   ├── HumanPlayer.ts   # Resolves via UI events
│   │   │   ├── AIPlayer.ts      # Easy AI (random valid moves)
│   │   │   └── MediumAIPlayer.ts # Medium AI (heuristic evaluation)
│   │   └── presentation/
│   │       ├── TokenRenderer.ts     # Colored circles with race initials
│   │       ├── RegionRenderer.ts    # Ownership borders, valid target highlights
│   │       ├── AnimationChoreographer.ts # Tween sequences for actions
│   │       └── AudioManager.ts      # Stub (no-op, ready for Phase 3)
│   └── assets/reference/        # Source materials (rulebook PDF, map image)
├── tests/
│   ├── unit/                    # Vitest unit tests (266 tests)
│   └── e2e/                     # Playwright E2E tests (71 per browser)
│       ├── helpers.ts           # Shared test utilities and coordinates
│       ├── mainMenu.spec.ts     # Main menu tests
│       ├── hvhGame.spec.ts      # Human vs Human game flow
│       ├── hvaiGame.spec.ts     # Human vs AI game flow
│       └── phase2.spec.ts       # Phase 2 feature tests
├── docs/prd.md                  # Product requirements document
├── design/
│   ├── technical-design.md      # Architecture and engine design
│   └── roadmap.md               # Phased delivery plan
├── playwright.config.ts         # Chromium + Firefox + WebKit
├── vitest.config.ts             # Unit test config
└── package.json
```

## Coding Conventions

- One Phaser Scene per file, named export matching filename
- Scene keys match class names (e.g., `super('MainMenu')`)
- Use `this.scale.width/height` for responsive positioning (not hardcoded pixels)
- Assets loaded in Boot scene, referenced by string key elsewhere
- No CSS frameworks — Phaser handles all rendering on canvas
- Vite path alias: `@/` maps to `src/`

## Workflow Commands

- `/preview` — Start dev server + open browser
- `/screenshot` — Capture game screenshot via Puppeteer for visual QA
- `/generate-asset <desc>` — Generate a game asset image with Gemini

## PM Skills

PM skills are installed from [pm-skills](https://github.com/product-on-purpose/pm-skills) in `.claude/commands/` and `.claude/skills/`. When working on PRDs, feature planning, or product requirements, use the relevant PM skill slash commands:

- `/prd` — Create or refine a Product Requirements Document
- `/kickoff` — Run the Feature Kickoff workflow (problem → hypothesis → PRD → stories)
- `/user-stories` — Generate user stories with acceptance criteria
- `/hypothesis` — Define a testable hypothesis with success metrics
- `/problem-statement` — Create a clear problem statement
- `/edge-cases` — Document edge cases and error states

Skill source files live in `pm-skills/skills/` with templates and examples. When the user asks to create, draft, or refine a PRD, always use the `/prd` skill for structured output. Store generated PM artifacts in `docs/` at the project root.


## MCP Servers

- **Puppeteer** (`@modelcontextprotocol/server-puppeteer`) — Browser automation, screenshots for visual QA
- **Nano Banana** (`nano-banana-mcp`) — Google Gemini image generation (requires `GEMINI_API_KEY` env var)
- **Task Master** (`taskmaster-ai`) — Development task tracking for this project. Use `mcp__taskmaster-ai__*` tools to get, update, and manage tasks. Project root: `/Users/jakemalarz/cc-dmz/small-world`. Phase 1 (tasks 1–35) and Phase 2 (tasks 36–53) are complete. Always check Task Master before starting new work.

## Project Documents

- **PRD**: `docs/prd.md` — Full product requirements: user stories, functional requirements, all 14 races, all 20 powers, edge cases, milestones
- **Technical Design**: `design/technical-design.md` — Architecture decisions, game state model, engine structure, scene graph, ability system, testing strategy
- **Roadmap**: `design/roadmap.md` — Phased delivery plan; Phases 2–7 document future features (visual polish, audio, MCP bridge, online multiplayer, additional player counts, QoL)
- **Phase 2 E2E Tasks**: `.taskmaster/docs/phase2-e2e-tasks.txt` — Phase 2 E2E test plan (completed)

## Game Reference

- **Rulebook**: `src/assets/reference/small world rule book.pdf` — Full rules for Small World
- **2-player map**: `src/assets/reference/2-player-map.jpeg` — The board layout to digitize
- **Game**: 2-player territory control, fantasy races with special powers, decline mechanic, 10 turns

## Development

```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # Production build (tsc + vite build)
npm run preview  # Preview production build
npx playwright test              # Run all Playwright tests
npx playwright test --ui         # Run tests with interactive UI
npx playwright show-report       # View last test report
```

## Testing

- **Vitest** — 288 unit tests covering engine logic (scoring, setup, conquest cost, redeployment, ready troops, reinforcement die, legal actions), data tables (races, powers), state types, and audio manager stub. Run: `npx vitest run`
- **Playwright** (`@playwright/test`) — 79 E2E tests per browser across Chromium/Firefox/WebKit. Covers main menu, HvH game flow, HvAI game flow, and Phase 2 features (decline, first conquest, pan mode, browse mode, redeployment, tooltips, final conquest token placement, readyTroops token gathering with abandon). Config: `playwright.config.ts`. Run: `npx playwright test --project=chromium`
- **Stabilization rule**: Every bug fix must include an E2E test that reproduces the issue. All 288 unit + 79 E2E tests must pass before committing.
- **E2E execution**: Always run Playwright with `--project=chromium` only (not all browsers) to save context and tokens. Full cross-browser testing is done separately outside of Claude sessions.

### Recent Changes

**Interactive token gathering in readyTroops (2026-02-22)**: Added interactive left/right-click UX for gathering tokens during readyTroops phase (FR-13a/b/d/e). Right-click removes a token from a region to hand; left-click adds one back. Picking up the last token shows an abandon confirmation dialog. New `readyTroopsDeploy` batch action type (like `redeploy`). `pickUpTokens` now allows full abandonment (no longer clamps to leave 1). Key files: `types.ts`, `legalActions.ts`, `actions.ts`, `GameController.ts`, `AIPlayer.ts`, `MediumAIPlayer.ts`.

**Explicit Final Conquest entry (2026-02-22)**: Reworked reinforcement die UX — during conquest, player now sees two buttons: "End Conquest" (skips to redeploy) and "Final Conquest" (enters die sub-flow). Added `startFinalConquest` action type. `endPhase` from conquest always goes to `redeploy`. Player can back out of final conquest target selection by clicking "End Conquest". Key files: `types.ts`, `phaseTransition.ts`, `legalActions.ts`, `actions.ts`, `HUD.ts`, `AIPlayer.ts`, `MediumAIPlayer.ts`.

**Final Conquest fix (2026-02-22)**: Successful final conquest was silently failing — `useReinforcement` action was rejected as illegal because the controller set `state.reinforcementDie` for HUD display before emitting the action, causing `getLegalActions` step-2 to exclude it. Fixed in `legalActions.ts` (allow `useReinforcement` in step 2), `actions.ts` (persist die result until player switch), `HUD.ts` (show die result during redeploy phase). E2E test added.

**Reinforcement Die rework (2026-02-22)**: Changed from auto-roll to a two-step flow — player selects target region first, then die is rolled. Key files: `GameController.ts`, `reinforcementDie.ts`, `legalActions.ts`, `HUD.ts`.
