# Kickoff: NetHack TypeScript port, wizard mode (draft)

Wizard mode is NetHack's debug mode (`nethack -D`). It lets the developer reach and test content without playing to it: wish for objects, teleport between levels, map the level, create monsters, decline death. It comes before 6b (Minetown), whose temple and shops are slow to reach by normal play. It builds on 6a (`docs/kickoff-m6a.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first.

## Scope

1. **A separate game mod.** Wizard mode is a game mod (`wizardMod`, exported by content) that registers the debug actions through the public `ModApi`, like any third-party mod. The app loads it when the URL has `wizard=1`. Saves already record their mod list and refuse to load with a different one, so a wizard game is marked as such in its save and can't continue as a normal game. Wizard mode works on the public Pages build too. Like NetHack, a wizard game never records a score: there is no high-score list yet, so this is a rule for when one is added, written down in ROADMAP (ref: src/end.c really_done(): topten() only if !wizard && !discover). Replays stay deterministic: every debug command is a `PlayerAction` and draws only from `ctx.rng`.
2. **Discoverable on a phone.** Every debug command is offered by `query.actionsFor({ kind: 'self' })`; choices use menu prompts where possible, text prompts only for free-form names.
3. **Commands** (ref: src/cmd.c wizard command table, src/wizcmds.c):
    - `wiz:map`: map the whole level (ref: src/read.c do_mapping()).
    - `wiz:where`: say where each dungeon's levels and branches are (ref: src/dungeon.c print_dungeon(), wiz_where).
    - `wiz:levelport`: choose a dungeon, then a level in it, and go there (ref: src/teleport.c level_tele() wizard branch).
    - `wiz:wish`: type an object description such as `2 blessed +3 daggers` or `cursed ring of teleportation`, and get it (ref: src/zap.c makewish(), src/objnam.c readobjnam() subset).
    - `wiz:identify`: identify everything in the inventory (ref: src/wizcmds.c wiz_identify()).
    - `wiz:genesis`: type a monster name and create it next to the hero (ref: src/wizcmds.c wiz_genesis(), src/read.c create_particular() subset).
    - Death: in wizard mode, dying asks "Die?"; answering no restores the hero (ref: src/end.c done() wizard/discover branch).

Out of scope: wishing for terrain or traps (`fountain`, `trap door`), polymorph and other `#wiz*` commands, explore mode (`-X`), debug panels in the UI.

## Exit criteria

- On a phone, with `?wizard=1`, I can wish for an object, teleport into the Mines and back, map a level and survive a death.
- Without `wizard=1` none of the commands are offered, and the golden test is unchanged.
- `pnpm check` is green locally and in CI.

## Testing

- Unit tests: the wish parser (count, BUC, enchantment, plurals, `of` names, unknown names give a clear message), level teleport menus list every level of every dungeon in the layout.
- Scenario tests: level teleport into the Mines and back; a wished-for item is in the inventory with the asked-for properties; declining death leaves the hero alive with full HP.
- A normal game loads no wizard mod, offers no `wiz:` actions, and keeps the golden hash.
