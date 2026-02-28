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
    it('transitions to conquest when player has no tokens on board (turn 1)', () => {
      const state = makeState({ phase: 'selectCombo' });
      expect(getNextPhase(state, { type: 'selectCombo', comboIndex: 0 })).toBe('conquest');
    });

    it('transitions to readyTroops when player has tokens on board (turn 2+)', () => {
      const state = makeState({
        phase: 'selectCombo',
        turn: 2,
        players: [
          makePlayer({
            activeRace: {
              raceId: 'orcs', powerId: 'flying', maxSupply: 10,
              totalTokens: 10, tokensOnBoard: 5, conquestsThisTurn: 0,
              hasDeclinedThisTurn: false,
              sorcererConversionsThisTurn: 0,
            },
          }),
          makePlayer(),
        ],
      });
      expect(getNextPhase(state, { type: 'selectCombo', comboIndex: 0 })).toBe('readyTroops');
    });

    it('transitions to ghoulReadyTroops when ghouls are in decline', () => {
      const player = makePlayer({
        declinedRaces: [{ raceId: 'ghouls', powerId: 'flying',  }],
      });
      const state = makeState({ phase: 'selectCombo', players: [player, makePlayer()] });
      expect(getNextPhase(state, { type: 'selectCombo', comboIndex: 0 })).toBe('ghoulReadyTroops');
    });
  });

  describe('ghoulReadyTroops', () => {
    it('transitions to ghoulConquest on endPhase', () => {
      const state = makeState({ phase: 'ghoulReadyTroops' });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('ghoulConquest');
    });

    it('stays in ghoulReadyTroops on ghoulPickUpTokens', () => {
      const state = makeState({ phase: 'ghoulReadyTroops' });
      expect(getNextPhase(state, { type: 'ghoulPickUpTokens', regionId: 1, count: 1 })).toBe('ghoulReadyTroops');
    });
  });

  describe('ghoulConquest', () => {
    it('stays in ghoulConquest on conquest action', () => {
      const state = makeState({ phase: 'ghoulConquest' });
      expect(getNextPhase(state, { type: 'ghoulConquer', regionId: 1 })).toBe('ghoulConquest');
    });

    it('transitions to ghoulRedeploy on endPhase', () => {
      const state = makeState({ phase: 'ghoulConquest' });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('ghoulRedeploy');
    });

    it('transitions to ghoulReinforcementDie via startGhoulFinalConquest', () => {
      const state = makeState({ phase: 'ghoulConquest' });
      expect(getNextPhase(state, { type: 'startGhoulFinalConquest' })).toBe('ghoulReinforcementDie');
    });
  });

  describe('ghoulReinforcementDie', () => {
    it('transitions to ghoulRedeploy on ghoulUseReinforcement', () => {
      const state = makeState({ phase: 'ghoulReinforcementDie' });
      expect(getNextPhase(state, { type: 'ghoulUseReinforcement', regionId: 1, dieResult: 2 })).toBe('ghoulRedeploy');
    });

    it('transitions to ghoulRedeploy on endPhase', () => {
      const state = makeState({ phase: 'ghoulReinforcementDie' });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('ghoulRedeploy');
    });
  });

  describe('ghoulRedeploy', () => {
    it('transitions to conquest on endPhase when no tokens on board', () => {
      const state = makeState({ phase: 'ghoulRedeploy' });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('conquest');
    });

    it('transitions to readyTroops on endPhase when player has tokens on board', () => {
      const state = makeState({
        phase: 'ghoulRedeploy',
        players: [
          makePlayer({
            activeRace: {
              raceId: 'orcs', powerId: 'flying', maxSupply: 10,
              totalTokens: 10, tokensOnBoard: 5, conquestsThisTurn: 0,
              hasDeclinedThisTurn: false,
              sorcererConversionsThisTurn: 0,
            },
          }),
          makePlayer(),
        ],
      });
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

    it('transitions to redeploy via endPhase even when tokens available', () => {
      const state = makeState({
        phase: 'conquest',
        players: [makePlayer({ availableTokens: 1 }), makePlayer()],
      });
      expect(getNextPhase(state, { type: 'endPhase' })).toBe('redeploy');
    });

    it('transitions to reinforcementDie via startFinalConquest', () => {
      const state = makeState({
        phase: 'conquest',
        players: [makePlayer({ availableTokens: 1 }), makePlayer()],
      });
      expect(getNextPhase(state, { type: 'startFinalConquest' })).toBe('reinforcementDie');
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
              sorcererConversionsThisTurn: 0,
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
              sorcererConversionsThisTurn: 0,
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

// ── Feature 8: Heroic — redeploy → placeHeroes transition ────────────────────

describe('getNextPhase — Heroic placeHeroes transition', () => {
  it('redeploy → placeHeroes when player has Heroic and >= 2 owned active regions', () => {
    const state = makeState({
      phase: 'redeploy',
      players: [
        makePlayer({
          activeRace: {
            raceId: 'humans',
            powerId: 'heroic',
            maxSupply: 10,
            totalTokens: 8,
            tokensOnBoard: 3,
            conquestsThisTurn: 0,
            hasDeclinedThisTurn: false,
            sorcererConversionsThisTurn: 0,
          },
        }),
        makePlayer(),
      ],
      board: {
        regions: [
          // 2 active owned regions
          { id: 19, owner: 0, tokens: 2, isDeclined: false } as never,
          { id: 20, owner: 0, tokens: 1, isDeclined: false } as never,
        ],
      },
    });
    expect(getNextPhase(state, { type: 'endPhase' })).toBe('placeHeroes');
  });

  it('redeploy → score when player has Heroic but only 1 owned active region', () => {
    const state = makeState({
      phase: 'redeploy',
      players: [
        makePlayer({
          activeRace: {
            raceId: 'humans',
            powerId: 'heroic',
            maxSupply: 10,
            totalTokens: 8,
            tokensOnBoard: 1,
            conquestsThisTurn: 0,
            hasDeclinedThisTurn: false,
            sorcererConversionsThisTurn: 0,
          },
        }),
        makePlayer(),
      ],
      board: {
        regions: [
          { id: 20, owner: 0, tokens: 1, isDeclined: false } as never,
        ],
      },
    });
    expect(getNextPhase(state, { type: 'endPhase' })).toBe('score');
  });

  it('redeploy → score when player has Heroic but 0 owned active regions', () => {
    const state = makeState({
      phase: 'redeploy',
      players: [
        makePlayer({
          activeRace: {
            raceId: 'humans',
            powerId: 'heroic',
            maxSupply: 10,
            totalTokens: 8,
            tokensOnBoard: 0,
            conquestsThisTurn: 0,
            hasDeclinedThisTurn: false,
            sorcererConversionsThisTurn: 0,
          },
        }),
        makePlayer(),
      ],
      board: { regions: [] },
    });
    expect(getNextPhase(state, { type: 'endPhase' })).toBe('score');
  });

  it('redeploy → score when player does NOT have Heroic (even with 2+ owned regions)', () => {
    const state = makeState({
      phase: 'redeploy',
      players: [
        makePlayer({
          activeRace: {
            raceId: 'humans',
            powerId: 'bivouacking',
            maxSupply: 10,
            totalTokens: 8,
            tokensOnBoard: 3,
            conquestsThisTurn: 0,
            hasDeclinedThisTurn: false,
            sorcererConversionsThisTurn: 0,
          },
        }),
        makePlayer(),
      ],
      board: {
        regions: [
          { id: 19, owner: 0, tokens: 2, isDeclined: false } as never,
          { id: 20, owner: 0, tokens: 1, isDeclined: false } as never,
        ],
      },
    });
    expect(getNextPhase(state, { type: 'endPhase' })).toBe('score');
  });

  it('placeHeroes always transitions to score', () => {
    const state = makeState({ phase: 'placeHeroes' });
    expect(getNextPhase(state, { type: 'placeHeroes', regionIds: [19, 20] })).toBe('score');
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

  it('returns ghoulReadyTroops when next player has ghouls in decline', () => {
    const player1 = makePlayer({
      activeRace: {
        raceId: 'orcs',
        powerId: 'flying',
        maxSupply: 10,
        totalTokens: 10,
        tokensOnBoard: 10,
        conquestsThisTurn: 0,
        hasDeclinedThisTurn: false,
        sorcererConversionsThisTurn: 0,
      },
      declinedRaces: [{ raceId: 'ghouls', powerId: 'hill',  }],
    });
    const state = makeState({
      activePlayerIndex: 0,
      players: [makePlayer(), player1],
    });
    expect(getStartingPhaseForNextPlayer(state)).toBe('ghoulReadyTroops');
  });
});
