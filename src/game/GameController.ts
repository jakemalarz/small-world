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
  /** True while the controller is blocked waiting for a player action (e2e sync point). */
  readyForInput = false;
  /** True when combo shop is open in browse-only mode (FR-54). */
  private _browseMode = false;
  /** True when pan-only mode is active (FR-60). */
  private _panMode = false;
  /** Mutable deployment map for interactive redeployment (FR-57). */
  private _redeployMap: Map<number, number> = new Map();
  /** Tokens remaining in hand during redeployment. */
  private _redeployTokensInHand = 0;
  /** True after redeploy submission — next tick should auto-advance with endPhase. */
  private _redeploySubmitted = false;

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
      // FR-57: intercept endPhase during redeploy to submit deployment map
      if (action.type === 'endPhase' && this.state.phase === 'redeploy' && this._redeployMap.size > 0) {
        this._redeploySubmitted = true;
        this.eventBus.emit('playerAction', { type: 'redeploy', deployment: new Map(this._redeployMap) });
        this._redeployMap.clear();
        this._redeployTokensInHand = 0;
        return;
      }
      this.eventBus.emit('playerAction', action);
    });

    // Browse mode events (FR-54)
    this.hudScene.events.on('browseComboOpen', () => {
      this._browseMode = true;
      this._renderState();
    });
    this.hudScene.events.on('browseComboClose', () => {
      this._browseMode = false;
      this._renderState();
    });

    // Pan mode toggle (FR-60)
    this.hudScene.events.on('panModeChanged', (panMode: boolean) => {
      this._panMode = panMode;
      this._renderState();
    });

    // Bridge Board region clicks → shared eventBus (convert to legal action)
    this.boardScene.events.on('regionClick', ({ regionId }: RegionEvent) => {
      this._onRegionClick(regionId);
    });

    // Right-click for redeploy token removal (FR-57)
    this.boardScene.events.on('regionRightClick', ({ regionId }: RegionEvent) => {
      this._onRegionRightClick(regionId);
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
    this.boardScene.events.off('regionRightClick');
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
      await this.choreographer.animateDieRoll(result);
    }

    // After redeploy submission, auto-advance with endPhase (FR-57)
    if (this.state.phase === 'redeploy' && this._redeploySubmitted) {
      this._redeploySubmitted = false;
      this.state = applyAction(this.state, { type: 'endPhase' });
      return;
    }

    // Initialize redeployment map when entering redeploy phase (FR-57)
    if (this.state.phase === 'redeploy' && this._redeployMap.size === 0) {
      this._initRedeployMap();
    }

    this.legalActions = getLegalActions(this.state);
    this._renderState();

    const player = this.players[this.state.activePlayerIndex];
    this.readyForInput = true;
    const action = await player.chooseAction(this.state, this.legalActions);
    this.readyForInput = false;

    await this.choreographer.playAction(action);
    this.state = applyAction(this.state, action);

    this.selectedRegionId = null;

    // Clear redeploy state if phase changed away from redeploy
    if (this.state.phase !== 'redeploy') {
      this._redeployMap.clear();
      this._redeployTokensInHand = 0;
      this._redeploySubmitted = false;
    }
  }

  private _renderState(): void {
    this.hudScene.refresh(this.state);
    this.tokenRenderer.render(this.state);

    // Disable Board interactions while combo shop HUD is open (FR-55)
    const shopOpen = this.state.phase === 'selectCombo' || this._browseMode;
    this.boardScene.input.enabled = !shopOpen;
    if (shopOpen) this.tooltip.showRegionTooltip(null, 0, 0);

    // Collect valid conquest/reinforcement target IDs for the glow overlay
    const validTargetIds = new Set<number>();
    for (const a of this.legalActions) {
      if ((a.type === 'conquer' || a.type === 'useReinforcement') && 'regionId' in a) {
        validTargetIds.add((a as { regionId: number }).regionId);
      }
    }

    // Detect first conquest: active player has no tokens on board yet (FR-56)
    const activePlayer = this.state.players[this.state.activePlayerIndex];
    const isFirstConquest = this.state.phase === 'conquest' &&
      activePlayer.activeRace !== null &&
      activePlayer.activeRace.tokensOnBoard === 0;

    this.regionRenderer.render(this.state, validTargetIds, this.selectedRegionId, isFirstConquest);
    this.tooltip.setGameState(this.state);
  }

  /** Convert a Board region-click into a playerAction event if it is legal. */
  private _onRegionClick(regionId: number): void {
    // FR-60: pan mode suppresses all region interactions
    if (this._panMode) return;

    // FR-57: left-click during redeploy adds a token
    if (this.state.phase === 'redeploy') {
      this._redeployAddToken(regionId);
      return;
    }

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

  /** FR-57: right-click during redeploy removes a token. */
  private _onRegionRightClick(regionId: number): void {
    if (this._panMode) return;
    if (this.state.phase !== 'redeploy') return;
    this._redeployRemoveToken(regionId);
  }

  /** Initialize the deployment map from current board state. */
  private _initRedeployMap(): void {
    this._redeployMap.clear();
    const player = this.state.players[this.state.activePlayerIndex];
    this._redeployTokensInHand = player.availableTokens;

    for (const region of this.state.board.regions) {
      if (region.owner === this.state.activePlayerIndex && !region.isDeclined) {
        this._redeployMap.set(region.id, region.tokens);
      }
    }
  }

  /** Add one token to a region during redeployment. */
  private _redeployAddToken(regionId: number): void {
    if (this._redeployTokensInHand <= 0) return;
    const current = this._redeployMap.get(regionId);
    if (current === undefined) return; // not an owned active region
    this._redeployMap.set(regionId, current + 1);
    this._redeployTokensInHand--;
    this._renderRedeployPreview();
  }

  /** Remove one token from a region during redeployment (min 1). */
  private _redeployRemoveToken(regionId: number): void {
    const current = this._redeployMap.get(regionId);
    if (current === undefined || current <= 1) return; // must leave at least 1
    this._redeployMap.set(regionId, current - 1);
    this._redeployTokensInHand++;
    this._renderRedeployPreview();
  }

  /** Update token display with redeployment preview. */
  private _renderRedeployPreview(): void {
    // Create a temporary preview state to reflect the deploy map
    const newRegions = this.state.board.regions.map((r) => {
      const count = this._redeployMap.get(r.id);
      if (count !== undefined) return { ...r, tokens: count };
      return r;
    });
    const previewState = {
      ...this.state,
      board: { regions: newRegions },
      players: this.state.players.map((p, i) =>
        i === this.state.activePlayerIndex
          ? { ...p, availableTokens: this._redeployTokensInHand }
          : p,
      ) as [typeof this.state.players[0], typeof this.state.players[1]],
    };
    this.hudScene.refresh(previewState);
    this.tokenRenderer.render(previewState);
    this.regionRenderer.render(previewState, new Set(), null);
  }

  private _onGameOver(): void {
    // Final render pass to show end state
    this.hudScene.refresh(this.state);
    this.tokenRenderer.render(this.state);
    this.regionRenderer.render(this.state, new Set(), null);
  }
}
