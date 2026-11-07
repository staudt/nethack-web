# Kickoff: NetHack TypeScript port, milestone 7b (draft)

Milestone 7b adds boulders and Sokoban. It comes in two parts, done in this order: **7b1** the boulder itself (pushing with `moverock()`, boulders in level generation, breaking and making boulders, pits for them to fill) and **7b2** the Sokoban branch (up-branches chained to the Oracle level, the Oracle level, the eight Sokoban maps, Sokoban's rules and luck penalties, and the prize). It builds on 5b (traps and holes, `docs/kickoff-m5b.md`), 6a/6b (the dungeon layout and the `LevelDef` format, `docs/kickoff-m6a.md`, `docs/kickoff-m6b.md`), 7a (force bolt) and wizard mode (`docs/kickoff-wiz.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan before writing any code.

## Scope

### 7b1: boulders and pits

1. **The boulder object:** a new `rock` object class (ROCK_CLASS), the boulder (weight 6000, never picked up by the hero), blocking sight like a wall and shown above the rest of its pile, remembered on the map like any object (ref: include/objects.h BOULDER; src/vision.c does_block(); src/mkobj.c place_object(); src/pickup.c lift_object()).
2. **`moverock()`:** walking into a boulder pushes it one square: "With great effort you move the boulder." (once per boulder and turn pair), several boulders in a row ("the next boulder"), "You try to move the boulder, but in vain." against walls, other boulders, iron bars and closed doors or diagonally into a doorway, "There's a jackal on the other side. Perhaps that's why you cannot move it." / "You hear a monster behind the boulder.", "However, you can squeeze yourself into a small opening." when carrying almost nothing; boulders that plug holes and trap doors ("The boulder falls into and plugs a hole in the floor!") and fill pits (ref: src/hack.c moverock(), moverock_core(), dopush(), cannot_push(), cannot_push_msg(), could_move_onto_boulder(); src/do.c flooreffects()).
3. **Moving around boulders:** monsters and pets do not walk onto boulders and do not see through them; running stops in front of one; travel plans through boulders as if they could be pushed; the hero cannot squeeze diagonally between rock when carrying more than 600 (ref: src/mon.c mfndpos() ALLOW_ROCK; src/hack.c test_move(), cant_squeeze_thru(); src/vision.c clear_path()).
4. **Force-fighting and kicking a boulder:** "You harmlessly attack the boulder.", "Ouch! That hurts!" (ref: src/hack.c domove_fight_empty(); src/dokick.c dokick(), kick_object()).
5. **Boulders in level generation:** blocked extra corridors (`rn2(50)`) and the Mines filler's 1-2 boulders 75% of the time (ref: src/sp_lev.c dig_corridor(); dat/minefill.lua).
6. **Breaking boulders:** force bolt and the wand of striking fracture a boulder into rocks (ref: src/zap.c bhito() WAN_STRIKING/SPE_FORCE_BOLT, fracture_rock()).
7. **Pits and spiked pits:** falling in ("There is a pit here. You fall into a pit!", the damage, spiked pit poison), climbing out ("You crawl to the edge of the pit."), monsters in pits, boulders filling them; pits enter the random trap roll (ref: src/trap.c trapeffect_pit(), climb_pit(), mintrap(), fill_pit(); src/hack.c trapmove() TT_PIT; src/mklev.c traptype_rnd()).
8. **The scroll of earth:** boulders fall around the hero (or on her when cursed, rocks when confused), hitting monsters and her, filling pits and plugging holes (ref: src/read.c seffect_earth(), drop_boulder_on_player(), drop_boulder_on_monster()).

### 7b2: Sokoban

1. **Up-branches chained to a special level:** a `DungeonEntryDef` may count its level from a special level of the parent (`chainlevel`), lead up instead of down, and arrive on a level other than the top (`entry = -1`: the bottom); depth and stairs follow (ref: dat/dungeon.lua Sokoban `chainlevel = "oracle", base = 1, direction = "up"`, `entry = -1`; src/dungeon.c level_range(), init_dungeon_set_entry(), init_dungeon_set_depth()). The overview shows "Stairs up to Sokoban".
2. **The Oracle level** on DL5-9: the centre room with its four fountains and the peaceful Oracle, the delphi greeting, random rooms around it. No consultation, no centaur statues (ref: dat/dungeon.lua oracle `base = 5, range = 5`; dat/oracle.lua; include/monsters.h Oracle; src/hack.c check_special_room() DELPHI).
3. **The eight Sokoban levels** (`soko1-1` .. `soko4-2`, one of two per level) as `LevelDef`s: map, boulders, pits and holes, the branch and stairs spots, lit, premapped on arrival, random food, rings and wands, the scrolls of earth on the entry level (ref: dat/soko*.lua; src/mkmaze.c fixup_special() sokoban_detect()).
4. **Sokoban rules:** boulders do not roll diagonally ("The boulder won't roll diagonally on this floor."), no diagonal squeezing between boulders and walls ("You cannot pass that way."), no escaping pits and holes, monsters too; luck -1 for squeezing past a boulder, breaking one, reading earth; the rules lift once a level has no pits or holes left (ref: src/hack.c moverock_core(), bad_rock(), cant_squeeze_thru(); src/trap.c sokoban_guilt(), maybe_finish_sokoban(), dotrap(), mintrap(); src/zap.c fracture_rock(); src/read.c seffect_earth()).
5. **The prize:** the top level's treasure zoo (sleeping monsters on gold, "Welcome to David's treasure zoo!") and the bag of holding (75%) or amulet of reflection behind it, not cursed (ref: dat/soko1-*.lua; src/mkroom.c fill_zoo(); src/hack.c check_special_room() ZOO).

## Out of scope

Rolling boulder traps (left off the Sokoban maps), the giant mimics on the top level, the prize's Elbereth engraving and cursed scroll of scare monster, giants and other boulder-throwing or boulder-carrying monsters, priests and shopkeepers fracturing boulders, boulders in shops (billing), boulders into water or lava (no pools yet), landmines, teleporters and level teleporters under boulders, digging and `nondiggable`/`hardfloor`/`noteleport` level flags (nothing digs or teleports yet), statues, the Oracle's consultations and centaur statues, random zoos, the `m` move prefix, jumping and hurtling, Sokoban conduct and achievements, Big Room and the other main-dungeon special levels.

## Exit criteria

- **7b1:** On a phone with `?wizard=1`: wish for a boulder, push it around by moving (and from the action menu), see "in vain" against a wall and that it blocks sight; zap striking at it and get rocks; read a scroll of earth and get a ring of boulders; find boulders in a Mines filler level.
- **7b2:** In a normal game the level below the Oracle has a second up staircase; with wizard mode's levelport I reach the Oracle (DL5-9) and Sokoban, push boulders into pits and holes on the entry level, cannot push diagonally, and on the top level find the zoo and the prize.
- For each part: replays and the golden test are deterministic (with an explained golden update for each new roll: corridor boulders, pits, the scroll of earth, the Oracle and Sokoban in the layout), and `pnpm check` is green locally and in CI.

## Testing

- Unit tests: the boulder blocks sight (core vision) and stays on top of its pile; `moverock()` outcomes with pinned monsters and placed boulders (push, chain, wall, door, monster behind, squeeze, hole plugged, pit filled); pits (fall, climb out turns, spiked poison, monster trapped and freed); fracture; the scroll of earth (uncursed, blessed, cursed, confused); dungeon layout with a chained up-branch (always one level below the chain level, depth of each Sokoban level, stairs and branch stairs on each end) for many seeds.
- Scenario tests: every Sokoban variant builds at 80x21 and on a larger map, its boulders and traps sit on floor, its branch stairs and stairs are where the map puts them; a boulder pushed into the first pit of each entry level fills it; a diagonal push is refused; luck penalties; the rules lift after the last pit; the prize is there and not cursed.
- The soak bot visits Sokoban (a short run from levelport, no long soaks). New invariant: no boulder in a wall or stone and no monster other than the hero on a boulder square.
- Phone check uses wizard mode (`?wizard=1`): wish, zap, read, levelport to the Oracle and to each Sokoban level.

## Exit check, 7b1 (step 4, before the phone check)

- Boulder: wished for (`` ` `` class and "boulder"), pushed by moving and from the "Push the boulder" offer, "in vain" against walls, boulders, closed doors and diagonal doorways, the monster behind, the squeeze, the message throttle, sight blocked, on top of its pile, monsters and travel go around (core and content `m7b.boulder.test.ts`). Phone: pending.
- Breaking and kicking: striking and force bolt give 7..66 rocks, kicking hurts; boulders in extra corridors and Mines filler levels (`m7b.levels.test.ts`), Orcish Town's boulders (`orctown.test.ts`). Phone: pending.
- Pits: falling in, climbing out, spiked poison, the seen-pit prompt, monsters held and freed, boulders filling them (`trap.test.ts`, `m7b.boulder.test.ts`). Phone: pending.
- Scroll of earth: uncursed, blessed, cursed (the helmet does not help), confused rocks, monsters hit and killed, pits filled and holes plugged (`m7b.earth.test.ts`). Phone: pending.
- Golden and replays deterministic, each golden change explained in its step's commit (step 2; step 3 left it unchanged, as its DL1 rolls no pit; step 4 for the scroll of earth); `pnpm check` green.
- Out of scope, logged in `DEVIATIONS.md` and `docs/ROADMAP.md`: pools, landmines, teleporters and rolling boulder traps under boulders, shop billing, giants, the `m` prefix, the pit's limited view, Sokoban (7b2).

## Exit check, 7b2 (step 8, before the phone check)

- Up-branches chained to a special level: always one level below the chain level, `entry: -1` arrives on the bottom level, Sokoban's depths, branch stairs up on the parent and down on the entry, no stairs past either end, validation errors (core `m7b.dungeon.test.ts`); "Stairs up to Sokoban" in wizard "where" (`wizard.test.ts`). Phone: pending.
- The Oracle level on DL5-9: the centre room, four fountains, the peaceful Oracle, the Delphi greeting once (`m7b.oracle.test.ts`). Phone: pending.
- The eight Sokoban levels at 80x21 and 120x40: every boulder, pit and hole at its lua spot on floor, stairs and branch stairs, premapped, the scrolls of earth, `<` from the main dungeon and `>` back (`m7b.sokoban.test.ts`). Phone: pending.
- Sokoban rules and the prize: the first pit of each entry level filled, no diagonal push or squeeze, inescapable pits and holes, luck -1 for squeezing, breaking and earth (none off Sokoban), the rules lifted after the last pit, the treasure zoo and the not-cursed bag of holding or amulet of reflection (`m7b.sokorules.test.ts`). Phone: pending.
- Soak and invariants: two 300-turn runs from Sokoban's entry level (`soak.sokoban.test.ts`, boulder pushes counted in `SoakResult.boulderPushes`); new checks for every soak: no boulder on impassable terrain, no monster but the hero moving onto a boulder, `Level.sokoban` only from a sokoban LevelDef (`invariants.m7b.test.ts`).
- Golden and replays deterministic, each golden change explained in its step's commit (step 5 for the Oracle, step 6 for the Sokoban branch; steps 7 and 8 left it unchanged); `pnpm check` green.
- Out of scope, logged in `DEVIATIONS.md` and `docs/ROADMAP.md`: rolling boulder traps, giant mimics, the prize's engraving and scare monster, the builds-up difficulty, random zoos, statues and consultations, giants, teleport and dig flags, Sokoban conduct.
