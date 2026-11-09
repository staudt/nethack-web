// What happens to the world when a monster dies by the hero's hand.
// ref: src/mon.c xkilled(), mondead(), m_detach() (shkgone())
import { restoreWereForm } from './werestate';
import { getPlayer, type Ctx, type Entity, type EntityId, type Msg } from '@nh/core';
import { nonliving } from './mondata';
import { completelyburns, completelyrots, completelyrusts } from './golem';
import { canSpotMon, monNam } from './perception';
import { xkilledCorpse, type DeadMon } from './corpses';
import { engulfingU } from './engulfstate';
import { mksobj, placeOnFloor, removeFromInventory, weight } from './items';
import { mkobj } from './mkobj';
import { forgetMonster, minvent, relobj } from './mongear';
import { forgetMState, isMrevived } from './mstate';
import { xkilledPenalties } from './luck';
import { epriOf, pCoaligned } from './epri';
import { shkgone } from './shk';
import { setHistoric } from './statuestate';
import { canseemon, unmapInvisible } from './invis';
import { countKill } from './vanquished';

/** What make_corpse() needs of the monster once it is gone (mrevived, canseemon()). */
function deadMon(ctx: Ctx, mon: Entity): DeadMon {
  const revived = isMrevived(ctx, mon.id);
  // (named only when it can matter: the crumbling horn of a revived unicorn)
  return { revived, seen: revived && canseemon(ctx, mon) ? monNam(ctx, mon) : null };
}

/**
 * The monster dies and is removed. Its possessions fall where it stood (mondead() ->
 * m_detach() -> relobj(), before anything else is made), then, for a kill by the hero, the
 * 1 in 6 "treasure drop" and the corpse are made on top of them.
 * ref: src/mon.c xkilled(): `!rn2(6) && !(G_NOCORPSE) && not on the hero && not a Kop` makes
 * mkobj(RANDOM_CLASS, TRUE). Food is deleted unless the monster collects things (M2_COLLECT);
 * small monsters (smaller than MZ_HUMAN) do not leave heavy (owt > 30) or bulky (oc_big =
 * bimanual here) objects. Then corpse_chance() and make_corpse().
 */
export function monsterDied(
  ctx: Ctx,
  monId: EntityId,
  byHero: boolean,
  stoned = false,
  nocorpse = false,
): EntityId | null {
  const e = ctx.state.entities[String(monId)];
  if (!e?.c.monster) return null;
  restoreWereForm(ctx, e); // ref: mondead(): lycanthropes die in their true form
  const def = ctx.defs.monster(e.def);
  const at = e.c.pos ? { ...e.c.pos } : undefined;
  const wasinside = engulfingU(ctx, monId);
  const dead = deadMon(ctx, e);
  if (byHero) {
    // ref: xkilled(): punish bad behavior, alignment (with the mtmp->ispriest branch)
    const epri = epriOf(ctx, monId);
    xkilledPenalties(
      ctx,
      e,
      epri ? { shralign: epri.shralign, coaligned: pCoaligned(ctx, epri) } : null,
    );
  }
  // ref: xkilled(): `if (gs.stoned) monstone(mtmp)`: a statue holding its things, no corpse
  const statue = stoned && at ? makeStatue(ctx, e, at) : null;
  relobj(ctx, monId, at);
  forgetUnseenAt(ctx, at);
  shkgone(ctx, monId); // ref: m_detach()
  countKill(ctx, e.def); // ref: mondead(): mvitals[].died++
  forgetMonster(ctx, monId);
  forgetMState(ctx, monId);
  ctx.remove(monId);
  // XKILL_NOCORPSE (system shock): no treasure and no corpse
  if (!byHero || !at || stoned || nocorpse) return statue;

  const hero = getPlayer(ctx.state).c.pos;
  const onHero = hero?.level === at.level && hero.x === at.x && hero.y === at.y;
  if (
    ctx.rng.rn2(6) === 0 &&
    !def.genFlags.includes('nocorpse') &&
    !onHero &&
    def.glyph.ch !== 'K'
  ) {
    const id = mkobj(ctx, 'random', { level: at.level });
    const item = id === null ? undefined : ctx.state.entities[String(id)];
    if (id !== null && item) {
      const od = ctx.defs.object(item.def);
      const small = def.size === 'tiny' || def.size === 'small';
      if (od.class === 'food' && !def.flags.includes('collect')) ctx.remove(id);
      else if (small && (weight(ctx.defs, item, ctx.state) > 30 || od.weapon?.bimanual === true))
        ctx.remove(id);
      else placeOnFloor(ctx, id, at.level, at.x, at.y);
    }
  }
  // corpse--none if hero was inside the monster
  if (!wasinside) xkilledCorpse(ctx, def, at, true, dead);
  return null;
}

/**
 * The statue (or, for a small monster, sometimes a pile of rocks) a monster turning to stone
 * leaves where it stands, with its possessions inside; a boulder it carries falls out. Call it
 * before the monster is removed. Returns the statue's (or the rocks') id.
 * A unique monster's statue is historic. ref: src/mon.c monstone() (the object part; no
 * vampires, life saving, lit objects or names; no genders), src/mkobj.c mkcorpstat(STATUE)
 */
export function makeStatue(
  ctx: Ctx,
  mon: Entity,
  at: { level: string; x: number; y: number },
): EntityId {
  const def = ctx.defs.monster(mon.def);
  if (def.size !== 'tiny' || ctx.rng.rn2(2 + (def.frequency > 2 ? 1 : 0)) === 0) {
    const inside: Entity[] = [];
    // some objects may end up outside the statue
    for (const o of minvent(ctx, mon.id)) {
      if (o.def === 'nh:boulder') placeOnFloor(ctx, o.id, at.level, at.x, at.y);
      else inside.push(o);
    }
    const statue = mksobj(ctx, ctx.defs.object('nh:statue'), { init: false, corpseOf: def.id });
    // add_to_container()
    for (const o of inside) {
      const it = o.c.item;
      if (!it) continue;
      removeFromInventory(ctx, o.id);
      it.containedIn = statue;
      it.placed = ctx.state.seq++;
    }
    // Archeologists should not break unique statues
    if (def.genFlags.includes('uniq')) setHistoric(ctx, statue, true);
    placeOnFloor(ctx, statue, at.level, at.x, at.y);
    return statue;
  }
  return mksobj(ctx, ctx.defs.object('nh:rock'), { at });
}

/**
 * A dying monster's square loses its remembered-unseen `I` (on her level).
 * ref: src/mon.c mondead(), monstone(): `if (glyph_is_invisible(...)) unmap_object(x, y)`
 */
function forgetUnseenAt(ctx: Ctx, at: { level: string; x: number; y: number } | undefined): void {
  if (at && at.level === ctx.state.currentLevel) unmapInvisible(ctx, at.x, at.y);
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const ent = (ctx: Ctx, id: EntityId): Entity | undefined => ctx.state.entities[String(id)];

/**
 * The monster dies by another monster's hand (or a monster's missile): "The X is killed!" when
 * the hero sees its square ("... killed by the <by>!" with a cause key), a sad feeling for an unseen pet; its things drop and a corpse may
 * be left (no treasure drop, no experience; none when digested, `how` 'dgst', or a paper or straw
 * golem burnt up, 'fire'). A pet golem burnt, rusted or rotted away: "May the paper golem roast
 * in peace." ref: src/mon.c monkilled() -> mondied() (mondead() for AD_DGST)
 */
export function monkilled(
  ctx: Ctx,
  id: EntityId,
  fltxt: boolean,
  by?: string,
  how?: 'dgst' | 'fire' | 'rust' | 'dcay',
): void {
  const mon = ent(ctx, id);
  if (!mon?.c.monster) return;
  const def = ctx.defs.monster(mon.def);
  if (fltxt && canSpotMon(ctx, mon)) {
    const key = nonliving(def) ? 'mhitm.is_destroyed' : 'mhitm.is_killed';
    // "%s is %s%s%s!": " by the <fltxt>" when the caller names the cause
    say(ctx, by ? `${key}_by` : key, { mon: monNam(ctx, mon), ...(by ? { by } : {}) });
  } else if ((mon.c.monster.tame ?? 0) > 0) say(ctx, 'mhitm.sad_feeling');
  const tame = (mon.c.monster.tame ?? 0) > 0;
  const name = tame ? monNam(ctx, mon) : '';
  // no corpse if digested or flammable golem burnt up (gd.disintegested)
  if (how === 'dgst' || (how === 'fire' && completelyburns(mon.def))) mondead(ctx, id);
  else mondied(ctx, id);
  if (ent(ctx, id)?.c.monster) return; // life-saved
  // extra message if pet golem is completely destroyed
  const rxt =
    how === 'fire' && completelyburns(mon.def)
      ? 'roast'
      : how === 'rust' && completelyrusts(mon.def)
        ? 'rust'
        : how === 'dcay' && completelyrots(mon.def)
          ? 'rot'
          : null;
  if (tame && rxt) say(ctx, `golem.rest_in_peace.${rxt}`, { mon: name });
}

/** ref: src/mon.c mondied(): mondead() and maybe a corpse */
export function mondied(ctx: Ctx, id: EntityId): void {
  const mon = ent(ctx, id);
  if (!mon?.c.monster) return;
  restoreWereForm(ctx, mon); // the corpse is the human form's
  const def = ctx.defs.monster(mon.def);
  const at = mon.c.pos ? { ...mon.c.pos } : undefined;
  const dead = deadMon(ctx, mon);
  mondead(ctx, id);
  if (at) xkilledCorpse(ctx, def, at, false, dead);
}

/**
 * The monster dies with no corpse (an exploding light or sphere): its things drop and it is
 * removed. ref: src/mon.c mondead() -> m_detach() (no life saving)
 */
export function mondead(ctx: Ctx, id: EntityId): void {
  const mon = ent(ctx, id);
  if (!mon?.c.monster) return;
  // restore lycanthropes to true form at death (no chameleons)
  restoreWereForm(ctx, mon);
  const at = mon.c.pos ? { ...mon.c.pos } : undefined;
  relobj(ctx, id, at, true); // called only while monsters move
  forgetUnseenAt(ctx, at);
  shkgone(ctx, id); // ref: m_detach()
  countKill(ctx, mon.def); // ref: mondead(): mvitals[].died++
  forgetMonster(ctx, id);
  forgetMState(ctx, id);
  ctx.remove(id);
}
