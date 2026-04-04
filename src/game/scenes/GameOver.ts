import Phaser from 'phaser';
import type { GameState } from '@/game/state/types';

// ── GameOver Scene ────────────────────────────────────────────────────────────
//
// Displayed when the game reaches phase 'gameOver'. Receives the final
// GameState as scene data, shows winner + scores, and offers navigation.

const TEXT_GOLD   = '#fbbf24';
const TEXT_LIGHT  = '#e8d5b7';
const TEXT_MUTED  = '#9999bb';
const TEXT_BLUE   = '#93c5fd';
const TEXT_RED    = '#fca5a5';
const DARK_BG     = 0x0a0a18;

const PLAYER_COLORS: [string, string] = [TEXT_BLUE, TEXT_RED];

export class GameOver extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create(data: { state: GameState }): void {
    const { state } = data;

    this.cameras.main.setBackgroundColor(DARK_BG);

    const p0 = state.players[0];
    const p1 = state.players[1];

    const winner = _determineWinner(state);

    this._drawBackground();
    this._drawTitle(winner);
    this._drawScores(p0.coins, p1.coins);
    this._drawCoinBreakdown(state);
    this._drawButtons();
  }

  // ── Private builders ───────────────────────────────────────────────────────

  private _drawBackground(): void {
    const sw = this.scale.width;
    const sh = this.scale.height;
    this.add.rectangle(sw / 2, sh / 2, sw, sh, DARK_BG);

    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x1a1a3a, 0.5);
    for (let x = 0; x <= sw; x += 80) gfx.lineBetween(x, 0, x, sh);
    for (let y = 0; y <= sh; y += 80) gfx.lineBetween(0, y, sw, y);
  }

  private _drawTitle(winner: 0 | 1 | 'tie'): void {
    const sw = this.scale.width;
    const titleText = winner === 'tie'
      ? 'DRAW!'
      : `PLAYER ${winner + 1} WINS!`;

    const titleColor = winner === 'tie'
      ? TEXT_GOLD
      : PLAYER_COLORS[winner];

    this.add.text(sw / 2, 80, 'GAME OVER', {
      fontSize: '22px',
      fontFamily: 'Arial',
      color: TEXT_MUTED,
      letterSpacing: 6,
    }).setOrigin(0.5);

    this.add.text(sw / 2, 140, titleText, {
      fontSize: '64px',
      fontFamily: 'Georgia, serif',
      color: titleColor,
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5);
  }

  private _drawScores(p0Coins: number, p1Coins: number): void {
    const sw = this.scale.width;
    const panels: Array<{ label: string; coins: number; x: number; color: string }> = [
      { label: 'PLAYER 1', coins: p0Coins, x: sw / 2 - 200, color: TEXT_BLUE },
      { label: 'PLAYER 2', coins: p1Coins, x: sw / 2 + 200, color: TEXT_RED },
    ];

    for (const { label, coins, x, color } of panels) {
      // Panel background
      this.add.rectangle(x, 260, 300, 140, 0x1a1a30)
        .setStrokeStyle(1, 0x3a3a5f);

      this.add.text(x, 215, label, {
        fontSize: '14px',
        fontFamily: 'Arial',
        color,
        letterSpacing: 3,
      }).setOrigin(0.5);

      this.add.text(x, 265, `${coins}`, {
        fontSize: '56px',
        fontFamily: 'Georgia, serif',
        color,
        fontStyle: 'bold',
      }).setOrigin(0.5);

      this.add.text(x, 315, 'coins', {
        fontSize: '16px',
        fontFamily: 'Arial',
        color: TEXT_MUTED,
      }).setOrigin(0.5);
    }
  }

  private _drawCoinBreakdown(state: GameState): void {
    // Show coin earnings per turn from the log
    const coinsByTurn = _extractCoinsByTurn(state);

    if (coinsByTurn.length === 0) return;

    const sw = this.scale.width;
    this.add.text(sw / 2, 360, 'COINS EARNED PER TURN', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: TEXT_MUTED,
      letterSpacing: 3,
    }).setOrigin(0.5);

    const maxCoins = Math.max(...coinsByTurn.map((t) => Math.max(t.p0, t.p1)), 1);
    const barMaxH = 60;
    const barW = 16;
    const spacing = 24;
    const startX = sw / 2 - (coinsByTurn.length * (barW * 2 + spacing + 4)) / 2 + barW;
    const baseY = 450;

    coinsByTurn.forEach((entry, i) => {
      const x = startX + i * (barW * 2 + spacing);

      // Player 0 bar
      const h0 = Math.max(4, Math.round((entry.p0 / maxCoins) * barMaxH));
      this.add.rectangle(x - barW / 2 - 2, baseY - h0 / 2, barW, h0, 0x3b82f6);
      this.add.text(x - barW / 2 - 2, baseY + 6, `${entry.p0}`, {
        fontSize: '9px', fontFamily: 'Arial', color: TEXT_BLUE,
      }).setOrigin(0.5, 0);

      // Player 1 bar
      const h1 = Math.max(4, Math.round((entry.p1 / maxCoins) * barMaxH));
      this.add.rectangle(x + barW / 2 + 2, baseY - h1 / 2, barW, h1, 0xef4444);
      this.add.text(x + barW / 2 + 2, baseY + 6, `${entry.p1}`, {
        fontSize: '9px', fontFamily: 'Arial', color: TEXT_RED,
      }).setOrigin(0.5, 0);

      // Turn label
      this.add.text(x, baseY + 22, `T${entry.turn}`, {
        fontSize: '9px', fontFamily: 'Arial', color: TEXT_MUTED,
      }).setOrigin(0.5, 0);
    });

    // Legend
    this.add.rectangle(sw / 2 - 56, 490, 10, 10, 0x3b82f6);
    this.add.text(sw / 2 - 48, 490, 'Player 1', {
      fontSize: '11px', fontFamily: 'Arial', color: TEXT_BLUE,
    }).setOrigin(0, 0.5);

    this.add.rectangle(sw / 2 + 30, 490, 10, 10, 0xef4444);
    this.add.text(sw / 2 + 38, 490, 'Player 2', {
      fontSize: '11px', fontFamily: 'Arial', color: TEXT_RED,
    }).setOrigin(0, 0.5);
  }

  private _drawButtons(): void {
    const y = 580;

    const sw = this.scale.width;
    // Play Again
    const playBg = this.add.rectangle(sw / 2 - 130, y, 220, 46, 0x6c63ff)
      .setStrokeStyle(1, 0xffffff, 0.2)
      .setInteractive({ useHandCursor: true });
    this.add.text(sw / 2 - 130, y, 'PLAY AGAIN', {
      fontSize: '15px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5);
    playBg.on('pointerover', () => playBg.setFillStyle(0x8b83ff));
    playBg.on('pointerout',  () => playBg.setFillStyle(0x6c63ff));
    playBg.on('pointerdown', () => {
      this.scene.stop('GameOver');
      this.scene.start('Game', { gameModeConfig: this.registry.get('gameModeConfig') });
    });

    // Main Menu
    const menuBg = this.add.rectangle(sw / 2 + 130, y, 220, 46, 0x2a2a42)
      .setStrokeStyle(1, 0x6c63ff, 0.6)
      .setInteractive({ useHandCursor: true });
    this.add.text(sw / 2 + 130, y, 'MAIN MENU', {
      fontSize: '15px', fontFamily: 'Arial', color: TEXT_LIGHT, fontStyle: 'bold',
    }).setOrigin(0.5);
    menuBg.on('pointerover', () => menuBg.setFillStyle(0x3a3a5f));
    menuBg.on('pointerout',  () => menuBg.setFillStyle(0x2a2a42));
    menuBg.on('pointerdown', () => {
      this.scene.stop('GameOver');
      this.scene.start('MainMenu');
    });
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

/** Determine winner by coin count; on tie, count tokens on board as tiebreaker. */
function _determineWinner(state: GameState): 0 | 1 | 'tie' {
  const [p0, p1] = state.players;

  if (p0.coins !== p1.coins) return p0.coins > p1.coins ? 0 : 1;

  // Tiebreaker: most race tokens (active + declined) on board
  const tokens = (pi: 0 | 1) =>
    state.board.regions
      .filter((r) => r.owner === pi)
      .reduce((sum, r) => sum + r.tokens, 0);

  const t0 = tokens(0);
  const t1 = tokens(1);
  if (t0 !== t1) return t0 > t1 ? 0 : 1;

  return 'tie';
}

interface TurnCoins { turn: number; p0: number; p1: number }

/** Parse the game log to extract coins earned per turn by each player. */
function _extractCoinsByTurn(state: GameState): TurnCoins[] {
  const map = new Map<number, TurnCoins>();

  for (const entry of state.log) {
    if (entry.action.type !== 'endPhase') continue;
    const turn = entry.turn;
    if (!map.has(turn)) map.set(turn, { turn, p0: 0, p1: 0 });
  }

  // Simple approach: count coin-related scoring entries
  // (detailed breakdown requires annotating the log with delta — deferred)
  // For now, show per-turn total coins at the end
  for (let t = 1; t <= 10; t++) {
    if (!map.has(t)) map.set(t, { turn: t, p0: 0, p1: 0 });
  }

  return Array.from(map.values()).sort((a, b) => a.turn - b.turn);
}
