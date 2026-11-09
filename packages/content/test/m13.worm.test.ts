// m13 step 5: long worms. A long worm gets a tail of rn2(5) segments (entities of def
// `nh:long_worm_tail` linked to it); the tail follows the head, grows and shrinks; a tail square
// is the worm (it blocks her, and a blow there hits the worm and may cut it); killing, genociding,
// teleporting and polymorphing handle the tail; a long worm leaves a worm tooth, which enchant
// weapon turns into a crysknife. Outcomes are asserted; rolls are searched.
import { getPlayer, type Ctx, type DefId, type Entity, type EntityId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon } from '../src/generation';
import { monsterDied } from '../src/mondeath';
import { newcham } from '../src/newcham';
import { rlocMon } from '../src/trap';
import { killGenocidedMonsters } from '../src/genocide';
import { setGenocided } from '../src/vanquished';
import { giveWormTail, wormMove, wormNomove, wormCross } from '../src/worm';
import { cutworm } from '../src/wormcut';
import { countWsegs, mAt, setWormRec, wormRec } from '../src/wormstate';
import { placeOnFloor } from '../src/items';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '                 ',
  ' ............... ',
  ' ............... ',
  ' ............... ',
  ' .......@....... ',
  ' ............... ',
  ' ............... ',
  ' ............... ',
  '                 ',
];

function make(seed = 1, rows = ROOM): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  return s;
}
const ctxOf = (s: S): Ctx => s.ctx as unknown as Ctx;
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
const tails = (s: S): Entity[] =>
  Object.values(s.state.entities).filter((e) => e.def === 'nh:long_worm_tail');
const segPos = (s: S, w: EntityId) =>
  (wormRec(s.state, w)?.segs ?? []).map((id) => ent(s, id)?.c.pos);
const adj = (a?: { x: number; y: number }, b?: { x: number; y: number }): boolean =>
  !!a && !!b && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) === 1;
/** The tail, tail end first, ends next to the head and each segment is next to the following. */
function chained(s: S, w: EntityId): boolean {
  const at = [...segPos(s, w), ent(s, w)?.c.pos];
  for (let i = 0; i + 1 < at.length; i++) if (!adj(at[i], at[i + 1])) return false;
  return true;
}
/** A long worm at (x, y) (pinned: asleep, speed 0) with a tail of `n` segments laid at random. */
function worm(s: S, x: number, y: number, n: number, o: { level?: number; hp?: number } = {}) {
  const id = addMon(s.state, 'nh:long_worm', x, y, { asleep: true });
  const e = ent(s, id)!;
  e.c.actor!.speed = 0;
  e.c.monster!.level = o.level ?? 9;
  e.c.hp = { cur: o.hp ?? 60, max: o.hp ?? 60 };
  giveWormTail(ctxOf(s), id, n);
  return id;
}
/** A worm with its tail laid on exactly these squares (tail end first). */
function wormAt(s: S, head: [number, number], segs: [number, number][], level = 9) {
  const id = addMon(s.state, 'nh:long_worm', head[0], head[1], { asleep: true });
  const e = ent(s, id)!;
  e.c.actor!.speed = 0;
  e.c.monster!.level = level;
  e.c.hp = { cur: 60, max: 60 };
  const ids = segs.map(([x, y]) =>
    ctxOf(s).spawn({ def: 'nh:long_worm_tail' as DefId, c: { pos: { level: 'dlvl1', x, y } } }),
  );
  setWormRec(s.ctx, id, { segs: ids, wgrowtime: 0 });
  return id;
}

describe('makemon(): a long worm and its tail', () => {
  test('rn2(5) segments laid behind it, each a bare entity linked to the worm', () => {
    const lengths = new Set<number>();
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      const id = makemon(ctxOf(s), defs.monster('nh:long_worm' as DefId), { x: 3, y: 2 })!;
      const rec = wormRec(s.state, id);
      expect(rec).not.toBeNull();
      lengths.add(rec!.segs.length);
      expect(tails(s).length).toBe(rec!.segs.length);
      for (const t of tails(s)) {
        expect(t.c.monster).toBeUndefined();
        expect(mAt(s.state, 'dlvl1', t.c.pos!.x, t.c.pos!.y)?.id).toBe(id);
      }
      expect(chained(s, id)).toBe(true);
    }
    expect([...lengths].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  test('a baby long worm has no tail; MM_NOTAIL gives a worm number but no segments', () => {
    const s = make();
    const baby = makemon(ctxOf(s), defs.monster('nh:baby_long_worm' as DefId), { x: 3, y: 2 })!;
    expect(wormRec(s.state, baby)).toBeNull();
    const id = makemon(
      ctxOf(s),
      defs.monster('nh:long_worm' as DefId),
      { x: 10, y: 2 },
      { noTail: true },
    )!;
    expect(wormRec(s.state, id)?.segs).toEqual([]);
  });
});

describe('worm_move() and worm_nomove()', () => {
  test('a new segment takes the old head square; it grows when due, else the end goes', () => {
    const s = make();
    const id = wormAt(
      s,
      [5, 3],
      [
        [3, 3],
        [4, 3],
      ],
    );
    const e = ent(s, id)!;
    // a new worm (wgrowtime 0) grows on its first move
    e.c.pos = { level: 'dlvl1', x: 6, y: 3 };
    wormMove(ctxOf(s), id, { x: 5, y: 3 });
    expect(segPos(s, id).map((p) => [p!.x, p!.y])).toEqual([
      [3, 3],
      [4, 3],
      [5, 3],
    ]);
    const due = wormRec(s.state, id)!.wgrowtime;
    expect(due).toBeGreaterThan(s.state.turn);
    expect(e.c.hp!.cur).toBeGreaterThan(60); // d(2,2) more, under the segment limit (8*9 + 8*3)
    // not due: the end goes as the new segment comes
    e.c.pos = { level: 'dlvl1', x: 7, y: 3 };
    wormMove(ctxOf(s), id, { x: 6, y: 3 });
    expect(segPos(s, id).map((p) => [p!.x, p!.y])).toEqual([
      [4, 3],
      [5, 3],
      [6, 3],
    ]);
    expect(tails(s).length).toBe(3);
  });

  test('a worm that cannot move loses its tail end and 2..4 hit points', () => {
    const s = make();
    const id = wormAt(
      s,
      [5, 3],
      [
        [3, 3],
        [4, 3],
      ],
    );
    wormNomove(ctxOf(s), id);
    expect(segPos(s, id).map((p) => [p!.x, p!.y])).toEqual([[4, 3]]);
    const hp = ent(s, id)!.c.hp!.cur;
    expect(hp).toBeGreaterThanOrEqual(56);
    expect(hp).toBeLessThanOrEqual(58);
    expect(tails(s).length).toBe(1);
  });

  test('awake, it crawls toward her and its tail follows and grows', () => {
    const s = make(3);
    const id = worm(s, 2, 1, 0);
    const e = ent(s, id)!;
    e.c.monster!.asleep = false;
    e.c.actor!.speed = 12;
    getPlayer(s.state).c.hp = { cur: 999, max: 999 };
    for (let t = 0; t < 12; t++) s.step({ type: 'wait' });
    expect(ent(s, id)).toBeDefined();
    expect(countWsegs(s.state, id)).toBeGreaterThan(0);
    expect(tails(s).length).toBe(countWsegs(s.state, id));
    expect(chained(s, id)).toBe(true);
  });
});

describe('the tail is the worm', () => {
  test('walking into a tail square attacks the worm and does not move her', () => {
    let hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(seed);
      // the hero at (8, 4); the tail runs through (9, 4); the head is at (11, 4)
      const id = wormAt(
        s,
        [11, 4],
        [
          [9, 4],
          [10, 4],
        ],
      );
      const r = s.step({ type: 'move', dir: 'e' });
      expect(getPlayer(s.state).c.pos).toMatchObject({ x: 8, y: 4 });
      const t = s.text(r).join(' ');
      expect(t).toMatch(/long worm/);
      if ((ent(s, id)?.c.hp?.cur ?? 0) < 60) hits++;
    }
    expect(hits).toBeGreaterThan(0);
  });

  test('she cannot pass diagonally between two consecutive segments', () => {
    const s = make();
    // hero at (8, 4) -> (9, 3): segments at (8, 3) and (9, 4) are consecutive
    const id = wormAt(
      s,
      [10, 4],
      [
        [8, 3],
        [9, 4],
      ],
    );
    expect(wormCross(s.ctx, 'dlvl1', 8, 4, 9, 3)).toBe(true);
    const r = s.step({ type: 'move', dir: 'ne' });
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 8, y: 4 });
    expect(s.text(r)).toContain('The long worm is in your way.');
    expect(ent(s, id)).toBeDefined();
    // not consecutive (the tail end and the head): no crossing
    expect(wormCross(s.ctx, 'dlvl1', 9, 3, 10, 4)).toBe(false);
  });
});

describe('wormhitu()', () => {
  test('a worm next to her with a segment next to her attacks once more for it', () => {
    const counts: number[] = [];
    for (let seed = 1; seed <= 5; seed++) {
      const s = make(seed);
      getPlayer(s.state).c.hp = { cur: 999, max: 999 };
      // hero (8, 4); head (9, 4); segments (10, 5) (not next to her) and (9, 5) (next to her)
      const id = wormAt(
        s,
        [9, 4],
        [
          [10, 5],
          [9, 5],
        ],
      );
      const e = ent(s, id)!;
      e.c.monster!.asleep = false;
      e.c.actor!.speed = 12;
      e.c.actor!.energy = 12;
      const r = s.step({ type: 'wait' });
      counts.push(s.text(r).filter((t) => /^The long worm (bites|misses)/.test(t)).length);
    }
    expect(counts.every((n) => n === 2)).toBe(true);
  });
});

describe('cutworm()', () => {
  // a straight worm: head (12, 4), tail end first (6..11, 4)
  const line = (s: S, level = 9) =>
    wormAt(
      s,
      [12, 4],
      [6, 7, 8, 9, 10, 11].map((x): [number, number] => [x, 4]),
      level,
    );

  test('a cut at the tail end only loses that segment', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      const id = line(s);
      cutworm(ctxOf(s), id, 6, 4, true);
      const n = countWsegs(s.state, id);
      expect([5, 6]).toContain(n); // 7..20 with a blade cuts
      if (n === 5) expect(segPos(s, id)[0]).toMatchObject({ x: 7, y: 4 });
    }
  });

  test('cut in the middle: the part behind is lost (hit points halved) or becomes a worm', () => {
    let split = 0;
    let lost = 0;
    for (let seed = 1; seed <= 60 && (!split || !lost); seed++) {
      const s = make(seed);
      const id = line(s);
      cutworm(ctxOf(s), id, 9, 4, true);
      const n = countWsegs(s.state, id);
      if (n === 6) continue; // no cut
      expect(n).toBe(2); // (10, 4), (11, 4)
      const worms = Object.values(s.state.entities).filter((e) => e.def === 'nh:long_worm');
      if (worms.length === 2) {
        split++;
        const nw = worms.find((w) => w.id !== id)!;
        expect(nw.c.pos).toMatchObject({ x: 9, y: 4 });
        expect(segPos(s, nw.id).map((p) => p!.x)).toEqual([6, 7, 8]);
        expect(ent(s, id)!.c.monster!.level).toBe(7);
        expect(nw.c.monster!.level).toBe(7);
        expect(nw.c.hp!.max).toBeLessThanOrEqual(56);
        expect(tails(s).length).toBe(5);
      } else {
        lost++;
        expect(ent(s, id)!.c.hp!.cur).toBe(30);
        expect(tails(s).length).toBe(2);
      }
      expect(chained(s, id)).toBe(true);
    }
    expect(split).toBeGreaterThan(0);
    expect(lost).toBeGreaterThan(0);
  });

  test('a worm below level 3 never splits', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      const id = line(s, 2);
      cutworm(ctxOf(s), id, 9, 4, true);
      expect(Object.values(s.state.entities).filter((e) => e.def === 'nh:long_worm').length).toBe(
        1,
      );
      expect(ent(s, id)).toBeDefined();
    }
  });

  test('hitting its tail with a sword in melee cuts it now and then', () => {
    let cut = 0;
    for (let seed = 1; seed <= 40 && !cut; seed++) {
      const s = make(seed);
      const sword = s.carry('nh:long_sword');
      for (const o of Object.values(s.state.entities))
        if (o.c.item?.carriedBy === s.state.playerId && o.c.item.equipped === 'weapon')
          o.c.item.equipped = null;
      s.state.entities[String(sword)]!.c.item!.equipped = 'weapon';
      const id = line(s);
      ent(s, id)!.c.hp = { cur: 999, max: 999 };
      // she stands next to (8, 4) and (9, 4): at (8, 5)
      getPlayer(s.state).c.pos = { level: 'dlvl1', x: 8, y: 5 };
      const r = s.step({ type: 'move', dir: 'n' });
      if (countWsegs(s.state, id) < 6) {
        cut++;
        expect(s.text(r).join(' ')).toMatch(/You cut (part of the tail off of )?the long worm/);
      }
    }
    expect(cut).toBeGreaterThan(0);
  });
});

describe('the tail goes with the worm', () => {
  test('killing it removes every segment and leaves a worm tooth', () => {
    const s = make();
    const id = worm(s, 4, 2, 4);
    expect(tails(s).length).toBeGreaterThan(0);
    monsterDied(ctxOf(s), id, true);
    expect(tails(s)).toEqual([]);
    expect(wormRec(s.state, id)).toBeNull();
    const tooth = Object.values(s.state.entities).find((e) => e.def === 'nh:worm_tooth');
    expect(tooth?.c.pos).toMatchObject({ x: 4, y: 2 });
  });

  test('genocide removes the tail with the worm', () => {
    const s = make();
    worm(s, 4, 2, 4);
    setGenocided(s.ctx, 'nh:long_worm' as DefId);
    killGenocidedMonsters(ctxOf(s));
    expect(tails(s)).toEqual([]);
    expect(Object.values(s.state.entities).some((e) => e.def === 'nh:long_worm')).toBe(false);
  });

  test('teleporting it lays the tail again behind its new square', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = make(seed);
      const id = wormAt(
        s,
        [4, 2],
        [
          [2, 2],
          [3, 2],
        ],
      );
      expect(rlocMon(ctxOf(s), ent(s, id)!, false)).toBe(true);
      expect(countWsegs(s.state, id)).toBe(2);
      expect(chained(s, id)).toBe(true);
    }
  });

  test('polymorphed into a long worm it grows a tail; out of one, it drops it', () => {
    let tailed = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      const id = addMon(s.state, 'nh:jackal', 4, 2, { asleep: true });
      expect(newcham(ctxOf(s), ent(s, id)!, defs.monster('nh:long_worm' as DefId))).toBe(true);
      expect(wormRec(s.state, id)).not.toBeNull();
      if (countWsegs(s.state, id) > 0) tailed++;
      expect(chained(s, id)).toBe(true);
      expect(newcham(ctxOf(s), ent(s, id)!, defs.monster('nh:jackal' as DefId))).toBe(true);
      expect(wormRec(s.state, id)).toBeNull();
      expect(tails(s)).toEqual([]);
    }
    expect(tailed).toBeGreaterThan(0);
  });
});

describe('the worm tooth and the crysknife', () => {
  const wieldTooth = (s: S, quantity = 1): EntityId => {
    const tooth = s.carry('nh:worm_tooth', { quantity });
    for (const o of Object.values(s.state.entities))
      if (o.c.item?.carriedBy === s.state.playerId && o.c.item.equipped === 'weapon')
        o.c.item.equipped = null;
    s.state.entities[String(tooth)]!.c.item!.equipped = 'weapon';
    return tooth;
  };
  const read = (s: S, buc: 'uncursed' | 'cursed') => {
    const scroll = s.carry('nh:scroll_of_enchant_weapon');
    s.state.entities[String(scroll)]!.c.item!.buc = buc;
    return s.mod('nh:read', { item: scroll });
  };

  test('enchant weapon makes a wielded worm tooth a crysknife; a stack fuses into one', () => {
    const s = make();
    const tooth = wieldTooth(s, 2);
    const r = read(s, 'uncursed');
    expect(s.text(r)).toContain('Your worm teeth fuse, and become much sharper now.');
    const e = ent(s, tooth)!;
    expect(e.def).toBe('nh:crysknife');
    expect(e.c.item!.quantity).toBe(1);
    expect(e.c.item!.spe).toBe(0);
    // a cursed scroll turns it back
    const r2 = read(s, 'cursed');
    expect(s.text(r2)).toContain('Your crysknife is much duller now.');
    expect(ent(s, tooth)!.def).toBe('nh:worm_tooth');
  });

  test('dropped, a crysknife reverts to a worm tooth; a fixed one only 1 time in 10', () => {
    const s = make();
    const knife = s.carry('nh:crysknife');
    placeOnFloor(s.ctx, knife, 'dlvl1', 3, 3);
    expect(ent(s, knife)!.def).toBe('nh:worm_tooth');
    let reverted = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const t = make(seed);
      const k = t.carry('nh:crysknife');
      t.state.entities[String(k)]!.c.item!.erodeproof = true;
      placeOnFloor(t.ctx, k, 'dlvl1', 3, 3);
      if (ent(t, k)!.def === 'nh:worm_tooth') {
        reverted++;
        expect(ent(t, k)!.c.item!.erodeproof).toBeUndefined();
      }
    }
    expect(reverted).toBeGreaterThan(0);
    expect(reverted).toBeLessThan(15);
  });
});
