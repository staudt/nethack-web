// "Demonic Blackmail!": a peaceful demon prince that has a price (Asmodeus, Baalzebub: MS_BRIBE)
// comes out of invisibility next to the hero and asks for gold for safe passage, from her own
// gold: enough and he vanishes, a little less and her charisma may still do it, else he gets
// angry. A hero in a demon form is wished good hunting instead. The demand is a text prompt
// (`demon-bribe`), answered through DEMON_BRIBE_ID. Called from dochug() (when he comes near) and
// from #chat. ref: src/minion.c demon_talk(), bribe(); src/monmove.c dochug() "Demonic
// Blackmail!"; src/sounds.c domonnoise() MS_BRIBE
//
// A wielded Excalibur or Demonbane makes him angry instead ("Asmodeus looks very angry.").
// Not ported (see DEVIATIONS.md "Monster AI"): Deafness,
// a demon that carries the Amulet, the livelog. A demon angered by the answer attacks on its next
// move: the prompt ends the move it was asked in (C goes on with that move).
import {
  getLevel,
  getPlayer,
  type ActionDef,
  type Ctx,
  type EntityId,
  type Json,
  type ModApi,
} from '@nh/core';
import { uWieldArt } from './artistate';
import { heroFemale } from './gender';
import { isHelpless } from './hunger';
import { clearMinvis, monInvisible } from './invis';
import { inHell } from './levelflags';
import { uState } from './luck';
import { isDemon, isDprince } from './mondata';
import { mongone } from './mondeath';
import { bribe, moneyCnt } from './money';
import { clearStrat } from './mstate';
import { unmulNow } from './nomul';
import { canSpotMon, monNam } from './perception';
import { teleRestrict } from './teleport';
import { rlocMon } from './trap';
import { heroForm } from './upoly';

export const DEMON_BRIBE_ID = 'nh:demon-bribe';

interface BribeData {
  mon: EntityId;
  demand: number;
}

const say = (ctx: Ctx, key: string, params?: Record<string, string | number>): void =>
  ctx.emit(params ? { type: 'msg', key, params } : { type: 'msg', key });

/**
 * The demon (peaceful, not tame) talks to the hero: against a wielded Excalibur or Demonbane he
 * "looks very angry." (unseen: "You feel tension building.") and is hostile; an invisible prince
 * "appears before you";
 * a hero in a demon form is wished "Good hunting" and he teleports away; with gold, and able to
 * move, she is asked to pay `demand` (her gold times 1..80% plus 20% in Gehennom, halved when
 * they share an alignment's sign) through the `demon-bribe` prompt; else he gets angry. True when
 * he will not attack (gone, or waiting for her answer). ref: src/minion.c demon_talk()
 */
export function demonTalk(ctx: Ctx, id: EntityId): boolean {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m) return false;
  if (uWieldArt(ctx.state, 'nh:excalibur') || uWieldArt(ctx.state, 'nh:demonbane')) {
    if (canSpotMon(ctx, mon)) say(ctx, 'demon.looks_very_angry', { mon: monNam(ctx, mon) });
    else say(ctx, 'demon.tension_building');
    m.peaceful = false;
    delete m.tame;
    return false;
  }
  if (getPlayer(ctx.state).c.helpless?.reasonKey === 'helpless.fainted') {
    unmulNow(ctx); // if fainted - wake up
  } else ctx.interrupt(); // stop_occupation(); nomul(0)
  const def = ctx.defs.monster(mon.def);
  // Slight advantage given.
  if (isDprince(def) && monInvisible(ctx, mon)) {
    const wasunseen = !canSpotMon(ctx, mon);
    clearMinvis(ctx, mon);
    if (wasunseen && canSpotMon(ctx, mon)) {
      say(ctx, 'demon.appears_before_you', { mon: monNam(ctx, mon) });
      clearStrat(ctx, id, 'appearMsg');
    }
  }
  const form = heroForm(ctx);
  if (form && form.glyph.ch === '&') {
    // Won't blackmail their own.
    say(ctx, heroFemale(ctx.state) ? 'demon.good_hunting_sister' : 'demon.good_hunting_brother', {
      mon: monNam(ctx, mon),
    });
    if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
    return true;
  }
  const cash = moneyCnt(ctx, ctx.state.playerId);
  const level = mon.c.pos ? getLevel(ctx.state, mon.c.pos.level) : getLevel(ctx.state);
  const athome = inHell(ctx.state, level) ? 1 : 0; // (no shapechangers)
  const same = Math.sign(uState(ctx.state).alignType) === Math.sign(def.alignment) ? 1 : 0;
  const demand = Math.trunc((cash * (ctx.rng.rnd(80) + 20 * athome)) / (100 * (1 + same)));
  if (!demand || isHelpless(ctx)) {
    // you have no gold or can't move
    m.peaceful = false;
    return false;
  }
  say(ctx, demand === 1 ? 'demon.demands_one' : 'demon.demands', {
    mon: monNam(ctx, mon),
    n: demand,
  });
  ctx.ask(
    { id: 'demon-bribe', kind: 'text', key: 'demon.offer_prompt', maxLength: 15, numeric: true },
    DEMON_BRIBE_ID,
    { mon: id, demand } satisfies BribeData as unknown as Json,
  );
  return true;
}

/**
 * Her offer: the demand or more and he "vanishes, laughing about cowardly mortals."; less, but
 * within `rnd(5 * Cha)` of it, and he "scowls at you menacingly, then vanishes."; else "gets
 * angry...". A demon that vanishes leaves the game with the gold. ref: src/minion.c demon_talk()
 * after bribe()
 */
export function answerBribe(ctx: Ctx, value: Json, raw: Json): number {
  const d = raw as unknown as BribeData;
  const mon = ctx.state.entities[String(d.mon)];
  const m = mon?.c.monster;
  if (!mon || !m) return 0;
  const offer = bribe(ctx, d.mon, value);
  const name = monNam(ctx, mon);
  const cha = getPlayer(ctx.state).c.attributes?.cha ?? 10; // ACURR(A_CHA)
  if (offer >= d.demand) say(ctx, 'demon.vanishes_laughing', { mon: name });
  else if (offer > 0 && ctx.rng.rnd(5 * cha) > d.demand - offer)
    say(ctx, 'demon.scowls', { mon: name });
  else {
    say(ctx, 'demon.gets_angry', { mon: name });
    m.peaceful = false;
    return 0;
  }
  mongone(ctx, d.mon);
  return 0;
}

/**
 * dochug()'s "Demonic Blackmail!": a peaceful, untamed MS_BRIBE demon near the hero (who is not
 * swallowed) that guessed her square wrong "whispers at thin air." and then teleports away from
 * a hero in a demon form or turns visible and angry; one that found her talks (demonTalk()).
 * True when its move is over. ref: src/monmove.c dochug()
 */
export function demonicBlackmail(
  ctx: Ctx,
  id: EntityId,
  ap: { x: number; y: number },
  apSeen: boolean,
): boolean {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  const hp = getPlayer(ctx.state).c.pos;
  if (!mon || !m || !hp) return false;
  if (ap.x !== hp.x || ap.y !== hp.y) {
    say(ctx, 'demon.whispers', { mon: apSeen ? monNam(ctx, mon) : '@pronoun.it' });
    const form = heroForm(ctx);
    if (form && isDemon(form)) {
      // "Good hunting, brother"
      if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
    } else {
      // Why?  For the same reason in real demon talk
      clearMinvis(ctx, mon);
      say(ctx, 'demon.gets_angry_now', { mon: monNam(ctx, mon) });
      m.peaceful = false;
      // since no way is an image going to pay it off
    }
    return false;
  }
  return demonTalk(ctx, id); // you paid it off (or are asked to)
}

const demonBribeAction: ActionDef = {
  id: DEMON_BRIBE_ID,
  labelKey: 'demon.offer_prompt',
  handles: 'mod',
  offer: () => [],
  perform: () => 0,
  answer: answerBribe,
};

export function registerDemonTalk(api: ModApi): void {
  api.defineAction(demonBribeAction);
}
