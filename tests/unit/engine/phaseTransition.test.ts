import { describe, it, expect } from 'vitest';
import { getNextPhase, getStartingPhaseForNextPlayer } from '@/game/engine/phaseTransition';
import type { GameState, PlayerState } from '@/game/state/types';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    coins: 5,
    activeRace: null,
    declinedRaces: [],
    availableTokens: 0,
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    round: 0,
    phase: 'selectCombo',
    activePlayerIndex: 0,
    firstPlayerIndex: 0,
    players: [makePlayer(), makePlayer()],
    board: { regions: [] },
    comboShop: { visible: [], raceDeck: [], powerDeck: [] },
    reinforcementDie: null,
    log: [],
    ...overrides,
  };
}

// ── Phase transition tests ────────────────────────────────────────────────────

describe('getNextPhase', () => {
  describe('selectCombo', () => {
    it('transitions to readyTroops when no ghouls in decline', () => {
      const state = makeState({ phase: 'selectCombo' });
      expect(getNextPhase(state, { type: 'selectCombo', comboIndex: 0 })).toBe('readyTroops');
    });

    it('transitions to ghoulConquest when ghouls are in decline', () => {
      const player = makePlayer({
        declinedRaces: [{ raceId: 'ghouls', powerId: 'flying', isSpirit: false }],
      });
      const state = makeState({ phase: 'selectCombo', players: [player, makePlayer()] });
      expect(getNextPhase(state, { type: 'selectCombo', comboIndex: 0 })).toBe('ghoulConquest');
    });
  });

  describe('ghoulConquest', () => {
    it('stays in ghoulConquest on conquest action', () => {
      const state = makeState({ phase: 'ghoulConquest' });
      expect(getNextPhase(state, { type: 'ghoulConquer', regionId: 1 })).toBe('ghoulConquest');
    });

    it('transitions to readyTroops on endPhase', () => {
      const state = makeState({ phase: 'ghoulConquest' });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('readyTroops');
    });
  });

  describe('readyTroops', () => {
    it('stays in readyTroops on pickUpTokens', () => {
      const state = makeState({ phase: 'readyTroops' });
      expect(getNextPhase(state, { type: 'pickUpTokens', regionId: 1, count: 2 })).toBe('readyTroops');
    });

    it('transitions to conquest on endPhase', () => {
      const state = makeState({ phase: 'readyTroops' });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('conquest');
    });
  });

  describe('conquest', () => {
    it('stays in conquest on a conquer action', () => {
      const state = makeState({ phase: 'conquest' });
      expect(getNextPhase(state, { type: 'conquer', regionId: 2 })).toBe('conquest');
    });

    it('transitions to redeploy via endPhase when no tokens available', () => {
      const state = makeState({
        phase: 'conquest',
        players: [makePlayer({ availableTokens: 0 }), makePlayer()],
      });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('redeploy');
    });

    it('transitions to reinforcementDie via endPhase when tokens available', () => {
      const state = makeState({
        phase: 'conquest',
        players: [makePlayer({ availableTokens: 1 }), makePlayer()],
      });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('reinforcementDie');
    });

    it('transitions to decline on decline action', () => {
      const state = makeState({ phase: 'conquest' });
      expect(getNextPhase(state, { type: 'decline' })).toBe('decline');
    });
  });

  describe('reinforcementDie', () => {
    it('always transitions to redeploy', () => {
      const state = makeState({ phase: 'reinforcementDie' });
      expect(getNextPhase(state, { type: 'useReinforcement', regionId: 1, dieResult: 2 })).toBe('redeploy');
    });
  });

  describe('redeploy', () => {
    it('stays in redeploy on redeploy action', () => {
      const state = makeState({ phase: 'redeploy' });
      expect(getNextPhase(state, { type: 'redeploy', deployment: new Map() })).toBe('redeploy');
    });

    it('transitions to score on endPhase', () => {
      const state = makeState({ phase: 'redeploy' });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('score');
    });
  });

  describe('decline', () => {
    it('transitions to score', () => {
      const state = makeState({ phase: 'decline' });
      expect(getNextPhase(state, { type: 'decline' })).toBe('score');
    });
  });

  describe('score', () => {
    it('advances turn (to selectCombo for next player with no race) on endPhase', () => {
      // P0 just finished turn; P1 has no active race
      const state = makeState({
        phase: 'score',
        activePlayerIndex: 0,
        firstPlayerIndex: 0,
        players: [
          makePlayer({ activeRace: null }),
          makePlayer({ activeRace: null }),
        ],
      });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('selectCombo');
    });

    it('offers optionalDecline when active race has Stout power', () => {
      const state = makeState({
        phase: 'score',
        players: [
          makePlayer({
            activeRace: {
              raceId: 'humans',
              powerId: 'stout',
              maxSupply: 10,
              totalTokens: 9,
              tokensOnBoard: 9,
              conquestsThisTurn: 0,
              hasDeclinedThisTurn: false,
            },
          }),
          makePlayer(),
        ],
      });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('optionalDecline');
    });

    it('does NOT offer optionalDecline when Stout player already declined', () => {
      const state = makeState({
        phase: 'score',
        players: [
          makePlayer({
            activeRace: {
              raceId: 'humans',
              powerId: 'stout',
              maxSupply: 10,
              totalTokens: 9,
              tokensOnBoard: 9,
              conquestsThisTurn: 0,
              hasDeclinedThisTurn: true,
            },
          }),
          makePlayer(),
        ],
      });
      // Should advance turn instead
      const phase = getNextPhase(state, { type: 'endPhase' });
      expect(phase).not.toBe('optionalDecline');
    });
  });

  describe('gameOver detection', () => {
    it('returns gameOver after both players complete turn 10', () => {
      // P0 (first player) is about to take turn 11 — game should end
      const state = makeState({
        phase: 'score',
        turn: 10,
        activePlayerIndex: 1, // P1 just finished their turn 10 half
        firstPlayerIndex: 0,
        players: [makePlayer(), makePlayer()],
      });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('gameOver');
    });

    it('does NOT end game after P0 finishes their turn 10 (P1 still needs to go)', () => {
      const state = makeState({
        phase: 'score',
        turn: 10,
        activePlayerIndex: 0,
        firstPlayerIndex: 0,
        players: [makePlayer(), makePlayer()],
      });
      expect(getNextPhase(state, { type: 'endPhase' })).not.toBe('gameOver');
    });
  });
});

describe('getStartingPhaseForNextPlayer', () => {
  it('returns selectCombo when next player has no active race', () => {
    const state = makeState({
      activePlayerIndex: 0,
      players: [makePlayer(), makePlayer({ activeRace: null })],
    });
    expect(getStartingPhaseForNextPlayer(state)).toBe('selectCombo');
  });

  it('returns ghoulConquest when next player has ghouls in decline', () => {
    const player1 = makePlayer({
      activeRace: {
        raceId: 'orcs',
        powerId: 'flying',
        maxSupply: 10,
        totalTokens: 10,
        tokensOnBoard: 10,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
      },
      declinedRaces: [{ raceId: 'ghouls', powerId: 'hill', isSpirit: false }],
    });
    const state = makeState({
      activePlayerIndex: 0,
      players: [makePlayer(), player1],
    });
    expect(getStartingPhaseForNextPlayer(state)).toBe('ghoulConquest');
  });
});
