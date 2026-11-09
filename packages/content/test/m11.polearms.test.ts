// m11 step 2: polearms and lances applied at range (apply.c use_pole(), dothrow.c dofire()),
// monsters' pole thrusts (mthrowu.c thrwmu(), weapon.c select_rwep() pwep[]), silver
// (mondata.c hates_silver(), weapon.c dmgval(), uhitm.c hmon_hitmon_msg_silver(), mhitm.c,
// insight.c Hate_silver) and the sprig of wolfsbane and clove of garlic (eat.c).
// Outcomes are asserted: monsters are pinned (speed 0) and rolls rigged or retried.
import {
  createEngine,
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameEvent,
  type Json,
  type Mod,
  type Rng,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { APPLY_ID, FIRE_ID, hatesSilver, selectRwep, thrwmu, vanillaMod } from '../src/index';
import { heroAttack, hitmu } from '../src/combat';
import { dmgval, dmgvalSized } from '../src/dmgval';
import { formHatesSilver } from '../src/silver';
import { enlightenment } from '../src/enlightenment';
import { nhData } from '../src/items';
import { mattackm } from '../src/mhitm';
import { mongets, selectHwep } from '../src/mongear';
import { isFleeing } from '../src/monflee';
import { polymon } from '../src/polyself';
import { P_BASIC, P_SKILLED } from '../src/skills';
import { setUlycn, ulycn } from '../src/werestate';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'pt',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'pt:run',
      labelKey: 'pt',
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

/** A lit 9x5 room, the hero at (5,3). */
const ROOM = [
  '           ',
  ' ......... ',
  ' ......... ',
  ' ....@.... ',
  ' ......... ',
  ' ......... ',
  '           ',
];
type S = ReturnType<typeof levelSetup>;

/** The room, the kit uncursed and the shield off (so two-handed weapons can be wielded). */
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const e of Object.values(s.state.entities))
    if (e?.c.item?.carriedBy === s.state.playerId && e.c.item.equipped === 'shield')
      e.c.item.equipped = null;
  const a = getPlayer(s.state).c.attributes;
  if (a) Object.assign(a, { str: 10, dex: 10 }); // no Str damage bonus
  s.step({ type: 'wait' });
  return s;
}
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(s: S, fn: (ctx: Ctx) => void): string[] {
  probe.fn = fn;
  return textsOf(eng.step(s.state, { type: 'mod', action: 'pt:run' }).events);
}
/** Every to-hit roll hits (rnd() is 1) and every die is at its maximum. */
const rigged = (ctx: Ctx): Ctx => {
  const real = ctx.rng;
  const rng: Rng = {
    next: () => real.next(),
    rnd: () => 1,
    d: (n, sides) => n * sides,
    rn2: (x) => real.rn2(x),
  };
  return { ...ctx, rng };
};
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
/** An awake, unmoving monster at (x, y) with `hp` hit points. */
function foe(s: S, def: string, x: number, y: number, hp = 200): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: false });
  const e = ent(s, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  e.c.monster!.level = defs.monster(def as DefId).level;
  return id;
}
const hpOf = (s: S, id: EntityId): number => ent(s, id)?.c.hp?.cur ?? 0;
/** A new object in the hero's pack, wielded (any other weapon is put away). */
function wield(s: S, id: string): EntityId {
  for (const e of Object.values(s.state.entities))
    if (e?.c.item?.carriedBy === s.state.playerId && e.c.item.equipped === 'weapon')
      e.c.item.equipped = null;
  const o = s.carry(id);
  ent(s, o)!.c.item!.equipped = 'weapon';
  return o;
}
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return eng.step(s.state, { type: 'answer', promptId: p.id, value: value as Json });
};
const apply = (s: S, item: EntityId): StepResult => s.mod(APPLY_ID, { item });
const practice = (s: S, skill: string): number => nhData(s.ctx).skillAdvance?.[skill] ?? 0;
const rel = (s: S, cells: readonly { x: number; y: number }[]): string[] =>
  cells.map((c) => `${c.x - s.here.x},${c.y - s.here.y}`).sort();

describe('the rows', () => {
  test('objects.h: the sprig of wolfsbane and the clove of garlic follow the carrot', () => {
    const ids = defs.objects.map((d) => d.id as string);
    expect(ids.indexOf('nh:sprig_of_wolfsbane')).toBe(ids.indexOf('nh:carrot') + 1);
    expect(ids.indexOf('nh:clove_of_garlic')).toBe(ids.indexOf('nh:carrot') + 2);
    expect(defs.object('nh:clove_of_garlic' as DefId)).toMatchObject({
      class: 'food',
      prob: 7,
      cost: 7,
      weight: 1,
      material: 'veggy',
      food: { nutrition: 40 },
    });
  });
});

describe('applying a polearm (use_pole())', () => {
  test('Apply asks for the spot: at Basic only the four cells two squares straight away', () => {
    const s = room();
    const h = wield(s, 'nh:halberd');
    const j = foe(s, 'nh:jackal', s.here.x + 2, s.here.y);
    const offers = eng.query(s.state).actionsFor({ kind: 'item', id: h });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === APPLY_ID)).toBe(true);
    apply(s, h);
    const p = s.state.pendingPrompt?.prompt;
    expect(p).toMatchObject({ id: 'pole-spot', kind: 'position', key: 'pole.where' });
    expect(rel(s, p?.valid ?? [])).toEqual(['-2,0', '0,-2', '0,2', '2,0']);
    // the cursor starts on the only target in reach
    expect(p?.start).toEqual({ x: s.here.x + 2, y: s.here.y });
    expect(ent(s, j)).toBeDefined();
  });

  test('Skilled reaches the knight-move cells too, Expert the diagonals', () => {
    const s = room();
    const h = wield(s, 'nh:halberd');
    nhData(s.ctx).skills!['polearms'] = P_SKILLED;
    apply(s, h);
    const valid = rel(s, s.state.pendingPrompt?.prompt.valid ?? []);
    expect(valid).toHaveLength(12);
    expect(valid).toContain('2,1');
    expect(valid).toContain('-1,-2');
    expect(valid).not.toContain('2,2');
  });

  test('a monster two squares away is hit through thitmonst(), training the skill', () => {
    const s = room();
    const h = wield(s, 'nh:halberd');
    const j = foe(s, 'nh:jackal', s.here.x + 2, s.here.y);
    const before = practice(s, 'polearms');
    const lines: string[] = [];
    for (let i = 0; i < 80 && practice(s, 'polearms') === before; i++) {
      apply(s, h);
      lines.push(...s.text(answer(s, { x: s.here.x + 2, y: s.here.y })));
    }
    expect(hpOf(s, j)).toBeLessThan(200);
    expect(lines.some((l) => / hits the jackal/.test(l))).toBe(true);
    expect(practice(s, 'polearms')).toBe(before + 1); // a hit for more than 1 trains it
  });

  test('too close, too far and cancelled cost no time', () => {
    const s = room();
    const h = wield(s, 'nh:halberd');
    const turn = s.state.turn;
    apply(s, h);
    expect(s.text(answer(s, { x: s.here.x + 1, y: s.here.y }))).toEqual(['Too close!']);
    apply(s, h);
    expect(s.text(answer(s, { x: s.here.x + 3, y: s.here.y }))).toEqual(['Too far!']);
    apply(s, h);
    expect(s.text(answer(s, null))).toEqual([]);
    expect(s.state.turn).toBe(turn);
  });

  test('an empty spot: "You miss; there is no one there to hit." and the move is used', () => {
    const s = room();
    const h = wield(s, 'nh:halberd');
    const turn = s.state.turn;
    apply(s, h);
    expect(s.text(answer(s, { x: s.here.x, y: s.here.y + 2 }))).toEqual([
      'You miss; there is no one there to hit.',
    ]);
    expect(s.state.turn).toBeGreaterThan(turn);
  });

  test('an unwielded polearm is wielded first; the spot is asked on the next move', () => {
    const s = room();
    const h = s.carry('nh:lance');
    const r = apply(s, h);
    expect(s.text(r).some((l) => /You now wield/.test(l))).toBe(true);
    expect(ent(s, h)!.c.item!.equipped).toBe('weapon');
    expect(s.state.pendingPrompt?.prompt.id).toBe('pole-spot');
  });

  test('a peaceful target asks "Really attack?"; no is no time', () => {
    const s = room();
    const h = wield(s, 'nh:halberd');
    const w = foe(s, 'nh:watchman', s.here.x + 2, s.here.y);
    ent(s, w)!.c.monster!.peaceful = true;
    const turn = s.state.turn;
    apply(s, h);
    answer(s, { x: s.here.x + 2, y: s.here.y });
    expect(s.state.pendingPrompt?.prompt).toMatchObject({ kind: 'yn', key: 'attack.confirm' });
    answer(s, false);
    expect(s.state.turn).toBe(turn);
    expect(ent(s, w)!.c.monster!.peaceful).toBe(true);
  });

  test('`f` with a wielded polearm hits the only target with no prompt', () => {
    const s = room();
    const h = wield(s, 'nh:halberd');
    const offers = eng.query(s.state).actionsFor({ kind: 'item', id: h });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === FIRE_ID)).toBe(true);
    expect(s.text(s.mod(FIRE_ID, { item: h }))).toEqual(["Don't know what to hit."]);
    const j = foe(s, 'nh:jackal', s.here.x, s.here.y - 2);
    const lines: string[] = [];
    for (let i = 0; i < 40 && hpOf(s, j) === 200; i++) {
      lines.push(...s.text(s.mod(FIRE_ID, { item: h })));
      expect(s.state.pendingPrompt).toBeNull();
    }
    expect(hpOf(s, j)).toBeLessThan(200);
    expect(lines.some((l) => / hits the jackal/.test(l))).toBe(true);
  });

  test('bashing with a polearm next to a monster does 1-2 and trains nothing', () => {
    const s = room();
    wield(s, 'nh:halberd');
    const j = foe(s, 'nh:jackal', s.here.x + 1, s.here.y);
    const before = practice(s, 'polearms');
    run(s, (ctx) => heroAttack(rigged(ctx), j));
    expect(hpOf(s, j)).toBe(199); // rnd(2) rigged to 1, no Str bonus
    expect(practice(s, 'polearms')).toBe(before);
    const k = foe(s, 'nh:jackal', s.here.x - 1, s.here.y);
    wield(s, 'nh:long_sword');
    run(s, (ctx) => heroAttack(rigged(ctx), k));
    expect(hpOf(s, k)).toBeLessThan(199); // a melee weapon does its dmgval()
  });
});

describe("monsters' polearms (thrwmu())", () => {
  const clear = (): boolean => true;
  /** A soldier at (dx, 0) from her with a halberd (wielded unless `carried`). */
  function soldier(s: S, dx: number, item = 'nh:halberd', carried = false): EntityId {
    const id = foe(s, 'nh:soldier', s.here.x + dx, s.here.y);
    const o = mongets(s.ctx as unknown as Ctx, id, item)!;
    if (!carried) ent(s, o)!.c.item!.equipped = 'weapon';
    return id;
  }

  test('a soldier thrusts its halberd from two squares and can hit her', () => {
    const s = room();
    const id = soldier(s, 2);
    const hp0 = getPlayer(s.state).c.hp!.cur;
    const lines: string[] = [];
    for (let i = 0; i < 30 && getPlayer(s.state).c.hp!.cur === hp0; i++)
      lines.push(...run(s, (ctx) => thrwmu(ctx, id, clear, null)));
    expect(lines[0]).toMatch(/^The soldier thrusts an? .+\.$/);
    expect(getPlayer(s.state).c.hp!.cur).toBeLessThan(hp0);
  });

  test('out of pole range (three squares) it does not thrust', () => {
    const s = room();
    const id = soldier(s, 3);
    expect(run(s, (ctx) => thrwmu(ctx, id, clear, null))).toEqual([]);
  });

  test('a carried polearm is wielded first when she is in pole range', () => {
    const s = room();
    const id = soldier(s, 2, 'nh:halberd', true);
    const lines = run(s, (ctx) => {
      expect(thrwmu(ctx, id, clear, null)).toBe(true);
    });
    expect(lines.some((l) => /^The soldier wields .+!$/.test(l))).toBe(true);
  });

  test('select_rwep(): polearms only in range; weak monsters skip two-handed ones', () => {
    const s = room();
    const ctx = s.ctx as unknown as Ctx;
    const sol = soldier(s, 2, 'nh:halberd', true);
    expect(selectRwep(ctx, sol, true).obj?.def).toBe('nh:halberd');
    expect(selectRwep(ctx, sol, false).obj).toBeNull();
    const gnome = foe(s, 'nh:gnome', 1, 1);
    mongets(ctx, gnome, 'nh:halberd');
    expect(selectRwep(ctx, gnome, true).obj).toBeNull();
    mongets(ctx, gnome, 'nh:lance');
    expect(selectRwep(ctx, gnome, true)).toMatchObject({ obj: { def: 'nh:lance' } });
  });
});

describe('silver', () => {
  test('hates_silver(): were creatures, demons, imps but the tengu', () => {
    const h = (id: string): boolean => hatesSilver(defs.monster(id as DefId));
    expect(h('nh:werejackal')).toBe(true);
    expect(h('nh:human_werejackal')).toBe(true);
    expect(h('nh:imp')).toBe(true);
    expect(h('nh:tengu')).toBe(false);
    expect(h('nh:jackal')).toBe(false);
    expect(h('nh:soldier')).toBe(false);
  });

  test('dmgval(): a silver saber does d8 to a jackal, d8 + d20 to an imp', () => {
    const s = room();
    const o = s.carry('nh:silver_saber');
    const e = ent(s, o)!;
    const odef = defs.object('nh:silver_saber' as DefId);
    const span = (mon: string): [number, number] => {
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < 3000; i++) {
        const d = dmgval(s.ctx.rng, e, odef, defs.monster(mon as DefId));
        lo = Math.min(lo, d);
        hi = Math.max(hi, d);
      }
      return [lo, hi];
    };
    expect(span('nh:jackal')).toEqual([1, 8]);
    expect(span('nh:imp')).toEqual([2, 28]);
  });

  test('her silver saber sears an imp: the line follows the hit, precedes the kill', () => {
    const s = room();
    wield(s, 'nh:silver_saber');
    nhData(s.ctx).skills!['saber'] = P_BASIC; // no Unskilled to-hit and damage penalties
    const imp = foe(s, 'nh:imp', s.here.x + 1, s.here.y, 100);
    const lines = run(s, (ctx) => heroAttack(rigged(ctx), imp));
    expect(lines).toEqual(['You hit the imp!', "Your silver saber sears the imp's flesh!"]);
    expect(hpOf(s, imp)).toBe(100 - (8 + 1)); // d8 at max, rnd(20) rigged to 1
    ent(s, imp)!.c.hp!.cur = 1;
    expect(run(s, (ctx) => heroAttack(rigged(ctx), imp))).toEqual([
      "Your silver saber sears the imp's flesh!",
      'You kill the imp!',
    ]);
  });

  test('bare-handed, a silver ring sears a silver-hater', () => {
    const s = room();
    for (const e of Object.values(s.state.entities))
      if (e?.c.item?.carriedBy === s.state.playerId && e.c.item.equipped === 'weapon')
        e.c.item.equipped = null;
    const r = s.carry('nh:ring_of_teleportation');
    ent(s, r)!.c.item!.equipped = 'ringL';
    const imp = foe(s, 'nh:imp', s.here.x + 1, s.here.y, 100);
    const lines = run(s, (ctx) => heroAttack(rigged(ctx), imp));
    expect(lines).toContain("Your silver ring sears the imp's flesh!");
    const jackal = foe(s, 'nh:jackal', s.here.x - 1, s.here.y, 100);
    expect(run(s, (ctx) => heroAttack(rigged(ctx), jackal)).join(' ')).not.toMatch(/sears/);
  });

  test("a monster's silver weapon sears a lycanthrope; the d20 needs a silver-hating form", () => {
    const s = room();
    const sol = foe(s, 'nh:soldier', s.here.x + 1, s.here.y);
    const sab = mongets(s.ctx as unknown as Ctx, sol, 'nh:silver_saber')!;
    const atk = defs.monster('nh:soldier' as DefId).attacks[0]!;
    run(s, (ctx) => setUlycn(ctx, 'nh:werejackal' as DefId));
    const hp0 = getPlayer(s.state).c.hp!.cur;
    const lines = run(s, (ctx) => {
      hitmu(rigged(ctx), ent(s, sol)!, atk, ent(s, sab)!, false, 10);
    });
    expect(lines).toContain('The silver sears your flesh!');
    expect(hp0 - getPlayer(s.state).c.hp!.cur).toBe(8 + 8); // d8 + the saber's d8: no d20
    // her own form is no silver-hater; a werejackal form is (mon_hates_silver(&youmonst))
    const saberDmg = (): number => {
      let d = 0;
      run(s, (ctx) => {
        d = dmgvalSized(
          rigged(ctx).rng,
          ent(s, sab)!,
          defs.object('nh:silver_saber' as DefId),
          false,
          formHatesSilver(ctx),
        );
      });
      return d;
    };
    expect(saberDmg()).toBe(8);
    run(s, (ctx) => polymon(ctx, 'nh:werejackal' as DefId, false));
    expect(saberDmg()).toBe(8 + 1);
  });

  test("a monster's silver saber sears an imp", () => {
    const s = room();
    const sol = foe(s, 'nh:soldier', 3, 3);
    const sab = mongets(s.ctx as unknown as Ctx, sol, 'nh:silver_saber')!;
    ent(s, sab)!.c.item!.equipped = 'weapon';
    const imp = foe(s, 'nh:imp', 4, 3, 100);
    const lines: string[] = [];
    for (let i = 0; i < 30 && hpOf(s, imp) === 100; i++)
      lines.push(...run(s, (ctx) => void mattackm(ctx, sol, imp)));
    expect(lines).toContain("The soldier's silver saber sears the imp's flesh!");
  });

  test('a silver-hater wields no silver: a human werejackal takes the mace', () => {
    const s = room();
    const ctx = s.ctx as unknown as Ctx;
    const w = foe(s, 'nh:human_werejackal', 2, 2);
    mongets(ctx, w, 'nh:mace');
    mongets(ctx, w, 'nh:silver_mace');
    expect(selectHwep(ctx, w)?.def).toBe('nh:mace');
  });

  test('enlightenment: "You are harmed by silver." for a lycanthrope', () => {
    const s = room();
    const has = (): boolean => {
      let out: string[] = [];
      run(s, (ctx) => {
        out = enlightenment(ctx).map((m) => render(m));
      });
      return out.includes('You are harmed by silver.');
    };
    expect(has()).toBe(false);
    run(s, (ctx) => setUlycn(ctx, 'nh:werejackal' as DefId));
    expect(has()).toBe(true);
  });
});

describe('wolfsbane and garlic', () => {
  test('eating a sprig of wolfsbane cures lycanthropy', () => {
    const s = room();
    run(s, (ctx) => setUlycn(ctx, 'nh:werejackal' as DefId));
    const sprig = s.carry('nh:sprig_of_wolfsbane');
    const lines = s.text(s.mod('nh:eat', { item: sprig }));
    expect(lines).toContain('You feel purified.');
    expect(ulycn(s.state)).toBeNull();
  });

  test('eating garlic scares the monsters close by that can smell', () => {
    const s = room();
    const jackal = foe(s, 'nh:jackal', s.here.x + 1, s.here.y);
    const lichen = foe(s, 'nh:lichen', s.here.x - 1, s.here.y);
    const far = foe(s, 'nh:jackal', s.here.x + 3, s.here.y);
    const garlic = s.carry('nh:clove_of_garlic');
    s.mod('nh:eat', { item: garlic });
    expect(isFleeing({ state: s.state }, jackal)).toBe(true);
    expect(isFleeing({ state: s.state }, lichen)).toBe(false);
    expect(isFleeing({ state: s.state }, far)).toBe(false);
  });
});
