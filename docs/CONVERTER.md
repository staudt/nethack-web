# Monster and object converter

`packages/testkit/src/convert/` reads NetHack's data tables from `vendor/nethack/include` and turns rows into content defs. It is Node-side tooling: `core` and `content` never import it.

- `cpp.ts`: a small C preprocessor for these headers only (comments, continuations, `#define`/`#undef`, `#if`/`#ifdef`/`#elif`/`#else`, `defined()`, integer expressions). It expands the wrapper macros (`WEAPON()`, `HELM()`, `RING()`, `SPELL()`, `SEDUCTION_ATTACKS_YES`, `#define PAPER LEATHER`, ...) and keeps the row macros (`MON`, `OBJECT`) so their arguments can be read.
- `cdata.ts`: `parseMonsters()` and `parseObjects()` return one record per row, with C names kept (`AT_BITE`, `M1_FLY`, `IRON`, `CLR_RED`) and numbers evaluated. It also reads `defsym.h` (class characters), `color.h` (`HI_*` aliases), `weight.h`, `align.h`, `objclass.h` and `skills.h`. `isShuffled()` ports `obj_shuffle_range()`.
- `defs.ts`: `monsterData()` and `objectData()` map a record to the data fields of `MonsterDef`/`ObjectDef`, using the vanilla id rules below.
- `emit.ts`: prints TypeScript defs and message entries for a list of names.

## Ids and names

- Monsters: `nh:` plus the snake-cased name; for `NAMS()` rows the male name (`nh:kobold_lord`, message "kobold lord"). If two rows share a name (the were-creatures' two forms, the two "priest"s), each uses its `PM_` enum name (`nh:human_werejackal`, `nh:aligned_cleric`).
- Objects: `nh:` plus the snake-cased name, with xname()'s class prefix (`nh:ring_of_adornment`, `nh:spellbook_of_sleep`). A fixed description gets `descKey: '<id>.desc'`, a shuffled one gets none. Boots and gloves are named "pair of ...".
- Colours are emitted as the palette constant of the file (`CLR_BRIGHT_BLUE` -> `BRIGHT_BLUE`). Add any missing constant at the top of `monsters.ts` or `objects.ts`.

## Adding a batch

1. List the rows: `pnpm convert:monsters --list` or `pnpm convert:objects --list` (enum name, class, name).
2. Print the defs: `pnpm convert:monsters "giant ant" KILLER_BEE nh:soldier_ant` (display names, enum names or ids all work), and the same with `convert:objects`. Add `--json` to see the parsed C row instead. Names that match no row are reported on stderr.
3. Paste the defs into `MONSTERS` / `OBJECTS` in C order where order matters (gems; see the comments there), and the message lines into `messages.en.ts` (monsters) or `objects.en.ts` (objects). Plurals from the emitter are rough: check irregular ones against `makeplural()` in `packages/ui/src/plural.ts`.
4. Fill in what the C table lacks: `brain` (the emitter always writes `nh:melee`), container `capacity`/`box`, `use`/`zap` behaviour, sounds or attack types core's unions do not have yet (flagged `TODO`), and any shared description key that content already uses (gems, bags).
5. Run `pnpm exec vitest run packages/testkit/test/convert.test.ts`. It checks every `nh:` monster and object def against its C row (stats, attacks, flags, generation, resistances, corpse weight and nutrition, sound, symbol, colour consistency; class, probability, weight, cost, material, merge, magic, delay, weapon, armor, food, property, wand direction, spellbook level, description key). A def that differs on purpose goes in the test's `MONSTER_DIFFERENCES` or `OBJECT_DIFFERENCES` with a one-line reason or a DEVIATIONS.md pointer; an id that differs from the rule above goes in `OBJECT_ALIASES`.

## Not covered

The converter does not write behaviour, corpse effects, monster starting gear or generation code; it does not parse artifacts (`artilist.h`), roles or other tables, and it is not a general C parser: a new construct in those headers may need a small change in `cpp.ts`.
