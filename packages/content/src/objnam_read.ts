// Reading an object description typed by the player, the inverse of objnam.ts (wishing).
// ref: src/objnam.c readobjnam() and its helpers, makesingular(), wishymatch(),
// rnd_otyp_by_namedesc(); src/hacklib.c fuzzymatch(), mungspaces()
//
// NetHack's readobjnam() parses and creates the object in one go. Here the parse is pure: it
// returns a WishSpec (plain data), and wish.ts mkWished() makes the object from it, drawing the
// random choices in the same order (the type among the candidates first, then mksobj()).
// The English names come from the message catalog (see wishNames()), as NetHack's come from
// objects[]: the parser reads English, like the original.
import type { DefId, GameState, ObjectClass, Registry } from '@nh/core';
import { nameToMonplus, type MonName } from './mondata';

/** What to make. */
export type WishWhat =
  /** One of these types, picked by oc_prob + `xtra` (rnd_otyp_by_namedesc()). */
  | { kind: 'types'; types: DefId[]; xtra: 0 | 1 }
  /** Exactly this type (`goto typfnd` with a fixed otyp). */
  | { kind: 'type'; type: DefId }
  /** A random object of the class (mkobj(oclass)). */
  | { kind: 'class'; cls: ObjectClass }
  /** A random object of a random wish class (`any:`, wrpsym[rn2(...)]). */
  | { kind: 'random' }
  /** `cnt` gold pieces. */
  | { kind: 'gold' };

/** The parsed wish, in the fields of NetHack's struct _readobjnam_data that the port uses. */
export interface WishSpec {
  what: WishWhat;
  /** d.cnt: the asked-for count (1 when not given, 2 for a plural without a count) */
  cnt: number;
  /** d.spe: the enchantment or charges asked for, without its sign (0..SPE_LIM) */
  spe: number;
  /** d.spesgn: 0 when no enchantment was given */
  spesgn: -1 | 0 | 1;
  /** d.rechrg: "(N:M)" recharge count, 0..7 */
  rechrg: number;
  blessed: boolean;
  uncursed: boolean;
  iscursed: boolean;
  /** rust/burn/crack level (d.eroded), corrosion/rot level (d.eroded2) */
  eroded: number;
  eroded2: number;
  erodeproof: boolean;
  locked: boolean;
  unlocked: boolean;
  broken: boolean;
  /** "lit"/"burning": parsed, not applied (see DEVIATIONS.md) */
  islit: boolean;
  /** The monster of a "<mon> corpse" / "corpse of <mon>" (d.mntmp). */
  mon: DefId | null;
}

/** An object type as the parser sees it: NetHack's oc_name, oc_descr and oc_uname. */
export interface ObjName {
  id: DefId;
  cls: ObjectClass;
  /** oc_prob */
  prob: number;
  /** The actual name without the class word ("healing" for a potion of healing). */
  name: string;
  /** The description (fixed, or this game's appearance) without the class word ("ruby"). */
  descr: string | null;
  /** The name the hero called the type, or null. */
  uname: string | null;
}

/** The names the parser matches against, in registry order. */
export interface WishNames {
  objects: readonly ObjName[];
  monsters: readonly MonName[];
}

/** ref: include/obj.h SPE_LIM */
export const SPE_LIM = 99;

/** ref: src/objnam.c wrp[] / wrpsym[]: the class words, in NetHack's order */
const WRP: readonly (readonly [string, ObjectClass])[] = [
  ['wand', 'wand'],
  ['ring', 'ring'],
  ['potion', 'potion'],
  ['scroll', 'scroll'],
  ['gem', 'gem'],
  ['amulet', 'amulet'],
  ['spellbook', 'spellbook'],
  ['spell book', 'spellbook'],
  ['weapon', 'weapon'],
  ['armor', 'armor'],
  ['tool', 'tool'],
  ['food', 'food'],
  ['comestible', 'food'],
];

/** The classes a random wish (`any:`) picks from. ref: src/objnam.c wrpsym[] */
export const WRPSYM: readonly ObjectClass[] = WRP.map((w) => w[1]);

/** ref: src/objnam.c def_char_to_objclass() via def_oc_syms[] (the classes of the subset) */
const CLASS_SYMS: Readonly<Record<string, ObjectClass>> = {
  ')': 'weapon',
  '[': 'armor',
  '=': 'ring',
  '"': 'amulet',
  '(': 'tool',
  '%': 'food',
  '!': 'potion',
  '?': 'scroll',
  '+': 'spellbook',
  '/': 'wand',
  '*': 'gem',
};

/** Classes whose actual names are "<class> of <name>" in our catalog but just "<name>" in objects[]. */
const OF_CLASSES: readonly ObjectClass[] = ['potion', 'scroll', 'ring', 'wand', 'spellbook'];
/** Classes whose descriptions end with the class word ("ruby potion"); objects[] has "ruby". */
const DESC_SUFFIX: Partial<Record<ObjectClass, string>> = {
  potion: ' potion',
  ring: ' ring',
  wand: ' wand',
  spellbook: ' spellbook',
  amulet: ' amulet',
  gem: ' stone',
};

const lc = (s: string | undefined): string => (s ?? '').toLowerCase();
const dropPrefix = (s: string, p: string): string => (s.startsWith(p) ? s.slice(p.length) : s);
const dropSuffix = (s: string, p: string): string =>
  s.endsWith(p) && s.length > p.length ? s.slice(0, -p.length) : s;

/** The catalog name of an object as objects[] spells it. */
function bareName(cls: ObjectClass, text: string): string {
  let s = text.replace(/\{\w+\}\s*/g, ''); // "{mon} corpse" -> "corpse"
  if (OF_CLASSES.includes(cls)) s = dropPrefix(s, `${cls} of `);
  return dropPrefix(s, 'pair of ');
}

/** The catalog description as objects[] spells it. */
function bareDescr(cls: ObjectClass, text: string): string {
  let s = dropPrefix(text, 'pair of ');
  if (cls === 'scroll') s = dropPrefix(s, 'scroll labeled ');
  const suffix = DESC_SUFFIX[cls];
  return suffix ? dropSuffix(s, suffix) : s;
}

/**
 * The names to match, from a message catalog (`messagesEn`): each object's actual name, its
 * fixed description or this game's appearance, and what the hero called it.
 */
export function wishNames(
  state: Readonly<GameState>,
  defs: Registry,
  cat: Readonly<Record<string, string>>,
): WishNames {
  const md = state.modData['nh'] as unknown as { called?: Record<string, string> } | undefined;
  const objects = defs.objects.map((d): ObjName => {
    const app = state.appearances[d.id];
    const descKey =
      d.descKey ??
      (app !== undefined && defs.isAppearance(app) ? defs.appearance(app).nameKey : null);
    const descText = descKey === null ? undefined : cat[descKey];
    const un = md?.called?.[d.id];
    return {
      id: d.id,
      cls: d.class,
      prob: d.prob,
      name: bareName(d.class, lc(cat[d.nameKey] ?? d.id)),
      descr: descText === undefined ? null : bareDescr(d.class, lc(descText)),
      uname: un !== undefined && un !== '' ? lc(un) : null,
    };
  });
  const monsters = defs.monsters.map((m) => ({ id: m.id, name: lc(cat[m.nameKey] ?? m.id) }));
  return { objects, monsters };
}

/** Whitespace runs become one space, the ends are trimmed. ref: src/hacklib.c mungspaces() */
export function mungspaces(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** Equal when spaces and hyphens are ignored (case-blind). ref: src/hacklib.c fuzzymatch() */
const fuzzymatch = (a: string, b: string): boolean =>
  a.replace(/[ -]/g, '') === b.replace(/[ -]/g, '');

/**
 * ref: src/objnam.c wishymatch(): a fuzzy match, also with "foo of bar" read as "bar foo" when
 * only one side has " of ", and dwarven/dwarvish, elvish/elfin/elven, helmet/helm spellings
 * (the gloves/gauntlets and detect/detection cases have no objects in the subset).
 */
function wishymatch(u: string, o: string, retryInverted: boolean): boolean {
  if (fuzzymatch(u, o)) return true;
  if (retryInverted) {
    const uOf = u.indexOf(' of ');
    const oOf = o.indexOf(' of ');
    if (uOf >= 0 && oOf < 0) {
      if (fuzzymatch(`${u.slice(uOf + 4)} ${u.slice(0, uOf)}`, o)) return true;
    } else if (oOf >= 0 && uOf < 0) {
      if (fuzzymatch(u, `${o.slice(oOf + 4)} ${o.slice(0, oOf)}`)) return true;
    }
  }
  if (o.startsWith('dwarvish ')) {
    if (u.startsWith('dwarven ')) return fuzzymatch(u.slice(8), o.slice(9));
  } else if (o.startsWith('elven ')) {
    if (u.startsWith('elvish ')) return fuzzymatch(u.slice(7), o.slice(6));
    if (u.startsWith('elfin ')) return fuzzymatch(u.slice(6), o.slice(6));
  } else if (o.includes('helm') && u.includes('helmet')) {
    return wishymatch(u.replace('helmet', 'helm'), o, true);
  }
  return false;
}

/**
 * The types whose name, description (or the part after " of " of either) or called name match.
 * ref: src/objnam.c rnd_otyp_by_namedesc() (no bell of opening or globs); the random pick
 * among them, by oc_prob + xtra, is made when the object is created.
 */
function namedesc(
  names: WishNames,
  name: string | null,
  oclass: ObjectClass | null,
  xtra: 0 | 1,
): WishWhat | null {
  if (!name) return null;
  const checkOf = !name.includes(' of ');
  const ofPart = (s: string): string | null => {
    const i = s.indexOf(' of ');
    return i >= 0 ? s.slice(i + 4) : null;
  };
  const types: DefId[] = [];
  let maxprob = 0;
  for (const o of names.objects) {
    if (oclass !== null && o.cls !== oclass) continue;
    const zof = checkOf ? ofPart(o.name) : null;
    const dof = checkOf && o.descr !== null ? ofPart(o.descr) : null;
    if (
      wishymatch(name, o.name, true) ||
      (zof !== null && wishymatch(name, zof, false)) ||
      (o.descr !== null && wishymatch(name, o.descr, false)) ||
      (dof !== null && wishymatch(name, dof, false)) ||
      (o.uname !== null && wishymatch(name, o.uname, false))
    ) {
      types.push(o.id);
      maxprob += o.prob + xtra;
    }
  }
  return types.length > 0 && maxprob > 0 ? { kind: 'types', types, xtra } : null;
}

// ---------------------------------------------------------------------------------------------
// makesingular()

/** ref: src/objnam.c as_is[]: left as they are */
const AS_IS = [
  'boots',
  'shoes',
  'gloves',
  'lenses',
  'scales',
  'eyes',
  'gauntlets',
  'iron bars',
  'bison',
  'deer',
  'elk',
  'fish',
  'fowl',
  'tuna',
  'yaki',
  '-hai',
  'krill',
  'manes',
  'moose',
  'ninja',
  'sheep',
  'ronin',
  'roshi',
  'shito',
  'tengu',
  'ki-rin',
  'nazgul',
  'gunyoki',
  'piranha',
  'samurai',
  'shuriken',
  'haggis',
  'bordeaux',
];
/** ref: src/objnam.c special_subjs[] */
const SPECIAL_SUBJS = [
  'erinys',
  'manes',
  'cyclops',
  'hippocrates',
  'pelias',
  'aklys',
  'amnesia',
  'detect monsters',
  'paralysis',
  'shape changers',
  'nemesis',
];
/** ref: src/objnam.c one_off[] (singular, plural) */
const ONE_OFF: readonly (readonly [string, string])[] = [
  ['child', 'children'],
  ['cubus', 'cubi'],
  ['culus', 'culi'],
  ['cyclops', 'cyclopes'],
  ['djinni', 'djinn'],
  ['erinys', 'erinyes'],
  ['foot', 'feet'],
  ['fungus', 'fungi'],
  ['goose', 'geese'],
  ['knife', 'knives'],
  ['labrum', 'labra'],
  ['louse', 'lice'],
  ['mouse', 'mice'],
  ['mumak', 'mumakil'],
  ['nemesis', 'nemeses'],
  ['ovum', 'ova'],
  ['ox', 'oxen'],
  ['passerby', 'passersby'],
  ['rtex', 'rtices'],
  ['serum', 'sera'],
  ['staff', 'staves'],
  ['tooth', 'teeth'],
];
/** ref: src/objnam.c badman() no_man[]: *men words that have no *man singular */
const NO_MAN = [
  'abdo', 'acu', 'agno', 'ceru', 'cogno', 'cycla', 'fleh', 'grava', 'hegu', 'preno', 'sonar',
  'speci', 'dai', 'exa', 'fla', 'sta', 'teg', 'tegu', 'vela', 'da', 'hy', 'lu', 'no', 'nu', 'ra',
  'ru', 'se', 'vi', 'ya', 'o', 'a',
]; // prettier-ignore
/** ref: src/objnam.c singplur_compound() compounds[] */
const COMPOUNDS = [
  ' of ', ' labeled ', ' called ', ' named ', ' above', ' versus ', ' from ', ' in ', ' on ',
  ' a la ', ' with', ' de ', " d'", ' du ', ' au ', '-in-', '-at-',
]; // prettier-ignore

function badmanSingular(s: string): boolean {
  if (s.length < 4) return false;
  for (const w of NO_MAN) {
    const spot = s.length - (w.length + 3);
    if (spot >= 0 && s.startsWith(w, spot) && (spot === 0 || s[spot - 1] === ' ')) return true;
  }
  return false;
}

/** The singular of a (lower-case) noun phrase. ref: src/objnam.c makesingular() (no pronouns) */
export function makesingular(old: string): string {
  const str = old.replace(/^ +/, '');
  if (str === '') return '';
  let cut = -1;
  for (let i = 0; i < str.length && cut < 0; i++) {
    if (str[i] !== ' ' && str[i] !== '-') continue;
    if (COMPOUNDS.some((c) => str.startsWith(c, i))) cut = i;
  }
  const excess = cut >= 0 ? str.slice(cut) : '';
  const bp = cut >= 0 ? str.slice(0, cut) : str;
  return singularWord(bp) + excess;
}

/** makesingular() for the part before any compound. */
function singularWord(bp: string): string {
  const ends = (s: string): boolean => bp.endsWith(s);
  // ref: singplur_lookup(..., FALSE, special_subjs)
  if (AS_IS.some(ends) || SPECIAL_SUBJS.some(ends)) return bp;
  if (bp.length > 5 && ends('craft')) return bp;
  if (bp === 'slice' || bp === 'mongoose') return bp;
  if (bp.length > 2 && ends('men') && badmanSingular(bp)) return bp;
  for (const [sing, plur] of ONE_OFF) {
    if (ends(sing)) return bp;
    if (ends(plur)) return bp.slice(0, bp.length - plur.length) + sing;
  }
  const n = bp.length;
  const wordStart = (k: number): boolean => n - k === 0 || bp[n - k - 1] === ' ';
  if (ends('s')) {
    if (ends('es')) {
      if (ends('ies')) {
        if (
          ends('cookies') ||
          (ends('pies') && wordStart(4)) ||
          (ends('genies') && wordStart(6)) ||
          ends('mbies') ||
          ends('yries')
        )
          return bp.slice(0, -1);
        return bp.slice(0, -3) + 'y';
      }
      // wolves, but f to ves isn't fully reversible
      const c4 = bp[n - 4] ?? '';
      if (n >= 4 && 'lraeiou'.includes(c4) && c4 !== '' && ends('ves')) {
        if (ends('cloves') || ends('nerves')) return bp.slice(0, -1);
        return bp.slice(0, -3) + 'f';
      }
      if (
        [
          'eses',
          'oxes',
          'nxes',
          'ches',
          'uses',
          'shes',
          'sses',
          'atoes',
          'dingoes',
          'aleaxes',
        ].some(ends)
      )
        return bp.slice(0, -2);
    } else if (ends('us')) {
      if (!ends('tengus') && !ends('hezrous')) return bp;
    } else if (ends('ss') || ends(' lens') || bp === 'lens') {
      return bp;
    }
    return bp.slice(0, -1);
  }
  if (ends('men') && !badmanSingular(bp)) return bp.slice(0, -2) + 'an';
  if (ends('matzot') || ends('ae') || ends('eaux')) return bp.slice(0, -1);
  if (n >= 4 && ends('ia') && 'lr'.includes(bp[n - 3] ?? '_') && bp[n - 4] === 'e')
    return bp.slice(0, -1) + 'um';
  return bp;
}

// ---------------------------------------------------------------------------------------------
// readobjnam()

/** C's atoi(): an optional sign and digits, else 0 */
const atoi = (s: string): number => {
  const m = /^[+-]?\d+/.exec(s);
  return m ? Number.parseInt(m[0], 10) : 0;
};
const skipDigits = (s: string): string => s.replace(/^\d+/, '');

/** Erodeproof words. ref: readobjnam_preparse() */
const PROOF = ['rustproof', 'erodeproof', 'corrodeproof', 'fixed', 'fireproof', 'rotproof', 'tempered', 'crackproof']; // prettier-ignore
/** Words recognized and skipped because the subset has nothing they apply to. */
const IGNORED = [
  'unlit', 'extinguished', 'moist', 'wet', 'poisoned', 'trapped', 'untrapped', 'open', 'closed',
  'doorless', 'looted', 'disturbed', 'greased', 'zombifying', 'historic', 'diluted', 'empty',
  'medium', 'real', 'fake',
]; // prettier-ignore

/** Class-word false hits. ref: readobjnam_postparse1() */
const NOT_CLASS = ['enchant ', 'destroy ', 'detect food', 'food detection', 'ring mail', 'studded leather armor', 'leather armor', 'tooled horn', 'food ration', 'meat ring']; // prettier-ignore
/** Monster-name false hits. ref: readobjnam_postparse1() */
const NOT_MONSTER = ['samurai sword', 'wizard lock', 'death wand', 'master key', 'ninja-to', 'magenta']; // prettier-ignore

/**
 * Parses an object description ("2 blessed +3 daggers", "cursed ring of teleportation",
 * "ruby potion", "!"), as typed and lower- or upper-case. Returns the spec, 'nothing' for an
 * explicit "nothing"/"nil"/"none", or null when nothing fitting exists. An empty string is a
 * random object, as in NetHack.
 * ref: src/objnam.c readobjnam(), readobjnam_preparse(), readobjnam_parse_charges(),
 * readobjnam_postparse1/2/3(). Not ported: artifacts, fruit, tins, globs, statues and
 * figurines, eggs, glass gems, o_ranges ("helmet called x"), the alternate spellings table,
 * Japanese names, wizard-mode terrain and traps; see DEVIATIONS.md.
 */
export function readobjnam(input: string, names: WishNames): WishSpec | 'nothing' | null {
  const spec: WishSpec = {
    what: { kind: 'random' },
    cnt: 0,
    spe: 0,
    spesgn: 0,
    rechrg: 0,
    blessed: false,
    uncursed: false,
    iscursed: false,
    eroded: 0,
    eroded2: 0,
    erodeproof: false,
    locked: false,
    unlocked: false,
    broken: false,
    islit: false,
    mon: null,
  };
  let bp = mungspaces(input).toLowerCase();
  if (bp === 'nothing' || bp === 'nil' || bp === 'none') return 'nothing';
  if (bp === '') return spec; // readobjnam_preparse() returns 1: goto any

  // ---- readobjnam_preparse(): count, BUC, enchantment and the other prefixes ----
  let unlabeled = false;
  let saveBp: string | null = null; // "corpse of [a ]": parse the prefixes after it, then back up
  let very = 0;
  for (;;) {
    if (bp === '') break;
    let l = 0;
    const word = (w: string): boolean => {
      if (!bp.startsWith(w + ' ')) return false;
      l = w.length + 1;
      return true;
    };
    if (word('an') || word('a')) spec.cnt = 1;
    else if (word('the')) {
      /* skipped */
    } else if (!spec.cnt && /^\d/.test(bp) && bp !== '0') {
      spec.cnt = atoi(bp);
      bp = skipDigits(bp).replace(/^ +/, '');
      continue;
    } else if (bp[0] === '+' || bp[0] === '-') {
      spec.spesgn = bp[0] === '+' ? 1 : -1;
      bp = bp.slice(1);
      spec.spe = atoi(bp);
      bp = skipDigits(bp).replace(/^ +/, '');
      continue;
    } else if (word('blessed') || word('holy')) {
      spec.blessed = true;
      spec.uncursed = spec.iscursed = false;
    } else if (word('cursed') || word('unholy')) {
      spec.iscursed = true;
      spec.blessed = spec.uncursed = false;
    } else if (word('uncursed')) {
      spec.uncursed = true;
      spec.blessed = spec.iscursed = false;
    } else if (PROOF.some(word)) {
      spec.erodeproof = true;
    } else if (word('lit') || word('burning')) {
      spec.islit = true;
    } else if (word('unlabeled') || word('unlabelled') || word('blank')) {
      unlabeled = true;
    } else if (word('locked')) {
      spec.locked = true;
      spec.unlocked = spec.broken = false;
    } else if (word('unlocked')) {
      spec.unlocked = true;
      spec.locked = spec.broken = false;
    } else if (word('broken')) {
      spec.broken = true;
      spec.locked = spec.unlocked = false;
    } else if (word('very')) {
      very = 1;
    } else if (word('thoroughly')) {
      very = 2;
    } else if (
      word('rusty') ||
      word('rusted') ||
      word('burnt') ||
      word('burned') ||
      word('cracked')
    ) {
      spec.eroded = 1 + very;
      very = 0;
    } else if (word('corroded') || word('rotted')) {
      spec.eroded2 = 1 + very;
      very = 0;
    } else if (bp.startsWith('partly eaten ') || bp.startsWith('partially eaten ')) {
      l = bp.startsWith('partly') ? 13 : 16; // parsed; partly eaten food is not made
    } else if (word('female') || word('male') || word('neuter')) {
      // the gender is not ported; after "corpse of" it is removed from the string
      if (saveBp !== null) {
        bp = bp.slice(l);
        l = 0;
      }
    } else if (IGNORED.some(word)) {
      /* recognized; nothing in the subset uses it */
    } else if (/^(corpse|statue|figurine) of /.test(bp)) {
      saveBp = bp;
      l = bp.indexOf(' of ') + 4;
      const rest = bp.slice(l);
      l += rest.startsWith('a ') ? 2 : rest.startsWith('an ') ? 3 : rest.startsWith('the ') ? 4 : 0;
    } else break;
    bp = bp.slice(l);
  }
  if (saveBp !== null) {
    // back up to "corpse of", keeping what was removed after it (the gender words)
    const head = saveBp.slice(0, saveBp.indexOf(' of ') + 4);
    const art = /^(a|an|the) /.exec(saveBp.slice(head.length))?.[0] ?? '';
    bp = head + art + bp;
  }
  if (!spec.cnt) spec.cnt = 1; // changed to 2 if makesingular() changes the string

  // ---- readobjnam_parse_charges(): "(N)" or "(N:M)" ----
  const paren = bp.lastIndexOf('(');
  if (bp.length > 1 && paren >= 0) {
    const head = bp.slice(0, paren > 0 && bp[paren - 1] === ' ' ? paren - 1 : paren);
    let p = bp.slice(paren + 1);
    let keep = true;
    if (p.startsWith('lit)')) {
      spec.islit = true;
      p = p.slice(4);
    } else {
      spec.spe = atoi(p);
      p = skipDigits(p);
      if (p[0] === ':') {
        p = p.slice(1);
        spec.rechrg = spec.spe;
        spec.spe = atoi(p);
        p = skipDigits(p);
      }
      if (p[0] !== ')') {
        spec.spe = spec.rechrg = 0;
        keep = false;
      } else {
        spec.spesgn = 1;
        p = p.slice(1);
      }
    }
    bp = keep ? head + p : head;
  }
  if (spec.spe < 0) {
    spec.spesgn = -1; // cheaters get what they deserve
    spec.spe = Math.abs(spec.spe);
  }
  if (spec.spe > SPE_LIM) spec.spe = SPE_LIM;
  if (spec.rechrg < 0 || spec.rechrg > 7) spec.rechrg = 7;

  const typfnd = (what: WishWhat): WishSpec => ({ ...spec, what });
  const fixed = (id: string): WishSpec | null =>
    names.objects.some((o) => o.id === id) ? typfnd({ kind: 'type', type: id as DefId }) : null;

  // ---- readobjnam_postparse1() ----
  let oclass: ObjectClass | null = null;
  let actualn: string | null = null;
  let dn: string | null = null;
  let un: string | null = null;
  let i = bp.indexOf(' named ');
  if (i >= 0) bp = bp.slice(0, i); // object names are not ported
  i = bp.indexOf(' called ');
  if (i >= 0) {
    un = bp.slice(i + 8);
    bp = bp.slice(0, i);
  }
  i = bp.indexOf(' labeled ');
  const il = bp.indexOf(' labelled ');
  if (i >= 0) {
    dn = bp.slice(i + 9);
    bp = bp.slice(0, i);
  } else if (il >= 0) {
    dn = bp.slice(il + 10);
    bp = bp.slice(0, il);
  }
  // "Amulet of Yendor": only the imitation exists, so it is what "real" or not gives
  i = bp.indexOf('amulet of yendor');
  if (i >= 0 && (i === 0 || bp[i - 1] === ' ')) return fixed('nh:fake_amulet_of_yendor');

  if (bp.startsWith('pair of ')) {
    bp = bp.slice(8);
    spec.cnt *= 2;
  } else if (bp.startsWith('pairs of ')) {
    bp = bp.slice(9);
    if (spec.cnt > 1) spec.cnt *= 2;
  } else if (bp.startsWith('set of ')) bp = bp.slice(7);
  else if (bp.startsWith('sets of ')) bp = bp.slice(8);

  // the corpse type after "of" (corpse of a newt), not for wands, spellbooks and the like
  if (!['wand ', 'spellbook ', 'gauntlets ', 'gloves ', 'finger '].some((w) => bp.includes(w))) {
    i = bp.indexOf(' of ');
    if (i >= 0) {
      const m = nameToMonplus(names.monsters, bp.slice(i + 4));
      if (m) {
        spec.mon = m.mon;
        bp = bp.slice(0, i);
      }
    }
  }
  // the corpse type without "of" (newt corpse)
  if (!NOT_MONSTER.some((w) => bp.startsWith(w)) && spec.mon === null && bp.length > 2) {
    const m = nameToMonplus(names.monsters, bp);
    if (m) {
      const obp = bp;
      spec.mon = m.mon;
      bp = m.rest;
      if (bp.startsWith(' ')) bp = bp.slice(1);
      else if (bp.startsWith('s ') || bp.startsWith("' ")) bp = bp.slice(2);
      else if (bp.startsWith('es ') || bp.startsWith("'s ")) bp = bp.slice(3);
      else if (bp === '' && actualn === null && dn === null && un === null && oclass === null) {
        bp = obp; // no referent: they don't really mean a monster type
        spec.mon = null;
      }
    }
  }

  // first change to singular if necessary
  if (bp !== '' && bp !== 'tricks' && bp !== 'clothes') {
    const sng = makesingular(bp);
    if (sng !== bp) {
      if (spec.cnt === 1) spec.cnt = 2;
      bp = sng;
    }
  }
  const origbp = bp;
  // alternate spellings (only the ones that are not in the spellings[] table)
  if (bp.startsWith('grey spell')) bp = 'gray spell' + bp.slice(10);
  bp = bp.replace('armour', 'armor');

  if (bp.endsWith('holy water')) {
    if (bp.slice(0, -10).endsWith('un')) {
      spec.iscursed = true;
      spec.blessed = spec.uncursed = false;
    } else {
      spec.blessed = true;
      spec.iscursed = spec.uncursed = false;
    }
    return fixed('nh:potion_of_water');
  }
  if (unlabeled && bp.endsWith('scroll')) return fixed('nh:scroll_of_blank_paper');
  if (unlabeled && bp.endsWith('spellbook')) return fixed('nh:spellbook_of_blank_paper');

  if (
    bp.endsWith('gold piece') ||
    bp.endsWith('zorkmid') ||
    bp === 'gold' ||
    bp === 'money' ||
    bp === 'coin' ||
    bp[0] === '$'
  )
    return typfnd({ kind: 'gold' });

  // a single class symbol ("/" for a wand)
  const sym = bp.length === 1 ? CLASS_SYMS[bp] : undefined;
  if (sym !== undefined) return typfnd({ kind: 'class', cls: sym });

  // class names: "<class> [of] something", "something <class>"
  let srch = false;
  if (!NOT_CLASS.some((w) => bp.startsWith(w))) {
    for (const [w, cls] of WRP) {
      if (bp.startsWith(w)) {
        oclass = cls;
        if (cls !== 'amulet') {
          bp = bp.slice(w.length);
          if (bp.startsWith(' of ')) actualn = bp.slice(4);
        } else actualn = bp;
        srch = true;
        break;
      }
      if (bp.endsWith(w) && bp.length >= w.length) {
        oclass = cls;
        if (cls !== 'amulet') {
          bp = bp.slice(0, bp.length - w.length).replace(/ $/, '');
        } else {
          if (bp.startsWith('versus poison ')) return fixed('nh:amulet_versus_poison');
          // "<shape> amulet"
          const amubuf = bp.slice(0, bp.length - w.length).replace(/ $/, '');
          const k = namedesc(names, amubuf, 'amulet', 0);
          if (k) return typfnd(k);
        }
        actualn = dn = bp;
        srch = true;
        break;
      }
    }
  }

  // ---- readobjnam_postparse2() and postparse3(), with the "armor" + " mail" retry ----
  for (let retry = 0; ; retry++) {
    if (!srch) {
      if (bp.endsWith(' stone') || bp.endsWith(' gem')) {
        bp = bp.slice(0, bp.endsWith(' gem') ? -4 : -6);
        oclass = 'gem';
        dn = actualn = bp;
      } else {
        actualn = bp;
        dn ??= actualn;
      }
    }
    srch = false;
    const found =
      namedesc(names, actualn, oclass, 1) ??
      (dn !== actualn ? namedesc(names, dn, oclass, 1) : null) ??
      namedesc(names, un, oclass, 1) ??
      (origbp !== actualn ? namedesc(names, origbp, oclass, 1) : null);
    if (found) return typfnd(found);
    // "plate armor" -> "plate mail"
    if (oclass === 'armor' && !bp.includes('mail') && retry === 0) {
      bp += ' mail';
      continue;
    }
    break;
  }
  if (oclass === null) return null;
  return typfnd({ kind: 'class', cls: oclass }); // goto any
}
