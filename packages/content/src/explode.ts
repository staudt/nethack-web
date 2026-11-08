// Explosions: the 3x3 blast of a broken wand or of a magical trap set off by cancellation or
// digging. ref: src/explode.c explode(), explosionmask()
//
// Below zap.ts and dig.ts (both call it); it must not import them.
// Not ported (see DEVIATIONS.md): engulfing (the hero inside an engulfer), steeds, polymorphed
// heroes (grabbing, ugolemeffects()), golems (golemeffects(), completelyburns()), shields shown
// on resisting targets, hallucinated names, Deafness, Invulnerable, Half_physical_damage,
// slime, exercise(), the monster-explosion and scroll/oil kinds (gas spores, fire scrolls),
// shop damage (pay_for_damage()).
import {
  getPlayer,
  inBounds,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type Level,
  type Msg,
  type RayStep,
} from '@nh/core';
import { killedByHero, resist, resistsMagm, zapOverFloor, type Ray } from './buzz';
import { done } from './end';
import { destroyItems, erodeArmor, type DestroyType } from './erode';
import { ustuck } from './hackmove';
import { igniteItems } from './light';
import { nonliving } from './mondata';
import { monkilled } from './mondeath';
import { heroSees } from './mongear';
import { wakeNearto } from './noise';
import { monNam } from './perception';
import { setmangry, wakeup } from './peaceful';
import { P, hasProp } from './props';

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
 * What exploded: a broken wand (`wand`: its type, C's `-(otyp)` with WAND_CLASS) or a magical
 * trap (C's TRAP_EXPLODE: a generic magical blast). `by: 'hero'` is C's `!context.mon_moving`:
 * she gets the kills (and the blame); 'other' kills as another monster would.
 */
export interface ExplSource {
  wand?: DefId;
  trap?: true;
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

type Adtyp = 'magm' | 'fire' | 'cold' | 'disn' | 'elec';
const ADTYP: readonly (Adtyp | null)[] = ['magm', 'fire', 'cold', null, 'disn', 'elec'];
/** The ray whose floor effects the blast has (zap_over_floor()'s damgtype). */
const AD_RAY: Readonly<Record<Adtyp, Ray>> = {
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
  const adtyp = ADTYP[type % 10];
  if (!adtyp) return; // impossible("explosion base type %d?")
  const strKey: Record<Adtyp, string> = {
    magm: 'explode.magical_blast',
    fire: 'explode.fireball',
    cold: 'explode.ball_of_cold',
    disn: wand ? 'explode.death_field' : 'explode.disintegration_field',
    elec: 'explode.ball_of_lightning',
  };
  let str = strKey[adtyp];
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
    if (src.trap) str = 'explode.explosion'; // generic
    say(ctx, 'explode.hear_blast');
    didmsg = true;
  }
  if (!didmsg) say(ctx, 'explode.boom');

  const strMsg: Msg = { key: str };
  let uhurt: 0 | 1 | 2 = 0;
  // apply effects to monsters and floor objects first, in case the damage to the hero is fatal
  if (dam) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const m = mask[i]?.[j];
        if (m === undefined || m === 'skip') continue;
        const xx = x + i - 1;
        const yy = y + j - 1;
        if (xx === ux && yy === uy) uhurt = m === 'shield' ? 1 : 2;
        zapOverFloor(ctx, AD_RAY[adtyp], xx, yy, src.wand ?? '');
        const mtmp = monAt(ctx, level, xx, yy);
        if (!mtmp) continue;
        // zap_over_floor(): the monster there is woken (and angered: the zap type is >= 0)
        wakeup(ctx, mtmp.id);
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
    if (hp && hp.cur <= 0) {
      say(ctx, later ? 'explode.the_x_fatal' : 'explode.fatal', { what: strMsg });
      const killer = wand
        ? `@killer.explode.own.${adtyp === 'disn' ? 'death' : adtyp}`
        : str === 'explode.explosion'
          ? '@killer.explode.trap_unseen'
          : '@killer.explode.trap';
      done(ctx, killer);
      if (ctx.state.gameOver) return;
    }
  }

  // explosions are noisy
  let noise = dam * dam;
  if (noise < 50) noise = 50; // in case random damage is very small
  wakeNearto(ctx, x, y, noise);
}
