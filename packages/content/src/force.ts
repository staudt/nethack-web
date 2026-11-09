// #force: prying open a locked box on the floor with a wielded blade (which may break) or bashing
// it with a blunt weapon (which may wreck the box and break its potions), as a multi-turn
// occupation like lock picking.
// ref: src/lock.c doforce(), forcelock(), u_have_forceable_weapon(), breakchestlock(),
// chest_shatter_msg()
//
// Not ported (see DEVIATIONS.md): forcing doors (C does not either), the shop's charge for a
// broken lock (costly_alteration(COST_BRKLCK)), potionbreathe() of a shattered potion, the
// hallucinatory bottle names, exercise.
import {
  NORMAL_SPEED,
  contents,
  getPlayer,
  inventoryOf,
  takeOut,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Msg,
  type ObjectDef,
  type Offer,
} from '@nh/core';
import { wakeNearby } from './btrapped';
import { monsterNearby } from './eat';
import { costlySpot, shopKeeper, insideShop } from './eshk';
import { placeOnFloor, setLknown } from './items';
import { floorBoxes } from './lock';
import { lockData, xlockOf } from './lockstate';
import { useup } from './magic';
import { greatestErosion, isWeptool } from './material';
import { xnameOf, zorkmids } from './objnam';
import { P, hasProp } from './props';
import { stolenValue } from './shk';
import { SKILL_GROUPS, isBlade } from './skills';
import { surfaceKey } from './terrain';
import { levitating } from './trapstate';
import { breatheVapors } from './potionhit';

export const FORCE_ID: DefId = 'nh:force';
export const FORCELOCK_ID: DefId = 'nh:forcelock';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The weapon skills in skills.h order: P_DAGGER is 1. */
const WEAPON_SKILLS: readonly string[] = SKILL_GROUPS.find((g) => g.id === 'weapon')?.skills ?? [];
const pSkill = (s: string): number => WEAPON_SKILLS.indexOf(s) + 1;
const P_DAGGER = pSkill('dagger');
const P_PICK_AXE = pSkill('pick_axe');
const P_FLAIL = pSkill('flail');
const P_LANCE = pSkill('lance');

const skillOf = (def: ObjectDef): number => (def.weapon ? pSkill(def.weapon.skill) : 0);

/** ref: include/obj.h is_blade() && !is_pick() */
const isBladeNotPick = (def: ObjectDef): boolean => isBlade(def) && skillOf(def) !== P_PICK_AXE;

/** oc_wldam: the large-monster damage die (a boulder or statue: d20). ref: include/objects.h */
const wldam = (def: ObjectDef): number => def.weapon?.large[1] ?? (def.class === 'rock' ? 20 : 0);

/** The wielded weapon (uwep), or null. */
function uwep(ctx: Ctx): Entity | null {
  return (
    inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null
  );
}

/** ref: src/lock.c u_have_forceable_weapon() */
function forceable(ctx: Ctx, w: Entity | null): boolean {
  if (!w) return false;
  const def = ctx.defs.object(w.def);
  if (def.class === 'weapon' || isWeptool(def)) {
    const sk = skillOf(def);
    return !(sk < P_DAGGER || sk === P_FLAIL || sk > P_LANCE);
  }
  return def.class === 'rock';
}

const heroAt = (ctx: Ctx): { level: string; x: number; y: number } | null =>
  getPlayer(ctx.state).c.pos ?? null;

// ---------------------------------------------------------------------------------------------
// the occupation

/**
 * One turn of forcing the lock; returns true while still busy.
 * ref: src/lock.c forcelock()
 */
function forcelock(ctx: Ctx): boolean {
  const x = xlockOf(ctx);
  if (!x?.force || x.box === undefined) return false;
  const box = ctx.state.entities[String(x.box)];
  const p = heroAt(ctx);
  const bp = box?.c.pos;
  if (!box || !p || !bp || bp.level !== p.level || bp.x !== p.x || bp.y !== p.y) {
    x.usedtime = 0; // you or it moved
    return false;
  }
  const w = uwep(ctx);
  if (x.usedtime++ >= 50 || !w) {
    say(ctx, 'force.give_up');
    x.usedtime = 0;
    return false;
  }
  const it = w.c.item;
  if (x.force === 'blade' && it) {
    // for a +0 weapon, the chance it survives an unsuccessful attempt is (.992)^50 = .67
    if (
      ctx.rng.rn2(1000 - it.spe) > 992 - greatestErosion(w) * 10 &&
      it.buc !== 'cursed' &&
      !(ctx.rng.rn2(100) < 0) // obj_resists(uwep, 0, 99): no artifacts
    ) {
      say(ctx, it.quantity > 1 ? 'force.one_broke' : 'force.broke', {
        weapon: xnameOf(ctx.state, ctx.defs, w),
      });
      useup(ctx, w.id);
      say(ctx, 'force.give_up');
      x.usedtime = 0;
      return false;
    }
  } else wakeNearby(ctx); // due to hammering on the container

  if (ctx.rng.rn2(100) >= x.chance) return true; // still busy

  say(ctx, 'force.succeed');
  breakchestlock(ctx, box, x.force === 'blunt' && !ctx.rng.rn2(3));
  delete lockData(ctx).xlock; // reset_pick()
  return false;
}

/**
 * The lock is broken (`destroyit`: the box is wrecked, its contents spill at her feet, a third of
 * them and every potion destroyed). ref: src/lock.c breakchestlock()
 */
export function breakchestlock(ctx: Ctx, box: Entity, destroyit: boolean): void {
  const it = box.c.item;
  if (!it) return;
  if (!destroyit) {
    // (costly_alteration(box, COST_BRKLCK) is not ported)
    delete it.locked;
    it.broken = true;
    setLknown(ctx, box.id, true);
    return;
  }
  const p = heroAt(ctx);
  if (!p) return;
  const level = ctx.state.levels[p.level];
  const room = level ? insideShop(level, p.x, p.y) : null;
  const shk = room !== null && costlySpot(ctx, p.x, p.y) ? shopKeeper(ctx, p.level, room) : null;
  const peaceful = shk !== null && ctx.state.entities[String(shk)]?.c.monster?.peaceful === true;
  let loss = 0;
  say(ctx, 'force.destroyed', { box: xnameOf(ctx.state, ctx.defs, box) });
  // put the contents on the ground at the hero's feet
  for (const o of contents(ctx.state, box.id)) {
    const oi = o.c.item;
    if (!oi) continue;
    takeOut(ctx.state, o.id);
    if (!ctx.rng.rn2(3) || ctx.defs.object(o.def).class === 'potion') {
      chestShatterMsg(ctx, o);
      if (shk !== null) loss += stolenValue(ctx, o, p.x, p.y, peaceful, true);
      if (oi.quantity === 1) {
        ctx.remove(o.id);
        continue;
      }
      oi.quantity--; // useup(): at least one is left
    }
    placeOnFloor(ctx, o.id, p.level, p.x, p.y);
  }
  if (shk !== null) loss += stolenValue(ctx, box, p.x, p.y, peaceful, true);
  if (loss) say(ctx, 'force.owe', { n: loss, zm: zorkmids(loss) });
  ctx.remove(box.id);
}

/** ref: src/potion.c bottlenames[] */
const BOTTLES = 7;

/** "You see a flask shatter!", "A scroll of light is torn to shreds!"... ref: chest_shatter_msg() */
function chestShatterMsg(ctx: Ctx, o: Entity): void {
  const def = ctx.defs.object(o.def);
  const blind = hasProp(getPlayer(ctx.state), P.BLINDED);
  if (def.class === 'potion') {
    const bottle = { key: `force.bottle.${ctx.rng.rn2(BOTTLES)}` }; // bottlename()
    say(ctx, blind ? 'force.hear_shatter' : 'force.see_shatter', { bottle });
    breatheVapors(ctx, o);
    return;
  }
  const it = o.c.item;
  const q = it?.quantity ?? 1;
  if (it) it.quantity = 1; // singular(otmp, xname)
  const thing = xnameOf(ctx.state, ctx.defs, o);
  if (it) it.quantity = q;
  const m = def.material;
  const how = ['paper', 'wax', 'veggy', 'flesh', 'glass', 'wood'].includes(m) ? m : 'other';
  say(ctx, `force.shatter.${how}`, { thing });
}

// ---------------------------------------------------------------------------------------------
// actions

/**
 * #force on one box at her feet: offered on each floor box while she wields a weapon that can
 * force a lock. Resumes an interrupted attempt with the same kind of weapon; a box whose lock is
 * already broken or unlocked says so. ref: src/lock.c doforce() (the box is chosen through its
 * offer instead of the ynq question about each box)
 */
const force: ActionDef = {
  id: FORCE_ID,
  labelKey: 'action.nh:force',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'self') return [];
    const w = uwep(ctx);
    if (!forceable(ctx, w) || !w) return [];
    return floorBoxes(ctx).map((b) => ({
      action: { type: 'mod', action: FORCE_ID, args: { box: b.id } },
      labelKey: 'action.nh:force_box',
      params: { box: ctx.defs.itemName(ctx.state, b) },
    }));
  },
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    const w = uwep(ctx);
    if (!w || !forceable(ctx, w)) {
      const plural = (w?.c.item?.quantity ?? 1) > 1;
      const def = w ? ctx.defs.object(w.def) : null;
      say(
        ctx,
        !w
          ? 'force.cant_not_wielding'
          : def && def.class !== 'weapon' && !isWeptool(def)
            ? plural
              ? 'force.cant_without_proper_pl'
              : 'force.cant_without_proper'
            : plural
              ? 'force.cant_with_those'
              : 'force.cant_with_that',
      );
      return 0;
    }
    const p = heroAt(ctx);
    if (!p) return 0;
    if (levitating(ctx)) {
      const level = ctx.state.levels[p.level];
      if (level) say(ctx, 'lev.cant_reach_floor', { surface: surfaceKey(ctx, level, p.x, p.y) });
      return 0;
    }
    const picktyp = isBladeNotPick(ctx.defs.object(w.def)) ? 'blade' : 'blunt';
    const x = xlockOf(ctx);
    if (x?.force === picktyp && x.usedtime && x.box !== undefined) {
      say(ctx, 'force.resume');
      ctx.state.occupation = { action: { type: 'mod', action: FORCELOCK_ID }, data: null };
      return NORMAL_SPEED;
    }
    // A lock is made only for the honest man, the thief will break it.
    const id = (action.args as { box?: unknown } | undefined)?.box;
    const box = floorBoxes(ctx).find((b) => b.id === id);
    const it = box?.c.item;
    if (box && it && (it.broken || !it.locked)) {
      setLknown(ctx, box.id, false); // omit the known "broken"/"unlocked" prefix
      say(ctx, it.broken ? 'force.already_broken' : 'force.already_unlocked', {
        box: ctx.defs.itemName(ctx.state, box),
      });
      setLknown(ctx, box.id, true);
    } else if (box) {
      setLknown(ctx, box.id, true);
      say(ctx, picktyp === 'blade' ? 'force.pry' : 'force.bash', {
        weapon: xnameOf(ctx.state, ctx.defs, w),
      });
      lockData(ctx).xlock = {
        box: box.id,
        chance: wldam(ctx.defs.object(w.def)) * 2,
        picktyp: FORCE_ID,
        usedtime: 0,
        force: picktyp,
      };
      ctx.state.occupation = { action: { type: 'mod', action: FORCELOCK_ID }, data: null };
      return NORMAL_SPEED;
    }
    say(ctx, 'force.decide_not');
    return NORMAL_SPEED;
  },
  continues: (ctx) => continuesForcing(ctx),
};

/**
 * Whether forcing goes on: the box is still being worked on and no hostile monster came next to
 * her ("You stop forcing the lock."). ref: src/allmain.c stop_occupation()
 */
function continuesForcing(ctx: Ctx): boolean {
  const x = xlockOf(ctx);
  const occ = ctx.state.occupation?.action;
  if (!x?.force || occ?.type !== 'mod' || occ.action !== FORCELOCK_ID) return false;
  if (monsterNearby(ctx)) {
    say(ctx, 'force.stop');
    ctx.interrupt();
    return false;
  }
  return true;
}

/** The occupation's next turn ('continue'). ref: set_occupation(forcelock, "forcing the lock") */
const forcelockAction: ActionDef = {
  id: FORCELOCK_ID,
  labelKey: 'action.nh:forcelock',
  handles: 'mod',
  offer: () => [],
  perform(ctx) {
    if (!xlockOf(ctx)?.force) {
      ctx.state.occupation = null;
      return 0;
    }
    if (!forcelock(ctx)) ctx.state.occupation = null;
    return NORMAL_SPEED;
  },
  continues: (ctx) => continuesForcing(ctx),
};

export const FORCE_ACTIONS: readonly ActionDef[] = [force, forcelockAction];
