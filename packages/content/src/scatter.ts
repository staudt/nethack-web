// Objects blown or knocked about: a land mine's blast, kicked coins, a bag of holding's explosion.
// ref: src/explode.c scatter()
//
// Not ported: the ball and chain (none exist), statues (none exist: only boulders fracture), shop
// billing for gold blown out of a shop (credit_report(), addtobill(): see DEVIATIONS.md, Shop
// damage), sinks under a flying object stop it as in NetHack but nothing else (pools, lava) does.
import {
  cellIndex,
  getPlayer,
  inBounds,
  isVisible,
  itemsAt,
  shownId,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
  type Pos,
} from '@nh/core';
import { BOULDER, fractureRock } from './boulder';
import { monsterIdAt } from './combat';
import { dmgvalSized } from './dmgval';
import { stopOccupation } from './eat';
import { boulderFlooreffects } from './flooreffects';
import { placeOnFloor, splitStack, weight } from './items';
import { breaktest } from './material';
import { ohitmon, thitu } from './mthrowu';
import { cansee } from './trap';
import { T, terrainIdAt } from './terrain';

/**
 * What a scatter may do. ref: include/hack.h VIS_EFFECTS, MAY_HITMON, MAY_HITYOU, MAY_DESTROY,
 * MAY_FRACTURE (`mayHit` is MAY_HIT: both hit flags)
 */
export interface ScatterFlags {
  visEffects?: true;
  mayHit?: true;
  mayDestroy?: true;
  mayFracture?: true;
  /** C's context.mon_moving: a monster set it off (no credit to the hero for kills) */
  monMoving?: boolean;
}

/** ref: src/hack.c xdir[], ydir[] (N_DIRS order: W, NW, N, NE, E, SE, S, SW) */
const XDIR = [-1, -1, 0, 1, 1, 1, 0, -1] as const;
const YDIR = [0, -1, -1, -1, 0, 1, 1, 1] as const;

interface Flier {
  id: EntityId;
  /** null once a monster's hit put it down (ohitmon()'s drop_throw()) */
  live: boolean;
  x: number;
  y: number;
  dx: number;
  dy: number;
  range: number;
  stopped: boolean;
  path: Pos[];
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * Scatters the objects at (x, y) of the hero's level (or only `only`, which may lie there or be
 * detached, as a bag of holding's contents) in random directions. Returns how many objects (by
 * quantity) ended up elsewhere. Each stack is split into random parts first. With `mayFracture`
 * a boulder breaks apart 9 times in 10 (into rocks that then scatter); with `mayDestroy` an
 * object breaks 1 time in 10 (glass and potions always, if they are breakable). The others fly
 * `rnd(blastforce - weight / 40)` squares, stopping before walls, rock and closed doors and on a
 * sink, hitting monsters (`ohitmon()`, the range shortened by one) and the hero (`thitu(8 + spe)`,
 * the range shortened by three on a hit) with `mayHit`, and land with flooreffects() (a boulder
 * fills a pit). ref: src/explode.c scatter()
 */
export function scatter(
  ctx: Ctx,
  sx: number,
  sy: number,
  blastforce: number,
  flags: ScatterFlags,
  only?: Entity,
): number {
  const levelId = ctx.state.currentLevel;
  const level = ctx.state.levels[levelId];
  if (!level) return 0;
  const fliers: Flier[] = [];
  let farthest = 0;
  let single: Entity | null = only ?? null;
  for (;;) {
    let otmp: Entity | undefined;
    if (only) {
      if (!single) break;
      otmp = single;
    } else otmp = itemsAt(ctx.defs, ctx.state, levelId, sx, sy)[0];
    if (!otmp?.c.item) break;
    if (otmp.c.item.quantity > 1) {
      const qtmp = ctx.rng.rnd(otmp.c.item.quantity - 1);
      const id = splitStack(ctx, otmp.id, qtmp);
      otmp = ctx.state.entities[String(id)];
      if (!otmp) break;
    } else single = null; // all used
    delete otmp.c.pos; // obj_extract_self()
    let usedUp = false;
    // 9 in 10 chance of fracturing boulders (no statues exist)
    if (flags.mayFracture && otmp.def === BOULDER && ctx.rng.rn2(10)) {
      say(ctx, cansee(ctx, levelId, sx, sy) ? 'boulder.breaks_apart' : 'boulder.hear_breaking');
      otmp.c.pos = { level: levelId, x: sx, y: sy }; // place_object()
      fractureRock(ctx, otmp, false);
      // (fracture_rock() restacks another boulder here to the top: boulders always are)
      usedUp = true;
    } else if (flags.mayDestroy) {
      // 1 in 10 chance of destruction of obj; glass destruction
      const od = ctx.defs.object(otmp.def);
      if ((!ctx.rng.rn2(10) || od.material === 'glass') && breaks(ctx, otmp, sx, sy)) usedUp = true;
    }
    if (!usedUp) {
      const dir = ctx.rng.rn2(8);
      const tmp = Math.max(1, blastforce - Math.trunc(weight(ctx.defs, otmp, ctx.state) / 40));
      const range = ctx.rng.rnd(tmp); // anywhere up to that determ. by wt
      if (farthest < range) farthest = range;
      fliers.push({
        id: otmp.id,
        live: true,
        x: sx,
        y: sy,
        dx: XDIR[dir] ?? 0,
        dy: YDIR[dir] ?? 0,
        range,
        stopped: false,
        path: [],
      });
    }
  }

  // the flights on screen: each object's seen squares, shown before the next message
  const flush = (): void => {
    if (!flags.visEffects) return;
    for (const f of fliers) {
      if (f.path.length === 0) continue;
      const o = ctx.state.entities[String(f.id)];
      if (o) ctx.emit({ type: 'projectile', g: shownId(ctx.state, o.def), path: f.path });
      f.path = [];
    }
  };
  const blocked = (x: number, y: number): boolean => {
    const id = terrainIdAt(level, x, y);
    if (id === undefined) return true;
    const t = ctx.defs.terrain(id);
    // !ZAP_POS(typ) || closed_door(): walls, rock, trees, secret doors and corridors
    if (t.door === 'closed' || t.door === 'locked') return true;
    return !t.passable && t.door === undefined && id !== T.iron_bars;
  };

  while (farthest-- > 0) {
    for (const f of fliers) {
      if (!(f.range-- > 0) || f.stopped) continue;
      let x = f.x + f.dx;
      let y = f.y + f.dy;
      if (!inBounds(level, x, y) || blocked(x, y)) {
        x -= f.dx;
        y -= f.dy;
        f.stopped = true;
      } else {
        if (isVisible(ctx.state, cellIndex(level, x, y))) f.path.push({ x, y });
        const monId = monsterIdAt(ctx, { x, y }, levelId);
        const hp = getPlayer(ctx.state).c.pos;
        if (monId !== null && monId !== ctx.state.playerId) {
          if (flags.mayHit) {
            f.range--;
            if (
              ohitmon(ctx, monId, f.id, 1, { level: levelId, x, y }, flush, {
                monMoving: flags.monMoving === true,
              })
            ) {
              f.live = false; // drop_throw() put it down
              f.stopped = true;
            }
          }
        } else if (hp && hp.level === levelId && hp.x === x && hp.y === y) {
          const o = ctx.state.entities[String(f.id)];
          if (flags.mayHit && o) {
            ctx.interrupt(); // if (gm.multi) nomul(0)
            const dam = dmgvalSized(ctx.rng, o, ctx.defs.object(o.def), false);
            flush();
            // hitvalu = 8 + spe (the hero is never a big monster)
            if (thitu(ctx, 8 + (o.c.item?.spe ?? 0), dam, o, null)) {
              f.range -= 3;
              stopOccupation(ctx);
            }
          }
        }
      }
      f.x = x;
      f.y = y;
      if (terrainIdAt(level, x, y) === T.sink) f.stopped = true;
    }
  }
  flush();

  let total = 0;
  for (const f of fliers) {
    const o = ctx.state.entities[String(f.id)];
    if (!f.live || !o?.c.item) continue;
    if (f.x !== sx || f.y !== sy) total += o.c.item.quantity;
    // flooreffects(): a boulder fills a pit or hole (no pools, lava or altars here)
    if (!boulderFlooreffects(ctx, o, f.x, f.y, 'land', false, flags.monMoving === true))
      placeOnFloor(ctx, o.id, levelId, f.x, f.y); // place_object() + stackobj()
  }
  return total;
}

/**
 * The object breaks if it is breakable: "The potion shatters!" ("You hear something shatter!"
 * out of sight). True when it is gone. ref: src/dothrow.c breaks(), breakmsg(), breakobj()
 * (no vapors, no shop billing)
 */
function breaks(ctx: Ctx, obj: Entity, x: number, y: number): boolean {
  if (!breaktest(ctx, obj)) return false;
  if (cansee(ctx, ctx.state.currentLevel, x, y))
    say(ctx, (obj.c.item?.quantity ?? 1) !== 1 ? 'kick.shatter' : 'kick.shatters', {
      item: ctx.defs.itemName(ctx.state, obj),
    });
  else say(ctx, 'zap.hear_shatter');
  ctx.remove(obj.id);
  return true;
}
