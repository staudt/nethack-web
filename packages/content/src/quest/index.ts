// The Quest's levels by role: each role's home, locate and goal levels and the fillers above and
// below the locate level (C substitutes the role's file code in dungeon.lua's "x-strt" names and
// makelevel()'s "%s-fila"/"%s-filb"); a role whose levels are not ported yet has the stand-in
// (reached only by a wizard-mode level teleport: plan Q10). Imported by dungeon.ts only.
// ref: dat/dungeon.lua "The Quest"; src/dungeon.c init_level(); src/mklev.c makelevel()
import type { DefId, LevelDef } from '@nh/core';
import type { SpLevFixup } from '../sp_lev';
import { roleDefId } from '../urole';
import { VAL_FILA, VAL_FILB, VAL_FIXUPS, VAL_GOAL, VAL_LEVELS, VAL_LOCA, VAL_STRT } from './val';

/** The stand-in for a quest level of a role whose levels are not ported yet: a lit open level. */
export const QUEST_STANDIN: LevelDef = {
  id: 'nh:quest-standin',
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
};

/** Every quest LevelDef. */
export const QUEST_LEVEL_DEFS: readonly LevelDef[] = [QUEST_STANDIN, ...VAL_LEVELS];

/** Their fixups, by LevelDef id. */
export const QUEST_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = { ...VAL_FIXUPS };

/** The home, locate and goal levels by RoleDef id (SpecialLevelDef.roleVariants). */
export const QUEST_ROLE_VARIANTS: Readonly<
  Record<'strt' | 'loca' | 'goal', Readonly<Record<DefId, readonly DefId[]>>>
> = {
  strt: { [roleDefId('valkyrie')]: [VAL_STRT.id] },
  loca: { [roleDefId('valkyrie')]: [VAL_LOCA.id] },
  goal: { [roleDefId('valkyrie')]: [VAL_GOAL.id] },
};

/** The fillers above and below the locate level by RoleDef id (DungeonDef.roleFiller.byRole). */
export const QUEST_ROLE_FILLER: Readonly<Record<DefId, readonly [DefId, DefId]>> = {
  [roleDefId('valkyrie')]: [VAL_FILA.id, VAL_FILB.id],
};
