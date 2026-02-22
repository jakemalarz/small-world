import Phaser from 'phaser';
import { MAP_2P } from '@/game/data/map2p';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAP_W = MAP_2P.imageWidth;   // 1600
const MAP_H = MAP_2P.imageHeight;  // 900

/** Camera zoom limits */
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 2.0;
const ZOOM_STEP = 0.1;

/** Camera scroll padding around the map image */
const PAN_PADDING = 80;

/** Highlight tint colours */
const TINT_HOVER   = 0xffdd88;
const ALPHA_NORMAL = 0;      // transparent (invisible) hit zones
const ALPHA_HOVER  = 0.25;
const ALPHA_SELECTED = 0.45;

// ── Types ─────────────────────────────────────────────────────────────────────

export type RegionEventType = 'regionClick' | 'regionRightClick' | 'regionHover' | 'regionOut';

export interface RegionEvent {
  regionId: number;
}

// ── Board Scene ───────────────────────────────────────────────────────────────

/**
 * Board scene — renders the 2-player map image and wires up interactive
 * hit-polygon zones for each region. Supports pointer-drag panning and
 * scroll-wheel zooming via Phaser's built-in camera system.
 *
 * Region interaction events are emitted on the scene's own event emitter so
 * that the HUD scene and GameController can respond without tight coupling:
 *
 *   board.events.on('regionClick', ({ regionId }) => …)
 *   board.events.on('regionHover', ({ regionId }) => …)
 *   board.events.on('regionOut',   ({ regionId }) => …)
 */
export class Board extends Phaser.Scene {
  // ── Camera drag state ──────────────────────────────────────────────────────
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartScrollX = 0;
  private camStartScrollY = 0;

  // ── Region graphics ────────────────────────────────────────────────────────
  /** Map from regionId → highlight Graphics object */
  private regionGraphics = new Map<number, Phaser.GameObjects.Graphics>();
  /** Currently selected region id (null = none) */
  private selectedRegionId: number | null = null;

  constructor() {
    super('Board');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    this._createMapImage();
    this._createRegionZones();
    this._setupCamera();
    this._setupZoom();
    this._setupPan();
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  /** Place the map image at (0,0); scale to match polygon coordinate space. */
  private _createMapImage(): void {
    this.add.image(0, 0, 'map-2p')
      .setOrigin(0, 0)
      .setDisplaySize(MAP_W, MAP_H)
      .setDepth(0);
  }

  /**
   * For each region in MAP_2P, create:
   * 1. An invisible Graphics object used for drawing hover/select highlights.
   * 2. An interactive transparent zone polygon that captures pointer events.
   *
   * Phaser's `setInteractive({ useHandCursor: true })` on a Graphics object
   * requires a custom hit-area shape. We use `Phaser.Geom.Polygon` for this.
   */
  private _createRegionZones(): void {
    for (const region of MAP_2P.regions) {
      // Flatten polygon vertices to [x0,y0, x1,y1, …] for Phaser
      const flatPoints = region.polygon.flatMap(([x, y]) => [x, y]);
      const phaserPoly = new Phaser.Geom.Polygon(flatPoints);

      // ── Highlight Graphics ────────────────────────────────────────────────
      const gfx = this.add.graphics().setDepth(1);
      this.regionGraphics.set(region.id, gfx);
      this._drawHighlight(gfx, region.polygon, 0, ALPHA_NORMAL);

      // ── Hit Zone ──────────────────────────────────────────────────────────
      // Use a Graphics object as the hit zone (invisible fill + interactive).
      const hitZone = this.add.graphics().setDepth(2);
      hitZone.fillStyle(0xffffff, 0); // fully transparent
      hitZone.fillPoints(
        region.polygon.map(([x, y]) => new Phaser.Geom.Point(x, y)),
        true,
      );

      hitZone.setInteractive(
        phaserPoly,
        Phaser.Geom.Polygon.Contains,
      );

      const id = region.id;

      hitZone.on('pointerover', () => {
        if (this.selectedRegionId !== id) {
          this._drawHighlight(gfx, region.polygon, TINT_HOVER, ALPHA_HOVER);
        }
        this.events.emit('regionHover', { regionId: id } satisfies RegionEvent);
      });

      hitZone.on('pointerout', () => {
        if (this.selectedRegionId !== id) {
          this._drawHighlight(gfx, region.polygon, 0, ALPHA_NORMAL);
        }
        this.events.emit('regionOut', { regionId: id } satisfies RegionEvent);
      });

      hitZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button === 2) {
          // Right-click (FR-57: remove token during redeploy)
          this.events.emit('regionRightClick', { regionId: id } satisfies RegionEvent);
        } else {
          this._selectRegion(id, region.polygon);
          this.events.emit('regionClick', { regionId: id } satisfies RegionEvent);
        }
      });
    }
  }

  /** Draw a filled polygon highlight. Alpha=0 makes it invisible. */
  private _drawHighlight(
    gfx: Phaser.GameObjects.Graphics,
    poly: readonly (readonly [number, number])[],
    color: number,
    alpha: number,
  ): void {
    gfx.clear();
    if (alpha <= 0) return;
    gfx.fillStyle(color, alpha);
    gfx.fillPoints(
      poly.map(([x, y]) => new Phaser.Geom.Point(x, y)),
      true,
    );
    // Subtle border
    gfx.lineStyle(2, color, Math.min(alpha + 0.3, 1));
    gfx.strokePoints(
      poly.map(([x, y]) => new Phaser.Geom.Point(x, y)),
      true,
    );
  }

  /** Highlight the selected region; clear the previous selection. */
  private _selectRegion(
    id: number,
    poly: readonly (readonly [number, number])[],
  ): void {
    // Clear old selection
    if (this.selectedRegionId !== null && this.selectedRegionId !== id) {
      const prevGfx = this.regionGraphics.get(this.selectedRegionId);
      if (prevGfx) {
        const prevRegion = MAP_2P.regions.find((r) => r.id === this.selectedRegionId);
        if (prevRegion) {
          this._drawHighlight(prevGfx, prevRegion.polygon, 0, ALPHA_NORMAL);
        }
      }
    }

    this.selectedRegionId = id;
    const gfx = this.regionGraphics.get(id);
    if (gfx) {
      this._drawHighlight(gfx, poly, TINT_HOVER, ALPHA_SELECTED);
    }
  }

  /** Expose programmatic selection for the GameController. */
  selectRegion(id: number | null): void {
    if (id === null) {
      if (this.selectedRegionId !== null) {
        const prevGfx = this.regionGraphics.get(this.selectedRegionId);
        const prevRegion = MAP_2P.regions.find((r) => r.id === this.selectedRegionId);
        if (prevGfx && prevRegion) {
          this._drawHighlight(prevGfx, prevRegion.polygon, 0, ALPHA_NORMAL);
        }
        this.selectedRegionId = null;
      }
      return;
    }
    const region = MAP_2P.regions.find((r) => r.id === id);
    if (region) this._selectRegion(id, region.polygon);
  }

  // ── Camera ─────────────────────────────────────────────────────────────────

  private _setupCamera(): void {
    const cam = this.cameras.main;
    // World bounds: map size + padding so the map can't be scrolled off-screen
    this.cameras.main.setBounds(
      -PAN_PADDING,
      -PAN_PADDING,
      MAP_W + PAN_PADDING * 2,
      MAP_H + PAN_PADDING * 2,
    );
    // Start at max zoom-out so the entire map is visible (FR-58)
    const fitZoom = Math.min(
      this.scale.width / MAP_W,
      this.scale.height / MAP_H,
    );
    const initialZoom = Math.max(fitZoom, ZOOM_MIN);
    cam.setZoom(initialZoom);
    // Centre the camera on the map
    cam.centerOn(MAP_W / 2, MAP_H / 2);
  }

  // ── Zoom (scroll wheel) ────────────────────────────────────────────────────

  private _setupZoom(): void {
    this.input.on('wheel', (
      _pointer: Phaser.Input.Pointer,
      _gameObjects: unknown,
      _deltaX: number,
      deltaY: number,
    ) => {
      const cam = this.cameras.main;
      const newZoom = Phaser.Math.Clamp(
        cam.zoom + (deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
        ZOOM_MIN,
        ZOOM_MAX,
      );
      cam.setZoom(newZoom);
    });
  }

  // ── Pan (pointer drag) ────────────────────────────────────────────────────

  private _setupPan(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      // Only start drag on middle-button or right-button to avoid
      // conflicting with region left-click. Middle = button 1, Right = button 2.
      if (pointer.button !== 1 && pointer.button !== 2) {
        // Left button: start drag only if no region was under pointer
        // We still allow left-drag when clicking empty map space.
        this.isDragging = true;
      } else {
        this.isDragging = true;
      }
      this.dragStartX = pointer.x;
      this.dragStartY = pointer.y;
      this.camStartScrollX = this.cameras.main.scrollX;
      this.camStartScrollY = this.cameras.main.scrollY;
    });

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.isDragging || !pointer.isDown) return;
      const cam = this.cameras.main;
      const dx = (pointer.x - this.dragStartX) / cam.zoom;
      const dy = (pointer.y - this.dragStartY) / cam.zoom;
      cam.setScroll(
        this.camStartScrollX - dx,
        this.camStartScrollY - dy,
      );
    });

    this.input.on('pointerup', () => {
      this.isDragging = false;
    });

    // Prevent context menu on right-click
    this.game.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
}
