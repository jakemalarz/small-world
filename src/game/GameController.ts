import Phaser from 'phaser';
import type { GameState, GameAction } from '@/game/state/types';
import type { IPlayer } from '@/game/players/IPlayer';
import type { Board, RegionEvent } from '@/game/scenes/Board';
import type { HUD } from '@/game/scenes/HUD';
import { createInitialState } from '@/game/engine/setup';
import { getLegalActions } from '@/game/engine/legalActions';
import { applyAction } from '@/game/engine/actions';
import { rollReinforcementDie } from '@/game/engine/reinforcementDie';
import { AnimationChoreographer } from '@/game/presentation/AnimationChoreographer';
import { PlaceholderTokenRenderer } from '@/game/presentation/TokenRenderer';
import { RegionRenderer } from '@/game/presentation/RegionRenderer';
import { TooltipRenderer } from '@/game/presentation/TooltipRenderer';
import { StubAudioManager } from '@/game/presentation/AudioManager';

// ── GameController ─────────────────────────────────────────────────────────────
//
// Orchestrates the full game loop:
//
//   state → render → wait for player choice → animate → apply → repeat
//
// The Board and HUD scenes are purely reactive — they render state and emit
// player input events. GameController translates those events into GameActions
// via a shared Phaser.Events.EventEmitter (the "action event bus").
//
// HumanPlayer listens on the same eventBus for 'playerAction' events.
// AIPlayer resolves immediately from its own heuristic.

export interface GameControllerConfig {
  players: [IPlayer, IPlayer];
  firstPlayerIndex: 0 | 1;
  /** Speed multiplier passed to AnimationChoreographer (>4 = instant). */
  animationSpeed?: number;
}

export class GameController {
  // ── State ────────────────────────────────────────────────────────────────

  state: GameState;                          // public for scene read access
  private readonly players: [IPlayer, IPlayer];

  // ── Scenes ───────────────────────────────────────────────────────────────

  private readonly boardScene: Board;
  private readonly hudScene: HUD;

  // ── Presentation ─────────────────────────────────────────────────────────

  private readonly choreographer: AnimationChoreographer;
  private readonly tokenRenderer: PlaceholderTokenRenderer;
  private readonly regionRenderer: RegionRenderer;
  private readonly tooltip: TooltipRenderer;

  // ── Event routing ────────────────────────────────────────────────────────

  /** Shared bus: Board/HUD emit → HumanPlayer listens. */
  readonly eventBus: Phaser.Events.EventEmitter;

  // ── Runtime ──────────────────────────────────────────────────────────────

  private legalActions: readonly GameAction[] = [];
  private selectedRegionId: number | null = null;
  private running = false;

  constructor(
    boardScene: Board,
    hudScene: HUD,
    eventBus: Phaser.Events.EventEmitter,
    config: GameControllerConfig,
  ) {
    this.boardScene = boardScene;
    this.hudScene = hudScene;
    this.eventBus = eventBus;
    this.players = config.players;
    this.state = createInitialState({ firstPlayerIndex: config.firstPlayerIndex });

    const audio = new StubAudioManager();
    this.choreographer = new AnimationChoreographer(
      boardScene, audio, config.animationSpeed ?? 1.0,
    );
    this.tokenRenderer = new PlaceholderTokenRenderer(boardScene);
    this.regionRenderer = new RegionRenderer(boardScene);
    this.tooltip = new TooltipRenderer(boardScene);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Start the game loop. Returns a Promise that resolves when the game ends.
   * The loop runs until `state.phase === 'gameOver'` or `stop()` is called.
   */
  async start(): Promise<void> {
    this.running = true;

    // Bridge HUD action button → shared eventBus
    this.hudScene.events.on('playerAction', (action: GameAction) => {
      this.eventBus.emit('playerAction', action);
    });

    // Bridge Board region clicks → shared eventBus (convert to legal action)
    this.boardScene.events.on('regionClick', ({ regionId }: RegionEvent) => {
      this._onRegionClick(regionId);
    });

    // Bridge Board region hover → tooltip
    this.boardScene.events.on('regionHover', ({ regionId }: RegionEvent) => {
      const p = this.boardScene.input.activePointer;
      this.tooltip.showRegionTooltip(regionId, p.worldX, p.worldY);
    });
    this.boardScene.events.on('regionOut', () => {
      this.tooltip.showRegionTooltip(null, 0, 0);
    });

    while (this.running && this.state.phase !== 'gameOver') {
      await this._tick();
    }

    this._onGameOver();
  }

  /** Halt the game loop (e.g. when navigating away). */
  stop(): void {
    this.running = false;
    this.tokenRenderer.destroy();
    this.regionRenderer.destroy();
    this.tooltip.destroy();
    this.hudScene.events.off('playerAction');
    this.boardScene.events.off('regionClick');
    this.boardScene.events.off('regionHover');
    this.boardScene.events.off('regionOut');
  }

  /** Call this from the hosting Phaser scene's update() to pulse glow and move tooltip. */
  update(time: number): void {
    this.regionRenderer.update(time);
    const p = this.boardScene.input.activePointer;
    this.tooltip.updatePosition(p.worldX, p.worldY);
  }

  // ── Private game loop ────────────────────────────────────────────────────

  private async _tick(): Promise<void> {
    // Roll reinforcement die on first tick of that phase
    if (this.state.phase === 'reinforcementDie' && !this.state.reinforcementDie) {
      const result = rollReinforcementDie();
      this.state = { ...this.state, reinforcementDie: { result, targetRegionId: null } };
      await this.choreographer.animateDieRoll();
    }

    this.legalActions = getLegalActions(this.state);
    this._renderState();

    const player = this.players[this.state.activePlayerIndex];
    const action = await player.chooseAction(this.state, this.legalActions);

    await this.choreographer.playAction(action);
    this.state = applyAction(this.state, action);

    this.selectedRegionId = null;
  }

  private _renderState(): void {
    this.hudScene.refresh(this.state);
    this.tokenRenderer.render(this.state);

    // Collect valid conquest/reinforcement target IDs for the glow overlay
    const validTargetIds = new Set<number>();
    for (const a of this.legalActions) {
      if ((a.type === 'conquer' || a.type === 'useReinforcement') && 'regionId' in a) {
        validTargetIds.add((a as { regionId: number }).regionId);
      }
    }

    this.regionRenderer.render(this.state, validTargetIds, this.selectedRegionId);
    this.tooltip.setGameState(this.state);
  }

  /** Convert a Board region-click into a playerAction event if it is legal. */
  private _onRegionClick(regionId: number): void {
    const action = this.legalActions.find(
      (a) =>
        (a.type === 'conquer' || a.type === 'useReinforcement') &&
        (a as { regionId: number }).regionId === regionId,
    );
    if (action) {
      this.selectedRegionId = regionId;
      this.eventBus.emit('playerAction', action);
    }
  }

  private _onGameOver(): void {
    // Final render pass to show end state
    this.hudScene.refresh(this.state);
    this.tokenRenderer.render(this.state);
    this.regionRenderer.render(this.state, new Set(), null);
  }
}
