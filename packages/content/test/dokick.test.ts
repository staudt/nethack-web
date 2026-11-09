import { itemsAt, type DefId, type EntityId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { T, isFleeing, monflee, fleeTime, mksobj } from '../src/index';
import { addMon, posOf, setup } from './helpers';
import { ctxFor, defs, engine, obj } from './itemHelpers';

const keys = (r: { events: { type: string; key?: string }[] }): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' && e.key ? [e.key] : []));

type S = ReturnType<typeof setup>;
const kick = (s: S, dir: string) => {
  engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: dir });
};
const stats = (s: S, str = 18, dex = 14, con = 18) => {
  const h = s.state.entities[String(s.state.playerId)];
  if (h) h.c.attributes = { str, int: 10, wis: 10, dex, con, cha: 10 };
};
const terrainAt = (s: S, x: number, y: number) =>
  s.level.palette[s.level.cells[y * s.level.width + x] ?? 0];

describe('kick: door', () => {
  test('locked and closed doors crash open or go whammm, at about the formula odds', () => {
    let opened = 0;
    const n = 300;
    for (let seed = 1; seed <= n; seed++) {
      const s = setup(['.@X.', '....'], seed);
      stats(s);
      const r = kick(s, 'e');
      const k = keys(r);
      if (terrainAt(s, 2, 0) === T.doorway) {
        opened++;
        expect(k.some((x) => x === 'kick.door_crashes' || x === 'kick.door_shatters')).toBe(true);
      } else {
        expect(k.some((x) => x === 'kick.door_whammm' || x === 'kick.door_thwack')).toBe(true);
        expect(terrainAt(s, 2, 0)).toBe(T.door_locked);
      }
    }
    // rnl(35) < (18 + 14 + 18) / 3 = 16 -> 16/35 = 45.7%
    expect(opened / n).toBeGreaterThan(0.37);
    expect(opened / n).toBeLessThan(0.55);
  });

  test('a closed door can be kicked in too, and the direct offer exists', () => {
    const s = setup(['.@+.'], 3);
    const offers = engine.query(s.state).actionsFor({ kind: 'cell', pos: { x: 2, y: 0 } });
    const o = offers.find((x) => x.labelKey === 'action.nh:kick_door');
    expect(o?.action).toEqual({ type: 'mod', action: 'nh:kick', args: { dir: 'e' } });
    let done = false;
    for (let i = 0; i < 40 && !done; i++) {
      const r = engine.step(s.state, o!.action);
      expect(s.state.pendingPrompt).toBeNull();
      expect(keys(r).length).toBeGreaterThan(0);
      done = terrainAt(s, 2, 0) === T.doorway;
    }
    expect(done).toBe(true);
  });

  test('an open door is kicked at empty space', () => {
    const s = setup(['.@o.'], 1);
    stats(s, 18, 18, 18);
    expect(keys(kick(s, 'e'))).toContain('kick.empty_space');
  });

  test('self offers Kick', () => {
    const s = setup(['.@..']);
    const offers = engine.query(s.state).actionsFor({ kind: 'self' });
    expect(offers.some((o) => o.labelKey === 'action.nh:kick')).toBe(true);
  });
});

describe('kick: walls and legs', () => {
  test('a wall says Ouch and costs hit points', () => {
    const s = setup(['|.@.|', '-----'], 2); // a seed where no hit point regenerates that turn (1 before m12 step 5)
    stats(s);
    const hp0 = s.state.entities[String(s.state.playerId)]!.c.hp!.cur;
    const r = kick(s, 's');
    expect(keys(r)).toContain('kick.ouch');
    const hp1 = s.state.entities[String(s.state.playerId)]!.c.hp!.cur;
    expect(hp0 - hp1).toBeGreaterThanOrEqual(1);
    expect(hp0 - hp1).toBeLessThanOrEqual(3);
  });

  test('wounded legs block kicking until they heal', () => {
    let hurt = false;
    for (let seed = 1; seed <= 60 && !hurt; seed++) {
      const s = setup(['|.@.|', '-----'], seed);
      stats(s);
      kick(s, 's');
      if (s.state.entities[String(s.state.playerId)]?.c.props?.['wounded_legs']) {
        hurt = true;
        const turn = s.state.turn;
        engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
        expect(s.state.pendingPrompt).toBeNull();
        expect(s.state.turn).toBe(turn);
        for (let i = 0; i < 12; i++) s.wait();
        expect(
          s.state.entities[String(s.state.playerId)]?.c.props?.['wounded_legs'],
        ).toBeUndefined();
        engine.step(s.state, { type: 'mod', action: 'nh:kick' as DefId });
        expect(s.state.pendingPrompt?.prompt.kind).toBe('direction');
      }
    }
    expect(hurt).toBe(true);
  });
});

describe('kick: objects and monsters', () => {
  test('a dagger slides away; a heavy thing goes Thump', () => {
    const s = setup(['@.......'], 4);
    stats(s);
    const c = ctxFor(s.state);
    const dag = mksobj(c, obj('nh:dagger'), { init: false, at: { level: 'dlvl1', x: 1, y: 0 } });
    const r = kick(s, 'e');
    expect(keys(r)).toContain('kick.you_kick_obj');
    const e = s.state.entities[String(dag)]!;
    expect(e.c.pos!.x).toBeGreaterThan(1);
    const s2 = setup(['@.......'], 4);
    stats(s2);
    const c2 = ctxFor(s2.state);
    mksobj(c2, obj('nh:long_sword'), {
      init: false,
      at: { level: 'dlvl1', x: 1, y: 0 },
    });
    stats(s2, 4, 10, 10); // too weak to send anything far: range 2 - 1
    const r2 = kick(s2, 'e');
    expect(keys(r2)).toContain('kick.you_kick_obj');
    expect(itemsAt(defs, s2.state, 'dlvl1', 1, 0).length).toBe(1);
  });

  test('a kicked object stops before a wall', () => {
    const s = setup(['@.|'], 4);
    stats(s);
    const c = ctxFor(s.state);
    const dag = mksobj(c, obj('nh:dagger'), { init: false, at: { level: 'dlvl1', x: 1, y: 0 } });
    kick(s, 'e');
    expect(s.state.entities[String(dag)]!.c.pos!.x).toBe(1);
  });

  test('kicking a monster hurts it for (Str+Dex+Con)/15 at most', () => {
    let damaged = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = setup(['@.', '..'], seed);
      stats(s);
      const id = addMon(s.state, 'nh:newt', 1, 0, { asleep: true });
      const m = s.state.entities[String(id)]!;
      m.c.hp = { cur: 100, max: 100 };
      const r = kick(s, 'e');
      const lost = 100 - (s.state.entities[String(id)]?.c.hp?.cur ?? 0);
      expect(lost).toBeLessThanOrEqual(3);
      if (lost > 0) {
        damaged++;
        expect(keys(r)).toContain('kick.you_kick_mon');
      }
    }
    expect(damaged).toBeGreaterThan(10);
  });

  test('a kick can kill', () => {
    const s = setup(['@.'], 5);
    stats(s);
    const id = addMon(s.state, 'nh:newt', 1, 0, { asleep: true });
    s.state.entities[String(id)]!.c.hp = { cur: 1, max: 1 };
    let killed = false;
    for (let i = 0; i < 10 && !killed; i++) {
      const r = kick(s, 'e');
      killed = keys(r).includes('combat.you_kill');
      if (!killed && !s.state.entities[String(id)]) break;
    }
    expect(s.state.entities[String(id)]).toBeUndefined();
  });
});

describe('fleeing', () => {
  const mk = (seed = 1) => {
    const s = setup(['@.........'], seed);
    const id = addMon(s.state, 'nh:jackal', 3, 0);
    return { s, id };
  };
  const ctx = (s: S) => ctxFor(s.state) as unknown as Parameters<typeof monflee>[0];

  test('a fleeing monster moves away and times out', () => {
    const { s, id } = mk();
    monflee(ctx(s), id, 5, false, false);
    expect(isFleeing(s, id)).toBe(true);
    expect(fleeTime(s, id)).toBe(5);
    const d0 = posOf(s.state, id).x;
    s.wait();
    s.wait();
    expect(posOf(s.state, id).x).toBeGreaterThan(d0);
    for (let i = 0; i < 6; i++) s.wait();
    expect(isFleeing(s, id)).toBe(false);
  });

  test('"turns to flee" shows when seen', () => {
    const { s, id } = mk();
    const c = ctxFor(s.state);
    monflee(c as never, id, 5, false, true);
    expect(c.events.some((e) => e.type === 'msg' && e.key === 'mon.turns_to_flee')).toBe(true);
  });

  test('a cornered fleeing monster still attacks', () => {
    const s = setup(['@.'], 1);
    const id = addMon(s.state, 'nh:jackal', 1, 0);
    monflee(ctxFor(s.state) as never, id, 50, false, false);
    let hit = false;
    for (let i = 0; i < 20 && !hit; i++) {
      const r = s.wait();
      hit = keys(r).some((k) => k.startsWith('combat.mon_'));
    }
    expect(hit).toBe(true);
    expect(posOf(s.state, id).x).toBe(1);
  });

  test('hitting a monster below half hit points sometimes scares it', () => {
    let fled = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const s = setup(['@.'], seed);
      const id = addMon(s.state, 'nh:newt', 1, 0, { asleep: true });
      s.state.entities[String(id)]!.c.hp = { cur: 1000, max: 4000 };
      engine.step(s.state, { type: 'move', dir: 'e' });
      if (isFleeing(s, id)) fled++;
    }
    expect(fled).toBeGreaterThan(2);
    expect(fled).toBeLessThan(30);
  });
});

describe('peaceful confirmation', () => {
  const mk = () => {
    const s = setup(['@.'], 1);
    const id = addMon(s.state, 'nh:dwarf', 1, 0, { peaceful: true, asleep: true });
    s.state.entities[String(id)]!.c.hp = { cur: 50, max: 50 };
    return { s, id: id as EntityId };
  };

  const fight = (s: ReturnType<typeof mk>['s']) =>
    engine.step(s.state, { type: 'mod', action: 'nh:fight' as DefId, args: { dir: 'e' } });

  test('moving into a peaceful does not attack it (is_safemon): a swap, or "in the way"', () => {
    const { s, id } = mk();
    engine.step(s.state, { type: 'move', dir: 'e' });
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.state.entities[String(id)]?.c.monster?.peaceful).toBe(true);
    expect(s.state.entities[String(id)]?.c.hp?.cur).toBe(50);
  });

  test('fighting a peaceful asks, no costs nothing', () => {
    const { s, id } = mk();
    const turn = s.state.turn;
    fight(s);
    const p = s.state.pendingPrompt?.prompt;
    expect(p?.kind).toBe('yn');
    expect(p?.key).toBe('attack.confirm');
    engine.step(s.state, { type: 'answer', promptId: p!.id, value: false });
    expect(s.state.turn).toBe(turn);
    expect(s.state.entities[String(id)]?.c.monster?.peaceful).toBe(true);
    expect(s.state.entities[String(id)]?.c.hp?.cur).toBe(50);
  });

  test('yes attacks and angers it', () => {
    const { s, id } = mk();
    let angry = false;
    for (let i = 0; i < 30 && !angry; i++) {
      fight(s);
      const p = s.state.pendingPrompt?.prompt;
      if (p) engine.step(s.state, { type: 'answer', promptId: p.id, value: true });
      const m = s.state.entities[String(id)]?.c.monster;
      angry = !m || !m.peaceful;
    }
    expect(angry).toBe(true);
  });

  test('travel never attacks it', () => {
    const { s, id } = mk();
    engine.step(s.state, { type: 'mod', action: 'nh:travel' as DefId, args: { x: 1, y: 0 } });
    expect(s.state.entities[String(id)]?.c.monster?.peaceful).toBe(true);
    expect(s.state.entities[String(id)]?.c.hp?.cur).toBe(50);
  });

  test('kicking a peaceful asks too', () => {
    const { s } = mk();
    kick(s, 'e');
    expect(s.state.pendingPrompt?.prompt.key).toBe('attack.confirm');
  });
});
