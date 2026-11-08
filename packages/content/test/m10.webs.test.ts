// m10 step 2: spiders and webs. The hero stuck by Strength and getting out, monsters caught,
// pulling free (`!rn2(40)` forced), tearing, flowing through and burning webs, force-fighting,
// #untrap with and without a blade, fire, spiders spinning (the roll forced, and a free-running
// spider), random webs from level 7 with their giant spider and the room web under one.
// ref: src/trap.c trapeffect_web(), mu_maybe_destroy_web(), mintrap(), untrap_prob(),
// try_disarm(), disarm_holdingtrap(); src/hack.c trapmove(), domove_fight_web();
// src/monmove.c maybe_spin_web(); src/mklev.c traptype_rnd(), mktrap(), fill_ordinary_room();
// src/zap.c zap_over_floor()
import {
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Mod,
  type Rng,
  type Room,
  type StepResult,
  createEngine,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { zapOverFloor } from '../src/buzz';
import { mksobj } from '../src/items';
import { fillOrdinaryRoom, mktrap, traptypeRnd } from '../src/mklev';
import { mspecUsed, setMspecUsed } from '../src/mstate';
import { TRAP, dotrap, maketrap, mintrap } from '../src/trap';
import { isMtrapped, setMtrapped, setUtrap, utrap } from '../src/trapstate';
import { untrap } from '../src/untrap';
import { fightWeb, maybeSpinWeb } from '../src/web';
import { addMon } from './helpers';
import { obj, plainKit, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'web',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'web:run',
      labelKey: 'web',
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
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const texts = (r: StepResult): string[] => textsOf(r.events);
/** Runs `fn` with a real Ctx; the rendered messages. */
function run(state: M['state'], fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(engine.step(state, { type: 'mod', action: 'web:run' }).events);
}
/** A Ctx whose rn2() answers from `script` first. */
function scripted(ctx: Ctx, script: number[]): Ctx {
  const real = ctx.rng;
  const rng: Rng = {
    next: () => real.next(),
    rn2: (x) => {
      const v = script.shift();
      if (v === undefined) return real.rn2(x);
      if (v < 0 || v >= x) throw new Error(`scripted rn2(${x}) cannot be ${v}`);
      return v;
    },
    rnd: (x) => real.rnd(x),
    d: (n, s) => real.d(n, s),
  };
  return { ...ctx, rng };
}

type M = ReturnType<typeof mapSetup>;
const ROOM = ['-------', '|.....|', '|..@..|', '|.....|', '-------'];
function make(rows = ROOM, seed = 1): M {
  const m = mapSetup(rows, { seed });
  plainKit(m.state);
  getPlayer(m.state).c.hp = { cur: 500, max: 500 };
  return m;
}
const hero = (m: M): Entity => getPlayer(m.state);
const at = (m: M): { x: number; y: number } => ({ x: hero(m).c.pos!.x, y: hero(m).c.pos!.y });
function addWeb(m: M, x: number, y: number, seen = true): void {
  m.level.traps.push({ def: TRAP.web, x, y, seen });
}
const webAt = (m: M, x: number, y: number): boolean => trapAt(m.level, x, y)?.def === TRAP.web;
const setStr = (m: M, str: number): void => {
  hero(m).c.attributes!.str = str;
};
/** A hostile monster of `def` at x,y with plenty of HP (not moving: speed 0). */
function monAt(m: M, def: string, x: number, y: number): EntityId {
  const id = addMon(m.state, def, x, y);
  const e = m.state.entities[String(id)]!;
  e.c.hp = { cur: 100, max: 100 };
  e.c.actor!.speed = 0;
  return id;
}
function unwield(m: M): void {
  for (const e of Object.values(m.state.entities))
    if (e?.c.item?.carriedBy === m.state.playerId && e.c.item.equipped === 'weapon')
      e.c.item.equipped = null;
}
/** Wields a fresh object of `def`. */
function wield(m: M, def: string): EntityId {
  unwield(m);
  const id = mksobj(m.ctx, obj(def), { init: false, carriedBy: m.state.playerId });
  m.state.entities[String(id)]!.c.item!.equipped = 'weapon';
  return id;
}

describe('the hero in a web', () => {
  test('stumbling in: stuck for a time set by Strength; from 18/51 she tears through', () => {
    // [Str, lowest, highest] from trapeffect_web()
    const cases: [number, number, number][] = [
      [3, 6, 11],
      [5, 4, 9],
      [8, 4, 7],
      [11, 2, 5],
      [14, 2, 3],
      [17, 1, 2],
      [18 + 50, 1, 1],
    ];
    for (const [str, lo, hi] of cases) {
      const seen = new Set<number>();
      for (let seed = 1; seed <= 30; seed++) {
        const m = make(ROOM, seed);
        setStr(m, str);
        addWeb(m, 3, 2, false);
        const out = run(m.state, (ctx) => dotrap(ctx, trapAt(ctx.state.levels['dlvl1']!, 3, 2)!));
        expect(out).toEqual(['You stumble into a spider web!']);
        const u = utrap(m.ctx);
        expect(u?.type).toBe('web');
        seen.add(u!.n);
        expect(webAt(m, 3, 2)).toBe(true);
      }
      expect(Math.min(...seen)).toBeGreaterThanOrEqual(lo);
      expect(Math.max(...seen)).toBeLessThanOrEqual(hi);
      expect(seen.size).toBeGreaterThan(Math.min(hi - lo, 1)); // the roll varies
    }
    const m = make();
    setStr(m, 18 + 51);
    addWeb(m, 3, 2, false);
    const out = run(m.state, (ctx) => dotrap(ctx, trapAt(ctx.state.levels['dlvl1']!, 3, 2)!));
    expect(out).toEqual(['You stumble into a spider web!', 'You tear through a web!']);
    expect(utrap(m.ctx)).toBeNull();
    expect(webAt(m, 3, 2)).toBe(false);
  });

  test('each move takes one turn off: "stuck to the web" until "You disentangle yourself."', () => {
    const m = make();
    addWeb(m, 3, 2);
    setUtrap(m.ctx, 3, 'web');
    expect(texts(m.step({ type: 'move', dir: 'e' }))).toContain('You are stuck to the web.');
    expect(texts(m.step({ type: 'move', dir: 'e' }))).toContain('You are stuck to the web.');
    expect(texts(m.step({ type: 'move', dir: 'e' }))).toContain('You disentangle yourself.');
    expect(at(m)).toEqual({ x: 3, y: 2 });
    expect(utrap(m.ctx)).toBeNull();
    m.step({ type: 'move', dir: 'e' });
    expect(at(m)).toEqual({ x: 4, y: 2 });
    expect(webAt(m, 3, 2)).toBe(true);
  });

  test('a seen web asks "Really step into that web?"; walking in sticks her', () => {
    const m = make();
    addWeb(m, 4, 2);
    m.step({ type: 'move', dir: 'e' });
    expect(m.state.pendingPrompt?.prompt.key).toBe('trap.confirm_into');
  });
});

describe('monsters in webs', () => {
  test('a jackal is caught; it pulls free on !rn2(40)', () => {
    const m = make();
    addWeb(m, 4, 2, false);
    const id = monAt(m, 'nh:jackal', 4, 2);
    expect(run(m.state, (ctx) => void mintrap(ctx, id))).toEqual([
      'The jackal is caught in a spider web.',
    ]);
    expect(isMtrapped(m.ctx, id)).toBe(true);
    expect(trapAt(m.level, 4, 2)?.seen).toBe(true);
    run(m.state, (ctx) => void mintrap(scripted(ctx, [1]), id));
    expect(isMtrapped(m.ctx, id)).toBe(true);
    expect(run(m.state, (ctx) => void mintrap(scripted(ctx, [0]), id))).toEqual([
      'The jackal pulls free of the web.',
    ]);
    expect(isMtrapped(m.ctx, id)).toBe(false);
    expect(webAt(m, 4, 2)).toBe(true);
  });

  test('a purple worm tears through; a fog cloud flows through; an acid blob dissolves it', () => {
    const m = make();
    addWeb(m, 4, 2);
    const worm = monAt(m, 'nh:purple_worm', 4, 2);
    expect(run(m.state, (ctx) => void mintrap(ctx, worm, { force: true }))).toEqual([
      'The purple worm tears through a spider web!',
    ]);
    expect(isMtrapped(m.ctx, worm)).toBe(false);
    expect(webAt(m, 4, 2)).toBe(false);

    const m2 = make();
    addWeb(m2, 4, 2);
    const fog = monAt(m2, 'nh:fog_cloud', 4, 2);
    expect(run(m2.state, (ctx) => void mintrap(ctx, fog, { force: true }))).toEqual([
      'The fog cloud flows through a spider web.',
    ]);
    expect(isMtrapped(m2.ctx, fog)).toBe(false);
    expect(webAt(m2, 4, 2)).toBe(true);

    const m3 = make();
    addWeb(m3, 4, 2);
    const blob = monAt(m3, 'nh:acid_blob', 4, 2);
    expect(run(m3.state, (ctx) => void mintrap(ctx, blob, { force: true }))).toEqual([
      'The acid blob dissolves a spider web!',
    ]);
    expect(webAt(m3, 4, 2)).toBe(false);
  });

  test('spiders walk webs freely, and do not avoid them', () => {
    const m = make();
    addWeb(m, 4, 2);
    const id = monAt(m, 'nh:giant_spider', 4, 2);
    expect(run(m.state, (ctx) => void mintrap(ctx, id, { force: true }))).toEqual([]);
    expect(isMtrapped(m.ctx, id)).toBe(false);
    expect(webAt(m, 4, 2)).toBe(true);
  });
});

describe('getting rid of webs', () => {
  test('force-fighting: a blade cuts through or hacks (roll forced), bare hands punch or thrash', () => {
    const m = make();
    setStr(m, 10); // acurrstr() 10: a +0 dagger at Basic cuts on rn2(20) <= 8
    addWeb(m, 4, 2);
    wield(m, 'nh:dagger');
    const lvl = (ctx: Ctx) => ctx.state.levels['dlvl1']!;
    expect(run(m.state, (ctx) => void fightWeb(scripted(ctx, [19]), lvl(ctx), 4, 2))).toEqual([
      'You hack ineffectually at some of the strands.',
    ]);
    expect(webAt(m, 4, 2)).toBe(true);
    expect(run(m.state, (ctx) => void fightWeb(scripted(ctx, [0]), lvl(ctx), 4, 2))).toEqual([
      'You cut through the web.',
    ]);
    expect(webAt(m, 4, 2)).toBe(false);

    const m2 = make();
    addWeb(m2, 4, 2);
    unwield(m2);
    expect(run(m2.state, (ctx) => void fightWeb(scripted(ctx, [30]), lvl(ctx), 4, 2))).toEqual([
      'You thrash ineffectually at some of the strands.',
    ]);
    expect(run(m2.state, (ctx) => void fightWeb(scripted(ctx, [0]), lvl(ctx), 4, 2))).toEqual([
      'You punch through the web.',
    ]);
    expect(webAt(m2, 4, 2)).toBe(false);
    // an unseen web is not fought
    addWeb(m2, 4, 2, false);
    expect(run(m2.state, (ctx) => void fightWeb(ctx, lvl(ctx), 4, 2))).toEqual([]);
  });

  test('the F action: a club cannot cut a web; a dagger gets through in the end', () => {
    const m = make();
    addWeb(m, 4, 2);
    wield(m, 'nh:club');
    expect(texts(m.step({ type: 'mod', action: 'nh:fight', args: { dir: 'e' } }))).toEqual([
      "You can't cut a web with a club!",
    ]);
    expect(webAt(m, 4, 2)).toBe(true);
    wield(m, 'nh:dagger');
    for (let i = 0; i < 100 && webAt(m, 4, 2); i++)
      m.step({ type: 'mod', action: 'nh:fight', args: { dir: 'e' } });
    expect(webAt(m, 4, 2)).toBe(false);
    expect(at(m)).toEqual({ x: 3, y: 2 });
  });

  test('a seen web next to her is offered to fight', () => {
    const m = make();
    addWeb(m, 4, 2);
    const offers = engine.query(m.state).actionsFor({ kind: 'cell', pos: { x: 4, y: 2 } });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:fight')).toBe(
      true,
    );
  });

  test('#untrap: a blade cuts through the web, bare hands remove it (untrap_prob forced)', () => {
    const m = make();
    addWeb(m, 4, 2);
    wield(m, 'nh:dagger');
    expect(run(m.state, (ctx) => void untrap(scripted(ctx, [0]), 'e'))).toEqual([
      'You cut through the web.',
    ]);
    expect(webAt(m, 4, 2)).toBe(false);

    const m2 = make();
    addWeb(m2, 4, 2);
    unwield(m2);
    expect(run(m2.state, (ctx) => void untrap(scripted(ctx, [0]), 'e'))).toEqual([
      'You succeed in removing the web.',
    ]);
    expect(webAt(m2, 4, 2)).toBe(false);

    const m3 = make();
    addWeb(m3, 4, 2);
    expect(run(m3.state, (ctx) => void untrap(scripted(ctx, [1, 0]), 'e'))).toEqual([
      'That web is difficult to remove.',
    ]);
    expect(webAt(m3, 4, 2)).toBe(true);
  });

  test('#untrap: a monster caught in a web is extracted; "Whoops..." may catch her too', () => {
    const m = make();
    addWeb(m, 4, 2);
    const id = monAt(m, 'nh:jackal', 4, 2);
    setMtrapped(m.ctx, id, true);
    expect(run(m.state, (ctx) => void untrap(scripted(ctx, [0]), 'e'))[0]).toBe(
      'You extract the jackal from the web.',
    );
    expect(isMtrapped(m.ctx, id)).toBe(false);
    expect(webAt(m, 4, 2)).toBe(true);

    const m2 = make();
    addWeb(m2, 4, 2);
    const id2 = monAt(m2, 'nh:jackal', 4, 2);
    setMtrapped(m2.ctx, id2, true);
    // untrap_prob fails (1), rnl(5) = 3: "Whoops...", rn2(3) = 0: the web spreads to her
    const out = run(m2.state, (ctx) => void untrap(scripted(ctx, [1, 3, 0]), 'e'));
    expect(out).toEqual([
      'Whoops...',
      "The web sticks to you.  You're caught too!",
      'The jackal remains entangled.',
    ]);
    expect(webAt(m2, 3, 2)).toBe(true);
    expect(utrap(m2.ctx)?.type).toBe('web');
  });

  test('a thrown dagger gets stuck in a web on its way 1 time in 3', () => {
    let stuck = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const m = make(ROOM, seed);
      addWeb(m, 4, 2);
      const id = mksobj(m.ctx, obj('nh:dagger'), { init: false, carriedBy: m.state.playerId });
      m.step({ type: 'mod', action: 'nh:throw', args: { item: id } });
      const p = m.state.pendingPrompt?.prompt;
      if (!p) throw new Error('no direction prompt');
      const r = texts(m.step({ type: 'answer', promptId: p.id, value: 'e' as never }));
      const daggerAt = (x: number): boolean =>
        Object.values(m.state.entities).some(
          (e) =>
            e?.def === 'nh:dagger' &&
            e.c.item?.carriedBy === null &&
            e.c.pos?.x === x &&
            e.c.pos.y === 2,
        );
      if (r.includes('The dagger gets stuck in a web!')) {
        stuck++;
        expect(daggerAt(4)).toBe(true);
      } else expect(daggerAt(4)).toBe(false); // flew on
    }
    expect(stuck).toBeGreaterThan(3);
    expect(stuck).toBeLessThan(20);
  });

  test('fire over a web burns it and lets go whoever it held', () => {
    const m = make();
    addWeb(m, 4, 2);
    const id = monAt(m, 'nh:jackal', 4, 2);
    setMtrapped(m.ctx, id, true);
    addWeb(m, 3, 2);
    setUtrap(m.ctx, 4, 'web');
    const out = run(m.state, (ctx) => {
      zapOverFloor(ctx, 'fire', 4, 2);
      zapOverFloor(ctx, 'fire', 3, 2);
    });
    expect(out).toEqual(['A web bursts into flames!', 'A web bursts into flames!']);
    expect(webAt(m, 4, 2)).toBe(false);
    expect(webAt(m, 3, 2)).toBe(false);
    expect(isMtrapped(m.ctx, id)).toBe(false);
    expect(utrap(m.ctx)).toBeNull();
    // cold does nothing to a web
    addWeb(m, 4, 2);
    run(m.state, (ctx) => void zapOverFloor(ctx, 'cold', 4, 2));
    expect(webAt(m, 4, 2)).toBe(true);
  });
});

describe('spiders spinning webs', () => {
  test('a giant spider in a corner: rn2(1000) < 15 * (2 + 1); then d(4, 4) turns of rest', () => {
    const m = make();
    const id = monAt(m, 'nh:giant_spider', 1, 1); // two walls next to it
    const spider = (): Entity => m.state.entities[String(id)]!;
    expect(run(m.state, (ctx) => maybeSpinWeb(scripted(ctx, [45]), spider()))).toEqual([]);
    expect(webAt(m, 1, 1)).toBe(false);
    expect(run(m.state, (ctx) => maybeSpinWeb(scripted(ctx, [44]), spider()))).toEqual([
      'The giant spider spins a web.',
    ]);
    expect(webAt(m, 1, 1)).toBe(true);
    expect(trapAt(m.level, 1, 1)?.seen).toBe(true);
    const rest = mspecUsed(m.ctx, id);
    expect(rest).toBeGreaterThanOrEqual(4);
    expect(rest).toBeLessThanOrEqual(16);
    // not on a trap, and not while resting
    m.state.entities[String(id)]!.c.pos!.x = 2;
    run(m.state, (ctx) => maybeSpinWeb(scripted(ctx, [0]), spider()));
    expect(webAt(m, 2, 1)).toBe(false);
    setMspecUsed(m.ctx, id, 0);
    // a cave spider in the open: 5 * 1, less 3 for the web already there
    const cave = monAt(m, 'nh:cave_spider', 3, 3);
    m.state.entities[String(cave)]!.c.pos!.y = 2;
    m.state.entities[String(cave)]!.c.pos!.x = 4;
    const caveE = (): Entity => m.state.entities[String(cave)]!;
    // one wall-free square (4, 2) in a 5x3 room: 0 walls -> prob 5 - 3 = 2
    run(m.state, (ctx) => maybeSpinWeb(scripted(ctx, [2]), caveE()));
    expect(webAt(m, 4, 2)).toBe(false);
    run(m.state, (ctx) => maybeSpinWeb(scripted(ctx, [1]), caveE()));
    expect(webAt(m, 4, 2)).toBe(true);
  });

  test('a wandering giant spider spins webs as it moves', () => {
    const m = make(['---------', '|.......|', '|.......|', '|..@....|', '|.......|', '---------']);
    const id = addMon(m.state, 'nh:giant_spider', 6, 1, { peaceful: true });
    m.state.entities[String(id)]!.c.hp = { cur: 100, max: 100 };
    for (let i = 0; i < 300 && !m.level.traps.some((t) => t.def === TRAP.web); i++)
      m.step({ type: 'wait' });
    expect(m.level.traps.some((t) => t.def === TRAP.web)).toBe(true);
  });
});

describe('random webs', () => {
  test('traptype_rnd(): webs from level 7 (any level with no spider on them)', () => {
    const m = make();
    const kinds = (lvl: number, noSpider = false): Set<DefId | null> => {
      const s = new Set<DefId | null>();
      run(m.state, (ctx) => {
        for (let i = 0; i < 3000; i++) s.add(traptypeRnd(ctx, lvl, false, noSpider));
      });
      return s;
    };
    expect(kinds(6).has(TRAP.web)).toBe(false);
    expect(kinds(7).has(TRAP.web)).toBe(true);
    expect(kinds(1, true).has(TRAP.web)).toBe(true);
  });

  test('mktrap(): a web gets a giant spider (with its level object)', () => {
    const m = make();
    run(m.state, (ctx) => mktrap(ctx, ctx.state.levels['dlvl1']!, { x: 4, y: 2 }, TRAP.web));
    expect(webAt(m, 4, 2)).toBe(true);
    const here = Object.values(m.state.entities).filter(
      (e) => e?.c.pos?.x === 4 && e.c.pos.y === 2 && e.c.pos.level === 'dlvl1',
    );
    expect(here.some((e) => e?.def === 'nh:giant_spider')).toBe(true);
    expect(here.some((e) => e?.c.item)).toBe(true); // makemon() S_SPIDER in_mklev
  });

  test('fill_ordinary_room(): the room monster, a giant spider, gets a web under it', () => {
    // somexy() may pick her own square (no monster there): search a seed where one is made
    let found = false;
    for (let seed = 1; seed <= 30 && !found; seed++) {
      const m = make(
        ['---------', '|.......|', '|.......|', '|..@....|', '|.......|', '---------'],
        seed,
      );
      m.level.depth = 14; // giant spiders (difficulty 7) in rndmonst()'s window
      const room: Room = { lx: 1, ly: 1, hx: 7, hy: 4, lit: true };
      m.level.rooms.push(room);
      run(m.state, (ctx) => {
        // only the giant spider can be picked
        const defs = Object.create(ctx.defs, {
          monsters: { value: [ctx.defs.monster('nh:giant_spider')] },
        }) as Ctx['defs'];
        fillOrdinaryRoom(scripted({ ...ctx, defs }, [0]), ctx.state.levels['dlvl1']!, room);
      });
      const spider = Object.values(m.state.entities).find((e) => e?.def === 'nh:giant_spider');
      if (!spider) continue;
      found = true;
      const p = spider.c.pos!;
      expect(webAt(m, p.x, p.y)).toBe(true);
    }
    expect(found).toBe(true);
  });

  test('maketrap() over a web lets her go only for another kind', () => {
    const m = make();
    addWeb(m, 3, 2);
    setUtrap(m.ctx, 3, 'web');
    run(m.state, (ctx) => void maketrap(ctx, 'dlvl1', 3, 2, TRAP.web));
    expect(utrap(m.ctx)?.type).toBe('web');
    run(m.state, (ctx) => void maketrap(ctx, 'dlvl1', 3, 2, TRAP.pit));
    expect(utrap(m.ctx)).toBeNull();
  });
});
