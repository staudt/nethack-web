// m7e step 2: dwarves dig (wielding a pick first, tunnelling through rock and walls, breaking
// doors, never through non-diggable walls), pits dug from inside a pit with the wand of digging,
// the pick clearing the debris between two pits, walking between conjoined pits, and a filled
// pit losing its links. Outcomes are asserted on pinned monsters and forced terrain.
// ref: src/dig.c mdig_tunnel(), zap_dig(), adj_pit_checks(), use_pick_axe2(); src/monmove.c
// m_digweapon_check(), m_move(), postmov(); src/mon.c mfndpos(); src/trap.c conjoined_pits(),
// clear_conjoined_pits(), trapeffect_pit(); src/hack.c trapmove()
import {
  cellRules,
  createEngine,
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, vanillaMod } from '../src/index';
import { BOULDER } from '../src/boulder';
import { zapDig } from '../src/dig';
import { boulderFlooreffects } from '../src/flooreffects';
import { mksobj } from '../src/items';
import { mDigweaponCheck, mdigTunnel } from '../src/mdig';
import { mfndpos } from '../src/monmove';
import { monWep } from '../src/mongear';
import { setTerrain } from '../src/terrain';
import { TRAP, deltrap } from '../src/trap';
import { conjoinedOf, conjoinedPits, joinPits, setUtrap, utrap, xytodir } from '../src/trapstate';
import { addMon } from './helpers';
import { ctxFor, obj, render } from './itemHelpers';
import { mapSetup } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'md',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'md:run',
      labelKey: 'md',
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
/** Runs `fn` with a real Ctx, no time passing; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'md:run' }).events);
}
const cellOf = (level: Level, x: number, y: number): DefId | undefined =>
  level.palette[level.cells[y * level.width + x] ?? -1];
const ent = (state: GameState, id: EntityId): Entity => state.entities[String(id)]!;

/** Gives the monster an uncursed object of kind `otyp`. */
function give(state: GameState, mon: EntityId, otyp: string): EntityId {
  const id = mksobj(ctxFor(state), obj(otyp), { init: false, carriedBy: mon });
  ent(state, id).c.item!.buc = 'uncursed';
  return id;
}

/** A hostile, awake dwarf at (x, y) carrying the given objects. */
function dwarf(state: GameState, x: number, y: number, gear: string[], peaceful = false) {
  const id = addMon(state, 'nh:dwarf', x, y, { peaceful });
  ent(state, id).c.hp = { cur: 40, max: 40 };
  for (const g of gear) give(state, id, g);
  return id;
}

/** The hero in a seen pit at her square. */
function inPit(m: ReturnType<typeof mapSetup>): void {
  const h = getPlayer(m.state).c.pos!;
  m.level.traps.push({ def: TRAP.pit, x: h.x, y: h.y, seen: true });
  setUtrap({ state: m.state }, 5, 'pit');
}

// ---------------------------------------------------------------------------------------------

describe('dwarves dig', () => {
  test('a dwarf with a pick tunnels through rock and a room wall to the hero', () => {
    const m = mapSetup([
      '-----          ',
      '|...|          ',
      '|.@.|         .',
      '|...|          ',
      '-----          ',
    ]);
    getPlayer(m.state).c.hp = { cur: 999, max: 999 };
    const d = dwarf(m.state, 14, 2, ['nh:pick_axe']);
    let adjacent = false;
    for (let i = 0; i < 200 && !adjacent; i++) {
      m.step({ type: 'wait' });
      const p = ent(m.state, d).c.pos!;
      // never left standing in rock
      expect(engine.registry.terrain(cellOf(m.level, p.x, p.y)!).passable).toBe(true);
      adjacent = Math.max(Math.abs(p.x - 2), Math.abs(p.y - 2)) === 1;
    }
    expect(adjacent).toBe(true);
    expect(monWep(m.ctx, d)?.def).toBe('nh:pick_axe');
    // the room wall it came through is an opening, the rock behind it a corridor
    const row = [5, 6, 7, 8, 9, 10, 11, 12, 13].map((x) => cellOf(m.level, x, 2));
    expect(row.every((c) => c === T.corr)).toBe(true);
    expect(cellOf(m.level, 4, 2)).toBe(T.doorway);
  });

  test('a hostile dwarf next to the hero does not dig toward her', () => {
    const m = mapSetup(['.    ', '     ', '..@  ']);
    const d = dwarf(m.state, 0, 0, ['nh:pick_axe']);
    run(m.state, (ctx) => {
      const c = mfndpos(ctx, m.level, cellRules(m.level, ctx.defs), d, { x: 2, y: 2 }, {});
      expect(c.map((x) => `${x.x},${x.y}`)).toEqual([]); // rock all round, no ALLOW_DIG asked
      const dig = mfndpos(
        ctx,
        m.level,
        cellRules(m.level, ctx.defs),
        d,
        { x: 2, y: 2 },
        {
          allowDig: true,
        },
      );
      expect(dig.map((x) => `${x.x},${x.y}`)).toEqual(['0,1', '1,0', '1,1']);
    });
  });

  test('wields the pick before digging, the move spent; a mattock only without a shield', () => {
    const m = mapSetup(['.  ']);
    const d = dwarf(m.state, 0, 0, ['nh:dagger', 'nh:pick_axe']);
    const dagger = inventoryOf(m.state, d).find((o) => o.def === 'nh:dagger')!;
    dagger.c.item!.equipped = 'weapon';
    run(m.state, (ctx) => {
      expect(mDigweaponCheck(ctx, ent(m.state, d), 1, 0)).toBe(true);
      expect(monWep(ctx, d)?.def).toBe('nh:pick_axe');
      expect(mDigweaponCheck(ctx, ent(m.state, d), 1, 0)).toBe(false); // already wielding one
    });
    const s = mapSetup(['.  ']);
    const d2 = dwarf(s.state, 0, 0, ['nh:dwarvish_mattock', 'nh:small_shield']);
    const shield = inventoryOf(s.state, d2).find((o) => o.def === 'nh:small_shield')!;
    shield.c.item!.equipped = 'shield';
    run(s.state, (ctx) => {
      expect(mDigweaponCheck(ctx, ent(s.state, d2), 1, 0)).toBe(false);
      shield.c.item!.equipped = null;
      expect(mDigweaponCheck(ctx, ent(s.state, d2), 1, 0)).toBe(true);
      expect(monWep(ctx, d2)?.def).toBe('nh:dwarvish_mattock');
    });
  });

  test('a cursed weapon in its hands: no switching to dig', () => {
    const m = mapSetup(['.  ']);
    const d = dwarf(m.state, 0, 0, ['nh:dagger', 'nh:pick_axe']);
    const dagger = inventoryOf(m.state, d).find((o) => o.def === 'nh:dagger')!;
    dagger.c.item!.equipped = 'weapon';
    dagger.c.item!.buc = 'cursed';
    run(m.state, (ctx) => {
      expect(mDigweaponCheck(ctx, ent(m.state, d), 1, 0)).toBe(false);
      expect(monWep(ctx, d)?.def).toBe('nh:dagger');
    });
  });

  test('no digging into Sokoban walls or without a pick', () => {
    const m = mapSetup(['-----', '|...|', '|..@|', '-----']);
    const d = dwarf(m.state, 1, 1, ['nh:pick_axe']);
    const opts = { allowDig: true };
    const far = { x: 30, y: 30 };
    const walls = (): string[] => {
      let out: string[] = [];
      run(m.state, (ctx) => {
        out = mfndpos(ctx, m.level, cellRules(m.level, ctx.defs), d, far, opts)
          .filter((c) => c.x === 0 || c.y === 0)
          .map((c) => `${c.x},${c.y}`);
      });
      return out;
    };
    expect(walls()).toEqual(['0,0', '0,1', '0,2', '1,0', '2,0']);
    m.level.def = 'nh:soko1-1' as DefId; // non-diggable everywhere
    expect(walls()).toEqual([]);
    delete (m.level as { def?: DefId }).def;
    for (const o of inventoryOf(m.state, d)) delete m.state.entities[String(o.id)];
    expect(walls()).toEqual([]);
  });

  test('the square it steps into gives way', () => {
    const m = mapSetup(['     ', '|....', '     ']);
    const d = dwarf(m.state, 1, 2, []);
    const at = (x: number, y: number, id: DefId): string[] => {
      setTerrain(m.level, x, y, id);
      Object.assign(ent(m.state, d).c.pos!, { x, y });
      return run(m.state, (ctx) => {
        expect(mdigTunnel(ctx, ent(m.state, d))).toBe(false);
      });
    };
    expect(at(0, 2, T.scorr)).toContain('You feel a draft.');
    expect(cellOf(m.level, 0, 2)).toBe(T.corr);
    at(1, 2, T.sdoor_v);
    expect(cellOf(m.level, 1, 2)).toBe(T.doorway);
    at(2, 2, T.door_locked);
    expect(cellOf(m.level, 2, 2)).toBe(T.doorway);
    at(0, 1, T.vwall);
    expect(cellOf(m.level, 0, 1)).toBe(T.doorway);
    at(3, 2, T.tree);
    expect(cellOf(m.level, 3, 2)).toBe(T.floor);
    // rock: a corridor, and over many squares sometimes a rock or a boulder (4 in 12)
    let left = 0;
    for (let i = 0; i < 40; i++) {
      const x = i % 5;
      at(x, 0, T.stone);
      expect(cellOf(m.level, x, 0)).toBe(T.corr);
    }
    for (const id of Object.keys(m.state.entities)) {
      const e = m.state.entities[id]!;
      if ((e.def === BOULDER || e.def === 'nh:rock') && e.c.pos?.y === 0) left++;
    }
    expect(left).toBeGreaterThan(0);
    // a cavernous level: a wall becomes corridor
    m.level.def = 'nh:minefill' as DefId;
    at(4, 1, T.vwall);
    expect(cellOf(m.level, 4, 1)).toBe(T.corr);
  });

  test('a tunneller far from the hero breaks the door it steps onto instead of opening it', () => {
    const m = mapSetup(['-----------', '|.........+.', '-----------']);
    getPlayer(m.state).c.hp = { cur: 999, max: 999 };
    Object.assign(getPlayer(m.state).c.pos!, { x: 1, y: 1 });
    const d = dwarf(m.state, 11, 1, []);
    for (let i = 0; i < 10 && ent(m.state, d).c.pos!.x > 9; i++) m.step({ type: 'wait' });
    expect(ent(m.state, d).c.pos!.x).toBeLessThanOrEqual(10);
    expect(cellOf(m.level, 10, 1)).toBe(T.doorway);
  });
});

describe('pits from inside a pit', () => {
  test('the wand of digging digs one adjacent pit and conjoins the two', () => {
    const m = mapSetup(['.....']);
    Object.assign(getPlayer(m.state).c.pos!, { x: 1, y: 0 });
    inPit(m);
    const text = run(m.state, (ctx) => zapDig(ctx, 'e'));
    expect(text).toContain('You dig an adjacent pit.');
    const a = trapAt(m.level, 1, 0)!;
    const b = trapAt(m.level, 2, 0)!;
    expect(b.def).toBe(TRAP.pit);
    expect(trapAt(m.level, 3, 0)).toBeUndefined(); // only the adjacent square
    expect(conjoinedPits({ state: m.state }, a, b, false)).toBe(true);
    expect(conjoinedOf(a)).toBe(1 << xytodir(1, 0));
    // zapping again that way: the conjoined pit is passed over and the square beyond gets one
    // (C's loop goes on past a conjoined pit)
    run(m.state, (ctx) => zapDig(ctx, 'e'));
    expect(trapAt(m.level, 3, 0)?.def).toBe(TRAP.pit);
    expect(trapAt(m.level, 4, 0)).toBeUndefined();
  });

  test('into rock it makes a corridor pit; walls and the like refuse', () => {
    const m = mapSetup([' . ', '|@-', ' . ']);
    inPit(m);
    expect(run(m.state, (ctx) => zapDig(ctx, 'n'))).toContain('You dig an adjacent pit.');
    expect(cellOf(m.level, 1, 0)).toBe(T.floor);
    run(m.state, (ctx) => zapDig(ctx, 'nw'));
    expect(cellOf(m.level, 0, 0)).toBe(T.corr);
    expect(trapAt(m.level, 0, 0)?.def).toBe(TRAP.pit);
    expect(run(m.state, (ctx) => zapDig(ctx, 'w'))).toContain(
      'The foundation is too hard to dig through from this angle.',
    );
    expect(cellOf(m.level, 0, 1)).toBe(T.vwall);
    expect(trapAt(m.level, 0, 1)).toBeUndefined();
    m.level.def = 'nh:soko1-1' as DefId;
    expect(run(m.state, (ctx) => zapDig(ctx, 'sw'))).toContain('The rock glows then fades.');
    expect(trapAt(m.level, 0, 2)).toBeUndefined();
  });

  test('the pick clears the debris between her pit and the next', () => {
    const m = mapSetup(['....']);
    Object.assign(getPlayer(m.state).c.pos!, { x: 1, y: 0 });
    inPit(m);
    m.level.traps.push({ def: TRAP.pit, x: 2, y: 0, seen: true });
    for (const o of inventoryOf(m.state, m.state.playerId))
      if (o.c.item?.equipped === 'weapon') o.c.item.equipped = null;
    const p = mksobj(m.ctx, obj('nh:pick_axe'), { init: false, carriedBy: m.state.playerId });
    ent(m.state, p).c.item!.equipped = 'weapon';
    ent(m.state, p).c.item!.buc = 'uncursed';
    const swing = (dir: string): string[] => {
      const r = engine.step(m.state, {
        type: 'mod',
        action: 'nh:dig' as DefId,
        args: { item: p, dir },
      });
      return texts(r.events);
    };
    expect(swing('e')).toContain('You clear some debris from between the pits.');
    expect(
      conjoinedPits({ state: m.state }, trapAt(m.level, 1, 0), trapAt(m.level, 2, 0), false),
    ).toBe(true);
    expect(swing('w')).toContain('You swing your pick-axe, but the rubble has no place to go.');
  });
});

describe('conjoined pits', () => {
  /** The hero in a pit at (1, 0), a seen pit at (2, 0) (conjoined when asked). */
  function twoPits(seed: number, conjoined: boolean) {
    const m = mapSetup(['....'], { seed });
    Object.assign(getPlayer(m.state).c.pos!, { x: 1, y: 0 });
    getPlayer(m.state).c.hp = { cur: 50, max: 50 };
    inPit(m);
    m.level.traps.push({ def: TRAP.pit, x: 2, y: 0, seen: true });
    if (conjoined) joinPits(trapAt(m.level, 1, 0)!, trapAt(m.level, 2, 0)!, xytodir(1, 0));
    return m;
  }
  function stepEast(m: ReturnType<typeof mapSetup>): string[] {
    const out = texts(engine.step(m.state, { type: 'move', dir: 'e' }).events);
    if (m.state.pendingPrompt?.prompt.id === 'trap-confirm')
      out.push(
        ...texts(
          engine.step(m.state, { type: 'answer', promptId: 'trap-confirm', value: true }).events,
        ),
      );
    return out;
  }

  test('she moves into a conjoined pit without climbing out and unhurt', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const m = twoPits(seed, true);
      const text = stepEast(m);
      expect(getPlayer(m.state).c.pos).toMatchObject({ x: 2, y: 0 });
      expect(text).toContain('You move into an adjacent pit.');
      expect(text.some((t) => t.startsWith('You escape'))).toBe(false);
      expect(utrap({ state: m.state })?.type).toBe('pit');
      expect(getPlayer(m.state).c.hp?.cur).toBe(50);
    }
  });

  test('into a pit next to hers that is not conjoined she stumbles over debris', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const m = twoPits(seed, false);
      // a spare move: the turn does not end, so no HP regeneration hides the damage
      getPlayer(m.state).c.actor!.energy += 12;
      const text = stepEast(m);
      expect(getPlayer(m.state).c.pos).toMatchObject({ x: 2, y: 0 });
      expect(text.some((t) => t.startsWith('You stumble over debris'))).toBe(true);
      const hp = getPlayer(m.state).c.hp!.cur;
      expect(hp).toBeGreaterThanOrEqual(47);
      expect(hp).toBeLessThan(50);
    }
  });

  test('filling or removing a pit clears its links', () => {
    const m = twoPits(1, true);
    m.level.traps.push({ def: TRAP.pit, x: 3, y: 0, seen: true });
    joinPits(trapAt(m.level, 2, 0)!, trapAt(m.level, 3, 0)!, xytodir(1, 0));
    run(m.state, (ctx) => {
      const b = mksobj(ctx, obj(BOULDER), { init: false, at: { level: 'dlvl1', x: 3, y: 0 } });
      expect(boulderFlooreffects(ctx, ent(m.state, b), 3, 0, 'fall')).toBe(true);
    });
    expect(trapAt(m.level, 3, 0)).toBeUndefined();
    expect(conjoinedOf(trapAt(m.level, 2, 0)!)).toBe(1 << xytodir(-1, 0));
    run(m.state, (ctx) => deltrap(ctx, 'dlvl1', trapAt(m.level, 2, 0)!));
    expect(conjoinedOf(trapAt(m.level, 1, 0)!)).toBe(0);
  });
});
