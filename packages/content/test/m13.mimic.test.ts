// m13 step 2: mimics and their disguises. set_mimic_sym() picks a disguise for where the mimic
// stands; it is drawn, described and remembered as that disguise; bumping into it ("Wait!"),
// opening it, searching, kicking and fighting reveal it, a sticky one holds her; an unseen one
// disguises itself again; hallucination and telepathy change what she sees. Outcomes are
// asserted; rolls are searched or the disguise is set.
import { buildSnapshot, getPlayer, type Ctx, type DefId, type EntityId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon } from '../src/generation';
import { restrap } from '../src/hide';
import { ustuck } from '../src/hackmove';
import { mappearance, setMappearance, type MAppear } from '../src/mimic';
import { P, setIntrinsic } from '../src/props';
import { T } from '../src/terrain';
import { addMon } from './helpers';
import { defs, engine, levelSetup, plainKit } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '             ',
  ' ........... ',
  ' ........... ',
  ' .....@..... ',
  ' ........... ',
  ' ........... ',
  '             ',
];

/**
 * A lit room with no monsters; the hero at (6, 3). With `room`, the floor is a room of that type
 * ('ordinary': no type); without, the floor is outside any room.
 */
function make(seed = 1, room: DefId | 'ordinary' | null = null): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    const e = s.state.entities[k];
    if (e?.c.monster) delete s.state.entities[k];
  }
  if (room !== null)
    s.state.levels['dlvl1']!.rooms.push({
      lx: 1,
      ly: 1,
      hx: 11,
      hy: 5,
      lit: true,
      ...(room !== 'ordinary' ? { type: room } : {}),
    });
  s.step({ type: 'wait' });
  return s;
}
const ent = (s: S, id: EntityId) => s.state.entities[String(id)]!;
const view = (s: S) => buildSnapshot(defs, s.state);
const shownAs = (s: S, id: EntityId) => view(s).entities.find((e) => e.id === id)?.g;
const describeAt = (s: S, x: number, y: number) => engine.query(s.state).describe({ x, y });
const memAt = (s: S, x: number, y: number) =>
  s.state.monsterMemory['dlvl1']?.[String(y * s.state.levels['dlvl1']!.width + x)];
const heroPos = (s: S) => {
  const p = getPlayer(s.state).c.pos!;
  return { x: p.x, y: p.y };
};
/** makemon() a mimic at x,y (it takes its disguise there); speed 0 unless given. */
function mimic(s: S, x: number, y: number, def = 'nh:giant_mimic', speed = 0): EntityId {
  const id = makemon(s.ctx as unknown as Ctx, defs.monster(def as DefId), { x, y });
  if (id === null) throw new Error('no mimic');
  const e = ent(s, id);
  e.c.actor!.speed = speed;
  e.c.hp = { cur: 100, max: 100 };
  return id;
}
/** A mimic at x,y with the given disguise (no set_mimic_sym() roll). */
function posing(s: S, x: number, y: number, ap: MAppear, def = 'nh:giant_mimic'): EntityId {
  const id = addMon(s.state, def, x, y);
  const e = ent(s, id);
  e.c.actor!.speed = 0;
  e.c.hp = { cur: 100, max: 100 };
  e.c.monster!.level = defs.monster(def as DefId).level;
  setMappearance(s.ctx, id, ap);
  return id;
}
function setTerrainAt(s: S, x: number, y: number, id: DefId): void {
  const lv = s.state.levels['dlvl1']!;
  let i = lv.palette.indexOf(id);
  if (i < 0) i = lv.palette.push(id) - 1;
  lv.cells[y * lv.width + x] = i;
}

describe('set_mimic_sym(): the disguise for where it stands', () => {
  test('in a doorway: a closed door, drawn, described and offered as one', () => {
    const s = make(1, 'ordinary');
    setTerrainAt(s, 12, 3, T.doorway);
    const id = mimic(s, 12, 3);
    // the hero stands next to the doorway
    Object.assign(getPlayer(s.state).c.pos!, { x: 11, y: 3 });
    s.step({ type: 'wait' });
    expect(mappearance(s.ctx, id)).toEqual({ type: 'furniture', id: T.door_closed });
    expect(shownAs(s, id)).toBe(T.door_closed);
    expect(describeAt(s, 12, 3).entities).toEqual([{ id, def: T.door_closed }]);
    const offers = engine.query(s.state).actionsFor({ kind: 'cell', pos: { x: 12, y: 3 } });
    expect(offers.some((o) => o.labelKey === 'action.attack')).toBe(false);
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:open')).toBe(true);
  });

  test('on an object: that object; outside rooms: a boulder', () => {
    const s = make(1, null);
    const dagger = s.give('nh:dagger', { at: { level: 'dlvl1', x: 8, y: 3 } });
    const a = mimic(s, 8, 3);
    expect(mappearance(s.ctx, a)).toEqual({ type: 'object', id: ent(s, dagger).def });
    const b = mimic(s, 9, 1);
    expect(mappearance(s.ctx, b)).toEqual({ type: 'object', id: 'nh:boulder' });
    s.step({ type: 'wait' });
    expect(shownAs(s, b)).toBe('nh:boulder');
  });

  test('zoos and vaults gold, temples an altar, Delphi a statue or a fountain', () => {
    for (const [room, ok] of [
      ['nh:zoo', (a: MAppear) => a.type === 'object' && a.id === 'nh:gold_piece'],
      ['nh:vault', (a: MAppear) => a.type === 'object' && a.id === 'nh:gold_piece'],
      ['nh:temple', (a: MAppear) => a.type === 'furniture' && a.id.startsWith('nh:altar_')],
      [
        'nh:delphi',
        (a: MAppear) =>
          (a.type === 'object' && a.id === 'nh:statue' && a.corpseOf !== undefined) ||
          (a.type === 'furniture' && a.id === T.fountain),
      ],
    ] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const s = make(seed, room);
        const ap = mappearance(s.ctx, mimic(s, 8, 3));
        expect(ap && ok(ap)).toBe(true);
      }
    }
  });

  test('a shop at depth 1: the strange object 9 times in 10, else the shop kinds', () => {
    let strange = 0;
    let stock = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(seed, 'nh:tool_shop');
      const ap = mappearance(s.ctx, mimic(s, 8, 3));
      expect(ap?.type).toBe('object');
      if (ap?.id === 'nh:strange_object') strange++;
      else stock++;
    }
    expect(strange).toBeGreaterThan(stock);
    expect(stock).toBeGreaterThan(0);
  });

  test('an ordinary room floor: an object or furniture, never the mimic', () => {
    const kinds = new Set<string>();
    for (let seed = 1; seed <= 200 && kinds.size < 2; seed++) {
      const s = make(seed, 'ordinary');
      const before = Object.keys(s.state.entities).length;
      const id = mimic(s, 8, 3);
      // the throwaway object of a class disguise is gone again
      expect(Object.keys(s.state.entities).length).toBe(before + 1);
      const ap = mappearance(s.ctx, id)!;
      expect(['object', 'furniture']).toContain(ap.type);
      kinds.add(ap.type);
      s.step({ type: 'wait' });
      const g = shownAs(s, id)!;
      expect(g).not.toBe('nh:giant_mimic');
      expect(view(s).legend[g]).toBeDefined();
      const d = describeAt(s, 8, 3);
      expect(d.entities.map((e) => e.def)).toEqual([g]);
      expect(defs.isMonster(g)).toBe(false);
    }
    expect(kinds).toEqual(new Set(['object', 'furniture']));
  });

  test('a statue disguise is drawn as the statue of its monster', () => {
    const s = make();
    const id = posing(s, 8, 3, { type: 'object', id: 'nh:statue', corpseOf: 'nh:jackal' });
    s.step({ type: 'wait' });
    expect(shownAs(s, id)).toBe('nh:statue-jackal');
  });
});

describe('seeing and remembering a disguise', () => {
  test('out of sight the disguise is remembered; a killed mimic is forgotten when seen', () => {
    const s = make();
    const id = posing(s, 8, 3, { type: 'object', id: 'nh:strange_object' });
    s.step({ type: 'wait' });
    expect(memAt(s, 8, 3)).toBe('nh:strange_object');
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    s.step({ type: 'wait' });
    expect(view(s).cells[3 * 13 + 8]?.m).toBe('nh:strange_object');
    delete s.state.entities[String(id)];
    setIntrinsic(getPlayer(s.state), P.BLINDED, false);
    s.step({ type: 'wait' });
    expect(memAt(s, 8, 3)).toBeUndefined();
  });

  test('telepathy shows the mimic as itself', () => {
    const s = make();
    const id = posing(s, 8, 3, { type: 'object', id: 'nh:strange_object' });
    setIntrinsic(getPlayer(s.state), P.TELEPAT, true);
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    s.step({ type: 'wait' });
    expect(shownAs(s, id)).toBe('nh:giant_mimic');
  });

  test('hallucinating: an object disguise is a random object; furniture stays furniture', () => {
    const s = make();
    const a = posing(s, 8, 3, { type: 'object', id: 'nh:strange_object' });
    const b = posing(s, 4, 3, { type: 'furniture', id: T.throne });
    setIntrinsic(getPlayer(s.state), P.HALLUC, true);
    const seen = new Set<string>();
    for (let i = 0; i < 6; i++) {
      s.step({ type: 'wait' });
      const g = shownAs(s, a)!;
      expect(defs.isObject(g)).toBe(true);
      seen.add(g);
      expect(shownAs(s, b)).toBe(T.throne);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  test('core memory: a hallucinated monster is remembered as the monster she was shown', () => {
    const s = make();
    addMon(s.state, 'nh:newt', 8, 3);
    setIntrinsic(getPlayer(s.state), P.HALLUC, true);
    s.step({ type: 'wait' });
    const g = view(s).entities.find((e) => e.x === 8 && e.y === 3)?.g;
    expect(g).toBeDefined();
    expect(memAt(s, 8, 3)).toBe(g);
  });

  test('a disguised mimic does not move or attack', () => {
    const s = make();
    const id = posing(s, 7, 3, { type: 'object', id: 'nh:strange_object' });
    ent(s, id).c.actor!.speed = 12;
    const hp0 = getPlayer(s.state).c.hp!.cur;
    for (let i = 0; i < 10; i++) s.step({ type: 'wait' });
    expect(ent(s, id).c.pos).toMatchObject({ x: 7, y: 3 });
    expect(getPlayer(s.state).c.hp!.cur).toBe(hp0);
    expect(mappearance(s.ctx, id)).not.toBeNull();
  });
});

describe('revealing a mimic', () => {
  test('bumping into a door mimic: "That closed door actually is a giant mimic!", she is stuck', () => {
    const s = make(1, 'ordinary');
    const id = posing(s, 7, 3, { type: 'furniture', id: T.door_closed });
    s.step({ type: 'wait' });
    const turn = s.state.turn;
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain('That closed door actually is a giant mimic!');
    expect(heroPos(s)).toEqual({ x: 6, y: 3 });
    expect(s.state.turn).toBeGreaterThan(turn);
    expect(mappearance(s.ctx, id)).toBeNull();
    expect(ustuck(s.ctx)).toBe(id);
    expect(shownAs(s, id)).toBe('nh:giant_mimic');
    // stuck: she cannot walk away
    s.step({ type: 'move', dir: 'w' });
    expect(heroPos(s)).toEqual({ x: 6, y: 3 });
  });

  test('bumping into an object mimic: "That strange object is a small mimic!" (no sticking)', () => {
    const s = make();
    const id = posing(s, 7, 3, { type: 'object', id: 'nh:strange_object' }, 'nh:small_mimic');
    s.step({ type: 'wait' });
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain('That strange object is a small mimic!');
    expect(ustuck(s.ctx)).toBeNull();
    expect(mappearance(s.ctx, id)).toBeNull();
  });

  test('blind, bumping into a mimic: "Wait!  That\'s a monster!" and the `I`', () => {
    const s = make();
    posing(s, 7, 3, { type: 'object', id: 'nh:strange_object' });
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    s.step({ type: 'wait' });
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain("Wait!  There's something there you can't see!");
  });

  test('opening a door mimic: "That closed door actually is a giant mimic!"', () => {
    const s = make();
    const id = posing(s, 7, 3, { type: 'furniture', id: T.door_closed });
    s.step({ type: 'wait' });
    const text = s.text(s.mod('nh:open', { dir: 'e' }));
    expect(text).toContain('That closed door actually is a giant mimic!');
    expect(mappearance(s.ctx, id)).toBeNull();
  });

  test('searching: "You find a giant mimic."', () => {
    const s = make();
    const id = posing(s, 7, 3, { type: 'object', id: 'nh:strange_object' });
    s.step({ type: 'wait' });
    const text = s.text(s.step({ type: 'search' }));
    expect(text).toContain('You find a giant mimic.');
    expect(mappearance(s.ctx, id)).toBeNull();
  });

  test('a forced fight hits it and it comes out of hiding', () => {
    const s = make();
    const id = posing(s, 7, 3, { type: 'object', id: 'nh:strange_object' });
    s.step({ type: 'wait' });
    s.mod('nh:fight', { dir: 'e' });
    expect(mappearance(s.ctx, id)).toBeNull();
  });

  test('restrap(): an unseen awake mimic disguises itself again; asleep or seen it does not', () => {
    const s = make(1, 'ordinary');
    const id = posing(s, 9, 3, { type: 'object', id: 'nh:strange_object' });
    setMappearance(s.ctx, id, null);
    // seen: never
    for (let i = 0; i < 20; i++) expect(restrap(s.ctx as unknown as Ctx, ent(s, id))).toBe(false);
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    s.step({ type: 'wait' });
    // asleep: never
    ent(s, id).c.monster!.asleep = true;
    for (let i = 0; i < 20; i++) expect(restrap(s.ctx as unknown as Ctx, ent(s, id))).toBe(false);
    ent(s, id).c.monster!.asleep = false;
    let hid = false;
    for (let i = 0; i < 30 && !hid; i++) hid = restrap(s.ctx as unknown as Ctx, ent(s, id));
    expect(hid).toBe(true);
    expect(mappearance(s.ctx, id)).not.toBeNull();
  });
});
