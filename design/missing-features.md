# Missing Features Audit

_Audited 2026-02-22 against `docs/prd.md` and `src/assets/reference/Small World Rules.md`_

## Scoring

- **Effort**: 1 = trivial (< 1 hr), 2 = small (1–3 hrs), 3 = medium (3–8 hrs), 4 = large (1–2 days), 5 = very large (3+ days)
- **Value**: 1 = cosmetic/nice-to-have, 2 = minor gameplay improvement, 3 = noticeable gameplay gap, 4 = significant rules deviation, 5 = critical rules violation
- **Priority**: Value / Effort (higher = do first)

## Ranked Feature List

| Rank | Feature | Category | Status | Effort | Value | Priority | Key Files |
|------|---------|----------|--------|--------|-------|----------|-----------|
| 1 | Troll Lair scoring bug | Bug | **DONE** (2026-02-23) | 1 | 5 | 5.0 | `scoring.ts` |
| 2 | Amazons conquest-only token removal | Race ability | **DONE** (2026-02-23) | 2 | 4 | 2.0 | `actions.ts` |
| 3 | Bivouacking encampments disappear on decline | Power ability | **DONE** (2026-02-23) | 1 | 3 | 3.0 | `actions.ts` (applyDecline) |
| 4 | Sorcerer once-per-opponent limit | Race ability | **DONE** (2026-02-23) | 2 | 3 | 1.5 | `raceAbilities.ts`, `actions.ts`, `types.ts` |
| 5 | Seafaring "keep in decline" | Power ability | **DONE** (2026-02-23) | 2 | 3 | 1.5 | `actions.ts` (applyDecline) |
| 6 | Wealthy bonus timing | Bug | **DONE** (2026-02-23) | 2 | 3 | 1.5 | `comboShop.ts`, `scoring.ts` |
| 7 | Berserk die on every conquest | Power ability | **DONE** (2026-02-23) | 3 | 4 | 1.3 | `legalActions.ts`, `actions.ts`, `GameController.ts`, `HUD.ts` |
| 8 | Heroic hero placement | Power ability | **DONE** (2026-02-23) | 3 | 4 | 1.3 | `legalActions.ts`, `actions.ts`, `phaseTransition.ts`, `GameController.ts`, `HUD.ts` |
| 9 | Fortified fortress placement | Power ability | Partial | 3 | 4 | 1.3 | `powerAbilities.ts:42-43`, `legalActions.ts`, `actions.ts` |
| 10 | Dragon Master conquest mechanic | Power ability | Partial | 3 | 3 | 1.0 | `powerAbilities.ts:16-40`, `actions.ts:308-331` |
| 11 | Diplomat alliance | Power ability | Missing | 4 | 4 | 1.0 | `powerAbilities.ts:12-13`, `legalActions.ts`, `actions.ts:530-546` |
| 12 | Defender deferred redeployment (FR-18b) | Game mechanic | Missing | 4 | 3 | 0.75 | `actions.ts` (resolveDefender) |
| 13 | Hard AI (FR-46) | AI | Missing | 5 | 3 | 0.6 | New file: `HardAIPlayer.ts` |
| 14 | Audio system (FR-20, FR-31) | Polish | Stub | 5 | 3 | 0.6 | `AudioManager.ts` |
| 15 | Minimap / quick-nav (FR-52) | UX | Missing | 3 | 2 | 0.67 | `HUD.ts` |
| 16 | Animation polish | Polish | Basic | 4 | 2 | 0.5 | `AnimationChoreographer.ts` |
| 17 | AI vs AI playback speed (FR-48) | AI | Missing | 2 | 1 | 0.5 | `GameController.ts` |
| 18 | Contextual tooltips expansion | UX | Partial | 3 | 2 | 0.67 | `HUD.ts`, `Board.ts` |

## Details

### 1. Troll Lair Scoring Bug (CRITICAL)

**What's wrong**: `scoring.ts:83-86` awards +1 Victory Coin per Troll's Lair on active regions. Per the rulebook and PRD, Troll's Lairs provide +1 defense only — no scoring bonus.

**Fix**: Remove the `placesLair` scoring block entirely.

---

### 2. Amazons Conquest-Only Token Removal

**What's missing**: Amazons get +4 tokens during conquest via `conquestOnlyTokens: 4` modifier. After redeployment, these 4 tokens should be removed from the map (returning to hand for next turn). The comment in `raceAbilities.ts:19-21` says "Handled directly in applyAction for 'endPhase' in redeploy phase" but no such code exists.

**Impact**: Amazons currently keep all 4 extra tokens permanently on the board, making them overpowered.

---

### 3. Bivouacking Encampments on Decline

**What's missing**: Per PRD, Bivouacking encampments "disappear In Decline." The `applyDecline()` function does not clear `hasEncampment` flags from regions or the `encampmentRegions` tracking array.

**Fix**: In `applyDecline()`, clear all `hasEncampment` flags from the declining player's regions.

---

### 4. Sorcerer Once-Per-Opponent Limit

**What's missing**: The PRD specifies "once per turn per opponent." The current `modifyLegalActions` in `raceAbilities.ts:52-78` generates sorcerer conversion targets without checking if a conversion has already been used this turn. Need a `sorcererConversionsThisTurn` counter on `ActiveRaceState`.

---

### 5. Seafaring "Keep in Decline" (DONE)

**Resolved**: Sea/lake regions are already retained when a Seafaring race declines — `applyDecline()` marks all active regions as `isDeclined: true` with 1 token, including sea/lake regions. Since only Seafaring races can own sea/lake regions, no special exclusion is needed. Added explicit comments documenting this behavior. Also added `hasHero: false` cleanup to the decline flow.

---

### 6. Wealthy Bonus Timing (DONE)

**Resolved**: Moved +7 bonus from `applySelectCombo` (combo selection) to `calculateScore` (scoring phase). Added `wealthyBonusApplied` flag to `ActiveRaceState`. The bonus is now awarded during the first scoring turn only. `applyScoring` sets `wealthyBonusApplied = true` to prevent re-application on subsequent turns.

---

### 7. Berserk Die on Every Conquest (DONE)

**Resolved**: Berserk die now rolls on every conquest attempt. Legal actions include regions affordable with `availableTokens + 3` (max die). `conquer` action type extended with optional `dieResult` field. `applyConquer` places `min(availableTokens, cost)` tokens when die assists. `GameController` rolls die before each Berserk conquest (human and AI). Failed rolls waste the attempt but stay in conquest phase.

---

### 8. Heroic Hero Placement (DONE)

**Resolved**: Added `placeHeroes` phase after `redeploy` for Heroic power. Phase transition: `redeploy→endPhase` goes to `placeHeroes` if player has Heroic power and ≥2 owned active regions, otherwise straight to `score`. Legal actions enumerate all pairs of owned active regions. Heroes are cleared at player switch (`heroRegions: undefined`, `hasHero: false` on board) and on decline. HUD shows "Place Heroes" label and "Skip Heroes" button. Human players click 2 regions sequentially. AI picks the first valid pair.

---

### 9. Fortified Fortress Placement

**What's missing**: Similar to Heroic — the `fortressesPlaced` counter and `hasFortress` region flag exist, and defense (+1) and scoring (+1/fortress) work. But there is no fortress placement mechanic (1 per turn, max 6 total). Need a sub-phase or action to place a fortress after redeployment.

---

### 10. Dragon Master Conquest Mechanic

**What's wrong**: The current implementation treats Dragon Master as a "place dragon marker" action that costs 1 token from available supply. Per rules, Dragon Master should be a special conquest: conquer any region with just 1 token, ignoring all defense (enemies defeated normally). The dragon is then placed in the conquered region, making it immune. The distinction matters when the target region has defenders — current implementation doesn't resolve defense.

---

### 11. Diplomat Alliance

**What's missing**: Entirely non-functional. State field `diplomatAlly` exists in types, and `applyDiplomatAlly()` exists in actions, but:
- No legal action generation for selecting an ally
- No phase trigger (should happen after scoring)
- No enforcement preventing the allied opponent from attacking the Diplomat player
- No validation that the Diplomat player didn't attack the chosen ally this turn

---

### 12. Defender Deferred Redeployment (FR-18b)

**What's missing**: When active tokens are defeated during conquest, remaining tokens should be placed in other regions the defender controls at the end of the current active player's turn. Currently, defeated tokens go to `availableTokens` immediately. The `defenderRedeploy` action type exists but is a no-op. Need a deferred redeployment phase between the attacker's scoring and the next player's turn.

---

### 13. Hard AI

**What's missing**: No `HardAIPlayer.ts` exists. PRD requires an optimized AI that evaluates multiple turns ahead, maximizes coin efficiency, and counters opponent strategies. This is a significant feature requiring minimax or Monte Carlo tree search.

---

### 14. Audio System

**What's missing**: `AudioManager.ts` is entirely a stub — all methods log to console in dev mode but play no actual sounds. PRD requires tabletop-style audio for token placement, conquest, dice, coins, decline, turn transitions, and victory. Need audio assets and a real implementation.

---

### 15. Minimap / Quick-Nav (FR-52)

**What's missing**: No minimap or quick-navigation shortcuts exist. The game relies entirely on manual pan/zoom. FR-52 specifies shortcuts or a minimap to jump between map and peripheral UI elements.

---

### 16. Animation Polish

**What exists**: Basic tween animations for camera panning, region flashing, and token slides. Missing: "juicy" conquest impact effects, coin cascade animations, dice 3D tumble, decline banner flip with graying, satisfying token settling effects.

---

### 17. AI vs AI Playback Speed Controls (FR-48)

**What's missing**: No speed controls for AI vs AI spectator mode. AI turns play at a fixed pace. FR-48 requires playback speed controls.

---

### 18. Contextual Tooltips Expansion

**What exists**: Basic tooltips for regions, race banners, and power badges. Could be expanded with more detailed rule explanations, valid action hints during each phase, and terrain/feature descriptions.
