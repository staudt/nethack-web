// Covetous monsters (the M3_WANTS* kinds: the demon princes and lords, the master lich and the
// arch-lich): each move, before anything else, they decide what to go for and teleport about the
// level for it. Badly hurt, one holes up on the stairs (its id's parity picks up or down) and
// heals out of the hero's sight; otherwise it harasses her, now and then teleporting next to her;
// one that wants an item (the Book of the Dead, the Bell, the Candelabrum, a quest artifact) she,
// the floor or another monster has goes for it. ref: src/wizard.c strategy(), tactics(), choose_stairs(),
// target_on(), which_arti(), mon_has_arti(), other_mon_has_arti(), on_ground(), you_have();
// src/mon.c mnexto(), mnearto(); src/monmove.c m_move() (the covetous attack on an intruder)
//
// The Amulet is a target once it has been made (`made_amulet`, m23 step 6), first of all, and the
// invocation (`u.uevent.invoked`) puts the quest artifact before the relics.
//
// Not ported (see DEVIATIONS.md "Monster AI"): mavenge, and deal_with_overcrowding()'s limbo: a
// monster with no room next to her stays where it is, and a monster pushed off the goal with no
// room around it is teleported at random.
import {
  getPlayer,
  inventoryOf,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
} from '@nh/core';
import { anyQuestArtifact, isQuestArtifact } from './artistate';
import { expels } from './engulf';
import { uswallow } from './engulfstate';
import { inhistemple, epriOf } from './epri';
import { eshkOf, inhishop } from './eshk';
import { mnextoPos } from './generation';
import { chooseStairs } from './ladder';

export { chooseStairs };
import { amuletMade } from './levdiff';
import { inWTower, uInvoked } from './levelflags';
import { isCovetous, wants } from './mondata';
import { heroSees, minvent } from './mongear';
import { isFleeing } from './monflee';
import { healmon, mstratOf, setMstrat, type MStrat } from './mstate';
import { doname } from './objnam';
import { mpickobj } from './steal';
import { goodposMon, noteleportLevel } from './teleport';
import { rlocMon, rlocTo } from './trap';
import {
  AMULET_OF_YENDOR,
  BELL_OF_OPENING,
  BOOK_OF_THE_DEAD,
  CANDELABRUM,
  monHasAmulet,
} from './uhave';
import { isWiz } from './wizstate';

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/**
 * The item of each M3_WANTS* flag (which_arti()); one this port lacks is never anywhere.
 * M3_WANTSARTI wants any role's quest artifact.
 */
const WANTED: Readonly<Record<string, DefId>> = {
  wantsamul: AMULET_OF_YENDOR,
  wantsbook: BOOK_OF_THE_DEAD,
  wantsbell: BELL_OF_OPENING,
  wantscand: CANDELABRUM,
};

/** strategy()'s order of the targets before the invocation */
const TARGETS = ['wantsbook', 'wantsbell', 'wantscand', 'wantsarti'] as const;
/** and once the gate is open: "priorities change once gate opened" */
const TARGETS_INVOKED = ['wantsarti', 'wantsbook', 'wantsbell', 'wantscand'] as const;

const ent = (ctx: Pick<Ctx, 'state'>, id: EntityId): Entity | undefined =>
  ctx.state.entities[String(id)];

/** Which objects are the target (C's otyp, 0 for any quest artifact). */
type Wanted = (o: Entity) => boolean;

/**
 * The target of a flag: an object type (null when not in this port), or for M3_WANTSARTI any
 * quest artifact ("0 signifies quest artifact"). ref: src/wizard.c which_arti()
 */
function whichArti(ctx: Pick<Ctx, 'defs'>, flag: string): Wanted | null {
  if (flag === 'wantsarti') return anyQuestArtifact;
  const otyp = WANTED[flag];
  return otyp !== undefined && ctx.defs.isObject(otyp) ? (o) => o.def === otyp : null;
}

/** ref: src/wizard.c mon_has_arti() */
const carries = (ctx: Pick<Ctx, 'state'>, id: EntityId, want: Wanted): boolean =>
  minvent(ctx, id).some(want);

/**
 * The hero has the flag's item (u.uhave): for M3_WANTSARTI only her own quest artifact counts.
 * ref: src/wizard.c you_have()
 */
function youHave(ctx: Pick<Ctx, 'state'>, flag: string, want: Wanted): boolean {
  const inv = inventoryOf(ctx.state, ctx.state.playerId);
  return flag === 'wantsarti' ? inv.some((o) => isQuestArtifact(ctx.state, o)) : inv.some(want);
}

/** The first one lying on the floor of the level. ref: src/wizard.c on_ground() */
function onGround(ctx: Pick<Ctx, 'state'>, levelId: string, want: Wanted): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const o = ent(ctx, id);
    if (o?.c.item && o.c.pos?.level === levelId && want(o)) return o;
  }
  return null;
}

/** Another monster of the level carrying one. ref: src/wizard.c other_mon_has_arti() */
function otherMonHasArti(ctx: Pick<Ctx, 'state'>, mon: Entity, want: Wanted): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const m = ent(ctx, id);
    if (id === mon.id || !m?.c.monster || m.c.pos?.level !== mon.c.pos?.level) continue;
    if (carries(ctx, id, want)) return m;
  }
  return null;
}

/**
 * Where the item of `flag` is, unless the monster has it: the hero carries it (STRAT_PLAYER),
 * it lies on the floor (STRAT_GROUND) or another monster has it (STRAT_MONSTR); the goal is set
 * to its spot (to 0,0 for STRAT_NONE). ref: src/wizard.c target_on()
 */
function targetOn(ctx: Ctx, mon: Entity, flag: string): MStrat | null {
  if (!wants(ctx.defs.monster(mon.def), flag)) return null;
  const want = whichArti(ctx, flag);
  const s = { ...mstratOf(ctx, mon.id) };
  delete s.goal;
  const level = mon.c.pos?.level;
  if (want !== null && level !== undefined && !carries(ctx, mon.id, want)) {
    const hero = getPlayer(ctx.state);
    const has = youHave(ctx, flag, want);
    const o = has ? null : onGround(ctx, level, want);
    let other = has || o ? null : otherMonHasArti(ctx, mon, want);
    // when seeking the Amulet, avoid targeting the Wizard or temple priests (to protect Moloch's
    // high priest)
    if (other && flag === 'wantsamul' && (isWiz(ctx, other.id) || inhistemple(ctx, other.id)))
      other = null;
    const goal = has ? hero.c.pos : (o?.c.pos ?? other?.c.pos);
    if (goal) {
      const strat = has ? 'player' : o ? 'ground' : 'monstr';
      setMstrat(ctx, mon.id, { ...s, goal: { x: goal.x, y: goal.y } });
      return { strat, want: flag };
    }
  }
  setMstrat(ctx, mon.id, s);
  return null;
}

/**
 * What a covetous monster goes for now: nothing (STRAT_NONE) for any other kind or for a
 * shopkeeper in his shop or a priest in his temple; to heal when under a third of its hit
 * points (the Wizard, under two thirds), else, by default, when under full; an item it wants
 * before that: the Amulet first once it has been made, then the Book, the Bell, the Candelabrum
 * and the quest artifact (after the invocation the quest artifact first).
 * ref: src/wizard.c strategy()
 */
function strategy(ctx: Ctx, mon: Entity): MStrat | 'none' {
  const def = ctx.defs.monster(mon.def);
  if (!isCovetous(def)) return 'none';
  // perhaps a shopkeeper has been polymorphed into a master lich; we don't want it teleporting
  // to the stairs to heal because that will leave its shop untended; likewise for temple priests
  if (eshkOf(ctx, mon.id) && inhishop(ctx, mon.id)) return 'none';
  if (epriOf(ctx, mon.id) && inhistemple(ctx, mon.id)) return 'none';
  const hp = mon.c.hp;
  const third = hp && hp.max > 0 ? Math.trunc((hp.cur * 3) / hp.max) : 0;
  let dstrat: MStrat | 'none';
  if (third <= 0)
    return { strat: 'heal' }; // panic time - mtmp is almost snuffed
  else if (third === 1 && def.id !== 'nh:wizard_of_yendor') return { strat: 'heal' };
  else if (third <= 2)
    dstrat = { strat: 'heal' }; // (the Wizard is less cautious)
  else dstrat = 'none';
  if (amuletMade(ctx.state)) {
    const strat = targetOn(ctx, mon, 'wantsamul');
    if (strat) return strat;
  }
  for (const flag of uInvoked(ctx.state) ? TARGETS_INVOKED : TARGETS) {
    const strat = targetOn(ctx, mon, flag);
    if (strat) return strat;
  }
  return dstrat;
}

/**
 * The monster goes next to the hero, unless there is no room. ref: src/mon.c mnexto(RLOC_MSG)
 * (no deal_with_overcrowding())
 */
function mnexto(ctx: Ctx, mon: Entity): void {
  const p = mon.c.pos;
  const hp = getPlayer(ctx.state).c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !hp || !level || hp.level !== p.level) return;
  const to = mnextoPos(ctx, level, null, hp, ctx.defs.monster(mon.def));
  if (to) rlocTo(ctx, mon, to.x, to.y, true);
}

/**
 * Puts the monster at (x, y) or near it: with `moveOther`, a monster there is moved out of its
 * way (next to the spot, else at random). False when there is no room.
 * ref: src/mon.c mnearto(RLOC_MSG)
 */
function mnearto(ctx: Ctx, mon: Entity, x: number, y: number, moveOther: boolean): boolean {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level) return false;
  if (p.x === x && p.y === y) return true;
  let other: Entity | null = null;
  let otherPos: Entity['c']['pos'];
  if (moveOther) {
    for (const id of sortedIds(ctx.state)) {
      const o = ent(ctx, id);
      const op = o?.c.pos;
      if (o?.c.monster && id !== mon.id && op?.level === p.level && op.x === x && op.y === y) {
        // take othermon off the map; it might end up immediately returning
        other = o;
        otherPos = op;
        delete o.c.pos;
        break;
      }
    }
  }
  let to: { x: number; y: number } | null = { x, y };
  if (!goodposMon(ctx, level, x, y, mon.id))
    to = mnextoPos(ctx, level, null, { x, y }, ctx.defs.monster(mon.def));
  if (!to) {
    if (other && otherPos) other.c.pos = otherPos;
    return false;
  }
  rlocTo(ctx, mon, to.x, to.y, true);
  if (other && otherPos) {
    other.c.pos = otherPos;
    // 'move_other' is FALSE this time: next to the spot, else (no limbo here) anywhere
    const near = mnextoPos(ctx, level, null, { x, y }, ctx.defs.monster(other.def));
    if (near) rlocTo(ctx, other, near.x, near.y, true);
    else rlocMon(ctx, other, true);
  }
  return true;
}

const distu = (ctx: Pick<Ctx, 'state'>, x: number, y: number): number => {
  const hp = getPlayer(ctx.state).c.pos;
  return hp ? (x - hp.x) ** 2 + (y - hp.y) ** 2 : Infinity;
};

/**
 * A covetous monster's move before the rest of dochug(): it sets its strategy and acts on it
 * (healing on or by the stairs, harassing, going for its target). True when it healed or picked
 * its target up (C's return value, which dochug() does not use). ref: src/wizard.c tactics()
 */
export function tactics(ctx: Ctx, id: EntityId): boolean {
  const mon = ent(ctx, id);
  const p = mon?.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!mon?.c.monster || !p || !level) return false;
  const st = strategy(ctx, mon);
  // mstrategy = (mstrategy & (STRAT_WAITMASK | STRAT_APPEARMSG)) | strat
  const keep = { ...mstratOf(ctx, id) };
  delete keep.strat;
  delete keep.want;
  setMstrat(ctx, id, st === 'none' ? keep : { ...keep, ...st });
  const noTele = (): boolean => noteleportLevel(ctx, level, id);

  if (st !== 'none' && st.strat === 'heal') {
    // hide and recover
    const sw = uswallow(ctx);
    if (sw && sw.mon === id) expels(ctx, mon, true);
    // if wounded, hole up on or near the stairs (to block them)
    const s = chooseStairs(ctx, level.id, id % 2 === 1);
    // (mavenge: not kept); the Wizard with no stairs to block teleports at random too, unless he
    // has the Amulet
    const inTower =
      inWTower(ctx.state, level, p.x, p.y) ||
      (isWiz(ctx, id) && !s && !monHasAmulet(ctx.state, id));
    if (inTower) {
      if (!noTele() && !ctx.rng.rn2(3 + Math.trunc((mon.c.hp?.cur ?? 0) / 10)))
        rlocMon(ctx, mon, true);
    } else if (s && (p.x !== s.x || p.y !== s.y)) {
      if (!noTele() && !mnearto(ctx, mon, s.x, s.y, true)) return false; // stay where we are
    }
    // (C updates its cached spot only after mnearto())
    const at = inTower ? p : (mon.c.pos ?? p);
    // if you're not around, cast healing spells
    const hp = mon.c.hp;
    if (distu(ctx, at.x, at.y) > BOLT_LIM * BOLT_LIM && hp && hp.cur <= hp.max - 8) {
      healmon(mon, ctx.rng.rnd(8));
      return true;
    }
  }
  if (st === 'none' || st.strat === 'heal') {
    // harass
    if (!noTele() && !ctx.rng.rn2(!isFleeing(ctx, id) ? 5 : 33)) mnexto(ctx, mon);
    return false;
  }
  // kill, maim, pillage!
  const goal = mstratOf(ctx, id).goal;
  const want = st.want ? whichArti(ctx, st.want) : null;
  if (!goal || !want || goal.x < 1 || goal.x >= level.width || goal.y < 0 || goal.y >= level.height)
    return false; // simply wants you to close
  if (noTele() && Math.max(Math.abs(p.x - goal.x), Math.abs(p.y - goal.y)) > 1) return false;
  const hp = getPlayer(ctx.state).c.pos;
  if ((hp && hp.x === goal.x && hp.y === goal.y) || st.strat === 'player') {
    // player is standing on it (or has it); no room? stay put
    if (!noTele()) mnearto(ctx, mon, goal.x, goal.y, false);
    return false;
  }
  if (st.strat === 'ground') {
    const there = sortedIds(ctx.state).some((oid) => {
      const o = ent(ctx, oid);
      return (
        o?.c.monster &&
        oid !== id &&
        o.c.pos?.level === p.level &&
        o.c.pos.x === goal.x &&
        o.c.pos.y === goal.y
      );
    });
    if (!there) {
      // teleport to it and pick it up
      rlocTo(ctx, mon, goal.x, goal.y, false);
      const o = onGround(ctx, p.level, want);
      if (!o) return false;
      const at = mon.c.pos;
      if (at && heroSees(ctx, at))
        ctx.emit({
          type: 'msg',
          key: 'mon.picks_up',
          params: { mon: `@${mon.def}`, item: doname(ctx.state, ctx.defs, o) },
        });
      mpickobj(ctx, id, o);
      return true;
    }
    // a monster is standing on it - cause some trouble
    if (!ctx.rng.rn2(5) && !noTele()) mnexto(ctx, mon);
    return false;
  }
  // a monster has it - 'port beside it; no room? stay put
  if (!noTele()) mnearto(ctx, mon, goal.x, goal.y, false);
  return false;
}
