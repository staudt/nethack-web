// Milestone 6b2: the Minetown temple end to end, with only the offered actions (no keyboard):
// travel to the altar from the up stairs (the entry feeling), drop a cursed item on it to learn
// its curse status, #chat with the priest and donate twice the suggestion for protection (AC
// goes down), then pray on the altar: a coaligned one makes the water on it holy, a cross-aligned
// one costs a point of alignment.
import { altarAlign, doMapping, findAc, mksobj, setU, uState, vanillaMod } from '@nh/content';
import {
  createEngine,
  getLevel,
  getPlayer,
  inRooms,
  isPlainFloor,
  sortedIds,
  type ActionOffer,
  type Ctx,
  type DefId,
  type EntityId,
  type GameState,
  type Pos,
  type StepResult,
  type Target,
} from '@nh/core';
import { describe, expect, test } from 'vitest';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const engine = createEngine([
  vanillaMod,
  {
    id: 'm6b2-probe',
    version: '1',
    register(api) {
      api.defineAction({
        id: 'm6b2-probe:run',
        labelKey: 'm6b2-probe',
        handles: 'mod',
        offer: () => [],
        perform(ctx) {
          probe.fn(ctx);
          return 0;
        },
      });
    },
  },
]);
const defs = engine.registry;
const run = (state: GameState, fn: (ctx: Ctx) => void): void => {
  probe.fn = fn;
  engine.step(state, { type: 'mod', action: 'm6b2-probe:run' });
};
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));
const heroPos = (state: GameState): Pos => {
  const p = getPlayer(state).c.pos;
  if (!p) throw new Error('no hero');
  return p;
};
const offers = (state: GameState, t: Target): ActionOffer[] => engine.query(state).actionsFor(t);
const offered = (state: GameState, t: Target, action: string): ActionOffer | undefined =>
  offers(state, t).find((o) => o.action.type === 'mod' && o.action.action === action);

interface Visit {
  state: GameState;
  altar: Pos;
  align: number;
  /** Every message key from the walk to the altar. */
  walk: string[];
  /** The cursed mace and the potion of water she carries. */
  mace: EntityId;
  water: EntityId;
}

const terrainAt = (state: GameState, p: Pos): DefId => {
  const level = getLevel(state);
  return level.palette[level.cells[p.y * level.width + p.x] ?? -1] ?? 'nh:stone';
};

/**
 * A new game on its Minetown (mapped, its hostiles gone), the hero tough and in good standing
 * with gold, a cursed mace and a potion of water. She travels to the temple door, opens it if
 * it is closed, and travels on until she stands on the altar; null when that fails (a locked
 * door, a monster in the way).
 */
function visit(seed: number): Visit | null {
  const { state } = engine.newGame({ seed });
  const town = state.dungeons
    .find((d) => d.id === 'nh:mines')
    ?.special.find((s) => s.id === 'nh:minetown');
  if (!town) return null;
  run(state, (ctx) => ctx.goToLevel({ dungeon: 'nh:mines', dlevel: town.dlevel }, 'up'));
  const level = getLevel(state);
  const altar = level.shrines?.[0];
  if (!altar) return null;
  const align = altarAlign(terrainAt(state, altar));
  if (align === null) return null;
  // the walk is about the temple, not fighting: hostile monsters would stop travel
  for (const id of sortedIds(state)) {
    const m = state.entities[String(id)];
    if (m?.c.monster && !m.c.monster.peaceful && !m.c.monster.tame && m.c.pos?.level === level.id)
      delete state.entities[String(id)];
  }
  const hero = getPlayer(state);
  if (hero.c.hp) hero.c.hp = { cur: 100000, max: 100000 };
  let mace = 0;
  let water = 0;
  run(state, (ctx) => {
    doMapping(ctx, level); // as the phone check's wizard map: the way is known
    setU(ctx, { ublesscnt: 0, alignRecord: 5, luck: 0 });
    const carry = (id: DefId, o: { quantity?: number; buc?: 'cursed' } = {}) => {
      const e = mksobj(ctx, defs.object(id), {
        init: false,
        carriedBy: state.playerId,
        ...(o.quantity ? { quantity: o.quantity } : {}),
      });
      const it = state.entities[String(e)]?.c.item;
      if (it && o.buc) it.buc = o.buc;
      if (it) it.known.buc = false;
      return e;
    };
    carry('nh:gold_piece', { quantity: 2000 });
    mace = carry('nh:mace', { buc: 'cursed' });
    water = carry('nh:potion_of_water');
  });
  // the temple's doors: go through an open one, or open a closed one first (not a locked one)
  const temple = level.rooms.findIndex((r) => r.type === 'nh:temple');
  const doors: { pos: Pos; t: DefId }[] = [];
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++) {
      const t = terrainAt(state, { x, y });
      if (defs.terrain(t).door && inRooms(level, x, y).includes(temple))
        doors.push({ pos: { x, y }, t });
    }
  const door =
    doors.find((d) => d.t !== 'nh:door_closed' && d.t !== 'nh:door_locked') ??
    doors.find((d) => d.t === 'nh:door_closed');
  if (!door) return null;
  const walk: string[] = [];
  /** Taps `goal` (travel, or a move next to it) until `done`; false if stuck. */
  const go = (goal: Pos, done: () => boolean): boolean => {
    for (let i = 0; i < 200; i++) {
      if (done()) return true;
      const o = offers(state, { kind: 'cell', pos: goal }).find(
        (x) =>
          x.action.type === 'move' || (x.action.type === 'mod' && x.action.action === 'nh:travel'),
      );
      if (!o) return false;
      const turn = state.turn;
      walk.push(...keys(engine.stepAll(state, o.action)));
      if (state.pendingPrompt || state.gameOver || state.turn === turn) return false;
    }
    return false;
  };
  const near = (q: Pos) => () => {
    const p = heroPos(state);
    return Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= 1;
  };
  if (door.t === 'nh:door_closed') {
    // travel to the floor square outside the door (travel does not open doors)
    const outside = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]
      .map((d) => ({ x: door.pos.x + d.x, y: door.pos.y + d.y }))
      .find(
        (q) => isPlainFloor(defs, level, q.x, q.y) && !inRooms(level, q.x, q.y).includes(temple),
      );
    if (!outside || !go(outside, near(door.pos))) return null;
    // open it through the offered action (it may be stuck a few times)
    for (let i = 0; i < 20 && terrainAt(state, door.pos) === 'nh:door_closed'; i++) {
      const o = offered(state, { kind: 'cell', pos: door.pos }, 'nh:open');
      if (!o) return null;
      walk.push(...keys(engine.stepAll(state, o.action)));
    }
  }
  const at = () => {
    const p = heroPos(state);
    return p.x === altar.x && p.y === altar.y;
  };
  return go(altar, at) ? { state, altar, align, walk, mace, water } : null;
}

/** The first seed (from 1) whose visit reaches a coaligned (neutral) or cross-aligned altar. */
function visitWhere(coaligned: boolean): Visit {
  for (let seed = 1; seed <= 60; seed++) {
    const v = visit(seed);
    if (v && (v.align === uState(v.state).alignType) === coaligned) return v;
  }
  throw new Error(`no seed reaches a ${coaligned ? 'coaligned' : 'cross-aligned'} altar`);
}

/** Drops the item through its offered drop action. */
function dropIt(state: GameState, id: EntityId): string[] {
  const o = offered(state, { kind: 'item', id }, 'nh:drop');
  if (!o) throw new Error('no drop offer');
  return keys(engine.stepAll(state, o.action));
}

/** Chats with the adjacent priest (waiting for him to come next to the altar) and offers the
 * larger suggested amount; returns the donation's message keys. */
function donate(state: GameState): string[] {
  for (let t = 0; t < 100; t++) {
    const p = heroPos(state);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const pos = { x: p.x + dx, y: p.y + dy };
        const o = offered(state, { kind: 'cell', pos }, 'nh:chat');
        const who = engine.query(state).describe(pos).entities[0];
        if (!o || who?.def !== 'nh:aligned_cleric') continue;
        const ask = engine.step(state, o.action);
        expect(keys(ask)).toContain('priest.asks_contribution');
        const prompt = state.pendingPrompt?.prompt;
        if (!prompt) throw new Error('no donation prompt');
        expect(prompt.numeric).toBe(true);
        const b = String(prompt.params?.['b']);
        return keys(engine.stepAll(state, { type: 'answer', promptId: prompt.id, value: b }));
      }
    engine.stepAll(state, { type: 'wait' });
  }
  throw new Error('the priest never came next to the altar');
}

/** Prays through the offered self action, confirming; returns the message keys. */
function pray(state: GameState): string[] {
  const o = offered(state, { kind: 'self' }, 'nh:pray');
  if (!o) throw new Error('no pray offer');
  const ask = engine.step(state, o.action);
  const prompt = state.pendingPrompt?.prompt;
  if (!prompt) throw new Error('no confirmation');
  return [
    ...keys(ask),
    ...keys(engine.stepAll(state, { type: 'answer', promptId: prompt.id, value: true })),
  ];
}

const FEELINGS = [
  'priest.peace',
  'priest.unusual_peace',
  'priest.forbidding',
  'priest.strange_forbidding',
];

describe('the Minetown temple by offered actions', () => {
  for (const coaligned of [true, false]) {
    test(`${coaligned ? 'coaligned' : 'cross-aligned'}: enter, learn BUC, donate, pray`, () => {
      const { state, align, walk, mace: maceId, water: waterId } = visitWhere(coaligned);
      // entering the tended temple gives one of the feelings
      expect(walk.some((k) => FEELINGS.includes(k))).toBe(true);

      // drop the cursed mace on the altar: a black flash and its curse status is known
      const mace = state.entities[String(maceId)]!;
      expect(mace.c.item?.known.buc).not.toBe(true);
      expect(dropIt(state, mace.id)).toContain('altar.flash');
      expect(mace.c.item?.known.buc).toBe(true);

      // twice the suggestion buys protection: AC goes down by u.ublessed
      const ac = findAc(state, defs, state.playerId);
      const d = donate(state);
      expect(d).toContain('priest.rewarded');
      const ublessed = uState(state).ublessed;
      expect(ublessed).toBeGreaterThanOrEqual(2);
      expect(findAc(state, defs, state.playerId)).toBe(ac - ublessed);

      // pray with the water on the altar
      const water = state.entities[String(waterId)]!;
      dropIt(state, water.id);
      run(state, (ctx) => setU(ctx, { ublesscnt: 0, luck: 0, alignRecord: 5 }));
      const p = pray(state);
      if (coaligned) {
        expect(p).toContain('pray.shimmering');
        expect(p).toContain('pray.water.the');
        expect(water.c.item?.buc).toBe('blessed');
        expect(uState(state).alignRecord).toBe(5);
      } else {
        expect(align).not.toBe(uState(state).alignType);
        expect(p).not.toContain('pray.shimmering');
        // a water prayer on another god's altar: unholy water and an angry god
        expect(p).toContain('pray.water.the');
        expect(water.c.item?.buc).toBe('cursed');
        expect(uState(state).luck).toBe(-3);
      }
    });
  }

  test('a good prayer on a cross-aligned altar without water costs a point of alignment', () => {
    const { state } = visitWhere(false);
    run(state, (ctx) => setU(ctx, { ublesscnt: 0, luck: 0, alignRecord: 5 }));
    const p = pray(state);
    expect(p).toContain('pray.feel_god');
    expect(uState(state).alignRecord).toBe(4);
    expect(uState(state).ublesscnt).toBe(0);
  });
});
