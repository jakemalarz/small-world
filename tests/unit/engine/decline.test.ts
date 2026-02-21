import { describe, it, expect } from 'vitest';
import { applyAction } from '@/game/engine/actions';
import { createInitialState } from '@/game/engine/setup';
import type {
  GameState,
  PlayerState,
  RegionState,
  ActiveRaceState,
  DeclinedRaceState,
} from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch };
}

function patchRegion(state: GameState, id: number, patch: Partial<RegionState>): GameState {
  return {
    ...state,
    board: { regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)) },
  };
}

function patchPlayer(state: GameState, playerIndex: 0 | 1, patch: Partial<PlayerState>): GameState {
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === playerIndex ? { ...p, ...patch } : p,
    ) as unknown as typeof state.players,
  };
}

function makeActiveRace(overrides: Partial<ActiveRaceState> = {}): ActiveRaceState {
  return {
    raceId: 'ratmen' as never,
    powerId: 'bivouacking' as never,
    maxSupply: 20,
    totalTokens: 10,
    tokensOnBoard: 5,
    conquestsThisTurn: 0,
    hasDeclinedThisTurn: false,
    ...overrides,
  };
}

/** Build a state ready to accept a 'decline' action (phase: optionalDecline). */
function buildDeclineReadyState(options: {
  raceId?: string;
  powerId?: string;
  tokensOnBoard?: number;
  availableTokens?: number;
  region1Tokens?: number;
  region2Tokens?: number;
  priorDeclinedRaces?: readonly DeclinedRaceState[];
} = {}): GameState {
  const {
    raceId = 'ratmen',
    powerId = 'bivouacking',
    tokensOnBoard = 5,
    availableTokens = 3,
    region1Tokens = 3,
    region2Tokens = 2,
    priorDeclinedRaces = [],
  } = options;

  let state = createInitialState({ firstPlayerIndex: 0 });

  state = patchPlayer(state, 0, {
    activeRace: makeActiveRace({
      raceId: raceId as never,
      powerId: powerId as never,
      tokensOnBoard,
    }),
    availableTokens,
    declinedRaces: priorDeclinedRaces,
  });

  state = patchRegion(state, 19, { owner: 0, tokens: region1Tokens, isDeclined: false });
  state = patchRegion(state, 20, { owner: 0, tokens: region2Tokens, isDeclined: false });
  return patchState(state, { phase: 'optionalDecline' });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('applyAction — decline mechanics', () => {
  it('marks all active player regions as isDeclined with exactly 1 token each', () => {
    const state = buildDeclineReadyState({ region1Tokens: 4, region2Tokens: 3 });
    const next = applyAction(state, { type: 'decline' });
    const r19 = next.board.regions.find((r) => r.id === 19)!;
    const r20 = next.board.regions.find((r) => r.id === 20)!;
    expect(r19.isDeclined).toBe(true);
    expect(r19.tokens).toBe(1);
    expect(r20.isDeclined).toBe(true);
    expect(r20.tokens).toBe(1);
  });

  it('moves activeRace into declinedRaces and clears activeRace to null', () => {
    const state = buildDeclineReadyState({ raceId: 'humans', powerId: 'alchemist' });
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].activeRace).toBeNull();
    expect(next.players[0].declinedRaces).toHaveLength(1);
    expect(next.players[0].declinedRaces[0].raceId).toBe('humans');
    expect(next.players[0].declinedRaces[0].powerId).toBe('alchemist');
  });

  it('sets availableTokens to 0 after decline', () => {
    const state = buildDeclineReadyState({ availableTokens: 7 });
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].availableTokens).toBe(0);
  });

  it('removes a previous non-Spirit declined race when a new race declines', () => {
    const previousDeclined: DeclinedRaceState = {
      raceId: 'humans' as never, powerId: 'alchemist' as never, isSpirit: false,
    };
    const state = buildDeclineReadyState({
      raceId: 'elves', powerId: 'flying', priorDeclinedRaces: [previousDeclined],
    });
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].declinedRaces).toHaveLength(1);
    expect(next.players[0].declinedRaces[0].raceId).toBe('elves');
  });

  it('preserves a Spirit-powered declined race when a new race enters decline', () => {
    const spiritDeclined: DeclinedRaceState = {
      raceId: 'dwarves' as never, powerId: 'spirit' as never, isSpirit: true,
    };
    const state = buildDeclineReadyState({
      raceId: 'orcs', powerId: 'bivouacking', priorDeclinedRaces: [spiritDeclined],
    });
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].declinedRaces).toHaveLength(2);
    const spirit = next.players[0].declinedRaces.find((dr) => dr.raceId === 'dwarves');
    const newRace = next.players[0].declinedRaces.find((dr) => dr.raceId === 'orcs');
    expect(spirit).toBeDefined();
    expect(spirit!.isSpirit).toBe(true);
    expect(newRace).toBeDefined();
  });

  it('sets isSpirit=true on declined race entry when powerId is spirit', () => {
    const state = buildDeclineReadyState({ raceId: 'elves', powerId: 'spirit' });
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].declinedRaces[0].isSpirit).toBe(true);
  });

  it('preserves all tokens on Ghoul regions in decline (keepAllTokensInDecline)', () => {
    const state = buildDeclineReadyState({
      raceId: 'ghouls', powerId: 'bivouacking',
      region1Tokens: 5, region2Tokens: 3,
    });
    const next = applyAction(state, { type: 'decline' });
    const r19 = next.board.regions.find((r) => r.id === 19)!;
    const r20 = next.board.regions.find((r) => r.id === 20)!;
    expect(r19.tokens).toBe(5);
    expect(r20.tokens).toBe(3);
    expect(r19.isDeclined).toBe(true);
    expect(r20.isDeclined).toBe(true);
  });

  it('does not modify regions owned by the other player', () => {
    let state = buildDeclineReadyState();
    state = patchPlayer(state, 1, {
      activeRace: makeActiveRace({ raceId: 'trolls' as never, powerId: 'alchemist' as never }),
      availableTokens: 0,
    });
    state = patchRegion(state, 1, { owner: 1, tokens: 4, isDeclined: false });
    const tokensBefore = state.board.regions.find((r) => r.id === 1)!.tokens;
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 1)!.tokens).toBe(tokensBefore);
    expect(next.board.regions.find((r) => r.id === 1)!.isDeclined).toBe(false);
  });

  it('transitions to a valid follow-on phase (not optionalDecline or decline)', () => {
    const state = buildDeclineReadyState();
    const next = applyAction(state, { type: 'decline' });
    expect(next.phase).not.toBe('optionalDecline');
    expect(next.phase).not.toBe('decline');
    const validPhases = ['selectCombo', 'readyTroops', 'ghoulConquest', 'score', 'gameOver'];
    expect(validPhases).toContain(next.phase);
  });

  it('appends a decline log entry', () => {
    const state = buildDeclineReadyState();
    const next = applyAction(state, { type: 'decline' });
    const last = next.log[next.log.length - 1];
    expect(last.action.type).toBe('decline');
    expect(last.playerIndex).toBe(0);
  });

  it('does not mutate the original state', () => {
    const state = buildDeclineReadyState({ region1Tokens: 4 });
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: 'decline' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('does not alter already-declined regions belonging to the active player', () => {
    let state = buildDeclineReadyState({ region1Tokens: 3 });
    state = patchRegion(state, 5, { owner: 0, tokens: 4, isDeclined: true });
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 5)!.tokens).toBe(4);
    expect(next.board.regions.find((r) => r.id === 5)!.isDeclined).toBe(true);
  });
});
