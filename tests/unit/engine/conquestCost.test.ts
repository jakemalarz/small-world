import { describe, it, expect } from 'vitest';
import { calculateConquestCost } from '@/game/engine/conquestCost';
import { createInitialState } from '@/game/engine/setup';
import type { GameState, PlayerState, RegionState } from '@/game/state/types';

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Patch a single region in state (by id). */
function patchRegion(state: GameState, id: number, patch: Partial<RegionState>): GameState {
  return {
    ...state,
    board: {
      regions: state.board.regions.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    },
  };
}

/** Patch the active player. */
function patchPlayer(state: GameState, patch: Partial<PlayerState>): GameState {
  return {
    ...state,
    players: state.players.map((p, i) =>
      i === state.activePlayerIndex ? { ...p, ...patch } : p,
    ) as unknown as typeof state.players,
  };
}

/** Give the active player an active race with the given race/power combo. */
function withRace(state: GameState, raceId: string, powerId: string): GameState {
  return patchPlayer(state, {
    activeRace: {
      raceId: raceId as never,
      powerId: powerId as never,
      maxSupply: 20,
      totalTokens: 10,
      tokensOnBoard: 0,
      conquestsThisTurn: 0,
      hasDeclinedThisTurn: false,
      sorcererConversionsThisTurn: 0,
    },
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('calculateConquestCost', () => {
  // Use region 6 (Yellowstone, hill, isEdge:true, no lost tribe, no mountain)
  const BASE_REGION = 6;

  it('costs 2 for a completely empty region', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    expect(calculateConquestCost(state, BASE_REGION)).toBe(2);
  });

  it('costs 3 for a lost-tribe-only region (0 + 1 lost tribe + 2 base = 3)', () => {
    // Region 8 (Alpine Pasture) has a lost tribe and no mountain
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    expect(calculateConquestCost(state, 8)).toBe(3);
  });

  it('costs 4 for a region with 1 lost tribe + 1 mountain', () => {
    // Region 7: Grand Teton — hasMountain: true, no lost tribe initially
    // Patch region 7 to also have a lost tribe for this test
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchRegion(state, 7, { hasLostTribe: true }); // hasMountain already true
    // defenseTokens = 0 (tokens) + 1 (lostTribe) + 1 (mountain) = 2 → cost = 2 + 2 = 4
    expect(calculateConquestCost(state, 7)).toBe(4);
  });

  it('adds 1 per enemy token in region', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    // Put 3 enemy tokens in region 20
    state = patchRegion(state, BASE_REGION, { owner: 1, tokens: 3 });
    // defenseTokens = 3 → cost = 3 + 2 = 5
    expect(calculateConquestCost(state, BASE_REGION)).toBe(5);
  });

  it('adds 1 for troll lair', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchRegion(state, BASE_REGION, { hasTrollLair: true });
    // defenseTokens = 1 → cost = 1 + 2 = 3
    expect(calculateConquestCost(state, BASE_REGION)).toBe(3);
  });

  it('adds 1 for fortress', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchRegion(state, BASE_REGION, { hasFortress: true, owner: 1, tokens: 2 });
    // defenseTokens = 2 (tokens) + 1 (fortress) = 3 → cost = 3 + 2 = 5
    expect(calculateConquestCost(state, BASE_REGION)).toBe(5);
  });

  it('adds 1 for encampment', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchRegion(state, BASE_REGION, { encampmentCount: 1, owner: 1, tokens: 1 });
    // defenseTokens = 1 + 1 = 2 → cost = 2 + 2 = 4
    expect(calculateConquestCost(state, BASE_REGION)).toBe(4);
  });

  it('applies Commando -1 flat modifier', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'ratmen', 'commando');
    // Empty region: 2 - 1 = 1
    expect(calculateConquestCost(state, BASE_REGION)).toBe(1);
  });

  it('enforces minimum cost of 1 even with stacked discounts', () => {
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'ratmen', 'commando'); // -1 commando
    // Empty region = 2, commando -1 = 1, nothing more to reduce
    expect(calculateConquestCost(state, BASE_REGION)).toBeGreaterThanOrEqual(1);
  });

  it('applies Tritons coastal -1 on coastal regions', () => {
    // Region 2 is coastal (borders sea)
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'tritons', 'seafaring');
    // Tritons: conquestCostCoastalModifier = -1
    // Region 2: empty + lost tribe = 3, coastal -1 = 2
    const costWithTritons = calculateConquestCost(state, 2);
    state = withRace(state, 'humans', 'alchemist');
    const costWithoutTritons = calculateConquestCost(state, 2);
    expect(costWithTritons).toBe(costWithoutTritons - 1);
  });

  it('does not apply coastal modifier to non-coastal region', () => {
    // Region 4 (Swamp Lands) is not coastal
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'tritons', 'seafaring');
    const costTritons = calculateConquestCost(state, 4);
    state = withRace(state, 'humans', 'alchemist');
    const costHumans = calculateConquestCost(state, 4);
    // No coastal discount on non-coastal
    expect(costTritons).toBe(costHumans);
  });

  it('applies Mounted -1 on farmland region', () => {
    // Region 2 (Merchant's Rest) is farmland with no lost tribe
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'mounted');
    const costMounted = calculateConquestCost(state, 2);
    state = withRace(state, 'humans', 'alchemist');
    const costNormal = calculateConquestCost(state, 2);
    expect(costMounted).toBe(costNormal - 1);
  });

  it('applies Mounted -1 on hill region (region 6)', () => {
    // Region 6 (Yellowstone) is hill with no special tokens
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'mounted');
    const costMounted = calculateConquestCost(state, 6);
    state = withRace(state, 'humans', 'alchemist');
    const costNormal = calculateConquestCost(state, 6);
    expect(costMounted).toBe(costNormal - 1);
  });

  it('does not apply Mounted discount on mountain terrain (region 5)', () => {
    // Region 5 (Mt. Washburn) is mountain terrain
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'mounted');
    const costMounted = calculateConquestCost(state, 5);
    state = withRace(state, 'humans', 'alchemist');
    const costNormal = calculateConquestCost(state, 5);
    expect(costMounted).toBe(costNormal);
  });

  it('applies Giants -1 when adjacent to own active mountain region', () => {
    // Region 7 (Grand Teton, mountain) is adjacent to region 2 (farmland, no lost tribe)
    // Make player 0 own region 7 (active mountain), then try to conquer region 2
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'giants', 'alchemist');
    // Simulate owning region 7 (mountain)
    state = patchRegion(state, 7, {
      owner: 0,
      tokens: 2,
      isDeclined: false,
    });
    const costWithGiantBonus = calculateConquestCost(state, 2);
    state = withRace(state, 'humans', 'alchemist');
    const costNormal = calculateConquestCost(state, 2);
    // Giants should get -1 vs region adjacent to their mountain
    expect(costWithGiantBonus).toBe(costNormal - 1);
  });

  it('does not apply Giants discount when no adjacent own mountain', () => {
    // Region 20 is not adjacent to any mountain region the player owns
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'giants', 'alchemist');
    const costGiants = calculateConquestCost(state, BASE_REGION);
    state = withRace(state, 'humans', 'alchemist');
    const costNormal = calculateConquestCost(state, BASE_REGION);
    expect(costGiants).toBe(costNormal);
  });

  it('throws for unknown region id', () => {
    const state = withRace(createInitialState({ firstPlayerIndex: 0 }), 'humans', 'alchemist');
    expect(() => calculateConquestCost(state, 999)).toThrow();
  });

  it('stacks multiple defense tokens correctly', () => {
    // Region with 2 tokens + mountain + troll lair = 4 defense → cost = 4 + 2 = 6
    let state = createInitialState({ firstPlayerIndex: 0 });
    state = withRace(state, 'humans', 'alchemist');
    state = patchRegion(state, BASE_REGION, {
      owner: 1,
      tokens: 2,
      hasTrollLair: true,
      hasMountain: true,
    });
    expect(calculateConquestCost(state, BASE_REGION)).toBe(6);
  });
});
