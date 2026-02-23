# Small World — Board Game (Web)

A web-based implementation of the Small World board game (by Days of Wonder) for 2 players, built with Phaser.js.

## Project Status

### Phase 1 — Core Game Engine (COMPLETE)
All 35 tasks done. Full game loop working: game state types, map data, race/power definitions, ability modifier system, combo shop, conquest, decline, scoring, reinforcement die, redeployment, legal action generation, phase state machine, Board + HUD scenes, token/region rendering, animation choreographer, audio manager (stub), GameController, HumanPlayer, Easy AI, Medium AI, end game screen, tooltips, main menu with mode selection (HvH, HvAI, AivAI). Unit tests (Vitest, 266 tests) and E2E tests (Playwright) passing.

### Phase 2 — UX Enhancements & Bug Fixes (COMPLETE)
All 18 implementation tasks (36–53) done. E2E tests written and passing (296 unit / 79 E2E per browser). Fixes: map viewport clipping, camera zoom, HUD interaction passthrough, tooltip zoom scaling, conquest cost calculation, first conquest entry rule, decline flow, reinforcement die sequencing, region polygon redraw, final conquest token placement, die result HUD persistence. Features: race/power text labels, ability tooltips, player box tooltips, first-conquest highlighting, browse combo mode, left/right-click redeployment, pan/interact mode toggle, interactive token gathering during readyTroops with abandon confirmation.

### Missing Features Audit (2026-02-22)
A comprehensive audit of implemented features vs PRD/rulebook identified 18 gaps documented in `design/missing-features.md`. 4 of 18 resolved (2026-02-23); 14 remaining.

**Resolved (2026-02-23, batch 1)**:
- **Troll Lair scoring bug** (rank 1): Removed incorrect +1 coin per lair. Lairs are defense-only.
- **Amazons conquest-only token removal** (rank 2): +4 tokens added at readyTroops→conquest, removed from board after redeployment (largest stacks first, min 1 per region).
- **Bivouacking encampments on decline** (rank 3): `hasEncampment` flags cleared from declining player's regions in `applyDecline`.
- **Sorcerer once-per-opponent limit** (rank 4): Added `sorcererConversionsThisTurn` counter to `ActiveRaceState`. Incremented in `applySorcererConvert`, checked in `modifyLegalActions`, reset at turn end.

**Resolved (2026-02-23, batch 2)**:
- **Seafaring "keep in decline"** (rank 5): Already working — sea/lake regions retained as declined. Added explicit comments and `hasHero: false` cleanup to decline.
- **Wealthy bonus timing** (rank 6): Moved +7 bonus from `applySelectCombo` to `calculateScore`. Added `wealthyBonusApplied` flag to `ActiveRaceState`.
- **Berserk die on every conquest** (rank 7): Die rolls on every conquest attempt. `conquer` action extended with optional `dieResult`. Legal actions account for +3 potential die bonus. Failed rolls waste attempt but stay in conquest phase.
- **Heroic hero placement** (rank 8): Added `placeHeroes` phase after `redeploy`. Legal actions enumerate all pairs of owned active regions. Heroes cleared at player switch and on decline. Human selects 2 regions sequentially; AI picks first pair.

**Remaining (10 gaps)**:
- **3 power ability gaps**: Diplomat, Dragon Master, Fortified
- **Game mechanics**: Defender deferred redeployment (FR-18b) not implemented
- **Polish/AI**: Hard AI, audio system, animation polish, minimap still pending

**Next session — implement features 9, 10, 11, 12** (in priority order):
- **9. Fortified fortress placement**: 1 fortress per turn, max 6 total. Needs sub-phase after redeploy (like `placeHeroes`). `fortressesPlaced` counter and `hasFortress` region flag exist; defense (+1) and scoring (+1/fortress) already work. Missing: placement mechanic. Key files: `powerAbilities.ts`, `legalActions.ts`, `actions.ts`, `phaseTransition.ts`.
- **10. Dragon Master conquest mechanic**: Rework from "place dragon marker" to proper conquest with 1 token ignoring all defense. Dragon placed in conquered region for immunity. Key files: `powerAbilities.ts`, `actions.ts`.
- **11. Diplomat alliance**: Fully non-functional. Add post-score phase for ally selection, enforce no-attack constraint, validate Diplomat didn't attack chosen ally. Key files: `legalActions.ts`, `actions.ts`, `phaseTransition.ts`, `types.ts`.
- **12. Defender deferred redeployment (FR-18b)**: Defeated active tokens should redeploy to defender's other regions at end of attacker's turn, not immediately to hand. `defenderRedeploy` action type exists but is no-op. Key files: `actions.ts`, `phaseTransition.ts`, `legalActions.ts`.

**Current workflow**: Working through missing features in priority order. Each fix includes unit tests. All 335 unit + 79 E2E tests must pass before committing.

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

- **Vitest** — 335 unit tests covering engine logic (scoring, setup, conquest cost, redeployment, ready troops, reinforcement die, legal actions, decline, Amazons token removal, Sorcerer limits), data tables (races, powers), state types, and audio manager stub. Run: `npx vitest run`
- **Playwright** (`@playwright/test`) — 79 E2E tests per browser across Chromium/Firefox/WebKit. Covers main menu, HvH game flow, HvAI game flow, and Phase 2 features (decline, first conquest, pan mode, browse mode, redeployment, tooltips, final conquest token placement, readyTroops token gathering with abandon). Config: `playwright.config.ts`. Run: `npx playwright test --project=chromium`
- **Stabilization rule**: Every bug fix must include an E2E test that reproduces the issue. All 335 unit + 79 E2E tests must pass before committing.
- **E2E execution**: Always run Playwright with `--project=chromium` only (not all browsers) to save context and tokens. Full cross-browser testing is done separately outside of Claude sessions.

### Recent Changes

**Missing features #5–8 fixed (2026-02-23)**: Fixed 4 more gaps (8 of 18 total resolved):
- Seafaring "keep in decline": Sea/lake regions already retained by existing decline logic. Added `hasHero: false` cleanup and explicit documentation.
- Wealthy bonus timing: Moved +7 bonus from `comboShop.ts` (immediate) to `scoring.ts` (first scoring turn). Added `wealthyBonusApplied` flag to `ActiveRaceState`.
- Berserk die on every conquest: Die rolls on every Berserk conquest. `conquer` action extended with optional `dieResult`. Legal actions include regions affordable with +3 die max. Failed die rolls waste attempt but stay in conquest phase. Both human (via `GameController`) and AI supported.
- Heroic hero placement: New `placeHeroes` phase after `redeploy`. Legal actions enumerate region pairs. Heroes cleared at player switch and decline. Human 2-click selection UX. AI picks first valid pair. HUD labels added.

**Missing features #1–4 fixed (2026-02-23)**: Fixed 4 of 18 gaps from the missing features audit:
- Troll Lair scoring bug: removed incorrect +1 coin per lair from `scoring.ts` (defense-only per rules).
- Amazons conquest-only token removal: +4 tokens added at readyTroops→conquest transition, removed from board after redeployment in `actions.ts` (largest stacks first, min 1 per region).
- Bivouacking encampments on decline: `hasEncampment` cleared from declining player's active regions in `applyDecline`.
- Sorcerer once-per-opponent limit: added `sorcererConversionsThisTurn` to `ActiveRaceState` (`types.ts`), incremented in `applySorcererConvert`, checked in `raceAbilities.ts` `modifyLegalActions`, reset at turn end.

**Interactive token gathering in readyTroops (2026-02-22)**: Added interactive left/right-click UX for gathering tokens during readyTroops phase (FR-13a/b/d/e). Right-click removes a token from a region to hand; left-click adds one back. Picking up the last token shows an abandon confirmation dialog. New `readyTroopsDeploy` batch action type (like `redeploy`). `pickUpTokens` now allows full abandonment (no longer clamps to leave 1). Key files: `types.ts`, `legalActions.ts`, `actions.ts`, `GameController.ts`, `AIPlayer.ts`, `MediumAIPlayer.ts`.

**Explicit Final Conquest entry (2026-02-22)**: Reworked reinforcement die UX — during conquest, player now sees two buttons: "End Conquest" (skips to redeploy) and "Final Conquest" (enters die sub-flow). Added `startFinalConquest` action type. `endPhase` from conquest always goes to `redeploy`. Player can back out of final conquest target selection by clicking "End Conquest". Key files: `types.ts`, `phaseTransition.ts`, `legalActions.ts`, `actions.ts`, `HUD.ts`, `AIPlayer.ts`, `MediumAIPlayer.ts`.

**Final Conquest fix (2026-02-22)**: Successful final conquest was silently failing — `useReinforcement` action was rejected as illegal because the controller set `state.reinforcementDie` for HUD display before emitting the action, causing `getLegalActions` step-2 to exclude it. Fixed in `legalActions.ts` (allow `useReinforcement` in step 2), `actions.ts` (persist die result until player switch), `HUD.ts` (show die result during redeploy phase). E2E test added.

**Reinforcement Die rework (2026-02-22)**: Changed from auto-roll to a two-step flow — player selects target region first, then die is rolled. Key files: `GameController.ts`, `reinforcementDie.ts`, `legalActions.ts`, `HUD.ts`.
