// m7d step 6: the wands of wishing, death and cancellation; `mcan` on monsters (attacks,
// passives, spells); cancel_item() per class; a wand of cancellation blowing up a bag of holding.
// Outcomes are asserted; where a roll decides (to-hit, resist), seeds are searched.
import {
  createEngine,
  getPlayer,
  type Ctx,
  type EntityId,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  P,
  WAN,
  WAND_CLASSES,
  isKnown,
  shuffleAll,
  updateWornProps,
  vanillaMod,
} from '../src/index';
import { castmu } from '../src/mcastu';
import { mgcAtkNegated } from '../src/mhitu';
import { isCancelled, setCancelled } from '../src/mstate';
import { setU } from '../src/luck';
import { setIntrinsic } from '../src/props';
import { addMon } from './helpers';
import { ctxFor, defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

/** Wands are known by name here (their appearances are dropped). */
function make(rows: string[], seed = 1): S {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  for (const d of defs.objects) if (d.class === 'wand') delete s.state.appearances[d.id];
  for (const k of Object.keys(s.state.entities))
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  s.step({ type: 'wait' }); // vision for the new level
  return s;
}
const hero = (s: S) => getPlayer(s.state);
function wand(s: S, id: string, spe = 5): EntityId {
  const e = s.carry(id);
  itemOf(s.state, e).spe = spe;
  return e;
}
const textOf = (r: StepResult): string[] =>
  r.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
/** Zaps the wand; directional wands get `dir`. All messages of the zap, rendered. */
function zap(s: S, id: EntityId, dir?: string): string[] {
  const out = s.text(s.mod('nh:zap', { item: id }));
  if (!s.state.pendingPrompt) return out;
  return [...out, ...textOf(answer(s, dir ?? null))];
}
/** A pinned monster (speed 0) with `hp` hit points. */
function pinned(s: S, def: string, x: number, y: number, hp = 100): EntityId {
  const m = addMon(s.state, def, x, y);
  const e = s.state.entities[String(m)]!;
  e.c.hp = { cur: hp, max: hp };
  e.c.actor!.speed = 0;
  return m;
}
const wear = (s: S, id: EntityId, slot: 'amulet' | 'ringL'): void => {
  itemOf(s.state, id).equipped = slot;
  updateWornProps(s.state, defs, s.state.playerId);
};

describe('wand of wishing', () => {
  test('zapping asks for a wish; the object is held and the wand is learned', () => {
    const s = make(['@....']);
    shuffleAll(ctxFor(s.state), WAND_CLASSES);
    expect(isKnown(s.state, defs, WAN.wishing)).toBe(false);
    const w = wand(s, WAN.wishing, 1);
    const turn = s.state.turn;
    const out = s.text(s.mod('nh:zap', { item: w }));
    expect(out).toEqual([]);
    expect(s.state.pendingPrompt?.prompt.key).toBe('wish.prompt');
    expect(s.state.turn).toBe(turn); // the move is spent when the wish is answered
    const r = answer(s, 'blessed scroll of blank paper');
    expect(s.state.pendingPrompt).toBeNull();
    expect(s.state.turn).toBeGreaterThan(turn);
    const got = Object.values(s.state.entities).find(
      (e) => e.def === 'nh:scroll_of_blank_paper' && e.c.item?.carriedBy === s.state.playerId,
    );
    expect(got?.c.item?.buc).toBe('blessed');
    expect(textOf(r).some((t) => t.includes('scroll'))).toBe(true);
    expect(isKnown(s.state, defs, WAN.wishing)).toBe(true);
    expect(itemOf(s.state, w).spe).toBe(0);
  });

  test('an unknown name asks again; the last charge wrested turns the wand to dust after', () => {
    const s = make(['@....']);
    const w = wand(s, WAN.wishing, 0);
    // wrest the last charge: search the draws for it
    let tries = 0;
    while (!s.state.pendingPrompt && tries++ < 3000) s.mod('nh:zap', { item: w });
    expect(s.state.pendingPrompt?.prompt.key).toBe('wish.prompt');
    expect(textOf(answer(s, 'xyzzy plugh'))).toContain(
      'Nothing fitting that description exists in the game.',
    );
    expect(s.state.pendingPrompt?.prompt.key).toBe('wish.prompt');
    const r = answer(s, 'nothing');
    expect(s.state.pendingPrompt).toBeNull();
    expect(textOf(r)).toContain('The wand of wishing turns to dust.');
    expect(s.state.entities[String(w)]).toBeUndefined();
  });

  test('with bad Luck: "Unfortunately, nothing happens." and the wand is not learned', () => {
    const s = make(['@....']);
    shuffleAll(ctxFor(s.state), WAND_CLASSES);
    setU(s.ctx, { luck: -10 });
    const w = wand(s, WAN.wishing, 3);
    expect(s.text(s.mod('nh:zap', { item: w }))).toEqual(['Unfortunately, nothing happens.']);
    expect(s.state.pendingPrompt).toBeNull();
    expect(itemOf(s.state, w).spe).toBe(2);
    expect(isKnown(s.state, defs, WAN.wishing)).toBe(false);
  });
});

describe('wand of death', () => {
  test('the death ray kills a living monster it hits; a zombie only takes the hit', () => {
    let kills = 0;
    let zombies = 0;
    for (let seed = 1; seed <= 40 && (kills < 2 || zombies < 2); seed++) {
      const s = make(['@.....'], seed);
      const j = pinned(s, 'nh:jackal', 2, 0, 1000);
      const out = zap(s, wand(s, WAN.death), 'e');
      if (out.includes('You kill the jackal!')) {
        kills++;
        expect(s.state.entities[String(j)]?.c.monster).toBeUndefined();
        expect(isKnown(s.state, defs, WAN.death)).toBe(true);
      }
      const t = make(['@.....'], seed);
      const z = pinned(t, 'nh:kobold_zombie', 2, 0, 50);
      const zout = zap(t, wand(t, WAN.death), 'e');
      expect(zout.some((x) => x.startsWith('You destroy'))).toBe(false);
      if (zout.includes('The death ray hits the kobold zombie.')) {
        zombies++;
        expect(t.state.entities[String(z)]?.c.hp?.cur).toBe(50);
      }
    }
    expect(kills).toBeGreaterThan(0);
    expect(zombies).toBeGreaterThan(0);
  });

  test('bounced back at the zapper it kills her: "killed by a death ray"', () => {
    let deaths = 0;
    for (let seed = 1; seed <= 40 && deaths < 1; seed++) {
      const s = make(['@..'], seed);
      const out = zap(s, wand(s, WAN.death), 'e');
      if (!out.includes('The death ray hits you!')) continue;
      deaths++;
      expect(s.state.gameOver?.kind).toBe('died');
      expect(s.state.gameOver?.killer).toBe('@killer.ray.death');
      expect(render({ key: 'killer.ray.death' })).toBe('a death ray');
    }
    expect(deaths).toBe(1);
  });

  test('an amulet of reflection sends it back; magic resistance shrugs it off', () => {
    let reflected = 0;
    let resisted = 0;
    for (let seed = 1; seed <= 40 && (reflected < 1 || resisted < 1); seed++) {
      const s = make(['@..'], seed);
      wear(s, s.carry('nh:amulet_of_reflection'), 'amulet');
      const out = zap(s, wand(s, WAN.death), 'e');
      if (out.includes('The death ray hits you!')) {
        reflected++;
        expect(out).toContain('But it reflects from your medallion!');
        expect(s.state.gameOver).toBeNull();
      }
      const t = make(['@..'], seed);
      setIntrinsic(hero(t), P.ANTIMAGIC, true);
      const tout = zap(t, wand(t, WAN.death), 'e');
      if (tout.includes('The death ray hits you!')) {
        resisted++;
        expect(tout).toContain("You aren't affected.");
        expect(t.state.gameOver).toBeNull();
      }
    }
    expect(reflected).toBeGreaterThan(0);
    expect(resisted).toBeGreaterThan(0);
  });

  test('zapped at herself: "You irradiate yourself with pure energy!" and she dies', () => {
    const s = make(['@..']);
    const out = zap(s, wand(s, WAN.death), 'self');
    expect(out).toEqual(['You irradiate yourself with pure energy!', 'You die.']);
    expect(s.state.gameOver?.killer).toBe('!@killer.zap.self.death');
    expect(render({ key: 'killer.zap.self.death' })).toBe('shot herself with a death ray');
    // an amulet of life saving brings her back
    const t = make(['@..']);
    wear(t, t.carry('nh:amulet_of_life_saving'), 'amulet');
    const tout = zap(t, wand(t, WAN.death), 'self');
    expect(tout).toContain('You die.');
    expect(t.state.gameOver).toBeNull();
    expect(isKnown(t.state, defs, WAN.death)).toBe(true);
  });
});

describe('wand of cancellation', () => {
  test('a monster that fails to resist is cancelled (probing shows it)', () => {
    let cancelled = 0;
    let resisted = 0;
    // resist(): rn2(100 + 12 - 1) < mr, about 1 time in 11
    for (let seed = 1; seed <= 200 && (cancelled < 1 || resisted < 1); seed++) {
      const s = make(['@.....'], seed);
      const m = pinned(s, 'nh:kobold_shaman', 2, 0); // mr 10
      zap(s, wand(s, WAN.cancellation), 'e');
      if (!isCancelled(s.ctx, m)) {
        resisted++;
        continue;
      }
      cancelled++;
      const probe = zap(s, wand(s, WAN.probing), 'e');
      expect(probe.some((t) => t.includes(', cancelled'))).toBe(true);
    }
    expect(cancelled).toBeGreaterThan(0);
    expect(resisted).toBeGreaterThan(0);
  });

  test("a cancelled floating eye's passive gaze no longer paralyzes", () => {
    const s = make(['@.']);
    const eye = pinned(s, 'nh:floating_eye', 1, 0, 100000);
    setCancelled(s.ctx, eye);
    let hits = 0;
    for (let i = 0; i < 60 && !s.state.gameOver; i++) {
      const out = s.text(s.step({ type: 'move', dir: 'e' }));
      if (out.some((t) => t.startsWith('You hit'))) hits++;
      expect(out.some((t) => t.includes('frozen'))).toBe(false);
      expect(hero(s).c.helpless).toBeUndefined();
    }
    expect(hits).toBeGreaterThan(10);
  });

  test("a cancelled monster's special attacks are always negated, with no roll", () => {
    const s = make(['@.']);
    const m = pinned(s, 'nh:jackal', 1, 0);
    setCancelled(s.ctx, m);
    const mon = s.state.entities[String(m)]!;
    const before = JSON.stringify(s.state.rng);
    // (a cancelled attacker returns before touching anything but the state)
    expect(mgcAtkNegated(s.ctx as unknown as Ctx, mon, true)).toBe(true);
    expect(JSON.stringify(s.state.rng)).toBe(before);
  });

  test('a cancelled caster cannot cast: it points and curses', () => {
    const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
    const probeMod: Mod = {
      id: 'w-probe',
      version: '1',
      register(api) {
        api.defineAction({
          id: 'w-probe:run',
          labelKey: 'w-probe',
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
    const s = make(['.......', '...@...', '.......']);
    const id = pinned(s, 'nh:kobold_shaman', 4, 1);
    s.state.entities[String(id)]!.c.monster!.level = 5;
    setCancelled(s.ctx, id);
    const atk = defs.monster('nh:kobold_shaman' as never).attacks[0]!;
    for (let k = 0; k < 30; k++) {
      const st: GameState = structuredClone(s.state);
      let cast = true;
      probe.fn = (ctx) => {
        for (let i = 0; i < k; i++) ctx.rng.rn2(2);
        cast = castmu(ctx, id, atk, true, true);
      };
      const r = eng.step(st, { type: 'mod', action: 'w-probe:run' });
      expect(cast).toBe(false);
      expect(textOf(r)).toHaveLength(1);
      expect(textOf(r)[0]).toMatch(/^The kobold shaman points (at you|all around), then curses\.$/);
      expect(getPlayer(st).c.hp?.cur).toBe(500);
    }
  });

  test('zapped at herself, her whole inventory is cancelled, class by class', () => {
    const s = make(['@....']);
    const str0 = hero(s).c.attributes!.str;
    const ring = s.carry('nh:ring_of_gain_strength');
    itemOf(s.state, ring).spe = 3;
    s.mod('nh:puton', { item: ring });
    if (s.state.pendingPrompt) answer(s, 'l');
    expect(itemOf(s.state, ring).equipped).not.toBeNull();
    expect(hero(s).c.attributes!.str).toBe(str0 + 3);
    const other = wand(s, WAN.striking, 4);
    const sword = s.carry('nh:long_sword');
    Object.assign(itemOf(s.state, sword), { spe: 2, buc: 'blessed' });
    const dagger = s.carry('nh:dagger');
    itemOf(s.state, dagger).buc = 'cursed'; // +0, not magic: only uncursed
    const mail = s.carry('nh:ring_mail');
    itemOf(s.state, mail).spe = -1;
    const scroll = s.carry('nh:scroll_of_enchant_armor');
    const book = s.carry('nh:spellbook_of_force_bolt');
    const potion = s.carry('nh:potion_of_healing');
    const holy = s.carry('nh:potion_of_water');
    itemOf(s.state, holy).buc = 'blessed';
    const seeInv = s.carry('nh:potion_of_see_invisible');
    const canc = wand(s, WAN.cancellation, 4);
    zap(s, canc, 'self');
    const def = (id: EntityId) => s.state.entities[String(id)]!.def;
    expect(itemOf(s.state, ring).spe).toBe(0);
    expect(hero(s).c.attributes!.str).toBe(str0);
    expect(itemOf(s.state, other).spe).toBe(-1);
    expect(itemOf(s.state, canc).spe).toBe(3); // can't cancel cancellation
    expect(itemOf(s.state, sword)).toMatchObject({ spe: 0, buc: 'uncursed' });
    expect(itemOf(s.state, dagger)).toMatchObject({ spe: 0, buc: 'uncursed' });
    expect(itemOf(s.state, mail).spe).toBe(0);
    expect(def(scroll)).toBe('nh:scroll_of_blank_paper');
    expect(def(book)).toBe('nh:spellbook_of_blank_paper');
    expect(def(potion)).toBe('nh:potion_of_water');
    expect(itemOf(s.state, holy).buc).toBe('uncursed');
    expect(def(seeInv)).toBe('nh:potion_of_water'); // no fruit juice in the subset
  });

  test('a floor object in the beam is cancelled', () => {
    const s = make(['@....']);
    const sc = s.give('nh:scroll_of_enchant_armor', { at: { level: 'dlvl1', x: 2, y: 0 } });
    zap(s, wand(s, WAN.cancellation), 'e');
    expect(s.state.entities[String(sc)]?.def).toBe('nh:scroll_of_blank_paper');
  });

  test('a charged wand of cancellation put into a bag of holding blows it up', () => {
    const s = make(['@....']);
    const bag = s.carry('nh:bag_of_holding');
    const w = wand(s, WAN.cancellation, 2);
    const hp0 = hero(s).c.hp!.cur;
    s.mod('nh:apply', { item: bag });
    answer(s, 'i');
    const r = answer(s, [w]);
    expect(textOf(r)[0]).toMatch(/^As you put .* inside, you are blasted by a magical explosion!$/);
    expect(s.state.entities[String(bag)]).toBeUndefined();
    expect(s.state.entities[String(w)]).toBeUndefined();
    expect(hero(s).c.hp!.cur).toBeLessThan(hp0);
    // an empty one goes in quietly
    const t = make(['@....']);
    const bag2 = t.carry('nh:bag_of_holding');
    const w2 = wand(t, WAN.cancellation, 0);
    t.mod('nh:apply', { item: bag2 });
    answer(t, 'i');
    answer(t, [w2]);
    expect(itemOf(t.state, w2).containedIn).toBe(bag2);
  });
});
