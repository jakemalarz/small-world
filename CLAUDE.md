# Small World — Board Game (Web)

A web-based implementation of the Small World board game using Phaser.js.

## Architecture

- **Engine**: Phaser.js v3 (2D game framework)
- **Bundler**: Vite (fast HMR)
- **Language**: TypeScript (strict mode)
- **Canvas**: 1280x720 with FIT scaling (responsive 16:9)

## Project Structure

```
src/
  main.ts              — Phaser game bootstrap
  game/
    config.ts          — Game config (resolution, scaling, scenes)
    scenes/
      Boot.ts          — Asset preloading with progress bar
      MainMenu.ts      — Game setup / start screen
      Game.ts          — Main gameplay scene
  assets/
    images/            — Static game images
    sprites/           — Sprite sheets
    generated/         — AI-generated assets (Gemini)
    reference/         — Rulebook PDF + original map
```

## Coding Conventions

- One Phaser Scene per file, named export matching filename
- Scene keys match class names (e.g., `super('MainMenu')`)
- Use `this.scale.width/height` for responsive positioning
- Assets loaded in Boot scene, referenced by key elsewhere
- No CSS frameworks — Phaser handles all rendering on canvas

## Workflow Commands

- `/preview` — Start dev server + open browser
- `/screenshot` — Capture game state for visual QA
- `/generate-asset <desc>` — Generate art with Gemini
- `/task <add|start|done|list>` — Manage task board (TASKS.md)

## MCP Servers

- **Puppeteer** — Browser automation, screenshots
- **Nano Banana** — Gemini image generation (requires GEMINI_API_KEY)

## Game Reference

- Rulebook: `src/assets/reference/small world rule book.pdf`
- 2-player map: `src/assets/reference/2-player-map.jpeg`

## Development

```bash
npm run dev      # Start dev server (localhost:5173)
npm run build    # Production build
npm run preview  # Preview production build
```
