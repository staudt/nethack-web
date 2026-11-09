// The polymorphed hero's passive response to a monster's blow (an acid blob form splashes the
// attacker, a floating eye form freezes it), and splitting a polymorphed hero in two.
// ref: src/mhitu.c passiveum(), assess_dmg(), cloneu(); src/potion.c split_mon()
import { golemeffects } from './golemfx';
import {
  getLevel,
  getPlayer,
  type ArmorSlot,
  type AttackDef,
  type Ctx,
  type Entity,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { M_ATTK, drainItem } from './adtyping';
import { acidDamage, erodeArmor } from './erode';
import { monWep, whichArmor } from './mongear';
import { mcansee, paralyzeMonst, isMStunned, setMStunned } from './mstate';
import { monNam } from './perception';
import { P, hasProp } from './props';
import { rehumanize, upolyd } from './upoly';
import { monsterDied } from './mondeath';
import { experienceFor, gainExperience } from './hero';
import { attkProtection, resistsSton } from './stonestate';
import { monPolyWhenStoned, monToStone, xkilledStoned } from './stoning';
import { mnextoPos, makemon } from './generation';
import { initedog } from './dog';
import { heroInvisible, perceives } from './invis';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const resists = (ctx: Ctx, mon: Entity, mr: string): boolean =>
  ctx.defs.monster(mon.def).resists.includes(mr);

const alive = (ctx: Ctx, mon: Entity): boolean =>
  ctx.state.entities[String(mon.id)]?.c.monster !== undefined;

/** xkilled(mtmp, XKILL_NOMSG): the hero gets the kill (alignment, luck, experience). */
function xkilledNoMsg(ctx: Ctx, mon: Entity): void {
  const level = mon.c.monster?.level ?? 0;
  const def = ctx.defs.monster(mon.def);
  monsterDied(ctx, mon.id, true);
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/** "The jackal dies!" when the counterattack kills it. ref: src/mhitu.c assess_dmg() */
function assessDmg(ctx: Ctx, mon: Entity, tmp: number): number {
  const hp = mon.c.hp;
  if (!hp) return M_ATTK.HIT;
  hp.cur -= tmp;
  if (hp.cur <= 0) {
    say(ctx, 'passiveum.dies', { mon: monNam(ctx, mon) });
    xkilledNoMsg(ctx, mon);
    return alive(ctx, mon) ? M_ATTK.HIT : M_ATTK.AGR_DIED;
  }
  return M_ATTK.HIT;
}

/**
 * The hero's form, `olduasmon` (the form she had when the blow landed: a fatal blow may already
 * have returned her to human form), answers the monster's attack `mattk` with its passive
 * (AT_NONE) attack, or its AT_BOOM explosion. Acid, petrification and disenchantment work even
 * then; the rest only while she is still a monster, 2 times in 3: a floating eye form's gaze
 * (127 turns 1 time in 4) or a gelatinous cube's touch paralyses, a brown mold or blue jelly
 * chills (and the cold makes her stronger, maybe splitting her in two), a yellow mold stuns, a
 * red mold burns, a gas spore form explodes ("You explode!") and she returns to human form.
 * Returns M_ATTK flags (AGR_DIED: the attacker died; AGR_DONE: it was frozen).
 * ref: src/mhitu.c passiveum() (no reflecting monsters: mon_reflects();
 * no shieldeff display)
 */
export function passiveum(ctx: Ctx, olduasmon: MonsterDef, mtmp: Entity, mattk: AttackDef): number {
  const ouatk = olduasmon.attacks.find((a) => a.at === 'passive' || a.at === 'boom');
  if (!ouatk) return M_ATTK.HIT;
  let tmp: number;
  if (ouatk.n) tmp = ctx.rng.d(ouatk.n, ouatk.d);
  else if (ouatk.d) tmp = ctx.rng.d(olduasmon.level + 1, ouatk.d);
  else tmp = 0;
  const name = monNam(ctx, mtmp);

  // These affect the enemy even if you were "killed" (rehumanized)
  switch (ouatk.ad) {
    case 'acid':
      if (!ctx.rng.rn2(2)) {
        // "your acid" looks strange right after she was told she reverted to normal form
        say(ctx, upolyd(ctx.state) ? 'passiveum.splashed_your' : 'passiveum.splashed', {
          mon: name,
        });
        if (resists(ctx, mtmp, 'acid')) {
          say(ctx, 'passiveum.not_affected', { mon: name });
          tmp = 0;
        }
      } else tmp = 0;
      if (!ctx.rng.rn2(30)) erodeArmor(ctx, mtmp.id, 'corrode');
      if (!ctx.rng.rn2(6)) acidDamage(ctx, monWep(ctx, mtmp.id));
      return assessDmg(ctx, mtmp, tmp);
    case 'ston': {
      // cockatrice: a wielded weapon gives the same protection as gloves here
      const protector = attkProtection(mattk.at);
      const worn = (slot: ArmorSlot): boolean =>
        (slot === 'gloves' && monWep(ctx, mtmp.id) !== null) ||
        whichArmor(ctx, mtmp.id, slot) !== null;
      const unprotected =
        protector !== 'never' && (protector.length === 0 || protector.some((s) => !worn(s)));
      if (!resistsSton(ctx, mtmp) && unprotected) {
        if (monPolyWhenStoned(ctx, mtmp)) {
          monToStone(ctx, mtmp);
          return M_ATTK.HIT;
        }
        say(ctx, 'passiveum.turns_to_stone', { mon: name });
        xkilledStoned(ctx, mtmp);
        return alive(ctx, mtmp) ? M_ATTK.HIT : M_ATTK.AGR_DIED;
      }
      return M_ATTK.HIT;
    }
    case 'ench': {
      // KMH -- remove enchantment (disenchanter); by_you: the hero's fault. No message.
      const w = monWep(ctx, mtmp.id);
      if (w) drainItem(ctx, w, true);
      return M_ATTK.HIT;
    }
    default:
      break;
  }
  if (!upolyd(ctx.state)) return M_ATTK.HIT;

  // These affect the enemy only if you are still a monster
  if (ctx.rng.rn2(3)) {
    switch (ouatk.ad) {
      case 'phys':
        if (ouatk.at === 'boom') {
          say(ctx, 'uhitm.you_explode');
          // KMH, balance patch -- this is okay with unchanging
          rehumanize(ctx);
          return assessDmg(ctx, mtmp, tmp);
        }
        break;
      case 'plys': // Floating eye
        if (tmp > 127) tmp = 127;
        if (olduasmon.id === 'nh:floating_eye') {
          if (!ctx.rng.rn2(4)) tmp = 127;
          if (
            mcansee(ctx, mtmp.id) &&
            !ctx.defs.monster(mtmp.def).flags.includes('noeyes') && // haseyes()
            ctx.rng.rn2(3) &&
            (perceives(ctx.defs.monster(mtmp.def)) || !heroInvisible(ctx.state))
          ) {
            if (hasProp(getPlayer(ctx.state), P.BLINDED)) {
              say(ctx, 'passiveum.blind_cannot_defend', { mon: `@${olduasmon.id}` });
            } else {
              // (mon_reflects(): no monster reflects here)
              say(ctx, 'passiveum.frozen_by_gaze', { mon: name });
              paralyzeMonst(ctx, mtmp.id, tmp);
              return M_ATTK.AGR_DONE;
            }
          }
        } else {
          // gelatinous cube
          say(ctx, 'passiveum.frozen_by_you', { mon: name });
          paralyzeMonst(ctx, mtmp.id, tmp);
          return M_ATTK.AGR_DONE;
        }
        return M_ATTK.HIT;
      case 'cold': {
        // Brown mold or blue jelly
        if (resists(ctx, mtmp, 'cold')) {
          say(ctx, 'passiveum.mildly_chilly', { mon: name });
          golemeffects(ctx, mtmp, 'cold', tmp);
          tmp = 0;
          break;
        }
        say(ctx, 'passiveum.very_cold', { mon: name });
        const hp = getPlayer(ctx.state).c.hp;
        if (hp) {
          hp.cur += Math.trunc((tmp + ctx.rng.rn2(2)) / 2);
          if (hp.max < hp.cur) hp.max = hp.cur;
          if (hp.max > (olduasmon.level + 1) * 8) splitU(ctx, olduasmon, mtmp);
        }
        break;
      }
      case 'stun': // Yellow mold
        if (!isMStunned(ctx, mtmp.id)) {
          setMStunned(ctx, mtmp.id, true);
          say(ctx, 'passiveum.staggers', { mon: name });
        }
        tmp = 0;
        break;
      case 'fire': // Red mold
        if (resists(ctx, mtmp, 'fire')) {
          say(ctx, 'passiveum.mildly_warm', { mon: name });
          golemeffects(ctx, mtmp, 'fire', tmp);
          tmp = 0;
          break;
        }
        say(ctx, 'passiveum.very_hot', { mon: name });
        break;
      case 'elec':
        if (resists(ctx, mtmp, 'elec')) {
          say(ctx, 'passiveum.slightly_tingled', { mon: name });
          golemeffects(ctx, mtmp, 'elec', tmp);
          tmp = 0;
          break;
        }
        say(ctx, 'passiveum.jolted', { mon: name });
        break;
      default:
        tmp = 0;
        break;
    }
  } else tmp = 0;
  return assessDmg(ctx, mtmp, tmp);
}

/**
 * The polymorphed hero splits in two from the attacker's heat: a tame copy of her form beside her
 * takes half her hit points and half her maximum ("You multiply from its heat!").
 * ref: src/potion.c split_mon() with the hero, src/mhitu.c cloneu() (no names: the copy is not
 * christened; no extinction)
 */
export function splitU(ctx: Ctx, form: MonsterDef, attacker: Entity | null): Entity | null {
  const h = getPlayer(ctx.state);
  const hp = h.c.hp;
  const pos = h.c.pos;
  if (!hp || !pos) return null;
  if (hp.cur > hp.max) hp.cur = hp.max; // sanity precaution
  if (hp.cur <= 1) return null;
  const at = mnextoPos(ctx, getLevel(ctx.state, pos.level), null, pos);
  const id = at ? makemon(ctx, form, at, { noInventory: true, nogroup: true }) : null;
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  if (!mon?.c.monster || !mon.c.hp) return null;
  initedog(ctx, mon.id, true);
  mon.c.monster.level = form.level;
  mon.c.hp.max = hp.max;
  mon.c.hp.cur = Math.trunc(hp.cur / 2);
  hp.cur -= mon.c.hp.cur;
  // split_mon(): the copy takes half the maximum
  mon.c.hp.max = Math.trunc(hp.max / 2);
  hp.max -= mon.c.hp.max;
  if (attacker) say(ctx, 'passiveum.multiply_from', { mon: monNam(ctx, attacker) });
  else say(ctx, 'passiveum.multiply');
  return mon;
}
