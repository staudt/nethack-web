// m22 step 2: the kit objects. The stethoscope, expensive camera, leash, saddle, bell, fortune
// cookie, orange and pancake rows (objects.h numbers, mksobj_init(), names) and their uses: the
// stethoscope's status lines with one free use per move, the camera's flash, leashing a pet (the
// leash's pull, slack and snap, a leashed pet kept near), ringing the bell, the cookie's fortune.
// Pinned monsters (paralysed or asleep) and outcomes over seeds, never a lucky seed.
// ref: include/objects.h; src/mkobj.c mksobj_init(); src/apply.c use_stethoscope(), its_dead(),
// use_camera(), use_leash(), check_leash(), use_bell(); src/dogmove.c dog_move(); src/dog.c
// keepdogs(); src/eat.c fpostfx(); src/rumors.c outrumor()
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
import { vanillaMod } from '../src/index';
import { CHARGED_TOOLS } from '../src/objects';
import { initedog } from '../src/dog';
import { paralyzeMonst } from '../src/mstate';
import { leashMon } from '../src/leashstate';
import { mksobj } from '../src/items';
import { doname } from '../src/objnam';
import { P, hasProp, makeBlinded } from '../src/props';
import { setMappearance } from '../src/mimicstate';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { FALSE_RUMORS, TRUE_RUMORS } from '../src/rumortxt';
import { addMon } from './helpers';
import { itemOf, levelSetup, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'kt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'kt:run',
      labelKey: 'kt',
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
  return textsOf(eng.step(state, { type: 'mod', action: 'kt:run' as DefId }).events);
}

type S = ReturnType<typeof levelSetup>;
const ROOM = [
  '...............',
  '...............',
  '.......@.......',
  '...............',
  '...............',
];
/** A lit room with the hero at (7, 2), no monsters and an empty pack. */
function make(seed = 1, rows = ROOM): S {
  const s = levelSetup(rows, seed);
  for (const e of inventoryOf(s.state, s.state.playerId)) delete s.state.entities[String(e.id)];
  return s;
}
function carry(s: S, id: string, o: { spe?: number; buc?: 'blessed' | 'cursed' } = {}): EntityId {
  const e = s.carry(id);
  const it = itemOf(s.state, e);
  it.buc = o.buc ?? 'uncursed';
  if (o.spe !== undefined) it.spe = o.spe;
  return e;
}
const ent = (s: S, id: EntityId): Entity => s.state.entities[String(id)]!;
const answer = (s: S, value: unknown): string[] =>
  s.text(
    s.step({ type: 'answer', promptId: s.state.pendingPrompt!.prompt.id, value: value as never }),
  );
/** Applies the tool and answers its direction question. */
function applyDir(s: S, tool: EntityId, dir: string): string[] {
  const first = s.text(s.mod('nh:apply', { item: tool }));
  return s.state.pendingPrompt ? [...first, ...answer(s, dir)] : first;
}
/** A monster that cannot move (paralysed) at (x, y). */
function pinned(s: S, def: string, x: number, y: number, o: { tame?: boolean } = {}): EntityId {
  const id = addMon(s.state, def, x, y);
  run(s.state, (ctx) => {
    paralyzeMonst(ctx, id, 1000);
    if (o.tame) {
      ent(s, id).c.monster!.tame = 10;
      initedog(ctx, id, true);
    }
  });
  return id;
}
const heroAt = (s: S) => getPlayer(s.state).c.pos!;

describe('the rows', () => {
  test("objects.h's numbers, names and init", () => {
    const row = (id: string) => defs.object(id as DefId);
    expect(row('nh:stethoscope')).toMatchObject({ class: 'tool', prob: 25, weight: 4, cost: 75 });
    expect(row('nh:expensive_camera')).toMatchObject({ prob: 15, weight: 12, cost: 200 });
    expect(row('nh:leash')).toMatchObject({ prob: 65, weight: 12, cost: 20, material: 'leather' });
    expect(row('nh:saddle')).toMatchObject({ prob: 5, weight: 200, cost: 150 });
    expect(row('nh:bell')).toMatchObject({ prob: 2, weight: 30, cost: 50, material: 'copper' });
    expect(row('nh:fortune_cookie')).toMatchObject({ class: 'food', prob: 55, cost: 7 });
    expect(row('nh:orange')).toMatchObject({ prob: 10, food: { nutrition: 80 } });
    expect(row('nh:pancake')).toMatchObject({ prob: 25, delay: 2, food: { nutrition: 200 } });
    expect(CHARGED_TOOLS.has('nh:expensive_camera')).toBe(true);
    expect(render({ key: 'nh:leash.plural' })).toBe('leashes');
    expect(render({ key: 'nh:fortune_cookie' })).toBe('fortune cookie');
    // a camera is made with rn1(70, 30) charges
    const spes = new Set<number>();
    for (let seed = 1; seed <= 40; seed++) {
      const s = make(seed);
      run(s.state, (ctx) => {
        const id = mksobj(ctx, defs.object('nh:expensive_camera' as DefId), {
          carriedBy: s.state.playerId,
        });
        spes.add(itemOf(s.state, id).spe);
      });
    }
    for (const n of spes) expect(n >= 30 && n <= 99).toBe(true);
    expect(spes.size).toBeGreaterThan(10);
  });
});

describe('the stethoscope', () => {
  test("a monster's status line; one free use per move, the next takes it", () => {
    const s = make();
    const st = carry(s, 'nh:stethoscope');
    pinned(s, 'nh:jackal', 8, 2);
    const turn = s.state.turn;
    const t1 = applyDir(s, st, 'e');
    expect(t1.some((t) => t.startsWith('Status of the jackal: Level 0  HP 5(5)'))).toBe(true);
    expect(s.state.turn).toBe(turn); // free
    applyDir(s, st, 'e');
    expect(s.state.turn).toBe(turn + 1); // the second use took the move
    applyDir(s, st, 'e');
    expect(s.state.turn).toBe(turn + 1); // a new move: free again
  });

  test('herself, nothing, a secret door, a mimic, a corpse underfoot', () => {
    const s = make();
    const st = carry(s, 'nh:stethoscope');
    expect(applyDir(s, st, 'self').some((t) => t.startsWith('Status of yourself: Level 1'))).toBe(
      true,
    );
    s.step({ type: 'wait' });
    expect(applyDir(s, st, 'w')).toContain('You hear nothing special.');
    s.step({ type: 'wait' });
    const level = s.state.levels['dlvl1']!;
    setTerrain(level, 7, 1, T.sdoor_h);
    expect(applyDir(s, st, 'n')).toContain('You hear a hollow sound.  This must be a secret door!');
    expect(terrainIdAt(level, 7, 1)).not.toBe(T.sdoor_h);
    s.step({ type: 'wait' });
    const mimic = pinned(s, 'nh:small_mimic', 6, 3);
    run(s.state, (ctx) => setMappearance(ctx, mimic, { type: 'object', id: 'nh:chest' as DefId }));
    expect(applyDir(s, st, 'sw')).toContain('That chest is really a small mimic.');
    s.step({ type: 'wait' });
    s.floor('nh:corpse', { corpseOf: 'nh:newt' as DefId });
    expect(applyDir(s, st, 'down')).toContain('You determine that this unfortunate being is dead.');
  });

  test('a cursed one hears only her heart 1 time in 2', () => {
    let heart = 0;
    let other = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      const st = carry(s, 'nh:stethoscope', { buc: 'cursed' });
      const t = applyDir(s, st, 'w');
      if (t.includes('You hear your heart beat.')) heart++;
      else if (t.includes('You hear nothing special.')) other++;
    }
    expect(heart).toBeGreaterThan(5);
    expect(other).toBeGreaterThan(5);
  });
});

describe('the expensive camera', () => {
  test('no charges: "Nothing happens." and the move is used', () => {
    const s = make();
    const cam = carry(s, 'nh:expensive_camera', { spe: 0 });
    const turn = s.state.turn;
    expect(applyDir(s, cam, 'e')).toContain('Nothing happens.');
    expect(s.state.turn).toBe(turn + 1);
  });

  test('the flash wakes a sleeper, blinds a waking monster, and the charge is used', () => {
    const s = make();
    const cam = carry(s, 'nh:expensive_camera', { spe: 10 });
    const sleeper = addMon(s.state, 'nh:jackal', 10, 2, { asleep: true });
    expect(applyDir(s, cam, 'e')).toContain('The flash awakens the jackal.');
    expect(ent(s, sleeper).c.monster?.asleep).toBe(false);
    expect(itemOf(s.state, cam).spe).toBe(9);
  });

  test('at herself she is blinded; down she takes a picture of the floor', () => {
    const s = make();
    const cam = carry(s, 'nh:expensive_camera', { spe: 10 });
    expect(applyDir(s, cam, 'down')).toContain('You take a picture of the floor.');
    expect(hasProp(getPlayer(s.state), P.BLINDED)).toBe(false);
    applyDir(s, cam, 'self');
    expect(hasProp(getPlayer(s.state), P.BLINDED)).toBe(true);
  });
});

describe('the leash', () => {
  test('leashing a pet: its name, the inventory line, no dropping it, unleashing', () => {
    const s = make();
    const leash = carry(s, 'nh:leash');
    const kitten = pinned(s, 'nh:kitten', 8, 2, { tame: true });
    expect(applyDir(s, leash, 'e')).toContain('You slip the leash around your kitten.');
    expect(leashMon({ state: s.state }, leash)).toBe(kitten);
    expect(render(doname(s.state, defs, ent(s, leash)))).toContain('(attached to the kitten)');
    expect(s.text(s.mod('nh:drop', { item: leash }))).toContain(
      'The leash is tied around your hand.',
    );
    expect(applyDir(s, leash, 'e')).toContain('You remove the leash from your kitten.');
    expect(leashMon({ state: s.state }, leash)).toBeNull();
  });

  test('a wild monster cannot be leashed; herself neither; a third pet neither', () => {
    const s = make();
    const l1 = carry(s, 'nh:leash');
    const l2 = carry(s, 'nh:leash');
    const l3 = carry(s, 'nh:leash');
    pinned(s, 'nh:jackal', 8, 2);
    expect(applyDir(s, l1, 'e')).toContain('The jackal cannot be leashed!');
    expect(applyDir(s, l1, 'self')).toContain('Leash yourself?  Very funny...');
    pinned(s, 'nh:kitten', 6, 2, { tame: true });
    pinned(s, 'nh:little_dog', 7, 1, { tame: true });
    applyDir(s, l1, 'w');
    applyDir(s, l2, 'n');
    expect(s.text(s.mod('nh:apply', { item: l3 }))).toContain('You cannot leash any more pets.');
  });

  test('walking away pulls on the leash, then it snaps loose', () => {
    const s = make(1, ['.@.................']);
    const leash = carry(s, 'nh:leash');
    pinned(s, 'nh:kitten', 0, 0, { tame: true });
    applyDir(s, leash, 'w');
    const texts: string[] = [];
    for (let i = 0; i < 6; i++) texts.push(...s.text(s.step({ type: 'move', dir: 'e' })));
    expect(texts).toContain('You pull on the leash.');
    expect(texts).toContain("The kitten's leash snaps loose!");
    expect(leashMon({ state: s.state }, leash)).toBeNull();
    expect(heroAt(s).x).toBe(7);
  });

  test('a cursed leash chokes the pet instead', () => {
    const s = make(1, ['.@.................']);
    const leash = carry(s, 'nh:leash', { buc: 'cursed' });
    const kitten = pinned(s, 'nh:kitten', 0, 0, { tame: true });
    ent(s, kitten).c.hp = { cur: 100, max: 100 };
    applyDir(s, leash, 'w');
    const texts: string[] = [];
    for (let i = 0; i < 4; i++) texts.push(...s.text(s.step({ type: 'move', dir: 'e' })));
    expect(texts).toContain('The kitten is choked by the leash!');
    expect(ent(s, kitten).c.hp!.cur).toBeLessThan(100);
    expect(applyDir(s, leash, 'w').join(' ')).not.toContain('remove');
  });

  test('a leashed pet stays within reach while she waits', () => {
    let checked = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const s = make(seed);
      const leash = carry(s, 'nh:leash');
      const kitten = addMon(s.state, 'nh:kitten', 8, 2);
      run(s.state, (ctx) => {
        ent(s, kitten).c.monster!.tame = 10;
        initedog(ctx, kitten, true);
      });
      applyDir(s, leash, 'e');
      for (let i = 0; i < 30; i++) {
        s.step({ type: 'wait' });
        const k = ent(s, kitten).c.pos!;
        const h = heroAt(s);
        expect((k.x - h.x) ** 2 + (k.y - h.y) ** 2).toBeLessThanOrEqual(4);
        checked++;
      }
    }
    expect(checked).toBe(180);
  });

  test('leaving the level without the pet next to her leaves the leash slack', () => {
    const s = make(1, [
      ...Array<string>(5).fill('.'.repeat(20)),
      '.......@............',
      ...Array<string>(6).fill('.'.repeat(20)),
    ]);
    const leash = carry(s, 'nh:leash');
    const kitten = pinned(s, 'nh:kitten', 8, 5, { tame: true });
    applyDir(s, leash, 'e');
    ent(s, kitten).c.pos!.x = 12; // carried off (no dragging)
    const texts = run(s.state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 2 }, 'down'));
    expect(texts).toContain("The kitten's leash goes slack.");
    expect(leashMon({ state: s.state }, leash)).toBeNull();
  });
});

describe('the bell', () => {
  test('ringing it wakes the monsters nearby', () => {
    const s = make();
    const bell = carry(s, 'nh:bell');
    const jackal = addMon(s.state, 'nh:jackal', 10, 2, { asleep: true });
    expect(s.text(s.mod('nh:apply', { item: bell }))).toContain('You ring the bell.');
    expect(ent(s, jackal).c.monster?.asleep).toBe(false);
  });

  test('a cursed one sometimes summons a nymph, and may shatter', () => {
    let summoned = 0;
    let shattered = 0;
    let quiet = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = make(seed);
      const bell = carry(s, 'nh:bell', { buc: 'cursed' });
      const t = s.text(s.mod('nh:apply', { item: bell }));
      const sum = t.find((x) => x.startsWith('You summon a'));
      if (sum) {
        summoned++;
        expect(sum).toMatch(/nymph!$/);
      } else quiet++;
      if (t.includes('The bell has shattered!')) {
        shattered++;
        expect(s.state.entities[String(bell)]).toBeUndefined();
      }
    }
    expect(summoned).toBeGreaterThan(5);
    expect(quiet).toBeGreaterThan(summoned);
    expect(shattered).toBeLessThan(summoned);
  });
});

describe('the fortune cookie', () => {
  const strip = (l: string): string => l.replace(/^\[cookie\] /, '');
  const TRUE = new Set(TRUE_RUMORS.map(strip));
  const FALSE = new Set(FALSE_RUMORS.map(strip));

  test('eating one reads a fortune: true when blessed, false when cursed (never rotten)', () => {
    for (const buc of ['blessed', 'cursed'] as const)
      for (let seed = 1; seed <= 10; seed++) {
        const s = make(seed);
        const cookie = carry(s, 'nh:fortune_cookie', { buc });
        const t = s.text(s.mod('nh:eat', { item: cookie }));
        const i = t.indexOf('It reads:');
        expect(t).toContain('This cookie has a scrap of paper inside.');
        expect(i).toBeGreaterThanOrEqual(0);
        const line = t[i + 1]!;
        expect(line.startsWith('[cookie]')).toBe(false);
        expect((buc === 'blessed' ? TRUE : FALSE).has(line)).toBe(true);
        expect(t.join(' ')).not.toMatch(/rotten|awful/);
      }
  });

  test('blind, she cannot read it', () => {
    const s = make();
    const cookie = carry(s, 'nh:fortune_cookie');
    run(s.state, (ctx) => makeBlinded(ctx, 100, false));
    const t = s.text(s.mod('nh:eat', { item: cookie }));
    expect(t).toContain('What a pity that you cannot read it!');
    expect(t).not.toContain('It reads:');
  });
});
