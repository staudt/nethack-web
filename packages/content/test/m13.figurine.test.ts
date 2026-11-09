// m13 step 7: figurines. Random ones are of a slightly harder monster, never a human, blessed or
// cursed 1 time in 4; they are named "figurine of a <monster>" and can be wished for; applying one
// sets it down to become a pet (blessed, mostly), a peaceful (uncursed) or a hostile (cursed)
// monster; a cursed carried one transforms on its own when its timer fires; stone to flesh
// animates one. Outcomes are asserted; rolls are searched.
import {
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { FIGURINE, FIG_TRANSFORM, figBucChanged, figTransformAt } from '../src/figurinestate';
import { addToInventory, mksobj } from '../src/items';
import { mkobj } from '../src/mkobj';
import { messagesEn } from '../src/messages.en';
import { readobjnam, wishNames } from '../src/objnam_read';
import { doname, xnameOf } from '../src/objnam';
import { stoneToFleshObj } from '../src/stoneflesh';
import { mkWished } from '../src/wish';
import { addMon } from './helpers';
import { defs, engine, levelSetup, obj, plainKit, render } from './itemHelpers';
import { vanillaMod } from '../src/index';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pt:run',
      labelKey: 'pt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, probeMod]);
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
/** Runs `fn` with the engine's own Ctx (real timers) and returns the messages. */
function run(s: { state: S['state'] }, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(s.state, { type: 'mod', action: 'pt:run' }).events);
}

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '             ',
  ' ........... ',
  ' ........... ',
  ' .....@..... ',
  ' ........... ',
  ' ........... ',
  '             ',
];

/** A lit room with no monsters, the hero at (6, 3). */
function make(seed = 1, rows = ROOM): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  }
  s.step({ type: 'wait' });
  return s;
}
const ctxOf = (s: S): Ctx => s.ctx as unknown as Ctx;
const ent = (s: S, id: EntityId): Entity => s.state.entities[String(id)]!;
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
const monsters = (s: S): Entity[] =>
  Object.values(s.state.entities).filter((e) => e.c.monster && e.id !== s.state.playerId);

/** A figurine of `mon` with the given BUC: on the floor at (x, y), or carried with `carry`. */
function figurine(
  s: S,
  mon: string,
  buc: 'blessed' | 'uncursed' | 'cursed',
  where: { carry: true } | { x: number; y: number },
): EntityId {
  let id = 0;
  run(s, (ctx) => {
    id = mksobj(ctx, obj(FIGURINE), {
      init: false,
      corpseOf: mon as DefId,
      ...('carry' in where ? {} : { at: { level: 'dlvl1', x: where.x, y: where.y } }),
    });
    ent(s, id).c.item!.buc = buc;
    // carried after the BUC is set, as a picked-up one (carry_obj_effects())
    if ('carry' in where) id = addToInventory(ctx, s.state.playerId, id);
  });
  return id;
}

describe('mksobj_init() FIGURINE', () => {
  test('random figurines: a monster that is never human, blessed or cursed 1 time in 4', () => {
    const s = make();
    let cursed = 0;
    let blessed = 0;
    const n = 400;
    for (let i = 0; i < n; i++) {
      const id = mksobj(s.ctx, obj(FIGURINE), {});
      const it = ent(s, id).c.item!;
      expect(it.corpseOf).toBeDefined();
      expect(defs.monster(it.corpseOf!).flags).not.toContain('human');
      if (it.buc === 'cursed') cursed++;
      if (it.buc === 'blessed') blessed++;
      s.ctx.remove(id);
    }
    // 1/8 each: 50 expected
    expect(cursed).toBeGreaterThan(25);
    expect(cursed).toBeLessThan(80);
    expect(blessed).toBeGreaterThan(25);
    expect(blessed).toBeLessThan(80);
  });

  test('the figurine is a tool of the random pool', () => {
    const s = make();
    let found = false;
    for (let i = 0; i < 400 && !found; i++) {
      const id = mkobj(s.ctx, 'tool', {});
      if (id !== null && ent(s, id).def === FIGURINE) found = true;
    }
    expect(found).toBe(true);
  });

  test('names: "figurine of a kitten", "uncursed figurine of an acid blob"', () => {
    const s = make();
    const k = figurine(s, 'nh:kitten', 'uncursed', { x: 2, y: 1 });
    expect(render(xnameOf(s.state, defs, ent(s, k)))).toBe('figurine of a kitten');
    const a = figurine(s, 'nh:acid_blob', 'uncursed', { x: 2, y: 1 });
    ent(s, a).c.item!.known.buc = true;
    expect(render(doname(s.state, defs, ent(s, a)))).toBe('uncursed figurine of an acid blob');
  });
});

describe('wishing for figurines', () => {
  const wish = (s: S, text: string): Entity => {
    const spec = readobjnam(text, wishNames(s.state, defs, messagesEn), { wizard: true });
    if (spec === null || spec === 'nothing') throw new Error(`no spec for ${text}`);
    return ent(s, mkWished(ctxOf(s), spec, { wizard: true })!);
  };

  test('"blessed figurine of a kitten"', () => {
    const s = make();
    const f = wish(s, 'blessed figurine of a kitten');
    expect(f.def).toBe(FIGURINE);
    expect(f.c.item!.corpseOf).toBe('nh:kitten');
    expect(f.c.item!.buc).toBe('blessed');
  });

  test('never a human or a unique: the random monster stays', () => {
    const s = make();
    for (const text of ['figurine of a human', 'figurine of a watchman']) {
      const f = wish(s, text);
      expect(f.def).toBe(FIGURINE);
      const m = defs.monster(f.c.item!.corpseOf!);
      expect(m.flags).not.toContain('human');
      expect(m.genFlags).not.toContain('uniq');
    }
  });
});

describe('use_figurine() and make_familiar()', () => {
  const apply = (s: S, id: EntityId) => s.mod('nh:apply', { item: id });

  test('Apply is offered on a carried figurine and asks for a direction', () => {
    const s = make();
    const f = figurine(s, 'nh:kitten', 'blessed', { carry: true });
    const offers = engine.query(s.state).actionsFor({ kind: 'item', id: f });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:apply')).toBe(
      true,
    );
    apply(s, f);
    expect(s.state.pendingPrompt?.prompt.kind).toBe('direction');
  });

  test('BUC decides the attitude: blessed mostly tame, uncursed mostly peaceful, cursed mostly hostile', () => {
    const tally = { blessed: [0, 0, 0], uncursed: [0, 0, 0], cursed: [0, 0, 0] };
    for (const buc of ['blessed', 'uncursed', 'cursed'] as const) {
      for (let seed = 1; seed <= 30; seed++) {
        const s = make(seed);
        const f = figurine(s, 'nh:kitten', buc, { carry: true });
        apply(s, f);
        const text = textOf(answer(s, 'e'));
        expect(text[0]).toBe('You set the figurine beside you and it transforms.');
        expect(s.state.entities[String(f)]).toBeUndefined();
        const [kitten] = monsters(s);
        expect(kitten?.def).toBe('nh:kitten');
        const m = kitten!.c.monster!;
        // the kitten is where it was set down (it has not moved yet)
        expect(kitten!.c.pos).toMatchObject({ x: 7, y: 3 });
        const i = m.tame ? 0 : m.peaceful ? 1 : 2;
        tally[buc][i]!++;
        if (i === 2 && buc === 'cursed')
          expect(text).toContain('You get a bad feeling about this.');
      }
    }
    expect(tally.blessed[0]).toBeGreaterThan(18);
    expect(tally.cursed[2]).toBeGreaterThan(18);
    // uncursed: not tamed by the BUC (peaceful as makemon() made it, a kitten is not)
    expect(tally.uncursed[0]).toBeLessThan(10);
  });

  test('set down on her own square: the monster appears next to her', () => {
    const s = make();
    const f = figurine(s, 'nh:kitten', 'blessed', { carry: true });
    apply(s, f);
    expect(textOf(answer(s, 'down'))[0]).toBe(
      'You set the figurine on the ground and it transforms.',
    );
    const [kitten] = monsters(s);
    const p = kitten!.c.pos!;
    expect(Math.max(Math.abs(p.x - 6), Math.abs(p.y - 3))).toBe(1);
  });

  test('into solid rock: refused, the figurine is kept and the move used', () => {
    const rows = ['       ', ' ..... ', ' ..@.. ', ' ..... ', '       '];
    const s = make(1, rows);
    const f = figurine(s, 'nh:kitten', 'blessed', { carry: true });
    // the hero at (3, 2); move her next to the rock at (6, 2)
    getPlayer(s.state).c.pos!.x = 5;
    const turn = s.state.turn;
    apply(s, f);
    expect(textOf(answer(s, 'e'))).toEqual(['You cannot place a figurine in solid rock!']);
    expect(s.state.entities[String(f)]).toBeDefined();
    expect(monsters(s)).toHaveLength(0);
    expect(s.state.turn).toBeGreaterThan(turn);
  });

  test('onto another monster: "The figurine writhes and then shatters into pieces!"', () => {
    const s = make();
    addMon(s.state, 'nh:newt', 7, 3, { asleep: true });
    const f = figurine(s, 'nh:kitten', 'blessed', { carry: true });
    apply(s, f);
    expect(textOf(answer(s, 'e'))).toEqual([
      'You set the figurine beside you and it transforms.',
      'The figurine writhes and then shatters into pieces!',
    ]);
    expect(s.state.entities[String(f)]).toBeUndefined();
    expect(monsters(s).map((m) => m.def)).toEqual(['nh:newt']);
  });
});

describe('the cursed figurine transforms on its own (fig_transform())', () => {
  test('its timer runs while a cursed one is carried: picked up, dropped, uncursed', () => {
    const s = make();
    const f = figurine(s, 'nh:kitten', 'cursed', { carry: true });
    const at = figTransformAt(s.state, f);
    expect(at).not.toBeNull();
    expect(at! - s.state.turn).toBeGreaterThanOrEqual(201);
    expect(at! - s.state.turn).toBeLessThanOrEqual(9200);
    // dropped: stopped (freeinv())
    s.mod('nh:drop', { item: f });
    expect(figTransformAt(s.state, f)).toBeNull();
    // uncursed ones get none
    const u = figurine(s, 'nh:kitten', 'uncursed', { carry: true });
    expect(figTransformAt(s.state, u)).toBeNull();
    // cursed while carried: curse() starts it; uncurse() stops it
    run(s, (ctx) => {
      ent(s, u).c.item!.buc = 'cursed';
      figBucChanged(ctx, u);
    });
    expect(figTransformAt(s.state, u)).not.toBeNull();
    run(s, (ctx) => {
      ent(s, u).c.item!.buc = 'uncursed';
      figBucChanged(ctx, u);
    });
    expect(figTransformAt(s.state, u)).toBeNull();
  });

  test('when it fires: "You see a kitten drop out of your pack!" and a hostile kitten next to her', () => {
    let hostile = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(seed);
      const f = figurine(s, 'nh:kitten', 'cursed', { carry: true });
      // bring the timer due now
      const t = s.state.timers.find((x) => x.kind === FIG_TRANSFORM)!;
      t.at = s.state.turn + 1;
      s.state.timers.sort((a, b) => a.at - b.at);
      let said: string[] = [];
      for (let i = 0; i < 3 && s.state.entities[String(f)]; i++)
        said = textOf(s.step({ type: 'wait' }));
      expect(s.state.entities[String(f)]).toBeUndefined();
      expect(said).toContain('You see a kitten drop out of your pack!');
      const [kitten] = monsters(s);
      expect(kitten?.def).toBe('nh:kitten');
      if (!kitten!.c.monster!.tame && !kitten!.c.monster!.peaceful) hostile++;
    }
    expect(hostile).toBeGreaterThan(5);
  });

  test('on the floor: "You see a figurine transform into a kitten!"', () => {
    const s = make();
    const f = figurine(s, 'nh:kitten', 'cursed', { x: 3, y: 1 });
    run(s, (ctx) => ctx.schedule(1, FIG_TRANSFORM, { id: f }));
    let said: string[] = [];
    for (let i = 0; i < 3 && s.state.entities[String(f)]; i++)
      said = textOf(s.step({ type: 'wait' }));
    expect(said).toContain('You see a figurine transform into a kitten!');
    expect(monsters(s)[0]?.c.pos).toMatchObject({ x: 3, y: 1 });
  });
});

describe('stone to flesh on a figurine', () => {
  test('it animates: "The figurine animates!"', () => {
    const s = make();
    const f = figurine(s, 'nh:kitten', 'uncursed', { x: 4, y: 3 });
    // obj_resists(obj, 2, 98): a seed where the figurine does not resist
    let res = 0;
    const said = run(s, (ctx) => (res = stoneToFleshObj(ctx, ent(s, f))));
    expect(res).toBe(1);
    expect(said).toEqual(['The figurine animates!']);
    expect(s.state.entities[String(f)]).toBeUndefined();
    expect(monsters(s).map((m) => [m.def, m.c.pos?.x, m.c.pos?.y])).toEqual([['nh:kitten', 4, 3]]);
  });

  test('a golem figurine becomes a flesh golem; a brown mold one (no flesh) a meatball', () => {
    const s = make();
    const g = figurine(s, 'nh:paper_golem', 'uncursed', { x: 4, y: 3 });
    let res = 0;
    const said = run(s, (ctx) => (res = stoneToFleshObj(ctx, ent(s, g))));
    expect(res).toBe(1);
    expect(said).toEqual(['The figurine turns to flesh and animates!']);
    expect(monsters(s).map((m) => m.def)).toEqual(['nh:flesh_golem']);
    const l = figurine(s, 'nh:brown_mold', 'uncursed', { x: 2, y: 1 });
    run(s, (ctx) => (res = stoneToFleshObj(ctx, ent(s, l))));
    expect(res).toBe(1);
    expect(s.state.entities[String(l)]).toBeUndefined();
    const there = Object.values(s.state.entities).filter(
      (e) => e.c.pos?.x === 2 && e.c.pos.y === 1 && e.c.item,
    );
    expect(there.map((e) => e.def)).toEqual(['nh:meatball']);
  });
});
