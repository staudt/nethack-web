// A trapped box going off when the hero opens it, picks its lock or (#untrap, later) fails to
// disarm it: luck may make it a dud; otherwise an explosion that destroys the box and everything
// at its spot, poison gas, a poisoned needle, a tower of flame, an electric shock, paralysis or
// a stunning, hallucinogenic gas cloud.
// ref: src/trap.c chest_trap()
//
// Not ported (see DEVIATIONS.md): gas cloud regions (the 1 in 3 noxious cloud is breathed at once
// as the poison gas instead), the ball and chain, polymorphed forms, Half_physical_damage, exercise.
import {
  contents,
  getPlayer,
  itemsAt,
  type Ctx,
  type Entity,
  type EntityId,
  type Msg,
} from '@nh/core';
import { poisoned } from './attrib';
import { setBoxTknown, setBoxTrapped } from './btrapstate';
import { wakeNearby } from './btrapped';
import { destroyItems } from './erode';
import { eshkOf, insideShop, shopKeeper, uShops, costlySpot } from './eshk';
import { hcolor } from './hcolor';
import { losehp } from './hp';
import { nomulNow } from './hunger';
import { luckOf } from './luck';
import { dofiretrap } from './magictrap';
import { xnameOf, zorkmids } from './objnam';
import { P, hasProp, makeHallucinated, makeStunned, timeoutLeft } from './props';
import { makeAngryShk, stolenValue } from './shk';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

export type BodyPart = 'finger' | 'hand' | 'foot';

/** ref: include/color.h CLR_MAX; src/decl.c c_obj_colors[] (rndcolor()) */
const CLR_MAX = 16;
/** ref: src/trap.c blindgas[] */
const BLINDGAS = 6;

/** Where the box is: its floor spot, or the hero's when she carries it. ref: get_obj_location() */
function boxSpot(ctx: Ctx, box: Entity): { level: string; x: number; y: number } | null {
  if (box.c.pos) return box.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  return box.c.item?.carriedBy === ctx.state.playerId && hp ? hp : null;
}

/**
 * The box's trap goes off (`disarm`: she set it off while trying to disarm it). Returns true if
 * the box was destroyed. The trap is one-shot: the box is no longer trapped, and the hero knows.
 * ref: src/trap.c chest_trap()
 */
export function chestTrap(ctx: Ctx, box: Entity, part: BodyPart, disarm: boolean): boolean {
  const spot = boxSpot(ctx, box);
  setBoxTknown(ctx, box.id, false); // for xname(); will be set to 1 below
  setBoxTrapped(ctx, box.id, false); // trap is one-shot
  say(ctx, disarm ? 'ctrap.set_it_off' : 'ctrap.trigger');
  const hero = getPlayer(ctx.state);
  const luck = luckOf(ctx.state);
  if (luck > -13 && ctx.rng.rn2(13 + luck) > 7) {
    // saved by luck: the trap went off, but good luck prevents damage
    const r = ctx.rng.rn2(13);
    const msg =
      r >= 11 ? 'dud' : r >= 9 ? 'grounded' : r >= 7 ? 'fizzles' : r >= 4 ? 'misses' : 'blows';
    say(ctx, `ctrap.luckily.${msg}`);
  } else {
    const n = ctx.rng.rn2(20) ? (luck >= 13 ? 0 : ctx.rng.rn2(13 - luck)) : ctx.rng.rn2(26);
    const name = xnameOf(ctx.state, ctx.defs, box);
    if (n >= 21) {
      if (spot && boxExplodes(ctx, box, spot)) return true;
    } else if (n >= 17) {
      say(ctx, 'ctrap.noxious_gas', { box: name });
      // create_gas_cloud() 1 time in 3: no gas regions, so she breathes the gas at once
      ctx.rng.rn2(3);
      poisoned(ctx, { key: 'ctrap.gas_poisoned' }, 'str', '@killer.poison_gas_cloud', 15);
    } else if (n >= 13) {
      say(ctx, 'ctrap.needle', { part: { key: `ctrap.part.${part}` } });
      poisoned(ctx, { key: 'ctrap.needle_poisoned' }, 'con', '@killer.poisoned_needle', 10);
    } else if (n >= 9) {
      dofiretrap(ctx, box);
    } else if (n >= 6) {
      const orig = ctx.rng.d(4, 4);
      let dmg = orig;
      say(ctx, 'ctrap.jolted');
      if (hasProp(hero, P.SHOCK_RES)) {
        say(ctx, 'ctrap.not_affected'); // no shieldeff()
        dmg = 0;
      }
      destroyItems(ctx, hero.id, 'elec', orig);
      if (dmg && !ctx.state.gameOver) losehp(ctx, dmg, '@killer.electric_shock');
    } else if (n >= 3) {
      if (!hasProp(hero, P.FREE_ACTION)) {
        say(ctx, 'ctrap.frozen');
        nomulNow(ctx, ctx.rng.d(5, 6), 'helpless.frozen_trap', { key: 'eat.can_move_again' });
      } else say(ctx, 'ctrap.stiffen');
    } else {
      const blind = hasProp(hero, P.BLINDED);
      const k = ctx.rng.rn2(blind ? BLINDGAS : CLR_MAX); // ROLL_FROM(blindgas) : rndcolor()
      const gas: Msg = blind
        ? { key: `ctrap.blindgas.${k}` }
        : hasProp(hero, P.HALLUC)
          ? hcolor(ctx, 'red')
          : k === 8
            ? { key: 'ctrap.colorless' }
            : { key: `ctrap.color.${k}` };
      say(ctx, 'ctrap.gas', { gas, box: name });
      if (!hasProp(hero, P.STUNNED)) {
        if (hasProp(hero, P.HALLUC)) say(ctx, 'ctrap.groovy');
        else say(ctx, blind ? 'ctrap.stagger_dizzy' : 'ctrap.stagger_blurs');
      }
      makeStunned(ctx, timeoutLeft(ctx.state, hero, P.STUNNED) + ctx.rng.rn2(7) + 16, false);
      makeHallucinated(ctx, timeoutLeft(ctx.state, hero, P.HALLUC) + ctx.rng.rn2(5) + 16, false);
    }
  }
  if (ctx.state.entities[String(box.id)]) setBoxTknown(ctx, box.id, true); // no longer trapped
  return false;
}

/**
 * "The large box explodes!": its contents are lost, everything at its spot is destroyed (the box
 * with it unless she carries it), she takes d(6,6) ("killed by an exploding large box"); a shop
 * bills the loss, or its keeper gets angry when she is outside. Returns true if the box is gone.
 * ref: src/trap.c chest_trap() case 21
 */
function boxExplodes(
  ctx: Ctx,
  box: Entity,
  spot: { level: string; x: number; y: number },
): boolean {
  const { x: ox, y: oy } = spot;
  const level = ctx.state.levels[spot.level];
  const room = level && spot.level === ctx.state.currentLevel ? insideShop(level, ox, oy) : null;
  const shk = room !== null && costlySpot(ctx, ox, oy) ? shopKeeper(ctx, spot.level, room) : null;
  const costly = shk !== null;
  const peaceful = shk !== null && ctx.state.entities[String(shk)]?.c.monster?.peaceful === true;
  const insider = costly && uShops(ctx).length > 0 && uShops(ctx)[0] === room;
  const killer = `@killer.exploding.${box.def}`;
  say(ctx, 'ctrap.explodes', { box: xnameOf(ctx.state, ctx.defs, box) });
  let loss = 0;
  if (costly) loss += stolenValue(ctx, box, ox, oy, peaceful, true);
  for (const c of contents(ctx.state, box.id)) ctx.remove(c.id); // delete_contents()
  // destroy everything at the spot (there is no Amulet, no invocation tools, no Rider corpses)
  let chestgone = false;
  const here: EntityId[] = itemsAt(ctx.defs, ctx.state, spot.level, ox, oy).map((o) => o.id);
  for (const id of here) {
    const o = ctx.state.entities[String(id)];
    if (!o) continue;
    if (costly) loss += stolenValue(ctx, o, ox, oy, peaceful, true);
    if (id === box.id) chestgone = true;
    ctx.remove(id);
  }
  wakeNearby(ctx);
  losehp(ctx, ctx.rng.d(6, 6), killer);
  if (costly && loss && !ctx.state.gameOver) {
    if (insider) say(ctx, 'ctrap.owe', { n: loss, zm: zorkmids(loss) });
    else {
      say(ctx, 'ctrap.caused_damage', { n: loss, zm: zorkmids(loss) });
      if (shk !== null && eshkOf(ctx, shk)) makeAngryShk(ctx, shk);
    }
  }
  return chestgone;
}
