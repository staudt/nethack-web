// Engravings: the `:` look command and the `E` engrave command.
// ref: src/engrave.c doengrave(), doengrave_sfx_item(), doengrave_sfx_item_WAN(),
// doengrave_ctx_verb(), engrave(), stylus_ok(), u_can_engrave(), blengr(); src/invent.c dolook()
//
// The state is engr.ts (a leaf) and reading it engrread.ts (a leaf for itemactions.ts); this
// module holds the commands and may import game modules, so nothing below it imports it.
//
// doengrave() is a small state machine over prompts: the stylus menu (C's getobj()), "Do you
// want to add to the current engraving?" (yn), the text (getlin()), then the `engrave()`
// occupation, whose data is C's `context.engraving`. The setup takes no time; the first
// engraving action runs with the text answer (C runs it as the occupation's first call). A wand
// spends a charge when chosen; a wand of wishing asks its wish first (a prompt whose answer
// carries doengrave()'s state, then the engraving goes on as in C).
// Graves (grave.ts): fingers only smudge the headstone, the first stylus disturbs the undead,
// then engraving adds to the epitaph and anything else writes in the dust.
// A magic marker writes graffiti (MARK), at most two letters a charge, spending half the
// action's rate in ink each action (5.0's engrave()), and dries out mid-text. A towel writes
// nothing: it wipes out a dust, blood or graffiti engraving (and dries a little doing so).
// Not ported: Fire Brand's burning (left out of m20: it engraves as any blade), the literate
// conduct (no conducts), body_part() (always "fingertip" and "hand"), Deaf (never deaf: "You
// hear drilling!").
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
import { resistsBlnd } from './adtyping';
import { isLoweredSpan } from './dbstate';
import { uwepOf } from './combat';
import { monsterNearby } from './eat';
import { delEngrAt, engrAt, makeEngrAt, type EngrType } from './engr';
import { engulferOf, isWhirly } from './engulfstate';
import { HARD_GEMS, TOUGH_RINGS } from './gem';
import { disturbGrave, graveDisturbed, isGrave } from './grave';
import { dolook, invOption, prinv, welded } from './itemactions';
import { splitStack } from './items';
import { isIce, isLava, isPool } from './liquid';
import { checkCapacity, useup } from './magic';
import { cantwield } from './mondata';
import { doname, xnameOf } from './objnam';
import { dryATowel, isWetTowel } from './glib';
import { mungspaces } from './objnam_read';
import { isKnown } from './o_init';
import { monNam } from './perception';
import { freehand } from './pray';
import { LAST } from './priority';
import { P, heroHas, makeBlinded, wornIn } from './props';
import { canReachFloor } from './reach';
import { randomEngraving } from './rndengr';
import { wandExplode } from './seffect';
import { checkUnpaid } from './shk';
import { isBlade } from './skills';
import { isAnimal } from './steal';
import { T, isObstructedId, surfaceKey, terrainIdAt } from './terrain';
import { heroForm } from './upoly';
import { rlocEngr } from './teleport';
import { moreExperienced } from './urexp';
import { answerWish, holdAnotherObject, type WishData } from './wish';
import { WAN, learnwand, zapnodir, zappable } from './zap';

export { readEngrAt, engrCanBeFelt } from './engrread';
export { randomEngraving } from './rndengr';
export { rlocEngr } from './teleport';

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

/**
 * doengrave()'s state once the stylus has had its effect (C's `struct _doengrave_ctx` fields).
 * ref: src/engrave.c doengrave_ctx_init()
 */
interface SfxState {
  /** The engraving type; null is C's `type = 0` (random), set only with a new `buf`. */
  type: EngrType | null;
  /** She goes on to write a text. */
  ptext: boolean;
  /** A wand's charge was used. */
  zapwand: boolean;
  /** The current engraving is deleted, or (`teleengr`) sent elsewhere on the level. */
  dengr: boolean;
  teleengr: boolean;
  /** The wand identifies itself. */
  doknown: boolean;
  /** The lightning flash blinds her once she starts. */
  doblind: boolean;
  /** A new text replaces the engraving (polymorph), and its pristine copy. */
  buf: string;
  ebuf: string;
  /** What is said once she starts engraving (C's `post_engr_text`). */
  post: Msg | null;
}

/** The prompt data between doengrave()'s questions. */
interface EngraveAsk {
  stage: 'stylus' | 'wish' | 'add' | 'text';
  stylus?: EntityId | null;
  type?: EngrType;
  eow?: boolean;
  /** The wish stage: the state to go on with after the wish. */
  sfx?: SfxState;
  /** A wand's charge was used: an empty text "glows, then fades" and takes a move. */
  zapwand?: boolean;
  /** Said once she starts engraving. */
  post?: Msg | null;
  /** The lightning flash blinds her once she starts. */
  doblind?: boolean;
}

/** What the add and text stages carry over from the stylus's effects. */
type WandExtras = Pick<EngraveAsk, 'zapwand' | 'post' | 'doblind'>;

/** The names C's blind polymorphed engraving reads (blind_writing[], decrypted with xcrypt()). */
const BLIND_WRITING: readonly string[] = [
  'Ediard Asadov',
  'Pedro Bucaneg',
  'Howard Hille Johnson',
  'John Milton',
  'Petronella Moens',
  'Maria Josefa Mujia',
  'Melchiorre Murenu',
  'Edith Ranum',
  'Edward Rushton',
];

/** ref: include/hack.h WAND_BACKFIRE_CHANCE */
const WAND_BACKFIRE_CHANCE = 100;

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

const MAGIC_MARKER: DefId = 'nh:magic_marker';
const TOWEL: DefId = 'nh:towel';

/** The classes suggested as a stylus, and the magic marker and the towel. ref: src/engrave.c stylus_ok() */
const stylusSuggested = (ctx: Ctx, e: Entity): boolean => {
  const c = ctx.defs.object(e.def).class;
  return (
    c === 'weapon' ||
    c === 'wand' ||
    c === 'gem' ||
    c === 'ring' ||
    // Only markers and towels are recommended tools.
    (c === 'tool' && (e.def === TOWEL || e.def === MAGIC_MARKER))
  );
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

/**
 * "You can't reach the floor." (or the pit's bottom); for a wand, "The wand does nothing more,
 * and the tip of the wand can't reach the floor." ref: src/engrave.c cant_reach_floor()
 */
function cantReachFloor(ctx: Ctx, h: Here, wand = false): void {
  say(ctx, wand ? 'engr.wand_cant_reach' : 'lev.cant_reach_floor', {
    surface: canReachFloor(ctx, false) ? '@engr.pit_bottom' : surfaceKey(ctx, h.level, h.x, h.y),
  });
}

const isWand = (ctx: Ctx, e: Entity | null): e is Entity =>
  !!e && ctx.defs.object(e.def).class === 'wand';

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

/** What doengrave_sfx_item() decided: go on (`wish`: after the wish prompt), or stop. */
type Sfx = { go: true; s: SfxState; wish: boolean } | { go: false; cost: number };

/**
 * A wand's own effect: directionless wands zap (a wish is asked), the immediate and ray wands
 * tell their tale, digging engraves, fire and lightning burn (and identify themselves),
 * polymorph rewrites the current engraving, cancellation and make invisible erase it,
 * teleportation sends it away, cold erases a burned one. ref: src/engrave.c
 * doengrave_sfx_item_WAN()
 */
function sfxWand(ctx: Ctx, wand: Entity, s: SfxState, h: Here, frosted: boolean): void {
  const isBlind = blind(ctx);
  const oep = engrAt(ctx, h.level, h.x, h.y);
  const surface = surfaceKey(ctx, h.level, h.x, h.y);
  const known = isKnown(ctx.state, ctx.defs, wand.def);
  const identify = (key: string): void => {
    if (!known) {
      // flags.verbose
      say(ctx, key, { item: xnameOf(ctx.state, ctx.defs, wand) });
      s.doknown = true;
    }
  };
  const vanishes = (): void => {
    if (!isBlind) say(ctx, 'engr.vanishes', { surface });
  };
  switch (wand.def) {
    // DUST wands
    default:
      break;
    // NODIR wands
    case WAN.light:
    case WAN.secretDoor:
    case WAN.stasis:
    case WAN.createMonster:
    case WAN.wishing:
    case WAN.enlightenment:
      // the wish comes back to the engrave action, which goes on from there
      zapnodir(
        ctx,
        { kind: 'wand', item: wand },
        {
          action: ENGRAVE_ID,
          data: { stage: 'wish', stylus: wand.id, sfx: { ...s } } satisfies EngraveAsk as never,
        },
      );
      break;
    // IMMEDIATE wands; if wand is "IMMEDIATE", remember to affect the previous engraving even
    // if turning to dust
    case WAN.striking:
      s.post = { key: 'engr.post.striking' };
      break;
    case WAN.slow:
      if (!isBlind) s.post = { key: 'engr.post.bugs_slow', params: { surface } };
      break;
    case WAN.speed:
      if (!isBlind) s.post = { key: 'engr.post.bugs_speed', params: { surface } };
      break;
    case WAN.polymorph:
      if (oep) {
        if (!isBlind) {
          s.type = null; // random
          const r = randomEngraving(ctx);
          s.buf = r.text;
          s.ebuf = r.pristine;
        } else {
          // keep the same type so that feels don't change and only the text is altered, but you
          // won't know anyway because you're a _blind writer_
          s.type = oep.type;
          s.buf = BLIND_WRITING[ctx.rng.rn2(BLIND_WRITING.length)] as string;
        }
        s.dengr = true;
      }
      break;
    case WAN.nothing:
    case WAN.undeadTurning:
    case WAN.opening:
    case WAN.locking:
    case WAN.probing:
      break;
    // RAY wands
    case WAN.magicMissile:
      s.ptext = true;
      if (!isBlind) s.post = { key: 'engr.post.bullet_holes', params: { surface } };
      break;
    // can't tell sleep from death - Eric Backus
    case WAN.sleep:
    case WAN.death:
      if (!isBlind) s.post = { key: 'engr.post.bugs_stop', params: { surface } };
      break;
    case WAN.cold:
    case WAN.cancellation:
    case WAN.makeInvisible:
      if (wand.def === WAN.cold) {
        if (!isBlind) s.post = { key: 'engr.post.ice_cubes' };
        if (!oep || oep.type !== 'burn') break;
        // then as cancellation (C's FALLTHROUGH)
      }
      if (oep && oep.type !== 'headstone') {
        vanishes();
        s.dengr = true;
      }
      break;
    case WAN.teleportation:
      if (oep && oep.type !== 'headstone') {
        vanishes();
        s.teleengr = true;
      }
      break;
    // type = ENGRAVE wands
    case WAN.digging:
      s.ptext = true;
      s.type = 'engrave';
      identify('engr.is_digging');
      s.post = {
        key: isBlind
          ? 'engr.post.drilling' // not Deaf
          : isGrave(h.level, h.x, h.y)
            ? 'engr.post.chips'
            : frosted
              ? 'engr.post.ice_chips'
              : isLoweredSpan(h.level, h.x, h.y)
                ? 'engr.post.splinters'
                : 'engr.post.gravel',
      };
      break;
    // type = BURN wands
    case WAN.fire:
      s.ptext = true;
      s.type = 'burn';
      identify('engr.is_fire');
      s.post = { key: isBlind ? 'engr.post.heat_up' : 'engr.post.flames' };
      break;
    case WAN.lightning:
      s.ptext = true;
      s.type = 'burn';
      identify('engr.is_lightning');
      if (!isBlind) {
        s.post = { key: 'engr.post.lightning' };
        s.doblind = true;
      } else s.post = { key: 'engr.post.crackling' }; // not Deaf
      break;
  }
}

/**
 * The stylus's own effect on the engraving type: hard gems and rings engrave, boots write in the
 * dust, blades engrave unless welded or too dull; large objects, food, scrolls and books refuse
 * (that takes a move); a worn blindfold refuses at once; a wand spends a charge (or turns to
 * dust, or explodes) and has its own effect. ref: src/engrave.c doengrave_sfx_item()
 */
function sfxItem(ctx: Ctx, stylus: Entity | null, type: EngrType, frosted: boolean, h: Here): Sfx {
  const s: SfxState = {
    type,
    ptext: true,
    zapwand: false,
    dengr: false,
    teleengr: false,
    doknown: false,
    doblind: false,
    buf: '',
    ebuf: '',
    post: null,
  };
  if (!stylus) return { go: true, s, wish: false }; // RANDOM_CLASS: fingers
  const def = ctx.defs.object(stylus.def);
  switch (def.class) {
    case 'ring': // "diamond" rings and others should work
    case 'gem':
      // diamonds & other hard gems should work
      if ((def.class === 'ring' ? TOUGH_RINGS : HARD_GEMS).has(def.id)) s.type = 'engrave';
      break;
    case 'armor':
    case 'rock':
      if (def.class === 'armor' && def.armor?.slot === 'boots') {
        s.type = 'dust';
        break;
      }
      // other armor and objects too large to engrave with
      say(ctx, 'engr.too_large');
      s.ptext = false;
      break;
    case 'food':
    case 'scroll':
    case 'spellbook':
      // objects too silly to engrave with
      say(ctx, frosted ? 'engr.too_frosty' : 'engr.too_dirty', { item: yname(ctx, stylus) });
      s.ptext = false;
      break;
    // The charge is removed from the wand before prompting for the engraving text, because all
    // kinds of setup decisions and pre-engraving messages are based upon knowing what type of
    // engraving the wand is going to do. Also, the player will have potentially seen "You wrest
    // .." message, and therefore will know they are using a charge.
    case 'wand':
      if (zappable(ctx, stylus)) {
        checkUnpaid(ctx, stylus);
        if (stylus.c.item?.buc === 'cursed' && !ctx.rng.rn2(WAND_BACKFIRE_CHANCE)) {
          wandExplode(ctx, stylus, 0);
          return { go: false, cost: NORMAL_SPEED };
        }
        s.zapwand = true;
        if (!canReachFloor(ctx, true)) s.ptext = false;
        sfxWand(ctx, stylus, s, h, frosted);
        if (ctx.state.pendingPrompt) return { go: true, s, wish: true };
      } else {
        // failing to wrest one last charge takes time
        s.ptext = false; // use "early exit" below, return 1
        // give feedback here if we won't be getting the "can't reach floor" message below
        if (canReachFloor(ctx, true)) {
          // cancelled wand turns to dust
          if ((stylus.c.item?.spe ?? 0) < 0) s.zapwand = true;
          // empty wand just doesn't write
          else say(ctx, 'engr.too_worn');
        }
      }
      break;
    case 'weapon':
      // Fire Brand would BURN (left out of m20: it engraves as any blade)
      if (isBlade(def)) {
        // non-blade, welded or too dull: the type stays DUST; only blades say so
        if (welded(ctx, stylus))
          say(ctx, 'engr.only_scratch', {
            item: yname(ctx, stylus),
            surface: surfaceKey(ctx, h.level, h.x, h.y),
          });
        else if ((stylus.c.item?.spe ?? 0) <= -3)
          say(ctx, `engr.too_dull${plural(stylus)}`, { item: yname(ctx, stylus) });
        else s.type = 'engrave';
      }
      break;
    case 'tool':
      if (wornIn(ctx.state, ctx.state.playerId, 'blindfold')?.id === stylus.id) {
        say(ctx, 'engr.blindfold');
        return { go: false, cost: 0 };
      }
      if (stylus.def === MAGIC_MARKER) {
        if ((stylus.c.item?.spe ?? 0) <= 0) say(ctx, 'engr.marker_dried');
        else s.type = 'mark';
      } else if (stylus.def === TOWEL) {
        // Can't really engrave with a towel
        s.ptext = false;
        const whose = stylus.c.item?.unpaid ? '@towel.the' : '@towel.your';
        const item = xnameOf(ctx.state, ctx.defs, stylus);
        const oep = engrAt(ctx, h.level, h.x, h.y);
        if (oep && isWipeable(oep.type)) {
          if (isWetTowel(stylus)) dryATowel(ctx, stylus, -1, true);
          if (!blind(ctx)) say(ctx, 'towel.wipe_engr');
          else say(ctx, frosted ? 'towel.gets_frosty' : 'towel.gets_dusty', { whose, item });
          s.dengr = true;
        } else if (oep) {
          say(ctx, 'towel.cant_wipe', { whose, item });
        } else {
          say(ctx, frosted ? 'towel.gets_frosty' : 'towel.gets_dusty', { whose, item });
        }
      }
      break;
    case 'venom':
      say(ctx, 'engr.poison_pen');
      break;
    default:
      // amulets, potions, coins
      break;
  }
  return { go: true, s, wish: false };
}

/**
 * doengrave() once the stylus is chosen: a free hand, the jelly engulfer, reaching the floor
 * (a wand only gestures), the altar, the stylus's effect, then afterSfx().
 * ref: src/engrave.c doengrave()
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
  let initialMsgGiven = false;
  if (!canReachFloor(ctx, true)) {
    if (!isWand(ctx, stylus)) {
      cantReachFloor(ctx, h);
      return 0;
    }
    say(ctx, 'engr.gesture', { surface: surfaceKey(ctx, h.level, h.x, h.y) });
    initialMsgGiven = true;
  }
  if (terrainIdAt(h.level, h.x, h.y)?.startsWith('nh:altar_') === true) {
    if (!initialMsgGiven) say(ctx, 'engr.altar_motion', { writer });
    altarWrath(ctx, h.x, h.y);
    return 0;
  }
  if (isGrave(h.level, h.x, h.y)) {
    if (!stylus) {
      // using only finger
      say(ctx, 'engr.small_smudge', { surface: surfaceKey(ctx, h.level, h.x, h.y) });
      return 0;
    } else if (!graveDisturbed(ctx, h.level, h.x, h.y)) {
      // disturb the grave: summon a ghoul, same as sometimes happens when kicking; sets the
      // disturbed bit so that it'll only happen once
      disturbGrave(ctx, h.x, h.y);
      return 0;
    }
  }
  const form = heroForm(ctx);
  const type: EngrType =
    form && (form.flags.includes('demon') || form.glyph.ch === 'V') ? 'blood' : 'dust';
  const frosted = isIce(ctx, h.level, h.x, h.y);
  const sfx = sfxItem(ctx, stylus, type, frosted, h);
  if (!sfx.go) return sfx.cost;
  // a wand of wishing: the wish's answer goes on with afterSfx()
  if (sfx.wish) return 0;
  return afterSfx(ctx, h, stylus, sfx.s);
}

/**
 * The rest of the implement setup: identify the wand, send the old engraving away or delete it,
 * write a polymorphed one ("The engraving now reads: ..."), a cancelled wand turns to dust, the
 * early exit for implements that write nothing; then the add question.
 * ref: src/engrave.c doengrave()
 */
function afterSfx(ctx: Ctx, h: Here, stylusIn: Entity | null, s: SfxState): number {
  const { level, x, y } = h;
  let stylus = stylusIn;
  let ptext = s.ptext;
  if (isGrave(level, x, y)) {
    if (s.type === 'engrave' || s.type === null) {
      s.type = 'headstone';
    } else {
      // ensures the "cannot wipe out" case
      s.type = 'dust';
      s.dengr = false;
      s.teleengr = false;
      s.buf = '';
    }
  }
  // Identify stylus
  if (s.doknown && stylus) {
    learnwand(ctx, stylus);
    if (isKnown(ctx.state, ctx.defs, stylus.def)) moreExperienced(ctx, 0, 10);
  }
  let oepGone = false;
  if (s.teleengr) {
    rlocEngr(ctx, level, x, y);
    oepGone = true;
  }
  if (s.dengr) {
    delEngrAt(ctx, level, x, y);
    oepGone = true;
  }
  // Something has changed the engraving here
  if (s.buf) {
    makeEngrAt(ctx, level, x, y, s.buf, s.ebuf, ctx.state.turn, s.type);
    if (!blind(ctx)) say(ctx, 'engr.now_reads', { text: `"${s.buf}".` });
    ptext = false;
  }
  if (s.zapwand && stylus && (stylus.c.item?.spe ?? 0) < 0) {
    say(ctx, blind(ctx) ? 'engr.wand_dust_blind' : 'engr.wand_dust', {
      item: xnameOf(ctx.state, ctx.defs, stylus),
    });
    if (!isGrave(level, x, y))
      say(ctx, 'engr.dust_with_dust', {
        loc: isIce(ctx, level, x, y) ? '@engr.loc.frost' : '@engr.loc.dust',
      });
    useup(ctx, stylus.id);
    stylus = null; // wand is now gone
    ptext = false;
  }
  // Early exit for some implements.
  if (!ptext) {
    if (isWand(ctx, stylus) && !canReachFloor(ctx, true)) cantReachFloor(ctx, h, true);
    return NORMAL_SPEED;
  }
  return askAdd(ctx, h, stylus?.id ?? null, s.type ?? 'dust', oepGone, {
    zapwand: s.zapwand,
    post: s.post,
    doblind: s.doblind,
  });
}

/**
 * "Do you want to add to the current engraving?" when the types match. `oepGone`: the stylus
 * deleted or moved the old one (C's `oep = 0`), so there is nothing to add to.
 */
function askAdd(
  ctx: Ctx,
  h: Here,
  stylus: EntityId | null,
  type: EngrType,
  oepGone: boolean,
  extras: WandExtras,
): number {
  const oep = oepGone ? null : engrAt(ctx, h.level, h.x, h.y);
  if (oep) {
    // Give player the choice to add to engraving.
    if (type === 'headstone') return afterAdd(ctx, h, stylus, type, 'y', false, extras);
    if (type === oep.type && (!blind(ctx) || oep.type === 'burn' || oep.type === 'engrave')) {
      ctx.ask({ id: 'engrave-add', kind: 'yn', key: 'engr.add_q', cancellable: true }, ENGRAVE_ID, {
        stage: 'add',
        stylus,
        type,
        ...extras,
      } satisfies EngraveAsk as unknown as Json);
      return 0;
    }
  }
  return afterAdd(ctx, h, stylus, type, 'n', oepGone, extras);
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
  oepGone: boolean,
  extras: WandExtras,
): number {
  const { level, x, y } = h;
  const frosted = isIce(ctx, level, x, y);
  const isBlind = blind(ctx);
  let eow = false;
  const oep = oepGone ? null : engrAt(ctx, level, x, y);
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
  const adding = !oepGone && engrAt(ctx, level, x, y) !== null && !eow;
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
    {
      stage: 'text',
      stylus: stylusId,
      type,
      eow,
      ...extras,
    } satisfies EngraveAsk as unknown as Json,
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
    if (d.zapwand) {
      const wand = heroItem(ctx, stylusId);
      if (!blind(ctx) && wand)
        say(ctx, 'engr.glow_fade', { item: xnameOf(ctx.state, ctx.defs, wand) });
      return NORMAL_SPEED;
    }
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
  if (d.post) ctx.emit({ type: 'msg', ...d.post });
  if (d.doblind && !resistsBlnd(ctx, getPlayer(ctx.state))) {
    say(ctx, 'zap.blinded_flash');
    makeBlinded(ctx, ctx.rng.rnd(50), false);
    // `if (!Blind) Your1(vision_clears)`: the Eyes of the Overworld do not exist
  }
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
  const marker = !!stylus && stylus.def === MAGIC_MARKER && occ.type === 'mark';
  occ.actionct++;

  // Step 1: Compute rate.
  let rate =
    carving && stylus && (dullingWep || sdef?.class === 'ring' || sdef?.class === 'gem') ? 1 : 10;
  // one charge / 2 letters
  if (rate !== 1 && marker && stylus?.c.item) rate = Math.min(rate, stylus.c.item.spe * 2);

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
  } else if (marker && stylus?.c.item) {
    const it = stylus.c.item;
    let inkCost = Math.max(Math.trunc(rate / 2), 1); // Prevent infinite graffiti
    if (it.spe < inkCost) {
      // "overly dry marker valid for graffiti?"
      inkCost = it.spe;
      truncate = true;
    }
    it.spe -= inkCost;
    if (it.spe === 0) {
      // can't engrave any further; truncate the string
      say(ctx, 'engr.marker_dries');
      truncate = true;
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
    if (d.stage === 'wish') {
      // the wand of wishing's wish (makewish()), then doengrave() goes on
      answerWish(ctx, ENGRAVE_ID, value, raw as unknown as WishData);
      if (ctx.state.pendingPrompt) return 0;
      if (ctx.state.gameOver || !d.sfx) return NORMAL_SPEED;
      const wand = heroItem(ctx, d.stylus);
      return wand ? afterSfx(ctx, h, wand, d.sfx) : NORMAL_SPEED;
    }
    if (d.stage === 'add') {
      if (value === null) {
        // 'q'
        say(ctx, 'engr.never_mind');
        return 0;
      }
      return afterAdd(
        ctx,
        h,
        d.stylus ?? null,
        d.type ?? 'dust',
        value === true ? 'y' : 'n',
        false,
        {
          zapwand: d.zapwand ?? false,
          post: d.post ?? null,
          doblind: d.doblind ?? false,
        },
      );
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
        labelKey: e.def === TOWEL ? 'action.nh:engrave_with.towel' : 'action.nh:engrave_with',
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
