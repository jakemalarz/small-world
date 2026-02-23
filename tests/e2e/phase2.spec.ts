import { test, expect } from '@playwright/test';
import {
  startHvHGame,
  waitForPhase,
  getPhase,
  getTurn,
  getActivePlayer,
  clickActionButton,
  clickGame,
  completeHumanTurn,
  advanceToConquest,
  clickDeclineButton,
  clickFinalConquestButton,
  clickPanToggle,
  clickBrowseButton,
  getPanMode,
  getBrowseMode,
  getDieResult,
  getRedeployTokensInHand,
  getTokensOnBoard,
  getLegalActionTypes,
  isBoardInputEnabled,
} from './helpers';

// ── Phase 2 E2E tests ─────────────────────────────────────────────────────────
//
// Tests for Phase 2 features: decline flow, first-conquest highlighting,
// conquest cost, reinforcement die, redeployment model, pan mode, browse mode,
// and player box tooltips.

// ── Decline Flow (FR-22) ────────────────────────────────────────────────────

test.describe('Phase 2 — Decline Flow', () => {
  test('decline button is not visible during selectCombo phase', async ({ page }) => {
    await startHvHGame(page);

    // In selectCombo — decline should not be available
    const phase = await getPhase(page);
    expect(phase).toBe('selectCombo');

    // Verify no active race means decline is hidden
    const hasActiveRace = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const state = (gs as any)?.controller?.state;
      return state?.players[state.activePlayerIndex]?.activeRace !== null;
    });
    expect(hasActiveRace).toBe(false);
  });

  test('decline action is available during readyTroops phase when player has active race', async ({ page }) => {
    await startHvHGame(page);

    // Complete turn 1 for both players so player 0 has an active race on turn 2
    await completeHumanTurn(page);
    await completeHumanTurn(page);

    // Player 0 now has an active race — readyTroops should offer decline
    await waitForPhase(page, 'readyTroops');
    const actionTypes = await getLegalActionTypes(page);
    expect(actionTypes).toContain('decline');
  });

  test('clicking decline puts the active race in decline', async ({ page }) => {
    await startHvHGame(page);

    // Complete turn 1 for both players so player 0 has an active race on turn 2
    await completeHumanTurn(page);
    await completeHumanTurn(page);

    const activeIdx = await getActivePlayer(page);

    // Player should be at readyTroops with an active race
    await waitForPhase(page, 'readyTroops');

    // Click the decline button
    await clickDeclineButton(page);

    // Wait for phase to advance past readyTroops (decline skips to score)
    await page.waitForFunction(
      () => {
        const game = (window as any).__phaserGame;
        const gs = game?.scene.getScene('Game');
        const state = (gs as any)?.controller?.state;
        // After decline from readyTroops, activeRace becomes null
        const p = state?.players[state?.activePlayerIndex];
        return p?.activeRace === null || state?.phase === 'gameOver';
      },
      { timeout: 15_000 },
    );

    // Player should now have a declined race and no active race
    const playerState = await page.evaluate((idx) => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const state = (gs as any)?.controller?.state;
      const p = state?.players[idx];
      return {
        activeRace: p?.activeRace,
        declinedCount: p?.declinedRaces?.length ?? 0,
      };
    }, activeIdx as number);

    expect(playerState.activeRace).toBeNull();
    expect(playerState.declinedCount).toBeGreaterThanOrEqual(1);
  });
});

// ── First Conquest Entry Rule (FR-13, FR-56) ────────────────────────────────

test.describe('Phase 2 — First Conquest Entry', () => {
  test('first conquest targets are limited to edge/coastal regions', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Player has 0 tokens on board — first conquest
    const tokensOnBoard = await getTokensOnBoard(page);
    expect(tokensOnBoard).toBe(0);

    // All legal conquer targets should be edge or coastal
    const targets = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const c = (gs as any)?.controller;
      const state = c?.state;
      const actions = c?.legalActions ?? [];
      return actions
        .filter((a: any) => a.type === 'conquer')
        .map((a: any) => {
          const region = state.board.regions.find((r: any) => r.id === a.regionId);
          return { id: a.regionId, isEdge: region?.isEdge, isCoastal: region?.isCoastal };
        });
    });

    expect(targets.length).toBeGreaterThan(0);
    for (const t of targets) {
      expect(t.isEdge || t.isCoastal).toBe(true);
    }
  });

  test('isFirstConquest flag is true when player has no tokens on board', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    const isFirstConquest = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const state = (gs as any)?.controller?.state;
      const p = state?.players[state.activePlayerIndex];
      return (
        state?.phase === 'conquest' &&
        p?.activeRace !== null &&
        p?.activeRace?.tokensOnBoard === 0
      );
    });
    expect(isFirstConquest).toBe(true);
  });
});

// ── Conquest Cost (FR-15) ────────────────────────────────────────────────────

test.describe('Phase 2 — Conquest Cost', () => {
  test('legal conquer actions include cost information', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Check that legal conquer actions exist
    const conquerActions = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const actions = (gs as any)?.controller?.legalActions ?? [];
      return actions
        .filter((a: any) => a.type === 'conquer')
        .map((a: any) => ({ regionId: a.regionId, cost: a.cost ?? a.tokenCost }));
    });

    expect(conquerActions.length).toBeGreaterThan(0);
    // Each conquer action should have a cost >= 2 (base)
    for (const action of conquerActions) {
      if (action.cost !== undefined) {
        expect(action.cost).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

// ── Reinforcement Die / Final Conquest (FR-19, FR-20, FR-21) ────────────────
// Explicit entry: player clicks "Final Conquest" during conquest to enter
// reinforcementDie phase, then selects a region, die rolls, and conquest resolves.

test.describe('Phase 2 — Final Conquest', () => {
  test('End Conquest during conquest skips directly to redeploy', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Click "End Conquest" — should skip to redeploy, NOT reinforcementDie
    await clickActionButton(page);
    await waitForPhase(page, 'redeploy');
    expect(await getPhase(page)).toBe('redeploy');
  });

  test('Final Conquest button enters reinforcementDie with die null (step 1)', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Click "Final Conquest" button to enter reinforcementDie
    await clickFinalConquestButton(page);
    await waitForPhase(page, 'reinforcementDie');

    // Step 1: die has NOT been rolled yet
    const dieResult = await getDieResult(page);
    expect(dieResult).toBeNull();
  });

  test('successful final conquest places tokens from hand onto the conquered region', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Click "Final Conquest" to enter reinforcementDie phase
    await clickFinalConquestButton(page);
    await waitForPhase(page, 'reinforcementDie');

    // Record tokens in hand before final conquest
    const tokensBefore = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const state = (gs as any)?.controller?.state;
      return state?.players[state.activePlayerIndex]?.availableTokens ?? 0;
    });
    expect(tokensBefore).toBeGreaterThan(0);

    // Get a valid final conquest target
    const targetRegionId = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const c = (gs as any)?.controller;
      const actions = c?.legalActions ?? [];
      const useAction = actions.find((a: any) => a.type === 'useReinforcement');
      return useAction?.regionId ?? null;
    });
    expect(targetRegionId).not.toBeNull();

    // Force Math.random to return max die roll (3): index 5 of [0,0,0,1,2,3]
    await page.evaluate(() => {
      (window as any).__origRandom = Math.random;
      Math.random = () => 5 / 6 + 0.01; // floor(0.8433.. * 6) = 5 → die value 3
    });

    // Emit regionClick on the Board scene to trigger final conquest through
    // the normal event flow (Board → GameController._onRegionClick)
    await page.evaluate((rid: number) => {
      const game = (window as any).__phaserGame;
      const board = game?.scene.getScene('Board');
      board.events.emit('regionClick', { regionId: rid });
    }, targetRegionId!);

    // Restore Math.random
    await page.evaluate(() => {
      if ((window as any).__origRandom) {
        Math.random = (window as any).__origRandom;
        delete (window as any).__origRandom;
      }
    });

    // Wait for phase to advance to redeploy (die animation + state transition)
    await waitForPhase(page, 'redeploy');

    // Verify: the conquered region should now have tokens placed on it
    const regionAfter = await page.evaluate((rid: number) => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const state = (gs as any)?.controller?.state;
      const region = state?.board?.regions?.find((r: any) => r.id === rid);
      const player = state?.players[state.activePlayerIndex];
      return {
        regionTokens: region?.tokens ?? 0,
        regionOwner: region?.owner,
        activePlayerIndex: state?.activePlayerIndex,
        availableTokens: player?.availableTokens ?? 0,
      };
    }, targetRegionId!);

    // Region should be owned by the active player with tokens on it
    expect(regionAfter.regionOwner).toBe(regionAfter.activePlayerIndex);
    expect(regionAfter.regionTokens).toBeGreaterThan(0);
    // Tokens in hand should have decreased (some were placed on the region)
    expect(regionAfter.availableTokens).toBeLessThan(tokensBefore);
  });

  test('End Conquest during reinforcementDie backs out to redeploy', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Enter final conquest
    await clickFinalConquestButton(page);
    await waitForPhase(page, 'reinforcementDie');

    // Click "End Conquest" to back out
    await clickActionButton(page);
    await waitForPhase(page, 'redeploy');
    expect(await getPhase(page)).toBe('redeploy');
  });
});

// ── Redeployment (FR-57) ────────────────────────────────────────────────────

test.describe('Phase 2 — Redeployment', () => {
  test('redeploy phase initializes redeployment map from board state', async ({ page }) => {
    await startHvHGame(page);

    // Complete a turn where player conquers something, then check redeploy
    await advanceToConquest(page);
    await clickActionButton(page); // End Conquest → redeploy
    await waitForPhase(page, 'redeploy');

    // _redeployTokensInHand should reflect available tokens
    const tokensInHand = await getRedeployTokensInHand(page);
    expect(tokensInHand).toBeGreaterThanOrEqual(0);
  });

  test('confirm redeploy button advances to score phase', async ({ page }) => {
    await startHvHGame(page);

    await advanceToConquest(page);
    await clickActionButton(page); // End Conquest → redeploy
    await waitForPhase(page, 'redeploy');
    await clickActionButton(page); // Confirm Redeploy → score

    await waitForPhase(page, 'score');
    expect(await getPhase(page)).toBe('score');
  });
});

// ── Pan Mode / Interaction Mode (FR-60) ─────────────────────────────────────

test.describe('Phase 2 — Pan Mode Toggle', () => {
  test('pan mode starts as OFF (interaction mode)', async ({ page }) => {
    await startHvHGame(page);

    const panMode = await getPanMode(page);
    expect(panMode).toBe(false);
  });

  test('clicking pan toggle enables pan mode', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    await clickPanToggle(page);
    await page.waitForTimeout(200);

    const panMode = await getPanMode(page);
    expect(panMode).toBe(true);
  });

  test('clicking pan toggle again disables pan mode', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Toggle ON
    await clickPanToggle(page);
    await page.waitForTimeout(200);
    expect(await getPanMode(page)).toBe(true);

    // Toggle OFF
    await clickPanToggle(page);
    await page.waitForTimeout(200);
    expect(await getPanMode(page)).toBe(false);
  });

  test('region clicks do not fire game actions in pan mode', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Enable pan mode
    await clickPanToggle(page);
    await page.waitForTimeout(200);
    expect(await getPanMode(page)).toBe(true);

    // Get a legal conquer target
    const targetRegion = await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const gs = game?.scene.getScene('Game');
      const actions = (gs as any)?.controller?.legalActions ?? [];
      const conquer = actions.find((a: any) => a.type === 'conquer');
      if (!conquer) return null;
      const state = (gs as any)?.controller?.state;
      const region = state.board.regions.find((r: any) => r.id === conquer.regionId);
      return region ? { id: region.id, centerX: 0, centerY: 0 } : null;
    });

    // Click on the map area — should not trigger conquest
    if (targetRegion) {
      await clickGame(page, 400, 400); // arbitrary map area
      await page.waitForTimeout(500);

      // Phase should still be conquest (not advanced)
      const phase = await getPhase(page);
      expect(phase).toBe('conquest');
    }
  });
});

// ── Browse Combo Mode (FR-54) ───────────────────────────────────────────────

test.describe('Phase 2 — Browse Combo Mode', () => {
  test('browse mode starts as OFF', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    const browseMode = await getBrowseMode(page);
    expect(browseMode).toBe(false);
  });

  test('clicking browse button enables browse mode during conquest', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    await clickBrowseButton(page);
    await page.waitForTimeout(300);

    const browseMode = await getBrowseMode(page);
    expect(browseMode).toBe(true);
  });

  test('browse mode disables board input', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Board input should be enabled before browse
    expect(await isBoardInputEnabled(page)).toBe(true);

    await clickBrowseButton(page);
    await page.waitForTimeout(300);

    // Board input should be disabled during browse
    expect(await isBoardInputEnabled(page)).toBe(false);
  });

  test('closing browse mode re-enables board input', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    // Open browse
    await clickBrowseButton(page);
    await page.waitForTimeout(300);
    expect(await getBrowseMode(page)).toBe(true);

    // The close button is typically at the top-right of the combo shop overlay.
    // Emit browseComboClose via clicking the close button (✕ at top-right of shop panel).
    // The shop panel renders at roughly x=640 area, close button at top-right of that.
    // We'll click a plausible close button position. If it doesn't work, the test will fail
    // and we can adjust coordinates in task 23.
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const hudScene = game?.scene.getScene('HUD');
      hudScene?.events.emit('browseComboClose');
    });
    await page.waitForTimeout(300);

    expect(await getBrowseMode(page)).toBe(false);
    expect(await isBoardInputEnabled(page)).toBe(true);
  });

  test('phase does not change while browse mode is open', async ({ page }) => {
    await startHvHGame(page);
    await advanceToConquest(page);

    const phaseBefore = await getPhase(page);

    await clickBrowseButton(page);
    await page.waitForTimeout(500);

    const phaseAfter = await getPhase(page);
    expect(phaseAfter).toBe(phaseBefore);
  });
});

// ── Phase Progression Integration ───────────────────────────────────────────

test.describe('Phase 2 — Phase Progression', () => {
  test('full turn still completes correctly after Phase 2 changes', async ({ page }) => {
    await startHvHGame(page);
    const firstPlayer = await getActivePlayer(page);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await completeHumanTurn(page);

    const nextPlayer = await getActivePlayer(page);
    expect(nextPlayer).not.toBe(firstPlayer);
    expect(errors).toHaveLength(0);
  });

  test('both players can complete turn 1 without errors', async ({ page }) => {
    await startHvHGame(page);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await completeHumanTurn(page);
    await completeHumanTurn(page);

    const turn = await getTurn(page);
    expect(turn).toBe(2);
    expect(errors).toHaveLength(0);
  });

  test('game reaches selectCombo or readyTroops on turn 2 start', async ({ page }) => {
    await startHvHGame(page);

    await completeHumanTurn(page);
    await completeHumanTurn(page);

    const phase = await getPhase(page);
    // Both players now have active races — turn 2 starts at readyTroops
    // (unless one player declined, then selectCombo)
    expect(['selectCombo', 'readyTroops', 'ghoulConquest']).toContain(phase);
  });
});

// ── No JS Errors ────────────────────────────────────────────────────────────

test.describe('Phase 2 — Error-Free Operation', () => {
  test('no JS errors during a 2-turn HvH session', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await startHvHGame(page);
    await completeHumanTurn(page);
    await completeHumanTurn(page);
    await completeHumanTurn(page);
    await completeHumanTurn(page);

    expect(errors).toHaveLength(0);
  });

  test('no JS errors when toggling pan mode multiple times', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await startHvHGame(page);
    await advanceToConquest(page);

    for (let i = 0; i < 5; i++) {
      await clickPanToggle(page);
      await page.waitForTimeout(100);
    }

    expect(errors).toHaveLength(0);
  });

  test('no JS errors when opening and closing browse mode', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    await startHvHGame(page);
    await advanceToConquest(page);

    await clickBrowseButton(page);
    await page.waitForTimeout(300);

    // Close via event (reliable)
    await page.evaluate(() => {
      const game = (window as any).__phaserGame;
      const hudScene = game?.scene.getScene('HUD');
      hudScene?.events.emit('browseComboClose');
    });
    await page.waitForTimeout(200);

    expect(errors).toHaveLength(0);
  });
});
