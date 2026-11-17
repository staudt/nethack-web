// An artifact weapon's special hit: the damage bonus (spec_dbon()), the elemental brands, Mjollnir's
// lightning, Magicbane's magic, the beheading blades and the life drainers. Written for any
// attacker and defender (the hero, a monster, or nobody: a returning Mjollnir hitting her); the
// hero's melee and thrown hits call it from step 3 of m20, monsters' from step 4.
// ref: src/artifact.c artifact_hit(), Mb_hit()
import { getPlayer, type Ctx, type Entity, type EntityId, type Msg } from '@nh/core';
import { attacks, heroData, specAbility, specDbon } from './artifact';
import { setArtifactHit, type ArtiHitOpts, type Dmg } from './artihook';
import { isArt } from './artistate';
import { resist } from './buzz';
import { engulfingU, isSwallowed } from './engulfstate';
import { destroyItems } from './erode';
import { losexp } from './exper';
import { heroFemale } from './gender';
import { hcolor } from './hcolor';
import { ustuck, setUstuck } from './hackmove';
import { nomulNow } from './hunger';
import { mapInvisible } from './invis';
import { igniteItems } from './light';
import {
  amorphous,
  hasHead,
  isBig,
  monhpPerLvlMon,
  noncorporeal,
  nonliving,
  sticks,
} from './mondata';
import { monflee } from './monflee';
import { heroSees } from './mongear';
import { healmon, setMConfused, setMStunned } from './mstate';
import { wakeNearto } from './noise';
import { theXname } from './objnam';
import { canSpotMon, monNam } from './perception';
import { healup } from './potion';
import { P, hasProp, makeConfused, makeStunned, timeoutLeft } from './props';
import { burnAwaySlime } from './slimestate';
import { pwOf, setPw } from './uenergy';
import { heroForm, ownHp } from './upoly';
import { cancelMonst, probeMonster } from './zap';

/** ref: include/hack.h FATAL_DAMAGE_MODIFIER */
export const FATAL_DAMAGE_MODIFIER = 200;

/** ref: src/artifact.c MB_MAX_DIEROLL: rolls above this aren't magical */
const MB_MAX_DIEROLL = 8;

/** ref: src/artifact.c mb_verb[][] (the second row while hallucinating) */
const MB_VERB = [
  ['probe', 'stun', 'scare', 'cancel'],
  ['prod', 'amaze', 'tickle', 'purge'],
] as const;
const MB_PROBE = 0;
const MB_STUN = 1;
const MB_SCARE = 2;
const MB_CANCEL = 3;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The hero's current hit points (`Upolyd ? u.mh : u.uhp`). */
const heroHp = (ctx: Ctx): number => getPlayer(ctx.state).c.hp?.cur ?? 0;

/**
 * Someone hits `mdef` (the hero or a monster) with the artifact `obj`: adds the special damage
 * (spec_dbon()) to `dmg` and does the artifact's special effects, with their messages. Returns
 * true when it gave the hit message (the caller then gives none). `magr` is the attacker (the
 * hero's id, a monster's, or null for a returning Mjollnir hitting her); `dieroll` is the d20
 * that scored the hit (Magicbane's and the beheading blades' natural 1; 0 for none).
 * The fire, cold and lightning brands may destroy carried items 1 time in 4 (5 for lightning;
 * a monster also takes their damage, and fire lights its ignitable items); a drained monster
 * loses a level and the hit points of one (a level 0 one dies), healing the attacker by half.
 * Level drain's damage is not inflicted here: the caller takes `dmg` off.
 * ref: src/artifact.c artifact_hit()
 */
export function artifactHit(
  ctx: Ctx,
  magr: EntityId | null,
  mdef: EntityId,
  obj: Entity,
  dmg: Dmg,
  dieroll: number,
  opts: ArtiHitOpts = {},
): boolean {
  const you = ctx.state.playerId;
  const youattack = magr === you;
  const youdefend = mdef === you;
  const def = ctx.state.entities[String(mdef)];
  const att = magr === null ? undefined : ctx.state.entities[String(magr)];
  if (!def) return false;
  const blind = hasProp(getPlayer(ctx.state), P.BLINDED);
  const vis =
    (!youattack && !!att?.c.pos && heroSees(ctx, att.c.pos)) ||
    (!youdefend && !!def.c.pos && heroSees(ctx, def.c.pos)) ||
    (youattack && engulfingU(ctx, mdef) && !blind);
  const hittee = (): Msg | string => (youdefend ? '=you' : monNam(ctx, def));
  const mdat = youdefend ? heroData(ctx) : ctx.defs.monster(def.def);

  // The following takes care of most of the damage, but not all--the exception being for level
  // draining, which is specially handled. Messages are done in this function, however.
  const { bonus, applies } = specDbon(ctx, obj, mdef, dmg.n);
  dmg.n += bonus;

  if (youattack && youdefend) return false; // "attacking yourself with weapon?"

  const realizesDamage = youdefend || vis || (youattack && mdef === ustuck(ctx));

  // the four basic attacks: fire, cold, shock and missiles
  if (attacks('fire', obj)) {
    if (realizesDamage)
      say(
        ctx,
        !applies
          ? 'arti.fire.hits'
          : mdat?.id === 'nh:water_elemental'
            ? 'arti.fire.vaporizes'
            : 'arti.fire.burns',
        { mon: hittee() },
      );
    if (!ctx.rng.rn2(4)) {
      const itemdmg = destroyItems(ctx, mdef, 'fire', dmg.n);
      if (!youdefend) {
        dmg.n += itemdmg; // item destruction dmg
        // (the hero's youmonst.minvent is empty: nothing of hers is ignited)
        if (ctx.state.entities[String(mdef)]) igniteItems(ctx, mdef);
      }
    }
    if (youdefend) burnAwaySlime(ctx);
    return realizesDamage;
  }
  if (attacks('cold', obj)) {
    if (realizesDamage)
      say(ctx, applies ? 'arti.cold.freezes' : 'arti.cold.hits', { mon: hittee() });
    if (!ctx.rng.rn2(4)) {
      const itemdmg = destroyItems(ctx, mdef, 'cold', dmg.n);
      if (!youdefend) dmg.n += itemdmg;
    }
    return realizesDamage;
  }
  if (attacks('elec', obj)) {
    if (realizesDamage)
      say(ctx, applies ? 'arti.elec.strikes' : 'arti.elec.hits', { mon: hittee() });
    const at = youdefend ? getPlayer(ctx.state).c.pos : def.c.pos;
    if (applies && at) wakeNearto(ctx, at.x, at.y, 4 * 4);
    if (!ctx.rng.rn2(5)) {
      const itemdmg = destroyItems(ctx, mdef, 'elec', dmg.n);
      if (!youdefend) dmg.n += itemdmg;
    }
    return realizesDamage;
  }
  if (attacks('magm', obj)) {
    if (realizesDamage)
      say(ctx, applies ? 'arti.magm.strikes' : 'arti.magm.hits', { mon: hittee() });
    return realizesDamage;
  }

  if (attacks('stun', obj) && dieroll <= MB_MAX_DIEROLL)
    // Magicbane's special attacks
    return mbHit(ctx, magr, mdef, obj, dmg, dieroll, vis, applies);

  // since damage bonus didn't apply, nothing more to do; no further attacks have side-effects on
  // inventory
  if (!applies) return false;

  // We really want "on a natural 20" but Nethack does it in reverse from AD&D.
  if (specAbility(obj, 'behead')) {
    if (isArt(obj, 'nh:tsurugi_of_muramasa') && dieroll === 1) {
      // not really beheading, but so close, why add another SPFX
      if (youattack && engulfingU(ctx, mdef)) {
        say(ctx, 'arti.slice_open', { mon: monNam(ctx, def) });
        dmg.n = 2 * (def.c.hp?.cur ?? 0) + FATAL_DAMAGE_MODIFIER;
        return true;
      }
      if (!youdefend) {
        // allow normal cutworm() call to add extra damage
        if (opts.notonhead) return false;
        if (mdat && isBig(mdat)) {
          if (youattack) say(ctx, 'arti.slice_deeply', { mon: monNam(ctx, def) });
          else if (vis && att)
            say(ctx, 'arti.cuts_deeply', { magr: monNam(ctx, att), mon: hittee() });
          dmg.n *= 2;
          return true;
        }
        dmg.n = 2 * (def.c.hp?.cur ?? 0) + FATAL_DAMAGE_MODIFIER;
        say(ctx, 'arti.cuts_in_half', { mon: monNam(ctx, def) });
        return true;
      }
      if (mdat && isBig(mdat)) {
        if (att) say(ctx, 'arti.cuts_deeply_you', { magr: monNam(ctx, att) });
        else say(ctx, 'arti.blade_cuts_deeply_you');
        dmg.n *= 2;
        return true;
      }
      // Players with negative AC's take less damage instead of just not getting hit. We must
      // add a large enough value to the damage so that this reduction in damage does not
      // prevent death.
      dmg.n = 2 * heroHp(ctx) + FATAL_DAMAGE_MODIFIER;
      say(ctx, 'arti.cuts_you_in_half');
      return true;
    }
    if (isArt(obj, 'nh:vorpal_blade') && (dieroll === 1 || mdat?.id === 'nh:jabberwock')) {
      if (youattack && engulfingU(ctx, mdef)) return false;
      if (!youdefend) {
        if (!mdat || !hasHead(mdat) || opts.notonhead || isSwallowed(ctx)) {
          if (youattack) say(ctx, 'arti.miss_wildly', { mon: monNam(ctx, def) });
          else if (vis && att) say(ctx, 'arti.misses_wildly', { magr: monNam(ctx, att) });
          dmg.n = 0;
          return youattack || vis;
        }
        if (noncorporeal(mdat) || amorphous(mdat)) {
          say(ctx, 'arti.slices_neck', { mon: monNam(ctx, def) });
          return true;
        }
        dmg.n = 2 * (def.c.hp?.cur ?? 0) + FATAL_DAMAGE_MODIFIER;
        say(ctx, ctx.rng.rn2(2) ? 'arti.decapitates' : 'arti.beheads', {
          mon: monNam(ctx, def),
        });
        if (hasProp(getPlayer(ctx.state), P.HALLUC) && !heroFemale(ctx.state))
          say(ctx, 'arti.henry');
        return true;
      }
      if (!mdat || !hasHead(mdat)) {
        if (att) say(ctx, 'arti.misses_you_wildly', { magr: monNam(ctx, att) });
        else say(ctx, 'arti.vorpal_misses_you_wildly');
        dmg.n = 0;
        return true;
      }
      if (noncorporeal(mdat) || amorphous(mdat)) {
        say(ctx, 'arti.slices_your_neck');
        return true;
      }
      dmg.n = 2 * heroHp(ctx) + FATAL_DAMAGE_MODIFIER;
      say(ctx, ctx.rng.rn2(2) ? 'arti.decapitates' : 'arti.beheads', { mon: hittee() });
      // Should amulets fall off?
      return true;
    }
  }
  if (specAbility(obj, 'drli')) {
    // some non-living creatures (golems, vortices) are vulnerable to life drain effects so can
    // get "<Arti> draws the <life>" feedback
    const life: Msg = { key: mdat && nonliving(mdat) ? 'arti.animating_force' : 'arti.life' };
    const storm = isArt(obj, 'nh:stormbringer');
    if (!youdefend) {
      const m = def.c.monster;
      const hp = def.c.hp;
      const mLev = m?.level ?? 0; // will be 0 for 1d4 mon
      const mhpmax = hp?.max ?? 0;
      // note: DRLI attack uses 2d6, attacker doesn't get healed
      let drain = monhpPerLvlMon(ctx, def); // usually 1d8
      // stop draining HP if it drops too low (still drains level; also caller still inflicts
      // regular weapon damage)
      if (mhpmax - drain <= mLev) drain = mhpmax > mLev ? mhpmax - (mLev + 1) : 0;
      if (vis) {
        if (storm)
          say(ctx, 'arti.black_blade_draws', {
            color: hcolor(ctx, 'black'),
            life,
            mon: monNam(ctx, def),
          });
        else
          say(ctx, 'arti.draws', {
            item: theXname(ctx.state, ctx.defs, obj),
            life,
            mon: monNam(ctx, def),
          });
      }
      if (mLev === 0) {
        // losing a level when at 0 is fatal
        dmg.n = 2 * (hp?.cur ?? 0) + FATAL_DAMAGE_MODIFIER;
      } else {
        dmg.n += drain;
        if (hp) hp.max -= drain;
        if (m) m.level--;
      }
      if (drain > 0) {
        // drain: was target's damage, now heal attacker by half
        drain = Math.trunc((drain + 1) / 2); // drain/2 rounded up
        if (youattack) healup(ctx, drain, 0, false, false);
        else if (att) healmon(att, drain, 0);
      }
      return vis;
    }
    const oldhpmax = ownHp(ctx.state)?.max ?? 0;
    if (blind)
      say(ctx, storm ? 'arti.feel_unholy_blade_drain' : 'arti.feel_object_drain', { life });
    else if (storm) say(ctx, 'arti.black_blade_drains_you', { color: hcolor(ctx, 'black'), life });
    else say(ctx, 'arti.drains_you', { item: theXname(ctx.state, ctx.defs, obj), life });
    losexp(ctx, 'life drainage');
    const ahp = att?.c.hp;
    if (att && ahp && ahp.cur < ahp.max)
      healmon(att, Math.trunc((Math.abs(oldhpmax - (ownHp(ctx.state)?.max ?? 0)) + 1) / 2), 0);
    return true;
  }
  return false;
}

/**
 * Magicbane's hit (`dieroll` 1..8, the d20 that already hit; one more when the damage bonus
 * did not apply): always 1d4 more damage and a probe, then by the die and its enchantment a stun
 * (`max(spe, 0) < rn2(11)`, `rn2(7)` resisted), a scare (`dieroll <= 4`, halved for every 3
 * points of enchantment) or a cancellation (half of that), each another 1d4; "The
 * magic-absorbing blade stuns the newt!" A cancelled clay golem drops to 1 hit point (the hit
 * kills it), a cancelled caster gives the hero a point of energy ("You absorb magical
 * energy!"), she loses one when she is cancelled; a scared monster flees (it may resist), a
 * scared hero is frozen 3 turns unless magic resistant; the hero's probe is "insightful" (the
 * monster's status and inventory) when the blade is +0, else 1 time in 3 * |spe|; 1 time in 12
 * the target is confused too. ref: src/artifact.c Mb_hit()
 */
function mbHit(
  ctx: Ctx,
  magr: EntityId | null,
  mdef: EntityId,
  mb: Entity,
  dmg: Dmg,
  dieroll: number,
  vis: boolean,
  specDbonApplies: boolean,
): boolean {
  const you = ctx.state.playerId;
  const youattack = magr === you;
  const youdefend = mdef === you;
  const def = ctx.state.entities[String(mdef)];
  if (!def) return false;
  const hero = getPlayer(ctx.state);
  const spe = mb.c.item?.spe ?? 0;
  let resisted = false;
  let result = false; // no message given yet
  let scareDieroll = Math.trunc(MB_MAX_DIEROLL / 2);
  // the most severe effects are less likely at higher enchantment
  if (spe >= 3) scareDieroll = Math.trunc(scareDieroll / (1 << Math.trunc(spe / 3)));
  // if target successfully resisted the artifact damage bonus, reduce overall likelihood of the
  // assorted special effects
  if (!specDbonApplies) dieroll += 1;
  // might stun even when attempting a more severe effect, but in that case it will only happen
  // if the other effect fails; extra damage will apply regardless
  let doStun = Math.max(spe, 0) < ctx.rng.rn2(specDbonApplies ? 11 : 7);
  // the special effects also boost physical damage
  let attackIndx = MB_PROBE;
  dmg.n += ctx.rng.rnd(4); // (2..3)d4
  if (doStun) {
    attackIndx = MB_STUN;
    dmg.n += ctx.rng.rnd(4); // (3..4)d4
  }
  if (dieroll <= scareDieroll) {
    attackIndx = MB_SCARE;
    dmg.n += ctx.rng.rnd(4); // (3..5)d4
  }
  if (dieroll <= Math.trunc(scareDieroll / 2)) {
    attackIndx = MB_CANCEL;
    dmg.n += ctx.rng.rnd(4); // (4..6)d4
  }
  // give the hit message prior to inflicting the effects
  const verb = MB_VERB[hasProp(hero, P.HALLUC) ? 1 : 0][attackIndx] ?? 'probe';
  const hittee = (): Msg | string => (youdefend ? '=you' : monNam(ctx, def));
  if (youattack || youdefend || vis) {
    result = true;
    say(ctx, `arti.mb.${verb}`, { mon: hittee() });
    // assume probing has some sort of noticeable feedback even if it is being done by one
    // monster to another
    if (attackIndx === MB_PROBE && !youdefend && def.c.pos && !canSpotMon(ctx, def))
      mapInvisible(ctx, def.c.pos.x, def.c.pos.y);
  }
  // now perform special effects
  switch (attackIndx) {
    case MB_CANCEL: {
      const oldMdat = youdefend ? heroForm(ctx)?.id : def.def;
      // No mdef->mcan check: even a cancelled monster can be polymorphed into a golem, and the
      // "cancel" effect acts as if some magical energy remains in spellcasting defenders to be
      // absorbed later.
      if (!cancelMonst(ctx, youdefend ? 'hero' : def, { kind: 'weapon' }, youattack, false, false))
        resisted = true;
      else {
        doStun = false;
        if (youdefend) {
          if (heroForm(ctx)?.id !== oldMdat) dmg.n = 0; // rehumanized, so no more damage
          const pw = pwOf(ctx.state);
          if (pw.uenmax > 0) {
            setPw(ctx, { uenmax: pw.uenmax - 1, uen: pw.uen > 0 ? pw.uen - 1 : pw.uen });
            say(ctx, 'arti.mb.lose_energy');
          }
        } else {
          const cur = ctx.state.entities[String(mdef)];
          if (cur?.def === 'nh:clay_golem' && cur.c.hp) cur.c.hp.cur = 1; // cancelled clay golems will die
          if (youattack && cur && ctx.defs.monster(cur.def).attacks.some((a) => a.at === 'magic')) {
            const pw = pwOf(ctx.state);
            const uenmax = pw.uenmax + 1;
            setPw(ctx, { uenmax, uenpeak: Math.max(pw.uenpeak, uenmax), uen: pw.uen + 1 });
            say(ctx, 'arti.mb.absorb_energy');
          }
        }
      }
      break;
    }
    case MB_SCARE:
      if (youdefend) {
        if (hasProp(hero, P.ANTIMAGIC)) resisted = true;
        else {
          nomulNow(ctx, 3, 'helpless.scared_stiff', null); // nomovemsg ""
          const att = magr === null ? undefined : ctx.state.entities[String(magr)];
          const form = heroForm(ctx);
          if (att && magr === ustuck(ctx) && form && sticks(form)) {
            setUstuck(ctx, null);
            say(ctx, 'arti.mb.release', { mon: monNam(ctx, att) });
          }
        }
      } else if (ctx.rng.rn2(2) && resist(ctx, def, 0, 'weapon')) resisted = true;
      else monflee(ctx, mdef, 3, false, (def.c.hp?.cur ?? 0) > dmg.n);
      if (!resisted) doStun = false;
      break;
    case MB_STUN:
      doStun = true; // (this is redundant...)
      break;
    case MB_PROBE:
      if (youattack && (spe === 0 || !ctx.rng.rn2(3 * Math.abs(spe)))) {
        say(ctx, `arti.mb.insightful.${verb}`);
        // pre-damage status
        probeMonster(ctx, def);
      }
      break;
  }
  // stun if that was selected and a worse effect didn't occur
  if (doStun) {
    if (youdefend) makeStunned(ctx, timeoutLeft(ctx.state, hero, P.STUNNED) + 3, false);
    else setMStunned(ctx, mdef, true);
    // avoid extra stun message below if we used mb_verb["stun"] above
    if (attackIndx === MB_STUN) doStun = false;
  }
  // lastly, all this magic can be confusing...
  const doConfuse = !ctx.rng.rn2(12);
  if (doConfuse) {
    if (youdefend) makeConfused(ctx, timeoutLeft(ctx.state, hero, P.CONFUSION) + 4, false);
    else setMConfused(ctx, mdef, true);
  }
  // now give message(s) describing side-effects
  if (youattack || youdefend || vis) {
    const who = youdefend ? 'you' : 'mon';
    const p = youdefend ? undefined : { mon: monNam(ctx, def) };
    if (resisted) say(ctx, `arti.mb.${who}_resist`, p);
    if (doStun || doConfuse)
      say(ctx, `arti.mb.${who}_${doStun && doConfuse ? 'stun_conf' : doStun ? 'stun' : 'conf'}`, p);
  }
  return result;
}

setArtifactHit(artifactHit);
