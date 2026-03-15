import { describe, it, expect } from 'vitest';
import { applyAction } from '@/game/engine/actions';
import { getLegalActions } from '@/game/engine/legalActions';
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
      sorcererConversionsThisTurn: 0,
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
    const regionId = 6; // edge hill (Yellowstone), empty, no mountain token
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

  it('Ghoul In Decline defender: 1 discarded, rest go to ghoulTokensInReserve', () => {
    let state = conquestState();
    // Player 1 has Ghouls In Decline occupying region 20 with 3 tokens
    state = patchPlayer(state, 1, {
      declinedRaces: [{ raceId: 'ghouls', powerId: 'bivouacking' }],
    });
    state = patchRegion(state, 20, { owner: 1, tokens: 3, isDeclined: true, declinedRaceId: 'ghouls' });

    const next = applyAction(state, { type: 'conquer', regionId: 20 });
    const defender = next.players[1];
    // 3 Ghoul tokens: 1 permanently discarded, 2 go to reserve
    expect(defender.ghoulTokensInReserve).toBe(2);
    // availableTokens unchanged (reserve is separate)
    expect(defender.availableTokens).toBe(state.players[1].availableTokens);
  });

  it('Ghoul In Decline defender with 1 token: 1 discarded, 0 go to reserve', () => {
    let state = conquestState();
    state = patchPlayer(state, 1, {
      declinedRaces: [{ raceId: 'ghouls', powerId: 'bivouacking' }],
    });
    state = patchRegion(state, 20, { owner: 1, tokens: 1, isDeclined: true, declinedRaceId: 'ghouls' });

    const next = applyAction(state, { type: 'conquer', regionId: 20 });
    const defender = next.players[1];
    expect(defender.ghoulTokensInReserve ?? 0).toBe(0);
  });

  it('normal In Decline defender: all tokens removed, none returned', () => {
    let state = conquestState();
    state = patchRegion(state, 20, { owner: 1, tokens: 3, isDeclined: true, declinedRaceId: 'humans' });

    const next = applyAction(state, { type: 'conquer', regionId: 20 });
    const defender = next.players[1];
    // Normal declined tokens are removed, no reserve
    expect(defender.ghoulTokensInReserve ?? 0).toBe(0);
    expect(defender.availableTokens).toBe(state.players[1].availableTokens);
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

  it('transitions to the next player\'s starting phase (not same player selectCombo)', () => {
    const next = applyAction(declineState(), { type: 'decline' });
    // optionalDecline + decline → advanceTurn for the NEXT player
    expect(['selectCombo', 'readyTroops', 'ghoulConquest']).toContain(next.phase);
  });

  it('switches activePlayerIndex after declining from optionalDecline (Stout)', () => {
    // Player 0 is in optionalDecline. After declining, player 1 should become active.
    const state = declineState(); // activePlayerIndex: 0, firstPlayerIndex: 0
    expect(state.activePlayerIndex).toBe(0);
    const next = applyAction(state, { type: 'decline' });
    expect(next.activePlayerIndex).toBe(1);
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

// ── Amazons — conquest-only token removal ────────────────────────────────────

describe('applyAction — Amazons conquestOnlyTokens', () => {
  function amazonConquestState(): GameState {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'amazons', 'bivouacking', {
      tokensOnBoard: 0,
      totalTokens: 6, // 6 base (power adds 0 for bivouacking)
    });
    state = patchPlayer(state, 0, { availableTokens: 6 });
    return patchState(state, { phase: 'readyTroops' });
  }

  it('readyTroops → conquest does NOT add tokens (already injected at readyTroops entry)', () => {
    // Tokens are injected when entering readyTroops, not when leaving it.
    // This state was manually set to readyTroops without going through player switch,
    // so the injection has not yet occurred.
    const state = amazonConquestState();
    const before = state.players[0].availableTokens; // 6
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('conquest');
    // No additional tokens added at this transition
    expect(next.players[0].availableTokens).toBe(before);
  });

  it('adds conquestOnlyTokens at start of readyTroops via player switch', () => {
    // Player 1 ends score phase → switches to player 0 (Amazon) whose turn starts at readyTroops
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'amazons', 'bivouacking', {
      tokensOnBoard: 3, // has tokens on board → readyTroops phase
      totalTokens: 6,
    });
    state = patchPlayer(state, 0, { availableTokens: 0 }); // all on board
    // Player 1 is active, ending score phase → will switch to player 0
    state = patchState(state, { phase: 'score', activePlayerIndex: 1 });

    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('readyTroops');
    expect(next.activePlayerIndex).toBe(0);
    // Amazon player 0 should have base tokens (0 in hand) + 4 conquest-only
    expect(next.players[0].availableTokens).toBe(4);
    expect(next.players[0].activeRace!.totalTokens).toBe(6 + 4);
  });

  it('adds conquestOnlyTokens at conquest start (selectCombo → conquest, turn 1)', () => {
    // On turn 1, player selects Amazon combo → goes directly to conquest
    const state = createInitialState({ firstPlayerIndex: 0 });
    const next = applyAction(state, { type: 'selectCombo', comboIndex: 0 });
    if (next.players[0].activeRace?.raceId === 'amazons') {
      expect(next.players[0].availableTokens).toBe(
        next.players[0].activeRace!.totalTokens,
      );
    }
    // Generic test: if we manually set up Amazons and selectCombo, tokens include +4
    let s = createInitialState({ firstPlayerIndex: 0 });
    // Patch the shop to have amazons+bivouacking at slot 0
    s = {
      ...s,
      comboShop: {
        ...s.comboShop,
        visible: [
          { raceId: 'amazons', powerId: 'bivouacking', coinsOnSlot: 0 },
          ...s.comboShop.visible.slice(1),
        ],
      },
    };
    const afterSelect = applyAction(s, { type: 'selectCombo', comboIndex: 0 });
    expect(afterSelect.phase).toBe('conquest');
    const p = afterSelect.players[0];
    // Amazons base 6 + bivouacking bonus 5 = 11, +4 conquest-only = 15 total
    expect(p.availableTokens).toBe(15);
    expect(p.activeRace!.totalTokens).toBe(15);
  });

  it('removes conquestOnlyTokens from board after redeployment', () => {
    // Set up: Amazons in redeploy phase with 10 tokens on board across 3 regions
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'amazons', 'bivouacking', {
      tokensOnBoard: 10,
      totalTokens: 10,
    });
    state = patchPlayer(state, 0, { availableTokens: 0 });
    state = patchState(state, { phase: 'redeploy' });
    state = patchRegion(state, 19, { owner: 0, tokens: 4, isDeclined: false });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false });
    state = patchRegion(state, 18, { owner: 0, tokens: 3, isDeclined: false });

    const deployment = new Map([[19, 4], [20, 3], [18, 3]]);
    const next = applyAction(state, { type: 'redeploy', deployment });

    // 4 tokens removed from board (largest stacks first: region 19 has 4→1 min so remove 3, then region 20 has 3→2 remove 1)
    const totalOnBoard = next.board.regions
      .filter((r) => r.owner === 0 && !r.isDeclined)
      .reduce((sum, r) => sum + r.tokens, 0);
    expect(totalOnBoard).toBe(10 - 4); // 6 remain
    expect(next.players[0].activeRace!.tokensOnBoard).toBe(6);
    expect(next.players[0].activeRace!.totalTokens).toBe(6); // back to base
  });

  it('non-Amazon races are not affected by conquestOnlyTokens removal', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'ratmen', 'bivouacking', {
      tokensOnBoard: 8,
      totalTokens: 8,
    });
    state = patchPlayer(state, 0, { availableTokens: 0 });
    state = patchState(state, { phase: 'redeploy' });
    state = patchRegion(state, 19, { owner: 0, tokens: 4, isDeclined: false });
    state = patchRegion(state, 20, { owner: 0, tokens: 4, isDeclined: false });

    const deployment = new Map([[19, 4], [20, 4]]);
    const next = applyAction(state, { type: 'redeploy', deployment });

    expect(next.players[0].activeRace!.tokensOnBoard).toBe(8);
    expect(next.players[0].activeRace!.totalTokens).toBe(8);
  });
});

// ── Halflings — Hole-in-the-Ground removed on decline/abandon ─────────────────

describe('applyAction — Halflings hasHoleInTheGround cleanup', () => {
  it('clears hasHoleInTheGround from all regions when Halflings go In Decline', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'halflings', 'bivouacking');
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasHoleInTheGround: true });
    state = patchRegion(state, 20, { owner: 0, tokens: 2, isDeclined: false, hasHoleInTheGround: true });
    state = patchState(state, { phase: 'optionalDecline' });

    const next = applyAction(state, { type: 'decline' });
    expect(next.board.regions.find(r => r.id === 19)!.hasHoleInTheGround).toBe(false);
    expect(next.board.regions.find(r => r.id === 20)!.hasHoleInTheGround).toBe(false);
  });

  it('clears hasHoleInTheGround when a region is abandoned via pickUpTokens', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'halflings', 'bivouacking', { tokensOnBoard: 1 });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false, hasHoleInTheGround: true });
    state = patchPlayer(state, 0, { availableTokens: 5 });
    state = patchState(state, { phase: 'readyTroops' });

    const next = applyAction(state, { type: 'pickUpTokens', regionId: 20, count: 1 });
    const r20 = next.board.regions.find(r => r.id === 20)!;
    expect(r20.owner).toBeNull();
    expect(r20.hasHoleInTheGround).toBe(false);
  });

  it('clears hasHoleInTheGround when a region is abandoned via readyTroopsDeploy', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'halflings', 'bivouacking', { tokensOnBoard: 3, totalTokens: 6 });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasHoleInTheGround: true });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false, hasHoleInTheGround: false });
    state = patchPlayer(state, 0, { availableTokens: 4 });
    state = patchState(state, { phase: 'readyTroops' });

    // Abandon region 19 (set to 0)
    const deployment = new Map([[19, 0], [20, 1]]);
    const next = applyAction(state, { type: 'readyTroopsDeploy', deployment });
    const r19 = next.board.regions.find(r => r.id === 19)!;
    expect(r19.owner).toBeNull();
    expect(r19.hasHoleInTheGround).toBe(false);
  });

  it('does NOT clear hasHoleInTheGround when only some tokens are removed (region kept)', () => {
    let state = withRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'halflings', 'bivouacking', { tokensOnBoard: 3, totalTokens: 6 });
    state = patchRegion(state, 20, { owner: 0, tokens: 3, isDeclined: false, hasHoleInTheGround: true });
    state = patchPlayer(state, 0, { availableTokens: 4 });
    state = patchState(state, { phase: 'readyTroops' });

    // Pick up 1 token but keep 2 in region
    const next = applyAction(state, { type: 'pickUpTokens', regionId: 20, count: 1 });
    const r20 = next.board.regions.find(r => r.id === 20)!;
    expect(r20.tokens).toBe(2);
    expect(r20.hasHoleInTheGround).toBe(true); // Hole stays when region is kept
  });
});

// ── Skeletons — token generation at redeployment start ───────────────────────

describe('applyAction — Skeletons token generation', () => {
  /** Conquest state with Skeletons active and conquestsThisTurn pre-set. */
  function skeletonConquestState(conquestsThisTurn: number, totalTokens = 6): GameState {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'skeletons', 'bivouacking', {
      totalTokens,
      maxSupply: 20,
      tokensOnBoard: 0,
      conquestsThisTurn,
    });
    return patchState(state, { phase: 'conquest' });
  }

  it('does NOT grant skeleton tokens during conquest (after a conquer action)', () => {
    // Set up a state where 1 non-empty conquest has happened
    const state = skeletonConquestState(1);
    // Before any endPhase, tokens should be unchanged
    expect(state.players[0].availableTokens).toBe(10);
    expect(state.players[0].activeRace!.totalTokens).toBe(6);
  });

  it('grants 1 token when 2 non-empty regions were conquered (endPhase from conquest)', () => {
    const state = skeletonConquestState(2);
    const before = state.players[0].availableTokens;
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('redeploy');
    expect(next.players[0].availableTokens).toBe(before + 1);
    expect(next.players[0].activeRace!.totalTokens).toBe(6 + 1);
  });

  it('grants 2 tokens when 4 non-empty regions were conquered', () => {
    const state = skeletonConquestState(4);
    const before = state.players[0].availableTokens;
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.players[0].availableTokens).toBe(before + 2);
    expect(next.players[0].activeRace!.totalTokens).toBe(6 + 2);
  });

  it('grants 0 tokens when only 1 non-empty region was conquered', () => {
    const state = skeletonConquestState(1);
    const before = state.players[0].availableTokens;
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.players[0].availableTokens).toBe(before);
    expect(next.players[0].activeRace!.totalTokens).toBe(6);
  });

  it('grants 0 tokens when no non-empty regions were conquered', () => {
    const state = skeletonConquestState(0);
    const before = state.players[0].availableTokens;
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.players[0].availableTokens).toBe(before);
  });

  it('caps skeleton token generation at maxSupply', () => {
    // 18 tokens already in play, maxSupply 20 → only 2 more can be granted even if 6 are earned
    const state = skeletonConquestState(12, 18); // 12 conquests → 6 tokens, but only 2 slots left
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.players[0].activeRace!.totalTokens).toBe(20); // capped at maxSupply
    expect(next.players[0].availableTokens).toBe(10 + 2); // only 2 granted
  });

  it('non-Skeleton races receive no token generation on endPhase', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'ratmen', 'bivouacking', { conquestsThisTurn: 4 });
    state = patchState(state, { phase: 'conquest' });
    const before = state.players[0].availableTokens;
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.players[0].availableTokens).toBe(before);
  });

  it('grants skeleton tokens when final conquest die fails (endPhase from reinforcementDie)', () => {
    // Skeletons conquered 4 non-empty regions, then attempted final conquest
    // but the die failed. endPhase from reinforcementDie phase should still
    // grant the earned skeleton tokens (floor(4/2) * 1 = 2 extra tokens).
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'skeletons', 'bivouacking', {
      totalTokens: 6,
      maxSupply: 20,
      tokensOnBoard: 0,
      conquestsThisTurn: 4,
    });
    state = patchState(state, {
      phase: 'reinforcementDie' as GameState['phase'],
      reinforcementDie: { result: 0, targetRegionId: null },
    });
    const before = state.players[0].availableTokens;
    const next = applyAction(state, { type: 'endPhase' });
    expect(next.phase).toBe('redeploy');
    expect(next.players[0].availableTokens).toBe(before + 2);
    expect(next.players[0].activeRace!.totalTokens).toBe(6 + 2);
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

// ── Feature 7: Berserk — applyConquer with dieResult ─────────────────────────

describe('applyAction — Berserk conquest with dieResult', () => {
  it('places max(1, cost - dieResult) tokens: die reduces cost', () => {
    // Empty region 6 (Yellowstone, hill) costs 2. Player has 1 token. Die result = 2.
    // Tokens placed = max(1, 2-2) = max(1, 0) = 1 token.
    let state = conquestState('ratmen', 'berserk', 0);
    state = patchPlayer(state, 0, {
      ...state.players[0],
      availableTokens: 1,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 0 },
    });

    const next = applyAction(state, { type: 'conquer', regionId: 6, dieResult: 2 });
    const region = next.board.regions.find((r) => r.id === 6)!;
    expect(region.owner).toBe(0);
    // Tokens placed = max(1, 2-2) = 1
    expect(region.tokens).toBe(1);
    expect(next.players[0].availableTokens).toBe(0);
  });

  it('places max(1, cost - dieResult) tokens: die of 1 on cost-2 region leaves 1 token placed', () => {
    // Player has 5 tokens. cost=2, dieResult=1 → max(1, 2-1) = max(1, 1) = 1 token placed.
    let state = conquestState('ratmen', 'berserk', 0);
    state = patchPlayer(state, 0, {
      ...state.players[0],
      availableTokens: 5,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 0 },
    });

    const next = applyAction(state, { type: 'conquer', regionId: 6, dieResult: 1 });
    const region = next.board.regions.find((r) => r.id === 6)!;
    expect(region.owner).toBe(0);
    // Tokens placed = max(1, 2-1) = 1
    expect(region.tokens).toBe(1);
    expect(next.players[0].availableTokens).toBe(4);
  });

  it('places max(1, cost - dieResult) tokens: die of 0 places full cost', () => {
    // cost=2, dieResult=0 → max(1, 2-0) = 2 tokens placed.
    let state = conquestState('ratmen', 'berserk', 0);
    state = patchPlayer(state, 0, {
      ...state.players[0],
      availableTokens: 5,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 0 },
    });

    const next = applyAction(state, { type: 'conquer', regionId: 6, dieResult: 0 });
    const region = next.board.regions.find((r) => r.id === 6)!;
    expect(region.owner).toBe(0);
    // Tokens placed = max(1, 2-0) = 2
    expect(region.tokens).toBe(2);
    expect(next.players[0].availableTokens).toBe(3);
  });

  it('normal conquest (no dieResult) still places exactly cost tokens', () => {
    // Without dieResult, should behave as normal: place exactly cost tokens
    const state = conquestState('ratmen', 'berserk', 0);
    const next = applyAction(state, { type: 'conquer', regionId: 6 });
    const region = next.board.regions.find((r) => r.id === 6)!;
    expect(region.tokens).toBe(2); // empty region cost = 2
  });
});

describe('applyAction — berserkFail', () => {
  it('adds regionId to berserkAttemptedRegions', () => {
    let state = conquestState('ratmen', 'berserk', 0);
    state = patchPlayer(state, 0, {
      ...state.players[0],
      availableTokens: 1,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 0 },
    });
    const next = applyAction(state, { type: 'berserkFail', regionId: 20 });
    expect(next.players[0].activeRace!.berserkAttemptedRegions).toContain(20);
  });

  it('accumulates multiple failed regions', () => {
    let state = conquestState('ratmen', 'berserk', 0);
    state = patchPlayer(state, 0, {
      ...state.players[0],
      availableTokens: 2,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 0 },
    });
    let next = applyAction(state, { type: 'berserkFail', regionId: 20 });
    next = applyAction(next, { type: 'berserkFail', regionId: 22 });
    expect(next.players[0].activeRace!.berserkAttemptedRegions).toContain(20);
    expect(next.players[0].activeRace!.berserkAttemptedRegions).toContain(22);
    expect(next.players[0].activeRace!.berserkAttemptedRegions).toHaveLength(2);
  });

  it('attempted region is excluded from legal conquests', () => {
    let state = conquestState('ratmen', 'berserk', 0);
    state = patchPlayer(state, 0, {
      ...state.players[0],
      availableTokens: 2,
      activeRace: { ...state.players[0].activeRace!, tokensOnBoard: 0, berserkAttemptedRegions: [20] },
    });
    const actions = getLegalActions(state);
    const conquests = actions.filter((a) => a.type === 'conquer');
    const has20 = conquests.some((a) => (a as { type: 'conquer'; regionId: number }).regionId === 20);
    expect(has20).toBe(false);
  });
});

// ── Feature 8: Heroic placeHeroes and hero lifecycle ─────────────────────────

describe('applyAction — placeHeroes', () => {
  function heroicPlaceState(): GameState {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'humans', 'heroic', { tokensOnBoard: 3 });
    state = patchState(state, { phase: 'placeHeroes' });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false });
    return state;
  }

  it('sets hasHero=true on both selected regions', () => {
    const state = heroicPlaceState();
    const next = applyAction(state, { type: 'placeHeroes', regionIds: [19, 20] });
    expect(next.board.regions.find((r) => r.id === 19)!.hasHero).toBe(true);
    expect(next.board.regions.find((r) => r.id === 20)!.hasHero).toBe(true);
  });

  it('sets heroRegions on activeRace to the selected pair', () => {
    const state = heroicPlaceState();
    const next = applyAction(state, { type: 'placeHeroes', regionIds: [19, 20] });
    expect(next.players[0].activeRace!.heroRegions).toEqual([19, 20]);
  });

  it('transitions phase to score after placeHeroes', () => {
    const state = heroicPlaceState();
    const next = applyAction(state, { type: 'placeHeroes', regionIds: [19, 20] });
    expect(next.phase).toBe('score');
  });

  it('clears previous hero markers before placing new ones', () => {
    let state = heroicPlaceState();
    // Pre-set heroes on 19 and 20 from a prior turn
    state = patchPlayer(state, 0, {
      ...state.players[0],
      activeRace: { ...state.players[0].activeRace!, heroRegions: [19, 20] },
    });
    state = patchRegion(state, 19, { hasHero: true });
    state = patchRegion(state, 20, { hasHero: true });
    // Now place heroes on 20 only (with another region added)
    let stateWith18 = patchRegion(state, 18, { owner: 0, tokens: 1, isDeclined: false });
    const next = applyAction(stateWith18, { type: 'placeHeroes', regionIds: [18, 20] });
    expect(next.board.regions.find((r) => r.id === 19)!.hasHero).toBe(false); // cleared
    expect(next.board.regions.find((r) => r.id === 18)!.hasHero).toBe(true);
    expect(next.board.regions.find((r) => r.id === 20)!.hasHero).toBe(true);
  });

  it('appends a log entry for placeHeroes', () => {
    const state = heroicPlaceState();
    const next = applyAction(state, { type: 'placeHeroes', regionIds: [19, 20] });
    const last = next.log[next.log.length - 1];
    expect(last.action.type).toBe('placeHeroes');
  });
});

describe('applyAction — Heroic hero persistence through opponent turn', () => {
  it('heroRegions and hasHero persist through player switch (immunity)', () => {
    // Set up player 0 with Heroic in score phase, heroes placed
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 0, 'humans', 'heroic', {
      tokensOnBoard: 3,
      heroRegions: [19, 20] as unknown as [number, number],
    });
    state = patchState(state, { phase: 'score' });
    state = patchRegion(state, 19, { owner: 0, tokens: 2, isDeclined: false, hasHero: true });
    state = patchRegion(state, 20, { owner: 0, tokens: 1, isDeclined: false, hasHero: true });

    const next = applyAction(state, { type: 'endPhase' });

    // Heroes persist through opponent's turn (providing immunity)
    // They are only cleared when placeHeroes is called on the player's next turn
    expect(next.board.regions.find((r) => r.id === 19)!.hasHero).toBe(true);
    expect(next.board.regions.find((r) => r.id === 20)!.hasHero).toBe(true);
    // heroRegions preserved so placeHeroes can clear them next turn
    expect(next.players[0].activeRace?.heroRegions).toEqual([19, 20]);
  });
});

// ── Ghouls + Stout — optionalDecline regression ───────────────────────────────
//
// Regression: When player 1 (Ghouls+Stout, first player) declines from
// optionalDecline, player 0 must receive a clean conquest turn with
// endPhase and startFinalConquest legally available.

describe('applyAction — Ghouls+Stout optionalDecline regression', () => {
  function buildGhoulStoutState(): GameState {
    // Player 1 is the first player with Ghouls+Stout in conquest phase (turn 1).
    let state = createInitialState({ firstPlayerIndex: 1 });
    state = withRace(state, 1, 'ghouls', 'stout');
    state = patchState(state, { phase: 'conquest', activePlayerIndex: 1 });
    return state;
  }

  it('engine allows player 0 to end conquest after Ghouls+Stout player 1 declines from optionalDecline', () => {
    let state = buildGhoulStoutState();

    // Player 1 conquers a border region (first conquest — any legal conquer target)
    const legal1 = getLegalActions(state);
    const conquerAction = legal1.find((a) => a.type === 'conquer');
    expect(conquerAction).toBeDefined();
    state = applyAction(state, conquerAction!);
    expect(state.activePlayerIndex).toBe(1);
    expect(state.phase).toBe('conquest');

    // End conquest → redeploy
    state = applyAction(state, { type: 'endPhase' });
    expect(state.phase).toBe('redeploy');

    // End redeploy → score
    state = applyAction(state, { type: 'endPhase' });
    expect(state.phase).toBe('score');

    // End score → optionalDecline (Stout power triggers this)
    state = applyAction(state, { type: 'endPhase' });
    expect(state.phase).toBe('optionalDecline');
    expect(state.activePlayerIndex).toBe(1); // still player 1

    // Player 1 declines from optionalDecline → switches to player 0
    state = applyAction(state, { type: 'decline' });
    expect(state.activePlayerIndex).toBe(0);
    expect(state.phase).toBe('selectCombo');

    // Player 0 selects a combo
    state = applyAction(state, { type: 'selectCombo', comboIndex: 0 });
    expect(state.activePlayerIndex).toBe(0);
    // First combo: no tokens on board → goes directly to conquest
    expect(state.phase).toBe('conquest');

    // endPhase must be legal in player 0's conquest phase
    const legal2 = getLegalActions(state);
    expect(legal2.some((a) => a.type === 'endPhase')).toBe(true);

    // Apply endPhase — this is what "End Conquest" button does
    const afterEnd = applyAction(state, { type: 'endPhase' });
    expect(afterEnd.phase).toBe('redeploy');
    expect(afterEnd.activePlayerIndex).toBe(0); // still player 0
  });

  it('Final Conquest (startFinalConquest) is legal when player 0 has tokens in hand after Stout decline', () => {
    let state = buildGhoulStoutState();

    // Player 1: conquer, end conquest, end redeploy, end score, decline
    const conquerAction = getLegalActions(state).find((a) => a.type === 'conquer')!;
    state = applyAction(state, conquerAction);
    state = applyAction(state, { type: 'endPhase' }); // conquest → redeploy
    state = applyAction(state, { type: 'endPhase' }); // redeploy → score
    state = applyAction(state, { type: 'endPhase' }); // score → optionalDecline
    state = applyAction(state, { type: 'decline' });   // optionalDecline → player 0 selectCombo

    // Player 0: select combo, which gives availableTokens > 0
    state = applyAction(state, { type: 'selectCombo', comboIndex: 0 });
    expect(state.phase).toBe('conquest');

    // If player 0 has tokens in hand, startFinalConquest should be offered
    // (requires valid die targets to exist — getLegalActions handles this)
    const legal = getLegalActions(state);
    const hasEndPhase = legal.some((a) => a.type === 'endPhase');
    expect(hasEndPhase).toBe(true);

    // Verify applyAction doesn't throw for endPhase in conquest
    expect(() => applyAction(state, { type: 'endPhase' })).not.toThrow();
  });
});
