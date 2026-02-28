import { describe, it, expect } from 'vitest';
import { applyAction } from '@/game/engine/actions';
import { getLegalActions } from '@/game/engine/legalActions';
import { createInitialState } from '@/game/engine/setup';
import type { GameState, PlayerState, RegionState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchPlayer(state: GameState, idx: 0 | 1, patch: Partial<PlayerState>): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => (i === idx ? { ...p, ...patch } : p)) as unknown as typeof state.players,
  };
}

function patchRegion(state: GameState, id: number, patch: Partial<RegionState>): GameState {
  return {
    ...state,
    board: { regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
  };
}

function dragonState(): GameState {
  let state = createInitialState({ firstPlayerIndex: 0 });
  state = patchPlayer(state, 0, {
    activeRace: {
      raceId: 'humans' as never,
      powerId: 'dragonMaster' as never,
      maxSupply: 20,
      totalTokens: 10,
      tokensOnBoard: 3,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
      dragonUsedThisTurn: false,
    },
    availableTokens: 7,
  });
  state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
  state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
  return { ...state, phase: 'conquest' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Dragon Master rework', () => {
  it('conquers an empty region with 1 token via placeDragon', () => {
    const state = dragonState();
    const next = applyAction(state, { type: 'placeDragon', regionId: 14 });
    const region = next.board.regions.find((r) => r.id === 14)!;
    expect(region.owner).toBe(0);
    expect(region.tokens).toBe(1);
    expect(region.hasDragon).toBe(true);
  });

  it('resolves defender when conquering occupied region', () => {
    let state = dragonState();
    state = patchRegion(state, 14, { owner: 1, tokens: 3, isDeclined: false });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'ratmen' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20,
        totalTokens: 8,
        tokensOnBoard: 3,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 5,
    });
    const next = applyAction(state, { type: 'placeDragon', regionId: 14 });
    // Attacker takes with 1 token
    expect(next.board.regions.find((r) => r.id === 14)!.owner).toBe(0);
    expect(next.board.regions.find((r) => r.id === 14)!.tokens).toBe(1);
    // Defender loses 1 token (casualty), rest return to hand
    expect(next.players[1].activeRace!.tokensOnBoard).toBe(0);
    // 3 tokens - 1 casualty = 2 returned to hand → 5 + 2 = 7
    expect(next.players[1].availableTokens).toBe(7);
  });

  it('uses exactly 1 token regardless of region defense', () => {
    let state = dragonState();
    // Heavily defended region
    state = patchRegion(state, 14, { owner: 1, tokens: 5, isDeclined: false, hasMountain: true });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'ratmen' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20,
        totalTokens: 10,
        tokensOnBoard: 5,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 5,
    });
    const next = applyAction(state, { type: 'placeDragon', regionId: 14 });
    expect(next.board.regions.find((r) => r.id === 14)!.tokens).toBe(1);
    // Attacker should have used 1 token
    expect(next.players[0].availableTokens).toBe(6); // 7 - 1
  });

  it('sets dragonUsedThisTurn to true after using dragon', () => {
    const state = dragonState();
    const next = applyAction(state, { type: 'placeDragon', regionId: 14 });
    expect(next.players[0].activeRace!.dragonUsedThisTurn).toBe(true);
  });

  it('does not allow second dragon use in same turn', () => {
    let state = dragonState();
    state = patchPlayer(state, 0, {
      activeRace: {
        ...state.players[0].activeRace!,
        dragonUsedThisTurn: true,
        dragonRegion: 14,
      },
    });
    state = patchRegion(state, 14, { owner: 0, tokens: 1, isDeclined: false, hasDragon: true });
    const legal = getLegalActions(state);
    expect(legal.filter((a) => a.type === 'placeDragon')).toHaveLength(0);
  });

  it('requires at least 1 available token', () => {
    let state = dragonState();
    state = patchPlayer(state, 0, { availableTokens: 0 });
    const legal = getLegalActions(state);
    expect(legal.filter((a) => a.type === 'placeDragon')).toHaveLength(0);
  });

  it('clears all enemy markers on conquered region', () => {
    let state = dragonState();
    state = patchRegion(state, 14, {
      owner: 1, tokens: 1, isDeclined: false,
      hasTrollLair: true, hasFortress: true, encampmentCount: 2,
    });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'ratmen' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20,
        totalTokens: 5,
        tokensOnBoard: 1,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 4,
    });
    const next = applyAction(state, { type: 'placeDragon', regionId: 14 });
    const region = next.board.regions.find((r) => r.id === 14)!;
    expect(region.hasTrollLair).toBe(false);
    expect(region.hasFortress).toBe(false);
    expect(region.encampmentCount).toBe(0);
  });

  it('counts as non-empty conquest when region was occupied', () => {
    let state = dragonState();
    state = patchRegion(state, 14, { owner: 1, tokens: 2, isDeclined: false });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'ratmen' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20,
        totalTokens: 5,
        tokensOnBoard: 2,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 3,
    });
    const next = applyAction(state, { type: 'placeDragon', regionId: 14 });
    expect(next.players[0].activeRace!.conquestsThisTurn).toBe(1);
  });

  it('moves dragon to new region, clearing old location', () => {
    let state = dragonState();
    // First dragon conquest
    state = patchPlayer(state, 0, {
      activeRace: {
        ...state.players[0].activeRace!,
        dragonRegion: 19,
      },
    });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasDragon: true });
    // Reset dragonUsedThisTurn so we can test (simulate new turn)
    state = patchPlayer(state, 0, {
      activeRace: { ...state.players[0].activeRace!, dragonUsedThisTurn: false },
    });
    const next = applyAction(state, { type: 'placeDragon', regionId: 14 });
    // Old region should not have dragon
    expect(next.board.regions.find((r) => r.id === 19)!.hasDragon).toBe(false);
    // New region should have dragon
    expect(next.board.regions.find((r) => r.id === 14)!.hasDragon).toBe(true);
  });
});
