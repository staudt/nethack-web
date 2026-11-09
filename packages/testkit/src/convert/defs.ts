/**
 * Maps the C records of cdata.ts onto the shape of content's `MonsterDef` and `ObjectDef`,
 * with the vanilla id convention (`nh:` + the name in snake case). Colours stay C names
 * (`CLR_RED`): content files resolve them to their own palette constants. Functions (`brain`
 * behaviour, `use`, `zap`) and content-only extras (container capacity) are not in the C tables.
 */
import type { ArmorSlot, AttackType, ObjectClass, WandDir } from '@nh/core';
import { isShuffled, type CMonster, type CObject } from './cdata.ts';

/** snake_case of a C name: "Uruk-hai shield" -> "uruk_hai_shield". */
export function slug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/** The English name content shows: the single name, or the male one of a NAMS() row. */
export function monsterName(m: CMonster): string {
  return m.names?.male ?? m.name;
}

/**
 * Vanilla monster ids: `nh:` + the snake-cased name (the male one for NAMS() rows, matching
 * 'nh:kobold_lord'); when two rows share that name (werejackal and its human form, the two
 * "priest"s) each uses its PM_ enum name instead ('nh:human_werejackal', 'nh:aligned_cleric').
 */
export function monsterIds(all: readonly CMonster[]): Map<CMonster, string> {
  const count: Record<string, number> = {};
  for (const m of all) count[slug(monsterName(m))] = (count[slug(monsterName(m))] ?? 0) + 1;
  const out = new Map<CMonster, string>();
  for (const m of all) {
    const s = slug(monsterName(m));
    out.set(m, `nh:${count[s] === 1 ? s : slug(m.enumName)}`);
  }
  return out;
}

const CLASS_PREFIX: Readonly<Record<string, string>> = {
  RING_CLASS: 'ring of ',
  WAND_CLASS: 'wand of ',
  POTION_CLASS: 'potion of ',
  SCROLL_CLASS: 'scroll of ',
  SPBOOK_CLASS: 'spellbook of ',
};

/**
 * The identified name as xname() builds it: "ring of adornment", "potion of water"; boots and
 * gloves are "pair of ...". ref: src/objnam.c xname()
 */
export function objectName(o: CObject): string {
  const base = `${CLASS_PREFIX[o.cls] ?? ''}${o.name ?? ''}`;
  return o.sub === 'ARM_BOOTS' || o.sub === 'ARM_GLOVES' ? `pair of ${base}` : base;
}

/** Vanilla object ids: `nh:` + the snake-cased class-prefixed name ('nh:ring_of_adornment'). */
export function objectId(o: CObject): string {
  return `nh:${slug(`${CLASS_PREFIX[o.cls] ?? ''}${o.name ?? ''}`)}`;
}

const AT: Readonly<Record<string, AttackType>> = {
  AT_NONE: 'passive',
  AT_CLAW: 'claw',
  AT_BITE: 'bite',
  AT_KICK: 'kick',
  AT_BUTT: 'butt',
  AT_TUCH: 'touch',
  AT_STNG: 'sting',
  AT_HUGS: 'hug',
  AT_SPIT: 'spit',
  AT_ENGL: 'engulf',
  AT_BREA: 'breath',
  AT_EXPL: 'explode',
  AT_BOOM: 'boom',
  AT_GAZE: 'gaze',
  AT_TENT: 'tentacle',
  AT_WEAP: 'weapon',
  AT_MAGC: 'magic',
};

const SIZE: Readonly<Record<string, MonsterData['size']>> = {
  MZ_TINY: 'tiny',
  MZ_SMALL: 'small',
  MZ_MEDIUM: 'medium',
  MZ_LARGE: 'large',
  MZ_HUGE: 'huge',
  MZ_GIGANTIC: 'gigantic',
};

const lower = (name: string, prefix: RegExp): string => name.replace(prefix, '').toLowerCase();

/** A MonsterDef's data fields, from C; `color` is the CLR_ name, `brain` is always 'nh:melee'. */
export interface MonsterData {
  id: string;
  nameKey: string;
  name: string;
  glyph: { ch: string; color: string };
  level: number;
  speed: number;
  ac: number;
  mr: number;
  alignment: number;
  attacks: { at: AttackType; ad: string; n: number; d: number }[];
  size: 'tiny' | 'small' | 'medium' | 'large' | 'huge' | 'gigantic';
  flags: string[];
  frequency: number;
  group: 'small' | 'large' | null;
  genFlags: string[];
  difficulty: number;
  weight: number;
  nutrition: number;
  resists: string[];
  conveys: string[];
  brain: string;
  /** MS_ name lowercased (MS_SQEEK is 'squeak'); may be outside core's MonsterSound union. */
  sound: string;
}

export function monsterData(m: CMonster, id: string): MonsterData {
  return {
    id,
    nameKey: id,
    name: monsterName(m),
    glyph: { ch: m.ch, color: m.color },
    level: m.level,
    speed: m.speed,
    ac: m.ac,
    mr: m.mr,
    alignment: m.alignment,
    attacks: m.attacks.map((a) => {
      const at = AT[a.at];
      if (at === undefined) throw new Error(`convert: unknown attack type ${a.at}`);
      return { at, ad: lower(a.ad, /^AD_/), n: a.n, d: a.d };
    }),
    size: SIZE[m.size] ?? 'medium',
    flags: [...m.m1, ...m.m2, ...m.m3].map((f) => lower(f, /^M[123]_/)),
    frequency: m.frequency,
    group: m.gen.includes('G_SGROUP') ? 'small' : m.gen.includes('G_LGROUP') ? 'large' : null,
    genFlags: m.gen.filter((g) => g !== 'G_SGROUP' && g !== 'G_LGROUP').map((g) => lower(g, /^G_/)),
    difficulty: m.difficulty,
    weight: m.weight,
    nutrition: m.nutrition,
    resists: m.resists.map((r) => lower(r, /^MR_/)),
    conveys: m.conveys.map((r) => lower(r, /^MR_/)),
    brain: 'nh:melee',
    // the long worm tail's row writes a literal 0 (MS_SILENT)
    sound: m.sound === 'MS_SQEEK' ? 'squeak' : m.sound === '0' ? 'silent' : lower(m.sound, /^MS_/),
  };
}

const OBJ_CLASS: Readonly<Record<string, ObjectClass>> = {
  WEAPON_CLASS: 'weapon',
  ARMOR_CLASS: 'armor',
  RING_CLASS: 'ring',
  AMULET_CLASS: 'amulet',
  TOOL_CLASS: 'tool',
  FOOD_CLASS: 'food',
  POTION_CLASS: 'potion',
  SCROLL_CLASS: 'scroll',
  SPBOOK_CLASS: 'spellbook',
  WAND_CLASS: 'wand',
  COIN_CLASS: 'coin',
  GEM_CLASS: 'gem',
  ROCK_CLASS: 'rock',
  VENOM_CLASS: 'venom',
};

const ARM_SLOT: Readonly<Record<string, ArmorSlot>> = {
  ARM_SUIT: 'body',
  ARM_SHIELD: 'shield',
  ARM_HELM: 'helm',
  ARM_GLOVES: 'gloves',
  ARM_BOOTS: 'boots',
  ARM_CLOAK: 'cloak',
  ARM_SHIRT: 'shirt',
};

const WAND_DIR: Readonly<Record<string, WandDir>> = {
  NODIR: 'nodir',
  IMMEDIATE: 'immediate',
  RAY: 'ray',
};

/** An ObjectDef's data fields, from C; `color` is the CLR_ name. */
export interface ObjectData {
  id: string;
  nameKey: string;
  /** Present when the description is fixed (not shuffled per game): `<id>.desc`. */
  descKey?: string;
  name: string;
  desc: string | null;
  /** null for classes content has no ObjectClass for (balls, chains, venom). */
  class: ObjectClass | null;
  glyph: { ch: string; color: string };
  prob: number;
  weight: number;
  cost: number;
  material: string;
  merge: boolean;
  magic: boolean;
  delay: number;
  weapon?: {
    small: [number, number];
    large: [number, number];
    hitBonus: number;
    skill: string;
    bimanual: boolean;
    kind: 'pierce' | 'slash' | 'whack';
    role?: 'launcher' | 'ammo' | 'missile';
  };
  armor?: { slot: ArmorSlot; ac: number; mc: number };
  food?: { nutrition: number };
  prop?: string;
  wand?: { dir: WandDir };
  /** Containers: C has no capacity; content fills it in. */
  container?: true;
  spellbook?: { level: number };
  boulder?: true;
}

const LAUNCHERS = ['bow', 'sling', 'crossbow'];
const MISSILES = ['dart', 'shuriken', 'boomerang'];

export function objectData(o: CObject, all: readonly CObject[]): ObjectData {
  const id = objectId(o);
  const cls = OBJ_CLASS[o.cls] ?? null;
  const out: ObjectData = {
    id,
    nameKey: id,
    ...(o.desc !== null && !isShuffled(all, o) ? { descKey: `${id}.desc` } : {}),
    name: objectName(o),
    desc: o.desc,
    class: cls,
    glyph: { ch: o.ch, color: o.color },
    prob: o.prob,
    weight: o.weight,
    cost: o.cost,
    material: o.material.toLowerCase(),
    merge: o.merge,
    magic: o.magic,
    delay: o.delay,
  };
  const skill = o.sub.replace(/^-?P_/, '').toLowerCase();
  if (/^-?P_/.test(o.sub) && o.sub !== 'P_NONE' && cls !== 'spellbook') {
    const ammo = o.sub.startsWith('-');
    const role = LAUNCHERS.includes(skill)
      ? ammo
        ? 'ammo'
        : 'launcher'
      : ammo && MISSILES.includes(skill)
        ? 'missile'
        : null;
    out.weapon = {
      small: [1, o.sdam],
      large: [1, o.ldam],
      hitBonus: o.oc1,
      skill,
      bimanual: o.big,
      kind: o.dir.includes('PIERCE') ? 'pierce' : o.dir.includes('SLASH') ? 'slash' : 'whack',
      ...(role ? { role } : {}),
    };
  }
  const slot = ARM_SLOT[o.sub];
  if (cls === 'armor' && slot) out.armor = { slot, ac: o.oc1, mc: o.oc2 };
  if (cls === 'food') out.food = { nutrition: o.nutrition };
  if (o.prop !== null) out.prop = o.prop.toLowerCase();
  const dir = WAND_DIR[o.dir[0] ?? ''];
  if (cls === 'wand' && dir) out.wand = { dir };
  if (o.container && cls === 'tool') out.container = true;
  if (cls === 'spellbook') out.spellbook = { level: o.oc2 };
  if (o.enumName === 'BOULDER') out.boulder = true;
  return out;
}
