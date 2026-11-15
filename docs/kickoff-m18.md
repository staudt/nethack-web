# Kickoff: NetHack TypeScript port, milestone 18

Milestone 18 is **monster batch 3**: the monsters the ROADMAP still owes after Gehennom. Birth counts and extinction (at most nine Nazgul and three erinyes, a unique made only once), vampires and vampire lords that shift into bats, fog clouds and wolves and rise again when the bat dies, the other shapeshifters (chameleons, doppelgangers, sandestins) and the ring of protection from shape changers, the rest of the `&` class (the erinyes, marilith, vrock, hezrou, bone and ice devils, nalfeshnee, pit fiend, balrog, the amorous demon, Yeenoghu, Geryon, Dispater, Demogorgon), seduction (`doseduce()`), the salamander, steam and fire vortices and the disenchanter, Keystone Kops with their cream pies when she leaves a shop without paying, and Angels with the minions an angry god sends. Seven steps. Read `CLAUDE.md`, `docs/ARCHITECTURE.md` and `DEVIATIONS.md` first, then the plan (`~/.claude/plans/m18.md`).

Almost everything is content. Core gets two additive `MonsterSound` values ('vampire', 'arrest'). There is no save-format change: birth counts, the extinct list, a shapeshifter's true kind, the amorous demon's gender and a minion's god are content tables in `modData.nh` that a game saved before m18 simply lacks (its counts start at zero). The beholder and the vampire mage are compiled out of NetHack 5.0 (`#if 0`), so there is nothing to port for them.

## Scope

1. **Birth counts and extinction:** `mvitals[].born`, `propagate()` at every birth, `mbirth_limit()` (Nazgul 9, erinyes 3, else 120), uniques extinct once made, extinct kinds skipped by random generation, class picks, special levels, cloning, figurines ("... into a pile of dust."), eggs and the cursed genocide; the "(extinct)" lines; `wiz:born` (ref: src/makemon.c propagate(), mbirth_limit(), makemon(), unmakemon(), mkclass(), clone_mon(); src/mhitu.c cloneu(); src/dog.c make_familiar(); src/timeout.c hatch_egg(); src/read.c; src/sp_lev.c create_monster(); src/priest.c; src/insight.c list_genocided(), num_extinct(), doborn()).
2. **Vampires and the shapeshifter core:** vampire and vampire lord rows; a shapeshifter's true kind (`cham`), the shifted birth, `decide_to_shapeshift()`, bat, fog and wolf forms, rising again when killed in another form, fog under closed doors, altars that scare them, silver, MS_VAMPIRE; the vampires of the Valley, the demon lairs, Orcus Town, the towers, Mines' End and the morgues; the grown-up table fixed to the row ids (gnome lords, dwarf kings... grow up again) (ref: src/mon.c decide_to_shapeshift(), pickvampshape(), select_newcham_form(), newcham(), vamprises(), vamp_stone(), mondead(); src/monmove.c can_fog(), vamp_shift(), onscary(); src/makemon.c makemon(), pm_to_cham(); src/mondata.c little_to_big(); src/sounds.c domonnoise(); dat/valley.lua, asmodeus.lua, baalz.lua, minend-3.lua, orcus.lua, wizard1.lua, wizard3.lua, fakewiz1.lua, fakewiz2.lua).
3. **Chameleons, doppelgangers, sandestins; protection from shape changers:** their rows and forms (animals, role monsters, nasties), the regular shapeshift, the ring (wearing it turns every shapeshifter and mimic back), eating a shapeshifter corpse (ref: src/mon.c select_newcham_form(), pick_animal(), rescham(), restartcham(), restore_cham(); src/topten.c tt_doppel(); src/do_wear.c Ring_on(), Ring_off(); src/eat.c cprefx()).
4. **The remaining demons:** fourteen rows with their weapons and wands, minor demons summoned and in morgues, Geryon's and Dispater's bribes, the erinyes (peaceful only to a hero who never abused her alignment, aggravating, summoned by the helm of opposite alignment), level-made minor demons asleep (ref: include/monsters.h; src/makemon.c m_initweap(), m_initinv(), makemon(), peace_minded(), summon_furies(); src/mon.c m_respond(); src/minion.c ndemon(), dprince(), dlord()).
5. **Seduction and the Gehennom stragglers:** the amorous demon as incubus or succubus, `doseduce()` with its questions, outcomes and payment; the salamander, steam and fire vortices and the disenchanter (ref: src/mhitu.c could_seduce(), doseduce(), mayberem(), gulpmu(), hitmu(); src/uhitm.c mhitm_ad_ssex(), passive()).
6. **Keystone Kops:** "An alarm sounds!", Kops around her or at the stairs and the shopkeeper, Kops sent away when the shopkeeper is paid, dead Kops coming back, their arrest lines; cream pies thrown, applied and eaten, a creamed face and #wipe (ref: src/shk.c call_kops(), makekops(), kops_gone(), make_happy_shoppers(); src/dog.c losedogs(); src/makemon.c m_initweap(); src/mon.c mondead(); src/sounds.c domonnoise(); src/apply.c use_cream_pie(); src/dothrow.c; src/mthrowu.c; src/do.c dowipe()).
7. **Angels and minions:** couatl, Aleax, Angel, ki-rin, Archon; random Angels with their god and renegades, their swords and shields, Angels summoning Angels, the angry god's minion ("Thou shalt pay for thine indiscretion!") (ref: src/minion.c msummon(), summon_minion(), lminion(), llord(); src/makemon.c m_initweap(), makemon(), peace_minded(); src/pray.c angrygods(); dat/medusa-2.lua, hellfill.lua).

## Out of scope

The beholder and the vampire mage (not in 5.0), Vlad the Impaler and his Tower, the Riders, the mail daemon, Cerberus, the djinni (m19, with the magic lamp and smoky potions), quest monsters, the displacer beast and the genetic engineer, the hero's own vampire shapeshifting, monster genders for any kind but the amorous demon, `adj_erinys()` (erinyes growing stronger with alignment abuse), artifacts (an Angel's sword stays plain), roaming minions, the steam vortex's gas cloud (no regions), remote burglary, roles and races. The full list with reasons is in the plan.

## Exit criteria

- On a phone with `?wizard=1`:
  - `wiz:born` shows births and deaths; a tenth Nazgul never comes;
  - a genesised vampire lord appears as a bat, fog cloud or wolf, changes back when hurt, rises again when the bat is killed and slips under a closed door as fog;
  - a chameleon changes form until she puts on a ring of protection from shape changers;
  - a balrog wields its whip and broadsword; Geryon is invisible and asks for a bribe; a fourth erinys never comes;
  - an amorous demon asks its questions and leaves; Look shows a succubus as "succubus";
  - leaving a shop without paying sounds the alarm and brings Kops; a cream pie blinds her and #wipe cleans it; paying sends the Kops away;
  - an Angel carries a sword and a shield; an angry god sends a minion.
- Replays and the golden test are deterministic. Every golden change has a verified cause in its commit (expected in steps 1 (hash only), 3 and 6, possibly 2 and 4), and `pnpm check` is green locally and in CI.

## Testing

- Unit tests for the birth counts at every site (limits, uniques, MM_NOCOUNTBIRTH callers, a failed makemon), each shapeshifter's form choice, shifting back, rising, fog under doors, the ring on and off, each new attack on the hero, the demons' gear and bribes, the erinyes' rules, both seduction outcomes and the same-gender case, the Kops' arrival by both paths, their counts by depth and their dismissal, cream pies and #wipe, random Angels' gods, the angry god's minions of each alignment, and the grown-up table naming only real rows. Use searched seeds or pinned monsters (speed 0, asleep), never lucky ones.
- Seed tests moved by the new rows, the ring shuffle or the cream pie are re-fitted by seed search or pinning, not weakened, and each re-fit is checked with the step's behaviour switched off.
- A soak (`soak.shapeshift`) runs the bot among vampires, chameleons and a doppelganger and keeps the standard invariants plus a valid true kind for every shapeshifter.

## Status

(Filled in by the last step.)
