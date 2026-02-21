import type { GameState, GameAction } from '@/game/state/types';

export interface IPlayer {
  readonly type: 'human' | 'ai';
  readonly name: string;
  /**
   * Choose an action from the provided legal actions for the current state.
   * Returns a Promise so human input (UI events) and AI computation are
   * handled through the same async interface.
   */
  chooseAction(state: GameState, legalActions: readonly GameAction[]): Promise<GameAction>;
}

/** Minimal typed event bus interface — satisfied by Phaser.Events.EventEmitter. */
export interface ActionEventBus {
  once(event: 'playerAction', callback: (action: GameAction) => void): void;
  off(event: 'playerAction', callback: (action: GameAction) => void): void;
}
