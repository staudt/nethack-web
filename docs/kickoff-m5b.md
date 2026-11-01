# Kickoff: NetHack TypeScript port, milestone 5b (draft)

Milestone 5b fills in the missing object classes and adds traps, so that the early dungeon plays like NetHack's. It builds on 5a (`docs/kickoff-m5a.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan before writing any code.

## Scope

1. **New object classes:**
    - Rings, amulets, wands, tools (lamps, keys, bags; the pick-axe for digging is out of scope), and spellbooks that can be read but not yet cast. Pick a subset whose effects can be ported now (ref: include/objects.h; src/zap.c, src/do_wear.c Ring_on/off, src/apply.c).
    - Locking and unlocking doors and boxes with keys (ref: src/lock.c pick_lock()).
    - Containers (bags, boxes) with #loot, put in and take out (ref: src/pickup.c doloot()).
2. **Traps:** arrow, dart, falling rock, squeaky board, bear trap, sleeping gas, rust, trap door and hole to the next level (ref: src/trap.c dotrap(), src/mklev.c mktrap()). Searching finds them and `^` is remembered. They need a core trap contract (a def and a level layer, shown in the view).
3. **Elemental item damage** (an M4 carry-over): burning scrolls, boiling potions, rusting.

Out of scope: shops and shopkeepers, spellcasting, the Gnomish Mines and Sokoban branches, polymorph and artifacts.

## Exit criteria

- I can put on a ring, zap a wand and loot a box on a phone without a keyboard.
- Traps trigger, can be found by searching and are remembered on the map.
- Replays and the golden test are deterministic (with an explained golden update).
- `pnpm check` is green locally and in CI.

## Testing

- Unit tests: every trap's effect, and each ring, wand and tool effect.
- Scenario tests: falling through a trap door, zapping a wand of striking at a monster, and looting a locked box with a key.
- The soak bot loots and zaps. New invariant: traps are only on floor cells.
