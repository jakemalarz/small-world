import type { Page } from '@playwright/test';

// ── Canvas / coordinate helpers ───────────────────────────────────────────────

const GAME_W = 1280;
const GAME_H = 720;

/**
 * Click at a game-world coordinate, auto-scaling for whatever size the canvas
 * is rendered at in the browser (Phaser.Scale.FIT).
 */
export async function clickGame(page: Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas element not found');
  const sx = box.x + gameX * (box.width / GAME_W);
  const sy = box.y + gameY * (box.height / GAME_H);
  await page.mouse.click(sx, sy);
}

// ── Phaser scene helpers ──────────────────────────────────────────────────────

/** Wait until a Phaser scene is running (active). */
export async function waitForScene(
  page: Page,
  sceneKey: string,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (key) => {
      const game = (window as any).__phaserGame;
      return game?.scene.getScenes(true).some((s: any) => s.scene.key === key) ?? false;
    },
    sceneKey,
    { timeout },
  );
}

/** Wait until a Phaser scene is no longer running. */
export async function waitForSceneGone(
  page: Page,
  sceneKey: string,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (key) => {
      const game = (window as any).__phaserGame;
      const scenes = game?.scene.getScenes(true) ?? [];
      return !scenes.some((s: any) => s.scene.key === key);
    },
    sceneKey,
    { timeout },
  );
}

// ── Game state helpers ────────────────────────────────────────────────────────

/** Read the current game phase from the active Game scene's controller. */
export async function getPhase(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gameScene = game?.scene.getScene('Game');
    return (gameScene as any)?.controller?.state?.phase ?? null;
  });
}

/** Read the current turn number. */
export async function getTurn(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gameScene = game?.scene.getScene('Game');
    return (gameScene as any)?.controller?.state?.turn ?? null;
  });
}

/** Read the active player index (0 or 1). */
export async function getActivePlayer(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gameScene = game?.scene.getScene('Game');
    return (gameScene as any)?.controller?.state?.activePlayerIndex ?? null;
  });
}

/** Poll until state.phase equals the expected value. */
export async function waitForPhase(
  page: Page,
  phase: string,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const game = (window as any).__phaserGame;
      const gameScene = game?.scene.getScene('Game');
      return (gameScene as any)?.controller?.state?.phase === expected;
    },
    phase,
    { timeout },
  );
}

/** Poll until state.activePlayerIndex equals the expected value. */
export async function waitForActivePlayer(
  page: Page,
  playerIndex: 0 | 1,
  timeout = 30_000,
): Promise<void> {
  await page.waitForFunction(
    (idx) => {
      const game = (window as any).__phaserGame;
      const gameScene = game?.scene.getScene('Game');
      return (gameScene as any)?.controller?.state?.activePlayerIndex === idx;
    },
    playerIndex,
    { timeout },
  );
}

/** Poll until state.turn equals the expected value. */
export async function waitForTurn(
  page: Page,
  turn: number,
  timeout = 60_000,
): Promise<void> {
  await page.waitForFunction(
    (t) => {
      const game = (window as any).__phaserGame;
      const gameScene = game?.scene.getScene('Game');
      return (gameScene as any)?.controller?.state?.turn === t;
    },
    turn,
    { timeout },
  );
}

// ── Known game coordinates ────────────────────────────────────────────────────

/** MainMenu button coordinates (in game pixels). */
export const MENU = {
  modes: {
    hvh:   { x: 226, y: 320 },
    hvai:  { x: 510, y: 320 },
    aivai: { x: 794, y: 320 },
  },
  difficulty: {
    easy:   { x: 510, y: 400 },
    medium: { x: 650, y: 400 },
  },
  startButton: { x: 640, y: 510 },
} as const;

/** HUD coordinates (in game pixels). */
export const HUD = {
  actionButton: { x: 640, y: 696 },
  /** Combo shop slot center (slot 0 = FREE, slot 1 costs 1 coin, etc.) */
  comboSlot: (index: number) => ({ x: 640, y: 130 + index * 84 }),
} as const;

// ── High-level game flow helpers ──────────────────────────────────────────────

/** Navigate to the root and wait for the MainMenu scene to be active. */
export async function gotoMainMenu(page: Page): Promise<void> {
  await page.goto('/');
  await waitForScene(page, 'MainMenu');
}

/** Start a Human vs Human game from the main menu. */
export async function startHvHGame(page: Page): Promise<void> {
  await gotoMainMenu(page);
  // HvH is the default selected mode — just click Start
  await clickGame(page, MENU.startButton.x, MENU.startButton.y);
  await waitForScene(page, 'HUD');
  await waitForScene(page, 'Board');
  await waitForPhase(page, 'selectCombo');
}

/** Start a Human vs AI game from the main menu. */
export async function startHvAIGame(
  page: Page,
  difficulty: 'easy' | 'medium' = 'easy',
): Promise<void> {
  await gotoMainMenu(page);
  await clickGame(page, MENU.modes.hvai.x, MENU.modes.hvai.y);
  await page.waitForTimeout(150); // let Phaser update the button tint
  if (difficulty === 'medium') {
    await clickGame(page, MENU.difficulty.medium.x, MENU.difficulty.medium.y);
    await page.waitForTimeout(100);
  }
  await clickGame(page, MENU.startButton.x, MENU.startButton.y);
  await waitForScene(page, 'HUD');
  await waitForScene(page, 'Board');
  await waitForPhase(page, 'selectCombo');
}

/** Click the HUD action button (End Conquest, Roll Die, etc.) */
export async function clickActionButton(page: Page): Promise<void> {
  await clickGame(page, HUD.actionButton.x, HUD.actionButton.y);
}

/** Click a combo shop slot. */
export async function clickComboSlot(page: Page, slotIndex: number): Promise<void> {
  const { x, y } = HUD.comboSlot(slotIndex);
  await clickGame(page, x, y);
}

/**
 * Drive the active human player through a full turn:
 *   selectCombo → readyTroops → conquest → reinforcementDie → redeploy → score
 *   → (optionalDecline if Stout power)
 *
 * After this resolves, the game has switched to the other player.
 */
export async function completeHumanTurn(
  page: Page,
  comboSlotIndex = 0,
): Promise<void> {
  // 1. Select a combo
  await waitForPhase(page, 'selectCombo');
  await clickComboSlot(page, comboSlotIndex);

  // 2. Ghouls in decline may trigger ghoulConquest before readyTroops
  await page.waitForFunction(
    () => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const phase = (gs as any)?.controller?.state?.phase;
      return phase === 'readyTroops' || phase === 'ghoulConquest';
    },
    { timeout: 10_000 },
  );
  const afterCombo = await getPhase(page);
  if (afterCombo === 'ghoulConquest') {
    await clickActionButton(page); // end ghoul conquest
  }

  // 3. readyTroops → Begin Conquest
  await waitForPhase(page, 'readyTroops');
  await clickActionButton(page);

  // 4. conquest → End Conquest (no conquests)
  await waitForPhase(page, 'conquest');
  await clickActionButton(page);

  // 5. reinforcementDie is always entered when player still has tokens in hand
  await waitForPhase(page, 'reinforcementDie');
  await clickActionButton(page); // Roll Die / end die phase

  // 6. redeploy → Confirm
  await waitForPhase(page, 'redeploy');
  await clickActionButton(page);

  // 7. score → End Turn
  await waitForPhase(page, 'score');
  await clickActionButton(page);

  // 8. Stout power may add an optional decline step
  await page.waitForFunction(
    () => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const phase = (gs as any)?.controller?.state?.phase;
      return (
        phase === 'optionalDecline' ||
        phase === 'selectCombo' ||
        phase === 'readyTroops' ||
        phase === 'ghoulConquest' ||
        phase === 'gameOver'
      );
    },
    { timeout: 10_000 },
  );
  const finalPhase = await getPhase(page);
  if (finalPhase === 'optionalDecline') {
    await clickActionButton(page); // Skip Decline
  }
}
