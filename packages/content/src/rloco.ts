// Teleporting an object: the wand's beam sends floor objects to random spots of the level.
// Above flooreffects.ts and the shop code (a boulder fills a pit it lands on; shop goods leaving
// the shop are stolen), which trap.ts cannot import. ref: src/teleport.c rloco()
import { getPlayer, inRooms, type Ctx, type Entity } from '@nh/core';
import { costlySpot, isShopType } from './eshk';
import { boulderFlooreffects } from './flooreffects';
import { placeObject } from './items';
import { addtobill, costlyAdjacent, findObjowner, stolenValue, subfrombill } from './shk';
import { rlocoPos } from './teleport';

/**
 * A floor object of the hero's level teleports to a random spot (rlocoPos()). A boulder landing
 * on a pit or hole fills it (flooreffects()); shop goods leaving the shop floor are stolen unless
 * she is in the shop and they land in it (unpaid ones come off her bill) or on its boundary (they
 * go on her bill). False when the object was used up on landing.
 * ref: src/teleport.c rloco() (no riders' corpses, trap-door falls or Wizard's Tower)
 */
export function rloco(ctx: Ctx, obj: Entity): boolean {
  const p = obj.c.pos;
  const it = obj.c.item;
  const level = p ? ctx.state.levels[p.level] : undefined;
  const hp = getPlayer(ctx.state).c.pos;
  if (!p || !it || !level || !hp) return false;
  const otx = p.x;
  const oty = p.y;
  delete obj.c.pos; // obj_extract_self()
  const to = rlocoPos(ctx, level);
  if (boulderFlooreffects(ctx, obj, to.x, to.y, 'fall')) return false;
  const shkp = findObjowner(ctx, obj, otx, oty);
  const objinshop = shkp !== null && costlySpot(ctx, otx, oty);
  const onboundary = shkp !== null && costlyAdjacent(ctx, shkp, otx, oty);
  if (shkp !== null && (objinshop || (it.unpaid && onboundary))) {
    const h = inRooms(level, hp.x, hp.y).find((r) => isShopType(level.rooms[r]?.type));
    const oo = inRooms(level, otx, oty)[0];
    const sp = ctx.state.entities[String(shkp)]?.c.pos;
    const hinshop = h !== undefined && !!sp && inRooms(level, sp.x, sp.y).includes(h);
    const sameRoom = oo !== undefined && inRooms(level, to.x, to.y).includes(oo);
    if (hinshop && costlySpot(ctx, to.x, to.y) && sameRoom) {
      if (it.unpaid) subfrombill(ctx, obj, shkp);
    } else if (hinshop && costlyAdjacent(ctx, shkp, to.x, to.y) && sameRoom) {
      if (!it.unpaid) addtobill(ctx, obj, false, false, false);
    } else stolenValue(ctx, obj, otx, oty, false, false);
  }
  placeObject(ctx, obj.id, level.id, to.x, to.y);
  return true;
}
