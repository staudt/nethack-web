// Hero stats for the stub Valkyrie: initial attributes/HP/Pw/kit, HP and Pw regeneration and experience.
import type { AttributesComponent, Ctx, EntityId, ModApi, MonsterDef } from '@nh/core';
import { giveStartingKit } from './kit';
import { P, adjabil, hasProp } from './props';
import { uState } from './luck';
import { nearCapacity } from './stats';
import { pwOf, setPw } from './uenergy';

/**
 * The stub hero is a human, female, neutral Valkyrie. ref: src/role.c roles[] Valkyrie allows
 * MH_HUMAN|MH_DWARF, ROLE_FEMALE, ROLE_LAWFUL|ROLE_NEUTRAL; human allows all alignments.
 * (Neutral humans are the common choice; alignment has no mechanical effect in M2.)
 */
export const HERO_RACE = 'human';

/** ref: include/attrib.h STR18 */
const STR18 = (x: number): number => 18 + x;

/** ref: src/role.c roles[] Valkyrie: Str Int Wis Dex Con Cha */
const VALK_ATTRBASE = [10, 7, 7, 7, 10, 7] as const;
const VALK_ATTRDIST = [30, 6, 7, 20, 30, 7] as const;
/** ref: src/role.c races[] human attrmin/attrmax */
const HUMAN_ATTRMIN = 3;
const HUMAN_ATTRMAX = [STR18(100), 18, 18, 18, 18, 18] as const;

/** ref: src/role.c struct RoleAdvance: infix, inrnd, lofix, lornd, hifix, hirnd */
interface HpAdvance {
  infix: number;
  inrnd: number;
  lofix: number;
  lornd: number;
  hifix: number;
  hirnd: number;
}
/** ref: src/role.c roles[] Valkyrie hpadv `{ 14, 0, 0, 8, 2, 0 }` */
const VALK_HPADV: HpAdvance = { infix: 14, inrnd: 0, lofix: 0, lornd: 8, hifix: 2, hirnd: 0 };
/** ref: src/role.c races[] human hpadv `{ 2, 0, 0, 2, 1, 0 }` */
const HUMAN_HPADV: HpAdvance = { infix: 2, inrnd: 0, lofix: 0, lornd: 2, hifix: 1, hirnd: 0 };
/** ref: src/role.c roles[] Valkyrie enadv `{ 1, 0, 0, 1, 0, 1 }` (Energy) */
const VALK_ENADV: HpAdvance = { infix: 1, inrnd: 0, lofix: 0, lornd: 1, hifix: 0, hirnd: 1 };
/** ref: src/role.c races[] human enadv `{ 1, 0, 2, 0, 2, 0 }` (Energy) */
const HUMAN_ENADV: HpAdvance = { infix: 1, inrnd: 0, lofix: 2, lornd: 0, hifix: 2, hirnd: 0 };
/** ref: src/role.c roles[] Valkyrie xlev (cutoff level between lo and hi hp advance) */
const VALK_XLEV = 10;
/** ref: include/global.h MAXULEV */
export const MAXULEV = 30;

/** ref: src/attrib.c rnd_attr() */
function rndAttr(ctx: Ctx): number {
  let x = ctx.rng.rn2(100);
  let i = 0;
  for (; i < VALK_ATTRDIST.length; i++) {
    x -= VALK_ATTRDIST[i] ?? 0;
    if (x < 0) break;
  }
  return i;
}

/** ref: src/attrib.c init_attr_role_redist() */
function redistribute(ctx: Ctx, a: number[], np: number, addition: boolean): number {
  const adj = addition ? 1 : -1;
  let tryct = 0;
  while ((addition ? np > 0 : np < 0) && tryct < 100) {
    const i = rndAttr(ctx);
    const v = a[i];
    if (v === undefined || (addition ? v >= (HUMAN_ATTRMAX[i] ?? 18) : v <= HUMAN_ATTRMIN)) {
      tryct++;
      continue;
    }
    tryct = 0;
    a[i] = v + adj;
    np -= adj;
  }
  return np;
}

/**
 * Initial attributes: role base values, then 75 total points distributed by attrdist, then the
 * 1-in-20 per-attribute variation. ref: src/attrib.c init_attr(), vary_init_attr();
 * src/u_init.c u_init_inventory_attrs() (init_attr(75)). Skipped: u_init_carry_attr_boost
 * (no inventory weight in M2); the AMAX peak value (we store only the current value).
 */
export function initialAttributes(ctx: Ctx): AttributesComponent {
  const a: number[] = [...VALK_ATTRBASE];
  let np = 75;
  for (const b of VALK_ATTRBASE) np -= b;
  np = redistribute(ctx, a, np, true);
  redistribute(ctx, a, np, false);
  // ref: src/attrib.c vary_init_attr()
  for (let i = 0; i < a.length; i++) {
    if (ctx.rng.rn2(20) === 0) {
      const xd = ctx.rng.rn2(7) - 2; // biased variation
      // ref: src/attrib.c adjattrib() (positive: clamp to max; negative: clamp to min)
      const next = (a[i] ?? 0) + xd;
      a[i] = Math.max(HUMAN_ATTRMIN, Math.min(HUMAN_ATTRMAX[i] ?? 18, next));
    }
  }
  const [str = 0, int = 0, wis = 0, dex = 0, con = 0, cha = 0] = a;
  return { str, int, wis, dex, con, cha };
}

/** ref: src/attrib.c newhp() Con adjustment */
function conPlus(con: number): number {
  if (con <= 3) return -2;
  if (con <= 6) return -1;
  if (con <= 14) return 0;
  if (con <= 16) return 1;
  if (con === 17) return 2;
  if (con === 18) return 3;
  return 4;
}

/**
 * Hit points gained: at level 0 (hero creation) the initial value, else the per-level gain.
 * ref: src/attrib.c newhp(). `ulevel` is the level before it is incremented.
 */
export function newhp(ctx: Ctx, ulevel: number, con: number, maxHp = 0): number {
  const role = VALK_HPADV;
  const race = HUMAN_HPADV;
  let hp: number;
  if (ulevel === 0) {
    hp = role.infix + race.infix;
    if (role.inrnd > 0) hp += ctx.rng.rnd(role.inrnd);
    if (race.inrnd > 0) hp += ctx.rng.rnd(race.inrnd);
    // no Con adjustment for initial hit points
  } else {
    if (ulevel < VALK_XLEV) {
      hp = role.lofix + race.lofix;
      if (role.lornd > 0) hp += ctx.rng.rnd(role.lornd);
      if (race.lornd > 0) hp += ctx.rng.rnd(race.lornd);
    } else {
      hp = role.hifix + race.hifix;
      if (role.hirnd > 0) hp += ctx.rng.rnd(role.hirnd);
      if (race.hirnd > 0) hp += ctx.rng.rnd(race.hirnd);
    }
    hp += conPlus(con);
  }
  if (hp <= 0) hp = 1;
  if (ulevel >= MAXULEV) {
    // after level 30, throttle gains; ref: src/attrib.c newhp()
    const lim = Math.max(5 - Math.trunc(maxHp / 300), 1);
    if (hp > lim) hp = lim;
  }
  return hp;
}

/** The role's energy modifier; the Valkyrie's is 3/4. ref: src/exper.c enermod() */
const enermod = (en: number): number => Math.trunc((3 * en) / 4);

/**
 * Energy gained: at level 0 (hero creation) the initial value, else the per-level gain.
 * ref: src/exper.c newpw(). `ulevel` is the level before it is incremented and `wis` is
 * ACURR(A_WIS). `uenmax` is only used for the post-30 throttle. No u.ueninc[] record (nothing
 * drains levels).
 */
export function newpw(ctx: Ctx, ulevel: number, wis: number, uenmax = 0): number {
  const role = VALK_ENADV;
  const race = HUMAN_ENADV;
  let en: number;
  if (ulevel === 0) {
    en = role.infix + race.infix;
    if (role.inrnd > 0) en += ctx.rng.rnd(role.inrnd);
    if (race.inrnd > 0) en += ctx.rng.rnd(race.inrnd);
  } else {
    let enrnd = Math.trunc(wis / 2);
    let enfix: number;
    if (ulevel < VALK_XLEV) {
      enrnd += role.lornd + race.lornd;
      enfix = role.lofix + race.lofix;
    } else {
      enrnd += role.hirnd + race.hirnd;
      enfix = role.hifix + race.hifix;
    }
    en = enermod(ctx.rng.rn2(enrnd) + enfix); // rn1(enrnd, enfix)
  }
  if (en <= 0) en = 1;
  if (ulevel >= MAXULEV) {
    // after level 30, throttle energy gains; ref: src/exper.c newpw()
    const lim = Math.max(4 - Math.trunc(uenmax / 200), 1);
    if (en > lim) en = lim;
  }
  return en;
}

/** Experience points needed to leave level `lev`. ref: src/exper.c newuexp() */
export function newuexp(lev: number): number {
  if (lev < 1) return 0;
  if (lev < 10) return 10 * 2 ** lev;
  if (lev < 20) return 10000 * 2 ** (lev - 10);
  return 10000000 * (lev - 19);
}

const NORMAL_SPEED = 12;

/** ref: include/monattk.h AT_*; attacks after AT_BUTT (butt = 4) in numeric order are "special". */
const PLAIN_ATTACKS = new Set(['claw', 'bite', 'kick', 'butt']);

/** Damage types between AD_PHYS and AD_BLND exclusive. ref: include/monattk.h AD_MAGM..AD_SPC2 */
const ELEMENTAL_AD = new Set([
  'magm',
  'fire',
  'cold',
  'slee',
  'disn',
  'elec',
  'drst',
  'acid',
  'spc1',
  'spc2',
]);
const DEADLY_AD = new Set(['drli', 'ston', 'slim']);

/**
 * Experience points for killing a monster of `def` at level `monLevel`.
 * ref: src/exper.c experience(). Skipped (not in our data): the eel AD_WRAP bonus, the mail
 * daemon override, and the revived/cloned kill-count reduction. find_mac() uses the base AC
 * (monsters wear no armor in M2); "extra nasty" is the `nasty` flag (M2_NASTY).
 */
export function experienceFor(def: MonsterDef, monLevel: number): number {
  let tmp = 1 + monLevel * monLevel;
  const ac = def.ac;
  if (ac < 3) tmp += (7 - ac) * (ac < 0 ? 2 : 1);
  if (def.speed > NORMAL_SPEED) tmp += def.speed > (3 * NORMAL_SPEED) / 2 ? 5 : 3;
  for (const atk of def.attacks) {
    if (PLAIN_ATTACKS.has(atk.at)) continue;
    if (atk.at === 'weapon') tmp += 5;
    else if (atk.at === 'magic') tmp += 10;
    else tmp += 3;
  }
  for (const atk of def.attacks) {
    const ad = atk.ad.toLowerCase();
    if (ELEMENTAL_AD.has(ad)) tmp += 2 * monLevel;
    else if (DEADLY_AD.has(ad)) tmp += 50;
    else if (ad !== 'phys') tmp += monLevel;
    if (atk.d * atk.n > 23) tmp += monLevel;
  }
  if (def.flags.includes('nasty')) tmp += 7 * monLevel;
  if (monLevel > 8) tmp += 50;
  return tmp;
}

/**
 * Gains one experience level: HP, then Pw, then the level and its intrinsics. `incr` is true for
 * experience growth and false for a level gained outright ("You feel more experienced.").
 * ref: src/exper.c pluslvl(). No polymorph, no level drain (no u.ulevelmax "back "), no rank
 * achievements or livelog.
 */
export function pluslvl(ctx: Ctx, heroId: EntityId, incr: boolean): void {
  const hero = ctx.state.entities[String(heroId)];
  const xp = hero?.c.experience;
  const hp = hero?.c.hp;
  if (!hero || !xp || !hp) return;
  if (!incr) ctx.emit({ type: 'msg', key: 'exp.more_experienced' });
  const inc = newhp(ctx, xp.level, hero.c.attributes?.con ?? 10, hp.max);
  hp.cur += inc;
  hp.max += inc;
  if (hp.cur > hp.max) hp.cur = hp.max; // setuhpmax()
  // increase spell power/energy points
  const pw = pwOf(ctx.state);
  const eninc = newpw(ctx, xp.level, hero.c.attributes?.wis ?? 10, pw.uenmax);
  const uenmax = pw.uenmax + eninc;
  setPw(ctx, { uenmax, uenpeak: Math.max(pw.uenpeak, uenmax), uen: pw.uen + eninc });
  if (xp.level < MAXULEV) {
    if (incr) {
      const next = newuexp(xp.level + 1);
      if (xp.points >= next) xp.points = next - 1;
    } else {
      xp.points = newuexp(xp.level);
    }
    xp.level += 1;
    ctx.emit({ type: 'msg', key: 'exp.welcome', params: { level: xp.level } });
    adjabil(ctx, heroId, xp.level - 1, xp.level);
  }
}

/**
 * Adds experience points and, if a threshold is crossed, gains ONE level. NetHack does the same:
 * pluslvl() caps points at newuexp(level+1)-1, so a huge award takes several kills to cash in.
 * ref: src/exper.c more_experienced(), newexplevel()
 */
export function gainExperience(ctx: Ctx, heroId: EntityId, exp: number): void {
  const xp = ctx.state.entities[String(heroId)]?.c.experience;
  if (!xp) return;
  xp.points += exp; // more_experienced()
  // newexplevel()
  if (xp.level < MAXULEV && xp.points >= newuexp(xp.level)) pluslvl(ctx, heroId, true);
}

/**
 * Natural HP regeneration for a non-polymorphed hero: each turn heals 1 with probability
 * (level + Con)% (NetHack 5.0 rule), plus 1 with Regeneration and 1 while asleep with Sleepy.
 * ref: src/allmain.c regen_hp() (called from moveloop_core when u.uhp < u.uhpmax)
 */
function regenHp(ctx: Ctx): void {
  const { state } = ctx;
  if (state.gameOver !== null) return;
  const hero = state.entities[String(state.playerId)];
  const hp = hero?.c.hp;
  if (!hero || !hp || hp.cur < 1 || hp.cur >= hp.max) return;
  if (uState(state).uinvulnerable) return; // "for the moment at least, you're in tiptop shape"
  const level = hero.c.experience?.level ?? 1;
  const con = hero.c.attributes?.con ?? 10;
  let heal = level + con > ctx.rng.rn2(100) ? 1 : 0;
  // U_CAN_REGEN(): Regeneration, or restful sleep while asleep
  if (hasProp(hero, P.REGENERATION)) heal += 1;
  if (hasProp(hero, P.SLEEPY) && hero.c.helpless?.reasonKey === 'helpless.asleep') heal++;
  if (heal) hp.cur = Math.min(hp.max, hp.cur + heal);
}

/** ref: include/hack.h MOD_ENCUMBER (Stressed) */
const MOD_ENCUMBER = 2;

/**
 * Energy regeneration: on the turns where `moves % ((MAXULEV + 8 - ulevel) * 4 / 6)` is 0 (the
 * Wizard's `* 3` never applies), unless Stressed or worse, she gains `rn1((Wis + Int) / 15 + 1, 1)`.
 * ref: src/allmain.c regen_pw(). No Energy_regeneration or magical breathing sources exist.
 * "You feel full of energy." comes from interrupt_multi(), which only speaks while a repeat count
 * runs (`multi > 0`, not running or travelling); the port has no repeat counts, so it is silent.
 */
export function regenPw(ctx: Ctx): void {
  const { state } = ctx;
  if (state.gameOver !== null) return;
  const hero = state.entities[String(state.playerId)];
  if (!hero) return;
  const pw = pwOf(state);
  if (pw.uen >= pw.uenmax) return;
  const ulevel = hero.c.experience?.level ?? 1;
  // mvl_wtcap is UNENCUMBERED while invulnerable (praying)
  const wtcap = uState(state).uinvulnerable ? 0 : nearCapacity(state, ctx.defs, hero.id);
  if (wtcap >= MOD_ENCUMBER) return;
  if (state.turn % Math.trunc(((MAXULEV + 8 - ulevel) * 4) / 6) !== 0) return;
  const a = hero.c.attributes;
  const upper = Math.trunc(((a?.wis ?? 10) + (a?.int ?? 10)) / 15) + 1;
  setPw(ctx, { uen: Math.min(pw.uen + ctx.rng.rn2(upper) + 1, pw.uenmax) }); // rn1(upper, 1)
}

/** Registers the hero hooks through the public ModApi. */
export function registerHero(api: ModApi): void {
  // ref: src/u_init.c u_init() -- attributes first (init_attr), then HP (newhp at ulevel 0), then
  // Pw (`u.uen = u.uenmax = u.uenpeak = newpw()`)
  api.on('newGame', (ctx, heroId) => {
    const hero = ctx.state.entities[String(heroId)];
    if (!hero) return;
    const attributes = initialAttributes(ctx);
    const max = newhp(ctx, 0, attributes.con);
    const en = newpw(ctx, 0, attributes.wis);
    hero.c.attributes = attributes;
    hero.c.hp = { cur: max, max };
    hero.c.experience = { level: 1, points: 0 };
    // ref: src/u_init.c u_init(): ini_inv(Valkyrie) and skill_init(Skill_V) after attributes and HP
    giveStartingKit(ctx, heroId);
    // written after the kit, which creates modData.nh with its inventory-letter counter
    setPw(ctx, { uen: en, uenmax: en, uenpeak: en });
  });
  // ref: src/allmain.c moveloop_core(): regen_hp() then regen_pw()
  api.on('endOfTurn', regenHp);
  api.on('endOfTurn', regenPw);
  // the bottom line's `Pw:2(2)`; ref: src/botl.c bot2() (BL_ENE, BL_ENEMAX)
  api.defineStatus({ id: 'nh:pw', field: 'pw', value: (state) => pwOf(state).uen });
  api.defineStatus({ id: 'nh:pwmax', field: 'pwmax', value: (state) => pwOf(state).uenmax });
}
