// Wizard mode scenarios, through the offered actions and their prompts, replayed as plain
// PlayerActions: level teleport into the Mines and back, a wish, genesis and declining death;
// and a normal game, which offers none of it.
import { WIZ_GENESIS, WIZ_LEVELPORT, WIZ_WISH, vanillaMod, wizardMod } from '@nh/content';
import {
  createEngine,
  createHost,
  getLevel,
  getPlayer,
  inventoryOf,
  isPlainFloor,
  stateHash,
  type DefId,
  type FromCore,
  type GameState,
  type Json,
  type PlayerAction,
  type ToCore,
} from '@nh/core';
import { describe, expect, test } from 'vitest';
import { checkInvariants } from '../src/index';

const engine = createEngine([vanillaMod, wizardMod]);

/** Takes the offered self action, then answers each menu with the option whose value matches. */
function levelport(state: GameState, log: PlayerAction[], dungeon: DefId, dlevel: number): void {
  const offer = engine
    .query(state)
    .actionsFor({ kind: 'self' })
    .find((o) => o.action.type === 'mod' && o.action.action === WIZ_LEVELPORT);
  if (!offer) throw new Error('wiz:levelport is not offered');
  const act = (a: PlayerAction): void => {
    log.push(a);
    engine.step(state, a);
  };
  act(offer.action);
  for (const want of [dungeon, dlevel] as Json[]) {
    const p = state.pendingPrompt?.prompt;
    const opt = p?.options?.find((o) => o.value === want);
    if (!p || !opt) throw new Error(`no option ${JSON.stringify(want)}`);
    act({ type: 'answer', promptId: p.id, value: opt.value });
  }
}

const onFloor = (state: GameState): boolean => {
  const p = getPlayer(state).c.pos;
  return !!p && isPlainFloor(engine.registry, getLevel(state), p.x, p.y);
};

describe('wizard level teleport', () => {
  test('into the Mines bottom and back to DL1, replayed to the same state', () => {
    const { state } = engine.newGame({ seed: 11 });
    const log: PlayerAction[] = [];
    const mines = state.dungeons.find((d) => d.id === 'nh:mines');
    const bottom = mines?.levels ?? 0;
    expect(bottom).toBeGreaterThan(1);
    const turn = state.turn;

    levelport(state, log, 'nh:mines', bottom);
    expect([getLevel(state).dungeon, getLevel(state).dlevel]).toEqual(['nh:mines', bottom]);
    expect(onFloor(state)).toBe(true);
    expect(checkInvariants(state, engine.registry)).toEqual([]);

    levelport(state, log, 'nh:main', 1);
    expect([getLevel(state).dungeon, getLevel(state).dlevel]).toEqual(['nh:main', 1]);
    expect(onFloor(state)).toBe(true);
    expect(checkInvariants(state, engine.registry)).toEqual([]);
    expect(state.turn).toBe(turn);

    const again = engine.newGame({ seed: 11 }).state;
    for (const a of JSON.parse(JSON.stringify(log)) as PlayerAction[]) engine.step(again, a);
    expect(stateHash(again)).toBe(stateHash(state));
  });
});

const normal = createEngine([vanillaMod]);

/** A wizard game after one step, with random spawning off (the 1 in 70 roll is still drawn). */
function warm(seed: number): { state: GameState; log: PlayerAction[] } {
  const { state } = engine.newGame({ seed });
  const nh = (state.modData['nh'] ??= {}) as Record<string, unknown>;
  nh['debugMongen'] = true;
  const log: PlayerAction[] = [{ type: 'wait' }];
  engine.step(state, { type: 'wait' });
  return { state, log };
}

/** Takes the offered self action `id`, then answers its text prompt with `text`. */
function command(state: GameState, log: PlayerAction[], id: string, text: Json): void {
  const offer = engine
    .query(state)
    .actionsFor({ kind: 'self' })
    .find((o) => o.action.type === 'mod' && o.action.action === id);
  if (!offer) throw new Error(`${id} is not offered`);
  log.push(offer.action);
  engine.step(state, offer.action);
  const answer: PlayerAction = {
    type: 'answer',
    promptId: state.pendingPrompt?.prompt.id ?? '',
    value: text,
  };
  log.push(answer);
  engine.step(state, answer);
}

const replays = (seed: number, log: PlayerAction[], state: GameState): void => {
  const { state: again } = engine.newGame({ seed });
  const nh = (again.modData['nh'] ??= {}) as Record<string, unknown>;
  nh['debugMongen'] = true;
  for (const a of JSON.parse(JSON.stringify(log)) as PlayerAction[]) engine.step(again, a);
  expect(stateHash(again)).toBe(stateHash(state));
};

const monstersHere = (state: GameState) =>
  Object.values(state.entities)
    .filter((e) => e.c.monster !== undefined && e.c.pos?.level === state.currentLevel)
    .sort((a, b) => a.id - b.id);

describe('wizard wish, genesis and "Die?"', () => {
  test('a wished-for item is in the inventory with the asked-for properties', () => {
    const { state, log } = warm(41);
    command(state, log, WIZ_WISH, '2 blessed +3 daggers');
    const d = inventoryOf(state, state.playerId).find(
      (e) => e.def === 'nh:dagger' && e.c.item?.spe === 3,
    );
    expect(d?.c.item).toMatchObject({ quantity: 2, buc: 'blessed', spe: 3 });
    command(state, log, WIZ_WISH, 'cursed ring of free action');
    const r = inventoryOf(state, state.playerId).find((e) => e.def === 'nh:ring_of_free_action');
    expect(r?.c.item?.buc).toBe('cursed');
    expect(checkInvariants(state, engine.registry)).toEqual([]);
    replays(41, log, state);
  });

  test('genesis creates the named monster next to the hero', () => {
    const { state, log } = warm(42);
    const before = new Set(monstersHere(state).map((e) => e.id));
    command(state, log, WIZ_GENESIS, 'jackal');
    const made = monstersHere(state).filter((e) => !before.has(e.id));
    expect(made.map((e) => e.def)).toEqual(['nh:jackal']);
    const h = getPlayer(state).c.pos!;
    const p = made[0]!.c.pos!;
    expect(Math.max(Math.abs(p.x - h.x), Math.abs(p.y - h.y))).toBe(1);
    expect(checkInvariants(state, engine.registry)).toEqual([]);
    replays(42, log, state);
  });

  test('declining death leaves the hero alive with full HP', () => {
    // (seed 44 since m11 step 3: on 43 the genesised jackal no longer finds its way to her)
    const { state, log } = warm(44);
    command(state, log, WIZ_GENESIS, 'hostile jackal');
    const jackal = monstersHere(state).find((e) => e.def === 'nh:jackal')!;
    // only the jackal stays (a pet would kill it first); their inventories go with them
    for (const m of monstersHere(state))
      if (m.id !== jackal.id) {
        for (const e of Object.values(state.entities))
          if (e.c.item?.carriedBy === m.id) delete state.entities[String(e.id)];
        delete state.entities[String(m.id)];
      }
    getPlayer(state).c.hp!.cur = 1;
    for (let i = 0; i < 200 && !state.pendingPrompt; i++) engine.step(state, { type: 'wait' });
    const p = state.pendingPrompt?.prompt;
    expect([p?.id, p?.kind, p?.key]).toEqual(['die', 'yn', 'wiz.die.prompt']);
    // pin the jackal and every other monster here: nothing more happens to her
    for (const m of [jackal, ...monstersHere(state)]) {
      m.c.actor!.speed = 0;
      m.c.actor!.energy = 0;
      m.c.monster!.asleep = true;
    }
    engine.step(state, { type: 'answer', promptId: 'die', value: false });
    expect(state.gameOver).toBeNull();
    const hp = getPlayer(state).c.hp!;
    expect(hp.cur).toBe(hp.max);
    engine.step(state, { type: 'wait' });
    expect(state.gameOver).toBeNull();
    expect(checkInvariants(state, engine.registry)).toEqual([]);
  });

  test('a normal game offers no wiz: actions and its state is the same as a wizard one', () => {
    const { state } = normal.newGame({ seed: 44 });
    const offered = normal
      .query(state)
      .actionsFor({ kind: 'self' })
      .filter((o) => o.action.type === 'mod' && o.action.action.startsWith('wiz:'));
    expect(offered).toEqual([]);
    const wiz = engine.newGame({ seed: 44 }).state;
    for (const st of [state, wiz]) normal.step(st, { type: 'wait' });
    expect(stateHash({ ...wiz, mods: state.mods })).toBe(stateHash(state));
  });
});

describe('"Die?" through the worker host', () => {
  /**
   * A wizard game whose hero, at 1 HP among three hostile soldier ants (nothing else on the
   * level), has just been asked "Die?", saved as the app autosaves it; the first seed from `from`
   * where that happens within 200 turns.
   */
  const dyingSave = (from: number, pin: boolean): string => {
    for (let seed = from; seed < from + 20; seed++) {
      const { state, log } = warm(seed);
      for (let i = 0; i < 3; i++) command(state, log, WIZ_GENESIS, 'hostile soldier ant');
      for (const m of monstersHere(state))
        if (m.def !== 'nh:soldier_ant') {
          for (const e of Object.values(state.entities))
            if (e.c.item?.carriedBy === m.id) delete state.entities[String(e.id)];
          delete state.entities[String(m.id)];
        }
      getPlayer(state).c.hp!.cur = 1;
      for (let i = 0; i < 200 && !state.pendingPrompt; i++) engine.step(state, { type: 'wait' });
      if (state.pendingPrompt?.prompt.id !== 'die') continue;
      if (pin)
        for (const m of monstersHere(state)) {
          m.c.actor!.speed = 0;
          m.c.actor!.energy = 0;
          m.c.monster!.asleep = true;
        }
      const level = getLevel(state);
      return engine.save(state, {
        seed: state.seed,
        width: level.width,
        height: level.height,
        mods: state.mods.map((m) => ({ ...m })),
        character: { ...getPlayer(state).c.player! },
        actions: log,
      });
    }
    throw new Error('no seed where the ants kill her');
  };
  const loadHost = (save: string) => {
    const out: FromCore[] = [];
    const host = createHost([vanillaMod, wizardMod], (m) => void out.push(m));
    const send = (m: ToCore): FromCore => {
      host.handle(m);
      const r = out[out.length - 1]!;
      if (r.t === 'error') throw new Error(r.message);
      return r;
    };
    return { send, loaded: send({ t: 'load', save }) };
  };
  const view = (m: FromCore) => {
    if (m.t !== 'view') throw new Error(`not a view: ${m.t}`);
    return m;
  };
  const keys = (m: FromCore): string[] =>
    view(m).events.flatMap((e) => (e.type === 'msg' ? [e.key] : []));
  const dead = (m: FromCore): boolean => view(m).view.status['dead'] !== undefined;
  const NO: ToCore = { t: 'act', action: { type: 'answer', promptId: 'die', value: false } };

  test('no while the ants are pinned: she lives on and the next action works', () => {
    const { send, loaded } = loadHost(dyingSave(51, true));
    // a game saved while "Die?" is pending asks it again when loaded
    expect(view(loaded).prompt).toMatchObject({ id: 'die', kind: 'yn' });
    const r = send(NO);
    expect(keys(r)).toContain('wiz.die.ok');
    expect(view(r).prompt).toBeNull();
    expect(dead(r)).toBe(false);
    const turn = view(r).view.turn;
    const next = send({ t: 'act', action: { type: 'wait' } });
    expect(view(next).prompt).toBeNull();
    expect(dead(next)).toBe(false);
    expect(view(next).view.turn).toBeGreaterThan(turn);
  });

  test('no among free ants asks again in the same step; a stray action gets it back; yes ends', () => {
    // she is helpless for the rest of the turn (savelife()'s nomul) and the ants kill her again:
    // the answer's own view carries "OK, so you don't die." and a new "Die?" with the same id
    // (the first seed where the very first "no" does that)
    let found: { send: (m: ToCore) => FromCore } | null = null;
    for (let seed = 61; seed < 81 && !found; seed++) {
      const { send, loaded } = loadHost(dyingSave(seed, false));
      expect(view(loaded).prompt?.id).toBe('die');
      const r = send(NO);
      expect(keys(r)).toContain('wiz.die.ok');
      expect(dead(r)).toBe(false);
      if (view(r).prompt?.id === 'die') found = { send };
    }
    if (!found) throw new Error('no seed where "no" is asked again at once');
    const { send } = found;
    // a stray action while "Die?" is pending: the question again, not an error, nothing happens
    const hash = send({ t: 'hash' });
    const stray = send({ t: 'act', action: { type: 'search' } });
    expect(view(stray).prompt?.id).toBe('die');
    expect(view(stray).events).toEqual([]);
    expect(send({ t: 'hash' })).toEqual(hash);
    // yes: the game ends with that death
    const end = send({ t: 'act', action: { type: 'answer', promptId: 'die', value: true } });
    expect(view(end).prompt).toBeNull();
    expect(dead(end)).toBe(true);
  });
});
