# Kickoff: NetHack TypeScript port, milestone 12 (draft)

Milestone 12 is **special rooms**: the rooms `makelevel()` makes in ordinary levels through `do_mkroom()`, and the vault it makes beside them. Throne rooms with thrones you can sit on, random zoos, leprechaun halls, beehives with royal jelly, cockatrice nests, antholes, barracks, morgues with their ghosts, random temples with priests, and closed gold vaults with their guard. Seven steps. Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `DEVIATIONS.md` and `docs/CONVERTER.md` first, then the plan (`~/.claude/plans/m12.md`).

Everything but the vault's geometry is content. The vault is made by core's level generator, since NetHack rolls for it inside `makerooms()`. Core reports it as two transient `Level` requests (`vaultSpot`, `vaultTeleSpot`) that content's first `newLevel` hook consumes, like `boulderSpots`. There is no save-format change: new state (throne loot bits, the guard's record, the vault timer) lives in `modData.nh`. Room kinds are content ids in `Room.type`, like `nh:zoo` and `nh:temple`.

## Scope

1. **The chain, zoos, leprechaun halls and throne rooms:** makelevel()'s whole special-room chain in C's order, with depth gates and rolls (kinds not built yet draw their roll and make nothing). Also `pick_room()`, `mkzoo()`, `fill_zoo()` for every kind, `courtmon()`, the ruler on his throne with a mace, the royal coffers, the entry messages, and a wizard `mkroom` action for testing. New rows: ogre king and elvenking, plus the throne terrain (ref: src/mklev.c makelevel(); src/mkroom.c do_mkroom(), pick_room(), mkzoo(), fill_zoo(), mk_zoo_thronemon(), courtmon(); src/hack.c check_special_room()).
2. **Thrones:** sitting on a throne (the thirteen effects, wishes and genocide included, and the throne vanishing in a puff of logic), kicking a throne for its loot, digging refused, and 3.7's wizard-mode terrain wishes (ref: src/sit.c dosit(), throne_sit_effect(), take_gold(); src/dokick.c dokick(); src/dig.c dig_check(); src/objnam.c wizterrainwish()).
3. **Beehives, cockatrice nests, antholes and barracks:** their fills, `squadmon()`, `antholemon()`, statues and corpses from `mk_tt_object()`, and eating royal jelly. New rows: queen bee, lieutenant, captain and lump of royal jelly (ref: src/mkroom.c fill_zoo(), squadmon(), antholemon(); src/mkobj.c mk_tt_object(); src/eat.c fpostfx()).
4. **Morgues and ghosts:** `morguemon()`, corpses and chests, monsters that walk through walls, and ghost names. New row: ghost (ref: src/mkroom.c morguemon(); src/mon.c mfndpos(); src/do_name.c rndghostname()).
5. **Random temples, altars and sinks:** `mktemple()` with its shrine and priest, `induced_align()`, the ghost of an untended temple, and the sink and altar rolls of `fill_ordinary_room()` (ref: src/mkroom.c mktemple(), shrine_pos(); src/dungeon.c induced_align(); src/priest.c intemple(); src/mklev.c mksink(), mkaltar()).
6. **Vaults:** the vault roll and room in core's level generator, its gold, and the vault teleporter in a hidden niche (ref: src/mklev.c makerooms(), makelevel(), makevtele(), makeniche(); src/sp_lev.c create_room(), check_room(), fill_special_room(); src/trap.c vault_tele()).
7. **The vault guard:** the guard's arrival and question, dropping the gold, following him out along his fake corridor, the walls repaired behind, leaving the level, dying in the vault, and the cursed tin whistle. New row: guard (ref: src/vault.c; src/allmain.c).

## Out of scope

Swamps, pools, eels and piranhas (water gets its own milestone; the swamp roll is kept), graves (morgue graves and graves in ordinary rooms), level sounds, themed rooms and ordinary niches, engravings ("ad aerarium"), Fort Ludios, mimics in zoos (m13), Vlad's tower throne, roaming priests and minions, the high altars, player-monster corpses and statues with high-score names, the wizard-mode prompts, roles and races. The full list with reasons is in the plan.

## Exit criteria

- On a phone with `?wizard=1`, using `wiz:mkroom` and the terrain wish:
  - walk into a throne room, a leprechaun hall, a zoo, a beehive, a cockatrice nest, an anthole, barracks and a morgue, and get each entry message;
  - sit on a throne until it vanishes, and kick one;
  - eat royal jelly;
  - watch a ghost cross a wall;
  - find a temple with its priest below DL8;
  - find a vault and enter it through its teleporter;
  - be led out of it by the guard.
- In a normal game the rooms appear at NetHack's depths and rates, and the vault appears on about half the levels that have enough rooms.
- Replays and the golden test are deterministic. Every golden change has a verified cause in its commit (expected in steps 5 and 6 only), and `pnpm check` is green locally and in CI.

## Testing

- The convert test covers every new row.
- Unit tests for each fill (monsters, gold gradients, statues, chests, the throne and coffers), each throne effect with forced rolls, kick loot, ghost wall-walking, temple placement and alignment, vault geometry (core) and contents (content), the vault teleporter, and every branch of the guard's conversation and walk. Use searched seeds, never lucky ones.
- Seed-dependent tests that move with the layout (steps 5 and 6) are re-fitted by seed search or pinning, not weakened.
- The soak bot runs through levels with special rooms and vaults, answers the guard's question, and keeps its invariants.

## Status

All seven steps built on branch `m12` (off `m11`), one commit each; nothing was dropped (what each step left out is in ROADMAP "From m12").

- **Step 1 (ea64b94), the chain, zoos, leprechaun halls and throne rooms:** makelevel()'s whole special-room chain with C's depth gates and rolls (kinds not built yet drew their roll), `pick_room()`, `mkzoo()`, `fill_zoo()`, courts with their ruler, throne and royal coffers, leprechaun halls, random zoos, the entry messages and wake-up, the ogre king and elvenking rows, `wiz:mkroom`. Golden unchanged (verified with the two rows alone).
- **Step 2 (311feb7), thrones:** Sit on a throne (the thirteen `throne_sit_effect()` effects with the wish and genocide prompts through Sit, the 1-in-3 vanishing), kicking a throne for its loot (T_LOOTED in `modData.nh.thrones`), falling through the floor, digging refused, 3.7's wizard terrain wishes. Golden unchanged (no throne on DL1).
- **Step 3 (c80f804), beehives, cockatrice nests, antholes and barracks:** their fills, `squadmon()`, `antholemon()`, `mk_tt_object()` statues and corpses (an unnamed human), royal jelly eaten by the hero and by killer bees (`bee_eat_jelly()`), the queen bee, lieutenant and captain rows. Golden unchanged (verified with the rows alone).
- **Step 4 (8548e72), morgues and ghosts:** `morguemon()` with a narrow `ndemon()`, corpses and chests (the grave roll only), "You have an uncanny feeling...", the ghost row and wall-walking for every WALLWALK monster (`mfndpos()` ALLOW_WALL/ALLOW_ROCK, Sokoban's non-passwall flag), `rndghostname()`'s rolls. Golden unchanged.
- **Step 5 (a6d087f), random temples, altars and sinks:** `mktemple()` with `shrine_pos()` and `induced_align()`, the priest at once, the untended temple's ghost, `mksink()`/`mkaltar()` in ordinary rooms. Golden moved by the two `rn2(60)` rolls (verified: with them off it is the old hash).
- **Step 6 (dde848b), vaults:** core's vault roll in `makerooms()`, `create_vault()`, the do_vault block, `makevtele()`'s niche, handed to content as `Level.vaultSpot`/`vaultTeleSpot` (additive, explained in `ARCHITECTURE.md`); the vault gold (filled twice, as 3.7), the once-only vault teleporter made when its secret corridor is found, the shop threshold. Golden moved by the vault roll (verified with it off); bot seed 2 -> 1.
- **Step 7, the vault guard:** `invault()` with the guard's question as a text prompt raised at the end of the turn (decision 3: the engine handled it as designed), `gd_move()` with the warnings, the fake corridor dug and closed behind her, `wallify_vault()`, `uleftvault()` from `teleds()`, `paygd()` at the end of the game, a killed or dismissed guard's corridor closing, the cursed tin whistle, `#chat`, the guard row with his gear and cursed whistle. Golden unchanged (1b3cd2733cb23c01fec236e37fa3/552: no guard on the golden's run).

**Exit check for m12:** keyboard-free: yes (Sit, Kick, `wiz:mkroom` are offers or menus, the guard's question is a text prompt for the phone keyboard, wishes and genocide are text prompts); deterministic: yes (every golden change has its cause verified in its commit: steps 5 and 6; steps 1-4 and 7 left it unchanged; bot seed 1, 1b3cd2733cb23c01fec236e37fa3/552 over 400 turns); one additive core change (step 6's two transient `Level` fields, plus the `'guard'` monster sound in step 7), no save-format change (all new state in `modData.nh`); `pnpm check` green locally at every step. Pending, for the user: CI on the pushed branch and the phone check (TESTPLAN "12 special rooms").
