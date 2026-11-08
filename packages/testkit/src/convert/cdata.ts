/**
 * Reads NetHack's monster and object tables (include/monsters.h, include/objects.h) into plain
 * records that keep the C names (`AT_BITE`, `M1_FLY`, `IRON`, `CLR_RED`) and evaluated numbers.
 * Pure: the caller passes the header texts (see `VendorHeaders`).
 */
import {
  Preprocessor,
  callArgs,
  evalExpr,
  flagNames,
  numericSymbols,
  render,
  stringValue,
  type Token,
} from './cpp.ts';

/** The vendor header texts the converter reads, keyed by file name under include/. */
export interface VendorHeaders {
  'monsters.h': string;
  'objects.h': string;
  'defsym.h': string;
  'color.h': string;
  'weight.h': string;
  'objclass.h': string;
  'skills.h': string;
  'align.h': string;
}

/** The header files `VendorHeaders` needs, relative to vendor/nethack/include. */
export const VENDOR_HEADER_FILES: readonly (keyof VendorHeaders)[] = [
  'monsters.h',
  'objects.h',
  'defsym.h',
  'color.h',
  'weight.h',
  'objclass.h',
  'skills.h',
  'align.h',
];

export interface CAttack {
  /** AT_* name */
  at: string;
  /** AD_* name */
  ad: string;
  n: number;
  d: number;
}

/** One MON(...) row of monsters.h. */
export interface CMonster {
  /** The PM_ enum suffix, e.g. 'GIANT_ANT'. */
  enumName: string;
  /** The single name, or for NAMS() the male/female/neutral names. */
  name: string;
  names: { male: string; female: string; neutral: string } | null;
  /** S_* class symbol and its default character. */
  symbol: string;
  ch: string;
  level: number;
  speed: number;
  ac: number;
  mr: number;
  alignment: number;
  /** G_* flags without the frequency. */
  gen: string[];
  frequency: number;
  attacks: CAttack[];
  weight: number;
  nutrition: number;
  /** MS_* name */
  sound: string;
  /** MZ_* name, MZ_HUMAN resolved to MZ_MEDIUM. */
  size: string;
  /** MR_* names */
  resists: string[];
  conveys: string[];
  m1: string[];
  m2: string[];
  m3: string[];
  difficulty: number;
  /** CLR_* name with HI_* aliases resolved. */
  color: string;
  /** The MON(...) call as written in monsters.h. */
  source: string;
}

/** One OBJECT(...) row of objects.h, after expanding WEAPON(), HELM(), RING(), ... */
export interface CObject {
  /** The objects[] index (0 = strange object, 1..17 generic placeholders). */
  index: number;
  /** The enum name, e.g. 'DAGGER', 'RIN_ADORNMENT'. */
  enumName: string;
  /** oc_name as in objects.h ("adornment" for a ring). */
  name: string | null;
  /** oc_descr: the unidentified description, or null. */
  desc: string | null;
  /** *_CLASS name */
  cls: string;
  /** Class character from defsym.h. */
  ch: string;
  nameKnown: boolean;
  merge: boolean;
  /** oc_uses_known */
  usesKnown: boolean;
  container: boolean;
  magic: boolean;
  charged: boolean;
  unique: boolean;
  nowish: boolean;
  /** oc_big: bimanual weapon or bulky shield */
  big: boolean;
  tough: boolean;
  /** oc_dir as written: PIERCE/SLASH/WHACK names for weapons, NODIR/IMMEDIATE/RAY for wands. */
  dir: string[];
  /** oc_skill as written (P_DAGGER, -P_BOW) or ARM_* for armor. */
  sub: string;
  /** Material name (IRON, WOOD, ...); PAPER inside SPELL() rows that redefine it is LEATHER. */
  material: string;
  /** oc_oprop name, or null for 0. */
  prop: string | null;
  prob: number;
  delay: number;
  weight: number;
  cost: number;
  sdam: number;
  ldam: number;
  /** oc_oc1: weapon hit bonus, armor AC bonus (10 - ac). */
  oc1: number;
  /** oc_oc2: armor MC, spellbook level. */
  oc2: number;
  nutrition: number;
  color: string;
  /** The top-level call as written in objects.h, e.g. `WEAPON("dagger", NoDes, ...)`. */
  source: string;
}

const KEEP_MON = ['MON', 'NAM', 'NAMS', 'LVL', 'A', 'ATTK', 'SIZ', 'NO_ATTK'];
const KEEP_OBJ = ['OBJECT', 'OBJ', 'BITS', 'MARKER'];

function need<T>(v: T | null | undefined, what: string): T {
  if (v === null || v === undefined) throw new Error(`convert: expected ${what}`);
  return v;
}

function ident(toks: readonly Token[]): string {
  const ids = flagNames(toks);
  return ids.length === 0 ? '0' : render(toks).replace(/\s+/g, '');
}

/** HI_* and other colour aliases from color.h, resolved to CLR_* names. */
function colorAliases(colorH: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of colorH.matchAll(/^\s*#\s*define\s+(\w+)\s+(CLR_\w+)/gm)) out[m[1]!] = m[2]!;
  return out;
}

function resolveColor(name: string, aliases: Readonly<Record<string, string>>): string {
  return aliases[name] ?? name;
}

/** S_* monster class symbol -> default character (defsym.h MONSYM). */
function monsterSymbols(defsym: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of defsym.matchAll(/MONSYM\(\s*\d+,\s*'(\\.|[^'])',\s*\w+,\s*(S_\w+)/g))
    out[m[2]!] = m[1]!.replace(/^\\/, '');
  return out;
}

/** *_CLASS -> default character (defsym.h OBJCLASS, OBJCLASS2). */
function objectClassChars(defsym: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of defsym.matchAll(/OBJCLASS2?\(\s*\d+,\s*'(\\.|[^'])',\s*(\w+),/g))
    out[`${m[2]!}_CLASS`] = m[1]!.replace(/^\\/, '');
  return out;
}

export function parseMonsters(h: VendorHeaders): CMonster[] {
  const syms = { ...numericSymbols(h['weight.h']), ...numericSymbols(h['align.h']) };
  const num = (t: readonly Token[]): number => evalExpr(t, syms);
  const aliases = colorAliases(h['color.h']);
  const chars = monsterSymbols(h['defsym.h']);
  const out: CMonster[] = [];
  for (const call of new Preprocessor(KEEP_MON).run(h['monsters.h'])) {
    const a = callArgs(call.tokens, 'MON');
    if (!a) continue;
    if (a.length !== 14) throw new Error(`convert: MON with ${a.length} args: ${call.source}`);
    const [nam, sym, lvl, gen, atk, siz, mr1, mr2, f1, f2, f3, diff, col, bn] = a as Token[][] & {
      length: 14;
    };
    const single = callArgs(nam!, 'NAM');
    const triple = callArgs(nam!, 'NAMS');
    const names = triple
      ? {
          male: need(stringValue(triple[0]!), 'male name'),
          female: need(stringValue(triple[1]!), 'female name'),
          neutral: need(stringValue(triple[2]!), 'neutral name'),
        }
      : null;
    const name = single ? need(stringValue(single[0]!), 'name') : need(names, 'NAMS').neutral;
    const l = need(callArgs(lvl!, 'LVL'), 'LVL()').map(num);
    const genIds = flagNames(gen!);
    const genNum = gen!.filter((t) => t.kind === 'num').map((t) => Number.parseInt(t.text));
    const attacks: CAttack[] = [];
    for (const at of need(callArgs(atk!, 'A'), 'A()')) {
      const x = callArgs(at, 'ATTK');
      if (!x) continue; // NO_ATTK
      attacks.push({ at: ident(x[0]!), ad: ident(x[1]!), n: num(x[2]!), d: num(x[3]!) });
    }
    const s = need(callArgs(siz!, 'SIZ'), 'SIZ()');
    const symbol = ident(sym!);
    const size = ident(s[3]!);
    out.push({
      enumName: ident(bn!),
      name,
      names,
      symbol,
      ch: need(chars[symbol], `symbol ${symbol}`),
      level: l[0]!,
      speed: l[1]!,
      ac: l[2]!,
      mr: l[3]!,
      alignment: l[4]!,
      gen: genIds,
      frequency: genNum.reduce((x, y) => x | y, 0),
      attacks,
      weight: num(s[0]!),
      nutrition: num(s[1]!),
      sound: ident(s[2]!),
      size: size === 'MZ_HUMAN' ? 'MZ_MEDIUM' : size,
      resists: flagNames(mr1!),
      conveys: flagNames(mr2!),
      m1: flagNames(f1!),
      m2: flagNames(f2!),
      m3: flagNames(f3!),
      difficulty: num(diff!),
      color: resolveColor(ident(col!), aliases),
      source: call.source,
    });
  }
  return out;
}

export function parseObjects(h: VendorHeaders): CObject[] {
  const syms = { ...numericSymbols(h['objclass.h']), ...numericSymbols(h['skills.h']) };
  const num = (t: readonly Token[]): number => evalExpr(t, syms);
  const bool = (t: readonly Token[]): boolean => num(t) !== 0;
  const aliases = colorAliases(h['color.h']);
  const chars = objectClassChars(h['defsym.h']);
  const out: CObject[] = [];
  for (const call of new Preprocessor(KEEP_OBJ).run(h['objects.h'])) {
    // One top-level call may hold several OBJECT()s (none in practice, but scan anyway).
    const toks = call.tokens;
    for (let i = 0; i < toks.length; i++) {
      if (toks[i]!.text !== 'OBJECT' || toks[i + 1]?.text !== '(') continue;
      let depth = 0;
      let end = i + 1;
      for (; end < toks.length; end++) {
        if (toks[end]!.text === '(') depth++;
        else if (toks[end]!.text === ')' && --depth === 0) break;
      }
      const a = need(callArgs(toks.slice(i, end + 1), 'OBJECT'), 'OBJECT()');
      i = end;
      if (a.length !== 15) throw new Error(`convert: OBJECT with ${a.length} args: ${call.source}`);
      const [obj, bits, prp, sym, prob, dly, wt, cost, sdam, ldam, oc1, oc2, nut, color, sn] =
        a as Token[][] & { length: 15 };
      const o = need(callArgs(obj!, 'OBJ'), 'OBJ()');
      const b = need(callArgs(bits!, 'BITS'), 'BITS()');
      if (b.length !== 13) throw new Error(`convert: BITS with ${b.length} args: ${call.source}`);
      const cls = ident(sym!);
      const propName = ident(prp!);
      out.push({
        index: out.length,
        enumName: ident(sn!),
        name: stringValue(o[0]!),
        desc: stringValue(o[1]!),
        cls,
        ch: chars[cls] ?? '?',
        nameKnown: bool(b[0]!),
        merge: bool(b[1]!),
        usesKnown: bool(b[2]!),
        container: bool(b[3]!),
        magic: bool(b[4]!),
        charged: bool(b[5]!),
        unique: bool(b[6]!),
        nowish: bool(b[7]!),
        big: bool(b[8]!),
        tough: bool(b[9]!),
        dir: flagNames(b[10]!),
        sub: ident(b[11]!),
        material: ident(b[12]!),
        prop: propName === '0' ? null : propName,
        prob: num(prob!),
        delay: num(dly!),
        weight: num(wt!),
        cost: num(cost!),
        sdam: num(sdam!),
        ldam: num(ldam!),
        oc1: num(oc1!),
        oc2: num(oc2!),
        nutrition: num(nut!),
        color: resolveColor(ident(color!), aliases),
        source: call.source,
      });
    }
  }
  return out;
}

/**
 * Whether an object's description is shuffled per game (so content gives it no fixed descKey).
 * ref: src/o_init.c obj_shuffle_range()
 */
export function isShuffled(objs: readonly CObject[], o: CObject): boolean {
  const at = (e: string): number => objs.findIndex((x) => x.enumName === e);
  const within = (lo: string, hi: string): boolean => o.index >= at(lo) && o.index <= at(hi);
  const first = objs.findIndex((x) => x.cls === o.cls && x.index >= 18);
  switch (o.cls) {
    case 'ARMOR_CLASS':
      return (
        within('HELMET', 'HELM_OF_TELEPATHY') ||
        within('LEATHER_GLOVES', 'GAUNTLETS_OF_DEXTERITY') ||
        within('CLOAK_OF_PROTECTION', 'CLOAK_OF_DISPLACEMENT') ||
        within('SPEED_BOOTS', 'LEVITATION_BOOTS')
      );
    case 'POTION_CLASS':
      return o.index < at('POT_WATER');
    case 'AMULET_CLASS':
    case 'SCROLL_CLASS':
    case 'SPBOOK_CLASS': {
      let i = first;
      while (objs[i]?.cls === o.cls && !objs[i]!.unique && objs[i]!.magic) i++;
      return o.index < i;
    }
    case 'RING_CLASS':
    case 'WAND_CLASS':
    case 'VENOM_CLASS':
      return true;
    default:
      return false;
  }
}
