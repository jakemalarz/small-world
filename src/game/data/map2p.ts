import type { Terrain } from '@/game/state/types';

// ── Map data types ────────────────────────────────────────────────────────────

export interface MapRegionData {
  readonly id: number;
  readonly name: string;
  readonly terrain: Terrain;
  /** Clockwise vertex coordinates in map-image pixel space */
  readonly polygon: readonly (readonly [number, number])[];
  /** Visual center used for token placement and camera focus */
  readonly center: readonly [number, number];
  readonly adjacentRegionIds: readonly number[];
  /** True if this region touches the edge of the map (valid first-conquest target) */
  readonly isEdge: boolean;
  /** True if this region borders a Sea or Lake (valid first-conquest target) */
  readonly isCoastal: boolean;
  // ── Initial setup markers ────────────────────────────────────────────────────
  /** Mountain defense token present at game start (+1 to conquest cost) */
  readonly hasMountain: boolean;
  readonly hasMine: boolean;
  readonly hasMagicSource: boolean;
  readonly hasCavern: boolean;
  readonly hasLostTribe: boolean;
}

export interface MapData {
  /** Phaser asset key for the background map image */
  readonly imageKey: string;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly regions: readonly MapRegionData[];
}

// ── 2-Player Map ──────────────────────────────────────────────────────────────
//
// Coordinate system: pixels relative to the top-left of the map image.
// Image size: 1600 × 900 px (target render size).
//
// ⚠️  POLYGON COORDINATES ARE APPROXIMATE and were estimated from the
//     reference photograph (src/assets/reference/2-player-map.jpeg).
//     They should be refined during Task 16 (Board Scene setup) once the
//     map image is displayed in-game and regions can be verified visually.
//
// What IS correct (verified from game rules and map image):
//   - Terrain types, adjacency relationships, edge/coastal flags
//   - Feature markers: mines, magic source, cavern, lost tribes, mountains
//
// Region layout (rough grid, left→right, top→bottom):
//
//   Row 1 (top edge):
//     1:Sea  2:Farm  3:Mtn  4:Farm  5:Mtn  6:Forest
//   Row 2:
//     7:Mtn  8:Farm  9:Lake  10:Farm  11:Mtn  12:Forest
//   Row 3:
//     14:Swamp  15:Farm  16:Hill  17:Farm  18:Mtn  13:Farm
//   Row 4 (bottom edge):
//     19:Forest  20:Farm
//
// Adjacency is symmetric. The Lake (9) and Sea (1) are not conquerable by
// default — adjacent land regions are marked isCoastal: true.

export const MAP_2P: MapData = {
  imageKey: 'map2p',
  imageWidth: 1600,
  imageHeight: 900,
  regions: [
    // ── Row 1: Top edge ──────────────────────────────────────────────────────

    {
      id: 1,
      name: 'Shimmering Shoals',
      terrain: 'sea',
      polygon: [[0,0],[360,0],[360,230],[180,270],[0,270]],
      center: [170, 120],
      adjacentRegionIds: [2, 7],
      isEdge: true,
      isCoastal: true,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 2,
      name: "Merchant's Rest",
      terrain: 'farmland',
      polygon: [[320,0],[620,0],[620,240],[360,240],[320,160]],
      center: [470, 110],
      adjacentRegionIds: [1, 3, 7, 8],
      isEdge: true,
      isCoastal: true, // borders Sea (1)
      hasMountain: false, hasMine: true, hasMagicSource: false,
      hasCavern: false, hasLostTribe: true,
    },
    {
      id: 3,
      name: 'Highrock',
      terrain: 'mountain',
      polygon: [[590,0],[820,0],[820,250],[590,250]],
      center: [705, 115],
      adjacentRegionIds: [2, 4, 8],
      isEdge: true,
      isCoastal: false,
      hasMountain: true, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 4,
      name: 'Fertile Plateau',
      terrain: 'farmland',
      polygon: [[790,0],[1060,0],[1060,255],[790,255]],
      center: [925, 115],
      adjacentRegionIds: [3, 5, 8, 9],
      isEdge: true,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: true,
    },
    {
      id: 5,
      name: 'Storm Peaks',
      terrain: 'mountain',
      polygon: [[1030,0],[1290,0],[1290,255],[1030,255]],
      center: [1160, 115],
      adjacentRegionIds: [4, 6, 9, 11],
      isEdge: true,
      isCoastal: true, // borders Lake (9)
      hasMountain: true, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 6,
      name: 'Eldwood',
      terrain: 'forest',
      polygon: [[1260,0],[1600,0],[1600,280],[1260,280]],
      center: [1430, 125],
      adjacentRegionIds: [5, 11, 12],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: true,
      hasCavern: false, hasLostTribe: true,
    },

    // ── Row 2: Upper middle ───────────────────────────────────────────────────

    {
      id: 7,
      name: 'Volcano Rise',
      terrain: 'mountain',
      polygon: [[0,230],[330,230],[330,500],[0,500]],
      center: [155, 360],
      adjacentRegionIds: [1, 2, 8, 14],
      isEdge: true,
      isCoastal: true, // borders Sea (1)
      hasMountain: true, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: true,
    },
    {
      id: 8,
      name: 'Rolling Farms',
      terrain: 'farmland',
      polygon: [[300,225],[570,225],[570,500],[300,500]],
      center: [435, 360],
      adjacentRegionIds: [2, 3, 4, 7, 9, 14, 15],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 9,
      name: 'Lake of Whispers',
      terrain: 'lake',
      polygon: [[540,215],[860,215],[860,515],[540,515]],
      center: [700, 365],
      adjacentRegionIds: [4, 5, 8, 10, 11, 15, 16],
      isEdge: false,
      isCoastal: false, // the lake itself is not "coastal"
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 10,
      name: 'Golden Fields',
      terrain: 'farmland',
      polygon: [[830,220],[1080,220],[1080,500],[830,500]],
      center: [955, 360],
      adjacentRegionIds: [9, 11, 13, 16, 17],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: true, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 11,
      name: 'Granite Throne',
      terrain: 'mountain',
      polygon: [[1050,220],[1300,220],[1300,500],[1050,500]],
      center: [1175, 360],
      adjacentRegionIds: [5, 6, 9, 10, 12, 17],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: true, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 12,
      name: 'Verdant March',
      terrain: 'forest',
      polygon: [[1270,255],[1600,255],[1600,510],[1270,510]],
      center: [1435, 380],
      adjacentRegionIds: [6, 11, 13, 17, 18],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },

    // ── Row 3: Lower middle ───────────────────────────────────────────────────

    {
      id: 14,
      name: 'Bogmoss',
      terrain: 'swamp',
      polygon: [[0,470],[310,470],[310,740],[0,740]],
      center: [150, 605],
      adjacentRegionIds: [7, 8, 15, 19],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 15,
      name: 'Meadow Run',
      terrain: 'farmland',
      polygon: [[280,470],[570,470],[570,740],[280,740]],
      center: [425, 605],
      adjacentRegionIds: [8, 9, 14, 16, 19],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 16,
      name: 'Rolling Hills',
      terrain: 'hill',
      polygon: [[540,480],[860,480],[860,740],[540,740]],
      center: [700, 610],
      adjacentRegionIds: [9, 10, 15, 17, 19, 20],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 17,
      name: 'River Bend',
      terrain: 'farmland',
      polygon: [[830,470],[1080,470],[1080,740],[830,740]],
      center: [955, 605],
      adjacentRegionIds: [10, 11, 12, 13, 16, 18, 20],
      isEdge: false,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      id: 18,
      name: 'Iron Ridge',
      terrain: 'mountain',
      polygon: [[1050,470],[1320,470],[1320,740],[1050,740]],
      center: [1185, 605],
      adjacentRegionIds: [12, 13, 17, 20],
      isEdge: false,
      isCoastal: false,
      hasMountain: true, hasMine: true, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
    {
      // Far-right column, rows 2-3
      id: 13,
      name: 'Coastal Pastures',
      terrain: 'farmland',
      polygon: [[1290,470],[1600,470],[1600,740],[1290,740]],
      center: [1445, 605],
      adjacentRegionIds: [10, 12, 17, 18, 20],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },

    // ── Row 4: Bottom edge ────────────────────────────────────────────────────

    {
      id: 19,
      name: 'Deepwood Hollow',
      terrain: 'forest',
      polygon: [[0,710],[490,710],[490,900],[0,900]],
      center: [240, 805],
      adjacentRegionIds: [14, 15, 16, 20],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: true, hasLostTribe: true,
    },
    {
      id: 20,
      name: 'Southern Shore',
      terrain: 'farmland',
      polygon: [[460,710],[1600,710],[1600,900],[460,900]],
      center: [1030, 805],
      adjacentRegionIds: [13, 16, 17, 18, 19],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasCavern: false, hasLostTribe: false,
    },
  ],
};

// ── Derived helpers (used by setup.ts and tests) ──────────────────────────────

/** All region IDs in the map */
export const ALL_REGION_IDS = MAP_2P.regions.map((r) => r.id);

/** Look up a region by ID (throws if not found) */
export function getRegionData(id: number): MapRegionData {
  const region = MAP_2P.regions.find((r) => r.id === id);
  if (!region) throw new Error(`Unknown region id: ${id}`);
  return region;
}
