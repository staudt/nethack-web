# Kickoff: NetHack TypeScript port, milestone 8 (draft)

Milestone 8 is release polish: the screens around the game rather than new dungeon content. It adds the **end of the game** as NetHack shows it ("Do you want your possessions identified?", the rest of the disclosure, the tombstone, the "Goodbye" summary), a **help screen** with a key list that also works as a tap-to-run command list, the **score** and a per-device **high-score list** that skips wizard-mode games, an **options screen**, and a **title / new-game screen** with `#quit`. It builds on wizard mode (`docs/kickoff-wiz.md`: the `wiz` mod and its "Die?"), 7d's enlightenment list and every earlier milestone's UI (`docs/kickoff-m5a.md`, `docs/kickoff-m5b.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan before writing any code.

Mobile portrait is the first target. Every screen here must work by tapping alone (CLAUDE.md rule 6); keys are shortcuts. The app is deployed to GitHub Pages and played on a phone.

Two small, optional core changes (an `ask` field on the `list` event, a `'quit'` game-over kind); everything else is content, `ui` and `app`. The player's name, the options and the high-score list live on the device, never in `GameState` or saves.

## Scope

1. **Disclosure at the end of the game:** the game identifies everything she carries (C does this whatever the answer), then the UI asks, in order and each with Yes / No / Quit (Quit skips the rest): "Do you want your possessions identified?" (the inventory, container contents indented), "Do you want to see your attributes?" (the enlightenment list), and, once kills are counted, "Do you want an account of creatures vanquished?". The answers change nothing in the game, so they are UI questions and never enter the replay (ref: src/end.c really_done() the identify loop, disclose(); src/insight.c enlightenment(), list_vanquished()).
2. **The tombstone and the summary:** rip.c's stone (REST IN PEACE, the name, the gold as `N Au`, the death reason wrapped at 16 characters on up to four lines, the year), then "Goodbye <name> the <role>...", "You died in The Dungeons of Doom on dungeon level 3 with 312 points,", "and 12 pieces of gold, after 1234 moves.", "You were level 4 with a maximum of 31 hit points when you died." Escaping shows no stone and says "You escaped from the dungeon with ... points," (ref: src/rip.c genl_outrip(); src/end.c really_done(); src/topten.c formatkiller()).
3. **Help:** `?` and a Menu entry open a help menu: how to play on a touch screen (the buttons, tapping, travelling, pinch zoom, the direction pad), the list of commands built from the current key bindings (each row tappable, which runs the command), the extended commands, and "About" (version, NGPL, links). Mod keys appear when the mod describes them (ref: src/cmd.c dohelp(), dokeylist(); dat/help, dat/hh; doc/Guidebook "Commands").
4. **Score:** NetHack's points: experience score (`u.urexp`: four times each experience gain plus the score bonuses, such as 10 for each scroll type learned by reading it), 90% of the gold gained if she died, 50 per level below the first, 1000 per level beyond 20; escaping adds the valuables she carries. Kills are counted per monster type (ref: src/exper.c more_experienced(); src/read.c learnscrolltyp(); src/end.c really_done() "calculate score", get_valuables(); src/mon.c xkilled() `mvitals[].died`).
5. **High-score list:** each finished game that did not load the `wiz` mod is recorded on the device (top 100), shown after the summary and from the menu and title screen, in topten.c's wording: rank, points, `Name-Val-Hum-Fem-Law died in The Dungeons of Doom on level 3 [max 4].  Killed by a jackal.`, HP and max HP; the new entry stands out (ref: src/topten.c topten(), outentry(), outheader(); src/end.c really_done() `!wizard`).
6. **Options:** a screen for the device's options: name, movement keys (number pad or vi keys, as today), run speed (NetHack's `runmode`), what the end of the game discloses (`disclose`: ask, show all, show nothing), and resetting the zoom. Options are client-side only (ref: src/options.c; doc/Guidebook `name`, `number_pad`, `runmode`, `disclose`).
7. **Title and new game:** with no game to resume, the app opens on a title screen (Play, Wizard mode, High scores, Help, Options) and asks "Who are you?" the first time; a saved game resumes straight away as now. `#quit` ("Really quit?") ends the game through the same disclosure and summary, with no stone; Menu > New game during a game quits first (ref: src/cmd.c done2(); src/end.c done(QUIT); src/allmain.c newgame(); src/role.c the name prompt).

## Out of scope

Conduct and achievements (nothing tracks them yet), the dungeon overview, genocides, the dumplog, bones files, the `taken` variant ("what you had when you died" after a shopkeeper takes your things), online or shared score lists, more roles, races, genders and alignment choice at new game (one role exists), game-side options (autopickup, `pickup_types`, `paranoid_confirmation`, `safe_pet`), renderer options (symbol sets, colours), translations.

## Exit criteria

- On a phone, I die (or `?wizard=1`, `^w` a wand of death and zap myself, answering "Die?" yes): I am asked about my possessions and attributes, see them identified, then the tombstone with my name, gold and death, then the summary and the high-score list. A wizard game is not on the list; a normal game is.
- On a phone, without a keyboard, I can open Help, read the touch guide, and run any keyed command from the command list.
- I can set my name and run speed in Options and they are remembered after a reload; a new device opens on the title screen.
- `pnpm check` is green locally and in CI; replays and the golden test are deterministic (with an explained golden update when the score and kill counts start being tracked).

## Testing

- Unit tests: rip.c layout (name and gold centred, a long death reason wrapped on word boundaries, never wider than the stone), topten.c entry wording for each kind of end, the score formula (gold, depth bonuses, escape valuables), score file load/save/merge (corrupt or missing data gives an empty list), the `wiz` skip, the key list built from a keymap (every bound command listed once per key, described or shown by id).
- Scenario tests: a death identifies the inventory and emits the disclosure lists with their questions; wizard "Die?" no keeps the pack unidentified; an escape emits no stone fields; `#quit` ends the game as `quit`; `u.urexp` grows by four times each experience gain and by 10 for a scroll learned by reading; kills are counted.
- UI tests (DOM): the question order, Quit skipping the rest, the tombstone after the last question, a help row running its command.
- The soak bot never picks `#quit`.
