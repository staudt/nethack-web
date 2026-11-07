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

- **Rings:** teleportation, teleport control, polymorph, polymorph control, conflict, levitation, see invisible, invisibility, warning, stealth.
- **Amulets:** change, unchanging, magical breathing.
- **Wands:** wishing, digging, teleportation, polymorph, cancellation, make invisible, undead turning, death, enlightenment; breaking (applying) wands.
- **Tools:** pick-axe and digging, magic lamp (djinni), bag of tricks, horns, musical instruments, #force.
- **Traps:** the other trap types (webs, teleport and level teleporters, magic traps, fire, land mines, rolling boulders, polymorph, anti-magic, statue traps), #untrap, trapped doors and boxes.
- **Item damage:** `passive_obj` on monster gear, fixing erosion.

From 6a (branches, the `LevelDef` format and the Gnomish Mines; done, phone-checked 2026-11-02):

- **Mines monsters:** dwarf lord, dwarf king, bugbear and mind flayer (the `G` and `h` classes pick only from the monsters that exist; the gnome king and gnomish wizard came with 6b1).
- **Branch stairs description:** "staircase down to the Gnomish Mines" once used (`stairs_description()`); up and portal branches.
- **Either/or content entries** in `LevelDef` (minefill's `percent(50) and "h" or "G"`), and a first solidfill pass before a cave init.
- **Hero races:** the Mines' inhabitants peaceful to gnome and dwarf heroes.

From 6b1 (Minetown: special levels in a dungeon, map blocks, rooms and the Watch; done, phone check pending):

- **Minetown's missing inhabitants:** Bazaar Town's monkeys and nymph, Grotto's gnome king statue; Watch reactions to digging through town walls.
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

- **Score list rule:** a future high-score list must skip every game whose mod list includes `wiz` (ref: src/end.c really_done(): topten() only if `!wizard && !discover`).
- **Wishing for terrain and traps** (`fountain`, `trap door`), artifacts, named objects and the other `readobjnam()` words listed in `DEVIATIONS.md`; the wish "help" text and history.
- **Genesis extras:** a command count, "saddled", "invisible", "hidden", genders, class descriptions ("dragon"), special-monster forcing.
- **Other `#wiz*` commands:** #wizpolymorph, #wizdetect, #wizintrinsic, #wizsmell, #wizkill and the rest; lowering the level with #levelchange (needs `losexp()`); explore mode (`-X`); debug panels in the UI.

From 7a (spellcasting: Pw, `Z`, the eight spells, monster casters; done, phone check pending):

- **Spells as defs** (with the mod platform): spell effects are a content table (`SPELL_INFO` and the switch in `cast.ts`), as shop types are; a `defineSpell` def kind or an `ObjectDef.cast` hook would let a mod add a spell. Monster spells (`MCAST_DATA` in `mcastu.ts`) likewise.
- **The other spellbooks:** the 30-odd level 1-7 books, among them the Valkyrie's special spell cone of cold (`ROLE_SPELL` already names it), with their effects (digging, magic missile, fireball, teleport, ...).
- **Detect monsters at Skilled:** the timed Detect_monsters property and its redraw.
- **Monster spells left out:** disappear (needs monster invisibility), destroy armor, summon nasties, clone wizard and touch of death (counted as useless today); `buzzmu()` ray casters (AD_FIRE/AD_COLD/AD_MAGM `AT_MAGC`); monsters remembering her resistances (`M_SEEN_*`, `m_seenres()`); cancellation (`mcan`); Half_spell_damage sources.
- **Energy sources and drains:** the Amulet's energy drain, energy-draining attacks (AD_DREN), the potion of gain energy, Energy_regeneration and magical breathing; level drain with `u.ueninc[]` (and lowering the level with `#levelchange`).
- **Spell menu:** reordering and sorting known spells (`+`), attribute exercise from casting.
- **Known bug:** C's `zhitm()` skips the `resist()` halving for monster-spell rays (`type >= 0`), but the port rolls it at wand level for `by: 'spell'` rays (the god's lightning from an angry temple); no 7a code reaches it.

From 7c (Mines' End, fountains, Orcish Town):

- **Touchstone:** rubbing gems and metal on it (`use_stone()`), the Archeologist's and gnome's identification of gems, and the shopkeepers' and unicorns' reactions to gems (gem buying and identification by a shopkeeper's offer, throwing gems to unicorns); kicking gems.
- **Gem colours:** `randomize_gem_colors()` (turquoise and aquamarine blue or green, fluorite violet, blue, white or green per game); its draws move the game stream.
- **Mimics:** their disguises ("Wait! That's a mimic!", sticking), then the four mimics of the Mimic of the Mines posing as gray stones.
- **Vampires** (level drain, shapeshifting) for the Catacombs' two `V`, and the level teleporters on its luckstone and flint spots.
- **The water nymph and theft:** stealing and teleporting away, for fountains (C's "no nymph" outcome stands in) and nymphs elsewhere.
- **Pools:** gushing fountains making pools, then moats and water in special levels.
- **Potions:** dilution by water damage and fountains, and `#dip` into potions (mixing).
- **Orcish Town extras:** the boulders (after 7b's boulder object), the teleport region, the gang's names (and christening the town's orcs) and the booty items that wait for orcs below.
- **LevelDef fixup hook:** content's `SpLevFixup` table (shuffled spots, BUC, maze walks, iron bars, migrating orcs) exposed to mods as a LevelDef hook.
