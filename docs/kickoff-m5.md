# Kickoff: NetHack TypeScript port, milestone 5 (draft)

Milestone 5 gives the Valkyrie a companion and fills in the missing object classes, so the early dungeon plays like NetHack's. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then enter plan mode and propose a plan before writing any code.

The architecture rules in `CLAUDE.md` still apply unchanged.

## Milestone 5 scope

1. **Pets:** the Valkyrie's kitten (ref: src/dog.c makedog(), src/dogmove.c dog_move(), dog_eat(), dog_goal()):
    - The kitten follows you, fights, eats corpses and grows up.
    - It goes downstairs with you when adjacent (ref: src/dog.c keepdogs(), losedogs()).
    - It is tamed or untamed by food and abuse (ref: tamedog(), abuse_dog()).
    - Displacing it when you walk into it.
    - "You stop. Your kitten is in the way." and the other move-into-pet rules (ref: src/hack.c domove()).
    - Pets count as "safe" monsters for running and travel.
2. **Luck and alignment:** `u.uluck` with its timeout and the effects already ported against Luck 0 (rnl, to-hit, search). Alignment record changes for killing peacefuls (ref: src/attrib.c change_luck(), src/mon.c xkilled() penalties). Remove the "Luck 0" notes in DEVIATIONS.md.
3. **Prayer:** `#pray` with prayer timeout, luck and trouble fixing (ref: src/pray.c dopray(), can_pray(), fix_worst_trouble()), as a self offer.
4. **New object classes:**
    - Rings, amulets, wands, tools (pick-axe for digging is out of scope; lamps, keys, bags), and spellbooks as readable but not yet castable. Pick a subset whose effects can be ported now (ref: include/objects.h; src/zap.c, src/do_wear.c Ring_on/off, src/apply.c).
    - Locking and unlocking doors and boxes with keys.
    - Containers (bags, boxes) with #loot, put in and take out (ref: src/pickup.c doloot()).
5. **Traps:** arrow, dart, falling rock, squeaky board, bear trap, sleeping gas, rust, trap door and hole to the next level (ref: src/trap.c dotrap(), src/mklev.c mktrap()), with searching finding them and `^` remembered.
6. **Status effects:** blindness (with `cansee` rules), confusion and hallucination, so that the effects M4 logged as not ported can work (carrot, yellow mold corpse, potion effects).
7. **Prompts:** every single-select prompt can be cancelled (Escape and a Cancel button) where NetHack allows ESC.

Out of scope: shops and shopkeepers, spellcasting, the Gnomish Mines and Sokoban branches, polymorph and artifacts.

## Exit criteria

- The Valkyrie starts with a kitten that follows her downstairs, fights and eats.
- Luck changes outcomes, and praying when weak from hunger fixes it.
- I can put on a ring, zap a wand and loot a box on a phone without a keyboard.
- Traps trigger, can be found by searching and are remembered on the map.
- Replays and the golden test are deterministic (with an explained golden update).
- `pnpm check` is green locally and in CI.

## Testing

- Unit tests: dog movement goals, taming, Luck timeouts, prayer outcomes by trouble and timeout, every trap's effect, and each ring, wand and tool effect.
- Scenario tests: the kitten kills a newt and eats it, falling through a trap door, praying when Weak, zapping a wand of striking at a monster.
- The soak bot loots, zaps, prays when in trouble and walks with its pet; new invariants for pets (one leash per level change, tameness bounds) and traps (only on floor cells).

## Carry-overs from milestone 4

- **Monster ranged attacks:** monsters don't throw at other monsters, and a monster's missile kill leaves no corpse.
- **Elemental item damage:** burning scrolls, boiling potions, rusting.
- **Telepathy:** from floating eye corpses.
- **Soak coverage:** the soak never advances a skill or uses #name in short runs; give it a longer run or a scenario.
