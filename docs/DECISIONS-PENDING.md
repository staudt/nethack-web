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

## Parked

- **m7b boulders and Sokoban: four core contract questions** (2026-11-04). The plan (`~/.claude/plans/m7b-sokoban.md`, `docs/kickoff-m7b.md`, 8 steps: 7b1 boulders/pits/scroll of earth, 7b2 Oracle + Sokoban) is ready but needs these core changes, each marked costly to undo by the planner. Its recommendation is given; answer yes/no or change it, then the loop can run m7b.
  1. Boulder core contract: a `'rock'` object class, `ObjectDef.boulder?: true` (blocks sight, shown on top of a pile), and an optional blocked-cell set for `computeVisible`.
  2. Dungeon contract for chained up-branches: `DungeonEntryDef.chain`/`dir`, `DungeonDef.entry`, layout `entry` and `branches[].dir`, `LevelDef.stairs.branch`. All optional, no save-version bump.
  3. Sokoban rules flag: `LevelDef.flags.sokoban/premapped` plus a live `Level.sokoban?: true` that content clears when the level is solved (no noteleport/hardfloor flags yet).
  4. Corridor boulders from core levelgen: a transient `Level.boulderSpots?: Pos[]` that content turns into boulders on level creation and then deletes (alternatives: a general request list, or keep skipping C's `rn2(50)` corridor boulder roll).
  Also from the planner: Sokoban's entrance is on the level below the Oracle (not above), so a minimal Oracle level comes with it.

