// The hero's polymorph (D5/D6 of the m7f plan: the form lives in upoly.ts's `modData.nh.upoly`,
// the hero entity keeps the role def, and `c.hp` holds the form's hit points while her own are
// parked) and the polymorph trap. polyself() is the entry point of the wand, the spell, the potion,
// the trap, polymorphitis and wizard mode's #polyself; polymon() makes her a monster, rehumanize()
// and newman() make her human again, you_were()/you_unwere() are a lycanthrope's changes.
// ref: src/polyself.c polyself(), polymon(), polyman(), newman(), rehumanize(), set_uasmon(),
// uasmon_maxStr(); src/were.c you_were(), you_unwere(); src/allmain.c moveloop_core()
// (polymorphitis, lycanthropy); src/timeout.c nh_timeout() (u.mtimedone); src/trap.c
// trapeffect_poly_trap()
//
// Not ported: steeds, sitting on the trap (VIASITTING), dragon armor (no dragons), vampires and
// shapeshifters, genocide ("You feel rather gnome-ish."), golems (stone golem when stoned), light
// sources of shining forms, mimicking and hiding, a hero who sticks to a monster (no such forms
// fight yet), pools and lava under the new form, Passes_walls and buried balls, the amulet of
// strangulation's can_be_strangled(), slime, slippery fingers, eggs, the `#monster` hints and
// conduct, retouch_equipment()/selftouch(), attribute exercise, livelog, gendered monster names.
// What a form can wear, wield, carry and eat (break_armor(), drop_weapon()) is step 4's.
import {
  getPlayer,
  type ActionDef,
  type AttributesComponent,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type ModApi,
  type MonsterDef,
  type Msg,
  type Trap,
} from '@nh/core';
import { abon, acurrClamp, type Attr } from './attrib';
import { unaware } from './btrapped';
import { resist, resistsMagm } from './buzz';
import { monsterNearby } from './eat';
import { done } from './end';
import { expels } from './engulf';
import { isWhirly, uswallow } from './engulfstate';
import { changeSex, heroFemale, setHeroFemale } from './gender';
import { setUstuck, ustuck } from './hackmove';
import { MAXULEV, levelIncrements, newhp, newpw, newuexp, setUlevelmax, ulevelmax } from './hero';
import { losehp } from './hp';
import { makeSick, newuhs } from './hunger';
import { encumberMsg, prinv } from './itemactions';
import { levitating } from './levitation';
import { uState } from './luck';
import { messagesEn } from './messages.en';
import { nameToMon } from './mondata';
import { isPlaceholder, newcham, polyok } from './newcham';
import { discover, isKnown } from './o_init';
import { xnameOf } from './objnam';
import { mungspaces, wishNames } from './objnam_read';
import { monNam } from './perception';
import { polyObj } from './polyobj';
import { P, adjabil, hasProp, makeBlinded, setFormProps, wornIn } from './props';
import { isStoned, makeStoned } from './stonestate';
import {
  TRAP,
  canseemon,
  deltrap,
  ironShoes,
  seetrap,
  setTrapEffect,
  type TrapResult,
} from './trap';
import { setUtrap, utrap } from './trapstate';
import { pwOf, setPw } from './uenergy';
import {
  heroForm,
  heroFormId,
  ownHp,
  rehumanize as rehumanizeLate,
  setRehumanize,
  setUnwere,
  setUpoly,
  upolyOf,
  type UPoly,
} from './upoly';
import { counterWere, isWere, ulycn, wereBeastie } from './werestate';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const IRON_SHOES: DefId = 'nh:iron_shoes';
const KICKING_BOOTS: DefId = 'nh:kicking_boots';
const HUMAN: DefId = 'nh:human';
const AMULET_OF_UNCHANGING: DefId = 'nh:amulet_of_unchanging';

/** The hidden action that answers polyself()'s, you_were()'s and you_unwere()'s prompts. */
export const POLYSELF_ID: DefId = 'nh:polyself';

/** Iron shoes and kicking boots warp into each other. */
const warpedBoots = (boots: Entity): DefId =>
  boots.def === IRON_SHOES ? KICKING_BOOTS : IRON_SHOES;

/** polyself()'s flags. ref: include/hack.h POLY_CONTROLLED, POLY_LOW_CTRL */
export interface PolyFlags {
  /** POLY_CONTROLLED: wizard mode's #polyself and the blessed potion */
  controlled?: true;
  /** POLY_LOW_CTRL: the blessed potion (a lycanthrope loses the control) */
  low?: true;
  /** peffect_polymorph()'s cap of the blessed potion's form: `min(mtimedone, rn2(15) + 10)` */
  cap?: true;
}

// ---------------------------------------------------------------------------------------------
// monster data

const hasFlag = (def: MonsterDef, f: string): boolean => def.flags.includes(f);
const hasAd = (def: MonsterDef, ad: string): boolean =>
  def.attacks.some((a) => a.ad.toLowerCase() === ad);
/** ref: include/mondata.h your_race() for the human hero: is_human() */
const yourRace = (def: MonsterDef): boolean => hasFlag(def, 'human');
const isUniq = (def: MonsterDef): boolean => def.genFlags.includes('uniq');
/** ref: include/mondata.h is_bat() */
const isBat = (def: MonsterDef): boolean =>
  def.id === 'nh:bat' || def.id === 'nh:giant_bat' || def.id === 'nh:vampire_bat';
/** ref: include/mondata.h telepathic() */
const telepathic = (def: MonsterDef): boolean =>
  def.id === 'nh:floating_eye' || def.id === 'nh:mind_flayer' || def.id === 'nh:master_mind_flayer';
/** ref: include/mondata.h pm_invisible() */
const pmInvisible = (def: MonsterDef): boolean =>
  def.id === 'nh:stalker' || def.id === 'nh:black_light';
/** ref: include/mondata.h is_floater(): S_EYE and S_LIGHT */
const isFloater = (def: MonsterDef): boolean => def.glyph.ch === 'e' || def.glyph.ch === 'y';
/** ref: include/mondata.h amorphous(), unsolid(), webmaker() */
const amorphous = (def: MonsterDef): boolean => hasFlag(def, 'amorphous');
const unsolid = (def: MonsterDef): boolean => hasFlag(def, 'unsolid');
const webmaker = (def: MonsterDef): boolean =>
  def.id === 'nh:cave_spider' || def.id === 'nh:giant_spider';
/** ref: include/mondata.h sticks() */
const sticks = (def: MonsterDef): boolean =>
  hasAd(def, 'stck') ||
  (hasAd(def, 'wrap') && !def.attacks.some((a) => a.at === 'engulf')) ||
  def.attacks.some((a) => a.at === 'hug');
const SIZES = ['tiny', 'small', 'medium', 'large', 'huge', 'gigantic'] as const;
const msize = (def: MonsterDef): number => SIZES.indexOf(def.size);

/** The resistances set_uasmon() takes from the form's mresists. */
const RESISTS: readonly [string, string][] = [
  ['fire', P.FIRE_RES],
  ['cold', P.COLD_RES],
  ['sleep', P.SLEEP_RES],
  ['disint', P.DISINT_RES],
  ['elec', P.SHOCK_RES],
  ['poison', P.POISON_RES],
  ['acid', P.ACID_RES],
  ['stone', P.STONE_RES],
];

/**
 * The properties a form gives (C's FROMFORM bits). Drain resistance is exper.ts's
 * resistsDrliHero(); the ones the port has no property for (sickness, hallucination and blindness
 * resistance, infravision, flying, swimming, passing walls) are not set.
 * ref: src/polyself.c set_uasmon()
 */
function formProps(def: MonsterDef): string[] {
  const out: string[] = [];
  for (const [mr, p] of RESISTS) if (def.resists.includes(mr)) out.push(p);
  if (hasAd(def, 'magm') || def.id === 'nh:baby_gray_dragon' || hasAd(def, 'rbre'))
    out.push(P.ANTIMAGIC);
  if (def.id === 'nh:stalker' || isBat(def)) out.push(P.STUNNED);
  if (hasFlag(def, 'see_invis')) out.push(P.SEE_INVIS);
  if (telepathic(def)) out.push(P.TELEPAT);
  if (pmInvisible(def)) out.push(P.INVIS);
  if (hasFlag(def, 'tport')) out.push(P.TELEPORT);
  if (hasFlag(def, 'tport_cntrl')) out.push(P.TELEPORT_CONTROL);
  if (isFloater(def)) out.push(P.LEVITATION);
  if (hasFlag(def, 'regen')) out.push(P.REGENERATION);
  if (def.id === 'nh:silver_dragon') out.push(P.REFLECTING);
  if (hasFlag(def, 'noeyes')) out.push(P.BLINDED);
  return out;
}

/** ref: include/attrib.h STR18(), STR19() */
const STR18 = (x: number): number => 18 + x;
const STR19 = (x: number): number => 100 + x;
/** ref: src/role.c races[] attrmax[A_STR] by race monster */
const RACE_STR: Readonly<Record<string, number>> = {
  'nh:human': STR18(100),
  'nh:elf': 18,
  'nh:dwarf': STR18(100),
  'nh:gnome': STR18(50),
  'nh:orc': STR18(50),
};

/**
 * The hero's maximum strength in a form: a race's maximum for its own kind, else 18/100 for a
 * strong form (19/19 for a live giant) and 18 for the others. ref: src/polyself.c uasmon_maxStr()
 */
function uasmonMaxStr(def: MonsterDef): number {
  let mndx: string = def.id;
  if (hasFlag(def, 'orc')) {
    if (mndx !== 'nh:uruk_hai' && mndx !== 'nh:orc_captain') mndx = 'nh:orc';
  } else if (hasFlag(def, 'elf')) mndx = 'nh:elf';
  else if (hasFlag(def, 'dwarf')) mndx = 'nh:dwarf';
  else if (hasFlag(def, 'gnome')) mndx = 'nh:gnome';
  const r = RACE_STR[mndx];
  if (hasFlag(def, 'strong')) {
    const liveH = hasFlag(def, 'giant') && !hasFlag(def, 'undead');
    return r ?? (liveH ? STR19(19) : STR18(100));
  }
  return r ?? 18;
}

const ATTRS: readonly Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

/** ABASE: the stored attributes (ACURR) less the rings' bonuses. */
function baseAttrs(ctx: Ctx, a: AttributesComponent): AttributesComponent {
  const out = { ...a };
  for (const k of ATTRS) out[k] = a[k] - abon(ctx.state, k);
  return out;
}

/** `u.acurr = u.macurr`: her own attributes back, with the rings' current bonuses. */
function restoreAttrs(ctx: Ctx, h: Entity, base: AttributesComponent): void {
  const a = { ...base };
  for (const k of ATTRS) a[k] = acurrClamp(k, base[k] + abon(ctx.state, k));
  h.c.attributes = a;
}

/** The form's attribute: the stored value (ACURR). */
const acurr = (h: Entity, k: Attr): number => h.c.attributes?.[k] ?? 10;

/** Polymorph_control and neither Stunned nor Unaware. */
function controllablePoly(ctx: Ctx): boolean {
  const h = getPlayer(ctx.state);
  return hasProp(h, P.POLYMORPH_CONTROL) && !hasProp(h, P.STUNNED) && !unaware(ctx);
}

// ---------------------------------------------------------------------------------------------
// polyself()

/**
 * The hero polymorphs. Unchanging: "You fail to transform!". Without polymorph control (or a
 * forced one) and not a lycanthrope, 1 + rn2(20) over her Con is system shock: "You shudder for a
 * moment." and rnd(30) damage. With control (not stunned or unconscious) or forced control, she
 * is asked "Become what kind of monster? [type the name]" (up to 5 tries, answered through
 * {@link POLYSELF_ID}); a lycanthrope without control takes her beast form; otherwise a random
 * polyok() form, but 1 time in 5 (never under forced control), or for a human or other unpolyable
 * pick, she becomes a new human instead (newman()). While another prompt is pending the form is
 * random. ref: src/polyself.c polyself() (no dragon armor, vampires, POLY_MONSTER/POLY_REVERT)
 */
export function polyself(ctx: Ctx, flags: PolyFlags = {}): void {
  const h = getPlayer(ctx.state);
  if (hasProp(h, P.UNCHANGING)) {
    say(ctx, 'polyself.fail_transform');
    return;
  }
  let forcecontrol = flags.controlled === true;
  const iswere = ulycn(ctx.state) !== null;
  // being Stunned|Unaware doesn't negate this aspect of Poly_control
  if (!hasProp(h, P.POLYMORPH_CONTROL) && !forcecontrol && !iswere) {
    if (ctx.rng.rn2(20) > acurr(h, 'con')) {
      say(ctx, 'polyself.shudder');
      losehp(ctx, ctx.rng.rnd(30), '@killer.poly.system_shock');
      return;
    }
  }
  if (forcecontrol && flags.low && iswere) forcecontrol = false;
  const cap = flags.cap === true;
  if (controllablePoly(ctx) || forcecontrol) {
    if (ctx.state.pendingPrompt === null) {
      askForm(ctx, { stage: 'what', tries: 5, ...(forcecontrol ? { force: true } : {}), cap });
      return;
    }
    polyFinish(ctx, null, forcecontrol, cap);
    return;
  }
  if (iswere) {
    doShift(ctx, null);
    capForm(ctx, cap);
    return;
  }
  polyFinish(ctx, null, false, cap);
}

/** What a polymorph prompt carries to its answer. */
interface PolyData {
  stage: 'what' | 'were' | 'remain';
  /** The control prompt's tries left (C's tryct). */
  tries?: number;
  /** POLY_CONTROLLED: Escape is "Never mind." and the 1-in-5 newman() is skipped. */
  force?: true;
  cap: boolean;
}

function askForm(ctx: Ctx, data: PolyData): void {
  ctx.ask(
    { id: 'poly-what', kind: 'text', key: 'polyself.prompt', maxLength: 80 },
    POLYSELF_ID,
    data as unknown as Json,
  );
}

/** The blessed potion's cap of the form's time. ref: src/potion.c peffect_polymorph() */
function capForm(ctx: Ctx, cap: boolean): void {
  const u = upolyOf(ctx.state);
  if (cap && u && u.mtimedone) u.mtimedone = Math.min(u.mtimedone, ctx.rng.rn2(15) + 10);
}

/** ref: src/mondata.c name_to_monclass() for one character: a monster class symbol */
function nameToMonclass(ctx: Ctx, buf: string): string | null {
  if (buf.length !== 1) return null; // class descriptions are not matched
  return ctx.defs.monsters.some((m) => m.glyph.ch === buf) ? buf : null;
}

/**
 * A random form of class `cls`, weighted by frequency (not unique or never generated, and 8 times
 * in 9 not Gehennom-only), or null. ref: src/makemon.c mkclass_poly()
 */
function mkclassPoly(ctx: Ctx, cls: string): DefId | null {
  const list = ctx.defs.monsters.filter((m) => m.glyph.ch === cls);
  if (list.length === 0) return null;
  const mask = ['nogen', 'uniq'];
  if (ctx.rng.rn2(9) || cls === 'L') mask.push('hell');
  const ok = (m: MonsterDef): boolean =>
    !m.genFlags.some((f) => mask.includes(f)) && !isPlaceholder(m);
  let num = 0;
  for (const m of list) if (ok(m)) num += m.frequency;
  if (!num) return null;
  num = ctx.rng.rnd(num);
  for (const m of list) {
    if (!ok(m)) continue;
    num -= m.frequency;
    if (num <= 0) return m.id;
  }
  return null;
}

/** A placeholder's substitute (orc, elf, giant), which may not exist. */
function placeholderSubstitute(ctx: Ctx, id: DefId): DefId {
  const pick = (a: string, b: string): DefId => (ctx.rng.rn2(3) ? a : b) as DefId;
  const sub =
    id === 'nh:orc'
      ? pick('nh:hill_orc', 'nh:mordor_orc')
      : id === 'nh:elf'
        ? pick('nh:green_elf', 'nh:grey_elf')
        : id === 'nh:giant'
          ? pick('nh:stone_giant', 'nh:hill_giant')
          : id;
  return ctx.defs.isMonster(sub) ? sub : id;
}

/**
 * One round of polyself()'s getlin() loop: Escape is "Never mind." under forced control, else a
 * random form, as are "*" and "random"; a name (or a class symbol) is checked: "I've never heard of
 * such monsters.", "You can't polymorph into any of those.", "You can't polymorph into a <mon>."
 * (humans and the hero's own race pass, to make a new human); a lycanthrope's own kind shifts her;
 * after 5 tries "That's enough tries!" and the last pick goes on.
 * ref: src/polyself.c polyself() (the controllable_poly || forcecontrol loop)
 */
function answerForm(ctx: Ctx, value: Json, data: PolyData): void {
  const force = data.force === true;
  let buf = typeof value === 'string' ? mungspaces(value) : null;
  if (buf === null) {
    // user is cancelling controlled poly
    if (force) {
      say(ctx, 'polyself.never_mind');
      return;
    }
    buf = '*'; // resort to random
  }
  if (buf === '*' || buf === 'random') {
    polyFinish(ctx, null, force, data.cap); // tryct = 0: no "That's enough tries!"
    return;
  }
  let tryct = data.tries ?? 5;
  const lycn = ulycn(ctx.state);
  const names = wishNames(ctx.state, ctx.defs, messagesEn).monsters;
  let mntmp = nameToMon(names, buf);
  let cls: string | null = null;
  if (mntmp === null) {
    cls = nameToMonclass(ctx, buf);
    if (cls !== null) mntmp = mkclassPoly(ctx, cls);
  } else {
    const def = ctx.defs.monster(mntmp);
    // placeholder monsters are reasonable polymorph targets: pick a substitute
    if (isPlaceholder(def) && !yourRace(def) && mntmp !== HUMAN)
      mntmp = placeholderSubstitute(ctx, mntmp);
  }
  for (;;) {
    if (mntmp === null) {
      say(ctx, cls === null ? 'polyself.never_heard' : 'polyself.cant_any');
      break;
    }
    const def = ctx.defs.monster(mntmp);
    if (
      lycn !== null &&
      (wereBeastie(mntmp) === lycn ||
        mntmp === counterWere(lycn) ||
        (heroFormId(ctx.state) !== null && mntmp === HUMAN))
    ) {
      doShift(ctx, mntmp);
      capForm(ctx, data.cap);
      return;
    }
    if (!polyok(def) && !(mntmp === HUMAN || (yourRace(def) && !isUniq(def)))) {
      // mkclass_poly() can pick a !polyok() candidate; if so, usually try again
      if (cls !== null) {
        if (ctx.rng.rn2(3) || --tryct > 0) {
          mntmp = mkclassPoly(ctx, cls);
          continue;
        }
        // no retries left; put one back so the end of loop decrement triggers the message
        ++tryct;
      }
      const key = isUniq(def)
        ? def.flags.includes('pname')
          ? 'polyself.cant_into_pname'
          : 'polyself.cant_into_the'
        : 'polyself.cant_into';
      say(ctx, key, { mon: `@${mntmp}` });
      break;
    }
    polyFinish(ctx, mntmp, force, data.cap);
    return;
  }
  if (--tryct > 0) {
    askForm(ctx, { ...data, tries: tryct });
    return;
  }
  say(ctx, 'polyself.enough_tries');
  polyFinish(ctx, mntmp, force, data.cap);
}

/**
 * The end of polyself(): a random ordinary form when none was picked (200 tries at a polyok()
 * non-placeholder), then newman() for an unpolyable or human pick or 1 time in 5 without forced
 * control, else polymon(); either may change her sex 1 time in 10. ref: src/polyself.c polyself()
 */
function polyFinish(ctx: Ctx, picked: DefId | null, force: boolean, cap: boolean): void {
  let mntmp = picked;
  if (mntmp === null) {
    const all = ctx.defs.monsters;
    for (let tryct = 200; tryct > 0; tryct--) {
      const m = all[ctx.rng.rn2(all.length)];
      if (!m) continue;
      mntmp = m.id;
      if (polyok(m) && !isPlaceholder(m)) break;
    }
  }
  const def = mntmp !== null && ctx.defs.isMonster(mntmp) ? ctx.defs.monster(mntmp) : null;
  if (!def || !polyok(def) || (!force && !ctx.rng.rn2(5)) || yourRace(def)) newman(ctx, true);
  else polymon(ctx, def.id, true);
  capForm(ctx, cap);
}

/**
 * A lycanthrope changes: in another form a pick that is not her kind makes a new human, else she
 * takes her beast form. ref: src/polyself.c polyself() do_shift
 */
function doShift(ctx: Ctx, mntmp: DefId | null): void {
  const lycn = ulycn(ctx.state);
  if (lycn === null) return;
  if (heroFormId(ctx.state) !== null && (mntmp === null || wereBeastie(mntmp) !== lycn))
    newman(ctx, false); // werecritter
  else polymon(ctx, lycn, false);
}

// ---------------------------------------------------------------------------------------------
// polymon(), polyman(), rehumanize(), newman()

/**
 * Updates the form's properties (FROMFORM) from her current form, or clears them.
 * ref: src/polyself.c set_uasmon()
 */
function setUasmon(ctx: Ctx): void {
  const form = heroForm(ctx);
  setFormProps(getPlayer(ctx.state), form ? formProps(form) : []);
}

/**
 * The hero becomes a monster of type `mntmp`: "You turn into a gnome!" (or "You feel like a new
 * gnome!" in the same form; a sex change of a form with both sexes says "female"/"male"), for
 * rn1(500, 500) turns, less when the form's level is above hers; the form's hit points (d8 a level,
 * rnd(4) at level 0), its properties and its strength (its speed: stats.ts heroMovement()) (a strong form's maximum, else
 * her strength capped at it) while it lasts; a stoned hero in a stone-resistant form is cured;
 * an eyeless form blinds her and an eyed one cures that blindness; a form that can't be held or
 * swallowed frees her; a small, amorphous or whirly one slips out of a bear trap or web.
 * Returns true (no genocide here). ref: src/polyself.c polymon()
 */
export function polymon(ctx: Ctx, mntmp: DefId, sexChangeOk: boolean): boolean {
  const def = ctx.defs.monster(mntmp);
  const h = getPlayer(ctx.state);
  const wasBlind = hasProp(h, P.BLINDED);
  const old = upolyOf(ctx.state);
  const ownAttrs: AttributesComponent = old
    ? old.macurr
    : baseAttrs(ctx, h.c.attributes ?? { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 });
  const mfemale = old ? old.mfemale : heroFemale(ctx.state);
  if (old) {
    // monster to monster; restore human stats, to be immediately changed for the new monster
    restoreAttrs(ctx, h, old.macurr);
    setHeroFemale(ctx.state, old.mfemale);
  }
  let dochange = false;
  if (hasFlag(def, 'male')) dochange = heroFemale(ctx.state);
  else if (hasFlag(def, 'female')) dochange = !heroFemale(ctx.state);
  else if (!hasFlag(def, 'neuter') && mntmp !== ulycn(ctx.state)) {
    if (sexChangeOk && !ctx.rng.rn2(10)) dochange = true;
  }
  const same = heroFormId(ctx.state) === mntmp;
  let gender = '';
  if (dochange) {
    setHeroFemale(ctx.state, !heroFemale(ctx.state));
    if (!hasFlag(def, 'male') && !hasFlag(def, 'female'))
      gender = heroFemale(ctx.state) ? '.female' : '.male';
  }
  say(ctx, `${same ? 'polyself.feel_like_new' : 'polyself.turn_into'}${gender}`, {
    mon: `@${mntmp}`,
  });

  const hp = h.c.hp ?? { cur: 1, max: 1 };
  const u: UPoly = {
    form: mntmp,
    mtimedone: ctx.rng.rn2(500) + 500, // rn1(500, 500)
    uhp: old ? old.uhp : { cur: hp.cur, max: hp.max },
    mfemale,
    macurr: ownAttrs,
    ...(hasFlag(def, 'neuter') || !hasFlag(def, 'humanoid') ? { neuter: true as const } : {}),
  };
  setUpoly(ctx.state, u);
  setUasmon(ctx);

  // new stats for monster, to last only as long as polymorphed: only strength changes
  const newMaxStr = uasmonMaxStr(def);
  const a = h.c.attributes;
  if (a) {
    const bonus = abon(ctx.state, 'str');
    const base = a.str - bonus;
    // a strongmonst() gets its maximum; else exceptional strength is stripped (until she returns)
    const str = hasFlag(def, 'strong') ? newMaxStr : Math.min(base, newMaxStr);
    a.str = acurrClamp('str', str + bonus);
  }
  if (hasProp(h, P.STONE_RES) && isStoned(ctx.state))
    makeStoned(ctx, 0, 'polyself.no_longer_petrifying', null);

  // there is no experience level of the hero as a monster: the form's own level
  const mlvl = def.level;
  const mhmax = mlvl ? ctx.rng.d(mlvl, 8) : ctx.rng.rnd(4);
  h.c.hp = { cur: mhmax, max: mhmax };
  const ulevel = h.c.experience?.level ?? 1;
  // low level characters can't become high level monsters for long
  if (ulevel < mlvl) u.mtimedone = Math.trunc((u.mtimedone * ulevel) / mlvl);

  // break_armor(), drop_weapon(1): step 4
  const ut = utrap(ctx);
  if (ut?.type === 'pit') setUtrap(ctx, ctx.rng.rn2(6) + 2, 'pit'); // time to escape resets
  if (wasBlind && !hasProp(h, P.BLINDED)) makeBlinded(ctx, 0, true); // previous form was eyeless

  const sw = uswallow(ctx);
  const stuck = ustuck(ctx);
  const stuckMon = stuck !== null ? ctx.state.entities[String(stuck)] : undefined;
  if (sw && stuckMon) {
    // if the new form can't be swallowed, make the engulfer expel her
    const sdef = ctx.defs.monster(stuckMon.def);
    if (
      unsolid(def) ||
      msize(def) >= SIZES.indexOf('huge') ||
      (msize(sdef) < msize(def) && !isWhirly(sdef))
    ) {
      let msg = true;
      if (unsolid(def)) {
        say(ctx, 'polyself.no_longer_contain', { mon: monNam(ctx, stuckMon) });
        msg = false;
      }
      expels(ctx, stuckMon, msg);
    }
  } else if (stuckMon && (sticks(def) || unsolid(def))) {
    // being held: if now capable of holding, make the holder release so that she doesn't
    // automagically start holding it; or release if no longer capable of being held
    setUstuck(ctx, null);
    say(ctx, 'polyself.loses_grip', { mon: monNam(ctx, stuckMon) });
  }

  const ut2 = utrap(ctx);
  if (
    ut2 &&
    (ut2.type === 'web' || ut2.type === 'beartrap') &&
    (amorphous(def) ||
      isWhirly(def) ||
      unsolid(def) ||
      (msize(def) <= SIZES.indexOf('small') && ut2.type === 'beartrap'))
  ) {
    say(ctx, `polyself.no_longer_stuck.${ut2.type}`);
    setUtrap(ctx, 0, ut2.type);
  }
  if (webmaker(def) && utrap(ctx)?.type === 'web') {
    say(ctx, 'polyself.orient_web');
    setUtrap(ctx, 0, 'web');
  }
  encumberMsg(ctx);
  return true;
}

/**
 * Makes her human again: her own attributes, sex and hit points back, the form's
 * properties gone, then `key` ("You return to human form!", "You feel like a new woman!"); a hero
 * whose form blinded her sees again. ref: src/polyself.c polyman() (no genocide)
 */
function polyman(ctx: Ctx, key: string): void {
  const h = getPlayer(ctx.state);
  const wasBlind = hasProp(h, P.BLINDED);
  const u = upolyOf(ctx.state);
  if (u) {
    restoreAttrs(ctx, h, u.macurr); // restore old attribs
    setHeroFemale(ctx.state, u.mfemale);
    h.c.hp = { cur: u.uhp.cur, max: u.uhp.max }; // u.mh = u.mhmax = 0
    setUpoly(ctx.state, null);
  }
  setUasmon(ctx);
  if (utrap(ctx)?.type === 'pit') setUtrap(ctx, ctx.rng.rn2(6) + 2, 'pit'); // time to escape resets
  say(ctx, key);
  if (wasBlind && !hasProp(h, P.BLINDED)) makeBlinded(ctx, 0, true); // reverting from eyeless
}

/**
 * The form's time is up or its hit points ran out: "You return to human form!". Unchanging keeps
 * the form ("Your amulet fails!" when it is the amulet's doing), and kills her when the form has
 * no hit points left ("killed while stuck in creature form"). Her own hit points below 1 kill her
 * too ("Your old form was not healthy enough to survive."). ref: src/polyself.c rehumanize()
 */
export function rehumanize(ctx: Ctx): void {
  const h = getPlayer(ctx.state);
  if (!upolyOf(ctx.state)) return;
  // you can't revert back while unchanging
  if (hasProp(h, P.UNCHANGING)) {
    if ((h.c.hp?.cur ?? 0) < 1) {
      done(ctx, '@killer.poly.stuck');
      return; // don't rehumanize after all
    }
    const uamul = wornIn(ctx.state, h.id, 'amulet');
    if (uamul?.def === AMULET_OF_UNCHANGING) {
      const known = isKnown(ctx.state, ctx.defs, AMULET_OF_UNCHANGING);
      say(ctx, known ? 'polyself.amulet_fails.known' : 'polyself.amulet_fails');
      discover(ctx, AMULET_OF_UNCHANGING);
    }
  }
  polyman(ctx, 'polyself.return_human');
  const hp = h.c.hp;
  if (hp && hp.cur < 1) {
    // can only happen if some bit of code reduces u.uhp instead of u.mh while poly'd
    say(ctx, 'polyself.old_form_unhealthy');
    done(ctx, '@killer.poly.reverting');
    if (ctx.state.gameOver) return;
  }
  ctx.interrupt(); // nomul(0)
  encumberMsg(ctx);
}

/** ref: src/exper.c rndexp(FALSE): random experience points within the current level */
function rndexp(ctx: Ctx, ulevel: number): number {
  const minexp = ulevel === 1 ? 0 : newuexp(ulevel - 1);
  const maxexp = newuexp(ulevel);
  let diff = maxexp - minexp;
  let factor = 1;
  // make sure that `diff' is an argument which rn2() can handle (LARGEST_INT)
  while (diff >= 32767) {
    diff = Math.trunc(diff / 2);
    factor *= 2;
  }
  return minexp + factor * ctx.rng.rn2(diff);
}

/** ref: src/hacklib.c rounddiv() */
function rounddiv(x: number, y: number): number {
  let divsgn = 1;
  if (y < 0) {
    divsgn = -divsgn;
    y = -y;
  }
  if (x < 0) {
    divsgn = -divsgn;
    x = -x;
  }
  let r = Math.trunc(x / y);
  const m = x % y;
  if (2 * m >= y) r++;
  return divsgn * r;
}

/**
 * She becomes a new human: her level goes up or down by up to 2 (below 1 kills her), her peak
 * level drops with a loss, 1 time in 10 (when allowed) her sex changes, her experience points,
 * Str/Dex/Con/Cha (each by -2..+2), hit points and energy are rolled again (the extra beyond the
 * level gains kept at 80-110%), she is fed (rn1(500, 500)), sickness and stoning are cured; with
 * no hit points left she dies ("Your new form doesn't seem healthy enough to survive.") unless she
 * has polymorph control; then "You feel like a new woman!" (or man).
 * ref: src/polyself.c newman() (redist_attr() without AMAX: the stored values vary)
 */
export function newman(ctx: Ctx, sexChangeOk: boolean): void {
  const h = getPlayer(ctx.state);
  const xp = h.c.experience;
  const own = ownHp(ctx.state);
  if (!xp || !own) return;
  const oldlvl = xp.level;
  let newlvl = oldlvl + ctx.rng.rn2(5) - 2; // rn1(5, -2)
  if (newlvl > 127 || newlvl < 1) {
    // level went below 0? old level is still intact (in case of lifesaving)
    dead(ctx);
    return;
  }
  if (newlvl > MAXULEV) newlvl = MAXULEV;
  // a lower level lowers the peak level by as much; a higher one does not raise it
  let max = ulevelmax(ctx, oldlvl);
  if (newlvl < oldlvl) max -= oldlvl - newlvl;
  if (max < newlvl) max = newlvl;
  xp.level = newlvl;
  setUlevelmax(ctx, max, newlvl);
  if (sexChangeOk && !ctx.rng.rn2(10)) changeSex(ctx);
  adjabil(ctx, h.id, oldlvl, newlvl);
  // random experience points for the new experience level
  xp.points = rndexp(ctx, newlvl);
  // set up new attribute points (particularly Con); polymorphing doesn't change your mind
  redistAttr(ctx, h);

  // new hit points: the level gains taken out of the maximum, the extra kept at 80-110%, new
  // level gains rolled (newhp() at level 0 is the starting value)
  const pw = pwOf(ctx.state);
  let hpmax = own.max;
  let enmax = pw.uenmax;
  for (let i = 1; i < oldlvl; i++) {
    const inc = levelIncrements(ctx, i, own.max, pw.uenmax, oldlvl);
    hpmax -= inc.hp;
    enmax -= inc.en;
  }
  hpmax = rounddiv(hpmax * (ctx.rng.rn2(4) + 8), 10); // rn1(4, 8)
  const con = acurr(h, 'con');
  for (let i = 0; i < newlvl; i++) hpmax += newhp(ctx, i, con, own.max);
  if (hpmax < newlvl) hpmax = newlvl; // min of 1 HP per level
  // retain same proportion for current HP
  own.cur = rounddiv(own.cur * hpmax, own.max);
  own.max = hpmax; // setuhpmax(hpmax, TRUE)
  if (own.cur > own.max) own.cur = own.max;
  // do the same for spell power
  enmax = rounddiv(enmax * (ctx.rng.rn2(4) + 8), 10);
  const wis = acurr(h, 'wis');
  for (let i = 0; i < newlvl; i++) enmax += newpw(ctx, i, wis, pw.uenmax);
  if (enmax < newlvl) enmax = newlvl;
  const uen = rounddiv(pw.uen * enmax, pw.uenmax < 1 ? 1 : pw.uenmax);
  setPw(ctx, { uen, uenmax: enmax });

  const hunger = h.c.hunger;
  if (hunger) hunger.nutrition = ctx.rng.rn2(500) + 500; // rn1(500, 500)
  makeSick(ctx, 0, '', false);
  if (isStoned(ctx.state)) makeStoned(ctx, 0, null, null);
  if (own.cur <= 0) {
    if (hasProp(h, P.POLYMORPH_CONTROL)) {
      // even when Stunned || Unaware
      own.cur = 1;
    } else {
      dead(ctx);
      return;
    }
  }
  newuhs(ctx, false);
  // use saved gender we're about to revert to, not current
  const u = upolyOf(ctx.state);
  const female = u ? u.mfemale : heroFemale(ctx.state);
  polyman(ctx, female ? 'polyself.new_woman' : 'polyself.new_man');
  encumberMsg(ctx);
}

/** newman()'s `dead:` label. */
function dead(ctx: Ctx): void {
  say(ctx, 'polyself.new_form_unhealthy');
  done(ctx, '@killer.poly.unsuccessful');
  if (ctx.state.gameOver) return;
  // must have been life-saved to get here
  newuhs(ctx, false);
  encumberMsg(ctx);
}

/**
 * Str, Dex, Con and Cha each change by -2..+2 within the human limits. ref: src/attrib.c
 * redist_attr() (the port keeps no AMAX: the stored value is both)
 */
function redistAttr(ctx: Ctx, h: Entity): void {
  const a = h.c.attributes;
  if (!a) return;
  for (const k of ATTRS) {
    if (k === 'int' || k === 'wis') continue;
    const max = k === 'str' ? STR18(100) : 18;
    const bonus = abon(ctx.state, k);
    const base = a[k] - bonus;
    const v = Math.max(3, Math.min(max, base + ctx.rng.rn2(5) - 2));
    a[k] = acurrClamp(k, v + bonus);
  }
}

// ---------------------------------------------------------------------------------------------
// lycanthropy

/**
 * The lycanthrope turns into her beast: not while Unchanging or already in it; with polymorph
 * control she is asked "Do you want to change into a jackal?"; without, not while a hostile
 * monster is next to her. ref: src/were.c you_were()
 */
export function youWere(ctx: Ctx): void {
  const lycn = ulycn(ctx.state);
  if (lycn === null) return;
  const h = getPlayer(ctx.state);
  if (hasProp(h, P.UNCHANGING) || heroFormId(ctx.state) === lycn) return;
  if (controllablePoly(ctx)) {
    if (ctx.state.pendingPrompt !== null) return; // (paranoid_query()'s no)
    ctx.ask(
      {
        id: 'poly-were',
        kind: 'yn',
        key: 'polyself.were_prompt',
        params: { beast: `@were.beast.${lycn}` },
        cancellable: true,
      },
      POLYSELF_ID,
      { stage: 'were', cap: false } as unknown as Json,
    );
    return;
  }
  if (monsterNearby(ctx)) return;
  polymon(ctx, lycn, false);
}

/**
 * you_unwere()'s polymorphed half: in a were form, not Unchanging and with no hostile monster
 * next to her, she returns to her own form (with polymorph control only if she says no to "Remain
 * in beast form?"); otherwise, with no time left, the form lasts rn1(200, 200) more turns.
 * ref: src/were.c you_unwere()
 */
function unwereForm(ctx: Ctx): void {
  const form = heroForm(ctx);
  if (!form || !isWere(form)) return;
  if (!hasProp(getPlayer(ctx.state), P.UNCHANGING) && !monsterNearby(ctx)) {
    if (!controllablePoly(ctx)) {
      rehumanize(ctx);
      return;
    }
    if (ctx.state.pendingPrompt === null) {
      ctx.ask(
        { id: 'poly-remain', kind: 'yn', key: 'polyself.remain_beast', cancellable: true },
        POLYSELF_ID,
        { stage: 'remain', cap: false } as unknown as Json,
      );
      return;
    }
  }
  remainBeast(ctx);
}

/** 40% of the initial were change. */
function remainBeast(ctx: Ctx): void {
  const u = upolyOf(ctx.state);
  if (u && !u.mtimedone) u.mtimedone = ctx.rng.rn2(200) + 200; // rn1(200, 200)
}

/** The answers to polyself()'s, you_were()'s and you_unwere()'s prompts. Offered nowhere. */
export const polyselfAction: ActionDef = {
  id: POLYSELF_ID,
  labelKey: 'action.nh:polyself',
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer(ctx, value, raw) {
    const data = raw as unknown as PolyData;
    if (data.stage === 'what') answerForm(ctx, value, data);
    else if (data.stage === 'were') {
      const lycn = ulycn(ctx.state);
      if (value === true && lycn !== null) polymon(ctx, lycn, false);
    } else if (value === true) remainBeast(ctx);
    else {
      const form = heroForm(ctx);
      if (form && isWere(form)) rehumanize(ctx);
    }
    return 0;
  },
};

// ---------------------------------------------------------------------------------------------
// the polymorph trap

/**
 * The hero on a polymorph trap: "You step onto a polymorph trap!"; iron shoes (or kicking boots)
 * use the trap up and warp into kicking boots (or iron shoes): "Your pair of hard shoes warps
 * strangely." and the new inventory line; magic resistance or Unchanging: "You feel momentarily
 * different." and the trap stays; otherwise the trap is used up, "You feel a change coming over
 * you." and she polymorphs. ref: src/trap.c trapeffect_poly_trap() for the hero (no steed)
 */
function polyTrapYou(ctx: Ctx, trap: Trap): void {
  const h = getPlayer(ctx.state);
  const p = h.c.pos;
  if (!p) return;
  seetrap(trap);
  // u_locomotion("step"): "float" while levitating (no Flying here)
  say(ctx, levitating(ctx) ? 'polytrap.float_onto' : 'polytrap.step_onto');
  const shoes = ironShoes(ctx, h.id);
  if (shoes) {
    deltrap(ctx, p.level, trap);
    say(ctx, 'polytrap.warps', { item: xnameOf(ctx.state, ctx.defs, shoes) });
    const boots = polyObj(ctx, shoes, warpedBoots(shoes));
    if (boots.c.item?.carriedBy === h.id) prinv(ctx, boots);
    return;
  }
  if (hasProp(h, P.ANTIMAGIC) || hasProp(h, P.UNCHANGING)) {
    // shieldeff() is not shown; trap did nothing; don't remove it --KAA
    say(ctx, 'polytrap.momentarily_different');
    return;
  }
  deltrap(ctx, p.level, trap); // delete trap before polymorph
  say(ctx, 'polytrap.change_coming');
  polyself(ctx);
}

/**
 * A monster on a polymorph trap: its iron shoes (or kicking boots) warp into the other kind and
 * stay on; magic resistance shields it; otherwise unless it resists (a wand's saving throw) it
 * changes into a random monster ("The jackal turns into a gnome!") and the trap is seen when the
 * hero saw it. The trap stays. ref: src/trap.c trapeffect_poly_trap() for a monster
 */
function polyTrapMon(ctx: Ctx, mon: Entity, trap: Trap): TrapResult {
  const inSight = canseemon(ctx, mon);
  const shoes = ironShoes(ctx, mon.id);
  if (shoes) {
    // (taken off and put back on: the new boots stay worn)
    polyObj(ctx, shoes, warpedBoots(shoes));
  } else if (resistsMagm(ctx, mon)) {
    // shieldeff_mon(): not shown
  } else if (!resist(ctx, mon, 0, 'wand')) {
    newcham(ctx, mon, null, { msg: true });
    if (inSight) seetrap(trap);
  }
  return 'finished';
}

/** Hands the polymorph trap's effects to trap.ts and rehumanize()/you_unwere() to upoly.ts. */
export function registerPolyTrap(): void {
  setTrapEffect(TRAP.poly, { you: polyTrapYou, mon: polyTrapMon });
  setRehumanize(rehumanize);
  setUnwere(unwereForm);
}

// ---------------------------------------------------------------------------------------------
// turn hooks

/**
 * The form's countdown (u.mtimedone): at 0 an Unchanging hero gets rnd(100 * level + 1) more
 * turns, a were form goes through you_unwere(), any other returns to human form; and the status
 * line's "HD:n" (the form's level) in place of "Xp". ref: src/timeout.c nh_timeout(); src/botl.c
 */
export function registerPolyTimeout(api: ModApi): void {
  api.defineAction(polyselfAction);
  api.defineStatus({
    id: 'nh:hd',
    field: 'hd',
    value: (state, defs) => {
      const id = heroFormId(state);
      return id !== null && defs.isMonster(id) ? defs.monster(id).level : null;
    },
  });
  api.on('endOfTurn', (ctx) => {
    if (ctx.state.gameOver) return;
    const u = upolyOf(ctx.state);
    if (!u || !u.mtimedone) return;
    u.mtimedone--;
    if (u.mtimedone) return;
    const form = heroForm(ctx);
    if (hasProp(getPlayer(ctx.state), P.UNCHANGING))
      u.mtimedone = ctx.rng.rnd(100 * (form?.level ?? 0) + 1);
    else if (form && isWere(form))
      unwereForm(ctx); // if polycontrl, asks whether to rehumanize
    else rehumanizeLate(ctx);
  });
}

type Change = 0 | 1 | 2;
const changeOf = (ctx: Ctx): Change => {
  const nh = ctx.state.modData['nh'] as { mvlChange?: Change } | undefined;
  return nh?.mvlChange ?? 0;
};
function setChange(ctx: Ctx, c: Change): void {
  const nh = ctx.state.modData['nh'] as { mvlChange?: Change } | undefined;
  if (c) ((ctx.state.modData['nh'] ??= {}) as { mvlChange?: Change }).mvlChange = c;
  else if (nh && nh.mvlChange !== undefined) delete nh.mvlChange;
}

/**
 * Polymorphitis and lycanthropy, once a turn after teleportitis: with Polymorph 1 turn in 100
 * she polymorphs, else a lycanthrope in her own form changes 1 turn in 80 (no night: no clock);
 * not while Unchanging, and a change due while she is helpless waits for her (mvl_change, kept in
 * `modData.nh.mvlChange`). ref: src/allmain.c moveloop_core()
 */
export function registerPolymorphitis(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    if (ctx.state.gameOver || uState(ctx.state).uinvulnerable) return;
    const h = getPlayer(ctx.state);
    let change = changeOf(ctx);
    // delayed change may not be valid anymore
    if ((change === 1 && !hasProp(h, P.POLYMORPH)) || (change === 2 && ulycn(ctx.state) === null))
      change = 0;
    if (hasProp(h, P.POLYMORPH) && !ctx.rng.rn2(100)) change = 1;
    else if (ulycn(ctx.state) !== null && !upolyOf(ctx.state) && !ctx.rng.rn2(80)) change = 2;
    if (change && !hasProp(h, P.UNCHANGING) && !h.c.helpless) {
      ctx.interrupt(); // stop_occupation()
      if (change === 1) polyself(ctx);
      else youWere(ctx);
      change = 0;
    }
    setChange(ctx, change);
  });
}
