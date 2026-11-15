// Engravings: the `:` look command and the `E` engrave command (wands come with m16 step 3).
// ref: src/engrave.c doengrave(), doengrave_sfx_item(), doengrave_ctx_verb(), engrave(),
// stylus_ok(), u_can_engrave(); src/invent.c dolook()
//
// The state is engr.ts (a leaf) and reading it engrread.ts (a leaf for itemactions.ts); this
// module holds the commands and may import game modules, so nothing below it imports it.
//
// doengrave() is a small state machine over prompts: the stylus menu (C's getobj()), "Do you
// want to add to the current engraving?" (yn), the text (getlin()), then the `engrave()`
// occupation, whose data is C's `context.engraving`. The setup takes no time; the first
// engraving action runs with the text answer (C runs it as the occupation's first call).
// Not ported: magic markers and towels (no such objects), Fire Brand (no artifacts), graves and
// headstones (m16 step 7), the literate conduct (no conducts), body_part() (always "fingertip"
// and "hand"). Wands are engraved with as any other object until step 3 ports their effects.
import {
  NORMAL_SPEED,
  getPlayer,
  inventoryOf,
  type ActionDef,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Json,
  type Level,
  type Msg,
  type Offer,
  type PromptOption,
} from '@nh/core';
import { altarWrath } from './align';
import { uwepOf } from './combat';
import { monsterNearby } from './eat';
import { delEngrAt, engrAt, makeEngrAt, type EngrType } from './engr';
import { engulferOf, isWhirly } from './engulfstate';
import { HARD_GEMS, TOUGH_RINGS } from './gem';
import { dolook, invOption, prinv, welded } from './itemactions';
import { splitStack } from './items';
import { isIce, isLava, isPool } from './liquid';
import { checkCapacity } from './magic';
import { cantwield } from './mondata';
import { doname, xnameOf } from './objnam';
import { mungspaces } from './objnam_read';
import { monNam } from './perception';
import { freehand } from './pray';
import { LAST } from './priority';
import { P, heroHas, wornIn } from './props';
import { canReachFloor } from './reach';
import { isBlade } from './skills';
import { isAnimal } from './steal';
import { T, isObstructedId, surfaceKey, terrainIdAt } from './terrain';
import { heroForm } from './upoly';
import { holdAnotherObject } from './wish';

export { readEngrAt, engrCanBeFelt } from './engrread';

/** The `:` command: look here. ref: src/invent.c dolook() */
export const LOOK_ID: DefId = 'nh:look';
/** The `E` command (a self action) and its occupation. ref: src/engrave.c doengrave(), engrave() */
export const ENGRAVE_ID: DefId = 'nh:engrave';
/** "Engrave with this" on a suggested stylus. */
export const ENGRAVE_WITH_ID: DefId = 'nh:engrave_with';

/** ref: include/global.h BUFSZ */
const BUFSZ = 256;
/** The text prompt's longest answer (C's getlin() buffer, kept to a phone-sized line). */
const TEXT_MAX = 200;

const say = (ctx: Ctx, key: string, params?: Record<string, Msg | string | number>): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const look: ActionDef = {
  id: LOOK_ID,
  labelKey: 'action.nh:look',
  handles: 'mod',
  // ref: src/cmd.c the "look" command (`:`); always there, so near the end of the menu
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [
          {
            action: { type: 'mod', action: LOOK_ID },
            labelKey: 'action.nh:look',
            priority: LAST + 1,
          },
        ]
      : [],
  perform: (ctx) => dolook(ctx),
};

/** ref: include/context.h struct engrave_info (`nextc` is an index into `text`) */
interface EngraveOcc {
  text: string;
  next: number;
  /** The stylus, or null for her fingers (C's `&hands_obj`). */
  stylus: EntityId | null;
  type: EngrType;
  level: string;
  x: number;
  y: number;
  actionct: number;
}

/** The prompt data between doengrave()'s questions. */
interface EngraveAsk {
  stage: 'stylus' | 'add' | 'text';
  stylus?: EntityId | null;
  type?: EngrType;
  eow?: boolean;
}

const isOcc = (d: Json | undefined): d is Json & EngraveOcc =>
  !!d &&
  typeof d === 'object' &&
  !Array.isArray(d) &&
  typeof (d as { text?: unknown }).text === 'string';

interface Here {
  level: Level;
  x: number;
  y: number;
}

function heroHere(ctx: Ctx): Here | null {
  const pos = getPlayer(ctx.state).c.pos;
  const level = pos ? ctx.state.levels[pos.level] : undefined;
  return pos && level ? { level, x: pos.x, y: pos.y } : null;
}

const blind = (ctx: Ctx): boolean => heroHas(ctx.state, P.BLINDED);

/** The hero's item with this id, or null. */
function heroItem(ctx: Ctx, id: unknown): Entity | null {
  if (typeof id !== 'number') return null;
  const e = ctx.state.entities[String(id)];
  return e?.c.item?.carriedBy === ctx.state.playerId ? e : null;
}

/**
 * The classes suggested as a stylus; markers and towels would be too (no such objects).
 * ref: src/engrave.c stylus_ok()
 */
const stylusSuggested = (ctx: Ctx, e: Entity): boolean => {
  const c = ctx.defs.object(e.def).class;
  return c === 'weapon' || c === 'wand' || c === 'gem' || c === 'ring';
};

/** "your fingertip" or "your dagger": what she writes with (C's `writer`). */
const writerOf = (ctx: Ctx, stylus: Entity | null): Msg =>
  stylus
    ? { key: 'engr.your', params: { item: xnameOf(ctx.state, ctx.defs, stylus) } }
    : { key: 'engr.your_fingertip' };

/** "Your dagger" / "Your daggers" as the subject of a message (C's Yname2()). */
const yname = (ctx: Ctx, e: Entity): Msg => xnameOf(ctx.state, ctx.defs, e);

const plural = (e: Entity): string => ((e.c.item?.quantity ?? 1) !== 1 ? '.plural' : '');

/**
 * Whether the hero can engrave at all where she is: not inside an animal or a vortex, not on
 * lava, water, a fountain or a cloud, not in a wall; not without hands; not overloaded.
 * ref: src/engrave.c u_can_engrave()
 */
function uCanEngrave(ctx: Ctx): boolean {
  const h = heroHere(ctx);
  if (!h) return false;
  const { level, x, y } = h;
  const sw = engulferOf(ctx.state);
  const swallower = sw === null ? undefined : ctx.state.entities[String(sw)];
  if (swallower) {
    const def = ctx.defs.monster(swallower.def);
    if (isAnimal(def)) {
      say(ctx, 'engr.jonah');
      return false;
    } else if (isWhirly(def)) {
      // cant_reach_floor(u.ux, u.uy, FALSE, FALSE, FALSE)
      say(ctx, 'lev.cant_reach_floor', { surface: surfaceKey(ctx, level, x, y) });
      return false;
    }
    // amorphous engulfers: the attempt is allowed here and gets the 'jello' result below
  } else {
    const typ = terrainIdAt(level, x, y);
    if (isLava(ctx, level, x, y) || isPool(ctx, level, x, y) || typ === T.fountain) {
      say(ctx, 'engr.cant_write_on', { surface: surfaceKey(ctx, level, x, y) });
      return false;
    } else if (typ === T.cloud) {
      // airlevel or inside bubble on waterlevel (no air here)
      say(ctx, 'engr.cant_write_cloud');
      return false;
    } else if (typ === undefined || isObstructedId(typ) || typ === T.iron_bars) {
      // !ACCESSIBLE(): stone, tree, wall, secret corridor, bars
      say(ctx, 'engr.cant_write_here');
      return false;
    }
  }
  const form = heroForm(ctx);
  if (form && cantwield(form)) {
    say(ctx, 'engr.cant_hold');
    return false;
  }
  if (checkCapacity(ctx)) return false;
  return true;
}

/** "You can't reach the floor." (or the pit's bottom). ref: src/engrave.c cant_reach_floor() */
function cantReachFloor(ctx: Ctx, h: Here): void {
  say(ctx, 'lev.cant_reach_floor', {
    surface: canReachFloor(ctx, false) ? '@engr.pit_bottom' : surfaceKey(ctx, h.level, h.x, h.y),
  });
}

/** The `E` command: the stylus menu, fingers first, then the suggested items, then the rest. */
function doengrave(ctx: Ctx): number {
  if (!uCanEngrave(ctx)) return 0;
  const inv = inventoryOf(ctx.state, ctx.state.playerId);
  const options: PromptOption[] = [
    { value: 'fingers', key: 'engr.menu_fingers', letter: '-' },
    ...inv.filter((e) => stylusSuggested(ctx, e)).map((e) => invOption(ctx, e)),
    ...inv.filter((e) => !stylusSuggested(ctx, e)).map((e) => invOption(ctx, e)),
  ];
  ctx.ask(
    { id: 'engrave-with', kind: 'menu', key: 'engr.write_with', options, cancellable: true },
    ENGRAVE_ID,
    { stage: 'stylus' } satisfies EngraveAsk as unknown as Json,
  );
  return 0;
}

/** What doengrave_sfx_item() decided: go on (with the type), stop (with the cost), or no text. */
type Sfx = { go: true; type: EngrType; ptext: boolean } | { go: false; cost: number };

/**
 * The stylus's own effect on the engraving type: hard gems and rings engrave, boots write in the
 * dust, blades engrave unless welded or too dull; large objects, food, scrolls and books refuse
 * (that takes a move); a worn blindfold refuses at once. Wands are step 3: the default here.
 * ref: src/engrave.c doengrave_sfx_item()
 */
function sfxItem(ctx: Ctx, stylus: Entity | null, type: EngrType, frosted: boolean, h: Here): Sfx {
  if (!stylus) return { go: true, type, ptext: true }; // RANDOM_CLASS: fingers
  const def = ctx.defs.object(stylus.def);
  switch (def.class) {
    case 'ring': // "diamond" rings and others should work
    case 'gem':
      // diamonds & other hard gems should work
      if ((def.class === 'ring' ? TOUGH_RINGS : HARD_GEMS).has(def.id)) type = 'engrave';
      break;
    case 'armor':
    case 'rock':
      if (def.class === 'armor' && def.armor?.slot === 'boots') {
        type = 'dust';
        break;
      }
      // other armor and objects too large to engrave with
      say(ctx, 'engr.too_large');
      return { go: true, type, ptext: false };
    case 'food':
    case 'scroll':
    case 'spellbook':
      // objects too silly to engrave with
      say(ctx, frosted ? 'engr.too_frosty' : 'engr.too_dirty', { item: yname(ctx, stylus) });
      return { go: true, type, ptext: false };
    case 'weapon':
      // Fire Brand would BURN (no artifacts)
      if (isBlade(def)) {
        // non-blade, welded or too dull: the type stays DUST; only blades say so
        if (welded(ctx, stylus))
          say(ctx, 'engr.only_scratch', {
            item: yname(ctx, stylus),
            surface: surfaceKey(ctx, h.level, h.x, h.y),
          });
        else if ((stylus.c.item?.spe ?? 0) <= -3)
          say(ctx, `engr.too_dull${plural(stylus)}`, { item: yname(ctx, stylus) });
        else type = 'engrave';
      }
      break;
    case 'tool':
      if (wornIn(ctx.state, ctx.state.playerId, 'blindfold')?.id === stylus.id) {
        say(ctx, 'engr.blindfold');
        return { go: false, cost: 0 };
      }
      // magic markers and towels do not exist
      break;
    case 'venom':
      say(ctx, 'engr.poison_pen');
      break;
    default:
      // amulets, potions, coins; wands until m16 step 3
      break;
  }
  return { go: true, type, ptext: true };
}

/**
 * doengrave() once the stylus is chosen: a free hand, the jelly engulfer, reaching the floor,
 * the altar, the stylus's effect, then the add question. ref: src/engrave.c doengrave()
 */
function withStylus(ctx: Ctx, stylus: Entity | null): number {
  const h = heroHere(ctx);
  if (!h) return 0;
  const writer = writerOf(ctx, stylus);
  // There's no reason you should be able to write with a wand while both your hands are tied up.
  if (!freehand(ctx) && (!stylus || (stylus.id !== uwepOf(ctx)?.id && !stylus.c.item?.equipped))) {
    say(ctx, 'engr.no_free_hand');
    return 0;
  }
  const sw = engulferOf(ctx.state);
  const swallower = sw === null ? undefined : ctx.state.entities[String(sw)];
  if (swallower) {
    // `jello`: an engulfer that is neither an animal nor whirly (u_can_engrave() let it through)
    say(ctx, 'engr.tickle', { mon: monNam(ctx, swallower), writer });
    say(ctx, 'engr.dissolves');
    return 0;
  }
  if (!canReachFloor(ctx, true)) {
    // a wand gestures towards the floor (step 3)
    cantReachFloor(ctx, h);
    return 0;
  }
  if (terrainIdAt(h.level, h.x, h.y)?.startsWith('nh:altar_') === true) {
    say(ctx, 'engr.altar_motion', { writer });
    altarWrath(ctx, h.x, h.y);
    return 0;
  }
  // graves: m16 step 7
  const form = heroForm(ctx);
  const type: EngrType =
    form && (form.flags.includes('demon') || form.glyph.ch === 'V') ? 'blood' : 'dust';
  const frosted = isIce(ctx, h.level, h.x, h.y);
  const sfx = sfxItem(ctx, stylus, type, frosted, h);
  if (!sfx.go) return sfx.cost;
  // early exit for some implements
  if (!sfx.ptext) return NORMAL_SPEED;
  return askAdd(ctx, h, stylus?.id ?? null, sfx.type);
}

/** "Do you want to add to the current engraving?" when the types match. */
function askAdd(ctx: Ctx, h: Here, stylus: EntityId | null, type: EngrType): number {
  const oep = engrAt(ctx, h.level, h.x, h.y);
  if (oep) {
    // Give player the choice to add to engraving.
    if (type === 'headstone') return afterAdd(ctx, h, stylus, type, 'y');
    if (type === oep.type && (!blind(ctx) || oep.type === 'burn' || oep.type === 'engrave')) {
      ctx.ask({ id: 'engrave-add', kind: 'yn', key: 'engr.add_q', cancellable: true }, ENGRAVE_ID, {
        stage: 'add',
        stylus,
        type,
      } satisfies EngraveAsk as unknown as Json);
      return 0;
    }
  }
  return afterAdd(ctx, h, stylus, type, 'n');
}

const isWipeable = (t: EngrType): boolean => t === 'dust' || t === 'blood' || t === 'mark';

/** doengrave_ctx_verb(): what she is doing, as a message param. */
function verbOf(type: EngrType, adding: boolean, frosted: boolean): string {
  switch (type) {
    case 'dust':
      return adding ? '@engr.verb.add_writing' : '@engr.verb.write_in';
    case 'headstone':
      return adding ? '@engr.verb.add_epitaph' : '@engr.verb.engrave_on';
    case 'engrave':
      return adding ? '@engr.verb.add_engraving' : '@engr.verb.engrave_in';
    case 'burn':
      return adding
        ? frosted
          ? '@engr.verb.add_melted'
          : '@engr.verb.add_burned'
        : frosted
          ? '@engr.verb.melt_into'
          : '@engr.verb.burn_into';
    case 'mark':
      return adding ? '@engr.verb.add_graffiti' : '@engr.verb.scribble_on';
    case 'blood':
      return adding ? '@engr.verb.add_scrawl' : '@engr.verb.scrawl_on';
  }
}

/**
 * After the add question (`c`): wipe out a dust, blood or graffiti message, refuse to wipe one
 * that is engraved or burned, or overwrite it; then tell what she is doing and ask the text.
 * ref: src/engrave.c doengrave()
 */
function afterAdd(
  ctx: Ctx,
  h: Here,
  stylusId: EntityId | null,
  type: EngrType,
  c: 'y' | 'n',
): number {
  const { level, x, y } = h;
  const frosted = isIce(ctx, level, x, y);
  const isBlind = blind(ctx);
  let eow = false;
  const oep = engrAt(ctx, level, x, y);
  if (oep) {
    if (c === 'n' || isBlind) {
      if (isWipeable(oep.type)) {
        if (!isBlind) {
          say(
            ctx,
            oep.type === 'dust'
              ? frosted
                ? 'engr.wipe_frost'
                : 'engr.wipe_dust'
              : oep.type === 'blood'
                ? 'engr.wipe_blood'
                : 'engr.wipe_written',
          );
          delEngrAt(ctx, level, x, y);
        } else {
          // defer deletion until after we *know* we're engraving
          eow = true;
        }
      } else if (isWipeable(type)) {
        say(ctx, 'engr.cannot_wipe', {
          how:
            oep.type === 'burn'
              ? frosted
                ? '@engr.how.melted'
                : '@engr.how.burned'
              : '@engr.how.engraved',
          surface: surfaceKey(ctx, level, x, y),
        });
        return NORMAL_SPEED;
      } else if (type !== oep.type || c === 'n') {
        if (!isBlind || canReachFloor(ctx, true)) say(ctx, 'engr.overwrite');
        eow = true;
      }
    } else if (oep.text.length >= BUFSZ - 1) {
      say(ctx, 'engr.no_room');
      return NORMAL_SPEED;
    }
  }
  const adding = engrAt(ctx, level, x, y) !== null && !eow;
  const verb = verbOf(type, adding, frosted);
  const loc =
    type === 'dust'
      ? frosted
        ? '@engr.loc.frost'
        : '@engr.loc.dust'
      : surfaceKey(ctx, level, x, y);
  // Tell adventurer what is going on
  const stylus = heroItem(ctx, stylusId);
  if (stylus) {
    // "1 of" a stack that will be split (doname() says "N items")
    const one = type === 'engrave' && (stylus.c.item?.quantity ?? 1) > 1;
    say(ctx, one ? 'engr.you_verb_with_one' : 'engr.you_verb_with', {
      verb,
      loc,
      item: doname(ctx.state, ctx.defs, stylus),
    });
  } else {
    say(ctx, 'engr.you_verb_fingers', { verb, loc });
  }
  // Prompt for engraving!
  ctx.ask(
    {
      id: 'engrave',
      kind: 'text',
      key: 'engr.what_text',
      params: { verb, loc },
      maxLength: TEXT_MAX,
    },
    ENGRAVE_ID,
    { stage: 'text', stylus: stylusId, type, eow } satisfies EngraveAsk as unknown as Json,
  );
  return 0;
}

/**
 * The text answer: condense the blanks, count the letters, scramble them when the surface or
 * her state of mind is unsound, overwrite the old engraving, then start engraving (its first
 * action now). ref: src/engrave.c doengrave()
 */
function answerText(ctx: Ctx, value: Json, d: EngraveAsk): number {
  const h = heroHere(ctx);
  if (!h) return 0;
  const stylusId = d.stylus ?? null;
  if (stylusId !== null && !heroItem(ctx, stylusId)) return 0;
  const type = d.type ?? 'dust';
  // convert tabs to spaces and condense consecutive spaces to one
  const ebuf = typeof value === 'string' ? mungspaces(value) : '';
  // Count the actual # of chars engraved not including spaces
  const len = ebuf.replace(/ /g, '').length;
  if (len === 0) {
    say(ctx, 'engr.never_mind');
    return 0;
  }
  // (the literate conduct is not ported)
  // Mix up engraving if surface or state of mind is unsound.
  // Note: this won't add or remove any spaces.
  const isBlind = blind(ctx);
  const conf = heroHas(ctx.state, P.CONFUSION);
  const stun = heroHas(ctx.state, P.STUNNED);
  const hallu = heroHas(ctx.state, P.HALLUC);
  const rng = ctx.rng;
  const chars = ebuf.split('');
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === ' ') continue;
    if (
      ((type === 'dust' || type === 'blood') && !rng.rn2(25)) ||
      (isBlind && !rng.rn2(11)) ||
      (conf && !rng.rn2(7)) ||
      (stun && !rng.rn2(4)) ||
      (hallu && !rng.rn2(2))
    )
      // ASCII '!' thru '~' (excludes ' ' and DEL)
      chars[i] = String.fromCharCode(32 + rng.rnd(96 - 2));
  }
  // Previous engraving is overwritten
  if (d.eow) delEngrAt(ctx, h.level, h.x, h.y);
  const occ: EngraveOcc = {
    text: chars.join(''),
    next: 0,
    stylus: stylusId,
    type,
    level: h.level.id,
    x: h.x,
    y: h.y,
    actionct: 0,
  };
  ctx.state.occupation = {
    action: { type: 'mod', action: ENGRAVE_ID },
    data: occ as unknown as Json,
  };
  // Engraving always takes at least one action, run as the occupation: its first one is now
  engrave(ctx, ctx.state.occupation.data as Json & EngraveOcc);
  if (ctx.state.occupation && !continuesEngraving(ctx)) ctx.state.occupation = null;
  return NORMAL_SPEED;
}

/** The "You finish ..." words for each type. ref: src/engrave.c engrave() finishverb */
function finishVerb(type: EngrType, ice: boolean): string {
  switch (type) {
    case 'dust':
      return ice ? '@engr.finish.frost' : '@engr.finish.dust';
    case 'headstone':
    case 'engrave':
      return '@engr.finish.engraving';
    case 'burn':
      return ice ? '@engr.finish.melt' : '@engr.finish.burn';
    case 'mark':
      return '@engr.finish.mark';
    case 'blood':
      return '@engr.finish.blood';
  }
}

/**
 * One action of engraving (the occupation): ten letters, or one when carving with a weapon that
 * dulls (not an uncursed athame), a ring or a gem; a dulling weapon loses a point on the 1st,
 * 3rd, ... action (one of a stack is split off first). The engraving grows each action and is
 * finished on this turn. Clears the occupation when done. ref: src/engrave.c engrave()
 */
function engrave(ctx: Ctx, occ: EngraveOcc): void {
  const done = (): void => {
    ctx.state.occupation = null;
  };
  const h = heroHere(ctx);
  if (!h || h.level.id !== occ.level || h.x !== occ.x || h.y !== occ.y) {
    // teleported?
    say(ctx, 'engr.unable_continue');
    return done();
  }
  const firsttime = occ.actionct === 0;
  let truncate = false;
  // Stylus might have been taken out of inventory and destroyed somehow.
  let stylus: Entity | null = null;
  if (occ.stylus !== null) {
    stylus = heroItem(ctx, occ.stylus);
    if (!stylus) {
      say(ctx, 'engr.unable_continue');
      return done();
    }
  }
  const carving = occ.type === 'engrave' || occ.type === 'headstone';
  const sdef = stylus ? ctx.defs.object(stylus.def) : null;
  const dullingWep =
    carving &&
    !!stylus &&
    sdef?.class === 'weapon' &&
    (stylus.def !== 'nh:athame' || stylus.c.item?.buc === 'cursed');
  occ.actionct++;

  // Step 1: Compute rate (markers do not exist).
  const rate =
    carving && stylus && (dullingWep || sdef?.class === 'ring' || sdef?.class === 'gem') ? 1 : 10;

  // Step 2: Compute last character that can be engraved this action.
  let endc = occ.next;
  for (let i = rate; endc < occ.text.length && i > 0; endc++) if (occ.text[endc] !== ' ') i--;

  // Step 3: affect stylus from engraving - it might wear out.
  if (dullingWep && stylus?.c.item) {
    let splitstack = false;
    let dulled = false;
    if (stylus.c.item.quantity > 1) {
      if (firsttime) say(ctx, 'engr.one_dull', { item: yname(ctx, stylus) });
      // if stack is wielded or quivered, the split-off one isn't
      const one = splitStack(ctx, stylus.id, 1);
      occ.stylus = one;
      stylus = ctx.state.entities[String(one)] ?? null;
      splitstack = true;
    } else if (firsttime) {
      // normal case: stylus->quan == 1
      say(ctx, 'engr.gets_dull', { item: yname(ctx, stylus) });
    }
    const it = stylus?.c.item;
    // Dull the weapon at a rate of -1 enchantment per 2 characters, rounding down: deduct a point
    // on the 1st, 3rd, 5th, ... actions, unless this is the last character being engraved, but
    // always on the 1st action. Check for truncation *before* deducting a point.
    if (it && occ.actionct % 2 === 1) {
      if (it.spe <= -3) truncate = true;
      else if (endc < occ.text.length || occ.actionct === 1) {
        it.spe -= 1;
        dulled = true;
      }
    }
    if (splitstack && stylus) {
      holdAnotherObject(ctx, stylus.id, {
        key: 'engr.drop_one',
        params: { item: doname(ctx.state, ctx.defs, stylus) },
      });
    } else if (dulled && stylus && it?.known.spe) {
      // reflect change in stylus->spe
      prinv(ctx, stylus, 1);
    }
  }

  const ice = isIce(ctx, h.level, h.x, h.y);
  const finishverb = finishVerb(occ.type, ice);

  // actions that happen at the end of every engraving action go here
  const oep = engrAt(ctx, h.level, h.x, h.y);
  let buf = oep ? oep.text : ''; // add to existing engraving
  const spaceLeft = BUFSZ - buf.length - 1;
  if (endc - occ.next > spaceLeft) {
    say(ctx, 'engr.out_of_room');
    endc = occ.next + spaceLeft;
    truncate = true;
  }
  // If the stylus did wear out mid-engraving, truncate the input so that we can't go any further.
  if (truncate && endc < occ.text.length) {
    occ.text = occ.text.slice(0, endc);
    say(ctx, 'engr.only_able', { text: `"${occ.text}".` });
  } else {
    // input was not truncated; stylus may still have worn out on the last character, though
    truncate = false;
  }
  buf += occ.text.slice(occ.next, endc);
  makeEngrAt(ctx, h.level, h.x, h.y, buf, null, ctx.state.turn, occ.type);

  if (endc < occ.text.length) {
    occ.next = endc;
    return; // not yet finished this turn
  }
  // finished engraving
  if (truncate) say(ctx, 'engr.no_more');
  // only print this if engraving took multiple actions
  else if (!firsttime) say(ctx, 'engr.finish', { verb: finishverb });
  done();
}

/**
 * Whether the engraving goes on: it is not finished and no hostile monster came next to her
 * (which stops it: "You stop engraving.").
 * ref: src/allmain.c moveloop_core() `if (go.occupation && monster_nearby()) stop_occupation()`
 */
function continuesEngraving(ctx: Ctx): boolean {
  const occ = ctx.state.occupation;
  if (occ?.action.type !== 'mod' || occ.action.action !== ENGRAVE_ID || !isOcc(occ.data))
    return false;
  if (monsterNearby(ctx)) {
    say(ctx, 'engr.stop');
    ctx.interrupt();
    return false;
  }
  return true;
}

const engraveAction: ActionDef = {
  id: ENGRAVE_ID,
  labelKey: 'action.nh:engrave',
  handles: 'mod',
  // ref: src/cmd.c the "engrave" command (`E`); always there, so near the end of the menu
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [
          {
            action: { type: 'mod', action: ENGRAVE_ID },
            labelKey: 'action.nh:engrave',
            priority: LAST + 1,
          },
        ]
      : [],
  perform(ctx) {
    const occ = ctx.state.occupation;
    if (occ && isOcc(occ.data)) {
      // the occupation: one more action of engraving
      engrave(ctx, occ.data);
      return NORMAL_SPEED;
    }
    ctx.state.occupation = null;
    return doengrave(ctx);
  },
  answer(ctx, value, raw) {
    const d = raw as unknown as EngraveAsk;
    const h = heroHere(ctx);
    if (!h) return 0;
    if (d.stage === 'stylus') {
      // getobj(): Escape says "Never mind."
      if (value === null) {
        say(ctx, 'engr.never_mind');
        return 0;
      }
      if (value === 'fingers') return withStylus(ctx, null);
      const stylus = heroItem(ctx, value);
      return stylus ? withStylus(ctx, stylus) : 0;
    }
    if (d.stage === 'add') {
      if (value === null) {
        // 'q'
        say(ctx, 'engr.never_mind');
        return 0;
      }
      return afterAdd(ctx, h, d.stylus ?? null, d.type ?? 'dust', value === true ? 'y' : 'n');
    }
    return answerText(ctx, value, d);
  },
  continues: (ctx) => continuesEngraving(ctx),
};

/** "Engrave with" on the items stylus_ok() suggests: `E` with that item chosen. */
const engraveWith: ActionDef = {
  id: ENGRAVE_WITH_ID,
  labelKey: 'action.nh:engrave_with',
  handles: 'mod',
  offer(ctx, target): Offer[] {
    if (target.kind !== 'item') return [];
    const e = heroItem(ctx, target.id);
    if (!e || !stylusSuggested(ctx, e)) return [];
    return [
      {
        action: { type: 'mod', action: ENGRAVE_WITH_ID, args: { item: e.id } },
        labelKey: 'action.nh:engrave_with',
      },
    ];
  },
  perform(ctx, action) {
    if (action.type !== 'mod') return 0;
    const e = heroItem(ctx, (action.args as { item?: unknown } | undefined)?.item);
    if (!e) return 0;
    if (!uCanEngrave(ctx)) return 0;
    return withStylus(ctx, e);
  },
};

export const ENGRAVE_ACTIONS: readonly ActionDef[] = [look, engraveAction, engraveWith];
