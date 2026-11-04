# Kickoff: NetHack TypeScript port, milestone 7a (draft)

Milestone 7a adds spellcasting, for the hero and for monsters. The hero gets spell energy (Pw) and the `Z` command: casting the eight spells whose books exist since 5b, with NetHack's failure rates and energy costs. Monsters get `castmu()`: the aligned priest's clerical spells, gnomish wizards' and kobold shamans' mage spells. It builds on 5b (spellbooks and learning, `docs/kickoff-m5b.md`), 6b2 (the temple priest) and wizard mode (`docs/kickoff-wiz.md`). Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then propose a plan before writing any code.

## Scope

### Spell energy

1. **Pw for the hero:** current, maximum and peak energy, set at hero creation and raised at each level gain from the role and race tables (Valkyrie and human), with the role's energy modifier (ref: src/u_init.c u_init() `u.uen = u.uenmax = u.uenpeak = newpw()`; src/exper.c newpw(), enermod(), pluslvl()).
2. **Regeneration:** the turn-based Pw recovery, depending on level, Wisdom and Intelligence and on encumbrance, with "You feel full of energy." (ref: src/allmain.c regen_pw()).
3. **Bottom line:** `Pw:2(2)` after HP, in the status bar on every screen size.
4. **The newt's mild buzz** now that Pw exists (ref: src/eat.c eye_of_newt_buzz()).

### Hero casting

1. **`Z` (cast):** offered on the hero once she knows a spell; a menu of known spells with letter, name, level, school, failure rate and retention; then a direction for directional spells (ref: src/spell.c docast(), getspell(), dospellmenu(SPELLMENU_CAST), rejectcasting()).
2. **The cast checks:** stunned, forgotten spells backfiring (confusion and stun), the retention warnings, too hungry, too weak, overloaded, not enough energy ("yet" / "anymore"), the hunger cost, failing to cast ("You fail to cast the spell correctly.", half the energy) (ref: src/spell.c spelleffects_check(), spell_backfire()).
3. **Failure rates:** role spellcasting base, the healing-spell bonus, metal armor, shields, the robe, the quarterstaff, the role's special spell, Wisdom (the Valkyrie's casting stat), level, skill and spell level (ref: src/spell.c percent_success()). The robe's bonus is the deferred "priest gear" item from 6b2.
4. **The spells of the books we have** (ref: src/spell.c spelleffects()):
    - force bolt (like a wand of striking, with the Intelligence damage bonus) (ref: src/zap.c bhitm(), zapyourself(), spell_damage_bonus());
    - sleep (a ray like the wand's, `u.ulevel / 2 + 1` dice, the spell to-hit bonus) (ref: src/zap.c weffects(), dobuzz(), spell_hit_bonus());
    - healing (directional: heals a monster or the hero) (ref: src/zap.c bhitm() SPE_HEALING, zapyourself());
    - light (ref: src/zap.c zapnodir(), src/read.c litroom());
    - detect monsters (ref: src/potion.c peffect_monster_detection(), src/detect.c monster_detect());
    - cure blindness (ref: src/potion.c healup());
    - protection: the golden haze, its AC bonus and its decay (ref: src/spell.c cast_protection(); src/do_wear.c find_ac(); src/timeout.c nh_timeout());
    - confuse monster: glowing hands that confuse the next monster hit, which needs monster confusion (ref: src/read.c seffect_confuse_monster(); src/uhitm.c hmon_hitmon_msg_hit(), nohandglow(); src/monmove.c dochug(), m_move()).
5. **Spell skills train** with successful casts (ref: src/weapon.c use_skill()); `+` shows the failure rate and school too (ref: src/spell.c dovspell()).

### Monster spellcasting

1. **`castmu()`:** spell choice by level from the mage and cleric lists, useless spells skipped, the cast delay (`mspec_used`), fumbling ("The air crackles around ..."), cursing when it cannot cast, adjacent directed casting and undirected casting from up to 7 squares while not attacking (ref: src/mcastu.c castmu(), choose_monster_spell(), spell_would_be_useless(), cursetxt(); src/mhitu.c mattacku() AT_MAGC; src/monmove.c dochug(), mon_regen()).
2. **Mage spells** (gnomish wizards, kobold shamans): psi bolt, cure self, haste self, stun you, weaken you, curse items, aggravation (ref: src/mcastu.c mcast_spell()).
3. **Clerical spells** (the aligned priest): open wounds, cure self, confuse you, paralyze, blind you, summon insects, curse items, lightning, pillar of fire, geyser (ref: src/mcastu.c).
4. **Monsters:** the priest gets his `AT_MAGC AD_CLRC` attack; the kobold shaman is new, and College Town gets its two kobold shamans (ref: include/monsters.h; dat/minetn-4.lua).

### Wizard mode

`#wizcast` (cast any spell of the subset without knowing it) and `#wizlevelchange` (raising the hero's level), so the phone check can reach Pw and every spell (ref: src/spell.c dowizcast(); src/wizcmds.c wiz_level_change()).

## Out of scope

Spells whose books do not exist (the other 30-odd books, including the Valkyrie's special spell cone of cold); a timed Detect_monsters property (skilled detect monsters); spell menu reordering and sorting; the Amulet's energy drain; energy-draining attacks and the potion of gain energy; monster invisibility, so a monster's "disappear" spell; summoning nasties, cloning the Wizard and the touch of death; destroy armor; ray-casting monsters (`buzzmu()`); monsters remembering the hero's resistances (`M_SEEN_*`); Half_spell_damage sources; attribute exercise.

## Exit criteria

- On a phone with `?wizard=1`: wish for a blessed spellbook of force bolt, read it, raise the level with `#wizlevelchange`, see `Pw` on the bottom line, cast force bolt at a monster with `Z` (also from the action menu), see its failure rate in `+`, and see Pw come back over time.
- `#wizcast` casts each of the eight spells with its effect.
- A gnomish wizard or kobold shaman made with genesis casts psi bolts and cures itself; the Minetown priest, angered, casts clerical spells.
- Replays and the golden test are deterministic (with an explained golden update where Pw or casting first changes the stream), and `pnpm check` is green locally and in CI.

## Testing

- Unit tests: `newpw()` at creation and per level for the Valkyrie; regeneration timing; `percent_success()` against a table worked out by hand from the C formula (Wisdom, level, skill, robe, metal helm, large shield, healing bonus); energy and hunger costs; each cast check message.
- Scenario tests with pinned monsters (speed 0, asleep) and set Pw: each spell's outcome (force bolt damage, the sleep ray freezing a monster, healing a monster and the hero, light, detection, cure blindness, protection AC and decay, confuse monster on the next hit); each monster spell's effect on the hero, reached by setting the caster's level and searching for a seed that picks the spell.
- The soak bot casts known spells now and then; new invariant: `0 <= Pw <= Pwmax`. No new long soak runs.
- Phone check uses wizard mode (`?wizard=1`): wish, levelchange, wizcast, genesis, levelport to Minetown.
