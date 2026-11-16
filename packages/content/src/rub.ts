// #rub: a lamp (the magic lamp's djinni), the brass lantern, and a lump of royal jelly on an
// egg. The gray stones (touchstones) are not ported.
// ref: src/apply.c dorub(), rub_ok(), use_royal_jelly(), jelly_ok()
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
  type Offer,
  type PlayerAction,
} from '@nh/core';
import { BRASS_LANTERN, OIL_LAMP, beginBurn, endBurn } from './burnstate';
import { MAGIC_LAMP } from './bottle';
import { uwepOf } from './combat';
import { answerDjinniWish, djinniFromBottle, isDjinniWish } from './djinni';
import { EGG, attachEggHatchTimeout, eggHatchAt, killEgg } from './eggstate';
import { invOption, wieldTool } from './itemactions';
import { shkYour } from './light';
import { useup } from './magic';
import { nohands } from './mondata';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import { P, hasProp } from './props';
import { checkUnpaid } from './shk';
import { heroForm } from './upoly';

export const RUB_ID: DefId = 'nh:rub';

const ROYAL_JELLY: DefId = 'nh:lump_of_royal_jelly';
const KILLER_BEE: DefId = 'nh:killer_bee';
const QUEEN_BEE: DefId = 'nh:queen_bee';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** What #rub suggests: the lamps, the lantern and royal jelly. ref: src/apply.c rub_ok() */
const rubOk = (def: DefId): boolean =>
  def === OIL_LAMP || def === MAGIC_LAMP || def === BRASS_LANTERN || def === ROYAL_JELLY;

const formNohands = (ctx: Ctx): boolean => {
  const form = heroForm(ctx);
  return !!form && nohands(form);
};

const heroItem = (ctx: Pick<Ctx, 'state'>, id: unknown): Entity | null => {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

interface RubArgs {
  item?: unknown;
  /** the rub queued after wielding the lamp (C's cmdq_add_ec(dorub)) */
  again?: unknown;
}

const rubArgs = (action: PlayerAction): RubArgs | undefined =>
  action.type === 'mod' ? (action.args as RubArgs | undefined) : undefined;

/** The royal jelly's egg menu in progress (the prompt's data). */
interface JellyData {
  jelly: number;
}

const isJellyData = (data: Json): boolean =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as { jelly?: unknown }).jelly === 'number';

/** The carried eggs royal jelly can be rubbed on. ref: src/apply.c jelly_ok() */
const eggs = (ctx: Ctx): Entity[] =>
  inventoryOf(ctx.state, ctx.state.playerId).filter((o) => o.def === EGG);

/**
 * Rubs the wielded lamp: a magic lamp with its djinni releases it one time in 3 (a usage fee in
 * a shop; the lamp becomes an oil lamp with rn1(500, 1000) turns of oil, still lit if it was,
 * before the djinni comes out; the magic lamp is then known), else "You see a puff of smoke."
 * half the time or nothing happens; the lantern has Adventure's lines; an oil lamp does nothing.
 * Returns the time taken (0 while the djinni's wish is asked). ref: src/apply.c dorub()
 */
function rubLamp(ctx: Ctx, obj: Entity): number {
  const it = obj.c.item;
  if (!it) return 0;
  if (obj.def === MAGIC_LAMP) {
    if (it.spe > 0 && !ctx.rng.rn2(3)) {
      checkUnpaid(ctx, obj, true); // unusual item use
      // bones preparation: perform the lamp transformation before releasing the djinni in
      // case the latter turns out to be fatal
      const lit = it.lit === true;
      if (lit) endBurn(ctx, obj, false); // the magic lamp burns without a timer
      obj.def = OIL_LAMP;
      it.spe = 0; // for safety
      it.age = ctx.rng.rn2(500) + 1000; // rn1(500, 1000)
      if (lit) beginBurn(ctx, obj, true);
      const pending = djinniFromBottle(ctx, obj, RUB_ID);
      discover(ctx, MAGIC_LAMP);
      return pending ? 0 : NORMAL_SPEED;
    } else if (ctx.rng.rn2(2)) {
      say(ctx, hasProp(getPlayer(ctx.state), P.BLINDED) ? 'rub.smell_smoke' : 'rub.puff');
    } else say(ctx, 'rub.nothing');
  } else if (obj.def === BRASS_LANTERN) {
    // message from Adventure
    say(ctx, 'rub.lantern');
    say(ctx, 'rub.lantern2');
  } else say(ctx, 'rub.nothing');
  return NORMAL_SPEED;
}

/**
 * Royal jelly smeared on a stack of eggs: a killer bee egg becomes a queen bee egg; a cursed lump
 * kills the eggs ("The egg quivers feebly." when that changed anything); otherwise an egg of a
 * known kind starts to hatch if it was not going to, and a blessed lump makes the hatchling take
 * her for its parent ("The egg quivers briefly."). One lump is used up.
 * ref: src/apply.c use_royal_jelly()
 */
function useRoyalJelly(ctx: Ctx, jelly: Entity, eobj: Entity): number {
  const eit = eobj.c.item;
  const jit = jelly.c.item;
  if (!eit || !jit) return 0;
  say(ctx, 'rub.smear', {
    whose: shkYour(ctx, eobj, false),
    item: xnameOf(ctx.state, ctx.defs, eobj),
  });
  const many = eit.quantity > 1;
  const quiver = (how: 'feebly' | 'briefly'): void =>
    say(ctx, `rub.quiver_${how}${many ? '_pl' : ''}`, {
      item: xnameOf(ctx.state, ctx.defs, eobj),
    });
  const oldcorpsenm = eit.corpseOf;
  if (eit.corpseOf === KILLER_BEE) eit.corpseOf = QUEEN_BEE;
  if (jit.buc === 'cursed') {
    if (eggHatchAt(ctx.state, eobj.id) !== null || eit.corpseOf !== oldcorpsenm) quiver('feebly');
    else say(ctx, 'rub.nothing_seems');
    killEgg(ctx, eobj.id);
  } else {
    const wasTimed = eggHatchAt(ctx.state, eobj.id) !== null;
    if (eit.corpseOf !== undefined) {
      if (!wasTimed) attachEggHatchTimeout(ctx, eobj.id, 0);
      // blessed royal jelly will make the hatched creature think you're the parent - but
      // has no effect if you laid the egg
      if (jit.buc === 'blessed' && !eit.spe) eit.spe = 2;
    }
    const timed = eggHatchAt(ctx.state, eobj.id) !== null;
    if ((timed && !wasTimed) || eit.spe === 2 || eit.corpseOf !== oldcorpsenm) quiver('briefly');
    else say(ctx, 'rub.nothing_seems');
  }
  useup(ctx, jelly.id);
  return NORMAL_SPEED;
}

/**
 * #rub: offered on each carried lamp, lantern and lump of royal jelly (rub_ok()). A lamp is
 * wielded first (a move; the rub follows on the next, as C requeues dorub()); royal jelly asks
 * for the eggs to rub it on. ref: src/apply.c dorub()
 */
const rub: ActionDef = {
  id: RUB_ID,
  labelKey: 'action.nh:rub',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item' || formNohands(ctx)) return [];
    const e = heroItem(ctx, target.id);
    if (!e || !rubOk(e.def)) return [];
    return [
      { action: { type: 'mod', action: RUB_ID, args: { item: e.id } }, labelKey: 'action.nh:rub' },
    ];
  },
  perform(ctx, action) {
    if (formNohands(ctx)) {
      say(ctx, 'rub.nohands');
      return 0;
    }
    const obj = heroItem(ctx, rubArgs(action)?.item);
    if (!obj || !rubOk(obj.def)) return 0;
    if (obj.def === ROYAL_JELLY) {
      const list = eggs(ctx);
      if (list.length === 0) {
        say(ctx, 'rub.no_eggs'); // getobj(): "You don't have anything to rub the royal jelly on."
        return 0;
      }
      ctx.ask(
        {
          id: 'rub-jelly',
          kind: 'menu',
          key: 'rub.jelly_on',
          cancellable: true,
          options: list.map((e) => invOption(ctx, e)),
        },
        RUB_ID,
        { jelly: obj.id } satisfies JellyData as unknown as Json,
      );
      return 0;
    }
    if (uwepOf(ctx)?.id !== obj.id) {
      if (!wieldTool(ctx, obj, 'rub')) return 0;
      // we're now wielding it: the next move rubs it (C queues dorub)
      ctx.state.occupation = {
        action: { type: 'mod', action: RUB_ID, args: { item: obj.id, again: true } },
        data: null,
      };
      return NORMAL_SPEED;
    }
    return rubLamp(ctx, obj);
  },
  answer(ctx, value, data) {
    if (isDjinniWish(data)) return answerDjinniWish(ctx, RUB_ID, value, data);
    if (!isJellyData(data)) return 0;
    const jelly = heroItem(ctx, (data as unknown as JellyData).jelly);
    const egg = heroItem(ctx, value);
    // a cancelled menu: the lump stays (ECMD_CANCEL)
    if (!jelly || jelly.def !== ROYAL_JELLY || !egg || egg.def !== EGG) return 0;
    return useRoyalJelly(ctx, jelly, egg);
  },
  // the rub queued after wielding the lamp runs on the next move
  continues: (ctx, act) =>
    ctx.state.occupation?.action.type === 'mod' &&
    ctx.state.occupation.action.action === RUB_ID &&
    rubArgs(ctx.state.occupation.action)?.again === true &&
    rubArgs(act)?.again !== true,
};

export const RUB_ACTIONS: readonly ActionDef[] = [rub];
