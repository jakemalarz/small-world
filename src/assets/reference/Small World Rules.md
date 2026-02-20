# **Small World: Game Rules Specification**

## **1\. Global Constants & Configuration**

### **Player Configuration**

* **Player Count:** 2 to 5 players.

* **Target Audience:** Ages 8+, 40-80 minutes.

### **Game Board (Maps)**

* There are 4 distinct maps, one for each specific player count (2, 3, 4, or 5 players).

* The map used must match the number of players.

* **Regions:** The map is divided into Regions. Some regions contain symbols:  
  * **Lost Tribe Symbol:** Indicates a Lost Tribe starts here.

  * **Mountain Symbol:** Indicates a Mountain token starts here.

### **Game Currencies & Limits**

* **Victory Coins:** The currency for winning.  
  * **Starting Capital:** Each player starts with 5 coins of value "1".

  * **Winning Condition:** The player with the highest total value of coins at the end of the game wins.

  * **Tie-Breaker:** Most Race tokens (Active \+ In Decline) on the board.

* **Turn Limit:** The game ends when the Game Turn marker reaches the last spot on the track.

  * Track length varies by map (8, 9, or 10 turns).

### **Game Components**

* **Race Banners:** 14 unique fantasy races.

* **Special Power Badges:** 20 unique powers.

* **Race Tokens:** The units used to conquer regions.

* **Lost Tribes:** Neutral static defense tokens.

* **Mountains:** Static defense tokens (immovable).

* **Reinforcement Die:** A custom die (sides: 0, 0, 0, 1, 2, 3\) used for the final conquest attempt.  
  \+1

## ---

**2\. Setup Phase**

1. **Board Setup:** Place the map corresponding to the player count. Place the Turn Marker on spot 1\.

2. **Token Placement:**  
   * Place 1 **Lost Tribe** token on every region with a Lost Tribe symbol.

   * Place 1 **Mountain** token on every region with a Mountain symbol.

3. **The "Shop" (Combo Deck):**  
   * Shuffle Race Banners and create a stack.  
   * Shuffle Special Power Badges and create a stack.  
   * Pair the top Race Banner with the top Special Power Badge. Repeat until there is a column of **6 visible combos**.  
     \+1

   * The remaining stacks sit below the column.  
4. **Player Assets:** Give each player 5 Victory Coins.

## ---

**3\. Game Loop & Turn Structure**

* **First Player:** The player with the most pointed ears (or random) goes first.

* **Turn Order:** Clockwise.

* **Turn Progression:** Move the Game Turn marker forward at the start of a new round of turns.

### **Phase 1: Picking a Race (First Turn / After Decline)**

If a player has no Active race (Start of game or after fully declining), they must pick a combo from the shop.

* **Cost:**  
  * Top combo (Position 1): **Free**.

  * Lower combos: Cost 1 Victory Coin for *each* combo skipped above it.

  * *Action:* Place 1 coin on each skipped combo.  
* **Acquisition:**  
  * Take the chosen Race Banner \+ Special Power Badge.  
  * Take any Victory Coins previously placed on that combo by other players.

  * **Token Count:** Sum of (Number on Race Banner) \+ (Number on Special Power Badge). These are the **Active** tokens.

* **Replenish Shop:** Shift remaining combos up to fill the gap. Reveal a new combo from the stack at the bottom to maintain 6 options.

### **Phase 2: Active Turn Actions**

A player with an Active race chooses **ONE** of the following paths:

1. **Expand (Conquest)**.

2. **Go In Decline**.

## ---

**4\. Path A: Expansion (Conquest Mechanics)**

### **Step A1: Ready Troops**

* Player may pick up Active tokens from the map to reuse them.  
* **Constraint:** Must leave at least 1 token in each region they wish to keep controlling.

* Tokens in hand are available for new conquests.  
* Player may voluntarily abandon a region entirely (picking up *all* tokens), losing control of it.

### **Step A2: Conquering Regions**

To occupy a region, the player must pay a specific cost in Race Tokens.

* **Adjacency Rule:**  
  * **First Conquest:** Must enter via a border region (edge of board) or a coastal region (if map implies sea entry—usually handled by specific rules).

  * **Subsequent Conquests:** Target region must be adjacent to a region already occupied by the player's Active race.

* **Conquest Cost Formula:**  
  Plaintext  
  Cost \= 2 (Base)  
       \+ 1 for each Encampment/Fortress/Mountain/Troll's Lair  
       \+ 1 for each Lost Tribe token  
       \+ 1 for each Enemy Race token

  \*.  
  \+1

* **Seas/Lakes:** Cannot be conquered (unless using Seafaring power).

### **Step A3: Enemy Defeat (Losses & Withdrawals)**

When a region is conquered, the previous occupant (if any) suffers:

1. **Token Loss:** If the region was occupied by another player's race, that player permanently discards **1 token** to the tray.

   * *Exception:* If the region was defended by a single token that was In Decline or a Lost Tribe, that token is removed/discarded.

2. **Withdrawal:** The defending player takes any remaining tokens from that region back into their hand.

3. **Redeployment (Defender):** Defeated tokens are placed in other regions the defender still controls at the end of the *current* active player's turn. If the defender holds no regions, they deploy on their next turn as a First Conquest.  
   \+1

### **Step A4: Final Conquest (The Reinforcement Die)**

If a player has at least 1 token left but not enough to pay the full cost for a desired region:

1. Select the target region.

2. **Roll the Reinforcement Die**.

3. **Calculation:** If (Tokens in Hand \+ Die Roll) \>= Conquest Cost, the conquest succeeds.

4. **Failure:** If the sum is insufficient, the tokens remain in the player's previously occupied regions.

5. This ends the conquest phase.

### **Step A5: Troop Redeployment**

* Player may move their Active tokens freely between any regions they occupy.

* **Constraint:** Must leave at least 1 token in every occupied region.

### **Step A6: Scoring**

* **Base Score:** 1 Victory Coin per region occupied (Active \+ In Decline).  
  \+1

* **Bonus Score:** Add coins defined by Race or Special Power abilities.

## ---

**5\. Path B: Entering In Decline**

If a player chooses to go In Decline, they generally perform **no conquests** that turn.

1. **Flip Banner:** Flip the Race Banner to the gray side.

2. **Discard Power:** Discard the Special Power badge (unless the power is "Spirit").

3. **Reduce Population:** Remove all tokens from the map except **1 token per region**. Flip that single token to its gray (In Decline) side.

4. **Limit:** A player may only have **one** race In Decline at a time.  
   * If they already had a race In Decline, those tokens are removed from the board entirely.

   * *Exception:* "Spirit" power allows two declined races.

5. **Score:** The player scores 1 coin per region occupied by the newly Declined race (and any other valid regions).

6. **End Turn:** The turn ends immediately.

## ---

**6\. Race Definitions (Classes)**

* **Amazons** (Initial Tokens: 6\)

  * **Ability:** \+4 tokens for conquest only. After redeployment, remove 4 tokens from the map (these return to hand for next turn's conquest).  
    \+1

* **Dwarves** (Initial Tokens: 3\)

  * **Ability:** \+1 Victory Coin for each "Mine" region occupied (Active or In Decline).  
    \+1

* **Elves** (Initial Tokens: 6\)

  * **Ability:** When defeated, Elves suffer no casualties. Discard 0 tokens; keep all in hand for redeployment.

* **Ghouls** (Initial Tokens: 5\)

  * **Ability:** Tokens stay on map when going In Decline (don't reduce to 1). In Decline Ghouls can Move and Conquer normally (before the Active race acts).  
    \+1

* **Giants** (Initial Tokens: 6\)

  * **Ability:** Conquest cost is \-1 for any region adjacent to a Mountain region occupied by the Giants.

* **Halflings** (Initial Tokens: 6\)

  * **Ability:** May enter the map at any region (not just borders). Place a "Hole-in-the-Ground" in the first 2 regions conquered (makes them immune to conquest/powers).  
    \+1

* **Humans** (Initial Tokens: 5\)

  * **Ability:** \+1 Victory Coin for each "Farmland" region.

* **Orcs** (Initial Tokens: 5\)

  * **Ability:** \+1 Victory Coin for each non-empty region conquered this turn.

* **Ratmen** (Initial Tokens: 8\)

  * **Ability:** No special power, just high population.

* **Skeletons** (Initial Tokens: 6\)

  * **Ability:** Add 1 new Skeleton token to troops from storage for every 2 non-empty regions conquered this turn.

* **Sorcerers** (Initial Tokens: 5\)

  * **Ability:** Once per turn per opponent: Can substitute an opponent's single token with a Sorcerer from storage if the region is adjacent. The opponent's token is discarded.

* **Tritons** (Initial Tokens: 6\)

  * **Ability:** Conquest cost is \-1 for Coastal regions (bordering Sea/Lake).

* **Trolls** (Initial Tokens: 5\)

  * **Ability:** Place a "Troll's Lair" in every occupied region. Adds \+1 defense. Lairs stay even In Decline.

* **Wizards** (Initial Tokens: 5\)

  * **Ability:** \+1 Victory Coin for each "Magic" region.

## ---

**7\. Special Power Definitions (Classes)**

* **Alchemist** (+4 Tokens)  
  * Collect 2 bonus coins every turn the race is Active.

* **Berserk** (+4 Tokens)  
  * May use the Reinforcement Die for *every* conquest attempt, not just the last one.

* **Bivouacking** (+5 Tokens)  
  * Deploy 5 Encampment tokens (defense \+1). Can be moved every turn. Disappear In Decline.

* **Commando** (+4 Tokens)  
  * Conquest cost \-1 on any region.

* **Diplomat** (+5 Tokens)  
  * Choose one ally at end of turn (didn't attack them). They cannot attack you until your next turn.

* **Dragon Master** (+5 Tokens)  
  * Once per turn, conquer a region with 1 token (ignores defense). Place Dragon there (immune to conquest). Dragon moves each turn.  
    \+1

* **Flying** (+5 Tokens)  
  * May conquer any region (adjacency not required). Cannot conquer Seas/Lakes.

* **Forest** (+4 Tokens)  
  * \+1 Victory Coin per Forest region.

* **Fortified** (+3 Tokens)  
  * Place 1 Fortress per turn (max 6). \+1 Victory Coin per Fortress (Active only). \+1 Defense (Active and Decline).

* **Heroic** (+2 Tokens)  
  * Place 2 Heroes in 2 regions. These regions are immune to conquest.

* **Hill** (+4 Tokens)  
  * \+1 Victory Coin per Hill region.

* **Merchant** (+2 Tokens)  
  * \+1 Victory Coin for *every* region occupied.

* **Mounted** (+5 Tokens)  
  * Conquest cost \-1 on Hill and Farmland regions.

* **Pillaging** (+5 Tokens)  
  * \+1 Victory Coin for each non-empty region conquered this turn.

* **Seafaring** (+5 Tokens)  
  * May conquer Seas and Lakes (treated as empty regions). Keep them In Decline.

* **Spirit** (+5 Tokens)  
  * Race tokens In Decline do not count toward the "1 In Decline race" limit. They stay on the board alongside a second Declined race.

* **Stout** (+4 Tokens)  
  * Can go In Decline at the end of a regular conquest turn (Conquer \-\> Score \-\> Decline) instead of spending a whole turn.

* **Swamp** (+4 Tokens)  
  * \+1 Victory Coin per Swamp region.

* **Underworld** (+5 Tokens)  
  * Conquest cost \-1 on Cavern regions. All Cavern regions are considered adjacent.  
    \+1

* **Wealthy** (+4 Tokens)  
  * Get 7 bonus coins immediately at end of first turn.

---

