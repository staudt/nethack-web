// m12 step 1: makelevel()'s special-room chain, pick_room(), fill_zoo() for throne rooms, zoos
// and leprechaun halls, the entry messages and the wizard's mkroom.
import {
  createEngine,
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Room,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  COURT,
  LEPREHALL,
  VAULT,
  WIZ_MKROOM,
  ZOO,
  fillZoo,
  hasDnstairs,
  hasUpstairs,
  pickRoom,
  roomDoors,
  vanillaMod,
  wizardMod,
} from '../src/index';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'probe:run',
      labelKey: 'probe',
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
const wiz = createEngine([vanillaMod, wizardMod, probeMod]);
function withCtx(state: GameState, fn: (ctx: Ctx) => void): void {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'probe:run' });
}

const RULERS = ['nh:gnome_king', 'nh:dwarf_king', 'nh:elvenking', 'nh:ogre_king'];
const inRoom = (r: Room, x: number, y: number): boolean =>
  x >= r.lx && x <= r.hx && y >= r.ly && y <= r.hy;
const on = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)]!)
    .filter((e) => e.c.pos?.level === level.id);
/** The entities on the level, with what its monsters carry and its containers hold. */
function snap(state: GameState, level: Level): Entity[] {
  const here = on(state, level);
  const ids = new Set(here.map((e) => e.id));
  const held = sortedIds(state)
    .map((id) => state.entities[String(id)]!)
    .filter((e) => {
      const it = e.c.item;
      return (
        !!it &&
        ((it.carriedBy !== null && ids.has(it.carriedBy)) ||
          (it.containedIn !== undefined && ids.has(it.containedIn)))
      );
    });
  return [...here, ...held];
}
/** The squares fill_zoo() fills in a regular room: all but those on its door's side. */
function fillSquares(level: Level, ri: number): { x: number; y: number }[] {
  const r = level.rooms[ri]!;
  const doors = roomDoors({ defs: engine.registry }, level, ri, true);
  const d = doors[doors.length - 1];
  const out = [];
  for (let x = r.lx; x <= r.hx; x++)
    for (let y = r.ly; y <= r.hy; y++) {
      if (
        d &&
        ((x === r.lx && d.x === x - 1) ||
          (x === r.hx && d.x === x + 1) ||
          (y === r.ly && d.y === y - 1) ||
          (y === r.hy && d.y === y + 1))
      )
        continue;
      out.push({ x, y });
    }
  return out;
}

// Main-dungeon levels 2..12 of a number of games, made by walking down, with their typed rooms
// as made (before the hero could enter one).
interface Made {
  state: GameState;
  level: Level;
  types: (DefId | undefined)[];
  entities: Entity[];
}
const made: Made[] = [];
for (let seed = 1; seed <= 24; seed++) {
  const { state } = engine.newGame({ seed });
  for (let dlevel = 2; dlevel <= 12; dlevel++) {
    withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
    const level = getLevel(state);
    if (level.def !== undefined) continue; // special levels have no chain
    made.push({
      state,
      level,
      types: level.rooms.map((r) => r.type),
      entities: structuredClone(snap(state, level)),
    });
  }
}
const withKind = (kind: DefId): { m: Made; ri: number }[] =>
  made.flatMap((m) => m.types.flatMap((t, ri) => (t === kind ? [{ m, ri }] : [])));

describe('the special-room chain', () => {
  test('up to one special room a level, at its depths: no throne room above DL5, no leprechaun hall above DL6, no zoo above DL7', () => {
    for (const m of made) {
      // the vault is besides the chain's room
      const kinds = m.types.filter((t) => t !== undefined && t !== VAULT);
      expect(kinds.length).toBeLessThanOrEqual(1);
      expect(m.types.filter((t) => t === VAULT).length).toBeLessThanOrEqual(1);
      const k = kinds[0];
      if (k === COURT) expect(m.level.depth).toBeGreaterThanOrEqual(5);
      if (k === LEPREHALL) expect(m.level.depth).toBeGreaterThanOrEqual(6);
      if (k === ZOO) expect(m.level.depth).toBeGreaterThanOrEqual(7);
    }
    expect(withKind(COURT).length).toBeGreaterThan(3);
    expect(withKind(LEPREHALL).length).toBeGreaterThan(0);
    expect(withKind(ZOO).length).toBeGreaterThan(0);
  });

  test('the room is ordinary, without up stairs (nor the branch stairs)', () => {
    for (const kind of [COURT, LEPREHALL, ZOO])
      for (const { m, ri } of withKind(kind)) {
        const r = m.level.rooms[ri]!;
        expect(r.parent).toBeUndefined();
        expect(hasUpstairs(m.level, r)).toBe(false);
      }
  });

  test('pick_room(): never a typed room or one with up stairs; strict: no stairs at all', () => {
    let picked = 0;
    for (const m of made.slice(0, 60)) {
      withCtx(m.state, (ctx) => {
        for (let n = 0; n < 20; n++)
          for (const strict of [false, true]) {
            const i = pickRoom(ctx, m.level, strict);
            if (i === null) continue;
            picked++;
            const r = m.level.rooms[i]!;
            expect(r.type).toBeUndefined();
            expect(hasUpstairs(m.level, r)).toBe(false);
            if (strict) expect(hasDnstairs(m.level, r)).toBe(false);
          }
      });
    }
    expect(picked).toBeGreaterThan(100);
  });
});

describe('fill_zoo()', () => {
  test('a throne room: the ruler asleep on his throne with a mace, sleeping hostile courtiers on every square but the door side, the royal coffers', () => {
    for (const { m, ri } of withKind(COURT)) {
      const r = m.level.rooms[ri]!;
      const ents = m.entities;
      const thrones: { x: number; y: number }[] = [];
      for (let x = r.lx; x <= r.hx; x++)
        for (let y = r.ly; y <= r.hy; y++)
          if (terrainIdAt(m.level, x, y) === T.throne) thrones.push({ x, y });
      expect(thrones).toHaveLength(1);
      const t = thrones[0]!;
      const mons = ents.filter((e) => e.c.monster && inRoom(r, e.c.pos!.x, e.c.pos!.y));
      const ruler = mons.find((e) => e.c.pos!.x === t.x && e.c.pos!.y === t.y);
      expect(RULERS).toContain(ruler?.def);
      const carried = ents.filter((e) => e.c.item?.carriedBy === ruler!.id).map((e) => e.def);
      expect(carried).toContain('nh:mace');
      for (const e of mons) {
        expect(e.c.monster!.asleep).toBe(true);
        expect(e.c.monster!.peaceful).toBe(false);
      }
      for (const p of fillSquares(m.level, ri))
        expect(
          mons.some((e) => e.c.pos!.x === p.x && e.c.pos!.y === p.y),
          `${p.x},${p.y}`,
        ).toBe(true);
      const chest = ents.find(
        (e) =>
          e.def === 'nh:chest' && e.c.pos && inRoom(r, e.c.pos.x, e.c.pos.y) && e.c.item!.spe === 2,
      );
      expect(chest).toBeDefined();
      const gold = ents.find(
        (e) => e.def === 'nh:gold_piece' && e.c.item?.containedIn === chest!.id,
      );
      expect(gold!.c.item!.quantity).toBeGreaterThanOrEqual(10);
    }
  });

  test('a leprechaun hall: sleeping leprechauns on gold, the piles growing away from the door', () => {
    for (const { m, ri } of withKind(LEPREHALL)) {
      const r = m.level.rooms[ri]!;
      const doors = roomDoors({ defs: engine.registry }, m.level, ri, true);
      const d = doors[doors.length - 1]!;
      const near: number[] = [];
      const far: number[] = [];
      let total = 0;
      let goldlim = 500 * m.level.depth;
      const squares = fillSquares(m.level, ri);
      for (const p of squares) {
        const here = m.entities.filter((e) => e.c.pos?.x === p.x && e.c.pos.y === p.y);
        const mon = here.find((e) => e.c.monster);
        if (mon?.def === 'nh:leprechaun') expect(mon.c.monster!.asleep).toBe(true);
        const g = here.find((e) => e.def === 'nh:gold_piece')?.c.item?.quantity ?? 0;
        expect(g).toBeGreaterThanOrEqual(10);
        total += g;
        const dist2 = (p.x - d.x) ** 2 + (p.y - d.y) ** 2;
        // rn1(i, 10) with i = sq(dist2) up to the limit, then 5 * depth once it runs out (the
        // squares in fill order: x outer, y inner)
        let i = dist2 * dist2;
        if (i >= goldlim) i = 5 * m.level.depth;
        goldlim -= i;
        expect(g).toBeLessThanOrEqual(i + 9);
        // while the limit lasts: within 2 squares at most 16 + 9, from 3 at least 10
        if (i === dist2 * dist2) {
          if (dist2 <= 4) near.push(g);
          else if (dist2 >= 9) far.push(g);
        }
      }
      expect(
        m.entities.filter((e) => e.def === 'nh:leprechaun' && inRoom(r, e.c.pos!.x, e.c.pos!.y))
          .length,
      ).toBeGreaterThan(squares.length / 2);
      for (const g of near) expect(g).toBeLessThanOrEqual(25);
      // out of 500 * depth, then 5 * depth a square once it runs out
      expect(total).toBeLessThanOrEqual(
        500 * m.level.depth + squares.length * (5 * m.level.depth + 10),
      );
      if (near.length && far.length) expect(Math.max(...far)).toBeGreaterThan(Math.max(...near));
    }
  });
});

// A walled 5x3 room with a doorway on its east wall; the hero outside it.
const MAP = ['         ', ' ....... ', ' ....... ', ' ........', ' ....... ', '         '];
function walledRoom(seed: number, depth: number) {
  const s = levelSetup(MAP, seed);
  const level = getLevel(s.state);
  level.depth = depth;
  for (let x = 1; x <= 7; x++) {
    setTerrain(level, x, 1, T.hwall);
    setTerrain(level, x, 5 - 1, T.hwall);
  }
  for (let y = 1; y <= 4; y++) {
    setTerrain(level, 1, y, T.vwall);
    setTerrain(level, 7, y, T.vwall);
  }
  setTerrain(level, 7, 3, T.doorway);
  level.rooms.push({ lx: 2, ly: 2, hx: 6, hy: 3, lit: true });
  const hero = getPlayer(s.state);
  hero.c.pos = { level: level.id, x: 8, y: 3 };
  return { state: s.state, level };
}
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const west = { type: 'move', dir: 'w' } as const;
const east = { type: 'move', dir: 'e' } as const;

describe('entering', () => {
  test('"You enter an opulent throne room!" once; the room is ordinary afterwards', () => {
    const { state, level } = walledRoom(3, 10);
    level.rooms[0]!.type = COURT;
    withCtx(state, (ctx) => fillZoo(ctx, level, 0));
    // the door side (column 6) has no courtier (the ruler's throne may be there), every other
    // square has a sleeping monster
    const mons = on(state, level).filter((e) => e.c.monster && e.id !== state.playerId);
    for (const e of mons.filter((e) => e.c.pos!.x === 6)) expect(RULERS).toContain(e.def);
    for (let x = 2; x <= 5; x++)
      for (let y = 2; y <= 3; y++)
        expect(mons.some((e) => e.c.pos!.x === x && e.c.pos!.y === y)).toBe(true);
    expect(mons.every((e) => e.c.monster!.asleep && !e.c.monster!.peaceful)).toBe(true);
    const all: string[] = [];
    all.push(...texts(engine.step(state, west).events));
    all.push(...texts(engine.step(state, west).events));
    expect(all.filter((t) => t === 'You enter an opulent throne room!')).toHaveLength(1);
    expect(level.rooms[0]!.type).toBeUndefined();
    const again = [
      ...texts(engine.step(state, east).events),
      ...texts(engine.step(state, east).events),
      ...texts(engine.step(state, west).events),
      ...texts(engine.step(state, west).events),
    ];
    expect(again.some((t) => t.startsWith('You enter'))).toBe(false);
  });

  test('a throne room with no throne is "an opulent room"; a leprechaun hall', () => {
    const a = walledRoom(3, 10);
    a.level.rooms[0]!.type = COURT;
    const t1 = [
      ...texts(engine.step(a.state, west).events),
      ...texts(engine.step(a.state, west).events),
    ];
    expect(t1).toContain('You enter an opulent room!');
    const b = walledRoom(3, 10);
    b.level.rooms[0]!.type = LEPREHALL;
    const t2 = [
      ...texts(engine.step(b.state, west).events),
      ...texts(engine.step(b.state, west).events),
    ];
    expect(t2).toContain('You enter a leprechaun hall!');
  });
});

describe('wiz:mkroom', () => {
  test('turns her room into a leprechaun hall, filled around her', () => {
    const { state, level } = walledRoom(5, 8);
    getPlayer(state).c.pos = { level: level.id, x: 3, y: 2 };
    const offers = wiz.query(state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === WIZ_MKROOM)).toBe(
      true,
    );
    wiz.step(state, { type: 'mod', action: WIZ_MKROOM as DefId });
    const p = state.pendingPrompt?.prompt;
    expect(p?.kind).toBe('menu');
    wiz.step(state, { type: 'answer', promptId: p!.id, value: LEPREHALL });
    expect(level.rooms[0]!.type).toBe(LEPREHALL);
    const lep = on(state, level).filter((e) => e.def === 'nh:leprechaun');
    // 10 squares, less the door side (2) and her own
    expect(lep).toHaveLength(7);
    expect(lep.every((e) => e.c.monster!.asleep)).toBe(true);
  });

  test('outside an ordinary room it says so', () => {
    const { state } = walledRoom(5, 8);
    const r = wiz.step(state, { type: 'mod', action: WIZ_MKROOM as DefId });
    expect(texts(r.events)).toContain('You are not in an ordinary room.');
    expect(state.pendingPrompt).toBeFalsy();
  });
});
