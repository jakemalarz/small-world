import Phaser from 'phaser';
import type { GameState, RegionState } from '@/game/state/types';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';
import { MAP_2P } from '@/game/data/map2p';
import { calculateConquestCost } from '@/game/engine/conquestCost';

// ── TooltipRenderer ───────────────────────────────────────────────────────────
//
// Renders contextual hover tooltips in the Board scene.
// Appears after a configurable delay (~300ms) when the pointer hovers over
// a region. Positioned to avoid going off-screen.
//
// Tooltip content for regions:
//   • Terrain type and region name
//   • Defense value (conquest cost from current player's perspective)
//   • Owner info (race name if occupied, "Empty" if not)
//   • Special markers (Lost Tribe, Mountain, Troll Lair, etc.)

const HOVER_DELAY = 300; // ms before tooltip appears
const PADDING     = 10;
const LINE_H      = 18;

const BG_COLOR  = 0x0f0f22;
const BORDER_COLOR = 0x5a5a8a;
const TXT_TITLE = '#e8d5b7';
const TXT_INFO  = '#aaaacc';

export class TooltipRenderer {
  private readonly scene: Phaser.Scene;
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly lines: Phaser.GameObjects.Text[] = [];
  private readonly container: Phaser.GameObjects.Container;

  private hoverTimer: Phaser.Time.TimerEvent | null = null;
  private currentRegionId: number | null = null;
  private currentState: GameState | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Build tooltip container (hidden by default)
    this.bg = scene.add.rectangle(0, 0, 200, 80, BG_COLOR, 0.92)
      .setStrokeStyle(1, BORDER_COLOR, 0.8);

    // Pre-create text lines (max 6 lines)
    for (let i = 0; i < 6; i++) {
      const line = scene.add.text(0, 0, '', {
        fontSize: '13px',
        fontFamily: 'Arial',
        color: i === 0 ? TXT_TITLE : TXT_INFO,
        fontStyle: i === 0 ? 'bold' : 'normal',
        wordWrap: { width: 180 },
      });
      this.lines.push(line);
    }

    this.container = scene.add.container(0, 0, [this.bg, ...this.lines]).setDepth(50);
    this.container.setVisible(false);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /** Set the current game state so tooltips can read region/race info. */
  setGameState(state: GameState): void {
    this.currentState = state;
  }

  /**
   * Show tooltip for the given region after HOVER_DELAY ms.
   * Pass regionId=null to hide the tooltip immediately.
   */
  showRegionTooltip(regionId: number | null, worldX: number, worldY: number): void {
    this._cancelHoverTimer();

    if (regionId === null) {
      this.container.setVisible(false);
      this.currentRegionId = null;
      return;
    }

    if (regionId === this.currentRegionId && this.container.visible) return;

    // Delay before showing
    this.hoverTimer = this.scene.time.delayedCall(HOVER_DELAY, () => {
      this._show(regionId, worldX, worldY);
    });
  }

  /** Move the tooltip to follow the pointer position. */
  updatePosition(worldX: number, worldY: number): void {
    if (!this.container.visible) return;
    this._positionAt(worldX, worldY);
  }

  destroy(): void {
    this._cancelHoverTimer();
    this.container.destroy(true);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _show(regionId: number, worldX: number, worldY: number): void {
    if (!this.currentState) return;

    this.currentRegionId = regionId;

    const region = this.currentState.board.regions.find((r) => r.id === regionId);
    const mapRegion = MAP_2P.regions.find((r) => r.id === regionId);
    if (!region || !mapRegion) return;

    const tooltipLines = _buildTooltipLines(region, this.currentState);

    // Update text lines
    let totalH = PADDING;
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      const text = tooltipLines[i] ?? '';
      line.setText(text);
      if (text) {
        line.setPosition(PADDING, totalH);
        totalH += LINE_H;
        line.setVisible(true);
      } else {
        line.setVisible(false);
      }
    }
    totalH += PADDING;

    // Resize bg
    const maxW = Math.max(...tooltipLines.filter(Boolean).map((t) =>
      this.scene.textures.exists('_default')
        ? t.length * 7  // rough estimate
        : t.length * 7,
    ), 160);
    this.bg.setSize(maxW + PADDING * 2, totalH);
    this.bg.setPosition((maxW + PADDING * 2) / 2, totalH / 2);

    this._positionAt(worldX, worldY);
    this.container.setVisible(true);
  }

  private _positionAt(wx: number, wy: number): void {
    const cam = this.scene.cameras.main;
    const zoom = cam.zoom;

    // Apply inverse zoom so tooltip stays constant screen-space size (FR-59)
    this.container.setScale(1 / zoom);

    // Convert world coordinates to screen coordinates
    const sx = (wx - cam.scrollX) * zoom;
    const sy = (wy - cam.scrollY) * zoom;

    const bgW = this.bg.width;
    const bgH = this.bg.height;

    // Offset from pointer, clamped to canvas bounds
    const gameW = this.scene.scale.width;
    const gameH = this.scene.scale.height;

    let tx = sx + 16;
    let ty = sy + 8;

    if (tx + bgW > gameW - 10) tx = sx - bgW - 16;
    if (ty + bgH > gameH - 10) ty = sy - bgH - 8;

    // Convert back to world coords for container position
    this.container.setPosition(
      tx / zoom + cam.scrollX,
      ty / zoom + cam.scrollY,
    );
  }

  private _cancelHoverTimer(): void {
    if (this.hoverTimer) {
      this.hoverTimer.remove(false);
      this.hoverTimer = null;
    }
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────────

function _buildTooltipLines(region: RegionState, state: GameState): string[] {
  const lines: string[] = [];

  // Line 0: Region name
  const mapRegion = MAP_2P.regions.find((r) => r.id === region.id)!;
  lines.push(mapRegion?.name ?? `Region ${region.id}`);

  // Line 1: Terrain + secondary classifications
  const secondary: string[] = [];
  if (region.hasMine) secondary.push('Mine');
  if (region.hasMagicSource) secondary.push('Magic');
  if (region.hasUnderworld) secondary.push('Underworld');
  if (region.isCoastal) secondary.push('Coastal');
  const terrainLabel = secondary.length > 0
    ? `${_capitalize(region.terrain)} (${secondary.join(', ')})`
    : _capitalize(region.terrain);
  lines.push(`Terrain: ${terrainLabel}`);

  // Line 2: Owner + status
  if (region.owner === null && region.hasLostTribe) {
    lines.push('Lost Tribe');
  } else if (region.owner === null) {
    lines.push('Unoccupied');
  } else {
    const owner = state.players[region.owner];
    if (region.isDeclined && owner.declinedRaces.length > 0) {
      const decRace = owner.declinedRaces[0];
      lines.push(`In Decline: ${_capitalize(decRace.raceId)} (P${region.owner + 1})`);
    } else if (owner.activeRace) {
      const race = RACES[owner.activeRace.raceId];
      const power = POWERS[owner.activeRace.powerId];
      lines.push(`Occupied: ${race.name} / ${power.name} (P${region.owner + 1})`);
    }
    lines.push(`Tokens: ${region.tokens}`);
  }

  // Line 3+: Special markers
  const markers: string[] = [];
  if (region.hasMountain) markers.push('Mountain');
  if (region.hasTrollLair) markers.push('Troll Lair');
  if (region.hasFortress) markers.push('Fortress');
  if (region.hasHero) markers.push('Hero (Protected)');
  if (region.hasDragon) markers.push('Dragon (Protected)');
  if (region.hasHoleInTheGround) markers.push('Hole in the Ground');
  if (markers.length > 0) lines.push(markers.join(', '));

  // Last line: Conquest cost (or Immune if protected)
  if (region.hasHero || region.hasDragon || region.hasHoleInTheGround) {
    lines.push('Conquest cost: Immune');
  } else {
    try {
      const cost = calculateConquestCost(state, region.id);
      lines.push(`Conquest cost: ${cost} tokens`);
    } catch {
      // ignore if cost can't be calculated
    }
  }

  return lines;
}

function _capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
