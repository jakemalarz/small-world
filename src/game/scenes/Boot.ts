import Phaser from 'phaser';

// ── Race token asset definitions ─────────────────────────────────────────────
// Maps RaceId → image filename (stem). Handles dwarves→dwarfs, ratmen→rats.
const RACE_ASSETS: readonly [raceId: string, file: string][] = [
  ['amazons',   'amazons'],
  ['dwarves',   'dwarfs'],
  ['elves',     'elves'],
  ['ghouls',    'ghouls'],
  ['giants',    'giants'],
  ['halflings', 'halflings'],
  ['humans',    'humans'],
  ['orcs',      'orcs'],
  ['ratmen',    'rats'],
  ['skeletons', 'skeletons'],
  ['sorcerers', 'sorcerers'],
  ['tritons',   'tritons'],
  ['trolls',    'trolls'],
  ['wizards',   'wizards'],
];

const SPECIAL_ASSETS: readonly [key: string, file: string][] = [
  ['token-hero',        'hero.png'],
  ['token-dragon',      'dragon.png'],
  ['token-lair',        'lair.png'],
  ['token-fortress',    'fortress.png'],
  ['token-encampment',  'encampment.png'],
  ['token-hole',        'hole-in-the-ground.png'],
  ['token-lost-tribe',  'lost_tribe.png'],
  ['token-turn-marker', 'turn-marker.png'],
];

export class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // Show loading progress
    const { width, height } = this.scale;
    const bar = this.add.rectangle(width / 2, height / 2, 400, 28, 0x2d2d44);
    const fill = this.add.rectangle(width / 2 - 198, height / 2, 4, 20, 0x6c63ff);

    this.load.on('progress', (value: number) => {
      fill.width = 396 * value;
      fill.x = width / 2 - 198 + fill.width / 2;
    });

    this.load.on('complete', () => {
      bar.destroy();
      fill.destroy();
    });

    // ── Map ──────────────────────────────────────────────────────────────────
    this.load.image('map-2p', 'assets/images/map-2p.png');

    // ── Race tokens (active + declined) ──────────────────────────────────────
    const base = 'assets/images/board-tokens/';
    for (const [raceId, file] of RACE_ASSETS) {
      this.load.image(`token-${raceId}`,   `${base}${file}.png`);
      this.load.image(`token-${raceId}-d`, `${base}${file}_d.png`);
    }

    // ── Special tokens ────────────────────────────────────────────────────────
    for (const [key, file] of SPECIAL_ASSETS) {
      this.load.image(key, `${base}${file}`);
    }

    // ── HUD assets ──────────────────────────────────────────────────────────
    this.load.image('hud-background', 'assets/images/hud/hud-background.png');
    this.load.image('hud-coin', 'assets/images/hud/hud-coin.png');
    this.load.image('hud-occupied-region', 'assets/images/hud/hud-occupied-region.png');
    this.load.image('game-background', 'assets/images/hud/game_background.png');

    // ── HUD race portraits (for the top HUD bar active race display) ────────
    const hudRaceBase = 'assets/images/hud/';
    const HUD_RACE_ASSETS: readonly [raceId: string, file: string][] = [
      ['amazons',   'amazons'],
      ['dwarves',   'dwarfs'],
      ['elves',     'elves'],
      ['ghouls',    'ghouls'],
      ['giants',    'giants'],
      ['halflings', 'halflings'],
      ['humans',    'humans'],
      ['orcs',      'orcs'],
      ['ratmen',    'rats'],
      ['skeletons', 'skeletoms'],  // filename has typo
      ['sorcerers', 'sorcerers'],
      ['tritons',   'tritons'],
      ['trolls',    'trolls'],
      ['wizards',   'wizards'],
    ];
    for (const [raceId, file] of HUD_RACE_ASSETS) {
      this.load.image(`hud-race-${raceId}`, `${hudRaceBase}${file}.png`);
    }
  }

  create(): void {
    this.scene.start('MainMenu');
  }
}
