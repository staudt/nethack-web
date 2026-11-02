# Kickoff: NetHack TypeScript port, milestone 6a (draft)

Milestone 6 adds dungeon branches and special levels. 6a builds the branch structure, a data-driven special-level format and the Gnomish Mines filler levels; 6b adds Minetown (temple and shops). It builds on 5b (`docs/kickoff-m5b.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan before writing any code.

## Scope

1. **Dungeon structure:**
    - A `DungeonDef` registered through `ModApi`: name, number of levels (base and range), a filler level, and branches into other dungeons (ref: dat/dungeon.lua; src/dungeon.c init_dungeons(), place_level(), place_branch subset).
    - The layout (how deep each dungeon is, where each branch sits) is rolled once at new game and kept in `GameState`.
    - Levels know their dungeon and their level number in it. The status line's `Dlvl` stays the absolute depth (ref: src/dungeon.c depth()).
    - Branch stairs: one extra staircase on the branch level, leading into the branch (ref: src/mklev.c place_branch()). Holes and trap doors stay inside the current dungeon.
2. **Special-level format:** a `LevelDef` that a mod writes as plain data (no functions), so that an AI can write one from the docs alone. It covers what `minefill.lua` uses: map initialisation styles (`solidfill`, `rooms` (the existing generator), `mines`), stairs, and contents (monsters, objects, traps by id or class, with counts as ranges and percent chances). Core turns it into terrain; content fills it through the `newLevel` hook. Everything in it is documented in `ARCHITECTURE.md` (ref: dat/minefill.lua, src/sp_lev.c lspo_level_init(), lspo_stair(), lspo_object(), lspo_monster(), lspo_trap()).
3. **Cave maps:** a port of `mkmap.c` (cellular-automaton caves, joined, walled and lit by depth), with T-wall terrain so that the cave walls draw correctly (ref: src/mkmap.c mkmap(); src/sp_lev.c wallify_map(), fix_wall_spines()).
4. **The Gnomish Mines:** entrance on DL2-4, 8-9 filler levels of gnomes, gnome lords, dwarves, hobbits and other `G`/`h`, gems and tools (ref: dat/dungeon.lua, dat/minefill.lua).

Out of scope: Minetown and Mines' End (the bottom Mines level is a filler without down stairs), Sokoban and the other branches, boulders (see plan), dungeon overview (`^o`), level teleport, hero races (so gnomes are not peaceful to a gnome hero), bones.

## Exit criteria

- I can find the Mines staircase on DL2-4, go down into the Mines and back up on a phone, and the Mines look and play like NetHack's.
- A mod can add a new level by writing a `LevelDef` only.
- Replays and the golden test are deterministic (with an explained golden update).
- `pnpm check` is green locally and in CI.

## Testing

- Unit tests: layout rolls (ranges respected for many seeds), `mkmap` (connected, walls only next to floor, works at any map size), `LevelDef` validation errors.
- Scenario tests: taking the branch stairs down and back up lands on the right stairs; a trap door in the Mines drops you to a deeper Mines level; the bottom Mines level has no down stairs.
- The soak bot enters the Mines. New invariants: every level's stairs are reachable from each other; branch stairs exist on exactly one main-dungeon level.
