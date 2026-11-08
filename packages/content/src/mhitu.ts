// Monster attacks on the hero: damage and the special damage types, gazes and explosions.
// ref: src/mhitu.c hitmu(), mdamageu(), magic_negation(), gazemu(), explmu(); src/uhitm.c
// mhitm_adtyping() (the `mdef == &gy.youmonst` branches live in adtyping.ts)
import { cellRules, getPlayer, type AttackDef, type Ctx, type Entity, type Msg } from '@nh/core';
import { done } from './end';
import { M_ATTK, mhitmAdtyping, newMhm, resistsBlnd } from './adtyping';
import { blockersOf } from './boulder';
import { unaware } from './btrapped';
import { clearPath } from './clearpath';
import { stopOccupation } from './eat';
import { erodeArmor, destroyItems } from './erode';
import { monExplodes } from './explode';
import { igniteItems } from './light';
import { mondead } from './mondeath';
import { heroSees } from './mongear';
import { isCancelled, isMConfused, isMStunned, mcansee, mspecUsed, setMspecUsed } from './mstate';
import { wakeNearto } from './noise';
import { monNam } from './perception';
import {
  P,
  hasProp,
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

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/** canseemon(): the monster's square is in view (there is no invisibility here) */
const canseemon = (ctx: Ctx, mon: Entity): boolean => !!mon.c.pos && heroSees(ctx, mon.c.pos);

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
 * attack sequence. ref: src/mhitu.c gazemu(). Not ported: Medusa's stoning gaze and its
 * reflection (step 6), the AD_SLEE and AD_SLOW gazes (C compiles them only with PM_BEHOLDER,
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
  const reflectable = false; // Reflecting && couldsee && is_medusa (step 6)
  if ((hasProp(hero, P.HALLUC) && ctx.rng.rn2(4) !== 0) || (unaware(ctx) && !reflectable))
    cancelled = true;
  const spec = (): boolean => mcanseeu && mspecUsed(ctx, mon.id) === 0 && ctx.rng.rn2(5) !== 0;
  switch (atk.ad) {
    case 'ston':
      break; // Medusa (step 6)
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
 * ref: src/mhitu.c explmu() (`ufound` is always true: no displacement; no artifact defense,
 * no polymorph forms)
 */
export function explmu(ctx: Ctx, mon: Entity, atk: AttackDef, ufound: boolean): number {
  if (isCancelled(ctx, mon.id)) return M_ATTK.MISS;
  const hero = getPlayer(ctx.state);
  const at = mon.c.pos ? { ...mon.c.pos } : null;
  let killAgr = true;
  let notAffected = false; // defended(mtmp, adtyp): no artifacts
  const tmp = ctx.rng.d(atk.n, atk.d);
  const name = monNam(ctx, mon);
  if (ufound) say(ctx, 'combat.mon_explodes', { mon: name }); // hitmsg()
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
        // `mon_visible(mtmp) || rnd(tmp /= 2) > u.ulevel`: no monster is invisible, so the
        // roll for an invisible one ("You get the impression it was not terribly bright.") is
        // never reached
        say(ctx, 'mhitu.blast_of_light');
        makeBlinded(ctx, tmp, false);
        // `if (!Blind) Your1(vision_clears)`: no Eyes of the Overworld
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
