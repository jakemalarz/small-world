## Map re-deisgn ->> implement as part of Phase 3
The following changes need to make to the map and regions.  Make sure to update the PRD and tests, and add additional unit and e2e tests to cover additional scenarios related to this refactor.  Make sure to execute all unit and chrome e2e tests after this refactor.

First, regions need to support multiple classifications: 
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