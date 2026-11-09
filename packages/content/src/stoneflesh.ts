// Stone to flesh on objects: boulders become enormous meatballs, statues come to life (or turn
// into meatballs when their monster is not made of flesh), stone rings into meat rings, the marble
// wand into a meat stick, rocks and gems into meatballs. Sits under zap.ts.
// ref: src/zap.c stone_to_flesh_obj()
//
// Not ported: figurines (none exist), the Heart of Ahriman (no artifacts: every object
// resists 2 times in 100), saved monster traits, vegetarian conduct (the smell is always "the odor
// of meat": DEVIATIONS.md "Stone to flesh").
import { contents, type Ctx, type DefId, type Entity, type Msg } from '@nh/core';
import { BOULDER } from './boulder';
import { placeObject } from './items';
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
    case 'rock': // boulders and statues (no figurines)
      if (obj.def === BOULDER) {
        polyObj(ctx, obj, MEAT.enormous);
        smell = true;
      } else if (obj.def === STATUE) {
        const montype = obj.c.item?.corpseOf;
        const ptr = montype && ctx.defs.isMonster(montype) ? ctx.defs.monster(montype) : null;
        // a golem's statue animates as a flesh golem (animate_statue())
        if (ptr && !isGolem(ptr) && vegetarian(ptr)) {
          // don't animate monsters that aren't flesh
          polyObj(ctx, obj, MEAT.meatball);
          smell = true;
          break;
        }
        const { mon } = animateStatue(ctx, obj, at.x, at.y, 'spell');
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
