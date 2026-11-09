// m7f-a step 3: jumping boots, the spell of jumping and #jump (apply.c dojump(), jump(),
// is_valid_jump_pos(); dothrow.c hurtle_step()). Outcomes are asserted; monsters are pinned.
import {
  getPlayer,
  trapAt,
  type DefId,
  type GameState,
  type Json,
  type Level,
  type Pos,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { JUMP_ID } from '../src/index';
import { nhData } from '../src/items';
import { BOULDER } from '../src/boulder';
import { P, hasProp, setIntrinsic, setItimeout, timeoutLeft, updateWornProps } from '../src/props';
import { KEEN } from '../src/spell';
import { setPw } from '../src/uenergy';
import { setUtrap, utrap } from '../src/trapstate';
import { TRAP } from '../src/trap';
import { addMon } from './helpers';
import { defs, engine, levelSetup, plainKit } from './itemHelpers';

/** A lit 20x5 room, the hero at (3,3). */
const ROOM = [
  '                      ',
  ' .................... ',
  ' .................... ',
  ' ..@................. ',
  ' .................... ',
  ' .................... ',
  '                      ',
];
type S = ReturnType<typeof levelSetup>;
const JUMPING = 'nh:spellbook_of_jumping';

function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
/** Puts on jumping boots (no delay) and refreshes the worn properties. */
function boots(s: S): void {
  const id = s.carry('nh:jumping_boots');
  s.state.entities[String(id)]!.c.item!.equipped = 'boots';
  updateWornProps(s.state, defs, s.state.playerId);
}
const level = (s: S): Level => s.state.levels['dlvl1']!;
const heroAt = (state: GameState): Pos => {
  const p = getPlayer(state).c.pos!;
  return { x: p.x, y: p.y };
};
const offered = (s: S): boolean =>
  engine
    .query(s.state)
    .actionsFor({ kind: 'self' })
    .some((o) => o.action.type === 'mod' && o.action.action === JUMP_ID);
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.step(s.state, { type: 'answer', promptId: p.id, value: value as Json });
};
/** #jump, then the answer (when a prompt came up): all the text. */
function jumpTo(s: S, to: Pos | null): string[] {
  const r = s.mod(JUMP_ID);
  const out = s.text(r);
  if (!s.state.pendingPrompt) return out;
  return [...out, ...s.text(answer(s, to))];
}
const nutrition = (s: S): number => getPlayer(s.state).c.hunger!.nutrition;

describe('the objects', () => {
  test('objects.h: jumping boots after iron shoes, the spellbook after protection', () => {
    expect(defs.object('nh:jumping_boots' as DefId)).toMatchObject({
      class: 'armor',
      cost: 50,
      weight: 20,
      material: 'leather',
      armor: { slot: 'boots', ac: 1, mc: 0 },
      prop: 'jumping',
    });
    expect(defs.object(JUMPING as DefId)).toMatchObject({
      class: 'spellbook',
      cost: 100,
      spellbook: { level: 1 },
    });
    const ids = defs.objects.map((d) => d.id as string);
    expect(ids.indexOf('nh:jumping_boots')).toBe(ids.indexOf('nh:water_walking_boots') + 1);
    expect(ids.indexOf(JUMPING)).toBe(ids.indexOf('nh:spellbook_of_protection') + 1);
  });

  test('worn boots give Jumping and the #jump offer; taken off, neither', () => {
    const s = room();
    expect(offered(s)).toBe(false);
    boots(s);
    expect(hasProp(getPlayer(s.state), P.JUMPING)).toBe(true);
    expect(offered(s)).toBe(true);
    const b = Object.values(s.state.entities).find((e) => e?.def === 'nh:jumping_boots')!;
    b.c.item!.equipped = null;
    updateWornProps(s.state, defs, s.state.playerId);
    expect(offered(s)).toBe(false);
  });
});

describe('#jump with jumping boots', () => {
  test('the prompt highlights the reachable cells; she lands, is helpless a turn, hungrier', () => {
    const s = room();
    boots(s);
    const r = s.mod(JUMP_ID);
    expect(s.text(r)).toEqual([]);
    const p = s.state.pendingPrompt?.prompt;
    expect(p).toMatchObject({ id: 'jump-where', kind: 'position', key: 'jump.where' });
    const valid = (p?.valid ?? []).map((c) => `${c.x - 3},${c.y - 3}`);
    expect(valid).toContain('3,0'); // distance squared 9
    expect(valid).toContain('2,2'); // 8
    expect(valid).toContain('-2,-2');
    expect(valid).not.toContain('3,1'); // 10: too far
    expect(valid).not.toContain('0,0'); // not her own cell
    expect(valid).not.toContain('-3,0'); // x 0 is stone
    const turn = s.state.turn;
    const food = nutrition(s);
    const t = s.text(answer(s, { x: 6, y: 3 }));
    expect(t).toEqual([]);
    expect(heroAt(s.state)).toEqual({ x: 6, y: 3 });
    expect(s.state.turn).toBe(turn + 2); // the move and nomul(-1)
    expect(food - nutrition(s)).toBeGreaterThanOrEqual(1);
    expect(food - nutrition(s)).toBeLessThanOrEqual(25 + 2);
  });

  test('refusals take no time: too far, cancelled, an obstacle, in place', () => {
    const s = room();
    boots(s);
    const turn = s.state.turn;
    expect(jumpTo(s, { x: 6, y: 4 })).toEqual(['Too far!']);
    expect(jumpTo(s, null)).toEqual([]);
    s.floor(BOULDER, { at: { level: 'dlvl1', x: 4, y: 3 } });
    // seen past it (vision is not one Bresenham line), but the jump's line meets it
    expect(jumpTo(s, { x: 5, y: 4 })).toEqual(['There is an obstacle preventing that jump.']);
    expect(jumpTo(s, { x: 3, y: 3 })).toEqual(['You decide not to jump after all.']);
    expect(s.state.turn).toBe(turn);
    expect(heroAt(s.state)).toEqual({ x: 3, y: 3 });
  });

  test('a cell she cannot see: "You cannot see where to land!"', () => {
    const s = room();
    boots(s);
    setItimeout(s.state, getPlayer(s.state), P.BLINDED, 100);
    s.step({ type: 'search' });
    expect(jumpTo(s, { x: 5, y: 3 })).toEqual(['You cannot see where to land!']);
  });

  test("she can't jump very far without boots, or burdened, weak, levitating, lame", () => {
    const s = room();
    expect(jumpTo(s, null)).toEqual(["You can't jump very far."]);
    boots(s);
    const h = getPlayer(s.state);
    h.c.hunger!.nutrition = 100;
    expect(jumpTo(s, null)).toEqual(['You lack the strength to jump!']);
    h.c.hunger!.nutrition = 900;
    setItimeout(s.state, h, P.WOUNDED_LEGS, 50);
    expect(jumpTo(s, null)).toEqual(['Your right leg is in no shape for jumping.']);
    setItimeout(s.state, h, P.WOUNDED_LEGS, 0);
    for (let i = 0; i < 12; i++) s.carry(BOULDER);
    expect(jumpTo(s, null)).toEqual(['You are carrying too much to jump!']);
    expect(s.state.pendingPrompt).toBeNull();
  });

  test("a Knight-style (intrinsic only) jumper may only make a knight's move", () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.JUMPING, true);
    expect(jumpTo(s, { x: 5, y: 3 })).toEqual(['Illegal move!']);
    expect(jumpTo(s, { x: 5, y: 4 })).toEqual([]);
    expect(heroAt(s.state)).toEqual({ x: 5, y: 4 });
  });

  test('out of a pit: "You leap from the pit!"; out of a web it is torn apart', () => {
    const s = room();
    boots(s);
    level(s).traps.push({ def: TRAP.pit as DefId, x: 3, y: 3, seen: true });
    setUtrap(s.ctx, 3, 'pit');
    expect(jumpTo(s, { x: 5, y: 3 })).toEqual(['You leap from the pit!']);
    expect(heroAt(s.state)).toEqual({ x: 5, y: 3 });
    expect(utrap({ state: s.state })).toBeNull();

    const w = room();
    boots(w);
    level(w).traps.push({ def: TRAP.web as DefId, x: 3, y: 3, seen: true });
    setUtrap(w.ctx, 3, 'web');
    expect(jumpTo(w, { x: 3, y: 3 })).toEqual([
      'You tear the web apart as you pull yourself free!',
    ]);
    expect(trapAt(level(w), 3, 3)).toBeUndefined();
    expect(utrap({ state: w.state })).toBeNull();
  });

  test('out of a bear trap: it hurts and wounds a leg', () => {
    const s = room();
    boots(s);
    level(s).traps.push({ def: TRAP.bear as DefId, x: 3, y: 3, seen: true });
    setUtrap(s.ctx, 4, 'beartrap');
    const hp = getPlayer(s.state).c.hp!.cur;
    expect(jumpTo(s, { x: 5, y: 3 })).toContain('You rip yourself free of the bear trap!  Ouch!');
    expect(heroAt(s.state)).toEqual({ x: 5, y: 3 });
    expect(getPlayer(s.state).c.hp!.cur).toBeLessThan(hp + 2);
    expect(timeoutLeft(s.state, getPlayer(s.state), P.WOUNDED_LEGS)).toBeGreaterThan(400);
  });

  test('in place on a trap sets it off', () => {
    const s = room();
    boots(s);
    level(s).traps.push({ def: TRAP.squeaky as DefId, x: 3, y: 3, seen: true });
    const t = jumpTo(s, { x: 3, y: 3 });
    expect(t[0]).toBe('You jump up and come back down.');
    expect(t.some((l) => l.includes('squeak'))).toBe(true);
  });

  test('a monster in the way is bumped: she stops before it and it wakes, angry', () => {
    const s = room();
    boots(s);
    const id = addMon(s.state, 'nh:newt', 5, 3, { asleep: true, peaceful: true });
    const t = jumpTo(s, { x: 6, y: 3 });
    expect(t[0]).toBe('You bump into a newt.');
    expect(heroAt(s.state)).toEqual({ x: 4, y: 3 });
    const m = s.state.entities[String(id)]!.c.monster!;
    expect(m.asleep).toBe(false);
    expect(m.peaceful).toBe(false);
  });

  test('a seen trap on the way is passed over', () => {
    const s = room();
    boots(s);
    level(s).traps.push({ def: TRAP.pit as DefId, x: 4, y: 3, seen: true });
    expect(jumpTo(s, { x: 6, y: 3 })).toEqual(['You pass right over a pit.']);
    expect(heroAt(s.state)).toEqual({ x: 6, y: 3 });
    expect(utrap({ state: s.state })).toBeNull();
  });
});

describe('the spell of jumping', () => {
  function caster(seed = 1): S {
    const s = room(seed);
    const h = getPlayer(s.state);
    h.c.attributes!.wis = 25;
    const robe = s.carry('nh:robe');
    s.state.entities[String(robe)]!.c.item!.equipped = 'cloak';
    // percent_success() needs no metal armor: drop the kit's body armor and shield
    for (const e of Object.values(s.state.entities))
      if (e?.c.item?.carriedBy === h.id && e.c.item.equipped && e.c.item.equipped !== 'cloak')
        e.c.item.equipped = null;
    setPw(s.ctx, { uen: 100, uenmax: 100, uenpeak: 100 });
    (s.state.modData['nh'] as Record<string, Json>)['spells'] = [{ id: JUMPING, retention: KEEN }];
    return s;
  }
  const cast = (s: S): StepResult => {
    s.mod('nh:cast');
    return answer(s, 0);
  };

  test('the range grows with escape skill: 3 squares Unskilled, distance 12 at Basic', () => {
    const s = caster();
    cast(s);
    let valid = (s.state.pendingPrompt?.prompt.valid ?? []).map((c) => `${c.x - 3},${c.y - 3}`);
    expect(valid).toContain('3,0');
    expect(valid).not.toContain('3,1');
    answer(s, null);
    nhData(s.ctx).skills = { ...(nhData(s.ctx).skills ?? {}), escape_spell: 2 };
    cast(s);
    valid = (s.state.pendingPrompt?.prompt.valid ?? []).map((c) => `${c.x - 3},${c.y - 3}`);
    expect(valid).toContain('3,1');
    expect(valid).toContain('2,2');
    expect(valid).not.toContain('3,2'); // 13
    expect(s.text(answer(s, { x: 6, y: 4 }))).toEqual([]);
    expect(heroAt(s.state)).toEqual({ x: 6, y: 4 });
  });

  test('cancelled, "Nothing happens." and the move and energy are spent', () => {
    const s = caster();
    const turn = s.state.turn;
    cast(s);
    expect(s.text(answer(s, null))).toEqual(['Nothing happens.']);
    expect(s.state.turn).toBe(turn + 1);
    expect(heroAt(s.state)).toEqual({ x: 3, y: 3 });
  });

  test("no knight's-move rule and no strength check; #jump without boots casts it", () => {
    const s = caster();
    getPlayer(s.state).c.hunger!.nutrition = 50; // too weak to jump, not to cast
    expect(offered(s)).toBe(true);
    const r = s.mod(JUMP_ID);
    expect(s.text(r)).not.toContain('You lack the strength to jump!');
    expect(s.state.pendingPrompt?.prompt.id).toBe('jump-where');
    answer(s, { x: 5, y: 3 });
    expect(heroAt(s.state)).toEqual({ x: 5, y: 3 });
  });

  test('levitating, the spell wriggles and takes the move: "You flail around a little."', () => {
    const s = caster();
    setItimeout(s.state, getPlayer(s.state), P.LEVITATION, 50);
    const turn = s.state.turn;
    const t = s.text(cast(s));
    expect(t).toEqual(['You flail around a little.']);
    expect(s.state.turn).toBe(turn + 1);
  });
});
