// Monster attacks on the hero: damage and the special damage types, gazes and explosions.
// ref: src/mhitu.c hitmu(), mdamageu(), magic_negation(), gazemu(), explmu(); src/uhitm.c
// mhitm_adtyping() (the `mdef == &gy.youmonst` branches live in adtyping.ts)
import {
  cellRules,
  getPlayer,
  inventoryOf,
  type AttackDef,
  type Ctx,
  type Entity,
  type Msg,
} from '@nh/core';
import { done } from './end';
import { xkilledStoned } from './stoning';
import { M_ATTK, canBlnd, diseasemu, mhitmAdtyping, newMhm, resistsBlnd } from './adtyping';
import { digests, enfolds, flaming, isSwallowed, setUswallow, uswallow } from './engulfstate';
import { engulfTarget, expels } from './engulf';
import { setUstuck } from './hackmove';
import { snuffLit } from './light';
import { findAc } from './stats';
import { setMtrapped, setUtrap, utrap } from './trapstate';
import { drainEn } from './uenergy';
import { blockersOf } from './boulder';
import { unaware } from './btrapped';
import { clearPath } from './clearpath';
import { stopOccupation } from './eat';
import { erodeArmor, destroyItems } from './erode';
import { monExplodes } from './explode';
import { igniteItems } from './light';
import { mondead } from './mondeath';
import { isCancelled, isMConfused, isMStunned, mcansee, mspecUsed, setMspecUsed } from './mstate';
import { wakeNearto } from './noise';
import { monNam } from './perception';
import { discover } from './o_init';
import { canseemon, monVisible } from './invis';
import {
  P,
  hasExtrinsic,
  hasProp,
  incrItimeout,
  makeBlinded,
  makeConfused,
  makeHallucinated,
  makeStunned,
  timeoutLeft,
} from './props';

export { magicNegation, mgcAtkNegated } from './adtyping';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * A monster hit the hero for `n` points of damage: she dies at 0 HP.
 * ref: src/mhitu.c mdamageu() -> src/end.c done_in_by(). `killer` is the death reason (a
 * message key such as '@nh:newt').
 */
export function mdamageu(ctx: Ctx, n: number, killer: string): void {
  if (ctx.state.gameOver) return;
  const hero = getPlayer(ctx.state);
  const hp = hero.c.hp;
  if (!hp) return;
  hp.cur -= n;
  // caller might have reduced uhpmax before calling mdamageu()
  if (hp.cur > hp.max) hp.cur = hp.max;
  if (hp.cur < 1) {
    say(ctx, 'combat.you_die');
    done(ctx, killer);
  }
}

/**
 * The effect of the attack's damage type on the hero; returns the damage left to apply. The
 * "hits!" message has already been given (adtyping.ts NO_HITMSG lists the types that give none).
 * The hero may die inside (instadeath poison): check `ctx.state.gameOver` afterwards.
 * ref: src/uhitm.c mhitm_adtyping() with `mdef == &gy.youmonst` (see adtyping.ts)
 */
export function hitmuAd(ctx: Ctx, mon: Entity, atk: AttackDef, damage: number): number {
  const mhm = newMhm(damage);
  mhitmAdtyping(ctx, mon.id, atk, ctx.state.playerId, mhm);
  return mhm.damage;
}

const acurr = (ctx: Ctx, a: 'con'): number => getPlayer(ctx.state).c.attributes?.[a] ?? 10;

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/** couldsee(mx, my): a clear line from the hero to the monster, lit or not. ref: src/vision.c */
function couldsee(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !hp || !level || hp.level !== p.level) return false;
  const opaque = cellRules(level, ctx.defs).opaque;
  return clearPath(level, opaque, hp.x, hp.y, p.x, p.y, blockersOf(ctx, level.id));
}

/**
 * A monster gazes at the hero (next to her or at range): she has to see its gaze to be affected.
 * Confusion and stun (both use up the monster's special ability, `mspec_used`), blinding
 * radiance (which also stuns her briefly) and the pyrolisk's fiery gaze (burnt armor, burnt
 * items, fire resistance); a cancelled monster, or one gazing at a hallucinating (3 times in 4)
 * or unconscious hero, only "looks confused" (puzzled, irritated...). Always a miss for the
 * attack sequence. Medusa's gaze turns her to stone unless she cannot see it or resists (an
 * amulet of reflection turns it back on Medusa). ref: src/mhitu.c gazemu(). Not ported: the
 * AD_SLEE and AD_SLOW gazes (C compiles them only with PM_BEHOLDER,
 * which 3.7 does not define), the monster's memory of her resistances (m_seenres()).
 */
export function gazemu(ctx: Ctx, mon: Entity, atk: AttackDef): number {
  const hero = getPlayer(ctx.state);
  const seen = canseemon(ctx, mon);
  const mcanseeu = seen && couldsee(ctx, mon) && mcansee(ctx, mon.id);
  let cancelled = isCancelled(ctx, mon.id);
  let already = false;
  let react = -1;
  const name = monNam(ctx, mon);
  const isMedusa = mon.def === 'nh:medusa';
  // ureflects(): only the amulet of reflection reflects here
  const reflectable = hasExtrinsic(hero, P.REFLECTING) && couldsee(ctx, mon) && isMedusa;
  if ((hasProp(hero, P.HALLUC) && ctx.rng.rn2(4) !== 0) || (unaware(ctx) && !reflectable))
    cancelled = true;
  const spec = (): boolean => mcanseeu && mspecUsed(ctx, mon.id) === 0 && ctx.rng.rn2(5) !== 0;
  switch (atk.ad) {
    case 'ston':
      // note: Medusa is the only monster with a stoning gaze
      if (cancelled || !mcansee(ctx, mon.id)) {
        if (!seen) break; // silently
        if (unaware(ctx)) {
          // can't see attacker even though not blind
          react = isMedusa ? 4 : 2; // irritated or puzzled
          break;
        }
        if (isMedusa && hasProp(hero, P.HALLUC) && ctx.rng.rn2(3) === 0)
          say(ctx, 'stone.serpent_cut');
        else
          say(
            ctx,
            isMedusa && isCancelled(ctx, mon.id) && react < 0
              ? 'stone.not_ugly'
              : 'stone.gazes_ineffectually',
            { mon: name },
          );
        break;
      }
      if (reflectable) {
        // hero has line of sight to Medusa and she's not blind
        if (seen) {
          say(ctx, 'reflect.gaze_medallion', { mon: name });
          discover(ctx, 'nh:amulet_of_reflection');
        }
        // (mon_reflects(): monsters wear no reflecting armor here)
        // m_canseeu(): she is never invisible, so Medusa sees her when she can see at all
        if (seen) say(ctx, 'stone.is_turned', { mon: name });
        say(ctx, 'combat.you_kill', { mon: name }); // killed(mtmp): xkilled(XKILL_GIVEMSG)
        xkilledStoned(ctx, mon);
        if (ctx.state.entities[String(mon.id)]?.c.monster) break;
        return M_ATTK.AGR_DIED;
      }
      if (seen && couldsee(ctx, mon) && !hasProp(hero, P.STONE_RES) && !unaware(ctx)) {
        say(ctx, 'stone.meet_gaze', { mon: name });
        stopOccupation(ctx);
        // (no polymorph into a stone golem: 7f)
        say(ctx, 'stone.you_turn');
        done(ctx, isMedusa ? '@killer.ston.medusa' : `@${mon.def}`, 'stoning');
      }
      break;
    case 'conf':
      if (spec()) {
        if (cancelled) {
          react = 0; // "confused"
          already = isMConfused(ctx, mon.id);
        } else {
          const conf = ctx.rng.d(3, 4);
          setMspecUsed(ctx, mon.id, mspecUsed(ctx, mon.id) + (conf + ctx.rng.rn2(6)));
          if (!hasProp(hero, P.CONFUSION)) say(ctx, 'mhitu.gaze_confuses', { mon: name });
          else say(ctx, 'mhitu.more_confused');
          makeConfused(ctx, timeoutLeft(ctx.state, hero, P.CONFUSION) + conf, false);
          stopOccupation(ctx);
        }
      }
      break;
    case 'stun':
      if (spec()) {
        if (cancelled) {
          react = 1; // "stunned"
          already = isMStunned(ctx, mon.id);
        } else {
          const stun = ctx.rng.d(2, 6);
          setMspecUsed(ctx, mon.id, mspecUsed(ctx, mon.id) + (stun + ctx.rng.rn2(6)));
          say(ctx, 'mhitu.stares_piercingly', { mon: name });
          makeStunned(ctx, timeoutLeft(ctx.state, hero, P.STUNNED) + stun, true);
          stopOccupation(ctx);
        }
      }
      break;
    case 'blnd': {
      const mp = mon.c.pos;
      const hp = hero.c.pos;
      const d2 = mp && hp ? (mp.x - hp.x) ** 2 + (mp.y - hp.y) ** 2 : Infinity;
      if (seen && !resistsBlnd(ctx, hero) && d2 <= BOLT_LIM * BOLT_LIM) {
        if (cancelled) {
          react = 2 + ctx.rng.rn2(2); // "puzzled" || "dazzled"
          already = !mcansee(ctx, mon.id);
          // (Archons: no Archon)
        } else {
          const blnd = ctx.rng.d(atk.n, atk.d);
          say(ctx, 'mhitu.blinded_by_radiance', { mon: name });
          makeBlinded(ctx, blnd, false);
          stopOccupation(ctx);
          // still seeing means the Eyes of the Overworld, which do not exist
          if (hasProp(hero, P.BLINDED)) {
            const oldstun = timeoutLeft(ctx.state, hero, P.STUNNED);
            const newstun = ctx.rng.rnd(3);
            makeStunned(ctx, Math.max(oldstun, newstun), true);
          }
        }
      }
      break;
    }
    case 'fire':
      if (spec()) {
        if (cancelled) {
          react = 4 + ctx.rng.rn2(2); // "irritated" || "inflamed"
        } else {
          let dmg = ctx.rng.d(2, 6);
          const origDmg = dmg;
          const lev = mon.c.monster?.level ?? 0;
          say(ctx, 'mhitu.fiery_gaze', { mon: name });
          stopOccupation(ctx);
          if (hasProp(hero, P.FIRE_RES)) {
            say(ctx, 'mhitu.fire_not_hot');
            dmg = 0; // (ugolemeffects(): no polymorph)
          }
          // burn_away_slime(): no sliming
          if (lev > ctx.rng.rn2(20)) erodeArmor(ctx, hero.id, 'burn'); // burnarmor()
          if (lev > ctx.rng.rn2(20)) {
            destroyItems(ctx, hero.id, 'fire', origDmg);
            igniteItems(ctx, hero.id);
          }
          if (dmg) mdamageu(ctx, dmg, `@${mon.def}`);
        }
      }
      break;
    default:
      break; // impossible("Gaze attack %d?")
  }
  if (react >= 0 && !ctx.state.gameOver) {
    if (hasProp(hero, P.HALLUC) && ctx.rng.rn2(3) !== 0) react = ctx.rng.rn2(8);
    // cancelled/hallucinatory feedback: the monster is not really confused, stunned, ...
    const how =
      ctx.rng.rn2(3) === 0
        ? ''
        : already
          ? '@mhitu.react_quite'
          : ctx.rng.rn2(2) === 0
            ? '@mhitu.react_a_bit'
            : '@mhitu.react_somewhat';
    say(ctx, 'mhitu.looks_react', { mon: name, how, react: `@mhitu.react.${react}` });
  }
  return M_ATTK.MISS;
}

/**
 * A monster explodes next to the hero (it always dies, unless life-saved): a sphere's fire, cold
 * or electricity in a real explosion (mon_explodes()), a yellow light's blinding blast (a long
 * blindness unless she cannot be blinded), a black light's hallucination. "The X explodes!"
 * first; "You seem unaffected by it." when she was not. Wakes monsters within 7 squares.
 * Aimed at a wrong guess (`ufound` false: she is invisible to it), "The X explodes at a spot in
 * thin air!" and she is not affected. ref: src/mhitu.c explmu() (no displacement, artifact
 * defense or polymorph forms)
 */
export function explmu(ctx: Ctx, mon: Entity, atk: AttackDef, ufound: boolean): number {
  if (isCancelled(ctx, mon.id)) return M_ATTK.MISS;
  const hero = getPlayer(ctx.state);
  const at = mon.c.pos ? { ...mon.c.pos } : null;
  let killAgr = true;
  let notAffected = false; // defended(mtmp, adtyp): no artifacts
  const tmp = ctx.rng.d(atk.n, atk.d);
  const name = monNam(ctx, mon);
  if (!ufound)
    say(ctx, canseemon(ctx, mon) ? 'mhitu.explodes_thin_air' : 'mhitu.it_explodes_thin_air', {
      mon: name,
    });
  else say(ctx, 'combat.mon_explodes', { mon: name }); // hitmsg()
  const dead = (): boolean => !ctx.state.entities[String(mon.id)]?.c.monster;
  switch (atk.ad) {
    case 'cold':
    case 'fire':
    case 'elec':
      if (at) monExplodes(ctx, mon.def, at, atk, false, mon.id);
      if (!dead()) killAgr = false; // lifesaving?
      break;
    case 'blnd':
      notAffected = resistsBlnd(ctx, hero);
      if (ufound && !notAffected) {
        // sometimes she's affected even if it's invisible
        const half = Math.trunc(tmp / 2);
        if (monVisible(ctx, mon) || ctx.rng.rnd(half) > (hero.c.experience?.level ?? 1)) {
          say(ctx, 'mhitu.blast_of_light');
          makeBlinded(ctx, monVisible(ctx, mon) ? tmp : half, false);
          // `if (!Blind) Your1(vision_clears)`: no Eyes of the Overworld
        } else say(ctx, 'mhitu.not_terribly_bright');
      }
      break;
    case 'halu':
      // (no polymorphed hero: the black light and violet fungus forms)
      notAffected = notAffected || hasProp(hero, P.BLINDED);
      if (ufound && !notAffected) {
        if (!hasProp(hero, P.HALLUC)) say(ctx, 'mhitu.kaleidoscopic');
        // avoid hallucinating the black light as it dies
        mondead(ctx, mon.id); // remove it from map now
        killAgr = false; // already killed
        const chg = makeHallucinated(ctx, timeoutLeft(ctx.state, hero, P.HALLUC) + tmp, false);
        say(ctx, chg ? 'mhitu.freaked_out' : 'mhitu.seem_unaffected');
      }
      break;
    default:
      break; // impossible("unknown exploder damage type %d")
  }
  if (ctx.state.gameOver) return dead() ? M_ATTK.AGR_DIED : M_ATTK.MISS;
  if (notAffected) say(ctx, 'mhitu.seem_unaffected_by_it'); // (ugolemeffects(): no polymorph)
  if (killAgr && !dead()) mondead(ctx, mon.id);
  if (at) wakeNearto(ctx, at.x, at.y, 7 * 7);
  return dead() ? M_ATTK.AGR_DIED : M_ATTK.MISS;
}

/**
 * The engulfer swallows the hero, or (once she is inside) its engulfing attack works on her. The
 * first gulp moves it onto her square: "The fog cloud engulfs you!" ("swallows you whole" for a
 * digester, "folds itself around you" for an enfolder), she is let out of a trap and her lit
 * objects go out (unless it is flaming), and u.uswldtim is set: for digestion `(Con + 10 - AC +
 * rn2(20)) / level + 3`, else `rnd(level + 5)`, at least 2. Each attack counts it down and does
 * its damage type: total digestion when it runs out ("The purple worm totally digests you!"),
 * being pummeled or laden with moisture, acid, blinding dust, and the elemental vortices' 1 in 2
 * shocks, frost and fire, energy drain; when the time is up she is expelled.
 * ref: src/mhitu.c gulpmu() (no steeds, leashes, ball and chain or polymorphed forms; touching a
 * cockatrice hero is 7f; the boulder-in-pit refusal is not ported; Half_physical_damage and
 * Slow_digestion's ring are the only sources: the latter is checked)
 */
export function gulpmu(ctx: Ctx, mon: Entity, atk: AttackDef): number {
  const hero = getPlayer(ctx.state);
  const pa = ctx.defs.monster(mon.def);
  let tmp = ctx.rng.d(atk.n, atk.d);
  let physical = false;
  if (!isSwallowed(ctx)) {
    // swallows you
    const hp = hero.c.pos;
    const mp = mon.c.pos;
    if (!hp || !mp) return M_ATTK.MISS;
    if (!engulfTarget(ctx, mon, 'hero')) return M_ATTK.MISS;
    // failed_grab(): the hero is never unsolid (no polymorph)
    const from = { x: mp.x, y: mp.y };
    setMtrapped(ctx, mon.id, false); // no longer on old trap
    mon.c.pos = { ...hp };
    ctx.emit({ type: 'moved', id: mon.id, from, to: { x: hp.x, y: hp.y } });
    setUstuck(ctx, mon.id);
    say(
      ctx,
      digests(pa) ? 'engulf.swallows_whole' : enfolds(pa) ? 'engulf.folds' : 'engulf.engulfs',
      {
        mon: monNam(ctx, mon),
      },
    );
    stopOccupation(ctx);
    const t = utrap(ctx);
    if (t) {
      say(ctx, t.type === 'web' ? 'engulf.released_web' : 'engulf.released_trap');
      setUtrap(ctx, 0, t.type);
    }
    // (no leashes; touch_petrifies(youmonst.data) needs polymorph: 7f)
    let tim: number;
    if (atk.ad === 'dgst') {
      // good armor and high constitution make it take longer to be digested
      tim = acurr(ctx, 'con') + 10 - findAc(ctx.state, ctx.defs, hero.id) + ctx.rng.rn2(20);
      if (tim < 0) tim = 0;
      tim = Math.trunc(tim / Math.max(1, mon.c.monster?.level ?? 1));
      tim += 3;
    } else {
      // higher level attacker takes longer to eject hero
      tim = ctx.rng.rnd((mon.c.monster?.level ?? 0) + Math.trunc(10 / 2));
    }
    setUswallow(ctx, { mon: mon.id, tim: tim < 2 ? 2 : tim });
    if (!flaming(pa)) for (const o of inventoryOf(ctx.state, hero.id)) snuffLit(ctx, o);
  }
  const sw = uswallow(ctx);
  if (!sw || sw.mon !== mon.id) return M_ATTK.MISS;
  if (sw.tim > 0) sw.tim -= 1;
  const name = monNam(ctx, mon);
  const mcan = isCancelled(ctx, mon.id);
  switch (atk.ad) {
    case 'dgst':
      physical = true;
      if (hasProp(hero, P.SLOW_DIGESTION)) {
        // messages are handled below
        sw.tim = 0;
        tmp = 0;
      } else if (sw.tim === 0) {
        say(ctx, 'engulf.totally_digests', { mon: name });
        tmp = hero.c.hp?.cur ?? 0;
      } else {
        say(ctx, 'engulf.digests', {
          mon: name,
          how: {
            key:
              sw.tim === 2 ? 'engulf.thoroughly' : sw.tim === 1 ? 'engulf.utterly' : 'engulf.plain',
          },
        });
      }
      break;
    case 'phys':
      physical = true;
      if (mon.def === 'nh:fog_cloud') {
        const breathless = hasProp(hero, P.MAGICAL_BREATHING);
        say(ctx, breathless ? 'engulf.moisture_mild' : 'engulf.moisture');
        if (breathless) tmp = 0;
      } else say(ctx, enfolds(pa) ? 'engulf.squashed' : 'engulf.pummeled');
      break;
    case 'acid':
      if (hasProp(hero, P.ACID_RES)) {
        say(ctx, 'engulf.harmless_goo');
        tmp = 0;
      } else say(ctx, hasProp(hero, P.HALLUC) ? 'engulf.slimed' : 'engulf.slime_burns');
      break;
    case 'blnd':
      if (canBlnd(ctx, mon, hero, atk.at)) {
        if (!hasProp(hero, P.BLINDED)) {
          say(ctx, 'engulf.cant_see');
          makeBlinded(ctx, tmp, false);
        } else incrItimeout(ctx.state, hero, P.BLINDED, 1); // keep him blind until disgorged
      }
      tmp = 0;
      break;
    case 'elec':
      if (!mcan && ctx.rng.rn2(2)) {
        say(ctx, 'engulf.crackles');
        if (hasProp(hero, P.SHOCK_RES)) {
          say(ctx, 'engulf.seem_unhurt');
          tmp = 0;
        }
      } else tmp = 0;
      break;
    case 'cold':
      if (!mcan && ctx.rng.rn2(2)) {
        if (hasProp(hero, P.COLD_RES)) {
          say(ctx, 'engulf.mildly_chilly');
          tmp = 0;
        } else say(ctx, 'engulf.freezing');
      } else tmp = 0;
      break;
    case 'fire':
      if (!mcan && ctx.rng.rn2(2)) {
        if (hasProp(hero, P.FIRE_RES)) {
          say(ctx, 'engulf.mildly_hot');
          tmp = 0;
        } else say(ctx, 'engulf.burning');
        // burn_away_slime(): no sliming
      } else tmp = 0;
      break;
    case 'dise':
      if (!diseasemu(ctx, mon)) tmp = 0;
      break;
    case 'dren':
      // AC magic cancellation doesn't help when engulfed
      if (!mcan && ctx.rng.rn2(4)) drainEn(ctx, tmp, false); // 75% chance
      tmp = 0;
      break;
    default:
      physical = true;
      tmp = 0;
      break;
  }
  if (physical) {
    // same damage reduction for AC as in hitmu
    const ac = findAc(ctx.state, ctx.defs, hero.id);
    if (ac < 0) tmp -= ctx.rng.rnd(-ac);
    if (tmp < 0) tmp = 1;
  }
  mdamageu(ctx, tmp, `@${mon.def}`);
  if (tmp) stopOccupation(ctx);
  if (ctx.state.gameOver) return M_ATTK.HIT;
  const now = uswallow(ctx);
  if (!now) {
    // life-saving has already expelled swallowed hero
  } else if (!now.tim) {
    say(
      ctx,
      digests(pa)
        ? 'engulf.get_regurgitated'
        : enfolds(pa)
          ? 'engulf.get_released'
          : 'engulf.get_expelled',
    );
    if (digests(pa) && hasProp(hero, P.SLOW_DIGESTION))
      say(ctx, 'engulf.doesnt_like_taste', { mon: name });
    expels(ctx, mon, false);
  }
  return M_ATTK.HIT;
}
