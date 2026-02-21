import Phaser from 'phaser';

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

    // Preload game assets
    this.load.image('map-2p', 'assets/images/map-2p.png');
  }

  create(): void {
    this.scene.start('MainMenu');
  }
}
