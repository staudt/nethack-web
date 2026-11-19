// Hero stats by role and race (roletab.ts, racetab.ts): initial attributes/HP/Pw/kit, HP and Pw
// regeneration and experience. A new game is still the human female neutral Valkyrie (urole.ts).
import type {
  AttributesComponent,
  Ctx,
  Entity,
  EntityId,
  GameState,
  ModApi,
  MonsterDef,
} from '@nh/core';
import { levelDifficulty } from './levdiff';
import { RACES_TAB, type RaceRow } from './racetab';
import { ROLES_TAB, enermod, type RoleRow } from './roletab';
import { type RaceKey, type RoleKey, roleIs, urace, urole } from './urole';
import { P, adjabil, hasProp } from './props';
import { uState } from './luck';
import { nearCapacity } from './stats';
import { pwOf, setPw } from './uenergy';
import { monhpPerLvl, ownHp, upolyd } from './upoly';
import { moreExperienced } from './urexp';

/** ref: include/global.h MAXULEV */
export const MAXULEV = 30;

/** ref: src/attrib.c rnd_attr(): A_MAX (6) when the distribution runs out */
function rndAttr(ctx: Ctx, attrdist: readonly number[]): number {
  let x = ctx.rng.rn2(100);
  let i = 0;
  for (; i < attrdist.length; i++) {
    x -= attrdist[i] ?? 0;
    if (x < 0) break;
  }
  return i;
}

/** ref: src/attrib.c init_attr_role_redist() */
function redistribute(
  ctx: Ctx,
  a: number[],
  np: number,
  addition: boolean,
  role: RoleRow,
  race: RaceRow,
): number {
  const adj = addition ? 1 : -1;
  let tryct = 0;
  while ((addition ? np > 0 : np < 0) && tryct < 100) {
    const i = rndAttr(ctx, role.attrdist);
    const v = a[i];
    if (
      v === undefined ||
      (addition ? v >= (race.attrmax[i] ?? 18) : v <= (race.attrmin[i] ?? 3))
    ) {
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
 * The role's base values, then `np` total points distributed by the role's attrdist within the
 * race's limits (Str Int Wis Dex Con Cha). ref: src/attrib.c init_attr(), init_attr_role_redist()
 */
export function initAttr(ctx: Ctx, np: number, roleKey: RoleKey, raceKey: RaceKey): number[] {
  const role = ROLES_TAB[roleKey];
  const race = RACES_TAB[raceKey];
  const a: number[] = [...role.attrbase];
  for (const b of role.attrbase) np -= b;
  // distribute leftover points
  np = redistribute(ctx, a, np, true, role, race);
  // if we went over, remove points
  redistribute(ctx, a, np, false, role, race);
  return a;
}

/**
 * Minor variation: each attribute 1 in 20 changes by -2..+4, within the race's limits.
 * ref: src/attrib.c vary_init_attr(), adjattrib() (positive: clamp to max; negative: to min)
 */
export function varyInitAttr(ctx: Ctx, a: number[], raceKey: RaceKey): void {
  const race = RACES_TAB[raceKey];
  for (let i = 0; i < a.length; i++) {
    if (ctx.rng.rn2(20) === 0) {
      const xd = ctx.rng.rn2(7) - 2; // biased variation
      const next = (a[i] ?? 0) + xd;
      a[i] = Math.max(race.attrmin[i] ?? 3, Math.min(race.attrmax[i] ?? 18, next));
    }
  }
}

/**
 * Initial attributes: init_attr(75), then vary_init_attr(). ref: src/u_init.c
 * u_init_inventory_attrs() (kit.ts runs it, then the carry boost). The AMAX peak value is not
 * stored (we store only the current value).
 */
export function initialAttributes(
  ctx: Ctx,
  roleKey: RoleKey = urole(ctx.state),
  raceKey: RaceKey = urace(ctx.state),
): AttributesComponent {
  const a = initAttr(ctx, 75, roleKey, raceKey);
  varyInitAttr(ctx, a, raceKey);
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
 * Hit points gained: at level 0 (hero creation) the initial value, else the per-level gain, by
 * her role's and race's hpadv. ref: src/attrib.c newhp(). `ulevel` is the level before it is
 * incremented. (The alignment record set at level 0 is m22 step 4.)
 */
export function newhp(ctx: Ctx, ulevel: number, con: number, maxHp = 0): number {
  const roleRow = ROLES_TAB[urole(ctx.state)];
  const role = roleRow.hpadv;
  const race = RACES_TAB[urace(ctx.state)].hpadv;
  let hp: number;
  if (ulevel === 0) {
    hp = role.infix + race.infix;
    if (role.inrnd > 0) hp += ctx.rng.rnd(role.inrnd);
    if (race.inrnd > 0) hp += ctx.rng.rnd(race.inrnd);
    // no Con adjustment for initial hit points
  } else {
    if (ulevel < roleRow.xlev) {
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

/**
 * Energy gained: at level 0 (hero creation) the initial value, else the per-level gain.
 * ref: src/exper.c newpw(), enermod() (her role's and race's enadv, the role's xlev and
 * modifier). `ulevel` is the level before it is incremented and `wis` is
 * ACURR(A_WIS). `uenmax` is only used for the post-30 throttle. pluslvl() records the gain
 * (u.ueninc[]).
 */
export function newpw(ctx: Ctx, ulevel: number, wis: number, uenmax = 0): number {
  const roleKey = urole(ctx.state);
  const roleRow = ROLES_TAB[roleKey];
  const role = roleRow.enadv;
  const race = RACES_TAB[urace(ctx.state)].enadv;
  let en: number;
  if (ulevel === 0) {
    en = role.infix + race.infix;
    if (role.inrnd > 0) en += ctx.rng.rnd(role.inrnd);
    if (race.inrnd > 0) en += ctx.rng.rnd(race.inrnd);
  } else {
    let enrnd = Math.trunc(wis / 2);
    let enfix: number;
    if (ulevel < roleRow.xlev) {
      enrnd += role.lornd + race.lornd;
      enfix = role.lofix + race.lofix;
    } else {
      enrnd += role.hirnd + race.hirnd;
      enfix = role.hifix + race.hifix;
    }
    en = enermod(roleKey, ctx.rng.rn2(enrnd) + enfix); // rn1(enrnd, enfix)
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
 * The level-drain bookkeeping in `modData.nh` (open question 10 of the m9 plan): `uhpinc` and
 * `ueninc` map a level to the hit points and energy gained when leaving it (C's u.uhpinc[] and
 * u.ueninc[], recorded by pluslvl() from m9 step 7 on), and `ulevelmax` is the highest level
 * reached, stored only while it is above the current level (after a level was lost).
 * ref: include/you.h uhpinc, ueninc, ulevelmax
 */
interface LevelData {
  uhpinc?: Record<string, number>;
  ueninc?: Record<string, number>;
  ulevelmax?: number;
}

function levelData(ctx: Pick<Ctx, 'state'>, create: boolean): LevelData | null {
  const md = ctx.state.modData;
  let d = md['nh'] as unknown as LevelData | undefined;
  if (typeof d !== 'object' || d === null) {
    if (!create) return null;
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
}

/** The hit points (`hp`) and energy (`en`) gained when leaving `level`. */
function recordIncrements(ctx: Pick<Ctx, 'state'>, level: number, hp: number, en: number): void {
  const d = levelData(ctx, true);
  if (!d) return;
  (d.uhpinc ??= {})[String(level)] = hp;
  (d.ueninc ??= {})[String(level)] = en;
}

/**
 * u.uhpinc[level] and u.ueninc[level]: what leaving `level` gave. A level gained before m9 step 7
 * (an older save) has no record: the average gain per level above the initial value instead.
 */
export function levelIncrements(
  ctx: Pick<Ctx, 'state'>,
  level: number,
  hpmax: number,
  uenmax: number,
  ulevel: number,
): { hp: number; en: number } {
  const d = levelData(ctx, false);
  // ref: src/role.c her role's and race's hpadv/enadv `infix`: the initial values (an old save is
  // a Valkyrie, whose `inrnd`s are 0)
  const role = ROLES_TAB[urole(ctx.state)];
  const race = RACES_TAB[urace(ctx.state)];
  const initialHp = role.hpadv.infix + race.hpadv.infix;
  const initialEn = role.enadv.infix + race.enadv.infix;
  const avg = (max: number, initial: number): number =>
    ulevel > 1 ? Math.max(Math.floor((max - initial) / (ulevel - 1)), 0) : 0;
  return {
    hp: d?.uhpinc?.[String(level)] ?? avg(hpmax, initialHp),
    en: d?.ueninc?.[String(level)] ?? avg(uenmax, initialEn),
  };
}

/** u.ulevelmax: the highest experience level reached (the current one unless levels were lost). */
export function ulevelmax(ctx: Pick<Ctx, 'state'>, ulevel: number): number {
  return Math.max(levelData(ctx, false)?.ulevelmax ?? 0, ulevel);
}

/** Sets u.ulevelmax; stored only while it is above the current level. */
export function setUlevelmax(ctx: Pick<Ctx, 'state'>, value: number, ulevel: number): void {
  if (value > ulevel) {
    const d = levelData(ctx, true);
    if (d) d.ulevelmax = value;
  } else {
    const d = levelData(ctx, false);
    if (d && d.ulevelmax !== undefined) delete d.ulevelmax;
  }
}

/**
 * Gains one experience level: HP, then Pw, then the level and its intrinsics. `incr` is true for
 * experience growth and false for a level gained outright ("You feel more experienced.").
 * The gains are recorded for level drain (u.uhpinc[], u.ueninc[]), and a level lost before is
 * welcomed back. While polymorphed the form gains monhp_per_lvl() hit points first, then her own
 * (parked) ones grow. ref: src/exper.c pluslvl(), src/attrib.c newhp(), src/exper.c newpw(). No
 * rank achievements or livelog.
 */
export function pluslvl(ctx: Ctx, heroId: EntityId, incr: boolean): void {
  const hero = ctx.state.entities[String(heroId)];
  const xp = hero?.c.experience;
  const hp = heroId === ctx.state.playerId ? ownHp(ctx.state) : hero?.c.hp;
  if (!hero || !xp || !hp) return;
  if (!incr) ctx.emit({ type: 'msg', key: 'exp.more_experienced' });
  // increase hit points (when polymorphed, do monster form first in order to retain normal
  // human/whatever increase for later)
  const mh = hero.c.hp;
  if (upolyd(ctx.state) && mh) {
    const hpinc = monhpPerLvl(ctx);
    mh.cur += hpinc;
    mh.max += hpinc; // setuhpmax(u.mhmax + hpinc, FALSE)
    if (mh.cur > mh.max) mh.cur = mh.max;
  }
  const inc = newhp(ctx, xp.level, hero.c.attributes?.con ?? 10, hp.max);
  hp.cur += inc;
  hp.max += inc;
  if (hp.cur > hp.max) hp.cur = hp.max; // setuhpmax()
  // increase spell power/energy points
  const pw = pwOf(ctx.state);
  const eninc = newpw(ctx, xp.level, hero.c.attributes?.wis ?? 10, pw.uenmax);
  const uenmax = pw.uenmax + eninc;
  setPw(ctx, { uenmax, uenpeak: Math.max(pw.uenpeak, uenmax), uen: pw.uen + eninc });
  // remember the increments; future level drain could take them away again
  if (xp.level < MAXULEV) recordIncrements(ctx, xp.level, inc, eninc);
  if (xp.level < MAXULEV) {
    if (incr) {
      const next = newuexp(xp.level + 1);
      if (xp.points >= next) xp.points = next - 1;
    } else {
      xp.points = newuexp(xp.level);
    }
    const max = ulevelmax(ctx, xp.level);
    xp.level += 1;
    ctx.emit({
      type: 'msg',
      key: max < xp.level ? 'exp.welcome' : 'exp.welcome_back',
      params: { level: xp.level },
    });
    setUlevelmax(ctx, Math.max(max, xp.level), xp.level);
    adjabil(ctx, heroId, xp.level - 1, xp.level);
  }
}

/** ref: include/global.h LARGEST_INT */
const LARGEST_INT = 32767;

/**
 * A random experience total within the current level's range (at level 30 when `gaining`, added
 * to her points so that a blessed potion never lowers them). ref: src/exper.c rndexp()
 */
export function rndexp(ctx: Ctx, ulevel: number, uexp: number, gaining: boolean): number {
  const minexp = ulevel === 1 ? 0 : newuexp(ulevel - 1);
  const maxexp = newuexp(ulevel);
  let diff = maxexp - minexp;
  let factor = 1;
  // make sure that `diff' is an argument which rn2() can handle
  while (diff >= LARGEST_INT) {
    diff = Math.trunc(diff / 2);
    factor *= 2;
  }
  let result = minexp + factor * ctx.rng.rn2(diff);
  if (ulevel === MAXULEV && gaining) {
    result += uexp - minexp;
    if (result < uexp) result = uexp;
  }
  return result;
}

/**
 * Adds experience points and, if a threshold is crossed, gains ONE level. NetHack does the same:
 * pluslvl() caps points at newuexp(level+1)-1, so a huge award takes several kills to cash in.
 * ref: src/exper.c more_experienced(), newexplevel()
 */
export function gainExperience(ctx: Ctx, heroId: EntityId, exp: number): void {
  const xp = ctx.state.entities[String(heroId)]?.c.experience;
  if (!xp) return;
  xp.points += exp; // more_experienced(): u.uexp
  moreExperienced(ctx, exp, 0); // u.urexp += 4 * exp
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
  if (upolyd(state)) {
    regenFormHp(ctx, hero, hp);
    return;
  }
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
 * The polymorphed hero's form (u.mh) heals 1 point on turns divisible by 20 while not Stressed,
 * or every turn with Regeneration (a form like a troll's gives it). Her own hit points do not
 * heal meanwhile. ref: src/allmain.c regen_hp() Upolyd (no eels: no such forms; `u.umoved` is
 * not kept, so a Stressed hero never heals this way)
 */
function regenFormHp(ctx: Ctx, hero: Entity, hp: { cur: number; max: number }): void {
  const sleeping = hasProp(hero, P.SLEEPY) && hero.c.helpless?.reasonKey === 'helpless.asleep';
  const canRegen = hasProp(hero, P.REGENERATION) || sleeping; // U_CAN_REGEN()
  const encumbranceOk = nearCapacity(ctx.state, ctx.defs, hero.id) < MOD_ENCUMBER;
  if (canRegen || (encumbranceOk && ctx.state.turn % 20 === 0))
    hp.cur = Math.min(hp.cur + 1, hp.max);
}

/**
 * Energy regeneration: on the turns where `moves % ((MAXULEV + 8 - ulevel) * 4 / 6)` is 0 (`* 3`
 * for a Wizard), unless Stressed or worse, she gains `rn1((Wis + Int) / 15 + 1, 1)`.
 * ref: src/allmain.c regen_pw(): also every turn with Energy_regeneration (the Mitre of Holiness
 * and the Eye of the Aethiopica carried). No magical breathing source exists.
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
  if (
    !(
      wtcap < MOD_ENCUMBER &&
      state.turn % Math.trunc(((MAXULEV + 8 - ulevel) * (roleIs(state, 'wizard') ? 3 : 4)) / 6) ===
        0
    ) &&
    !hasProp(hero, P.ENERGY_REGENERATION)
  )
    return;
  const a = hero.c.attributes;
  const upper = Math.trunc(((a?.wis ?? 10) + (a?.int ?? 10)) / 15) + 1;
  setPw(ctx, { uen: Math.min(pw.uen + ctx.rng.rn2(upper) + 1, pw.uenmax) }); // rn1(upper, 1)
}

/** Registers the hero hooks through the public ModApi. */
export function registerHero(api: ModApi): void {
  // the newGame hook (u_init) is kit.ts's registerKit()
  // ref: src/allmain.c moveloop_core(): regen_hp() then regen_pw()
  api.on('endOfTurn', regenHp);
  api.on('endOfTurn', regenPw);
  // the bottom line's `Pw:2(2)`; ref: src/botl.c bot2() (BL_ENE, BL_ENEMAX)
  api.defineStatus({ id: 'nh:pw', field: 'pw', value: (state) => pwOf(state).uen });
  api.defineStatus({ id: 'nh:pwmax', field: 'pwmax', value: (state) => pwOf(state).uenmax });
  // A Tourist gains experience for each new level she enters (level_difficulty() points); the
  // level is made in `newLevel` right before she arrives (`tourNewLevel` marks it).
  // ref: src/do.c goto_level() `if (new) ... Role_if(PM_TOURIST)`
  api.on('newLevel', (ctx, level) => {
    if (roleIs(ctx.state, 'tourist')) nhRecord(ctx.state)['tourNewLevel'] = level.id;
  });
  api.on('levelChange', (ctx, change) => {
    const nh = nhRecord(ctx.state);
    if (nh['tourNewLevel'] === undefined) return;
    const fresh = nh['tourNewLevel'] === change.to && change.from !== null;
    delete nh['tourNewLevel'];
    if (fresh && roleIs(ctx.state, 'tourist')) {
      const to = ctx.state.levels[change.to];
      // more_experienced(level_difficulty(), 0) on the new level
      gainExperience(ctx, ctx.state.playerId, to ? levelDifficulty(ctx, to) : 1);
    }
  });
}

/** `modData.nh` as a record (made when missing). */
function nhRecord(state: GameState): Record<string, unknown> {
  let nh = state.modData['nh'];
  if (nh === null || typeof nh !== 'object' || Array.isArray(nh)) {
    nh = {};
    state.modData['nh'] = nh;
  }
  return nh as Record<string, unknown>;
}
