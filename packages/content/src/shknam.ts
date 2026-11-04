// Shop types, shopkeepers and their stock: a shop room gets its shopkeeper by the door and an
// object of its type on every other floor square when its level is made.
// ref: src/shknam.c shtypes[], shkinit(), nameshk(), good_shopdoor(), stock_room(),
// stock_room_goodpos(), mkshobj_at(), get_shop_item(), veggy_item(), shkveg(), mkveggy_at(),
// saleable(); src/sp_lev.c fill_special_room() (the shop branch)
//
// Not ported: mimics posing as stock (none exist: the rn2(100) < depth roll is made), the tribute
// novel, the "Closed for inventory" engraving of a locked shop door (no engravings), trapped
// doors, irregular shops (no Minetown shop is one), Orcus's ghost town, the touchstone and the
// scroll of charging shopkeepers carry (not in the object table: the rolls are made).
import {
  cellIndex,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Level,
  type ModApi,
  type ObjectClass,
  type ObjectDef,
  type Pos,
} from '@nh/core';
import { SHOPKEEPER, eshkOf, setEshk, shopDoors, type Eshk } from './eshk';
import { makemon, rlocPos } from './generation';
import { mkobj, mksobjFull } from './mkobj';
import { mkmonmoney } from './mongear';
import { T, setTerrain } from './terrain';
import { monLearnsTraps } from './trapstate';

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
const SHK_RINGS: readonly string[] = [
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
const SHK_TOOLS: readonly string[] = [
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
const SHK_LIGHT: readonly string[] = [
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
const SHK_GENERAL: readonly string[] = [
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

/**
 * ref: include/mondata.h vegetarian(): vegan (blobs, jellies, fungi, vortices, lights,
 * elementals but stalkers; no golems or ghosts in the roster) or a pudding but the black one
 */
function vegetarianMon(ctx: Pick<Ctx, 'defs'>, id: DefId): boolean {
  if (!ctx.defs.isMonster(id)) return false;
  const ch = ctx.defs.monster(id).glyph.ch;
  if ('bjFvy'.includes(ch)) return true;
  if (ch === 'E') return id !== 'nh:stalker';
  return ch === 'P' && id !== 'nh:black_pudding';
}

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

/** A random vegetarian food type, by probability. ref: src/shknam.c shkveg() */
function shkveg(ctx: Pick<Ctx, 'rng' | 'defs'>): ObjectDef | null {
  // (a corpse type counts as veggy here only in C's view of an unmade one; it never had a
  // chance of being picked there either way, as corpses have oc_prob 0)
  const ok = ctx.defs.objects.filter(
    (d) => d.class === 'food' && d.id !== 'nh:corpse' && veggyItem(ctx, null, d),
  );
  const maxprob = ok.reduce((a, d) => a + d.prob, 0);
  if (maxprob < 1) return null;
  let prob = ctx.rng.rnd(maxprob);
  let j = 0;
  let pick = ok[0];
  while (pick && (prob -= pick.prob) > 0) pick = ok[++j];
  return pick ?? null;
}

// ---------------------------------------------------------------------------------------------
// stock

/**
 * The kind of object for a shop square: `for (j = rnd(100); (j -= iprob) > 0; i++)`. An entry
 * naming an object this port lacks is rolled again (see DEVIATIONS.md).
 * ref: src/shknam.c get_shop_item()
 */
export function getShopItem(ctx: Pick<Ctx, 'rng' | 'defs'>, shp: ShopType): ShopItem {
  for (;;) {
    let j = ctx.rng.rnd(100);
    let i = 0;
    while (i < shp.iprobs.length - 1 && (j -= shp.iprobs[i]?.prob ?? 0) > 0) i++;
    const item = shp.iprobs[i]?.item ?? 'random';
    if (typeof item !== 'object' || ctx.defs.isObject(item.def)) return item;
  }
}

/** Makes one object of the shop's kinds on x,y. ref: src/shknam.c mkshobj_at(), mkveggy_at() */
function mkshobjAt(ctx: Ctx, level: Level, shp: ShopType, x: number, y: number): void {
  // a mimic one time in 100 per level of depth (no mimics exist: the roll is made, the
  // square is stocked as usual)
  ctx.rng.rn2(100);
  const at = { level: level.id, x, y };
  const gen = { level: level.id, inMklev: true };
  const item = getShopItem(ctx, shp);
  if (item === 'veggy') {
    const def = shkveg(ctx);
    if (def) mksobjFull(ctx, def, { at, artif: true }, gen);
  } else if (typeof item === 'object') {
    mksobjFull(ctx, ctx.defs.object(item.def), { at, artif: true }, gen);
  } else mkobj(ctx, item, { at, ...gen });
}

/** ref: include/rm.h IS_ROOM(typ): floor, stairs, altars and fountains; not doors or corridors */
function isRoomCell(ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): boolean {
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined) return false;
  const t = ctx.defs.terrain(id);
  return t.passable && t.door === undefined && t.id !== T.corr;
}

// ---------------------------------------------------------------------------------------------
// the shopkeeper

/**
 * Where the shopkeeper stands for the door `d` of room `r`: one step inside.
 * ref: src/shknam.c good_shopdoor() (a regular room)
 */
function shkSpot(r: Level['rooms'][number], d: Pos): Pos | null {
  if (d.x === r.lx - 1) return { x: d.x + 1, y: d.y };
  if (d.x === r.hx + 1) return { x: d.x - 1, y: d.y };
  if (d.y === r.ly - 1) return { x: d.x, y: d.y + 1 };
  if (d.y === r.hy + 1) return { x: d.x, y: d.y - 1 };
  return null;
}

/**
 * A level ordinal standing in for ledger_no(): the dungeon's index in `state.dungeons` times
 * 100 plus the level number (only its value modulo the name list's length matters).
 */
function ledgerNo(ctx: Pick<Ctx, 'state'>, level: Level): number {
  const d = ctx.state.dungeons.findIndex((x) => x.id === level.dungeon);
  return Math.max(d, 0) * 100 + level.dlevel;
}

/**
 * Picks the shopkeeper's name from his shop type's list, different from every other living
 * shopkeeper's on the level: the town's lighting shop is always Izchak's; otherwise a name
 * that varies from game to game (from `state.seed`, standing in for the hero's birthday) and
 * level to level, random ones when it is taken, the general store's list when that runs dry,
 * and "Lucrezia" or "Dirk" at last. The tool shop list is always drawn at random.
 * ref: src/shknam.c nameshk()
 */
export function nameshk(
  ctx: Ctx,
  level: Level,
  shkId: EntityId,
  names: readonly string[],
): { shknam: string; female: boolean } {
  if (names === SHK_LIGHT && level.town === true) return { shknam: '+Izchak', female: false };
  let nlp = names;
  const nseed = Math.trunc(ctx.state.seed / 257);
  let nameWanted = shkId + ledgerNo(ctx, level) + (nseed % 13) - (nseed % 5);
  if (nameWanted < 0) nameWanted += 13 + 5;
  let female = (nameWanted & 1) === 1;
  let namesAvail = nlp.length;
  nameWanted = nameWanted % namesAvail;
  const taken = new Set<string>();
  for (const id of sortedIds(ctx.state)) {
    const e = eshkOf(ctx, id);
    const p = ctx.state.entities[String(id)]?.c.pos;
    if (id !== shkId && e && p?.level === level.id && ctx.state.entities[String(id)]?.c.monster)
      taken.add(e.shknam);
  }
  let shname = '';
  for (let trycnt = 0; trycnt < 50; trycnt++) {
    if (nlp === SHK_TOOLS) {
      shname = SHK_TOOLS[ctx.rng.rn2(namesAvail)] ?? '';
      female = false; // reversed below for '_' prefix
    } else if (nameWanted < namesAvail) {
      shname = nlp[nameWanted] ?? '';
    } else {
      const i = ctx.rng.rn2(namesAvail);
      if (i !== 0) shname = nlp[i - 1] ?? '';
      else if (nlp !== SHK_GENERAL) {
        nlp = SHK_GENERAL; // try general names
        namesAvail = nlp.length;
        continue; // next `trycnt' iteration
      } else shname = female ? '-Lucrezia' : '+Dirk';
    }
    const c = shname.charAt(0);
    if (c === '_' || c === '-') female = true;
    else if (c === '|' || c === '+') female = false;
    // is name already in use on this level?
    if (!taken.has(shname)) break; // new name
    nameWanted = namesAvail; // try a random name
  }
  return { shknam: shname, female };
}

/**
 * Makes the shopkeeper of shop `room`: at the first door of its walls, one step inside (any
 * monster there is moved away), peaceful, awake, knowing every trap, with 1030 to 4000 gold
 * and his name. Returns him, or null when the room has no door or he could not be made.
 * ref: src/shknam.c shkinit(), good_shopdoor()
 */
export function shkinit(ctx: Ctx, level: Level, room: number, shp: ShopType): EntityId | null {
  const r = level.rooms[room];
  const shd = shopDoors(ctx.defs, level, room)[0];
  const spot = r && shd ? shkSpot(r, shd) : null;
  if (!shd || !spot) return null;
  // insurance: move a monster out of the way (rloc(RLOC_NOMSG))
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const p = e?.c.pos;
    if (!e?.c.monster || !p || p.level !== level.id || p.x !== spot.x || p.y !== spot.y) continue;
    const to = rlocPos(ctx, level);
    if (to) {
      p.x = to.x;
      p.y = to.y;
    }
  }
  const id = makemon(ctx, ctx.defs.monster(SHOPKEEPER), spot, { level: level.id });
  const shk = id === null ? undefined : ctx.state.entities[String(id)];
  if (id === null || !shk?.c.monster) return null;
  shk.c.monster.peaceful = true;
  shk.c.monster.asleep = false;
  // (set_malign(): the malign is computed when it is needed)
  for (const t of ctx.defs.traps) monLearnsTraps(ctx, id, t.id); // we know all the traps already
  const eshk: Eshk = {
    shoproom: room,
    shoplevel: level.id,
    shoptype: shp.id,
    shk: { ...spot },
    shd: { ...shd },
    robbed: 0,
    credit: 0,
    debit: 0,
    following: false,
    surcharge: false,
    bill: [],
    visitct: 0,
    customer: false,
    shknam: '',
    female: false,
  };
  setEshk(ctx, id, eshk);
  mkmonmoney(ctx, id, 1000 + 30 * ctx.rng.rnd(100)); // initial capital
  // a touchstone for a ring shop's keeper and a scroll of charging for the tool, wand, some ring
  // and general shops' (neither object exists: only the rolls are made)
  if (shp.names === SHK_RINGS) ctx.rng.rn2(2);
  else if (shp.names === SHK_GENERAL) ctx.rng.rn2(5);
  Object.assign(eshk, nameshk(ctx, level, id, shp.names));
  return id;
}

/**
 * Not a square for stock: the row (or column) along the wall of the shop door, and anything
 * but room floor. ref: src/shknam.c stock_room_goodpos() (a regular room)
 */
function stockGoodpos(
  ctx: Pick<Ctx, 'defs'>,
  level: Level,
  r: Level['rooms'][number],
  d: Pos,
  x: number,
  y: number,
): boolean {
  if (
    (x === r.lx && d.x === x - 1) ||
    (x === r.hx && d.x === x + 1) ||
    (y === r.ly && d.y === y - 1) ||
    (y === r.hy && d.y === y + 1)
  )
    return false;
  return isRoomCell(ctx, level, x, y);
}

/**
 * Stocks a new shop: its shopkeeper first (nothing more without one), a doorway or broken door
 * made an open door and a secret door a door, then one object of the shop's kinds on each good
 * square, column by column. ref: src/shknam.c stock_room()
 */
export function stockRoom(ctx: Ctx, level: Level, room: number, shp: ShopType): void {
  const shk = shkinit(ctx, level, room, shp);
  const e = shk === null ? null : eshkOf(ctx, shk);
  const r = level.rooms[room];
  if (!e || !r) return;
  // make sure no doorways without doors, and no secret doors, in shops
  const { x, y } = e.shd;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  const vertical = x === r.lx - 1 || x === r.hx + 1; // a door in a left or right wall
  if (id === T.doorway) setTerrain(level, x, y, vertical ? T.door_open_v : T.door_open_h);
  else if (id === T.sdoor_v || id === T.sdoor_h) setTerrain(level, x, y, T.door_closed);
  else if (id === T.sdoor_locked_v || id === T.sdoor_locked_h)
    setTerrain(level, x, y, T.door_locked);
  for (let sx = r.lx; sx <= r.hx; sx++)
    for (let sy = r.ly; sy <= r.hy; sy++)
      if (stockGoodpos(ctx, level, r, e.shd, sx, sy)) mkshobjAt(ctx, level, shp, sx, sy);
}

/**
 * Stocks the shops of a new level, as fill_special_room() does for each top-level room in
 * order, its subrooms first: a shop room not marked unfilled gets its shopkeeper and stock.
 * ref: src/sp_lev.c fill_special_room() (the shop branch), sp_level_coder() / makelevel()
 */
export function stockShops(ctx: Ctx, level: Level): void {
  const fill = (i: number): void => {
    for (let j = 0; j < level.rooms.length; j++) if (level.rooms[j]?.parent === i) fill(j);
    const r = level.rooms[i];
    const shp = shopType(r?.type);
    if (!r || !shp || r.filled === false) return;
    stockRoom(ctx, level, i, shp);
  };
  for (let i = 0; i < level.rooms.length; i++) if (level.rooms[i]?.parent === undefined) fill(i);
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

/** Stocks the shops of each new level (after the LevelDef contents, as fill_special_room()). */
export function registerShops(api: ModApi): void {
  api.on('newLevel', (ctx, level) => stockShops(ctx, level));
}
