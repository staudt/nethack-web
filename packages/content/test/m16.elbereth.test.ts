// m16 step 5: Elbereth. onscary()'s 5.0 rule (the hero on it, her displaced image, a level-made one
// guarding objects; the kinds that ignore it; Gehennom), monsters that flee and do not bite,
// mfndpos(), monster_nearby(), new_were()'s flight and setmangry()'s hypocrite rule.
// ref: src/monmove.c onscary(), distfleeck(); src/mon.c mfndpos(), setmangry(); src/hack.c
// monster_nearby(); src/were.c new_were()
import {
  cellRules,
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { engrAt, makeEngrAt, type EngrType } from '../src/engr';
import { monsterNearby } from '../src/eat';
import { setEshk, type Eshk } from '../src/eshk';
import { P, mfndpos, setIntrinsic, setmangry, vanillaMod } from '../src/index';
import { GEHENNOM } from '../src/levelflags';
import { setU, uState } from '../src/luck';
import { isFleeing } from '../src/monflee';
import { setMblinded } from '../src/mstate';
import { onscary } from '../src/scary';
import { setEgd, type Egd } from '../src/vaultstate';
import { newWere } from '../src/were';
import { addMon } from './helpers';
import { defs, levelSetup } from './itemHelpers';

type Setup = ReturnType<typeof levelSetup>;

/** Runs `fn` with a whole action context (query, interrupt) and returns the step's events. */
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'eb',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'eb:run',
      labelKey: 'eb',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const probeEngine = createEngine([vanillaMod, probeMod]);
const run = (s: Setup, fn: (ctx: Ctx) => void): readonly GameEvent[] => {
  probe.fn = fn;
  return probeEngine.step(s.state, { type: 'mod', action: 'eb:run' as DefId }).events;
};
const ROWS = ['.......', '...@...', '.......'];
const lvl = (s: Setup): Level => s.state.levels['dlvl1'] as Level;
const write = (s: Setup, x: number, y: number, text = 'Elbereth', type: EngrType = 'burn') =>
  makeEngrAt(s.ctx, lvl(s), x, y, text, null, 0, type);
const ent = (s: Setup, id: EntityId) => s.state.entities[String(id)]!;
const keys = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
const nearby = (s: Setup): boolean => {
  let out = false;
  run(s, (ctx) => (out = monsterNearby(ctx)));
  return out;
};

/** The hero at (3, 1) on a burned Elbereth, a hostile jackal east of her. */
function onElbereth(def: DefId = 'nh:jackal', o: { peaceful?: boolean } = {}) {
  const s = levelSetup(ROWS);
  write(s, 3, 1);
  const mon = addMon(s.state, def, 4, 1, o);
  return { s, mon };
}

const scares = (s: Setup, mon: EntityId, x = 3, y = 1, mux?: { x: number; y: number }) =>
  onscary(s.ctx, x, y, ent(s, mon), mux ? { mux } : {});

describe('onscary(): when an Elbereth scares', () => {
  test('under the hero; any case, exact, finished, not a headstone', () => {
    const { s, mon } = onElbereth();
    expect(scares(s, mon)).toBe(true);
    for (const [text, type, want] of [
      ['ELBERETH', 'dust', true],
      ['elbereth', 'mark', true],
      ['Elberet', 'burn', false],
      ['Elbereth Elbereth', 'burn', false],
      ['Elbereth', 'headstone', false],
    ] as const) {
      write(s, 3, 1, text, type);
      expect(scares(s, mon), `${text} ${type}`).toBe(want);
    }
    // still being engraved (engr_time is in the future)
    write(s, 3, 1).time = s.state.turn + 5;
    expect(scares(s, mon)).toBe(false);
  });

  test('not where the hero is not, unless it guards objects lying there', () => {
    const { s, mon } = onElbereth();
    write(s, 5, 1);
    expect(scares(s, mon, 5, 1)).toBe(false);
    write(s, 5, 1).guard = true;
    expect(scares(s, mon, 5, 1)).toBe(false); // nothing to guard
    s.give('nh:dagger', { at: { level: 'dlvl1', x: 5, y: 1 } });
    expect(scares(s, mon, 5, 1)).toBe(true);
    write(s, 5, 1); // a new one there guards nothing (des.engraving()'s default)
    expect(scares(s, mon, 5, 1)).toBe(false);
  });

  test("a Displaced hero's image carries it to where the monster thinks she is", () => {
    const s = levelSetup(ROWS);
    const mon = addMon(s.state, 'nh:jackal', 0, 0);
    write(s, 1, 1);
    expect(scares(s, mon, 1, 1, { x: 1, y: 1 })).toBe(false);
    setIntrinsic(getPlayer(s.state), P.DISPLACED, true);
    expect(scares(s, mon, 1, 1, { x: 1, y: 1 })).toBe(true);
    expect(scares(s, mon, 1, 1, { x: 2, y: 1 })).toBe(false);
  });

  test('humans, minotaurs, peacefuls, blind ones, shopkeepers and vault guards ignore it', () => {
    for (const def of ['nh:watchman', 'nh:minotaur'] as DefId[]) {
      const { s, mon } = onElbereth(def);
      expect(scares(s, mon), def).toBe(false);
    }
    const peaceful = onElbereth('nh:jackal', { peaceful: true });
    expect(scares(peaceful.s, peaceful.mon)).toBe(false);
    const blind = onElbereth();
    setMblinded(blind.s.ctx, blind.mon, 10);
    expect(scares(blind.s, blind.mon)).toBe(false);
    // a shopkeeper anywhere (here in no shop), even in another form
    const shk = onElbereth();
    setEshk(shk.s.ctx, shk.mon, { shoproom: 0, shoplevel: 'dlvl9' } as unknown as Eshk);
    expect(scares(shk.s, shk.mon)).toBe(false);
    const gd = onElbereth();
    setEgd(gd.s.ctx, gd.mon, { vroom: 0, gdlevel: 'dlvl1', fakecorr: [] } as unknown as Egd);
    expect(scares(gd.s, gd.mon)).toBe(false);
  });

  test('it has no power in Gehennom; a scroll of scare monster still has', () => {
    const { s, mon } = onElbereth();
    lvl(s).dungeon = GEHENNOM;
    expect(scares(s, mon)).toBe(false);
    s.give('nh:scroll_of_scare_monster', { at: { level: 'dlvl1', x: 3, y: 1 } });
    expect(scares(s, mon)).toBe(true);
  });
});

describe('a scared monster', () => {
  test('flees and does not bite while she stands on it', () => {
    const { s, mon } = onElbereth();
    for (let i = 0; i < 20; i++) s.step({ type: 'search' });
    expect(getPlayer(s.state).c.hp?.cur).toBe(500);
    expect(engrAt(s.ctx, lvl(s), 3, 1)?.text).toBe('Elbereth');
    expect(isFleeing(s.ctx, mon) || !ent(s, mon).c.pos).toBe(true);
  });

  test('mfndpos(): it never steps onto her square, nor onto guarded objects', () => {
    const { s, mon } = onElbereth();
    s.give('nh:dagger', { at: { level: 'dlvl1', x: 5, y: 1 } });
    write(s, 5, 1).guard = true;
    const at = (c: { x: number; y: number }[]) => c.map((p) => `${p.x},${p.y}`);
    const level = lvl(s);
    const find = (): string[] => {
      let out: string[] = [];
      run(s, (ctx) => {
        const rules = cellRules(level, defs);
        out = at(mfndpos(ctx, level, rules, mon, { x: 3, y: 1 }, { allowU: true }));
      });
      return out;
    };
    expect(find()).not.toContain('3,1');
    expect(find()).not.toContain('5,1');
    expect(find()).toContain('4,0');
    lvl(s).dungeon = GEHENNOM;
    expect(find()).toEqual(expect.arrayContaining(['3,1', '5,1']));
  });

  test('monster_nearby(): it does not interrupt her', () => {
    const { s } = onElbereth();
    expect(nearby(s)).toBe(false);
    lvl(s).dungeon = GEHENNOM;
    expect(nearby(s)).toBe(true);
  });

  test('new_were(): a werejackal turning into a jackal next to her during its move flees', () => {
    const { s, mon } = onElbereth('nh:human_werejackal');
    expect(scares(s, mon)).toBe(false); // a human ignores it
    run(s, (ctx) => newWere(ctx, ent(s, mon), { x: 3, y: 1 }));
    expect(ent(s, mon).def).toBe('nh:werejackal');
    expect(isFleeing(s.ctx, mon)).toBe(true);
    // not during its move (mcalcdistress()): no flight
    const other = onElbereth('nh:human_werejackal');
    run(other.s, (ctx) => newWere(ctx, ent(other.s, other.mon)));
    expect(ent(other.s, other.mon).def).toBe('nh:werejackal');
    expect(isFleeing(other.s.ctx, other.mon)).toBe(false);
  });
});

describe('setmangry(): attacking from an Elbereth', () => {
  test('"You feel like a hypocrite.", 5 points of alignment and the engraving is gone', () => {
    const { s, mon } = onElbereth();
    const m = ent(s, mon);
    if (m.c.hp) m.c.hp = { cur: 200, max: 200 };
    setU(s.ctx, { alignRecord: 10 });
    const r = s.step({ type: 'move', dir: 'e' });
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: 3, y: 1 }); // she fought
    expect(keys(r.events)).toEqual(expect.arrayContaining(['engr.hypocrite', 'engr.fades']));
    expect(uState(s.state).alignRecord).toBe(5);
    expect(engrAt(s.ctx, lvl(s), 3, 1)).toBeNull();
  });

  test('a low record loses 1d5; blind, no "fades"; any type goes', () => {
    const { s, mon } = onElbereth();
    write(s, 3, 1, 'Elbereth', 'headstone');
    run(s, (ctx) => setmangry(ctx, mon, true)); // a headstone is no Elbereth: nothing happens
    expect(engrAt(s.ctx, lvl(s), 3, 1)).not.toBeNull();
    write(s, 3, 1, 'Elbereth', 'burn');
    setU(s.ctx, { alignRecord: 3 });
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    const seen = keys(run(s, (ctx) => setmangry(ctx, mon, true)));
    expect(seen).toContain('engr.hypocrite');
    expect(seen).not.toContain('engr.fades');
    expect(uState(s.state).alignRecord).toBeGreaterThanOrEqual(-2);
    expect(uState(s.state).alignRecord).toBeLessThanOrEqual(2);
    expect(engrAt(s.ctx, lvl(s), 3, 1)).toBeNull();
  });

  test('a peaceful one is hypocrisy too; one that ignores it, or no attack, is not', () => {
    const peaceful = onElbereth('nh:watchman', { peaceful: true });
    run(peaceful.s, (ctx) => setmangry(ctx, peaceful.mon, true));
    expect(engrAt(peaceful.s.ctx, lvl(peaceful.s), 3, 1)).toBeNull();
    const human = onElbereth('nh:watchman');
    run(human.s, (ctx) => setmangry(ctx, human.mon, true));
    expect(engrAt(human.s.ctx, lvl(human.s), 3, 1)).not.toBeNull();
    const bump = onElbereth('nh:jackal', { peaceful: true });
    run(bump.s, (ctx) => setmangry(ctx, bump.mon, false));
    expect(engrAt(bump.s.ctx, lvl(bump.s), 3, 1)).not.toBeNull();
    expect(ent(bump.s, bump.mon).c.monster?.peaceful).toBe(false);
  });
});
