# Port map

Where each NetHack function lives in this port, generated from the `// ref:` citations in
`packages/*/src` by `pnpm portmap` (`packages/testkit/tools/portmap.ts`). Do not edit by hand;
a test fails when it is stale. Names are what the citation lists after the file (functions,
tables and data macros such as `WEAPON()`); a citation that names no file is placed through
the function definitions in `vendor/nethack/src`. `(file)` lists citations of the file as a
whole. A missing function may still be ported under a citation this parser cannot read.

152 NetHack files, 3283 citations.

## dat/dungeon.lua

- (file): `packages/content/src/dungeon.ts`, `packages/core/src/types/mod.ts`

## dat/minefill.lua

- (file): `packages/content/src/dungeon.ts`

## dat/minend-1.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/minesend.ts`

## dat/minend-2.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/minesend.ts`

## dat/minend-3.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/minesend.ts`

## dat/minetn-1.lua

- (file): `packages/content/src/minetown.ts`, `packages/content/src/orctown.ts`

## dat/minetn-2.lua

- (file): `packages/content/src/minetown.ts`

## dat/minetn-3.lua

- (file): `packages/content/src/minetown.ts`

## dat/minetn-4.lua

- (file): `packages/content/src/minetown.ts`

## dat/minetn-5.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/minetown.ts`

## dat/minetn-6.lua

- (file): `packages/content/src/minetown.ts`

## dat/minetn-7.lua

- (file): `packages/content/src/minetown.ts`

## dat/nhlib.lua

- `percent()`: `packages/content/src/orctown.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `shuffle()`: `packages/content/src/sp_lev.ts`

## dat/oracle.lua

- (file): `packages/content/src/oracle.ts`

## dat/quest.lua

- `demon_cuss()`: `packages/content/src/chat.en.ts`, `packages/content/src/cuss.ts`

## dat/soko1-1.lua

- (file): `packages/content/src/sokoban.ts`, `packages/content/src/sokoprize.ts`

## dat/soko1-2.lua

- (file): `packages/content/src/sokoban.ts`, `packages/content/src/sokoprize.ts`

## dat/soko2-1.lua

- (file): `packages/content/src/sokoban.ts`

## dat/soko2-2.lua

- (file): `packages/content/src/sokoban.ts`

## dat/soko3-1.lua

- (file): `packages/content/src/sokoban.ts`

## dat/soko3-2.lua

- (file): `packages/content/src/sokoban.ts`

## dat/soko4-1.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/sokoban.ts`

## dat/soko4-2.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/sokoban.ts`

## include/align.h

- (file): `packages/content/src/align.ts`, `packages/content/src/aligntyp.ts`, `packages/content/src/luck.ts`
- `ALGN_SINNED()`: `packages/content/src/aligntyp.ts`
- `A_CHAOTIC()`: `packages/content/src/luck.ts`
- `A_NEUTRAL()`: `packages/content/src/generation.ts`
- `A_NONE()`: `packages/content/src/aligntyp.ts`

## include/attrib.h

- (file): `packages/content/src/attrib.ts`, `packages/content/src/combat.ts`, `packages/content/src/hero.ts`, `packages/core/src/types/entity.ts`
- `A_STR()`: `packages/content/src/fountain.ts`

## include/color.h

- `CLR_MAX()`: `packages/content/src/chesttrap.ts`

## include/context.h

- (file): `packages/content/src/digstate.ts`, `packages/content/src/run.ts`, `packages/content/src/uhunger.ts`

## include/decl.h

- `xdir()`: `packages/content/src/breakwand.ts`
- `ydir()`: `packages/content/src/breakwand.ts`

## include/defsym.h

- (file): `packages/content/src/terrain.ts`, `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `S_arrow_trap()`: `packages/content/src/trap.ts`
- `S_bars()`: `packages/content/src/terrain.ts`
- `S_corr()`: `packages/content/src/terrain.ts`
- `S_crwall()`: `packages/content/src/terrain.ts`
- `S_dnstair()`: `packages/content/src/terrain.ts`
- `S_ndoor()`: `packages/content/src/terrain.ts`
- `S_room()`: `packages/content/src/terrain.ts`
- `S_stone()`: `packages/content/src/terrain.ts`
- `S_tree()`: `packages/content/src/terrain.ts`
- `S_upstair()`: `packages/content/src/terrain.ts`
- `S_vcdoor()`: `packages/content/src/terrain.ts`
- `S_vodoor()`: `packages/content/src/terrain.ts`
- `S_vwall()`: `packages/content/src/terrain.ts`

## include/display.h

- (file): `packages/content/src/invis.ts`, `packages/content/src/perception.ts`
- `_canseemon()`: `packages/content/src/invis.ts`
- `_mon_visible()`: `packages/content/src/invis.ts`
- `_mon_warning()`: `packages/content/src/perception.ts`
- `_tp_sensemon()`: `packages/content/src/perception.ts`
- `explosion_to_glyph()`: `packages/content/src/explode.ts`
- `glyph_is_invisible()`: `packages/content/src/invis.ts`
- `is_safemon()`: `packages/content/src/actions.ts`
- `mon_visible()`: `packages/content/src/invis.ts`
- `obj_to_glyph()`: `packages/content/src/statuestate.ts`, `packages/core/src/types/mod.ts`
- `zap_color_()`: `packages/content/src/buzz.ts`

## include/dog.h

- `dogfood()`: `packages/content/src/dog.ts`

## include/dungeon.h

- (file): `packages/core/src/types/state.ts`
- `d_level()`: `packages/core/src/types/level.ts`

## include/flag.h

- (file): `packages/content/src/generation.ts`, `packages/content/src/magic.ts`

## include/global.h

- (file): `packages/content/src/hero.ts`, `packages/content/src/skills.ts`, `packages/content/src/untrap.ts`, `packages/content/src/wish.ts`, `packages/content/src/wizard/genesis.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/rooms.ts`
- `PL_PSIZ()`: `packages/content/src/call.ts`

## include/hack.h

- (file): `packages/content/src/adtyping.ts`, `packages/content/src/endstate.ts`, `packages/content/src/explode.ts`, `packages/content/src/items.ts`, `packages/content/src/price.ts`, `packages/content/src/stats.ts`, `packages/content/src/wish.ts`
- `AC_VALUE()`: `packages/content/src/combat.ts`
- `ARM_BONUS()`: `packages/content/src/material.ts`
- `BOLT_LIM()`: `packages/content/src/dothrow.ts`, `packages/content/src/invis.ts`, `packages/content/src/mhitu.ts`, `packages/content/src/monmove.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/perception.ts`, `packages/content/src/priest.ts`, `packages/content/src/shkpay.ts`, `packages/content/src/trap.ts`
- `CANNIBAL_ALLOWED()`: `packages/content/src/eat.ts`
- `DIR_180()`: `packages/content/src/trapstate.ts`
- `EF_()`: `packages/content/src/erode.ts`
- `ERODE_()`: `packages/content/src/erode.ts`
- `ER_()`: `packages/content/src/erode.ts`
- `ER_NOTHING()`: `packages/content/src/water.ts`
- `EXT_ENCUMBER()`: `packages/content/src/magic.ts`
- `HVY_ENCUMBER()`: `packages/content/src/pray.ts`, `packages/content/src/untrap.ts`
- `MOD_ENCUMBER()`: `packages/content/src/hero.ts`, `packages/content/src/wish.ts`
- `NODIAG()`: `packages/content/src/monmove.ts`
- `POLY_CONTROLLED()`: `packages/content/src/polyself.ts`
- `ROT_AGE()`: `packages/content/src/corpses.ts`
- `SHOP_DOOR_COST()`: `packages/content/src/shopdamage.ts`
- `SHOP_HOLE_COST()`: `packages/content/src/shopdamage.ts`
- `SHOP_PIT_COST()`: `packages/content/src/shopdamage.ts`
- `SHOP_WALL_COST()`: `packages/content/src/shopdamage.ts`
- `SLT_ENCUMBER()`: `packages/content/src/dokick.ts`
- `TAINT_AGE()`: `packages/content/src/corpses.ts`
- `TROLL_REVIVE_CHANCE()`: `packages/content/src/corpses.ts`
- `VIS_EFFECTS()`: `packages/content/src/scatter.ts`
- `WAND_BACKFIRE_CHANCE()`: `packages/content/src/zap.ts`
- `invlet_basic()`: `packages/content/src/wish.ts`
- `isok()`: `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/mkmap.ts`
- `nonrotting_food()`: `packages/content/src/eat.ts`

## include/hacklib.h

- `dist2()`: `packages/content/src/monmove.ts`
- `distmin()`: `packages/content/src/monmove.ts`

## include/mcastu.h

- `MONSPELL()`: `packages/content/src/mcastu.ts`

## include/mextra.h

- (file): `packages/content/src/dog.ts`, `packages/content/src/epri.ts`, `packages/content/src/eshk.ts`
- `REPAIR_DELAY()`: `packages/content/src/shopdamage.ts`

## include/mhitm.h

- `M_ATTK_()`: `packages/content/src/adtyping.ts`

## include/mkroom.h

- (file): `packages/content/src/epri.ts`, `packages/content/src/eshk.ts`, `packages/content/src/oracle.ts`, `packages/content/src/shtypes.ts`, `packages/content/src/zoo.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/types/level.ts`
- `IS_SHOP()`: `packages/content/src/eshk.ts`
- `sbrooms()`: `packages/core/src/types/level.ts`

## include/monattk.h

- (file): `packages/core/src/types/mod.ts`
- `AD_MAGM()`: `packages/content/src/hero.ts`
- `AT_()`: `packages/content/src/hero.ts`, `packages/core/src/types/mod.ts`

## include/mondata.h

- (file): `packages/content/src/mondata.ts`, `packages/content/src/monmove.ts`
- `MZ_TINY()`: `packages/content/src/mthrowu.ts`
- `S_BAT()`: `packages/content/src/monmove.ts`
- `acidic()`: `packages/content/src/dog.ts`
- `bigmonst()`: `packages/content/src/corpses.ts`, `packages/content/src/dokick.ts`, `packages/content/src/mondata.ts`, `packages/content/src/monmove.ts`
- `can_teleport()`: `packages/content/src/monmove.ts`
- `cantweararm()`: `packages/content/src/mongear.ts`
- `carnivorous()`: `packages/content/src/dog.ts`
- `completelyrots()`: `packages/content/src/adtyping.ts`
- `completelyrusts()`: `packages/content/src/adtyping.ts`
- `corpse_eater()`: `packages/content/src/meat.ts`
- `digests()`: `packages/content/src/engulfstate.ts`
- `enfolds()`: `packages/content/src/engulfstate.ts`
- `flaming()`: `packages/content/src/engulfstate.ts`
- `flesh_petrifies()`: `packages/content/src/stonestate.ts`
- `haseyes()`: `packages/content/src/adtyping.ts`
- `helpless()`: `packages/content/src/mhitm.ts`
- `herbivorous()`: `packages/content/src/dog.ts`
- `humanoid()`: `packages/content/src/peaceful.ts`
- `is_animal()`: `packages/content/src/steal.ts`
- `is_domestic()`: `packages/content/src/dog.ts`
- `is_giant()`: `packages/content/src/givit.ts`
- `is_human()`: `packages/content/src/werestate.ts`
- `is_mercenary()`: `packages/content/src/mongear.ts`
- `is_placeholder()`: `packages/content/src/newcham.ts`
- `is_rider()`: `packages/content/src/newcham.ts`
- `is_unicorn()`: `packages/content/src/statue.ts`
- `is_wanderer()`: `packages/content/src/monmove.ts`
- `is_watch()`: `packages/content/src/watch.ts`
- `is_were()`: `packages/content/src/werestate.ts`
- `is_whirly()`: `packages/content/src/breakarm.ts`, `packages/content/src/engulfstate.ts`
- `likes_gems()`: `packages/content/src/mongear.ts`
- `likes_gold()`: `packages/content/src/mongear.ts`
- `likes_objs()`: `packages/content/src/mongear.ts`
- `locomotion()`: `packages/content/src/adtyping.ts`
- `needspick()`: `packages/content/src/mdig.ts`
- `noncorporeal()`: `packages/content/src/breakarm.ts`
- `nonliving()`: `packages/content/src/mondata.ts`
- `perceives()`: `packages/content/src/invis.ts`
- `pm_invisible()`: `packages/content/src/invis.ts`
- `poisonous()`: `packages/content/src/dog.ts`
- `polyok()`: `packages/content/src/newcham.ts`
- `regenerates()`: `packages/content/src/mstate.ts`
- `resists_ston()`: `packages/content/src/stonestate.ts`
- `slithy()`: `packages/content/src/adtyping.ts`
- `telepathic()`: `packages/content/src/givit.ts`, `packages/content/src/price.ts`
- `thick_skinned()`: `packages/content/src/dokick.ts`
- `touch_petrifies()`: `packages/content/src/stonestate.ts`
- `tunnels()`: `packages/content/src/mdig.ts`
- `unsolid()`: `packages/content/src/mhitm.ts`
- `vegan()`: `packages/content/src/dog.ts`, `packages/content/src/meat.ts`
- `vegetarian()`: `packages/content/src/mondata.ts`, `packages/content/src/shtypes.ts`
- `verysmall()`: `packages/content/src/breakarm.ts`, `packages/content/src/monmove.ts`
- `webmaker()`: `packages/content/src/trap.ts`

## include/monflag.h

- `MZ_HUGE()`: `packages/content/src/engulf.ts`
- `MZ_TINY()`: `packages/content/src/items.ts`
- `ms_sounds()`: `packages/core/src/types/mod.ts`

## include/monst.h

- (file): `packages/content/src/mstate.ts`, `packages/core/src/types/entity.ts`, `packages/testkit/src/invariants.ts`
- `MON_WEP()`: `packages/content/src/mongear.ts`
- `engulfing_u()`: `packages/content/src/engulfstate.ts`
- `monmax_difficulty()`: `packages/content/src/generation.ts`
- `monmin_difficulty()`: `packages/content/src/generation.ts`

## include/monsters.h

- (file): `packages/content/src/monsters.ts`, `packages/testkit/src/convert/emit.ts`
- `MON()`: `packages/content/src/monsters.ts`
- `PM_ALIGNED_CLERIC()`: `packages/content/src/epri.ts`
- `PM_ARCHEOLOGIST()`: `packages/content/src/statue.ts`
- `PM_ORACLE()`: `packages/content/src/oracle.ts`
- `PM_SHOPKEEPER()`: `packages/content/src/eshk.ts`

## include/obj.h

- (file): `packages/content/src/btrapstate.ts`, `packages/content/src/material.ts`, `packages/core/src/types/entity.ts`
- `CORPSTAT_HISTORIC()`: `packages/content/src/statuestate.ts`
- `Is_candle()`: `packages/content/src/items.ts`, `packages/content/src/price.ts`
- `Is_container()`: `packages/core/src/objects.ts`
- `Is_mbag()`: `packages/content/src/container.ts`
- `MAX_ERODE()`: `packages/core/src/types/entity.ts`
- `SPE_LIM()`: `packages/content/src/objnam_read.ts`
- `WrappingAllowed()`: `packages/content/src/breakarm.ts`, `packages/content/src/mongear.ts`
- `ammo_and_launcher()`: `packages/content/src/mthrowu.ts`
- `greatest_erosion()`: `packages/content/src/material.ts`
- `is_ammo()`: `packages/content/src/mthrowu.ts`
- `is_axe()`: `packages/content/src/mdig.ts`
- `is_blade()`: `packages/content/src/force.ts`, `packages/content/src/skills.ts`
- `is_flimsy()`: `packages/content/src/breakarm.ts`
- `is_launcher()`: `packages/content/src/mthrowu.ts`
- `is_missile()`: `packages/content/src/mthrowu.ts`
- `is_pick()`: `packages/content/src/mdig.ts`
- `is_weptool()`: `packages/content/src/material.ts`
- `matching_launcher()`: `packages/content/src/mthrowu.ts`
- `mwelded()`: `packages/content/src/mdig.ts`, `packages/content/src/mongear.ts`

## include/objclass.h

- (file): `packages/content/src/material.ts`, `packages/core/src/types/entity.ts`, `packages/core/src/types/mod.ts`
- `Is_container()`: `packages/core/src/types/mod.ts`
- `is_corrodeable()`: `packages/content/src/material.ts`
- `is_crackable()`: `packages/content/src/material.ts`
- `is_damageable()`: `packages/content/src/material.ts`
- `is_launcher()`: `packages/core/src/types/mod.ts`
- `is_metallic()`: `packages/content/src/material.ts`
- `is_organic()`: `packages/content/src/meat.ts`
- `is_rustprone()`: `packages/content/src/material.ts`
- `is_sword()`: `packages/content/src/itemactions.ts`

## include/objects.h

- (file): `packages/content/src/boulder.ts`, `packages/content/src/force.ts`, `packages/content/src/gem.ts`, `packages/content/src/objects.ts`, `packages/content/src/statuestate.ts`, `packages/content/src/stoneflesh.ts`, `packages/content/src/untrap.ts`, `packages/core/src/types/mod.ts`, `packages/testkit/src/convert/emit.ts`
- `AMULET()`: `packages/content/src/objects.ts`
- `ARMOR()`: `packages/content/src/objects.ts`
- `BOOTS()`: `packages/content/src/objects.ts`
- `BOW()`: `packages/content/src/objects.ts`
- `CLOAK()`: `packages/content/src/objects.ts`
- `COIN()`: `packages/content/src/objects.ts`
- `CONTAINER()`: `packages/content/src/container.ts`, `packages/content/src/objects.ts`
- `EYEWEAR()`: `packages/content/src/objects.ts`
- `FOOD()`: `packages/content/src/objects.ts`
- `GEM()`: `packages/content/src/objects.ts`
- `GLOVES()`: `packages/content/src/objects.ts`
- `HELM()`: `packages/content/src/objects.ts`
- `KICKING_BOOTS()`: `packages/content/src/dokick.ts`
- `OBJECT()`: `packages/content/src/objects.ts`
- `POTION()`: `packages/content/src/objects.ts`
- `POT_WATER()`: `packages/content/src/zap.ts`
- `PROJECTILE()`: `packages/content/src/objects.ts`
- `RING()`: `packages/content/src/objects.ts`
- `ROCK()`: `packages/content/src/objects.ts`
- `SCROLL()`: `packages/content/src/objects.ts`
- `SHIELD()`: `packages/content/src/objects.ts`
- `SKELETON_KEY()`: `packages/content/src/lockstate.ts`
- `SPELL()`: `packages/content/src/objects.ts`, `packages/content/src/spellcalc.ts`, `packages/content/src/zap.ts`
- `TOOL()`: `packages/content/src/objects.ts`
- `WAND()`: `packages/content/src/objects.ts`, `packages/content/src/zap.ts`
- `WEAPON()`: `packages/content/src/objects.ts`
- `WEPTOOL()`: `packages/content/src/objects.ts`

## include/permonst.h

- (file): `packages/core/src/types/mod.ts`
- `NORMAL_SPEED()`: `packages/core/src/types/entity.ts`

## include/prop.h

- (file): `packages/content/src/props.ts`, `packages/core/src/types/entity.ts`
- `LEFT_SIDE()`: `packages/content/src/legs.ts`
- `W_ACCESSORY()`: `packages/content/src/props.ts`
- `W_RINGL()`: `packages/core/src/types/entity.ts`

## include/rm.h

- (file): `packages/content/src/eshk.ts`, `packages/content/src/shopdamage.ts`, `packages/content/src/sokoban.ts`, `packages/content/src/terrain.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/terrain.ts`
- `ACCESSIBLE()`: `packages/content/src/jump.ts`
- `AM_SHRINE()`: `packages/core/src/types/level.ts`
- `D_LOCKED()`: `packages/content/src/terrain.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/terrain.ts`, `packages/core/src/types/mod.ts`
- `D_NODOOR()`: `packages/core/src/levelgen/grid.ts`
- `D_TRAPPED()`: `packages/content/src/btrapstate.ts`
- `IS_DOOR()`: `packages/content/src/fountain.ts`
- `IS_FURNITURE()`: `packages/content/src/zap.ts`
- `IS_OBSTRUCTED()`: `packages/content/src/run.ts`, `packages/content/src/terrain.ts`, `packages/core/src/levelgen/grid.ts`
- `IS_ROOM()`: `packages/content/src/monmove.ts`, `packages/content/src/shknam.ts`, `packages/content/src/shopdamage.ts`
- `IS_STWALL()`: `packages/content/src/cast.ts`, `packages/content/src/terrain.ts`
- `IS_WALL()`: `packages/content/src/terrain.ts`, `packages/core/src/levelgen/grid.ts`
- `levl()`: `packages/core/src/levelgen/grid.ts`

## include/skills.h

- (file): `packages/content/src/skills.ts`
- `P_BARE_HANDED_COMBAT()`: `packages/content/src/skills.ts`
- `P_ISRESTRICTED()`: `packages/content/src/skills.ts`
- `P_SKILL_LIMIT()`: `packages/content/src/skills.ts`
- `practice_needed_to_advance()`: `packages/content/src/skills.ts`

## include/sp_lev.h

- (file): `packages/core/src/levelgen/rect.ts`

## include/spell.h

- `MAX_SPELL_STUDY()`: `packages/content/src/spell.ts`
- `SPELL_LEV_PW()`: `packages/content/src/spellcalc.ts`

## include/stairs.h

- (file): `packages/core/src/types/level.ts`

## include/trap.h

- (file): `packages/content/src/trap.ts`, `packages/core/src/types/level.ts`, `packages/core/src/types/mod.ts`
- `Trap_Effect_Finished()`: `packages/content/src/trap.ts`
- `is_hole()`: `packages/content/src/trapstate.ts`
- `is_magical_trap()`: `packages/content/src/trap.ts`
- `is_pit()`: `packages/content/src/trapstate.ts`
- `madeby_u()`: `packages/content/src/sokoban.ts`

## include/u_init.h

- (file): `packages/content/src/kit.ts`

## include/vision.h

- `MAX_RADIUS()`: `packages/core/src/vision.ts`
- `m_canseeu()`: `packages/content/src/apparxy.ts`

## include/weight.h

- (file): `packages/content/src/stats.ts`
- `WT_ELF()`: `packages/content/src/landmine.ts`
- `WT_SQUEEZABLE_INV()`: `packages/content/src/moverock.ts`
- `WT_TOOMUCH_DIAGONAL()`: `packages/content/src/actions.ts`
- `WT_WOUNDEDLEG_REDUCT()`: `packages/content/src/stats.ts`

## include/you.h

- (file): `packages/content/src/engulfstate.ts`, `packages/content/src/gem.ts`, `packages/content/src/hero.ts`, `packages/content/src/hunger.ts`, `packages/content/src/luck.ts`, `packages/content/src/spellcalc.ts`, `packages/content/src/trapstate.ts`, `packages/content/src/uenergy.ts`, `packages/content/src/urooms.ts`, `packages/content/src/werestate.ts`
- `AC_MAX()`: `packages/content/src/stats.ts`
- `SICK_VOMITABLE()`: `packages/content/src/uhunger.ts`
- `uhis()`: `packages/content/src/gender.ts`

## include/youprop.h

- (file): `packages/content/src/invis.ts`, `packages/content/src/jump.ts`, `packages/content/src/props.ts`, `packages/content/src/trapstate.ts`, `packages/core/src/types/entity.ts`

## src/allmain.c

- (file): `packages/content/src/perception.ts`
- `age_spells()`: `packages/content/src/spell.ts`
- `interrupt_occupation()`: `packages/content/src/eat.ts`
- `makedog()`: `packages/core/src/types/mod.ts`
- `maybe_generate_rnd_mon()`: `packages/content/src/generation.ts`
- `moveloop_core()`: `packages/content/src/actions.ts`, `packages/content/src/detect.ts`, `packages/content/src/dig.ts`, `packages/content/src/hero.ts`, `packages/content/src/hunger.ts`, `packages/content/src/lock.ts`, `packages/content/src/pray.ts`, `packages/content/src/spell.ts`, `packages/content/src/trap.ts`, `packages/core/src/turn.ts`
- `newgame()`: `packages/app/src/title.ts`, `packages/core/src/engine.ts`, `packages/core/src/types/mod.ts`
- `regen_hp()`: `packages/content/src/hero.ts`
- `regen_pw()`: `packages/content/src/hero.ts`
- `stop_occupation()`: `packages/content/src/combat.ts`, `packages/content/src/digstate.ts`, `packages/content/src/eat.ts`, `packages/content/src/force.ts`, `packages/content/src/lockstate.ts`
- `u_calc_moveamt()`: `packages/content/src/stats.ts`, `packages/core/src/types/mod.ts`
- `u_on_upstairs()`: `packages/core/src/engine.ts`
- `welcome()`: `packages/core/src/host.ts`

## src/apply.c

- (file): `packages/content/src/apply.en.ts`, `packages/content/src/jump.ts`
- `broken_wand_explode()`: `packages/content/src/breakwand.ts`
- `catch_lit()`: `packages/content/src/light.ts`
- `check_jump()`: `packages/content/src/jump.ts`
- `discard_broken_wand()`: `packages/content/src/breakwand.ts`
- `display_jump_positions()`: `packages/content/src/jump.ts`
- `do_break_wand()`: `packages/content/src/breakwand.ts`
- `doapply()`: `packages/content/src/apply.ts`
- `dojump()`: `packages/content/src/jump.ts`
- `get_valid_jump_position()`: `packages/content/src/jump.ts`
- `is_valid_jump_pos()`: `packages/content/src/jump.en.ts`, `packages/content/src/jump.ts`
- `jump()`: `packages/content/src/cast.ts`, `packages/content/src/jump.en.ts`, `packages/content/src/jump.ts`
- `magic_whistled()`: `packages/content/src/apply.ts`
- `snuff_lit()`: `packages/content/src/light.ts`
- `splash_lit()`: `packages/content/src/erode.en.ts`, `packages/content/src/water.ts`
- `um_dist()`: `packages/content/src/shkpay.ts`
- `use_lamp()`: `packages/content/src/light.ts`
- `use_magic_whistle()`: `packages/content/src/apply.ts`
- `use_whistle()`: `packages/content/src/apply.ts`

## src/artifact.c

- `confers_luck()`: `packages/content/src/gem.ts`

## src/attrib.c

- (file): `packages/content/src/resist.en.ts`
- `acurr()`: `packages/content/src/attrib.ts`
- `acurrstr()`: `packages/content/src/stats.ts`
- `adjabil()`: `packages/content/src/props.ts`
- `adjalign()`: `packages/content/src/luck.ts`
- `adjattrib()`: `packages/content/src/attrib.ts`, `packages/content/src/hero.ts`
- `change_luck()`: `packages/content/src/luck.ts`
- `extremeattr()`: `packages/content/src/jewelry.ts`
- `gainstr()`: `packages/content/src/attrib.ts`
- `init_attr()`: `packages/content/src/hero.ts`
- `init_attr_role_redist()`: `packages/content/src/hero.ts`
- `losestr()`: `packages/content/src/hp.ts`
- `minusattr()`: `packages/content/src/resist.en.ts`
- `newhp()`: `packages/content/src/hero.ts`
- `plusattr()`: `packages/content/src/resist.en.ts`
- `poisoned()`: `packages/content/src/attrib.ts`, `packages/content/src/resist.en.ts`
- `poisontell()`: `packages/content/src/attrib.ts`, `packages/content/src/resist.en.ts`
- `rnd_attr()`: `packages/content/src/hero.ts`
- `set_moreluck()`: `packages/content/src/gem.ts`
- `stone_luck()`: `packages/content/src/gem.ts`
- `val_abil()`: `packages/content/src/props.ts`, `packages/content/src/resist.en.ts`, `packages/content/src/stats.ts`
- `vary_init_attr()`: `packages/content/src/hero.ts`

## src/ball.c

- `litter()`: `packages/content/src/shkdamage.ts`

## src/botl.c

- (file): `packages/content/src/props.ts`, `packages/content/src/stats.ts`, `packages/core/src/types/mod.ts`, `packages/core/src/view.ts`, `packages/ui/src/status.ts`
- `BL_MASK_LEV()`: `packages/content/src/levitation.ts`
- `bl_stone()`: `packages/content/src/stoning.ts`
- `bl_strngl()`: `packages/content/src/jewelry.ts`
- `bot2()`: `packages/content/src/hero.ts`
- `get_strength_str()`: `packages/ui/src/status.ts`

## src/cmd.c

- (file): `packages/app/src/keys.ts`, `packages/content/src/actions.ts`, `packages/content/src/quit.ts`, `packages/content/src/wizard/index.ts`, `packages/ui/src/host.ts`
- `NHKF_GETPOS_VALID_NEXT()`: `packages/ui/src/getpos.ts`
- `commands_init()`: `packages/app/src/keys.ts`
- `confdir()`: `packages/content/src/dig.ts`, `packages/content/src/hackmove.ts`
- `do_run()`: `packages/content/src/run.ts`
- `do_rush()`: `packages/content/src/run.ts`
- `dokeylist()`: `packages/ui/src/help.ts`
- `donull()`: `packages/content/src/actions.ts`
- `dotravel()`: `packages/content/src/travel.ts`
- `extcmdlist()`: `packages/app/src/keys.ts`
- `getdir()`: `packages/content/src/dig.ts`, `packages/content/src/dokick.ts`, `packages/content/src/hackmove.ts`, `packages/content/src/zap.ts`
- `set_move_cmd()`: `packages/content/src/run.ts`
- `set_occupation()`: `packages/content/src/force.ts`
- `xytodir()`: `packages/content/src/trapstate.ts`

## src/decl.c

- `c_obj_colors()`: `packages/content/src/chesttrap.ts`
- `dirs_ord()`: `packages/content/src/hackmove.ts`, `packages/content/src/travel.ts`
- `x_maze_max()`: `packages/core/src/levelgen/spdef.ts`
- `xdir()`: `packages/content/src/priest.ts`, `packages/content/src/trapstate.ts`
- `ydir()`: `packages/content/src/priest.ts`, `packages/content/src/trapstate.ts`

## src/detect.c

- (file): `packages/content/src/zap.en.ts`
- `cvt_sdoor_to_door()`: `packages/content/src/actions.ts`
- `do_mapping()`: `packages/content/src/wizard/map.ts`
- `do_vicinity_map()`: `packages/content/src/detect.ts`
- `dosearch0()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `findit()`: `packages/content/src/zap.ts`
- `findone()`: `packages/content/src/zap.ts`
- `mfind0()`: `packages/content/src/actions.ts`
- `monster_detect()`: `packages/content/src/cast.ts`, `packages/content/src/detect.ts`
- `premap_detect()`: `packages/content/src/detect.ts`
- `show_map_spot()`: `packages/content/src/detect.ts`, `packages/content/src/wizard/map.ts`
- `skip_premap_detect()`: `packages/content/src/detect.ts`

## src/dig.c

- (file): `packages/content/src/dig.ts`
- `DIGTYP_()`: `packages/content/src/dig.ts`
- `adj_pit_checks()`: `packages/content/src/dig.ts`
- `ceiling()`: `packages/content/src/read.ts`
- `dig()`: `packages/content/src/dig.ts`, `packages/content/src/mdig.ts`
- `dig_check()`: `packages/content/src/dig.ts`
- `dig_typ()`: `packages/content/src/dig.ts`
- `digactualhole()`: `packages/content/src/dig.en.ts`, `packages/content/src/dig.ts`
- `digcheck_fail_message()`: `packages/content/src/dig.ts`
- `dighole()`: `packages/content/src/dig.en.ts`, `packages/content/src/dig.ts`
- `draft_message()`: `packages/content/src/mdig.ts`
- `furniture_handled()`: `packages/content/src/dig.ts`
- `holetime()`: `packages/content/src/shkdamage.ts`
- `is_digging()`: `packages/content/src/digstate.ts`
- `mdig_tunnel()`: `packages/content/src/mdig.ts`
- `pick_can_reach()`: `packages/content/src/dig.ts`
- `rot_corpse()`: `packages/content/src/corpses.ts`
- `use_pick_axe()`: `packages/content/src/dig.ts`
- `use_pick_axe2()`: `packages/content/src/dig.ts`
- `watch_dig()`: `packages/content/src/watch.ts`
- `watchman_canseeu()`: `packages/content/src/watch.ts`
- `zap_dig()`: `packages/content/src/dig.en.ts`, `packages/content/src/dig.ts`

## src/display.c

- (file): `packages/content/src/boulder.ts`, `packages/content/src/invis.ts`, `packages/content/src/perception.ts`, `packages/core/src/perception.ts`, `packages/core/src/types/mod.ts`, `packages/render-ascii/src/renderer.ts`
- `GLYPH_INVISIBLE()`: `packages/content/src/invis.ts`
- `canseemon()`: `packages/content/src/trap.ts`
- `display_self()`: `packages/core/src/types/mod.ts`, `packages/core/src/view.ts`
- `magic_map_background()`: `packages/content/src/wizard/map.ts`
- `map_glyphinfo()`: `packages/content/src/statuestate.ts`
- `map_invisible()`: `packages/content/src/invis.ts`, `packages/core/src/memory.ts`, `packages/render-ascii/src/renderer.ts`
- `map_object()`: `packages/core/src/engine.ts`
- `map_trap()`: `packages/core/src/view.ts`
- `mon_visible()`: `packages/core/src/perception.ts`
- `newsym()`: `packages/content/src/perception.ts`, `packages/core/src/engine.ts`, `packages/core/src/memory.ts`, `packages/core/src/perception.ts`
- `swallowed()`: `packages/content/src/perception.ts`, `packages/ui/src/host.ts`
- `tmp_at()`: `packages/core/src/types/event.ts`
- `unmap_invisible()`: `packages/core/src/memory.ts`
- `zapdir_to_glyph()`: `packages/ui/src/host.ts`

## src/display.h

- `canspotmon()`: `packages/content/src/perception.ts`, `packages/core/src/query.ts`
- `canspotself()`: `packages/core/src/types/mod.ts`
- `mon_visible()`: `packages/core/src/types/mod.ts`

## src/do.c

- (file): `packages/content/src/align.ts`, `packages/content/src/itemactions.ts`
- `canletgo()`: `packages/content/src/itemactions.ts`
- `doaltarobj()`: `packages/content/src/align.en.ts`, `packages/content/src/itemactions.ts`
- `doddrop()`: `packages/content/src/itemactions.ts`
- `dodown()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `dodrop()`: `packages/content/src/itemactions.ts`
- `dotrap()`: `packages/content/src/trap.ts`
- `doup()`: `packages/content/src/actions.ts`
- `drop()`: `packages/content/src/itemactions.ts`
- `dropx()`: `packages/content/src/itemactions.ts`, `packages/content/src/items.ts`
- `dropz()`: `packages/content/src/itemactions.ts`, `packages/content/src/items.ts`
- `engulfer_digests_food()`: `packages/content/src/digestfood.ts`
- `flooreffects()`: `packages/content/src/align.ts`, `packages/content/src/flooreffects.ts`
- `goto_level()`: `packages/content/src/actions.ts`, `packages/content/src/lock.ts`, `packages/content/src/rooms.ts`, `packages/content/src/shkdamage.ts`, `packages/content/src/trap.ts`, `packages/core/src/engine.ts`
- `heal_legs()`: `packages/content/src/props.ts`
- `legs_in_no_shape()`: `packages/content/src/legs.ts`
- `maybe_reset_pick()`: `packages/content/src/lock.ts`
- `menu_drop()`: `packages/content/src/itemactions.ts`
- `mnexto()`: `packages/core/src/engine.ts`
- `reset_utrap()`: `packages/content/src/trap.ts`
- `revive_corpse()`: `packages/content/src/revive.ts`, `packages/content/src/zap.en.ts`
- `revive_mon()`: `packages/content/src/revive.ts`, `packages/content/src/zap.en.ts`
- `set_wounded_legs()`: `packages/content/src/legs.ts`
- `u_on_newpos()`: `packages/core/src/engine.ts`
- `u_stuck_cannot_go()`: `packages/content/src/actions.ts`
- `uescaped_shaft()`: `packages/content/src/trap.ts`
- `uteetering_at_seen_pit()`: `packages/content/src/trap.ts`

## src/do_name.c

- (file): `packages/content/src/dig.en.ts`
- `docall()`: `packages/content/src/call.ts`
- `docall_xname()`: `packages/content/src/call.ts`
- `docallcmd()`: `packages/content/src/call.ts`
- `mhim()`: `packages/content/src/read.ts`
- `mon_nam()`: `packages/content/src/perception.ts`
- `objtyp_is_callable()`: `packages/content/src/call.ts`
- `rndmonnam()`: `packages/content/src/perception.ts`
- `some_mon_nam()`: `packages/content/src/perception.ts`
- `surface()`: `packages/content/src/moverock.ts`, `packages/content/src/terrain.ts`
- `x_monnam()`: `packages/content/src/perception.ts`

## src/do_wear.c

- (file): `packages/content/src/invis.ts`, `packages/content/src/itemactions.ts`
- `Amulet_off()`: `packages/content/src/jewelry.ts`
- `Amulet_on()`: `packages/content/src/jewelry.ts`
- `Blindf_off()`: `packages/content/src/jewelry.ts`
- `Blindf_on()`: `packages/content/src/jewelry.ts`, `packages/testkit/src/invariants.ts`
- `Cloak_off()`: `packages/content/src/invis.ts`
- `Cloak_on()`: `packages/content/src/invis.ts`
- `Ring_gone()`: `packages/content/src/jewelry.ts`
- `Ring_off()`: `packages/content/src/jewelry.ts`
- `Ring_off_or_gone()`: `packages/content/src/jewelry.ts`
- `Ring_on()`: `packages/content/src/jewelry.ts`, `packages/content/src/props.ts`
- `accessory_or_armor_on()`: `packages/content/src/jewelry.en.ts`, `packages/content/src/jewelry.ts`
- `adjust_attrib()`: `packages/content/src/jewelry.ts`
- `armor_or_accessory_off()`: `packages/content/src/jewelry.ts`
- `c_cloak()`: `packages/content/src/itemactions.ts`
- `canwearobj()`: `packages/content/src/itemactions.ts`
- `cursed()`: `packages/content/src/itemactions.ts`, `packages/content/src/jewelry.ts`
- `doputon()`: `packages/content/src/jewelry.ts`
- `doremring()`: `packages/content/src/jewelry.ts`
- `dotakeoff()`: `packages/content/src/itemactions.ts`
- `dowear()`: `packages/content/src/itemactions.ts`
- `equip_ok()`: `packages/content/src/itemactions.ts`
- `find_ac()`: `packages/content/src/props.ts`, `packages/content/src/stats.ts`
- `freehand()`: `packages/content/src/pray.ts`
- `hard_helmet()`: `packages/content/src/read.ts`, `packages/content/src/trap.ts`
- `learnring()`: `packages/content/src/jewelry.ts`
- `select_off()`: `packages/content/src/jewelry.en.ts`
- `some_armor()`: `packages/content/src/adtyping.ts`, `packages/content/src/read.ts`
- `toggle_stealth()`: `packages/content/src/jewelry.ts`
- `ureflects()`: `packages/content/src/uhitm_passive.ts`

## src/dog.c

- (file): `packages/content/src/dog.en.ts`
- `abuse_dog()`: `packages/content/src/dog.ts`
- `dogfood()`: `packages/content/src/dog.ts`
- `initedog()`: `packages/content/src/dog.ts`
- `keepdogs()`: `packages/content/src/dog.ts`, `packages/core/src/types/mod.ts`, `packages/testkit/src/soak.ts`
- `losedogs()`: `packages/content/src/dog.ts`, `packages/content/src/shk.ts`, `packages/core/src/types/mod.ts`
- `makedog()`: `packages/content/src/dog.ts`
- `migrate_to_level()`: `packages/content/src/migrate.ts`
- `mon_arrive()`: `packages/content/src/dog.ts`
- `mon_catchup_elapsed_time()`: `packages/content/src/dog.ts`, `packages/content/src/mstate.ts`
- `newedog()`: `packages/content/src/dog.ts`
- `tamedog()`: `packages/content/src/dog.ts`

## src/dogmove.c

- (file): `packages/content/src/dog.en.ts`
- `can_reach_location()`: `packages/content/src/dogmove.ts`
- `dog_eat()`: `packages/content/src/dogmove.ts`, `packages/content/src/monflee.ts`
- `dog_goal()`: `packages/content/src/dogmove.ts`
- `dog_hunger()`: `packages/content/src/dogmove.ts`
- `dog_invent()`: `packages/content/src/dogmove.ts`
- `dog_move()`: `packages/content/src/dogmove.ts`
- `dog_nutrition()`: `packages/content/src/dogmove.ts`
- `dog_starve()`: `packages/content/src/dogmove.ts`
- `droppables()`: `packages/content/src/dogmove.ts`

## src/dokick.c

- (file): `packages/content/src/kick.en.ts`, `packages/content/src/stonetouch.ts`
- `dokick()`: `packages/content/src/dokick.ts`
- `flyingcoinmsg()`: `packages/content/src/kick.en.ts`
- `ghitm()`: `packages/content/src/dokick.ts`
- `kick_door()`: `packages/content/src/dokick.ts`, `packages/content/src/watch.ts`
- `kick_dumb()`: `packages/content/src/dokick.ts`
- `kick_monster()`: `packages/content/src/dokick.ts`
- `kick_nondoor()`: `packages/content/src/dokick.ts`
- `kick_object()`: `packages/content/src/dokick.ts`
- `kick_ouch()`: `packages/content/src/dokick.ts`
- `kickdmg()`: `packages/content/src/dog.ts`, `packages/content/src/dokick.ts`
- `kickstr()`: `packages/content/src/dokick.ts`
- `martial()`: `packages/content/src/dokick.ts`
- `maybe_kick_monster()`: `packages/content/src/dokick.ts`
- `really_kick_object()`: `packages/content/src/dokick.ts`

## src/dothrow.c

- (file): `packages/content/src/jump.en.ts`
- `breakmsg()`: `packages/content/src/scatter.ts`
- `breakobj()`: `packages/content/src/scatter.ts`
- `breaks()`: `packages/content/src/scatter.ts`
- `breaktest()`: `packages/content/src/dokick.ts`, `packages/content/src/material.ts`
- `check_shop_obj()`: `packages/content/src/shk.ts`
- `dofire()`: `packages/content/src/fire.ts`
- `dothrow()`: `packages/content/src/dothrow.ts`
- `hero_breaks()`: `packages/content/src/dokick.ts`
- `hitfloor()`: `packages/content/src/dothrow.ts`
- `hurtle_jump()`: `packages/content/src/jump.ts`
- `multishot_class_bonus()`: `packages/content/src/dothrow.ts`
- `omon_adj()`: `packages/content/src/mthrowu.ts`
- `should_mulch_missile()`: `packages/content/src/mthrowu.ts`
- `thitmonst()`: `packages/content/src/dothrow.ts`
- `throw_obj()`: `packages/content/src/dothrow.ts`, `packages/content/src/fire.ts`, `packages/content/src/mthrowu.en.ts`, `packages/content/src/stonetouch.ts`
- `throwing_weapon()`: `packages/content/src/dothrow.ts`
- `throwit()`: `packages/content/src/dothrow.ts`, `packages/content/src/mthrowu.en.ts`
- `tmiss()`: `packages/content/src/dothrow.ts`
- `tmp_at()`: `packages/content/src/dothrow.ts`
- `walk_path()`: `packages/content/src/jump.ts`

## src/drawing.c

- `DEF_INVISIBLE()`: `packages/content/src/invis.ts`
- `def_warnsyms()`: `packages/content/src/messages.en.ts`, `packages/content/src/perception.ts`

## src/dungeon.c

- `Can_dig_down()`: `packages/content/src/levelflags.ts`
- `Can_fall_thru()`: `packages/content/src/trap.ts`
- `Is_botlevel()`: `packages/core/src/levelgen/generate.ts`
- `Is_branchlev()`: `packages/core/src/dungeon.ts`
- `chr_u_on_lvl()`: `packages/content/src/wizard/where.ts`
- `deepest_lev_reached()`: `packages/content/src/urexp.ts`
- `depth()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/level.ts`
- `get_level()`: `packages/content/src/teleport.ts`
- `init_dungeon_dungeons()`: `packages/core/src/dungeon.ts`
- `init_dungeon_set_depth()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `init_dungeon_set_entry()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `init_dungeons()`: `packages/core/src/types/mod.ts`
- `init_level()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `ledger_no()`: `packages/content/src/gem.ts`
- `level_range()`: `packages/core/src/dungeon.ts`, `packages/core/src/registry.ts`, `packages/core/src/types/mod.ts`
- `parent_dlevel()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `pick_level()`: `packages/core/src/dungeon.ts`
- `place_level()`: `packages/core/src/dungeon.ts`
- `possible_places()`: `packages/core/src/dungeon.ts`
- `print_branch()`: `packages/content/src/wizard/where.ts`
- `print_dungeon()`: `packages/content/src/wizard/where.ts`, `packages/content/src/wizard/wizard.en.ts`
- `u_on_newpos()`: `packages/content/src/actions.ts`
- `u_on_rndspot()`: `packages/core/src/types/mod.ts`

## src/eat.c

- (file): `packages/content/src/eat.en.ts`, `packages/content/src/resist.en.ts`, `packages/core/src/types/entity.ts`
- `adj_victual_nutrition()`: `packages/content/src/eat.ts`
- `bite()`: `packages/content/src/eat.ts`
- `choke()`: `packages/content/src/eat.ts`
- `consume_oeaten()`: `packages/content/src/eat.ts`
- `corpse_intrinsic()`: `packages/content/src/givit.ts`
- `cpostfx()`: `packages/content/src/eat.ts`, `packages/content/src/givit.ts`
- `cprefx()`: `packages/content/src/eat.ts`
- `do_reset_eat()`: `packages/content/src/eat.ts`
- `doeat()`: `packages/content/src/eat.ts`
- `done_eating()`: `packages/content/src/eat.ts`
- `eatcorpse()`: `packages/content/src/eat.en.ts`, `packages/content/src/eat.ts`
- `eaten_stat()`: `packages/content/src/dogmove.ts`, `packages/content/src/items.ts`
- `eatfood()`: `packages/content/src/eat.ts`
- `eye_of_newt_buzz()`: `packages/content/src/givit.ts`
- `fix_petrification()`: `packages/content/src/stonestate.ts`
- `food_disappears()`: `packages/content/src/corpses.ts`, `packages/content/src/revive.ts`
- `food_xname()`: `packages/content/src/eat.ts`
- `fpostfx()`: `packages/content/src/eat.ts`
- `fprefx()`: `packages/content/src/eat.ts`
- `gethungry()`: `packages/content/src/hunger.ts`
- `givit()`: `packages/content/src/givit.ts`, `packages/content/src/resist.en.ts`
- `hu_stat()`: `packages/content/src/enlightenment.ts`
- `init_uhunger()`: `packages/content/src/uhunger.ts`
- `intrinsic_possible()`: `packages/content/src/givit.ts`
- `lesshungry()`: `packages/content/src/hunger.ts`
- `maybe_cannibal()`: `packages/content/src/eat.ts`
- `maybe_finished_meal()`: `packages/content/src/eat.ts`
- `morehungry()`: `packages/content/src/hunger.ts`
- `newuhs()`: `packages/content/src/eat.en.ts`, `packages/content/src/hunger.ts`, `packages/testkit/src/scenario.ts`
- `nonrotting_corpse()`: `packages/content/src/eat.ts`
- `obj_nutrition()`: `packages/content/src/eat.ts`, `packages/content/src/items.ts`
- `reset_eat()`: `packages/content/src/eat.ts`
- `rottenfood()`: `packages/content/src/eat.en.ts`, `packages/content/src/eat.ts`
- `should_givit()`: `packages/content/src/givit.ts`
- `start_eating()`: `packages/content/src/eat.ts`
- `status_enlightenment()`: `packages/content/src/enlightenment.ts`
- `temp_givit()`: `packages/content/src/givit.ts`
- `touchfood()`: `packages/content/src/eat.ts`
- `unfaint()`: `packages/content/src/hunger.ts`
- `vomit()`: `packages/content/src/hunger.ts`

## src/end.c

- (file): `packages/content/src/disclose.ts`
- `container_contents()`: `packages/content/src/disclose.ts`
- `delayed_killer()`: `packages/content/src/stonestate.ts`
- `disclose()`: `packages/content/src/disclose.ts`, `packages/content/src/end.en.ts`, `packages/core/src/types/event.ts`, `packages/ui/src/gameover.ts`
- `done()`: `packages/content/src/end.ts`, `packages/content/src/endstate.ts`, `packages/content/src/quit.ts`, `packages/content/src/wizard/die.ts`
- `done2()`: `packages/content/src/end.en.ts`, `packages/content/src/quit.ts`
- `done_in_by()`: `packages/content/src/mhitu.ts`
- `ends()`: `packages/content/src/end.en.ts`
- `get_valuables()`: `packages/content/src/urexp.ts`
- `really_done()`: `packages/app/src/main.ts`, `packages/app/src/scores.ts`, `packages/content/src/disclose.ts`, `packages/content/src/end.en.ts`, `packages/content/src/endstate.ts`, `packages/content/src/urexp.ts`, `packages/ui/src/gameover.ts`
- `savelife()`: `packages/content/src/end.ts`, `packages/content/src/engulf.ts`
- `should_query_disclose_option()`: `packages/ui/src/gameover.ts`

## src/engrave.c

- (file): `packages/content/src/levitation.ts`
- `can_reach_floor()`: `packages/content/src/levitation.ts`

## src/exper.c

- (file): `packages/content/src/magic.ts`, `packages/content/src/urexp.ts`
- `enermod()`: `packages/content/src/hero.ts`
- `experience()`: `packages/content/src/hero.ts`
- `losexp()`: `packages/content/src/exper.ts`, `packages/content/src/were.en.ts`, `packages/content/src/wizard/levelchange.ts`
- `more_experienced()`: `packages/content/src/hero.ts`, `packages/content/src/urexp.ts`
- `newexplevel()`: `packages/content/src/hero.ts`
- `newpw()`: `packages/content/src/hero.ts`
- `newuexp()`: `packages/content/src/hero.ts`
- `pluslvl()`: `packages/content/src/hero.ts`, `packages/content/src/were.en.ts`, `packages/content/src/wizard/levelchange.ts`

## src/explode.c

- `adtyp_to_expltype()`: `packages/content/src/explode.ts`
- `explode()`: `packages/content/src/explode.ts`, `packages/core/src/types/event.ts`
- `explosion()`: `packages/ui/src/host.ts`
- `explosionmask()`: `packages/content/src/explode.ts`
- `mon_explodes()`: `packages/content/src/explode.ts`
- `scatter()`: `packages/content/src/boulder.en.ts`, `packages/content/src/scatter.ts`

## src/fountain.c

- (file): `packages/content/src/fountain.ts`
- `breaksink()`: `packages/content/src/fountain.en.ts`, `packages/content/src/fountain.ts`
- `dipfountain()`: `packages/content/src/fountain.ts`
- `dofindgem()`: `packages/content/src/fountain.ts`
- `dogushforth()`: `packages/content/src/fountain.ts`
- `dowaternymph()`: `packages/content/src/fountain.ts`
- `dowatersnakes()`: `packages/content/src/fountain.en.ts`, `packages/content/src/fountain.ts`
- `drinkfountain()`: `packages/content/src/fountain.en.ts`, `packages/content/src/fountain.ts`
- `dryup()`: `packages/content/src/fountain.ts`
- `floating_above()`: `packages/content/src/levitation.ts`, `packages/content/src/trap.en.ts`
- `gush()`: `packages/content/src/fountain.ts`
- `wash_hands()`: `packages/content/src/fountain.ts`
- `watchman_warn_fountain()`: `packages/content/src/watch.ts`

## src/getpos.c

- `gather_locs()`: `packages/ui/src/getpos.ts`
- `gather_locs_interesting()`: `packages/app/src/keys.ts`, `packages/ui/src/getpos.ts`
- `getpos()`: `packages/content/src/getpos.ts`, `packages/ui/src/getpos.ts`, `packages/ui/src/host.ts`
- `getpos_sethilite()`: `packages/content/src/getpos.ts`
- `truncate_to_map()`: `packages/ui/src/getpos.ts`

## src/hack.c

- (file): `packages/content/src/dog.en.ts`, `packages/content/src/eshk.ts`, `packages/content/src/shk.en.ts`
- `avoid_trap_andor_region()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `bad_rock()`: `packages/content/src/actions.ts`, `packages/content/src/boulder.ts`, `packages/content/src/monmove.ts`
- `calc_capacity()`: `packages/content/src/stats.ts`
- `cannot_push()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `cannot_push_msg()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `check_capacity()`: `packages/content/src/magic.ts`
- `check_special_room()`: `packages/content/src/rooms.ts`, `packages/content/src/zoo.ts`
- `closed_door()`: `packages/content/src/actions.ts`, `packages/core/src/movement.ts`
- `could_move_onto_boulder()`: `packages/content/src/moverock.ts`
- `distmin()`: `packages/content/src/zoo.ts`
- `domove()`: `packages/content/src/actions.ts`, `packages/content/src/combat.ts`, `packages/content/src/travel.ts`
- `domove_core()`: `packages/content/src/actions.ts`, `packages/content/src/run.ts`, `packages/content/src/travel.ts`
- `domove_fight_empty()`: `packages/content/src/actions.ts`
- `domove_fight_web()`: `packages/content/src/actions.ts`, `packages/content/src/trap.en.ts`, `packages/content/src/web.ts`
- `domove_swap_with_pet()`: `packages/content/src/actions.ts`
- `dopush()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `escape_from_sticky_mon()`: `packages/content/src/hackmove.ts`, `packages/content/src/resist.en.ts`
- `findtravelpath()`: `packages/content/src/travel.ts`
- `hcolor()`: `packages/content/src/hcolor.ts`
- `hcolors()`: `packages/content/src/hcolor.ts`
- `impaired_movement()`: `packages/content/src/hackmove.ts`
- `in_rooms()`: `packages/content/src/shopdamage.ts`, `packages/content/src/urooms.ts`, `packages/core/src/rooms.ts`
- `in_town()`: `packages/core/src/rooms.ts`
- `inv_weight()`: `packages/content/src/stats.ts`
- `lookaround()`: `packages/content/src/run.ts`, `packages/content/src/travel.ts`
- `losehp()`: `packages/content/src/hp.ts`
- `may_dig()`: `packages/content/src/mdig.ts`
- `money_cnt()`: `packages/content/src/stats.ts`
- `monster_nearby()`: `packages/content/src/eat.ts`
- `move_update()`: `packages/content/src/rooms.ts`, `packages/content/src/urooms.ts`
- `moverock()`: `packages/content/src/landmine.ts`, `packages/content/src/moverock.ts`, `packages/content/src/rollboulder.ts`, `packages/content/src/trap.en.ts`
- `moverock_core()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `movobj()`: `packages/content/src/moverock.ts`
- `near_capacity()`: `packages/content/src/stats.ts`
- `nomul()`: `packages/content/src/combat.ts`, `packages/content/src/nomul.ts`, `packages/core/src/types/entity.ts`
- `overexertion()`: `packages/content/src/combat.ts`
- `pickup_checks()`: `packages/content/src/itemactions.ts`
- `rounddiv()`: `packages/content/src/eat.ts`
- `runmode_delay_output()`: `packages/app/src/options.ts`
- `spoteffects()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `squeezeablylightinvent()`: `packages/content/src/moverock.ts`
- `test_move()`: `packages/content/src/actions.ts`, `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`, `packages/content/src/run.ts`, `packages/content/src/travel.ts`, `packages/core/src/movement.ts`, `packages/core/src/path.ts`
- `trapmove()`: `packages/content/src/trap.ts`
- `u_maybe_impaired()`: `packages/content/src/hackmove.ts`
- `unconscious()`: `packages/content/src/btrapped.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/mcastu.ts`, `packages/content/src/mdig.ts`
- `unmul()`: `packages/content/src/nomul.ts`
- `weight_cap()`: `packages/content/src/stats.ts`
- `xdir()`: `packages/content/src/scatter.ts`
- `ydir()`: `packages/content/src/scatter.ts`

## src/hacklib.c

- `fuzzymatch()`: `packages/content/src/objnam_read.ts`
- `isqrt()`: `packages/content/src/spellcalc.ts`
- `mungspaces()`: `packages/content/src/objnam_read.ts`
- `night()`: `packages/content/src/adtyping.ts`, `packages/content/src/were.ts`
- `online2()`: `packages/content/src/monmove.ts`
- `ordin()`: `packages/app/src/scores.ts`
- `sgn()`: `packages/content/src/shk.ts`

## src/include/mondata.h

- `nonliving()`: `packages/content/src/hmon.ts`

## src/insight.c

- `N_times()`: `packages/content/src/end.en.ts`, `packages/content/src/vanquished.ts`
- `align_str()`: `packages/content/src/align.ts`
- `enlght_combatinc()`: `packages/content/src/enlightenment.ts`
- `enlightenment()`: `packages/content/src/enlightenment.ts`
- `list_vanquished()`: `packages/content/src/disclose.ts`, `packages/content/src/end.en.ts`, `packages/content/src/vanquished.ts`
- `mstatusline()`: `packages/content/src/zap.ts`
- `piousness()`: `packages/content/src/enlightenment.ts`
- `status_enlightenment()`: `packages/content/src/enlightenment.en.ts`, `packages/content/src/enlightenment.ts`
- `ustatusline()`: `packages/content/src/zap.ts`
- `vanqsort_cmp()`: `packages/content/src/vanquished.ts`

## src/invent.c

- (file): `packages/content/src/magic.ts`, `packages/content/src/read.ts`, `packages/content/src/wish.ts`
- `addinv()`: `packages/content/src/items.ts`
- `addinv_core0()`: `packages/content/src/items.ts`
- `assigninvlet()`: `packages/content/src/items.ts`
- `carrying()`: `packages/content/src/gem.ts`, `packages/content/src/shk.ts`
- `count_contents()`: `packages/content/src/shk.ts`
- `count_unpaid()`: `packages/content/src/price.ts`
- `def_inv_order()`: `packages/content/src/itemactions.ts`
- `dfeature_at()`: `packages/content/src/itemactions.ts`
- `display_inventory()`: `packages/content/src/disclose.ts`
- `display_pickinv()`: `packages/content/src/wizard/identify.ts`
- `findgold()`: `packages/content/src/mongear.ts`
- `freeinv()`: `packages/content/src/items.ts`
- `hold_another_object()`: `packages/content/src/wish.ts`
- `identify()`: `packages/content/src/read.ts`
- `identify_pack()`: `packages/content/src/read.ts`
- `inv_cnt()`: `packages/content/src/items.ts`, `packages/content/src/steal.ts`
- `look_here()`: `packages/content/src/itemactions.ts`, `packages/content/src/items.en.ts`
- `m_carrying()`: `packages/content/src/mdig.ts`
- `m_useup()`: `packages/content/src/erode.ts`
- `menu_identify()`: `packages/content/src/read.ts`
- `mergable()`: `packages/content/src/items.ts`
- `merged()`: `packages/content/src/items.ts`
- `money_cnt()`: `packages/content/src/money.ts`
- `prinv()`: `packages/content/src/itemactions.ts`
- `set_cknown_lknown()`: `packages/content/src/read.ts`
- `sobj_at()`: `packages/content/src/boulder.ts`
- `splitobj()`: `packages/content/src/items.ts`
- `stackobj()`: `packages/content/src/items.ts`
- `useup()`: `packages/content/src/eat.ts`, `packages/content/src/erode.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/magic.ts`
- `useupall()`: `packages/content/src/magic.ts`
- `useupf()`: `packages/content/src/eat.ts`
- `xprname()`: `packages/content/src/itemactions.ts`

## src/light.c

- (file): `packages/core/src/types/mod.ts`
- `do_light_sources()`: `packages/content/src/light.ts`, `packages/core/src/perception.ts`, `packages/core/src/types/mod.ts`, `packages/core/src/vision.ts`
- `new_light_source()`: `packages/content/src/light.ts`

## src/lock.c

- (file): `packages/content/src/lockstate.ts`
- `autokey()`: `packages/content/src/lock.ts`
- `boxlock()`: `packages/content/src/zap.en.ts`, `packages/content/src/zap.ts`
- `breakchestlock()`: `packages/content/src/force.ts`
- `chest_shatter_msg()`: `packages/content/src/force.ts`
- `doforce()`: `packages/content/src/force.ts`
- `doopen()`: `packages/content/src/actions.ts`
- `doopen_indir()`: `packages/content/src/actions.ts`
- `doorlock()`: `packages/content/src/zap.en.ts`, `packages/content/src/zap.ts`
- `forcelock()`: `packages/content/src/force.ts`
- `lock_action()`: `packages/content/src/lock.en.ts`, `packages/content/src/lock.ts`, `packages/content/src/lockstate.ts`
- `maybe_reset_pick()`: `packages/content/src/lock.ts`
- `obstructed()`: `packages/content/src/zap.ts`
- `pick_lock()`: `packages/content/src/lock.en.ts`, `packages/content/src/lock.ts`
- `picking_lock()`: `packages/content/src/lockstate.ts`
- `picklock()`: `packages/content/src/lock.en.ts`, `packages/content/src/lock.ts`
- `reset_pick()`: `packages/content/src/lock.ts`
- `u_have_forceable_weapon()`: `packages/content/src/force.ts`

## src/makemon.c

- `adj_lev()`: `packages/content/src/generation.ts`
- `align_shift()`: `packages/content/src/generation.ts`
- `clone_mon()`: `packages/content/src/clone.ts`
- `create_critters()`: `packages/content/src/zap.ts`
- `grow_up()`: `packages/content/src/mhitm.ts`
- `init_mongen_order()`: `packages/content/src/generation.ts`
- `little_to_big()`: `packages/content/src/mhitm.ts`
- `m_initgrp()`: `packages/content/src/generation.ts`
- `m_initinv()`: `packages/content/src/mongear.ts`
- `m_initthrow()`: `packages/content/src/mongear.ts`
- `m_initweap()`: `packages/content/src/mongear.ts`
- `makemon()`: `packages/content/src/generation.ts`, `packages/content/src/mkobj.ts`, `packages/content/src/mongear.ts`
- `makemon_rnd_goodpos()`: `packages/content/src/generation.ts`
- `mkclass()`: `packages/content/src/generation.ts`
- `mkclass_aligned()`: `packages/content/src/generation.ts`
- `mkmonmoney()`: `packages/content/src/mongear.ts`
- `mongets()`: `packages/content/src/mongear.ts`
- `newmonhp()`: `packages/content/src/generation.ts`
- `peace_minded()`: `packages/content/src/generation.ts`
- `rndmonst_adj()`: `packages/content/src/generation.ts`
- `set_malign()`: `packages/content/src/luck.ts`
- `uncommon()`: `packages/content/src/generation.ts`

## src/mcastu.c

- (file): `packages/content/src/mcastu.ts`
- `castmu()`: `packages/content/src/mcastu.en.ts`, `packages/content/src/mcastu.ts`
- `choose_monster_spell()`: `packages/content/src/mcastu.ts`
- `cursetxt()`: `packages/content/src/mcastu.en.ts`, `packages/content/src/mcastu.ts`
- `is_undirected_spell()`: `packages/content/src/mcastu.ts`
- `m_cure_self()`: `packages/content/src/mcastu.ts`
- `mcast_blind_you()`: `packages/content/src/mcastu.ts`
- `mcast_disappear()`: `packages/content/src/mcastu.ts`
- `mcast_insects()`: `packages/content/src/mcastu.ts`
- `mcast_lightning()`: `packages/content/src/mcastu.ts`
- `mcast_open_wounds()`: `packages/content/src/mcastu.ts`
- `mcast_paralyze()`: `packages/content/src/mcastu.ts`
- `mcast_psi_bolt()`: `packages/content/src/mcastu.ts`
- `mcast_spell()`: `packages/content/src/mcastu.en.ts`, `packages/content/src/mcastu.ts`
- `mcast_stun_you()`: `packages/content/src/mcastu.ts`
- `mcast_weaken_you()`: `packages/content/src/mcastu.ts`
- `mon_cleric_spells()`: `packages/content/src/mcastu.ts`
- `mon_wizard_spells()`: `packages/content/src/mcastu.ts`
- `spell_would_be_useless()`: `packages/content/src/mcastu.ts`

## src/mhitm.c

- (file): `packages/content/src/mhitm.en.ts`, `packages/content/src/mhitm.ts`
- `attk_protection()`: `packages/content/src/stonestate.ts`
- `engulf_target()`: `packages/content/src/engulf.ts`
- `explmm()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitm.ts`
- `failed_grab()`: `packages/content/src/mhitm.ts`
- `gazemm()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitm.ts`
- `gulpmm()`: `packages/content/src/engulf.en.ts`, `packages/content/src/mhitm.ts`
- `hitmm()`: `packages/content/src/mhitm.ts`
- `mattackm()`: `packages/content/src/mhitm.ts`
- `max_passive_dmg()`: `packages/content/src/dogmove.ts`
- `mdamagem()`: `packages/content/src/mhitm.ts`
- `missmm()`: `packages/content/src/mhitm.ts`
- `noises()`: `packages/content/src/mhitm.ts`
- `paralyze_monst()`: `packages/content/src/mstate.ts`
- `passivemm()`: `packages/content/src/mhitm.ts`
- `rustm()`: `packages/content/src/erode.ts`
- `sleep_monst()`: `packages/content/src/adtyping.ts`, `packages/content/src/buzz.ts`, `packages/content/src/trap.ts`
- `slept_monst()`: `packages/content/src/buzz.ts`
- `xdrainenergym()`: `packages/content/src/adtyping.ts`

## src/mhitu.c

- (file): `packages/content/src/adtyping.en.ts`, `packages/content/src/messages.en.ts`, `packages/content/src/mongear.en.ts`, `packages/content/src/resist.en.ts`
- `could_seduce()`: `packages/content/src/steal.ts`
- `diseasemu()`: `packages/content/src/adtyping.ts`
- `expels()`: `packages/content/src/engulf.en.ts`, `packages/content/src/engulf.ts`
- `explmu()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitu.ts`
- `gazemu()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitu.ts`
- `gulpmu()`: `packages/content/src/engulf.en.ts`, `packages/content/src/mhitu.ts`
- `hitmsg()`: `packages/content/src/combat.ts`
- `hitmu()`: `packages/content/src/combat.ts`, `packages/content/src/mhitu.ts`
- `magic_negation()`: `packages/content/src/adtyping.ts`, `packages/content/src/mhitu.ts`
- `mattacku()`: `packages/content/src/combat.ts`, `packages/content/src/monmove.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/travel.ts`
- `mdamageu()`: `packages/content/src/combat.ts`, `packages/content/src/mhitu.ts`
- `missmu()`: `packages/content/src/combat.ts`
- `mpoisons_subj()`: `packages/content/src/adtyping.ts`
- `mswings()`: `packages/content/src/combat.ts`
- `mswings_verb()`: `packages/content/src/combat.ts`
- `mtrapped_in_pit()`: `packages/content/src/trapstate.ts`
- `stop_occupation()`: `packages/content/src/travel.ts`
- `summonmu()`: `packages/content/src/were.ts`
- `u_slip_free()`: `packages/content/src/adtyping.ts`
- `u_slow_down()`: `packages/content/src/props.ts`
- `wildmiss()`: `packages/content/src/combat.ts`

## src/minion.c

- `bribe()`: `packages/content/src/priest.en.ts`, `packages/content/src/priest.ts`
- `monster_census()`: `packages/content/src/mcastu.ts`

## src/mklev.c

- `add_door()`: `packages/content/src/zoo.ts`
- `add_room()`: `packages/core/src/levelgen/rooms.ts`
- `add_subroom()`: `packages/core/src/levelgen/sprooms.ts`
- `bydoor()`: `packages/content/src/mklev.ts`, `packages/core/src/levelgen/corridors.ts`
- `do_room_or_subroom()`: `packages/core/src/levelgen/rooms.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `dodoor()`: `packages/core/src/levelgen/corridors.ts`
- `dosdoor()`: `packages/content/src/mklev.ts`, `packages/content/src/terrain.ts`, `packages/core/src/levelgen/corridors.ts`, `packages/core/src/types/level.ts`
- `fill_ordinary_room()`: `packages/content/src/mklev.ts`
- `find_branch_room()`: `packages/core/src/levelgen/generate.ts`
- `find_okay_roompos()`: `packages/content/src/mklev.ts`
- `finddpos()`: `packages/core/src/levelgen/corridors.ts`
- `generate_stairs()`: `packages/core/src/dungeon.ts`, `packages/core/src/levelgen/generate.ts`
- `generate_stairs_find_room()`: `packages/core/src/levelgen/generate.ts`
- `good_rm_wall_doorpos()`: `packages/core/src/levelgen/corridors.ts`
- `join()`: `packages/core/src/levelgen/corridors.ts`
- `makecorridors()`: `packages/core/src/levelgen/corridors.ts`
- `makelevel()`: `packages/content/src/mklev.ts`, `packages/core/src/levelgen/generate.ts`
- `makerooms()`: `packages/core/src/levelgen/rooms.ts`
- `maybe_sdoor()`: `packages/core/src/levelgen/corridors.ts`
- `mkfount()`: `packages/content/src/mklev.ts`
- `mktrap()`: `packages/content/src/mklev.ts`, `packages/core/src/traps.ts`
- `okdoor()`: `packages/core/src/levelgen/corridors.ts`
- `place_branch()`: `packages/core/src/dungeon.ts`, `packages/core/src/levelgen/generate.ts`
- `somexy()`: `packages/core/src/levelgen/generate.ts`
- `sort_rooms()`: `packages/core/src/levelgen/rooms.ts`
- `topologize()`: `packages/core/src/rooms.ts`
- `traptype_rnd()`: `packages/content/src/mklev.ts`

## src/mkmap.c

- (file): `packages/core/src/levelgen/mkmap.ts`
- `N_P1_ITER()`: `packages/core/src/levelgen/mkmap.ts`
- `dirs()`: `packages/core/src/levelgen/mkmap.ts`
- `finish_map()`: `packages/core/src/levelgen/mkmap.ts`
- `flood_fill_rm()`: `packages/core/src/levelgen/mkmap.ts`
- `get_map()`: `packages/core/src/levelgen/mkmap.ts`
- `init_fill()`: `packages/core/src/levelgen/mkmap.ts`
- `join_map()`: `packages/core/src/levelgen/mkmap.ts`
- `join_map_cleanup()`: `packages/core/src/levelgen/mkmap.ts`
- `litstate_rnd()`: `packages/core/src/levelgen/rooms.ts`
- `mkmap()`: `packages/content/src/levelflags.ts`, `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `pass_one()`: `packages/core/src/levelgen/mkmap.ts`
- `pass_three()`: `packages/core/src/levelgen/mkmap.ts`
- `pass_two()`: `packages/core/src/levelgen/mkmap.ts`

## src/mkmaze.c

- (file): `packages/core/src/types/mod.ts`
- `bad_location()`: `packages/core/src/engine.ts`, `packages/core/src/levelgen/special.ts`
- `extend_spine()`: `packages/core/src/levelgen/mkmap.ts`
- `fix_wall_spines()`: `packages/content/src/terrain.ts`, `packages/core/src/levelgen/mkmap.ts`
- `fixup_special()`: `packages/content/src/dungeon.ts`, `packages/content/src/orctown.ts`
- `is_solid()`: `packages/core/src/levelgen/mkmap.ts`
- `iswall()`: `packages/content/src/orctown.ts`, `packages/core/src/levelgen/mkmap.ts`
- `iswall_or_stone()`: `packages/core/src/levelgen/mkmap.ts`
- `makemaz()`: `packages/core/src/engine.ts`, `packages/core/src/types/mod.ts`
- `migrate_orc()`: `packages/content/src/orctown.ts`
- `okay()`: `packages/content/src/mazewalk.ts`
- `place_lregion()`: `packages/core/src/engine.ts`, `packages/core/src/levelgen/special.ts`
- `put_lregion_here()`: `packages/core/src/levelgen/special.ts`
- `shiny_orc_stuff()`: `packages/content/src/orctown.ts`
- `spine_array()`: `packages/core/src/levelgen/mkmap.ts`
- `stolen_booty()`: `packages/content/src/orctown.ts`
- `walkfrom()`: `packages/content/src/mazewalk.ts`
- `wall_cleanup()`: `packages/core/src/levelgen/mkmap.ts`
- `wallification()`: `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`

## src/mkobj.c

- (file): `packages/content/src/material.ts`
- `add_to_container()`: `packages/content/src/container.ts`, `packages/core/src/objects.ts`
- `add_to_minv()`: `packages/content/src/mongear.ts`
- `bcsign()`: `packages/content/src/items.ts`
- `bill_dummy_object()`: `packages/content/src/shk.ts`
- `blessorcurse()`: `packages/content/src/items.ts`, `packages/content/src/read.ts`
- `boxiprobs()`: `packages/content/src/mkobj.ts`
- `costly_alteration()`: `packages/content/src/shk.ts`
- `curse()`: `packages/content/src/items.ts`
- `get_obj_location()`: `packages/content/src/light.ts`, `packages/content/src/price.ts`
- `is_flammable()`: `packages/content/src/material.ts`
- `is_rottable()`: `packages/content/src/material.ts`
- `may_generate_eroded()`: `packages/content/src/items.ts`
- `maybe_reset_pick()`: `packages/content/src/lock.ts`
- `mkbox_cnts()`: `packages/content/src/mkobj.ts`
- `mkcorpstat()`: `packages/content/src/items.ts`, `packages/content/src/statue.ts`
- `mkgold()`: `packages/content/src/items.ts`
- `mkobj()`: `packages/content/src/mkobj.ts`
- `mkobj_at()`: `packages/content/src/mkobj.ts`
- `mkobj_erosions()`: `packages/content/src/items.ts`
- `mkobjprobs()`: `packages/content/src/mkobj.ts`
- `mksobj()`: `packages/content/src/items.ts`, `packages/content/src/mkobj.ts`
- `mksobj_init()`: `packages/content/src/btrapstate.ts`, `packages/content/src/items.ts`, `packages/content/src/mkobj.ts`
- `next_ident()`: `packages/content/src/shk.ts`
- `obfree()`: `packages/content/src/lock.ts`
- `obj_extract_self()`: `packages/core/src/objects.ts`
- `place_object()`: `packages/content/src/items.ts`, `packages/core/src/objects.ts`, `packages/core/src/types/mod.ts`
- `rndmonnum()`: `packages/content/src/mkobj.ts`
- `rndmonnum_adj()`: `packages/content/src/mkobj.ts`
- `set_corpsenm()`: `packages/content/src/corpses.ts`, `packages/content/src/orctown.ts`
- `shop_obj_sanity()`: `packages/testkit/src/invariants.ts`
- `stackobj()`: `packages/content/src/items.ts`
- `start_corpse_timeout()`: `packages/content/src/corpses.ts`
- `weight()`: `packages/content/src/items.ts`

## src/mkroom.c

- `fill_zoo()`: `packages/content/src/zoo.ts`
- `has_dnstairs()`: `packages/content/src/shknam.ts`
- `has_upstairs()`: `packages/content/src/shknam.ts`
- `inside_room()`: `packages/core/src/levelgen/grid.ts`, `packages/core/src/rooms.ts`
- `invalid_shop_shape()`: `packages/content/src/shknam.ts`
- `isbig()`: `packages/content/src/shknam.ts`
- `mkshop()`: `packages/content/src/shknam.ts`
- `nexttodoor()`: `packages/content/src/fountain.ts`
- `somexy()`: `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/rooms.ts`
- `somexyspace()`: `packages/content/src/mklev.ts`

## src/mon.c

- (file): `packages/content/src/messages.en.ts`, `packages/content/src/mongear.en.ts`, `packages/content/src/peaceful.ts`, `packages/core/src/types/mod.ts`
- `accept_newcham_form()`: `packages/content/src/newcham.ts`
- `angry_guards()`: `packages/content/src/watch.en.ts`, `packages/content/src/watch.ts`
- `can_carry()`: `packages/content/src/mongear.ts`
- `corpse_chance()`: `packages/content/src/corpses.ts`, `packages/content/src/explode.ts`
- `curr_mon_load()`: `packages/content/src/mongear.ts`
- `healmon()`: `packages/content/src/mstate.ts`, `packages/content/src/uhitm_passive.ts`
- `isspecmon()`: `packages/content/src/newcham.ts`
- `killed()`: `packages/content/src/buzz.ts`, `packages/content/src/dokick.ts`
- `levl_follower()`: `packages/content/src/dog.ts`
- `m_calcdistress()`: `packages/content/src/monflee.ts`, `packages/content/src/mstate.ts`, `packages/content/src/were.ts`
- `m_consume_obj()`: `packages/content/src/meat.ts`
- `m_detach()`: `packages/content/src/mondeath.ts`, `packages/content/src/mstate.ts`, `packages/content/src/trapstate.ts`
- `m_move_aggress()`: `packages/content/src/monmove.ts`
- `m_respond()`: `packages/content/src/mrespond.ts`
- `m_respond_shrieker()`: `packages/content/src/mrespond.ts`
- `make_corpse()`: `packages/content/src/corpses.ts`
- `max_mon_load()`: `packages/content/src/mongear.ts`
- `maybe_mnexto()`: `packages/content/src/dokick.ts`
- `mcalcmove()`: `packages/content/src/brains.ts`, `packages/content/src/monmove.ts`
- `meatbox()`: `packages/content/src/meat.ts`
- `meatcorpse()`: `packages/content/src/dog.en.ts`, `packages/content/src/meat.ts`
- `meatmetal()`: `packages/content/src/dog.en.ts`, `packages/content/src/meat.ts`
- `meatobj()`: `packages/content/src/dog.en.ts`, `packages/content/src/meat.ts`
- `mfndpos()`: `packages/content/src/mdig.ts`, `packages/content/src/monmove.ts`, `packages/testkit/src/invariants.ts`
- `mnearto()`: `packages/content/src/shk.ts`
- `mnexto()`: `packages/content/src/generation.ts`
- `mon_allowflags()`: `packages/content/src/monmove.ts`
- `mondead()`: `packages/content/src/mondeath.ts`, `packages/content/src/vanquished.ts`, `packages/content/src/werestate.ts`
- `mondied()`: `packages/content/src/mondeath.ts`
- `mongone()`: `packages/content/src/fountain.ts`, `packages/content/src/statue.ts`
- `monkilled()`: `packages/content/src/mondeath.ts`
- `monnear()`: `packages/content/src/mhitm.ts`, `packages/content/src/monmove.ts`
- `monster_census()`: `packages/content/src/wizard/genesis.ts`
- `monstone()`: `packages/content/src/mondeath.ts`, `packages/content/src/stoning.ts`
- `movemon()`: `packages/core/src/turn.ts`
- `movemon_singlemon()`: `packages/content/src/monmove.ts`
- `mpickstuff()`: `packages/content/src/mongear.ts`
- `newcham()`: `packages/content/src/invis.ts`, `packages/content/src/newcham.ts`
- `pacify_guards()`: `packages/content/src/watch.ts`
- `peacefuls_respond()`: `packages/content/src/peaceful.ts`, `packages/content/src/watch.en.ts`, `packages/content/src/watch.ts`
- `select_newcham_form()`: `packages/content/src/newcham.ts`
- `set_mon_data()`: `packages/content/src/werestate.ts`
- `set_ustuck()`: `packages/content/src/engulfstate.ts`, `packages/content/src/hackmove.ts`
- `setmangry()`: `packages/content/src/kick.en.ts`, `packages/content/src/peaceful.ts`
- `undead_to_corpse()`: `packages/content/src/corpses.ts`
- `unstuck()`: `packages/content/src/engulf.ts`
- `validspecmon()`: `packages/content/src/newcham.ts`
- `wake_msg()`: `packages/content/src/monmove.ts`
- `wake_nearby()`: `packages/content/src/apply.ts`, `packages/content/src/btrapped.ts`, `packages/content/src/trap.ts`
- `wake_nearto_core()`: `packages/content/src/apply.ts`, `packages/content/src/noise.ts`
- `wakeup()`: `packages/content/src/peaceful.ts`
- `xkilled()`: `packages/content/src/buzz.ts`, `packages/content/src/combat.ts`, `packages/content/src/corpses.ts`, `packages/content/src/dog.en.ts`, `packages/content/src/hmon.ts`, `packages/content/src/luck.ts`, `packages/content/src/mondeath.ts`, `packages/content/src/rollboulder.ts`, `packages/content/src/stoning.ts`

## src/mondata.c

- (file): `packages/content/src/adtyping.ts`, `packages/content/src/breakarm.ts`, `packages/content/src/zap.ts`
- `breakarm()`: `packages/content/src/breakarm.ts`
- `can_blnd()`: `packages/content/src/adtyping.ts`
- `mon_knows_traps()`: `packages/content/src/trapstate.ts`
- `mon_learns_traps()`: `packages/content/src/trapstate.ts`
- `mons_see_trap()`: `packages/content/src/trap.ts`
- `name_to_mon()`: `packages/content/src/mondata.ts`
- `name_to_monplus()`: `packages/content/src/mondata.ts`
- `num_horns()`: `packages/content/src/breakarm.ts`
- `on_fire()`: `packages/content/src/adtyping.ts`
- `resist_conflict()`: `packages/content/src/props.ts`
- `resists_drli()`: `packages/content/src/adtyping.ts`, `packages/content/src/exper.ts`
- `resists_magm()`: `packages/content/src/buzz.ts`
- `sliparm()`: `packages/content/src/breakarm.ts`
- `sticks()`: `packages/content/src/newcham.ts`

## src/monmove.c

- (file): `packages/content/src/mdig.ts`, `packages/content/src/mongear.ts`, `packages/content/src/monmove.ts`, `packages/content/src/trap.en.ts`
- `accessible()`: `packages/content/src/teleport.ts`
- `closed_door()`: `packages/content/src/buzz.ts`, `packages/content/src/rollboulder.ts`, `packages/content/src/zap.ts`
- `count_webbing_walls()`: `packages/content/src/web.ts`
- `distfleeck()`: `packages/content/src/monflee.ts`, `packages/content/src/monmove.ts`
- `disturb()`: `packages/content/src/monmove.ts`
- `dochug()`: `packages/content/src/brains.ts`, `packages/content/src/monflee.ts`, `packages/content/src/monmove.ts`
- `dochugw()`: `packages/content/src/travel.ts`
- `holds_up_web()`: `packages/content/src/web.ts`
- `leppie_avoidance()`: `packages/content/src/monmove.ts`
- `m_avoid_soko_push_loc()`: `packages/content/src/dogmove.ts`
- `m_digweapon_check()`: `packages/content/src/mdig.ts`
- `m_move()`: `packages/content/src/brains.ts`, `packages/content/src/dogmove.ts`, `packages/content/src/meat.ts`, `packages/content/src/monmove.ts`
- `m_move_aggress()`: `packages/content/src/monmove.ts`
- `m_search_items()`: `packages/content/src/monmove.ts`
- `maybe_spin_web()`: `packages/content/src/web.ts`
- `mb_trapped()`: `packages/content/src/btrapped.ts`
- `mon_regen()`: `packages/content/src/mstate.ts`
- `mon_track_add()`: `packages/content/src/monmove.ts`
- `mon_track_clear()`: `packages/content/src/monflee.ts`
- `mon_yells()`: `packages/content/src/watch.ts`
- `monflee()`: `packages/content/src/kick.en.ts`, `packages/content/src/monflee.ts`
- `postmov()`: `packages/content/src/actions.ts`, `packages/content/src/monmove.ts`
- `release_hero()`: `packages/content/src/engulf.ts`
- `set_apparxy()`: `packages/content/src/apparxy.ts`
- `soko_allow_web()`: `packages/content/src/web.ts`
- `watch_on_duty()`: `packages/content/src/watch.ts`

## src/mthrowu.c

- `breamm()`: `packages/content/src/mthrowu.ts`
- `breamu()`: `packages/content/src/mthrowu.ts`
- `breathwep()`: `packages/content/src/mthrowu.ts`
- `drop_throw()`: `packages/content/src/mthrowu.ts`
- `lined_up()`: `packages/content/src/monmove.ts`
- `linedup()`: `packages/content/src/monmove.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/priest.ts`
- `m_throw()`: `packages/content/src/mthrowu.en.ts`, `packages/content/src/mthrowu.ts`
- `monmulti()`: `packages/content/src/mthrowu.ts`
- `monshoot()`: `packages/content/src/mthrowu.en.ts`, `packages/content/src/mthrowu.ts`
- `ohitmon()`: `packages/content/src/mthrowu.ts`
- `spitmm()`: `packages/content/src/mthrowu.ts`
- `spitmu()`: `packages/content/src/mthrowu.ts`
- `thitu()`: `packages/content/src/mthrowu.en.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/trap.ts`
- `thrwmu()`: `packages/content/src/mthrowu.ts`
- `u_catch_thrown_obj()`: `packages/content/src/mthrowu.ts`

## src/muse.c

- `searches_for_item()`: `packages/content/src/mongear.ts`
- `ureflects()`: `packages/content/src/buzz.ts`

## src/nhlsel.c

- `l_selection_area()`: `packages/core/src/levelgen/special.ts`
- `l_selection_line()`: `packages/core/src/levelgen/special.ts`

## src/nhlua.c

- (file): `packages/content/src/items.ts`
- `char2typ()`: `packages/core/src/levelgen/spdef.ts`
- `splev_chr2typ()`: `packages/core/src/levelgen/spdef.ts`, `packages/core/src/types/mod.ts`

## src/o_init.c

- (file): `packages/content/src/itemactions.ts`, `packages/content/src/o_init.ts`
- `discover_object()`: `packages/content/src/o_init.ts`, `packages/core/src/types/state.ts`
- `dodiscovered()`: `packages/content/src/itemactions.ts`
- `init_objects()`: `packages/content/src/o_init.ts`
- `obj_shuffle_range()`: `packages/testkit/src/convert/cdata.ts`
- `objdescr_is()`: `packages/content/src/breakwand.ts`
- `setgemprobs()`: `packages/content/src/gem.ts`
- `shuffle()`: `packages/content/src/o_init.ts`
- `shuffle_all()`: `packages/content/src/o_init.ts`, `packages/core/src/types/state.ts`
- `shuffle_classes()`: `packages/content/src/o_init.ts`

## src/objnam.c

- (file): `packages/content/src/objects.en.ts`, `packages/core/src/types/mod.ts`
- `Yobjnam2()`: `packages/content/src/adtyping.ts`
- `add_erosion_words()`: `packages/content/src/objnam.ts`
- `armor_simple_name()`: `packages/content/src/objnam.ts`
- `as_is()`: `packages/content/src/objnam_read.ts`
- `badman()`: `packages/content/src/objnam_read.ts`, `packages/ui/src/plural.ts`
- `cloak_simple_name()`: `packages/content/src/breakarm.ts`
- `compounds()`: `packages/content/src/objnam_read.ts`
- `cxname_singular()`: `packages/content/src/revive.ts`
- `def_char_to_objclass()`: `packages/content/src/objnam_read.ts`
- `doname()`: `packages/content/src/objnam.ts`
- `doname_base()`: `packages/content/src/objnam.ts`
- `erosion_matters()`: `packages/content/src/material.ts`
- `just_an()`: `packages/ui/src/i18n.ts`
- `makeplural()`: `packages/ui/src/plural.ts`
- `makesingular()`: `packages/content/src/objnam_read.ts`
- `mshot_xname()`: `packages/content/src/hmon.ts`
- `no_man()`: `packages/content/src/objnam_read.ts`
- `not_fully_identified()`: `packages/content/src/read.ts`
- `o_ranges()`: `packages/content/src/objnam_read.ts`
- `one_off()`: `packages/content/src/objnam_read.ts`
- `otense()`: `packages/content/src/read.ts`
- `paydoname()`: `packages/content/src/objnam.ts`
- `readobjnam()`: `packages/content/src/objnam_read.ts`, `packages/content/src/wish.ts`
- `readobjnam_parse_charges()`: `packages/content/src/objnam_read.ts`
- `readobjnam_postparse1()`: `packages/content/src/objnam_read.ts`
- `readobjnam_preparse()`: `packages/content/src/objnam_read.ts`
- `rnd_class()`: `packages/content/src/gem.ts`, `packages/content/src/polyobj.ts`
- `rnd_otyp_by_namedesc()`: `packages/content/src/objnam_read.ts`, `packages/content/src/wish.ts`
- `shiny_obj()`: `packages/content/src/orctown.ts`
- `singplur_compound()`: `packages/content/src/objnam_read.ts`, `packages/ui/src/plural.ts`
- `singplur_lookup()`: `packages/content/src/objnam_read.ts`, `packages/ui/src/plural.ts`
- `special_subjs()`: `packages/content/src/objnam_read.ts`
- `wishymatch()`: `packages/content/src/objnam_read.ts`
- `wizterrainwish()`: `packages/content/src/wish.ts`
- `wrp()`: `packages/content/src/objnam_read.ts`
- `wrpsym()`: `packages/content/src/objnam_read.ts`
- `xname()`: `packages/content/src/objects.en.ts`, `packages/content/src/objnam.ts`, `packages/testkit/src/convert/defs.ts`

## src/options.c

- (file): `packages/app/src/options.ts`
- `def_inv_order()`: `packages/content/src/disclose.ts`, `packages/ui/src/inventory.ts`

## src/pager.c

- `do_look()`: `packages/ui/src/host.ts`
- `dohelp()`: `packages/ui/src/help.ts`
- `doidtrap()`: `packages/content/src/trap.ts`
- `help_menu_items()`: `packages/ui/src/help.ts`
- `lookat()`: `packages/content/src/messages.en.ts`

## src/pickup.c

- (file): `packages/content/src/itemactions.ts`
- `able_to_loot()`: `packages/content/src/container.ts`, `packages/content/src/pickup.en.ts`
- `boh_loss()`: `packages/content/src/container.ts`
- `carry_count()`: `packages/content/src/itemactions.ts`
- `check_here()`: `packages/content/src/itemactions.ts`
- `do_boh_explosion()`: `packages/content/src/container.ts`
- `do_loot_cont()`: `packages/content/src/container.ts`, `packages/content/src/lock.ts`, `packages/content/src/pickup.en.ts`
- `doloot_core()`: `packages/content/src/container.ts`, `packages/content/src/pickup.en.ts`
- `encumber_msg()`: `packages/content/src/itemactions.ts`
- `fatal_corpse_mistake()`: `packages/content/src/stonetouch.ts`
- `in_container()`: `packages/content/src/container.ts`
- `is_boh_item_gone()`: `packages/content/src/container.ts`
- `lift_object()`: `packages/content/src/container.ts`, `packages/content/src/itemactions.ts`
- `mbag_explodes()`: `packages/content/src/container.ts`
- `mbag_item_gone()`: `packages/content/src/container.ts`
- `menu_loot()`: `packages/content/src/container.ts`
- `out_container()`: `packages/content/src/container.ts`
- `pick_obj()`: `packages/content/src/itemactions.ts`
- `pickup()`: `packages/content/src/itemactions.ts`
- `pickup_object()`: `packages/content/src/itemactions.ts`
- `use_container()`: `packages/content/src/container.ts`

## src/polyself.c

- (file): `packages/content/src/trapstate.ts`
- `change_sex()`: `packages/content/src/gender.ts`
- `mbodypart()`: `packages/content/src/trap.ts`
- `poly_gender()`: `packages/content/src/gender.ts`
- `polyself()`: `packages/content/src/polyself.en.ts`, `packages/content/src/polyself.ts`

## src/potion.c

- (file): `packages/content/src/eat.en.ts`, `packages/content/src/fountain.ts`, `packages/content/src/resist.en.ts`
- `bottlenames()`: `packages/content/src/force.ts`
- `dodrink()`: `packages/content/src/potion.ts`
- `dopotion()`: `packages/content/src/potion.ts`
- `healup()`: `packages/content/src/potion.ts`
- `make_blinded()`: `packages/content/src/props.ts`
- `make_confused()`: `packages/content/src/props.ts`
- `make_hallucinated()`: `packages/content/src/props.ts`
- `make_sick()`: `packages/content/src/eat.en.ts`, `packages/content/src/hunger.ts`, `packages/content/src/potion.ts`
- `make_stoned()`: `packages/content/src/stonestate.ts`
- `make_stunned()`: `packages/content/src/props.ts`, `packages/content/src/resist.en.ts`
- `make_vomiting()`: `packages/content/src/hunger.ts`, `packages/content/src/potion.ts`
- `peffect_blindness()`: `packages/content/src/potion.ts`
- `peffect_booze()`: `packages/content/src/potion.ts`
- `peffect_confusion()`: `packages/content/src/potion.ts`
- `peffect_extra_healing()`: `packages/content/src/potion.ts`
- `peffect_full_healing()`: `packages/content/src/potion.ts`
- `peffect_hallucination()`: `packages/content/src/potion.ts`
- `peffect_healing()`: `packages/content/src/potion.ts`
- `peffect_invisibility()`: `packages/content/src/potion.ts`
- `peffect_polymorph()`: `packages/content/src/potion.ts`
- `peffect_see_invisible()`: `packages/content/src/potion.ts`
- `peffect_sleeping()`: `packages/content/src/potion.ts`
- `peffect_water()`: `packages/content/src/potion.ts`
- `peffects()`: `packages/content/src/potion.ts`
- `self_invis_message()`: `packages/content/src/invis.en.ts`, `packages/content/src/invis.ts`
- `speed_up()`: `packages/content/src/zap.ts`
- `split_mon()`: `packages/content/src/clone.ts`
- `strange_feeling()`: `packages/content/src/magic.ts`

## src/pray.c

- (file): `packages/content/src/pray.en.ts`, `packages/content/src/pray.ts`
- `TROUBLE_()`: `packages/content/src/pray.ts`
- `a_align()`: `packages/content/src/align.ts`
- `align_gname()`: `packages/content/src/align.ts`
- `altar_wrath()`: `packages/content/src/align.en.ts`, `packages/content/src/align.ts`
- `angrygods()`: `packages/content/src/pray.ts`
- `can_pray()`: `packages/content/src/pray.ts`
- `critically_low_hp()`: `packages/content/src/pray.ts`
- `dopray()`: `packages/content/src/pray.ts`
- `fix_curse_trouble()`: `packages/content/src/pray.ts`
- `fix_worst_trouble()`: `packages/content/src/jewelry.ts`, `packages/content/src/pray.ts`
- `fry_by_god()`: `packages/content/src/pray.ts`
- `god_zaps_you()`: `packages/content/src/pray.ts`
- `gods_upset()`: `packages/content/src/pray.ts`
- `godvoice()`: `packages/content/src/align.ts`
- `in_trouble()`: `packages/content/src/pray.ts`
- `on_altar()`: `packages/content/src/align.ts`
- `on_shrine()`: `packages/content/src/align.ts`
- `pleased()`: `packages/content/src/pray.ts`
- `prayer_done()`: `packages/content/src/pray.ts`
- `water_prayer()`: `packages/content/src/pray.ts`
- `worst_cursed_item()`: `packages/content/src/pray.ts`

## src/priest.c

- `findpriest()`: `packages/content/src/epri.ts`
- `forget_temple_entry()`: `packages/content/src/epri.ts`
- `ghod_hitsu()`: `packages/content/src/priest.en.ts`, `packages/content/src/priest.ts`
- `has_shrine()`: `packages/content/src/epri.ts`
- `histemple_at()`: `packages/content/src/epri.ts`
- `in_your_sanctuary()`: `packages/content/src/epri.ts`
- `inhistemple()`: `packages/content/src/epri.ts`
- `intemple()`: `packages/content/src/priest.en.ts`, `packages/content/src/priest.ts`
- `mon_aligntyp()`: `packages/content/src/epri.ts`
- `move_special()`: `packages/content/src/monmove.ts`
- `newepri()`: `packages/content/src/epri.ts`
- `p_coaligned()`: `packages/content/src/epri.ts`
- `pri_move()`: `packages/content/src/monmove.ts`
- `priest_talk()`: `packages/content/src/priest.en.ts`, `packages/content/src/priest.ts`
- `priestini()`: `packages/content/src/priest.ts`
- `priestname()`: `packages/content/src/epri.ts`, `packages/content/src/priest.en.ts`
- `temple_occupied()`: `packages/content/src/epri.ts`

## src/read.c

- (file): `packages/content/src/wizard/genesis.ts`
- `cant_revive()`: `packages/content/src/revive.ts`, `packages/content/src/statue.ts`
- `create_particular()`: `packages/content/src/wizard/genesis.ts`
- `create_particular_creation()`: `packages/content/src/wizard/genesis.ts`
- `create_particular_parse()`: `packages/content/src/wizard/genesis.ts`
- `do_mapping()`: `packages/content/src/minesend.ts`
- `doread()`: `packages/content/src/read.ts`, `packages/content/src/spell.ts`
- `drop_boulder_on_monster()`: `packages/content/src/magic.en.ts`, `packages/content/src/read.ts`
- `drop_boulder_on_player()`: `packages/content/src/magic.en.ts`, `packages/content/src/read.ts`
- `learnscrolltyp()`: `packages/content/src/read.ts`
- `litroom()`: `packages/content/src/read.ts`
- `seffect_blank_paper()`: `packages/content/src/read.ts`
- `seffect_confuse_monster()`: `packages/content/src/cast.ts`
- `seffect_earth()`: `packages/content/src/magic.en.ts`, `packages/content/src/read.ts`
- `seffect_enchant_armor()`: `packages/content/src/read.ts`
- `seffect_enchant_weapon()`: `packages/content/src/read.ts`
- `seffect_identify()`: `packages/content/src/read.ts`
- `seffect_light()`: `packages/content/src/read.ts`
- `seffect_remove_curse()`: `packages/content/src/read.ts`
- `seffect_teleportation()`: `packages/content/src/read.ts`
- `seffects()`: `packages/content/src/read.ts`

## src/rect.c

- (file): `packages/core/src/levelgen/rect.ts`
- `add_rect()`: `packages/core/src/levelgen/rect.ts`
- `get_rect()`: `packages/core/src/levelgen/rect.ts`
- `get_rect_ind()`: `packages/core/src/levelgen/rect.ts`
- `init_rect()`: `packages/core/src/levelgen/rect.ts`
- `intersect()`: `packages/core/src/levelgen/rect.ts`
- `remove_rect()`: `packages/core/src/levelgen/rect.ts`
- `rnd_rect()`: `packages/core/src/levelgen/rect.ts`
- `split_rects()`: `packages/core/src/levelgen/rect.ts`

## src/rip.c

- `center()`: `packages/ui/src/status.ts`
- `genl_outrip()`: `packages/ui/src/gameover.ts`, `packages/ui/src/status.ts`
- `rip_txt()`: `packages/ui/src/status.ts`

## src/rnd.c

- `d()`: `packages/core/src/rng.ts`, `packages/core/src/types/rng.ts`
- `rn2()`: `packages/core/src/rng.ts`, `packages/core/src/types/rng.ts`
- `rnd()`: `packages/core/src/rng.ts`, `packages/core/src/types/rng.ts`
- `rne()`: `packages/content/src/items.ts`
- `rnl()`: `packages/core/src/rng.ts`
- `rnz()`: `packages/content/src/corpses.ts`

## src/role.c

- (file): `packages/app/src/options.ts`, `packages/app/src/title.ts`, `packages/content/src/hero.ts`, `packages/content/src/roles.ts`, `packages/content/src/were.en.ts`
- `Hello()`: `packages/content/src/shk.ts`
- `aligns()`: `packages/content/src/disclose.ts`
- `races()`: `packages/content/src/attrib.ts`, `packages/content/src/hero.ts`
- `roles()`: `packages/content/src/disclose.ts`, `packages/content/src/generation.ts`, `packages/content/src/hero.ts`, `packages/content/src/spellcalc.ts`

## src/rumors.c

- `doconsult()`: `packages/content/src/chat.ts`

## src/selvar.c

- (file): `packages/core/src/levelgen/special.ts`
- `selection_do_line()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `selection_floodfill()`: `packages/content/src/orctown.ts`
- `selection_rndcoord()`: `packages/content/src/orctown.ts`

## src/shk.c

- (file): `packages/content/src/gem.ts`, `packages/content/src/rooms.ts`
- `add_damage()`: `packages/content/src/shopdamage.ts`
- `add_one_tobill()`: `packages/content/src/shk.ts`
- `addtobill()`: `packages/content/src/shk.ts`
- `addupbill()`: `packages/content/src/shk.ts`
- `after_shk_move()`: `packages/content/src/rooms.ts`, `packages/content/src/shk.ts`
- `angry_shk_exists()`: `packages/content/src/shk.ts`
- `append_honorific()`: `packages/content/src/shk.ts`
- `bill_box_content()`: `packages/content/src/shk.ts`
- `billable()`: `packages/content/src/shk.ts`
- `bp_to_obj()`: `packages/content/src/shk.ts`
- `cad()`: `packages/content/src/shkpay.ts`
- `call_kops()`: `packages/content/src/shk.ts`
- `check_credit()`: `packages/content/src/shk.ts`
- `check_unpaid()`: `packages/content/src/shk.ts`
- `check_unpaid_usage()`: `packages/content/src/shk.ts`
- `clear_no_charge()`: `packages/content/src/shk.ts`
- `clear_no_charge_obj()`: `packages/content/src/shk.ts`
- `clear_no_charge_pets()`: `packages/content/src/shk.ts`
- `clear_unpaid()`: `packages/content/src/shk.ts`
- `contained_cost()`: `packages/content/src/price.ts`
- `contained_gold()`: `packages/content/src/price.ts`
- `corpsenm_price_adj()`: `packages/content/src/price.ts`
- `cost_per_charge()`: `packages/content/src/shk.ts`
- `costly_adjacent()`: `packages/content/src/shk.ts`
- `costly_spot()`: `packages/content/src/eshk.ts`
- `currency()`: `packages/content/src/objnam.ts`
- `delete_contents()`: `packages/core/src/objects.ts`
- `deserted_shop()`: `packages/content/src/shk.ts`
- `discard_damage_owned_by()`: `packages/content/src/shopdamage.ts`
- `discard_damage_struct()`: `packages/content/src/shopdamage.ts`
- `dopay()`: `packages/content/src/pay.ts`
- `dopayobj()`: `packages/content/src/pay.ts`
- `dropped_container()`: `packages/content/src/shk.ts`
- `find_damage()`: `packages/content/src/shkdamage.ts`
- `find_objowner()`: `packages/content/src/shk.ts`
- `fix_shop_damage()`: `packages/content/src/shkdamage.ts`
- `get_cost()`: `packages/content/src/price.ts`
- `get_cost_of_shop_item()`: `packages/content/src/price.ts`
- `getcad()`: `packages/content/src/shkpay.ts`
- `getprice()`: `packages/content/src/price.ts`
- `home_shk()`: `packages/content/src/shk.ts`
- `hot_pursuit()`: `packages/content/src/shk.ts`
- `icost()`: `packages/content/src/price.ts`
- `inhishop()`: `packages/content/src/eshk.ts`
- `inside_shop()`: `packages/content/src/eshk.ts`
- `insufficient_funds()`: `packages/content/src/pay.ts`
- `is_unpaid()`: `packages/content/src/price.ts`
- `litter_getpos()`: `packages/content/src/shkdamage.ts`
- `litter_scatter()`: `packages/content/src/shkdamage.ts`
- `make_angry_shk()`: `packages/content/src/shk.ts`
- `make_happy_shk()`: `packages/content/src/shk.ts`
- `make_happy_shoppers()`: `packages/content/src/shk.ts`
- `make_itemized_bill()`: `packages/content/src/pay.ts`
- `mnearto()`: `packages/content/src/shk.ts`
- `money2mon()`: `packages/content/src/money.ts`
- `money2u()`: `packages/content/src/money.ts`
- `next_shkp()`: `packages/content/src/eshk.ts`, `packages/content/src/pay.ts`
- `obfree()`: `packages/content/src/eat.ts`, `packages/content/src/eshk.ts`, `packages/content/src/magic.ts`, `packages/content/src/shk.ts`, `packages/core/src/engine.ts`, `packages/core/src/objects.ts`
- `oid_price_adjustment()`: `packages/content/src/price.ts`
- `onbill()`: `packages/content/src/eshk.ts`
- `pacify_shk()`: `packages/content/src/shk.ts`
- `pay()`: `packages/content/src/shk.ts`
- `pay_billed_items()`: `packages/content/src/pay.ts`
- `pay_for_damage()`: `packages/content/src/shkpay.ts`
- `picked_container()`: `packages/content/src/shk.ts`
- `price_quote()`: `packages/content/src/shk.ts`
- `reject_purchase()`: `packages/content/src/pay.ts`
- `repair_damage()`: `packages/content/src/shkdamage.ts`
- `repairable_damage()`: `packages/content/src/shkdamage.ts`
- `rile_shk()`: `packages/content/src/shk.ts`
- `rob_shop()`: `packages/content/src/shk.ts`
- `rouse_shk()`: `packages/content/src/shk.ts`
- `same_price()`: `packages/content/src/eshk.ts`
- `sellobj()`: `packages/content/src/shk.ts`
- `sellobj_state()`: `packages/content/src/itemactions.ts`, `packages/content/src/shk.ts`
- `set_cost()`: `packages/content/src/gem.ts`, `packages/content/src/price.ts`
- `setpaid()`: `packages/content/src/shk.ts`
- `shk_chat()`: `packages/content/src/shk.ts`
- `shk_embellish()`: `packages/content/src/shk.ts`
- `shk_fixes_damage()`: `packages/content/src/shkdamage.ts`
- `shk_impaired()`: `packages/content/src/shkdamage.ts`
- `shk_move()`: `packages/content/src/monmove.ts`
- `shk_names_obj()`: `packages/content/src/shk.ts`
- `shk_your()`: `packages/content/src/revive.ts`
- `shkgone()`: `packages/content/src/shk.ts`
- `shkname()`: `packages/content/src/shk.ts`
- `shop_keeper()`: `packages/content/src/eshk.ts`, `packages/content/src/revive.ts`, `packages/content/src/steal.ts`
- `shop_object()`: `packages/content/src/shk.ts`
- `shopdig()`: `packages/content/src/shkpay.ts`
- `sortbill_cmp()`: `packages/content/src/pay.ts`
- `splitbill()`: `packages/content/src/eshk.ts`
- `stolen_container()`: `packages/content/src/shk.ts`
- `stolen_value()`: `packages/content/src/shk.ts`
- `sub_one_frombill()`: `packages/content/src/shk.ts`
- `subfrombill()`: `packages/content/src/shk.ts`
- `u_entered_shop()`: `packages/content/src/shk.ts`, `packages/content/src/urooms.ts`
- `u_left_shop()`: `packages/content/src/shk.ts`
- `unpaid_cost()`: `packages/content/src/price.ts`

## src/shknam.c

- `get_shop_item()`: `packages/content/src/shknam.ts`
- `good_shopdoor()`: `packages/content/src/shknam.ts`
- `mkshobj_at()`: `packages/content/src/shknam.ts`
- `mkveggy_at()`: `packages/content/src/shknam.ts`
- `nameshk()`: `packages/content/src/shknam.ts`
- `neweshk()`: `packages/content/src/eshk.ts`
- `saleable()`: `packages/content/src/shtypes.ts`
- `shkinit()`: `packages/content/src/shknam.ts`
- `shkliquors()`: `packages/content/src/shtypes.ts`
- `shkname()`: `packages/content/src/eshk.ts`, `packages/content/src/shk.ts`
- `shkname_is_pname()`: `packages/content/src/eshk.ts`
- `shkveg()`: `packages/content/src/shknam.ts`
- `shtypes()`: `packages/content/src/eshk.ts`, `packages/content/src/shk.en.ts`, `packages/content/src/shtypes.ts`
- `stock_room()`: `packages/content/src/shknam.ts`
- `stock_room_goodpos()`: `packages/content/src/shknam.ts`
- `veggy_item()`: `packages/content/src/shtypes.ts`

## src/sit.c

- (file): `packages/content/src/pray.en.ts`
- `attrcurse()`: `packages/content/src/pray.ts`
- `rndcurse()`: `packages/content/src/sit.ts`
- `take_gold()`: `packages/content/src/spell.ts`

## src/sounds.c

- (file): `packages/content/src/dog.en.ts`
- `dochat()`: `packages/content/src/chat.en.ts`, `packages/content/src/chat.ts`
- `domonnoise()`: `packages/content/src/chat.en.ts`, `packages/content/src/chat.ts`
- `dotalk()`: `packages/content/src/chat.ts`
- `growl()`: `packages/content/src/dog.ts`
- `growl_sound()`: `packages/content/src/dog.ts`, `packages/content/src/were.ts`
- `yelp()`: `packages/content/src/dog.ts`

## src/sp_lev.c

- (file): `packages/content/src/mazewalk.ts`, `packages/core/src/levelgen/builder.ts`, `packages/core/src/types/level.ts`, `packages/core/src/types/mod.ts`
- `build_room()`: `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `check_room()`: `packages/core/src/levelgen/rooms.ts`
- `create_altar()`: `packages/content/src/priest.ts`, `packages/core/src/types/mod.ts`
- `create_door()`: `packages/content/src/oracle.ts`, `packages/core/src/levelgen/sprooms.ts`
- `create_monster()`: `packages/content/src/orctown.ts`, `packages/content/src/sp_lev.ts`
- `create_object()`: `packages/content/src/minesend.ts`, `packages/content/src/orctown.ts`, `packages/content/src/sokoprize.ts`, `packages/content/src/sp_lev.ts`
- `create_room()`: `packages/core/src/levelgen/rooms.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `create_subroom()`: `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `create_trap()`: `packages/content/src/sp_lev.ts`
- `dig_corridor()`: `packages/content/src/mklev.ts`, `packages/core/src/levelgen/corridors.ts`, `packages/core/src/levelgen/mkmap.ts`
- `ensure_way_out()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `fill_special_room()`: `packages/content/src/shknam.ts`, `packages/content/src/zoo.ts`
- `floodfillchk_match_under()`: `packages/content/src/orctown.ts`
- `generate_way_out_method()`: `packages/core/src/levelgen/special.ts`
- `get_location()`: `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/spdef.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `is_ok_location()`: `packages/content/src/sp_lev.ts`
- `l_create_stairway()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`
- `light_region()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `link_doors_rooms()`: `packages/content/src/zoo.ts`, `packages/core/src/levelgen/special.ts`
- `load_special()`: `packages/content/src/detect.ts`, `packages/content/src/sp_lev.ts`
- `lspo_altar()`: `packages/core/src/types/mod.ts`
- `lspo_door()`: `packages/content/src/oracle.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_feature()`: `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_finalize_level()`: `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`
- `lspo_level_flags()`: `packages/content/src/minesend.ts`
- `lspo_level_init()`: `packages/core/src/types/mod.ts`
- `lspo_levregion()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_map()`: `packages/core/src/levelgen/spdef.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_mazewalk()`: `packages/content/src/mazewalk.ts`
- `lspo_monster()`: `packages/core/src/types/mod.ts`
- `lspo_object()`: `packages/core/src/types/mod.ts`
- `lspo_random_corridors()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_region()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_room()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_stair()`: `packages/core/src/types/mod.ts`
- `lspo_terrain()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_trap()`: `packages/core/src/types/mod.ts`
- `lspo_wallify()`: `packages/content/src/orctown.ts`
- `lvlfill_solid()`: `packages/core/src/levelgen/special.ts`
- `maybe_add_door()`: `packages/content/src/zoo.ts`
- `mksobj_at()`: `packages/content/src/mklev.ts`
- `pm_good_location()`: `packages/content/src/priest.ts`
- `rnddoor()`: `packages/core/src/types/mod.ts`
- `sel_set_door()`: `packages/core/src/types/mod.ts`
- `sel_set_feature()`: `packages/core/src/types/mod.ts`
- `sel_set_ter()`: `packages/core/src/levelgen/special.ts`
- `set_door_orientation()`: `packages/core/src/levelgen/special.ts`
- `splev_initlev()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `spo_endroom()`: `packages/core/src/levelgen/sprooms.ts`
- `wallification()`: `packages/core/src/levelgen/mkmap.ts`
- `wallify_map()`: `packages/content/src/orctown.ts`, `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`

## src/spell.c

- (file): `packages/content/src/spell.ts`, `packages/content/src/spellcalc.ts`
- `age_spells()`: `packages/content/src/spell.ts`
- `book_disappears()`: `packages/content/src/spell.ts`
- `cast_protection()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `confused_book()`: `packages/content/src/spell.ts`
- `cursed_book()`: `packages/content/src/spell.ts`
- `docast()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `dospellmenu()`: `packages/content/src/cast.ts`, `packages/content/src/spell.ts`
- `dovspell()`: `packages/content/src/spell.ts`
- `dowizcast()`: `packages/content/src/wizard/cast.ts`
- `getdir()`: `packages/content/src/cast.ts`
- `getspell()`: `packages/content/src/cast.ts`
- `learn()`: `packages/content/src/spell.en.ts`, `packages/content/src/spell.ts`
- `percent_success()`: `packages/content/src/spellcalc.ts`
- `rejectcasting()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `spell_backfire()`: `packages/content/src/cast.ts`
- `spell_skilltype()`: `packages/content/src/spellcalc.ts`
- `spelleffects()`: `packages/content/src/cast.ts`, `packages/content/src/jump.ts`, `packages/content/src/wizard/cast.ts`
- `spelleffects_check()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `spellet()`: `packages/content/src/spell.ts`
- `spellretention()`: `packages/content/src/spell.ts`
- `spelltypemnemonic()`: `packages/content/src/spell.en.ts`, `packages/content/src/spellcalc.ts`
- `study_book()`: `packages/content/src/spell.en.ts`, `packages/content/src/spell.ts`

## src/stairs.c

- `stairway_at()`: `packages/content/src/actions.ts`
- `u_on_sstairs()`: `packages/content/src/actions.ts`

## src/steal.c

- `findgold()`: `packages/content/src/steal.ts`
- `mpickobj()`: `packages/content/src/steal.ts`
- `relobj()`: `packages/content/src/mongear.ts`
- `remove_worn_item()`: `packages/content/src/jewelry.ts`, `packages/content/src/steal.ts`
- `somegold()`: `packages/content/src/steal.ts`
- `steal()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `stealarm()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `stealgold()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `thiefdead()`: `packages/content/src/nomul.ts`, `packages/content/src/steal.ts`
- `unresponsive()`: `packages/content/src/steal.ts`
- `unstolenarm()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `worn_item_removal()`: `packages/content/src/steal.ts`

## src/teleport.c

- (file): `packages/content/src/teleport.ts`
- `collect_coords()`: `packages/content/src/teleport.ts`
- `dotele()`: `packages/content/src/wizard/teleport.ts`
- `dotelecmd()`: `packages/content/src/wizard/teleport.ts`
- `enexto()`: `packages/content/src/generation.ts`, `packages/core/src/engine.ts`
- `enexto_core()`: `packages/content/src/generation.ts`
- `goodpos()`: `packages/content/src/dokick.ts`, `packages/content/src/generation.ts`, `packages/content/src/teleport.ts`
- `level_tele()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`, `packages/content/src/wizard/levelport.ts`
- `level_tele_trap()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `mlevel_tele_trap()`: `packages/content/src/trap.ts`
- `mtele_trap()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `noteleport_level()`: `packages/content/src/teleport.ts`
- `random_teleport_level()`: `packages/content/src/teleport.ts`
- `rloc()`: `packages/content/src/generation.ts`, `packages/content/src/teleport.ts`, `packages/content/src/trap.ts`
- `rloc_to_core()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `rloco()`: `packages/content/src/rloco.ts`, `packages/content/src/teleport.ts`
- `safe_teleds()`: `packages/content/src/teleport.ts`, `packages/content/src/trap.ts`
- `scrolltele()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`, `packages/content/src/wizard/teleport.ts`
- `tele()`: `packages/content/src/trap.ts`, `packages/content/src/wizard/teleport.ts`
- `tele_restrict()`: `packages/content/src/teleport.ts`
- `tele_to_rnd_pet()`: `packages/content/src/apply.ts`
- `tele_trap()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `teleds()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `teleok()`: `packages/content/src/apply.ts`, `packages/content/src/teleport.ts`
- `u_teleport_mon()`: `packages/content/src/trap.ts`

## src/timeout.c

- (file): `packages/content/src/eat.en.ts`, `packages/content/src/luck.ts`, `packages/content/src/props.ts`, `packages/content/src/resist.en.ts`
- `begin_burn()`: `packages/content/src/light.ts`
- `burn_object()`: `packages/content/src/light.ts`
- `choke_dialogue()`: `packages/content/src/jewelry.ts`
- `end_burn()`: `packages/content/src/light.ts`
- `fall_asleep()`: `packages/content/src/adtyping.ts`, `packages/content/src/trap.ts`
- `incr_itimeout()`: `packages/content/src/props.ts`
- `lantern_message()`: `packages/content/src/light.ts`
- `nh_timeout()`: `packages/content/src/cast.ts`, `packages/content/src/gem.ts`, `packages/content/src/hunger.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/luck.ts`, `packages/content/src/props.ts`, `packages/content/src/resist.en.ts`, `packages/content/src/stoning.ts`
- `set_itimeout()`: `packages/content/src/props.ts`
- `stoned_dialogue()`: `packages/content/src/stoning.ts`
- `stoned_texts()`: `packages/content/src/stoning.en.ts`
- `vomiting_dialogue()`: `packages/content/src/hunger.ts`

## src/topten.c

- `formatkiller()`: `packages/ui/src/gameover.ts`
- `outentry()`: `packages/app/src/scores.ts`
- `outheader()`: `packages/app/src/scores.ts`
- `topten()`: `packages/app/src/scores.ts`, `packages/content/src/disclose.ts`, `packages/ui/src/gameover.ts`

## src/trap.c

- (file): `packages/content/src/magictrap.ts`, `packages/core/src/types/mod.ts`
- `acid_damage()`: `packages/content/src/erode.ts`
- `activate_statue_trap()`: `packages/content/src/statue.ts`
- `adj_nonconjoined_pit()`: `packages/content/src/trap.ts`
- `animate_statue()`: `packages/content/src/statue.ts`
- `b_trapped()`: `packages/content/src/btrapped.ts`
- `blindgas()`: `packages/content/src/chesttrap.ts`
- `blow_up_landmine()`: `packages/content/src/landmine.ts`
- `burnarmor()`: `packages/content/src/erode.ts`
- `chest_trap()`: `packages/content/src/chesttrap.en.ts`, `packages/content/src/chesttrap.ts`
- `choose_trapnote()`: `packages/content/src/trap.ts`
- `clear_conjoined_pits()`: `packages/content/src/trapstate.ts`
- `climb_pit()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `closeholdingtrap()`: `packages/content/src/zap.ts`
- `cnv_trap_obj()`: `packages/content/src/untrap.ts`
- `conjoined_pits()`: `packages/content/src/trap.ts`, `packages/content/src/trapstate.ts`
- `could_untrap()`: `packages/content/src/untrap.en.ts`, `packages/content/src/untrap.ts`
- `delfloortrap()`: `packages/content/src/buzz.ts`, `packages/content/src/dig.ts`
- `deltrap()`: `packages/content/src/sokoban.ts`, `packages/content/src/trap.ts`, `packages/core/src/types/mod.ts`
- `disarm_box()`: `packages/content/src/untrap.ts`
- `disarm_holdingtrap()`: `packages/content/src/untrap.ts`
- `disarm_landmine()`: `packages/content/src/untrap.ts`
- `disarm_shooting_trap()`: `packages/content/src/untrap.ts`
- `disarm_squeaky_board()`: `packages/content/src/untrap.ts`
- `dng_bottom()`: `packages/content/src/levelflags.ts`, `packages/content/src/trap.ts`
- `dofiretrap()`: `packages/content/src/magictrap.ts`
- `domagictrap()`: `packages/content/src/magictrap.ts`
- `dotrap()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `dountrap()`: `packages/content/src/untrap.ts`
- `drain_en()`: `packages/content/src/uenergy.ts`
- `erode_obj()`: `packages/content/src/erode.en.ts`, `packages/content/src/erode.ts`
- `fall_through()`: `packages/content/src/trap.ts`
- `feeltrap()`: `packages/content/src/trap.ts`
- `fill_pit()`: `packages/content/src/flooreffects.ts`
- `find_random_launch_coord()`: `packages/content/src/trap.ts`
- `float_down()`: `packages/content/src/levitation.ts`, `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `float_up()`: `packages/content/src/levitation.ts`, `packages/content/src/trap.en.ts`
- `floor_trigger()`: `packages/content/src/trap.ts`
- `help_monster_out()`: `packages/content/src/untrap.ts`
- `hole_destination()`: `packages/content/src/trap.ts`
- `ignite_items()`: `packages/content/src/light.ts`
- `instapetrify()`: `packages/content/src/stonetouch.ts`, `packages/content/src/stoning.ts`
- `into_vs_onto()`: `packages/content/src/trap.ts`, `packages/content/src/untrap.ts`
- `isclearpath()`: `packages/content/src/trap.ts`
- `launch_obj()`: `packages/content/src/rollboulder.ts`, `packages/content/src/trap.en.ts`
- `m_harmless_trap()`: `packages/content/src/trap.ts`
- `maketrap()`: `packages/content/src/trap.ts`
- `maybe_finish_sokoban()`: `packages/content/src/sokoban.ts`
- `minstapetrify()`: `packages/content/src/stoning.ts`
- `mintrap()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `mk_trap_statue()`: `packages/content/src/statue.ts`
- `mkroll_launch()`: `packages/content/src/trap.ts`
- `move_into_trap()`: `packages/content/src/untrap.en.ts`, `packages/content/src/untrap.ts`
- `mu_maybe_destroy_web()`: `packages/content/src/trap.ts`
- `openfallingtrap()`: `packages/content/src/zap.ts`
- `openholdingtrap()`: `packages/content/src/zap.ts`
- `reset_utrap()`: `packages/content/src/levitation.ts`
- `reward_untrap()`: `packages/content/src/untrap.ts`
- `seetrap()`: `packages/content/src/trap.ts`
- `set_utrap()`: `packages/content/src/trapstate.ts`
- `sokoban_guilt()`: `packages/content/src/sokoban.ts`
- `t_at()`: `packages/core/src/traps.ts`
- `t_missile()`: `packages/content/src/trap.ts`
- `thitm()`: `packages/content/src/trap.ts`
- `trapeffect_anti_magic()`: `packages/content/src/magictrap.ts`
- `trapeffect_fire_trap()`: `packages/content/src/magictrap.ts`
- `trapeffect_hole()`: `packages/content/src/trap.ts`
- `trapeffect_landmine()`: `packages/content/src/landmine.ts`, `packages/content/src/trap.en.ts`
- `trapeffect_magic_trap()`: `packages/content/src/magictrap.ts`, `packages/content/src/trap.en.ts`
- `trapeffect_pit()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `trapeffect_poly_trap()`: `packages/content/src/polyself.en.ts`, `packages/content/src/polyself.ts`
- `trapeffect_rolling_boulder_trap()`: `packages/content/src/rollboulder.ts`, `packages/content/src/trap.en.ts`
- `trapeffect_statue_trap()`: `packages/content/src/statue.ts`
- `trapeffect_web()`: `packages/content/src/trap.ts`
- `trapnote()`: `packages/content/src/trap.en.ts`
- `try_disarm()`: `packages/content/src/untrap.en.ts`, `packages/content/src/untrap.ts`
- `try_lift()`: `packages/content/src/untrap.ts`
- `unsqueak_ok()`: `packages/content/src/untrap.ts`
- `untrap()`: `packages/content/src/untrap.ts`
- `untrap_box()`: `packages/content/src/untrap.ts`
- `untrap_prob()`: `packages/content/src/untrap.ts`
- `water_damage()`: `packages/content/src/erode.en.ts`, `packages/content/src/spell.ts`, `packages/content/src/trap.ts`, `packages/content/src/water.ts`
- `water_damage_chain()`: `packages/content/src/water.ts`
- `wearing_iron_shoes()`: `packages/content/src/trap.ts`

## src/u_init.c

- `Skill_V()`: `packages/content/src/skills.ts`
- `Valkyrie()`: `packages/content/src/kit.ts`
- `ini_inv()`: `packages/content/src/kit.ts`
- `ini_inv_adjust_obj()`: `packages/content/src/kit.ts`
- `u_init()`: `packages/content/src/hero.ts`, `packages/content/src/hunger.ts`, `packages/content/src/kit.ts`, `packages/content/src/props.ts`, `packages/content/src/skills.ts`, `packages/content/src/uenergy.ts`

## src/uhitm.c

- (file): `packages/content/src/dog.en.ts`, `packages/content/src/messages.en.ts`, `packages/content/src/mhitu.ts`, `packages/content/src/resist.en.ts`
- `attack_checks()`: `packages/content/src/actions.ts`, `packages/content/src/kick.en.ts`, `packages/content/src/peaceful.ts`
- `do_attack()`: `packages/content/src/actions.ts`, `packages/content/src/combat.ts`
- `do_stone_mon()`: `packages/content/src/adtyping.ts`
- `do_stone_u()`: `packages/content/src/stoning.ts`
- `erode_armor()`: `packages/content/src/erode.ts`
- `find_roll_to_hit()`: `packages/content/src/combat.ts`
- `flash_hits_mon()`: `packages/content/src/zap.ts`
- `hitum()`: `packages/content/src/combat.ts`
- `hmon()`: `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon()`: `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon_barehands()`: `packages/content/src/combat.ts`
- `hmon_hitmon_dmg_recalc()`: `packages/content/src/combat.ts`, `packages/content/src/dothrow.ts`
- `hmon_hitmon_msg_hit()`: `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon_pet()`: `packages/content/src/combat.ts`, `packages/content/src/dog.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon_splitmon()`: `packages/content/src/combat.ts`
- `hmon_hitmon_weapon_melee()`: `packages/content/src/combat.ts`, `packages/content/src/dothrow.ts`
- `hmon_hitmon_weapon_ranged()`: `packages/content/src/dothrow.ts`
- `known_hitum()`: `packages/content/src/combat.ts`
- `mhitm_ad_()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitm.en.ts`, `packages/content/src/resist.en.ts`
- `mhitm_ad_blnd()`: `packages/content/src/adtyping.ts`, `packages/content/src/mstate.ts`
- `mhitm_ad_dgst()`: `packages/content/src/adtyping.ts`, `packages/content/src/dog.ts`
- `mhitm_ad_drli()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_halu()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_legs()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_phys()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/combat.ts`
- `mhitm_ad_ssex()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_ston()`: `packages/content/src/adtyping.ts`, `packages/content/src/stoning.en.ts`
- `mhitm_ad_were()`: `packages/content/src/adtyping.ts`
- `mhitm_adtyping()`: `packages/content/src/adtyping.ts`, `packages/content/src/combat.ts`, `packages/content/src/mhitu.ts`
- `mhitm_mgc_atk_negated()`: `packages/content/src/adtyping.ts`
- `missum()`: `packages/content/src/combat.ts`
- `nohandglow()`: `packages/content/src/combat.ts`
- `paranoid_query()`: `packages/content/src/peaceful.ts`
- `passive()`: `packages/content/src/dokick.ts`, `packages/content/src/resist.en.ts`, `packages/content/src/uhitm_passive.ts`
- `passive_obj()`: `packages/content/src/erode.ts`, `packages/content/src/uhitm_passive.ts`

## src/vault.c

- `hidden_gold()`: `packages/content/src/shk.ts`, `packages/content/src/urexp.ts`

## src/vision.c

- (file): `packages/content/src/mcastu.ts`, `packages/content/src/mhitu.ts`, `packages/content/src/travel.ts`, `packages/content/src/watch.ts`, `packages/core/src/perception.ts`, `packages/core/src/types/mod.ts`
- `circle_data()`: `packages/content/src/read.ts`, `packages/core/src/vision.ts`
- `circle_start()`: `packages/core/src/vision.ts`
- `clear_path()`: `packages/content/src/clearpath.ts`
- `couldsee()`: `packages/content/src/apparxy.ts`
- `do_clear_area()`: `packages/content/src/read.ts`
- `does_block()`: `packages/content/src/boulder.ts`, `packages/core/src/objects.ts`, `packages/core/src/types/mod.ts`, `packages/core/src/vision.ts`
- `vision_recalc()`: `packages/content/src/perception.ts`, `packages/core/src/engine.ts`, `packages/core/src/vision.ts`

## src/weapon.c

- (file): `packages/content/src/mdig.ts`, `packages/content/src/mongear.en.ts`, `packages/content/src/skills.en.ts`, `packages/content/src/skills.ts`
- `abon()`: `packages/content/src/combat.ts`
- `add_skills_to_menu()`: `packages/content/src/skills.ts`
- `add_weapon_skill()`: `packages/content/src/skills.ts`
- `can_advance()`: `packages/content/src/skills.ts`
- `could_advance()`: `packages/content/src/skills.ts`
- `dbon()`: `packages/content/src/combat.ts`
- `dmgval()`: `packages/content/src/dmgval.ts`, `packages/content/src/flooreffects.ts`, `packages/content/src/read.ts`
- `enhance_weapon_skill()`: `packages/content/src/skills.ts`
- `give_may_advance_msg()`: `packages/content/src/skills.ts`
- `hitval()`: `packages/content/src/combat.ts`
- `hwep()`: `packages/content/src/mongear.ts`
- `kebabable()`: `packages/content/src/combat.ts`
- `lose_weapon_skill()`: `packages/content/src/skills.ts`
- `mon_wield_item()`: `packages/content/src/mongear.ts`
- `peaked_skill()`: `packages/content/src/skills.ts`
- `possibly_unwield()`: `packages/content/src/were.ts`
- `rwep()`: `packages/content/src/mthrowu.ts`
- `select_hwep()`: `packages/content/src/mongear.ts`
- `select_rwep()`: `packages/content/src/mthrowu.ts`
- `skill_advance()`: `packages/content/src/skills.ts`
- `skill_init()`: `packages/content/src/skills.ts`
- `slots_required()`: `packages/content/src/skills.ts`
- `use_skill()`: `packages/content/src/skills.ts`
- `weapon_dam_bonus()`: `packages/content/src/skills.ts`
- `weapon_descr()`: `packages/content/src/trap.en.ts`, `packages/content/src/web.ts`
- `weapon_hit_bonus()`: `packages/content/src/skills.ts`

## src/were.c

- `counter_were()`: `packages/content/src/werestate.ts`
- `new_were()`: `packages/content/src/were.ts`
- `set_ulycn()`: `packages/content/src/werestate.ts`
- `were_beastie()`: `packages/content/src/werestate.ts`
- `were_change()`: `packages/content/src/were.ts`
- `were_summon()`: `packages/content/src/were.ts`
- `you_unwere()`: `packages/content/src/werestate.ts`

## src/wield.c

- (file): `packages/content/src/itemactions.ts`, `packages/content/src/stonetouch.ts`
- `cant_wield_corpse()`: `packages/content/src/stonetouch.ts`
- `chwepon()`: `packages/content/src/read.ts`
- `doswapweapon()`: `packages/content/src/itemactions.ts`, `packages/content/src/wield.ts`
- `dowield()`: `packages/content/src/itemactions.ts`
- `empty_handed()`: `packages/content/src/itemactions.ts`
- `freehand()`: `packages/content/src/container.ts`
- `ready_weapon()`: `packages/content/src/itemactions.ts`
- `setuswapwep()`: `packages/content/src/wield.ts`
- `welded()`: `packages/content/src/dothrow.ts`, `packages/content/src/itemactions.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/pray.ts`, `packages/content/src/untrap.ts`
- `weldmsg()`: `packages/content/src/dothrow.ts`, `packages/content/src/itemactions.ts`
- `wield_tool()`: `packages/content/src/itemactions.ts`
- `will_weld()`: `packages/content/src/itemactions.ts`, `packages/content/src/pray.ts`

## src/wizard.c

- `aggravate()`: `packages/content/src/mstate.ts`
- `cuss()`: `packages/content/src/chat.en.ts`, `packages/content/src/cuss.ts`
- `has_aggravatables()`: `packages/content/src/mcastu.ts`

## src/wizcmds.c

- (file): `packages/content/src/wizard/index.ts`, `packages/content/src/wizard/wizard.en.ts`
- `wiz_genesis()`: `packages/content/src/wizard/genesis.ts`
- `wiz_identify()`: `packages/content/src/wizard/identify.ts`
- `wiz_level_change()`: `packages/content/src/wizard/levelchange.ts`
- `wiz_level_tele()`: `packages/content/src/wizard/levelport.ts`
- `wiz_map()`: `packages/content/src/wizard/map.ts`
- `wiz_where()`: `packages/content/src/wizard/where.ts`
- `wiz_wish()`: `packages/content/src/wizard/wish.ts`

## src/worn.c

- (file): `packages/content/src/mongear.en.ts`
- `bypass_obj()`: `packages/content/src/bypass.ts`
- `clear_bypasses()`: `packages/content/src/bypass.ts`
- `find_mac()`: `packages/content/src/stats.ts`
- `m_dowear()`: `packages/content/src/mongear.ts`
- `m_dowear_type()`: `packages/content/src/mongear.ts`
- `m_lose_armor()`: `packages/content/src/breakarm.ts`
- `mon_adjust_speed()`: `packages/content/src/mstate.ts`
- `mon_break_armor()`: `packages/content/src/breakarm.ts`
- `mon_set_minvis()`: `packages/content/src/invis.ts`
- `setworn()`: `packages/content/src/jewelry.ts`, `packages/content/src/props.ts`
- `update_mon_extrinsics()`: `packages/content/src/invis.ts`
- `which_armor()`: `packages/content/src/mongear.ts`

## src/zap.c

- (file): `packages/content/src/dig.ts`, `packages/content/src/zap.en.ts`, `packages/content/src/zap.ts`
- `DMG_DESTROY_SCALE()`: `packages/content/src/erode.ts`
- `ZT_MAGIC_MISSILE()`: `packages/content/src/buzz.ts`
- `backfire()`: `packages/content/src/zap.ts`
- `bhit()`: `packages/content/src/dokick.ts`, `packages/content/src/dothrow.ts`, `packages/content/src/perception.ts`, `packages/content/src/web.ts`, `packages/content/src/zap.ts`
- `bhitm()`: `packages/content/src/zap.ts`
- `bhito()`: `packages/content/src/zap.ts`
- `bhitpile()`: `packages/content/src/zap.ts`
- `bounce_dir()`: `packages/content/src/buzz.ts`
- `boxlock_invent()`: `packages/content/src/zap.ts`
- `break_statue()`: `packages/content/src/statue.ts`
- `burn_floor_objects()`: `packages/content/src/buzz.ts`
- `cancel_item()`: `packages/content/src/zap.ts`
- `cancel_monst()`: `packages/content/src/mstate.ts`, `packages/content/src/zap.ts`
- `charged_objs()`: `packages/content/src/polyobj.ts`
- `create_polymon()`: `packages/content/src/polyobj.ts`
- `destroy_items()`: `packages/content/src/erode.ts`, `packages/content/src/explode.ts`
- `destroy_strings()`: `packages/content/src/erode.en.ts`, `packages/content/src/erode.ts`
- `destroyable()`: `packages/content/src/erode.ts`
- `do_enlightenment_effect()`: `packages/content/src/enlightenment.ts`
- `do_osshock()`: `packages/content/src/polyobj.ts`
- `dobuzz()`: `packages/content/src/buzz.ts`, `packages/core/src/types/event.ts`
- `dozap()`: `packages/content/src/zap.ts`
- `drain_item()`: `packages/content/src/adtyping.ts`
- `exclam()`: `packages/content/src/buzz.ts`, `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/trap.ts`, `packages/content/src/zap.ts`
- `flash_str()`: `packages/content/src/buzz.ts`
- `flashburn()`: `packages/content/src/buzz.ts`
- `fracture_rock()`: `packages/content/src/boulder.ts`
- `get_obj_location()`: `packages/content/src/chesttrap.ts`, `packages/content/src/polyobj.ts`
- `inventory_resistance_check()`: `packages/content/src/erode.ts`
- `learnwand()`: `packages/content/src/zap.ts`
- `makewish()`: `packages/content/src/wish.ts`, `packages/content/src/wizard/wish.ts`
- `maybe_destroy_item()`: `packages/content/src/erode.en.ts`, `packages/content/src/erode.ts`
- `mon_spell_hits_spot()`: `packages/content/src/buzz.ts`
- `obj_resists()`: `packages/content/src/meat.ts`, `packages/content/src/polyobj.ts`
- `obj_shudders()`: `packages/content/src/polyobj.ts`
- `obj_unpolyable()`: `packages/content/src/polyobj.ts`
- `poly_obj()`: `packages/content/src/polyobj.ts`
- `probe_monster()`: `packages/content/src/zap.ts`
- `release_hold()`: `packages/content/src/zap.ts`
- `resist()`: `packages/content/src/buzz.ts`
- `revive()`: `packages/content/src/revive.ts`
- `spell_damage_bonus()`: `packages/content/src/spellcalc.ts`
- `spell_hit_bonus()`: `packages/content/src/spellcalc.ts`
- `stone_to_flesh_obj()`: `packages/content/src/stoneflesh.ts`
- `tmp_at()`: `packages/content/src/dothrow.ts`
- `u_adtyp_resistance_obj()`: `packages/content/src/erode.ts`
- `ubuzz()`: `packages/content/src/zap.ts`
- `unpolyable()`: `packages/content/src/polyobj.ts`
- `unturn_dead()`: `packages/content/src/revive.ts`
- `weffects()`: `packages/content/src/zap.ts`, `packages/core/src/types/mod.ts`
- `zap_hit()`: `packages/content/src/buzz.ts`
- `zap_over_floor()`: `packages/content/src/buzz.ts`
- `zap_updown()`: `packages/content/src/zap.ts`
- `zapnodir()`: `packages/content/src/teleport.ts`, `packages/content/src/zap.ts`
- `zappable()`: `packages/content/src/zap.ts`
- `zapsetup()`: `packages/content/src/polyobj.ts`
- `zapwrapup()`: `packages/content/src/polyobj.ts`
- `zapyourself()`: `packages/content/src/zap.ts`
- `zhitm()`: `packages/content/src/buzz.ts`
- `zhitu()`: `packages/content/src/buzz.ts`
