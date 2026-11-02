// Noise that wakes monsters. ref: src/mon.c wake_nearto_core()
import { sortedIds, type Ctx, type Msg } from '@nh/core';
import { heroSees } from './mongear';
import { monNam } from './perception';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * Wakes the monsters near a place without angering them.
 * ref: src/mon.c wake_nearto_core(): `dist2 < distance` sets msleeping = 0 (wake_msg() says so)
 */
export function wakeNearto(ctx: Ctx, x: number, y: number, distance: number): void {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    const m = e?.c.monster;
    const p = e?.c.pos;
    if (!e || !m || !p || p.level !== ctx.state.currentLevel) continue;
    if ((p.x - x) ** 2 + (p.y - y) ** 2 >= distance) continue;
    if (m.asleep && heroSees(ctx, p)) say(ctx, 'mon.wakes_up_calm', { mon: monNam(ctx, e) });
    m.asleep = false;
  }
}
