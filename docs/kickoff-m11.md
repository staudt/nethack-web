# Kickoff: NetHack TypeScript port, milestone 11 (draft)

Milestone 11 is the **objects batch**: the vanilla objects the port still lacks and the mechanics they need, added as real rows through the converter (`docs/CONVERTER.md`: `pnpm convert:objects <names>` and the convert test): the weapons and armor that monster starting gear rolls but cannot give, polearms and lances applied through the position prompt, silver and the monsters it harms, eggs, and the missing potions, scrolls and spellbooks with their effects. About 150 new rows in eight steps. Read `CLAUDE.md`, `docs/ARCHITECTURE.md`, `DEVIATIONS.md` and `docs/CONVERTER.md` first, then the plan (`~/.claude/plans/m11.md`).

Everything is content. No core interface change and no save-format change: new state (attribute peaks, genocided species, known egg types, levitation at will) lives in `modData.nh`, and eggs reuse core's `ItemComponent.corpseOf`.

## Scope

1. **Weapons:** the 42 missing weapon rows (silver weapons, spears and javelins, the polearms, lance, two-handed sword, battle-axe, broadswords, flail, morning star, war hammer, quarterstaff, bullwhip, the Japanese-named ones); monster starting gear gives them instead of only rolling for them; monsters choose them (`hwep[]`, `rwep[]`) (ref: src/makemon.c m_initweap(); src/weapon.c select_hwep(), select_rwep()).
2. **Polearms, lances and silver:** applying a wielded polearm or lance at a chosen spot (`use_pole()`, also from `f`), monsters thrusting with polearms from two squares; `hates_silver()`, silver's extra d20 damage and "The silver sears ...!" in all three directions, "You are harmed by silver" in enlightenment; the sprig of wolfsbane (cures lycanthropy) and the clove of garlic (ref: src/apply.c use_pole(); src/dothrow.c dofire(); src/mthrowu.c thrwmu(); src/mondata.c mon_hates_silver(); src/weapon.c dmgval(); src/eat.c fpostfx()).
3. **Armor I and the mercenary kit:** 32 armor rows whose properties exist (mundane helmets, body armor, shirts, cloaks, shields and boots; elven gear; cloaks of protection and magic resistance; helms of telepathy and caution; shields of reflection, drain and shock resistance), mercenary and elven armor given, K- and C-rations, the bugle and the tin whistle, reading shirts (ref: src/do_wear.c; src/makemon.c m_initinv(); src/apply.c use_whistle(); src/music.c do_improvisation(); src/read.c doread()).
4. **Armor II (dropped first if the budget runs short):** speed boots, levitation boots, fumble boots and gauntlets of fumbling, gauntlets of power and dexterity, helm of brilliance, dunce cap, cornuthaum, oilskin cloak, cloak of displacement, helm of opposite alignment (ref: src/do_wear.c, src/attrib.c acurr(), src/timeout.c nh_timeout() Fumbling, src/monmove.c set_apparxy()).
5. **Eggs:** the egg object, hatching timers, eating (rotten eggs, a cockatrice egg's delayed stoning), splatting and stoning by thrown eggs, pets eating them, `#sit` and laying eggs as a polymorphed form (ref: src/mkobj.c mksobj_init(); src/timeout.c hatch_egg(); src/eat.c fprefx(), fpostfx(); src/dothrow.c; src/sit.c dosit()).
6. **Potions:** gain ability, restore ability (with attribute peaks and lost levels), gain level, gain energy, speed, paralysis, sickness, fruit juice, acid, enlightenment, monster detection and timed levitation (blessed at will, `>` to come down) (ref: src/potion.c peffects()).
7. **Scrolls:** genocide (single, class, reverse and self), scare monster (`onscary()`), create monster, taming, confuse monster, destroy armor, amnesia, fire and charging (ref: src/read.c seffects(), do_genocide(); src/monmove.c onscary()).
8. **Detection and the remaining spellbooks:** the potion of object detection, the scrolls of gold detection, food detection and magic mapping, and the 30 missing spellbooks cast through the code above (fireball and cone of cold at a chosen spot, drain life, cause fear, detect unseen, create familiar, chain lightning) (ref: src/detect.c; src/spell.c spelleffects(), throwspell(), cast_chain_lightning(); src/dog.c make_familiar()).

## Out of scope

Worm tooth and crysknife (long worms), the boomerang's curved flight, applying the bullwhip, dragon scales and scale mail, the potion of oil (lamps), the scrolls of punishment (ball and chain) and stinking cloud (gas regions), the novel and the Book of the Dead, the other tools and foods, amulets of guarding and flying, the ring of protection from shape changers, jousting (steeds), thrones and the rest of `#sit` (m12), monsters using items (m14), roles and races. The full list with reasons is in the plan.

## Exit criteria

- On a phone with `?wizard=1`: apply a halberd at a monster two squares away and be thrust at by a soldier's polearm; a silver saber sears an imp; wolfsbane cures lycanthropy; wear the new armor and see it in AC and enlightenment; a tin whistle wakes a monster; eat a cockatrice egg and feel yourself stiffening, throw one and stone a monster, lay one as a cockatrice; float on blessed levitation and come down with `>`; genocide jackals; stand on a scroll of scare monster; cast fireball and create familiar; read magic mapping.
- In a normal game the new objects appear in their classes at C's relative probabilities and in shops, and monsters carry and use their gear.
- Replays and the golden test are deterministic, every golden change has a verified cause in its commit, and `pnpm check` is green locally and in CI.

## Testing

- The convert test covers every new row (class, probability, weight, cost, material, weapon, armor, property, spellbook level, description key).
- Unit tests for each behaviour with forced rolls or searched seeds: polearm ranges and monster thrusts, silver damage, armor effects, egg hatching and stoning, every potion and scroll by BUC, genocide in makemon, scare monster, the new spells; never lucky seeds.
- Seed-dependent tests that move with the object pools are re-fitted by seed search or pinning, not weakened.
- The soak bot runs with the new objects (it answers the new prompts) and keeps its invariants.

## Status

Planned; branch `m11` off `m7f-d`.
