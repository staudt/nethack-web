// Demons summoning demons and the gods' minions: a demon next to the hero may gate in another
// (mhitu's summonmu()), a demon prince or lord picking among the princes and lords by C's monster
// index ranges; an angry god sends a minion (summon_minion()): an Angel kind for a lawful god,
// an elemental for a neutral one, a demon for a chaotic one or Moloch.
// ref: src/minion.c msummon(), summon_minion(), dprince(), dlord(), llord(), lminion(),
// ndemon(), monster_census(); src/mondata.c msummon_environ()
//
// A demon cannot summon while the hero wields Demonbane ("looks puzzled for a moment").
// Not here: the endgame (dprince()/dlord() never try there), the guardian angel (m23 step 8).
// msummon(NULL) (summon nasties in Gehennom) summons as the Wizard of Yendor would.
// Princes and lords absent from the monster table (a mod that removes them) count as gone
// (G_GONE), as do genocided and extinct kinds (a unique is extinct once made). A game saved
// before birth counts existed (m18) has no extinct list: there a unique also counts as gone while
// one is alive or after one died.
import { getPlayer, sortedIds, type Ctx, type DefId, type Entity, type MonsterDef } from '@nh/core';
import { levelDifficulty } from './levdiff';
import { makemon, mkclass } from './generation';
import { A_LAWFUL, A_NEUTRAL, A_NONE, type Aligntyp } from './aligntyp';
import { emin, isLminion, setEmin } from './emin';
import { epriOf } from './epri';
import { alignGname } from './gods';
import { malign, uState } from './luck';
import { clearStrat } from './mstate';
import { canSpotMon, monNam } from './perception';
import { canseemon } from './invis';
import { uWieldArt } from './artistate';
import { ARCHON } from './chamstate';
import { isDemon, isDlord, isDprince, isLord, isNdemon } from './mondata';
import { ndemon } from './roommon';
import { deaths, isGone } from './vanquished';

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
 * `mvitals[pm].mvflags & G_GONE`: genocided or extinct, or absent from the monster table; for a
 * game saved before m18 (no extinct list) also a unique kind that exists or died.
 */
export function demonGone(ctx: Pick<Ctx, 'state' | 'defs'>, pm: DefId): boolean {
  if (!ctx.defs.isMonster(pm) || isGone(ctx.state, pm)) return true;
  // the pre-m18 fallback: a unique made before births were counted is not extinct
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

const depthOf = (ctx: SummonCtx): number => levelDifficulty(ctx);

/** A minor demon of alignment sign `atyp`, or null (NON_PM). ref: src/minion.c ndemon() */
function ndemonPm(ctx: SummonCtx, atyp: number | undefined): DefId | null {
  return ndemon(ctx, depthOf(ctx), atyp)?.id ?? null;
}

/** A demon lord (Juiblex, Yeenoghu), else (approximate) a minor demon. ref: src/minion.c dlord() */
export function dlord(ctx: SummonCtx, atyp: number | undefined): DefId | null {
  return pickFrom(ctx, DEMON_LORDS, atyp) ?? ndemonPm(ctx, atyp);
}

/** A demon prince, else (approximate) a lord. ref: src/minion.c dprince() */
export function dprince(ctx: SummonCtx, atyp: number | undefined): DefId | null {
  return pickFrom(ctx, DEMON_PRINCES, atyp) ?? dlord(ctx, atyp);
}

/** PM_ANGEL. ref: include/monsters.h */
export const ANGEL: DefId = 'nh:angel';

/**
 * The four basic elementals, a neutral god's minions. ref: src/minion.c elementals[]
 * (PM_AIR_ELEMENTAL, PM_FIRE_ELEMENTAL, PM_EARTH_ELEMENTAL, PM_WATER_ELEMENTAL)
 */
export const ELEMENTALS: readonly DefId[] = [
  'nh:air_elemental',
  'nh:fire_elemental',
  'nh:earth_elemental',
  'nh:water_elemental',
];

/**
 * A lawful minion that is no lord: 20 tries of an Angel-class monster for the level's
 * difficulty; null (NON_PM) when none came. ref: src/minion.c lminion()
 */
export function lminion(ctx: SummonCtx): DefId | null {
  for (let tryct = 0; tryct < 20; tryct++) {
    const ptr = mkclass(ctx, 'A', depthOf(ctx));
    if (ptr && !isLord(ptr)) return ptr.id;
  }
  return null;
}

/** The lawful (good) lord: the Archon, else (approximate) a lawful minion. ref: llord() */
export function llord(ctx: SummonCtx): DefId | null {
  if (!demonGone(ctx, ARCHON)) return ARCHON;
  return lminion(ctx); // approximate
}

/** A_NONE (any alignment) is `undefined` for ndemon() and the picks above. */
const anyAlign = (a: number): number | undefined => (a === A_NONE ? undefined : a);

/**
 * A god's minion appears next to the hero, hostile: for a lawful god an Angel kind (lminion()),
 * for a neutral one an elemental, for a chaotic one or Moloch a minor demon of its alignment;
 * none when no kind could be had. It serves that god (an emin, not renegade; a shopkeeper,
 * guard or priest kind would be made plain). With `talk` the god's voice booms "Thou shalt pay
 * for thine indiscretion!" and it "appears before you". It keeps the malign of its birth
 * (set_malign() is not called again: she was naughty).
 * ref: src/minion.c summon_minion()
 */
export function summonMinion(ctx: Ctx, alignment: Aligntyp, talk: boolean): void {
  let mnum: DefId | null;
  switch (alignment) {
    case A_LAWFUL:
      mnum = lminion(ctx);
      break;
    case A_NEUTRAL:
      mnum = ELEMENTALS[ctx.rng.rn2(ELEMENTALS.length)] ?? null;
      break;
    default: // A_CHAOTIC, A_NONE
      mnum = ndemonPm(ctx, anyAlign(alignment));
      break;
  }
  if (mnum !== null && !ctx.defs.isMonster(mnum)) mnum = null; // (a mod removed the kind)
  if (mnum === null) return;
  const def = ctx.defs.monster(mnum);
  const at = getPlayer(ctx.state).c.pos;
  if (!at) return;
  const plain = ['nh:shopkeeper', 'nh:guard', 'nh:aligned_cleric', 'nh:high_priest'].includes(mnum);
  const id = makemon(
    ctx,
    def,
    at,
    plain ? { adjacentOk: true } : { adjacentOk: true, extra: 'emin' },
  );
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (id === null || !mon || !m) return;
  if (!plain) {
    // makemon()'s set_malign() saw no minion yet: the kind's own alignment and peacefulness
    const fixed = malign(def, m.peaceful, uState(ctx.state).alignType);
    setEmin(ctx, id, { minAlign: alignment, renegade: false, malign: fixed });
  }
  if (talk) {
    ctx.emit({
      type: 'msg',
      key: 'minion.voice_booms',
      params: { god: alignGname(ctx.state, alignment) },
    });
    ctx.emit({ type: 'msg', key: 'minion.indiscretion' });
    if (canSpotMon(ctx, mon))
      ctx.emit({ type: 'msg', key: 'demon.appears_before_you', params: { mon: monNam(ctx, mon) } });
    clearStrat(ctx, id, 'appearMsg');
  }
  m.peaceful = false;
  // don't call set_malign(); player was naughty
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
export function monsterCensus(ctx: Pick<Ctx, 'state'>): number {
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
 * a lord 1 in 20, else a minor demon (also maybe two); a bone devil a skeleton; another minor
 * demon a lord 1 in 20, another minor demon 1 in 6, else its own kind; all of the summoner's
 * alignment sign (a priest's shrine's, a minion's god's). A lawful minion kind calls a lawful
 * minion (an Archon 1 time in 20 for a lord), else its own kind (two of them 1 time in 4 when no
 * lord); another Angel an elemental or demon of its god 1 time in 6, else Angels of its god.
 * (Only demons summon in play: these branches are C's, reached by no caller.)
 * A kind that is gone becomes a minor demon. "A horned devil appears in a cloud
 * of smoke!" when one comes and she sees it. Returns how many monsters more are on the level.
 * With no summoner (summon nasties in Gehennom) it summons as the Wizard of Yendor: as a prince,
 * of any alignment.
 * ref: src/minion.c msummon()
 */
export function msummon(ctx: Ctx, mon: Entity | null): number {
  const ptr = mon ? ctx.defs.monster(mon.def) : null;
  if (mon && ptr && uWieldArt(ctx.state, 'nh:demonbane') && isDemon(ptr)) {
    if (canseemon(ctx, mon))
      ctx.emit({ type: 'msg', key: 'minion.looks_puzzled', params: { mon: monNam(ctx, mon) } });
    return 0;
  }
  // a priest's shrine's, a minion's god's, else its kind's (A_NONE kept); the Wizard is A_NONE
  const own = mon
    ? (epriOf(ctx, mon.id)?.shralign ?? emin(ctx.state, mon.id)?.minAlign)
    : undefined;
  const mal = own ?? (ptr ? ptr.alignment : A_NONE);
  const atyp = mal === A_NONE ? undefined : Math.sign(mal);
  let dtype: DefId | null = null;
  let cnt = 0;
  const twoMaybe = (): number =>
    dtype !== null && !ctx.rng.rn2(4) && isNdemon(ctx.defs.monster(dtype)) ? 2 : 1;
  if (!ptr || isDprince(ptr)) {
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
  } else if (ptr.id === 'nh:bone_devil') {
    dtype = 'nh:skeleton';
    cnt = 1;
  } else if (isNdemon(ptr)) {
    dtype = !ctx.rng.rn2(20) ? dlord(ctx, atyp) : !ctx.rng.rn2(6) ? ndemonPm(ctx, atyp) : ptr.id;
    cnt = 1;
  } else if (mon && isLminion(ctx.state, mon.id, ptr)) {
    dtype =
      isLord(ptr) && !ctx.rng.rn2(20)
        ? llord(ctx)
        : isLord(ptr) || !ctx.rng.rn2(6)
          ? lminion(ctx)
          : ptr.id;
    cnt = dtype !== null && !ctx.rng.rn2(4) && !isLord(ctx.defs.monster(dtype)) ? 2 : 1;
  } else if (ptr.id === ANGEL) {
    // non-lawful angels can also summon
    if (!ctx.rng.rn2(6)) {
      // see summon_minion (a lawful one is an lminion above)
      if (atyp === A_NEUTRAL) dtype = ELEMENTALS[ctx.rng.rn2(ELEMENTALS.length)] ?? null;
      else if (atyp === undefined || atyp < 0) dtype = ndemonPm(ctx, atyp);
    } else dtype = ANGEL;
    cnt = dtype !== null && !ctx.rng.rn2(4) && !isLord(ctx.defs.monster(dtype)) ? 2 : 1;
  }
  if (dtype !== null && !ctx.defs.isMonster(dtype)) dtype = null; // (a mod removed the kind)
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
    const id = at ? makemon(ctx, def, at, { adjacentOk: true, extra: 'emin' }) : null;
    const mtmp = id === null ? undefined : ctx.state.entities[String(id)];
    if (mtmp && id !== null) {
      result++;
      // an angel's alignment should match the summoner: renegade if same alignment but not
      // peaceful or peaceful but different alignment
      if (dtype === ANGEL) {
        const minAlign = (atyp ?? A_NONE) as Aligntyp;
        const peaceful = mtmp.c.monster?.peaceful === true;
        setEmin(ctx, id, {
          minAlign,
          renegade: (minAlign !== uState(ctx.state).alignType) !== !peaceful,
          // (no set_malign() after: the malign of its birth, as summon_minion()'s)
          malign: malign(def, peaceful, uState(ctx.state).alignType),
        });
      }
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
