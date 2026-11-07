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

## Approved

- **m7b boulders and Sokoban: four core contract questions** (2026-11-04, approved by the user 2026-11-06: all four recommendations taken). The plan (`~/.claude/plans/m7b-sokoban.md`, `docs/kickoff-m7b.md`, 8 steps: 7b1 boulders/pits/scroll of earth, 7b2 Oracle + Sokoban) needs these core changes, each marked costly to undo by the planner:
  1. Boulder core contract: a `'rock'` object class, `ObjectDef.boulder?: true` (blocks sight, shown on top of a pile), and an optional blocked-cell set for `computeVisible`.
  2. Dungeon contract for chained up-branches: `DungeonEntryDef.chain`/`dir`, `DungeonDef.entry`, layout `entry` and `branches[].dir`, `LevelDef.stairs.branch`. All optional, no save-version bump.
  3. Sokoban rules flag: `LevelDef.flags.sokoban/premapped` plus a live `Level.sokoban?: true` that content clears when the level is solved (no noteleport/hardfloor flags yet).
  4. Corridor boulders from core levelgen: a transient `Level.boulderSpots?: Pos[]` that content turns into boulders on level creation and then deletes (alternatives: a general request list, or keep skipping C's `rn2(50)` corridor boulder roll).
  Also from the planner: Sokoban's entrance is on the level below the Oracle (not above), so a minimal Oracle level comes with it.

## Parked

(none)
