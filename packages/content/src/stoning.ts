// Petrification: the hero's countdown once a cockatrice's hiss got her (stoned_dialogue() and the
// death at its end), instant stoning from touching a cockatrice or its corpse, and monsters turned
// to stone (a statue holding their things). The state (the Stoned timer and its delayed killer)
// is stonestate.ts's, bare-handed touching stonetouch.ts's.
// ref: src/timeout.c stoned_dialogue(), nh_timeout() STONED; src/trap.c instapetrify(),
// minstapetrify(); src/mon.c monstone(); src/uhitm.c do_stone_u(); src/pickup.c
// fatal_corpse_mistake(); src/wield.c cant_wield_corpse(); src/botl.c bl_stone
//
// Not ported: polymorph (poly_when_stoned() golems and the hero turning into a stone golem,
// mon_to_stone(): 7f), vampires reverting (vamp_stone(): 7f), monsters using lizard corpses or
// acidic potions to cure themselves (munstone(): muse.c is not ported), monster life saving,
// selftouch() (falling while wielding a cockatrice corpse), the hero's statue (no bones).
import { getPlayer, type Ctx, type Entity, type EntityId, type ModApi, type Msg } from '@nh/core';
import { done } from './end';
import { stopOccupation } from './eat';
import { digests, engulfingU } from './engulfstate';
import { experienceFor, gainExperience } from './hero';
import { makeVomiting, nomulNow } from './hunger';
import { nhData } from './items';
import { uState } from './luck';
import { makeStatue, mondead, monsterDied } from './mondeath';
import { heroSees } from './mongear';
import { monAdjustSpeed } from './mstate';
import { monNam } from './perception';
import { xnameOf } from './objnam';
import { P, hasProp, setIntrinsic, setItimeout, timeoutLeft } from './props';
import { isSlimed, makeSlimed } from './slimestate';
import { isStoned, makeStoned, resistsSton, stonedKiller } from './stonestate';

export { instapetrify, fatalCorpseMistake, cantWieldCorpse, bareCorpseTouch } from './stonetouch';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Ctx): Entity => getPlayer(ctx.state);

/**
 * The monster, when it does not resist, is "slowing down" and turns to stone: killed by the hero
 * (experience, alignment and luck as xkilled(), no corpse) when `byHero`, else monstone().
 * ref: src/trap.c minstapetrify() (no golems or vampires: 7f)
 */
export function minstapetrify(ctx: Ctx, mon: Entity, byHero: boolean): void {
  if (resistsSton(ctx, mon)) return;
  // give a "<mon> is slowing down" message and also remove intrinsic speed
  monAdjustSpeed(ctx, mon, -3);
  if (mon.c.pos && heroSees(ctx, mon.c.pos)) say(ctx, 'stone.mon_turns', { mon: monNam(ctx, mon) });
  if (byHero) xkilledStoned(ctx, mon);
  else monstone(ctx, mon);
}

/**
 * The hero killed the monster by turning it to stone: a statue, experience, no corpse.
 * ref: src/mon.c xkilled(mon, XKILL_NOMSG) with gs.stoned set
 */
export function xkilledStoned(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  const level = mon.c.monster?.level ?? 0;
  const wasinside = engulfingU(ctx, mon.id);
  const statue = monsterDied(ctx, mon.id, true, true);
  jumpOut(ctx, wasinside, def.id, statue);
  gainExperience(ctx, ctx.state.playerId, experienceFor(def, level));
}

/**
 * "You jump through an opening in the new statue." when the stone engulfer held her.
 * ref: src/mon.c monstone()
 */
function jumpOut(ctx: Ctx, wasinside: boolean, def: string, obj: EntityId | null): void {
  const e = obj === null ? undefined : ctx.state.entities[String(obj)];
  if (!wasinside || !e || !digests(ctx.defs.monster(def as never))) return;
  say(ctx, 'stone.jump_out', { obj: xnameOf(ctx.state, ctx.defs, e) });
}

/**
 * The monster turns into a statue holding its possessions (a small one sometimes into rocks)
 * and is gone. ref: src/mon.c monstone()
 */
export function monstone(ctx: Ctx, mon: Entity): void {
  const at = mon.c.pos ? { ...mon.c.pos } : undefined;
  if (!at) return;
  const wasinside = engulfingU(ctx, mon.id);
  const statue = makeStatue(ctx, mon, at);
  mondead(ctx, mon.id);
  jumpOut(ctx, wasinside, mon.def, statue);
}

/**
 * The hiss got through: the hero starts turning to stone (5 turns) unless she already is or
 * resists. ref: src/uhitm.c do_stone_u() (no polymorph into a stone golem: 7f)
 */
export function doStoneU(ctx: Ctx, mon: Entity): boolean {
  if (isStoned(ctx.state) || hasProp(hero(ctx), P.STONE_RES)) return false;
  // (no unique monster petrifies by touch: KILLED_BY_AN with its name)
  makeStoned(ctx, 5, null, `@${mon.def}`);
  return true;
}

/**
 * One turn of the hero's petrification: the line for this stage, slowing down, stiffening, being
 * unable to move for the last turns, and at the end done(STONING) with the delayed killer.
 * Runs ahead of props.ts's countdown (as the strangulation timer does): the C timeout value
 * before the decrement is our turns left + 1. ref: src/timeout.c stoned_dialogue(), nh_timeout()
 * (no deafness; `exercise(A_DEX, FALSE)` is not ported)
 */
function stoningTimeout(ctx: Ctx): void {
  if (ctx.state.gameOver || uState(ctx.state).uinvulnerable || !isStoned(ctx.state)) return;
  const h = hero(ctx);
  const i = timeoutLeft(ctx.state, h, P.STONED) + 1;
  if (i >= 1 && i <= 5) say(ctx, `stone.dialogue.${5 - i}`);
  switch (i) {
    case 5: // slowing down
      setIntrinsic(h, P.FAST, false);
      setItimeout(ctx.state, h, P.FAST, 0);
      ctx.interrupt(); // if (multi > 0) nomul(0)
      break;
    case 4: // limbs stiffening; just one move left to save oneself (no tins: no Popeye())
      stopOccupation(ctx);
      break;
    case 3: // limbs turned to stone
      stopOccupation(ctx);
      nomulNow(ctx, 3, 'helpless.stoned', { key: 'eat.can_move_again' }); // can't move anymore
      // "your limbs have turned to stone" so terminate wounded legs: heal_legs(2), silently
      if (hasProp(h, P.WOUNDED_LEGS)) {
        setItimeout(ctx.state, h, P.WOUNDED_LEGS, 0);
        delete (nhData(ctx) as { legSides?: number }).legSides;
      }
      break;
    case 2: // turned to stone: if also vomiting or turning into slime, stop those (no messages)
      makeVomiting(ctx, 0, false);
      if (isSlimed(ctx.state)) makeSlimed(ctx, 0, null);
      break;
    default:
      break;
  }
  if (i === 1) {
    // ref: nh_timeout(): the delayed killer, else "killed by petrification"
    const killer = stonedKiller(ctx.state) ?? '!@killer.petrification';
    makeStoned(ctx, 0, null, null);
    done(ctx, killer, 'stoning');
  }
}

/** Registers the petrification countdown (ahead of props.ts's) and the Stone status. */
export function registerStoning(api: ModApi): void {
  api.on('endOfTurn', stoningTimeout, { priority: 1 });
  // ref: src/botl.c bl_stone: the "Stone" condition
  api.defineStatus({
    id: 'nh:stoned',
    field: 'stone',
    value: (state) => (isStoned(state) ? 1 : null),
  });
}
