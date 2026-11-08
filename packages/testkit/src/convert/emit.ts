/**
 * Prints content-def TypeScript for chosen monsters and objects, in the shape of
 * packages/content/src/monsters.ts and objects.ts, plus their English message entries. The
 * output is a starting point for a batch step: review it, run prettier, and add behaviour.
 */
import type { CMonster, CObject } from './cdata.ts';
import {
  monsterData,
  monsterIds,
  objectData,
  slug,
  type MonsterData,
  type ObjectData,
} from './defs.ts';

/** core's MonsterSound union today; other sounds are emitted with a TODO comment. */
const KNOWN_SOUNDS = [
  'silent',
  'bark',
  'mew',
  'growl',
  'roar',
  'squeak',
  'hiss',
  'buzz',
  'grunt',
  'moo',
  'bellow',
  'chirp',
  'orc',
  'humanoid',
  'soldier',
  'priest',
  'sell',
  'groan',
  'djinni',
  'oracle',
];

const q = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
const list = (xs: readonly string[]): string => `[${xs.map(q).join(', ')}]`;
/** The palette constant content files use for a CLR_ name: CLR_BRIGHT_BLUE -> BRIGHT_BLUE. */
export const colorConst = (clr: string): string => clr.replace(/^CLR_/, '');

/** Finds rows by display name ("giant ant"), id ("nh:giant_ant", "giant_ant") or enum ("GIANT_ANT"). */
function pick<T>(
  rows: readonly T[],
  wanted: readonly string[],
  keys: (row: T) => string[],
): { found: T[]; missing: string[] } {
  const found: T[] = [];
  const missing: string[] = [];
  for (const w of wanted) {
    const norm = slug(w.replace(/^nh:/, ''));
    const row = rows.find((r) => keys(r).some((k) => slug(k) === norm));
    if (row) found.push(row);
    else missing.push(w);
  }
  return { found, missing };
}

export interface Emitted {
  /** Def literals to paste into the MONSTERS / OBJECTS array. */
  defs: string;
  /** `'nh:id': 'english',` lines for the message table. */
  messages: string;
  /** Palette constants the defs reference. */
  colors: string[];
  /** Requested names that matched no row. */
  missing: string[];
}

/** `MON(NAM("newt"), S_LIZARD, ...)`: the name and class of a row, as content's ref comments cite it. */
function shortRef(source: string): string {
  const m = /^(MON\(NAMS?\([^)]*\), \w+),/.exec(source);
  return m ? `${m[1]}, ...)` : source;
}

function emitMonster(d: MonsterData, source: string): string {
  const attacks =
    d.attacks.length === 0
      ? '[]'
      : `[\n${d.attacks.map((a) => `      { at: ${q(a.at)}, ad: ${q(a.ad)}, n: ${a.n}, d: ${a.d} },`).join('\n')}\n    ]`;
  const sound = KNOWN_SOUNDS.includes(d.sound)
    ? `sound: ${q(d.sound)},`
    : `sound: ${q(d.sound)}, // TODO: not in core's MonsterSound yet`;
  return [
    `  // ref: monsters.h ${shortRef(source)}`,
    `  {`,
    `    id: ${q(d.id)},`,
    `    nameKey: ${q(d.nameKey)},`,
    `    glyph: { ch: ${q(d.glyph.ch)}, fg: ${colorConst(d.glyph.color)} },`,
    `    level: ${d.level},`,
    `    speed: ${d.speed},`,
    `    ac: ${d.ac},`,
    `    mr: ${d.mr},`,
    `    alignment: ${d.alignment},`,
    `    attacks: ${attacks},`,
    `    size: ${q(d.size)},`,
    `    flags: ${list(d.flags)},`,
    `    frequency: ${d.frequency},`,
    `    group: ${d.group === null ? 'null' : q(d.group)},`,
    `    genFlags: ${list(d.genFlags)},`,
    `    difficulty: ${d.difficulty},`,
    `    weight: ${d.weight},`,
    `    nutrition: ${d.nutrition},`,
    `    resists: ${list(d.resists)},`,
    `    conveys: ${list(d.conveys)},`,
    `    brain: ${q(d.brain)},`,
    `    ${sound}`,
    `  },`,
  ].join('\n');
}

export function emitMonsters(all: readonly CMonster[], wanted: readonly string[]): Emitted {
  const ids = monsterIds(all);
  const { found, missing } = pick(all, wanted, (m) => [
    m.name,
    m.enumName,
    ...(m.names ? [m.names.male, m.names.female, m.names.neutral] : []),
    ids.get(m) ?? '',
  ]);
  const data = found.map((m) => ({ d: monsterData(m, ids.get(m)!), source: m.source }));
  return {
    defs: data.map(({ d, source }) => emitMonster(d, source)).join('\n'),
    messages: data.map(({ d }) => `  ${q(d.id)}: ${q(d.name)},`).join('\n'),
    colors: [...new Set(data.map(({ d }) => colorConst(d.glyph.color)))].sort(),
    missing,
  };
}

/** A rough English plural for the message table; check irregular ones against makeplural(). */
export function roughPlural(name: string): string {
  const pair = /^pair of (.*)$/.exec(name);
  if (pair) return `pairs of ${pair[1]}`;
  const of = /^(\w+) of (.*)$/.exec(name);
  if (of) return `${roughPlural(of[1]!)} of ${of[2]}`;
  if (/(s|x|z|ch|sh)$/.test(name)) return `${name}es`;
  if (/[^aeiou]y$/.test(name)) return `${name.slice(0, -1)}ies`;
  if (/fe$/.test(name)) return `${name.slice(0, -2)}ves`;
  return `${name}s`;
}

function emitObject(d: ObjectData, source: string): string {
  const lines = [
    `  // ref: objects.h ${source}`,
    `  {`,
    `    id: ${q(d.id)},`,
    `    nameKey: ${q(d.nameKey)},`,
  ];
  if (d.descKey !== undefined) lines.push(`    descKey: ${q(d.descKey)},`);
  lines.push(
    `    class: ${d.class === null ? "'TODO' as never" : q(d.class)},`,
    `    glyph: { ch: ${q(d.glyph.ch)}, fg: ${colorConst(d.glyph.color)} },`,
    `    prob: ${d.prob},`,
    `    weight: ${d.weight},`,
    `    cost: ${d.cost},`,
    `    material: ${q(d.material)},`,
    `    merge: ${d.merge},`,
    `    magic: ${d.magic},`,
    `    delay: ${d.delay},`,
  );
  const w = d.weapon;
  if (w) {
    lines.push(
      `    weapon: {`,
      `      small: [${w.small.join(', ')}],`,
      `      large: [${w.large.join(', ')}],`,
      `      hitBonus: ${w.hitBonus},`,
      `      skill: ${q(w.skill)},`,
      `      bimanual: ${w.bimanual},`,
      `      kind: ${q(w.kind)},`,
      ...(w.role ? [`      role: ${q(w.role)},`] : []),
      `    },`,
    );
  }
  if (d.armor)
    lines.push(`    armor: { slot: ${q(d.armor.slot)}, ac: ${d.armor.ac}, mc: ${d.armor.mc} },`);
  if (d.food) lines.push(`    food: { nutrition: ${d.food.nutrition} },`);
  if (d.prop !== undefined) lines.push(`    prop: ${q(d.prop)},`);
  if (d.wand) lines.push(`    wand: { dir: ${q(d.wand.dir)} },`);
  if (d.container)
    lines.push(`    container: { capacity: null, box: false }, // TODO: capacity, box`);
  if (d.spellbook) lines.push(`    spellbook: { level: ${d.spellbook.level} },`);
  if (d.boulder) lines.push(`    boulder: true,`);
  lines.push(`  },`);
  return lines.join('\n');
}

export function emitObjects(all: readonly CObject[], wanted: readonly string[]): Emitted {
  const rows = all.filter((o) => o.index >= 18 && o.name !== null);
  const { found, missing } = pick(rows, wanted, (o) => [
    o.name ?? '',
    o.enumName,
    objectData(o, all).id,
  ]);
  const data = found.map((o) => ({ d: objectData(o, all), source: o.source }));
  const messages: string[] = [];
  for (const { d } of data) {
    messages.push(
      `  ${q(d.id)}: ${q(d.name)},`,
      `  ${q(`${d.id}.plural`)}: ${q(roughPlural(d.name))},`,
    );
    if (d.descKey !== undefined && d.desc !== null)
      messages.push(
        `  ${q(d.descKey)}: ${q(d.desc)},`,
        `  ${q(`${d.descKey}.plural`)}: ${q(roughPlural(d.desc))},`,
      );
  }
  return {
    defs: data.map(({ d, source }) => emitObject(d, source)).join('\n'),
    messages: messages.join('\n'),
    colors: [...new Set(data.map(({ d }) => colorConst(d.glyph.color)))].sort(),
    missing,
  };
}
