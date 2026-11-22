# Kickoff: NetHack TypeScript port, milestone 25

Milestone 25 is **the ROADMAP leftovers a player meets first**: deferred content that changes ordinary play in the first half of the game (the early dungeon, the Gnomish Mines and Minetown, Sokoban, shops, the Oracle, the common items and their identification, and the messages a player sees all the time). Nine steps, one commit each: attribute exercise, the level's sounds, the missing foods and trees, kicking boxes and dungeon features, sinks, gems and the touchstone, the Oracle's consultations, the hero's name in the game, and the level-generation leftovers with the m25 docs. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then the plan (`~/.claude/plans/m25.md`).

**Content first. One small additive core change and possibly a second.** (1) Step 8: `Character.name?: string` (C's `svp.plname`), passed at new game by the app from the device option, kept in the save and the replay header; `SAVE_VERSION` goes from 11 to 12 (older saves are refused, the user's rule: wiped, not migrated). (2) Step 9, only if the user accepts it (plan Q4): a LevelDef either/or content entry (minefill's `percent(50) and "h" or "G"`); otherwise a content fixup draws it. Everything else is content: new state lives in `modData.nh`.

**Finishing half-done features.** Most of the milestone fills in branches whose callers already exist: about 260 `exercise()` calls whose sites carry "no exercise" comments, the kick branches that fall through to "kicking the floor", sinks that are scenery, the touchstone a ring shopkeeper carries with no use, the Oracle's #chat that takes the gold and says nothing, the tree fruit that `mdig.ts` leaves out for want of fruit objects, and the welcome that says "Hello, welcome to NetHack!" with no name.

## Scope

1. **Attribute exercise:** `exercise()`, `exerper()`'s hunger, encumbrance and status checks, `exerchk()` with its check every `rn1(200, 800)` turns from turn 600 and its six messages ("You must have been exercising diligently."), then the call sites across the port, most frequent first (combat, searching, prayer, potions, fountains, eating, reading, spells, traps, locks, throwing, music, polymorph) (ref: src/attrib.c exercise(), exerper(), exerchk(); src/allmain.c moveloop_core(), u_init's next_attrib_check; the exercise() lines of every src file the port has ported).
2. **The level's sounds:** `dosounds()` once a turn: fountains, sinks, the court, swamp, vault (the guard's footsteps, counting gold), beehive, morgue, barracks, zoo, shop (and `noisy_shop()`), temple and the Oracle, with their hallucinatory lines; the `has_*` flags and fountain and sink counts the rolls depend on (ref: src/sounds.c dosounds() and its *_mon_sound() helpers; src/hack.c check_special_room(); src/vault.c gd_sound(); src/shk.c tended_shop(), noisy_shop()).
3. **The missing foods and trees:** the pear, banana, melon, slime mold, candy bar, kelp frond and eucalyptus leaf rows with their eating effects (the banana and melon while hallucinating, the eucalyptus leaf curing sickness and as a whistle, the candy bar's wrapper), kicking a tree (fruit, killer bees, "a low buzzing") and the fruit of a dug or chopped tree (ref: include/objects.h FOOD(); src/eat.c fpostfx(), fprefx(); src/apply.c use_whistle(); src/read.c candy wrapper; src/dokick.c kick_nondoor() IS_TREE; src/mkobj.c rnd_treefruit_at(); src/dig.c).
4. **Kicking boxes and dungeon features:** a kicked box's "THUD!", busted lock ("WHAMM!!"), slammed lid and broken contents (`container_impact_dmg()`, also for dropped and thrown boxes), fountains, graves (the toppled headstone, `disturb_grave()`), iron bars and sinks (the pipes, the black pudding, the dish washer, `sink_backs_up()`'s ring) (ref: src/dokick.c really_kick_object(), container_impact_dmg(), kick_nondoor(); src/fountain.c sink_backs_up()).
5. **Sinks:** quaffing from a sink (`drinksink()`'s twenty outcomes), dipping into one (`dipsink()`, `wash_hands()`), rings dropped down the drain (`dosinkring()`: the identifying lines, the ring that comes back, the sink that teleports or polymorphs), levitating onto a sink (`dosinkfall()`), the #quaff and #dip offers (ref: src/fountain.c drinksink(), dipsink(), wash_hands(), breaksink(); src/do.c dosinkring(), polymorph_sink(), teleport_sink(); src/hack.c dosinkfall(); src/potion.c dodrink(), dodip()).
6. **Gems and the touchstone:** `randomize_gem_colors()` at new game, rubbing on a touchstone (`use_stone()`: gems, glass, metal streaks; the Archeologist's and gnome's identification), shopkeepers buying and selling gems and glass as C (ref: src/o_init.c randomize_gem_colors(); src/apply.c use_stone(); src/shk.c set_cost(), shk_embellish's gem lines, sellobj()).
7. **The Oracle's consultations:** minor and major `doconsult()` for gold, the rumors and the major oracles, experience and `u.uevent.minor_oracle`/`major_oracle` (ref: src/rumors.c doconsult(), outoracle(), outrumor(); dat/oracles.txt).
8. **The hero's name:** `Character.name` in core, "Hello Brunhilde, welcome to NetHack!", the status line's "Brunhilde the Stripling", the shopkeepers' greetings and calls, the vault guard's question, the quest texts' `%p`; the branch staircase description ("staircase down to the Gnomish Mines"); `SAVE_VERSION` 12 (ref: src/allmain.c welcome(); src/botl.c do_statusline1(); src/shk.c u_entered_shop(), plname sites; src/vault.c invault(); src/questpgr.c convert_arg(); src/stairs.c stairs_description()).
9. **Level-generation leftovers:** `make_niches()` (with the trapdoor niche and "Vlad was here"), minefill's either/or monster and its solidfill draw, `induced_align()` for random altars, Sokoban's builds-up `level_difficulty()`; then the m25 docs (ref: src/mklev.c make_niches(), makeniche(); dat/minefill.lua; src/dungeon.c induced_align(); src/dungeon.c level_difficulty()).

## Out of scope

The dungeon overview (`#overview`, mapseen), conducts and achievements, punishment (the ball and chain), gas-cloud regions (the scroll of stinking cloud), monster genders, the bag of tricks, can of grease, grappling hook and ice box, globs, shop credit and loans (`donate_gold()`, `costly_gold()`), game-side options (autopickup), the remaining `#chat` sounds, the timed Detect_monsters, giants and boulders, themed rooms, the engraving map symbol (a mod-contract change), dumplog and bones. They stay in ROADMAP.

## Exit criteria

- Over a long game the hero's Str, Dex, Con and Wis rise and fall by exercise, with C's messages.
- A level with a fountain, a vault or a shop is heard ("You hear bubbling water.", "You hear the footsteps of a guard on patrol.", "You hear someone cursing shoplifters.").
- Kicking a locked chest can bust its lock; kicking a tree drops fruit or brings bees; a ring dropped into a sink names itself by its line; a gray stone rubbed on a touchstone tells gems from glass.
- The Oracle answers for gold; the welcome and the status line carry the hero's name.
- `pnpm check` is green locally and in CI; replays and the golden test are deterministic, with explained golden updates in steps 1, 2, 3, 6 and 9.

## Testing

- Unit tests: `exercise()`'s bounds and the `exerchk()` schedule; the derived level flags; the new food rows against objects.h (converter test); the gem colour draws; the Oracle's prices.
- Scenario tests, outcome-based with pinned monsters and searched seeds: each exerchk message; each sound (a level built with the feature, the roll forced by a searched seed); the box kick's three outcomes; tree fruit and bees; each sink outcome class and every `dosinkring()` line; touchstone rubbing per class; minor and major consultations; the name in the welcome, the status line and a shopkeeper's greeting.
- The soak bot and its invariants stay green (the bot does not quaff from sinks or kick boxes; the golden moves only where listed).
- Phone check uses wizard mode: `wiz:wish` for rings, gems and a touchstone, `#levelchange`, `wiz:levelport` to the Oracle.

## Status

Not started. Branch `m25` off the m24b tip (`5442a02`).
