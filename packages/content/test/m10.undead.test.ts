// m10 step 4: undead, imps, regenerators and teleporters. Monster HP regeneration (every 20 turns,
// every turn for M1_REGEN, caught up on arrival), fleeing M1_TPORT monsters teleporting, the
// tengu's jumps, imps cussing, teleportitis and teleport control from corpses, the quantum
// mechanic's speed toggle, zombies' and mummies' corpses, cannibalism and the dog/cat penalty,
// the giants' gear and the gremlin multiplying in a rust trap. Rolls are forced (`scripted`) or
// searched for, never a lucky seed.
// ref: src/monmove.c mon_regen(), dochug(), m_move(); src/dog.c mon_catchup_elapsed_time();
// src/wizard.c cuss(); src/sounds.c domonnoise(); src/eat.c maybe_cannibal(), cprefx(),
// cpostfx(), intrinsic_possible(), givit(); src/mon.c undead_to_corpse(); src/makemon.c
// m_initweap(), m_initinv(); src/trap.c trapeffect_rust_trap(); src/potion.c split_mon()
import {
  getPlayer,
  itemsAt,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Rng,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { domonnoise } from '../src/chat';
import { cuss } from '../src/cuss';
import { cpostfxOf } from '../src/givit';
import { mkcorpse } from '../src/items';
import { luckOf } from '../src/luck';
import { mInitInv, mInitWeap } from '../src/mongear';
import { monflee } from '../src/monflee';
import { dochug } from '../src/monmove';
import { catchUpRegen } from '../src/mstate';
import { P, hasIntrinsic, setIntrinsic } from '../src/props';
import { monsterDied } from '../src/index';
import { splitMon } from '../src/clone';
import { addMon } from './helpers';
import { ctxFor, defs, levelSetup, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;
/** The room, after one turn so that the hero's vision is computed. */
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  s.step({ type: 'wait' });
  return s;
}
/** A test Ctx (no prompts or queries are reached here) with its events. */
type TCtx = Ctx & { events: GameEvent[] };
const cx = (state: S['state']): TCtx => ctxFor(state) as unknown as TCtx;

const ROOM = [
  '...............',
  '...............',
  '.......@.......',
  '...............',
  '...............',
];

const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const keysOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

/** A test Ctx whose rn2() answers from `script` first. */
function scripted(base: { rng: Rng } & object, script: number[]): TCtx {
  const ctx = base as unknown as TCtx;
  const real = ctx.rng;
  const rng: Rng = {
    next: () => real.next(),
    rn2: (x) => {
      const v = script.shift();
      if (v === undefined) return real.rn2(x);
      if (v < 0 || v >= x) throw new Error(`scripted rn2(${x}) cannot be ${v}`);
      return v;
    },
    rnd: (x) => real.rnd(x),
    d: (n, s) => real.d(n, s),
  };
  return { ...ctx, rng };
}

const ent = (s: S, id: EntityId): Entity => s.state.entities[String(id)]!;
/** A monster of `def` at x,y with `hp` of `max` HP; speed 0 and asleep unless told otherwise. */
function monAt(
  s: S,
  def: string,
  x: number,
  y: number,
  o: { hp?: number; max?: number; speed?: number; asleep?: boolean; peaceful?: boolean } = {},
): EntityId {
  const id = addMon(s.state, def, x, y, {
    asleep: o.asleep ?? true,
    peaceful: o.peaceful ?? false,
  });
  const e = ent(s, id);
  e.c.hp = { cur: o.hp ?? 1, max: o.max ?? 50 };
  e.c.actor!.speed = o.speed ?? 0;
  e.c.monster!.level = defs.monster(def as DefId).level;
  return id;
}
const hpOf = (s: S, id: EntityId): number => ent(s, id).c.hp!.cur;
const dist = (s: S, id: EntityId): number => {
  const p = ent(s, id).c.pos!;
  const h = getPlayer(s.state).c.pos!;
  return Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y));
};

describe('monster hit point regeneration (mon_regen)', () => {
  test('a wounded jackal heals 1 HP on each turn where moves % 20 == 0; an imp every turn', () => {
    const s = room();
    const jackal = monAt(s, 'nh:jackal', 1, 0);
    const imp = monAt(s, 'nh:imp', 13, 4);
    // C's `moves` at mcalcdistress() is the turn that is ending: state.turn - 1 after it
    let ticks = 0;
    for (let i = 0; i < 45; i++) {
      s.step({ type: 'wait' });
      if ((s.state.turn - 1) % 20 === 0) ticks++;
    }
    expect(ticks).toBe(2);
    expect(hpOf(s, jackal)).toBe(1 + ticks);
    expect(hpOf(s, imp)).toBe(1 + 45);
    // never past the maximum
    for (let i = 0; i < 10; i++) s.step({ type: 'wait' });
    expect(hpOf(s, imp)).toBe(50);
  });

  test('monsters left on another level catch up on arrival: imv / 20, or imv for a regenerator', () => {
    const s = room();
    const jackal = monAt(s, 'nh:jackal', 1, 0);
    const quasit = monAt(s, 'nh:quasit', 2, 0);
    catchUpRegen(cx(s.state), ent(s, jackal), 45);
    catchUpRegen(cx(s.state), ent(s, quasit), 45);
    expect(hpOf(s, jackal)).toBe(3);
    expect(hpOf(s, quasit)).toBe(46);
  });

  test('monsters on other levels do not regenerate turn by turn', () => {
    const s = room();
    const imp = monAt(s, 'nh:imp', 1, 0);
    ent(s, imp).c.pos!.level = 'elsewhere';
    for (let i = 0; i < 5; i++) s.step({ type: 'wait' });
    expect(hpOf(s, imp)).toBe(1);
  });
});

describe('fleeing teleporters (dochug M1_TPORT)', () => {
  /** An awake hostile monster two squares east of the hero, fleeing. */
  function fleeing(def: string) {
    const s = room();
    const id = monAt(s, def, 9, 2, { hp: 20, max: 20, speed: 12, asleep: false });
    monflee(cx(s.state), id, 0, true, false);
    return { s, id };
  }

  test('1 time in 40 a fleeing quantum mechanic teleports away instead of moving', () => {
    const { s, id } = fleeing('nh:quantum_mechanic');
    const ctx = scripted(s.ctx, [0]);
    dochug(ctx, id);
    expect(keysOf(ctx.events)).toContain('tele.mon_vanishes_reappears');
  });

  test('the other 39 times, and always for a non-teleporter, it does not', () => {
    const qm = fleeing('nh:quantum_mechanic');
    const c1 = scripted(qm.s.ctx, [1]);
    dochug(c1, qm.id);
    expect(keysOf(c1.events).filter((k) => k.startsWith('tele.'))).toEqual([]);
    const jackal = fleeing('nh:jackal');
    const c2 = scripted(jackal.s.ctx, [0]);
    dochug(c2, jackal.id);
    expect(keysOf(c2.events).filter((k) => k.startsWith('tele.'))).toEqual([]);
  });
});

describe('the tengu', () => {
  function tengu(hp = 20) {
    const s = room();
    const id = monAt(s, 'nh:tengu', 1, 0, { hp, max: 20, speed: 13, asleep: false });
    return { s, id };
  }

  test('1 time in 5, when unhurt and hostile, half the time it jumps next to the hero', () => {
    const { s, id } = tengu();
    expect(dist(s, id)).toBeGreaterThan(1);
    const ctx = scripted(s.ctx, [0, 0]); // !rn2(5), then rn2(2) == 0: mnexto()
    dochug(ctx, id);
    expect(dist(s, id)).toBe(1);
    expect(textsOf(ctx.events).join(' ')).toContain('tengu');
  });

  test('the other times it walks (one step)', () => {
    const { s, id } = tengu();
    const p0 = { ...ent(s, id).c.pos! };
    dochug(scripted(s.ctx, [1]), id);
    const p = ent(s, id).c.pos!;
    expect(Math.max(Math.abs(p.x - p0.x), Math.abs(p.y - p0.y))).toBeLessThanOrEqual(1);
  });

  test('a cancelled tengu does not teleport', () => {
    const { s, id } = tengu();
    const md = s.state.modData as Record<string, Record<string, Record<string, boolean>>>;
    md['nh'] ??= {};
    md['nh']['mcan'] = { [String(id)]: true };
    const p0 = { ...ent(s, id).c.pos! };
    dochug(scripted(s.ctx, [0, 0]), id);
    const p = ent(s, id).c.pos!;
    expect(Math.max(Math.abs(p.x - p0.x), Math.abs(p.y - p0.y))).toBeLessThanOrEqual(1);
  });
});

describe('imps cuss (wizard.c cuss())', () => {
  test('one time in five it casts aspersions, else a demon_cuss line', () => {
    const s = room();
    const imp = monAt(s, 'nh:imp', 8, 2, { asleep: false });
    const c1 = scripted(s.ctx, [0]);
    cuss(c1, ent(s, imp));
    expect(textsOf(c1.events)).toContain('The imp casts aspersions on your ancestry.');
    const c2 = scripted(s.ctx, [1, 4]);
    cuss(c2, ent(s, imp));
    expect(textsOf(c2.events)).toContain('"Eat slime and die!"');
  });

  test('every demon_cuss line has text', () => {
    for (let i = 1; i <= 27; i++) expect(render({ key: `cuss.demon.${i}` })).toMatch(/^".+"$/);
  });

  test('a hostile imp in range cusses the hero during its turn (searched over many turns)', () => {
    let cussed = 0;
    for (let seed = 1; seed <= 40 && cussed === 0; seed++) {
      const s = room(seed);
      const imp = monAt(s, 'nh:imp', 9, 2, { hp: 20, max: 20, speed: 12, asleep: false });
      for (let i = 0; i < 10; i++) {
        if (!s.state.entities[String(imp)]) break;
        if (keysOf(s.step({ type: 'wait' }).events).some((k) => k.startsWith('cuss.'))) cussed++;
      }
    }
    expect(cussed).toBeGreaterThan(0);
  });

  test('#chat: a hostile imp cusses, a peaceful one says "We\'re all doomed."', () => {
    const s = room();
    const imp = monAt(s, 'nh:imp', 8, 2, { asleep: false });
    const c1 = scripted(s.ctx, [0]);
    domonnoise(c1, imp);
    expect(textsOf(c1.events)).toContain('The imp casts aspersions on your ancestry.');
    ent(s, imp).c.monster!.peaceful = true;
    const c2 = cx(s.state);
    domonnoise(c2, imp);
    expect(textsOf(c2.events)).toEqual(['"We\'re all doomed."']);
  });

  test('#chat: a hostile giant boasts, and "Fee Fie Foe Foo!" wakes monsters', () => {
    const s = room();
    const giant = monAt(s, 'nh:giant', 8, 2, { asleep: false });
    const sleeper = monAt(s, 'nh:jackal', 10, 2);
    const c1 = scripted(s.ctx, [1]);
    domonnoise(c1, giant);
    expect(textsOf(c1.events)).toEqual(['The giant complains about a diet of mutton.']);
    expect(ent(s, sleeper).c.monster!.asleep).toBe(true);
    const c2 = scripted(s.ctx, [3]);
    domonnoise(c2, giant);
    expect(textsOf(c2.events)).toContain('The giant shouts "Fee Fie Foe Foo!" and guffaws.');
    expect(ent(s, sleeper).c.monster!.asleep).toBe(false);
  });
});

describe('corpse intrinsics: teleportitis and teleport control', () => {
  const tenguDef = defs.monster('nh:tengu' as DefId);

  test('a tengu corpse can make her jumpy (forced: teleport chosen, rn2(10) < level 6)', () => {
    const s = room();
    // corpse_intrinsic(): poison (rn2(1)), teleport (rn2(2) == 0 takes it), control (rn2(3) != 0
    // keeps it); should_givit(): rn2(10)
    const ctx = scripted(s.ctx, [0, 0, 1, 0]);
    cpostfxOf(ctx, tenguDef);
    expect(textsOf(ctx.events)).toEqual(['You feel very jumpy.']);
    expect(hasIntrinsic(getPlayer(s.state), P.TELEPORT)).toBe(true);
  });

  test('or give teleport control (rn2(12) < 6), shown by enlightenment', () => {
    const s = room();
    const ctx = scripted(s.ctx, [0, 1, 0, 5]);
    cpostfxOf(ctx, tenguDef);
    expect(textsOf(ctx.events)).toEqual(['You feel in control of yourself.']);
    expect(hasIntrinsic(getPlayer(s.state), P.TELEPORT_CONTROL)).toBe(true);
    const fail = room();
    const c2 = scripted(fail.ctx, [0, 1, 0, 6]);
    cpostfxOf(c2, tenguDef);
    expect(hasIntrinsic(getPlayer(fail.state), P.TELEPORT_CONTROL)).toBe(false);
  });

  test('a nymph corpse is a teleportitis candidate now (its only one)', () => {
    const s = room();
    const nymph = defs.monster('nh:water_nymph' as DefId);
    const ctx = scripted(s.ctx, [0, 0]); // rn2(1), then should_givit rn2(10) < level 3
    cpostfxOf(ctx, nymph);
    expect(hasIntrinsic(getPlayer(s.state), P.TELEPORT)).toBe(true);
  });

  test('hallucinating she feels "diffuse."', () => {
    const s = room();
    setIntrinsic(getPlayer(s.state), P.HALLUC, true);
    const ctx = scripted(s.ctx, [0, 0, 1, 0]);
    cpostfxOf(ctx, tenguDef);
    expect(textsOf(ctx.events)).toEqual(['You feel diffuse.']);
  });
});

describe('the quantum mechanic corpse', () => {
  test('toggles intrinsic speed and gives nothing else', () => {
    const s = room();
    const h = getPlayer(s.state);
    setIntrinsic(h, P.FAST, false);
    const qm = defs.monster('nh:quantum_mechanic' as DefId);
    const c1 = cx(s.state);
    cpostfxOf(c1, qm);
    expect(textsOf(c1.events)).toEqual([
      'Your velocity suddenly seems very uncertain!',
      'You seem faster.',
    ]);
    expect(hasIntrinsic(h, P.FAST)).toBe(true);
    const c2 = cx(s.state);
    cpostfxOf(c2, qm);
    expect(textsOf(c2.events)).toEqual([
      'Your velocity suddenly seems very uncertain!',
      'You seem slower.',
    ]);
    expect(hasIntrinsic(h, P.FAST)).toBe(false);
    expect(hasIntrinsic(h, P.TELEPORT)).toBe(false);
  });
});

describe('zombies and mummies leave their race', () => {
  for (const [undead, race] of [
    ['nh:human_zombie', 'nh:human'],
    ['nh:elf_mummy', 'nh:elf'],
    ['nh:giant_zombie', 'nh:giant'],
    ['nh:ettin_zombie', 'nh:ettin'],
  ] as const) {
    test(`a ${undead} leaves a ${race} corpse (searched)`, () => {
      let found: string[] = [];
      for (let seed = 1; seed <= 30 && found.length === 0; seed++) {
        const s = room(seed);
        s.state.turn = 500;
        const id = addMon(s.state, undead, 9, 2);
        monsterDied(cx(s.state), id, true);
        found = itemsAt(defs, s.state, 'dlvl1', 9, 2)
          .filter((e) => e.def === 'nh:corpse')
          .map((e) => e.c.item!.corpseOf!);
      }
      expect(found).toEqual([race]);
    });
  }
});

describe('cannibalism and the domestic-animal penalty', () => {
  test('eating a human corpse: "You cannibal!", Luck -2..-5 and aggravate monster', () => {
    const lost = new Set<number>();
    for (let seed = 1; seed <= 80; seed++) {
      const s = room(seed);
      const corpse = mkcorpse(s.ctx, defs.monster('nh:human' as DefId), {
        carriedBy: s.state.playerId,
      });
      const t = s.text(s.mod('nh:eat', { item: corpse }));
      if (t.includes('Blecch!  Rotten food!')) continue; // a rotten bite may stop the meal first
      expect(t).toContain('You cannibal!  You will regret this!');
      expect(hasIntrinsic(getPlayer(s.state), P.AGGRAVATE_MONSTER)).toBe(true);
      lost.add(-luckOf(s.state));
    }
    expect([...lost].sort()).toEqual([2, 3, 4, 5]);
  });

  test('an elf corpse is not cannibalism for the human hero', () => {
    const s = room();
    const corpse = mkcorpse(s.ctx, defs.monster('nh:elf' as DefId), {
      carriedBy: s.state.playerId,
    });
    const t = s.text(s.mod('nh:eat', { item: corpse }));
    expect(t.join(' ')).not.toContain('cannibal');
    expect(luckOf(s.state)).toBe(0);
  });

  test('a tainted human corpse: "Ulch - that meat was tainted, you cannibal!"', () => {
    const s = room();
    s.state.turn = 5000;
    const corpse = mkcorpse(s.ctx, defs.monster('nh:human' as DefId), {
      carriedBy: s.state.playerId,
    });
    s.state.entities[String(corpse)]!.c.item!.age = 1;
    const t = s.text(s.mod('nh:eat', { item: corpse }));
    expect(t).toContain('Ulch - that meat was tainted, you cannibal!');
    expect(t.join(' ')).not.toContain('You will regret this');
    expect(luckOf(s.state)).toBeLessThan(0);
  });

  test('eating a little dog was a bad idea', () => {
    const s = room();
    const corpse = mkcorpse(s.ctx, defs.monster('nh:little_dog' as DefId), {
      carriedBy: s.state.playerId,
    });
    const t = s.text(s.mod('nh:eat', { item: corpse }));
    expect(t).toContain('You feel that eating the little dog was a bad idea.');
    expect(hasIntrinsic(getPlayer(s.state), P.AGGRAVATE_MONSTER)).toBe(true);
    expect(luckOf(s.state)).toBe(0);
  });
});

describe('giants and ettins', () => {
  /** Gear for `n` fresh monsters of `def`, as def lists. */
  function gear(def: string, n: number): string[][] {
    const out: string[][] = [];
    for (let seed = 1; seed <= n; seed++) {
      const s = room(seed);
      const id = monAt(s, def, 1, 0);
      mInitWeap(cx(s.state), id);
      mInitInv(cx(s.state), id, 5);
      out.push(
        sortedIds(s.state)
          .map((i) => s.state.entities[String(i)]!)
          .filter((e) => e.c.item?.carriedBy === id)
          .map((e) => e.def),
      );
    }
    return out;
  }

  test('an ettin gets a club half the time and never a boulder or gems', () => {
    const g = gear('nh:ettin', 60);
    const clubs = g.filter((d) => d.includes('nh:club')).length;
    expect(clubs).toBeGreaterThan(15);
    expect(clubs).toBeLessThan(45);
    for (const d of g)
      expect(d.filter((x) => x !== 'nh:club' && x !== 'nh:gold_piece')).toEqual([]);
  });

  test('a giant gets a boulder half the time and up to m_lev/2 - 1 stacks of 3..4 gems', () => {
    const g = gear('nh:giant', 60);
    const boulders = g.filter((d) => d.includes('nh:boulder')).length;
    expect(boulders).toBeGreaterThan(15);
    expect(boulders).toBeLessThan(45);
    const isGem = (x: string) => defs.object(x as DefId).class === 'gem' && x !== 'nh:boulder';
    const gemsPer = g.map((d) => d.filter(isGem).length);
    expect(Math.max(...gemsPer)).toBeLessThanOrEqual(2); // rn2(6 / 2)
    expect(gemsPer.some((n) => n > 0)).toBe(true);
  });

  test('a giant gets a two-handed sword or a battle-axe one time in five', () => {
    const g = gear('nh:giant', 60);
    const weapons = g.map((d) => d.filter((x) => defs.object(x as DefId).class === 'weapon'));
    for (const w of weapons) {
      expect(w.length).toBeLessThanOrEqual(1);
      for (const x of w) expect(['nh:two_handed_sword', 'nh:battle_axe']).toContain(x);
    }
    const armed = weapons.filter((w) => w.length > 0).length;
    expect(armed).toBeGreaterThan(3);
    expect(armed).toBeLessThan(25);
  });
});

describe('the gremlin in a rust trap', () => {
  test('split_mon(): a copy with half its HP and half its maximum, "The gremlin multiplies!"', () => {
    const s = room();
    const id = monAt(s, 'nh:gremlin', 9, 2, { hp: 21, max: 30, asleep: false });
    const ctx = cx(s.state);
    const m2 = splitMon(ctx, id, true);
    expect(m2).not.toBeNull();
    expect(ent(s, m2!).c.hp).toEqual({ cur: 10, max: 15 });
    expect(ent(s, id).c.hp).toEqual({ cur: 11, max: 15 });
    expect(textsOf(ctx.events)).toContain('The gremlin multiplies!');
    // a 1-HP gremlin cannot split
    ent(s, id).c.hp = { cur: 1, max: 15 };
    expect(splitMon(ctx, id, true)).toBeNull();
  });
});
