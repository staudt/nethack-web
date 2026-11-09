// Fighting as a monster: the polymorphed hero attacks with each of her form's attacks (weapon,
// claw, bite, kick, butt, touch, sting, tentacles, hug, explosion, engulfing), each through the
// damage-type functions of adtyping.ts, and the target's passive answers each one.
// ref: src/uhitm.c hmonas(), damageum(), explum(), gulpum(), start_engulf(), steal_it();
// src/dokick.c kick_monster()'s polymorphed branch
import { golemeffects } from './golemfx';
import {
  getPlayer,
  type AttackDef,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import {
  M_ATTK,
  failedGrab,
  mhitmAdtyping,
  newMhm,
  resistsBlnd,
  sticks,
  xdrainenergym,
  resetSkipdrin,
  skipsDrin,
} from './adtyping';
import { makeSlimed } from './slimestate';
import {
  findRollToHit,
  heroWeapon,
  knownHitum,
  missum,
  passiveSnap,
  setHmonas,
  uwepOf,
} from './combat';
import { passive, type PassiveTarget } from './uhitm_passive';
import { heroForm, rehumanize, upolyd } from './upoly';
import { cantwield } from './mondata';
import { isSwallowed } from './engulfstate';
import { couldSeduce, findgold, isNymph } from './steal';
import { canSpotMon, monNam } from './perception';
import { wakeup } from './peaceful';
import { mtrappedInPit } from './trapstate';
import { whichArmor, minvent } from './mongear';
import { killedByHero } from './buzz';
import { explode, MON_EXPLTYPE } from './explode';
import { wakeNearto } from './noise';
import { mblinded, mcansee, setMConfused, setMblinded } from './mstate';
import { mdamageu } from './mhitu';
import { P, hasProp } from './props';
import { hungerData, newuhs, nomulNow } from './hunger';
import { setAfternmv } from './nomul';
import { nhData, removeFromInventory } from './items';
import { cpostfxOf } from './givit';
import { corpseChanceSwallowed } from './corpses';
import { digests, enfolds, flaming } from './engulfstate';
import { engulfTarget } from './engulf';
import { snuffLit } from './light';
import { touchPetrifies } from './stonestate';
import { instapetrify } from './stonetouch';
import { holdAnotherObject } from './wish';
import { possiblyUnwield } from './were';
import { doname } from './objnam';
import { heroFemale } from './gender';
import { ustuck } from './hackmove';
import { monsterDied } from './mondeath';
import { experienceFor, gainExperience } from './hero';
import { isFrozen } from './mstate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const ent = (ctx: Ctx, id: EntityId): Entity | undefined => ctx.state.entities[String(id)];

const alive = (ctx: Ctx, id: EntityId): boolean => ent(ctx, id)?.c.monster !== undefined;

/** The verb of a weaponless hit ("You bite the jackal."). ref: hmonas() */
const VERB: Partial<Record<AttackDef['at'], string>> = {
  claw: 'hit', // not "claws"
  touch: 'touch',
  kick: 'kick',
  butt: 'butt',
  bite: 'bite',
  sting: 'sting',
};

/**
 * One of the form's attacks hit: its dice, then the damage type's effect (adtyping.ts, the
 * hero's branch), then the damage; "You kill the jackal!" when it dies ("You feel embarrassed for
 * a moment." for a pet she can't see). Returns M_ATTK flags. ref: src/uhitm.c damageum() (no
 * demon forms summon: demonpet() needs a demon the hero can turn into, and the roster's only
 * demon cannot be polymorphed into; no Trollsbane)
 */
export function damageum(ctx: Ctx, mdef: Entity, mattk: AttackDef, specialdmg: number): number {
  const mhm = newMhm(ctx.rng.d(mattk.n, mattk.d));
  mhm.specialdmg = specialdmg;
  mhitmAdtyping(ctx, ctx.state.playerId, mattk, mdef.id, mhm, {
    vis: true,
    mwep: uwepOf(ctx),
    uStealIt: stealIt,
  });
  if (mhm.done) return mhm.hitflags;
  // (DEADMONSTER(mdef) and !mhm.damage => already killed)
  if (!alive(ctx, mdef.id)) return M_ATTK.DEF_DIED;
  const hp = mdef.c.hp;
  if (!hp) return M_ATTK.HIT;
  hp.cur -= mhm.damage;
  if (hp.cur < 1) {
    const tame = (mdef.c.monster?.tame ?? 0) > 0;
    if (tame && !canSpotMon(ctx, mdef)) {
      say(ctx, 'uhitm.embarrassed');
      if (mhm.damage) killedByHeroQuietly(ctx, mdef);
    } else if (mhm.damage) killedByHero(ctx, mdef); // regular "you kill <mdef>" message
    return M_ATTK.DEF_DIED;
  }
  return M_ATTK.HIT;
}

/** xkilled(mdef, XKILL_NOMSG): killedByHero() without its message */
function killedByHeroQuietly(ctx: Ctx, mdef: Entity): void {
  const level = mdef.c.monster?.level ?? 0;
  const def = ctx.defs.monster(mdef.def);
  monsterDied(ctx, mdef.id, true);
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/**
 * The hero, as a form with an exploding attack, explodes at the monster: a light's flash blinds
 * or confuses it, a sphere's fire, cold or lightning is a real explosion around her; the noise
 * wakes the neighbourhood. The caller ends her form. ref: src/uhitm.c explum()
 */
function explum(ctx: Ctx, mdef: Entity, mattk: AttackDef): number {
  const tmp = ctx.rng.d(mattk.n, mattk.d);
  const form = heroForm(ctx);
  const at = getPlayer(ctx.state).c.pos;
  switch (mattk.ad) {
    case 'blnd':
      if (!resistsBlnd(ctx, mdef)) {
        say(ctx, 'uhitm.blinded_by_flash', { mon: monNam(ctx, mdef) });
        setMblinded(ctx, mdef.id, Math.min(mblinded(ctx, mdef.id) + tmp, 127));
      }
      break;
    case 'halu': {
      const eyes = !ctx.defs.monster(mdef.def).flags.includes('noeyes');
      if (eyes && mcansee(ctx, mdef.id)) {
        say(ctx, 'uhitm.affected_by_flash', { mon: monNam(ctx, mdef) });
        setMConfused(ctx, mdef.id, true);
      }
      break;
    }
    case 'cold':
    case 'fire':
    case 'elec':
      // the player is causing the explosion (C's type +20..+29, olet MON_EXPLODE)
      if (at && form)
        explode(
          ctx,
          at.x,
          at.y,
          { mon: form.id, ad: mattk.ad, by: 'hero' },
          tmp,
          MON_EXPLTYPE[mattk.ad],
        );
      // Other monsters may have died too, but return this if the actual target died.
      if (!alive(ctx, mdef.id)) return M_ATTK.DEF_DIED;
      break;
    default:
      break;
  }
  if (at) wakeNearto(ctx, at.x, at.y, 7 * 7); // same radius as exploding monster
  return M_ATTK.HIT;
}

/** ref: src/eat.c Finish_digestion(): the swallowed monster's corpse effects, after digesting */
function finishDigestion(ctx: Ctx): void {
  const d = nhData(ctx);
  const pm = d.corpsenmDigested;
  if (pm === undefined) return;
  delete d.corpsenmDigested;
  if (ctx.defs.isMonster(pm)) cpostfxOf(ctx, ctx.defs.monster(pm));
}
setAfternmv('finish_digestion', finishDigestion);

/**
 * The hero, as an engulfer, swallows the monster for one round: a purple worm form digests it
 * at once (killing it, no corpse, half its nutrition and then helpless while digesting, its
 * corpse's intrinsics at the end), the others pummel, burn, freeze, shock, blind or drain it and
 * expel it again. Engulfing a cockatrice petrifies her. Returns M_ATTK flags (MISS when it was
 * expelled alive). ref: src/uhitm.c gulpum(), start_engulf() (no vampire shapeshifters, Riders,
 * conduct or exercise; no swallow animation)
 */
function gulpum(ctx: Ctx, mdef: Entity, mattk: AttackDef): number {
  const form = heroForm(ctx);
  const hero = getPlayer(ctx.state);
  if (!form) return M_ATTK.MISS;
  let dam = ctx.rng.d(mattk.n, mattk.d);
  const uDigest = digests(form);
  const uEnfold = enfolds(form);
  const pd = ctx.defs.monster(mdef.def);
  const expelVerb = uDigest ? 'regurgitate' : uEnfold ? 'release' : 'expel';
  // Not totally the same as for real monsters: these don't take multiple moves; AD_DGST kills
  // the monster at once, the others regurgitate it after exactly 1 round of attack. -KAA
  if (!engulfTarget(ctx, hero, mdef)) return M_ATTK.MISS;
  const uhunger = hero.c.hunger?.nutrition ?? 0;
  if ((uDigest && uhunger >= 1500) || isSwallowed(ctx)) return M_ATTK.MISS;
  if (!flaming(form)) for (const o of minvent(ctx, mdef.id)) snuffLit(ctx, o);
  const stoneRes = hasProp(hero, P.STONE_RES);
  // engulfing a cockatrice or digesting Medusa
  const fatalGulp =
    (touchPetrifies(pd) && !stoneRes) ||
    (mattk.ad === 'dgst' && pd.id === 'nh:medusa' && !stoneRes);
  if (fatalGulp) {
    say(ctx, uDigest ? 'uhitm.englut' : 'uhitm.engulf_plain', { mon: monNam(ctx, mdef) });
    instapetrify(ctx, `@killer.ston.${uDigest ? 'swallowing' : 'engulfing'}.${pd.id}`);
    return M_ATTK.MISS;
  }
  // start_engulf()
  say(ctx, uDigest ? 'uhitm.swallow' : uEnfold ? 'uhitm.enclose' : 'uhitm.engulf', {
    mon: monNam(ctx, mdef),
  });
  const name = monNam(ctx, mdef);
  switch (mattk.ad) {
    case 'dgst': {
      if (hasProp(hero, P.SLOW_DIGESTION)) {
        dam = 0;
        break;
      }
      // (no amulets of life saving for monsters)
      newuhs(ctx, false);
      const at = mdef.c.pos ? { ...mdef.c.pos } : null;
      killedByHero(ctx, mdef, true); // XKILL_GIVEMSG | XKILL_NOCORPSE
      let tmp = 1 + (pd.weight >> 8);
      if (at && corpseChanceSwallowed(ctx, pd, at, hero.id) && !pd.genFlags.includes('nocorpse')) {
        // nutrition only if there can be a corpse
        if (hero.c.hunger) hero.c.hunger.nutrition += Math.trunc((pd.nutrition + 1) / 2);
      } else tmp = 0;
      const msgbuf: Msg = { key: 'uhitm.totally_digest', params: { mon: name } };
      if (tmp !== 0) {
        say(ctx, 'uhitm.digest', { mon: name });
        // (Slow_digestion doubles it: it never gets here)
        nhData(ctx).corpsenmDigested = pd.id; // possible intrinsic once totally digested
        nomulNow(ctx, tmp, 'helpless.digesting', msgbuf, 'finish_digestion');
      } else say(ctx, msgbuf.key, msgbuf.params);
      // a green slime (no corpse: the "isn't sitting well" line replaces nothing shown)
      if (pd.id === 'nh:green_slime') {
        if (!hasProp(hero, P.UNCHANGING)) makeSlimed(ctx, 5, null);
      } // (else exercise(A_CON, TRUE): no exercise)
      return M_ATTK.DEF_DIED;
    }
    case 'phys':
      if (form.id === 'nh:fog_cloud') {
        say(ctx, 'uhitm.laden_moisture', { mon: name });
        if ((pd.flags.includes('breathless') || pd.flags.includes('amphibious')) && !flaming(pd)) {
          dam = 0;
          say(ctx, 'uhitm.seems_unharmed', { mon: name });
        }
      } else say(ctx, uEnfold ? 'uhitm.being_squashed' : 'uhitm.pummeled', { mon: name });
      break;
    case 'acid':
      say(ctx, 'uhitm.covered_goo', { mon: name });
      if (pd.resists.includes('acid')) {
        say(ctx, 'uhitm.seems_harmless', { mon: name });
        dam = 0;
      }
      break;
    case 'blnd':
      if (canBlndEngulf(ctx, mdef)) {
        if (mcansee(ctx, mdef.id)) say(ctx, 'uhitm.cant_see_in_there', { mon: name });
        dam += mblinded(ctx, mdef.id);
        if (dam > 127) dam = 127;
        setMblinded(ctx, mdef.id, dam);
      }
      dam = 0;
      break;
    case 'elec':
      if (ctx.rng.rn2(2)) {
        say(ctx, 'uhitm.air_crackles', { mon: name });
        if (pd.resists.includes('elec')) {
          say(ctx, 'uhitm.seems_unhurt', { mon: name });
          dam = 0;
        }
        golemeffects(ctx, mdef, 'elec', dam);
      } else dam = 0;
      break;
    case 'cold':
      if (ctx.rng.rn2(2)) {
        if (pd.resists.includes('cold')) {
          say(ctx, 'uhitm.mildly_chilly', { mon: name });
          dam = 0;
        } else say(ctx, 'uhitm.freezing', { mon: name });
        golemeffects(ctx, mdef, 'cold', dam);
      } else dam = 0;
      break;
    case 'fire':
      if (ctx.rng.rn2(2)) {
        if (pd.resists.includes('fire')) {
          say(ctx, 'uhitm.mildly_hot', { mon: name });
          dam = 0;
        } else say(ctx, 'uhitm.burning_crisp', { mon: name });
        golemeffects(ctx, mdef, 'fire', dam);
      } else dam = 0;
      break;
    case 'dren':
      if (!ctx.rng.rn2(4)) xdrainenergym(ctx, mdef, true);
      dam = 0;
      break;
    default:
      break;
  }
  const hp = mdef.c.hp;
  if (hp) hp.cur -= dam;
  if (!hp || hp.cur < 1) {
    killedByHero(ctx, mdef);
    return M_ATTK.DEF_DIED;
  }
  say(ctx, `uhitm.${expelVerb}`, { mon: name });
  if ((hasProp(hero, P.SLOW_DIGESTION) || form.flags.includes('animal')) && uDigest)
    say(ctx, 'uhitm.didnt_like_taste', { mon: name });
  return M_ATTK.MISS;
}

/** can_blnd(&youmonst, mdef, AT_ENGL): an eyed monster that isn't asleep */
const canBlndEngulf = (ctx: Ctx, mdef: Entity): boolean =>
  !ctx.defs.monster(mdef.def).flags.includes('noeyes') &&
  !(!mcansee(ctx, mdef.id) && mblinded(ctx, mdef.id) === 0) &&
  !mdef.c.monster?.asleep;

/** Pronoun params for a monster (monsters have no gender of their own: DEVIATIONS "Theft"). */
function pronouns(ctx: Ctx, mon: Entity): { he: string; He: string; his: string } {
  const f = ctx.defs.monster(mon.def).flags;
  const g = f.includes('female') ? 'f' : f.includes('neuter') ? 'n' : 'm';
  return { he: `@uhitm.pron.he.${g}`, He: `@uhitm.pron.He.${g}`, his: `@uhitm.pron.his.${g}` };
}

/**
 * A nymph form's theft: one item from the monster's inventory (never its gold), or, when she
 * can seduce it and it can move, everything, its suit last ("You seduce the gnome lord and he
 * starts to take off his clothes."). Each item comes to her pack ("You steal: ...") or drops at
 * her feet. ref: src/uhitm.c steal_it() (no artifacts; no cockatrice corpses: theft_petrifies(),
 * mselftouch())
 */
function stealIt(ctx: Ctx, mdef: Entity, mattk: AttackDef): void {
  const gold0 = findgold(ctx, mdef.id);
  const nonGold = (): Entity[] => minvent(ctx, mdef.id).filter((o) => o.id !== gold0?.id);
  if (nonGold().length === 0) return; // nothing to take
  // look for worn body armor
  let ustealo: Entity | null = null;
  if (
    couldSeduce(ctx, getPlayer(ctx.state), mdef, mattk) &&
    !isFrozen(ctx, mdef.id) // mdef->mcanmove
  )
    ustealo = whichArmor(ctx, mdef.id, 'body');
  const gold = gold0;
  if (ustealo) {
    // we will be taking everything
    const form = heroForm(ctx);
    const p = pronouns(ctx, mdef);
    const mfemale = ctx.defs.monster(mdef.def).flags.includes('female');
    if (mfemale === heroFemale(ctx.state) && form && isNymph(form))
      say(ctx, 'uhitm.charm', {
        mon: monNam(ctx, mdef),
        He: p.He,
        his: p.his,
        most: gold ? '@uhitm.most_of' : '',
      });
    else say(ctx, 'uhitm.seduce', { mon: monNam(ctx, mdef), he: p.he, his: p.his });
  }
  for (;;) {
    if (!upolyd(ctx.state)) break; // no longer have ability to steal
    const rest = nonGold();
    // the suit comes last ("move it to end of inventory")
    const otmp = rest.find((o) => o.id !== ustealo?.id) ?? rest[0];
    if (!otmp) break;
    const wasWielded = otmp.c.item?.equipped === 'weapon';
    removeFromInventory(ctx, otmp.id); // extract_from_minvent()
    if (ustealo && otmp.id === ustealo.id)
      say(ctx, 'uhitm.finishes_suit', { mon: monNam(ctx, mdef), his: pronouns(ctx, mdef).his });
    holdAnotherObject(
      ctx,
      otmp.id,
      { key: 'uhitm.snatched_dropped', params: { item: doname(ctx.state, ctx.defs, otmp) } },
      { key: 'uhitm.you_steal' },
    );
    if (wasWielded) possiblyUnwield(ctx, mdef); // stole wielded weapon
    if (!ustealo) break; // only taking one item
  }
}

/**
 * The polymorphed hero attacks the monster with every attack of her form, in order, each with
 * its own to-hit roll (weapons and claws through known_hitum(), the rest through damageum()), the
 * monster's passive answering each blow. She stops when it dies or moves away, when she returns
 * to her own form, or when she is made helpless. ref: src/uhitm.c hmonas() (no two-weapon
 * alternation, silver or blessed bonuses (special_dmgval()), shades, knockback, long worms;
 * the hero never holds a monster, so a hug or wrap does its damage
 * without holding: DEVIATIONS "Polymorph")
 */
export function hmonas(ctx: Ctx, targetId: EntityId): void {
  const form = heroForm(ctx);
  const mon = ent(ctx, targetId);
  if (!form || !mon?.c.pos) return;
  const at = { ...mon.c.pos }; // bhitpos
  const snap: PassiveTarget | null = passiveSnap(ctx, targetId);
  const sum: number[] = [];
  let weaponUsed = false;
  resetSkipdrin(); // [see mattackm(mhitm.c)]
  for (let i = 0; i < form.attacks.length; i++) {
    sum[i] = M_ATTK.MISS;
    // the target might have moved or died
    if (i > 0) {
      const p = ent(ctx, targetId)?.c.pos;
      if (!alive(ctx, targetId) || !p || p.x !== at.x || p.y !== at.y || p.level !== at.level)
        continue;
    }
    const mattk = form.attacks[i];
    if (!mattk || skipsDrin(mattk)) continue;
    let weapon: Entity | null = null;
    let dhit = 0;
    const uwep = uwepOf(ctx);
    const useWeapon = (): boolean => {
      // if we've already hit with a two-handed weapon, we don't get to make another weapon
      // attack
      if (
        weaponUsed &&
        (sum[i - 1] ?? 0) > M_ATTK.MISS &&
        uwep &&
        ctx.defs.object(uwep.def).weapon?.bimanual
      )
        return false;
      weaponUsed = true;
      const w = heroWeapon(ctx, uwep);
      const tmp = findRollToHit(ctx, targetId, 'weapon', w);
      const dieroll = ctx.rng.rnd(20);
      const mhit = tmp > dieroll || isSwallowed(ctx);
      dhit = mhit ? 1 : 0;
      const monsterSurvived = knownHitum(ctx, targetId, w, mhit, mattk);
      // might receive passive erosion: the weapon, or the gloves of a bare hand
      weapon = uwepOf(ctx) ?? whichArmor(ctx, ctx.state.playerId, 'gloves');
      if (!monsterSurvived) {
        sum[i] = M_ATTK.DEF_DIED; // enemy dead, before any special abilities used
        return true;
      }
      sum[i] = mhit ? M_ATTK.HIT : M_ATTK.MISS;
      // Do not print "You hit" message; known_hitum already did it.
      if (mhit && mattk.ad !== 'spel' && mattk.ad !== 'phys')
        sum[i] = damageum(ctx, ent(ctx, targetId) ?? mon, mattk, 0);
      return true;
    };
    const weaponless = (): void => {
      const tmp = findRollToHit(ctx, targetId, mattk.at, null);
      const dieroll = ctx.rng.rnd(20);
      dhit = tmp > dieroll || isSwallowed(ctx) ? 1 : 0;
      const target = ent(ctx, targetId);
      if (!target) return;
      if (!dhit) {
        missum(ctx, targetId, mattk);
        return;
      }
      const compat = isSwallowed(ctx) ? 0 : couldSeduce(ctx, getPlayer(ctx.state), target, mattk);
      if (compat) {
        say(ctx, 'uhitm.smile_at', {
          verb:
            mcansee(ctx, targetId) && !ctx.defs.monster(target.def).flags.includes('noeyes')
              ? '@uhitm.verb.smile_at'
              : '@uhitm.verb.talk_to',
          mon: monNam(ctx, target),
          how: compat === 2 ? '@uhitm.engagingly' : '@uhitm.seductively',
        });
        // doesn't anger it; no wakeup()
        sum[i] = damageum(ctx, target, mattk, 0);
        return;
      }
      wakeup(ctx, targetId);
      // (no shades; no silver or blessed bonus: special_dmgval())
      if (failedGrab(ctx, getPlayer(ctx.state), target, mattk, true)) return; // miss
      if (mattk.at === 'tentacle') say(ctx, 'uhitm.tentacles_suck', { mon: monNam(ctx, target) });
      else say(ctx, `uhitm.you_${VERB[mattk.at] ?? 'hit'}`, { mon: monNam(ctx, target) });
      sum[i] = damageum(ctx, target, mattk, 0);
    };
    switch (mattk.at) {
      case 'weapon':
        if (!useWeapon()) continue;
        break;
      case 'claw':
      case 'touch':
      case 'kick':
      case 'bite':
      case 'sting':
      case 'butt':
      case 'tentacle':
        if (mattk.at === 'claw' && uwep && !cantwield(form) && !weaponUsed) {
          if (!useWeapon()) continue;
          break;
        }
        if (
          (mattk.at === 'claw' || mattk.at === 'touch') &&
          uwep &&
          form.glyph.ch === 'L' &&
          !weaponUsed
        ) {
          if (!useWeapon()) continue;
          break;
        }
        if (mattk.at === 'kick' && mtrappedInPit(ctx, ctx.state.playerId)) continue;
        weaponless();
        break;
      case 'hug': {
        const target = ent(ctx, targetId);
        if (!target) continue;
        // can't hold a holder due to subsequent ambiguity over who is holding whom; can't hug
        // an engulfer from inside (no rope golems, no worm tails)
        if (sticks(ctx.defs.monster(target.def)) || isSwallowed(ctx)) continue; // bypass passive
        // automatic if prev two attacks succeed, or if already grabbed in a previous attack
        dhit = 1;
        wakeup(ctx, targetId);
        // can't grab unsolid creatures
        if (failedGrab(ctx, getPlayer(ctx.state), target, mattk, true)) break;
        if (ustuck(ctx) === targetId) {
          say(ctx, 'uhitm.being_crushed', { mon: monNam(ctx, target) });
          sum[i] = damageum(ctx, target, mattk, 0);
        } else if (i >= 2 && (sum[i - 1] ?? 0) > M_ATTK.MISS && (sum[i - 2] ?? 0) > M_ATTK.MISS) {
          say(ctx, 'uhitm.you_grab', { mon: monNam(ctx, target) });
          // set_ustuck(mon): not ported, the hero never holds a monster
          sum[i] = damageum(ctx, target, mattk, 0);
        }
        break;
      }
      case 'explode': {
        // automatic hit if next to
        const target = ent(ctx, targetId);
        if (!target) continue;
        dhit = -1;
        wakeup(ctx, targetId);
        say(ctx, 'uhitm.you_explode');
        sum[i] = explum(ctx, target, mattk);
        break;
      }
      case 'engulf': {
        const tmp = findRollToHit(ctx, targetId, mattk.at, null);
        const target = ent(ctx, targetId);
        if (!target) continue;
        dhit = tmp > ctx.rng.rnd(20 + i) ? 1 : 0;
        if (dhit) {
          wakeup(ctx, targetId);
          // can't engulf unsolid creatures (no shades)
          if (!failedGrab(ctx, getPlayer(ctx.state), target, mattk, true)) {
            const pd = ctx.defs.monster(target.def);
            sum[i] = gulpum(ctx, target, mattk);
            if (
              sum[i] === M_ATTK.DEF_DIED &&
              (pd.glyph.ch === 'Z' || pd.glyph.ch === 'M') &&
              ctx.rng.rn2(5)
            ) {
              // (no Sick_resistance)
              say(ctx, hungerData(ctx).sick ? 'uhitm.feel_very_sick' : 'uhitm.feel_sick');
              mdamageu(ctx, ctx.rng.rnd(8), `@${pd.id}`);
            }
          }
        } else missum(ctx, targetId, mattk);
        break;
      }
      case 'magic':
        // No check for uwep; if wielding nothing we want to do the normal 1-2 points bare hand
        // damage...
        if ('koG'.includes(form.glyph.ch) && !weaponUsed) {
          if (!useWeapon()) continue;
          break;
        }
        continue; // Not break--avoid passive attacks from enemy
      case 'passive':
      case 'boom':
        continue;
      case 'breath':
      case 'spit':
      case 'gaze':
        // all done using #monster command
        dhit = 0;
        break;
      default:
        continue;
    }
    if (dhit === -1) {
      const hp = getPlayer(ctx.state).c.hp;
      if (hp) hp.cur = -1; // dead in the current form
      rehumanize(ctx);
    }
    if (ctx.state.gameOver) return;
    if (snap) {
      if (sum[i] === M_ATTK.DEF_DIED) passive(ctx, snap, true, false, weapon, mattk.at);
      else passive(ctx, snap, sum[i] !== M_ATTK.MISS, true, weapon, mattk.at);
    }
    if (ctx.state.gameOver) return;
    // stop attacking if defender has died
    if (!alive(ctx, targetId)) break;
    if (!upolyd(ctx.state)) break; // No extra attacks if no longer a monster
    if (getPlayer(ctx.state).c.helpless) break; // If paralyzed while attacking, i.e. floating eye
  }
}

/** Hands hmonas() to combat.ts (do_attack() picks it while polymorphed). */
export function registerHmonas(): void {
  setHmonas(hmonas);
}
