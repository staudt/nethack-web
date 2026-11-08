// m7f-b step 4: monsters and an invisible hero. set_apparxy()'s guess (a monster she is invisible
// to finds her one time in three, else picks a square next to her), mattacku() at a wrong guess
// (wildmiss(), gulping air, exploding at thin air), the -2 to-hit, ranged attacks aimed at the
// guess, spellcasters cursing in her general direction and casting disappear, could_seduce(),
// m_move()'s mfndpos() guess square, and the Watch and peaceful witnesses that cannot see her.
// Monsters are pinned (speed 0, many HP) and outcomes are counted over many tries.
import { getPlayer, type Ctx, type EntityId, type GameEvent, type Pos } from '@nh/core';
import { describe, expect, test } from 'vitest';
import { couldseeAt, invisTo, mCanSeeU, setApparxy } from '../src/apparxy';
import { monsterAttack, monsterToHit } from '../src/combat';
import { castmu, spellWouldBeUseless } from '../src/mcastu';
import { explmu } from '../src/mhitu';
import { mfndpos } from '../src/monmove';
import { thrwmu } from '../src/mthrowu';
import { monInvisible, setMinvis } from '../src/invis';
import { setMspecUsed } from '../src/mstate';
import { P, setIntrinsic } from '../src/props';
import { couldSeduce } from '../src/steal';
import { cellRules, createRng, seedRng } from '@nh/core';
import { mongets } from '../src/index';
import { addMon } from './helpers';
import { defs, levelSetup, plainKit, render } from './itemHelpers';

type S = ReturnType<typeof levelSetup>;

const ROOM = [
  '             ',
  ' ........... ',
  ' ........... ',
  ' ....@...... ',
  ' ........... ',
  ' ........... ',
  '             ',
];
const HX = 5;
const HY = 3;

function make(seed = 1): S {
  const s = levelSetup(ROOM, seed);
  plainKit(s.state);
  return s;
}
const ctxOf = (s: S): Ctx => s.ctx as unknown as Ctx;
/** A ctx that collects its messages, rendered. */
function talk(s: S): { ctx: Ctx; said: string[] } {
  const said: string[] = [];
  const ctx = {
    ...s.ctx,
    emit: (e: GameEvent) => {
      if (e.type === 'msg')
        said.push(render({ key: e.key, ...(e.params ? { params: e.params } : {}) }));
    },
    interrupt() {},
    ask() {},
  } as unknown as Ctx;
  return { ctx, said };
}
/** A pinned monster (speed 0, awake, 1000 HP) at x,y. */
function pinned(s: S, def: string, x: number, y: number, level = 0): EntityId {
  const id = addMon(s.state, def, x, y);
  const e = s.state.entities[String(id)]!;
  e.c.hp = { cur: 1000, max: 1000 };
  e.c.actor!.speed = 0;
  e.c.monster!.level = level;
  return id;
}
const ent = (s: S, id: EntityId) => s.state.entities[String(id)]!;
const invisible = (s: S, on = true) => setIntrinsic(getPlayer(s.state), P.INVIS, on);
const cheb = (a: Pos, b: Pos) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const HERO = { x: HX, y: HY };

describe('set_apparxy(): where a monster thinks she is', () => {
  test('a monster that can see her knows; one she is invisible to guesses next to her', () => {
    const s = make();
    const j = pinned(s, 'nh:jackal', HX + 1, HY);
    const ctx = ctxOf(s);
    expect(setApparxy(ctx, ent(s, j))).toEqual(HERO);
    expect(invisTo(ctx, ent(s, j))).toBe(false);
    invisible(s);
    expect(invisTo(ctx, ent(s, j))).toBe(true);
    let found = 0;
    const seen = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const g = setApparxy(ctx, ent(s, j));
      expect(cheb(g, HERO)).toBeLessThanOrEqual(1);
      expect(g).not.toEqual({ x: HX + 1, y: HY }); // never its own square
      if (g.x === HX && g.y === HY) found++;
      seen.add(`${g.x},${g.y}`);
    }
    // a third of the time it finds her (gotu), plus the random guesses that hit her square
    expect(found).toBeGreaterThan(600 / 3);
    expect(found).toBeLessThan(600 / 2);
    expect(seen.size).toBe(8); // her square and the seven others
  });

  test('a guess avoids rock and stays where she could see', () => {
    const s = make();
    const hp = getPlayer(s.state).c.pos!;
    Object.assign(hp, { x: 1, y: 1 }); // the room's corner: rock to the north and west
    const j = pinned(s, 'nh:jackal', 4, 4);
    invisible(s);
    for (let i = 0; i < 300; i++) {
      const g = setApparxy(ctxOf(s), ent(s, j));
      expect(g.x).toBeGreaterThanOrEqual(1);
      expect(g.y).toBeGreaterThanOrEqual(1);
      expect(couldseeAt(ctxOf(s), g.x, g.y)).toBe(true);
    }
  });

  test('a see-invisible elf and a pet always know', () => {
    const s = make();
    invisible(s);
    const elf = pinned(s, 'nh:woodland_elf', HX + 2, HY);
    const pet = pinned(s, 'nh:jackal', HX - 2, HY);
    ent(s, pet).c.monster!.tame = 10;
    for (let i = 0; i < 50; i++) {
      expect(setApparxy(ctxOf(s), ent(s, elf))).toEqual(HERO);
      expect(setApparxy(ctxOf(s), ent(s, pet))).toEqual(HERO);
    }
    expect(invisTo(ctxOf(s), ent(s, elf))).toBe(false);
    expect(mCanSeeU(ctxOf(s), ent(s, elf))).toBe(true);
  });

  test('a guess that found her earlier this move is kept without a roll', () => {
    const s = make();
    const j = pinned(s, 'nh:jackal', HX + 1, HY);
    invisible(s);
    const before = JSON.stringify(s.state.rng);
    expect(setApparxy(ctxOf(s), ent(s, j), { ...HERO })).toEqual(HERO);
    expect(JSON.stringify(s.state.rng)).toBe(before);
    expect(mCanSeeU(ctxOf(s), ent(s, j))).toBe(false);
  });
});

describe('mattacku() at a wrong guess', () => {
  test('a jackal next to the guess misses wildly and does no harm', () => {
    const s = make();
    invisible(s);
    const j = pinned(s, 'nh:jackal', HX + 1, HY);
    const hp0 = getPlayer(s.state).c.hp!.cur;
    const lines = new Set<string>();
    for (let i = 0; i < 60; i++) {
      const { ctx, said } = talk(s);
      monsterAttack(ctx, j, { x: HX + 1, y: HY + 1 });
      expect(said.length).toBe(1);
      lines.add(said[0]!);
    }
    expect([...lines].sort()).toEqual([
      'The jackal attacks a spot beside you.',
      'The jackal snaps wildly and misses!',
      'The jackal strikes at thin air!',
    ]);
    expect(getPlayer(s.state).c.hp!.cur).toBe(hp0);
  });

  test('a right guess attacks as usual; the unseen -2 to-hit', () => {
    const s = make();
    invisible(s);
    const j = pinned(s, 'nh:jackal', HX + 1, HY);
    const { ctx, said } = talk(s);
    monsterAttack(ctx, j, { ...HERO });
    expect(said.some((l) => /wildly|thin air|spot beside/.test(l))).toBe(false);
    const a = createRng(seedRng(7));
    const b = createRng(seedRng(7));
    expect(monsterToHit(a, 10, 3, false, false, true)).toBe(monsterToHit(b, 10, 3) - 2);
  });

  test('a yellow light explodes at a spot in thin air and does not blind her', () => {
    const s = make();
    invisible(s);
    const y = pinned(s, 'nh:yellow_light', HX + 1, HY);
    const { ctx, said } = talk(s);
    const atk = defs.monster('nh:yellow_light').attacks[0]!;
    explmu(ctx, ent(s, y), atk, false);
    expect(said[0]).toBe('The yellow light explodes at a spot in thin air!');
    expect(said.join(' ')).not.toContain('blinded');
    expect(s.state.entities[String(y)]).toBeUndefined();
  });

  test('an invisible nymph cannot seduce a hero who does not see invisible', () => {
    const s = make();
    const n = pinned(s, 'nh:water_nymph', HX + 1, HY);
    const hero = getPlayer(s.state);
    const atk = defs.monster('nh:water_nymph').attacks.find((a) => a.ad === 'sedu') ?? null;
    expect(couldSeduce(ctxOf(s), ent(s, n), hero, atk)).toBeGreaterThan(0);
    setMinvis(ctxOf(s), ent(s, n));
    expect(couldSeduce(ctxOf(s), ent(s, n), hero, atk)).toBe(0);
    setIntrinsic(hero, P.SEE_INVIS, true);
    expect(couldSeduce(ctxOf(s), ent(s, n), hero, atk)).toBeGreaterThan(0);
  });
});

describe('ranged attacks aim at the guess', () => {
  test('a kobold throws only when the guess is lined up, toward the guess', () => {
    const s = make();
    invisible(s);
    const k = pinned(s, 'nh:kobold', HX + 4, HY - 2); // not lined up with her
    mongets(ctxOf(s), k, 'nh:dart');
    const clear = () => true;
    const darts = () =>
      Object.values(s.state.entities).filter((e) => e.def === 'nh:dart' && !e.c.item?.carriedBy);
    const hp0 = getPlayer(s.state).c.hp!.cur;
    // a guess off every line from the kobold: no throw
    const { ctx } = talk(s);
    thrwmu(ctx, k, clear, null, { x: HX, y: HY + 1 });
    expect(darts()).toEqual([]);
    // a guess on its diagonal (next to her): the darts fly down that diagonal and miss her
    thrwmu(ctx, k, clear, null, { x: HX + 1, y: HY + 1 });
    expect(darts().length).toBeGreaterThan(0);
    for (const d of darts()) expect(d.c.pos!.x - (HX + 4)).toBe(-(d.c.pos!.y - (HY - 2)));
    expect(getPlayer(s.state).c.hp!.cur).toBe(hp0);
  });
});

describe('spellcasters', () => {
  test('a cancelled caster curses in her general direction when it guesses wrong', () => {
    const s = make();
    invisible(s);
    const k = pinned(s, 'nh:kobold_shaman', HX + 1, HY, 2);
    setMspecUsed(ctxOf(s), k, 5); // unable to cast: cursetxt()
    const atk = defs.monster('nh:kobold_shaman').attacks.find((a) => a.at === 'magic')!;
    const lines = new Set<string>();
    for (let i = 0; i < 40; i++) {
      const { ctx, said } = talk(s);
      castmu(ctx, k, atk, true, false, { x: HX + 1, y: HY + 1 });
      for (const l of said) lines.add(l);
      const r = talk(s);
      castmu(r.ctx, k, atk, true, true, { ...HERO });
      for (const l of r.said) lines.add(l);
    }
    expect(lines).toContain('The kobold shaman points and curses in your general direction.');
    expect(lines).toContain('The kobold shaman points at you, then curses.');
  });

  test('a directed spell at a wrong guess goes at thin air', () => {
    const s = make();
    invisible(s);
    const k = pinned(s, 'nh:kobold_shaman', HX + 1, HY, 2);
    const atk = defs.monster('nh:kobold_shaman').attacks.find((a) => a.at === 'magic')!;
    const lines = new Set<string>();
    for (let i = 0; i < 40; i++) {
      setMspecUsed(ctxOf(s), k, 0);
      const { ctx, said } = talk(s);
      castmu(ctx, k, atk, true, false, { x: HX + 1, y: HY + 1 });
      for (const l of said) lines.add(l);
    }
    expect(lines).toContain('The kobold shaman casts a spell at thin air!');
  });

  test('disappear: useless when invisible, or peaceful to a hero who cannot see invisible', () => {
    const s = make();
    const g = pinned(s, 'nh:gnomish_wizard', HX + 3, HY, 5);
    const ctx = ctxOf(s);
    expect(spellWouldBeUseless(ctx, ent(s, g), 'disappear')).toBe(false);
    ent(s, g).c.monster!.peaceful = true;
    expect(spellWouldBeUseless(ctx, ent(s, g), 'disappear')).toBe(true);
    setIntrinsic(getPlayer(s.state), P.SEE_INVIS, true);
    expect(spellWouldBeUseless(ctx, ent(s, g), 'disappear')).toBe(false);
    setMinvis(ctx, ent(s, g));
    expect(spellWouldBeUseless(ctx, ent(s, g), 'disappear')).toBe(true);
  });

  test('a gnomish wizard casting disappear vanishes and leaves an `I`', () => {
    const s = make();
    const g = pinned(s, 'nh:gnomish_wizard', HX + 3, HY, 5);
    const atk = defs.monster('nh:gnomish_wizard').attacks.find((a) => a.at === 'magic')!;
    let said: string[] = [];
    for (let i = 0; i < 200 && !monInvisible(ctxOf(s), ent(s, g)); i++) {
      setMspecUsed(ctxOf(s), g, 0);
      const t = talk(s);
      castmu(t.ctx, g, atk, false, false); // an undirected spell while not attacking
      said = t.said;
    }
    expect(monInvisible(ctxOf(s), ent(s, g))).toBe(true);
    expect(said).toContain('The gnomish wizard suddenly disappears!');
    const level = s.state.levels['dlvl1']!;
    const mem = s.state.monsterMemory['dlvl1']?.[String(HY * level.width + HX + 3)];
    expect(mem).toBe('nh:remembered_unseen');
  });
});

describe("m_move()'s guess square", () => {
  test('the guess is an ALLOW_U square with its monster; her square next to it fixes the guess', () => {
    const s = make();
    invisible(s);
    const j = pinned(s, 'nh:jackal', HX + 3, HY);
    const other = pinned(s, 'nh:newt', HX + 2, HY + 1);
    const level = s.state.levels['dlvl1']!;
    const guess = { x: HX + 2, y: HY + 1 };
    const c = mfndpos(ctxOf(s), level, cellRules(level, defs), j, HERO, { allowU: true, guess });
    expect(c.find((p) => p.x === HX + 2 && p.y === HY + 1)).toMatchObject({
      hero: true,
      mon: other,
    });
    // the jackal next to her: her own square fixes the guess
    const k = pinned(s, 'nh:jackal', HX + 1, HY - 1);
    const g2 = { x: HX + 2, y: HY - 1 };
    mfndpos(ctxOf(s), level, cellRules(level, defs), k, HERO, { allowU: true, guess: g2 });
    expect(g2).toEqual(HERO);
  });
});

describe('a monster that wants to see her', () => {
  test('a hostile jackal fighting an invisible hero sometimes misses wildly', () => {
    const s = make();
    invisible(s);
    const j = addMon(s.state, 'nh:jackal', HX + 1, HY);
    ent(s, j).c.hp = { cur: 1000, max: 1000 };
    let wild = 0;
    for (let t = 0; t < 60; t++) {
      const out = s.text(s.step({ type: 'wait' }));
      if (out.some((l) => /wildly|thin air|spot beside/.test(l))) wild++;
      getPlayer(s.state).c.hp!.cur = 500;
    }
    expect(wild).toBeGreaterThan(0);
  });
});
