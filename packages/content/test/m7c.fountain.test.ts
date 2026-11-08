// m7c step 3: fountains in ordinary rooms, drinking from a fountain (every rnd(30) outcome),
// drying up and the Watch. Each outcome is reached by burning RNG draws before the drink (the
// same as a seed search) and recognised by its effect, never by a lucky seed.
import {
  cellIndex,
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { P, hasIntrinsic, setIntrinsic } from '../src/props';
import { setTerrain } from '../src/terrain';
import {
  FTN_LOOTED,
  FTN_MAGIC,
  FTN_WARNED,
  T,
  drinkfountain,
  fountainBits,
  mksobj,
  setFountainBits,
  vanillaMod,
} from '../src/index';
import { isFleeing } from '../src/monflee';
import { addMon, setup } from './helpers';
import { ctxFor, defs, render } from './itemHelpers';

const QUAFF = 'nh:quaff' as DefId;
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ftn-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ftn-probe:run',
      labelKey: 'ftn-probe',
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

const texts = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );

function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'ftn-probe:run' }));
}

// A room (interior 1..11 x 1..5) with the hero on a fountain at 6,3.
const ROOM = [
  '-------------',
  '|...........|',
  '|...........|',
  '|.....@.....|',
  '|...........|',
  '|...........|',
  '-------------',
];
const F = { x: 6, y: 3 };

function room(seed = 1, town = false) {
  const s = setup(ROOM, seed);
  s.level.rooms = [{ lx: 1, ly: 1, hx: 11, hy: 5, lit: true }];
  if (town) s.level.town = true;
  setTerrain(s.level, F.x, F.y, T.fountain);
  return s;
}
const terrainAt = (level: Level, x: number, y: number) =>
  level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
const monsOf = (st: GameState, def: string) =>
  sortedIds(st).filter((id) => st.entities[String(id)]?.def === def && id !== st.playerId);

interface Drink {
  state: GameState;
  text: string[];
  fate: number;
  cost: number;
}

/** Drinks after `k` burnt draws, on a copy of `state`; `fate` is the rnd(30) drawn. */
function drinkAt(state: GameState, k: number): Drink {
  const st = structuredClone(state);
  let fate = 0;
  let cost = 0;
  const text = run(st, (ctx) => {
    for (let i = 0; i < k; i++) ctx.rng.rn2(2);
    const peek = structuredClone(ctx.state.rng.core);
    fate = ctx.rng.rnd(30);
    Object.assign(ctx.state.rng.core, peek);
    cost = drinkfountain(ctx, QUAFF);
  });
  return { state: st, text, fate, cost };
}

/** Every drink over the first `tries` offsets whose fate passes `pick`. */
function drinks(state: GameState, pick: (fate: number) => boolean, tries = 300): Drink[] {
  const out: Drink[] = [];
  for (let k = 0; k < tries; k++) {
    const d = drinkAt(state, k);
    if (pick(d.fate)) out.push(d);
  }
  return out;
}

const fountainGone = (d: Drink): boolean =>
  terrainAt(d.state.levels['dlvl1']!, F.x, F.y) === T.floor;

describe('fountains in ordinary rooms', () => {
  test('about 1 room in 10 gets one, never next to a door; 1 in 7 of them is magic', () => {
    let fountains = 0;
    let magic = 0;
    let rooms = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const st = engine.newGame({ seed }).state;
      const level = st.levels[st.currentLevel]!;
      rooms += level.rooms.filter((r) => r.parent === undefined).length;
      for (let y = 0; y < level.height; y++)
        for (let x = 0; x < level.width; x++) {
          if (terrainAt(level, x, y) !== T.fountain) continue;
          fountains++;
          if (fountainBits(st, level.id, x, y) & FTN_MAGIC) magic++;
          for (const [dx, dy] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ] as const) {
            const t = terrainAt(level, x + dx, y + dy);
            expect(t && defs.terrain(t).door, `door next to ${x},${y} seed ${seed}`).toBeFalsy();
            expect(String(t)).not.toMatch(/sdoor/);
          }
          // in a room's interior
          expect(level.rooms.some((r) => x >= r.lx && x <= r.hx && y >= r.ly && y <= r.hy)).toBe(
            true,
          );
        }
      // the state table names fountains only
      const table = (st.modData['nh'] as { fountains?: Record<string, Record<string, number>> })
        .fountains;
      for (const [lid, cells] of Object.entries(table ?? {}))
        for (const i of Object.keys(cells)) {
          const l = st.levels[lid]!;
          expect(l.palette[l.cells[Number(i)] ?? 0]).toBe(T.fountain);
        }
    }
    expect(fountains).toBeGreaterThan(rooms / 20);
    expect(fountains).toBeLessThan(rooms / 5);
    expect(magic).toBeLessThan(fountains / 2);
  });
});

describe('#quaff from a fountain', () => {
  test('standing on a fountain offers "Drink from the fountain"; elsewhere not', () => {
    const s = room();
    const offers = engine.query(s.state).actionsFor({ kind: 'self' });
    const o = offers.find((x) => x.action.type === 'mod' && x.action.action === QUAFF);
    expect(o?.labelKey).toBe('action.nh:quaff.fountain');
    expect(render({ key: o!.labelKey })).toBe('Drink from the fountain');
    // drinking through the action takes a move and says one of the outcomes
    const before = s.state.turn;
    const r = engine.stepAll(s.state, o!.action);
    expect(texts(r).length).toBeGreaterThan(0);
    expect(s.state.turn).toBeGreaterThan(before);
    // off the fountain
    const t = room();
    getPlayer(t.state).c.pos!.x = 2;
    expect(
      engine
        .query(t.state)
        .actionsFor({ kind: 'self' })
        .some((x) => x.action.type === 'mod' && x.action.action === QUAFF),
    ).toBe(false);
  });

  test('fates 1-9: the cool draught adds 1-10 nutrition', () => {
    const s = room();
    const n0 = getPlayer(s.state).c.hunger!.nutrition;
    const ds = drinks(s.state, (f) => f < 10, 60);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(d.text[0]).toBe('The cool draught refreshes you.');
      const n = getPlayer(d.state).c.hunger!.nutrition;
      expect(n - n0).toBeGreaterThanOrEqual(1);
      expect(n - n0).toBeLessThanOrEqual(10);
      expect(d.cost).toBeGreaterThan(0);
    }
  });

  test('fates 10-18: tasteless; 19: self-knowledge; 25: the stalking image; 30: gushing', () => {
    const s = room();
    const all = drinks(s.state, () => true, 400);
    const first = (f: number) => all.find((d) => d.fate === f)!.text;
    for (const d of all.filter((x) => x.fate >= 10 && x.fate <= 18))
      expect(d.text[0]).toBe('This tepid water is tasteless.');
    expect(first(19).slice(0, 2)).toEqual([
      'You feel self-knowledgeable...',
      'The feeling subsides.',
    ]);
    expect(first(25).slice(0, 2)).toEqual([
      'You see an image of someone stalking you.',
      'But it disappears.',
    ]);
    expect(first(30)[0]).toBe('Your thirst is quenched.');
    expect(first(28)[0]).toBe('You attract a water nymph!'); // m9 step 3: a real nymph
  });

  test('fate 25: see invisible for good; blind and invisible, she feels transparent', () => {
    const s = room();
    const d = drinks(s.state, (f) => f === 25)[0]!;
    expect(hasIntrinsic(getPlayer(d.state), P.SEE_INVIS)).toBe(true);
    const b = room();
    setIntrinsic(getPlayer(b.state), P.INVIS, true);
    setIntrinsic(getPlayer(b.state), P.BLINDED, true);
    const db = drinks(b.state, (f) => f === 25)[0]!;
    expect(db.text[0]).toBe('You feel transparent.');
    const c = room();
    setIntrinsic(getPlayer(c.state), P.BLINDED, true);
    expect(drinks(c.state, (f) => f === 25)[0]!.text.slice(0, 2)).toEqual([
      'You feel very self-conscious.',
      'Then it passes.',
    ]);
  });

  test('fate 20: foul water makes her hungrier and vomit', () => {
    const s = room();
    const n0 = getPlayer(s.state).c.hunger!.nutrition;
    const d = drinks(s.state, (f) => f === 20)[0]!;
    expect(d.text[0]).toBe('The water is foul!  You gag and vomit.');
    const n = n0 - getPlayer(d.state).c.hunger!.nutrition;
    expect(n).toBeGreaterThanOrEqual(11);
    expect(n).toBeLessThanOrEqual(30);
  });

  test('fate 21: contaminated water costs Str and HP, or 1-4 HP with poison resistance', () => {
    const s = room();
    const h = getPlayer(s.state);
    h.c.attributes!.str = 18;
    const d = drinks(s.state, (f) => f === 21)[0]!;
    expect(d.text[0]).toBe('The water is contaminated!');
    const h2 = getPlayer(d.state);
    expect(h2.c.attributes!.str).toBeLessThanOrEqual(18 - 3);
    expect(h2.c.attributes!.str).toBeGreaterThanOrEqual(18 - 6);
    expect(h2.c.hp!.cur).toBeLessThan(500);
    expect(h2.c.hp!.cur).toBeGreaterThanOrEqual(490);

    setIntrinsic(h, 'poison_res', true);
    const r = drinks(s.state, (f) => f === 21)[0]!;
    expect(r.text.slice(0, 2)).toEqual([
      'The water is contaminated!',
      'Perhaps it is runoff from the nearby slime mold farm.',
    ]);
    const h3 = getPlayer(r.state);
    expect(h3.c.attributes!.str).toBe(18);
    expect(500 - h3.c.hp!.cur).toBeGreaterThanOrEqual(1);
    expect(500 - h3.c.hp!.cur).toBeLessThanOrEqual(4);
  });

  test('fate 22: 2-6 water moccasins pour forth around her', () => {
    const s = room();
    const ds = drinks(s.state, (f) => f === 22);
    expect(ds.length).toBeGreaterThan(0);
    for (const d of ds) {
      expect(d.text[0]).toBe('An endless stream of snakes pours forth!');
      const n = monsOf(d.state, 'nh:water_moccasin').length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(6);
    }
  });

  test('fate 23: a hostile water demon, or a wish and then the fountain dries up', () => {
    const s = room();
    // warned: the dry-up after the wish always happens
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_WARNED);
    const ds = drinks(s.state, (f) => f === 23, 2000);
    const hostile = ds.find((d) => !d.state.pendingPrompt);
    const wish = ds.find((d) => d.state.pendingPrompt);
    expect(hostile && wish).toBeTruthy();
    expect(hostile!.text[0]).toBe('You unleash a water demon!');
    const demon = monsOf(hostile!.state, 'nh:water_demon');
    expect(demon.length).toBe(1);
    expect(hostile!.state.entities[String(demon[0])]?.c.monster?.peaceful).toBe(false);
    expect(fountainGone(hostile!)).toBe(true);

    expect(wish!.text).toEqual([
      'You unleash a water demon!',
      'Grateful for his release, he grants you a wish!',
    ]);
    expect(wish!.cost).toBe(0);
    expect(monsOf(wish!.state, 'nh:water_demon')).toEqual([]); // he leaves the game
    expect(fountainGone(wish!)).toBe(false); // not before the wish
    const r = engine.step(wish!.state, {
      type: 'answer',
      promptId: wish!.state.pendingPrompt!.prompt.id,
      value: 'blessed +2 long sword',
    });
    const t = texts(r);
    expect(t.at(-1)).toBe('The fountain dries up!');
    expect(t).toEqual(['e - a long sword.', 'The fountain dries up!']);
    expect(fountainGone({ ...wish!, state: wish!.state })).toBe(true);
    const sword = inventoryOf(wish!.state, wish!.state.playerId).find(
      (o) => o.def === 'nh:long_sword',
    );
    expect(sword?.c.item?.buc).toBe('blessed');
    expect([0, 2]).toContain(sword?.c.item?.spe); // a normal wish: spe > rnd(5) gives 0
  });

  test("fate 24: this water's no good curses some non-gold items", () => {
    const s = room();
    const ctx = ctxFor(s.state);
    for (const id of ['nh:long_sword', 'nh:dagger', 'nh:small_shield', 'nh:food_ration'])
      mksobj(ctx, defs.object(id as DefId), { init: false, carriedBy: s.state.playerId });
    mksobj(ctx, defs.object('nh:gold_piece' as DefId), {
      init: false,
      quantity: 50,
      carriedBy: s.state.playerId,
    });
    const ds = drinks(s.state, (f) => f === 24, 2000);
    let cursedSome = false;
    for (const d of ds) {
      expect(d.text[0]).toBe("This water's no good!");
      for (const o of inventoryOf(d.state, d.state.playerId)) {
        if (defs.object(o.def).class === 'coin') expect(o.c.item?.buc).not.toBe('cursed');
        if (o.c.item?.buc === 'cursed') cursedSome = true;
      }
    }
    expect(cursedSome).toBe(true);
  });

  test('fate 26: monsters are sensed, or the water tastes like nothing', () => {
    const s = room();
    expect(drinks(s.state, (f) => f === 26)[0]!.text[0]).toBe('The water tastes like nothing.');
    const id = addMon(s.state, 'nh:newt', 1, 1, { asleep: true });
    s.state.entities[String(id)]!.c.actor!.speed = 0;
    const d = drinks(s.state, (f) => f === 26)[0]!;
    expect(d.text[0]).toBe('You sense the presence of monsters.');
    expect(d.state.monsterMemory['dlvl1']?.[String(1 * 13 + 1)]).toBe('nh:newt');
  });

  test('fate 27: a gem or glass once; then a water nymph', () => {
    const s = room();
    const d = drinks(s.state, (f) => f === 27)[0]!;
    expect(d.text[0]).toBe('You spot a gem in the sparkling waters!');
    const found = itemsAt(defs, d.state, 'dlvl1', F.x, F.y);
    expect(found.length).toBe(1);
    const def = defs.object(found[0]!.def);
    expect(def.class).toBe('gem');
    expect(['nh:rock', 'nh:flint', 'nh:luckstone', 'nh:loadstone', 'nh:touchstone']).not.toContain(
      def.id,
    );
    if (!fountainGone(d))
      expect(fountainBits(d.state, 'dlvl1', F.x, F.y) & FTN_LOOTED).toBeTruthy();
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_LOOTED);
    // ref: dowaternymph(): an awake water nymph next to her (m9 step 3)
    const n = drinks(s.state, (f) => f === 27)[0]!;
    expect(n.text[0]).toBe('You attract a water nymph!');
    const [nymph] = monsOf(n.state, 'nh:water_nymph');
    expect(nymph).toBeDefined();
    const e = n.state.entities[String(nymph)]!;
    expect(e.c.monster!.asleep).toBe(false);
    expect(Math.max(Math.abs(e.c.pos!.x - F.x), Math.abs(e.c.pos!.y - F.y))).toBe(1);
  });

  test('fate 29: bad breath scares every monster', () => {
    const s = room();
    const a = addMon(s.state, 'nh:newt', 1, 1);
    const b = addMon(s.state, 'nh:jackal', 10, 5);
    for (const id of [a, b]) s.state.entities[String(id)]!.c.actor!.speed = 0;
    const d = drinks(s.state, (f) => f === 29)[0]!;
    expect(d.text[0]).toBe('This water gives you bad breath!');
    expect(isFleeing({ state: d.state }, a)).toBe(true);
    expect(isFleeing({ state: d.state }, b)).toBe(true);
  });

  test('a magic fountain: with Luck >= 0 and fate >= 10 an attribute rises and the magic is spent', () => {
    const s = room();
    setFountainBits({ state: s.state }, 'dlvl1', F.x, F.y, FTN_MAGIC);
    getPlayer(s.state).c.attributes = { str: 10, int: 10, wis: 10, dex: 10, con: 10, cha: 10 };
    const d = drinks(s.state, (f) => f >= 10)[0]!;
    expect(d.text[0]).toBe('Wow!  This makes you feel great!');
    expect(d.text.at(-1)).toBe('A wisp of vapor escapes the fountain...');
    const a = getPlayer(d.state).c.attributes!;
    expect(Object.values(a).reduce((x, y) => x + y, 0)).toBe(61); // littleluck: one rise
    expect(fountainBits(d.state, 'dlvl1', F.x, F.y)).toBe(0);
    expect(fountainGone(d)).toBe(false); // no dry-up
    // a cool draught from a magic fountain never dries it up
    for (const c of drinks(s.state, (f) => f < 10, 100)) expect(fountainGone(c)).toBe(false);
    // bad luck: the ordinary outcomes
    (s.state.modData['nh'] as { u: { luck: number } }).u.luck = -1;
    const bad = drinks(s.state, (f) => f >= 10 && f <= 18)[0]!;
    expect(bad.text[0]).toBe('This tepid water is tasteless.');
  });
});

describe('drying up and the Watch', () => {
  test('outside town an ordinary fountain dries up about 1 time in 3', () => {
    const s = room();
    const ds = drinks(s.state, (f) => f >= 10 && f <= 18, 300);
    const dried = ds.filter(fountainGone);
    expect(dried.length).toBeGreaterThan(ds.length / 6);
    expect(dried.length).toBeLessThan(ds.length / 1.5);
    for (const d of dried) {
      expect(d.text.at(-1)).toBe('The fountain dries up!');
      expect(fountainBits(d.state, 'dlvl1', F.x, F.y)).toBe(0);
    }
  });

  test('in town: the first time a watchman warns, then the fountain dries up and the Watch is angry', () => {
    const s = room(1, true);
    const w = addMon(s.state, 'nh:watchman', 2, 1, { peaceful: true });
    s.state.entities[String(w)]!.c.actor!.speed = 0;
    const ds = drinks(s.state, (f) => f >= 10 && f <= 18, 300);
    const warned = ds.find((d) => fountainBits(d.state, 'dlvl1', F.x, F.y) & FTN_WARNED)!;
    expect(warned.text.slice(-2)).toEqual([
      'A watchman yells:',
      '"Hey, stop using that fountain!"',
    ]);
    expect(fountainGone(warned)).toBe(false);
    expect(warned.state.entities[String(w)]?.c.monster?.peaceful).toBe(true);
    // once warned, the next use always dries it up and angers the Watch
    const again = drinks(warned.state, (f) => f >= 10 && f <= 18, 20);
    for (const d of again) {
      expect(fountainGone(d)).toBe(true);
      expect(d.text).toContain('The fountain dries up!');
      expect(d.state.entities[String(w)]?.c.monster?.peaceful).toBe(false);
    }
    // no watchman in sight: the flow reduces to a trickle
    const t = room(1, true);
    const lone = drinks(t.state, (f) => f >= 10 && f <= 18, 300).find(
      (d) => fountainBits(d.state, 'dlvl1', F.x, F.y) & FTN_WARNED,
    )!;
    expect(lone.text.at(-1)).toBe('The flow reduces to a trickle.');
  });
});
