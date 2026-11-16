// The new game's character: which roles, races, genders and alignments go together, the defaults
// for what a new game leaves out, and the menus' data. Generic over whatever roles and races the
// loaded mods define. ref: src/role.c ok_role(), ok_race(), ok_gend(), ok_align()
import type { DefId, Params } from './types/common';
import type { Alignment, Character, Gender } from './types/entity';
import type { RaceDef, Registry, RoleDef } from './types/mod';
import type { CharacterChoices } from './types/protocol';

type RoleLike = Pick<RoleDef, 'id' | 'races' | 'genders' | 'aligns'>;
type RaceLike = Pick<RaceDef, 'id' | 'genders' | 'aligns'>;

/** The roles and races the checks read: a Registry or the menus' CharacterChoices. */
export interface CharacterSet {
  readonly roles: readonly RoleLike[];
  readonly races: readonly RaceLike[];
}

export const GENDERS: readonly Gender[] = ['male', 'female'];
/** ref: src/role.c aligns[] order */
export const ALIGNMENTS: readonly Alignment[] = [1, 0, -1];

const findRole = (cs: CharacterSet, id: DefId): RoleLike | undefined =>
  cs.roles.find((r) => r.id === id);
const findRace = (cs: CharacterSet, id: DefId): RaceLike | undefined =>
  cs.races.find((r) => r.id === id);

/**
 * Whether `c.role` goes with the race, gender and alignment `c` names (a field left out is
 * unconstrained); without `c.role`, whether any role does. An unknown role is never ok; an
 * unknown race fails the role check. ref: src/role.c ok_role()
 */
export function okRole(cs: CharacterSet, c: Partial<Character>): boolean {
  const one = (r: RoleLike): boolean =>
    (c.race === undefined || r.races.includes(c.race)) &&
    (c.gender === undefined || r.genders.includes(c.gender)) &&
    (c.align === undefined || r.aligns.includes(c.align));
  if (c.role === undefined) return cs.roles.some(one);
  const r = findRole(cs, c.role);
  return r !== undefined && one(r);
}

/** Whether `c.race` (any race when left out) goes with the role, gender and alignment. ref: ok_race() */
export function okRace(cs: CharacterSet, c: Partial<Character>): boolean {
  const role = c.role === undefined ? undefined : findRole(cs, c.role);
  if (c.role !== undefined && !role) return false;
  const one = (r: RaceLike): boolean =>
    (!role || role.races.includes(r.id)) &&
    (c.gender === undefined || r.genders.includes(c.gender)) &&
    (c.align === undefined || r.aligns.includes(c.align));
  if (c.race === undefined) return cs.races.some(one);
  const r = findRace(cs, c.race);
  return r !== undefined && one(r);
}

/**
 * Whether `c.gender` (any gender when left out) goes with the role and race; alignment does not
 * constrain gender. ref: src/role.c ok_gend()
 */
export function okGend(cs: CharacterSet, c: Partial<Character>): boolean {
  const role = c.role === undefined ? undefined : findRole(cs, c.role);
  const race = c.race === undefined ? undefined : findRace(cs, c.race);
  if ((c.role !== undefined && !role) || (c.race !== undefined && !race)) return false;
  const one = (g: Gender): boolean =>
    (!role || role.genders.includes(g)) && (!race || race.genders.includes(g));
  return c.gender === undefined ? GENDERS.some(one) : GENDERS.includes(c.gender) && one(c.gender);
}

/**
 * Whether `c.align` (any alignment when left out) goes with the role and race; gender does not
 * constrain alignment. ref: src/role.c ok_align()
 */
export function okAlign(cs: CharacterSet, c: Partial<Character>): boolean {
  const role = c.role === undefined ? undefined : findRole(cs, c.role);
  const race = c.race === undefined ? undefined : findRace(cs, c.race);
  if ((c.role !== undefined && !role) || (c.race !== undefined && !race)) return false;
  const one = (a: Alignment): boolean =>
    (!role || role.aligns.includes(a)) && (!race || race.aligns.includes(a));
  return c.align === undefined
    ? ALIGNMENTS.some(one)
    : ALIGNMENTS.includes(c.align) && one(c.align);
}

/** Every pair of choices in `c` goes together. */
export const okCharacter = (cs: CharacterSet, c: Partial<Character>): boolean =>
  okRole(cs, c) && okRace(cs, c) && okGend(cs, c) && okAlign(cs, c);

const describe = (c: Partial<Character>): string =>
  [c.align, c.gender, c.race, c.role]
    .filter((v) => v !== undefined)
    .map((v) => (typeof v === 'number' ? ['chaotic', 'neutral', 'lawful'][v + 1] : v))
    .join(' ');

/**
 * Fills in what `c` leaves out and checks the result. The defaults (plan m22 Q6): the first
 * registered role that can go with the rest, then that role's first race, gender and alignment
 * (in its own lists) that make a whole character. Throws for an unknown id or a forbidden
 * combination.
 */
export function resolveCharacter(registry: Registry, c: Partial<Character> = {}): Character {
  if (c.role !== undefined) registry.role(c.role);
  if (c.race !== undefined) registry.race(c.race);
  if (c.gender !== undefined && !GENDERS.includes(c.gender))
    throw new Error(`Unknown gender '${String(c.gender)}'`);
  if (c.align !== undefined && !ALIGNMENTS.includes(c.align))
    throw new Error(`Unknown alignment '${String(c.align)}'`);
  if (registry.roles.length === 0) throw new Error('No player role registered');
  const roles = c.role !== undefined ? [registry.role(c.role)] : registry.roles;
  for (const r of roles) {
    for (const race of c.race !== undefined ? [c.race] : r.races)
      for (const gender of c.gender !== undefined ? [c.gender] : r.genders)
        for (const align of c.align !== undefined ? [c.align] : r.aligns) {
          const full: Character = { role: r.id, race, gender, align };
          if (okCharacter(registry, full)) return full;
        }
  }
  throw new Error(`No character can be a ${describe(c)}`);
}

/** The roles in menu order (`order`, then registration) and the races, as plain data. */
export function characterChoices(registry: Registry): CharacterChoices {
  const ranked = registry.roles.map((r, i) => ({ r, key: r.order ?? Number.MAX_SAFE_INTEGER, i }));
  ranked.sort((a, b) => a.key - b.key || a.i - b.i);
  return {
    roles: ranked.map(({ r }) => ({
      id: r.id,
      nameKey: r.nameKey,
      ...(r.nameKeyFemale !== undefined ? { nameKeyFemale: r.nameKeyFemale } : {}),
      races: [...r.races],
      genders: [...r.genders],
      aligns: [...r.aligns],
    })),
    races: registry.races.map((r) => ({
      id: r.id,
      nameKey: r.nameKey,
      adjKey: r.adjKey,
      genders: [...r.genders],
      aligns: [...r.aligns],
    })),
  };
}

const ALIGN_KEYS: Record<Alignment, string> = {
  [-1]: 'align.chaotic',
  0: 'align.neutral',
  1: 'align.lawful',
};

/**
 * The `welcome` and `welcome.back` params: the role's name (female when she is and it has one),
 * the race's adjective, and the `gender.<g>` and `align.<lawful|neutral|chaotic>` keys the game
 * mods' catalogs define. ref: src/allmain.c welcome()
 */
export function welcomeParams(registry: Registry, c: Character): Params {
  const role = registry.role(c.role);
  const name = c.gender === 'female' ? (role.nameKeyFemale ?? role.nameKey) : role.nameKey;
  return {
    role: `@${name}`,
    race: `@${registry.race(c.race).adjKey}`,
    gender: `@gender.${c.gender}`,
    align: `@${ALIGN_KEYS[c.align]}`,
  };
}
