# Kickoff: NetHack TypeScript port, milestone 15

Milestone 15 is **the deeper dungeon**: water and lava, then the levels that need them. The hero can fall into pools and moats and drown or crawl out, walk on water with water walking boots, float over it, freeze it with cold and fill it with boulders; monsters drown, eels hide in the water and drown the hero, gremlins multiply; objects sink out of sight and lava burns them; swamps and gushing fountains make pools. The main dungeon gets its bottom: 25 to 29 levels, the big room (13 variants) on DL10-12 in 40% of games, mazes below Medusa, Medusa's island (4 variants) and the Castle at the bottom, with its moat, drawbridge, storerooms, soldiers and the wand of wishing. The drawbridge opens and closes with the passtune (a typed five-note tune with the Mastermind clues), wands and spells, and breaks under striking. Nine steps. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then the plan (`~/.claude/plans/m15.md`).

There are core changes, all additive and explained in `ARCHITECTURE.md`: a `liquid` flag on `TerrainDef` (core keeps traps off water, hides objects in it, keeps arrivals and travel out of it), nine more `LevelTerrain` keys with their map characters (`P } W L Z I C \ F`), `maze` and `mazegrid` level inits with a `mazeFiller` rule on `DungeonDef`, `teleportRegions` and `replace` terrain edits on `LevelDef`, and (if the Gehennom stub is chosen) branches without stairs at the parent's end. Drawbridges are content: terrains plus a `modData` table. There is no save-format change: old games keep their endless dungeon.

## Scope

1. **Liquid terrain and the hero in water:** pools, moats, walls of water, lava, lava walls, ice and clouds as terrain; the question before stepping into known water, travel around it, falling in, wet inventory, crawling out (dropping gear to do it), the teleport try, drowning and life saving, water walking boots, levitation and flight over water (ref: src/hack.c swim_move_danger(), pooleffects(); src/trap.c drown(), emergency_disrobe(); src/dbridge.c is_pool(), is_lava(); src/display.c covers_objects()).
2. **Water monsters:** the eels, the kraken, jellyfish, piranhas, sharks and the water troll; monsters keeping out of water and lava unless they swim, fly or float, drowning, teleporting out, gremlins multiplying, iron golems rusting, eels hiding and drowning the hero, pets and water (ref: src/mon.c mfndpos(), minliquid(); src/teleport.c goodpos(); src/mhitu.c AD_WRAP).
3. **Objects, boulders, ice, lava and swamps:** objects sinking or burning, the unreachable bottom, boulders filling pools, water flowing into dug pits, lava burning the hero, fire boiling water, cold freezing it into ice that melts again, slipping on ice, gushing fountains, swamps (ref: src/do.c flooreffects(), boulder_hits_pool(); src/dig.c liquid_flow(); src/trap.c lava_effects(); src/zap.c zap_over_floor(), melt_ice(); src/fountain.c gush(); src/mkroom.c mkswamp()).
4. **Mazes:** maze levels and maze grids, the mazes between Medusa and the Castle with their minotaurs (ref: src/mkmaze.c create_maze(), walkfrom(), makemaz(); src/sp_lev.c fill_empty_maze(); src/mklev.c makelevel()).
5. **Teleport regions and the big room:** where the hero lands when she falls, levelports or arrives without stairs; terrain replacement; the 13 big rooms (ref: src/mkmaze.c place_lregion(); src/sp_lev.c lspo_teleport_region(), lspo_replace_terrain(); dat/bigrm-*.lua).
6. **Medusa:** Medusa and her gaze against monsters, the dragons and their scales, disintegration breath, the four island levels with Perseus's statue and the petrified statues (ref: dat/medusa-*.lua; src/mhitm.c gazemm(); src/mon.c make_corpse(); src/zap.c zhitu(); src/mkmaze.c fixup_special()).
7. **The Castle and its drawbridge:** the level, its storerooms, the wand of wishing, the moat monsters and the court; raising, lowering and destroying the drawbridge and what happens to whoever stands on or under it (ref: dat/castle.lua; src/dbridge.c).
8. **Opening the drawbridge:** the passtune and its clues, instruments asking "Improvise?", wands and spells of opening, locking, striking, force bolt and digging, cold and fire on the moat under it, prayer revealing the tune (ref: src/music.c do_play_instrument(); src/zap.c bhit(), zap_dig(); src/pray.c pleased()).
9. **The dungeon:** the main dungeon's size, the big room, Medusa and the Castle placed as in `dungeon.lua`, the tune drawn at new game, shops and special rooms stopping at Medusa, the Castle's trap doors (ref: dat/dungeon.lua; src/dungeon.c init_dungeons(), init_castle_tune(), Can_fall_thru()).

## Out of scope

Gehennom's special levels (the Valley, the demon lairs, the Wizard's Tower, the Sanctum, hellfill), the Quest and its portal, Fort Ludios, Vlad's Tower, the Elemental Planes, the rogue level, level flipping, the hero underwater (limited sight), engravings (the Castle's Elbereth), mirrors, towels and the other instruments, steeds, roles and races. The full list with reasons is in the plan.

## Exit criteria

- On a phone with `?wizard=1`, using terrain wishes, genesis and levelport:
  - she walks into a pool after the question, falls in, crawls out with wet scrolls, walks on it with water walking boots and floats over it;
  - a giant eel hides in its pool and drowns her when it holds her; a hill orc goes around the pool;
  - a pushed boulder fills a pool; a wand of cold freezes it into ice that melts later;
  - Medusa's island, the big room and the Castle can be reached; Medusa's gaze is stopped by a blindfold or reflection;
  - at the Castle, a typed tune gives tumbler and gear clues and the right one lowers the drawbridge; a wand of opening does too; the wand of wishing is in a tower chest.
- In a normal game the dungeon ends at the Castle (25-29 levels), the big room appears in 40% of games, Medusa's level sits 1-4 levels above the Castle, and the levels between them are mostly mazes.
- Replays and the golden test are deterministic. Every golden change has a verified cause in its commit (expected in step 9, possibly step 3), and `pnpm check` is green locally and in CI.

## Testing

- Unit tests for every water rule (the hero falling in, crawling out, drowning, water walking, levitation; monsters drowning, eels, gremlins; objects, boulders, ice, lava), each level variant building on 80x21 with its terrain and contents, the drawbridge's open/close/destroy with someone on it, the tune's clues and every wand and spell on the drawbridge. Use searched seeds or pinned monsters, never lucky ones.
- Seed-dependent tests moved by the new dungeon rolls (step 9) are re-fitted by seed search or pinning, not weakened, and each re-fit is checked with the step's behaviour switched off.
- A soak runs the bot on levels with pools and on the Castle and keeps its invariants (nothing on a liquid cell is shown, no trap on water, the hero never stands in water she cannot survive at the end of a turn).

## Status

(Filled in by the last step.)
