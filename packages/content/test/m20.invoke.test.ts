// m20 step 6: #invoke. The rest between invocations ("You feel that X is ignoring you.", d(3,10)
// more), the energy paid for a tired Grimtooth or Sunsword, each power's outcome (banishing,
// the storms at Expert, the blinding ray, venom, healing, energy, arrows, the Master Key, the
// Card, the portal) and the toggled powers (the Heart's levitation, the Sceptre's conflict)
// with their end on a second #invoke, on dropping and when she can no longer touch it.
// Outcomes with pinned monsters or over many seeds, never a lucky seed.
// ref: src/artifact.c doinvoke(), arti_invoke(), arti_invoke_cost(), the invoke_*() functions,
// untouchable(); src/do.c dodown(); src/invent.c freeinv_core()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { retouchEquipment } from '../src/artitouch';
import { isBoxTrapped, setBoxTrapped } from '../src/btrapstate';
import { isSick, makeSick } from '../src/hunger';
import { oname, vanillaMod } from '../src/index';
import { setU } from '../src/luck';
import { P, hasProp, hasPropBesidesInvoked, timeoutLeft } from '../src/props';
import { trapTable } from '../src/trapstate';
import { fullyIdentify } from '../src/read';
import { pwOf, setPw } from '../src/uenergy';
import { addMon, playAs } from './helpers';
import { levelSetup, plainKit, render } from './itemHelpers';

const ROOM = ['.............', '.............', '...@.........', '.............'];
type S = ReturnType<typeof levelSetup>;
type Role = Parameters<typeof playAs>[1];

const engine = createEngine([vanillaMod]);

function setup(seed = 1, role: Role = 'valkyrie', align?: -1 | 0 | 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  playAs(s.state, role);
  if (align !== undefined) {
    setU({ state: s.state }, { alignType: align });
    getPlayer(s.state).c.player!.align = align;
  }
  for (const e of inventoryOf(s.state, s.state.playerId))
    if (e.c.item?.equipped === 'weapon') e.c.item.equipped = null;
  return s;
}

const ent = (s: S, id: EntityId): Entity => {
  const e = s.state.entities[String(id)];
  if (!e) throw new Error(`no entity ${id}`);
  return e;
};
const hero = (s: S): Entity => getPlayer(s.state);

/** The artifact `name` on a new carried `base`, uncursed +0, rested. */
function arti(s: S, base: string, name: string): Entity {
  const e = ent(s, s.carry(base));
  oname(s.ctx as never, e, name, 'wish', true);
  expect(e.c.item?.artifact).toBeDefined();
  if (e.c.item) {
    e.c.item.buc = 'uncursed';
    e.c.item.spe = 0;
  }
  return e;
}

const invoke = (s: S, e: Entity): StepResult => s.mod('nh:invoke', { item: e.id });
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};

/** A pinned monster (speed 0, awake). */
function pin(s: S, def: string, x: number, y: number): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false });
  const e = ent(s, id);
  if (e.c.actor) e.c.actor.speed = 0;
  e.c.hp = { cur: 1000, max: 1000 };
  return id;
}

const offered = (s: S, e: Entity): boolean =>
  engine
    .query(s.state)
    .actionsFor({ kind: 'item', id: e.id })
    .some((o) => o.action.type === 'mod' && o.action.action === 'nh:invoke');

describe('#invoke', () => {
  test('offered on carried artifacts and an unknown imitation Amulet, not on plain objects', () => {
    const s = setup();
    expect(offered(s, arti(s, 'nh:long_sword', 'Excalibur'))).toBe(true);
    expect(offered(s, ent(s, s.carry('nh:long_sword')))).toBe(false);
    const fake = ent(s, s.carry('nh:fake_amulet_of_yendor'));
    expect(offered(s, fake)).toBe(true);
    fake.c.item!.known.spe = true;
    expect(offered(s, fake)).toBe(false);
    // an artifact with no power, and the imitation Amulet: "Nothing happens.", a move
    const t0 = s.state.turn;
    expect(s.text(invoke(s, arti(s, 'nh:elven_dagger', 'Sting')))).toEqual(['Nothing happens.']);
    expect(s.state.turn).toBeGreaterThan(t0);
  });

  test('a rested artifact rests rnz(100) more; a tired one ignores her and rests d(3,10) more', () => {
    const deltas = new Set<number>();
    for (let seed = 1; seed <= 15; seed++) {
      const s = setup(seed, 'priest');
      const mitre = arti(s, 'nh:helm_of_brilliance', 'The Mitre of Holiness');
      setPw(s.ctx, { uen: 0, uenmax: 100 });
      expect(s.text(invoke(s, mitre))).toEqual(['You feel re-energized.']);
      const age = mitre.c.item!.age ?? 0;
      if (age <= s.state.turn) continue; // rnz(100) can be small
      const t = s.text(invoke(s, mitre));
      // (the type unidentified: the(xname()))
      expect(t).toEqual([
        'You feel that the crystal helmet named the Mitre of Holiness is ignoring you.',
      ]);
      const d = (mitre.c.item!.age ?? 0) - age;
      expect(d).toBeGreaterThanOrEqual(3);
      expect(d).toBeLessThanOrEqual(30);
      deltas.add(d);
    }
    expect(deltas.size).toBeGreaterThan(3);
  });

  test('a tired Grimtooth takes 25 energy instead ("You feel drained..."), or ignores her', () => {
    const s = setup(1, 'valkyrie', -1);
    const gt = arti(s, 'nh:orcish_dagger', 'Grimtooth');
    gt.c.item!.age = s.state.turn + 50;
    setPw(s.ctx, { uen: 30, uenmax: 30 });
    const t = s.text(invoke(s, gt));
    expect(t).toEqual(['You feel drained...']);
    expect(pwOf(s.state).uen).toBe(5);
    expect(s.state.pendingPrompt?.prompt.kind).toBe('direction');
    answer(s, null);
    const s2 = setup(1, 'valkyrie', -1);
    const gt2 = arti(s2, 'nh:orcish_dagger', 'Grimtooth');
    gt2.c.item!.age = s2.state.turn + 50;
    setPw(s2.ctx, { uen: 24, uenmax: 30 });
    fullyIdentify(s2.ctx as unknown as Ctx, gt2); // the bare name
    expect(s2.text(invoke(s2, gt2))).toEqual(['You feel that Grimtooth is ignoring you.']);
    expect(pwOf(s2.state).uen).toBe(24);
    expect(s2.state.pendingPrompt).toBeNull();
  });
});

describe('the powers', () => {
  test('Demonbane banishes an imp in sight to a level below (it migrates)', () => {
    const s = setup(1, 'valkyrie', 1);
    const db = arti(s, 'nh:silver_mace', 'Demonbane');
    const imp = pin(s, 'nh:imp', 8, 2);
    const newt = pin(s, 'nh:newt', 2, 2);
    const t = s.text(invoke(s, db));
    expect(t).toContain('The demon disappears in a cloud of brimstone!');
    expect(ent(s, imp).c.pos).toBeUndefined();
    const to = trapTable(s.ctx, 'migrating', false)?.[String(imp)];
    expect(typeof to).toBe('string');
    expect(ent(s, newt).c.pos).toBeDefined();
  });

  test('Fire Brand casts a fireball at Expert where she chooses; Frost Brand a cone of cold', () => {
    for (const [base, name] of [
      ['nh:long_sword', 'Fire Brand'],
      ['nh:long_sword', 'Frost Brand'],
    ] as const) {
      const s = setup(3);
      const brand = arti(s, base, name);
      const newt = pin(s, 'nh:newt', 8, 2);
      setPw(s.ctx, { uen: 0, uenmax: 0 });
      invoke(s, brand);
      expect(s.state.pendingPrompt?.prompt.kind).toBe('position');
      const t0 = s.state.turn;
      answer(s, { x: 8, y: 2 });
      const left = ent(s, newt);
      expect(left.c.hp === undefined || left.c.hp.cur < 1000 || !left.c.pos).toBe(true);
      expect(s.state.turn).toBeGreaterThan(t0);
      expect(pwOf(s.state).uen).toBe(0); // no energy spent
    }
  });

  test("Sunsword's ray blinds a monster, lights her spot up or down, and flashes her", () => {
    const s = setup(1, 'valkyrie', 1);
    const sun = arti(s, 'nh:long_sword', 'Sunsword');
    pin(s, 'nh:newt', 8, 2);
    invoke(s, sun);
    expect(s.text(answer(s, 'e'))).toContain('The newt is blinded by the flash!');
    // up: her spot is lit
    const s2 = setup(1, 'valkyrie', 1);
    const sun2 = arti(s2, 'nh:long_sword', 'Sunsword');
    const lvl = s2.state.levels['dlvl1']!;
    const i = s2.here.y * lvl.width + s2.here.x;
    lvl.lit[i] = 0;
    invoke(s2, sun2);
    const t = s2.text(answer(s2, 'up'));
    expect(t).toContain('It is lit here now.');
    expect(lvl.lit[i]).toBe(1);
    // at herself: blinded 10 + rnd(10) turns; wielding it, she resists
    const s3 = setup(1, 'valkyrie', 1);
    const sun3 = arti(s3, 'nh:long_sword', 'Sunsword');
    invoke(s3, sun3);
    answer(s3, 'self');
    const left = timeoutLeft(s3.state, hero(s3), P.BLINDED);
    expect(left).toBeGreaterThanOrEqual(9);
    expect(left).toBeLessThanOrEqual(20);
    const s4 = setup(1, 'valkyrie', 1);
    const sun4 = arti(s4, 'nh:long_sword', 'Sunsword');
    sun4.c.item!.equipped = 'weapon';
    invoke(s4, sun4);
    expect(s4.text(answer(s4, 'self'))).toContain('Nothing seems to happen.');
    expect(hasProp(hero(s4), P.BLINDED)).toBe(false);
    // no direction: "Never mind.", no time, and it rests from now
    const s5 = setup(1, 'valkyrie', 1);
    const sun5 = arti(s5, 'nh:long_sword', 'Sunsword');
    invoke(s5, sun5);
    const t0 = s5.state.turn;
    expect(s5.text(answer(s5, null))).toEqual(['Never mind.']);
    expect(sun5.c.item!.age).toBe(s5.state.turn);
    expect(s5.state.turn).toBe(t0);
  });

  test('Grimtooth flings blinding venom or acid venom (over seeds)', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 30 && seen.size < 2; seed++) {
      const s = setup(seed, 'valkyrie', -1);
      const gt = arti(s, 'nh:orcish_dagger', 'Grimtooth');
      pin(s, 'nh:newt', 5, 2);
      invoke(s, gt);
      const t = s.text(answer(s, 'e')).join(' ');
      if (/venom blinds/.test(t)) seen.add('blind');
      if (/venom burns|harmless/.test(t)) seen.add('acid');
    }
    expect(seen).toEqual(new Set(['blind', 'acid']));
  });

  test('the Staff of Aesculapius heals half the missing HP and cures sickness', () => {
    const s = setup(1, 'healer');
    const staff = arti(s, 'nh:quarterstaff', 'The Staff of Aesculapius');
    hero(s).c.hp = { cur: 100, max: 500 };
    makeSick(s.ctx as unknown as Ctx, 20, '@nh:newt');
    expect(isSick(s.ctx as unknown as Ctx)).toBe(true);
    expect(s.text(invoke(s, staff))).toContain('You feel better.');
    // (500 + 1 - 100) / 2 = 200, plus this turn's regeneration
    expect(hero(s).c.hp?.cur).toBeGreaterThanOrEqual(300);
    expect(hero(s).c.hp?.cur).toBeLessThanOrEqual(302);
    expect(isSick(s.ctx as unknown as Ctx)).toBe(false);
    // nothing to cure
    const s2 = setup(1, 'healer');
    const staff2 = arti(s2, 'nh:quarterstaff', 'The Staff of Aesculapius');
    expect(s2.text(invoke(s2, staff2))).toEqual([
      'You feel a surge of power, but nothing seems to happen.',
    ]);
  });

  test('the Mitre of Holiness restores half the missing energy', () => {
    const s = setup(1, 'priest');
    const mitre = arti(s, 'nh:helm_of_brilliance', 'The Mitre of Holiness');
    setPw(s.ctx, { uen: 10, uenmax: 100 });
    invoke(s, mitre);
    expect(pwOf(s.state).uen).toBe(55);
  });

  test('the Longbow of Diana makes arrows of its blessing', () => {
    for (const buc of ['blessed', 'uncursed', 'cursed'] as const) {
      const s = setup(1, 'ranger');
      const bow = arti(s, 'nh:bow', 'The Longbow of Diana');
      bow.c.item!.buc = buc;
      bow.c.item!.known.buc = true;
      invoke(s, bow);
      const arrows = inventoryOf(s.state, s.state.playerId).filter((o) => o.def === 'nh:arrow');
      expect(arrows.length).toBe(1);
      const it = arrows[0]!.c.item!;
      expect(it.buc).toBe(buc);
      expect(it.known.buc).toBe(true);
      expect(it.erosion).toBeUndefined();
      if (buc === 'blessed') expect(it.spe).toBeGreaterThanOrEqual(0);
      if (buc === 'cursed') expect(it.spe).toBeLessThanOrEqual(0);
    }
  });

  test('the Master Key of Thievery finds and disarms a box trap every time', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = setup(seed, 'rogue');
      const key = arti(s, 'nh:skeleton_key', 'The Master Key of Thievery');
      const box = s.floor('nh:large_box');
      setBoxTrapped(s.ctx, box, true);
      invoke(s, key);
      answer(s, 'self'); // the direction: here
      expect(s.text(answer(s, true))).toContain('You find a trap on the large box!');
      expect(s.text(answer(s, true))).toContain('You disarm it!');
      expect(isBoxTrapped(s.state, box)).toBe(false);
    }
    // changing her mind costs nothing: the key is rested again
    const s = setup(1, 'rogue');
    const key = arti(s, 'nh:skeleton_key', 'The Master Key of Thievery');
    invoke(s, key);
    expect(key.c.item!.age).toBeGreaterThan(0);
    answer(s, null);
    expect(key.c.item!.age).toBe(0);
  });

  test('the Platinum Yendorian Express Card charges a wand', () => {
    const s = setup(1, 'tourist');
    const card = arti(s, 'nh:credit_card', 'The Platinum Yendorian Express Card');
    const wand = ent(s, s.carry('nh:wand_of_striking'));
    wand.c.item!.spe = 0;
    invoke(s, card);
    expect(s.state.pendingPrompt?.prompt.kind).toBe('menu');
    answer(s, wand.id);
    expect(wand.c.item!.recharged).toBe(1);
    expect(wand.c.item!.spe).toBeGreaterThan(0);
    // a dismissed menu: no time, the card rested again
    const s2 = setup(1, 'tourist');
    const card2 = arti(s2, 'nh:credit_card', 'The Platinum Yendorian Express Card');
    s2.carry('nh:wand_of_striking');
    invoke(s2, card2);
    answer(s2, null);
    expect(card2.c.item!.age).toBe(0);
  });

  test('the Eye of the Aethiopica opens a portal to a reached dungeon', () => {
    const s = levelSetup(
      Array.from({ length: 21 }, (_, y) =>
        y === 10 ? '.'.repeat(40) + '@' + '.'.repeat(38) : '.'.repeat(79),
      ),
      1,
    );
    plainKit(s.state);
    playAs(s.state, 'wizard');
    const eye = arti(s, 'nh:amulet_of_esp', 'The Eye of the Aethiopica');
    // only this dungeon reached: very disoriented
    expect(s.text(invoke(s, eye))).toEqual(['You feel very disoriented for a moment.']);
    // the Mines reached too: a menu, and off she goes to its entry
    const mines = s.state.dungeons.findIndex((d) => d.id === 'nh:mines');
    s.state.levels['nh:mines/2'] = {
      ...s.state.levels['dlvl1']!,
      id: 'nh:mines/2',
      dungeon: 'nh:mines',
      dlevel: 2,
    };
    eye.c.item!.age = 0;
    invoke(s, eye);
    expect(s.state.pendingPrompt?.prompt.kind).toBe('menu');
    expect(s.text(answer(s, mines))).toContain('You are surrounded by a shimmering sphere!');
    expect(hero(s).c.pos?.level).toBe('nh:mines/1');
  });
});

describe('the toggled powers', () => {
  test("the Heart of Ahriman: levitation on, off (then it rests), and at will with '>'", () => {
    const s = setup(1, 'barbarian');
    const heart = arti(s, 'nh:luckstone', 'The Heart of Ahriman');
    expect(s.text(invoke(s, heart))).toContain('You start to float in the air!');
    expect(hasProp(hero(s), P.LEVITATION)).toBe(true);
    expect(s.text(invoke(s, heart)).join(' ')).toMatch(/You float gently to the floor/);
    expect(hasProp(hero(s), P.LEVITATION)).toBe(false);
    expect(heart.c.item!.age).toBeGreaterThan(s.state.turn - 1);
    if ((heart.c.item!.age ?? 0) > s.state.turn) {
      expect(s.text(invoke(s, heart))).toEqual([
        'You feel that the gray stone named the Heart of Ahriman is ignoring you.',
      ]);
      expect(hasProp(hero(s), P.LEVITATION)).toBe(false);
    }
    // '>' ends it at will and the Heart rests
    const s2 = setup(1, 'barbarian');
    const heart2 = arti(s2, 'nh:luckstone', 'The Heart of Ahriman');
    invoke(s2, heart2);
    const offers = engine
      .query(s2.state)
      .actionsFor({ kind: 'self' })
      .filter((o) => o.action.type === 'mod' && o.action.action === 'nh:down');
    expect(offers.length).toBe(1);
    s2.mod('nh:down');
    expect(hasProp(hero(s2), P.LEVITATION)).toBe(false);
    expect(heart2.c.item!.age ?? 0).toBeGreaterThan(s2.state.turn - 1);
  });

  test('dropping the invoked Heart brings her down after it lands', () => {
    const s = setup(1, 'barbarian');
    const heart = arti(s, 'nh:luckstone', 'The Heart of Ahriman');
    invoke(s, heart);
    expect(hasProp(hero(s), P.LEVITATION)).toBe(true);
    const t = s.text(s.mod('nh:drop', { item: heart.id }));
    expect(heart.c.item?.carriedBy).toBeNull();
    expect(hasProp(hero(s), P.LEVITATION)).toBe(false);
    const fl = t.findIndex((m) => /float gently/.test(m));
    expect(fl).toBeGreaterThan(0); // after the drop's own message
    expect(heart.c.item!.age ?? 0).toBeGreaterThan(0);
  });

  test('the Sceptre of Might: conflict on and off, no hunger for it; lost when untouchable', () => {
    const s = setup(1, 'caveman');
    const sc = arti(s, 'nh:mace', 'The Sceptre of Might');
    expect(s.text(invoke(s, sc))).toEqual(['You feel like a rabble-rouser.']);
    expect(hasProp(hero(s), P.CONFLICT)).toBe(true);
    expect(hasPropBesidesInvoked(hero(s), P.CONFLICT)).toBe(false);
    expect(s.text(invoke(s, sc))).toEqual(['You feel the tension decrease around you.']);
    expect(hasProp(hero(s), P.CONFLICT)).toBe(false);
    // on, then she is someone it will not have: beyond her control, and conflict ends
    const s2 = setup(1, 'caveman');
    const sc2 = arti(s2, 'nh:mace', 'The Sceptre of Might');
    invoke(s2, sc2);
    playAs(s2.state, 'valkyrie');
    setU({ state: s2.state }, { alignType: -1 });
    getPlayer(s2.state).c.player!.align = -1;
    const msgs: string[] = [];
    const probe: Mod = {
      id: 'iv',
      version: '1',
      register(api) {
        api.defineAction({
          id: 'iv:run',
          labelKey: 'iv',
          handles: 'mod',
          offer: () => [],
          perform(ctx) {
            retouchEquipment(ctx, 0);
            return 0;
          },
        });
      },
    };
    const eng = createEngine([vanillaMod, probe]);
    for (const e of eng.step(s2.state, { type: 'mod', action: 'iv:run' as DefId }).events)
      if (e.type === 'msg') msgs.push(render({ key: e.key, params: e.params ?? {} }));
    expect(msgs.join(' ')).toMatch(/is beyond your control!/);
    expect(msgs).toContain('You feel the tension decrease around you.');
    expect(hasProp(hero(s2), P.CONFLICT)).toBe(false);
    expect(sc2.c.item?.carriedBy).toBe(s2.state.playerId);
  });
});
