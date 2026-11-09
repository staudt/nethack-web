// Prayer. ref: src/pray.c dopray(), can_pray(), in_trouble(), worst_cursed_item(),
// fix_worst_trouble(), fix_curse_trouble(), pleased(), angrygods(), gods_upset(), godvoice(),
// god_zaps_you(), fry_by_god(), prayer_done(), water_prayer(); src/sit.c attrcurse() (rndcurse()
// is in sit.ts)
//
// The Valkyrie prays to her own god (Odin, neutral) unless she stands on an altar: then she
// prays to the altar's god (p_aligntyp), with the cross-aligned, water and Moloch branches.
import { isStoned, makeStoned } from './stonestate';
import { isSlimed, makeSlimed } from './slimestate';
import { uswallow } from './engulfstate';
import { monNam } from './perception';
import { monsterDied } from './mondeath';
import { experienceFor, gainExperience, pluslvl, setUlevelmax, ulevelmax } from './hero';
import { losexp } from './exper';
import { ulycn, youUnwere } from './werestate';
import { ownHp, upolyd } from './upoly';
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  itemsAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type ModApi,
  type Msg,
  rnl,
} from '@nh/core';
import { figBucChanged } from './figurinestate';
import { isWeaponOrWeptool } from './material';
import { A_NONE, ALGN_DEVOUT, aAlign, alignGname, godvoice, onAltar, onShrine } from './align';
import { rnz } from './corpses';
import { done } from './end';
import { fixStrangled } from './jewelry';
import { abase, adjattrib, amax, rawAttr, restoreAttr, setRawAttr, type Attr } from './attrib';
import { encumberMsg } from './itemactions';

/** The attributes in C's A_STR..A_CHA order. */
const ATTRS: readonly Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];
import { hungerData, initUhunger, makeSick } from './hunger';
import { changeLuck, adjalign, luckOf, setU, uState } from './luck';
import { LUCK_ITEMS } from './gem';
import { nearCapacity } from './stats';
import { hcolor } from './magic';
import { wakeNearto } from './noise';
import { nomul, unmulNow } from './nomul';
import { rndcurse } from './sit';
import { xnameOf } from './objnam';
import {
  P,
  hasIntrinsic,
  hasProp,
  isStrangled,
  makeBlinded,
  makeConfused,
  makeHallucinated,
  makeStunned,
  setIntrinsic,
  setItimeout,
  timeoutLeft,
} from './props';

export const PRAY_ID: DefId = 'nh:pray';
const PRAYER_DONE: DefId = 'nh:prayer_done';

/** ref: src/pray.c TROUBLE_* (the ones that can happen here) */
const TROUBLE_STONED = 14;
const TROUBLE_SLIMED = 13;
const TROUBLE_STRANGLED = 12;
const TROUBLE_SICK = 10;
const TROUBLE_STARVING = 9;
const TROUBLE_HIT = 7;
const TROUBLE_LYCANTHROPE = 6;
const TROUBLE_COLLAPSING = 5;
const TROUBLE_CURSED_LEVITATION = 3;
const TROUBLE_UNUSEABLE_HANDS = 2;
const TROUBLE_FUMBLING = -2;
const TROUBLE_CURSED_ITEMS = -3;
const TROUBLE_BLIND = -5;
const TROUBLE_POISONED = -6;
const TROUBLE_WOUNDED_LEGS = -7;
const TROUBLE_HUNGRY = -8;
const TROUBLE_STUNNED = -9;
const TROUBLE_CONFUSED = -10;
const TROUBLE_HALLUCINATION = -11;

/** ref: src/pray.c piety thresholds (PIOUS only matters for crowning, which does not exist) */
const STRIDENT = 4;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
const halluc = (ctx: Pick<Ctx, 'state'>): boolean => hasProp(hero(ctx), P.HALLUC);

const HUNGER_RANK: Readonly<Record<string, number>> = {
  satiated: 0,
  not_hungry: 1,
  hungry: 2,
  weak: 3,
  fainting: 4,
  fainted: 5,
  starved: 6,
};
const uhs = (ctx: Ctx): number => HUNGER_RANK[hero(ctx).c.hunger?.state ?? 'not_hungry'] ?? 1;

/** The wielded weapon is welded when cursed. ref: src/wield.c welded(), will_weld() */
function weldedWeapon(ctx: Ctx): Entity | null {
  const w = inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon');
  return w && w.c.item?.buc === 'cursed' && isWeaponOrWeptool(ctx.defs.object(w.def)) ? w : null;
}

const worn = (ctx: Ctx, slot: string): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === slot) ?? null;

/** ref: src/do_wear.c freehand(): a hand is free unless welded to a two-hander or a cursed shield */
export function freehand(ctx: Ctx): boolean {
  const w = worn(ctx, 'weapon');
  if (!w || !weldedWeapon(ctx)) return true;
  const shield = worn(ctx, 'shield');
  return !ctx.defs.object(w.def).weapon?.bimanual && (!shield || shield.c.item?.buc !== 'cursed');
}

/** ref: src/pray.c critically_low_hp(FALSE) */
function criticallyLowHp(ctx: Ctx): boolean {
  const h = hero(ctx);
  const hp = h.c.hp;
  if (!hp) return false;
  const ulevel = h.c.experience?.level ?? 1;
  const maxhp = Math.min(hp.max, 15 * ulevel);
  const rank = ulevel <= 2 ? 0 : ulevel <= 30 ? Math.trunc((ulevel + 2) / 4) : 8;
  const divisor = rank <= 1 ? 5 : rank <= 3 ? 6 : rank <= 5 ? 7 : rank <= 7 ? 8 : 9;
  return hp.cur <= 5 || hp.cur * divisor <= maxhp;
}

/** ref: src/pray.c worst_cursed_item() (no eyewear or two-weapon) */
function worstCursedItem(ctx: Ctx): Entity | null {
  const inv = inventoryOf(ctx.state, ctx.state.playerId);
  // if strained or worse, check for loadstone first
  if (nearCapacity(ctx.state, ctx.defs, ctx.state.playerId) >= HVY_ENCUMBER) {
    const ls = inv.find((o) => o.def === 'nh:loadstone' && o.c.item?.buc === 'cursed');
    if (ls) return ls;
  }
  const w = weldedWeapon(ctx);
  const cursed = (slot: string): Entity | null => {
    const o = worn(ctx, slot);
    return o && o.c.item?.buc === 'cursed' ? o : null;
  };
  // weapon takes precedence if it is interfering with taking off a ring or putting on a shield
  if (w && (worn(ctx, 'ringR') || ctx.defs.object(w.def).weapon?.bimanual)) return w;
  return (
    cursed('gloves') ??
    cursed('shield') ??
    cursed('cloak') ??
    cursed('body') ??
    // if a worn helmet of opposite alignment is making her an adherent of the current god, he
    // won't uncurse it for her
    (worn(ctx, 'helm')?.def !== 'nh:helm_of_opposite_alignment' ? cursed('helm') : null) ??
    cursed('boots') ??
    cursed('shirt') ??
    cursed('amulet') ??
    cursed('ringL') ??
    cursed('ringR') ??
    w ??
    // all worn items ought to be handled by now
    inv.find(
      (o) => o.c.item?.buc === 'cursed' && (o.def === 'nh:loadstone' || LUCK_ITEMS.has(o.def)),
    ) ??
    null
  );
}

/** ref: include/hack.h HVY_ENCUMBER (Strained) */
const HVY_ENCUMBER = 3;
/** ref: include/hack.h EXT_ENCUMBER (Overtaxed) */
const EXT_ENCUMBER = 4;

/**
 * The hero's worst trouble: positive major, negative minor, 0 none. ref: src/pray.c in_trouble()
 * Not ported (they cannot happen): lava, clouds, walls, blindfolds, punishment, saddles,
 * deafness.
 */
export function inTrouble(ctx: Ctx): number {
  const h = hero(ctx);
  if (isStoned(ctx.state)) return TROUBLE_STONED;
  if (isSlimed(ctx.state)) return TROUBLE_SLIMED;
  if (isStrangled(h)) return TROUBLE_STRANGLED;
  if (hungerData(ctx).sick) return TROUBLE_SICK;
  if (uhs(ctx) >= HUNGER_RANK.weak!) return TROUBLE_STARVING;
  if ((!upolyd(ctx.state) || hasProp(h, P.UNCHANGING)) && criticallyLowHp(ctx)) return TROUBLE_HIT;
  if (ulycn(ctx.state) !== null) return TROUBLE_LYCANTHROPE;
  if (
    nearCapacity(ctx.state, ctx.defs, ctx.state.playerId) >= EXT_ENCUMBER &&
    amax(ctx.state, 'str') - abase(ctx.state, 'str') > 3
  )
    return TROUBLE_COLLAPSING;
  if (cursedLevitation(ctx)) return TROUBLE_CURSED_LEVITATION;
  if (!freehand(ctx) && weldedWeapon(ctx)) return TROUBLE_UNUSEABLE_HANDS;
  // minor troubles
  if (cursedFumbling(ctx)) return TROUBLE_FUMBLING;
  if (worstCursedItem(ctx)) return TROUBLE_CURSED_ITEMS;
  // (not while inside a blinding engulfer: it would only blind her again)
  if (
    timeoutLeft(ctx.state, h, P.BLINDED) > 1 &&
    !hasIntrinsic(h, P.BLINDED) &&
    !swallowedByBlinder(ctx)
  )
    return TROUBLE_BLIND;
  if (ATTRS.some((k) => abase(ctx.state, k) < amax(ctx.state, k))) return TROUBLE_POISONED;
  if (hasProp(h, P.WOUNDED_LEGS)) return TROUBLE_WOUNDED_LEGS;
  if (uhs(ctx) >= HUNGER_RANK.hungry!) return TROUBLE_HUNGRY;
  if (timeoutLeft(ctx.state, h, P.STUNNED) > 0) return TROUBLE_STUNNED;
  if (timeoutLeft(ctx.state, h, P.CONFUSION) > 0) return TROUBLE_CONFUSED;
  if (timeoutLeft(ctx.state, h, P.HALLUC) > 0) return TROUBLE_HALLUCINATION;
  return 0;
}

/** ref: src/pray.c `Cursed_obj(obj, typ)`: the hero wears a cursed `typ` in `slot`. */
function cursedObj(ctx: Ctx, slot: string, typ: string): Entity | null {
  const o = worn(ctx, slot);
  return o?.def === typ && o.c.item?.buc === 'cursed' ? o : null;
}

/**
 * What keeps a worn ring of type `otyp` on: a welded weapon in the ring's hand (or two-handed),
 * cursed gloves, or its own curse. ref: src/do_wear.c stuck_ring() (no limbless forms, no
 * slippery fingers)
 */
function stuckRing(ctx: Ctx, slot: 'ringL' | 'ringR', otyp: string): Entity | null {
  const ring = worn(ctx, slot);
  if (ring?.def !== otyp) return null;
  const w = weldedWeapon(ctx);
  if (w && (slot === 'ringR' || ctx.defs.object(w.def).weapon?.bimanual)) return w;
  const gloves = worn(ctx, 'gloves');
  if (gloves?.c.item?.buc === 'cursed') return gloves;
  return ring.c.item?.buc === 'cursed' ? ring : null;
}

/** TROUBLE_CURSED_LEVITATION: cursed levitation boots or a stuck ring of levitation. */
const cursedLevitation = (ctx: Ctx): Entity | null =>
  cursedObj(ctx, 'boots', 'nh:levitation_boots') ??
  stuckRing(ctx, 'ringL', 'nh:ring_of_levitation') ??
  stuckRing(ctx, 'ringR', 'nh:ring_of_levitation');

/** TROUBLE_FUMBLING: cursed gauntlets of fumbling or fumble boots. */
const cursedFumbling = (ctx: Ctx): Entity | null =>
  cursedObj(ctx, 'gloves', 'nh:gauntlets_of_fumbling') ??
  cursedObj(ctx, 'boots', 'nh:fumble_boots');

/** "Your spear softly glows amber." and the curse is gone. ref: src/pray.c fix_curse_trouble() */
function fixCurseTrouble(ctx: Ctx, otmp: Entity): void {
  const it = otmp.c.item;
  if (!it) return;
  if (!hasProp(hero(ctx), P.BLINDED)) {
    say(ctx, (it.quantity ?? 1) > 1 ? 'pray.glows_pl' : 'pray.glows', {
      item: xnameOf(ctx.state, ctx.defs, otmp),
      color: hcolor(ctx, 'amber'),
    });
    it.known.buc = !halluc(ctx);
  }
  it.buc = 'uncursed';
  figBucChanged(ctx, otmp.id); // uncurse()
}

/** ref: src/pray.c fix_worst_trouble() */
function fixWorstTrouble(ctx: Ctx, trouble: number): void {
  const h = hero(ctx);
  switch (trouble) {
    case TROUBLE_STONED:
      makeStoned(ctx, 0, 'stone.more_limber', null);
      break;
    case TROUBLE_SLIMED:
      makeSlimed(ctx, 0, 'slime.disappears');
      break;
    case TROUBLE_STRANGLED:
      fixStrangled(ctx);
      break;
    case TROUBLE_STARVING:
    case TROUBLE_HUNGRY:
      say(ctx, 'pray.stomach');
      initUhunger(ctx);
      break;
    case TROUBLE_SICK:
      say(ctx, 'pray.feel_better');
      makeSick(ctx, 0, '', false);
      break;
    case TROUBLE_HIT: {
      // "fix all troubles" keeps trying at 5 or less hit points, so always more than that
      say(ctx, 'pray.much_better');
      const mh = h.c.hp;
      if (upolyd(ctx.state) && mh) {
        mh.max = Math.max(mh.max + ctx.rng.rnd(5), 5 + 1); // setuhpmax(..., FALSE): the form's
        mh.cur = mh.max;
      }
      const hp = ownHp(ctx.state); // u.uhpmax is updated even when polymorphed
      if (!hp) break;
      let maxhp = hp.max;
      if (maxhp < (h.c.experience?.level ?? 1) * 5 + 11) maxhp += ctx.rng.rnd(5);
      hp.max = Math.max(maxhp, 6);
      hp.cur = hp.max;
      break;
    }
    case TROUBLE_LYCANTHROPE:
      youUnwere(ctx, true);
      break;
    case TROUBLE_COLLAPSING: {
      // override Fixed_abil; uncurse that if feasible
      say(
        ctx,
        amax(ctx.state, 'str') - abase(ctx.state, 'str') > 6
          ? 'pray.much_stronger'
          : 'pray.stronger',
      );
      restoreAttr(ctx, 'str');
      if (hasProp(h, P.FIXED_ABIL)) {
        const o =
          stuckRing(ctx, 'ringL', 'nh:ring_of_sustain_ability') ??
          stuckRing(ctx, 'ringR', 'nh:ring_of_sustain_ability');
        if (o) fixCurseTrouble(ctx, o);
      }
      break;
    }
    case TROUBLE_CURSED_LEVITATION:
    case TROUBLE_FUMBLING: {
      const o = trouble === TROUBLE_FUMBLING ? cursedFumbling(ctx) : cursedLevitation(ctx);
      if (o) fixCurseTrouble(ctx, o);
      break;
    }
    case TROUBLE_UNUSEABLE_HANDS: {
      const w = weldedWeapon(ctx);
      if (w) fixCurseTrouble(ctx, w);
      break;
    }
    case TROUBLE_CURSED_ITEMS: {
      const o = worstCursedItem(ctx);
      if (o) fixCurseTrouble(ctx, o);
      break;
    }
    case TROUBLE_BLIND:
      say(ctx, 'pray.eyes_better');
      makeBlinded(ctx, 0, false);
      break;
    case TROUBLE_POISONED:
      // override Fixed_abil; ignore items which confer that
      say(ctx, hasProp(h, P.HALLUC) ? 'pray.tiger' : 'pray.good_health');
      for (const k of ATTRS) restoreAttr(ctx, k);
      encumberMsg(ctx);
      break;
    case TROUBLE_WOUNDED_LEGS:
      // heal_legs(0): "Your leg feels better."
      setItimeout(ctx.state, h, P.WOUNDED_LEGS, 0);
      say(ctx, 'timeout.legs_better');
      break;
    case TROUBLE_STUNNED:
      makeStunned(ctx, 0, true);
      break;
    case TROUBLE_CONFUSED:
      makeConfused(ctx, 0, true);
      break;
    case TROUBLE_HALLUCINATION:
      say(ctx, 'pray.kansas');
      makeHallucinated(ctx, 0, false);
      break;
    default:
      break;
  }
}

/** ref: src/sit.c attrcurse(): takes away one intrinsic, starting at a random one */
export function attrcurse(ctx: Ctx): boolean {
  const h = hero(ctx);
  // [prop, message] in attrcurse()'s order (teleportitis and aggravation do not exist: their
  // cases fall through)
  const order: [number, string, string][] = [
    [1, P.FIRE_RES, 'attrcurse.warmer'],
    [3, P.POISON_RES, 'attrcurse.sick'],
    [4, P.TELEPAT, 'attrcurse.senses_fail'],
    [5, P.COLD_RES, 'attrcurse.cooler'],
    [6, P.INVIS, 'attrcurse.paranoid'],
    [7, P.SEE_INVIS, hasProp(h, P.HALLUC) ? 'attrcurse.puttie_tat' : 'attrcurse.saw_something'],
    [8, P.FAST, 'attrcurse.slower'],
    [9, P.STEALTH, 'attrcurse.clumsy'],
    [10, P.PROTECTION, 'attrcurse.vulnerable'],
  ];
  const start = ctx.rng.rnd(11);
  for (const [n, prop, key] of order) {
    if (n < start) continue;
    if (!hasIntrinsic(h, prop)) continue;
    setIntrinsic(h, prop, false);
    say(ctx, key);
    return true;
  }
  return false;
}

/** ref: src/pray.c fry_by_god() */
function fryByGod(ctx: Ctx, align: number, disint: boolean): void {
  say(ctx, disint ? 'pray.disintegrate' : 'pray.fry');
  const h = hero(ctx);
  if (h.c.hp) h.c.hp.cur = 0;
  done(
    ctx,
    align < 0 ? '@killer.wrath_loki' : align > 0 ? '@killer.wrath_tyr' : '@killer.wrath_odin',
  );
}

/** ref: src/pray.c god_zaps_you() (no reflection exists) */
function godZapsYou(ctx: Ctx, align: number): void {
  // swallowed, the engulfer takes the bolt (and she gets the experience: "It takes guts to
  // successfully pull off this trick on your god, anyway.")
  const engulfer = (): Entity | undefined => {
    const sw = uswallow(ctx);
    return sw ? ctx.state.entities[String(sw.mon)] : undefined;
  };
  const zapped = (mon: Entity, key: string, resists: boolean, nocorpse: boolean): void => {
    say(ctx, key, { mon: monNam(ctx, mon) });
    if (!resists) {
      say(ctx, nocorpse ? 'pray.mon_dust' : 'pray.mon_fries', { mon: monNam(ctx, mon) });
      // xkilled(u.ustuck, XKILL_NOMSG | XKILL_NOCONDUCT [| XKILL_NOCORPSE])
      const def = ctx.defs.monster(mon.def);
      const lvl = mon.c.monster?.level ?? def.level;
      monsterDied(ctx, mon.id, true); // (inside it: no corpse either way)
      gainExperience(ctx, ctx.state.playerId, experienceFor(def, lvl));
    } else say(ctx, 'pray.mon_unaffected', { mon: monNam(ctx, mon) });
  };
  const e1 = engulfer();
  if (e1) {
    say(ctx, 'pray.lightning_down');
    zapped(e1, 'pray.strikes_mon', ctx.defs.monster(e1.def).resists.includes('elec'), false);
  } else {
    say(ctx, 'pray.lightning');
    if (hasProp(hero(ctx), P.SHOCK_RES)) say(ctx, 'pray.not_affected');
    else {
      fryByGod(ctx, align, false);
      return;
    }
  }
  say(ctx, 'pray.not_deterred', { god: alignGname(align) });
  const e2 = engulfer();
  if (e2) {
    zapped(e2, 'pray.disint_hits_mon', ctx.defs.monster(e2.def).resists.includes('disint'), true);
    return;
  }
  say(ctx, 'pray.disint_beam');
  fryByGod(ctx, align, true);
}

/** ref: src/pray.c angrygods() (no level drain, punishment or minions) */
function angrygods(ctx: Ctx, respGod: number): void {
  const u = uState(ctx.state);
  setU(ctx, { ublessed: 0 }); // lose divine protection
  const luck = luckOf(ctx.state);
  let maxanger =
    respGod !== u.alignType
      ? Math.trunc(u.alignRecord / 2) + (luck > 0 ? -Math.trunc(luck / 3) : -luck)
      : 3 * u.ugangr + (luck > 0 || u.alignRecord >= STRIDENT ? -Math.trunc(luck / 3) : -luck);
  maxanger = Math.max(1, Math.min(15, maxanger));
  switch (ctx.rng.rn2(maxanger)) {
    case 0:
    case 1:
      say(ctx, 'pray.feel_god', {
        god: alignGname(respGod),
        mood: halluc(ctx) ? '@pray.mood.bummed' : '@pray.mood.displeased',
      });
      break;
    case 2:
    case 3:
      godvoice(ctx, respGod, null);
      say(ctx, u.alignRecord < 0 && respGod === u.alignType ? 'pray.strayed' : 'pray.arrogant');
      say(ctx, 'pray.relearn');
      adjattrib(ctx, 'wis', -1, false);
      losexp(ctx, null);
      break;
    case 6: // punish(): no ball and chain, so as 4 and 5
    case 4:
    case 5:
      godvoice(ctx, respGod, 'pray.angered');
      if (!hasProp(hero(ctx), P.BLINDED))
        say(ctx, 'pray.black_glow', { color: hcolor(ctx, 'black') });
      if (ctx.rng.rn2(2) !== 0 || !attrcurse(ctx)) rndcurse(ctx);
      break;
    case 7:
    case 8:
      godvoice(ctx, respGod, null);
      say(ctx, onAltar(ctx) && heroAltar(ctx) !== respGod ? 'pray.durst_scorn' : 'pray.durst');
      say(ctx, 'pray.then_die');
      break; // summon_minion(): no minions exist
    default:
      godvoice(ctx, respGod, 'pray.angered');
      godZapsYou(ctx, respGod);
      break;
  }
  // even though this might not be in response to prayer, set the prayer timer
  const n = rnz(ctx, 300);
  if (n > uState(ctx.state).ublesscnt) setU(ctx, { ublesscnt: n });
}

/** ref: src/pray.c gods_upset() */
function godsUpset(ctx: Ctx, align: number): void {
  const u = uState(ctx.state);
  if (align === u.alignType) setU(ctx, { ugangr: u.ugangr + 1 });
  else if (u.ugangr) setU(ctx, { ugangr: u.ugangr - 1 });
  angrygods(ctx, align);
}

/** The god's favors on a good prayer. ref: src/pray.c pleased() (no castle tune or spells) */
function pleased(ctx: Ctx, gAlign: number, pTrouble: number): void {
  let trouble = inTrouble(ctx); // the worst trouble may have changed while praying
  const record0 = uState(ctx.state).alignRecord;
  const h = halluc(ctx);
  const mood =
    record0 >= ALGN_DEVOUT
      ? h
        ? 'pleased_as_punch'
        : 'well_pleased'
      : record0 >= STRIDENT
        ? h
          ? 'ticklish'
          : 'pleased'
        : h
          ? 'full'
          : 'satisfied';
  say(ctx, 'pray.feel_god', { god: alignGname(gAlign), mood: `@pray.mood.${mood}` });
  // not your deity: a point of alignment and nothing else, not even a new prayer timeout
  if (onAltar(ctx) && gAlign !== uState(ctx.state).alignType) {
    adjalign(ctx, -1);
    return;
  } else if (record0 < 2 && trouble <= 0) adjalign(ctx, 1);

  let patOnHead = false;
  const record = uState(ctx.state).alignRecord;
  if (!trouble && record >= ALGN_DEVOUT) {
    if (pTrouble === 0) patOnHead = true;
  } else {
    const prayerLuck = Math.max(luckOf(ctx.state), -1);
    // rn1(prayer_luck + (on_altar() ? 3 + on_shrine() : 2), 1)
    const altar = onAltar(ctx);
    let action = ctx.rng.rn2(prayerLuck + (altar ? 3 + (onShrine(ctx) ? 1 : 0) : 2)) + 1;
    if (!altar) action = Math.min(action, 3);
    if (record < STRIDENT) action = record > 0 || rnl(ctx.rng, 2, luckOf(ctx.state)) === 0 ? 1 : 0;
    // up to 9 major troubles
    const fixMajor = (): void => {
      let tryct = 0;
      while ((trouble = inTrouble(ctx)) > 0 && ++tryct < 10) fixWorstTrouble(ctx, trouble);
    };
    switch (Math.min(action, 5)) {
      case 5:
      case 4: {
        if (action >= 5) patOnHead = true;
        // every trouble, minor ones too (the guard only stops a trouble this port cannot fix)
        let guard = 0;
        do fixWorstTrouble(ctx, trouble);
        while ((trouble = inTrouble(ctx)) !== 0 && ++guard < 100);
        break;
      }
      case 3:
        fixWorstTrouble(ctx, trouble); // then, as case 2, the major ones
        fixMajor();
        break;
      case 2:
        fixMajor();
        break;
      case 1:
        if (trouble > 0) fixWorstTrouble(ctx, trouble);
        break;
      default:
        break; // your god blows you off, too bad
    }
  }
  if (patOnHead) patOnTheHead(ctx, gAlign);

  setU(ctx, { ublesscnt: rnz(ctx, 350) });
  // the DoS guard for very long games
  if (ctx.state.turn > 100000) {
    const u = uState(ctx.state);
    setU(ctx, { ublesscnt: u.ublesscnt + Math.trunc((ctx.state.turn - 100000) / 100) });
  }
}

/** A gratuitous favor. ref: src/pray.c pleased() `if (pat_on_head) switch (rn2((Luck + 6) >> 1))` */
function patOnTheHead(ctx: Ctx, gAlign: number): void {
  const her = hero(ctx);
  const blind = hasProp(her, P.BLINDED);
  let n = ctx.rng.rn2((luckOf(ctx.state) + 6) >> 1);
  if (n === 3) n = 2; // no castle tune to hint at: as the golden glow
  if (n >= 6) n = 5; // no spells or crowning: as the gift of an intrinsic
  switch (n) {
    case 1: {
      const w = worn(ctx, 'weapon');
      const it = w?.c.item;
      if (!w || !it || !isWeaponOrWeptool(ctx.defs.object(w.def))) break;
      if (it.buc === 'cursed') {
        if (!blind) fixCurseTrouble(ctx, w);
        else it.buc = 'uncursed';
        it.known.buc = true;
      } else if (it.buc !== 'blessed') {
        if (!blind)
          say(ctx, 'pray.blue_aura_item', {
            item: xnameOf(ctx.state, ctx.defs, w),
            color: hcolor(ctx, 'light_blue'),
          });
        it.buc = 'blessed';
        it.known.buc = true;
      }
      break;
    }
    case 2: {
      if (!blind) say(ctx, 'pray.golden_glow', { color: hcolor(ctx, 'golden') });
      const hp = her.c.hp;
      const xp = her.c.experience;
      // if any levels have been lost (and not yet regained), treat this effect like blessed
      // full healing
      if (xp && xp.level < ulevelmax(ctx, xp.level)) {
        setUlevelmax(ctx, ulevelmax(ctx, xp.level) - 1, xp.level); // see potion.c
        pluslvl(ctx, her.id, false);
      } else if (hp) hp.max += 5;
      if (hp) hp.cur = hp.max;
      const hd = hungerData(ctx);
      if (hd.strLoss > 0 && her.c.attributes) {
        setRawAttr(ctx, 'str', rawAttr(ctx.state, 'str') + hd.strLoss);
        hd.strLoss = 0;
      }
      if (restoreAttr(ctx, 'str')) encumberMsg(ctx);
      if ((her.c.hunger?.nutrition ?? 900) < 900) initUhunger(ctx);
      if (uState(ctx.state).luck < 0) setU(ctx, { luck: 0 });
      makeBlinded(ctx, 0, true);
      break;
    }
    case 4: {
      say(ctx, blind ? 'pray.feel_power' : 'pray.blue_aura', {
        god: alignGname(gAlign),
        color: hcolor(ctx, 'light_blue'),
      });
      for (const o of inventoryOf(ctx.state, ctx.state.playerId))
        if (
          o.c.item?.buc === 'cursed' &&
          // [see worst_cursed_item()]
          (o.c.item.equipped !== 'helm' || o.def !== 'nh:helm_of_opposite_alignment')
        ) {
          if (!blind) fixCurseTrouble(ctx, o);
          else {
            o.c.item.buc = 'uncursed';
            figBucChanged(ctx, o.id); // uncurse()
          }
        }
      break;
    }
    case 5: {
      godvoice(ctx, uState(ctx.state).alignType, 'pray.progress');
      const gift = !hasIntrinsic(her, P.TELEPAT)
        ? P.TELEPAT
        : !hasIntrinsic(her, P.FAST)
          ? P.FAST
          : !hasIntrinsic(her, P.STEALTH)
            ? P.STEALTH
            : P.PROTECTION;
      if (gift === P.PROTECTION) {
        const u = uState(ctx.state);
        if (!hasIntrinsic(her, P.PROTECTION)) {
          setIntrinsic(her, P.PROTECTION, true);
          if (!u.ublessed) setU(ctx, { ublessed: ctx.rng.rn2(3) + 2 }); // rn1(3, 2)
        } else setU(ctx, { ublessed: u.ublessed + 1 });
      } else setIntrinsic(her, gift, true);
      say(ctx, 'pray.gift', { gift: `@pray.gift.${gift}` });
      say(ctx, 'pray.use_wisely');
      break;
    }
    default:
      break;
  }
}

interface PrayerData {
  pType: number;
  pTrouble: number;
  /** p_aligntyp: the altar's alignment when praying on one, else the hero's */
  pAlign: number;
}

/** The alignment of the altar under the hero (callers check onAltar() first). */
function heroAltar(ctx: Ctx): number | null {
  const p = hero(ctx).c.pos;
  return p ? aAlign(ctx, p.x, p.y) : null;
}

/**
 * Who can pray and how it will go: p_type -2 Moloch, 0 too soon, 1 naughty, 2 good on a
 * cross-aligned altar, 3 good (-1 undead cannot happen). On another god's altar the record
 * counts half, on the opposite god's altar negated. ref: src/pray.c can_pray()
 */
function canPray(ctx: Ctx): PrayerData {
  const u = uState(ctx.state);
  const altar = onAltar(ctx);
  const pAlign = altar ? (heroAltar(ctx) ?? u.alignType) : u.alignType;
  const pTrouble = inTrouble(ctx);
  let alignment: number;
  if (u.alignType && u.alignType === -pAlign)
    alignment = -u.alignRecord; // opposite alignment altar
  else if (u.alignType !== pAlign)
    alignment = Math.trunc(u.alignRecord / 2); // different alignment altar
  else alignment = u.alignRecord;
  let pType: number;
  if (pAlign === A_NONE)
    pType = -2; // praying to Moloch
  else if (pTrouble > 0 ? u.ublesscnt > 200 : pTrouble < 0 ? u.ublesscnt > 100 : u.ublesscnt > 0)
    pType = 0; // too soon...
  else if (luckOf(ctx.state) < 0 || u.ugangr || alignment < 0)
    pType = 1; // too naughty...
  else pType = altar && u.alignType !== pAlign ? 2 : 3;
  return { pType, pTrouble, pAlign };
}

/**
 * She could pray safely now (no messages, no state change). ref: src/pray.c can_pray(FALSE):
 * `p_type == 3 && !Inhell`
 */
export const canSafelyPray = (ctx: Ctx): boolean => canPray(ctx).pType === 3;

/**
 * Blesses (or curses) the potions of water on the altar under the hero; true if any changed.
 * "The potions on the altar glow light blue for a moment." ref: src/pray.c water_prayer()
 */
function waterPrayer(ctx: Ctx, blessWater: boolean): boolean {
  const p = hero(ctx).c.pos;
  if (!p) return false;
  const blind = hasProp(hero(ctx), P.BLINDED);
  const bcKnown = !(blind || halluc(ctx));
  let changed = 0;
  let other = false;
  for (const o of itemsAt(ctx.defs, ctx.state, p.level, p.x, p.y)) {
    const it = o.c.item;
    if (!it) continue;
    if (o.def === 'nh:potion_of_water' && it.buc !== (blessWater ? 'blessed' : 'cursed')) {
      it.buc = blessWater ? 'blessed' : 'cursed';
      it.known.buc = bcKnown; // ok to bypass set_bknown()
      changed += it.quantity ?? 1;
    } else if (ctx.defs.object(o.def).class === 'potion') other = true;
  }
  if (!blind && changed) {
    const which = other ? (changed > 1 ? 'some_of' : 'one_of') : changed > 1 ? 'the_pl' : 'the';
    say(ctx, `pray.water.${which}`, {
      color: hcolor(ctx, blessWater ? 'light_blue' : 'black'),
    });
  }
  return changed > 0;
}

/** ref: src/pray.c prayer_done(), after the three helpless turns (no pray_revive()) */
function prayerDone(ctx: Ctx, data: PrayerData): void {
  setU(ctx, { uinvulnerable: false });
  const alignment = data.pAlign;
  const crossAltar = (): boolean => onAltar(ctx) && uState(ctx.state).alignType !== alignment;
  if (data.pType === -2) {
    // praying at an unaligned altar
    say(ctx, 'pray.diabolical');
    const h = hero(ctx);
    const p = h.c.pos;
    if (p) wakeNearto(ctx, p.x, p.y, (h.c.experience?.level ?? 1) * 20); // wake_nearby(FALSE)
    adjalign(ctx, -2);
    say(ctx, 'pray.nothing_else'); // not actually true...
  } else if (data.pType === 0) {
    if (crossAltar()) waterPrayer(ctx, false);
    setU(ctx, { ublesscnt: uState(ctx.state).ublesscnt + rnz(ctx, 250) });
    changeLuck(ctx, -3);
    godsUpset(ctx, uState(ctx.state).alignType);
  } else if (data.pType === 1) {
    if (crossAltar()) waterPrayer(ctx, false);
    angrygods(ctx, uState(ctx.state).alignType); // naughty
  } else if (data.pType === 2) {
    if (waterPrayer(ctx, false)) {
      // attempted water prayer on a non-coaligned altar
      setU(ctx, { ublesscnt: uState(ctx.state).ublesscnt + rnz(ctx, 250) });
      changeLuck(ctx, -3);
      godsUpset(ctx, uState(ctx.state).alignType);
    } else pleased(ctx, alignment, data.pTrouble);
  } else {
    // coaligned
    if (onAltar(ctx)) waterPrayer(ctx, true);
    pleased(ctx, alignment, data.pTrouble); // nice
  }
}

/** True while a successful prayer protects the hero (u.uinvulnerable). */
export const invulnerable = (ctx: Pick<Ctx, 'state'>): boolean =>
  uState(ctx.state).uinvulnerable === true;

const pray: ActionDef = {
  id: PRAY_ID,
  labelKey: 'action.nh:pray',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: PRAY_ID }, labelKey: 'action.nh:pray' }]
      : [],
  // ref: src/pray.c dopray(): paranoid_confirmation:pray is on by default
  perform(ctx) {
    ctx.ask(
      { id: 'pray-confirm', kind: 'yn', key: 'pray.confirm', cancellable: true },
      PRAY_ID,
      null,
    );
    return 0;
  },
  answer(ctx, value) {
    if (value !== true) return 0; // declined: no time passes
    const data = canPray(ctx);
    say(ctx, 'pray.begin', { god: alignGname(data.pAlign) });
    // nomul(-3), "praying", "You finish your prayer.", then prayer_done()
    const extra = nomul(ctx, 3, 'helpless.praying', { key: 'pray.finish' });
    ctx.schedule(4, PRAYER_DONE, data as unknown as Json);
    if (data.pType === 3) {
      // if you've been true to your god you can't die while you pray
      if (!hasProp(hero(ctx), P.BLINDED)) say(ctx, 'pray.shimmering');
      setU(ctx, { uinvulnerable: true });
    }
    return NORMAL_SPEED + extra;
  },
};

export const PRAY_ACTIONS: readonly ActionDef[] = [pray];

export function registerPray(api: ModApi): void {
  api.defineTimer({
    id: PRAYER_DONE,
    fire(ctx, data) {
      // the helplessness ends this turn: "You finish your prayer." comes first (unmul)
      unmulNow(ctx);
      prayerDone(ctx, data as unknown as PrayerData);
    },
  });
  // ref: src/allmain.c moveloop_core(): `if (u.ublesscnt) u.ublesscnt--;` once a turn
  api.on('endOfTurn', (ctx) => {
    const u = uState(ctx.state);
    if (u.ublesscnt > 0) setU(ctx, { ublesscnt: u.ublesscnt - 1 });
  });
}

/** `u.uswallow && attacktype_fordmg(u.ustuck->data, AT_ENGL, AD_BLND)` */
function swallowedByBlinder(ctx: Ctx): boolean {
  const sw = uswallow(ctx);
  const mon = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  return (
    !!mon && ctx.defs.monster(mon.def).attacks.some((a) => a.at === 'engulf' && a.ad === 'blnd')
  );
}
