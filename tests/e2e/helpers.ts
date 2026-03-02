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

/** Poll until state.phase equals the expected value AND the controller is ready for input. */
export async function waitForPhase(
  page: Page,
  phase: string,
  timeout = 15_000,
): Promise<void> {
  await page.waitForFunction(
    (expected) => {
      const game = (window as any).__phaserGame;
      const gameScene = game?.scene.getScene('Game');
      const c = (gameScene as any)?.controller;
      return c?.state?.phase === expected && c?.readyForInput === true;
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
  /** Decline button — left of the action button (FR-22). */
  declineButton: { x: 480, y: 696 },
  /** Final Conquest button — right of the action button. */
  finalConquestButton: { x: 800, y: 696 },
  /** Pan/Interact mode toggle — top-right corner (FR-60). */
  panToggle: { x: 1080, y: 32 },
  /** Browse Combos button — top-right area (FR-54). */
  browseButton: { x: 1200, y: 34 },
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

/**
 * After confirming redeployment, click through any optional post-redeploy phases
 * (placeFortress, placeEncampments, placeHeroes) until the game reaches score.
 *
 * These phases appear when the active race/power has special post-battle abilities
 * (Fortified, Bivouacking, Heroic). Without this, `waitForPhase(page, 'score')`
 * times out whenever one of those powers is randomly assigned.
 */
export async function advanceFromRedeployToScore(page: Page): Promise<void> {
  // Allow up to 5 intermediate phases (more than the maximum possible chain)
  for (let i = 0; i < 5; i++) {
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const c = (gs as any)?.controller;
        const phase = c?.state?.phase;
        return (
          c?.readyForInput === true &&
          (phase === 'placeFortress' ||
            phase === 'placeEncampments' ||
            phase === 'placeHeroes' ||
            phase === 'score')
        );
      },
      { timeout: 10_000 },
    );
    const phase = await getPhase(page);
    if (phase === 'score') return;
    // Click End Phase / Skip to advance past the optional placement phase
    await clickActionButton(page);
  }
}

/**
 * Wait until the game controller signals it is ready to accept input.
 * All game-action click helpers call this before firing a click, so that
 * clicks cannot land during an animation and be silently dropped.
 */
async function waitForReadyForInput(page: Page, timeout = 10_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      return (gs as any)?.controller?.readyForInput === true;
    },
    { timeout },
  );
}

/** Click the HUD action button (End Conquest, Roll Die, etc.) */
export async function clickActionButton(page: Page): Promise<void> {
  await waitForReadyForInput(page);
  await clickGame(page, HUD.actionButton.x, HUD.actionButton.y);
}

/** Click a combo shop slot. */
export async function clickComboSlot(page: Page, slotIndex: number): Promise<void> {
  await waitForReadyForInput(page);
  const { x, y } = HUD.comboSlot(slotIndex);
  await clickGame(page, x, y);
}

/**
 * Drive the active human player through a full turn:
 *   selectCombo → readyTroops → conquest → reinforcementDie → redeploy → score
 *   → (optionalDecline if Stout power)
 *
 * Also handles the case where the player already has an active race (turn ≥ 2),
 * in which case the turn starts at readyTroops instead of selectCombo.
 *
 * After this resolves, the game has switched to the other player.
 */
export async function completeHumanTurn(
  page: Page,
  comboSlotIndex = 0,
): Promise<void> {
  // 1. Wait for start of turn — either selectCombo (no active race) or
  //    readyTroops/ghoulReadyTroops (player already has a race from a previous turn).
  await page.waitForFunction(
    () => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const c = (gs as any)?.controller;
      const phase = c?.state?.phase;
      return (
        c?.readyForInput === true &&
        (phase === 'selectCombo' || phase === 'readyTroops' || phase === 'ghoulReadyTroops')
      );
    },
    { timeout: 15_000 },
  );

  const turnStartPhase = await getPhase(page);

  if (turnStartPhase === 'selectCombo') {
    // 2a. Select a combo
    await clickComboSlot(page, comboSlotIndex);

    // 2b. After combo: ghoulReadyTroops, readyTroops (turn 2+), or conquest (turn 1)
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const c = (gs as any)?.controller;
        const phase = c?.state?.phase;
        return c?.readyForInput === true &&
          (phase === 'readyTroops' || phase === 'ghoulReadyTroops' || phase === 'conquest');
      },
      { timeout: 10_000 },
    );
    const afterCombo = await getPhase(page);
    if (afterCombo === 'ghoulReadyTroops') {
      // Click through all 3 ghoul phases: ghoulReadyTroops → ghoulConquest → ghoulRedeploy
      await clickActionButton(page); // end ghoul ready troops → ghoulConquest
      await waitForPhase(page, 'ghoulConquest');
      await clickActionButton(page); // end ghoul conquest → ghoulRedeploy
      await waitForPhase(page, 'ghoulRedeploy');
      await clickActionButton(page); // end ghoul redeploy → readyTroops or conquest
      await page.waitForFunction(
        () => {
          const game = (window as any).__phaserGame;
          const gs = game?.scene.getScene('Game');
          const c = (gs as any)?.controller;
          const phase = c?.state?.phase;
          return c?.readyForInput === true &&
            (phase === 'readyTroops' || phase === 'conquest');
        },
        { timeout: 10_000 },
      );
    }
  } else if (turnStartPhase === 'ghoulReadyTroops') {
    // 2c. Ghoul phases already triggered (had declining ghouls, turn start)
    // Click through all 3 ghoul phases: ghoulReadyTroops → ghoulConquest → ghoulRedeploy
    await clickActionButton(page); // end ghoul ready troops → ghoulConquest
    await waitForPhase(page, 'ghoulConquest');
    await clickActionButton(page); // end ghoul conquest → ghoulRedeploy
    await waitForPhase(page, 'ghoulRedeploy');
    await clickActionButton(page); // end ghoul redeploy → readyTroops or conquest
  }
  // else turnStartPhase === 'readyTroops': player has active race, skip combo step

  // 3. readyTroops → Begin Conquest (skip if already at conquest, e.g. turn 1)
  const currentPhase = await getPhase(page);
  if (currentPhase === 'readyTroops') {
    await waitForPhase(page, 'readyTroops');
    await clickActionButton(page);
  }

  // 4. conquest → End Conquest (no conquests — skips straight to redeploy)
  await waitForPhase(page, 'conquest');
  await clickActionButton(page);

  // 5. redeploy → Confirm
  await waitForPhase(page, 'redeploy');
  await clickActionButton(page);

  // 6. Click through any optional post-redeploy phases (placeFortress, placeEncampments,
  //    placeHeroes) that appear with Fortified / Bivouacking / Heroic powers.
  await advanceFromRedeployToScore(page);

  // 7. score → End Turn
  await clickActionButton(page);

  // 8. Stout power may add an optional decline step.
  //    For the next player's turn phases we also require readyForInput so callers
  //    can immediately read activePlayerIndex without a race window.
  await page.waitForFunction(
    () => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const c = (gs as any)?.controller;
      const phase = c?.state?.phase;
      return (
        phase === 'optionalDecline' ||
        phase === 'gameOver' ||
        (c?.readyForInput === true &&
          (phase === 'selectCombo' || phase === 'readyTroops' || phase === 'ghoulReadyTroops'))
      );
    },
    { timeout: 10_000 },
  );
  const finalPhase = await getPhase(page);
  if (finalPhase === 'optionalDecline') {
    await clickActionButton(page); // Skip Decline
    // Wait for the turn to fully transition to the next player
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const c = (gs as any)?.controller;
        const phase = c?.state?.phase;
        return (
          phase === 'gameOver' ||
          (c?.readyForInput === true &&
            (phase === 'selectCombo' || phase === 'readyTroops' || phase === 'ghoulReadyTroops'))
        );
      },
      { timeout: 10_000 },
    );
  }
}

// ── Phase 2 helpers ─────────────────────────────────────────────────────────

/** Click the Decline button in the HUD (FR-22). */
export async function clickDeclineButton(page: Page): Promise<void> {
  await waitForReadyForInput(page);
  await clickGame(page, HUD.declineButton.x, HUD.declineButton.y);
}

/** Click the Final Conquest button in the HUD. */
export async function clickFinalConquestButton(page: Page): Promise<void> {
  await waitForReadyForInput(page);
  await clickGame(page, HUD.finalConquestButton.x, HUD.finalConquestButton.y);
}

/** Click the Pan/Interact toggle button (FR-60). */
export async function clickPanToggle(page: Page): Promise<void> {
  await clickGame(page, HUD.panToggle.x, HUD.panToggle.y);
}

/** Click the Browse Combos button (FR-54). */
export async function clickBrowseButton(page: Page): Promise<void> {
  await clickGame(page, HUD.browseButton.x, HUD.browseButton.y);
}

/** Read whether pan mode is currently active. */
export async function getPanMode(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const hudScene = game?.scene.getScene('HUD');
    return (hudScene as any)?.panMode ?? false;
  });
}

/** Read whether browse mode is currently active on the controller. */
export async function getBrowseMode(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gameScene = game?.scene.getScene('Game');
    return (gameScene as any)?.controller?._browseMode ?? false;
  });
}

/** Read the reinforcement die result from state (null if not rolled). */
export async function getDieResult(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    const state = (gs as any)?.controller?.state;
    return state?.reinforcementDie?.result ?? null;
  });
}

/** Read the redeployment tokens in hand from the controller. */
export async function getRedeployTokensInHand(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    return (gs as any)?.controller?._redeployTokensInHand ?? 0;
  });
}

/** Read the redeployment map from the controller as a plain object. */
export async function getRedeployMap(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    const map = (gs as any)?.controller?._redeployMap;
    if (!map) return {};
    const result: Record<string, number> = {};
    map.forEach((v: number, k: number) => { result[String(k)] = v; });
    return result;
  });
}

/** Read the active player's tokensOnBoard count. */
export async function getTokensOnBoard(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    const state = (gs as any)?.controller?.state;
    const p = state?.players[state.activePlayerIndex];
    return p?.activeRace?.tokensOnBoard ?? 0;
  });
}

/** Read the active player's availableTokens (tokens in hand). */
export async function getAvailableTokens(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    const state = (gs as any)?.controller?.state;
    return state?.players[state.activePlayerIndex]?.availableTokens ?? 0;
  });
}

/** Right-click at a game-world coordinate (for redeployment token removal). */
export async function rightClickGame(page: Page, gameX: number, gameY: number): Promise<void> {
  const canvas = page.locator('canvas');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas element not found');
  const sx = box.x + gameX * (box.width / GAME_W);
  const sy = box.y + gameY * (box.height / GAME_H);
  await page.mouse.click(sx, sy, { button: 'right' });
}

/**
 * Drive a human player through selectCombo + readyTroops to reach conquest phase.
 * Useful as setup for Phase 2 tests that need to test conquest-phase features.
 */
export async function advanceToConquest(page: Page, comboSlotIndex = 0): Promise<void> {
  await page.waitForFunction(
    () => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const c = (gs as any)?.controller;
      const phase = c?.state?.phase;
      return (
        c?.readyForInput === true &&
        (phase === 'selectCombo' || phase === 'readyTroops' || phase === 'ghoulReadyTroops')
      );
    },
    { timeout: 15_000 },
  );

  const turnStartPhase = await getPhase(page);

  if (turnStartPhase === 'selectCombo') {
    await clickComboSlot(page, comboSlotIndex);
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const c = (gs as any)?.controller;
        const phase = c?.state?.phase;
        return c?.readyForInput === true &&
          (phase === 'readyTroops' || phase === 'ghoulReadyTroops' || phase === 'conquest');
      },
      { timeout: 10_000 },
    );
    const afterCombo = await getPhase(page);
    if (afterCombo === 'ghoulReadyTroops') {
      await clickActionButton(page); // end ghoul ready troops → ghoulConquest
      await waitForPhase(page, 'ghoulConquest');
      await clickActionButton(page); // end ghoul conquest → ghoulRedeploy
      await waitForPhase(page, 'ghoulRedeploy');
      await clickActionButton(page); // end ghoul redeploy → readyTroops or conquest
      await page.waitForFunction(
        () => {
          const game = (window as any).__phaserGame;
          const gs = game?.scene.getScene('Game');
          const c = (gs as any)?.controller;
          const phase = c?.state?.phase;
          return c?.readyForInput === true &&
            (phase === 'readyTroops' || phase === 'conquest');
        },
        { timeout: 10_000 },
      );
    }
  } else if (turnStartPhase === 'ghoulReadyTroops') {
    await clickActionButton(page); // end ghoul ready troops → ghoulConquest
    await waitForPhase(page, 'ghoulConquest');
    await clickActionButton(page); // end ghoul conquest → ghoulRedeploy
    await waitForPhase(page, 'ghoulRedeploy');
    await clickActionButton(page); // end ghoul redeploy → readyTroops or conquest
  }

  // readyTroops → conquest (skip if already at conquest, e.g. turn 1)
  const currentPhase = await getPhase(page);
  if (currentPhase === 'readyTroops') {
    await clickActionButton(page);
  }
  await waitForPhase(page, 'conquest');
}

/** Read all legal action types from the controller. */
export async function getLegalActionTypes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    const actions = (gs as any)?.controller?.legalActions ?? [];
    return actions.map((a: { type: string }) => a.type);
  });
}

/** Read the gather map from the controller (readyTroops phase). */
export async function getGatherMap(page: Page): Promise<Record<string, number>> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    const map = (gs as any)?.controller?._gatherMap;
    if (!map) return {};
    const result: Record<string, number> = {};
    map.forEach((v: number, k: number) => { result[String(k)] = v; });
    return result;
  });
}

/** Read the gather tokens in hand from the controller (readyTroops phase). */
export async function getGatherTokensInHand(page: Page): Promise<number> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    return (gs as any)?.controller?._gatherTokensInHand ?? 0;
  });
}

/** Check whether the abandon dialog is currently active. */
export async function isAbandonDialogActive(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const gs = game?.scene.getScene('Game');
    return (gs as any)?.controller?._abandonDialogActive ?? false;
  });
}

/** Check whether board input is currently enabled. */
export async function isBoardInputEnabled(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const game = (window as any).__phaserGame;
    const board = game?.scene.getScene('Board');
    return board?.input?.enabled ?? false;
  });
}
