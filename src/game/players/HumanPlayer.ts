import type { GameState, GameAction } from '@/game/state/types';
import type { IPlayer, ActionEventBus } from '@/game/players/IPlayer';

/**
 * Human player — resolves chooseAction() when the UI emits a 'playerAction'
 * event on the shared event bus. The Board and HUD scenes are responsible
 * for only emitting actions that are in the current legalActions list.
 */
export class HumanPlayer implements IPlayer {
  readonly type = 'human' as const;
  readonly name: string;
  private readonly eventBus: ActionEventBus;

  constructor(name: string, eventBus: ActionEventBus) {
    this.name = name;
    this.eventBus = eventBus;
  }

  chooseAction(
    _state: GameState,
    _legalActions: readonly GameAction[],
  ): Promise<GameAction> {
    return new Promise<GameAction>((resolve) => {
      const handler = (action: GameAction): void => {
        resolve(action);
      };
      this.eventBus.once('playerAction', handler);
    });
  }
}
