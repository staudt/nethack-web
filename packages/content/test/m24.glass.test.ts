// m24 step 2: the mirror, the crystal ball and lenses; the four quest artifacts they are the base
// of (the Orb of Detection, the Magic Mirror of Merlin, the Eyes of the Overworld, the Orb of
// Fate) and their #invoke powers. Outcomes with pinned monsters and fixed attributes.
// ref: include/objects.h; include/artilist.h; src/apply.c use_mirror(); src/detect.c
// use_crystal_ball(), dosearch0(); src/artifact.c arti_invoke(); src/do_wear.c Blindf_on();
// src/dokick.c / src/dothrow.c breakobj()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type GameState,
  type Mod,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { searchFund } from '../src/actions';
import { artifactRow } from '../src/artilist';
import { heroInvisible } from '../src/invis';
import { mksobj } from '../src/items';
import { luckOf } from '../src/luck';
import { frozenTime } from '../src/mstate';
import { oname, vanillaMod } from '../src/index';
import { CHARGED_TOOLS } from '../src/objects';
import { doname } from '../src/objnam';
import { P, hasProp, makeBlinded } from '../src/props';
import { addMon, playAs } from './helpers';
import { itemOf, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'gl',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'gl:run',
      labelKey: 'gl',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const eng = createEngine([vanillaMod, probeMod]);
const defs = eng.registry;
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(state, { type: 'mod', action: 'gl:run' as DefId }).events);
}

type S = ReturnType<typeof levelSetup>;
// the right part is out of her sight (stone between)
const ROOM = ['.......  .......', '.......  .......', '...@...  .......', '.......  .......'];
/** A lit room with the hero at (3, 2), an empty pack, Int and Cha fixed. */
function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  const a = getPlayer(s.state).c.attributes;
  if (a) {
    a.int = 25; // a crystal ball never overwhelms her (rnd(20) > Int)
    a.cha = 12;
  }
  return s;
}
function carry(s: S, id: string, o: { spe?: number; buc?: 'blessed' | 'cursed' } = {}): EntityId {
  const e = s.carry(id);
  const it = itemOf(s.state, e);
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  return e;
}
/** Her artifact `name` on a new carried `base`. */
function arti(s: S, base: string, name: string): EntityId {
  const id = carry(s, base);
  oname(s.ctx as never, s.state.entities[String(id)]!, name, 'wish', true);
  expect(itemOf(s.state, id).artifact).toBeDefined();
  return id;
}
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
const answer = (s: S, value: unknown): string[] =>
  s.text(
    s.step({ type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never }),
  );
/** Applies the tool and answers its question. */
function applyAnswer(s: S, tool: EntityId, value: unknown): string[] {
  const first = s.text(s.mod('nh:apply', { item: tool }));
  return s.state.pendingPrompt ? [...first, ...answer(s, value)] : first;
}
/** A monster that does not move (speed 0), awake. */
function pinned(s: S, def: string, x: number, y: number): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false });
  const e = ent(s, id)!;
  if (e.c.actor) e.c.actor.speed = 0;
  return id;
}
const hero = (s: S): Entity => getPlayer(s.state);

describe('the rows', () => {
  test("objects.h's numbers; a crystal ball has rn1(5, 3) charges; lenses come in pairs", () => {
    expect(defs.object('nh:mirror' as DefId)).toMatchObject({ prob: 45, weight: 13, cost: 10 });
    expect(defs.object('nh:crystal_ball' as DefId)).toMatchObject({
      prob: 15,
      weight: 150,
      cost: 60,
      magic: true,
    });
    expect(defs.object('nh:lenses' as DefId)).toMatchObject({ prob: 5, weight: 3, cost: 80 });
    expect(CHARGED_TOOLS.has('nh:crystal_ball')).toBe(true);
    const s = make();
    const seen = new Set<number>();
    run(s.state, (ctx) => {
      for (let i = 0; i < 60; i++) {
        const id = mksobj(ctx, defs.object('nh:crystal_ball' as DefId), {
          carriedBy: s.state.playerId,
        });
        seen.add(itemOf(s.state, id).spe);
      }
    });
    expect([...seen].sort()).toEqual([3, 4, 5, 6, 7]);
    const l = carry(s, 'nh:lenses');
    itemOf(s.state, l).known.buc = true;
    expect(render(doname(s.state, defs, ent(s, l)!))).toContain('pair of lenses');
  });

  test('the four quest rows on their bases, with their powers', () => {
    expect(artifactRow('nh:orb_of_detection')).toMatchObject({
      base: 'nh:crystal_ball',
      cary: 'magm',
      invoke: 'invis',
      role: 'archeologist',
    });
    expect(artifactRow('nh:magic_mirror_of_merlin')).toMatchObject({
      base: 'nh:mirror',
      cspfx: ['esp'],
      invoke: null,
      role: 'knight',
    });
    expect(artifactRow('nh:eyes_of_the_overworld')).toMatchObject({
      base: 'nh:lenses',
      defn: 'magm',
      invoke: 'enlightening',
      role: 'monk',
    });
    expect(artifactRow('nh:orb_of_fate')).toMatchObject({
      base: 'nh:crystal_ball',
      invoke: 'lev_tele',
      role: 'valkyrie',
    });
  });
});

describe('the mirror', () => {
  test('at herself: "You look as cute as ever."', () => {
    const s = make();
    const m = carry(s, 'nh:mirror');
    expect(applyAnswer(s, m, 'self')).toContain('You look as cute as ever.');
  });

  test('a floating eye is frozen by its reflection', () => {
    const s = make();
    const m = carry(s, 'nh:mirror');
    const eye = pinned(s, 'nh:floating_eye', 5, 2);
    ent(s, eye)!.c.monster!.level = 3; // d(level, 70): a level-0 eye might not freeze
    expect(applyAnswer(s, m, 'e')).toContain('The floating eye is frozen by its reflection.');
    expect(frozenTime(s, eye)).toBeGreaterThan(0);
  });

  test("Medusa's reflected gaze turns her to stone", () => {
    const s = make();
    const m = carry(s, 'nh:mirror');
    const med = pinned(s, 'nh:medusa', 5, 2);
    const t = applyAnswer(s, m, 'e');
    expect(t).toContain('Medusa is turned to stone!');
    expect(ent(s, med)).toBeUndefined();
    const statue = Object.values(s.state.entities).find(
      (e) => e?.def === 'nh:statue' && e.c.pos?.x === 5 && e.c.pos.y === 2,
    );
    expect(statue?.c.item?.corpseOf).toBe('nh:medusa');
  });

  test('a nymph admires herself and takes the mirror', () => {
    const s = make();
    const m = carry(s, 'nh:mirror');
    const nymph = pinned(s, 'nh:water_nymph', 5, 2);
    const t = applyAnswer(s, m, 'e');
    expect(t).toContain('The water nymph admires herself in your looking glass.');
    expect(t).toContain('She takes it!');
    expect(itemOf(s.state, m).carriedBy).toBe(nymph);
  });

  test('kicking a mirror to pieces costs 2 Luck', () => {
    const s = make();
    s.give('nh:mirror', { at: { level: 'dlvl1', x: 4, y: 2 } });
    const before = luckOf(s.state);
    const t = s.text(s.mod('nh:kick', { dir: 'e' }));
    expect(t.some((m) => m.includes('shatters'))).toBe(true);
    expect(luckOf(s.state)).toBe(before - 2);
  });
});

describe('the crystal ball', () => {
  test('looking for tools shows the tools on the level, not the weapons; a charge is used', () => {
    const s = make();
    const ball = carry(s, 'nh:crystal_ball', { spe: 5 });
    const whistle = s.give('nh:tin_whistle', { at: { level: 'dlvl1', x: 12, y: 1 } });
    s.give('nh:dagger', { at: { level: 'dlvl1', x: 13, y: 3 } });
    const first = s.text(s.mod('nh:apply', { item: ball }));
    expect(first).toContain('You may look for an object, monster, or special map symbol.');
    expect(s.state.pendingPrompt?.prompt.key).toBe('cball.what');
    const t = answer(s, '(');
    expect(t).toContain('You peer into the glass orb...');
    expect(t).toContain('You detect the presence of tools.');
    const mem = s.state.objectMemory['dlvl1'] ?? {};
    expect(mem[String(1 * 16 + 12)]).toBe(ent(s, whistle)?.def);
    expect(mem[String(3 * 16 + 13)]).toBeUndefined();
    expect(itemOf(s.state, ball).spe).toBe(4);
  });

  test('a monster class: the jackals out of sight go into her memory', () => {
    const s = make();
    const ball = carry(s, 'nh:crystal_ball', { spe: 5 });
    pinned(s, 'nh:jackal', 14, 0);
    const t = applyAnswer(s, ball, 'd');
    expect(t).toContain('You sense the presence of monsters.');
    expect(s.state.monsterMemory['dlvl1']?.[String(0 * 16 + 14)]).toBe('nh:jackal');
  });

  test('a cursed charged ball overwhelms her: no question, a charge used or it explodes', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const s = make(seed);
      const ball = carry(s, 'nh:crystal_ball', { spe: 5, buc: 'cursed' });
      s.text(s.mod('nh:apply', { item: ball }));
      expect(s.state.pendingPrompt).toBeNull();
      const it = ent(s, ball)?.c.item;
      if (it) expect(it.spe).toBe(4);
    }
  });

  test('uncharged: "The vision is unclear."; blind: "Too bad you can\'t see the glass orb."', () => {
    const s = make();
    const ball = carry(s, 'nh:crystal_ball', { spe: 0 });
    expect(applyAnswer(s, ball, '(')).toContain('The vision is unclear.');
    run(s.state, (ctx) => makeBlinded(ctx, 50, false));
    expect(s.text(s.mod('nh:apply', { item: ball }))).toContain(
      "Too bad you can't see the glass orb.",
    );
  });

  test('#invoke offers a plain crystal ball and asks the same question', () => {
    const s = make();
    const ball = carry(s, 'nh:crystal_ball', { spe: 5 });
    s.text(s.mod('nh:invoke', { item: ball }));
    expect(s.state.pendingPrompt?.prompt.key).toBe('cball.what');
  });
});

describe('lenses and the Eyes of the Overworld', () => {
  test('worn lenses add 2 to searching while she sees; a searching artifact its enchantment', () => {
    const s = make();
    const l = carry(s, 'nh:lenses');
    expect(searchFund(s.ctx as never)).toBe(0);
    expect(s.text(s.mod('nh:apply', { item: l }))).toContain(
      'You are now wearing a pair of lenses.',
    );
    expect(searchFund(s.ctx as never)).toBe(2);
    run(s.state, (ctx) => makeBlinded(ctx, 50, false));
    expect(searchFund(s.ctx as never)).toBe(0);
  });

  test('worn Eyes override blindness; #invoke shows her attributes', () => {
    const s = make();
    run(s.state, (ctx) => makeBlinded(ctx, 50, false));
    expect(hasProp(hero(s), P.BLINDED)).toBe(true);
    const eyes = arti(s, 'nh:lenses', 'The Eyes of the Overworld');
    const t = s.text(s.mod('nh:apply', { item: eyes }));
    expect(t).toContain('You can see!');
    expect(hasProp(hero(s), P.BLINDED)).toBe(false);
    expect(hasProp(hero(s), P.ANTIMAGIC)).toBe(true);
    const r = s.mod('nh:invoke', { item: eyes });
    expect(r.events.some((e) => e.type === 'list' && e.titleKey === 'enl.title')).toBe(true);
    // taking them off: blind again
    expect(s.text(s.mod('nh:apply', { item: eyes }))).toContain("You can't see anything now!");
    expect(hasProp(hero(s), P.BLINDED)).toBe(true);
  });
});

describe('the Orbs', () => {
  test('the Orb of Detection toggles invisibility', () => {
    const s = make();
    playAs(s.state, 'archeologist'); // her own: it does not evade her grasp
    const orb = arti(s, 'nh:crystal_ball', 'The Orb of Detection');
    expect(s.text(s.mod('nh:invoke', { item: orb }))).toContain(
      'Your body takes on a strange transparency...',
    );
    expect(heroInvisible(s.state)).toBe(true);
    expect(s.text(s.mod('nh:invoke', { item: orb }))).toContain('Your body seems to unfade...');
    expect(heroInvisible(s.state)).toBe(false);
  });

  test('the Orb of Fate level-teleports: with teleport control the level question', () => {
    const s = make();
    const orb = arti(s, 'nh:crystal_ball', 'The Orb of Fate');
    const ring = carry(s, 'nh:ring_of_teleport_control');
    itemOf(s.state, ring).equipped = 'ringL';
    run(s.state, () => undefined); // (the worn-property cache)
    s.text(s.mod('nh:invoke', { item: orb }));
    expect(s.state.pendingPrompt?.prompt.id).toBe('tele-level');
  });
});
