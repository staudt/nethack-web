// The 13 roles' data: names, rank titles, gods, file codes, allowed races, genders and
// alignments, attributes, hit point and energy advancement, spellcasting and the intrinsics by
// experience level. A leaf (core types and urole only). Names, ranks and gods are message keys
// (role.en.ts). ref: src/role.c roles[], src/attrib.c arc_abil[]..wiz_abil[], src/exper.c
// enermod(); include/you.h struct Role (the quest fields are not ported)
import type { AttributesComponent, DefId } from '@nh/core';
import { ROLE_ORDER, type RaceKey, type RoleKey } from './urole';

/** Hit point or energy advancement. ref: include/you.h struct RoleAdvance */
export interface HpAdvance {
  /** initial fixed and random */
  infix: number;
  inrnd: number;
  /** below xlev: fixed and random */
  lofix: number;
  lornd: number;
  /** at or above xlev: fixed and random */
  hifix: number;
  hirnd: number;
}

/** -1 chaotic, 0 neutral, 1 lawful. ref: include/align.h A_CHAOTIC..A_LAWFUL */
export type Align = -1 | 0 | 1;
export type Gender = 'male' | 'female';

/**
 * An intrinsic gained at an experience level: `prop` is a property name (props.ts P), `gain` and
 * `lose` the "You feel ...!" message keys (null: silent). C's empty losestr with a gainstr is
 * "You feel less <gainstr>!". ref: src/attrib.c struct innate
 */
export interface Innate {
  level: number;
  prop: string;
  gain: string | null;
  lose: string | null;
}

/** A role's spellcasting fields. ref: include/you.h struct Role spelbase .. spelsbon */
export interface RoleSpell {
  /** base spellcasting penalty */
  spelbase: number;
  /** penalty (-bonus) for healing spells */
  spelheal: number;
  /** penalty for wearing any shield */
  spelshld: number;
  /** penalty for wearing metal armour */
  spelarmr: number;
  /** the casting stat */
  spelstat: keyof AttributesComponent;
  /** the role's special spell (its book) */
  spelspec: DefId;
  /** bonus (-penalty) for the special spell */
  spelsbon: number;
}

type Six = readonly [number, number, number, number, number, number];

export interface RoleRow extends RoleSpell {
  key: RoleKey;
  /** 'Val'. ref: roles[].filecode */
  filecode: string;
  /** a female name exists (`role.<key>.f`: Cavewoman, Priestess) */
  nameF: boolean;
  /** the ranks (1..9) with a female title (`rank.<key>.<n>.f`) */
  ranksF: readonly number[];
  /** the god message keys by alignment; null for the Priest (another role's pantheon) */
  gods: { lawful: string; neutral: string; chaotic: string } | null;
  /** C's '_' prefix: that god is a goddess */
  goddess: { lawful?: boolean; neutral?: boolean; chaotic?: boolean };
  /** allowed races, genders and alignments; the first of each is the default */
  races: readonly RaceKey[];
  genders: readonly Gender[];
  aligns: readonly Align[];
  /** Str Int Wis Dex Con Cha: lowest initial values and the distribution of the rest */
  attrbase: Six;
  attrdist: Six;
  hpadv: HpAdvance;
  enadv: HpAdvance;
  /** cutoff experience level between the lower and higher advancement */
  xlev: number;
  /** initial alignment record */
  initrecord: number;
  /** the preferred pet (null: a kitten or little dog at random). ref: roles[].petnum */
  petnum: DefId | null;
  /** intrinsics by experience level. ref: src/attrib.c *_abil[] */
  abil: readonly Innate[];
}

/** ref: include/attrib.h STR18 */
export const STR18 = (x: number): number => 18 + x;

const adv = (
  infix: number,
  inrnd: number,
  lofix: number,
  lornd: number,
  hifix: number,
  hirnd: number,
): HpAdvance => ({ infix, inrnd, lofix, lornd, hifix, hirnd });

/**
 * An innate ability row as C writes it: `gain` and `lose` are C's gainstr and losestr ('' =
 * none). ref: src/attrib.c adjabil() "You feel %s!" / "You feel less %s!"
 */
const ab = (level: number, prop: string, gain = '', lose = ''): Innate => ({
  level,
  prop,
  gain: gain ? `abil.${gain}` : null,
  lose: lose ? `abil.${lose}` : gain ? `abil.less_${gain}` : null,
});

const L: Align = 1;
const N: Align = 0;
const C: Align = -1;
const MF: readonly Gender[] = ['male', 'female'];

/** ref: src/exper.c enermod() */
export function enermod(role: RoleKey, en: number): number {
  switch (role) {
    case 'priest':
    case 'wizard':
      return 2 * en;
    case 'healer':
    case 'knight':
      return Math.trunc((3 * en) / 2);
    case 'barbarian':
    case 'valkyrie':
      return Math.trunc((3 * en) / 4);
    default:
      return en;
  }
}

const book = (name: string): DefId => `nh:spellbook_of_${name}`;
const gods = (lawful: string, neutral: string, chaotic: string): RoleRow['gods'] => ({
  lawful: `god.${lawful}`,
  neutral: `god.${neutral}`,
  chaotic: `god.${chaotic}`,
});

/** ref: src/role.c roles[], src/attrib.c *_abil[] */
export const ROLES_TAB: Readonly<Record<RoleKey, RoleRow>> = {
  archeologist: {
    key: 'archeologist',
    filecode: 'Arc',
    nameF: false,
    ranksF: [],
    gods: gods('quetzalcoatl', 'camaxtli', 'huhetotl'),
    goddess: {},
    races: ['human', 'dwarf', 'gnome'],
    genders: MF,
    aligns: [L, N],
    attrbase: [7, 10, 10, 7, 7, 7],
    attrdist: [20, 20, 20, 10, 20, 10],
    hpadv: adv(11, 0, 0, 8, 1, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 14,
    initrecord: 10,
    spelbase: 5,
    spelheal: 0,
    spelshld: 2,
    spelarmr: 10,
    spelstat: 'int',
    spelspec: book('magic_mapping'),
    spelsbon: -4,
    petnum: null,
    abil: [ab(1, 'searching'), ab(5, 'stealth', 'stealthy'), ab(10, 'fast', 'quick', 'slow')],
  },
  barbarian: {
    key: 'barbarian',
    filecode: 'Bar',
    nameF: false,
    ranksF: [1, 8, 9],
    gods: gods('mitra', 'crom', 'set'),
    goddess: {},
    races: ['human', 'orc'],
    genders: MF,
    aligns: [N, C],
    attrbase: [16, 7, 7, 15, 16, 6],
    attrdist: [30, 6, 7, 20, 30, 7],
    hpadv: adv(14, 0, 0, 10, 2, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 10,
    initrecord: 10,
    spelbase: 14,
    spelheal: 0,
    spelshld: 0,
    spelarmr: 8,
    spelstat: 'int',
    spelspec: book('haste_self'),
    spelsbon: -4,
    petnum: null,
    abil: [ab(1, 'poison_res'), ab(7, 'fast', 'quick', 'slow'), ab(15, 'stealth', 'stealthy')],
  },
  caveman: {
    key: 'caveman',
    filecode: 'Cav',
    nameF: true,
    ranksF: [],
    gods: gods('anu', 'ishtar', 'anshar'),
    goddess: { neutral: true },
    races: ['human', 'dwarf', 'gnome'],
    genders: MF,
    aligns: [L, N],
    attrbase: [10, 7, 7, 7, 8, 6],
    attrdist: [30, 6, 7, 20, 30, 7],
    hpadv: adv(14, 0, 0, 8, 2, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 10,
    initrecord: 0,
    spelbase: 12,
    spelheal: 0,
    spelshld: 1,
    spelarmr: 8,
    spelstat: 'int',
    spelspec: book('dig'),
    spelsbon: -4,
    petnum: 'nh:little_dog',
    abil: [ab(7, 'fast', 'quick', 'slow'), ab(15, 'warning', 'sensitive')],
  },
  healer: {
    key: 'healer',
    filecode: 'Hea',
    nameF: false,
    ranksF: [5, 7],
    gods: gods('athena', 'hermes', 'poseidon'),
    goddess: { lawful: true },
    races: ['human', 'gnome'],
    genders: MF,
    aligns: [N],
    attrbase: [7, 7, 13, 7, 11, 16],
    attrdist: [15, 20, 20, 15, 25, 5],
    hpadv: adv(11, 0, 0, 8, 1, 0),
    enadv: adv(1, 4, 0, 1, 0, 2),
    xlev: 20,
    initrecord: 10,
    spelbase: 3,
    spelheal: -3,
    spelshld: 2,
    spelarmr: 10,
    spelstat: 'wis',
    spelspec: book('cure_sickness'),
    spelsbon: -4,
    petnum: null,
    abil: [ab(1, 'poison_res'), ab(15, 'warning', 'sensitive')],
  },
  knight: {
    key: 'knight',
    filecode: 'Kni',
    nameF: false,
    ranksF: [7, 8],
    gods: gods('lugh', 'brigit', 'manannan_mac_lir'),
    goddess: { neutral: true },
    races: ['human'],
    genders: MF,
    aligns: [L],
    attrbase: [13, 7, 14, 8, 10, 17],
    attrdist: [30, 15, 15, 10, 20, 10],
    hpadv: adv(14, 0, 0, 8, 2, 0),
    enadv: adv(1, 4, 0, 1, 0, 2),
    xlev: 10,
    initrecord: 10,
    spelbase: 8,
    spelheal: -2,
    spelshld: 0,
    spelarmr: 9,
    spelstat: 'wis',
    spelspec: book('turn_undead'),
    spelsbon: -4,
    petnum: 'nh:pony',
    abil: [ab(7, 'fast', 'quick', 'slow')],
  },
  monk: {
    key: 'monk',
    filecode: 'Mon',
    nameF: false,
    ranksF: [],
    gods: gods('shan_lai_ching', 'chih_sung_tzu', 'huan_ti'),
    goddess: {},
    races: ['human'],
    genders: MF,
    aligns: [L, N, C],
    attrbase: [10, 7, 8, 8, 7, 7],
    attrdist: [25, 10, 20, 20, 15, 10],
    hpadv: adv(12, 0, 0, 8, 1, 0),
    enadv: adv(2, 2, 0, 2, 0, 2),
    xlev: 10,
    initrecord: 10,
    spelbase: 8,
    spelheal: -2,
    spelshld: 2,
    spelarmr: 20,
    spelstat: 'wis',
    spelspec: book('restore_ability'),
    spelsbon: -4,
    petnum: null,
    abil: [
      ab(1, 'fast'),
      ab(1, 'sleep_res'),
      ab(1, 'see_invis'),
      ab(3, 'poison_res', 'healthy'),
      ab(5, 'stealth', 'stealthy'),
      ab(7, 'warning', 'sensitive'),
      ab(9, 'searching', 'perceptive', 'unaware'),
      ab(11, 'fire_res', 'cool', 'warmer'),
      ab(13, 'cold_res', 'warm', 'cooler'),
      ab(15, 'shock_res', 'insulated', 'conductive'),
      ab(17, 'teleport_control', 'controlled', 'uncontrolled'),
    ],
  },
  priest: {
    key: 'priest',
    filecode: 'Pri',
    nameF: true,
    ranksF: [4, 6, 8, 9],
    gods: null, // deities from a randomly chosen other role will be used
    goddess: {},
    races: ['human', 'elf'],
    genders: MF,
    aligns: [L, N, C],
    attrbase: [7, 7, 10, 7, 7, 7],
    attrdist: [15, 10, 30, 15, 20, 10],
    hpadv: adv(12, 0, 0, 8, 1, 0),
    enadv: adv(4, 3, 0, 2, 0, 2),
    xlev: 10,
    initrecord: 0,
    spelbase: 3,
    spelheal: -2,
    spelshld: 2,
    spelarmr: 10,
    spelstat: 'wis',
    spelspec: book('remove_curse'),
    spelsbon: -4,
    petnum: null,
    abil: [ab(15, 'warning', 'sensitive'), ab(20, 'fire_res', 'cool', 'warmer')],
  },
  rogue: {
    key: 'rogue',
    filecode: 'Rog',
    nameF: false,
    ranksF: [8],
    gods: gods('issek', 'mog', 'kos'),
    goddess: {},
    races: ['human', 'orc'],
    genders: MF,
    aligns: [C],
    attrbase: [7, 7, 7, 10, 7, 6],
    attrdist: [20, 10, 10, 30, 20, 10],
    hpadv: adv(10, 0, 0, 8, 1, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 11,
    initrecord: 10,
    spelbase: 8,
    spelheal: 0,
    spelshld: 1,
    spelarmr: 9,
    spelstat: 'int',
    spelspec: book('detect_treasure'),
    spelsbon: -4,
    petnum: null,
    abil: [ab(1, 'stealth'), ab(10, 'searching', 'perceptive')],
  },
  ranger: {
    key: 'ranger',
    filecode: 'Ran',
    nameF: false,
    ranksF: [4, 9],
    gods: gods('mercury', 'venus', 'mars'),
    goddess: { neutral: true },
    races: ['human', 'elf', 'gnome', 'orc'],
    genders: MF,
    aligns: [N, C],
    attrbase: [13, 13, 13, 9, 13, 7],
    attrdist: [30, 10, 10, 20, 20, 10],
    hpadv: adv(13, 0, 0, 6, 1, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 12,
    initrecord: 10,
    spelbase: 9,
    spelheal: 2,
    spelshld: 1,
    spelarmr: 10,
    spelstat: 'int',
    spelspec: book('invisibility'),
    spelsbon: -4,
    petnum: 'nh:little_dog',
    abil: [ab(1, 'searching'), ab(7, 'stealth', 'stealthy'), ab(15, 'see_invis')],
  },
  samurai: {
    key: 'samurai',
    filecode: 'Sam',
    nameF: false,
    ranksF: [3],
    gods: gods('amaterasu_omikami', 'raijin', 'susanowo'),
    goddess: { lawful: true },
    races: ['human'],
    genders: MF,
    aligns: [L],
    attrbase: [10, 8, 7, 10, 17, 6],
    attrdist: [30, 10, 8, 30, 14, 8],
    hpadv: adv(13, 0, 0, 8, 1, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 11,
    initrecord: 10,
    spelbase: 10,
    spelheal: 0,
    spelshld: 0,
    spelarmr: 8,
    spelstat: 'int',
    spelspec: book('clairvoyance'),
    spelsbon: -4,
    petnum: 'nh:little_dog',
    abil: [ab(1, 'fast'), ab(15, 'stealth', 'stealthy')],
  },
  tourist: {
    key: 'tourist',
    filecode: 'Tou',
    nameF: false,
    ranksF: [4],
    gods: gods('blind_io', 'the_lady', 'offler'),
    goddess: { neutral: true },
    races: ['human'],
    genders: MF,
    aligns: [N],
    attrbase: [7, 10, 6, 7, 7, 10],
    attrdist: [15, 10, 10, 15, 30, 20],
    hpadv: adv(8, 0, 0, 8, 0, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 14,
    initrecord: 0,
    spelbase: 5,
    spelheal: 1,
    spelshld: 2,
    spelarmr: 10,
    spelstat: 'int',
    spelspec: book('charm_monster'),
    spelsbon: -4,
    petnum: null,
    abil: [ab(10, 'searching', 'perceptive'), ab(20, 'poison_res', 'hardy')],
  },
  valkyrie: {
    key: 'valkyrie',
    filecode: 'Val',
    nameF: false,
    ranksF: [4, 7, 9],
    gods: gods('tyr', 'odin', 'loki'),
    goddess: {},
    // the port's default character lists neutral first (C's ROLE_LAWFUL | ROLE_NEUTRAL)
    races: ['human', 'dwarf'],
    genders: ['female'],
    aligns: [N, L],
    attrbase: [10, 7, 7, 7, 10, 7],
    attrdist: [30, 6, 7, 20, 30, 7],
    hpadv: adv(14, 0, 0, 8, 2, 0),
    enadv: adv(1, 0, 0, 1, 0, 1),
    xlev: 10,
    initrecord: 0,
    spelbase: 10,
    spelheal: -2,
    spelshld: 0,
    spelarmr: 9,
    spelstat: 'wis',
    spelspec: book('cone_of_cold'),
    spelsbon: -4,
    petnum: null, // NON_PM /*PM_WINTER_WOLF_CUB*/
    abil: [ab(1, 'cold_res'), ab(3, 'stealth', 'stealthy'), ab(7, 'fast', 'quick', 'slow')],
  },
  wizard: {
    key: 'wizard',
    filecode: 'Wiz',
    nameF: false,
    ranksF: [5, 6],
    gods: gods('ptah', 'thoth', 'anhur'),
    goddess: {},
    races: ['human', 'elf', 'gnome', 'orc'],
    genders: MF,
    aligns: [N, C],
    attrbase: [7, 10, 7, 7, 7, 7],
    attrdist: [10, 30, 10, 20, 20, 10],
    hpadv: adv(10, 0, 0, 8, 1, 0),
    enadv: adv(4, 3, 0, 2, 0, 3),
    xlev: 12,
    initrecord: 0,
    spelbase: 1,
    spelheal: 0,
    spelshld: 3,
    spelarmr: 10,
    spelstat: 'int',
    spelspec: book('magic_missile'),
    spelsbon: -4,
    petnum: 'nh:kitten',
    abil: [
      ab(15, 'warning', 'sensitive'),
      ab(17, 'teleport_control', 'controlled', 'uncontrolled'),
    ],
  },
};

export { ROLE_ORDER };

/** The role's name key, female when she is and the role has one (Cavewoman, Priestess). */
export const roleNameKey = (role: RoleKey, female: boolean): string =>
  female && ROLES_TAB[role].nameF ? `role.${role}.f` : `role.${role}`;

/** The rank title key of rank `n` (1..9), female when she is and the rank has one. */
export const rankTitleKey = (role: RoleKey, n: number, female: boolean): string =>
  female && ROLES_TAB[role].ranksF.includes(n) ? `rank.${role}.${n}.f` : `rank.${role}.${n}`;
