// How a pet moves: hunger, eating, fetching, choosing a goal, fighting other monsters.
// ref: src/dogmove.c dog_move(), dog_goal(), dog_invent(), dog_eat(), dog_nutrition(),
// dog_hunger(), dog_starve(), can_reach_location(); src/mhitm.c max_passive_dmg()
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  isVisible,
  itemsAt,
  trapAt,
  type Ctx,
  type Entity,
  type EntityId,
  type Level,
  type Pos,
} from '@nh/core';
import {
  ACCFOOD,
  APPORT,
  CADAVER,
  DOGFOOD,
  MANFOOD,
  UNDEF,
  dogfood,
  edogOf,
  ensureEdog,
  meating,
  setMeating,
  type Edog,
} from './dog';
import { addToInventory, splitStack } from './items';
import { M_ATTK, mattackm, mondied } from './mhitm';
import { fleeTime, halveFleeTime, isFleeing } from './monflee';
import { canCarry, minvent, relobj } from './mongear';
import { MTSZ, clearPath, dist2, getTrack, mfndpos, trackAdd, type Candidate } from './monmove';
import { mintrap, trapRemovedMon } from './trap';
import { doname } from './objnam';
import { canSpotMon, monNam } from './perception';
import { P, heroHas } from './props';
import { isFrozen, isMStunned } from './mstate';
import { stopOccupation } from './eat';

const DOG_WEAK = 500;
const DOG_STARVE = 750;
const SQSRCHRADIUS = 5;

export type DogMoveStatus = 'moved' | 'nothing' | 'done' | 'died';

const say = (ctx: Ctx, key: string, params?: Record<string, string>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const helpless = (ctx: Ctx, mon: Entity): boolean =>
  mon.c.monster?.asleep === true || isFrozen(ctx, mon.id);

/** The pet's carried things that it may drop (not worn or wielded). ref: droppables() */
const droppables = (ctx: Ctx, id: EntityId): Entity[] =>
  minvent(ctx, id).filter((o) => o.c.item?.equipped === null);

/** ref: src/dogmove.c dog_nutrition(): nutrition of the food, and how long it takes to eat */
function dogNutrition(ctx: Ctx, mon: Entity, obj: Entity): number {
  const mdef = ctx.defs.monster(mon.def);
  const odef = ctx.defs.object(obj.def);
  let nutrit: number;
  let time: number;
  let full: number;
  if (odef.class === 'food') {
    const corpse = obj.c.item?.corpseOf;
    if (obj.def === 'nh:corpse' && corpse && ctx.defs.isMonster(corpse)) {
      const cdef = ctx.defs.monster(corpse);
      time = 3 + (cdef.weight >> 6);
      nutrit = cdef.nutrition;
    } else {
      time = odef.delay;
      nutrit = odef.food?.nutrition ?? 0;
    }
    full = nutrit;
    const mult = { tiny: 8, small: 6, medium: 5, large: 4, huge: 3, gigantic: 2 }[mdef.size];
    nutrit *= mult;
    const eaten = obj.c.item?.eaten;
    if (eaten !== undefined && full > 0) {
      // ref: eaten_stat(): scale by how much is left
      const scale = (n: number): number => Math.max(1, Math.trunc((n * eaten) / full));
      time = scale(time);
      nutrit = scale(nutrit);
    }
  } else if (odef.class === 'coin') {
    const q = obj.c.item?.quantity ?? 1;
    time = Math.trunc(q / 2000) + 1;
    nutrit = Math.trunc(q / 20);
  } else {
    time = Math.trunc(odef.weight / 20) + 1;
    nutrit = 5 * (odef.food?.nutrition ?? 0);
  }
  setMeating(ctx, mon.id, time);
  return nutrit;
}

/**
 * The pet eats `obj` (on its square): hunger, tameness and the message. Returns 'died' if it
 * died. ref: src/dogmove.c dog_eat(). Not ported: shop costs, rust monsters, royal jelly, the
 * corpse's effects on the pet (mon_givit).
 */
export function dogEat(
  ctx: Ctx,
  id: EntityId,
  objIn: Entity,
  from: Pos,
  devour: boolean,
): 'ate' | 'died' {
  const mon = ctx.state.entities[String(id)];
  const e = edogOf(ctx, id);
  if (!mon?.c.monster || !e) return 'ate';
  const now = ctx.state.turn;
  if (e.hungrytime < now) e.hungrytime = now;
  let nutrit = dogNutrition(ctx, mon, objIn);
  if (devour) {
    const t = meating(ctx, id);
    if (t > 1) setMeating(ctx, id, Math.trunc(t / 2));
    if (nutrit > 1) nutrit = Math.trunc((nutrit * 3) / 4);
  }
  e.hungrytime += nutrit;
  if (e.mhpmaxPenalty) {
    // no longer starving
    const hp = mon.c.hp;
    if (hp) hp.max += e.mhpmaxPenalty;
    e.mhpmaxPenalty = 0;
  }
  if (isFleeing(ctx, id) && fleeTime(ctx, id) > 1) halveFleeTime(ctx, id); // mfleetim /= 2
  const m = mon.c.monster;
  if ((m.tame ?? 0) < 20) m.tame = (m.tame ?? 0) + 1;
  // food items are eaten one at a time
  let obj = objIn;
  const odef = ctx.defs.object(obj.def);
  if ((obj.c.item?.quantity ?? 1) > 1 && odef.class === 'food') {
    const one = ctx.state.entities[String(splitStack(ctx, obj.id, 1))];
    if (one) obj = one;
  }
  // observe the action if the pet or the food is in view
  const pos = mon.c.pos;
  const level = pos ? ctx.state.levels[pos.level] : undefined;
  const seeobj = !!pos && !!level && isVisible(ctx.state, cellIndex(level, pos.x, pos.y));
  const sawpet =
    !!level && isVisible(ctx.state, cellIndex(level, from.x, from.y)) && canSpotMon(ctx, mon);
  if (sawpet || (seeobj && canSpotMon(ctx, mon))) {
    say(ctx, devour ? 'dog.devours' : 'dog.eats', {
      mon: monNam(ctx, mon),
      item: doname(ctx.state, ctx.defs, obj) as never,
    });
  } else if (seeobj) {
    say(ctx, devour ? 'dog.it_devours' : 'dog.it_eats', {
      item: doname(ctx.state, ctx.defs, obj) as never,
    });
  }
  // a reward if it is DOGFOOD the hero dropped or threw (she had it: it has a letter)
  if (dogfood(ctx, mon, obj) === DOGFOOD && obj.c.item?.letter) {
    e.apport += Math.trunc(200 / (e.dropdist + now - e.droptime));
    if (e.apport <= 0) e.apport = 1;
  }
  ctx.remove(obj.id); // m_consume_obj()
  return ctx.state.entities[String(id)]?.c.monster ? 'ate' : 'died';
}

/** ref: src/dogmove.c dog_starve() */
function dogStarve(ctx: Ctx, mon: Entity): void {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (p && level && isVisible(ctx.state, cellIndex(level, p.x, p.y)))
    say(ctx, 'dog.starves', { mon: monNam(ctx, mon) });
  else say(ctx, heroHas(ctx.state, P.HALLUC) ? 'dog.feel_bummed' : 'dog.feel_sad');
  mondied(ctx, mon.id);
}

/**
 * Hunger: past DOG_WEAK a pet loses two thirds of its maximum HP; past DOG_STARVE it starves.
 * Returns true if it starved. ref: src/dogmove.c dog_hunger() (pets are never confused here)
 */
function dogHunger(ctx: Ctx, mon: Entity, e: Edog): boolean {
  const now = ctx.state.turn;
  if (now <= e.hungrytime + DOG_WEAK) return false;
  const def = ctx.defs.monster(mon.def);
  const hp = mon.c.hp;
  if (!def.flags.some((f) => f === 'carnivore' || f === 'herbivore' || f === 'omnivore')) {
    e.hungrytime = now + DOG_WEAK;
  } else if (!e.mhpmaxPenalty && hp) {
    const newmax = Math.trunc(hp.max / 3);
    e.mhpmaxPenalty = hp.max - newmax;
    hp.max = newmax;
    if (hp.cur > hp.max) hp.cur = hp.max;
    if (hp.cur < 1) {
      dogStarve(ctx, mon);
      return true;
    }
    const p = mon.c.pos;
    const level = p ? ctx.state.levels[p.level] : undefined;
    if (p && level && isVisible(ctx.state, cellIndex(level, p.x, p.y)))
      say(ctx, 'dog.confused_hunger', { mon: monNam(ctx, mon) });
    else say(ctx, 'dog.worried', { mon: `@${mon.def}` });
    stopOccupation(ctx);
  } else if (now > e.hungrytime + DOG_STARVE || (hp && hp.cur < 1)) {
    dogStarve(ctx, mon);
    return true;
  }
  return false;
}

/**
 * Whether the square can be walked to, square by square, always getting closer.
 * ref: src/dogmove.c can_reach_location() (no water, lava, boulders or digging here)
 */
function canReachLocation(
  level: Level,
  ctx: Ctx,
  mx: number,
  my: number,
  fx: number,
  fy: number,
): boolean {
  if (mx === fx && my === fy) return true;
  if (!inBounds(level, mx, my)) return false;
  const rules = cellRules(level, ctx.defs);
  const dist = dist2(mx, my, fx, fy);
  for (let i = mx - 1; i <= mx + 1; i++)
    for (let j = my - 1; j <= my + 1; j++) {
      if (!inBounds(level, i, j)) continue;
      if (dist2(i, j, fx, fy) >= dist) continue;
      const t = level.cells[cellIndex(level, i, j)] ?? 0;
      if (!rules.passable[t] && !rules.closedDoor[t]) continue; // IS_OBSTRUCTED
      if (rules.closedDoor[t]) continue; // closed or locked door
      if (canReachLocation(level, ctx, i, j, fx, fy)) return true;
    }
  return false;
}

/**
 * Drop what it carries (near the hero), or eat or pick up what lies here. Returns 1 if it ate
 * (that is its move), 2 if it died. ref: src/dogmove.c dog_invent()
 */
function dogInvent(ctx: Ctx, mon: Entity, e: Edog, udist: number): 0 | 1 | 2 {
  if (helpless(ctx, mon) || meating(ctx, mon.id)) return 0;
  const pos = mon.c.pos;
  if (!pos) return 0;
  if (droppables(ctx, mon.id).length > 0) {
    if (ctx.rng.rn2(udist + 1) === 0 || ctx.rng.rn2(e.apport) === 0)
      if (ctx.rng.rn2(10) < e.apport) {
        relobj(ctx, mon.id);
        if (e.apport > 1) e.apport--;
        e.dropdist = udist;
        e.droptime = ctx.state.turn;
      }
    return 0;
  }
  const obj = itemsAt(ctx.defs, ctx.state, pos.level, pos.x, pos.y)[0];
  if (!obj || obj.def === 'nh:boulder' || obj.def === 'nh:statue') return 0;
  const edible = dogfood(ctx, mon, obj);
  if (edible <= CADAVER || (e.mhpmaxPenalty && edible === ACCFOOD))
    return dogEat(ctx, mon.id, obj, pos, false) === 'died' ? 2 : 1;
  const carryamt = canCarry(ctx, mon.id, obj);
  if (carryamt > 0 && obj.c.item?.buc !== 'cursed') {
    if (ctx.rng.rn2(20) < e.apport + 3) {
      if (ctx.rng.rn2(udist) !== 0 || ctx.rng.rn2(e.apport) === 0) {
        let take = obj.id;
        if (carryamt !== (obj.c.item?.quantity ?? 1)) take = splitStack(ctx, obj.id, carryamt);
        const level = ctx.state.levels[pos.level];
        const shown = ctx.state.entities[String(take)];
        if (level && shown && isVisible(ctx.state, cellIndex(level, pos.x, pos.y)))
          say(ctx, 'mon.picks_up', {
            mon: monNam(ctx, mon),
            item: doname(ctx.state, ctx.defs, shown) as never,
          });
        addToInventory(ctx, mon.id, take);
      }
    }
  }
  return 0;
}

/** Whether the hero is on a "room" square (not a corridor or doorway). ref: IS_ROOM() */
function heroInRoom(ctx: Ctx, level: Level, hp: Pos): boolean {
  const id = level.palette[level.cells[cellIndex(level, hp.x, hp.y)] ?? 0];
  if (!id) return false;
  const t = ctx.defs.terrain(id);
  return t.passable && t.door === undefined && id !== 'nh:corridor';
}

/**
 * Where the pet wants to go, and whether to approach (1), keep away (-1) or wander (0) toward
 * it; -2 means stay. ref: src/dogmove.c dog_goal(). Not ported: the hero's trail (gettrack)
 * and the "want a door" search when the hero is out of sight (the pet heads for her, or its
 * previous goal), leashes, magic portals.
 */
function dogGoal(
  ctx: Ctx,
  mon: Entity,
  e: Edog,
  udist: number,
  whappr: boolean,
  goal: Pos,
): number {
  const pos = mon.c.pos as Pos & { level: string };
  const level = getLevel(ctx.state, pos.level);
  const rules = cellRules(level, ctx.defs);
  const hero = getPlayer(ctx.state);
  const hp = hero.c.pos as Pos;
  const omx = pos.x;
  const omy = pos.y;
  const inMastersSight = clearPath(level, rules.opaque, hp.x, hp.y, omx, omy);
  const hasMinvent = droppables(ctx, mon.id).length > 0;
  let gtyp = UNDEF;
  let gx = 0;
  let gy = 0;
  const ddist = (x: number, y: number): number => dist2(x, y, omx, omy);
  const minX = Math.max(1, omx - SQSRCHRADIUS);
  const maxX = Math.min(level.width - 1, omx + SQSRCHRADIUS);
  const minY = Math.max(0, omy - SQSRCHRADIUS);
  const maxY = Math.min(level.height - 1, omy + SQSRCHRADIUS);
  // nearby food is the first choice, then other objects (fobj order: newest first)
  const floor = Object.values(ctx.state.entities)
    .filter((o) => o.c.item && o.c.pos?.level === pos.level)
    .sort((a, b) => (b.c.item?.placed ?? 0) - (a.c.item?.placed ?? 0) || b.id - a.id);
  for (const obj of floor) {
    const op = obj.c.pos as Pos;
    const nx = op.x;
    const ny = op.y;
    if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
    const otyp = dogfood(ctx, mon, obj);
    if (otyp > gtyp || otyp === UNDEF) continue;
    // avoid cursed items unless starving
    const cursedHere = itemsAt(ctx.defs, ctx.state, pos.level, nx, ny).some(
      (o) => o.c.item?.buc === 'cursed',
    );
    if (cursedHere && !(e.mhpmaxPenalty && otyp < MANFOOD)) continue;
    if (!canReachLocation(level, ctx, omx, omy, nx, ny)) continue;
    if (otyp < MANFOOD) {
      if (otyp < gtyp || ddist(nx, ny) < ddist(gx, gy)) {
        gx = nx;
        gy = ny;
        gtyp = otyp;
      }
    } else if (
      gtyp === UNDEF &&
      inMastersSight &&
      !hasMinvent &&
      (!level.lit[cellIndex(level, omx, omy)] || level.lit[cellIndex(level, hp.x, hp.y)]) &&
      (otyp === MANFOOD || clearPath(level, rules.opaque, omx, omy, nx, ny)) &&
      e.apport > ctx.rng.rn2(8) &&
      canCarry(ctx, mon.id, obj) > 0
    ) {
      gx = nx;
      gy = ny;
      gtyp = APPORT;
    }
  }

  let appr: number;
  // follow the hero if appropriate
  if (gtyp === UNDEF || (gtyp !== DOGFOOD && gtyp !== APPORT && ctx.state.turn < e.hungrytime)) {
    gx = hp.x;
    gy = hp.y;
    appr = udist >= 9 ? 1 : isFleeing(ctx, mon.id) ? -1 : 0;
    if (udist > 1) {
      if (
        !heroInRoom(ctx, level, hp) ||
        ctx.rng.rn2(4) === 0 ||
        whappr ||
        (hasMinvent && ctx.rng.rn2(e.apport) !== 0)
      )
        appr = 1;
    }
    // if the hero has dog food (or stands on stairs) it follows more closely
    if (appr === 0) {
      const here = level.palette[level.cells[cellIndex(level, hp.x, hp.y)] ?? 0];
      if (here && ctx.defs.terrain(here).stairs !== undefined) appr = 1;
      else {
        for (const o of Object.values(ctx.state.entities))
          if (o.c.item?.carriedBy === hero.id && dogfood(ctx, mon, o) === DOGFOOD) {
            appr = 1;
            break;
          }
      }
    }
  } else appr = 1;
  if (isMStunned(ctx, mon.id)) appr = 0;

  if (gx === hp.x && gy === hp.y && !inMastersSight) {
    // no trail to follow: reuse the previous goal once, else head for the hero
    if (e.ogoal[0] > 0 && (e.ogoal[0] !== omx || e.ogoal[1] !== omy)) {
      gx = e.ogoal[0];
      gy = e.ogoal[1];
      e.ogoal = [0, 0];
    } else e.ogoal = [hp.x, hp.y];
  } else e.ogoal = [0, e.ogoal[1]];
  goal.x = gx;
  goal.y = gy;
  return appr;
}

/**
 * The most passive damage the pet could take for attacking `mdef` once with all its attacks.
 * ref: src/mhitm.c max_passive_dmg()
 */
function maxPassiveDmg(ctx: Ctx, mdef: Entity, magr: Entity): number {
  const adef = ctx.defs.monster(magr.def);
  const ddef = ctx.defs.monster(mdef.def);
  const multi2 = adef.attacks.filter((a) =>
    [
      'claw',
      'bite',
      'kick',
      'butt',
      'touch',
      'sting',
      'hug',
      'engulf',
      'tentacle',
      'weapon',
    ].includes(a.at),
  ).length;
  let dmg = 0;
  for (const a of ddef.attacks) {
    if (a.at !== 'passive' && a.at !== 'boom') continue;
    const r = (mr: string): boolean => adef.resists.includes(mr);
    if (
      (a.ad === 'acid' && !r('acid')) ||
      (a.ad === 'cold' && !r('cold')) ||
      (a.ad === 'fire' && !r('fire')) ||
      (a.ad === 'elec' && !r('elec')) ||
      a.ad === 'phys'
    ) {
      dmg = a.n || (mdef.c.monster?.level ?? ddef.level) + 1;
      dmg *= a.d;
    } else dmg = 0;
    break;
  }
  return dmg * multi2;
}

/**
 * The pet's move. ref: src/dogmove.c dog_move(). Not ported: Conflict, leashes, whistles,
 * displacing other monsters, kicked-square and Sokoban avoidance, traps, ranged attacks,
 * long worms, minions; a target's "has it already moved this turn" check (mlstmv) is skipped
 * for the return attack.
 */
export function dogMove(ctx: Ctx, id: EntityId): DogMoveStatus {
  const mon = ctx.state.entities[String(id)];
  const pos = mon?.c.pos;
  const hero = getPlayer(ctx.state);
  const hp = hero.c.pos;
  if (!mon?.c.monster || !pos || !hp) return 'nothing';
  const e = ensureEdog(ctx, id);
  const omx = pos.x;
  const omy = pos.y;
  if (dogHunger(ctx, mon, e)) return 'died';
  const udist = dist2(omx, omy, hp.x, hp.y);
  if (!udist) return 'nothing';

  let nix = omx;
  let niy = omy;
  let chi = -1; // index of the chosen square
  let doEat: Entity | null = null;
  const level = getLevel(ctx.state, pos.level);
  const cursemsg = new Set<number>();

  const j0 = dogInvent(ctx, mon, e, udist);
  if (j0 === 2) return 'died';
  const eating = j0 === 1;
  const goal: Pos = { x: 0, y: 0 };
  if (!eating) {
    const whappr = ctx.state.turn - e.whistletime < 5;
    const appr = dogGoal(ctx, mon, e, udist, whappr, goal);
    if (appr === -2) return 'nothing';
    const rules = cellRules(level, ctx.defs);
    const cands = mfndpos(ctx, level, rules, id, hp, { allowM: true, allowTraps: true });
    const cnt = cands.length;
    const cursedAt = (x: number, y: number): boolean =>
      itemsAt(ctx.defs, ctx.state, pos.level, x, y).some((o) => o.c.item?.buc === 'cursed');
    let uncursedcnt = 0;
    for (const c of cands) if (c.mon === undefined && !cursedAt(c.x, c.y)) uncursedcnt++;
    let chcnt = 0;
    const gdist = (x: number, y: number): number => dist2(x, y, goal.x, goal.y);
    let nidist = gdist(nix, niy);
    const track = getTrack(ctx, id);
    const mhp = mon.c.hp ?? { cur: 1, max: 1 };
    for (let i = 0; i < cnt; i++) {
      const c = cands[i] as Candidate;
      const nx = c.x;
      const ny = c.y;
      if (c.mon !== undefined) {
        const mtmp2 = ctx.state.entities[String(c.mon)];
        const m2 = mtmp2?.c.monster;
        if (!mtmp2 || !m2) continue;
        // the pet's audacity: it balks at foes its level or more above its health allows
        const balk = (mon.c.monster.level ?? 0) + Math.trunc((5 * mhp.cur) / mhp.max) - 2;
        if (
          m2.level >= balk ||
          (m2.tame ?? 0) > 0 ||
          maxPassiveDmg(ctx, mtmp2, mon) >= mhp.cur ||
          (mhp.cur * 4 < mhp.max && m2.peaceful)
        )
          continue;
        if (mtmp2.def === 'nh:floating_eye' && ctx.rng.rn2(10) !== 0) continue;
        const mstatus = mattackm(ctx, id, mtmp2.id);
        if (mstatus & M_ATTK.AGR_DIED) return 'died';
        if (
          (mstatus & (M_ATTK.HIT | M_ATTK.DEF_DIED)) === M_ATTK.HIT &&
          ctx.rng.rn2(4) !== 0 &&
          ctx.state.entities[String(id)]?.c.monster
        ) {
          const back = mattackm(ctx, mtmp2.id, id); // return attack
          if (back & M_ATTK.DEF_DIED) return 'died';
        }
        return 'done';
      }
      // ref: dog_move(): "Dog avoids harmful traps, but perhaps it has to pass one in order to
      // follow player." It avoids only traps the hero has seen, and 1 time in 40 steps on anyway.
      if (c.trap) {
        const trap = trapAt(level, nx, ny);
        if (trap?.seen && ctx.rng.rn2(40) !== 0) continue;
      }
      // the dog eschews cursed objects, but likes dog food
      let food: Entity | null = null;
      for (const obj of itemsAt(ctx.defs, ctx.state, pos.level, nx, ny)) {
        if (obj.c.item?.buc === 'cursed') cursemsg.add(i);
        else {
          const otyp = dogfood(ctx, mon, obj);
          if (otyp < MANFOOD && (otyp < ACCFOOD || e.hungrytime <= ctx.state.turn)) {
            food = obj;
            break;
          }
        }
      }
      if (food) {
        nix = nx;
        niy = ny;
        chi = i;
        doEat = food;
        cursemsg.delete(i);
        break;
      }
      // didn't find something to eat; usually keep looking rather than step on a cursed item
      if (cursemsg.has(i) && uncursedcnt > 0 && ctx.rng.rn2(13 * uncursedcnt) !== 0) continue;
      // lessen the chance of backtracking when far from the hero
      if (Math.max(Math.abs(omx - hp.x), Math.abs(omy - hp.y)) > 5) {
        const k = uncursedcnt;
        let skip = false;
        for (let j = 0; j < MTSZ && j < k - 1 && !skip; j++)
          if (nx === track[2 * j] && ny === track[2 * j + 1] && ctx.rng.rn2(MTSZ * (k - j)) !== 0)
            skip = true;
        if (skip) continue;
      }
      const ndist = gdist(nx, ny);
      const j = (ndist - nidist) * appr;
      if (
        (j === 0 && ctx.rng.rn2(++chcnt) === 0) ||
        j < 0 ||
        (j > 0 &&
          !whappr &&
          ((omx === nix && omy === niy && ctx.rng.rn2(3) === 0) || ctx.rng.rn2(12) === 0))
      ) {
        nix = nx;
        niy = ny;
        nidist = ndist;
        if (j < 0) chcnt = 0;
        chi = i;
      }
    }
  }

  // newdogpos:
  if ((nix !== omx || niy !== omy) && chi >= 0) {
    const wasseen = canSpotMon(ctx, mon);
    const from = { x: omx, y: omy };
    pos.x = nix;
    pos.y = niy;
    ctx.emit({ type: 'moved', id, from, to: { x: nix, y: niy } });
    if (cursemsg.has(chi) && (wasseen || canSpotMon(ctx, mon))) {
      const top = itemsAt(ctx.defs, ctx.state, pos.level, nix, niy)[0];
      say(ctx, 'dog.reluctantly', {
        mon: monNam(ctx, mon),
        item: top ? (doname(ctx.state, ctx.defs, top) as never) : '@dog.something',
      });
    }
    trackAdd(ctx, id, omx, omy);
    if (doEat && dogEat(ctx, id, doEat, from, false) === 'died') return 'died';
    // ref: m_move() postmov: mintrap() for the pet's new square
    if (trapRemovedMon(mintrap(ctx, id))) return 'died';
  }
  return 'moved';
}
