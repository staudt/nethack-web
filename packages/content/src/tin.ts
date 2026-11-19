// Tins: opening one (start_tin(), the opentin occupation: fingers, a dagger or knife, a pick-axe
// or axe, the tin opener, a blessed tin), what is inside (consume_tin(): the varieties, spinach,
// empty, rotten and booby-trapped tins, "It smells like X. Eat it?"), the shop's charge
// (costly_tin()), applying a tin opener (use_tin_opener()) and the tinning kit
// (use_tinning_kit()). eat.ts's Eat hands tins here through setStartTin() (this module eats
// through eat.ts's cprefx()/cpostfx()).
// ref: src/eat.c start_tin(), opentin(), consume_tin(), use_up_tin(), costly_tin(),
// use_tin_opener(), tinopen_ok(), floorfood() (tinnable corpses), tin_ok(); src/apply.c
// use_tinning_kit(), tinnable()
//
// Slippery fingers (Glib) make a tin slip from them; greasy tins make them slippery.
// Not ported: conducts, the Riders' corpses (no Riders), feeling a
// cockatrice corpse while blind (floorfood()), the "Really wield?" question for a known cursed
// tin opener.
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  itemsAt,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type MonsterDef,
  type Msg,
  type PromptOption,
} from '@nh/core';
import { gainstr } from './attrib';
import { bTrapped } from './btrapped';
import { uwepOf } from './combat';
import { chokeSnack, continuesOpening, cprefxMon, setStartTin, useup } from './eat';
import { costlySpot } from './eshk';
import { heroFemale } from './gender';
import { cpostfxOf } from './givit';
import { hcolor } from './hcolor';
import { hungerData, lesshungry, makeVomiting } from './hunger';
import { dropx, invOption, wieldTool } from './itemactions';
import { mksobj, placeObject, splitStack, stackobj } from './items';
import { fingersOrGloves, glibTimeout, isGlib, makeGlib } from './glib';
import { cantwield, isRider, vegetarian } from './mondata';
import { reviveCorpseLate } from './rider';
import { violatedVegetarian } from './luck';
import { doname, xnameOf } from './objnam';
import { rndmonnam } from './perception';
import { P, hasProp, wornIn } from './props';
import { canReachFloor } from './reach';
import { costlyAlteration, checkUnpaid } from './shk';
import { acurrstr } from './stats';
import { touchPetrifies } from './stonestate';
import { instapetrify } from './stonetouch';
import { polyWhenStoned } from './golem';
import {
  HOMEMADE_TIN,
  OPENTIN_ID,
  SPINACH_TIN,
  TIN,
  TINTXT,
  setTinCtx,
  setTinVariety,
  tinCtx,
  tinVariety,
} from './tins';
import { heroForm } from './upoly';
import { isGenocided } from './vanquished';
import { holdAnotherObject } from './wish';
import { isBoxTrapped, setBoxTrapped } from './btrapstate';

export { OPENTIN_ID };

export const TIN_OPENER: DefId = 'nh:tin_opener';
export const TINNING_KIT: DefId = 'nh:tinning_kit';
const CORPSE: DefId = 'nh:corpse';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/** The weapons a tin opens with in three moves. ref: start_tin() */
const BLADES: readonly DefId[] = [
  'nh:dagger',
  'nh:silver_dagger',
  'nh:elven_dagger',
  'nh:orcish_dagger',
  'nh:athame',
  'nh:knife',
  'nh:stiletto',
  'nh:crysknife',
];

/** ref: include/mondata.h metallivorous() */
const metallivorous = (form: MonsterDef | null): boolean =>
  form !== null && form.flags.includes('metallivore');

/** Whether the hero can still get at the tin: she has it, or it lies at her feet in reach. */
function tinHere(ctx: Ctx, tin: Entity): boolean {
  const it = tin.c.item;
  if (!it) return false;
  if (it.carriedBy !== null) return it.carriedBy === ctx.state.playerId;
  const hp = hero(ctx).c.pos;
  const p = tin.c.pos;
  return (
    !!hp && !!p && p.level === hp.level && p.x === hp.x && p.y === hp.y && canReachFloor(ctx, true)
  );
}

// ---------------------------------------------------------------------------------------------
// the shop, using it up

/**
 * Charges for one tin of a shop's stack (split off when there are more: the one being opened):
 * "You open it, you pay for it!" (`'open'`) or destroyed by its booby trap (`'destroy'`). Returns
 * the tin (the piece split off, or the tin itself). ref: src/eat.c costly_tin()
 */
function costlyTin(ctx: Ctx, tin: Entity, how: 'open' | 'destroy'): Entity {
  const it = tin.c.item;
  if (!it) return tin;
  const carried = it.carriedBy === ctx.state.playerId;
  const p = tin.c.pos;
  const costly = carried ? !!it.unpaid : !!p && costlySpot(ctx, p.x, p.y) && !it.noCharge;
  if (!costly) return tin;
  let piece = tin;
  if (it.quantity > 1) {
    const id = splitStack(ctx, tin.id, 1);
    const child = ctx.state.entities[String(id)];
    if (child?.c.item) {
      // splitobj() keeps the piece where the stack is, unmerged; it is used up at once
      if (carried) child.c.item.carriedBy = ctx.state.playerId;
      else if (p) placeObject(ctx, id, p.level, p.x, p.y);
      piece = child;
      const rec = tinCtx(ctx.state);
      if (rec) rec.id = id;
    }
  }
  costlyAlteration(ctx, piece, how, carried ? null : (piece.c.pos ?? null));
  return piece;
}

/** Uses the tin up and forgets it (C's tin context). ref: src/eat.c use_up_tin() */
function useUpTin(ctx: Ctx, tin: Entity): void {
  if (ctx.state.entities[String(tin.id)]) useup(ctx, tin);
  setTinCtx(ctx, null);
}

// ---------------------------------------------------------------------------------------------
// what is inside

/** The "Eat it?" question in progress (the prompt's data). */
interface EatTinData {
  eatTin: EntityId;
  /** The variety drawn when it was opened (tin_variety()). */
  r: number;
}

const isEatTinData = (data: Json): boolean =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as { eatTin?: unknown }).eatTin === 'number';

/** "It smells like newts." (chicken for a cockatrice she cannot be stoned by; the unique's). */
function smellsLike(ctx: Ctx, mon: MonsterDef): Msg {
  const h = hero(ctx);
  if (
    (mon.id === 'nh:cockatrice' || mon.id === 'nh:chickatrice') &&
    (hasProp(h, P.STONE_RES) || hasProp(h, P.HALLUC))
  )
    return { key: 'tin.smells.chicken' }; // suppress pluralization
  if (hasProp(h, P.HALLUC)) return { key: 'tin.smells', params: { mon: `@${rndmonnam(ctx)}` } };
  const pname = mon.flags.includes('pname');
  if (!pname && mon.genFlags.includes('uniq'))
    return { key: 'tin.smells.the', params: { mon: `@${mon.id}` } }; // the_unique_pm()
  if (pname) return { key: 'tin.smells.as_is', params: { mon: `@${mon.id}` } }; // type_is_pname()
  return { key: 'tin.smells', params: { mon: `@${mon.id}` } };
}

/**
 * The tin is open: a booby trap (or a cursed tin that is not homemade, 1 time in 8) blows up;
 * an empty tin is gone; otherwise she is told what it holds and asked "Eat it?" (a metallivore
 * eats it, tin and all). Returns true while the question is asked. `mesg`: the opening line.
 * ref: src/eat.c consume_tin() (up to the question)
 */
function consumeTin(ctx: Ctx, tin: Entity, mesg: string): boolean {
  const it = tin.c.item;
  if (!it) return false;
  // if you've eaten tin itself, chance to not eat contents gets bypassed
  const alwaysEat = metallivorous(heroForm(ctx));
  const r = tinVariety(ctx.rng, it, false);
  if (
    isBoxTrapped(ctx.state, tin.id) ||
    (it.buc === 'cursed' && r !== HOMEMADE_TIN && !ctx.rng.rn2(8))
  ) {
    setBoxTrapped(ctx, tin.id, false);
    bTrapped(ctx, 'tin');
    useUpTin(ctx, costlyTin(ctx, tin, 'destroy'));
    return false;
  }
  say(ctx, mesg); // "You succeed in opening the tin."
  if (r !== SPINACH_TIN) {
    const mnum = it.corpseOf;
    if (mnum === undefined || !ctx.defs.isMonster(mnum)) {
      if (hasProp(hero(ctx), P.HALLUC))
        say(ctx, ctx.rng.rn2(2) ? 'tin.full_of_souffle' : 'tin.full_of_water');
      else say(ctx, 'tin.empty');
      it.known.spe = true;
      useUpTin(ctx, costlyTin(ctx, tin, 'open'));
      if (alwaysEat) lesshungry(ctx, 5, false, chokeSnack); // metallivorous hero ate the tin itself
      return false;
    }
    if (!alwaysEat) {
      const smell = smellsLike(ctx, ctx.defs.monster(mnum));
      say(ctx, smell.key, smell.params);
      askEat(ctx, tin, r);
      return true;
    }
  } else {
    // spinach...
    if (it.buc === 'cursed') {
      if (hasProp(hero(ctx), P.BLINDED)) say(ctx, 'tin.decaying_blind');
      else say(ctx, 'tin.decaying', { color: hcolor(ctx, 'green') });
    } else {
      say(ctx, 'tin.spinach');
      it.known.spe = true;
    }
    if (!alwaysEat) {
      askEat(ctx, tin, r);
      return true;
    }
  }
  eatTin(ctx, tin, r, true);
  return false;
}

function askEat(ctx: Ctx, tin: Entity, r: number): void {
  ctx.ask({ id: 'eat-tin', kind: 'yn', key: 'tin.eat_it', cancellable: true }, OPENTIN_ID, {
    eatTin: tin.id,
    r,
  } satisfies EatTinData as unknown as Json);
}

/** "You discard the open tin." ref: consume_tin()'s `y_n("Eat it?") == 'n'` */
function discardTin(ctx: Ctx, tin: Entity, r: number): void {
  say(ctx, 'tin.discard');
  if (r !== SPINACH_TIN && !hasProp(hero(ctx), P.HALLUC) && tin.c.item) tin.c.item.known.spe = true;
  useUpTin(ctx, costlyTin(ctx, tin, 'open'));
}

/**
 * She eats what is in the tin: the monster's meat (cprefx() and cpostfx() as for its corpse; a
 * rotten tin makes her vomit, else the variety's nutrition, a homemade tin no more than the
 * corpse's), or spinach ("This makes you feel like Popeye!", Str; 600 nutrition blessed,
 * 400..599 uncursed, 201..600 cursed). A metallivore also eats the tin (5 more).
 * ref: src/eat.c consume_tin() (after the question)
 */
function eatTin(ctx: Ctx, tin0: Entity, r: number, alwaysEat: boolean): void {
  let tin = tin0;
  const it = tin.c.item;
  if (!it) return;
  const h = hero(ctx);
  const extra = alwaysEat ? 5 : 0;
  let gone = false;
  const useUp = (): void => {
    if (gone) return;
    gone = true;
    useUpTin(ctx, tin);
  };
  if (r !== SPINACH_TIN) {
    const mnum = it.corpseOf;
    if (mnum === undefined || !ctx.defs.isMonster(mnum)) return;
    const mon = ctx.defs.monster(mnum);
    // in case stop_occupation() was called on previous meal
    hungerData(ctx).victual = null;
    const variety = TINTXT[r];
    say(ctx, 'tin.consume', {
      variety: { key: variety?.txtKey ?? 'tin.variety.0' },
      mon: `@${mnum}`,
    });
    if (!vegetarian(mon)) violatedVegetarian(ctx); // eating_conducts()
    it.known.spe = true;
    // charge for one at pre-eating cost
    tin = costlyTin(ctx, tin, 'open');
    // cprefx() or cpostfx() might use up tin to keep it out of bones
    cprefxMon(ctx, mon, useUp);
    if (!gone && !ctx.state.gameOver)
      cpostfxOf(ctx, mon, (c) => {
        useUp();
        lesshungry(c, 200 + extra, false, chokeSnack); // most tin effects end up being skipped
      });
    if (gone || ctx.state.gameOver) return;
    const nut = variety?.nut ?? 0;
    if (nut < 0) {
      // rotten
      makeVomiting(ctx, 10 + ctx.rng.rn2(15), false); // rn1(15, 10)
    } else {
      // nutrition from a homemade tin (made from a single corpse) shouldn't be more than
      // nutrition from the corresponding corpse
      let nutamt = nut;
      if (r === HOMEMADE_TIN && nutamt > mon.nutrition) nutamt = mon.nutrition;
      nutamt += extra;
      // use up tin now; lesshungry() could be fatal
      useUp();
      lesshungry(ctx, nutamt, false, chokeSnack);
    }
    if (variety?.greasy && !ctx.state.gameOver) {
      // normal hero is !Glib, because you can't open tins when Glib, but one poly'd into
      // metallivorous form might already be Glib
      const alreadyglib = glibTimeout(ctx.state);
      makeGlib(ctx, alreadyglib + 5 + ctx.rng.rn2(11)); // 5..15: rn1(11, 5)
      say(ctx, alreadyglib ? 'glib.greasy_more' : 'glib.greasy', {
        variety: { key: variety.txtKey },
        fingers: fingersOrGloves(ctx, true),
      });
    }
  } else {
    // spinach
    const cursed = it.buc === 'cursed';
    if (!cursed) {
      // "Swee'pea" is a character from the Popeye cartoons
      const who = hasProp(h, P.HALLUC)
        ? 'sweepea'
        : !hasProp(h, P.FIXED_ABIL)
          ? 'popeye'
          : heroFemale(ctx.state)
            ? 'olive_oyl'
            : 'bluto';
      say(ctx, 'tin.feel_like', { who: { key: `tin.who.${who}` } });
    }
    gainstr(ctx, 0, cursed, false);
    tin = costlyTin(ctx, tin, 'open');
    const tit = tin.c.item;
    const nutamt =
      (tit?.buc === 'blessed'
        ? 600
        : tit?.buc !== 'cursed'
          ? 400 + ctx.rng.rnd(200)
          : 200 + ctx.rng.rnd(400)) + extra;
    // use up tin first; lesshungry() could be fatal
    useUp();
    lesshungry(ctx, nutamt, false, chokeSnack);
  }
  useUp();
}

// ---------------------------------------------------------------------------------------------
// opening it

/**
 * She starts opening the tin: a metallivore bites into it, a form without hands cannot, a
 * blessed tin opens at once half the time (always with a blessed tin opener wielded), a wielded
 * tin opener takes 0..2 moves (cursed), 0..1 (uncursed) or none (blessed), a dagger or knife 3,
 * a pick-axe or axe 6, else her fingers `rn1(1 + 500 / (Dex + Str), 10)`. Opening at once goes on
 * to what is inside; otherwise opening is her occupation from the next move.
 * ref: src/eat.c start_tin()
 */
export function startTin(ctx: Ctx, otmp: Entity): void {
  const form = heroForm(ctx);
  const it = otmp.c.item;
  if (!it) return;
  let mesg: string | null = null;
  let tmp: number;
  const uwep = uwepOf(ctx);
  if (metallivorous(form)) {
    mesg = 'tin.bite_metal';
    tmp = 0;
  } else if (form && cantwield(form)) {
    // nohands || verysmall
    say(ctx, 'tin.cannot_handle');
    return;
  } else if (it.buc === 'blessed') {
    // 50/50 chance for immediate access vs 1 turn delay (unless wielding blessed tin opener
    // which always yields immediate access)
    tmp = uwep?.c.item?.buc === 'blessed' && uwep.def === TIN_OPENER ? 0 : ctx.rng.rn2(2);
    if (!tmp) mesg = 'tin.like_magic';
    else say(ctx, 'tin.seems_easy');
  } else if (
    uwep &&
    (uwep.def === TIN_OPENER || BLADES.includes(uwep.def) || isPickOrAxe(uwep.def))
  ) {
    if (uwep.def === TIN_OPENER) {
      mesg = 'tin.easily'; // iff tmp == 0
      const b = uwep.c.item?.buc;
      tmp = ctx.rng.rn2(b === 'cursed' ? 3 : b !== 'blessed' ? 2 : 1);
    } else tmp = BLADES.includes(uwep.def) ? 3 : 6;
    say(ctx, 'tin.using', { item: xnameOf(ctx.state, ctx.defs, uwep) });
  } else {
    // no_opener
    say(ctx, 'tin.not_easy');
    if (isGlib(ctx.state)) {
      say(ctx, 'glib.tin_slips', { fingers: fingersOrGloves(ctx, false) });
      const one = it.quantity > 1 ? ctx.state.entities[String(splitStack(ctx, otmp.id, 1))] : otmp;
      if (one?.c.item?.carriedBy === ctx.state.playerId) dropx(ctx, one);
      else if (one) stackobj(ctx, one.id);
      return;
    }
    const a = hero(ctx).c.attributes;
    const sum = (a?.dex ?? 10) + acurrstr(a?.str ?? 10);
    tmp = 10 + ctx.rng.rn2(1 + Math.trunc(500 / sum)); // rn1(1 + 500 / (Dex + Str), 10)
  }
  setTinCtx(ctx, { id: otmp.id, reqtime: tmp, usedtime: 0 });
  if (!tmp) {
    consumeTin(ctx, otmp, mesg ?? 'tin.succeed'); // begin immediately
  } else {
    // set_occupation(opentin, "opening the tin", 0): the next moves open it
    ctx.state.occupation = { action: { type: 'mod', action: OPENTIN_ID }, data: null };
  }
}

const isPickOrAxe = (def: DefId): boolean => def === 'nh:pick_axe' || def === 'nh:axe';

/**
 * One move of opening the tin: she must still have it (or stand on it in reach); after 50 moves
 * "You give up your attempt to open the tin."; when the time is up she gets it open.
 * ref: src/eat.c opentin()
 */
function opentin(ctx: Ctx): void {
  const rec = tinCtx(ctx.state);
  const tin = rec ? ctx.state.entities[String(rec.id)] : undefined;
  // perhaps it was stolen (although that should cause interruption)
  if (!rec || !tin || !tinHere(ctx, tin)) {
    setTinCtx(ctx, null);
    return;
  }
  if (rec.usedtime++ >= 50) {
    say(ctx, 'tin.give_up');
    setTinCtx(ctx, null);
    return;
  }
  if (rec.usedtime < rec.reqtime) return; // still busy
  if (!consumeTin(ctx, tin, 'tin.succeed')) setTinCtx(ctx, null);
}

/**
 * The opentin occupation's move (`continue`), and the answer to "Eat it?". Never offered: Eat on
 * a tin (eat.ts) or applying a tin opener starts it.
 */
const opentinAction: ActionDef = {
  id: OPENTIN_ID,
  labelKey: 'action.nh:opentin',
  handles: 'mod',
  offer: () => [],
  perform(ctx) {
    if (!tinCtx(ctx.state)) return 0;
    opentin(ctx);
    return NORMAL_SPEED;
  },
  answer(ctx, value, data) {
    if (!isEatTinData(data)) return 0;
    const d = data as unknown as EatTinData;
    const tin = ctx.state.entities[String(d.eatTin)];
    if (!tin?.c.item) {
      setTinCtx(ctx, null);
      return 0;
    }
    if (value === true) eatTin(ctx, tin, d.r, false);
    else discardTin(ctx, tin, d.r);
    setTinCtx(ctx, null);
    return 0; // the move was the opening's
  },
  continues: (ctx) => continuesOpening(ctx),
};

setStartTin(startTin);

// ---------------------------------------------------------------------------------------------
// the tin opener and the tinning kit (applied)

/** The tins she carries (getobj("open", tinopen_ok)). */
const carriedTins = (ctx: Ctx): Entity[] =>
  inventoryOf(ctx.state, ctx.state.playerId).filter((o) => o.def === TIN);

interface OpenerData {
  opener: EntityId;
}
const isOpenerData = (data: Json): boolean =>
  typeof data === 'object' &&
  data !== null &&
  typeof (data as { opener?: unknown }).opener === 'number';

/**
 * Applying a tin opener: "You have no tin to open." without one (no time); else which tin, then
 * the opener is wielded (wield_tool()) and the tin started. Returns the time taken.
 * ref: src/eat.c use_tin_opener() (the tin is chosen before the opener is wielded, so a
 * cancelled choice takes no time)
 */
export function useTinOpener(ctx: Ctx, obj: Entity, handler: DefId): number {
  const tins = carriedTins(ctx);
  if (tins.length === 0) {
    say(ctx, 'tin.no_tin');
    return 0;
  }
  ctx.ask(
    {
      id: 'tin-open',
      kind: 'menu',
      key: 'tin.what_to_open',
      cancellable: true,
      options: tins.map((e) => invOption(ctx, e)),
    },
    handler,
    { opener: obj.id } satisfies OpenerData as unknown as Json,
  );
  return 0;
}

/** The kit's corpse menu in progress (the prompt's data). */
interface KitData {
  kit: EntityId;
}
const isKitData = (data: Json): boolean =>
  typeof data === 'object' && data !== null && typeof (data as { kit?: unknown }).kit === 'number';

/** Whether the tool data belongs to this module's prompts. */
export const isTinToolData = (data: Json): boolean => isKitData(data) || isOpenerData(data);

/** ref: src/apply.c tinnable(): a whole corpse of a monster with nutrition */
function tinnable(ctx: Ctx, corpse: Entity): boolean {
  const it = corpse.c.item;
  if (corpse.def !== CORPSE || !it || it.eaten) return false;
  const of = it.corpseOf;
  return !!of && ctx.defs.isMonster(of) && ctx.defs.monster(of).nutrition > 0;
}

/** The tinnable corpses at her feet she can reach, then the ones she carries. ref: floorfood("tin", 2) */
function tinnableCorpses(ctx: Ctx): { floor: Entity[]; carried: Entity[] } {
  const hp = hero(ctx).c.pos;
  const floor =
    hp && canReachFloor(ctx, true)
      ? itemsAt(ctx.defs, ctx.state, hp.level, hp.x, hp.y).filter((e) => tinnable(ctx, e))
      : [];
  const carried = inventoryOf(ctx.state, ctx.state.playerId).filter((e) => tinnable(ctx, e));
  return { floor, carried };
}

/**
 * Applying a tinning kit: "You seem to be out of tins." without charges, else which corpse (the
 * tinnable ones here, then hers); the answer tins it. The move is taken either way, as C's
 * doapply(). ref: src/apply.c use_tinning_kit(), src/eat.c floorfood()
 */
export function useTinningKit(ctx: Ctx, obj: Entity, handler: DefId): number {
  if ((obj.c.item?.spe ?? 0) <= 0) {
    say(ctx, 'tin.out_of_tins');
    return NORMAL_SPEED;
  }
  const { floor, carried } = tinnableCorpses(ctx);
  if (floor.length + carried.length === 0) {
    say(ctx, 'tin.nothing_to_tin');
    return NORMAL_SPEED;
  }
  const options: PromptOption[] = [
    ...floor.map((e): PromptOption => ({
      value: e.id,
      key: 'tin.here_option',
      params: { item: doname(ctx.state, ctx.defs, e) },
    })),
    ...carried.map((e) => invOption(ctx, e)),
  ];
  ctx.ask(
    { id: 'tin-kit', kind: 'menu', key: 'tin.what_to_tin', cancellable: true, options },
    handler,
    { kit: obj.id } satisfies KitData as unknown as Json,
  );
  return NORMAL_SPEED;
}

/**
 * Tins the corpse: bare-handed, a cockatrice's is fatal; one without nutrition is "too
 * insubstantial to tin"; else a charge is used and a homemade tin of it made (known, the kit's
 * BUC), the corpse used up ("You tin it, you bought it!" for a shop's), and she holds the tin
 * (a Rider's corpse revives: "Yes...  But War does not preserve its enemies...")
 * ("You make, but cannot pick up, X." when she can't). ref: src/apply.c use_tinning_kit()
 */
function tinCorpse(ctx: Ctx, kit: Entity, corpse: Entity): void {
  const cit = corpse.c.item;
  const mnum = cit?.corpseOf;
  if (!cit || !mnum || !ctx.defs.isMonster(mnum)) return;
  if (cit.eaten) {
    say(ctx, 'tin.partly_eaten');
    return;
  }
  const mptr = ctx.defs.monster(mnum);
  const h = hero(ctx);
  if (
    touchPetrifies(mptr) &&
    !hasProp(h, P.STONE_RES) &&
    !wornIn(ctx.state, ctx.state.playerId, 'gloves')
  ) {
    const form = heroForm(ctx);
    if (form && polyWhenStoned(form, isGenocided(ctx.state, 'nh:stone_golem')))
      say(ctx, 'tin.tin_without_gloves', { mon: `@${mnum}` });
    else say(ctx, 'tin.fatal_mistake', { mon: `@${mnum}` });
    instapetrify(ctx, `@killer.ston.tinning.${mnum}`);
    if (ctx.state.gameOver) return;
  }
  if (isRider(mptr)) {
    if (reviveCorpseLate(ctx, corpse)) say(ctx, 'tin.war_preserve');
    else say(ctx, 'tin.evades_grasp');
    return;
  }
  if (mptr.nutrition === 0) {
    say(ctx, 'tin.insubstantial');
    return;
  }
  // consume_obj_charge(obj, TRUE)
  checkUnpaid(ctx, kit);
  if (kit.c.item) kit.c.item.spe -= 1;
  const canId = mksobj(ctx, ctx.defs.object(TIN), { init: false });
  const can = ctx.state.entities[String(canId)];
  const it = can?.c.item;
  if (!can || !it) return;
  it.corpseOf = mnum;
  it.buc = kit.c.item?.buc ?? 'uncursed';
  it.known.spe = true;
  // Mark tinned tins. No spinach allowed...
  setTinVariety(ctx.rng, ctx.defs, it, HOMEMADE_TIN);
  const carried = cit.carriedBy === ctx.state.playerId;
  const p = corpse.c.pos;
  if (carried ? !!cit.unpaid : !!p && costlySpot(ctx, p.x, p.y) && !cit.noCharge)
    say(ctx, 'tin.bought');
  useup(ctx, corpse); // useup(), or useupf(corpse, 1L) on the floor
  holdAnotherObject(ctx, canId, {
    key: 'tin.cannot_pick_up',
    params: { item: doname(ctx.state, ctx.defs, can) },
  });
}

/**
 * The tin tool prompts' answers: the corpse to tin, or the tin to open with the tin opener.
 * Returns the time taken (the kit's move was taken when it asked).
 */
export function answerTinTool(ctx: Ctx, value: Json, data: Json): number {
  if (isKitData(data)) {
    const kit = ctx.state.entities[String((data as unknown as KitData).kit)];
    if (!kit?.c.item || kit.c.item.carriedBy !== ctx.state.playerId || typeof value !== 'number')
      return 0;
    const corpse = ctx.state.entities[String(value)];
    if (!corpse) return 0;
    const { floor, carried } = tinnableCorpses(ctx);
    if (!floor.some((e) => e.id === corpse.id) && !carried.some((e) => e.id === corpse.id)) {
      say(ctx, 'tin.cant_tin');
      return 0;
    }
    tinCorpse(ctx, kit, corpse);
    return 0;
  }
  if (isOpenerData(data)) {
    const opener = ctx.state.entities[String((data as unknown as OpenerData).opener)];
    const tin = typeof value === 'number' ? ctx.state.entities[String(value)] : undefined;
    if (
      !opener?.c.item ||
      opener.c.item.carriedBy !== ctx.state.playerId ||
      !tin ||
      tin.def !== TIN ||
      tin.c.item?.carriedBy !== ctx.state.playerId
    )
      return 0;
    if (uwepOf(ctx)?.id !== opener.id && !wieldTool(ctx, opener, 'use')) return 0;
    startTin(ctx, tin);
    return NORMAL_SPEED;
  }
  return 0;
}

export const TIN_ACTIONS: readonly ActionDef[] = [opentinAction];
