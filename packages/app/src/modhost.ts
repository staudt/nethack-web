import { createHost, type FromCore, type Host, type Mod } from '@nh/core';
import type { ToWorker } from './remote';

/**
 * The worker side: a core host over the game mods last named by a `mods` message (vanilla only
 * until one arrives). Each `mods` message replaces the host, dropping any game in progress, so
 * the app sends it right before `new` or `load`.
 */
export function createModHost(
  known: Readonly<Record<string, Mod>>,
  defaults: readonly string[],
  post: (m: FromCore) => void,
): { handle(msg: ToWorker): void } {
  const build = (ids: readonly string[]): Host => {
    const mods = ids.map((id) => {
      const mod = Object.prototype.hasOwnProperty.call(known, id) ? known[id] : undefined;
      if (!mod) throw new Error(`Unknown game mod '${id}'`);
      return mod;
    });
    return createHost(mods, post);
  };
  let host = build(defaults);
  return {
    handle(msg) {
      if (msg.t !== 'mods') {
        host.handle(msg);
        return;
      }
      try {
        host = build(msg.ids);
      } catch (err) {
        post({ t: 'error', message: err instanceof Error ? err.message : String(err) });
      }
    },
  };
}
