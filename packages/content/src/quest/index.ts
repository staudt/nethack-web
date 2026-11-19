// The Quest's levels by role: each role's home, locate and goal levels and the fillers above and
// below the locate level (C substitutes the role's file code in dungeon.lua's "x-strt" names and
// makelevel()'s "%s-fila"/"%s-filb"); a role whose levels are not ported yet has the stand-in
// (reached only by a wizard-mode level teleport: plan Q10). Imported by dungeon.ts only.
// ref: dat/dungeon.lua "The Quest"; src/dungeon.c init_level(); src/mklev.c makelevel()
import type { DefId, LevelDef } from '@nh/core';
import type { SpLevFixup } from '../sp_lev';
import { roleDefId, type RoleKey } from '../urole';
import { ARC_FILA, ARC_FILB, ARC_FIXUPS, ARC_GOAL, ARC_LOCA, ARC_STRT } from './arc';
import { BAR_FILA, BAR_FILB, BAR_FIXUPS, BAR_GOAL, BAR_LOCA, BAR_STRT } from './bar';
import { CAV_FILA, CAV_FILB, CAV_FIXUPS, CAV_GOAL, CAV_LOCA, CAV_STRT } from './cav';
import { VAL_FILA, VAL_FILB, VAL_FIXUPS, VAL_GOAL, VAL_LOCA, VAL_STRT } from './val';

/** The stand-in for a quest level of a role whose levels are not ported yet: a lit open level. */
export const QUEST_STANDIN: LevelDef = {
  id: 'nh:quest-standin',
  init: { style: 'solidfill', fg: 'nh:floor', lit: true },
};

/** A role's five levels: home, locate, goal, the filler above and the one below the locate. */
type RoleLevels = readonly [
  strt: LevelDef,
  loca: LevelDef,
  goal: LevelDef,
  fila: LevelDef,
  filb: LevelDef,
];

/** The ported roles' levels, in role.c's order. */
const BY_ROLE: readonly (readonly [RoleKey, RoleLevels])[] = [
  ['archeologist', [ARC_STRT, ARC_LOCA, ARC_GOAL, ARC_FILA, ARC_FILB]],
  ['barbarian', [BAR_STRT, BAR_LOCA, BAR_GOAL, BAR_FILA, BAR_FILB]],
  ['caveman', [CAV_STRT, CAV_LOCA, CAV_GOAL, CAV_FILA, CAV_FILB]],
  ['valkyrie', [VAL_STRT, VAL_LOCA, VAL_GOAL, VAL_FILA, VAL_FILB]],
];

/** Every quest LevelDef. */
export const QUEST_LEVEL_DEFS: readonly LevelDef[] = [
  QUEST_STANDIN,
  ...BY_ROLE.flatMap(([, levels]) => levels),
];

/** Their fixups, by LevelDef id. */
export const QUEST_FIXUPS: Readonly<Record<DefId, SpLevFixup>> = {
  ...ARC_FIXUPS,
  ...BAR_FIXUPS,
  ...CAV_FIXUPS,
  ...VAL_FIXUPS,
};

/** One special level's LevelDef by RoleDef id. */
const special = (k: 0 | 1 | 2): Readonly<Record<DefId, readonly DefId[]>> =>
  Object.fromEntries(BY_ROLE.map(([role, levels]) => [roleDefId(role), [levels[k].id]]));

/** The home, locate and goal levels by RoleDef id (SpecialLevelDef.roleVariants). */
export const QUEST_ROLE_VARIANTS: Readonly<
  Record<'strt' | 'loca' | 'goal', Readonly<Record<DefId, readonly DefId[]>>>
> = { strt: special(0), loca: special(1), goal: special(2) };

/** The fillers above and below the locate level by RoleDef id (DungeonDef.roleFiller.byRole). */
export const QUEST_ROLE_FILLER: Readonly<Record<DefId, readonly [DefId, DefId]>> =
  Object.fromEntries(
    BY_ROLE.map(([role, levels]) => [roleDefId(role), [levels[3].id, levels[4].id] as const]),
  );
