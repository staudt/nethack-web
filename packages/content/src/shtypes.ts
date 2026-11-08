// The shop types: their names, chances, stock and shopkeeper names, and what each deals in. A
// leaf (core and eshk only), so shk.ts can ask without reaching object creation.
// ref: src/shknam.c shtypes[], shkliquors[] .. shkhealthfoods[], veggy_item(), saleable()
import type { Ctx, DefId, Entity, ObjectClass, ObjectDef } from '@nh/core';
import type { Eshk } from './eshk';
import { vegetarian } from './mondata';

// ---------------------------------------------------------------------------------------------
// shopkeeper names. ref: src/shknam.c shkliquors[] .. shkhealthfoods[] (shktools[] without the
// port-specific names)

const SHK_LIQUORS: readonly string[] = [
  'Njezjin',
  'Tsjernigof',
  'Ossipewsk',
  'Gorlowka',
  'Gomel',
  'Konosja',
  'Weliki Oestjoeg',
  'Syktywkar',
  'Sablja',
  'Narodnaja',
  'Kyzyl',
  'Walbrzych',
  'Swidnica',
  'Klodzko',
  'Raciborz',
  'Gliwice',
  'Brzeg',
  'Krnov',
  'Hradec Kralove',
  'Leuk',
  'Brig',
  'Brienz',
  'Thun',
  'Sarnen',
  'Burglen',
  'Elm',
  'Flims',
  'Vals',
  'Schuls',
  'Zum Loch',
];
const SHK_BOOKS: readonly string[] = [
  'Skibbereen',
  'Kanturk',
  'Rath Luirc',
  'Ennistymon',
  'Lahinch',
  'Kinnegad',
  'Lugnaquillia',
  'Enniscorthy',
  'Gweebarra',
  'Kittamagh',
  'Nenagh',
  'Sneem',
  'Ballingeary',
  'Kilgarvan',
  'Cahersiveen',
  'Glenbeigh',
  'Kilmihil',
  'Kiltamagh',
  'Droichead Atha',
  'Inniscrone',
  'Clonegal',
  'Lisnaskea',
  'Culdaff',
  'Dunfanaghy',
  'Inishbofin',
  'Kesh',
];
const SHK_ARMORS: readonly string[] = [
  'Demirci',
  'Kalecik',
  'Boyabai',
  'Yildizeli',
  'Gaziantep',
  'Siirt',
  'Akhalataki',
  'Tirebolu',
  'Aksaray',
  'Ermenak',
  'Iskenderun',
  'Kadirli',
  'Siverek',
  'Pervari',
  'Malasgirt',
  'Bayburt',
  'Ayancik',
  'Zonguldak',
  'Balya',
  'Tefenni',
  'Artvin',
  'Kars',
  'Makharadze',
  'Malazgirt',
  'Midyat',
  'Birecik',
  'Kirikkale',
  'Alaca',
  'Polatli',
  'Nallihan',
];
const SHK_WANDS: readonly string[] = [
  'Yr Wyddgrug',
  'Trallwng',
  'Mallwyd',
  'Pontarfynach',
  'Rhaeader',
  'Llandrindod',
  'Llanfair-ym-muallt',
  'Y-Fenni',
  'Maesteg',
  'Rhydaman',
  'Beddgelert',
  'Curig',
  'Llanrwst',
  'Llanerchymedd',
  'Caergybi',
  'Nairn',
  'Turriff',
  'Inverurie',
  'Braemar',
  'Lochnagar',
  'Kerloch',
  'Beinn a Ghlo',
  'Drumnadrochit',
  'Morven',
  'Uist',
  'Storr',
  'Sgurr na Ciche',
  'Cannich',
  'Gairloch',
  'Kyleakin',
  'Dunvegan',
];
export const SHK_RINGS: readonly string[] = [
  'Feyfer',
  'Flugi',
  'Gheel',
  'Havic',
  'Haynin',
  'Hoboken',
  'Imbyze',
  'Juyn',
  'Kinsky',
  'Massis',
  'Matray',
  'Moy',
  'Olycan',
  'Sadelin',
  'Svaving',
  'Tapper',
  'Terwen',
  'Wirix',
  'Ypey',
  'Rastegaisa',
  'Varjag Njarga',
  'Kautekeino',
  'Abisko',
  'Enontekis',
  'Rovaniemi',
  'Avasaksa',
  'Haparanda',
  'Lulea',
  'Gellivare',
  'Oeloe',
  'Kajaani',
  'Fauske',
];
const SHK_FOODS: readonly string[] = [
  'Djasinga',
  'Tjibarusa',
  'Tjiwidej',
  'Pengalengan',
  'Bandjar',
  'Parbalingga',
  'Bojolali',
  'Sarangan',
  'Ngebel',
  'Djombang',
  'Ardjawinangun',
  'Berbek',
  'Papar',
  'Baliga',
  'Tjisolok',
  'Siboga',
  'Banjoewangi',
  'Trenggalek',
  'Karangkobar',
  'Njalindoeng',
  'Pasawahan',
  'Pameunpeuk',
  'Patjitan',
  'Kediri',
  'Pemboeang',
  'Tringanoe',
  'Makin',
  'Tipor',
  'Semai',
  'Berhala',
  'Tegal',
  'Samoe',
];
const SHK_WEAPONS: readonly string[] = [
  'Voulgezac',
  'Rouffiac',
  'Lerignac',
  'Touverac',
  'Guizengeard',
  'Melac',
  'Neuvicq',
  'Vanzac',
  'Picq',
  'Urignac',
  'Corignac',
  'Fleac',
  'Lonzac',
  'Vergt',
  'Queyssac',
  'Liorac',
  'Echourgnac',
  'Cazelon',
  'Eypau',
  'Carignan',
  'Monbazillac',
  'Jonzac',
  'Pons',
  'Jumilhac',
  'Fenouilledes',
  'Laguiolet',
  'Saujon',
  'Eymoutiers',
  'Eygurande',
  'Eauze',
  'Labouheyre',
];
export const SHK_TOOLS: readonly string[] = [
  'Ymla',
  'Eed-morra',
  'Elan Lapinski',
  'Cubask',
  'Nieb',
  'Bnowr Falr',
  'Sperc',
  'Noskcirdneh',
  'Yawolloh',
  'Hyeghu',
  'Niskal',
  'Trahnil',
  'Htargcm',
  'Enrobwem',
  'Kachzi Rellim',
  'Regien',
  'Donmyar',
  'Yelpur',
  'Nosnehpets',
  'Stewe',
  'Renrut',
  'Senna Hut',
  '-Zlaw',
  'Nosalnef',
  'Rewuorb',
  'Rellenk',
  'Yad',
  'Cire Htims',
  'Y-crad',
  'Nenilukah',
  'Corsh',
  'Aned',
  'Dark Eery',
  'Niknar',
  'Lapu',
  'Lechaim',
  'Rebrol-nek',
  'AlliWar Wickson',
  'Oguhmk',
  'Telloc Cyaj',
];
export const SHK_LIGHT: readonly string[] = [
  'Zarnesti',
  'Slanic',
  'Nehoiasu',
  'Ludus',
  'Sighisoara',
  'Nisipitu',
  'Razboieni',
  'Bicaz',
  'Dorohoi',
  'Vaslui',
  'Fetesti',
  'Tirgu Neamt',
  'Babadag',
  'Zimnicea',
  'Zlatna',
  'Jiu',
  'Eforie',
  'Mamaia',
  'Silistra',
  'Tulovo',
  'Panagyuritshte',
  'Smolyan',
  'Kirklareli',
  'Pernik',
  'Lom',
  'Haskovo',
  'Dobrinishte',
  'Varvara',
  'Oryahovo',
  'Troyan',
  'Lovech',
  'Sliven',
];
export const SHK_GENERAL: readonly string[] = [
  'Hebiwerie',
  'Possogroenoe',
  'Asidonhopo',
  'Manlobbi',
  'Adjama',
  'Pakka Pakka',
  'Kabalebo',
  'Wonotobo',
  'Akalapi',
  'Sipaliwini',
  'Annootok',
  'Upernavik',
  'Angmagssalik',
  'Aklavik',
  'Inuvik',
  'Tuktoyaktuk',
  'Chicoutimi',
  'Ouiatchouane',
  'Chibougamau',
  'Matagami',
  'Kipawa',
  'Kinojevis',
  'Abitibi',
  'Maganasipi',
  'Akureyri',
  'Kopasker',
  'Budereyri',
  'Akranes',
  'Bordeyri',
  'Holmavik',
];
const SHK_HEALTHFOODS: readonly string[] = [
  "Ga'er",
  'Zhangmu',
  'Rikaze',
  'Jiangji',
  'Changdu',
  'Linzhi',
  'Shigatse',
  'Gyantse',
  'Ganden',
  'Tsurphu',
  'Lhasa',
  'Tsedong',
  'Drepung',
  '=Azura',
  '=Blaze',
  '=Breanna',
  '=Breezy',
  '=Dharma',
  '=Feather',
  '=Jasmine',
  '=Luna',
  '=Melody',
  '=Moonjava',
  '=Petal',
  '=Rhiannon',
  '=Starla',
  '=Tranquilla',
  '=Windsong',
  '=Zennia',
  '=Zoe',
  '=Zora',
];

/** What a stock roll gives: a class (mkobj), any class, a vegetarian food, or one object type. */
export type ShopItem = ObjectClass | 'random' | 'veggy' | { def: DefId };

/** ref: include/mkroom.h struct shclass */
export interface ShopType {
  /** The room type. */
  id: DefId;
  /** The shop's name ("lighting store"). */
  nameKey: string;
  /** Percent chance of a random shop being this type (0: special levels only). */
  prob: number;
  symb: ObjectClass | 'random';
  /** Stock probabilities; they sum to 100. */
  iprobs: readonly { prob: number; item: ShopItem }[];
  /** Shopkeeper names, with their prefixes ('-' / '_' female, '+' / '|' male, '=' either). */
  names: readonly string[];
}

const obj = (def: string): ShopItem => ({ def: def as DefId });

/** The shop types in NetHack's order. ref: src/shknam.c shtypes[] */
export const SHTYPES: readonly ShopType[] = [
  {
    id: 'nh:shop',
    nameKey: 'shop.name.general',
    prob: 42,
    symb: 'random',
    iprobs: [{ prob: 100, item: 'random' }],
    names: SHK_GENERAL,
  },
  {
    id: 'nh:armor_shop',
    nameKey: 'shop.name.armor',
    prob: 14,
    symb: 'armor',
    iprobs: [
      { prob: 90, item: 'armor' },
      { prob: 10, item: 'weapon' },
    ],
    names: SHK_ARMORS,
  },
  {
    id: 'nh:scroll_shop',
    nameKey: 'shop.name.scroll',
    prob: 10,
    symb: 'scroll',
    iprobs: [
      { prob: 90, item: 'scroll' },
      { prob: 10, item: 'spellbook' },
    ],
    names: SHK_BOOKS,
  },
  {
    id: 'nh:potion_shop',
    nameKey: 'shop.name.potion',
    prob: 10,
    symb: 'potion',
    iprobs: [{ prob: 100, item: 'potion' }],
    names: SHK_LIQUORS,
  },
  {
    id: 'nh:weapon_shop',
    nameKey: 'shop.name.weapon',
    prob: 5,
    symb: 'weapon',
    iprobs: [
      { prob: 90, item: 'weapon' },
      { prob: 10, item: 'armor' },
    ],
    names: SHK_WEAPONS,
  },
  {
    id: 'nh:food_shop',
    nameKey: 'shop.name.food',
    prob: 5,
    symb: 'food',
    iprobs: [
      { prob: 83, item: 'food' },
      { prob: 5, item: obj('nh:potion_of_fruit_juice') },
      { prob: 4, item: obj('nh:potion_of_booze') },
      { prob: 5, item: obj('nh:potion_of_water') },
      { prob: 3, item: obj('nh:ice_box') },
    ],
    names: SHK_FOODS,
  },
  {
    id: 'nh:ring_shop',
    nameKey: 'shop.name.ring',
    prob: 3,
    symb: 'ring',
    iprobs: [
      { prob: 85, item: 'ring' },
      { prob: 10, item: 'gem' },
      { prob: 5, item: 'amulet' },
    ],
    names: SHK_RINGS,
  },
  {
    id: 'nh:wand_shop',
    nameKey: 'shop.name.wand',
    prob: 3,
    symb: 'wand',
    iprobs: [
      { prob: 90, item: 'wand' },
      { prob: 5, item: obj('nh:leather_gloves') },
      { prob: 5, item: obj('nh:elven_cloak') },
    ],
    names: SHK_WANDS,
  },
  {
    id: 'nh:tool_shop',
    nameKey: 'shop.name.tool',
    prob: 3,
    symb: 'tool',
    iprobs: [{ prob: 100, item: 'tool' }],
    names: SHK_TOOLS,
  },
  {
    id: 'nh:book_shop',
    nameKey: 'shop.name.book',
    prob: 3,
    symb: 'spellbook',
    iprobs: [
      { prob: 90, item: 'spellbook' },
      { prob: 10, item: 'scroll' },
    ],
    names: SHK_BOOKS,
  },
  {
    id: 'nh:health_food_shop',
    nameKey: 'shop.name.health_food',
    prob: 2,
    symb: 'food',
    iprobs: [
      { prob: 70, item: 'veggy' },
      { prob: 20, item: obj('nh:potion_of_fruit_juice') },
      { prob: 4, item: obj('nh:potion_of_healing') },
      { prob: 3, item: obj('nh:potion_of_full_healing') },
      { prob: 2, item: obj('nh:scroll_of_food_detection') },
      { prob: 1, item: obj('nh:lump_of_royal_jelly') },
    ],
    names: SHK_HEALTHFOODS,
  },
  // "unique" shops (probability 0): only made by special levels
  {
    id: 'nh:candle_shop',
    nameKey: 'shop.name.lighting',
    prob: 0,
    symb: 'tool',
    iprobs: [
      { prob: 30, item: obj('nh:wax_candle') },
      { prob: 44, item: obj('nh:tallow_candle') },
      { prob: 5, item: obj('nh:brass_lantern') },
      { prob: 9, item: obj('nh:oil_lamp') },
      { prob: 3, item: obj('nh:magic_lamp') },
      { prob: 5, item: obj('nh:potion_of_oil') },
      { prob: 2, item: obj('nh:wand_of_light') },
      { prob: 1, item: obj('nh:scroll_of_light') },
      { prob: 1, item: obj('nh:spellbook_of_light') },
    ],
    names: SHK_LIGHT,
  },
];

/** The shop type of room type `id`, or null when it is not a shop. */
export function shopType(id: DefId | undefined): ShopType | null {
  return SHTYPES.find((s) => s.id === id) ?? null;
}

// ---------------------------------------------------------------------------------------------
// vegetarian food

/** ref: include/mondata.h vegetarian() of a monster type id */
const vegetarianMon = (ctx: Pick<Ctx, 'defs'>, id: DefId): boolean =>
  ctx.defs.isMonster(id) && vegetarian(ctx.defs.monster(id));

/**
 * The object (or, with `obj` null, the object type `def`) is vegetarian food; for a type, one
 * that might go either way counts. ref: src/shknam.c veggy_item() (no eggs or tins)
 */
export function veggyItem(ctx: Pick<Ctx, 'defs'>, o: Entity | null, def: ObjectDef): boolean {
  if (def.class !== 'food') return false;
  if (def.material === 'veggy') return true;
  if (def.id === 'nh:corpse') {
    const m = o === null ? null : o.c.item?.corpseOf;
    return o === null || (m !== undefined && m !== null && vegetarianMon(ctx, m));
  }
  return false;
}

/**
 * Whether the shopkeeper's shop deals in this object: a general store in everything, others in
 * the classes and types of their stock. ref: src/shknam.c saleable()
 */
export function saleable(ctx: Pick<Ctx, 'defs'>, shk: Eshk, o: Entity): boolean {
  const shp = shopType(shk.shoptype);
  if (!shp) return false;
  if (shp.symb === 'random') return true;
  const def = ctx.defs.object(o.def);
  for (const { item } of shp.iprobs) {
    if (item === 'veggy') {
      if (veggyItem(ctx, o, def)) return true;
    } else if (typeof item === 'object' ? item.def === o.def : item === def.class) return true;
  }
  return false;
}
