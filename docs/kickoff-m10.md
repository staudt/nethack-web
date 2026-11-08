# Kickoff: NetHack TypeScript port, milestone 10 (draft)

Milestone 10 is the **first monster batch**: the vanilla monsters up to about difficulty 10 whose attacks the port can now play after m9, added as real rows through the converter (`docs/CONVERTER.md`: `pnpm convert:monsters <names>` and the convert test), with their corpse effects (eat.c `cprefx()`/`cpostfx()`), their generation flags and frequencies as already modelled (G_GENO, G_NOGEN, G_SGROUP, G_LGROUP, G_NOHELL, G_HELL), the small per-monster behaviours C gives them, and the **web trap** that comes with the spiders. About 83 new rows in five batches, ordered by player value. Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `DEVIATIONS.md` and `docs/CONVERTER.md` first, then the plan (`~/.claude/plans/m10.md`).

Everything is content, plus one additive core change: the `MonsterSound` union gains the sounds the new rows use (shriek, cuss, sqawk, neigh, trumpet, imitate, burble), as m9 added 'seduce' and 'laugh'. No save-format change: new state, if any, lives in `modData.nh`.

## Scope

1. **Early animals and humanoids:** hobgoblin, garter snake, snake, pit viper, dwarf lord, dwarf king, bugbear, dingo, wolf, warg, jaguar, lynx, panther, tiger, ape, yeti, carnivorous ape, sasquatch, pony, horse, warhorse, giant beetle, fire ant, soldier ant, killer bee, raven, xan, leocrotta, wumpus, mumak, crocodile, baby crocodile; their #chat sounds; the snake's level-creation object; the insects spell finding ants and snakes (ref: src/makemon.c makemon() S_SNAKE, m_initweap(); src/sounds.c domonnoise(); src/mcastu.c mcast_insects()).
2. **Spiders and webs:** cave spider, giant spider, scorpion; the web trap for the hero and monsters (stuck time by Strength, `--u.utrap` escapes, monsters' `!rn2(40)`, tearing through, flowing through or burning it), force-fighting a web, `#untrap` on webs, fire burning webs, random webs from level 7 with their giant spider, the giant spider's room web, and 3.7's spiders spinning webs (ref: src/trap.c trapeffect_web(), mu_maybe_destroy_web(), mintrap(), disarm_holdingtrap(); src/hack.c trapmove(), domove_fight_web(); src/monmove.c maybe_spin_web(); src/mklev.c traptype_rnd(), mktrap(), fill_ordinary_room(); src/zap.c zap_over_floor()).
3. **Blobs, jellies, fungi, vortices, spheres and elementals:** shrieker (and baby purple worm), violet fungus, quivering blob, blue, spotted and ochre jelly, gray ooze, brown pudding, ice and energy vortex, flaming, freezing and shocking sphere, air, fire and water elemental; the shrieker's shriek (`m_respond()`), pudding division by iron (ref: src/mon.c m_respond(), m_respond_shrieker(), mm_aggression(); src/uhitm.c pudding division, src/makemon.c clone_mon()).
4. **Undead, imps, regenerators and teleporters:** elf, human, ettin and giant zombie, ghoul, elf, human and giant mummy, imp, quasit, tengu, vampire bat, gremlin, gargoyle, and the human, elf, giant and ettin rows their corpses need; monster HP regeneration (`mon_regen()`), fleeing teleporters (`dochug()` M1_TPORT), the tengu's teleports, imps cussing, teleportitis and teleport control from corpses, the quantum mechanic's corpse, cannibalism and eating pets (ref: src/monmove.c mon_regen(), dochug(), m_move(); src/wizard.c cuss(); src/eat.c maybe_cannibal(), cprefx(), cpostfx(), intrinsic_possible(); src/mon.c undead_to_corpse()).
5. **Armed humanoids, trolls and eaters (dropped first if the budget runs short):** woodland-elf, Green-elf, Grey-elf, plains, forest and mountain centaur, ogre, ogre lord, soldier, sergeant, troll, rock mole, gelatinous cube; their starting gear, troll corpses reviving, monsters eating metal, objects and corpses (ref: src/makemon.c m_initweap(), m_initinv(); src/mkobj.c start_corpse_timeout(); src/mon.c meatmetal(), meatobj(), meatcorpse()).

## Out of scope

Monsters whose attacks or traits are not ported: breath and spit (m9 step 5), level drain and lycanthropy (m9 step 7), sliming, the nurse, mind flayers and amorous demons (m9 step 8), polymorph, shapeshifters, golems and vampires (7f), hiders and mimics (7f's perception hook), invisible monsters (black light, stalker: 7f), unicorns (the unicorn horn), boulder-throwing giants, long worms, water-only and G_NOGEN monsters (eels, sharks, Kops, player monsters), Gehennom-only monsters, unique named monsters. Globs from puddings and oozes. The full list with reasons is in the plan.

## Exit criteria

- On a phone with `?wizard=1`: genesis each batch's monsters and meet them: a pony neighs at #chat, dwarf lords turn up in the Mines, a giant spider spins a web and the hero gets stuck in it and frees herself, `#untrap` cuts a web, fire burns one, a shrieker shrieks, a brown pudding divides, a freezing sphere explodes, an imp cusses and regenerates, a tengu teleports next to her, a tengu corpse can make her jumpy, a human zombie's corpse makes her a cannibal, a wounded monster heals over time; with step 5, a Grey-elf carries elven gear, a troll rises again and a rust monster eats iron.
- In a normal game the new monsters appear at their usual depths and in their groups, and their attacks also work against pets.
- Replays and the golden test are deterministic, every golden change has a verified cause in its commit, and `pnpm check` is green locally and in CI.

## Testing

- The convert test covers every new row (stats, attacks, flags, generation, resistances, corpse data, sound).
- Unit tests for each behaviour with forced rolls or searched seeds: web stuck times and escapes, monsters in webs, burning and cutting webs, spinning webs, shrieks, pudding division, monster regeneration, fleeing teleports, tengu teleports, corpse intrinsics, cannibalism; never lucky seeds.
- Seed-dependent tests that move with the roster (Mines and Minetown fillers, Sokoban, zoos, insects) are re-fitted by seed search or pinning, not weakened.
- The soak bot runs with the new monsters and keeps its invariants.

## Status

All five steps done on branch `m10` (one commit each): 1 early animals and humanoids (af26a95), 2 spiders and webs (6e6fe89), 3 blobs, jellies, vortices, spheres and elementals (8873e63; earth elemental deferred: no wall-walking), 4 undead, imps, regenerators and teleporters (09e3ec4), 5 armed humanoids, trolls and eaters (this step's commit). 83 new rows, 164 monsters in the roster. Golden: 648 actions, `03e939f8d678bb1715cba3ea6b31` (moved once, in step 4, by the fleeing teleporters' `rn2(40)`; steps 1-3 and 5 left it unchanged because the 400-turn run stays on DL1 at XL1). Phone checks: TESTPLAN "10 monster batch 1"; what is left for later: ROADMAP "From m10" and DEVIATIONS' m10 rows.
