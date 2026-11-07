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

- **Rings:** teleport control, polymorph, polymorph control, see invisible, invisibility (teleportation, conflict, levitation, warning and stealth came with 7d).
- **Amulets:** change, unchanging (magical breathing came with 7d).
- **Wands:** polymorph, make invisible; breaking (applying) wands (wishing, digging, teleportation, cancellation, undead turning, death and enlightenment came with 7d).
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

- **7e (content only), steps 1-5 done (branch `m7e`):** the pick-axe and mattock (`use_pick_axe()`, the `dig()` occupation, "Dig"/"Dig down" offers, the Watch's warnings, shopkeepers refusing pick-axes), dwarves digging (`mdig_tunnel()`), pits from inside a pit and conjoined pits; rolling boulder traps (launch spots, `launch_obj()`, Sokoban's spots); trapped boxes and doors (`chest_trap()`, `b_trapped()`), `#force`; land mines with `scatter()` (kicked coins scatter, boulders on land mines). Still to do (7e rest):
  - **`#untrap`:** floor traps (arrow and dart traps give up their ammunition, bear traps and land mines become objects, squeaky boards need oil), helping monsters and pets out of pits and bear traps, boxes and doors (`dountrap()`, `untrap_prob()`, `cnv_trap_obj()`, `help_monster_out()`, `untrap_box()`). The land mine object's id should be `nh:land_mine` (the trap id is `nh:landmine`).
  - **Breaking wands** (`do_break_wand()`) with `explode()`, and cancellation beams or digging down blowing up magical traps (`maybe_explode_trap()`).
  - **Shop damage:** `pay_for_damage()`, `add_damage()`/repairs, `shopdig()`. Until then hostile Minetown dwarves can dig through shop walls freely (and the wand of digging still does).
  - **Webs:** need the spider monsters (a roster change that moves the golden).
- **7f (needs core contract changes, ask the user):** a `position` Prompt kind (the UI's getpos cursor already exists) for teleport control (ring of teleport control, the blessed scroll, controlled level teleport) and later jumping/polearms; invisibility (wand of make invisible, ring of invisibility, ring/potion of see invisible effects, invisible monsters needing a PerceptionDef hook that hides a monster on a visible square, the remembered-invisible 'I', the magic trap's invisibility toggle); polymorph (hero polyself with forms and attacks, monster newcham(), object poly_obj()/polypiling, polymorph traps, rings of polymorph and polymorph control, amulets of unchanging and of change, which needs hero gender in messages); statues and statue traps.
- **Also later:** amulets of guarding and flying (5.0 additions; flying shares levitation's checks), potions of levitation and invisibility, magic portals, vault teleporters and niches (`make_niches()`, `makevtele()`), monsters using wands/scrolls/rings (muse.c); deafness (the magic trap's roar), level drain (`losexp()`: the tower of flame, `#levelchange`), fire traps in Gehennom (`dofiretrap()` exists); a cursed spellbook's teleport (`cursed_book()` could call `tele()`).

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
