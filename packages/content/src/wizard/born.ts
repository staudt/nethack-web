import type { ActionDef, Ctx, GameState, Msg, Registry } from '@nh/core';
import { born, deaths, isExtinct, isGenocided } from '../vanquished';

export const WIZ_BORN = 'wiz:born';

/**
 * #wizborn's lines: "died born", then one line per kind that was born, died or is gone (its
 * deaths, births, E extinct, G genocided, X both, and its name), then the totals.
 * ref: src/insight.c doborn()
 */
export function bornLines(state: Readonly<GameState>, defs: Registry): Msg[] {
  // C's "%4i %4i %c %-30s"
  const pad = (n: number): string => String(n).padStart(4);
  const out: Msg[] = [{ key: 'wiz.born.header' }];
  let nborn = 0;
  let ndied = 0;
  for (const def of defs.monsters) {
    const b = born(state, def.id);
    const d = deaths(state, def.id);
    const g = isGenocided(state, def.id);
    const e = isExtinct(state, def.id);
    if (!b && !d && !g && !e) continue;
    const flag = e && g ? 'X' : e ? 'E' : g ? 'G' : ' ';
    out.push({
      key: 'wiz.born.line',
      params: { died: pad(d), born: pad(b), flag, mon: `@${def.nameKey}` },
    });
    nborn += b;
    ndied += d;
  }
  out.push({ key: 'wiz.born.blank' });
  out.push({ key: 'wiz.born.total', params: { died: pad(ndied), born: pad(nborn) } });
  return out;
}

/** #wizborn: the birth and death counts as a list; takes no time. ref: src/insight.c doborn() */
export const wizBorn: ActionDef = {
  id: WIZ_BORN,
  labelKey: 'action.wiz:born',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: WIZ_BORN }, labelKey: 'action.wiz:born' }]
      : [],
  perform(ctx: Ctx) {
    ctx.emit({ type: 'list', titleKey: 'wiz.born.title', items: bornLines(ctx.state, ctx.defs) });
    return 0;
  },
};
