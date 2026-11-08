// Statues: making one of a given monster (mkcorpstat(STATUE)) and breaking one (break_statue()).
// The random monster and spellbook of a new statue are mkobj.ts mksobjStatue(); the historic flag
// and the look are statuestate.ts; a monster turned to stone leaves its statue through
// mondeath.ts makeStatue(). Sits below zap.ts, dig.ts and scatter.ts.
// ref: src/mkobj.c mkcorpstat(); src/zap.c break_statue()
//
// Not ported: statue traps (break_statue()'s activate_statue_trap()), genders, shop billing for a
// fractured statue (fracture_rock()'s breakobj()).
import { contents, getPlayer, type Ctx, type DefId, type EntityId, type LevelId } from '@nh/core';
import { fractureRock } from './boulder';
import { placeObject } from './items';
import { adjalign } from './luck';
import { mksobjStatue, type MkobjCtx } from './mkobj';
import { STATUE, isHistoric, pruneHistoric, setHistoric } from './statuestate';
import type { Entity, ModApi } from '@nh/core';

/** ref: include/monsters.h PM_ARCHEOLOGIST (no such role yet) */
const ARCHEOLOGIST: DefId = 'nh:archeologist';

/**
 * A statue of `mon` (null: a random monster) at `at`. With `init` (CORPSTAT_INIT) it is made as
 * mksobj(STATUE, TRUE) makes it: the random monster rolled, maybe a spellbook inside, then `mon`
 * put in its place; `historic` is CORPSTAT_HISTORIC. ref: src/mkobj.c mkcorpstat(STATUE, ...)
 */
export function mkcorpstat(
  ctx: MkobjCtx,
  mon: DefId | null,
  at: { level: LevelId; x: number; y: number },
  opts: { init?: boolean; historic?: boolean; inMklev?: boolean } = {},
): EntityId {
  const id = mksobjStatue(
    ctx,
    ctx.defs.object(STATUE),
    { at, init: opts.init === true, ...(mon !== null ? { corpseOf: mon } : {}) },
    { level: at.level, inMklev: opts.inMklev === true },
  );
  if (opts.historic) setHistoric(ctx, id, true);
  return id;
}

/**
 * A statue on the floor hit by striking, force bolt, a pick-axe or a blast: what it held drops
 * where it stands and it becomes a pile of rocks (fracture_rock()). An Archeologist breaking a
 * historic statue feels guilty (-1 alignment). Returns true (C returns false when a statue trap
 * animates it instead; none exist yet). No message: the callers say what was seen or heard.
 * ref: src/zap.c break_statue()
 */
export function breakStatue(ctx: Ctx, obj: Entity, byYou = true): boolean {
  const p = obj.c.pos;
  if (!p) return false;
  // drop any objects contained inside the statue
  for (const item of contents(ctx.state, obj.id)) {
    const it = item.c.item;
    if (!it) continue;
    delete it.containedIn;
    placeObject(ctx, item.id, p.level, p.x, p.y);
  }
  if (byYou && getPlayer(ctx.state).def === ARCHEOLOGIST && isHistoric(ctx.state, obj.id)) {
    ctx.emit({ type: 'msg', key: 'statue.historic_guilt' });
    adjalign(ctx, -1);
  }
  setHistoric(ctx, obj.id, false); // obj->spe = 0
  fractureRock(ctx, obj, byYou);
  return true;
}

/** Statues: their historic flags are dropped once they are gone. */
export function registerStatues(api: ModApi): void {
  api.on('endOfTurn', (ctx) => pruneHistoric(ctx));
}
