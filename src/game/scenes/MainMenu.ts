import Phaser from 'phaser';

// ── Game Mode Types ───────────────────────────────────────────────────────────

export type GameMode = 'hvh' | 'hvai' | 'aivai';
export type AIDifficulty = 'easy' | 'medium' | 'hard';
export type AISpeed = 1.0 | 2.0 | 4.0;

export interface GameModeConfig {
  mode: GameMode;
  difficulty: AIDifficulty;  // for HvAI and AivAI
  speed: AISpeed;             // for AivAI (animation multiplier)
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BTN_W = 260;
const BTN_H = 48;

const COLOR_IDLE   = 0x3b4a6b;
const COLOR_HOVER  = 0x5264a8;
const COLOR_ACTIVE = 0x6c63ff;

const TEXT_PRIMARY  = '#e8d5b7';
const TEXT_MUTED    = '#9999bb';
const TEXT_DIM      = '#666688';

// ── MainMenu Scene ────────────────────────────────────────────────────────────

export class MainMenu extends Phaser.Scene {
  private selectedMode: GameMode = 'hvh';
  private selectedDifficulty: AIDifficulty = 'easy';
  private selectedSpeed: AISpeed = 1.0;

  // Track button rects so we can update their tint on selection
  private modeButtons: Map<GameMode, Phaser.GameObjects.Rectangle> = new Map();
  private diffButtons: Map<AIDifficulty, Phaser.GameObjects.Rectangle> = new Map();
  private speedButtons: Map<AISpeed, Phaser.GameObjects.Rectangle> = new Map();

  // Sub-option rows (shown/hidden based on mode)
  private diffRow!: Phaser.GameObjects.Container;
  private speedRow!: Phaser.GameObjects.Container;

  constructor() {
    super('MainMenu');
  }

  create(): void {
    this._drawBackground();
    this._drawTitle();
    this._drawModeButtons();
    this._drawDifficultyRow();
    this._drawSpeedRow();
    this._drawStartButton();
    this._drawFooter();

    // Apply initial selection state
    this._refreshModeUI();
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private _drawBackground(): void {
    const sw = this.scale.width;
    const sh = this.scale.height;
    this.add.rectangle(sw / 2, sh / 2, sw, sh, 0x0d0d1f);

    // Subtle grid lines for flavor
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x1a1a3a, 0.6);
    for (let x = 0; x <= sw; x += 80) gfx.lineBetween(x, 0, x, sh);
    for (let y = 0; y <= sh; y += 80) gfx.lineBetween(0, y, sw, y);
  }

  private _drawTitle(): void {
    const sw = this.scale.width;
    this.add.text(sw / 2, 130, 'SMALL WORLD', {
      fontSize: '72px',
      fontFamily: 'Georgia, serif',
      color: '#e8d5b7',
      stroke: '#6c63ff',
      strokeThickness: 2,
    }).setOrigin(0.5);

    this.add.text(sw / 2, 200, 'Digital Edition', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: TEXT_MUTED,
      fontStyle: 'italic',
    }).setOrigin(0.5);
  }

  private _drawModeButtons(): void {
    const sw = this.scale.width;
    this.add.text(sw / 2, 280, 'SELECT GAME MODE', {
      fontSize: '13px',
      fontFamily: 'Arial',
      color: TEXT_DIM,
      letterSpacing: 3,
    }).setOrigin(0.5);

    const modes: Array<[GameMode, string]> = [
      ['hvh',   '👤 Human vs Human'],
      ['hvai',  '👤 Human vs AI'],
      ['aivai', '🤖 AI vs AI'],
    ];

    const startX = sw / 2 - (BTN_W * 1.5 + 24);
    modes.forEach(([mode, label], i) => {
      const x = startX + i * (BTN_W + 24);
      const y = 320;
      const rect = this.add.rectangle(x, y, BTN_W, BTN_H, COLOR_IDLE)
        .setStrokeStyle(1, 0x6c63ff, 0.5)
        .setInteractive({ useHandCursor: true });

      this.add.text(x, y, label, {
        fontSize: '15px',
        fontFamily: 'Arial',
        color: TEXT_PRIMARY,
      }).setOrigin(0.5);

      rect.on('pointerover', () => { if (this.selectedMode !== mode) rect.setFillStyle(COLOR_HOVER); });
      rect.on('pointerout',  () => { if (this.selectedMode !== mode) rect.setFillStyle(COLOR_IDLE); });
      rect.on('pointerdown', () => {
        this.selectedMode = mode;
        this._refreshModeUI();
      });

      this.modeButtons.set(mode, rect);
    });
  }

  private _drawDifficultyRow(): void {
    const y = 400;

    const sw = this.scale.width;
    const label = this.add.text(sw / 2, y - 26, 'AI DIFFICULTY', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: TEXT_DIM,
      letterSpacing: 2,
    }).setOrigin(0.5);

    const diffs: Array<[AIDifficulty, string]> = [
      ['easy',   'Easy'],
      ['medium', 'Medium'],
      ['hard',   'Hard'],
    ];

    const btnObjs: Phaser.GameObjects.GameObject[] = [label];
    const startX = sw / 2 - (120 + 20 + 60);
    diffs.forEach(([diff, lbl], i) => {
      const x = startX + i * (120 + 20);
      const rect = this.add.rectangle(x, y, 120, 38, COLOR_IDLE)
        .setStrokeStyle(1, 0x6c63ff, 0.4)
        .setInteractive({ useHandCursor: true });

      const txt = this.add.text(x, y, lbl, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: TEXT_PRIMARY,
      }).setOrigin(0.5);

      rect.on('pointerover', () => { if (this.selectedDifficulty !== diff) rect.setFillStyle(COLOR_HOVER); });
      rect.on('pointerout',  () => { if (this.selectedDifficulty !== diff) rect.setFillStyle(COLOR_IDLE); });
      rect.on('pointerdown', () => {
        this.selectedDifficulty = diff;
        this._refreshDiffUI();
      });

      this.diffButtons.set(diff, rect);
      btnObjs.push(rect, txt);
    });

    this.diffRow = this.add.container(0, 0, btnObjs);
  }

  private _drawSpeedRow(): void {
    const y = 400;

    const sw = this.scale.width;
    const label = this.add.text(sw / 2, y - 26, 'ANIMATION SPEED', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: TEXT_DIM,
      letterSpacing: 2,
    }).setOrigin(0.5);

    const speeds: Array<[AISpeed, string]> = [
      [1.0, '1×'],
      [2.0, '2×'],
      [4.0, '4× (Fast)'],
    ];

    const btnObjs: Phaser.GameObjects.GameObject[] = [label];
    const startX = sw / 2 - (110 + 12);
    speeds.forEach(([speed, lbl], i) => {
      const x = startX + i * (110 + 12);
      const rect = this.add.rectangle(x, y, 110, 38, COLOR_IDLE)
        .setStrokeStyle(1, 0x6c63ff, 0.4)
        .setInteractive({ useHandCursor: true });

      const txt = this.add.text(x, y, lbl, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color: TEXT_PRIMARY,
      }).setOrigin(0.5);

      rect.on('pointerover', () => { if (this.selectedSpeed !== speed) rect.setFillStyle(COLOR_HOVER); });
      rect.on('pointerout',  () => { if (this.selectedSpeed !== speed) rect.setFillStyle(COLOR_IDLE); });
      rect.on('pointerdown', () => {
        this.selectedSpeed = speed;
        this._refreshSpeedUI();
      });

      this.speedButtons.set(speed, rect);
      btnObjs.push(rect, txt);
    });

    this.speedRow = this.add.container(0, 0, btnObjs);
  }

  private _drawStartButton(): void {
    const y = 510;
    const sw = this.scale.width;
    const rect = this.add.rectangle(sw / 2, y, 240, 52, 0x6c63ff)
      .setStrokeStyle(2, 0xffffff, 0.3)
      .setInteractive({ useHandCursor: true });

    this.add.text(sw / 2, y, 'START GAME', {
      fontSize: '20px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);

    rect.on('pointerover', () => rect.setFillStyle(0x8b83ff));
    rect.on('pointerout',  () => rect.setFillStyle(0x6c63ff));
    rect.on('pointerdown', () => this._startGame());
  }

  private _drawFooter(): void {
    this.add.text(this.scale.width / 2, this.scale.height - 24, 'Based on Small World by Days of Wonder', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: TEXT_DIM,
    }).setOrigin(0.5);
  }

  // ── UI refresh ────────────────────────────────────────────────────────────

  private _refreshModeUI(): void {
    for (const [mode, rect] of this.modeButtons) {
      rect.setFillStyle(mode === this.selectedMode ? COLOR_ACTIVE : COLOR_IDLE);
    }

    // Show/hide sub-option rows based on mode
    this.diffRow.setVisible(this.selectedMode === 'hvai' || this.selectedMode === 'aivai');
    this.speedRow.setVisible(this.selectedMode === 'aivai');

    this._refreshDiffUI();
    this._refreshSpeedUI();
  }

  private _refreshDiffUI(): void {
    for (const [diff, rect] of this.diffButtons) {
      rect.setFillStyle(diff === this.selectedDifficulty ? COLOR_ACTIVE : COLOR_IDLE);
    }
  }

  private _refreshSpeedUI(): void {
    for (const [speed, rect] of this.speedButtons) {
      rect.setFillStyle(speed === this.selectedSpeed ? COLOR_ACTIVE : COLOR_IDLE);
    }
  }

  // ── Game start ────────────────────────────────────────────────────────────

  private _startGame(): void {
    const config: GameModeConfig = {
      mode: this.selectedMode,
      difficulty: this.selectedDifficulty,
      speed: this.selectedSpeed,
    };
    // Pass config data to Game scene
    this.scene.start('Game', { gameModeConfig: config });
  }
}
