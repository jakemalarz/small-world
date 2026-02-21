import type { GameState, GameAction } from '@/game/state/types';

// Custom ability handler hooks for races whose abilities are too complex
// to express as declarative AbilityModifiers. Called by applyAction and
// getLegalActions at the appropriate lifecycle points.

export type CustomAbilityHandler = {
  /** Inject additional legal actions or filter invalid ones for this phase. */
  modifyLegalActions?: (state: GameState, actions: GameAction[]) => GameAction[];
  /** Called after a successful conquest; may return updated state. */
  onConquest?: (state: GameState, regionId: number) => GameState;
  /** Called when applyDecline() processes this race. */
  onDecline?: (state: GameState) => GameState;
  /** Called at end of the active player's turn (after scoring). */
  onTurnEnd?: (state: GameState) => GameState;
};

export const RACE_HANDLERS: Partial<Record<string, CustomAbilityHandler>> = {
  // Amazons: conquest-only tokens removed after redeployment.
  // Handled directly in applyAction for 'endPhase' in redeploy phase.
  amazons: {},

  // Ghouls: In-Decline tokens can conquer — handled via ghoulConquest phase.
  ghouls: {},

  // Halflings: place Hole-in-the-Ground in first 2 conquered regions.
  halflings: {
    onConquest: (state: GameState, regionId: number): GameState => {
      const player = state.players[state.activePlayerIndex];
      const holes = player.activeRace?.halflingHoles ?? [];
      if (holes.length >= 2) return state;

      const newHoles = [...holes, regionId] as readonly number[];
      const newRegions = state.board.regions.map((r) =>
        r.id === regionId ? { ...r, hasHoleInTheGround: true } : r,
      );
      return {
        ...state,
        players: state.players.map((p, i) =>
          i === state.activePlayerIndex && p.activeRace
            ? { ...p, activeRace: { ...p.activeRace, halflingHoles: newHoles } }
            : p,
        ) as unknown as typeof state.players,
        board: { ...state.board, regions: newRegions },
      };
    },
  },

  // Skeletons: token generation handled in applyAction via tokenGenerators modifier.
  skeletons: {},

  // Sorcerers: once per turn per opponent, convert an adjacent lone enemy token.
  sorcerers: {
    modifyLegalActions: (state: GameState, actions: GameAction[]): GameAction[] => {
      if (state.phase !== 'conquest') return actions;
      const player = state.players[state.activePlayerIndex];
      if (!player.activeRace) return actions;

      const opponentIndex: 0 | 1 = state.activePlayerIndex === 0 ? 1 : 0;
      const ownRegionIds = new Set(
        state.board.regions
          .filter((r) => r.owner === state.activePlayerIndex && !r.isDeclined)
          .map((r) => r.id),
      );

      const convertActions: GameAction[] = state.board.regions
        .filter((r) => {
          if (r.owner !== opponentIndex) return false;
          if (r.isDeclined) return false;
          if (r.tokens !== 1) return false;
          if (r.hasHoleInTheGround || r.hasHero || r.hasDragon) return false;
          return r.adjacentRegionIds.some((id) => ownRegionIds.has(id));
        })
        .map((r) => ({ type: 'sorcererConvert' as const, regionId: r.id }));

      return [...actions, ...convertActions];
    },
  },
};
