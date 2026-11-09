// The hero's gender (C's flags.female): `modData.nh.ugender`, 'female' or 'male'; absent means
// the role's start (the Valkyrie is always female at the start). Gendered messages pick their key
// from it, as C picks the word. A leaf module (core only).
// ref: src/polyself.c change_sex(), poly_gender(); include/you.h uhis()
// While polymorphed flags.female is the form's sex and her own is upoly.ts's `mfemale`.
import type { Ctx, GameState, Json } from '@nh/core';
import { upolyOf } from './upoly';

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/** flags.female: true unless the hero was made male (the amulet of change, newman()). */
export function heroFemale(state: Readonly<GameState>): boolean {
  const nh = state.modData['nh'];
  return !(isObj(nh) && nh['ugender'] === 'male');
}

/** Sets flags.female; the role's start (female) is stored as no entry. */
export function setHeroFemale(state: GameState, female: boolean): void {
  let nh = state.modData['nh'];
  if (!isObj(nh)) {
    if (female) return;
    nh = {};
    state.modData['nh'] = nh;
  }
  if (female) delete nh['ugender'];
  else nh['ugender'] = 'male';
}

/**
 * The hero's gender as monsters see it: 0 male, 1 female, 2 none (a neuter or non-humanoid
 * form). ref: src/polyself.c poly_gender()
 */
export function polyGender(state: Readonly<GameState>): 0 | 1 | 2 {
  if (upolyOf(state)?.neuter) return 2;
  return heroFemale(state) ? 1 : 0;
}

/**
 * The hero changes sex: flags.female flips unless her form is always one sex or neuter, and while
 * polymorphed her own sex (u.mfemale, restored when she returns) flips too. The role name is the
 * Valkyrie's either way. ref: src/polyself.c change_sex() (no amorous demon form)
 */
export function changeSex(ctx: Pick<Ctx, 'state' | 'defs'>): void {
  const u = upolyOf(ctx.state);
  const form = u && ctx.defs.isMonster(u.form) ? ctx.defs.monster(u.form) : null;
  const fixed =
    form !== null &&
    (form.flags.includes('male') || form.flags.includes('female') || form.flags.includes('neuter'));
  if (!u || !fixed) setHeroFemale(ctx.state, !heroFemale(ctx.state));
  if (u) u.mfemale = !u.mfemale; // poly'd: also change saved sex
}
