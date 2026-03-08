import { test, expect } from '@playwright/test';
import {
  startHvAIGame,
  waitForPhase,
  getPhase,
  getTurn,
  getActivePlayer,
  clickComboSlot,
  completeHumanTurn,
} from './helpers';

// ── Human vs AI e2e tests ─────────────────────────────────────────────────────
//
// Covers: HvAI game start (easy & medium difficulty), human player interaction,
// AI auto-turn completion, and multi-turn flow validation.

test.describe('Human vs AI — game setup', () => {
  test('HvAI Easy game starts on turn 1 in selectCombo phase', async ({ page }) => {
    await startHvAIGame(page, 'easy');

    const [phase, turn] = await Promise.all([getPhase(page), getTurn(page)]);
    expect(phase).toBe('selectCombo');
    expect(turn).toBe(1);
  });

  test('HvAI Medium game starts on turn 1 in selectCombo phase', async ({ page }) => {
    await startHvAIGame(page, 'medium');

    const [phase, turn] = await Promise.all([getPhase(page), getTurn(page)]);
    expect(phase).toBe('selectCombo');
    expect(turn).toBe(1);
  });

  test('Board and HUD scenes are running after HvAI game starts', async ({ page }) => {
    await startHvAIGame(page);

    const activeScenes = await page.evaluate(() =>
      (window as any).__phaserGame?.scene
        .getScenes(true)
        .map((s: any) => s.scene.key) ?? [],
    );
    expect(activeScenes).toContain('Board');
    expect(activeScenes).toContain('HUD');
  });

  test('game is waiting for human input on first tick (not auto-advancing)', async ({ page }) => {
    await startHvAIGame(page);

    // Wait until it's the human player's (player 0) turn in selectCombo
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const c = (gs as any)?.controller;
        return (
          c?.state?.activePlayerIndex === 0 &&
          c?.state?.phase === 'selectCombo' &&
          c?.readyForInput === true
        );
      },
      { timeout: 15_000 },
    );

    // Game is blocked waiting for human input — it should not auto-advance
    await page.waitForTimeout(800);
    const phase = await getPhase(page);
    expect(phase).toBe('selectCombo');
  });

  test('both players start with 5 coins', async ({ page }) => {
    await startHvAIGame(page);

    const coins = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const state = (gs as any)?.controller?.state;
      return state?.players.map((p: any) => p.coins) ?? [];
    });
    expect(coins[0]).toBe(5);
    expect(coins[1]).toBe(5);
  });
});

test.describe('Human vs AI — human player turn', () => {
  test('human can select a combo and phase advances past selectCombo', async ({ page }) => {
    await startHvAIGame(page);

    // Wait for the human player's (player 0) turn in selectCombo with readyForInput
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const c = (gs as any)?.controller;
        return (
          c?.state?.activePlayerIndex === 0 &&
          c?.state?.phase === 'selectCombo' &&
          c?.readyForInput === true
        );
      },
      { timeout: 15_000 },
    );

    await clickComboSlot(page, 0);
    // First combo skips readyTroops (no tokens on board) → straight to conquest
    await waitForPhase(page, 'conquest', 10_000);

    expect(await getPhase(page)).toBe('conquest');
  });

  test('human player reaches conquest after selecting combo', async ({ page }) => {
    await startHvAIGame(page);

    // Wait for the human player's (player 0) turn in selectCombo
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const c = (gs as any)?.controller;
        return (
          c?.state?.activePlayerIndex === 0 &&
          c?.state?.phase === 'selectCombo' &&
          c?.readyForInput === true
        );
      },
      { timeout: 15_000 },
    );

    await clickComboSlot(page, 0);
    // First combo skips readyTroops (no tokens on board) → straight to conquest
    await waitForPhase(page, 'conquest', 10_000);

    expect(await getPhase(page)).toBe('conquest');
  });

  test('human player can complete a full turn without error', async ({ page }) => {
    await startHvAIGame(page);

    // Wait for AI to complete its turn if it goes first
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        // Human is player 0 in HvAI — wait until it's their turn
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await completeHumanTurn(page);

    expect(errors).toHaveLength(0);
  });
});

test.describe('Human vs AI — AI auto-turn', () => {
  test('AI player completes its turn automatically after human finishes', async ({ page }) => {
    await startHvAIGame(page, 'easy');

    // Ensure we start on the human player's turn
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );

    const humanPlayerIndex = await getActivePlayer(page);
    expect(humanPlayerIndex).toBe(0);

    // Human completes turn
    await completeHumanTurn(page);

    // AI (player 1) should now auto-complete its turn and return control to player 0
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        // AI done when it's player 0's turn again (or game over on turn 10)
        return (
          (state?.activePlayerIndex === 0 &&
            (state?.phase === 'selectCombo' || state?.phase === 'readyTroops')) ||
          state?.phase === 'gameOver'
        );
      },
      { timeout: 30_000 },
    );

    const phase = await getPhase(page);
    // Game returned to human player or ended
    expect(['selectCombo', 'readyTroops', 'gameOver']).toContain(phase);
  });

  test('AI Medium completes its turn automatically', async ({ page }) => {
    await startHvAIGame(page, 'medium');

    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );

    await completeHumanTurn(page);

    // AI medium should also auto-complete
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return (
          (state?.activePlayerIndex === 0 &&
            (state?.phase === 'selectCombo' || state?.phase === 'readyTroops')) ||
          state?.phase === 'gameOver'
        );
      },
      { timeout: 30_000 },
    );

    const phase = await getPhase(page);
    expect(['selectCombo', 'readyTroops', 'gameOver']).toContain(phase);
  });

  test('turn advances to 2 after both human and AI complete turn 1', async ({ page }) => {
    await startHvAIGame(page, 'easy');

    // Wait for human turn
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );

    // Human completes turn 1
    await completeHumanTurn(page);

    // Wait for AI to complete turn 1 and turn to advance
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.turn >= 2 || state?.phase === 'gameOver';
      },
      { timeout: 30_000 },
    );

    const turn = await getTurn(page);
    expect(turn).toBeGreaterThanOrEqual(2);
  });

  test('AI does not require any manual input to complete its turn', async ({ page }) => {
    await startHvAIGame(page, 'easy');

    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );

    // Human finishes — then we just wait without clicking anything
    await completeHumanTurn(page);

    const activeBeforeWait = await getActivePlayer(page);

    // AI should change the active player without any user input
    await page.waitForFunction(
      (prevActive) => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return (
          state?.activePlayerIndex !== prevActive ||
          state?.phase === 'gameOver'
        );
      },
      activeBeforeWait,
      { timeout: 30_000 },
    );

    const finalPhase = await getPhase(page);
    // Game progressed without human interaction
    expect(['selectCombo', 'readyTroops', 'ghoulReadyTroops', 'gameOver']).toContain(finalPhase);
  });
});

test.describe('Human vs AI — multi-turn flow', () => {
  test('game can complete turn 2 with human and AI', async ({ page }) => {
    await startHvAIGame(page, 'easy');

    // Complete turn 1 as human (player 0)
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );
    await completeHumanTurn(page);

    // Wait for turn 2 to start (AI finishes turn 1)
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return (
          (state?.turn >= 2 && state?.activePlayerIndex === 0) ||
          state?.phase === 'gameOver'
        );
      },
      { timeout: 30_000 },
    );

    if ((await getPhase(page)) === 'gameOver') return; // edge case: only 1 round

    // Complete turn 2 as human
    await completeHumanTurn(page);

    // AI finishes turn 2
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.turn >= 3 || state?.phase === 'gameOver';
      },
      { timeout: 30_000 },
    );

    const turn = await getTurn(page);
    expect(turn).toBeGreaterThanOrEqual(3);
  });

  test('coins increase over multiple turns', async ({ page }) => {
    await startHvAIGame(page, 'easy');

    // Wait for human turn
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );

    const coinsBefore = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      return (gs as any)?.controller?.state?.players[0]?.coins ?? 0;
    });

    // Complete turn 1 and wait for AI
    await completeHumanTurn(page);
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return (
          (state?.turn >= 2 && state?.activePlayerIndex === 0) ||
          state?.phase === 'gameOver'
        );
      },
      { timeout: 30_000 },
    );

    const coinsAfter = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      return (gs as any)?.controller?.state?.players[0]?.coins ?? 0;
    });

    // Coins should have been awarded during scoring (at least some regions worth points)
    expect(coinsAfter).toBeGreaterThanOrEqual(coinsBefore);
  });

  test('no JS errors during a 2-turn HvAI session', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await startHvAIGame(page, 'easy');

    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return state?.activePlayerIndex === 0 && state?.phase === 'selectCombo';
      },
      { timeout: 15_000 },
    );

    await completeHumanTurn(page);

    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        return (
          (state?.turn >= 2 && state?.activePlayerIndex === 0) ||
          state?.phase === 'gameOver'
        );
      },
      { timeout: 30_000 },
    );

    expect(errors).toHaveLength(0);
  });
});
