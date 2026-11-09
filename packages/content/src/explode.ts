// Explosions: the 3x3 blast of a broken wand, of a magical trap set off by cancellation or
// digging, or of an exploding monster (a gas spore dying, a sphere's AT_EXPL).
// ref: src/explode.c explode(), explosionmask(), mon_explodes(), adtyp_to_expltype()
//
// Below zap.ts and dig.ts (both call it); it must not import them.
// Not ported (see DEVIATIONS.md): engulfing (the hero inside an engulfer), steeds, polymorphed
// heroes (grabbing, ugolemeffects()), golems (golemeffects(), completelyburns()), shields shown
// on resisting targets, hallucinated names, Deafness, Invulnerable, Half_physical_damage,
// slime, exercise(), the scroll/oil kinds (fire scrolls), hallucinated monster explosion names.
// A shop door the blast destroys is the hero's damage to pay for (pay_for_damage()): every
// explosion here is hers (C's type >= 0).
import {
  getPlayer,
  inBounds,
  sortedIds,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type Level,
  type Msg,
  type RayStep,
} from '@nh/core';
import {
  killedByHero,
  rayDmgstr,
  resist,
  resistsMagm,
  wakeGently,
  zapOverFloor,
  type Ray,
  type ShopDamageFlag,
} from './buzz';
import { done } from './end';
import { destroyItems, erodeArmor, type DestroyType } from './erode';
import { ustuck } from './hackmove';
import { igniteItems } from './light';
import { nonliving } from './mondata';
import { mondead, mondied, monkilled } from './mondeath';
import { setDeathExplosion } from './corpses';
import { heroSees } from './mongear';
import { wakeNearto } from './noise';
import { canSpotMon, monNam } from './perception';
import { setmangry, wakeup } from './peaceful';
import { P, hasProp } from './props';
import { rehumanize, upolyd } from './upoly';
import { payForDamage } from './shkpay';

/** The explosion's look (C's EXPL_* colours). ref: include/hack.h explosion types */
export type ExplType = 'dark' | 'noxious' | 'muddy' | 'wet' | 'magical' | 'fiery' | 'frosty';

/** ref: include/display.h explosion_to_glyph(): the colour of each kind of explosion box */
export const EXPL_COLOR: Readonly<Record<ExplType, string>> = {
  dark: '#555555', // CLR_BLACK, drawn dark gray as objects.ts does
  noxious: '#33bb33', // CLR_GREEN
  muddy: '#aa5500', // CLR_BROWN
  wet: '#4466ff', // CLR_BLUE
  magical: '#bb44bb', // CLR_MAGENTA
  fiery: '#ff8800', // CLR_ORANGE
  frosty: '#ffffff', // CLR_WHITE
};

/**
 * What exploded: a broken wand (`wand`: its type, C's `-(otyp)` with WAND_CLASS), a magical
 * trap (C's TRAP_EXPLODE: a generic magical blast) or a monster (`mon`: C's MON_EXPLODE, with
 * the damage type `ad` of its AT_BOOM or AT_EXPL attack: phys for a gas spore, else fire, cold or
 * elec). `by: 'hero'` is C's `!context.mon_moving`: she gets the kills (and the blame); 'other'
 * kills as another monster would.
 */
export interface ExplSource {
  wand?: DefId;
  trap?: true;
  mon?: DefId;
  ad?: 'phys' | 'fire' | 'cold' | 'elec';
  by: 'hero' | 'other';
}

/** The ray wands' zap types (wand - WAN_MAGIC_MISSILE); every other wand makes type 0. */
const WAND_ZAPTYPE: Readonly<Record<string, number>> = {
  'nh:wand_of_magic_missile': 0,
  'nh:wand_of_fire': 1,
  'nh:wand_of_cold': 2,
  'nh:wand_of_death': 4,
  'nh:wand_of_lightning': 5,
};

type Adtyp = 'magm' | 'fire' | 'cold' | 'disn' | 'elec' | 'phys';
const ADTYP: readonly (Adtyp | null)[] = ['magm', 'fire', 'cold', null, 'disn', 'elec'];
/** The ray whose floor effects the blast has (zap_over_floor()'s damgtype). */
const AD_RAY: Readonly<Record<Exclude<Adtyp, 'phys'>, Ray>> = {
  magm: 'magic_missile',
  fire: 'fire',
  cold: 'cold',
  disn: 'death',
  elec: 'lightning',
};

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** A monster's resistance to the blast. ref: src/explode.c explosionmask() for a monster */
function monResists(ctx: Ctx, mon: Entity, adtyp: Adtyp, wand: boolean): boolean {
  const def = ctx.defs.monster(mon.def);
  switch (adtyp) {
    case 'phys':
      return false;
    case 'magm':
      return resistsMagm(ctx, mon);
    case 'disn':
      // a wand's "death field": only the nonliving and demons (no vampshifters)
      return wand ? nonliving(def) || def.flags.includes('demon') : def.resists.includes('disint');
    default:
      return def.resists.includes(adtyp);
  }
}

/**
 * The hero's resistance. ref: src/explode.c explosionmask() for the hero (a hero is never
 * nonliving or a demon: no polymorph; no intrinsic disintegration resistance yet)
 */
function heroResists(ctx: Ctx, adtyp: Adtyp, wand: boolean): boolean {
  const h = getPlayer(ctx.state);
  switch (adtyp) {
    case 'phys':
      return false;
    case 'magm':
      return hasProp(h, P.ANTIMAGIC);
    case 'fire':
      return hasProp(h, P.FIRE_RES);
    case 'cold':
      return hasProp(h, P.COLD_RES);
    case 'elec':
      return hasProp(h, P.SHOCK_RES);
    case 'disn':
      return !wand && hasProp(h, P.DISINT_RES);
  }
}

/**
 * destroy_items() for any damage type: only fire, cold and electricity destroy anything, but
 * C draws its `limit` roll for every type. ref: src/zap.c destroy_items()
 */
function destroyAny(ctx: Ctx, id: number, adtyp: Adtyp, dam: number): number {
  if (adtyp === 'fire' || adtyp === 'cold' || adtyp === 'elec')
    return destroyItems(ctx, id, adtyp as DestroyType, dam);
  ctx.rng.rn2(5); // `dmg_in % DMG_DESTROY_SCALE > rn2(DMG_DESTROY_SCALE)`; nothing is destroyable
  return 0;
}

function monAt(ctx: Ctx, level: Level, x: number, y: number): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.monster && p?.level === level.id && p.x === x && p.y === y) return e;
  }
  return null;
}

/**
 * An explosion centred on (x, y) of the hero's level hits the 3x3 square: monsters there take
 * `dam` (half if they resist() the blast, nothing if they resist its damage type, double for
 * the opposite of fire or cold resistance), the floor gets the zap's effects (doors, secret
 * doors, fire burning scrolls), carried items may be destroyed, then the hero is "caught in the
 * X" last. The seen cells are shown as C's explosion box (a 'ray' event of kind 'explosion',
 * each step's `dx, dy` its offset from the centre); unseen, "You hear a blast."; then "Boom!".
 * Monsters within `max(dam * dam, 50)` wake up. ref: src/explode.c explode() with WAND_CLASS
 * (`-(otyp)`) or TRAP_EXPLODE
 */
export function explode(
  ctx: Ctx,
  x: number,
  y: number,
  src: ExplSource,
  dam: number,
  expl: ExplType,
): void {
  const h = getPlayer(ctx.state);
  const hp0 = h.c.pos;
  const level = hp0 ? ctx.state.levels[hp0.level] : undefined;
  if (!hp0 || !level) return;
  const wand = src.wand !== undefined;
  const monMoving = src.by !== 'hero';
  // MON_EXPLODE: a monster's explosion is a negative ("monster breath") type, so it does not
  // anger what it hits; a gas spore's is PHYS_EXPL_TYPE, which has no floor effects at all
  const monExpl = src.mon !== undefined;
  // the zap type: ray wands keep theirs, the others (and traps) make a generic magical blast
  const type = wand ? (WAND_ZAPTYPE[src.wand ?? ''] ?? 0) : 0;
  let damu = dam;
  if (wand) {
    // retributive strike: priests, monks and wizards are hurt less, healers and knights half
    const role = h.c.player?.role;
    if (role === 'nh:priest' || role === 'nh:monk' || role === 'nh:wizard')
      damu = Math.trunc(damu / 5);
    else if (role === 'nh:healer' || role === 'nh:knight') damu = Math.trunc(damu / 2);
  }
  const adtyp: Adtyp | null | undefined = monExpl ? (src.ad ?? 'phys') : ADTYP[type % 10];
  if (!adtyp) return; // impossible("explosion base type %d?")
  const strKey: Record<Adtyp, string> = {
    magm: 'explode.magical_blast',
    fire: 'explode.fireball',
    cold: 'explode.ball_of_cold',
    disn: wand ? 'explode.death_field' : 'explode.disintegration_field',
    elec: 'explode.ball_of_lightning',
    phys: 'explode.explosion',
  };
  // MON_EXPLODE: "gas spore's explosion" (C's killer.name)
  let strMsg: Msg = monExpl
    ? { key: 'explode.mon_explosion', params: { mon: `@${src.mon ?? ''}` } }
    : { key: strKey[adtyp] };
  let generic = false;
  const ux = hp0.x;
  const uy = hp0.y;
  // held but not engulfed: the holder reaching into the blast takes double damage
  const holder = ustuck(ctx);

  // explmask: 'skip' out of bounds, 'shield' resisted, 'none' affected
  const mask: ('none' | 'shield' | 'skip')[][] = [];
  let visible = false;
  for (let i = 0; i < 3; i++) {
    const col: ('none' | 'shield' | 'skip')[] = [];
    mask.push(col);
    for (let j = 0; j < 3; j++) {
      const xx = x + i - 1;
      const yy = y + j - 1;
      if (!inBounds(level, xx, yy)) {
        col.push('skip');
        continue;
      }
      let shield = false;
      if (xx === ux && yy === uy) shield = heroResists(ctx, adtyp, wand);
      const mtmp = monAt(ctx, level, xx, yy);
      if (mtmp && monResists(ctx, mtmp, adtyp, wand)) shield = true;
      col.push(shield ? 'shield' : 'none');
      if (heroSees(ctx, { level: level.id, x: xx, y: yy })) visible = true;
    }
  }

  let didmsg = false;
  if (visible) {
    // the explosion box, in C's column-first order (the shield sparkle is not shown)
    const path: RayStep[] = [];
    for (let i = 0; i < 3; i++)
      for (let j = 0; j < 3; j++)
        if (mask[i]?.[j] !== 'skip')
          path.push({ x: x + i - 1, y: y + j - 1, dx: i - 1, dy: j - 1 });
    const ev: GameEvent = { type: 'ray', kind: 'explosion', fg: EXPL_COLOR[expl], path };
    ctx.emit(ev);
  } else {
    if (src.trap || monExpl) {
      strMsg = { key: 'explode.explosion' }; // generic
      generic = true;
    }
    say(ctx, 'explode.hear_blast');
    didmsg = true;
  }
  if (!didmsg) say(ctx, 'explode.boom');

  let uhurt: 0 | 1 | 2 = 0;
  const shopdamage: ShopDamageFlag = { damaged: false };
  // apply effects to monsters and floor objects first, in case the damage to the hero is fatal
  if (dam) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const m = mask[i]?.[j];
        if (m === undefined || m === 'skip') continue;
        const xx = x + i - 1;
        const yy = y + j - 1;
        if (xx === ux && yy === uy) uhurt = m === 'shield' ? 1 : 2;
        // zap_over_floor() returns at once for PHYS_EXPL_TYPE
        if (adtyp !== 'phys')
          zapOverFloor(
            ctx,
            AD_RAY[adtyp],
            xx,
            yy,
            src.wand ?? '',
            monMoving || monExpl ? undefined : shopdamage,
          );
        const mtmp = monAt(ctx, level, xx, yy);
        if (!mtmp) continue;
        // zap_over_floor(): the monster there is woken, and angered when the zap type is >= 0
        // (not a monster's explosion)
        if (!monExpl) wakeup(ctx, mtmp.id);
        else if (adtyp !== 'phys') wakeGently(ctx, mtmp);
        const seen = heroSees(ctx, { level: level.id, x: xx, y: yy });
        if (seen) say(ctx, 'explode.mon_caught', { mon: monNam(ctx, mtmp), what: strMsg });
        const itemdmg = destroyAny(ctx, mtmp.id, adtyp, dam);
        if (!ctx.state.entities[String(mtmp.id)]?.c.monster) continue;
        if (adtyp === 'fire') {
          erodeArmor(ctx, mtmp.id, 'burn'); // burnarmor()
          igniteItems(ctx, mtmp.id);
        }
        const mhp = mtmp.c.hp;
        if (m === 'shield') {
          // golemeffects(): no golems
          if (mhp) mhp.cur -= itemdmg;
        } else {
          // resist() with no damage, then the damage by hand (the message comes first)
          let mdam = dam;
          if (resist(ctx, mtmp, 0, wand ? 'wand' : 'spell')) {
            if (seen) say(ctx, 'explode.mon_resists', { mon: monNam(ctx, mtmp), what: strMsg });
            mdam = Math.trunc((dam + 1) / 2);
          }
          if (holder === mtmp.id && Math.max(Math.abs(x - ux), Math.abs(y - uy)) <= 1) mdam *= 2;
          // resisting the opposite of fire or cold makes it worse
          const res = ctx.defs.monster(mtmp.def).resists;
          if (res.includes('cold') && adtyp === 'fire') mdam *= 2;
          else if (res.includes('fire') && adtyp === 'cold') mdam *= 2;
          if (mhp) mhp.cur -= mdam + itemdmg;
        }
        if (mhp && mhp.cur < 1) {
          if (!monMoving)
            killedByHero(ctx, mtmp); // xkilled(XKILL_GIVEMSG)
          else monkilled(ctx, mtmp.id, true); // monkilled(mtmp, "", adtyp)
        } else if (!monMoving) setmangry(ctx, mtmp.id);
        if (ctx.state.gameOver) return;
      }
    }
  }

  // do your injury last
  if (uhurt) {
    // the messages after "You are caught in ..." decide between "It is fatal." and "The X is..."
    let later = 0;
    const counting = Object.create(ctx) as Ctx;
    counting.emit = (e: GameEvent): void => {
      later++;
      ctx.emit(e);
    };
    say(ctx, 'explode.you_caught', { what: strMsg });
    if (adtyp === 'fire') {
      erodeArmor(counting, h.id, 'burn'); // burnarmor()
      igniteItems(counting, h.id);
    }
    destroyAny(counting, h.id, adtyp, dam);
    if (ctx.state.gameOver) return;
    const hp = h.c.hp;
    if (uhurt === 2 && hp) {
      hp.cur -= damu;
      ctx.interrupt();
    }
    if (hp && hp.cur <= 0 && upolyd(ctx.state)) {
      rehumanize(ctx);
      if (ctx.state.gameOver) return;
    } else if (hp && hp.cur <= 0) {
      say(ctx, later ? 'explode.the_x_fatal' : 'explode.fatal', { what: strMsg });
      const killer = monExpl
        ? generic
          ? '@killer.explode.mon_unseen'
          : `@killer.explode.mon.${(src.mon ?? '').replace(/^.*:/, '')}`
        : wand
          ? `@killer.explode.own.${adtyp === 'disn' ? 'death' : adtyp}`
          : generic
            ? '@killer.explode.trap_unseen'
            : '@killer.explode.trap';
      done(ctx, killer);
      if (ctx.state.gameOver) return;
    }
  }

  if (shopdamage.damaged && adtyp !== 'phys') payForDamage(ctx, rayDmgstr(AD_RAY[adtyp]), false);

  // explosions are noisy
  let noise = dam * dam;
  if (noise < 50) noise = 50; // in case random damage is very small
  wakeNearto(ctx, x, y, noise);
}

/** The look of a monster's explosion. ref: src/explode.c adtyp_to_expltype() */
const MON_EXPLTYPE: Readonly<Record<NonNullable<ExplSource['ad']>, ExplType>> = {
  phys: 'noxious', // gas spore
  fire: 'fiery',
  cold: 'frosty',
  elec: 'magical', // "there currently isn't an electric explosion type"
};

/**
 * A monster explodes in a real explosion (a gas spore dying, or a sphere's AT_EXPL attack): it
 * dies first (mondead(), no corpse) so it is not caught in its own blast, then explode() centred
 * on its square with C's damage: d(damn, damd), or d(level + 1, damd) when damn is 0.
 * `byHero`: C's `!context.mon_moving` (her kill set off the gas spore: she gets the credit for
 * what the blast kills). ref: src/explode.c mon_explodes() (no shapeshifters)
 */
export function monExplodes(
  ctx: Ctx,
  monDef: DefId,
  at: { level: string; x: number; y: number },
  atk: AttackDef,
  byHero: boolean,
  monId?: number,
): void {
  const def = ctx.defs.monster(monDef);
  const dmg = atk.n ? ctx.rng.d(atk.n, atk.d) : atk.d ? ctx.rng.d(def.level + 1, atk.d) : 0;
  const ad = atk.ad === 'fire' || atk.ad === 'cold' || atk.ad === 'elec' ? atk.ad : 'phys';
  // kill it now so it won't appear to be caught in its own explosion
  if (monId !== undefined) mondead(ctx, monId);
  if (at.level !== ctx.state.currentLevel) return;
  explode(
    ctx,
    at.x,
    at.y,
    { mon: monDef, ad, by: byHero ? 'hero' : 'other' },
    dmg,
    MON_EXPLTYPE[ad],
  );
}

// ref: src/mon.c corpse_chance(): "Gas spores always explode upon death" (the AT_BOOM attack)
setDeathExplosion((ctx, def, at, byHero, swallower) => {
  const atk = def.attacks.find((a) => a.at === 'boom');
  if (!atk) return;
  const magr = swallower === null ? undefined : ctx.state.entities[String(swallower)];
  if (!magr?.c.monster) {
    monExplodes(ctx, def.id, at, atk, byHero);
    return;
  }
  // a gas spore exploding inside an engulfer: suppress the usual explosion since it's contained
  // (the hero as the engulfer is 7f's polymorph)
  const tmp = atk.n ? ctx.rng.d(atk.n, atk.d) : atk.d ? ctx.rng.d(def.level + 1, atk.d) : 0;
  say(ctx, 'explode.hear_explosion');
  const hp = magr.c.hp;
  if (hp) hp.cur -= tmp;
  const spotted = canSpotMon(ctx, magr);
  const seen = !!magr.c.pos && heroSees(ctx, magr.c.pos);
  const name = monNam(ctx, magr);
  if (!hp || hp.cur < 1) {
    mondied(ctx, magr.id);
    if (spotted) say(ctx, 'explode.rips_open', { mon: name });
  } else if (seen) say(ctx, 'explode.indigestion', { mon: name });
});
