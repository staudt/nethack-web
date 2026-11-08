// #untrap: disarming a seen trap under the hero or next to her (arrow and dart traps give up
// their ammunition, bear traps and land mines become objects), helping a trapped monster out of
// a pit or a bear trap, checking the boxes at her feet and an adjacent door for traps. Failing
// may set the trap off.
// ref: src/trap.c dountrap(), could_untrap(), untrap_prob(), cnv_trap_obj(), into_vs_onto(),
// move_into_trap(), try_disarm(), reward_untrap(), disarm_holdingtrap(), disarm_landmine(),
// disarm_squeaky_board(), disarm_shooting_trap(), try_lift(), help_monster_out(), disarm_box(),
// untrap_box(), untrap()
//
// Not ported (see DEVIATIONS.md): webs (no web traps), oil and grease for squeaky boards (neither
// object exists), the Master Key of Thievery, mimics, cockatrices, steeds, polymorphed forms,
// Fumbling, selling or burying the object of a trap she set (she sets none), exercise. A shop
// door she blows up is scheduled for repair, free (C: "probably ought to charge for this").
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  cellIndex,
  cellRules,
  checkStep,
  getLevel,
  getPlayer,
  inBounds,
  inventoryOf,
  rnl,
  trapAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type Msg,
  type Offer,
  type PromptOption,
  type Trap,
} from '@nh/core';
import { WT_TOOMUCH_DIAGONAL, badRock } from './actions';
import { boulderAt } from './boulder';
import {
  boxTknown,
  doorTrapped,
  isBoxTrapped,
  setBoxTknown,
  setBoxTrapped,
  setDoorTrapped,
} from './btrapstate';
import { bTrapped, blowDoor } from './btrapped';
import { killedByHero } from './buzz';
import { chestTrap } from './chesttrap';
import { monsterIdAt } from './combat';
import { abuseDog } from './dog';
import { fillPit } from './flooreffects';
import { ustuck } from './hackmove';
import { gainExperience } from './hero';
import { lookHere } from './itemactions';
import { floorBoxes } from './lock';
import { A_LAWFUL } from './aligntyp';
import { adjalign, luckOf, uState } from './luck';
import { checkCapacity } from './magic';
import { isWeaponOrWeptool } from './material';
import { frozenTime, isFrozen, unfreezeMonst } from './mstate';
import { doname, xnameOf } from './objnam';
import { monNam } from './perception';
import { P, hasProp } from './props';
import { checkSpecialRoom } from './rooms';
import { helpless } from './shk';
import { calcCapacity, invWeight, weightCap } from './stats';
import { T } from './terrain';
import { TRAP, dataOf, deltrap, dotrap } from './trap';
import { isMtrapped, isPit, levitating, setMtrapped, setUtrap, utrap } from './trapstate';
import { mksobj, weight } from './items';

export const UNTRAP_ID: DefId = 'nh:untrap';

/** The objects a disarmed trap leaves. ref: include/objects.h BEARTRAP, LAND_MINE, ARROW, DART */
export const BEARTRAP: DefId = 'nh:beartrap';
export const LAND_MINE: DefId = 'nh:land_mine';

/** ref: include/hack.h HVY_ENCUMBER (Strained); include/global.h MAXULEV */
const HVY_ENCUMBER = 3;
const MAXULEV = 30;

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const trapName = (t: Trap): string => `@${t.def}`;

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);
function heroPos(ctx: Pick<Ctx, 'state'>): { level: string; x: number; y: number } {
  const p = hero(ctx).c.pos;
  if (!p) throw new Error('untrap: the hero has no position');
  return p;
}
const ulevel = (ctx: Pick<Ctx, 'state'>): number => hero(ctx).c.experience?.level ?? 1;
const roleIs = (ctx: Pick<Ctx, 'state'>, role: DefId): boolean => hero(ctx).c.player?.role === role;
/** ref: Confusion || Hallucination */
const confusedNow = (ctx: Pick<Ctx, 'state'>): boolean =>
  hasProp(hero(ctx), P.CONFUSION) || hasProp(hero(ctx), P.HALLUC);
/** level_difficulty() */
const levelDifficulty = (ctx: Pick<Ctx, 'state'>): number =>
  ctx.state.levels[heroPos(ctx).level]?.depth ?? 1;

/** the_your[ttmp->madeby_u] */
const whichOf = (t: Trap): Msg => ({ key: dataOf(t).madeby_u ? 'untrap.your' : 'untrap.the' });

function monAt(ctx: Ctx, levelId: string, x: number, y: number): Entity | null {
  const id = monsterIdAt(ctx, { x, y }, levelId);
  return id === null || id === ctx.state.playerId ? null : (ctx.state.entities[String(id)] ?? null);
}

/** ref: src/wield.c welded(uwep) && bimanual(uwep) (welded() reveals the curse) */
function weldedBimanual(ctx: Ctx): boolean {
  const w = inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === 'weapon');
  const def = w ? ctx.defs.object(w.def) : null;
  if (!w?.c.item || !def || w.c.item.buc !== 'cursed' || !isWeaponOrWeptool(def)) return false;
  w.c.item.known.buc = true;
  return def.weapon?.bimanual === true;
}

/**
 * The checks before untrapping: too strained, held by a monster or a welded two-handed weapon.
 * ref: src/trap.c could_untrap() (no polymorphed forms; the floor is checked by untrap())
 */
export function couldUntrap(ctx: Ctx, verbosely: boolean): boolean {
  let key: string | null = null;
  if (calcCapacity(ctx.state, ctx.defs, ctx.state.playerId) >= HVY_ENCUMBER)
    key = 'untrap.too_strained';
  else if (ustuck(ctx) !== null || weldedBimanual(ctx)) key = 'untrap.hands_busy';
  if (key === null) return true;
  if (verbosely) say(ctx, key);
  return false;
}

/**
 * Whether disarming fails: 0 is success. The chance is 1 in 3, worse while confused,
 * hallucinating, blind or stunned, better for a trap she set. ref: src/trap.c untrap_prob()
 * (no webs, Fumbling or quest artifact; the Ranger and Rogue cases are kept for those roles)
 */
export function untrapProb(ctx: Ctx, t: Trap): number {
  let chance = 3;
  const h = hero(ctx);
  if (confusedNow(ctx)) chance++;
  if (hasProp(h, P.BLINDED)) chance++;
  if (hasProp(h, P.STUNNED)) chance += 2;
  // Your own traps are better known than others.
  if (dataOf(t).madeby_u) chance--;
  if (roleIs(ctx, 'nh:ranger') && t.def === TRAP.bear && chance <= 3) return 0;
  if (roleIs(ctx, 'nh:rogue')) {
    if (ctx.rng.rn2(2 * MAXULEV) < ulevel(ctx)) chance--;
  } else if (roleIs(ctx, 'nh:ranger') && chance > 1) chance--;
  if (chance < 1) chance = 1;
  return ctx.rng.rn2(chance);
}

/**
 * The trap becomes `cnt` objects on its square (merged into a pile there); whoever it held is
 * free. ref: src/trap.c cnv_trap_obj() (never buried; she sets no traps, so none is sold)
 */
export function cnvTrapObj(ctx: Ctx, levelId: string, t: Trap, otyp: DefId, cnt: number): void {
  mksobj(ctx, ctx.defs.object(otyp), { quantity: cnt, at: { level: levelId, x: t.x, y: t.y } });
  const p = heroPos(ctx);
  const u = utrap(ctx);
  if (u && p.level === levelId && p.x === t.x && p.y === t.y) setUtrap(ctx, 0, u.type);
  const mon = monAt(ctx, levelId, t.x, t.y);
  if (mon && isMtrapped(ctx, mon.id)) setMtrapped(ctx, mon.id, false);
  deltrap(ctx, levelId, t);
}

/** ref: src/trap.c into_vs_onto() (no magic portals or webs) */
const intoVsOnto = (def: DefId): boolean =>
  def === TRAP.bear ||
  isPit(def) ||
  def === TRAP.hole ||
  def === TRAP.tele ||
  def === TRAP.levelTele;

/**
 * "Whoops..." while disarming an adjacent trap: she moves onto it and sets it off (unless the
 * move is not possible: "Fortunately, you don't move onto it."). ref: src/trap.c move_into_trap()
 * (no ball and chain or steed)
 */
function moveIntoTrap(ctx: Ctx, level: Level, t: Trap): void {
  const h = hero(ctx);
  const pos = heroPos(ctx);
  const from = { x: pos.x, y: pos.y };
  const dir = DIR_LIST.find(
    (d) => DIRS[d].x === Math.sign(t.x - from.x) && DIRS[d].y === Math.sign(t.y - from.y),
  );
  if (!dir || !checkStep(level, cellRules(level, ctx.defs), from, dir).ok) {
    say(ctx, intoVsOnto(t.def) ? 'untrap.fortunately_into' : 'untrap.fortunately_onto');
    return;
  }
  h.c.pos = { level: pos.level, x: t.x, y: t.y }; // u_on_newpos()
  ctx.emit({ type: 'moved', id: h.id, from, to: { x: t.x, y: t.y } });
  checkSpecialRoom(ctx, false, from);
  // marking the trap unseen makes dotrap() treat it as a new discovery
  t.seen = false;
  // spoteffects(TRUE) with iflags.failing_untrap: dotrap(FAILEDUNTRAP) is forced
  if (isPit(t.def)) {
    dotrap(ctx, t, { force: true, from });
    if (!ctx.state.gameOver) lookHere(ctx);
  } else {
    lookHere(ctx);
    if (!ctx.state.gameOver) dotrap(ctx, t, { force: true, from });
  }
  const here = heroPos(ctx);
  const now = ctx.state.levels[here.level];
  const t2 = now ? trapAt(now, here.x, here.y) : undefined;
  if (t2) t2.seen = true;
}

/**
 * One try at disarming `t`: 0 when she does not even try (a monster or boulder in the way, out
 * of reach), 1 when she tries and fails ("Whoops..." sets it off 4 times in 5 with Luck 0, a
 * trapped monster takes the bear trap's bite instead), 2 when she succeeds.
 * ref: src/trap.c try_disarm() (no webs, steeds or polymorphed forms)
 */
function tryDisarm(
  ctx: Ctx,
  level: Level,
  t: Trap,
  forceFailure: boolean,
  here: boolean,
): 0 | 1 | 2 {
  const mon = monAt(ctx, level.id, t.x, t.y);
  const holdingtrap = t.def === TRAP.bear;
  // Test for monster first, monsters are displayed instead of trap.
  if (mon && (!isMtrapped(ctx, mon.id) || !holdingtrap)) {
    say(ctx, 'untrap.in_the_way', { mon: monNam(ctx, mon) });
    return 0;
  }
  // We might be forced to move onto the trap's location.
  if (boulderAt(ctx, level.id, t.x, t.y) && !here) {
    say(ctx, 'untrap.boulder_in_way');
    return 0;
  }
  // duplicate tight-space checks from test_move
  const p = heroPos(ctx);
  if (
    t.x !== p.x &&
    t.y !== p.y &&
    badRock(ctx, level, p.x, t.y) &&
    badRock(ctx, level, t.x, p.y)
  ) {
    const id = ctx.state.playerId;
    if (
      inventoryOf(ctx.state, id).length > 0 &&
      invWeight(ctx.state, ctx.defs, id) + weightCap(ctx.state, id) > WT_TOOMUCH_DIAGONAL
    ) {
      say(ctx, 'untrap.unable_to_reach', { trap: trapName(t) });
      return 0;
    }
  }
  // untrappable traps are located on the ground
  if (levitating(ctx)) {
    say(ctx, 'untrap.unable_to_reach', { trap: trapName(t) });
    return 0;
  }
  // Will our hero succeed?
  if (forceFailure || untrapProb(ctx, t)) {
    if (rnl(ctx.rng, 5, luckOf(ctx.state))) {
      say(ctx, 'untrap.whoops');
      if (mon) {
        // must be a trap that holds monsters
        if (mon.c.monster?.tame) abuseDog(ctx, mon.id);
        const hp = mon.c.hp;
        if (hp) {
          hp.cur -= ctx.rng.rnd(4);
          if (hp.cur <= 0) killedByHero(ctx, mon);
        }
      } else if (here) dotrap(ctx, t, { force: true });
      else moveIntoTrap(ctx, level, t);
    } else {
      say(ctx, 'untrap.difficult', {
        which: {
          key: dataOf(t).madeby_u
            ? 'untrap.which.your'
            : here
              ? 'untrap.which.this'
              : 'untrap.which.that',
        },
        trap: trapName(t),
      });
    }
    return 1;
  }
  return 2;
}

/**
 * A monster helped out of a trap may become peaceful ("The jackal is grateful."), and a lawful
 * hero may feel she did the right thing. ref: src/trap.c reward_untrap()
 */
export function rewardUntrap(ctx: Ctx, t: Trap, mon: Entity): void {
  if (dataOf(t).madeby_u) return;
  const m = mon.c.monster;
  const def = ctx.defs.monster(mon.def);
  if (
    rnl(ctx.rng, 10, luckOf(ctx.state)) < 8 &&
    m &&
    !m.peaceful &&
    !helpless(ctx, mon.id) &&
    !isFrozen(ctx, mon.id) &&
    !def.flags.includes('mindless') &&
    !def.genFlags.includes('uniq') &&
    def.glyph.ch !== '@'
  ) {
    m.peaceful = true; // (set_malign(): computed when it is needed)
    say(ctx, 'untrap.grateful', { mon: monNam(ctx, mon) });
  }
  // Helping someone out of a trap is a nice thing to do.
  // A lawful may be rewarded, but not too often.
  if (
    !ctx.rng.rn2(3) &&
    !rnl(ctx.rng, 8, luckOf(ctx.state)) &&
    uState(ctx.state).alignType === A_LAWFUL
  ) {
    adjalign(ctx, 1);
    say(ctx, 'untrap.right_thing');
  }
}

/**
 * A bear trap: a monster caught in it is extracted, else the trap becomes a beartrap object.
 * ref: src/trap.c disarm_holdingtrap() (no webs)
 */
function disarmHoldingtrap(ctx: Ctx, level: Level, t: Trap, here: boolean): number {
  const fails = tryDisarm(ctx, level, t, false, here);
  if (fails < 2) return fails;
  // ok, disarm it; untrap the monster, if any
  const mon = monAt(ctx, level.id, t.x, t.y);
  if (mon) {
    setMtrapped(ctx, mon.id, false);
    say(ctx, 'untrap.extract', { mon: monNam(ctx, mon), which: whichOf(t) });
    rewardUntrap(ctx, t, mon);
  } else {
    say(ctx, 'untrap.disarm_bear', { which: whichOf(t) });
    cnvTrapObj(ctx, level.id, t, BEARTRAP, 1);
  }
  return 1;
}

/** ref: src/trap.c disarm_landmine() */
function disarmLandmine(ctx: Ctx, level: Level, t: Trap, here: boolean): number {
  const fails = tryDisarm(ctx, level, t, false, here);
  if (fails < 2) return fails;
  say(ctx, 'untrap.disarm_landmine', { which: whichOf(t) });
  cnvTrapObj(ctx, level.id, t, LAND_MINE, 1);
  return 1;
}

/**
 * A squeaky board needs a can of grease or a potion of oil, and neither object exists: the
 * object prompt has nothing to offer. ref: src/trap.c disarm_squeaky_board(), unsqueak_ok()
 */
function disarmSqueakyBoard(ctx: Ctx): number {
  say(ctx, 'untrap.nothing_to_untrap_with');
  return 0;
}

/** Arrow and dart traps: `50 - rnl(50)` arrows or darts. ref: src/trap.c disarm_shooting_trap() */
function disarmShootingTrap(ctx: Ctx, level: Level, t: Trap, here: boolean, otyp: DefId): number {
  const fails = tryDisarm(ctx, level, t, false, here);
  if (fails < 2) return fails;
  say(ctx, 'untrap.disarm_trap', { which: whichOf(t) });
  cnvTrapObj(ctx, level.id, t, otyp, 50 - rnl(ctx.rng, 50, luckOf(ctx.state)));
  return 1;
}

/**
 * Whether she can lift the monster (`xtraWt`: its corpse weight, plus its inventory when
 * `stuff`). ref: src/trap.c try_lift()
 */
function tryLift(ctx: Ctx, mon: Entity, t: Trap, xtraWt: number, stuff: boolean): boolean {
  if (calcCapacity(ctx.state, ctx.defs, ctx.state.playerId, xtraWt) < HVY_ENCUMBER) return true;
  say(ctx, stuff ? 'untrap.carrying_too_much' : 'untrap.too_heavy', { mon: monNam(ctx, mon) });
  const m = mon.c.monster;
  const def = ctx.defs.monster(mon.def);
  if (
    !dataOf(t).madeby_u &&
    m &&
    !m.peaceful &&
    !isFrozen(ctx, mon.id) &&
    !def.flags.includes('mindless') &&
    def.glyph.ch !== '@' &&
    rnl(ctx.rng, 10, luckOf(ctx.state)) < 3
  ) {
    m.peaceful = true;
    say(ctx, 'untrap.nice_to_try', { mon: monNam(ctx, mon) });
  }
  return false;
}

/** ref: "Xyz awakens." / "Xyz stirs." */
function wakeHelped(ctx: Ctx, mon: Entity, stir: boolean): void {
  const m = mon.c.monster;
  if (!m) return;
  if (m.asleep) {
    m.asleep = false;
    say(ctx, 'untrap.awakens', { mon: monNam(ctx, mon) });
  } else if (stir) {
    const f = frozenTime(ctx, mon.id);
    // After such manhandling, perhaps the effect wears off
    if (f && !ctx.rng.rn2(f)) {
      unfreezeMonst(ctx, mon.id);
      say(ctx, 'untrap.stirs', { mon: monNam(ctx, mon) });
    }
  }
}

/**
 * Pulling a trapped monster out of a pit: it may back away, slip from her grasp or be too heavy;
 * then it is free and may be grateful. ref: src/trap.c help_monster_out() (no cockatrices exist)
 */
export function helpMonsterOut(ctx: Ctx, mon: Entity, t: Trap): number {
  if (!isMtrapped(ctx, mon.id)) {
    say(ctx, 'untrap.isnt_trapped', { mon: monNam(ctx, mon) });
    return 0;
  }
  // Do you have the necessary capacity to lift anything?
  if (checkCapacity(ctx)) return 1;
  // Will our hero succeed?
  const uprob = untrapProb(ctx, t);
  if (uprob && !helpless(ctx, mon.id)) {
    say(ctx, 'untrap.backs_away', { mon: monNam(ctx, mon) });
    return 1;
  }
  if (uprob) {
    say(ctx, 'untrap.no_grasp', { mon: monNam(ctx, mon) });
    wakeHelped(ctx, mon, false);
    return 1;
  }
  say(ctx, 'untrap.grab', { mon: monNam(ctx, mon) });
  wakeHelped(ctx, mon, true);
  // is the monster too heavy?
  let xtraWt = ctx.defs.monster(mon.def).weight;
  if (!tryLift(ctx, mon, t, xtraWt, false)) return 1;
  // monster without its inventory isn't too heavy; if it carries anything, include that
  // minvent weight and check again
  const minvent = inventoryOf(ctx.state, mon.id);
  if (minvent.length > 0) {
    for (const o of minvent) xtraWt += invItemWeight(ctx, o);
    if (!tryLift(ctx, mon, t, xtraWt, true)) return 1;
  }
  say(ctx, 'untrap.pull_out', { mon: monNam(ctx, mon) });
  setMtrapped(ctx, mon.id, false);
  rewardUntrap(ctx, t, mon);
  const p = mon.c.pos;
  if (p) fillPit(ctx, p.x, p.y);
  return 1;
}

/** obj->owt */
const invItemWeight = (ctx: Ctx, o: Entity): number => weight(ctx.defs, o, ctx.state);

// ---------------------------------------------------------------------------------------------
// boxes and doors

/**
 * Disarming a box known to be trapped: `rnd(75 + difficulty / 2) > Dex + level` (doubled for a
 * Rogue) or confusion sets it off. ref: src/trap.c disarm_box()
 */
function disarmBox(ctx: Ctx, box: Entity, force: boolean, confused: boolean): void {
  if (isBoxTrapped(ctx.state, box.id)) {
    let ch = (hero(ctx).c.attributes?.dex ?? 10) + ulevel(ctx); // ACURR(A_DEX) + u.ulevel
    if (roleIs(ctx, 'nh:rogue')) ch *= 2;
    if (!force && (confused || ctx.rng.rnd(75 + Math.trunc(levelDifficulty(ctx) / 2)) > ch)) {
      chestTrap(ctx, box, 'finger', true); // 'box' might be gone now
    } else {
      say(ctx, 'untrap.disarm_it');
      setBoxTrapped(ctx, box.id, false);
      setBoxTknown(ctx, box.id, true);
      gainExperience(ctx, ctx.state.playerId, 8); // more_experienced(8, 0), newexplevel()
    }
  } else {
    say(ctx, 'untrap.box_not_trapped', { box: xnameOf(ctx.state, ctx.defs, box) });
    setBoxTknown(ctx, box.id, true); // known not trapped
  }
}

/**
 * Checking a box for a trap: found (always when known, else `rn2(MAXULEV + 1 - level) < 10`),
 * then "Disarm it?". Returns the time taken now (0 while the question is open: its answer
 * takes the turn). ref: src/trap.c untrap_box()
 */
function untrapBox(ctx: Ctx, box: Entity, force: boolean, confused: boolean): number {
  const otrapped = isBoxTrapped(ctx.state, box.id);
  const tknown = boxTknown(ctx.state, box.id);
  if (tknown && !otrapped) {
    say(ctx, 'untrap.know_not_trapped', { box: xnameOf(ctx.state, ctx.defs, box) });
    return NORMAL_SPEED;
  }
  if (
    (otrapped && (force || (!confused && ctx.rng.rn2(MAXULEV + 1 - ulevel(ctx)) < 10))) ||
    (tknown && otrapped) ||
    (!force && confused && !ctx.rng.rn2(3))
  ) {
    // (dknown: boxes have no unidentified appearance)
    say(ctx, tknown ? 'untrap.theres_trap_on' : 'untrap.find_trap_on', {
      box: xnameOf(ctx.state, ctx.defs, box),
    });
    setBoxTknown(ctx, box.id, true);
    ask(
      ctx,
      { id: 'untrap-disarm', kind: 'yn', key: 'untrap.disarm_q', cancellable: true },
      {
        stage: 'boxdisarm',
        box: box.id,
      },
    );
    return 0;
  }
  say(ctx, 'untrap.no_traps_on', { box: xnameOf(ctx.state, ctx.defs, box) });
  return NORMAL_SPEED;
}

/**
 * The door at x,y: "You find a trap on the door!" (a trapped one is found when
 * `rn2(MAXULEV - level + 11) < 10`; confused, 1 in 3 she imagines one), then "Disarm it?".
 * ref: src/trap.c untrap() door part
 */
function untrapDoor(ctx: Ctx, level: Level, x: number, y: number, trapSkipped: boolean): number {
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
  const door = id !== undefined && ctx.defs.hasTerrain(id) ? ctx.defs.terrain(id).door : undefined;
  // a secret door is not a door (IS_DOOR is false for SDOOR)
  if (!door) {
    if (!trapSkipped) say(ctx, 'untrap.know_of_no_traps');
    return 0;
  }
  if (door === 'doorway') {
    // D_NODOOR and D_BROKEN: a doorway stands for both
    say(ctx, hasProp(hero(ctx), P.BLINDED) ? 'untrap.feel_no_door' : 'untrap.see_no_door');
    return 0;
  }
  if (door === 'open') {
    say(ctx, 'untrap.safely_open');
    return 0;
  }
  const confused = confusedNow(ctx);
  const force = false; // no Master Key of Thievery
  if (
    (doorTrapped(ctx, level.id, x, y) &&
      (force || (!confused && ctx.rng.rn2(MAXULEV - ulevel(ctx) + 11) < 10))) ||
    (!force && confused && !ctx.rng.rn2(3))
  ) {
    say(ctx, 'untrap.find_trap_door');
    ask(
      ctx,
      { id: 'untrap-door', kind: 'yn', key: 'untrap.disarm_q', cancellable: true },
      {
        stage: 'door',
        x,
        y,
      },
    );
    return 0;
  }
  say(ctx, 'untrap.no_traps_door');
  return NORMAL_SPEED;
}

/** "Disarm it?" answered for a door. ref: src/trap.c untrap() after `ynq("Disarm it?")` */
function disarmDoor(ctx: Ctx, x: number, y: number): number {
  const level = getLevel(ctx.state, heroPos(ctx).level);
  if (doorTrapped(ctx, level.id, x, y)) {
    const ch = 15 + (roleIs(ctx, 'nh:rogue') ? ulevel(ctx) * 3 : ulevel(ctx));
    if (confusedNow(ctx) || ctx.rng.rnd(75 + Math.trunc(levelDifficulty(ctx) / 2)) > ch) {
      say(ctx, 'untrap.set_it_off');
      blowDoor(ctx, level, x, y, 0); // D_NODOOR (probably ought to charge for this damage...)
      bTrapped(ctx, 'door'); // FINGER
    } else {
      say(ctx, 'untrap.disarm_it');
      setDoorTrapped(ctx, level.id, x, y, false);
      gainExperience(ctx, ctx.state.playerId, 8); // more_experienced(8, 0), newexplevel()
    }
  } else say(ctx, 'untrap.door_not_trapped');
  return NORMAL_SPEED;
}

// ---------------------------------------------------------------------------------------------
// untrap()

interface AskData {
  stage: 'dir' | 'floor' | 'box' | 'boxdisarm' | 'door';
  /** 'box': the boxes still to ask about, the current one first; 'boxdisarm': the box. */
  boxes?: EntityId[];
  box?: EntityId;
  trapSkipped?: boolean;
  x?: number;
  y?: number;
}

function ask(ctx: Ctx, prompt: Parameters<Ctx['ask']>[0], data: AskData): void {
  ctx.ask(prompt, UNTRAP_ID, data as unknown as Json);
}

const UNTRAP_DIRECTIONS: PromptOption[] = [
  ...DIR_LIST.map((d) => ({ value: d, key: `dir.${d}` })),
  { value: 'self', key: 'untrap.dir.here' },
];

/** Boxes at her feet she does not know to be safe. */
const uncheckedBoxes = (ctx: Ctx): Entity[] =>
  floorBoxes(ctx).filter((b) => !(boxTknown(ctx.state, b.id) && !isBoxTrapped(ctx.state, b.id)));

/**
 * The floor trap she chose to deal with (a seen one, here or next to her).
 * ref: src/trap.c untrap() `switch (ttmp->ttyp)`
 */
function floorTrap(ctx: Ctx, level: Level, t: Trap, here: boolean): number {
  if (utrap(ctx)) {
    say(ctx, here ? 'untrap.trapped_in_it' : 'untrap.trapped', { trap: trapName(t) });
    return NORMAL_SPEED;
  }
  // (mimics posing as furniture or objects do not exist)
  let r: number;
  switch (t.def) {
    case TRAP.bear:
      r = disarmHoldingtrap(ctx, level, t, here);
      break;
    case TRAP.landmine:
      r = disarmLandmine(ctx, level, t, here);
      break;
    case TRAP.squeaky:
      r = disarmSqueakyBoard(ctx);
      break;
    case TRAP.dart:
      r = disarmShootingTrap(ctx, level, t, here, 'nh:dart');
      break;
    case TRAP.arrow:
      r = disarmShootingTrap(ctx, level, t, here, 'nh:arrow');
      break;
    case TRAP.pit:
    case TRAP.spikedPit: {
      if (here) {
        say(ctx, 'untrap.edge_of_pit');
        return 0;
      }
      const mon = monAt(ctx, level.id, t.x, t.y);
      if (!mon) {
        say(ctx, 'untrap.try_filling');
        return 0;
      }
      r = helpMonsterOut(ctx, mon, t);
      break;
    }
    default:
      say(ctx, here ? 'untrap.cannot_disable_this' : 'untrap.cannot_disable_that');
      return 0;
  }
  return r ? NORMAL_SPEED : 0;
}

/** The boxes at her feet, one question each; then the door part. */
function askBoxes(ctx: Ctx, boxes: EntityId[], trapSkipped: boolean): number {
  const id = boxes[0];
  const box = id === undefined ? undefined : ctx.state.entities[String(id)];
  if (!box) {
    say(ctx, 'untrap.no_other_boxes');
    const p = heroPos(ctx);
    return untrapDoor(ctx, getLevel(ctx.state, p.level), p.x, p.y, trapSkipped);
  }
  const known = boxTknown(ctx.state, box.id) && isBoxTrapped(ctx.state, box.id);
  ask(
    ctx,
    known
      ? {
          id: 'untrap-box',
          kind: 'yn',
          key: 'untrap.disarm_this_q',
          params: { box: xnameOf(ctx.state, ctx.defs, box) },
          cancellable: true,
        }
      : {
          id: 'untrap-box',
          kind: 'yn',
          key: 'untrap.check_box_q',
          params: { box: doname(ctx.state, ctx.defs, box) },
          cancellable: true,
        },
    { stage: 'box', boxes, trapSkipped },
  );
  return 0;
}

/**
 * Untrapping in direction `dir` ('self': her own square). Returns the time taken now; a
 * question's answer takes it later. ref: src/trap.c untrap() (no magic key, autounlock, steed)
 */
export function untrap(ctx: Ctx, dir: Dir | 'self'): number {
  const p = heroPos(ctx);
  const d = dir === 'self' ? { x: 0, y: 0 } : DIRS[dir];
  const x = p.x + d.x;
  const y = p.y + d.y;
  const level = getLevel(ctx.state, p.level);
  if (!inBounds(level, x, y)) {
    say(ctx, 'untrap.beyond_grasp');
    return 0;
  }
  const raw = trapAt(level, x, y);
  const t = raw?.seen ? raw : undefined;
  const here = dir === 'self';
  // are there one or more containers here?
  const boxes = here ? uncheckedBoxes(ctx).map((b) => b.id) : [];
  const boxcnt = boxes.length;

  if (levitating(ctx)) {
    // !can_reach_floor()
    if (t || boxcnt) {
      const what = t
        ? boxcnt
          ? boxcnt > 1
            ? 'trap_boxes'
            : 'trap_box'
          : 'trap'
        : boxcnt > 1
          ? 'boxes'
          : 'box';
      say(ctx, `untrap.cant_reach.${what}`, {
        ...(t ? { trap: trapName(t) } : {}),
        where: { key: here ? 'untrap.here' : 'untrap.there' },
      });
    }
    return untrapDoor(ctx, level, x, y, t !== undefined);
  }
  if (t) {
    if (boxcnt) {
      if (isPit(t.def)) {
        say(ctx, utrap(ctx) ? 'untrap.cant_do_much_stuck' : 'untrap.cant_do_much_edge', {
          trap: trapName(t),
        });
        return askBoxes(ctx, boxes, true);
      }
      ask(
        ctx,
        {
          id: 'untrap-floor',
          kind: 'yn',
          key: boxcnt === 1 ? 'untrap.floor_q_box' : 'untrap.floor_q_boxes',
          params: { trap: trapName(t) },
          cancellable: true,
        },
        { stage: 'floor', boxes },
      );
      return 0;
    }
    return floorTrap(ctx, level, t, here);
  }
  if (boxcnt) return askBoxes(ctx, boxes, false);
  return untrapDoor(ctx, level, x, y, false);
}

/** The answers to the untrap questions. */
function answerUntrap(ctx: Ctx, value: Json, raw: Json): number {
  const data = raw as unknown as AskData;
  const p = heroPos(ctx);
  const level = getLevel(ctx.state, p.level);
  switch (data.stage) {
    case 'dir': {
      if (value === 'self') return untrap(ctx, 'self');
      const dir = DIR_LIST.find((d) => d === value);
      return dir ? untrap(ctx, dir) : 0;
    }
    case 'floor': {
      if (value === null) return 0; // 'q'
      if (value === true) {
        const t = trapAt(level, p.x, p.y);
        return t?.seen ? floorTrap(ctx, level, t, true) : 0;
      }
      return askBoxes(ctx, data.boxes ?? [], true); // 'n'
    }
    case 'box': {
      if (value === null) return 0; // 'q'
      const boxes = data.boxes ?? [];
      const id = boxes[0];
      const box = id === undefined ? undefined : ctx.state.entities[String(id)];
      if (value === true && box) {
        const confused = confusedNow(ctx);
        if (boxTknown(ctx.state, box.id) && isBoxTrapped(ctx.state, box.id)) {
          disarmBox(ctx, box, false, confused);
          return NORMAL_SPEED;
        }
        const r = untrapBox(ctx, box, false, confused);
        return r; // even for 'no' at the "Disarm it?" prompt (its answer takes the turn)
      }
      // 'n': next box
      return askBoxes(ctx, boxes.slice(1), data.trapSkipped === true);
    }
    case 'boxdisarm': {
      const box = data.box === undefined ? undefined : ctx.state.entities[String(data.box)];
      if (value === true && box) disarmBox(ctx, box, false, confusedNow(ctx));
      return NORMAL_SPEED;
    }
    case 'door':
      if (value !== true || data.x === undefined || data.y === undefined) return NORMAL_SPEED;
      return disarmDoor(ctx, data.x, data.y);
  }
  return 0;
}

// ---------------------------------------------------------------------------------------------
// the action

/** Whether anything near her could be untrapped: a seen trap, a box she has not cleared, a door. */
function somethingToUntrap(ctx: Ctx): boolean {
  const p = heroPos(ctx);
  if (uncheckedBoxes(ctx).length > 0) return true;
  for (const d of [{ x: 0, y: 0 }, ...DIR_LIST.map((k) => DIRS[k])]) {
    const pos = { x: p.x + d.x, y: p.y + d.y };
    if (ctx.query.trapAt(p.level, pos)) return true;
    if (d.x === 0 && d.y === 0) continue;
    if (ctx.query.describe(pos).terrain === T.door_closed) return true;
  }
  return false;
}

/**
 * #untrap. Offered on herself (the direction question, "here" included) while a seen trap, an
 * unchecked box or a closed door is within reach, and directly on an adjacent seen trap or
 * closed door. ref: src/trap.c dountrap()
 */
const untrapAct: ActionDef = {
  id: UNTRAP_ID,
  labelKey: 'action.nh:untrap',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind === 'self') {
      if (!somethingToUntrap(ctx)) return [];
      return [{ action: { type: 'mod', action: UNTRAP_ID }, labelKey: 'action.nh:untrap' }];
    }
    if (target.kind !== 'cell') return [];
    const p = heroPos(ctx);
    const dx = target.pos.x - p.x;
    const dy = target.pos.y - p.y;
    const dir = DIR_LIST.find((k) => DIRS[k].x === dx && DIRS[k].y === dy);
    if (!dir) return [];
    const t = ctx.query.trapAt(p.level, target.pos);
    if (t)
      return [
        {
          action: { type: 'mod', action: UNTRAP_ID, args: { dir } },
          labelKey: 'action.nh:untrap_trap',
          params: { trap: trapName(t) },
        },
      ];
    if (ctx.query.describe(target.pos).terrain === T.door_closed)
      return [
        {
          action: { type: 'mod', action: UNTRAP_ID, args: { dir } },
          labelKey: 'action.nh:untrap_door',
        },
      ];
    return [];
  },
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    if (!couldUntrap(ctx, true)) return 0;
    const raw = (action.args as { dir?: unknown } | undefined)?.dir;
    if (raw === 'self') return untrap(ctx, 'self');
    const dir = DIR_LIST.find((d) => d === raw);
    if (dir) return untrap(ctx, dir);
    ask(
      ctx,
      {
        id: 'untrap-direction',
        kind: 'direction',
        key: 'untrap.direction',
        options: UNTRAP_DIRECTIONS,
      },
      { stage: 'dir' },
    );
    return 0;
  },
  answer: answerUntrap,
};

export const UNTRAP_ACTIONS: readonly ActionDef[] = [untrapAct];
