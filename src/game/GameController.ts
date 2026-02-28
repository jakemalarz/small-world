import Phaser from 'phaser';
import type { GameState, GameAction } from '@/game/state/types';
import type { IPlayer } from '@/game/players/IPlayer';
import type { Board, RegionEvent } from '@/game/scenes/Board';
import type { HUD } from '@/game/scenes/HUD';
import { createInitialState } from '@/game/engine/setup';
import { getLegalActions } from '@/game/engine/legalActions';
import { applyAction } from '@/game/engine/actions';
import { rollReinforcementDie, ghoulConquestCost } from '@/game/engine/reinforcementDie';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { getActiveModifiers } from '@/game/abilities/modifiers';
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
  /** Mutable map for interactive token gathering during readyTroops (FR-13a/b). */
  private _gatherMap: Map<number, number> = new Map();
  /** Tokens in hand during gathering. */
  private _gatherTokensInHand = 0;
  /** True after gather submission — next tick should auto-advance with endPhase. */
  private _gatherSubmitted = false;
  /** True while the abandon confirmation dialog is showing. */
  private _abandonDialogActive = false;
  /** First selected hero region during placeHeroes phase. */
  private _heroFirstRegion: number | null = null;
  /** Mutable map for Ghoul token gathering during ghoulReadyTroops. */
  private _ghoulGatherMap: Map<number, number> = new Map();
  /** Ghoul tokens in hand during gathering. */
  private _ghoulGatherTokensInHand = 0;
  /** True after Ghoul gather submission. */
  private _ghoulGatherSubmitted = false;
  /** Mutable deployment map for Ghoul redeployment. */
  private _ghoulRedeployMap: Map<number, number> = new Map();
  /** Ghoul tokens remaining in hand during redeployment. */
  private _ghoulRedeployTokensInHand = 0;
  /** True after Ghoul redeploy submission. */
  private _ghoulRedeploySubmitted = false;

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
      // FR-13a/b: intercept endPhase during readyTroops to submit gather map
      if (action.type === 'endPhase' && this.state.phase === 'readyTroops' && this._gatherMap.size > 0) {
        this._gatherSubmitted = true;
        this.eventBus.emit('playerAction', { type: 'readyTroopsDeploy', deployment: new Map(this._gatherMap) });
        this._gatherMap.clear();
        this._gatherTokensInHand = 0;
        return;
      }
      // Ghoul gather: intercept endPhase during ghoulReadyTroops
      if (action.type === 'endPhase' && this.state.phase === 'ghoulReadyTroops' && this._ghoulGatherMap.size > 0) {
        this._ghoulGatherSubmitted = true;
        this.eventBus.emit('playerAction', { type: 'ghoulReadyTroopsDeploy', deployment: new Map(this._ghoulGatherMap) });
        this._ghoulGatherMap.clear();
        this._ghoulGatherTokensInHand = 0;
        return;
      }
      // Ghoul redeploy: intercept endPhase during ghoulRedeploy
      if (action.type === 'endPhase' && this.state.phase === 'ghoulRedeploy' && this._ghoulRedeployMap.size > 0) {
        this._ghoulRedeploySubmitted = true;
        this.eventBus.emit('playerAction', { type: 'ghoulRedeploy', deployment: new Map(this._ghoulRedeployMap) });
        this._ghoulRedeployMap.clear();
        this._ghoulRedeployTokensInHand = 0;
        return;
      }
      // Remap Final Conquest button to ghoul version during ghoulConquest
      if (action.type === 'startFinalConquest' && this.state.phase === 'ghoulConquest') {
        this.eventBus.emit('playerAction', { type: 'startGhoulFinalConquest' });
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
    // After redeploy submission, auto-advance with endPhase (FR-57)
    if (this.state.phase === 'redeploy' && this._redeploySubmitted) {
      this._redeploySubmitted = false;
      this.state = applyAction(this.state, { type: 'endPhase' });
      return;
    }

    // After gather submission, auto-advance with endPhase (FR-13a/b)
    if (this.state.phase === 'readyTroops' && this._gatherSubmitted) {
      this._gatherSubmitted = false;
      this.state = applyAction(this.state, { type: 'endPhase' });
      return;
    }

    // After Ghoul gather submission, auto-advance
    if (this.state.phase === 'ghoulReadyTroops' && this._ghoulGatherSubmitted) {
      this._ghoulGatherSubmitted = false;
      this.state = applyAction(this.state, { type: 'endPhase' });
      return;
    }

    // After Ghoul redeploy submission, auto-advance
    if (this.state.phase === 'ghoulRedeploy' && this._ghoulRedeploySubmitted) {
      this._ghoulRedeploySubmitted = false;
      this.state = applyAction(this.state, { type: 'endPhase' });
      return;
    }

    // Initialize redeployment map when entering redeploy phase (FR-57)
    if (this.state.phase === 'redeploy' && this._redeployMap.size === 0) {
      this._initRedeployMap();
    }

    // Initialize gather map when entering readyTroops phase (FR-13a/b)
    // Only for human players — AI uses pickUpTokens actions directly
    if (this.state.phase === 'readyTroops' && this._gatherMap.size === 0
      && this.players[this.state.activePlayerIndex].type === 'human') {
      this._initGatherMap();
    }

    // Initialize Ghoul gather map when entering ghoulReadyTroops
    if (this.state.phase === 'ghoulReadyTroops' && this._ghoulGatherMap.size === 0
      && this.players[this.state.activePlayerIndex].type === 'human') {
      this._initGhoulGatherMap();
    }

    // Initialize Ghoul redeploy map when entering ghoulRedeploy
    if (this.state.phase === 'ghoulRedeploy' && this._ghoulRedeployMap.size === 0) {
      this._initGhoulRedeployMap();
    }

    this.legalActions = getLegalActions(this.state);
    this._renderState();

    const player = this.players[this.state.activePlayerIndex];
    this.readyForInput = true;
    const action = await player.chooseAction(this.state, this.legalActions);
    this.readyForInput = false;

    // AI reinforcement die resolution: roll actual die for AI
    let resolvedAction: GameAction = action;
    if (action.type === 'useReinforcement' && this.state.phase === 'reinforcementDie' && !this.state.reinforcementDie) {
      const dieResult = rollReinforcementDie();
      const cost = calculateConquestCost(this.state, action.regionId);
      const aiPlayer = this.state.players[this.state.activePlayerIndex];
      if (aiPlayer.availableTokens + dieResult >= cost) {
        resolvedAction = { ...action, dieResult };
      } else {
        resolvedAction = { type: 'endPhase' };
      }
    }
    if (action.type === 'ghoulUseReinforcement' && this.state.phase === 'ghoulReinforcementDie' && !this.state.reinforcementDie) {
      const dieResult = rollReinforcementDie();
      const region = this.state.board.regions.find((r) => r.id === action.regionId);
      const cost = region ? ghoulConquestCost(region) : Infinity;
      const aiPlayer = this.state.players[this.state.activePlayerIndex];
      if (aiPlayer.availableTokens + dieResult >= cost) {
        resolvedAction = { ...action, dieResult };
      } else {
        resolvedAction = { type: 'endPhase' };
      }
    }

    // Berserk: AI conquer actions need die roll resolution
    if (action.type === 'conquer' && this.state.phase === 'conquest') {
      const activePlayer = this.state.players[this.state.activePlayerIndex];
      const mods = getActiveModifiers(activePlayer);
      if (mods.berserkDie && action.dieResult === undefined) {
        const dieResult = rollReinforcementDie();
        const cost = calculateConquestCost(this.state, action.regionId);
        if (activePlayer.availableTokens + dieResult >= cost) {
          resolvedAction = { ...action, dieResult };
        } else {
          // Die roll failed — record the attempted region; AI moves to next action
          this.state = applyAction(this.state, { type: 'berserkFail', regionId: action.regionId });
          return;
        }
      }
    }

    await this.choreographer.playAction(resolvedAction);
    this.state = applyAction(this.state, resolvedAction);

    this.selectedRegionId = null;

    // Clear hero selection state if phase changed away from placeHeroes
    if (this.state.phase !== 'placeHeroes') {
      this._heroFirstRegion = null;
    }

    // Clear redeploy state if phase changed away from redeploy
    if (this.state.phase !== 'redeploy') {
      this._redeployMap.clear();
      this._redeployTokensInHand = 0;
      this._redeploySubmitted = false;
    }

    // Clear gather state if phase changed away from readyTroops
    if (this.state.phase !== 'readyTroops') {
      this._gatherMap.clear();
      this._gatherTokensInHand = 0;
      this._gatherSubmitted = false;
      this._abandonDialogActive = false;
    }

    // Clear Ghoul gather state if phase changed away from ghoulReadyTroops
    if (this.state.phase !== 'ghoulReadyTroops') {
      this._ghoulGatherMap.clear();
      this._ghoulGatherTokensInHand = 0;
      this._ghoulGatherSubmitted = false;
    }

    // Clear Ghoul redeploy state if phase changed away from ghoulRedeploy
    if (this.state.phase !== 'ghoulRedeploy') {
      this._ghoulRedeployMap.clear();
      this._ghoulRedeployTokensInHand = 0;
      this._ghoulRedeploySubmitted = false;
    }
  }

  private _renderState(): void {
    this.hudScene.refresh(this.state);
    this.tokenRenderer.render(this.state);

    // Disable Board interactions while combo shop HUD is open (FR-55)
    const shopOpen = this.state.phase === 'selectCombo' || this._browseMode;
    this.boardScene.input.enabled = !shopOpen;
    if (shopOpen) this.tooltip.showRegionTooltip(null, 0, 0);

    // Collect valid target IDs for the glow overlay
    const validTargetIds = new Set<number>();
    if (this.state.phase === 'readyTroops' && this._gatherMap.size > 0) {
      // Highlight owned active regions during gathering (FR-13a/b)
      for (const [id, count] of this._gatherMap) {
        if (count > 0) validTargetIds.add(id);
      }
    } else if (this.state.phase === 'placeHeroes') {
      // Highlight owned active regions during hero placement
      for (const r of this.state.board.regions) {
        if (r.owner === this.state.activePlayerIndex && !r.isDeclined) {
          validTargetIds.add(r.id);
        }
      }
    } else {
      for (const a of this.legalActions) {
        if ((a.type === 'conquer' || a.type === 'useReinforcement' ||
             a.type === 'ghoulConquer' || a.type === 'ghoulUseReinforcement') && 'regionId' in a) {
          validTargetIds.add((a as { regionId: number }).regionId);
        }
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

    // FR-13a/b: left-click during readyTroops adds a token back to region
    if (this.state.phase === 'readyTroops' && this._gatherMap.size > 0) {
      this._gatherAddToken(regionId);
      return;
    }

    // Ghoul readyTroops: left-click adds a token back
    if (this.state.phase === 'ghoulReadyTroops' && this._ghoulGatherMap.size > 0) {
      this._ghoulGatherAddToken(regionId);
      return;
    }

    // FR-57: left-click during redeploy adds a token
    if (this.state.phase === 'redeploy') {
      this._redeployAddToken(regionId);
      return;
    }

    // Ghoul redeploy: left-click adds a token
    if (this.state.phase === 'ghoulRedeploy') {
      this._ghoulRedeployAddToken(regionId);
      return;
    }

    // Heroic: select 2 regions for hero placement
    if (this.state.phase === 'placeHeroes') {
      this._heroRegionClick(regionId);
      return;
    }

    // Final conquest step 1: player selects target, then we roll the die
    if (this.state.phase === 'reinforcementDie' && !this.state.reinforcementDie) {
      const isValidTarget = this.legalActions.some(
        (a) => a.type === 'useReinforcement' && (a as { regionId: number }).regionId === regionId,
      );
      if (!isValidTarget) return;
      this._resolveFinalConquest(regionId);
      return;
    }

    // Ghoul final conquest step 1: same flow for ghouls
    if (this.state.phase === 'ghoulReinforcementDie' && !this.state.reinforcementDie) {
      const isValidTarget = this.legalActions.some(
        (a) => a.type === 'ghoulUseReinforcement' && (a as { regionId: number }).regionId === regionId,
      );
      if (!isValidTarget) return;
      this._resolveGhoulFinalConquest(regionId);
      return;
    }

    const action = this.legalActions.find(
      (a) =>
        (a.type === 'conquer' || a.type === 'useReinforcement' || a.type === 'ghoulConquer') &&
        (a as { regionId: number }).regionId === regionId,
    );
    if (action) {
      // Berserk: roll die before every conquest attempt
      if (action.type === 'conquer' && this.state.phase === 'conquest') {
        const player = this.state.players[this.state.activePlayerIndex];
        const mods = getActiveModifiers(player);
        if (mods.berserkDie) {
          this._resolveBerserkConquest(regionId);
          return;
        }
      }
      this.selectedRegionId = regionId;
      this.eventBus.emit('playerAction', action);
    }
  }

  /**
   * Final conquest: roll the die, animate, then resolve.
   * Success → emit useReinforcement. Failure → emit endPhase (→ redeploy).
   */
  private async _resolveFinalConquest(regionId: number): Promise<void> {
    const result = rollReinforcementDie();
    this.selectedRegionId = regionId;

    // Store die result on state so HUD can display it
    this.state = { ...this.state, reinforcementDie: { result, targetRegionId: regionId } };
    this._renderState();

    await this.choreographer.animateDieRoll(result);

    const player = this.state.players[this.state.activePlayerIndex];
    const cost = calculateConquestCost(this.state, regionId);

    if (player.availableTokens + result >= cost) {
      // Success — conquer the region
      this.eventBus.emit('playerAction', { type: 'useReinforcement', regionId, dieResult: result });
    } else {
      // Failure — skip to redeploy
      this.eventBus.emit('playerAction', { type: 'endPhase' });
    }
  }

  /**
   * Ghoul final conquest: roll die, animate, resolve for ghouls in decline.
   */
  private async _resolveGhoulFinalConquest(regionId: number): Promise<void> {
    const result = rollReinforcementDie();
    this.selectedRegionId = regionId;

    this.state = { ...this.state, reinforcementDie: { result, targetRegionId: regionId } };
    this._renderState();

    await this.choreographer.animateDieRoll(result);

    const player = this.state.players[this.state.activePlayerIndex];
    const region = this.state.board.regions.find((r) => r.id === regionId);
    if (!region) {
      this.eventBus.emit('playerAction', { type: 'endPhase' });
      return;
    }
    const cost = ghoulConquestCost(region);

    if (player.availableTokens + result >= cost) {
      this.eventBus.emit('playerAction', { type: 'ghoulUseReinforcement', regionId, dieResult: result });
    } else {
      this.eventBus.emit('playerAction', { type: 'endPhase' });
    }
  }

  /**
   * Berserk: roll the die for every conquest attempt.
   * Success → emit conquer with dieResult. Failure → nothing (player can try again).
   */
  private async _resolveBerserkConquest(regionId: number): Promise<void> {
    const result = rollReinforcementDie();
    this.selectedRegionId = regionId;

    // Store die result for HUD display
    this.state = { ...this.state, reinforcementDie: { result, targetRegionId: regionId } };
    this._renderState();

    await this.choreographer.animateDieRoll(result);

    const player = this.state.players[this.state.activePlayerIndex];
    const cost = calculateConquestCost(this.state, regionId);

    // Clear die display after resolution
    this.state = { ...this.state, reinforcementDie: null };

    if (player.availableTokens + result >= cost) {
      // Success — conquer the region with die assistance
      this.eventBus.emit('playerAction', { type: 'conquer', regionId, dieResult: result });
    } else {
      // Failure — record the attempted region; player cannot try it again this turn
      this.eventBus.emit('playerAction', { type: 'berserkFail', regionId });
    }
  }

  /** Heroic: handle region click during placeHeroes phase. */
  private _heroRegionClick(regionId: number): void {
    const region = this.state.board.regions.find((r) => r.id === regionId);
    if (!region || region.owner !== this.state.activePlayerIndex || region.isDeclined) return;

    if (this._heroFirstRegion === null) {
      // First hero selection
      this._heroFirstRegion = regionId;
      this.selectedRegionId = regionId;
      this._renderState();
    } else if (regionId !== this._heroFirstRegion) {
      // Second hero selection — emit the placeHeroes action
      const ids: [number, number] = this._heroFirstRegion < regionId
        ? [this._heroFirstRegion, regionId]
        : [regionId, this._heroFirstRegion];
      this._heroFirstRegion = null;
      this.eventBus.emit('playerAction', { type: 'placeHeroes', regionIds: ids });
    }
  }

  /** FR-57: right-click during redeploy removes a token.
   *  FR-13a/b: right-click during readyTroops gathers a token to hand. */
  private _onRegionRightClick(regionId: number): void {
    if (this._panMode) return;
    if (this.state.phase === 'readyTroops' && this._gatherMap.size > 0) {
      this._gatherRemoveToken(regionId);
      return;
    }
    if (this.state.phase === 'ghoulReadyTroops' && this._ghoulGatherMap.size > 0) {
      this._ghoulGatherRemoveToken(regionId);
      return;
    }
    if (this.state.phase === 'ghoulRedeploy') {
      this._ghoulRedeployRemoveToken(regionId);
      return;
    }
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

  // ── Gather (readyTroops) ─────────────────────────────────────────────────

  /** Initialize the gather map from current board state (FR-13a/b). */
  private _initGatherMap(): void {
    this._gatherMap.clear();
    const player = this.state.players[this.state.activePlayerIndex];
    this._gatherTokensInHand = player.availableTokens;

    for (const region of this.state.board.regions) {
      if (region.owner === this.state.activePlayerIndex && !region.isDeclined) {
        this._gatherMap.set(region.id, region.tokens);
      }
    }
  }

  /** Right-click: remove one token from a region to hand. Shows abandon confirm for last token. */
  private _gatherRemoveToken(regionId: number): void {
    if (this._abandonDialogActive) return;
    const current = this._gatherMap.get(regionId);
    if (current === undefined || current <= 0) return;

    if (current === 1) {
      // Last token — show confirmation dialog before abandoning
      this._showAbandonConfirm(regionId);
      return;
    }

    this._gatherMap.set(regionId, current - 1);
    this._gatherTokensInHand++;
    this._renderGatherPreview();
  }

  /** Left-click: add one token from hand back to a region. */
  private _gatherAddToken(regionId: number): void {
    if (this._abandonDialogActive) return;
    if (this._gatherTokensInHand <= 0) return;
    const current = this._gatherMap.get(regionId);
    if (current === undefined) return; // not an originally-owned region
    this._gatherMap.set(regionId, current + 1);
    this._gatherTokensInHand--;
    this._renderGatherPreview();
  }

  /** Update token display with gather preview. */
  private _renderGatherPreview(): void {
    const newRegions = this.state.board.regions.map((r) => {
      const count = this._gatherMap.get(r.id);
      if (count !== undefined) {
        if (count === 0) return { ...r, tokens: 0, owner: null };
        return { ...r, tokens: count };
      }
      return r;
    });
    const previewState = {
      ...this.state,
      board: { regions: newRegions },
      players: this.state.players.map((p, i) =>
        i === this.state.activePlayerIndex
          ? { ...p, availableTokens: this._gatherTokensInHand }
          : p,
      ) as [typeof this.state.players[0], typeof this.state.players[1]],
    };
    this.hudScene.refresh(previewState);
    this.tokenRenderer.render(previewState);
    // Highlight owned active regions with tokens as valid targets
    const validTargetIds = new Set<number>();
    for (const [id, count] of this._gatherMap) {
      if (count > 0) validTargetIds.add(id);
    }
    this.regionRenderer.render(previewState, validTargetIds, null);
  }

  /** Show abandon confirmation dialog (FR-13b). */
  private _showAbandonConfirm(regionId: number): void {
    this._abandonDialogActive = true;
    const W = 1280, H = 720;

    const overlay = this.hudScene.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.5)
      .setDepth(50).setInteractive(); // blocks clicks below

    const panel = this.hudScene.add.rectangle(W / 2, H / 2, 320, 130, 0x1e1e2e, 0.95)
      .setStrokeStyle(2, 0xef4444, 0.8).setDepth(51);

    const text = this.hudScene.add.text(W / 2, H / 2 - 25,
      'Abandon this region?\nAll tokens will be removed.', {
        fontSize: '14px', fontFamily: 'Arial', color: '#e8d5b7', align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(52);

    const confirmBg = this.hudScene.add.rectangle(W / 2 - 60, H / 2 + 30, 90, 28, 0xef4444)
      .setDepth(52).setInteractive({ useHandCursor: true });
    const confirmLabel = this.hudScene.add.text(W / 2 - 60, H / 2 + 30, 'Abandon', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(53);

    const cancelBg = this.hudScene.add.rectangle(W / 2 + 60, H / 2 + 30, 90, 28, 0x4a4a6a)
      .setDepth(52).setInteractive({ useHandCursor: true });
    const cancelLabel = this.hudScene.add.text(W / 2 + 60, H / 2 + 30, 'Cancel', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5, 0.5).setDepth(53);

    const cleanup = (): void => {
      overlay.destroy(); panel.destroy(); text.destroy();
      confirmBg.destroy(); confirmLabel.destroy();
      cancelBg.destroy(); cancelLabel.destroy();
      this._abandonDialogActive = false;
    };

    confirmBg.on('pointerdown', () => {
      cleanup();
      this._gatherMap.set(regionId, 0);
      this._gatherTokensInHand++;
      this._renderGatherPreview();
    });

    cancelBg.on('pointerdown', () => {
      cleanup();
    });
  }

  // ── Ghoul Gather (ghoulReadyTroops) ───────────────────────────────────────

  private _initGhoulGatherMap(): void {
    this._ghoulGatherMap.clear();
    const player = this.state.players[this.state.activePlayerIndex];
    this._ghoulGatherTokensInHand = player.availableTokens;

    for (const region of this.state.board.regions) {
      if (region.owner === this.state.activePlayerIndex && region.isDeclined) {
        this._ghoulGatherMap.set(region.id, region.tokens);
      }
    }
  }

  private _ghoulGatherRemoveToken(regionId: number): void {
    if (this._abandonDialogActive) return;
    const current = this._ghoulGatherMap.get(regionId);
    if (current === undefined || current <= 0) return;

    if (current === 1) {
      // Last token — show confirmation before abandoning (FR-13e)
      this._showGhoulGatherAbandonConfirm(regionId);
      return;
    }

    this._ghoulGatherMap.set(regionId, current - 1);
    this._ghoulGatherTokensInHand++;
    this._renderGhoulGatherPreview();
  }

  private _showGhoulGatherAbandonConfirm(regionId: number): void {
    this._abandonDialogActive = true;
    const W = 1280, _H = 720;

    const overlay = this.hudScene.add.rectangle(W / 2, _H / 2, W, _H, 0x000000, 0.5)
      .setDepth(50).setInteractive();

    const panel = this.hudScene.add.rectangle(W / 2, _H / 2, 320, 130, 0x1e1e2e, 0.95)
      .setStrokeStyle(2, 0xef4444, 0.8).setDepth(51);

    const text = this.hudScene.add.text(W / 2, _H / 2 - 25,
      'Abandon this region?\nAll tokens will be removed.', {
        fontSize: '14px', fontFamily: 'Arial', color: '#e8d5b7', align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(52);

    const confirmBg = this.hudScene.add.rectangle(W / 2 - 60, _H / 2 + 30, 90, 28, 0xef4444)
      .setDepth(52).setInteractive({ useHandCursor: true });
    const confirmLabel = this.hudScene.add.text(W / 2 - 60, _H / 2 + 30, 'Abandon', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(53);

    const cancelBg = this.hudScene.add.rectangle(W / 2 + 60, _H / 2 + 30, 90, 28, 0x4a4a6a)
      .setDepth(52).setInteractive({ useHandCursor: true });
    const cancelLabel = this.hudScene.add.text(W / 2 + 60, _H / 2 + 30, 'Cancel', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5, 0.5).setDepth(53);

    const cleanup = (): void => {
      overlay.destroy(); panel.destroy(); text.destroy();
      confirmBg.destroy(); confirmLabel.destroy();
      cancelBg.destroy(); cancelLabel.destroy();
      this._abandonDialogActive = false;
    };

    confirmBg.on('pointerdown', () => {
      cleanup();
      this._ghoulGatherMap.set(regionId, 0);
      this._ghoulGatherTokensInHand++;
      this._renderGhoulGatherPreview();
    });

    cancelBg.on('pointerdown', () => {
      cleanup();
    });
  }

  private _ghoulGatherAddToken(regionId: number): void {
    if (this._ghoulGatherTokensInHand <= 0) return;
    const current = this._ghoulGatherMap.get(regionId);
    if (current === undefined) return;
    this._ghoulGatherMap.set(regionId, current + 1);
    this._ghoulGatherTokensInHand--;
    this._renderGhoulGatherPreview();
  }

  private _renderGhoulGatherPreview(): void {
    const newRegions = this.state.board.regions.map((r) => {
      const count = this._ghoulGatherMap.get(r.id);
      if (count !== undefined) {
        if (count === 0) return { ...r, tokens: 0, owner: null, isDeclined: false };
        return { ...r, tokens: count };
      }
      return r;
    });
    const previewState = {
      ...this.state,
      board: { regions: newRegions },
      players: this.state.players.map((p, i) =>
        i === this.state.activePlayerIndex
          ? { ...p, availableTokens: this._ghoulGatherTokensInHand }
          : p,
      ) as [typeof this.state.players[0], typeof this.state.players[1]],
    };
    this.hudScene.refresh(previewState);
    this.tokenRenderer.render(previewState);
    const validTargetIds = new Set<number>();
    for (const [id, count] of this._ghoulGatherMap) {
      if (count > 0) validTargetIds.add(id);
    }
    this.regionRenderer.render(previewState, validTargetIds, null);
  }

  // ── Ghoul Redeploy (ghoulRedeploy) ──────────────────────────────────────

  private _initGhoulRedeployMap(): void {
    this._ghoulRedeployMap.clear();
    const player = this.state.players[this.state.activePlayerIndex];
    this._ghoulRedeployTokensInHand = player.availableTokens;

    for (const region of this.state.board.regions) {
      if (region.owner === this.state.activePlayerIndex && region.isDeclined) {
        this._ghoulRedeployMap.set(region.id, region.tokens);
      }
    }
  }

  private _ghoulRedeployAddToken(regionId: number): void {
    if (this._abandonDialogActive) return;
    if (this._ghoulRedeployTokensInHand <= 0) return;
    const current = this._ghoulRedeployMap.get(regionId);
    if (current === undefined) return;
    this._ghoulRedeployMap.set(regionId, current + 1);
    this._ghoulRedeployTokensInHand--;
    this._renderGhoulRedeployPreview();
  }

  private _ghoulRedeployRemoveToken(regionId: number): void {
    if (this._abandonDialogActive) return;
    const current = this._ghoulRedeployMap.get(regionId);
    if (current === undefined || current <= 0) return;

    if (current === 1) {
      // Last token — show confirmation dialog before abandoning
      this._showGhoulRedeployAbandonConfirm(regionId);
      return;
    }

    this._ghoulRedeployMap.set(regionId, current - 1);
    this._ghoulRedeployTokensInHand++;
    this._renderGhoulRedeployPreview();
  }

  private _showGhoulRedeployAbandonConfirm(regionId: number): void {
    this._abandonDialogActive = true;
    const W = 1280, _H = 720;

    const overlay = this.hudScene.add.rectangle(W / 2, _H / 2, W, _H, 0x000000, 0.5)
      .setDepth(50).setInteractive();

    const panel = this.hudScene.add.rectangle(W / 2, _H / 2, 320, 130, 0x1e1e2e, 0.95)
      .setStrokeStyle(2, 0xef4444, 0.8).setDepth(51);

    const text = this.hudScene.add.text(W / 2, _H / 2 - 25,
      'Abandon this region?\nAll tokens will be removed.', {
        fontSize: '14px', fontFamily: 'Arial', color: '#e8d5b7', align: 'center',
      }).setOrigin(0.5, 0.5).setDepth(52);

    const confirmBg = this.hudScene.add.rectangle(W / 2 - 60, _H / 2 + 30, 90, 28, 0xef4444)
      .setDepth(52).setInteractive({ useHandCursor: true });
    const confirmLabel = this.hudScene.add.text(W / 2 - 60, _H / 2 + 30, 'Abandon', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff', fontStyle: 'bold',
    }).setOrigin(0.5, 0.5).setDepth(53);

    const cancelBg = this.hudScene.add.rectangle(W / 2 + 60, _H / 2 + 30, 90, 28, 0x4a4a6a)
      .setDepth(52).setInteractive({ useHandCursor: true });
    const cancelLabel = this.hudScene.add.text(W / 2 + 60, _H / 2 + 30, 'Cancel', {
      fontSize: '12px', fontFamily: 'Arial', color: '#ffffff',
    }).setOrigin(0.5, 0.5).setDepth(53);

    const cleanup = (): void => {
      overlay.destroy(); panel.destroy(); text.destroy();
      confirmBg.destroy(); confirmLabel.destroy();
      cancelBg.destroy(); cancelLabel.destroy();
      this._abandonDialogActive = false;
    };

    confirmBg.on('pointerdown', () => {
      cleanup();
      this._ghoulRedeployMap.set(regionId, 0);
      this._ghoulRedeployTokensInHand++;
      this._renderGhoulRedeployPreview();
    });

    cancelBg.on('pointerdown', () => {
      cleanup();
    });
  }

  private _renderGhoulRedeployPreview(): void {
    const newRegions = this.state.board.regions.map((r) => {
      const count = this._ghoulRedeployMap.get(r.id);
      if (count !== undefined) {
        if (count === 0) return { ...r, tokens: 0, owner: null, isDeclined: false };
        return { ...r, tokens: count };
      }
      return r;
    });
    const previewState = {
      ...this.state,
      board: { regions: newRegions },
      players: this.state.players.map((p, i) =>
        i === this.state.activePlayerIndex
          ? { ...p, availableTokens: this._ghoulRedeployTokensInHand }
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
