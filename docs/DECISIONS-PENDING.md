# Decisions pending review

Design decisions the unattended loop (`docs/RUNBOOK.md`) made or parked without the user. **Taken** ones are already built on and can still be reversed; **parked** ones blocked a milestone until the user answers. Remove an entry once reviewed.

## Taken

- **6b2 donations, cancel costs you** (2026-11-03): cancelling the donation amount counts as offering 0, as in NetHack ("You refuse.", -1 alignment if coaligned, a turn passes). Small change in `packages/content/src/chat.ts` if it should be free.
- **m7a Pw and spell state in content modData** (2026-11-03): `modData.nh.pw` and `modData.nh.uspell`, no core component, no save version bump (the 5b+ pattern). Cheap to move into a core component later.
- **m7a monster spell subset** (2026-11-03): all ten clerical spells plus the mage spells psi bolt, cure self, haste self, stun you, weaken you, curse items, aggravation. Disappear, destroy armor, summon nasties, clone wizard and touch of death count as useless (never chosen); our casters never reach them.
- **m7a spells as a content table** (2026-11-03): `SPELL_INFO` plus a switch in cast.ts, not an `ObjectDef.cast` hook; ROADMAP note for the mod platform.
- **m7a wizard helpers** (2026-11-03): `#wizcast` and a raise-only `#wizlevelchange` in step 7, so the phone check can reach casting with a Valkyrie (Pw 2 at start).
- **m7a dismissed direction prompt** (2026-11-03): "The magical energy is released!" and the spell is cast at the hero herself (the port keeps no last direction as C does).
- **m7c level fixups in content** (2026-11-04): map/object details the LevelDef format can't express go in a before/after-fill fixup table keyed by LevelDef id (like C's `fixup_special()`), not new LevelDef fields.
- **m7c `wallifyLevel` core export** (2026-11-04): the one core public-API addition: the existing wall-joining logic exported as a function, because content's Catacombs maze and broken walls run after core's final wall pass. Fallback: a ~100-line copy in content.
- **m7c Mimic of the Mines without mimics** (2026-11-04): the four mimics are left out; the real gems stay.
- **m7c Catacombs undead subset** (2026-11-04): four zombies, four mummies and the ettin mummy; no vampires (the `V` lines are dropped, else they'd become random monsters), level teleporters or zombification.
- **m7c Orcish Town iron bars and boulders** (2026-11-04): `nh:iron_bars` as a content terrain; the 10-19 boulders skipped until 7b (parked) exists.
- **m7c orcs who left** (2026-11-04): only the migrating gang with its gold, gems and rings; no gang names, no booty items.
- **m7c fountain monsters** (2026-11-04): water moccasin and water demon (with the wish) added; the water nymph uses C's "no nymph" outcome.
- **m7c water damage** (2026-11-04): scrolls and spellbooks blank, items rust; no potion dilution.
- **m7c gems in the Mines** (2026-11-04): every gem allowed there, as C's level numbering does.
- **m7c fountains in ordinary rooms** (2026-11-04): rolled now (golden change); sinks, altars and graves stay unrolled.
- **m7c fountain and Luck state** (2026-11-04): fountain state in `modData.nh.fountains`, no save bump; the luckstone bonus worked out from inventory, not stored.

- **m7d all new object defs in step 1** (2026-11-07): the 8 wands, 5 rings, magical breathing and the scroll of teleportation are added at once (one random-stream shift); until its step, a new wand zaps with no effect and a new ring only sets its property.
- **m7d level flags in a content table** (2026-11-07): noteleport, hardfloor, maze and non-diggable areas keyed by LevelDef id, worked out from `Level.def`; no LevelDef/Level fields, nothing saved.
- **m7d no teleport control** (2026-11-07): the ring of teleport control is left out and a blessed scroll of teleportation teleports at random (DEVIATIONS) until a pick-a-position prompt exists (a 7f question).
- **m7d polymorph, invisibility and see invisible later** (2026-11-07): hero/monster/object polymorph, polytraps, the amulets of change and unchanging, invisibility and see invisible go to a later milestone (7f) because they need core perception/prompt contracts.
- **m7d level teleport depth cap** (2026-11-07): a random level teleport in the main dungeon goes no deeper than DL25, the cap holes use.
- **m7d up/down zaps** (2026-11-07): `<`/`>` (and the pad's extra buttons) pick up/down in the zap and spell direction prompts, added with digging.
- **m7d `wiz:wish` makes traps** (2026-11-07): wishing for a trap name in wizard mode makes it at her feet, as C does.
- **m7d `dofiretrap()` without fire traps** (2026-11-07): ported for the magic trap; no fire trap def since C only makes them in Gehennom.
- **m7d warning digits** (2026-11-07): C's warning digits and colours are kept, though warning `0` looks like the boulder `0`.
- **m7d wand of stasis** (2026-11-07): included (in the vendored objects.h, not on the old ROADMAP list); its only effect is in the teleport code.
- **m7d cancellation, stasis and dug-trap state in content** (2026-11-07): `mcan`, stasis and dug-trap ownership in `modData.nh` and `Trap.data`, no save-version bump.

- **m8 end-of-game questions in the UI** (2026-11-07): an optional `ask?` field on the core `'list'` event; the UI asks "Do you want your possessions identified?" etc. (not core prompts, so not in the replay). Additive core type change.
- **m8 identify at game over in state** (2026-11-07): content's `beforeGameOver` hook at priority -1000 identifies her inventory, as C does.
- **m8 which games are recorded** (2026-11-07): every finished game without `wiz`, including `?seed=` games and quits.
- **m8 score in content** (2026-11-07): `u.urexp` and kill counts in `modData.nh`, one golden update in step 3.
- **m8 `#quit`** (2026-11-07): `#quit` plus `GameOver.kind 'quit'` (additive core type).
- **m8 title screen** (2026-11-07): only when there is no save to resume.
- **m8 player name on the device only** (2026-11-07): not in `GameState`.
- **m8 help text** (2026-11-07): from `help.cmd.*` messages and `action.<id>` labels, no ClientApi change.
- **m8 deferred** (2026-11-07): conduct, dungeon overview, genocide lists and game-side options (autopickup) go to ROADMAP.
- **m7e trapped-door spots** (2026-11-07): a transient optional `Level.trappedDoorSpots?: Pos[]` from core levelgen, read and deleted by content on the level's first build (same pattern as the approved `boulderSpots`); never saved. **Approved by the user 2026-11-07** (tested trapped doors on the phone).
- **m7e trapped boxes** (2026-11-07): in content state `modData.nh.otrapped`, not a core item field (as `mcan`).
- **m7e explosions on screen** (2026-11-07): the existing `'ray'` event with `kind: 'explosion'` and cell offsets; no new core event.
- **m7e webs deferred** (2026-11-07): they need giant/cave spiders, which shift every monster roll.
- **m7e shop damage last** (2026-11-07): step 8, only if budget remains, after breaking wands.
- **m7e dig offers** (2026-11-07): "Dig" / "Dig down" offers while carrying a pick, besides `#apply`.
- **m7e breaking wands** (2026-11-07): its own "Break" offer after a yes/no question, not folded into Apply.
- **m7e golden** (2026-11-07): explained golden updates from new offers are accepted rather than filtering offers out of the soak bot.

- **m9 taken defaults** (2026-11-07, all cheap, planner's recommendations, faithful to NetHack 3.7):
  1. One function per damage type in the 3.7 shape (`adtyping.ts`), existing cases moved in step 1.
  2. About 22 real vanilla monster rows through the converter, not test-only defs.
  3. A minimal `nh:statue` object for stoned monsters (holds their inventory); 7f-c adds display, generation, statue traps.
  4. Engulfing without a core change: engulfer on the hero's cell, map hidden via the blindness hook, an `engulfed` status the UI draws as the swallow box.
  5. Hero lycanthropy without transforming; the per-turn change roll waits for 7f.
  6. Sliming deferred (m9 step 8 or 7f).
  7. Incubus/succubus seduction acts as item theft until monsters have genders. **Superseded by m18 step 5** (m18 plan Q7): `doseduce()` is ported whole with SYSOPT_SEDUCE on, and the amorous demon has a gender.
  8. No real-time clock (night, full moon): gremlins never curse; core stays deterministic.
  9. Cockatrice eggs deferred (m9 step 8 or m10).
  10. Level drain records HP/energy gained per level from m9 on, average-gain fallback for older saves.
  11. Stoning before drain and lycanthropy (7f depends on it).
  12. Monster blindness in content state.
  13. A sickness type flag (food poisoning vs illness).

- **m10 taken defaults** (2026-11-07, all cheap, planner's recommendations, faithful to NetHack 3.7):
  1. Add the missing `MonsterSound` names (shriek, cuss, sqawk, neigh, trumpet, imitate, burble) to core in step 1 (additive).
  2. Snakes and spiders made with a level get C's random object but don't hide yet (hiding needs 7f); DEVIATIONS row.
  3. Mimics, piercers, black light and stalker wait for 7f.
  4. Unicorns deferred to a "unicorns and the unicorn horn" milestone.
  5. Human, elf, giant and ettin rows added as corpse targets for zombies and mummies.
  6. Port monster HP regeneration (missing today) in step 4; moves the golden.
  7. No globs for gray ooze and brown pudding yet; DEVIATIONS row.
  8. Tengu corpses give a real teleport-control intrinsic that does nothing until 7f, keeping C's draws.
  9. Purple worms attack shriekers only if monster-vs-monster targeting exists; otherwise DEVIATIONS.
  10. Batches: 1 early animals/humanoids, 2 spiders and webs, 3 blobs/jellies/vortices/spheres/elementals, 4 undead/imps/regeneration/teleporters, 5 armed humanoids/trolls/eaters; cut 5 first, then step 3's elementals.
  11. Port the dog/cat eating penalty with cannibalism in step 4.

## Approved

- **m7b boulders and Sokoban: four core contract questions** (2026-11-04, approved by the user 2026-11-06: all four recommendations taken). The plan (`~/.claude/plans/m7b-sokoban.md`, `docs/kickoff-m7b.md`, 8 steps: 7b1 boulders/pits/scroll of earth, 7b2 Oracle + Sokoban) needs these core changes, each marked costly to undo by the planner:
  1. Boulder core contract: a `'rock'` object class, `ObjectDef.boulder?: true` (blocks sight, shown on top of a pile), and an optional blocked-cell set for `computeVisible`.
  2. Dungeon contract for chained up-branches: `DungeonEntryDef.chain`/`dir`, `DungeonDef.entry`, layout `entry` and `branches[].dir`, `LevelDef.stairs.branch`. All optional, no save-version bump.
  3. Sokoban rules flag: `LevelDef.flags.sokoban/premapped` plus a live `Level.sokoban?: true` that content clears when the level is solved (no noteleport/hardfloor flags yet).
  4. Corridor boulders from core levelgen: a transient `Level.boulderSpots?: Pos[]` that content turns into boulders on level creation and then deletes (alternatives: a general request list, or keep skipping C's `rn2(50)` corridor boulder roll).
  Also from the planner: Sokoban's entrance is on the level below the Oracle (not above), so a minimal Oracle level comes with it.

## Approved by the user (m8)

- **m8 high-score storage format** (2026-11-07): the user approved the planner's recommendation as written. localStorage key `nh.topten` holding `{format:'nh-ts-topten', version:1, entries}`, top 100, each entry the rendered English line plus seed, date and app version. Unblocks m8 step 4.
  - Entry shape (step 4, fdeec33): each entry stores the end's parts as rendered (the `EndSummary` fields) plus seed, date and app version; `entryText()` joins them for display. **Kept by the user 2026-11-07.**

## Approved by the user (7f)

- **7f core contracts** (2026-11-07, **approved by the user 2026-11-08: D1, D3, D5 and D6 as recommended**). Plan: `~/.claude/plans/m7f.md` (summary at the top; ~16 steps, ~4.8M).
  - **D1 position prompt:** new `Prompt.kind: 'position'` (optional `start`, `valid`), answered `{x, y}` or null; UI reuses the getpos cursor, on a phone tap moves and a second tap picks. In replays, UI hosts and the soak bot.
  - **D3 remembered `I`:** a `monsterMemory` entry that is not a MonsterDef id becomes a marker; kept on visible cells, so `ViewCell.m` may appear on visible cells. In saves; renderer meaning changes.
  - **D5 polymorphed hero:** the hero keeps the role def; the form lives in content (`modData.nh.upoly`), no `player.form` in core. In saves.
  - **D6 hero HP while polymorphed:** the form's HP goes into `c.hp`, her own is parked in `upoly`, so damage paths stay as they are. In saves.
  - Cheap ones (D2, D4, D7-D11) and seven small open questions (jumping, cloak of invisibility, centaurs, stone-to-flesh meat, statue colour, polymorph scope cuts, two-run split): take the plan's recommendations, faithful to NetHack (user guidance 2026-11-07), unless the user says otherwise.

## Taken (m11 objects batch, 2026-11-08)

The planner marked all ten questions cheap to change later; the loop took each recommendation (`~/.claude/plans/m11.md`, Open questions):

1. The 8-step subset; if the budget runs short, drop step 4 (armor II) first, then chain lightning and the helm of opposite alignment.
2. Peak attributes (AMAX) in `modData.nh.amax`, not a core field.
3. Genocide state in `modData.nh.genocided` (sorted ids), checked in content's makemon; mods' monsters genocidable through G_GENO; no extinction.
4. Blessed levitation ended at will: `modData.nh.levAtWill` and a check on `>`.
5. A minimal `#sit` in step 5 (a "Sit" self offer: swallowed, levitating, traps, floor, laying eggs); thrones come with m12.
6. Real polearms and weapons replace the monster-gear stand-ins; the fallbacks stay.
7. Lances without jousting (no steeds).
8. Blessed monster detection acts as uncursed until the timed Detect_monsters property exists.
9. The golden moves in every step, each verified by filtering the step's defs; the bot seed is re-picked if needed.
10. Death by genocide: `'genocided'` in content's `How`; core's `GameOver.kind` stays `'died'` (no score or save format change).

## Taken (m12 special rooms, 2026-11-09)

The planner marked all thirteen questions cheap to change later; the loop took each recommendation (`~/.claude/plans/m12.md`, Open questions):

1. The 7-step cut; if the budget runs short, drop steps 6-7 (vaults and the guard) together first, then step 4's wall-walking.
2. Vaults placed by core's level generator, handed to content through two temporary `Level` fields (consumed and deleted, never saved), like `boulderSpots`. Additive core change, explained in `ARCHITECTURE.md` by step 6.
3. The vault guard's question as a text prompt raised at end of turn; if the engine misbehaves, the step stops and reports instead of changing core.
4. `mk_tt_object()` without a high-score file or player monsters: the roll is drawn, an unnamed human corpse or statue is made.
5. Morgue graves: the roll is drawn, nothing is made; ordinary-room graves are not rolled.
6. Wall-walking for every monster flagged for it (ghosts now, xorns later), in step 4.
7. Wizard aids: 3.7's terrain wish plus a `wiz:mkroom` action (not in NetHack; makes each step phone-checkable).
8. Room kind ids `nh:court`, `nh:leprechaun_hall`, `nh:beehive`, `nh:morgue`, `nh:barracks`, `nh:cockatrice_nest`, `nh:anthole`, `nh:swamp`, `nh:vault`.
9. The whole `makelevel()` room chain in step 1 (unbuilt kinds draw their roll and make nothing), so later steps don't shift deep-level streams.
10. No Fort Ludios portal (no roll) and no "ad aerarium" engraving.
11. A looted throne as a per-cell flag in `modData`, like the fountain flags.
12. The altar and sink rolls in ordinary rooms added in step 5 (moves the golden once).
13. No wizard-mode branches in content (the wizard-only throne prompts and `pick_room()`'s shortcut are skipped).

## Taken (m13 monster batch 2, 2026-11-09)

The planner marked all fourteen questions cheap to change later; the loop took each recommendation (`~/.claude/plans/m13.md`, Open questions):

1. The 8-step cut (leaving out vampires, incubi, shapeshifters, dragons, beholder, displacer beast, genetic engineer, master/arch-lich, Gehennom rows, angels, Kops, never-generated specials, the hero hiding or mimicking as a form, golem drop objects); if the budget runs short drop step 7 (figurines) first, then step 5 (long worms), then step 6's polypiling.
2. Hiding through the existing perception `hides` hook plus a content "undetected" flag; no core change.
3. Mimic disguises through `shownAs`, with an additive core fix: monster memory records what was shown, and an optional `marker` flag on appearances for the remembered `I` (no save-format change; also keeps hallucinated monsters from being remembered as their true kind). The position prompt's monster list still includes a disguised mimic (logged deviation).
4. Long worm tails as content entities with a tail-to-worm lookup; no core multi-cell monsters.
5. `LevelContent.appearAs` as an additive core field, like `montype`/`historic`.
6. Golem drops the port has no object for (leash, saddle, grappling hook, boomerang, iron chain): the rolls are drawn, nothing is made.
7. Figurines at their real probability 25; the golden change is accepted (verified with prob 0).
8. Door mimics rolled in content's trapped-door hook (draws later in the level stream, difficulty 9+).
9. `'mumble'` added to core `MonsterSound`.
10. Vampires and minor demons stay out (`morguemon()`'s branches keep finding nothing).
11. `set_mimic_sym()` makes and removes a throwaway object so the random draws match.
12. Snakes and spiders made with a level object hide under it.
13. A display-only grave appearance for grave mimics (no grave terrain).
14. Master lich and arch-lich left out; lich, demilich and the Nazgul come in.

## Taken (m14 monster item use, 2026-11-09)

The planner marked all ten questions cheap to change later; the loop took each recommendation (`~/.claude/plans/m14.md`, Open questions):

1. The port subset: horns, camera, tins, potion of oil, globs, ladders, the potion ghost and djinni, Ki-rin, Pestilence, Vlad and the Wizard's special cases, and monsters carrying the Amulet stay out; the bag stays in. Drop order if the budget runs short: step 6's life saving, step 5's bag and bullwhip, step 4's vapors from boiled and forced potions.
2. Item acquisition (`rnd_*_item()`) last, in step 7, so the golden moves there (and maybe in step 1).
3. Monster choices are not saved; three new optional `modData` tables (`mwandexp`, `mseenres`, `migrVia`); no save-format change.
4. `m_seenres()`/`monstseesu()` ported in step 3 (monsters stop zapping fire at a fire-resistant hero).
5. Monsters fleeing by stairs arrive on the matching stairs; DL1's up stairs remove them for good.
6. The `find_offensive()` hook is a `mattacku()` wrapper in `monmove.ts` (import cycle otherwise), same callers as NetHack.
7. The hero's thrown potions now break (closes an existing deviation).
8. Monster life saving in `mondead()` with an audit of callers.
9. Pets use items as NetHack's `dochug()` lets them.
10. No horn or camera rows (ROADMAP).

## Approved by the user (m15 deeper dungeon, 2026-11-15)

The m15 planner (`~/.claude/plans/m15.md`, kickoff `docs/kickoff-m15.md`; 9 steps, ~2.7M) marked seven questions **costly to undo**; the user took every recommendation on 2026-11-15:

1. **Liquids as one core terrain flag**, `TerrainDef.liquid: 'water' | 'lava'`, read by core in four places (no traps on it, no hero arrival on it, objects/traps in it hidden, travel avoids it); everything else (drowning, swimming, monsters in water) in content.
2. **Nine required `LevelTerrain` keys** (pool, moat, water, lava, lavawall, ice, iron bars, drawbridge up/down) with map characters `P } W L Z I C \ F`, and wall-joining that treats water walls, lava walls and iron bars as walls, as C does.
4. **Teleport regions as a core `LevelDef` field** honoured by the engine's random arrival (Medusa, the Castle, a big room, Mines' End's minend-2).
5. **A `replace` terrain edit in `LevelDef`** rather than level fixups.
6. **Core maze inits** (`maze`, `mazegrid`, `walkfrom()` moved into core) and `DungeonDef.mazeFiller` for the mazes below Medusa (first to drop if short; the alternative is ordinary levels there, logged in DEVIATIONS).
7. **The main dungeon gets its bottom**: 25-29 levels with the big room, Medusa and the Castle placed; the rogue level, Quest portal, Fort Ludios, Vlad's Tower and the Planes stay out. Old saves keep their endless dungeon.
8. **Where the Castle's trap doors lead** (taken as the planner wrote it: (a) if steps 4 and 9 have room, else (b)): (a) a Gehennom stub of C's size entered from the Castle by a branch with no stairs on the Castle end (new core `DungeonEntryDef.stairs: 'child'`), plain maze levels, the Valley and the rest in ROADMAP; or (b) they become falling rock traps as on any bottom level today, and the Castle ends the game for now. Planner: (a) if there is room, else (b).

The cheap ones are taken with the approval: drawbridges as content (terrains + `modData`), a "Really step into the water?" yes/no prompt instead of the `m` prefix, no limited underwater view, "Improvise?" for every instrument then the passtune prompt, whole eel and dragon classes plus the 18 dragon scales via the converter, all 13 big rooms, ice in this milestone.

## Taken (m16 engravings and Elbereth, 2026-11-15)

The m16 planner (`~/.claude/plans/m16.md`, kickoff `docs/kickoff-m16.md`; 7 steps, ~2.1M) marked all twelve questions cheap to change later; the loop took each recommendation:

1. Engravings are content state (`modData.nh.engr[levelId][cellIndex]`, owned by `engr.ts`), not a core `Level` field; no save-format or mod-contract change.
2. **For the user to review:** no engraving symbol on the map and no farlook text this milestone (showing it needs a core view channel, which would be costly); engravings are read on arrival and with `:`. Listed in ROADMAP.
3. A new `:` "Look here" self action (dolook()), always offered.
4. Engraving texts are literal strings in the state; the rumors, engrave and epitaph files are copied into content as data; the surrounding sentences are message keys.
5. Random lines: one `rn2(lines)` per pick instead of C's byte seek (both uniform).
6. No magic markers or towels (left to m19 tools).
7. Elbereth follows 5.0 (= 3.7): the hero must stand on it, level-made ones guard objects, the immune kinds, not in Gehennom, attacking from it erases it.
8. `setmangry()` gets C's `viaAttack` argument, every caller checked against C.
9. Engraving with a wand of wishing asks the wish and then goes on, as C (fallback: end the engraving after the wish, DEVIATIONS).
10. Graves are the last, droppable step (no burial, no bell, no digging up).
11. The vault's "ad aerarium" wipe rolls happen after core's level build (DEVIATIONS).
12. No literate conduct, no Wis exercise if the port has none, no re-read on restore.

## Taken (m17 Gehennom, 2026-11-15)

The m17 planner (`~/.claude/plans/m17.md`, kickoff `docs/kickoff-m17.md`; 8 steps, ~2.4M) marked all seventeen questions cheap to change later; the loop took each recommendation:

1. All eleven Gehennom specials are placed in step 1 (dungeon.lua's order) and built as the filler until their own step swaps in the LevelDef; the new-game draws move only in step 1.
2. A new optional core field `SpecialLevelDef.chain` (read only when the layout is rolled) lets the tower levels count from wizard1.
3. A variant is drawn only when a level has two or more variants (the Oracle and the Castle draw one needlessly today); fixed in step 1.
4. The Sanctum is placed but never built; holes, trap doors and level teleports stop above it ("Sorry..."); wizard-mode levelport reaches its stand-in.
5. The vibrating square without the invocation.
6. hellfill built by content over two newly exported core maze builders, not seven filler variants.
7. 5.0's level temperature messages replace the stub's 3.6 "It is hot here.  You smell smoke..." line.
8. The Valley's corpses use 13 player-monster rows (never random, never polymorph forms); human corpses as the fallback if an id clashes.
9. Vampires wait for m18; the scripts' vampires are random monsters until then.
10. Orcus Town's magic marker or lamp (m19) draws its coin and makes nothing; the Book of the Dead arrives in step 8.
11. Covetous monsters without the Amulet or the invocation; no harassment after the Wizard dies.
12. Ladders and magic portals as content terrain and a trap, arriving at a fixed spot through a widened core `goToLevel(to, Pos)`; no core multi-stairs lists.
13. A partial port of the Wizard's Tower boundary rule.
14. Orcus's high altar as content state; shops whose keeper is removed.
15. Shades come with Orcus Town and are dropped with it.
16. The demon court; covetous monsters ignore no-teleport levels.
17. Fire traps among random traps on every special level, as NetHack (may move the golden; verified by a switch).

## Taken (m18 monster batch 3, 2026-11-15)

The m18 planner (`~/.claude/plans/m18.md`, kickoff `docs/kickoff-m18.md`; 7 steps, ~2.45M) marked all fourteen questions cheap to change later; the loop took each recommendation:

1. The cut and drop order: step 7 (Angels and minions), then step 5's four stragglers, then step 5, then step 3. The beholder and the vampire mage are compiled out of 5.0, so neither is ported (ROADMAP corrected).
2. Birth counts and the extinct list live in `modData.nh` with no save version bump; older saves start their counts at zero and keep the old "unique alive or died" test as a fallback.
3. Shapeshifters through a content `cham` table (the true kind), born shifted as C does; no core change.
4. Monster gender is drawn only for the amorous demon (a sparse table), not C's coin flip for every monster, which would move every random stream.
5. The succubus is shown through the existing `shownAs` perception on the one row `nh:incubus`.
6. `adj_erinys()` (erinyes strengthened by alignment abuse) is left out: it would need per-monster def overrides in core.
7. **For the user to note:** `doseduce()` is ported whole with seduction on (5.0's default), replacing m9 decision 7 (seduction as theft).
8. The grown-up table (`eggstate.ts`) is fixed to the port's row ids (it uses C's enum names today, so leaders, nobles and lords never grow up); may move the golden.
9. The ring of protection from shape changers and the cream pie at C's probabilities (moves the golden in steps 3 and 6).
10. Angels' artifact roll is drawn but the weapon stays plain (no artifacts).
11. The doppelganger's top-ten lookup always takes C's no-entry branch (no record file).
12. Mines' End variant 3's two vampires are restored, and the scripts' vampire and Angel spots are filled by class or id.
13. `#wipe` is a new action (the creamed face).
14. Core `MonsterSound` gains `'vampire'` and `'arrest'` (additive).

## Taken (m19 tools and potions, 2026-11-15)

Planner's recommendations, all marked cheap to change later (plan `~/.claude/plans/m19.md`, kickoff `docs/kickoff-m19.md`):

- **m19 port subset**: the bell, invocation items, camera, mirror, crystal ball, lenses, saddle, leash, stethoscope, grease, grappling hook, ice box, bag of tricks and sinks stay in ROADMAP.
- **m19 diluted potions in `erosion.e1`** (C's `#define odiluted oeroded`), no new core `diluted` field.
- **m19 all new object rows in step 1** (15 tools, tin, potion of oil): one golden move instead of five.
- **m19 Glib in step 8**, first to drop if the budget runs short.
- **m19 drum of earthquake in** (`do_earthquake()`/`do_pit()`); the leather drum's Deafness out.
- **m19 `#dip` UI**: C's yes/no for a fountain or pool first, then a potion menu; "Dip into" offered on potions too.
- **m19 `#rub` as its own action** (M-r), wielding the lamp first as C does; royal jelly on eggs included; gray stones out.
- **m19 markers follow 5.0's `dowrite()`**: writing by label only for seen labels, the Luck roll for unknown types (non-Wizard 15), names matched against object and called names, not the wish parser.
- **m19 bottle occupants**: 5.0's 1 in (13 + 2 x births), rolled only for milky or smoky potions.
- **m19 wished-for magic lamp** becomes an oil lamp outside wizard mode; wizard mode keeps the djinni.

## Approved by the user (m20 artifacts, 2026-11-16)

m20 is not started yet (plan `~/.claude/plans/m20.md`, kickoff text `~/.claude/plans/m20-kickoff.md`, 8 steps). The user took both recommendations below on 2026-11-16, so m20 can run as planned with its 9 cheap recommendations taken.

- **m20 Q1, object names and artifact identity in core**: two optional `ItemComponent` fields (`name?: string`, `artifact?: DefId`), plain data, no save version bump. Alternative: content side tables `modData.nh.oname[id]`/`oartifact[id]` (lazy pruning, copying at every copy site, a lookup on every hit). **Approved: the core fields.**
- **m20 Q3, artifact existence and discovery state**: `modData.nh.arti` (`exist: Record<artifactId, {origin; found?}>`, `disco: artifactId[]`), stored rather than derived because C's `artiexist` outlives a destroyed artifact. Alternative: a core `GameState.artifacts`. **Approved: `modData.nh.arti`.**
- Also worth a look: the hero is always a neutral Valkyrie until m22, so her first gift is always Mjollnir; `#offer` (sacrifice) does not exist yet and becomes m20 step 7; Angels stay out (Q10).

## Approved by the user (m21 step 6, Rogue level look and doorways, 2026-11-16)

m21 steps 1-5 are done (branch `m21`). Step 6, the only core change, was parked; the user took both recommendations on 2026-11-16, so it can run. Until it does, the Rogue level draws like any other level and its doorways allow diagonal moves (DEVIATIONS).

- **m21 Q1, the Rogue look across the view boundary**: a core `SymsetDef` registered by mods, `LevelDef.symset`, core resolving the snapshot legend through it, and `ViewSnapshot.symset` naming it, so renderers need no change. Alternatives: each renderer owns a Rogue table keyed by `ViewSnapshot.symset` plus object classes in the legend, or no display change. **Approved: the core symset registered by mods** (user: "the rogue level is sort of a mod", so the Rogue look is a symset a mod registers, the vanilla mod for now).
- **m21 Q2, no diagonal moves through Rogue doorways**: `LevelDef.doorwaysBlockDiagonal` read by core `cellRules()`, so the hero, travel and monsters agree. Alternative: content-only checks for the hero and monsters, with travel left as it is. **Approved: the core flag.**

## Taken (m21 Fort Ludios and the Rogue level, 2026-11-16)

Planner's cheap recommendations (plan `~/.claude/plans/m21.md`, kickoff `docs/kickoff-m21.md`); step 6 and its Q1/Q2 are parked above.

- **m21 Q3 client glyph overrides**: render-ascii applies `setGlyph()` overrides only when the snapshot has no symset (moot until step 6).
- **m21 Q4 Ludios's portal branch**: no core change: a `stairs: 'child'` branch whose rolled level gives the draws and depth, the real portal level in `modData.nh.knox`, knox's fixup turning its branch stairs into the return portal.
- **m21 Q5 Rogue level builder**: content: a stone LevelDef plus a fixup running makeroguerooms()/makerogueghost()/sort_rooms()/generate_stairs() in C's order.
- **m21 Q6 other map sizes**: the 3x3 sections scaled to the map (exact at 80x21), ordinary rooms below a minimum size.
- **m21 Q7 `rogue_vision()`** not ported (ordinary vision).
- **m21 Q8 remembered dark floor** on the Rogue level not blanked.
- **m21 Q9 the tribute ghost** unnamed (the name rolls drawn) until monsters have names.
- **m21 Q10 wizard mode and the Ludios portal**: the 1-in-3 roll drawn anyway; its result ignored in wizard mode.
- **m21 Q11 monster-generation exclusions** for Ludios as `MadeLevelFlags.mongenExclude`; Sokoban keeps its stand-in.
- **m21 Q12 "Fort Ludios" on the status line** through a content status field `place` the ui prints instead of `Dlvl:N`.
- **m21 Q13 Ludios made before its portal** (wizard levelport): no return portal until a vault gets the main-side portal, then added to the made level.

## Approved by the user (m22b roles and races: core defs and character creation, 2026-11-16)

m22 (plan `~/.claude/plans/m22.md`, kickoff `docs/kickoff-m22.md`) is split: m22a (steps 1-7) is content only with a test-only role override (`modData.nh.urole`/`urace`, Q12); steps 1-4 are done, 5-7 not run. m22b (steps 8-10: core role and race defs, the character on the hero, new-game options, the save version bump, the character menus, a soak over every role) was parked on four costly questions; the user answered them on 2026-11-16:

- **m22 Q1, character creation flow** (**approved as recommended**): the app asks before the game exists; the worker's `new` message carries a concrete character; core stores it on the hero before the new-game hooks; the replay records it; the menus get their data from a new worker `choices` request answered from the registry.
- **m22 Q2, role ids and the hero's def** (**approved as recommended**, but no old-save migration: see Q5): def ids are global and 11 of the 13 role names are already player-monster ids (`nh:wizard`, `nh:healer`, ...). Rename every role to `nh:role_<key>` (the Valkyrie too), keep the hero's def as the role id, migrate old saves through `RoleDef.formerIds`, add the missing valkyrie monster row. Alternatives in the plan: keep `nh:valkyrie`, per-kind id spaces, a single `nh:hero` role.
- **m22 Q3, core defs vs content tables** (**approved as recommended**): `RoleDef` gains only allowed races/genders/alignments, a menu order, the female name and former ids; a new minimal `RaceDef`; the hero stores starting role, race, gender and alignment; every mechanic (kits, skills, attributes, spells, gods) stays in content tables.
- **m22 Q5, existing Valkyrie-only saves** (**user: wipe them**, saves are only used for tests): bump the save version and drop older saves instead of migrating them; no `RoleDef.formerIds` migration is needed for saves. Old replays and test fixtures are regenerated rather than read with a default character.

## Taken (m22a roles and races, content only, 2026-11-16)

- **m22 Q4 skills state** unchanged; Master and Grand Master levels added.
- **m22 Q6 default character** (tests, golden, old replays): the first registered role and its first race, gender and alignment, with the Valkyrie (human, female, neutral) first, so today's hero stays the default.
- **m22 Q7 random picks** resolved by the app; core only receives concrete choices (DEVIATIONS: C draws them on the game RNG). Only matters once m22b runs.
- **m22 Q8 welcome and status**: the welcome event gains race, gender and alignment params; rank title and alignment are content status fields.
- **m22 Q9 starting-inventory order**: the port's place (before the first level), 5.0's order inside it.
- **m22 Q10 the eight missing kit objects** (stethoscope, expensive camera, leash, saddle, bell, fortune cookie, orange, pancake) added with their uses; the leash without dragging, the saddle without riding.
- **m22 Q11 out of scope**: riding, two-weapon combat, pauper/nudist/reroll, pet names, the quest fix-ups, the player's name in state.
- **m22 Q12 the m22a test override** `modData.nh.urole`/`urace` (no app save can contain it before m22b).
- **m22 Q13 persisting choices** as device options `role`/`race`/`gender`/`align` and URL params with NetHack's file codes (m22b).

## Taken (m23 the Amulet and the endgame, 2026-11-18)

Plan `~/.claude/plans/m23.md` (m23a steps 1-6 the Amulet, m23b steps 7-10 the Planes). The planner marked every question cheap; all taken as recommended. Q3 is a small core type addition, taken by the orchestrator (user away, 2026-11-18: "I leave it up to you").

- **Q1 the Bell before the quest:** only a wizard-mode wish makes the Bell of Opening until m24 (a normal wish gives an ordinary bell, as NetHack); no stand-in placement. In normal play the invocation, Sanctum, Amulet and Planes are reachable only once m24 exists.
- **Q2 the Planes' branch, no core change:** `stairs: 'child'`, DL1's up stairs lead to the endgame with the Amulet, each Plane's setup removes the stairs core makes (Fort Ludios's workaround).
- **Q3 core `LevelContent.align?` and `waiting?`** (optional fields content interprets, like `asleep`/`appearAs`); `SAVE_VERSION` 9 -> 10 in step 2 with the new dungeons (old saves wiped, the user's rule). Fallback: make those monsters in the levels' setup code.
- **Q4 ascension as a content end** (`endHow` 'ascended' under core's existing 'escaped' kind), no new core `GameOver.kind`.
- **Q5 high altars** as a content table keyed by LevelDef id, not a core field.
- **Q6 both new dungeons (`nh:vlad`, `nh:planes`) in step 2:** one golden move, one save bump.
- **Q7 the Amulet, Bell, Candelabrum and Book counted from inventory**, not stored flags.
- **Q8 Water/Air bubbles as content state** (`modData.nh.bubbles`) moved by the `endOfTurn` hook; no core support.
- **Q9 interim if m23b never runs:** climbing out of DL1 with the Amulet ends the game as an escape "with the Amulet".
- **Q10 tower1's vampire lady and named vampires** become plain vampire lords (no monster genders or names).
- **Q11 left out:** the Plane of Fire's fumaroles and the steam vortex's cloud (no gas-cloud regions), the tutorial, bones, achievements; `do_storms()` only if cheap.
