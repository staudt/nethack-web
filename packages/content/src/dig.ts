// Digging with the wand of digging: across the level through rock, walls and doors, down (a hole
// she falls through, or a pit where the floor is hard) and up (a rock falls on her head), and the
// Watch seeing her do it in town.
// ref: src/dig.c zap_dig(), dighole(), digactualhole(), dig_check(), furniture_handled(),
// watch_dig() (in watch.ts); src/hack.c may_dig(); src/do_name.c surface(); src/dungeon.c
// Can_dig_down() (levelflags.ts)
//
// Not ported (DEVIATIONS "Digging"): pick-axes and mattocks (dig(), dig_typ()), digging an
// adjacent pit from inside a pit and conjoined pits (a lateral zap from a pit digs nothing),
// shop damage (add_damage(), pay_for_damage(), shopdig()), burying and unearthing objects,
// impact_drop() (floor objects stay when she falls), liquid flow (no pools exist, so fillholetyp()
// is always ROOM and draws nothing), a magical trap's explosion (explode() is not ported: digging
// down on a teleportation trap or level teleporter leaves it alone), drawbridges, graves, thrones,
// the air/water levels, engulfing, leashed pets, Levitation and Flying (no source yet), and pits
// or holes in doorways (core keeps traps on plain floor: "The doorway here is too hard to dig
// in.").
import {
  DIRS,
  getLevel,
  getPlayer,
  inBounds,
  inTown,
  isPlainFloor,
  isVisible,
  cellIndex,
  sortedIds,
  trapAt,
  levelIdFor,
  type Ctx,
  type Dir,
  type Entity,
  type Level,
  type Msg,
  type Trap,
} from '@nh/core';
import { ROCK, boulderAt } from './boulder';
import { eshkOf } from './eshk';
import {
  FTN_WARNED,
  breaksink,
  dogushforth,
  dryup,
  fountainBits,
  setFountainBits,
} from './fountain';
import { ustuck } from './hackmove';
import { losehp } from './hp';
import { mksobj, placeOnFloor } from './items';
import { canDigDown, cavernous, levelFlags, nonDiggable } from './levelflags';
import { migrateToLevel } from './migrate';
import { whichArmor } from './mongear';
import { wakeNearto } from './noise';
import { canSpotMon, monNam } from './perception';
import { P, hasProp } from './props';
import { ceilingKey, hardHelmet } from './read';
import { makeAngryShk } from './shk';
import { maybeFinishSokoban } from './sokoban';
import {
  T,
  isObstructedId,
  isSdoorId,
  isStwallId,
  isWallId,
  setTerrain,
  terrainIdAt,
} from './terrain';
import { TRAP, fallToLevel, isHole, isPit, maketrap, mintrap, setTrapData } from './trap';
import { setUtrap, uInPit } from './trapstate';
import { watchDig } from './watch';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

function heroPos(ctx: Ctx): { level: string; x: number; y: number } {
  const p = hero(ctx).c.pos;
  if (!p) throw new Error('The hero is nowhere');
  return p;
}

const blind = (ctx: Ctx): boolean => hasProp(hero(ctx), P.BLINDED);

const cansee = (ctx: Ctx, level: Level, x: number, y: number): boolean =>
  level.id === ctx.state.currentLevel && isVisible(ctx.state, cellIndex(level, x, y));

const isAltarId = (id: string | undefined): boolean => id?.startsWith('nh:altar_') === true;

/** The living monster at (x, y) of `level`, or null. ref: m_at() */
function monAt(ctx: Ctx, level: Level, x: number, y: number): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.monster && p?.level === level.id && p.x === x && p.y === y) return e;
  }
  return null;
}

/**
 * Stone, walls and trees inside a non-diggable area cannot be dug. ref: src/hack.c may_dig()
 */
export function mayDig(ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): boolean {
  const id = terrainIdAt(level, x, y);
  return !((isStwallId(id) || id === T.tree) && nonDiggable(ctx, level, x, y));
}

/**
 * What the hero digs into at (x, y), as a message param. ref: src/do_name.c surface() for the
 * terrain that exists here
 */
export function surfaceKey(ctx: Ctx, level: Level, x: number, y: number): string {
  const id = terrainIdAt(level, x, y);
  if (isAltarId(id)) return '@surface.altar';
  if (id === T.fountain) return '@surface.fountain';
  if (id === undefined) return '@surface.ground';
  const t = ctx.defs.terrain(id);
  if (t.stairs !== undefined) return '@surface.stairs';
  if (isWallId(id) || isSdoorId(id)) return '@surface.wall';
  if (t.door !== undefined) return '@surface.doorway';
  // IS_ROOM(): floor and furniture; corridors and rock are "ground"
  return id === T.corr || id === T.stone || id === T.scorr ? '@surface.ground' : '@surface.floor';
}

/** The trap is gone; Sokoban may be solved. ref: src/trap.c delfloortrap() */
function delfloortrap(ctx: Ctx, levelId: string, t: Trap | undefined): void {
  if (!t) return;
  ctx.removeTrap(levelId, { x: t.x, y: t.y });
  maybeFinishSokoban(ctx, levelId);
}

/**
 * Fountains and sinks take the dig themselves: a fountain gushes and dries up (warned or not),
 * a sink breaks into a fountain. True when handled. ref: src/dig.c furniture_handled()
 */
function furnitureHandled(ctx: Ctx, level: Level, x: number, y: number, byHero: boolean): boolean {
  const id = terrainIdAt(level, x, y);
  if (id === T.fountain) {
    dogushforth(ctx, false);
    setFountainBits(ctx, level.id, x, y, fountainBits(ctx.state, level.id, x, y) | FTN_WARNED);
    dryup(ctx, x, y, byHero);
    return true;
  }
  if (id === T.sink) {
    breaksink(ctx, x, y);
    return true;
  }
  return false;
}

/** ref: grounded(): neither flying, floating nor clinging (every level has a ceiling here) */
const grounded = (ctx: Ctx, mon: Entity): boolean => {
  const f = ctx.defs.monster(mon.def).flags;
  return !f.includes('fly') && !f.includes('float') && !f.includes('cling');
};

/**
 * A pit or hole appears at (x, y) of the hero's level, dug by the hero (`byHero`: she is
 * blamed, the trap is hers, `madeby_u`) or by nobody in particular. A pit holds her `rn1(4, 2)`
 * turns or traps the monster there; through a hole she falls to the next level, and a monster
 * there drops to it. ref: src/dig.c digactualhole() (BY_YOU, or BY_OBJECT without the blame)
 */
export function digactualhole(
  ctx: Ctx,
  x: number,
  y: number,
  byHero: boolean,
  kind: 'pit' | 'hole',
): void {
  const level = getLevel(ctx.state);
  const hp = heroPos(ctx);
  const atU = hp.x === x && hp.y === y;
  const mon = atU ? null : monAt(ctx, level, x, y);
  if (furnitureHandled(ctx, level, x, y, byHero)) return;
  // ref: "digactualhole: can't dig %s on this level."
  if (kind === 'hole' && !canDigDown(ctx, level)) kind = 'pit';
  if (!isPlainFloor(ctx.defs, level, x, y)) return; // maketrap() refuses (stairs; doorways here)
  const oldId = terrainIdAt(level, x, y);
  const surface = surfaceKey(ctx, level, x, y);
  const t = maketrap(ctx, level.id, x, y, kind === 'pit' ? TRAP.pit : TRAP.hole);
  if (byHero) setTrapData(t, { madeby_u: true });
  // tseen = 0, then seetrap() if seen or feeltrap() when she dug it
  t.seen = byHero || cansee(ctx, level, x, y);
  const trap = `@${t.def}`;
  if (byHero) {
    if (!atU) say(ctx, 'dig.dig_adjacent', { trap });
    else say(ctx, kind === 'hole' ? 'dig.dig_hole' : 'dig.dig_pit', { surface });
  } else if (cansee(ctx, level, x, y)) {
    say(ctx, isStwallId(oldId) ? 'dig.crumbles' : 'dig.appears', { surface, trap });
  }
  if (kind === 'pit') {
    if (byHero) wakeNearto(ctx, hp.x, hp.y, (hero(ctx).c.experience?.level ?? 1) * 20); // wake_nearby()
    if (atU) {
      setUtrap(ctx, ctx.rng.rn2(4) + 2, 'pit'); // rn1(4, 2)
    } else if (mon) {
      const f = ctx.defs.monster(mon.def).flags;
      if (f.includes('fly') || f.includes('float')) {
        if (canSpotMon(ctx, mon))
          say(ctx, f.includes('fly') ? 'dig.mon_flies_over' : 'dig.mon_floats_over', {
            mon: monNam(ctx, mon),
          });
      } else mintrap(ctx, mon.id);
    }
    return;
  }
  if (atU) {
    // a hero held by a monster does not fall
    if (ustuck(ctx) !== null) return;
    say(ctx, 'dig.fall_through');
    // "Earlier checks must ensure that the destination level exists and is in the present
    // dungeon": the next level, not the hole's own destination
    fallToLevel(ctx, level, level.dlevel + 1);
    return;
  }
  if (!mon) return;
  const size = ctx.defs.monster(mon.def).size;
  if (!grounded(ctx, mon) || size === 'huge' || size === 'gigantic') return;
  if (ustuck(ctx) === mon.id) return; // probably a vortex
  if (!canDigDown(ctx, level)) {
    // Is_botlevel()
    if (canSpotMon(ctx, mon)) say(ctx, 'dig.mon_avoids', { mon: monNam(ctx, mon) });
    return;
  }
  if (eshkOf(ctx, mon.id)) makeAngryShk(ctx, mon.id);
  migrateToLevel(
    ctx,
    mon,
    levelIdFor(ctx.state, { dungeon: level.dungeon, dlevel: level.dlevel + 1 }),
  );
}

/**
 * Digging down at (x, y) (default: under the hero). Refused on undiggable ground ("The floor
 * here is too hard to dig in."), on an altar or (here) a doorway; a boulder there falls in;
 * otherwise a pit where the floor cannot be dug through (a hard floor, the bottom of a dungeon,
 * `pitOnly`, an existing other trap there), else a hole. True if something was dug.
 * ref: src/dig.c dighole(), dig_check() (BY_YOU)
 */
export function dighole(
  ctx: Ctx,
  pitOnly: boolean,
  byMagic: boolean,
  at?: { x: number; y: number },
): boolean {
  const level = getLevel(ctx.state);
  const hp = heroPos(ctx);
  const { x, y } = at ?? hp;
  if (!inBounds(level, x, y)) return false;
  const here = x === hp.x && y === hp.y;
  const ttmp = trapAt(level, x, y);
  const id = terrainIdAt(level, x, y);
  const stairs = id !== undefined && ctx.defs.terrain(id).stairs !== undefined;
  const tooHard = isObstructedId(id) && !isSdoorId(id) && nonDiggable(ctx, level, x, y);
  // dig_check(BY_YOU, x, y): which of its results dighole() looks at
  let check: 'stairs' | 'altar' | 'toohard' | 'cantdig' | 'destroytrap' | 'pitonly' | 'ok' = 'ok';
  if (stairs) check = 'stairs';
  else if (isAltarId(id)) check = 'altar';
  else if (tooHard) check = 'toohard';
  else if (!canDigDown(ctx, level))
    check = ttmp ? (isHole(ttmp.def) || isPit(ttmp.def) ? 'cantdig' : 'destroytrap') : 'pitonly';
  const nohole = check === 'cantdig' || check === 'toohard';
  const surface = surfaceKey(ctx, level, x, y);
  if ((ttmp && nohole) || tooHard) {
    say(ctx, here ? 'dig.too_hard_here' : 'dig.too_hard_there', { surface });
    return false;
  }
  if (ttmp && (ttmp.def === TRAP.tele || ttmp.def === TRAP.levelTele)) {
    // is_magical_trap(): C explodes it (explode() is not ported) and deletes it; it stays
    return false;
  }
  const boulder = boulderAt(ctx, level.id, x, y);
  if (boulder) {
    if (ttmp && isPit(ttmp.def) && ctx.rng.rn2(2)) {
      say(ctx, here ? 'dig.boulder_settles' : 'dig.boulder_settles_adjacent');
      ttmp.def = TRAP.pit; // crush spikes
    } else {
      say(ctx, 'dig.kadoom');
      wakeNearto(ctx, hp.x, hp.y, (hero(ctx).c.experience?.level ?? 1) * 20); // wake_nearby()
      delfloortrap(ctx, level.id, ttmp);
    }
    ctx.remove(boulder.id); // delobj()
    return false;
  }
  if (isAltarId(id)) {
    say(ctx, 'dig.altar_too_hard');
    return false;
  }
  if (id !== T.fountain && id !== T.sink && !isPlainFloor(ctx.defs, level, x, y)) {
    // a doorway (core keeps traps on plain floor) or the stairs
    say(ctx, here ? 'dig.too_hard_here' : 'dig.too_hard_there', { surface });
    return false;
  }
  // fillholetyp() is ROOM: no pools, moats or lava exist
  // magical digging disarms settable traps (the bear trap would be buried)
  if (byMagic && ttmp && ttmp.def === TRAP.bear) delfloortrap(ctx, level.id, ttmp);
  const pit = nohole || pitOnly || check === 'destroytrap' || check === 'pitonly';
  digactualhole(ctx, x, y, true, pit ? 'pit' : 'hole');
  return true;
}

/**
 * A rock loosened from the ceiling falls on her head: `rnd(2)` with a hard helmet, else `rnd(6)`,
 * and lands at her feet. ref: src/dig.c zap_dig() (u.dz < 0 or on stairs); src/zap.c
 * zap_updown() (striking up)
 */
export function rockOnHead(ctx: Ctx, level: Level, x: number, y: number): void {
  const helm = whichArmor(ctx, ctx.state.playerId, 'helm');
  const dmg = ctx.rng.rnd(helm && hardHelmet(ctx.defs.object(helm.def)) ? 2 : 6);
  losehp(ctx, dmg, '@killer.trap.falling_rock');
  if (ctx.state.gameOver) return;
  const rock = mksobj(ctx, ctx.defs.object(ROCK), { init: false });
  placeOnFloor(ctx, rock, level.id, x, y); // stackobj()
}

/**
 * The wand (or spell) of digging zapped in `dir`. Up, or down on stairs: a rock falls on her
 * head. Down: the Watch may see, then dighole(). Across: `rn1(18, 8)` squares, razing doors
 * (closed and secret ones become empty doorways), turning room walls into doorways (corridor on
 * cavernous levels outside town) and rock into corridor, trees into floor; on a maze level the
 * first wall or rock is dug to floor or corridor, or "glows then fades" when undiggable, and the
 * beam stops there; elsewhere an undiggable square just stops it. Boulders and monsters are not
 * touched. ref: src/dig.c zap_dig()
 */
export function zapDig(ctx: Ctx, dir: Dir | 'up' | 'down'): void {
  const level = getLevel(ctx.state);
  const hp = heroPos(ctx);
  if (dir === 'up' || dir === 'down') {
    const hereId = terrainIdAt(level, hp.x, hp.y);
    const onStairs = hereId !== undefined && ctx.defs.terrain(hereId).stairs !== undefined;
    if (dir === 'up' || onStairs) {
      const ceiling = { key: ceilingKey(ctx, level, hp.x, hp.y) };
      if (onStairs) say(ctx, 'dig.bounce_stairs', { ceiling });
      say(ctx, 'dig.loosen_rock', { ceiling });
      say(ctx, 'dig.falls_on_head');
      rockOnHead(ctx, level, hp.x, hp.y);
    } else {
      watchDig(ctx, hp.x, hp.y);
      dighole(ctx, false, true);
    }
    return;
  }
  // from a pit: C digs one adjacent pit (conjoined pits); not ported, nothing is dug
  const pitHere = trapAt(level, hp.x, hp.y);
  if (uInPit(ctx) && pitHere && isPit(pitHere.def)) return;
  const maze = levelFlags(ctx, level).maze === true;
  const d = DIRS[dir];
  let zx = hp.x + d.x;
  let zy = hp.y + d.y;
  let digdepth = ctx.rng.rn2(18) + 8; // rn1(18, 8)
  while (--digdepth >= 0) {
    if (!inBounds(level, zx, zy)) break;
    const id = terrainIdAt(level, zx, zy);
    const door = id === undefined ? undefined : ctx.defs.terrain(id).door;
    if (door === 'closed' || door === 'locked' || isSdoorId(id)) {
      // shop doors: no add_damage()
      if (!isSdoorId(id) && cansee(ctx, level, zx, zy)) say(ctx, 'dig.door_razed');
      watchDig(ctx, zx, zy);
      setTerrain(level, zx, zy, T.doorway); // D_NODOOR
      digdepth -= 2;
      if (maze) break;
    } else if (maze) {
      if (isWallId(id)) {
        if (!nonDiggable(ctx, level, zx, zy)) setTerrain(level, zx, zy, T.floor);
        else if (!blind(ctx)) say(ctx, 'dig.wall_glows');
        break;
      } else if (id === T.tree) {
        if (!nonDiggable(ctx, level, zx, zy)) setTerrain(level, zx, zy, T.floor);
        else if (!blind(ctx)) say(ctx, 'dig.tree_shudders');
        break;
      } else if (id === T.stone || id === T.scorr) {
        if (!nonDiggable(ctx, level, zx, zy)) setTerrain(level, zx, zy, T.corr);
        else if (!blind(ctx)) say(ctx, 'dig.rock_glows');
        break;
      }
    } else if (isObstructedId(id)) {
      if (!mayDig(ctx, level, zx, zy)) break;
      if (isWallId(id)) {
        // shop walls: no add_damage()
        watchDig(ctx, zx, zy);
        setTerrain(
          level,
          zx,
          zy,
          cavernous(ctx, level) && !inTown(level, zx, zy) ? T.corr : T.doorway,
        );
        digdepth -= 2;
      } else if (id === T.tree) {
        setTerrain(level, zx, zy, T.floor);
        digdepth -= 2;
      } else {
        // stone or a secret corridor
        setTerrain(level, zx, zy, T.corr);
        digdepth--;
      }
    }
    zx += d.x;
    zy += d.y;
  }
}
