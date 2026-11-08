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
  7. Incubus/succubus seduction acts as item theft until monsters have genders.
  8. No real-time clock (night, full moon): gremlins never curse; core stays deterministic.
  9. Cockatrice eggs deferred (m9 step 8 or m10).
  10. Level drain records HP/energy gained per level from m9 on, average-gain fallback for older saves.
  11. Stoning before drain and lycanthropy (7f depends on it).
  12. Monster blindness in content state.
  13. A sickness type flag (food poisoning vs illness).

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

## Parked

- **7f core contracts** (2026-11-07). Plan draft: `~/.claude/plans/m7f.md` (summary at the top; ~16 steps, ~4.8M, after m9/m10). Costly to undo, need the user:
  - **D1 position prompt:** new `Prompt.kind: 'position'` (optional `start`, `valid`), answered `{x, y}` or null; UI reuses the getpos cursor, on a phone tap moves and a second tap picks. In replays, UI hosts and the soak bot.
  - **D3 remembered `I`:** a `monsterMemory` entry that is not a MonsterDef id becomes a marker; kept on visible cells, so `ViewCell.m` may appear on visible cells. In saves; renderer meaning changes.
  - **D5 polymorphed hero:** the hero keeps the role def; the form lives in content (`modData.nh.upoly`), no `player.form` in core. In saves.
  - **D6 hero HP while polymorphed:** the form's HP goes into `c.hp`, her own is parked in `upoly`, so damage paths stay as they are. In saves.
  - Cheap ones (D2, D4, D7-D11) and seven small open questions (jumping, cloak of invisibility, centaurs, stone-to-flesh meat, statue colour, polymorph scope cuts, two-run split): take the plan's recommendations, faithful to NetHack (user guidance 2026-11-07), unless the user says otherwise.
