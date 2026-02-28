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
  readonly hasUnderworld: boolean;
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
// ⚠️  POLYGON COORDINATES ARE APPROXIMATE and were traced from the
//     reference photograph (src/assets/reference/2-player-map.jpeg).
//     Phase 2 refined these from simple rectangles to irregular polygons
//     that better follow the visible region boundaries in the map image.
//
// What IS correct (verified from game rules and map image):
//   - Terrain types, adjacency relationships, edge/coastal flags
//   - Feature markers: mines, magic source, underworld, lost tribes, mountains
//
// Region layout (rough grid, left→right, top→bottom):
//
//   Row 1 (top edge):
//     1:Sea  2:Farm  3:Mtn  4:Farm  5:Mtn  6:Forest
//   Row 2:
//     7:Hill  8:Swamp  9:Lake  10:Farm  11:Mtn  12:Forest
//   Row 3:
//     14:Swamp  15:Swamp  16:Hill  17:Hill  18:Forest  23:Mtn  13:Farm
//   Row 4 (bottom edge):
//     19:Swamp  22:Hill  20:Forest  21:Sea
//
// Adjacency is symmetric. The Lake (9) and Seas (1, 21) are not conquerable by
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
      polygon: [[80,0],[370,0],[370,100],[340,160],[280,210],[200,250],[80,260]],
      center: [200, 120],
      adjacentRegionIds: [2, 7],
      isEdge: true,
      isCoastal: true,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 2,
      name: "Merchant's Rest",
      terrain: 'farmland',
      polygon: [[370,0],[640,0],[660,60],[660,180],[620,230],[520,250],[370,240],[340,160],[370,100]],
      center: [505, 120],
      adjacentRegionIds: [1, 3, 7, 8],
      isEdge: true,
      isCoastal: true, // borders Sea (1)
      hasMountain: false, hasMine: false, hasMagicSource: true,
      hasUnderworld: false, hasLostTribe: true,
    },
    {
      id: 3,
      name: 'Highrock',
      terrain: 'mountain',
      polygon: [[640,0],[830,0],[850,40],[870,150],[830,220],[720,250],[620,230],[660,180],[660,60]],
      center: [740, 120],
      adjacentRegionIds: [2, 4, 8],
      isEdge: true,
      isCoastal: false,
      hasMountain: true, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 4,
      name: 'Fertile Plateau',
      terrain: 'farmland',
      polygon: [[830,0],[1080,0],[1080,60],[1100,180],[1050,240],[930,260],[830,220],[870,150],[850,40]],
      center: [960, 120],
      adjacentRegionIds: [3, 5, 8, 9],
      isEdge: true,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: true,
      hasUnderworld: false, hasLostTribe: true,
    },
    {
      id: 5,
      name: 'Storm Peaks',
      terrain: 'mountain',
      polygon: [[1080,0],[1300,0],[1310,80],[1290,200],[1250,250],[1100,270],[1050,240],[1100,180],[1080,60]],
      center: [1180, 130],
      adjacentRegionIds: [4, 6, 9, 11],
      isEdge: true,
      isCoastal: true, // borders Lake (9)
      hasMountain: true, hasMine: true, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 6,
      name: 'Eldwood',
      terrain: 'forest',
      polygon: [[1300,0],[1600,0],[1600,280],[1420,300],[1300,270],[1250,250],[1290,200],[1310,80]],
      center: [1440, 140],
      adjacentRegionIds: [5, 11, 12],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: true,
      hasUnderworld: false, hasLostTribe: true,
    },

    // ── Row 2: Upper middle ───────────────────────────────────────────────────

    {
      id: 7,
      name: 'Barrow Downs',
      terrain: 'hill',
      polygon: [[80,260],[200,250],[280,210],[340,160],[370,240],[380,310],[360,420],[280,470],[80,490]],
      center: [220, 370],
      adjacentRegionIds: [1, 2, 8, 14],
      isEdge: true,
      isCoastal: true, // borders Sea (1)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: true, hasLostTribe: true,
    },
    {
      id: 8,
      name: 'Marshwick',
      terrain: 'swamp',
      polygon: [[370,240],[520,250],[620,230],[720,250],[750,310],[700,380],[640,440],[530,470],[380,460],[360,420],[380,310]],
      center: [530, 350],
      adjacentRegionIds: [2, 3, 4, 7, 9, 14, 15],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: true,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 9,
      name: 'Lake of Whispers',
      terrain: 'lake',
      polygon: [[750,310],[830,220],[930,260],[1050,240],[1100,270],[1060,360],[1000,440],[900,480],[780,460],[700,380]],
      center: [900, 360],
      adjacentRegionIds: [4, 5, 8, 10, 11, 15, 16],
      isEdge: false,
      isCoastal: false, // the lake itself is not "coastal"
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 10,
      name: 'Golden Fields',
      terrain: 'farmland',
      polygon: [[1060,360],[1100,270],[1150,290],[1200,340],[1190,430],[1140,490],[1050,500],[1000,440]],
      center: [1100, 400],
      adjacentRegionIds: [9, 11, 13, 16, 17],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 11,
      name: 'Granite Throne',
      terrain: 'mountain',
      polygon: [[1100,270],[1250,250],[1300,270],[1370,310],[1360,420],[1300,480],[1200,490],[1140,490],[1190,430],[1200,340],[1150,290]],
      center: [1250, 380],
      adjacentRegionIds: [5, 6, 9, 10, 12, 17],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: true, hasMine: true, hasMagicSource: false,
      hasUnderworld: true, hasLostTribe: false,
    },
    {
      id: 12,
      name: 'Verdant March',
      terrain: 'forest',
      polygon: [[1300,270],[1420,300],[1600,280],[1600,520],[1460,530],[1350,500],[1300,480],[1360,420],[1370,310]],
      center: [1460, 400],
      adjacentRegionIds: [6, 11, 13, 17, 18, 23],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },

    // ── Row 3: Lower middle ───────────────────────────────────────────────────

    {
      id: 14,
      name: 'Bogmoss',
      terrain: 'swamp',
      polygon: [[80,490],[280,470],[360,420],[380,460],[400,530],[370,620],[300,680],[180,710],[80,720]],
      center: [230, 600],
      adjacentRegionIds: [7, 8, 15, 19],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 15,
      name: 'Mire Pit',
      terrain: 'swamp',
      polygon: [[380,460],[530,470],[640,440],[680,500],[660,580],[600,650],[500,700],[370,690],[370,620],[400,530]],
      center: [520, 580],
      adjacentRegionIds: [8, 9, 14, 16, 19],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: true, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 16,
      name: 'Rolling Hills',
      terrain: 'hill',
      polygon: [[640,440],[780,460],[900,480],[940,530],[920,620],[860,690],[740,720],[620,700],[600,650],[660,580],[680,500]],
      center: [770, 600],
      adjacentRegionIds: [9, 10, 15, 17, 19, 20, 22],
      isEdge: false,
      isCoastal: true, // borders Lake (9)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      id: 17,
      name: 'Hollow Ridge',
      terrain: 'hill',
      polygon: [[940,530],[1000,440],[1050,500],[1140,490],[1200,490],[1250,540],[1220,630],[1140,700],[1020,720],[920,700],[920,620]],
      center: [1080, 610],
      adjacentRegionIds: [10, 11, 12, 13, 16, 18, 20, 23],
      isEdge: false,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: true, hasLostTribe: false,
    },
    {
      id: 18,
      name: 'Thornwood',
      terrain: 'forest',
      polygon: [[1200,490],[1300,480],[1350,500],[1380,550],[1370,650],[1320,720],[1220,740],[1140,700],[1220,630],[1250,540]],
      center: [1280, 620],
      adjacentRegionIds: [12, 13, 17, 20, 21, 23],
      isEdge: false,
      isCoastal: true, // borders Sea (21)
      hasMountain: false, hasMine: true, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      // Far-right column, rows 2-3 (upper portion)
      id: 13,
      name: 'Coastal Pastures',
      terrain: 'farmland',
      polygon: [[1350,500],[1460,530],[1600,520],[1600,640],[1500,650],[1440,640],[1380,550]],
      center: [1480, 580],
      adjacentRegionIds: [10, 12, 17, 18, 23],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      // Far-right column, row 3 (lower portion, split from old 13)
      id: 23,
      name: 'Granite Pass',
      terrain: 'mountain',
      polygon: [[1380,550],[1440,640],[1500,650],[1600,640],[1600,750],[1440,740],[1320,720],[1370,650]],
      center: [1480, 700],
      adjacentRegionIds: [12, 13, 17, 18, 20, 21],
      isEdge: true,
      isCoastal: true, // borders Sea (21)
      hasMountain: true, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: true,
    },

    // ── Row 4: Bottom edge ────────────────────────────────────────────────────

    {
      id: 19,
      name: 'Fenwick Bog',
      terrain: 'swamp',
      polygon: [[80,720],[180,710],[300,680],[370,690],[500,700],[540,720],[540,900],[80,900]],
      center: [310, 800],
      adjacentRegionIds: [14, 15, 16, 22],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: true, hasLostTribe: true,
    },
    {
      // Center-bottom region (split from old 20)
      id: 22,
      name: 'Windswept Rise',
      terrain: 'hill',
      polygon: [[540,720],[620,700],[740,720],[860,690],[920,700],[920,760],[850,810],[700,830],[540,810]],
      center: [730, 760],
      adjacentRegionIds: [16, 19, 20],
      isEdge: true,
      isCoastal: false,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      // Center-right bottom region (split from old 20)
      id: 20,
      name: 'Darkwood Glen',
      terrain: 'forest',
      polygon: [[920,700],[1020,720],[1140,700],[1220,740],[1320,720],[1440,740],[1440,810],[1300,850],[1100,860],[920,830],[920,760]],
      center: [1160, 780],
      adjacentRegionIds: [16, 17, 18, 21, 22, 23],
      isEdge: true,
      isCoastal: true, // borders Sea (21)
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
    },
    {
      // Far-right bottom region (new sea, split from old 20 right edge)
      id: 21,
      name: 'Tidal Flats',
      terrain: 'sea',
      polygon: [[1440,740],[1600,750],[1600,900],[1100,900],[1100,860],[1300,850],[1440,810]],
      center: [1380, 830],
      adjacentRegionIds: [18, 20, 23],
      isEdge: true,
      isCoastal: true,
      hasMountain: false, hasMine: false, hasMagicSource: false,
      hasUnderworld: false, hasLostTribe: false,
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
