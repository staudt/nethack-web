// m7e step 5: land mines and scatter(). The hero and a monster setting one off, a pushed and a
// rolling boulder setting one off, scatter()'s ranges and hits, kicked coins and a bag of
// holding's contents flying off. Outcomes are asserted over seeds (a land mine goes off 9 or 7
// times in 10, a monster's weight decides), never on one lucky seed.
// ref: src/trap.c trapeffect_landmine(), blow_up_landmine(), fill_pit(), launch_obj();
// src/hack.c moverock(); src/explode.c scatter(); src/dokick.c really_kick_object();
// src/pickup.c do_boh_explosion()
import {
  getPlayer,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  createEngine,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { BOULDER } from '../src/boulder';
import { mksobj } from '../src/items';
import { traptypeRnd } from '../src/mklev';
import { moverock } from '../src/moverock';
import { P, hasProp } from '../src/props';
import { launchObj } from '../src/rollboulder';
import { scatter } from '../src/scatter';
import { TRAP, dotrap, mintrap } from '../src/trap';
import { isMtrapped, utrap } from '../src/trapstate';
import { addMon, setup } from './helpers';
import { obj, render, levelSetup, plainKit, engine as itemEngine } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'lm',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'lm:run',
      labelKey: 'lm',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'lm:run' }).events);
}
const floorItems = (state: GameState, def: DefId): Entity[] =>
  Object.values(state.entities).filter(
    (e): e is Entity => !!e && e.def === def && !!e.c.pos && e.c.item?.carriedBy === null,
  );
const total = (items: Entity[]): number => items.reduce((n, e) => n + (e.c.item?.quantity ?? 0), 0);
/** On one of the eight lines from (x, y), at most `r` squares away. */
const onLine = (e: Entity, x: number, y: number, r: number): boolean => {
  const dx = e.c.pos!.x - x;
  const dy = e.c.pos!.y - y;
  return (
    Math.max(Math.abs(dx), Math.abs(dy)) <= r &&
    (dx === 0 || dy === 0 || Math.abs(dx) === Math.abs(dy))
  );
};

/** An 11 x 11 lit room with the hero in the middle (5, 5). */
const ROOM = Array.from({ length: 11 }, (_, y) => (y === 5 ? '.....@.....' : '...........'));
const ROW = ['-------------', '|@..........|', '-------------'];

describe('the hero on a land mine', () => {
  test('KAABLAMM: damage, wounded legs, the objects there scatter, a pit she falls into', () => {
    let fell = 0;
    for (let seed = 1; seed <= 8; seed++) {
      const m = mapSetup(ROOM, { seed });
      const hero = getPlayer(m.state);
      hero.c.hp = { cur: 100, max: 100 };
      m.level.traps.push({ def: TRAP.landmine, x: 5, y: 5, seen: false });
      run(m.state, (ctx) => {
        mksobj(ctx, obj('nh:dagger'), { init: false, at: { level: 'dlvl1', x: 5, y: 5 } });
        const d = floorItems(m.state, 'nh:dagger')[0]!;
        d.c.item!.quantity = 6;
      });
      const msgs = run(m.state, (ctx) => dotrap(ctx, trapAt(m.level, 5, 5)!));
      expect(msgs[0]).toBe('KAABLAMM!!!  You triggered a land mine!');
      expect(hero.c.hp.cur).toBeLessThan(100);
      expect(hero.c.hp.cur).toBeGreaterThanOrEqual(100 - 16 - 6); // the mine and the pit
      expect(hasProp(hero, P.WOUNDED_LEGS)).toBe(true);
      const t = trapAt(m.level, 5, 5)!;
      expect(t.def).toBe(TRAP.pit);
      expect(t.seen).toBe(true);
      // daggers do not break: all six flew off along the eight lines
      const daggers = floorItems(m.state, 'nh:dagger');
      expect(total(daggers)).toBe(6);
      for (const d of daggers) {
        expect(onLine(d, 5, 5, 4)).toBe(true);
        expect(d.c.pos!.x !== 5 || d.c.pos!.y !== 5).toBe(true);
      }
      if (utrap(m.ctx)) fell++;
      else expect(msgs).toContain('You escape a pit.');
    }
    expect(fell).toBeGreaterThan(0);
  });

  test('the random trap roll gives land mines from level 6', () => {
    const m = mapSetup(['.@.']);
    const kinds = (lvl: number): Set<DefId | null> => {
      const out = new Set<DefId | null>();
      run(m.state, (ctx) => {
        for (let i = 0; i < 2000; i++) out.add(traptypeRnd(ctx, lvl));
      });
      return out;
    };
    expect(kinds(5).has(TRAP.landmine)).toBe(false);
    expect(kinds(6).has(TRAP.landmine)).toBe(true);
  });
});

describe('monsters on a land mine', () => {
  test('a heavy monster sets it off, is hurt and falls into the new pit', () => {
    const m = mapSetup(ROOM);
    const id = addMon(m.state, 'nh:hill_orc', 7, 5, { asleep: true });
    const orc = m.state.entities[String(id)]!;
    orc.c.hp = { cur: 200, max: 200 };
    m.level.traps.push({ def: TRAP.landmine, x: 7, y: 5, seen: false });
    let msgs: string[] = [];
    for (let i = 0; i < 40 && trapAt(m.level, 7, 5)?.def === TRAP.landmine; i++)
      msgs = run(m.state, (ctx) => {
        mintrap(ctx, id);
      });
    expect(msgs[0]).toBe('KAABLAMM!!!  The hill orc triggers a land mine!');
    expect(trapAt(m.level, 7, 5)?.def).toBe(TRAP.pit);
    expect(orc.c.hp.cur).toBeLessThan(200);
    expect(isMtrapped(m.ctx, id)).toBe(true);
    // no credit to the hero
    expect(getPlayer(m.state).c.experience?.points ?? 0).toBe(0);
  });

  test('a monster lighter than half an elf never does', () => {
    const m = mapSetup(ROOM);
    const id = addMon(m.state, 'nh:newt', 7, 5, { asleep: true });
    m.level.traps.push({ def: TRAP.landmine, x: 7, y: 5, seen: false });
    for (let i = 0; i < 50; i++)
      run(m.state, (ctx) => {
        mintrap(ctx, id);
      });
    expect(trapAt(m.level, 7, 5)?.def).toBe(TRAP.landmine);
  });
});

describe('boulders and land mines', () => {
  test('a pushed boulder sets one off 9 times in 10; it breaks apart or fills the pit', () => {
    let blown = 0;
    // searched seeds: in none does the blast throw the boulder back onto its old square (then
    // moverock() is 'blocked', C's `sobj_at(BOULDER, sx, sy) ? -1 : 0`) or anywhere else
    for (let seed = 37; seed <= 56; seed++) {
      const m = mapSetup(ROW, { seed });
      run(m.state, (ctx) => {
        mksobj(ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 2, y: 1 } });
      });
      m.level.traps.push({ def: TRAP.landmine, x: 3, y: 1, seen: false });
      const msgs = run(m.state, (ctx) => {
        expect(moverock(ctx, 'e')).toBe('moved');
      });
      if (msgs.includes('KAABLAMM!!  The boulder triggers a land mine.')) {
        blown++;
        expect(floorItems(m.state, BOULDER)).toEqual([]);
        const t = trapAt(m.level, 3, 1);
        // broken apart: rocks and a pit; or the boulder filled the pit it made
        if (t) {
          expect(t.def).toBe(TRAP.pit);
          expect(total(floorItems(m.state, 'nh:rock'))).toBeGreaterThan(0);
        }
      } else {
        expect(floorItems(m.state, BOULDER).map((b) => b.c.pos!.x)).toEqual([3]);
        expect(trapAt(m.level, 3, 1)?.def).toBe(TRAP.landmine);
      }
    }
    expect(blown).toBeGreaterThan(12);
  });

  test('a rolling boulder sets one off 7 times in 10: it breaks apart, the mine is gone', () => {
    let blown = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = mapSetup(ROW, { seed });
      m.level.traps.push({ def: TRAP.landmine, x: 6, y: 1, seen: false });
      run(m.state, (ctx) => {
        // east of the mine, so the boulder does not block her view of it
        mksobj(ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 10, y: 1 } });
      });
      const msgs = run(m.state, (ctx) => {
        launchObj(ctx, 10, 1, 2, 1, {});
      });
      if (msgs[0]?.startsWith('KAABLAMM!!!')) {
        blown++;
        expect(msgs[0]).toBe('KAABLAMM!!!  The rolling boulder triggers a land mine.');
        expect(trapAt(m.level, 6, 1)).toBeUndefined(); // deltrap(): no pit
        expect(floorItems(m.state, BOULDER)).toEqual([]);
        expect(total(floorItems(m.state, 'nh:rock'))).toBeGreaterThanOrEqual(7);
      } else {
        expect(floorItems(m.state, BOULDER).map((b) => b.c.pos!.x)).toEqual([2]);
      }
    }
    expect(blown).toBeGreaterThan(4);
  });
});

describe('scatter()', () => {
  test('objects fly up to blastforce squares along the eight lines; none is lost', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const m = mapSetup(ROOM, { seed });
      Object.assign(getPlayer(m.state).c.pos!, { x: 0, y: 0 });
      let moved = 0;
      run(m.state, (ctx) => {
        const id = mksobj(ctx, obj('nh:dart'), {
          init: false,
          at: { level: 'dlvl1', x: 5, y: 5 },
        });
        ctx.state.entities[String(id)]!.c.item!.quantity = 30;
        mksobj(ctx, obj('nh:dagger'), { init: false, at: { level: 'dlvl1', x: 5, y: 5 } });
        moved = scatter(ctx, 5, 5, 3, {});
      });
      const darts = floorItems(m.state, 'nh:dart');
      expect(total(darts)).toBe(30);
      expect(moved).toBe(31);
      expect(itemsAt(engine.registry, m.state, 'dlvl1', 5, 5)).toEqual([]);
      for (const e of [...darts, ...floorItems(m.state, 'nh:dagger')])
        expect(onLine(e, 5, 5, 3)).toBe(true);
    }
  });

  test('with MAY_HIT a monster in the way is hit; without it, never', () => {
    const hitSome = (mayHit: boolean): boolean => {
      for (let seed = 1; seed <= 20; seed++) {
        const m = mapSetup(ROOM, { seed });
        Object.assign(getPlayer(m.state).c.pos!, { x: 0, y: 0 });
        const molds: EntityId[] = [];
        for (const [dx, dy] of [
          [-1, -1],
          [0, -1],
          [1, -1],
          [-1, 0],
          [1, 0],
          [-1, 1],
          [0, 1],
          [1, 1],
        ] as const) {
          const id = addMon(m.state, 'nh:yellow_mold', 5 + dx, 5 + dy, { asleep: true });
          m.state.entities[String(id)]!.c.hp = { cur: 500, max: 500 };
          molds.push(id);
        }
        run(m.state, (ctx) => {
          const id = mksobj(ctx, obj('nh:dagger'), {
            init: false,
            at: { level: 'dlvl1', x: 5, y: 5 },
          });
          ctx.state.entities[String(id)]!.c.item!.quantity = 20;
          scatter(ctx, 5, 5, 4, mayHit ? { mayHit: true } : {});
        });
        if (molds.some((id) => m.state.entities[String(id)]!.c.hp!.cur < 500)) return true;
      }
      return false;
    };
    expect(hitSome(true)).toBe(true);
    expect(hitSome(false)).toBe(false);
  });

  test('with MAY_DESTROY glass breaks; with MAY_FRACTURE a boulder breaks apart', () => {
    let fractured = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const m = mapSetup(ROOM, { seed });
      const msgs = run(m.state, (ctx) => {
        mksobj(ctx, obj('nh:potion_of_water'), {
          init: false,
          at: { level: 'dlvl1', x: 3, y: 3 },
        });
        mksobj(ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 3, y: 3 } });
        scatter(ctx, 3, 3, 4, { mayDestroy: true, mayFracture: true });
      });
      if (msgs.includes('The boulder breaks apart.')) {
        fractured++;
        expect(floorItems(m.state, BOULDER)).toEqual([]);
        expect(total(floorItems(m.state, 'nh:rock'))).toBeGreaterThanOrEqual(7);
      }
      // the potion breaks unless it resists (1 in 100)
      if (floorItems(m.state, 'nh:potion_of_water').length === 0)
        expect(msgs.some((s) => s.endsWith('shatters!'))).toBe(true);
    }
    expect(fractured).toBeGreaterThan(5);
  });
});

describe('kicked coins and a bag of holding', () => {
  test('kicked coins scatter ("Thwwpingg!"), none lost', () => {
    let scattered = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = setup(['.........', '.........', '.@.......', '.........', '.........'], seed);
      const h = s.state.entities[String(s.state.playerId)]!;
      h.c.attributes = { str: 18, int: 10, wis: 10, dex: 18, con: 18, cha: 10 };
      run(s.state, (ctx) => {
        const id = mksobj(ctx, obj('nh:gold_piece'), {
          init: false,
          at: { level: 'dlvl1', x: 2, y: 2 },
        });
        ctx.state.entities[String(id)]!.c.item!.quantity = 50;
      });
      engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
      const p = s.state.pendingPrompt?.prompt;
      if (!p) throw new Error('no prompt');
      const msgs = texts(
        engine.step(s.state, { type: 'answer', promptId: p.id, value: 'e' }).events,
      );
      if (!msgs.includes('Thwwpingg!')) continue;
      scattered++;
      const coins = floorItems(s.state, 'nh:gold_piece');
      expect(total(coins)).toBe(50);
      expect(itemsAt(engine.registry, s.state, 'dlvl1', 2, 2)).toEqual([]);
      for (const e of coins) expect(onLine(e, 2, 2, 3)).toBe(true);
    }
    expect(scattered).toBeGreaterThan(5);
  });

  test("an exploding bag of holding's contents fly off her square", () => {
    let flew = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = levelSetup(ROOM, seed);
      plainKit(s.state);
      for (const k of Object.keys(s.state.entities))
        if (s.state.entities[k]?.c.monster && Number(k) !== s.state.playerId)
          delete s.state.entities[k];
      s.step({ type: 'wait' });
      const outer = s.carry('nh:bag_of_holding');
      const inner = s.carry('nh:bag_of_holding');
      const daggers = s.give('nh:dagger', { quantity: 12 });
      s.state.entities[String(daggers)]!.c.item!.containedIn = outer;
      s.state.entities[String(daggers)]!.c.item!.carriedBy = null;
      const hp = getPlayer(s.state).c.pos!;
      itemEngine.step(s.state, { type: 'mod', action: 'nh:apply', args: { item: outer } });
      let p = s.state.pendingPrompt?.prompt;
      itemEngine.stepAll(s.state, { type: 'answer', promptId: p!.id, value: 'i' as never });
      p = s.state.pendingPrompt?.prompt;
      itemEngine.stepAll(s.state, { type: 'answer', promptId: p!.id, value: [inner] as never });
      expect(s.state.entities[String(outer)]).toBeUndefined();
      const left = floorItems(s.state, 'nh:dagger');
      expect(total(left)).toBeLessThanOrEqual(12); // 1 in 13 of each part is gone
      for (const e of left) {
        expect(onLine(e, hp.x, hp.y, 4)).toBe(true);
        expect(e.c.pos!.x !== hp.x || e.c.pos!.y !== hp.y).toBe(true);
      }
      if (left.length > 0) flew++;
    }
    expect(flew).toBeGreaterThan(3);
  });
});
