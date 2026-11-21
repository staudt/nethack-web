// The Quest's levels by role: each role's home, locate and goal levels and the fillers above and
// below the locate level (C substitutes the role's file code in dungeon.lua's "x-strt" names and
// makelevel()'s "%s-fila"/"%s-filb"); a role with no levels here (one a mod adds) has the
// stand-in. Imported by dungeon.ts only.
// ref: dat/dungeon.lua "The Quest"; src/dungeon.c init_level(); src/mklev.c makelevel()
import type { DefId, LevelDef } from '@nh/core';
import type { SpLevFixup } from '../sp_lev';
import { roleDefId, type RoleKey } from '../urole';
import { ARC_FILA, ARC_FILB, ARC_FIXUPS, ARC_GOAL, ARC_LOCA, ARC_STRT } from './arc';
import { BAR_FILA, BAR_FILB, BAR_FIXUPS, BAR_GOAL, BAR_LOCA, BAR_STRT } from './bar';
import { CAV_FILA, CAV_FILB, CAV_FIXUPS, CAV_GOAL, CAV_LOCA, CAV_STRT } from './cav';
import { HEA_FILA, HEA_FILB, HEA_FIXUPS, HEA_GOAL, HEA_LOCA, HEA_STRT } from './hea';
import { KNI_FILA, KNI_FILB, KNI_FIXUPS, KNI_GOAL, KNI_LOCA, KNI_STRT } from './kni';
import { MON_FILA, MON_FILB, MON_FIXUPS, MON_GOAL, MON_LOCA, MON_STRT } from './mon';
import { PRI_FILA, PRI_FILB, PRI_FIXUPS, PRI_GOAL, PRI_LOCA, PRI_STRT } from './pri';
import { RAN_FILA, RAN_FILB, RAN_FIXUPS, RAN_GOAL, RAN_LOCA, RAN_STRT } from './ran';
import { ROG_FILA, ROG_FILB, ROG_FIXUPS, ROG_GOAL, ROG_LOCA, ROG_STRT } from './rog';
import { SAM_FILA, SAM_FILB, SAM_FIXUPS, SAM_GOAL, SAM_LOCA, SAM_STRT } from './sam';
import { TOU_FILA, TOU_FILB, TOU_FIXUPS, TOU_GOAL, TOU_LOCA, TOU_STRT } from './tou';
import { VAL_FILA, VAL_FILB, VAL_FIXUPS, VAL_GOAL, VAL_LOCA, VAL_STRT } from './val';
import { WIZ_FILA, WIZ_FILB, WIZ_FIXUPS, WIZ_GOAL, WIZ_LOCA, WIZ_STRT } from './wiz';

/**
 * The stand-in for a quest level of a role with no quest levels here (a role a mod adds without
 * its own): a lit open level.
 */
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

/** Every role's levels, in role.c's order. */
const BY_ROLE: readonly (readonly [RoleKey, RoleLevels])[] = [
  ['archeologist', [ARC_STRT, ARC_LOCA, ARC_GOAL, ARC_FILA, ARC_FILB]],
  ['barbarian', [BAR_STRT, BAR_LOCA, BAR_GOAL, BAR_FILA, BAR_FILB]],
  ['caveman', [CAV_STRT, CAV_LOCA, CAV_GOAL, CAV_FILA, CAV_FILB]],
  ['healer', [HEA_STRT, HEA_LOCA, HEA_GOAL, HEA_FILA, HEA_FILB]],
  ['knight', [KNI_STRT, KNI_LOCA, KNI_GOAL, KNI_FILA, KNI_FILB]],
  ['monk', [MON_STRT, MON_LOCA, MON_GOAL, MON_FILA, MON_FILB]],
  ['priest', [PRI_STRT, PRI_LOCA, PRI_GOAL, PRI_FILA, PRI_FILB]],
  ['rogue', [ROG_STRT, ROG_LOCA, ROG_GOAL, ROG_FILA, ROG_FILB]],
  ['ranger', [RAN_STRT, RAN_LOCA, RAN_GOAL, RAN_FILA, RAN_FILB]],
  ['samurai', [SAM_STRT, SAM_LOCA, SAM_GOAL, SAM_FILA, SAM_FILB]],
  ['tourist', [TOU_STRT, TOU_LOCA, TOU_GOAL, TOU_FILA, TOU_FILB]],
  ['valkyrie', [VAL_STRT, VAL_LOCA, VAL_GOAL, VAL_FILA, VAL_FILB]],
  ['wizard', [WIZ_STRT, WIZ_LOCA, WIZ_GOAL, WIZ_FILA, WIZ_FILB]],
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
  ...HEA_FIXUPS,
  ...KNI_FIXUPS,
  ...MON_FIXUPS,
  ...PRI_FIXUPS,
  ...ROG_FIXUPS,
  ...RAN_FIXUPS,
  ...SAM_FIXUPS,
  ...TOU_FIXUPS,
  ...VAL_FIXUPS,
  ...WIZ_FIXUPS,
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
