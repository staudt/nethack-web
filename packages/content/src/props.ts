// Hero properties (intrinsics and timed effects) and the innate abilities of the role.
// ref: include/prop.h, include/youprop.h, src/timeout.c nh_timeout(), src/potion.c make_stunned(),
// src/attrib.c adjabil() / *_abil[] (roletab.ts, racetab.ts)
//
// A property lives in `Components.props[name]`: `intrinsic` is the permanent flag (NetHack's
// FROMOUTSIDE / FROMEXPER bits) and `timeout` the turn a timed effect ends (0 = none). Names are
// NetHack's property names lowercased: 'cold_res', 'stunned', 'fast', 'stealth', ...
//
// Worn rings, amulets and armor confer their `ObjectDef.prop` as an extrinsic (NetHack's
// uprops[].extrinsic, set by setworn()): it is cached on the wearer as the entry
// `props['<name>:worn']` (present while some worn item gives it), rebuilt by `updateWornProps()`
// whenever the hero's accessories change and as a safety net after every action and turn.
// The polymorphed hero's form confers its properties the same way (C's FROMFORM bits):
// `props['<name>:form']`, written by `setFormProps()` (set_uasmon()).
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
import type { Spfx } from './artilist';
import { artiOf } from './artistate';
import { RACES_TAB, adjabilRace } from './racetab';
import { ROLES_TAB } from './roletab';
import { addWeaponSkill, loseWeaponSkill } from './skills';
import { roleIs, urace, urole } from './urole';

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
  SLIMED: 'slimed',
  SLEEPY: 'sleepy',
  REFLECTING: 'reflecting',
  ADORNED: 'adorned',
  ANTIMAGIC: 'antimagic',
  CLAIRVOYANT: 'clairvoyant',
  LEVITATION: 'levitation',
  TELEPORT: 'teleport',
  TELEPORT_CONTROL: 'teleport_control',
  CONFLICT: 'conflict',
  JUMPING: 'jumping',
  WARNING: 'warning',
  MAGICAL_BREATHING: 'magical_breathing',
  INVIS: 'invis',
  SEE_INVIS: 'see_invis',
  POLYMORPH: 'polymorph',
  POLYMORPH_CONTROL: 'polymorph_control',
  UNCHANGING: 'unchanging',
  FLYING: 'flying',
  INFRAVISION: 'infravision',
  DRAIN_RES: 'drain_res',
  WWALKING: 'wwalking',
  FUMBLING: 'fumbling',
  DISPLACED: 'displaced',
  PROT_FROM_SHAPE_CHANGERS: 'prot_from_shape_changers',
  /** Slippery fingers (timed only: glib.ts) */
  GLIB: 'glib',
  /** Warning of the monsters a wielded artifact is made to slay (Sting: orcs) */
  WARN_OF_MON: 'warn_of_mon',
  HALF_SPDAM: 'half_spell_damage',
  HALF_PHDAM: 'half_phys_damage',
  ENERGY_REGENERATION: 'energy_regeneration',
  HALLUC_RES: 'halluc_res',
  /** Resistance to blinding light (a wielded Sunsword) */
  BLND_RES: 'blnd_res',
} as const;

/** BClairvoyant: a worn cornuthaum blocks clairvoyance for anyone but a Wizard. ref: src/worn.c w_blocks() */
export const clairvoyanceBlocked = (state: Readonly<GameState>): boolean =>
  wornIn(state, state.playerId, 'helm')?.def === 'nh:cornuthaum' && !roleIs(state, 'wizard');

/** Clairvoyant: `(HClairvoyant || EClairvoyant) && !BClairvoyant`. ref: include/youprop.h */
export const heroClairvoyant = (state: Readonly<GameState>): boolean =>
  heroHas(state, P.CLAIRVOYANT) && !clairvoyanceBlocked(state);

/** The cached extrinsic entry of a property (see the header). */
const wornKey = (name: string): string => `${name}:worn`;
/** The entry of a property the polymorphed hero's form gives (FROMFORM; see setFormProps()). */
const formKey = (name: string): string => `${name}:form`;

/** True when a worn item gives the property (EFoo). */
export const hasExtrinsic = (e: Entity | undefined, name: string): boolean =>
  e?.c.props?.[wornKey(name)] !== undefined;

/** True when the polymorphed hero's form gives the property (HFoo & FROMFORM). */
export const hasFromForm = (e: Entity | undefined, name: string): boolean =>
  e?.c.props?.[formKey(name)] !== undefined;

/**
 * True while the entity has the property, permanently or on a timer. Hallucination does not
 * show while something gives hallucination resistance (`Hallucination` is `HHallucination &&
 * !EHalluc_resistance`). ref: youprop.h (e.g. Stunned, Hallucination)
 */
export function hasProp(e: Entity | undefined, name: string): boolean {
  if (name === P.HALLUC && hasExtrinsic(e, P.HALLUC_RES)) return false;
  const p = e?.c.props?.[name];
  return (
    (p !== undefined && (p.intrinsic || p.timeout > 0)) ||
    hasExtrinsic(e, name) ||
    hasFromForm(e, name)
  );
}

/**
 * Sets the properties the hero's form gives (C's FROMFORM bits, set by set_uasmon()): an entry
 * `props['<name>:form']` for each, every other `:form` entry removed (none in her own form).
 */
export function setFormProps(e: Entity, names: readonly string[]): void {
  const want = new Set(names.map(formKey));
  const props = e.c.props;
  for (const k of Object.keys(props ?? {}).sort()) {
    if (k.endsWith(':form') && !want.has(k) && props) delete props[k];
  }
  for (const k of [...want].sort()) {
    const p = (e.c.props ??= {});
    p[k] ??= { intrinsic: true, timeout: 0 };
  }
}

/**
 * The properties her own form gives (set_uasmon() when not polymorphed): infravision when her
 * race's monster has it (a dwarf's and a gnome's only source; elves and orcs also have it from
 * adjabil()). Her role's monster gives nothing here. ref: src/polyself.c set_uasmon() `PROPSET(
 * INFRAVISION, infravision(Upolyd ? mdat : &mons[gu.urace.mnum]))`
 */
export function ownFormProps(ctx: Pick<Ctx, 'state' | 'defs'>): string[] {
  const mnum = RACES_TAB[urace(ctx.state)].mnum;
  return ctx.defs.isMonster(mnum) && ctx.defs.monster(mnum).flags.includes('infravision')
    ? [P.INFRAVISION]
    : [];
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

/**
 * Protection_from_shape_changers: the ring (no intrinsic source here: #wizintrinsic is not
 * ported). ref: include/youprop.h
 */
export const protFromShapeChangers = (state: Readonly<GameState>): boolean =>
  heroHas(state, P.PROT_FROM_SHAPE_CHANGERS);

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

/**
 * True when the property is held permanently (HFoo & FROMOUTSIDE / FROMEXPER; the form's
 * FROMFORM bits are {@link hasFromForm}).
 */
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

/**
 * Slots whose items confer their property while worn: the accessories and the armor (jumping
 * boots). ref: include/prop.h W_ACCESSORY, W_ARMOR
 */
const ACCESSORY_SLOTS: ReadonlySet<string> = new Set([
  'ringL',
  'ringR',
  'amulet',
  'blindfold',
  'body',
  'cloak',
  'shirt',
  'helm',
  'gloves',
  'boots',
  'shield',
]);

/** The item the entity wears in `slot` (uleft = 'ringL', uright = 'ringR', uamul = 'amulet'). */
export function wornIn(state: Readonly<GameState>, id: EntityId, slot: string): Entity | null {
  return inventoryOf(state, id).find((o) => o.c.item?.equipped === slot) ?? null;
}

/**
 * The extra property each colour of dragon scales and scale mail gives the hero wearing it,
 * besides its `prop` (gray and silver: none; green's sickness resistance and gold's
 * hallucination resistance and light have no property here, see DEVIATIONS.md).
 * ref: src/do_wear.c dragon_armor_handling()
 */
const DRAGON_EXTRA: Readonly<Record<string, string>> = {
  black: P.DRAIN_RES,
  blue: P.FAST,
  red: P.INFRAVISION,
  orange: P.FREE_ACTION,
  yellow: P.STONE_RES,
  white: P.SLOW_DIGESTION,
};

/** The extra property of dragon scales or scale mail `def`, if any. */
export function dragonArmorExtra(def: string): string | undefined {
  const m = /^nh:([a-z]+)_dragon_scale(s|_mail)$/.exec(def);
  return m?.[1] !== undefined && Object.hasOwn(DRAGON_EXTRA, m[1]) ? DRAGON_EXTRA[m[1]] : undefined;
}

/**
 * The property an artifact's `defn` (worn or wielded) or `cary` (carried) damage type gives.
 * ref: src/artifact.c set_artifact_intrinsic() (the dtyp table)
 */
const ARTI_DTYP_PROP: Readonly<Record<string, string>> = {
  fire: P.FIRE_RES,
  cold: P.COLD_RES,
  elec: P.SHOCK_RES,
  magm: P.ANTIMAGIC,
  disn: P.DISINT_RES,
  drst: P.POISON_RES,
  drli: P.DRAIN_RES,
};

/**
 * The properties an artifact's special abilities give (spfx when worn or wielded, cspfx when
 * carried); 'warn' is Warn_of_mon for an artifact with a monster flag to slay, else Warning;
 * 'reflect' only from the wielded weapon's spfx. ref: src/artifact.c set_artifact_intrinsic()
 */
const ARTI_SPFX_PROP: Readonly<Partial<Record<Spfx, string>>> = {
  search: P.SEARCHING,
  halres: P.HALLUC_RES,
  esp: P.TELEPAT,
  stlth: P.STEALTH,
  regen: P.REGENERATION,
  tctrl: P.TELEPORT_CONTROL,
  eregen: P.ENERGY_REGENERATION,
  hspdam: P.HALF_SPDAM,
  hphdam: P.HALF_PHDAM,
  reflect: P.REFLECTING,
  protect: P.PROTECTION,
};

/**
 * The properties the hero's artifact `o` gives her: worn or wielded its `defn`
 * resistance and spfx abilities (Sunsword wielded: resistance to blinding light), carried its
 * `cary` resistance and cspfx abilities. SPFX_XRAY has no row here (the Eyes of the Overworld).
 * ref: src/artifact.c set_artifact_intrinsic() (C's W_ART/W_WEP bits are folded together)
 */
function artifactProps(o: Entity, slot: string | null): string[] {
  const a = artiOf(o);
  if (!a) return [];
  const out: string[] = [];
  const add = (dtyp: string | null, spfx: readonly Spfx[], wielded: boolean): void => {
    const r = dtyp === null ? undefined : ARTI_DTYP_PROP[dtyp];
    if (r) out.push(r);
    for (const f of spfx) {
      if (f === 'warn') out.push(a.bane?.kind === 'flag' ? P.WARN_OF_MON : P.WARNING);
      else if (f === 'reflect' && !wielded) continue;
      else {
        const prop = ARTI_SPFX_PROP[f];
        if (prop) out.push(prop);
      }
    }
  };
  if (slot !== null) {
    add(a.defn, a.spfx, slot === 'weapon');
    if (slot === 'weapon' && a.id === 'nh:sunsword') out.push(P.BLND_RES);
  }
  add(a.cary, a.cspfx, false);
  return out;
}

/**
 * The monster flags the hero is warned of by the artifacts she wields or wears (C's
 * context.warntype.obj: the M2 flag of an SPFX_WARN artifact's bane), sorted.
 * ref: src/artifact.c set_artifact_intrinsic() spec_m2()
 */
export function warnOfMonFlags(state: Readonly<GameState>): string[] {
  const out = new Set<string>();
  for (const o of inventoryOf(state, state.playerId)) {
    const a = artiOf(o);
    const slot = o.c.item?.equipped ?? null;
    if (a?.bane?.kind === 'flag' && a.spfx.includes('warn') && slot !== null) out.add(a.bane.flag);
  }
  return [...out].sort();
}

/**
 * Rebuilds the entity's extrinsic entries from its worn accessories (ref: src/worn.c setworn(),
 * setnotworn()) and, for the hero, her artifacts worn, wielded or carried (see
 * artifactProps()). Writes only when something changed, so an entity without worn accessories
 * keeps its props untouched.
 */
export function updateWornProps(state: GameState, defs: Registry, id: EntityId): void {
  const e = state.entities[String(id)];
  if (!e) return;
  const want = new Set<string>();
  const hero = id === state.playerId;
  for (const o of inventoryOf(state, id)) {
    const slot = o.c.item?.equipped ?? null;
    if (hero && o.c.item?.artifact !== undefined)
      for (const p of artifactProps(o, slot)) want.add(wornKey(p));
    if (!slot || !ACCESSORY_SLOTS.has(slot)) continue;
    const prop = defs.object(o.def).prop;
    if (prop) want.add(wornKey(prop));
    // the alchemy smock gives poison _and_ acid resistance (ref: src/do_wear.c Cloak_on())
    if (o.def === 'nh:alchemy_smock' && slot === 'cloak') want.add(wornKey(P.ACID_RES));
    // the hero's dragon scales and scale mail (dragon_armor_handling() sets the hero's only)
    const extra = hero && slot === 'body' ? dragonArmorExtra(o.def) : undefined;
    if (extra) want.add(wornKey(extra));
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
 * updateWornProps() for the hero with what C's set_artifact_intrinsic() says when it changes a
 * property: hallucination resistance coming or going while she hallucinates.
 */
export function refreshWornProps(ctx: Pick<Ctx, 'state' | 'defs' | 'emit'>): void {
  const hero = getPlayer(ctx.state);
  const hadRes = hasExtrinsic(hero, P.HALLUC_RES);
  updateWornProps(ctx.state, ctx.defs, hero.id);
  const hasRes = hasExtrinsic(hero, P.HALLUC_RES);
  if (hadRes !== hasRes) hallucResToggled(ctx, hasRes);
}

/** Damage halved (rounded up) by Half_physical_damage. ref: include/hack.h Maybe_Half_Phys() */
export const maybeHalfPhys = (state: Readonly<GameState>, dmg: number): number =>
  heroHas(state, P.HALF_PHDAM) ? Math.trunc((dmg + 1) / 2) : dmg;

/** Spell damage halved (rounded up) by Half_spell_damage. ref: Half_spell_damage callers */
export const maybeHalfSpell = (state: Readonly<GameState>, dmg: number): number =>
  heroHas(state, P.HALF_SPDAM) ? Math.trunc((dmg + 1) / 2) : dmg;

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
 * changed. While something gives hallucination resistance (Grayswandir) nothing shows: clearing
 * the timer then only says "Your vision seems to flatten for a moment but is normal now." (blind:
 * "Your eyes momentarily itch."). The resistance mask's own toggling is hallucResToggled().
 * ref: src/potion.c make_hallucinated() (mask 0; no eyeless forms)
 */
export function makeHallucinated(
  ctx: Pick<Ctx, 'state' | 'emit'>,
  xtime: number,
  talk: boolean,
): boolean {
  const hero = getPlayer(ctx.state);
  const old = timeoutLeft(ctx.state, hero, P.HALLUC) > 0;
  const changed = !hasExtrinsic(hero, P.HALLUC_RES) && hasProp(hero, P.HALLUC) !== xtime > 0;
  setItimeout(ctx.state, hero, P.HALLUC, xtime);
  // clearing temporary hallucination without toggling vision
  if (!changed && !xtime && old && talk)
    ctx.emit({
      type: 'msg',
      key: hasProp(hero, P.BLINDED) ? 'halluc.eyes_itch' : 'halluc.vision_flattens',
    });
  if (changed && talk) {
    const verb = hasProp(hero, P.BLINDED) ? 'feels' : 'looks';
    ctx.emit({ type: 'msg', key: xtime ? `halluc.cosmic_${verb}` : `halluc.boring_${verb}` });
  }
  return changed;
}

/**
 * Hallucination resistance just came (`on`) or went: while she hallucinates (the timer runs)
 * everything looks SO boring now, or cosmic again. ref: src/potion.c make_hallucinated() with a
 * mask (set_artifact_intrinsic()'s SPFX_HALRES)
 */
export function hallucResToggled(ctx: Pick<Ctx, 'state' | 'emit'>, on: boolean): void {
  const hero = getPlayer(ctx.state);
  if (timeoutLeft(ctx.state, hero, P.HALLUC) <= 0) return;
  const verb = hasProp(hero, P.BLINDED) ? 'feels' : 'looks';
  ctx.emit({ type: 'msg', key: on ? `halluc.boring_${verb}` : `halluc.cosmic_${verb}` });
}

/**
 * What runs out-of-module when a timed property ends (Fumbling's trip in fumble.ts, which sits
 * above this leaf), by property name; registered at load.
 */
const EXPIRY: Record<string, (ctx: Ctx) => void> = {};

/** Registers what happens when the property's timeout runs out (nh_timeout()'s case). */
export function setTimeoutExpiry(name: string, fn: (ctx: Ctx) => void): void {
  EXPIRY[name] = fn;
}

/** ref: src/timeout.c nh_timeout(): what happens when a timed property runs out. */
function timeoutExpired(ctx: Ctx, hero: Entity, name: string): void {
  const fn = EXPIRY[name];
  if (fn) {
    fn(ctx);
    return;
  }
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
      // ref: nh_timeout(): set_itimeout(&HHallucination, 1L); make_hallucinated(0L, TRUE, 0L)
      ctx.emit({
        type: 'msg',
        key: hasExtrinsic(hero, P.HALLUC_RES)
          ? hasProp(hero, P.BLINDED)
            ? 'halluc.eyes_itch'
            : 'halluc.vision_flattens'
          : hasProp(hero, P.BLINDED)
            ? 'halluc.boring_feels'
            : 'halluc.boring_looks',
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
 * Grants the abilities whose level was just reached, or takes away those of the levels just lost
 * (level drain): the role's table, then the race's (elves and orcs only). ref: src/attrib.c
 * adjabil(), role_abil(). The weapon-skill slots are handled in skills.ts. The "You feel ...!"
 * message shows only when no other source already gave the property (`!(*ability & INTRINSIC &
 * ~mask)`). There are no FROMEXPER/FROMRACE/FROMOUTSIDE bits here: a lost level takes the
 * intrinsic away even when something else gave it too (DEVIATIONS "Level drain and
 * lycanthropy"); postadjabil()'s see_monsters() is the display's next refresh.
 */
export function adjabil(ctx: Ctx, heroId: EntityId, oldLevel: number, newLevel: number): void {
  const hero = ctx.state.entities[String(heroId)];
  if (!hero) return;
  const abil = [...ROLES_TAB[urole(ctx.state)].abil, ...adjabilRace(urace(ctx.state))];
  for (const a of abil) {
    if (oldLevel < a.level && newLevel >= a.level) {
      const had = hasIntrinsic(hero, a.prop);
      setIntrinsic(hero, a.prop, true);
      if (!had && a.gain) ctx.emit({ type: 'msg', key: a.gain });
    } else if (oldLevel >= a.level && newLevel < a.level) {
      setIntrinsic(hero, a.prop, false);
      if (a.lose) ctx.emit({ type: 'msg', key: a.lose });
    }
  }
  // ref: src/attrib.c adjabil(): add_weapon_skill() / lose_weapon_skill() for the difference
  if (oldLevel > 0) {
    if (newLevel > oldLevel) addWeaponSkill(ctx, newLevel - oldLevel);
    else if (newLevel < oldLevel) loseWeaponSkill(ctx, oldLevel - newLevel);
  }
}

/** Registers the props hooks and the Stun status. ref: src/timeout.c, src/botl.c */
export function registerProps(api: ModApi): void {
  // ref: src/u_init.c u_init(): adjabil(0, 1) gives the level 1 abilities; set_uasmon() her own
  // form's (the race's infravision)
  api.on('newGame', (ctx, heroId) => {
    adjabil(ctx, heroId, 0, 1);
    const hero = ctx.state.entities[String(heroId)];
    if (hero) setFormProps(hero, ownFormProps(ctx));
  });
  // the worn-item cache follows the hero's accessories (a safety net for code that unequips
  // directly, such as removeFromInventory)
  api.on('afterAction', (ctx) => refreshWornProps(ctx));
  // ref: src/timeout.c nh_timeout(): every turn each timed property counts down; at 0 it ends
  api.on('endOfTurn', (ctx) => {
    refreshWornProps(ctx);
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
