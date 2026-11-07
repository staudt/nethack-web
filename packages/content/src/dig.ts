// Digging with the wand of digging (across the level through rock, walls and doors, down: a hole
// she falls through, or a pit where the floor is hard; up: a rock falls on her head) and with a
// pick-axe or mattock (the dig occupation, sideways or down), and the Watch seeing her do it in
// town.
// ref: src/dig.c zap_dig(), dighole(), digactualhole(), dig_check(), furniture_handled(),
// use_pick_axe(), use_pick_axe2(), dig(), dig_typ(), pick_can_reach(), digcheck_fail_message(),
// watch_dig() (in watch.ts); src/hack.c may_dig(); src/do_name.c surface(); src/dungeon.c
// Can_dig_down() (levelflags.ts)
//
// Not ported (DEVIATIONS "Digging"): axes (chopping trees), digging an adjacent pit from inside a
// pit and conjoined pits (a lateral zap or swing from a pit digs nothing), shop damage
// (add_damage(), pay_for_damage(), shopdig()), statues, Fumbling, burying and unearthing objects,
// impact_drop() (floor objects stay when she falls), liquid flow (no pools exist, so fillholetyp()
// is always ROOM and draws nothing), a magical trap's explosion (explode() is not ported: digging
// down on a teleportation trap or level teleporter leaves it alone), drawbridges, graves, thrones,
// the air/water and Earth levels, engulfing, leashed pets, Flying (no source yet), and pits
// or holes in doorways (core keeps traps on plain floor: "The doorway here is too hard to dig
// in.").
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inBounds,
  inTown,
  inventoryOf,
  isPlainFloor,
  isVisible,
  cellIndex,
  rnl,
  sortedIds,
  trapAt,
  levelIdFor,
  type ActionDef,
  type Ctx,
  type Dir,
  type Entity,
  type Level,
  type Msg,
  type ObjectDef,
  type Offer,
  type PlayerAction,
  type PromptOption,
  type Trap,
} from '@nh/core';
import { doAttack } from './actions';
import { ROCK, boulderAt, fractureRock } from './boulder';
import { abon, dbon } from './combat';
import { DIG_ID, diggingOf, setDigging, stopDigging, type Digging } from './digstate';
import { dmgvalSized } from './dmgval';
import { monsterNearby } from './eat';
import { eshkOf, inAnyShop } from './eshk';
import {
  FTN_WARNED,
  breaksink,
  dogushforth,
  dryup,
  fountainBits,
  setFountainBits,
} from './fountain';
import { confdir, uMaybeImpaired, ustuck } from './hackmove';
import { losehp } from './hp';
import { wieldTool } from './itemactions';
import { mksobj, placeOnFloor } from './items';
import { luckOf } from './luck';
import { greatestErosion } from './material';
import { xnameOf } from './objnam';
import { canDigDown, cavernous, levelFlags, nonDiggable } from './levelflags';
import { migrateToLevel } from './migrate';
import { whichArmor } from './mongear';
import { wakeNearto } from './noise';
import { canSpotMon, monNam } from './perception';
import { P, hasProp, ringBonus } from './props';
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
  surfaceKey,
  terrainIdAt,
} from './terrain';
import { TRAP, dotrap, fallToLevel, isHole, isPit, maketrap, mintrap, setTrapData } from './trap';
import { levitating, setUtrap, uInPit, utrap } from './trapstate';
import { watchDig } from './watch';

export { surfaceKey, DIG_ID };

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
      // wont_fall: a floating hero stays above the pit (reset_utrap(TRUE))
      if (!levitating(ctx))
        setUtrap(ctx, ctx.rng.rn2(4) + 2, 'pit'); // rn1(4, 2)
      else setUtrap(ctx, 0, 'pit');
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
    // a hero held by a monster, or floating (wont_fall), does not fall
    if (ustuck(ctx) !== null || levitating(ctx)) return;
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

// ---------------------------------------------------------------------------------------------
// digging with a pick-axe or mattock

/** ref: include/obj.h is_pick(): a weapon or tool of the pick-axe skill */
export const isPick = (def: ObjectDef): boolean =>
  (def.class === 'weapon' || def.class === 'tool') && def.weapon?.skill === 'pick_axe';

/** ref: include/obj.h is_axe() */
export const isAxe = (def: ObjectDef): boolean =>
  (def.class === 'weapon' || def.class === 'tool') && def.weapon?.skill === 'axe';

/** What digging into a square hits. ref: src/dig.c DIGTYP_* (no statues yet) */
export type DigTyp = 'undiggable' | 'rock' | 'boulder' | 'door' | 'tree';

/** "You start digging." ... ref: use_pick_axe2() d_action[] */
const D_ACTION: Record<DigTyp, string> = {
  undiggable: 'swinging',
  rock: 'digging',
  boulder: 'hitting_boulder',
  door: 'chopping_door',
  tree: 'cutting_tree',
};

const closedDoor = (ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): boolean => {
  const id = terrainIdAt(level, x, y);
  const door = id === undefined ? undefined : ctx.defs.terrain(id).door;
  return door === 'closed' || door === 'locked';
};

/**
 * Whether the pick reaches what lies at (x, y): from inside a pit only a two-handed pick does (or
 * the target is in a conjoined pit: none yet); otherwise a one-handed pick-axe cannot reach down
 * into a seen pit. ref: src/dig.c pick_can_reach() (the hero never flies)
 */
function pickCanReach(ctx: Ctx, pick: Entity, level: Level, x: number, y: number): boolean {
  const t = trapAt(level, x, y);
  const targetInPit = t !== null && t !== undefined && isPit(t.def) && t.seen;
  const bimanual = ctx.defs.object(pick.def).weapon?.bimanual === true;
  if (uInPit(ctx)) return targetInPit ? false : bimanual; // conjoined_pits(): none yet
  if (bimanual) return true;
  return !targetInPit;
}

/**
 * What digging into (x, y) with `pick` hits: an axe chops doors and trees; a pick reaches a
 * boulder, a closed door, rock and walls (not trees). ref: src/dig.c dig_typ() (no statues, no
 * arboreal levels)
 */
export function digTyp(ctx: Ctx, pick: Entity, level: Level, x: number, y: number): DigTyp {
  const def = ctx.defs.object(pick.def);
  if (!inBounds(level, x, y) || (!isPick(def) && !isAxe(def))) return 'undiggable';
  const id = terrainIdAt(level, x, y);
  if (isAxe(def))
    return closedDoor(ctx, level, x, y) ? 'door' : id === T.tree ? 'tree' : 'undiggable';
  if (boulderAt(ctx, level.id, x, y) && pickCanReach(ctx, pick, level, x, y)) return 'boulder';
  if (closedDoor(ctx, level, x, y)) return 'door';
  if (id === T.tree) return 'undiggable'; // pick vs tree
  return isObstructedId(id) ? 'rock' : 'undiggable';
}

/** ref: src/dig.c enum digcheck_result (no ladders, thrones, air or water levels) */
type DigCheck =
  'passed' | 'pitonly' | 'destroytrap' | 'stairs' | 'altar' | 'toohard' | 'cantdig' | 'boulder';

/** Whether she (BY_YOU) can dig down at (x, y). ref: src/dig.c dig_check() */
function digCheck(ctx: Ctx, level: Level, x: number, y: number): DigCheck {
  const ttmp = trapAt(level, x, y);
  const id = terrainIdAt(level, x, y);
  if (id !== undefined && ctx.defs.terrain(id).stairs !== undefined) return 'stairs';
  if (isAltarId(id)) return 'altar';
  if (isObstructedId(id) && !isSdoorId(id) && nonDiggable(ctx, level, x, y)) return 'toohard';
  // (no magic portals or vibrating squares: undestroyable_trap())
  if (!canDigDown(ctx, level)) {
    if (ttmp) return isHole(ttmp.def) || isPit(ttmp.def) ? 'cantdig' : 'destroytrap';
    return 'pitonly';
  }
  if (boulderAt(ctx, level.id, x, y)) return 'boulder';
  return 'passed';
}

/** ref: src/dig.c digcheck_fail_message() (a pick: "dig in") */
function digcheckFailMessage(ctx: Ctx, r: DigCheck, level: Level, x: number, y: number): void {
  if (r === 'altar') say(ctx, 'dig.altar_too_hard');
  else if (r === 'boulder') say(ctx, 'dig.no_room');
  else if (r === 'stairs') say(ctx, 'dig.stairs_too_hard');
  else if (r === 'cantdig' || r === 'toohard')
    say(ctx, 'dig.too_hard_here', { surface: surfaceKey(ctx, level, x, y) });
}
const digcheckFailed = (r: DigCheck): boolean =>
  r !== 'passed' && r !== 'pitonly' && r !== 'destroytrap';

/** The hero's wielded weapon, or null. */
const uwep = (ctx: Ctx): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null;

/** The pick she would dig with: the wielded one, else the first carried. */
export function digPick(ctx: Ctx): Entity | null {
  const w = uwep(ctx);
  if (w && isPick(ctx.defs.object(w.def))) return w;
  return (
    inventoryOf(ctx.state, ctx.state.playerId).find((o) => isPick(ctx.defs.object(o.def))) ?? null
  );
}

const wakeNearby = (ctx: Ctx): void => {
  const p = heroPos(ctx);
  wakeNearto(ctx, p.x, p.y, (hero(ctx).c.experience?.level ?? 1) * 20);
};

/**
 * One turn of digging, the occupation; false when it is over (done, refused, or the pick or
 * the hero moved). Sideways, effort over 100 breaks through: a boulder falls apart, rock becomes
 * corridor, a wall an opening (floor on maze levels, corridor on cavernous ones outside town), a
 * secret or closed door is broken; a shop's walls and door are too hard. Down: a pit after effort
 * 50, a hole through which she falls after 250 (dighole()); a bear trap holding her is hit; where
 * the floor cannot be dug through, another trap is destroyed.
 * ref: src/dig.c dig() (no Fumbling, Earth level, statues, trapped doors, shop damage; the hero
 * is never a dwarf)
 */
export function dig(ctx: Ctx): boolean {
  const d = diggingOf(ctx);
  const pick = uwep(ctx);
  const hp = heroPos(ctx);
  if (!d || !pick) return false;
  const pdef = ctx.defs.object(pick.def);
  // perhaps a nymph stole your pick-axe while you were busy digging, or you teleported away
  if (
    !isPick(pdef) ||
    d.level !== hp.level ||
    (d.down
      ? d.x !== hp.x || d.y !== hp.y
      : Math.max(Math.abs(d.x - hp.x), Math.abs(d.y - hp.y)) !== 1)
  )
    return false;
  const level = getLevel(ctx.state);
  let dcresult: DigCheck = 'passed';
  if (d.down) {
    dcresult = digCheck(ctx, level, hp.x, hp.y);
    if (digcheckFailed(dcresult)) {
      digcheckFailMessage(ctx, dcresult, level, hp.x, hp.y);
      return false;
    }
  } else {
    const id = terrainIdAt(level, d.x, d.y);
    if (isObstructedId(id) && !mayDig(ctx, level, d.x, d.y)) {
      if (id === T.tree && digTyp(ctx, pick, level, d.x, d.y) === 'tree') {
        say(ctx, 'dig.petrified_tree');
        return false;
      }
      if (digTyp(ctx, pick, level, d.x, d.y) === 'rock') {
        say(ctx, 'dig.wall_too_hard');
        return false;
      }
    }
  }
  // (Fumbling is not ported)
  const h = hero(ctx);
  const a = h.c.attributes;
  d.effort +=
    10 +
    ctx.rng.rn2(5) +
    abon(a?.str ?? 10, a?.dex ?? 10, h.c.experience?.level ?? 1) +
    (pick.c.item?.spe ?? 0) -
    greatestErosion(pick) +
    ringBonus(ctx.state, 'nh:ring_of_increase_damage');
  if (d.down) return digDown(ctx, d, pick, level, dcresult);

  if (d.effort > 100) {
    const id = terrainIdAt(level, d.x, d.y);
    const typ = digTyp(ctx, pick, level, d.x, d.y);
    const boulder = boulderAt(ctx, level.id, d.x, d.y);
    let digtxt: string;
    let params: Msg['params'] | undefined;
    if (typ === 'boulder' && boulder) {
      fractureRock(ctx, boulder, true);
      // another boulder here goes back on top of the pile
      const other = boulderAt(ctx, level.id, d.x, d.y);
      if (other?.c.item) other.c.item.placed = ctx.state.seq++;
      digtxt = 'dig.boulder_falls_apart';
    } else if (id === T.stone || id === T.scorr) {
      // (a tree needs an axe, which is not applied here)
      setTerrain(level, d.x, d.y, T.corr);
      digtxt = 'dig.cut_rock';
    } else if (isWallId(id)) {
      if (levelFlags(ctx, level).maze) setTerrain(level, d.x, d.y, T.floor);
      else if (cavernous(ctx, level) && !inTown(level, d.x, d.y))
        setTerrain(level, d.x, d.y, T.corr);
      else setTerrain(level, d.x, d.y, T.doorway); // DOOR, D_NODOOR
      digtxt = 'dig.wall_opening';
    } else if (isSdoorId(id)) {
      setTerrain(level, d.x, d.y, T.doorway); // cvt_sdoor_to_door(), D_BROKEN
      digtxt = 'dig.secret_door';
    } else if (closedDoor(ctx, level, d.x, d.y)) {
      setTerrain(level, d.x, d.y, T.doorway); // D_BROKEN
      digtxt = 'dig.door_broken';
      params = { pick: xnameOf(ctx.state, ctx.defs, pick) };
    } else return false; // statue or boulder got taken
    if (!d.quiet) say(ctx, digtxt, params);
    d.lastdigtime = ctx.state.turn;
    d.quiet = false;
    d.level = ''; // done: the next attempt starts afresh
    return false;
  }
  // not enough effort has been spent yet
  const target = digTyp(ctx, pick, level, d.x, d.y);
  const id = terrainIdAt(level, d.x, d.y);
  if (isWallId(id) || target === 'door') {
    if (inAnyShop(level, d.x, d.y)) {
      say(ctx, target === 'door' ? 'dig.shop_door_too_hard' : 'dig.shop_wall_too_hard');
      return false;
    }
  } else if (target === 'undiggable' || (target === 'rock' && !isObstructedId(id))) {
    return false; // statue or boulder got taken
  }
  if (!d.didmsg) {
    say(ctx, 'dig.hit_with_might', { target: { key: `dig.target.${target}` } });
    wakeNearby(ctx);
    d.didmsg = true;
  }
  return true;
}

/** dig()'s digging-down half, after the effort was added. */
function digDown(ctx: Ctx, d: Digging, pick: Entity, level: Level, dc: DigCheck): boolean {
  const ttmp = trapAt(level, d.x, d.y);
  if (d.effort > 250 || ttmp?.def === TRAP.hole) {
    dighole(ctx, false, false);
    setDigging(ctx, null);
    return false; // done with digging
  }
  if (d.effort <= 50 || (ttmp && (ttmp.def === TRAP.trapdoor || isPit(ttmp.def)))) return true;
  if (ttmp?.def === TRAP.bear && !utrap(ctx)) {
    // digging onto a set object trap triggers it; hero should have used #untrap first
    dotrap(ctx, ttmp, { force: true });
    setDigging(ctx, null); // restart completely from scratch if we resume digging
    return false;
  }
  if (ttmp?.def === TRAP.bear) {
    if (rnl(ctx.rng, 7, luckOf(ctx.state)) > 4) {
      let dmg =
        dmgvalSized(ctx.rng, pick, ctx.defs.object(pick.def), false) +
        dbon(hero(ctx).c.attributes?.str ?? 10);
      if (dmg < 1) dmg = 1;
      else if (whichArmor(ctx, ctx.state.playerId, 'boots')) dmg = Math.trunc((dmg + 1) / 2);
      say(ctx, 'dig.hit_foot');
      losehp(ctx, dmg, '@killer.chopping_foot');
    } else {
      say(ctx, 'dig.destroy_bear_trap', { pick: xnameOf(ctx.state, ctx.defs, pick) });
      delfloortrap(ctx, level.id, ttmp);
      setUtrap(ctx, 0, 'beartrap'); // reset_utrap()
    }
    d.effort = 0; // we haven't made any progress toward a pit yet
    return false;
  }
  if (ttmp && dc === 'destroytrap') {
    say(ctx, ttmp.seen ? 'dig.destroy_trap_seen' : 'dig.destroy_trap', {
      trap: `@${ttmp.def}`,
      pick: xnameOf(ctx.state, ctx.defs, pick),
    });
    delfloortrap(ctx, level.id, ttmp);
    d.effort = 0; // we haven't made any progress toward a pit yet
    return false;
  }
  // (an altar is refused by dig_check(): no altar_wrath() here)
  if (dighole(ctx, true, false)) d.level = ''; // make pit at <u.ux,u.uy>
  return false;
}

/** The direction prompt: the eight directions, yourself, up ('<') and down ('>'). */
const DIG_DIRECTIONS: readonly PromptOption[] = [
  ...DIR_LIST.map((x) => ({ value: x, key: `dir.${x}` })),
  { value: 'self', key: 'zap.dir.self' },
  { value: 'up', key: 'zap.dir.up' },
  { value: 'down', key: 'zap.dir.down' },
];

/** Where she digs: a direction, herself, up or down. */
export type DigDir = Dir | 'self' | 'up' | 'down';

const digDirOf = (v: unknown): DigDir | undefined =>
  v === 'self' || v === 'up' || v === 'down' ? v : DIR_LIST.find((x) => x === v);

/**
 * Applying a pick: wielding it first takes the move (the direction is asked on the next one,
 * as C queues the apply again); else "In what direction do you want to dig?".
 * ref: src/dig.c use_pick_axe() (no webs; every direction is listed)
 */
export function usePickAxe(ctx: Ctx, pick: Entity): number {
  if (uwep(ctx)?.id !== pick.id) {
    if (!wieldTool(ctx, pick, 'swing')) return 0;
    // we're now wielding it. next turn, apply to dig.
    ctx.state.occupation = {
      action: { type: 'mod', action: DIG_ID, args: { item: pick.id } },
      data: null,
    };
    return NORMAL_SPEED;
  }
  ctx.ask(
    { id: 'dig-direction', kind: 'direction', key: 'dig.direction', options: [...DIG_DIRECTIONS] },
    DIG_ID,
    { item: pick.id },
  );
  return 0;
}

/**
 * The pick swung toward `dir`: up (no leverage while floating, else the ceiling is out of reach),
 * at herself (`rnd(2) + dbon() + spe`), at a monster (do_attack()), sideways (the dig starts or
 * continues if diggable, else what it hit) or down (a seen pit she stands at the edge of first
 * takes her in; floating, the floor is out of reach). ref: src/dig.c use_pick_axe2() after
 * getdir() (no engulfing, water, webs, iron bars' "Clang!" is kept; conjoined pits come later)
 */
export function usePickAxe2(ctx: Ctx, pick: Entity, dir: DigDir): number {
  const level = getLevel(ctx.state);
  const hp = heroPos(ctx);
  if (dir === 'up') {
    if (levitating(ctx)) say(ctx, 'dig.no_leverage');
    else
      say(ctx, 'dig.cant_reach_ceiling', { ceiling: { key: ceilingKey(ctx, level, hp.x, hp.y) } });
    return NORMAL_SPEED;
  }
  if (dir === 'self') {
    let dam = ctx.rng.rnd(2) + dbon(hero(ctx).c.attributes?.str ?? 10) + (pick.c.item?.spe ?? 0);
    if (dam <= 0) dam = 1;
    say(ctx, 'dig.hit_yourself', { pick: xnameOf(ctx.state, ctx.defs, pick) });
    losehp(ctx, dam, pick.def === 'nh:pick_axe' ? '@killer.own_pick_axe' : '@killer.own_mattock');
    return NORMAL_SPEED;
  }
  if (dir !== 'down') {
    const flat = uMaybeImpaired(ctx) ? confdir(ctx) : dir; // confdir(FALSE)
    const rx = hp.x + DIRS[flat].x;
    const ry = hp.y + DIRS[flat].y;
    if (!inBounds(level, rx, ry)) {
      say(ctx, 'dig.clash');
      return NORMAL_SPEED;
    }
    const mon = monAt(ctx, level, rx, ry);
    if (mon) {
      const cost = doAttack(ctx, mon, 'nh:move');
      if (cost !== null) return cost;
    }
    const target = digTyp(ctx, pick, level, rx, ry);
    if (target === 'undiggable') {
      const id = terrainIdAt(level, rx, ry);
      const trapHere = trapAt(level, hp.x, hp.y);
      if (id === T.iron_bars) {
        say(ctx, 'dig.clang');
        wakeNearby(ctx);
      } else if (id === T.tree) say(ctx, 'dig.need_axe');
      else if (boulderAt(ctx, level.id, rx, ry)) say(ctx, 'dig.cant_reach_boulder');
      else if (uInPit(ctx) && trapHere) {
        // (clearing debris between two pits: conjoined pits come later)
        say(ctx, 'dig.rubble', { pick: xnameOf(ctx.state, ctx.defs, pick) });
      } else say(ctx, 'dig.thin_air', { pick: xnameOf(ctx.state, ctx.defs, pick) });
      return NORMAL_SPEED;
    }
    const d = diggingOf(ctx);
    const act = { key: `dig.act.${D_ACTION[target]}` };
    if (!d || d.x !== rx || d.y !== ry || d.level !== level.id || d.down) {
      setDigging(ctx, {
        level: level.id,
        x: rx,
        y: ry,
        down: false,
        effort: 0,
        warned: false,
        quiet: false,
        lastdigtime: d?.lastdigtime ?? 0,
        didmsg: false,
      });
      say(ctx, 'dig.start', { act });
    } else {
      d.quiet = false;
      d.didmsg = false;
      say(ctx, 'dig.continue', { act });
    }
    ctx.state.occupation = { action: { type: 'mod', action: DIG_ID }, data: null };
    return NORMAL_SPEED;
  }
  // down
  const surface = surfaceKey(ctx, level, hp.x, hp.y);
  if (levitating(ctx)) {
    say(ctx, 'lev.cant_reach_floor', { surface });
    return NORMAL_SPEED;
  }
  const trap = trapAt(level, hp.x, hp.y);
  if (trap && isPit(trap.def) && trap.seen && !uInPit(ctx)) {
    // uteetering_at_seen_pit(): FORCEBUNGLE takes her in
    dotrap(ctx, trap, { force: true });
    // might escape trap and still be teetering at brink
    if (!utrap(ctx)) say(ctx, 'pickup.cant_reach_pit');
    return NORMAL_SPEED;
  }
  const d = diggingOf(ctx);
  if (!d || d.x !== hp.x || d.y !== hp.y || d.level !== level.id || !d.down) {
    setDigging(ctx, {
      level: level.id,
      x: hp.x,
      y: hp.y,
      down: true,
      effort: 0,
      warned: false,
      quiet: false,
      lastdigtime: d?.lastdigtime ?? 0,
      didmsg: false,
    });
    say(ctx, 'dig.start_down');
    // (in a shop: shopdig(0) and add_damage() come with shop damage)
  } else {
    d.didmsg = false;
    say(ctx, 'dig.continue_down');
  }
  ctx.state.occupation = { action: { type: 'mod', action: DIG_ID }, data: null };
  return NORMAL_SPEED;
}

/** The hero's item with this id, or null. */
function heroItem(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

/**
 * The direction answer (getdir() randomises a flat one, or herself, when she is impaired) and the
 * swing. ref: src/cmd.c getdir() confdir(FALSE), then use_pick_axe2()
 */
function swing(ctx: Ctx, pick: Entity, dir: DigDir): number {
  let to = dir;
  if (to !== 'up' && to !== 'down' && uMaybeImpaired(ctx)) to = confdir(ctx);
  return usePickAxe2(ctx, pick, to);
}

/** The pick to dig with from an action's args: carried and a pick. */
function pickArg(ctx: Ctx, args: unknown): Entity | null {
  const pick = heroItem(ctx, (args as { item?: unknown } | undefined)?.item);
  return pick && isPick(ctx.defs.object(pick.def)) ? pick : null;
}

/**
 * Digging without the apply menu: "Dig" on an adjacent square the pick would dig into and "Dig
 * down" on herself while she carries a pick-axe or mattock (the wielded one first); they wield it
 * first if needed, as applying does. With no args the action is the occupation's next turn.
 */
const digAction: ActionDef = {
  id: DIG_ID,
  labelKey: 'action.nh:dig',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    const pick = digPick(ctx);
    if (!pick) return [];
    const p = heroPos(ctx);
    if (target.kind === 'self') {
      if (levitating(ctx)) return [];
      return [
        {
          action: { type: 'mod', action: DIG_ID, args: { item: pick.id, dir: 'down' } },
          labelKey: 'action.nh:dig_down',
        },
      ];
    }
    if (target.kind !== 'cell') return [];
    const dir = DIR_LIST.find(
      (x) => DIRS[x].x === target.pos.x - p.x && DIRS[x].y === target.pos.y - p.y,
    );
    if (!dir) return [];
    if (digTyp(ctx, pick, getLevel(ctx.state), target.pos.x, target.pos.y) === 'undiggable')
      return [];
    return [
      {
        action: { type: 'mod', action: DIG_ID, args: { item: pick.id, dir } },
        labelKey: 'action.nh:dig',
      },
    ];
  },
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    if (action.args === undefined) {
      // the occupation: one more turn of digging
      if (!diggingOf(ctx)) {
        ctx.state.occupation = null;
        return 0;
      }
      if (!dig(ctx)) ctx.state.occupation = null;
      return NORMAL_SPEED;
    }
    ctx.state.occupation = null;
    const pick = pickArg(ctx, action.args);
    if (!pick) return 0;
    const dir = digDirOf((action.args as { dir?: unknown }).dir);
    if (dir === undefined) return usePickAxe(ctx, pick); // after wielding it: ask
    if (uwep(ctx)?.id !== pick.id) {
      if (!wieldTool(ctx, pick, 'swing')) return 0;
      // the swing comes on the next move
      ctx.state.occupation = {
        action: JSON.parse(JSON.stringify(action)) as PlayerAction,
        data: null,
      };
      return NORMAL_SPEED;
    }
    return swing(ctx, pick, dir);
  },
  answer(ctx, value, data) {
    const pick = pickArg(ctx, data);
    const dir = digDirOf(value);
    if (!pick || dir === undefined || uwep(ctx)?.id !== pick.id) return 0;
    return swing(ctx, pick, dir);
  },
  continues: (ctx) => continuesDigging(ctx),
};

/**
 * Whether the occupation goes on: a swing waiting for the pick to be wielded, or a dig in
 * progress with no hostile monster next to her (which stops it: "You stop digging.").
 * ref: src/allmain.c moveloop_core() `if (go.occupation && monster_nearby()) stop_occupation()`
 */
function continuesDigging(ctx: Ctx): boolean {
  const occ = ctx.state.occupation?.action;
  if (occ?.type !== 'mod' || occ.action !== DIG_ID) return false;
  if (occ.args !== undefined) return true;
  if (!diggingOf(ctx)) return false;
  if (monsterNearby(ctx)) {
    stopDigging(ctx);
    return false;
  }
  return true;
}

export const DIG_ACTIONS: readonly ActionDef[] = [digAction];
