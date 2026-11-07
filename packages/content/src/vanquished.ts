// Monster deaths per type (C's `mvitals[].died`) and the "Vanquished creatures:" list. A leaf
// (core only): mondeath.ts counts, disclose.ts lists.
// ref: src/mon.c mondead() (`mvitals[mndx].died++`); src/insight.c list_vanquished(),
// vanqsort_cmp()
import type { Ctx, DefId, GameState, Json, Msg, Registry } from '@nh/core';

interface VanqData {
  /** mvitals[].died by monster def id (absent = none) */
  vanquished?: Record<DefId, number>;
}

const nhOf = (state: Readonly<GameState>): VanqData | undefined => {
  const nh = state.modData['nh'];
  return typeof nh === 'object' && nh !== null && !Array.isArray(nh)
    ? (nh as unknown as VanqData)
    : undefined;
};

/**
 * A monster of type `def` died, by any hand: C counts every death, not only the hero's kills
 * ("includes all dead monsters, not just those killed by the player"). Capped at 255.
 * ref: src/mon.c mondead()
 */
export function countKill(ctx: Pick<Ctx, 'state'>, def: DefId): void {
  const md = ctx.state.modData;
  if (!nhOf(ctx.state)) md['nh'] = {};
  const nh = md['nh'] as unknown as VanqData;
  const v = (nh.vanquished ??= {});
  v[def] = Math.min(255, (v[def] ?? 0) + 1);
  md['nh'] = nh as unknown as Json;
}

/** How many monsters of type `def` have died. */
export function deaths(state: Readonly<GameState>, def: DefId): number {
  return nhOf(state)?.vanquished?.[def] ?? 0;
}

/** "twice", "thrice", "N times" (n > 1 here). ref: src/insight.c N_times() */
const nTimes = (n: number): Msg =>
  n === 2
    ? { key: 'end.twice' }
    : n === 3
      ? { key: 'end.thrice' }
      : { key: 'end.n_times', params: { n } };

/**
 * The vanquished list in C's default order (`vanq_sortmode` 't': monster level high to low,
 * then monster index), one line per type: "a jackal", "3 jackals", "the Oracle" ("the Oracle
 * (twice)"); with two types or more, a blank line and "N creatures vanquished.". Empty when
 * nothing died. ref: src/insight.c list_vanquished(), vanqsort_cmp() VANQ_MLVL_MNDX
 */
export function vanquishedLines(state: Readonly<GameState>, defs: Registry): Msg[] {
  const killed = defs.monsters
    .map((def, index) => ({ def, index, n: deaths(state, def.id) }))
    .filter((k) => k.n > 0)
    .sort((a, b) => b.def.level - a.def.level || a.index - b.index);
  const out: Msg[] = [];
  let total = 0;
  for (const { def, n } of killed) {
    total += n;
    const mon = `@${def.nameKey}`;
    if (def.genFlags.includes('uniq')) {
      // UniqCritterIndx(): "the " unless a personal name (M2_PNAME), then " (N times)"
      const key = def.flags.includes('pname') ? 'end.vanq.pname' : 'end.vanq.unique';
      out.push(
        n > 1
          ? { key: `${key}_times`, params: { mon, times: nTimes(n) } }
          : { key, params: { mon } },
      );
    } else out.push({ key: n === 1 ? 'end.vanq.one' : 'end.vanq.many', params: { mon, n } });
  }
  if (killed.length > 1)
    out.push({ key: 'end.blank' }, { key: 'end.vanq.total', params: { total } });
  return out;
}
