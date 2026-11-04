// Temple priests: made with their temple, and the god's anger when the hero attacks one.
// ref: src/priest.c priestini(), ghod_hitsu(), intemple(); src/sp_lev.c create_altar()
// (`croom_is_temple`)
//
// The priest's table and the questions about it are in epri.ts; his movement (pri_move(),
// move_special()) is in monmove.ts. Not ported: high priests and the Sanctum, roaming priests
// (angry_priest()'s conversion to a minion), the Amulet, conflict, the exercise of Wisdom.
import {
  DIRS,
  DIR_LIST,
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  inRooms,
  sortedIds,
  type Ctx,
  type Dir,
  type EntityId,
  type Json,
  type Level,
  type ModApi,
  type Pos,
} from '@nh/core';
import { alignGname, altarAlign } from './align';
import { buzzFrom } from './buzz';
import { clearPath } from './clearpath';
import {
  ALIGNED_CLERIC,
  epriOf,
  findpriest,
  hasShrine,
  inhistemple,
  pCoaligned,
  priestName,
  setEpri,
  templeOccupied,
  type Epri,
} from './epri';
import { ALGN_DEVOUT, ALGN_SINNED } from './aligntyp';
import { makemon, rlocPos } from './generation';
import { addToInventory } from './items';
import { money2mon, money2u, moneyCnt } from './money';
import { adjalign, setU, uState } from './luck';
import { mkobj } from './mkobj';
import { whichArmor } from './mongear';
import { P, hasIntrinsic, hasProp, heroHas, incrItimeout, setIntrinsic } from './props';
import { isFrozen, unfreezeMonst } from './mstate';
import { isFleeing } from './monflee';
import { monNam } from './perception';
import { monLearnsTraps } from './trapstate';

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/** ref: src/decl.c xdir[], ydir[]: W, NW, N, NE, E, SE, S, SW */
const XDIR = [-1, -1, 0, 1, 1, 1, 0, -1] as const;
const YDIR = [0, -1, -1, -1, 0, 1, 1, 1] as const;

/** ref: src/sp_lev.c pm_good_location() -> is_ok_location(DRY): SPACE_POS (no doors) */
function goodLocation(ctx: Ctx, level: Level, x: number, y: number): boolean {
  if (!inBounds(level, x, y)) return false;
  const id = level.palette[level.cells[cellIndex(level, x, y)] ?? -1];
  if (id === undefined) return false;
  const t = ctx.defs.terrain(id);
  return t.passable && t.door === undefined;
}

/**
 * Makes the priest of the temple `room` next to its shrine at `altar` (on the altar itself when
 * no neighbour is good), moving any monster already there away: peaceful, awake, knowing every
 * trap, with 2 to 4 spellbooks, and his robe uncursed (coaligned) or cursed half the time.
 * ref: src/priest.c priestini() (not the Sanctum's high priest)
 */
export function priestini(ctx: Ctx, level: Level, room: number, altar: Pos): EntityId | null {
  const si = ctx.rng.rn2(8);
  let px = altar.x;
  let py = altar.y;
  let i = 0;
  for (; i < 8; i++) {
    const d = (i + si) % 8;
    px = altar.x + (XDIR[d] ?? 0);
    py = altar.y + (YDIR[d] ?? 0);
    if (goodLocation(ctx, level, px, py)) break;
  }
  if (i === 8) {
    px = altar.x;
    py = altar.y;
  }
  // "insurance": move a monster out of the way (rloc(RLOC_NOMSG))
  for (const id of sortedIds(ctx.state)) {
    const p = ctx.state.entities[String(id)]?.c.pos;
    const isMon = ctx.state.entities[String(id)]?.c.monster !== undefined;
    if (!isMon || !p || p.level !== level.id || p.x !== px || p.y !== py) continue;
    const to = rlocPos(ctx, level);
    if (to) {
      p.x = to.x;
      p.y = to.y;
    }
  }
  const id = makemon(ctx, ctx.defs.monster(ALIGNED_CLERIC), { x: px, y: py }, { level: level.id });
  const priest = id === null ? undefined : ctx.state.entities[String(id)];
  if (id === null || !priest?.c.monster) return null;
  const altarId = level.palette[level.cells[cellIndex(level, altar.x, altar.y)] ?? -1];
  const shralign = altarId === undefined ? null : altarAlign(altarId);
  const epri: Epri = {
    shroom: room,
    shralign: shralign ?? 0,
    shrpos: { x: altar.x, y: altar.y },
    shrlevel: level.id,
    intoneTime: 0,
    enterTime: 0,
    peacefulTime: 0,
    hostileTime: 0,
    cheapskate: 0,
  };
  setEpri(ctx, id, epri);
  for (const t of ctx.defs.traps) monLearnsTraps(ctx, id, t.id); // traps are known
  priest.c.monster.peaceful = true;
  priest.c.monster.asleep = false;
  // (set_malign(): the malign is computed when it is needed, from the shrine's alignment)

  // 2 to 4 spellbooks
  for (let cnt = ctx.rng.rn2(3) + 2; cnt > 0; --cnt) {
    const book = mkobj(ctx, 'spellbook', { artif: false, level: level.id, inMklev: true });
    if (book !== null) addToInventory(ctx, id, book);
  }
  // robe [via makemon()]
  if (ctx.rng.rn2(2) !== 0) {
    const robe = whichArmor(ctx, id, 'cloak')?.c.item;
    if (robe) {
      if (pCoaligned(ctx, epri)) {
        if (robe.buc === 'cursed') robe.buc = 'uncursed'; // uncurse()
      } else robe.buc = 'cursed'; // curse()
    }
  }
  return id;
}

/**
 * Drops the shrines of `level` that are not in a temple room (create_altar() makes a shrine
 * only in a temple) and makes a priest for each of the others. ref: src/sp_lev.c create_altar()
 */
export function templePriests(ctx: Ctx, level: Level): void {
  const shrines = level.shrines;
  if (!shrines) return;
  const kept: Pos[] = [];
  for (const s of shrines) {
    const room = templeOccupied(level, inRooms(level, s.x, s.y));
    if (room === null) continue; // !croom_is_temple: a plain altar
    kept.push(s);
    priestini(ctx, level, room, s);
  }
  if (kept.length > 0) level.shrines = kept;
  else delete level.shrines;
}

/** The direction of (dx, dy), each -1, 0 or 1 and not both 0. */
function dirOf(dx: number, dy: number): Dir | null {
  return DIR_LIST.find((d) => DIRS[d].x === dx && DIRS[d].y === dy) ?? null;
}

/**
 * (x, y) is in a straight line (orthogonal or diagonal) from the hero, within bolt range and
 * not blocked. ref: src/mthrowu.c linedup(u.ux, u.uy, x, y, 1) (no boulders here)
 */
function linedupHero(ctx: Ctx, level: Level, hp: Pos, x: number, y: number): boolean {
  const tbx = hp.x - x;
  const tby = hp.y - y;
  if (!tbx && !tby) return false;
  if (tbx && tby && Math.abs(tbx) !== Math.abs(tby)) return false;
  if (Math.max(Math.abs(tbx), Math.abs(tby)) >= BOLT_LIM) return false;
  return clearPath(level, cellRules(level, ctx.defs).opaque, hp.x, hp.y, x, y);
}

const GHOD_LINES = ['priest.ghod.roars_anger', 'priest.ghod.voice_booms', 'priest.ghod.roars'];

/**
 * The god of the temple the hero stands in strikes at her for attacking its priest: a bolt of
 * lightning (6d6, a monster spell) from the altar, or when she is not lined up with it, from the
 * temple's far wall in her row or column (the one across from her doorway). Nothing when she is
 * not in a temple, the priest's shrine is gone, or no line works. ref: src/priest.c ghod_hitsu()
 * (no exercise of Wisdom)
 */
export function ghodHitsu(ctx: Ctx, epri: Epri): void {
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || hp.level !== ctx.state.currentLevel) return;
  const level = getLevel(ctx.state);
  const roomno = templeOccupied(level, inRooms(level, hp.x, hp.y));
  if (roomno === null || !hasShrine(ctx, epri)) return;
  const troom = level.rooms[roomno];
  if (!troom) return;
  const ax = epri.shrpos.x;
  const ay = epri.shrpos.y;
  let x = ax;
  let y = ay;
  if ((hp.x === x && hp.y === y) || !linedupHero(ctx, level, hp, x, y)) {
    const here = level.palette[level.cells[cellIndex(level, hp.x, hp.y)] ?? -1];
    if (here !== undefined && ctx.defs.terrain(here).door !== undefined) {
      if (hp.x === troom.lx - 1) {
        x = troom.hx;
        y = hp.y;
      } else if (hp.x === troom.hx + 1) {
        x = troom.lx;
        y = hp.y;
      } else if (hp.y === troom.ly - 1) {
        x = hp.x;
        y = troom.hy;
      } else if (hp.y === troom.hy + 1) {
        x = hp.x;
        y = troom.ly;
      }
    } else {
      switch (ctx.rng.rn2(4)) {
        case 0:
          x = hp.x;
          y = troom.ly;
          break;
        case 1:
          x = hp.x;
          y = troom.hy;
          break;
        case 2:
          x = troom.lx;
          y = hp.y;
          break;
        default:
          x = troom.hx;
          y = hp.y;
          break;
      }
    }
    if (!linedupHero(ctx, level, hp, x, y)) return;
  }
  // a_gname_at(ax, ay): the god of the altar
  const god = alignGname(epri.shralign);
  ctx.emit({
    type: 'msg',
    key: GHOD_LINES[ctx.rng.rn2(3)] ?? 'priest.ghod.roars',
    params: { god },
  });
  // bolt of lightning cast by unspecified monster
  const dir = dirOf(Math.sign(hp.x - x), Math.sign(hp.y - y));
  if (dir) buzzFrom(ctx, 'lightning', 6, { x, y }, dir, { by: 'spell' });
}

/**
 * The hero can see x,y from where she stands now: not blind, a clear line, and the square lit or
 * next to her. ref: cansee(); computed here rather than read from the view, which on arrival
 * from another level still holds the old level's (it is refreshed after the action)
 */
function canseeNow(ctx: Ctx, at: Pos): boolean {
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp || hp.level !== ctx.state.currentLevel || heroHas(ctx.state, P.BLINDED)) return false;
  const level = getLevel(ctx.state);
  if (!clearPath(level, cellRules(level, ctx.defs).opaque, hp.x, hp.y, at.x, at.y)) return false;
  const near = Math.max(Math.abs(hp.x - at.x), Math.abs(hp.y - at.y)) <= 1;
  return near || level.lit[cellIndex(level, at.x, at.y)] === 1;
}

/**
 * The hero has just entered temple `roomno` (from `rooms0`, the typed rooms she was in before).
 * Tended: the priest intones (at most every ~2505 turns), "Pilgrim, you enter a sacred place!"
 * (~505), and a forbidding feeling or a sense of peace (~55, or at once when it switches). Untended:
 * an eerie feeling, one time in four nothing. ref: src/priest.c intemple() (no Sanctum, deafness,
 * achievements or ghost: the rn2(5) roll for the ghost is made, but there is no ghost monster)
 */
export function intemple(ctx: Ctx, roomno: number, rooms0: readonly number[]): void {
  const level = getLevel(ctx.state);
  // don't do anything if hero is already in the room
  if (templeOccupied(level, rooms0) !== null) return;
  const pid = findpriest(ctx, roomno);
  const priest = pid === null ? undefined : ctx.state.entities[String(pid)];
  const epri = pid === null ? null : epriOf(ctx, pid);
  const now = ctx.state.turn;
  if (pid !== null && priest?.c.monster && priest.c.pos && epri) {
    // tended
    const shrined = hasShrine(ctx, epri);
    const canSpeak = !priest.c.monster.asleep && !isFrozen(ctx, pid); // !helpless()
    if (canSpeak && now >= epri.intoneTime) {
      if (canseeNow(ctx, priest.c.pos)) {
        const mon = hasProp(getPlayer(ctx.state), P.HALLUC)
          ? monNam(ctx, priest)
          : priestName(epri);
        ctx.emit({ type: 'msg', key: 'priest.intones', params: { mon } });
      } else ctx.emit({ type: 'msg', key: 'priest.voice_intones' });
      epri.intoneTime = now + ctx.rng.d(10, 500); // ~2505
      // make sure that we don't suppress entry message when we've just given its "priest
      // intones" introduction
      epri.enterTime = 0;
    }
    if (now >= epri.enterTime && canSpeak) {
      ctx.emit({
        type: 'msg',
        key: shrined ? 'priest.pilgrim_sacred' : 'priest.pilgrim_desecrated',
      });
      epri.enterTime = now + ctx.rng.d(10, 100); // ~505
    }
    const record = uState(ctx.state).alignRecord;
    const forbidding = !shrined || !pCoaligned(ctx, epri) || record <= ALGN_SINNED;
    const key = forbidding
      ? !shrined || !pCoaligned(ctx, epri)
        ? 'priest.forbidding'
        : 'priest.strange_forbidding'
      : record >= ALGN_DEVOUT
        ? 'priest.peace'
        : 'priest.unusual_peace';
    const thisTime = forbidding ? 'hostileTime' : 'peacefulTime';
    const otherTime = forbidding ? 'peacefulTime' : 'hostileTime';
    // give message if we haven't seen it recently or if alignment update has caused it to switch
    // from forbidding to sense-of-peace or vice versa
    if (now >= epri[thisTime] || epri[otherTime] >= epri[thisTime]) {
      ctx.emit({ type: 'msg', key });
      epri[thisTime] = now + ctx.rng.d(10, 20); // ~55
      // avoid being tricked by the RNG: switch might have just happened and previous random
      // threshold could be larger
      if (epri[thisTime] <= epri[otherTime]) epri[otherTime] = epri[thisTime] - 1;
    }
    return;
  }
  // untended
  const UNTENDED = ['temple.eerie', 'temple.watched', 'temple.shiver'];
  const feeling = UNTENDED[ctx.rng.rn2(4)];
  if (feeling) ctx.emit({ type: 'msg', key: feeling });
  ctx.rng.rn2(5); // the ghost (not ported: no ghost monster)
}

/** Makes the temple priests of each new level (before its other contents, as create_altar()). */
export function registerPriest(api: ModApi): void {
  api.on('newLevel', (ctx, level) => templePriests(ctx, level));
}

// ---------------------------------------------------------------------------------------------
// #chat with a priest: donations. ref: src/priest.c priest_talk(), src/minion.c bribe()

const say = (ctx: Ctx, key: string, params?: Record<string, string | number>): void =>
  ctx.emit(params ? { type: 'msg', key, params } : { type: 'msg', key });

/** The suggested donation the priest asks for, kept in the prompt until the hero answers. */
export interface PriestOffer {
  suggested: number;
  quan: number;
}

const CRANKY = ['priest.cranky.words', 'priest.cranky.talk', 'priest.cranky.no_longer'];

/**
 * The hero chats with a priest. Returns the donation he asks for when she carries gold (the
 * caller asks how much and passes the answer to priestDonate()), null when the talk is over.
 * ref: src/priest.c priest_talk() (no conduct, no exercise of Wisdom, no roaming priests: an
 * aligned cleric without a temple of his own is cranky)
 */
export function priestTalk(ctx: Ctx, id: EntityId): PriestOffer | null {
  const priest = ctx.state.entities[String(id)];
  const m = priest?.c.monster;
  if (!priest || !m) return null;
  const epri = epriOf(ctx, id);
  const u = uState(ctx.state);
  const coaligned = epri
    ? pCoaligned(ctx, epri)
    : u.alignType === Math.sign(ctx.defs.monster(priest.def).alignment);
  const strayed = u.alignRecord < 0;
  const mon = monNam(ctx, priest);

  if (isFleeing(ctx, id) || (!epri && coaligned && strayed)) {
    say(ctx, 'priest.nothing_to_do', { mon });
    m.peaceful = false;
    return null;
  }
  // priests don't chat unless peaceful and in their own temple
  const helpless = m.asleep || isFrozen(ctx, id);
  if (!inhistemple(ctx, id) || !m.peaceful || helpless) {
    if (helpless) {
      say(ctx, 'priest.reverie', { mon });
      m.asleep = false;
      unfreezeMonst(ctx, id);
    }
    m.peaceful = false;
    say(ctx, CRANKY[ctx.rng.rn2(3)] ?? 'priest.cranky.words');
    return null;
  }
  // you desecrated the temple and now you want to chat?
  const p = priest.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (
    epri &&
    p &&
    level &&
    templeOccupied(level, inRooms(level, p.x, p.y)) !== null &&
    !hasShrine(ctx, epri)
  ) {
    say(ctx, 'priest.begone');
    m.peaceful = false;
    return null;
  }
  const hero = ctx.state.playerId;
  if (moneyCnt(ctx, hero) === 0) {
    if (coaligned && !strayed) {
      const pmoney = moneyCnt(ctx, id);
      if (pmoney > 0) {
        // Note: two bits is actually 25 cents.  Hmm.
        say(ctx, pmoney === 1 ? 'priest.ale_one' : 'priest.ale_two', { mon });
        money2u(ctx, id, pmoney > 1 ? 2 : 1);
      } else say(ctx, 'priest.poverty', { mon });
    } else say(ctx, 'priest.not_interested', { mon });
    return null;
  }
  // some randomization in how much you need to donate; with more gold visible you need to
  // donate more but get a greater effect; cheapskating raises the amounts next time
  const ulevelpeak = getPlayer(ctx.state).c.experience?.level ?? 1; // no level loss yet
  const suggested = (ulevelpeak || 1) * (ctx.rng.rn2(101) + 150 + (epri?.cheapskate ?? 0) * 40);
  const quan = Math.max(Math.trunc(moneyCnt(ctx, hero) / (suggested * 3)), 1);
  say(ctx, 'priest.asks_contribution', { mon });
  return { suggested, quan };
}

/** The amount a getlin() answer offers, as sscanf("%ld"): 0 when it is not a number. */
function parseOffer(answer: Json): number {
  if (typeof answer !== 'string') return 0;
  const m = /^\s*([+-]?\d+)/.exec(answer);
  return m?.[1] ? Number.parseInt(m[1], 10) : 0;
}

/**
 * The hero answers how much she offers: 0, nothing or a cancel refuses ("Thou shalt regret thine
 * action!"), less than the suggestion is cheap unless it is most of her gold, the suggestion buys
 * clairvoyance, twice it protection (one point per twice the base suggestion), three times it
 * her god's favour or a cleansed record. ref: src/priest.c priest_talk(), src/minion.c bribe()
 */
export function priestDonate(ctx: Ctx, id: EntityId, answer: Json, ask: PriestOffer): void {
  const priest = ctx.state.entities[String(id)];
  if (!priest?.c.monster) return;
  const epri = epriOf(ctx, id);
  const coaligned = epri ? pCoaligned(ctx, epri) : false;
  const strayed = uState(ctx.state).alignRecord < 0;
  const hero = ctx.state.playerId;
  const mon = monNam(ctx, priest);
  const { suggested, quan } = ask;

  // bribe()
  let offer = parseOffer(answer);
  const umoney = moneyCnt(ctx, hero);
  if (offer < 0) {
    say(ctx, 'bribe.shortchange', { mon });
    offer = 0;
  } else if (offer === 0) say(ctx, 'bribe.refuse');
  else if (offer >= umoney) {
    say(ctx, 'bribe.all', { mon });
    offer = umoney;
  } else say(ctx, offer === 1 ? 'bribe.give_one' : 'bribe.give', { mon, n: offer });
  if (offer > 0) money2mon(ctx, id, offer);

  const left = moneyCnt(ctx, hero);
  if (offer === 0) {
    say(ctx, 'priest.regret');
    if (coaligned) adjalign(ctx, -1);
    if (epri) epri.cheapskate++;
  } else if (offer < suggested * quan) {
    if (left > offer * 2) {
      say(ctx, 'priest.cheapskate');
      if (epri) epri.cheapskate++;
    } else say(ctx, 'priest.thank_contribution'); // (exercise(A_WIS) not ported)
  } else if (offer < suggested * quan * 2) {
    say(ctx, 'priest.pious');
    if (left < offer * 2 && coaligned && uState(ctx.state).alignRecord <= ALGN_SINNED)
      adjalign(ctx, 1);
    say(ctx, 'priest.bestow_blessing');
    const t = Math.trunc((500 * offer) / suggested);
    incrItimeout(ctx.state, getPlayer(ctx.state), P.CLAIRVOYANT, ctx.rng.rn2(t) + t);
  } else if (offer < suggested * quan * 3) {
    const her = getPlayer(ctx.state);
    let origUblessed = uState(ctx.state).ublessed;
    // u.ublessed only counts while Protection comes from something other than worn gear
    if (!hasIntrinsic(her, P.PROTECTION)) {
      setIntrinsic(her, P.PROTECTION, true);
      origUblessed = -1; // force "rewarded" message
    }
    let ublessed = uState(ctx.state).ublessed;
    for (; offer >= 2 * suggested; offer -= 2 * suggested) {
      if (!ublessed)
        ublessed = ctx.rng.rn2(3) + 2; // rn1(3, 2)
      else if (ublessed < 20 && (ublessed < 9 || !ctx.rng.rn2(ublessed))) ublessed++;
    }
    setU(ctx, { ublessed });
    say(ctx, ublessed > origUblessed ? 'priest.rewarded' : 'priest.appreciated');
  } else {
    say(ctx, 'priest.appreciated');
    if (left < offer * 2 && coaligned) {
      const ucleansed = uState(ctx.state).ucleansed ?? 0;
      if (strayed && ctx.state.turn - ucleansed > 5000) {
        setU(ctx, { alignRecord: 0, ucleansed: ctx.state.turn }); // cleanse thee
      } else adjalign(ctx, 2);
    }
  }
}
