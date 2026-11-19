// #invoke: the special powers of artifacts. An artifact rests between uses (its `age` is the
// turn it may be invoked again); the powers that toggle a property (conflict, levitation) are
// the hero's `<prop>:invoked` entries (C's W_ARTI bit, props.ts setInvoked()), turned off again
// by a second #invoke, when the artifact leaves her pack (a check after every action and turn:
// C's freeinv_core(); it also delays coming down until a dropped Heart of Ahriman has landed,
// C's finesse_ahriman()) or when she can no longer touch it (artitouch.ts untouchable()).
// ref: src/artifact.c doinvoke(), invoke_ok(), arti_invoke(), arti_invoke_cost(),
// arti_invoke_cost_pw(), nothing_special(), invoke_healing(), invoke_energy_boost(),
// invoke_untrap(), invoke_charge_obj(), invoke_create_portal(), invoke_create_ammo(),
// invoke_banish(), invoke_fling_poison(), invoke_storm_spell(), invoke_blinding_ray(),
// finesse_ahriman(); src/apply.c do_blinding_ray(); src/invent.c freeinv_core()
//
// Not ported (DEVIATIONS.md "Artifact #invoke"): TAMING (only the Palantir of Westernesse, which
// artilist.h leaves out, has it), a gremlin hero's light damage from Sunsword at herself, leashed
// pets holding back the portal (next_to_u()), flinging poison up, down or at herself (the spit's
// directions).
import { isUniqueRelic, uHave } from './uhave';
import {
  DIR_LIST,
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inventoryOf,
  levelIdFor,
  sortedIds,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type ModApi,
  type Msg,
  type Offer,
  type PromptOption,
} from '@nh/core';
import { couldseeAt } from './apparxy';
import { CRYSTAL_BALL, answerCrystalBall, isCrystalBallData, useCrystalBall } from './crystalball';
import { enlightenment } from './enlightenment';
import { heroInvisBlocked } from './invis';
import type { ArtifactDef } from './artilist';
import { artiOf, artiRole, artiRoleIs } from './artistate';
import { TOGGLED_POWERS, retouchObject, setInvokeReverse, theParam } from './artitouch';
import { flashburn } from './buzz';
import { doBlindingRay } from './camera';
import { castStorm } from './cast';
import { rnz } from './corpses';
import { DIRECTION_OPTIONS, heroItem, itemArg, spitVenom } from './dothrow';
import { isSick } from './hunger';
import { lookHere } from './itemactions';
import { findHell, inEndgame, inHell } from './levelflags';
import { floatDown, floatUp } from './levitation';
import { migrateToLevel } from './migrate';
import { mksobjFull } from './mkobj';
import { isDemon, isDlord, isDprince } from './mondata';
import { xnameOf } from './objnam';
import { cureSick } from './potion';
import {
  P,
  hasFromForm,
  hasIntrinsic,
  hasInvoked,
  hasProp,
  hasPropBesidesInvoked,
  makeBlinded,
  setInvoked,
  timeoutLeft,
} from './props';
import { litroom } from './read';
import { chargeOptions, recharge } from './seffect';
import { isSlimed, makeSlimed } from './slimestate';
import { spellLevPw } from './spellcalc';
import { levelTele, uTeleportMon } from './trap';
import { ucreamed } from './creamed';
import { pwOf, setPw } from './uenergy';
import { invokeUntrap } from './untrap';
import { heroFormId } from './upoly';
import { holdAnotherObject } from './wish';
import { ZAP_DIRECTIONS, zapDirOf } from './zap';

export const INVOKE_ID: DefId = 'nh:invoke';

const FAKE_AMULET: DefId = 'nh:fake_amulet_of_yendor';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Pick<Ctx, 'state'>): Entity => getPlayer(ctx.state);

/**
 * What #invoke suggests: artifacts, unique objects, an imitation Amulet not known to be one and
 * crystal balls (a synonym for apply). ref: src/artifact.c invoke_ok()
 */
function invokeOk(e: Entity): boolean {
  const it = e.c.item;
  if (!it) return false;
  return (
    it.artifact !== undefined ||
    isUniqueRelic(e.def) ||
    (e.def === FAKE_AMULET && !it.known.spe) ||
    e.def === CRYSTAL_BALL
  );
}

/** "You feel a surge of power, but nothing seems to happen." ref: nothing_special() */
function nothingSpecial(ctx: Ctx, obj: Entity | null): void {
  if (obj?.c.item?.carriedBy === ctx.state.playerId) say(ctx, 'invoke.nothing_special');
}

/** "You feel that Fire Brand is ignoring you." (an artifact is never more than one) */
const ignoring = (ctx: Ctx, obj: Entity): void =>
  say(ctx, 'invoke.ignoring', { item: theParam(ctx, obj) });

/**
 * The energy an invocation costs while the artifact rests: a level 5 spell's (25) for flinging
 * poison and the blinding ray, else none can be paid (-1). ref: arti_invoke_cost_pw()
 */
const invokeCostPw = (a: ArtifactDef): number =>
  a.invoke === 'fling_poison' || a.invoke === 'blinding_ray' ? spellLevPw(5) : -1;

/**
 * Whether the invocation can be paid: a rested artifact rests `rnz(100)` turns from now; a
 * tired one "is ignoring you" and rests `d(3,10)` more, unless she pays the energy cost ("You feel
 * drained..."). ref: src/artifact.c arti_invoke_cost()
 */
function invokeCost(ctx: Ctx, obj: Entity, a: ArtifactDef): boolean {
  const it = obj.c.item;
  if (!it) return false;
  if ((it.age ?? 0) > ctx.state.turn) {
    const pwCost = invokeCostPw(a);
    const pw = pwOf(ctx.state);
    if (pwCost < 0 || pw.uen < pwCost) {
      // the artifact is tired :-)
      ignoring(ctx, obj);
      // and just got more so; patience is essential...
      it.age = (it.age ?? 0) + ctx.rng.d(3, 10);
      return false;
    }
    // you pay invoke cost with your own magic
    say(ctx, 'invoke.drained');
    setPw(ctx, { uen: pw.uen - pwCost });
  } else it.age = ctx.state.turn + rnz(ctx, 100);
  return true;
}

/**
 * Toggles the property `prop` of the artifact's power (`obj` null: it is gone). On while the
 * artifact rests: "is ignoring you" and `d(3,10)` more rest; off: it rests `rnz(100)` turns.
 * With the property from another source too, nothing seems to happen; else "You feel like a
 * rabble-rouser." / "You feel the tension decrease around you.", she floats up or down, or
 * (not blind, no mummy wrapping) "Your body takes on a strange transparency..." / "Your body
 * seems to unfade...". ref: src/artifact.c arti_invoke() `inv_prop <= LAST_PROP`
 */
function toggleInvoked(ctx: Ctx, obj: Entity | null, prop: string): number {
  const h = hero(ctx);
  const on = !hasInvoked(h, prop);
  setInvoked(h, prop, on);
  const it = obj?.c.item;
  if (on && obj && it && (it.age ?? 0) > ctx.state.turn) {
    setInvoked(h, prop, false);
    ignoring(ctx, obj);
    // can't just keep repeatedly trying
    it.age = (it.age ?? 0) + ctx.rng.d(3, 10);
    return NORMAL_SPEED;
  } else if (!on && it) {
    // when turning off property, determine downtime
    it.age = ctx.state.turn + rnz(ctx, 100);
  }
  if (hasPropBesidesInvoked(h, prop)) {
    // you had the property from some other source too
    nothingSpecial(ctx, obj);
    return NORMAL_SPEED;
  }
  if (prop === P.CONFLICT) say(ctx, on ? 'invoke.rabble_rouser' : 'invoke.tension_decrease');
  else if (prop === P.LEVITATION) {
    // (spoteffects() after float_up() is for sinks: none exist)
    if (on) floatUp(ctx);
    else floatDown(ctx, true, true);
  } else if (prop === P.INVIS) {
    // (newsym(): the engine redraws her after the action)
    if (heroInvisBlocked(ctx.state) || hasProp(h, P.BLINDED)) {
      nothingSpecial(ctx, obj);
      return NORMAL_SPEED;
    }
    if (on) {
      const how = hasProp(h, P.HALLUC) ? 'normal' : 'strange';
      say(ctx, 'invoke.transparency', { how: `@invoke.transparency.${how}` });
    } else say(ctx, 'invoke.unfade');
  }
  return NORMAL_SPEED;
}

/**
 * The Staff of Aesculapius: half the missing hit points, sickness, slime and the temporary
 * blindness that is not cream on her face; "You feel better." ("slightly" when only the
 * blindness was cured and she stays blind). ref: src/artifact.c invoke_healing() (5.0's
 * duplicated "You feel better." line is printed once)
 */
function invokeHealing(ctx: Ctx, obj: Entity): number {
  const h = hero(ctx);
  const hp = h.c.hp;
  // Upolyd ? u.mh : u.uhp: the active pool
  const healamt = hp ? Math.trunc((hp.max + 1 - hp.cur) / 2) : 0;
  const creamed = ucreamed(ctx.state);
  const sick = isSick(ctx);
  const slimed = isSlimed(ctx.state);
  const blindTimeout = timeoutLeft(ctx.state, h, P.BLINDED);
  if (healamt || sick || slimed || blindTimeout > creamed) {
    const slightly =
      !healamt && !sick && !slimed && (hasIntrinsic(h, P.BLINDED) || hasFromForm(h, P.BLINDED)); // (HBlinded & ~TIMEOUT)
    say(ctx, slightly ? 'invoke.slightly_better' : 'invoke.better');
  } else {
    nothingSpecial(ctx, obj);
    return NORMAL_SPEED;
  }
  if (healamt > 0 && hp) hp.cur += healamt;
  if (sick) cureSick(ctx); // make_sick(0L, (char *) 0, FALSE, SICK_ALL)
  if (slimed) makeSlimed(ctx, 0, null);
  if (blindTimeout > creamed) makeBlinded(ctx, creamed, false);
  return NORMAL_SPEED;
}

/**
 * The Mitre of Holiness: half the missing energy, at most 120, at least what is missing when
 * that is under 12: "You feel re-energized.". ref: src/artifact.c invoke_energy_boost()
 */
function invokeEnergyBoost(ctx: Ctx, obj: Entity): number {
  const pw = pwOf(ctx.state);
  let epboost = Math.trunc((pw.uenmax + 1 - pw.uen) / 2);
  if (epboost > 120)
    epboost = 120; // arbitrary
  else if (epboost < 12) epboost = pw.uenmax - pw.uen;
  if (epboost) {
    setPw(ctx, { uen: pw.uen + epboost });
    say(ctx, 'invoke.reenergized');
  } else nothingSpecial(ctx, obj);
  return NORMAL_SPEED;
}

/**
 * The Platinum Yendorian Express Card: what to charge (getobj "charge"); nothing to pick or a
 * dismissed menu undoes the rest and takes no time. ref: src/artifact.c invoke_charge_obj()
 */
function invokeChargeObj(ctx: Ctx, obj: Entity): number {
  const options = chargeOptions(ctx);
  if (options.length === 0) {
    say(ctx, 'scroll.charging.nothing');
    if (obj.c.item) obj.c.item.age = 0;
    return 0;
  }
  ask(
    ctx,
    { id: 'invoke-charge', kind: 'menu', key: 'scroll.charging.what', cancellable: true, options },
    { invoke: obj.id, stage: 'charge' },
  );
  return 0;
}

/** The charge picked: blessed (her role's or no role's) charges as a blessed scroll. */
function answerCharge(ctx: Ctx, obj: Entity, value: Json): number {
  const otmp = heroItem(ctx, value);
  const it = obj.c.item;
  if (!otmp || !it) {
    if (it) it.age = 0;
    return 0;
  }
  const a = artiOf(obj);
  const bEffect =
    it.buc === 'blessed' &&
    a !== null &&
    (artiRoleIs(ctx.state, a) || artiRole(ctx.state, a) === null);
  recharge(ctx, otmp, bEffect ? 1 : it.buc === 'cursed' ? -1 : 0);
  return NORMAL_SPEED;
}

/** dunlev_ureached: the deepest level of the dungeon she has been on (0: none; levels exist once visited). */
function ureached(ctx: Pick<Ctx, 'state'>, dungeon: DefId): number {
  let deepest = 0;
  for (const lv of Object.values(ctx.state.levels))
    if (lv.dungeon === dungeon) deepest = Math.max(deepest, lv.dlevel);
  return deepest;
}

/**
 * The Eye of the Aethiopica: "Open a portal to which dungeon?" among the dungeons she has
 * reached (no question with only one). ref: src/artifact.c invoke_create_portal()
 */
function invokeCreatePortal(ctx: Ctx, obj: Entity): number {
  const reached = ctx.state.dungeons
    .map((d, i) => ({ d, i }))
    .filter(({ d }) => ureached(ctx, d.id) > 0);
  if (reached.length > 1) {
    const options: PromptOption[] = reached.map(({ d, i }) => ({
      value: i,
      key: ctx.defs.dungeon(d.id).nameKey,
    }));
    ask(
      ctx,
      { id: 'invoke-portal', kind: 'menu', key: 'invoke.portal_q', cancellable: true, options },
      { invoke: obj.id, stage: 'portal' },
    );
    return 0;
  }
  const last = reached[reached.length - 1];
  return portalTo(ctx, last ? last.i : 0);
}

/**
 * The portal to dungeon `i`: to its entry when it starts no shallower than here, else to the
 * deepest level she reached in it; within this dungeon, while she carries the Amulet of Yendor,
 * or to or from the Planes "You feel very disoriented for a moment.", else "You are surrounded
 * by a shimmering sphere!" ("You feel weightless for a moment." blind) and she arrives at a
 * random spot. (no leashes)
 */
function portalTo(ctx: Ctx, i: number): number {
  const d = ctx.state.dungeons[i];
  const here = getLevel(ctx.state);
  if (!d) return NORMAL_SPEED;
  const dlevel = d.depthStart >= here.depth ? (d.entry ?? 1) : ureached(ctx, d.id);
  if (
    uHave(ctx.state, 'amulet') ||
    inEndgame(ctx.state, here) ||
    inEndgame(ctx.state, { dungeon: d.id, dlevel }) ||
    d.id === here.dungeon
  ) {
    say(ctx, 'invoke.disoriented');
    return NORMAL_SPEED;
  }
  say(ctx, hasProp(hero(ctx), P.BLINDED) ? 'invoke.weightless' : 'invoke.sphere');
  ctx.goToLevel({ dungeon: d.id, dlevel }, 'random'); // goto_level(&newlev, FALSE, FALSE, FALSE)
  if (!ctx.state.gameOver) lookHere(ctx);
  return NORMAL_SPEED;
}

/**
 * The Longbow of Diana: a stack of arrows of the bow's blessing (blessed: `rnd(10)` more and no
 * negative enchantment; cursed: none positive; uncursed: `rnd(5)` more), not eroded, into her
 * pack or "Suddenly 9 arrows fall out." at her feet. ref: src/artifact.c invoke_create_ammo()
 */
function invokeCreateAmmo(ctx: Ctx, obj: Entity): number {
  const bow = obj.c.item;
  if (!bow) return NORMAL_SPEED;
  const id = mksobjFull(ctx, ctx.defs.object('nh:arrow'), { artif: false });
  const it = ctx.state.entities[String(id)]?.c.item;
  if (!it) {
    nothingSpecial(ctx, obj);
    return NORMAL_SPEED;
  }
  it.buc = bow.buc;
  it.known.buc = bow.known.buc;
  delete it.erosion;
  if (bow.buc === 'blessed') {
    if (it.spe < 0) it.spe = 0;
    it.quantity += ctx.rng.rnd(10);
  } else if (bow.buc === 'cursed') {
    if (it.spe > 0) it.spe = 0;
  } else it.quantity += ctx.rng.rnd(5);
  const e = ctx.state.entities[String(id)];
  const n = it.quantity;
  holdAnotherObject(ctx, id, {
    key: n !== 1 ? 'invoke.ammo_fall.plural' : 'invoke.ammo_fall',
    params: {
      item: {
        key: 'wish.aobjnam',
        params: {
          count: n !== 1 ? { key: 'obj.count', params: { n } } : '',
          name: e ? xnameOf(ctx.state, ctx.defs, e) : '',
        },
      },
    },
  });
  return NORMAL_SPEED;
}

/**
 * The level a banished demon goes to: a random level of Gehennom, `rn2(levels)` as C counts it,
 * so 0 is the ledger level just before Gehennom (the bottom of the dungeon above it in ledger
 * order: the Castle). ref: invoke_banish() `dest.dlevel = rn2(dunlevs_in_dungeon(&dest))`,
 * ledger_no()
 */
function banishDest(ctx: Ctx): string | null {
  const hell = findHell(ctx.state);
  if (!hell) return null;
  const idx = ctx.state.dungeons.findIndex((d) => d.id === hell.dungeon);
  const layout = ctx.state.dungeons[idx];
  if (!layout || layout.levels === null) return null;
  const dlevel = ctx.rng.rn2(layout.levels);
  if (dlevel > 0) return levelIdFor(ctx.state, { dungeon: hell.dungeon, dlevel });
  const before = ctx.state.dungeons[idx - 1];
  if (!before || before.levels === null) return levelIdFor(ctx.state, hell);
  return levelIdFor(ctx.state, { dungeon: before.id, dlevel: before.levels });
}

/**
 * Demonbane: every demon and imp she could see (a clear line) wakes, turns hostile and, a demon
 * lord 1 time in 2 and a prince 1 in 3, vanishes to a random level of Gehennom (in Gehennom it
 * is teleported away instead): "The demon disappears in a cloud of brimstone!" ("Some of the
 * demons", "Most of the demons" when some stayed). ref: src/artifact.c invoke_banish() (no quest
 * nemeses)
 */
function invokeBanish(ctx: Ctx): number {
  let nvanished = 0;
  let nstayed = 0;
  const levelId = ctx.state.currentLevel;
  const hell = inHell(ctx.state);
  for (const id of sortedIds(ctx.state)) {
    const mon = ctx.state.entities[String(id)];
    const p = mon?.c.pos;
    const m = mon?.c.monster;
    if (!mon || !m || !p || p.level !== levelId || id === ctx.state.playerId) continue;
    const def = ctx.defs.monster(mon.def);
    if (!isDemon(def) && def.glyph.ch !== 'i') continue; // S_IMP
    if (!couldseeAt(ctx, p.x, p.y)) continue;
    let chance = 1;
    if (isDprince(def)) chance += 2;
    if (isDlord(def)) chance++;
    m.asleep = false;
    delete m.tame;
    m.peaceful = false;
    if (chance <= 1 || !ctx.rng.rn2(chance)) {
      if (!hell) {
        nvanished++;
        // banish to a random level in Gehennom
        const dest = banishDest(ctx);
        if (dest) migrateToLevel(ctx, mon, dest); // MIGR_RANDOM
      } else uTeleportMon(ctx, mon, false);
    } else nstayed++;
  }
  if (nvanished) {
    const who = nstayed ? (nvanished > nstayed ? 'most' : 'some') : 'the';
    say(ctx, `invoke.banish.${who}${nvanished === 1 ? '' : '.plural'}`);
  }
  return NORMAL_SPEED;
}

/** The direction questions of the powers that ask one. */
function askDirection(ctx: Ctx, obj: Entity, stage: 'fling' | 'ray'): number {
  ask(
    ctx,
    {
      id: 'invoke-direction',
      kind: 'direction',
      key: 'zap.direction',
      options: stage === 'fling' ? DIRECTION_OPTIONS : [...ZAP_DIRECTIONS],
    },
    { invoke: obj.id, stage },
  );
  return 0;
}

/** No direction picked: "Never mind." and the artifact rests from now (no time). */
function neverMind(ctx: Ctx, obj: Entity): number {
  say(ctx, 'invoke.never_mind');
  if (obj.c.item) obj.c.item.age = ctx.state.turn;
  return 0;
}

/**
 * Grimtooth: a splash of blinding venom or acid venom (1 in 2) thrown her way, as she spits it.
 * ref: src/artifact.c invoke_fling_poison()
 */
function answerFling(ctx: Ctx, obj: Entity, value: Json): number {
  const dir = DIR_LIST.find((d) => d === value);
  if (dir === undefined) return neverMind(ctx, obj);
  const d = zapDirOf(ctx, dir); // getdir(): confdir() when impaired
  const venom: DefId = ctx.rng.rn2(2) ? 'nh:splash_of_blinding_venom' : 'nh:splash_of_acid_venom';
  if (d !== undefined && d !== 'self' && d !== 'up' && d !== 'down') spitVenom(ctx, venom, d);
  return NORMAL_SPEED;
}

/**
 * Sunsword's blinding ray: along a direction the flash blinds the first monster it meets; up or
 * down it lights her spot ("It is lit here now."); at herself it blinds her for `damg +
 * rnd(damg)` turns (15 blessed, 10 uncursed, 5 cursed) unless she resists ("Nothing seems to
 * happen."). ref: src/artifact.c invoke_blinding_ray(), src/apply.c do_blinding_ray()
 */
function answerRay(ctx: Ctx, obj: Entity, value: Json): number {
  const d = value === null ? undefined : zapDirOf(ctx, value);
  if (d === undefined) return neverMind(ctx, obj);
  const h = hero(ctx);
  if (d === 'up' || d === 'down') {
    // litroom() uses radius 0 for Sunsword, except on Rogue level where whole room gets lit and
    // corridor spots remain unlit
    const level = getLevel(ctx.state);
    const p = h.c.pos;
    const i = p ? p.y * level.width + p.x : -1;
    const waslit = level.lit[i] === 1;
    litroom(ctx, true, false, true);
    const lit = getLevel(ctx.state).lit[i] === 1;
    say(ctx, !hasProp(h, P.BLINDED) && lit && !waslit ? 'invoke.lit_here' : 'invoke.nothing_seems');
  } else if (d === 'self') {
    // zapyourself(): a gremlin hero's lightdamage() is not ported
    const vulnerable = heroFormId(ctx.state) === 'nh:gremlin';
    const buc = obj.c.item?.buc;
    const damg = buc === 'blessed' ? 15 : buc !== 'cursed' ? 10 : 5;
    if (!flashburn(ctx, damg + ctx.rng.rnd(damg)) && !vulnerable) say(ctx, 'invoke.nothing_seems');
  } else doBlindingRay(ctx, d);
  return NORMAL_SPEED;
}

/**
 * Invoking the carried object: no power, "Nothing happens."; a toggled property flips (see
 * toggleInvoked()); any other power is paid for (see invokeCost()) and goes off.
 * ref: src/artifact.c arti_invoke()
 */
function artiInvoke(ctx: Ctx, obj: Entity): number {
  const a = artiOf(obj);
  if (!a?.invoke) {
    if (obj.def === CRYSTAL_BALL) return useCrystalBall(ctx, obj, INVOKE_ID);
    say(ctx, 'invoke.nothing_happens');
    return NORMAL_SPEED;
  }
  const prop = TOGGLED_POWERS[a.invoke];
  if (prop !== undefined) return toggleInvoked(ctx, obj, prop);
  // It's a special power, not "just" a property
  if (!invokeCost(ctx, obj, a)) return NORMAL_SPEED;
  switch (a.invoke) {
    case 'healing':
      return invokeHealing(ctx, obj);
    case 'energy_boost':
      return invokeEnergyBoost(ctx, obj);
    case 'untrap':
      return invokeUntrap(ctx, obj.id);
    case 'charge_obj':
      return invokeChargeObj(ctx, obj);
    case 'lev_tele':
      // level_tele(): with teleport control the level prompt's answer spends the move
      levelTele(ctx, { cost: NORMAL_SPEED });
      return ctx.state.pendingPrompt ? 0 : NORMAL_SPEED;
    case 'create_portal':
      return invokeCreatePortal(ctx, obj);
    case 'enlightening':
      // enlightenment(MAGICENLIGHTENMENT, ENL_GAMEINPROGRESS)
      ctx.emit({ type: 'list', titleKey: 'enl.title', items: enlightenment(ctx) });
      return NORMAL_SPEED;
    case 'create_ammo':
      return invokeCreateAmmo(ctx, obj);
    case 'banish':
      return invokeBanish(ctx);
    case 'fling_poison':
      return askDirection(ctx, obj, 'fling');
    case 'snowstorm':
      return castStorm(ctx, 'nh:spellbook_of_cone_of_cold');
    case 'firestorm':
      return castStorm(ctx, 'nh:spellbook_of_fireball');
    case 'blinding_ray':
      return askDirection(ctx, obj, 'ray');
    default:
      // TAMING: no row has it (the Palantir of Westernesse is left out of artilist.h)
      say(ctx, 'invoke.nothing_happens');
      return NORMAL_SPEED;
  }
}

/** A pending #invoke question: the artifact and what is asked. */
interface InvokeData {
  invoke: EntityId;
  stage: 'charge' | 'portal' | 'fling' | 'ray';
}

function ask(ctx: Ctx, prompt: Parameters<Ctx['ask']>[0], data: InvokeData): void {
  ctx.ask(prompt, INVOKE_ID, data as unknown as Json);
}

const isInvokeData = (data: Json): boolean =>
  typeof data === 'object' &&
  data !== null &&
  !Array.isArray(data) &&
  typeof (data as { invoke?: unknown }).invoke === 'number';

/** The live object with the artifact power `power`, anywhere (artifacts are unique). */
function artifactWithPower(ctx: Pick<Ctx, 'state'>, power: string): Entity | null {
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.item?.artifact !== undefined && artiOf(e)?.invoke === power) return e;
  }
  return null;
}

/**
 * A toggled power is on but no carried artifact has it any more (dropped, stolen, put in a bag,
 * destroyed): it is turned off as C's freeinv_core() does, after the action, so a dropped Heart
 * of Ahriman lands before she floats down (C's finesse_ahriman()).
 * ref: src/invent.c freeinv_core() -> set_artifact_intrinsic(obj, 0, W_ART) -> arti_invoke()
 */
function invokedLeftPack(ctx: Ctx): void {
  if (ctx.state.gameOver) return;
  const h = hero(ctx);
  for (const power of Object.keys(TOGGLED_POWERS).sort()) {
    const prop = TOGGLED_POWERS[power];
    if (prop === undefined || !hasInvoked(h, prop)) continue;
    if (inventoryOf(ctx.state, h.id).some((o) => artiOf(o)?.invoke === power)) continue;
    toggleInvoked(ctx, artifactWithPower(ctx, power), prop);
    if (ctx.state.gameOver) return;
  }
}

/**
 * #invoke, offered on each carried artifact, unique object and imitation Amulet not known to be
 * one (invoke_ok()); the picker (`M-i`) lists them. She touches it first (retouch_object(): an
 * artifact that will not have her takes the move). ref: src/artifact.c doinvoke()
 */
const invoke: ActionDef = {
  id: INVOKE_ID,
  labelKey: 'action.nh:invoke',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    if (!e || !invokeOk(e)) return [];
    return [
      {
        action: { type: 'mod', action: INVOKE_ID, args: { item: e.id } },
        labelKey: 'action.nh:invoke',
      },
    ];
  },
  perform(ctx, action) {
    const obj = heroItem(ctx, itemArg(action));
    if (!obj || !invokeOk(obj)) return 0;
    if (!retouchObject(ctx, obj, false)) return NORMAL_SPEED;
    return artiInvoke(ctx, obj);
  },
  answer(ctx, value, raw) {
    if (isCrystalBallData(raw)) return answerCrystalBall(ctx, value, raw);
    if (!isInvokeData(raw)) return 0;
    const data = raw as unknown as InvokeData;
    const obj = ctx.state.entities[String(data.invoke)];
    if (!obj?.c.item) return 0;
    switch (data.stage) {
      case 'charge':
        return answerCharge(ctx, obj, value);
      case 'portal':
        // a dismissed menu: nothing special, and the time is taken
        if (typeof value !== 'number') {
          nothingSpecial(ctx, obj);
          return NORMAL_SPEED;
        }
        return portalTo(ctx, value);
      case 'fling':
        return answerFling(ctx, obj, value);
      case 'ray':
        return answerRay(ctx, obj, value);
    }
    return 0;
  },
};

export const INVOKE_ACTIONS: readonly ActionDef[] = [invoke];

/** #invoke and the check that turns off a power whose artifact left her pack. */
export function registerInvoke(api: ModApi): void {
  for (const a of INVOKE_ACTIONS) api.defineAction(a);
  setInvokeReverse((ctx, obj) => {
    const a = artiOf(obj);
    const prop = a?.invoke ? TOGGLED_POWERS[a.invoke] : undefined;
    if (prop !== undefined && hasInvoked(hero(ctx), prop)) toggleInvoked(ctx, obj, prop);
  });
  api.on('afterAction', (ctx) => invokedLeftPack(ctx));
  api.on('endOfTurn', (ctx) => invokedLeftPack(ctx));
}
