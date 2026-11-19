// The crystal ball: applied (or invoked), it shows the objects, monsters, traps or furniture of a
// symbol the hero names, at the price of a few helpless turns; a charged one may overwhelm her
// instead (a cursed one always does). ref: src/detect.c use_crystal_ball(), furniture_detect(),
// level_distance(), level_detects[]; src/drawing.c def_char_to_objclass(),
// def_char_to_monclass(), def_char_is_furniture()
//
// Not ported (DEVIATIONS.md "Crystal balls"): the user-defined boulder symbol, mimics posing as
// furniture (furniture_detect()'s is_cmap_furniture() branch), browse_map() (the detected things
// stay in her memory as other detections leave them).
import {
  NORMAL_SPEED,
  getLevel,
  getPlayer,
  newMemory,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type Json,
  type Msg,
  type ObjectClass,
} from '@nh/core';
import { resistsBlnd } from './adtyping';
import { isQuestArtifact } from './artistate';
import { monsterDetect } from './detect';
import { objectDetect, trapDetect } from './detectobj';
import { polyGender } from './gender';
import { hcolor } from './hcolor';
import { losehp } from './hp';
import { useup } from './magic';
import { consumeObjCharge } from './music';
import { nomul } from './nomul';
import { discover } from './o_init';
import { xnameOf } from './objnam';
import {
  P,
  hasProp,
  makeBlinded,
  makeConfused,
  makeHallucinated,
  maybeHalfPhys,
  timeoutLeft,
} from './props';
import { isFurnitureId } from './terrain';

export const CRYSTAL_BALL: DefId = 'nh:crystal_ball';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The data of the "What do you look for?" question. */
export const isCrystalBallData = (data: Json): data is { cball: number } =>
  data !== null &&
  typeof data === 'object' &&
  !Array.isArray(data) &&
  typeof data['cball'] === 'number';

/** ref: include/defsym.h OBJCLASS() symbols (def_oc_syms[]) of the classes the port has */
const OBJ_CLASS_SYMS: Readonly<Record<string, ObjectClass>> = {
  ')': 'weapon',
  '[': 'armor',
  '=': 'ring',
  '"': 'amulet',
  '(': 'tool',
  '%': 'food',
  '!': 'potion',
  '?': 'scroll',
  '+': 'spellbook',
  '/': 'wand',
  $: 'coin',
  '*': 'gem',
  '`': 'rock',
  '.': 'venom',
};

/** ref: include/defsym.h the furniture block of defsyms[] (stairs .. fountain) */
const FURNITURE_SYMS = '<>_|\\{';

/** The four places a crystal ball may show. ref: src/detect.c level_detects[] */
const LEVEL_DETECTS: readonly { what: string; special: DefId }[] = [
  { what: 'delphi', special: 'nh:oracle' },
  { what: 'medusa', special: 'nh:medusa' },
  { what: 'castle', special: 'nh:castle' },
  { what: 'wizard', special: 'nh:wizard1' },
];

/** The dungeon and depth of the special level `special` in this game's layout, or null. */
function specialDepth(
  state: Readonly<GameState>,
  special: DefId,
): { dungeon: DefId; depth: number } | null {
  for (const d of state.dungeons) {
    const sp = d.special.find((s) => s.id === special);
    if (sp) return { dungeon: d.id, depth: d.depthStart + sp.dlevel - 1 };
  }
  return null;
}

/**
 * Where a place is, said from her depth: "far below", "away above you", "in the distance" (in
 * another dungeon), "near you"... ref: src/detect.c level_distance()
 */
function levelDistance(ctx: Ctx, where: { dungeon: DefId; depth: number } | null): string {
  const here = getLevel(ctx.state);
  const hereDepth =
    (ctx.state.dungeons.find((d) => d.id === here.dungeon)?.depthStart ?? 1) + here.dlevel - 1;
  const ll = hereDepth - (where?.depth ?? hereDepth);
  const indun = where !== null && where.dungeon === here.dungeon;
  if (ll < 0) {
    if (ll < -8 - ctx.rng.rn2(3)) return indun ? 'far_below' : 'far_away';
    if (ll < -1) return indun ? 'below' : 'away_below';
    return indun ? 'just_below' : 'distance';
  }
  if (ll > 0) {
    if (ll > 8 + ctx.rng.rn2(3)) return indun ? 'far_above' : 'far_away';
    if (ll > 1) return indun ? 'above' : 'away_above';
    return indun ? 'just_above' : 'distance';
  }
  return indun ? 'near' : 'distance';
}

/**
 * The furniture of the level (stairs, ladders, altars, graves, thrones, sinks, fountains) goes
 * into her memory: "There seems to be nothing of interest on this level." with none, "Your map
 * already shows all relevant locations." when she knew them all. ref: src/detect.c
 * furniture_detect()
 */
function furnitureDetect(ctx: Ctx): void {
  const level = getLevel(ctx.state);
  const memory = (ctx.state.memory[level.id] ??= newMemory(level));
  let found = 0;
  let revealed = 0;
  for (let y = 0; y < level.height; y++)
    for (let x = 1; x < level.width; x++) {
      const i = y * level.width + x;
      const t = level.cells[i] ?? 0;
      if (!isFurnitureId(ctx.defs, level.palette[t])) continue;
      found++;
      if (memory[i] !== t) {
        memory[i] = t; // magic_map_background(x, y, 1)
        revealed++;
      }
    }
  if (!found) say(ctx, 'cball.nothing_of_interest');
  else if (!revealed) say(ctx, 'cball.map_shows_all');
}

/** The "Tobjnam()" subject of a message: the crystal ball. */
const theBall = (ctx: Ctx, obj: Entity): Msg['params'] => ({
  item: xnameOf(ctx.state, ctx.defs, obj),
});

/**
 * A charged ball that overwhelms her (cursed, or `rnd(oops) > Int`: oops 8 for her quest
 * artifact, 16 blessed, else 20): "too much to comprehend", confusion, blindness (unless she
 * resists), hallucination for `rnd(100 - 3 * Int)` more turns, or (not an artifact or blessed
 * one) it explodes for `rnd(30)`; a charge is used. ref: src/detect.c use_crystal_ball()
 */
function overwhelmed(ctx: Ctx, obj: Entity, int: number): number {
  const it = obj.c.item;
  if (!it) return NORMAL_SPEED;
  const h = getPlayer(ctx.state);
  const impair = ctx.rng.rnd(100 - 3 * int);
  const n = ctx.rng.rnd(it.artifact !== undefined || it.buc === 'blessed' ? 4 : 5);
  const item = theBall(ctx, obj);
  let gone = false;
  switch (n) {
    case 1:
      say(ctx, 'cball.comprehend', item);
      break;
    case 2:
      say(ctx, 'cball.confuse', item);
      makeConfused(ctx, timeoutLeft(ctx.state, h, P.CONFUSION) + impair, false);
      break;
    case 3:
      if (!resistsBlnd(ctx, h)) {
        say(ctx, 'cball.damage_vision', item);
        makeBlinded(ctx, timeoutLeft(ctx.state, h, P.BLINDED) + impair, false);
        if (!hasProp(h, P.BLINDED)) say(ctx, 'blind.vision_clears');
      } else {
        say(ctx, 'cball.assault_vision', item);
        say(ctx, 'cball.unaffected');
      }
      break;
    case 4:
      say(ctx, 'cball.zap_mind', item);
      makeHallucinated(ctx, timeoutLeft(ctx.state, h, P.HALLUC) + impair, false);
      break;
    case 5:
      say(ctx, 'cball.explode', item);
      useup(ctx, obj.id);
      gone = true;
      // physical damage cause by the shards and force
      losehp(ctx, maybeHalfPhys(ctx.state, ctx.rng.rnd(30)), '@killer.crystal_ball');
      break;
  }
  if (!gone) consumeObjCharge(ctx, obj);
  return NORMAL_SPEED;
}

/** "You see goldfish swimming above fluorescent rocks." and the other Magic 8-Ball lines. */
function hallucinatedGaze(ctx: Ctx, obj: Entity, charged: boolean): number {
  const it = obj.c.item;
  if (!it) return NORMAL_SPEED;
  // gazing into a Magic 8-Ball (tm), with no message when it ends
  const extra = nomul(ctx, ctx.rng.rnd(charged ? 4 : 2), 'helpless.gazing_8ball', null);
  if (!charged) {
    say(ctx, 'cball.funky_haze', { color: hcolor(ctx, 'blue') });
    // destroy it when it has been cancelled
    if (it.spe < 0) {
      say(ctx, 'cball.implode', theBall(ctx, obj));
      useup(ctx, obj.id);
    }
    return NORMAL_SPEED + extra;
  }
  const n = ctx.rng.rnd(6);
  if (n === 2)
    say(ctx, 'cball.halluc.2', {
      who: polyGender(ctx.state) === 1 ? '@cball.babe' : '@cball.dude',
    });
  else if (n === 3) say(ctx, 'cball.halluc.3', { color: hcolor(ctx, 'blue') });
  else say(ctx, `cball.halluc.${n}`);
  consumeObjCharge(ctx, obj);
  return NORMAL_SPEED + extra;
}

/**
 * Applying or invoking a crystal ball: blind, "Too bad you can't see the crystal ball."; a
 * charged one may overwhelm her (see overwhelmed()); hallucinating she sees Magic 8-Ball
 * visions; else "You may look for an object, monster, or special map symbol." and the question
 * "What do you look for?" (one character), answered through `handler`. Returns the move's
 * energy, 0 while the question waits. ref: src/detect.c use_crystal_ball()
 */
export function useCrystalBall(ctx: Ctx, obj: Entity, handler: DefId): number {
  const it = obj.c.item;
  if (!it) return 0;
  const h = getPlayer(ctx.state);
  if (hasProp(h, P.BLINDED)) {
    say(ctx, 'cball.cant_see', theBall(ctx, obj));
    return NORMAL_SPEED;
  }
  const charged = it.spe > 0;
  const int = h.c.attributes?.int ?? 10; // ACURR(A_INT)
  const oops = isQuestArtifact(ctx.state, obj) ? 8 : it.buc === 'blessed' ? 16 : 20;
  if (charged && (it.buc === 'cursed' || ctx.rng.rnd(oops) > int))
    return overwhelmed(ctx, obj, int);
  if (hasProp(h, P.HALLUC)) return hallucinatedGaze(ctx, obj, charged);
  // read a single character
  say(ctx, 'cball.may_look');
  ctx.ask({ id: 'cball-what', kind: 'text', key: 'cball.what', maxLength: 1 }, handler, {
    cball: obj.id,
  });
  return 0;
}

/**
 * The symbol named: none (a quit character) is "Never mind."; else "You peer into the crystal
 * ball..." and she is helpless for `rnd(10)` turns (`rnd(2)` uncharged). An uncharged ball
 * shows nothing ("The vision is unclear."; a cancelled one implodes); a charged one is
 * identified, uses a charge and shows furniture (`<>_|\{`), an object class, a monster class
 * (`]` is the mimics' `m`), traps (`^`), else one of four famous places and how far it is.
 * When nothing was found: "The vision is unclear." (1 in 100 "You see the Wizard of Yendor
 * gazing out at you."). ref: src/detect.c use_crystal_ball()
 */
export function answerCrystalBall(ctx: Ctx, value: Json, data: Json): number {
  if (!isCrystalBallData(data)) return 0;
  const obj = ctx.state.entities[String(data.cball)];
  const it = obj?.c.item;
  if (!obj || !it || it.carriedBy !== ctx.state.playerId) return 0;
  let ch = typeof value === 'string' ? value.charAt(0) : '';
  // Don't filter out ' ' here; it has a use (the ghosts)
  if (ch !== ' ' && (ch === '' || '\r\n\x1b'.includes(ch))) {
    say(ctx, 'cball.never_mind');
    return NORMAL_SPEED;
  }
  say(ctx, 'cball.peer', theBall(ctx, obj));
  const charged = it.spe > 0;
  // gazing into a crystal ball, with no message when it ends
  const extra = nomul(ctx, ctx.rng.rnd(charged ? 10 : 2), 'helpless.gazing_ball', null);
  if (!charged) {
    say(ctx, 'cball.unclear');
    // destroy ball if used after being cancelled
    if (it.spe < 0) {
      say(ctx, 'cball.implode', theBall(ctx, obj));
      useup(ctx, obj.id);
    }
    return NORMAL_SPEED + extra;
  }
  discover(ctx, ctx.defs.object(CRYSTAL_BALL)); // makeknown(CRYSTAL_BALL)
  consumeObjCharge(ctx, obj);
  // special case: accept ']' as synonym for mimic
  if (ch === ']') ch = 'm';
  let nothing: boolean;
  const cls = OBJ_CLASS_SYMS[ch];
  const monClasses = new Set(ctx.defs.monsters.map((m) => m.glyph.ch));
  monClasses.add('~'); // S_WORM_TAIL
  if (FURNITURE_SYMS.includes(ch)) {
    // furniture before objects allows '_' to find altars instead of iron chains
    furnitureDetect(ctx);
    nothing = false;
  } else if (cls !== undefined) nothing = objectDetect(ctx, null, cls);
  else if (monClasses.has(ch)) nothing = monsterDetect(ctx, false, ch);
  else if (ch === '^') nothing = trapDetect(ctx, { buc: 'uncursed', cls: 'potion', item: null });
  else {
    const i = ctx.rng.rn2(LEVEL_DETECTS.length);
    const place = LEVEL_DETECTS[i] ?? LEVEL_DETECTS[0];
    if (place) {
      const where = levelDistance(ctx, specialDepth(ctx.state, place.special));
      say(ctx, 'cball.see_level', {
        what: `@cball.level.${place.what}`,
        where: `@cball.where.${where}`,
      });
    }
    nothing = false;
  }
  if (nothing) {
    // make them nervous
    if (!ctx.rng.rn2(100)) say(ctx, 'cball.wizard');
    else say(ctx, 'cball.unclear');
  }
  return NORMAL_SPEED + extra;
}
