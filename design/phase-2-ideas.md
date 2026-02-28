## 2-23-2026 Additional Features / Bugs to Fix Before Phase 3 Starts

### Systemic Review of Race Powers

#### Amazons should get 4 extra tokens during Ready Troops and Conquest phases.  Then 4 need to be removed during Redeploy phase.  PASSED

#### Dwarves - Bug: No extra coin when in decline   PASSED

#### Elves PASSED

#### Ghouls PASSED

#### Giants     PASSED

### Amazons PASSED


#### Halflings PASSED

#### Humans PASSED

#### Orcs   PASSED

#### RATMAN PASSED

#### Skeletons PASSED

#### Sorcerer - PRD needs to be updated to be more precise

#### Tritorn PASSED

#### Trolls
>> Need to implement the ability to add lairs, up to 10.  Update PRD with this limit

#### Wiards 
>> Need to add at least one magic region to test




### Systemic Review of Special Powers - TO DO

### Dragon Master Conquest Mechanic

>>> The current implementation treats Dragon Master as a "place dragon marker" action that costs 1 token from available supply. Per rules, Dragon Master should be a special conquest: conquer any region with just 1 token, ignoring all defense (enemies defeated normally). The dragon is then placed in the conquered region, making it immune. Here's the full rule: Once per turn, you may conquer a Region using a single Race token, regardless of the number of enemy tokens defending it. Once conquered, place your Dragon there. The Region is now immune to enemy conquests as well as to their racial and special powers until your Dragon moves. During each new turn, you may move your Dragon to a different Region you wish to conquer. Your Dragon disappears when you go into Decline; remove it from the board and place it back in the storage tray at that time.

### Diplomat
>>> Remove this power from the prd and from the code.

### Spirit
>>> Remove this power from the prd and from the code.



### 9. Fortified Fortress Placement
>>> Similar to Heroic — the `fortressesPlaced` counter and `hasFortress` region flag exist, and defense (+1) and scoring (+1/fortress) work. But there is no fortress placement mechanic (1 per turn, max 6 total). Need a sub-phase or action to place a fortress after redeployment.


### Misc Bugs



#### 12. Defender Deferred Redeployment (FR-18b)
>>> When active tokens are defeated during conquest, remaining tokens should be placed in other regions the defender controls at the end of the current active player's turn. Currently, defeated tokens go to `availableTokens` immediately. The `defenderRedeploy` action type exists but is a no-op. Need a deferred redeployment phase between the attacker's scoring and the next player's turn.

#### Regions - need to implement multi-classification. 
>> Regions must have a primary type: Mountain, Farm, Sea, Lake, Forest, Hill, Swamp
>> Regions can also have one or more secondary classifications: Mine, Coastal, Magic
>> Regions can also have one or more derived classifications: Coastal - adjacent to a sea or lake, Mountain-adjacent

