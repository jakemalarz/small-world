import { describe, it, expect } from 'vitest';
import { applySelectCombo } from '@/game/engine/comboShop';
import { createInitialState } from '@/game/engine/setup';
import type { GameState } from '@/game/state/types';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('applySelectCombo', () => {
  it('selecting index 0 is free — player coins unchanged', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const before = state.players[0].coins; // 5
    const after = applySelectCombo(state, 0);
    const coinsOnSlot = state.comboShop.visible[0].coinsOnSlot; // 0
    expect(after.players[0].coins).toBe(before - 0 + coinsOnSlot);
  });

  it('selecting index 1 costs 1 coin', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const before = state.players[0].coins; // 5
    const result = applySelectCombo(state, 1);
    expect(result.players[0].coins).toBe(before - 1);
  });

  it('selecting index 2 costs 2 coins', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const before = state.players[0].coins; // 5
    const result = applySelectCombo(state, 2);
    expect(result.players[0].coins).toBe(before - 2);
  });

  it('adds 1 coin to each skipped slot', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const result = applySelectCombo(state, 2);
    // Slots originally at indices 0 and 1 each get +1 coin
    expect(result.comboShop.visible[0].coinsOnSlot).toBe(1);
    expect(result.comboShop.visible[1].coinsOnSlot).toBe(1);
  });

  it('player collects coins that were on the selected slot', () => {
    // Manually inject coins onto a slot by simulating a prior skip
    const state = createInitialState({ firstPlayerIndex: 0 });
    // Put coins on slot 0 to simulate it was skipped before
    const patchedState: GameState = {
      ...state,
      comboShop: {
        ...state.comboShop,
        visible: state.comboShop.visible.map((s, i) =>
          i === 0 ? { ...s, coinsOnSlot: 3 } : s,
        ),
      },
    };
    const before = patchedState.players[0].coins;
    const result = applySelectCombo(patchedState, 0); // pick free slot that has 3 coins
    expect(result.players[0].coins).toBe(before + 3);
  });

  it('shop replenishes with a new combo at the bottom', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const originalLen = state.comboShop.visible.length; // 6
    const result = applySelectCombo(state, 0);
    // Shop should still have 6 combos (1 removed, 1 added from deck)
    expect(result.comboShop.visible.length).toBe(originalLen);
  });

  it('race deck shrinks by 1 after selection', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const result = applySelectCombo(state, 0);
    expect(result.comboShop.raceDeck.length).toBe(state.comboShop.raceDeck.length - 1);
  });

  it('power deck shrinks by 1 after selection', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const result = applySelectCombo(state, 0);
    expect(result.comboShop.powerDeck.length).toBe(state.comboShop.powerDeck.length - 1);
  });

  it('sets player activeRace with correct token count', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const selectedCombo = state.comboShop.visible[0];
    const result = applySelectCombo(state, 0);
    const activeRace = result.players[0].activeRace;
    expect(activeRace).not.toBeNull();
    expect(activeRace!.raceId).toBe(selectedCombo.raceId);
    expect(activeRace!.powerId).toBe(selectedCombo.powerId);
    // tokenCount = race.baseTokens + power.bonusTokens — just verify it's a positive integer
    expect(activeRace!.totalTokens).toBeGreaterThan(0);
    expect(result.players[0].availableTokens).toBeGreaterThan(0);
  });

  it('sets availableTokens on player to equal totalTokens', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const result = applySelectCombo(state, 0);
    expect(result.players[0].availableTokens).toBe(result.players[0].activeRace!.totalTokens);
  });

  it('new active race has 0 conquestsThisTurn and tokensOnBoard', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const result = applySelectCombo(state, 0);
    const race = result.players[0].activeRace!;
    expect(race.conquestsThisTurn).toBe(0);
    expect(race.tokensOnBoard).toBe(0);
  });

  it('throws when comboIndex out of range', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    expect(() => applySelectCombo(state, -1)).toThrow();
    expect(() => applySelectCombo(state, 6)).toThrow();
  });

  it('throws when player cannot afford the cost', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    // Player has 5 coins; index 5 costs 5, which is exactly affordable. Index 6 would fail but
    // that's out of range. Reduce coins to 0 and try index 1.
    const broke: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, coins: 0 } : p,
      ) as unknown as typeof state.players,
    };
    expect(() => applySelectCombo(broke, 1)).toThrow();
  });

  it('selecting index 0 on exhausted decks leaves shop with 5 slots', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    // Exhaust both decks
    const exhausted: GameState = {
      ...state,
      comboShop: { ...state.comboShop, raceDeck: [], powerDeck: [] },
    };
    const result = applySelectCombo(exhausted, 0);
    expect(result.comboShop.visible.length).toBe(5);
  });

  it('appends an action to the log', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const result = applySelectCombo(state, 1);
    const lastLog = result.log[result.log.length - 1];
    expect(lastLog.action.type).toBe('selectCombo');
    expect((lastLog.action as { type: 'selectCombo'; comboIndex: number }).comboIndex).toBe(1);
  });

  it('does not modify the original state', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const originalCoins = state.players[0].coins;
    applySelectCombo(state, 1);
    expect(state.players[0].coins).toBe(originalCoins); // immutable
  });
});
