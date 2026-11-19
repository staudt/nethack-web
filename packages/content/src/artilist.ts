// The artifact table: the 20 gift and wish artifacts and the 13 quest artifacts, in artilist.h
// order (C's ART_ index order, used for every iteration). A leaf (core types, aligntyp and urole
// only). Names are proper nouns shown as they are in every language, as C's: data, not message
// text. ref: include/artilist.h,
// include/artifact.h SPFX_*, include/role.h struct Role questarti (src/role.c roles[])
import type { DefId } from '@nh/core';
import { A_CHAOTIC, A_LAWFUL, A_NEUTRAL, A_NONE } from './aligntyp';
import type { RaceKey, RoleKey } from './urole';

/** ref: include/artifact.h SPFX_* (the bane bits are the row's `bane`) */
export type Spfx =
  | 'nogen'
  | 'restr'
  | 'intel'
  | 'speak'
  | 'seek'
  | 'warn'
  | 'attk'
  | 'defn'
  | 'drli'
  | 'search'
  | 'behead'
  | 'halres'
  | 'esp'
  | 'stlth'
  | 'regen'
  | 'eregen'
  | 'hspdam'
  | 'hphdam'
  | 'tctrl'
  | 'luck'
  | 'xray'
  | 'reflect'
  | 'protect';

/**
 * What the artifact is made to slay: SPFX_DMONS (one monster), SPFX_DCLAS (a monster class
 * letter), SPFX_DFLAG1/SPFX_DFLAG2 (a monster flag, as content's `MonsterDef.flags` names it) or
 * SPFX_DALIGN (monsters of another alignment), with C's `mtype`. ref: include/artifact.h
 */
export type Bane =
  | { kind: 'mons'; mon: DefId }
  | { kind: 'class'; ch: string }
  | { kind: 'flag'; flag: string }
  | { kind: 'align' };

/** The damage types the table uses. ref: include/monattk.h AD_* */
export type ArtiAd =
  'phys' | 'drli' | 'cold' | 'fire' | 'elec' | 'stun' | 'drst' | 'magm' | 'were' | 'blnd';

/** ref: include/artifact.h the invoke powers (inv_prop) */
export type InvokePower =
  | 'taming'
  | 'healing'
  | 'energy_boost'
  | 'untrap'
  | 'charge_obj'
  | 'lev_tele'
  | 'create_portal'
  | 'enlightening'
  | 'create_ammo'
  | 'banish'
  | 'fling_poison'
  | 'snowstorm'
  | 'firestorm'
  | 'blinding_ray'
  | 'conflict'
  | 'levitation'
  | 'invis';

/** ref: include/artifact.h struct artifact */
export interface ArtifactDef {
  id: DefId;
  /** C's name, capitalised as C ("The Heart of Ahriman"). */
  name: string;
  /** The base object (otyp). */
  base: DefId;
  /** Properties when wielded or worn (spfx). */
  spfx: readonly Spfx[];
  /** Properties when carried (cspfx). */
  cspfx: readonly Spfx[];
  bane: Bane | null;
  /** The special attack (NO_ATTK = null): `damn` to-hit bonus die, `damd` damage die. */
  attk: { ad: ArtiAd; damn: number; damd: number } | null;
  /** The resistance given when wielded or worn (NO_DFNS = null). */
  defn: ArtiAd | null;
  /** The resistance given when carried (NO_CARY = null). */
  cary: ArtiAd | null;
  invoke: InvokePower | null;
  /** A_LAWFUL..A_CHAOTIC or A_NONE, before hack_artifacts() (see artistate.ts artiAlign()). */
  align: number;
  /** The role it belongs to (C's PM_ role), before hack_artifacts(). */
  role: RoleKey | null;
  /** The race it belongs to (C's PM_ race monster). */
  race: RaceKey | null;
  /** Enchantment added when made at random (gen_spe). */
  genSpe: number;
  /** The sacrifice value it takes to be given it (gift_value). */
  giftValue: number;
  cost: number;
  /** The glow colour (C's CLR_ name), or null. */
  color: string | null;
}

const NONE: readonly Spfx[] = [];

type Row = Omit<ArtifactDef, 'id'>;

/** C's NO_ATTK etc. are null; PHYS(a, b) and the others build the attack. */
const atk = (ad: ArtiAd, damn: number, damd: number): ArtifactDef['attk'] => ({ ad, damn, damd });

/** The id of a row: `nh:` and the name without a leading "The", lowercased, spaces to `_`. */
const idOf = (name: string): DefId =>
  `nh:${name
    .replace(/^The /, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')}`;

const ROWS: readonly Row[] = [
  {
    name: 'Excalibur',
    base: 'nh:long_sword',
    spfx: ['nogen', 'restr', 'seek', 'defn', 'intel', 'search'],
    cspfx: NONE,
    bane: null,
    attk: atk('phys', 5, 10),
    defn: 'drli',
    cary: null,
    invoke: null,
    align: A_LAWFUL,
    role: 'knight',
    race: null,
    genSpe: 0,
    giftValue: 10,
    cost: 4000,
    color: null,
  },
  // Stormbringer only has a 2 because it can drain a level, providing 8 more.
  {
    name: 'Stormbringer',
    base: 'nh:runesword',
    spfx: ['restr', 'attk', 'defn', 'intel', 'drli'],
    cspfx: NONE,
    bane: null,
    attk: atk('drli', 5, 2),
    defn: 'drli',
    cary: null,
    invoke: null,
    align: A_CHAOTIC,
    role: null,
    race: null,
    genSpe: 0,
    giftValue: 9,
    cost: 8000,
    color: null,
  },
  {
    name: 'Mjollnir',
    base: 'nh:war_hammer',
    spfx: ['restr', 'attk'],
    cspfx: NONE,
    bane: null,
    attk: atk('elec', 5, 24),
    defn: null,
    cary: null,
    invoke: null,
    align: A_NEUTRAL,
    role: 'valkyrie',
    race: null,
    genSpe: 0,
    giftValue: 8,
    cost: 4000,
    color: null,
  },
  {
    name: 'Cleaver',
    base: 'nh:battle_axe',
    spfx: ['restr'],
    cspfx: NONE,
    bane: null,
    attk: atk('phys', 3, 6),
    defn: null,
    cary: null,
    invoke: null,
    align: A_NEUTRAL,
    role: 'barbarian',
    race: null,
    genSpe: 0,
    giftValue: 8,
    cost: 1500,
    color: null,
  },
  // Grimtooth glows in warning when elves are present, but its damage bonus applies to all
  // targets rather than just elves (handled as special case in spec_dbon()).
  {
    name: 'Grimtooth',
    base: 'nh:orcish_dagger',
    spfx: ['restr', 'warn'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'elf' },
    attk: atk('phys', 2, 6),
    defn: 'drst',
    cary: null,
    invoke: 'fling_poison',
    align: A_CHAOTIC,
    role: null,
    race: 'orc',
    genSpe: 0,
    giftValue: 5,
    cost: 1200,
    color: 'red',
  },
  // Orcrist and Sting have same alignment as elves; they warn of M2_ORC monsters.
  {
    name: 'Orcrist',
    base: 'nh:elven_broadsword',
    spfx: ['warn'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'orc' },
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: null,
    align: A_CHAOTIC,
    role: null,
    race: 'elf',
    genSpe: 3,
    giftValue: 4,
    cost: 2000,
    color: 'bright_blue', // actually light blue
  },
  {
    name: 'Sting',
    base: 'nh:elven_dagger',
    spfx: ['warn'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'orc' },
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: null,
    align: A_CHAOTIC,
    role: null,
    race: 'elf',
    genSpe: 3,
    giftValue: 1,
    cost: 800,
    color: 'bright_blue',
  },
  // Magicbane is a bit different! Its magic fanfare unbalances victims in addition to doing
  // some damage.
  {
    name: 'Magicbane',
    base: 'nh:athame',
    spfx: ['restr', 'attk', 'defn'],
    cspfx: NONE,
    bane: null,
    attk: atk('stun', 3, 4),
    defn: 'magm',
    cary: null,
    invoke: null,
    align: A_NEUTRAL,
    role: 'wizard',
    race: null,
    genSpe: 0,
    giftValue: 7,
    cost: 3500,
    color: null,
  },
  {
    name: 'Frost Brand',
    base: 'nh:long_sword',
    spfx: ['restr', 'attk', 'defn'],
    cspfx: NONE,
    bane: null,
    attk: atk('cold', 5, 0),
    defn: 'cold',
    cary: null,
    invoke: 'snowstorm',
    align: A_NONE,
    role: null,
    race: null,
    genSpe: 0,
    giftValue: 9,
    cost: 3000,
    color: null,
  },
  {
    name: 'Fire Brand',
    base: 'nh:long_sword',
    spfx: ['restr', 'attk', 'defn'],
    cspfx: NONE,
    bane: null,
    attk: atk('fire', 5, 0),
    defn: 'fire',
    cary: null,
    invoke: 'firestorm',
    align: A_NONE,
    role: null,
    race: null,
    genSpe: 0,
    giftValue: 5,
    cost: 3000,
    color: null,
  },
  {
    name: 'Dragonbane',
    base: 'nh:broadsword',
    spfx: ['restr', 'reflect'],
    cspfx: NONE,
    bane: { kind: 'class', ch: 'D' },
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: null,
    align: A_NONE,
    role: null,
    race: null,
    genSpe: 2,
    giftValue: 5,
    cost: 500,
    color: null,
  },
  {
    name: 'Demonbane',
    base: 'nh:silver_mace',
    spfx: ['restr'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'demon' },
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: 'banish',
    align: A_LAWFUL,
    role: 'priest', // PM_CLERIC
    race: null,
    genSpe: 1,
    giftValue: 3,
    cost: 2500,
    color: null,
  },
  {
    name: 'Werebane',
    base: 'nh:silver_saber',
    spfx: ['restr'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'were' },
    attk: atk('phys', 5, 0),
    defn: 'were',
    cary: null,
    invoke: null,
    align: A_NONE,
    role: null,
    race: null,
    genSpe: 1,
    giftValue: 4,
    cost: 1500,
    color: null,
  },
  {
    name: 'Grayswandir',
    base: 'nh:silver_saber',
    spfx: ['restr', 'halres'],
    cspfx: NONE,
    bane: null,
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: null,
    align: A_LAWFUL,
    role: null,
    race: null,
    genSpe: 0,
    giftValue: 10,
    cost: 8000,
    color: null,
  },
  {
    name: 'Giantslayer',
    base: 'nh:long_sword',
    spfx: ['restr'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'giant' },
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: null,
    align: A_NEUTRAL,
    role: null,
    race: null,
    genSpe: 2,
    giftValue: 4,
    cost: 200,
    color: null,
  },
  {
    name: 'Ogresmasher',
    base: 'nh:war_hammer',
    spfx: ['restr'],
    cspfx: NONE,
    bane: { kind: 'class', ch: 'O' },
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: null,
    align: A_NONE,
    role: null,
    race: null,
    genSpe: 2,
    giftValue: 1,
    cost: 200,
    color: null,
  },
  {
    name: 'Trollsbane',
    base: 'nh:morning_star',
    spfx: ['restr', 'regen'],
    cspfx: NONE,
    bane: { kind: 'class', ch: 'T' },
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: null,
    align: A_NONE,
    role: null,
    race: null,
    genSpe: 2,
    giftValue: 1,
    cost: 200,
    color: null,
  },
  {
    name: 'Vorpal Blade',
    base: 'nh:long_sword',
    spfx: ['restr', 'behead'],
    cspfx: NONE,
    bane: null,
    attk: atk('phys', 5, 1),
    defn: null,
    cary: null,
    invoke: null,
    align: A_NEUTRAL,
    role: null,
    race: null,
    genSpe: 1,
    giftValue: 5,
    cost: 4000,
    color: null,
  },
  {
    name: 'Snickersnee',
    base: 'nh:katana',
    spfx: ['restr'],
    cspfx: NONE,
    bane: null,
    attk: atk('phys', 0, 8),
    defn: null,
    cary: null,
    invoke: null,
    align: A_LAWFUL,
    role: 'samurai',
    race: null,
    genSpe: 0,
    giftValue: 8,
    cost: 1200,
    color: null,
  },
  // Sunsword emits light when wielded (handled in the core rather than via artifact fields)
  {
    name: 'Sunsword',
    base: 'nh:long_sword',
    spfx: ['restr'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'undead' },
    attk: atk('phys', 5, 0),
    defn: 'blnd',
    cary: null,
    invoke: 'blinding_ray',
    align: A_LAWFUL,
    role: null,
    race: null,
    genSpe: 0,
    giftValue: 6,
    cost: 1500,
    color: null,
  },
  // The artifacts for the quest dungeon, all self-willed; gen_spe 0, gift_value 12.
  {
    name: 'The Orb of Detection',
    base: 'nh:crystal_ball',
    spfx: ['nogen', 'restr', 'intel'],
    cspfx: ['esp', 'hspdam'],
    bane: null,
    attk: null,
    defn: null,
    cary: 'magm',
    invoke: 'invis',
    align: A_LAWFUL,
    role: 'archeologist',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 2500,
    color: null,
  },
  {
    name: 'The Heart of Ahriman',
    base: 'nh:luckstone',
    spfx: ['nogen', 'restr', 'intel'],
    cspfx: ['stlth'],
    bane: null,
    // this stone does double damage if used as a projectile weapon
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: 'levitation',
    align: A_NEUTRAL,
    role: 'barbarian',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 2500,
    color: null,
  },
  {
    name: 'The Sceptre of Might',
    base: 'nh:mace',
    spfx: ['nogen', 'restr', 'intel'],
    cspfx: NONE,
    bane: { kind: 'align' },
    attk: atk('phys', 5, 0),
    defn: 'magm',
    cary: null,
    invoke: 'conflict',
    align: A_LAWFUL,
    role: 'caveman', // PM_CAVE_DWELLER
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 2500,
    color: null,
  },
  {
    name: 'The Staff of Aesculapius',
    base: 'nh:quarterstaff',
    spfx: ['nogen', 'restr', 'attk', 'intel', 'drli', 'regen'],
    cspfx: NONE,
    bane: null,
    attk: atk('drli', 0, 0),
    defn: 'drli',
    cary: null,
    invoke: 'healing',
    align: A_NEUTRAL,
    role: 'healer',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 5000,
    color: null,
  },
  {
    name: 'The Magic Mirror of Merlin',
    base: 'nh:mirror',
    spfx: ['nogen', 'restr', 'intel', 'speak'],
    cspfx: ['esp'],
    bane: null,
    attk: null,
    defn: null,
    cary: 'magm',
    invoke: null,
    align: A_LAWFUL,
    role: 'knight',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 1500,
    color: null,
  },
  {
    name: 'The Eyes of the Overworld',
    base: 'nh:lenses',
    spfx: ['nogen', 'restr', 'intel', 'xray'],
    cspfx: NONE,
    bane: null,
    attk: null,
    defn: 'magm',
    cary: null,
    invoke: 'enlightening',
    align: A_NEUTRAL,
    role: 'monk',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 2500,
    color: null,
  },
  {
    name: 'The Mitre of Holiness',
    base: 'nh:helm_of_brilliance',
    spfx: ['nogen', 'restr', 'intel', 'protect'],
    cspfx: NONE,
    bane: { kind: 'flag', flag: 'undead' },
    attk: null,
    defn: null,
    cary: 'fire',
    invoke: 'energy_boost',
    align: A_LAWFUL,
    role: 'priest', // PM_CLERIC
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 2000,
    color: null,
  },
  {
    name: 'The Longbow of Diana',
    base: 'nh:bow',
    spfx: ['nogen', 'restr', 'intel', 'reflect'],
    cspfx: ['esp'],
    bane: null,
    attk: atk('phys', 5, 0),
    defn: null,
    cary: null,
    invoke: 'create_ammo',
    align: A_CHAOTIC,
    role: 'ranger',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 4000,
    color: null,
  },
  // MKoT has an additional carry property if the Key is not cursed (for rogues) or blessed (for
  // non-rogues): #untrap of doors and chests will always find any traps and disarming those
  // will always succeed
  {
    name: 'The Master Key of Thievery',
    base: 'nh:skeleton_key',
    spfx: ['nogen', 'restr', 'intel', 'speak'],
    cspfx: ['warn', 'tctrl', 'hphdam'],
    bane: null,
    attk: null,
    defn: null,
    cary: null,
    invoke: 'untrap',
    align: A_CHAOTIC,
    role: 'rogue',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 3500,
    color: null,
  },
  {
    name: 'The Tsurugi of Muramasa',
    base: 'nh:tsurugi',
    spfx: ['nogen', 'restr', 'intel', 'behead', 'luck', 'protect'],
    cspfx: NONE,
    bane: null,
    attk: atk('phys', 0, 8),
    defn: null,
    cary: null,
    invoke: null,
    align: A_LAWFUL,
    role: 'samurai',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 4500,
    color: null,
  },
  {
    name: 'The Platinum Yendorian Express Card',
    base: 'nh:credit_card',
    spfx: ['nogen', 'restr', 'intel', 'defn'],
    cspfx: ['esp', 'hspdam'],
    bane: null,
    attk: null,
    defn: null,
    cary: 'magm',
    invoke: 'charge_obj',
    align: A_NEUTRAL,
    role: 'tourist',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 7000,
    color: null,
  },
  {
    name: 'The Orb of Fate',
    base: 'nh:crystal_ball',
    spfx: ['nogen', 'restr', 'intel', 'luck'],
    cspfx: ['warn', 'hspdam', 'hphdam'],
    bane: null,
    attk: null,
    defn: null,
    cary: null,
    invoke: 'lev_tele',
    align: A_NEUTRAL,
    role: 'valkyrie',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 3500,
    color: null,
  },
  {
    name: 'The Eye of the Aethiopica',
    base: 'nh:amulet_of_esp',
    spfx: ['nogen', 'restr', 'intel'],
    cspfx: ['eregen', 'hspdam'],
    bane: null,
    attk: null,
    defn: 'magm',
    cary: null,
    invoke: 'create_portal',
    align: A_NEUTRAL,
    role: 'wizard',
    race: null,
    genSpe: 0,
    giftValue: 12,
    cost: 4000,
    color: null,
  },
];

/** The table in artilist.h order (C's ART_ index - 1). */
export const ARTIFACTS: readonly ArtifactDef[] = ROWS.map((r) => ({ id: idOf(r.name), ...r }));

const BY_ID: Readonly<Record<string, ArtifactDef>> = Object.fromEntries(
  ARTIFACTS.map((a) => [a.id, a]),
);

/** The row with this id, or null. */
export function artifactRowOrNull(id: DefId | undefined): ArtifactDef | null {
  return id === undefined ? null : (BY_ID[id] ?? null);
}

/** The row with this id. */
export function artifactRow(id: DefId): ArtifactDef {
  const a = artifactRowOrNull(id);
  if (!a) throw new Error(`unknown artifact ${id}`);
  return a;
}

/** The first quest row: rows from here on are the quest artifacts (ART_ORB_OF_DETECTION on). */
const FIRST_QUEST = ARTIFACTS.findIndex((a) => a.id === 'nh:orb_of_detection');

/** A quest artifact's row (`oartifact >= ART_ORB_OF_DETECTION`). ref: src/objnam.c */
export const isQuestRow = (a: ArtifactDef): boolean => ARTIFACTS.indexOf(a) >= FIRST_QUEST;

/** Each role's quest artifact (urole.questarti). ref: src/role.c roles[] */
export const QUEST_ARTIFACT: Readonly<Record<RoleKey, DefId>> = {
  archeologist: 'nh:orb_of_detection',
  barbarian: 'nh:heart_of_ahriman',
  caveman: 'nh:sceptre_of_might',
  healer: 'nh:staff_of_aesculapius',
  knight: 'nh:magic_mirror_of_merlin',
  monk: 'nh:eyes_of_the_overworld',
  priest: 'nh:mitre_of_holiness',
  rogue: 'nh:master_key_of_thievery',
  ranger: 'nh:longbow_of_diana',
  samurai: 'nh:tsurugi_of_muramasa',
  tourist: 'nh:platinum_yendorian_express_card',
  valkyrie: 'nh:orb_of_fate',
  wizard: 'nh:eye_of_the_aethiopica',
};
