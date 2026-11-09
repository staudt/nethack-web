// Sitting on a throne: the thirteen effects, and the throne vanishing in a puff of logic.
// ref: src/sit.c throne_sit_effect(), take_gold(); src/read.c do_genocide() (ONTHRONE)
//
// The wish and the genocide ask their questions through the Sit action (`answerThrone()`), and
// the 1-in-3 vanishing roll comes after the answer, in C's order. The identify menu (insight) and
// the teleport position prompt (a controlled wrenching sensation) answer through their own
// actions, so the vanishing roll comes before them; the move is spent with their answer.
// Not ported (DEVIATIONS "Thrones"): Vlad's tower's special throne (special_throne_effect()),
// wizard mode's "Throne sit effect (1..13)" and "Analyze throne?" questions (content has no
// wizard flag: the random path always), exercise(), cream on the face (u.ucreamed), the
// voice's SetVoice(), and the Hand of Elbereth (no crowning).
import {
  NORMAL_SPEED,
  cellIndex,
  cellRules,
  computeVisible,
  getPlayer,
  inventoryOf,
  type Ctx,
  type DefId,
  type Json,
  type LevelId,
} from '@nh/core';
import { adjattrib, type Attr } from './attrstate';
import { showMapSpot } from './detect';
import { doMapping } from './detectobj';
import { heroFemale } from './gender';
import { makemon } from './generation';
import { ONTHRONE, REALLY, answerGenocide, doGenocide, isGenoAsk } from './genocide';
import { losehp } from './hp';
import { makeSick } from './hunger';
import { removeFromInventory } from './items';
import { changeLuck, luckOf, uState } from './luck';
import { NOMMAP_LEVELS } from './minesend';
import { aggravate } from './mstate';
import {
  P,
  hasIntrinsic,
  hasProp,
  makeBlinded,
  makeConfused,
  setIntrinsic,
  setItimeout,
  timeoutLeft,
} from './props';
import { identifyPack } from './read';
import { courtmon } from './roommon';
import { rndcurse } from './sit';
import { T, setTerrain, terrainIdAt } from './terrain';
import { setThroneLooted } from './thronestate';
import { tele } from './trap';
import { heroForm, ownHp, upolyOf } from './upoly';
import { answerWish, askWish, type WishData } from './wish';

/** The attributes in C's A_STR..A_CHA order (rn2(A_MAX) picks among them). */
const ATTRS: readonly Attr[] = ['str', 'int', 'wis', 'dex', 'con', 'cha'];

/** The throne a wish or genocide prompt was raised on, for the vanishing roll after it. */
interface ThroneAt {
  level: LevelId;
  x: number;
  y: number;
}

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/** "Sire" or "Dame". */
const sire = (ctx: Ctx): string => (heroFemale(ctx.state) ? 'dame' : 'sire');

/** Take away the hero's money. ref: src/sit.c take_gold() */
export function takeGold(ctx: Ctx): void {
  let lostMoney = false;
  for (const o of inventoryOf(ctx.state, ctx.state.playerId)) {
    if (ctx.defs.object(o.def).class !== 'coin') continue;
    lostMoney = true;
    removeFromInventory(ctx, o.id);
    ctx.remove(o.id); // delobj()
  }
  say(ctx, lostMoney ? 'throne.no_gold' : 'throne.strange_sensation');
}

/**
 * "You feel much, much better!": hit points to the maximum, raised by 4 when they were within 5
 * of it (her form's and her own), blindness, sickness and wounded legs cured.
 * ref: src/sit.c throne_sit_effect() case 4
 */
function muchBetter(ctx: Ctx): void {
  say(ctx, 'throne.much_better');
  const h = getPlayer(ctx.state);
  const raise = (hp: { cur: number; max: number }): void => {
    if (hp.cur >= hp.max - 5) hp.max += 4;
    hp.cur = hp.max;
  };
  if (upolyOf(ctx.state) && h.c.hp) raise(h.c.hp); // u.mh, u.mhmax
  const own = ownHp(ctx.state);
  if (own) raise(own); // u.uhp, u.uhpmax (no u.uhppeak is kept)
  makeBlinded(ctx, 0, true);
  makeSick(ctx, 0, '', false);
  // heal_legs(0)
  if (hasProp(h, P.WOUNDED_LEGS)) {
    setItimeout(ctx.state, h, P.WOUNDED_LEGS, 0);
    say(ctx, 'timeout.legs_better');
  }
}

/** Whether magic mapping is refused on the hero's level. ref: level.flags.nommap */
function nommap(ctx: Ctx): boolean {
  const def = ctx.state.levels[ctx.state.currentLevel]?.def;
  return def !== undefined && NOMMAP_LEVELS.has(def);
}

/**
 * One throne effect (1..13) for the hero sitting on the throne at `at`. The wish and the
 * genocide leave their prompt pending for `action`. ref: src/sit.c throne_sit_effect() switch
 */
export function throneEffect(ctx: Ctx, action: DefId, effect: number, at: ThroneAt): void {
  const h = getPlayer(ctx.state);
  const level = ctx.state.levels[at.level];
  switch (effect) {
    case 1: {
      const which = ATTRS[ctx.rng.rn2(ATTRS.length)] ?? 'str';
      adjattrib(ctx, which, -(ctx.rng.rn2(4) + 3), 'always'); // -rn1(4, 3)
      losehp(ctx, ctx.rng.rnd(10), '@killer.cursed_throne');
      break;
    }
    case 2:
      adjattrib(ctx, ATTRS[ctx.rng.rn2(ATTRS.length)] ?? 'str', 1, 'always');
      break;
    case 3: {
      const res = hasProp(h, P.SHOCK_RES);
      say(ctx, res ? 'throne.shock_resisted' : 'throne.shock');
      losehp(ctx, res ? ctx.rng.rnd(6) : ctx.rng.rnd(30), '@killer.electric_chair');
      break;
    }
    case 4:
      muchBetter(ctx);
      break;
    case 5:
      takeGold(ctx);
      break;
    case 6:
      if (uState(ctx.state).luck + ctx.rng.rn2(5) < 0) {
        say(ctx, 'throne.luck_changing');
        changeLuck(ctx, 1);
      } else {
        const data: WishData & { throne: ThroneAt } = { tries: 0, wizard: false, throne: at };
        askWish(ctx, action, data);
      }
      break;
    case 7: {
      let cnt = ctx.rng.rnd(10);
      // Magical voice not affected by deafness
      say(ctx, 'throne.voice');
      say(ctx, `throne.audience.${sire(ctx)}`);
      const depth = level?.depth ?? 1;
      while (cnt--) makemon(ctx, courtmon(ctx, depth), { x: at.x, y: at.y }, { adjacentOk: true });
      break;
    }
    case 8:
      say(ctx, 'throne.voice');
      say(ctx, `throne.imperious.${sire(ctx)}`);
      doGenocide(ctx, REALLY | ONTHRONE, action, { throne: at as unknown as Json });
      break;
    case 9: {
      say(ctx, 'throne.voice');
      say(ctx, 'throne.curse');
      const luck = luckOf(ctx.state);
      if (luck > 0) {
        const blinded = timeoutLeft(ctx.state, h, P.BLINDED);
        makeBlinded(ctx, blinded + ctx.rng.rn2(100) + 250, true); // rn1(100, 250)
        changeLuck(ctx, luck > 1 ? -ctx.rng.rnd(2) : -1);
      } else rndcurse(ctx);
      break;
    }
    case 10:
      if (luckOf(ctx.state) < 0 || hasIntrinsic(h, P.SEE_INVIS)) {
        if (nommap(ctx)) {
          say(ctx, 'throne.drone');
          makeConfused(ctx, timeoutLeft(ctx.state, h, P.CONFUSION) + ctx.rng.rnd(30), false);
        } else {
          say(ctx, 'throne.image');
          doMapping(ctx, hasProp(h, P.CONFUSION));
        }
      } else {
        // avoid "vision clears" if hero can't see
        if (!hasProp(h, P.BLINDED)) say(ctx, 'throne.vision_clear');
        else {
          const form = heroForm(ctx);
          // eyecount(): two eyes, or none (a floating eye or a Cyclops cannot sit here)
          say(ctx, form?.flags.includes('noeyes') ? 'throne.head_strange' : 'throne.eyes_tingle');
        }
        setIntrinsic(h, P.SEE_INVIS, true);
      }
      break;
    case 11:
      if (luckOf(ctx.state) < 0) {
        say(ctx, 'throne.threatened');
        aggravate(ctx);
      } else {
        say(ctx, 'throne.wrenching');
        tele(ctx, { cost: NORMAL_SPEED }); // teleport him
      }
      break;
    case 12:
      say(ctx, 'throne.insight');
      // rn2(5) agrees w/seffects()
      if (inventoryOf(ctx.state, ctx.state.playerId).length > 0)
        identifyPack(ctx, ctx.rng.rn2(5), false);
      break;
    case 13:
      say(ctx, 'throne.pretzel');
      makeConfused(ctx, timeoutLeft(ctx.state, h, P.CONFUSION) + ctx.rng.rn2(7) + 16, false);
      break;
    default:
      break;
  }
}

/**
 * The 1-in-3 chance that the throne at `at` vanishes ("The throne vanishes in a puff of logic.",
 * "has vanished" where she cannot see it, as when she was teleported away); it becomes floor in
 * her memory too. ref: src/sit.c throne_sit_effect() end (map_background(), newsym_force())
 */
function throneMaybeVanishes(ctx: Ctx, at: ThroneAt): void {
  if (ctx.rng.rn2(3)) return;
  const level = ctx.state.levels[at.level];
  if (!level || terrainIdAt(level, at.x, at.y) !== T.throne) return;
  setTerrain(level, at.x, at.y, T.floor);
  setThroneLooted(ctx, level.id, at.x, at.y, false); // levl[tx][ty].flags = 0
  showMapSpot(ctx, level, at.x, at.y, false);
  // "[God] promptly vanishes in a puff of logic" is from Douglas Adams' _The_Hitchhiker's
  // Guide_to_the_Galaxy_.
  // cansee(tx, ty), from where she is now (a teleport may have moved her)
  const h = getPlayer(ctx.state);
  const hp = h.c.pos;
  const cansee =
    !!hp &&
    hp.level === level.id &&
    !hasProp(h, P.BLINDED) &&
    ((hp.x === at.x && hp.y === at.y) ||
      computeVisible(level, cellRules(level, ctx.defs), hp).includes(cellIndex(level, at.x, at.y)));
  say(ctx, cansee ? 'throne.vanishes' : 'throne.has_vanished');
}

/** The move's time once an effect is over: 0 while a prompt is waiting (its answer spends it). */
const spent = (ctx: Ctx): number => (ctx.state.pendingPrompt ? 0 : NORMAL_SPEED);

/**
 * The hero sits on the throne under her: 1 time in 3 one of the thirteen effects (`rnd(13)`),
 * else "You feel very comfortable here." (a prince's form) or "You feel somehow out of
 * place..."; then 1 time in 3 the throne vanishes, even when she was teleported off it. A wish or
 * genocide prompt is answered through `action` ({@link answerThrone}). Returns the time taken.
 * ref: src/sit.c throne_sit_effect()
 */
export function throneSitEffect(ctx: Ctx, action: DefId): number {
  const p = getPlayer(ctx.state).c.pos;
  if (!p) return 0;
  const at: ThroneAt = { level: p.level, x: p.x, y: p.y };
  // [why so convoluted? it's the same as '!rn2(3)']
  if (ctx.rng.rnd(6) > 4) {
    const effect = ctx.rng.rnd(13);
    throneEffect(ctx, action, effect, at);
    if (ctx.state.gameOver) return NORMAL_SPEED;
    // the wish and the genocide roll for the throne once answered
    if (ctx.state.pendingPrompt?.handler === action) return 0;
  } else {
    const form = heroForm(ctx);
    say(ctx, form?.flags.includes('prince') ? 'throne.comfortable' : 'throne.out_of_place');
  }
  throneMaybeVanishes(ctx, at);
  return spent(ctx);
}

/**
 * The answer to a throne's wish or genocide prompt (asked again until it is settled), then the
 * vanishing roll. Returns the time taken: 0 while it asks again.
 */
export function answerThrone(ctx: Ctx, action: DefId, value: Json, raw: Json): number {
  const at = (raw as { throne?: ThroneAt } | null)?.throne;
  if (isGenoAsk(raw)) {
    if (answerGenocide(ctx, value, raw)) return 0;
  } else {
    answerWish(ctx, action, value, raw as unknown as WishData);
    if (ctx.state.pendingPrompt) return 0;
  }
  if (!ctx.state.gameOver && at) throneMaybeVanishes(ctx, at);
  return NORMAL_SPEED;
}
