// Passive attacks: what a monster does to the hero when she hits or misses it in melee.
// ref: src/uhitm.c passive() (called from hitum() after every melee attack)
import {
  getPlayer,
  inventoryOf,
  type ArmorSlot,
  type AttackType,
  type Ctx,
  type Entity,
  type EntityId,
  type MonsterDef,
  type Msg,
  type Pos,
} from '@nh/core';
import { erodeArmor, erodeObj, passiveObj } from './erode';
import { mdamageu } from './mhitu';
import { heroSees, whichArmor } from './mongear';
import { nomulNow } from './hunger';
import { P, hasProp, makeStunned } from './props';
import { ureflects } from './reflect';
import { drainItem } from './adtyping';
import { mcansee } from './mstate';
import { changeLuck } from './luck';
import { monNam } from './perception';
import { xnameOf } from './objnam';
import { done } from './end';
import { attkProtection } from './stonestate';
import { uPolyStoneGolem } from './upoly';

/** The attacked monster as it was before the blow (it may be dead and removed afterwards). */
export interface PassiveTarget {
  id: EntityId;
  def: MonsterDef;
  /** m_lev */
  level: number;
  pos: Pos & { level: string };
  /** mcan: it was cancelled (its passive fire and its live responses fail) */
  mcan: boolean;
}

/** uwep: the hero's wielded weapon (passive() reads the global, not its `weapon` argument) */
const uwep = (ctx: Ctx): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon') ?? null;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The attack types whose blow can burn, corrode or rust the weapon (or the gloves). */
const OBJ_ATTACKS: ReadonlySet<AttackType> = new Set(['weapon', 'claw', 'magic', 'touch']);

/**
 * The monster's AT_NONE attack answers the hero's blow. `mhit` says whether she hit it and
 * `malive` whether it survived.
 * `weapon` is what hit it (uwep, or uarmf for a kick, or null bare-handed): fire burns and acid
 * corrodes it (passive_obj(), or the boots one time in six), and an acid splash may corrode
 * armor; the Oracle's magic missiles; a cancelled monster's fire and live responses fail.
 * A rust monster's or black pudding's passive rusts or corrodes the weapon (or the boots of a
 * kick), a disenchanter's drains its enchantment ("Your long sword seems less effective.").
 * A cockatrice's passive turns her to stone when she hit it bare-handed or kicked it barefoot.
 * ref: src/uhitm.c passive(), passive_obj(). Not
 * ported: brown mold splitting (split_mon). A blind floating eye "cannot defend itself".
 */
export function passive(
  ctx: Ctx,
  mon: PassiveTarget,
  mhit: boolean,
  malive: boolean,
  weapon: Entity | null,
  aatyp: AttackType,
  wepWasDestroyed = false,
): void {
  const atk = mon.def.attacks.find((a) => a.at === 'passive');
  if (!atk) return; // no passive attacks
  const hero = getPlayer(ctx.state);
  const killer = `@${mon.def.id}`;
  // the monster may have just died: name it from where it stood
  const shown = monNam(ctx, { id: mon.id, def: mon.def.id, c: { pos: mon.pos } });
  let tmp: number;
  if (atk.n) tmp = ctx.rng.d(atk.n, atk.d);
  else if (atk.d) tmp = ctx.rng.d(mon.level + 1, atk.d);
  else tmp = 0;

  // These affect you even if they just died.
  /** the boots of a kick (1 in 6), or the weapon via passive_obj() */
  const hitObj = (type: 'burn' | 'corrode'): void => {
    if (!weapon) return;
    if (aatyp === 'kick') {
      const uarmf = whichArmor(ctx, hero.id, 'boots');
      if (uarmf && ctx.rng.rn2(6) === 0)
        erodeObj(ctx, uarmf, xnameOf(ctx.state, ctx.defs, uarmf), type, { verbose: true });
    } else if (OBJ_ATTACKS.has(aatyp)) passiveObj(ctx, mon.def.id, weapon, mon.mcan);
  };
  if (atk.ad === 'fire') {
    if (mhit && !mon.mcan) hitObj('burn'); // `mhitb && !mon->mcan && weapon`
  } else if (atk.ad === 'rust' || atk.ad === 'corr') {
    // `mhitb && !mon->mcan && weapon`: the boots of a kick always, else passive_obj()
    if (mhit && !mon.mcan && weapon) {
      const type = atk.ad === 'rust' ? 'rust' : 'corrode';
      if (aatyp === 'kick') {
        const uarmf = whichArmor(ctx, hero.id, 'boots');
        if (uarmf)
          erodeObj(ctx, uarmf, xnameOf(ctx.state, ctx.defs, uarmf), type, { verbose: true });
      } else if (OBJ_ATTACKS.has(aatyp)) passiveObj(ctx, mon.def.id, weapon, mon.mcan);
    }
  } else if (atk.ad === 'ench') {
    // KMH -- remove enchantment (disenchanter): a kick drains the boots; a bare-handed blow the
    // gloves (passive_obj()'s `obj = uarmg`); a bite, butt, sting, hug, engulf or tentacles
    // involve no object
    const noObject =
      aatyp === 'bite' ||
      aatyp === 'butt' ||
      aatyp === 'sting' ||
      aatyp === 'hug' ||
      aatyp === 'spit' ||
      aatyp === 'engulf' ||
      aatyp === 'breath' ||
      aatyp === 'explode' ||
      aatyp === 'boom' ||
      aatyp === 'gaze' ||
      aatyp === 'tentacle';
    if (mhit && !(aatyp === 'kick' && !weapon) && !noObject && !mon.mcan) {
      const obj = weapon ?? whichArmor(ctx, hero.id, 'gloves');
      const it = obj?.c.item;
      if (
        obj &&
        it &&
        drainItem(ctx, obj, true) &&
        it.carriedBy === hero.id &&
        (it.known.spe || ctx.defs.object(obj.def).class === 'armor')
      ) {
        const pl = it.quantity !== 1 ? '_pl' : '';
        say(ctx, `adtyp.less_effective${pl}`, { item: xnameOf(ctx.state, ctx.defs, obj) });
      }
    }
  } else if (atk.ad === 'acid') {
    if (mhit && ctx.rng.rn2(2) !== 0) {
      say(ctx, 'passive.splashed', { mon: shown });
      if (!hasProp(hero, P.ACID_RES)) mdamageu(ctx, tmp, killer);
      if (ctx.state.gameOver) return;
      if (ctx.rng.rn2(30) === 0) erodeArmor(ctx, hero.id, 'corrode');
    }
    if (mhit) hitObj('corrode');
    if (ctx.state.gameOver) return;
  } else if (atk.ad === 'ston') {
    // a bare-handed blow without gloves, a kick without boots, a bite... touches the cockatrice
    if (mhit) {
      // hero using monsters' AT_MAGC attack is hitting hand to hand rather than casting a spell
      const protector: readonly ArmorSlot[] | 'never' =
        aatyp === 'magic' ? ['gloves'] : attkProtection(aatyp);
      const worn = (slot: ArmorSlot): boolean => whichArmor(ctx, hero.id, slot) !== null;
      const unprotected =
        protector !== 'never' &&
        (protector.length === 0 ||
          (protector.length === 1 && protector[0] === 'gloves'
            ? !worn('gloves') && !uwep(ctx) && !wepWasDestroyed
            : protector.some((slot) => !worn(slot))));
      if (unprotected && !hasProp(hero, P.STONE_RES) && !uPolyStoneGolem(ctx)) {
        // done_in_by(mon, STONING): "You turn to stone..."
        say(ctx, 'stone.you_turn');
        done(ctx, killer, 'stoning');
        return;
      }
    }
  } else if (atk.ad === 'magm') {
    // wrath of gods for attacking Oracle (no shieldeff or monstseesu here)
    if (hasProp(hero, P.ANTIMAGIC)) say(ctx, 'passive.magm_miss');
    else {
      say(ctx, 'passive.magm_hit');
      mdamageu(ctx, tmp, killer);
    }
    if (ctx.state.gameOver) return;
  }

  // These only affect you if they still live.
  if (!malive || mon.mcan || ctx.rng.rn2(3) === 0) return;
  switch (atk.ad) {
    case 'plys':
      if (mon.def.id === 'nh:floating_eye') {
        if (!heroSees(ctx, mon.pos)) break; // !canseemon(mon)
        if (!mcansee(ctx, mon.id)) {
          say(ctx, 'passive.blind_cannot_defend', { mon: shown });
          if (!ctx.rng.rn2(500)) changeLuck(ctx, -1);
          break;
        }
        // ref: src/muse.c ureflects()
        if (ureflects(ctx, 'reflect.gaze', { mon: shown })) break;
        if (hasProp(hero, P.FREE_ACTION)) {
          say(ctx, 'free_action.stiffen_gaze', { mon: shown });
          break;
        }
        say(ctx, 'passive.frozen_gaze', { mon: shown });
        // Wis > 12 || rn2(4): otherwise it paralyzes for 127 turns
        const turns = (hero.c.attributes?.wis ?? 10) > 12 || ctx.rng.rn2(4) !== 0 ? tmp : 127;
        nomulNow(ctx, turns, 'helpless.frozen_gaze', { key: 'eat.can_move_again' });
      } else {
        // gelatinous cube
        if (hasProp(hero, P.FREE_ACTION)) {
          say(ctx, 'free_action.stiffen');
          break;
        }
        say(ctx, 'passive.frozen', { mon: shown });
        nomulNow(ctx, tmp, 'helpless.frozen', { key: 'eat.can_move_again' });
      }
      break;
    case 'cold': // brown mold or blue jelly
      if (hasProp(hero, P.COLD_RES)) {
        say(ctx, 'passive.mild_chill');
        break;
      }
      say(ctx, 'passive.very_cold');
      mdamageu(ctx, tmp, killer);
      {
        // monster gets stronger with your heat! ref: src/mon.c healmon(mon, amt, overheal)
        const amt = Math.trunc((tmp + ctx.rng.rn2(2)) / 2);
        const overheal = Math.trunc((tmp + 1) / 2);
        const hp = ctx.state.entities[String(mon.id)]?.c.hp;
        if (hp) {
          if (hp.cur + amt > hp.max + overheal) {
            hp.max += overheal;
            hp.cur = hp.max;
          } else {
            hp.cur += amt;
            if (hp.cur > hp.max) hp.max = hp.cur;
          }
        }
        // at a certain point, the monster will reproduce (split_mon): not ported
      }
      break;
    case 'stun': // specifically yellow mold
      if (!hasProp(hero, P.STUNNED)) makeStunned(ctx, tmp, true);
      break;
    case 'fire':
      if (hasProp(hero, P.FIRE_RES)) {
        say(ctx, 'passive.mildly_warm');
        break;
      }
      say(ctx, 'passive.very_hot');
      mdamageu(ctx, tmp, killer);
      break;
    case 'elec':
      if (hasProp(hero, P.SHOCK_RES)) {
        say(ctx, 'passive.mild_tingle');
        break;
      }
      say(ctx, 'passive.jolted');
      mdamageu(ctx, tmp, killer);
      break;
    default:
      break;
  }
}
