import Phaser from 'phaser';

export class Game extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create(): void {
    const { width, height } = this.scale;

    this.add.text(width / 2, 30, 'Small World — Game Board', {
      fontSize: '24px',
      fontFamily: 'Arial',
      color: '#e8d5b7',
    }).setOrigin(0.5);

    // Placeholder: game board area
    this.add.rectangle(width / 2, height / 2, width - 40, height - 80, 0x2d2d44)
      .setStrokeStyle(2, 0x6c63ff);

    this.add.text(width / 2, height / 2, 'Game board will render here', {
      fontSize: '18px',
      fontFamily: 'Arial',
      color: '#666666',
    }).setOrigin(0.5);

    // Back button
    this.add.text(20, height - 30, '← Back to Menu', {
      fontSize: '14px',
      fontFamily: 'Arial',
      color: '#6c63ff',
    })
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => {
        this.scene.start('MainMenu');
      });
  }
}
