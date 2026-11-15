// m15 step 7: the Castle and its drawbridge. The level (castle.ts) built in a test dungeon whose
// last level it is, as nh:main will have it from step 9 on; the drawbridge (dbridge.ts) raised,
// lowered and destroyed with the hero or monsters on it. Outcomes are asserted: monsters are
// placed by hand, and the random ones (jumping clear, being missed) are run over many seeds.
// ref: dat/castle.lua; src/dbridge.c; src/sp_lev.c lspo_drawbridge(); src/do.c
// boulder_hits_pool()
// m15 step 8: opening it. The passtune on the bugle ("Improvise?", the typed tune, tumblers and
// gears, "Play the passtune?"), wands of opening, locking and striking (the hero's and a
// monster's), digging, cold and fire over the raised span, kicking the portcullis, and prayer
// revealing the tune. ref: src/music.c do_play_instrument(); src/zap.c zap_map(), zap_updown(),
// zap_over_floor(), melt_ice(); src/muse.c mbhit(); src/dig.c dighole(); src/dokick.c
// kick_ouch(); src/pray.c pleased()
import {
  createEngine,
  getLevel,
  getPlayer,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Level,
  type Mod,
  type Pos,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { APPLY_ID, P, setItimeout, setU, vanillaMod } from '../src/index';
import { isBoxTrapped } from '../src/btrapstate';
import { CASTLE_LEVEL } from '../src/castle';
import { closeDrawbridge, destroyDrawbridge, openDrawbridge } from '../src/dbridge';
import {
  drawbridgeData,
  findDrawbridge,
  isDrawbridgeWall,
  setCastleTune,
  setUopenedDbridge,
  uheardTune,
  uopenedDbridge,
} from '../src/dbstate';
import { dighole } from '../src/dig';
import { engrAt } from '../src/engr';
import { coldOverLiquid, fireOverLiquid } from '../src/ice';
import { meltTimeLeft } from '../src/icestate';
import { tuneClues } from '../src/music';
import { findOffensive, useOffensive } from '../src/muse';
import { boulderHitsPool } from '../src/flooreffects';
import { mksobj } from '../src/items';
import { levelFlags, nonDiggable } from '../src/levelflags';
import { isMoat, isPool, waterbodyName } from '../src/liquid';
import { mapToLevel } from '../src/sp_lev';
import { T, terrainIdAt } from '../src/terrain';
import { BARRACKS, COURT } from '../src/zoo';
import { addMon } from './helpers';
import { levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
/** A probe action and a test dungeon (from DL20 of the main one) whose last level is the Castle. */
const testMod: Mod = {
  id: 'mt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mt:run',
      labelKey: 'mt',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
    api.defineDungeon({
      id: 'mt:castle',
      nameKey: 'mt:castle',
      levels: { base: 3 },
      entry: { from: 'nh:main', base: 20 },
      special: [{ id: 'mt:c', nameKey: 'mt:c', base: 3, variants: [CASTLE_LEVEL.id] }],
    });
  },
};
const engine = createEngine([vanillaMod, testMod]);
const defs = engine.registry;
const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
const run = (state: GameState, fn: (ctx: Ctx) => void): string[] => {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'mt:run' as DefId }).events);
};

/** The Castle of a new game with `seed`, arriving by its up stairs (or falling from above). */
function castle(seed: number, at: 'up' | 'random' = 'up'): { state: GameState; level: Level } {
  const { state } = engine.newGame({ seed });
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'mt:castle', dlevel: 2 }, 'up'));
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'mt:castle', dlevel: 3 }, at));
  return { state, level: getLevel(state) };
}

const at = (level: Level, x: number, y: number): Pos => mapToLevel(CASTLE_LEVEL, level, x, y);
const entitiesOn = (state: GameState, level: Level): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.pos?.level === level.id);
const monsOn = (state: GameState, level: Level): Entity[] =>
  entitiesOn(state, level).filter((e) => e.c.monster !== undefined && e.id !== state.playerId);
const monAtPos = (state: GameState, level: Level, p: Pos): Entity | undefined =>
  monsOn(state, level).find((m) => m.c.pos?.x === p.x && m.c.pos.y === p.y);
const inside = (state: GameState, box: number): Entity[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)] as Entity)
    .filter((e) => e.c.item?.containedIn === box);

/** Clears every monster off the level (so that only the test's own act). */
function clearMonsters(state: GameState, level: Level): void {
  for (const m of monsOn(state, level)) delete state.entities[String(m.id)];
}

/** Puts the hero at `p` of the level. */
function putHero(state: GameState, level: Level, p: Pos): void {
  getPlayer(state).c.pos = { level: level.id, x: p.x, y: p.y };
}

/** A monster of `def` at `p`, awake and hostile. */
function putMon(state: GameState, level: Level, def: string, p: Pos): Entity {
  const id = addMon(state, def, p.x, p.y);
  const m = state.entities[String(id)] as Entity;
  m.c.pos = { level: level.id, x: p.x, y: p.y };
  return m;
}

describe('the Castle', () => {
  test('builds on 80x21 with its moat, raised drawbridge, maze and up stairs', () => {
    for (const seed of [1, 2, 3, 4]) {
      const { state, level } = castle(seed);
      expect(level.def).toBe('nh:castle');
      expect([level.width, level.height]).toEqual([80, 21]);
      expect(levelFlags({ defs }, level)).toMatchObject({ noteleport: true, maze: true });
      // the drawbridge: raised, over the moat, its portcullis east of it
      const span = at(level, 5, 8);
      const wall = at(level, 6, 8);
      expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up);
      expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.dbwall_v);
      expect(drawbridgeData({ state }, level, span.x, span.y)).toEqual({
        dir: 'east',
        under: 'moat',
      });
      expect(isPool({ defs }, level, span.x, span.y)).toBe(true);
      expect(isMoat({ defs }, level, span.x, span.y)).toBe(true);
      expect(waterbodyName({ defs }, level, span.x, span.y)).toBe('liquid.name.moat');
      expect(isDrawbridgeWall({ state, defs }, level, wall.x, wall.y)).toBe('east');
      expect(findDrawbridge({ state, defs }, level, wall.x, wall.y)).toEqual(span);
      expect(nonDiggable({ defs }, level, wall.x, wall.y)).toBe(true);
      // the throne, the fountain, the court and the barracks
      const throne = at(level, 36, 8);
      expect(terrainIdAt(level, throne.x, throne.y)).toBe(T.throne);
      const f = at(level, 10, 8);
      expect(terrainIdAt(level, f.x, f.y)).toBe(T.fountain);
      expect(level.rooms.map((r) => r.type)).toEqual([COURT, BARRACKS, BARRACKS]);
      // the up stairs are in the maze west of the castle; no down stairs (the bottom level)
      const up = level.up as Pos;
      const block = at(level, 0, 0);
      expect(up.x).toBeLessThanOrEqual(9);
      expect(up.x).toBeLessThan(block.x);
      expect(terrainIdAt(level, up.x, up.y)).toBe(T.stairs_up);
      expect(level.down).toBeNull();
      // the maze around the castle was walked: floor west and east of the map
      const floorCols = (lo: number, hi: number): number =>
        level.cells.filter((c, i) => {
          const x = i % level.width;
          return x >= lo && x <= hi && level.palette[c] === T.floor;
        }).length;
      expect(floorCols(0, block.x - 1)).toBeGreaterThan(20);
      expect(floorCols(block.x + 63, level.width - 1)).toBeGreaterThan(20);
      // the sea monsters are in the moat, the soldiers at their posts
      for (const [x, y] of [
        [5, 7],
        [5, 9],
        [57, 7],
        [57, 9],
      ] as const)
        expect(monAtPos(state, level, at(level, x, y))?.def).toBe('nh:giant_eel');
      for (const [x, y] of [
        [5, 0],
        [5, 16],
        [57, 0],
        [57, 16],
      ] as const)
        expect(monAtPos(state, level, at(level, x, y))?.def).toBe('nh:shark');
      expect(monAtPos(state, level, at(level, 9, 8))?.def).toBe('nh:lieutenant');
      // the barracks are full of sleeping soldiers
      const barracks = level.rooms[1];
      const sleepers = monsOn(state, level).filter(
        (m) =>
          barracks &&
          (m.c.pos?.x ?? -1) >= barracks.lx &&
          (m.c.pos?.x ?? 99) <= barracks.hx &&
          (m.c.pos?.y ?? -1) >= barracks.ly &&
          (m.c.pos?.y ?? 99) <= barracks.hy,
      );
      expect(sleepers.length).toBeGreaterThan(10);
      // the court: one class per spot, from the castle's ten
      for (const [x, y] of [
        [27, 5],
        [37, 10],
        [36, 11],
      ] as const) {
        const m = monAtPos(state, level, at(level, x, y));
        if (m) expect('LNEHMORTXZ').toContain(defs.monster(m.def).glyph.ch);
      }
      // five trap doors in the hall to the throne room
      for (const x of [40, 44, 48, 52, 55]) {
        const p = at(level, x, 8);
        const t = level.traps.find((tr) => tr.x === p.x && tr.y === p.y);
        expect(['nh:trap_door', 'nh:falling_rock_trap']).toContain(t?.def);
      }
    }
  });

  test('the storerooms hold one class each, and a tower chest the wand of wishing', () => {
    for (const seed of [1, 2, 3]) {
      const { state, level } = castle(seed);
      const classes = new Set<string>();
      for (const [x1, y1] of [
        [39, 5],
        [49, 5],
        [39, 10],
        [49, 10],
      ] as const) {
        const here = new Set<string>();
        for (let y = y1; y <= y1 + 1; y++)
          for (let x = x1; x <= x1 + 6; x++) {
            const p = at(level, x, y);
            const items = itemsAt(defs, state, level.id, p.x, p.y);
            expect(items.length).toBeGreaterThan(0);
            for (const o of items) here.add(defs.object(o.def).class);
          }
        // a gem storeroom may hold rocks and gray stones (GEM_CLASS)
        const cls = [...here].filter((c) => c !== 'rock');
        expect(cls).toHaveLength(1);
        classes.add(cls[0] as string);
      }
      expect([...classes].sort()).toEqual(['armor', 'food', 'gem', 'weapon']);
      // the wand of wishing: in one tower corner, a locked untrapped chest under a cursed scroll
      const corners = [
        [4, 2],
        [58, 2],
        [4, 14],
        [58, 14],
      ].map(([x, y]) => at(level, x as number, y as number));
      const chests = corners.flatMap((p) =>
        itemsAt(defs, state, level.id, p.x, p.y).filter((o) => o.def === 'nh:chest'),
      );
      expect(chests).toHaveLength(1);
      const chest = chests[0] as Entity;
      expect(chest.c.item?.locked).toBe(true);
      expect(isBoxTrapped(state, chest.id)).toBe(false);
      expect(
        inside(state, chest.id)
          .map((o) => o.def)
          .sort(),
      ).toEqual(['nh:potion_of_gain_level', 'nh:wand_of_wishing']);
      const p = chest.c.pos as Pos;
      const scroll = itemsAt(defs, state, level.id, p.x, p.y).find(
        (o) => o.def === 'nh:scroll_of_scare_monster',
      );
      expect(scroll?.c.item?.buc).toBe('cursed');
      // under it a burned Elbereth (m16 step 6), which guards no objects (des.engraving())
      expect(engrAt({ state }, level, p.x, p.y)).toEqual({
        text: 'Elbereth',
        pristine: 'Elbereth',
        type: 'burn',
        time: 0,
      });
      // the lord's chest by the throne
      const lord = at(level, 37, 8);
      expect(itemsAt(defs, state, level.id, lord.x, lord.y).map((o) => o.def)).toContain(
        'nh:chest',
      );
    }
  });

  test('falling in from above lands west of the castle, outside its walls', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const { state, level } = castle(seed, 'random');
      const pos = getPlayer(state).c.pos;
      expect(pos?.level).toBe(level.id);
      const p = pos as Pos;
      expect(p.x).toBeLessThanOrEqual(9);
      expect(terrainIdAt(level, p.x, p.y)).not.toBe(T.moat);
    }
  });
});

describe('the drawbridge', () => {
  /** The Castle of `seed` with no monsters, the hero in the courtyard west of the bridge. */
  function bridge(seed: number): { state: GameState; level: Level; span: Pos; wall: Pos } {
    const { state, level } = castle(seed);
    clearMonsters(state, level);
    putHero(state, level, at(level, 3, 8));
    run(state, () => undefined); // she sees from there
    return { state, level, span: at(level, 5, 8), wall: at(level, 6, 8) };
  }

  test('opening lowers it, so that monsters can cross; closing raises it again', () => {
    const { state, level, span, wall } = bridge(1);
    const msgs = run(state, (ctx) => openDrawbridge(ctx, span.x, span.y));
    expect(msgs).toContain('You see a drawbridge coming down!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_down_h);
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.doorway);
    expect(isPool({ defs }, level, span.x, span.y)).toBe(false);
    expect(defs.terrain(T.drawbridge_down_h).passable).toBe(true);
    expect(uopenedDbridge({ state })).toBe(true);
    // the open portcullis is still the drawbridge's
    expect(isDrawbridgeWall({ state, defs }, level, wall.x, wall.y)).toBe('east');
    // a soldier walks out over it
    const soldier = putMon(state, level, 'nh:soldier', at(level, 7, 8));
    for (let i = 0; i < 10 && (soldier.c.pos?.x ?? 0) >= span.x; i++)
      engine.step(state, { type: 'search' });
    expect(soldier.c.pos?.x).toBeLessThanOrEqual(span.x);
    // closing (no one on it)
    clearMonsters(state, level);
    const up = run(state, (ctx) => closeDrawbridge(ctx, span.x, span.y));
    expect(up).toContain('You see a drawbridge coming up!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up);
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.dbwall_v);
  });

  test('a raised bridge coming down crushes an eel under it', () => {
    const { state, level, span } = bridge(2);
    const eel = putMon(state, level, 'nh:giant_eel', span);
    const msgs = run(state, (ctx) => openDrawbridge(ctx, span.x, span.y));
    expect(state.entities[String(eel.id)]).toBeUndefined();
    expect(msgs).toContain('The giant eel is crushed underneath the drawbridge.');
    // no corpse is left
    expect(
      itemsAt(defs, state, level.id, span.x, span.y).filter((o) => o.def === 'nh:corpse'),
    ).toHaveLength(0);
  });

  test('closing it on a soldier kills him; a bat may be missed and fly on', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const { state, level, span } = bridge(seed);
      run(state, (ctx) => openDrawbridge(ctx, span.x, span.y));
      const soldier = putMon(state, level, 'nh:soldier', span);
      run(state, (ctx) => closeDrawbridge(ctx, span.x, span.y));
      expect(state.entities[String(soldier.id)]).toBeUndefined();
    }
    let spared = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { state, level, span } = bridge(seed);
      run(state, (ctx) => openDrawbridge(ctx, span.x, span.y));
      const bat = putMon(state, level, 'nh:giant_bat', span);
      run(state, (ctx) => closeDrawbridge(ctx, span.x, span.y));
      const alive = state.entities[String(bat.id)];
      if (alive) {
        // missed, it flies over the moat where the bridge was
        expect(alive.c.pos).toMatchObject(span);
        spared++;
      }
    }
    expect(spared).toBeGreaterThan(0);
  });

  test('closing it on the hero crushes her under the portcullis or drops her in the moat', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 20 && seen.size < 2; seed++) {
      const { state, level, span } = bridge(seed);
      run(state, (ctx) => openDrawbridge(ctx, span.x, span.y));
      putHero(state, level, span);
      const msgs = run(state, (ctx) => closeDrawbridge(ctx, span.x, span.y));
      if (msgs.includes('You tumble towards the closed portcullis!')) {
        // she failed to jump: ridden in under the portcullis and crushed
        expect(msgs).toContain('The drawbridge closes in...');
        expect(state.gameOver?.killer).toBe('@killer.dbridge.closing');
        seen.add('crushed');
      } else {
        // she jumped clear and fell into the moat: she crawled out or drowned
        expect(msgs.some((m) => /water|moat/.test(m))).toBe(true);
        const p = getPlayer(state).c.pos as Pos;
        if (!state.gameOver) expect(isPool({ defs }, level, p.x, p.y)).toBe(false);
        seen.add('moat');
      }
    }
    expect([...seen].sort()).toEqual(['crushed', 'moat']);
  });

  test('destroying it leaves the moat and an empty doorway; the tune is useless', () => {
    const { state, level, span, wall } = bridge(3);
    const msgs = run(state, (ctx) => destroyDrawbridge(ctx, span.x, span.y));
    expect(msgs).toContain('The portcullis of the drawbridge falls into the moat!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.moat);
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.doorway);
    expect(drawbridgeData({ state }, level, span.x, span.y)).toBeNull();
    expect(isDrawbridgeWall({ state, defs }, level, wall.x, wall.y)).toBeNull();
    expect(uopenedDbridge({ state })).toBe(true);
    expect(uheardTune({ state })).toBe(3);
    // a lowered one collapses into the moat
    const b = bridge(4);
    run(b.state, (ctx) => openDrawbridge(ctx, b.span.x, b.span.y));
    const m2 = run(b.state, (ctx) => destroyDrawbridge(ctx, b.span.x, b.span.y));
    expect(m2).toContain('The drawbridge collapses into the moat!');
    expect(terrainIdAt(b.level, b.span.x, b.span.y)).toBe(T.moat);
  });

  test('a boulder that fills the moat under the raised bridge leaves floor under it', () => {
    let filled = false;
    for (let seed = 1; seed <= 10 && !filled; seed++) {
      const { state, level, span } = bridge(seed);
      run(state, (ctx) => {
        const b = mksobj(ctx, ctx.defs.object('nh:boulder'));
        boulderHitsPool(ctx, ctx.state.entities[String(b)] as Entity, span.x, span.y, false);
      });
      if (terrainIdAt(level, span.x, span.y) === T.moat) continue;
      if (terrainIdAt(level, span.x, span.y) === T.drawbridge_up_floor) {
        filled = true;
        expect(drawbridgeData({ state }, level, span.x, span.y)?.under).toBe('floor');
        expect(isPool({ defs }, level, span.x, span.y)).toBe(false);
      }
    }
    expect(filled).toBe(true);
  });
});

describe('opening the drawbridge (step 8)', () => {
  /** The Castle of `seed` with no monsters, the tune set, the hero next to the span (west). */
  function bank(seed: number, tune = 'BADGE') {
    const { state, level } = castle(seed);
    clearMonsters(state, level);
    putHero(state, level, at(level, 4, 8));
    let bugle = 0;
    run(state, (ctx) => {
      setCastleTune(ctx, tune);
      bugle = mksobj(ctx, ctx.defs.object('nh:bugle'), {
        init: false,
        carriedBy: ctx.state.playerId,
      });
    });
    return { state, level, bugle, span: at(level, 5, 8), wall: at(level, 6, 8) };
  }
  const step = (state: GameState, a: Parameters<typeof engine.step>[1]) => engine.step(state, a);
  const answer = (state: GameState, value: unknown) => {
    const p = state.pendingPrompt?.prompt;
    if (!p) throw new Error('no prompt');
    return step(state, { type: 'answer', promptId: p.id, value: value as never });
  };
  /** Applies the bugle, answers "no" to "Improvise?" and types `notes`; the messages. */
  function play(state: GameState, bugle: number, notes: string): string[] {
    const r = step(state, { type: 'mod', action: APPLY_ID, args: { item: bugle } });
    expect(r.prompt?.id).toBe('music-improvise');
    const r2 = answer(state, false);
    expect(r2.prompt?.id).toBe('music-tune');
    return texts(answer(state, notes).events);
  }

  test('the right tune lowers the drawbridge, then "Play the passtune?" raises it', () => {
    const { state, level, bugle, span, wall } = bank(1);
    const t0 = state.turn;
    // typed in lower case, with spaces around and an H for the B
    const msgs = play(state, bugle, '  hadge ');
    expect(msgs).toContain('You extract a strange sound from the bugle!');
    expect(msgs).toContain('You see a drawbridge coming down!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_down_h);
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.doorway);
    expect(uheardTune({ state })).toBe(2);
    expect(uopenedDbridge({ state })).toBe(true);
    expect(state.turn).toBeGreaterThan(t0);
    // she knows it now
    step(state, { type: 'mod', action: APPLY_ID, args: { item: bugle } });
    const r = answer(state, false);
    expect(r.prompt?.id).toBe('music-passtune');
    expect(texts(r.events)).toEqual([]);
    expect(texts(answer(state, true).events)).toContain('You see a drawbridge coming up!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up);
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.dbwall_v);
  });

  test('a wrong tune gives the tumblers and gears; five right notes and more teach it', () => {
    expect(tuneClues('ABCED', 'ABCDE')).toEqual({ tumblers: 2, gears: 3 });
    expect(tuneClues('EAAAA', 'ABCDE')).toEqual({ tumblers: 2, gears: 0 });
    expect(tuneClues('AGGGG', 'ABCDE')).toEqual({ tumblers: 0, gears: 1 });
    expect(tuneClues('ABCDEA', 'ABCDE')).toEqual({ tumblers: 0, gears: 5 });
    expect(tuneClues('FFFFF', 'ABCDE')).toEqual({ tumblers: 0, gears: 0 });
    const { state, level, bugle, span } = bank(2, 'ABCDE');
    expect(play(state, bugle, 'abced')).toContain('You hear 2 tumblers click and 3 gears turn.');
    expect(uheardTune({ state })).toBe(1);
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up);
    expect(play(state, bugle, 'eaaaa')).toContain('You hear 2 tumblers click.');
    expect(play(state, bugle, 'aggg')).toContain('You hear 1 gear turn.');
    expect(uheardTune({ state })).toBe(1);
    const msgs = play(state, bugle, 'ABCDEA');
    expect(msgs).toContain('You hear 5 gears turn.');
    expect(uheardTune({ state })).toBe(2);
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up); // not opened
  });

  test('away from the drawbridge a wrong tune gives no clue; cancelling is "Never mind."', () => {
    const { state, level, bugle } = bank(3, 'ABCDE');
    putHero(state, level, at(level, 1, 8));
    const msgs = play(state, bugle, 'abced');
    expect(msgs).toEqual(['You extract a strange sound from the bugle!']);
    expect(uheardTune({ state })).toBe(1);
    // cancelling the question takes no time
    const t0 = state.turn;
    step(state, { type: 'mod', action: APPLY_ID, args: { item: bugle } });
    expect(texts(answer(state, null).events)).toEqual(['Never mind.']);
    step(state, { type: 'mod', action: APPLY_ID, args: { item: bugle } });
    answer(state, false);
    expect(texts(answer(state, null).events)).toEqual(['Never mind.']);
    expect(state.turn).toBe(t0);
  });

  test('a stunned hero always improvises', () => {
    const { state, bugle } = bank(4);
    setItimeout(state, getPlayer(state), P.STUNNED, 5);
    const r = step(state, { type: 'mod', action: APPLY_ID, args: { item: bugle } });
    expect(r.prompt).toBeNull();
    expect(texts(r.events)).toContain('You radiate an obnoxious droning sound.');
  });

  /** Zaps a carried wand of `def` in `dir`; the messages. */
  function zap(state: GameState, def: DefId, dir: string): string[] {
    let w = 0;
    run(state, (ctx) => {
      w = mksobj(ctx, ctx.defs.object(def), { init: false, carriedBy: ctx.state.playerId });
      const it = ctx.state.entities[String(w)]?.c.item;
      if (it) it.spe = 5;
    });
    const r = step(state, { type: 'mod', action: 'nh:zap' as DefId, args: { item: w } });
    return [...texts(r.events), ...texts(answer(state, dir).events)];
  }

  test('wands: opening lowers it, locking raises it, striking breaks the lowered bridge', () => {
    const { state, level, span, wall } = bank(5);
    expect(zap(state, 'nh:wand_of_opening', 'e')).toContain('You see a drawbridge coming down!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_down_h);
    expect(zap(state, 'nh:wand_of_locking', 'e')).toContain('You see a drawbridge coming up!');
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.dbwall_v);
    zap(state, 'nh:wand_of_opening', 'e');
    expect(zap(state, 'nh:wand_of_striking', 'e')).toContain(
      'The drawbridge collapses into the moat!',
    );
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.moat);
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.doorway);
    expect(uheardTune({ state })).toBe(3);
    // striking a raised one passes over the moat and breaks the portcullis
    const b = bank(6);
    expect(zap(b.state, 'nh:wand_of_striking', 'e')).toContain(
      'The portcullis of the drawbridge falls into the moat!',
    );
    expect(terrainIdAt(b.level, b.span.x, b.span.y)).toBe(T.moat);
  });

  test('locking zapped down on the lowered bridge raises it', () => {
    for (const seed of [1, 2, 3]) {
      const { state, level, span } = bank(seed);
      zap(state, 'nh:wand_of_opening', 'e');
      putHero(state, level, span);
      zap(state, 'nh:wand_of_locking', 'down');
      // whatever became of her, the bridge is up
      expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up);
    }
  });

  test("a soldier's wand of striking breaks the lowered bridge through the portcullis", () => {
    const { state, level, span, wall } = bank(7);
    zap(state, 'nh:wand_of_opening', 'e');
    putHero(state, level, at(level, 3, 8));
    const soldier = putMon(state, level, 'nh:soldier', at(level, 8, 8));
    const msgs = run(state, (ctx) => {
      const w = mksobj(ctx, ctx.defs.object('nh:wand_of_striking'), {
        init: false,
        carriedBy: soldier.id,
      });
      const it = ctx.state.entities[String(w)]?.c.item;
      if (it) it.spe = 5;
      const c = findOffensive(ctx, soldier.id);
      expect(c?.kind).toBe('wan_striking');
      if (c) useOffensive(ctx, soldier.id, c);
    });
    expect(msgs).toContain('The drawbridge collapses into the moat!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.moat);
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.doorway);
  });

  test('cold freezes the moat under the raised bridge and fire melts it again', () => {
    const { state, level, span } = bank(8);
    const cold = run(state, (ctx) => {
      coldOverLiquid(ctx, level, span.x, span.y);
    });
    expect(cold).toContain('The moat is bridged with ice!');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up_ice);
    expect(drawbridgeData({ state }, level, span.x, span.y)).toEqual({ dir: 'east', under: 'ice' });
    const fire = run(state, (ctx) => {
      fireOverLiquid(ctx, level, span.x, span.y);
    });
    expect(fire).toContain('The ice crackles and melts.');
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up);
    expect(drawbridgeData({ state }, level, span.x, span.y)?.under).toBe('moat');
    expect(meltTimeLeft({ state }, level.id, span.x, span.y)).toBe(0);
    // frozen again and then destroyed, it leaves the ice
    run(state, (ctx) => {
      coldOverLiquid(ctx, level, span.x, span.y);
      destroyDrawbridge(ctx, span.x, span.y);
    });
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.ice);
  });

  test('digging: a lowered bridge is destroyed, a frozen raised one floods again', () => {
    const { state, level, span } = bank(9);
    run(state, (ctx) => openDrawbridge(ctx, span.x, span.y));
    expect(run(state, (ctx) => void dighole(ctx, true, true, span))).toContain(
      'The drawbridge seems too hard to dig through.',
    );
    expect(run(state, (ctx) => void dighole(ctx, false, true, span))).toContain(
      'The drawbridge collapses into the moat!',
    );
    expect(drawbridgeData({ state }, level, span.x, span.y)).toBeNull();
    // the raised span over ice: the hole fills with water from the moat, or it is too hard
    let flooded = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const b = bank(seed);
      run(b.state, (ctx) => void coldOverLiquid(ctx, b.level, b.span.x, b.span.y));
      const msgs = run(b.state, (ctx) => void dighole(ctx, false, true, b.span));
      const under = drawbridgeData({ state: b.state }, b.level, b.span.x, b.span.y)?.under;
      if (msgs.includes('As you dig, the hole fills with water!')) {
        flooded++;
        expect(under).toBe('moat');
        expect(terrainIdAt(b.level, b.span.x, b.span.y)).toBe(T.drawbridge_up);
      } else {
        expect(msgs).toContain('The ice there is too hard to dig in.');
        expect(under).toBe('ice');
      }
    }
    expect(flooded).toBeGreaterThan(0);
  });

  test('kicking the raised portcullis hurts and leaves it', () => {
    const { state, level, span, wall } = bank(10);
    putHero(state, level, at(level, 7, 8));
    const r = step(state, { type: 'mod', action: 'nh:kick' as DefId, args: { dir: 'w' } });
    const msgs = texts(r.events);
    expect(msgs).toContain('Ouch!  That hurts!');
    expect(msgs).toContain('The drawbridge is unaffected.');
    expect(terrainIdAt(level, wall.x, wall.y)).toBe(T.dbwall_v);
    expect(terrainIdAt(level, span.x, span.y)).toBe(T.drawbridge_up);
  });
});

describe('prayer reveals the tune (step 8)', () => {
  /** Prays on a coaligned altar with high Luck until a pat on the head hints at the tune. */
  function prayFor(seed: number, opened: boolean): string[] {
    const s = levelSetup(['.......', '...@...', '.......'], seed);
    const level = getLevel(s.state);
    let i = level.palette.indexOf('nh:altar_neutral');
    if (i === -1) i = level.palette.push('nh:altar_neutral') - 1;
    level.cells[1 * level.width + 3] = i;
    s.step({ type: 'wait' });
    setCastleTune(s.ctx, 'BADGE');
    if (opened) setUopenedDbridge(s.ctx);
    const out: string[] = [];
    for (let n = 0; n < 40; n++) {
      setU(s.ctx, { ublesscnt: 0, alignRecord: 20, luck: 10 });
      s.mod('nh:pray');
      const p = s.state.pendingPrompt?.prompt;
      if (!p) break;
      out.push(...s.text(s.step({ type: 'answer', promptId: p.id, value: true })));
      if (s.state.gameOver) break;
    }
    out.push(`heard:${uheardTune(s.ctx)}`);
    return out;
  }

  test('"Hark, mortal!", then the divine music with the notes', () => {
    let hinted = false;
    for (let seed = 1; seed <= 6 && !hinted; seed++) {
      const out = prayFor(seed, false);
      const hark = out.indexOf('"Hark, mortal!"');
      if (hark < 0) continue;
      expect(out[hark + 1]).toBe('"To enter the castle, thou must play the right tune!"');
      const music = out.indexOf('You hear a divine music...');
      if (music < 0) continue;
      hinted = true;
      expect(music).toBeGreaterThan(hark);
      expect(out[music + 1]).toBe('It sounds like:  "BADGE".');
      expect(out.at(-1)).toBe('heard:2');
    }
    expect(hinted).toBe(true);
  });

  test('once the drawbridge is opened, the hint is the golden glow', () => {
    for (let seed = 1; seed <= 3; seed++) {
      const out = prayFor(seed, true);
      expect(out).not.toContain('"Hark, mortal!"');
      expect(out.at(-1)).toBe('heard:0');
    }
  });
});
