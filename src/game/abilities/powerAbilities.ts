import type { GameState, GameAction } from '@/game/state/types';
import type { CustomAbilityHandler } from '@/game/abilities/raceAbilities';

// Custom ability handlers for powers with complex, non-declarative behaviour.

export const POWER_HANDLERS: Partial<Record<string, CustomAbilityHandler>> = {
  // Bivouacking: deploy/reposition up to 5 Encampment tokens each turn.
  // Handled via placeEncampments action; disappear on decline.
  bivouacking: {},

  // Diplomat: at end of turn, choose an opponent as ally (if didn't attack them).
  // Handled via selectDiplomatAlly action emitted in score phase.
  diplomat: {},

  // Dragon Master: once per turn, conquer any non-sea/lake region with 1 token.
  dragonMaster: {
    modifyLegalActions: (state: GameState, actions: GameAction[]): GameAction[] => {
      if (state.phase !== 'conquest') return actions;
      const player = state.players[state.activePlayerIndex];
      if (!player.activeRace) return actions;

      // Dragon can only be used once per turn (dragonRegion tracks current placement)
      const dragonAlreadyUsed =
        player.activeRace.dragonRegion !== undefined &&
        player.activeRace.dragonRegion !== null;
      if (dragonAlreadyUsed) return actions;

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
