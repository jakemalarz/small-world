import Phaser from 'phaser';
import type { GameState, TurnPhase } from '@/game/state/types';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';
import { ComboShopRenderer } from '@/game/presentation/ComboShopRenderer';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAYER_COLORS: [number, number] = [0x3b82f6, 0xef4444]; // blue, red
const PLAYER_HEX:   [string, string] = ['#3b82f6', '#ef4444'];
const ACTIVE_TINT = 0xfbbf24; // gold highlight for active player
const DARK_BG     = 0x0f0f1a;
const PANEL_BG    = 0x1e1e2e;
const TEXT_COLOR  = '#e8d5b7';
const DIM_COLOR   = '#888888';
const W = 1280;
const H = 720;

const PHASE_LABELS: Record<TurnPhase, string> = {
  selectCombo:      'Select Race & Power',
  ghoulConquest:    'Ghouls Advance',
  readyTroops:      'Ready Troops',
  conquest:         'Conquest',
  reinforcementDie: 'Reinforcement Die — Pick Target',
  redeploy:         'Redeploy',
  score:            'Scoring',
  optionalDecline:  'Optional Decline',
  decline:          'In Decline',
  gameOver:         'Game Over',
};

const ACTION_BUTTONS: Partial<Record<TurnPhase, string>> = {
  readyTroops:      'Begin Conquest →',
  conquest:         'End Conquest',
  reinforcementDie: 'Skip (End Conquest)',
  redeploy:         'Confirm Redeploy',
  score:            'End Turn',
  optionalDecline:  'Skip Decline',
  decline:          'Go In Decline',
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
  private playerDashboards: PlayerDashboard[] = [];
  private actionButton!: Phaser.GameObjects.Container;
  private actionBtnBg!: Phaser.GameObjects.Rectangle;
  private actionBtnLabel!: Phaser.GameObjects.Text;
  private declineButton!: Phaser.GameObjects.Container;
  private declineBtnBg!: Phaser.GameObjects.Rectangle;
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
    this._drawPlayerDashboards();
    this._drawActionButton();
    this._drawDeclineButton();
    this._drawBrowseButton();
    this._drawDieResult();
    this._drawModeToggle();
    this.comboShop = new ComboShopRenderer(this);
  }

  // ── Public API (called by GameController) ──────────────────────────────────

  /** Refresh all HUD elements to reflect the given game state. */
  refresh(state: GameState): void {
    this.phaseText.setText(PHASE_LABELS[state.phase]);
    this.turnText.setText(`Turn ${state.turn} / 10`);

    // Update player dashboards
    for (let i = 0; i < 2; i++) {
      this.playerDashboards[i]?.update(state, i as 0 | 1, state.activePlayerIndex);
    }

    // Update action button (hide during selectCombo — combo shop handles input)
    let label = ACTION_BUTTONS[state.phase];
    // FR-19: During conquest, show "Roll Die →" when die will trigger on end
    if (state.phase === 'conquest' && label) {
      const player = state.players[state.activePlayerIndex];
      if (player.availableTokens > 0) {
        label = 'Roll Die →';
      }
    }
    if (label && state.phase !== 'selectCombo') {
      this.actionBtnLabel.setText(label);
      this.actionButton.setVisible(true);
    } else {
      this.actionButton.setVisible(false);
    }

    // Show decline button during readyTroops and conquest phases, turn 2+ only (FR-22)
    const canDecline = state.turn >= 2 &&
      (state.phase === 'readyTroops' || state.phase === 'conquest') &&
      state.players[state.activePlayerIndex].activeRace !== null;
    this.declineButton.setVisible(canDecline);

    // Show browse button when not in selectCombo (FR-54)
    this.browseButton.setVisible(
      state.phase !== 'selectCombo' && state.phase !== 'gameOver' && !this.comboShop.browseMode,
    );

    // Show die result during reinforcementDie phase (FR-20, FR-21)
    if (state.phase === 'reinforcementDie' && state.reinforcementDie) {
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
    // Background strip
    this.add.rectangle(W / 2, 20, W, 40, DARK_BG, 0.9).setDepth(10);

    // Turn track (top-left)
    this.turnText = this.add.text(12, 20, 'Turn 1 / 10', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: TEXT_COLOR,
    }).setOrigin(0, 0.5).setDepth(11);

    // Phase (top-center)
    this.phaseText = this.add.text(W / 2, 20, 'Select Race & Power', {
      fontSize: '15px',
      fontFamily: 'Arial',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(11);
  }

  /** Two player dashboard panels (bottom-left and bottom-right). */
  private _drawPlayerDashboards(): void {
    // Player 0 — bottom left
    this.playerDashboards[0] = new PlayerDashboard(
      this, 0, 8, H - 100, 280, 92,
    );
    // Player 1 — bottom right
    this.playerDashboards[1] = new PlayerDashboard(
      this, 1, W - 288, H - 100, 280, 92,
    );
  }

  /** Centered action button at bottom-center. */
  private _drawActionButton(): void {
    this.actionBtnBg = this.add.rectangle(0, 0, 200, 36, PLAYER_COLORS[0])
      .setStrokeStyle(1, 0xffffff, 0.3);

    this.actionBtnLabel = this.add.text(0, 0, 'End Conquest', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.actionButton = this.add.container(W / 2, H - 24, [
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
    this.declineBtnBg = this.add.rectangle(0, 0, 160, 36, 0x6b21a8)
      .setStrokeStyle(1, 0xffffff, 0.3);

    const declineBtnLabel = this.add.text(0, 0, 'Go In Decline', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5);

    this.declineButton = this.add.container(W / 2 - 130, H - 24, [
      this.declineBtnBg,
      declineBtnLabel,
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

  /** Whether pan-only mode is active (FR-60). */
  get panMode(): boolean { return this._panMode; }

  /** Interaction / Pan mode toggle button (FR-60). */
  private _drawModeToggle(): void {
    this.modeToggleBg = this.add.rectangle(0, 0, 80, 24, 0x1e3a5f)
      .setStrokeStyle(1, 0x4a8ab5, 0.6);

    this.modeToggleLabel = this.add.text(0, 0, 'Pan', {
      fontSize: '11px', fontFamily: 'Arial', color: '#93c5fd',
    }).setOrigin(0.5, 0.5);

    this.add.container(W - 200, 20, [
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
    this.dieResultText = this.add.text(W / 2 + 130, H - 24, '', {
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

    this.browseButton = this.add.container(W - 80, 20, [
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

    this.activeBorder.setVisible(isActive);

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
    this.tokensText.setText(`Tokens: ${player.availableTokens} / ${race?.totalTokens ?? '—'}`);
    this.coinsText.setText(`Coins: ${player.coins}`);
  }
}
