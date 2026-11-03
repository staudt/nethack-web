// Milestone 6b2 step 5: praying on an altar. p_aligntyp comes from the altar; a cross-aligned
// altar halves the record (an opposite one negates it) and a good prayer there costs a point of
// alignment; water on the altar turns holy or unholy; Moloch only laughs; an altar (and more so
// a shrine) widens the favour roll. ref: src/pray.c can_pray(), prayer_done(), water_prayer(),
// pleased()
import { cellIndex, getLevel, getPlayer, type DefId, type Level } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { A_LAWFUL, P, T, setItimeout, setU, uState } from '../src/index';
import { addMon } from './helpers';
import { itemOf, levelSetup } from './itemHelpers';

function paint(level: Level, x: number, y: number, id: DefId): void {
  let i = level.palette.indexOf(id);
  if (i === -1) i = level.palette.push(id) - 1;
  level.cells[cellIndex(level, x, y)] = i;
}

type Setup = ReturnType<typeof levelSetup>;
/** The hero on an altar of `altar` in the middle of a strip; `null` for no altar. */
function onAltar(altar: DefId | null, seed = 1): Setup {
  const s = levelSetup(['.......', '...@...', '.......'], seed);
  if (altar) paint(getLevel(s.state), 3, 1, altar);
  s.step({ type: 'wait' }); // see the level
  return s;
}

/** Prays, answering yes, and returns the rendered messages of the whole prayer. */
function pray(s: Setup): string[] {
  const ask = s.mod('nh:pray');
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  const r = s.step({ type: 'answer', promptId: p.id, value: true });
  return [...s.text(ask), ...s.text(r)];
}

const good = { ublesscnt: 0, alignRecord: 5, luck: 0 };

describe('praying on an altar', () => {
  test('coaligned altar: Odin answers and the water on it becomes holy', () => {
    const s = onAltar(T.altar_neutral);
    setU(s.ctx, good);
    const water = s.floor('nh:potion_of_water', { quantity: 2 });
    const other = s.floor('nh:potion_of_healing');
    const t = pray(s);
    expect(t).toContain('You begin praying to Odin.');
    expect(t).toContain('You are surrounded by a shimmering light.');
    expect(t).toContain('Some of the potions on the altar glow light blue for a moment.');
    expect(t).toContain('You feel that Odin is pleased.');
    expect(itemOf(s.state, water).buc).toBe('blessed');
    expect(itemOf(s.state, water).known.buc).toBe(true);
    expect(itemOf(s.state, other).buc).toBe('uncursed');
    expect(uState(s.state).alignRecord).toBe(5);
    expect(uState(s.state).ublesscnt).toBeGreaterThan(0); // a new prayer timeout
  });

  test('water off an altar is left alone', () => {
    const s = onAltar(null);
    setU(s.ctx, good);
    const water = s.floor('nh:potion_of_water');
    const t = pray(s);
    expect(t.some((x) => x.includes('on the altar'))).toBe(false);
    expect(itemOf(s.state, water).buc).toBe('uncursed');
  });

  test('cross-aligned altar: Tyr is pleased but it costs a point of alignment, no timeout', () => {
    const s = onAltar(T.altar_lawful);
    setU(s.ctx, good);
    const t = pray(s);
    expect(t).toContain('You begin praying to Tyr.');
    expect(t).not.toContain('You are surrounded by a shimmering light.');
    expect(t).toContain('You feel that Tyr is pleased.');
    expect(uState(s.state).alignRecord).toBe(4);
    expect(uState(s.state).ublesscnt).toBe(0);
    expect(uState(s.state).luck).toBe(0);
  });

  test('cross-aligned altar with water: it turns unholy and the hero is punished', () => {
    const s = onAltar(T.altar_chaotic);
    setU(s.ctx, good);
    const water = s.floor('nh:potion_of_water');
    const t = pray(s);
    expect(t).toContain('You begin praying to Loki.');
    expect(t).toContain('The potion on the altar glows black for a moment.');
    expect(itemOf(s.state, water).buc).toBe('cursed');
    expect(itemOf(s.state, water).known.buc).toBe(true);
    const u = uState(s.state);
    expect(u.luck).toBe(-3);
    expect(u.ugangr).toBe(1);
    expect(u.ublesscnt).toBeGreaterThan(0);
  });

  test('a failed prayer on a cross-aligned altar also makes unholy water', () => {
    const s = onAltar(T.altar_lawful);
    setU(s.ctx, { ...good, ublesscnt: 500 }); // too soon
    const water = s.floor('nh:potion_of_water');
    const t = pray(s);
    expect(t).toContain('The potion on the altar glows black for a moment.');
    expect(itemOf(s.state, water).buc).toBe('cursed');
    expect(uState(s.state).luck).toBe(-3);
  });

  test('the record counts half on another altar and negated on the opposite one', () => {
    // a lawful hero with record 1: half (0) is still good on a neutral altar...
    const a = onAltar(T.altar_neutral);
    setU(a.ctx, { ...good, alignType: A_LAWFUL, alignRecord: 1 });
    const ta = pray(a);
    expect(ta).toContain('You feel that Odin is satisfied.');
    expect(uState(a.state).alignRecord).toBe(0);
    // ...but -1 on a chaotic one: too naughty, Tyr (her own god) is angry
    const b = onAltar(T.altar_chaotic);
    setU(b.ctx, { ...good, alignType: A_LAWFUL, alignRecord: 1 });
    const tb = pray(b);
    expect(tb).toContain('You begin praying to Loki.');
    expect(tb).not.toContain('You are surrounded by a shimmering light.');
    expect(tb.some((x) => x.startsWith('You feel that Loki'))).toBe(false);
    expect(uState(b.state).ublesscnt).toBeGreaterThan(0); // angrygods() sets it
  });

  test('Moloch: diabolical laughter wakes the neighbours, -2 alignment, nothing else', () => {
    const s = onAltar(T.altar_unaligned);
    setU(s.ctx, good);
    const water = s.floor('nh:potion_of_water');
    const jackal = addMon(s.state, 'nh:jackal', 0, 0, { asleep: true });
    const mon = s.state.entities[String(jackal)]!.c.monster!;
    Object.assign(s.state.entities[String(jackal)]!.c.actor!, { speed: 0 });
    const t = pray(s);
    expect(t).toContain('You begin praying to Moloch.');
    expect(t).not.toContain('You are surrounded by a shimmering light.');
    expect(t).toContain('You hear diabolical laughter all around you...');
    expect(t).toContain('Nothing else happens.');
    expect(mon.asleep).toBe(false);
    expect(uState(s.state).alignRecord).toBe(3);
    expect(uState(s.state).luck).toBe(0);
    expect(itemOf(s.state, water).buc).toBe('uncursed');
  });

  test('an altar widens the favour roll: all minor troubles fixed only on an altar', () => {
    // two minor troubles: off an altar the roll is capped at "fix the worst one, then the
    // major ones", so one stays; on an altar cases 4 and 5 fix every trouble
    const troubled = (altar: DefId | null, seed: number): number => {
      const s = onAltar(altar, seed);
      setU(s.ctx, { ...good, alignRecord: 10, luck: 10 });
      const h = getPlayer(s.state);
      setItimeout(s.state, h, P.STUNNED, 100);
      setItimeout(s.state, h, P.CONFUSION, 100);
      pray(s);
      return [P.STUNNED, P.CONFUSION].filter((p) => (h.c.props?.[p]?.timeout ?? 0) > 0).length;
    };
    const seeds = Array.from({ length: 12 }, (_, i) => i + 1);
    expect(seeds.every((seed) => troubled(null, seed) >= 1)).toBe(true);
    expect(seeds.some((seed) => troubled(T.altar_neutral, seed) === 0)).toBe(true);
  });
});
