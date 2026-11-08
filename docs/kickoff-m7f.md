# Kickoff: NetHack TypeScript port, milestone 7f

Milestone 7f adds what 7d and 7e could not do without core contract changes:

- **Position prompt:** teleport control, the blessed scroll of teleportation, controlled level teleport, wizard `^T` and `#jump`.
- **Invisibility:** invisible monsters and an invisible hero, see invisible, the remembered `I`, attacks on unseen targets, and monsters guessing where an invisible hero is.
- **Statues:** statues of monsters with contents, statue traps, stone to flesh, and stoned monsters leaving statues.
- **Polymorph:** monsters, objects, polytraps, rings and amulets, the hero's polymorph into forms, armor breaking, form attacks, system shock and polymorph control.

It runs as four sub-milestones, 7f-a to 7f-d, each on its own branch, after m9 and m10. The core changes are decisions D1-D8 of the plan as the user approved them (2026-11-08: D1 position prompt, D3 remembered `I`, D5 form in `modData.nh.upoly`, D6 form HP in `c.hp`; the cheap ones as recommended). Each is documented in `docs/ARCHITECTURE.md`, with its reason, in the step that makes it. Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `DEVIATIONS.md` and `~/.claude/plans/m7f.md` first.

## Scope

1. **7f-a, position prompt and teleport control** (branch `m7f-a`, 3 steps): `Prompt.kind: 'position'` with the getpos cursor (tap to move, tap again to pick), the soak bot's answers, `wiz:teleport`, the ring of teleport control, controlled teleports and level teleports, jumping boots, the spellbook of jumping and `#jump` (ref: src/teleport.c tele(), dotelecmd(), level_tele(); src/apply.c dojump(), jump(); src/do_name.c getpos()).
2. **7f-b, invisibility** (branch `m7f-b`, 4 steps): the perception `hides`/`self` hooks, `I` markers, the invisibility objects (wand, ring, potion, cloak) and see invisible, attacking and searching for unseen monsters, and monsters and shopkeepers against an invisible hero (ref: src/display.c map_invisible(); src/hack.c domove(); src/monmove.c set_apparxy(); src/mhitu.c wildmiss(); src/shk.c inhishop()).
3. **7f-c, statues** (branch `m7f-c`, 3 steps): statue objects shown as their monster, contents, breaking, statue traps, stone to flesh, and stoned monsters leaving statues (ref: src/mkobj.c mkcorpstat(); src/trap.c activate_statue_trap(), animate_statue(); src/zap.c break_statue(), stone_to_flesh_obj()).
4. **7f-d, polymorph** (branch `m7f-d`, 6 steps, stop point after step 2): the objects and polytraps, monster and object polymorph, the hero's polymorph, what a form can wear and use, fighting as a form (ref: src/polyself.c polyself(), polymon(), rehumanize(), newman(), break_armor(); src/mon.c newcham(); src/zap.c poly_obj(); src/uhitm.c hmonas()).

## Out of scope

Golems, figurines, vampire shapeshifting, polearms, and `#monster` abilities for forms the roster lacks. See the plan's open question 7 and its ROADMAP leftovers.

## Exit criteria

- The plan's phone check for each sub-milestone passes on a phone with `?wizard=1`.
- No feature needs a keyboard: the position prompt works by tapping.
- Replays and the golden test are deterministic, every golden change has a verified cause in its commit, and `pnpm check` is green locally and in CI.

### Status

- **7f-a (branch `m7f-a`, steps 1-3 done):** the position prompt, `wiz:teleport`, the ring of teleport control with controlled teleports and level teleports, and jumping (boots, spell, `#jump`) are built. Keyboard-free: every prompt answers by tapping (tap twice or Pick, Cancel), `#jump` is a self offer. Golden changes in steps 2 and 3 were verified by filtering the new defs. `pnpm check` green locally at each step; CI and the phone check (TESTPLAN "7f-a position prompt and teleport control") are pending.
- **7f-b (branch `m7f-b`, steps 1-4 done):** the core perception hooks `hides` and `self`, `I` markers in monster memory (`isMarker`, `setMonsterMark`, `ViewCell.m` on visible cells), `ViewEntity.unseen`; render-ascii draws markers and dims an unseen hero (golden unchanged). Step 2: the wand of make invisible, rings of invisibility and see invisible, potion of invisibility and cloak of invisibility; invisible monsters hidden on a visible square (seen with see invisible, sensed by telepathy), the invisible hero drawn unseen and the mummy wrapping blocking it, the magic trap's hum, fountains, attrcurse, enlightenment, probing and `wiz:genesis` "invisible". Golden change verified by filtering the new defs. Step 3: attacking and finding unseen monsters ("Wait!  There's something there you can't see!", "You attack thin air.", the Fight offer on an `I`, searching, thrown objects, wands, rays, kicks and unseen attackers leaving the `I`); golden unchanged. Step 4: monsters guess where an invisible hero is (`set_apparxy()` with C's rolls, transient per move), head for and attack the guess (wild misses, gulping air, exploding and casting at thin air, -2 to-hit, missiles and breath aimed at the guess), `perceives()` monsters see her, the spell of disappear, an invisible nymph cannot seduce, shopkeepers ("Invisible customers are not welcome!", standing in her way), priests and the Watch per `m_canseeu()`; golden unchanged. Keyboard-free: Fight is an offer on an `I`, searching is a self action. `pnpm check` green locally at each step; CI and the phone check (TESTPLAN "7f-b invisibility") are pending.
- **7f-c (branch `m7f-c`, step 1 done):** statues are drawn as the monster they show (core `ObjectDef.appearanceOf`, `itemShownId`), get a random monster and maybe a spellbook, appear in ordinary rooms (1 in 20), on the Oracle level (eight historic centaurs) and in Grotto Town (the historic gnome king, through the new `LevelContent.montype`/`historic`), break under striking, force bolt, a pick-axe and blasts, are listed by probing, and can be wished for ("statue of a gnome king"); monsters keep their guess of an invisible hero's square between moves. Golden change verified by disabling the room roll. `pnpm check` green locally.

## Testing

- Core tests for the position prompt validation and the perception hooks, using a test PerceptionDef.
- Unit tests per source and per rule with forced rolls, searched seeds or pinned monsters, never lucky seeds.
- The soak bot answers position prompts and keeps its invariants with polymorphed monsters.
