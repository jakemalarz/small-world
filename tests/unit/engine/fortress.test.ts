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

function fortifiedState(): GameState {
  let state = createInitialState({ firstPlayerIndex: 0 });
  state = patchPlayer(state, 0, {
    activeRace: {
      raceId: 'humans' as never,
      powerId: 'fortified' as never,
      maxSupply: 20,
      totalTokens: 7,
      tokensOnBoard: 3,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
      fortressesPlaced: 0,
      fortressesLost: 0,
    },
    availableTokens: 4,
  });
  state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
  state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
  return { ...state, phase: 'placeFortress' };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Fortress placement', () => {
  it('places a fortress on a valid owned active region', () => {
    const state = fortifiedState();
    const next = applyAction(state, { type: 'placeFortress', regionId: 19 });
    expect(next.board.regions.find((r) => r.id === 19)!.hasFortress).toBe(true);
  });

  it('increments fortressesPlaced on active race', () => {
    const state = fortifiedState();
    const next = applyAction(state, { type: 'placeFortress', regionId: 19 });
    expect(next.players[0].activeRace!.fortressesPlaced).toBe(1);
  });

  it('does not allow placement on a region that already has a fortress', () => {
    let state = fortifiedState();
    state = patchRegion(state, 19, { hasFortress: true });
    state = patchPlayer(state, 0, {
      activeRace: { ...state.players[0].activeRace!, fortressesPlaced: 1 },
    });
    const legal = getLegalActions(state);
    const fortressOnR19 = legal.find(
      (a) => a.type === 'placeFortress' && (a as { regionId: number }).regionId === 19,
    );
    expect(fortressOnR19).toBeUndefined();
  });

  it('caps at 6 total fortresses (placed + lost)', () => {
    let state = fortifiedState();
    state = patchPlayer(state, 0, {
      activeRace: { ...state.players[0].activeRace!, fortressesPlaced: 4, fortressesLost: 2 },
    });
    const legal = getLegalActions(state);
    const fortressActions = legal.filter((a) => a.type === 'placeFortress');
    expect(fortressActions).toHaveLength(0);
  });

  it('allows skipping fortress placement with endPhase', () => {
    const state = fortifiedState();
    const legal = getLegalActions(state);
    expect(legal.some((a) => a.type === 'endPhase')).toBe(true);
  });

  it('fortress persists in decline', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchPlayer(state, 0, {
      activeRace: {
        raceId: 'humans' as never,
        powerId: 'fortified' as never,
        maxSupply: 20,
        totalTokens: 3,
        tokensOnBoard: 3,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 0,
    });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasFortress: true });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    state = { ...state, phase: 'decline' };
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 19)!.hasFortress).toBe(true);
  });

  it('fortress is cleared when region is conquered', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchPlayer(state, 0, {
      activeRace: {
        raceId: 'humans' as never,
        powerId: 'alchemist' as never,
        maxSupply: 20,
        totalTokens: 10,
        tokensOnBoard: 0,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      availableTokens: 10,
    });
    // Enemy region with fortress
    state = patchRegion(state, 14, { owner: 1, tokens: 2, isDeclined: false, hasFortress: true });
    state = patchPlayer(state, 1, {
      activeRace: {
        raceId: 'ratmen' as never,
        powerId: 'fortified' as never,
        maxSupply: 20,
        totalTokens: 5,
        tokensOnBoard: 2,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
        fortressesPlaced: 1,
        fortressesLost: 0,
      },
      availableTokens: 3,
    });
    state = { ...state, phase: 'conquest' };
    const next = applyAction(state, { type: 'conquer', regionId: 14 });
    expect(next.board.regions.find((r) => r.id === 14)!.hasFortress).toBe(false);
  });
});
