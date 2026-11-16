// m21 step 6: the Rogue level's look and doorways. The view is drawn through the Rogue symbol set
// (stairs `%`, every door `+`, armour `]`, amulets `,`, food `:`, gold `*`, no colour) and goes
// back to the ordinary glyphs on any other level; its doorways cannot be entered or left
// diagonally, by the hero, by travel or by monsters, while ordinary doorways still can.
// ref: src/symbols.c init_rogue_symbols(); src/drawing.c def_r_oc_syms[]; src/display.c
// reset_glyphmap() (GMAP_ROGUELEVEL); src/do.c goto_level() assign_graphics(); src/hack.c
// doorless_door(), test_move(); src/mon.c mfndpos()
import {
  buildSnapshot,
  cellRules,
  createEngine,
  diffSnapshot,
  getLevel,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { ROGUE } from '../src/levelflags';
import { mfndpos } from '../src/monmove';
import { ROGUE_SYMSET } from '../src/symset';
import { T } from '../src/terrain';
import { defs } from './itemHelpers';
import { heroAt, mapSetup, newtAt, travelTo } from './maps';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'rl',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'rl:run',
      labelKey: 'rl',
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
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'rl:run' as DefId });
};
const rogueDlevel = (state: GameState): number =>
  state.dungeons[0]?.special.find((s) => s.id === 'nh:rogue')?.dlevel ?? -1;
const GRAY = '#aaaaaa';

describe('the Rogue level is drawn with Rogue’s symbols and no colour', () => {
  for (const seed of [2101, 2102, 2103]) {
    test(`seed ${seed}: there, and back to normal a level up`, () => {
      const { state } = engine.newGame({ seed });
      const dl = rogueDlevel(state);
      const before = buildSnapshot(engine.registry, state);
      expect(before.symset).toBeUndefined();
      run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: dl }, 'random'));
      expect(getLevel(state).def).toBe(ROGUE);
      const s = buildSnapshot(engine.registry, state);
      expect(s.symset).toBe(ROGUE_SYMSET.id);
      const ch = (id: string): string | undefined => s.legend[id as DefId]?.ch;
      expect([ch(T.stairs_up), ch(T.stairs_down)]).toEqual(['%', '%']);
      for (const d of [T.doorway, T.door_open_v, T.door_open_h, T.door_closed, T.door_locked])
        expect(ch(d)).toBe('+');
      expect(ch('nh:food_ration')).toBe(':');
      expect(ch('nh:gold_piece')).toBe('*');
      expect(ch('nh:ring_mail')).toBe(']');
      expect(ch('nh:fake_amulet_of_yendor')).toBe(',');
      // randomized descriptions follow their class too
      const amuletLooks = engine.registry.appearances.filter((a) => a.class === 'amulet');
      expect(amuletLooks.length).toBeGreaterThan(0);
      for (const a of amuletLooks) expect(ch(a.id)).toBe(',');
      // what C leaves alone: walls, floor, corridors, ladders, weapons, gems, monsters, traps
      for (const id of [
        T.vwall,
        T.hwall,
        T.floor,
        T.corr,
        'nh:ladder_up',
        'nh:dagger',
        'nh:ruby',
      ] as DefId[])
        expect(ch(id)).toBe(
          engine.registry.isObject(id)
            ? engine.registry.object(id).glyph.ch
            : engine.registry.terrain(id).glyph.ch,
        );
      expect(ch('nh:ghost')).toBe(' ');
      expect(ch('nh:jackal')).toBe('d');
      expect(ch('nh:bear_trap')).toBe('^');
      // no colour at all
      expect(Object.values(s.legend).every((g) => g.fg === GRAY)).toBe(true);
      // the map's stairs are drawn as '%'
      const level = getLevel(state);
      for (const p of [level.up, level.down]) {
        expect(p).not.toBeNull();
        if (p)
          expect(ch(level.palette[level.cells[p.y * level.width + p.x] ?? -1] ?? '')).toBe('%');
      }

      // a level up: a full snapshot with the ordinary glyphs
      run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: dl - 1 }, 'random'));
      const up = buildSnapshot(engine.registry, state);
      expect(diffSnapshot(s, up).kind).toBe('full');
      expect(up.symset).toBeUndefined();
      expect(up.legend).toEqual(before.legend);
      expect(up.legend[T.stairs_up]?.ch).toBe('<');
      expect(up.legend['nh:food_ration']?.ch).toBe('%');
    });
  }
});

// a room's west wall with a doorway at (4,2), a corridor beyond it
const MAP = ['     -----', '     |...|', '#####o...|', '     |...|', '     -----'];
const DOOR = { x: 5, y: 2 };

function setup(rogueLevel: boolean, at: { x: number; y: number }) {
  const m = mapSetup(MAP);
  if (rogueLevel) m.level.def = ROGUE;
  const p = m.state.entities[String(m.state.playerId)]!.c.pos!;
  Object.assign(p, at);
  return m;
}

describe('Rogue doorways block diagonal moves', () => {
  test('the hero cannot step diagonally into or out of one; orthogonally she can', () => {
    const into = setup(true, { x: 6, y: 1 });
    into.step({ type: 'move', dir: 'sw' });
    expect(heroAt(into.state)).toEqual({ x: 6, y: 1 });
    into.step({ type: 'move', dir: 's' });
    into.step({ type: 'move', dir: 'w' });
    expect(heroAt(into.state)).toEqual(DOOR);
    into.step({ type: 'move', dir: 'ne' });
    expect(heroAt(into.state)).toEqual(DOOR);
  });

  test('on an ordinary level the same doorway lets her through diagonally', () => {
    const m = setup(false, { x: 6, y: 1 });
    m.step({ type: 'move', dir: 'sw' });
    expect(heroAt(m.state)).toEqual(DOOR);
    m.step({ type: 'move', dir: 'ne' });
    expect(heroAt(m.state)).toEqual({ x: 6, y: 1 });
  });

  test('travel goes round: one move more than cutting the corner', () => {
    const turns = (rogueLevel: boolean): number => {
      const m = setup(rogueLevel, { x: 6, y: 1 });
      const t0 = m.state.turn;
      m.step(travelTo(3, 2));
      expect(heroAt(m.state)).toEqual({ x: 3, y: 2 });
      return m.state.turn - t0;
    };
    expect(turns(true)).toBe(turns(false) + 1);
  });

  test('a monster beside it cannot step in diagonally either', () => {
    const cands = (rogueLevel: boolean): string[] => {
      const m = setup(rogueLevel, { x: 1, y: 2 });
      const newt = newtAt(m.state, 6, 3);
      const level: Level = getLevel(m.state);
      return mfndpos(m.ctx as unknown as Ctx, level, cellRules(level, defs), newt, {
        x: 1,
        y: 2,
      }).map((c) => `${c.x},${c.y}`);
    };
    expect(cands(true)).not.toContain('5,2');
    expect(cands(false)).toContain('5,2');
    // and one standing in it cannot leave diagonally
    const m = setup(true, { x: 1, y: 2 });
    const newt = newtAt(m.state, DOOR.x, DOOR.y);
    const level = getLevel(m.state);
    const out = mfndpos(m.ctx as unknown as Ctx, level, cellRules(level, defs), newt, {
      x: 1,
      y: 2,
    }).map((c) => `${c.x},${c.y}`);
    expect(out).toContain('6,2');
    expect(out).toContain('4,2');
    expect(out).not.toContain('6,1');
    expect(out).not.toContain('6,3');
  });
});
