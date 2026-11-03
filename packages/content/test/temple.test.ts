// Milestone 6b2 step 3: entering the temple. u.urooms follows the hero (check_special_room());
// entering a tended temple gives the priest's greeting and a feeling, each limited by its timer
// (intemple()); an untended one an eerie feeling; a coaligned temple is a sanctuary that hostile
// monsters will not enter and flee from (in_your_sanctuary(), mfndpos(), distfleeck()).
import {
  cellIndex,
  createEngine,
  getLevel,
  getPlayer,
  type Ctx,
  type DefId,
  type Dir,
  type Pos,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  T,
  checkSpecialRoom,
  epriOf,
  isFleeing,
  priestini,
  setU,
  uRooms,
  vanillaMod,
} from '../src/index';
import { addMon, setup } from './helpers';
import { ctxFor } from './itemHelpers';

// A temple (interior 1..5 x 1..5, altar at 3,3) with a doorway east onto a corridor of floor.
const MAP = [
  '-------         ',
  '|.....|         ',
  '|.....|         ',
  '|.....o.........',
  '|.....|         ',
  '|.....|         ',
  '-------         ',
];
const ALTAR = { x: 3, y: 3 };
const DOOR = { x: 6, y: 3 };
const inTemple = (p: { x: number; y: number }): boolean =>
  p.x >= 0 && p.x <= 6 && p.y >= 0 && p.y <= 6;

type S = ReturnType<typeof setup>;
const ctxOf = (s: S): Ctx => ctxFor(s.state) as unknown as Ctx;
const hero = (s: S) => getPlayer(s.state);
const put = (s: S, id: number, x: number, y: number): void => {
  const p = s.state.entities[String(id)]?.c.pos;
  if (p) Object.assign(p, { x, y });
};
/** Pins a monster: speed 0, so it never acts. */
const pin = (s: S, id: number): void => {
  const a = s.state.entities[String(id)]?.c.actor;
  if (a) a.speed = 0;
};
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const move = (s: S, dir: Dir): string[] => keys(s.engine.step(s.state, { type: 'move', dir }));

/**
 * The temple with an altar of `altar` (a shrine unless `desecrated`), the hero (alignment record
 * `record`) in the corridor at 8,3, and, when `tended`, its priest pinned on his altar.
 */
function temple(
  seed: number,
  o: { altar?: DefId; tended?: boolean; desecrated?: boolean; record?: number } = {},
) {
  const s = setup(MAP, seed);
  const level = s.level;
  const altar = o.altar ?? T.altar_neutral;
  let i = level.palette.indexOf(altar);
  if (i === -1) i = level.palette.push(altar) - 1;
  level.cells[cellIndex(level, ALTAR.x, ALTAR.y)] = i;
  level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 5, lit: true, type: 'nh:temple' }];
  level.shrines = [{ ...ALTAR }];
  put(s, s.state.playerId, 8, 3);
  setU(s, { alignType: 0, alignRecord: o.record ?? 0 });
  let priest: number | null = null;
  if (o.tended !== false) {
    priest = priestini(ctxOf(s), level, 0, ALTAR);
    if (priest === null) throw new Error('no priest');
    put(s, priest, ALTAR.x, ALTAR.y);
    pin(s, priest);
  }
  if (o.desecrated) delete level.shrines;
  checkSpecialRoom(ctxOf(s), false);
  return { ...s, priest };
}

const TEMPLE_KEYS = [
  'priest.intones',
  'priest.voice_intones',
  'priest.pilgrim_sacred',
  'priest.pilgrim_desecrated',
  'priest.forbidding',
  'priest.strange_forbidding',
  'priest.peace',
  'priest.unusual_peace',
  'temple.eerie',
  'temple.watched',
  'temple.shiver',
];
const templeKeys = (ks: string[]): string[] => ks.filter((k) => TEMPLE_KEYS.includes(k));

describe('entering a tended temple', () => {
  test('a coaligned temple: the priest intones, the greeting and a sense of peace', () => {
    for (const [record, feeling] of [
      [0, 'priest.unusual_peace'],
      [13, 'priest.unusual_peace'],
      [14, 'priest.peace'],
      [-3, 'priest.unusual_peace'],
      [-4, 'priest.strange_forbidding'], // sinned
    ] as const) {
      const s = temple(1, { record });
      expect(templeKeys(move(s, 'w'))).toEqual([]); // 7,3: the corridor
      expect(templeKeys(move(s, 'w'))).toEqual([
        'priest.intones',
        'priest.pilgrim_sacred',
        feeling,
      ]);
    }
  });

  test('a cross-aligned or desecrated temple gives a forbidding feeling', () => {
    const cross = temple(2, { altar: T.altar_lawful, record: 20 });
    move(cross, 'w');
    expect(templeKeys(move(cross, 'w'))).toEqual([
      'priest.intones',
      'priest.pilgrim_sacred',
      'priest.forbidding',
    ]);
    const desecrated = temple(3, { desecrated: true, record: 20 });
    move(desecrated, 'w');
    expect(templeKeys(move(desecrated, 'w'))).toEqual([
      'priest.intones',
      'priest.pilgrim_desecrated',
      'priest.forbidding',
    ]);
  });

  test("NetHack's timers: no repeats within them, all again after them", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = temple(seed);
      move(s, 'w');
      move(s, 'w');
      const t0 = s.state.turn;
      const epri = epriOf(s, s.priest ?? -1);
      if (!epri) throw new Error('no priest');
      // d(10,500), d(10,100), d(10,20) turns from the entry
      expect(epri.intoneTime - t0).toBeGreaterThanOrEqual(10);
      expect(epri.intoneTime - t0).toBeLessThanOrEqual(5000);
      expect(epri.enterTime - t0).toBeGreaterThanOrEqual(10);
      expect(epri.enterTime - t0).toBeLessThanOrEqual(1000);
      expect(epri.peacefulTime - t0).toBeGreaterThanOrEqual(10);
      expect(epri.peacefulTime - t0).toBeLessThanOrEqual(200);
      // walking about inside, or out and straight back in: nothing
      expect(templeKeys(move(s, 'w'))).toEqual([]);
      expect(templeKeys(move(s, 'e'))).toEqual([]);
      expect(templeKeys(move(s, 'e'))).toEqual([]);
      expect(templeKeys(move(s, 'w'))).toEqual([]);
      // past the feeling's timer only the feeling comes back
      move(s, 'e');
      s.state.turn = epri.peacefulTime;
      expect(templeKeys(move(s, 'w'))).toEqual(['priest.unusual_peace']);
      // past the greeting's timer the greeting too
      move(s, 'e');
      s.state.turn = Math.max(epri.enterTime, epri.peacefulTime);
      expect(templeKeys(move(s, 'w'))).toEqual(['priest.pilgrim_sacred', 'priest.unusual_peace']);
      // past the intoning: all three
      move(s, 'e');
      s.state.turn = Math.max(epri.intoneTime, epri.enterTime, epri.peacefulTime);
      expect(templeKeys(move(s, 'w'))).toEqual([
        'priest.intones',
        'priest.pilgrim_sacred',
        'priest.unusual_peace',
      ]);
    }
  });

  test('a switch between peace and forbidding is told at once', () => {
    const s = temple(4);
    move(s, 'w');
    expect(move(s, 'w')).toContain('priest.unusual_peace');
    move(s, 'e');
    setU(s, { alignRecord: -10 });
    expect(templeKeys(move(s, 'w'))).toEqual(['priest.strange_forbidding']);
    move(s, 'e');
    setU(s, { alignRecord: 0 });
    expect(templeKeys(move(s, 'w'))).toEqual(['priest.unusual_peace']);
  });

  test('an asleep priest says nothing, but the feeling comes', () => {
    const s = temple(5);
    const m = s.state.entities[String(s.priest)]?.c.monster;
    if (m) m.asleep = true;
    move(s, 'w');
    expect(templeKeys(move(s, 'w'))).toEqual(['priest.unusual_peace']);
  });
});

describe('entering an untended temple', () => {
  test('an eerie feeling, one time in four none; never a greeting', () => {
    const seen = new Set<string>();
    let silent = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = temple(seed, { tended: false });
      move(s, 'w');
      const ks = templeKeys(move(s, 'w'));
      expect(ks.length).toBeLessThanOrEqual(1);
      for (const k of ks) {
        expect(['temple.eerie', 'temple.watched', 'temple.shiver']).toContain(k);
        seen.add(k);
      }
      if (ks.length === 0) silent++;
    }
    expect(seen.size).toBe(3);
    expect(silent).toBeGreaterThan(0);
  });
});

describe('sanctuary', () => {
  /** Waits `n` turns; fails if the hero is hurt. */
  function waitUnhurt(s: S, n: number, each: () => void = () => undefined): void {
    for (let t = 0; t < n; t++) {
      const hp = hero(s).c.hp?.cur;
      s.wait();
      expect(hero(s).c.hp?.cur).toBe(hp);
      each();
    }
  }

  test('a hostile jackal will not step into a coaligned temple', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = temple(seed);
      move(s, 'w');
      move(s, 'w');
      move(s, 'w'); // 5,3: inside, next to the doorway
      const jackal = addMon(s.state, 'nh:jackal', 12, 3);
      let reached = false;
      waitUnhurt(s, 40, () => {
        const p = s.state.entities[String(jackal)]?.c.pos;
        expect(p && inTemple(p)).toBe(false);
        reached ||= p?.x === DOOR.x + 1 && p.y === DOOR.y;
      });
      expect(reached).toBe(true); // it came up to the doorway
    }
  });

  test('it does come into a cross-aligned temple, or when the hero has sinned', () => {
    for (const o of [{ altar: T.altar_chaotic }, { record: -4 }]) {
      const s = temple(1, o);
      move(s, 'w');
      move(s, 'w');
      move(s, 'w');
      const jackal = addMon(s.state, 'nh:jackal', 12, 3);
      let entered = false;
      for (let t = 0; t < 40 && !entered; t++) {
        s.wait();
        const p = s.state.entities[String(jackal)]?.c.pos;
        entered = !!p && inTemple(p);
      }
      expect(entered).toBe(true);
    }
  });

  test('a hostile monster next to the hero in her sanctuary flees and does not attack', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = temple(seed);
      move(s, 'w');
      move(s, 'w');
      move(s, 'w');
      move(s, 'w'); // 4,3
      const jackal = addMon(s.state, 'nh:jackal', 4, 2);
      let fled = false;
      waitUnhurt(s, 30, () => {
        fled ||= isFleeing(s, jackal);
      });
      expect(fled).toBe(true);
    }
  });

  test('the priest still mills about his altar', () => {
    const s = temple(6);
    const a = s.state.entities[String(s.priest)]?.c.actor;
    if (a) a.speed = 12;
    move(s, 'w');
    move(s, 'w');
    move(s, 'w');
    const spots = new Set<string>();
    for (let t = 0; t < 400; t++) {
      s.wait();
      const p = s.state.entities[String(s.priest)]?.c.pos;
      if (p) spots.add(`${p.x},${p.y}`);
      expect(p && p.x >= 1 && p.x <= 5 && p.y >= 1 && p.y <= 5).toBe(true);
    }
    // off the altar and about, keeping out of the hero's lines (she is at 5,3)
    expect(spots.size).toBeGreaterThanOrEqual(2);
    expect(s.state.entities[String(s.priest)]?.c.monster?.peaceful).toBe(true);
  });
});

describe('u.urooms', () => {
  test('follows the hero in and out of typed rooms and subrooms', () => {
    const s = setup(MAP, 1);
    // a typed hall 1..5 x 1..5 with a temple subroom 3..3 (its walls at 2..4)
    s.level.rooms = [
      { lx: 1, ly: 1, hx: 5, hy: 5, lit: true, type: 'test:hall' as DefId },
      { lx: 3, ly: 3, hx: 3, hy: 3, lit: true, type: 'nh:temple', parent: 0 },
    ];
    const at = (x: number, y: number): number[] => {
      put(s, s.state.playerId, x, y);
      checkSpecialRoom(ctxOf(s), false);
      return uRooms(s);
    };
    expect(at(8, 3)).toEqual([]);
    expect(at(6, 3)).toEqual([0]); // the doorway is in the room
    expect(at(1, 1)).toEqual([0]);
    expect(at(2, 2)).toEqual([1, 0]); // the subroom's wall is in both
    expect(at(3, 3)).toEqual([1]);
    expect(at(10, 3)).toEqual([]);
    expect(s.state.modData['nh']).not.toHaveProperty('urooms');
    // untyped rooms are not kept
    s.level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 5, lit: true }];
    expect(at(1, 1)).toEqual([]);
  });

  test('a level change clears it; arriving in a typed room sets it and greets anew', () => {
    const engine = createEngine([vanillaMod]);
    const { state } = engine.newGame({ seed: 7 });
    const ctx = ctxFor(state) as unknown as Ctx;
    const level = getLevel(state);
    const down = level.down as Pos;
    const roomno = level.rooms.findIndex(
      (r) => down.x >= r.lx && down.x <= r.hx && down.y >= r.ly && down.y <= r.hy,
    );
    const room = level.rooms[roomno];
    if (!room) throw new Error('no room');
    room.type = 'nh:temple';
    const spot =
      room.lx === down.x && room.ly === down.y
        ? { x: room.hx, y: room.hy }
        : { x: room.lx, y: room.ly };
    const priest = priestini(ctx, level, roomno, spot);
    if (priest === null) throw new Error('no priest');
    const pp = state.entities[String(priest)]?.c.pos;
    const pa = state.entities[String(priest)]?.c.actor;
    if (pp) Object.assign(pp, spot);
    if (pa) pa.speed = 0;
    const hp = getPlayer(state).c.pos;
    if (hp) Object.assign(hp, down);
    checkSpecialRoom(ctx, false);
    expect(uRooms({ state })).toEqual([roomno]);
    const epri = epriOf({ state }, priest);
    expect(epri?.intoneTime).toBeGreaterThan(0);

    const r1 = engine.step(state, { type: 'mod', action: 'nh:down' as DefId });
    expect(state.currentLevel).not.toBe(level.id);
    expect(uRooms({ state })).toEqual([]);
    expect(templeKeys(keys(r1))).toEqual([]);
    // back up: arriving on the down stairs, in the temple; the priest forgot her last visit
    const r2 = engine.step(state, { type: 'mod', action: 'nh:up' as DefId });
    expect(state.currentLevel).toBe(level.id);
    expect(uRooms({ state })).toEqual([roomno]);
    expect(templeKeys(keys(r2))).toEqual([
      'priest.intones',
      'priest.pilgrim_desecrated', // no shrine
      'priest.forbidding',
    ]);
  });
});
