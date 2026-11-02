// Wands: z, immediate beams, rays with bounce and reflection, directionless wands, zapping
// yourself, wresting and identification. Outcomes are asserted; where a roll decides the case
// (to-hit), seeds are searched for it.
import {
  createEngine,
  getPlayer,
  newMemory,
  type DefId,
  type EntityId,
  type GameState,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  P,
  T,
  WAN,
  WAND_CLASSES,
  isKnown,
  mspeed,
  shuffleAll,
  updateWornProps,
  vanillaMod,
} from '../src/index';
import { setTerrain } from '../src/actions';
import { isFrozen } from '../src/mstate';
import { setUtrap, utrap } from '../src/trapstate';
import { addMon } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

/** Wands are known by name here; identification tests shuffle them again. */
function make(rows: string[], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const d of defs.objects) if (d.class === 'wand') delete s.state.appearances[d.id];
  s.step({ type: 'wait' }); // vision for the new level
  return s;
}
const hero = (s: S) => getPlayer(s.state);
/** A carried wand with `spe` charges. */
function wand(s: S, id: string, spe = 5): EntityId {
  const e = s.carry(id);
  itemOf(s.state, e).spe = spe;
  return e;
}
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Zaps the wand; directional wands get `dir`. All messages of the zap, rendered. */
function zap(s: S, id: EntityId, dir?: string): string[] {
  const r = s.mod('nh:zap', { item: id });
  const out = s.text(r);
  if (!s.state.pendingPrompt) return out;
  return [...out, ...textOf(answer(s, dir ?? null))];
}
const terrainAt = (level: Level, x: number, y: number): DefId | undefined =>
  level.palette[level.cells[y * level.width + x] ?? 0];
const levelOf = (s: S): Level => s.state.levels['dlvl1']!;
const hpOf = (state: GameState, id: number) => state.entities[String(id)]?.c.hp?.cur ?? -1;

describe('z', () => {
  test('z is offered for carried wands only, and asks a direction with "at yourself"', () => {
    const s = make(['@....']);
    const w = wand(s, WAN.striking);
    const offers = engine
      .query(s.state)
      .actionsFor({ kind: 'item', id: w })
      .flatMap((o) => (o.action.type === 'mod' ? [o.action.action as string] : []));
    expect(offers).toContain('nh:zap');
    s.mod('nh:zap', { item: w });
    const opts = s.state.pendingPrompt?.prompt.options?.map((o) => o.value);
    expect(opts).toContain('self');
    expect(opts).toContain('e');
    expect(itemOf(s.state, w).spe).toBe(4); // the charge is used before the direction
  });

  test('cancelling the direction: the wand glows and fades, and a turn passes', () => {
    const s = make(['@....']);
    const w = wand(s, WAN.striking);
    const turn = s.state.turn;
    expect(zap(s, w, undefined)).toEqual(['The wand of striking glows and fades.']);
    expect(s.state.turn).toBeGreaterThan(turn);
    expect(itemOf(s.state, w).spe).toBe(4);
  });

  test('a cancelled wand (spe -1): nothing happens and it turns to dust', () => {
    const s = make(['@....']);
    const w = wand(s, WAN.light, -1);
    expect(zap(s, w)).toEqual(['Nothing happens.', 'The wand of light turns to dust.']);
    expect(s.state.entities[String(w)]).toBeUndefined();
  });

  test('wresting the last charge from an empty wand (1 in 121), which then turns to dust', () => {
    const s = make(['@....']);
    const w = wand(s, WAN.light, 0);
    let text: string[] = [];
    let tries = 0;
    while (s.state.entities[String(w)] && tries++ < 3000) {
      // randomly spawned monsters are removed before they can act
      for (const e of Object.values(s.state.entities))
        if (e.c.monster) delete s.state.entities[String(e.id)];
      text = zap(s, w);
      if (s.state.entities[String(w)]) {
        expect(text).toEqual(['Nothing happens.']);
        expect(itemOf(s.state, w).spe).toBe(0);
      }
    }
    expect(s.state.entities[String(w)]).toBeUndefined();
    expect(text[0]).toBe('You wrest one last charge from the worn-out wand.');
    expect(text).toContain('A lit field surrounds you!');
    expect(text.at(-1)).toBe('The wand of light turns to dust.');
  });

  test('charges show as (recharged:spe) once known, and imply "uncursed"', () => {
    const s = make(['@....']);
    const w = wand(s, WAN.striking, 6);
    const it = itemOf(s.state, w);
    it.known.buc = true;
    const name = () => render(defs.itemName(s.state, s.state.entities[String(w)]!));
    expect(name()).toBe('uncursed wand of striking');
    it.known.spe = true;
    expect(name()).toBe('wand of striking (0:6)');
  });
});

describe('immediate wands', () => {
  test('striking hits a pinned monster for 2d12 (the wand is learned)', () => {
    let seen = 0;
    for (let seed = 1; seed <= 40 && seen < 3; seed++) {
      const s = make(['@....'], seed);
      shuffleAll(ctxFor(s.state), WAND_CLASSES);
      const w = wand(s, WAN.striking);
      const m = addMon(s.state, 'nh:jackal', 2, 0, { asleep: true });
      s.state.entities[String(m)]!.c.hp = { cur: 100, max: 100 };
      s.state.entities[String(m)]!.c.actor!.speed = 0;
      const text = zap(s, w, 'e');
      if (!text.some((t) => t.startsWith('The wand hits the jackal'))) {
        expect(text).toContain('The wand misses the jackal.');
        continue;
      }
      seen++;
      const lost = 100 - hpOf(s.state, m);
      expect(lost).toBeGreaterThanOrEqual(1); // halved (rounded up) when it resists
      expect(lost).toBeLessThanOrEqual(24);
      expect(isKnown(s.state, defs, WAN.striking)).toBe(true);
      expect(s.state.entities[String(m)]!.c.monster!.asleep).toBe(false);
    }
    expect(seen).toBeGreaterThan(0);
  });

  test('striking: a magic-resistant monster says "Boing!" and takes no damage', () => {
    const mrMod: Mod = {
      id: 't',
      version: '1.0.0',
      register(api) {
        api.defineMonster({
          ...defs.monster('nh:jackal' as DefId),
          id: 't:warded_jackal' as DefId,
          attacks: [{ at: 'bite', ad: 'magm', n: 1, d: 2 }],
        });
      },
    };
    const eng = createEngine([vanillaMod, mrMod]);
    const { state } = eng.newGame({ seed: 3 });
    for (const k of Object.keys(state.entities))
      if (Number(k) !== state.playerId && !state.entities[k]?.c.item?.carriedBy)
        delete state.entities[k];
    const level: Level = {
      id: 'dlvl1',
      depth: 1,
      width: 5,
      height: 1,
      palette: [T.stone, T.floor],
      cells: [1, 1, 1, 1, 1],
      lit: [1, 1, 1, 1, 1],
      rooms: [],
      traps: [],
      up: null,
      down: null,
    };
    state.levels['dlvl1'] = level;
    state.memory['dlvl1'] = newMemory(level);
    state.currentLevel = 'dlvl1';
    const h = getPlayer(state);
    Object.assign(h.c.pos!, { level: 'dlvl1', x: 0, y: 0 });
    const m = addMon(state, 't:warded_jackal', 2, 0, { asleep: true });
    state.entities[String(m)]!.c.hp = { cur: 50, max: 50 };
    const ctx = ctxFor(state);
    const id = ctx.spawn({
      def: WAN.striking as DefId,
      c: {
        item: {
          quantity: 1,
          buc: 'uncursed',
          spe: 4,
          known: { buc: false, spe: false },
          carriedBy: state.playerId,
          letter: 'z',
          equipped: null,
          placed: state.seq++,
          age: 1,
        },
      },
    });
    eng.stepAll(state, { type: 'wait' });
    eng.step(state, { type: 'mod', action: 'nh:zap' as DefId, args: { item: id } as never });
    const p = state.pendingPrompt?.prompt;
    const r = eng.step(state, { type: 'answer', promptId: p!.id, value: 'e' });
    expect(r.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []))).toContain('zap.boing');
    expect(hpOf(state, m)).toBe(50);
  });

  test('slow monster slows a monster that fails to resist (it shows on probing)', () => {
    const s = make(['@....']);
    const w = wand(s, WAN.slow);
    const m = addMon(s.state, 'nh:jackal', 2, 0);
    const text = zap(s, w, 'e');
    expect(text).toContain('The jackal seems to be moving slower.');
    expect(mspeed(s.ctx, m)).toBe('slow');
    const probe = zap(s, wand(s, WAN.probing), 'e');
    expect(probe[0]).toMatch(
      /^Status of the jackal: Level \d+ {2}HP \d+\(\d+\) {2}AC \d+, slow\.$/,
    );
    expect(probe).toContain('The jackal is not carrying anything.');
    // MSLOW and MFAST cancel: slow -> normal -> fast
    expect(zap(s, wand(s, WAN.speed), 'e')).toContain('The jackal is suddenly moving faster.');
    expect(mspeed(s.ctx, m)).toBeNull();
    zap(s, wand(s, WAN.speed), 'e');
    expect(mspeed(s.ctx, m)).toBe('fast');
  });

  test('opening unlocks a locked door; locking locks a doorway and an open door', () => {
    const s = make(['@.....']);
    const level = levelOf(s);
    setTerrain(level, 3, 0, T.door_locked);
    expect(zap(s, wand(s, WAN.opening), 'e')).toContain('The door unlocks!');
    expect(terrainAt(level, 3, 0)).toBe(T.door_closed);

    setTerrain(level, 3, 0, T.doorway);
    expect(zap(s, wand(s, WAN.locking), 'e')).toContain(
      'A cloud of dust springs up and assembles itself into a door!',
    );
    expect(terrainAt(level, 3, 0)).toBe(T.door_locked);

    setTerrain(level, 3, 0, T.door_open_v);
    expect(zap(s, wand(s, WAN.locking), 'e')).toContain('The door swings shut, and locks!');
    expect(terrainAt(level, 3, 0)).toBe(T.door_locked);
  });

  test('striking breaks a closed door open', () => {
    const s = make(['@.....']);
    const level = levelOf(s);
    setTerrain(level, 2, 0, T.door_closed);
    expect(zap(s, wand(s, WAN.striking), 'e')).toContain('The door crashes open!');
    expect(terrainAt(level, 2, 0)).toBe(T.doorway);
  });

  test('opening frees the hero from a bear trap she is caught in', () => {
    const s = make(['@....']);
    levelOf(s).traps.push({ def: 'nh:bear_trap' as DefId, x: 0, y: 0, seen: true });
    setUtrap(s.ctx, 4, 'beartrap');
    expect(zap(s, wand(s, WAN.opening), 'self')).toContain('You are released from the bear trap.');
    expect(utrap(s.ctx)).toBeNull();
  });
});

describe('rays', () => {
  test('a fire ray bounces off the edge and hits the hero who lacks reflection', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40 && hits < 2; seed++) {
      const s = make(['@..'], seed);
      const w = wand(s, WAN.fire);
      const before = hero(s).c.hp!.cur;
      const text = zap(s, w, 'e');
      expect(text).toContain('The bolt of fire bounces!');
      if (!text.includes('The bolt of fire hits you!')) continue;
      hits++;
      expect(hero(s).c.hp!.cur).toBeLessThan(before);
      expect(text).not.toContain('But it reflects from your medallion!');
    }
    expect(hits).toBeGreaterThan(0);
  });

  test('the ray event traces the seen path, and a corner bounce turns it', () => {
    const s = make(['.....', '.....', '..@..', '.....', '.....']);
    const w = wand(s, WAN.cold);
    s.mod('nh:zap', { item: w });
    const r = answer(s, 'ne');
    const rays = r.events.flatMap((e) => (e.type === 'ray' ? [e] : []));
    expect(rays).toHaveLength(1);
    const ray = rays[0]!;
    expect(ray.kind).toBe('cold');
    expect(ray.path[0]).toEqual({ x: 3, y: 1, dx: 1, dy: -1 });
    expect(ray.path[1]).toEqual({ x: 4, y: 0, dx: 1, dy: -1 });
    // the next cell is off the map: the ray turns there and comes back in sight
    expect(ray.path[2]).toBeDefined();
    expect([ray.path[2]!.dx, ray.path[2]!.dy]).not.toEqual([1, -1]);
    for (const c of ray.path) {
      expect(c.x >= 0 && c.x < 5 && c.y >= 0 && c.y < 5).toBe(true);
      const prev = ray.path[ray.path.indexOf(c) - 1];
      if (prev)
        expect(Math.max(Math.abs(c.x - prev.x), Math.abs(c.y - prev.y))).toBeLessThanOrEqual(1);
    }
  });

  test('with an amulet of reflection the bounced ray reflects and does no harm', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40 && hits < 2; seed++) {
      const s = make(['@..'], seed);
      const am = s.carry('nh:amulet_of_reflection');
      itemOf(s.state, am).equipped = 'amulet';
      updateWornProps(s.state, defs, s.state.playerId);
      shuffleAll(ctxFor(s.state), ['amulet']);
      const w = wand(s, WAN.fire);
      const before = hero(s).c.hp!.cur;
      const text = zap(s, w, 'e');
      if (!text.includes('The bolt of fire hits you!')) continue;
      hits++;
      expect(text).toContain('But it reflects from your medallion!');
      expect(hero(s).c.hp!.cur).toBe(before);
      expect(isKnown(s.state, defs, 'nh:amulet_of_reflection')).toBe(true);
    }
    expect(hits).toBeGreaterThan(0);
  });

  test('a sleep ray puts a monster to sleep', () => {
    let slept = 0;
    for (let seed = 1; seed <= 40 && slept < 2; seed++) {
      const s = make(['@.......'], seed);
      const m = addMon(s.state, 'nh:jackal', 3, 0);
      s.state.entities[String(m)]!.c.hp = { cur: 100, max: 100 };
      const text = zap(s, wand(s, WAN.sleep), 'e');
      if (!text.includes('The sleep ray hits the jackal.')) continue;
      slept++;
      expect(isFrozen(s.ctx, m)).toBe(true);
      expect(hpOf(s.state, m)).toBe(100);
    }
    expect(slept).toBeGreaterThan(0);
  });

  test('a cold ray can kill a monster: "You kill" and experience', () => {
    let kills = 0;
    for (let seed = 1; seed <= 40 && kills < 1; seed++) {
      const s = make(['@.......'], seed);
      const m = addMon(s.state, 'nh:newt', 3, 0);
      s.state.entities[String(m)]!.c.hp = { cur: 1, max: 1 };
      const xp = hero(s).c.experience!.points;
      const text = zap(s, wand(s, WAN.cold), 'e');
      if (!text.includes('You kill the newt!')) continue;
      kills++;
      expect(s.state.entities[String(m)]?.c.monster).toBeUndefined();
      expect(hero(s).c.experience!.points).toBeGreaterThan(xp);
    }
    expect(kills).toBe(1);
  });
});

describe('directionless wands', () => {
  test('light lights the dark area around the hero', () => {
    const s = make(['.......', '...@...', '.......']);
    const level = levelOf(s);
    level.lit = level.lit.map(() => 0);
    expect(zap(s, wand(s, WAN.light))).toContain('A lit field surrounds you!');
    expect(level.lit.every((v) => v === 1)).toBe(true);
  });

  test('secret door detection reveals a secret door and an unseen trap', () => {
    const s = make(['@....']);
    const level = levelOf(s);
    setTerrain(level, 4, 0, T.sdoor_v);
    level.traps.push({ def: 'nh:arrow_trap' as DefId, x: 2, y: 0, seen: false });
    shuffleAll(ctxFor(s.state), WAND_CLASSES);
    const text = zap(s, wand(s, WAN.secretDoor));
    expect(text).toContain('You reveal a secret door and a trap!');
    expect(terrainAt(level, 4, 0)).toBe(T.door_closed);
    expect(level.traps.find((x) => x.x === 2)?.seen).toBe(true);
    expect(isKnown(s.state, defs, WAN.secretDoor)).toBe(true);
  });

  test('secret door detection with nothing to find', () => {
    const s = make(['@....']);
    expect(zap(s, wand(s, WAN.secretDoor))).toEqual(["You don't find anything."]);
  });

  test('create monster makes a monster next to the hero', () => {
    const s = make(['...', '.@.', '...']);
    const count = () => Object.values(s.state.entities).filter((e) => e?.c.monster).length;
    const before = count();
    zap(s, wand(s, WAN.createMonster));
    expect(count()).toBeGreaterThan(before);
  });
});

describe('zapping yourself', () => {
  test('a wand of sleep at yourself puts the hero to sleep', () => {
    const s = make(['@....']);
    shuffleAll(ctxFor(s.state), WAND_CLASSES);
    const w = wand(s, WAN.sleep);
    s.mod('nh:zap', { item: w });
    const turn = s.state.turn;
    const text = textOf(answer(s, 'self'));
    expect(text).toContain('The sleep ray hits you!');
    // asleep for rnd(50) turns: the turns pass, then she wakes up
    expect(text.at(-1)).toBe('You wake up.');
    expect(s.state.turn - turn).toBeGreaterThanOrEqual(2);
    expect(isKnown(s.state, defs, WAN.sleep)).toBe(true);
  });

  test('a wand of striking at yourself hurts', () => {
    const s = make(['@....']);
    const before = hero(s).c.hp!.cur;
    expect(zap(s, wand(s, WAN.striking), 'self')).toContain('You bash yourself!');
    expect(hero(s).c.hp!.cur).toBeLessThan(before);
  });

  test('a wand of speed monster at yourself makes the hero very fast', () => {
    const s = make(['@....']);
    expect(zap(s, wand(s, WAN.speed), 'self')).toContain('You are suddenly moving much faster.');
    expect(hero(s).c.props?.[P.FAST]?.timeout ?? 0).toBeGreaterThan(s.state.turn);
  });
});
