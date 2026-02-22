import Phaser from 'phaser';
import type { GameState, ComboSlot } from '@/game/state/types';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';

// ── ComboShopRenderer ─────────────────────────────────────────────────────────
//
// Renders the 6-slot combo shop overlay in the HUD scene.
// Visible only during 'selectCombo' phase.
//
// Each slot shows:
//   • Race name + Power name
//   • Token count (race.baseTokens + power.bonusTokens)
//   • Cost (slot index — slot 0 = FREE)
//   • Coins accumulated on slot from prior skips
//
// Clicking a slot emits 'playerAction' on the scene event emitter:
//   { type: 'selectCombo', comboIndex: n }
//
// The GameController bridges that to the shared ActionEventBus for HumanPlayer.

const PANEL_X = 400;    // left edge of panel
const PANEL_W = 480;    // panel width
const SLOT_H  = 80;     // height of each combo row
const PANEL_TOP = 60;   // y offset from top of canvas
const GAP = 4;          // gap between slots

const COL_BG    = 0x1a1a30;
const COL_HOVER = 0x2d2d5e;

const TXT_RACE  = '#e8d5b7';
const TXT_POWER = '#93c5fd';
const TXT_COST  = '#ffffff';
const TXT_MUTED = '#888899';
const TXT_FREE  = '#4ade80';  // green for FREE slot
const TXT_COIN  = '#fbbf24';

export class ComboShopRenderer {
  private readonly scene: Phaser.Scene;

  /** Container holding all slot objects — shown/hidden based on phase. */
  private panel!: Phaser.GameObjects.Container;

  /** One container per visible slot (for click + hover). */
  private slotContainers: Phaser.GameObjects.Container[] = [];
  private slotBgs: Phaser.GameObjects.Rectangle[] = [];

  /** Tooltip container for ability descriptions (FR-33, FR-35). */
  private tooltipContainer!: Phaser.GameObjects.Container;
  private tooltipBg!: Phaser.GameObjects.Rectangle;
  private tooltipRaceText!: Phaser.GameObjects.Text;
  private tooltipPowerText!: Phaser.GameObjects.Text;

  /** True when opened in browse-only mode (FR-54). */
  private _browseMode = false;
  /** Read-only label shown in browse mode. */
  private browseLabel!: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this._buildPanel();
    this._buildTooltip();
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Refresh the combo shop to reflect the current game state.
   * Shows in selectCombo phase or browse mode (FR-54).
   */
  refresh(state: GameState): void {
    const visible = state.phase === 'selectCombo' || this._browseMode;
    this.panel.setVisible(visible);
    this.browseLabel.setVisible(this._browseMode);
    if (!visible) {
      this.tooltipContainer.setVisible(false);
      return;
    }

    const player = state.players[state.activePlayerIndex];
    const playerCoins = player.coins;

    this._updateSlots(state.comboShop.visible, playerCoins);
  }

  /** Get whether browse mode is active. */
  get browseMode(): boolean { return this._browseMode; }

  /** Toggle browse-only mode (FR-54). */
  setBrowseMode(on: boolean): void {
    this._browseMode = on;
    if (!on) this.tooltipContainer.setVisible(false);
  }

  destroy(): void {
    this.panel.destroy(true);
    this.tooltipContainer.destroy(true);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _buildPanel(): void {
    const panelBg = this.scene.add.rectangle(
      PANEL_W / 2, (SLOT_H + GAP) * 3, PANEL_W, (SLOT_H + GAP) * 6 + 40,
      0x0a0a18, 0.92,
    ).setStrokeStyle(1, 0x3a3a6a, 0.8);

    const headerText = this.scene.add.text(PANEL_W / 2, 14, 'CHOOSE YOUR RACE & POWER', {
      fontSize: '12px',
      fontFamily: 'Arial',
      color: TXT_MUTED,
      letterSpacing: 3,
    }).setOrigin(0.5, 0.5);

    const children: Phaser.GameObjects.GameObject[] = [panelBg, headerText];

    // Build 6 slot rows
    for (let i = 0; i < 6; i++) {
      const slotContainer = this._buildSlot(i);
      children.push(slotContainer);
      this.slotContainers.push(slotContainer);
    }

    // Browse-only label (FR-54)
    this.browseLabel = this.scene.add.text(PANEL_W / 2, (SLOT_H + GAP) * 6 + 38, 'BROWSE ONLY', {
      fontSize: '11px',
      fontFamily: 'Arial',
      color: '#ff9999',
    }).setOrigin(0.5, 0.5);
    this.browseLabel.setVisible(false);
    children.push(this.browseLabel);

    // Close button for browse mode
    const closeBtn = this.scene.add.text(PANEL_W - 12, 14, '✕', {
      fontSize: '16px', fontFamily: 'Arial', color: '#ff6666', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setInteractive({ useHandCursor: true });
    closeBtn.on('pointerdown', () => {
      this.setBrowseMode(false);
      this.scene.events.emit('browseComboClose');
    });
    children.push(closeBtn);

    this.panel = this.scene.add.container(PANEL_X, PANEL_TOP, children).setDepth(25);
    this.panel.setVisible(false);
  }

  private _buildSlot(index: number): Phaser.GameObjects.Container {
    const y = 30 + index * (SLOT_H + GAP);

    // Background
    const bg = this.scene.add.rectangle(
      PANEL_W / 2, y + SLOT_H / 2, PANEL_W - 8, SLOT_H - 2, COL_BG,
    ).setStrokeStyle(1, 0x2a2a50).setInteractive({ useHandCursor: true });

    this.slotBgs.push(bg);

    // Cost badge (left)
    const costBadge = this.scene.add.rectangle(28, y + SLOT_H / 2, 48, SLOT_H - 8, 0x1f2a4a)
      .setStrokeStyle(1, 0x4a4a7a, 0.5);
    const costText = this.scene.add.text(28, y + SLOT_H / 2, '', {
      fontSize: '11px', fontFamily: 'Arial', color: TXT_COST,
    }).setOrigin(0.5);

    // Race name
    const raceText = this.scene.add.text(70, y + 16, '', {
      fontSize: '16px', fontFamily: 'Georgia, serif', color: TXT_RACE, fontStyle: 'bold',
    }).setOrigin(0, 0.5);

    // Power name
    const powerText = this.scene.add.text(70, y + 36, '', {
      fontSize: '13px', fontFamily: 'Arial', color: TXT_POWER,
    }).setOrigin(0, 0.5);

    // Token count badge (right side)
    const tokenText = this.scene.add.text(PANEL_W - 90, y + SLOT_H / 2, '', {
      fontSize: '13px', fontFamily: 'Arial', color: TXT_MUTED,
    }).setOrigin(0.5);

    // Coin indicator (far right)
    const coinText = this.scene.add.text(PANEL_W - 30, y + SLOT_H / 2, '', {
      fontSize: '12px', fontFamily: 'Arial', color: TXT_COIN, fontStyle: 'bold',
    }).setOrigin(0.5);

    // Affordability dimmer (full-width overlay when can't afford)
    const dimmer = this.scene.add.rectangle(
      PANEL_W / 2, y + SLOT_H / 2, PANEL_W - 8, SLOT_H - 2, 0x000000, 0,
    );

    // Pointer events
    bg.on('pointerover', () => {
      bg.setFillStyle(COL_HOVER);
      this._showSlotTooltip(index, y);
    });
    bg.on('pointerout',  () => {
      bg.setFillStyle(COL_BG);
      this.tooltipContainer.setVisible(false);
    });
    bg.on('pointerdown', () => {
      if (!this._browseMode) {
        this.scene.events.emit('playerAction', { type: 'selectCombo', comboIndex: index });
      }
    });

    const slotContainer = this.scene.add.container(0, 0, [
      bg, costBadge, costText, raceText, powerText, tokenText, coinText, dimmer,
    ]);

    // Store data refs for update
    slotContainer.setData('costText', costText);
    slotContainer.setData('raceText', raceText);
    slotContainer.setData('powerText', powerText);
    slotContainer.setData('tokenText', tokenText);
    slotContainer.setData('coinText', coinText);
    slotContainer.setData('dimmer', dimmer);
    slotContainer.setData('bg', bg);

    return slotContainer;
  }

  private _updateSlots(slots: readonly ComboSlot[], playerCoins: number): void {
    this._lastSlots = slots;
    for (let i = 0; i < Math.max(slots.length, this.slotContainers.length); i++) {
      const container = this.slotContainers[i];
      if (!container) continue;

      const slot = slots[i];
      if (!slot) {
        container.setVisible(false);
        continue;
      }

      container.setVisible(true);

      const race  = RACES[slot.raceId];
      const power = POWERS[slot.powerId];
      const totalTokens = race.baseTokens + power.bonusTokens;
      const cost = i;
      const canAfford = playerCoins >= cost;
      const coinCount = slot.coinsOnSlot;

      const costText:  Phaser.GameObjects.Text = container.getData('costText');
      const raceText:  Phaser.GameObjects.Text = container.getData('raceText');
      const powerText: Phaser.GameObjects.Text = container.getData('powerText');
      const tokenText: Phaser.GameObjects.Text = container.getData('tokenText');
      const coinText:  Phaser.GameObjects.Text = container.getData('coinText');
      const dimmer:    Phaser.GameObjects.Rectangle = container.getData('dimmer');
      const bg:        Phaser.GameObjects.Rectangle = container.getData('bg');

      costText.setText(i === 0 ? 'FREE' : `${i}🪙`);
      costText.setStyle({ color: i === 0 ? TXT_FREE : TXT_COST });

      raceText.setText(race.name);
      powerText.setText(`✦ ${power.name}`);
      tokenText.setText(`⚔ ${totalTokens} tokens`);

      if (coinCount > 0) {
        coinText.setText(`+${coinCount}🪙`);
      } else {
        coinText.setText('');
      }

      if (canAfford || this._browseMode) {
        dimmer.setFillStyle(0x000000, 0);
        bg.setInteractive({ useHandCursor: !this._browseMode });
      } else {
        dimmer.setFillStyle(0x000000, 0.5);
        bg.disableInteractive();
      }
    }
  }

  /** Build the tooltip panel for displaying race/power abilities (FR-33, FR-35). */
  private _buildTooltip(): void {
    this.tooltipBg = this.scene.add.rectangle(0, 0, PANEL_W - 20, 80, 0x0a0a18, 0.95)
      .setStrokeStyle(1, 0x5a5a8a, 0.8)
      .setOrigin(0, 0);

    this.tooltipRaceText = this.scene.add.text(8, 6, '', {
      fontSize: '11px', fontFamily: 'Arial', color: TXT_RACE,
      wordWrap: { width: PANEL_W - 40 },
    });

    this.tooltipPowerText = this.scene.add.text(8, 6, '', {
      fontSize: '11px', fontFamily: 'Arial', color: TXT_POWER,
      wordWrap: { width: PANEL_W - 40 },
    });

    this.tooltipContainer = this.scene.add.container(PANEL_X, 0, [
      this.tooltipBg, this.tooltipRaceText, this.tooltipPowerText,
    ]).setDepth(30).setVisible(false);
  }

  /** Show the ability tooltip for a given combo slot index. */
  private _showSlotTooltip(index: number, slotY: number): void {
    if (!this._lastSlots || !this._lastSlots[index]) return;

    const slot = this._lastSlots[index];
    const race = RACES[slot.raceId];
    const power = POWERS[slot.powerId];

    this.tooltipRaceText.setText(`${race.name}: ${race.tooltip}`);
    this.tooltipPowerText.setText(`${power.name}: ${power.tooltip}`);

    // Position race and power text
    this.tooltipRaceText.setPosition(8, 6);
    const raceH = this.tooltipRaceText.height;
    this.tooltipPowerText.setPosition(8, 10 + raceH);
    const totalH = 16 + raceH + this.tooltipPowerText.height;

    this.tooltipBg.setSize(PANEL_W - 20, totalH);

    // Position tooltip below the slot
    const tipY = PANEL_TOP + slotY + SLOT_H + 4;
    this.tooltipContainer.setPosition(PANEL_X + 4, tipY);
    this.tooltipContainer.setVisible(true);
  }

  /** Cached slot data for tooltips. */
  private _lastSlots: readonly ComboSlot[] = [];
}
