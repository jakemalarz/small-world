
# Roadmap Phase 2: Post-Phase 1 Fixes and UX Enhancements

## Overview
This document contains ideas of what I would like to implement after Phase 1 was completed, before moving into Visual Polis.  There are a number of UI and game rule bugs to address, as well as enhancements to the user experience as it relates to game control.

## Visual Bugs
### Map
- When the map loads, the bottom of the image of the map is cut-off. This excludes a portion of the map, including the round 8. 9 and 10 markers.  

### Race and Poser HUB
- When the Race and Power selection HUD is open, and the user hovers over the options, the map tile tooltip behind the options is activating.  The behavior should be that when the HUD is open, the tool tips and any other interaction with the background map should be disabled

### Zoom
- When the map first loads, it is in zoomed-in state.  It should start in the max zoomed out state. The game regions will also have to be resized to reflect the bigger map area
- Zooming into the map also zooms the tool-tip.  The font and size of the tool-tip should remain constant, regardless the zoon level of the map

## Missing Features
### Decline
- I didn't see the option for the player to put the current race into decline.  This feature should be added and tested

## Game Rule Bugs
### Conquest
- The game is not enforcing the following rule: "The first conquest must target a border region (edge of map) or a coastal region (bordering a Sea/Lake), unless modified by race/power ability (e.g., Halflings may enter at any region)".  Instead, it is allowing the user to conquest any region on the map.  This should be fixed.
- The tool tip provides an incorrect number of required tokens for conquest on certain regions, and the game allows this.  It shows that only 2 are needed, regardless of what is on that region.  The game rule and tool tip should be updated to reflect this rule: "Conquest cost shall be calculated as: 2 (base) + 1 per Mountain/Encampment/Fortress/Troll's Lair + 1 per Lost Tribe token + 1 per enemy race token"


## Enhacements

### The Race and Power HUB
- provide the name of the race and power as a placeholder until the next phase of development, when the images will be provided
- provide a tool-tip that informs the user of the special power and ability of the race and power
- provide the ability for the players to open the HUB and view upcoming race and power combos 

### Conquest
- Visually distinguish which regions are available for the player to begin the conquest, according to this rule: The first conquest must target a border region (edge of map) or a coastal region (bordering a Sea/Lake), unless modified by race/power ability (e.g., Halflings may enter at any region)"

### Reinforcement Die
- add a visual of what the die lands on when the user rolls it

### User Interaciton
- I want to implement a convention where left-clicking a mouse button adds tokens to a region, and right clicking removes them.  I would like to use this especially in the re-deploy phase, where the user has to right click to remove one token at a time into his hand, and left click to re-deploy it, also one at a time.  The user should be able to freely repeat this, removing and adding tokens to allowable regions, during redeploy
- Add an ability for the user to toggle between an 'interaction' mode and a 'pan' mode.  The interaction mode allows the user to take actions on the map. The pan mode allows the user to move around the map.
- Add tool tips for the Player boxes (where the reace, power, tokens and coins are displayed) to show the special abilities associated with the race and power. 
- Redraw the game regions to more closely correspond to the regions that the background map image depicts.  
- Present the ability to roll the die on the last conquest before showing the 'End Conquest' button.  That last roll and conquest really are part of the conquest phase





## Round 2: bugs to work through manually with calude

### H vs H player 2 goes first  FIXED

### Add race and power title in the HUD, not just in the tooltip    FIXED

### Region tooltip shows states 'Unocupied' when there is a lost tribe token.  This is confusing.  Change the logic to only show 'Unocupied' if there are no race or lost tribe tokens on that region.  FIXED

### 'Go In Decline' button is visible during Ready Troops Phase - it should only be visible in rounds 2+   FIXED

### Ready tropps - remove this step for round 1 and go directly into conquest.  FIXED

### Clicking the confirm Redeploy button does not advance the game - it seems to be stuck FIXED



### Currently a player can begin coqnuest on any region.  Make sure the game enforcces the following rule.  Also double check and update the prd.md doc if necessary.   FIXED
"A player’s race deploying on the map for the first time must enter it by conquering one of its border Regions (i.e. a Region adjacent to the edge of the board or one whose shore is on a Sea adjacent to the edge of the board, even if the Sea is occupied by a Seafaring Race)."
 
### Conquest cost not correctly calculated for regions with mountains   FIXED

### Conquest cost are not correctly calculated for regions with lost tribe FIXED

### Reinforcement Die - On the final conquest, if the player still has one token and the ability to roll the die, update the phase name to "Final Conquest".  Also, only show the Roll Die button on this last conqueset.  Also change the sequence so that the player needs to select the region first before rolling the die.  Here is the full game rule:    FIXED

During the final conquest attempt of his turn, a player may find himself with not enough Race tokens left to conquer
another Region outright. Provided he still has at least one
unused Race token, the player may attempt one final conquest
for his turn by selecting a Region that he would normally be
3 or less Race tokens short to conquer. Once the Region is
selected, the player rolls the Reinforcement Die once. Note that
the Region the player wishes to make his last conquest target
for the turn must be selected before rolling the die. This Region
does not have to be the weakest one available for attack either,
provided it could still be conquered with a lucky die roll.



### There is another bug related to the reinforcement die.  Add this to the e2e test suite if it is not there, run the test, and then debug it.  The scenario is where the players uses the die on the final conquest, and gets the required number (or more) on the die,      
  plus the tokens in hand, to conquer the selected region.  Currently the game does not place the player's token (or tokens) that were in hand onto that region, and that token (or tokens) stay in hand.  Instead, the token (or tokens) should be placed in the           
  conquered region.   
--------------------


### In the Ready Toops phase the player should have the ability to gather all tokens in his/her hand, either leaving on behind in occupied regions if he wants to retain them, or abandoning those regions.  Currently this is not possible. I would like to use the same right mouse click convention to gather tokens back in hand, and right-click to deploy them.  Also show a 'chicken message" to the player before a region is abandoned


