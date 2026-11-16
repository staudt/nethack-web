// Seduction by the amorous demon (incubus or succubus): its rings, the armor it asks her to take
// off, the night and its outcome, its fee. Its questions are yes/no prompts: the run stops at each
// and SEDUCE_ID's answer() goes on from where it stopped (the state in the prompt's data), so
// the whole of doseduce() is one prompt chain. ref: src/mhitu.c doseduce(), mayberem()
//
// Not ported: Deaf (she is never deaf here), stop_donning() (wearing and taking off take effect
// at once in this port), exercise(), Half_physical_damage (no source), ld()'s leap-day line
// ("Well, then you owe me ... gloves!": no calendar in the core), the cloak/suit/helm simple
// names (armor_simple_name()'s "cloak", "suit", "helm").
import {
  getPlayer,
  inventoryOf,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type ModApi,
  type Msg,
} from '@nh/core';
import { adjattrib } from './attrstate';
import { losexp, resistsDrliHero } from './exper';
import { AMOROUS_DEMON, genderedDef, heroFemale, monFemale } from './gender';
import { pluslvl } from './hero';
import { losehp } from './hp';
import { canseemon } from './invis';
import { prinv, welded } from './itemactions';
import { removeFromInventory } from './items';
import { ringGone, ringOn } from './jewelry';
import { adjalign, uState } from './luck';
import { money2mon, moneyCnt } from './money';
import { isCancelled, mspecUsed, setCancelled, setMspecUsed } from './mstate';
import { discover } from './o_init';
import { armorSimpleName, xnameOf } from './objnam';
import { canSpotMon, monNam } from './perception';
import { updateWornProps } from './props';
import { mpickobj, removeWornItem, unresponsive } from './steal';
import { teleRestrict } from './teleport';
import { rlocMon } from './trap';
import { pwOf, setPw } from './uenergy';
import { heroFormId, ownHp, upolyd } from './upoly';

/** The action whose answer() goes on with the seduction after each question (offered nowhere). */
export const SEDUCE_ID: DefId = 'nh:seduce';
const ADORNMENT: DefId = 'nh:ring_of_adornment';
const LEPRECHAUN: DefId = 'nh:leprechaun';
/** ref: include/global.h LARGEST_INT */
const LARGEST_INT = 32767;

/** The seduction in progress, kept in the pending prompt's data. */
interface Sed {
  mon: EntityId;
  /** a succubus (else an incubus) */
  fem: boolean;
  /** canseemon() at the start: Who is her name, else "She"/"He" */
  seewho: boolean;
  /** her rings of adornment at the start, in inventory order (C's walk of the invent chain) */
  rings: EntityId[];
  ri: number;
  /** where in the current ring's step it stopped (0 start, 1 after the gloves, 2 take or wear) */
  sub: number;
  /** tried_gloves */
  tried: boolean;
  /** -1: the rings; 0..7: the next mayberem() of the undressing (7: done) */
  ai: number;
  /** what the pending question is about */
  q: 'ring' | 'rem' | null;
  obj: EntityId | null;
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const monOf = (ctx: Ctx, id: EntityId): Entity | null => {
  const e = ctx.state.entities[String(id)];
  return e?.c.monster ? e : null;
};

const worn = (ctx: Ctx, slot: string): Entity | null =>
  inventoryOf(ctx.state, ctx.state.playerId).find((o) => o.c.item?.equipped === slot) ?? null;

const carried = (ctx: Ctx, id: EntityId): Entity | null => {
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
};

/** ACURR(A_CHA) */
const cha = (ctx: Ctx): number => getPlayer(ctx.state).c.attributes?.cha ?? 10;

/** ref: m_next2u(): on her level and next to her (C's `u.utotype` is an immediate level change) */
function next2u(ctx: Ctx, mon: Entity | null): boolean {
  const hp = getPlayer(ctx.state).c.pos;
  const p = mon?.c.pos;
  return (
    !!hp && !!p && p.level === hp.level && Math.abs(hp.x - p.x) <= 1 && Math.abs(hp.y - p.y) <= 1
  );
}

/** Who: her name when seen at the start, else "She" or "He". */
function who(ctx: Ctx, d: Sed, mon: Entity): string {
  return d.seewho ? monNam(ctx, mon) : d.fem ? '@pronoun.she' : '@pronoun.he';
}

/** noit_mon_nam(): her name even unseen ("by this point you have discovered mon's identity") */
const noitMonNam = (ctx: Ctx, mon: Entity): string =>
  canSpotMon(ctx, mon) ? monNam(ctx, mon) : `@${genderedDef(ctx, mon)}`;

/** mhe(): "it" when she can't spot it. ref: src/mondata.c pronoun_gender() (no hallucination) */
const mhe = (ctx: Ctx, mon: Entity): string =>
  !canSpotMon(ctx, mon) ? '@pronoun.it' : monFemale(ctx, mon) ? '@pronoun.she' : '@pronoun.he';

/** noit_mhim() */
const noitMhim = (ctx: Ctx, mon: Entity): string =>
  monFemale(ctx, mon) ? '@pronoun.her' : '@pronoun.him';

/** yname(): "your <xname>" */
const yname = (ctx: Ctx, obj: Entity): Msg => ({
  key: 'steal.your',
  params: { item: xnameOf(ctx.state, ctx.defs, obj) },
});

/**
 * The amorous demon seduces her. False when it does nothing ("acts as though he has got a
 * headache": cancelled or still worn out; "seems dismayed at your lack of response": she is
 * helpless); otherwise true: it is gone or its attack is over (a question may be pending).
 * ref: src/mhitu.c doseduce()
 */
export function doseduce(ctx: Ctx, mon: Entity): boolean {
  const fem = mon.def === AMOROUS_DEMON && monFemale(ctx, mon); // otherwise incubus
  const mcan = isCancelled(ctx, mon.id);
  if (mcan || mspecUsed(ctx, mon.id) > 0) {
    say(ctx, mcan ? 'seduce.headache_severe' : 'seduce.headache', {
      mon: monNam(ctx, mon),
      he: mhe(ctx, mon),
    });
    return false;
  }
  if (unresponsive(ctx)) {
    say(ctx, 'seduce.dismayed', { mon: monNam(ctx, mon) });
    return false;
  }
  const seewho = canseemon(ctx, mon);
  if (!seewho) say(ctx, 'seduce.someone_caresses');
  else say(ctx, 'seduce.attracted', { mon: monNam(ctx, mon) });
  // (stop_donning(): wearing and taking off take effect at once here)
  const uwep = worn(ctx, 'weapon');
  const d: Sed = {
    mon: mon.id,
    fem,
    seewho,
    rings: inventoryOf(ctx.state, ctx.state.playerId)
      .filter((o) => o.def === ADORNMENT)
      .map((o) => o.id),
    ri: 0,
    sub: 0,
    // don't try to take off gloves if cursed weapon blocks them
    tried: uwep !== null && welded(ctx, uwep),
    ai: -1,
    q: null,
    obj: null,
  };
  run(ctx, d);
  return true;
}

/** Goes on until the next question or the end. */
function run(ctx: Ctx, d: Sed): void {
  const mon = monOf(ctx, d.mon);
  if (!mon) return;
  if (d.ai < 0) {
    const r = ringLoop(ctx, d, mon);
    if (r !== 'done') return; // 'ask' or 'gone' (she left its side: C's `return 1`)
    d.ai = 0;
    const naked = !['cloak', 'boots', 'gloves', 'shield', 'helm', 'shirt'].some((s) =>
      worn(ctx, s),
    );
    say(ctx, naked ? 'seduce.murmurs_naked' : 'seduce.murmurs_undress', { who: who(ctx, d, mon) });
  }
  while (d.ai < 7) {
    const step = d.ai++;
    const slot =
      step === 0
        ? 'cloak'
        : step === 1
          ? worn(ctx, 'cloak')
            ? null
            : 'body'
          : step === 2
            ? 'boots'
            : step === 3
              ? d.tried
                ? null
                : 'gloves'
              : step === 4
                ? 'shield'
                : step === 5
                  ? 'helm'
                  : worn(ctx, 'cloak') || worn(ctx, 'body')
                    ? null
                    : 'shirt';
    if (slot && mayberem(ctx, d, mon, slot)) return;
  }
  finish(ctx, d, mon);
}

/**
 * The rings of adornment: a succubus asks for each (taking off her gloves for a worn one), an
 * incubus puts them on her. 'ask' when a question is pending, 'gone' when a ring change sent her
 * away from it.
 */
function ringLoop(ctx: Ctx, d: Sed, mon: Entity): 'ask' | 'done' | 'gone' {
  for (; d.ri < d.rings.length; d.ri++, d.sub = 0) {
    const ring = carried(ctx, d.rings[d.ri] ?? -1);
    if (!ring?.c.item) continue;
    const isWorn = (): boolean => !!ring.c.item?.equipped;
    if (d.fem) {
      if (d.sub === 0) {
        d.sub = 1;
        // don't take off worn ring if gloves are in the way
        if (isWorn() && worn(ctx, 'gloves') && !d.tried) {
          d.tried = true;
          if (mayberem(ctx, d, mon, 'gloves')) return 'ask';
        }
      }
      if (d.sub === 1) {
        if (isWorn() && worn(ctx, 'gloves')) continue; // next ring might not be worn
        d.sub = 2;
        // confirmation prompt when charisma is high
        if (ctx.rng.rn2(20) < cha(ctx)) {
          const item = xnameOf(ctx.state, ctx.defs, ring); // named before makeknown()
          discover(ctx, ADORNMENT);
          return ask(ctx, d, 'ring', ring, 'seduce.may_i_have', { item });
        }
        say(ctx, 'seduce.decides_take', { who: who(ctx, d, mon), item: yname(ctx, ring) });
      }
      discover(ctx, ADORNMENT);
      // might be in left or right ring slot or weapon/alt-wep/quiver
      if (isWorn()) removeWornItem(ctx, ring);
      removeFromInventory(ctx, ring.id); // freeinv()
      mpickobj(ctx, mon.id, ring);
      continue;
    }
    if (d.sub === 0) {
      const ul = worn(ctx, 'ringL');
      const ur = worn(ctx, 'ringR');
      if (ul?.def === ADORNMENT && ur?.def === ADORNMENT) break;
      if (ring.id === ul?.id || ring.id === ur?.id) continue;
      d.sub = 1;
      // don't put on ring if gloves are in the way
      if (worn(ctx, 'gloves') && !d.tried) {
        d.tried = true;
        if (mayberem(ctx, d, mon, 'gloves')) return 'ask';
      }
    }
    if (d.sub === 1) {
      if (worn(ctx, 'gloves')) break; // no point trying further rings
      d.sub = 2;
      if (ctx.rng.rn2(20) < cha(ctx)) {
        const item = xnameOf(ctx.state, ctx.defs, ring); // named before makeknown()
        discover(ctx, ADORNMENT);
        return ask(ctx, d, 'ring', ring, 'seduce.wear_it', { item });
      }
      say(ctx, 'seduce.decides_wear', { who: who(ctx, d, mon), item: yname(ctx, ring) });
      say(ctx, 'seduce.puts_on_finger');
    }
    discover(ctx, ADORNMENT);
    const ul = worn(ctx, 'ringL');
    const ur = worn(ctx, 'ringR');
    const name = (): Msg => xnameOf(ctx.state, ctx.defs, ring);
    let slot: 'ringL' | 'ringR';
    if (!ur) {
      say(ctx, 'seduce.puts_on_right', { who: who(ctx, d, mon), item: name() });
      slot = 'ringR';
    } else if (!ul) {
      say(ctx, 'seduce.puts_on_left', { who: who(ctx, d, mon), item: name() });
      slot = 'ringL';
    } else {
      const old = ur.def !== ADORNMENT ? ur : ul;
      say(ctx, 'seduce.replaces', {
        who: who(ctx, d, mon),
        old: yname(ctx, old),
        item: yname(ctx, ring),
      });
      slot = old === ur ? 'ringR' : 'ringL';
      // ring removal might cause loss of levitation which could drop her onto a trap that
      // transports her somewhere else
      ringGone(ctx, old);
      if (!next2u(ctx, monOf(ctx, d.mon))) return 'gone';
    }
    if (ring.c.item) ring.c.item.equipped = slot; // setworn()
    updateWornProps(ctx.state, ctx.defs, ctx.state.playerId);
    ringOn(ctx, ring);
    prinv(ctx, ring);
  }
  return 'done';
}

/** Raises a yes/no question; the answer comes back through SEDUCE_ID. */
function ask(
  ctx: Ctx,
  d: Sed,
  q: 'ring' | 'rem',
  obj: Entity,
  key: string,
  params: Msg['params'] = {},
): 'ask' {
  d.q = q;
  d.obj = obj.id;
  ctx.ask(
    { id: 'seduce', kind: 'yn', key, params, cancellable: true },
    SEDUCE_ID,
    d as unknown as Json,
  );
  return 'ask';
}

const REASON: Readonly<Record<string, string>> = {
  body: 'seduce.why.closer',
  cloak: 'seduce.why.in_the_way',
  shield: 'seduce.why.in_the_way',
  boots: 'seduce.why.feet',
  gloves: 'seduce.why.clumsy',
  shirt: 'seduce.why.massage',
  helm: 'seduce.why.hair',
};

/**
 * It tries to remove a piece of her armor: asks "Shall I remove your cloak, lover?" when her
 * charisma is high (true: the question is pending), else "Take off your cloak; it's in the way."
 * and it comes off. ref: src/mhitu.c mayberem()
 */
function mayberem(ctx: Ctx, d: Sed, mon: Entity, slot: string): boolean {
  const obj = worn(ctx, slot);
  if (!obj) return false;
  // removal of a previous item might have sent the hero elsewhere
  if (!next2u(ctx, mon)) return false;
  const str = armorSimpleName(ctx.defs.object(obj.def));
  if (ctx.rng.rn2(20) < cha(ctx)) {
    const pet = !ctx.rng.rn2(2) ? 'lover' : !ctx.rng.rn2(2) ? 'dear' : 'sweetheart';
    ask(ctx, d, 'rem', obj, 'seduce.shall_i_remove', { item: str, pet: `@seduce.pet.${pet}` });
    return true;
  }
  say(ctx, 'seduce.take_off', { item: str, why: `@${REASON[slot] ?? 'seduce.why.in_the_way'}` });
  removeWornItem(ctx, obj);
  return false;
}

/** Her answer, then the seduction goes on. */
function answer(ctx: Ctx, value: Json, data: Json): number {
  const d = data as unknown as Sed;
  const obj = d.obj === null ? null : carried(ctx, d.obj);
  if (d.q === 'rem') {
    if (value === true && obj?.c.item?.equipped) removeWornItem(ctx, obj);
  } else if (d.q === 'ring' && value !== true) {
    d.ri++;
    d.sub = 0;
  }
  d.q = null;
  d.obj = null;
  run(ctx, d);
  return 0;
}

/** After the undressing: the regrets of one still in armor, or the night and its price. */
function finish(ctx: Ctx, d: Sed, mon: Entity): void {
  // removing armor might have moved her: no longer next to it
  if (!next2u(ctx, mon)) return;
  if (worn(ctx, 'body') || worn(ctx, 'cloak')) {
    say(ctx, 'seduce.wish', {
      what: heroFemale(ctx.state) ? '@seduce.sweet_lady' : '@seduce.nice_guy',
    });
    if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
    return;
  }
  if (uState(ctx.state).alignType < 0) adjalign(ctx, 1);
  // by this point you have discovered mon's identity, blind or not...
  say(ctx, 'seduce.time_stands_still', { mon: noitMonNam(ctx, mon) });
  const attrTot = cha(ctx) + (getPlayer(ctx.state).c.attributes?.int ?? 10);
  if (ctx.rng.rn2(35) > Math.min(attrTot, 32)) badNight(ctx, mon);
  else goodNight(ctx, mon);
  pay(ctx, mon);
  if (!ctx.rng.rn2(25)) setCancelled(ctx, mon.id); // monster is worn out
  const m = monOf(ctx, d.mon);
  if (m && !teleRestrict(ctx, m)) rlocMon(ctx, m, true);
}

/** "<mon> seems to have enjoyed it more than you..." ref: doseduce() */
function badNight(ctx: Ctx, mon: Entity): void {
  // don't bother with mspec_used here... it didn't get tired!
  say(ctx, 'seduce.it_enjoyed', { mon: noitMonNam(ctx, mon) });
  switch (ctx.rng.rn2(5)) {
    case 0: {
      say(ctx, 'seduce.drained');
      const pw = pwOf(ctx.state);
      setPw(ctx, { uen: 0, uenmax: Math.max(0, pw.uenmax - ctx.rng.rnd(10)) });
      break;
    }
    case 1:
      say(ctx, 'seduce.dumps');
      adjattrib(ctx, 'con', -1, true);
      break;
    case 2:
      say(ctx, 'seduce.dulled');
      adjattrib(ctx, 'wis', -1, true);
      break;
    case 3:
      if (!resistsDrliHero(ctx)) {
        say(ctx, 'seduce.out_of_shape');
        losexp(ctx, '@killer.overexertion');
      } else say(ctx, 'seduce.curious');
      break;
    default:
      say(ctx, 'seduce.exhausted');
      losehp(ctx, ctx.rng.rn2(10) + 6, '@killer.exhaustion'); // rn1(10, 6)
      break;
  }
}

/** "You seem to have enjoyed it more than <mon>..." ref: doseduce() */
function goodNight(ctx: Ctx, mon: Entity): void {
  setMspecUsed(ctx, mon.id, ctx.rng.rnd(100)); // monster is worn out
  say(ctx, 'seduce.you_enjoyed', { mon: noitMonNam(ctx, mon) });
  switch (ctx.rng.rn2(5)) {
    case 0: {
      say(ctx, 'seduce.full_potential');
      const pw = pwOf(ctx.state);
      const uenmax = pw.uenmax + ctx.rng.rnd(5);
      setPw(ctx, { uen: uenmax, uenmax, uenpeak: Math.max(pw.uenpeak, uenmax) });
      break;
    }
    case 1:
      say(ctx, 'seduce.again');
      adjattrib(ctx, 'con', 1, true);
      break;
    case 2:
      say(ctx, 'seduce.remember', { mon: noitMonNam(ctx, mon) });
      adjattrib(ctx, 'wis', 1, true);
      break;
    case 3:
      say(ctx, 'seduce.educational');
      pluslvl(ctx, ctx.state.playerId, false);
      break;
    default: {
      say(ctx, 'seduce.restored');
      const own = ownHp(ctx.state);
      if (own) own.cur = own.max; // u.uhp = u.uhpmax
      const hp = getPlayer(ctx.state).c.hp;
      if (upolyd(ctx.state) && hp) hp.cur = hp.max; // u.mh = u.mhmax
      break;
    }
  }
}

/** Its fee: none from a pet, refused at high charisma, else from her gold. ref: doseduce() */
function pay(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (!m || !monOf(ctx, mon.id)) return;
  if ((m.tame ?? 0) > 0) return; // don't charge
  if (ctx.rng.rn2(20) < cha(ctx)) {
    say(ctx, 'seduce.refuse', { mon: noitMonNam(ctx, mon), him: noitMhim(ctx, mon) });
    return;
  }
  if (heroFormId(ctx.state) === LEPRECHAUN) {
    say(ctx, 'seduce.leprechaun', { mon: noitMonNam(ctx, mon) });
    return;
  }
  const umoney = moneyCnt(ctx, ctx.state.playerId);
  let cost =
    umoney > LARGEST_INT - 10 ? ctx.rng.rnd(LARGEST_INT) + 500 : ctx.rng.rnd(umoney + 10) + 500;
  if (m.peaceful) cost = Math.max(1, Math.floor(cost / 5));
  if (cost > umoney) cost = umoney;
  if (!cost) {
    say(ctx, 'seduce.on_the_house');
    return;
  }
  say(ctx, cost === 1 ? 'seduce.takes_one' : 'seduce.takes', {
    mon: noitMonNam(ctx, mon),
    n: cost,
  });
  money2mon(ctx, mon.id, cost);
}

const seduceAction: ActionDef = {
  id: SEDUCE_ID,
  labelKey: 'seduce.label',
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer,
};

export function registerSeduce(api: ModApi): void {
  api.defineAction(seduceAction);
}
