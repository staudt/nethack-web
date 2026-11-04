# Kickoff: NetHack TypeScript port, milestone 7c (draft)

Milestone 7c finishes the Gnomish Mines. It adds Mines' End at the bottom of the branch (three variants, each with its luckstone), makes fountains do something (`#quaff` and `#dip`, with the Watch's warnings in Minetown) and adds Orcish Town, the seventh Minetown variant. It builds on 6a (`docs/kickoff-m6a.md`, the `LevelDef` format and the Mines), 6b (`docs/kickoff-m6b.md`, Minetown and the Watch), 7a (`docs/kickoff-m7a.md`, monster spellcasting for the orc shaman) and wizard mode (`docs/kickoff-wiz.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan before writing any code.

7c must not depend on the parked 7b (boulders and Sokoban, see `docs/DECISIONS-PENDING.md`). That means no `rock` class, no boulder object, no pits and no new dungeon or level contract in core. Where a level needs one of those, it is left out or replaced, and the change is logged in `DEVIATIONS.md`.

## Scope

### Gems and gray stones

1. **The gem class:** the 22 precious gems, the 9 kinds of worthless glass and the gray stones (luckstone, loadstone, touchstone; flint and rocks exist already), with the objects.h probabilities, prices, weights and colours. Unidentified, they are named by colour: "white gem", "gray stone" (ref: include/objects.h GEM(), ROCK(); src/objnam.c xname() GEM_CLASS).
2. **Gem probabilities by depth:** the shallow levels make only the cheaper gems (ref: src/o_init.c setgemprobs(), oinit()). Random objects and box contents now include gems (ref: src/mkobj.c mkobjprobs[], boxiprobs[]).
3. **The luckstone:** a carried luck item gives +3 Luck (-3 if cursed), and it stops good or bad Luck timing out (ref: src/attrib.c stone_luck(), set_moreluck(); src/timeout.c nh_timeout()).
4. **The loadstone:** heavy, generated cursed, and a cursed one cannot be dropped or thrown (ref: src/mkobj.c mksobj_init() GEM_CLASS; src/do.c canletgo()).
5. **Shops and gems:** shopkeepers price unidentified glass as if it were a gem when they sell it, and offer little for unidentified gems (ref: src/shk.c get_cost(), set_cost()).

### Fountains

1. **Fountains in ordinary rooms** (1 in 10 per room), one in 7 of them magic (ref: src/mklev.c fill_ordinary_room(), mkfount()).
2. **`#quaff` from a fountain:** offered as "drink from the fountain" whenever the hero stands on one, alongside her potions. It covers every drinkfountain() outcome: the magic fountain's gain ability, the cool draught, self-knowledge, foul and poisoned water, water moccasins, the water demon and his wish, cursed items, the stalker image, monster detection, a gem, the water nymph, bad breath, gushing water and tasteless water (ref: src/fountain.c drinkfountain(), dowatersnakes(), dowaterdemon(), dowaternymph(), dofindgem(), dogushforth()).
3. **`#dip` into a fountain:** dipping an item or washing the hero's hands. It covers the water damage, the curse and uncurse outcomes, the demon, the nymph, the snakes, a gem, gushing water, the strange feelings, the bath that costs gold, the coins and the Lady of the Lake refusing a non-lawful hero's long sword (ref: src/fountain.c dipfountain(), wash_hands(); src/trap.c water_damage()).
4. **Drying up and the Watch:** a fountain dries up 1 time in 3 after use. In town the first time only reduces it to a trickle, and a watchman in sight yells "Hey, stop using that fountain!". Drying a fountain in town angers the Watch (ref: src/fountain.c dryup(), watchman_warn_fountain()).
5. **New monsters for fountains:** the water moccasin and the water demon (ref: include/monsters.h).

### Mines' End

1. **The bottom Mines level** is one of three variants (ref: dat/dungeon.lua `minend`, base -1, nlevels 3):
    - "Mimic of the Mines" (`minend-1`): the niches of gems and stones, the luckstone at a shuffled niche (ref: dat/minend-1.lua).
    - "Gnome King's wine cellar" (`minend-2`): the random walls, the cellar of booze and the gem pile with the luckstone (ref: dat/minend-2.lua).
    - "Catacombs" (`minend-3`): a maze made by `mazewalk` through the hand-drawn map, undead, and the luckstone at a shuffled spot (ref: dat/minend-3.lua; src/sp_lev.c lspo_mazewalk(), lspo_wallify(); src/mkmaze.c walkfrom()).
2. **Undead for the Catacombs:** kobold, gnome, orc and dwarf zombies and mummies, the ettin mummy and the mummy wrapping (ref: include/monsters.h; src/makemon.c m_initinv() S_MUMMY; src/mon.c undead_to_corpse()).

### Orcish Town

1. **The variant** (`minetn-1`): Frontier Town after the orcs came. It has the town map with its iron bars, broken walls (`replace_terrain`), the desecrated temple, the corpses of the priest, the shopkeepers and the Watch, the rocks and the leftover candles, the lamp and the wands, and the orc horde inside the walls. Minetown then rolls among seven variants, as NetHack does (ref: dat/minetn-1.lua).
2. **New monsters:** orc, Mordor orc, Uruk-hai, orc shaman (mage spells from 7a) and orc-captain, with their gear (ref: include/monsters.h; src/makemon.c m_initweap() S_ORC).
3. **The orcs who left:** the gang's leader and 5 to 14 more orcs carry gold, gems and rings and are waiting on the deeper Mines levels, the leader at the bottom (ref: src/mkmaze.c stolen_booty(), migrate_orc(), shiny_orc_stuff()).

## Out of scope

Boulders, pits and level teleporters (7b is parked; the levels leave them out). Mimics and their disguises (the Mimic of the Mines keeps its niches but not its mimics). Vampires. Engravings (the wine cellar's signs). Rubbing gems on a touchstone, gem identification by shopkeepers and unicorns. The water nymph (needs item theft and teleporting; C's "no nymph" outcome is used). Pools, so water gushing from a fountain never makes them. Diluting potions and `#dip` into potions. Sinks, random altars, graves and thrones. Achievements and the Mines' End prize. The orc gang's names and the booty items. The `teleport_region` and `non_diggable` lines of these levels (no teleporting or digging yet).

## Exit criteria

- On a phone with `?wizard=1`: levelport to Minetown, drink from a fountain from the action menu (and with `q`) until a watchman yells, then once more until it dries up and the Watch turns hostile; dip an item and wash your hands at another fountain.
- Levelport to the bottom of the Mines a few times (new games) and see each Mines' End variant; find the luckstone and identify it with wizard identify. The Luck effect is checked by tests, since the port has no Luck display.
- Orcish Town comes up as a Minetown variant (levelport in a few games): orcs, corpses, iron bars, no Watch, no priest; orcs wait on the levels below.
- Gems appear in the Mines and in the dungeon, named by colour until identified.
- Replays and the golden test are deterministic (with explained golden updates where gems, monsters or fountains first change the stream), and `pnpm check` is green locally and in CI.

## Testing

- Unit tests: setgemprobs by depth (which gems have probability 0 on DL1, DL6, DL27 and in the Mines), gem names known and unknown, `stone_luck()` and the Luck timeout with a blessed, uncursed and cursed luckstone, the cursed loadstone that cannot be dropped, and the shop prices of glass and gems.
- Scenario tests with pinned monsters and a hero placed on a fountain: each drinkfountain() and dipfountain() case reached by searching seeds for the `rnd(30)` roll (not lucky seeds), dryup's 1 in 3, the warning and then the anger in town, the water demon's wish prompt, and the gold lost to the bath.
- Level tests: each Mines' End and Orcish Town LevelDef builds at the default size and at a larger one, has its up stairs and its luckstone or orcs, and the Catacombs maze connects the stairs to the luckstone spot.
- The soak bot drinks from and dips into fountains now and then. No long soak runs: short runs on two seeds, plus the existing invariants.
- Phone check uses wizard mode (`?wizard=1`): levelport, wish, genesis.
