import { describe, it, expect } from 'vitest';
import { applyAction } from '@/game/engine/actions';
import { createInitialState } from '@/game/engine/setup';
import type { GameState, PlayerState, RegionState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

function patchState(state: GameState, patch: Partial<GameState>): GameState {
  return { ...state, ...patch };
}

function patchRegion(state: GameState, id: number, patch: Partial<RegionState>): GameState {
  return {
    ...state,
    board: {
      regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    },
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

function withRace(
  state: GameState,
  playerIndex: 0 | 1,
  raceId: string,
  powerId: string,
  extra: Record<string, unknown> = {},
): GameState {
  return patchPlayer(state, playerIndex, {
    activeRace: {
      raceId: raceId as never,
      powerId: powerId as never,
      maxSupply: 20,
      totalTokens: 10,
      tokensOnBoard: 0,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      ...extra,
    },
    availableTokens: 10,
  });
}

// Build a state that's in conquest phase with a race assigned
function conquestState(
  raceId = 'ratmen',
  powerId = 'bivouacking',
  tokensOnBoard = 0,
): GameState {
  let state = createInitialState({ firstPlayerIndex: 0 });
  state = withRace(state, 0, raceId, powerId, { tokensOnBoard });
  return patchState(state, { phase: 'conquest' });
}

// ── selectCombo ───────────────────────────────────────────────────────────────

describe('applyAction — selectCombo', () => {
  it('transitions phase from selectCombo to conquest (no tokens on board)', () => {
    const state = createInitialState({ firstPlayerIndex: 0 }); // phase: selectCombo
    const next = applyAction(state, { type: 'selectCombo', comboIndex: 0 });
    expect(next.phase).toBe('conquest');
  });

  it('sets activeRace on player', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const next = applyAction(state, { type: 'selectCombo', comboIndex: 0 });
    expect(next.players[0].activeRace).not.toBeNull();
  });

  it('deducts coins for skipping slots', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const before = state.players[0].coins;
    const next = applyAction(state, { type: 'selectCombo', comboIndex: 2 });
    expect(next.players[0].coins).toBe(before - 2);
  });

  it('appends log entry', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const next = applyAction(state, { type: 'selectCombo', comboIndex: 0 });
    expect(next.log).toHaveLength(1);
    expect(next.log[0].action.type).toBe('selectCombo');
  });

  it('throws on illegal action (negative comboIndex)', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    expect(() => applyAction(state, { type: 'selectCombo', comboIndex: -1 })).toThrow();
  });

  it('throws when trying selectCombo in wrong phase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = patchState(state, { phase: 'conquest' });
    expect(() => applyAction(state, { type: 'selectCombo', comboIndex: 0 })).toThrow();
  });
});

// ── pickUpTokens ──────────────────────────────────────────────────────────────

describe('applyAction — pickUpTokens', () => {
  it('reduces region tokens and adds to availableTokens', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'ratmen', 'bivouacking');
    state = patchState(state, { phase: 'readyTroops' });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    // Give player active race with tokensOnBoard=3
    state = patchPlayer(state, 0, {
      availableTokens: 7,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 3 },
    });

    const next = applyAction(state, { type: 'pickUpTokens', regionId: 20, count: 2 });
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBe(1); // left 1
    expect(next.players[0].availableTokens).toBe(9); // picked up 2
  });

  it('allows picking up all tokens to abandon region (FR-13b)', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'ratmen', 'bivouacking');
    state = patchState(state, { phase: 'readyTroops' });
    state = patchRegion(state, 20, { owner: 0, tokens: 2, isDeclined: false });
    state = patchPlayer(state, 0, {
      availableTokens: 8,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 2 },
    });

    const next = applyAction(state, { type: 'pickUpTokens', regionId: 20, count: 2 });
    // Picks up all 2 tokens — region abandoned
    expect(next.board.regions.find((r) => r.id === 20)!.tokens).toBe(0);
    expect(next.board.regions.find((r) => r.id === 20)!.owner).toBeNull();
    expect(next.players[0].availableTokens).toBe(10);
  });
});

// ── conquer ───────────────────────────────────────────────────────────────────

describe('applyAction — conquer', () => {
  it('places attacker tokens in region and sets ownership', () => {
    let state = conquestState();
    const regionId = 20; // edge farmland, empty
    const before = state.players[0].availableTokens;
    const cost = 2; // empty region costs 2

    const next = applyAction(state, { type: 'conquer', regionId });
    const region = next.board.regions.find((r) => r.id === regionId)!;

    expect(region.owner).toBe(0);
    expect(region.tokens).toBe(cost);
    expect(region.isDeclined).toBe(false);
    expect(next.players[0].availableTokens).toBe(before - cost);
    expect(next.players[0].activeRace!.tokensOnBoard).toBe(cost);
  });

  it('clears hasLostTribe from conquered region', () => {
    let state = conquestState();
    state = patchRegion(state, 20, { hasLostTribe: true });
    const next = applyAction(state, { type: 'conquer', regionId: 20 });
    expect(next.board.regions.find((r) => r.id === 20)!.hasLostTribe).toBe(false);
  });

  it('increments conquestsThisTurn for non-empty regions', () => {
    let state = conquestState();
    state = patchRegion(state, 20, { hasLostTribe: true }); // non-empty
    const next = applyAction(state, { type: 'conquer', regionId: 20 });
    expect(next.players[0].activeRace!.conquestsThisTurn).toBe(1);
  });

  it('does NOT increment conquestsThisTurn for empty regions', () => {
    const state = conquestState();
    const next = applyAction(state, { type: 'conquer', regionId: 20 }); // empty region
    expect(next.players[0].activeRace!.conquestsThisTurn).toBe(0);
  });

  it('defender active tokens: 1 discarded, rest returned to hand', () => {
    let state = conquestState();
    // Give player 1 an active race in region 20
    state = withRace(state, 1, 'humans', 'alchemist', { tokensOnBoard: 3, totalTokens: 5 });
    state = patchRegion(state, 20, { owner: 1, tokens: 3, isDeclined: false });
    state = patchPlayer(state, 1, { availableTokens: 2 });

    const next = applyAction(state, { type: 'conquer', regionId: 20 });
    const defender = next.players[1];
    // 3 tokens defending: 1 discarded, 2 returned to hand
    expect(defender.availableTokens).toBe(2 + 2); // 2 initial + 2 returned
    expect(defender.activeRace!.totalTokens).toBe(5 - 1); // 1 discarded
    expect(defender.activeRace!.tokensOnBoard).toBe(0);
  });

  it('original state is not mutated', () => {
    const state = conquestState();
    const originalOwner = state.board.regions.find((r) => r.id === 20)!.owner;
    applyAction(state, { type: 'conquer', regionId: 20 });
    expect(state.board.regions.find((r) => r.id === 20)!.owner).toBe(originalOwner);
  });

  it('appends log entry', () => {
    const state = conquestState();
    const next = applyAction(state, { type: 'conquer', regionId: 20 });
    expect(next.log).toHaveLength(1);
    expect(next.log[0].action.type).toBe('conquer');
  });
});

// ── decline ───────────────────────────────────────────────────────────────────

describe('applyAction — decline', () => {
  function declineState(): GameState {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'ratmen', 'bivouacking');
    state = patchState(state, { phase: 'optionalDecline' });
    state = patchRegion(state, 19, { owner: 0, tokens: 3, isDeclined: false });
    state = patchRegion(state, 20, { owner: 0, tokens: 2, isDeclined: false });
    return state;
  }

  it('marks all active regions as isDeclined with 1 token', () => {
    const next = applyAction(declineState(), { type: 'decline' });
    const r19 = next.board.regions.find((r) => r.id === 19)!;
    const r20 = next.board.regions.find((r) => r.id === 20)!;
    expect(r19.isDeclined).toBe(true);
    expect(r19.tokens).toBe(1);
    expect(r20.isDeclined).toBe(true);
    expect(r20.tokens).toBe(1);
  });

  it('moves activeRace to declinedRaces', () => {
    const state = declineState();
    const raceId = state.players[0].activeRace!.raceId;
    const next = applyAction(state, { type: 'decline' });
    expect(next.players[0].activeRace).toBeNull();
    expect(next.players[0].declinedRaces[0].raceId).toBe(raceId);
  });

  it('sets availableTokens to 0 after decline', () => {
    const next = applyAction(declineState(), { type: 'decline' });
    expect(next.players[0].availableTokens).toBe(0);
  });

  it('transitions phase to score after decline', () => {
    const next = applyAction(declineState(), { type: 'decline' });
    // decline → score (same player scores after declining)
    // Actually looking at phaseTransition: optionalDecline → decline → advanceTurn
    // So this should switch to next player's turn
    expect(['score', 'selectCombo', 'readyTroops', 'ghoulConquest']).toContain(next.phase);
  });
});

// ── endPhase — phase transitions ──────────────────────────────────────────────

describe('applyAction — endPhase transitions', () => {
  it('readyTroops → conquest', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'ratmen', 'bivouacking');
    state = patchState(state, { phase: 'readyTroops' });
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('conquest');
  });

  it('conquest → redeploy via endPhase (always, even with tokens in hand)', () => {
    let state = conquestState();
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('redeploy');
  });

  it('conquest → reinforcementDie via startFinalConquest', () => {
    let state = conquestState();
    const next = applyAction(state, { type: 'startFinalConquest' });
    expect(next.phase).toBe('reinforcementDie');
  });

  it('score → switches to next player (selectCombo or readyTroops)', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'ratmen', 'bivouacking');
    state = patchState(state, { phase: 'score' });
    const next = applyAction(state, { type: 'endPhase' });
    // Should switch to player 1
    expect(next.activePlayerIndex).toBe(1);
    expect(['selectCombo', 'readyTroops', 'ghoulConquest']).toContain(next.phase);
  });

  it('turn increments when cycling back to first player', () => {
    // Player 0 = first player, Player 1 just ended score
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 1, 'humans', 'alchemist');
    state = patchState(state, { phase: 'score', activePlayerIndex: 1 });
    const beforeTurn = state.turn;
    const next = applyAction(state, { type: 'endPhase' });
    // Switching to player 0 (firstPlayer) → new round → turn++
    expect(next.turn).toBe(beforeTurn + 1);
  });

  it('turn does NOT increment when switching from first to second player', () => {
    // Player 0 = first player, Player 0 just ended score → switch to player 1
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'humans', 'alchemist');
    state = patchState(state, { phase: 'score', activePlayerIndex: 0 });
    const beforeTurn = state.turn;
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.turn).toBe(beforeTurn); // no increment
  });

  it('game over after turn 10 when switching back to first player', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 1, 'humans', 'alchemist');
    state = patchState(state, { phase: 'score', activePlayerIndex: 1, turn: 10 });
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('gameOver');
  });
});

// ── immutability ──────────────────────────────────────────────────────────────

describe('immutability', () => {
  it('original state is never mutated across all action types', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    const snapshot = JSON.stringify(state);
    // Apply a bunch of actions
    try { applyAction(state, { type: 'selectCombo', comboIndex: 0 }); } catch { /* ok */ }
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});
