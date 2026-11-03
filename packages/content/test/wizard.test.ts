// Wizard mode: the wizard mod, wiz:map, wiz:where, wiz:levelport, wiz:wish, wiz:identify,
// wiz:genesis and "Die?".
import {
  applyUpdate,
  buildSnapshot,
  createEngine,
  diffSnapshot,
  getLevel,
  getPlayer,
  inventoryOf,
  isPlainFloor,
  itemsAt,
  stateHash,
  type Ctx,
  type DefId,
  type GameEvent,
  type GameState,
  type Json,
  type PlayerAction,
  type Prompt,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import {
  OPEN_DUNGEON_LEVELS,
  T,
  WIZ_LEVELPORT,
  WIZ_MAP,
  WIZ_DIE,
  WIZ_GENESIS,
  WIZ_IDENTIFY,
  WIZ_WHERE,
  WIZ_WISH,
  addToInventory,
  makemon,
  messagesEn,
  mksobj,
  vanillaMod,
  wizardMod,
} from '../src/index';
import { ctxFor, itemOf, render } from './itemHelpers';

const normal = createEngine([vanillaMod]);
const wizard = createEngine([vanillaMod, wizardMod]);
const SELF = { kind: 'self' } as const;

const wizOffers = (e: typeof normal, state: GameState): string[] =>
  e
    .query(state)
    .actionsFor(SELF)
    .map((o) => (o.action.type === 'mod' ? o.action.action : o.action.type))
    .filter((id) => id.startsWith('wiz:'));

const msgs = (events: GameEvent[]): Extract<GameEvent, { type: 'msg' }>[] =>
  events.flatMap((e) => (e.type === 'msg' ? [e] : []));

describe('the wizard mod', () => {
  test('a normal game offers no wiz: actions; a wizard game offers its commands', () => {
    expect(wizOffers(normal, normal.newGame({ seed: 1 }).state)).toEqual([]);
    expect(wizOffers(wizard, wizard.newGame({ seed: 1 }).state)).toEqual([
      WIZ_MAP,
      WIZ_WHERE,
      WIZ_LEVELPORT,
      WIZ_WISH,
      WIZ_IDENTIFY,
      WIZ_GENESIS,
    ]);
  });

  test('loading it draws nothing: the same seed builds the same game', () => {
    const a = normal.newGame({ seed: 7 }).state;
    const b = wizard.newGame({ seed: 7 }).state;
    expect(b.mods.map((m) => m.id)).toEqual(['nh', 'wiz']);
    expect(stateHash({ ...b, mods: a.mods })).toBe(stateHash(a));
  });

  test('a wizard save refuses to load without the wizard mod, and loads with it', () => {
    const { state } = wizard.newGame({ seed: 3 });
    const replay = { seed: 3, width: 80, height: 21, mods: state.mods, actions: [] };
    const text = wizard.save(state, replay);
    expect(() => normal.load(text)).toThrow(/wiz@0\.1\.0/);
    expect(stateHash(wizard.load(text).state)).toBe(stateHash(state));
    const plain = normal.newGame({ seed: 3 }).state;
    expect(() => wizard.load(normal.save(plain, { ...replay, mods: plain.mods }))).toThrow(
      /mods \[nh@/,
    );
  });

  test('every message key it uses has English text', () => {
    for (const k of [
      'action.wiz:map',
      'action.wiz:where',
      'action.wiz:levelport',
      'wiz.where.levels',
      'wiz.where.branch',
      'wiz.levelport.pickDungeon',
      'wiz.levelport.pickLevel',
      'wiz.levelport.level',
      'wiz.levelport.here',
      'wiz.levelport.arrive',
      'action.wiz:wish',
      'action.wiz:identify',
      'wish.prompt',
      'wish.nothing_fitting',
      'wish.enough_tries',
      'wish.oops',
      'wish.oops.plural',
      'action.wiz:genesis',
      'action.wiz:die',
      'wiz.genesis.prompt',
      'wiz.genesis.prompt_help',
      'wiz.genesis.never_heard',
      'wiz.genesis.try_again',
      'wiz.genesis.appears',
      'wiz.die.prompt',
      'wiz.die.ok',
      'wiz.die.ok_choke',
    ])
      expect(messagesEn[k]).toBeDefined();
  });
});

describe('wiz:map', () => {
  test('remembers every cell, finds secret corridors, shows every trap, takes no time', () => {
    // Hide one corridor cell as a secret corridor and add an unseen trap on the floor, out of sight.
    const { state } = wizard.newGame({ seed: 1 });
    {
      const l = getLevel(state);
      const out = (id: DefId): number =>
        l.cells.findIndex((c, j) => l.palette[c] === id && !state.visible.includes(j));
      const c = out(T.corr);
      expect(c).toBeGreaterThan(-1);
      let pi = l.palette.indexOf(T.scorr);
      if (pi === -1) pi = l.palette.push(T.scorr) - 1;
      l.cells[c] = pi;
      const f = out(T.floor);
      expect(f).toBeGreaterThan(-1);
      const def = wizard.registry.traps[0]?.id as DefId;
      l.traps.push({ def, x: f % l.width, y: Math.floor(f / l.width), seen: false });
    }

    const level = getLevel(state);
    const before = buildSnapshot(wizard.registry, state);
    expect(before.cells.some((c) => c.g === null)).toBe(true);
    const turn = state.turn;
    const { events } = wizard.step(state, { type: 'mod', action: WIZ_MAP as DefId });
    expect(events.filter((e) => e.type === 'msg')).toEqual([]);
    expect(state.turn).toBe(turn);

    const memory = state.memory[level.id] ?? [];
    expect(memory).toEqual(level.cells);
    expect(level.cells.some((c) => level.palette[c] === T.scorr)).toBe(false);
    expect(level.traps.every((t) => t.seen)).toBe(true);

    // The delta carries the newly remembered cells, so a client mirror shows the whole map.
    const next = buildSnapshot(wizard.registry, state);
    const delta = diffSnapshot(before, next);
    const mirror = applyUpdate(before, delta);
    expect(mirror).toEqual(next);
    for (let i = 0; i < level.cells.length; i++) {
      const id = level.palette[level.cells[i] ?? 0];
      expect(mirror.cells[i]?.g).toBe(wizard.registry.terrain(id as DefId).looksLike ?? id);
    }
    for (const t of level.traps) expect(mirror.cells[t.y * level.width + t.x]?.t).toBe(t.def);
  });
});

describe('wiz:where', () => {
  test('one line per dungeon, then its branch stairs, from the layout; no time passes', () => {
    const { state } = wizard.newGame({ seed: 5 });
    const turn = state.turn;
    const { events } = wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
    expect(state.turn).toBe(turn);
    const expected: { key: string; params: Record<string, string | number> }[] = [];
    for (const d of state.dungeons) {
      const dungeon = '@' + wizard.registry.dungeon(d.id).nameKey;
      const start = d.depthStart;
      if (d.levels === null) expected.push({ key: 'wiz.where.open', params: { dungeon, start } });
      else
        expected.push({
          key: d.levels > 1 ? 'wiz.where.levels' : 'wiz.where.level',
          params: d.levels > 1 ? { dungeon, start, end: start + d.levels - 1 } : { dungeon, start },
        });
      // branch stairs and special levels by level, a branch first on a shared level
      const lines = [
        ...d.branches.map((b) => ({ dl: b.dlevel, n: 0, b })),
        ...d.special.map((sp) => ({ dl: sp.dlevel, n: 1, sp })),
      ].sort((a, b) => a.dl - b.dl || a.n - b.n);
      for (const l of lines)
        if ('b' in l)
          expected.push({
            key: 'wiz.where.branch',
            params: {
              dungeon: '@' + wizard.registry.dungeon(l.b.to).nameKey,
              depth: start + l.dl - 1,
            },
          });
        else
          expected.push({
            key: 'wiz.where.special',
            params: { name: '@nh:minetown', depth: start + l.dl - 1 },
          });
    }
    const got = msgs(events).map((m) => ({ key: m.key, params: m.params }));
    expect(got).toEqual(expected);

    // The vanilla layout: the Dungeons of Doom (no bottom yet) with the Mines branch, then the Mines.
    const [main, mines] = state.dungeons;
    const branch = main?.branches[0];
    expect(got[0]).toEqual({ key: 'wiz.where.open', params: { dungeon: '@nh:main', start: 1 } });
    expect(got[1]).toEqual({
      key: 'wiz.where.branch',
      params: { dungeon: '@nh:mines', depth: branch?.dlevel ?? -1 },
    });
    expect(got[2]).toEqual({
      key: 'wiz.where.levels',
      params: {
        dungeon: '@nh:mines',
        start: (branch?.dlevel ?? 0) + 1,
        end: (mines?.depthStart ?? 0) + (mines?.levels ?? 0) - 1,
      },
    });
    expect(mines?.depthStart).toBe((branch?.dlevel ?? 0) + 1);
    // Minetown on Mines level 3 or 4
    const town = mines?.special[0];
    expect([3, 4]).toContain(town?.dlevel);
    expect(got[3]).toEqual({
      key: 'wiz.where.special',
      params: { name: '@nh:minetown', depth: (mines?.depthStart ?? 0) + (town?.dlevel ?? 0) - 1 },
    });
    expect(wizard.registry.dungeon('nh:mines' as DefId).special?.[0]?.nameKey).toBe('nh:minetown');
  });
});

describe('wiz:levelport', () => {
  const LEVELPORT: PlayerAction = { type: 'mod', action: WIZ_LEVELPORT as DefId };
  const prompt = (state: GameState): Prompt => {
    const p = state.pendingPrompt?.prompt;
    if (!p) throw new Error('no prompt');
    return p;
  };
  const answer = (state: GameState, value: Json): GameEvent[] =>
    wizard.step(state, { type: 'answer', promptId: prompt(state).id, value }).events;
  /** Levelports to `dlevel` of `dungeon` through both menus. */
  function levelport(state: GameState, dungeon: DefId, dlevel: number): GameEvent[] {
    wizard.step(state, LEVELPORT);
    answer(state, dungeon);
    return answer(state, dlevel);
  }
  const onPassable = (state: GameState): boolean => {
    const p = getPlayer(state).c.pos;
    return !!p && isPlainFloor(wizard.registry, getLevel(state), p.x, p.y);
  };

  test('the menus list every dungeon in the layout, then each level with its depth', () => {
    const { state } = wizard.newGame({ seed: 2 });
    wizard.step(state, LEVELPORT);
    const first = prompt(state);
    expect(first.kind).toBe('menu');
    expect(first.cancellable).toBe(true);
    expect(first.options?.map((o) => o.value)).toEqual(state.dungeons.map((d) => d.id));
    expect(first.options?.map((o) => o.key)).toEqual(
      state.dungeons.map((d) => wizard.registry.dungeon(d.id).nameKey),
    );

    const mines = state.dungeons.find((d) => d.id === 'nh:mines');
    expect(mines?.levels).toBeGreaterThan(1);
    answer(state, 'nh:mines');
    const second = prompt(state);
    expect(second.cancellable).toBe(true);
    const n = mines?.levels ?? 0;
    expect(second.options?.map((o) => o.value)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(second.options?.map((o) => o.params)).toEqual(
      Array.from({ length: n }, (_, i) => ({
        dlevel: i + 1,
        depth: (mines?.depthStart ?? 0) + i,
      })),
    );
    expect(second.options?.every((o) => o.key === 'wiz.levelport.level')).toBe(true);
  });

  test('the bottomless main dungeon lists 30 levels, or one past the deepest visited', () => {
    const { state } = wizard.newGame({ seed: 2 });
    const main = state.dungeons.find((d) => d.id === 'nh:main');
    expect(main?.levels).toBeNull();
    wizard.step(state, LEVELPORT);
    answer(state, 'nh:main');
    const opts = prompt(state).options ?? [];
    expect(opts.length).toBe(OPEN_DUNGEON_LEVELS);
    // the hero is on DL1: it is marked
    expect(opts[0]?.key).toBe('wiz.levelport.here');
    expect(opts.slice(1).every((o) => o.key === 'wiz.levelport.level')).toBe(true);

    answer(state, OPEN_DUNGEON_LEVELS);
    expect(getLevel(state).dlevel).toBe(OPEN_DUNGEON_LEVELS);
    wizard.step(state, LEVELPORT);
    answer(state, 'nh:main');
    const more = prompt(state).options ?? [];
    expect(more.length).toBe(OPEN_DUNGEON_LEVELS + 1);
    expect(more[OPEN_DUNGEON_LEVELS - 1]?.key).toBe('wiz.levelport.here');
    // a value outside the menu does nothing
    answer(state, OPEN_DUNGEON_LEVELS + 5);
    expect(getLevel(state).dlevel).toBe(OPEN_DUNGEON_LEVELS);
  });

  test('into the Mines bottom and back to DL1, on a floor cell each time, taking no time', () => {
    const { state } = wizard.newGame({ seed: 4 });
    const mines = state.dungeons.find((d) => d.id === 'nh:mines');
    const bottom = mines?.levels ?? 0;
    const turn = state.turn;

    const events = levelport(state, 'nh:mines', bottom);
    const here = getLevel(state);
    expect([here.dungeon, here.dlevel, here.depth]).toEqual([
      'nh:mines',
      bottom,
      (mines?.depthStart ?? 0) + bottom - 1,
    ]);
    expect(onPassable(state)).toBe(true);
    expect(msgs(events).map((m) => m.key)).toContain('wiz.levelport.arrive');

    levelport(state, 'nh:main', 1);
    const back = getLevel(state);
    expect([back.dungeon, back.dlevel]).toEqual(['nh:main', 1]);
    expect(onPassable(state)).toBe(true);
    expect(state.turn).toBe(turn);
    expect(state.pendingPrompt).toBeNull();
  });

  test('levelport to Minetown: a town, and wiz:where marks it as the current level', () => {
    const { state } = wizard.newGame({ seed: 4 });
    const town = state.dungeons.find((d) => d.id === 'nh:mines')?.special[0];
    levelport(state, 'nh:mines', town?.dlevel ?? 0);
    const here = getLevel(state);
    expect(here.town).toBe(true);
    expect(here.def).toMatch(/^nh:minetn-/);
    const { events } = wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
    expect(msgs(events).filter((m) => m.key.startsWith('wiz.where.special'))).toEqual([
      {
        type: 'msg',
        key: 'wiz.where.special_here',
        params: { name: '@nh:minetown', depth: here.depth },
      },
    ]);
  });

  test('cancelling either menu, or choosing the current level, changes nothing', () => {
    const { state } = wizard.newGame({ seed: 6 });
    // a first step fills in some lazily initialized vanilla state; hash after it
    wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
    const hash = stateHash(state);
    wizard.step(state, LEVELPORT);
    expect(msgs(answer(state, null))).toEqual([]);
    expect(stateHash(state)).toBe(hash);

    wizard.step(state, LEVELPORT);
    answer(state, 'nh:mines');
    expect(msgs(answer(state, null))).toEqual([]);
    expect(stateHash(state)).toBe(hash);

    expect(msgs(levelport(state, 'nh:main', 1))).toEqual([]);
    expect(stateHash(state)).toBe(hash);
  });
});

describe('wiz:wish and wiz:identify', () => {
  const WISH: PlayerAction = { type: 'mod', action: WIZ_WISH as DefId };
  const IDENTIFY: PlayerAction = { type: 'mod', action: WIZ_IDENTIFY as DefId };
  /** A wizard game after one step (a first step lazily adds some vanilla state). */
  const game = (seed: number): GameState => {
    const { state } = wizard.newGame({ seed });
    const nh = (state.modData['nh'] ??= {}) as Record<string, unknown>;
    nh['debugMongen'] = true;
    wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
    return state;
  };
  const answer = (state: GameState, value: Json): GameEvent[] =>
    wizard.step(state, {
      type: 'answer',
      promptId: state.pendingPrompt?.prompt.id ?? '',
      value,
    }).events;
  const wish = (state: GameState, text: Json): GameEvent[] => {
    wizard.step(state, WISH);
    return answer(state, text);
  };
  const inv = (state: GameState) => inventoryOf(state, state.playerId);
  const items = (state: GameState) =>
    Object.values(state.entities).filter((e) => e.c.item !== undefined).length;
  const named = (state: GameState, id: number): string =>
    render(wizard.registry.itemName(state, state.entities[String(id)]!));
  const keys = (events: GameEvent[]): string[] => msgs(events).map((m) => m.key);

  test('a text prompt; the wished-for item is in the inventory as asked, unidentified', () => {
    const state = game(11);
    const turn = state.turn;
    wizard.step(state, WISH);
    const p = state.pendingPrompt?.prompt;
    expect(p?.kind).toBe('text');
    expect(p?.key).toBe('wish.prompt');
    expect(p?.maxLength).toBe(255);
    const before = new Set(inv(state).map((e) => e.id));
    const events = answer(state, '2 blessed +3 daggers');
    const got = inv(state).filter((e) => !before.has(e.id));
    expect(got).toHaveLength(1);
    const it = got[0]?.c.item;
    expect([got[0]?.def, it?.quantity, it?.buc, it?.spe]).toEqual(['nh:dagger', 2, 'blessed', 3]);
    expect(it?.known).toEqual({ buc: false, spe: false });
    expect(keys(events)).toContain('inv.item');
    expect(state.turn).toBe(turn);
    expect(state.pendingPrompt).toBeNull();

    // wizard mode lifts the normal limits: any count, enchantment and BUC
    wish(state, '40 cursed -7 elven arrows');
    const arrows = inv(state).find((e) => e.def === 'nh:elven_arrow');
    expect(arrows?.c.item).toMatchObject({ quantity: 40, buc: 'cursed', spe: -7 });
    wish(state, 'rustproof +5 long sword');
    const sword = inv(state).find((e) => e.def === 'nh:long_sword' && e.c.item?.spe === 5);
    expect(sword?.c.item?.erodeproof).toBe(true);
    wish(state, '9000 gold pieces');
    expect(
      inv(state).find((e) => e.def === 'nh:gold_piece')?.c.item?.quantity,
    ).toBeGreaterThanOrEqual(9000);
  });

  test('wiz:identify fully identifies the inventory; the names show BUC and enchantment', () => {
    const state = game(12);
    wish(state, '2 blessed +3 daggers');
    wish(state, 'cursed wand of striking (1:6)');
    const daggers = inv(state).find((e) => e.def === 'nh:dagger' && e.c.item?.spe === 3);
    const wand = inv(state).find((e) => e.def === 'nh:wand_of_striking');
    expect(daggers && wand).toBeTruthy();
    expect(named(state, wand?.id ?? 0)).not.toContain('striking');
    const turn = state.turn;
    const events = wizard.step(state, IDENTIFY).events;
    expect(state.turn).toBe(turn);
    expect(named(state, daggers?.id ?? 0)).toBe('2 blessed +3 daggers');
    expect(named(state, wand?.id ?? 0)).toBe('cursed wand of striking (1:6)');
    expect(state.discovered).toContain('nh:wand_of_striking');
    for (const e of inv(state)) {
      const it = e.c.item;
      if (e.def === 'nh:gold_piece') continue;
      expect(it?.known.buc).toBe(true);
    }
    expect(keys(events).filter((k) => k === 'inv.item').length).toBeGreaterThanOrEqual(2);
    // nothing left to identify
    expect(keys(wizard.step(state, IDENTIFY).events)).toEqual(['identify.already_all']);
  });

  test('too heavy to carry: it drops at her feet with "Oops!"', () => {
    const state = game(13);
    const pos = getPlayer(state).c.pos!;
    const events = wish(state, '300 rocks');
    expect(inv(state).some((e) => e.def === 'nh:rock')).toBe(false);
    const floor = itemsAt(wizard.registry, state, pos.level, pos.x, pos.y);
    expect(floor.find((e) => e.def === 'nh:rock')?.c.item?.quantity).toBe(300);
    const oops = msgs(events).find((m) => m.key === 'wish.oops.plural');
    expect(oops && render(oops)).toBe('Oops!  The 300 rocks drop to the floor!');
  });

  test('a full knapsack: it drops at her feet', () => {
    const state = game(14);
    // fill the 52 letters with darts that do not stack (each its own enchantment)
    const ctx = ctxFor(state);
    for (let spe = -30; inv(state).filter((e) => e.c.item?.letter !== '$').length < 52; spe++) {
      const id = mksobj(ctx, wizard.registry.object('nh:dart'), { init: false });
      itemOf(state, id).spe = spe;
      addToInventory(ctx, state.playerId, id);
    }
    const pos = getPlayer(state).c.pos!;
    const events = wish(state, 'ring of free action');
    expect(inv(state).some((e) => e.def === 'nh:ring_of_free_action')).toBe(false);
    expect(
      itemsAt(wizard.registry, state, pos.level, pos.x, pos.y).some(
        (e) => e.def === 'nh:ring_of_free_action',
      ),
    ).toBe(true);
    expect(keys(events)).toContain('wish.oops');
  });

  test('an unknown name asks again; after 5 tries a random object', () => {
    const state = game(15);
    wizard.step(state, WISH);
    // the random object may merge into a stack: count quantities, not entities
    const quan = (st: GameState): number =>
      Object.values(st.entities).reduce((n, e) => n + (e.c.item?.quantity ?? 0), 0);
    const n = quan(state);
    for (let i = 1; i < 5; i++) {
      expect(keys(answer(state, 'xyzzy'))).toEqual(['wish.nothing_fitting']);
      expect(state.pendingPrompt?.prompt.key).toBe('wish.prompt');
    }
    const last = keys(answer(state, 'xyzzy'));
    expect(last.slice(0, 2)).toEqual(['wish.nothing_fitting', 'wish.enough_tries']);
    expect(state.pendingPrompt).toBeNull();
    expect(quan(state)).toBeGreaterThan(n);
  });

  test('"nothing" changes nothing; Escape is a random object, as in NetHack', () => {
    const state = game(16);
    const hash = stateHash(state);
    expect(msgs(wish(state, 'nothing'))).toEqual([]);
    expect(stateHash(state)).toBe(hash);
    const n = items(state);
    wish(state, null);
    expect(items(state)).toBe(n + 1);
    expect(state.pendingPrompt).toBeNull();
  });
});

/** A wizard game after one step (a first step lazily adds some vanilla state), no random spawns. */
const warmGame = (seed: number): GameState => {
  const { state } = wizard.newGame({ seed });
  const nh = (state.modData['nh'] ??= {}) as Record<string, unknown>;
  nh['debugMongen'] = true;
  wizard.step(state, { type: 'mod', action: WIZ_WHERE as DefId });
  return state;
};
const answerPrompt = (state: GameState, value: Json): GameEvent[] =>
  wizard.step(state, { type: 'answer', promptId: state.pendingPrompt?.prompt.id ?? '', value })
    .events;
const monsters = (state: GameState) =>
  Object.values(state.entities)
    .filter((e) => e.c.monster !== undefined && e.c.pos?.level === state.currentLevel)
    .sort((a, b) => a.id - b.id);

describe('wiz:genesis', () => {
  const GENESIS: PlayerAction = { type: 'mod', action: WIZ_GENESIS as DefId };
  const genesis = (state: GameState, text: Json): GameEvent[] => {
    wizard.step(state, GENESIS);
    return answerPrompt(state, text);
  };
  const created = (state: GameState, before: Set<number>) =>
    monsters(state).filter((e) => !before.has(e.id));
  const ids = (state: GameState) => new Set(monsters(state).map((e) => e.id));
  const adjacent = (state: GameState, id: number): boolean => {
    const h = getPlayer(state).c.pos!;
    const p = state.entities[String(id)]?.c.pos;
    return !!p && Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y)) === 1;
  };

  test('a text prompt; the named monster appears next to the hero, taking no time', () => {
    const state = warmGame(21);
    const turn = state.turn;
    wizard.step(state, GENESIS);
    const p = state.pendingPrompt?.prompt;
    expect([p?.kind, p?.key, p?.maxLength]).toEqual(['text', 'wiz.genesis.prompt', 255]);
    const before = ids(state);
    const events = answerPrompt(state, 'newt');
    const got = created(state, before);
    expect(got.map((e) => e.def)).toEqual(['nh:newt']);
    expect(adjacent(state, got[0]!.id)).toBe(true);
    const appears = msgs(events).find((m) => m.key === 'wiz.genesis.appears');
    expect(appears && render(appears)).toBe('A newt appears.');
    expect(state.turn).toBe(turn);
    expect(state.pendingPrompt).toBeNull();
  });

  test('a count, a disposition and "sleeping"', () => {
    const state = warmGame(22);
    let before = ids(state);
    genesis(state, '3 tame jackals');
    let got = created(state, before);
    expect(got.map((e) => e.def)).toEqual(['nh:jackal', 'nh:jackal', 'nh:jackal']);
    expect(got.every((e) => (e.c.monster?.tame ?? 0) > 0 && e.c.monster?.peaceful)).toBe(true);

    before = ids(state);
    genesis(state, 'sleeping peaceful newt');
    got = created(state, before);
    expect(got.map((e) => [e.def, e.c.monster?.peaceful, e.c.monster?.asleep])).toEqual([
      ['nh:newt', true, true],
    ]);

    before = ids(state);
    genesis(state, 'hostile jackal');
    got = created(state, before);
    expect(got.map((e) => [e.def, e.c.monster?.peaceful, e.c.monster?.tame])).toEqual([
      ['nh:jackal', false, undefined],
    ]);
  });

  test('a class symbol makes a monster of that class; * a random one', () => {
    const state = warmGame(23);
    let before = ids(state);
    genesis(state, 'd');
    let got = created(state, before);
    expect(got).toHaveLength(1);
    expect(wizard.registry.monster(got[0]!.def).glyph.ch).toBe('d');
    expect(adjacent(state, got[0]!.id)).toBe(true);
    before = ids(state);
    genesis(state, '*');
    got = created(state, before);
    expect(got).toHaveLength(1);
  });

  test('unknown names ask again (an empty first answer gets a hint); 5 tries, then nothing', () => {
    const state = warmGame(24);
    const before = ids(state);
    wizard.step(state, GENESIS);
    const keys = (ev: GameEvent[]): string[] => msgs(ev).map((m) => m.key);
    expect(keys(answerPrompt(state, ''))).toEqual(['wiz.genesis.try_again']);
    expect(state.pendingPrompt?.prompt.key).toBe('wiz.genesis.prompt_help');
    expect(keys(answerPrompt(state, ''))).toEqual(['wiz.genesis.never_heard']);
    for (let i = 0; i < 2; i++)
      expect(keys(answerPrompt(state, 'xyzzy'))).toEqual(['wiz.genesis.never_heard']);
    expect(keys(answerPrompt(state, 'xyzzy'))).toEqual([
      'wiz.genesis.never_heard',
      'wish.enough_tries',
    ]);
    expect(state.pendingPrompt).toBeNull();
    expect(created(state, before)).toEqual([]);
  });

  test('Escape creates nothing and changes nothing', () => {
    const state = warmGame(25);
    const hash = stateHash(state);
    expect(msgs(genesis(state, null))).toEqual([]);
    expect(state.pendingPrompt).toBeNull();
    expect(stateHash(state)).toBe(hash);
  });
});

describe('"Die?"', () => {
  /** A 1 HP hero next to a hostile jackal: waits until she dies and "Die?" is asked. */
  const dying = (seed: number): { state: GameState; events: GameEvent[]; jackal: number } => {
    const state = warmGame(seed);
    getPlayer(state).c.hp!.cur = 1;
    // the jackal goes next to her via makemon's enexto(), like genesis
    wizard.step(state, { type: 'mod', action: WIZ_GENESIS as DefId });
    answerPrompt(state, 'hostile jackal');
    const jackal = monsters(state).find((e) => e.def === 'nh:jackal')!;
    expect(jackal).toBeDefined();
    const events: GameEvent[] = [];
    for (let i = 0; i < 200 && !state.pendingPrompt; i++)
      events.push(...wizard.step(state, { type: 'wait' }).events);
    expect(state.pendingPrompt?.prompt).toMatchObject({
      id: 'die',
      kind: 'yn',
      key: 'wiz.die.prompt',
    });
    expect(state.pendingPrompt?.handler).toBe(WIZ_DIE);
    // pin the jackal so nothing else happens to her
    jackal.c.actor!.speed = 0;
    jackal.c.actor!.energy = 0;
    jackal.c.monster!.asleep = true;
    return { state, events, jackal: jackal.id };
  };

  test('dying asks "Die?"; no: "OK, so you don\'t die." and she lives on with full HP', () => {
    const { state, events } = dying(31);
    expect(msgs(events).map((m) => m.key)).toContain('combat.you_die');
    expect(state.gameOver).toBeNull();
    const after = answerPrompt(state, false);
    expect(msgs(after).map((m) => m.key)).toContain('wiz.die.ok');
    expect(state.gameOver).toBeNull();
    expect(state.pendingPrompt).toBeNull();
    const hp = getPlayer(state).c.hp!;
    expect(hp.cur).toBe(hp.max);
    // and the game goes on
    wizard.step(state, { type: 'wait' });
    expect(state.gameOver).toBeNull();
  });

  test('yes: the game ends with that death', () => {
    const { state } = dying(32);
    answerPrompt(state, true);
    expect(state.gameOver).toMatchObject({ kind: 'died', killer: '@nh:jackal' });
  });

  test('a normal game just ends', () => {
    // a seed whose angry jackal gets through within 200 turns (the hero at 1 HP regenerates)
    for (let seed = 33; seed < 63; seed++) {
      const { state } = normal.newGame({ seed });
      (state.modData['nh'] ??= {}) as Record<string, unknown>;
      (state.modData['nh'] as Record<string, unknown>)['debugMongen'] = true; // only the jackal
      normal.step(state, { type: 'wait' });
      getPlayer(state).c.hp!.cur = 1;
      const at = getPlayer(state).c.pos!;
      const jackal = makemon(
        ctxFor(state) as unknown as Ctx,
        normal.registry.monster('nh:jackal'),
        at,
        {
          adjacentOk: true,
          angry: true,
        },
      );
      expect(jackal).not.toBeNull();
      for (let i = 0; i < 200 && !state.gameOver; i++) {
        normal.step(state, { type: 'wait' });
        expect(state.pendingPrompt).toBeNull();
      }
      if (!state.gameOver) continue;
      expect(state.gameOver).toMatchObject({ kind: 'died', killer: '@nh:jackal' });
      return;
    }
    throw new Error('no seed where the jackal kills the hero');
  });
});
