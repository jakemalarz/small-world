import Phaser from 'phaser';
import { GameController } from '@/game/GameController';
import { HumanPlayer } from '@/game/players/HumanPlayer';
import { AIPlayer } from '@/game/players/AIPlayer';
import { MediumAIPlayer } from '@/game/players/MediumAIPlayer';
import type { IPlayer } from '@/game/players/IPlayer';
import type { Board } from '@/game/scenes/Board';
import type { HUD } from '@/game/scenes/HUD';
import type { GameModeConfig } from '@/game/scenes/MainMenu';

// ── Game Scene ────────────────────────────────────────────────────────────────
//
// Orchestration scene: receives GameModeConfig from MainMenu, launches Board +
// HUD in parallel, creates appropriate player instances, and starts the
// GameController async loop.
//
// This scene itself renders nothing — it holds the controller and calls
// update() every frame so the region-glow pulse animation works.

export class Game extends Phaser.Scene {
  private controller: GameController | null = null;

  constructor() {
    super('Game');
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  create(data?: { gameModeConfig?: GameModeConfig }): void {
    const config: GameModeConfig = data?.gameModeConfig ?? {
      mode: 'hvh',
      difficulty: 'easy',
      speed: 1.0,
    };

    // Store config for use in deferred init
    this.registry.set('gameModeConfig', config);

    // Launch Board (map + interaction) and HUD (UI overlay) as parallel scenes
    this.scene.launch('Board');
    this.scene.launch('HUD');

    // Defer controller init by one frame so Board/HUD have had create() called
    this.events.once('update', () => {
      this._initController(config);
    });
  }

  update(_time: number, _delta: number): void {
    this.controller?.update(_time);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private _initController(config: GameModeConfig): void {
    const boardScene = this.scene.get('Board') as Board;
    const hudScene   = this.scene.get('HUD')   as HUD;

    // Shared event bus — bridges Board/HUD clicks to HumanPlayer.chooseAction
    const eventBus = new Phaser.Events.EventEmitter();

    const { mode, difficulty, speed } = config;
    const aiDelay = speed >= 4.0 ? 0 : Math.round(600 / speed);

    let players: [IPlayer, IPlayer];

    switch (mode) {
      case 'hvh':
        players = [
          new HumanPlayer('Player 1', eventBus),
          new HumanPlayer('Player 2', eventBus),
        ];
        break;
      case 'hvai':
        players = [
          new HumanPlayer('Player 1', eventBus),
          difficulty === 'medium'
            ? new MediumAIPlayer('Medium AI', aiDelay)
            : new AIPlayer('Easy AI', aiDelay),
        ];
        break;
      case 'aivai':
        players = difficulty === 'medium'
          ? [new MediumAIPlayer('AI-1', aiDelay), new MediumAIPlayer('AI-2', aiDelay)]
          : [new AIPlayer('AI-1', aiDelay), new AIPlayer('AI-2', aiDelay)];
        break;
      default:
        players = [
          new HumanPlayer('Player 1', eventBus),
          new HumanPlayer('Player 2', eventBus),
        ];
    }

    // Player 1 always goes first
    const firstPlayerIndex: 0 | 1 = 0;

    this.controller = new GameController(boardScene, hudScene, eventBus, {
      players,
      firstPlayerIndex,
      animationSpeed: mode === 'aivai' ? speed : 1.0,
    });

    // Start the async game loop; on completion show the end game screen
    this.controller.start()
      .then(() => {
        const finalState = this.controller!.state;
        // Stop Board + HUD, launch GameOver screen
        this.scene.stop('Board');
        this.scene.stop('HUD');
        this.scene.launch('GameOver', { state: finalState });
        this.scene.stop();
      })
      .catch((err: unknown) => {
        console.error('[GameController] Fatal error in game loop:', err);
      });
  }
}
