import Phaser from 'phaser';
import type { GameState, TurnPhase } from '@/game/state/types';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';
import { getActiveModifiers } from '@/game/abilities/modifiers';
import { ComboShopRenderer } from '@/game/presentation/ComboShopRenderer';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAYER_COLORS: [number, number] = [0x3b82f6, 0xef4444]; // blue, red
const PLAYER_HEX:   [string, string] = ['#3b82f6', '#ef4444'];
const ACTIVE_TINT = 0xfbbf24; // gold highlight for active player
const DARK_BG     = 0x0f0f1a;
const PANEL_BG    = 0x1e1e2e;
const TEXT_COLOR  = '#e8d5b7';
const DIM_COLOR   = '#888888';

const PHASE_LABELS: Record<TurnPhase, string> = {
  selectCombo:            'Select Race & Power',
  ghoulReadyTroops:       'Ghouls: Ready Troops',
  ghoulConquest:          'Ghouls: Conquest',
  ghoulRedeploy:          'Ghouls: Redeploy',
  ghoulReinforcementDie:  'Ghouls: Final Conquest',
  readyTroops:            'Ready Troops',
  conquest:               'Conquest',
  reinforcementDie:       'Final Conquest',
  redeploy:               'Redeploy',
  placeFortress:          'Place Fortress',
  placeEncampments:       'Place Encampments',
  placeHeroes:            'Place Heroes',
  score:                  'Scoring',
  optionalDecline:        'Optional Decline',
  decline:                'In Decline',
  gameOver:               'Game Over',
};

const ACTION_BUTTONS: Partial<Record<TurnPhase, string>> = {
  ghoulReadyTroops:      'Begin Ghoul Conquest →',
  ghoulConquest:         'End Ghoul Conquest',
  ghoulRedeploy:         'Confirm Ghoul Redeploy',
  ghoulReinforcementDie: 'End Ghoul Conquest',
  readyTroops:           'Begin Conquest →',
  conquest:              'End Conquest',
  reinforcementDie:      'End Conquest',
  redeploy:              'Confirm Redeploy',
  placeFortress:         'Skip Fortress',
  placeEncampments:      'Confirm Encampments',
  placeHeroes:           'Skip Heroes',
  score:                 'End Turn',
  optionalDecline:       'End Turn',
  decline:               'Go In Decline',
};

// ── HUD Scene ─────────────────────────────────────────────────────────────────

/**
 * HUD scene — runs in parallel with the Board scene (launched via
 * `this.scene.launch('HUD')`). Uses a fixed camera (no pan/zoom).
 *
 * The GameController calls `hud.refresh(state)` to update all display elements
 * whenever state changes.
 *
 * Action buttons emit `playerAction` events on the scene's event bus; the
 * GameController wires those to HumanPlayer.chooseAction resolution.
 */
export class HUD extends Phaser.Scene {
  // ── Text / graphics refs for live updates ─────────────────────────────────
  private phaseText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private hudBar!: HudBar;
  private playerDashboards: PlayerDashboard[] = [];
  private declinedDashboards: DeclinedDashboard[] = [];
  private actionButton!: Phaser.GameObjects.Container;
  private actionBtnBg!: Phaser.GameObjects.Rectangle;
  private actionBtnLabel!: Phaser.GameObjects.Text;
  private declineButton!: Phaser.GameObjects.Container;
  private declineBtnBg!: Phaser.GameObjects.Rectangle;
  private declineBtnLabel!: Phaser.GameObjects.Text;
  private finalConquestButton!: Phaser.GameObjects.Container;
  private finalConquestBtnBg!: Phaser.GameObjects.Rectangle;
  private dragonButton!: Phaser.GameObjects.Container;
  private dragonBtnBg!: Phaser.GameObjects.Rectangle;
  private dragonBtnLabel!: Phaser.GameObjects.Text;
  private _dragonMode = false;
  private browseButton!: Phaser.GameObjects.Container;
  private browseBtnBg!: Phaser.GameObjects.Rectangle;
  private comboShop!: ComboShopRenderer;
  private dieResultText!: Phaser.GameObjects.Text;
  private modeToggleBg!: Phaser.GameObjects.Rectangle;
  private modeToggleLabel!: Phaser.GameObjects.Text;
  private _panMode = false;

  constructor() {
    super('HUD');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    // HUD renders above all other scenes — fixed camera, no scroll
    this.cameras.main.setScroll(0, 0);

    this._drawTopBar();
    this._drawHudBar();
    this._drawPlayerDashboards();
    this._drawActionButton();
    this._drawDeclineButton();
    this._drawFinalConquestButton();
    this._drawBrowseButton();
    this._drawDieResult();
    this._drawModeToggle();
    this.comboShop = new ComboShopRenderer(this);

    // Clean up all game objects when the scene is stopped so UI elements
    // from a previous game don't persist when the scene is relaunched.
    this.events.on('shutdown', () => {
      this.children.removeAll(true);
    });
  }

  // ── Public API (called by GameController) ──────────────────────────────────

  /** Refresh all HUD elements to reflect the given game state. */
  refresh(state: GameState): void {
    // Dynamic phase label: prefix with race name when player has Ghouls in decline + active race
    const activePlayer = state.players[state.activePlayerIndex];
    const hasGhoulsInDecline = activePlayer.declinedRaces.some(d => d.raceId === 'ghouls');
    let phaseLabel = PHASE_LABELS[state.phase];
    if (hasGhoulsInDecline && activePlayer.activeRace &&
        (state.phase === 'readyTroops' || state.phase === 'conquest' ||
         state.phase === 'redeploy' || state.phase === 'reinforcementDie')) {
      const raceName = RACES[activePlayer.activeRace.raceId as keyof typeof RACES]?.name ?? activePlayer.activeRace.raceId;
      phaseLabel = `${raceName}: ${phaseLabel}`;
    }
    this.phaseText.setText(phaseLabel);
    this.turnText.setText(`Turn ${state.turn} / 10`);

    // Update HUD bar
    this.hudBar.update(state);

    // Update player dashboards
    for (let i = 0; i < 2; i++) {
      this.playerDashboards[i]?.update(state, i as 0 | 1, state.activePlayerIndex);
      this.declinedDashboards[i]?.update(state, i as 0 | 1, state.activePlayerIndex);
    }

    // Update action button (hide during selectCombo — combo shop handles input)
    const label = ACTION_BUTTONS[state.phase];
    if (label && state.phase !== 'selectCombo') {
      // Amazons: show required tokens remaining during redeploy
      const mods = getActiveModifiers(activePlayer);
      const amazonTokensNeeded = (state.phase === 'redeploy' && mods.conquestOnlyTokens > 0)
        ? Math.max(0, mods.conquestOnlyTokens - activePlayer.availableTokens)
        : 0;
      if (amazonTokensNeeded > 0) {
        this.actionBtnLabel.setText(`Need ${amazonTokensNeeded} more in hand`);
        this.actionBtnBg.setFillStyle(0x555555);
      } else {
        this.actionBtnLabel.setText(label);
        this.actionBtnBg.setFillStyle(PLAYER_COLORS[0]);
      }
      this.actionButton.setVisible(true);
    } else {
      this.actionButton.setVisible(false);
    }

    // Show decline button during readyTroops or ghoulReadyTroops, turn 2+ only (FR-22, FR-23b)
    // During ghoulReadyTroops: only when active race is already deployed (tokensOnBoard > 0)
    // During optionalDecline (Stout): always available, any turn
    const activeRace = state.players[state.activePlayerIndex].activeRace;
    const canDeclineGhoul = state.phase === 'ghoulReadyTroops' &&
      activeRace !== null && activeRace.tokensOnBoard > 0;
    const canDecline = activeRace !== null && (
      (state.turn >= 2 && (state.phase === 'readyTroops' || canDeclineGhoul)) ||
      state.phase === 'optionalDecline'
    );
    this.declineButton.setVisible(canDecline);

    // Update decline button label: show race name when declining during ghoulReadyTroops
    if (canDeclineGhoul && activeRace) {
      const raceName = RACES[activeRace.raceId as keyof typeof RACES]?.name ?? activeRace.raceId;
      this.declineBtnLabel.setText(`Decline ${raceName}`);
    } else {
      this.declineBtnLabel.setText('Go In Decline');
    }

    // Show Final Conquest button during conquest or ghoulConquest when player has tokens
    const canFinalConquest = (state.phase === 'conquest' || state.phase === 'ghoulConquest') &&
      state.players[state.activePlayerIndex].availableTokens > 0;
    this.finalConquestButton.setVisible(canFinalConquest);

    // Show Dragon button during conquest when Dragon Master power active and dragon not used
    const canDragon = state.phase === 'conquest' &&
      activeRace !== null &&
      activeRace.powerId === 'dragonMaster' &&
      !activeRace.dragonUsedThisTurn &&
      state.players[state.activePlayerIndex].availableTokens >= 1;
    this.dragonButton.setVisible(canDragon);
    // Reset dragon mode if no longer available
    if (!canDragon && this._dragonMode) {
      this._dragonMode = false;
      this.dragonBtnLabel.setText('Use Dragon');
      this.dragonBtnBg.setFillStyle(0x7c2d12);
      this.events.emit('dragonModeChanged', false);
    }

    // Show browse button when not in selectCombo (FR-54)
    this.browseButton.setVisible(
      state.phase !== 'selectCombo' && state.phase !== 'gameOver' && !this.comboShop.browseMode,
    );

    // Show die result during reinforcementDie/ghoulReinforcementDie and redeploy/ghoulRedeploy (FR-20, FR-21)
    if ((state.phase === 'reinforcementDie' || state.phase === 'redeploy' ||
         state.phase === 'ghoulReinforcementDie' || state.phase === 'ghoulRedeploy') && state.reinforcementDie) {
      const r = state.reinforcementDie.result;
      this.dieResultText.setText(`Die: ${r}`);
      this.dieResultText.setColor(r === 0 ? '#ef4444' : '#4ade80');
      this.dieResultText.setVisible(true);
    } else {
      this.dieResultText.setVisible(false);
    }

    // Update combo shop overlay
    this.comboShop.refresh(state);
  }

  // ── Private builders ───────────────────────────────────────────────────────

  /** Top bar: turn track left, phase indicator center. */
  private _drawTopBar(): void {
    const sw = this.scale.width;
    // Background strip
    this.add.rectangle(sw / 2, 20, sw, 40, DARK_BG, 0.9).setDepth(10);

    // Turn track (top-left)
    this.turnText = this.add.text(12, 20, 'Turn 1 / 10', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(11);

    // Phase (top-center)
    this.phaseText = this.add.text(sw / 2, 20, 'Select Race & Power', {
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(11);
  }

  /** New HUD bar across the top (from mockup). */
  private _drawHudBar(): void {
    this.hudBar = new HudBar(this);
  }

  /** Two player dashboard panels (bottom-left and bottom-right). */
  private _drawPlayerDashboards(): void {
    const sw = this.scale.width;
    const sh = this.scale.height;
    // Player 0 — bottom left
    this.playerDashboards[0] = new PlayerDashboard(
      this, 0, 8, sh - 100, 280, 92,
    );
    // Player 1 — bottom right
    this.playerDashboards[1] = new PlayerDashboard(
      this, 1, sw - 288, sh - 100, 280, 92,
    );

    // Declined race boxes (above main boxes, only visible when player has declined races)
    this.declinedDashboards[0] = new DeclinedDashboard(
      this, 0, 8, sh - 196, 280, 88,
    );
    this.declinedDashboards[1] = new DeclinedDashboard(
      this, 1, sw - 288, sh - 196, 280, 88,
    );
  }

  /** Centered action button at bottom-center. */
  private _drawActionButton(): void {
    this.actionBtnBg = this.add.rectangle(0, 0, 150, 32, PLAYER_COLORS[0])
      .setStrokeStyle(1, 0xffffff, 0.3);

    this.actionBtnLabel = this.add.text(0, 0, 'End Conquest', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.actionButton = this.add.container(this.scale.width / 2, this.scale.height - 24, [
      this.actionBtnBg,
      this.actionBtnLabel,
    ]).setDepth(12);

    this.actionBtnBg.setInteractive({ useHandCursor: true });

    this.actionBtnBg.on('pointerover', () => {
      this.actionBtnBg.setFillStyle(0x60a5fa);
    });
    this.actionBtnBg.on('pointerout', () => {
      this.actionBtnBg.setFillStyle(PLAYER_COLORS[0]);
    });
    this.actionBtnBg.on('pointerdown', () => {
      this.events.emit('playerAction', { type: 'endPhase' });
    });

    this.actionButton.setVisible(false);
  }

  /** Decline button (left of action button). */
  private _drawDeclineButton(): void {
    this.declineBtnBg = this.add.rectangle(0, 0, 140, 32, 0x6b21a8)
      .setStrokeStyle(1, 0xffffff, 0.3);

    this.declineBtnLabel = this.add.text(0, 0, 'Go In Decline', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.declineButton = this.add.container(this.scale.width / 2 - 160, this.scale.height - 24, [
      this.declineBtnBg,
      this.declineBtnLabel,
    ]).setDepth(12);

    this.declineBtnBg.setInteractive({ useHandCursor: true });

    this.declineBtnBg.on('pointerover', () => {
      this.declineBtnBg.setFillStyle(0x7c3aed);
    });
    this.declineBtnBg.on('pointerout', () => {
      this.declineBtnBg.setFillStyle(0x6b21a8);
    });
    this.declineBtnBg.on('pointerdown', () => {
      this.events.emit('playerAction', { type: 'decline' });
    });

    this.declineButton.setVisible(false);
  }

  /** Final Conquest button (right of action button). */
  private _drawFinalConquestButton(): void {
    this.finalConquestBtnBg = this.add.rectangle(0, 0, 150, 32, 0x15803d)
      .setStrokeStyle(1, 0xffffff, 0.3);

    const finalConquestLabel = this.add.text(0, 0, 'Final Conquest', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.finalConquestButton = this.add.container(this.scale.width / 2 + 160, this.scale.height - 24, [
      this.finalConquestBtnBg,
      finalConquestLabel,
    ]).setDepth(12);

    this.finalConquestBtnBg.setInteractive({ useHandCursor: true });

    this.finalConquestBtnBg.on('pointerover', () => {
      this.finalConquestBtnBg.setFillStyle(0x16a34a);
    });
    this.finalConquestBtnBg.on('pointerout', () => {
      this.finalConquestBtnBg.setFillStyle(0x15803d);
    });
    this.finalConquestBtnBg.on('pointerdown', () => {
      this.events.emit('playerAction', { type: 'startFinalConquest' });
    });

    this.finalConquestButton.setVisible(false);

    // Dragon Master toggle button
    this.dragonBtnBg = this.add.rectangle(0, 0, 160, 32, 0x7c2d12)
      .setStrokeStyle(1, 0xffffff, 0.3);

    this.dragonBtnLabel = this.add.text(0, 0, 'Use Dragon', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.dragonButton = this.add.container(this.scale.width / 2 + 160, this.scale.height - 58, [
      this.dragonBtnBg, this.dragonBtnLabel,
    ]).setDepth(12);

    this.dragonBtnBg.setInteractive({ useHandCursor: true });
    this.dragonBtnBg.on('pointerover', () => {
      this.dragonBtnBg.setFillStyle(this._dragonMode ? 0xb91c1c : 0x9a3412);
    });
    this.dragonBtnBg.on('pointerout', () => {
      this.dragonBtnBg.setFillStyle(this._dragonMode ? 0xdc2626 : 0x7c2d12);
    });
    this.dragonBtnBg.on('pointerdown', () => {
      this._dragonMode = !this._dragonMode;
      this.dragonBtnLabel.setText(this._dragonMode ? 'Cancel Dragon' : 'Use Dragon');
      this.dragonBtnBg.setFillStyle(this._dragonMode ? 0xdc2626 : 0x7c2d12);
      this.events.emit('dragonModeChanged', this._dragonMode);
    });
    this.dragonButton.setVisible(false);
  }

  /** Whether pan-only mode is active (FR-60). */
  get panMode(): boolean { return this._panMode; }

  /** Interaction / Pan mode toggle button (FR-60). */
  private _drawModeToggle(): void {
    this.modeToggleBg = this.add.rectangle(0, 0, 80, 24, 0x1e3a5f)
      .setStrokeStyle(1, 0x4a8ab5, 0.6);

    this.modeToggleLabel = this.add.text(0, 0, 'Pan', {
      fontSize: '11px', fontFamily: 'Arial', color: '#93c5fd',
    }).setOrigin(0.5, 0.5);

    this.add.container(this.scale.width - 200, 20, [
      this.modeToggleBg, this.modeToggleLabel,
    ]).setDepth(12);

    this.modeToggleBg.setInteractive({ useHandCursor: true });
    this.modeToggleBg.on('pointerover', () => this.modeToggleBg.setFillStyle(0x2a4a7f));
    this.modeToggleBg.on('pointerout', () =>
      this.modeToggleBg.setFillStyle(this._panMode ? 0x4a3520 : 0x1e3a5f));
    this.modeToggleBg.on('pointerdown', () => {
      this._panMode = !this._panMode;
      this.modeToggleLabel.setText(this._panMode ? 'Interact' : 'Pan');
      this.modeToggleBg.setFillStyle(this._panMode ? 0x4a3520 : 0x1e3a5f);
      this.events.emit('panModeChanged', this._panMode);
    });
  }

  /** Die result indicator (shown during reinforcementDie phase). */
  private _drawDieResult(): void {
    this.dieResultText = this.add.text(this.scale.width / 2 + 130, this.scale.height - 24, '', {
      fontSize: '16px',
      fontFamily: 'Georgia, serif',
      fontStyle: 'bold',
      color: '#4ade80',
    }).setOrigin(0.5, 0.5).setDepth(12).setVisible(false);
  }

  /** Browse combos button (top-right corner). */
  private _drawBrowseButton(): void {
    this.browseBtnBg = this.add.rectangle(0, 0, 120, 28, 0x1e3a5f)
      .setStrokeStyle(1, 0x4a8ab5, 0.6);

    const browseBtnLabel = this.add.text(0, 0, 'Browse Combos', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#93c5fd',
    }).setOrigin(0.5, 0.5);

    this.browseButton = this.add.container(this.scale.width - 80, 20, [
      this.browseBtnBg,
      browseBtnLabel,
    ]).setDepth(12);

    this.browseBtnBg.setInteractive({ useHandCursor: true });

    this.browseBtnBg.on('pointerover', () => this.browseBtnBg.setFillStyle(0x2a4a7f));
    this.browseBtnBg.on('pointerout', () => this.browseBtnBg.setFillStyle(0x1e3a5f));
    this.browseBtnBg.on('pointerdown', () => {
      this.comboShop.setBrowseMode(true);
      this.browseButton.setVisible(false);
      this.events.emit('browseComboOpen');
    });

    this.browseButton.setVisible(false);
  }
}

// ── PlayerDashboard helper class ───────────────────────────────────────────────

class PlayerDashboard {
  private readonly scene: Phaser.Scene;
  private readonly playerIndex: 0 | 1;
  private raceText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private tokensText!: Phaser.GameObjects.Text;
  private stashText!: Phaser.GameObjects.Text;
  private coinsText!: Phaser.GameObjects.Text;
  private activeBorder!: Phaser.GameObjects.Rectangle;
  private tooltipContainer!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Rectangle;
  private tooltipRaceText!: Phaser.GameObjects.Text;
  private tooltipPowerText!: Phaser.GameObjects.Text;
  private _currentRaceId: string | null = null;
  private _currentPowerId: string | null = null;

  constructor(
    scene: Phaser.Scene,
    playerIndex: 0 | 1,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    this.scene = scene;
    this.playerIndex = playerIndex;
    this._build(x, y, w, h);
    this._buildTooltip(x, y, w);
  }

  private _build(x: number, y: number, w: number, h: number): void {
    const color = PLAYER_COLORS[this.playerIndex];
    const hexColor = PLAYER_HEX[this.playerIndex];

    const panelBg = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, PANEL_BG, 0.88)
      .setStrokeStyle(2, color, 0.5)
      .setDepth(10)
      .setInteractive();

    // FR-61: hover tooltip
    panelBg.on('pointerover', () => this._showTooltip());
    panelBg.on('pointerout', () => this.tooltipContainer.setVisible(false));

    this.activeBorder = this.scene.add.rectangle(x + w / 2, y + h / 2, w + 4, h + 4)
      .setStrokeStyle(3, ACTIVE_TINT)
      .setFillStyle(0, 0)
      .setDepth(10)
      .setVisible(false);

    this.scene.add.text(x + 8, y + 8, `Player ${this.playerIndex + 1}`, {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: hexColor,
      fontStyle: 'bold',
    }).setDepth(11);

    this.raceText = this.scene.add.text(x + 8, y + 26, '—', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: TEXT_COLOR,
    }).setDepth(11);

    this.powerText = this.scene.add.text(x + 8, y + 42, '—', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: DIM_COLOR,
    }).setDepth(11);

    this.tokensText = this.scene.add.text(x + 8, y + 58, 'Tokens: —', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: TEXT_COLOR,
    }).setDepth(11);

    this.stashText = this.scene.add.text(x + 8, y + 72, '', {
      fontSize: '10px',
      fontFamily: 'Arial',
      color: '#a78bfa',
    }).setDepth(11).setVisible(false);

    this.coinsText = this.scene.add.text(x + 8, y + 72, 'Coins: —', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setDepth(11);
  }

  private _buildTooltip(x: number, y: number, w: number): void {
    this.tooltipBg = this.scene.add.rectangle(0, 0, w, 60, 0x0a0a18, 0.95)
      .setStrokeStyle(1, 0x5a5a8a, 0.8)
      .setOrigin(0, 1);

    this.tooltipRaceText = this.scene.add.text(8, -52, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#e8d5b7',
      wordWrap: { width: w - 20 },
    }).setOrigin(0, 0);

    this.tooltipPowerText = this.scene.add.text(8, -28, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#93c5fd',
      wordWrap: { width: w - 20 },
    }).setOrigin(0, 0);

    this.tooltipContainer = this.scene.add.container(x, y, [
      this.tooltipBg, this.tooltipRaceText, this.tooltipPowerText,
    ]).setDepth(20).setVisible(false);
  }

  private _showTooltip(): void {
    if (!this._currentRaceId || !this._currentPowerId) return;

    const race = RACES[this._currentRaceId as keyof typeof RACES];
    const power = POWERS[this._currentPowerId as keyof typeof POWERS];
    if (!race || !power) return;

    this.tooltipRaceText.setText(`${race.name}: ${race.tooltip}`);
    this.tooltipPowerText.setText(`${power.name}: ${power.tooltip}`);

    // Size tooltip to content
    const raceH = this.tooltipRaceText.height;
    this.tooltipPowerText.setY(-(52 - 8 - raceH));
    const totalH = 16 + raceH + this.tooltipPowerText.height;
    this.tooltipBg.setSize(this.tooltipBg.width, totalH);
    this.tooltipRaceText.setY(-totalH + 8);
    this.tooltipPowerText.setY(-totalH + 12 + raceH);

    this.tooltipContainer.setVisible(true);
  }

  update(state: GameState, playerIndex: 0 | 1, activeIndex: 0 | 1): void {
    const player = state.players[playerIndex];
    const isActive = playerIndex === activeIndex;

    // During Ghoul phases the In Decline box gets the gold highlight instead
    const isGhoulPhaseActive = isActive && (
      state.phase === 'ghoulReadyTroops' || state.phase === 'ghoulConquest' ||
      state.phase === 'ghoulRedeploy' || state.phase === 'ghoulReinforcementDie'
    );
    this.activeBorder.setVisible(isActive && !isGhoulPhaseActive);

    const race = player.activeRace;
    this._currentRaceId = race?.raceId ?? null;
    this._currentPowerId = race?.powerId ?? null;

    if (race) {
      const raceDef = RACES[race.raceId as keyof typeof RACES];
      const powerDef = POWERS[race.powerId as keyof typeof POWERS];
      this.raceText.setText(raceDef?.name ?? race.raceId);
      this.powerText.setText(powerDef?.name ?? race.powerId);
    } else {
      this.raceText.setText('—');
      this.powerText.setText('—');
    }

    // Token display — during ghoul phases, show stashed active race tokens
    const isGhoulPhase = state.phase === 'ghoulReadyTroops' || state.phase === 'ghoulConquest' ||
      state.phase === 'ghoulRedeploy' || state.phase === 'ghoulReinforcementDie';
    if (isGhoulPhase && isActive && race) {
      const stashed = player.ghoulSavedTokens ?? 0;
      this.tokensText.setText(`Tokens: ${stashed} / ${race.totalTokens} (stashed)`);
    } else {
      this.tokensText.setText(`Tokens: ${player.availableTokens} / ${race?.totalTokens ?? '—'}`);
    }
    // Special token stash display
    let stashLabel = '';
    if (race) {
      if (race.powerId === 'fortified') {
        const placed = race.fortressesPlaced ?? 0;
        const lost = race.fortressesLost ?? 0;
        const remaining = 6 - placed - lost;
        stashLabel = `Fortresses: ${remaining}/6`;
      } else if (race.powerId === 'bivouacking') {
        const onBoard = state.board.regions
          .filter(r => r.owner === playerIndex && !r.isDeclined)
          .reduce((sum, r) => sum + r.encampmentCount, 0);
        stashLabel = `Encampments: ${5 - onBoard}/5 in hand`;
      } else if (race.raceId === 'trolls') {
        const lairs = race.trollLairsOnBoard ?? 0;
        stashLabel = `Lairs: ${lairs}`;
      } else if (race.powerId === 'dragonMaster') {
        stashLabel = race.dragonUsedThisTurn ? 'Dragon: Used' : 'Dragon: Available';
      }
    }
    if (stashLabel) {
      this.stashText.setText(stashLabel);
      this.stashText.setVisible(true);
      this.coinsText.setY(this.stashText.y + 14);
    } else {
      this.stashText.setVisible(false);
      this.coinsText.setY(this.stashText.y);
    }

    this.coinsText.setText(`Coins: ${player.coins}`);
  }
}

// ── HudBar helper class ─────────────────────────────────────────────────────────
//
// Implements the new top HUD bar from the mockup: a 1280×48 image-backed bar with
// player sections on each side and a center section showing title + turn/phase.
//
// Each player section shows:
//   - Player label + coin icon + coin count
//   - Active race: race token icon + count, power token icon + count, region icon + count
//   - Declined race: declined token icon + count, region icon + count

const HUD_BAR_H = 48;
const HUD_ICON_SIZE = 28;
const HUD_DEPTH = 15;    // Above the old top bar
const HUD_TEXT_DEPTH = 16;
const HUD_TOOLTIP_DEPTH = 25;
// All HUD text uses TEXT_COLOR to match the "Small World" logo

/** Single icon + count pair in the HUD bar. */
class HudStatPair {
  readonly icon: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene, x: number, y: number, textureKey: string, depth: number) {
    this.icon = scene.add.image(x, y, textureKey)
      .setDisplaySize(HUD_ICON_SIZE, HUD_ICON_SIZE)
      .setDepth(depth);
    this.label = scene.add.text(x + HUD_ICON_SIZE / 2 + 4, y, '0', {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(depth);
  }

  setCount(n: number): void {
    this.label.setText(String(n));
  }

  setTexture(key: string): void {
    this.icon.setTexture(key);
  }

  setVisible(v: boolean): void {
    this.icon.setVisible(v);
    this.label.setVisible(v);
  }

  /** Returns the right edge x of the label text for layout chaining. */
  get rightX(): number {
    return this.label.x + this.label.width;
  }
}

/** One player's section in the HUD bar. */
class HudPlayerSection {
  private readonly playerIndex: 0 | 1;
  // Coins
  private coinCount!: Phaser.GameObjects.Text;
  // Active race group
  private activeLabel!: Phaser.GameObjects.Text;
  private activeRaceTokens!: HudStatPair;
  private activePowerTokens!: HudStatPair;
  private activeRegions!: HudStatPair;
  // Decline group
  private declineGroupLabel!: Phaser.GameObjects.Text;
  private declineTokens!: HudStatPair;
  private declineRegions!: HudStatPair;
  // Separator (between active and decline)
  private sep2!: Phaser.GameObjects.Rectangle;
  // Turn indicator
  private turnIndicator!: Phaser.GameObjects.Rectangle;
  // Active race tooltip
  private activeTooltip!: Phaser.GameObjects.Container;
  private activeTooltipBg!: Phaser.GameObjects.Rectangle;
  private activeTooltipRaceText!: Phaser.GameObjects.Text;
  private activeTooltipPowerText!: Phaser.GameObjects.Text;
  private _activeRaceId: string | null = null;
  private _activePowerId: string | null = null;
  // Decline tooltip
  private declineTooltip!: Phaser.GameObjects.Container;
  private declineTooltipBg!: Phaser.GameObjects.Rectangle;
  private declineTooltipRaceText!: Phaser.GameObjects.Text;
  private declineTooltipPowerText!: Phaser.GameObjects.Text;
  private _declineRaceId: string | null = null;

  constructor(scene: Phaser.Scene, playerIndex: 0 | 1, baseX: number) {
    this.playerIndex = playerIndex;
    this._build(scene, baseX);
  }

  private _build(scene: Phaser.Scene, baseX: number): void {
    const cy = HUD_BAR_H / 2;
    let x = baseX;

    // Accent bar (left edge)
    scene.add.rectangle(x, cy, 3, 24, PLAYER_COLORS[this.playerIndex])
      .setOrigin(0, 0.5).setDepth(HUD_TEXT_DEPTH);
    x += 9;

    // Player label
    const pLabel = scene.add.text(x, cy, `P${this.playerIndex + 1}`, {
      fontSize: '14px', fontFamily: 'Arial', fontStyle: 'bold', color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(HUD_TEXT_DEPTH);

    // Turn indicator — gold underline beneath P label
    this.turnIndicator = scene.add.rectangle(
      x + pLabel.width / 2, cy + 13, pLabel.width + 6, 3, 0xfbbf24,
    ).setDepth(HUD_TEXT_DEPTH).setVisible(false);
    x += 28;

    // Coin icon + count
    scene.add.image(x + HUD_ICON_SIZE / 2, cy, 'hud-coin')
      .setDisplaySize(HUD_ICON_SIZE, HUD_ICON_SIZE)
      .setDepth(HUD_TEXT_DEPTH);
    x += HUD_ICON_SIZE + 4;
    this.coinCount = scene.add.text(x, cy, '0', {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(HUD_TEXT_DEPTH);
    x += 26;

    // Separator 1
    scene.add.rectangle(x, cy, 2, 24, 0x2a2a3e)
      .setDepth(HUD_TEXT_DEPTH);
    x += 10;

    // "Active" horizontal label
    this.activeLabel = scene.add.text(x, cy, 'Active', {
      fontSize: '14px', fontFamily: 'Arial', fontStyle: 'bold', color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(HUD_TEXT_DEPTH);
    x += 42;

    // Active race token + count (interactive for tooltip)
    this.activeRaceTokens = new HudStatPair(scene, x + HUD_ICON_SIZE / 2, cy, 'hud-race-amazons', HUD_TEXT_DEPTH);
    this.activeRaceTokens.icon.setInteractive({ useHandCursor: true });
    this.activeRaceTokens.icon.on('pointerover', () => this._showActiveTooltip());
    this.activeRaceTokens.icon.on('pointerout', () => this.activeTooltip.setVisible(false));
    x += HUD_ICON_SIZE + 16;

    // Active power token + count
    this.activePowerTokens = new HudStatPair(scene, x + HUD_ICON_SIZE / 2, cy, 'token-encampment', HUD_TEXT_DEPTH);
    x += HUD_ICON_SIZE + 16;

    // Active regions count
    this.activeRegions = new HudStatPair(scene, x + HUD_ICON_SIZE / 2, cy, 'hud-occupied-region', HUD_TEXT_DEPTH);
    x += HUD_ICON_SIZE + 16;

    // Separator 2
    this.sep2 = scene.add.rectangle(x, cy, 2, 24, 0x2a2a3e)
      .setDepth(HUD_TEXT_DEPTH);
    x += 10;

    // "Decline" horizontal label
    this.declineGroupLabel = scene.add.text(x, cy, 'Decline', {
      fontSize: '14px', fontFamily: 'Arial', fontStyle: 'bold', color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(HUD_TEXT_DEPTH);
    x += 48;

    // Declined race token + count (interactive for tooltip)
    this.declineTokens = new HudStatPair(scene, x + HUD_ICON_SIZE / 2, cy, 'token-amazons-d', HUD_TEXT_DEPTH);
    this.declineTokens.icon.setInteractive({ useHandCursor: true });
    this.declineTokens.icon.on('pointerover', () => this._showDeclineTooltip());
    this.declineTokens.icon.on('pointerout', () => this.declineTooltip.setVisible(false));
    x += HUD_ICON_SIZE + 16;

    // Declined regions count
    this.declineRegions = new HudStatPair(scene, x + HUD_ICON_SIZE / 2, cy, 'hud-occupied-region', HUD_TEXT_DEPTH);

    // Build tooltips
    this._buildTooltips(scene);
  }

  private _buildTooltips(scene: Phaser.Scene): void {
    const tooltipW = 260;
    const sw = scene.scale.width;

    // Active race tooltip
    const activeIconX = this.activeRaceTokens.icon.x;
    const activeX = Math.max(4, Math.min(sw - tooltipW - 4, activeIconX - tooltipW / 2));
    this.activeTooltipBg = scene.add.rectangle(0, 0, tooltipW, 60, 0x0a0a18, 0.95)
      .setStrokeStyle(1, 0x5a5a8a, 0.8).setOrigin(0, 0);
    this.activeTooltipRaceText = scene.add.text(8, 6, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#e8d5b7',
      wordWrap: { width: tooltipW - 20 },
    }).setOrigin(0, 0);
    this.activeTooltipPowerText = scene.add.text(8, 24, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#93c5fd',
      wordWrap: { width: tooltipW - 20 },
    }).setOrigin(0, 0);
    this.activeTooltip = scene.add.container(activeX, HUD_BAR_H + 4, [
      this.activeTooltipBg, this.activeTooltipRaceText, this.activeTooltipPowerText,
    ]).setDepth(HUD_TOOLTIP_DEPTH).setVisible(false);

    // Decline tooltip
    const dIconX = this.declineTokens.icon.x;
    const declineX = Math.max(4, Math.min(sw - tooltipW - 4, dIconX - tooltipW / 2));
    this.declineTooltipBg = scene.add.rectangle(0, 0, tooltipW, 60, 0x0a0a18, 0.95)
      .setStrokeStyle(1, 0x5a5a8a, 0.8).setOrigin(0, 0);
    this.declineTooltipRaceText = scene.add.text(8, 6, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#9ca3af',
      wordWrap: { width: tooltipW - 20 },
    }).setOrigin(0, 0);
    this.declineTooltipPowerText = scene.add.text(8, 24, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#7a9ac5',
      wordWrap: { width: tooltipW - 20 },
    }).setOrigin(0, 0);
    this.declineTooltip = scene.add.container(declineX, HUD_BAR_H + 4, [
      this.declineTooltipBg, this.declineTooltipRaceText, this.declineTooltipPowerText,
    ]).setDepth(HUD_TOOLTIP_DEPTH).setVisible(false);
  }

  private _showActiveTooltip(): void {
    if (!this._activeRaceId || !this._activePowerId) return;
    const race = RACES[this._activeRaceId as keyof typeof RACES];
    const power = POWERS[this._activePowerId as keyof typeof POWERS];
    if (!race || !power) return;

    this.activeTooltipRaceText.setText(`${race.name}: ${race.tooltip}`);
    this.activeTooltipPowerText.setText(`${power.name}: ${power.tooltip}`);

    const raceH = this.activeTooltipRaceText.height;
    this.activeTooltipPowerText.setY(8 + raceH);
    const totalH = 14 + raceH + this.activeTooltipPowerText.height;
    this.activeTooltipBg.setSize(this.activeTooltipBg.width, totalH);

    this.activeTooltip.setVisible(true);
  }

  private _showDeclineTooltip(): void {
    if (!this._declineRaceId) return;
    const race = RACES[this._declineRaceId as keyof typeof RACES];
    if (!race) return;

    // Only show race info — special power is lost when in decline
    this.declineTooltipRaceText.setText(`${race.name}: ${race.tooltip}`);
    this.declineTooltipPowerText.setVisible(false);
    const totalH = 14 + this.declineTooltipRaceText.height;
    this.declineTooltipBg.setSize(this.declineTooltipBg.width, totalH);

    this.declineTooltip.setVisible(true);
  }

  update(state: GameState): void {
    const player = state.players[this.playerIndex];

    // Turn indicator
    this.turnIndicator.setVisible(state.activePlayerIndex === this.playerIndex);

    // Coins
    this.coinCount.setText(String(player.coins));

    // Active race section
    const active = player.activeRace;
    if (active) {
      this._activeRaceId = active.raceId;
      this._activePowerId = active.powerId;
      this.activeRaceTokens.setTexture(`hud-race-${active.raceId}`);
      this.activeRaceTokens.setCount(active.totalTokens);
      this.activeRaceTokens.setVisible(true);
      this.activeLabel.setVisible(true);

      // Power token icon — show the power-specific token if applicable
      const powerTokenKey = this._getPowerTokenKey(active.powerId);
      if (powerTokenKey) {
        this.activePowerTokens.setTexture(powerTokenKey);
        this.activePowerTokens.setCount(this._getPowerTokenCount(state, active));
        this.activePowerTokens.setVisible(true);
      } else {
        this.activePowerTokens.setVisible(false);
      }

      // Regions occupied by active race
      const activeRegions = state.board.regions.filter(
        r => r.owner === this.playerIndex && !r.isDeclined,
      ).length;
      this.activeRegions.setCount(activeRegions);
      this.activeRegions.setVisible(true);
    } else {
      this._activeRaceId = null;
      this._activePowerId = null;
      this.activeRaceTokens.setVisible(false);
      this.activePowerTokens.setVisible(false);
      this.activeRegions.setVisible(false);
      this.activeLabel.setVisible(false);
    }

    // Declined race section
    if (player.declinedRaces.length > 0) {
      const declined = player.declinedRaces[0]; // Most recent
      this._declineRaceId = declined.raceId;
      this.declineTokens.setTexture(`token-${declined.raceId}-d`);
      const declinedBoardTokens = state.board.regions
        .filter(r => r.owner === this.playerIndex && r.isDeclined)
        .reduce((sum, r) => sum + r.tokens, 0);
      this.declineTokens.setCount(declinedBoardTokens);
      this.declineTokens.setVisible(true);

      const declinedRegions = state.board.regions.filter(
        r => r.owner === this.playerIndex && r.isDeclined,
      ).length;
      this.declineRegions.setCount(declinedRegions);
      this.declineRegions.setVisible(true);

      this.declineGroupLabel.setVisible(true);
      this.sep2.setVisible(true);
    } else {
      this._declineRaceId = null;
      this.declineTokens.setVisible(false);
      this.declineRegions.setVisible(false);
      this.declineGroupLabel.setVisible(false);
      this.sep2.setVisible(false);
    }
  }

  private _getPowerTokenKey(powerId: string): string | null {
    switch (powerId) {
      case 'bivouacking':  return 'token-encampment';
      case 'fortified':    return 'token-fortress';
      case 'heroic':       return 'token-hero';
      case 'dragonMaster': return 'token-dragon';
      default:             return null;
    }
  }

  private _getPowerTokenCount(state: GameState, active: { powerId: string; raceId: string; fortressesPlaced?: number; fortressesLost?: number; trollLairsOnBoard?: number; dragonUsedThisTurn?: boolean }): number {
    switch (active.powerId) {
      case 'bivouacking': {
        return state.board.regions
          .filter(r => r.owner === this.playerIndex && !r.isDeclined)
          .reduce((sum, r) => sum + r.encampmentCount, 0);
      }
      case 'fortified': {
        const placed = active.fortressesPlaced ?? 0;
        const lost = active.fortressesLost ?? 0;
        return 6 - placed - lost;
      }
      case 'heroic': {
        return state.board.regions
          .filter(r => r.owner === this.playerIndex && !r.isDeclined && r.hasHero)
          .length;
      }
      case 'dragonMaster':
        return active.dragonUsedThisTurn ? 0 : 1;
      default:
        return 0;
    }
  }
}

class HudBar {
  private readonly p1Section: HudPlayerSection;
  private readonly p2Section: HudPlayerSection;
  private readonly subtitleText: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    const sw = scene.scale.width;

    // HUD background image — crop to avoid aspect ratio distortion
    const bgImg = scene.add.image(0, 0, 'hud-background').setOrigin(0, 0);
    const bgScale = sw / bgImg.width;
    bgImg.setScale(bgScale);
    bgImg.setCrop(0, 0, bgImg.width, Math.ceil(HUD_BAR_H / bgScale));
    bgImg.setDepth(HUD_DEPTH);

    // Subtle border at the bottom of the HUD bar
    scene.add.rectangle(sw / 2, HUD_BAR_H, sw, 1, 0x2a2a3e)
      .setDepth(HUD_DEPTH);

    // Player sections
    this.p1Section = new HudPlayerSection(scene, 0, 8);
    this.p2Section = new HudPlayerSection(scene, 1, sw - 440);

    // Center section — title and turn/phase side by side
    const cx = sw / 2;
    scene.add.text(cx - 6, HUD_BAR_H / 2, 'Small World', {
      fontSize: '22px', fontFamily: 'Arial', fontStyle: 'bold', color: TEXT_COLOR,
    }).setOrigin(1, 0.5).setDepth(HUD_TEXT_DEPTH);

    scene.add.text(cx, HUD_BAR_H / 2, '·', {
      fontSize: '22px', fontFamily: 'Arial', color: TEXT_COLOR,
    }).setOrigin(0.5, 0.5).setDepth(HUD_TEXT_DEPTH);

    this.subtitleText = scene.add.text(cx + 6, HUD_BAR_H / 2, 'Turn 1 / 10 · Select Race & Power', {
      fontSize: '16px', fontFamily: 'Arial', fontStyle: 'bold', color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(HUD_TEXT_DEPTH);
  }

  update(state: GameState): void {
    // Center section
    const activePlayer = state.players[state.activePlayerIndex];
    const hasGhoulsInDecline = activePlayer.declinedRaces.some(d => d.raceId === 'ghouls');
    let phaseLabel = PHASE_LABELS[state.phase];
    if (hasGhoulsInDecline && activePlayer.activeRace &&
        (state.phase === 'readyTroops' || state.phase === 'conquest' ||
         state.phase === 'redeploy' || state.phase === 'reinforcementDie')) {
      const raceName = RACES[activePlayer.activeRace.raceId as keyof typeof RACES]?.name ?? activePlayer.activeRace.raceId;
      phaseLabel = `${raceName}: ${phaseLabel}`;
    }
    this.subtitleText.setText(`Turn ${state.turn} / 10 · ${phaseLabel}`);

    // Player sections
    this.p1Section.update(state);
    this.p2Section.update(state);
  }
}

// ── DeclinedDashboard helper class ──────────────────────────────────────────────

class DeclinedDashboard {
  private readonly scene: Phaser.Scene;
  private readonly playerIndex: 0 | 1;
  private panelBg!: Phaser.GameObjects.Rectangle;
  private activeBorder!: Phaser.GameObjects.Rectangle;
  private headerText!: Phaser.GameObjects.Text;
  private raceText!: Phaser.GameObjects.Text;
  private powerText!: Phaser.GameObjects.Text;
  private boardTokensText!: Phaser.GameObjects.Text;
  private inHandText!: Phaser.GameObjects.Text;
  private allObjects: Phaser.GameObjects.GameObject[] = [];

  constructor(
    scene: Phaser.Scene,
    playerIndex: 0 | 1,
    x: number,
    y: number,
    w: number,
    h: number,
  ) {
    this.scene = scene;
    this.playerIndex = playerIndex;
    this._build(x, y, w, h);
  }

  private _build(x: number, y: number, w: number, h: number): void {
    const color = PLAYER_COLORS[this.playerIndex];

    this.panelBg = this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, PANEL_BG, 0.75)
      .setStrokeStyle(1, color, 0.3)
      .setDepth(10);

    this.activeBorder = this.scene.add.rectangle(x + w / 2, y + h / 2, w + 4, h + 4)
      .setStrokeStyle(3, ACTIVE_TINT)
      .setFillStyle(0, 0)
      .setDepth(10)
      .setVisible(false);

    this.headerText = this.scene.add.text(x + 8, y + 6, 'In Decline', {
      fontSize: '10px', fontFamily: 'Arial', color: '#6b7280', fontStyle: 'bold',
    }).setDepth(11);

    this.raceText = this.scene.add.text(x + 8, y + 22, '', {
      fontSize: '12px', fontFamily: 'Arial', color: '#9ca3af',
    }).setDepth(11);

    this.powerText = this.scene.add.text(x + 8, y + 38, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#777',
    }).setDepth(11);

    this.boardTokensText = this.scene.add.text(x + 8, y + 54, '', {
      fontSize: '11px', fontFamily: 'Arial', color: TEXT_COLOR,
    }).setDepth(11);

    this.inHandText = this.scene.add.text(x + 8, y + 70, '', {
      fontSize: '11px', fontFamily: 'Arial', color: '#fbbf24',
    }).setDepth(11);

    this.allObjects = [
      this.panelBg, this.activeBorder, this.headerText, this.raceText,
      this.powerText, this.boardTokensText, this.inHandText,
    ];

    this._setVisible(false);
  }

  private _setVisible(visible: boolean): void {
    for (const obj of this.allObjects) {
      (obj as unknown as Phaser.GameObjects.Components.Visible).setVisible(visible);
    }
  }

  update(state: GameState, playerIndex: 0 | 1, activeIndex: 0 | 1): void {
    const player = state.players[playerIndex];

    if (player.declinedRaces.length === 0) {
      this._setVisible(false);
      return;
    }

    this._setVisible(true);

    const declined = player.declinedRaces[0]; // Most recent declined race
    const raceName = RACES[declined.raceId as keyof typeof RACES]?.name ?? declined.raceId;
    const powerName = POWERS[declined.powerId as keyof typeof POWERS]?.name ?? declined.powerId;

    this.raceText.setText(raceName);
    this.powerText.setText(powerName);

    const boardTokens = state.board.regions
      .filter(r => r.owner === playerIndex && r.isDeclined)
      .reduce((sum, r) => sum + r.tokens, 0);
    this.boardTokensText.setText(`Tokens on Board: ${boardTokens}`);

    // Show "In Hand" during ghoul phases for the active player,
    // or whenever there are reserve tokens (conquered Ghoul survivors)
    const isGhoulPhase = state.phase === 'ghoulReadyTroops' || state.phase === 'ghoulConquest' ||
      state.phase === 'ghoulRedeploy' || state.phase === 'ghoulReinforcementDie';
    const isActiveGhoulPhase = isGhoulPhase && playerIndex === activeIndex;
    const reserve = player.ghoulTokensInReserve ?? 0;
    if (isActiveGhoulPhase) {
      this.inHandText.setText(`In Hand: ${player.availableTokens}`);
      this.inHandText.setVisible(true);
    } else if (reserve > 0) {
      this.inHandText.setText(`In Hand: ${reserve}`);
      this.inHandText.setVisible(true);
    } else {
      this.inHandText.setVisible(false);
    }

    // Highlight In Decline box (instead of active race box) during Ghoul phases
    this.activeBorder.setVisible(isActiveGhoulPhase);
  }
}
