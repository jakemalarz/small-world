import Phaser from 'phaser';
import type { GameState } from '@/game/state/types';
import { MAP_2P } from '@/game/data/map2p';

// ── Constants ─────────────────────────────────────────────────────────────────

const PLAYER_STROKE: readonly [number, number] = [0x3b82f6, 0xef4444]; // blue, red
const VALID_TARGET_COLOR       = 0x22c55e; // green pulse for valid conquest targets
const FIRST_CONQUEST_COLOR     = 0xf59e0b; // amber pulse for first-conquest entry regions (FR-56)
const SELECTED_COLOR           = 0xfbbf24; // gold for the selected region

const BORDER_ALPHA_ACTIVE   = 0.85;
const BORDER_ALPHA_DECLINED = 0.4;

// Pulse animation: cycle the valid-target glow alpha
const PULSE_PERIOD_MS = 1200;

// ── Region Renderer ───────────────────────────────────────────────────────────

/**
 * RegionRenderer — draws vector ownership overlays and valid-target glows on
 * a Graphics object that sits between the map image (depth 0) and the tokens
 * (depth 5).
 *
 * Usage:
 *   const renderer = new RegionRenderer(scene);
 *   renderer.render(state, validTargetIds, selectedRegionId);
 *
 * Call update() in the scene's update() loop to advance the pulse animation.
 */
export class RegionRenderer {
  private readonly borderGfx: Phaser.GameObjects.Graphics;
  private readonly glowGfx: Phaser.GameObjects.Graphics;

  private lastValidTargets: ReadonlySet<number> = new Set();
  private lastIsFirstConquest = false;

  constructor(scene: Phaser.Scene) {
    // Borders sit just above the map image
    this.borderGfx = scene.add.graphics().setDepth(2);
    // Glow layer sits above borders but below tokens
    this.glowGfx = scene.add.graphics().setDepth(3);
  }

  /**
   * Redraw all overlays to reflect current state.
   *
   * @param state           Current game state.
   * @param validTargetIds  Regions that can be legally conquered (shown with glow).
   * @param selectedId      Currently selected region (shown with gold border).
   */
  render(
    state: GameState,
    validTargetIds: ReadonlySet<number> = new Set(),
    selectedId: number | null = null,
    isFirstConquest = false,
  ): void {
    this.lastValidTargets = validTargetIds;
    this.lastIsFirstConquest = isFirstConquest;
    this._drawBorders(state, selectedId);
    this._drawGlows(validTargetIds, 1.0, isFirstConquest);
  }

  /**
   * Call from the scene's update() loop to pulse the valid-target glow.
   */
  update(time: number): void {
    if (this.lastValidTargets.size === 0) return;
    const alpha = 0.3 + 0.35 * Math.sin((time / PULSE_PERIOD_MS) * Math.PI * 2);
    this._drawGlows(this.lastValidTargets, alpha, this.lastIsFirstConquest);
  }

  destroy(): void {
    this.borderGfx.destroy();
    this.glowGfx.destroy();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _drawBorders(state: GameState, selectedId: number | null): void {
    this.borderGfx.clear();

    for (const region of state.board.regions) {
      if (region.owner === null) continue;

      const mapRegion = MAP_2P.regions.find((r) => r.id === region.id);
      if (!mapRegion) continue;

      const isSelected = region.id === selectedId;
      const strokeColor = isSelected
        ? SELECTED_COLOR
        : PLAYER_STROKE[region.owner];
      const alpha = region.isDeclined ? BORDER_ALPHA_DECLINED : BORDER_ALPHA_ACTIVE;
      const lineWidth = isSelected ? 4 : region.isDeclined ? 2 : 3;

      if (region.isDeclined) {
        this._strokeDashed(mapRegion.polygon, strokeColor, alpha, lineWidth);
      } else {
        this._strokeSolid(mapRegion.polygon, strokeColor, alpha, lineWidth);
      }

      // Ownership fill (very subtle)
      this.borderGfx.fillStyle(
        PLAYER_STROKE[region.owner],
        region.isDeclined ? 0.08 : 0.14,
      );
      this.borderGfx.fillPoints(
        mapRegion.polygon.map(([x, y]) => new Phaser.Geom.Point(x, y)),
        true,
      );
    }
  }

  private _drawGlows(targetIds: ReadonlySet<number>, alpha: number, isFirstConquest = false): void {
    this.glowGfx.clear();
    if (targetIds.size === 0 || alpha <= 0) return;

    const color = isFirstConquest ? FIRST_CONQUEST_COLOR : VALID_TARGET_COLOR;

    for (const id of targetIds) {
      const mapRegion = MAP_2P.regions.find((r) => r.id === id);
      if (!mapRegion) continue;

      this.glowGfx.fillStyle(color, alpha * 0.45);
      this.glowGfx.fillPoints(
        mapRegion.polygon.map(([x, y]) => new Phaser.Geom.Point(x, y)),
        true,
      );
      this.glowGfx.lineStyle(3, color, alpha * 0.8);
      this.glowGfx.strokePoints(
        mapRegion.polygon.map(([x, y]) => new Phaser.Geom.Point(x, y)),
        true,
      );
    }
  }

  // ── Stroke helpers ─────────────────────────────────────────────────────────

  private _strokeSolid(
    poly: readonly (readonly [number, number])[],
    color: number,
    alpha: number,
    lineWidth: number,
  ): void {
    this.borderGfx.lineStyle(lineWidth, color, alpha);
    this.borderGfx.strokePoints(
      poly.map(([x, y]) => new Phaser.Geom.Point(x, y)),
      true,
    );
  }

  /** Approximate a dashed border by drawing short segments. */
  private _strokeDashed(
    poly: readonly (readonly [number, number])[],
    color: number,
    alpha: number,
    lineWidth: number,
    dashLen = 10,
    gapLen = 6,
  ): void {
    this.borderGfx.lineStyle(lineWidth, color, alpha);

    const pts = [...poly, poly[0]]; // close the loop
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[i + 1];
      const dx = x1 - x0;
      const dy = y1 - y0;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len;
      const uy = dy / len;

      let t = 0;
      let drawing = true;
      while (t < len) {
        const segLen = drawing ? dashLen : gapLen;
        const t2 = Math.min(t + segLen, len);
        if (drawing) {
          this.borderGfx.beginPath();
          this.borderGfx.moveTo(x0 + ux * t, y0 + uy * t);
          this.borderGfx.lineTo(x0 + ux * t2, y0 + uy * t2);
          this.borderGfx.strokePath();
        }
        t = t2;
        drawing = !drawing;
      }
    }
  }
}
