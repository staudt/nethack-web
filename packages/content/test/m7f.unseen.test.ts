// m7f-b step 3: attacking and finding unseen monsters (the hero's side). Walking into an unseen
// monster ("Wait!  There's something there you can't see!"), fighting a remembered `I` with
// nothing there ("You attack thin air."), the Fight offer on a marker, forced fights, searching,
// thrown objects, wands and rays, kicks and attacks by an unseen monster leaving the `I`, and an
// unseen monster that moves away leaving it behind. Monsters are pinned (speed 0, many HP).
import {
  buildSnapshot,
  getPlayer,
  type Ctx,
  type EntityId,
  type GameEvent,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { monsterAttack } from '../src/combat';
import { REMEMBERED_UNSEEN, mapInvisible, markedUnseen, setMinvis } from '../src/invis';
import { addMon } from './helpers';
import { defs, engine, itemOf, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = ['           ', ' ......... ', ' ..@...... ', ' ......... ', '           '];
const HX = 3;
const HY = 2;

/** A lit room with no monsters; the hero at (3, 2). */
function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  for (const k of Object.keys(s.state.entities))
    if (s.state.entities[k]?.c.monster) delete s.state.entities[k];
  s.step({ type: 'wait' });
  return s;
}
const answer = (s: S, value: unknown): StepResult => {
  const p = s.state.pendingPrompt?.prompt;
  if (!p) throw new Error('no prompt');
  return engine.stepAll(s.state, { type: 'answer', promptId: p.id, value: value as never });
};
/** A pinned, invisible monster (speed 0, awake, 1000 HP) at x,y. */
function unseen(s: S, def: string, x: number, y: number): EntityId {
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.hp = { cur: 1000, max: 1000 };
  e.c.actor!.speed = 0;
  setMinvis(s.ctx as unknown as Ctx, e);
  return id;
}
const ent = (s: S, id: EntityId) => s.state.entities[String(id)]!;
const hpOf = (s: S, id: EntityId) => ent(s, id).c.hp!.cur;
const marked = (s: S, x: number, y: number) => markedUnseen(s.ctx as unknown as Ctx, x, y);
const heroAt = (s: S) => {
  const p = getPlayer(s.state).c.pos!;
  return { x: p.x, y: p.y };
};
const fight = (s: S, dir: string) => s.text(s.mod('nh:fight', { dir }));
/** The rendered labels of the offers on a cell. */
const offers = (s: S, x: number, y: number): { id: string; label: string }[] =>
  engine
    .query(s.state)
    .actionsFor({ kind: 'cell', pos: { x, y } })
    .map((o) => ({
      id: o.action.type === 'mod' ? o.action.action : o.action.type,
      label: render({ key: o.labelKey, ...(o.params ? { params: o.params } : {}) }),
    }));

describe('walking into an unseen monster', () => {
  test('"Wait!" maps the `I` and spends the move; the next step attacks it', () => {
    const s = make();
    const id = unseen(s, 'nh:jackal', HX + 1, HY);
    const turn = s.state.turn;
    const t1 = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(t1).toContain("Wait!  There's something there you can't see!");
    expect(s.state.turn).toBeGreaterThan(turn);
    expect(marked(s, HX + 1, HY)).toBe(true);
    expect(hpOf(s, id)).toBe(1000);
    expect(heroAt(s)).toEqual({ x: HX, y: HY });
    // the view shows the `I` on the visible square
    const w = s.state.levels['dlvl1']!.width;
    const cell = buildSnapshot(defs, s.state).cells[HY * w + HX + 1];
    expect(cell?.v).toBe(true);
    expect(cell?.m).toBe(REMEMBERED_UNSEEN);
    // the `I` is known now: walking attacks it ("You hit it." / "You miss it.")
    const t2 = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(t2.join(' ')).not.toContain('Wait!');
    expect(t2.some((l) => /^You (hit|miss) it[.!]/.test(l))).toBe(true);
    expect(heroAt(s)).toEqual({ x: HX, y: HY });
  });

  test('a peaceful unseen monster gets no "Really attack?" and is angered by the bump', () => {
    const s = make();
    const id = unseen(s, 'nh:jackal', HX + 1, HY);
    ent(s, id).c.monster!.peaceful = true;
    const t = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(t).toContain("Wait!  There's something there you can't see!");
    expect(s.state.pendingPrompt).toBeFalsy();
    expect(ent(s, id).c.monster!.peaceful).toBe(false);
  });

  test('an unseen pet is not displaced: "Wait!", and it stays tame', () => {
    const s = make();
    const id = unseen(s, 'nh:little_dog', HX + 1, HY);
    ent(s, id).c.monster!.peaceful = true;
    ent(s, id).c.monster!.tame = 10;
    const t = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(t).toContain("Wait!  There's something there you can't see!");
    expect(heroAt(s)).toEqual({ x: HX, y: HY });
    expect(ent(s, id).c.pos).toMatchObject({ x: HX + 1, y: HY });
    expect(ent(s, id).c.monster!.tame).toBe(10);
  });
});

describe('a remembered `I` with nothing there', () => {
  test('the Fight offer replaces the move offer on the marker', () => {
    const s = make();
    mapInvisible(s.ctx as unknown as Ctx, HX + 1, HY);
    const o = offers(s, HX + 1, HY);
    expect(o).toContainEqual({ id: 'nh:fight', label: 'Fight it' });
    expect(o.some((x) => x.id === 'move')).toBe(false);
    // an empty cell next to her still offers the move
    expect(offers(s, HX - 1, HY).some((x) => x.id === 'move')).toBe(true);
  });

  test('walking into it: "You attack thin air.", the `I` goes, the move is spent', () => {
    const s = make();
    mapInvisible(s.ctx as unknown as Ctx, HX + 1, HY);
    const turn = s.state.turn;
    const t = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(t).toContain('You attack thin air.');
    expect(marked(s, HX + 1, HY)).toBe(false);
    expect(heroAt(s)).toEqual({ x: HX, y: HY });
    expect(s.state.turn).toBeGreaterThan(turn);
    // now it is plain floor: walking moves her
    s.step({ type: 'move', dir: 'e' });
    expect(heroAt(s)).toEqual({ x: HX + 1, y: HY });
  });

  test('the Fight offer does the same', () => {
    const s = make();
    mapInvisible(s.ctx as unknown as Ctx, HX, HY + 1);
    expect(fight(s, 's')).toContain('You attack thin air.');
    expect(marked(s, HX, HY + 1)).toBe(false);
  });

  test('an unseen monster that moves away leaves its `I` behind', () => {
    const s = make();
    const id = unseen(s, 'nh:jackal', HX + 1, HY);
    s.step({ type: 'move', dir: 'e' }); // "Wait!"
    Object.assign(ent(s, id).c.pos!, { x: HX + 4, y: HY });
    s.step({ type: 'wait' });
    expect(marked(s, HX + 1, HY)).toBe(true);
    expect(marked(s, HX + 4, HY)).toBe(false);
    expect(s.text(s.step({ type: 'move', dir: 'e' }))).toContain('You attack thin air.');
  });

  test('travel walks through it, forgetting it', () => {
    const s = make();
    mapInvisible(s.ctx as unknown as Ctx, HX + 1, HY);
    s.mod('nh:travel', { x: HX + 2, y: HY });
    expect(heroAt(s)).toEqual({ x: HX + 2, y: HY });
    expect(marked(s, HX + 1, HY)).toBe(false);
  });
});

describe('a forced fight at an unseen monster', () => {
  test('no "Wait!": she attacks, and the `I` is left where she struck', () => {
    const s = make();
    unseen(s, 'nh:jackal', HX + 1, HY);
    const t = fight(s, 'e');
    expect(t.join(' ')).not.toContain('Wait!');
    expect(t.some((l) => /^You (hit|miss) it[.!]/.test(l))).toBe(true);
    expect(marked(s, HX + 1, HY)).toBe(true);
  });
});

describe('searching', () => {
  test('finds an adjacent unseen monster once; a stale `I` is forgotten', () => {
    const s = make();
    unseen(s, 'nh:jackal', HX + 1, HY + 1);
    mapInvisible(s.ctx as unknown as Ctx, HX - 1, HY - 1); // nothing there
    const t1 = s.text(s.step({ type: 'search' }));
    expect(t1).toContain('You feel an unseen monster!');
    expect(marked(s, HX + 1, HY + 1)).toBe(true);
    // x outer, y inner: (2,1) comes first and is cleared before the monster is found
    expect(marked(s, HX - 1, HY - 1)).toBe(false);
    const t2 = s.text(s.step({ type: 'search' }));
    expect(t2).not.toContain('You feel an unseen monster!');
    expect(marked(s, HX + 1, HY + 1)).toBe(true);
  });

  test('a monster she sees is not "found"', () => {
    const s = make();
    const id = addMon(s.state, 'nh:jackal', HX + 1, HY);
    ent(s, id).c.actor!.speed = 0;
    s.step({ type: 'wait' });
    expect(s.text(s.step({ type: 'search' }))).not.toContain('You feel an unseen monster!');
    expect(marked(s, HX + 1, HY)).toBe(false);
  });
});

describe('ranged hits on unseen monsters', () => {
  test('a thrown dagger stopped by an unseen monster maps the `I`; one flying over an `I` clears it', () => {
    const s = make();
    unseen(s, 'nh:jackal', HX + 4, HY);
    mapInvisible(s.ctx as unknown as Ctx, HX + 2, HY);
    const dagger = s.carry('nh:dagger');
    s.mod('nh:throw', { item: dagger });
    answer(s, 'e');
    expect(marked(s, HX + 2, HY)).toBe(false);
    expect(marked(s, HX + 4, HY)).toBe(true);
  });

  test('a wand of probing maps the `I` on an unseen monster', () => {
    const s = make();
    unseen(s, 'nh:jackal', HX + 2, HY);
    const wand = s.carry('nh:wand_of_probing');
    itemOf(s.state, wand).spe = 5;
    s.mod('nh:zap', { item: wand });
    answer(s, 'e');
    expect(marked(s, HX + 2, HY)).toBe(true);
  });

  test('a ray crossing an unseen monster maps the `I`', () => {
    const s = make();
    unseen(s, 'nh:jackal', HX + 2, HY);
    const wand = s.carry('nh:wand_of_sleep');
    itemOf(s.state, wand).spe = 5;
    s.mod('nh:zap', { item: wand });
    answer(s, 'e');
    expect(marked(s, HX + 2, HY)).toBe(true);
  });

  test('a kick at an unseen monster leaves the `I`; a kick at an empty `I` clears it', () => {
    const s = make();
    unseen(s, 'nh:jackal', HX + 1, HY);
    s.mod('nh:kick', { dir: 'e' });
    expect(marked(s, HX + 1, HY)).toBe(true);
    mapInvisible(s.ctx as unknown as Ctx, HX - 1, HY);
    s.mod('nh:kick', { dir: 'w' });
    expect(marked(s, HX - 1, HY)).toBe(false);
  });
});

describe('an unseen monster attacking her', () => {
  test('hit or miss, she remembers it as `I`', () => {
    const s = make();
    const id = unseen(s, 'nh:jackal', HX + 1, HY + 1);
    const out: GameEvent[] = [];
    monsterAttack(
      {
        ...s.ctx,
        emit: (e: GameEvent) => void out.push(e),
        interrupt() {},
      } as unknown as Ctx,
      id,
    );
    expect(out.some((e) => e.type === 'msg')).toBe(true);
    expect(marked(s, HX + 1, HY + 1)).toBe(true);
  });
});

describe('a visible monster', () => {
  test('is attacked at once and never leaves an `I`', () => {
    const s = make();
    const id = addMon(s.state, 'nh:jackal', HX + 1, HY);
    ent(s, id).c.hp = { cur: 1000, max: 1000 };
    ent(s, id).c.actor!.speed = 0;
    s.step({ type: 'wait' });
    const t = s.text(s.step({ type: 'move', dir: 'e' }));
    expect(t.join(' ')).not.toContain('Wait!');
    expect(t.some((l) => /^You (hit|miss) the jackal[.!]/.test(l))).toBe(true);
    expect(marked(s, HX + 1, HY)).toBe(false);
  });
});
