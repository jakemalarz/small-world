import type { GameState, RegionState } from '@/game/state/types';
import { getActiveModifiers } from '@/game/abilities/modifiers';

// ── Scoring Engine ────────────────────────────────────────────────────────────
//
// End-of-turn Victory Coins awarded to playerIndex:
//
//   Base    +1 per occupied region (active + declined)
//   Race/power bonuses (all additive):
//     terrainBonuses          +N per active region matching terrain
//     featureBonuses          +N per region with feature (some count in decline)
//     bonusPerRegion          Merchant: +1 per active region
//     bonusPerNonEmptyConquest Orcs/Pillaging: +1 per non-empty conquest
//     flatBonusPerTurn        Alchemist: +2 flat
//     fortressesPlaced        Fortified: +1 per placed fortress (active only)
//
// Notes:
//   - Wealthy's firstTurnBonus (+7) is applied in applySelectCombo, not here.
//   - conquestsThisTurn in ActiveRaceState tracks non-empty conquests only.

/** Look up a boolean feature field on a region. */
function regionHasFeature(
  region: RegionState,
  feature: 'mine' | 'magicSource' | 'cavern',
): boolean {
  switch (feature) {
    case 'mine':        return region.hasMine;
    case 'magicSource': return region.hasMagicSource;
    case 'cavern':      return region.hasCavern;
  }
}

/**
 * Calculate Victory Coins earned by playerIndex at the end of their turn.
 * Does NOT mutate state — caller is responsible for adding coins to player.
 *
 * @returns Non-negative integer coins earned.
 */
export function calculateScore(state: GameState, playerIndex: 0 | 1): number {
  const player = state.players[playerIndex];

  const activeRegions = state.board.regions.filter(
    (r) => r.owner === playerIndex && !r.isDeclined,
  );
  const declinedRegions = state.board.regions.filter(
    (r) => r.owner === playerIndex && r.isDeclined,
  );

  // ── Base: 1 coin per occupied region ─────────────────────────────────────
  let coins = activeRegions.length + declinedRegions.length;

  if (!player.activeRace) return coins; // no race → only base scoring

  const mods = getActiveModifiers(player);

  // ── Terrain bonuses (active regions only) ─────────────────────────────────
  for (const tb of mods.terrainBonuses) {
    coins += activeRegions.filter((r) => r.terrain === tb.terrain).length * tb.bonus;
  }

  // ── Feature bonuses (some apply in decline too) ────────────────────────────
  for (const fb of mods.featureBonuses) {
    const regions = fb.appliesInDecline
      ? [...activeRegions, ...declinedRegions]
      : activeRegions;
    coins += regions.filter((r) => regionHasFeature(r, fb.feature)).length * fb.bonus;
  }

  // ── Merchant: +1 per active region ────────────────────────────────────────
  if (mods.bonusPerRegion > 0) {
    coins += activeRegions.length * mods.bonusPerRegion;
  }

  // ── Orcs / Pillaging: +1 per non-empty region conquered this turn ─────────
  if (mods.bonusPerNonEmptyConquest > 0) {
    coins += player.activeRace.conquestsThisTurn * mods.bonusPerNonEmptyConquest;
  }

  // ── Alchemist: +2 flat bonus ───────────────────────────────────────────────
  coins += mods.flatBonusPerTurn;

  // ── Fortified: +1 per fortress placed (active only) ───────────────────────
  if (mods.placesLair) {
    // Trolls place lairs; the board tracks hasTrollLair per region.
    coins += activeRegions.filter((r) => r.hasTrollLair).length;
  }
  if (player.activeRace.fortressesPlaced && player.activeRace.fortressesPlaced > 0) {
    // Fortified power: fortresses on active regions each give +1.
    // fortressesPlaced is the total placed; we award all of them.
    coins += player.activeRace.fortressesPlaced;
  }

  return Math.max(0, coins);
}

/**
 * Return a new GameState with scoring applied to the active player.
 * Adds calculated coins to player.coins.
 */
export function applyScoring(state: GameState): GameState {
  const score = calculateScore(state, state.activePlayerIndex);

  const newPlayers = state.players.map((p, i) =>
    i === state.activePlayerIndex ? { ...p, coins: p.coins + score } : p,
  ) as unknown as typeof state.players;

  return {
    ...state,
    players: newPlayers,
    log: [
      ...state.log,
      {
        turn: state.turn,
        playerIndex: state.activePlayerIndex,
        phase: state.phase,
        action: { type: 'endPhase' },
      },
    ],
  };
}
