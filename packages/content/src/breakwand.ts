// Breaking a wand: applying one asks "Are you really sure you want to break it?", then it
// snaps in two and its magic is let loose around her. ref: src/apply.c do_break_wand(),
// broken_wand_explode(), discard_broken_wand(), doapply() (WAND_CLASS)
//
// Above zap.ts and dig.ts; imported by apply.ts only.
// A shop's walls and doors dug by a broken wand of digging are damage to pay for.
// Not ported (see DEVIATIONS.md): polymorph (no such wand), liquid flow into
// the pits (no pools),
// ice, the paranoid_confirmation option (always a y/n question), a hero without hands.
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inBounds,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Level,
  type Msg,
} from '@nh/core';
import { digCheck, digactualhole, digcheckFailed } from './dig';
import { explode, type ExplType } from './explode';
import { fillPit } from './flooreffects';
import { makemon } from './generation';
import { losehp } from './hp';
import { removeFromInventory } from './items';
import { canDigDown } from './levelflags';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import { freehand } from './pray';
import { litroom } from './read';
import { inAnyShop } from './eshk';
import { checkUnpaid, costlyAlteration } from './shk';
import { payForDamage } from './shkpay';
import { isWallId, terrainIdAt } from './terrain';
import { watchDig } from './watch';
import {
  WAN,
  bhitm,
  bhitpile,
  clearBypasses,
  releaseHold,
  zappable,
  zapyourself,
  type ZapSource,
} from './zap';
import { ustuck } from './hackmove';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** ref: include/decl.h xdir[], ydir[]: the eight directions, then the hero's own square */
const XDIR = [-1, -1, 0, 1, 1, 1, 0, -1, 0] as const;
const YDIR = [0, -1, -1, -1, 0, 1, 1, 1, 0] as const;

/** The wands whose breaking does nothing more. ref: do_break_wand() */
const NOTHING_ELSE: readonly DefId[] = [
  WAN.opening,
  WAN.wishing,
  WAN.nothing,
  WAN.locking,
  WAN.probing,
  WAN.enlightenment,
  WAN.secretDoor,
  WAN.stasis,
];

/** A balsa or glass wand is fragile: Str 5 snaps it. ref: objdescr_is(obj, "balsa" | "glass") */
function isFragile(ctx: Pick<Ctx, 'state'>, wand: Entity): boolean {
  const app = ctx.state.appearances[wand.def];
  return app === 'nh:balsa_wand' || app === 'nh:glass_wand';
}

function monAt(ctx: Ctx, level: Level, x: number, y: number): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.monster && p?.level === level.id && p.x === x && p.y === y) return e;
  }
  return null;
}

/** ref: src/apply.c discard_broken_wand(): the pieces are gone; nomul(0) */
function discardBrokenWand(ctx: Ctx, wand: Entity): number {
  ctx.remove(wand.id);
  ctx.interrupt();
  return NORMAL_SPEED;
}

/** ref: src/apply.c broken_wand_explode(): the explosion describes the wand */
function brokenWandExplode(ctx: Ctx, wand: Entity, dmg: number, expl: ExplType): number {
  const p = hero(ctx).c.pos;
  if (p) explode(ctx, p.x, p.y, { wand: wand.def, by: 'hero' }, dmg, expl);
  discover(ctx, wand.def); // makeknown()
  return discardBrokenWand(ctx, wand);
}

/**
 * Applying a wand: the hands and strength checks ("Your hands are occupied!", "You don't have
 * the strength to break your X!"), then the yes/no question whose answer {@link answerBreakWand}
 * takes. Returns the time taken now (none). ref: src/apply.c do_break_wand() up to
 * paranoid_query()
 */
export function doBreakWand(ctx: Ctx, wand: Entity, handler: DefId): number {
  const item = xnameOf(ctx.state, ctx.defs, wand);
  if (!freehand(ctx)) {
    say(ctx, 'break.hands_occupied');
    return 0;
  }
  if ((hero(ctx).c.attributes?.str ?? 18) < (isFragile(ctx, wand) ? 5 : 10)) {
    say(ctx, 'break.too_weak', { item });
    return 0;
  }
  ctx.ask(
    { id: 'break-wand', kind: 'yn', key: 'break.confirm', params: { item }, cancellable: true },
    handler,
    { breakWand: wand.id } as Json,
  );
  return 0;
}

/** Whether a question's data is the break-wand question's. */
export const isBreakWandData = (data: Json): boolean =>
  typeof data === 'object' && data !== null && !Array.isArray(data) && 'breakWand' in data;

/**
 * "Yes": the wand breaks. Out of charges, "But nothing else happens..."; otherwise its charges
 * (1..3 for a wrested last one) make the damage: the attack wands explode (death and lightning
 * `spe * 16`, fire and cold `spe * 8` as their own kinds, magic missile `spe * 4`), striking
 * smashes a wall of force down (`d(1 + spe, 6)`); the rest make a magical explosion of
 * `rnd(spe * 4)` and then hit the eight squares around her and her own last: digging digs pits
 * (holes when `rn2(spe) >= 3` and the floor can be dug through), create monster makes nine monsters, the other wands
 * hit each monster (and with striking, cancellation, teleportation or undead turning the
 * objects) as a zap would. ref: src/apply.c do_break_wand()
 */
export function answerBreakWand(ctx: Ctx, value: Json, data: Json): number {
  if (value !== true || !isBreakWandData(data)) return 0;
  const id = (data as { breakWand?: unknown }).breakWand;
  const obj = typeof id === 'number' ? ctx.state.entities[String(id)] : undefined;
  const it = obj?.c.item;
  if (!obj || !it || it.carriedBy !== ctx.state.playerId) return 0;
  say(ctx, isFragile(ctx, obj) ? 'break.snap' : 'break.break', {
    item: xnameOf(ctx.state, ctx.defs, obj),
  });
  // [ALI] first, so that the wand is taken off the bill
  if (it.unpaid) {
    checkUnpaid(ctx, obj); // extra charge for use
    costlyAlteration(ctx, obj, 'destroy', null);
  }
  removeFromInventory(ctx, obj.id); // freeinv(), setnotworn(): hidden from destroy_items()
  if (!zappable(ctx, obj)) {
    say(ctx, 'break.nothing_else');
    return discardBrokenWand(ctx, obj);
  }
  // a successful zappable() consumes a charge; put it back (a wrested one gives 1..3)
  it.spe++;
  if (!it.spe) it.spe = ctx.rng.rnd(3);
  const hp = hero(ctx).c.pos;
  if (!hp) return discardBrokenWand(ctx, obj);
  const ox = hp.x;
  const oy = hp.y;
  let dmg = it.spe * 4;
  let affectsObjects = false;
  switch (obj.def) {
    case WAN.opening:
      if (ustuck(ctx) !== null) {
        releaseHold(ctx);
        discover(ctx, WAN.opening); // dknown
        return discardBrokenWand(ctx, obj);
      }
      break;
    case WAN.death:
    case WAN.lightning:
      return brokenWandExplode(ctx, obj, dmg * 4, 'magical');
    case WAN.fire:
      return brokenWandExplode(ctx, obj, dmg * 2, 'fiery');
    case WAN.cold:
      return brokenWandExplode(ctx, obj, dmg * 2, 'frosty');
    case WAN.magicMissile:
      return brokenWandExplode(ctx, obj, dmg, 'magical');
    case WAN.striking:
      // we want this before the explosion instead of at the very end
      say(ctx, 'break.wall_of_force');
      dmg = ctx.rng.d(1 + it.spe, 6); // normally 2d12
      affectsObjects = true;
      break;
    case WAN.cancellation:
    case WAN.teleportation:
    case WAN.undeadTurning:
      affectsObjects = true;
      break;
    default:
      break;
  }
  if (NOTHING_ELSE.includes(obj.def)) {
    say(ctx, 'break.nothing_else');
    return discardBrokenWand(ctx, obj);
  }

  // magical explosion and its visual effect occur before specific effects
  explode(ctx, ox, oy, { wand: obj.def, by: 'hero' }, ctx.rng.rnd(dmg), 'magical');
  if (ctx.state.gameOver) return discardBrokenWand(ctx, obj);

  const src: ZapSource = { kind: 'wand', item: obj };
  clearBypasses();
  const level = getLevel(ctx.state);
  let shopDamage = false;
  // this makes it hit her last, so that she can see the action first
  for (let i = 0; i < XDIR.length; i++) {
    const x = ox + (XDIR[i] ?? 0);
    const y = oy + (YDIR[i] ?? 0);
    if (!inBounds(level, x, y)) continue;
    if (ctx.state.gameOver || ctx.state.currentLevel !== level.id) break;
    if (obj.def === WAN.digging) {
      const dcres = digCheck(ctx, level, x, y, true);
      if (!digcheckFailed(dcres) || dcres === 'boulder') {
        const id = terrainIdAt(level, x, y);
        const door = id === undefined ? undefined : ctx.defs.terrain(id).door;
        // pits and holes don't anger guards, but a wall or door dug does
        if (isWallId(id) || door !== undefined) {
          watchDig(ctx, x, y);
          if (inAnyShop(level, x, y)) shopDamage = true;
        }
        // liquid flow: fillholetyp() is always ROOM (no pools)
        const pit = ctx.rng.rn2(it.spe) < 3 || !canDigDown(ctx, level);
        digactualhole(ctx, x, y, false, pit ? 'pit' : 'hole'); // BY_OBJECT
      }
      if (ctx.state.currentLevel !== level.id) break; // she fell through
      fillPit(ctx, x, y);
      continue;
    }
    if (obj.def === WAN.createMonster) {
      // her square: x,y might create it in rock
      makemon(ctx, null, { x: ox, y: oy }, { adjacentOk: true });
      continue;
    }
    const pos = hero(ctx).c.pos;
    if (!pos || x !== pos.x || y !== pos.y) {
      // a square next to her: the monster first, then the objects
      const mon = monAt(ctx, level, x, y);
      if (mon) bhitm(ctx, mon, src, { x, y });
      if (ctx.state.gameOver) break;
      if (affectsObjects && itemsAt(ctx.defs, ctx.state, level.id, x, y).length)
        bhitpile(ctx, src, x, y);
    } else {
      // her own square: the objects first, in case the damage is fatal
      if (affectsObjects && itemsAt(ctx.defs, ctx.state, level.id, x, y).length)
        bhitpile(ctx, src, x, y);
      if (ctx.state.gameOver) break;
      const damage = zapyourself(ctx, src, false);
      if (damage && !ctx.state.gameOver) losehp(ctx, damage, '@killer.breakwand.self');
    }
  }
  // if she fell through, this finds nothing: digactualhole() handled the damage
  if (shopDamage && !ctx.state.gameOver) payForDamage(ctx, 'dig into', false);
  if (obj.def === WAN.light && !ctx.state.gameOver) litroom(ctx, true, false);
  return discardBrokenWand(ctx, obj);
}
