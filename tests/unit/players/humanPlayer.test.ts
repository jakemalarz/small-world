import { describe, it, expect, vi } from 'vitest';
import { HumanPlayer } from '@/game/players/HumanPlayer';
import type { ActionEventBus } from '@/game/players/IPlayer';
import type { GameAction } from '@/game/state/types';

/** Minimal ActionEventBus for testing — no Phaser required. */
function makeEventBus(): ActionEventBus & {
  emit(action: GameAction): void;
} {
  const handlers = new Map<string, ((a: GameAction) => void)[]>();
  return {
    once(event, cb) {
      if (!handlers.has(event)) handlers.set(event, []);
      handlers.get(event)!.push(cb as (a: GameAction) => void);
    },
    off(event, cb) {
      const list = handlers.get(event) ?? [];
      const idx = list.indexOf(cb as (a: GameAction) => void);
      if (idx !== -1) list.splice(idx, 1);
    },
    emit(action) {
      const list = handlers.get('playerAction') ?? [];
      const handler = list.shift();
      if (handler) handler(action);
    },
  };
}

describe('HumanPlayer', () => {
  it('has type "human"', () => {
    const bus = makeEventBus();
    const player = new HumanPlayer('Alice', bus);
    expect(player.type).toBe('human');
    expect(player.name).toBe('Alice');
  });

  it('resolves chooseAction when playerAction is emitted', async () => {
    const bus = makeEventBus();
    const player = new HumanPlayer('Alice', bus);

    const action: GameAction = { type: 'endPhase' };
    const promise = player.chooseAction({} as never, []);

    // Emit the action asynchronously
    setTimeout(() => bus.emit(action), 0);

    const result = await promise;
    expect(result).toEqual(action);
  });

  it('resolves with the exact action emitted', async () => {
    const bus = makeEventBus();
    const player = new HumanPlayer('Bob', bus);

    const action: GameAction = { type: 'selectCombo', comboIndex: 2 };
    const promise = player.chooseAction({} as never, []);

    setTimeout(() => bus.emit(action), 0);
    const result = await promise;
    expect(result.type).toBe('selectCombo');
    expect((result as Extract<GameAction, { type: 'selectCombo' }>).comboIndex).toBe(2);
  });

  it('registers a one-time listener (not reused on second call)', async () => {
    const bus = makeEventBus();
    const onceSpy = vi.fn(bus.once.bind(bus));
    const spiedBus: ActionEventBus & { emit(a: GameAction): void } = {
      once: onceSpy,
      off: bus.off.bind(bus),
      emit: bus.emit.bind(bus),
    };

    const player = new HumanPlayer('Carol', spiedBus);
    const action: GameAction = { type: 'endPhase' };

    const p1 = player.chooseAction({} as never, []);
    setTimeout(() => spiedBus.emit(action), 0);
    await p1;

    const p2 = player.chooseAction({} as never, []);
    setTimeout(() => spiedBus.emit(action), 0);
    await p2;

    // once() should have been called twice — once per chooseAction call
    expect(onceSpy).toHaveBeenCalledTimes(2);
  });
});
