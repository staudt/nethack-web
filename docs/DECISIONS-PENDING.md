# Decisions pending review

Design decisions the unattended loop (`docs/RUNBOOK.md`) made or parked without the user. **Taken** ones are already built on and can still be reversed; **parked** ones blocked a milestone until the user answers. Remove an entry once reviewed.

## Taken

- **6b2 donations, cancel costs you** (2026-11-03): cancelling the donation amount counts as offering 0, as in NetHack ("You refuse.", -1 alignment if coaligned, a turn passes). Small change in `packages/content/src/chat.ts` if it should be free.
- **m7a Pw and spell state in content modData** (2026-11-03): `modData.nh.pw` and `modData.nh.uspell`, no core component, no save version bump (the 5b+ pattern). Cheap to move into a core component later.
- **m7a monster spell subset** (2026-11-03): all ten clerical spells plus the mage spells psi bolt, cure self, haste self, stun you, weaken you, curse items, aggravation. Disappear, destroy armor, summon nasties, clone wizard and touch of death count as useless (never chosen); our casters never reach them.
- **m7a spells as a content table** (2026-11-03): `SPELL_INFO` plus a switch in cast.ts, not an `ObjectDef.cast` hook; ROADMAP note for the mod platform.
- **m7a wizard helpers** (2026-11-03): `#wizcast` and a raise-only `#wizlevelchange` in step 7, so the phone check can reach casting with a Valkyrie (Pw 2 at start).
- **m7a dismissed direction prompt** (2026-11-03): "The magical energy is released!" and the spell is cast at the hero herself (the port keeps no last direction as C does).

## Parked

- **m7b boulders and Sokoban: four core contract questions** (2026-11-04). The plan (`~/.claude/plans/m7b-sokoban.md`, `docs/kickoff-m7b.md`, 8 steps: 7b1 boulders/pits/scroll of earth, 7b2 Oracle + Sokoban) is ready but needs these core changes, each marked costly to undo by the planner. Its recommendation is given; answer yes/no or change it, then the loop can run m7b.
  1. Boulder core contract: a `'rock'` object class, `ObjectDef.boulder?: true` (blocks sight, shown on top of a pile), and an optional blocked-cell set for `computeVisible`.
  2. Dungeon contract for chained up-branches: `DungeonEntryDef.chain`/`dir`, `DungeonDef.entry`, layout `entry` and `branches[].dir`, `LevelDef.stairs.branch`. All optional, no save-version bump.
  3. Sokoban rules flag: `LevelDef.flags.sokoban/premapped` plus a live `Level.sokoban?: true` that content clears when the level is solved (no noteleport/hardfloor flags yet).
  4. Corridor boulders from core levelgen: a transient `Level.boulderSpots?: Pos[]` that content turns into boulders on level creation and then deletes (alternatives: a general request list, or keep skipping C's `rn2(50)` corridor boulder roll).
  Also from the planner: Sokoban's entrance is on the level below the Oracle (not above), so a minimal Oracle level comes with it.

