// Hero properties (intrinsics and timed effects) and the innate abilities of the role.
// ref: include/prop.h, include/youprop.h, src/timeout.c nh_timeout(), src/potion.c make_stunned(),
// src/attrib.c adjabil() / val_abil[]
//
// A property lives in `Components.props[name]`: `intrinsic` is the permanent flag (NetHack's
// FROMOUTSIDE / FROMEXPER bits) and `timeout` the turn a timed effect ends (0 = none). Names are
// NetHack's property names lowercased: 'cold_res', 'stunned', 'fast', 'stealth', ...
//
// Worn rings and amulets confer their `ObjectDef.prop` as an extrinsic (NetHack's
// uprops[].extrinsic, set by setworn()): it is cached on the wearer as the entry
// `props['<name>:worn']` (present while some worn item gives it), rebuilt by `updateWornProps()`
// whenever the hero's accessories change and as a safety net after every action and turn.
import {
  getPlayer,
  inventoryOf,
  type Ctx,
  type Entity,
  type EntityId,
  type GameState,
  type ModApi,
  type PropState,
  type Registry,
} from '@nh/core';
import { addWeaponSkill } from './skills';

/** Property names used by the vanilla mod (ref: include/prop.h enum prop_types). */
export const P = {
  FIRE_RES: 'fire_res',
  COLD_RES: 'cold_res',
  SLEEP_RES: 'sleep_res',
  DISINT_RES: 'disint_res',
  SHOCK_RES: 'shock_res',
  POISON_RES: 'poison_res',
  ACID_RES: 'acid_res',
  STONE_RES: 'stone_res',
  STUNNED: 'stunned',
  FAST: 'fast',
  STEALTH: 'stealth',
  TELEPAT: 'telepat',
  WOUNDED_LEGS: 'wounded_legs',
  BLINDED: 'blinded',
  CONFUSION: 'confusion',
  HALLUC: 'hallucination',
  PROTECTION: 'protection',
  REGENERATION: 'regeneration',
  SEARCHING: 'searching',
  SLOW_DIGESTION: 'slow_digestion',
  HUNGER: 'hunger',
  AGGRAVATE_MONSTER: 'aggravate_monster',
  FREE_ACTION: 'free_action',
  FIXED_ABIL: 'fixed_abil',
  LIFESAVED: 'lifesaved',
  STRANGLED: 'strangled',
  STONED: 'stoned',
  SLEEPY: 'sleepy',
  REFLECTING: 'reflecting',
  ADORNED: 'adorned',
  ANTIMAGIC: 'antimagic',
  CLAIRVOYANT: 'clairvoyant',
  LEVITATION: 'levitation',
  TELEPORT: 'teleport',
  CONFLICT: 'conflict',
  WARNING: 'warning',
  MAGICAL_BREATHING: 'magical_breathing',
} as const;

/** The cached extrinsic entry of a property (see the header). */
const wornKey = (name: string): string => `${name}:worn`;

/** True when a worn item gives the property (EFoo). */
export const hasExtrinsic = (e: Entity | undefined, name: string): boolean =>
  e?.c.props?.[wornKey(name)] !== undefined;

/** True while the entity has the property, permanently or on a timer. ref: youprop.h (e.g. Stunned) */
export function hasProp(e: Entity | undefined, name: string): boolean {
  const p = e?.c.props?.[name];
  return (p !== undefined && (p.intrinsic || p.timeout > 0)) || hasExtrinsic(e, name);
}

/**
 * Strangled: only the timed part counts (the amulet's extrinsic bit is never read).
 * ref: include/youprop.h `#define Strangled u.uprops[STRANGLED].intrinsic`
 */
export const isStrangled = (e: Entity | undefined): boolean =>
  (e?.c.props?.[P.STRANGLED]?.timeout ?? 0) > 0;

/** The hero has the property. */
export const heroHas = (state: Readonly<GameState>, name: string): boolean =>
  hasProp(state.entities[String(state.playerId)], name);

/** ref: include/youprop.h Conflict (the ring; no artifact or intrinsic source here) */
export const conflictOn = (state: Readonly<GameState>): boolean => heroHas(state, P.CONFLICT);

/**
 * Whether the monster resists the hero's Conflict this time: always a small chance, better for
 * high-level monsters, worse against a charismatic, experienced hero.
 * ref: src/mondata.c resist_conflict()
 */
export function resistConflict(ctx: Pick<Ctx, 'state' | 'rng'>, mon: Entity): boolean {
  const hero = getPlayer(ctx.state);
  const cha = hero.c.attributes?.cha ?? 10; // ACURR(A_CHA)
  const ulevel = hero.c.experience?.level ?? 1;
  const resistChance = Math.min(19, cha - (mon.c.monster?.level ?? 0) + ulevel);
  return ctx.rng.rnd(20) > resistChance;
}

/** True when the property is held permanently (HFoo & INTRINSIC). */
export const hasIntrinsic = (e: Entity | undefined, name: string): boolean =>
  e?.c.props?.[name]?.intrinsic === true;

/** Turns of a timed effect left (HFoo & TIMEOUT); 0 when none. */
export function timeoutLeft(
  state: Readonly<GameState>,
  e: Entity | undefined,
  name: string,
): number {
  const t = e?.c.props?.[name]?.timeout ?? 0;
  return t > 0 ? Math.max(t - state.turn, 0) : 0;
}

const propState = (e: Entity, name: string): PropState => {
  const props = (e.c.props ??= {});
  return (props[name] ??= { intrinsic: false, timeout: 0 });
};

/** Drops an entry that holds nothing, so a saved state stays small. */
function prune(e: Entity, name: string): void {
  const p = e.c.props?.[name];
  if (p && !p.intrinsic && p.timeout <= 0 && e.c.props) delete e.c.props[name];
}

/** Gives or takes the permanent flag. ref: HFoo |= FROMOUTSIDE / &= ~FROMOUTSIDE */
export function setIntrinsic(e: Entity, name: string, on: boolean): void {
  if (on) propState(e, name).intrinsic = true;
  else if (e.c.props?.[name]) {
    propState(e, name).intrinsic = false;
    prune(e, name);
  }
}

/** Sets the timed part to end `turns` turns from now (0 clears it). ref: src/timeout.c set_itimeout() */
export function setItimeout(
  state: Readonly<GameState>,
  e: Entity,
  name: string,
  turns: number,
): void {
  if (turns > 0) propState(e, name).timeout = state.turn + turns;
  else if (e.c.props?.[name]) {
    propState(e, name).timeout = 0;
    prune(e, name);
  }
}

/** Lengthens the timed part by `incr` turns. ref: src/timeout.c incr_itimeout() */
export function incrItimeout(
  state: Readonly<GameState>,
  e: Entity,
  name: string,
  incr: number,
): void {
  setItimeout(state, e, name, timeoutLeft(state, e, name) + incr);
}

/** Accessory slots whose items confer their property while worn. ref: include/prop.h W_ACCESSORY */
const ACCESSORY_SLOTS: ReadonlySet<string> = new Set(['ringL', 'ringR', 'amulet', 'blindfold']);

/** The item the entity wears in `slot` (uleft = 'ringL', uright = 'ringR', uamul = 'amulet'). */
export function wornIn(state: Readonly<GameState>, id: EntityId, slot: string): Entity | null {
  return inventoryOf(state, id).find((o) => o.c.item?.equipped === slot) ?? null;
}

/**
 * Rebuilds the entity's extrinsic entries from its worn accessories (ref: src/worn.c setworn(),
 * setnotworn()). Writes only when something changed, so an entity without worn accessories
 * keeps its props untouched.
 */
export function updateWornProps(state: GameState, defs: Registry, id: EntityId): void {
  const e = state.entities[String(id)];
  if (!e) return;
  const want = new Set<string>();
  for (const o of inventoryOf(state, id)) {
    const slot = o.c.item?.equipped;
    if (!slot || !ACCESSORY_SLOTS.has(slot)) continue;
    const prop = defs.object(o.def).prop;
    if (prop) want.add(wornKey(prop));
  }
  const props = e.c.props;
  for (const k of Object.keys(props ?? {}).sort()) {
    if (k.endsWith(':worn') && !want.has(k) && props) delete props[k];
  }
  for (const k of [...want].sort()) {
    const p = (e.c.props ??= {});
    p[k] ??= { intrinsic: true, timeout: 0 };
  }
}

/**
 * The summed enchantment of the worn rings of type `ring` (u.uhitinc for increase accuracy,
 * u.udaminc for increase damage; NetHack adds and subtracts them in Ring_on()/Ring_off(), the sum
 * is the same). ref: src/do_wear.c Ring_on(), find_ac()
 */
export function ringBonus(state: Readonly<GameState>, ring: string, id = state.playerId): number {
  let n = 0;
  for (const slot of ['ringL', 'ringR']) {
    const o = wornIn(state, id, slot);
    if (o?.def === ring) n += o.c.item?.spe ?? 0;
  }
  return n;
}

/** ref: src/mhitu.c u_slow_down(): HFast = 0 (no speed boots, so always "You slow down.") */
export function uSlowDown(ctx: Pick<Ctx, 'state' | 'emit'>): void {
  const h = getPlayer(ctx.state);
  setIntrinsic(h, P.FAST, false);
  setItimeout(ctx.state, h, P.FAST, 0);
  ctx.emit({ type: 'msg', key: 'zap.slow_down' });
}

/**
 * Sets the hero's stun timer to `xtime` more turns (0 ends it), with NetHack's messages.
 * ref: src/potion.c make_stunned(). Not ported: riding ("You wobble in the saddle"),
 * hallucination wording, the Unaware (unconscious) silence.
 */
export function makeStunned(ctx: Pick<Ctx, 'state' | 'emit'>, xtime: number, talk: boolean): void {
  const hero = getPlayer(ctx.state);
  const old = hasProp(hero, P.STUNNED);
  if (!xtime && old && talk) ctx.emit({ type: 'msg', key: 'stun.steady' });
  if (xtime && !old && talk) ctx.emit({ type: 'msg', key: 'stun.stagger' });
  setItimeout(ctx.state, hero, P.STUNNED, xtime);
}

/**
 * Sets the hero's confusion timer to `xtime` turns (0 ends it). ref: src/potion.c make_confused()
 */
export function makeConfused(ctx: Pick<Ctx, 'state' | 'emit'>, xtime: number, talk: boolean): void {
  const hero = getPlayer(ctx.state);
  if (!xtime && hasProp(hero, P.CONFUSION) && talk)
    ctx.emit({
      type: 'msg',
      key: hasProp(hero, P.HALLUC) ? 'conf.less_trippy' : 'conf.less_confused',
    });
  setItimeout(ctx.state, hero, P.CONFUSION, xtime);
}

/**
 * Sets the hero's blindness timer to `xtime` turns (0 ends it), with the messages for losing and
 * regaining sight; a worn blindfold keeps her blind and only her eyes twitch or itch. Vision is
 * recomputed by the engine after the action. ref: src/potion.c make_blinded(). Not ported: the
 * Eyes of the Overworld, eyeless forms, Unaware.
 */
export function makeBlinded(ctx: Pick<Ctx, 'state' | 'emit'>, xtime: number, talk: boolean): void {
  const hero = getPlayer(ctx.state);
  const old = timeoutLeft(ctx.state, hero, P.BLINDED) > 0;
  const blindfolded = hasExtrinsic(hero, P.BLINDED);
  const couldSee = !hasProp(hero, P.BLINDED);
  const canSeeNow = !xtime && !blindfolded && !hasIntrinsic(hero, P.BLINDED);
  const halluc = hasProp(hero, P.HALLUC);
  if (canSeeNow && !couldSee) {
    // regaining sight
    if (talk) ctx.emit({ type: 'msg', key: halluc ? 'blind.far_out' : 'blind.see_again' });
  } else if (old && !xtime) {
    // clearing temporary blindness without toggling blindness
    if (talk && blindfolded) ctx.emit({ type: 'msg', key: 'blind.eyes_itch' });
  }
  if (couldSee && !canSeeNow) {
    // losing sight
    if (talk) ctx.emit({ type: 'msg', key: halluc ? 'blind.bummer' : 'blind.darkness' });
  } else if (!old && xtime) {
    // setting temporary blindness without toggling blindness
    if (talk && blindfolded) ctx.emit({ type: 'msg', key: 'blind.eyes_twitch' });
  }
  setItimeout(ctx.state, hero, P.BLINDED, xtime);
}

/**
 * Sets the hero's hallucination timer to `xtime` turns (0 ends it). Returns true when the state
 * changed. ref: src/potion.c make_hallucinated() (no resistance mask: no Grayswandir).
 */
export function makeHallucinated(
  ctx: Pick<Ctx, 'state' | 'emit'>,
  xtime: number,
  talk: boolean,
): boolean {
  const hero = getPlayer(ctx.state);
  const changed = hasProp(hero, P.HALLUC) !== xtime > 0;
  setItimeout(ctx.state, hero, P.HALLUC, xtime);
  if (changed && talk) {
    const verb = hasProp(hero, P.BLINDED) ? 'feels' : 'looks';
    ctx.emit({ type: 'msg', key: xtime ? `halluc.cosmic_${verb}` : `halluc.boring_${verb}` });
  }
  return changed;
}

/** ref: src/timeout.c nh_timeout(): what happens when a timed property runs out. */
function timeoutExpired(ctx: Ctx, hero: Entity, name: string): void {
  switch (name) {
    case P.STUNNED:
      // (the timer is already cleared, so make_stunned(0, TRUE)'s message is given directly)
      ctx.emit({ type: 'msg', key: 'stun.steady' });
      ctx.interrupt(); // stop_occupation()
      break;
    case P.CONFUSION:
      // ref: nh_timeout(): set_itimeout(&HConfusion, 1L); make_confused(0L, TRUE)
      ctx.emit({
        type: 'msg',
        key: hasProp(hero, P.HALLUC) ? 'conf.less_trippy' : 'conf.less_confused',
      });
      ctx.interrupt();
      break;
    case P.BLINDED:
      // ref: nh_timeout() BLINDED: make_blinded(0L, TRUE); if (!Blind) stop_occupation()
      if (hasProp(hero, P.BLINDED)) {
        if (hasExtrinsic(hero, P.BLINDED)) ctx.emit({ type: 'msg', key: 'blind.eyes_itch' });
      } else {
        ctx.emit({
          type: 'msg',
          key: hasProp(hero, P.HALLUC) ? 'blind.far_out' : 'blind.see_again',
        });
        ctx.interrupt();
      }
      break;
    case P.HALLUC:
      ctx.emit({
        type: 'msg',
        key: hasProp(hero, P.BLINDED) ? 'halluc.boring_feels' : 'halluc.boring_looks',
      });
      ctx.interrupt();
      break;
    case P.FAST:
      // "a bit" when an intrinsic remains; Very_fast is only the timed part, so it is over now
      ctx.emit({
        type: 'msg',
        key: hasProp(hero, P.FAST) ? 'timeout.slow_down_bit' : 'timeout.slow_down',
      });
      break;
    case P.WOUNDED_LEGS:
      // ref: src/do.c heal_legs(0): "Your leg feels better." (only the right leg is ever hurt)
      ctx.emit({ type: 'msg', key: 'timeout.legs_better' });
      break;
    case P.ACID_RES:
      if (!hasProp(hero, P.ACID_RES)) ctx.emit({ type: 'msg', key: 'timeout.acid_unsafe' });
      break;
    case P.STONE_RES:
      if (!hasProp(hero, P.STONE_RES)) ctx.emit({ type: 'msg', key: 'timeout.stone_unsafe' });
      break;
    default:
      break;
  }
}

/**
 * Role abilities gained with experience. ref: src/attrib.c val_abil[]: Valkyrie
 * `{1, HCold_resistance}`, `{3, HStealth, "stealthy"}`, `{7, HFast, "quick"}`.
 */
export const VALKYRIE_ABILITIES: readonly { level: number; prop: string; gain: string | null }[] = [
  { level: 1, prop: P.COLD_RES, gain: null },
  { level: 3, prop: P.STEALTH, gain: 'abil.stealthy' },
  { level: 7, prop: P.FAST, gain: 'abil.quick' },
];

/**
 * Grants the abilities whose level was just reached. ref: src/attrib.c adjabil(). Level loss
 * does not exist yet, so the "lose" half is not ported; the weapon-skill slots are handled in
 * skills.ts. The "You feel ...!" message shows only when no other source already gave the
 * property (`!(*ability & INTRINSIC & ~mask)`).
 */
export function adjabil(ctx: Ctx, heroId: EntityId, oldLevel: number, newLevel: number): void {
  const hero = ctx.state.entities[String(heroId)];
  if (!hero) return;
  for (const a of VALKYRIE_ABILITIES) {
    if (!(oldLevel < a.level && newLevel >= a.level)) continue;
    const had = hasIntrinsic(hero, a.prop);
    setIntrinsic(hero, a.prop, true);
    if (!had && a.gain) ctx.emit({ type: 'msg', key: a.gain });
  }
  // ref: src/attrib.c adjabil(): `if (oldlevel > 0 && newlevel > oldlevel) add_weapon_skill(...)`
  if (oldLevel > 0 && newLevel > oldLevel) addWeaponSkill(ctx, newLevel - oldLevel);
}

/** Registers the props hooks and the Stun status. ref: src/timeout.c, src/botl.c */
export function registerProps(api: ModApi): void {
  // ref: src/u_init.c u_init(): adjabil(0, 1) gives the level 1 abilities
  api.on('newGame', (ctx, heroId) => adjabil(ctx, heroId, 0, 1));
  // the worn-item cache follows the hero's accessories (a safety net for code that unequips
  // directly, such as removeFromInventory)
  api.on('afterAction', (ctx) => updateWornProps(ctx.state, ctx.defs, ctx.state.playerId));
  // ref: src/timeout.c nh_timeout(): every turn each timed property counts down; at 0 it ends
  api.on('endOfTurn', (ctx) => {
    updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
    const hero = getPlayer(ctx.state);
    const props = hero.c.props;
    if (!props) return;
    // ref: nh_timeout(): `if (u.uinvulnerable) return; /* things past this point could kill you */`
    const nh = ctx.state.modData['nh'] as { u?: { uinvulnerable?: boolean } } | undefined;
    if (nh?.u?.uinvulnerable) {
      for (const name of Object.keys(props).sort()) {
        const p = props[name];
        if (p && p.timeout > 0) p.timeout++; // the timers stand still
      }
      return;
    }
    for (const name of Object.keys(props).sort()) {
      const p = props[name];
      if (!p || p.timeout <= 0 || ctx.state.turn < p.timeout) continue;
      p.timeout = 0;
      prune(hero, name);
      timeoutExpired(ctx, hero, name);
    }
  });
  api.defineStatus({
    id: 'nh:stunned',
    // The UI shows any positive status field that has a `ui.status.<field>` word ("Stun").
    field: 'stun',
    value: (state) => (heroHas(state, P.STUNNED) ? 1 : null),
  });
  // ref: src/botl.c: the Conf, Blind and Hallu conditions
  for (const [field, prop] of [
    ['conf', P.CONFUSION],
    ['blind', P.BLINDED],
    ['hallu', P.HALLUC],
  ] as const)
    api.defineStatus({
      id: `nh:${prop}`,
      field,
      value: (state) => (heroHas(state, prop) ? 1 : null),
    });
}
