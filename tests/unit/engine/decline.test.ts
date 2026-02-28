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
    sorcererConversionsThisTurn: 0,
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

  it('sets declinedRaceId on newly declined regions', () => {
    const state = buildDeclineReadyState({ raceId: 'ratmen', region1Tokens: 3 });
    const next = applyAction(state, { type: 'decline' });
    const r19 = next.board.regions.find((r) => r.id === 19)!;
    expect(r19.declinedRaceId).toBe('ratmen');
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

  it('removes a previous declined race when a new race declines', () => {
    const previousDeclined: DeclinedRaceState = {
      raceId: 'humans' as never, powerId: 'alchemist' as never,
    };
    const state = buildDeclineReadyState({
      raceId: 'elves', powerId: 'flying', priorDeclinedRaces: [previousDeclined],
    });
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].declinedRaces).toHaveLength(1);
    expect(next.players[0].declinedRaces[0].raceId).toBe('elves');
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

  it('clears hasEncampment flags from declining player regions (Bivouacking)', () => {
    let state = buildDeclineReadyState({ raceId: 'ratmen', powerId: 'bivouacking' });
    state = patchRegion(state, 19, { hasEncampment: true });
    state = patchRegion(state, 20, { hasEncampment: true });
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 19)!.hasEncampment).toBe(false);
    expect(next.board.regions.find((r) => r.id === 20)!.hasEncampment).toBe(false);
  });

  it('does not clear encampments on other player regions during decline', () => {
    let state = buildDeclineReadyState();
    // Give opponent an encampment
    state = patchRegion(state, 5, { owner: 1, tokens: 2, isDeclined: false, hasEncampment: true });
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 5)!.hasEncampment).toBe(true);
  });

  it('does not mutate the original state', () => {
    const state = buildDeclineReadyState({ region1Tokens: 4 });
    const snapshot = JSON.stringify(state);
    applyAction(state, { type: 'decline' });
    expect(JSON.stringify(state)).toBe(snapshot);
  });

  it('removes previous declined regions when active race declines (FR-24)', () => {
    let state = buildDeclineReadyState({ region1Tokens: 3 });
    state = patchRegion(state, 5, { owner: 0, tokens: 4, isDeclined: true, declinedRaceId: 'ghouls' as never });
    state = patchPlayer(state, 0, { declinedRaces: [{ raceId: 'ghouls' as never, powerId: 'stout' as never }] });
    const next = applyAction(state, { type: 'decline' });
    const r5 = next.board.regions.find((r) => r.id === 5)!;
    expect(r5.tokens).toBe(0);
    expect(r5.owner).toBeNull();
    expect(r5.isDeclined).toBe(false);
  });
});

// ── Feature 5: Seafaring "Keep in Decline" ────────────────────────────────────

describe('applyAction — Seafaring keeps sea/lake regions in decline', () => {
  // Region 1: terrain='sea', isEdge=true
  // Region 9: terrain='lake', isEdge=false

  function buildSeafaringDeclineState(options: {
    seaTokens?: number;
    lakeTokens?: number;
    landTokens?: number;
  } = {}): GameState {
    const { seaTokens = 3, lakeTokens = 2, landTokens = 4 } = options;

    let state = buildDeclineReadyState({
      raceId: 'tritons',
      powerId: 'seafaring',
      tokensOnBoard: seaTokens + lakeTokens + landTokens,
      availableTokens: 0,
    });

    // Seafaring player owns sea (1), lake (9), and a land region (20)
    state = patchRegion(state, 1,  { owner: 0, tokens: seaTokens,  isDeclined: false });
    state = patchRegion(state, 9,  { owner: 0, tokens: lakeTokens, isDeclined: false });
    state = patchRegion(state, 20, { owner: 0, tokens: landTokens, isDeclined: false });
    // Clear the default regions set by buildDeclineReadyState so only our regions are owned
    state = patchRegion(state, 19, { owner: null, tokens: 0, isDeclined: false });

    return state;
  }

  it('sea region owned by Seafaring player is kept in decline with 1 token', () => {
    const state = buildSeafaringDeclineState({ seaTokens: 3 });
    const next = applyAction(state, { type: 'decline' });
    const r1 = next.board.regions.find((r) => r.id === 1)!;
    expect(r1.isDeclined).toBe(true);
    expect(r1.tokens).toBe(1);
    expect(r1.owner).toBe(0);
  });

  it('lake region owned by Seafaring player is kept in decline with 1 token', () => {
    const state = buildSeafaringDeclineState({ lakeTokens: 2 });
    const next = applyAction(state, { type: 'decline' });
    const r9 = next.board.regions.find((r) => r.id === 9)!;
    expect(r9.isDeclined).toBe(true);
    expect(r9.tokens).toBe(1);
    expect(r9.owner).toBe(0);
  });

  it('land regions also go in decline normally alongside sea/lake', () => {
    const state = buildSeafaringDeclineState({ landTokens: 4 });
    const next = applyAction(state, { type: 'decline' });
    const r20 = next.board.regions.find((r) => r.id === 20)!;
    expect(r20.isDeclined).toBe(true);
    expect(r20.tokens).toBe(1);
  });

  it('non-Seafaring player cannot keep sea regions — sea region is not owned pre-decline', () => {
    // A normal race cannot own sea regions, so this just checks
    // that non-Seafaring decline does not touch sea regions
    const state = buildDeclineReadyState({ raceId: 'humans', powerId: 'bivouacking' });
    // Ensure sea region (1) is unowned before decline
    const seaBefore = state.board.regions.find((r) => r.id === 1)!;
    const next = applyAction(state, { type: 'decline' });
    const seaAfter = next.board.regions.find((r) => r.id === 1)!;
    // Sea region should remain exactly as it was (unowned)
    expect(seaAfter.owner).toBe(seaBefore.owner);
    expect(seaAfter.tokens).toBe(seaBefore.tokens);
    expect(seaAfter.isDeclined).toBe(seaBefore.isDeclined);
  });

  it('Seafaring decline still moves activeRace to declinedRaces', () => {
    const state = buildSeafaringDeclineState();
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].activeRace).toBeNull();
    expect(next.players[0].declinedRaces).toHaveLength(1);
    expect(next.players[0].declinedRaces[0].raceId).toBe('tritons');
    expect(next.players[0].declinedRaces[0].powerId).toBe('seafaring');
  });
});

// ── Feature 8: Heroic heroes cleared on decline ───────────────────────────────

describe('applyAction — Heroic heroes cleared on decline', () => {
  it('hasHero is cleared on declining player regions', () => {
    let state = buildDeclineReadyState({ raceId: 'humans', powerId: 'heroic' });
    // Place heroes on owned regions 19 and 20
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasHero: true });
    state = patchRegion(state, 20, { owner: 0, tokens: 2, isDeclined: false, hasHero: true });
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 19)!.hasHero).toBe(false);
    expect(next.board.regions.find((r) => r.id === 20)!.hasHero).toBe(false);
  });

  it('heroRegions on activeRace is removed after decline (activeRace is null)', () => {
    let state = buildDeclineReadyState({ raceId: 'humans', powerId: 'heroic' });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasHero: true });
    state = patchRegion(state, 20, { owner: 0, tokens: 2, isDeclined: false, hasHero: true });
    const next = applyAction(state, { type: 'decline' });
    // After decline, activeRace is null so heroRegions are implicitly gone
    expect(next.players[0].activeRace).toBeNull();
  });

  it('does not clear hasHero on opponent regions during decline', () => {
    let state = buildDeclineReadyState({ raceId: 'humans', powerId: 'heroic' });
    // Give opponent a region with a hero
    state = patchRegion(state, 5, { owner: 1, tokens: 2, isDeclined: false, hasHero: true });
    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find((r) => r.id === 5)!.hasHero).toBe(true);
  });
});
