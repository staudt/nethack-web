// Kicking. ref: src/dokick.c dokick(), kick_monster(), kickdmg(), kick_object(),
// really_kick_object(), kick_door(), kick_nondoor(), kick_dumb(), kick_ouch(); src/zap.c bhit()
// (KICKED_WEAPON); src/do.c set_wounded_legs()
//
// The hero is a human Valkyrie: no martial arts but kicking boots or a sasquatch form, not riding,
// not swimming; other polymorphed forms kick as she does (step 4/5 of 7f-d).
// Those branches are not ported (kicking boots are: martial()); levitating she needs something to brace against,
// misses small monsters wildly, cannot break doors or reach the floor's objects, but is never
// pushed back (no hurtle(), DEVIATIONS.md "Levitation"). Shop goods kicked out of
// a shop are owed (stolen_value()), and a shop door broken by a kick is damage he wants paid for
// (add_damage(), pay_for_damage()); kicked gold (costly_gold(): no loan) is not.
// Thrones: kickThrone() (ref: dokick() IS_THRONE).
// Also not ported: traps but statue traps, boxes and chests, fountains, graves, trees, sinks,
// iron bars, pools, ice and greased objects, the exercise of attributes, Luck, alignment, the
// bulky-armor clumsiness and the bad-Dex ATEMP penalty of wounded legs.
import { mApType, seemimic } from './mimicstate';
import { EGG } from './eggstate';
import { breakEggs } from './egghit';
import { bareCorpseTouch } from './stonetouch';
import { activateStatueTrap } from './statue';
import { TRAP, dungeonBottom, fallThroughFloor, mintrap } from './trap';
import { GLASS_GEMS, REAL_GEMS, gemLedger, rndClass } from './gem';
import { mksobjFull } from './mkobj';
import { setThroneLooted, throneLooted } from './thronestate';
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  cellRules,
  getLevel,
  trapAt,
  getPlayer,
  inBounds,
  inRooms,
  inventoryOf,
  itemsAt,
  rnl,
  itemShownId,
  isVisible,
  type ActionDef,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type EntityId,
  type Json,
  type ModApi,
  type Msg,
  type MonsterDef,
  type Offer,
  type PlayerAction,
  type Pos,
  type PromptOption,
  type TerrainDef,
} from '@nh/core';
import { BOULDER, blockersOf, boulderAt } from './boulder';
import { setTerrain } from './actions';
import { doorTrapped } from './btrapstate';
import { bTrapped, blowDoor } from './btrapped';
import { aAlign, altarWrath } from './align';
import { findRollToHit, missum, monsterIdAt } from './combat';
import { damageum } from './hmonas';
import { M_ATTK } from './adtyping';
import { nolimbs, slithy, verysmall } from './mondata';
import { getdirImpaired, ustuck } from './hackmove';
import { experienceFor, gainExperience } from './hero';
import { gethungry } from './hunger';
import { losehp } from './hp';
import { isMtrapped, levitating, utrap } from './trapstate';
import { wakeNearto } from './noise';
import { setWoundedLegs } from './legs';

export { wakeNearto, setWoundedLegs };
import { mkgold, nhData, placeOnFloor, splitStack, weight } from './items';
import { clearPath } from './monmove';
import { monsterDied } from './mondeath';
import { whichArmor } from './mongear';
import { encumberMsg } from './itemactions';
import { needsAttackConfirm, askReallyAttack, setmangry, wakeup } from './peaceful';
import { passive, type PassiveTarget } from './uhitm_passive';
import { isCancelled, isFrozen } from './mstate';
import { P, hasProp, heroHas, ringBonus } from './props';
import { acurrstr, invWeight, nearCapacity, weightCap } from './stats';
import { T, isObstructedId, terrainIdAt } from './terrain';
import { thitmonst } from './dothrow';
import { scatter } from './scatter';
import { stuckInWeb } from './web';
import { costlySpot, eshkOf, inAnyShop, isShopType } from './eshk';
import { costlyAdjacent, findObjowner, stolenValue, subfrombill } from './shk';
import { payForDamage } from './shkpay';
import { SHOP_DOOR_COST, addDamage } from './shopdamage';
import { canSpotMon, monNam, revealUnseenAt } from './perception';
import { mapInvisible, markedUnseen, unmapInvisible } from './invis';
import { isUndetected, setUndetected } from './hidestate';
import { engulfingU } from './engulfstate';
import { abuseDog } from './dog';
import { watchmanDoorDamage, watchmanThiefArrest } from './watch';

import { monflee, stopFleeing } from './monflee';
import { luckOf } from './luck';
import { heroForm, heroFormId } from './upoly';

export const KICK_ID: DefId = 'nh:kick';

/** The hero's worn boots (uarmf), what a kick's passive response damages. */
const uarmf = (ctx: Ctx): Entity | null => whichArmor(ctx, ctx.state.playerId, 'boots');

/** ref: include/objects.h KICKING_BOOTS */
export const KICKING_BOOTS: DefId = 'nh:kicking_boots';

/**
 * Kicks like a martial artist: wearing kicking boots or polymorphed into a sasquatch (is_bigfoot();
 * no Monks or Samurai). ref: src/dokick.c martial()
 */
const martial = (ctx: Ctx): boolean =>
  uarmf(ctx)?.def === KICKING_BOOTS || heroFormId(ctx.state) === 'nh:sasquatch';

const say = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const DIRECTION_OPTIONS: PromptOption[] = DIR_LIST.map((d) => ({ value: d, key: `dir.${d}` }));

/** ref: include/hack.h SLT_ENCUMBER (Burdened); `near_capacity() > SLT_ENCUMBER` is Stressed+ */
const SLT_ENCUMBER = 1;

const hero = (ctx: Ctx): Entity => getPlayer(ctx.state);
const attr = (ctx: Ctx) => {
  const a = hero(ctx).c.attributes;
  return { str: a?.str ?? 10, dex: a?.dex ?? 10, con: a?.con ?? 10 };
};

// ---------------------------------------------------------------------------------------------
// small effects

/** ref: src/dokick.c kickstr(): the cause of death */
const killerFor = (what: string): string => `@killer.kick.${what}`;

/**
 * ref: src/dokick.c kick_ouch(): "Ouch! That hurts!", the noise wakes the neighbours, 1 time in 3
 * the leg is hurt, and d3 (d5 with Con 15 or less) damage.
 */
function kickOuch(ctx: Ctx, x: number, y: number, what: string): void {
  say(ctx, 'kick.ouch');
  const level = getLevel(ctx.state);
  if (inBounds(level, x, y)) wakeNearto(ctx, x, y, 5 * 5);
  if (ctx.rng.rn2(3) === 0) setWoundedLegs(ctx, 5 + ctx.rng.rnd(5));
  const dmg = ctx.rng.rnd(attr(ctx).con > 15 ? 3 : 5);
  losehp(ctx, dmg, killerFor(what));
}

/**
 * ref: src/dokick.c kick_dumb(): "You kick at empty space", or (Dex under 16, 1 in 3) "Dumb move!
 * You strain a muscle." and the leg is hurt for 5 + d5 turns.
 */
function kickDumb(ctx: Ctx): void {
  if (attr(ctx).dex >= 16 || ctx.rng.rn2(3) !== 0) {
    say(ctx, 'kick.empty_space');
  } else {
    say(ctx, 'kick.dumb_move');
    setWoundedLegs(ctx, 5 + ctx.rng.rnd(5));
  }
}

// ---------------------------------------------------------------------------------------------
// doors and other terrain

const terrainAt = (ctx: Ctx, x: number, y: number): TerrainDef => {
  const level = getLevel(ctx.state);
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  if (id === undefined) throw new Error('Unknown terrain');
  return ctx.defs.terrain(id);
};

/**
 * ref: src/dokick.c kick_door(). An open door or a doorway is kicked at "empty space". A closed
 * or locked door gives way when `rnl(35) < (Str + Dex + Con) / 3`: with Str over 18 one time in 5
 * it shatters, otherwise it crashes open; both leave a doorway here (D_NODOOR and D_BROKEN are
 * the same square). Otherwise "Thwack!!" (1 in 3) or "Whammm!!". In town a watchman in sight
 * arrests the hero for a broken door, and warns her (then arrests her) for a damaged one; a
 * floating hero has not enough leverage ("Ouch!"). A trapped door that gives way blows up ("You
 * kick the door.", b_trapped()). Not ported: shop doors.
 */
function kickDoor(ctx: Ctx, x: number, y: number, avrg: number): void {
  const t = terrainAt(ctx, x, y);
  if (t.door !== 'closed' && t.door !== 'locked') {
    kickDumb(ctx);
    return; // uses a turn
  }
  // not enough leverage to kick open doors while levitating
  if (levitating(ctx)) {
    kickOuch(ctx, x, y, 'door');
    return;
  }
  if (rnl(ctx.rng, 35, luckOf(ctx.state)) < avrg) {
    const level = getLevel(ctx.state);
    const shopdoor = inAnyShop(level, x, y);
    // break the door
    if (doorTrapped(ctx, level.id, x, y)) {
      say(ctx, 'kick.kick_the_door'); // flags.verbose
      blowDoor(ctx, level, x, y);
      bTrapped(ctx, 'door');
      if (ctx.state.gameOver) return;
    } else {
      if (attr(ctx).str > 18 && ctx.rng.rn2(5) === 0 && !shopdoor) say(ctx, 'kick.door_shatters');
      else say(ctx, 'kick.door_crashes');
      setTerrain(level, x, y, T.doorway);
      ctx.emit({ type: 'doorOpened', pos: { x, y } });
    }
    if (shopdoor) {
      addDamage(ctx, x, y, SHOP_DOOR_COST);
      payForDamage(ctx, 'break', false);
    }
    watchmanThiefArrest(ctx, x, y); // in town
  } else {
    say(ctx, ctx.rng.rn2(3) === 0 ? 'kick.door_thwack' : 'kick.door_whammm');
    watchmanDoorDamage(ctx, x, y); // in town
  }
}

/**
 * Kicking a throne: with bad Luck or once looted, 1 time in 3 it is destroyed ("CRASH!  You
 * destroy the throne.") leaving `rnd(200)` gold; with good Luck 1 time in 3 (not looted) it gives
 * `rn1(201, 300)` gold and `min(Luck + 1, 6)` gems or glass ("You kick loose some ornamental
 * coins and gems!") and is looted from then on; else 1 time in 4 the floor opens under her (above
 * a dungeon's last level), otherwise it hurts. Floating, she kicks at empty space. No Dex
 * exercise. ref: src/dokick.c dokick() IS_THRONE
 */
function kickThrone(ctx: Ctx, x: number, y: number): void {
  if (levitating(ctx)) {
    kickDumb(ctx);
    return;
  }
  const level = getLevel(ctx.state);
  const at = { level: level.id, x, y };
  const luck = luckOf(ctx.state);
  const blind = hasProp(hero(ctx), P.BLINDED);
  const looted = throneLooted(ctx.state, level.id, x, y);
  if ((luck < 0 || looted) && !ctx.rng.rn2(3)) {
    setThroneLooted(ctx, level.id, x, y, false); // don't leave loose ends..
    setTerrain(level, x, y, T.floor);
    mkgold(ctx, ctx.rng.rnd(200), at);
    say(ctx, blind ? 'kick.throne_destroyed_blind' : 'kick.throne_destroyed');
    return;
  }
  if (luck > 0 && !ctx.rng.rn2(3) && !looted) {
    mkgold(ctx, ctx.rng.rn2(201) + 300, at); // rn1(201, 300)
    const gems = [...REAL_GEMS, ...GLASS_GEMS]; // rnd_class(DILITHIUM_CRYSTAL, LUCKSTONE - 1)
    for (let i = Math.min(luck + 1, 6); i > 0; i--) {
      const id = rndClass(ctx.rng, ctx.defs, gems, gemLedger(ctx.state, level.id));
      mksobjFull(ctx, ctx.defs.object(id), { init: false, at });
    }
    say(ctx, blind ? 'kick.something_loose' : 'kick.throne_loot');
    // prevent endless milking
    setThroneLooted(ctx, level.id, x, y, true);
    return;
  }
  if (!ctx.rng.rn2(4)) {
    if (level.dlevel < dungeonBottom(ctx.state, level)) fallThroughFloor(ctx);
    else kickOuch(ctx, x, y, 'throne');
    return;
  }
  kickOuch(ctx, x, y, 'throne');
}

/**
 * ref: src/dokick.c kick_nondoor(): secret doors and corridors open up with `rn2(30) < avrg`
 * ("Crash!"), an altar angers its god (altar_wrath()), walls and rock hurt, the up stairs hurt
 * and the down stairs are "dumb", and anything else is empty space. Floating, she never opens a
 * secret door or passage and kicks at the air above an altar.
 */
function kickNondoor(ctx: Ctx, x: number, y: number, avrg: number): void {
  const level = getLevel(ctx.state);
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  const secretDoor =
    id === T.sdoor_v || id === T.sdoor_h || id === T.sdoor_locked_v || id === T.sdoor_locked_h;
  if (secretDoor) {
    if (!levitating(ctx) && ctx.rng.rn2(30) < avrg) {
      const locked = id === T.sdoor_locked_v || id === T.sdoor_locked_h;
      const vertical = id === T.sdoor_v || id === T.sdoor_locked_v;
      const trapped = doorTrapped(ctx, level.id, x, y);
      // cvt_sdoor_to_door(): a locked one is uncovered (still locked), a closed one kicked open,
      // a trapped one blows up
      say(ctx, locked && !trapped ? 'kick.uncovers_door' : 'kick.kicks_open_door');
      if (trapped) {
        blowDoor(ctx, level, x, y);
        bTrapped(ctx, 'door');
      } else
        setTerrain(level, x, y, locked ? T.door_locked : vertical ? T.door_open_v : T.door_open_h);
    } else kickOuch(ctx, x, y, 'wall');
    return;
  }
  if (id === T.scorr) {
    if (!levitating(ctx) && ctx.rng.rn2(30) < avrg) {
      say(ctx, 'kick.kicks_open_passage');
      setTerrain(level, x, y, T.corr);
    } else kickOuch(ctx, x, y, 'rock');
    return;
  }
  if (id === T.throne) {
    kickThrone(ctx, x, y);
    return;
  }
  if (aAlign(ctx, x, y) !== null) {
    if (levitating(ctx)) {
      kickDumb(ctx);
      return;
    }
    // ref: kick_nondoor() IS_ALTAR: "You kick the altar.", altar_wrath(), 1 in 3 it hurts
    // (the Dex exercise otherwise is not ported)
    say(ctx, hasProp(hero(ctx), P.BLINDED) ? 'kick.something' : 'kick.altar');
    altarWrath(ctx, x, y);
    if (ctx.rng.rn2(3) === 0) kickOuch(ctx, x, y, 'altar');
    return;
  }
  const t = terrainAt(ctx, x, y);
  if (t.stairs === 'down') kickDumb(ctx);
  else if (t.stairs === 'up') kickOuch(ctx, x, y, 'stairs');
  else if (!t.passable && t.door === undefined)
    kickOuch(ctx, x, y, t.id === 'nh:stone' ? 'rock' : 'wall');
  else kickDumb(ctx);
}

// ---------------------------------------------------------------------------------------------
// objects

/** The weight of one object of a stack. ref: src/dokick.c really_kick_object() k_owt */
function unitWeight(ctx: Ctx, e: Entity): number {
  const it = e.c.item;
  if (!it || it.quantity <= 1) return weight(ctx.defs, e, ctx.state);
  return weight(ctx.defs, { ...e, c: { ...e.c, item: { ...it, quantity: 1 } } }, ctx.state);
}

/**
 * ref: src/dothrow.c breaktest(): potions, eggs and glass (but not gems) break (the 1% resistance
 * roll is not made here)
 */
function fragile(ctx: Ctx, e: Entity): boolean {
  const od = ctx.defs.object(e.def);
  return od.class === 'potion' || e.def === EGG || (od.material === 'glass' && od.class !== 'gem');
}

/**
 * Flies the (detached) object `dist` squares from the cell (x, y) in direction `dir`; it stops
 * before a wall or closed door, on a monster, in a web 1 time in 3, and a coin stops on a square
 * that holds objects.
 * ref: src/zap.c bhit() with KICKED_WEAPON: "object starts one square in front of player"
 */
function bhitKicked(
  ctx: Ctx,
  objId: EntityId,
  from: Pos,
  dir: Dir,
  range: number,
): { pos: Pos; mon: EntityId | null } {
  const level = getLevel(ctx.state);
  const rules = cellRules(level, ctx.defs);
  const obj = ctx.state.entities[String(objId)];
  const coin = obj !== undefined && ctx.defs.object(obj.def).class === 'coin';
  const d = DIRS[dir];
  let x = from.x;
  let y = from.y;
  let mon: EntityId | null = null;
  const path: Pos[] = [];
  range--;
  while (range-- > 0) {
    x += d.x;
    y += d.y;
    if (!inBounds(level, x, y)) {
      x -= d.x;
      y -= d.y;
      break;
    }
    if (!rules.passable[level.cells[cellIndex(level, x, y)] ?? 0]) {
      x -= d.x;
      y -= d.y;
      break;
    }
    if (isVisible(ctx.state, cellIndex(level, x, y))) path.push({ x, y });
    const m = monsterIdAt(ctx, { x, y }, level.id);
    // ref: bhit(): an unseen monster that stops it on a seen square is remembered as `I`; an
    // `I` with nothing there is forgotten
    revealUnseenAt(ctx, m === null ? null : ctx.state.entities[String(m)], x, y);
    if (m !== null) {
      mon = m;
      break;
    }
    if (obj && stuckInWeb(ctx, level, x, y, obj)) break;
    if (coin && itemsAt(ctx.defs, ctx.state, level.id, x, y).length > 0) break;
  }
  if (path.length > 0 && obj)
    ctx.emit({ type: 'projectile', g: itemShownId(ctx.defs, ctx.state, obj), path });
  return { pos: { x, y }, mon };
}

/**
 * Kicks the top object of the pile; false means nothing came of it (then the hero hurts herself).
 * ref: src/dokick.c really_kick_object(). The range is `Str / 2 - weight / 40`; it is 1 when the
 * next square is a wall or closed door. A range under 2 is "Thump!" (and a bruise 2 times in 3).
 * Potions and glass shatter. A single coin stack scatters its coins ("Thwwpingg!") 19 times in 20
 * (`scatter(x, y, rnd(3), VIS_EFFECTS | MAY_HIT)`); a kicked stack sends one object. The object flies and hits a monster
 * with thitmonst().
 */
function reallyKickObject(ctx: Ctx, pile: Entity, x: number, y: number, dir: Dir): boolean {
  // a boulder does not move: the kick hurts (kick_ouch())
  if (pile.def === BOULDER) return false;
  // a statue trap there sets its statue off instead (pits and webs are not ported here)
  const trap = trapAt(getLevel(ctx.state), x, y);
  if (trap?.def === TRAP.statue) {
    activateStatueTrap(ctx, ctx.state.currentLevel, trap, false);
    return true;
  }
  if (heroHas(ctx.state, P.FUMBLING) && !ctx.rng.rn2(3)) {
    say(ctx, 'kick.clumsy_missed');
    return true;
  }
  const it = pile.c.item;
  const pos = hero(ctx).c.pos;
  if (!it || !pos) return false;
  // kicking a cockatrice corpse barefoot (a life-saved hero kicks it anyway)
  bareCorpseTouch(ctx, pile, 'kick');
  if (ctx.state.gameOver) return true;
  const level = getLevel(ctx.state);
  const od = ctx.defs.object(pile.def);
  const isgold = od.class === 'coin';
  const d = DIRS[dir];

  let range = Math.trunc(acurrstr(attr(ctx).str) / 2) - Math.trunc(unitWeight(ctx, pile) / 40);
  if (martial(ctx)) range += ctx.rng.rnd(3);
  // the object has no place to move into
  const nx = x + d.x;
  const ny = y + d.y;
  const rules = cellRules(level, ctx.defs);
  if (!inBounds(level, nx, ny) || !rules.passable[level.cells[cellIndex(level, nx, ny)] ?? 0])
    range = 1;

  // ref: really_kick_object(): the shop the object lies in cares about it
  const shk = findObjowner(ctx, pile, x, y);
  const costly =
    shk !== null && (costlySpot(ctx, x, y) || (costlyAdjacent(ctx, shk, x, y) && !!it.unpaid));

  // "You kick a dagger." (one of the stack)
  const one =
    it.quantity > 1 && !isgold ? { ...pile, c: { ...pile.c, item: { ...it, quantity: 1 } } } : pile;
  say(ctx, 'kick.you_kick_obj', { item: ctx.defs.itemName(ctx.state, one) });

  // ref: hero_breaks(): fragile objects should not be kicked
  if (fragile(ctx, pile)) {
    if (pile.def === EGG) {
      say(ctx, 'egg.splat'); // breakmsg()
      breakEggs(ctx, pile, true);
      return true;
    }
    say(ctx, it.quantity === 1 ? 'kick.shatters' : 'kick.shatter', {
      item: ctx.defs.itemName(ctx.state, pile),
    });
    ctx.remove(pile.id);
    return true;
  }

  // too heavy to move
  if (range < 2) {
    say(ctx, 'kick.thump');
    return ctx.rng.rn2(3) === 0;
  }

  let id = pile.id;
  if (it.quantity > 1) {
    if (!isgold) {
      id = splitStack(ctx, pile.id, 1);
    } else if (ctx.rng.rn2(20) !== 0) {
      // the coins fly off in all directions (no deafness)
      say(ctx, 'kick.thwwpingg');
      say(ctx, `kick.coins_scatter.${ctx.rng.rn2(3)}`); // ROLL_FROM(flyingcoinmsg)
      scatter(ctx, x, y, ctx.rng.rnd(3), { visEffects: true, mayHit: true }, pile);
      return true;
    } else if (it.quantity > 300) {
      say(ctx, 'kick.thump');
      return ctx.rng.rn2(3) === 0;
    }
  }
  const obj = ctx.state.entities[String(id)];
  if (!obj) return false;
  delete obj.c.pos; // obj_extract_self()

  const { pos: land, mon } = bhitKicked(ctx, id, { x, y }, dir, range);
  if (mon !== null) {
    if (isgold) {
      // ref: dokick.c ghitm(): a monster that does not want gold is woken (and angered) by the
      // blow; greedy monsters catching it are not ported
      wakeup(ctx, mon);
    } else if (thitmonst(ctx, mon, id, { i: 1, n: 1 })) {
      return true; // used up
    }
  }
  // the object lands where it stopped (on the monster's square if one was hit, even a dead one)
  if (!ctx.state.entities[String(id)]) return true;
  const shopAt = (px: number, py: number): number | undefined =>
    inRooms(level, px, py).find((r) => isShopType(level.rooms[r]?.type));
  if (costly && shk !== null) {
    const peaceful = !!ctx.state.entities[String(shk)]?.c.monster?.peaceful;
    if (!costlySpot(ctx, land.x, land.y) || shopAt(x, y) !== shopAt(land.x, land.y)) {
      // kicked from inside shop to somewhere outside shop (gold: no loan, never billed)
      if (!isgold) stolenValue(ctx, obj, x, y, peaceful, false);
    } else if (obj.c.item?.unpaid && eshkOf(ctx, shk)) subfrombill(ctx, obj, shk);
  }
  placeOnFloor(ctx, id, level.id, land.x, land.y);
  return true;
}

// ---------------------------------------------------------------------------------------------
// monsters

/** ref: include/mondata.h bigmonst() */
const bigmonst = (def: MonsterDef): boolean =>
  def.size === 'large' || def.size === 'huge' || def.size === 'gigantic';

/** ref: include/mondata.h thick_skinned(): M1_THICK_HIDE */
const thickSkinned = (def: MonsterDef): boolean => def.flags.includes('thick_hide');

/**
 * A monster that dodges the kick moves next to the hero. ref: src/mon.c maybe_mnexto() (enexto():
 * the nearest free squares around the hero, a random one of the first ring that has any; it must
 * be in her line of sight, and a grid bug not diagonal to where it was). May leave it in place.
 */
function maybeMnexto(ctx: Ctx, monId: EntityId): void {
  const mon = ctx.state.entities[String(monId)];
  const hp = hero(ctx).c.pos;
  const mp = mon?.c.pos;
  if (!mon || !hp || !mp) return;
  const level = getLevel(ctx.state);
  const rules = cellRules(level, ctx.defs);
  const diagok = mon.def !== 'nh:grid_bug';
  // enexto(): the free squares of the first ring around the hero that has any
  const ring: Pos[] = [];
  for (let r = 1; r < 8 && ring.length === 0; r++) {
    for (let xx = hp.x - r; xx <= hp.x + r; xx++) {
      for (let yy = hp.y - r; yy <= hp.y + r; yy++) {
        if (Math.max(Math.abs(xx - hp.x), Math.abs(yy - hp.y)) !== r) continue;
        if (!inBounds(level, xx, yy)) continue;
        if (!rules.passable[level.cells[cellIndex(level, xx, yy)] ?? 0]) continue;
        const there = monsterIdAt(ctx, { x: xx, y: yy }, level.id);
        if (there === null || there === monId) ring.push({ x: xx, y: yy });
      }
    }
  }
  let tries = 20;
  while (ring.length > 0 && tries-- > 0) {
    const cand = ring[ctx.rng.rn2(ring.length)];
    if (
      cand &&
      clearPath(level, rules.opaque, hp.x, hp.y, cand.x, cand.y, blockersOf(ctx, level.id)) &&
      (diagok || cand.x === mp.x || cand.y === mp.y)
    ) {
      if (cand.x !== mp.x || cand.y !== mp.y) {
        const from = { x: mp.x, y: mp.y };
        mp.x = cand.x;
        mp.y = cand.y;
        ctx.emit({ type: 'moved', id: monId, from, to: { x: cand.x, y: cand.y } });
      }
      return;
    }
  }
}

/**
 * ref: src/dokick.c kickdmg() for a hero who is not polymorphed: kicking boots add 5 and, as
 * martial arts, `rn2(Dex / 2 + 1)`, and 1 time in 3 send a small monster reeling a square back
 * ("The jackal reels from the blow."), onto any trap there
 */
function kickdmg(ctx: Ctx, monId: EntityId, clumsy: boolean, dir: { x: number; y: number }): void {
  const target = ctx.state.entities[String(monId)];
  const mon = target?.c.monster;
  if (!target || !mon || !target.c.pos) return;
  const def = ctx.defs.monster(target.def);
  const a = attr(ctx);
  let dmg = Math.trunc((acurrstr(a.str) + a.dex + a.con) / 15);
  if (uarmf(ctx)?.def === KICKING_BOOTS) dmg += 5;
  if (clumsy) dmg = Math.trunc(dmg / 2); // excessive weight affects Dex, so it affects damage
  if (thickSkinned(def)) dmg = 0; // kicking a dragon or an elephant will not harm it
  if (mApType(ctx, monId) !== null) seemimic(ctx, monId); // ref: kickdmg()
  // "squeeze some guilt feelings...": a kicked pet is abused and runs off
  if (mon.tame) {
    abuseDog(ctx, monId);
    if (mon.tame) monflee(ctx, monId, dmg ? ctx.rng.rnd(dmg) : 1, false, false);
    else stopFleeing(ctx, monId);
  }
  if (dmg > 0) {
    // convert potential damage to actual damage
    dmg = ctx.rng.rnd(dmg);
    if (martial(ctx)) dmg += ctx.rng.rn2(Math.trunc(a.dex / 2) + 1);
  }
  // boots: `dmg += uarmf->spe`
  const boots = inventoryOf(ctx.state, ctx.state.playerId).find(
    (o) => o.c.item?.equipped === 'boots',
  );
  dmg += boots?.c.item?.spe ?? 0;
  dmg += ringBonus(ctx.state, 'nh:ring_of_increase_damage'); // add ring(s) of increase damage
  const snap: PassiveTarget = {
    id: monId,
    def,
    level: mon.level,
    pos: { ...target.c.pos },
    mcan: isCancelled(ctx, monId),
  };
  const hp = target.c.hp;
  if (dmg > 0 && hp) hp.cur -= dmg;
  let trapkilled = false;
  if (
    hp &&
    hp.cur >= 1 &&
    martial(ctx) &&
    !bigmonst(def) &&
    ctx.rng.rn2(3) === 0 &&
    !isFrozen(ctx, monId) &&
    ustuck(ctx) !== monId &&
    !isMtrapped(ctx, monId)
  ) {
    // see if the monster has a place to move into
    const p = target.c.pos;
    const to = { level: p.level, x: p.x + dir.x, y: p.y + dir.y };
    if (reelGoodpos(ctx, target, to)) {
      say(ctx, 'kick.reels', { mon: monNam(ctx, target) });
      const from = { x: p.x, y: p.y };
      target.c.pos = to;
      ctx.emit({ type: 'moved', id: monId, from, to: { x: to.x, y: to.y } });
      if (mintrap(ctx, monId) === 'killed') trapkilled = true;
    }
  }
  const dead = !hp || hp.cur < 1 || !ctx.state.entities[String(monId)]?.c.monster;
  // ref: passive(mon, uarmf, TRUE, !DEADMONSTER(mon), AT_KICK, FALSE)
  passive(ctx, snap, true, !dead, uarmf(ctx), 'kick');
  if (dead && !trapkilled) {
    // ref: src/mon.c killed() -> xkilled(): "You kill/destroy it!"
    const nonliving = def.flags.includes('undead') || def.id === 'nh:manes';
    say(ctx, nonliving ? 'combat.you_destroy' : 'combat.you_kill', { mon: monNam(ctx, target) });
    monsterDied(ctx, monId, true);
    gainExperience(ctx, ctx.state.playerId, experienceFor(def, mon.level));
  }
}

/**
 * goodpos() for a monster sent reeling: a square in bounds it could stand on, with no other
 * creature and no boulder (unless it throws rocks). ref: src/teleport.c goodpos()
 */
function reelGoodpos(ctx: Ctx, mon: Entity, p: { level: string; x: number; y: number }): boolean {
  const level = getLevel(ctx.state, p.level);
  if (!inBounds(level, p.x, p.y)) return false;
  if (!cellRules(level, ctx.defs).passable[level.cells[cellIndex(level, p.x, p.y)] ?? 0])
    return false;
  const hp = hero(ctx).c.pos;
  if (hp && hp.level === p.level && hp.x === p.x && hp.y === p.y) return false;
  if (monsterIdAt(ctx, { x: p.x, y: p.y }, p.level) !== null) return false;
  return (
    !boulderAt(ctx, p.level, p.x, p.y) || ctx.defs.monster(mon.def).flags.includes('rockthrow')
  );
}

/**
 * ref: src/dokick.c kick_monster(): the monster is angered; a heavily loaded hero may do no damage
 * or kick clumsily; a quick, able monster may block the kick or jump out of the way; otherwise
 * kickdmg(). (There is no to-hit roll.)
 */
function kickMonster(ctx: Ctx, monId: EntityId, x: number, y: number): void {
  const target = ctx.state.entities[String(monId)];
  const mon = target?.c.monster;
  if (!target || !mon) return;
  const def = ctx.defs.monster(target.def);
  let name = monNam(ctx, target);
  const snap: PassiveTarget | null = target.c.pos
    ? { id: monId, def, level: mon.level, pos: { ...target.c.pos }, mcan: isCancelled(ctx, monId) }
    : null;
  const passiveMiss = (): void => {
    if (snap) passive(ctx, snap, false, true, uarmf(ctx), 'kick');
  };
  // anger target even if wild miss will occur
  setmangry(ctx, monId);

  if (
    levitating(ctx) &&
    ctx.rng.rn2(3) === 0 &&
    def.size === 'tiny' && // verysmall()
    !def.flags.includes('fly')
  ) {
    say(ctx, 'kick.miss_wildly');
    passiveMiss();
    return;
  }

  // reveal hidden target even if kick ends up missing (note: being hidden doesn't affect chance
  // to hit so neither does this reveal)
  const kap = mApType(ctx, monId);
  if (isUndetected(ctx, monId) || (kap !== null && kap !== 'monster')) {
    if (kap !== null) seemimic(ctx, monId);
    setUndetected(ctx, monId, false);
    if (!canSpotMon(ctx, target)) mapInvisible(ctx, x, y);
    if (canSpotMon(ctx, target)) say(ctx, 'hide.there_is_here', { mon: monNam(ctx, target) });
    else say(ctx, 'hide.something_hidden_here');
    name = monNam(ctx, target);
  }

  // Kick attacks by kicking monsters are normal attacks, not special: a polymorphed hero with
  // kicks makes all of them, each with its own roll
  const form = heroForm(ctx);
  if (form?.attacks.some((a) => a.at === 'kick')) {
    const tmp = findRollToHit(ctx, monId, 'kick', null);
    for (const uattk of form.attacks) {
      // first of two kicks might have provoked counterattack that has incapacitated the hero
      // (ie, floating eye)
      if (hero(ctx).c.helpless || ctx.state.gameOver) break;
      // we only care about kicking attacks here
      if (uattk.at !== 'kick') continue;
      const kickdieroll = ctx.rng.rnd(20);
      const cur = ctx.state.entities[String(monId)];
      if (!cur?.c.monster) break;
      // (no shades; no blessed or silver boots: special_dmgval())
      if (tmp > kickdieroll) {
        say(ctx, 'kick.you_kick_mon', { mon: monNam(ctx, cur) });
        const sum = damageum(ctx, cur, uattk, 0);
        if (snap)
          passive(ctx, snap, sum !== M_ATTK.MISS, !(sum & M_ATTK.DEF_DIED), uarmf(ctx), 'kick');
        if (sum & M_ATTK.DEF_DIED) break; // Defender died
      } else {
        missum(ctx, monId, uattk);
        passiveMiss();
      }
    }
    return;
  }

  // ref: "What the following confusing if statements mean": over 70% of capacity
  const i = -invWeight(ctx.state, ctx.defs, ctx.state.playerId);
  const j = weightCap(ctx.state, ctx.defs, ctx.state.playerId);
  let clumsy = false;
  let doit = false;
  if (i < Math.trunc((j * 3) / 10)) {
    if (ctx.rng.rn2(i < Math.trunc(j / 10) ? 2 : i < Math.trunc(j / 5) ? 3 : 4) === 0) {
      if (martial(ctx))
        doit = true; // goto doit
      else {
        say(ctx, 'kick.clumsy_no_damage');
        passiveMiss();
        return;
      }
    }
    if (doit) {
      // skips the clumsiness checks
    } else if (i < Math.trunc(j / 10)) clumsy = true;
    else if (ctx.rng.rn2(i < Math.trunc(j / 5) ? 2 : 3) === 0) clumsy = true;
  }
  // (bulky body armor would also make the kick clumsy: no armor is oc_bulky here)
  if (!doit && heroHas(ctx.state, P.FUMBLING)) clumsy = true;

  say(ctx, 'kick.you_kick_mon', { mon: name });
  if (
    ctx.rng.rn2(clumsy ? 3 : 4) === 0 &&
    (clumsy || !bigmonst(def)) &&
    !thickSkinned(def) &&
    !def.flags.includes('noeyes') &&
    !mon.asleep &&
    def.speed >= 12
  ) {
    if (!def.flags.includes('nohands') && ctx.rng.rn2(martial(ctx) ? 5 : 3) === 0) {
      say(ctx, clumsy ? 'kick.blocks_clumsy' : 'kick.blocks', { mon: name });
      passiveMiss();
      return;
    }
    maybeMnexto(ctx, monId);
    const at = ctx.state.entities[String(monId)]?.c.pos;
    if (at && (at.x !== x || at.y !== y)) {
      const verb = def.flags.includes('fly')
        ? 'swoops'
        : def.flags.includes('nolimbs')
          ? 'slides'
          : 'jumps';
      say(ctx, 'kick.evades', {
        mon: name,
        verb: { key: `kick.verb.${verb}` },
        how: { key: clumsy ? 'kick.easily' : 'kick.nimbly' },
        kick: { key: clumsy ? 'kick.clumsy_kick' : 'kick.kick' },
      });
      passiveMiss();
      return;
    }
  }
  const hp = hero(ctx).c.pos;
  kickdmg(ctx, monId, clumsy, hp ? { x: x - hp.x, y: y - hp.y } : { x: 0, y: 0 });
}

// ---------------------------------------------------------------------------------------------
// the command

/**
 * The checks at the top of dokick(); false means the hero cannot kick (no time passes).
 * ref: src/dokick.c dokick(): a form with no legs, a tiny one, wounded legs, `near_capacity() >
 * SLT_ENCUMBER`, a lizard form, a bear trap
 */
function canKick(ctx: Ctx): boolean {
  const form = heroForm(ctx);
  if (form && (nolimbs(form) || slithy(form))) {
    say(ctx, 'kick.no_legs');
    return false;
  }
  if (form && verysmall(form)) {
    say(ctx, 'kick.too_small');
    return false;
  }
  if (hasProp(hero(ctx), P.WOUNDED_LEGS)) {
    say(ctx, 'kick.legs_no_shape');
    return false;
  }
  if (nearCapacity(ctx.state, ctx.defs, ctx.state.playerId) > SLT_ENCUMBER) {
    say(ctx, 'kick.too_heavy');
    return false;
  }
  if (form?.glyph.ch === ':') {
    // S_LIZARD
    say(ctx, 'kick.legs_ineffective');
    return false;
  }
  // ref: dokick(): `u.utrap` TT_PIT -> "There's not enough room to kick down here.",
  // TT_BEARTRAP -> "You can't move your leg!"
  const u = utrap(ctx);
  if (u) {
    say(ctx, u.type === 'pit' ? 'kick.no_room_pit' : 'kick.cant_move_leg');
    return false;
  }
  // ref: dokick(): squeezed onto a boulder
  const pos = hero(ctx).c.pos;
  if (pos && boulderAt(ctx, pos.level, pos.x, pos.y)) {
    say(ctx, 'kick.no_room');
    return false;
  }
  return true;
}

/** ref: src/dokick.c dokick() after the direction is known; `confirmed` skips the peaceful query */
function kickDir(ctx: Ctx, dir: Dir, confirmed: boolean): number {
  const pos = hero(ctx).c.pos;
  if (!pos) return 0;
  const level = getLevel(ctx.state, pos.level);
  const d = DIRS[dir];
  const x = pos.x + d.x;
  const y = pos.y + d.y;
  // "doors can be opened while levitating, so they must be reachable for bracing purposes"
  if (levitating(ctx)) {
    const xx = pos.x - d.x;
    const yy = pos.y - d.y;
    if (inBounds(level, xx, yy)) {
      const id = terrainIdAt(level, xx, yy);
      if (!isObstructedId(id) && (id === undefined || ctx.defs.terrain(id).door === undefined)) {
        say(ctx, 'kick.no_brace');
        return 0;
      }
    }
  }
  // KMH -- Kicking boots always succeed
  const a = attr(ctx);
  const avrg =
    uarmf(ctx)?.def === KICKING_BOOTS ? 99 : Math.trunc((acurrstr(a.str) + a.dex + a.con) / 3);

  const mtmp = inBounds(level, x, y) ? monsterIdAt(ctx, { x, y }, pos.level) : null;
  if (mtmp !== null) {
    // ref: maybe_kick_monster(): attack_checks() and overexertion()
    if (!confirmed && needsAttackConfirm(ctx, mtmp)) {
      askReallyAttack(ctx, mtmp, KICK_ID, { step: 'confirm', dir });
      return 0;
    }
    gethungry(ctx);
    if (hero(ctx).c.helpless || ctx.state.gameOver) return NORMAL_SPEED;
  }

  wakeNearto(ctx, pos.x, pos.y, (hero(ctx).c.experience?.level ?? 1) * 20);
  if (!inBounds(level, x, y)) {
    kickOuch(ctx, x, y, 'nothing');
    return NORMAL_SPEED;
  }
  if (mtmp !== null) {
    kickMonster(ctx, mtmp, x, y);
    // ref: dokick(): "see comment in attack_checks()": an unseen monster that lives on and did
    // not evade the kick is remembered as `I`
    const m = ctx.state.entities[String(mtmp)];
    const mp = m?.c.pos;
    if (
      m?.c.monster &&
      mp &&
      !canSpotMon(ctx, m) &&
      mp.x === x &&
      mp.y === y &&
      !markedUnseen(ctx, x, y) &&
      !engulfingU(ctx, mtmp)
    )
      mapInvisible(ctx, x, y);
    return NORMAL_SPEED;
  }
  unmapInvisible(ctx, x, y); // ref: dokick(): nothing there
  // monsters, pools, objects, non-doors, doors -- in that order
  const pile = itemsAt(ctx.defs, ctx.state, level.id, x, y);
  const top = pile[0];
  // floating, only a boulder's top is in reach (`!Levitation || sobj_at(BOULDER, x, y)`)
  if (top && (!levitating(ctx) || pile.some((e) => e.def === BOULDER))) {
    // kickstr(): killer_xname() of the top object; only a boulder gets its own name here
    if (!reallyKickObject(ctx, top, x, y, dir))
      kickOuch(ctx, x, y, top.def === BOULDER ? 'boulder' : 'object');
    return NORMAL_SPEED;
  }
  if (terrainAt(ctx, x, y).door !== undefined) kickDoor(ctx, x, y, avrg);
  else kickNondoor(ctx, x, y, avrg);
  return NORMAL_SPEED;
}

/** getdir(): an impaired hero kicks in a random direction. ref: src/cmd.c getdir() -> confdir() */
const getdirKick = (ctx: Ctx, dir: Dir): number => kickDir(ctx, getdirImpaired(ctx, dir), false);

const dirArg = (action: PlayerAction): Dir | null => {
  if (action.type !== 'mod') return null;
  const a = action.args as { dir?: unknown } | undefined;
  return DIR_LIST.find((d) => d === a?.dir) ?? null;
};

// ref: src/dokick.c dokick(), the #kick command (^D)
const kick: ActionDef = {
  id: KICK_ID,
  labelKey: 'action.nh:kick',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind === 'self')
      return [{ action: { type: 'mod', action: KICK_ID }, labelKey: 'action.nh:kick' }];
    if (target.kind !== 'cell') return [];
    const pos = hero(ctx).c.pos;
    if (!pos) return [];
    const dx = target.pos.x - pos.x;
    const dy = target.pos.y - pos.y;
    const dir = DIR_LIST.find((k) => DIRS[k].x === dx && DIRS[k].y === dy);
    if (!dir) return [];
    // a closed (or locked: it looks the same) door the hero knows of
    if (ctx.query.describe(target.pos).terrain !== T.door_closed) return [];
    return [
      {
        action: { type: 'mod', action: KICK_ID, args: { dir } },
        labelKey: 'action.nh:kick_door',
      },
    ];
  },
  perform(ctx, action) {
    if (!canKick(ctx)) return 0;
    const dir = dirArg(action);
    if (dir) return getdirKick(ctx, dir);
    ctx.ask(
      {
        id: 'kick-direction',
        kind: 'direction',
        key: 'kick.direction',
        options: DIRECTION_OPTIONS,
      },
      KICK_ID,
      { step: 'dir' },
    );
    return 0;
  },
  answer(ctx, value: Json, raw: Json) {
    const step = (raw as { step?: unknown } | null)?.step;
    if (step === 'confirm') {
      const dir = DIR_LIST.find((d) => d === (raw as { dir?: unknown }).dir);
      // declining the query costs nothing (context.move = 0)
      return value === true && dir ? kickDir(ctx, dir, true) : 0;
    }
    const dir = DIR_LIST.find((d) => d === value);
    if (!dir) return 0; // cancelled (ECMD_CANCEL)
    return getdirKick(ctx, dir);
  },
};

export const KICK_ACTIONS: readonly ActionDef[] = [kick];

/** Heals the leg's encumbrance message once the timer has run out (src/do.c heal_legs()). */
export function registerKick(api: ModApi): void {
  api.on('endOfTurn', (ctx) => {
    const d = nhData(ctx) as unknown as { legsHurt?: boolean };
    if (d.legsHurt && !hasProp(hero(ctx), P.WOUNDED_LEGS)) {
      d.legsHurt = false;
      encumberMsg(ctx);
    }
  });
}
