// A throne's looted flag (C's T_LOOTED, kept in the location's `looted` bits): set once kicking
// it has shaken loose its coins and gems. A leaf: dokick.ts, throne.ts and the wizard's terrain
// wish share it. The state lives in `modData.nh.thrones[levelId][cellIndex]` (1 when looted); an
// entry is dropped when cleared, so a game without looted thrones keeps no table.
// ref: include/rm.h T_LOOTED
import { cellIndex, type Ctx, type LevelId } from '@nh/core';

type ThroneTable = Record<LevelId, Record<string, number>>;

function throneTable(state: Readonly<Ctx['state']>, create: boolean): ThroneTable | null {
  const md = state.modData;
  const nh = md['nh'] as { thrones?: ThroneTable } | undefined;
  if (nh?.thrones) return nh.thrones;
  if (!create) return null;
  const d = (md['nh'] ??= {}) as { thrones?: ThroneTable };
  d.thrones = {};
  return d.thrones;
}

/** Whether the throne at x,y has been looted (T_LOOTED). */
export function throneLooted(
  state: Readonly<Ctx['state']>,
  level: LevelId,
  x: number,
  y: number,
): boolean {
  const l = state.levels[level];
  if (!l) return false;
  return (throneTable(state, false)?.[level]?.[String(cellIndex(l, x, y))] ?? 0) !== 0;
}

/** Sets or clears the looted flag of the throne at x,y. */
export function setThroneLooted(
  ctx: Pick<Ctx, 'state'>,
  level: LevelId,
  x: number,
  y: number,
  looted: boolean,
): void {
  const l = ctx.state.levels[level];
  if (!l) return;
  const key = String(cellIndex(l, x, y));
  if (looted) {
    const t = throneTable(ctx.state, true);
    if (t) (t[level] ??= {})[key] = 1;
    return;
  }
  const t = throneTable(ctx.state, false);
  const lt = t?.[level];
  if (!t || !lt) return;
  delete lt[key];
  if (Object.keys(lt).length === 0) delete t[level];
}
