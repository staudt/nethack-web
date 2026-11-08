// #chat: talking to a monster next to the hero. ref: src/sounds.c dotalk(), dochat(),
// domonnoise(); src/priest.c priest_talk() (in priest.ts); src/shk.c shk_chat(), price_quote()
// (in shk.ts)
//
// Not ported: polymorph (silent forms), engulfing, water, deafness, statues, mimics and hiders, steeds, the up/down directions, full moon and night (no
// clock), "remembered, unseen" markers, monster confusion and blindness, quest and Oracle talk,
// and every sound no monster here makes. A hallucinating hero gets no funny currency or wall
// lines beyond the wall table.
import {
  DIRS,
  DIR_LIST,
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  inBounds,
  type ActionDef,
  type Ctx,
  type Dir,
  type EntityId,
  type Json,
  type Offer,
  type PromptOption,
} from '@nh/core';
import { monsterIdAt } from './combat';
import { edogOf, meating } from './dog';
import { DIRECTION_OPTIONS } from './dothrow';
import { epriOf } from './epri';
import { eshkOf } from './eshk';
import { confdir, uMaybeImpaired } from './hackmove';
import { isFleeing } from './monflee';
import { moneyCnt } from './money';
import { aggravate, isFrozen, isMConfused, isMStunned } from './mstate';
import { wakeNearto } from './noise';
import { canSpotMon, monNam } from './perception';
import { priestDonate, priestTalk, type PriestOffer } from './priest';
import { P, heroHas, isStrangled } from './props';
import { priceQuote, shkChat, shopObject } from './shk';
import { T } from './terrain';
import { isMtrapped } from './trapstate';

export const CHAT_ID = 'nh:chat';

/** "Talk to whom? (in what direction)": the eight directions and yourself ('.'). */
const CHAT_DIRECTIONS: PromptOption[] = [
  ...DIRECTION_OPTIONS,
  { value: 'self', key: 'chat.dir.self' },
];

/** IS_WALL() or SDOOR: what "It's like talking to a wall." answers. */
const WALLS: ReadonlySet<string> = new Set([
  T.vwall,
  T.hwall,
  T.tlcorn,
  T.trcorn,
  T.blcorn,
  T.brcorn,
  T.tuwall,
  T.tdwall,
  T.tlwall,
  T.trwall,
  T.crwall,
  T.sdoor_v,
  T.sdoor_h,
  T.sdoor_locked_v,
  T.sdoor_locked_h,
]);

/** ref: dochat() walltalk[] */
const WALLTALK = [
  'chat.wall.gripes',
  'chat.wall.joke',
  'chat.wall.insults',
  'chat.wall.chuckles',
  'chat.wall.guffaws',
  'chat.wall.deprecates',
  'chat.wall.rehab',
  'chat.wall.not_interested',
];

const SOLDIER_FOE = ['chat.soldier.useless', 'chat.soldier.dog_meat', 'chat.soldier.surrender'];
const SOLDIER_PAX = ['chat.soldier.pay', 'chat.soldier.food', 'chat.soldier.feet'];

/** What chatting gives: energy spent, or the donation a priest asks for. */
type ChatResult = number | { priest: EntityId; offer: PriestOffer };

const say = (ctx: Ctx, key: string, params?: Record<string, string>): void =>
  ctx.emit(params ? { type: 'msg', key, params } : { type: 'msg', key });

/**
 * The monster's answer. Returns the energy: no time when it makes no sound.
 * ref: src/sounds.c domonnoise() for the sounds of this port's monsters
 */
export function domonnoise(ctx: Ctx, id: EntityId): ChatResult {
  const mon = ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m) return 0;
  const def = ctx.defs.monster(mon.def);
  let msound = def.sound ?? 'silent';
  if (msound === 'silent') return 0;
  const halluc = heroHas(ctx.state, P.HALLUC);
  const tame = m.tame ?? 0;
  // some normally non-speaking types can/will speak if hero is similar (no orcish heroes)
  if (msound === 'orc' && halluc) msound = 'humanoid';
  else if (msound === 'moo' && !tame) msound = 'bellow';
  else if (halluc && mon.def === 'nh:gecko') {
    // silliness: MS_SELL for a hallucinated gecko (only a real one here)
    say(ctx, 'chat.gecko');
    return NORMAL_SPEED;
  }
  const name = monNam(ctx, mon);
  const pline = (key: string): number => {
    say(ctx, key, { mon: name });
    return NORMAL_SPEED;
  };
  const turn = ctx.state.turn;
  const hungrytime = edogOf(ctx, id)?.hungrytime ?? turn;
  const upset = isMConfused(ctx, id) || isFleeing(ctx, id) || isMtrapped(ctx, id) || tame < 5;
  const hp = mon.c.hp;
  switch (msound) {
    case 'sell':
      // pitch, pay, total (a hallucinating hero may hear an insurance ad instead)
      if (!halluc || (eshkOf(ctx, id) !== null && !ctx.rng.rn2(2))) {
        shkChat(ctx, id);
        return NORMAL_SPEED;
      }
      say(ctx, 'chat.gecko');
      return NORMAL_SPEED;
    case 'priest': {
      const offer = priestTalk(ctx, id);
      return offer ? { priest: id, offer } : NORMAL_SPEED;
    }
    case 'bark':
      if (m.peaceful) {
        if (tame && (upset || turn > hungrytime)) return pline('chat.whines');
        if (tame && hungrytime > turn + 1000) return pline('chat.yips');
        return pline('chat.barks');
      }
      return pline('chat.growls_bark');
    case 'mew':
      if (tame) {
        if (upset) return pline('chat.yowls');
        if (turn > hungrytime) return pline('chat.meows');
        if (hungrytime > turn + 1000) return pline('chat.purrs');
        return pline('chat.mews');
      }
      return pline(m.peaceful ? 'chat.snarls' : 'chat.growls');
    case 'growl':
      return pline(m.peaceful ? 'chat.snarls' : 'chat.growls');
    case 'roar':
      return pline(m.peaceful ? 'chat.snarls' : 'chat.roars');
    case 'squeak':
      return pline('chat.squeaks');
    case 'sqawk':
      if (mon.def === 'nh:raven' && !m.peaceful) {
        say(ctx, 'chat.nevermore');
        return NORMAL_SPEED;
      }
      return pline('chat.squawks');
    case 'hiss':
      return m.peaceful ? 0 : pline('chat.hisses'); // a peaceful one makes no sound
    case 'buzz':
      return pline(m.peaceful ? 'chat.drones' : 'chat.buzzes');
    case 'grunt':
    case 'orc':
      return pline('chat.grunts');
    case 'neigh':
      if (tame < 5) return pline('chat.neighs');
      return pline(turn > hungrytime ? 'chat.whinnies' : 'chat.whickers');
    case 'moo':
      return pline('chat.moos');
    case 'bellow':
      return pline('chat.bellows');
    case 'chirp':
      return pline('chat.chirps');
    case 'groan':
      return ctx.rng.rn2(3) ? 0 : pline('chat.groans');
    case 'burble':
      return pline('chat.burbles');
    case 'trumpet': {
      const p = mon.c.pos;
      if (p) wakeNearto(ctx, p.x, p.y, 11 * 11);
      return pline('chat.trumpets');
    }
    case 'shriek':
      aggravate(ctx);
      return pline('chat.shrieks');
    case 'imitate':
      return pline('chat.imitates');
    // 'cuss' (imps, m10 step 4) needs wizard.c cuss(): no monster here makes it yet
    case 'djinni':
      // (no prisoner here; a tame djinni has no wishes left)
      if (tame) {
        say(ctx, 'chat.djinni.no_wishes');
        return NORMAL_SPEED;
      }
      if (m.peaceful) {
        if (mon.def === 'nh:water_demon') return pline('chat.gurgles');
        say(ctx, 'chat.djinni.free');
        return NORMAL_SPEED;
      }
      say(ctx, 'chat.djinni.teach');
      return NORMAL_SPEED;
    case 'seduce': {
      // nymphs never doseduce(); the hero is female (SYSOPT_SEDUCE on)
      const female = def.flags.includes('female') ? 1 : 0;
      const swval = female !== 1 ? ctx.rng.rn2(3) : 0;
      if (swval === 2) {
        say(ctx, 'chat.hello_sailor');
        return NORMAL_SPEED;
      }
      return pline(swval === 1 ? 'chat.comes_on' : 'chat.cajoles');
    }
    case 'laugh':
      return pline(
        ['chat.giggles', 'chat.chuckles', 'chat.snickers', 'chat.laughs'][ctx.rng.rn2(4)] ??
          'chat.laughs',
      );
    case 'oracle':
      // ref: src/rumors.c doconsult(): its refusals only, no time (ECMD_OK); the consultations
      // themselves are not ported, so with gold nothing happens (DEVIATIONS "The Oracle")
      if (!m.peaceful) say(ctx, 'chat.oracle.no_mood', { mon: name });
      else if (moneyCnt(ctx, ctx.state.playerId) === 0) say(ctx, 'chat.oracle.no_gold');
      return 0;
    case 'soldier': {
      const lines = m.peaceful ? SOLDIER_PAX : SOLDIER_FOE;
      say(ctx, lines[ctx.rng.rn2(3)] ?? 'chat.soldier.useless');
      return NORMAL_SPEED;
    }
    case 'humanoid': {
      if (!m.peaceful) return pline('chat.threatens');
      // generic peaceful humanoid behaviour
      const cur = hp?.cur ?? 1;
      const max = hp?.max ?? 1;
      if (isFleeing(ctx, id)) return pline('chat.nothing_to_do');
      if (cur < max / 4) return pline('chat.moans');
      if (isMConfused(ctx, id) || isMStunned(ctx, id)) {
        say(ctx, !ctx.rng.rn2(3) ? 'chat.huh' : ctx.rng.rn2(2) ? 'chat.what' : 'chat.eh');
        return NORMAL_SPEED;
      }
      if (isMtrapped(ctx, id)) {
        const p = mon.c.pos;
        const t = p ? getLevel(ctx.state).traps.find((tr) => tr.x === p.x && tr.y === p.y) : null;
        if (t) t.seen = true;
        say(ctx, 'chat.trapped');
        return NORMAL_SPEED;
      }
      if (cur < max / 2) return pline('chat.potion');
      if (tame && turn > hungrytime) {
        say(ctx, 'chat.hungry');
        return NORMAL_SPEED;
      }
      // specific monsters' interests
      if (def.flags.includes('elf')) return pline('chat.curses_orcs');
      if (def.flags.includes('dwarf')) return pline('chat.mining');
      if (def.flags.includes('magic')) return pline('chat.spellcraft');
      if (def.flags.includes('gnome')) {
        // (only reached hallucinating: gnomes are MS_ORC)
        const plan = halluc ? ctx.rng.rn2(4) : 0;
        say(
          ctx,
          plan % 2 ? (plan === 1 ? 'chat.gnome.phase1' : 'chat.gnome.phase3') : 'chat.gnome.few',
        );
        return NORMAL_SPEED;
      }
      if (mon.def === 'nh:hobbit')
        return pline(
          cur < max && (max <= 10 || cur <= max - 10)
            ? 'chat.hobbit.complains'
            : 'chat.hobbit.ring',
        );
      return pline('chat.exploration');
    }
  }
  return 0;
}

/**
 * Talks in direction `want` (after getdir()'s confusion). ref: src/sounds.c dochat() after
 * getdir()
 */
function chatDir(ctx: Ctx, want: Dir | 'self'): ChatResult {
  const d = uMaybeImpaired(ctx) ? confdir(ctx) : want; // getdir() -> confdir(FALSE)
  if (d === 'self') {
    say(ctx, 'chat.self');
    return 0;
  }
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return 0;
  const level = getLevel(ctx.state);
  const tx = hp.x + DIRS[d].x;
  const ty = hp.y + DIRS[d].y;
  if (!inBounds(level, tx, ty)) return 0;
  const id = monsterIdAt(ctx, { x: tx, y: ty }, level.id);
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  if (id === null || !mon?.c.monster) {
    const i = ty * level.width + tx;
    const here = level.palette[level.cells[i] ?? -1];
    if (here !== undefined && WALLS.has(here)) {
      // when blind, you can only talk to a wall if it has already been mapped as a wall
      const seen = level.palette[ctx.state.memory[level.id]?.[i] ?? -1];
      if (heroHas(ctx.state, P.BLINDED) && !(seen !== undefined && WALLS.has(seen))) return 0;
      if (!heroHas(ctx.state, P.HALLUC)) say(ctx, 'chat.wall');
      else say(ctx, WALLTALK[Math.min(ctx.rng.rn2(10), WALLTALK.length - 1)] ?? 'chat.wall');
    }
    return 0;
  }
  const m = mon.c.monster;
  // sleeping monsters won't talk, except priests (who wake up)
  if ((m.asleep || isFrozen(ctx, id)) && !epriOf(ctx, id)) {
    if (canSpotMon(ctx, mon)) say(ctx, 'chat.not_notice', { mon: monNam(ctx, mon) });
    return 0;
  }
  if ((m.tame ?? 0) > 0 && meating(ctx, id) > 0) {
    say(ctx, 'chat.eating', { mon: monNam(ctx, mon) });
    return 0;
  }
  return domonnoise(ctx, id);
}

const dirArg = (raw: unknown): Dir | 'self' | null =>
  raw === 'self' ? 'self' : (DIR_LIST.find((d) => d === raw) ?? null);

/** Asks for the donation a priest wants, or returns the energy spent. */
function finish(ctx: Ctx, r: ChatResult): number {
  if (typeof r === 'number') return r;
  ctx.ask(
    {
      id: 'priest-offer',
      kind: 'text',
      key: 'priest.offer_prompt',
      params: { a: r.offer.suggested * r.offer.quan, b: r.offer.suggested * r.offer.quan * 2 },
      maxLength: 15,
      numeric: true,
    },
    CHAT_ID,
    { step: 'offer', priest: r.priest, ...r.offer },
  );
  return 0;
}

// ref: src/sounds.c dotalk() / dochat(), the #chat command (M-c)
const chat: ActionDef = {
  id: CHAT_ID,
  labelKey: 'action.nh:chat',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind === 'self')
      return [{ action: { type: 'mod', action: CHAT_ID }, labelKey: 'action.nh:chat' }];
    if (target.kind !== 'cell') return [];
    const pos = getPlayer(ctx.state).c.pos;
    if (!pos) return [];
    const dx = target.pos.x - pos.x;
    const dy = target.pos.y - pos.y;
    const dir = DIR_LIST.find((k) => DIRS[k].x === dx && DIRS[k].y === dy);
    if (!dir) return [];
    const seen = ctx.query.describe(target.pos).entities.find((e) => ctx.defs.isMonster(e.def));
    if (!seen) return [];
    return [
      {
        action: { type: 'mod', action: CHAT_ID, args: { dir } },
        labelKey: 'action.nh:chat_with',
        params: { target: `@${seen.def}` },
      },
    ];
  },
  perform(ctx, action) {
    if (isStrangled(getPlayer(ctx.state))) {
      say(ctx, 'chat.choking');
      return 0;
    }
    // standing on something in a shop and chatting causes the shopkeeper to describe the
    // price(s)
    const hp = getPlayer(ctx.state).c.pos;
    const otmp = hp && !heroHas(ctx.state, P.BLINDED) ? shopObject(ctx, hp.x, hp.y) : null;
    if (otmp) {
      priceQuote(ctx, otmp);
      return NORMAL_SPEED;
    }
    const dir = action.type === 'mod' ? dirArg((action.args as { dir?: unknown })?.dir) : null;
    if (dir) return finish(ctx, chatDir(ctx, dir));
    ctx.ask(
      { id: 'chat-direction', kind: 'direction', key: 'chat.direction', options: CHAT_DIRECTIONS },
      CHAT_ID,
      { step: 'dir' },
    );
    return 0;
  },
  answer(ctx, value: Json, raw: Json) {
    const data = raw as { step?: unknown; priest?: unknown; suggested?: unknown; quan?: unknown };
    if (data?.step === 'offer') {
      if (typeof data.priest !== 'number') return 0;
      priestDonate(ctx, data.priest, value, {
        suggested: Number(data.suggested),
        quan: Number(data.quan),
      });
      return NORMAL_SPEED;
    }
    const dir = dirArg(value);
    if (!dir) return 0; // decided not to chat (ECMD_CANCEL)
    return finish(ctx, chatDir(ctx, dir));
  },
};

export const CHAT_ACTIONS: readonly ActionDef[] = [chat];
