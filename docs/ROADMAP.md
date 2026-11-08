# Roadmap

Goals beyond the current milestone. Milestone briefs live in `docs/kickoff-m*.md`.

## Mod platform

The two mod layers exist so that people can build on the game, and building should be easy *with an AI*:

- **Game-logic mods** in the style of Quake's `progs.dat`: different levels, custom monsters and objects, changed rules. They are game mods (`Mod` and `ModApi`): deterministic, recorded in saves.
- **Renderer plugins:** alternative ways to draw the `ViewSnapshot` (`Renderer`), plus client mods for input, menus and glyphs.
- **Selectable in the web app:** a picker at new game for the game mods, and a setting for the renderer, among the ones the app ships (and later, loaded from a URL or file).

It should stay simple: a mod is one module that registers defs. The work, planned for a milestone after more content exists (after 5b and probably shops or spells):

1. A mod authoring guide (`docs/MODDING.md`) that is complete enough for an AI to write a working mod from it alone, with every `define*` def, hook and helper documented, plus a worked example.
2. Two sample mods: a game mod (a custom level generator and a few monsters) and a renderer (for example the `render-canvas` sprite or UTF-8 stub).
3. The app's picker, and save/load that respects the chosen mod list (already enforced by `ModRef[]` in saves).
4. Loading a mod bundle at runtime (an ES module URL), with clear `ModLoadError`s.

Until then, every milestone keeps new core contracts small, data-driven and documented in `ARCHITECTURE.md`. Vanilla stays an ordinary mod with no back doors.

## Deferred content

Left out of a milestone on purpose, to be picked up later. Rule differences they cause are also logged in `DEVIATIONS.md`.

From 5b (objects and traps):

- **Rings:** polymorph, polymorph control (teleportation, conflict, levitation, warning and stealth came with 7d; teleport control with 7f-a; see invisible and invisibility with 7f-b).
- **Amulets:** change, unchanging (magical breathing came with 7d).
- **Wands:** polymorph (make invisible came with 7f-b); breaking (applying) wands (wishing, digging, teleportation, cancellation, undead turning, death and enlightenment came with 7d).
- **Tools:** pick-axe and digging, magic lamp (djinni), bag of tricks, horns, musical instruments, #force.
- **Traps:** the other trap types (webs, fire traps in Gehennom, land mines, rolling boulders, polymorph, statue traps), #untrap, trapped doors and boxes (teleportation traps, level teleporters, magic traps and anti-magic fields came with 7d).
- **Item damage:** `passive_obj` on monster gear, fixing erosion.

From 6a (branches, the `LevelDef` format and the Gnomish Mines; done, phone-checked 2026-11-02):

- **Mines monsters:** dwarf lord, dwarf king, bugbear and mind flayer (the `G` and `h` classes pick only from the monsters that exist; the gnome king and gnomish wizard came with 6b1).
- **Branch stairs description:** "staircase down to the Gnomish Mines" once used (`stairs_description()`); portal branches (up branches came with 7b).
- **Either/or content entries** in `LevelDef` (minefill's `percent(50) and "h" or "G"`), and a first solidfill pass before a cave init.
- **Hero races:** the Mines' inhabitants peaceful to gnome and dwarf heroes.

From 6b1 (Minetown: special levels in a dungeon, map blocks, rooms and the Watch; done, phone check pending):

- **Minetown's missing inhabitants:** Bazaar Town's monkeys and nymph, Grotto's gnome king statue (the Watch's reaction to digging came with 7d).
- **Gnome candles:** gnomes made with a Mines level get a candle 1 time in 20 (`rn2(20)`, else `rn2(60)`); the port always rolls `rn2(60)` and makes no candle (no candle objects yet). Fixing the roll changes the game stream.
- **Altar alignment:** `induced_align()` for random altars (needs dungeon and level alignments).

From 6b2 (the Minetown temple: altars, the priest, #chat, donations and praying on an altar; done, phone check pending):

- **Sacrifice (`#offer`)** (user decision): corpse sacrifice and its gifts, converting altars (and `angry_priest()` turning a priest whose altar is lost into a roaming minion), crowning, the unicorn and same-race penalties, the atheism conduct.
- **Priest gear and names:** the 1 in 7 cloak of protection or magic resistance (needs the shuffled cloak appearances), priestesses (monster genders), the hallucinated "poohbah".
- **Other temples:** random altars and temples in ordinary rooms, roaming minions and aligned priests outside temples, the Valley and the Sanctum's high altars, ghosts in untended temples ("You are frightened to death").
- **Prayer extras:** reviving a pet's corpse on an altar (`pray_revive()`: corpses must remember their monster), undead and demon forms, Gehennom, minions, punishment, level drain, spellbook gifts, crowning, the castle tune, the gnostic conduct and wizard mode's "Force the gods to be pleased?".
- **Clairvoyance:** objects and monsters in each vision, and `seer_turn` rolled in every game (moves every replay); clairvoyance from objects and the Amulet.
- **#chat:** the remaining `domonnoise()` sounds, statues, mimics, hiders, steeds, the up/down directions, deafness and the full-moon howling.
- **Attribute exercise** (Wisdom from prayer, donations and the god's anger) and achievements (entering a temple).

From 6b3 (shops: shopkeepers, stock, buying, selling, robbery and random dungeon shops; done, phone check pending):

- **Keystone Kops** (kickoff): `call_kops()` summoning Kops around the hero, by the stairs and by the shop, their AI and their dismissal when the shopkeeper is paid off; until then the alarm only angers the Watch.
- **Callers of `make_angry_shk()`**: a shopkeeper teleported, falling or dug out of his shop, shop goods broken from outside; the function is ported with no caller.
- **Shop damage and repair**: `pay_for_damage()` for broken shop doors and dug walls ("Please pay for the door!"), the shopkeeper repairing them over time, `shopdig()` (he grabs her backpack when she falls through his floor).
- **Candle lighting**: lighting tallow and wax candles, the candelabrum and candle light ranges (light.ts), gnomes' candles in the Mines; candles are sold unlit until then.
- **Other mklev special rooms**: throne rooms, leprechaun halls, zoos, temples, beehives, morgues, antholes, barracks, swamps and cockatrice nests (`do_mkroom()`), vaults and the threshold they add, Medusa's level as the lower bound for shops; wizard mode's `SHOPTYPE`.
- **Shop types as defs**: `SHTYPES` (shtypes.ts) becomes a mod-defined def kind with the mod platform, so a mod can add a shop type.
- **Shop extras**: credit for gold dropped in a shop and loans (`donate_gold()`, `costly_gold()`), shoplifting pets, the remaining iprob objects (fruit juice, ice box, elven cloak, magic lamp, potion of oil, scroll of food detection, royal jelly), mimics posing as stock, the tribute novel, usage fees for studying unpaid spellbooks, invisible customers and steeds, hero names in greetings.

From wizard mode (`docs/kickoff-wiz.md`; done, phone-checked 2026-11-02):

- **Score list rule:** done in m8 (the per-device list skips every game whose mod list includes `wiz`; ref: src/end.c really_done(): topten() only if `!wizard && !discover`).
- **Wishing for terrain** (`fountain`; trap wishes came with 7d), artifacts, named objects and the other `readobjnam()` words listed in `DEVIATIONS.md`; the wish "help" text and history.
- **Genesis extras:** a command count, "saddled", "invisible", "hidden", genders, class descriptions ("dragon"), special-monster forcing.
- **Other `#wiz*` commands:** #wizpolymorph, #wizdetect, #wizintrinsic, #wizsmell, #wizkill and the rest; lowering the level with #levelchange (needs `losexp()`); explore mode (`-X`); debug panels in the UI.

From 7a (spellcasting: Pw, `Z`, the eight spells, monster casters; done, phone check pending):

- **Spells as defs** (with the mod platform): spell effects are a content table (`SPELL_INFO` and the switch in `cast.ts`), as shop types are; a `defineSpell` def kind or an `ObjectDef.cast` hook would let a mod add a spell. Monster spells (`MCAST_DATA` in `mcastu.ts`) likewise.
- **The other spellbooks:** the 30-odd level 1-7 books, among them the Valkyrie's special spell cone of cold (`ROLE_SPELL` already names it), with their effects (digging, magic missile, fireball, teleport, ...).
- **Detect monsters at Skilled:** the timed Detect_monsters property and its redraw.
- **Monster spells left out:** disappear (needs monster invisibility), destroy armor, summon nasties, clone wizard and touch of death (counted as useless today); `buzzmu()` ray casters (AD_FIRE/AD_COLD/AD_MAGM `AT_MAGC`); monsters remembering her resistances (`M_SEEN_*`, `m_seenres()`); Half_spell_damage sources.
- **Energy sources and drains:** the Amulet's energy drain, energy-draining attacks (AD_DREN), the potion of gain energy, Energy_regeneration and magical breathing; level drain with `u.ueninc[]` (and lowering the level with `#levelchange`).
- **Spell menu:** reordering and sorting known spells (`+`), attribute exercise from casting.

From 7c (Mines' End, fountains, Orcish Town):

- **Touchstone:** rubbing gems and metal on it (`use_stone()`), the Archeologist's and gnome's identification of gems, and the shopkeepers' and unicorns' reactions to gems (gem buying and identification by a shopkeeper's offer, throwing gems to unicorns); kicking gems.
- **Gem colours:** `randomize_gem_colors()` (turquoise and aquamarine blue or green, fluorite violet, blue, white or green per game); its draws move the game stream.
- **Mimics:** their disguises ("Wait! That's a mimic!", sticking), then the four mimics of the Mimic of the Mines posing as gray stones.
- **Vampires** (level drain, shapeshifting) for the Catacombs' two `V` (its level teleporters came with 7d).
- **The water nymph and theft:** stealing and teleporting away, for fountains (C's "no nymph" outcome stands in) and nymphs elsewhere.
- **Pools:** gushing fountains making pools, then moats and water in special levels.
- **Potions:** dilution by water damage and fountains, and `#dip` into potions (mixing).
- **Orcish Town extras:** the teleport region, the gang's names (and christening the town's orcs) and the booty items that wait for orcs below.
- **LevelDef fixup hook:** content's `SpLevFixup` table (shuffled spots, BUC, maze walks, iron bars, migrating orcs) exposed to mods as a LevelDef hook.

From 7b (boulders, pits, the scroll of earth, the Oracle level and Sokoban):

- **Rolling boulder traps:** the trap itself and its launch spot, then the ones on the Sokoban maps (their spots are plain floor today).
- **Giants and boulders:** giants carrying, throwing and stepping over boulders (`throws_rocks()`), monsters dropping boulders into pits, priests and shopkeepers fracturing them; the `m` move prefix.
- **Statues:** statue objects, statue traps and the Oracle's centaur statues.
- **The Oracle's consultations:** minor and major `doconsult()` for gold, with experience, luck and the rumors file.
- **Zoos:** random zoos (`mkzoo()` from mklev), the Sokoban zoo as a true irregular room (today a region whose squares next to its door stay empty), the treasure zoo's two giant mimics.
- **Boulders and other traps:** landmines, teleporters and level teleporters under a pushed boulder, boulders into water and lava (`boulder_hits_pool()`, after pools), shop billing for pushed boulders, objects buried in a filled pit (`bury_objs()`), the pit's limited view (vision.c).
- **Sokoban extras:** the Elbereth engraving and cursed scroll of scare monster on the prize, the builds-up difficulty adjustment in `level_difficulty()` (twice the levels climbed; changes every Sokoban monster and object roll), `des.exclusion` regions, pet and travel behaviour beyond the listed rules, the Sokoban conduct and achievements (the `noteleport`, `hardfloor` and non-diggable flags came with 7d).

From 7d (teleportation, digging, levitation, the deferred wands, rings and traps):

- **7e (content only), steps 1-8 done (branch `m7e`):** the pick-axe and mattock (`use_pick_axe()`, the `dig()` occupation, "Dig"/"Dig down" offers, the Watch's warnings, shopkeepers refusing pick-axes), dwarves digging (`mdig_tunnel()`), pits from inside a pit and conjoined pits; rolling boulder traps (launch spots, `launch_obj()`, Sokoban's spots); trapped boxes and doors (`chest_trap()`, `b_trapped()`), `#force`; land mines with `scatter()` (kicked coins scatter, boulders on land mines); `#untrap` (floor traps, beartrap and land mine objects, monsters out of pits and bear traps, boxes and doors); breaking wands (`do_break_wand()`, the "Break" offer) with `explode()` (the explosion box in the ui), cancellation beams and digging down blowing up magical traps (`maybe_explode_trap()`); shop damage (`add_damage()`, `pay_for_damage()`'s "Pay?", the keeper's repairs over time, `shopdig()`'s warning and pack grab). Webs came with m10 step 2.
- **From 7e (left for later):** setting beartraps and land mines (`use_trap()`), kicking boxes (`container_impact_dmg()`, "WHAMM!!"), burying and unearthing objects, liquid flow into pits and holes (after pools), the Master Key of Thievery, the scroll of charging's `wand_explode()`, engraving with wands, potion vapours (`potionbreathe()`), axes (chopping trees), monster blindness (a broken wand of light only says "X is blinded by the flash!"), pits in doorways (a broken wand of digging leaves a dug room wall a pitless doorway; core keeps traps on plain floor), trap detection of trapped doors and boxes, the other explosions (gas spores, fire scrolls, burning oil: `explode()` takes only wands and magical traps).
- **7f-a done (branch `m7f-a`, 3 steps):** the `position` Prompt kind with the getpos cursor (tap twice or Pick, Cancel, `z`/`Z` and highlighted valid cells), the soak bot's answers, `wiz:teleport`, the ring of teleport control with controlled teleports and level teleports, jumping boots, the spellbook of jumping and `#jump` (phone checks in TESTPLAN "7f-a position prompt and teleport control"). Polearms and lances (applying one at a spot through the position prompt, C's `use_pole()`) wait for the weapons batch that adds them (see "Missing weapon and armor objects" below).
- **7f-b done (branch `m7f-b`, 4 steps):** invisibility: the perception `hides`/`self` hooks and `I` markers in monster memory (core), the wand of make invisible, rings of invisibility and see invisible, potions of invisibility and see invisible, the cloak of invisibility (a mummy wrapping blocks it), invisible monsters and the dimmed invisible hero, the magic trap's hum, attacking and searching for unseen monsters ("Wait!", "You attack thin air.", Fight on an `I`), and monsters guessing where an invisible hero is (`set_apparxy()`, wild misses, spells at thin air, the spell of disappear, shopkeepers' "Invisible customers are not welcome!", priests and the Watch) (phone checks in TESTPLAN "7f-b invisibility"). Left for later: the spellbook of invisibility, the stalker and black light, potion vapors and thrown potions, monsters using wands and potions, hiders and mimics, the `m` movement prefix, displacement.
- **7f-c..7f-d (need core contract changes, plan `~/.claude/plans/m7f.md`):** polymorph (hero polyself with forms and attacks, monster newcham(), object poly_obj()/polypiling, polymorph traps, rings of polymorph and polymorph control, amulets of unchanging and of change, which needs hero gender in messages); statues and statue traps.
- **Also later:** amulets of guarding and flying (5.0 additions; flying shares levitation's checks), potions of levitation (invisibility came with 7f-b), magic portals, vault teleporters and niches (`make_niches()`, `makevtele()`), monsters using wands/scrolls/rings (muse.c); deafness (the magic trap's roar), level drain (`losexp()`: the tower of flame, `#levelchange`), fire traps in Gehennom (`dofiretrap()` exists); a cursed spellbook's teleport (`cursed_book()` could call `tele()`).

From m10 (monster batch 1: 83 new rows in five steps, the web trap, shrieks, pudding division, monster regeneration, teleporters, cannibalism, starting gear, troll revival and object eaters; phone checks in TESTPLAN "10 monster batch 1"):

- **Earth elemental and wall-walking:** `passes_walls()` and ALLOW_WALL in `mfndpos()` (also xorns later).
- **Globs:** gray ooze, brown and black pudding and green slime globs (`make_corpse()`), melding and eating them.
- **`mm_aggression()`:** monster-vs-monster targeting for hostiles (purple worms hunting shriekers, zombies vs the living).
- **Gremlins in water and light:** `split_mon()` from pools and fountains (`minliquid()`), splashed potions of water (`potionhit()` on monsters), light damage (camera, wand flashes, `litroom()`) and `flees_light()`.
- **`leppie_stash()`** and `deal_with_overcrowding()` for teleporting monsters.
- **Giants throwing boulders** (ROADMAP "Giants and boulders"): they carry the boulder `m_initweap()` gives them.
- **Missing weapon and armor objects** that starting gear rolls but cannot give: two-handed sword, battle axe, lucern hammer, flail, the polearms (partisan, ranseur, glaive, spetum, ...: watchmen and soldiers get a spear), silver saber, the elven cloak, leather helm, boots, shield, short sword, broadsword and spear, the mercenary armor (plate, splint, banded, studded leather, helmet, dented pot, large shield, boots, leather cloak), K- and C-rations, the bugle and tin whistle.
- **Eaters' extras:** monsters' intrinsics from eaten corpses (`mon_givit()`), growing up and polymorph food in `m_consume_obj()`, poisoned objects, Rider corpses; troll corpses reviving on a level the hero left (they rot instead) or from containers and graves.
- **Left out of the batch:** unicorns (with the unicorn horn), mimics and piercers (7f hiding), black light and stalker (7f invisibility), long worms, golems, the naga hatchlings with their adults, the m9 step 5/7/8 monsters, and rows above difficulty 10 that need nothing new (umber hulk, black pudding, winged gargoyle, ogre tyrant, elf noble, elven king, ice and rock troll, lurker above, titanothere, baluchitherium).

From m9 (damage types and attack styles; steps 1-7 done, 8 not built; phone checks in TESTPLAN "9 damage types and attack styles"):

- **Breath and spit, the rest (step 5 built the core: the winter wolf cub and the cobra):** the other breathers and spitters (winter wolf, hell hounds, red and black nagas, the adult dragons), AD_RBRE (chromatic dragon) and disintegration breath; poison gas clouds (regions); pets and Conflict using breath and spit on monsters (`dog_move()`'s ranged targets; `breamm()`/`spitmm()` already take a monster); `m_seenres()`; `m_balks_at_approaching()` so breathers keep their distance.
- **Level drain and lycanthropy, the rest (step 7 built `losexp()`, `AD_DRLI`, `AD_WERE`, the wraith, barrow wight and the six were rows):** the hero turning into her were form (`you_were()`: the per-turn `rn2(80)` roll, unholy water, `polymon()`; `you_unwere()`'s rehumanize; summoning help with `#monster`; the Hate_silver line): 7f-d; silver weapons against weres and a lycanthrope hero (no silver damage at all yet); vampires and vampire lords (shapeshifting, 7f); Protection_from_shape_changers (no such ring); thrones' "terrible experience" (no thrones); `SPE_DRAIN_LIFE`, Stormbringer; potions of restore ability and gain level (not in the object table) restoring lost levels; sprigs of wolfsbane (not in the object table); monsters fleeing a scary square after changing form (`onscary()` not ported); `mon_break_armor()` for a were turning beast (7f).
- **Step 8:** sliming (`AD_SLIM`, green slime), nurse (`AD_HEAL`), mind flayers (`AD_DRIN`), cockatrice eggs (delayed stoning), incubus/succubus `doseduce()` with monster genders.
- **Notable skips:** M1_TPORT self-teleporting fleeing monsters (`rn2(40)` in `dochug()`; changes the golden); the `AD_STCK` negation roll against monsters (changes the golden); `m_balks_at_approaching()` so ranged monsters keep their distance; `munstone()` and monster item use (muse.c); `loot_mon()` and engulfers moving while holding the hero; Medusa (needs unique-name rendering); `leppie_stash()`; `steal_it()` (7f); the Riders, `AD_SAMU`, `buzzmu()` casters.

From m8 (release polish: the end of the game, help, score, the high-score list, options, the title screen and `#quit`):

- **Conduct and achievements:** tracking them (each changes the golden once), then the disclosure's conduct and achievements lists.
- **Dungeon overview:** `^o`/`#overview` and the disclosure's overview list (needs remembered level features: altars, fountains, shops, branches).
- **Genocide:** the scroll of genocide and the disclosure's genocided list; `how == GENOCIDED` in done().
- **Dumplog and bones:** a dump of the finished game (a download from the end sheet), bones levels (need a shared store, so likely never on a static site).
- **The `taken` variant:** "what you had when you died" after a shopkeeper takes your things at death (paybill()).
- **Game-side options** (autopickup, `pickup_types`, `paranoid_confirmation`, `safe_pet`, the score list's `end_top`/`end_around`/`end_own`): they change the game, so they must live in `GameState` and be set by actions to keep replays deterministic.
- **Roles, races, genders and alignment** chosen at new game (one role, the Valkyrie, exists), with the title screen's Play asking for them.
- **The name in the game:** the welcome ("Hello <name>, welcome to NetHack!") and other in-game uses need the name in `GameState` (a newGame option, the save format and the worker protocol); today it is a device option used only by the stone, Goodbye and the score list.
- **Version in About and on the title:** the app's `package.json` is 0.0.0 and the Pages build has no commit define yet.
