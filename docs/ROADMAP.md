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

- **Rings:** protection from shape changers (teleportation, conflict, levitation, warning and stealth came with 7d; teleport control with 7f-a; see invisible and invisibility with 7f-b; polymorph and polymorph control with 7f-d).
- **Amulets:** done (magical breathing came with 7d, change and unchanging with 7f-d).
- **Wands:** done (wishing, digging, teleportation, cancellation, undead turning, death and enlightenment came with 7d, breaking (applying) wands with 7e, make invisible with 7f-b, polymorph with 7f-d).
- **Tools:** pick-axe and digging, magic lamp (djinni), bag of tricks, horns, musical instruments, #force.
- **Traps:** fire traps in Gehennom, magic portals, vibrating squares (teleportation traps, level teleporters, magic traps and anti-magic fields came with 7d; land mines, rolling boulders, #untrap, trapped doors and boxes and webs since; statue traps with 7f-c; polymorph traps with 7f-d).
- **Item damage:** `passive_obj` on monster gear, fixing erosion.

From 6a (branches, the `LevelDef` format and the Gnomish Mines; done, phone-checked 2026-11-02):

- **Mines monsters:** dwarf lord, dwarf king, bugbear and mind flayer (the `G` and `h` classes pick only from the monsters that exist; the gnome king and gnomish wizard came with 6b1).
- **Branch stairs description:** "staircase down to the Gnomish Mines" once used (`stairs_description()`); portal branches (up branches came with 7b).
- **Either/or content entries** in `LevelDef` (minefill's `percent(50) and "h" or "G"`), and a first solidfill pass before a cave init.
- **Hero races:** the Mines' inhabitants peaceful to gnome and dwarf heroes.

From 6b1 (Minetown: special levels in a dungeon, map blocks, rooms and the Watch; done, phone check pending):

- **Minetown's missing inhabitants:** done (the Watch's reaction to digging came with 7d, Bazaar Town's monkeys and nymph with m9, Grotto's gnome king statue with 7f-c).
- **Gnome candles:** gnomes made with a Mines level get a candle 1 time in 20 (`rn2(20)`, else `rn2(60)`); the port always rolls `rn2(60)` and makes no candle (no candle objects yet). Fixing the roll changes the game stream.
- **Altar alignment:** `induced_align()` for random altars (needs dungeon and level alignments).

From 6b2 (the Minetown temple: altars, the priest, #chat, donations and praying on an altar; done, phone check pending):

- **Sacrifice (`#offer`)** (user decision): corpse sacrifice and its gifts, converting altars (and `angry_priest()` turning a priest whose altar is lost into a roaming minion), crowning, the unicorn and same-race penalties, the atheism conduct.
- **Priest gear and names:** the 1 in 7 cloak of protection or magic resistance (needs the shuffled cloak appearances), priestesses (monster genders), the hallucinated "poohbah".
- **Other temples:** roaming minions and aligned priests outside temples, the Valley and the Sanctum's high altars (random temples, random altars and the untended temple's ghost came in m12 step 5).
- **Prayer extras:** reviving a pet's corpse on an altar (`pray_revive()`: corpses must remember their monster), undead and demon forms, Gehennom, minions, punishment, level drain, spellbook gifts, crowning, the castle tune, the gnostic conduct and wizard mode's "Force the gods to be pleased?".
- **Clairvoyance:** objects and monsters in each vision, and `seer_turn` rolled in every game (moves every replay); clairvoyance from objects and the Amulet.
- **#chat:** the remaining `domonnoise()` sounds, statues, mimics, hiders, steeds, the up/down directions, deafness and the full-moon howling.
- **Attribute exercise** (Wisdom from prayer, donations and the god's anger) and achievements (entering a temple).

From 6b3 (shops: shopkeepers, stock, buying, selling, robbery and random dungeon shops; done, phone check pending):

- **Keystone Kops** (kickoff): `call_kops()` summoning Kops around the hero, by the stairs and by the shop, their AI and their dismissal when the shopkeeper is paid off; until then the alarm only angers the Watch.
- **Callers of `make_angry_shk()`**: a shopkeeper teleported, falling or dug out of his shop, shop goods broken from outside; the function is ported with no caller.
- **Shop damage and repair**: `pay_for_damage()` for broken shop doors and dug walls ("Please pay for the door!"), the shopkeeper repairing them over time, `shopdig()` (he grabs her backpack when she falls through his floor).
- **Candle lighting**: lighting tallow and wax candles, the candelabrum and candle light ranges (light.ts), gnomes' candles in the Mines; candles are sold unlit until then.
- **Other mklev special rooms**: ~~throne rooms, leprechaun halls, zoos, temples, beehives, morgues, antholes, barracks and cockatrice nests (`do_mkroom()`), vaults and the threshold they add~~ (m12; swamps: see "From m12"), Medusa's level as the lower bound for shops; wizard mode's `SHOPTYPE`.
- **Graves** (m12 step 4 draws the morgue roll only): grave terrain, `make_grave()` (headstone epitaphs, buried objects and corpses), `mkgrave()` in ordinary rooms (not rolled), digging graves up (zombies, mummies, alignment), #sit on a grave, troll corpses in graves.
- **Shop types as defs**: `SHTYPES` (shtypes.ts) becomes a mod-defined def kind with the mod platform, so a mod can add a shop type.
- **Shop extras**: credit for gold dropped in a shop and loans (`donate_gold()`, `costly_gold()`), shoplifting pets, the remaining iprob objects (fruit juice, ice box, elven cloak, magic lamp, potion of oil, scroll of food detection), ~~mimics posing as stock~~ (m13 step 3), the tribute novel, usage fees for studying unpaid spellbooks, invisible customers and steeds, hero names in greetings.

From wizard mode (`docs/kickoff-wiz.md`; done, phone-checked 2026-11-02):

- **Score list rule:** done in m8 (the per-device list skips every game whose mod list includes `wiz`; ref: src/end.c really_done(): topten() only if `!wizard && !discover`).
- **Wishing for terrain** (`fountain`; trap wishes came with 7d), artifacts, named objects and the other `readobjnam()` words listed in `DEVIATIONS.md`; the wish "help" text and history.
- **Genesis extras:** a command count, "saddled", "invisible", "hidden", genders, class descriptions ("dragon"), special-monster forcing.
- **Other `#wiz*` commands:** #wizpolymorph, #wizdetect, #wizintrinsic, #wizsmell, #wizkill and the rest; lowering the level with #levelchange (needs `losexp()`); explore mode (`-X`); debug panels in the UI.

From 7a (spellcasting: Pw, `Z`, the eight spells, monster casters; done, phone check pending):

- **Spells as defs** (with the mod platform): spell effects are a content table (`SPELL_INFO` and the switch in `cast.ts`), as shop types are; a `defineSpell` def kind or an `ObjectDef.cast` hook would let a mod add a spell. Monster spells (`MCAST_DATA` in `mcastu.ts`) likewise.
- **The other spellbooks:** the 30-odd level 1-7 books, among them the Valkyrie's special spell cone of cold (`ROLE_SPELL` already names it), with their effects (digging, magic missile, fireball, teleport, ...).
- **Detect monsters at Skilled:** the timed Detect_monsters property and its redraw (also the blessed potion of monster detection, which acts as uncursed since m11 step 6).
- **Monster spells left out:** disappear (needs monster invisibility), destroy armor, summon nasties, clone wizard and touch of death (counted as useless today); `buzzmu()` ray casters (AD_FIRE/AD_COLD/AD_MAGM `AT_MAGC`); monsters remembering her resistances (`M_SEEN_*`, `m_seenres()`); Half_spell_damage sources.
- **Energy sources and drains:** the Amulet's energy drain, energy-draining attacks (AD_DREN), the potion of gain energy, Energy_regeneration and magical breathing; level drain with `u.ueninc[]` (and lowering the level with `#levelchange`).
- **Spell menu:** reordering and sorting known spells (`+`), attribute exercise from casting.

From 7c (Mines' End, fountains, Orcish Town):

- **Touchstone:** rubbing gems and metal on it (`use_stone()`), the Archeologist's and gnome's identification of gems, and the shopkeepers' reactions to gems (gem buying and identification by a shopkeeper's offer); kicking gems. (Throwing gems to unicorns: m13 step 4.)
- **Gem colours:** `randomize_gem_colors()` (turquoise and aquamarine blue or green, fluorite violet, blue, white or green per game); its draws move the game stream.
- ~~**Mimics:** their disguises ("Wait! That's a mimic!", sticking), then the four mimics of the Mimic of the Mines posing as gray stones.~~ (m13 steps 2 and 3)
- **Vampires** (level drain, shapeshifting) for the Catacombs' two `V` (its level teleporters came with 7d).
- **The water nymph and theft:** stealing and teleporting away, for fountains (C's "no nymph" outcome stands in) and nymphs elsewhere.
- **Pools:** gushing fountains making pools, then moats and water in special levels.
- **Potions:** dilution by water damage and fountains, and `#dip` into potions (mixing).
- **Orcish Town extras:** the teleport region, the gang's names (and christening the town's orcs) and the booty items that wait for orcs below.
- **LevelDef fixup hook:** content's `SpLevFixup` table (shuffled spots, BUC, maze walks, iron bars, migrating orcs) exposed to mods as a LevelDef hook.

From 7b (boulders, pits, the scroll of earth, the Oracle level and Sokoban):

- **Rolling boulder traps:** the trap itself and its launch spot, then the ones on the Sokoban maps (their spots are plain floor today).
- **Giants and boulders:** giants carrying, throwing and stepping over boulders (`throws_rocks()`), monsters dropping boulders into pits, priests and shopkeepers fracturing them; the `m` move prefix.
- **Statues:** done with 7f-c (statue objects, statue traps, the Oracle's centaur statues).
- **The Oracle's consultations:** minor and major `doconsult()` for gold, with experience, luck and the rumors file.
- **Zoos:** random zoos (`mkzoo()` from mklev), the Sokoban zoo as a true irregular room (today a region whose squares next to its door stay empty), ~~the treasure zoo's two giant mimics~~ (m13 step 3).
- **Boulders and other traps:** landmines, teleporters and level teleporters under a pushed boulder, boulders into water and lava (`boulder_hits_pool()`, after pools), shop billing for pushed boulders, objects buried in a filled pit (`bury_objs()`), the pit's limited view (vision.c).
- **Sokoban extras:** the Elbereth engraving and cursed scroll of scare monster on the prize, the builds-up difficulty adjustment in `level_difficulty()` (twice the levels climbed; changes every Sokoban monster and object roll), `des.exclusion` regions, pet and travel behaviour beyond the listed rules, the Sokoban conduct and achievements (the `noteleport`, `hardfloor` and non-diggable flags came with 7d).

From 7d (teleportation, digging, levitation, the deferred wands, rings and traps):

- **7e (content only), steps 1-8 done (branch `m7e`):** the pick-axe and mattock (`use_pick_axe()`, the `dig()` occupation, "Dig"/"Dig down" offers, the Watch's warnings, shopkeepers refusing pick-axes), dwarves digging (`mdig_tunnel()`), pits from inside a pit and conjoined pits; rolling boulder traps (launch spots, `launch_obj()`, Sokoban's spots); trapped boxes and doors (`chest_trap()`, `b_trapped()`), `#force`; land mines with `scatter()` (kicked coins scatter, boulders on land mines); `#untrap` (floor traps, beartrap and land mine objects, monsters out of pits and bear traps, boxes and doors); breaking wands (`do_break_wand()`, the "Break" offer) with `explode()` (the explosion box in the ui), cancellation beams and digging down blowing up magical traps (`maybe_explode_trap()`); shop damage (`add_damage()`, `pay_for_damage()`'s "Pay?", the keeper's repairs over time, `shopdig()`'s warning and pack grab). Webs came with m10 step 2.
- **From 7e (left for later):** setting beartraps and land mines (`use_trap()`), kicking boxes (`container_impact_dmg()`, "WHAMM!!"), burying and unearthing objects, liquid flow into pits and holes (after pools), the Master Key of Thievery, the scroll of charging's `wand_explode()`, engraving with wands, potion vapours (`potionbreathe()`), axes (chopping trees), monster blindness (a broken wand of light only says "X is blinded by the flash!"), pits in doorways (a broken wand of digging leaves a dug room wall a pitless doorway; core keeps traps on plain floor), trap detection of trapped doors and boxes, the other explosions (gas spores, fire scrolls, burning oil: `explode()` takes only wands and magical traps).
- **7f-a done (branch `m7f-a`, 3 steps):** the `position` Prompt kind with the getpos cursor (tap twice or Pick, Cancel, `z`/`Z` and highlighted valid cells), the soak bot's answers, `wiz:teleport`, the ring of teleport control with controlled teleports and level teleports, jumping boots, the spellbook of jumping and `#jump` (phone checks in TESTPLAN "7f-a position prompt and teleport control"). Polearms and lances (applying one at a spot through the position prompt, C's `use_pole()`) wait for the weapons batch that adds them (see "Missing weapon and armor objects" below).
- **7f-b done (branch `m7f-b`, 4 steps):** invisibility: the perception `hides`/`self` hooks and `I` markers in monster memory (core), the wand of make invisible, rings of invisibility and see invisible, potions of invisibility and see invisible, the cloak of invisibility (a mummy wrapping blocks it), invisible monsters and the dimmed invisible hero, the magic trap's hum, attacking and searching for unseen monsters ("Wait!", "You attack thin air.", Fight on an `I`), and monsters guessing where an invisible hero is (`set_apparxy()`, wild misses, spells at thin air, the spell of disappear, shopkeepers' "Invisible customers are not welcome!", priests and the Watch) (phone checks in TESTPLAN "7f-b invisibility"). Left for later: the spellbook of invisibility, ~~the stalker and black light~~ (m13 step 8), potion vapors and thrown potions, monsters using wands and potions, ~~hiders and mimics~~ (m13 steps 1-3), the `m` movement prefix, displacement.
- **7f-c done (branch `m7f-c`, 3 steps):** statues drawn as the monster they show (core `ObjectDef.appearanceOf`, `itemShownId`), with a random monster and maybe a spellbook inside, in ordinary rooms (1 in 20), on the Oracle level (eight historic centaurs) and in Grotto Town (the historic gnome king), broken by striking, force bolt, a pick-axe and blasts, wished for; statue traps (from difficulty 8) and the spell of stone to flesh with the four meat objects; every stoning leaves a statue holding the monster's things (a unique monster's is historic), and a purple worm eats a corpse dropped inside it (a cockatrice corpse turns it to stone) (phone checks in TESTPLAN "7f-c statues"). Left for later: ~~golems (stone and flesh golems, `mon_to_stone()`)~~ (m13 step 6), ~~figurines~~ (m13 step 7), doppelgangers and saved monster traits in statues (`omonst`), named statues, ~~mimics posing as statues~~ (m13 step 2), monsters wielding cockatrice corpses (`select_hwep()`, `mselftouch()`), monsters bumping into cockatrices while hurtling, shop billing for a fractured statue, #tip/#apply on statues, Look naming a remembered statue out of sight.
- **7f-d done (branch `m7f-d`, 6 steps):** polymorph: the seven polymorph objects and the polymorph trap, the hero's gender (the amulet of change, every gendered text), monsters (`newcham()`, system shock, polymorph traps, iron shoes and kicking boots), objects (`poly_obj()`, polypiling and shuddering), the hero (`polyself()` with control, system shock, Unchanging, forms with their own hit points, properties, speed and glyph, `newman()`, a lycanthrope's beast form), what a form can wear, wield, carry and eat, fighting as a form and monsters fighting it, and `#monster` (breath, spit, gaze, a lycanthrope's call for help, a gremlin's multiplying, a shrieker's shriek) (phone checks in TESTPLAN "7f-d polymorph").
- **From 7f (left for later):** ~~polearms and lances~~ (m11 step 2); ~~golems (no golem monsters: polypiling melds nothing, no stone or flesh golem forms, no clay golem cancellation)~~ (m13 step 6); ~~figurines~~ (m13 step 7); ~~eggs (hatching, laying as a form)~~ (m11 step 5; left: the pyrolisk egg's explosion, `poly_obj()`'s laid eggs, `unturn_dead()` for carried eggs; #sit's thrones, pools, lava, ice, graves, ladders and drawbridges); vampire shapeshifting and other shapeshifters (chameleons, doppelgangers); ~~silver~~ (m11 step 2; left: `retouch_object()` for a silver-hating form wielding or wearing silver, shades, vampire shapeshifters); `#monster` for abilities the roster lacks or the port has not built (a nymph form removing an iron ball, hiding and mimicking, spinning webs and walking them, mind blasts, unicorn horns, vampires, steeds' breath; spitting up or down); monster genders on polymorph; a form holding a monster it sticks to; two-weapon alternation for forms; non-food meals of metallivore and other forms; swimming, passing walls, clinging forms; dragon armor; ~~genocide ("You feel rather gnome-ish.")~~ (m11 step 7).
- **Also later:** amulets of guarding and flying (5.0 additions; flying shares levitation's checks), ~~potions of levitation~~ (m11 step 6; invisibility came with 7f-b), magic portals, ~~vault teleporters~~ (m12 step 6) and niches (`make_niches()`, see "From m12"), monsters using wands/scrolls/rings (muse.c); deafness (the magic trap's roar), level drain (`losexp()`: the tower of flame, `#levelchange`), fire traps in Gehennom (`dofiretrap()` exists); a cursed spellbook's teleport (`cursed_book()` could call `tele()`).

From m13 (monster batch 2: hiding monsters, mimics where NetHack puts them, unicorns and the unicorn horn, long worms and the crysknife, golems and polypiling, figurines, and 34 more rows from nagas to liches; phone checks in TESTPLAN "13 monster batch 2"):

- **Shapeshifters and seducers:** vampires and vampire lords (bat, fog and wolf forms; `morguemon()`'s vampire branch still finds none), chameleons and doppelgangers, incubi and succubi (`doseduce()` needs monster genders; `ndemon()` still finds none).
- **Dragons and the beholder:** the adult and baby dragons (scales and scale mail, disintegration breath, AD_RBRE), the beholder's five 5.0 gazes (disintegration, cancellation), the displacer beast (displacement), the genetic engineer (AD_POLY).
- **Covetous and Gehennom monsters:** master liches and arch-liches (`tactics()`; a demilich never grows up meanwhile), hell hounds, the salamander, steam and fire vortices, the disenchanter, lemures, devils and demons; angels and other minions (`emin`).
- **Never-generated specials:** Keystone Kops (shop robbery), the minotaur, skeleton, shade, woodchuck, water troll, eels, the djinni, the mail daemon; the Riders, uniques, quest monsters and player monsters.
- **Extinction:** `mbirth_limit()` and `G_EXTINCT` (at most nine Nazgul; a figurine of an extinct species "turns to dust", the confused scroll of light's "sparkle" for an extinct light).
- **Growing up:** gender changes ("changes into a male gnome lord") and "he"/"she" in the genocided-growth line; growing up and polymorph from eaten objects (`m_consume_obj()`, from m10).
- **Hiding and mimicking as a form:** `#monster` hide (`u.uundetected`) and mimicking (`u.m_ap_type`, eating a mimic corpse); eels and hiding in water (no water); Detect_monsters and the a11y notices for hiders; hiders thrown at, hurtled into, revived or animated from statues (never hidden when made).
- **Mimic leftovers:** disguises blocking light (core's sight blockers are boulders only), Look naming only the disguise on a furniture mimic (core terrain memory), the getpos `m` list leaking a disguised mimic, "statue of a <mon>" disguises, the slime mold (the health food store's mimic poses as royal jelly), Protection_from_shape_changers, the rogue level, a mimic keeping a key, zap-specific reveal lines.
- **Unicorn horn leftovers:** pets and monsters applying horns (dogmove.c, muse.c: m14), a polymorphed hero's horn, deafness (the cursed seventh harm and a trouble to fix), cream on the face (`u.ucreamed`), `degraded_horn`, `mavenge`, `mrevived`'s experience and kill-count reductions, sacrificing a unicorn.
- **Long worm leftovers:** monsters attacking a worm through its tail, swapping with a peaceful worm's tail, `notonhead` effects (artifacts, mirrors), a polymorphed hero's weapon attacks and kicked objects cutting, shop bill changes for a tooth or crysknife (`alter_cost()`), `size_wseg()` (#stats), tame tails drawn as tame.
- **Golem leftovers:** the leash, saddle, grappling hook, boomerang and iron chain objects (golems roll for them and drop nothing) and their init rolls, golem names on drops, `minliquid()`/`drown()` for iron golems, `on_fire()`'s "melting"/"heating up" wordings.
- **Figurine leftovers:** figurine genders, object names passed on, pools, air and water levels ("release the figurine"), minions; a figurine on another level transforming on arrival (C runs that level's timers then) and with messages.
- **Monster batch 2 leftovers:** giants throwing boulders (see "Giants and boulders"), monsters putting on rings (the Nazgul carries its ring of invisibility), Elbereth (hiders and mimics do not need it), globs (from m10).

From m12 (special rooms: the whole `makelevel()` chain, throne rooms and thrones, zoos, leprechaun halls, beehives and royal jelly, cockatrice nests, antholes, barracks, morgues and wall-walking ghosts, random temples, altars and sinks, vaults with their teleporter and guard; phone checks in TESTPLAN "12 special rooms"):

- **Swamps and pools:** water terrain, swimming and drowning, `minliquid()`, wet items, boulders into water, the eels and piranhas; the swamp's chain roll is drawn and nothing is made.
- **Graves:** the morgue's `!rn2(5)` roll is drawn and nothing is made; `mkgrave()` in ordinary rooms is not rolled; headstones and epitaphs, buried objects, digging graves up; `paygd()`'s "To Croesus" grave.
- **Level sounds:** `dosounds()` (courtly conversation, buzzing, the vault's "someone counting money", the morgue's and the barracks' noises) and the `has_*` level flags.
- **Themed rooms and ordinary niches:** `make_niches()` (trapdoor niches), the themed rooms and `rnd_rect()`'s interplay with them.
- **Engravings:** the vault niche's "ad aerarium", Elbereth and the rest.
- **Fort Ludios** and `mk_knox_portal()` (not rolled).
- ~~**Mimics** in treasure zoos and shops~~ (m13 steps 2 and 3).
- **Thrones elsewhere:** Vlad's tower special throne, the Samurai quest's throne room; wizard mode's "Throne sit effect" and "Analyze throne?" prompts and `pick_room()`'s `|| wizard`.
- **Priests:** roaming minions and aligned priests outside temples, the Valley's and the Sanctum's high altars.
- **Player monsters and the record:** `mk_tt_object()`'s corpses and statues named after high-score entries (`tt_oname()`; an unnamed human for now), player-monster forms.
- **Royal jelly:** pets eating it, rubbing it on eggs, the spilled ration's jelly.
- **Morgue monsters:** vampires and minor demons (`morguemon()`'s branches find none), monster names (ghosts' `rndghostname()` rolls are drawn), passing iron bars (`passes_bars()`).
- **The vault guard's leftovers:** the player's name (a lawful hero's lie), deafness, a hiding or object-mimicking hero, gold eating and destroying witnessed by the guard (`vault_gd_watching()`), Croesus ("Back from the dead, are you?"), Punishment in `clear_fcorr()`, monsters' item use around guards (muse.c), traps on hidden terrain (the vault teleporter waits for its corridor to be found).

From m11 (objects batch: about 150 new rows in eight steps, polearms, silver, eggs and #sit, attribute peaks, timed levitation, genocide, scare monster, detection and the spellbooks; phone checks in TESTPLAN "11 objects batch"):

- **Objects left out of the batch:** ~~worm tooth and crysknife (with long worms)~~ (m13 step 5), the boomerang (`boomhit()`'s curved flight; wood golems roll for one and drop nothing), the leash, saddle, grappling hook and iron chain (rope, leather and iron golems roll for them and drop nothing), applying the bullwhip (`use_whip()`; it fights as a melee weapon), the dragon scales and scale mails (with dragons), the potion of oil (lamps and light sources), the scrolls of punishment (ball and chain) and stinking cloud (gas regions), the novel and the Book of the Dead, the other tools and foods, amulets of guarding and flying, the ring of protection from shape changers, the heavy iron ball and chain, the invocation items; the spellbook of chain lightning (`cast_chain_lightning()`: dropped first by the plan, its row stays out).
- **Weapons and silver:** the acid venom's extra `rnd(6)` and the iron chain in `dmgval()`; blessed and axe-versus-wooden `dmgval()` bonuses; `could_pole_mon()` (with a quiver; `f` always applies the wielded pole), the applied hit's confusing touch (`u.umconf`), jousting and steeds, Snickersnee; `retouch_object()` for a silver-hating form, shades, vampire shapeshifters, hitting with garlic, `NOGARLIC`, the unseen "Its flesh is seared!" of a monster's missile.
- **Armor:** `mon_reflects()` (monsters with a shield of reflection), water walking (no water yet), `see_monsters()` after a wear change; the Furies (no erinys row: the `rn2(50)` is rolled), Wizards' cornuthaum and tourists reading conical hats; Fumbling on ice, steeds and pools and its other checks (whips, grappling, jumping, cream pies, falling down stairs, bumping doors, exercise).
- **Eggs:** the pyrolisk egg's explosion (eaten, broken, hitting), `poly_obj()`'s laid-egg case, `unturn_dead()` for carried eggs, thrown potions landing whole (`potionhit()`); #sit's pools, lava, ice, graves, ladders and drawbridges (thrones: m12 step 2).
- **Potions:** the timed `Detect_monsters` (blessed potion and Skilled spell of detect monsters act as uncursed, decision 8), fruit names, the Healer, dilution, Half_physical_damage, attribute exercise, potion vapors (`potionbreathe()`) and hits (`potionhit()`), monsters drinking and throwing potions (muse.c).
- **Scrolls and genocide:** the Valkyrie role monster (a confused genocide names her role by id and a confused cursed one sends in nothing), extinction (`G_EXTINCT` from birth counts), chameleons, class names ("dogs") in class genocide, Elbereth, `GP_CHECKSCARY` placement in `makemon()`/`enexto()`, `newcham()`'s flight from a scary square, the "Maud" check, `meverseen`, rechargeable tools (every tool gives "a feeling of loss"), shop charges for dust and altered objects, `selftouch()` for gloves lost while wielding a cockatrice corpse.
- **Detection and spells:** buried objects, ~~mimics posing as objects (cursed object detection)~~ (m13 step 3), the trapped-door and trapped-chest glyphs (found chest traps are only known), `nommap` levels, body parts of forms ("hooves"), edibility prompts (`u.uedibility` is recorded only), `browse_map()`, the random farsight's objects and monsters, ~~golems' hit points per level for drain life~~ (m13 step 6), knock's hurtle through regions or water and into a cockatrice.

From m10 (monster batch 1: 83 new rows in five steps, the web trap, shrieks, pudding division, monster regeneration, teleporters, cannibalism, starting gear, troll revival and object eaters; phone checks in TESTPLAN "10 monster batch 1"):

- **Earth elemental and wall-walking:** ~~`passes_walls()` and ALLOW_WALL in `mfndpos()`~~ (m12 step 4, ghosts); ~~the earth elemental and xorn rows~~ (m13 step 8); left: passing iron bars (`passes_bars()`), a hero form passing walls.
- **Globs:** gray ooze, brown and black pudding and green slime globs (`make_corpse()`), melding and eating them.
- **`mm_aggression()`:** monster-vs-monster targeting for hostiles (purple worms hunting shriekers, zombies vs the living).
- **Gremlins in water and light:** `split_mon()` from pools and fountains (`minliquid()`), splashed potions of water (`potionhit()` on monsters), light damage (camera, wand flashes, `litroom()`) and `flees_light()`.
- **`leppie_stash()`** and `deal_with_overcrowding()` for teleporting monsters.
- **Giants throwing boulders** (ROADMAP "Giants and boulders"): they carry the boulder `m_initweap()` gives them.
- ~~**Missing armor objects** that starting gear rolls but cannot give~~ (weapons m11 step 1; the elven and mercenary armor, K- and C-rations, the bugle and the watchmen's tin whistle m11 step 3).
- **Eaters' extras:** monsters' intrinsics from eaten corpses (`mon_givit()`), growing up and polymorph food in `m_consume_obj()`, poisoned objects, Rider corpses; troll corpses reviving on a level the hero left (they rot instead) or from containers and graves.
- **Left out of the batch:** ~~unicorns (with the unicorn horn)~~ (m13 step 4), ~~mimics and piercers~~ (m13 steps 1-3), ~~black light and stalker~~ (m13 step 8), ~~long worms~~ (m13 step 5), ~~golems~~ (m13 step 6), ~~the naga hatchlings with their adults~~ (m13 step 8), the m9 step 5/7/8 monsters (vampires, incubi and succubi, dragons: see "From m13"), and ~~rows above difficulty 10 that need nothing new (umber hulk, black pudding, winged gargoyle, ogre tyrant, elf noble, elven king, ice and rock troll, lurker above, titanothere, baluchitherium)~~ (m12 and m13).

From m9 (damage types and attack styles; steps 1-8 done, step 8 without eggs or doseduce; phone checks in TESTPLAN "9 damage types and attack styles"):

- **Breath and spit, the rest (step 5 built the core: the winter wolf cub and the cobra):** the other breathers and spitters (~~winter wolf~~, hell hounds, ~~red and black nagas~~ (m13 step 8), the adult dragons), AD_RBRE (chromatic dragon) and disintegration breath; poison gas clouds (regions); pets and Conflict using breath and spit on monsters (`dog_move()`'s ranged targets; `breamm()`/`spitmm()` already take a monster); `m_seenres()`; `m_balks_at_approaching()` so breathers keep their distance.
- **Level drain and lycanthropy, the rest (step 7 built `losexp()`, `AD_DRLI`, `AD_WERE`, the wraith, barrow wight and the six were rows):** the hero turning into her were form (`you_were()`: the per-turn `rn2(80)` roll, unholy water, `polymon()`; `you_unwere()`'s rehumanize; summoning help with `#monster`): done with 7f-d; ~~the Hate_silver line; silver weapons against weres and a lycanthrope hero~~ (m11 step 2); vampires and vampire lords (shapeshifting, 7f); Protection_from_shape_changers (no such ring); thrones' "terrible experience" (no thrones); `SPE_DRAIN_LIFE`, Stormbringer; ~~potions of restore ability and gain level restoring lost levels~~ (m11 step 6); ~~sprigs of wolfsbane~~ (m11 step 2); monsters fleeing a scary square after changing form (`onscary()` exists since m11 step 7; newcham()'s check is not wired); `mon_break_armor()` for a were turning beast (done with 7f-d).
- **Step 8, the rest:** ~~sliming (`AD_SLIM`, green slime), nurse (`AD_HEAL`), mind flayers (`AD_DRIN`)~~ (done); **eggs**: the egg object (joins the food pool: a golden change), `corpseOf` for eggs, eating eggs (a cockatrice egg's delayed stoning), thrown eggs splatting (cockatrice eggs stone what they hit), hatching timers (`can_be_hatched()`, `hatch_egg()`, laying eggs as a polymorphed hero); **incubus/succubus `doseduce()`** (needs monster genders and the armor-removal questions; `AD_SSEX` acts as `AD_SEDU` meanwhile); mind flayers' psychic blast (`domindblast()`/the dochug() blast) and `#monster` mind blast; globs of green slime and eating them; `munslime()` (monsters burning slime off with fire, muse.c); the spell of cure sickness, artifacts and lava that also end sliming; the green-slime look on the countdown's last turn.
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
