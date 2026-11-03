# Kickoff: NetHack TypeScript port, milestone 6b (draft)

Milestone 6b adds Minetown to the Gnomish Mines. It comes in three parts, done in this order: **6b1** the town itself (hand-drawn maps, rooms, doors, fountains, altars, the Watch), **6b2** the temple (altars, the aligned priest, praying on an altar) and **6b3** the shops (shopkeepers, stock, buying and selling). It builds on 6a (`docs/kickoff-m6a.md`) and wizard mode (`docs/kickoff-wiz.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan for each part before writing any code.

## Scope

### 6b1: town structure

1. **Special levels in a dungeon:** a `DungeonDef` lists its fixed special levels, each with a level range, a chance, a set of variant `LevelDef`s and flags (`town`). Where each one sits is rolled with the rest of the layout at new game and kept in `GameState`; which variant is used is rolled when the level is first made (ref: dat/dungeon.lua `levels = { { name = "minetn", base = 3, range = 2, nlevels = 7, flags = "town" } }`; src/dungeon.c init_level(), possible_places(), pick_level(), place_level(); src/mkmaze.c makemaz() `rnd(sp->rndlevs)`).
2. **`LevelDef` additions**, all plain data, validated at `loadMods` and documented in `ARCHITECTURE.md` (ref: src/sp_lev.c, src/nhlua.c splev_chr2typ()):
    - A hand-drawn map block (`des.map`): rows of map characters, placed by `halign`/`valign` or at `x`,`y`, with `x` as "keep what is under it". A map fits any level at least as big as the block. Later coordinates are relative to the block (ref: lspo_map()).
    - Rooms (`des.room`): placed on NetHack's 5x5 grid with alignment, or at random; subrooms; a room type (`temple`, the shop kinds) with a `chance`; lighting; doors on a wall; things inside the room; `random_corridors` to join them (ref: lspo_room(), create_room(), create_subroom(), create_door(), lspo_random_corridors()).
    - Regions (`des.region`): lit or unlit areas, and typed rooms over map areas (ref: lspo_region(), light_region()).
    - Doors at a spot with a state: `open`, `closed`, `locked`, `nodoor`, `broken` or `random` (ref: lspo_door(), sel_set_door(), rnddoor()).
    - Features: fountains, sinks and trees; altars with an alignment (`lawful`/`neutral`/`chaotic`/`noalign`/random) as terrain. Altar *behaviour* is 6b2 (ref: lspo_feature(), lspo_altar()).
    - Stairs at a fixed spot or in a level region with an exclusion area (ref: lspo_stair(), lspo_levregion(), src/mkmaze.c place_lregion()).
    - Contents at a spot or inside a room, and monsters with `peaceful` (ref: lspo_monster() `peaceful`, create_monster()).
    - Random terrain edits (Grotto Town's `percent()` walls) and the `inaccessibles` flag (ref: lspo_terrain(), ensure_way_out()).
3. **Minetown variants:** the ones whose features we can express: Town Square (`minetn-2`), Alley Town (`minetn-3`), College Town (`minetn-4`), Grotto Town (`minetn-5`), Bustling Town (`minetn-6`) and Bazaar Town (`minetn-7`). In NetHack 5.0 `minetn-1` is Orcish Town (Frontier Town after the orcs came), which is out of scope. Shop and temple rooms are typed but empty until 6b2/6b3.
4. **The Watch:** watchmen and the watch captain, peaceful. They get angry when the hero kicks a door in town (a warning first, then an arrest), picks a lock they can see (warning, then arrest), or attacks a peaceful monster in their sight; angering one angers them all (ref: src/mon.c angry_guards(), peacefuls_respond(); src/monmove.c watch_on_duty(); src/dokick.c watchman_door_damage(), watchman_thief_arrest(); src/hack.c in_town()).
5. **New monsters** that Minetown names: watchman, watch captain, gnome king, gnomish wizard and goblin (see plan for the ones left out).

### 6b2: temple

- Altars: dropping an object on an altar shows whether it is blessed or cursed ("There is a black flash"), looking at one tells its alignment (ref: src/do.c doaltarobj(); src/invent.c dfeature_at(); src/pray.c altar_wrath() subset).
- The aligned priest of the temple, made with the temple (ref: src/priest.c priestini()), who stays in the temple and is peaceful unless angered (ref: priest.c pri_move(), ghod_hitsu()).
- Temple entry messages: "Pilgrim, you enter a sacred place!", the forbidding feeling or sense of peace (ref: src/priest.c intemple()).
- `#chat` (a new action) and donations: the gold amounts and their effects, including buying protection (ref: src/sounds.c dotalk(), src/priest.c priest_talk()).
- Praying on an altar: a cross-aligned altar, and water prayer (holy and unholy water) (ref: src/pray.c dopray(), water_prayer()).

### 6b3: shops

- Shopkeepers: one per shop room, by the door, with a name from the shop type's list (ref: src/shknam.c shkinit(), shtypes[]).
- Stock by shop type: general, tool, food, lighting (Izchak), wand and book shops as Minetown makes them (ref: src/shknam.c stock_room(), mkshobj_at()).
- Prices: base cost, Charisma, the sucker markup, random surcharges (ref: src/shk.c get_cost(), set_cost()).
- Buying: picking up adds to the bill, `#pay` pays it; selling: dropping an item gets an offer (ref: src/shk.c addtobill(), dopay(), sellobj()).
- Entering and leaving: the greeting, "Will you please leave your pick-axe outside?", leaving with unpaid items angers the shopkeeper (ref: src/shk.c u_entered_shop(), u_left_shop(), rile_shk(), hot_pursuit()).
- An angry shopkeeper attacks and can be paid off (ref: src/shk.c make_happy_shk(), dopay() angry branch).

## Out of scope

Orcish Town; Mines' End (the bottom Mines level stays a filler without down stairs); drinking from and dipping into fountains (see plan); random fountains, sinks and altars in ordinary rooms; sacrifice (`#offer`), converting altars, crowning; Keystone Kops; shop damage repair, credit for gold dropped, shoplifting by pets; hero races (gnomes are not peaceful to a gnome hero); other special levels and branches (Sokoban, Oracle, Big Room).

## Exit criteria

- **6b1:** I can find Minetown on Mines level 3 or 4 in a normal game; on a phone, with `?wizard=1`, I can levelport there in a few new games, see different variants, and the Watch is peaceful and gets angry when I kick a door in town. A mod can add a town by writing `LevelDef`s and a `DungeonDef.special` entry only.
- **6b2:** On a phone I can drop items on the Minetown altar to learn their curse status, meet the priest, donate gold and pray on the altar.
- **6b3:** On a phone I can buy and sell in each Minetown shop, and leaving without paying angers the shopkeeper.
- For each part: replays and the golden test are deterministic (with an explained golden update when Minetown first appears in the layout), and `pnpm check` is green locally and in CI.

## Testing

- Unit tests: special-level placement (always inside its range, never on a level with a branch end, for many seeds); map block placement at 80x21 and at larger sizes, and a clear error for a map that does not fit; door states; room grid placement; region lighting; `LevelDef` validation errors for every new field.
- Scenario tests: each shipped variant builds; its stairs are reachable from each other; its temple and shop rooms are typed; the Watch is peaceful and turns hostile when the hero kicks a door in town. 6b2 and 6b3 add BUC on an altar, a donation, buying, selling and leaving without paying.
- The soak bot visits Minetown (from the branch-start mod, with levelport). New invariant: every level built from a `LevelDef` with a map block or rooms has mutually reachable stairs.
- Phone check uses wizard mode's levelport (`?wizard=1`, `wiz:levelport` to the Mines, level 3 or 4).
