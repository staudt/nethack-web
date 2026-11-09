// A killer bee on a lump of royal jelly. ref: src/monmove.c bee_eat_jelly(), dochug() PHASE THREE
import { itemsAt, sortedIds, type Ctx, type Entity, type EntityId } from '@nh/core';
import { canseemon } from './invis';
import { splitStack } from './items';
import { growUp } from './mhitm';
import { paralyzeMonst } from './mstate';
import { xnameOf } from './objnam';
import { monNam } from './perception';

const JELLY = 'nh:lump_of_royal_jelly';
const QUEEN = 'nh:queen_bee';

/** The top lump of royal jelly on the monster's square. ref: src/invent.c sobj_at() */
function jellyUnder(ctx: Ctx, mon: Entity): Entity | null {
  const p = mon.c.pos;
  if (!p) return null;
  let top: Entity | null = null;
  for (const o of itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y))
    if (o.def === JELLY && (top === null || (o.c.item?.placed ?? 0) > (top.c.item?.placed ?? 0)))
      top = o;
  return top;
}

/** A queen bee on the level. ref: src/mon.c find_pmmonst() */
function queenOnLevel(ctx: Ctx, level: string): boolean {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.def === QUEEN && e.c.monster && e.c.pos?.level === level) return true;
  }
  return false;
}

/**
 * A killer bee standing on royal jelly eats it, when there is no queen on the level, and becomes
 * one: "The killer bee eats a lump of royal jelly.", raised to one level below a queen's and
 * grown up (grow_up() with no victim), then frozen for 3 (blessed), 5 or 7 (cursed) turns.
 * Returns 0 when it ate (its move is used), -1 when it did not.
 * ref: src/monmove.c bee_eat_jelly() (no "it dies" case: growing into a genocided queen is not
 * modelled by growUp())
 */
export function beeEatJelly(ctx: Ctx, id: EntityId): 0 | -1 {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m || mon.def !== 'nh:killer_bee' || !mon.c.pos) return -1;
  let obj = jellyUnder(ctx, mon);
  // if there's no queen on the level, eat the royal jelly and become one
  if (!obj || queenOnLevel(ctx, mon.c.pos.level)) return -1;
  const buc = obj.c.item?.buc;
  const mDelay = buc === 'blessed' ? 3 : buc !== 'cursed' ? 5 : 7;
  if ((obj.c.item?.quantity ?? 1) > 1)
    obj = ctx.state.entities[String(splitStack(ctx, obj.id, 1))] ?? obj;
  if (canseemon(ctx, mon))
    ctx.emit({
      type: 'msg',
      key: 'dog.eats',
      params: { mon: monNam(ctx, mon), item: xnameOf(ctx.state, ctx.defs, obj) as never },
    });
  ctx.remove(obj.id); // delobj()
  const queenLevel = ctx.defs.isMonster(QUEEN) ? ctx.defs.monster(QUEEN).level : 9;
  if (m.level < queenLevel - 1) m.level = queenLevel - 1;
  // there should be delay after eating, but that's too much hassle; transform immediately,
  // then have a short delay
  growUp(ctx, id, null);
  paralyzeMonst(ctx, id, mDelay);
  return 0; // bee used its move
}
