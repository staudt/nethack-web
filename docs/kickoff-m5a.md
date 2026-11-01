# Kickoff: NetHack TypeScript port, milestone 5a

Milestone 5 is split in two. 5a gives the Valkyrie a companion and makes Luck, prayer and the status effects work. 5b (`docs/kickoff-m5b.md`) fills in the missing object classes and traps. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan before writing any code.

The architecture rules in `CLAUDE.md` still apply unchanged. New core contracts should be small, self-describing `define*` defs that a mod author (or an AI) could use from `ARCHITECTURE.md` alone (see `docs/ROADMAP.md`).

## Scope

1. **Pets:** the Valkyrie's kitten (ref: src/role.c, src/dog.c makedog(), src/dogmove.c dog_move(), dog_eat(), dog_goal()):
    - The kitten follows you, fights, eats corpses and grows up.
    - It goes downstairs with you when adjacent (ref: src/dog.c keepdogs(), losedogs()).
    - Food tames it and abuse untames it (ref: tamedog(), abuse_dog()).
    - Walking into it swaps places with it.
    - "You stop. Your kitten is in the way." and the other rules for moving into a pet (ref: src/hack.c domove()).
    - Pets count as "safe" monsters for running and travel.
    - This needs monster-vs-monster melee (ref: src/mhitm.c mattackm()).
2. **Luck and alignment:** `u.uluck` with its timeout, and the effects already ported against Luck 0 (rnl, to-hit, search). Alignment record changes for killing peacefuls (ref: src/attrib.c change_luck(), src/mon.c xkilled() penalties). Remove the "Luck 0" notes in DEVIATIONS.md.
3. **Prayer:** `#pray` with prayer timeout, Luck and fixing troubles (ref: src/pray.c dopray(), can_pray(), fix_worst_trouble()), offered on the hero herself.
4. **Status effects:** blindness (with the `cansee` rules), confusion and hallucination, so the effects M4 logged as not ported can work (carrot, corpse effects, potion effects).
5. **Prompts:** every single-select prompt can be cancelled (Escape and a Cancel button) where NetHack allows ESC.

## Exit criteria

- The Valkyrie starts with a kitten that follows her downstairs, fights and eats.
- Luck changes outcomes, and praying when Weak from hunger fixes it.
- A blind hero sees nothing new; with telepathy she senses monsters.
- Replays and the golden test are deterministic (with an explained golden update).
- `pnpm check` is green locally and in CI.

## Testing

- Unit tests: dog movement goals, taming, Luck timeouts, prayer outcomes by trouble and timeout, and each status effect.
- Scenario tests: the kitten kills a newt and eats it, the pet follows downstairs only when adjacent, and praying when Weak.
- The soak bot prays when in trouble and walks with its pet. New invariants for pets: tameness is within bounds, and a pet that changed level was adjacent before.

## Carry-overs from milestone 4

- **Monster ranged attacks:** monsters don't throw at other monsters, and a monster's missile kill leaves no corpse.
- **Telepathy:** from floating eye corpses.
- **Soak coverage:** in short runs the soak never advances a skill or uses #name; give it a longer run or a scenario.
