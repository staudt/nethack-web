import type {
  AsyncCoreQuery,
  FromCore,
  GameEvent,
  Json,
  PlayerAction,
  Prompt,
  ToCore,
  ViewUpdate,
} from '@nh/core';
import type { GameClient } from '@nh/ui';

/**
 * What the app sends the worker: the core protocol, plus `mods`, the app's own message that names
 * the game mods (by id) for the next `new` or `load`.
 */
export type ToWorker = ToCore | { t: 'mods'; ids: string[] };

export interface WorkerLike {
  postMessage(m: ToWorker): void;
  addEventListener(type: 'message', fn: (e: { data: FromCore }) => void): void;
}

export interface ViewMessage {
  view: ViewUpdate;
  events: GameEvent[];
  prompt: Prompt | null;
  /** A multi-turn action is in progress: the UI sends `continue` or cancels. */
  continuing: boolean;
}

export interface Remote extends GameClient {
  /** Names the game mods for the next `newGame` or `load` (drops any game in progress). */
  setMods(ids: string[]): void;
  newGame(seed: number, w: number, h: number): void;
  load(save: string): void;
  save(): Promise<string>;
  hash(): Promise<string>;
  onView(fn: (m: ViewMessage) => void): void;
  onError(fn: (message: string) => void): void;
}

interface Pending {
  resolve(v: never): void;
  reject(e: Error): void;
}

export function createRemote(worker: WorkerLike): Remote {
  let nextId = 1;
  const pending = new Map<number, Pending>();
  const viewFns: ((m: ViewMessage) => void)[] = [];
  const errorFns: ((m: string) => void)[] = [];
  // save/hash replies carry no id; the worker answers in order.
  const saveWaiters: Pending[] = [];
  const hashWaiters: Pending[] = [];

  worker.addEventListener('message', (e) => {
    const m = e.data;
    switch (m.t) {
      case 'view':
        for (const fn of viewFns)
          fn({ view: m.view, events: m.events, prompt: m.prompt, continuing: m.continuing });
        return;
      case 'reply': {
        const p = pending.get(m.id);
        pending.delete(m.id);
        p?.resolve(m.result as never);
        return;
      }
      case 'saved':
        saveWaiters.shift()?.resolve(m.save as never);
        return;
      case 'hash':
        hashWaiters.shift()?.resolve(m.hash as never);
        return;
      case 'error': {
        const match = /^query (\d+):/.exec(m.message);
        const id = match ? Number(match[1]) : null;
        const p = id !== null ? pending.get(id) : undefined;
        if (id !== null && p) {
          pending.delete(id);
          p.reject(new Error(m.message));
          return;
        }
        for (const fn of errorFns) fn(m.message);
      }
    }
  });

  const ask = <T>(waiters: Pending[], msg: ToCore): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      waiters.push({ resolve: resolve as (v: never) => void, reject });
      worker.postMessage(msg);
    });

  const call =
    (q: 'describe' | 'actionsFor' | 'pathTo' | 'trapAt') =>
    (...args: unknown[]): Promise<never> =>
      new Promise((resolve, reject) => {
        const id = nextId++;
        pending.set(id, { resolve, reject });
        worker.postMessage({ t: 'query', id, q, args: args as Json[] });
      });

  const query = {
    describe: call('describe'),
    actionsFor: call('actionsFor'),
    pathTo: call('pathTo'),
    trapAt: call('trapAt'),
  } as AsyncCoreQuery;

  return {
    act(action: PlayerAction) {
      worker.postMessage({ t: 'act', action });
    },
    query,
    setMods: (ids) => worker.postMessage({ t: 'mods', ids: [...ids] }),
    newGame: (seed, width, height) => worker.postMessage({ t: 'new', seed, width, height }),
    load: (save) => worker.postMessage({ t: 'load', save }),
    save: () => ask<string>(saveWaiters, { t: 'save' }),
    hash: () => ask<string>(hashWaiters, { t: 'hash' }),
    onView: (fn) => void viewFns.push(fn),
    onError: (fn) => void errorFns.push(fn),
  };
}
