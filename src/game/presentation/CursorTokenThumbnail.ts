import Phaser from 'phaser';

// ── Constants ─────────────────────────────────────────────────────────────────

/** Display size of the thumbnail in world units (= screen pixels at zoom 1). */
const THUMB_SIZE = 64;

/**
 * Offset from cursor world position to thumbnail centre.
 * Negative values place the thumbnail to the upper-left of the cursor tip.
 */
const OFFSET_X = -(THUMB_SIZE * 0.5 + 8); // thumbnail right-edge 8px left of cursor
const OFFSET_Y = -(THUMB_SIZE * 0.5 + 8); // thumbnail bottom-edge 8px above cursor

/** Depth — above token images (5–6) but well below HUD (10+). */
const DEPTH = 9;

// Orange circle offsets from thumbnail centre — same proportions as TokenRenderer.
// Race tokens (active + ghouls_d): circle is bottom-right.
const RACE_CX = THUMB_SIZE * 0.277;
const RACE_CY = THUMB_SIZE * 0.282;
// Encampment token: circle is bottom-left.
const ENC_CX  = -THUMB_SIZE * 0.282;
const ENC_CY  = THUMB_SIZE * 0.258;

const COUNT_FONT_SIZE = Math.round(THUMB_SIZE * 0.22); // ≈ 14 px

// ── Public interface ──────────────────────────────────────────────────────────

export interface CursorTokenInfo {
  /** Phaser texture key for the token image (e.g. 'token-amazons'). */
  key: string;
  /** Number to display in the orange circle. */
  count: number;
  /** True for encampment tokens whose circle is on the bottom-left. */
  circleOnLeft?: boolean;
}

// ── CursorTokenThumbnail ──────────────────────────────────────────────────────

/**
 * Renders a small token thumbnail that follows the cursor, showing the
 * current number of tokens in hand during deployment phases.
 *
 * Usage:
 *   // In GameController.update():
 *   thumbnail.updatePosition(p.worldX, p.worldY);
 *
 *   // In GameController._renderState():
 *   thumbnail.update(info); // pass null to hide
 */
export class CursorTokenThumbnail {
  private readonly scene: Phaser.Scene;
  private img: Phaser.GameObjects.Image | null = null;
  private lbl: Phaser.GameObjects.Text | null = null;
  /** Stored circle offset so updatePosition can reposition the label. */
  private circleOffX = RACE_CX;
  private circleOffY = RACE_CY;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  /**
   * Update what the thumbnail shows. Call whenever game state changes.
   * Pass `null` (or info with count ≤ 0) to hide the thumbnail.
   */
  update(info: CursorTokenInfo | null): void {
    if (!info || info.count <= 0) {
      this.img?.setVisible(false);
      this.lbl?.setVisible(false);
      return;
    }

    this.circleOffX = info.circleOnLeft ? ENC_CX : RACE_CX;
    this.circleOffY = info.circleOnLeft ? ENC_CY : RACE_CY;

    if (!this.img) {
      this.img = this.scene.add
        .image(0, 0, info.key)
        .setDisplaySize(THUMB_SIZE, THUMB_SIZE)
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH)
        .setAlpha(0.92);
    } else {
      this.img.setTexture(info.key).setVisible(true);
    }

    if (!this.lbl) {
      this.lbl = this.scene.add
        .text(0, 0, String(info.count), {
          fontSize:        `${COUNT_FONT_SIZE}px`,
          fontFamily:      'Arial',
          fontStyle:       'bold',
          color:           '#ffffff',
          stroke:          '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DEPTH + 1);
    } else {
      this.lbl.setText(String(info.count)).setVisible(true);
    }
  }

  /**
   * Move the thumbnail to follow the cursor.
   * Call every frame from GameController.update() with worldX / worldY.
   */
  updatePosition(worldX: number, worldY: number): void {
    const cx = worldX + OFFSET_X;
    const cy = worldY + OFFSET_Y;
    this.img?.setPosition(cx, cy);
    this.lbl?.setPosition(cx + this.circleOffX, cy + this.circleOffY);
  }

  /** Destroy all Phaser objects (call when the scene shuts down). */
  destroy(): void {
    this.img?.destroy();
    this.lbl?.destroy();
  }
}
