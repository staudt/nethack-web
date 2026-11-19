// The drum of earthquake: chasms (pits) open around the hero, fountains, altars, graves and
// thrones fall into them, secret corridors and doors are revealed, doors collapse, monsters and
// the hero fall in. ref: src/music.c do_earthquake(), do_pit(), generic_lvl_desc()
//
// Not ported (see DEVIATIONS.md "Instruments"): a pit in a doorway (core keeps traps off doors:
// the doorless doorway stays pitless), the buried ball's chain, selftouch() and mselftouch() (no
// cockatrice corpse is touched by falling), exercise, Half_physical_damage, sinks and the high
// altars (none exist), the Astral and endgame planes and Vlad's Tower in the level's description.
import { isHighAltar } from './highaltar';
import {
  getLevel,
  getPlayer,
  inBounds,
  type Ctx,
  rnl,
  type Entity,
  type Level,
  type Msg,
} from '@nh/core';
import { alignStr } from './align';
import { altarAlign } from './aligntyp';
import { boulderAt } from './boulder';
import { setDoorTrapped } from './btrapstate';
import { inAnyShop } from './eshk';
import { flooreffects } from './flooreffects';
import { setFountainBits } from './fountain';
import { experienceFor, gainExperience } from './hero';
import { ceilingHider, isUndetected, setUndetected } from './hidestate';
import { losehp } from './hp';
import { undestroyableTrap } from './invocation';
import { placeObject } from './items';
import { fillholetyp, liquidFlow } from './liquidflow';
import { luckOf } from './luck';
import { humanoid, isClinger, isFlyer } from './mondata';
import { monsterDied } from './mondeath';
import { wakeup } from './peaceful';
import { monNam } from './perception';
import { P, hasProp } from './props';
import { desecrateAltar } from './pray';
import { addDamage } from './shopdamage';
import { cvtSdoorToDoor, inVladsTower, isSanctum } from './levelflags';
import { isSokoban } from './sokoban';
import { T, setTerrain, terrainIdAt } from './terrain';
import { setThroneLooted } from './thronestate';
import { TRAP, cansee, isPit, maketrap } from './trap';
import { isMtrapped, setMtrapped, setUtrap, uInAir, utrap } from './trapstate';
import { heroForm } from './upoly';
import { mAt } from './wormstate';
import { roleIs } from './urole';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * What the shaking level is called: "sanctum", "puzzle" (Sokoban), "tower" (Vlad's), else
 * "dungeon". ref: src/music.c generic_lvl_desc() (no Astral or endgame here)
 */
export function genericLvlDesc(ctx: Ctx): string {
  const level = getLevel(ctx.state);
  if (isSanctum(ctx.state, level)) return '@music.lvl.sanctum';
  if (isSokoban(level)) return '@music.lvl.puzzle';
  if (inVladsTower(ctx.state, level)) return '@music.lvl.tower';
  return '@music.lvl.dungeon';
}

/**
 * The hero kills the monster without a "You kill" line: experience and its things.
 * ref: src/mon.c xkilled(mon, XKILL_NOMSG)
 */
function xkilledNoMsg(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  const level = mon.c.monster?.level ?? 0;
  monsterDied(ctx, mon.id, true);
  if (ctx.state.entities[String(mon.id)]?.c.monster) return; // life-saved
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/** Where C's maketrap() would leave room floor (IS_ROOM furniture becomes ROOM). */
function clearFurniture(ctx: Ctx, level: Level, x: number, y: number): void {
  const id = terrainIdAt(level, x, y);
  if (id === T.fountain) setFountainBits(ctx, level.id, x, y, 0);
  if (id === T.throne) setThroneLooted(ctx, level.id, x, y, false); // lev->flags = 0
  if (
    id === T.fountain ||
    id === T.throne ||
    id === T.grave ||
    id === T.sink ||
    (id !== undefined && altarAlign(id) !== null)
  )
    setTerrain(level, x, y, T.floor);
  else if (id === T.scorr) setTerrain(level, x, y, T.corr);
}

/**
 * A chasm (a seen pit) opens at (x, y) of the hero's level; `tuPit`: there was a pit under her
 * before the earthquake. A boulder there falls in and fills it ("KADOOM!  The boulder falls into a
 * chasm!"); liquid next to it may flow in. A monster there that neither flies nor clings is
 * trapped and hurt `rnd(6)` (`rnd(4)` when it already was), dying of it by her hand; the hero is
 * trapped `rn1(6, 2)` turns and hurt `rnd(6)`, or, already in the pit, jostled (`rnd(2)` keeping
 * her footing, else `rnd(4)`); flying, floating or clinging she stays above it.
 * ref: src/music.c do_pit()
 */
export function doPit(ctx: Ctx, x: number, y: number, tuPit: boolean): void {
  const level = getLevel(ctx.state);
  const old = level.traps.find((t) => t.x === x && t.y === y);
  if (old && undestroyableTrap(old.def)) return; // no pit if portal at that location
  clearFurniture(ctx, level, x, y);
  const chasm0 = maketrap(ctx, level.id, x, y, TRAP.pit);
  chasm0.seen = true;
  const hp = getPlayer(ctx.state).c.pos;
  const uAt = hp?.x === x && hp.y === y;
  let mtmp = uAt ? null : mAt(ctx.state, level.id, x, y);
  const boulder = boulderAt(ctx, level.id, x, y);
  if (boulder) {
    if (cansee(ctx, level.id, x, y)) say(ctx, uAt ? 'music.kadoom_below_you' : 'music.kadoom');
    if (mtmp) setMtrapped(ctx, mtmp.id, false);
    delete boulder.c.pos; // obj_extract_self()
    if (!flooreffects(ctx, boulder, x, y, '')) placeObject(ctx, boulder.id, level.id, x, y);
    return;
  }
  // let liquid flow into the newly created chasm
  const filltype = fillholetyp(ctx, level, x, y, false);
  if (filltype !== null) {
    liquidFlow(ctx, level, x, y, filltype, null);
    // liquid_flow() deletes the trap, might kill mtmp
    if (!level.traps.some((t) => t.x === x && t.y === y)) return;
  }
  if (mtmp && !ctx.state.entities[String(mtmp.id)]?.c.monster) mtmp = null;
  if (mtmp) {
    const def = ctx.defs.monster(mtmp.def);
    if (!isFlyer(def) && !isClinger(def)) {
      const already = isMtrapped(ctx, mtmp.id);
      setMtrapped(ctx, mtmp.id, true);
      if (!already) {
        // suppress messages
        if (cansee(ctx, level.id, x, y))
          say(ctx, 'music.mon_falls_chasm', { mon: monNam(ctx, mtmp) });
        else if (humanoid(def)) say(ctx, 'music.hear_scream');
      }
      // (mselftouch(): no corpses are wielded by falling monsters here)
      const mhp = mtmp.c.hp;
      if (mhp) {
        mhp.cur -= ctx.rng.rnd(already ? 4 : 6);
        if (mhp.cur < 1) {
          if (!cansee(ctx, level.id, x, y)) say(ctx, 'music.it_destroyed');
          else
            say(ctx, mtmp.c.monster?.tame ? 'music.destroy_poor' : 'combat.you_destroy', {
              mon: monNam(ctx, mtmp),
            });
          xkilledNoMsg(ctx, mtmp);
        }
      }
    }
    return;
  }
  if (!uAt) return;
  // (the buried ball's chain: no punishment here)
  const form = heroForm(ctx);
  const u = utrap(ctx);
  if (uInAir(ctx) || (form !== null && isClinger(form))) {
    if (!tuPit) {
      // no pit here previously
      say(ctx, 'music.chasm_opens');
      say(ctx, 'music.dont_fall');
    }
  } else if (!tuPit || u?.type !== 'pit') {
    // no pit here previously, or you were not in it even if there was
    say(ctx, 'music.fall_chasm');
    setUtrap(ctx, ctx.rng.rn2(6) + 2, 'pit'); // rn1(6, 2)
    losehp(ctx, ctx.rng.rnd(6), '!@killer.chasm.fell');
  } else {
    const h = getPlayer(ctx.state);
    const fumbling = hasProp(h, P.FUMBLING) && ctx.rng.rn2(5) !== 0;
    // !(Fumbling && rn2(5)) && (!rnl(Archeologist ? 3 : 9) || (Dex > 7 && rn2(5)))
    const keepfooting =
      !fumbling &&
      (!rnl(ctx.rng, roleIs(ctx.state, 'archeologist') ? 3 : 9, luckOf(ctx.state)) ||
        ((h.c.attributes?.dex ?? 10) > 7 && ctx.rng.rn2(5) !== 0));
    say(ctx, 'music.jostled');
    setUtrap(ctx, ctx.rng.rn2(6) + 2, 'pit');
    losehp(ctx, ctx.rng.rnd(keepfooting ? 2 : 4), '!@killer.chasm.hurt');
  }
}

/** A collapsing or revealed door: its booby trap is gone with it. */
function toDoorway(ctx: Ctx, level: Level, x: number, y: number): void {
  setTerrain(level, x, y, T.doorway);
  setDoorTrapped(ctx, level.id, x, y, false);
}

const isSdoorId = (id: string | undefined): boolean =>
  id === T.sdoor_v || id === T.sdoor_h || id === T.sdoor_locked_v || id === T.sdoor_locked_h;

/**
 * An earthquake of `force` (at most 13) around the hero: every monster within `force * 2`
 * squares is woken and angered (a hider on the ceiling is shaken loose, a mimic shows itself),
 * and each square there opens into a chasm 1 time in `14 - force`: fountains, altars (their god
 * is offended: desecrate_altar()), graves and thrones fall into it, a secret corridor is revealed
 * and gets its pit, room floor and corridors get theirs; a secret door is revealed and collapses
 * like any door (a shop's door is damage to repair). ref: src/music.c do_earthquake()
 */
export function doEarthquake(ctx: Ctx, forceIn: number): void {
  const level = getLevel(ctx.state);
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return;
  const trapAtU = level.traps.find((t) => t.x === hp.x && t.y === hp.y);
  const tuPit = trapAtU !== undefined && isPit(trapAtU.def);
  const force = Math.min(forceIn, 13); // sanity precaution; maximum used is actually 10
  const startX = Math.max(hp.x - force * 2, 1);
  const startY = Math.max(hp.y - force * 2, 0);
  const endX = Math.min(hp.x + force * 2, level.width - 1);
  const endY = Math.min(hp.y + force * 2, level.height - 1);
  for (let x = startX; x <= endX; x++)
    for (let y = startY; y <= endY; y++) {
      if (!inBounds(level, x, y)) continue;
      const mtmp = hp.x === x && hp.y === y ? null : mAt(ctx.state, level.id, x, y);
      if (mtmp) {
        wakeup(ctx, mtmp.id); // peaceful monster will become hostile
        if (isUndetected(ctx, mtmp.id)) {
          setUndetected(ctx, mtmp.id, false);
          const def = ctx.defs.monster(mtmp.def);
          if (ceilingHider(def)) {
            if (cansee(ctx, level.id, x, y))
              say(ctx, 'music.shaken_loose', { mon: monNam(ctx, mtmp) });
            else if (!isFlyer(def)) say(ctx, 'music.hear_thump');
          }
        }
        // (wakeup() has shown a mimic: seemimic())
      }
      if (ctx.rng.rn2(14 - force)) continue;
      const id = terrainIdAt(level, x, y);
      const seen = (): boolean => cansee(ctx, level.id, x, y);
      if (id === T.fountain) {
        // make the fountain disappear
        if (seen()) say(ctx, 'music.falls_chasm', { what: '@music.what.fountain' });
        doPit(ctx, x, y, tuPit);
      } else if (id === T.sink) {
        if (seen()) say(ctx, 'music.falls_chasm', { what: '@music.what.sink' });
        doPit(ctx, x, y, tuPit);
      } else if (id !== undefined && altarAlign(id) !== null) {
        // always preserve the high altars
        if (isHighAltar(ctx, level, x, y)) continue;
        const algn = altarAlign(id) ?? 0;
        if (seen()) say(ctx, 'music.altar_falls', { align: alignStr(algn) });
        desecrateAltar(ctx, false, algn);
        if (ctx.state.gameOver) return;
        doPit(ctx, x, y, tuPit);
      } else if (id === T.grave) {
        if (seen()) say(ctx, 'music.headstone_topples');
        doPit(ctx, x, y, tuPit);
      } else if (id === T.throne) {
        if (seen()) say(ctx, 'music.falls_chasm', { what: '@music.what.throne' });
        doPit(ctx, x, y, tuPit);
      } else if (id === T.scorr || id === T.corr || id === T.floor) {
        if (id === T.scorr) {
          setTerrain(level, x, y, T.corr);
          if (seen()) say(ctx, 'music.secret_corridor');
        }
        doPit(ctx, x, y, tuPit);
      } else if (isSdoorId(id) || (id !== undefined && ctx.defs.terrain(id).door !== undefined)) {
        if (isSdoorId(id)) {
          setTerrain(level, x, y, cvtSdoorToDoor(level, id)); // a Rogue doorway is left as it is
          if (seen()) say(ctx, 'music.secret_door');
        }
        // make the door collapse; if already doorless, treat like room or corridor (a pit
        // can't lie in a doorway here: it stays as it is)
        if (terrainIdAt(level, x, y) === T.doorway) continue;
        toDoorway(ctx, level, x, y); // wasn't doorless, now it will be
        if (seen()) say(ctx, 'music.door_collapses');
        if (inAnyShop(level, x, y)) addDamage(ctx, x, y, 0);
      }
      if (ctx.state.gameOver) return;
    }
}
