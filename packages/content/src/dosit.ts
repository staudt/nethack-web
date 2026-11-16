// #sit, offered as "Sit" on the hero, and laying an egg as a female oviparous form.
// ref: src/sit.c dosit(), lay_an_egg()
//
// Ported: the parts whose terrain and states exist: swallowed, levitating, held by a monster,
// sitting in water (on top of it with water walking, or on the muddy bottom when in it), on lava
// and on ice, sitting on the top object of a pile, being stuck in a bear trap, pit or web,
// setting off the trap she sits on (VIASITTING), sinks, altars (altar_wrath()), graves, stairs,
// thrones (throne.ts) and laying eggs.
// Not ported: no steeds, hiding heroes, ladders or drawbridges exist; the gremlin
// splitting in a fountain or pool; burning away slime on lava; lava traps (TT_LAVA, m15 step 3);
// Half_physical_damage (no source); a squelched shop pie is not billed.
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  itemsAt,
  trapAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { sticks } from './adtyping';
import { aAlign, altarWrath } from './align';
import { EGG, eggTypeFromParent, eggsInWater, laysEggs, setEggCorpsenm } from './eggstate';
import { engulferOf } from './engulfstate';
import { heroFemale } from './gender';
import { ustuck } from './hackmove';
import { losehp } from './hp';
import { morehungry } from './hunger';
import { mksobj, placeOnFloor } from './items';
import { canReachFloor } from './levitation';
import { amorphous, humanoid } from './mondata';
import { monNam } from './perception';
import { LAST } from './priority';
import { sellobj, sellobjState } from './shk';
import { T, surfaceKey, terrainIdAt } from './terrain';
import { answerThrone, throneSitEffect } from './throne';
import { dotrap } from './trap';
import { flying, isHole, isPit, levitating, setUtrap, utrap } from './trapstate';
import { heroForm } from './upoly';
import { isIce, isLava, isPool } from './liquid';
import { likesLavaId, uinwater } from './uwater';
import { waterDamage } from './water';
import { P, hasProp, wornIn } from './props';

export const SIT_ID: DefId = 'nh:sit';

const say = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** ref: include/mondata.h slithy() */
const slithy = (def: MonsterDef | null): boolean => !!def?.flags.includes('slithy');

/** mhis() of a monster from its species (no monster genders here). */
function mhis(def: MonsterDef): string {
  if (def.flags.includes('neuter')) return '@pronoun.its';
  return def.flags.includes('female') ? '@pronoun.her' : '@pronoun.his';
}

/**
 * A female oviparous form lays an egg of her kind (laid by her: it hatches tame) at the cost of
 * the egg's nutrition: "You lay an egg." Males can't; a hungry hero has not the energy.
 * ref: src/sit.c lay_an_egg() (no water, so swimmers' "A splash tetra you are not.")
 */
function layAnEgg(ctx: Ctx, form: MonsterDef): number {
  const h = getPlayer(ctx.state);
  const nutrition = ctx.defs.object(EGG).food?.nutrition ?? 0;
  if (!heroFemale(ctx.state)) {
    say(ctx, 'sit.males_cant');
    return 0;
  }
  if ((h.c.hunger?.nutrition ?? 0) < nutrition) {
    say(ctx, 'sit.no_energy');
    return 0;
  }
  if (eggsInWater(form)) {
    say(ctx, 'sit.splash_tetra');
    return 0;
  }
  const p = h.c.pos;
  if (!p) return 0;
  const uegg = mksobj(ctx, ctx.defs.object(EGG), { init: false, quantity: 1 });
  const it = ctx.state.entities[String(uegg)]?.c.item;
  if (!it) return 0;
  it.spe = 1;
  // this sets hatch timers if appropriate
  setEggCorpsenm(ctx, uegg, eggTypeFromParent(ctx, form.id, false));
  it.known.spe = true;
  say(ctx, 'sit.lay_egg');
  // dropy(): sold without asking on a costly spot; then stackobj()
  const egg = ctx.state.entities[String(uegg)];
  if (egg) sellobj(ctx, egg, p.x, p.y, sellobjState('normal'));
  placeOnFloor(ctx, uegg, p.level, p.x, p.y);
  morehungry(ctx, nutrition);
  return NORMAL_SPEED;
}

/** The hero's gold. ref: money_cnt(invent) */
const moneyCnt = (ctx: Ctx): number =>
  inventoryOf(ctx.state, ctx.state.playerId)
    .filter((o) => ctx.defs.object(o.def).class === 'coin')
    .reduce((a, o) => a + (o.c.item?.quantity ?? 0), 0);

/** Sitting on the top object of the pile. ref: dosit() OBJ_AT */
function sitOnObject(ctx: Ctx, obj: Entity, form: MonsterDef | null): void {
  const it = obj.c.item;
  const od = ctx.defs.object(obj.def);
  const ulevel = getPlayer(ctx.state).c.experience?.level ?? 1;
  if (form?.glyph.ch === 'D' && od.class === 'coin') {
    const meager = (it?.quantity ?? 0) + moneyCnt(ctx) < ulevel * 1000;
    say(ctx, meager ? 'sit.coil_hoard_meager' : 'sit.coil_hoard');
    return;
  }
  if (obj.def === 'nh:towel') {
    say(ctx, 'towel.picnic');
    return;
  }
  const item = ctx.defs.itemName(ctx.state, obj);
  say(ctx, slithy(form) ? 'sit.coil_obj' : 'sit.on_obj', { item });
  const of = it?.corpseOf;
  if (obj.def === 'nh:corpse' && of && ctx.defs.isMonster(of) && amorphous(ctx.defs.monster(of)))
    say(ctx, 'sit.squishy');
  else if (obj.def === 'nh:cream_pie') {
    say(ctx, 'sit.squelch');
    ctx.remove(obj.id); // useupf(obj, obj->quan)
  } else if (!(od.container?.box || od.material === 'cloth')) say(ctx, 'sit.uncomfortable');
}

/**
 * "You sit in the water.": 1 time in 10 her body armor gets wet, and (C checks her boots but
 * wets the body armor again) 1 time in 10 once more unless her boots are water walking boots.
 * ref: src/sit.c dosit() in_water (no gremlin splitting)
 */
function sitInWater(ctx: Ctx): number {
  say(ctx, 'sit.in_water');
  const uarm = wornIn(ctx.state, ctx.state.playerId, 'body');
  const uarmf = wornIn(ctx.state, ctx.state.playerId, 'boots');
  if (!ctx.rng.rn2(10) && uarm) waterDamage(ctx, uarm, { key: 'sit.armor' }, true);
  if (!ctx.rng.rn2(10) && uarmf && uarmf.def !== 'nh:water_walking_boots' && uarm)
    waterDamage(ctx, uarm, { key: 'sit.armor' }, true);
  return NORMAL_SPEED;
}

/** ref: src/sit.c dosit(). Returns the time taken (0: ECMD_OK). */
export function dosit(ctx: Ctx): number {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level) return 0;
  const trap = trapAt(level, p.x, p.y);
  const form = heroForm(ctx);

  if (!canReachFloor(ctx)) {
    if (engulferOf(ctx.state) !== null) say(ctx, 'sit.no_seats');
    else if (levitating(ctx)) say(ctx, 'sit.tumble');
    else say(ctx, 'sit.on_air');
    return 0;
  }
  const stuck = ustuck(ctx);
  const stuckMon = stuck === null ? undefined : ctx.state.entities[String(stuck)];
  if (stuckMon && !(form && sticks(form))) {
    // holding monster is next to hero rather than beneath
    const sdef = ctx.defs.monster(stuckMon.def);
    say(ctx, humanoid(sdef) ? 'sit.no_lap_offer' : 'sit.no_lap', {
      mon: monNam(ctx, stuckMon),
      his: mhis(sdef),
    });
    return 0;
  }

  // water walking: she sits in the water (C's `goto in_water`)
  if (isPool(ctx, level, p.x, p.y) && !uinwater(ctx)) return sitInWater(ctx);

  const top = itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y)[0];
  const ut = utrap(ctx);
  // ensure we're not standing on the precipice: uteetering_at_seen_pit(), uescaped_shaft()
  const precipice =
    !!trap && trap.seen && ((isPit(trap.def) && ut?.type !== 'pit') || isHole(trap.def));
  const tid = terrainIdAt(level, p.x, p.y);
  if (top && !precipice) {
    sitOnObject(ctx, top, form);
  } else if (trap || ut) {
    if (ut) {
      if (ut.type === 'beartrap') {
        say(ctx, 'sit.bear_trap'); // you're getting stuck longer
        setUtrap(ctx, ut.n + 1, ut.type);
      } else if (ut.type === 'pit') {
        if (trap?.def === 'nh:spiked_pit') {
          say(ctx, 'sit.spike');
          losehp(ctx, 1, 'killer.sitting_spike');
        } else say(ctx, 'sit.in_pit');
        if (!ctx.state.gameOver) setUtrap(ctx, (utrap(ctx)?.n ?? ut.n) + ctx.rng.rn2(5), 'pit');
      } else {
        say(ctx, 'sit.web');
        setUtrap(ctx, ut.n + ctx.rng.rn2(10) + 5, ut.type); // rn1(10, 5)
      }
    } else if (trap) {
      // "you land" when flying: she takes off again unless a holding trap keeps her
      say(ctx, flying(ctx) ? 'sit.land' : 'sit.sit_down');
      dotrap(ctx, trap, { viaSitting: true });
    }
  } else if (uinwater(ctx) && !(form && eggsInWater(form))) {
    say(ctx, 'sit.muddy_bottom');
  } else if (tid === T.sink) {
    say(ctx, 'sit.on', { what: '@terrain.sink' });
    say(ctx, form && !humanoid(form) ? 'sit.wet_underside' : 'sit.wet_rump');
  } else if (aAlign(ctx, p.x, p.y) !== null) {
    say(ctx, 'sit.on', { what: '@surface.altar' });
    altarWrath(ctx, p.x, p.y);
  } else if (tid === T.grave) {
    say(ctx, 'sit.on', { what: '@terrain.grave' });
  } else if (tid === T.stairs_up || tid === T.stairs_down) {
    say(ctx, 'sit.on', { what: '@surface.stairs' });
  } else if (tid === T.ladder_up || tid === T.ladder_down) {
    say(ctx, 'sit.on', { what: '@surface.ladder' });
  } else if (isLava(ctx, level, p.x, p.y)) {
    // must be water walking (burn_away_slime(): no sliming cure here)
    say(ctx, 'sit.on', { what: '@surface.lava' });
    if (likesLavaId(form?.id)) {
      say(ctx, 'sit.lava_warm');
      return NORMAL_SPEED;
    }
    say(ctx, 'sit.lava_burns');
    const fireRes = hasProp(h, P.FIRE_RES);
    losehp(ctx, ctx.rng.d(fireRes ? 2 : 10, 10), 'killer.sitting_lava');
  } else if (isIce(ctx, level, p.x, p.y)) {
    say(ctx, 'sit.on', { what: '@nh:ice' }); // defsyms[S_ice].explanation
    if (!hasProp(h, P.COLD_RES)) say(ctx, 'sit.ice_cold');
  } else if (tid === T.throne) {
    say(ctx, 'sit.on', { what: '@nh:throne' }); // defsyms[S_throne].explanation
    return throneSitEffect(ctx, SIT_ID);
  } else if (form && laysEggs(form)) {
    return layAnEgg(ctx, form);
  } else {
    // surface(): a doorway is "floor"
    const surface = surfaceKey(ctx, level, p.x, p.y);
    say(ctx, 'sit.having_fun', {
      surface: surface === '@surface.doorway' ? '@surface.floor' : surface,
    });
  }
  return NORMAL_SPEED;
}

const sit: ActionDef = {
  id: SIT_ID,
  labelKey: 'action.nh:sit',
  handles: 'mod',
  // ref: src/cmd.c the "sit" extended command (M-s); always there, so near the end of the menu
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: SIT_ID }, labelKey: 'action.nh:sit', priority: LAST + 1 }]
      : [],
  perform: (ctx) => dosit(ctx),
  // a throne's wish or genocide
  answer: (ctx, value, data) => answerThrone(ctx, SIT_ID, value, data),
};

export const SIT_ACTIONS: readonly ActionDef[] = [sit];
