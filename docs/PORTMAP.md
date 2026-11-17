# Port map

Where each NetHack function lives in this port, generated from the `// ref:` citations in
`packages/*/src` by `pnpm portmap` (`packages/testkit/tools/portmap.ts`). Do not edit by hand;
a test fails when it is stale. Names are what the citation lists after the file (functions,
tables and data macros such as `WEAPON()`); a citation that names no file is placed through
the function definitions in `vendor/nethack/src`. `(file)` lists citations of the file as a
whole. A missing function may still be ported under a citation this parser cannot read.

196 NetHack files, 5787 citations.

## dat/asmodeus.lua

- (file): `packages/content/src/asmodeus.ts`, `packages/content/src/levelflags.ts`

## dat/baalz.lua

- (file): `packages/content/src/baalz.ts`, `packages/content/src/levelflags.ts`

## dat/bigrm-1.lua

- (file): `packages/content/src/bigroom.ts`, `packages/content/src/levelflags.ts`

## dat/bigrm-10.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-11.lua

- (file): `packages/content/src/bigroom.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`

## dat/bigrm-12.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-13.lua

- (file): `packages/content/src/bigroom.ts`, `packages/content/src/levelflags.ts`

## dat/bigrm-2.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-3.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-4.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-5.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-6.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-7.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-8.lua

- (file): `packages/content/src/bigroom.ts`

## dat/bigrm-9.lua

- (file): `packages/content/src/bigroom.ts`

## dat/castle.lua

- (file): `packages/content/src/castle.ts`, `packages/content/src/levelflags.ts`

## dat/dungeon.lua

- (file): `packages/content/src/bigroom.ts`, `packages/content/src/dungeon.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/medusa.ts`, `packages/core/src/types/mod.ts`

## dat/fakewiz1.lua

- (file): `packages/content/src/fakewiz.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/portal.ts`

## dat/fakewiz2.lua

- (file): `packages/content/src/fakewiz.ts`, `packages/content/src/levelflags.ts`

## dat/hellfill.lua

- (file): `packages/content/src/hellfill.ts`, `packages/content/src/levelflags.ts`
- `hell_prefabs()`: `packages/content/src/hellfill.ts`
- `populatemaze()`: `packages/content/src/hellfill.ts`
- `rnd_halign()`: `packages/content/src/hellfill.ts`
- `rnd_hell_prefab()`: `packages/content/src/hellfill.ts`
- `rnd_valign()`: `packages/content/src/hellfill.ts`

## dat/juiblex.lua

- (file): `packages/content/src/juiblex.ts`, `packages/content/src/levelflags.ts`

## dat/knox.lua

- (file): `packages/content/src/knox.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/portal.ts`
- `treasure_spot()`: `packages/content/src/knox.ts`

## dat/medusa-1.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/medusa.ts`

## dat/medusa-2.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/medusa.ts`

## dat/medusa-3.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/medusa.ts`

## dat/medusa-4.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/medusa.ts`

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

- (file): `packages/content/src/knox.ts`
- `hell_tweaks()`: `packages/content/src/hellfill.ts`, `packages/content/src/helltweaks.ts`
- `percent()`: `packages/content/src/medusa.ts`, `packages/content/src/orctown.ts`, `packages/content/src/selection.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `shuffle()`: `packages/content/src/sp_lev.ts`

## dat/oracle.lua

- (file): `packages/content/src/oracle.ts`

## dat/orcus.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/orcus.ts`

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

## dat/valley.lua

- (file): `packages/content/src/levelflags.ts`, `packages/content/src/valley.ts`

## dat/wizard1.lua

- (file): `packages/content/src/ladder.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/wiztower.ts`

## dat/wizard2.lua

- (file): `packages/content/src/ladder.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/wiztower.ts`

## dat/wizard3.lua

- (file): `packages/content/src/ladder.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/portal.ts`, `packages/content/src/wiztower.ts`

## include/align.h

- (file): `packages/content/src/align.ts`, `packages/content/src/aligntyp.ts`, `packages/content/src/luck.ts`, `packages/content/src/offer.ts`
- `ALGN_SINNED()`: `packages/content/src/aligntyp.ts`
- `A_CHAOTIC()`: `packages/content/src/roletab.ts`, `packages/core/src/types/entity.ts`
- `A_NEUTRAL()`: `packages/content/src/luck.ts`
- `A_NONE()`: `packages/content/src/aligntyp.ts`
- `Align2amask()`: `packages/content/src/mimic.ts`

## include/artifact.h

- (file): `packages/content/src/artilist.ts`
- `SPFX_()`: `packages/content/src/artilist.ts`
- `u_wield_art()`: `packages/content/src/artistate.ts`

## include/artilist.h

- (file): `packages/content/src/artilist.ts`

## include/attrib.h

- (file): `packages/content/src/attrib.ts`, `packages/content/src/combat.ts`, `packages/content/src/roletab.ts`, `packages/core/src/types/entity.ts`
- `ABASE()`: `packages/content/src/attrstate.ts`
- `AMAX()`: `packages/content/src/attrstate.ts`
- `ATTRMAX()`: `packages/content/src/attrstate.ts`
- `ATTRMIN()`: `packages/content/src/attrstate.ts`
- `A_STR()`: `packages/content/src/fountain.ts`
- `STR18()`: `packages/content/src/polyself.ts`
- `STR19()`: `packages/content/src/polyself.ts`

## include/color.h

- `CLR_GREEN()`: `packages/content/src/muse.ts`
- `CLR_MAX()`: `packages/content/src/chesttrap.ts`

## include/context.h

- (file): `packages/content/src/digstate.ts`, `packages/content/src/engrave.ts`, `packages/content/src/run.ts`, `packages/content/src/uhunger.ts`
- `no_of_wizards()`: `packages/content/src/wizstate.ts`

## include/decl.h

- `xdir()`: `packages/content/src/breakwand.ts`
- `ydir()`: `packages/content/src/breakwand.ts`

## include/defsym.h

- (file): `packages/content/src/terrain.ts`, `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `S_EEL()`: `packages/content/src/mondata.ts`
- `S_arrow_trap()`: `packages/content/src/trap.ts`
- `S_bars()`: `packages/content/src/terrain.ts`
- `S_corr()`: `packages/content/src/terrain.ts`
- `S_crwall()`: `packages/content/src/terrain.ts`
- `S_dnstair()`: `packages/content/src/terrain.ts`
- `S_grave()`: `packages/content/src/mimicstate.ts`, `packages/content/src/terrain.ts`
- `S_ice()`: `packages/content/src/terrain.ts`
- `S_ndoor()`: `packages/content/src/terrain.ts`
- `S_room()`: `packages/content/src/terrain.ts`
- `S_stone()`: `packages/content/src/terrain.ts`
- `S_throne()`: `packages/content/src/terrain.ts`
- `S_tree()`: `packages/content/src/terrain.ts`
- `S_upladder()`: `packages/content/src/terrain.ts`
- `S_upstair()`: `packages/content/src/terrain.ts`
- `S_vcdoor()`: `packages/content/src/terrain.ts`
- `S_vodoor()`: `packages/content/src/terrain.ts`
- `S_vwall()`: `packages/content/src/terrain.ts`

## include/display.h

- (file): `packages/content/src/invis.ts`, `packages/content/src/perception.ts`
- `_canseemon()`: `packages/content/src/invis.ts`
- `_mon_visible()`: `packages/content/src/invis.ts`, `packages/content/src/perception.ts`
- `_mon_warning()`: `packages/content/src/perception.ts`
- `_tp_sensemon()`: `packages/content/src/perception.ts`
- `covers_objects()`: `packages/core/src/traps.ts`, `packages/core/src/types/mod.ts`
- `covers_traps()`: `packages/core/src/traps.ts`
- `explosion_to_glyph()`: `packages/content/src/explode.ts`
- `glyph_is_invisible()`: `packages/content/src/invis.ts`
- `is_door_mappear()`: `packages/content/src/mimicstate.ts`
- `is_safemon()`: `packages/content/src/actions.ts`
- `mon_visible()`: `packages/content/src/invis.ts`
- `obj_to_glyph()`: `packages/content/src/statuestate.ts`, `packages/core/src/types/mod.ts`
- `sensemon()`: `packages/content/src/perception.ts`
- `zap_color_()`: `packages/content/src/buzz.ts`

## include/dog.h

- `dogfood()`: `packages/content/src/dog.ts`

## include/dungeon.h

- (file): `packages/core/src/types/state.ts`
- `Is_juiblex_level()`: `packages/content/src/liquid.ts`
- `Is_knox()`: `packages/content/src/levelflags.ts`
- `Is_rogue_level()`: `packages/content/src/levelflags.ts`
- `Is_sanctum()`: `packages/content/src/levelflags.ts`
- `Is_valley()`: `packages/content/src/levelflags.ts`
- `d_level()`: `packages/core/src/types/level.ts`

## include/engrave.h

- (file): `packages/content/src/engr.ts`

## include/extern.h

- `mhis()`: `packages/content/src/leashstate.ts`

## include/flag.h

- (file): `packages/content/src/generation.ts`, `packages/content/src/knoxstate.ts`, `packages/content/src/magic.ts`

## include/global.h

- (file): `packages/content/src/artistate.ts`, `packages/content/src/engr.ts`, `packages/content/src/engrave.ts`, `packages/content/src/engrread.ts`, `packages/content/src/hero.ts`, `packages/content/src/skills.ts`, `packages/content/src/untrap.ts`, `packages/content/src/vanquished.ts`, `packages/content/src/wish.ts`, `packages/content/src/wizard/genesis.ts`, `packages/content/src/write.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/rooms.ts`
- `LARGEST_INT()`: `packages/content/src/hero.ts`, `packages/content/src/seduce.ts`
- `PL_NSIZ()`: `packages/content/src/vault.ts`

## include/hack.h

- (file): `packages/content/src/adtyping.ts`, `packages/content/src/endstate.ts`, `packages/content/src/explode.ts`, `packages/content/src/items.ts`, `packages/content/src/price.ts`, `packages/content/src/stats.ts`, `packages/content/src/wish.ts`
- `AC_VALUE()`: `packages/content/src/combat.ts`
- `ARM_BONUS()`: `packages/content/src/material.ts`
- `A_CG_CONVERT()`: `packages/content/src/dowear.ts`
- `BOLT_LIM()`: `packages/content/src/covetous.ts`, `packages/content/src/dip.ts`, `packages/content/src/dothrow.ts`, `packages/content/src/invis.ts`, `packages/content/src/mhitu.ts`, `packages/content/src/monmove.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/muse.ts`, `packages/content/src/perception.ts`, `packages/content/src/priest.ts`, `packages/content/src/shapeshift.ts`, `packages/content/src/shkpay.ts`, `packages/content/src/trap.ts`
- `BZ_OFS_AD()`: `packages/content/src/mthrowu.ts`
- `BZ_VALID_ADTYP()`: `packages/content/src/mthrowu.ts`
- `Blindfolded_only()`: `packages/content/src/dip.ts`
- `DIR_180()`: `packages/content/src/trapstate.ts`
- `EF_()`: `packages/content/src/erode.ts`
- `ERODE_()`: `packages/content/src/erode.ts`
- `ER_()`: `packages/content/src/erode.ts`
- `ER_NOTHING()`: `packages/content/src/water.ts`
- `EXT_ENCUMBER()`: `packages/content/src/magic.ts`, `packages/content/src/pray.ts`
- `FATAL_DAMAGE_MODIFIER()`: `packages/content/src/artihit.ts`
- `HVY_ENCUMBER()`: `packages/content/src/pray.ts`, `packages/content/src/untrap.ts`
- `MAGIC_COOKIE()`: `packages/content/src/buzz.ts`
- `MATCH_WARN_OF_MON()`: `packages/content/src/perception.ts`
- `MAX_EGG_HATCH_TIME()`: `packages/content/src/eggstate.ts`
- `MOD_ENCUMBER()`: `packages/content/src/hero.ts`, `packages/content/src/wish.ts`
- `MON_POLE_DIST()`: `packages/content/src/mthrowu.ts`
- `Maybe_Half_Phys()`: `packages/content/src/props.ts`
- `NODIAG()`: `packages/content/src/monmove.ts`
- `POLY_CONTROLLED()`: `packages/content/src/polyself.ts`
- `POTHIT_HERO_THROW()`: `packages/content/src/potionhit.ts`
- `POTION_OCCUPANT_CHANCE()`: `packages/content/src/bottle.ts`
- `ROTTEN_TIN()`: `packages/content/src/tins.ts`
- `ROT_AGE()`: `packages/content/src/corpses.ts`
- `SHOP_DOOR_COST()`: `packages/content/src/shopdamage.ts`
- `SHOP_HOLE_COST()`: `packages/content/src/shopdamage.ts`
- `SHOP_PIT_COST()`: `packages/content/src/shopdamage.ts`
- `SHOP_WALL_COST()`: `packages/content/src/shopdamage.ts`
- `SLT_ENCUMBER()`: `packages/content/src/dokick.ts`, `packages/content/src/drown.ts`
- `TAINT_AGE()`: `packages/content/src/corpses.ts`
- `TROLL_REVIVE_CHANCE()`: `packages/content/src/corpses.ts`
- `VAULT_GUARD_TIME()`: `packages/content/src/vaultstate.ts`
- `VIS_EFFECTS()`: `packages/content/src/scatter.ts`
- `WAND_BACKFIRE_CHANCE()`: `packages/content/src/engrave.ts`, `packages/content/src/muse.ts`, `packages/content/src/zap.ts`
- `invlet_basic()`: `packages/content/src/wish.ts`
- `isok()`: `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/mkmap.ts`
- `nonrotting_food()`: `packages/content/src/eat.ts`
- `um_dist()`: `packages/content/src/vault.ts`
- `xdir()`: `packages/content/src/worm.ts`
- `ydir()`: `packages/content/src/worm.ts`

## include/hacklib.h

- `dist2()`: `packages/content/src/monmove.ts`
- `distmin()`: `packages/content/src/monmove.ts`

## include/mcastu.h

- `MONSPELL()`: `packages/content/src/mcastu.ts`

## include/mextra.h

- (file): `packages/content/src/dog.ts`, `packages/content/src/epri.ts`, `packages/content/src/eshk.ts`, `packages/content/src/vaultstate.ts`
- `REPAIR_DELAY()`: `packages/content/src/shopdamage.ts`

## include/mhitm.h

- `M_ATTK_()`: `packages/content/src/adtyping.ts`

## include/mkroom.h

- (file): `packages/content/src/epri.ts`, `packages/content/src/eshk.ts`, `packages/content/src/oracle.ts`, `packages/content/src/shtypes.ts`, `packages/content/src/vaultstate.ts`, `packages/content/src/zoo.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/types/level.ts`
- `IS_SHOP()`: `packages/content/src/eshk.ts`
- `sbrooms()`: `packages/core/src/types/level.ts`

## include/monattk.h

- (file): `packages/core/src/types/mod.ts`
- `AD_()`: `packages/content/src/artilist.ts`
- `AD_MAGM()`: `packages/content/src/hero.ts`
- `AT_()`: `packages/content/src/hero.ts`, `packages/core/src/types/mod.ts`

## include/mondata.h

- (file): `packages/content/src/mondata.ts`, `packages/content/src/monmove.ts`, `packages/content/src/musestate.ts`, `packages/content/src/race.ts`
- `MZ_TINY()`: `packages/content/src/mthrowu.ts`
- `NODIAG()`: `packages/content/src/muse.ts`
- `S_BAT()`: `packages/content/src/monmove.ts`
- `acidic()`: `packages/content/src/dog.ts`, `packages/content/src/muse.ts`
- `amorphous()`: `packages/content/src/mondata.ts`, `packages/content/src/polyself.ts`
- `amphibious()`: `packages/content/src/mondata.ts`
- `bigmonst()`: `packages/content/src/corpses.ts`, `packages/content/src/dokick.ts`, `packages/content/src/mondata.ts`, `packages/content/src/monmove.ts`
- `breathless()`: `packages/content/src/mondata.ts`
- `can_teleport()`: `packages/content/src/monmove.ts`
- `cant_drown()`: `packages/content/src/mondata.ts`
- `cantweararm()`: `packages/content/src/mondata.ts`, `packages/content/src/mongear.ts`
- `cantwield()`: `packages/content/src/itemactions.ts`, `packages/content/src/mondata.ts`
- `carnivorous()`: `packages/content/src/dog.ts`, `packages/content/src/mondata.ts`
- `ceiling_hider()`: `packages/content/src/hidestate.ts`
- `completelyburns()`: `packages/content/src/golem.ts`
- `completelyrots()`: `packages/content/src/adtyping.ts`, `packages/content/src/golem.ts`
- `completelyrusts()`: `packages/content/src/adtyping.ts`, `packages/content/src/golem.ts`
- `corpse_eater()`: `packages/content/src/meat.ts`
- `digests()`: `packages/content/src/engulfstate.ts`
- `eggs_in_water()`: `packages/content/src/eggstate.ts`
- `enfolds()`: `packages/content/src/engulfstate.ts`
- `flaming()`: `packages/content/src/engulfstate.ts`
- `flesh_petrifies()`: `packages/content/src/stonestate.ts`
- `has_head()`: `packages/content/src/mondata.ts`
- `has_horns()`: `packages/content/src/mondata.ts`
- `haseyes()`: `packages/content/src/adtyping.ts`, `packages/content/src/muse.ts`, `packages/content/src/musestate.ts`
- `helpless()`: `packages/content/src/mhitm.ts`
- `herbivorous()`: `packages/content/src/dog.ts`, `packages/content/src/mondata.ts`
- `hides_under()`: `packages/content/src/hidestate.ts`
- `humanoid()`: `packages/content/src/mondata.ts`, `packages/content/src/peaceful.ts`
- `is_animal()`: `packages/content/src/musestate.ts`, `packages/content/src/steal.ts`
- `is_bat()`: `packages/content/src/mondata.ts`, `packages/content/src/muse.ts`, `packages/content/src/polyself.ts`
- `is_clinger()`: `packages/content/src/mondata.ts`
- `is_covetous()`: `packages/content/src/mondata.ts`
- `is_demon()`: `packages/content/src/mondata.ts`
- `is_dlord()`: `packages/content/src/mondata.ts`
- `is_domestic()`: `packages/content/src/dog.ts`
- `is_dprince()`: `packages/content/src/mondata.ts`
- `is_floater()`: `packages/content/src/mondata.ts`, `packages/content/src/muse.ts`, `packages/content/src/musestate.ts`, `packages/content/src/polyself.ts`
- `is_flyer()`: `packages/content/src/mondata.ts`
- `is_giant()`: `packages/content/src/givit.ts`
- `is_golem()`: `packages/content/src/golem.ts`
- `is_hider()`: `packages/content/src/hidestate.ts`
- `is_human()`: `packages/content/src/werestate.ts`
- `is_longworm()`: `packages/content/src/wormstate.ts`
- `is_lord()`: `packages/content/src/mondata.ts`
- `is_mercenary()`: `packages/content/src/mongear.ts`, `packages/content/src/muse.ts`
- `is_mplayer()`: `packages/content/src/mondata.ts`
- `is_ndemon()`: `packages/content/src/mondata.ts`
- `is_placeholder()`: `packages/content/src/newcham.ts`
- `is_prince()`: `packages/content/src/mondata.ts`
- `is_rider()`: `packages/content/src/newcham.ts`
- `is_shapeshifter()`: `packages/content/src/chamstate.ts`
- `is_silent()`: `packages/content/src/potionhit.ts`
- `is_swimmer()`: `packages/content/src/mondata.ts`
- `is_unicorn()`: `packages/content/src/mondata.ts`
- `is_vampire()`: `packages/content/src/chamstate.ts`
- `is_wanderer()`: `packages/content/src/monmove.ts`
- `is_watch()`: `packages/content/src/watch.ts`
- `is_were()`: `packages/content/src/werestate.ts`
- `is_whirly()`: `packages/content/src/engulfstate.ts`, `packages/content/src/mondata.ts`
- `lays_eggs()`: `packages/content/src/eggstate.ts`
- `likes_fire()`: `packages/content/src/mondata.ts`
- `likes_gems()`: `packages/content/src/mongear.ts`
- `likes_gold()`: `packages/content/src/mongear.ts`
- `likes_lava()`: `packages/content/src/mondata.ts`, `packages/content/src/uwater.ts`
- `likes_objs()`: `packages/content/src/mongear.ts`
- `locomotion()`: `packages/content/src/adtyping.ts`, `packages/content/src/muse.ts`
- `metallivorous()`: `packages/content/src/tin.ts`
- `mindless()`: `packages/content/src/muse.ts`, `packages/content/src/musestate.ts`
- `mon_hates_blessings()`: `packages/content/src/mondata.ts`, `packages/content/src/silver.ts`
- `needspick()`: `packages/content/src/mdig.ts`
- `nohands()`: `packages/content/src/apply.ts`, `packages/content/src/mondata.ts`
- `nolimbs()`: `packages/content/src/mondata.ts`
- `noncorporeal()`: `packages/content/src/mondata.ts`
- `nonliving()`: `packages/content/src/mondata.ts`
- `notake()`: `packages/content/src/itemactions.ts`, `packages/content/src/mondata.ts`
- `passes_walls()`: `packages/content/src/muse.ts`
- `perceives()`: `packages/content/src/invis.ts`
- `pm_invisible()`: `packages/content/src/invis.ts`, `packages/content/src/polyself.ts`
- `poisonous()`: `packages/content/src/dog.ts`
- `poly_when_stoned()`: `packages/content/src/golem.ts`, `packages/content/src/stoning.ts`, `packages/content/src/upoly.ts`
- `polyok()`: `packages/content/src/newcham.ts`
- `race_hostile()`: `packages/content/src/race.ts`
- `race_peaceful()`: `packages/content/src/race.ts`
- `regenerates()`: `packages/content/src/mstate.ts`
- `resists_disint()`: `packages/content/src/buzz.ts`
- `resists_ston()`: `packages/content/src/stonestate.ts`
- `slimeproof()`: `packages/content/src/slimestate.ts`
- `slithy()`: `packages/content/src/adtyping.ts`, `packages/content/src/dosit.ts`, `packages/content/src/mondata.ts`
- `sticks()`: `packages/content/src/mondata.ts`, `packages/content/src/polyself.ts`
- `strongmonst()`: `packages/content/src/mondata.ts`
- `telepathic()`: `packages/content/src/givit.ts`, `packages/content/src/polyself.ts`, `packages/content/src/price.ts`
- `thick_skinned()`: `packages/content/src/dokick.ts`
- `throws_rocks()`: `packages/content/src/muse.ts`
- `touch_petrifies()`: `packages/content/src/stonestate.ts`
- `tunnels()`: `packages/content/src/mdig.ts`
- `unsolid()`: `packages/content/src/leash.ts`, `packages/content/src/mhitm.ts`, `packages/content/src/polyself.ts`
- `vegan()`: `packages/content/src/dog.ts`, `packages/content/src/meat.ts`, `packages/content/src/mondata.ts`
- `vegetarian()`: `packages/content/src/mondata.ts`, `packages/content/src/shtypes.ts`
- `verysmall()`: `packages/content/src/mondata.ts`, `packages/content/src/monmove.ts`, `packages/content/src/muse.ts`
- `vtense()`: `packages/content/src/muse.ts`
- `webmaker()`: `packages/content/src/polyself.ts`, `packages/content/src/trap.ts`
- `weirdnonliving()`: `packages/content/src/mondata.ts`
- `your_race()`: `packages/content/src/race.ts`

## include/monflag.h

- `M3_COVETOUS()`: `packages/content/src/mondata.ts`
- `MZ_HUGE()`: `packages/content/src/engulf.ts`, `packages/content/src/mhurtle.ts`, `packages/content/src/mondata.ts`
- `MZ_HUMAN()`: `packages/content/src/mondata.ts`, `packages/content/src/zap.ts`
- `MZ_SMALL()`: `packages/content/src/mondata.ts`
- `MZ_TINY()`: `packages/content/src/items.ts`, `packages/content/src/mondata.ts`
- `ms_sounds()`: `packages/core/src/types/mod.ts`

## include/monst.h

- (file): `packages/content/src/chamstate.ts`, `packages/content/src/hidestate.ts`, `packages/content/src/leashstate.ts`, `packages/content/src/mstate.ts`, `packages/content/src/wizstate.ts`, `packages/content/src/worm.ts`, `packages/core/src/types/entity.ts`, `packages/testkit/src/invariants.ts`
- `MON_WEP()`: `packages/content/src/artidef.ts`, `packages/content/src/mongear.ts`
- `M_SEEN_()`: `packages/content/src/musestate.ts`
- `engulfing_u()`: `packages/content/src/engulfstate.ts`
- `m_ap_type()`: `packages/content/src/mimicstate.ts`
- `monmax_difficulty()`: `packages/content/src/generation.ts`
- `monmin_difficulty()`: `packages/content/src/generation.ts`
- `vampshifted()`: `packages/content/src/chamstate.ts`

## include/monsters.h

- (file): `packages/content/src/minion.ts`, `packages/content/src/mondata.ts`, `packages/content/src/monsters.ts`, `packages/content/src/nasty.ts`, `packages/content/src/newcham.ts`, `packages/testkit/src/convert/emit.ts`
- `MON()`: `packages/content/src/monsters.ts`
- `PM_ALIGNED_CLERIC()`: `packages/content/src/epri.ts`
- `PM_CROESUS()`: `packages/content/src/gehennom.ts`
- `PM_GHOST()`: `packages/content/src/priest.ts`
- `PM_GUARD()`: `packages/content/src/vault.ts`
- `PM_KNIGHT()`: `packages/content/src/medusa.ts`
- `PM_MEDUSA()`: `packages/content/src/mhitm.ts`
- `PM_ORACLE()`: `packages/content/src/oracle.ts`
- `PM_SHOPKEEPER()`: `packages/content/src/eshk.ts`
- `PM_WIZARD_OF_YENDOR()`: `packages/content/src/wizstate.ts`

## include/obj.h

- (file): `packages/content/src/btrapstate.ts`, `packages/content/src/dilute.ts`, `packages/content/src/leashstate.ts`, `packages/content/src/material.ts`, `packages/core/src/types/entity.ts`
- `CORPSTAT_HISTORIC()`: `packages/content/src/statuestate.ts`
- `Is_candle()`: `packages/content/src/burnstate.ts`, `packages/content/src/price.ts`
- `Is_container()`: `packages/core/src/objects.ts`
- `Is_mbag()`: `packages/content/src/container.ts`
- `MAX_ERODE()`: `packages/core/src/types/entity.ts`
- `MAX_OIL_IN_FLASK()`: `packages/content/src/dilute.ts`
- `SPE_LIM()`: `packages/content/src/objnam_read.ts`
- `WrappingAllowed()`: `packages/content/src/mondata.ts`, `packages/content/src/mongear.ts`
- `ammo_and_launcher()`: `packages/content/src/mthrowu.ts`
- `greatest_erosion()`: `packages/content/src/material.ts`
- `ignitable()`: `packages/content/src/light.ts`
- `inv_rank()`: `packages/content/src/kit.ts`
- `is_ammo()`: `packages/content/src/mthrowu.ts`
- `is_axe()`: `packages/content/src/mdig.ts`
- `is_blade()`: `packages/content/src/combat.ts`, `packages/content/src/force.ts`, `packages/content/src/skills.ts`
- `is_flimsy()`: `packages/content/src/material.ts`
- `is_graystone()`: `packages/content/src/kit.ts`
- `is_launcher()`: `packages/content/src/mthrowu.ts`
- `is_missile()`: `packages/content/src/mthrowu.ts`
- `is_pick()`: `packages/content/src/mdig.ts`
- `is_pole()`: `packages/content/src/skills.ts`
- `is_weptool()`: `packages/content/src/material.ts`
- `is_wet_towel()`: `packages/content/src/glib.ts`
- `matching_launcher()`: `packages/content/src/mthrowu.ts`
- `mwelded()`: `packages/content/src/mdig.ts`, `packages/content/src/mongear.ts`
- `stale_egg()`: `packages/content/src/eggstate.ts`

## include/objclass.h

- (file): `packages/content/src/material.ts`, `packages/core/src/types/entity.ts`, `packages/core/src/types/mod.ts`
- `Is_container()`: `packages/core/src/types/mod.ts`
- `is_corrodeable()`: `packages/content/src/material.ts`
- `is_crackable()`: `packages/content/src/material.ts`
- `is_damageable()`: `packages/content/src/material.ts`
- `is_launcher()`: `packages/core/src/types/mod.ts`
- `is_metallic()`: `packages/content/src/material.ts`
- `is_organic()`: `packages/content/src/material.ts`, `packages/content/src/meat.ts`
- `is_rustprone()`: `packages/content/src/material.ts`
- `is_sword()`: `packages/content/src/itemactions.ts`

## include/objects.h

- (file): `packages/content/src/boulder.ts`, `packages/content/src/force.ts`, `packages/content/src/gem.ts`, `packages/content/src/music.ts`, `packages/content/src/objects.ts`, `packages/content/src/spellcalc.ts`, `packages/content/src/statuestate.ts`, `packages/content/src/stoneflesh.ts`, `packages/content/src/untrap.ts`, `packages/core/src/types/mod.ts`, `packages/testkit/src/convert/emit.ts`
- `AMULET()`: `packages/content/src/objects.ts`
- `ARMOR()`: `packages/content/src/objects.ts`
- `BOOTS()`: `packages/content/src/objects.ts`
- `BOW()`: `packages/content/src/objects.ts`
- `CLOAK()`: `packages/content/src/objects.ts`
- `COIN()`: `packages/content/src/objects.ts`
- `CONTAINER()`: `packages/content/src/container.ts`, `packages/content/src/objects.ts`
- `DRGN_ARMR()`: `packages/content/src/objects.ts`
- `EYEWEAR()`: `packages/content/src/objects.ts`
- `FAKE_AMULET_OF_YENDOR()`: `packages/content/src/nasty.ts`
- `FOOD()`: `packages/content/src/objects.ts`
- `GEM()`: `packages/content/src/objects.ts`
- `GLOVES()`: `packages/content/src/objects.ts`
- `HELM()`: `packages/content/src/objects.ts`
- `KICKING_BOOTS()`: `packages/content/src/dokick.ts`
- `OBJECT()`: `packages/content/src/mimicstate.ts`, `packages/content/src/objects.ts`
- `POTION()`: `packages/content/src/objects.ts`
- `POT_WATER()`: `packages/content/src/zap.ts`
- `PROJECTILE()`: `packages/content/src/objects.ts`
- `RING()`: `packages/content/src/gem.ts`, `packages/content/src/objects.ts`
- `ROCK()`: `packages/content/src/objects.ts`
- `SCROLL()`: `packages/content/src/objects.ts`
- `SHIELD()`: `packages/content/src/objects.ts`
- `SKELETON_KEY()`: `packages/content/src/lockstate.ts`
- `SPELL()`: `packages/content/src/objects.ts`, `packages/content/src/spellcalc.ts`, `packages/content/src/zap.ts`
- `SPE_BOOK_OF_THE_DEAD()`: `packages/content/src/deadbook.ts`, `packages/content/src/steal.ts`
- `STRANGE_OBJECT()`: `packages/content/src/mimicstate.ts`
- `TOOL()`: `packages/content/src/objects.ts`
- `WAND()`: `packages/content/src/objects.ts`, `packages/content/src/zap.ts`
- `WEAPON()`: `packages/content/src/objects.ts`
- `WEPTOOL()`: `packages/content/src/objects.ts`

## include/permonst.h

- (file): `packages/core/src/types/mod.ts`
- `NORMAL_SPEED()`: `packages/content/src/worm.ts`, `packages/core/src/types/entity.ts`

## include/prop.h

- (file): `packages/content/src/props.ts`, `packages/core/src/types/entity.ts`
- `LEFT_SIDE()`: `packages/content/src/legs.ts`
- `W_ACCESSORY()`: `packages/content/src/props.ts`
- `W_RINGL()`: `packages/core/src/types/entity.ts`

## include/rm.h

- (file): `packages/content/src/dbstate.ts`, `packages/content/src/eshk.ts`, `packages/content/src/grave.ts`, `packages/content/src/liquid.ts`, `packages/content/src/shopdamage.ts`, `packages/content/src/sokoban.ts`, `packages/content/src/terrain.ts`, `packages/content/src/vault.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/terrain.ts`
- `ACCESSIBLE()`: `packages/content/src/jump.ts`, `packages/content/src/vault.ts`
- `AM_SHRINE()`: `packages/core/src/types/level.ts`
- `DB_MOAT()`: `packages/content/src/dbstate.ts`
- `DB_NORTH()`: `packages/content/src/dbstate.ts`
- `DRAWBRIDGE_UP()`: `packages/content/src/terrain.ts`
- `D_LOCKED()`: `packages/content/src/terrain.ts`, `packages/core/src/levelgen/grid.ts`, `packages/core/src/levelgen/terrain.ts`, `packages/core/src/types/mod.ts`
- `D_NODOOR()`: `packages/core/src/levelgen/grid.ts`
- `D_TRAPPED()`: `packages/content/src/btrapstate.ts`
- `IS_DRAWBRIDGE()`: `packages/content/src/dbstate.ts`
- `IS_FURNITURE()`: `packages/content/src/terrain.ts`, `packages/content/src/zap.ts`
- `IS_GRAVE()`: `packages/content/src/grave.ts`
- `IS_OBSTRUCTED()`: `packages/content/src/run.ts`, `packages/content/src/terrain.ts`, `packages/core/src/levelgen/grid.ts`
- `IS_ROOM()`: `packages/content/src/monmove.ts`, `packages/content/src/shknam.ts`, `packages/content/src/shopdamage.ts`, `packages/content/src/vault.ts`
- `IS_STWALL()`: `packages/content/src/cast.ts`, `packages/content/src/terrain.ts`
- `IS_WALL()`: `packages/content/src/terrain.ts`, `packages/core/src/levelgen/grid.ts`
- `T_LOOTED()`: `packages/content/src/thronestate.ts`
- `closed_door()`: `packages/content/src/shapeshift.ts`
- `levl()`: `packages/core/src/levelgen/grid.ts`

## include/skills.h

- (file): `packages/content/src/skills.ts`
- `P_BARE_HANDED_COMBAT()`: `packages/content/src/skills.ts`
- `P_BASIC()`: `packages/content/src/skilltab.ts`
- `P_ISRESTRICTED()`: `packages/content/src/skills.ts`
- `P_SKILL_LIMIT()`: `packages/content/src/skills.ts`
- `martial_bonus()`: `packages/content/src/skills.ts`
- `practice_needed_to_advance()`: `packages/content/src/skills.ts`

## include/sp_lev.h

- (file): `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/rect.ts`

## include/spell.h

- `MAX_SPELL_STUDY()`: `packages/content/src/spell.ts`
- `SPELL_LEV_PW()`: `packages/content/src/spellcalc.ts`

## include/stairs.h

- (file): `packages/core/src/types/level.ts`

## include/timeout.h

- `MELT_ICE_AWAY()`: `packages/content/src/icestate.ts`

## include/trap.h

- (file): `packages/content/src/trap.ts`, `packages/core/src/types/level.ts`, `packages/core/src/types/mod.ts`
- `Trap_Effect_Finished()`: `packages/content/src/trap.ts`
- `is_hole()`: `packages/content/src/trapstate.ts`
- `is_magical_trap()`: `packages/content/src/trap.ts`
- `is_pit()`: `packages/content/src/trapstate.ts`
- `madeby_u()`: `packages/content/src/sokoban.ts`
- `undestroyable_trap()`: `packages/content/src/invocation.ts`

## include/vision.h

- `MAX_RADIUS()`: `packages/content/src/burnstate.ts`, `packages/core/src/vision.ts`
- `m_canseeu()`: `packages/content/src/apparxy.ts`

## include/weight.h

- (file): `packages/content/src/stats.ts`
- `WT_ELF()`: `packages/content/src/landmine.ts`
- `WT_HUMAN()`: `packages/content/src/mondata.ts`
- `WT_NOISY_INV()`: `packages/content/src/fumble.ts`
- `WT_SPLASH_THRESHOLD()`: `packages/content/src/flooreffects.ts`
- `WT_SQUEEZABLE_INV()`: `packages/content/src/moverock.ts`
- `WT_TOOMUCH_DIAGONAL()`: `packages/content/src/actions.ts`, `packages/content/src/drown.ts`
- `WT_WOUNDEDLEG_REDUCT()`: `packages/content/src/stats.ts`

## include/you.h

- (file): `packages/content/src/engulfstate.ts`, `packages/content/src/gem.ts`, `packages/content/src/hero.ts`, `packages/content/src/hunger.ts`, `packages/content/src/luck.ts`, `packages/content/src/racetab.ts`, `packages/content/src/roletab.ts`, `packages/content/src/trapstate.ts`, `packages/content/src/uenergy.ts`, `packages/content/src/upoly.ts`, `packages/content/src/urooms.ts`, `packages/content/src/werestate.ts`
- `AC_MAX()`: `packages/content/src/stats.ts`
- `Race_if()`: `packages/content/src/urole.ts`
- `Role_if()`: `packages/content/src/urole.ts`
- `SICK_VOMITABLE()`: `packages/content/src/uhunger.ts`
- `uhim()`: `packages/content/src/gender.ts`
- `uhis()`: `packages/content/src/gender.ts`

## include/youprop.h

- (file): `packages/content/src/artitouch.ts`, `packages/content/src/glib.ts`, `packages/content/src/invis.ts`, `packages/content/src/jump.ts`, `packages/content/src/props.ts`, `packages/content/src/trapstate.ts`, `packages/content/src/upoly.ts`, `packages/content/src/uwater.ts`, `packages/core/src/types/entity.ts`
- `Half_gas_damage()`: `packages/content/src/glib.ts`
- `Hate_silver()`: `packages/content/src/silver.ts`
- `Known_wwalking()`: `packages/content/src/uwater.ts`
- `Lev_at_will()`: `packages/content/src/trapstate.ts`
- `Very_fast()`: `packages/content/src/dowear.ts`
- `maybe_polyd()`: `packages/content/src/race.ts`

## src/allmain.c

- (file): `packages/content/src/fumble.ts`, `packages/content/src/perception.ts`
- `age_spells()`: `packages/content/src/spell.ts`
- `interrupt_occupation()`: `packages/content/src/eat.ts`
- `makedog()`: `packages/core/src/types/mod.ts`
- `maybe_generate_rnd_mon()`: `packages/content/src/generation.ts`
- `moveloop_core()`: `packages/content/src/actions.ts`, `packages/content/src/detect.ts`, `packages/content/src/dig.ts`, `packages/content/src/drown.ts`, `packages/content/src/eat.ts`, `packages/content/src/engr.ts`, `packages/content/src/engrave.ts`, `packages/content/src/hero.ts`, `packages/content/src/hunger.ts`, `packages/content/src/lock.ts`, `packages/content/src/polyself.ts`, `packages/content/src/pray.ts`, `packages/content/src/spell.ts`, `packages/content/src/towel.ts`, `packages/content/src/trap.ts`, `packages/content/src/vault.ts`, `packages/core/src/turn.ts`
- `newgame()`: `packages/app/src/title.ts`, `packages/content/src/gehennom.ts`, `packages/core/src/engine.ts`, `packages/core/src/types/mod.ts`
- `regen_hp()`: `packages/content/src/hero.ts`
- `regen_pw()`: `packages/content/src/hero.ts`
- `stop_occupation()`: `packages/content/src/combat.ts`, `packages/content/src/digstate.ts`, `packages/content/src/eat.ts`, `packages/content/src/force.ts`, `packages/content/src/lockstate.ts`
- `u_calc_moveamt()`: `packages/content/src/stats.ts`, `packages/core/src/types/mod.ts`
- `u_on_upstairs()`: `packages/core/src/engine.ts`
- `welcome()`: `packages/content/src/messages.en.ts`, `packages/core/src/character.ts`, `packages/core/src/host.ts`

## src/apply.c

- (file): `packages/content/src/apply.en.ts`, `packages/content/src/jump.ts`, `packages/content/src/leashstate.ts`, `packages/content/src/tin.en.ts`, `packages/content/src/water.ts`
- `broken_wand_explode()`: `packages/content/src/breakwand.ts`
- `calc_pole_range()`: `packages/content/src/pole.ts`
- `catch_lit()`: `packages/content/src/light.ts`
- `check_jump()`: `packages/content/src/jump.ts`
- `check_leash()`: `packages/content/src/leash.ts`
- `discard_broken_wand()`: `packages/content/src/breakwand.ts`
- `display_jump_positions()`: `packages/content/src/jump.ts`
- `display_polearm_positions()`: `packages/content/src/pole.ts`
- `do_blinding_ray()`: `packages/content/src/camera.ts`, `packages/content/src/invoke.ts`
- `do_break_wand()`: `packages/content/src/breakwand.ts`
- `doapply()`: `packages/content/src/apply.ts`
- `dojump()`: `packages/content/src/jump.ts`
- `dorub()`: `packages/content/src/rub.ts`
- `fig_transform()`: `packages/content/src/figurine.ts`
- `figurine_location_checks()`: `packages/content/src/figurine.ts`
- `find_poleable_mon()`: `packages/content/src/pole.ts`
- `get_mleash()`: `packages/content/src/leashstate.ts`
- `get_valid_jump_position()`: `packages/content/src/jump.ts`
- `get_valid_polearm_position()`: `packages/content/src/pole.ts`
- `is_valid_jump_pos()`: `packages/content/src/jump.en.ts`, `packages/content/src/jump.ts`
- `its_dead()`: `packages/content/src/kittools.en.ts`, `packages/content/src/stethoscope.ts`
- `jelly_ok()`: `packages/content/src/rub.ts`
- `jump()`: `packages/content/src/cast.ts`, `packages/content/src/jump.en.ts`, `packages/content/src/jump.ts`
- `leashable()`: `packages/content/src/leash.ts`
- `light_cocktail()`: `packages/content/src/apply.en.ts`, `packages/content/src/oil.ts`
- `m_unleash()`: `packages/content/src/leashstate.ts`
- `magic_whistled()`: `packages/content/src/apply.ts`
- `number_leashed()`: `packages/content/src/leashstate.ts`
- `o_unleash()`: `packages/content/src/leashstate.ts`
- `rub_ok()`: `packages/content/src/rub.ts`
- `snuff_candle()`: `packages/content/src/apply.en.ts`, `packages/content/src/light.ts`
- `snuff_lit()`: `packages/content/src/light.ts`
- `splash_lit()`: `packages/content/src/erode.en.ts`, `packages/content/src/water.ts`
- `tinnable()`: `packages/content/src/tin.ts`
- `um_dist()`: `packages/content/src/leash.ts`, `packages/content/src/shkpay.ts`
- `unfixable_trouble_count()`: `packages/content/src/potion.ts`
- `unleash_all()`: `packages/content/src/leashstate.ts`
- `use_bell()`: `packages/content/src/apply.ts`
- `use_camera()`: `packages/content/src/camera.ts`, `packages/content/src/kittools.en.ts`
- `use_candle()`: `packages/content/src/light.ts`
- `use_cream_pie()`: `packages/content/src/creampie.en.ts`, `packages/content/src/creampie.ts`
- `use_figurine()`: `packages/content/src/figurine.en.ts`, `packages/content/src/figurine.ts`
- `use_lamp()`: `packages/content/src/apply.en.ts`, `packages/content/src/light.ts`
- `use_leash()`: `packages/content/src/kittools.en.ts`, `packages/content/src/leash.ts`
- `use_leash_core()`: `packages/content/src/kittools.en.ts`, `packages/content/src/leash.ts`
- `use_magic_whistle()`: `packages/content/src/apply.ts`
- `use_pole()`: `packages/content/src/apply.en.ts`, `packages/content/src/pole.ts`
- `use_royal_jelly()`: `packages/content/src/rub.ts`
- `use_stethoscope()`: `packages/content/src/kittools.en.ts`, `packages/content/src/stethoscope.ts`
- `use_tinning_kit()`: `packages/content/src/tin.en.ts`, `packages/content/src/tin.ts`
- `use_towel()`: `packages/content/src/towel.en.ts`, `packages/content/src/towel.ts`
- `use_unicorn_horn()`: `packages/content/src/unicorn.en.ts`, `packages/content/src/unicorn.ts`
- `use_whistle()`: `packages/content/src/apply.ts`

## src/artifact.c

- (file): `packages/content/src/untrap.ts`
- `MB_MAX_DIEROLL()`: `packages/content/src/artihit.ts`
- `Mb_hit()`: `packages/content/src/artifact.en.ts`, `packages/content/src/artihit.ts`
- `Sting_effects()`: `packages/content/src/artiglow.ts`
- `any_quest_artifact()`: `packages/content/src/artistate.ts`
- `arti_cost()`: `packages/content/src/artistate.ts`
- `arti_invoke()`: `packages/content/src/artifact.en.ts`, `packages/content/src/invoke.ts`, `packages/content/src/props.ts`
- `arti_invoke_cost()`: `packages/content/src/invoke.ts`
- `arti_invoke_cost_pw()`: `packages/content/src/invoke.ts`
- `arti_reflects()`: `packages/content/src/artidef.ts`
- `artifact_exists()`: `packages/content/src/artistate.ts`
- `artifact_hit()`: `packages/content/src/artifact.en.ts`, `packages/content/src/artihit.ts`
- `artifact_light()`: `packages/content/src/light.ts`
- `artifact_name()`: `packages/content/src/artistate.ts`
- `artifact_origin()`: `packages/content/src/artistate.ts`
- `attacks()`: `packages/content/src/artifact.ts`
- `bane_applies()`: `packages/content/src/artifact.ts`
- `confers_luck()`: `packages/content/src/gem.ts`
- `defends()`: `packages/content/src/artidef.ts`
- `defends_when_carried()`: `packages/content/src/artidef.ts`
- `discover_artifact()`: `packages/content/src/artistate.ts`
- `disp_artifact_discoveries()`: `packages/content/src/itemactions.ts`
- `doinvoke()`: `packages/content/src/invoke.ts`
- `exist_artifact()`: `packages/content/src/artistate.ts`
- `find_artifact()`: `packages/content/src/artistate.ts`
- `found_artifact()`: `packages/content/src/artistate.ts`
- `get_artifact()`: `packages/content/src/artistate.ts`
- `glow_color()`: `packages/content/src/artiglow.ts`
- `glow_strength()`: `packages/content/src/artiglow.ts`
- `glow_verb()`: `packages/content/src/artiglow.ts`
- `hack_artifacts()`: `packages/content/src/artistate.ts`
- `has_magic_key()`: `packages/content/src/artifact.ts`
- `invoke_banish()`: `packages/content/src/invoke.ts`
- `invoke_blinding_ray()`: `packages/content/src/invoke.ts`
- `invoke_charge_obj()`: `packages/content/src/invoke.ts`
- `invoke_create_ammo()`: `packages/content/src/invoke.ts`
- `invoke_create_portal()`: `packages/content/src/invoke.ts`
- `invoke_energy_boost()`: `packages/content/src/invoke.ts`
- `invoke_fling_poison()`: `packages/content/src/invoke.ts`
- `invoke_healing()`: `packages/content/src/invoke.ts`
- `invoke_ok()`: `packages/content/src/invoke.ts`
- `invoke_storm_spell()`: `packages/content/src/cast.ts`
- `is_art()`: `packages/content/src/artistate.ts`
- `is_magic_key()`: `packages/content/src/artifact.ts`
- `mb_verb()`: `packages/content/src/artihit.ts`
- `mk_artifact()`: `packages/content/src/artistate.ts`, `packages/content/src/offer.ts`
- `nartifact_exist()`: `packages/content/src/artistate.ts`
- `nothing_special()`: `packages/content/src/invoke.ts`
- `protects()`: `packages/content/src/artidef.ts`
- `restrict_name()`: `packages/content/src/artiname.ts`
- `retouch_equipment()`: `packages/content/src/artitouch.ts`
- `retouch_object()`: `packages/content/src/artitouch.ts`
- `set_artifact_intrinsic()`: `packages/content/src/props.ts`
- `shade_glare()`: `packages/content/src/dmgval.ts`
- `spec_ability()`: `packages/content/src/artifact.ts`
- `spec_abon()`: `packages/content/src/artifact.ts`
- `spec_applies()`: `packages/content/src/artifact.ts`
- `spec_dbon()`: `packages/content/src/artifact.ts`
- `spec_m2()`: `packages/content/src/props.ts`
- `touch_artifact()`: `packages/content/src/artifact.ts`, `packages/content/src/artitouch.ts`
- `undiscovered_artifact()`: `packages/content/src/artistate.ts`
- `untouchable()`: `packages/content/src/artitouch.ts`

## src/attrib.c

- (file): `packages/content/src/props.ts`, `packages/content/src/racetab.ts`, `packages/content/src/resist.en.ts`, `packages/content/src/role.en.ts`, `packages/content/src/roletab.ts`
- `acurr()`: `packages/content/src/attrstate.ts`
- `acurrstr()`: `packages/content/src/stats.ts`
- `adjabil()`: `packages/content/src/props.ts`, `packages/content/src/roletab.ts`
- `adjalign()`: `packages/content/src/luck.ts`
- `adjattrib()`: `packages/content/src/attrib.ts`, `packages/content/src/attrstate.ts`, `packages/content/src/hero.ts`
- `arc_abil()`: `packages/content/src/roletab.ts`
- `change_luck()`: `packages/content/src/luck.ts`
- `dwa_abil()`: `packages/content/src/racetab.ts`
- `extremeattr()`: `packages/content/src/jewelry.ts`
- `gainstr()`: `packages/content/src/attrib.ts`
- `init_attr()`: `packages/content/src/hero.ts`
- `init_attr_role_redist()`: `packages/content/src/hero.ts`
- `losestr()`: `packages/content/src/hp.ts`
- `minusattr()`: `packages/content/src/resist.en.ts`
- `newhp()`: `packages/content/src/align.ts`, `packages/content/src/hero.ts`
- `plusattr()`: `packages/content/src/resist.en.ts`
- `poisoned()`: `packages/content/src/attrib.ts`, `packages/content/src/resist.en.ts`
- `poisontell()`: `packages/content/src/attrib.ts`, `packages/content/src/resist.en.ts`
- `redist_attr()`: `packages/content/src/polyself.ts`
- `rnd_attr()`: `packages/content/src/hero.ts`
- `set_moreluck()`: `packages/content/src/gem.ts`
- `stone_luck()`: `packages/content/src/gem.ts`
- `uchangealign()`: `packages/content/src/dowear.ts`
- `val_abil()`: `packages/content/src/stats.ts`
- `vary_init_attr()`: `packages/content/src/hero.ts`

## src/ball.c

- `litter()`: `packages/content/src/shkdamage.ts`

## src/botl.c

- (file): `packages/content/src/polyself.ts`, `packages/content/src/props.ts`, `packages/content/src/stats.ts`, `packages/core/src/types/mod.ts`, `packages/core/src/view.ts`
- `BL_MASK_LEV()`: `packages/content/src/levitation.ts`
- `bl_slime()`: `packages/content/src/slime.ts`
- `bl_slippery()`: `packages/content/src/towel.ts`
- `bl_stone()`: `packages/content/src/stoning.ts`
- `bl_strngl()`: `packages/content/src/jewelry.ts`
- `bot2()`: `packages/content/src/hero.ts`, `packages/ui/src/status.ts`
- `describe_level()`: `packages/content/src/gehennom.ts`, `packages/ui/src/status.ts`
- `do_statusline1()`: `packages/content/src/botl.ts`, `packages/content/src/role.en.ts`, `packages/ui/src/status.ts`
- `do_statusline2()`: `packages/ui/src/status.ts`
- `get_strength_str()`: `packages/ui/src/status.ts`
- `rank()`: `packages/content/src/botl.ts`
- `rank_of()`: `packages/content/src/botl.ts`
- `xlev_to_rank()`: `packages/content/src/botl.ts`

## src/cmd.c

- (file): `packages/app/src/keys.ts`, `packages/content/src/actions.ts`, `packages/content/src/dosit.ts`, `packages/content/src/engrave.ts`, `packages/content/src/quit.ts`, `packages/content/src/wizard/index.ts`, `packages/ui/src/host.ts`
- `NHKF_GETPOS_VALID_NEXT()`: `packages/ui/src/getpos.ts`
- `commands_init()`: `packages/app/src/keys.ts`
- `confdir()`: `packages/content/src/dig.ts`, `packages/content/src/hackmove.ts`
- `do_run()`: `packages/content/src/run.ts`
- `do_rush()`: `packages/content/src/run.ts`
- `dokeylist()`: `packages/ui/src/help.ts`
- `domonability()`: `packages/content/src/monability.en.ts`, `packages/content/src/monability.ts`
- `donull()`: `packages/content/src/actions.ts`
- `dotravel()`: `packages/content/src/travel.ts`
- `extcmdlist()`: `packages/app/src/keys.ts`
- `getdir()`: `packages/content/src/dig.ts`, `packages/content/src/dokick.ts`, `packages/content/src/hackmove.ts`, `packages/content/src/zap.ts`
- `set_move_cmd()`: `packages/content/src/run.ts`
- `set_occupation()`: `packages/content/src/force.ts`, `packages/content/src/tins.ts`
- `xytodir()`: `packages/content/src/trapstate.ts`

## src/dbridge.c

- `automiss()`: `packages/content/src/dbridge.ts`
- `close_drawbridge()`: `packages/content/src/dbridge.en.ts`, `packages/content/src/dbridge.ts`, `packages/content/src/levelflags.ts`
- `create_drawbridge()`: `packages/content/src/dbridge.ts`, `packages/content/src/dbstate.ts`, `packages/content/src/levelflags.ts`
- `destroy_drawbridge()`: `packages/content/src/dbridge.ts`
- `do_entity()`: `packages/content/src/dbridge.en.ts`, `packages/content/src/dbridge.ts`
- `e_at()`: `packages/content/src/dbridge.ts`
- `e_died()`: `packages/content/src/dbridge.en.ts`, `packages/content/src/dbridge.ts`
- `e_jumps()`: `packages/content/src/dbridge.ts`
- `e_missed()`: `packages/content/src/dbridge.ts`
- `e_nam()`: `packages/content/src/dbridge.ts`
- `e_survives_at()`: `packages/content/src/dbridge.ts`
- `find_drawbridge()`: `packages/content/src/dbstate.ts`
- `get_wall_for_db()`: `packages/content/src/dbstate.ts`
- `is_db_wall()`: `packages/content/src/dbstate.ts`
- `is_drawbridge_wall()`: `packages/content/src/dbstate.ts`
- `is_ice()`: `packages/content/src/liquid.ts`
- `is_lava()`: `packages/content/src/liquid.ts`, `packages/core/src/types/mod.ts`
- `is_moat()`: `packages/content/src/liquid.ts`
- `is_pool()`: `packages/content/src/liquid.ts`, `packages/content/src/terrain.ts`, `packages/core/src/types/mod.ts`
- `is_pool_or_lava()`: `packages/content/src/liquid.ts`
- `is_waterwall()`: `packages/content/src/liquid.ts`
- `m_to_e()`: `packages/content/src/dbridge.ts`
- `open_drawbridge()`: `packages/content/src/dbridge.en.ts`, `packages/content/src/dbridge.ts`
- `set_entity()`: `packages/content/src/dbridge.ts`
- `u_to_e()`: `packages/content/src/dbridge.ts`

## src/decl.c

- `c_obj_colors()`: `packages/content/src/chesttrap.ts`
- `dirs_ord()`: `packages/content/src/hackmove.ts`, `packages/content/src/travel.ts`
- `x_maze_max()`: `packages/core/src/levelgen/spdef.ts`
- `xdir()`: `packages/content/src/priest.ts`, `packages/content/src/trapstate.ts`
- `ydir()`: `packages/content/src/priest.ts`, `packages/content/src/trapstate.ts`

## src/detect.c

- (file): `packages/content/src/zap.en.ts`
- `check_map_spot()`: `packages/content/src/detectobj.ts`
- `clear_stale_map()`: `packages/content/src/detectobj.ts`
- `cvt_sdoor_to_door()`: `packages/content/src/actions.ts`, `packages/content/src/levelflags.ts`
- `detect_obj_traps()`: `packages/content/src/detectobj.ts`
- `display_trap_map()`: `packages/content/src/detectobj.ts`
- `do_mapping()`: `packages/content/src/detectobj.ts`, `packages/content/src/wizard/map.ts`
- `do_vicinity_map()`: `packages/content/src/detect.ts`, `packages/content/src/detectobj.ts`
- `dosearch0()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `findit()`: `packages/content/src/zap.ts`
- `findone()`: `packages/content/src/zap.ts`
- `food_detect()`: `packages/content/src/detectobj.ts`
- `gold_detect()`: `packages/content/src/detectobj.ts`
- `mfind0()`: `packages/content/src/actions.ts`
- `monster_detect()`: `packages/content/src/cast.ts`, `packages/content/src/detect.ts`, `packages/content/src/magic.en.ts`
- `o_in()`: `packages/content/src/detectobj.ts`
- `o_material()`: `packages/content/src/detectobj.ts`
- `object_detect()`: `packages/content/src/detectobj.ts`
- `premap_detect()`: `packages/content/src/detect.ts`
- `sense_trap()`: `packages/content/src/detectobj.ts`
- `show_map_spot()`: `packages/content/src/detect.ts`, `packages/content/src/wizard/map.ts`
- `skip_premap_detect()`: `packages/content/src/detect.ts`
- `trap_detect()`: `packages/content/src/detectobj.ts`

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
- `fillholetyp()`: `packages/content/src/liquidflow.ts`
- `furniture_handled()`: `packages/content/src/dig.ts`
- `holetime()`: `packages/content/src/shkdamage.ts`
- `is_digging()`: `packages/content/src/digstate.ts`
- `liquid_flow()`: `packages/content/src/liquidflow.ts`
- `mdig_tunnel()`: `packages/content/src/mdig.ts`
- `pick_can_reach()`: `packages/content/src/dig.ts`
- `rot_corpse()`: `packages/content/src/corpses.ts`
- `use_pick_axe()`: `packages/content/src/dig.ts`
- `use_pick_axe2()`: `packages/content/src/dig.ts`
- `watch_dig()`: `packages/content/src/watch.ts`
- `watchman_canseeu()`: `packages/content/src/watch.ts`
- `zap_dig()`: `packages/content/src/dig.en.ts`, `packages/content/src/dig.ts`

## src/display.c

- (file): `packages/content/src/boulder.ts`, `packages/content/src/invis.ts`, `packages/content/src/mimicstate.ts`, `packages/content/src/perception.ts`, `packages/content/src/terrain.ts`, `packages/core/src/perception.ts`, `packages/core/src/types/mod.ts`, `packages/render-ascii/src/renderer.ts`
- `GLYPH_INVISIBLE()`: `packages/content/src/invis.ts`
- `canseemon()`: `packages/content/src/trap.ts`
- `covers_objects()`: `packages/core/src/engine.ts`, `packages/core/src/query.ts`, `packages/core/src/view.ts`
- `covers_traps()`: `packages/core/src/query.ts`, `packages/core/src/view.ts`
- `display_monster()`: `packages/content/src/detect.ts`, `packages/content/src/mimicstate.ts`, `packages/content/src/perception.ts`
- `display_self()`: `packages/core/src/types/mod.ts`, `packages/core/src/view.ts`
- `magic_map_background()`: `packages/content/src/wizard/map.ts`
- `map_glyphinfo()`: `packages/content/src/statuestate.ts`
- `map_invisible()`: `packages/content/src/invis.ts`, `packages/core/src/memory.ts`, `packages/core/src/types/mod.ts`, `packages/render-ascii/src/renderer.ts`
- `map_object()`: `packages/core/src/engine.ts`
- `map_trap()`: `packages/core/src/view.ts`
- `mon_visible()`: `packages/core/src/perception.ts`
- `newsym()`: `packages/content/src/perception.ts`, `packages/core/src/engine.ts`, `packages/core/src/memory.ts`, `packages/core/src/perception.ts`
- `reset_glyphmap()`: `packages/core/src/view.ts`
- `see_monsters()`: `packages/content/src/artiglow.ts`
- `swallowed()`: `packages/content/src/perception.ts`, `packages/ui/src/host.ts`
- `tmp_at()`: `packages/core/src/types/event.ts`
- `unmap_invisible()`: `packages/core/src/memory.ts`
- `zapdir_to_glyph()`: `packages/ui/src/host.ts`

## src/display.h

- `canspotmon()`: `packages/content/src/perception.ts`, `packages/core/src/query.ts`
- `canspotself()`: `packages/core/src/types/mod.ts`
- `mon_visible()`: `packages/core/src/types/mod.ts`

## src/do.c

- (file): `packages/content/src/align.ts`, `packages/content/src/itemactions.ts`, `packages/content/src/items.ts`, `packages/content/src/trap.en.ts`
- `assign_graphics()`: `packages/content/src/rogue.ts`, `packages/core/src/types/mod.ts`
- `boulder_hits_pool()`: `packages/content/src/dbstate.ts`, `packages/content/src/flooreffects.ts`
- `canletgo()`: `packages/content/src/itemactions.ts`, `packages/content/src/muse.ts`
- `doaltarobj()`: `packages/content/src/align.en.ts`
- `doddrop()`: `packages/content/src/itemactions.ts`
- `dodown()`: `packages/content/src/actions.ts`, `packages/content/src/gehennom.ts`, `packages/content/src/levitation.ts`, `packages/content/src/trap.ts`
- `dodrop()`: `packages/content/src/itemactions.ts`
- `dotrap()`: `packages/content/src/trap.ts`
- `doup()`: `packages/content/src/actions.ts`
- `dowipe()`: `packages/content/src/creampie.ts`
- `drop()`: `packages/content/src/itemactions.ts`
- `dropx()`: `packages/content/src/itemactions.ts`, `packages/content/src/items.ts`
- `dropy()`: `packages/content/src/itemactions.ts`
- `dropz()`: `packages/content/src/itemactions.ts`, `packages/content/src/items.ts`
- `engulfer_digests_food()`: `packages/content/src/digestfood.ts`
- `flooreffects()`: `packages/content/src/align.ts`, `packages/content/src/flooreffects.ts`, `packages/content/src/floorfx.ts`
- `goto_level()`: `packages/content/src/actions.ts`, `packages/content/src/gehennom.ts`, `packages/content/src/genocide.ts`, `packages/content/src/hero.ts`, `packages/content/src/knox.en.ts`, `packages/content/src/ladder.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/lock.ts`, `packages/content/src/messages.en.ts`, `packages/content/src/portal.ts`, `packages/content/src/rogue.en.ts`, `packages/content/src/rogue.ts`, `packages/content/src/rooms.ts`, `packages/content/src/shkdamage.ts`, `packages/content/src/trap.ts`, `packages/core/src/engine.ts`, `packages/core/src/types/mod.ts`
- `heal_legs()`: `packages/content/src/legs.ts`, `packages/content/src/props.ts`
- `hellish_smoke_mesg()`: `packages/content/src/temperature.ts`
- `legs_in_no_shape()`: `packages/content/src/legs.ts`
- `maybe_reset_pick()`: `packages/content/src/lock.ts`
- `menu_drop()`: `packages/content/src/itemactions.ts`
- `mnexto()`: `packages/core/src/engine.ts`
- `reset_utrap()`: `packages/content/src/trap.ts`
- `revive_corpse()`: `packages/content/src/revive.ts`, `packages/content/src/zap.en.ts`
- `revive_mon()`: `packages/content/src/revive.ts`, `packages/content/src/zap.en.ts`
- `set_wounded_legs()`: `packages/content/src/legs.ts`
- `stairway_find_from()`: `packages/content/src/ladder.ts`
- `temperature_change_msg()`: `packages/content/src/temperature.ts`
- `u_on_newpos()`: `packages/core/src/engine.ts`, `packages/core/src/types/mod.ts`
- `u_stuck_cannot_go()`: `packages/content/src/actions.ts`
- `uescaped_shaft()`: `packages/content/src/trap.ts`
- `uteetering_at_seen_pit()`: `packages/content/src/trap.ts`
- `wipeoff()`: `packages/content/src/creampie.ts`

## src/do_name.c

- (file): `packages/content/src/dig.en.ts`
- `do_oname()`: `packages/content/src/call.ts`
- `docall_xname()`: `packages/content/src/call.ts`
- `docallcmd()`: `packages/content/src/call.ts`
- `ghostnames()`: `packages/content/src/generation.ts`
- `hcolor()`: `packages/content/src/dip.ts`
- `mhim()`: `packages/content/src/read.ts`
- `mon_nam()`: `packages/content/src/perception.ts`
- `name_from_player()`: `packages/content/src/call.ts`
- `name_ok()`: `packages/content/src/call.ts`
- `objtyp_is_callable()`: `packages/content/src/call.ts`
- `oname()`: `packages/content/src/artiname.ts`, `packages/content/src/artistate.ts`
- `pmname()`: `packages/content/src/gender.ts`, `packages/content/src/perception.ts`
- `rndghostname()`: `packages/content/src/generation.ts`
- `rndmonnam()`: `packages/content/src/perception.ts`
- `safe_oname()`: `packages/content/src/call.ts`
- `some_mon_nam()`: `packages/content/src/perception.ts`
- `surface()`: `packages/content/src/moverock.ts`
- `x_monnam()`: `packages/content/src/gender.ts`, `packages/content/src/perception.ts`

## src/do_wear.c

- (file): `packages/content/src/invis.ts`, `packages/content/src/itemactions.ts`
- `Amulet_off()`: `packages/content/src/jewelry.ts`
- `Amulet_on()`: `packages/content/src/jewelry.ts`
- `Armor_gone()`: `packages/content/src/dowear.ts`
- `Armor_off()`: `packages/content/src/dowear.ts`
- `Armor_on()`: `packages/content/src/dowear.ts`
- `Blindf_off()`: `packages/content/src/jewelry.ts`
- `Blindf_on()`: `packages/content/src/jewelry.ts`, `packages/content/src/towel.en.ts`, `packages/testkit/src/invariants.ts`
- `Boots_off()`: `packages/content/src/dowear.ts`
- `Boots_on()`: `packages/content/src/dowear.ts`
- `Cloak_off()`: `packages/content/src/dowear.ts`, `packages/content/src/invis.ts`
- `Cloak_on()`: `packages/content/src/dowear.ts`, `packages/content/src/invis.ts`, `packages/content/src/props.ts`
- `Gloves_off()`: `packages/content/src/dowear.ts`
- `Gloves_on()`: `packages/content/src/dowear.ts`
- `Helmet_off()`: `packages/content/src/dowear.ts`
- `Helmet_on()`: `packages/content/src/dowear.ts`
- `Ring_gone()`: `packages/content/src/jewelry.ts`
- `Ring_off()`: `packages/content/src/jewelry.ts`
- `Ring_off_or_gone()`: `packages/content/src/jewelry.ts`
- `Ring_on()`: `packages/content/src/jewelry.ts`, `packages/content/src/props.ts`
- `Type_gone()`: `packages/content/src/dowear.ts`
- `Type_off()`: `packages/content/src/dowear.ts`
- `Type_on()`: `packages/content/src/dowear.ts`
- `accessory_or_armor_on()`: `packages/content/src/jewelry.en.ts`, `packages/content/src/jewelry.ts`
- `adj_abon()`: `packages/content/src/attrstate.ts`, `packages/content/src/dowear.ts`
- `adjust_attrib()`: `packages/content/src/attrstate.ts`, `packages/content/src/jewelry.ts`
- `armor_or_accessory_off()`: `packages/content/src/jewelry.ts`
- `c_cloak()`: `packages/content/src/itemactions.ts`
- `canwearobj()`: `packages/content/src/itemactions.ts`
- `cursed()`: `packages/content/src/itemactions.ts`, `packages/content/src/jewelry.ts`
- `destroy_arm()`: `packages/content/src/seffect.ts`
- `disintegrate_arm()`: `packages/content/src/seffect.ts`
- `doputon()`: `packages/content/src/jewelry.ts`
- `doremring()`: `packages/content/src/jewelry.ts`
- `dotakeoff()`: `packages/content/src/itemactions.ts`
- `dowear()`: `packages/content/src/itemactions.ts`
- `dragon_armor_handling()`: `packages/content/src/props.ts`
- `equip_ok()`: `packages/content/src/itemactions.ts`
- `find_ac()`: `packages/content/src/props.ts`, `packages/content/src/stats.ts`
- `fingers_or_gloves()`: `packages/content/src/glib.ts`
- `freehand()`: `packages/content/src/pray.ts`
- `glibr()`: `packages/content/src/towel.en.ts`, `packages/content/src/towel.ts`
- `hard_helmet()`: `packages/content/src/material.ts`, `packages/content/src/read.ts`, `packages/content/src/trap.ts`
- `inaccessible_equipment()`: `packages/content/src/dip.ts`
- `learnring()`: `packages/content/src/jewelry.ts`
- `maybe_destroy_armor()`: `packages/content/src/seffect.ts`
- `obj_erode_type()`: `packages/content/src/seffect.ts`
- `racial_exception()`: `packages/content/src/polyarmor.ts`
- `select_off()`: `packages/content/src/jewelry.en.ts`
- `some_armor()`: `packages/content/src/adtyping.ts`, `packages/content/src/seffect.ts`
- `stuck_ring()`: `packages/content/src/pray.ts`
- `toggle_displacement()`: `packages/content/src/dowear.ts`, `packages/content/src/items.en.ts`
- `toggle_stealth()`: `packages/content/src/dowear.ts`, `packages/content/src/items.en.ts`, `packages/content/src/jewelry.ts`
- `wornarm_destroyed()`: `packages/content/src/seffect.ts`

## src/dog.c

- (file): `packages/content/src/dog.en.ts`
- `abuse_dog()`: `packages/content/src/dog.ts`
- `dogfood()`: `packages/content/src/dog.ts`
- `initedog()`: `packages/content/src/dog.ts`
- `keepdogs()`: `packages/content/src/dog.ts`, `packages/core/src/types/mod.ts`, `packages/testkit/src/soak.ts`
- `losedogs()`: `packages/content/src/dog.ts`, `packages/content/src/shk.ts`, `packages/core/src/types/mod.ts`
- `make_familiar()`: `packages/content/src/dog.ts`
- `makedog()`: `packages/content/src/dog.ts`
- `migrate_to_level()`: `packages/content/src/migrate.ts`, `packages/content/src/wormstate.ts`
- `mon_arrive()`: `packages/content/src/dog.ts`, `packages/content/src/migrate.ts`, `packages/content/src/trap.ts`, `packages/content/src/worm.ts`
- `mon_catchup_elapsed_time()`: `packages/content/src/dog.ts`, `packages/content/src/mstate.ts`
- `mon_leave()`: `packages/content/src/worm.ts`
- `newedog()`: `packages/content/src/dog.ts`
- `pet_type()`: `packages/content/src/dog.ts`
- `pick_familiar_pm()`: `packages/content/src/dog.ts`
- `stairway_find()`: `packages/content/src/migrate.ts`
- `stairway_find_from()`: `packages/content/src/migrate.ts`
- `tamedog()`: `packages/content/src/dog.ts`
- `wary_dog()`: `packages/content/src/dog.en.ts`, `packages/content/src/dog.ts`

## src/dogmove.c

- (file): `packages/content/src/dog.en.ts`
- `can_reach_location()`: `packages/content/src/dogmove.ts`
- `could_reach_item()`: `packages/content/src/dogmove.ts`
- `dog_eat()`: `packages/content/src/dogmove.ts`, `packages/content/src/monflee.ts`
- `dog_goal()`: `packages/content/src/dogmove.ts`
- `dog_hunger()`: `packages/content/src/dogmove.ts`
- `dog_invent()`: `packages/content/src/dogmove.ts`
- `dog_move()`: `packages/content/src/dogmove.ts`
- `dog_nutrition()`: `packages/content/src/dog.ts`, `packages/content/src/dogmove.ts`
- `dog_starve()`: `packages/content/src/dogmove.ts`
- `droppables()`: `packages/content/src/dogmove.ts`

## src/dokick.c

- (file): `packages/content/src/kick.en.ts`, `packages/content/src/stonetouch.ts`
- `dokick()`: `packages/content/src/dokick.ts`
- `flyingcoinmsg()`: `packages/content/src/kick.en.ts`
- `ghitm()`: `packages/content/src/dokick.ts`
- `kick_door()`: `packages/content/src/dokick.ts`, `packages/content/src/watch.ts`
- `kick_dumb()`: `packages/content/src/dokick.ts`
- `kick_monster()`: `packages/content/src/dokick.ts`, `packages/content/src/uhitm.en.ts`
- `kick_nondoor()`: `packages/content/src/dokick.ts`
- `kick_object()`: `packages/content/src/dokick.ts`
- `kick_ouch()`: `packages/content/src/dokick.ts`
- `kickdmg()`: `packages/content/src/dog.ts`, `packages/content/src/dokick.ts`, `packages/content/src/uhitm.en.ts`
- `kickstr()`: `packages/content/src/dokick.ts`
- `martial()`: `packages/content/src/dokick.ts`
- `maybe_kick_monster()`: `packages/content/src/dokick.ts`
- `really_kick_object()`: `packages/content/src/dokick.ts`

## src/dothrow.c

- (file): `packages/content/src/jump.en.ts`, `packages/content/src/scatter.ts`
- `breakmsg()`: `packages/content/src/dothrow.ts`, `packages/content/src/egg.en.ts`, `packages/content/src/material.ts`
- `breakobj()`: `packages/content/src/dothrow.ts`, `packages/content/src/egghit.ts`, `packages/content/src/flooreffects.ts`, `packages/content/src/floorfx.ts`, `packages/content/src/muse.en.ts`, `packages/content/src/potionhit.ts`
- `breaktest()`: `packages/content/src/dokick.ts`, `packages/content/src/material.ts`
- `check_shop_obj()`: `packages/content/src/shk.ts`
- `dofire()`: `packages/content/src/fire.ts`
- `dothrow()`: `packages/content/src/dothrow.ts`
- `gem_accept()`: `packages/content/src/unicorn.ts`
- `hero_breaks()`: `packages/content/src/dokick.ts`, `packages/content/src/dothrow.ts`
- `hitfloor()`: `packages/content/src/dothrow.ts`
- `hurtle_jump()`: `packages/content/src/jump.ts`
- `hurtle_step()`: `packages/content/src/jump.ts`
- `mhurtle()`: `packages/content/src/mhurtle.ts`
- `multishot_class_bonus()`: `packages/content/src/dothrow.ts`
- `ok_to_throw()`: `packages/content/src/dothrow.ts`
- `omon_adj()`: `packages/content/src/mthrowu.ts`
- `should_mulch_missile()`: `packages/content/src/mthrowu.ts`
- `thitmonst()`: `packages/content/src/dothrow.ts`, `packages/content/src/unicorn.ts`
- `throw_obj()`: `packages/content/src/dothrow.ts`, `packages/content/src/fire.ts`, `packages/content/src/mthrowu.en.ts`, `packages/content/src/stonetouch.ts`
- `throwing_weapon()`: `packages/content/src/dothrow.ts`
- `throwit()`: `packages/content/src/dothrow.ts`, `packages/content/src/mthrowu.en.ts`
- `throwit_mon_hit()`: `packages/content/src/dothrow.ts`
- `tmiss()`: `packages/content/src/dothrow.ts`
- `tmp_at()`: `packages/content/src/dothrow.ts`
- `walk_path()`: `packages/content/src/jump.ts`

## src/drawing.c

- `DEF_INVISIBLE()`: `packages/content/src/invis.ts`
- `def_r_oc_syms()`: `packages/core/src/types/mod.ts`
- `def_warnsyms()`: `packages/content/src/messages.en.ts`, `packages/content/src/perception.ts`

## src/dungeon.c

- (file): `packages/content/src/levelflags.ts`
- `Can_dig_down()`: `packages/content/src/levelflags.ts`
- `Can_fall_thru()`: `packages/content/src/trap.ts`
- `Can_rise_up()`: `packages/content/src/potion.ts`
- `In_W_tower()`: `packages/content/src/levelflags.ts`
- `In_hell()`: `packages/content/src/levelflags.ts`
- `Invocation_lev()`: `packages/content/src/levelflags.ts`
- `Is_botlevel()`: `packages/content/src/levelflags.ts`, `packages/core/src/levelgen/generate.ts`
- `Is_special()`: `packages/content/src/levelflags.ts`
- `Is_stronghold()`: `packages/content/src/levelflags.ts`
- `On_W_tower_level()`: `packages/content/src/levelflags.ts`
- `builds_up()`: `packages/content/src/ladder.ts`
- `chr_u_on_lvl()`: `packages/content/src/wizard/where.ts`
- `correct_branch_type()`: `packages/core/src/dungeon.ts`
- `deepest_lev_reached()`: `packages/content/src/urexp.ts`
- `depth()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/level.ts`
- `dunlevs_in_dungeon()`: `packages/content/src/levelflags.ts`
- `find_hell()`: `packages/content/src/levelflags.ts`
- `fixup_level_locations()`: `packages/content/src/knoxstate.ts`
- `get_level()`: `packages/content/src/teleport.ts`
- `induced_align()`: `packages/content/src/mkroom.ts`
- `init_castle_tune()`: `packages/content/src/gehennom.ts`
- `init_dungeon_dungeons()`: `packages/core/src/dungeon.ts`
- `init_dungeon_set_depth()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `init_dungeon_set_entry()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `init_dungeons()`: `packages/content/src/gehennom.ts`, `packages/core/src/types/mod.ts`
- `init_level()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `insert_branch()`: `packages/content/src/knoxstate.ts`
- `ledger_no()`: `packages/content/src/gem.ts`
- `level_range()`: `packages/core/src/dungeon.ts`, `packages/core/src/registry.ts`, `packages/core/src/types/mod.ts`
- `parent_dlevel()`: `packages/core/src/dungeon.ts`, `packages/core/src/types/mod.ts`
- `pick_level()`: `packages/core/src/dungeon.ts`
- `place_level()`: `packages/core/src/dungeon.ts`
- `possible_places()`: `packages/core/src/dungeon.ts`
- `print_branch()`: `packages/content/src/wizard/where.ts`
- `print_dungeon()`: `packages/content/src/wizard/where.ts`, `packages/content/src/wizard/wizard.en.ts`
- `single_level_branch()`: `packages/content/src/levelflags.ts`
- `surface()`: `packages/content/src/terrain.ts`
- `u_on_newpos()`: `packages/content/src/actions.ts`
- `u_on_rndspot()`: `packages/core/src/engine.ts`, `packages/core/src/types/mod.ts`

## src/eat.c

- (file): `packages/content/src/eat.en.ts`, `packages/content/src/resist.en.ts`, `packages/core/src/types/entity.ts`
- `CANNIBAL_ALLOWED()`: `packages/content/src/race.ts`
- `Finish_digestion()`: `packages/content/src/hmonas.ts`
- `Popeye()`: `packages/content/src/tins.ts`
- `adj_victual_nutrition()`: `packages/content/src/eat.ts`
- `bite()`: `packages/content/src/eat.ts`
- `choke()`: `packages/content/src/eat.ts`
- `consume_oeaten()`: `packages/content/src/eat.ts`
- `consume_tin()`: `packages/content/src/tin.en.ts`, `packages/content/src/tin.ts`
- `corpse_intrinsic()`: `packages/content/src/givit.ts`
- `costly_tin()`: `packages/content/src/tin.ts`
- `cpostfx()`: `packages/content/src/eat.ts`, `packages/content/src/givit.ts`
- `cprefx()`: `packages/content/src/eat.ts`
- `do_reset_eat()`: `packages/content/src/eat.ts`
- `doeat()`: `packages/content/src/eat.ts`
- `done_eating()`: `packages/content/src/eat.ts`
- `eat_brains()`: `packages/content/src/adtyping.ts`
- `eatcorpse()`: `packages/content/src/eat.en.ts`, `packages/content/src/eat.ts`
- `eaten_stat()`: `packages/content/src/dog.ts`, `packages/content/src/items.ts`, `packages/content/src/offer.ts`
- `eatfood()`: `packages/content/src/eat.ts`
- `eye_of_newt_buzz()`: `packages/content/src/givit.ts`
- `fix_petrification()`: `packages/content/src/stonestate.ts`
- `floorfood()`: `packages/content/src/tin.en.ts`, `packages/content/src/tin.ts`
- `food_disappears()`: `packages/content/src/corpses.ts`, `packages/content/src/revive.ts`
- `food_xname()`: `packages/content/src/eat.ts`
- `fpostfx()`: `packages/content/src/eat.ts`
- `fprefx()`: `packages/content/src/eat.ts`, `packages/content/src/egg.en.ts`
- `garlic_breath()`: `packages/content/src/eat.ts`
- `gethungry()`: `packages/content/src/hunger.ts`, `packages/content/src/props.ts`
- `givit()`: `packages/content/src/givit.ts`, `packages/content/src/resist.en.ts`
- `hu_stat()`: `packages/content/src/enlightenment.ts`
- `init_uhunger()`: `packages/content/src/uhunger.ts`
- `intrinsic_possible()`: `packages/content/src/givit.ts`
- `is_edible()`: `packages/content/src/eat.ts`
- `lesshungry()`: `packages/content/src/hunger.ts`
- `maybe_cannibal()`: `packages/content/src/eat.ts`
- `maybe_finished_meal()`: `packages/content/src/eat.ts`
- `morehungry()`: `packages/content/src/hunger.ts`
- `newuhs()`: `packages/content/src/eat.en.ts`, `packages/content/src/hunger.ts`, `packages/testkit/src/scenario.ts`
- `nonrotting_corpse()`: `packages/content/src/eat.ts`, `packages/content/src/tins.ts`
- `obj_nutrition()`: `packages/content/src/eat.ts`, `packages/content/src/items.ts`
- `opentin()`: `packages/content/src/tin.en.ts`, `packages/content/src/tin.ts`
- `reset_eat()`: `packages/content/src/eat.ts`
- `reset_faint()`: `packages/content/src/drown.ts`
- `rottenfood()`: `packages/content/src/eat.en.ts`, `packages/content/src/eat.ts`
- `set_tin_variety()`: `packages/content/src/tins.ts`
- `should_givit()`: `packages/content/src/givit.ts`
- `start_eating()`: `packages/content/src/eat.ts`
- `start_tin()`: `packages/content/src/tin.en.ts`, `packages/content/src/tin.ts`
- `status_enlightenment()`: `packages/content/src/enlightenment.ts`
- `temp_givit()`: `packages/content/src/givit.ts`
- `tin_details()`: `packages/content/src/objnam.ts`
- `tin_variety()`: `packages/content/src/tins.ts`
- `tin_variety_txt()`: `packages/content/src/tins.ts`
- `tintxts()`: `packages/content/src/objects.en.ts`, `packages/content/src/tins.ts`
- `touchfood()`: `packages/content/src/eat.ts`
- `unfaint()`: `packages/content/src/hunger.ts`
- `use_tin_opener()`: `packages/content/src/tin.en.ts`, `packages/content/src/tin.ts`
- `use_up_tin()`: `packages/content/src/tin.ts`
- `violated_vegetarian()`: `packages/content/src/luck.ts`
- `vomit()`: `packages/content/src/hunger.ts`

## src/end.c

- (file): `packages/content/src/disclose.ts`
- `container_contents()`: `packages/content/src/disclose.ts`
- `delayed_killer()`: `packages/content/src/slimestate.ts`, `packages/content/src/stonestate.ts`
- `disclose()`: `packages/content/src/disclose.ts`, `packages/content/src/end.en.ts`, `packages/core/src/types/event.ts`, `packages/ui/src/gameover.ts`
- `done()`: `packages/content/src/end.ts`, `packages/content/src/endstate.ts`, `packages/content/src/quit.ts`, `packages/content/src/wizard/die.ts`
- `done2()`: `packages/content/src/end.en.ts`, `packages/content/src/quit.ts`
- `done_in_by()`: `packages/content/src/end.ts`, `packages/content/src/mhitu.ts`
- `ends()`: `packages/content/src/end.en.ts`
- `get_valuables()`: `packages/content/src/urexp.ts`
- `paygd()`: `packages/content/src/vault.ts`
- `really_done()`: `packages/app/src/main.ts`, `packages/app/src/scores.ts`, `packages/content/src/botl.ts`, `packages/content/src/disclose.ts`, `packages/content/src/end.en.ts`, `packages/content/src/endstate.ts`, `packages/content/src/urexp.ts`, `packages/content/src/vault.ts`, `packages/ui/src/gameover.ts`
- `savelife()`: `packages/content/src/end.ts`, `packages/content/src/engulf.ts`
- `should_query_disclose_option()`: `packages/ui/src/gameover.ts`

## src/engrave.c

- (file): `packages/content/src/engrave.ts`
- `can_reach_floor()`: `packages/content/src/levitation.ts`, `packages/content/src/reach.ts`
- `cant_reach_floor()`: `packages/content/src/engrave.ts`
- `del_engr()`: `packages/content/src/engr.ts`
- `del_engr_at()`: `packages/content/src/engr.ts`
- `disturb_grave()`: `packages/content/src/grave.ts`
- `doengrave()`: `packages/content/src/engrave.ts`
- `doengrave_ctx_init()`: `packages/content/src/engrave.ts`
- `doengrave_sfx_item()`: `packages/content/src/engrave.ts`
- `doengrave_sfx_item_WAN()`: `packages/content/src/engrave.ts`
- `engr_at()`: `packages/content/src/engr.ts`
- `engr_can_be_felt()`: `packages/content/src/engrread.ts`
- `engrave()`: `packages/content/src/engrave.ts`
- `make_engr_at()`: `packages/content/src/engr.ts`
- `make_grave()`: `packages/content/src/grave.ts`
- `random_engraving()`: `packages/content/src/rndengr.ts`
- `read_engr_at()`: `packages/content/src/engrave.en.ts`, `packages/content/src/engrread.ts`
- `rloc_engr()`: `packages/content/src/engr.ts`, `packages/content/src/teleport.ts`
- `sengr_at()`: `packages/content/src/engr.ts`
- `stylus_ok()`: `packages/content/src/engrave.ts`
- `u_can_engrave()`: `packages/content/src/engrave.ts`
- `u_wipe_engr()`: `packages/content/src/engr.ts`
- `wipe_engr_at()`: `packages/content/src/engr.ts`
- `wipeout_text()`: `packages/content/src/engr.ts`

## src/exper.c

- (file): `packages/content/src/magic.ts`, `packages/content/src/roletab.ts`, `packages/content/src/urexp.ts`
- `enermod()`: `packages/content/src/hero.ts`, `packages/content/src/roletab.ts`
- `experience()`: `packages/content/src/hero.ts`
- `losexp()`: `packages/content/src/exper.ts`, `packages/content/src/were.en.ts`, `packages/content/src/wizard/levelchange.ts`
- `more_experienced()`: `packages/content/src/hero.ts`, `packages/content/src/urexp.ts`
- `newexplevel()`: `packages/content/src/hero.ts`
- `newpw()`: `packages/content/src/hero.ts`
- `newuexp()`: `packages/content/src/hero.ts`
- `pluslvl()`: `packages/content/src/hero.ts`, `packages/content/src/were.en.ts`, `packages/content/src/wizard/levelchange.ts`
- `rndexp()`: `packages/content/src/hero.ts`

## src/explode.c

- `adtyp_to_expltype()`: `packages/content/src/explode.ts`
- `explode()`: `packages/content/src/explode.ts`, `packages/core/src/types/event.ts`
- `explode_oil()`: `packages/content/src/oil.ts`
- `explosion()`: `packages/ui/src/host.ts`
- `explosionmask()`: `packages/content/src/explode.ts`
- `mon_explodes()`: `packages/content/src/explode.ts`
- `scatter()`: `packages/content/src/boulder.en.ts`, `packages/content/src/scatter.ts`
- `splatter_burning_oil()`: `packages/content/src/oil.ts`

## src/extralev.c

- (file): `packages/content/src/rogue.ts`
- `corr()`: `packages/content/src/rogue.ts`
- `makelevel()`: `packages/content/src/rogue.ts`
- `makerogueghost()`: `packages/content/src/rogue.ts`
- `makeroguerooms()`: `packages/content/src/rogue.ts`
- `miniwalk()`: `packages/content/src/rogue.ts`
- `roguecorr()`: `packages/content/src/rogue.ts`, `packages/testkit/src/invariants.ts`
- `roguejoin()`: `packages/content/src/rogue.ts`

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

- (file): `packages/content/src/dog.en.ts`, `packages/content/src/drown.ts`, `packages/content/src/eshk.ts`, `packages/content/src/run.ts`, `packages/content/src/shk.en.ts`, `packages/testkit/src/invariants.ts`
- `accessible()`: `packages/content/src/muse.ts`
- `avoid_trap_andor_region()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `bad_rock()`: `packages/content/src/actions.ts`, `packages/content/src/boulder.ts`, `packages/content/src/drown.ts`, `packages/content/src/monmove.ts`
- `calc_capacity()`: `packages/content/src/stats.ts`
- `cannot_push()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `cannot_push_msg()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `check_capacity()`: `packages/content/src/magic.ts`
- `check_leash()`: `packages/content/src/leashstate.ts`
- `check_special_room()`: `packages/content/src/mkroom.en.ts`, `packages/content/src/rooms.ts`, `packages/content/src/zoo.ts`
- `closed_door()`: `packages/content/src/actions.ts`, `packages/core/src/movement.ts`
- `could_move_onto_boulder()`: `packages/content/src/moverock.ts`
- `crawl_destination()`: `packages/content/src/drown.ts`
- `distmin()`: `packages/content/src/zoo.ts`
- `domove()`: `packages/content/src/actions.ts`, `packages/content/src/combat.ts`, `packages/content/src/engr.ts`, `packages/content/src/leashstate.ts`, `packages/content/src/travel.ts`
- `domove_attackmon_at()`: `packages/content/src/actions.ts`
- `domove_core()`: `packages/content/src/actions.ts`, `packages/content/src/run.ts`, `packages/content/src/travel.ts`
- `domove_fight_empty()`: `packages/content/src/actions.ts`
- `domove_fight_web()`: `packages/content/src/actions.ts`, `packages/content/src/trap.en.ts`, `packages/content/src/web.ts`
- `domove_swap_with_pet()`: `packages/content/src/actions.ts`
- `doorless_door()`: `packages/content/src/rogue.ts`, `packages/core/src/movement.ts`, `packages/core/src/types/mod.ts`
- `dopush()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `escape_from_sticky_mon()`: `packages/content/src/hackmove.ts`, `packages/content/src/resist.en.ts`
- `findtravelpath()`: `packages/content/src/travel.ts`
- `furniture_present()`: `packages/content/src/zoo.ts`
- `hcolor()`: `packages/content/src/hcolor.ts`
- `hcolors()`: `packages/content/src/hcolor.ts`
- `impaired_movement()`: `packages/content/src/hackmove.ts`
- `in_rooms()`: `packages/content/src/shopdamage.ts`, `packages/content/src/urooms.ts`, `packages/core/src/rooms.ts`
- `in_town()`: `packages/core/src/rooms.ts`
- `inv_weight()`: `packages/content/src/stats.ts`
- `invocation_message()`: `packages/content/src/invocation.ts`, `packages/content/src/trap.en.ts`
- `invocation_pos()`: `packages/content/src/invocation.ts`
- `lookaround()`: `packages/content/src/run.ts`, `packages/content/src/travel.ts`
- `losehp()`: `packages/content/src/hp.ts`
- `may_dig()`: `packages/content/src/mdig.ts`
- `may_passwall()`: `packages/content/src/mdig.ts`
- `maybe_smudge_engr()`: `packages/content/src/engr.ts`
- `money_cnt()`: `packages/content/src/detectobj.ts`, `packages/content/src/dosit.ts`, `packages/content/src/stats.ts`
- `monster_nearby()`: `packages/content/src/eat.ts`
- `monstinroom()`: `packages/content/src/zoo.ts`
- `move_update()`: `packages/content/src/rooms.ts`, `packages/content/src/urooms.ts`
- `moverock()`: `packages/content/src/landmine.ts`, `packages/content/src/moverock.ts`, `packages/content/src/rollboulder.ts`, `packages/content/src/trap.en.ts`
- `moverock_core()`: `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`
- `movobj()`: `packages/content/src/moverock.ts`
- `near_capacity()`: `packages/content/src/stats.ts`
- `nomul()`: `packages/content/src/combat.ts`, `packages/content/src/nomul.ts`, `packages/core/src/types/entity.ts`
- `overexertion()`: `packages/content/src/combat.ts`
- `pickup_checks()`: `packages/content/src/itemactions.ts`
- `pooleffects()`: `packages/content/src/drown.ts`, `packages/content/src/liquid.en.ts`
- `rounddiv()`: `packages/content/src/eat.ts`
- `runmode_delay_output()`: `packages/app/src/options.ts`
- `slippery_ice_fumbling()`: `packages/content/src/fumble.ts`
- `spoteffects()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `squeezeablylightinvent()`: `packages/content/src/moverock.ts`
- `swim_move_danger()`: `packages/content/src/actions.ts`, `packages/content/src/drown.ts`
- `test_move()`: `packages/content/src/actions.ts`, `packages/content/src/boulder.en.ts`, `packages/content/src/moverock.ts`, `packages/content/src/run.ts`, `packages/content/src/travel.ts`, `packages/content/src/worm.en.ts`, `packages/core/src/movement.ts`, `packages/core/src/path.ts`
- `trapmove()`: `packages/content/src/actions.ts`, `packages/content/src/trap.ts`
- `u_maybe_impaired()`: `packages/content/src/hackmove.ts`
- `u_simple_floortyp()`: `packages/content/src/drown.ts`
- `unconscious()`: `packages/content/src/btrapped.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/mcastu.ts`, `packages/content/src/mdig.ts`, `packages/content/src/shapeshift.ts`
- `unmul()`: `packages/content/src/nomul.ts`
- `weight_cap()`: `packages/content/src/stats.ts`
- `xdir()`: `packages/content/src/scatter.ts`
- `ydir()`: `packages/content/src/scatter.ts`

## src/hacklib.c

- (file): `packages/content/src/artistate.ts`
- `dist2()`: `packages/content/src/mthrowu.ts`
- `fuzzymatch()`: `packages/content/src/objnam_read.ts`
- `isqrt()`: `packages/content/src/spellcalc.ts`
- `mungspaces()`: `packages/content/src/objnam_read.ts`
- `night()`: `packages/content/src/adtyping.ts`, `packages/content/src/were.ts`
- `online2()`: `packages/content/src/monmove.ts`
- `ordin()`: `packages/app/src/scores.ts`
- `rounddiv()`: `packages/content/src/polyself.ts`
- `sgn()`: `packages/content/src/shk.ts`

## src/insight.c

- `N_times()`: `packages/content/src/end.en.ts`, `packages/content/src/vanquished.ts`
- `UniqCritterIndx()`: `packages/content/src/vanquished.ts`
- `align_str()`: `packages/content/src/align.ts`
- `doborn()`: `packages/content/src/wizard/born.ts`, `packages/content/src/wizard/wizard.en.ts`
- `enlght_combatinc()`: `packages/content/src/enlightenment.ts`
- `enlightenment()`: `packages/content/src/enlightenment.ts`
- `list_genocided()`: `packages/content/src/disclose.ts`, `packages/content/src/end.en.ts`, `packages/content/src/genocide.ts`, `packages/content/src/vanquished.ts`
- `list_vanquished()`: `packages/content/src/disclose.ts`, `packages/content/src/end.en.ts`, `packages/content/src/vanquished.ts`
- `mstatusline()`: `packages/content/src/zap.ts`
- `num_extinct()`: `packages/content/src/vanquished.ts`
- `num_genocides()`: `packages/content/src/vanquished.ts`
- `num_gone()`: `packages/content/src/vanquished.ts`
- `piousness()`: `packages/content/src/enlightenment.ts`
- `status_enlightenment()`: `packages/content/src/enlightenment.en.ts`, `packages/content/src/enlightenment.ts`
- `ustatusline()`: `packages/content/src/zap.ts`
- `vanqsort_cmp()`: `packages/content/src/vanquished.ts`

## src/invent.c

- (file): `packages/content/src/horn.ts`, `packages/content/src/items.ts`, `packages/content/src/magic.ts`, `packages/content/src/read.ts`, `packages/content/src/wish.ts`
- `addinv()`: `packages/content/src/items.ts`
- `addinv_core0()`: `packages/content/src/items.ts`
- `assigninvlet()`: `packages/content/src/items.ts`
- `carry_obj_effects()`: `packages/content/src/figurinestate.ts`
- `carrying()`: `packages/content/src/gem.ts`, `packages/content/src/shk.ts`
- `consume_obj_charge()`: `packages/content/src/music.ts`
- `count_contents()`: `packages/content/src/shk.ts`
- `count_unpaid()`: `packages/content/src/price.ts`
- `def_inv_order()`: `packages/content/src/itemactions.ts`
- `dfeature_at()`: `packages/content/src/itemactions.ts`
- `display_inventory()`: `packages/content/src/disclose.ts`
- `display_pickinv()`: `packages/content/src/wizard/identify.ts`
- `dolook()`: `packages/content/src/engrave.ts`, `packages/content/src/itemactions.ts`
- `findgold()`: `packages/content/src/mongear.ts`
- `freeinv()`: `packages/content/src/items.ts`
- `freeinv_core()`: `packages/content/src/invoke.ts`, `packages/content/src/items.ts`
- `getobj()`: `packages/content/src/dip.ts`
- `hold_another_object()`: `packages/content/src/wish.ts`
- `identify()`: `packages/content/src/read.ts`
- `identify_pack()`: `packages/content/src/read.ts`
- `inv_cnt()`: `packages/content/src/items.ts`, `packages/content/src/steal.ts`
- `look_here()`: `packages/content/src/itemactions.ts`, `packages/content/src/items.en.ts`
- `m_carrying()`: `packages/content/src/mdig.ts`, `packages/content/src/muse.ts`
- `m_useup()`: `packages/content/src/erode.ts`
- `menu_identify()`: `packages/content/src/read.ts`
- `mergable()`: `packages/content/src/items.ts`
- `merged()`: `packages/content/src/items.ts`
- `money_cnt()`: `packages/content/src/money.ts`
- `prinv()`: `packages/content/src/itemactions.ts`
- `set_cknown_lknown()`: `packages/content/src/read.ts`
- `sobj_at()`: `packages/content/src/beejelly.ts`, `packages/content/src/boulder.ts`
- `splitobj()`: `packages/content/src/items.ts`
- `stackobj()`: `packages/content/src/items.ts`
- `useup()`: `packages/content/src/eat.ts`, `packages/content/src/erode.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/magic.ts`
- `useupall()`: `packages/content/src/magic.ts`
- `useupf()`: `packages/content/src/eat.ts`
- `xprname()`: `packages/content/src/itemactions.ts`

## src/light.c

- (file): `packages/content/src/burnstate.ts`, `packages/core/src/types/mod.ts`
- `arti_light_radius()`: `packages/content/src/light.ts`
- `candle_light_range()`: `packages/content/src/burnstate.ts`
- `do_light_sources()`: `packages/content/src/light.ts`, `packages/core/src/perception.ts`, `packages/core/src/types/mod.ts`, `packages/core/src/vision.ts`
- `new_light_source()`: `packages/content/src/light.ts`
- `obj_split_light_source()`: `packages/content/src/burnstate.ts`

## src/lock.c

- (file): `packages/content/src/lockstate.ts`
- `autokey()`: `packages/content/src/lock.ts`
- `boxlock()`: `packages/content/src/zap.en.ts`, `packages/content/src/zap.ts`
- `breakchestlock()`: `packages/content/src/force.ts`
- `chest_shatter_msg()`: `packages/content/src/force.ts`, `packages/content/src/potionhit.ts`
- `doforce()`: `packages/content/src/force.ts`
- `doopen()`: `packages/content/src/actions.ts`
- `doopen_indir()`: `packages/content/src/actions.ts`
- `doorlock()`: `packages/content/src/rogue.en.ts`, `packages/content/src/zap.en.ts`, `packages/content/src/zap.ts`
- `forcelock()`: `packages/content/src/force.ts`
- `lock_action()`: `packages/content/src/lock.en.ts`, `packages/content/src/lock.ts`, `packages/content/src/lockstate.ts`
- `maybe_reset_pick()`: `packages/content/src/lock.ts`
- `obstructed()`: `packages/content/src/zap.ts`
- `pick_lock()`: `packages/content/src/lock.en.ts`, `packages/content/src/lock.ts`
- `picking_lock()`: `packages/content/src/lockstate.ts`
- `picklock()`: `packages/content/src/lock.en.ts`, `packages/content/src/lock.ts`
- `reset_pick()`: `packages/content/src/lock.ts`
- `stumble_on_door_mimic()`: `packages/content/src/mimic.ts`
- `u_have_forceable_weapon()`: `packages/content/src/force.ts`

## src/makemon.c

- (file): `packages/content/src/mimicstate.ts`
- `adj_lev()`: `packages/content/src/generation.ts`
- `align_shift()`: `packages/content/src/generation.ts`
- `clone_mon()`: `packages/content/src/clone.ts`, `packages/content/src/mstate.ts`
- `create_critters()`: `packages/content/src/seffect.ts`
- `golemhp()`: `packages/content/src/golem.ts`
- `grow_up()`: `packages/content/src/mhitm.ts`
- `init_mongen_order()`: `packages/content/src/generation.ts`
- `m_initgrp()`: `packages/content/src/generation.ts`
- `m_initinv()`: `packages/content/src/mongear.ts`
- `m_initthrow()`: `packages/content/src/mongear.ts`
- `m_initweap()`: `packages/content/src/mongear.ts`
- `makemon()`: `packages/content/src/generation.ts`, `packages/content/src/mkobj.ts`, `packages/content/src/mongear.ts`, `packages/content/src/wizstate.ts`, `packages/content/src/worm.ts`
- `makemon_rnd_goodpos()`: `packages/content/src/generation.ts`
- `mbirth_limit()`: `packages/content/src/vanquished.ts`
- `mkclass()`: `packages/content/src/generation.ts`
- `mkclass_aligned()`: `packages/content/src/generation.ts`
- `mkclass_poly()`: `packages/content/src/polyself.ts`
- `mkmonmoney()`: `packages/content/src/mongear.ts`
- `mongets()`: `packages/content/src/mongear.ts`
- `monhp_per_lvl()`: `packages/content/src/mondata.ts`, `packages/content/src/upoly.ts`
- `newmonhp()`: `packages/content/src/generation.ts`
- `peace_minded()`: `packages/content/src/generation.ts`
- `pm_to_cham()`: `packages/content/src/chamstate.ts`
- `propagate()`: `packages/content/src/vanquished.ts`
- `rndmonst_adj()`: `packages/content/src/generation.ts`, `packages/content/src/mondata.ts`
- `set_malign()`: `packages/content/src/luck.ts`
- `set_mimic_sym()`: `packages/content/src/mimic.ts`
- `summon_furies()`: `packages/content/src/generation.ts`
- `syms()`: `packages/content/src/mimic.ts`
- `temperature_shift()`: `packages/content/src/temperature.ts`
- `uncommon()`: `packages/content/src/generation.ts`
- `unmakemon()`: `packages/content/src/mondeath.ts`, `packages/content/src/vanquished.ts`

## src/mcastu.c

- (file): `packages/content/src/mcastu.ts`
- `buzzmu()`: `packages/content/src/mthrowu.ts`
- `castmu()`: `packages/content/src/mcastu.en.ts`, `packages/content/src/mcastu.ts`
- `choose_monster_spell()`: `packages/content/src/mcastu.ts`
- `cursetxt()`: `packages/content/src/mcastu.en.ts`, `packages/content/src/mcastu.ts`
- `death_inflicted_by()`: `packages/content/src/mcastu.ts`, `packages/content/src/messages.en.ts`
- `is_undirected_spell()`: `packages/content/src/mcastu.ts`
- `m_cure_self()`: `packages/content/src/mcastu.ts`
- `mcast_blind_you()`: `packages/content/src/mcastu.ts`
- `mcast_death_touch()`: `packages/content/src/mcastu.ts`
- `mcast_destroy_armor()`: `packages/content/src/mcastu.ts`
- `mcast_disappear()`: `packages/content/src/mcastu.ts`
- `mcast_geyser()`: `packages/content/src/mcastu.ts`
- `mcast_insects()`: `packages/content/src/mcastu.ts`
- `mcast_lightning()`: `packages/content/src/mcastu.ts`
- `mcast_open_wounds()`: `packages/content/src/mcastu.ts`
- `mcast_paralyze()`: `packages/content/src/mcastu.ts`
- `mcast_psi_bolt()`: `packages/content/src/mcastu.ts`
- `mcast_spell()`: `packages/content/src/mcastu.en.ts`, `packages/content/src/mcastu.ts`
- `mcast_stun_you()`: `packages/content/src/mcastu.ts`
- `mcast_summon_mons()`: `packages/content/src/mcastu.en.ts`, `packages/content/src/mcastu.ts`
- `mcast_weaken_you()`: `packages/content/src/mcastu.ts`
- `mon_cleric_spells()`: `packages/content/src/mcastu.ts`
- `mon_wizard_spells()`: `packages/content/src/mcastu.ts`
- `spell_would_be_useless()`: `packages/content/src/mcastu.ts`
- `touch_of_death()`: `packages/content/src/mcastu.ts`

## src/mhitm.c

- (file): `packages/content/src/adtyping.ts`, `packages/content/src/mhitm.en.ts`, `packages/content/src/mhitm.ts`
- `attk_protection()`: `packages/content/src/stonestate.ts`
- `engulf_target()`: `packages/content/src/engulf.ts`
- `explmm()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitm.ts`
- `gazemm()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitm.ts`
- `gulpmm()`: `packages/content/src/engulf.en.ts`, `packages/content/src/mhitm.ts`
- `hitmm()`: `packages/content/src/mhitm.ts`, `packages/content/src/silver.ts`
- `mattackm()`: `packages/content/src/mhitm.ts`
- `max_passive_dmg()`: `packages/content/src/dogmove.ts`
- `mdamagem()`: `packages/content/src/mhitm.ts`
- `missmm()`: `packages/content/src/mhitm.ts`
- `noises()`: `packages/content/src/mhitm.ts`
- `paralyze_monst()`: `packages/content/src/mstate.ts`
- `passivemm()`: `packages/content/src/mhitm.ts`
- `pre_mm_attack()`: `packages/content/src/mhitm.ts`
- `rustm()`: `packages/content/src/erode.ts`
- `sleep_monst()`: `packages/content/src/adtyping.ts`, `packages/content/src/buzz.ts`, `packages/content/src/trap.ts`
- `slept_monst()`: `packages/content/src/adtyping.ts`, `packages/content/src/buzz.ts`
- `xdrainenergym()`: `packages/content/src/adtyping.ts`

## src/mhitu.c

- (file): `packages/content/src/adtyping.en.ts`, `packages/content/src/messages.en.ts`, `packages/content/src/mongear.en.ts`, `packages/content/src/resist.en.ts`
- `assess_dmg()`: `packages/content/src/passiveum.ts`
- `cloneu()`: `packages/content/src/passiveum.ts`
- `could_seduce()`: `packages/content/src/steal.ts`
- `diseasemu()`: `packages/content/src/adtyping.ts`
- `doseduce()`: `packages/content/src/seduce.en.ts`, `packages/content/src/seduce.ts`
- `expels()`: `packages/content/src/engulf.en.ts`, `packages/content/src/engulf.ts`
- `explmu()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitu.ts`
- `gazemu()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitu.ts`
- `getmattk()`: `packages/content/src/combat.ts`
- `gulpmu()`: `packages/content/src/engulf.en.ts`, `packages/content/src/mhitu.ts`
- `hitmsg()`: `packages/content/src/combat.ts`
- `hitmu()`: `packages/content/src/combat.ts`, `packages/content/src/mhitu.ts`
- `magic_negation()`: `packages/content/src/adtyping.ts`, `packages/content/src/mhitu.ts`
- `mattacku()`: `packages/content/src/combat.ts`, `packages/content/src/monmove.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/travel.ts`
- `mayberem()`: `packages/content/src/seduce.en.ts`, `packages/content/src/seduce.ts`
- `mdamageu()`: `packages/content/src/combat.ts`, `packages/content/src/mhitu.ts`
- `missmu()`: `packages/content/src/combat.ts`
- `mpoisons_subj()`: `packages/content/src/adtyping.ts`
- `mswings()`: `packages/content/src/combat.ts`
- `mswings_verb()`: `packages/content/src/combat.ts`, `packages/content/src/mthrowu.en.ts`
- `mtrapped_in_pit()`: `packages/content/src/trapstate.ts`
- `passiveum()`: `packages/content/src/passiveum.ts`
- `stop_occupation()`: `packages/content/src/travel.ts`
- `summonmu()`: `packages/content/src/combat.ts`, `packages/content/src/were.ts`
- `u_slip_free()`: `packages/content/src/adtyping.ts`
- `u_slow_down()`: `packages/content/src/props.ts`
- `wildmiss()`: `packages/content/src/combat.ts`

## src/minion.c

- `bribe()`: `packages/content/src/demontalk.ts`, `packages/content/src/money.ts`, `packages/content/src/priest.en.ts`, `packages/content/src/priest.ts`
- `demon_talk()`: `packages/content/src/demontalk.ts`, `packages/content/src/minion.en.ts`
- `dlord()`: `packages/content/src/minion.ts`
- `dprince()`: `packages/content/src/minion.ts`
- `monster_census()`: `packages/content/src/mcastu.ts`, `packages/content/src/minion.ts`
- `msummon()`: `packages/content/src/minion.en.ts`, `packages/content/src/minion.ts`
- `ndemon()`: `packages/content/src/minion.ts`, `packages/content/src/roommon.ts`

## src/mklev.c

- (file): `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/maze.ts`, `packages/core/src/types/mod.ts`
- `add_door()`: `packages/content/src/zoo.ts`
- `add_room()`: `packages/content/src/orcus.ts`, `packages/content/src/rogue.ts`, `packages/core/src/levelgen/rooms.ts`
- `add_subroom()`: `packages/core/src/levelgen/sprooms.ts`
- `bydoor()`: `packages/content/src/mklev.ts`, `packages/core/src/levelgen/corridors.ts`
- `cardinal_nextto_room()`: `packages/core/src/levelgen/vault.ts`
- `create_vault()`: `packages/core/src/levelgen/rooms.ts`
- `do_room_or_subroom()`: `packages/content/src/rogue.ts`, `packages/core/src/levelgen/rooms.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `do_vault()`: `packages/core/src/levelgen/vault.ts`, `packages/core/src/types/level.ts`
- `dodoor()`: `packages/content/src/rogue.ts`, `packages/core/src/levelgen/corridors.ts`
- `dosdoor()`: `packages/content/src/mklev.ts`, `packages/content/src/terrain.ts`, `packages/core/src/levelgen/corridors.ts`, `packages/core/src/types/level.ts`
- `fill_ordinary_room()`: `packages/content/src/mklev.ts`
- `find_branch_room()`: `packages/content/src/rogue.ts`, `packages/core/src/levelgen/generate.ts`
- `find_okay_roompos()`: `packages/content/src/mklev.ts`
- `finddpos()`: `packages/core/src/levelgen/corridors.ts`
- `generate_stairs()`: `packages/content/src/rogue.ts`, `packages/core/src/dungeon.ts`, `packages/core/src/levelgen/generate.ts`
- `generate_stairs_find_room()`: `packages/content/src/rogue.ts`, `packages/core/src/levelgen/generate.ts`
- `good_rm_wall_doorpos()`: `packages/core/src/levelgen/corridors.ts`
- `join()`: `packages/core/src/levelgen/corridors.ts`
- `litstate_rnd()`: `packages/content/src/hellfill.ts`
- `makecorridors()`: `packages/core/src/levelgen/corridors.ts`
- `makelevel()`: `packages/content/src/dungeon.ts`, `packages/content/src/levelflags.ts`, `packages/content/src/mklev.ts`, `packages/content/src/mkroom.ts`, `packages/content/src/temperature.ts`, `packages/content/src/vault.ts`, `packages/content/src/zoo.ts`, `packages/core/src/engine.ts`, `packages/core/src/levelgen/generate.ts`, `packages/core/src/levelgen/vault.ts`, `packages/core/src/types/level.ts`
- `makeniche()`: `packages/content/src/vault.ts`, `packages/core/src/levelgen/vault.ts`
- `makerooms()`: `packages/core/src/levelgen/rooms.ts`
- `maketrap()`: `packages/content/src/vault.ts`
- `maybe_sdoor()`: `packages/core/src/levelgen/corridors.ts`
- `mk_knox_portal()`: `packages/content/src/knoxstate.ts`, `packages/content/src/vault.ts`, `packages/testkit/src/invariants.ts`
- `mkaltar()`: `packages/content/src/mklev.ts`
- `mkfount()`: `packages/content/src/mklev.ts`
- `mkgrave()`: `packages/content/src/mklev.ts`
- `mklev()`: `packages/content/src/graveyard.ts`, `packages/content/src/zoo.ts`
- `mksink()`: `packages/content/src/mklev.ts`
- `mkstairs()`: `packages/content/src/rogue.ts`, `packages/content/src/sp_lev.ts`
- `mktrap()`: `packages/content/src/mklev.ts`, `packages/core/src/traps.ts`
- `occupied()`: `packages/content/src/somexy.ts`, `packages/content/src/sp_lev.ts`
- `okdoor()`: `packages/core/src/levelgen/corridors.ts`
- `place_branch()`: `packages/content/src/knox.ts`, `packages/content/src/rogue.ts`, `packages/content/src/vault.ts`, `packages/core/src/levelgen/generate.ts`, `packages/testkit/src/invariants.ts`
- `somexy()`: `packages/core/src/levelgen/generate.ts`
- `sort_rooms()`: `packages/content/src/rogue.ts`, `packages/core/src/levelgen/rooms.ts`
- `topologize()`: `packages/core/src/rooms.ts`
- `traptype_rnd()`: `packages/content/src/mklev.ts`
- `traptype_roguelvl()`: `packages/content/src/mklev.ts`

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

- (file): `packages/content/src/baalz.ts`, `packages/content/src/knox.ts`, `packages/core/src/levelgen/maze.ts`, `packages/core/src/types/mod.ts`
- `baalz_fixup()`: `packages/content/src/baalz.ts`
- `bad_location()`: `packages/content/src/castle.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/special.ts`
- `create_maze()`: `packages/content/src/hellfill.ts`, `packages/core/src/levelgen/maze.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `extend_spine()`: `packages/core/src/levelgen/mkmap.ts`
- `fix_wall_spines()`: `packages/content/src/terrain.ts`, `packages/core/src/levelgen/mkmap.ts`
- `fixup_special()`: `packages/content/src/castle.ts`, `packages/content/src/dungeon.ts`, `packages/content/src/medusa.ts`, `packages/content/src/orctown.ts`, `packages/content/src/portal.ts`, `packages/content/src/sp_lev.ts`, `packages/content/src/wiztower.ts`, `packages/core/src/types/mod.ts`
- `is_exclusion_zone()`: `packages/content/src/levelflags.ts`
- `is_solid()`: `packages/core/src/levelgen/mkmap.ts`
- `iswall()`: `packages/content/src/orctown.ts`, `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`
- `iswall_or_stone()`: `packages/core/src/levelgen/mkmap.ts`
- `makemaz()`: `packages/content/src/levelflags.ts`, `packages/content/src/mazefill.ts`, `packages/core/src/engine.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `maze0xy()`: `packages/core/src/levelgen/maze.ts`
- `maze_inbounds()`: `packages/core/src/levelgen/maze.ts`
- `maze_remove_deadends()`: `packages/core/src/levelgen/maze.ts`, `packages/core/src/types/mod.ts`
- `mazexy()`: `packages/content/src/mazefill.ts`, `packages/core/src/levelgen/maze.ts`, `packages/core/src/types/mod.ts`
- `migrate_orc()`: `packages/content/src/orctown.ts`
- `mkportal()`: `packages/content/src/knox.ts`, `packages/content/src/portal.ts`
- `mz_move()`: `packages/core/src/levelgen/maze.ts`
- `okay()`: `packages/content/src/mazewalk.ts`, `packages/core/src/levelgen/maze.ts`
- `pick_vibrasquare_location()`: `packages/content/src/invocation.ts`
- `place_lregion()`: `packages/content/src/castle.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/engine.ts`, `packages/core/src/levelgen/spdef.ts`, `packages/core/src/levelgen/special.ts`
- `populate_maze()`: `packages/content/src/mazefill.ts`
- `put_lregion_here()`: `packages/content/src/castle.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/engine.ts`, `packages/core/src/levelgen/special.ts`
- `set_levltyp()`: `packages/content/src/selection.ts`
- `set_levltyp_lit()`: `packages/content/src/selection.ts`
- `shiny_orc_stuff()`: `packages/content/src/orctown.ts`
- `spine_array()`: `packages/core/src/levelgen/mkmap.ts`
- `stolen_booty()`: `packages/content/src/orctown.ts`
- `walkfrom()`: `packages/content/src/mazewalk.ts`, `packages/core/src/levelgen/maze.ts`
- `wall_cleanup()`: `packages/core/src/levelgen/mkmap.ts`
- `wallification()`: `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`

## src/mkobj.c

- (file): `packages/content/src/material.ts`, `packages/content/src/mkobj.ts`
- `add_to_container()`: `packages/content/src/container.ts`, `packages/core/src/objects.ts`
- `add_to_minv()`: `packages/content/src/mongear.ts`
- `bcsign()`: `packages/content/src/items.ts`, `packages/content/src/muse.ts`
- `bill_dummy_object()`: `packages/content/src/shk.ts`
- `bless()`: `packages/content/src/figurinestate.ts`
- `blessorcurse()`: `packages/content/src/items.ts`, `packages/content/src/read.ts`
- `boxiprobs()`: `packages/content/src/mkobj.ts`
- `costly_alteration()`: `packages/content/src/shk.ts`
- `curse()`: `packages/content/src/figurinestate.ts`, `packages/content/src/items.ts`
- `fixup_oil()`: `packages/content/src/dilute.ts`
- `get_obj_location()`: `packages/content/src/light.ts`, `packages/content/src/price.ts`
- `hellprobs()`: `packages/content/src/mkobj.ts`
- `hornoplenty()`: `packages/content/src/horn.ts`, `packages/content/src/tin.en.ts`
- `is_flammable()`: `packages/content/src/material.ts`
- `is_rottable()`: `packages/content/src/material.ts`
- `may_generate_eroded()`: `packages/content/src/items.ts`
- `maybe_reset_pick()`: `packages/content/src/lock.ts`
- `mk_tt_object()`: `packages/content/src/zoo.ts`
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
- `set_corpsenm()`: `packages/content/src/corpses.ts`, `packages/content/src/eggstate.ts`, `packages/content/src/orctown.ts`
- `shop_obj_sanity()`: `packages/testkit/src/invariants.ts`
- `stackobj()`: `packages/content/src/items.ts`
- `start_corpse_timeout()`: `packages/content/src/corpses.ts`
- `uncurse()`: `packages/content/src/figurinestate.ts`
- `weight()`: `packages/content/src/items.ts`

## src/mkroom.c

- (file): `packages/content/src/mkroom.ts`
- `antholemon()`: `packages/content/src/roommon.ts`
- `courtmon()`: `packages/content/src/roommon.ts`
- `do_mkroom()`: `packages/content/src/mkroom.ts`
- `fill_zoo()`: `packages/content/src/zoo.ts`
- `has_dnstairs()`: `packages/content/src/mkroom.ts`, `packages/content/src/shknam.ts`
- `has_upstairs()`: `packages/content/src/mkroom.ts`, `packages/content/src/shknam.ts`
- `inside_room()`: `packages/core/src/levelgen/grid.ts`, `packages/core/src/rooms.ts`
- `invalid_shop_shape()`: `packages/content/src/shknam.ts`
- `isbig()`: `packages/content/src/shknam.ts`
- `mk_zoo_thronemon()`: `packages/content/src/zoo.ts`
- `mkshop()`: `packages/content/src/shknam.ts`
- `mkswamp()`: `packages/content/src/mkroom.ts`
- `mktemple()`: `packages/content/src/mkroom.ts`
- `mkundead()`: `packages/content/src/deadbook.ts`
- `mkzoo()`: `packages/content/src/mkroom.ts`
- `morguemon()`: `packages/content/src/roommon.ts`
- `nexttodoor()`: `packages/content/src/terrain.ts`
- `pick_room()`: `packages/content/src/mkroom.ts`
- `search_special()`: `packages/content/src/vaultstate.ts`
- `somexy()`: `packages/content/src/somexy.ts`, `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/rooms.ts`
- `somexyspace()`: `packages/content/src/somexy.ts`
- `squadmon()`: `packages/content/src/roommon.ts`
- `squadprob()`: `packages/content/src/roommon.ts`

## src/mon.c

- (file): `packages/content/src/adtyping.ts`, `packages/content/src/corpses.ts`, `packages/content/src/genocide.ts`, `packages/content/src/messages.en.ts`, `packages/content/src/mongear.en.ts`, `packages/content/src/muse.en.ts`, `packages/content/src/peaceful.ts`, `packages/core/src/types/mod.ts`, `packages/testkit/src/invariants.ts`
- `BREEDER_EGG()`: `packages/content/src/eggstate.ts`
- `LEVEL_SPECIFIC_NOCORPSE()`: `packages/content/src/graveyard.ts`
- `accept_newcham_form()`: `packages/content/src/newcham.ts`
- `angry_guards()`: `packages/content/src/watch.en.ts`, `packages/content/src/watch.ts`
- `can_be_hatched()`: `packages/content/src/eggstate.ts`
- `can_carry()`: `packages/content/src/mongear.ts`
- `can_touch_safely()`: `packages/content/src/mongear.ts`
- `corpse_chance()`: `packages/content/src/corpses.ts`, `packages/content/src/explode.ts`
- `curr_mon_load()`: `packages/content/src/mongear.ts`
- `dead_species()`: `packages/content/src/eggstate.ts`
- `decide_to_shapeshift()`: `packages/content/src/shapeshift.ts`
- `egg_type_from_parent()`: `packages/content/src/eggstate.ts`
- `find_pmmonst()`: `packages/content/src/beejelly.ts`
- `golemeffects()`: `packages/content/src/golem.en.ts`, `packages/content/src/golemfx.ts`
- `healmon()`: `packages/content/src/golemfx.ts`, `packages/content/src/mstate.ts`, `packages/content/src/uhitm_passive.ts`
- `hide_monst()`: `packages/content/src/hide.ts`
- `hideunder()`: `packages/content/src/hide.en.ts`, `packages/content/src/hide.ts`
- `isspecmon()`: `packages/content/src/newcham.ts`
- `kill_eggs()`: `packages/content/src/genocide.ts`
- `kill_genocided_monsters()`: `packages/content/src/genocide.ts`
- `killed()`: `packages/content/src/buzz.ts`, `packages/content/src/dokick.ts`
- `levl_follower()`: `packages/content/src/dog.ts`
- `lifesaved_monster()`: `packages/content/src/mondeath.ts`
- `m_at()`: `packages/content/src/wormstate.ts`, `packages/core/src/engine.ts`
- `m_calcdistress()`: `packages/content/src/monflee.ts`, `packages/content/src/mstate.ts`, `packages/content/src/were.ts`
- `m_consume_obj()`: `packages/content/src/meat.ts`
- `m_detach()`: `packages/content/src/mondeath.ts`, `packages/content/src/mstate.ts`, `packages/content/src/trapstate.ts`
- `m_in_air()`: `packages/content/src/liquid.ts`
- `m_move_aggress()`: `packages/content/src/monmove.ts`
- `m_respond()`: `packages/content/src/mrespond.ts`
- `m_respond_shrieker()`: `packages/content/src/mrespond.ts`
- `make_corpse()`: `packages/content/src/corpses.ts`
- `max_mon_load()`: `packages/content/src/mongear.ts`
- `maybe_mnexto()`: `packages/content/src/dokick.ts`, `packages/testkit/src/invariants.ts`
- `maybe_unhide_at()`: `packages/content/src/hide.ts`
- `mcalcmove()`: `packages/content/src/brains.ts`, `packages/content/src/monmove.ts`
- `meatbox()`: `packages/content/src/meat.ts`
- `meatcorpse()`: `packages/content/src/dog.en.ts`, `packages/content/src/meat.ts`
- `meatmetal()`: `packages/content/src/dog.en.ts`, `packages/content/src/meat.ts`
- `meatobj()`: `packages/content/src/dog.en.ts`, `packages/content/src/meat.ts`
- `mfndpos()`: `packages/content/src/mdig.ts`, `packages/content/src/monmove.ts`, `packages/core/src/types/mod.ts`, `packages/testkit/src/invariants.ts`
- `minliquid()`: `packages/content/src/minliquid.ts`
- `minliquid_core()`: `packages/content/src/minliquid.ts`
- `mlifesaver()`: `packages/content/src/mondeath.ts`
- `mnearto()`: `packages/content/src/covetous.ts`, `packages/content/src/shk.ts`
- `mnexto()`: `packages/content/src/covetous.ts`, `packages/content/src/generation.ts`
- `mon_allowflags()`: `packages/content/src/monmove.ts`
- `mon_animal_list()`: `packages/content/src/newcham.ts`
- `mon_to_stone()`: `packages/content/src/golem.en.ts`, `packages/content/src/newcham.ts`, `packages/content/src/stoning.ts`
- `mondead()`: `packages/content/src/kops.ts`, `packages/content/src/mondeath.ts`, `packages/content/src/vanquished.ts`, `packages/content/src/werestate.ts`
- `mondied()`: `packages/content/src/mondeath.ts`
- `mongone()`: `packages/content/src/fountain.ts`, `packages/content/src/mondeath.ts`, `packages/content/src/statue.ts`, `packages/content/src/vault.ts`
- `monkilled()`: `packages/content/src/golem.en.ts`, `packages/content/src/mondeath.ts`
- `monnear()`: `packages/content/src/mhitm.ts`, `packages/content/src/monmove.ts`, `packages/content/src/were.ts`
- `monster_census()`: `packages/content/src/genocide.ts`, `packages/content/src/wizard/genesis.ts`
- `monstone()`: `packages/content/src/mondeath.ts`, `packages/content/src/stoning.ts`
- `movemon()`: `packages/core/src/turn.ts`
- `movemon_singlemon()`: `packages/content/src/monmove.ts`
- `mpickstuff()`: `packages/content/src/mongear.ts`
- `newcham()`: `packages/content/src/invis.ts`, `packages/content/src/mstate.ts`, `packages/content/src/newcham.ts`, `packages/testkit/src/invariants.ts`
- `normal_shape()`: `packages/content/src/chamstate.ts`, `packages/content/src/shapeshift.ts`
- `pacify_guards()`: `packages/content/src/watch.ts`
- `peacefuls_respond()`: `packages/content/src/peaceful.ts`, `packages/content/src/watch.en.ts`, `packages/content/src/watch.ts`
- `pick_animal()`: `packages/content/src/newcham.ts`
- `pickvampshape()`: `packages/content/src/newcham.ts`
- `rescham()`: `packages/content/src/chamstate.ts`, `packages/content/src/shapeshift.ts`
- `restartcham()`: `packages/content/src/chamstate.ts`, `packages/content/src/shapeshift.ts`
- `restore_cham()`: `packages/content/src/chamstate.ts`, `packages/content/src/shapeshift.ts`
- `restrap()`: `packages/content/src/hide.ts`
- `seemimic()`: `packages/content/src/mimicstate.ts`
- `select_newcham_form()`: `packages/content/src/newcham.ts`
- `set_mon_data()`: `packages/content/src/werestate.ts`
- `set_ustuck()`: `packages/content/src/engulfstate.ts`, `packages/content/src/hackmove.ts`
- `setmangry()`: `packages/content/src/kick.en.ts`, `packages/content/src/peaceful.ts`
- `undead_to_corpse()`: `packages/content/src/corpses.ts`
- `unstuck()`: `packages/content/src/engulf.ts`
- `validspecmon()`: `packages/content/src/newcham.ts`
- `vamp_stone()`: `packages/content/src/shapeshift.ts`
- `vamprises()`: `packages/content/src/shapeshift.ts`
- `wake_msg()`: `packages/content/src/mimic.ts`, `packages/content/src/monmove.ts`
- `wake_nearby()`: `packages/content/src/apply.ts`, `packages/content/src/btrapped.ts`, `packages/content/src/trap.ts`
- `wake_nearto_core()`: `packages/content/src/apply.ts`, `packages/content/src/noise.ts`
- `wakeup()`: `packages/content/src/actions.ts`, `packages/content/src/mimic.ts`, `packages/content/src/peaceful.ts`
- `xkilled()`: `packages/content/src/buzz.ts`, `packages/content/src/combat.ts`, `packages/content/src/corpses.ts`, `packages/content/src/dog.en.ts`, `packages/content/src/earthquake.ts`, `packages/content/src/hmon.ts`, `packages/content/src/luck.ts`, `packages/content/src/mondeath.ts`, `packages/content/src/muse.ts`, `packages/content/src/rollboulder.ts`, `packages/content/src/stoning.ts`

## src/mondata.c

- (file): `packages/content/src/breakarm.ts`, `packages/content/src/eggstate.ts`, `packages/content/src/minion.ts`, `packages/content/src/mondata.ts`, `packages/content/src/zap.ts`
- `Resists_Elem()`: `packages/content/src/mresist.ts`
- `big_to_little()`: `packages/content/src/eggstate.ts`
- `breakarm()`: `packages/content/src/mondata.ts`
- `can_blnd()`: `packages/content/src/adtyping.ts`
- `can_blow()`: `packages/content/src/music.ts`
- `cvt_adtyp_to_mseenres()`: `packages/content/src/mthrowu.ts`
- `defended()`: `packages/content/src/artidef.ts`
- `gender()`: `packages/content/src/gender.ts`
- `grownups()`: `packages/content/src/eggstate.ts`
- `hates_silver()`: `packages/content/src/mondata.ts`
- `little_to_big()`: `packages/content/src/eggstate.ts`
- `locomotion()`: `packages/content/src/egg.ts`
- `m_is_steadfast()`: `packages/content/src/mhurtle.ts`
- `mon_hates_blessings()`: `packages/content/src/chamstate.ts`, `packages/content/src/potionhit.ts`
- `mon_hates_silver()`: `packages/content/src/chamstate.ts`, `packages/content/src/mondata.ts`, `packages/content/src/silver.ts`
- `mon_knows_traps()`: `packages/content/src/trapstate.ts`
- `mon_learns_traps()`: `packages/content/src/trapstate.ts`
- `mons_see_trap()`: `packages/content/src/trap.ts`
- `monstseesu()`: `packages/content/src/musestate.ts`
- `monstunseesu()`: `packages/content/src/musestate.ts`
- `msummon_environ()`: `packages/content/src/minion.en.ts`, `packages/content/src/minion.ts`
- `name_to_mon()`: `packages/content/src/mondata.ts`
- `name_to_monclass()`: `packages/content/src/genocide.ts`, `packages/content/src/polyself.ts`
- `name_to_monplus()`: `packages/content/src/mondata.ts`, `packages/content/src/objnam_read.ts`
- `noattacks()`: `packages/content/src/combat.ts`
- `num_horns()`: `packages/content/src/mondata.ts`
- `olfaction()`: `packages/content/src/mondata.ts`
- `on_fire()`: `packages/content/src/adtyping.ts`, `packages/content/src/minliquid.ts`
- `pronoun_gender()`: `packages/content/src/seduce.ts`
- `resist_conflict()`: `packages/content/src/props.ts`
- `resists_blnd()`: `packages/content/src/adtyping.ts`, `packages/content/src/buzz.ts`
- `resists_blnd_by_arti()`: `packages/content/src/adtyping.ts`
- `resists_drli()`: `packages/content/src/exper.ts`, `packages/content/src/mresist.ts`
- `resists_magm()`: `packages/content/src/buzz.ts`
- `same_race()`: `packages/content/src/race.ts`
- `sliparm()`: `packages/content/src/mondata.ts`
- `stagger()`: `packages/content/src/combat.ts`
- `sticks()`: `packages/content/src/newcham.ts`

## src/monmove.c

- (file): `packages/content/src/mdig.ts`, `packages/content/src/mongear.ts`, `packages/content/src/monmove.ts`, `packages/content/src/trap.en.ts`
- `accessible()`: `packages/content/src/teleport.ts`
- `bee_eat_jelly()`: `packages/content/src/beejelly.ts`
- `can_fog()`: `packages/content/src/chamstate.ts`
- `can_hide_under_obj()`: `packages/content/src/hide.ts`
- `closed_door()`: `packages/content/src/buzz.ts`, `packages/content/src/rollboulder.ts`, `packages/content/src/zap.ts`
- `count_webbing_walls()`: `packages/content/src/web.ts`
- `distfleeck()`: `packages/content/src/monflee.ts`, `packages/content/src/monmove.ts`
- `disturb()`: `packages/content/src/monmove.ts`
- `dochug()`: `packages/content/src/beejelly.ts`, `packages/content/src/brains.ts`, `packages/content/src/demontalk.ts`, `packages/content/src/monflee.ts`, `packages/content/src/monmove.ts`
- `dochugw()`: `packages/content/src/travel.ts`
- `holds_up_web()`: `packages/content/src/web.ts`
- `leppie_avoidance()`: `packages/content/src/monmove.ts`
- `m_avoid_soko_push_loc()`: `packages/content/src/dogmove.ts`
- `m_digweapon_check()`: `packages/content/src/mdig.ts`
- `m_move()`: `packages/content/src/brains.ts`, `packages/content/src/dogmove.ts`, `packages/content/src/meat.ts`, `packages/content/src/monmove.ts`, `packages/content/src/shapeshift.ts`
- `m_move_aggress()`: `packages/content/src/monmove.ts`
- `m_search_items()`: `packages/content/src/monmove.ts`
- `magical()`: `packages/content/src/mongear.ts`
- `maybe_spin_web()`: `packages/content/src/web.ts`
- `mb_trapped()`: `packages/content/src/btrapped.ts`
- `mon_regen()`: `packages/content/src/mstate.ts`
- `mon_track_add()`: `packages/content/src/monmove.ts`
- `mon_track_clear()`: `packages/content/src/monflee.ts`
- `mon_yells()`: `packages/content/src/watch.ts`
- `monflee()`: `packages/content/src/kick.en.ts`, `packages/content/src/monflee.ts`
- `monnear()`: `packages/content/src/muse.ts`
- `onscary()`: `packages/content/src/music.ts`, `packages/content/src/scary.ts`
- `postmov()`: `packages/content/src/actions.ts`, `packages/content/src/dogmove.ts`, `packages/content/src/monmove.ts`, `packages/content/src/shapeshift.ts`
- `release_hero()`: `packages/content/src/engulf.ts`
- `set_apparxy()`: `packages/content/src/apparxy.ts`
- `soko_allow_web()`: `packages/content/src/web.ts`
- `stuff_prevents_passage()`: `packages/content/src/chamstate.ts`
- `vamp_shift()`: `packages/content/src/shapeshift.ts`
- `watch_on_duty()`: `packages/content/src/watch.ts`

## src/mthrowu.c

- `blocking_terrain()`: `packages/content/src/muse.ts`
- `breamm()`: `packages/content/src/mthrowu.ts`
- `breamu()`: `packages/content/src/mthrowu.ts`
- `breathwep()`: `packages/content/src/mthrowu.ts`
- `drop_throw()`: `packages/content/src/mthrowu.ts`
- `lined_up()`: `packages/content/src/monmove.ts`, `packages/content/src/muse.ts`
- `linedup()`: `packages/content/src/monmove.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/muse.ts`, `packages/content/src/priest.ts`
- `linedup_callback()`: `packages/content/src/muse.ts`
- `m_lined_up()`: `packages/content/src/muse.ts`
- `m_throw()`: `packages/content/src/mthrowu.en.ts`, `packages/content/src/mthrowu.ts`
- `monmulti()`: `packages/content/src/mthrowu.ts`
- `monshoot()`: `packages/content/src/mthrowu.en.ts`, `packages/content/src/mthrowu.ts`
- `ohitmon()`: `packages/content/src/mthrowu.ts`, `packages/content/src/silver.ts`, `packages/content/src/uhitm.en.ts`
- `spitmm()`: `packages/content/src/mthrowu.ts`
- `spitmu()`: `packages/content/src/mthrowu.ts`
- `thitu()`: `packages/content/src/mthrowu.en.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/silver.ts`, `packages/content/src/trap.ts`, `packages/content/src/uhitm.en.ts`
- `thrwmu()`: `packages/content/src/mthrowu.ts`
- `u_catch_thrown_obj()`: `packages/content/src/mthrowu.ts`

## src/muse.c

- (file): `packages/content/src/muse.en.ts`
- `MUSE_()`: `packages/content/src/muse.ts`
- `cures_sliming()`: `packages/content/src/muse.ts`
- `cures_stoning()`: `packages/content/src/musestate.ts`
- `fhito_loc()`: `packages/content/src/muse.ts`
- `find_defensive()`: `packages/content/src/muse.ts`
- `find_misc()`: `packages/content/src/muse.ts`
- `find_offensive()`: `packages/content/src/muse.ts`
- `green_mon()`: `packages/content/src/muse.ts`
- `hero_behind_chokepoint()`: `packages/content/src/muse.ts`
- `linedup_chk_corpse()`: `packages/content/src/muse.ts`
- `m_next2m()`: `packages/content/src/muse.ts`
- `m_sees_sleepy_soldier()`: `packages/content/src/muse.ts`
- `m_tele()`: `packages/content/src/muse.ts`
- `m_use_healing()`: `packages/content/src/muse.ts`
- `mbhit()`: `packages/content/src/muse.ts`
- `mbhitm()`: `packages/content/src/muse.ts`
- `mcould_eat_tin()`: `packages/content/src/musestate.ts`
- `mcureblindness()`: `packages/content/src/musestate.ts`
- `mloot_container()`: `packages/content/src/muse.en.ts`, `packages/content/src/muse.ts`
- `mon_consume_unstone()`: `packages/content/src/muse.ts`
- `mon_escape()`: `packages/content/src/muse.ts`
- `mon_has_friends()`: `packages/content/src/muse.ts`
- `mon_likes_objpile_at()`: `packages/content/src/muse.ts`
- `mon_reflects()`: `packages/content/src/musestate.ts`
- `mplayhorn()`: `packages/content/src/muse.en.ts`, `packages/content/src/muse.ts`
- `mquaffmsg()`: `packages/content/src/muse.ts`
- `mreadmsg()`: `packages/content/src/muse.ts`
- `munslime()`: `packages/content/src/muse.ts`, `packages/content/src/slimestate.ts`
- `munstone()`: `packages/content/src/muse.ts`, `packages/content/src/stonestate.ts`
- `muse_newcham_mon()`: `packages/content/src/muse.ts`
- `muse_unslime()`: `packages/content/src/muse.ts`
- `mzapwand()`: `packages/content/src/muse.ts`
- `place_monster()`: `packages/content/src/muse.ts`
- `precheck()`: `packages/content/src/bottle.ts`, `packages/content/src/muse.ts`
- `remove_monster()`: `packages/content/src/muse.ts`
- `reveal_trap()`: `packages/content/src/muse.ts`
- `rnd_defensive_item()`: `packages/content/src/musestate.ts`
- `rnd_misc_item()`: `packages/content/src/musestate.ts`
- `rnd_offensive_item()`: `packages/content/src/musestate.ts`
- `searches_for_item()`: `packages/content/src/musestate.ts`
- `ureflects()`: `packages/content/src/reflect.ts`, `packages/content/src/uhitm_passive.ts`
- `use_defensive()`: `packages/content/src/muse.ts`
- `use_misc()`: `packages/content/src/muse.en.ts`, `packages/content/src/muse.ts`
- `use_offensive()`: `packages/content/src/muse.ts`
- `worm_move()`: `packages/content/src/muse.ts`
- `you_aggravate()`: `packages/content/src/muse.en.ts`, `packages/content/src/muse.ts`

## src/music.c

- (file): `packages/content/src/music.ts`
- `awaken_monsters()`: `packages/content/src/music.ts`
- `awaken_scare()`: `packages/content/src/music.ts`
- `awaken_soldiers()`: `packages/content/src/apply.en.ts`, `packages/content/src/music.ts`
- `beats()`: `packages/content/src/music.ts`
- `calm_nymphs()`: `packages/content/src/apply.en.ts`, `packages/content/src/music.ts`
- `charm_monsters()`: `packages/content/src/music.ts`
- `charm_snakes()`: `packages/content/src/apply.en.ts`, `packages/content/src/music.ts`
- `do_earthquake()`: `packages/content/src/apply.en.ts`, `packages/content/src/earthquake.ts`
- `do_improvisation()`: `packages/content/src/apply.en.ts`, `packages/content/src/music.ts`
- `do_pit()`: `packages/content/src/apply.en.ts`, `packages/content/src/earthquake.ts`
- `do_play_instrument()`: `packages/content/src/apply.en.ts`, `packages/content/src/music.ts`
- `generic_lvl_desc()`: `packages/content/src/earthquake.ts`
- `improvised_notes()`: `packages/content/src/music.ts`

## src/nhlsel.c

- (file): `packages/content/src/selection.ts`
- `l_selection_area()`: `packages/core/src/levelgen/special.ts`
- `l_selection_fillrect()`: `packages/content/src/selection.ts`
- `l_selection_line()`: `packages/core/src/levelgen/special.ts`
- `l_selection_match()`: `packages/content/src/selection.ts`
- `l_selection_randline()`: `packages/content/src/selection.ts`
- `l_selection_rect()`: `packages/content/src/selection.ts`
- `l_selection_setpoint()`: `packages/content/src/selection.ts`

## src/nhlua.c

- (file): `packages/content/src/items.ts`
- `char2typ()`: `packages/core/src/levelgen/spdef.ts`
- `splev_chr2typ()`: `packages/core/src/levelgen/spdef.ts`, `packages/core/src/types/mod.ts`

## src/o_init.c

- (file): `packages/content/src/itemactions.ts`, `packages/content/src/o_init.ts`
- `disco_typename()`: `packages/content/src/itemactions.ts`
- `discover_object()`: `packages/content/src/o_init.ts`, `packages/core/src/types/state.ts`
- `dodiscovered()`: `packages/content/src/itemactions.ts`
- `init_objects()`: `packages/content/src/o_init.ts`
- `interesting_to_discover()`: `packages/content/src/itemactions.ts`
- `obj_shuffle_range()`: `packages/content/src/artiname.ts`, `packages/testkit/src/convert/cdata.ts`
- `objdescr_is()`: `packages/content/src/breakwand.ts`
- `setgemprobs()`: `packages/content/src/gem.ts`
- `shuffle()`: `packages/content/src/o_init.ts`
- `shuffle_all()`: `packages/content/src/o_init.ts`, `packages/core/src/types/state.ts`
- `shuffle_classes()`: `packages/content/src/o_init.ts`
- `shuffle_types()`: `packages/content/src/o_init.ts`

## src/objects.h

- `STRANGE_OBJECT()`: `packages/content/src/mimic.en.ts`

## src/objnam.c

- (file): `packages/content/src/artilist.ts`, `packages/content/src/bottle.ts`, `packages/content/src/glib.ts`, `packages/content/src/objects.en.ts`, `packages/content/src/objnam_read.ts`, `packages/core/src/types/mod.ts`
- `Japanese_item_name()`: `packages/content/src/objnam.ts`
- `Japanese_items()`: `packages/content/src/kittab.ts`, `packages/content/src/role.en.ts`
- `The()`: `packages/content/src/objnam.ts`
- `Yobjnam2()`: `packages/content/src/adtyping.ts`
- `add_erosion_words()`: `packages/content/src/objnam.ts`
- `an()`: `packages/app/src/character.ts`
- `armor_simple_name()`: `packages/content/src/objnam.ts`
- `as_is()`: `packages/content/src/objnam_read.ts`
- `badman()`: `packages/content/src/objnam_read.ts`, `packages/ui/src/plural.ts`
- `bare_artifactname()`: `packages/content/src/artistate.ts`
- `cloak_simple_name()`: `packages/content/src/breakarm.ts`, `packages/content/src/seffect.ts`
- `compounds()`: `packages/content/src/objnam_read.ts`
- `cxname_singular()`: `packages/content/src/revive.ts`
- `def_char_to_objclass()`: `packages/content/src/objnam_read.ts`
- `doname()`: `packages/content/src/objnam.ts`
- `doname_base()`: `packages/content/src/objnam.ts`
- `erosion_matters()`: `packages/content/src/material.ts`
- `gloves_simple_name()`: `packages/content/src/glib.ts`
- `helm_simple_name()`: `packages/content/src/adtyping.ts`, `packages/content/src/polyarmor.ts`, `packages/content/src/seffect.ts`
- `just_an()`: `packages/ui/src/i18n.ts`
- `makeplural()`: `packages/ui/src/plural.ts`
- `makesingular()`: `packages/content/src/objnam_read.ts`
- `mshot_xname()`: `packages/content/src/hmon.ts`
- `no_man()`: `packages/content/src/objnam_read.ts`
- `not_fully_identified()`: `packages/content/src/objnam.ts`
- `obj_is_pname()`: `packages/content/src/objnam.ts`
- `obj_typename()`: `packages/content/src/objnam.ts`
- `one_off()`: `packages/content/src/objnam_read.ts`
- `otense()`: `packages/content/src/read.ts`, `packages/content/src/seffect.ts`
- `paydoname()`: `packages/content/src/objnam.ts`
- `readobjnam()`: `packages/content/src/objnam_read.ts`, `packages/content/src/wish.ts`
- `readobjnam_parse_charges()`: `packages/content/src/objnam_read.ts`
- `readobjnam_postparse1()`: `packages/content/src/objnam_read.ts`
- `readobjnam_preparse()`: `packages/content/src/objnam_read.ts`
- `rnd_class()`: `packages/content/src/gem.ts`, `packages/content/src/polyobj.ts`
- `rnd_otyp_by_namedesc()`: `packages/content/src/objnam_read.ts`, `packages/content/src/wish.ts`
- `shield_simple_name()`: `packages/content/src/seffect.ts`
- `shiny_obj()`: `packages/content/src/orctown.ts`
- `simple_typename()`: `packages/content/src/itemactions.ts`
- `singplur_compound()`: `packages/content/src/objnam_read.ts`, `packages/ui/src/plural.ts`
- `singplur_lookup()`: `packages/content/src/objnam_read.ts`, `packages/ui/src/plural.ts`
- `special_subjs()`: `packages/content/src/objnam_read.ts`
- `spellings()`: `packages/content/src/objnam_read.ts`
- `suit_simple_name()`: `packages/content/src/seffect.ts`, `packages/content/src/shirt.ts`
- `the()`: `packages/content/src/objnam.ts`
- `wishymatch()`: `packages/content/src/objnam_read.ts`
- `wizterrainwish()`: `packages/content/src/wish.ts`, `packages/content/src/wizard/terrainwish.ts`
- `wrp()`: `packages/content/src/objnam_read.ts`
- `wrpsym()`: `packages/content/src/objnam_read.ts`
- `xname()`: `packages/content/src/figurine.en.ts`, `packages/content/src/items.ts`, `packages/content/src/objects.en.ts`, `packages/content/src/objnam.ts`, `packages/testkit/src/convert/defs.ts`

## src/options.c

- (file): `packages/app/src/options.ts`
- `def_inv_order()`: `packages/content/src/disclose.ts`, `packages/ui/src/inventory.ts`

## src/pager.c

- (file): `packages/content/src/liquid.ts`
- `do_look()`: `packages/ui/src/host.ts`
- `dohelp()`: `packages/ui/src/help.ts`
- `doidtrap()`: `packages/content/src/trap.ts`
- `help_menu_items()`: `packages/ui/src/help.ts`
- `lookat()`: `packages/content/src/messages.en.ts`
- `waterbody_name()`: `packages/content/src/liquid.en.ts`, `packages/content/src/terrain.ts`

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
- `in_container()`: `packages/content/src/container.ts`, `packages/testkit/src/invariants.ts`
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

- (file): `packages/content/src/polyarmor.ts`, `packages/content/src/trapstate.ts`, `packages/testkit/src/invariants.ts`
- `break_armor()`: `packages/content/src/polyarmor.ts`
- `change_sex()`: `packages/content/src/gender.ts`
- `dobreathe()`: `packages/content/src/monability.ts`
- `dogaze()`: `packages/content/src/monability.ts`
- `dospit()`: `packages/content/src/dothrow.ts`, `packages/content/src/monability.ts`
- `dosummon()`: `packages/content/src/monability.ts`
- `drop_weapon()`: `packages/content/src/polyarmor.ts`
- `dropp()`: `packages/content/src/polyarmor.ts`
- `float_vs_flight()`: `packages/content/src/trapstate.ts`
- `mbodypart()`: `packages/content/src/trap.ts`
- `newman()`: `packages/content/src/polyself.ts`
- `poly_gender()`: `packages/content/src/gender.ts`
- `polyman()`: `packages/content/src/polyself.ts`
- `polymon()`: `packages/content/src/polyself.ts`, `packages/content/src/upoly.ts`
- `polyself()`: `packages/content/src/polyself.en.ts`, `packages/content/src/polyself.ts`, `packages/content/src/upoly.ts`, `packages/content/src/wizard/polyself.ts`
- `rehumanize()`: `packages/content/src/polyself.ts`, `packages/content/src/upoly.ts`
- `set_uasmon()`: `packages/content/src/polyself.ts`, `packages/content/src/props.ts`
- `uasmon_maxStr()`: `packages/content/src/polyself.ts`
- `udeadinside()`: `packages/content/src/genocide.ts`
- `ugenocided()`: `packages/content/src/vanquished.ts`
- `ugolemeffects()`: `packages/content/src/golemfx.ts`

## src/potion.c

- (file): `packages/content/src/dip.ts`, `packages/content/src/eat.en.ts`, `packages/content/src/potionhit.ts`, `packages/content/src/resist.en.ts`
- `H2Opotion_dip()`: `packages/content/src/dip.en.ts`, `packages/content/src/dip.ts`
- `bottlename()`: `packages/content/src/potionhit.ts`
- `bottlenames()`: `packages/content/src/force.ts`, `packages/content/src/potionhit.ts`
- `dip_hands_ok()`: `packages/content/src/dip.ts`
- `dip_into()`: `packages/content/src/dip.en.ts`, `packages/content/src/dip.ts`
- `dip_ok()`: `packages/content/src/dip.ts`
- `dip_potion_explosion()`: `packages/content/src/dip.ts`
- `djinni_from_bottle()`: `packages/content/src/djinni.en.ts`, `packages/content/src/djinni.ts`
- `dodip()`: `packages/content/src/dip.en.ts`, `packages/content/src/dip.ts`
- `dodrink()`: `packages/content/src/bottle.ts`, `packages/content/src/djinni.ts`, `packages/content/src/potion.ts`
- `dopotion()`: `packages/content/src/potion.ts`
- `ghost_from_bottle()`: `packages/content/src/djinni.ts`
- `healup()`: `packages/content/src/potion.ts`
- `hold_potion()`: `packages/content/src/dip.ts`
- `make_blinded()`: `packages/content/src/props.ts`
- `make_confused()`: `packages/content/src/props.ts`
- `make_glib()`: `packages/content/src/glib.ts`
- `make_hallucinated()`: `packages/content/src/props.ts`
- `make_sick()`: `packages/content/src/eat.en.ts`, `packages/content/src/hunger.ts`, `packages/content/src/potion.ts`
- `make_slimed()`: `packages/content/src/slimestate.ts`
- `make_stoned()`: `packages/content/src/stonestate.ts`
- `make_stunned()`: `packages/content/src/props.ts`, `packages/content/src/resist.en.ts`
- `make_vomiting()`: `packages/content/src/hunger.ts`, `packages/content/src/potion.ts`
- `mixtype()`: `packages/content/src/dip.ts`
- `mongrantswish()`: `packages/content/src/djinni.ts`
- `peffect_acid()`: `packages/content/src/potion.ts`
- `peffect_blindness()`: `packages/content/src/potion.ts`
- `peffect_booze()`: `packages/content/src/potion.ts`
- `peffect_confusion()`: `packages/content/src/potion.ts`
- `peffect_enlightenment()`: `packages/content/src/magic.en.ts`, `packages/content/src/potion.ts`
- `peffect_extra_healing()`: `packages/content/src/potion.ts`
- `peffect_full_healing()`: `packages/content/src/potion.ts`
- `peffect_gain_ability()`: `packages/content/src/potion.ts`
- `peffect_gain_energy()`: `packages/content/src/potion.ts`
- `peffect_gain_level()`: `packages/content/src/potion.ts`
- `peffect_hallucination()`: `packages/content/src/potion.ts`
- `peffect_healing()`: `packages/content/src/potion.ts`
- `peffect_invisibility()`: `packages/content/src/potion.ts`
- `peffect_levitation()`: `packages/content/src/potion.ts`
- `peffect_monster_detection()`: `packages/content/src/potion.ts`
- `peffect_object_detection()`: `packages/content/src/potion.ts`
- `peffect_oil()`: `packages/content/src/potion.ts`
- `peffect_paralysis()`: `packages/content/src/magic.en.ts`, `packages/content/src/potion.ts`
- `peffect_polymorph()`: `packages/content/src/polyself.ts`, `packages/content/src/potion.ts`
- `peffect_restore_ability()`: `packages/content/src/attrstate.ts`, `packages/content/src/magic.en.ts`, `packages/content/src/potion.ts`
- `peffect_see_invisible()`: `packages/content/src/potion.ts`
- `peffect_sickness()`: `packages/content/src/potion.ts`
- `peffect_sleeping()`: `packages/content/src/potion.ts`
- `peffect_speed()`: `packages/content/src/potion.ts`
- `peffect_water()`: `packages/content/src/potion.ts`
- `peffects()`: `packages/content/src/potion.ts`
- `poof()`: `packages/content/src/dip.ts`
- `potion_dip()`: `packages/content/src/dip.en.ts`, `packages/content/src/dip.ts`
- `potionbreathe()`: `packages/content/src/muse.en.ts`, `packages/content/src/potionhit.ts`
- `potionhit()`: `packages/content/src/muse.en.ts`, `packages/content/src/potionhit.ts`
- `self_invis_message()`: `packages/content/src/invis.en.ts`, `packages/content/src/invis.ts`
- `speed_up()`: `packages/content/src/potion.ts`
- `split_mon()`: `packages/content/src/clone.ts`, `packages/content/src/passiveum.ts`
- `strange_feeling()`: `packages/content/src/magic.ts`

## src/pray.c

- (file): `packages/content/src/offer.ts`, `packages/content/src/pray.en.ts`, `packages/content/src/pray.ts`
- `TROUBLE_()`: `packages/content/src/pray.ts`
- `a_align()`: `packages/content/src/align.ts`
- `align_gname()`: `packages/content/src/gods.ts`
- `align_gtitle()`: `packages/content/src/align.en.ts`, `packages/content/src/gods.ts`
- `altar_wrath()`: `packages/content/src/align.en.ts`, `packages/content/src/align.ts`
- `angrygods()`: `packages/content/src/pray.ts`
- `bestow_artifact()`: `packages/content/src/offer.ts`
- `can_pray()`: `packages/content/src/pray.ts`
- `consume_offering()`: `packages/content/src/offer.ts`
- `critically_low_hp()`: `packages/content/src/pray.ts`
- `desecrate_altar()`: `packages/content/src/pray.en.ts`, `packages/content/src/pray.ts`
- `dopray()`: `packages/content/src/pray.ts`
- `dosacrifice()`: `packages/content/src/offer.en.ts`, `packages/content/src/offer.ts`
- `eval_offering()`: `packages/content/src/offer.ts`
- `fix_curse_trouble()`: `packages/content/src/pray.ts`
- `fix_worst_trouble()`: `packages/content/src/attrstate.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/pray.ts`
- `fry_by_god()`: `packages/content/src/pray.ts`, `packages/content/src/role.en.ts`
- `god_zaps_you()`: `packages/content/src/pray.ts`
- `gods_upset()`: `packages/content/src/pray.ts`
- `godvoice()`: `packages/content/src/align.ts`
- `in_trouble()`: `packages/content/src/pray.ts`
- `offer_corpse()`: `packages/content/src/offer.en.ts`, `packages/content/src/offer.ts`
- `offer_different_alignment_altar()`: `packages/content/src/offer.ts`
- `offer_fake_amulet()`: `packages/content/src/offer.ts`
- `offer_negative_valued()`: `packages/content/src/offer.ts`
- `offer_too_soon()`: `packages/content/src/offer.ts`
- `on_altar()`: `packages/content/src/align.ts`
- `on_shrine()`: `packages/content/src/align.ts`
- `pleased()`: `packages/content/src/pray.ts`
- `prayer_done()`: `packages/content/src/pray.ts`
- `sacrifice_value()`: `packages/content/src/offer.ts`
- `sacrifice_your_race()`: `packages/content/src/offer.ts`
- `u_gname()`: `packages/content/src/align.ts`
- `water_prayer()`: `packages/content/src/pray.ts`
- `worst_cursed_item()`: `packages/content/src/pray.ts`

## src/priest.c

- `angry_priest()`: `packages/content/src/peaceful.ts`
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

## src/questpgr.c

- `is_quest_artifact()`: `packages/content/src/artistate.ts`

## src/read.c

- (file): `packages/content/src/detectobj.ts`, `packages/content/src/genocide.ts`, `packages/content/src/wizard/genesis.ts`
- `apron_text()`: `packages/content/src/shirt.en.ts`
- `can_center_cloud()`: `packages/content/src/seffect.ts`
- `cant_revive()`: `packages/content/src/revive.ts`, `packages/content/src/statue.ts`
- `charge_ok()`: `packages/content/src/seffect.ts`
- `create_particular()`: `packages/content/src/wizard/genesis.ts`
- `create_particular_creation()`: `packages/content/src/wizard/genesis.ts`
- `create_particular_parse()`: `packages/content/src/wizard/genesis.ts`
- `disintegrate_cursed_armor()`: `packages/content/src/seffect.ts`
- `do_class_genocide()`: `packages/content/src/genocide.ts`
- `do_genocide()`: `packages/content/src/genocide.ts`, `packages/content/src/role.en.ts`, `packages/content/src/throne.ts`
- `doread()`: `packages/content/src/read.ts`, `packages/content/src/shirt.en.ts`, `packages/content/src/shirt.ts`, `packages/content/src/spell.ts`
- `drop_boulder_on_monster()`: `packages/content/src/magic.en.ts`, `packages/content/src/read.ts`
- `drop_boulder_on_player()`: `packages/content/src/magic.en.ts`, `packages/content/src/read.ts`
- `forget()`: `packages/content/src/seffect.ts`
- `hawaiian_design()`: `packages/content/src/shirt.en.ts`, `packages/content/src/shirt.ts`
- `hawaiian_motif()`: `packages/content/src/shirt.en.ts`, `packages/content/src/shirt.ts`
- `learnscrolltyp()`: `packages/content/src/read.ts`
- `litroom()`: `packages/content/src/read.ts`
- `maybe_tame()`: `packages/content/src/seffect.ts`
- `p_glow1()`: `packages/content/src/seffect.ts`
- `p_glow2()`: `packages/content/src/seffect.ts`
- `p_glow3()`: `packages/content/src/seffect.ts`
- `recharge()`: `packages/content/src/jewelry.ts`, `packages/content/src/seffect.ts`
- `seffect_()`: `packages/content/src/scroll.en.ts`
- `seffect_amnesia()`: `packages/content/src/seffect.ts`
- `seffect_blank_paper()`: `packages/content/src/read.ts`
- `seffect_charging()`: `packages/content/src/seffect.ts`
- `seffect_confuse_monster()`: `packages/content/src/seffect.ts`
- `seffect_create_monster()`: `packages/content/src/seffect.ts`
- `seffect_destroy_armor()`: `packages/content/src/seffect.ts`
- `seffect_earth()`: `packages/content/src/magic.en.ts`, `packages/content/src/read.ts`
- `seffect_enchant_armor()`: `packages/content/src/read.ts`
- `seffect_enchant_weapon()`: `packages/content/src/read.ts`
- `seffect_fire()`: `packages/content/src/seffect.ts`
- `seffect_genocide()`: `packages/content/src/genocide.ts`, `packages/content/src/read.ts`
- `seffect_gold_detection()`: `packages/content/src/read.ts`
- `seffect_identify()`: `packages/content/src/read.ts`
- `seffect_light()`: `packages/content/src/read.ts`, `packages/content/src/seffect.ts`
- `seffect_magic_mapping()`: `packages/content/src/magic.en.ts`, `packages/content/src/read.ts`
- `seffect_remove_curse()`: `packages/content/src/read.ts`
- `seffect_scare_monster()`: `packages/content/src/seffect.ts`
- `seffect_taming()`: `packages/content/src/seffect.ts`
- `seffect_teleportation()`: `packages/content/src/read.ts`
- `seffects()`: `packages/content/src/read.ts`, `packages/content/src/seffect.ts`
- `stripspe()`: `packages/content/src/seffect.ts`
- `tshirt_text()`: `packages/content/src/shirt.en.ts`
- `valid_cloud_pos()`: `packages/content/src/seffect.ts`
- `wand_explode()`: `packages/content/src/seffect.ts`

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

## src/restore.c

- `getlev()`: `packages/content/src/dog.ts`

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
- `shuffle_int_array()`: `packages/content/src/unicorn.ts`

## src/role.c

- (file): `packages/app/src/options.ts`, `packages/app/src/title.ts`, `packages/content/src/hero.ts`, `packages/content/src/urole.ts`, `packages/content/src/were.en.ts`, `packages/core/src/types/entity.ts`
- `Goodbye()`: `packages/content/src/botl.ts`, `packages/content/src/role.en.ts`
- `Hello()`: `packages/content/src/role.en.ts`, `packages/content/src/shk.ts`
- `aligns()`: `packages/content/src/disclose.ts`, `packages/core/src/character.ts`, `packages/core/src/registry.ts`
- `build_plselection_prompt()`: `packages/app/src/character.ts`
- `genders()`: `packages/content/src/role.en.ts`, `packages/core/src/registry.ts`, `packages/core/src/types/entity.ts`
- `genl_player_setup()`: `packages/app/src/character.ts`
- `ok_align()`: `packages/content/src/gods.ts`, `packages/core/src/character.ts`
- `ok_gend()`: `packages/core/src/character.ts`
- `ok_race()`: `packages/core/src/character.ts`
- `ok_role()`: `packages/core/src/character.ts`
- `pick_align()`: `packages/app/src/character.ts`
- `pick_gend()`: `packages/app/src/character.ts`
- `pick_race()`: `packages/app/src/character.ts`
- `pick_role()`: `packages/app/src/character.ts`
- `plsel_startmenu()`: `packages/app/src/character.ts`
- `promptsep()`: `packages/app/src/character.ts`
- `races()`: `packages/content/src/polyself.ts`, `packages/content/src/racetab.ts`, `packages/content/src/role.en.ts`, `packages/content/src/roles.ts`, `packages/content/src/urole.ts`, `packages/core/src/types/mod.ts`
- `rigid_role_checks()`: `packages/app/src/character.ts`
- `role_init()`: `packages/content/src/gods.ts`, `packages/content/src/kit.ts`, `packages/content/src/spellcalc.ts`, `packages/core/src/engine.ts`
- `role_menu_extra()`: `packages/app/src/character.ts`
- `roles()`: `packages/content/src/artilist.ts`, `packages/content/src/role.en.ts`, `packages/content/src/roles.ts`, `packages/content/src/roletab.ts`, `packages/content/src/spellcalc.ts`, `packages/core/src/types/mod.ts`
- `root_plselection_prompt()`: `packages/app/src/character.ts`
- `setup_algnmenu()`: `packages/app/src/character.ts`
- `setup_gendmenu()`: `packages/app/src/character.ts`
- `setup_racemenu()`: `packages/app/src/character.ts`
- `setup_rolemenu()`: `packages/app/src/character.ts`
- `str2race()`: `packages/app/src/character.ts`
- `str2role()`: `packages/app/src/character.ts`
- `validalign()`: `packages/app/src/character.ts`
- `validgend()`: `packages/app/src/character.ts`
- `validrace()`: `packages/app/src/character.ts`

## src/rumors.c

- `doconsult()`: `packages/content/src/chat.ts`
- `get_rnd_text()`: `packages/content/src/rumors.ts`
- `getrumor()`: `packages/content/src/rumors.ts`
- `outrumor()`: `packages/content/src/rumors.ts`

## src/selvar.c

- (file): `packages/content/src/selection.ts`, `packages/core/src/levelgen/special.ts`
- `selection_do_grow()`: `packages/content/src/selection.ts`
- `selection_do_line()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `selection_do_randline()`: `packages/content/src/selection.ts`
- `selection_filter_percent()`: `packages/content/src/selection.ts`
- `selection_floodfill()`: `packages/content/src/orctown.ts`
- `selection_getbounds()`: `packages/content/src/selection.ts`
- `selection_iterate()`: `packages/content/src/selection.ts`
- `selection_not()`: `packages/content/src/selection.ts`
- `selection_rndcoord()`: `packages/content/src/orctown.ts`, `packages/content/src/selection.ts`, `packages/content/src/sp_lev.ts`

## src/shk.c

- (file): `packages/content/src/gem.ts`, `packages/content/src/rooms.ts`
- `Shk_Your()`: `packages/content/src/light.ts`
- `add_damage()`: `packages/content/src/shopdamage.ts`
- `add_one_tobill()`: `packages/content/src/shk.ts`
- `addtobill()`: `packages/content/src/shk.ts`
- `addupbill()`: `packages/content/src/shk.ts`
- `after_shk_move()`: `packages/content/src/rooms.ts`, `packages/content/src/shk.ts`
- `alter_cost()`: `packages/content/src/shk.ts`
- `angry_shk_exists()`: `packages/content/src/shk.ts`
- `append_honorific()`: `packages/content/src/shk.ts`
- `bill_box_content()`: `packages/content/src/shk.ts`
- `billable()`: `packages/content/src/shk.ts`
- `bp_to_obj()`: `packages/content/src/shk.ts`
- `cad()`: `packages/content/src/shkpay.ts`
- `call_kops()`: `packages/content/src/kops.ts`, `packages/content/src/shk.ts`
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
- `kops_gone()`: `packages/content/src/kops.ts`
- `litter_getpos()`: `packages/content/src/shkdamage.ts`
- `litter_scatter()`: `packages/content/src/shkdamage.ts`
- `make_angry_shk()`: `packages/content/src/shk.ts`
- `make_happy_shk()`: `packages/content/src/shk.ts`
- `make_happy_shoppers()`: `packages/content/src/shk.ts`
- `make_itemized_bill()`: `packages/content/src/pay.ts`
- `makekops()`: `packages/content/src/kops.ts`
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
- `shk_your()`: `packages/content/src/light.ts`, `packages/content/src/revive.ts`
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

- (file): `packages/content/src/mkroom.en.ts`, `packages/content/src/pray.en.ts`
- `attrcurse()`: `packages/content/src/pray.ts`
- `dosit()`: `packages/content/src/dosit.ts`, `packages/content/src/egg.en.ts`
- `lay_an_egg()`: `packages/content/src/dosit.ts`, `packages/content/src/egg.en.ts`
- `rndcurse()`: `packages/content/src/sit.ts`
- `take_gold()`: `packages/content/src/spell.ts`, `packages/content/src/throne.ts`
- `throne_sit_effect()`: `packages/content/src/throne.ts`

## src/sounds.c

- (file): `packages/content/src/dog.en.ts`
- `cry_sound()`: `packages/content/src/egg.ts`
- `dochat()`: `packages/content/src/chat.en.ts`, `packages/content/src/chat.ts`
- `domonnoise()`: `packages/content/src/chat.en.ts`, `packages/content/src/chat.ts`
- `dotalk()`: `packages/content/src/chat.ts`
- `growl()`: `packages/content/src/dog.ts`
- `growl_sound()`: `packages/content/src/dog.ts`, `packages/content/src/were.ts`
- `whimper()`: `packages/content/src/dog.ts`
- `yelp()`: `packages/content/src/dog.ts`

## src/sp_lev.c

- (file): `packages/content/src/hellfill.ts`, `packages/content/src/mazewalk.ts`, `packages/content/src/orcus.ts`, `packages/content/src/temperature.ts`, `packages/core/src/levelgen/builder.ts`, `packages/core/src/types/level.ts`, `packages/core/src/types/mod.ts`
- `build_room()`: `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `check_room()`: `packages/core/src/levelgen/rooms.ts`
- `create_altar()`: `packages/content/src/priest.ts`, `packages/core/src/types/mod.ts`
- `create_door()`: `packages/content/src/mklev.ts`, `packages/content/src/oracle.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/sprooms.ts`
- `create_monster()`: `packages/content/src/orctown.ts`, `packages/content/src/sp_lev.ts`
- `create_object()`: `packages/content/src/castle.ts`, `packages/content/src/medusa.ts`, `packages/content/src/minesend.ts`, `packages/content/src/orctown.ts`, `packages/content/src/sokoprize.ts`, `packages/content/src/sp_lev.ts`
- `create_room()`: `packages/core/src/levelgen/rooms.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `create_subroom()`: `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `create_trap()`: `packages/content/src/sp_lev.ts`
- `dig_corridor()`: `packages/content/src/mklev.ts`, `packages/core/src/levelgen/corridors.ts`, `packages/core/src/levelgen/mkmap.ts`
- `ensure_way_out()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `fill_empty_maze()`: `packages/content/src/mazefill.ts`
- `fill_special_room()`: `packages/content/src/shknam.ts`, `packages/content/src/vault.ts`, `packages/content/src/zoo.ts`
- `floodfillchk_match_under()`: `packages/content/src/orctown.ts`
- `generate_way_out_method()`: `packages/core/src/levelgen/special.ts`
- `get_location()`: `packages/content/src/hellfill.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/spdef.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `good_stair_loc()`: `packages/content/src/hellfill.ts`
- `is_ok_location()`: `packages/content/src/sp_lev.ts`
- `l_create_stairway()`: `packages/content/src/hellfill.ts`, `packages/content/src/ladder.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`
- `light_region()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `link_doors_rooms()`: `packages/content/src/sp_lev.ts`, `packages/content/src/zoo.ts`, `packages/core/src/levelgen/special.ts`
- `load_special()`: `packages/content/src/detect.ts`, `packages/content/src/sp_lev.ts`
- `lspo_altar()`: `packages/core/src/types/mod.ts`
- `lspo_door()`: `packages/content/src/oracle.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_drawbridge()`: `packages/content/src/dbridge.ts`
- `lspo_engraving()`: `packages/content/src/castle.ts`, `packages/content/src/sokoprize.ts`, `packages/content/src/sp_lev.ts`
- `lspo_exclusion()`: `packages/content/src/levelflags.ts`
- `lspo_feature()`: `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_finalize_level()`: `packages/content/src/asmodeus.ts`, `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`
- `lspo_gold()`: `packages/content/src/sp_lev.ts`
- `lspo_level_flags()`: `packages/content/src/levelflags.ts`
- `lspo_level_init()`: `packages/core/src/types/mod.ts`
- `lspo_levregion()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_map()`: `packages/content/src/mazefill.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/spdef.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_mazewalk()`: `packages/content/src/mazewalk.ts`
- `lspo_monster()`: `packages/core/src/types/mod.ts`
- `lspo_object()`: `packages/core/src/types/mod.ts`
- `lspo_random_corridors()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_region()`: `packages/content/src/graveyard.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_replace_terrain()`: `packages/content/src/selection.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_room()`: `packages/core/src/levelgen/special.ts`, `packages/core/src/levelgen/sprooms.ts`, `packages/core/src/types/mod.ts`
- `lspo_stair()`: `packages/core/src/types/mod.ts`
- `lspo_teleport_region()`: `packages/core/src/types/mod.ts`
- `lspo_terrain()`: `packages/content/src/selection.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lspo_trap()`: `packages/core/src/types/mod.ts`
- `lspo_wallify()`: `packages/content/src/orctown.ts`
- `lvlfill_maze_grid()`: `packages/content/src/hellfill.ts`, `packages/core/src/levelgen/maze.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `lvlfill_solid()`: `packages/content/src/juiblex.ts`, `packages/core/src/levelgen/special.ts`
- `lvlfill_swamp()`: `packages/content/src/juiblex.ts`
- `map_cleanup()`: `packages/content/src/hellfill.ts`
- `mapfrag_match()`: `packages/content/src/selection.ts`
- `match_maptyps()`: `packages/content/src/selection.ts`
- `maybe_add_door()`: `packages/content/src/zoo.ts`
- `maze1xy()`: `packages/content/src/mazefill.ts`
- `mksobj_at()`: `packages/content/src/mklev.ts`
- `pm_good_location()`: `packages/content/src/priest.ts`
- `pm_to_humidity()`: `packages/content/src/sp_lev.ts`
- `random_wdir()`: `packages/content/src/selection.ts`
- `rnddoor()`: `packages/core/src/types/mod.ts`
- `rndtrap()`: `packages/content/src/mklev.ts`
- `sel_set_door()`: `packages/content/src/sp_lev.ts`, `packages/core/src/types/mod.ts`
- `sel_set_feature()`: `packages/core/src/types/mod.ts`
- `sel_set_ter()`: `packages/content/src/selection.ts`, `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/special.ts`
- `set_door_orientation()`: `packages/content/src/sp_lev.ts`, `packages/core/src/levelgen/special.ts`
- `set_wall_property()`: `packages/content/src/baalz.ts`
- `set_wallprop_in_selection()`: `packages/content/src/levelflags.ts`
- `solidify_map()`: `packages/content/src/levelflags.ts`
- `splev_initlev()`: `packages/content/src/hellfill.ts`, `packages/core/src/levelgen/special.ts`, `packages/core/src/types/mod.ts`
- `spo_endroom()`: `packages/core/src/levelgen/sprooms.ts`
- `wallification()`: `packages/core/src/levelgen/mkmap.ts`
- `wallify_map()`: `packages/content/src/orctown.ts`, `packages/core/src/levelgen/mkmap.ts`, `packages/core/src/levelgen/special.ts`

## src/spell.c

- (file): `packages/content/src/spell.ts`, `packages/content/src/spellcalc.ts`, `packages/content/src/write.ts`
- `age_spells()`: `packages/content/src/spell.ts`
- `book_disappears()`: `packages/content/src/spell.ts`
- `can_center_spell_location()`: `packages/content/src/cast.ts`
- `cast_protection()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `confused_book()`: `packages/content/src/spell.ts`
- `cursed_book()`: `packages/content/src/spell.ts`
- `deadbook()`: `packages/content/src/deadbook.ts`, `packages/content/src/spell.en.ts`
- `deadbook_pacify_undead()`: `packages/content/src/deadbook.ts`
- `docast()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `dospellmenu()`: `packages/content/src/cast.ts`, `packages/content/src/spell.ts`
- `dovspell()`: `packages/content/src/spell.ts`
- `dowizcast()`: `packages/content/src/wizard/cast.ts`
- `getdir()`: `packages/content/src/cast.ts`
- `getspell()`: `packages/content/src/cast.ts`
- `known_spell()`: `packages/content/src/write.ts`
- `learn()`: `packages/content/src/spell.en.ts`, `packages/content/src/spell.ts`
- `losespells()`: `packages/content/src/spell.ts`
- `percent_success()`: `packages/content/src/spellcalc.ts`
- `rejectcasting()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `skill_based_spellbook_id()`: `packages/content/src/kit.ts`
- `spell_aim_step()`: `packages/content/src/cast.ts`
- `spell_backfire()`: `packages/content/src/cast.ts`
- `spell_skilltype()`: `packages/content/src/spellcalc.ts`
- `spelleffects()`: `packages/content/src/cast.ts`, `packages/content/src/jump.ts`, `packages/content/src/wizard/cast.ts`
- `spelleffects_check()`: `packages/content/src/cast.ts`, `packages/content/src/spell.en.ts`
- `spellet()`: `packages/content/src/spell.ts`
- `spellretention()`: `packages/content/src/spell.ts`
- `spelltypemnemonic()`: `packages/content/src/spell.en.ts`, `packages/content/src/spellcalc.ts`
- `study_book()`: `packages/content/src/spell.en.ts`, `packages/content/src/spell.ts`
- `throwspell()`: `packages/content/src/cast.ts`

## src/stairs.c

- `stairway_at()`: `packages/content/src/actions.ts`
- `stairway_find_type_dir()`: `packages/content/src/ladder.ts`
- `u_on_sstairs()`: `packages/content/src/actions.ts`

## src/steal.c

- `findgold()`: `packages/content/src/detectobj.ts`, `packages/content/src/steal.ts`
- `mpickobj()`: `packages/content/src/steal.ts`
- `relobj()`: `packages/content/src/mongear.ts`
- `remove_worn_item()`: `packages/content/src/jewelry.ts`, `packages/content/src/steal.ts`
- `somegold()`: `packages/content/src/steal.ts`
- `steal()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `stealamulet()`: `packages/content/src/steal.ts`
- `stealarm()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `stealgold()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `thiefdead()`: `packages/content/src/nomul.ts`, `packages/content/src/steal.ts`
- `unresponsive()`: `packages/content/src/steal.ts`
- `unstolenarm()`: `packages/content/src/steal.en.ts`, `packages/content/src/steal.ts`
- `worn_item_removal()`: `packages/content/src/steal.ts`

## src/steed.c

- `put_saddle_on_mon()`: `packages/content/src/dog.ts`, `packages/content/src/items.ts`

## src/symbols.c

- `assign_graphics()`: `packages/core/src/types/mod.ts`, `packages/core/src/view.ts`
- `init_rogue_symbols()`: `packages/content/src/symset.ts`, `packages/core/src/types/mod.ts`

## src/teleport.c

- (file): `packages/content/src/teleport.ts`
- `collect_coords()`: `packages/content/src/teleport.ts`
- `domagicportal()`: `packages/content/src/portal.ts`, `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `dotele()`: `packages/content/src/drown.ts`, `packages/content/src/wizard/teleport.ts`
- `dotelecmd()`: `packages/content/src/wizard/teleport.ts`
- `enexto()`: `packages/content/src/generation.ts`, `packages/core/src/engine.ts`
- `enexto_core()`: `packages/content/src/generation.ts`
- `goodpos()`: `packages/content/src/dokick.ts`, `packages/content/src/generation.ts`, `packages/content/src/liquid.ts`, `packages/content/src/teleport.ts`, `packages/content/src/uwater.ts`, `packages/core/src/engine.ts`, `packages/testkit/src/invariants.ts`
- `level_tele()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`, `packages/content/src/wizard/levelport.ts`
- `level_tele_trap()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `m_blocks_teleporting()`: `packages/content/src/teleport.ts`
- `mlevel_tele_trap()`: `packages/content/src/trap.ts`
- `mtele_trap()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `mvault_tele()`: `packages/content/src/trap.ts`
- `noteleport_level()`: `packages/content/src/teleport.ts`
- `random_teleport_level()`: `packages/content/src/teleport.ts`
- `rloc()`: `packages/content/src/generation.ts`, `packages/content/src/teleport.ts`, `packages/content/src/trap.ts`
- `rloc_pos_ok()`: `packages/content/src/teleport.ts`
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
- `vault_tele()`: `packages/content/src/trap.ts`

## src/timeout.c

- (file): `packages/content/src/eat.en.ts`, `packages/content/src/luck.ts`, `packages/content/src/props.ts`, `packages/content/src/resist.en.ts`, `packages/content/src/slime.en.ts`, `packages/content/src/slimestate.ts`
- `attach_egg_hatch_timeout()`: `packages/content/src/eggstate.ts`
- `attach_fig_transform_timeout()`: `packages/content/src/figurinestate.ts`
- `begin_burn()`: `packages/content/src/burnstate.ts`, `packages/content/src/light.ts`, `packages/testkit/src/invariants.ts`
- `burn_away_slime()`: `packages/content/src/slimestate.ts`
- `burn_object()`: `packages/content/src/apply.en.ts`, `packages/content/src/light.ts`
- `choke_dialogue()`: `packages/content/src/jewelry.ts`
- `end_burn()`: `packages/content/src/burnstate.ts`
- `fall_asleep()`: `packages/content/src/adtyping.ts`, `packages/content/src/trap.ts`
- `hatch_egg()`: `packages/content/src/egg.en.ts`, `packages/content/src/egg.ts`
- `incr_itimeout()`: `packages/content/src/props.ts`
- `lantern_message()`: `packages/content/src/light.ts`
- `learn_egg_type()`: `packages/content/src/eggstate.ts`
- `levitation_dialogue()`: `packages/content/src/levitation.ts`
- `nh_timeout()`: `packages/content/src/cast.ts`, `packages/content/src/creamed.ts`, `packages/content/src/fumble.en.ts`, `packages/content/src/fumble.ts`, `packages/content/src/gem.ts`, `packages/content/src/hunger.ts`, `packages/content/src/jewelry.ts`, `packages/content/src/levitation.ts`, `packages/content/src/luck.ts`, `packages/content/src/polyself.ts`, `packages/content/src/props.ts`, `packages/content/src/resist.en.ts`, `packages/content/src/slime.ts`, `packages/content/src/stoning.ts`
- `obj_split_timers()`: `packages/content/src/burnstate.ts`
- `set_itimeout()`: `packages/content/src/props.ts`
- `slime_dialogue()`: `packages/content/src/slime.ts`
- `slimed_to_death()`: `packages/content/src/slime.ts`
- `slip_or_trip()`: `packages/content/src/fumble.en.ts`, `packages/content/src/fumble.ts`
- `spot_stop_timers()`: `packages/content/src/icestate.ts`
- `spot_time_left()`: `packages/content/src/icestate.ts`
- `stoned_dialogue()`: `packages/content/src/stoning.ts`
- `stoned_texts()`: `packages/content/src/stoning.en.ts`
- `stop_timer()`: `packages/content/src/eggstate.ts`, `packages/content/src/figurinestate.ts`
- `vomiting_dialogue()`: `packages/content/src/hunger.ts`

## src/topten.c

- (file): `packages/content/src/newcham.ts`, `packages/content/src/zoo.ts`
- `formatkiller()`: `packages/ui/src/gameover.ts`
- `outentry()`: `packages/app/src/scores.ts`
- `outheader()`: `packages/app/src/scores.ts`
- `topten()`: `packages/app/src/scores.ts`, `packages/content/src/disclose.ts`, `packages/ui/src/gameover.ts`
- `tt_doppel()`: `packages/content/src/newcham.ts`

## src/trap.c

- (file): `packages/content/src/magictrap.ts`, `packages/content/src/mazefill.ts`, `packages/content/src/reach.ts`, `packages/core/src/types/mod.ts`
- `acid_damage()`: `packages/content/src/erode.ts`
- `activate_statue_trap()`: `packages/content/src/statue.ts`
- `adj_nonconjoined_pit()`: `packages/content/src/trap.ts`
- `animate_statue()`: `packages/content/src/statue.ts`
- `b_trapped()`: `packages/content/src/btrapped.ts`
- `back_on_ground()`: `packages/content/src/drown.ts`
- `blindgas()`: `packages/content/src/chesttrap.ts`
- `blow_up_landmine()`: `packages/content/src/landmine.ts`
- `burnarmor()`: `packages/content/src/erode.ts`
- `chest_trap()`: `packages/content/src/chesttrap.en.ts`, `packages/content/src/chesttrap.ts`
- `choose_trapnote()`: `packages/content/src/trap.ts`
- `clamp_hole_destination()`: `packages/content/src/trap.ts`
- `clear_conjoined_pits()`: `packages/content/src/trapstate.ts`
- `climb_pit()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `closeholdingtrap()`: `packages/content/src/zap.ts`
- `cnv_trap_obj()`: `packages/content/src/untrap.ts`
- `conjoined_pits()`: `packages/content/src/trap.ts`, `packages/content/src/trapstate.ts`
- `could_untrap()`: `packages/content/src/untrap.en.ts`, `packages/content/src/untrap.ts`
- `delfloortrap()`: `packages/content/src/buzz.ts`, `packages/content/src/dig.ts`
- `deltrap()`: `packages/content/src/sokoban.ts`, `packages/content/src/trap.ts`, `packages/core/src/types/mod.ts`
- `destroy_strings()`: `packages/content/src/flooreffects.ts`
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
- `drain_en()`: `packages/content/src/magictrap.ts`, `packages/content/src/uenergy.ts`
- `drown()`: `packages/content/src/drown.ts`, `packages/content/src/liquid.en.ts`
- `emergency_disrobe()`: `packages/content/src/drown.ts`
- `erode_obj()`: `packages/content/src/erode.en.ts`, `packages/content/src/erode.ts`
- `fall_through()`: `packages/content/src/trap.ts`
- `feeltrap()`: `packages/content/src/trap.ts`
- `fill_pit()`: `packages/content/src/flooreffects.ts`
- `find_random_launch_coord()`: `packages/content/src/trap.ts`
- `fire_damage()`: `packages/content/src/erode.en.ts`, `packages/content/src/flooreffects.ts`
- `fire_damage_chain()`: `packages/content/src/flooreffects.ts`
- `float_down()`: `packages/content/src/levitation.ts`, `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `float_up()`: `packages/content/src/levitation.ts`, `packages/content/src/trap.en.ts`
- `floor_trigger()`: `packages/content/src/trap.ts`
- `help_monster_out()`: `packages/content/src/untrap.ts`
- `hole_destination()`: `packages/content/src/trap.ts`
- `ignite_items()`: `packages/content/src/light.ts`
- `instapetrify()`: `packages/content/src/stonetouch.ts`, `packages/content/src/stoning.ts`, `packages/content/src/upoly.ts`
- `into_vs_onto()`: `packages/content/src/trap.ts`, `packages/content/src/untrap.ts`
- `isclearpath()`: `packages/content/src/trap.ts`, `packages/testkit/src/invariants.ts`
- `launch_obj()`: `packages/content/src/rollboulder.ts`, `packages/content/src/trap.en.ts`
- `lava_damage()`: `packages/content/src/flooreffects.ts`
- `lava_effects()`: `packages/content/src/drown.ts`
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
- `pot_acid_damage()`: `packages/content/src/water.ts`
- `rescued_from_terrain()`: `packages/content/src/drown.ts`
- `reset_utrap()`: `packages/content/src/levitation.ts`
- `reward_untrap()`: `packages/content/src/untrap.ts`
- `rnd_nextto_goodpos()`: `packages/content/src/drown.ts`, `packages/content/src/worm.ts`
- `seetrap()`: `packages/content/src/trap.ts`
- `set_utrap()`: `packages/content/src/trapstate.ts`
- `sink_into_lava()`: `packages/content/src/drown.ts`
- `sokoban_guilt()`: `packages/content/src/sokoban.ts`
- `t_at()`: `packages/core/src/traps.ts`
- `t_missile()`: `packages/content/src/trap.ts`
- `thitm()`: `packages/content/src/trap.ts`
- `trap_ice_effects()`: `packages/content/src/ice.ts`
- `trapeffect_anti_magic()`: `packages/content/src/magictrap.ts`
- `trapeffect_fire_trap()`: `packages/content/src/magictrap.ts`
- `trapeffect_hole()`: `packages/content/src/trap.ts`
- `trapeffect_landmine()`: `packages/content/src/landmine.ts`, `packages/content/src/trap.en.ts`
- `trapeffect_magic_portal()`: `packages/content/src/trap.ts`
- `trapeffect_magic_trap()`: `packages/content/src/magictrap.ts`, `packages/content/src/trap.en.ts`
- `trapeffect_pit()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `trapeffect_poly_trap()`: `packages/content/src/polyself.en.ts`, `packages/content/src/polyself.ts`
- `trapeffect_rolling_boulder_trap()`: `packages/content/src/rollboulder.ts`, `packages/content/src/trap.en.ts`
- `trapeffect_statue_trap()`: `packages/content/src/statue.ts`
- `trapeffect_vibrating_square()`: `packages/content/src/trap.en.ts`, `packages/content/src/trap.ts`
- `trapeffect_web()`: `packages/content/src/trap.ts`
- `trapnote()`: `packages/content/src/trap.en.ts`
- `try_disarm()`: `packages/content/src/untrap.en.ts`, `packages/content/src/untrap.ts`
- `try_lift()`: `packages/content/src/untrap.ts`
- `uescaped_shaft()`: `packages/content/src/reach.ts`
- `unsqueak_ok()`: `packages/content/src/untrap.ts`
- `untrap()`: `packages/content/src/untrap.ts`
- `untrap_box()`: `packages/content/src/untrap.ts`
- `untrap_prob()`: `packages/content/src/untrap.ts`
- `uteetering_at_seen_pit()`: `packages/content/src/reach.ts`
- `water_damage()`: `packages/content/src/erode.en.ts`, `packages/content/src/spell.ts`, `packages/content/src/trap.ts`, `packages/content/src/water.ts`
- `water_damage_chain()`: `packages/content/src/water.ts`
- `wearing_iron_shoes()`: `packages/content/src/trap.ts`

## src/u_init.c

- (file): `packages/content/src/hero.ts`, `packages/content/src/kit.ts`, `packages/content/src/kittab.ts`, `packages/content/src/skills.ts`
- `Archeologist()`: `packages/content/src/kittab.ts`
- `Healing_book()`: `packages/content/src/kittab.ts`
- `Skill_A()`: `packages/content/src/skilltab.ts`
- `Skill_V()`: `packages/content/src/skills.ts`
- `UNDEF_SPE()`: `packages/content/src/kittab.ts`
- `ini_inv()`: `packages/content/src/kit.ts`
- `ini_inv_adjust_obj()`: `packages/content/src/kit.ts`
- `ini_inv_mkobj_filter()`: `packages/content/src/kit.ts`
- `ini_inv_obj_substitution()`: `packages/content/src/kit.ts`
- `ini_inv_use_obj()`: `packages/content/src/kit.ts`
- `inv_subs()`: `packages/content/src/kittab.ts`
- `knows_class()`: `packages/content/src/kit.ts`
- `knows_object()`: `packages/content/src/kittab.ts`
- `restricted_spell_discipline()`: `packages/content/src/kit.ts`
- `trquan()`: `packages/content/src/kit.ts`
- `u_init()`: `packages/content/src/hunger.ts`, `packages/content/src/props.ts`, `packages/content/src/uenergy.ts`
- `u_init_carry_attr_boost()`: `packages/content/src/kit.ts`
- `u_init_inventory_attrs()`: `packages/content/src/kit.ts`
- `u_init_misc()`: `packages/content/src/align.ts`, `packages/content/src/kit.ts`
- `u_init_race()`: `packages/content/src/kit.ts`, `packages/content/src/kittab.ts`
- `u_init_role()`: `packages/content/src/kit.ts`, `packages/content/src/kittab.ts`

## src/uhitm.c

- (file): `packages/content/src/adtyping.ts`, `packages/content/src/dog.en.ts`, `packages/content/src/egg.en.ts`, `packages/content/src/messages.en.ts`, `packages/content/src/mhitu.ts`, `packages/content/src/mimic.ts`, `packages/content/src/minion.en.ts`, `packages/content/src/resist.en.ts`
- `attack_checks()`: `packages/content/src/actions.ts`, `packages/content/src/hide.en.ts`, `packages/content/src/kick.en.ts`, `packages/content/src/mimic.ts`, `packages/content/src/peaceful.ts`
- `backstabbable()`: `packages/content/src/combat.ts`
- `check_caitiff()`: `packages/content/src/combat.ts`
- `damageum()`: `packages/content/src/hmonas.ts`, `packages/content/src/uhitm.en.ts`
- `demonpet()`: `packages/content/src/hmonas.ts`
- `do_attack()`: `packages/content/src/actions.ts`, `packages/content/src/combat.ts`
- `do_stone_mon()`: `packages/content/src/adtyping.ts`
- `do_stone_u()`: `packages/content/src/stoning.ts`
- `double_punch()`: `packages/content/src/combat.ts`
- `erode_armor()`: `packages/content/src/erode.ts`
- `explum()`: `packages/content/src/hmonas.ts`, `packages/content/src/uhitm.en.ts`
- `find_roll_to_hit()`: `packages/content/src/combat.ts`
- `flash_hits_mon()`: `packages/content/src/zap.ts`
- `gulpum()`: `packages/content/src/hmonas.ts`, `packages/content/src/uhitm.en.ts`
- `hitum()`: `packages/content/src/combat.ts`
- `hitum_cleave()`: `packages/content/src/combat.ts`
- `hmon()`: `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon()`: `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon_()`: `packages/content/src/combat.ts`
- `hmon_hitmon_barehands()`: `packages/content/src/combat.ts`
- `hmon_hitmon_dmg_recalc()`: `packages/content/src/combat.ts`, `packages/content/src/dothrow.ts`
- `hmon_hitmon_misc_obj()`: `packages/content/src/dothrow.ts`, `packages/content/src/egg.en.ts`, `packages/content/src/egghit.ts`
- `hmon_hitmon_msg_hit()`: `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon_msg_silver()`: `packages/content/src/hmon.ts`, `packages/content/src/silver.ts`, `packages/content/src/uhitm.en.ts`
- `hmon_hitmon_pet()`: `packages/content/src/combat.ts`, `packages/content/src/dog.ts`, `packages/content/src/hmon.ts`
- `hmon_hitmon_splitmon()`: `packages/content/src/combat.ts`
- `hmon_hitmon_stagger()`: `packages/content/src/combat.ts`
- `hmon_hitmon_weapon()`: `packages/content/src/combat.ts`
- `hmon_hitmon_weapon_melee()`: `packages/content/src/combat.ts`, `packages/content/src/dothrow.ts`
- `hmon_hitmon_weapon_ranged()`: `packages/content/src/combat.ts`, `packages/content/src/dothrow.ts`
- `hmonas()`: `packages/content/src/hmonas.ts`, `packages/content/src/uhitm.en.ts`
- `known_hitum()`: `packages/content/src/combat.ts`
- `m_slips_free()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/mhitm.en.ts`, `packages/content/src/resist.en.ts`
- `mhitm_ad_blnd()`: `packages/content/src/adtyping.ts`, `packages/content/src/mstate.ts`
- `mhitm_ad_dgst()`: `packages/content/src/adtyping.ts`, `packages/content/src/dog.ts`
- `mhitm_ad_drin()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_drli()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_halu()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_heal()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_legs()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_phys()`: `packages/content/src/adtyping.en.ts`, `packages/content/src/combat.ts`, `packages/content/src/silver.ts`
- `mhitm_ad_samu()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_slim()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_ssex()`: `packages/content/src/adtyping.ts`
- `mhitm_ad_ston()`: `packages/content/src/adtyping.ts`, `packages/content/src/stoning.en.ts`
- `mhitm_ad_were()`: `packages/content/src/adtyping.ts`
- `mhitm_adtyping()`: `packages/content/src/adtyping.ts`, `packages/content/src/combat.ts`, `packages/content/src/mhitu.ts`
- `mhitm_mgc_atk_negated()`: `packages/content/src/adtyping.ts`
- `mhurtle_to_doom()`: `packages/content/src/combat.ts`
- `missum()`: `packages/content/src/combat.ts`
- `nohandglow()`: `packages/content/src/combat.ts`
- `paranoid_query()`: `packages/content/src/peaceful.ts`
- `passive()`: `packages/content/src/dokick.ts`, `packages/content/src/resist.en.ts`, `packages/content/src/uhitm_passive.ts`
- `passive_obj()`: `packages/content/src/erode.ts`, `packages/content/src/uhitm_passive.ts`
- `shade_aware()`: `packages/content/src/shade.ts`
- `shade_miss()`: `packages/content/src/shade.ts`, `packages/content/src/uhitm.en.ts`
- `start_engulf()`: `packages/content/src/hmonas.ts`, `packages/content/src/uhitm.en.ts`
- `steal_it()`: `packages/content/src/hmonas.ts`, `packages/content/src/uhitm.en.ts`
- `stumble_onto_mimic()`: `packages/content/src/mimic.ts`
- `that_is_a_mimic()`: `packages/content/src/mimic.en.ts`, `packages/content/src/mimic.ts`

## src/vault.c

- `blackout()`: `packages/content/src/vault.ts`
- `clear_fcorr()`: `packages/content/src/vault.en.ts`, `packages/content/src/vault.ts`
- `find_guard_dest()`: `packages/content/src/vault.ts`
- `findgd()`: `packages/content/src/vaultstate.ts`
- `free_egd()`: `packages/content/src/vaultstate.ts`
- `gd_letknow()`: `packages/content/src/vault.ts`
- `gd_move()`: `packages/content/src/vault.en.ts`, `packages/content/src/vault.ts`, `packages/content/src/vaultstate.ts`
- `gd_move_cleanup()`: `packages/content/src/vault.ts`
- `gd_mv_monaway()`: `packages/content/src/vault.ts`
- `gd_pick_corridor_gold()`: `packages/content/src/vault.ts`
- `grddead()`: `packages/content/src/vault.ts`
- `hidden_gold()`: `packages/content/src/detectobj.ts`, `packages/content/src/shk.ts`, `packages/content/src/urexp.ts`, `packages/content/src/vault.ts`
- `in_fcorridor()`: `packages/content/src/vault.ts`
- `invault()`: `packages/content/src/vault.en.ts`, `packages/content/src/vault.ts`
- `move_gold()`: `packages/content/src/vault.ts`
- `newegd()`: `packages/content/src/vaultstate.ts`
- `parkguard()`: `packages/content/src/vault.ts`
- `paygd()`: `packages/content/src/vault.ts`
- `restfakecorr()`: `packages/content/src/vault.ts`
- `uleftvault()`: `packages/content/src/vault.ts`, `packages/content/src/vaultstate.ts`
- `vault_occupied()`: `packages/content/src/vaultstate.ts`
- `vault_summon_gd()`: `packages/content/src/vaultstate.ts`
- `wallify_vault()`: `packages/content/src/vault.ts`

## src/vision.c

- (file): `packages/content/src/mcastu.ts`, `packages/content/src/mhitu.ts`, `packages/content/src/travel.ts`, `packages/content/src/vault.ts`, `packages/content/src/watch.ts`, `packages/core/src/perception.ts`, `packages/core/src/types/mod.ts`
- `circle_data()`: `packages/content/src/read.ts`, `packages/core/src/vision.ts`
- `circle_start()`: `packages/core/src/vision.ts`
- `clear_path()`: `packages/content/src/clearpath.ts`
- `couldsee()`: `packages/content/src/apparxy.ts`
- `do_clear_area()`: `packages/content/src/read.ts`
- `does_block()`: `packages/content/src/boulder.ts`, `packages/content/src/terrain.ts`, `packages/core/src/objects.ts`, `packages/core/src/types/mod.ts`, `packages/core/src/vision.ts`
- `vision_recalc()`: `packages/content/src/perception.ts`, `packages/core/src/engine.ts`, `packages/core/src/vision.ts`

## src/weapon.c

- (file): `packages/content/src/glib.ts`, `packages/content/src/mdig.ts`, `packages/content/src/mongear.en.ts`, `packages/content/src/silver.ts`, `packages/content/src/skills.en.ts`, `packages/content/src/skills.ts`
- `P_NAME()`: `packages/content/src/skills.ts`
- `abon()`: `packages/content/src/combat.ts`
- `add_skills_to_menu()`: `packages/content/src/skills.ts`
- `add_weapon_skill()`: `packages/content/src/skills.ts`
- `barehands_or_martial()`: `packages/content/src/skills.ts`
- `can_advance()`: `packages/content/src/skills.ts`
- `could_advance()`: `packages/content/src/skills.ts`
- `dbon()`: `packages/content/src/combat.ts`
- `dmgval()`: `packages/content/src/dmgval.ts`, `packages/content/src/flooreffects.ts`, `packages/content/src/read.ts`
- `drain_weapon_skill()`: `packages/content/src/skills.ts`
- `enhance_weapon_skill()`: `packages/content/src/skills.ts`
- `finish_towel_change()`: `packages/content/src/glib.ts`
- `give_may_advance_msg()`: `packages/content/src/skills.ts`
- `hitval()`: `packages/content/src/combat.ts`
- `hwep()`: `packages/content/src/mongear.ts`
- `kebabable()`: `packages/content/src/combat.ts`
- `lose_weapon_skill()`: `packages/content/src/skills.ts`
- `mon_wield_item()`: `packages/content/src/mongear.ts`
- `peaked_skill()`: `packages/content/src/skills.ts`
- `possibly_unwield()`: `packages/content/src/were.ts`
- `pwep()`: `packages/content/src/mthrowu.ts`
- `rwep()`: `packages/content/src/mthrowu.ts`
- `select_hwep()`: `packages/content/src/mongear.ts`
- `select_rwep()`: `packages/content/src/mthrowu.ts`
- `skill_advance()`: `packages/content/src/skills.ts`
- `skill_init()`: `packages/content/src/skills.ts`
- `slots_required()`: `packages/content/src/skills.ts`
- `special_dmgval()`: `packages/content/src/combat.ts`, `packages/content/src/silver.ts`
- `unrestrict_weapon_skill()`: `packages/content/src/skills.ts`
- `use_skill()`: `packages/content/src/skills.ts`
- `weapon_dam_bonus()`: `packages/content/src/skills.ts`
- `weapon_descr()`: `packages/content/src/trap.en.ts`, `packages/content/src/web.ts`
- `weapon_hit_bonus()`: `packages/content/src/skills.ts`
- `weapon_type()`: `packages/content/src/skills.ts`
- `wet_a_towel()`: `packages/content/src/glib.ts`, `packages/content/src/towel.en.ts`

## src/were.c

- `counter_were()`: `packages/content/src/werestate.ts`
- `new_were()`: `packages/content/src/were.ts`
- `set_ulycn()`: `packages/content/src/werestate.ts`
- `were_beastie()`: `packages/content/src/werestate.ts`
- `were_change()`: `packages/content/src/were.ts`
- `were_summon()`: `packages/content/src/were.ts`
- `you_unwere()`: `packages/content/src/polyself.ts`, `packages/content/src/upoly.ts`, `packages/content/src/werestate.ts`
- `you_were()`: `packages/content/src/polyself.ts`

## src/wield.c

- (file): `packages/content/src/artiglow.ts`, `packages/content/src/itemactions.ts`, `packages/content/src/stonetouch.ts`
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
- `choose_stairs()`: `packages/content/src/covetous.ts`, `packages/content/src/ladder.ts`
- `clonewiz()`: `packages/content/src/nasty.ts`
- `cuss()`: `packages/content/src/chat.en.ts`, `packages/content/src/cuss.ts`
- `has_aggravatables()`: `packages/content/src/mcastu.ts`
- `mon_has_arti()`: `packages/content/src/covetous.ts`
- `nasties()`: `packages/content/src/nasty.ts`
- `nasty()`: `packages/content/src/nasty.ts`
- `on_ground()`: `packages/content/src/covetous.ts`
- `other_mon_has_arti()`: `packages/content/src/covetous.ts`
- `pick_nasty()`: `packages/content/src/nasty.ts`
- `random_insult()`: `packages/content/src/cuss.ts`
- `random_malediction()`: `packages/content/src/cuss.ts`
- `strategy()`: `packages/content/src/covetous.ts`
- `tactics()`: `packages/content/src/covetous.ts`
- `target_on()`: `packages/content/src/covetous.ts`
- `which_arti()`: `packages/content/src/covetous.ts`
- `wizapp()`: `packages/content/src/nasty.ts`
- `you_have()`: `packages/content/src/covetous.ts`

## src/wizcmds.c

- (file): `packages/content/src/wizard/index.ts`, `packages/content/src/wizard/wizard.en.ts`
- `wiz_genesis()`: `packages/content/src/wizard/genesis.ts`
- `wiz_identify()`: `packages/content/src/wizard/identify.ts`
- `wiz_level_change()`: `packages/content/src/wizard/levelchange.ts`
- `wiz_level_tele()`: `packages/content/src/wizard/levelport.ts`
- `wiz_map()`: `packages/content/src/wizard/map.ts`
- `wiz_polyself()`: `packages/content/src/wizard/polyself.ts`
- `wiz_where()`: `packages/content/src/wizard/where.ts`
- `wiz_wish()`: `packages/content/src/wizard/wish.ts`

## src/worm.c

- (file): `packages/content/src/wormstate.ts`
- `MAX_NUM_WORMS()`: `packages/content/src/wormstate.ts`
- `count_wsegs()`: `packages/content/src/wormstate.ts`
- `cutworm()`: `packages/content/src/combat.ts`, `packages/content/src/worm.en.ts`, `packages/content/src/wormcut.ts`
- `get_wormno()`: `packages/content/src/worm.ts`, `packages/content/src/wormstate.ts`
- `initworm()`: `packages/content/src/worm.ts`
- `place_worm_tail_randomly()`: `packages/content/src/worm.ts`
- `remove_worm()`: `packages/content/src/worm.ts`
- `shrink_worm()`: `packages/content/src/worm.ts`
- `worm_cross()`: `packages/content/src/worm.ts`
- `worm_known()`: `packages/content/src/invis.ts`
- `worm_move()`: `packages/content/src/worm.ts`
- `worm_nomove()`: `packages/content/src/worm.ts`
- `wormgone()`: `packages/content/src/wormstate.ts`
- `wormhitu()`: `packages/content/src/monmove.ts`

## src/worn.c

- (file): `packages/content/src/brains.ts`, `packages/content/src/mongear.en.ts`
- `bypass_obj()`: `packages/content/src/bypass.ts`
- `clear_bypasses()`: `packages/content/src/bypass.ts`
- `extra_pref()`: `packages/content/src/mongear.ts`
- `find_mac()`: `packages/content/src/stats.ts`
- `m_dowear()`: `packages/content/src/mongear.ts`
- `m_dowear_type()`: `packages/content/src/mongear.ts`
- `m_lose_armor()`: `packages/content/src/breakarm.ts`
- `mon_adjust_speed()`: `packages/content/src/mstate.ts`
- `mon_break_armor()`: `packages/content/src/breakarm.ts`
- `mon_set_minvis()`: `packages/content/src/invis.ts`
- `setworn()`: `packages/content/src/jewelry.ts`, `packages/content/src/props.ts`
- `update_mon_extrinsics()`: `packages/content/src/invis.ts`
- `w_blocks()`: `packages/content/src/props.ts`
- `which_armor()`: `packages/content/src/buzz.ts`, `packages/content/src/items.ts`, `packages/content/src/mongear.ts`

## src/write.c

- `cost()`: `packages/content/src/write.ts`
- `dowrite()`: `packages/content/src/write.en.ts`, `packages/content/src/write.ts`
- `new_book_description()`: `packages/content/src/write.ts`
- `write_ok()`: `packages/content/src/write.ts`

## src/zap.c

- (file): `packages/content/src/dig.ts`, `packages/content/src/zap.en.ts`
- `DMG_DESTROY_SCALE()`: `packages/content/src/erode.ts`
- `ZT_MAGIC_MISSILE()`: `packages/content/src/buzz.ts`
- `backfire()`: `packages/content/src/zap.ts`
- `bhit()`: `packages/content/src/camera.ts`, `packages/content/src/dokick.ts`, `packages/content/src/dothrow.ts`, `packages/content/src/perception.ts`, `packages/content/src/web.ts`, `packages/content/src/zap.ts`
- `bhitm()`: `packages/content/src/potionhit.ts`, `packages/content/src/zap.ts`
- `bhito()`: `packages/content/src/zap.ts`
- `bhitpile()`: `packages/content/src/zap.ts`
- `bounce_dir()`: `packages/content/src/buzz.ts`
- `boxlock_invent()`: `packages/content/src/zap.ts`
- `break_statue()`: `packages/content/src/statue.ts`
- `burn_floor_objects()`: `packages/content/src/buzz.ts`
- `cancel_item()`: `packages/content/src/dowear.ts`, `packages/content/src/zap.ts`
- `cancel_monst()`: `packages/content/src/mstate.ts`, `packages/content/src/zap.ts`
- `charged_objs()`: `packages/content/src/polyobj.ts`
- `create_polymon()`: `packages/content/src/polyobj.ts`
- `destroy_items()`: `packages/content/src/erode.ts`, `packages/content/src/explode.ts`
- `destroy_strings()`: `packages/content/src/erode.en.ts`, `packages/content/src/erode.ts`
- `destroyable()`: `packages/content/src/erode.ts`
- `disintegrate_mon()`: `packages/content/src/buzz.ts`
- `do_enlightenment_effect()`: `packages/content/src/enlightenment.ts`
- `do_osshock()`: `packages/content/src/polyobj.ts`
- `dobuzz()`: `packages/content/src/buzz.ts`, `packages/core/src/types/event.ts`
- `dozap()`: `packages/content/src/zap.ts`
- `drain_item()`: `packages/content/src/adtyping.ts`, `packages/content/src/dowear.ts`
- `exclam()`: `packages/content/src/buzz.ts`, `packages/content/src/combat.ts`, `packages/content/src/hmon.ts`, `packages/content/src/mthrowu.ts`, `packages/content/src/muse.ts`, `packages/content/src/trap.ts`, `packages/content/src/zap.ts`
- `flash_str()`: `packages/content/src/buzz.ts`
- `flashburn()`: `packages/content/src/buzz.ts`
- `fracture_rock()`: `packages/content/src/boulder.ts`
- `get_obj_location()`: `packages/content/src/chesttrap.ts`, `packages/content/src/polyobj.ts`
- `inventory_resistance_check()`: `packages/content/src/erode.ts`
- `learnwand()`: `packages/content/src/zap.ts`
- `makewish()`: `packages/content/src/wish.ts`, `packages/content/src/wizard/wish.ts`
- `maybe_destroy_item()`: `packages/content/src/erode.en.ts`, `packages/content/src/erode.ts`, `packages/content/src/potionhit.ts`
- `maybe_explode_trap()`: `packages/content/src/zap.ts`
- `melt_ice()`: `packages/content/src/ice.ts`
- `melt_ice_away()`: `packages/content/src/ice.ts`
- `mon_spell_hits_spot()`: `packages/content/src/buzz.ts`
- `obj_resists()`: `packages/content/src/material.ts`, `packages/content/src/meat.ts`, `packages/content/src/polyobj.ts`
- `obj_shudders()`: `packages/content/src/polyobj.ts`
- `obj_unpolyable()`: `packages/content/src/polyobj.ts`
- `poly_obj()`: `packages/content/src/polyobj.ts`
- `polyuse()`: `packages/content/src/polyobj.ts`
- `probe_monster()`: `packages/content/src/zap.ts`
- `release_hold()`: `packages/content/src/zap.ts`
- `resist()`: `packages/content/src/buzz.ts`
- `revive()`: `packages/content/src/mstate.ts`, `packages/content/src/revive.ts`
- `revive_egg()`: `packages/content/src/zap.ts`
- `spell_damage_bonus()`: `packages/content/src/spellcalc.ts`
- `spell_hit_bonus()`: `packages/content/src/spellcalc.ts`
- `start_melt_ice_timeout()`: `packages/content/src/icestate.ts`
- `stone_to_flesh_obj()`: `packages/content/src/stoneflesh.ts`
- `tmp_at()`: `packages/content/src/dothrow.ts`
- `u_adtyp_resistance_obj()`: `packages/content/src/erode.ts`
- `ubreatheu()`: `packages/content/src/buzz.ts`
- `ubuzz()`: `packages/content/src/zap.ts`
- `unpolyable()`: `packages/content/src/polyobj.ts`
- `unturn_dead()`: `packages/content/src/revive.ts`
- `weffects()`: `packages/content/src/cast.ts`, `packages/content/src/zap.ts`, `packages/core/src/types/mod.ts`
- `zap_hit()`: `packages/content/src/buzz.ts`
- `zap_map()`: `packages/content/src/zap.ts`
- `zap_over_floor()`: `packages/content/src/buzz.ts`, `packages/content/src/ice.ts`
- `zap_updown()`: `packages/content/src/zap.ts`
- `zapnodir()`: `packages/content/src/teleport.ts`, `packages/content/src/zap.ts`
- `zappable()`: `packages/content/src/zap.ts`
- `zapsetup()`: `packages/content/src/polyobj.ts`
- `zapwrapup()`: `packages/content/src/polyobj.ts`
- `zapyourself()`: `packages/content/src/camera.ts`, `packages/content/src/zap.ts`
- `zhitm()`: `packages/content/src/buzz.ts`
- `zhitu()`: `packages/content/src/buzz.ts`

## util/makedefs.c

- `do_rnd_access_file()`: `packages/content/src/engravetxt.ts`, `packages/content/src/epitaph.ts`
