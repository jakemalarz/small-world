# Small World — Board Game (Web)

A web-based implementation of the Small World board game (by Days of Wonder) for 2 players, built with Phaser.js.

## Session 1 Summary (2026-02-14)

Set up the complete development harness from scratch. Started with just two reference files (rulebook PDF + 2-player map image) in an empty directory.

### What was built:
1. **Git repository** initialized with `.gitignore` (node_modules, dist, .env, .DS_Store, Claude session state)
2. **Vite + TypeScript project** scaffolded with Phaser.js v3 as the game engine
3. **Three Phaser scenes** wired up in sequence: Boot → MainMenu → Game
   - `Boot` — Loading progress bar, asset preloading (currently no assets to load)
   - `MainMenu` — Title screen with a clickable "2-Player Game" button
   - `Game` — Placeholder game board with "← Back to Menu" navigation
4. **Claude Code plugin** (`.claude-plugin/`) with:
   - MCP servers for Puppeteer (browser automation/screenshots) and Nano Banana (Gemini image generation)
   - Slash commands: `/preview`, `/screenshot`, `/generate-asset`
5. **Permissions** pre-approved for npm, git, open, and file operations in `.claude/settings.local.json`

### Current state:
- `npm run dev` serves the game at `localhost:5173` — verified working
- TypeScript compiles clean with `npx tsc --noEmit`
- No game logic implemented yet — scenes are UI placeholders only
- No assets loaded yet (Boot scene has loading bar but nothing to load)
- 2 git commits on `main` branch

---

## Architecture

- **Engine**: Phaser.js v3 (2D game framework — scenes, sprites, input, physics)
- **Bundler**: Vite v7 (fast HMR, manual chunking for Phaser)
- **Language**: TypeScript (strict mode)
- **Canvas**: 1280x720 with `Phaser.Scale.FIT` scaling (responsive 16:9)
- **Scene flow**: Boot → MainMenu → Game (scene keys match class names)

## Project Structure

```
small-world/
├── .claude-plugin/              # Claude Code plugin
│   ├── plugin.json              # Plugin metadata
│   ├── .mcp.json                # Puppeteer + Nano Banana MCP servers
│   ├── commands/                # Slash command definitions
│   │   ├── preview.md           # /preview — dev server + browser
│   │   ├── screenshot.md        # /screenshot — Puppeteer visual QA
│   │   └── generate-asset.md    # /generate-asset — Gemini image gen
├── src/
│   ├── main.ts                  # Phaser game bootstrap (4 lines)
│   ├── game/
│   │   ├── config.ts            # GameConfig: 1280x720, FIT, scene list
│   │   └── scenes/
│   │       ├── Boot.ts          # Asset preloading with progress bar
│   │       ├── MainMenu.ts      # Title + "2-Player Game" button
│   │       └── Game.ts          # Main gameplay (placeholder)
│   └── assets/
│       ├── images/              # Static game images (empty)
│       ├── sprites/             # Sprite sheets (empty)
│       ├── generated/           # AI-generated assets via Gemini (empty)
│       └── reference/           # Source materials
│           ├── 2-player-map.jpeg
│           └── small world rule book.pdf
├── screenshots/                 # Visual QA captures (empty)
├── CLAUDE.md                    # This file
├── index.html                   # Minimal HTML shell (dark background, no DOM)
├── vite.config.ts               # Path aliases (@/), Phaser chunking
├── tsconfig.json                # Strict TS, bundler resolution, path aliases
└── package.json                 # Deps: phaser, vite, typescript
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
- **Task Master** (`taskmaster-ai`) — AI-powered task management. Use `mcp__taskmaster-ai__*` tools to manage tasks. Project root: `/Users/jakemalarz/cc-dmz/small-world`

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

- **Playwright** (`@playwright/test`) — End-to-end browser testing. Tests go in `tests/` directory. Browsers installed: Chromium, Firefox, WebKit. Config: `playwright.config.ts`. Use for visual QA, interaction testing, and verifying game scenes render correctly. Docs: https://playwright.dev/docs/intro
