import Phaser from 'phaser';

export class MainMenu extends Phaser.Scene {
  constructor() {
    super('MainMenu');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, height / 3, 'Small World', {
      fontSize: '64px',
      fontFamily: 'Georgia, serif',
      color: '#e8d5b7',
    }).setOrigin(0.5);

    this.add.text(width / 2, height / 2, '2-Player Game', {
      fontSize: '28px',
      fontFamily: 'Arial',
      color: '#ffffff',
      backgroundColor: '#6c63ff',
      padding: { x: 24, y: 12 },
    })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', function (this: Phaser.GameObjects.Text) {
        this.setStyle({ backgroundColor: '#8b83ff' });
      })
      .on('pointerout', function (this: Phaser.GameObjects.Text) {
        this.setStyle({ backgroundColor: '#6c63ff' });
      })
      .on('pointerdown', () => {
        this.scene.start('Game');
      });

    this.add.text(width / 2, height * 0.75, 'Based on the board game by Days of Wonder', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#888888',
    }).setOrigin(0.5);
  }
}
