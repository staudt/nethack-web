// Object detection for the scrolls of gold and food detection, the potion of object detection
// and their spells, trap detection (a confused or cursed scroll of gold detection), magic
// mapping and the clairvoyance spell. What is found goes into the hero's object memory (and
// the trap list's `seen`), where it stays until the cell is seen again (NetHack shows it at
// once and lets the player browse the map).
// ref: src/detect.c o_in(), o_material(), check_map_spot(), clear_stale_map(), gold_detect(),
// food_detect(), object_detect(), sense_trap(), detect_obj_traps(), display_trap_map(),
// trap_detect(), do_mapping(), do_vicinity_map(), cvt_sdoor_to_door()
//
// Not ported (DEVIATIONS "Detection"): buried objects (none exist), mimics (none), the steed,
// the trapped-door and trapped-chest glyphs (a found chest trap is only known, `tknown`; a door
// trap is not shown), body parts of other forms ("feet", "nose" and "toes" always),
// observe_object() (every object is seen up close here), level `nommap` (no such level).
import {
  contents,
  getLevel,
  getPlayer,
  isItem,
  itemShownId,
  newMemory,
  sortedIds,
  topObjectEntities,
  type Buc,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type Level,
  type Msg,
  type ObjectClass,
} from '@nh/core';
import { boxTknown, doorTrapped, isBoxTrapped, setBoxTknown } from './btrapstate';
import { showMapSpot } from './detect';
import { mapInvisible } from './invis';
import { nhData } from './items';
import { strangeFeeling, useup } from './magic';
import { minvent } from './mongear';
import { canSpotMon } from './perception';
import { P, heroClairvoyant, hasProp } from './props';
import { T, setTerrain } from './terrain';
import { heroFormId } from './upoly';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const GOLD_PIECE: DefId = 'nh:gold_piece';
const GOLD_GOLEM: DefId = 'nh:gold_golem';

/**
 * The detecting object (C's sobj): a real scroll or potion (`item`, used up by a strange
 * feeling) or a spell's pseudo object (`item` null).
 */
export interface Detector {
  buc: Buc;
  cls: 'scroll' | 'potion' | 'spellbook';
  item: EntityId | null;
}

const heroAt = (ctx: Ctx, x: number, y: number): boolean => {
  const p = getPlayer(ctx.state).c.pos;
  return p?.x === x && p.y === y;
};

/** The floor objects of the hero's level, in id order (fobj). */
function floorObjects(ctx: Ctx, level: Level): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e && e.c.pos?.level === level.id && isItem(ctx.defs, e)) out.push(e);
  }
  return out;
}

/** The monsters of the hero's level but her, in id order (fmon). */
function levelMonsters(ctx: Ctx, level: Level): Entity[] {
  const out: Entity[] = [];
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.monster && id !== ctx.state.playerId && e.c.pos?.level === level.id) out.push(e);
  }
  return out;
}

/** The object or the first one inside it (recursively) of class `cls`. ref: o_in() */
function oIn(ctx: Ctx, obj: Entity, cls: ObjectClass): Entity | null {
  if (ctx.defs.object(obj.def).class === cls) return obj;
  for (const o of contents(ctx.state, obj.id)) {
    if (ctx.defs.object(o.def).class === cls) return o;
    const t = oIn(ctx, o, cls);
    if (t) return t;
  }
  return null;
}

/** The object or the first one inside it made of gold. ref: o_material(obj, GOLD) */
function oGold(ctx: Ctx, obj: Entity): Entity | null {
  if (ctx.defs.object(obj.def).material === 'gold') return obj;
  for (const o of contents(ctx.state, obj.id)) {
    if (ctx.defs.object(o.def).material === 'gold') return o;
    const t = oGold(ctx, o);
    if (t) return t;
  }
  return null;
}

/** ref: findgold(): the monster carries coins */
const findgold = (ctx: Ctx, mon: Entity): boolean =>
  minvent(ctx, mon.id).some((o) => ctx.defs.object(o.def).class === 'coin');

const memoryOf = (ctx: Ctx, level: Level): Record<string, DefId> =>
  (ctx.state.objectMemory[level.id] ??= {});

/** map_object(obj, 1) at (x, y): the object goes into her memory of that cell. */
function mapObject(ctx: Ctx, level: Level, obj: Entity | DefId, x: number, y: number): void {
  memoryOf(ctx, level)[String(y * level.width + x)] =
    typeof obj === 'string' ? obj : itemShownId(ctx.defs, ctx.state, obj);
}

/** A gold piece of `rnd(10)` coins mapped at a monster carrying gold (the count is drawn). */
function mapGold(ctx: Ctx, level: Level, x: number, y: number): void {
  ctx.rng.rnd(10); // gold.quan = (long) rnd(10): usually more than 1
  mapObject(ctx, level, GOLD_PIECE, x, y);
}

/** The class (and, for gold, material) of a remembered object id or appearance. */
function rememberedDef(ctx: Ctx, id: DefId): { cls: ObjectClass; gold: boolean } | null {
  if (ctx.defs.isObject(id)) {
    const d = ctx.defs.object(id);
    return { cls: d.class, gold: d.material === 'gold' };
  }
  const a = ctx.defs.appearances.find((x) => x.id === id);
  return a ? { cls: a.class, gold: false } : null;
}

/**
 * Forgets the remembered objects of interest that are no longer there: every remembered
 * object where nothing lies (and no monster carries anything) for `cls` 'all', else those of
 * the class (or, with `gold`, made of gold) with no such object on the cell or in the
 * inventory of a monster there. True when something was forgotten.
 * ref: src/detect.c clear_stale_map(), check_map_spot()
 */
function clearStaleMap(ctx: Ctx, level: Level, cls: ObjectClass | 'all', gold: boolean): boolean {
  const mem = ctx.state.objectMemory[level.id];
  if (!mem) return false;
  const floor = floorObjects(ctx, level);
  const mons = levelMonsters(ctx, level);
  let change = false;
  for (const k of Object.keys(mem).sort((a, b) => Number(a) - Number(b))) {
    const id = mem[k];
    const i = Number(k);
    const x = i % level.width;
    const y = (i - x) / level.width;
    if (x < 1 || id === undefined) continue;
    const here = floor.filter((o) => o.c.pos?.x === x && o.c.pos.y === y);
    const mon = mons.find((m) => m.c.pos?.x === x && m.c.pos.y === y);
    const carried = mon ? minvent(ctx, mon.id) : [];
    let stale = false;
    if (cls === 'all') stale = here.length === 0 && carried.length === 0;
    else {
      const r = rememberedDef(ctx, id);
      if (!r) continue;
      if (gold && r.gold)
        stale = !here.some((o) => oGold(ctx, o)) && !carried.some((o) => oGold(ctx, o));
      else if (r.cls === cls)
        stale = !here.some((o) => oIn(ctx, o, cls)) && !carried.some((o) => oIn(ctx, o, cls));
    }
    if (stale) {
      delete mem[k];
      change = true;
    }
  }
  return change;
}

// ---------------------------------------------------------------------------------------------
// gold

/**
 * Gold on the floor or carried by monsters (blessed: anything made of gold) is shown: "You feel
 * very greedy, and sense gold!" ("You notice some gold between your feet." when it is only
 * under her). Returns true when nothing was found and the detector was used up by the strange
 * feeling ("You feel materially poor.", worried with gold of her own, "like a million
 * zorkmids" as a gold golem). `known` is set when gold was found or stale gold forgotten.
 * ref: src/detect.c gold_detect()
 */
export function goldDetect(ctx: Ctx, sobj: Detector): { nothing: boolean; known: boolean } {
  const level = getLevel(ctx.state);
  const blessed = sobj.buc === 'blessed';
  const stale = clearStaleMap(ctx, level, 'coin', blessed);
  let known = stale;
  const matches = (o: Entity): boolean =>
    (blessed && oGold(ctx, o) !== null) || oIn(ctx, o, 'coin') !== null;
  let outgoldmap = false;
  // look for gold carried by monsters (might be in a container)
  for (const mon of levelMonsters(ctx, level)) {
    if (findgold(ctx, mon) || mon.def === GOLD_GOLEM || minvent(ctx, mon.id).some(matches)) {
      known = outgoldmap = true;
      break; // skip further searching
    }
  }
  // look for gold objects
  if (!outgoldmap)
    for (const o of floorObjects(ctx, level)) {
      if (!matches(o)) continue;
      known = true;
      if (!heroAt(ctx, o.c.pos?.x ?? -1, o.c.pos?.y ?? -1)) {
        outgoldmap = true;
        break;
      }
    }
  if (!known) {
    const h = getPlayer(ctx.state);
    const mine = minventHero(ctx, h);
    // no gold found on floor or monster's inventory; adjust message if she has gold
    const key =
      heroFormId(ctx.state) === GOLD_GOLEM
        ? 'detect.gold.million'
        : mine.coins || mine.hidden
          ? 'detect.gold.worried'
          : 'detect.gold.poor';
    strangeFeeling(ctx, sobj.item, key);
    return { nothing: true, known };
  }
  if (!outgoldmap) {
    // only under her: no separate display required
    say(ctx, 'detect.gold.between_feet');
    return { nothing: false, known };
  }
  // discover gold locations
  for (const o of floorObjects(ctx, level)) {
    const t = (blessed ? oGold(ctx, o) : null) ?? oIn(ctx, o, 'coin');
    if (t && o.c.pos) mapObject(ctx, level, t, o.c.pos.x, o.c.pos.y);
  }
  for (const mon of levelMonsters(ctx, level)) {
    const p = mon.c.pos;
    if (!p) continue;
    if (findgold(ctx, mon) || mon.def === GOLD_GOLEM) mapGold(ctx, level, p.x, p.y);
    else
      for (const o of minvent(ctx, mon.id)) {
        const t = (blessed ? oGold(ctx, o) : null) ?? oIn(ctx, o, 'coin');
        if (t) {
          mapObject(ctx, level, t, p.x, p.y);
          break;
        }
      }
  }
  say(ctx, 'detect.gold.greedy');
  return { nothing: false, known };
}

/** Her coins and gold hidden in her containers. ref: money_cnt(invent), hidden_gold(TRUE) */
function minventHero(ctx: Ctx, h: Entity): { coins: boolean; hidden: boolean } {
  const inv = minvent(ctx, h.id);
  const coins = inv.some((o) => ctx.defs.object(o.def).class === 'coin');
  const hidden = inv.some((o) => contents(ctx.state, o.id).some((c) => oIn(ctx, c, 'coin')));
  return { coins, hidden };
}

// ---------------------------------------------------------------------------------------------
// food

/**
 * Food (or, confused or cursed, potions: "something") on the level is shown: "Your nose tingles
 * and you smell food." (blessed: the nose starts or continues to tingle and she learns to tell
 * edible food, `uedibility`); only under her, "You smell food nearby."; none, "You sense a lack
 * of food nearby." after forgetting stale food, else the strange feeling "Your nose twitches."
 * Returns true when the detector was used up by that feeling. ref: src/detect.c food_detect()
 */
export function foodDetect(ctx: Ctx, sobj: Detector): { nothing: boolean; known: boolean } {
  const level = getLevel(ctx.state);
  const confused = hasProp(getPlayer(ctx.state), P.CONFUSION) || sobj.buc === 'cursed';
  const cls: ObjectClass = confused ? 'potion' : 'food';
  const what = { key: confused ? 'detect.something' : 'detect.food' };
  const blessed = sobj.buc === 'blessed';
  const d = nhData(ctx);
  const stale = clearStaleMap(ctx, level, cls, false);
  let ct = 0;
  let ctu = 0;
  for (const o of floorObjects(ctx, level))
    if (oIn(ctx, o, cls)) {
      if (heroAt(ctx, o.c.pos?.x ?? -1, o.c.pos?.y ?? -1)) ctu++;
      else ct++;
    }
  for (const mon of levelMonsters(ctx, level)) {
    if (ct && ctu) break;
    if (minvent(ctx, mon.id).some((o) => oIn(ctx, o, cls))) {
      if (heroAt(ctx, mon.c.pos?.x ?? -1, mon.c.pos?.y ?? -1)) ctu++;
      else ct++;
    }
  }
  if (!ct && !ctu) {
    const known = stale && !confused;
    if (stale) {
      say(ctx, 'detect.food.lack', { what });
      if (blessed) {
        if (!d.uedibility) say(ctx, 'detect.food.nose_tingle');
        d.uedibility = true;
      }
      return { nothing: false, known };
    }
    if (blessed && !d.uedibility) {
      // flags.beginner = FALSE: the feeling is always told
      say(ctx, 'detect.food.twitches_tingle');
      if (sobj.item !== null) useup(ctx, sobj.item);
      d.uedibility = true;
    } else strangeFeeling(ctx, sobj.item, 'detect.food.twitches');
    return { nothing: true, known };
  }
  if (!ct) {
    say(ctx, 'detect.food.nearby', { what });
    if (blessed) {
      if (!d.uedibility) say(ctx, 'detect.food.nose_tingle');
      d.uedibility = true;
    }
    return { nothing: false, known: true };
  }
  for (const o of floorObjects(ctx, level)) {
    const t = oIn(ctx, o, cls);
    if (t && o.c.pos) mapObject(ctx, level, t, o.c.pos.x, o.c.pos.y);
  }
  for (const mon of levelMonsters(ctx, level)) {
    const p = mon.c.pos;
    if (!p) continue;
    for (const o of minvent(ctx, mon.id)) {
      const t = oIn(ctx, o, cls);
      if (t) {
        mapObject(ctx, level, t, p.x, p.y);
        break; // skip rest of this monster's inventory
      }
    }
  }
  if (blessed) {
    say(ctx, d.uedibility ? 'detect.food.continues_smell' : 'detect.food.starts_smell', { what });
    d.uedibility = true;
  } else say(ctx, 'detect.food.tingles_smell', { what });
  return { nothing: false, known: true };
}

// ---------------------------------------------------------------------------------------------
// objects

/**
 * Every object on the level is shown (the top of each pile, the first item a monster carries,
 * a gold piece for a monster with gold): "You detect the presence of objects." ("absence" when
 * only stale memories were forgotten; "something" when hallucinating). Only under her: "You
 * sense objects nearby."; nothing: the strange feeling "You feel a lack of something." (true:
 * the detector was used up). ref: src/detect.c object_detect() with class 0
 */
export function objectDetect(ctx: Ctx, detector: Detector | null): boolean {
  const level = getLevel(ctx.state);
  const stuff = {
    key: hasProp(getPlayer(ctx.state), P.HALLUC) ? 'detect.something' : 'detect.objects',
  };
  let ct = 0;
  let ctu = 0;
  for (const o of floorObjects(ctx, level)) {
    if (heroAt(ctx, o.c.pos?.x ?? -1, o.c.pos?.y ?? -1)) ctu++;
    else ct++;
  }
  for (const mon of levelMonsters(ctx, level)) {
    ct += minvent(ctx, mon.id).length;
    // (no mimics for a cursed detector)
    if (findgold(ctx, mon)) {
      ct++;
      break;
    }
  }
  if (!clearStaleMap(ctx, level, 'all', false) && !ct) {
    if (!ctu) {
      if (detector) strangeFeeling(ctx, detector.item, 'detect.objects.lack');
      return true;
    }
    say(ctx, 'detect.objects.nearby', { stuff });
    return false;
  }
  // the top object of each pile (floor objects, then monsters' override them)
  const top = topObjectEntities(ctx.defs, ctx.state, level);
  for (const [i, o] of [...top].sort((a, b) => a[0] - b[0]))
    mapObject(ctx, level, o, i % level.width, Math.trunc(i / level.width));
  for (const mon of levelMonsters(ctx, level)) {
    const p = mon.c.pos;
    if (!p) continue;
    const first = minvent(ctx, mon.id)[0];
    if (first) mapObject(ctx, level, first, p.x, p.y);
    if (findgold(ctx, mon)) mapGold(ctx, level, p.x, p.y);
  }
  say(ctx, ct ? 'detect.objects.presence' : 'detect.objects.absence', { stuff });
  return false;
}

// ---------------------------------------------------------------------------------------------
// traps

/** The trapped boxes among `objs` (and inside them): where they are. ref: detect_obj_traps() */
function trappedBoxes(
  ctx: Ctx,
  objs: readonly Entity[],
  at: { x: number; y: number } | null,
  out: { e: Entity; x: number; y: number }[],
): void {
  for (const o of objs) {
    const p = at ?? o.c.pos;
    if (!p) continue;
    if (isBoxTrapped(ctx.state, o.id)) out.push({ e: o, x: p.x, y: p.y });
    const inside = contents(ctx.state, o.id);
    if (inside.length) trappedBoxes(ctx, inside, p, out);
  }
}

/**
 * A trap is sensed: a hallucinating hero or a cursed source sees a fake object there (a gold
 * piece, or a random object), else the trap is seen. ref: src/detect.c sense_trap()
 */
function senseTrap(
  ctx: Ctx,
  level: Level,
  x: number,
  y: number,
  cursed: boolean,
  trap: { seen: boolean } | null,
): void {
  if (hasProp(getPlayer(ctx.state), P.HALLUC) || cursed) {
    const halluc = hasProp(getPlayer(ctx.state), P.HALLUC);
    // random_object(rn2) when hallucinating
    const objs = ctx.defs.objects;
    const def = halluc ? (objs[ctx.rng.rn2(objs.length)] ?? objs[0]) : ctx.defs.object(GOLD_PIECE);
    if (!def) return;
    if (def.id === GOLD_PIECE) ctx.rng.rnd(10);
    else if (def.merge) ctx.rng.rnd(2);
    ctx.rng.rn2(ctx.defs.monsters.length); // obj.corpsenm = random_monster(rn2)
    mapObject(ctx, level, def.id, x, y);
  } else if (trap) trap.seen = true;
}

/**
 * The trap map: chest traps, then the floor traps, then the door traps, are sensed; "You feel
 * entrapped." ("very greedy" for a cursed source). ref: src/detect.c display_trap_map()
 */
function displayTrapMap(
  ctx: Ctx,
  level: Level,
  cursed: boolean,
  boxes: { e: Entity; x: number; y: number }[],
): void {
  for (const b of boxes) senseTrap(ctx, level, b.x, b.y, cursed, null);
  for (const t of level.traps) senseTrap(ctx, level, t.x, t.y, cursed, t);
  for (let i = 0; i < level.cells.length; i++) {
    const x = i % level.width;
    const y = (i - x) / level.width;
    if (doorTrapped(ctx, level.id, x, y)) senseTrap(ctx, level, x, y, cursed, null);
  }
  say(ctx, cursed ? 'detect.trap.greedy' : 'detect.trap.entrapped');
}

/**
 * Traps on the level (floor traps, trapped boxes anywhere, trapped doors) are sensed when any is
 * away from her; only under her: "Your toes itch."; none: the strange feeling "Your toes stop
 * itching." (true: the detector was used up). A found trapped box becomes known (`tknown`).
 * ref: src/detect.c trap_detect()
 */
export function trapDetect(ctx: Ctx, sobj: Detector): boolean {
  const level = getLevel(ctx.state);
  const cursed = sobj.buc === 'cursed';
  const hp = getPlayer(ctx.state).c.pos;
  const there = (x: number, y: number): boolean => !(hp && hp.x === x && hp.y === y);
  const boxes: { e: Entity; x: number; y: number }[] = [];
  trappedBoxes(ctx, floorObjects(ctx, level), null, boxes);
  for (const mon of levelMonsters(ctx, level))
    if (mon.c.pos) trappedBoxes(ctx, minvent(ctx, mon.id), mon.c.pos, boxes);
  if (hp) trappedBoxes(ctx, minvent(ctx, ctx.state.playerId), hp, boxes);
  for (const b of boxes) if (!boxTknown(ctx.state, b.e.id)) setBoxTknown(ctx, b.e.id, true);
  let found = false;
  let away = false;
  for (const t of level.traps) {
    if (there(t.x, t.y)) away = true;
    found = true;
  }
  for (const b of boxes) {
    if (there(b.x, b.y)) away = true;
    found = true;
  }
  for (let i = 0; i < level.cells.length && !away; i++) {
    const x = i % level.width;
    const y = (i - x) / level.width;
    if (!doorTrapped(ctx, level.id, x, y)) continue;
    if (there(x, y)) away = true;
    found = true;
  }
  if (away) {
    displayTrapMap(ctx, level, cursed, boxes);
    return false;
  }
  if (!found) {
    strangeFeeling(ctx, sobj.item, 'detect.trap.stop_itching');
    return true;
  }
  // traps exist, but only under her
  say(ctx, 'detect.trap.toes_itch');
  return false;
}

// ---------------------------------------------------------------------------------------------
// mapping

/** The whole level goes into her memory (confused: 1 cell in 7). ref: src/detect.c do_mapping() */
export function doMapping(ctx: Ctx, confused: boolean): void {
  const level = getLevel(ctx.state);
  for (let x = 1; x < level.width; x++)
    for (let y = 0; y < level.height; y++) showMapSpot(ctx, level, x, y, confused);
}

/** Every secret door of the level becomes a door. ref: cvt_sdoor_to_door() over the level */
export function revealSecretDoors(ctx: Ctx): void {
  const level = getLevel(ctx.state);
  for (let i = 0; i < level.cells.length; i++) {
    const id = level.palette[level.cells[i] ?? 0];
    const x = i % level.width;
    const y = (i - x) / level.width;
    if (x < 1) continue;
    if (id === T.sdoor_locked_v || id === T.sdoor_locked_h) setTerrain(level, x, y, T.door_locked);
    else if (id === T.sdoor_v || id === T.sdoor_h) setTerrain(level, x, y, T.door_closed);
  }
}

/**
 * The spell of clairvoyance: the area around her (9 columns left, 10 right, 5 rows up, 6 down)
 * is mapped with the top object of each pile; a monster there she cannot spot is remembered as
 * `I`, and with `extended` (Skilled, or already clairvoyant) "You sense your surroundings."
 * when one was new to the map. ref: src/detect.c do_vicinity_map() with a spellbook
 */
export function doVicinityMapSpell(ctx: Ctx, blessed: boolean): void {
  const h = getPlayer(ctx.state);
  const pos = h.c.pos;
  if (!pos) return;
  const level = getLevel(ctx.state);
  const extended = blessed || heroClairvoyant(ctx.state);
  const loY = Math.max(pos.y - 5, 0);
  const hiY = pos.y + 6 >= level.height ? level.height - 1 : pos.y + 6;
  const loX = Math.max(pos.x - 9, 1);
  const hiX = pos.x + 10 >= level.width ? level.width - 1 : pos.x + 10;
  const cnf = hasProp(h, P.CONFUSION);
  const monMem = (ctx.state.monsterMemory[level.id] ??= {});
  ctx.state.memory[level.id] ??= newMemory(level);
  const top = topObjectEntities(ctx.defs, ctx.state, level);
  const mons = levelMonsters(ctx, level);
  let mdetected = false;
  for (let x = loX; x <= hiX; x++)
    for (let y = loY; y <= hiY; y++) {
      const i = y * level.width + x;
      const old = monMem[String(i)];
      showMapSpot(ctx, level, x, y, cnf);
      // if there are any objects here, see the top one
      const o = top.get(i);
      if (o) mapObject(ctx, level, o, x, y);
      const mon = mons.find((m) => m.c.pos?.x === x && m.c.pos.y === y);
      if (mon) {
        if (extended && old !== mon.def) mdetected = true;
        // map_monst(), then the remembered, unseen monster for those she can't spot
        if (!heroAt(ctx, x, y) && !canSpotMon(ctx, mon)) mapInvisible(ctx, x, y);
      }
    }
  if (mdetected) say(ctx, 'detect.sense_surroundings');
}
