import type { GameState, GameAction } from '@/game/state/types';
import type { CustomAbilityHandler } from '@/game/abilities/raceAbilities';

// Custom ability handlers for powers with complex, non-declarative behaviour.

export const POWER_HANDLERS: Partial<Record<string, CustomAbilityHandler>> = {
  // Bivouacking: deploy/reposition up to 5 Encampment tokens each turn.
  // Handled via placeEncampments action; disappear on decline.
  bivouacking: {},

  // Dragon Master: once per turn, conquer ANY region with 1 token (ignores all defense).
  // Reworked to be a full conquest — resolves defender, clears markers, places dragon.
  dragonMaster: {
    modifyLegalActions: (state: GameState, actions: GameAction[]): GameAction[] => {
      if (state.phase !== 'conquest') return actions;
      const player = state.players[state.activePlayerIndex];
      if (!player.activeRace) return actions;

      // Dragon can only be used once per turn
      if (player.activeRace.dragonUsedThisTurn) return actions;

      // Requires at least 1 available token
      if (player.availableTokens < 1) return actions;

      // Can target any non-sea/lake region the player doesn't actively own
      const dragonActions: GameAction[] = state.board.regions
        .filter((r) => {
          if (r.terrain === 'sea' || r.terrain === 'lake') return false;
          if (r.owner === state.activePlayerIndex && !r.isDeclined) return false;
          if (r.hasHoleInTheGround || r.hasHero) return false;
          return true;
        })
        .map((r) => ({ type: 'placeDragon' as const, regionId: r.id }));

      return [...actions, ...dragonActions];
    },
  },

  // Fortified: +1 fortress per turn (max 6 total); fortress placement handled in applyAction.
  fortified: {},

  // Heroic: place 2 Heroes in 2 occupied regions; immune to conquest.
  // Heroes are placed via placeHeroes action in readyTroops or conquest phase.
  heroic: {},
};
