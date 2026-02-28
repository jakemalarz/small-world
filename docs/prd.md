---
artifact: prd
version: "1.5"
created: 2026-02-20
status: draft
---

# PRD: Small World — Web-Based Board Game

## Overview

### Problem Statement

Small World is a beloved territory-control board game by Days of Wonder, but playing it requires a physical copy, setup time, and an in-person opponent. There is no official digital version that faithfully recreates the 2-player board game experience with the tactile satisfaction of the physical game. Existing digital board game adaptations often feel sterile or overly abstracted, losing the charm that makes the tabletop experience special.

### Solution Summary

Build a web-based implementation of the 2-player Small World board game using Phaser.js. The game faithfully recreates the physical board game experience — from the hand-painted map aesthetic to satisfying tabletop sound effects — on a Figma-like infinite canvas where players can pan and zoom between the board and surrounding game elements. The game supports human vs. human (hot-seat), human vs. AI, and AI vs. AI play, with configurable AI difficulty levels.

### Target Users

- **Primary:** Board game enthusiasts familiar with Small World who want a convenient way to play the 2-player game digitally
- **Secondary:** Friends and family of the developer who may be new to the game but can learn through contextual tooltips and hints
- **Tertiary:** The developer — as a personal portfolio piece and passion project

## Goals & Success Metrics

### Goals

1. **Faithful recreation** — Deliver a complete, rules-accurate 2-player Small World experience that feels like playing the physical board game
2. **Polished experience** — Achieve a level of visual and audio polish (animations, sound effects, UI) that makes the game a joy to interact with
3. **Playable against AI** — Provide configurable AI opponents (easy, medium, hard) so the game can be enjoyed solo
4. **Intuitive interaction** — Make the game learnable through contextual tooltips and smooth, communicative animations without requiring a separate tutorial

### Success Metrics

| Metric | Current Baseline | Target | Timeline |
|--------|-----------------|--------|----------|
| Rules accuracy | N/A | 100% of 2-player rules correctly implemented | MVP |
| Complete game playable | N/A | Full 10-turn game with all 14 races and 20 powers | MVP |
| AI opponent functional | N/A | 3 difficulty levels (easy, medium, hard) | MVP |
| Animation coverage | N/A | All key actions (conquest, decline, scoring, dice roll) animated | MVP |
| Sound effect coverage | N/A | All key actions have tabletop-style audio feedback | MVP |

### Non-Goals

- Multiplayer networking / online play (future consideration)
- Mobile-native app (web-only, though responsive)
- 3, 4, or 5 player maps
- Monetization or commercial release
- Competitive ranking or matchmaking systems
- Account creation or persistent user profiles

## User Stories

| ID | User Story | Priority |
|----|-----------|----------|
| US-1 | As a player, I want to select a race/power combo from the shop so that I can begin conquering regions | P0 |
| US-2 | As a player, I want to conquer regions by clicking on them so that I can expand my territory | P0 |
| US-3 | As a player, I want to put my race in decline so that I can pick a new, stronger race | P0 |
| US-4 | As a player, I want to see my victory coins accumulate each turn so that I can track my progress | P0 |
| US-5 | As a player, I want to pan and zoom the game canvas so that I can see the map and surrounding UI elements | P0 |
| US-6 | As a player, I want to roll the reinforcement die for my final conquest attempt so that I have a chance to take one more region | P0 |
| US-7 | As a player, I want to redeploy my tokens after conquests so that I can optimize my defenses | P0 |
| US-7a | As a player, I want to pick up tokens from my regions before conquering so that I can reuse them offensively | P0 |
| US-8 | As a player, I want to play against an AI opponent so that I can enjoy the game solo | P0 |
| US-9 | As a player, I want to choose the AI difficulty level so that the game matches my skill | P1 |
| US-10 | As a player, I want to see animations for conquests, token movement, and dice rolls so that the game feels alive | P1 |
| US-11 | As a player, I want to hear tabletop sound effects so that the game feels cozy and tactile | P1 |
| US-12 | As a player, I want contextual tooltips when I hover over game elements so that I can learn the rules as I play | P1 |
| US-13 | As a player, I want to see the game end screen with final scores and a winner announcement so that the game has a satisfying conclusion | P1 |
| US-14 | As a player, I want to watch an AI vs. AI game so that I can observe strategies and learn | P2 |
| US-15 | As a player, I want to toggle between an interaction mode and a pan mode so that I can navigate the map without accidentally triggering game actions | P1 |
| US-16 | As a player, I want to see my active race and power abilities in my player info box so that I can reference them without leaving my current phase | P1 |

## Scope

### In Scope

- **2-player map** — 23-region board with primary terrain types (Mountain, Forest, Farmland, Hill, Swamp, Sea, Lake) and secondary classifications (Mine, Magic, Underworld). Derived classifications (Coastal, Mountain-adjacent) are computed from adjacency
- **All 14 races** — Amazons, Dwarves, Elves, Ghouls, Giants, Halflings, Humans, Orcs, Ratmen, Skeletons, Sorcerers, Tritons, Trolls, Wizards
- **All 20 special powers** — Alchemist, Berserk, Bivouacking, Commando, Diplomat, Dragon Master, Flying, Forest, Fortified, Heroic, Hill, Merchant, Mounted, Pillaging, Seafaring, Spirit, Stout, Swamp, Underworld, Wealthy
- **Complete game loop** — Setup, race selection, ready troops, conquest, reinforcement die, redeployment, decline, scoring, 10-turn structure, end-game
- **Three play modes** — Human vs. Human (hot-seat), Human vs. AI, AI vs. AI
- **AI with 3 difficulty levels** — Easy (basic valid moves), Medium (heuristic strategy), Hard (optimized play)
- **Infinite canvas navigation** — Figma-style pan and zoom across the entire game surface
- **Polished animations** — Smooth, juicy animations for token placement, movement, conquest, dice rolling, coin scoring, decline transitions
- **Tabletop audio** — Cozy sound effects: token clinking, card sliding, dice rolling on wood, ambient background
- **Visual state indicators** — Player color-coded borders for active regions, faded/dashed borders for declined regions
- **Contextual tooltips** — Hover/tap hints explaining game elements, race abilities, power effects, and valid actions
- **Victory coin tracking** — Open/visible coin totals (honor system for hot-seat)
- **Turn track** — Visual turn counter matching the board game's 10-turn track

### Out of Scope

- Online/networked multiplayer
- 3, 4, or 5 player maps and configurations
- Player accounts, authentication, or persistent data
- Mobile app (iOS/Android)
- Undo/redo system
- Game replay or spectator mode
- Localization / multi-language support
- Accessibility features (screen reader support, colorblind modes)

### Future Considerations

- **Online multiplayer** — Design local game state management with future networked sync in mind
- **Additional player counts** — Architecture should not preclude adding 3-5 player maps later
- **Undo system** — Could be added to improve the experience for new players
- **Accessibility** — Colorblind-friendly palettes and screen reader support
- **Game save/load** — Persist game state to resume later
- **Mobile optimization** — Touch-optimized controls for tablet play

## Solution Design

### Functional Requirements

#### Game Setup

- FR-1: The game shall display the 2-player map with all regions rendered as interactive, clickable polygons
- FR-2: Each region shall display its primary terrain type visually (mountain, forest, farmland, hill, swamp, sea, lake) and secondary classification markers (mine, magic, underworld) matching the board game art style
- FR-3: Lost Tribe tokens shall be placed on regions marked with the Lost Tribe symbol at game start
- FR-4: Mountain tokens shall be placed on regions marked with the Mountain symbol at game start
- FR-5: The turn track (1-10) shall be displayed and the turn marker placed on turn 1
- FR-6: Each player shall receive 5 starting victory coins
- FR-7: The race/power combo shop shall display 6 visible pairings with remaining decks below
- FR-7a: The first player shall be determined randomly. Turn order alternates between the two players
- FR-7b: The Game Turn marker advances at the start of each new round of turns (i.e., when the first player begins their turn)

#### Race & Power Selection (The Shop)

- FR-8: The shop shall display 6 race/power combos in a vertical column, visually laid out near the board
- FR-9: The top combo shall be free; lower combos cost 1 victory coin per skipped position
- FR-10: Coins placed on skipped combos shall be visually displayed on those combos
- FR-11: When a player selects a combo, they receive the race banner, power badge, any coins on it, and the appropriate number of tokens
- FR-12: The shop shall replenish after each selection, shifting combos up and revealing a new one at the bottom
- FR-53: Race and power names shall be displayed as text labels within the HUD (in addition to any artwork) so that combos are identifiable before visual assets are available
- FR-54: Players may open the Race & Power combo HUD at any time during their turn to browse upcoming combos; the HUD shall be read-only when not in the race selection phase
- FR-55: While the Race & Power HUD is open, all map interactions — including region clicks and region tooltips — shall be disabled

#### Ready Troops

- FR-13a: Before conquering, the player may pick up Active tokens from regions they occupy to use for new conquests, but must leave at least 1 token in each region they wish to keep controlling
- FR-13b: The player may voluntarily abandon a region entirely by picking up all tokens from it, losing control of that region
- FR-13c: Tokens picked up are added to the player's available hand for conquests this turn
- FR-13d: During readyTroops, right-click on an owned active region removes one token to hand; left-click adds one token from hand back to region (mirrors redeployment UX)
- FR-13e: When removing the last token from a region (abandonment), a confirmation dialog is shown before proceeding. This applies to both the standard readyTroops phase and the Ghoul In Decline ready troops phase (ghoulReadyTroops)

#### Conquest

- FR-13: The first conquest must target a border region — one at the edge of the map, or one whose shore is on a Sea adjacent to the edge of the board. Interior lake shores do NOT count as border regions. Exception: race/power abilities may override (e.g., Halflings may enter at any region, Flying ignores adjacency)
- FR-14: Subsequent conquests must target regions adjacent to currently occupied regions (unless modified by race/power)
- FR-15: Conquest cost shall be calculated as: 2 (base) + 1 per Mountain/Encampment/Fortress/Troll's Lair + 1 per Lost Tribe token + 1 per enemy race token
- FR-15a: Sea and Lake regions cannot be conquered by default (exception: Seafaring power allows conquering Seas/Lakes as empty regions)
- FR-16: Valid conquest targets shall be visually highlighted when a player begins their conquest phase
- FR-56: Eligible first-conquest border regions shall be visually distinguished from other conquest targets before the player makes their first conquest; this distinction makes the entry constraint discoverable without requiring the player to read the rules
- FR-17: Conquered regions shall animate the token placement with impact and settling effects
- FR-18: When a region with an opponent's Active tokens is conquered: 1 token is permanently discarded, remaining tokens are returned to the defender for redeployment
- FR-18a: Exception — if the region was defended by a single Lost Tribe token, or by a single non-Ghoul In Decline token, that token is simply removed/discarded entirely. For non-Ghoul In Decline regions with 2+ tokens, all tokens are removed (declined tokens cannot redeploy). Exception: Ghoul In Decline tokens follow normal combat rules — see FR-23d
- FR-18b: Defender redeployment timing: defeated tokens are placed in other regions the defender still controls at the end of the current active player's turn (not immediately). If the defender holds no regions, they deploy on their next turn as a first conquest (border region entry)

#### Reinforcement Die

- FR-19: The reinforcement die (sides: 0, 0, 0, 1, 2, 3) shall be available as an explicit player choice during the conquest phase. When a player has at least 1 token and valid final conquest targets exist, a "Final Conquest" button shall appear alongside the "End Conquest" button. Clicking "Final Conquest" enters a target selection sub-flow where the player selects a region, the die rolls automatically, and the conquest resolves. Clicking "End Conquest" skips the die entirely and proceeds to redeployment. Once in the final conquest target selection, the player may still back out by clicking "End Conquest" to proceed to redeployment without rolling
- FR-20: The die roll shall have a satisfying 3D tumble animation with a wooden tabletop sound
- FR-21: The result shall be clearly displayed and the conquest resolved automatically. On failure, tokens remain in the player's previously occupied regions (not held in hand)
- FR-21a: The reinforcement die ends the conquest phase regardless of success or failure — no further conquests may be attempted

#### Decline

- FR-22: A player may choose to go in decline instead of conquering; the turn ends immediately after decline and scoring
- FR-23: Declining shall animate: banner flip to gray, power badge removal (except Spirit — badge is kept), token reduction to 1 per region with visual flip to declined state
- FR-23a: Exception — Ghouls do not reduce to 1 token per region when going In Decline; all Ghoul tokens remain on the map. In Decline Ghouls can move and conquer normally before the player's Active race acts
- FR-23b: When a player has Ghouls In Decline and a second active race that has been deployed (tokensOnBoard > 0), the player's turn shall begin with the option to decline the active race immediately (before Ghouls act). The "Go In Decline" button is re-labeled "Decline [Race Name]" to clarify which race is being declined. If the player declines: all Ghoul phases are skipped, Ghoul tokens are removed from the board (FR-24), Ghoul regions are not counted in scoring, and the active race goes In Decline normally. This option is NOT available on the first turn after selecting a new combo (tokensOnBoard === 0)
- FR-23c: When a player has Ghouls In Decline and a second active race, the player's In Decline box shall be highlighted as active during Ghoul phases (ghoulReadyTroops/ghoulConquest/ghoulRedeploy/ghoulReinforcementDie). When the active race's phases begin, the active race box shall be highlighted instead
- FR-23d: Ghoul In Decline combat — when an opponent conquers a region containing Ghoul In Decline tokens, normal combat rules apply: 1 token is permanently discarded and the remaining N-1 tokens are held in reserve for the Ghoul owner's next turn. At the start of the next Ghoul gathering phase (ghoulReadyTroops), the reserve tokens become immediately available in hand alongside any tokens still gathered from board regions. The In Decline box shall display "In Hand: N" whenever tokens are held in reserve (even outside of Ghoul phases), so the Ghoul owner can see their surviving tokens right after the loss
- FR-24: If the player already has a declined race, those tokens shall be animated off the board before the new decline takes effect. Scoring for the turn in which the active race declines shall not include regions previously held by the now-removed declined race (e.g. Ghouls In Decline regions are removed and not scored when the active race declines)
- FR-25: The Spirit power exception: Spirit-powered race tokens In Decline are exempt from the "1 In Decline race" removal rule. When a player with a Spirit race In Decline later declines a different race, the Spirit race's tokens stay on the board and the non-Spirit declined race (if any) is removed normally
- FR-25a: The Stout power exception: a player with Stout may go In Decline at the end of a regular conquest turn (Conquer → Redeploy → Score → Decline) instead of spending a whole turn on decline

#### Troop Redeployment

- FR-26: After conquests, the player may freely redistribute active tokens among occupied regions
- FR-27: Redeployment shall enforce the minimum of 1 token per occupied region
- FR-28: Token movement during redeployment shall animate smoothly between regions
- FR-57: During redeployment, left-click on a region shall add one token to that region and right-click shall remove one token from it; the player may freely add and remove tokens across all eligible regions until explicitly confirming redeployment

#### Scoring

- FR-29: At the end of each turn, the player earns 1 victory coin per occupied region (active + declined)
- FR-30: Bonus coins from race abilities and special powers shall be calculated and awarded correctly
- FR-31: Coin scoring shall have a cascading/counting animation with clinking sound effects
- FR-32: Victory coin totals shall be visible to both players (honor system). Note: in the physical board game, coin totals are traditionally hidden until final scoring — this is a deliberate design deviation for the digital version to simplify hot-seat play

#### Race Abilities

All 14 races shall be implemented with the following token counts and abilities. Each race has a **maximum token supply** — players cannot exceed this limit even through abilities that generate new tokens (e.g., Skeletons, Sorcerers). Lost Tribes have a supply of 18 tokens.

| Race | Tokens | Max Supply | Ability |
|------|--------|-----------|---------|
| Amazons | 6 | 15 | +4 extra tokens are added to hand at the start of each combat turn (during readyTroops, or directly at conquest on turn 1). These tokens are available for both readyTroops gathering and conquest. After redeployment, 4 tokens are removed from the map (largest stacks first, min 1 per region) and re-granted at the start of the next turn |
| Dwarves | 3 | 8 | +1 Victory Coin per Mine region occupied (Active or In Decline) |
| Elves | 6 | 11 | When defeated, suffer no casualties — discard 0 tokens; keep all in hand for redeployment |
| Ghouls | 5 | 10 | Tokens stay on map when going In Decline (don't reduce to 1). In Decline Ghouls can move and conquer normally before the Active race acts |
| Giants | 6 | 11 | Conquest cost -1 for any region adjacent to a Mountain region occupied by the Giants |
| Halflings | 6 | 11 | May enter the map at any region (not just borders). Place a Hole-in-the-Ground in the first 2 regions conquered (makes them immune to conquest/powers). Holes are removed when Halflings go Into Decline or when the player abandons the region |
| Humans | 5 | 10 | +1 Victory Coin per Farmland region |
| Orcs | 5 | 10 | +1 Victory Coin per non-empty region conquered this turn |
| Ratmen | 8 | 13 | No special ability — high token count is the advantage |
| Skeletons | 6 | 20 | Gain 1 new Skeleton token from storage for every 2 non-empty regions conquered this turn. Tokens are granted at the start of the redeployment phase (after all conquests are complete), so they can be deployed but not used for additional conquests |
| Sorcerers | 5 | 18 | Once per turn per opponent: substitute an opponent's single Active token with a Sorcerer from storage if the region is adjacent. The opponent's token is discarded |
| Tritons | 6 | 11 | Conquest cost -1 for Coastal regions (bordering Sea/Lake) |
| Trolls | 5 | 10 | Place a Troll's Lair in every occupied region (+1 defense). Lairs remain even In Decline, but are removed when the region is abandoned or conquered by another race |
| Wizards | 5 | 10 | +1 Victory Coin per Magic region |

- FR-33: Each race's ability shall be described in a tooltip accessible from the race banner

#### Special Powers

All 20 special powers shall be implemented with the following bonus token counts and abilities:

| Power | Bonus Tokens | Ability |
|-------|-------------|---------|
| Alchemist | +4 | Collect 2 bonus Victory Coins every turn the race is Active |
| Berserk | +4 | May use the Reinforcement Die for every conquest attempt, not just the last one |
| Bivouacking | +5 | Deploy up to 5 Encampment tokens (+1 defense each). Can be repositioned every turn. Disappear In Decline |
| Commando | +4 | Conquest cost -1 on any region |
| Diplomat | +5 | Choose one opponent as an ally at end of turn (must not have attacked them). That opponent cannot attack you until your next turn |
| Dragon Master | +5 | Once per turn, conquer a region with 1 token (ignores all defense). Place Dragon there (immune to conquest). Dragon moves each turn |
| Flying | +5 | May conquer any region regardless of adjacency. Cannot conquer Seas/Lakes |
| Forest | +4 | +1 Victory Coin per Forest region |
| Fortified | +3 | Place 1 Fortress per turn (max 6 total on map). +1 Victory Coin per Fortress (Active only). +1 defense (Active and In Decline) |
| Heroic | +2 | Place 2 Heroes in 2 occupied regions. Those regions are immune to conquest |
| Hill | +4 | +1 Victory Coin per Hill region |
| Merchant | +2 | +1 Victory Coin for every region occupied (stacks with base scoring) |
| Mounted | +5 | Conquest cost -1 on Hill and Farmland regions |
| Pillaging | +5 | +1 Victory Coin per non-empty region conquered this turn |
| Seafaring | +5 | May conquer Seas and Lakes (treated as empty regions). Keep them In Decline |
| Spirit | +5 | In Decline tokens do not count toward the "1 In Decline race" limit. They stay on the board alongside a second declined race |
| Stout | +4 | Can go In Decline at the end of a regular conquest turn (Conquer → Redeploy → Score → Decline) instead of spending a whole turn |
| Swamp | +4 | +1 Victory Coin per Swamp region |
| Underworld | +5 | Conquest cost -1 on Underworld regions. All Underworld regions are considered adjacent to each other |
| Wealthy | +4 | Gain 7 bonus Victory Coins at the end of first turn only |

- FR-34: Token count for a race/power combo = (number on Race Banner) + (bonus from Special Power Badge)
- FR-34a: Each race has a finite maximum token supply (see race table). Token-generating abilities (Skeletons, Sorcerers) cannot exceed this limit. If the supply is exhausted, no new tokens are generated
- FR-35: Each power's ability shall be described in a tooltip accessible from the power badge

#### End Game

- FR-39: The game shall end when the turn marker reaches the last spot on the turn track (turn track length varies by player count — the 2-player map uses a 10-turn track)
- FR-40: A final scoring screen shall display each player's total victory coins, the winner, and a breakdown of scoring by turn
- FR-41: In case of a tie, the tiebreaker shall be applied: the player with the most Race tokens (Active + In Decline) on the board wins
- FR-42: Players shall be offered the option to start a new game or return to the main menu

#### AI Opponent

- FR-43: The AI shall make valid moves at all times (legal conquests, proper decline timing, correct redeployment)
- FR-44: Easy AI shall make random but valid decisions
- FR-45: Medium AI shall use heuristic strategies (prioritize high-value regions, decline when spread thin, consider terrain bonuses)
- FR-46: Hard AI shall employ optimized play (evaluate multiple turns ahead, maximize coin efficiency, counter opponent strategies)
- FR-47: AI turns shall be animated at a readable pace, not instantaneous
- FR-48: AI vs. AI mode shall allow the player to watch a complete game unfold with playback speed controls

#### Navigation & Canvas

- FR-49: The game canvas shall support smooth pan (click-drag or two-finger drag) in any direction
- FR-50: The game canvas shall support smooth zoom (scroll wheel or pinch) with min/max bounds
- FR-58: The game shall start each session at the maximum zoom-out level, showing the entire map on screen
- FR-59: Tooltips shall render at a constant visual size (font size, panel dimensions) regardless of the current camera zoom level — tooltips are screen-space elements, not world-space
- FR-51: The map shall be centered on the canvas with game elements (shop, player info, turn track, dice) arranged spatially around it
- FR-52: Quick-navigation shortcuts or minimap to jump between the map and peripheral UI elements
- FR-60: The game shall provide a toggle between Interaction mode (clicks trigger game actions on map regions) and Pan mode (click-drag navigates the map without triggering any game action)
- FR-61: Player info boxes (displaying race banner, power badge, token count, and coins) shall show a tooltip on hover listing the special abilities of the player's active race and power
- FR-62: Map region polygons shall accurately reflect the region boundaries depicted in the 2-player reference map image

### User Experience

#### Canvas Layout

The game surface is an infinite canvas (Figma-like) with the board map as the central focal point. Surrounding the map:
- **Left of map:** Turn track (1-10) — matching the physical board's placement
- **Right of map:** Race/power combo shop (6 visible combos in a vertical column)
- **Above or below map:** Player dashboards showing active race banner, power badge, token count, and victory coins
- **Near player dashboard:** Reinforcement die area

Players pan and zoom freely. The camera auto-focuses on relevant areas during key moments (e.g., zooms to a region during conquest, pans to the shop during race selection) but the player always retains manual control.

#### Interaction Flow

1. **Race Selection:** Camera pans to the shop. Player clicks a combo. Coins animate from player to skipped combos. Tokens appear in the player's dashboard.
2. **Ready Troops:** Camera focuses on the map. Player's occupied regions highlight. Player clicks regions to pick up tokens (leaving at least 1), building their available hand for conquest. Player may also abandon regions entirely.
3. **Conquest Phase:** Valid targets glow/pulse. Player clicks a region. Tokens slide from hand/regions to the target. Defense tokens scatter/discard.
4. **Reinforcement Die:** When the player attempts a final conquest, the die area activates. Player clicks to roll. Die tumbles with suspense. Result resolves the conquest.
5. **Redeployment:** Occupied regions highlight. Player clicks source, then destination. Tokens slide between regions.
6. **Scoring:** Coins cascade into the player's total with a satisfying counting animation.
7. **Decline:** Player clicks "Decline" button. Banner flips, tokens reduce and gray out with a somber but satisfying animation.

#### Visual Design Principles

- **Faithful to the board game:** The map, token art, race banners, and power badges should visually reference the Small World board game aesthetic — painted, colorful, fantasy-themed
- **Player identification:** Each player has a distinct color. Active regions have bold colored borders. Declined regions have faded/dashed borders in the player's color
- **State clarity:** It should always be obvious whose turn it is, what phase they're in, which regions belong to whom, and what actions are available
- **Juicy feedback:** Every interaction has visual and audio feedback — clicks produce subtle token clinks, conquests have impact effects, scoring has coin cascade sounds

#### Audio Design

- **Ambient:** Soft tavern/hearth background ambiance (optional, toggleable)
- **Token placement:** Wooden piece-on-board thud
- **Token movement:** Sliding wood on wood
- **Conquest:** Impact sound + scattered tokens
- **Dice roll:** Dice tumbling on a wooden table
- **Coin scoring:** Coins clinking as they're counted
- **Card/banner interaction:** Card sliding / paper shuffling
- **Decline:** A muted, somber tone (tokens graying out)
- **Turn transition:** Subtle chime or bell
- **Victory:** Celebratory fanfare

### Edge Cases

| Scenario | Expected Behavior |
|----------|------------------|
| Player cannot afford any combo in the shop | This cannot happen — the top combo is always free |
| Player has no valid conquest targets | Player may still choose to decline. If they chose conquest but have no valid targets, skip to redeployment and scoring |
| Player's last token is defeated while they hold no regions | They redeploy on their next turn as a first conquest (border region entry) |
| Reinforcement die roll of 0 with only 1 token | Conquest fails; tokens are placed back in the player's previously occupied regions as part of redeployment |
| Single In Decline token or Lost Tribe conquered | The single token is simply removed/discarded entirely (no "1 discarded + remaining returned" — there are no remaining tokens) |
| Spirit power + decline | Spirit-powered race tokens are exempt from the normal In Decline removal. When the player declines again, the Spirit race stays and any other non-Spirit In Decline race is removed normally. A player can have at most 2 declined races (1 Spirit + 1 other) |
| Ghouls in decline attempt conquests | Allowed — Ghouls in decline can move and conquer before the active race acts. Ghouls also keep all tokens on the map when declining (don't reduce to 1) |
| Ghoul In Decline region conquered by opponent (2+ tokens) | Normal combat rules apply: 1 token permanently discarded, N-1 tokens go to reserve. Reserve tokens are available at the start of the Ghoul owner's next Ghoul gathering phase. The In Decline box shows "In Hand: N" immediately after the loss |
| Halflings' first 2 regions with Hole-in-the-Ground | These regions are immune to conquest and special powers per the rules (Hole-in-the-Ground tokens placed on first 2 conquered regions). Holes are permanently removed when Halflings go Into Decline or when the player abandons a Hole region during readyTroops. Only 2 Holes total may ever be placed regardless of abandonment |
| Dragon Master conquers a region with dragon | Dragon Master conquers a new region with only 1 token (ignoring all defense), then places the Dragon there making it immune to conquest. The Dragon moves to a new conquered region each turn |
| Stout power and decline | Player with Stout performs a full conquest turn (conquer → redeploy → score), then goes In Decline at the end — unlike normal decline which skips conquest entirely |
| Skeleton/Sorcerer token generation exceeds max supply | No new tokens are generated — the race's token supply is finite (e.g., Skeletons max 20, Sorcerers max 18). Abilities that create tokens are capped by available supply |
| All race/power combos exhausted | This should not occur in a 2-player, 10-turn game given 14 races and 20 powers |
| Player tries to zoom beyond min/max bounds | Zoom snaps to the nearest valid level with elastic feedback |

## Technical Considerations

### Constraints

- **Engine:** Phaser.js v3 — all rendering is canvas-based, no DOM UI
- **Resolution:** 1280x720 base with `Phaser.Scale.FIT` for responsive scaling
- **Browser:** Modern evergreen browsers (Chrome, Firefox, Safari, Edge)
- **Performance:** Must maintain 60fps during animations on mid-range hardware
- **Local only (MVP):** No server component; all game state lives client-side

### Integration Points

- **Phaser.js:** Game engine for rendering, input, animation, audio, scene management
- **Vite:** Dev server and build tool with HMR for rapid iteration
- **TypeScript:** Strict mode for type safety across all game logic

### Data Requirements

- All game state is ephemeral (in-memory, client-side only)
- No persistent storage required for MVP
- Game state architecture should be structured to support future serialization (save/load, network sync)

## Dependencies & Risks

### Dependencies

| Dependency | Owner | Status | Impact if Delayed |
|------------|-------|--------|-------------------|
| 2-player map region data (polygon coordinates, adjacency graph, terrain types) | Developer | Not started | Blocks all gameplay — map is foundational |
| Race & power art assets (banners, badges, tokens) | Developer | Not started | Can prototype with placeholder art, but blocks polish |
| Sound effect assets | Developer | Not started | Can develop without audio, add later |
| AI strategy design | Developer | Not started | Blocks AI play modes |

### Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Map region digitization is complex and time-consuming | H | H | Start with simplified polygons; refine art iteratively |
| Race/power interactions create edge cases not covered by rules | M | M | Implement a comprehensive rules engine with unit tests; reference the rulebook FAQ |
| Phaser.js canvas performance degrades with many animated tokens | L | M | Profile early; use object pooling and limit simultaneous animations |
| AI difficulty tuning is subjective and hard to balance | M | M | Start with easy/random AI; iterate on medium/hard based on playtesting |
| Scope of 14 races + 20 powers is large for initial release | M | H | Implement a generic race/power interface; add abilities incrementally behind a shared architecture |
| Faithful map recreation requires significant art effort | H | M | Consider AI-generated assets (Gemini via nano-banana MCP) for initial art; refine manually |

## Timeline & Milestones

| Milestone | Description | Target Date |
|-----------|-------------|-------------|
| M1: Core Engine | Game loop, turn structure, basic conquest mechanics, placeholder map with clickable regions | TBD |
| M2: Complete Rules | All 14 races, 20 powers, decline, scoring, reinforcement die — fully rules-accurate | TBD |
| M3: Map & Visuals | Faithful 2-player map, terrain art, token art, player color coding, region state indicators | TBD |
| M4: Animations | Polished animations for all game actions (conquest, decline, scoring, dice, token movement) | TBD |
| M5: Audio | Complete tabletop sound design — ambient, tokens, dice, coins, transitions, victory | TBD |
| M6: AI Opponents | Easy, medium, hard AI with proper strategy for all races and powers | TBD |
| M7: Canvas & Polish | Figma-like pan/zoom, spatial UI layout, tooltips, end-game screen, final polish pass | TBD |
| M8: Playtesting & Launch | Bug fixes, balance tuning, performance optimization, "done" | TBD |

## Open Questions

- [ ] How should the map region data be sourced? Manually trace polygons from the reference image, or use a map editor tool? — Owner: Developer
- [ ] What asset generation approach for race banners, power badges, and tokens? Hand-drawn, AI-generated (Gemini), or sourced/licensed? — Owner: Developer
- [ ] Should the AI "think" visibly (show its reasoning) or just execute moves? — Owner: Developer
- [ ] How should the Diplomat power's "alliance" selection work in AI vs. human games? — Owner: Developer
- [ ] Should there be a game speed setting for AI vs. AI spectator mode? — Owner: Developer
- [ ] What are the exact min/max zoom levels for the canvas? — Owner: Developer

## Appendix

### Related Documents

- Game Rules Specification — `src/assets/reference/Small World Rules.md`
- 2-Player Map Reference — `src/assets/reference/2-player-map.jpeg`
- Design Considerations — `design/prd-considerations.md`
- Project Architecture — `CLAUDE.md`

### Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-20 | Jake + Claude | Initial draft based on interview and game rules |
| 1.1 | 2026-02-20 | Jake + Claude | Rules accuracy pass — added Ready Troops phase, full race/power tables with token counts, coastal entry rule, Seas/Lakes restriction, defeat mechanics exceptions, Ghoul/Stout/Spirit decline details, defender redeployment timing, turn order, tie-breaker specificity; fixed reinforcement die failure behavior, edge cases for Spirit/Halflings/Dragon Master/Sorcerer; noted visible coins as deliberate deviation |
| 1.2 | 2026-02-21 | Jake + Claude | Phase 2 requirements: added US-15 (interaction/pan mode toggle), US-16 (player box ability tooltips); added FR-53–55 (HUD text labels, browse-at-any-time, map interaction lock); FR-56 (visually distinguish first-conquest entry regions); clarified FR-19 (die roll before End Conquest option); FR-57 (left/right-click redeployment model); FR-58–59 (start at max zoom-out, constant tooltip size); FR-60–62 (interaction/pan toggle, player box tooltips, region polygons match map) |
| 1.3 | 2026-02-27 | Jake + Claude | Ghoul UX fixes: added FR-23b (pre-Ghoul decline option at turn start); added FR-23c (In Decline box highlighted during Ghoul phases); clarified FR-13e (abandon dialog applies to ghoulReadyTroops too); clarified FR-24 (Ghoul regions not scored when active race declines — scoring excludes removed non-Spirit declined regions) |
| 1.4 | 2026-02-27 | Jake + Claude | Ghoul combat bug fix: added FR-23d (Ghoul In Decline tokens follow normal combat rules — 1 discarded, N-1 to reserve); clarified FR-18a (all non-Ghoul declined tokens removed, Ghoul exception); added edge case for Ghoul In Decline region conquered by opponent |
| 1.5 | 2026-02-27 | Jake + Claude | Amazon and Halfling rule corrections: Amazons +4 tokens now available during readyTroops AND conquest (not conquest-only); Halflings Holes-in-the-Ground removed on In Decline or region abandon; updated race table and edge cases accordingly |
| 1.6 | 2026-02-27 | Jake + Claude | Skeleton timing fix: tokens from conquered regions are granted at the start of redeployment (not during conquest), so they can be deployed but not used for further conquests; updated race table accordingly |
