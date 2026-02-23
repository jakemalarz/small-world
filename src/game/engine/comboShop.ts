import type { GameState, ComboSlot, ActiveRaceState, RaceId, PowerId } from '@/game/state/types';
import { RACES } from '@/game/data/races';
import { POWERS } from '@/game/data/powers';

// ── Combo Shop Logic ──────────────────────────────────────────────────────────
//
// Shop rules:
//   • Index 0 is always free (top of stack).
//   • Selecting combo at index i costs i coins (placed as +1 coin each on
//     combos 0 … i-1 that were skipped).
//   • The selected combo may have accumulated coins from prior skips — the
//     player collects those coins.
//   • After selection the shop shifts: combo is removed, remaining combos
//     retain their positions, and a new combo is dealt to the bottom.
//   • When decks are exhausted no new combo is added (shop shrinks).
//
// Wealthy power: the +7 first-turn-bonus is applied during the scoring phase
// on the player's first scoring turn with the Wealthy power (see scoring.ts).

/**
 * Apply a combo selection to the game state.
 *
 * @param state     Current immutable GameState.
 * @param comboIndex  0-based index into comboShop.visible (0 = top/free slot).
 * @returns New GameState after the combo has been selected.
 * @throws  If comboIndex is out of range or player cannot afford the cost.
 */
export function applySelectCombo(state: GameState, comboIndex: number): GameState {
  const shop = state.comboShop;

  if (comboIndex < 0 || comboIndex >= shop.visible.length) {
    throw new Error(`comboIndex ${comboIndex} out of range (0–${shop.visible.length - 1})`);
  }

  const cost = comboIndex; // coins required to skip past combos above this one
  const player = state.players[state.activePlayerIndex];

  if (player.coins < cost) {
    throw new Error(
      `Player ${state.activePlayerIndex} cannot afford combo ${comboIndex} ` +
      `(needs ${cost}, has ${player.coins})`,
    );
  }

  const selectedSlot: ComboSlot = shop.visible[comboIndex];
  const coinsCollected = selectedSlot.coinsOnSlot;

  // ── Update skipped slots (+1 coin each) ─────────────────────────────────
  const updatedVisible: ComboSlot[] = shop.visible.map((slot, i) => {
    if (i < comboIndex) return { ...slot, coinsOnSlot: slot.coinsOnSlot + 1 };
    return slot;
  });

  // ── Remove selected slot ─────────────────────────────────────────────────
  updatedVisible.splice(comboIndex, 1);

  // ── Deal a new combo from the bottom of the decks ────────────────────────
  const newRaceDeck = [...shop.raceDeck];
  const newPowerDeck = [...shop.powerDeck];

  if (newRaceDeck.length > 0 && newPowerDeck.length > 0) {
    const newRaceId = newRaceDeck.pop()!;
    const newPowerId = newPowerDeck.pop()!;
    updatedVisible.push({ raceId: newRaceId, powerId: newPowerId, coinsOnSlot: 0 });
  }
  // If either deck is exhausted, the shop simply has one fewer combo.

  // ── Compute token count for the new active race ──────────────────────────
  const race = RACES[selectedSlot.raceId as RaceId];
  const power = POWERS[selectedSlot.powerId as PowerId];
  const tokenCount = race.baseTokens + power.bonusTokens;

  const newActiveRace: ActiveRaceState = {
    raceId: selectedSlot.raceId,
    powerId: selectedSlot.powerId,
    maxSupply: race.maxSupply,
    totalTokens: tokenCount,
    tokensOnBoard: 0,
    conquestsThisTurn: 0,
    hasDeclinedThisTurn: false,
    sorcererConversionsThisTurn: 0,
  };

  // ── Compute player coin delta ────────────────────────────────────────────
  // Pay cost, receive coins from slot.
  // Wealthy's firstTurnBonus (+7) is now applied during the scoring phase,
  // not here (see scoring.ts).
  const newCoins = player.coins - cost + coinsCollected;

  const newPlayers = state.players.map((p, i) =>
    i === state.activePlayerIndex
      ? {
          ...p,
          coins: newCoins,
          activeRace: newActiveRace,
          availableTokens: tokenCount,
        }
      : p,
  ) as unknown as typeof state.players;

  return {
    ...state,
    comboShop: {
      visible: updatedVisible,
      raceDeck: newRaceDeck,
      powerDeck: newPowerDeck,
    },
    players: newPlayers,
    log: [
      ...state.log,
      {
        turn: state.turn,
        playerIndex: state.activePlayerIndex,
        phase: state.phase,
        action: { type: 'selectCombo', comboIndex },
      },
    ],
  };
}
