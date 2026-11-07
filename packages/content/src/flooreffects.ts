// A boulder landing on a pit, spiked pit, hole or trap door. ref: src/do.c flooreffects() (the
// boulder part; no pools or lava exist, so boulder_hits_pool() is not ported)
//
// Shared by moverock.ts (a pushed boulder) and the scroll of earth (falling boulders), so it sits
// below both and imports neither; trap.ts uses it for objects teleported onto a pit or hole (rloco()).
import {
  cellIndex,
  getPlayer,
  heroBlind,
  isVisible,
  trapAt,
  type Ctx,
  type Entity,
} from '@nh/core';
import { BOULDER } from './boulder';
import { dbon, monsterIdAt } from './combat';
import { hmonThrownHit } from './hmon';
import { losehp } from './hp';
import { ringBonus } from './props';
import { maybeFinishSokoban } from './sokoban';
import { isHole, isMtrapped, isPit, setMtrapped, setUtrap, utrap } from './trapstate';
import { xnameOf } from './objnam';

/**
 * A boulder's damage to a monster: `rnd(20)` (objects.h BOULDER sdam = ldam = 20; it is never
 * blessed, enchanted or eroded). ref: src/weapon.c dmgval()
 */
export const boulderDmgval = (ctx: Pick<Ctx, 'rng'>): number => ctx.rng.rnd(20);

/** The verb of flooreffects() (`"fall"` from moverock() and the scroll of earth). */
export type FloorVerb = 'fall';

const say = (ctx: Ctx, key: string, params?: Record<string, string | { key: string }>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * The boulder `obj` lands at (x, y) of the hero's level. On a pit or hole: a monster trapped
 * there is hit by it (thrown by the hero: hmon() with the boulder's `rnd(20)` plus the
 * increase-damage and Str bonuses) and let out of the pit; the hero trapped there is squished
 * (`rnd(15)`); then "The boulder fills a pit." (or plugs the hole), the trap is gone and the
 * boulder used up. Returns false (nothing happened, the caller places the boulder) anywhere else.
 * `seen` is moverock()'s "vision kludge": the pushed-into pit counts as in sight unless the
 * hero is blind. Only the hero's boulders are ported (no `context.mon_moving` case: no monster
 * throws or drops one). The objects in the pit are not buried (bury_objs(): nothing is buried).
 * ref: src/do.c flooreffects()
 */
export function boulderFlooreffects(
  ctx: Ctx,
  obj: Entity,
  x: number,
  y: number,
  verb: FloorVerb,
  seen = false,
): boolean {
  if (obj.def !== BOULDER) return false;
  const levelId = ctx.state.currentLevel;
  const level = ctx.state.levels[levelId];
  const t = level ? trapAt(level, x, y) : undefined;
  if (!level || !t || !(isPit(t.def) || isHole(t.def))) return false;
  const ttyp = t.def;
  const tseen = t.seen;
  const blind = heroBlind(ctx.defs, ctx.state);
  const hp = getPlayer(ctx.state).c.pos;
  const uAt = hp?.level === levelId && hp.x === x && hp.y === y;
  const cansee = seen ? !blind : isVisible(ctx.state, cellIndex(level, x, y));
  const verbs = { key: `boulder.verb.${verb}s` };
  const mtmp = monsterAt(ctx, levelId, x, y);
  let squished = false;
  if ((mtmp && isMtrapped(ctx, mtmp.id)) || (utrap(ctx) && uAt)) {
    const trappedMon = mtmp && isMtrapped(ctx, mtmp.id) ? mtmp : null;
    if (cansee || uAt)
      say(
        ctx,
        trappedMon
          ? blind
            ? 'boulder.into_pit_blind'
            : 'boulder.into_pit'
          : blind
            ? 'boulder.into_pit_you_blind'
            : 'boulder.into_pit_you',
        { verb: verbs },
      );
    if (trappedMon) {
      // no passes_walls or rock throwers exist: hmon(mtmp, obj, HMON_THROWN, dieroll 1)
      const hero = getPlayer(ctx.state);
      let dmg = boulderDmgval(ctx);
      // hmon_hitmon_dmg_recalc(): u.udaminc and the Str bonus (no launcher)
      if (dmg > 0) dmg += ringBonus(ctx.state, 'nh:ring_of_increase_damage');
      dmg += dbon(hero.c.attributes?.str ?? 10);
      if (dmg < 1) dmg = 1;
      hmonThrownHit(ctx, trappedMon, dmg, xnameOf(ctx.state, ctx.defs, obj));
      if (ctx.state.entities[String(trappedMon.id)]) setMtrapped(ctx, trappedMon.id, false);
    } else {
      // no Passes_walls or giant form for the hero
      losehp(ctx, ctx.rng.rnd(15), '@killer.boulder.squished');
      squished = true;
    }
  }
  if (!squished) {
    if (blind && uAt) say(ctx, 'boulder.crash_beneath');
    else if (!blind && cansee)
      say(
        ctx,
        ttyp === 'nh:trap_door'
          ? tseen
            ? 'boulder.plugs_trapdoor_floor'
            : 'boulder.triggers_plugs_trapdoor'
          : ttyp === 'nh:hole'
            ? 'boulder.plugs_hole_floor'
            : 'boulder.fills_pit',
      );
    else say(ctx, 'boulder.hear_verb', { verb: { key: `boulder.verb.${verb}` } });
  }
  // deletedwithboulder: delfloortrap() (lets a monster still in it out), reset_utrap()
  if (trapAt(level, x, y)) {
    const m = monsterAt(ctx, levelId, x, y);
    if (m) setMtrapped(ctx, m.id, false);
    ctx.removeTrap(levelId, { x, y });
    maybeFinishSokoban(ctx, levelId); // deltrap()
    if (utrap(ctx) && uAt) setUtrap(ctx, 0, 'pit');
  }
  ctx.remove(obj.id); // useupf(obj, 1L)
  return true;
}

const monsterAt = (ctx: Ctx, levelId: string, x: number, y: number): Entity | null => {
  const id = monsterIdAt(ctx, { x, y }, levelId);
  return id === null || id === ctx.state.playerId ? null : (ctx.state.entities[String(id)] ?? null);
};
