// m14 step 3: monster item use, the offensive wands. A hostile lined up with the hero zaps its
// wand of fire (the first bolt always misses, later ones can hit), sleep (not while she is
// helpless), striking (by her AC; "Boing!" against magic resistance, which the monsters seeing her
// then remember), teleportation (when she stands on the stairs) or undead turning (when she
// carries a corpse); ray wands are skipped once it has seen her reflect one or when it is next to
// her; it may move and then zap; an angry shopkeeper zaps his wand of striking. Outcomes are
// asserted; random rolls are searched over seeds.
import {
  getPlayer,
  type Ctx,
  type DefId,
  type EntityId,
  type GameEvent,
  type GameState,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkSpecialRoom, eshkOf, mksobj, stockShops, updateWornProps } from '../src/index';
import { findOffensive, useOffensive } from '../src/muse';
import { M_SEEN, mSeenres, mwandexp, setMwandexp } from '../src/musestate';
import { isKnown } from '../src/o_init';
import { P, setIntrinsic } from '../src/props';
import { rileShk } from '../src/shk';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { addMon, setup } from './helpers';
import { ctxFor, defs, levelSetup, obj, plainKit, render } from './itemHelpers';

const ROOM = [
  '               ',
  ' ............. ',
  ' ............. ',
  ' ......@...... ',
  ' ............. ',
  ' ............. ',
  '               ',
];

function make(seed = 1, rows = ROOM) {
  const s = levelSetup(rows, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  return s;
}
const ent = (state: GameState, id: EntityId) => state.entities[String(id)];
const msgs = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) =>
    e.type === 'msg' ? [render({ key: e.key, ...(e.params ? { params: e.params } : {}) })] : [],
  );
const textOf = (r: StepResult): string[] => msgs(r.events);
/** A hostile awake hill orc (or `def`) at (x, y) with `hp` hit points. */
function orc(state: GameState, x: number, y: number, hp = 20, def = 'nh:hill_orc'): EntityId {
  const id = addMon(state, def, x, y, { asleep: false, energy: 12 });
  const e = ent(state, id)!;
  e.c.hp = { cur: hp, max: hp };
  e.c.monster!.level = 1;
  return id;
}
/** Gives the monster (or the hero) a new object. */
function give(state: GameState, mon: EntityId, otyp: string, spe?: number, corpseOf?: string) {
  const id = mksobj(ctxFor(state), obj(otyp), {
    init: false,
    carriedBy: mon,
    ...(corpseOf ? { corpseOf: corpseOf as DefId } : {}),
  });
  const it = state.entities[String(id)]!.c.item!;
  it.buc = 'uncursed';
  if (spe !== undefined) it.spe = spe;
  return id;
}
/** A test ctx (its rng is the state's) that can stop the hero's running. */
function tctx(state: GameState): Ctx & { events: GameEvent[] } {
  const c = ctxFor(state);
  return Object.assign(c, { interrupt: () => undefined }) as unknown as Ctx & {
    events: GameEvent[];
  };
}
/** findOffensive() then useOffensive() for the monster, outside its move; the messages. */
function use(state: GameState, id: EntityId): { kind: string | null; text: string[] } {
  const ctx = tctx(state);
  const c = findOffensive(ctx, id);
  if (c) useOffensive(ctx, id, c);
  return { kind: c?.kind ?? null, text: msgs(ctx.events) };
}
const kindOf = (state: GameState, id: EntityId): string | null =>
  findOffensive(tctx(state), id)?.kind ?? null;
const heroHp = (state: GameState): number => getPlayer(state).c.hp!.cur;
const ZAPS = /^The hill orc zaps an? .*wand.*!$/;

describe('ray wands', () => {
  test('a hostile lined up with her zaps its wand of fire; the first bolt never hits', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = make(seed);
      const id = orc(s.state, 11, 3, 200);
      const w = give(s.state, id, 'nh:wand_of_fire', 5);
      expect(mwandexp({ state: s.state }, id)).toBe(false);
      const r = use(s.state, id);
      expect(r.kind).toBe('wan_fire');
      expect(r.text.some((m) => ZAPS.test(m))).toBe(true);
      expect(r.text.some((m) => /hits you/.test(m))).toBe(false);
      expect(heroHp(s.state)).toBe(500);
      expect(ent(s.state, id)!.c.hp!.cur).toBe(200); // nor itself on the bounce
      expect(ent(s.state, w)!.c.item!.spe).toBe(4);
      expect(mwandexp({ state: s.state }, id)).toBe(true);
      expect(isKnown(s.state, defs, 'nh:wand_of_fire' as DefId)).toBe(true);
    }
  });

  test('once it has zapped one, its bolts can hit her', () => {
    let hits = 0;
    for (let seed = 1; seed <= 40 && hits === 0; seed++) {
      const s = make(seed);
      const id = orc(s.state, 11, 3, 200);
      give(s.state, id, 'nh:wand_of_fire', 5);
      setMwandexp({ state: s.state }, id);
      const r = use(s.state, id);
      if (!r.text.includes('The bolt of fire hits you!')) continue;
      hits++;
      expect(heroHp(s.state)).toBeLessThan(500);
    }
    expect(hits).toBe(1);
  });

  test('no wand when she is not in line, when it is peaceful, or for an animal', () => {
    const s = make();
    const id = orc(s.state, 10, 4);
    give(s.state, id, 'nh:wand_of_fire', 5);
    expect(kindOf(s.state, id)).toBeNull();
    const p = orc(s.state, 11, 3);
    give(s.state, p, 'nh:wand_of_fire', 5);
    expect(kindOf(s.state, p)).toBe('wan_fire');
    ent(s.state, p)!.c.monster!.peaceful = true;
    expect(kindOf(s.state, p)).toBeNull();
  });

  test('next to her it does not zap a ray, but strikes; from afar a ray wand wins', () => {
    const s = make();
    const id = orc(s.state, 8, 3);
    give(s.state, id, 'nh:wand_of_fire', 5);
    expect(kindOf(s.state, id)).toBeNull();
    give(s.state, id, 'nh:wand_of_striking', 5);
    expect(kindOf(s.state, id)).toBe('wan_striking');
    const far = orc(s.state, 11, 3);
    give(s.state, far, 'nh:wand_of_striking', 5);
    give(s.state, far, 'nh:wand_of_cold', 5);
    give(s.state, far, 'nh:wand_of_fire', 0); // empty: not chosen
    // once the cold wand is chosen, the objects after it stop at its nomore()
    expect(kindOf(s.state, far)).toBe('wan_cold');
  });

  test('a wand of sleep is not zapped at a helpless hero', () => {
    const s = make();
    const id = orc(s.state, 11, 3);
    give(s.state, id, 'nh:wand_of_sleep', 5);
    expect(kindOf(s.state, id)).toBe('wan_sleep');
    getPlayer(s.state).c.helpless = { until: s.state.turn + 10, reasonKey: 'helpless.asleep' };
    expect(kindOf(s.state, id)).toBeNull();
  });

  test('after she reflects a bolt, monsters that saw it skip their ray wands', () => {
    let reflected = 0;
    for (let seed = 1; seed <= 60 && reflected === 0; seed++) {
      const s = make(seed);
      const amu = give(s.state, s.state.playerId, 'nh:amulet_of_reflection');
      ent(s.state, amu)!.c.item!.equipped = 'amulet';
      updateWornProps(s.state, defs, s.state.playerId);
      const id = orc(s.state, 11, 3, 500);
      give(s.state, id, 'nh:wand_of_fire', 5);
      setMwandexp({ state: s.state }, id);
      const watcher = orc(s.state, 7, 1, 500);
      give(s.state, watcher, 'nh:wand_of_cold', 5);
      expect(kindOf(s.state, watcher)).toBe('wan_cold');
      const r = use(s.state, id);
      if (!r.text.some((m) => /reflects from your/.test(m))) continue;
      reflected++;
      expect(heroHp(s.state)).toBe(500);
      expect(mSeenres({ state: s.state }, id, M_SEEN.refl)).toBe(true);
      expect(mSeenres({ state: s.state }, watcher, M_SEEN.refl)).toBe(true);
      if (ent(s.state, id)) expect(kindOf(s.state, id)).toBeNull();
      expect(kindOf(s.state, watcher)).toBeNull();
    }
    expect(reflected).toBe(1);
  });

  test('a hero seen resisting fire is not zapped with fire again; seen hurt, she is', () => {
    let resisted = 0;
    for (let seed = 1; seed <= 60 && resisted === 0; seed++) {
      const s = make(seed);
      setIntrinsic(getPlayer(s.state), P.FIRE_RES, true);
      const id = orc(s.state, 11, 3, 500);
      give(s.state, id, 'nh:wand_of_fire', 5);
      setMwandexp({ state: s.state }, id);
      const r = use(s.state, id);
      if (!r.text.includes("You don't feel hot!")) continue;
      resisted++;
      expect(mSeenres({ state: s.state }, id, M_SEEN.fire)).toBe(true);
      expect(kindOf(s.state, id)).toBeNull();
    }
    expect(resisted).toBe(1);
  });
});

describe('striking', () => {
  test('its first strike at her misses; then it hits by her AC for 2d12', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = make(seed);
      const id = orc(s.state, 8, 3);
      give(s.state, id, 'nh:wand_of_striking', 5);
      const r = use(s.state, id);
      expect(r.kind).toBe('wan_striking');
      expect(r.text).toContain('The wand misses you.');
      expect(heroHp(s.state)).toBe(500);
      expect(mwandexp({ state: s.state }, id)).toBe(true);
    }
    let hit = 0;
    let missed = 0;
    for (let seed = 1; seed <= 60 && (hit === 0 || missed === 0); seed++) {
      const s = make(seed);
      const id = orc(s.state, 8, 3);
      give(s.state, id, 'nh:wand_of_striking', 5);
      setMwandexp({ state: s.state }, id);
      const r = use(s.state, id);
      if (r.text.includes('The wand hits you!')) {
        hit++;
        const lost = 500 - heroHp(s.state);
        expect(lost).toBeGreaterThanOrEqual(2);
        expect(lost).toBeLessThanOrEqual(24);
        expect(isKnown(s.state, defs, 'nh:wand_of_striking' as DefId)).toBe(true);
      } else {
        expect(r.text).toContain('The wand misses you.');
        expect(heroHp(s.state)).toBe(500);
        missed++;
      }
    }
    expect(hit).toBeGreaterThan(0);
    expect(missed).toBeGreaterThan(0);
  });

  test('magic resistance: "Boing!", and the monsters that saw it stop striking', () => {
    const s = make();
    setIntrinsic(getPlayer(s.state), P.ANTIMAGIC, true);
    const id = orc(s.state, 8, 3);
    give(s.state, id, 'nh:wand_of_striking', 5);
    const r = use(s.state, id);
    expect(r.text).toContain('Boing!');
    expect(heroHp(s.state)).toBe(500);
    expect(mSeenres({ state: s.state }, id, M_SEEN.magr)).toBe(true);
    expect(kindOf(s.state, id)).toBeNull();
  });

  test('it zaps instead of hitting her in melee', () => {
    const s = make();
    const id = orc(s.state, 8, 3);
    const w = give(s.state, id, 'nh:wand_of_striking', 5);
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => ZAPS.test(m))).toBe(true);
    expect(t.some((m) => /^The hill orc (hits|misses)/.test(m))).toBe(false);
    expect(ent(s.state, w)!.c.item!.spe).toBe(4);
  });

  test('the strike breaks a closed door behind her', () => {
    const s = setup(['   ', ' +@..   ', '   '], 1);
    const id = addMon(s.state, 'nh:hill_orc', 4, 1);
    ent(s.state, id)!.c.hp = { cur: 20, max: 20 };
    give(s.state, id, 'nh:wand_of_striking', 5);
    const ctx = tctx(s.state);
    const c = findOffensive(ctx, id);
    expect(c?.kind).toBe('wan_striking');
    useOffensive(ctx, id, c!);
    expect(terrainIdAt(s.level, 1, 1)).toBe(T.doorway);
    expect(msgs(ctx.events)).toContain('The door crashes open!');
  });
});

describe('teleportation and undead turning', () => {
  test('she is teleported off the stairs; not zapped elsewhere', () => {
    const s = make();
    const id = orc(s.state, 8, 3);
    const w = give(s.state, id, 'nh:wand_of_teleportation', 5);
    expect(kindOf(s.state, id)).toBeNull();
    setTerrain(s.state.levels['dlvl1']!, 7, 3, T.stairs_down);
    expect(kindOf(s.state, id)).toBe('wan_tele');
    const t = textOf(s.step({ type: 'wait' }));
    expect(t.some((m) => ZAPS.test(m))).toBe(true);
    const hp = getPlayer(s.state).c.pos!;
    expect(hp.x !== 7 || hp.y !== 3).toBe(true);
    expect(ent(s.state, w)!.c.item!.spe).toBe(4);
  });

  test('teleport control spares her the zap', () => {
    const s = make();
    setTerrain(s.state.levels['dlvl1']!, 7, 3, T.stairs_down);
    setIntrinsic(getPlayer(s.state), P.TELEPORT_CONTROL, true);
    const id = orc(s.state, 8, 3);
    give(s.state, id, 'nh:wand_of_teleportation', 5);
    expect(kindOf(s.state, id)).toBeNull();
  });

  test('a wand of undead turning is zapped at a hero carrying a corpse, or past one', () => {
    const s = make();
    const id = orc(s.state, 11, 3);
    give(s.state, id, 'nh:wand_of_undead_turning', 5);
    expect(kindOf(s.state, id)).toBeNull();
    // a corpse on the floor up to 3 squares beyond her, in line
    const c = mksobj(ctxFor(s.state), obj('nh:corpse'), {
      init: false,
      at: { level: 'dlvl1', x: 5, y: 3 },
      corpseOf: 'nh:jackal' as DefId,
    });
    expect(kindOf(s.state, id)).toBe('wan_undead_turning');
    delete s.state.entities[String(c)];
    expect(kindOf(s.state, id)).toBeNull();
    give(s.state, s.state.playerId, 'nh:corpse', undefined, 'nh:jackal');
    expect(kindOf(s.state, id)).toBe('wan_undead_turning');
  });
});

describe('the mattacku() hook', () => {
  test('a monster with no ranged attack moves and then zaps', () => {
    const s = make(1, ['           ', ' @........ ', '           ']);
    const id = orc(s.state, 9, 1, 20, 'nh:homunculus');
    give(s.state, id, 'nh:wand_of_striking', 5);
    const t = textOf(s.step({ type: 'wait' }));
    expect(ent(s.state, id)!.c.pos!.x).toBe(8);
    expect(t.some((m) => /^The homunculus zaps an? .*wand.*!$/.test(m))).toBe(true);
    expect(mwandexp({ state: s.state }, id)).toBe(true);
  });

  test('an angry shopkeeper zaps his wand of striking', () => {
    const s = setup(['-------   ', '|.....|   ', '|.....+...', '|.....|   ', '-------   '], 1);
    s.level.rooms = [{ lx: 1, ly: 1, hx: 5, hy: 3, lit: true, type: 'nh:tool_shop' as DefId }];
    const ctx = tctx(s.state);
    stockShops(ctx, s.level);
    const shkId = Object.keys(s.state.entities)
      .map(Number)
      .find((i) => eshkOf(s, i) !== null);
    if (shkId === undefined) throw new Error('no shopkeeper');
    for (const o of Object.values(s.state.entities))
      if (o.c.item && o.c.item.carriedBy === null) delete s.state.entities[String(o.id)];
    // only the wand of striking we give him
    for (const o of Object.values(s.state.entities))
      if (o.c.item?.carriedBy === shkId && defs.object(o.def).class === 'wand')
        delete s.state.entities[String(o.id)];
    Object.assign(getPlayer(s.state).c.pos!, { x: 4, y: 2 });
    checkSpecialRoom(ctx, false);
    give(s.state, shkId, 'nh:wand_of_striking', 5);
    rileShk(tctx(s.state), shkId);
    let zapped = false;
    for (let i = 0; i < 5 && !zapped; i++) {
      const t = msgs(s.engine.stepAll(s.state, { type: 'wait' }).events);
      zapped = t.some((m) => /zaps an? .*wand.*!$/.test(m));
    }
    expect(zapped).toBe(true);
  });
});
