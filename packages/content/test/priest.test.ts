// Milestone 6b2 step 2: the temple priest. Made next to his shrine (priestini()) with his gear,
// only for shrines in a temple; he mills about inside the temple (pri_move()); attacking him
// angers him, his god and the Watch; killing him has its alignment price.
import {
  cellIndex,
  createEngine,
  getLevel,
  inRooms,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type GameState,
  type LevelDef,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  ALIGNED_CLERIC,
  T,
  epriOf,
  monNam,
  priestini,
  setU,
  uState,
  vanillaMod,
} from '../src/index';
import { addMon, setup } from './helpers';
import { ctxFor, defs, render } from './itemHelpers';

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
const inside = (p: { x: number; y: number }): boolean =>
  p.x >= 1 && p.x <= 5 && p.y >= 1 && p.y <= 5;

type S = ReturnType<typeof setup>;
/** The temple, its altar of `altar`, and its priest (made by priestini()). */
function temple(seed: number, altar: DefId = T.altar_neutral, hero = { x: 12, y: 3 }) {
  const s = setup(MAP, seed);
  const level = s.level;
  let i = level.palette.indexOf(altar);
  if (i === -1) i = level.palette.push(altar) - 1;
  level.cells[cellIndex(level, ALTAR.x, ALTAR.y)] = i;
  level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 5, lit: true, type: 'nh:temple' }];
  level.shrines = [{ ...ALTAR }];
  const hp = s.state.entities[String(s.state.playerId)]?.c.pos;
  if (hp) Object.assign(hp, hero);
  const priest = priestini(ctxFor(s.state) as unknown as Ctx, level, 0, ALTAR);
  if (priest === null) throw new Error('no priest');
  return { ...s, priest };
}

const mon = (s: S, id: number) => s.state.entities[String(id)];
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const put = (s: S, id: number, x: number, y: number): void => {
  const p = mon(s, id)?.c.pos;
  if (p) Object.assign(p, { x, y });
};
const heroAt = (s: S, x: number, y: number): void => put(s, s.state.playerId, x, y);
const align = (s: S): number => uState(s.state).alignRecord;
/** Pins a monster: speed 0, so it never acts. */
const pin = (s: S, id: number): void => {
  const a = mon(s, id)?.c.actor;
  if (a) a.speed = 0;
};
/** Fights in direction `dir`, confirming "Really attack?" when asked. */
function fight(s: S, dir: string): string[] {
  const r = s.engine.step(s.state, { type: 'mod', action: 'nh:fight' as DefId, args: { dir } });
  if (r.prompt?.key !== 'attack.confirm') return keys(r);
  return keys(s.engine.step(s.state, { type: 'answer', promptId: r.prompt.id, value: true }));
}
const DIRS: Record<string, [number, number]> = {
  n: [0, -1],
  ne: [1, -1],
  e: [1, 0],
  se: [1, 1],
  s: [0, 1],
  sw: [-1, 1],
  w: [-1, 0],
  nw: [-1, -1],
};
/**
 * Puts the hero inside the temple next to the priest, lined up with the altar (so the god's bolt
 * comes from the altar), and returns the direction from her to him.
 */
function nextToPriest(s: ReturnType<typeof temple>): string {
  const pp = mon(s, s.priest)?.c.pos;
  if (!pp) throw new Error('no priest');
  for (const [d, [dx, dy]] of Object.entries(DIRS)) {
    const x = pp.x - dx;
    const y = pp.y - dy;
    const tx = x - ALTAR.x;
    const ty = y - ALTAR.y;
    const lined = (tx || ty) && (!tx || !ty || Math.abs(tx) === Math.abs(ty));
    if (inside({ x, y }) && lined) {
      heroAt(s, x, y);
      return d;
    }
  }
  throw new Error('no spot next to the priest');
}

describe('priestini', () => {
  test('a peaceful, awake priest next to the altar, with the shrine and his gear', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const altar = [T.altar_lawful, T.altar_neutral, T.altar_chaotic][seed % 3] as DefId;
      const s = temple(seed, altar);
      const p = mon(s, s.priest);
      expect(p?.def).toBe(ALIGNED_CLERIC);
      expect(p?.c.monster?.peaceful).toBe(true);
      expect(p?.c.monster?.asleep).toBe(false);
      const pos = p?.c.pos ?? { x: -1, y: -1 };
      expect(Math.max(Math.abs(pos.x - ALTAR.x), Math.abs(pos.y - ALTAR.y))).toBe(1);
      const epri = epriOf(s, s.priest);
      expect(epri).toMatchObject({
        shroom: 0,
        shralign: [1, 0, -1][seed % 3],
        shrpos: ALTAR,
        shrlevel: 'dlvl1',
      });
      // m_initweap/m_initinv MS_PRIEST: a +1..+3 mace, a robe and a small shield (worn), 20..29
      // gold; priestini: 2 to 4 spellbooks
      const inv = inventoryOf(s.state, s.priest);
      const of = (d: string) => inv.filter((o) => o.def === d);
      const mace = of('nh:mace')[0]?.c.item;
      expect(mace?.spe).toBeGreaterThanOrEqual(1);
      expect(mace?.spe).toBeLessThanOrEqual(3);
      expect(of('nh:robe')[0]?.c.item?.equipped).toBe('cloak');
      expect(of('nh:small_shield')[0]?.c.item?.equipped).toBe('shield');
      const gold = of('nh:gold_piece')[0]?.c.item?.quantity ?? 0;
      expect(gold).toBeGreaterThanOrEqual(20);
      expect(gold).toBeLessThanOrEqual(29);
      const books = inv.filter((o) => defs.object(o.def).class === 'spellbook');
      const n = books.reduce((a, o) => a + (o.c.item?.quantity ?? 0), 0);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
  });

  test('he is named for his god', () => {
    const names = [T.altar_lawful, T.altar_neutral, T.altar_chaotic].map((a) => {
      const s = temple(1, a);
      const p = mon(s, s.priest);
      if (!p) throw new Error('no priest');
      return render(
        { key: 'x', params: { m: monNam(ctxFor(s.state), p) } },
        {
          ...Object.fromEntries(
            ['lawful', 'neutral', 'chaotic'].map((k) => [
              `priest.of.${k}`,
              `priest of ${{ lawful: 'Tyr', neutral: 'Odin', chaotic: 'Loki' }[k]}`,
            ]),
          ),
          x: 'You kill {m|the}!',
        },
      );
    });
    expect(names).toEqual([
      'You kill the priest of Tyr!',
      'You kill the priest of Odin!',
      'You kill the priest of Loki!',
    ]);
  });
});

describe('pri_move', () => {
  test('a peaceful priest mills around his altar and never leaves the temple', () => {
    for (const [seed, hero] of [
      [1, { x: 12, y: 3 }], // out in the corridor, lined up with the altar's row
      [2, { x: 6, y: 3 }], // in the doorway
      [3, { x: 1, y: 5 }], // inside
    ] as const) {
      const s = temple(seed, T.altar_neutral, hero);
      const seen = new Set<string>();
      for (let t = 0; t < 400; t++) {
        s.wait();
        const p = mon(s, s.priest)?.c.pos;
        expect(p && inside(p)).toBe(true);
        expect(mon(s, s.priest)?.c.monster?.peaceful).toBe(true);
        // he keeps out of the hero's lines (move_special() `avoid`): never on her row here
        if (seed === 1 && t > 0) expect(p?.y).not.toBe(3);
        if (p) seen.add(`${p.x},${p.y}`);
      }
      // he moves about (toward rn1(3,-1) of the altar)
      expect(seen.size).toBeGreaterThanOrEqual(3);
    }
  });

  test('an angry priest chases the hero inside his temple and stays when she leaves', () => {
    const s = temple(4, T.altar_neutral, { x: 1, y: 1 });
    const p = mon(s, s.priest);
    if (!p?.c.monster || !p.c.hp) throw new Error('no priest');
    p.c.monster.peaceful = false;
    p.c.hp = { cur: 300, max: 300 };
    const hero = s.state.entities[String(s.state.playerId)];
    if (hero?.c.hp) hero.c.hp = { cur: 5000, max: 5000 };
    // he comes for her in the corner
    let met = false;
    for (let t = 0; t < 20 && !met; t++) {
      s.wait();
      const pp = mon(s, s.priest)?.c.pos;
      met = !!pp && Math.max(Math.abs(pp.x - 1), Math.abs(pp.y - 1)) <= 1;
    }
    expect(met).toBe(true);
    // out of the temple, he does not follow through the doorway (no room squares there)
    heroAt(s, 14, 3);
    for (let t = 0; t < 100; t++) {
      s.wait();
      const pp = mon(s, s.priest)?.c.pos;
      expect(pp && inside(pp)).toBe(true);
    }
  });
});

describe('attacking the priest', () => {
  test("a coaligned priest: -5 alignment, he gets angry, his god's lightning, the Watch", () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = temple(seed, T.altar_neutral);
      const dir = nextToPriest(s);
      pin(s, s.priest);
      // a watchman in the temple, who sees the attack (hit or miss: "Halt!" or hmon's anger)
      const taken = [s.state.playerId, s.priest].map((id) => mon(s, id)?.c.pos);
      const spot = [
        { x: 1, y: 1 },
        { x: 5, y: 1 },
        { x: 1, y: 5 },
        { x: 5, y: 5 },
      ].find((c) => !taken.some((t) => t?.x === c.x && t.y === c.y));
      const w = addMon(s.state, 'nh:watchman', spot?.x ?? 1, spot?.y ?? 1, { peaceful: true });
      pin(s, w);
      const before = align(s);
      const k = fight(s, dir);
      expect(mon(s, s.priest)?.c.monster?.peaceful).toBe(false);
      expect(align(s)).toBe(before - 5);
      expect(k.some((x) => x.startsWith('priest.ghod.'))).toBe(true);
      expect(k.some((x) => x.startsWith('zap.ray.'))).toBe(true); // hits, whizzes or misses
      expect(mon(s, w)?.c.monster?.peaceful).toBe(false);
    }
  });

  test('a cross-aligned priest: +2 alignment', () => {
    const s = temple(1, T.altar_lawful);
    const dir = nextToPriest(s);
    pin(s, s.priest);
    const before = align(s);
    fight(s, dir);
    expect(mon(s, s.priest)?.c.monster?.peaceful).toBe(false);
    expect(align(s)).toBe(before + 2);
  });

  test('outside a temple the god stays silent', () => {
    const s = temple(1, T.altar_neutral);
    s.level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 5, lit: true }]; // no longer a temple
    const dir = nextToPriest(s);
    pin(s, s.priest);
    const k = fight(s, dir);
    expect(k.some((x) => x.startsWith('priest.ghod.'))).toBe(false);
  });
});

describe('killing the priest', () => {
  function kill(altar: DefId) {
    const s = temple(5, altar);
    const dir = nextToPriest(s);
    pin(s, s.priest);
    const p = mon(s, s.priest);
    if (!p?.c.monster || !p.c.hp) throw new Error('no priest');
    p.c.monster.peaceful = false; // already angry
    p.c.hp = { cur: 1, max: 1 };
    setU(ctxFor(s.state) as unknown as Ctx, { alignRecord: -20, ublessed: 3 });
    for (let i = 0; i < 100 && mon(s, s.priest); i++) fight(s, dir);
    expect(mon(s, s.priest)).toBeUndefined();
    expect(epriOf(s, s.priest)).toBeNull();
    return uState(s.state);
  }

  test('his own: -2 and divine protection lost; a hostile priest is worth +15 (malign)', () => {
    const u = kill(T.altar_neutral);
    expect(u.alignRecord).toBe(-20 - 2 + 15);
    expect(u.ublessed).toBe(0);
  });

  test("an infidel's: +2, protection kept", () => {
    const u = kill(T.altar_chaotic);
    expect(u.alignRecord).toBe(-20 + 2 + 15);
    expect(u.ublessed).toBe(3);
  });
});

describe('shrines on a new level', () => {
  // A town room holding a temple with a shrine and a plain room whose altar is also flagged as a
  // shrine: create_altar() makes that one a plain altar (no priest).
  const DEF: LevelDef = {
    id: 'pt:town',
    init: { style: 'solidfill', fg: 'nh:stone', lit: true },
    rooms: [
      {
        x: 3,
        y: 3,
        w: 24,
        h: 9,
        xalign: 'center',
        yalign: 'center',
        lit: true,
        rooms: [
          {
            type: 'nh:temple',
            x: 2,
            y: 2,
            w: 5,
            h: 5,
            doors: [{ state: 'nodoor', wall: 'east' }],
            features: [{ kind: 'altar', x: 2, y: 2, shrine: true }],
          },
          {
            x: 14,
            y: 2,
            w: 5,
            h: 5,
            doors: [{ state: 'nodoor', wall: 'west' }],
            features: [{ kind: 'altar', x: 2, y: 2, align: 'lawful', shrine: true }],
          },
        ],
      },
      { stairs: ['up'] },
      { stairs: ['down'] },
    ],
    corridors: 'random',
  };
  const mod: Mod = {
    id: 'pt',
    version: '1',
    register(api) {
      api.defineLevel(DEF);
      api.defineDungeon({
        id: 'pt:d',
        nameKey: 'pt',
        levels: { base: 1 },
        entry: { from: 'nh:main', base: 5 },
        filler: DEF.id,
      });
      api.defineAction({
        id: 'pt:go',
        labelKey: 'pt',
        handles: 'mod',
        offer: () => [],
        perform(ctx) {
          ctx.goToLevel({ dungeon: 'pt:d', dlevel: 1 }, 'up');
          return 0;
        },
      });
    },
  };

  test('only the shrine in a temple stays one, and gets the one priest', () => {
    const eng = createEngine([vanillaMod, mod]);
    for (const seed of [1, 2, 3, 4]) {
      const { state } = eng.newGame({ seed });
      eng.step(state, { type: 'mod', action: 'pt:go' as DefId });
      const level = getLevel(state);
      const ti = level.rooms.findIndex((r) => r.type === 'nh:temple');
      expect(ti).toBeGreaterThanOrEqual(0);
      expect(level.shrines).toHaveLength(1);
      const [shrine] = level.shrines ?? [];
      if (!shrine) throw new Error('no shrine');
      expect(inRooms(level, shrine.x, shrine.y)).toContain(ti);
      const priests = priestsOn(state, level.id);
      expect(priests).toHaveLength(1);
      expect(epriOf({ state }, priests[0] as number)).toMatchObject({ shroom: ti, shrpos: shrine });
    }
  });
});

function priestsOn(state: GameState, levelId: string): number[] {
  return sortedIds(state).filter(
    (id) =>
      state.entities[String(id)]?.def === ALIGNED_CLERIC &&
      state.entities[String(id)]?.c.pos?.level === levelId,
  );
}
