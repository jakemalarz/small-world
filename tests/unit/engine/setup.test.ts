import { describe, it, expect } from 'vitest';
import { createInitialState } from '@/game/engine/setup';
import { MAP_2P } from '@/game/data/map2p';

describe('createInitialState', () => {
  it('returns a GameState with phase selectCombo and turn 1', () => {
    const state = createInitialState();
    expect(state.phase).toBe('selectCombo');
    expect(state.turn).toBe(1);
    expect(state.round).toBe(0);
  });

  it('gives each player 5 coins', () => {
    const state = createInitialState();
    expect(state.players[0].coins).toBe(5);
    expect(state.players[1].coins).toBe(5);
  });

  it('both players start with no active race', () => {
    const state = createInitialState();
    expect(state.players[0].activeRace).toBeNull();
    expect(state.players[1].activeRace).toBeNull();
  });

  it('combo shop has exactly 6 visible slots', () => {
    const state = createInitialState();
    expect(state.comboShop.visible).toHaveLength(6);
  });

  it('all visible combo slots have coinsOnSlot = 0', () => {
    const state = createInitialState();
    for (const slot of state.comboShop.visible) {
      expect(slot.coinsOnSlot).toBe(0);
    }
  });

  it('remaining race deck has 14 - 6 = 8 cards', () => {
    const state = createInitialState();
    expect(state.comboShop.raceDeck).toHaveLength(8);
  });

  it('remaining power deck has 18 - 6 = 12 cards', () => {
    const state = createInitialState();
    expect(state.comboShop.powerDeck).toHaveLength(12);
  });

  it('no race or power appears twice across shop + remaining deck', () => {
    const state = createInitialState();
    const allRaces = [
      ...state.comboShop.visible.map((s) => s.raceId),
      ...state.comboShop.raceDeck,
    ];
    const allPowers = [
      ...state.comboShop.visible.map((s) => s.powerId),
      ...state.comboShop.powerDeck,
    ];
    expect(new Set(allRaces).size).toBe(allRaces.length);
    expect(new Set(allPowers).size).toBe(allPowers.length);
  });

  it('board has exactly 23 regions', () => {
    const state = createInitialState();
    expect(state.board.regions).toHaveLength(23);
  });

  it('all board regions start with owner=null and tokens=0', () => {
    const state = createInitialState();
    for (const region of state.board.regions) {
      expect(region.owner).toBeNull();
      expect(region.tokens).toBe(0);
      expect(region.isDeclined).toBe(false);
    }
  });

  it('lost tribe regions are placed correctly from map data', () => {
    const state = createInitialState();
    const mapLostTribes = MAP_2P.regions.filter((r) => r.hasLostTribe).map((r) => r.id);
    const stateLostTribes = state.board.regions.filter((r) => r.hasLostTribe).map((r) => r.id);
    expect(stateLostTribes.sort()).toEqual(mapLostTribes.sort());
  });

  it('mine, magic source, underworld features match map data', () => {
    const state = createInitialState();
    for (const mapRegion of MAP_2P.regions) {
      const stateRegion = state.board.regions.find((r) => r.id === mapRegion.id)!;
      expect(stateRegion.hasMine).toBe(mapRegion.hasMine);
      expect(stateRegion.hasMagicSource).toBe(mapRegion.hasMagicSource);
      expect(stateRegion.hasUnderworld).toBe(mapRegion.hasUnderworld);
    }
  });

  it('firstPlayerIndex is 0 or 1', () => {
    const state = createInitialState();
    expect([0, 1]).toContain(state.firstPlayerIndex);
    expect(state.activePlayerIndex).toBe(state.firstPlayerIndex);
  });

  it('respects explicit firstPlayerIndex config', () => {
    const state0 = createInitialState({ firstPlayerIndex: 0 });
    const state1 = createInitialState({ firstPlayerIndex: 1 });
    expect(state0.firstPlayerIndex).toBe(0);
    expect(state1.firstPlayerIndex).toBe(1);
  });

  it('reinforcementDie starts null', () => {
    const state = createInitialState();
    expect(state.reinforcementDie).toBeNull();
  });

  it('log starts empty', () => {
    const state = createInitialState();
    expect(state.log).toHaveLength(0);
  });
});
