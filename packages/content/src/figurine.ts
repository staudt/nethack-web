// Figurines: applying one sets it down to become a familiar (make_familiar() in dog.ts), and a
// cursed carried one transforms on its own when its timer fires (figurinestate.ts).
// ref: src/apply.c use_figurine(), figurine_location_checks(), fig_transform()
//
// Not ported (see DEVIATIONS.md "Figurines"): air, water and pools (none exist), object names,
// extinction, migrating figurines.
import {
  DIRS,
  NORMAL_SPEED,
  getPlayer,
  inBounds,
  itemsAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type ModApi,
  type Msg,
} from '@nh/core';
import { boulderAt } from './boulder';
import { makeFamiliar } from './dog';
import { locomotion } from './egg';
import { uswallow } from './engulfstate';
import {
  FIGURINE,
  FIG_TRANSFORM,
  attachFigTransformTimeout,
  stopFigTransform,
} from './figurinestate';
import { mnextoPos } from './generation';
import { hidesUnder, isUndetected } from './hidestate';
import { mapInvisible, monInvisible } from './invis';
import { useup } from './magic';
import { mayPasswall } from './mdig';
import { mappearance } from './mimicstate';
import { doname, xnameOf } from './objnam';
import { monNam } from './perception';
import { P, heroHas } from './props';
import { T, isObstructedId, terrainIdAt } from './terrain';
import { cansee, canseemon } from './trap';
import { wormRec } from './wormstate';
import { ZAP_DIRECTIONS, zapDirOf } from './zap';

/** The action that receives the answer to "In what direction?" after Apply on a figurine. */
export const FIGURINE_ID: DefId = 'nh:use_figurine';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const blind = (ctx: Ctx): boolean => heroHas(ctx.state, P.BLINDED);

/**
 * Whether the figurine's monster may appear at (x, y) (her square when `at` is null): not while
 * she is swallowed and carries it, not off the map, in rock, a wall or a tree (unless it passes
 * walls there) or on a boulder (unless it passes walls or throws rocks); with the reason unless
 * `quietly`. ref: src/apply.c figurine_location_checks()
 */
function figurineLocationChecks(
  ctx: Ctx,
  obj: Entity,
  at: { level: string; x: number; y: number } | null,
  quietly: boolean,
): boolean {
  const it = obj.c.item;
  if (it?.carriedBy === ctx.state.playerId && uswallow(ctx)) {
    if (!quietly) say(ctx, 'figurine.no_room');
    return false;
  }
  const hp = getPlayer(ctx.state).c.pos;
  const p = at ?? (hp ? { level: hp.level, x: hp.x, y: hp.y } : null);
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level || !inBounds(level, p.x, p.y)) {
    if (!quietly) say(ctx, 'figurine.cannot_put');
    return false;
  }
  const mon =
    it?.corpseOf && ctx.defs.isMonster(it.corpseOf) ? ctx.defs.monster(it.corpseOf) : null;
  const passesWalls = !!mon?.flags.includes('wallwalk');
  const typ = terrainIdAt(level, p.x, p.y);
  if (isObstructedId(typ) && !(passesWalls && mayPasswall(ctx, level, p.x, p.y))) {
    if (!quietly) say(ctx, typ === T.tree ? 'figurine.in_tree' : 'figurine.in_rock');
    return false;
  }
  if (boulderAt(ctx, p.level, p.x, p.y) && !passesWalls && !mon?.flags.includes('rockthrow')) {
    if (!quietly) say(ctx, 'figurine.on_boulder');
    return false;
  }
  return true;
}

/**
 * Applying a figurine: "In what direction?" (swallowed: "You don't have enough room in here.").
 * ref: src/apply.c use_figurine() (the prompt; the rest is useFigurine2())
 */
export function useFigurine(ctx: Ctx, obj: Entity): number {
  // can't activate a figurine while swallowed
  if (uswallow(ctx) && !figurineLocationChecks(ctx, obj, null, false)) return 0;
  ctx.ask(
    {
      id: 'figurine-direction',
      kind: 'direction',
      key: 'figurine.direction',
      options: [...ZAP_DIRECTIONS],
    },
    FIGURINE_ID,
    { item: obj.id },
  );
  return 0;
}

/**
 * The figurine set down toward `value` (a direction, herself, up or down; impaired as getdir()
 * does): unless the spot is refused (the move is still used), "You set the figurine beside you
 * and it transforms." ("...on the ground", "toss the figurine into the air"; "supposedly"
 * when blind), make_familiar() there, and the figurine is used up.
 * ref: src/apply.c use_figurine()
 */
export function useFigurine2(ctx: Ctx, obj: Entity, value: Json): number {
  const dir = zapDirOf(ctx, value);
  if (dir === undefined) return 0; // no direction: cancelled
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return 0;
  const d = dir === 'self' || dir === 'up' || dir === 'down' ? null : DIRS[dir];
  const at = { level: hp.level, x: hp.x + (d?.x ?? 0), y: hp.y + (d?.y ?? 0) };
  // passing FALSE here results in messages displayed
  if (!figurineLocationChecks(ctx, obj, at, false)) return NORMAL_SPEED;
  say(ctx, 'figurine.transforms', {
    how: {
      key: d ? 'figurine.how.beside' : dir === 'up' ? 'figurine.how.toss' : 'figurine.how.ground',
    },
    supposedly: blind(ctx) ? { key: 'figurine.supposedly' } : '',
  });
  makeFamiliar(ctx, at.x, at.y, { obj, quietly: false });
  stopFigTransform(ctx, obj.id);
  useup(ctx, obj.id);
  if (blind(ctx)) mapInvisible(ctx, at.x, at.y);
  return NORMAL_SPEED;
}

/** Where the figurine is: in the hero's or a monster's pack or on the floor (not in a box). */
function figurineWhere(
  ctx: Ctx,
  fig: Entity,
): {
  where: 'invent' | 'minvent' | 'floor';
  level: string;
  x: number;
  y: number;
  by?: Entity;
} | null {
  const it = fig.c.item;
  if (!it || it.containedIn !== undefined) return null;
  if (it.carriedBy !== null) {
    const by = ctx.state.entities[String(it.carriedBy)];
    const p = by?.c.pos;
    if (!by || !p) return null;
    return it.carriedBy === ctx.state.playerId
      ? { where: 'invent', ...p }
      : { where: 'minvent', ...p, by };
  }
  const p = fig.c.pos;
  return p ? { where: 'floor', ...p } : null;
}

/**
 * The timer callback: the figurine turns into its monster where it lies, or next to whoever
 * carries it; when there is no room the timer is set again (`rnd(5000)`). The monster is tame,
 * peaceful or hostile as make_familiar() decides (quietly); then "You see a kitten drop out of
 * your pack!" (felt when blind or the monster is not seen), "You see a figurine transform into a
 * kitten!", "You see a kitten drop out of the gnome's pack!" ("thin air" for an unseen carrier),
 * with "and vanish" or "and slither under ..." for a monster that hid at once. The figurine is
 * gone either way. One on another level transforms silently. ref: src/apply.c fig_transform()
 */
export function figTransform(ctx: Ctx, data: Json): void {
  const id = (data as { id?: unknown } | null)?.id;
  if (typeof id !== 'number') return;
  const figurine = ctx.state.entities[String(id)];
  const fit = figurine?.c.item;
  if (!figurine || figurine.def !== FIGURINE || !fit) return;
  const mndx = fit.corpseOf;
  if (!mndx || !ctx.defs.isMonster(mndx)) return;
  const loc = figurineWhere(ctx, figurine);
  const silent = !loc || loc.level !== ctx.state.currentLevel; // happened while away
  let cc = loc ? { level: loc.level, x: loc.x, y: loc.y } : null;
  if (cc && loc && loc.where !== 'floor') {
    // enexto(): the nearest free square to the carrier
    const level = ctx.state.levels[cc.level];
    const p = level ? mnextoPos(ctx, level, null, cc) : null;
    cc = p ? { level: cc.level, x: p.x, y: p.y } : null;
  }
  if (!cc || !loc || !figurineLocationChecks(ctx, figurine, cc, true)) {
    // reset the timer to try again later
    ctx.schedule(ctx.rng.rnd(5000), FIG_TRANSFORM, { id });
    return;
  }
  const canseeSpot = cansee(ctx, cc.level, cc.x, cc.y);
  const mid = makeFamiliar(ctx, cc.x, cc.y, { obj: figurine, quietly: true, level: cc.level });
  const mtmp = mid === null ? undefined : ctx.state.entities[String(mid)];
  if (mtmp?.c.pos) {
    const mdef = ctx.defs.monster(mtmp.def);
    // m_monnam(): the true type, even while hallucinating
    const who: Msg = { key: 'figurine.who', params: { mon: `@${mtmp.def}` } };
    const verb = `@egg.loco.${locomotion(mdef)}`;
    let suppressSee =
      (monInvisible(ctx, mtmp) && !heroHas(ctx.state, P.SEE_INVIS)) ||
      (mdef.glyph.ch === 'm' && mappearance(ctx, mtmp.id) !== null);
    let andVanish: Msg | string = '';
    if (isUndetected(ctx, mtmp.id)) {
      const mp = mtmp.c.pos;
      const mshelter = itemsAt(ctx.defs, ctx.state, mp.level, mp.x, mp.y)[0];
      if (hidesUnder(mdef) && mshelter)
        andVanish = {
          key: 'figurine.and_hide',
          params: {
            verb: `@egg.loco.${locomotion(mdef, 'crawl')}`,
            obj: doname(ctx.state, ctx.defs, mshelter),
          },
        };
      else if (mdef.glyph.ch === 'm' || mdef.glyph.ch === ';') suppressSee = true;
      else andVanish = { key: 'figurine.and_vanish' };
    }
    switch (loc.where) {
      case 'invent':
        if (blind(ctx) || suppressSee) say(ctx, 'figurine.pack_feel', { verb });
        else say(ctx, 'figurine.pack_see', { who, verb, vanish: andVanish });
        break;
      case 'floor':
        if (canseeSpot && !silent) {
          if (suppressSee)
            say(ctx, 'figurine.suddenly_vanishes', {
              fig: xnameOf(ctx.state, ctx.defs, figurine),
            });
          else say(ctx, 'figurine.floor_see', { who, vanish: andVanish });
        }
        break;
      case 'minvent':
        if (canseeSpot && !silent && !suppressSee) {
          const by = loc.by;
          // figurine carrying monster might be invisible
          const seen =
            !!by &&
            canseemon(ctx, by) &&
            (!wormRec(ctx.state, by.id) || cansee(ctx, loc.level, loc.x, loc.y));
          say(ctx, 'figurine.minvent_see', {
            who,
            verb,
            from:
              seen && by
                ? { key: 'figurine.from_pack', params: { mon: monNam(ctx, by) } }
                : { key: 'figurine.thin_air' },
            vanish: andVanish,
          });
        }
        break;
    }
  }
  // free figurine now
  if (fit.carriedBy === ctx.state.playerId) useup(ctx, figurine.id);
  else ctx.remove(figurine.id);
}

const useFigurineAction: ActionDef = {
  id: FIGURINE_ID,
  labelKey: 'action.nh:apply',
  handles: 'mod',
  // reached through Apply on a carried figurine (apply.ts), never offered on its own
  offer: () => [],
  perform: () => 0,
  answer(ctx, value, data) {
    const id = (data as { item?: unknown } | null)?.item;
    const obj = typeof id === 'number' ? ctx.state.entities[String(id)] : undefined;
    if (!obj || obj.def !== FIGURINE || obj.c.item?.carriedBy !== ctx.state.playerId) return 0;
    return useFigurine2(ctx, obj, value);
  },
};

export function registerFigurines(api: ModApi): void {
  api.defineAction(useFigurineAction);
  api.defineTimer({ id: FIG_TRANSFORM, fire: figTransform });
}

export { attachFigTransformTimeout };
