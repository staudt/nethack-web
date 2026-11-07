// m7d step 8: magic traps, anti-magic fields and the tower of flame, for the hero and monsters.
// Outcomes are asserted; the fate roll is forced (magicTrapFate), and where a trap's own roll
// decides the case (the 1-in-30 explosion, a monster's 1-in-21 fire) RNG offsets are searched.
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  trapAt,
  type Ctx,
  type DefId,
  type GameState,
  type Level,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { dofiretrap, drainEn, magicTrapFate } from '../src/magictrap';
import { traptypeRnd } from '../src/mklev';
import { mspecUsed } from '../src/mstate';
import { P, setIntrinsic, timeoutLeft } from '../src/props';
import { TRAP, dotrap, mHarmlessTrap, mintrap } from '../src/trap';
import { pwOf, setPw } from '../src/uenergy';
import { addMon } from './helpers';
import { itemOf, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'mt-probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'mt-probe:run',
      labelKey: 'mt-probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const probeEngine = createEngine([vanillaMod, probeMod]);
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
/** Runs `fn` with a real Ctx after burning `burn` draws; the rendered messages. */
function run(state: GameState, fn: (ctx: Ctx) => void, burn = 0): string[] {
  probe.fn = (ctx) => {
    for (let i = 0; i < burn; i++) ctx.rng.rn2(2);
    fn(ctx);
  };
  return textOf(probeEngine.step(state, { type: 'mod', action: 'mt-probe:run' }));
}

const ROOM = ['            ', ' .......... ', ' .@........ ', ' .......... ', '            '];
type S = ReturnType<typeof levelSetup>;
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const addTrap = (level: Level, def: string, x: number, y: number, seen = false) => {
  level.traps.push({ def: def as DefId, x, y, seen });
  level.traps.sort((a, b) => a.y * level.width + a.x - (b.y * level.width + b.x));
};
/** A pinned monster (speed 0, awake) at (x, y). */
function pinned(s: S, def: string, x: number, y: number, hp = 30): number {
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.actor!.speed = 0;
  e.c.hp = { cur: hp, max: hp };
  return id;
}
const monsters = (state: GameState) =>
  Object.values(state.entities).filter((e) => e.c.monster !== undefined);
/** The trap under the hero, set off (seen traps: the hero stands on it, no confirmation). */
function trigger(s: S, burn = 0): string[] {
  return run(
    s.state,
    (ctx) => {
      const p = getPlayer(ctx.state).c.pos!;
      const t = trapAt(getLevel(ctx.state), p.x, p.y);
      if (t) dotrap(ctx, t);
    },
    burn,
  );
}
/** Runs `make` then `check` for burn offsets 0.., until `found` says the case happened. */
function search(
  found: (text: string[], s: S) => boolean,
  make: () => S,
  act: (s: S, burn: number) => string[],
) {
  for (let burn = 0; burn < 400; burn++) {
    const s = make();
    const text = act(s, burn);
    if (found(text, s)) return { s, text };
  }
  throw new Error('case not found');
}

describe('the trap kinds', () => {
  test('traptype_rnd() rolls 20 and 21 make a magic trap and an anti-magic field at any depth', () => {
    const fixed = (n: number) => ({
      rng: { rnd: () => n, rn2: () => 0, d: () => 0, next: () => 0 },
    });
    expect(traptypeRnd(fixed(20), 1)).toBe(TRAP.magic);
    expect(traptypeRnd(fixed(21), 1)).toBe(TRAP.antiMagic);
    expect(traptypeRnd(fixed(21), 1, true)).toBe(TRAP.antiMagic); // noteleport does not matter
  });

  test('flyers are not spared (not floor triggers); monsters fear only what can hurt them', () => {
    const s = room();
    const bat = pinned(s, 'nh:giant_bat', 5, 2);
    const oracle = pinned(s, 'nh:oracle', 6, 2);
    const ent = (id: number) => s.state.entities[String(id)]!;
    const magic = { def: TRAP.magic, x: 5, y: 2, seen: true };
    const anti = { def: TRAP.antiMagic, x: 5, y: 2, seen: true };
    run(s.state, (ctx) => {
      expect(mHarmlessTrap(ctx, ent(bat), magic)).toBe(true); // "usually"
      expect(mHarmlessTrap(ctx, ent(bat), anti)).toBe(false);
      expect(mHarmlessTrap(ctx, ent(oracle), anti)).toBe(true); // resists_magm()
    });
  });
});

describe('domagictrap() fates', () => {
  test('1-9: a flash blinds her, a roar, 1-4 monsters next to her, nearby sleepers wake', () => {
    for (const fate of [1, 9]) {
      const s = room();
      const sleeper = addMon(s.state, 'nh:jackal', 8, 2, { asleep: true });
      const before = monsters(s.state).length;
      const text = run(s.state, (ctx) => magicTrapFate(ctx, fate));
      expect(text).toContain('You are momentarily blinded by a flash of light!');
      expect(text).toContain('You hear a deafening roar!');
      const hero = getPlayer(s.state);
      const blind = timeoutLeft(s.state, hero, P.BLINDED);
      expect(blind).toBeGreaterThanOrEqual(9);
      expect(blind).toBeLessThanOrEqual(14);
      const made = monsters(s.state).length - before;
      expect(made).toBeGreaterThanOrEqual(1);
      expect(made).toBeLessThanOrEqual(4);
      expect(s.state.entities[String(sleeper)]?.c.monster?.asleep).toBe(false);
    }
  });

  test('1-9 while blind: no flash, the roar and the monsters still come', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    const before = monsters(s.state).length;
    const text = run(s.state, (ctx) => magicTrapFate(ctx, 4));
    expect(text).toEqual(['You hear a deafening roar!']);
    expect(monsters(s.state).length).toBeGreaterThan(before);
  });

  test('10: nothing; 11: a low hum; 13-18: odd feelings (hallucination changes some)', () => {
    const cases: [number, string, string][] = [
      [11, 'You hear a low hum.', 'You hear a low hum.'],
      [13, 'A shiver runs up and down your spine!', 'A shiver runs up and down your spine!'],
      [14, 'You hear distant howling.', 'You hear the moon howling at you.'],
      [15, 'You suddenly yearn for your distant homeland.', 'You suddenly yearn for Cleveland.'],
      [16, 'Your pack shakes violently!', 'Your pack shakes violently!'],
      [17, 'You smell charred flesh.', 'You smell hamburgers.'],
      [18, 'You feel tired.', 'You feel tired.'],
    ];
    expect(run(room().state, (ctx) => magicTrapFate(ctx, 10))).toEqual([]);
    for (const [fate, sane, halluc] of cases) {
      expect(run(room().state, (ctx) => magicTrapFate(ctx, fate))).toEqual([sane]);
      const s = room();
      setIntrinsic(getPlayer(s.state), P.HALLUC, true);
      expect(run(s.state, (ctx) => magicTrapFate(ctx, fate))).toEqual([halluc]);
    }
  });

  test('12: a tower of flame', () => {
    const text = run(room().state, (ctx) => magicTrapFate(ctx, 12));
    expect(text[0]).toBe('A tower of flame erupts from the floor!');
  });

  test('19: +1 Charisma and the monsters next to her are tamed', () => {
    const s = room();
    const near = pinned(s, 'nh:jackal', 3, 3);
    const far = pinned(s, 'nh:jackal', 6, 2);
    const cha = getPlayer(s.state).c.attributes!.cha;
    run(s.state, (ctx) => magicTrapFate(ctx, 19));
    if (cha < 18) expect(getPlayer(s.state).c.attributes!.cha).toBe(cha + 1);
    expect(s.state.entities[String(near)]?.c.monster?.tame).toBeGreaterThan(0);
    expect(s.state.entities[String(far)]?.c.monster?.tame ?? 0).toBe(0);
  });

  test('20: worn cursed items are uncursed, as an unconfused remove curse spell', () => {
    const s = room();
    const ring = s.carry('nh:ring_of_adornment');
    const loose = s.carry('nh:dagger');
    itemOf(s.state, ring).buc = 'cursed';
    itemOf(s.state, ring).equipped = 'ringL';
    itemOf(s.state, loose).buc = 'cursed';
    setIntrinsic(getPlayer(s.state), P.CONFUSION, true); // HConfusion is set aside
    const text = run(s.state, (ctx) => magicTrapFate(ctx, 20));
    expect(text).toEqual(['You feel like someone is helping you.']);
    expect(itemOf(s.state, ring).buc).toBe('uncursed');
    expect(itemOf(s.state, loose).buc).toBe('cursed');
  });
});

describe('the magic trap', () => {
  test('1 time in 30 it explodes: rnd(10) damage, +2 maximum energy, full energy, gone', () => {
    const { s, text } = search(
      (t) => t.includes('You are caught in a magical explosion!'),
      () => {
        const s = room();
        const p = getPlayer(s.state).c.pos!;
        addTrap(getLevel(s.state), TRAP.magic, p.x, p.y);
        setPw(s.ctx, { uen: 3, uenmax: 10, uenpeak: 10 });
        return s;
      },
      trigger,
    );
    expect(text).toContain('Your body absorbs some of the magical energy!');
    const hp = getPlayer(s.state).c.hp!;
    expect(hp.max - hp.cur).toBeGreaterThanOrEqual(1);
    expect(hp.max - hp.cur).toBeLessThanOrEqual(10);
    expect(pwOf(s.state)).toEqual({ uen: 12, uenmax: 12, uenpeak: 12 });
    const p = getPlayer(s.state).c.pos!;
    expect(trapAt(getLevel(s.state), p.x, p.y)).toBeUndefined();
  });

  test('otherwise a fate, and the trap stays, seen', () => {
    const { s } = search(
      (t) => t.length > 0 && !t.includes('You are caught in a magical explosion!'),
      () => {
        const s = room();
        const p = getPlayer(s.state).c.pos!;
        addTrap(getLevel(s.state), TRAP.magic, p.x, p.y);
        return s;
      },
      trigger,
    );
    const p = getPlayer(s.state).c.pos!;
    expect(trapAt(getLevel(s.state), p.x, p.y)).toMatchObject({ def: TRAP.magic, seen: true });
  });

  test('a monster on it is burnt 1 time in 21, else unharmed', () => {
    const make = () => {
      const s = room();
      addTrap(getLevel(s.state), TRAP.magic, 6, 2);
      pinned(s, 'nh:jackal', 6, 2);
      return s;
    };
    const act = (s: S, burn: number) =>
      run(s.state, (ctx) => void mintrap(ctx, monsters(ctx.state)[0]!.id, { force: true }), burn);
    const burnt = search((t) => t.length > 0, make, act);
    expect(burnt.text[0]).toBe('A tower of flame erupts from the floor under the jackal!');
    const j = monsters(burnt.s.state)[0];
    expect(j === undefined || j.c.hp!.cur < 30).toBe(true);
    const spared = search(
      (t, s) => t.length === 0 && monsters(s.state)[0]!.c.hp!.cur === 30,
      make,
      act,
    );
    expect(monsters(spared.s.state)[0]!.c.hp).toEqual({ cur: 30, max: 30 });
  });
});

describe('the tower of flame (dofiretrap)', () => {
  test('she loses up to d(2,4) maximum HP and takes the damage', () => {
    const s = room();
    const hp = getPlayer(s.state).c.hp!;
    hp.cur = hp.max = 40;
    const text = run(s.state, (ctx) => dofiretrap(ctx));
    expect(text[0]).toBe('A tower of flame erupts from the floor!');
    expect(hp.max).toBeGreaterThanOrEqual(32);
    expect(hp.max).toBeLessThanOrEqual(40);
    expect(hp.cur).toBeLessThan(40);
    expect(hp.cur).toBeGreaterThanOrEqual(hp.max - 8);
  });

  test('fire resistance: 0 or 1 damage, the maximum stays', () => {
    for (let burn = 0; burn < 6; burn++) {
      const s = room();
      setIntrinsic(getPlayer(s.state), P.FIRE_RES, true);
      const hp = getPlayer(s.state).c.hp!;
      hp.cur = hp.max = 40;
      const text = run(s.state, (ctx) => dofiretrap(ctx), burn);
      expect(hp.max).toBe(40);
      expect(hp.cur).toBeGreaterThanOrEqual(39);
      if (hp.cur === 40) expect(text).toContain('You are uninjured.');
    }
  });

  test('scrolls on her square burn ("N scrolls ... burn.")', () => {
    const s = room();
    const id = s.floor('nh:scroll_of_identify', { quantity: 30 });
    const text = run(s.state, (ctx) => dofiretrap(ctx));
    const left = s.state.entities[String(id)]?.c.item?.quantity ?? 0;
    expect(left).toBeLessThan(30);
    expect(text.some((t) => / burn\.$/.test(t))).toBe(true);
  });

  test('a fire-resistant monster is uninjured', () => {
    const { s, text } = search(
      (t) => t.length > 0,
      () => {
        const s = room();
        addTrap(getLevel(s.state), TRAP.magic, 6, 2);
        pinned(s, 'nh:red_mold', 6, 2);
        return s;
      },
      (s, burn) =>
        run(s.state, (ctx) => void mintrap(ctx, monsters(ctx.state)[0]!.id, { force: true }), burn),
    );
    expect(text).toContain('The red mold is uninjured.');
    expect(monsters(s.state)[0]!.c.hp).toEqual({ cur: 30, max: 30 });
  });
});

describe('the anti-magic field', () => {
  const field = (seen = false) => {
    const s = room();
    const p = getPlayer(s.state).c.pos!;
    addTrap(getLevel(s.state), TRAP.antiMagic, p.x, p.y, seen);
    for (const e of inventoryOf(s.state, s.state.playerId))
      if (e.c.item?.equipped === 'boots') e.c.item.equipped = null;
    return s;
  };

  test('drains d(2,6) energy, up to half of it from the maximum', () => {
    const s = field();
    setPw(s.ctx, { uen: 30, uenmax: 30, uenpeak: 30 });
    const text = trigger(s);
    expect(text).toEqual(['You feel your magical energy drain away!']);
    const pw = pwOf(s.state);
    expect(pw.uenmax).toBeLessThan(30);
    expect(pw.uenmax).toBeGreaterThanOrEqual(24);
    expect(pw.uen).toBeLessThan(pw.uenmax + 1);
    expect(30 - pw.uen).toBeGreaterThanOrEqual(2);
    expect(30 - pw.uen).toBeLessThanOrEqual(12);
    expect(getPlayer(s.state).c.hp).toEqual({ cur: 500, max: 500 });
  });

  test('a seen field is never escaped', () => {
    for (let burn = 0; burn < 20; burn++) {
      const s = field(true);
      setPw(s.ctx, { uen: 30, uenmax: 30, uenpeak: 30 });
      const text = trigger(s, burn);
      expect(text.some((t) => t.startsWith('You escape'))).toBe(false);
      expect(pwOf(s.state).uen).toBeLessThan(30);
    }
  });

  test('magic resistance turns it into rnd(4) damage ("You feel sluggish.")', () => {
    const s = field();
    setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, true);
    setPw(s.ctx, { uen: 30, uenmax: 30, uenpeak: 30 });
    const text = trigger(s);
    expect(text[0]).toBe('You feel sluggish.');
    const hp = getPlayer(s.state).c.hp!;
    expect(500 - hp.cur).toBeGreaterThanOrEqual(1);
    expect(500 - hp.cur).toBeLessThanOrEqual(4);
  });

  test('positively enchanted iron shoes lose a point instead', () => {
    const s = field();
    const shoes = s.carry('nh:iron_shoes');
    itemOf(s.state, shoes).spe = 1;
    itemOf(s.state, shoes).equipped = 'boots';
    setPw(s.ctx, { uen: 30, uenmax: 30, uenpeak: 30 });
    expect(trigger(s)).toEqual(['A lethargic aura surrounds your pair of hard shoes.']);
    expect(itemOf(s.state, shoes).spe).toBe(0);
    expect(pwOf(s.state).uen).toBe(30);
  });

  test('drain_en(): no maximum left is "momentarily lethargic"; more than she has comes off the maximum', () => {
    const s = room();
    setPw(s.ctx, { uen: 0, uenmax: 0, uenpeak: 5 });
    expect(run(s.state, (ctx) => drainEn(ctx, 5, false))).toEqual([
      'You feel momentarily lethargic.',
    ]);
    setPw(s.ctx, { uen: 2, uenmax: 40, uenpeak: 40 });
    expect(run(s.state, (ctx) => drainEn(ctx, 10, false))).toEqual([
      'You feel your magical energy drain away!',
    ]);
    const pw = pwOf(s.state);
    expect(pw.uen).toBe(0);
    expect(pw.uenmax).toBeLessThan(40);
    expect(pw.uenmax).toBeGreaterThanOrEqual(32);
  });

  test('a spellcaster on it needs d(2,6) more turns to cast ("seems lethargic.")', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.antiMagic, 6, 2);
    const id = pinned(s, 'nh:gnomish_wizard', 6, 2);
    const text = run(s.state, (ctx) => void mintrap(ctx, id, { force: true }));
    expect(text).toEqual(['The gnomish wizard seems lethargic.']);
    const used = mspecUsed({ state: s.state }, id);
    expect(used).toBeGreaterThanOrEqual(1);
    expect(used).toBeLessThanOrEqual(12);
    expect(trapAt(getLevel(s.state), 6, 2)?.seen).toBe(true);
  });

  test('a magic-resistant monster takes rnd(4) damage; one with no magic is untouched', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.antiMagic, 6, 2);
    const oracle = pinned(s, 'nh:oracle', 6, 2);
    run(s.state, (ctx) => void mintrap(ctx, oracle, { force: true }));
    const cur = s.state.entities[String(oracle)]!.c.hp!.cur;
    expect(30 - cur).toBeGreaterThanOrEqual(1);
    expect(30 - cur).toBeLessThanOrEqual(4);

    const s2 = room();
    addTrap(getLevel(s2.state), TRAP.antiMagic, 6, 2);
    const jackal = pinned(s2, 'nh:jackal', 6, 2);
    expect(run(s2.state, (ctx) => void mintrap(ctx, jackal, { force: true }))).toEqual([]);
    expect(s2.state.entities[String(jackal)]!.c.hp!.cur).toBe(30);
  });

  test('the compression can kill: "killed by the compression from an anti-magic field"', () => {
    const s = room();
    addTrap(getLevel(s.state), TRAP.antiMagic, 6, 2);
    const oracle = pinned(s, 'nh:oracle', 6, 2, 1);
    expect(run(s.state, (ctx) => void mintrap(ctx, oracle, { force: true }))).toContain(
      'The Oracle is killed by the compression from an anti-magic field!',
    );
    expect(s.state.entities[String(oracle)]).toBeUndefined();
  });
});
