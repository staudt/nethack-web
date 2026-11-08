// m7e step 6: #untrap. Each floor trap kind succeeding and failing with untrap_prob() forced (a
// scripted rn2), the ammunition counts, a pinned pet helped out of a pit and a bear trap, boxes
// and doors checked and disarmed (outcomes over seeds), the refusals, the offers and the wizard
// mode wish words that tell the trap from its object.
// ref: src/trap.c dountrap(), could_untrap(), untrap_prob(), cnv_trap_obj(), move_into_trap(),
// try_disarm(), reward_untrap(), disarm_holdingtrap(), disarm_landmine(), disarm_squeaky_board(),
// disarm_shooting_trap(), try_lift(), help_monster_out(), disarm_box(), untrap_box(), untrap();
// src/objnam.c readobjnam_postparse1()
import {
  getPlayer,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
  type Rng,
  type StepResult,
  createEngine,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, T, messagesEn, readobjnam, setItimeout, vanillaMod, wishNames } from '../src/index';
import {
  boxTknown,
  doorTrapped,
  isBoxTrapped,
  setBoxTknown,
  setBoxTrapped,
  setDoorTrapped,
} from '../src/btrapstate';
import { mksobj } from '../src/items';
import { setTerrain } from '../src/terrain';
import { TRAP } from '../src/trap';
import { isMtrapped, setMtrapped, setUtrap, utrap } from '../src/trapstate';
import { BEARTRAP, LAND_MINE, UNTRAP_ID, untrap } from '../src/untrap';
import { addMon } from './helpers';
import { defs, freshState, obj, plainKit, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ut',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ut:run',
      labelKey: 'ut',
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
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(engine.step(state, { type: 'mod', action: 'ut:run' }).events);
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
function addTrap(m: M, def: DefId, x: number, y: number, seen = true): void {
  m.level.traps.push({ def, x, y, seen });
}
const trapHere = (m: M, x: number, y: number): DefId | undefined => trapAt(m.level, x, y)?.def;
const floorOf = (m: M, def: DefId, x: number, y: number): Entity[] =>
  Object.values(m.state.entities).filter(
    (e): e is Entity =>
      !!e && e.def === def && e.c.pos?.x === x && e.c.pos.y === y && e.c.item?.carriedBy === null,
  );
const qty = (es: Entity[]): number => es.reduce((n, e) => n + (e.c.item?.quantity ?? 0), 0);
const act = (m: M, args?: Record<string, unknown>): StepResult =>
  engine.stepAll(m.state, {
    type: 'mod',
    action: UNTRAP_ID,
    ...(args ? { args: args as never } : {}),
  });
const answer = (m: M, value: unknown): StepResult => {
  const p = m.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(m.state, { type: 'answer', promptId: p.id, value: value as never });
};
function boxHere(m: M, trapped: boolean): EntityId {
  const { x, y } = at(m);
  const id = mksobj(m.ctx, obj('nh:large_box'), { init: false, at: { level: 'dlvl1', x, y } });
  setBoxTrapped(m.ctx, id, trapped);
  return id;
}
const setLevel = (m: M, lvl: number): void => {
  hero(m).c.experience!.level = lvl;
};

describe('offers', () => {
  test('a seen trap next to her is offered, and #untrap on herself; nothing around: no offer', () => {
    const m = make();
    const q = engine.query(m.state);
    const ids = (o: ReturnType<typeof q.actionsFor>): unknown[] =>
      o
        .filter((x) => x.action.type === 'mod' && x.action.action === UNTRAP_ID)
        .map((x) => x.action);
    expect(ids(q.actionsFor({ kind: 'self' }))).toEqual([]);
    addTrap(m, TRAP.bear, 4, 2, false);
    expect(ids(q.actionsFor({ kind: 'cell', pos: { x: 4, y: 2 } }))).toEqual([]); // unseen
    m.level.traps[0]!.seen = true;
    expect(ids(q.actionsFor({ kind: 'cell', pos: { x: 4, y: 2 } }))).toEqual([
      { type: 'mod', action: UNTRAP_ID, args: { dir: 'e' } },
    ]);
    expect(ids(q.actionsFor({ kind: 'self' }))).toEqual([{ type: 'mod', action: UNTRAP_ID }]);
    // the label names the trap
    const o = q
      .actionsFor({ kind: 'cell', pos: { x: 4, y: 2 } })
      .find((x) => x.action.type === 'mod' && x.action.action === UNTRAP_ID);
    expect(render({ key: o!.labelKey, params: o!.params ?? {} })).toBe('Untrap the bear trap');
    // two squares away: not offered
    addTrap(m, TRAP.arrow, 5, 2);
    expect(ids(q.actionsFor({ kind: 'cell', pos: { x: 5, y: 2 } }))).toEqual([]);
  });

  test('a box at her feet: the self offer asks the direction, then about the box', () => {
    const m = make();
    boxHere(m, false);
    act(m);
    expect(m.state.pendingPrompt?.prompt.kind).toBe('direction');
    answer(m, 'self');
    const p = m.state.pendingPrompt?.prompt;
    expect(render({ key: p!.key, params: p!.params ?? {} })).toBe(
      'There is a large box here.  Check it for traps?',
    );
    const turn = m.state.turn;
    expect(texts(answer(m, true))).toEqual(['You find no traps on the large box.']);
    expect(m.state.turn).toBe(turn + 1);
  });
});

describe('floor traps', () => {
  test('an arrow trap gives 50 - rnl(50) arrows; a dart trap darts; the trap is gone', () => {
    for (const [def, ammo] of [
      [TRAP.arrow, 'nh:arrow'],
      [TRAP.dart, 'nh:dart'],
    ] as const) {
      const m = make();
      addTrap(m, def, 4, 2);
      // untrap_prob() succeeds (rn2(3) = 0), rnl(50) = 10
      const out = run(m.state, (ctx) => void untrap(scripted(ctx, [0, 10]), 'e'));
      expect(out).toEqual(['You disarm the trap.']);
      expect(trapHere(m, 4, 2)).toBeUndefined();
      expect(qty(floorOf(m, ammo, 4, 2))).toBe(40);
    }
  });

  test('a bear trap and a land mine become their objects, under her or next to her', () => {
    for (const [def, otyp, said] of [
      [TRAP.bear, BEARTRAP, 'You disarm the bear trap.'],
      [TRAP.landmine, LAND_MINE, 'You disarm the land mine.'],
    ] as const) {
      for (const dir of ['self', 'w'] as const) {
        const m = make();
        const x = dir === 'self' ? 3 : 2;
        addTrap(m, def, x, 2);
        const out = run(m.state, (ctx) => void untrap(scripted(ctx, [0]), dir));
        expect(out).toEqual([said]);
        expect(trapHere(m, x, 2)).toBeUndefined();
        expect(floorOf(m, otyp, x, 2).length).toBe(1);
        expect(at(m)).toEqual({ x: 3, y: 2 });
      }
    }
  });

  test('failing: "difficult to disarm" (rnl(5) = 0) leaves the trap and her in place', () => {
    const m = make();
    addTrap(m, TRAP.bear, 4, 2);
    const out = run(m.state, (ctx) => void untrap(scripted(ctx, [1, 0]), 'e'));
    expect(out).toEqual(['That bear trap is difficult to disarm.']);
    expect(trapHere(m, 4, 2)).toBe(TRAP.bear);
    expect(at(m)).toEqual({ x: 3, y: 2 });
    const m2 = make();
    addTrap(m2, TRAP.landmine, 3, 2);
    expect(run(m2.state, (ctx) => void untrap(scripted(ctx, [1, 0]), 'self'))).toEqual([
      'This land mine is difficult to disarm.',
    ]);
  });

  test('"Whoops...": next to it she moves onto the trap and sets it off; under her it goes off', () => {
    const m = make();
    addTrap(m, TRAP.bear, 4, 2);
    const out = run(m.state, (ctx) => void untrap(scripted(ctx, [1, 3]), 'e'));
    expect(out[0]).toBe('Whoops...');
    expect(at(m)).toEqual({ x: 4, y: 2 });
    expect(utrap(m.ctx)?.type).toBe('beartrap'); // a forced trap is never escaped
    expect(m.level.traps[0]?.seen).toBe(true);

    const m2 = make();
    addTrap(m2, TRAP.landmine, 3, 2);
    const out2 = run(m2.state, (ctx) => void untrap(scripted(ctx, [1, 3]), 'self'));
    expect(out2.slice(0, 2)).toEqual(['Whoops...', 'KAABLAMM!!!  You triggered a land mine!']);
    expect(trapHere(m2, 3, 2)).toBe(TRAP.pit);
  });

  test('an open door in the way of the move: "Fortunately, you don\'t move onto it."', () => {
    // a diagonal move out of an open door is not possible
    const m = make(['-----', '|...|', '|.@.|', '--o--', '  .  '], 1);
    setTerrain(m.level, 2, 3, T.door_open_h);
    hero(m).c.pos!.x = 2;
    hero(m).c.pos!.y = 3;
    addTrap(m, TRAP.arrow, 1, 2);
    const out = run(m.state, (ctx) => void untrap(scripted(ctx, [1, 3]), 'nw'));
    expect(out).toEqual(['Whoops...', "Fortunately, you don't move onto it."]);
    expect(at(m)).toEqual({ x: 2, y: 3 });
  });

  test('the traps that cannot be disarmed, pits, squeaky boards', () => {
    const m = make();
    addTrap(m, TRAP.tele, 4, 2);
    addTrap(m, TRAP.rolling, 2, 2);
    addTrap(m, TRAP.pit, 3, 1);
    addTrap(m, TRAP.squeaky, 3, 3);
    const turn = m.state.turn;
    expect(texts(act(m, { dir: 'e' }))).toEqual(['You cannot disable that trap.']);
    expect(texts(act(m, { dir: 'w' }))).toEqual(['You cannot disable that trap.']);
    expect(texts(act(m, { dir: 'n' }))).toEqual(['Try filling the pit instead.']);
    expect(texts(act(m, { dir: 's' }))).toEqual(["You don't have anything to untrap with."]);
    expect(texts(act(m, { dir: 'ne' }))).toEqual(['You know of no traps there.']);
    expect(m.state.turn).toBe(turn); // none of these takes time
    const m2 = make();
    addTrap(m2, TRAP.pit, 3, 2);
    expect(texts(act(m2, { dir: 'self' }))).toEqual(['You are already on the edge of the pit.']);
  });

  test('a monster on the trap is in the way; caught in one, she cannot deal with it', () => {
    const m = make();
    addTrap(m, TRAP.arrow, 4, 2);
    addMon(m.state, 'nh:newt', 4, 2, { asleep: true });
    expect(texts(act(m, { dir: 'e' }))).toEqual(['The newt is in the way.']);
    const m2 = make();
    addTrap(m2, TRAP.bear, 3, 2);
    setUtrap(m2.ctx, 4, 'beartrap');
    const turn = m2.state.turn;
    expect(texts(act(m2, { dir: 'self' }))).toEqual([
      'You cannot deal with the bear trap while trapped in it!',
    ]);
    expect(m2.state.turn).toBe(turn + 1);
  });

  test('floating, she cannot reach the floor', () => {
    const m = make();
    addTrap(m, TRAP.bear, 3, 2);
    boxHere(m, false);
    setItimeout(m.state, hero(m), P.LEVITATION, 100);
    expect(texts(act(m, { dir: 'self' }))).toEqual([
      "There are a bear trap and a container here but you can't reach them.",
    ]);
  });

  test('too strained, or a welded two-handed weapon: refused', () => {
    const m = make();
    addTrap(m, TRAP.bear, 4, 2);
    for (const e of Object.values(m.state.entities))
      if (e?.c.item?.equipped === 'weapon') e.c.item.equipped = null;
    const w = mksobj(m.ctx, obj('nh:dwarvish_mattock'), {
      init: false,
      carriedBy: m.state.playerId,
    });
    const it = m.state.entities[String(w)]!.c.item!;
    it.buc = 'cursed';
    it.equipped = 'weapon';
    expect(texts(act(m, { dir: 'e' }))).toEqual(['Your hands seem to be too busy for that.']);
    const m2 = make();
    addTrap(m2, TRAP.bear, 4, 2);
    mksobj(m2.ctx, obj('nh:boulder'), { init: false, carriedBy: m2.state.playerId });
    expect(texts(act(m2, { dir: 'e' }))).toEqual(["You're too strained to do that."]);
  });
});

describe('monsters', () => {
  /** A tame newt caught at 4,2 in a trap of kind `def`. */
  function petIn(def: DefId): { m: M; id: EntityId } {
    const m = make();
    addTrap(m, def, 4, 2);
    const id = addMon(m.state, 'nh:newt', 4, 2, { peaceful: true });
    m.state.entities[String(id)]!.c.monster!.tame = 10;
    setMtrapped(m.ctx, id, true);
    return { m, id };
  }

  test('a pet is pulled out of a pit', () => {
    const { m, id } = petIn(TRAP.pit);
    const out = run(m.state, (ctx) => void untrap(scripted(ctx, [0]), 'e'));
    expect(out.slice(0, 2)).toEqual([
      'You reach out your arms and grab the newt.',
      'You pull the newt out of the pit.',
    ]);
    expect(isMtrapped(m.ctx, id)).toBe(false);
    expect(trapHere(m, 4, 2)).toBe(TRAP.pit);
  });

  test('a pit: a monster that is not trapped, one that backs away, a sleeping one slips', () => {
    const { m, id } = petIn(TRAP.pit);
    setMtrapped(m.ctx, id, false);
    expect(run(m.state, (ctx) => void untrap(ctx, 'e'))).toEqual(["The newt isn't trapped."]);
    setMtrapped(m.ctx, id, true);
    expect(run(m.state, (ctx) => void untrap(scripted(ctx, [1]), 'e'))).toEqual([
      'You try to reach out your arms, but the newt backs away skeptically.',
    ]);
    m.state.entities[String(id)]!.c.monster!.asleep = true;
    expect(run(m.state, (ctx) => void untrap(scripted(ctx, [1]), 'e'))).toEqual([
      'You try to grab the newt, but cannot get a firm grasp.',
      'The newt awakens.',
    ]);
    expect(isMtrapped(m.ctx, id)).toBe(true);
  });

  test('a pet is extracted from a bear trap (the trap stays); failing bites it', () => {
    const { m, id } = petIn(TRAP.bear);
    const out = run(m.state, (ctx) => void untrap(scripted(ctx, [0]), 'e'));
    expect(out[0]).toBe('You extract the newt from the bear trap.');
    expect(isMtrapped(m.ctx, id)).toBe(false);
    expect(trapHere(m, 4, 2)).toBe(TRAP.bear);

    const p = petIn(TRAP.bear);
    const mon = p.m.state.entities[String(p.id)]!;
    mon.c.hp = { cur: 50, max: 50 };
    const out2 = run(p.m.state, (ctx) => void untrap(scripted(ctx, [1, 3]), 'e'));
    expect(out2[0]).toBe('Whoops...');
    expect(mon.c.hp.cur).toBeLessThan(50);
    expect(mon.c.monster?.tame).toBeLessThan(10); // abuse_dog()
    expect(isMtrapped(p.m.ctx, p.id)).toBe(true);
  });

  test('a hostile monster helped out may become grateful (peaceful)', () => {
    let grateful = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const m = make(ROOM, seed);
      addTrap(m, TRAP.pit, 4, 2);
      const id = addMon(m.state, 'nh:jackal', 4, 2);
      setMtrapped(m.ctx, id, true);
      const out = run(m.state, (ctx) => void untrap(scripted(ctx, [0]), 'e'));
      expect(out).toContain('You pull the jackal out of the pit.');
      if (out.includes('The jackal is grateful.')) {
        grateful++;
        expect(m.state.entities[String(id)]!.c.monster!.peaceful).toBe(true);
      }
    }
    expect(grateful).toBeGreaterThan(0);
  });
});

describe('boxes and doors', () => {
  test('a trapped box: found, then disarmed or set off (over seeds)', () => {
    let disarmed = 0;
    let setOff = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = make(ROOM, seed);
      setLevel(m, 30); // rn2(MAXULEV + 1 - 30) < 10: always found
      const box = boxHere(m, true);
      act(m, { dir: 'self' });
      answer(m, true); // check it for traps
      expect(boxTknown(m.state, box)).toBe(true);
      const turn = m.state.turn;
      const out = texts(answer(m, true)); // disarm it
      expect(m.state.turn).toBeGreaterThan(turn);
      if (out[0] === 'You disarm it!') {
        disarmed++;
        expect(isBoxTrapped(m.state, box)).toBe(false);
      } else {
        expect(out[0]).toBe('You set it off!');
        setOff++;
        expect(isBoxTrapped(m.state, box)).toBe(false);
      }
    }
    expect(disarmed).toBeGreaterThan(0);
    expect(setOff).toBeGreaterThan(0);
  });

  test('a box known to be trapped is offered for disarming at once; a known safe one is skipped', () => {
    const m = make();
    const box = boxHere(m, true);
    setBoxTknown(m.ctx, box, true);
    act(m, { dir: 'self' });
    expect(m.state.pendingPrompt?.prompt.key).toBe('untrap.disarm_this_q');
    expect(texts(answer(m, null))).toEqual([]); // 'q'
    const m2 = make();
    const safe = boxHere(m2, false);
    setBoxTknown(m2.ctx, safe, true);
    expect(texts(act(m2, { dir: 'self' }))).toEqual(['You know of no traps there.']);
    // declining every box: on to the (absent) door
    const m3 = make();
    boxHere(m3, false);
    act(m3, { dir: 'self' });
    expect(texts(answer(m3, false))).toEqual([
      'There are no other chests or boxes here.',
      'You know of no traps there.',
    ]);
  });

  test('a trapped door: found, then disarmed or blown up (over seeds)', () => {
    const DOOR = ['-----', '|...|', '|.@.|', '--+--', '|...|', '-----'];
    let disarmed = 0;
    let blown = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const m = make(DOOR, seed);
      setLevel(m, 30); // found when rn2(11) < 10
      setDoorTrapped(m.ctx, 'dlvl1', 2, 3, true);
      const out = texts(act(m, { dir: 's' }));
      if (out[0] !== 'You find a trap on the door!') {
        expect(out).toEqual(['You find no traps on the door.']);
        continue;
      }
      const out2 = texts(answer(m, true));
      if (out2[0] === 'You disarm it!') {
        disarmed++;
        expect(doorTrapped(m.ctx, 'dlvl1', 2, 3)).toBe(false);
        expect(m.level.palette[m.level.cells[3 * 5 + 2]!]).toBe(T.door_closed);
      } else {
        blown++;
        expect(out2.slice(0, 2)).toEqual([
          'You set it off!',
          'KABOOM!!  The door was booby-trapped!',
        ]);
        expect(m.level.palette[m.level.cells[3 * 5 + 2]!]).toBe(T.doorway);
      }
    }
    expect(disarmed).toBeGreaterThan(0);
    expect(blown).toBeGreaterThan(0);
  });

  test('doors that are open, gone or untrapped', () => {
    const m = make(['-----', '|...|', '|.@.|', '--+o-', '|...|', '-----']);
    expect(texts(act(m, { dir: 'se' }))).toEqual(['You see no door there.']);
    const turn = m.state.turn;
    // an untrapped closed door: nothing found (confusion aside), the turn is spent
    expect(texts(act(m, { dir: 's' }))).toEqual(['You find no traps on the door.']);
    expect(m.state.turn).toBe(turn + 1);
    // the door is offered directly
    const o = engine
      .query(m.state)
      .actionsFor({ kind: 'cell', pos: { x: 2, y: 3 } })
      .find((x) => x.action.type === 'mod' && x.action.action === UNTRAP_ID);
    expect(o?.action).toEqual({ type: 'mod', action: UNTRAP_ID, args: { dir: 's' } });
  });
});

describe('wizard mode wishes', () => {
  const names = wishNames(freshState(1), defs, messagesEn);
  const what = (s: string, wizard: boolean): unknown => {
    const r = readobjnam(s, names, { wizard });
    if (r === null || r === 'nothing') return r;
    const w = r.what;
    // one candidate type is that type
    return w.kind === 'types' && w.types.length === 1 ? { kind: 'type', type: w.types[0] } : w;
  };
  test('"bear trap" and "land mine" are the objects; "trapped ..." or a suffix the trap', () => {
    expect(what('bear trap', true)).toEqual({ kind: 'type', type: BEARTRAP });
    expect(what('land mine', true)).toEqual({ kind: 'type', type: LAND_MINE });
    expect(what('land mine object', true)).toEqual({ kind: 'type', type: LAND_MINE });
    expect(what('untrapped beartrap', true)).toEqual({ kind: 'type', type: BEARTRAP });
    expect(what('bear trap trap', true)).toEqual({ kind: 'wiztrap', trap: 'bear trap' });
    expect(what('trapped landmine', true)).toEqual({ kind: 'wiztrap', trap: 'land mine' });
    // not in wizard mode: the object
    expect(what('beartrap', false)).toEqual({ kind: 'type', type: BEARTRAP });
  });
});
