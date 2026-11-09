// m11 step 3: armor I and the mercenary kit. The 32 armor rows, K- and C-rations and the bugle;
// the shuffled helmet, cloak and boots ranges (o_init.c shuffle_all()); wearing them (do_wear.c
// Cloak_on(), Boots_on(), toggle_stealth(); the alchemy smock's acid resistance, drain
// resistance, reflection from a shield); mercenary and priest gear (makemon.c m_initinv());
// the bugle (music.c do_improvisation(), awaken_soldiers()); reading shirts (read.c doread()).
// Outcomes are asserted: monsters are pinned (speed 0).
import { getPlayer, sortedIds, type Ctx, type DefId, type EntityId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { APPLY_ID, magicNegation } from '../src/index';
import { enlightenment } from '../src/enlightenment';
import { mInitInv, mInitWeap } from '../src/mongear';
import { ARMOR_RANGES, isKnown } from '../src/o_init';
import { P, hasProp, setIntrinsic, setItimeout } from '../src/props';
import { ureflects } from '../src/reflect';
import { findAc } from '../src/stats';
import { SHIRT_COUNTS } from '../src/shirt';
import { shirtMessagesEn } from '../src/shirt.en';
import { addMon } from './helpers';
import { ctxFor, defs, engine, levelSetup, plainKit, render } from './itemHelpers';

/** A lit 15x5 room, the hero at (7,2). */
const ROOM = [
  '...............',
  '...............',
  '.......@.......',
  '...............',
  '...............',
];
type S = ReturnType<typeof levelSetup>;

/** The room, the kit uncursed and nothing worn but what the test puts on. */
function room(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const id of sortedIds(s.state)) {
    const it = s.state.entities[String(id)]?.c.item;
    if (it?.carriedBy === s.state.playerId && it.equipped !== 'weapon') it.equipped = null;
  }
  s.step({ type: 'wait' });
  return s;
}
const wear = (s: S, item: EntityId): string[] => s.text(s.mod('nh:wear', { item }));
const takeoff = (s: S, item: EntityId): string[] => s.text(s.mod('nh:takeoff', { item }));
const enl = (s: S): string[] => enlightenment(s.ctx as unknown as Ctx).map((m) => render(m));
/** A sleeping, unmoving monster at (x, y). */
function sleeper(s: S, def: string, x: number, y: number, peaceful = false): EntityId {
  const id = addMon(s.state, def, x, y, { asleep: true, peaceful });
  const e = s.state.entities[String(id)]!;
  e.c.actor!.speed = 0;
  e.c.monster!.level = defs.monster(def as DefId).level;
  return id;
}
const carried = (s: S, id: EntityId): string[] =>
  sortedIds(s.state)
    .map((i) => s.state.entities[String(i)]!)
    .filter((e) => e.c.item?.carriedBy === id)
    .map((e) => e.def);

describe('the rows', () => {
  test('objects.h neighbours, the rations and the bugle', () => {
    const ids = defs.objects.map((d) => d.id as string);
    expect(ids.indexOf('nh:banded_mail')).toBe(ids.indexOf('nh:elven_mithril_coat') - 1);
    expect(ids.indexOf('nh:bugle')).toBe(ids.indexOf('nh:magic_whistle') + 1);
    expect(ids.indexOf('nh:c_ration')).toBe(ids.indexOf('nh:k_ration') + 1);
    expect(defs.object('nh:plate_mail' as DefId)).toMatchObject({
      prob: 40,
      weight: 450,
      armor: { slot: 'body', ac: 7, mc: 2 },
    });
    expect(defs.object('nh:k_ration' as DefId)).toMatchObject({
      prob: 0,
      delay: 1,
      food: { nutrition: 400 },
    });
    expect(defs.object('nh:shield_of_drain_resistance' as DefId).prop).toBe(P.DRAIN_RES);
    expect(render({ key: 'nh:plate_mail.plural' })).toBe('plate mail');
    expect(render({ key: 'nh:low_boots.desc' })).toBe('pair of walking shoes');
  });

  test('a new game shuffles the helmets, gloves, cloaks and boots within their ranges', () => {
    const seen = new Set<string>();
    const gloves = new Set<string>();
    for (let seed = 1; seed <= 8; seed++) {
      const { state } = engine.newGame({ seed });
      for (const r of ARMOR_RANGES) {
        const got = r.objs
          .filter((id) => defs.isObject(id))
          .map((id) => state.appearances[id] as string);
        for (const a of got) expect(r.looks).toContain(a);
        expect(new Set(got).size).toBe(got.length);
        expect(isKnown(state, defs, 'nh:helmet' as DefId)).toBe(false);
      }
      seen.add(state.appearances['nh:jumping_boots'] as string);
      gloves.add(state.appearances['nh:leather_gloves'] as string);
    }
    expect(seen.size).toBeGreaterThan(1);
    // the gloves shuffle too, now that the three gauntlets exist
    expect(gloves.size).toBeGreaterThan(1);
  });
});

describe('wearing the new armor', () => {
  test('plate mail: its AC; elven boots: stealth with the C lines, learned', () => {
    const s = room();
    const ac0 = findAc(s.state, defs, s.state.playerId);
    const mail = s.carry('nh:plate_mail');
    wear(s, mail);
    expect(findAc(s.state, defs, s.state.playerId)).toBe(ac0 - 7);
    const boots = s.carry('nh:elven_boots');
    expect(wear(s, boots)).toContain('You walk very quietly.');
    expect(hasProp(getPlayer(s.state), P.STEALTH)).toBe(true);
    expect(isKnown(s.state, defs, 'nh:elven_boots' as DefId)).toBe(true);
    expect(takeoff(s, boots)).toContain('You sure are noisy.');
    expect(hasProp(getPlayer(s.state), P.STEALTH)).toBe(false);
  });

  test('an elven cloak says nothing when she is stealthy already', () => {
    const s = room();
    const cloak = s.carry('nh:elven_cloak');
    expect(wear(s, cloak)).toContain('You move very quietly.');
    takeoff(s, cloak);
    setIntrinsic(getPlayer(s.state), P.STEALTH, true);
    expect(wear(s, cloak)).not.toContain('You move very quietly.');
  });

  test('a cloak of protection is learned when worn and gives MC 3', () => {
    const s = room();
    const cloak = s.carry('nh:cloak_of_protection');
    expect(isKnown(s.state, defs, 'nh:cloak_of_protection' as DefId)).toBe(false);
    wear(s, cloak);
    expect(isKnown(s.state, defs, 'nh:cloak_of_protection' as DefId)).toBe(true);
    expect(magicNegation(s.ctx as unknown as Ctx)).toBe(3);
    // a monster wearing one has its Protection too
    const m = sleeper(s, 'nh:gnome_lord', 2, 2);
    const c = s.carry('nh:cloak_of_protection');
    Object.assign(s.state.entities[String(c)]!.c.item!, { carriedBy: m, equipped: 'cloak' });
    expect(magicNegation(s.ctx as unknown as Ctx, m)).toBe(3);
  });

  test('the alchemy smock: poison and acid resistance; a helm of telepathy: telepathic', () => {
    const s = room();
    wear(s, s.carry('nh:alchemy_smock'));
    const h = getPlayer(s.state);
    expect(hasProp(h, P.POISON_RES)).toBe(true);
    expect(hasProp(h, P.ACID_RES)).toBe(true);
    wear(s, s.carry('nh:helm_of_telepathy'));
    expect(enl(s)).toContain('You are telepathic.');
  });

  test('the shield of drain resistance: enlightenment, and no level drained', () => {
    const s = room();
    expect(enl(s)).not.toContain('You are level-drain resistant.');
    wear(s, s.carry('nh:shield_of_drain_resistance'));
    expect(enl(s)).toContain('You are level-drain resistant.');
  });

  test('the shield of reflection reflects first and is learned by it', () => {
    const s = room();
    const shield = s.carry('nh:shield_of_reflection');
    wear(s, shield);
    const events: string[] = [];
    const ctx = {
      ...(s.ctx as unknown as Ctx),
      emit: (e: { type: string; key?: string; params?: object }) => {
        if (e.type === 'msg')
          events.push(render({ key: e.key!, params: (e.params ?? {}) as never }));
      },
    } as unknown as Ctx;
    expect(ureflects(ctx, 'zap.ray.reflects')).toBe(true);
    expect(events).toEqual(['But it reflects from your shield!']);
    expect(isKnown(s.state, defs, 'nh:shield_of_reflection' as DefId)).toBe(true);
  });
});

describe('mercenary and priest gear (m_initinv)', () => {
  function gear(def: string, n: number): string[][] {
    const out: string[][] = [];
    for (let seed = 1; seed <= n; seed++) {
      const s = room(seed);
      const id = sleeper(s, def, 1, 1);
      mInitWeap(ctxFor(s.state), id);
      mInitInv(ctxFor(s.state), id, 5);
      out.push(carried(s, id));
    }
    return out;
  }
  const some = (g: string[][], id: string): boolean => g.some((d) => d.includes(id));

  test('a watch captain in plate mail, a sergeant in splint or banded mail', () => {
    const captain = gear('nh:watch_captain', 30);
    expect(some(captain, 'nh:plate_mail')).toBe(true);
    for (const d of captain) expect(d.includes('nh:tin_whistle')).toBe(false);
    const sergeant = gear('nh:sergeant', 30);
    expect(some(sergeant, 'nh:splint_mail') || some(sergeant, 'nh:banded_mail')).toBe(true);
    expect(some(sergeant, 'nh:bugle')).toBe(true);
  });

  test('soldiers carry rations and helmets, never a bugle; watchmen a tin whistle', () => {
    const soldier = gear('nh:soldier', 30);
    expect(some(soldier, 'nh:k_ration')).toBe(true);
    expect(some(soldier, 'nh:c_ration')).toBe(true);
    expect(some(soldier, 'nh:helmet')).toBe(true);
    for (const d of soldier) expect(d.includes('nh:bugle')).toBe(false);
    expect(some(gear('nh:watchman', 20), 'nh:tin_whistle')).toBe(true);
  });
});

describe('the bugle', () => {
  test('a soldier anywhere on the level is woken and made hostile; a near jackal wakes', () => {
    const s = room();
    const soldier = sleeper(s, 'nh:soldier', 14, 4, true);
    const jackal = sleeper(s, 'nh:jackal', 9, 2);
    const bugle = s.carry('nh:bugle');
    const out = s.text(s.mod(APPLY_ID, { item: bugle }));
    expect(out).toContain('You extract a loud noise from your bugle.');
    expect(out).toContain('The soldier is now ready for battle!');
    const m = s.state.entities[String(soldier)]!.c.monster!;
    expect(m.asleep).toBe(false);
    expect(m.peaceful).toBe(false);
    expect(s.state.entities[String(jackal)]!.c.monster!.asleep).toBe(false);
  });

  test('a strangled hero cannot play it', () => {
    const s = room();
    setItimeout(s.state, getPlayer(s.state), P.STRANGLED, 5);
    const bugle = s.carry('nh:bugle');
    expect(s.text(s.mod(APPLY_ID, { item: bugle }))).toContain(
      'You are incapable of playing the bugle.',
    );
  });
});

describe('reading shirts', () => {
  test('a T-shirt reads its slogan, by its object id; under a suit it is obscured', () => {
    const s = room();
    const shirt = s.carry('nh:t_shirt');
    const slogan = shirtMessagesEn[`shirt.tshirt.${shirt % SHIRT_COUNTS.tshirt}`];
    expect(s.text(s.mod('nh:read', { item: shirt }))).toEqual(['It reads:', slogan]);
    wear(s, shirt);
    wear(s, s.carry('nh:plate_mail'));
    expect(s.text(s.mod('nh:read', { item: shirt }))).toEqual([
      'Your shirt is obscured by your mail.',
    ]);
  });

  test('a Hawaiian shirt shows its design; blind, nothing can be read', () => {
    const s = room();
    const shirt = s.carry('nh:hawaiian_shirt');
    const out = s.text(s.mod('nh:read', { item: shirt }));
    expect(out).toHaveLength(1);
    expect(out[0]).toMatch(/^The design features .+ on an? .+ background\.$/);
    setItimeout(s.state, getPlayer(s.state), P.BLINDED, 5);
    expect(s.text(s.mod('nh:read', { item: shirt }))).toEqual([
      "You can't feel any Braille writing.",
    ]);
  });

  test('the counts match the text tables', () => {
    for (const [k, n] of Object.entries(SHIRT_COUNTS)) {
      expect(shirtMessagesEn[`shirt.${k}.${n - 1}`]).toBeDefined();
      expect(shirtMessagesEn[`shirt.${k}.${n}`]).toBeUndefined();
    }
  });
});

describe('rations', () => {
  test('a K-ration is eaten in one bite and is bland', () => {
    const s = room();
    const r = s.carry('nh:k_ration');
    const before = getPlayer(s.state).c.hunger!.nutrition;
    const out = s.text(s.mod('nh:eat', { item: r }));
    expect(out).toContain('This K-ration is bland.');
    expect(s.state.entities[String(r)]).toBeUndefined();
    expect(getPlayer(s.state).c.hunger!.nutrition).toBeGreaterThan(before + 300);
  });
});
