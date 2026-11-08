// Paying for shop damage: the shopkeeper wants paying for the walls and door the hero dug,
// broke, burnt or blew up (C's "Cad!  You did 400 zorkmids worth of damage!"  Pay?), warns her
// off digging his floor and grabs her pack when she falls through it. The repairs are in
// shkdamage.ts (above trap.ts; this module is below it: buzz.ts and dig.ts call it).
// ref: src/shk.c shopdig(), getcad(), pay_for_damage(), cad()
//
// Not ported: deafness, invisibility, polymorphed heroes, Keystone Kops; a shopkeeper is never an
// animal or mute by nature, so only a helpless one is mute (muteshk()).
import {
  cellIndex,
  getLevel,
  getPlayer,
  inBounds,
  inventoryOf,
  isVisible,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type Msg,
} from '@nh/core';
import { eshkOf, inhishop, shopKeeper, uShops } from './eshk';
import { heroFemale, polyGender } from './gender';
import { mnextoPos } from './generation';
import { addToInventory, removeFromInventory } from './items';
import { adjalign, uState } from './luck';
import { money2mon, moneyCnt } from './money';
import { zorkmids } from './objnam';
import { canSpotMon } from './perception';
import { heroInvisible } from './invis';
import {
  checkCredit,
  helpless,
  homeShk,
  hotPursuit,
  mnearto,
  pacifyShk,
  rileShk,
  shkPronouns,
  shkname,
  subfrombill,
} from './shk';
import { damageList, shopRoomsAt, type ShopDamage } from './shopdamage';
import { utrap } from './trapstate';

export const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The prompt handler of "Pay?" (offered nowhere). */
export const SHK_DAMAGE_ID: DefId = 'nh:shkdamage';

/** ref: include/hack.h BOLT_LIM */
export const BOLT_LIM = 8;

export const dist2 = (ax: number, ay: number, bx: number, by: number): number =>
  (ax - bx) ** 2 + (ay - by) ** 2;

export function heroXY(ctx: Pick<Ctx, 'state'>): { level: string; x: number; y: number } {
  const p = getPlayer(ctx.state).c.pos;
  if (!p) throw new Error('The hero is nowhere');
  return p;
}

/** The hero is more than `n` squares away from x,y in either direction. ref: src/apply.c um_dist() */
export function umDist(ctx: Pick<Ctx, 'state'>, x: number, y: number, n: number): boolean {
  const h = heroXY(ctx);
  return Math.abs(h.x - x) > n || Math.abs(h.y - y) > n;
}

export const posOf = (
  ctx: Pick<Ctx, 'state'>,
  id: EntityId,
): { x: number; y: number; level: string } =>
  ctx.state.entities[String(id)]?.c.pos ?? { x: -1, y: -1, level: '' };

export const cansee = (ctx: Pick<Ctx, 'state'>, level: Level, x: number, y: number): boolean =>
  level.id === ctx.state.currentLevel &&
  inBounds(level, x, y) &&
  isVisible(ctx.state, cellIndex(level, x, y));

/** muteshk(): a helpless keeper says nothing (no keeper is an animal or silent by nature). */
export const muteshk = (ctx: Pick<Ctx, 'state'>, shk: EntityId): boolean => helpless(ctx, shk);

const isKnight = (ctx: Pick<Ctx, 'state'>): boolean =>
  getPlayer(ctx.state).c.player?.role === 'nh:knight';
const alignSgn = (ctx: Pick<Ctx, 'state'>): number => Math.sign(uState(ctx.state).alignType);

/** "You feel like a common thief." and the Knight's alignment penalty. ref: shopdig() */
function commonThief(ctx: Ctx): void {
  if (!isKnight(ctx)) return;
  say(ctx, 'shk.damage.common_thief');
  adjalign(ctx, -alignSgn(ctx));
}

/** The living monster at x,y of the level, or null. ref: m_at() */
export function monAt(ctx: Ctx, level: Level, x: number, y: number): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    const p = m?.c.pos;
    if (m?.c.monster && p?.level === level.id && p.x === x && p.y === y) return m;
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// digging in a shop

/**
 * Digging in his shop. Starting (`fall` false): "Be careful, madam, or you might fall through
 * the floor." from the pit, else "Madam, do not damage the floor here!". Falling through the
 * hole (`fall`): within 5 squares and owed something, he comes next to her (or curses her and
 * gets angry when he cannot) and grabs her backpack: everything not worn or wielded goes to him.
 * A Knight feels like a common thief either way. ref: src/shk.c shopdig() (no leashes, two
 * weapons or a wand being zapped; no keeper lacks limbs)
 */
export function shopdig(ctx: Ctx, fall: boolean): void {
  const level = getLevel(ctx.state);
  const room = uShops(ctx)[0];
  const shk = room === undefined ? null : shopKeeper(ctx, level.id, room);
  const e = shk === null ? null : eshkOf(ctx, shk);
  const mon = shk === null ? undefined : ctx.state.entities[String(shk)];
  if (shk === null || !e || !mon?.c.pos) return;
  if (!inhishop(ctx, shk)) {
    commonThief(ctx);
    return;
  }
  // 0 == can't speak, 2 == speaks
  const lang = helpless(ctx, shk) ? 0 : 2;
  if (!fall) {
    if (lang === 2 && !muteshk(ctx, shk))
      say(
        ctx,
        (utrap(ctx)?.type === 'pit' ? 'shk.damage.careful' : 'shk.damage.dont_damage') +
          (heroFemale(ctx.state) ? '' : '.male'),
      );
    commonThief(ctx);
    return;
  }
  if (umDist(ctx, mon.c.pos.x, mon.c.pos.y, 5) || helpless(ctx, shk)) return;
  if (e.bill.length === 0 && !e.debit) return;
  const name = shkname(ctx, e);
  const next2u = (): boolean => {
    const p = ctx.state.entities[String(shk)]?.c.pos;
    return p !== undefined && !umDist(ctx, p.x, p.y, 1);
  };
  if (!next2u()) {
    const to = mnextoPos(ctx, level, shk, heroXY(ctx)); // mnexto(RLOC_MSG)
    if (to) mon.c.pos = { level: level.id, x: to.x, y: to.y };
    // for some reason the shopkeeper can't come next to you
    if (!next2u()) {
      if (lang === 2) say(ctx, 'shk.damage.curses', { shk: name });
      rileShk(ctx, shk);
      return;
    }
    say(ctx, 'shk.damage.leaps_grabs', { shk: name });
  } else say(ctx, 'shk.damage.grabs', { shk: name });
  for (const obj of inventoryOf(ctx.state, ctx.state.playerId)) {
    const it = obj.c.item;
    // worn or wielded (not the alternate weapon or the quiver) stays
    if (!it || it.equipped !== null) continue;
    removeFromInventory(ctx, obj.id); // setnotworn(), freeinv()
    subfrombill(ctx, obj, shk);
    addToInventory(ctx, shk, obj.id); // add_to_minv()
  }
}

// ---------------------------------------------------------------------------------------------
// paying for it

/** What she did, for "How dare you X my Y?". ref: pay_for_damage() callers' dmgstr */
export type DmgStr =
  'dig into' | 'damage' | 'break' | 'ruin' | 'destroy' | 'burn away' | 'shatter' | 'disintegrate';

const DMGSTR_KEY: Readonly<Record<DmgStr, string>> = {
  'dig into': 'dig_into',
  damage: 'damage',
  break: 'break',
  ruin: 'ruin',
  destroy: 'destroy',
  'burn away': 'burn_away',
  shatter: 'shatter',
  disintegrate: 'disintegrate',
};

/**
 * He is after her: "How dare you break my door?" when she is in a shop, he is pursuing her or the
 * damage is next to her, else "Izchak shouts:" "Who dared break my door?" ("shop" for a dug
 * wall); a helpless keeper says nothing. ref: src/shk.c getcad() (no deafness)
 */
function getcad(
  ctx: Ctx,
  shk: EntityId,
  dmgstr: DmgStr,
  x: number,
  y: number,
  uinshp: boolean,
  pursue: boolean,
): void {
  const dugwall = dmgstr === 'dig into' || dmgstr === 'damage';
  const params = {
    what: { key: `shk.damage.verb.${DMGSTR_KEY[dmgstr]}` },
    my: { key: dugwall ? 'shk.damage.shop' : 'shk.damage.door' },
  };
  const e = eshkOf(ctx, shk);
  if (muteshk(ctx, shk) || !e) {
    // (no keeper is an animal to yelp)
  } else if (pursue || uinshp || !umDist(ctx, x, y, 1)) {
    say(ctx, 'shk.damage.how_dare', params);
  } else {
    say(ctx, 'shk.damage.shouts', { shk: shkname(ctx, e) });
    say(ctx, 'shk.damage.who_dared', params);
  }
  hotPursuit(ctx, shk);
}

/** The data of a pending "Pay?". */
interface PayData {
  shkDamage: EntityId;
  cost: number;
}

/**
 * She damaged a shop this turn (the damage list's entries of this turn with a cost): the nearest
 * shopkeeper in his shop whose shop it is wants paying. Already angry, he goes after her; out of
 * his shop, he goes after her if she can see him; with her in a shop, he leaps toward her when
 * 2-3 squares away and goes after her if still not next to her; with her outside, he appears at
 * the damage ("Out of my way, scum!" to a monster there). Then, unless she is away from the
 * damage outside, `cantMollify`, she cannot pay (gold plus credit) or 1 in 50, he asks "Cad!
 * You did N zorkmids worth of damage!"  Pay?"; else he goes after her ("How dare you ...?").
 * The question is answered by {@link answerPayForDamage}. ref: src/shk.c pay_for_damage()
 */
export function payForDamage(ctx: Ctx, dmgstr: DmgStr, cantMollify: boolean): void {
  if (ctx.state.gameOver) return;
  const level = getLevel(ctx.state);
  const uinshp = uShops(ctx).length > 0;
  let shk: EntityId | null = null;
  let appearHere: ShopDamage | null = null;
  let cost = 0;
  let nearestShk = Infinity;
  let nearestDamage = Infinity;
  let picks = 0;
  const h = heroXY(ctx);
  for (const dam of damageList(ctx, level.id)) {
    if (dam.when !== ctx.state.turn || !dam.cost) continue;
    cost += dam.cost;
    for (const r of shopRoomsAt(level, dam.x, dam.y)) {
      const tmp = shopKeeper(ctx, level.id, r);
      if (tmp === null) continue;
      if (tmp === shk) {
        const damageDistance = dist2(dam.x, dam.y, h.x, h.y);
        if (damageDistance < nearestDamage) {
          nearestDamage = damageDistance;
          appearHere = dam;
        }
        continue;
      }
      if (!inhishop(ctx, tmp)) continue;
      const tp = posOf(ctx, tmp);
      const shkDistance = dist2(tp.x, tp.y, h.x, h.y);
      if (shkDistance > nearestShk) continue;
      if (shkDistance === nearestShk && picks) {
        if (ctx.rng.rn2(++picks)) continue;
      } else picks = 1;
      shk = tmp;
      nearestShk = shkDistance;
      appearHere = dam;
      nearestDamage = dist2(dam.x, dam.y, h.x, h.y);
    }
  }
  if (!cost || shk === null || !appearHere) return;
  const e = eshkOf(ctx, shk);
  const mon = ctx.state.entities[String(shk)];
  if (!e || !mon?.c.monster || !mon.c.pos) return;
  const { x, y } = appearHere;
  let pursue = false;
  // not the best introduction to the shk...
  e.customer = true;
  // if the shk is already on the war path, be sure it's all out
  if (!mon.c.monster.peaceful || e.following) {
    hotPursuit(ctx, shk);
    return;
  }
  // if the shk is not in their shop..
  if (shopRoomsAt(level, mon.c.pos.x, mon.c.pos.y).length === 0) {
    if (!cansee(ctx, level, mon.c.pos.x, mon.c.pos.y)) return;
    pursue = true;
    getcad(ctx, shk, dmgstr, x, y, uinshp, pursue);
    return;
  }
  if (uinshp) {
    if (umDist(ctx, mon.c.pos.x, mon.c.pos.y, 1) && !umDist(ctx, mon.c.pos.x, mon.c.pos.y, 3)) {
      say(ctx, 'shk.damage.leaps', { shk: shkname(ctx, e) });
      const to = mnextoPos(ctx, level, shk, h); // mnexto(RLOC_NOMSG)
      if (to) mon.c.pos = { level: level.id, x: to.x, y: to.y };
    }
    pursue = umDist(ctx, mon.c.pos.x, mon.c.pos.y, 1);
    if (pursue) {
      getcad(ctx, shk, dmgstr, x, y, uinshp, pursue);
      return;
    }
  } else {
    // make shk show up at the door, having yanked the hapless critter out of the way
    const other = monAt(ctx, level, x, y);
    if (other && other.id !== shk && !muteshk(ctx, shk)) {
      say(ctx, 'shk.damage.angry_voice');
      say(ctx, 'shk.damage.out_of_my_way');
    }
    mnearto(ctx, shk, level.id, x, y); // RLOC_MSG
  }
  if (
    (umDist(ctx, x, y, 1) && !uinshp) ||
    cantMollify ||
    moneyCnt(ctx, ctx.state.playerId) + e.credit < cost ||
    !ctx.rng.rn2(50)
  ) {
    getcad(ctx, shk, dmgstr, x, y, uinshp, pursue);
    return;
  }
  // (a pay question already pending this move covers this damage too)
  if (ctx.state.pendingPrompt) return;
  if (heroInvisible(ctx.state)) say(ctx, 'shk.invisibility_no_fool', { shk: shkname(ctx, e) });
  const data: PayData = { shkDamage: shk, cost };
  ctx.ask(
    {
      id: 'shk-damage',
      kind: 'yn',
      key: 'shk.damage.pay_q',
      params: {
        // cad(): poly_gender() "minx" / "cad" (no demon or genderless forms yet)
        cad: { key: polyGender(ctx.state) === 0 ? 'shk.damage.cad.male' : 'shk.damage.cad' },
        n: cost,
        zm: zorkmids(cost),
      },
    },
    SHK_DAMAGE_ID,
    data as unknown as Json,
  );
}

/**
 * "Pay?" answered: yes (C's anything but 'n') pays him from her credit and gold, "Mollified,
 * Izchak accepts your restitution.", and he goes home ("returns to his shop", "shifts location",
 * ...); no: "Oh, yes!  You'll pay!", he goes after her and her alignment suffers.
 * ref: src/shk.c pay_for_damage() after y_n()
 */
export function answerPayForDamage(ctx: Ctx, value: Json, raw: Json): number {
  const data = raw as unknown as PayData | null;
  const shk = data?.shkDamage;
  const e = shk === undefined ? null : eshkOf(ctx, shk);
  const mon = shk === undefined ? undefined : ctx.state.entities[String(shk)];
  if (!data || shk === undefined || !e || !mon?.c.pos) return 0;
  if (value !== false) {
    const wasSeen = canSpotMon(ctx, mon);
    const wasOutside = !inhishop(ctx, shk);
    const sx = mon.c.pos.x;
    const sy = mon.c.pos.y;
    const cost = checkCredit(ctx, data.cost, e);
    if (cost > 0) money2mon(ctx, shk, cost);
    say(ctx, 'shk.damage.mollified', { shk: shkname(ctx, e) });
    // move shk back to his home loc
    homeShk(ctx, shk);
    pacifyShk(ctx, shk, false);
    // home_shk() suppresses rloc()'s vanish/appear messages
    const p = mon.c.pos;
    if (p.x !== sx || p.y !== sy) {
      const isSeen = canSpotMon(ctx, mon);
      if (wasOutside && isSeen)
        say(ctx, 'shk.returns_home', { shk: shkname(ctx, e), his: shkPronouns(e).his });
      else if (isSeen || wasSeen)
        say(
          ctx,
          !wasSeen ? 'shk.damage.appears' : isSeen ? 'shk.damage.shifts' : 'shk.damage.disappears',
          { shk: shkname(ctx, e) },
        );
    }
    return 0;
  }
  say(ctx, muteshk(ctx, shk) ? 'shk.damage.lunges' : 'shk.damage.youll_pay', {
    shk: shkname(ctx, e),
    his: shkPronouns(e).his,
  });
  hotPursuit(ctx, shk);
  adjalign(ctx, -alignSgn(ctx));
  return 0;
}

/** Answers the shopkeeper's "Pay?" for damage; offered nowhere (pay_for_damage() asks). */
export const shkDamageAction: ActionDef = {
  id: SHK_DAMAGE_ID,
  labelKey: `action.${SHK_DAMAGE_ID}`,
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer: answerPayForDamage,
};
