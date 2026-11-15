// m16 step 7: graves. The grave terrain with its headstone (make_grave()), graves made with the
// level (mkgrave() in ordinary rooms, fill_zoo()'s morgue graves), `E` on a grave (fingers only
// smudge, the first stylus disturbs the undead, engraving adds to the epitaph, anything else
// cannot wipe it out), reading it, the wizard terrain wish, digging refused and the look.
// Outcomes over many made levels and rooms, not one lucky seed.
// ref: src/engrave.c make_grave(), disturb_grave(), doengrave(); src/mklev.c mkgrave();
// src/mkroom.c fill_zoo(); src/objnam.c wizterrainwish(); src/invent.c dfeature_at()
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  sortedIds,
  type Ctx,
  type EntityId,
  type GameState,
  type Level,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { MORGUE, fillZoo, vanillaMod } from '../src/index';
import { dighole } from '../src/dig';
import { engrAt, engravingsOn } from '../src/engr';
import { EPITAPH_TEXTS } from '../src/epitaph';
import { graveDisturbed, isGrave, makeGrave, setGraveDisturbed } from '../src/grave';
import { mkgrave } from '../src/mklev';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { TRAP, maketrap } from '../src/trap';
import { wizTerrainWish } from '../src/wizard/terrainwish';
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
function withCtx(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return engine
    .step(state, { type: 'mod', action: 'probe:run' })
    .events.flatMap((e) =>
      e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
    );
}

type Setup = ReturnType<typeof levelSetup>;

/** A 5x3 room with the hero in the middle on a grave, and nothing in her pack. */
function onGrave(epitaph = 'Here lies Bob.'): Setup {
  const s = levelSetup();
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  expect(makeGrave(s.ctx, lvl(s), s.here.x, s.here.y, epitaph)).toBe(true);
  return s;
}
const lvl = (s: Setup): Level => s.state.levels['dlvl1'] as Level;
const here = (s: Setup) => engrAt(s.ctx, lvl(s), s.here.x, s.here.y);
const pending = (s: Setup): string | undefined => s.state.pendingPrompt?.prompt.id;
const answer = (s: Setup, value: unknown) =>
  s.step({ type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never });
function engraveWith(s: Setup, stylus: 'fingers' | EntityId): string[] {
  s.mod('nh:engrave');
  expect(pending(s)).toBe('engrave-with');
  return s.text(answer(s, stylus));
}
const monsters = (state: GameState): string[] =>
  sortedIds(state)
    .map((id) => state.entities[String(id)]!)
    .filter((e) => e.c.monster && e.id !== state.playerId)
    .map((e) => e.def);

describe('make_grave()', () => {
  test('floor becomes a grave with a headstone; a random epitaph; time 0; replaces engravings', () => {
    const s = levelSetup();
    const level = lvl(s);
    makeGrave(s.ctx, level, 1, 1, null);
    expect(terrainIdAt(level, 1, 1)).toBe(T.grave);
    const e = engrAt(s.ctx, level, 1, 1)!;
    expect(e).toMatchObject({ type: 'headstone', time: 0 });
    expect(EPITAPH_TEXTS).toContain(e.text);
    // again on the grave: a new headstone
    makeGrave(s.ctx, level, 1, 1, 'Saved by the bell!');
    expect(engrAt(s.ctx, level, 1, 1)?.text).toBe('Saved by the bell!');
  });

  test('not on a corridor, nor on a trap', () => {
    const s = levelSetup();
    const level = lvl(s);
    setTerrain(level, 0, 0, T.corr);
    expect(makeGrave(s.ctx, level, 0, 0, null)).toBe(false);
    expect(terrainIdAt(level, 0, 0)).toBe(T.corr);
    withCtx(s.state, (ctx) => void maketrap(ctx, 'dlvl1', 4, 2, TRAP.arrow));
    expect(makeGrave(s.ctx, level, 4, 2, null)).toBe(false);
    expect(engrAt(s.ctx, level, 4, 2)).toBeNull();
  });

  test('a headstone never wears, and is no Elbereth', () => {
    const s = onGrave('Elbereth');
    const before = structuredClone(here(s));
    for (let i = 0; i < 20; i++) s.step({ type: 'search' });
    expect(here(s)).toEqual(before);
  });
});

describe('graves made with the level', () => {
  test('mkgrave(): away from doors, an epitaph or "Saved by the bell!", 1 in 10 the bell', () => {
    let graves = 0;
    let bells = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = levelSetup(['.......', '.......', '.......', '.......', '.......'], seed);
      const level = lvl(s);
      level.rooms.push({ lx: 0, ly: 0, hx: 6, hy: 4, lit: true });
      withCtx(s.state, (ctx) => mkgrave(ctx, getLevel(ctx.state), level.rooms[0]!));
      const made = engravingsOn(s.ctx, getLevel(s.state));
      expect(made.length).toBeLessThanOrEqual(1);
      for (const { x, y, e } of made) {
        graves++;
        expect(terrainIdAt(getLevel(s.state), x, y)).toBe(T.grave);
        expect(e.type).toBe('headstone');
        if (e.text === 'Saved by the bell!') bells++;
        else expect(EPITAPH_TEXTS).toContain(e.text);
      }
      // what it buried is gone: nothing lies about
      expect(
        sortedIds(s.state).filter((id) => s.state.entities[String(id)]?.c.pos?.level === 'dlvl1'),
      ).toEqual([s.state.playerId]);
    }
    expect(graves).toBe(40);
    expect(bells).toBeGreaterThan(0);
    expect(bells).toBeLessThan(15);
  });

  test('not in a special room', () => {
    const s = levelSetup(['.....', '.....', '.....']);
    lvl(s).rooms.push({ lx: 0, ly: 0, hx: 4, hy: 2, lit: true, type: MORGUE });
    withCtx(s.state, (ctx) => mkgrave(ctx, getLevel(ctx.state), getLevel(ctx.state).rooms[0]!));
    expect(engravingsOn(s.ctx, getLevel(s.state))).toEqual([]);
  });

  test('ordinary rooms of new levels get a few graves (1 in 80 - 2 * depth)', () => {
    let graves = 0;
    for (let seed = 1; seed <= 12; seed++) {
      const { state } = engine.newGame({ seed });
      for (let dlevel = 1; dlevel <= 8; dlevel++) {
        if (dlevel > 1)
          withCtx(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel }, 'up'));
        const level = getLevel(state);
        for (const { x, y, e } of engravingsOn({ state }, level)) {
          if (e.type !== 'headstone') continue;
          graves++;
          expect(isGrave(level, x, y)).toBe(true);
          const room = level.rooms.find((r) => x >= r.lx && x <= r.hx && y >= r.ly && y <= r.hy);
          expect(room?.type).toBeUndefined();
        }
      }
    }
    expect(graves).toBeGreaterThan(0);
  });

  test('a morgue: graves on about 1 square in 5, each with an epitaph', () => {
    let squares = 0;
    let graves = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = levelSetup(['.......', '.......', '.......', '.......', '.......'], seed);
      const level = lvl(s);
      level.depth = 9;
      level.rooms.push({ lx: 1, ly: 1, hx: 5, hy: 3, lit: true, type: MORGUE });
      getPlayer(s.state).c.pos = { level: 'dlvl1', x: 0, y: 0 };
      withCtx(s.state, (ctx) => fillZoo(ctx, getLevel(ctx.state), 0));
      squares += 15;
      for (const { x, y, e } of engravingsOn(s.ctx, getLevel(s.state))) {
        graves++;
        expect(isGrave(getLevel(s.state), x, y)).toBe(true);
        expect(e.type).toBe('headstone');
        expect(EPITAPH_TEXTS).toContain(e.text);
      }
    }
    expect(graves).toBeGreaterThan(squares / 12);
    expect(graves).toBeLessThan(squares / 2.5);
  });
});

describe('`E` on a grave', () => {
  test('fingers: "You would only make a small smudge on the headstone.", no time', () => {
    const s = onGrave();
    const turn = s.state.turn;
    expect(engraveWith(s, 'fingers')).toEqual([
      'You would only make a small smudge on the headstone.',
    ]);
    expect(s.state.turn).toBe(turn);
    expect(graveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y)).toBe(false);
  });

  test('the first stylus disturbs the undead: a ghoul next to her, once', () => {
    const s = onGrave();
    const dagger = s.carry('nh:dagger');
    const turn = s.state.turn;
    expect(engraveWith(s, dagger)).toEqual(['You disturb the undead!']);
    expect(s.state.turn).toBe(turn);
    expect(graveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y)).toBe(true);
    expect(monsters(s.state)).toEqual(['nh:ghoul']);
    expect(here(s)?.text).toBe('Here lies Bob.');
    // the second time it engraves: adding to the epitaph, no question
    const t = engraveWith(s, dagger);
    expect(t).toEqual(['You add to the epitaph on the headstone with a dagger.']);
    expect(pending(s)).toBe('engrave');
    answer(s, 'X');
    expect(here(s)).toMatchObject({ type: 'headstone' });
    expect(here(s)!.text.startsWith('Here lies Bob.')).toBe(true);
    expect(here(s)!.text.endsWith('X')).toBe(true);
    expect(monsters(s.state)).toEqual(['nh:ghoul']);
  });

  test('anything but engraving cannot wipe out the epitaph (a move)', () => {
    const s = onGrave();
    setGraveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y, true);
    const boots = s.carry('nh:low_boots');
    const turn = s.state.turn;
    expect(engraveWith(s, boots)).toEqual([
      'You cannot wipe out the message that is engraved in the headstone here.',
    ]);
    expect(s.state.turn).toBe(turn + 1);
    expect(here(s)?.text).toBe('Here lies Bob.');
  });

  test('a wand of digging: "Chips fly out from the headstone."', () => {
    const s = onGrave();
    setGraveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y, true);
    const w = s.carry('nh:wand_of_digging');
    s.state.entities[String(w)]!.c.item!.spe = 5;
    expect(engraveWith(s, w).at(-1)).toBe(
      'You add to the epitaph on the headstone with a wand of digging.',
    );
    expect(s.text(answer(s, 'Y'))[0]).toBe('Chips fly out from the headstone.');
    expect(here(s)).toMatchObject({ type: 'headstone' });
    expect(here(s)!.text.endsWith('Y')).toBe(true);
  });
});

describe('reading and looking', () => {
  test('"Something is engraved here on the headstone." and the epitaph; the look names it', () => {
    const s = onGrave();
    expect(s.text(s.mod('nh:look'))).toEqual([
      'There is a grave here.',
      'Something is engraved here on the headstone.',
      'You read: "Here lies Bob."', // its own end punctuation
    ]);
  });

  test('#sit: "You sit on the grave."', () => {
    const s = onGrave();
    expect(s.text(s.mod('nh:sit'))).toEqual(['You sit on the grave.']);
  });

  test('digging down is refused: "The headstone here is too hard to dig in."', () => {
    const s = onGrave();
    const lines = withCtx(s.state, (ctx) => void dighole(ctx, false, true));
    expect(lines).toEqual(['The headstone here is too hard to dig in.']);
    expect(isGrave(lvl(s), s.here.x, s.here.y)).toBe(true);
    expect(lvl(s).traps).toEqual([]);
  });
});

describe('the wizard terrain wish', () => {
  test('"grave", "looted grave" (disturbed), "headstone"; not on a trap', () => {
    const s = levelSetup();
    const wish = (w: string): string[] => withCtx(s.state, (ctx) => void wizTerrainWish(ctx, w));
    expect(wish('grave')).toEqual(['A grave.']);
    expect(isGrave(lvl(s), s.here.x, s.here.y)).toBe(true);
    expect(EPITAPH_TEXTS).toContain(here(s)?.text);
    expect(graveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y)).toBe(false);
    expect(wish('looted grave')).toEqual(['A disturbed grave.']);
    expect(graveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y)).toBe(true);
    expect(wish('headstone')).toEqual(['A grave.']);
    expect(graveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y)).toBe(false);
    // another terrain over it takes the disturbed bit along
    wish('looted grave');
    wish('tree');
    expect(graveDisturbed(s.ctx, lvl(s), s.here.x, s.here.y)).toBe(false);

    const t = levelSetup();
    withCtx(t.state, (ctx) => void maketrap(ctx, 'dlvl1', t.here.x, t.here.y, TRAP.arrow));
    expect(withCtx(t.state, (ctx) => void wizTerrainWish(ctx, 'grave'))).toEqual([
      "Can't place a grave here.",
    ]);
    expect(isGrave(lvl(t), t.here.x, t.here.y)).toBe(false);
  });
});
