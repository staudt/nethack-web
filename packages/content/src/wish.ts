// Wishing: making the wished-for object and handing it to the hero.
// ref: src/zap.c makewish(), src/objnam.c readobjnam() (the creation half), src/invent.c
// hold_another_object(). The parse is objnam_read.ts readobjnam().
import { EGG, canBeHatched, setEggCorpsenm } from './eggstate';
import { setBoxTrapped } from './btrapstate';
import {
  contents,
  getLevel,
  getPlayer,
  isPlainFloor,
  type Ctx,
  type DefId,
  type EntityId,
  type Json,
  type Msg,
} from '@nh/core';
import { gemLedger, gemProb } from './gem';
import { encumberMsg, prinv } from './itemactions';
import { addToInventory, invCount, placeOnFloor, splitStack } from './items';
import { luckOf, setU, uState } from './luck';
import {
  erosionMatters,
  isCorrodeable,
  isCrackable,
  isDamageable,
  isFlammable,
  isRottable,
  isRustprone,
  isWeaponOrWeptool,
} from './material';
import { messagesEn } from './messages.en';
import { mkobj, mksobjCorpse, mksobjFull } from './mkobj';
import { xnameOf } from './objnam';
import { CHARGED_RINGS } from './objects';
import { WRPSYM, mungspaces, readobjnam, wishNames, type WishSpec } from './objnam_read';
import { nearCapacity } from './stats';
import { STATUE, setHistoric } from './statuestate';
import { counterWere, isWere } from './werestate';
import { TRAP, canFallThru, isHole, maketrap } from './trap';
import { isFurnitureId, terrainIdAt } from './terrain';
import { P, heroHas } from './props';

/** ref: include/hack.h MAXWISHTRY */
export const MAXWISHTRY = 5;
/** ref: include/global.h BUFSZ: getlin() reads at most BUFSZ - 1 characters */
export const WISH_MAXLEN = 255;
/** ref: include/hack.h MOD_ENCUMBER (Stressed), flags.pickup_burden's default */
const PICKUP_BURDEN = 2;
/** ref: include/hack.h invlet_basic */
const INVLET_BASIC = 52;

/** The wish in progress, carried by the prompt. */
export interface WishData {
  tries: number;
  /** Wizard mode: no limits on count, enchantment, BUC or gold. */
  wizard: boolean;
}

/** Options of mkWished(): `wizard` lifts the limits of a normal wish (readobjnam's `wizard`). */
export interface WishOpts {
  wizard: boolean;
}

/**
 * Makes the object a spec describes and returns its id (detached: the caller places it).
 * ref: src/objnam.c readobjnam() from `any:` on: the type among the candidates
 * (rnd_otyp_by_namedesc()'s pick), mksobj(otyp, TRUE, FALSE) or mkobj(oclass, FALSE), then the
 * count, enchantment, corpse type, BUC, erosion, recharge count and lock state asked for.
 * Without `wizard`, a normal wish's limits apply (count, enchantment, Luck, 5000 gold).
 * Not ported: lit lamps, partly eaten food, poison, grease, names and artifacts.
 */
export function mkWished(ctx: Ctx, spec: WishSpec, opts: WishOpts): EntityId | null {
  const { wizard } = opts;
  const luck = luckOf(ctx.state);
  const what = spec.what;
  if (what.kind === 'gold') {
    let cnt = spec.cnt;
    if (cnt > 5000 && !wizard) cnt = 5000;
    else if (cnt < 1) cnt = 1;
    return mksobjFull(ctx, ctx.defs.object('nh:gold_piece'), { init: false, quantity: cnt });
  }

  let typ: DefId | null = null;
  let oclass = what.kind === 'class' ? what.cls : null;
  if (what.kind === 'type') typ = what.type;
  else if (what.kind === 'types') {
    // ref: rnd_otyp_by_namedesc(): prob = rn2(maxprob), then walk the candidates; oc_prob of
    // the real gems is setgemprobs()'s for the hero's level
    const ledger = gemLedger(ctx.state, ctx.state.currentLevel);
    const w = (id: DefId): number => gemProb(ctx.defs.object(id), ledger) + what.xtra;
    const maxprob = what.types.reduce((a, id) => a + w(id), 0);
    let prob = ctx.rng.rn2(maxprob);
    let k = 0;
    for (; k < what.types.length - 1; k++) if ((prob -= w(what.types[k] as DefId)) < 0) break;
    typ = what.types[k] ?? null;
  } else if (what.kind === 'random') oclass = WRPSYM[ctx.rng.rn2(WRPSYM.length)] ?? 'weapon';

  // create the object, then fine-tune it
  let id: EntityId | null;
  if (typ !== null) {
    const def = ctx.defs.object(typ);
    id =
      def.id === 'nh:corpse'
        ? mksobjCorpse(ctx, def, { artif: false })
        : mksobjFull(ctx, def, { artif: false });
  } else {
    id = mkobj(ctx, oclass ?? 'weapon', { artif: false });
  }
  if (id === null) return null; // a class with no objects (see DEVIATIONS.md)
  const e = ctx.state.entities[String(id)];
  const it = e?.c.item;
  if (!e || !it) return null;
  const def = ctx.defs.object(e.def);

  // the count: unrestricted in wizard mode for mergeable objects
  if (spec.cnt > 0 && def.merge) {
    // the WEAPON_CLASS test excludes gems and gray stones (sling ammo too)
    const missileOrAmmo =
      def.weapon?.role === 'missile' || (def.class === 'weapon' && def.weapon?.role === 'ammo');
    if (
      wizard ||
      spec.cnt < ctx.rng.rnd(6) ||
      (spec.cnt <= 20 && (def.id === 'nh:rock' || def.id === 'nh:flint_stone' || missileOrAmmo))
    )
      it.quantity = spec.cnt;
  }

  // the enchantment or charges
  let spe = spec.spe;
  let spesgn = spec.spesgn;
  if (spesgn === 0) {
    spe = it.spe; // not specified: keep the random one
  } else if (wizard) {
    // no restrictions except SPE_LIM
  } else if (
    def.class === 'armor' ||
    isWeaponOrWeptool(def) ||
    (def.class === 'ring' && CHARGED_RINGS.has(def.id))
  ) {
    if (spe > ctx.rng.rnd(5) && spe > it.spe) spe = 0;
    if (spe > 2 && luck < 0) spesgn = -1;
  } else {
    if (def.class === 'wand') {
      if (spe > 1 && spesgn === -1) spe = 1;
    } else if (spe > 0 && spesgn === -1) spe = 0;
    if (spe > it.spe) spe = it.spe;
  }
  if (spesgn === -1) spe = -spe;
  // corpses and statues keep spe for their gender (and historic flag); boxes and keys use it
  // for nothing settable
  if (
    !['nh:corpse', STATUE, 'nh:figurine', 'nh:chest', 'nh:large_box', 'nh:skeleton_key'].includes(
      def.id,
    )
  )
    it.spe = spe;
  // a historic statue
  if (spec.historic && def.id === STATUE) setHistoric(ctx, id, true);

  // the corpse or statue type
  if (spec.mon !== null && ctx.defs.isMonster(spec.mon)) {
    let mon = ctx.defs.monster(spec.mon);
    // werecreatures in beast form are all flagged no-corpse so for corpses and statues, switch
    // to their corresponding human form
    const human = counterWere(mon.id);
    if (
      def.id !== 'nh:figurine' &&
      isWere(mon) &&
      mon.genFlags.includes('nocorpse') &&
      human &&
      ctx.defs.isMonster(human)
    )
      mon = ctx.defs.monster(human);
    if (def.id === 'nh:corpse') {
      if ((!mon.genFlags.includes('uniq') || wizard) && !mon.genFlags.includes('nocorpse'))
        it.corpseOf = mon.id;
    } else if (def.id === EGG) {
      // ref: readobjnam() EGG: can_be_hatched(); set_corpsenm() also sets the hatch timer
      setEggCorpsenm(ctx, id, canBeHatched(ctx, mon.id));
    } else if (def.id === 'nh:figurine') {
      // not a unique, nor a human unless a werecreature (no mail daemon exists)
      if (!mon.genFlags.includes('uniq') && (!mon.flags.includes('human') || isWere(mon)))
        it.corpseOf = mon.id;
    } else if (def.id === STATUE) {
      it.corpseOf = mon.id;
      // no spellbook in a statue of a very small monster
      if (mon.size === 'tiny') for (const o of contents(ctx.state, id)) ctx.remove(o.id);
    }
  }

  // BUC: setting the fields directly is safe
  if (spec.iscursed) it.buc = 'cursed';
  else if (spec.uncursed) it.buc = luck < 0 && !wizard ? 'cursed' : 'uncursed';
  else if (spec.blessed) it.buc = luck >= 0 || wizard ? 'blessed' : 'cursed';
  else if (spesgn < 0) it.buc = 'cursed';

  // erosion: a wished-for item is not eroded unless asked for
  if (erosionMatters(def)) {
    let e1 = 0;
    let e2 = 0;
    if (spec.eroded && (isFlammable(def) || isRustprone(def) || isCrackable(def)))
      e1 = Math.min(spec.eroded, 3);
    if (spec.eroded2 && (isCorrodeable(def) || isRottable(def))) e2 = Math.min(spec.eroded2, 3);
    if (e1 || e2) it.erosion = { e1: e1 as 0 | 1 | 2 | 3, e2: e2 as 0 | 1 | 2 | 3 };
    else delete it.erosion;
    if (spec.erodeproof && isDamageable(def)) {
      if (luck >= 0 || wizard) it.erodeproof = true;
      else delete it.erodeproof;
    }
  }

  // the recharge count of a wand
  if (def.class === 'wand') {
    if (spec.rechrg > 0) it.recharged = spec.rechrg;
    else delete it.recharged;
  }

  // the lock state of a box
  if (def.container?.box) {
    if (spec.locked) {
      it.locked = true;
      delete it.broken;
    } else if (spec.unlocked) {
      delete it.locked;
      delete it.broken;
    } else if (spec.broken) {
      delete it.locked;
      it.broken = true;
    }
    // "trapped" / "untrapped" (not tknown)
    if (spec.trapped) setBoxTrapped(ctx, id, spec.trapped === 1);
  }
  return id;
}

/**
 * Puts a new object into the hero's inventory, or drops it at her feet with `dropMsg` when it
 * would take her past her encumbrance limit (her current one or Stressed, whichever is more)
 * or past 52 letters; `holdMsg` prefixes the inventory line ("You steal: "). Returns the
 * inventory stack, or null when it was dropped.
 * A fumbling hero drops it. ref: src/invent.c hold_another_object() (no artifacts, cockatrice
 * corpses or loadstones; the hero always reaches the floor)
 */
export function holdAnotherObject(
  ctx: Ctx,
  id: EntityId,
  dropMsg: Msg | null,
  holdMsg: Msg | null = null,
): EntityId | null {
  const obj = ctx.state.entities[String(id)];
  const oquan = obj?.c.item?.quantity ?? 1;
  const hero = ctx.state.playerId;
  if (heroHas(ctx.state, P.FUMBLING)) {
    // a fumbling hero drops it at once (goto drop_it)
    if (dropMsg) ctx.emit({ type: 'msg', ...dropMsg });
    const pos = getPlayer(ctx.state).c.pos;
    if (pos) placeOnFloor(ctx, id, pos.level, pos.x, pos.y);
    return null;
  }
  const prev = Math.max(nearCapacity(ctx.state, ctx.defs, hero), PICKUP_BURDEN);
  const stack = addToInventory(ctx, hero, id);
  const st = ctx.state.entities[String(stack)];
  if (!st?.c.item) return null;
  if (invCount(ctx, hero) > INVLET_BASIC || nearCapacity(ctx.state, ctx.defs, hero) > prev) {
    // undo any merge which took place
    const drop = st.c.item.quantity > oquan ? splitStack(ctx, stack, oquan) : stack;
    if (dropMsg) ctx.emit({ type: 'msg', ...dropMsg });
    const pos = getPlayer(ctx.state).c.pos;
    if (pos) placeOnFloor(ctx, drop, pos.level, pos.x, pos.y);
    return null;
  }
  prinv(ctx, st, oquan, holdMsg);
  encumberMsg(ctx);
  return stack;
}

/** "Oops!  The 2 daggers drop to the floor!" ref: makewish() oops_msg, aobjnam(otmp, "drop") */
function oopsMsg(ctx: Ctx, id: EntityId): Msg {
  const e = ctx.state.entities[String(id)];
  if (!e) return { key: 'wish.oops', params: { item: '' } };
  const n = e.c.item?.quantity ?? 1;
  const name = xnameOf(ctx.state, ctx.defs, e);
  const item: Msg = {
    key: 'wish.aobjnam',
    params: { count: n !== 1 ? { key: 'obj.count', params: { n } } : '', name },
  };
  return { key: n !== 1 ? 'wish.oops.plural' : 'wish.oops', params: { item } };
}

/** Asks "For what do you wish?"; the answer comes to `action`'s answer(), see answerWish(). */
export function askWish(ctx: Ctx, action: DefId, data: WishData): void {
  ctx.ask(
    { id: 'wish', kind: 'text', key: 'wish.prompt', maxLength: WISH_MAXLEN },
    action,
    data as unknown as Json,
  );
}

/**
 * Wizard mode: a wish whose words start with a trap's name ("teleportation trap", "level
 * teleporter", "pit"...) makes that trap at the hero's feet, unseen and not set off: "A
 * teleportation trap." ("Creation of a pit failed." on stairs, furniture or a doorway); a hole or
 * trap door where one cannot fall through is a falling rock trap. True when a trap name matched.
 * ref: src/objnam.c wizterrainwish() (the trap part; the wizard mod's terrainwish.ts has the
 * terrain), src/trap.c maketrap() (no trap on furniture)
 */
function wizTrapWish(ctx: Ctx, buf: string): boolean {
  const bp = buf.toLowerCase().replace(/^(an?|the) /, ''); // readobjnam_preparse()
  for (const t of ctx.defs.traps) {
    const tname = messagesEn[t.nameKey];
    if (tname === undefined || !bp.startsWith(tname.toLowerCase())) continue;
    const p = getPlayer(ctx.state).c.pos;
    if (!p) return true;
    const level = getLevel(ctx.state, p.level);
    // found it; avoid stupid mistakes
    const kind = isHole(t.id) && !canFallThru(ctx.state, level) ? TRAP.rock : t.id;
    if (
      isPlainFloor(ctx.defs, level, p.x, p.y) &&
      !isFurnitureId(ctx.defs, terrainIdAt(level, p.x, p.y))
    ) {
      maketrap(ctx, p.level, p.x, p.y, kind);
      ctx.emit({ type: 'msg', key: 'wish.wiz_trap', params: { trap: `@${kind}` } });
    } else ctx.emit({ type: 'msg', key: 'wish.wiz_trap_failed', params: { trap: `@${kind}` } });
    return true;
  }
  return false;
}

/**
 * Wizard mode's terrain wish: true when `buf` named terrain (made, or refused with a message).
 * ref: src/objnam.c wizterrainwish()
 */
export type TerrainWish = (ctx: Ctx, buf: string) => boolean;

/**
 * The answer to the wish prompt. ref: src/zap.c makewish(): an unknown name says so and asks
 * again, up to MAXWISHTRY times, then "That's enough tries!" and a random object; "nothing"
 * declines; an empty answer or Escape is a random object (readobjnam("") goes to `any:`).
 * The object is held (or dropped: "Oops!"), and the prayer timeout grows by rn1(100, 50).
 * In wizard mode a name that is no object may be a trap, then (`terrain`) terrain.
 * No "help" (wishcmdassist) and no wish history.
 */
export function answerWish(
  ctx: Ctx,
  action: DefId,
  value: Json,
  data: WishData,
  terrain?: TerrainWish,
): void {
  const buf = typeof value === 'string' ? mungspaces(value) : '';
  const names = wishNames(ctx.state, ctx.defs, messagesEn);
  let spec = readobjnam(buf, names, { wizard: data.wizard === true });
  // wizard mode: "trapped land mine", "bear trap trap" (readobjnam()'s `goto wiztrap`)
  if (spec !== null && spec !== 'nothing' && spec.what.kind === 'wiztrap') {
    wizTrapWish(ctx, spec.what.trap);
    return;
  }
  // wizard mode: traps, after the objects (so "bear trap" is still the object)
  if (spec === null && data.wizard && wizTrapWish(ctx, buf)) return;
  if (spec === null && data.wizard && terrain?.(ctx, buf)) return;
  if (spec === null) {
    ctx.emit({ type: 'msg', key: 'wish.nothing_fitting' });
    if (data.tries + 1 < MAXWISHTRY) {
      askWish(ctx, action, { ...data, tries: data.tries + 1 });
      return;
    }
    ctx.emit({ type: 'msg', key: 'wish.enough_tries' });
    spec = readobjnam('', names);
  }
  if (spec === 'nothing' || spec === null) return;
  const id = mkWished(ctx, spec, { wizard: data.wizard });
  if (id === null) return;
  holdAnotherObject(ctx, id, oopsMsg(ctx, id));
  // the gods take notice
  setU(ctx, { ublesscnt: uState(ctx.state).ublesscnt + ctx.rng.rn2(100) + 50 });
}
