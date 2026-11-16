// m18 step 1: birth counts and extinction. makemon() counts every birth (`mvitals[].born`) through
// propagate(): a unique is extinct once made, a kind is extinct at its birth limit (the Nazgul 9,
// the erinyes 3, any other 120), and extinct kinds are no longer made at random (rndmonst(),
// mkclass()) though still by name; MM_NOCOUNTBIRTH callers (revival, statue traps) do not count;
// unmakemon() undoes a birth; the disclosure's "(extinct)" lines; the figurine's pile of dust;
// #wizborn.
// ref: src/makemon.c propagate(), mbirth_limit(), makemon(), unmakemon(), mkclass();
// src/insight.c list_genocided(), doborn(); src/dog.c pick_familiar_pm(); src/minion.c dprince()
import {
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Mod,
  type MonsterDef,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod, wizardMod, WIZ_BORN } from '../src/index';
import { makemon, mkclass, rndmonst } from '../src/generation';
import {
  born,
  genocidedLines,
  goneCounts,
  isExtinct,
  isGone,
  MAXMONNO,
  mbirthLimit,
  propagate,
  setGenocided,
} from '../src/vanquished';
import { unmakemon } from '../src/mondeath';
import { demonGone, dprince } from '../src/minion';
import { revive } from '../src/revive';
import { mkTrapStatue } from '../src/statue';
import { makeFamiliar } from '../src/dog';
import { mksobj } from '../src/items';
import { defs, levelSetup, obj, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ex-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ex-probe:run',
      labelKey: 'ex-probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, wizardMod, probeMod]);

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx (no time passes) and returns the message text. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'ex-probe:run' as DefId }).events);
}

const ROOM = [
  '                         ',
  ' ....................... ',
  ' ....................... ',
  ' ....................... ',
  ' ...........@........... ',
  ' ....................... ',
  ' ....................... ',
  '                         ',
];

/** A lit room with no monsters, the hero in the middle. */
function room(seed = 1): GameState {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities))
    if (s.state.entities[k]?.c.monster && Number(k) !== s.state.playerId)
      delete s.state.entities[k];
  return s.state;
}

const NAZGUL = 'nh:nazgul' as DefId;
const mon = (id: string): MonsterDef => defs.monster(id as DefId);
const monsOf = (state: GameState, def: string): Entity[] =>
  Object.values(state.entities).filter((e): e is Entity => !!e?.c.monster && e.def === def);
const totalBorn = (state: GameState): number =>
  defs.monsters.reduce((n, m) => n + born(state, m.id), 0);

/** Makes `n` of `def` by name on the room's top row (next to one another). */
function makeN(ctx: Ctx, def: string, n: number): void {
  for (let i = 0; i < n; i++) {
    const at = { x: 2 + i, y: 1 };
    expect(makemon(ctx, mon(def), at, { nogroup: true, adjacentOk: true })).not.toBeNull();
  }
}

describe('birth limits', () => {
  test('mbirth_limit(): the Nazgul 9, the erinyes 3, any other MAXMONNO', () => {
    expect(mbirthLimit(NAZGUL)).toBe(9);
    expect(mbirthLimit('nh:erinys' as DefId)).toBe(3);
    expect(mbirthLimit('nh:newt' as DefId)).toBe(MAXMONNO);
    expect(MAXMONNO).toBe(120);
  });

  test('propagate(): an erinys kind is extinct at its third birth; uncounted births do not count', () => {
    const erinys = mon('nh:erinys');
    const state = room();
    run(state, (ctx) => {
      expect(propagate(ctx, erinys, false)).toBe(true); // MM_NOCOUNTBIRTH
      expect(born(state, erinys.id)).toBe(0);
      expect(propagate(ctx, erinys, true)).toBe(true);
      expect(propagate(ctx, erinys, true)).toBe(true);
      expect(isExtinct(state, erinys.id)).toBe(false);
      expect(propagate(ctx, erinys, true)).toBe(true); // the third
      expect(born(state, erinys.id)).toBe(3);
      expect(isExtinct(state, erinys.id)).toBe(true);
      // more can still be made by name, but propagation reports them as over the limit
      expect(propagate(ctx, erinys, true)).toBe(false);
      expect(born(state, erinys.id)).toBe(4);
    });
  });

  test('a kind that is never randomly generated is not made extinct by its count', () => {
    const state = room();
    const nogen = mon('nh:shopkeeper');
    expect(nogen.genFlags).toContain('nogen');
    const n0 = born(state, nogen.id);
    run(state, (ctx) => {
      for (let i = 0; i < 130; i++) propagate(ctx, nogen, true);
    });
    expect(born(state, nogen.id)).toBe(n0 + 130);
    expect(isExtinct(state, nogen.id)).toBe(false);
    run(state, (ctx) => {
      for (let i = 0; i < 300; i++) propagate(ctx, mon('nh:newt'), true);
    });
    expect(born(state, 'nh:newt' as DefId)).toBe(255); // capped
    expect(isExtinct(state, 'nh:newt' as DefId)).toBe(true);
  });
});

describe('nine Nazgul, then none at random', () => {
  /** How many of `draws` random picks are Nazgul (class W at depth 40, any kind at depth 60). */
  function nazgulPicks(state: GameState): { cls: number; any: number } {
    const st = structuredClone(state);
    let cls = 0;
    let any = 0;
    run(st, (ctx) => {
      for (let i = 0; i < 300; i++) if (mkclass(ctx, 'W', 40)?.id === NAZGUL) cls++;
      for (let i = 0; i < 3000; i++) if (rndmonst(ctx, 60)?.id === NAZGUL) any++;
    });
    return { cls, any };
  }

  test('the ninth birth makes them extinct: mkclass() and rndmonst() pass them over', () => {
    const state = room();
    const before = nazgulPicks(state);
    expect(before.cls).toBeGreaterThan(0);
    expect(before.any).toBeGreaterThan(0);
    run(state, (ctx) => makeN(ctx, NAZGUL, 8));
    expect(born(state, NAZGUL)).toBe(8);
    expect(isExtinct(state, NAZGUL)).toBe(false);
    run(state, (ctx) => makeN(ctx, NAZGUL, 1));
    expect(born(state, NAZGUL)).toBe(9);
    expect(isExtinct(state, NAZGUL)).toBe(true);
    expect(isGone(state, NAZGUL)).toBe(true);
    expect(nazgulPicks(state)).toEqual({ cls: 0, any: 0 });
  });

  test('asked for by name (genesis), a tenth is still made', () => {
    const state = room();
    run(state, (ctx) => makeN(ctx, NAZGUL, 9));
    run(state, (ctx) => {
      expect(makemon(ctx, mon(NAZGUL), { x: 3, y: 5 }, { nogroup: true })).not.toBeNull();
    });
    expect(monsOf(state, NAZGUL)).toHaveLength(10);
    expect(born(state, NAZGUL)).toBe(10);
  });
});

describe('uniques', () => {
  test('a unique is extinct once made; dprince() then passes Orcus over', () => {
    const state = room();
    const picks = (st: GameState): Set<string> => {
      const out = new Set<string>();
      const copy = structuredClone(st);
      run(copy, (ctx) => {
        for (let i = 0; i < 200; i++) out.add(String(dprince(ctx, -1)));
      });
      return out;
    };
    expect(picks(state).has('nh:orcus')).toBe(true);
    run(state, (ctx) => makeN(ctx, 'nh:orcus', 1));
    expect(isExtinct(state, 'nh:orcus' as DefId)).toBe(true);
    // not alive anywhere and never died: only the extinct flag tells
    for (const e of monsOf(state, 'nh:orcus')) delete state.entities[String(e.id)];
    run(state, (ctx) => expect(demonGone(ctx, 'nh:orcus' as DefId)).toBe(true));
    expect(picks(state).has('nh:orcus')).toBe(false);
  });

  test('unmakemon() undoes the birth: one fewer born, a unique no longer extinct', () => {
    const state = room();
    run(state, (ctx) => {
      const n0 = born(state, 'nh:newt' as DefId);
      const id = makemon(ctx, mon('nh:newt'), { x: 2, y: 1 }, { nogroup: true })!;
      expect(born(state, 'nh:newt' as DefId)).toBe(n0 + 1);
      unmakemon(ctx, id);
      expect(born(state, 'nh:newt' as DefId)).toBe(n0);
      expect(state.entities[String(id)]).toBeUndefined();
      const orcus = makemon(ctx, mon('nh:orcus'), { x: 3, y: 1 }, { nogroup: true })!;
      expect(isExtinct(state, 'nh:orcus' as DefId)).toBe(true);
      unmakemon(ctx, orcus);
      expect(isExtinct(state, 'nh:orcus' as DefId)).toBe(false);
      expect(born(state, 'nh:orcus' as DefId)).toBe(0);
    });
  });
});

describe('MM_NOCOUNTBIRTH', () => {
  test('a revived corpse is not a birth', () => {
    const state = room();
    const hp = getPlayer(state).c.pos!;
    run(state, (ctx) => {
      const corpse = mksobj(ctx, obj('nh:corpse'), {
        init: false,
        corpseOf: 'nh:jackal' as DefId,
        at: { level: hp.level, x: hp.x + 2, y: hp.y },
      });
      const n0 = born(state, 'nh:jackal' as DefId);
      expect(revive(ctx, state.entities[String(corpse)]!, false)).not.toBeNull();
      expect(monsOf(state, 'nh:jackal')).toHaveLength(1);
      expect(born(state, 'nh:jackal' as DefId)).toBe(n0);
    });
  });

  test("a statue trap's statue monster is not a birth", () => {
    for (let seed = 1; seed <= 5; seed++) {
      const state = room(seed);
      const n0 = totalBorn(state);
      run(state, (ctx) => mkTrapStatue(ctx, state.currentLevel, 5, 3, false));
      expect(totalBorn(state)).toBe(n0);
    }
  });
});

describe('figurines', () => {
  test('a figurine of an extinct kind with a birth limit turns to dust; another kind still comes', () => {
    const state = room();
    run(state, (ctx) => makeN(ctx, NAZGUL, 9));
    const hp = getPlayer(state).c.pos!;
    const fig = (ctx: Ctx, of: string): Entity =>
      state.entities[
        String(mksobj(ctx, obj('nh:figurine'), { init: false, corpseOf: of as DefId }))
      ]!;
    let made: number | null = 0;
    const t = run(state, (ctx) => {
      made = makeFamiliar(ctx, hp.x + 1, hp.y + 1, { obj: fig(ctx, NAZGUL), quietly: false });
    });
    expect(made).toBeNull();
    expect(t).toEqual(['... into a pile of dust.']);
    // the newt's 120-birth limit is no special limit: its figurine is one way past it
    (state.modData['nh'] as { extinct?: string[] }).extinct = ['nh:nazgul', 'nh:newt'];
    run(state, (ctx) => {
      made = makeFamiliar(ctx, hp.x + 1, hp.y + 1, { obj: fig(ctx, 'nh:newt'), quietly: false });
    });
    expect(made).not.toBeNull();
  });
});

describe('the lists', () => {
  test('at game over the extinct kinds are listed with "(extinct)"; #genocided shows only genocides', () => {
    const state = room();
    run(state, (ctx) => makeN(ctx, NAZGUL, 9));
    const lines = (both: boolean): string[] =>
      genocidedLines(state, defs, both).map((m) => render(m));
    expect(lines(false)).toEqual([]);
    expect(goneCounts(state, defs, true)).toEqual({ genocided: 0, extinct: 1 });
    const l = lines(true);
    // (the test renderer has no |plural: " Nazgul (extinct)" in the game)
    expect(l[0]).toMatch(/^ .*Nazgul \(extinct\)$/);
    expect(l.slice(1)).toEqual(['', '1 species extinct.']);
    // a unique made is extinct too, but never listed
    run(state, (ctx) => makeN(ctx, 'nh:orcus', 1));
    expect(goneCounts(state, defs, true)).toEqual({ genocided: 0, extinct: 1 });
    run(state, (ctx) => setGenocided(ctx, 'nh:newt' as DefId));
    expect(goneCounts(state, defs, true)).toEqual({ genocided: 1, extinct: 1 });
    expect(lines(true).slice(-3)).toEqual(['', '1 species genocided.', '1 species extinct.']);
    expect(lines(false).slice(-2)).toEqual(['', '1 species genocided.']);
  });

  test('wiz:born lists died, born and the E/G flag for each kind seen', () => {
    const state = room();
    run(state, (ctx) => makeN(ctx, NAZGUL, 9));
    run(state, (ctx) => setGenocided(ctx, 'nh:newt' as DefId));
    const r = engine.step(state, { type: 'mod', action: WIZ_BORN as DefId });
    const list = r.events.find((e) => e.type === 'list');
    expect(list?.type === 'list' && list.titleKey).toBe('wiz.born.title');
    const items = list?.type === 'list' ? list.items.map((m) => render(m)) : [];
    expect(items[0]).toBe('died born');
    expect(items).toContain('   0    9 E Nazgul');
    expect(items).toContain(`   0 ${String(born(state, 'nh:newt' as DefId)).padStart(4)} G newt`);
    expect(items.at(-2)).toBe('');
  });
});
