// m7d step 1: the new wands, rings, amulet and scroll, and teleporting (the hero within a level
// and to another level, monsters and objects by the wand's beam). Outcomes are asserted; where a
// roll decides the case, RNG offsets are searched for each outcome.
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  sortedIds,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Json,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { WAN, isKnown, messagesEn, readobjnam, vanillaMod, wishNames } from '../src/index';
import { BOULDER } from '../src/boulder';
import { eshkOf } from '../src/eshk';
import { mksobj } from '../src/items';
import { DUNGEON_BOTTOM } from '../src/levelflags';
import { checkSpecialRoom } from '../src/rooms';
import { rloco } from '../src/rloco';
import { stockShops } from '../src/shknam';
import {
  levelAtDepth,
  noteleportLevel,
  randomTeleportLevel,
  safeTeledsPos,
  teleok,
} from '../src/teleport';
import { levelTele, rlocTo, tele, teleds } from '../src/trap';
import { addMon, setup } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, plainKit, quiet, render } from './itemHelpers';

// a probe action runs content functions with a real Ctx (no time passes)
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'tp-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'tp-probe:run',
      labelKey: 'tp-probe',
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
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx after burning `burn` draws; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void, burn = 0): string[] {
  probe.fn = (ctx) => {
    for (let i = 0; i < burn; i++) ctx.rng.rn2(2);
    fn(ctx);
  };
  return textOf(probeEngine.step(state, { type: 'mod', action: 'tp-probe:run' }));
}
/** Every outcome of `fn` over `tries` RNG offsets, each on a copy of `state`. */
function outcomes(state: GameState, fn: (ctx: Ctx) => void, tries = 60) {
  const out: { state: GameState; text: string[] }[] = [];
  for (let k = 0; k < tries; k++) {
    const st = structuredClone(state);
    out.push({ state: st, text: run(st, fn, k) });
  }
  return out;
}

const NEW_OBJECTS: [DefId, string, number, number, string][] = [
  // id, class, prob, cost, material (ref: include/objects.h)
  ['nh:ring_of_stealth', 'ring', 1, 100, 'gemstone'],
  ['nh:ring_of_levitation', 'ring', 1, 200, 'gemstone'],
  ['nh:ring_of_conflict', 'ring', 1, 300, 'gemstone'],
  ['nh:ring_of_warning', 'ring', 1, 100, 'gemstone'],
  ['nh:ring_of_teleportation', 'ring', 1, 200, 'silver'],
  ['nh:amulet_of_magical_breathing', 'amulet', 75, 150, 'iron'],
  ['nh:scroll_of_teleportation', 'scroll', 55, 100, 'paper'],
  ['nh:wand_of_enlightenment', 'wand', 15, 150, 'glass'],
  ['nh:wand_of_wishing', 'wand', 5, 500, 'wood'],
  ['nh:wand_of_stasis', 'wand', 45, 150, 'wood'],
  ['nh:wand_of_undead_turning', 'wand', 50, 150, 'copper'],
  ['nh:wand_of_cancellation', 'wand', 45, 200, 'platinum'],
  ['nh:wand_of_teleportation', 'wand', 45, 200, 'metal'],
  ['nh:wand_of_digging', 'wand', 40, 150, 'iron'],
  ['nh:wand_of_death', 'wand', 5, 500, 'iron'],
];

describe('the new objects', () => {
  test('match objects.h: class, probability, cost, material, property and wand kind', () => {
    for (const [id, cls, prob, cost, material] of NEW_OBJECTS) {
      const d = defs.object(id as never);
      expect({ id, cls: d.class, prob: d.prob, cost: d.cost, material: d.material }).toEqual({
        id,
        cls,
        prob,
        cost,
        material,
      });
    }
    const prop = (id: string) => defs.object(id as never).prop;
    expect(prop('nh:ring_of_stealth')).toBe('stealth');
    expect(prop('nh:ring_of_levitation')).toBe('levitation');
    expect(prop('nh:ring_of_conflict')).toBe('conflict');
    expect(prop('nh:ring_of_warning')).toBe('warning');
    expect(prop('nh:ring_of_teleportation')).toBe('teleport');
    expect(prop('nh:amulet_of_magical_breathing')).toBe('magical_breathing');
    const dir = (id: string) => defs.object(id as never).wand?.dir;
    expect(dir(WAN.enlightenment)).toBe('nodir');
    expect(dir(WAN.wishing)).toBe('nodir');
    expect(dir(WAN.stasis)).toBe('nodir');
    expect(dir(WAN.undeadTurning)).toBe('immediate');
    expect(dir(WAN.cancellation)).toBe('immediate');
    expect(dir(WAN.teleportation)).toBe('immediate');
    expect(dir(WAN.digging)).toBe('ray');
    expect(dir(WAN.death)).toBe('ray');
    // the wands stay in objects.h order (the shuffle and the random pool follow it)
    const wands = defs.objects.filter((o) => o.class === 'wand').map((o) => o.id);
    expect(wands.indexOf(WAN.enlightenment)).toBe(wands.indexOf(WAN.secretDoor) + 1);
    expect(wands.indexOf(WAN.death)).toBe(wands.indexOf(WAN.lightning) - 1);
  });

  test('wands of wishing start with 1 charge, stasis with 3..6 (mksobj_init())', () => {
    const s = freshCtx();
    const spes = (id: string) =>
      Array.from(
        { length: 40 },
        () => itemOf(s.state, mksobj(s.ctx, defs.object(id as never), {})).spe,
      );
    expect(new Set(spes(WAN.wishing))).toEqual(new Set([1]));
    const st = spes(WAN.stasis);
    expect(Math.min(...st)).toBe(3);
    expect(Math.max(...st)).toBe(6);
    const tp = spes(WAN.teleportation);
    expect(Math.min(...tp)).toBeGreaterThanOrEqual(4);
    expect(Math.max(...tp)).toBeLessThanOrEqual(8);
  });

  test('every new object gets its own shuffled appearance and can be wished for by name', () => {
    const state = engine.newGame({ seed: 3 }).state;
    const looks = new Set<string>();
    for (const [id] of NEW_OBJECTS) {
      const a = state.appearances[id];
      expect(a, id).toBeDefined();
      looks.add(a ?? '');
    }
    expect(looks.size).toBe(NEW_OBJECTS.length);
    const names = wishNames(state, defs, messagesEn);
    for (const [id] of NEW_OBJECTS) {
      const r = readobjnam(messagesEn[id] ?? '', names);
      const what = r !== null && r !== 'nothing' ? r.what : null;
      const types = what?.kind === 'type' ? [what.type] : what?.kind === 'types' ? what.types : [];
      expect(types, id).toEqual([id]);
    }
  });

  test('a new wand zaps with no effect yet: a charge is spent, nothing is learned', () => {
    const s = levelSetup(['.....', '..@..', '.....']);
    plainKit(s.state);
    s.step({ type: 'wait' });
    const w = s.carry(WAN.undeadTurning); // (death has its effect since m7d step 6)
    itemOf(s.state, w).spe = 3;
    s.mod('nh:zap', { item: w });
    const p = s.state.pendingPrompt?.prompt;
    engine.step(s.state, { type: 'answer', promptId: p?.id ?? '', value: 'e' as Json });
    expect(itemOf(s.state, w).spe).toBe(2);
    expect(isKnown(s.state, defs, WAN.undeadTurning)).toBe(false);
  });
});

function freshCtx() {
  const state = engine.newGame({ seed: 1 }).state;
  return { state, ctx: ctxFor(state) as unknown as Ctx };
}

// ---------------------------------------------------------------------------------------------

/** A walled-in 18x5 floor room (stone around it), the hero at (2,2), lit and seen. */
const ROOM = [
  '                      ',
  ' .................... ',
  ' .@.................. ',
  ' .................... ',
  ' .................... ',
  ' .................... ',
  '                      ',
];

describe('where teleports go', () => {
  test('safe_teleds() never lands on rock, a monster, a boulder or a trap', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = engine.newGame({ seed });
      const ctx = ctxFor(state) as unknown as Ctx;
      const level = getLevel(state);
      for (let i = 0; i < 25; i++) {
        const to = safeTeledsPos(ctx, level);
        expect(to).not.toBeNull();
        if (!to) continue;
        expect(teleok(ctx, level, to.x, to.y, false), `seed ${seed} ${to.x},${to.y}`).toBe(true);
        const t = level.palette[level.cells[to.y * level.width + to.x] ?? 0];
        expect(defs.terrain(t as never).passable).toBe(true);
        expect(trapAt(level, to.x, to.y)).toBeUndefined();
        expect(itemsAt(defs, state, level.id, to.x, to.y).some((e) => e.def === BOULDER)).toBe(
          false,
        );
        const mon = sortedIds(state).some((id) => {
          const e = state.entities[String(id)];
          return (
            id !== state.playerId &&
            e?.c.monster &&
            e.c.pos?.level === level.id &&
            e.c.pos.x === to.x &&
            e.c.pos.y === to.y
          );
        });
        expect(mon).toBe(false);
      }
    }
  });

  test('a full level: only free squares (her own counts), else the first trap square', () => {
    const m = setup(['  ...  ', '  .@.  ', '  ...  ']);
    const ctx = ctxFor(m.state) as unknown as Ctx;
    // every square but hers and (4,2) taken by monsters
    for (const [x, y] of [
      [2, 0],
      [3, 0],
      [4, 0],
      [2, 1],
      [4, 1],
      [2, 2],
      [3, 2],
    ] as const)
      addMon(m.state, 'nh:newt', x, y);
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const to = safeTeledsPos(ctx, m.level);
      seen.add(`${to?.x},${to?.y}`);
    }
    expect(seen).toEqual(new Set(['3,1', '4,2']));
    // a trap on (4,2): the random tries may still pick her square; the rings never do (the
    // centre is not collected), so the trap square is the fallback
    m.level.traps.push({ def: 'nh:squeaky_board' as DefId, x: 4, y: 2, seen: true });
    seen.clear();
    for (let i = 0; i < 60; i++) {
      const to = safeTeledsPos(ctx, m.level);
      seen.add(`${to?.x},${to?.y}`);
    }
    expect(seen).toEqual(new Set(['3,1', '4,2']));
  });

  test('random_teleport_level(): 1 to current + 3, never the current depth unless staying', () => {
    const { state, ctx } = freshCtx();
    const main = (dlevel: number): Level => ({ ...getLevel(state), dlevel });
    for (const d of [1, 2, 5, 12]) {
      const seen = new Set<number>();
      for (let i = 0; i < 400; i++) seen.add(randomTeleportLevel(ctx, main(d)));
      // the current depth only by the 1 in 5 stay; otherwise 1..d+3 without d
      for (const n of seen) {
        expect(n).toBeGreaterThanOrEqual(1);
        expect(n).toBeLessThanOrEqual(d + 3);
      }
      expect(seen.has(d)).toBe(true);
      expect(seen.has(d + 3)).toBe(true);
      expect(seen.size).toBe(d + 3);
    }
    // the main dungeon's bottom is the holes' cap
    const deep = new Set<number>();
    for (let i = 0; i < 400; i++) deep.add(randomTeleportLevel(ctx, main(DUNGEON_BOTTOM - 1)));
    expect(Math.max(...deep)).toBe(DUNGEON_BOTTOM);
  });

  test('in the Mines: no deeper than its bottom, up from the bottom, and above it the main dungeon', () => {
    const { state, ctx } = freshCtx();
    const mines = state.dungeons.find((d) => d.id === 'nh:mines');
    if (!mines?.levels) throw new Error('no Mines');
    const at = (dlevel: number): Level => ({ ...getLevel(state), dungeon: 'nh:mines', dlevel });
    const bottomDepth = mines.depthStart + mines.levels - 1;
    const fromBottom = new Set<number>();
    for (let i = 0; i < 300; i++) fromBottom.add(randomTeleportLevel(ctx, at(mines.levels)));
    for (const n of fromBottom) expect(n).toBeLessThanOrEqual(bottomDepth);
    expect(fromBottom.has(bottomDepth - 1)).toBe(true);
    // get_level(): a depth above the Mines is in the main dungeon, past its bottom its last level
    expect(levelAtDepth(ctx, at(1), 1)).toEqual({ dungeon: 'nh:main', dlevel: 1 });
    expect(levelAtDepth(ctx, at(1), mines.depthStart + 1)).toEqual({
      dungeon: 'nh:mines',
      dlevel: 2,
    });
    expect(levelAtDepth(ctx, at(1), bottomDepth + 5)).toEqual({
      dungeon: 'nh:mines',
      dlevel: mines.levels,
    });
  });
});

// ---------------------------------------------------------------------------------------------

type S = ReturnType<typeof levelSetup>;
function room(): S {
  const s = levelSetup(ROOM);
  plainKit(s.state);
  for (const d of defs.objects) if (d.class === 'wand') delete s.state.appearances[d.id];
  s.step({ type: 'wait' });
  return s;
}
const posOf = (s: { state: GameState }, id: EntityId) => {
  const p = s.state.entities[String(id)]?.c.pos;
  return p ? { x: p.x, y: p.y } : null;
};
const heroAt = (s: { state: GameState }) => posOf(s, s.state.playerId);
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
function zap(s: S, id: EntityId, dir: string): string[] {
  const r = s.mod('nh:zap', { item: id });
  return [...s.text(r), ...textOf(answer(s, dir))];
}

describe('the scroll of teleportation', () => {
  test('uncursed: to a random safe spot of the level, "You materialize...", the scroll known', () => {
    let moved = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = levelSetup(ROOM, seed);
      plainKit(s.state);
      s.step({ type: 'wait' });
      const scroll = s.carry('nh:scroll_of_teleportation');
      // the scroll's own appearance (not yet known)
      expect(isKnown(s.state, defs, 'nh:scroll_of_teleportation')).toBe(false);
      const before = heroAt(s);
      const text = s.text(s.mod('nh:read', { item: scroll }));
      const after = heroAt(s);
      const same = before?.x === after?.x && before?.y === after?.y;
      expect(text).toContain(
        same ? 'You materialize in the same location!' : 'You materialize in a different location!',
      );
      if (!same) moved++;
      expect(isKnown(s.state, defs, 'nh:scroll_of_teleportation')).toBe(true);
      expect(s.state.entities[String(scroll)]).toBeUndefined();
      const level = getLevel(s.state);
      expect(
        after && teleok(ctxFor(s.state) as unknown as Ctx, level, after.x, after.y, false),
      ).toBe(true);
    }
    expect(moved).toBeGreaterThan(0);
  });

  test('cursed (or read while confused): a level teleport to dungeon level 2..4 from level 1', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 30 && kinds.size < 2; seed++) {
      const { state } = engine.newGame({ seed });
      quiet(state);
      const ctx = ctxFor(state);
      const sc = mksobj(ctx, defs.object('nh:scroll_of_teleportation' as never), {
        init: false,
        carriedBy: state.playerId,
      });
      itemOf(state, sc).buc = 'cursed';
      const r = engine.step(state, { type: 'mod', action: 'nh:read', args: { item: sc } as never });
      const text = textOf(r);
      const lv = getLevel(state);
      if (text.includes('You shudder for a moment.')) {
        kinds.add('shudder');
        expect(lv.dlevel).toBe(1);
      } else {
        expect(text).toContain('You materialize on a different level!');
        expect(lv.dungeon).toBe('nh:main');
        expect(lv.dlevel).toBeGreaterThanOrEqual(2);
        expect(lv.dlevel).toBeLessThanOrEqual(4);
        expect(getPlayer(state).c.pos?.level).toBe(lv.id);
        kinds.add('moved');
      }
      expect(isKnown(state, defs, 'nh:scroll_of_teleportation')).toBe(true);
    }
    expect(kinds).toEqual(new Set(['shudder', 'moved']));
  });

  test('Sokoban: "A mysterious force..." for a teleport, "very disoriented" for a level teleport', () => {
    const { state } = engine.newGame({ seed: 2 });
    quiet(state);
    run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:sokoban', dlevel: 4 }, 'up'));
    const level = getLevel(state);
    expect(noteleportLevel(ctxFor(state) as unknown as Ctx, level)).toBe(true);
    const before = { ...getPlayer(state).c.pos };
    for (const buc of ['uncursed', 'cursed'] as const) {
      const sc = mksobj(ctxFor(state), defs.object('nh:scroll_of_teleportation' as never), {
        init: false,
        carriedBy: state.playerId,
      });
      itemOf(state, sc).buc = buc;
      const text = textOf(
        engine.step(state, { type: 'mod', action: 'nh:read', args: { item: sc } as never }),
      );
      expect(text).toContain(
        buc === 'cursed'
          ? 'You feel very disoriented for a moment.'
          : 'A mysterious force prevents you from teleporting!',
      );
      expect(getPlayer(state).c.pos).toEqual(before);
    }
    expect(isKnown(state, defs, 'nh:scroll_of_teleportation')).toBe(true);
    // an ordinary level has no such flag
    const { state: plain } = engine.newGame({ seed: 2 });
    expect(noteleportLevel(ctxFor(plain) as unknown as Ctx, getLevel(plain))).toBe(false);
  });
});

describe('teleds()', () => {
  test('lets her out of a pit and goes off on the trap where she lands', () => {
    const s = room();
    getLevel(s.state).traps.push({ def: 'nh:squeaky_board' as DefId, x: 10, y: 3, seen: false });
    const text = run(s.state, (ctx) => teleds(ctx, 10, 3, { teleport: true }));
    expect(text[0]).toBe('You materialize in a different location!');
    expect(text.some((t) => t.includes('squeak'))).toBe(true);
    expect(heroAt(s)).toEqual({ x: 10, y: 3 });
  });

  test('teleporting out of a shop with unpaid goods is robbery', () => {
    // A shop (interior 1..5 x 1..3) with a doorway at 6,2 and a corridor east of it
    const m = setup([
      '-------     ',
      '|.....|     ',
      '|.....o.@...',
      '|.....|     ',
      '-------     ',
    ]);
    m.level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 3, lit: true, type: 'nh:shop' as DefId }];
    const ctx = ctxFor(m.state) as unknown as Ctx;
    stockShops(ctx, m.level);
    for (const id of sortedIds(m.state)) {
      const o = m.state.entities[String(id)];
      if (o?.c.item && o.c.pos) delete m.state.entities[String(id)];
    }
    const shk = sortedIds(m.state).find((id) => eshkOf({ state: m.state }, id) !== null);
    if (shk === undefined) throw new Error('no shopkeeper');
    const sk = m.state.entities[String(shk)] as Entity;
    if (sk.c.actor) sk.c.actor.speed = 0;
    Object.assign(sk.c.pos ?? {}, { x: 1, y: 1 }); // out of the way, still in his shop
    const hp = getPlayer(m.state).c.pos;
    if (hp) Object.assign(hp, { x: 3, y: 2 });
    checkSpecialRoom(ctx, false);
    const apple = mksobj(ctx, defs.object('nh:apple' as never), {
      init: false,
      at: { level: 'dlvl1', x: 3, y: 2 },
    });
    m.engine.step(m.state, { type: 'mod', action: 'nh:pickup' });
    expect(m.state.entities[String(apple)]?.c.item?.unpaid).toBe(true);
    const text: string[] = [];
    probe.fn = (c) => teleds(c, 10, 2, { teleport: true });
    const r = probeEngine.step(m.state, { type: 'mod', action: 'tp-probe:run' });
    text.push(...textOf(r));
    expect(text[0]).toBe('You materialize in a different location!');
    expect(text).toContain('You escaped the shop without paying!');
    expect(eshkOf({ state: m.state }, shk)?.robbed).toBeGreaterThan(0);
    expect(sk.c.monster?.peaceful).toBe(false);
  });
});

describe('the wand of teleportation', () => {
  test('a monster in the beam lands elsewhere ("vanishes and reappears"); the wand is learned', () => {
    const s = room();
    const jackal = addMon(s.state, 'nh:jackal', 5, 2, { asleep: true });
    s.state.entities[String(jackal)]!.c.actor!.speed = 0;
    const w = s.carry(WAN.teleportation);
    itemOf(s.state, w).spe = 4;
    // the wands are not shuffled here; give it back its appearance so learning can be seen
    s.state.appearances[WAN.teleportation] = 'nh:iridium_wand';
    const text = zap(s, w, 'e');
    const p = posOf(s, jackal);
    expect(p).not.toEqual({ x: 5, y: 2 });
    expect(text.some((t) => /^The jackal (vanishes and reappears|appears)/.test(t))).toBe(true);
    const level = getLevel(s.state);
    expect(p && level.cells[p.y * level.width + p.x]).toBe(1); // floor
    expect(isKnown(s.state, defs, WAN.teleportation)).toBe(true);
  });

  test("objects in the beam land on random good squares (not the hero's, no boulder square)", () => {
    const s = room();
    const apple = s.floor('nh:apple', { at: { level: 'dlvl1', x: 6, y: 2 } });
    const w = s.carry(WAN.teleportation);
    itemOf(s.state, w).spe = 4;
    zap(s, w, 'e');
    const p = posOf(s, apple);
    expect(p).not.toBeNull();
    expect(p).not.toEqual({ x: 6, y: 2 });
    expect(p).not.toEqual(heroAt(s));
    const level = getLevel(s.state);
    expect(p && level.cells[p.y * level.width + p.x]).toBe(1);
  });

  test('a boulder teleported onto a pit fills it', () => {
    const s = room();
    const level = getLevel(s.state);
    // every floor square but hers is a pit (the boulder's too: it leaves it first), so wherever
    // it lands, it is on a pit
    for (let y = 1; y <= 5; y++)
      for (let x = 1; x <= 20; x++)
        if (!(x === 2 && y === 2)) level.traps.push({ def: 'nh:pit' as DefId, x, y, seen: true });
    level.traps.sort((a, b) => a.y * level.width + a.x - (b.y * level.width + b.x));
    const b = mksobj(s.ctx, defs.object(BOULDER as never), {
      init: false,
      at: { level: 'dlvl1', x: 6, y: 2 },
    });
    const n = level.traps.length;
    const text = run(s.state, (ctx) => {
      const e = ctx.state.entities[String(b)];
      if (e) expect(rloco(ctx, e)).toBe(false);
    });
    expect(s.state.entities[String(b)]).toBeUndefined();
    expect(level.traps.length).toBe(n - 1);
    expect(text).toContain('The boulder fills a pit.');
  });

  test('zapping yourself teleports you; learned only when far (>= 4 squares) or out of sight', () => {
    const results = outcomes(
      (() => {
        const s = room();
        const w = s.carry(WAN.teleportation);
        itemOf(s.state, w).spe = 30;
        s.state.appearances[WAN.teleportation] = 'nh:iridium_wand';
        (s.state.modData as Record<string, Json>)['tpw'] = w;
        return s.state;
      })(),
      (ctx) => {
        const w = (ctx.state.modData as Record<string, Json>)['tpw'] as number;
        const before = { ...getPlayer(ctx.state).c.pos! };
        (ctx.state.modData as Record<string, Json>)['tpfrom'] = before as unknown as Json;
        const wand = ctx.state.entities[String(w)];
        if (wand) ctx.defs.object(wand.def).zap?.(ctx, ctx.state.playerId, w, 'self');
      },
      80,
    );
    let near = 0;
    let far = 0;
    for (const o of results) {
      const from = (o.state.modData as Record<string, Json>)['tpfrom'] as { x: number; y: number };
      const to = getPlayer(o.state).c.pos!;
      const d2 = (to.x - from.x) ** 2 + (to.y - from.y) ** 2;
      // the room is open and lit: always in sight, so distance alone decides
      expect(isKnown(o.state, defs, WAN.teleportation), `${d2}`).toBe(d2 >= 16);
      if (d2 >= 16) far++;
      else near++;
    }
    expect(far).toBeGreaterThan(0);
    expect(near).toBeGreaterThan(0);
  });
});

describe('rloc_to() and rloco() in shops', () => {
  /** A stocked-out shop (interior 1..5 x 1..3), its door at 6,2, a room east of it. */
  function shopLevel() {
    const m = setup([
      '------- -----',
      '|.....| |...|',
      '|.....o@o...|',
      '|.....| |...|',
      '------- -----',
    ]);
    m.level.rooms = [
      { lx: 1, ly: 1, hx: 5, hy: 3, lit: true, type: 'nh:shop' as DefId },
      { lx: 9, ly: 1, hx: 11, hy: 3, lit: true },
    ];
    const ctx = ctxFor(m.state) as unknown as Ctx;
    stockShops(ctx, m.level);
    for (const id of sortedIds(m.state)) {
      const o = m.state.entities[String(id)];
      if (o?.c.item && o.c.pos) delete m.state.entities[String(id)];
    }
    const shk = sortedIds(m.state).find((id) => eshkOf({ state: m.state }, id) !== null)!;
    const sk = m.state.entities[String(shk)] as Entity;
    if (sk.c.actor) sk.c.actor.speed = 0;
    return { m, ctx, shk, sk };
  }

  test('a resident shopkeeper taken out of his shop gets angry', () => {
    const { m, shk, sk } = shopLevel();
    const text = run(m.state, (ctx) => rlocTo(ctx, sk, 10, 2, true));
    expect(sk.c.pos).toMatchObject({ x: 10, y: 2 });
    expect(sk.c.monster?.peaceful).toBe(false);
    expect(text.some((t) => /gets angry|is furious/.test(t))).toBe(true);
    expect(eshkOf({ state: m.state }, shk)).not.toBeNull();
  });

  test('a shop object teleported out of the shop is stolen; one staying inside is not', () => {
    const { m } = shopLevel();
    const hp = getPlayer(m.state).c.pos;
    if (hp) Object.assign(hp, { x: 3, y: 2 }); // she is in the shop
    checkSpecialRoom(ctxFor(m.state) as unknown as Ctx, false);
    const ctx0 = ctxFor(m.state) as unknown as Ctx;
    const apple = mksobj(ctx0, defs.object('nh:apple' as never), {
      init: false,
      at: { level: 'dlvl1', x: 2, y: 2 },
    });
    let inside = 0;
    let outside = 0;
    for (const o of outcomes(m.state, (ctx) => {
      const e = ctx.state.entities[String(apple)];
      if (e) rloco(ctx, e);
    })) {
      const p = o.state.entities[String(apple)]?.c.pos;
      expect(p).toBeDefined();
      if (!p) continue;
      const shkId = sortedIds(o.state).find((id) => eshkOf({ state: o.state }, id) !== null)!;
      const e = eshkOf({ state: o.state }, shkId)!;
      const sp = o.state.entities[String(shkId)]?.c.pos;
      const inShop = p.x >= 1 && p.x <= 5 && p.y >= 1 && p.y <= 3;
      const owed = e.robbed + e.debit;
      if (p.x === sp?.x && p.y === sp.y) {
        // his own spot is the shop's boundary: it goes on her bill
        expect(o.text[0]).toMatch(/^The apple will cost you \d+ zorkmids\.$/);
      } else if (inShop) {
        inside++;
        expect(owed).toBe(0);
        expect(o.text).toEqual([]);
      } else if (!(p.x === 6 && p.y === 2)) {
        outside++;
        expect(owed).toBeGreaterThan(0);
      }
    }
    expect(inside).toBeGreaterThan(0);
    expect(outside).toBeGreaterThan(0);
  });
});

describe('level teleport from the probe', () => {
  test('levelTele() and tele() leave no hero outside a level', () => {
    const { state } = engine.newGame({ seed: 4 });
    quiet(state);
    for (let i = 0; i < 5; i++) {
      run(state, (ctx) => levelTele(ctx));
      run(state, (ctx) => tele(ctx));
      const p = getPlayer(state).c.pos;
      expect(p?.level).toBe(state.currentLevel);
      expect(inventoryOf(state, state.playerId).length).toBeGreaterThan(0);
    }
  });
});
