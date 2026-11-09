// Stone to flesh on objects: boulders become enormous meatballs, statues come to life (or turn
// into meatballs when their monster is not made of flesh), stone rings into meat rings, the marble
// wand into a meat stick, rocks and gems into meatballs. Sits under zap.ts.
// ref: src/zap.c stone_to_flesh_obj()
//
// Not ported: the Heart of Ahriman (no artifacts: every object
// resists 2 times in 100), saved monster traits, vegetarian conduct (the smell is always "the odor
// of meat": DEVIATIONS.md "Stone to flesh").
import {
  cellIndex,
  contents,
  getPlayer,
  isVisible,
  type Ctx,
  type DefId,
  type Entity,
  type LevelId,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { BOULDER } from './boulder';
import { placeObject } from './items';
import { costlySpot } from './eshk';
import { FIGURINE, stopFigTransform } from './figurinestate';
import { makemon } from './generation';
import { useup } from './magic';
import { shopAt } from './revive';
import { stolenValue } from './shk';
import { vegetarian } from './mondata';
import { isGolem } from './golem';
import { objLocation, polyObj } from './polyobj';
import { animateStatue } from './statue';
import { STATUE } from './statuestate';

/** ref: include/objects.h MEATBALL, MEAT_STICK, ENORMOUS_MEATBALL, MEAT_RING */
export const MEAT = {
  meatball: 'nh:meatball',
  stick: 'nh:meat_stick',
  enormous: 'nh:enormous_meatball',
  ring: 'nh:meat_ring',
} as const;

const CORPSE: DefId = 'nh:corpse';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const FLESH_GOLEM: DefId = 'nh:flesh_golem';

/**
 * A figurine hit by stone to flesh becomes its monster (makemon(NO_MINVENT | MM_NOMSG) where it
 * lies: next to her when she carries it, none when another monster stands on it); a shop's
 * figurine is paid for as stolen; "The figurine (turns to flesh and) animates!" when seen.
 * ref: src/zap.c stone_to_flesh_obj() FIGURINE
 */
function animateFigurine(
  ctx: Ctx,
  obj: Entity,
  ptr: MonsterDef,
  at: { level: LevelId; x: number; y: number },
  golemXform: boolean,
): Entity | null {
  const hp = getPlayer(ctx.state).c.pos;
  const byyou = hp?.level === at.level && hp.x === at.x && hp.y === at.y;
  const mid = makemon(
    ctx,
    ptr,
    { x: at.x, y: at.y },
    { level: at.level, adjacentOk: byyou, noInventory: true },
  );
  const mon = mid === null ? null : (ctx.state.entities[String(mid)] ?? null);
  if (!mon?.c.pos) return null;
  const it = obj.c.item;
  const carried = it?.carriedBy === ctx.state.playerId;
  if (
    at.level === ctx.state.currentLevel &&
    costlySpot(ctx, at.x, at.y) &&
    (carried ? !!it?.unpaid : !it?.noCharge)
  ) {
    const shkp = shopAt(ctx, at.x, at.y);
    stolenValue(ctx, obj, at.x, at.y, !!shkp?.c.monster?.peaceful, false);
  }
  stopFigTransform(ctx, obj.id);
  if (carried) useup(ctx, obj.id);
  else ctx.remove(obj.id);
  const mp = mon.c.pos;
  const level = ctx.state.levels[mp.level];
  if (
    mp.level === ctx.state.currentLevel &&
    level &&
    isVisible(ctx.state, cellIndex(level, mp.x, mp.y))
  )
    say(ctx, golemXform ? 'figurine.flesh_animates' : 'figurine.animates');
  return mon;
}

/**
 * Stone to flesh hits the object (on the floor, or in her pack when she casts it at herself):
 * mineral and gemstone objects turn to meat, 2 times in 100 not. A boulder becomes an enormous
 * meatball; a statue comes to life (animate_statue()), or becomes a meatball when its monster is
 * not made of flesh, or its monster's corpse (its contents dropped) when it could not come to
 * life and the monster leaves a corpse; a ring a meat ring, a wand a meat stick, a rock or gem
 * a meatball. "You smell the odor of meat." Returns 1 when the object was affected.
 * ref: src/zap.c stone_to_flesh_obj()
 */
export function stoneToFleshObj(ctx: Ctx, obj: Entity): number {
  const od = ctx.defs.object(obj.def);
  if (od.material !== 'mineral' && od.material !== 'gemstone') return 0;
  // Heart of Ahriman usually resists; ordinary items rarely do: obj_resists(obj, 2, 98)
  if (ctx.rng.rn2(100) < 2) return 0;
  const at = objLocation(ctx, obj);
  if (!at) return 0;
  let res = 1;
  let smell = false;
  switch (od.class) {
    case 'rock': // boulders and statues
    case 'tool': // figurines
      if (obj.def === BOULDER) {
        polyObj(ctx, obj, MEAT.enormous);
        smell = true;
      } else if (obj.def === STATUE || obj.def === FIGURINE) {
        const montype = obj.c.item?.corpseOf;
        let ptr = montype && ctx.defs.isMonster(montype) ? ctx.defs.monster(montype) : null;
        let golemXform = false;
        if (ptr && isGolem(ptr)) golemXform = ptr.id !== FLESH_GOLEM;
        else if (ptr && vegetarian(ptr)) {
          // don't animate monsters that aren't flesh
          polyObj(ctx, obj, MEAT.meatball);
          smell = true;
          break;
        }
        let mon: Entity | null;
        if (obj.def === STATUE) {
          // animate_statue() forces all golems to become flesh golems
          mon = animateStatue(ctx, obj, at.x, at.y, 'spell').mon;
        } else {
          if (golemXform && ctx.defs.isMonster(FLESH_GOLEM)) ptr = ctx.defs.monster(FLESH_GOLEM);
          mon = ptr ? animateFigurine(ctx, obj, ptr, at, golemXform) : null;
        }
        if (mon) break;
        if (!ptr || ptr.genFlags.includes('nocorpse') || ptr.genFlags.includes('uniq')) {
          res = 0; // didn't revive but can't leave corpse either
        } else {
          // drop statue's contents (bypass_obj(): this zap does not hit them)
          for (const item of contents(ctx.state, obj.id)) {
            if (!item.c.item) continue;
            delete item.c.item.containedIn;
            placeObject(ctx, item.id, at.level, at.x, at.y);
          }
          polyObj(ctx, obj, CORPSE);
        }
      } else res = 0; // miscellaneous tool or unexpected rock...
      break;
    case 'ring': // some of the rings are stone
      polyObj(ctx, obj, MEAT.ring);
      smell = true;
      break;
    case 'wand': // marble wand
      polyObj(ctx, obj, MEAT.stick);
      smell = true;
      break;
    case 'gem': // stones & gems
      polyObj(ctx, obj, MEAT.meatball);
      smell = true;
      break;
    default:
      res = 0;
      break;
  }
  // (non-meat eaters smell meat, meat eaters its flavor: no conduct is kept)
  if (smell) say(ctx, 'zap.stf.smell_meat');
  return res;
}
