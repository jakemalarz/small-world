import Phaser from 'phaser';
import { gameConfig } from './game/config';

const game = new Phaser.Game(gameConfig);

// Expose for Playwright e2e tests
(window as any).__phaserGame = game;
