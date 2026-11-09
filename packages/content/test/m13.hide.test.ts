// m13 step 1: hiding monsters. Snakes made with the level hide under their object, ceiling
// hiders (piercers, trappers) are walked under and drop, searching and kicking find them,
// telepathy senses them, a hider-underer attacking from hiding is revealed, an unwatched piercer
// hides again, and a hider whose object goes comes out. Outcomes are asserted; rolls are
// searched or forced.
import { buildSnapshot, getPlayer, type Ctx, type DefId, type EntityId } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { makemon } from '../src/generation';
import {
  canHideUnderObj,
  hideunder,
  isUndetected,
  maybeUnhideAt,
  setUndetected,
} from '../src/hide';
import { uswallow } from '../src/engulfstate';
import { P, setIntrinsic } from '../src/props';
import { addMon } from './helpers';
import { defs, engine, levelSetup, plainKit } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '             ',
  ' ........... ',
  ' ........... ',
  ' .....@..... ',
  ' ........... ',
  ' ........... ',
  '             ',
];

/** A lit room with no monsters; the hero at (6, 3) with no helmet. */
function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities)) {
    const e = s.state.entities[k];
    if (e?.c.monster) delete s.state.entities[k];
    if (e?.c.item?.equipped === 'helm') delete s.state.entities[k];
  }
  s.step({ type: 'wait' });
  return s;
}
const ent = (s: S, id: EntityId) => s.state.entities[String(id)]!;
const shownIds = (s: S): number[] => buildSnapshot(defs, s.state).entities.map((e) => e.id);
const heroPos = (s: S) => {
  const p = getPlayer(s.state).c.pos!;
  return { x: p.x, y: p.y };
};
/** A monster at x,y that does not act (speed 0) unless `speed` is given. */
function mon(s: S, def: string, x: number, y: number, speed = 0): EntityId {
  const id = addMon(s.state, def, x, y);
  const e = ent(s, id);
  e.c.hp = { cur: 100, max: 100 };
  e.c.actor!.speed = speed;
  e.c.monster!.level = defs.monster(def as DefId).level;
  return id;
}
/** A garter snake made with the level at (x, y): it gets an object and hides under it. */
function levelSnake(s: S, x: number, y: number): EntityId {
  const id = makemon(
    s.ctx as unknown as Ctx,
    defs.monster('nh:garter_snake'),
    { x, y },
    { inMklev: true },
  );
  if (id === null) throw new Error('no snake');
  const e = ent(s, id);
  e.c.actor!.speed = 0;
  e.c.hp = { cur: 100, max: 100 };
  return id;
}

describe('hiding under objects', () => {
  test('a snake made with the level hides under its object: not in the view or describe()', () => {
    const s = make();
    const id = levelSnake(s, 8, 3);
    s.step({ type: 'wait' });
    expect(isUndetected(s.ctx, id)).toBe(true);
    expect(canHideUnderObj(s.ctx, 'dlvl1', 8, 3)).toBe(true);
    expect(shownIds(s)).not.toContain(id);
    const d = engine.query(s.state).describe({ x: 8, y: 3 });
    expect(d.entities.some((e) => e.id === id)).toBe(false);
    expect(d.objects.length).toBeGreaterThan(0);
    // the move offer there is a plain move, not an attack
    const offers = engine.query(s.state).actionsFor({ kind: 'cell', pos: { x: 7, y: 3 } });
    expect(offers.some((o) => o.labelKey === 'action.attack')).toBe(false);
  });

  test('moving into it: "Wait!  There\'s a garter snake hiding under ...!", the move is spent', () => {
    const s = make();
    const id = levelSnake(s, 7, 3);
    s.step({ type: 'wait' });
    const turn = s.state.turn;
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(
      text.some((t) => /^Wait! {2}There's a garter snake hiding under (an? |\d+ ).+!$/.test(t)),
    ).toBe(true);
    expect(heroPos(s)).toEqual({ x: 6, y: 3 });
    expect(s.state.turn).toBeGreaterThan(turn);
    expect(isUndetected(s.ctx, id)).toBe(false);
    expect(shownIds(s)).toContain(id);
  });

  test('blind telepathy still senses a hidden monster', () => {
    const s = make();
    const id = levelSnake(s, 9, 3);
    setIntrinsic(getPlayer(s.state), P.TELEPAT, true);
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    s.step({ type: 'wait' });
    expect(isUndetected(s.ctx, id)).toBe(true);
    expect(shownIds(s)).toContain(id);
  });

  test('a hider-underer whose object goes away comes out (maybe_unhide_at())', () => {
    const s = make();
    const id = levelSnake(s, 9, 3);
    expect(isUndetected(s.ctx, id)).toBe(true);
    for (const k of Object.keys(s.state.entities)) {
      const p = s.state.entities[k]?.c.pos;
      if (s.state.entities[k]?.c.item && p?.x === 9 && p.y === 3) delete s.state.entities[k];
    }
    maybeUnhideAt(s.ctx as unknown as Ctx, 'dlvl1', 9, 3);
    expect(isUndetected(s.ctx, id)).toBe(false);
    s.step({ type: 'wait' });
    expect(shownIds(s)).toContain(id);
  });

  test('a few coins are not enough to hide under; a trap square never hides', () => {
    const s = make();
    const id = mon(s, 'nh:garter_snake', 9, 3);
    const g = s.give('nh:gold_piece', { at: { level: 'dlvl1', x: 9, y: 3 } });
    ent(s, g).c.item!.quantity = 9;
    expect(hideunder(s.ctx as unknown as Ctx, id)).toBe(false);
    ent(s, g).c.item!.quantity = 10;
    expect(hideunder(s.ctx as unknown as Ctx, id)).toBe(true);
    // not on a trap square (other than a pit)
    s.state.levels['dlvl1']!.traps.push({ def: 'nh:bear_trap' as DefId, x: 9, y: 3, seen: false });
    expect(hideunder(s.ctx as unknown as Ctx, id)).toBe(false);
  });

  test('attacking from hiding: "The garter snake was hidden under ...!"', () => {
    let seen = false;
    for (let seed = 1; seed <= 20 && !seen; seed++) {
      const s = make(seed);
      const id = levelSnake(s, 7, 3);
      ent(s, id).c.actor!.speed = 12;
      ent(s, id).c.monster!.peaceful = false;
      for (let i = 0; i < 20 && isUndetected(s.ctx, id); i++) {
        const text = s.text(s.step({ type: 'wait' }));
        if (
          !isUndetected(s.ctx, id) &&
          text.some((t) => / was hidden under (an? |\d+ ).+!$/.test(t))
        )
          seen = true;
      }
    }
    expect(seen).toBe(true);
  });

  test('kicking a hidden monster: "There is a garter snake here."', () => {
    const s = make();
    const id = levelSnake(s, 7, 3);
    s.step({ type: 'wait' });
    const r = s.mod('nh:kick');
    const p = s.state.pendingPrompt?.prompt;
    const text = [
      ...s.text(r),
      ...(p ? s.text(engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: 'e' })) : []),
    ];
    expect(text).toContain('There is a garter snake here.');
    expect(isUndetected(s.ctx, id)).toBe(false);
  });
});

describe('hiding on the ceiling', () => {
  test('walking under a hidden piercer: it drops (hit, or almost), then moves next to her', () => {
    let hit = false;
    let missed = false;
    for (let seed = 1; seed <= 30 && !(hit && missed); seed++) {
      const s = make(seed);
      const id = mon(s, 'nh:rock_piercer', 7, 3);
      setUndetected(s.ctx, id, true);
      s.step({ type: 'wait' });
      expect(shownIds(s)).not.toContain(id);
      const hp0 = getPlayer(s.state).c.hp!.cur;
      const text = s.text(s.step({ type: 'move', dir: 'e' }));
      expect(heroPos(s)).toEqual({ x: 7, y: 3 });
      expect(text).toContain('A rock piercer suddenly drops from the ceiling!');
      const p = ent(s, id).c.pos!;
      expect(Math.max(Math.abs(p.x - 7), Math.abs(p.y - 3))).toBe(1);
      expect(isUndetected(s.ctx, id)).toBe(false);
      const lost = hp0 - getPlayer(s.state).c.hp!.cur;
      if (text.includes('You are hit by a falling rock piercer!')) {
        hit = true;
        expect(lost).toBeGreaterThanOrEqual(4);
        expect(lost).toBeLessThanOrEqual(24);
      } else if (text.includes('You are almost hit by a falling rock piercer!')) {
        missed = true;
        expect(lost).toBe(0);
      }
    }
    expect(hit && missed).toBe(true);
  });

  test('a hard helmet takes the blow', () => {
    const s = make();
    const helm = s.carry('nh:helmet');
    ent(s, helm).c.item!.equipped = 'helm';
    const id = mon(s, 'nh:rock_piercer', 7, 3);
    setUndetected(s.ctx, id, true);
    const hp0 = getPlayer(s.state).c.hp!.cur;
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain('Its blow glances off your helm.');
    expect(getPlayer(s.state).c.hp!.cur).toBe(hp0);
  });

  test('searching finds a hidden piercer: "You find a rock piercer."', () => {
    const s = make();
    const id = mon(s, 'nh:rock_piercer', 7, 4);
    setUndetected(s.ctx, id, true);
    s.step({ type: 'wait' });
    const text = s.text(s.step({ type: 'search' }));
    expect(text).toContain('You find a rock piercer.');
    expect(isUndetected(s.ctx, id)).toBe(false);
    expect(shownIds(s)).toContain(id);
  });

  test('a hidden hider stays put and does not attack', () => {
    const s = make();
    const id = mon(s, 'nh:rock_piercer', 7, 3, 12);
    setUndetected(s.ctx, id, true);
    const hp0 = getPlayer(s.state).c.hp!.cur;
    for (let i = 0; i < 10; i++) s.step({ type: 'wait' });
    expect(ent(s, id).c.pos).toMatchObject({ x: 7, y: 3 });
    expect(getPlayer(s.state).c.hp!.cur).toBe(hp0);
    expect(isUndetected(s.ctx, id)).toBe(true);
  });

  test('an unwatched piercer hides again on the floor (restrap()); a watched one does not', () => {
    const s = make();
    const id = mon(s, 'nh:rock_piercer', 10, 1, 12);
    ent(s, id).c.monster!.asleep = true; // stays where it is
    for (let i = 0; i < 10; i++) s.step({ type: 'wait' });
    expect(isUndetected(s.ctx, id)).toBe(false); // she sees its square
    setIntrinsic(getPlayer(s.state), P.BLINDED, true);
    for (let i = 0; i < 30 && !isUndetected(s.ctx, id); i++) s.step({ type: 'wait' });
    expect(isUndetected(s.ctx, id)).toBe(true);
  });

  test('a hidden trapper attacks by surprise, moves next to her, then engulfs her', () => {
    const s = make();
    const id = mon(s, 'nh:trapper', 7, 3, 12);
    setUndetected(s.ctx, id, true);
    const text = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(text).toContain('A trapper attacks you by surprise!');
    const p = ent(s, id).c.pos!;
    expect(Math.max(Math.abs(p.x - 7), Math.abs(p.y - 3))).toBe(1);
    const all: string[] = [];
    for (let i = 0; i < 20 && !uswallow(s.ctx); i++) all.push(...s.text(s.step({ type: 'wait' })));
    expect(uswallow(s.ctx)?.mon).toBe(id);
    expect(all).toContain('The trapper folds itself around you!');
  });
});
