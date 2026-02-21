import Phaser from 'phaser';
import type { GameState, TurnPhase } from '@/game/state/types';
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
  reinforcementDie: 'Reinforcement Die',
  redeploy:         'Redeploy',
  score:            'Scoring',
  optionalDecline:  'Optional Decline',
  decline:          'In Decline',
  gameOver:         'Game Over',
};

const ACTION_BUTTONS: Partial<Record<TurnPhase, string>> = {
  readyTroops:      'Begin Conquest →',
  conquest:         'End Conquest',
  reinforcementDie: 'Roll Die',
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
  private comboShop!: ComboShopRenderer;

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
    const label = ACTION_BUTTONS[state.phase];
    if (label && state.phase !== 'selectCombo') {
      this.actionBtnLabel.setText(label);
      this.actionButton.setVisible(true);
    } else {
      this.actionButton.setVisible(false);
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
    const hexColor = PLAYER_HEX[this.playerIndex];

    this.scene.add.rectangle(x + w / 2, y + h / 2, w, h, PANEL_BG, 0.88)
      .setStrokeStyle(2, color, 0.5)
      .setDepth(10);

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

  update(state: GameState, playerIndex: 0 | 1, activeIndex: 0 | 1): void {
    const player = state.players[playerIndex];
    const isActive = playerIndex === activeIndex;

    this.activeBorder.setVisible(isActive);

    const race = player.activeRace;
    this.raceText.setText(race ? race.raceId.charAt(0).toUpperCase() + race.raceId.slice(1) : '—');
    this.powerText.setText(race ? race.powerId.charAt(0).toUpperCase() + race.powerId.slice(1) : '—');
    this.tokensText.setText(`Tokens: ${player.availableTokens} / ${race?.totalTokens ?? '—'}`);
    this.coinsText.setText(`Coins: ${player.coins}`);
  }
}
