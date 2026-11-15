// The Wizard of Yendor's flag (C's `mtmp->iswiz`) and the count of Wizards in play (C's
// `svc.context.no_of_wizards`: he and his "Double Trouble" clone). A leaf over core: monmove,
// muse, teleport, covetous, mcastu and cuss read it.
//
// The flag lives in `modData.nh.iswiz: { [monsterId]: true }`, set by makemon() for the Wizard's
// kind and kept through a polymorph, as C's; mstate.ts forgets it with the monster's other states.
// The count is the number of monsters that hold it (C increments it in makemon() and decrements it
// in wizdeadorgone() when he dies or leaves the dungeon: the same number), so it needs no upkeep.
// ref: include/monst.h iswiz; include/context.h no_of_wizards; src/makemon.c makemon();
// src/wizard.c wizdeadorgone()
import { type Ctx, type DefId, type EntityId, type GameState, type Json } from '@nh/core';

/** ref: include/monsters.h PM_WIZARD_OF_YENDOR */
export const WIZARD_OF_YENDOR: DefId = 'nh:wizard_of_yendor';

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(state: Readonly<GameState>, create: boolean): Table | null {
  const md = (state as GameState).modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root['iswiz'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root['iswiz'] = t;
  }
  return t;
}

/** `mtmp->iswiz`: the monster is the Wizard of Yendor (or his clone). */
export function isWiz(ctx: Pick<Ctx, 'state'>, id: EntityId): boolean {
  return table(ctx.state, false)?.[String(id)] === true;
}

/** makemon(): `mtmp->iswiz = TRUE; no_of_wizards++` */
export function setIsWiz(ctx: Pick<Ctx, 'state'>, id: EntityId): void {
  const t = table(ctx.state, true);
  if (t) t[String(id)] = true;
}

/** `svc.context.no_of_wizards`: the Wizards in play, on any level. */
export function noOfWizards(ctx: Pick<Ctx, 'state'>): number {
  const t = table(ctx.state, false);
  if (!t) return 0;
  // a count: the keys' order does not matter
  return Object.keys(t).filter((k) => t[k] === true && ctx.state.entities[k]?.c.monster).length;
}
