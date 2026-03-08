import Phaser from 'phaser';
import type { GameState, RegionState } from '@/game/state/types';
import { MAP_2P } from '@/game/data/map2p';

// ── Layout constants ──────────────────────────────────────────────────────────

/** Display size (width & height) for every token image, in canvas pixels. */
const TOKEN_SIZE = 112;

// Stacking offsets expressed as fractions of TOKEN_SIZE.
// Vertical stack (special on top behind, race on bottom in front):
const V_OFFSET = 0.28;
// Horizontal stack (encampment on left behind, race on right in front):
const H_OFFSET = 0.28;
// Three-token layout (encampment left, other right, race centred below — in front):
const THREE_H  = 0.40;   // horizontal spread from centre for each background token
const THREE_VT = 0.25;   // upward offset for the two background tokens
const THREE_VB = 0.28;   // downward offset for the foreground race token

// ── Orange-circle overlay positions ──────────────────────────────────────────
//
// Active race token images are ≈179 × 183 px.  The 80-px-diameter orange
// circle sits bottom-right, centred at ≈(139, 143) from the top-left corner.
// → offset from image centre: (+0.277 × w, +0.282 × h).
//
// Encampment image is ≈183 × 165 px.  Its orange circle is bottom-left,
// centred at ≈(40, 125) → offset from image centre: (−0.282 × w, +0.258 × h).
//
// ghouls_d.png (176 × 171 px) uses the same bottom-right position as active
// race tokens.
//
// All values below are relative to the displayed TOKEN_SIZE square.

const RACE_CX = TOKEN_SIZE * 0.277;    // right of image centre
const RACE_CY = TOKEN_SIZE * 0.282;    // below  image centre
const ENC_CX  = -TOKEN_SIZE * 0.282;   // left   of image centre
const ENC_CY  = TOKEN_SIZE * 0.258;    // below  image centre

/** Font size for the count number drawn over the orange circle. */
const COUNT_FONT_SIZE = Math.round(TOKEN_SIZE * 0.27); // ≈ 15 px

// ── Internal types ────────────────────────────────────────────────────────────

interface RaceInfo {
  key: string;
  count: number;
  showCount: boolean; // true for active races and declined ghouls
}

interface SpecialToken {
  key: string;
  isEncampment: boolean;
  count: number; // encampment count; 0 = no overlay
}

// ── Token Renderer ────────────────────────────────────────────────────────────

/**
 * PlaceholderTokenRenderer — renders race and special-power token images on
 * each board region, with dynamic count labels over the orange circles.
 *
 * Stacking rules:
 *   • Race only                  → centred on the region
 *   • Race + non-encampment      → vertical stack, race at bottom (in front)
 *   • Race + encampment          → horizontal stack, race on right (in front)
 *   • Race + encampment + other  → encampment left, other right (both behind),
 *                                   race centred-bottom (in front)
 *
 * Count overlays (bold white text on the orange circle):
 *   • Active race tokens and declined ghouls → bottom-right circle
 *   • Encampment token                       → bottom-left circle
 *
 * Usage:
 *   const renderer = new PlaceholderTokenRenderer(scene);
 *   renderer.render(state);
 */
export class PlaceholderTokenRenderer {
  private readonly scene: Phaser.Scene;
  private readonly baseDepth: number;
  private readonly images: Phaser.GameObjects.Image[] = [];
  private readonly labels: Phaser.GameObjects.Text[] = [];

  constructor(scene: Phaser.Scene, depth = 5) {
    this.scene = scene;
    this.baseDepth = depth;
  }

  /** Redraw all tokens to reflect the current game state. */
  render(state: GameState): void {
    for (const img of this.images) img.destroy();
    for (const lbl of this.labels) lbl.destroy();
    this.images.length = 0;
    this.labels.length = 0;

    for (const region of state.board.regions) {
      this._renderRegion(state, region);
    }
  }

  /** Destroy all Phaser objects (call when the scene shuts down). */
  destroy(): void {
    for (const img of this.images) img.destroy();
    for (const lbl of this.labels) lbl.destroy();
  }

  // ── Private ─────────────────────────────────────────────────────────────────

  private _renderRegion(state: GameState, region: RegionState): void {
    const mapRegion = MAP_2P.regions.find((r) => r.id === region.id);
    if (!mapRegion) return;
    const [cx, cy] = mapRegion.center;

    // Unoccupied region with a Lost Tribe token
    if (region.hasLostTribe && region.tokens === 0 && region.owner === null) {
      this._placeImage('token-lost-tribe', cx, cy, this.baseDepth);
      return;
    }

    const race     = this._getRaceInfo(state, region);
    const specials = this._getSpecials(region);

    if (!race && specials.length === 0) return;

    this._renderLayout(race, specials, cx, cy);
  }

  private _getRaceInfo(state: GameState, region: RegionState): RaceInfo | null {
    if (region.tokens === 0 || region.owner === null) return null;

    if (region.isDeclined) {
      const raceId = region.declinedRaceId;
      if (!raceId) return null;
      return {
        key:       `token-${raceId}-d`,
        count:     region.tokens,
        showCount: raceId === 'ghouls',
      };
    }

    const activeRace = state.players[region.owner].activeRace;
    if (!activeRace) return null;
    return {
      key:       `token-${activeRace.raceId}`,
      count:     region.tokens,
      showCount: true,
    };
  }

  private _getSpecials(region: RegionState): SpecialToken[] {
    const s: SpecialToken[] = [];
    // Encampment always first so it reliably ends up on the left
    if (region.encampmentCount > 0) {
      s.push({ key: 'token-encampment', isEncampment: true, count: region.encampmentCount });
    }
    if (region.hasTrollLair)       s.push({ key: 'token-lair',     isEncampment: false, count: 0 });
    if (region.hasFortress)        s.push({ key: 'token-fortress', isEncampment: false, count: 0 });
    if (region.hasHoleInTheGround) s.push({ key: 'token-hole',     isEncampment: false, count: 0 });
    if (region.hasHero)            s.push({ key: 'token-hero',     isEncampment: false, count: 0 });
    if (region.hasDragon)          s.push({ key: 'token-dragon',   isEncampment: false, count: 0 });
    return s;
  }

  private _renderLayout(
    race: RaceInfo | null,
    specials: SpecialToken[],
    cx: number,
    cy: number,
  ): void {
    const encampment = specials.find((s) =>  s.isEncampment) ?? null;
    const others     = specials.filter((s) => !s.isEncampment);

    if (!race) {
      // No race token: render up to two specials side-by-side
      for (let i = 0; i < Math.min(specials.length, 2); i++) {
        const ox = specials.length === 1 ? 0 : (i === 0 ? -TOKEN_SIZE * 0.25 : TOKEN_SIZE * 0.25);
        this._placeSpecial(specials[i], cx + ox, cy, this.baseDepth + i);
      }
      return;
    }

    if (specials.length === 0) {
      // ── Race only ─────────────────────────────────────────────────────────
      this._placeRace(race, cx, cy, this.baseDepth);

    } else if (!encampment && others.length >= 2) {
      // ── Race + 2 non-encampment specials → three-token layout ─────────────
      // (e.g. hero + troll lair + troll race)
      this._placeSpecial(others[0], cx - TOKEN_SIZE * THREE_H, cy - TOKEN_SIZE * THREE_VT, this.baseDepth);
      this._placeSpecial(others[1], cx + TOKEN_SIZE * THREE_H, cy - TOKEN_SIZE * THREE_VT, this.baseDepth);
      this._placeRace(race,         cx,                        cy + TOKEN_SIZE * THREE_VB, this.baseDepth + 1);

    } else if (!encampment) {
      // ── Race + 1 non-encampment special → vertical stack ──────────────────
      this._placeSpecial(others[0], cx, cy - TOKEN_SIZE * V_OFFSET, this.baseDepth);
      this._placeRace(race,         cx, cy + TOKEN_SIZE * V_OFFSET, this.baseDepth + 1);

    } else if (others.length === 0) {
      // ── Race + encampment only → horizontal stack ─────────────────────────
      this._placeSpecial(encampment, cx - TOKEN_SIZE * H_OFFSET, cy, this.baseDepth);
      this._placeRace(race,          cx + TOKEN_SIZE * H_OFFSET, cy, this.baseDepth + 1);

    } else {
      // ── Race + encampment + other → three-token layout ────────────────────
      this._placeSpecial(encampment, cx - TOKEN_SIZE * THREE_H, cy - TOKEN_SIZE * THREE_VT, this.baseDepth);
      this._placeSpecial(others[0],  cx + TOKEN_SIZE * THREE_H, cy - TOKEN_SIZE * THREE_VT, this.baseDepth);
      this._placeRace(race,          cx,                        cy + TOKEN_SIZE * THREE_VB, this.baseDepth + 1);
    }
  }

  // ── Token placement helpers ─────────────────────────────────────────────────

  private _placeRace(race: RaceInfo, x: number, y: number, depth: number): void {
    this._placeImage(race.key, x, y, depth);
    if (race.showCount) {
      this._placeCount(String(race.count), x + RACE_CX, y + RACE_CY, depth + 1);
    }
  }

  private _placeSpecial(special: SpecialToken, x: number, y: number, depth: number): void {
    this._placeImage(special.key, x, y, depth);
    if (special.isEncampment) {
      this._placeCount(String(special.count), x + ENC_CX, y + ENC_CY, depth + 1);
    }
  }

  private _placeImage(key: string, x: number, y: number, depth: number): void {
    const img = this.scene.add
      .image(x, y, key)
      .setDisplaySize(TOKEN_SIZE, TOKEN_SIZE)
      .setOrigin(0.5, 0.5)
      .setDepth(depth);
    this.images.push(img);
  }

  private _placeCount(text: string, x: number, y: number, depth: number): void {
    const lbl = this.scene.add
      .text(x, y, text, {
        fontSize:   `${COUNT_FONT_SIZE}px`,
        fontFamily: 'Arial',
        fontStyle:  'bold',
        color:      '#ffffff',
      })
      .setOrigin(0.5, 0.5)
      .setDepth(depth);
    this.labels.push(lbl);
  }
}
