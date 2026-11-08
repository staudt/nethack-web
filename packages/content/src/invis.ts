// Invisibility and see invisible: invisible monsters (minvis, perminvis, invis_blkd), the hero's
// Invis / See_invisible, whether she sees a monster, and the remembered-unseen `I` marker.
// ref: include/youprop.h Invis, Invisible, See_invisible; include/display.h mon_visible(),
// canseemon(), knowninvisible(); include/mondata.h perceives(); src/worn.c mon_set_minvis(),
// update_mon_extrinsics(); src/display.c map_invisible(), unmap_invisible(); src/potion.c
// self_invis_message()
//
// A leaf over props: perception.ts, mstate.ts, trap.ts and the rest import it. Monster state lives
// in `modData.nh.minvis: { [monsterId]: bits }` (1 = minvis, 2 = perminvis, 4 = invis_blkd), deleted
// with the monster by mstate's forgetMState(). Not ported: hiding monsters (mundetected), long
// worm tails, infravision (see_with_infrared()) and Detect_monsters (no timed monster detection).
import {
  cellIndex,
  getPlayer,
  inventoryOf,
  isVisible,
  setMonsterMark,
  type AppearanceDef,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Json,
  type MonsterDef,
} from '@nh/core';
import { discover } from './o_init';
import { P, hasProp, timeoutLeft, updateWornProps, wornIn } from './props';

/** The remembered-unseen marker. ref: src/display.c GLYPH_INVISIBLE */
export const REMEMBERED_UNSEEN: DefId = 'nh:remembered_unseen';

/**
 * The marker's legend entry: 'I' in the default colour (C's NO_COLOR). Class 'rock' keeps it out
 * of the shuffled description pools, as the warning digits. ref: src/drawing.c DEF_INVISIBLE
 */
export const REMEMBERED_UNSEEN_APPEARANCE: AppearanceDef = {
  id: REMEMBERED_UNSEEN,
  nameKey: REMEMBERED_UNSEEN,
  class: 'rock',
  glyph: { ch: 'I', fg: '#aaaaaa' },
};

const MUMMY_WRAPPING: DefId = 'nh:mummy_wrapping';

const MINVIS = 1;
const PERMINVIS = 2;
const INVIS_BLKD = 4;

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

function table(state: Readonly<GameState>, create: boolean): Table | null {
  const md = (state as GameState).modData;
  let root = md['nh'];
  if (!isObj(root)) {
    if (!create) return null;
    root = {};
    md['nh'] = root;
  }
  let t = root['minvis'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    root['minvis'] = t;
  }
  return t;
}

const bits = (state: Readonly<GameState>, mon: Entity): number => {
  const v = table(state, false)?.[String(mon.id)];
  return typeof v === 'number' ? v : 0;
};

function setBits(state: GameState, mon: Entity, v: number): void {
  if (v) {
    const t = table(state, true);
    if (t) t[String(mon.id)] = v;
  } else {
    const t = table(state, false);
    if (t) delete t[String(mon.id)];
  }
}

/** `mon->minvis`: the monster is invisible now. */
export const monInvisible = (ctx: Pick<Ctx, 'state'>, mon: Entity): boolean =>
  (bits(ctx.state, mon) & MINVIS) !== 0;

/** `mon->perminvis`: invisible for good (unless something blocks it). */
export const monPermInvisible = (ctx: Pick<Ctx, 'state'>, mon: Entity): boolean =>
  (bits(ctx.state, mon) & PERMINVIS) !== 0;

function setFlags(ctx: Pick<Ctx, 'state'>, mon: Entity, minvis: boolean, perm: boolean): void {
  const b = bits(ctx.state, mon) & INVIS_BLKD;
  setBits(ctx.state, mon, b | (minvis ? MINVIS : 0) | (perm ? PERMINVIS : 0));
}

/**
 * Makes the monster permanently invisible, unless something it wears blocks it; a cursed potion
 * instead takes its permanent invisibility away. ref: src/worn.c mon_set_minvis()
 */
export function setMinvis(ctx: Pick<Ctx, 'state'>, mon: Entity, cursedPotion = false): void {
  const perm = !cursedPotion;
  const blocked = (bits(ctx.state, mon) & INVIS_BLKD) !== 0;
  setFlags(ctx, mon, blocked ? monInvisible(ctx, mon) : perm, perm);
}

/** `mtmp->minvis = mtmp->perminvis = 0` (a shopkeeper or priest made visible). */
export function clearMinvis(ctx: Pick<Ctx, 'state'>, mon: Entity): void {
  setFlags(ctx, mon, false, false);
}

/**
 * A worn item goes on or off a monster: an item conferring invisibility makes it invisible
 * (unless blocked) and on removal leaves it as `perminvis` says; a mummy wrapping blocks
 * invisibility while worn. ref: src/worn.c update_mon_extrinsics() INVIS and maybe_blocks
 */
export function updateMonInvis(
  ctx: Pick<Ctx, 'state' | 'defs'>,
  mon: Entity,
  obj: Entity,
  on: boolean,
): void {
  const perm = monPermInvisible(ctx, mon);
  if (ctx.defs.object(obj.def).prop === P.INVIS) {
    const blocked = (bits(ctx.state, mon) & INVIS_BLKD) !== 0;
    setFlags(ctx, mon, on ? !blocked : perm, perm);
  }
  if (obj.def === MUMMY_WRAPPING) {
    // w_blocks(): a worn mummy wrapping blocks INVIS
    const keep = bits(ctx.state, mon) & ~(INVIS_BLKD | MINVIS);
    setBits(ctx.state, mon, keep | (on ? INVIS_BLKD : perm ? MINVIS : 0));
  }
}

/** BInvis: the hero's worn mummy wrapping blocks her invisibility. ref: do_wear.c, w_blocks() */
export const heroInvisBlocked = (state: Readonly<GameState>): boolean =>
  wornIn(state, state.playerId, 'cloak')?.def === MUMMY_WRAPPING;

/** HInvis || EInvis: some source makes her invisible (blocked or not). */
export const heroInvisSource = (state: Readonly<GameState>): boolean =>
  hasProp(getPlayer(state), P.INVIS);

/** Invis: the hero is invisible to others. ref: include/youprop.h Invis */
export const heroInvisible = (state: Readonly<GameState>): boolean =>
  heroInvisSource(state) && !heroInvisBlocked(state);

/** See_invisible. ref: include/youprop.h */
export const seeInvisible = (state: Readonly<GameState>): boolean =>
  hasProp(getPlayer(state), P.SEE_INVIS);

/** Invisible: invisible and unable to see herself. ref: include/youprop.h Invisible */
export const cantSeeSelf = (state: Readonly<GameState>): boolean =>
  heroInvisible(state) && !seeInvisible(state);

/** ref: include/mondata.h perceives(): M1_SEE_INVIS */
export const perceives = (def: Readonly<MonsterDef>): boolean => def.flags.includes('see_invis');

/**
 * The hero can see the monster, assuming she sees its square: it is not invisible, or she sees
 * invisible. ref: include/display.h _mon_visible() (no hiders: mundetected is not ported)
 */
export const monVisible = (ctx: Pick<Ctx, 'state'>, mon: Entity): boolean =>
  !monInvisible(ctx, mon) || seeInvisible(ctx.state);

/** cansee(x, y) on the hero's level. */
function cansee(state: Readonly<GameState>, p: { level: string; x: number; y: number }): boolean {
  if (p.level !== state.currentLevel) return false;
  const level = state.levels[p.level];
  return !!level && isVisible(state, cellIndex(level, p.x, p.y));
}

/**
 * The hero sees its square and the monster on it. ref: include/display.h _canseemon() (no long
 * worms, no infravision)
 */
export function canseemon(ctx: Pick<Ctx, 'state'>, mon: Entity): boolean {
  const p = mon.c.pos;
  return !!p && cansee(ctx.state, p) && monVisible(ctx, mon);
}

/** ref: include/hack.h BOLT_LIM */
const BOLT_LIM = 8;

/**
 * She knows the monster is there and invisible: she sees its square and sees invisible, or a
 * timed telepathy shows a creature on an apparently empty spot. ref: include/display.h
 * _knowninvisible() (no Detect_monsters)
 */
export function knownInvisible(ctx: Pick<Ctx, 'state'>, mon: Entity): boolean {
  const p = mon.c.pos;
  if (!p || !monInvisible(ctx, mon)) return false;
  if (cansee(ctx.state, p) && seeInvisible(ctx.state)) return true;
  const h = getPlayer(ctx.state);
  const hp = h.c.pos;
  if (hasProp(h, P.BLINDED) || timeoutLeft(ctx.state, h, P.TELEPAT) <= 0 || !hp) return false;
  if (hp.level !== p.level) return false;
  const dx = p.x - hp.x;
  const dy = p.y - hp.y;
  return dx * dx + dy * dy <= BOLT_LIM * BOLT_LIM;
}

/**
 * Remembers an unseen monster at (x, y) of her level: the `I`, never on her own square.
 * ref: src/display.c map_invisible()
 */
export function mapInvisible(ctx: Pick<Ctx, 'state'>, x: number, y: number): void {
  const hp = getPlayer(ctx.state).c.pos;
  if (hp && hp.x === x && hp.y === y) return;
  setMonsterMark(ctx.state, ctx.state.currentLevel, { x, y }, REMEMBERED_UNSEEN);
}

/**
 * Forgets the `I` at (x, y) of her level; true when there was one. ref: src/display.c
 * unmap_invisible()
 */
export function unmapInvisible(ctx: Pick<Ctx, 'state'>, x: number, y: number): boolean {
  const level = ctx.state.levels[ctx.state.currentLevel];
  if (!level || x < 0 || y < 0 || x >= level.width || y >= level.height) return false;
  const lid = ctx.state.currentLevel;
  if (ctx.state.monsterMemory[lid]?.[String(cellIndex(level, x, y))] !== REMEMBERED_UNSEEN)
    return false;
  setMonsterMark(ctx.state, lid, { x, y }, null);
  return true;
}

/**
 * "Gee!  All of a sudden, you can't see yourself." ref: src/potion.c self_invis_message()
 */
export function selfInvisMessage(ctx: Pick<Ctx, 'state' | 'emit'>): void {
  const h = getPlayer(ctx.state);
  const halluc = hasProp(h, P.HALLUC) ? 'halluc' : 'plain';
  const see = seeInvisible(ctx.state) ? 'see_through' : 'cant_see';
  ctx.emit({ type: 'msg', key: `invis.self.${halluc}.${see}` });
}

/** HInvis: invisible from an intrinsic or a timeout (not from worn items). */
function hInvis(state: Readonly<GameState>): boolean {
  const p = getPlayer(state).c.props?.[P.INVIS];
  return !!p && (p.intrinsic || p.timeout > 0);
}

/** `oldprop` for a cloak: another worn item than `obj` confers invisibility. */
function otherInvisItem(ctx: Pick<Ctx, 'state' | 'defs'>, obj: Entity): boolean {
  return inventoryOf(ctx.state, ctx.state.playerId).some((o) => {
    const eq = o.c.item?.equipped;
    return o.id !== obj.id && !!eq && eq !== 'weapon' && ctx.defs.object(o.def).prop === P.INVIS;
  });
}

const heroBlind = (state: Readonly<GameState>): boolean => hasProp(getPlayer(state), P.BLINDED);

/**
 * The hero's cloak goes on (already worn): a mummy wrapping shows her again, a cloak of
 * invisibility hides her and is learned. ref: src/do_wear.c Cloak_on() (the other cloaks of the
 * port do nothing here)
 */
export function cloakOn(ctx: Pick<Ctx, 'state' | 'defs' | 'emit'>, obj: Entity): void {
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  const say = (key: string): void => ctx.emit({ type: 'msg', key });
  const see = seeInvisible(ctx.state);
  if (obj.def === MUMMY_WRAPPING) {
    if (heroInvisSource(ctx.state) && !heroBlind(ctx.state))
      say(see ? 'invis.wrap_on.see_through' : 'invis.wrap_on.see_self');
  } else if (ctx.defs.object(obj.def).prop === P.INVIS) {
    if (!otherInvisItem(ctx, obj) && !hInvis(ctx.state) && !heroBlind(ctx.state)) {
      discover(ctx, obj.def);
      say(see ? 'invis.cloak_on.see_through' : 'invis.cloak_on.cant_see');
    }
  }
}

/**
 * The hero's cloak has come off (no longer worn). ref: src/do_wear.c Cloak_off()
 */
export function cloakOff(ctx: Pick<Ctx, 'state' | 'defs' | 'emit'>, obj: Entity): void {
  updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
  const say = (key: string): void => ctx.emit({ type: 'msg', key });
  const see = seeInvisible(ctx.state);
  if (obj.def === MUMMY_WRAPPING) {
    if (heroInvisible(ctx.state) && !heroBlind(ctx.state))
      say(see ? 'invis.wrap_off.see_through' : 'invis.wrap_off.cant_see');
  } else if (ctx.defs.object(obj.def).prop === P.INVIS) {
    if (!otherInvisItem(ctx, obj) && !hInvis(ctx.state) && !heroBlind(ctx.state)) {
      discover(ctx, obj.def);
      say(see ? 'invis.cloak_off.see_through' : 'invis.cloak_off.see_self');
    }
  }
}
