// Choosing the new game's character: "Shall I pick ... for you? [ynaq]", then the role, race,
// gender and alignment menus, each filtered by the choices made so far, and "Is this ok?". The
// facets the device options or the URL fix skip their menus. Random picks are the app's (outside
// the game RNG, plan m22 Q7): the worker only ever gets a whole, concrete character.
// ref: src/role.c genl_player_setup(), rigid_role_checks(), pick_role(), pick_race(), pick_gend(),
// pick_align(), randrole(), randrace(), randgend(), randalign(), root_plselection_prompt(),
// build_plselection_prompt(), plsel_startmenu(), setup_rolemenu(), setup_racemenu(),
// setup_gendmenu(), setup_algnmenu(), role_menu_extra(), str2role(), str2race(), str2gend(),
// str2align()
import { ALIGNMENTS, GENDERS, okAlign, okGend, okRace, okRole } from '@nh/core';
import type {
  Alignment,
  Character,
  CharacterChoices,
  DefId,
  Gender,
  RaceChoice,
  RoleChoice,
} from '@nh/core';
import { justAn, type MenuEntry } from '@nh/ui';

export const RANDOM = 'random';
type Random = typeof RANDOM;

/**
 * The facets a new game starts with: a value, "random", or absent (ask). C's `flags.initrole`,
 * `initrace`, `initgend`, `initalign` with ROLE_RANDOM and ROLE_NONE.
 */
export interface CharacterPrefs {
  role?: DefId | Random;
  race?: DefId | Random;
  gender?: Gender | Random;
  align?: Alignment | Random;
}

export interface CharacterDeps {
  showText(title: string, entries: MenuEntry[], onClose?: () => void): void;
  /** The game mods' message text (role and race names, gender and alignment words). */
  t(key: string): string;
  /** A random integer in [0, n): the app's, never the game's RNG. */
  rn2(n: number): number;
  /** The device's name, if any (the "Is this ok?" line). */
  name?: string | undefined;
}

const ALIGN_KEY: Record<Alignment, string> = {
  [-1]: 'align.chaotic',
  0: 'align.neutral',
  1: 'align.lawful',
};

/** What is fixed so far: the facets that are neither absent nor random. */
function fixed(p: CharacterPrefs): Partial<Character> {
  const c: Partial<Character> = {};
  if (p.role !== undefined && p.role !== RANDOM) c.role = p.role;
  if (p.race !== undefined && p.race !== RANDOM) c.race = p.race;
  if (p.gender !== undefined && p.gender !== RANDOM) c.gender = p.gender;
  if (p.align !== undefined && p.align !== RANDOM) c.align = p.align;
  return c;
}

const roleOf = (cs: CharacterChoices, id: DefId | undefined): RoleChoice | undefined =>
  id === undefined ? undefined : cs.roles.find((r) => r.id === id);
const raceOf = (cs: CharacterChoices, id: DefId | undefined): RaceChoice | undefined =>
  id === undefined ? undefined : cs.races.find((r) => r.id === id);

/** One of `set` at random, or undefined when it is empty. */
const oneOf = <T>(set: readonly T[], rn2: (n: number) => number): T | undefined =>
  set.length === 0 ? undefined : set[rn2(set.length)];

// ---- the candidates for each facet, given the others (C's loops over roles[], races[], ...)

/** ref: src/role.c pick_role() and setup_rolemenu(): ok_role, ok_race, ok_gend, ok_align */
const rolesFor = (cs: CharacterChoices, c: Partial<Character>): DefId[] =>
  cs.roles
    .map((r) => r.id)
    .filter((role) => {
      const x = { ...c, role };
      return okRole(cs, x) && okRace(cs, x) && okGend(cs, x) && okAlign(cs, x);
    });
/** ref: pick_race() (ok_race only) */
const racesFor = (cs: CharacterChoices, c: Partial<Character>): DefId[] =>
  cs.races.map((r) => r.id).filter((race) => okRace(cs, { ...c, race }));
/** ref: setup_racemenu(): ok_race, ok_role, ok_align */
const raceMenuFor = (cs: CharacterChoices, c: Partial<Character>): DefId[] =>
  racesFor(cs, c).filter((race) => okRole(cs, { ...c, race }) && okAlign(cs, { ...c, race }));
/** ref: pick_gend() (ok_gend only) */
const gendersFor = (cs: CharacterChoices, c: Partial<Character>): Gender[] =>
  GENDERS.filter((gender) => okGend(cs, { ...c, gender }));
/** ref: setup_gendmenu(): ok_gend, ok_role, ok_race */
const genderMenuFor = (cs: CharacterChoices, c: Partial<Character>): Gender[] =>
  gendersFor(cs, c).filter(
    (gender) => okRole(cs, { ...c, gender }) && okRace(cs, { ...c, gender }),
  );
/** ref: pick_align() (ok_align only) */
const alignsFor = (cs: CharacterChoices, c: Partial<Character>): Alignment[] =>
  ALIGNMENTS.filter((align) => okAlign(cs, { ...c, align }));
/** ref: setup_algnmenu(): ok_align, ok_role, ok_race */
const alignMenuFor = (cs: CharacterChoices, c: Partial<Character>): Alignment[] =>
  alignsFor(cs, c).filter((align) => okRole(cs, { ...c, align }) && okRace(cs, { ...c, align }));

/** The role allows the race. ref: src/role.c validrace() */
const validRace = (cs: CharacterChoices, role: DefId | undefined, race: DefId): boolean =>
  okRace(cs, { ...(role !== undefined ? { role } : {}), race });
/** ref: validgend() (role and race allow it) */
const validGend = (cs: CharacterChoices, c: Partial<Character>, gender: Gender): boolean =>
  okGend(cs, { ...pick(c, 'role', 'race'), gender });
/** ref: validalign() */
const validAlign = (cs: CharacterChoices, c: Partial<Character>, align: Alignment): boolean =>
  okAlign(cs, { ...pick(c, 'role', 'race'), align });

/** `p` with facet `f` set to `v`, or left out when `v` is undefined. */
function withFacet<K extends keyof CharacterPrefs>(
  p: CharacterPrefs,
  f: K,
  v: CharacterPrefs[K] | undefined,
): CharacterPrefs {
  const out = { ...p };
  if (v === undefined) delete out[f];
  else out[f] = v;
  return out;
}

function pick(c: Partial<Character>, ...keys: (keyof Character)[]): Partial<Character> {
  const out: Partial<Character> = {};
  for (const k of keys) if (c[k] !== undefined) Object.assign(out, { [k]: c[k] });
  return out;
}

// ---- random picks (ref: pick_*() with PICK_RANDOM, and the rand*() fallbacks)

/** ref: pick_role(PICK_RANDOM), else randrole() */
const randomRole = (cs: CharacterChoices, c: Partial<Character>, rn2: (n: number) => number) =>
  oneOf(rolesFor(cs, c), rn2) ?? (oneOf(cs.roles, rn2)?.id as DefId);
/** ref: pick_race(PICK_RANDOM), else randrace() (any race the role allows) */
const randomRace = (cs: CharacterChoices, c: Partial<Character>, rn2: (n: number) => number) =>
  oneOf(racesFor(cs, c), rn2) ??
  oneOf(roleOf(cs, c.role)?.races ?? [], rn2) ??
  (oneOf(cs.races, rn2)?.id as DefId);
/** ref: pick_gend(PICK_RANDOM), else randgend() */
const randomGend = (cs: CharacterChoices, c: Partial<Character>, rn2: (n: number) => number) =>
  oneOf(gendersFor(cs, c), rn2) ??
  oneOf(
    GENDERS.filter((g) => validGend(cs, c, g)),
    rn2,
  ) ??
  (oneOf(GENDERS, rn2) as Gender);
/** ref: pick_align(PICK_RANDOM), else randalign() */
const randomAlign = (cs: CharacterChoices, c: Partial<Character>, rn2: (n: number) => number) =>
  oneOf(alignsFor(cs, c), rn2) ??
  oneOf(
    ALIGNMENTS.filter((a) => validAlign(cs, c, a)),
    rn2,
  ) ??
  (oneOf(ALIGNMENTS, rn2) as Alignment);

/**
 * Resolves "random" facets that can be resolved, then, once the role is known, fixes every facet
 * that has a single possible value (a Samurai is human and lawful, a Valkyrie female, an orc
 * chaotic), so no menu offers only one choice. ref: src/role.c rigid_role_checks()
 */
export function rigidRoleChecks(
  cs: CharacterChoices,
  p: CharacterPrefs,
  rn2: (n: number) => number,
): CharacterPrefs {
  let s = { ...p };
  if (s.role === RANDOM) s.role = randomRole(cs, fixed(s), rn2);
  if (s.race === RANDOM) s.race = oneOf(racesFor(cs, fixed(s)), rn2) ?? RANDOM;
  if (s.align === RANDOM) s.align = oneOf(alignsFor(cs, fixed(s)), rn2) ?? RANDOM;
  if (s.gender === RANDOM) s.gender = oneOf(gendersFor(cs, fixed(s)), rn2) ?? RANDOM;
  if (s.role !== undefined) {
    // PICK_RIGID: a value only when it is the one possible
    const only = <T>(set: T[]): T | undefined => (set.length === 1 ? set[0] : undefined);
    if (s.race === undefined) s = withFacet(s, 'race', only(racesFor(cs, fixed(s))));
    if (s.align === undefined) s = withFacet(s, 'align', only(alignsFor(cs, fixed(s))));
    if (s.gender === undefined) s = withFacet(s, 'gender', only(gendersFor(cs, fixed(s))));
  }
  return s;
}

// ---- words

/** Text helpers over the choices: role, race, gender and alignment words. */
function words(cs: CharacterChoices, t: (key: string) => string) {
  const roleName = (id: DefId, gender: Gender | undefined): string => {
    const r = roleOf(cs, id);
    if (!r) return id;
    const m = t(r.nameKey);
    if (r.nameKeyFemale === undefined) return m;
    if (gender === 'female') return t(r.nameKeyFemale);
    // gender not chosen yet: "Caveman/Cavewoman"
    return gender === undefined ? `${m}/${t(r.nameKeyFemale)}` : m;
  };
  return {
    roleName,
    raceNoun: (id: DefId): string => {
      const r = raceOf(cs, id);
      return r ? t(r.nameKey) : id;
    },
    raceAdj: (id: DefId): string => {
      const r = raceOf(cs, id);
      return r ? t(r.adjKey) : id;
    },
    gend: (g: Gender): string => t(`gender.${g}`),
    algn: (a: Alignment): string => t(ALIGN_KEY[a]),
  };
}

/** C's s_suffix(): "Valkyrie's", "character's", "Priest/Priestess'". */
const sSuffix = (s: string): string =>
  s.toLowerCase() === 'it' ? `${s}s` : s.endsWith('s') ? `${s}'` : `${s}'s`;

/**
 * "Shall I pick character's race, role, gender and alignment for you? [ynaq]", or what is left
 * when some facets are fixed ("Shall I pick your Valkyrie's race and alignment for you?").
 * ref: src/role.c build_plselection_prompt(), root_plselection_prompt(), promptsep()
 */
export function pickPrompt(
  cs: CharacterChoices,
  t: (key: string) => string,
  p: CharacterPrefs,
): string {
  const w = words(cs, t);
  const c = fixed(p);
  const role = roleOf(cs, c.role);
  const race = raceOf(cs, c.race);
  const post = { race: false, role: false, gend: false, align: false };
  const buf: string[] = [];
  // <your lawful>
  if (c.align !== undefined && okAlign(cs, c)) buf.push(w.algn(c.align));
  else if (
    (race !== undefined &&
      okRace(cs, pick(c, 'role', 'race', 'gender')) &&
      race.aligns.length > 1) ||
    race === undefined
  )
    post.align = true;
  // <your lawful female>
  if (c.gender !== undefined) {
    if (!role || (role.genders.length > 1 && role.nameKeyFemale === undefined))
      buf.push(w.gend(c.gender));
  } else if (!role || role.genders.length > 1) post.gend = true;
  // <your lawful female gnomish> || <your lawful female gnome>
  if (race !== undefined) {
    if (role && okRace(cs, c)) buf.push(w.raceAdj(race.id));
    else if (!role) buf.push(w.raceNoun(race.id));
    else post.race = true;
  } else post.race = true;
  // <your lawful female gnomish cavewoman>
  if (role) buf.push(w.roleName(role.id, c.gender));
  else if (p.role === undefined) post.role = true;
  if (race === undefined && !role) buf.push('character');

  let text = `Shall I pick ${race !== undefined || role ? 'your' : 'a'} ${buf.join(' ')}`;
  text = sSuffix(text.replace('pick a character', 'pick character'));
  if (/priest\/priestess'$/i.test(text)) text += 's';
  let n = Object.values(post).filter(Boolean).length;
  if (n === 0) {
    // mutually exclusive constraints: ask for every facet still unset after all
    post.role = p.role === undefined;
    post.race = p.race === undefined;
    post.align = p.align === undefined;
    post.gend = p.gender === undefined;
    n = Object.values(post).filter(Boolean).length;
  }
  let left = n;
  for (const [on, word] of [
    [post.race, 'race'],
    [post.role, 'role'],
    [post.gend, 'gender'],
    [post.align, 'alignment'],
  ] as const) {
    if (!on) continue;
    // promptsep(): "race, role, gender and alignment"
    if (n > 1 && left < n && left > 1) text += ',';
    text += ' ';
    left--;
    if (left === 0 && n > 1) text += 'and ';
    text += word;
  }
  return `${text} for you? [ynaq]`;
}

/**
 * The menus' first line: "<role> <race> <gender> <alignment>" with what is chosen so far, or
 * "Brunhilde the neutral female human Valkyrie" when all is chosen and she has a name.
 * ref: src/role.c plsel_startmenu()
 */
export function selectionLine(
  cs: CharacterChoices,
  t: (key: string) => string,
  p: CharacterPrefs,
  name?: string,
): string {
  const w = words(cs, t);
  const c = fixed(p);
  const role = c.role !== undefined ? w.roleName(c.role, c.gender ?? 'male') : '<role>';
  if (
    name === undefined ||
    c.role === undefined ||
    c.race === undefined ||
    c.gender === undefined ||
    c.align === undefined
  )
    return [
      role,
      c.race !== undefined ? w.raceNoun(c.race) : '<race>',
      c.gender !== undefined ? w.gend(c.gender) : '<gender>',
      c.align !== undefined ? w.algn(c.align) : '<alignment>',
    ].join(' ');
  return `${name} the ${w.algn(c.align)} ${w.gend(c.gender)} ${w.raceAdj(c.race)} ${role}`;
}

// ---- the menus

/** A row of a pick-one menu: its key (shown before the label) and what it picks. */
interface Row<T> {
  key: string;
  label: string;
  value: T;
}
type Line<T> = Row<T> | { text: string };

type Facet = 'role' | 'race' | 'gender' | 'align';
type Choice<T> = { pick: T } | { first: Facet } | 'random' | 'quit';

/** C's RS_menu_let[]: the keys of "Pick <facet> first". */
const FIRST_KEY: Record<Facet, string> = { role: '?', race: '/', gender: '"', align: '[' };
const FACET_WORD: Record<Facet, string> = {
  role: 'role',
  race: 'race',
  gender: 'gender',
  align: 'alignment',
};

/**
 * The extra rows under a facet's menu: "Pick race first" (or "Pick another race first" when one
 * is chosen), or "role forces human" when the role allows only one. ref: role_menu_extra()
 */
function extraLine(
  cs: CharacterChoices,
  t: (key: string) => string,
  p: CharacterPrefs,
  which: Facet,
): Line<Choice<never>> {
  const w = words(cs, t);
  const c = fixed(p);
  const role = roleOf(cs, c.role);
  let forced: string | undefined;
  if (which === 'race' && role?.races.length === 1 && role.races[0] !== undefined)
    forced = `role forces ${w.raceNoun(role.races[0])}`;
  else if (which === 'gender' && role?.genders.length === 1 && role.genders[0] !== undefined)
    forced = `role forces ${w.gend(role.genders[0])}`;
  else if (which === 'align') {
    const race = raceOf(cs, c.race);
    if (role?.aligns.length === 1 && role.aligns[0] !== undefined)
      forced = `role forces ${w.algn(role.aligns[0])}`;
    else if (race?.aligns.length === 1 && race.aligns[0] !== undefined)
      forced = `race forces ${w.algn(race.aligns[0])}`;
  }
  // four spaces fake a greyed-out row, as C does
  if (forced !== undefined) return { text: `    ${forced}` };
  const another = p[which] !== undefined && p[which] !== RANDOM ? ' another' : '';
  return {
    key: FIRST_KEY[which],
    label: `Pick${another} ${FACET_WORD[which]} first`,
    value: { first: which },
  };
}

/**
 * Runs the character selection. Resolves with the character, or null when the player quits (q,
 * or Close on any sheet: C's escape). ref: src/role.c genl_player_setup()
 */
export async function chooseCharacter(
  d: CharacterDeps,
  cs: CharacterChoices,
  prefs: CharacterPrefs = {},
): Promise<Character | null> {
  const w = words(cs, d.t);
  const rn2 = (n: number): number => d.rn2(n);
  /** What is chosen so far (C's flags.initrole, initrace, initgend, initalign). */
  let s: CharacterPrefs = prefs;

  /**
   * A pick-one sheet under the selection line; resolves null on Close (C's escape). The lines
   * are built after rigid_role_checks(), as plsel_startmenu() runs it first.
   */
  const menu = <T>(title: string, build: () => Line<T>[]): Promise<T | null> => {
    s = rigidRoleChecks(cs, s, rn2);
    const lines = build();
    return new Promise((resolve) => {
      const entries: MenuEntry[] = [
        { label: selectionLine(cs, d.t, s, d.name), run: () => {}, text: true },
        ...lines.map((l): MenuEntry =>
          'text' in l
            ? { label: l.text === '' ? ' ' : l.text, run: () => {}, text: true }
            : { label: `${l.key} - ${l.label}`, key: l.key, run: () => resolve(l.value) },
        ),
      ];
      d.showText(title, entries, () => resolve(null));
    });
  };
  /** Random, a blank, the other facets' "Pick ... first" rows, Quit. ref: role_menu_extra() */
  const extras = <T>(others: readonly Facet[]): Line<Choice<T>>[] => [
    { key: '*', label: 'Random', value: 'random' },
    { text: '' },
    ...others.map((f) => extraLine(cs, d.t, s, f)),
    { key: 'q', label: 'Quit', value: 'quit' },
  ];

  // "Is this ok?" only when something was left to pick (picksomething)
  const pickSomething =
    prefs.role === undefined ||
    prefs.race === undefined ||
    prefs.gender === undefined ||
    prefs.align === undefined;
  s = rigidRoleChecks(cs, prefs, rn2);
  let pick4u: 'y' | 'n' | 'a' = 'n';
  if (
    s.role === undefined ||
    s.race === undefined ||
    s.gender === undefined ||
    s.align === undefined
  ) {
    const answer = await new Promise<'y' | 'n' | 'a' | 'q'>((resolve) => {
      const row = (key: 'y' | 'n' | 'a' | 'q', label: string): MenuEntry => ({
        label: `${key} - ${label}`,
        key,
        run: () => resolve(key),
      });
      d.showText(
        pickPrompt(cs, d.t, s),
        [
          row('y', 'Yes; pick for me, then ask if it is ok'),
          row('n', 'No; let me choose'),
          row('a', 'Pick for me and start at once'),
          row('q', 'Quit'),
        ],
        () => resolve('q'),
      );
    });
    if (answer === 'q') return null;
    pick4u = answer;
  }

  const isSet = (v: unknown): boolean => v !== undefined && v !== RANDOM;
  const randomly = (v: unknown): boolean => pick4u !== 'n' || v === RANDOM;
  for (;;) {
    let next: Facet = 'role';
    do {
      if (next === 'role') {
        next = 'race';
        if (!isSet(s.role)) {
          let k: DefId | undefined;
          if (randomly(s.role)) k = randomRole(cs, fixed(s), rn2);
          else {
            const choice = await menu<Choice<DefId>>('Pick a role or profession', () => {
              const c = fixed(s);
              const lines: Line<Choice<DefId>>[] = [];
              let last = '';
              for (const id of rolesFor(cs, c)) {
                // the role's initial, upper case when the row above has it (Rogue r, Ranger R)
                let ch = w.roleName(id, 'male').charAt(0).toLowerCase();
                if (ch === last) ch = ch.toUpperCase();
                lines.push({ key: ch, label: an(w.roleName(id, c.gender)), value: { pick: id } });
                last = ch;
              }
              return [...lines, ...extras<DefId>(['race', 'gender', 'align'])];
            });
            if (choice === null || choice === 'quit') return null;
            if (choice === 'random') k = randomRole(cs, fixed(s), rn2);
            else if ('first' in choice) {
              s = withFacet(s, choice.first, undefined);
              next = choice.first;
            } else k = choice.pick;
          }
          s = withFacet(s, 'role', k);
        }
      }
      if (next === 'race') {
        next = isSet(s.role) ? 'gender' : 'role';
        const c = fixed(s);
        if (!isSet(s.race) || (c.race !== undefined && !validRace(cs, c.role, c.race))) {
          const base = pick(c, 'role', 'gender', 'align');
          let k: DefId | undefined;
          if (randomly(s.race)) k = randomRace(cs, base, rn2);
          else {
            let valid = racesFor(cs, base);
            if (valid.length === 0)
              valid = cs.races.map((r) => r.id).filter((r) => validRace(cs, c.role, r));
            k = valid[valid.length - 1] ?? cs.races[0]?.id;
            if (valid.length > 1) {
              const choice = await menu<Choice<DefId>>('Pick a race or species', () => [
                ...raceMenuFor(cs, pick(fixed(s), 'role', 'gender', 'align')).map(
                  (id): Line<Choice<DefId>> => ({
                    key: w.raceNoun(id).charAt(0),
                    label: w.raceNoun(id),
                    value: { pick: id },
                  }),
                ),
                ...extras<DefId>(['role', 'gender', 'align']),
              ]);
              if (choice === null || choice === 'quit') return null;
              if (choice === 'random') k = randomRace(cs, base, rn2);
              else if ('first' in choice) {
                s = withFacet(s, choice.first, undefined);
                next = choice.first;
                k = undefined;
              } else k = choice.pick;
            }
          }
          s = withFacet(s, 'race', k);
        }
      }
      if (next === 'gender') {
        next = !isSet(s.role) ? 'role' : !isSet(s.race) ? 'race' : 'align';
        const c = fixed(s);
        if (!isSet(s.gender) || (c.gender !== undefined && !validGend(cs, c, c.gender))) {
          const base = pick(c, 'role', 'race', 'align');
          let k: Gender | undefined;
          if (randomly(s.gender)) k = randomGend(cs, base, rn2);
          else {
            let valid = gendersFor(cs, base);
            if (valid.length === 0) valid = GENDERS.filter((g) => validGend(cs, c, g));
            k = valid[valid.length - 1] ?? GENDERS[0];
            if (valid.length > 1) {
              const choice = await menu<Choice<Gender>>('Pick a gender or sex', () => [
                ...genderMenuFor(cs, pick(fixed(s), 'role', 'race', 'align')).map(
                  (g): Line<Choice<Gender>> => ({
                    key: w.gend(g).charAt(0),
                    label: w.gend(g),
                    value: { pick: g },
                  }),
                ),
                ...extras<Gender>(['role', 'race', 'align']),
              ]);
              if (choice === null || choice === 'quit') return null;
              if (choice === 'random') k = randomGend(cs, base, rn2);
              else if ('first' in choice) {
                s = withFacet(s, choice.first, undefined);
                next = choice.first;
                k = undefined;
              } else k = choice.pick;
            }
          }
          s = withFacet(s, 'gender', k);
        }
      }
      if (next === 'align') {
        next = !isSet(s.role) ? 'role' : !isSet(s.race) ? 'race' : 'gender';
        const c = fixed(s);
        if (!isSet(s.align) || (c.align !== undefined && !validAlign(cs, c, c.align))) {
          const base = pick(c, 'role', 'race', 'gender');
          let k: Alignment | undefined;
          if (randomly(s.align)) k = randomAlign(cs, base, rn2);
          else {
            let valid = alignsFor(cs, base);
            if (valid.length === 0) valid = ALIGNMENTS.filter((a) => validAlign(cs, c, a));
            k = valid[valid.length - 1] ?? ALIGNMENTS[0];
            if (valid.length > 1) {
              const choice = await menu<Choice<Alignment>>('Pick an alignment or creed', () => [
                ...alignMenuFor(cs, pick(fixed(s), 'role', 'race', 'gender')).map(
                  (a): Line<Choice<Alignment>> => ({
                    key: w.algn(a).charAt(0),
                    label: w.algn(a),
                    value: { pick: a },
                  }),
                ),
                ...extras<Alignment>(['role', 'race', 'gender']),
              ]);
              if (choice === null || choice === 'quit') return null;
              if (choice === 'random') k = randomAlign(cs, base, rn2);
              else if ('first' in choice) {
                s = withFacet(s, choice.first, undefined);
                next = choice.first;
                k = undefined;
              } else k = choice.pick;
            }
          }
          s = withFacet(s, 'align', k);
        }
      }
    } while (!isSet(s.role) || !isSet(s.race) || !isSet(s.gender) || !isSet(s.align));

    const done = fixed(s) as Character;
    if (!pickSomething || pick4u === 'a') return done;
    const ok = await menu<'y' | 'n' | 'q'>('Is this ok? [ynq]', () => [
      { text: '' },
      { key: 'y', label: 'Yes; start game', value: 'y' },
      { key: 'n', label: 'No; choose role again', value: 'n' },
      { key: 'q', label: 'Quit', value: 'q' },
    ]);
    if (ok === 'y') return done;
    if (ok === null || ok === 'q') return null;
    // 'n': the menus again, from nothing (the options' and the URL's choices are dropped too)
    pick4u = 'n';
    s = {};
  }
}

/** "an Archeologist", "a Caveman/Cavewoman". ref: src/objnam.c an() */
const an = (s: string): string => justAn(s) + s;

// ---- the options' and the URL's words (C's command line and rc options)

/**
 * The facets named by words: a prefix of a role's name (either gender), C's file code ("val"),
 * the def id, or "random" ("*", "@"); for races the noun or adjective; for genders and alignments
 * the word. Unknown words are left out (ask). ref: src/role.c str2role(), str2race(),
 * str2gend(), str2align()
 */
export function prefsFromWords(
  cs: CharacterChoices,
  t: (key: string) => string,
  raw: { role?: string; race?: string; gender?: string; align?: string },
): CharacterPrefs {
  const w = words(cs, t);
  /** The value whose id is `s`, else the first with a word `s` begins, else random or nothing. */
  const one = <T>(
    s: string | undefined,
    names: readonly { value: T; id: string; words: string[] }[],
  ): T | Random | undefined => {
    const q = s?.trim().toLowerCase() ?? '';
    if (q === '') return undefined;
    const exact = names.find((n) => n.id.toLowerCase() === q);
    if (exact) return exact.value;
    const prefix = names.find((n) => n.words.some((wd) => wd.toLowerCase().startsWith(q)));
    if (prefix) return prefix.value;
    return (q.length === 1 && (q === '*' || q === '@')) || RANDOM.startsWith(q)
      ? RANDOM
      : undefined;
  };
  const role = one(
    raw.role,
    cs.roles.map((r) => ({
      value: r.id,
      id: r.id,
      words: [t(r.nameKey), ...(r.nameKeyFemale !== undefined ? [t(r.nameKeyFemale)] : [])],
    })),
  );
  const race = one(
    raw.race,
    cs.races.map((r) => ({ value: r.id, id: r.id, words: [t(r.nameKey), t(r.adjKey)] })),
  );
  const gender = one(
    raw.gender,
    GENDERS.map((g) => ({ value: g, id: g, words: [w.gend(g)] })),
  );
  const align = one(
    raw.align,
    ALIGNMENTS.map((a) => ({ value: a, id: String(a), words: [w.algn(a)] })),
  );
  const out: CharacterPrefs = {};
  if (role !== undefined) out.role = role;
  if (race !== undefined) out.race = race;
  if (gender !== undefined) out.gender = gender;
  if (align !== undefined) out.align = align;
  return out;
}
