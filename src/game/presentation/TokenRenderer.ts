import Phaser from 'phaser';
import type { GameState, RegionState } from '@/game/state/types';
import { MAP_2P } from '@/game/data/map2p';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Player colors: blue for P0, red for P1 */
const PLAYER_FILL:   readonly [number, number] = [0x3b82f6, 0xef4444];
const PLAYER_STROKE: readonly [number, number] = [0x1d4ed8, 0xb91c1c];
const DECLINE_FILL   = 0x6b7280; // gray
const DECLINE_STROKE = 0x4b5563;
const DECLINE_ALPHA  = 0.6;

const TOKEN_RADIUS = 12;
const SPECIAL_RADIUS = 8;

/** Marker colors for special tokens */
const MARKER_COLORS: Record<string, number> = {
  troll:      0x8b5cf6, // purple
  fortress:   0x6b7280, // gray
  encampment: 0xf59e0b, // amber
  hole:       0x1f2937, // dark
  hero:       0xfcd34d, // gold
  dragon:     0xdc2626, // crimson
};

// ── Token Renderer ────────────────────────────────────────────────────────────

/**
 * PlaceholderTokenRenderer — draws colored circles on a Phaser.GameObjects.Graphics
 * layer to represent race tokens and special markers on each region.
 *
 * Usage:
 *   const renderer = new PlaceholderTokenRenderer(scene);
 *   renderer.render(state);
 *
 * The renderer clears and redraws on every call to render().
 */
export class PlaceholderTokenRenderer {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly labels: Phaser.GameObjects.Text[] = [];
  private readonly scene: Phaser.Scene;

  constructor(scene: Phaser.Scene, depth = 5) {
    this.scene = scene;
    this.gfx = scene.add.graphics().setDepth(depth);
  }

  /** Redraw all tokens to reflect the current game state. */
  render(state: GameState): void {
    this.gfx.clear();
    // Remove old labels
    for (const label of this.labels) label.destroy();
    this.labels.length = 0;

    for (const region of state.board.regions) {
      this._renderRegion(state, region);
    }
  }

  /** Destroy all graphics objects (called when scene shuts down). */
  destroy(): void {
    this.gfx.destroy();
    for (const label of this.labels) label.destroy();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _renderRegion(_state: GameState, region: RegionState): void {
    if (region.tokens === 0 && !this._hasSpecialMarkers(region)) return;

    const mapRegion = MAP_2P.regions.find((r) => r.id === region.id);
    if (!mapRegion) return;

    const [cx, cy] = mapRegion.center;

    // ── Race tokens ────────────────────────────────────────────────────────
    if (region.tokens > 0 && region.owner !== null) {
      this._drawTokenCluster(region, cx, cy - 8);
    }

    // ── Special markers ────────────────────────────────────────────────────
    this._drawSpecialMarkers(region, cx, cy + (region.tokens > 0 ? 16 : 0));
  }

  /** Draw a cluster of token circles for the region. */
  private _drawTokenCluster(region: RegionState, cx: number, cy: number): void {
    const isDeclined = region.isDeclined;
    const owner = region.owner!;
    const fill   = isDeclined ? DECLINE_FILL   : PLAYER_FILL[owner];
    const stroke = isDeclined ? DECLINE_STROKE : PLAYER_STROKE[owner];
    const alpha  = isDeclined ? DECLINE_ALPHA  : 1;

    const count = region.tokens;

    if (count === 1) {
      this._drawCircle(cx, cy, TOKEN_RADIUS, fill, stroke, alpha);
      this._drawLabel(cx, cy, '1', alpha);
    } else if (count <= 3) {
      // Triangular arrangement
      const offsets = this._triangleOffsets(count);
      for (const [ox, oy] of offsets) {
        this._drawCircle(cx + ox, cy + oy, TOKEN_RADIUS - 2, fill, stroke, alpha);
      }
      this._drawLabel(cx, cy, String(count), alpha);
    } else {
      // 4+ tokens: single larger circle with count
      this._drawCircle(cx, cy, TOKEN_RADIUS + 4, fill, stroke, alpha);
      this._drawLabel(cx, cy, String(count), alpha, 13);
    }
  }

  /** Draw icons for special markers (troll lair, fortress, etc.). */
  private _drawSpecialMarkers(region: RegionState, cx: number, cy: number): void {
    let offsetX = 0;
    const step = SPECIAL_RADIUS * 2 + 3;

    if (region.hasTrollLair) {
      this._drawMarker(cx + offsetX, cy, MARKER_COLORS['troll'], 'T');
      offsetX += step;
    }
    if (region.hasFortress) {
      this._drawMarker(cx + offsetX, cy, MARKER_COLORS['fortress'], 'F');
      offsetX += step;
    }
    if (region.encampmentCount > 0) {
      const label = region.encampmentCount > 1 ? `E${region.encampmentCount}` : 'E';
      this._drawMarker(cx + offsetX, cy, MARKER_COLORS['encampment'], label);
      offsetX += step;
    }
    if (region.hasHoleInTheGround) {
      this._drawMarker(cx + offsetX, cy, MARKER_COLORS['hole'], 'H');
      offsetX += step;
    }
    if (region.hasHero) {
      this._drawMarker(cx + offsetX, cy, MARKER_COLORS['hero'], '★');
      offsetX += step;
    }
    if (region.hasDragon) {
      this._drawMarker(cx + offsetX, cy, MARKER_COLORS['dragon'], 'D');
    }
  }

  private _drawCircle(
    x: number, y: number, r: number,
    fill: number, stroke: number, alpha: number,
  ): void {
    this.gfx.fillStyle(fill, alpha);
    this.gfx.fillCircle(x, y, r);
    this.gfx.lineStyle(2, stroke, Math.min(alpha + 0.2, 1));
    this.gfx.strokeCircle(x, y, r);
  }

  private _drawMarker(x: number, y: number, color: number, letter: string): void {
    this._drawCircle(x, y, SPECIAL_RADIUS, color, 0x000000, 0.9);
    const label = this.scene.add.text(x, y, letter, {
      fontSize: '8px',
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(6);
    this.labels.push(label);
  }

  private _drawLabel(
    x: number, y: number, text: string, alpha: number, size = 11,
  ): void {
    const label = this.scene.add.text(x, y, text, {
      fontSize: `${size}px`,
      fontFamily: 'Arial',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(6).setAlpha(alpha);
    this.labels.push(label);
  }

  private _triangleOffsets(count: number): [number, number][] {
    if (count === 2) return [[-8, 0], [8, 0]];
    return [[-8, 6], [8, 6], [0, -8]]; // 3 tokens
  }

  private _hasSpecialMarkers(region: RegionState): boolean {
    return (
      region.hasTrollLair ||
      region.hasFortress ||
      region.encampmentCount > 0 ||
      region.hasHoleInTheGround ||
      region.hasHero ||
      region.hasDragon
    );
  }
}
