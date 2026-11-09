# Kickoff: NetHack TypeScript port, milestone 13 (draft)

Milestone 13 is **monster batch 2**: the monsters batch 1 (m10) left out because they need a mechanic of their own, and the higher-difficulty rows that need nothing new. Hiding monsters (piercers dropping from the ceiling, snakes under objects, trappers and lurkers above), mimics posing as objects, doors and furniture ("Wait! That's a giant mimic!") in shops, doorways, Sokoban and Mines' End, unicorns with the unicorn horn and their taste for gems, long worms with tails you can cut, golems and polypiling, figurines you can apply, and about thirty more rows from nagas to giants and liches. Eight steps. Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `DEVIATIONS.md` and `docs/CONVERTER.md` first, then the plan (`~/.claude/plans/m13.md`).

Every new monster and object comes from the converter. Almost everything is content. Core gets three small additive changes: monster memory remembers what was shown (so a mimic's disguise, or a hallucinated monster, is remembered as seen) with an optional `AppearanceDef.marker` for the remembered-unseen `I`; an optional `LevelContent.appearAs` for `des.monster` `appear_as`; and a `'mumble'` monster sound. Hiding uses 7f-b's `PerceptionDef.hides` hook, disguises use `shownAs`, and long worm tails are ordinary content entities linked to their head. There is no save-format change: new state lives in `modData.nh`.

## Scope

1. **Hiding monsters:** `hideunder()` for snakes and spiders (the level object they were made on now hides them), ceiling hiders, piercers dropping on the hero, trappers and lurkers above engulfing from hiding, "Wait! There's a ... hiding under ...!", and searching, attacking, detection and picking up the object revealing them. New rows: rock, iron and glass piercer, trapper, lurker above (ref: src/mon.c hideunder(), maybe_unhide_at(); src/makemon.c makemon(); src/monmove.c m_move(); src/mhitu.c mattacku(); src/hack.c domove(); src/detect.c dosearch0()).
2. **Mimics and their disguises:** `set_mimic_sym()` (objects, doors, furniture, shop stock), the disguise drawn and remembered, `seemimic()`, stumbling onto a mimic and sticking to it, mimic doors, searching, `restrap()`. New rows: small, large and giant mimic (ref: src/makemon.c set_mimic_sym(); src/mon.c seemimic(), restrap(); src/uhitm.c stumble_onto_mimic(); src/lock.c; src/display.c display_monster(), newsym()).
3. **Mimics where NetHack puts them:** shop mimics posing as stock, mimics in place of trapped doors from difficulty 9, `appear_as` in special levels (Sokoban's two boulder mimics, the Mimic of the Mines' four gray stones), cursed object detection showing them (ref: src/shknam.c mkshobj_at(); src/mklev.c dosdoor(); src/sp_lev.c create_monster(); src/detect.c object_detect()).
4. **Unicorns and the unicorn horn:** co-aligned peaceful unicorns, their line avoidance and teleport, the horn from the corpse, the guilt of killing a co-aligned one, applying a unicorn horn, throwing gems to unicorns. New rows: the three unicorns and the unicorn horn (ref: src/apply.c use_unicorn_horn(); src/dothrow.c gem_accept(); src/monmove.c m_move(); src/mon.c mfndpos(), xkilled(), make_corpse()).
5. **Long worms:** tails that follow and grow, cutting a worm in two, tails hitting the hero, teleporting, polymorphing and genociding worms, the worm tooth and the crysknife. New rows: baby long worm, long worm, long worm tail, worm tooth, crysknife (ref: src/worm.c; src/read.c seffect_enchant_weapon()).
6. **Golems:** fixed golem hit points (also for golem forms and drain life), what each golem leaves, fire, lightning, rust and rot on golems, the clay golem's cancellation, stone and flesh golems, polypiling into golems. New rows: the eleven golems (ref: src/makemon.c golemhp(); src/mon.c make_corpse(), golemeffects(); src/zap.c create_polymon(), cancel_monst()).
7. **Figurines:** generated figurines, naming and wishing, applying one to make a familiar, the cursed figurine that transforms on its own, stone to flesh on figurines. New row: figurine (ref: src/apply.c use_figurine(), fig_transform(); src/dog.c make_familiar(); src/timeout.c attach_fig_transform_timeout(); src/mkobj.c mksobj_init()).
8. **The remaining rows:** winter wolf, the nagas and their hatchlings, umber hulk, black pudding, winged gargoyle, ice and rock troll, Olog-hai, titanothere, baluchitherium, mastodon, elf-lord, zruty, xorn, earth elemental, stalker, black light, the giants and the titan, the jabberwocks, lich, demilich and the Nazgul, with the small bits each needs (the stalker's corpse, the black light's explosion, wall-walking, invisible-at-birth) (ref: src/makemon.c makemon(), m_initweap(), m_initinv(); src/eat.c cpostfx()).

## Out of scope

Vampires and vampire lords (shapeshifting), incubi and succubi (seduction needs genders), chameleons and doppelgangers, dragons and baby dragons, the beholder, displacer beast and genetic engineer, master liches and arch-liches, Gehennom-only monsters, angels, Keystone Kops, the never-generated specials (minotaur, skeleton, shade, eels, djinni, ...), uniques and quest monsters, the hero hiding or mimicking as a form, monsters and pets using unicorn horns, globs, the leash, saddle, grappling hook, boomerang and iron chain (golems roll for them and drop nothing), Elbereth, roles and races. The full list with reasons is in the plan.

## Exit criteria

- On a phone with `?wizard=1`, using genesis and wishes:
  - walk onto a hidden snake ("Wait! There's a garter snake hiding under ...!"), get hit by a falling piercer, find a hidden one by searching;
  - bump into a mimic posing as a door or an object, get stuck to it, and see its disguise remembered when you come back;
  - find a mimic in a shop's stock, and the boulder mimics on Sokoban's top level;
  - meet a peaceful co-aligned unicorn that teleports out of line, cure yourself with a unicorn horn, and throw it a gem;
  - cut a long worm's tail in two and turn its tooth into a crysknife;
  - burn a paper golem, cancel a clay golem, turn a stone golem into flesh, and polypile iron into a golem;
  - apply a blessed figurine to get a pet.
- In a normal game the new monsters appear at NetHack's depths and rates, hiders hide and mimics wait in shops and doorways where NetHack puts them.
- Replays and the golden test are deterministic. Every golden change has a verified cause in its commit (expected in step 7 only), and `pnpm check` is green locally and in CI.

## Testing

- The convert test covers every new row.
- Unit tests for hiding and revealing (moving, searching, attacking, telepathy, picking up), each mimic disguise rule and every reveal path, the core memory change, unicorn behaviour and the horn's cures, gem throwing, long worm movement, growth, cutting and removal, each golem's hit points, drops and special damage, polypiling, figurine outcomes and the transform timer, and one test per new mechanic line in step 8. Use searched seeds, never lucky ones.
- Seed-dependent tests moved by new rows or rolls are re-fitted by seed search or pinning, not weakened, and each re-fit is checked with the new rows filtered out.
- The soak bot runs through hidden monsters, mimics (it can get stuck and fight free) and long worms, and keeps its invariants (every worm tail belongs to a live worm, in order).

## Status

(Filled in by the last step.)
