// m7f-c step 1: statues. A statue is drawn as the monster it shows (one appearance per monster,
// in the statue's colour) in the view, in object memory and in Look; new statues get a random
// monster and maybe a spellbook (mksobj_init()), ordinary rooms get one 1 time in 20, the Oracle's
// centaurs and the Grotto's gnome king are historic statues; striking, force bolt, a pick-axe and
// blasts break one into rocks and drop what it held; probing lists it; "F" at one is a harmless
// attack; the wish parser makes "statue of a <monster>" and "historic statue of ...".
// ref: src/mkobj.c mksobj_init(), mkcorpstat(); src/mklev.c fill_ordinary_room(); src/zap.c
// break_statue(), bhito(); src/dig.c dig(), dig_typ(); src/hack.c domove_fight_empty();
// src/objnam.c xname(), readobjnam(); src/explode.c scatter(); src/display.c map_glyphinfo()
import {
  buildSnapshot,
  contents,
  createEngine,
  createQuery,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Mod,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod } from '../src/index';
import { mksobjStatue } from '../src/mkobj';
import { mkWished } from '../src/wish';
import { readobjnam, wishNames } from '../src/objnam_read';
import { messagesEn } from '../src/messages.en';
import { xnameOf } from '../src/objnam';
import { mkcorpstat } from '../src/statue';
import { STATUE, isHistoric, statueAppearanceId } from '../src/statuestate';
import { WAN } from '../src/zap';
import { scatter } from '../src/scatter';
import { P, setIntrinsic } from '../src/props';
import { defs, engine, levelSetup, obj, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = ['           ', ' ......... ', ' ..@...... ', ' ......... ', '           '];
const HX = 3;
const HY = 2;

function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities))
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  s.step({ type: 'wait' });
  return s;
}
const ctxOf = (s: S): Ctx => s.ctx as unknown as Ctx;
const at = (x: number, y: number) => ({ level: 'dlvl1', x, y });
const ent = (s: S, id: EntityId): Entity => s.state.entities[String(id)]!;
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
function zap(s: S, wand: DefId, dir: string): string[] {
  const id = s.carry(wand);
  ent(s, id).c.item!.spe = 5;
  const out = s.text(s.mod('nh:zap', { item: id }));
  return [...out, ...s.text(answer(s, dir))];
}
/** A statue of `mon` holding a spellbook of force bolt, at (x, y). */
function statueWithBook(s: S, mon: DefId, x: number, y: number): EntityId {
  const st = mkcorpstat(ctxOf(s), mon, at(x, y));
  const book = s.give('nh:spellbook_of_force_bolt');
  ent(s, book).c.item!.containedIn = st;
  return st;
}
const floorDefs = (s: S, x: number, y: number): string[] =>
  itemsAt(defs, s.state, 'dlvl1', x, y).map((e) => e.def);

describe('how a statue looks', () => {
  test('one appearance per monster: its letter in the statue colour', () => {
    const jackal = defs.monster('nh:jackal' as DefId);
    const a = defs.appearance(statueAppearanceId(jackal.id));
    expect(a.glyph).toEqual({ ch: 'd', fg: obj(STATUE).glyph.fg });
    expect(a.glyph.fg).not.toBe(jackal.glyph.fg);
    for (const m of defs.monsters) expect(defs.isAppearance(statueAppearanceId(m.id))).toBe(true);
  });

  test('the view, object memory and Look show the monster; a broken one shows rocks', () => {
    const s = make();
    const st = mkcorpstat(ctxOf(s), 'nh:jackal' as DefId, at(6, 2));
    s.step({ type: 'wait' });
    const shown = statueAppearanceId('nh:jackal' as DefId);
    const snap = buildSnapshot(defs, s.state);
    const i = 2 * snap.width + 6;
    expect(snap.cells[i]?.o).toBe(shown);
    expect(snap.legend[shown]).toEqual({ ch: 'd', fg: obj(STATUE).glyph.fg });
    expect(s.state.objectMemory['dlvl1']?.[String(i)]).toBe(shown);
    const look = createQuery(defs, s.state).describe({ x: 6, y: 2 });
    expect(look.objects).toEqual([{ id: st, def: shown, name: expect.anything() }]);
    expect(render(look.objects[0]!.name)).toBe('statue of a jackal');
    // out of sight it stays remembered as the jackal statue
    const level = getLevel(s.state);
    level.lit = level.lit.map(() => 0);
    getPlayer(s.state).c.pos!.x = 1;
    s.step({ type: 'wait' });
    const later = buildSnapshot(defs, s.state);
    expect(later.cells[i]?.v).toBe(false);
    expect(later.cells[i]?.o).toBe(shown);
  });

  test('a hallucinating hero sees a statue as a random monster', () => {
    const s = make();
    mkcorpstat(ctxOf(s), 'nh:jackal' as DefId, at(6, 2));
    setIntrinsic(getPlayer(s.state), P.HALLUC, true);
    s.step({ type: 'wait' });
    const o = buildSnapshot(defs, s.state).cells[2 * 11 + 6]?.o;
    expect(defs.isMonster(o as DefId)).toBe(true);
  });

  test('names: "statue of the Oracle"; only an Archeologist sees "historic"', () => {
    const s = make();
    const st = mkcorpstat(ctxOf(s), 'nh:oracle' as DefId, at(6, 2), { historic: true });
    expect(isHistoric(s.state, st)).toBe(true);
    expect(render(xnameOf(s.state, defs, ent(s, st)))).toBe('statue of the Oracle');
    const g = mkcorpstat(ctxOf(s), 'nh:gnome_king' as DefId, at(6, 2), { historic: true });
    expect(render(xnameOf(s.state, defs, ent(s, g)))).toBe('statue of a gnome king');
  });
});

describe('making statues', () => {
  test('a random monster; a spellbook inside rn2(depth / 2 + 10) > 10, never for a tiny one', () => {
    const s = make();
    getLevel(s.state).depth = 30; // rn2(25) > 10: 14 in 25
    let books = 0;
    let n = 0;
    for (let i = 0; i < 120; i++) {
      const st = mksobjStatue(ctxOf(s), obj(STATUE), { at: at(5, 1) });
      const e = ent(s, st);
      const mon = e.c.item!.corpseOf;
      expect(mon && defs.isMonster(mon)).toBe(true);
      const inside = contents(s.state, st);
      if (defs.monster(mon!).size === 'tiny') expect(inside).toEqual([]);
      else n++;
      for (const o of inside) {
        expect(defs.object(o.def).class).toBe('spellbook');
        expect(o.c.pos).toBeUndefined();
        books++;
      }
    }
    expect(n).toBeGreaterThan(30);
    expect(books).toBeGreaterThan(n / 3);
    expect(books).toBeLessThan(n);
  });

  test('a given monster replaces the random one', () => {
    const s = make();
    const st = statueWithBook(s, 'nh:gnome_lord' as DefId, 5, 1);
    expect(ent(s, st).c.item!.corpseOf).toBe('nh:gnome_lord');
    expect(contents(s.state, st)).toHaveLength(1);
  });

  test('ordinary rooms sometimes have one (fill_ordinary_room() 1 in 20)', () => {
    let statues = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const { state } = engine.newGame({ seed });
      for (const e of Object.values(state.entities)) {
        if (e.def !== STATUE || e.c.pos?.level !== state.currentLevel) continue;
        statues++;
        expect(defs.isMonster(e.c.item!.corpseOf!)).toBe(true);
      }
    }
    expect(statues).toBeGreaterThan(2);
    expect(statues).toBeLessThan(30);
  });

  test("the Oracle's eight historic centaur statues", () => {
    const { state } = probeEngine.newGame({ seed: 1 });
    const oracle = state.dungeons[0]?.special.find((x) => x.id === 'nh:oracle');
    goTo(state, 'nh:main', oracle!.dlevel);
    const level = getLevel(state);
    expect(level.def).toBe('nh:oracle_level');
    const statues = Object.values(state.entities).filter(
      (e) => e.def === STATUE && e.c.pos?.level === level.id,
    );
    expect(statues).toHaveLength(8);
    for (const e of statues) {
      expect(defs.monster(e.c.item!.corpseOf!).glyph.ch).toBe('C');
      expect(isHistoric(state, e.id)).toBe(true);
    }
  });

  test("Grotto Town's historic gnome king", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const { state } = probeEngine.newGame({ seed });
      const town = state.dungeons.find((d) => d.id === 'nh:mines');
      const t = town?.special.find((x) => x.id === 'nh:minetown');
      if (!t) continue;
      goTo(state, 'nh:mines', t.dlevel);
      if (getLevel(state).def !== 'nh:minetn-5') continue;
      const statues = Object.values(state.entities).filter(
        (e) => e.def === STATUE && e.c.pos?.level === state.currentLevel,
      );
      expect(statues.map((e) => e.c.item!.corpseOf)).toContain('nh:gnome_king');
      const king = statues.find((e) => e.c.item!.corpseOf === 'nh:gnome_king')!;
      expect(isHistoric(state, king.id)).toBe(true);
      return;
    }
    throw new Error('no Grotto Town within 300 seeds');
  });
});

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeEngine = createEngine([
  vanillaMod,
  {
    id: 'stp',
    version: '1',
    register(api) {
      api.defineAction({
        id: 'stp:run',
        labelKey: 'stp',
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

/** A new game (probe engine) with the hero moved to a level of a dungeon. */
function goTo(state: GameState, dungeon: string, dlevel: number): void {
  const nh = (state.modData['nh'] ??= {}) as Record<string, unknown>;
  nh['debugMongen'] = true;
  probe.fn = (ctx) => ctx.goToLevel({ dungeon: dungeon as DefId, dlevel }, 'up');
  probeEngine.step(state, { type: 'mod', action: 'stp:run' as DefId });
}

describe('breaking statues', () => {
  test('force bolt / striking: "The statue shatters.", rocks, the book drops', () => {
    const s = make();
    const st = statueWithBook(s, 'nh:jackal' as DefId, 5, 2);
    const out = zap(s, WAN.striking, 'e');
    expect(out).toContain('The statue shatters.');
    expect(ent(s, st).def).toBe('nh:rock');
    expect(ent(s, st).c.item!.corpseOf).toBeUndefined();
    expect(floorDefs(s, 5, 2).sort()).toEqual(['nh:rock', 'nh:spellbook_of_force_bolt']);
    // rocks on top
    expect(floorDefs(s, 5, 2)[0]).toBe('nh:rock');
  });

  test('probing lists what a statue holds', () => {
    const s = make();
    statueWithBook(s, 'nh:jackal' as DefId, 5, 2);
    const w = s.carry(WAN.probing);
    ent(s, w).c.item!.spe = 5;
    s.mod('nh:zap', { item: w });
    const list = answer(s, 'e').events.find((e) => e.type === 'list');
    const items = list?.type === 'list' ? list.items.map((i) => render(i)) : [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatch(/spellbook/);
  });

  test('a pick-axe: "You start chipping the statue." ... "The statue shatters."', () => {
    const s = make();
    statueWithBook(s, 'nh:jackal' as DefId, HX + 1, HY);
    const p = s.carry('nh:pick_axe');
    for (const o of inventoryOf(s.state, s.state.playerId))
      if (o.c.item?.equipped === 'weapon') o.c.item.equipped = null;
    ent(s, p).c.item!.equipped = 'weapon';
    const out = s.text(s.mod('nh:apply', { item: p }));
    let r = answer(s, 'e');
    out.push(...s.text(r));
    for (let i = 0; i < 100 && r.continuing; i++) {
      r = s.step({ type: 'continue' });
      out.push(...s.text(r));
    }
    expect(out).toContain('You start chipping the statue.');
    expect(out).toContain('You hit the statue with all your might.');
    expect(out).toContain('The statue shatters.');
    expect(floorDefs(s, HX + 1, HY).sort()).toEqual(['nh:rock', 'nh:spellbook_of_force_bolt']);
  });

  test('a blast fractures a statue 9 times in 10: "The statue of a jackal crumbles."', () => {
    let crumbled = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      const st = mkcorpstat(ctxOf(s), 'nh:jackal' as DefId, at(6, 2));
      const said: string[] = [];
      const ctx = {
        ...ctxOf(s),
        emit: (e: { type: string; key?: string; params?: never }) => {
          if (e.type === 'msg') said.push(render({ key: e.key!, params: e.params ?? {} }));
        },
      } as unknown as Ctx;
      scatter(ctx, 6, 2, 4, { mayFracture: true });
      // the rocks are scattered in turn (and may merge where they land)
      const left = Object.values(s.state.entities).filter((e) => e.def === STATUE);
      if (said.includes('The statue of a jackal crumbles.')) {
        expect(left).toEqual([]);
        crumbled++;
      } else expect(left.map((e) => e.id)).toEqual([st]); // blown away whole
    }
    expect(crumbled).toBeGreaterThan(12);
  });
});

describe('meeting a statue', () => {
  test('stepping onto one: "You see here a statue of a jackal."', () => {
    const s = make();
    mkcorpstat(ctxOf(s), 'nh:jackal' as DefId, at(HX + 1, HY));
    const out = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(out).toContain('You see here a statue of a jackal.');
    expect(getPlayer(s.state).c.pos).toMatchObject({ x: HX + 1, y: HY });
  });

  test('"F" at a statue: "You harmlessly attack a statue."; the Fight offer', () => {
    const s = make();
    mkcorpstat(ctxOf(s), 'nh:jackal' as DefId, at(HX + 1, HY));
    s.step({ type: 'wait' });
    const offers = createQuery(defs, s.state).actionsFor({
      kind: 'cell',
      pos: { x: HX + 1, y: HY },
    });
    expect(offers.some((o) => o.action.type === 'mod' && o.action.action === 'nh:fight')).toBe(
      true,
    );
    expect(s.text(s.mod('nh:fight', { dir: 'e' }))).toEqual(['You harmlessly attack a statue.']);
  });

  test('kicking one: "Thump!" (too heavy to move)', () => {
    const s = make();
    const st = mkcorpstat(ctxOf(s), 'nh:gnome_lord' as DefId, at(HX + 1, HY));
    const out = s.text(s.mod('nh:kick'));
    out.push(...s.text(answer(s, 'e')));
    expect(out.slice(0, 2)).toEqual(['You kick a statue of a gnome lord.', 'Thump!']);
    expect(ent(s, st).c.pos).toMatchObject({ x: HX + 1, y: HY });
  });
});

describe('wishing for statues', () => {
  const wish = (s: S, text: string): Entity => {
    const spec = readobjnam(text, wishNames(s.state, defs, messagesEn), { wizard: true });
    if (spec === null || spec === 'nothing') throw new Error(`no spec for ${text}`);
    const id = mkWished(ctxOf(s), spec, { wizard: true });
    return ent(s, id!);
  };

  test('"statue of a gnome king", "gnome king statue", "historic statue of a newt"', () => {
    const s = make();
    expect(wish(s, 'statue of a gnome king').c.item!.corpseOf).toBe('nh:gnome_king');
    expect(wish(s, 'gnome king statue').c.item!.corpseOf).toBe('nh:gnome_king');
    const newt = wish(s, 'historic statue of a newt');
    expect(newt.c.item!.corpseOf).toBe('nh:newt');
    expect(isHistoric(s.state, newt.id)).toBe(true);
    expect(newt.c.item!.spe).toBe(0);
  });

  test('a very small monster: no spellbook inside', () => {
    const s = make();
    getLevel(s.state).depth = 50;
    for (let i = 0; i < 30; i++) {
      const st = wish(s, 'statue of a newt');
      expect(contents(s.state, st.id)).toEqual([]);
    }
  });

  test('a were beast form becomes its human form', () => {
    const s = make();
    expect(wish(s, 'statue of a werejackal').c.item!.corpseOf).toBe('nh:human_werejackal');
  });
});
