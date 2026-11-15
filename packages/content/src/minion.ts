// Demons summoning demons: a demon next to the hero may gate in another (mhitu's summonmu()), a
// demon prince or lord picking among the princes and lords by C's monster index ranges.
// ref: src/minion.c msummon(), dprince(), dlord(), ndemon(), monster_census(); src/mondata.c
// msummon_environ()
//
// Not ported (no such monster or object here): Demonbane ("looks puzzled for a moment"),
// minions and Angels (lminion(), llord(), the elementals), the bone devil's skeleton, the
// Wizard of Yendor as summoner (msummon(NULL)), the endgame (dprince()/dlord() never try there).
// Princes and lords absent from the monster table count as gone (G_GONE), as do genocided kinds
// and a unique one that was already made (C's G_EXTINCT: no birth counts here, so a unique is gone
// while one is alive anywhere or after one died).
import {
  getLevel,
  getPlayer,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type MonsterDef,
} from '@nh/core';
import { makemon } from './generation';
import { canseemon } from './invis';
import { isDlord, isDprince, isNdemon } from './mondata';
import { monNam } from './perception';
import { ndemon } from './roommon';
import { deaths, isGenocided } from './vanquished';

/** PM_ORCUS .. PM_DEMOGORGON in C's order (dprince()'s `rn1()` range). ref: include/monsters.h */
export const DEMON_PRINCES: readonly DefId[] = [
  'nh:orcus',
  'nh:geryon',
  'nh:dispater',
  'nh:baalzebub',
  'nh:asmodeus',
  'nh:demogorgon',
];

/** PM_JUIBLEX .. PM_YEENOGHU in C's order (dlord()'s `rn1()` range). ref: include/monsters.h */
export const DEMON_LORDS: readonly DefId[] = ['nh:juiblex', 'nh:yeenoghu'];

/**
 * `mvitals[pm].mvflags & G_GONE`: genocided, absent from the monster table, or a unique kind that
 * already exists or died (G_EXTINCT).
 */
export function demonGone(ctx: Pick<Ctx, 'state' | 'defs'>, pm: DefId): boolean {
  if (!ctx.defs.isMonster(pm) || isGenocided(ctx.state, pm)) return true;
  if (!ctx.defs.monster(pm).genFlags.includes('uniq')) return false;
  if (deaths(ctx.state, pm) > 0) return true;
  return sortedIds(ctx.state).some((id) => {
    const e = ctx.state.entities[String(id)];
    return e?.def === pm && e.c.monster !== undefined;
  });
}

type SummonCtx = Pick<Ctx, 'state' | 'rng' | 'defs'>;

/** `atyp == A_NONE || sgn(mons[pm].maligntyp) == sgn(atyp)`; A_NONE is `undefined` here */
const aligned = (ctx: SummonCtx, pm: DefId, atyp: number | undefined): boolean =>
  atyp === undefined || Math.sign(ctx.defs.monster(pm).alignment) === Math.sign(atyp);

/** One of `range` by C's `rn1(len, first)`, tried 20 times; null when none suited. */
function pickFrom(ctx: SummonCtx, range: readonly DefId[], atyp: number | undefined): DefId | null {
  for (let tryct = 20; tryct > 0; --tryct) {
    const pm = range[ctx.rng.rn2(range.length)] as DefId;
    if (!demonGone(ctx, pm) && aligned(ctx, pm, atyp)) return pm;
  }
  return null;
}

const depthOf = (ctx: SummonCtx): number => getLevel(ctx.state).depth; // level_difficulty()

/** A minor demon of alignment sign `atyp`, or null (NON_PM). ref: src/minion.c ndemon() */
function ndemonPm(ctx: SummonCtx, atyp: number | undefined): DefId | null {
  return ndemon(ctx, depthOf(ctx), atyp)?.id ?? null;
}

/** A demon lord, else (approximate) a minor demon. ref: src/minion.c dlord() */
export function dlord(ctx: SummonCtx, atyp: number | undefined): DefId | null {
  return pickFrom(ctx, DEMON_LORDS, atyp) ?? ndemonPm(ctx, atyp);
}

/** A demon prince, else (approximate) a lord. ref: src/minion.c dprince() */
export function dprince(ctx: SummonCtx, atyp: number | undefined): DefId | null {
  return pickFrom(ctx, DEMON_PRINCES, atyp) ?? dlord(ctx, atyp);
}

/**
 * What a summoned monster appears in: "cloud" of "smoke", "vapor" for the water demon (and the
 * other watery kinds), "steam", "shower" of "sparks", "dust", "ball" of "flame", "flash" of
 * "light" for the A and y classes. ref: src/mondata.c msummon_environ()
 */
export function msummonEnviron(def: MonsterDef): { cloud: string; what: string } {
  const mndx =
    def.glyph.ch === 'A' ? 'nh:angel' : def.glyph.ch === 'y' ? 'nh:yellow_light' : def.id;
  switch (mndx) {
    case 'nh:water_demon':
    case 'nh:air_elemental':
    case 'nh:water_elemental':
    case 'nh:fog_cloud':
    case 'nh:ice_vortex':
    case 'nh:freezing_sphere':
      return { cloud: 'cloud', what: 'vapor' };
    case 'nh:steam_vortex':
      return { cloud: 'cloud', what: 'steam' };
    case 'nh:energy_vortex':
    case 'nh:shocking_sphere':
      return { cloud: 'shower', what: 'sparks' };
    case 'nh:earth_elemental':
    case 'nh:dust_vortex':
      return { cloud: 'cloud', what: 'dust' };
    case 'nh:fire_elemental':
    case 'nh:fire_vortex':
    case 'nh:flaming_sphere':
      return { cloud: 'ball', what: 'flame' };
    case 'nh:angel':
    case 'nh:yellow_light':
      return { cloud: 'flash', what: 'light' };
    default:
      return { cloud: 'cloud', what: 'smoke' };
  }
}

/** Live monsters on the hero's level. ref: src/minion.c monster_census(FALSE) */
function monsterCensus(ctx: Pick<Ctx, 'state'>): number {
  const here = ctx.state.currentLevel;
  let count = 0;
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.monster && e.c.pos?.level === here) count++;
  }
  return count;
}

/**
 * The demon `mon` summons help next to the hero: a prince or the Wizard picks a prince 1 time in
 * 20, else a lord 1 in 4, else a minor demon (two of those 1 time in 4); a lord a prince 1 in 50,
 * a lord 1 in 20, else a minor demon (also maybe two); a minor demon a lord 1 in 20, another
 * minor demon 1 in 6, else its own kind; all of the summoner's alignment sign. A kind that is gone
 * becomes a minor demon. "A horned devil appears in a cloud of smoke!" when one comes and she
 * sees it. Returns how many monsters more are on the level. ref: src/minion.c msummon()
 */
export function msummon(ctx: Ctx, mon: Entity): number {
  const ptr = ctx.defs.monster(mon.def);
  // (no priests or minions summon: the summoner is a demon)
  const atyp = Math.sign(ptr.alignment);
  let dtype: DefId | null = null;
  let cnt = 0;
  const twoMaybe = (): number =>
    dtype !== null && !ctx.rng.rn2(4) && isNdemon(ctx.defs.monster(dtype)) ? 2 : 1;
  if (isDprince(ptr)) {
    dtype = !ctx.rng.rn2(20)
      ? dprince(ctx, atyp)
      : !ctx.rng.rn2(4)
        ? dlord(ctx, atyp)
        : ndemonPm(ctx, atyp);
    cnt = twoMaybe();
  } else if (isDlord(ptr)) {
    dtype = !ctx.rng.rn2(50)
      ? dprince(ctx, atyp)
      : !ctx.rng.rn2(20)
        ? dlord(ctx, atyp)
        : ndemonPm(ctx, atyp);
    cnt = twoMaybe();
  } else if (isNdemon(ptr)) {
    dtype = !ctx.rng.rn2(20) ? dlord(ctx, atyp) : !ctx.rng.rn2(6) ? ndemonPm(ctx, atyp) : ptr.id;
    cnt = 1;
  }
  if (dtype === null) return 0;

  // sanity checks
  if (cnt > 1 && ctx.defs.monster(dtype).genFlags.includes('uniq')) cnt = 1;
  // if this daemon is unique and being re-summoned (the only way we could get this far with an
  // extinct dtype), try another
  if (demonGone(ctx, dtype)) {
    dtype = ndemonPm(ctx, atyp);
    if (dtype === null) return 0;
  }
  const def = ctx.defs.monster(dtype);
  const census = monsterCensus(ctx);
  let result = 0;
  const at = getPlayer(ctx.state).c.pos;
  while (cnt > 0) {
    const id = at ? makemon(ctx, def, at, { adjacentOk: true }) : null;
    const mtmp = id === null ? undefined : ctx.state.entities[String(id)];
    if (mtmp) {
      result++;
      if (cnt === 1 && canseemon(ctx, mtmp)) {
        const { cloud, what } = msummonEnviron(def);
        ctx.emit({
          type: 'msg',
          key: 'minion.appears',
          params: { mon: monNam(ctx, mtmp), cloud: `@minion.${cloud}`, what: `@minion.${what}` },
        });
      }
    }
    cnt--;
  }
  // how many monsters exist now compared to before?
  if (result) result = monsterCensus(ctx) - census;
  return result;
}
