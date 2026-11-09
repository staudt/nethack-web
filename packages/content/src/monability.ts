// The polymorphed hero's #monster command: her form's special ability. Offered on herself only
// while her form has one this port can do: a breath weapon (the winter wolf cub), spitting venom
// (the cobra), a gaze (the pyrolisk), a lycanthrope's call for help in beast form, a gremlin
// multiplying in a fountain and a shrieker's shriek.
// ref: src/cmd.c domonability(); src/polyself.c dobreathe(), dospit(), dogaze(), dosummon();
// src/zap.c ubreatheu(); src/were.c were_summon()
//
// Not ported (no offer, DEVIATIONS "Polymorph"): a nymph's removal of an iron ball (no ball and
// chain), hiding and spinning webs (dohide(), dospinweb()), mind blasts, unicorn horns, vampires
// and steeds; NetHack's "Any special ability you may have is purely reflexive." for the other
// forms (nothing is offered); spitting up or down; Medusa's gaze (no Medusa).
import {
  NORMAL_SPEED,
  getPlayer,
  sortedIds,
  type ActionDef,
  type AttackDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type MonsterDef,
  type Msg,
} from '@nh/core';
import { couldseeMon } from './apparxy';
import { BREATH_RAY } from './mthrowu';
import { buzzFrom, killedByHero, ubreatheu } from './buzz';
import { tamedog } from './dog';
import { DIRECTION_OPTIONS, spitVenom } from './dothrow';
import { destroyItems } from './erode';
import { dryup, heroOnFountain } from './fountain';
import { igniteItems } from './light';
import { heroInvisible, perceives, seeInvisible, monInvisible } from './invis';
import { aggravate, isCancelled, isMConfused, isMStunned, mcansee, setMConfused } from './mstate';
import { nomul } from './nomul';
import { askReallyAttack, setmangry, wakeup } from './peaceful';
import { monNam } from './perception';
import { splitU } from './passiveum';
import { P, hasProp, isStrangled } from './props';
import { helpless } from './shk';
import { canseemon, webmaker } from './trap';
import { pwOf, setPw } from './uenergy';
import { heroForm } from './upoly';
import { wereSummon } from './were';
import { isWere } from './werestate';
import { ZAP_DIRECTIONS, zapDirOf } from './zap';

export const MONSTER_ID: DefId = 'nh:monster';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** What #monster does for a form, in domonability()'s order. */
export type MonAbility = 'breathe' | 'spit' | 'gaze' | 'summon' | 'gremlin' | 'shriek';

const attackOf = (form: MonsterDef, at: AttackDef['at']): AttackDef | undefined =>
  form.attacks.find((a) => a.at === at);

/**
 * The ability #monster would use for `form`, or null when it has none this port can do.
 * ref: src/cmd.c domonability()
 */
export function monAbility(form: MonsterDef): MonAbility | null {
  if (attackOf(form, 'breath')) return 'breathe'; // can_breathe()
  if (attackOf(form, 'spit')) return 'spit';
  if (form.glyph.ch === 'n') return null; // S_NYMPH: doremove(), no iron ball here
  const gaze = attackOf(form, 'gaze');
  if (gaze) return gaze.ad === 'fire' || gaze.ad === 'conf' ? 'gaze' : null;
  if (isWere(form)) return 'summon';
  // hiders, webmakers and mind flayers (dohide(), dospinweb(), domindblast()) come next: none
  // is ported, so such a form has no offer
  if (
    form.flags.includes('hide') ||
    form.flags.includes('conceal') ||
    webmaker(form) ||
    form.id === 'nh:mind_flayer' ||
    form.id === 'nh:master_mind_flayer'
  )
    return null;
  if (form.id === 'nh:gremlin') return 'gremlin';
  if (form.sound === 'shriek') return 'shriek';
  return null;
}

// ---------------------------------------------------------------------------------------------
// breath

/**
 * #monster for a breathing form: 15 energy (spent even if the direction is then cancelled), then
 * a ray of the breath's type and dice, "blast of frost", or the blast at herself with `.`.
 * ref: src/polyself.c dobreathe()
 */
function dobreathe(ctx: Ctx): number {
  if (isStrangled(getPlayer(ctx.state))) {
    say(ctx, 'monability.cant_breathe');
    return 0;
  }
  const pw = pwOf(ctx.state);
  if (pw.uen < 15) {
    say(ctx, 'monability.breath_energy');
    return 0;
  }
  setPw(ctx, { uen: pw.uen - 15 });
  ctx.ask(
    {
      id: 'monster-direction',
      kind: 'direction',
      key: 'zap.direction',
      options: [...ZAP_DIRECTIONS],
    },
    MONSTER_ID,
    { ability: 'breathe' },
  );
  return 0;
}

function breatheAnswer(ctx: Ctx, value: Json): number {
  const dir = zapDirOf(ctx, value);
  if (dir === undefined) return 0; // ECMD_CANCEL: the energy is gone
  const form = heroForm(ctx);
  const atk = form ? attackOf(form, 'breath') : undefined;
  const ray = atk ? BREATH_RAY[atk.ad] : undefined;
  if (!atk || !ray) return NORMAL_SPEED; // impossible("bad breath attack?")
  if (dir === 'self') ubreatheu(ctx, ray, atk.n);
  else {
    const p = getPlayer(ctx.state).c.pos;
    if (p) buzzFrom(ctx, ray, atk.n, p, dir, { by: 'hero', breath: true, wakeup });
  }
  return NORMAL_SPEED;
}

// ---------------------------------------------------------------------------------------------
// spit

/** ref: src/polyself.c dospit(): blinding venom for AD_BLND and AD_DRST, else acid venom */
function spitAnswer(ctx: Ctx, value: Json): number {
  const dir = DIRECTION_OPTIONS.find((o) => o.value === value)?.value;
  if (typeof dir !== 'string') return 0; // ECMD_CANCEL
  const d = zapDirOf(ctx, dir);
  const form = heroForm(ctx);
  const atk = form ? attackOf(form, 'spit') : undefined;
  if (!atk || d === undefined || d === 'self' || d === 'up' || d === 'down') return NORMAL_SPEED;
  const otyp =
    atk.ad === 'blnd' || atk.ad === 'drst'
      ? 'nh:splash_of_blinding_venom'
      : 'nh:splash_of_acid_venom';
  spitVenom(ctx, otyp as DefId, d);
  return NORMAL_SPEED;
}

// ---------------------------------------------------------------------------------------------
// gaze

interface GazeData {
  ability: 'gaze';
  ad: 'fire' | 'conf';
  /** the peaceful monster whose "Really attack?" is being answered */
  at: number;
  looked: number;
}

/**
 * #monster for a gazing form: not blind or hallucinating, 15 energy, then every monster she sees
 * in her line of sight meets her gaze: a fiery one burns for 2d6 (none if it resists fire;
 * `level > rn2(20)` also burns its items), a confusing one confuses. Invisible to it, she is
 * not noticed; a pet is spared; a peaceful one is asked about ("Really attack the gnome?") and
 * angered; a sleeping, paralysed, stunned, blind or eyeless one is not affected. A living
 * floating eye looked at freezes her ("You are frozen by the floating eye's gaze!") unless she
 * has free action. ref: src/polyself.c dogaze()
 */
function dogaze(ctx: Ctx): number {
  const form = heroForm(ctx);
  const ad = form ? attackOf(form, 'gaze')?.ad : undefined;
  if (ad !== 'fire' && ad !== 'conf') return 0; // impossible("gaze attack %d?")
  const h = getPlayer(ctx.state);
  if (hasProp(h, P.BLINDED)) {
    say(ctx, 'monability.gaze_blind');
    return 0;
  }
  if (hasProp(h, P.HALLUC)) {
    say(ctx, 'monability.gaze_halluc');
    return 0;
  }
  const pw = pwOf(ctx.state);
  if (pw.uen < 15) {
    say(ctx, 'monability.gaze_energy');
    return 0;
  }
  setPw(ctx, { uen: pw.uen - 15 });
  return gazeFrom(ctx, ad, -1, 0, false);
}

/**
 * dogaze()'s loop over the monsters after id `after` (`confirmed`: the first of them, `after`
 * itself, was just confirmed). Returns the move's cost, or 0 while a question is up.
 */
function gazeFrom(
  ctx: Ctx,
  ad: 'fire' | 'conf',
  after: number,
  looked: number,
  confirmed: boolean,
): number {
  const h = getPlayer(ctx.state);
  const level = h.c.pos?.level;
  const confused = hasProp(h, P.CONFUSION);
  for (const id of sortedIds(ctx.state)) {
    if (id < after || (id === after && !confirmed)) continue;
    const mon = ctx.state.entities[String(id)];
    const m = mon?.c.monster;
    if (!mon || !m || mon.c.pos?.level !== level) continue;
    if (!(id === after && confirmed)) {
      if (!canseemon(ctx, mon) || !couldseeMon(ctx, mon)) continue;
      looked++;
      if (heroInvisible(ctx.state) && !perceives(ctx.defs.monster(mon.def))) {
        say(ctx, 'monability.gaze_not_noticed', { mon: monNam(ctx, mon) });
        continue;
      }
      if (monInvisible(ctx, mon) && !seeInvisible(ctx.state)) {
        say(ctx, 'monability.gaze_cant_see_where', { mon: monNam(ctx, mon) });
        continue;
      }
      if (m.tame && !confused) {
        // flags.safe_dog
        say(ctx, 'monability.avoid_gaze', { mon: monNam(ctx, mon) });
        continue;
      }
      if (m.peaceful && !confused) {
        // flags.confirm: "Really attack the gnome?"
        const data: GazeData = { ability: 'gaze', ad, at: id, looked };
        if (ad === 'conf')
          ctx.ask(
            {
              id: 'gaze-peaceful',
              kind: 'yn',
              key: 'monability.really_confuse',
              cancellable: true,
              params: { mon: monNam(ctx, mon) },
            },
            MONSTER_ID,
            data as unknown as Json,
          );
        else askReallyAttack(ctx, id, MONSTER_ID, data as unknown as Json);
        return 0;
      }
    }
    const r = gazeAt(ctx, mon, ad);
    if (r === 'not') looked--;
    else if (typeof r === 'number') return r;
    if (ctx.state.gameOver) return NORMAL_SPEED;
  }
  if (!looked) say(ctx, 'monability.gaze_nowhere');
  return NORMAL_SPEED;
}

/**
 * The gaze meets one monster: 'not' when it cannot be affected (not counted as looked at), a
 * move cost when a floating eye froze her (the loop stops), else null.
 */
function gazeAt(ctx: Ctx, mon: Entity, ad: 'fire' | 'conf'): 'not' | number | null {
  const m = mon.c.monster;
  if (!m) return null;
  setmangry(ctx, mon.id);
  const def = ctx.defs.monster(mon.def);
  if (
    helpless(ctx, mon.id) ||
    isMStunned(ctx, mon.id) ||
    !mcansee(ctx, mon.id) ||
    def.flags.includes('noeyes')
  )
    return 'not';
  // no reflection check, as when a monster gazes at her
  if (ad === 'conf') {
    if (!isMConfused(ctx, mon.id)) say(ctx, 'monability.gaze_confuses', { mon: monNam(ctx, mon) });
    else say(ctx, 'monability.more_confused', { mon: monNam(ctx, mon) });
    setMConfused(ctx, mon.id, true);
  } else {
    let dmg = ctx.rng.d(2, 6);
    const orig = dmg;
    const lev = getPlayer(ctx.state).c.experience?.level ?? 1;
    say(ctx, 'monability.fiery_gaze', { mon: monNam(ctx, mon) });
    if (def.resists.includes('fire')) {
      say(ctx, 'monability.fire_no_burn', { mon: monNam(ctx, mon) });
      dmg = 0;
    }
    if (lev > ctx.rng.rn2(20)) {
      dmg += destroyItems(ctx, mon.id, 'fire', orig);
      igniteItems(ctx, mon.id);
    }
    const hp = mon.c.hp;
    if (dmg && hp) hp.cur -= dmg;
    if (hp && hp.cur < 1) {
      killedByHero(ctx, mon);
      return null; // only a live monster answers the gaze
    }
  }
  if (mon.def === 'nh:floating_eye' && !isCancelled(ctx, mon.id)) {
    const h = getPlayer(ctx.state);
    if (!hasProp(h, P.FREE_ACTION)) {
      say(ctx, 'passive.frozen_gaze', { mon: monNam(ctx, mon) });
      const ulevel = h.c.experience?.level ?? 1;
      const turns =
        ulevel > 6 || ctx.rng.rn2(4) ? ctx.rng.d(m.level + 1, def.attacks[0]?.d ?? 70) : 200;
      return (
        NORMAL_SPEED + nomul(ctx, turns, 'helpless.frozen_gaze', { key: 'eat.can_move_again' })
      );
    }
    say(ctx, 'monability.stiffen_gaze', { mon: monNam(ctx, mon) });
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// were summon, gremlin, shriek

/**
 * #monster for a lycanthrope in beast form: 10 energy, "You call upon your brethren for help!" and
 * 1 to 5 of its animals come, tame ("But none arrive."). ref: src/polyself.c dosummon(),
 * src/were.c were_summon() with `yours`
 */
function dosummon(ctx: Ctx, form: MonsterDef): number {
  const pw = pwOf(ctx.state);
  if (pw.uen < 10) {
    say(ctx, 'monability.summon_energy');
    return 0;
  }
  setPw(ctx, { uen: pw.uen - 10 });
  say(ctx, 'monability.call_brethren');
  // (no exercise)
  const tame = (c: Ctx, id: EntityId): void => {
    tamedog(c, id, null, false, () => undefined);
  };
  if (wereSummon(ctx, form.id, tame).total === 0) say(ctx, 'monability.none_arrive');
  return NORMAL_SPEED;
}

/**
 * A gremlin form on a fountain splits in two (the fountain may dry up); elsewhere "There is no
 * fountain here.". No time passes, as in NetHack. ref: src/cmd.c domonability() PM_GREMLIN (no
 * pools exist)
 */
function gremlinSplit(ctx: Ctx, form: MonsterDef): number {
  const at = heroOnFountain(ctx);
  if (!at) {
    say(ctx, 'monability.no_fountain');
    return 0;
  }
  if (splitU(ctx, form, null)) dryup(ctx, at.x, at.y, true);
  return 0;
}

/** "You shriek." and the level wakes; no time passes. ref: domonability() MS_SHRIEK */
function shriek(ctx: Ctx): number {
  say(ctx, 'monability.shriek');
  aggravate(ctx);
  return 0;
}

// ---------------------------------------------------------------------------------------------
// the command

/** #monster: the form's ability. ref: src/cmd.c domonability() */
export function domonability(ctx: Ctx): number {
  const form = heroForm(ctx);
  const ab = form ? monAbility(form) : null;
  if (!form || !ab) return 0;
  switch (ab) {
    case 'breathe':
      return dobreathe(ctx);
    case 'spit':
      // getdir() before anything else
      ctx.ask(
        {
          id: 'monster-direction',
          kind: 'direction',
          key: 'zap.direction',
          options: DIRECTION_OPTIONS,
        },
        MONSTER_ID,
        { ability: 'spit' },
      );
      return 0;
    case 'gaze':
      return dogaze(ctx);
    case 'summon':
      return dosummon(ctx, form);
    case 'gremlin':
      return gremlinSplit(ctx, form);
    case 'shriek':
      return shriek(ctx);
  }
}

const isGazeData = (raw: Json): raw is Json & GazeData =>
  typeof raw === 'object' && raw !== null && !Array.isArray(raw) && raw['ability'] === 'gaze';

export const monsterAction: ActionDef = {
  id: MONSTER_ID,
  labelKey: 'action.nh:monster',
  handles: 'mod',
  offer: (ctx, target) => {
    if (target.kind !== 'self') return [];
    const form = heroForm(ctx);
    return form && monAbility(form)
      ? [{ action: { type: 'mod', action: MONSTER_ID }, labelKey: 'action.nh:monster' }]
      : [];
  },
  perform: (ctx) => domonability(ctx),
  answer(ctx, value, raw) {
    if (isGazeData(raw)) {
      // y_n() != 'y': skip this one, the gaze goes on
      return gazeFrom(ctx, raw.ad, raw.at, raw.looked, value === true);
    }
    const ability = (raw as { ability?: unknown } | null)?.ability;
    if (ability === 'breathe') return breatheAnswer(ctx, value);
    if (ability === 'spit') return spitAnswer(ctx, value);
    return 0;
  },
};
