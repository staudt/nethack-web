// Monster deaths per type (C's `mvitals[].died`) and the "Vanquished creatures:" list. A leaf
// (core only): mondeath.ts counts, disclose.ts lists.
// ref: src/mon.c mondead() (`mvitals[mndx].died++`); src/insight.c list_vanquished(), list_genocided(),
// vanqsort_cmp()
import {
  getPlayer,
  type Ctx,
  type DefId,
  type GameState,
  type Json,
  type Msg,
  type Registry,
} from '@nh/core';

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

// ---------------------------------------------------------------------------------------------
// genocide (C's `mvitals[].mvflags & G_GENOD`)

interface GenoData {
  /** The genocided species, sorted (absent = none). */
  genocided?: DefId[];
  /** done()'s killer for a polymorphed self-genocide, kept until she returns to her own form
   * (C's delayed_killer(POLYMORPH, ...)). */
  genoKiller?: string;
}

const genoOf = (state: Readonly<GameState>): GenoData | undefined =>
  nhOf(state) as GenoData | undefined;

/** Whether the species has been genocided. ref: `mvitals[mndx].mvflags & G_GENOD` */
export const isGenocided = (state: Readonly<GameState>, id: DefId | null | undefined): boolean =>
  !!id && (genoOf(state)?.genocided?.includes(id) ?? false);

/** The genocided species, sorted. */
export const genocidedIds = (state: Readonly<GameState>): readonly DefId[] =>
  genoOf(state)?.genocided ?? [];

/** Marks the species genocided (`mvflags |= G_GENOD | G_NOCORPSE`), keeping the list sorted. */
export function setGenocided(ctx: Pick<Ctx, 'state'>, id: DefId): void {
  const md = ctx.state.modData;
  if (!nhOf(ctx.state)) md['nh'] = {};
  const nh = md['nh'] as unknown as GenoData;
  const list = nh.genocided ?? [];
  if (!list.includes(id)) nh.genocided = [...list, id].sort();
  md['nh'] = nh as unknown as Json;
}

/**
 * The hero's role or race has been genocided: her race is human, and her role's monster (none
 * exists) is marked by the role's id. ref: src/polyself.c ugenocided()
 */
export const ugenocided = (state: Readonly<GameState>): boolean =>
  isGenocided(state, 'nh:human') || isGenocided(state, getPlayer(state).c.player?.role);

/** The killer kept for a polymorphed self-genocide, or null. */
export const genoKiller = (state: Readonly<GameState>): string | null =>
  genoOf(state)?.genoKiller ?? null;

/** Keeps (or with null forgets) the killer of a polymorphed self-genocide. */
export function setGenoKiller(ctx: Pick<Ctx, 'state'>, killer: string | null): void {
  const md = ctx.state.modData;
  if (!nhOf(ctx.state)) md['nh'] = {};
  const nh = md['nh'] as unknown as GenoData;
  if (killer === null) delete nh.genoKiller;
  else nh.genoKiller = killer;
  md['nh'] = nh as unknown as Json;
}

/**
 * The "Genocided species:" list in the vanquished order (monster level high to low, then
 * monster index), one plural name a line, then "N species genocided."; empty when nothing was
 * genocided. ref: src/insight.c list_genocided() (no extinction)
 */
export function genocidedLines(state: Readonly<GameState>, defs: Registry): Msg[] {
  const gone = defs.monsters
    .map((def, index) => ({ def, index }))
    .filter((k) => isGenocided(state, k.def.id))
    .sort((a, b) => b.def.level - a.def.level || a.index - b.index);
  if (gone.length === 0) return [];
  const out: Msg[] = gone.map(({ def }) => ({
    key: 'end.geno.one',
    params: { mon: `@${def.nameKey}` },
  }));
  out.push({ key: 'end.blank' }, { key: 'end.geno.total', params: { n: gone.length } });
  return out;
}
