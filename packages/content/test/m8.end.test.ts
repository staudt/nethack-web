// m8 step 1: the end of the game. The pack identified at game over, the disclosure lists with
// their questions, and the endHow / endDungeon / role statuses.
import {
  buildSnapshot,
  createEngine,
  getPlayer,
  inventoryOf,
  putIn,
  type GameEvent,
  type GameState,
  type Msg,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { addToInventory, mksobj, vanillaMod } from '../src/index';
import { addMon, setup } from './helpers';
import { ctxFor, obj, render } from './itemHelpers';

const lists = (ev: GameEvent[]) =>
  ev.filter((e): e is Extract<GameEvent, { type: 'list' }> => e.type === 'list');

/** A cursed, unidentified potion of sleeping, and a sack holding an unidentified ring. */
function stock(state: GameState): { potion: number; sack: number; ring: number } {
  const ctx = ctxFor(state);
  const hero = state.playerId;
  const potion = mksobj(ctx, obj('nh:potion_of_sleeping'), { init: false });
  state.entities[String(potion)]!.c.item!.buc = 'cursed';
  addToInventory(ctx, hero, potion);
  const sack = mksobj(ctx, obj('nh:sack'), { init: false });
  addToInventory(ctx, hero, sack);
  const ring = mksobj(ctx, obj('nh:ring_of_teleportation'), { init: false });
  putIn(ctx.defs, state, sack, ring);
  return { potion, sack, ring };
}

const statusOf = (engine: ReturnType<typeof createEngine>, state: GameState) =>
  buildSnapshot(engine.registry, state).status;

/** Waits next to a hostile jackal at 1 HP until she dies (it gets through; nothing else moves). */
function killedByJackal() {
  const s = setup(['@j.']);
  const items = stock(s.state);
  addMon(s.state, 'nh:jackal', 1, 0, { energy: 12 });
  getPlayer(s.state).c.hp!.cur = 1;
  let events: GameEvent[] = [];
  for (let i = 0; i < 300 && !s.state.gameOver; i++)
    events = s.engine.step(s.state, { type: 'wait' }).events;
  expect(s.state.gameOver).toMatchObject({ kind: 'died', killer: '@nh:jackal' });
  return { ...s, items, events };
}

describe('end of game: disclosure', () => {
  test('a death identifies the pack and sends the two lists with their questions', () => {
    const { engine, state, items, events } = killedByJackal();
    const potion = state.entities[String(items.potion)]!;
    const ring = state.entities[String(items.ring)]!;
    expect(state.discovered).toContain('nh:potion_of_sleeping');
    expect(state.discovered).toContain('nh:ring_of_teleportation');
    expect(potion.c.item?.known.buc).toBe(true);
    expect(ring.c.item?.known.buc).toBe(true);
    // no "d - ..." lines: the loop is silent
    expect(events.some((e) => e.type === 'msg' && e.key === 'inv.menu_item')).toBe(false);

    const [inv, attrs, ...rest] = lists(events);
    expect(rest).toEqual([]);
    expect(inv).toMatchObject({ ask: 'end.ask.inventory', titleKey: 'end.inventory' });
    expect(attrs).toMatchObject({ ask: 'end.ask.attributes', titleKey: 'end.attributes' });
    const text = (inv?.items ?? []).map((m: Msg) => render(m));
    const letter = (id: number) => state.entities[String(id)]?.c.item?.letter ?? '?';
    expect(text).toEqual([
      'Potions',
      `${letter(items.potion)} - a cursed potion of sleeping`,
      'Tools',
      `${letter(items.sack)} - an uncursed sack containing 1 item`,
      'Contents of the sack:',
      '  an uncursed ring of teleportation',
    ]);
    expect(attrs?.items[0]).toEqual({ key: 'enl.status' });

    const st = statusOf(engine, state);
    expect(st['endHow']).toBe('died');
    expect(st['endDungeon']).toBe('nh:main');
    expect(st['role']).toBe('role.valkyrie');
    expect(render({ key: String(st['endDungeon']) })).toBe('The Dungeons of Doom');
  });

  test('statuses are absent while playing; no inventory question with nothing carried', () => {
    const s = setup(['@j.']);
    expect(statusOf(s.engine, s.state)['endHow']).toBeUndefined();
    addMon(s.state, 'nh:jackal', 1, 0, { energy: 12 });
    getPlayer(s.state).c.hp!.cur = 1;
    let events: GameEvent[] = [];
    for (let i = 0; i < 300 && !s.state.gameOver; i++)
      events = s.engine.step(s.state, { type: 'wait' }).events;
    expect(inventoryOf(s.state, s.state.playerId)).toEqual([]);
    expect(lists(events).map((l) => l.ask)).toEqual(['end.ask.attributes']);
  });

  test('starving: endHow starving', () => {
    const s = setup(['@']);
    const hero = getPlayer(s.state);
    let events: GameEvent[] = [];
    for (let i = 0; i < 500 && !s.state.gameOver; i++) {
      // keep her starving and awake: fainted, far below the limit, never helpless
      hero.c.hunger!.nutrition = -1000;
      hero.c.hunger!.state = 'fainted';
      events = s.engine.step(s.state, { type: 'wait' }).events;
    }
    expect(s.state.gameOver).toMatchObject({ kind: 'died', killer: '@killer.starvation' });
    expect(statusOf(s.engine, s.state)['endHow']).toBe('starving');
    expect(lists(events).map((l) => l.ask)).toEqual(['end.ask.attributes']);
    expect(render({ key: 'end.killer.starving', params: { killer: '@killer.starvation' } })).toBe(
      'died of starvation',
    );
  });

  test('escaping: the lists, endHow escaped', () => {
    const engine = createEngine([vanillaMod]);
    const { state } = engine.newGame({ seed: 3 });
    engine.step(state, { type: 'mod', action: 'nh:up' });
    const ev = engine.step(state, {
      type: 'answer',
      promptId: 'leave-dungeon',
      value: true,
    }).events;
    expect(state.gameOver).toMatchObject({ kind: 'escaped' });
    expect(lists(ev).map((l) => l.ask)).toEqual(['end.ask.inventory', 'end.ask.attributes']);
    expect(statusOf(engine, state)['endHow']).toBe('escaped');
    // her kit is fully known
    for (const e of inventoryOf(state, state.playerId)) expect(e.c.item?.known.buc).toBe(true);
  });

  test('choking words its killer for "choked on"', () => {
    expect(
      render({ key: 'end.killer.choking', params: { killer: '@killer.choked.nh:food_ration' } }),
    ).toBe('choked on a food ration');
    expect(
      render({ key: 'end.killer.choking', params: { killer: '@killer.choked.nh:apple' } }),
    ).toBe('choked on an apple');
  });
});
