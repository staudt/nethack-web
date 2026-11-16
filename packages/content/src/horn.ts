// The horn of plenty applied: food or drink spills out of it into her hands.
// ref: src/mkobj.c hornoplenty() (not tipping: #tip is not ported); src/invent.c
// consume_obj_charge(); src/apply.c doapply() HORN_OF_PLENTY
import { getPlayer, type Ctx, type DefId, type Entity, type Msg } from '@nh/core';
import { fixupOil, POT_OIL } from './dilute';
import { engulferOf } from './engulfstate';
import { rndClass } from './gem';
import { isIce, isPoolOrLava } from './liquid';
import { setObjKnown } from './items';
import { mkobj } from './mkobj';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import { addtobill, checkUnpaid } from './shk';
import { T, terrainIdAt } from './terrain';
import { holdAnotherObject } from './wish';

export const HORN_OF_PLENTY: DefId = 'nh:horn_of_plenty';

const FOOD_RATION: DefId = 'nh:food_ration';
const ROYAL_JELLY: DefId = 'nh:lump_of_royal_jelly';
/** rnd_class(POT_BOOZE, POT_WATER), objects.h order */
const MUNDANE_POTIONS: readonly DefId[] = [
  'nh:potion_of_booze',
  'nh:potion_of_sickness',
  'nh:potion_of_fruit_juice',
  'nh:potion_of_acid',
  POT_OIL,
  'nh:potion_of_water',
];
const POT_SICKNESS: DefId = 'nh:potion_of_sickness';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * Where an object that slips from her goes: "out of your reach" when swallowed, "away from
 * you" over water, lava, ice, a drawbridge or cloud (C's `typ < IRONBARS || typ >= ICE`), else
 * "to the floor".
 */
function oopsWhere(ctx: Ctx): 'reach' | 'away' | 'floor' {
  if (engulferOf(ctx.state) !== null) return 'reach';
  const p = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level) return 'floor';
  const id = terrainIdAt(level, p.x, p.y);
  if (
    isPoolOrLava(ctx, level, p.x, p.y) ||
    isIce(ctx, level, p.x, p.y) ||
    id === T.cloud ||
    (id?.startsWith('nh:drawbridge_') ?? false)
  )
    return 'away';
  return 'floor';
}

/**
 * Applying a horn of plenty: without charges "Nothing happens." (its charges are then known);
 * else a charge is used (a usage fee in a shop) and out comes a potion 1 time in 13 (a magic
 * one becomes booze, fruit juice, acid, oil or water) or food (a food ration is royal jelly 1 time
 * in 7), with the horn's BUC: "Some food spills out." / "A potion spills out.". An unpaid horn's
 * gift goes on her bill. She holds it, or "Oops!  The X slips to the floor!". The horn is known.
 * Returns how many objects came out. ref: src/mkobj.c hornoplenty()
 */
export function hornoplenty(ctx: Ctx, horn: Entity): number {
  const hit = horn.c.item;
  if (!hit || horn.def !== HORN_OF_PLENTY) return 0;
  if (hit.spe < 1) {
    say(ctx, 'horn.nothing_happens');
    setObjKnown(ctx, 'cknown', horn.id, true);
    return 0;
  }
  // consume_obj_charge(horn, TRUE)
  checkUnpaid(ctx, horn);
  hit.spe -= 1;
  let id: number | null;
  let what: 'potion' | 'potions' | 'food';
  if (!ctx.rng.rn2(13)) {
    id = mkobj(ctx, 'potion', { artif: false });
    const obj = id === null ? undefined : ctx.state.entities[String(id)];
    if (obj?.c.item && ctx.defs.object(obj.def).magic) {
      do {
        obj.def = rndClass(ctx.rng, ctx.defs, MUNDANE_POTIONS, 0);
      } while (obj.def === POT_SICKNESS);
      // oil uses obj->age field differently from other potions
      if (obj.def === POT_OIL) fixupOil({ def: obj.def, it: obj.c.item }, null, ctx.state.turn);
    }
    what = (obj?.c.item?.quantity ?? 1) > 1 ? 'potions' : 'potion';
  } else {
    id = mkobj(ctx, 'food', { artif: false });
    const obj = id === null ? undefined : ctx.state.entities[String(id)];
    if (obj?.def === FOOD_RATION && !ctx.rng.rn2(7)) obj.def = ROYAL_JELLY;
    what = 'food';
  }
  say(ctx, `horn.spill.${what}`);
  const obj = id === null ? undefined : ctx.state.entities[String(id)];
  if (!obj?.c.item || id === null) return 1;
  obj.c.item.buc = hit.buc;
  // using a shop's horn of plenty entails a usage fee and also confers ownership of the created
  // item to the shopkeeper
  if (hit.unpaid) addtobill(ctx, obj, false, false, false);
  const n = obj.c.item.quantity;
  const where = oopsWhere(ctx);
  holdAnotherObject(ctx, id, {
    key: `horn.oops.${where}${n !== 1 ? '.plural' : ''}`,
    params: {
      item: {
        key: 'wish.aobjnam',
        params: {
          count: n !== 1 ? { key: 'obj.count', params: { n } } : '',
          name: xnameOf(ctx.state, ctx.defs, obj),
        },
      },
    },
  });
  discover(ctx, HORN_OF_PLENTY); // dknown is always set here
  return 1;
}
