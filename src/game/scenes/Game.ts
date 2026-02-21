import Phaser from 'phaser';
import { GameController } from '@/game/GameController';
import { HumanPlayer } from '@/game/players/HumanPlayer';
import type { Board } from '@/game/scenes/Board';
import type { HUD } from '@/game/scenes/HUD';

// ── Game Scene ────────────────────────────────────────────────────────────────
//
// Orchestration scene: launches Board + HUD in parallel, wires up the
// shared event bus, constructs players, and starts the GameController loop.
//
// This scene itself renders nothing — it simply manages scene lifecycle and
// holds the controller reference so Phaser can call update() every frame.

export class Game extends Phaser.Scene {
  private controller: GameController | null = null;

  constructor() {
    super('Game');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(): void {
    // Launch Board (map + interaction) and HUD (UI overlay) as parallel scenes
    this.scene.launch('Board');
    this.scene.launch('HUD');

    // Phaser 3: launched scenes with no preload phase have their create()
    // called before the first update(). Defer controller init by one frame
    // to ensure both scenes have fully created their Phaser game objects.
    this.events.once('update', () => {
      this._initController();
    });
  }

  update(_time: number, _delta: number): void {
    this.controller?.update(_time);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _initController(): void {
    const boardScene = this.scene.get('Board') as Board;
    const hudScene   = this.scene.get('HUD')   as HUD;

    // Shared event bus — bridges Board/HUD clicks to HumanPlayer.chooseAction
    const eventBus = new Phaser.Events.EventEmitter();

    // Default: Human vs Human (hot-seat). Task 30 (MainMenu) will pass mode.
    const players: [HumanPlayer, HumanPlayer] = [
      new HumanPlayer('Player 1', eventBus),
      new HumanPlayer('Player 2', eventBus),
    ];

    this.controller = new GameController(boardScene, hudScene, eventBus, {
      players,
      firstPlayerIndex: 0,
      animationSpeed: 1.0,
    });

    // Start the async game loop (fire-and-forget; runs until gameOver)
    this.controller.start().catch((err: unknown) => {
      console.error('[GameController] Fatal error in game loop:', err);
    });
  }
}
