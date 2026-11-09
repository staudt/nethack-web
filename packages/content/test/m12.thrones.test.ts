// m12 step 2: thrones. Sitting on one (sit.c throne_sit_effect(), take_gold()), the genocide's
// ONTHRONE bit (read.c do_genocide()), kicking one (dokick.c dokick() IS_THRONE), digging refused
// (dig.c dig_check(), dighole()) and the wizard's terrain wishes (objnam.c wizterrainwish()).
// Effects are forced by calling throneEffect() with the effect number; the full Sit path is
// checked on states searched for the roll wanted, never on a lucky seed.
import {
  createEngine,
  getLevel,
  getPlayer,
  inventoryOf,
  itemsAt,
  trapAt,
  type Ctx,
  type DefId,
  type GameEvent,
  type GameState,
  type Json,
  type Mod,
  type PlayerAction,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { vanillaMod, wizardMod, WIZ_WISH } from '../src/index';
import { abase, setAbase, type Attr } from '../src/attrstate';
import { adjPitChecks, digCheck, dighole } from '../src/dig';
import { KICK_ID } from '../src/dokick';
import { SIT_ID } from '../src/dosit';
import { FTN_LOOTED, FTN_MAGIC, fountainBits } from '../src/fountain';
import { setHeroFemale } from '../src/gender';
import { dfeatureAt } from '../src/itemactions';
import { mksobj } from '../src/items';
import { setU, uState } from '../src/luck';
import { polymon } from '../src/polyself';
import { P, hasIntrinsic, hasProp, setIntrinsic, setItimeout, timeoutLeft } from '../src/props';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { throneEffect } from '../src/throne';
import { throneLooted, setThroneLooted } from '../src/thronestate';
import { isGenocided } from '../src/vanquished';
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
const wiz = createEngine([vanillaMod, wizardMod, probeMod]);

const ROOM = [
  '             ',
  ' ........... ',
  ' ........... ',
  ' ........... ',
  ' .....@..... ',
  ' ........... ',
  ' ........... ',
  ' ........... ',
  '             ',
];
const BIG = [
  '                    ',
  ...Array.from({ length: 10 }, (_, i) =>
    i === 5 ? ' ........@......... ' : ' ................. ',
  ),
  '                    ',
];
type S = ReturnType<typeof levelSetup>;
const SIT: PlayerAction = { type: 'mod', action: SIT_ID };

/** The hero on a throne in a lit room, her kit uncursed, no random monsters. */
function throneRoom(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  s.step({ type: 'wait' });
  setTerrain(getLevel(s.state), s.here.x, s.here.y, T.throne);
  return s;
}
const textsOf = (events: readonly GameEvent[]): string[] =>
  events.flatMap((e) => (e.type === 'msg' ? [render({ key: e.key, params: e.params ?? {} })] : []));
function run(state: GameState, fn: (ctx: Ctx) => void, engine = eng): string[] {
  probe.fn = fn;
  return textsOf(engine.step(state, { type: 'mod', action: 'pt:run' }).events);
}
function answer(state: GameState, value: Json, engine = eng): string[] {
  const id = state.pendingPrompt?.prompt.id ?? '';
  return textsOf(engine.step(state, { type: 'answer', promptId: id, value }).events);
}
const effect = (s: S, n: number): string[] =>
  run(s.state, (ctx) =>
    throneEffect(ctx, SIT_ID, n, { level: s.here.level, x: s.here.x, y: s.here.y }),
  );
const hero = (state: GameState) => getPlayer(state);
const terrainHere = (s: S, state = s.state): DefId | undefined =>
  terrainIdAt(getLevel(state, s.here.level), s.here.x, s.here.y);
const monsters = (state: GameState) =>
  Object.values(state.entities).filter((e) => e.c.monster && e.id !== state.playerId);
const gold = (state: GameState): number =>
  inventoryOf(state, state.playerId)
    .filter((o) => o.def === 'nh:gold_piece')
    .reduce((a, o) => a + (o.c.item?.quantity ?? 0), 0);

/**
 * Copies of `s`'s state with the RNG advanced by 0, 1, 2... draws, each given `act` until
 * `pred` holds: the outcome wanted without depending on the seed.
 */
function search(
  s: S,
  pred: (state: GameState, text: string[]) => boolean,
  act: PlayerAction = SIT,
  engine = eng,
): { state: GameState; text: string[] } {
  for (let k = 0; k < 600; k++) {
    const state = JSON.parse(JSON.stringify(s.state)) as GameState;
    run(
      state,
      (ctx) => {
        for (let i = 0; i < k; i++) ctx.rng.rn2(2);
      },
      engine,
    );
    const text = textsOf(engine.stepAll(state, act).events);
    if (pred(state, text)) return { state, text };
  }
  throw new Error('no such outcome');
}

describe('sitting on a throne', () => {
  test('"You sit on the opulent throne."; no effect: "You feel somehow out of place..."', () => {
    const s = throneRoom();
    const turn = s.state.turn;
    const { state, text } = search(s, (_st, t) => t.includes('You feel somehow out of place...'));
    expect(text[0]).toBe('You sit on the opulent throne.');
    expect(state.turn).toBe(turn + 1);
  });

  test('a prince form feels very comfortable', () => {
    const s = throneRoom();
    run(s.state, (ctx) => polymon(ctx, 'nh:gnome_king' as DefId, false));
    for (const o of itemsAt(defs, s.state, s.here.level, s.here.x, s.here.y))
      delete s.state.entities[String(o.id)]; // the dropped gear would be sat on
    const { text } = search(s, (_st, t) => t.some((l) => l.startsWith('You feel very')));
    expect(text).toContain('You feel very comfortable here.');
  });

  test('1 time in 3 the throne vanishes in a puff of logic, into floor and her memory', () => {
    const s = throneRoom();
    const hits = { vanish: 0, stay: 0 };
    let found: GameState | null = null;
    for (let i = 0; i < 2; i++) {
      const r = search(s, (st, t) => {
        const gone = t.includes('The throne vanishes in a puff of logic.');
        return t.includes('You feel somehow out of place...') && gone === (i === 0);
      });
      if (i === 0) found = r.state;
      hits[i === 0 ? 'vanish' : 'stay']++;
      expect(terrainHere(s, r.state)).toBe(i === 0 ? T.floor : T.throne);
    }
    const level = getLevel(found!, s.here.level);
    const idx = s.here.y * level.width + s.here.x;
    expect(level.palette[found!.memory[level.id]![idx]!]).toBe(T.floor);
    expect(hits).toEqual({ vanish: 1, stay: 1 });
  });

  test('an object on the throne is sat on instead', () => {
    const s = throneRoom();
    s.floor('nh:dagger');
    expect(textsOf(eng.stepAll(s.state, SIT).events)).toEqual([
      'You sit on the dagger.',
      "It's not very comfortable...",
    ]);
  });
});

describe('the thirteen effects', () => {
  const ATTRS: Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];
  const sum = (s: S): number => ATTRS.reduce((a, k) => a + abase(s.state, k), 0);

  test('1: an attribute drops by 3..6 and rnd(10) damage ("cursed throne")', () => {
    const s = throneRoom();
    run(s.state, (ctx) => ATTRS.forEach((k) => setAbase(ctx, k, 16)));
    const hp = hero(s.state).c.hp!.cur;
    effect(s, 1);
    expect(16 * 6 - sum(s)).toBeGreaterThanOrEqual(3);
    expect(16 * 6 - sum(s)).toBeLessThanOrEqual(6);
    expect(hp - hero(s.state).c.hp!.cur).toBeGreaterThanOrEqual(1);
    expect(hp - hero(s.state).c.hp!.cur).toBeLessThanOrEqual(10);
    hero(s.state).c.hp!.cur = 1;
    for (let i = 0; i < 20 && !s.state.gameOver; i++) effect(s, 1);
    expect(s.state.gameOver?.killer).toBe('@killer.cursed_throne');
  });

  test('2: an attribute rises by one', () => {
    const s = throneRoom();
    run(s.state, (ctx) => ATTRS.forEach((k) => setAbase(ctx, k, 10)));
    effect(s, 2);
    expect(sum(s)).toBe(61);
  });

  test('3: an electric shock, rnd(30), or rnd(6) when resisted ("electric chair")', () => {
    const s = throneRoom();
    const h = hero(s.state);
    let hp = h.c.hp!.cur;
    expect(effect(s, 3)).toEqual(['A massive electric shock shoots through your body!']);
    expect(hp - h.c.hp!.cur).toBeGreaterThanOrEqual(1);
    expect(hp - h.c.hp!.cur).toBeLessThanOrEqual(30);
    setIntrinsic(h, P.SHOCK_RES, true);
    for (let i = 0; i < 20; i++) {
      hp = h.c.hp!.cur;
      expect(effect(s, 3)).toEqual(['An electric shock shoots through your body!']);
      expect(hp - h.c.hp!.cur).toBeLessThanOrEqual(6);
    }
    setIntrinsic(h, P.SHOCK_RES, false);
    h.c.hp!.cur = 1;
    for (let i = 0; i < 20 && !s.state.gameOver; i++) effect(s, 3);
    expect(s.state.gameOver?.killer).toBe('@killer.electric_chair');
  });

  test('4: much, much better: full HP (max +4 when near it), sight and legs healed', () => {
    const s = throneRoom();
    const h = hero(s.state);
    h.c.hp = { cur: 10, max: 40 };
    setItimeout(s.state, h, P.BLINDED, 50);
    setItimeout(s.state, h, P.WOUNDED_LEGS, 50);
    const t = effect(s, 4);
    expect(t[0]).toBe('You feel much, much better!');
    expect(t).toContain('Your leg feels better.');
    expect(h.c.hp).toEqual({ cur: 40, max: 40 });
    expect(hasProp(h, P.BLINDED)).toBe(false);
    expect(hasProp(h, P.WOUNDED_LEGS)).toBe(false);
    h.c.hp = { cur: 36, max: 40 };
    effect(s, 4);
    expect(h.c.hp).toEqual({ cur: 44, max: 44 });
  });

  test('5: her gold is taken ("You notice you have no gold!"), else a strange sensation', () => {
    const s = throneRoom();
    s.carry('nh:gold_piece', { quantity: 77 });
    expect(gold(s.state)).toBe(77);
    expect(effect(s, 5)).toEqual(['You notice you have no gold!']);
    expect(gold(s.state)).toBe(0);
    expect(effect(s, 5)).toEqual(['You feel a strange sensation.']);
  });

  test('6: a wish through Sit, or with bad base luck "You feel your luck is changing."', () => {
    const s = throneRoom();
    effect(s, 6);
    expect(s.state.pendingPrompt?.handler).toBe(SIT_ID);
    expect(s.state.pendingPrompt?.prompt.key).toBe('wish.prompt');
    answer(s.state, 'blessed +2 dagger');
    expect(s.state.pendingPrompt).toBeNull();
    const d = inventoryOf(s.state, s.state.playerId).find(
      (o) => o.def === 'nh:dagger' && o.c.item?.spe === 2,
    );
    expect(d?.c.item?.buc).toBe('blessed');
    run(s.state, (ctx) => setU(ctx, { luck: -5 }));
    expect(effect(s, 6)).toEqual(['You feel your luck is changing.']);
    expect(uState(s.state).luck).toBe(-4);
  });

  test('7: an audience of courtiers around her ("Sire" or "Dame")', () => {
    const s = throneRoom();
    setHeroFemale(s.state, false);
    const before = monsters(s.state).length;
    const t = effect(s, 7);
    expect(t.slice(0, 2)).toEqual([
      'A voice echoes:',
      '"Thine audience hath been summoned, Sire!"',
    ]);
    expect(monsters(s.state).length).toBeGreaterThan(before);
    setHeroFemale(s.state, true);
    expect(effect(s, 7)[1]).toBe('"Thine audience hath been summoned, Dame!"');
  });

  test('8: genocide through Sit; her own kind dies by "an imperious order"', () => {
    const s = throneRoom();
    const t = effect(s, 8);
    expect(t).toEqual(['A voice echoes:', '"By thine Imperious order, Dame..."']);
    expect(s.state.pendingPrompt?.handler).toBe(SIT_ID);
    expect(answer(s.state, 'jackal').some((l) => l.startsWith('Wiped out all'))).toBe(true);
    expect(isGenocided(s.state, 'nh:jackal' as DefId)).toBe(true);
    effect(s, 8);
    answer(s.state, 'human');
    expect(s.state.gameOver?.killer).toBe('@killer.imperious_order');
  });

  test('9: a curse: with good Luck blindness and Luck lost, else rndcurse()', () => {
    const s = throneRoom();
    run(s.state, (ctx) => setU(ctx, { luck: 3 }));
    const t = effect(s, 9);
    expect(t.slice(0, 2)).toEqual([
      'A voice echoes:',
      '"A curse upon thee for sitting upon this most holy throne!"',
    ]);
    const h = hero(s.state);
    expect(timeoutLeft(s.state, h, P.BLINDED)).toBeGreaterThanOrEqual(250);
    expect([1, 2]).toContain(uState(s.state).luck);
    run(s.state, (ctx) => setU(ctx, { luck: 0 }));
    expect(effect(s, 9)).toContain('You feel a malignant aura surround you.');
  });

  test('10: see invisible ("Your vision becomes clear."), or with it or bad Luck a map', () => {
    const s = throneRoom();
    const h = hero(s.state);
    expect(effect(s, 10)).toEqual(['Your vision becomes clear.']);
    expect(hasIntrinsic(h, P.SEE_INVIS)).toBe(true);
    expect(effect(s, 10)).toEqual(['An image forms in your mind.']);
    // blind: her eyes tingle
    setIntrinsic(h, P.SEE_INVIS, false);
    setItimeout(s.state, h, P.BLINDED, 30);
    expect(effect(s, 10)).toEqual(['Your eyes tingle...']);
  });

  test('11: with bad Luck "You feel threatened." (monsters wake), else teleported', () => {
    const s = throneRoom();
    const m = addMon(s.state, 'nh:jackal', 2, 2, { asleep: true });
    run(s.state, (ctx) => setU(ctx, { luck: -1 }));
    expect(effect(s, 11)).toEqual(['You feel threatened.']);
    expect(s.state.entities[String(m)]?.c.monster?.asleep).toBe(false);
    run(s.state, (ctx) => setU(ctx, { luck: 0 }));
    const t = effect(s, 11);
    expect(t[0]).toBe('You feel a wrenching sensation.');
    const p = hero(s.state).c.pos!;
    const moved = p.x !== s.here.x || p.y !== s.here.y;
    expect(moved || t.includes('You materialize in the same location!')).toBe(true);
  });

  test('12: an insight identifies some of her pack', () => {
    const s = throneRoom();
    s.carry('nh:scroll_of_light');
    const t = effect(s, 12);
    expect(t[0]).toBe('You are granted an insight!');
    // rn2(5): 0 identifies everything, else the menu asks (through the read action)
    const asked = s.state.pendingPrompt?.handler === 'nh:read';
    expect(asked || t.some((l) => l.includes('scroll of light'))).toBe(true);
  });

  test('13: her mind turns into a pretzel (16..22 more turns of confusion)', () => {
    const s = throneRoom();
    expect(effect(s, 13)).toEqual(['Your mind turns into a pretzel!']);
    const c = timeoutLeft(s.state, hero(s.state), P.CONFUSION);
    expect(c).toBeGreaterThanOrEqual(16);
    expect(c).toBeLessThanOrEqual(22);
  });
});

describe('the Sit path with prompts', () => {
  test('a wish asked through Sit: the move and the vanishing roll come with the answer', () => {
    const s = throneRoom();
    const turn = s.state.turn;
    const { state } = search(s, (st) => st.pendingPrompt?.prompt.key === 'wish.prompt');
    expect(state.pendingPrompt?.handler).toBe(SIT_ID);
    expect(state.turn).toBe(turn);
    expect(terrainHere(s, state)).toBe(T.throne);
    answer(state, 'nothing');
    expect(state.pendingPrompt).toBeNull();
    expect(state.turn).toBe(turn + 1);
  });

  test('a controlled wrenching sensation: the position prompt pays for the move', () => {
    const s = throneRoom();
    setIntrinsic(hero(s.state), P.TELEPORT_CONTROL, true);
    const turn = s.state.turn;
    const { state } = search(s, (st) => st.pendingPrompt?.handler === 'nh:tele');
    expect(state.turn).toBe(turn);
    answer(state, { x: 2, y: 2 });
    expect(state.pendingPrompt).toBeNull();
    expect(hero(state).c.pos).toMatchObject({ x: 2, y: 2 });
    expect(state.turn).toBe(turn + 1);
  });

  test('a genocide asked through Sit, by tapping or typing a name', () => {
    const s = throneRoom();
    const { state } = search(s, (st) => st.pendingPrompt?.prompt.key === 'genocide.prompt');
    expect(state.pendingPrompt?.handler).toBe(SIT_ID);
    expect(state.pendingPrompt?.prompt.kind).toBe('text');
    answer(state, 'newt');
    expect(isGenocided(state, 'nh:newt' as DefId)).toBe(true);
    expect(state.pendingPrompt).toBeNull();
  });
});

describe('kicking a throne', () => {
  const kickAt = (dir: string): PlayerAction => ({
    type: 'mod',
    action: KICK_ID,
    args: { dir } as never,
  });
  /** The hero next to a throne to her east (a room big enough for the level below). */
  function nextToThrone(): S & { tx: number; ty: number } {
    const s = levelSetup(BIG, 1);
    plainKit(s.state);
    s.step({ type: 'wait' });
    const tx = s.here.x + 1;
    const ty = s.here.y;
    setTerrain(getLevel(s.state), tx, ty, T.throne);
    hero(s.state).c.hp = { cur: 500, max: 500 };
    return Object.assign(s, { tx, ty });
  }
  const goldAt = (state: GameState, x: number, y: number): number =>
    itemsAt(defs, state, 'dlvl1', x, y)
      .filter((o) => o.def === 'nh:gold_piece')
      .reduce((a, o) => a + (o.c.item?.quantity ?? 0), 0);

  test('with good Luck: coins and gems once, then never again; then it may crash', () => {
    const s = nextToThrone();
    run(s.state, (ctx) => setU(ctx, { luck: 2 }));
    const { state, text } = search(
      s,
      (_st, t) => t.includes('You kick loose some ornamental coins and gems!'),
      kickAt('e'),
    );
    expect(text).toEqual(['You kick loose some ornamental coins and gems!']);
    const loot = itemsAt(defs, state, 'dlvl1', s.tx, s.ty);
    expect(goldAt(state, s.tx, s.ty)).toBeGreaterThanOrEqual(300);
    expect(goldAt(state, s.tx, s.ty)).toBeLessThanOrEqual(500);
    // Luck + 1 gems (two of a kind merge into one pile)
    const gems = loot.filter((o) => defs.object(o.def).class === 'gem');
    expect(gems.reduce((a, o) => a + (o.c.item?.quantity ?? 0), 0)).toBe(3);
    expect(throneLooted(state, 'dlvl1', s.tx, s.ty)).toBe(true);
    // looted: kicks never loot again; 1 time in 3 it crashes (the loot, kicked first, picked up)
    for (const o of loot) delete state.entities[String(o.id)];
    const looted = { ...s, state };
    const crash = search(
      looted,
      (_st, t) => {
        expect(t).not.toContain('You kick loose some ornamental coins and gems!');
        return t.includes('CRASH!  You destroy the throne.');
      },
      kickAt('e'),
    );
    expect(terrainIdAt(getLevel(crash.state, 'dlvl1'), s.tx, s.ty)).toBe(T.floor);
    expect(throneLooted(crash.state, 'dlvl1', s.tx, s.ty)).toBe(false);
  });

  test('with Luck 0 it never gives or breaks: it hurts or the floor opens', () => {
    const s = nextToThrone();
    const { text } = search(s, (_st, t) => t.includes('Ouch!  That hurts!'), kickAt('e'));
    expect(text[0]).toBe('Ouch!  That hurts!');
    // 1 time in 4 the floor opens and she falls to the level below
    const fell = search(
      s,
      (_st, t) => t.includes('The hole in the ceiling above you closes up.'),
      kickAt('e'),
    );
    expect(fell.text[0]).toBe('The floor opens up under you!');
    expect(getLevel(fell.state).dlevel).toBe(2);
    // flying, she does not fall in
    setIntrinsic(hero(s.state), P.FLYING, true);
    const r = search(s, (_st, t) => t.includes('The floor opens up under you!'), kickAt('e'));
    expect(r.text).toEqual([
      'The floor opens up under you!',
      "You don't fall in.",
      'The opening under you closes up.',
    ]);
  });

  test('bad Luck: 1 time in 3 "CRASH!  You destroy the throne." leaving gold', () => {
    const s = nextToThrone();
    run(s.state, (ctx) => setU(ctx, { luck: -3 }));
    const { state } = search(
      s,
      (_st, t) => t.includes('CRASH!  You destroy the throne.'),
      kickAt('e'),
    );
    expect(terrainIdAt(getLevel(state, 'dlvl1'), s.tx, s.ty)).toBe(T.floor);
    const g = goldAt(state, s.tx, s.ty);
    expect(g).toBeGreaterThanOrEqual(1);
    expect(g).toBeLessThanOrEqual(200);
  });
});

describe('thrones as terrain', () => {
  test('digging down on a throne is refused; a dug neighbour says it holds', () => {
    const s = throneRoom();
    const level = getLevel(s.state);
    expect(run(s.state, (ctx) => void dighole(ctx, false, true))).toEqual([
      'The throne is too hard to break apart.',
    ]);
    expect(terrainHere(s)).toBe(T.throne);
    run(s.state, (ctx) => {
      expect(digCheck(ctx, level, s.here.x, s.here.y)).toBe('throne');
      expect(digCheck(ctx, level, s.here.x, s.here.y, true)).toBe('passed');
      expect(adjPitChecks(ctx, level, s.here.x, s.here.y)).toEqual({
        key: 'dig.supporting.throne',
      });
    });
  });

  test('"There is an opulent throne here."; the looted bit is plain modData', () => {
    const s = throneRoom();
    run(s.state, (ctx) => {
      expect(dfeatureAt(ctx, s.here.x, s.here.y)).toBe('@nh:throne');
      setThroneLooted(ctx, s.here.level, s.here.x, s.here.y, true);
    });
    expect(render('@nh:throne')).toBe('opulent throne');
    expect(JSON.parse(JSON.stringify(s.state.modData['nh']))).toMatchObject({
      thrones: { dlvl1: { [String(s.here.y * 13 + s.here.x)]: 1 } },
    });
    run(s.state, (ctx) => setThroneLooted(ctx, s.here.level, s.here.x, s.here.y, false));
    expect((s.state.modData['nh'] as { thrones?: object }).thrones).toEqual({});
  });
});

describe("the wizard's terrain wishes", () => {
  const wish = (s: S, text: string): string[] => {
    wiz.step(s.state, { type: 'mod', action: WIZ_WISH as DefId });
    return answer(s.state, text, wiz);
  };

  test('throne, looted throne, fountains, sink, altars, tree and iron bars under her', () => {
    const s = throneRoom();
    setTerrain(getLevel(s.state), s.here.x, s.here.y, T.floor);
    const items = Object.keys(s.state.entities).length;
    expect(wish(s, 'throne')).toEqual(['A throne.']);
    expect(terrainHere(s)).toBe(T.throne);
    expect(throneLooted(s.state, 'dlvl1', s.here.x, s.here.y)).toBe(false);
    expect(wish(s, 'looted throne')).toEqual(['A throne.']);
    expect(throneLooted(s.state, 'dlvl1', s.here.x, s.here.y)).toBe(true);
    expect(wish(s, 'magic fountain')).toEqual(['A magic fountain.']);
    expect(terrainHere(s)).toBe(T.fountain);
    expect(throneLooted(s.state, 'dlvl1', s.here.x, s.here.y)).toBe(false);
    expect(fountainBits(s.state, 'dlvl1', s.here.x, s.here.y)).toBe(FTN_MAGIC);
    expect(wish(s, 'looted fountain')).toEqual(['A fountain.']);
    expect(fountainBits(s.state, 'dlvl1', s.here.x, s.here.y)).toBe(FTN_LOOTED);
    expect(wish(s, 'sink')).toEqual(['A sink.']);
    expect(fountainBits(s.state, 'dlvl1', s.here.x, s.here.y)).toBe(0);
    expect(wish(s, 'lawful altar')).toEqual(['A lawful altar.']);
    expect(terrainHere(s)).toBe(T.altar_lawful);
    expect(wish(s, 'unaligned altar')).toEqual(['An unaligned altar.']);
    expect(wish(s, 'altar')[0]).toMatch(/^An? (chaotic|neutral|lawful|unaligned) altar\.$/);
    expect(wish(s, 'tree')).toEqual(['A tree.']);
    expect(terrainHere(s)).toBe(T.tree);
    expect(wish(s, 'iron bars')).toEqual(['Iron bars.']);
    expect(terrainHere(s)).toBe(T.iron_bars);
    expect(Object.keys(s.state.entities).length).toBe(items); // no object made
  });

  test('no trap on furniture: "Creation of a pit failed." on a throne', () => {
    const s = throneRoom();
    expect(wish(s, 'pit')).toEqual(['Creation of a pit failed.']);
    expect(trapAt(getLevel(s.state), s.here.x, s.here.y)).toBeUndefined();
  });

  test('a normal wish never makes terrain', () => {
    const s = throneRoom();
    setTerrain(getLevel(s.state), s.here.x, s.here.y, T.floor);
    run(s.state, (ctx) => {
      mksobj(ctx, defs.object('nh:dagger'), { init: false, carriedBy: s.state.playerId });
    });
    effect(s, 6);
    expect(answer(s.state, 'throne')).toContain(
      'Nothing fitting that description exists in the game.',
    );
    expect(terrainHere(s)).toBe(T.floor);
  });
});
