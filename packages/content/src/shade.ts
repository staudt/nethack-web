// Shades: blows and missiles pass harmlessly through them unless silver, blessed or otherwise
// able to hurt them (dmgval()'s zero). ref: src/uhitm.c shade_aware(), shade_miss();
// src/artifact.c shade_glare() (dmgval.ts)
import { cellIndex, isVisible, type Ctx, type Entity, type MonsterDef } from '@nh/core';
import { dmgval } from './dmgval';
import { mapInvisible } from './invis';
import { xnameOf } from './objnam';
import { canSpotMon, monNam, sensemon } from './perception';

export const SHADE = 'nh:shade';

/** `mdat == &mons[PM_SHADE]` */
export const isShade = (def: Pick<MonsterDef, 'id'>): boolean => def.id === SHADE;

/**
 * The object affects shades, or other code deals with it properly: a boulder, a heavy iron ball
 * or an iron chain (dmgval() handles those), a mirror (silver in its reflective surface), a
 * clove of garlic (makes shades flee), anything silver. ref: src/uhitm.c shade_aware()
 */
export function shadeAware(ctx: Pick<Ctx, 'defs'>, obj: Entity | null): boolean {
  if (!obj) return false;
  const def = ctx.defs.object(obj.def);
  return (
    def.boulder === true ||
    obj.def === 'nh:heavy_iron_ball' ||
    obj.def === 'nh:iron_chain' ||
    obj.def === 'nh:mirror' ||
    obj.def === 'nh:clove_of_garlic' ||
    def.material === 'silver'
  );
}

/**
 * The attack (with `obj`, if any) of `magr` (the hero or a monster) passes harmlessly through
 * `mdef`, a shade that the object does no damage to (dmgval() is rolled for zero or not):
 * "Your attack passes harmlessly through the shade.", "The soldier's dagger passes harmlessly
 * through the shade.", and for a missile "The arrow passes harmlessly through the shade." when
 * she sees or senses the shade (or is the attacker next to it), an `I` where she cannot spot
 * it; the shade wakes. The hero is never a shade (it does not polymorph), so a hero target
 * returns false. ref: src/uhitm.c shade_miss()
 */
export function shadeMiss(
  ctx: Ctx,
  magr: Entity,
  mdef: Entity,
  obj: Entity | null,
  thrown: boolean,
  verbose: boolean,
): boolean {
  const pid = ctx.state.playerId;
  if (mdef.id === pid || !mdef.c.monster) return false;
  const pd = ctx.defs.monster(mdef.def);
  // we're using dmgval() for zero/not-zero, not for actual damage amount
  if (!isShade(pd) || (obj && dmgval(ctx.rng, obj, ctx.defs.object(obj.def), pd) > 0)) return false;
  const youagr = magr.id === pid;
  const p = mdef.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  const seen =
    !!p &&
    !!level &&
    p.level === ctx.state.currentLevel &&
    isVisible(ctx.state, cellIndex(level, p.x, p.y));
  const hp = ctx.state.entities[String(pid)]?.c.pos;
  const next2u =
    !!p &&
    !!hp &&
    p.level === hp.level &&
    Math.max(Math.abs(p.x - hp.x), Math.abs(p.y - hp.y)) <= 1;
  if (verbose && (seen || sensemon(ctx, mdef) || (youagr && next2u))) {
    const named = obj !== null && !shadeAware(ctx, obj);
    const plural = named && (obj.c.item?.quantity ?? 1) > 1 ? '_plural' : '';
    const what = named ? 'obj' : 'attack';
    const params = {
      mon: monNam(ctx, mdef),
      ...(named ? { obj: xnameOf(ctx.state, ctx.defs, obj) } : {}),
      ...(!thrown && !youagr ? { magr: monNam(ctx, magr) } : {}),
    };
    const whose = thrown ? 'the' : youagr ? 'your' : 'mon';
    ctx.emit({ type: 'msg', key: `shade.${whose}_${what}${plural}`, params });
    if (!canSpotMon(ctx, mdef) && p) mapInvisible(ctx, p.x, p.y);
  }
  mdef.c.monster.asleep = false;
  return true;
}
