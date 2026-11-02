// Milestone 5b end-to-end scenarios: every step is an offered action (actionsFor) or a prompt
// answer, the way a player on a phone would drive the game.
import { BOX, KEY, P, TRAP, WAN, hasProp, vanillaMod } from '@nh/content';
import {
  buildSnapshot,
  contents,
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  putIn,
  trapAt,
  type DefId,
  type Engine,
  type EntityId,
  type GameEvent,
  type GameState,
  type Json,
  type Target,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants, runScenario } from '../src/index';

// at least 10x10: a level below is generated at the same size
const ROOM = [
  '------------',
  '|..........|',
  '|..........|',
  '|..........|',
  '|....@.....|',
  '|..........|',
  '|..........|',
  '|..........|',
  '|..........|',
  '------------',
];
const HERE = { x: 5, y: 4 };
const defs = createEngine([vanillaMod]).registry;

type Run = { state: GameState; engine: Engine };

/** Takes the offer with this mod action id (or core action type) for `target`; fails if it is not offered. */
function take(r: Run, target: Target, action: string): GameEvent[] {
  const offer = r.engine
    .query(r.state)
    .actionsFor(target)
    .find((o) => (o.action.type === 'mod' ? o.action.action : o.action.type) === action);
  if (!offer) throw new Error(`'${action}' is not offered for ${JSON.stringify(target)}`);
  return r.engine.stepAll(r.state, offer.action).events;
}
/** Answers the pending prompt, which must have this id. */
function answer(r: Run, id: string, value: Json): GameEvent[] {
  expect(r.state.pendingPrompt?.prompt.id).toBe(id);
  return r.engine.stepAll(r.state, { type: 'answer', promptId: id, value }).events;
}
/** Steps `continue` until the multi-turn action ends. */
function finish(r: Run, first: GameEvent[]): GameEvent[] {
  const all = [...first];
  for (let i = 0; i < 100 && r.state.occupation; i++)
    all.push(...r.engine.stepAll(r.state, { type: 'continue' }).events);
  expect(r.state.occupation).toBeNull();
  return all;
}
const keys = (ev: readonly GameEvent[]): string[] =>
  ev.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
const carried = (st: GameState, def: DefId): EntityId => {
  const e = inventoryOf(st, st.playerId).find((x) => x.def === def);
  if (!e) throw new Error(`no ${def} carried`);
  return e.id;
};
const floorItem = (st: GameState, def: DefId): EntityId => {
  const e = Object.values(st.entities).find((x) => x.def === def && x.c.pos);
  if (!e) throw new Error(`no ${def} on the floor`);
  return e.id;
};
const healthy = (r: Run): void => expect(checkInvariants(r.state, r.engine.registry)).toEqual([]);

describe('traps', () => {
  test('stepping on a hidden trap door drops the hero a level; the door is remembered', () => {
    const r = runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.setHero({ hp: 100, maxHp: 100 });
      s.check((st, _q) => {
        getLevel(st).traps.push({
          def: TRAP.trapdoor as DefId,
          x: HERE.x + 1,
          y: HERE.y,
          seen: false,
          data: { dst: 2 },
        });
      });
    });
    // hidden: neither shown nor known to the player
    expect(buildSnapshot(r.engine.registry, r.state).cells.some((c) => c.t !== undefined)).toBe(
      false,
    );
    const ev = r.engine.stepAll(r.state, { type: 'move', dir: 'e' }).events;
    expect(keys(ev)).toContain('trap.door.opens');
    expect(getLevel(r.state).depth).toBe(2);
    const door = trapAt(r.state.levels['dlvl1']!, HERE.x + 1, HERE.y);
    expect(door?.seen).toBe(true);
    healthy(r);
  });

  test('searching finds an adjacent trap; it then shows on the map', () => {
    let found = false;
    for (let seed = 1; seed <= 20 && !found; seed++) {
      const r = runScenario([vanillaMod], (s) => {
        s.seed(seed);
        s.level(ROOM);
        s.clearMonsters();
        s.check((st) => {
          getLevel(st).traps.push({ def: TRAP.squeaky as DefId, x: 6, y: 4, seen: false });
        });
      });
      for (let i = 0; i < 15 && !found; i++) {
        take(r, { kind: 'self' }, 'search');
        found = trapAt(getLevel(r.state), 6, 4)?.seen === true;
      }
      if (!found) continue;
      const snap = buildSnapshot(r.engine.registry, r.state);
      const cell = snap.cells[4 * snap.width + 6];
      expect(cell?.t).toBe(TRAP.squeaky);
      healthy(r);
    }
    expect(found).toBe(true);
  });
});

describe('wands', () => {
  test('zapping a wand of striking at a monster hurts it and spends a charge', () => {
    let hits = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const r = runScenario([vanillaMod], (s) => {
        s.seed(seed);
        s.level(ROOM);
        s.clearMonsters();
        s.item(WAN.striking as DefId, 'inventory', { spe: 5 });
        s.monster(
          'nh:jackal' as DefId,
          { x: HERE.x + 3, y: HERE.y },
          {
            hp: 100,
            speed: 0,
            asleep: true,
          },
        );
      });
      const wand = carried(r.state, WAN.striking as DefId);
      take(r, { kind: 'item', id: wand }, 'nh:zap');
      answer(r, 'zap-direction', 'e');
      expect(r.state.entities[String(wand)]?.c.item?.spe).toBe(4);
      const jackal = Object.values(r.state.entities).find((e) => e.def === 'nh:jackal');
      const hp = jackal?.c.hp?.cur ?? 0;
      if (hp < 100) {
        hits++;
      }
      healthy(r);
    }
    // a wand of striking misses only on a bad to-hit roll (ref: zap.c bhitm() rnd(20) < 10 + AC)
    expect(hits).toBeGreaterThan(5);
  });
});

describe('containers and locks', () => {
  test('a locked large box on the floor: unlock it with a key, then take out what is inside', () => {
    const r = runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.clearMonsters();
      s.clearInventory();
      s.item(KEY.skeleton as DefId, 'inventory');
      s.item(BOX.large as DefId, HERE);
      s.item('nh:apple' as DefId, HERE, { quantity: 3 });
      s.check((st, _q) => {
        const box = floorItem(st, BOX.large as DefId);
        const apple = floorItem(st, 'nh:apple' as DefId);
        delete st.entities[String(apple)]!.c.pos;
        putIn(defs, st, box, apple);
        st.entities[String(box)]!.c.item!.locked = true;
      });
    });
    const box = floorItem(r.state, BOX.large as DefId);
    expect(contents(r.state, box)).toHaveLength(1);

    // #loot finds the lock; with a key at hand the game offers to unlock it
    const tries: GameEvent[] = [];
    for (let i = 0; i < 3 && !r.state.pendingPrompt; i++)
      tries.push(...take(r, { kind: 'self' }, 'nh:loot'));
    expect(keys(tries)).toContain('loot.turns_out_locked');
    finish(r, answer(r, 'lock-auto', true));
    expect(r.state.entities[String(box)]?.c.item?.locked).toBeFalsy();

    take(r, { kind: 'self' }, 'nh:loot');
    answer(r, 'loot-what', 'o');
    const opts = r.state.pendingPrompt?.prompt.options ?? [];
    answer(
      r,
      'loot-out',
      opts.map((o) => o.value),
    );
    expect(contents(r.state, box)).toHaveLength(0);
    expect(
      inventoryOf(r.state, r.state.playerId).find((e) => e.def === 'nh:apple')?.c.item?.quantity,
    ).toBe(3);
    healthy(r);
  });
});

describe('rings', () => {
  test('putting on a ring grants its property; removing it takes the property away', () => {
    const r = runScenario([vanillaMod], (s) => {
      s.level(ROOM);
      s.clearMonsters();
      s.item('nh:ring_of_fire_resistance' as DefId, 'inventory');
    });
    const hero = () => getPlayer(r.state);
    const ring = carried(r.state, 'nh:ring_of_fire_resistance' as DefId);
    expect(hasProp(hero(), P.FIRE_RES)).toBe(false);
    take(r, { kind: 'item', id: ring }, 'nh:puton');
    const hands = r.state.pendingPrompt?.prompt.options ?? [];
    answer(r, 'ring-hand', hands[0]!.value);
    expect(r.state.entities[String(ring)]?.c.item?.equipped).not.toBeNull();
    expect(hasProp(hero(), P.FIRE_RES)).toBe(true);
    healthy(r);

    take(r, { kind: 'item', id: ring }, 'nh:remove');
    expect(r.state.entities[String(ring)]?.c.item?.equipped).toBeNull();
    expect(hasProp(hero(), P.FIRE_RES)).toBe(false);
    healthy(r);
  });
});
