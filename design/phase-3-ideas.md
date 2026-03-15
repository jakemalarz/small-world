# Phase 3 tracking of tasks for me + AI

## 1. MAP: Re-draw the regions and manually label each one to correspond to the board game map  DONE

### hit polygons and overlays retrace

### region re-classification 

First, regions need to support multiple classification/s: 
- Regions must have a primary type: Mountain, Farm, Sea, Lake, Forest, Hill, Swamp
- Regions can also have one or more secondary classifications: Mine, Coastal, Magic, Underworld
- Regions can also have one or more derived classifications: Coastal-adjacent (next to a lake or the sea), Mountain-adjacent

Next, the two-player map should have the followig types of regions.  Refactor the game map to have the following: 
Sea regions: 2  
Lake regions: 1 
Farmland + Magic: 2
Farmland: 2
Mountain: 2
Mountain + Mine + Underworld: 1
Mountain + Mne: 1
Hill: 2
Hill + Underworld: 2
Forest: 2
Forest + Magic: 1
Forest + Mine: 1
Swamp: 1
Swamp + Magic: 1
Swamp + Underworld: 1
Swamp + Mine: 1


## 2. MAP: Token Placement

### Design token placement scenarions

Unoccupied Regions

  - Empty
  - Lost Tribe token
  - Fortress (left behind after abandonment or all tokens eliminated)


  ---
  Active Race Regions

  Base:
  - Race tokens only

  Race-specific special token:
  - Race tokens + Troll's Lair (Trolls always place a Lair in every occupied region)
  - Race tokens + Hole-in-the-Ground (Halflings, first 2 conquered regions only)

  Power-specific special token:
  - Race tokens + Dragon (Dragon Master — 1 Dragon on the map at all times, region is immune)
  - Race tokens + Hero (Heroic — 2 Heroes across map, each in a separate region, region is immune)
  - Race tokens + Fortress (Fortified — either the current player placed it, or inherited from a
  previous controller)
  - Race tokens + Encampment(s) (Bivouacking — up to 5 total on map; multiple can stack in 1 region)

  Race token + power token combos (only possible when the race IS that race with that power):
  - Trolls + Troll's Lair + Fortress (Trolls/Fortified)
  - Trolls + Troll's Lair + Hero (Trolls/Heroic)
  - Trolls + Troll's Lair + Dragon (Trolls/Dragon Master)
  - Trolls + Troll's Lair + Encampment(s) (Trolls/Bivouacking)
  - Halflings + Hole-in-the-Ground + Dragon (Halflings/Dragon Master)
  - Halflings + Hole-in-the-Ground + Fortress (Halflings/Fortified)
  - Halflings + Hole-in-the-Ground + Hero (Halflings/Heroic)
  - Halflings + Hole-in-the-Ground + Encampment(s) (Halflings/Bivouacking)

  Cross-player Fortress (Fortress persists after conquest — current controller ≠ original Fortified
  player):
  - Race tokens + Fortress (foreign) — all base combos above can also gain a "foreign" Fortress
    - e.g., Trolls + Troll's Lair + Fortress (where Fortress was placed by a different player)
    - e.g., Halflings + Hole-in-the-Ground + Fortress (foreign)

  ---
  In Decline Regions

  - Declined race token (single — standard 1 per region)
  - Declined Ghoul tokens (multiple — Ghouls don't reduce to 1 on decline)
  - Declined race token + Troll's Lair (Troll's Lairs survive In Decline)
  - Declined Ghoul tokens + Fortress (Ghouls/Fortified power In Decline)
  - Declined race token + Fortress (any race with Fortified power In Decline, or Fortress inherited)
  - Declined Troll tokens + Troll's Lair + Fortress (Trolls/Fortified In Decline)



//
 I want to work on replacing the placeholder board tokens with actual images.  I uploaded the    
  images for the race tokens and special power tokens in @src/assets/images/board-tokens/.  For   
  each race, there are two images: when the race is active, use the race.png image (e.g.          
  amazons.png).  When the race is in decline, use the race_d.png (e.g. amazons.png) image.  For   
  active races, and for in decline ghouls, the image has an orange circle in the bottom corner to 
   indicate the number of tokens that are placed on a given region.  For example, if 4 Amazons    
  are placed on a given region, only one Amazon tokens would be placed on that region and it      
  would have number 4 in the cricle.  I would like to populate and update the number of tokens in 
   that circle dynamically.  The font of that number should be bold.  The size of that orange     
  circle is 80px by 80px.  Think about how to accomplish this, perhaps via css?  There are also 6 
   special power tokens.  The one to call out is the encampment token, as it also has an orange   
  circle to indicate the number of tokens of that kind on a region, but the circle is in the      
  bottom left corner.  Here are the rules I would like to follow for regions that need to have    
  multiple tokens on them at the same time.  If it is just one token, center it in the region.    
  If it is a race token plus a special power token, stack the two tokens so that they overlap top 
   to bottom, with the race token at the botton and in the fornt (see                             
  @src/assets/images/board-tokens/race+special-token.png ) .  The exception to that rule          
  encampment: in that case stack the tokens so they overlap left to right, with the race token to 
   the right and in the fornt (see @src/assets/images/board-tokens/race+encampment.png ).  If     
  there are two special tokens, stack them left to right with an overalp, and then stack the race 
   token over them dead-center and down, and in the front, with the encampment token alwasy on    
  the left (see @src/assets/images/board-tokens/race+special-token+encampment.png )
//

### Put together a list of token placement scenarios

>>> [Get AI's help with listing all scenarios ]

Epmty region
- place a single race token on a region
- place n number of reace tokens on an empty region

Re-depoy
- remove a single race token from region to back in hand
- Amazon - remove 4 tokens after conquest from the board

Conquest
- Initiate conquest on a region
- Succesful conquest: oponent tokens removed from region
- Unsuccseful conquest: player tokens repelled and go back in hand
- Conquer with a dragon
- Lost tribe token conquered

Deploy non-race tokens
- Deploy fortress
- Deploy Encampment
- Deploy Halfling hole
- Deploy Hero
- Deploy Lair

General gameplay
- Advnace game turn marker
- Roll reinforcement die
- Pay coin for race/power selection
- Collect coins at end of round

Decline
- Go into decline, tokens turn inactive


Misc
- Sorcerer turns opponent token into own race


### UX Design of what token placement will look like in the region, account for the different scenarios 

### Get visual assets for all tokens, combos, etc.

### Implement 

[ Claude ]



## 3. HUD Redesign

### UX Design

### Get visual assets

### Implement 

[ Claude ]


## 4. Game play interactions + animation

### Get a list of interactions

[Get AI's help with listing all scenarios ]

### UX & animation design

### POC

### Get all visual assets

### Implement 

[ Claude ]