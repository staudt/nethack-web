# Roadmap

Goals beyond the current milestone. Milestone briefs live in `docs/kickoff-m*.md`.

## Mod platform

The two mod layers exist so that people can build on the game, and building should be easy *with an AI*:

- **Game-logic mods** in the style of Quake's `progs.dat`: different levels, custom monsters and objects, changed rules. They are game mods (`Mod` and `ModApi`): deterministic, recorded in saves.
- **Renderer plugins:** alternative ways to draw the `ViewSnapshot` (`Renderer`), plus client mods for input, menus and glyphs.
- **Selectable in the web app:** a picker at new game for the game mods, and a setting for the renderer, among the ones the app ships (and later, loaded from a URL or file).

It should stay simple: a mod is one module that registers defs. The work, planned for a milestone after more content exists (after 5b and probably shops or spells):

1. A mod authoring guide (`docs/MODDING.md`) that is complete enough for an AI to write a working mod from it alone, with every `define*` def, hook and helper documented, plus a worked example.
2. Two sample mods: a game mod (a custom level generator and a few monsters) and a renderer (for example the `render-canvas` sprite or UTF-8 stub).
3. The app's picker, and save/load that respects the chosen mod list (already enforced by `ModRef[]` in saves).
4. Loading a mod bundle at runtime (an ES module URL), with clear `ModLoadError`s.

Until then, every milestone keeps new core contracts small, data-driven and documented in `ARCHITECTURE.md`. Vanilla stays an ordinary mod with no back doors.

## Deferred content

Left out of a milestone on purpose, to be picked up later. Rule differences they cause are also logged in `DEVIATIONS.md`.

From 5b (objects and traps):

- **Rings:** teleportation, teleport control, polymorph, polymorph control, conflict, levitation, see invisible, invisibility, warning, stealth.
- **Amulets:** change, unchanging, magical breathing.
- **Wands:** wishing, digging, teleportation, polymorph, cancellation, make invisible, undead turning, death, enlightenment; breaking (applying) wands.
- **Tools:** pick-axe and digging, magic lamp (djinni), bag of tricks, horns, musical instruments, #force.
- **Spells:** casting and spell energy (5b only learns spells from books).
- **Traps:** the other trap types (pits, webs, teleport and level teleporters, magic traps, fire, land mines, rolling boulders, polymorph, anti-magic, statue traps), #untrap, trapped doors and boxes.
- **Item damage:** `passive_obj` on monster gear, fixing erosion.

From 6a (branches, the `LevelDef` format and the Gnomish Mines; done, phone-checked 2026-11-02):

- **Boulders:** the boulder object and `moverock()` (pushing, squeezing past, boulders in Mines filler levels and in blocked extra corridors).
- **Mines monsters:** gnome king, gnomish wizard, dwarf lord, dwarf king, bugbear and mind flayer (the `G` and `h` classes pick only from the monsters that exist).
- **Branch stairs description:** "staircase down to the Gnomish Mines" once used (`stairs_description()`); up and portal branches.
- **Either/or content entries** in `LevelDef` (minefill's `percent(50) and "h" or "G"`), and a first solidfill pass before a cave init.
- **Hero races:** the Mines' inhabitants peaceful to gnome and dwarf heroes.
- **Minetown** is milestone 6b; Mines' End is not planned yet.

From wizard mode (`docs/kickoff-wiz.md`; done, phone check pending):

- **Score list rule:** a future high-score list must skip every game whose mod list includes `wiz` (ref: src/end.c really_done(): topten() only if `!wizard && !discover`).
- **Wishing for terrain and traps** (`fountain`, `trap door`), artifacts, named objects and the other `readobjnam()` words listed in `DEVIATIONS.md`; the wish "help" text and history.
- **Genesis extras:** a command count, "saddled", "invisible", "hidden", genders, class descriptions ("dragon"), special-monster forcing.
- **Other `#wiz*` commands:** #wizpolymorph, #wizdetect, #wizlevelchange, #wizintrinsic, #wizsmell, #wizcast, #wizkill and the rest; explore mode (`-X`); debug panels in the UI.
