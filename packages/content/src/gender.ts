// The hero's gender (C's flags.female): `modData.nh.ugender`, 'female' or 'male'; absent means
// the role's start (the Valkyrie is always female at the start). Gendered messages pick their key
// from it, as C picks the word. A leaf module (core only).
// ref: src/polyself.c change_sex(), poly_gender(); include/you.h uhis()
//
// Not here yet: the polymorphed hero's form gender (u.mfemale, neuter and non-humanoid forms):
// 7f-d step 3.
import type { GameState, Json } from '@nh/core';

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
 * form). ref: src/polyself.c poly_gender() (no forms yet: her own gender)
 */
export function polyGender(state: Readonly<GameState>): 0 | 1 | 2 {
  return heroFemale(state) ? 1 : 0;
}

/**
 * The hero changes sex. ref: src/polyself.c change_sex() (unpolymorphed: flags.female flips; the
 * role name is the Valkyrie's either way; no forms yet)
 */
export function changeSex(state: GameState): void {
  setHeroFemale(state, !heroFemale(state));
}
