// Mimics: the disguise a mimic takes where it stands, and the hero stumbling onto one ("Wait!
// That's a giant mimic!"), which reveals it and may stick her to it. The disguise itself is
// mimicstate.ts's; the `nh:mimicry` perception (perception.ts) draws it.
// ref: src/makemon.c set_mimic_sym(); src/uhitm.c that_is_a_mimic(), stumble_onto_mimic();
// src/lock.c stumble_on_door_mimic(); src/mon.c wakeup()
//
// Not ported: the rogue level's wall disguise (no rogue level), Protection_from_shape_changers
// (no such ring), the slime mold's fruit name, the light blocking of a boulder or door disguise
// (DEVIATIONS.md "Mimics").
import {
  allContents,
  getPlayer,
  inTown,
  itemsAt,
  roomHas,
  trapAt,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Msg,
  type ObjectClass,
} from '@nh/core';
import { canBeHatched } from './eggstate';
import { setUstuck, ustuck } from './hackmove';
import { canseemon, mapInvisible, markedUnseen, monInvisible, seeInvisible } from './invis';
import { levelFlags } from './levelflags';
import { mkobj, rndmonnum } from './mkobj';
import { isFleeing } from './monflee';
import { isFrozen } from './mstate';
import { canSpotMon, monNam, telepathSenses } from './perception';
import { P, heroHas } from './props';
import { getShopItem, shopType } from './shknam';
import { isSokoban } from './sokoban';
import { STATUE } from './statuestate';
import { T, isSdoorId, isWallId, terrainIdAt } from './terrain';
import {
  GRAVE,
  STRANGE_OBJECT,
  isDoorMappear,
  mappearance,
  registerSetMimicSym,
  seemimic,
  setMappearance,
  type MAppear,
} from './mimicstate';

export * from './mimicstate';

const ZOO: DefId = 'nh:zoo';
const VAULT: DefId = 'nh:vault';
const DELPHI: DefId = 'nh:delphi';
const TEMPLE: DefId = 'nh:temple';
const FODDERSHOP: DefId = 'nh:health_food_shop';
const GOLD_PIECE: DefId = 'nh:gold_piece';
const BOULDER: DefId = 'nh:boulder';
const LUMP_OF_ROYAL_JELLY: DefId = 'nh:lump_of_royal_jelly';
const SLIME_MOLD: DefId = 'nh:slime_mold';
const MINES: DefId = 'nh:mines';
/** S_altar before its alignment is rolled (never stored) */
const ALTAR: DefId = 'nh:altar';
/** The stand-in for the player monsters (zoo.ts mkTtObject() does the same). */
const HUMAN: DefId = 'nh:human';

/** One entry of syms[]: an object class, MAXOCLASSES (furniture) or S_MIMIC_DEF (strange). */
type Sym = ObjectClass | 'furniture' | 'strange';

/** ref: src/makemon.c syms[] */
const SYMS: readonly Sym[] = [
  'furniture',
  'furniture',
  'ring',
  'wand',
  'weapon',
  'food',
  'coin',
  'scroll',
  'potion',
  'armor',
  'amulet',
  'tool',
  'rock',
  'gem',
  'spellbook',
  'strange',
  'strange',
];

/** ref: set_mimic_sym() furnsyms[]: S_upstair x2, S_dnstair x2, S_altar, S_grave, S_throne, S_sink */
const FURNSYMS: readonly DefId[] = [
  T.stairs_up,
  T.stairs_up,
  T.stairs_down,
  T.stairs_down,
  ALTAR,
  GRAVE,
  T.throne,
  T.sink,
];

/** ref: include/align.h Align2amask(): -1 chaotic, 0 neutral, 1 lawful */
const ALTAR_BY_ALIGN: Readonly<Record<number, DefId>> = {
  [-1]: 'nh:altar_chaotic',
  0: 'nh:altar_neutral',
  1: 'nh:altar_lawful',
};

/**
 * The otyp of a throwaway object of class `cls`, made with its init rolls (and entity id) and
 * removed at once, as C's `mkobj(s_sym, FALSE)` + obfree() (decision 11): the random draws stay
 * C's. A class with nothing to make gives the strange object.
 */
function throwawayOtyp(ctx: Ctx, cls: ObjectClass, level: string, inMklev: boolean): DefId {
  const oid = mkobj(ctx, cls, { artif: false, level, inMklev });
  if (oid === null) return STRANGE_OBJECT;
  const def = ctx.state.entities[String(oid)]?.def ?? STRANGE_OBJECT;
  // obfree(): the object, its contents and their timers (egg hatching, corpse rot) go
  const gone = new Set<number>([oid, ...allContents(ctx.state, oid)]);
  ctx.state.timers = ctx.state.timers.filter((t) => {
    const id = (t.data as { id?: unknown } | null)?.id;
    return !(typeof id === 'number' && gone.has(id));
  });
  ctx.remove(oid);
  return def;
}

/**
 * Picks the mimic's disguise for where it stands: the top object there; a closed door on a
 * door, wall, secret door or secret corridor square; on maze levels (not the Mines' towns or
 * Sokoban) a statue half the time; outside rooms a boulder (unless on a trap); gold in zoos and
 * vaults; a statue or fountain in Delphi; an altar in temples; in shops, the strange object when
 * `rn2(10) >= depth`, else one of the shop's kinds; elsewhere a roll from syms[]: furniture, a
 * kind of object of a class (a throwaway object is made for it), gold or the strange object. A
 * statue, figurine, corpse, egg or tin shape gets a random monster (rndmonnum()); an altar an
 * alignment. ref: src/makemon.c set_mimic_sym()
 */
function setMimicSymImpl(ctx: Ctx, id: EntityId, inMklev: boolean): void {
  const mon = ctx.state.entities[String(id)];
  const p = mon?.c.pos;
  if (!mon?.c.monster || !p) return;
  const level = ctx.state.levels[p.level];
  if (!level) return;
  const { x, y } = p;
  const typ = terrainIdAt(level, x, y);
  // only valid for INSIDE of room
  let roomno = -1;
  for (let r = 0; r < level.rooms.length; r++)
    if (roomHas(level, r, x, y)) {
      roomno = r;
      break;
    }
  const rt = roomno >= 0 ? level.rooms[roomno]?.type : undefined;
  const depth = level.depth;
  const hero = getPlayer(ctx.state).c.pos;
  const top = itemsAt(ctx.defs, ctx.state, level.id, x, y)[0];

  let ap: MAppear | null = null;
  let sSym: Sym | null = null;
  if (top) {
    ap = { type: 'object', id: top.def };
  } else if (
    (typ !== undefined && ctx.defs.terrain(typ).door !== undefined) ||
    isWallId(typ) ||
    isSdoorId(typ) ||
    typ === T.scorr
  ) {
    // a horizontal or vertical closed door: both are drawn `+` here
    ap = { type: 'furniture', id: T.door_closed };
  } else if (
    levelFlags(ctx, level).maze === true &&
    !(level.dungeon === MINES && !!hero && inTown(level, hero.x, hero.y)) &&
    !isSokoban(level) &&
    ctx.rng.rn2(2)
  ) {
    ap = { type: 'object', id: STATUE };
  } else if (roomno < 0 && !trapAt(level, x, y)) {
    ap = { type: 'object', id: BOULDER };
  } else if (rt === ZOO || rt === VAULT) {
    ap = { type: 'object', id: GOLD_PIECE };
  } else if (rt === DELPHI) {
    ap = ctx.rng.rn2(2) ? { type: 'object', id: STATUE } : { type: 'furniture', id: T.fountain };
  } else if (rt === TEMPLE) {
    ap = { type: 'furniture', id: ALTAR };
  } else {
    // (beehives, morgues, barracks and throne rooms "shouldn't contain too many mimics anyway")
    const shp = shopType(rt);
    if (!shp) sSym = SYMS[ctx.rng.rn2(SYMS.length)] ?? 'strange';
    else if (ctx.rng.rn2(10) >= depth) sSym = 'strange';
    else {
      const item = getShopItem(ctx, shp);
      if (typeof item === 'object') ap = { type: 'object', id: item.def };
      else if (item === 'veggy' && rt === FODDERSHOP) {
        // the health food store's vegetarian pseudo-class: royal jelly or a slime mold (there
        // is no slime mold here: the jelly stands in, DEVIATIONS.md "Mimics")
        const jelly = ctx.rng.rn2(2) !== 0;
        ap = {
          type: 'object',
          id: jelly || !ctx.defs.isObject(SLIME_MOLD) ? LUMP_OF_ROYAL_JELLY : SLIME_MOLD,
        };
      } else if (item === 'random' || item === 'veggy')
        sSym = SYMS[ctx.rng.rn2(SYMS.length - 2) + 2] ?? 'strange';
      else sSym = item;
    }
    // assign_sym:
    if (sSym === 'furniture')
      ap = { type: 'furniture', id: FURNSYMS[ctx.rng.rn2(FURNSYMS.length)] ?? T.stairs_up };
    else if (sSym === 'strange') ap = { type: 'object', id: STRANGE_OBJECT };
    else if (sSym === 'coin') ap = { type: 'object', id: GOLD_PIECE };
    else if (sSym !== null)
      ap = { type: 'object', id: throwawayOtyp(ctx, sSym, level.id, inMklev) };
  }
  ap ??= { type: 'object', id: STRANGE_OBJECT };

  // when appearing as an object based on a monster type, pick a shape
  if (
    ap.type === 'object' &&
    (ap.id === STATUE ||
      ap.id === 'nh:figurine' ||
      ap.id === 'nh:corpse' ||
      ap.id === 'nh:egg' ||
      ap.id === 'nh:tin')
  ) {
    let mndx: DefId | null = rndmonnum(ctx, depth).id;
    const nocorpse = ctx.defs.monster(mndx).genFlags.includes('nocorpse');
    if (ap.id === 'nh:corpse' && nocorpse) {
      ctx.rng.rn2(13); // rn1(PM_WIZARD - PM_ARCHEOLOGIST + 1, PM_ARCHEOLOGIST): no player monsters
      mndx = HUMAN;
    } else if (
      (ap.id === 'nh:egg' && canBeHatched(ctx, mndx) === null) ||
      (ap.id === 'nh:tin' && nocorpse)
    )
      mndx = null; // revert to generic egg or empty tin
    if (mndx !== null) ap = { ...ap, corpseOf: mndx };
  } else if (ap.type === 'furniture' && ap.id === ALTAR) {
    const algn = ctx.rng.rn2(3) - 1; // -1 (A_Cha) or 0 (A_Neu) or +1 (A_Law); not in Gehennom
    ap = { type: 'furniture', id: ALTAR_BY_ALIGN[algn] ?? 'nh:altar_neutral' };
  }
  setMappearance(ctx, id, ap);
}

registerSetMimicSym(setMimicSymImpl);

/** The mimic's name for the "That's ..." lines: "a giant mimic", "a sleeping giant mimic". */
function whatName(ctx: Ctx, mon: Entity): Msg {
  const ap = mappearance(ctx, mon.id);
  if (monInvisible(ctx, mon) && !seeInvisible(ctx.state)) return { key: 'mimic.a_monster' };
  const name = monNam(ctx, mon);
  // BUG (C's): this will misclassify a paralyzed mimic as sleeping
  if (
    ap &&
    ap.type !== 'monster' &&
    ctx.defs.monster(mon.def).glyph.ch === 'm' &&
    (mon.c.monster?.asleep === true || isFrozen(ctx, mon.id))
  )
    return { key: 'mimic.a_sleeping', params: { mon: name } };
  return { key: 'mimic.a', params: { mon: name } };
}

/**
 * "Wait!  That's a giant mimic!", told after what her map shows there: "That closed door actually
 * is a giant mimic!", "That dagger is a giant mimic!" ("Those gold pieces are ..."), "Wait!  That
 * jackal is really a giant mimic!"; blind, "Wait!  That's a monster!" (nothing with telepathy,
 * unless it posed as a monster). With `reveal`, it stops pretending. ref: src/uhitm.c
 * that_is_a_mimic()
 */
export function thatIsAMimic(ctx: Ctx, mon: Entity, reveal: boolean): void {
  const ap = mappearance(ctx, mon.id);
  const p = mon.c.pos;
  let msg: Msg | null = null;
  if (heroHas(ctx.state, P.BLINDED)) {
    if (!telepathSenses(ctx.state, ctx.defs, mon))
      msg = { key: 'mimic.wait_thats', params: { what: { key: 'mimic.a_monster' } } };
    else if (ap?.type === 'monster')
      msg = {
        key: 'mimic.wait_thats',
        params: { what: { key: 'mimic.a', params: { mon: monNam(ctx, mon) } } },
      };
  } else {
    const what = whatName(ctx, mon);
    // glyph_at(x, y): what her map shows there (the remembered disguise)
    const level = p ? ctx.state.levels[p.level] : undefined;
    const shown =
      p && level ? ctx.state.monsterMemory[p.level]?.[String(p.y * level.width + p.x)] : undefined;
    if (shown !== undefined && ctx.defs.terrains.some((t) => t.id === shown)) {
      msg =
        ap?.type === 'furniture'
          ? { key: 'mimic.furniture_is', params: { thing: `@${shown}`, what } }
          : { key: 'mimic.wait_thats', params: { what } };
    } else if (shown !== undefined && (ctx.defs.isObject(shown) || shown === STRANGE_OBJECT)) {
      msg = {
        key: shown === GOLD_PIECE ? 'mimic.objects_are' : 'mimic.object_is',
        params: { obj: `@${shown}`, what },
      };
    } else if (shown !== undefined && ctx.defs.isAppearance(shown) && !ctx.defs.isMonster(shown)) {
      // an unidentified object's description, or a statue drawn as its monster
      const obj = shown.startsWith('nh:statue-') ? STATUE : shown;
      msg = { key: 'mimic.object_is', params: { obj: `@${obj}`, what } };
    } else if (shown !== undefined && ctx.defs.isMonster(shown)) {
      msg = { key: 'mimic.wait_that_is_really', params: { shown: `@${shown}`, what } };
    } else msg = { key: 'mimic.wait_thats', params: { what } };
  }
  if (msg) ctx.emit({ type: 'msg', ...msg });
  if (reveal) seemimic(ctx, mon.id);
}

/**
 * The hero bumps into (or tries to open, close or unlock) a disguised mimic: "Wait!  That's a
 * giant mimic!", it is revealed, a sticky one next to her that is not fleeing holds her, and it
 * wakes; if she still can't spot it the `I` goes there. ref: src/uhitm.c stumble_onto_mimic()
 */
export function stumbleOntoMimic(ctx: Ctx, mon: Entity): void {
  thatIsAMimic(ctx, mon, true);
  stickIfSticky(ctx, mon);
  wakeupMimic(ctx, mon);
  // if hero is blind, wakeup() won't display the monster even though it's no longer concealed
  const p = mon.c.pos;
  if (p && !canSpotMon(ctx, mon) && !markedUnseen(ctx, p.x, p.y)) mapInvisible(ctx, p.x, p.y);
}

/**
 * `!u.ustuck && !mtmp->mflee && dmgtype(mtmp->data, AD_STCK) && m_next2u(mtmp)`: set_ustuck().
 * ref: src/uhitm.c stumble_onto_mimic(), attack_checks()
 */
export function stickIfSticky(ctx: Ctx, mon: Entity): void {
  const hp = getPlayer(ctx.state).c.pos;
  const p = mon.c.pos;
  if (
    ustuck(ctx) === null &&
    !isFleeing(ctx, mon.id) &&
    ctx.defs.monster(mon.def).attacks.some((a) => a.ad === 'stck') &&
    !!hp &&
    !!p &&
    hp.level === p.level &&
    Math.max(Math.abs(hp.x - p.x), Math.abs(hp.y - p.y)) <= 1
  )
    setUstuck(ctx, mon.id);
}

/**
 * wakeup(mtmp, FALSE): "<mon> wakes up." when she sees it asleep, it wakes, and a mimic comes out
 * of hiding (not one posing as a monster). ref: src/mon.c wakeup(), wake_msg()
 */
function wakeupMimic(ctx: Ctx, mon: Entity): void {
  const m = mon.c.monster;
  if (!m) return;
  if (m.asleep && canseemon(ctx, mon))
    ctx.emit({ type: 'msg', key: 'mon.wakes_up_calm', params: { mon: monNam(ctx, mon) } });
  m.asleep = false;
  if (mappearance(ctx, mon.id)?.type !== 'monster') seemimic(ctx, mon.id);
}

/**
 * Opening, closing or unlocking a "door" that is a mimic: she stumbles onto it. True when there
 * was one. ref: src/lock.c stumble_on_door_mimic()
 */
export function stumbleOnDoorMimic(ctx: Ctx, mon: Entity | null | undefined): boolean {
  if (!mon || !isDoorMappear(ctx, mon.id)) return false;
  stumbleOntoMimic(ctx, mon);
  return true;
}
