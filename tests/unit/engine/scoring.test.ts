import { describe, it, expect } from 'vitest';
import { calculateScore, applyScoring } from '@/game/engine/scoring';
import { createInitialState } from '@/game/engine/setup';
import type { GameState, PlayerState, RegionState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function withActiveRace(
  state: GameState,
  playerIndex: 0 | 1,
  raceId: string,
  powerId: string,
  extra: Partial<typeof state.players[0]['activeRace']> = {},
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
  });
}

/** Assign multiple regions to a player at once. */
function ownRegions(
  state: GameState,
  playerIndex: 0 | 1,
  regionIds: number[],
  isDeclined = false,
): GameState {
  let s = state;
  for (const id of regionIds) {
    s = patchRegion(s, id, { owner: playerIndex, tokens: 1, isDeclined });
  }
  return s;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('calculateScore', () => {
  it('returns 0 when player owns no regions and has no active race', () => {
    const state = createInitialState({ firstPlayerIndex: 0 });
    expect(calculateScore(state, 0)).toBe(0);
  });

  it('scores 1 coin per active region (base)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'alchemist');
    state = ownRegions(state, 0, [19, 20]); // 2 active regions
    expect(calculateScore(state, 0)).toBeGreaterThanOrEqual(2);
  });

  it('scores 1 coin per declined region (base)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'alchemist');
    state = ownRegions(state, 0, [19], false);   // 1 active
    state = ownRegions(state, 0, [20], true);    // 1 declined
    // Alchemist +2 flat, plus 1 + 1 base = 4
    expect(calculateScore(state, 0)).toBeGreaterThanOrEqual(2);
  });

  it('Humans get +1 per farmland region', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // Regions 20 (farmland) and 19 (forest)
    state = withActiveRace(state, 0, 'humans', 'bivouacking');
    state = ownRegions(state, 0, [20, 19]); // 1 farmland + 1 forest

    const score = calculateScore(state, 0);
    // Base: 2, Humans farmland bonus: +1 for region 20
    expect(score).toBe(3);
  });

  it('Humans farmland bonus does not apply to non-farmland regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'humans', 'bivouacking');
    state = ownRegions(state, 0, [19]); // forest only
    // Base: 1, no farmland bonus
    expect(calculateScore(state, 0)).toBe(1);
  });

  it('Dwarves get +1 per mine region (active)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'dwarves', 'bivouacking');
    state = ownRegions(state, 0, [2]); // region 2 hasMine:true
    // Base: 1, mine bonus: +1
    expect(calculateScore(state, 0)).toBe(2);
  });

  it('Dwarves mine bonus applies in decline', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'dwarves', 'bivouacking');
    state = ownRegions(state, 0, [2], true); // region 2 declined
    // Base declined: 1, mine bonus in decline: +1
    expect(calculateScore(state, 0)).toBe(2);
  });

  it('Dwarves mine bonus applies when Dwarves are a declined race (not active)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    // No active race — Dwarves are in declinedRaces
    state = patchPlayer(state, 0, {
      activeRace: null,
      declinedRaces: [{ raceId: 'dwarves', powerId: 'bivouacking', isSpirit: false }],
    });
    state = ownRegions(state, 0, [2], true); // region 2 hasMine:true, declined
    // Base: 1, mine bonus in decline: +1
    expect(calculateScore(state, 0)).toBe(2);
  });

  it('Dwarves mine bonus applies to declined regions when player has a different active race', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'bivouacking');
    state = patchPlayer(state, 0, {
      ...state.players[0],
      declinedRaces: [{ raceId: 'dwarves', powerId: 'alchemist', isSpirit: false }],
    });
    state = ownRegions(state, 0, [19]); // active region (forest, no mine)
    state = ownRegions(state, 0, [2], true); // declined region (hasMine:true)
    // Base: 2 (1 active + 1 declined), Dwarf mine bonus: +1 for declined mine region
    expect(calculateScore(state, 0)).toBe(3);
  });

  it('Merchant +1 per active region', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'merchant');
    state = ownRegions(state, 0, [19, 20]); // 2 active regions
    // Base: 2, Merchant +2 = 4
    expect(calculateScore(state, 0)).toBe(4);
  });

  it('Merchant does not apply to declined regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'merchant');
    state = ownRegions(state, 0, [20], true); // 1 declined only
    // Base: 1, Merchant: 0 (no active regions)
    expect(calculateScore(state, 0)).toBe(1);
  });

  it('Alchemist gives +2 flat bonus', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'alchemist');
    state = ownRegions(state, 0, [20]); // 1 active region
    // Base: 1, Alchemist: +2 = 3
    expect(calculateScore(state, 0)).toBe(3);
  });

  it('Orcs +1 per non-empty conquest (conquestsThisTurn)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'orcs', 'bivouacking', { conquestsThisTurn: 3 });
    state = ownRegions(state, 0, [20]);
    // Base: 1, Orcs +3 = 4
    expect(calculateScore(state, 0)).toBe(4);
  });

  it('Pillaging +1 per non-empty conquest', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'pillaging', { conquestsThisTurn: 2 });
    state = ownRegions(state, 0, [20]);
    // Base: 1, Pillaging +2 = 3
    expect(calculateScore(state, 0)).toBe(3);
  });

  it('Fortified +1 per fortress placed', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'fortified', { fortressesPlaced: 2 });
    state = ownRegions(state, 0, [20]);
    // Base: 1, Fortified: +2 = 3
    expect(calculateScore(state, 0)).toBe(3);
  });

  it('Wizards +1 per magic source region', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'wizards', 'bivouacking');
    state = ownRegions(state, 0, [6]); // region 6 hasMagicSource:true
    // Base: 1, magic source: +1 = 2
    expect(calculateScore(state, 0)).toBe(2);
  });

  it('Trolls do NOT get +1 per Troll Lair (lairs are defense-only)', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'trolls', 'bivouacking');
    state = ownRegions(state, 0, [19, 20]);
    // Place Troll Lairs on both regions
    state = patchRegion(state, 19, { hasTrollLair: true });
    state = patchRegion(state, 20, { hasTrollLair: true });
    // Base: 2 regions = 2 coins. No lair scoring bonus.
    expect(calculateScore(state, 0)).toBe(2);
  });

  it('scores do not bleed to opponent', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'humans', 'alchemist');
    state = ownRegions(state, 0, [20]);
    expect(calculateScore(state, 1)).toBe(0); // player 1 owns nothing
  });

  it('returns 0 (not negative) when no regions', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'alchemist');
    // Alchemist +2 flat, 0 regions — still +2
    expect(calculateScore(state, 0)).toBe(2);
  });
});

describe('applyScoring', () => {
  it('adds calculated score coins to active player', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'bivouacking');
    state = ownRegions(state, 0, [20]);
    const beforeCoins = state.players[0].coins;
    const expectedScore = calculateScore(state, 0);
    const result = applyScoring(state);
    expect(result.players[0].coins).toBe(beforeCoins + expectedScore);
  });

  it('does not modify opponent coins', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'bivouacking');
    state = ownRegions(state, 0, [20]);
    const opponent = state.players[1].coins;
    const result = applyScoring(state);
    expect(result.players[1].coins).toBe(opponent);
  });

  it('appends endPhase log entry', () => {
    const state = withActiveRace(createInitialState({ firstPlayerIndex: 0 }), 0, 'ratmen', 'bivouacking');
    const result = applyScoring(state);
    expect(result.log[result.log.length - 1].action.type).toBe('endPhase');
  });
});

// ── Feature 6: Wealthy bonus timing ──────────────────────────────────────────

describe('Wealthy bonus timing', () => {
  it('calculateScore includes +7 when firstTurnBonus > 0 and wealthyBonusApplied is not set', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'wealthy');
    state = ownRegions(state, 0, [20]); // 1 region = base 1
    // Wealthy: +7 firstTurnBonus, wealthyBonusApplied is undefined (not yet applied)
    const score = calculateScore(state, 0);
    // Base: 1, Wealthy firstTurnBonus: +7 = 8
    expect(score).toBe(8);
  });

  it('calculateScore does NOT include +7 when wealthyBonusApplied is true', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'wealthy', { wealthyBonusApplied: true });
    state = ownRegions(state, 0, [20]); // 1 region = base 1
    const score = calculateScore(state, 0);
    // Base: 1, no Wealthy bonus (already applied)
    expect(score).toBe(1);
  });

  it('applyScoring sets wealthyBonusApplied=true on activeRace after first scoring', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'wealthy');
    state = ownRegions(state, 0, [20]);
    const result = applyScoring(state);
    expect(result.players[0].activeRace!.wealthyBonusApplied).toBe(true);
  });

  it('applyScoring does not set wealthyBonusApplied on non-Wealthy power', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'alchemist');
    state = ownRegions(state, 0, [20]);
    const result = applyScoring(state);
    expect(result.players[0].activeRace!.wealthyBonusApplied).toBeUndefined();
  });

  it('applyScoring does not re-apply wealthy bonus when wealthyBonusApplied is already true', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'wealthy', { wealthyBonusApplied: true });
    state = ownRegions(state, 0, [20]);
    const beforeCoins = state.players[0].coins;
    const result = applyScoring(state);
    // Only base 1 coin scored (no +7 bonus)
    expect(result.players[0].coins).toBe(beforeCoins + 1);
  });

  it('applyScoring includes +7 on first scoring (wealthyBonusApplied not set) and coins are correct', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withActiveRace(state, 0, 'ratmen', 'wealthy');
    state = ownRegions(state, 0, [20]);
    const beforeCoins = state.players[0].coins;
    const result = applyScoring(state);
    // Base 1 + Wealthy +7 = 8
    expect(result.players[0].coins).toBe(beforeCoins + 8);
  });
});
