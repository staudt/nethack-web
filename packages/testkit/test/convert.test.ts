// Checks every vanilla monster and object def against its row in vendor/nethack/include
// (monsters.h, objects.h) through the converter (src/convert, docs/CONVERTER.md). Each known
// difference is listed below with its reason; `TODO(bug)` marks one that looks unintended and is
// left for a later step (changing a def here would move the golden replay).
import { readFileSync } from 'node:fs';
import { MONSTERS, OBJECTS } from '@nh/content';
import type { MonsterDef, ObjectDef } from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  VENDOR_HEADER_FILES,
  parseMonsters,
  parseObjects,
  type VendorHeaders,
} from '../src/convert/cdata.ts';
import { monsterData, monsterIds, objectData, objectId } from '../src/convert/defs.ts';
import { emitMonsters, emitObjects } from '../src/convert/emit.ts';
import { Preprocessor, evalExpr, tokenize } from '../src/convert/cpp.ts';

const headers = Object.fromEntries(
  VENDOR_HEADER_FILES.map((f) => [
    f,
    readFileSync(new URL(`../../../vendor/nethack/include/${f}`, import.meta.url), 'utf8'),
  ]),
) as unknown as VendorHeaders;

const C_MONSTERS = parseMonsters(headers);
const C_OBJECTS = parseObjects(headers);

/** Our id -> C enum name, where the id is not the converter's default. */
const OBJECT_ALIASES: Readonly<Record<string, string>> = {
  'nh:flint_stone': 'FLINT', // xname() calls it "flint stone"
  'nh:fake_amulet_of_yendor': 'FAKE_AMULET_OF_YENDOR', // C name "cheap plastic imitation of ..."
};

const POTION_PROP =
  "a potion's oc_oprop names its effect; content's `prop` is only what a worn or carried item confers";

/** `<id>.<field>` -> why our def differs from the C row. */
const MONSTER_DIFFERENCES: Readonly<Record<string, string>> = {};

/** `<id>.<field>` -> why our def differs from the C row. */
const OBJECT_DIFFERENCES: Readonly<Record<string, string>> = {
  'nh:boulder.ch': "drawn as '0' (the common `boulder` option), DEVIATIONS.md Boulders",
  'nh:leather_gloves.descKey':
    'the only glove type in the table, so its range never shuffles (o_init.ts SHUFFLED)',
  'nh:potion_of_blindness.prop': POTION_PROP,
  'nh:potion_of_confusion.prop': POTION_PROP,
  'nh:potion_of_hallucination.prop': POTION_PROP,
  'nh:potion_of_see_invisible.prop': POTION_PROP,
  'nh:pick_axe.weapon.hitBonus':
    'TODO(bug): WEPTOOL() passes its strike mode (WHACK = 4) as oc_hitbon, which hitval() adds; follow C or log a deviation',
};

const sorted = (xs: readonly string[]): string[] => [...xs].sort();

/** Field-by-field differences between two plain values, as `<path>: ours X, C Y`. */
function diff(path: string, ours: unknown, theirs: unknown, out: Map<string, string>): void {
  if (
    typeof ours === 'object' &&
    ours !== null &&
    typeof theirs === 'object' &&
    theirs !== null &&
    !Array.isArray(ours)
  ) {
    const keys = sorted([...new Set([...Object.keys(ours), ...Object.keys(theirs)])]);
    for (const k of keys)
      diff(
        `${path}.${k}`,
        (ours as Record<string, unknown>)[k],
        (theirs as Record<string, unknown>)[k],
        out,
      );
    return;
  }
  const a = JSON.stringify(ours);
  const b = JSON.stringify(theirs);
  if (a !== b) out.set(path, `ours ${a ?? 'absent'}, C ${b ?? 'absent'}`);
}

/**
 * Glyph colours: content files map each C colour to one palette hex. Takes the most common hex per
 * C colour and reports defs that use another one, and C colours that share a hex.
 */
function colorDiffs(
  rows: readonly { id: string; fg: string; color: string }[],
  out: Map<string, string>,
): void {
  const votes: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    const v = (votes[r.color] ??= {});
    v[r.fg] = (v[r.fg] ?? 0) + 1;
  }
  const palette: Record<string, string> = {};
  for (const clr of sorted(Object.keys(votes))) {
    const v = votes[clr]!;
    palette[clr] = sorted(Object.keys(v)).reduce((a, b) => (v[b]! > v[a]! ? b : a));
  }
  for (const r of rows)
    if (r.fg !== palette[r.color])
      out.set(`${r.id}.glyph.fg`, `ours ${r.fg}, C ${r.color} (${palette[r.color]} elsewhere)`);
  const byHex: Record<string, string[]> = {};
  for (const clr of sorted(Object.keys(palette))) (byHex[palette[clr]!] ??= []).push(clr);
  for (const [hex, clrs] of Object.entries(byHex))
    if (clrs.length > 1) out.set(`palette.${hex}`, `shared by ${clrs.join(', ')}`);
}

function monsterDiffs(defs: readonly MonsterDef[]): Map<string, string> {
  const ids = monsterIds(C_MONSTERS);
  const byId = new Map([...ids].map(([m, id]) => [id, m]));
  const out = new Map<string, string>();
  const colors: { id: string; fg: string; color: string }[] = [];
  for (const def of defs) {
    const c = byId.get(def.id);
    if (!c) {
      out.set(`${def.id}.row`, 'no C row');
      continue;
    }
    const want = monsterData(c, def.id);
    colors.push({ id: def.id, fg: def.glyph.fg ?? '', color: want.glyph.color });
    const pick = (d: MonsterDef | typeof want): Record<string, unknown> => ({
      nameKey: d.nameKey,
      ch: d.glyph.ch,
      level: d.level,
      speed: d.speed,
      ac: d.ac,
      mr: d.mr,
      alignment: d.alignment,
      attacks: d.attacks,
      size: d.size,
      flags: sorted(d.flags),
      frequency: d.frequency,
      group: d.group,
      genFlags: sorted(d.genFlags),
      difficulty: d.difficulty,
      weight: d.weight,
      nutrition: d.nutrition,
      resists: sorted(d.resists),
      conveys: sorted(d.conveys),
      sound: d.sound ?? 'silent',
    });
    const ours = pick(def);
    const theirs = pick(want);
    for (const k of Object.keys(ours)) diff(`${def.id}.${k}`, ours[k], theirs[k], out);
  }
  colorDiffs(colors, out);
  return out;
}

function objectDiffs(defs: readonly ObjectDef[]): Map<string, string> {
  const byId = new Map(C_OBJECTS.filter((o) => o.index >= 18).map((o) => [objectId(o), o]));
  for (const [id, e] of Object.entries(OBJECT_ALIASES)) {
    const o = C_OBJECTS.find((x) => x.enumName === e);
    if (o) byId.set(id, o);
  }
  const out = new Map<string, string>();
  const colors: { id: string; fg: string; color: string }[] = [];
  for (const def of defs) {
    const c = byId.get(def.id);
    if (!c) {
      out.set(`${def.id}.row`, 'no C row');
      continue;
    }
    const want = objectData(c, C_OBJECTS);
    colors.push({ id: def.id, fg: def.glyph.fg ?? '', color: want.glyph.color });
    const ours: Record<string, unknown> = {
      class: def.class,
      ch: def.glyph.ch,
      descKey: def.descKey !== undefined,
      prob: def.prob,
      weight: def.weight,
      cost: def.cost,
      material: def.material,
      merge: def.merge,
      magic: def.magic,
      delay: def.delay,
      weapon: def.weapon,
      armor: def.armor,
      food: def.food,
      prop: def.prop,
      wand: def.wand,
      container: def.container !== undefined,
      spellbook: def.spellbook,
      boulder: def.boulder,
    };
    const theirs: Record<string, unknown> = {
      ...ours,
      class: want.class,
      ch: want.glyph.ch,
      descKey: want.descKey !== undefined,
      prob: want.prob,
      weight: want.weight,
      cost: want.cost,
      material: want.material,
      merge: want.merge,
      magic: want.magic,
      delay: want.delay,
      weapon: want.weapon,
      armor: want.armor,
      food: want.food,
      prop: want.prop,
      wand: want.wand,
      container: want.container === true,
      spellbook: want.spellbook,
      boulder: want.boulder,
    };
    for (const k of Object.keys(ours)) diff(`${def.id}.${k}`, ours[k], theirs[k], out);
  }
  colorDiffs(colors, out);
  return out;
}

/** Fails on any difference not in `allowed`, and on any `allowed` entry that no longer differs. */
function expectOnly(found: Map<string, string>, allowed: Readonly<Record<string, string>>): void {
  const unexpected = sorted([...found.keys()].filter((k) => allowed[k] === undefined)).map(
    (k) => `${k}: ${found.get(k)}`,
  );
  const stale = sorted(Object.keys(allowed).filter((k) => !found.has(k)));
  expect(unexpected, 'differences from the C table not listed in the test').toEqual([]);
  expect(stale, 'listed differences that no longer differ').toEqual([]);
}

describe('converter', () => {
  test('the preprocessor expands nested macros, #if blocks and redefinitions', () => {
    const src = [
      '#define TWICE(x) ROW(x, x)',
      '#if 0',
      'TWICE(skipped)',
      '#elif defined(NOPE) || 1',
      'TWICE(1 + 2)',
      '#endif',
      '#define PAPER LEATHER',
      'TWICE(PAPER)',
      '#undef PAPER',
      'TWICE(PAPER)',
    ].join('\n');
    const rows = new Preprocessor(['ROW'])
      .run(src)
      .map((e) => e.tokens.map((t) => t.text).join(''));
    expect(rows).toEqual(['ROW(1+2,1+2)', 'ROW(LEATHER,LEATHER)', 'ROW(PAPER,PAPER)']);
    expect(evalExpr(tokenize('10 - (3 * 2) | 0x10'), {})).toBe(20);
  });

  test('parses every row of both tables', () => {
    expect(C_MONSTERS.length).toBeGreaterThan(370);
    expect(C_OBJECTS.length).toBeGreaterThan(450);
    const newt = C_MONSTERS.find((m) => m.enumName === 'NEWT');
    expect(newt).toMatchObject({ name: 'newt', ch: ':', level: 0, speed: 6, color: 'CLR_YELLOW' });
    const dagger = C_OBJECTS.find((o) => o.enumName === 'DAGGER');
    expect(dagger).toMatchObject({ cls: 'WEAPON_CLASS', prob: 30, oc1: 2, material: 'IRON' });
  });

  test('emits a def for a requested monster and object', () => {
    const m = emitMonsters(C_MONSTERS, ['giant ant', 'NO_SUCH']);
    expect(m.defs).toContain("id: 'nh:giant_ant'");
    expect(m.messages).toContain("'nh:giant_ant': 'giant ant',");
    expect(m.missing).toEqual(['NO_SUCH']);
    const o = emitObjects(C_OBJECTS, ['RIN_ADORNMENT']);
    expect(o.defs).toContain("id: 'nh:ring_of_adornment'");
    expect(o.messages).toContain("'nh:ring_of_adornment.plural': 'rings of adornment',");
  });
});

describe('vanilla defs match the C tables', () => {
  test('monsters (monsters.h)', () => {
    expectOnly(monsterDiffs(MONSTERS), MONSTER_DIFFERENCES);
  });

  test('a changed field is reported', () => {
    const newt = MONSTERS.find((m) => m.id === 'nh:newt')!;
    const dagger = OBJECTS.find((o) => o.id === 'nh:dagger')!;
    const m = monsterDiffs([{ ...newt, speed: 7, flags: [...newt.flags].reverse() }]);
    expect([...m.keys()]).toEqual(['nh:newt.speed']);
    const o = objectDiffs([{ ...dagger, weapon: { ...dagger.weapon!, small: [1, 5] } }]);
    expect([...o.keys()]).toEqual(['nh:dagger.weapon.small']);
  });

  test('objects (objects.h)', () => {
    expectOnly(objectDiffs(OBJECTS), OBJECT_DIFFERENCES);
  });
});
