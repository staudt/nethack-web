// Artifact rules that need more than the table and the state: the special attacks' to-hit and
// damage bonuses against what an artifact is made to slay, and who an artifact refuses to be
// touched by. Above artistate.ts (the leaf); items.ts and mkobj.ts must not import it, and it
// must stay below mongear.ts (monsters choosing weapons ask it), so naming lives in artiname.ts.
// ref: src/artifact.c spec_applies(), spec_abon(), spec_dbon(), attacks(), spec_ability(),
// bane_applies(), touch_artifact()
import {
  getPlayer,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type MonsterDef,
} from '@nh/core';
import { A_NONE } from './aligntyp';
import { defended } from './artidef';
import type { ArtiAd, ArtifactDef, Spfx } from './artilist';
import { artiAlign, artiOf, artiRole, artiRoleIs, isArt } from './artistate';
import { monAligntypOf } from './epri';
import { resistsDrliHero } from './exper';
import { uState } from './luck';
import { isCovetous, isMplayer } from './mondata';
import { resists, resistsDrli } from './mresist';
import { P, hasProp } from './props';
import { RACES_TAB } from './racetab';
import { roleMonId } from './roletab';
import { heroForm } from './upoly';
import { raceIs, urace, urole } from './urole';
import { ulycn } from './werestate';

// ---------------------------------------------------------------------------------------------
// the special attacks: what they apply to, to-hit and damage

/** C's NO_ATTK: PHYS(0, 0). */
const NO_ATTK = { ad: 'phys', damn: 0, damd: 0 } as const;

/** The artifact's attack, NO_ATTK for none. */
export const artiAttk = (a: ArtifactDef): { ad: ArtiAd; damn: number; damd: number } =>
  a.attk ?? NO_ATTK;

/** The object is an artifact whose special attack is of type `ad`. ref: src/artifact.c attacks() */
export function attacks(ad: ArtiAd, obj: Entity | null | undefined): boolean {
  const a = artiOf(obj);
  return a !== null && artiAttk(a).ad === ad;
}

/** The artifact has the property when wielded or worn. ref: src/artifact.c spec_ability() */
export const specAbility = (obj: Entity | null | undefined, spfx: Spfx): boolean =>
  artiOf(obj)?.spfx.includes(spfx) ?? false;

/**
 * The hero as a monster kind (youmonst.data): her form while polymorphed, else her role's
 * monster (urole.mnum), or null when the registry has neither.
 */
export function heroData(ctx: Pick<Ctx, 'state' | 'defs'>): MonsterDef | null {
  const form = heroForm(ctx);
  if (form) return form;
  const id: DefId = roleMonId(urole(ctx.state));
  return ctx.defs.isMonster(id) ? ctx.defs.monster(id) : null;
}

/**
 * The artifact's bane (SPFX_DMONS, DCLAS, DFLAG1/2 or DALIGN) is `target`'s: its monster, class,
 * flag (for the hero also her own race's flags while in her own form, and the were flag while she
 * is a lycanthrope) or another alignment (a monster's kind: unaligned or of another sign). False
 * for an artifact without a bane. ref: src/artifact.c spec_applies() (the SPFX_DBONUS part)
 */
function baneMatches(ctx: Pick<Ctx, 'state' | 'defs'>, a: ArtifactDef, target: EntityId): boolean {
  const yours = target === ctx.state.playerId;
  const mon = ctx.state.entities[String(target)];
  const b = a.bane;
  if (!mon || !b) return false;
  const ptr = yours ? heroData(ctx) : ctx.defs.monster(mon.def);
  if (b.kind === 'mons') return ptr?.id === b.mon;
  if (b.kind === 'class') return ptr?.glyph.ch === b.ch;
  if (b.kind === 'flag') {
    if (ptr?.flags.includes(b.flag)) return true;
    // (SPFX_DFLAG1 and SPFX_DFLAG2 are one kind here: the hero's race only has M2 flags)
    return (
      yours &&
      ((!heroForm(ctx) && RACES_TAB[urace(ctx.state)].selfmask.includes(b.flag)) ||
        (b.flag === 'were' && ulycn(ctx.state) !== null))
    );
  }
  // SPFX_DALIGN
  const al = artiAlign(ctx.state, a);
  if (yours) return uState(ctx.state).alignType !== al;
  const malign = ptr?.alignment ?? 0;
  return malign === A_NONE || Math.sign(malign) !== al;
}

/**
 * Whether the artifact's special attacks apply against `target` (the hero or a monster): an
 * artifact with neither a bane nor SPFX_ATTK applies against everything when its attack is
 * physical; a bane applies to its monster, class, flag (for the hero also her own race's flags
 * while in her own form, and the were flag while she is a lycanthrope) or to another alignment
 * (a monster's kind: unaligned or of another sign); an elemental attack applies unless the
 * target is defended against it (defended()) or resists it (Magicbane's stun and magic missiles
 * against magic resistance: a monster saves with `rn2(100) < mr`, which is drawn).
 * ref: src/artifact.c spec_applies()
 */
export function specApplies(ctx: Ctx, a: ArtifactDef, target: EntityId): boolean {
  const atk = artiAttk(a);
  if (a.bane === null && !a.spfx.includes('attk')) return atk.ad === 'phys';
  const yours = target === ctx.state.playerId;
  const mon = ctx.state.entities[String(target)];
  if (!mon) return false;
  const ptr = yours ? heroData(ctx) : ctx.defs.monster(mon.def);
  if (a.bane !== null) return baneMatches(ctx, a, target);
  // SPFX_ATTK
  if (defended(ctx, target, atk.ad)) return false;
  const hero = getPlayer(ctx.state);
  switch (atk.ad) {
    case 'fire':
      return !(yours ? hasProp(hero, P.FIRE_RES) : resists(ctx, mon, 'fire'));
    case 'cold':
      return !(yours ? hasProp(hero, P.COLD_RES) : resists(ctx, mon, 'cold'));
    case 'elec':
      return !(yours ? hasProp(hero, P.SHOCK_RES) : resists(ctx, mon, 'elec'));
    case 'magm':
    case 'stun':
      return !(yours ? hasProp(hero, P.ANTIMAGIC) : ctx.rng.rn2(100) < (ptr?.mr ?? 0));
    case 'drst':
      return !(yours ? hasProp(hero, P.POISON_RES) : resists(ctx, mon, 'poison'));
    case 'drli':
      return !(yours ? hasProp(hero, P.DRAIN_RES) || resistsDrliHero(ctx) : resistsDrli(ctx, mon));
    default:
      // "Weird weapon special attack."
      return false;
  }
}

/**
 * The artifact's to-hit bonus against `target`: `rnd(damn)` when its attack applies (no draw
 * for an artifact without a to-hit die). ref: src/artifact.c spec_abon()
 */
export function specAbon(ctx: Ctx, obj: Entity, target: EntityId): number {
  const a = artiOf(obj);
  if (a === null) return 0;
  const atk = artiAttk(a);
  return atk.damn && specApplies(ctx, a, target) ? ctx.rng.rnd(atk.damn) : 0;
}

/**
 * The artifact's damage bonus against `target` on a hit doing `tmp`: `rnd(damd)`, or double
 * damage (`max(tmp, 1)`) for an artifact without a damage die, when its attack applies;
 * Grimtooth's applies against everyone. `applies` is C's gs.spec_dbon_applies, returned with
 * the bonus instead of kept in a global (artifact_hit() and Mb_hit() read it).
 * ref: src/artifact.c spec_dbon()
 */
export function specDbon(
  ctx: Ctx,
  obj: Entity,
  target: EntityId,
  tmp: number,
): { bonus: number; applies: boolean } {
  const a = artiOf(obj);
  const atk = a === null ? NO_ATTK : artiAttk(a);
  let applies: boolean;
  if (a === null || (atk.ad === 'phys' && atk.damn === 0 && atk.damd === 0)) applies = false;
  // Grimtooth has SPFX settings to warn against elves but we want its damage bonus to apply to
  // all targets, so bypass spec_applies()
  else if (isArt(obj, 'nh:grimtooth')) applies = true;
  else applies = specApplies(ctx, a, target);
  if (!applies) return { bonus: 0, applies };
  return { bonus: atk.damd ? ctx.rng.rnd(atk.damd) : Math.max(tmp, 1), applies };
}

// ---------------------------------------------------------------------------------------------
// touching

/**
 * The artifact's bane (its SPFX_DBONUS part alone) applies to `target`: no SPFX_ATTK element,
 * so nothing is drawn. ref: src/artifact.c bane_applies()
 */
export function baneApplies(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  a: ArtifactDef,
  target: EntityId,
): boolean {
  return baneMatches(ctx, a, target);
}

/** What makes an artifact refuse someone: a wrong role or race, a wrong alignment or a bane. */
export interface TouchVerdict {
  badclass: boolean;
  badalign: boolean;
  /** SPFX_INTEL: every quest artifact is self-willed */
  selfWilled: boolean;
}

/**
 * Why the artifact would refuse to be touched by `who` (the hero or a monster): for the hero a
 * self-willed artifact of another role or race, a restricted artifact of another alignment (or
 * while her alignment record is negative); for a monster a self-willed artifact with a role
 * (Excalibur's own excepted), a restricted artifact of another alignment than the monster's;
 * covetous monsters and player monsters mind neither. A bane that applies to `who` is a bad
 * alignment for anyone. Uses the table as hack_artifacts() left it (artiAlign(), artiRole()).
 * ref: src/artifact.c touch_artifact()
 */
export function touchVerdict(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  a: ArtifactDef,
  who: EntityId,
): TouchVerdict {
  const { state } = ctx;
  const yours = who === state.playerId;
  // all quest artifacts are self-willed; if this ever changes, `badclass' will have to be
  // extended to explicitly include quest artifacts
  const selfWilled = a.spfx.includes('intel');
  const restr = a.spfx.includes('restr');
  const align = artiAlign(state, a);
  const role = artiRole(state, a);
  let badclass: boolean;
  let badalign: boolean;
  if (yours) {
    badclass =
      selfWilled &&
      ((role !== null && !artiRoleIs(state, a)) || (a.race !== null && !raceIs(state, a.race)));
    const u = uState(state);
    badalign = restr && align !== A_NONE && (align !== u.alignType || u.alignRecord < 0);
  } else {
    const mon = state.entities[String(who)];
    const def = mon ? ctx.defs.monster(mon.def) : null;
    if (def && !isCovetous(def) && !isMplayer(def)) {
      badclass = selfWilled && role !== null && a.id !== 'nh:excalibur';
      badalign = restr && align !== A_NONE && align !== monAligntypOf(ctx, who);
    } else {
      // an M3_WANTSxxx monster or a fake player: special monsters trying to take the Amulet,
      // invocation tools or quest item can touch anything except `spec_applies' artifacts
      badclass = badalign = false;
    }
  }
  // weapons which attack specific categories of monsters are bad for them even if their
  // alignments happen to match
  if (!badalign) badalign = baneApplies(ctx, a, who);
  return { badclass, badalign, selfWilled };
}

/**
 * A monster tries to touch (pick up or wield) the object: false when it is an artifact that
 * would blast it (self-willed and of the wrong class or alignment, or of the wrong alignment at
 * all: a monster is never blasted, it just refuses). No draw. The hero's side (the blast, "evades
 * your grasp") comes with her touching the artifacts. ref: src/artifact.c touch_artifact() for a
 * monster
 */
export function monTouchArtifact(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  obj: Entity,
  mon: EntityId,
): boolean {
  const a = artiOf(obj);
  if (a === null) return true;
  const { badclass, badalign, selfWilled } = touchVerdict(ctx, a, mon);
  return !(((badclass || badalign) && selfWilled) || badalign);
}
