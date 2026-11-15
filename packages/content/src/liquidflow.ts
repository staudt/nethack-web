// Water and lava flowing into a hole or pit made next to them: digging down, a broken wand of
// digging, a land mine's blast. ref: src/dig.c fillholetyp(), liquid_flow()
//
// Above flooreffects.ts (fire_damage_chain()) and minliquid.ts; below dig.ts, breakwand.ts and
// landmine.ts, which call it.
import { getPlayer, inBounds, itemsAt, trapAt, type Ctx, type DefId, type Level } from '@nh/core';
import { monsterIdAt } from './combat';
import { fireDamageChain } from './flooreffects';
import { isLava, isMoat, isPool, isPoolOrLava } from './liquid';
import { minliquid } from './minliquid';
import { T, setTerrain } from './terrain';
import { clearConjoinedPits, setMtrapped, setUtrap, utrap } from './trapstate';
import { poolEffects } from './uwater';
import { waterDamageChain } from './water';

/**
 * What liquid fills a hole dug at (x, y): lava, moat or pool by the counts of each around it
 * (pools count a third unless `fillIfAny`), each kind winning `rn2(count + 1)` times; null for
 * none (ROOM). `rn2()` is drawn only for a kind that is there. ref: src/dig.c fillholetyp()
 */
export function fillholetyp(
  ctx: Ctx,
  level: Level,
  x: number,
  y: number,
  fillIfAny: boolean,
): DefId | null {
  let poolCnt = 0;
  let moatCnt = 0;
  let lavaCnt = 0;
  for (let x1 = x - 1; x1 <= x + 1; x1++)
    for (let y1 = y - 1; y1 <= y + 1; y1++) {
      if (!inBounds(level, x1, y1)) continue;
      if (isMoat(ctx, level, x1, y1)) moatCnt++;
      // this must come after is_moat since moats are pools but not vice-versa
      else if (isPool(ctx, level, x1, y1)) poolCnt++;
      else if (isLava(ctx, level, x1, y1)) lavaCnt++;
    }
  if (!fillIfAny) poolCnt = Math.trunc(poolCnt / 3); // not as much liquid as the others
  const rn2 = (n: number): number => ctx.rng.rn2(n);
  if ((lavaCnt > moatCnt + poolCnt && rn2(lavaCnt + 1)) || (lavaCnt && fillIfAny)) return T.lava;
  if ((moatCnt > 0 && rn2(moatCnt + 1)) || (moatCnt && fillIfAny)) return T.moat;
  if ((poolCnt > 0 && rn2(poolCnt + 1)) || (poolCnt && fillIfAny)) return T.pool;
  return null;
}

/**
 * The liquid `typ` floods (x, y) of the hero's level: the terrain becomes it, the trap there is
 * gone (whoever it held is free), `fillmsg` ("As you dig, the hole fills with water!") is
 * said, the objects there get wet or burn, then the hero there is in it (pooleffects()) or a
 * monster there meets it (minliquid()). ref: src/dig.c liquid_flow() (with the caller's terrain
 * change; nothing is buried, so nothing is unearthed)
 */
export function liquidFlow(
  ctx: Ctx,
  level: Level,
  x: number,
  y: number,
  typ: DefId,
  fillmsg: string | null,
): void {
  setTerrain(level, x, y, typ);
  if (!isPoolOrLava(ctx, level, x, y)) return;
  const lava = typ === T.lava;
  const t = trapAt(level, x, y);
  const hp = getPlayer(ctx.state).c.pos;
  const uSpot = hp?.level === level.id && hp.x === x && hp.y === y;
  const monId = monsterIdAt(ctx, { x, y }, level.id);
  const mon =
    monId === null || monId === ctx.state.playerId ? null : ctx.state.entities[String(monId)];
  if (t) {
    // delfloortrap(): will untrap monster if one is here
    if (mon) setMtrapped(ctx, mon.id, false);
    const u = utrap(ctx);
    if (u && uSpot) setUtrap(ctx, 0, u.type);
    clearConjoinedPits(level, t);
    ctx.removeTrap(level.id, { x, y });
  }
  if (fillmsg)
    ctx.emit({
      type: 'msg',
      key: fillmsg,
      params: { liquid: lava ? '@surface.lava' : '@surface.water' },
    });
  // handle object damage before hero damage
  const objs = itemsAt(ctx.defs, ctx.state, level.id, x, y);
  if (objs.length > 0) {
    if (lava) fireDamageChain(ctx, objs, true, x, y);
    else waterDamageChain(ctx, objs);
  }
  // damage to the hero
  if (uSpot) poolEffects(ctx, false);
  else if (mon && ctx.state.entities[String(mon.id)]) minliquid(ctx, mon, false);
}
