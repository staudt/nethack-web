// #pay (`p`): paying a shopkeeper the debt and the bill. One item is paid directly; several ask
// "Itemized billing?" and then, item by item, "X for N zorkmids.  Pay?" (menustyle traditional).
// ref: src/shk.c dopay(), pay_billed_items(), make_itemized_bill(), sortbill_cmp(),
// cheapest_item(), update_bill(), dopayobj(), reject_purchase(), insufficient_funds(),
// check_credit(), pay(), rouse_shk()
//
// Not ported: the menu of bill items (other menustyles, the 'm' answer), containers on the bill
// as one line (each billed object is its own line here: buy_container()), getpos() for "Pay
// whom?" (a menu of the shopkeepers in view instead), the angry and robbed branches (step 5),
// deafness and mute keepers.
import {
  NORMAL_SPEED,
  getPlayer,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Msg,
  type Offer,
} from '@nh/core';
import { dropBillEntry, eshkOf, inhishop, uShops, type BillEntry, type Eshk } from './eshk';
import { moneyCnt, money2mon, money2u } from './money';
import { unfreezeMonst } from './mstate';
import { paydoname, xnameOf, zorkmids } from './objnam';
import { canSpotMon } from './perception';
import { P, hasProp } from './props';
import { bpToObj, helpless, hiddenGold, shkNamesObj, shkname, shopNameParam } from './shk';

export const PAY_ID: DefId = 'nh:pay';

type Used = 'full_used' | 'part_used' | 'part_intact' | 'full_intact';

/** One line of the augmented bill (C's Bill); `oid` and `useup` find its bill entry. */
interface IBill {
  oid: EntityId;
  useup: boolean;
  quan: number;
  cost: number;
  used: Used;
}

/** The progress of one #pay through its prompts. */
interface PayData {
  step: 'whom' | 'itemize' | 'item';
  shk?: EntityId;
  bill?: IBill[];
  idx?: number;
  itemize?: boolean;
  paid?: boolean;
}

const say = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });
const usedUp = (u: Used): boolean => u === 'full_used' || u === 'part_used';

/** The shopkeepers on the hero's level, in id order. ref: next_shkp(fmon, FALSE) */
function levelShks(ctx: Ctx): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const m = ctx.state.entities[String(id)];
    if (m?.c.monster && m.c.pos?.level === ctx.state.currentLevel && eshkOf(ctx, id)) out.push(m);
  }
  return out;
}

/** ref: m_next2u() */
function next2u(ctx: Ctx, m: Entity): boolean {
  const hp = getPlayer(ctx.state).c.pos;
  const p = m.c.pos;
  return !!hp && !!p && Math.abs(hp.x - p.x) <= 1 && Math.abs(hp.y - p.y) <= 1;
}

const angry = (m: Entity | undefined): boolean => !m?.c.monster?.peaceful;

/** The keeper of the shop the hero is in, when he is in it. */
function residentOf(ctx: Ctx, shks: readonly Entity[]): EntityId | null {
  const room = uShops(ctx)[0];
  for (const m of shks) {
    const e = eshkOf(ctx, m.id);
    if (e && inhishop(ctx, m.id) && room === e.shoproom) return m.id;
  }
  return null;
}

/** The price is taken from her credit first. ref: src/shk.c check_credit() */
function checkCredit(ctx: Ctx, tmp: number, e: Eshk): number {
  const credit = e.credit;
  if (credit === 0) return tmp;
  if (credit >= tmp) {
    say(ctx, 'pay.credit_deducted');
    e.credit -= tmp;
    return 0;
  }
  say(ctx, 'pay.credit_partial');
  e.credit = 0;
  return tmp - credit;
}

/** ref: src/shk.c pay() */
function pay(ctx: Ctx, tmp: number, shk: EntityId, e: Eshk): void {
  const balance = tmp <= 0 ? tmp : checkCredit(ctx, tmp, e);
  if (balance > 0) money2mon(ctx, shk, balance);
  else if (balance < 0) money2u(ctx, shk, -balance);
  if (e.robbed) e.robbed = Math.max(0, e.robbed - tmp);
}

/** ref: src/shk.c rouse_shk() */
function rouseShk(ctx: Ctx, shk: Entity, e: Eshk): void {
  const m = shk.c.monster;
  if (!m || !helpless(ctx, shk.id)) return;
  // greed induced recovery...
  if (canSpotMon(ctx, shk))
    say(ctx, m.asleep ? 'pay.wakes_up' : 'pay.can_move_again', { shk: shkname(ctx, e) });
  m.asleep = false;
  unfreezeMonst(ctx, shk.id);
}

/**
 * The bill as lines to pay: used-up items first, then by cost (highest first), a partly used
 * stack as two lines. ref: src/shk.c make_itemized_bill(), sortbill_cmp()
 */
function makeItemizedBill(ctx: Ctx, e: Eshk): IBill[] {
  const rows: (IBill & { bidx: number })[] = [];
  e.bill.forEach((bp, bidx) => {
    const otmp = bpToObj(ctx, bp);
    const quan = otmp?.c.item?.quantity;
    if (!otmp || quan === undefined) return;
    const base = { oid: bp.oid, useup: bp.useup, bidx };
    if (bp.useup) {
      rows.push({ ...base, quan: bp.bquan, cost: bp.price * bp.bquan, used: 'full_used' });
      return;
    }
    if (quan < bp.bquan) {
      const q = bp.bquan - quan;
      rows.push({ ...base, quan: q, cost: bp.price * q, used: 'part_used' });
    }
    rows.push({
      ...base,
      quan,
      cost: bp.price * quan,
      used: quan < bp.bquan ? 'part_intact' : 'full_intact',
    });
  });
  rows.sort(
    (a, b) => Number(usedUp(b.used)) - Number(usedUp(a.used)) || b.cost - a.cost || a.bidx - b.bidx,
  );
  return rows.map(({ bidx: _, ...r }) => r);
}

const entryOf = (e: Eshk, row: IBill): BillEntry | undefined =>
  e.bill.find((bp) => bp.oid === row.oid && bp.useup === row.useup);

/** The billed object with the line's quantity, for naming. */
function lineObj(ctx: Ctx, bp: BillEntry, quan: number): Entity | null {
  const o = bpToObj(ctx, bp);
  const it = o?.c.item;
  return o && it ? { ...o, c: { ...o.c, item: { ...it, quantity: quan } } } : null;
}

/** ref: src/shk.c insufficient_funds() (`cost` 0: is there any gold or credit at all) */
function insufficientFunds(ctx: Ctx, e: Eshk, item: Entity, cost: number): boolean {
  const umoney = moneyCnt(ctx, ctx.state.playerId);
  const seem = hiddenGold(ctx) > 0;
  if (!cost && umoney + e.credit === 0) {
    say(ctx, 'pay.no_gold_credit', { seem: seem ? '@pay.seem_to_' : '', left: '@pay.left' });
    return true;
  }
  if (cost && umoney + e.credit < cost) {
    say(ctx, 'pay.not_enough_for', {
      seem: seem ? '@pay.seem_to' : '',
      credit: e.credit > 0 ? '@pay.or_credit' : '',
      item: paydoname(ctx.state, ctx.defs, item),
    });
    return true;
  }
  return false;
}

/**
 * "Please pay for the other X before buying this one." (not the "ones in the sack" wording:
 * contained objects are paid as lines of their own here). ref: src/shk.c reject_purchase()
 */
function rejectPurchase(ctx: Ctx, shk: Entity, obj: Entity, billedQuan: number): void {
  const it = obj.c.item;
  if (!it) return;
  const intact = it.quantity;
  // temporarily change obj to refer to the used up portion
  const usedPart = { ...obj, c: { ...obj.c, item: { ...it, quantity: billedQuan - intact } } };
  say(ctx, angry(shk) ? 'pay.reject_angry' : 'pay.reject', {
    item: xnameOf(ctx.state, ctx.defs, usedPart),
    which: intact > 1 ? '@pay.these' : '@pay.this_one',
  });
}

/** The "Thank you" line and the action's cost. */
function finishPay(ctx: Ctx, shk: Entity, e: Eshk, payDone: boolean, paid: boolean): number {
  if (payDone && !angry(shk) && paid) {
    const level = ctx.state.levels[e.shoplevel];
    say(ctx, e.surcharge ? 'pay.thank_you_surcharge' : 'pay.thank_you', {
      shk: shkname(ctx, e),
      shop: level ? shopNameParam(level, e.shoproom) : '@shop.name.general',
    });
  }
  return paid ? NORMAL_SPEED : 0;
}

/**
 * Pays the bill line by line from `data.idx`; asks "X for N zorkmids.  Pay?" when itemizing
 * (`answer`: the reply for line `idx`). ref: src/shk.c pay_billed_items(), dopayobj(),
 * update_bill()
 */
function payLines(ctx: Ctx, data: PayData, answer?: boolean): number {
  const shk = ctx.state.entities[String(data.shk)];
  const e = data.shk === undefined ? null : eshkOf(ctx, data.shk);
  const bill = data.bill ?? [];
  if (!shk || !e) return data.paid ? NORMAL_SPEED : 0;
  for (let i = data.idx ?? 0; i < bill.length; i++) {
    const row = bill[i];
    const bp = row ? entryOf(e, row) : undefined;
    if (!row || !bp) continue;
    const consumed = usedUp(row.used);
    const obj = lineObj(ctx, bp, row.quan);
    if (!obj) continue;
    let buy: 'buy' | 'skip' | 'cant' = 'buy';
    const ltmp = bp.price * row.quan;
    if (data.itemize) {
      if (answer === undefined) {
        if (insufficientFunds(ctx, e, obj, 0)) {
          // PAY_BROKE
          data.paid = true;
          return finishPay(ctx, shk, e, true, true);
        }
        data.idx = i;
        ctx.ask(
          {
            id: 'pay-item',
            kind: 'yn',
            key: row.quan === 1 ? 'pay.item_prompt1' : 'pay.item_prompt',
            params: {
              item: paydoname(ctx.state, ctx.defs, obj),
              n: ltmp,
              zm: zorkmids(ltmp),
            },
            cancellable: true,
          },
          PAY_ID,
          data as unknown as Json,
        );
        return 0;
      }
      if (!answer) buy = 'skip'; // don't want to buy
      answer = undefined;
    }
    const live = ctx.state.entities[String(bp.oid)];
    if (!consumed && live?.c.item && live.c.item.quantity < bp.bquan) {
      // partly used goods: shk won't sell the intact portion until the used up portion has been
      // paid for
      rejectPurchase(ctx, shk, live, bp.bquan);
      buy = 'skip';
    }
    if (buy === 'buy' && insufficientFunds(ctx, e, obj, ltmp)) buy = data.itemize ? 'skip' : 'cant';
    if (buy === 'cant') return finishPay(ctx, shk, e, false, !!data.paid);
    if (buy === 'skip') continue;
    pay(ctx, ltmp, shk.id, e);
    shkNamesObj(ctx, e, obj, consumed, ltmp);
    // update_bill()
    if (row.used === 'part_used') {
      bp.bquan = live?.c.item?.quantity ?? bp.bquan;
      const rest = bill.find((r) => r.oid === row.oid && !r.useup && r.used === 'part_intact');
      if (rest) rest.used = 'full_intact';
    } else {
      if (live?.c.item && !bp.useup) delete live.c.item.unpaid;
      dropBillEntry(ctx, shk.id, bp);
    }
    data.paid = true;
  }
  return finishPay(ctx, shk, e, true, !!data.paid);
}

/** Pays the debt, then the bill. ref: src/shk.c dopay() from `proceed:` */
function proceed(ctx: Ctx, shk: Entity, resident: EntityId | null): number {
  const e = eshkOf(ctx, shk.id);
  if (!e) return 0;
  const ltmp = e.robbed;
  const name = shkname(ctx, e);
  const stashed = hiddenGold(ctx) > 0;
  // wake sleeping shk when someone who owes money offers payment
  if (ltmp || e.bill.length || e.debit) rouseShk(ctx, shk, e);
  if (helpless(ctx, shk.id)) {
    // still asleep/paralyzed
    say(ctx, ctx.rng.rn2(2) ? 'pay.napping' : 'pay.no_respond', { shk: name });
    return 0;
  }
  if (shk.id !== resident && !angry(shk)) {
    // (the robbed shopkeeper's compensation: step 5)
    if (!ltmp) say(ctx, 'pay.not_owe', { shk: name });
    return NORMAL_SPEED;
  }
  if (!e.bill.length && !e.debit) {
    if (!ltmp && !angry(shk)) {
      say(ctx, 'pay.not_owe', { shk: name });
      if (!moneyCnt(ctx, ctx.state.playerId))
        say(ctx, 'pay.no_money', { seem: stashed ? '@pay.seem_to' : '' });
      return NORMAL_SPEED;
    }
    return 0; // "is after blood, not gold!" and the appeasement: step 5
  }
  if (shk.id !== resident) return 0; // dopay: not to shopkeeper?
  const data: PayData = { step: 'item', shk: shk.id, paid: false };
  // pay debt, if any, first
  if (e.debit) {
    const dtmp = e.debit;
    const umoney = moneyCnt(ctx, ctx.state.playerId);
    say(ctx, 'pay.owe_debit', { shk: name, n: dtmp, zm: zorkmids(dtmp) });
    if (umoney + e.credit < dtmp) {
      say(ctx, 'pay.not_enough_debit', {
        seem: stashed ? '@pay.seem_to' : '',
        credit: e.credit ? '@pay.or_credit' : '',
      });
      return NORMAL_SPEED;
    }
    if (e.credit >= dtmp) {
      e.credit -= dtmp;
      say(ctx, 'pay.debt_covered');
    } else if (!e.credit) {
      money2mon(ctx, shk.id, dtmp);
      say(ctx, 'pay.debt_paid');
    } else {
      money2mon(ctx, shk.id, dtmp - e.credit);
      e.credit = 0;
      say(ctx, 'pay.debt_offset');
      say(ctx, 'pay.remainder');
    }
    e.debit = 0;
    data.paid = true;
  }
  // now check items on bill
  if (!e.bill.length) return finishPay(ctx, shk, e, true, !!data.paid);
  const bill = makeItemizedBill(ctx, e);
  data.bill = bill;
  const umoney = moneyCnt(ctx, ctx.state.playerId);
  if (!umoney && !e.credit) {
    say(ctx, 'pay.no_gold_credit', {
      seem: stashed ? '@pay.seem_to_' : '',
      left: data.paid ? '@pay.left' : '',
    });
    return data.paid ? NORMAL_SPEED : 0;
  }
  const first = e.bill[0];
  const firstObj = first ? bpToObj(ctx, first) : null;
  const moreThanOne =
    e.bill.length > 1 ||
    (!!first && !first.useup && (firstObj?.c.item?.quantity ?? 0) < first.bquan);
  const cheapest = Math.min(...bill.map((r) => r.cost));
  if (umoney + e.credit < cheapest) {
    say(ctx, 'pay.cannot_afford', {
      any: moreThanOne ? '@pay.any_of' : '',
      items: moreThanOne ? '@pay.the_items' : '@pay.the_item',
      where: e.bill.length > 1 ? '@pay.youve_picked' : '@pay.on_your_bill',
    });
    if (stashed) say(ctx, 'pay.maybe_stashed');
    return data.paid ? NORMAL_SPEED : 0;
  }
  data.idx = 0;
  if (!moreThanOne) {
    data.itemize = false;
    return payLines(ctx, data);
  }
  data.step = 'itemize';
  ctx.ask(
    { id: 'pay-itemize', kind: 'yn', key: 'pay.itemize', cancellable: true },
    PAY_ID,
    data as unknown as Json,
  );
  return 0;
}

/** Validates the shopkeeper picked by "Pay whom?" (or the cell the action was offered on). */
function payWhom(ctx: Ctx, id: EntityId): number {
  const shks = levelShks(ctx);
  const resident = residentOf(ctx, shks);
  const m = ctx.state.entities[String(id)];
  const e = eshkOf(ctx, id);
  if (!m?.c.monster || !e) {
    say(ctx, 'pay.no_one_there');
    return 0;
  }
  if (id !== resident && !next2u(ctx, m)) {
    say(ctx, 'pay.too_far', { shk: shkname(ctx, e) });
    return 0;
  }
  return proceed(ctx, m, resident);
}

/** ref: src/shk.c dopay() */
function dopay(ctx: Ctx): number {
  const shks = levelShks(ctx);
  let sk = 0;
  let seensk = 0;
  let nexttosk = 0;
  let nxtm: Entity | null = null;
  let resident: EntityId | null = null;
  const room = uShops(ctx)[0];
  // Find how many shk's there are, how many are in sight, and are you in a shop room with one.
  for (const m of shks) {
    sk++;
    if (next2u(ctx, m)) {
      // next to an irate shopkeeper? prioritize that
      if (nxtm && angry(nxtm)) continue;
      nexttosk++;
      nxtm = m;
    }
    if (canSpotMon(ctx, m)) seensk++;
    if (inhishop(ctx, m.id) && room === eshkOf(ctx, m.id)?.shoproom) resident = m.id;
  }
  if (nxtm && nexttosk === 1) return proceed(ctx, nxtm, resident);
  const hero = getPlayer(ctx.state);
  const blind = hasProp(hero, P.BLINDED);
  if ((!sk && (!blind || hasProp(hero, P.TELEPAT))) || (!blind && !seensk)) {
    say(ctx, 'pay.no_shk');
    return 0;
  }
  if (!seensk) {
    say(ctx, 'pay.cant_see');
    return 0;
  }
  // The usual case. Allow paying at a distance when inside a tended shop.
  if (sk === 1 && resident !== null) {
    const r = ctx.state.entities[String(resident)];
    return r ? proceed(ctx, r, resident) : 0;
  }
  const seen = shks.filter((m) => canSpotMon(ctx, m));
  if (seensk === 1) {
    const m = seen[0];
    if (!m) return 0;
    if (m.id !== resident && !next2u(ctx, m)) {
      const e = eshkOf(ctx, m.id);
      if (e) say(ctx, 'pay.not_near', { shk: shkname(ctx, e) });
      return 0;
    }
    return proceed(ctx, m, resident);
  }
  // "Pay whom?": a menu of the shopkeepers in view, not getpos()
  ctx.ask(
    {
      id: 'pay-whom',
      kind: 'menu',
      key: 'pay.whom',
      cancellable: true,
      options: seen.map((m) => {
        const e = eshkOf(ctx, m.id);
        return {
          value: m.id,
          key: 'pay.whom_option',
          params: { shk: e ? shkname(ctx, e) : `@${m.def}` },
        };
      }),
    },
    PAY_ID,
    { step: 'whom' },
  );
  return 0;
}

/** She owes a shopkeeper on this level something. */
function owes(ctx: Ctx, shks: readonly Entity[]): boolean {
  return shks.some((m) => {
    const e = eshkOf(ctx, m.id);
    return !!e && (e.bill.length > 0 || e.debit > 0);
  });
}

const payAction: ActionDef = {
  id: PAY_ID,
  labelKey: 'action.nh:pay',
  handles: 'mod',
  // offered while a shopkeeper is on the level and she owes, is in a shop or is next to him;
  // and on an adjacent shopkeeper
  offer(ctx, target): Offer[] {
    const shks = levelShks(ctx);
    if (shks.length === 0) return [];
    if (target.kind === 'self') {
      if (!owes(ctx, shks) && uShops(ctx).length === 0 && !shks.some((m) => next2u(ctx, m)))
        return [];
      return [{ action: { type: 'mod', action: PAY_ID }, labelKey: 'action.nh:pay' }];
    }
    if (target.kind !== 'cell') return [];
    const m = shks.find((s) => s.c.pos?.x === target.pos.x && s.c.pos.y === target.pos.y);
    if (!m || !next2u(ctx, m) || !canSpotMon(ctx, m)) return [];
    const e = eshkOf(ctx, m.id);
    return [
      {
        action: { type: 'mod', action: PAY_ID, args: { shk: m.id } },
        labelKey: 'action.nh:pay_shk',
        params: { shk: e ? shkname(ctx, e) : `@${m.def}` },
      },
    ];
  },
  perform(ctx, action) {
    const a = action.type === 'mod' ? (action.args as { shk?: unknown } | undefined) : undefined;
    if (typeof a?.shk === 'number') return payWhom(ctx, a.shk);
    return dopay(ctx);
  },
  answer(ctx, value: Json, raw: Json) {
    const data = raw as unknown as PayData;
    if (data.step === 'whom') return typeof value === 'number' ? payWhom(ctx, value) : 0;
    if (data.step === 'itemize') {
      if (value === null) return data.paid ? NORMAL_SPEED : 0; // 'q'
      data.itemize = value === true;
      data.step = 'item';
      data.idx = 0;
      return payLines(ctx, data);
    }
    return payLines(ctx, data, value === true);
  },
};

export const PAY_ACTIONS: readonly ActionDef[] = [payAction];
