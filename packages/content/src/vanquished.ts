// Monster vitals (C's `mvitals[]`): deaths per type and the "Vanquished creatures:" list, the
// genocided species, and births with extinction (`born`, G_EXTINCT). A leaf (core, racetab, urole):
// mondeath.ts counts deaths, generation.ts births, disclose.ts lists.
// ref: src/mon.c mondead() (`mvitals[mndx].died++`); src/insight.c list_vanquished(), list_genocided(),
// vanqsort_cmp(), num_extinct(), num_gone(); src/makemon.c propagate(), mbirth_limit(), unmakemon()
import {
  type Ctx,
  type DefId,
  type GameState,
  type Json,
  type MonsterDef,
  type Msg,
  type Registry,
} from '@nh/core';
import { RACES_TAB } from './racetab';
import { roleMonId } from './roletab';
import { urace, urole } from './urole';

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
 * The hero's role or race has been genocided: her role's monster (`urole.mnum`) or her race's
 * (`urace.mnum`). ref: src/polyself.c ugenocided()
 */
export const ugenocided = (state: Readonly<GameState>): boolean =>
  isGenocided(state, roleMonId(urole(state))) || isGenocided(state, RACES_TAB[urace(state)].mnum);

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

// ---------------------------------------------------------------------------------------------
// births and extinction (C's `mvitals[].born` and `mvitals[].mvflags & G_EXTINCT`)

interface BornData {
  /** mvitals[].born by monster def id, capped at 255 (absent = none). */
  born?: Record<DefId, number>;
  /** The extinct species (G_EXTINCT), sorted (absent = none). Set at birth, never recomputed:
   * cleared only by unmakemon() for a unique. */
  extinct?: DefId[];
}

const bornOf = (state: Readonly<GameState>): BornData | undefined =>
  nhOf(state) as BornData | undefined;

const writable = (ctx: Pick<Ctx, 'state'>): BornData => {
  const md = ctx.state.modData;
  if (!nhOf(ctx.state)) md['nh'] = {};
  return md['nh'] as unknown as BornData;
};

/** The default birth limit. ref: include/global.h MAXMONNO */
export const MAXMONNO = 120;

/**
 * How many of a kind may be born before it is extinct: the Nazgul 9, the erinyes 3, any other
 * MAXMONNO. ref: src/makemon.c mbirth_limit()
 */
export const mbirthLimit = (id: DefId): number =>
  id === 'nh:nazgul' ? 9 : id === 'nh:erinys' ? 3 : MAXMONNO;

/** How many monsters of type `id` were born (counted by makemon()). */
export const born = (state: Readonly<GameState>, id: DefId): number =>
  bornOf(state)?.born?.[id] ?? 0;

/** Whether the species is extinct (`mvflags & G_EXTINCT`). */
export const isExtinct = (state: Readonly<GameState>, id: DefId | null | undefined): boolean =>
  !!id && (bornOf(state)?.extinct?.includes(id) ?? false);

/** Genocided or extinct (`mvflags & G_GONE`). */
export const isGone = (state: Readonly<GameState>, id: DefId | null | undefined): boolean =>
  isGenocided(state, id) || isExtinct(state, id);

function setBorn(ctx: Pick<Ctx, 'state'>, id: DefId, n: number): void {
  const nh = writable(ctx);
  const b = (nh.born ??= {});
  b[id] = n;
}

function setExtinct(ctx: Pick<Ctx, 'state'>, id: DefId, on: boolean): void {
  const nh = writable(ctx);
  const list = nh.extinct ?? [];
  if (on && !list.includes(id)) nh.extinct = [...list, id].sort();
  else if (!on && list.includes(id)) {
    const rest = list.filter((x) => x !== id);
    if (rest.length > 0) nh.extinct = rest;
    else delete nh.extinct;
  }
}

/**
 * A monster of kind `def` is being born: a unique (but the high priest) is extinct from now on;
 * the birth is counted when `tally` (makemon() without MM_NOCOUNTBIRTH; a `ghostly` one from
 * bones only if it could be born); reaching the birth limit makes a randomly generated kind
 * extinct. True when the kind could still be born (under its limit and not gone).
 * ref: src/makemon.c propagate()
 */
export function propagate(
  ctx: Pick<Ctx, 'state'>,
  def: MonsterDef,
  tally: boolean,
  ghostly = false,
): boolean {
  const lim = mbirthLimit(def.id);
  const gone = isGone(ctx.state, def.id); // geno'd|extinct
  let n = born(ctx.state, def.id);
  const result = n < lim && !gone;
  // if it's unique, don't ever make it again
  if (def.genFlags.includes('uniq') && def.id !== HIGH_CLERIC) setExtinct(ctx, def.id, true);
  if (n < 255 && tally && (!ghostly || result)) setBorn(ctx, def.id, ++n);
  if (n >= lim && !def.genFlags.includes('nogen') && !isExtinct(ctx.state, def.id))
    setExtinct(ctx, def.id, true);
  return result;
}

/**
 * The birth of a monster the caller rejects is undone: one fewer born (unless the count was not
 * kept or has reached 255), and a unique is no longer extinct. The caller removes the monster.
 * ref: src/makemon.c unmakemon()
 */
export function unmakeBirth(ctx: Pick<Ctx, 'state'>, def: MonsterDef, countbirth: boolean): void {
  // if count has reached the limit of 255, we don't know whether that just happened when
  // creating this monster or the threshold had already been reached and further increments
  // were suppressed; assume the latter
  const n = born(ctx.state, def.id);
  if (countbirth && n > 0 && n < 255) setBorn(ctx, def.id, n - 1);
  if (def.genFlags.includes('uniq')) setExtinct(ctx, def.id, false);
}

/** C's PM_HIGH_CLERIC */
const HIGH_CLERIC: DefId = 'nh:high_priest';

/** A unique kind, never listed as extinct. ref: src/insight.c UniqCritterIndx() */
const uniqCritter = (def: MonsterDef): boolean =>
  def.genFlags.includes('uniq') && def.id !== HIGH_CLERIC;

/** Extinct but not genocided, not unique. ref: src/insight.c num_extinct() */
const extinctOnly = (state: Readonly<GameState>, def: MonsterDef): boolean =>
  !uniqCritter(def) && isExtinct(state, def.id) && !isGenocided(state, def.id);

/**
 * How many species are genocided and (with `both`) extinct; the counts choose the disclosure's
 * question and title. ref: src/insight.c list_genocided() num_genocides(), num_extinct()
 */
export function goneCounts(
  state: Readonly<GameState>,
  defs: Registry,
  both: boolean,
): { genocided: number; extinct: number } {
  let genocided = 0;
  let extinct = 0;
  for (const def of defs.monsters) {
    if (isGenocided(state, def.id)) genocided++;
    else if (both && extinctOnly(state, def)) extinct++;
  }
  return { genocided, extinct };
}

/**
 * The "Genocided species:" list in the vanquished order (monster level high to low, then
 * monster index), one plural name a line; with `both` (game over, wizard mode) also the extinct
 * species, marked " (extinct)"; then "N species genocided." and "N species extinct."; empty when
 * nothing is listed. ref: src/insight.c list_genocided(), num_gone()
 */
export function genocidedLines(state: Readonly<GameState>, defs: Registry, both = false): Msg[] {
  const gone = defs.monsters
    .map((def, index) => ({ def, index }))
    .filter(
      (k) =>
        !uniqCritter(k.def) &&
        (isGenocided(state, k.def.id) || (both && extinctOnly(state, k.def))),
    )
    .sort((a, b) => b.def.level - a.def.level || a.index - b.index);
  if (gone.length === 0) return [];
  const out: Msg[] = gone.map(({ def }) => ({
    key: extinctOnly(state, def) ? 'end.geno.extinct' : 'end.geno.one',
    params: { mon: `@${def.nameKey}` },
  }));
  const n = goneCounts(state, defs, both);
  out.push({ key: 'end.blank' });
  if (n.genocided > 0) out.push({ key: 'end.geno.total', params: { n: n.genocided } });
  if (n.extinct > 0) out.push({ key: 'end.geno.extinct_total', params: { n: n.extinct } });
  return out;
}
