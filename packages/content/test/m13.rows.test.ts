// m13 step 8: the remaining rows. Every new row can be made; the stalker and the black light are
// invisible from birth; the Nazgul carries its cursed ring of invisibility; jabberwocks are made
// asleep and wake hard (disturb()), ettins see through Stealth; eating a stalker makes the hero
// invisible (and for good, with see invisible, when she already is); a black light's explosion
// hallucinates; xorns and earth elementals walk through walls; an umber hulk tunnels without a
// pick and its gaze confuses; a naga hatchling grows up into its naga; nagas and liches mumble;
// every troll's corpse may revive. Outcomes are asserted over seeds, never one lucky seed.
// ref: src/makemon.c makemon(), m_initweap(), m_initinv(); src/monmove.c disturb();
// src/eat.c cpostfx(); src/mhitu.c explmu(), gazemu(); src/mon.c mfndpos(); src/mhitm.c
// grow_up(); src/sounds.c domonnoise(); src/mkobj.c start_corpse_timeout()
import { cellRules, getPlayer, inventoryOf, type Ctx, type DefId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { domonnoise } from '../src/chat';
import { startCorpseTimeout } from '../src/corpses';
import { makemon } from '../src/generation';
import { cpostfxOf } from '../src/givit';
import { monInvisible } from '../src/invis';
import { mksobj } from '../src/items';
import { explmu, gazemu } from '../src/mhitu';
import { growUp } from '../src/mhitm';
import { disturb, mfndpos } from '../src/monmove';
import { P, hasIntrinsic, hasProp, setIntrinsic, timeoutLeft } from '../src/props';
import { T, setTerrain } from '../src/terrain';
import { addMon, posOf, setup } from './helpers';
import { ctxFor, defs, render } from './itemHelpers';
import { mon, room, type FullCtx } from './m9helpers';
import { confusedLight } from '../src/seffect';
import { isCancelled, setMspecUsed } from '../src/mstate';

const ROWS = [
  'nh:winter_wolf',
  'nh:red_naga_hatchling',
  'nh:black_naga_hatchling',
  'nh:golden_naga_hatchling',
  'nh:guardian_naga_hatchling',
  'nh:red_naga',
  'nh:black_naga',
  'nh:golden_naga',
  'nh:guardian_naga',
  'nh:umber_hulk',
  'nh:black_pudding',
  'nh:winged_gargoyle',
  'nh:ice_troll',
  'nh:rock_troll',
  'nh:olog_hai',
  'nh:titanothere',
  'nh:baluchitherium',
  'nh:mastodon',
  'nh:elf_lord',
  'nh:zruty',
  'nh:xorn',
  'nh:earth_elemental',
  'nh:stalker',
  'nh:black_light',
  'nh:stone_giant',
  'nh:hill_giant',
  'nh:fire_giant',
  'nh:frost_giant',
  'nh:storm_giant',
  'nh:titan',
  'nh:jabberwock',
  'nh:lich',
  'nh:demilich',
  'nh:nazgul',
] as const;

const texts = (ctx: FullCtx): string[] =>
  ctx.events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const made = (s: ReturnType<typeof room>, def: string, x = 6, y = 4): number => {
  const id = makemon(s.ctx, defs.monster(def as DefId), { x, y });
  if (id === null) throw new Error(`no ${def}`);
  return id;
};

describe('the new rows', () => {
  test('each can be made (genesis), at its own level, and is named', () => {
    for (const def of ROWS) {
      const s = room();
      const id = made(s, def);
      const e = s.state.entities[String(id)]!;
      expect(e.def).toBe(def);
      expect(render(`@${def}`)).not.toBe(def);
    }
  });

  test('the stalker and the black light are invisible from birth; the others are not', () => {
    for (const def of ROWS) {
      const s = room();
      const e = s.state.entities[String(made(s, def))]!;
      expect(monInvisible(s.ctx, e)).toBe(def === 'nh:stalker' || def === 'nh:black_light');
    }
  });

  test('the Nazgul carries a knife, a long sword and a cursed ring of invisibility', () => {
    for (let seed = 1; seed <= 5; seed++) {
      const s = room(seed);
      const inv = inventoryOf(s.state, made(s, 'nh:nazgul'));
      const ring = inv.find((o) => o.def === 'nh:ring_of_invisibility');
      expect(ring?.c.item?.buc).toBe('cursed');
      expect(ring?.c.item?.equipped ?? null).toBeNull();
      expect(inv.map((o) => o.def)).toEqual(expect.arrayContaining(['nh:knife', 'nh:long_sword']));
    }
  });

  test('jabberwocks are made asleep about 4 times in 5', () => {
    let asleep = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const s = room(seed);
      if (s.state.entities[String(made(s, 'nh:jabberwock'))]!.c.monster!.asleep) asleep++;
    }
    expect(asleep).toBeGreaterThan(36);
    expect(asleep).toBeLessThan(60);
  });
});

describe('disturb(): who wakes', () => {
  /** How many of `n` tries wake a sleeping `def` 3 squares from her. */
  function wakes(def: string, stealth: boolean, n = 200): number {
    const s = room();
    if (stealth) setIntrinsic(getPlayer(s.state), P.STEALTH, true);
    const m = mon(s.state, def, 5, 2);
    let woke = 0;
    for (let i = 0; i < n; i++) {
      m.c.monster!.asleep = true;
      if (disturb(s.ctx as Ctx, m.id)) woke++;
    }
    return woke;
  }

  test('a jabberwock wakes only 1 time in 50 of the 1 in 7; a jackal always', () => {
    expect(wakes('nh:jackal', false)).toBe(200);
    expect(wakes('nh:hill_giant', false)).toBeGreaterThan(10);
    expect(wakes('nh:jabberwock', false, 400)).toBeLessThan(4);
  });

  test('Stealth keeps a giant asleep; an ettin still wakes', () => {
    expect(wakes('nh:hill_giant', true)).toBe(0);
    expect(wakes('nh:ettin', true)).toBeGreaterThan(10);
  });
});

describe('the stalker corpse (cpostfx())', () => {
  test('a visible hero turns invisible for 50..149 turns and is stunned for 60', () => {
    const s = room();
    s.ctx.events.length = 0;
    cpostfxOf(s.ctx as Ctx, defs.monster('nh:stalker' as DefId));
    const h = getPlayer(s.state);
    expect(timeoutLeft(s.state, h, P.INVIS)).toBeGreaterThanOrEqual(50);
    expect(timeoutLeft(s.state, h, P.INVIS)).toBeLessThan(150);
    expect(hasIntrinsic(h, P.INVIS)).toBe(false);
    expect(timeoutLeft(s.state, h, P.STUNNED)).toBe(60);
    expect(texts(s.ctx)).toContain("Gee!  All of a sudden, you can't see yourself.");
  });

  test('an invisible hero feels hidden: invisible and seeing invisible for good', () => {
    const s = room();
    const stalker = defs.monster('nh:stalker' as DefId);
    cpostfxOf(s.ctx as Ctx, stalker);
    s.ctx.events.length = 0;
    cpostfxOf(s.ctx as Ctx, stalker);
    const h = getPlayer(s.state);
    expect(texts(s.ctx)).toContain('You feel hidden!');
    expect(hasIntrinsic(h, P.INVIS)).toBe(true);
    expect(hasProp(h, P.SEE_INVIS)).toBe(true);
    // a third one: already hidden for good, no message
    s.ctx.events.length = 0;
    cpostfxOf(s.ctx as Ctx, stalker);
    expect(texts(s.ctx)).not.toContain('You feel hidden!');
  });
});

describe('row mechanics that already existed', () => {
  test("a black light's explosion makes her hallucinate and kills it", () => {
    const s = room();
    const b = mon(s.state, 'nh:black_light');
    explmu(s.ctx as Ctx, b, defs.monster('nh:black_light' as DefId).attacks[0]!, true);
    expect(hasProp(getPlayer(s.state), P.HALLUC)).toBe(true);
    expect(s.state.entities[String(b.id)]).toBeUndefined();
  });

  test("an umber hulk's gaze confuses her", () => {
    const s = room();
    const u = mon(s.state, 'nh:umber_hulk');
    const gaze = defs.monster('nh:umber_hulk' as DefId).attacks.find((a) => a.at === 'gaze')!;
    // the gaze works 4 times in 5 (and not while mspec_used)
    for (let i = 0; i < 20 && !hasProp(getPlayer(s.state), P.CONFUSION); i++) {
      setMspecUsed(s.ctx, u.id, 0);
      gazemu(s.ctx as Ctx, u, gaze);
    }
    expect(hasProp(getPlayer(s.state), P.CONFUSION)).toBe(true);
  });

  test('xorns and earth elementals may enter walls and locked doors, as a ghost', () => {
    const ROOM = [
      '         ',
      ' -----   ',
      ' |...|   ',
      ' |.@.|   ',
      ' |...|   ',
      ' -----   ',
      '         ',
    ];
    const key = (c: { x: number; y: number }): string => `${c.x},${c.y}`;
    const cands = (def: string): string[] => {
      const s = setup(ROOM);
      setTerrain(s.level, 5, 3, T.door_locked);
      const m = addMon(s.state, def, 6, 3);
      const ctx = ctxFor(s.state) as unknown as Ctx;
      const hero = posOf(s.state, s.state.playerId);
      return mfndpos(ctx, s.level, cellRules(s.level, defs), m, hero).map(key).sort();
    };
    const ghost = cands('nh:ghost');
    expect(ghost).toContain('5,2');
    expect(cands('nh:xorn')).toEqual(ghost);
    expect(cands('nh:earth_elemental')).toEqual(ghost);
  });

  test('an umber hulk tunnels through rock and a wall to reach her (no pick)', () => {
    const ROOM = [
      '           ',
      ' -----     ',
      ' |...|     ',
      ' |.@.|     ',
      ' |...|     ',
      ' -----     ',
      '           ',
    ];
    const s = setup(ROOM);
    getPlayer(s.state).c.hp = { cur: 5000, max: 5000 };
    const u = addMon(s.state, 'nh:umber_hulk', 9, 3);
    for (let i = 0; i < 60; i++) {
      s.wait();
      const p = posOf(s.state, u);
      if (Math.abs(p.x - 3) <= 1 && Math.abs(p.y - 3) <= 1) break;
    }
    const p = posOf(s.state, u);
    expect(Math.max(Math.abs(p.x - 3), Math.abs(p.y - 3))).toBeLessThanOrEqual(1);
    expect(inventoryOf(s.state, u)).toHaveLength(0);
  });

  test('a red naga hatchling grows up into a red naga', () => {
    const s = room();
    const h = mon(s.state, 'nh:red_naga_hatchling');
    for (let i = 0; i < 80 && h.def === 'nh:red_naga_hatchling'; i++) growUp(s.ctx as Ctx, h.id, 6);
    expect(h.def).toBe('nh:red_naga');
  });

  test('growing up into a genocided species kills it', () => {
    const s = room();
    const nh = (s.state.modData['nh'] ??= {}) as { genocided?: string[] };
    nh.genocided = ['nh:red_naga'];
    const h = mon(s.state, 'nh:red_naga_hatchling');
    let alive = true;
    for (let i = 0; i < 80 && alive; i++) alive = growUp(s.ctx as Ctx, h.id, 6);
    expect(alive).toBe(false);
    expect(s.state.entities[String(h.id)]?.c.monster).toBeUndefined();
    expect(texts(s.ctx)).toContain('As the red naga hatchling grows up into a red naga, it dies!');
  });

  test('nagas and liches mumble incomprehensibly', () => {
    for (const def of ['nh:lich', 'nh:golden_naga', 'nh:red_naga_hatchling']) {
      const s = room();
      const m = mon(s.state, def);
      s.ctx.events.length = 0;
      domonnoise(s.ctx as Ctx, m.id);
      expect(texts(s.ctx)).toEqual([`The ${render(`@${def}`)} mumbles incomprehensibly.`]);
    }
  });

  test('every troll corpse may revive; a giant corpse never', () => {
    const revives = (def: string): number => {
      let n = 0;
      for (let seed = 1; seed <= 30; seed++) {
        const s = room(seed);
        const c = mksobj(s.ctx, defs.object('nh:corpse'), {
          corpseOf: def as DefId,
          at: { level: 'dlvl1', x: 6, y: 4 },
        });
        const kinds: string[] = [];
        startCorpseTimeout({ ...s.ctx, schedule: (_d, kind) => kinds.push(kind) }, c);
        if (kinds.includes('nh:revive_mon')) n++;
      }
      return n;
    };
    for (const t of ['nh:ice_troll', 'nh:rock_troll', 'nh:olog_hai'])
      expect(revives(t)).toBeGreaterThan(15);
    expect(revives('nh:hill_giant')).toBe(0);
  });
});

describe('a confused scroll of light (seffect_light())', () => {
  const lights = (s: ReturnType<typeof room>, def: string) =>
    Object.values(s.state.entities).filter((e) => e.def === def && e.c.monster);

  test('uncursed: 3 or 4 tame, cancelled, awake yellow lights next to her, seen', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const s = room(seed);
      s.ctx.events.length = 0;
      expect(confusedLight(s.ctx as Ctx, 'uncursed')).toBe(true);
      const ls = lights(s, 'nh:yellow_light');
      expect(ls.length).toBeGreaterThanOrEqual(3);
      expect(ls.length).toBeLessThanOrEqual(4);
      const h = posOf(s.state, s.state.playerId);
      for (const l of ls) {
        expect(l.c.monster!.tame).toBeGreaterThan(0);
        expect(l.c.monster!.asleep).toBe(false);
        expect(isCancelled(s.ctx, l.id)).toBe(true);
        expect(Math.max(Math.abs(l.c.pos!.x - h.x), Math.abs(l.c.pos!.y - h.y))).toBe(1);
      }
      expect(texts(s.ctx)).toContain('Lights appear all around you!');
    }
  });

  test('blessed makes 5 or 6; cursed makes black lights, unseen (invisible)', () => {
    const b = room(2);
    confusedLight(b.ctx as Ctx, 'blessed');
    expect(lights(b, 'nh:yellow_light').length).toBeGreaterThanOrEqual(5);
    const c = room(2);
    c.ctx.events.length = 0;
    expect(confusedLight(c.ctx as Ctx, 'cursed')).toBe(false);
    expect(lights(c, 'nh:black_light').length).toBeGreaterThanOrEqual(3);
    expect(texts(c.ctx)).not.toContain('Lights appear all around you!');
  });

  test('a genocided kind only sparkles', () => {
    const s = room();
    (s.state.modData['nh'] ??= {}) as object;
    (s.state.modData['nh'] as { genocided?: string[] }).genocided = ['nh:yellow_light'];
    s.ctx.events.length = 0;
    expect(confusedLight(s.ctx as Ctx, 'uncursed')).toBe(false);
    expect(lights(s, 'nh:yellow_light')).toHaveLength(0);
    expect(texts(s.ctx)).toEqual(['Tiny lights sparkle in the air momentarily.']);
  });
});
