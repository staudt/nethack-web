// The starting inventories: every role's kit, the optional extras and the race substitutions. A
// leaf (core types and urole only): object ids and classes, numbers exactly as u_init.c, in its
// order. kit.ts makes them (ini_inv()).
// ref: src/u_init.c Archeologist[] .. Wizard[], Healing_book[] .. Money[], inv_subs[]
import type { DefId, ObjectClass } from '@nh/core';
import type { RaceKey, RoleKey } from './urole';

/** ref: src/u_init.c UNDEF_SPE, UNDEF_BLESS */
export const UNDEF = 'undef';

/**
 * One kit line. ref: src/u_init.c struct trobj (trotyp, trspe, trclass, trquan_min, trquan_max,
 * trbless); `id` null is UNDEF_TYP (a random object of the class).
 */
export interface TrObj {
  id: DefId | null;
  cls: ObjectClass;
  spe: number | typeof UNDEF;
  qmin: number;
  qmax: number;
  bless: 0 | 1 | typeof UNDEF;
}

const t = (
  id: string | null,
  spe: number | typeof UNDEF,
  cls: ObjectClass,
  qmin: number,
  qmax: number,
  bless: 0 | 1 | typeof UNDEF,
): TrObj => ({ id: id === null ? null : (`nh:${id}` as DefId), cls, spe, qmin, qmax, bless });

const U = UNDEF;

/** The roles' kits; the Barbarian has two (`barbarian` is Barbarian_0). ref: src/u_init.c */
export const KITS: Readonly<Record<RoleKey | 'barbarian_1', readonly TrObj[]>> = {
  // if adventure has a name...  idea from tan@uvm-gen
  archeologist: [
    t('bullwhip', 2, 'weapon', 1, 1, U),
    t('leather_jacket', 0, 'armor', 1, 1, U),
    t('fedora', 0, 'armor', 1, 1, U),
    t('food_ration', 0, 'food', 3, 3, 0),
    t('pick_axe', U, 'tool', 1, 1, U),
    t('tinning_kit', U, 'tool', 1, 1, U),
    t('touchstone', 0, 'gem', 1, 1, 0),
    t('sack', 0, 'tool', 1, 1, 0),
  ],
  barbarian: [
    t('two_handed_sword', 0, 'weapon', 1, 1, U),
    t('axe', 0, 'weapon', 1, 1, U),
    t('ring_mail', 0, 'armor', 1, 1, U),
    t('food_ration', 0, 'food', 1, 1, 0),
  ],
  barbarian_1: [
    t('battle_axe', 0, 'weapon', 1, 1, U),
    t('short_sword', 0, 'weapon', 1, 1, U),
    t('ring_mail', 0, 'armor', 1, 1, U),
    t('food_ration', 0, 'food', 1, 1, 0),
  ],
  caveman: [
    t('club', 1, 'weapon', 1, 1, U),
    t('sling', 2, 'weapon', 1, 1, U),
    t('flint_stone', 0, 'gem', 10, 20, U),
    t('rock', 0, 'gem', 3, 3, 0), // yields 18..33
    t('leather_armor', 0, 'armor', 1, 1, U),
  ],
  healer: [
    t('scalpel', 0, 'weapon', 1, 1, U),
    t('leather_gloves', 1, 'armor', 1, 1, U),
    t('stethoscope', 0, 'tool', 1, 1, 0),
    t('potion_of_healing', 0, 'potion', 4, 4, U),
    t('potion_of_extra_healing', 0, 'potion', 4, 4, U),
    t('wand_of_sleep', U, 'wand', 1, 1, U),
    // always blessed, so it's guaranteed readable
    t('spellbook_of_healing', 0, 'spellbook', 1, 1, 1),
    t('spellbook_of_extra_healing', 0, 'spellbook', 1, 1, 1),
    t('spellbook_of_stone_to_flesh', 0, 'spellbook', 1, 1, 1),
    t('apple', 0, 'food', 5, 5, 0),
  ],
  knight: [
    t('long_sword', 1, 'weapon', 1, 1, U),
    t('lance', 1, 'weapon', 1, 1, U),
    t('ring_mail', 1, 'armor', 1, 1, U),
    t('helmet', 0, 'armor', 1, 1, U),
    t('small_shield', 0, 'armor', 1, 1, U),
    t('leather_gloves', 0, 'armor', 1, 1, U),
    t('apple', 0, 'food', 10, 10, 0),
    t('carrot', 0, 'food', 10, 10, 0),
  ],
  monk: [
    t('leather_gloves', 2, 'armor', 1, 1, U),
    t('robe', 1, 'armor', 1, 1, U),
    t(null, U, 'scroll', 1, 1, U),
    t('potion_of_healing', 0, 'potion', 3, 3, U),
    t('food_ration', 0, 'food', 3, 3, 0),
    t('apple', 0, 'food', 5, 5, U),
    t('orange', 0, 'food', 5, 5, U),
    t('fortune_cookie', 0, 'food', 3, 3, U),
  ],
  priest: [
    t('mace', 1, 'weapon', 1, 1, 1),
    t('robe', 0, 'armor', 1, 1, U),
    t('small_shield', 0, 'armor', 1, 1, U),
    t('potion_of_water', 0, 'potion', 4, 4, 1), // holy water
    t('clove_of_garlic', 0, 'food', 1, 1, 0),
    t('sprig_of_wolfsbane', 0, 'food', 1, 1, 0),
    t(null, U, 'spellbook', 2, 2, U),
  ],
  ranger: [
    t('dagger', 1, 'weapon', 1, 1, U),
    t('bow', 1, 'weapon', 1, 1, U),
    t('arrow', 2, 'weapon', 50, 59, U),
    t('arrow', 0, 'weapon', 30, 39, U),
    t('cloak_of_displacement', 2, 'armor', 1, 1, U),
    t('cram_ration', 0, 'food', 4, 4, 0),
  ],
  rogue: [
    t('short_sword', 0, 'weapon', 1, 1, U),
    t('dagger', 0, 'weapon', 6, 15, 0),
    t('leather_armor', 1, 'armor', 1, 1, U),
    t('potion_of_sickness', 0, 'potion', 1, 1, 0),
    t('lock_pick', 0, 'tool', 1, 1, 0),
    t('sack', 0, 'tool', 1, 1, 0),
  ],
  samurai: [
    t('katana', 0, 'weapon', 1, 1, U),
    t('short_sword', 0, 'weapon', 1, 1, U), // wakizashi
    t('yumi', 0, 'weapon', 1, 1, U),
    t('ya', 0, 'weapon', 26, 45, U),
    t('splint_mail', 0, 'armor', 1, 1, U),
  ],
  tourist: [
    t('dart', 2, 'weapon', 21, 40, U),
    t(null, U, 'food', 10, 10, 0),
    t('potion_of_extra_healing', 0, 'potion', 2, 2, U),
    t('scroll_of_magic_mapping', 0, 'scroll', 4, 4, U),
    t('hawaiian_shirt', 0, 'armor', 1, 1, U),
    t('expensive_camera', U, 'tool', 1, 1, 0),
    t('credit_card', 0, 'tool', 1, 1, 0),
  ],
  valkyrie: [
    t('spear', 1, 'weapon', 1, 1, U),
    t('dagger', 0, 'weapon', 1, 1, U),
    t('small_shield', 3, 'armor', 1, 1, U),
    t('food_ration', 0, 'food', 1, 1, 0),
  ],
  wizard: [
    t('quarterstaff', 1, 'weapon', 1, 1, 1),
    t('cloak_of_magic_resistance', 0, 'armor', 1, 1, U),
    t(null, U, 'wand', 1, 1, U),
    t(null, U, 'ring', 2, 2, U),
    t(null, U, 'potion', 3, 3, U),
    t(null, U, 'scroll', 3, 3, U),
    t('spellbook_of_force_bolt', 0, 'spellbook', 1, 1, 1),
    t(null, U, 'spellbook', 1, 1, U),
    t('magic_marker', 19, 'tool', 1, 1, 0), // actually spe = 18 + d4
  ],
};

/** The optional extra items. ref: src/u_init.c Healing_book[] .. Money[] (not Wishing[]) */
export const EXTRAS = {
  healingBook: [t('spellbook_of_healing', U, 'spellbook', 1, 1, 1)],
  protectionBook: [t('spellbook_of_protection', U, 'spellbook', 1, 1, 1)],
  confuseMonsterBook: [t('spellbook_of_confuse_monster', U, 'spellbook', 1, 1, 1)],
  tinopener: [t('tin_opener', 0, 'tool', 1, 1, 0)],
  magicmarker: [t('magic_marker', 19, 'tool', 1, 1, 0)],
  lamp: [t('oil_lamp', 1, 'tool', 1, 1, 0)],
  blindfold: [t('blindfold', 0, 'tool', 1, 1, 0)],
  xtraFood: [t(null, U, 'food', 2, 2, 0)],
  leash: [t('leash', 0, 'tool', 1, 1, 0)],
  towel: [t('towel', 0, 'tool', 1, 1, 0)],
  money: [t('gold_piece', 0, 'coin', 1, 1, 0)],
} as const satisfies Readonly<Record<string, readonly TrObj[]>>;

/** The elven Priest's or Wizard's instrument, rolled with ROLL_FROM(). ref: u_init_race() */
export const ELF_INSTRUMENTS: readonly DefId[] = [
  'nh:wooden_flute',
  'nh:tooled_horn',
  'nh:wooden_harp',
  'nh:bell',
  'nh:bugle',
  'nh:leather_drum',
];

/** An instrument's kit line. ref: u_init_race() Instrument[] */
export const instrument = (id: DefId): readonly TrObj[] => [
  { id, cls: 'tool', spe: 0, qmin: 1, qmax: 1, bless: 0 },
];

/**
 * Race-based substitutions for the initial inventory, random items included; the weaker cloak
 * for elven rangers is intentional--they shoot better. ref: src/u_init.c inv_subs[]
 */
export const INV_SUBS: readonly { race: RaceKey; from: DefId; to: DefId }[] = (
  [
    ['elf', 'dagger', 'elven_dagger'],
    ['elf', 'spear', 'elven_spear'],
    ['elf', 'short_sword', 'elven_short_sword'],
    ['elf', 'bow', 'elven_bow'],
    ['elf', 'arrow', 'elven_arrow'],
    ['elf', 'helmet', 'elven_leather_helm'],
    // { PM_ELF, SMALL_SHIELD, ELVEN_SHIELD },
    ['elf', 'cloak_of_displacement', 'elven_cloak'],
    ['elf', 'cram_ration', 'lembas_wafer'],
    ['orc', 'dagger', 'orcish_dagger'],
    ['orc', 'spear', 'orcish_spear'],
    ['orc', 'short_sword', 'orcish_short_sword'],
    ['orc', 'bow', 'orcish_bow'],
    ['orc', 'arrow', 'orcish_arrow'],
    ['orc', 'helmet', 'orcish_helm'],
    ['orc', 'small_shield', 'orcish_shield'],
    ['orc', 'ring_mail', 'orcish_ring_mail'],
    ['orc', 'chain_mail', 'orcish_chain_mail'],
    ['orc', 'cram_ration', 'tripe_ration'],
    ['orc', 'lembas_wafer', 'tripe_ration'],
    ['dwarf', 'spear', 'dwarvish_spear'],
    ['dwarf', 'short_sword', 'dwarvish_short_sword'],
    ['dwarf', 'helmet', 'dwarvish_iron_helm'],
    // { PM_DWARF, SMALL_SHIELD, DWARVISH_ROUNDSHIELD },
    // { PM_DWARF, PICK_AXE, DWARVISH_MATTOCK },
    ['dwarf', 'lembas_wafer', 'cram_ration'],
    ['gnome', 'bow', 'crossbow'],
    ['gnome', 'arrow', 'crossbow_bolt'],
  ] as const
).map(([race, from, to]) => ({ race, from: `nh:${from}` as DefId, to: `nh:${to}` as DefId }));

/** The objects each race recognizes. ref: src/u_init.c u_init_race() knows_object() */
export const RACE_KNOWS: Readonly<Record<RaceKey, readonly DefId[]>> = {
  human: [],
  elf: [
    'elven_short_sword',
    'elven_arrow',
    'elven_bow',
    'elven_spear',
    'elven_dagger',
    'elven_broadsword',
    'elven_mithril_coat',
    'elven_leather_helm',
    'elven_shield',
    'elven_boots',
    'elven_cloak',
  ].map((s) => `nh:${s}` as DefId),
  dwarf: [
    'dwarvish_spear',
    'dwarvish_short_sword',
    'dwarvish_mattock',
    'dwarvish_iron_helm',
    'dwarvish_mithril_coat',
    'dwarvish_cloak',
    'dwarvish_roundshield',
  ].map((s) => `nh:${s}` as DefId),
  gnome: [],
  orc: [
    'orcish_short_sword',
    'orcish_arrow',
    'orcish_bow',
    'orcish_spear',
    'orcish_dagger',
    'orcish_chain_mail',
    'orcish_ring_mail',
    'orcish_helm',
    'orcish_shield',
    'uruk_hai_shield',
    'orcish_cloak',
  ].map((s) => `nh:${s}` as DefId),
};

/**
 * The objects whose Japanese names a Samurai sees, which she knows from the start (magic ones
 * excluded: the magic koto). ref: src/objnam.c Japanese_items[]; src/u_init.c u_init_role()
 */
export const JAPANESE_ITEMS: readonly DefId[] = [
  'short_sword',
  'broadsword',
  'flail',
  'glaive',
  'lock_pick',
  'wooden_harp',
  'magic_harp',
  'knife',
  'plate_mail',
  'helmet',
  'leather_gloves',
  'food_ration',
  'potion_of_booze',
].map((s) => `nh:${s}` as DefId);
