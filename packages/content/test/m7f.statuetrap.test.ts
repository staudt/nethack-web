// m7f-c step 2: statue traps and stone to flesh. A statue trap is made with a statue of a
// slightly harder monster holding that monster's starting inventory; it goes off (the statue
// comes to life, hostile, with what the statue held) when the hero steps on it, finds it by
// searching, kicks the statue, or hits it with striking/force bolt or a pick-axe; monsters never
// set it off. Stone to flesh animates statues (a meatball for a monster not made of flesh),
// turns boulders into enormous meatballs, stones, gems, stone rings and the marble wand into
// meat, cures her stoning when cast at herself, and bleeds up and down.
// ref: src/trap.c mk_trap_statue(), animate_statue(), activate_statue_trap(),
// trapeffect_statue_trap(), m_harmless_trap(); src/detect.c dosearch0(), findit();
// src/dokick.c really_kick_object(); src/zap.c break_statue(), bhitpile(), stone_to_flesh_obj(),
// zapyourself(), zap_updown(); src/mklev.c traptype_rnd()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { traptypeRnd } from '../src/mklev';
import { mkTrapStatue, mkcorpstat } from '../src/statue';
import { STATUE } from '../src/statuestate';
import { makeStoned, isStoned } from '../src/stonestate';
import { TRAP, mHarmlessTrap, maketrap, mintrap } from '../src/trap';
import { KEEN } from '../src/spell';
import { setPw } from '../src/uenergy';
import { WAN } from '../src/zap';
import { addMon } from './helpers';
import { defs, engine, levelSetup, plainKit } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = ['           ', ' ......... ', ' ..@...... ', ' ......... ', '           '];
const HX = 3;
const HY = 2;
const STF = 'nh:spellbook_of_stone_to_flesh';

function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities))
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  (s.state.modData['nh'] as Record<string, Json>)['debugMongen'] = true;
  s.step({ type: 'wait' });
  return s;
}
const ctxOf = (s: S): Ctx => s.ctx as unknown as Ctx;
const at = (x: number, y: number) => ({ level: 'dlvl1', x, y });
const ent = (s: S, id: EntityId): Entity | undefined => s.state.entities[String(id)];
const level = (s: S) => s.state.levels['dlvl1']!;
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
const monsters = (s: S): Entity[] =>
  Object.values(s.state.entities).filter((e) => e.c.monster && e.id !== s.state.playerId);
const statues = (s: S): Entity[] => Object.values(s.state.entities).filter((e) => e.def === STATUE);
const floorDefs = (s: S, x: number, y: number): string[] =>
  itemsAt(defs, s.state, 'dlvl1', x, y).map((e) => e.def);

/** A statue of `mon` holding a spellbook of force bolt, on a statue trap at (x, y). */
function trappedStatue(s: S, mon: string, x: number, y: number, seen = false): EntityId {
  const st = mkcorpstat(ctxOf(s), mon as DefId, at(x, y));
  const book = s.give('nh:spellbook_of_force_bolt');
  ent(s, book)!.c.item!.containedIn = st;
  level(s).traps.push({ def: TRAP.statue, x, y, seen });
  level(s).traps.sort((a, b) => a.y * 100 + a.x - (b.y * 100 + b.x));
  return st;
}

/** Runs `fn` with the engine's own ctx (placeTrap, removeTrap). */
const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeEngine = createEngine([
  vanillaMod,
  {
    id: 'stt',
    version: '1',
    register(api) {
      api.defineAction({
        id: 'stt:run',
        labelKey: 'stt',
        handles: 'mod',
        offer: () => [],
        perform(ctx) {
          probe.fn(ctx);
          return 0;
        },
      });
    },
  } satisfies Mod,
]);

describe('making statue traps', () => {
  test('mk_trap_statue(): a statue of a monster holding its starting inventory, no monster', () => {
    let held = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const s = make(seed);
      const before = Object.keys(s.state.entities).length;
      mkTrapStatue(ctxOf(s), 'dlvl1', 6, 2, false);
      const [st, ...more] = statues(s);
      expect(more).toEqual([]);
      expect(st?.c.pos).toMatchObject({ x: 6, y: 2 });
      expect(defs.isMonster(st!.c.item!.corpseOf!)).toBe(true);
      expect(monsters(s)).toEqual([]);
      const inside = Object.values(s.state.entities).filter(
        (e) => e.c.item?.containedIn === st!.id,
      );
      for (const o of inside) {
        expect(o.c.item!.carriedBy).toBeNull();
        expect(o.c.item!.equipped).toBeNull();
      }
      held += inside.length;
      expect(Object.keys(s.state.entities).length).toBe(before + 1 + inside.length);
    }
    expect(held).toBeGreaterThan(0); // some monsters come with gear
  });

  test('maketrap() makes the statue with the trap; the trap is hidden', () => {
    const s = make();
    probe.fn = (ctx) => void maketrap(ctx, 'dlvl1', 6, 2, TRAP.statue);
    probeEngine.step(s.state, { type: 'mod', action: 'stt:run' as DefId });
    expect(trapAt(level(s), 6, 2)).toMatchObject({ def: TRAP.statue, seen: false });
    expect(floorDefs(s, 6, 2)).toContain(STATUE);
  });

  test('traptype_rnd(): kind 19 is a statue trap from level difficulty 8', () => {
    const rng = { rnd: () => 19, rn2: () => 0 } as unknown as Ctx['rng'];
    expect(traptypeRnd({ rng }, 7)).toBeNull();
    expect(traptypeRnd({ rng }, 8)).toBe(TRAP.statue);
  });
});

describe('setting statue traps off', () => {
  test('stepping on it: "The statue comes to life!", hostile, with what the statue held', () => {
    const s = make();
    const st = trappedStatue(s, 'nh:gnome_lord', HX + 1, HY);
    const out = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(out).toContain('The statue comes to life!');
    expect(ent(s, st)).toBeUndefined();
    expect(trapAt(level(s), HX + 1, HY)).toBeUndefined();
    const [mon, ...more] = monsters(s);
    expect(more).toEqual([]);
    expect(mon!.def).toBe('nh:gnome_lord');
    expect(mon!.c.monster).toMatchObject({ peaceful: false, asleep: false });
    // makemon() moved it off her square
    expect(mon!.c.pos).not.toMatchObject({ x: HX + 1, y: HY });
    expect(inventoryOf(s.state, mon!.id).map((o) => o.def)).toEqual(['nh:spellbook_of_force_bolt']);
  });

  test('levitating, she still sets it off (not a floor trigger)', () => {
    const s = make();
    trappedStatue(s, 'nh:jackal', HX + 1, HY);
    const ring = s.carry('nh:ring_of_levitation');
    s.state.entities[String(ring)]!.c.item!.equipped = 'ringL';
    const out = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(out).toContain('The statue comes to life!');
  });

  test('searching next to it: "You find a jackal posing as a statue." (rnl(8))', () => {
    const s = make();
    trappedStatue(s, 'nh:jackal', HX + 1, HY);
    const out: string[] = [];
    for (let i = 0; i < 100 && trapAt(level(s), HX + 1, HY); i++)
      out.push(...s.text(s.step({ type: 'search' })));
    expect(out).toContain('You find a jackal posing as a statue.');
    expect(monsters(s).map((m) => m.def)).toEqual(['nh:jackal']);
    expect(statues(s)).toEqual([]);
  });

  test('kicking the statue sets it off (no "You kick")', () => {
    const s = make();
    trappedStatue(s, 'nh:jackal', HX + 1, HY);
    s.mod('nh:kick');
    const out = s.text(answer(s, 'e'));
    expect(out[0]).toBe('You find a jackal posing as a statue.');
    expect(out.some((l) => l.startsWith('You kick'))).toBe(false);
  });

  test('striking: "Instead of shattering, the statue of a jackal suddenly comes to life!"', () => {
    const s = make();
    trappedStatue(s, 'nh:jackal', HX + 2, HY);
    const w = s.carry(WAN.striking);
    ent(s, w)!.c.item!.spe = 5;
    s.mod('nh:zap', { item: w });
    const out = s.text(answer(s, 'e'));
    expect(out).toContain('Instead of shattering, the statue of a jackal suddenly comes to life!');
    expect(out).not.toContain('The statue shatters.');
    expect(floorDefs(s, HX + 2, HY)).not.toContain('nh:rock');
    expect(monsters(s).map((m) => m.def)).toEqual(['nh:jackal']);
  });

  test('a pick-axe: it comes to life instead of shattering', () => {
    const s = make();
    trappedStatue(s, 'nh:jackal', HX + 1, HY);
    const p = s.carry('nh:pick_axe');
    for (const o of inventoryOf(s.state, s.state.playerId))
      if (o.c.item?.equipped === 'weapon') o.c.item.equipped = null;
    ent(s, p)!.c.item!.equipped = 'weapon';
    const out = s.text(s.mod('nh:apply', { item: p }));
    let r = answer(s, 'e');
    out.push(...s.text(r));
    for (let i = 0; i < 100 && r.continuing; i++) {
      r = s.step({ type: 'continue' });
      out.push(...s.text(r));
    }
    expect(out).toContain('Instead of shattering, the statue of a jackal suddenly comes to life!');
    expect(out).not.toContain('The statue shatters.');
    expect(monsters(s).length).toBe(1);
  });

  test("a unique monster's statue does not come to life (no doppelgangers); the trap is gone", () => {
    const s = make();
    const st = trappedStatue(s, 'nh:oracle', HX + 1, HY);
    s.step({ type: 'move', dir: 'e' });
    expect(ent(s, st)).toBeDefined();
    expect(monsters(s)).toEqual([]);
    expect(trapAt(level(s), HX + 1, HY)).toBeUndefined();
  });

  test('monsters never set it off and do not fear it', () => {
    const s = make();
    const st = trappedStatue(s, 'nh:jackal', 6, 2, true);
    const m = addMon(s.state, 'nh:gnome', 6, 2);
    const mon = ent(s, m)!;
    expect(mHarmlessTrap(ctxOf(s), mon, trapAt(level(s), 6, 2)!)).toBe(true);
    expect(mintrap(ctxOf(s), m, { force: true })).toBe('finished');
    expect(ent(s, st)).toBeDefined();
    expect(trapAt(level(s), 6, 2)).toBeDefined();
  });

  test('secret door detection does not find it', () => {
    const s = make();
    trappedStatue(s, 'nh:jackal', HX + 2, HY);
    const w = s.carry('nh:wand_of_secret_door_detection');
    ent(s, w)!.c.item!.spe = 5;
    s.mod('nh:zap', { item: w });
    expect(trapAt(level(s), HX + 2, HY)?.seen).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// stone to flesh

/** A hero who knows stone to flesh and never fails it (Wis 25, a robe, plenty of Pw). */
function caster(seed = 1): S {
  const s = make(seed);
  const h = getPlayer(s.state);
  if (h.c.attributes) h.c.attributes.wis = 25;
  h.c.experience!.level = 30; // level 3 healing cannot fail
  const robe = s.carry('nh:robe');
  ent(s, robe)!.c.item!.equipped = 'cloak';
  setPw(s.ctx, { uen: 200, uenmax: 200, uenpeak: 200 });
  (s.state.modData['nh'] as Record<string, Json>)['spells'] = [{ id: STF, retention: KEEN }];
  return s;
}
/** Casts stone to flesh in `dir`: all the text. */
function castStf(s: S, dir: string): string[] {
  const out = s.text(s.mod('nh:cast'));
  const p = s.state.pendingPrompt?.prompt;
  if (p?.id === 'cast-menu') out.push(...s.text(answer(s, 0)));
  out.push(...s.text(answer(s, dir)));
  return out;
}

describe('stone to flesh', () => {
  test('a spellbook of level 3 healing, castable', () => {
    expect(defs.object(STF).spellbook).toEqual({ level: 3 });
  });

  test('at a statue: "The statue of a jackal comes to life!", with its contents', () => {
    let lived = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = caster(seed);
      const st = mkcorpstat(ctxOf(s), 'nh:jackal' as DefId, at(HX + 2, HY));
      const book = s.give('nh:spellbook_of_force_bolt');
      ent(s, book)!.c.item!.containedIn = st;
      const out = castStf(s, 'e');
      if (!ent(s, st)) {
        lived++;
        expect(out).toContain('The statue of a jackal comes to life!');
        const [mon] = monsters(s);
        expect(mon?.def).toBe('nh:jackal');
        expect(inventoryOf(s.state, mon!.id).map((o) => o.id)).toEqual([book]);
      } else expect(out).not.toContain('The statue of a jackal comes to life!'); // resisted
    }
    expect(lived).toBeGreaterThanOrEqual(8);
  });

  test('a statue of a monster not made of flesh becomes a meatball', () => {
    const s = caster(2);
    const st = mkcorpstat(ctxOf(s), 'nh:lichen' as DefId, at(HX + 1, HY));
    const out = castStf(s, 'e');
    if (ent(s, st)) return; // resisted (2 in 100)
    expect(out).toContain('You smell the odor of meat.');
    expect(floorDefs(s, HX + 1, HY)).toEqual(['nh:meatball']);
    expect(monsters(s)).toEqual([]);
  });

  test('a boulder becomes an enormous meatball', () => {
    let changed = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = caster(seed);
      s.give('nh:boulder', { at: at(HX + 1, HY) });
      castStf(s, 'e');
      const here = floorDefs(s, HX + 1, HY);
      if (here.includes('nh:enormous_meatball')) {
        changed++;
        expect(here).toEqual(['nh:enormous_meatball']);
      } else expect(here).toEqual(['nh:boulder']);
    }
    expect(changed).toBeGreaterThanOrEqual(8);
  });

  test('up: "Blood drips on your face."; down on bare floor: "Blood pools at your feet."', () => {
    const s = caster();
    expect(castStf(s, 'up')).toContain('Blood drips on your face.');
    expect(castStf(s, 'down')).toContain('Blood pools at your feet.');
  });

  test('down: the rocks under her become meatballs, keeping their number', () => {
    const s = caster();
    const r = s.floor('nh:rock', { quantity: 7 });
    const out = castStf(s, 'down');
    if (ent(s, r)) return; // resisted
    expect(out).not.toContain('Blood pools at your feet.');
    const [mb] = itemsAt(defs, s.state, 'dlvl1', HX, HY);
    expect(mb?.def).toBe('nh:meatball');
    expect(mb?.c.item?.quantity).toBe(7);
  });

  test('at herself: stoning cured, and her stones, gems and stone rings turn to meat', () => {
    let full = 0;
    for (let seed = 1; seed <= 10; seed++) {
      const s = caster(seed);
      makeStoned(s.ctx, 5, null, '@nh:cockatrice');
      const rock = s.carry('nh:rock', { quantity: 3 });
      const ruby = s.carry('nh:ruby');
      const ring = s.carry('nh:ring_of_protection');
      ent(s, ring)!.c.item!.equipped = 'ringL';
      const wand = s.carry('nh:wand_of_make_invisible');
      const out = castStf(s, 'self');
      expect(out).toContain('You feel limber!');
      expect(isStoned(s.state)).toBe(false);
      const inv = inventoryOf(s.state, s.state.playerId);
      const of = (d: string) => inv.filter((o) => o.def === d);
      if (ent(s, rock) || ent(s, ruby) || ent(s, ring) || ent(s, wand)) continue; // one resisted
      full++;
      // the rocks and the ruby merged into four meatballs
      expect(of('nh:meatball').map((o) => o.c.item!.quantity)).toEqual([4]);
      expect(of('nh:meat_ring')).toHaveLength(1);
      expect(of('nh:meat_ring')[0]!.c.item!.equipped).toBeNull();
      expect(of('nh:meat_stick')).toHaveLength(1);
      expect(out).toContain('You smell the odor of meat.');
    }
    expect(full).toBeGreaterThanOrEqual(5);
  });

  test('monsters are not affected (no golems or mimics)', () => {
    const s = caster();
    const m = addMon(s.state, 'nh:jackal', HX + 1, HY, { asleep: true });
    ent(s, m)!.c.actor!.speed = 0;
    castStf(s, 'e');
    expect(ent(s, m)?.c.monster?.asleep).toBe(true);
  });
});
