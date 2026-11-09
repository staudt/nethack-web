// m12 step 7: the vault guard. After VAULT_GUARD_TIME turns in the vault he comes through the
// wall, asks her name (a text prompt raised at the end of the turn), and leads her out along a
// fake corridor that closes behind them; lingering angers him, teleporting out with gold makes
// him irate, killing him or sending him away restores the walls, dying in the vault leaves her
// gold there, a cursed tin whistle calls him.
// ref: src/vault.c invault(), gd_move(), clear_fcorr(), wallify_vault(), uleftvault(), paygd(),
// vault_summon_gd(); src/allmain.c moveloop_core()
import {
  createEngine,
  getPlayer,
  inventoryOf,
  itemsAt,
  type Ctx,
  type EntityId,
  type GameState,
  type Mod,
  type PlayerAction,
  type StepResult,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { VAULT, mondied, vanillaMod } from '../src/index';
import { done } from '../src/end';
import { T, setTerrain, terrainIdAt } from '../src/terrain';
import { teleds } from '../src/trap';
import { egdOf, findgd, uinvault, vaultSummonGd } from '../src/vaultstate';
import { domonnoise } from '../src/chat';
import { levelSetup } from './itemHelpers';

const probe: { fn: (ctx: Ctx) => void } = { fn: () => undefined };
const probeMod: Mod = {
  id: 'probe',
  version: '1',
  register(api) {
    api.defineAction({
      id: 'probe:run',
      labelKey: 'probe',
      handles: 'mod',
      offer: () => [],
      perform(ctx) {
        probe.fn(ctx);
        return 0;
      },
    });
  },
};
const engine = createEngine([vanillaMod, probeMod]);
function withCtx(state: GameState, fn: (ctx: Ctx) => void): StepResult {
  probe.fn = fn;
  return engine.step(state, { type: 'mod', action: 'probe:run' });
}
const keys = (r: StepResult): string[] =>
  r.events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));

// A 2x2 vault (walls at x 1..4, y 1..4), the hero inside at (3,3), a corridor along y 6 from
// x 7: the guard's goal is (7,6), his door the east wall at (4,3).
const MAP = [
  '                    ',
  ' ----               ',
  ' |..|               ',
  ' |.@|               ',
  ' ----               ',
  '                    ',
  '       ##########   ',
  '                    ',
];

function setup(gold = 100) {
  const s = levelSetup(MAP);
  const level = s.state.levels['dlvl1']!;
  MAP.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === '-') setTerrain(level, x, y, T.hwall);
      else if (ch === '|') setTerrain(level, x, y, T.vwall);
      else if (ch === '#') setTerrain(level, x, y, T.corr);
    }),
  );
  level.rooms = [{ lx: 2, ly: 2, hx: 3, hy: 3, lit: true, type: VAULT }];
  // u.urooms as after walking in
  (s.state.modData['nh'] as Record<string, unknown>)['urooms'] = { level: 'dlvl1', rooms: [0] };
  // the kit carries no gold; give her some
  if (gold > 0) s.carry('nh:gold_piece', { quantity: gold });
  return { ...s, level };
}

type S = ReturnType<typeof setup>;
const wait = (s: S): StepResult => engine.step(s.state, { type: 'wait' });
const answer = (s: S, value: string | null): StepResult =>
  engine.step(s.state, { type: 'answer', promptId: 'vault-guard', value });
const guardOf = (s: S): EntityId | null => findgd(s.state);
const goldCarried = (s: S): number =>
  inventoryOf(s.state, s.state.playerId)
    .filter((o) => o.def === 'nh:gold_piece')
    .reduce((n, o) => n + (o.c.item?.quantity ?? 0), 0);

/** Waits until the guard asks her name; returns the messages of that step. */
function untilGuard(s: S): string[] {
  for (let i = 0; i < 40; i++) {
    const r = wait(s);
    if (s.state.pendingPrompt) return keys(r);
  }
  throw new Error('no guard came');
}

const heroAt = (s: S) => getPlayer(s.state).c.pos!;
const step = (s: S, a: PlayerAction): StepResult => engine.step(s.state, a);

describe('the guard arrives', () => {
  test('after 30 turns in the vault, through the wall toward his corridor, and asks her name', () => {
    const s = setup();
    const msgs = untilGuard(s);
    expect(uinvault(s.state)).toBe(31); // 30, and one more so a killed guard is not replaced at once
    expect(msgs).toContain('vault.guard_enters');
    expect(s.state.pendingPrompt?.prompt).toMatchObject({ kind: 'text', key: 'vault.who_are_you' });
    const g = guardOf(s)!;
    expect(s.state.entities[String(g)]?.c.pos).toMatchObject({ x: 4, y: 3 });
    expect(s.state.entities[String(g)]?.c.monster?.peaceful).toBe(true);
    expect(terrainIdAt(s.level, 4, 3)).toBe(T.doorway);
    expect(egdOf(s.state, g)).toMatchObject({
      gdx: 7,
      gdy: 6,
      fakecorr: [{ x: 4, y: 3, ftyp: T.vwall }],
    });
    // his kit: the cursed tin whistle
    const whistle = inventoryOf(s.state, g).find((o) => o.def === 'nh:tin_whistle');
    expect(whistle?.c.item?.buc).toBe('cursed');
  });

  test('no guard while she is outside the vault, and the count starts over', () => {
    const s = setup();
    for (let i = 0; i < 20; i++) wait(s);
    expect(uinvault(s.state)).toBe(20);
    (s.state.modData['nh'] as Record<string, unknown>)['urooms'] = undefined;
    getPlayer(s.state).c.pos!.x = 10;
    getPlayer(s.state).c.pos!.y = 6;
    for (let i = 0; i < 40; i++) wait(s);
    expect(uinvault(s.state)).toBe(0);
    expect(guardOf(s)).toBeNull();
  });

  test('an empty answer is asked again, five times in all', () => {
    const s = setup();
    untilGuard(s);
    for (let i = 0; i < 4; i++) {
      answer(s, '  ');
      expect(s.state.pendingPrompt?.prompt.id).toBe('vault-guard');
    }
    const r = answer(s, '');
    expect(s.state.pendingPrompt).toBeNull();
    expect(keys(r)).toContain('vault.dont_know_you');
  });
});

describe('the answer', () => {
  test('"Croesus" sends him away and the wall is whole again', () => {
    const s = setup();
    untilGuard(s);
    const r = answer(s, 'croesus');
    expect(keys(r)).toContain('vault.sorry_disturbed');
    expect(guardOf(s)).toBeNull();
    expect(terrainIdAt(s.level, 4, 3)).toBe(T.vwall);
    expect(JSON.stringify(s.state.modData)).not.toContain('"egd"');
  });

  test('anyone else is asked to drop the gold, or just to follow with none', () => {
    const s = setup();
    untilGuard(s);
    expect(keys(answer(s, 'Ricardo'))).toEqual([
      'vault.dont_know_you',
      'vault.stolen',
      'vault.please_drop',
    ]);
    const t = setup(0);
    untilGuard(t);
    expect(keys(answer(t, 'Ricardo'))).toEqual(['vault.dont_know_you', 'vault.please_follow']);
  });

  test('gold in a bag is hidden gold', () => {
    const s = setup(0);
    const sack = s.carry('nh:sack');
    withCtx(s.state, (ctx) => {
      const g = ctx.state.entities[String(s.give('nh:gold_piece', { quantity: 5 }))]!;
      g.c.item!.carriedBy = null;
      g.c.item!.containedIn = sack;
    });
    untilGuard(s);
    expect(keys(answer(s, 'x'))).toEqual([
      'vault.dont_know_you',
      'vault.hidden_gold',
      'vault.stolen',
      'vault.please_drop',
    ]);
  });
});

/**
 * Plays the hero following the guard: she drops her gold, then each turn steps onto the next
 * square of his corridor when he has left it, and out onto the real corridor at its end.
 */
function followOut(s: S): string[] {
  const all: string[] = [];
  const gold = inventoryOf(s.state, s.state.playerId).find((o) => o.def === 'nh:gold_piece');
  if (gold) all.push(...keys(step(s, { type: 'mod', action: 'nh:drop', args: { item: gold.id } })));
  for (let i = 0; i < 60; i++) {
    const g = guardOf(s);
    const egd = g === null ? null : egdOf(s.state, g);
    if (!egd) break;
    const h = heroAt(s);
    const fc = egd.fakecorr.slice(egd.fcbeg);
    const mine = fc.findIndex((f) => f.x === h.x && f.y === h.y);
    const gpos = s.state.entities[String(g)]?.c.pos;
    let to = fc[mine + 1];
    if (!to && mine === fc.length - 1 && mine >= 0) {
      // at his corridor's end: out onto the real corridor
      for (const [dx, dy] of [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ] as const)
        if (
          terrainIdAt(s.level, h.x + dx, h.y + dy) === T.corr &&
          !fc.some((f) => f.x === h.x + dx && f.y === h.y + dy)
        )
          to = { x: h.x + dx, y: h.y + dy, ftyp: T.corr };
    }
    if (to && !(gpos && gpos.x === to.x && gpos.y === to.y)) {
      const dir = DIRS[`${to.x - h.x},${to.y - h.y}`];
      if (!dir) throw new Error(`no step from ${h.x},${h.y} to ${to.x},${to.y}`);
      all.push(...keys(step(s, { type: 'move', dir })));
    } else all.push(...keys(wait(s)));
  }
  return all;
}
const DIRS: Record<string, 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'> = {
  '0,-1': 'n',
  '0,1': 's',
  '1,0': 'e',
  '-1,0': 'w',
  '1,-1': 'ne',
  '-1,-1': 'nw',
  '1,1': 'se',
  '-1,1': 'sw',
};

describe('following him out', () => {
  test('he digs to the corridor, vanishes there, and his corridor and door close behind her', () => {
    const s = setup();
    untilGuard(s);
    answer(s, 'Ricardo');
    // a hole dug in the west wall, a boulder in it: he repairs it once both are out
    setTerrain(s.level, 1, 2, T.doorway);
    s.give('nh:boulder', { at: { level: 'dlvl1', x: 1, y: 2 } });
    const dug: { x: number; y: number }[] = [];
    const g = guardOf(s)!;
    const msgs = followOut(s);
    expect(msgs).toContain('vault.walls_restored');
    expect(msgs).toContain('vault.suddenly_disappears');
    // she is out on the real corridor, the gold stayed in the vault
    expect(terrainIdAt(s.level, heroAt(s).x, heroAt(s).y)).toBe(T.corr);
    expect(heroAt(s).y).toBe(6);
    expect(goldCarried(s)).toBe(0);
    expect(
      itemsAt(engine.registry, s.state, 'dlvl1', 3, 3).some((o) => o.def === 'nh:gold_piece'),
    ).toBe(true);
    // everything between the vault and the corridor is rock again, the vault walls whole
    for (let x = 5; x <= 9; x++) for (let y = 2; y <= 5; y++) dug.push({ x, y });
    for (const p of dug) expect(terrainIdAt(s.level, p.x, p.y)).toBe(T.stone);
    expect(terrainIdAt(s.level, 4, 3)).toBe(T.vwall);
    expect(terrainIdAt(s.level, 1, 2)).toBe(T.vwall);
    expect(itemsAt(engine.registry, s.state, 'dlvl1', 1, 2)).toEqual([]);
    expect(s.state.entities[String(g)]).toBeUndefined();
    expect(egdOf(s.state, g)).toBeNull();
    expect(uinvault(s.state)).toBe(0);
  });

  test('lingering with the gold: warnings, then he turns hostile and walls up his door', () => {
    const s = setup();
    untilGuard(s);
    answer(s, 'Ricardo');
    const msgs: string[] = [];
    for (let i = 0; i < 8; i++) msgs.push(...keys(wait(s)));
    expect(msgs).toContain('vault.repeat_follow.gold');
    expect(msgs).toContain('vault.warned_knave');
    const g = guardOf(s)!;
    expect(s.state.entities[String(g)]?.c.monster?.peaceful).toBe(false);
    expect(terrainIdAt(s.level, 4, 3)).toBe(T.vwall);
  });

  test('teleporting out with the gold makes him irate', () => {
    const s = setup();
    untilGuard(s);
    answer(s, 'Ricardo');
    const g = guardOf(s)!;
    const r = withCtx(s.state, (ctx) => teleds(ctx, 12, 6, { teleport: true }));
    expect(keys(r)).toContain('vault.irate');
    expect(s.state.entities[String(g)]?.c.monster?.peaceful).toBe(false);
    // his extra move took him out of the vault (rloc) and closed his door
    expect(terrainIdAt(s.level, 4, 3)).toBe(T.vwall);
  });
});

describe('the guard gone', () => {
  test('killed in his corridor: it closes at once', () => {
    const s = setup();
    untilGuard(s);
    answer(s, 'Ricardo');
    const gold = inventoryOf(s.state, s.state.playerId).find((o) => o.def === 'nh:gold_piece')!;
    step(s, { type: 'mod', action: 'nh:drop', args: { item: gold.id } });
    wait(s); // he digs his first square
    const g = guardOf(s)!;
    expect(s.state.entities[String(g)]?.c.pos).toMatchObject({ x: 5, y: 3 });
    expect(terrainIdAt(s.level, 5, 3)).toBe(T.corr);
    withCtx(s.state, (ctx) => mondied(ctx, g));
    expect(terrainIdAt(s.level, 5, 3)).toBe(T.stone);
    expect(terrainIdAt(s.level, 4, 3)).toBe(T.vwall);
    expect(egdOf(s.state, g)).toBeNull();
  });

  test('dying in the vault: her gold goes into it', () => {
    const s = setup();
    untilGuard(s);
    answer(s, 'Ricardo');
    const r = withCtx(s.state, (ctx) => done(ctx, 'test'));
    expect(keys(r)).toContain('vault.memory_vault');
    expect(goldCarried(s)).toBe(0);
    expect(
      itemsAt(engine.registry, s.state, 'dlvl1', 3, 3).some((o) => o.def === 'nh:gold_piece'),
    ).toBe(true);
  });

  test('a cursed tin whistle calls him on the next turn', () => {
    const s = setup();
    wait(s);
    withCtx(s.state, (ctx) => vaultSummonGd(ctx));
    wait(s);
    expect(s.state.pendingPrompt?.prompt.id).toBe('vault-guard');
  });

  test('#chat: "Please drop that gold and follow me."', () => {
    const s = setup();
    untilGuard(s);
    answer(s, 'Ricardo');
    const g = guardOf(s)!;
    const r = withCtx(s.state, (ctx) => void domonnoise(ctx, g));
    expect(keys(r)).toEqual(['vault.please_drop']);
  });
});
