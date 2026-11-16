// m18 step 3: chameleons, doppelgangers and sandestins; protection from shape changers. Each
// shapeshifter picks its forms its own way (select_newcham_form(): animals, role monsters and
// nasties), changes on its own 1 time in 6 when its special ability is ready, and the ring of
// protection from shape changers turns every shapeshifter, mimic and lycanthrope on the level
// back (rescham()), blocks new shifts, fog and disguises, lets them change again when it comes off
// (restartcham()) and catches up a level's monsters on arrival (restore_cham()). Eating a
// shapeshifter's corpse polymorphs her.
// ref: src/mon.c select_newcham_form(), pick_animal(), decide_to_shapeshift(), rescham(),
// normal_shape(), restartcham(), restore_cham(), kill_genocided_monsters(); src/topten.c
// tt_doppel(); src/do_wear.c Ring_on(), Ring_off(); src/eat.c cpostfx(); src/zap.c cancel_monst()
import {
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type GameEvent,
  type GameState,
  type Mod,
  type MonsterDef,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { makemon } from '../src/generation';
import { canFog, chamOf, isShapeshifter, setCham } from '../src/chamstate';
import { decideToShapeshift, restoreCham } from '../src/shapeshift';
import { newcham, pickAnimal, selectNewchamForm, ttDoppel } from '../src/newcham';
import { isCancelled, mspecUsed, paralyzeMonst, setCancelled, setMspecUsed } from '../src/mstate';
import { wereSummon } from '../src/were';
import { mApType, setMappearance } from '../src/mimicstate';
import { cancelMonst } from '../src/zap';
import { killGenocidedMonsters } from '../src/genocide';
import { setGenocided } from '../src/vanquished';
import { cpostfxOf } from '../src/givit';
import { heroFormId } from '../src/upoly';
import { isMplayer, MPLAYERS } from '../src/mondata';
import { P, protFromShapeChangers, setIntrinsic } from '../src/props';
import { mksobj } from '../src/items';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'ss-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'ss-probe:run',
      labelKey: 'ss-probe',
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

const texts = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx (no time passes) and returns the message text. */
function run(state: GameState, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return texts(engine.step(state, { type: 'mod', action: 'ss-probe:run' as DefId }).events);
}

const ROOM = [
  '                         ',
  ' ....................... ',
  ' ....................... ',
  ' ....................... ',
  ' ...........@........... ',
  ' ....................... ',
  ' ....................... ',
  '                         ',
];

/** A lit room with no monsters, the hero in the middle. */
function room(seed = 1) {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  return s;
}

const CHAMELEON = 'nh:chameleon' as DefId;
const DOPPELGANGER = 'nh:doppelganger' as DefId;
const SANDESTIN = 'nh:sandestin' as DefId;
const VAMPIRE_LORD = 'nh:vampire_lord' as DefId;
const RING = 'nh:ring_of_protection_from_shape_changers' as DefId;
const mon = (id: string): MonsterDef => defs.monster(id as DefId);
const ent = (state: GameState, id: number): Entity | undefined => state.entities[String(id)];

/** Makes a monster of `def` at (x, y) and returns it (born shifted if it is a shapeshifter). */
function make(ctx: Ctx, def: string, x: number, y: number): Entity {
  const id = makemon(ctx, mon(def), { x, y }, { nogroup: true, adjacentOk: true });
  expect(id).not.toBeNull();
  const e = ctx.state.entities[String(id)];
  if (!e) throw new Error('no monster');
  return e;
}

/** A shapeshifter of `kind` made at (x, y), then put into form `form`. */
function shifted(ctx: Ctx, kind: string, form: string, x: number, y: number): Entity {
  const e = make(ctx, kind, x, y);
  if (e.def !== form) expect(newcham(ctx, e, mon(form))).toBe(true);
  expect(e.def).toBe(form);
  expect(chamOf(ctx, e.id)).toBe(kind);
  return e;
}

/** Puts on a ring (on the left hand) through the action. */
function putOn(state: GameState, id: number): string[] {
  const r = engine.stepAll(state, {
    type: 'mod',
    action: 'nh:puton' as DefId,
    args: { item: id } as never,
  });
  const p = state.pendingPrompt?.prompt;
  if (!p) return texts(r.events);
  return texts(engine.step(state, { type: 'answer', promptId: p.id, value: 'l' as never }).events);
}

/** Every monster on the hero's level is paralysed for a few turns (pinned: no moves, no attacks). */
function pinAll(state: GameState): void {
  for (const e of Object.values(state.entities))
    if (e?.c.monster && e.id !== state.playerId && e.c.pos?.level === state.currentLevel)
      paralyzeMonst({ state }, e.id, 5);
}

/** `n` turns of waiting with every monster pinned. */
function waitPinned(state: GameState, n: number, each?: () => boolean): void {
  for (let t = 0; t < n; t++) {
    pinAll(state);
    engine.stepAll(state, { type: 'wait' });
    if (each?.()) return;
  }
}

/** Carries a new ring of protection from shape changers. */
function carryRing(state: GameState): number {
  let id = 0;
  run(state, (ctx) => {
    id = mksobj(ctx, defs.object(RING), { init: false, carriedBy: ctx.state.playerId });
  });
  return id;
}

/** `n` forms picked by select_newcham_form() for a shapeshifter of `kind` (a kind the port lacks is null). */
function forms(kind: string, n: number, seed = 1): (DefId | null)[] {
  const out: (DefId | null)[] = [];
  const { state } = room(seed);
  run(state, (ctx) => {
    const e = make(ctx, kind, 13, 2);
    for (let i = 0; i < n; i++) out.push(selectNewchamForm(ctx, e)?.id ?? null);
  });
  return out;
}

describe('the rows and the ring', () => {
  test('the three shapeshifters and the ring of protection from shape changers', () => {
    for (const id of [CHAMELEON, DOPPELGANGER, SANDESTIN])
      expect(isShapeshifter(mon(id))).toBe(true);
    expect(mon(SANDESTIN).genFlags).toContain('nocorpse');
    const r = defs.object(RING);
    expect(r.class).toBe('ring');
    expect(r.prob).toBe(1);
    expect(r.prop).toBe(P.PROT_FROM_SHAPE_CHANGERS);
    // a shuffled description, like every ring
    expect(r.descKey).toBeUndefined();
  });

  test('the new game shuffles the ring with the others', () => {
    const { state } = engine.newGame({ seed: 5 });
    const rings = defs.objects.filter((o) => o.class === 'ring');
    const looks = rings.map((o) => state.appearances[o.id]);
    expect(looks.every((l) => l !== undefined)).toBe(true);
    expect(new Set(looks).size).toBe(rings.length);
  });
});

describe('select_newcham_form()', () => {
  test('a chameleon takes an animal form 1 time in 3, else any form', () => {
    const picks = forms(CHAMELEON, 600);
    const animals = picks.filter((p) => p !== null && mon(p).flags.includes('animal')).length;
    // 1/3 by pick_animal() plus the animals among the random forms
    expect(animals / picks.length).toBeGreaterThan(0.36);
    expect(picks.some((p) => p !== null && !mon(p).flags.includes('animal'))).toBe(true);
    // pick_animal() alone is always an animal
    const { state } = room(2);
    run(state, (ctx) => {
      for (let i = 0; i < 50; i++) expect(pickAnimal(ctx)?.flags).toContain('animal');
    });
  });

  test('a sandestin is mostly a nasty below the Archon', () => {
    const picks = forms(SANDESTIN, 350);
    const nasty = picks.filter((p) => p !== null && mon(p).flags.includes('nasty')).length;
    // rn2(7): 6 in 7 from nasties[], some of them absent here (no form: newcham() tries again);
    // a random form is a nasty far less often (about 1 in 5 since the remaining demons, all
    // M2_NASTY, came in m18 step 4)
    expect(nasty / picks.length).toBeGreaterThan(0.3);
    expect(picks.filter((p) => p === null).length).toBeGreaterThan(0);
    const random = forms('nh:jackal', 350).filter(
      (p) => p !== null && mon(p).flags.includes('nasty'),
    );
    expect(random.length / 350).toBeLessThan(0.24);
    expect(random.length / 350).toBeLessThan((0.6 * nasty) / picks.length);
  });

  test("a doppelganger becomes a role monster (tt_doppel()'s no-record branch), a nasty or a humanoid", () => {
    const picks = forms(DOPPELGANGER, 600);
    const roles = picks.filter((p) => p !== null && isMplayer(mon(p)));
    // 6/7 * 2/3 of the picks, less the Valkyrie (no row: a random form)
    expect(roles.length / picks.length).toBeGreaterThan(0.4);
    expect(roles.every((p) => p !== ('nh:valkyrie' as DefId))).toBe(true);
    expect(new Set(roles).size).toBeGreaterThan(8);
    // tt_doppel() alone: a player monster or NON_PM for the Valkyrie
    const { state } = room(3);
    run(state, (ctx) => {
      for (let i = 0; i < 60; i++) {
        const r = ttDoppel(ctx);
        expect(r === null || MPLAYERS.includes(r.id)).toBe(true);
      }
    });
  });

  test('newcham() lets a doppelganger take a role form, never an ordinary monster', () => {
    const { state } = room(4);
    run(state, (ctx) => {
      const d = make(ctx, DOPPELGANGER, 13, 2);
      expect(newcham(ctx, d, mon('nh:archeologist'))).toBe(true);
      expect(d.def).toBe('nh:archeologist');
      const j = make(ctx, 'nh:jackal', 15, 2);
      for (let i = 0; i < 300; i++) expect(isMplayer(selectNewchamForm(ctx, j)!)).toBe(false);
    });
  });

  test('an ordinary monster wearing dragon scale mail turns into that dragon', () => {
    const { state } = room(5);
    run(state, (ctx) => {
      const g = make(ctx, 'nh:hill_orc', 13, 2);
      const mail = mksobj(ctx, defs.object('nh:silver_dragon_scale_mail' as DefId), {
        init: false,
        carriedBy: g.id,
      });
      state.entities[String(mail)]!.c.item!.equipped = 'body';
      expect(selectNewchamForm(ctx, g)?.id).toBe('nh:silver_dragon');
    });
  });
});

describe('the regular shapeshift', () => {
  test('a chameleon changes 1 time in 6 when ready, then waits 3..12 turns', () => {
    const { state } = room(6);
    run(state, (ctx) => {
      const c = make(ctx, CHAMELEON, 13, 2);
      setMspecUsed(ctx, c.id, 5);
      const before = c.def;
      for (let i = 0; i < 50; i++) decideToShapeshift(ctx, c);
      expect(c.def).toBe(before); // not ready: no change, no draw that sets it
      expect(mspecUsed(ctx, c.id)).toBe(5);
      setMspecUsed(ctx, c.id, 0);
      let tries = 0;
      while (mspecUsed(ctx, c.id) === 0 && tries < 200) {
        decideToShapeshift(ctx, c);
        tries++;
      }
      expect(mspecUsed(ctx, c.id)).toBeGreaterThanOrEqual(3);
      expect(mspecUsed(ctx, c.id)).toBeLessThanOrEqual(12);
      expect(chamOf(ctx, c.id)).toBe(CHAMELEON);
    });
  });

  test('over the turns: the countdown runs before decide_to_shapeshift() (never under 3 after a change)', () => {
    const { state } = room(7);
    let id = 0;
    run(state, (ctx) => {
      id = make(ctx, CHAMELEON, 3, 1).id;
    });
    let changes = 0;
    let last = ent(state, id)!.def;
    const seen = new Set<number>();
    waitPinned(state, 300, () => {
      const e = ent(state, id);
      if (!e) return true;
      if (e.def !== last) {
        changes++;
        last = e.def;
        // set to 3 + rn2(10) after this turn's countdown
        const n = mspecUsed({ state }, id);
        expect(n).toBeGreaterThanOrEqual(3);
        expect(n).toBeLessThanOrEqual(12);
        seen.add(n);
      }
      expect(chamOf({ state }, id)).toBe(CHAMELEON);
      return false;
    });
    expect(changes).toBeGreaterThan(10);
    expect(seen.has(3)).toBe(true); // rn2(10) == 0 happened: the lowest value is kept
  });
});

describe('protection from shape changers', () => {
  test('putting the ring on reverts every shapeshifter, mimic and beast lycanthrope', () => {
    const s = room(8);
    let cham: Entity | undefined;
    let lord: Entity | undefined;
    let mimic: Entity | undefined;
    let were: Entity | undefined;
    run(s.state, (ctx) => {
      cham = shifted(ctx, CHAMELEON, 'nh:jackal', 3, 1);
      lord = shifted(ctx, VAMPIRE_LORD, 'nh:wolf', 22, 1);
      mimic = make(ctx, 'nh:small_mimic', 3, 6);
      setMappearance(ctx, mimic.id, { type: 'object', id: 'nh:boulder' as DefId });
      mimic.c.monster!.asleep = false;
      were = make(ctx, 'nh:werewolf', 22, 6);
    });
    expect(were!.def).toBe('nh:werewolf');
    pinAll(s.state);
    const ring = carryRing(s.state);
    const lines = putOn(s.state, ring);
    expect(protFromShapeChangers(s.state)).toBe(true);
    expect(cham!.def).toBe(CHAMELEON);
    expect(lord!.def).toBe(VAMPIRE_LORD);
    expect(chamOf({ state: s.state }, cham!.id)).toBeNull();
    expect(chamOf({ state: s.state }, lord!.id)).toBeNull();
    expect(mApType({ state: s.state }, mimic!.id)).toBeNull();
    expect(mimic!.c.monster!.asleep).toBe(true); // in lieu of shape change
    expect(were!.def).toBe('nh:human_werewolf');
    expect(lines).toContain('The jackal turns into a chameleon!');
    expect(lines).toContain('The wolf turns into a vampire lord!');

    // no new shifts, births or fog
    waitPinned(s.state, 40);
    expect(ent(s.state, cham!.id)?.def).toBe(CHAMELEON);
    run(s.state, (ctx) => {
      const c2 = make(ctx, CHAMELEON, 12, 2);
      expect(c2.def).toBe(CHAMELEON);
      expect(chamOf(ctx, c2.id)).toBeNull();
      const v = make(ctx, VAMPIRE_LORD, 14, 2);
      expect(v.def).toBe(VAMPIRE_LORD);
      setCham(ctx, v.id, VAMPIRE_LORD); // a vampshifter from elsewhere
      expect(canFog(ctx, v)).toBe(false);
      expect(newcham(ctx, make(ctx, 'nh:jackal', 16, 2), mon('nh:vampire'))).toBe(true);
    });
    const vamp = Object.values(s.state.entities).find((e) => e?.def === 'nh:vampire');
    expect(chamOf({ state: s.state }, vamp!.id)).toBeNull(); // no vampshifter by polymorph

    // taking it off lets them change again
    pinAll(s.state);
    s.mod('nh:remove', { item: ring });
    expect(protFromShapeChangers(s.state)).toBe(false);
    expect(chamOf({ state: s.state }, cham!.id)).toBe(CHAMELEON);
    expect(chamOf({ state: s.state }, lord!.id)).toBe(VAMPIRE_LORD);
    let changed = false;
    waitPinned(s.state, 200, () => (changed = ent(s.state, cham!.id)?.def !== CHAMELEON));
    expect(changed).toBe(true);
  });

  test('taking the ring off lets a sleeping mimic hide again', () => {
    const s = room(9);
    const ring = carryRing(s.state);
    putOn(s.state, ring);
    let mimic: Entity | undefined;
    run(s.state, (ctx) => {
      mimic = make(ctx, 'nh:small_mimic', 3, 6);
      expect(mApType(ctx, mimic.id)).toBeNull(); // set_mimic_sym() does nothing
      mimic.c.monster!.asleep = true;
    });
    s.mod('nh:remove', { item: ring });
    expect(mApType({ state: s.state }, mimic!.id)).not.toBeNull();
  });

  test('arriving on a level with the ring on reverts its shapeshifters', () => {
    const s = { state: engine.newGame({ seed: 10 }).state };
    let cham: Entity | undefined;
    run(s.state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 2 }, 'up'));
    const lvl2 = s.state.currentLevel;
    run(s.state, (ctx) => {
      const hp = getPlayer(ctx.state).c.pos!;
      const id = makemon(ctx, mon(CHAMELEON), { x: hp.x, y: hp.y }, { adjacentOk: true });
      cham = ent(ctx.state, id!)!;
      if (cham.def === CHAMELEON) expect(newcham(ctx, cham, mon('nh:jackal'))).toBe(true);
      cham.c.monster!.asleep = true;
    });
    const form = cham!.def;
    expect(form).not.toBe(CHAMELEON);
    run(s.state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 1 }, 'down'));
    expect(s.state.currentLevel).not.toBe(lvl2);
    pinAll(s.state);
    putOn(s.state, carryRing(s.state));
    expect(protFromShapeChangers(s.state)).toBe(true);
    expect(ent(s.state, cham!.id)?.def).toBe(form); // not on her level: untouched
    run(s.state, (ctx) => ctx.goToLevel({ dungeon: 'nh:main', dlevel: 2 }, 'up'));
    expect(s.state.currentLevel).toBe(lvl2);
    expect(ent(s.state, cham!.id)?.def).toBe(CHAMELEON);
    expect(chamOf({ state: s.state }, cham!.id)).toBeNull();
  });

  test('restore_cham() without the ring lets a reverted shapeshifter change again', () => {
    const { state } = room(11);
    run(state, (ctx) => {
      const c = make(ctx, CHAMELEON, 13, 2);
      if (c.def !== CHAMELEON) expect(newcham(ctx, c, mon(CHAMELEON))).toBe(true);
      setCham(ctx, c.id, null);
      restoreCham(ctx, c);
      expect(chamOf(ctx, c.id)).toBe(CHAMELEON);
    });
  });

  test('lycanthropes: no change into a beast, no help summoned', () => {
    const s = room(12);
    putOn(s.state, carryRing(s.state));
    let were: Entity | undefined;
    run(s.state, (ctx) => {
      were = make(ctx, 'nh:human_werewolf', 13, 2);
      expect(wereSummon(ctx, 'nh:werewolf').total).toBe(0);
    });
    waitPinned(s.state, 300);
    expect(ent(s.state, were!.id)?.def).toBe('nh:human_werewolf');
  });
});

describe('cancellation, genocide and corpses', () => {
  test('a cancelled shapeshifter is forced back for good; polymorph uncancels a cancelled chameleon', () => {
    let done = false;
    for (let seed = 1; seed <= 20 && !done; seed++) {
      const { state } = room(seed);
      run(state, (ctx) => {
        const c = shifted(ctx, CHAMELEON, 'nh:jackal', 13, 2);
        const wand = mksobj(ctx, defs.object('nh:wand_of_cancellation' as DefId), {
          init: false,
          carriedBy: ctx.state.playerId,
        });
        if (!cancelMonst(ctx, c, { kind: 'wand', item: ent(ctx.state, wand)! }, true, false))
          return;
        expect(c.def).toBe(CHAMELEON);
        expect(chamOf(ctx, c.id)).toBeNull();
        expect(isCancelled(ctx, c.id)).toBe(true);
        // a polymorph: it is a shapechanger again, uncancelled
        expect(newcham(ctx, c, null)).toBe(true);
        expect(chamOf(ctx, c.id)).toBe(CHAMELEON);
        expect(isCancelled(ctx, c.id)).toBe(false);
        done = true;
      });
    }
    expect(done).toBe(true);
  });

  test('with the ring a cancelled chameleon is not uncancelled by polymorph', () => {
    const s = room(13);
    putOn(s.state, carryRing(s.state));
    run(s.state, (ctx) => {
      const c = make(ctx, CHAMELEON, 13, 2);
      setCancelled(ctx, c.id);
      expect(newcham(ctx, c, null)).toBe(true);
      expect(chamOf(ctx, c.id)).toBeNull();
      expect(isCancelled(ctx, c.id)).toBe(true);
    });
  });

  test('genocide: a chameleon in a genocided form changes, a genocided chameleon dies', () => {
    const { state } = room(14);
    run(state, (ctx) => {
      const a = shifted(ctx, CHAMELEON, 'nh:jackal', 3, 2);
      const b = shifted(ctx, CHAMELEON, 'nh:newt', 22, 2);
      setGenocided(ctx, 'nh:jackal' as DefId);
      killGenocidedMonsters(ctx);
      expect(ent(ctx.state, a.id)?.def).not.toBe('nh:jackal');
      expect(ent(ctx.state, a.id)?.c.monster).toBeDefined();
      setGenocided(ctx, CHAMELEON);
      killGenocidedMonsters(ctx);
      expect(ent(ctx.state, a.id)?.c.monster).toBeUndefined();
      expect(ent(ctx.state, b.id)?.c.monster).toBeUndefined();
    });
  });

  test('eating a chameleon or doppelganger corpse polymorphs her; Unchanging only tingles', () => {
    let polyd = false;
    for (let seed = 1; seed <= 20 && !polyd; seed++) {
      const { state } = room(seed);
      const lines = run(state, (ctx) => cpostfxOf(ctx, mon(CHAMELEON)));
      expect(lines[0]).toBe('You feel a change coming over you.');
      polyd = heroFormId(state) !== null;
    }
    expect(polyd).toBe(true);
    const { state } = room(1);
    const lines = run(state, (ctx) => {
      setIntrinsic(getPlayer(ctx.state), P.UNCHANGING, true);
      cpostfxOf(ctx, mon(DOPPELGANGER));
    });
    expect(lines).toEqual(['You feel momentarily different.']);
    expect(heroFormId(state)).toBeNull();
  });
});
