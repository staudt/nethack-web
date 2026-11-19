import {
  cellIndex,
  inBounds,
  okCharacter,
  canonicalJson,
  inRooms,
  isPlainFloor,
  sortedIds,
  type DefId,
  type EquipSlot,
  type GameState,
  type ItemComponent,
  type ObjectDef,
  type Pos,
  type Registry,
} from '@nh/core';

/** Options of {@link checkInvariants}. */
export interface InvariantOpts {
  /**
   * Levels whose doors were already checked: they are skipped, and each level checked is added.
   * A long run passes one set, so the doors are checked as the level was made, not after the hero
   * dug through its walls (a pick-axe, a wand of digging or a tunnelling dwarf leaves doors
   * without walls, or a dug wall corner as an empty doorway, as in C).
   */
  doorsChecked?: Set<string>;
  /**
   * Wall-walkers and oozers seen at earlier observations (see {@link WallwalkRecord}). A long run
   * passes one record, so a monster polymorphed out of a wall-walking form inside stone, a wall
   * or a door (C's newcham() leaves it there; it can only step out) is not reported while it
   * stays put, nor the objects it drops or leaves there when it dies; the same for an amorphous
   * form under a door.
   */
  wallwalk?: WallwalkRecord;
}

/**
 * What {@link noteWallwalkers} remembers between observations: the monsters whose form at the
 * last one passes walls (`walls`) or oozes under doors (`doors`, amorphous); and every blocked
 * square where such a monster, or one that just changed out of such a form, was seen: `spots`
 * (`id@level:x,y`, where that monster may stay) and `cells` (`level:x,y`, where objects may lie).
 */
export interface WallwalkRecord {
  walls: Set<string>;
  doors: Set<string>;
  spots: Set<string>;
  cells: Set<string>;
}

/** An empty {@link WallwalkRecord}. */
export function wallwalkRecord(): WallwalkRecord {
  return { walls: new Set(), doors: new Set(), spots: new Set(), cells: new Set() };
}

/** Whether the terrain under `p` blocks a creature, and whether it is a door. */
function blockedAt(
  state: GameState,
  registry: Registry,
  p: Pos & { level: string },
): { blocked: boolean; door: boolean; pal: string | undefined } {
  const lv = state.levels[p.level];
  if (!lv || !inBounds(lv, p.x, p.y)) return { blocked: false, door: false, pal: undefined };
  const pal = lv.palette[lv.cells[cellIndex(lv, p.x, p.y)] ?? -1];
  const known = pal !== undefined && registry.hasTerrain(pal);
  return {
    blocked: !known || !registry.terrain(pal).passable,
    door: known && registry.terrain(pal).door !== undefined,
    pal,
  };
}

/** A monster's form passes walls (a xorn, a ghost) or oozes under doors (amorphous). */
function passes(registry: Registry, def: string): { wall: boolean; door: boolean } {
  if (!registry.isMonster(def as never)) return { wall: false, door: false };
  const f = registry.monster(def as never).flags;
  return { wall: f.includes('wallwalk'), door: f.includes('amorphous') };
}

/**
 * One observation of the wall-walkers and oozers for {@link WallwalkRecord}. A monster on a
 * blocked square that its form passes, or that the form it had at the last observation passed,
 * marks its spot and cell; then the forms are remembered. The soak observes at every check; a
 * soak whose mods change forms often also calls this at the end of every turn (one step can span
 * many turns while the hero is helpless), passing the same record to `soak()`.
 * ref: src/mon.c newcham() (no relocation: maybe_set_terrain_effects() only handles liquids),
 * mfndpos() (ALLOW_WALL, amorphous under doors)
 */
export function noteWallwalkers(state: GameState, registry: Registry, ww: WallwalkRecord): void {
  const walls = new Set<string>();
  const doors = new Set<string>();
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (!e?.c.monster || !p) continue;
    const key = String(id);
    const now = passes(registry, e.def);
    if (now.wall) walls.add(key);
    if (now.door) doors.add(key);
    const at = blockedAt(state, registry, p);
    if (!at.blocked) continue;
    const wall = now.wall || ww.walls.has(key);
    const door = at.door && (now.door || ww.doors.has(key));
    if (!wall && !door) continue;
    ww.spots.add(`${key}@${p.level}:${p.x},${p.y}`);
    ww.cells.add(`${p.level}:${p.x},${p.y}`);
  }
  ww.walls = walls;
  ww.doors = doors;
}

/**
 * Lit objects (m19): every one but a magic lamp has a live burn record (`modData.nh.burn[id]`)
 * whose timer is pending, and none is inside a container (snuff_lit() when put away).
 * ref: src/timeout.c begin_burn(), src/pickup.c in_container()
 */
function checkLight(state: GameState, ids: readonly number[], errs: string[]): void {
  const burn = (state.modData['nh'] as { burn?: Record<string, { due: number; tok: number }> })
    ?.burn;
  for (const id of ids) {
    const e = state.entities[String(id)];
    const it = e?.c.item;
    if (!e || !it?.lit) continue;
    if (it.containedIn !== undefined) errs.push(`item ${id}: lit inside a container`);
    if (e.def === 'nh:magic_lamp') continue;
    const rec = burn?.[String(id)];
    if (!rec) {
      errs.push(`item ${id} (${e.def}): lit without a burn record`);
      continue;
    }
    const live = state.timers.some((t) => {
      const d = t.data as { item?: unknown; tok?: unknown } | null;
      return t.kind === 'nh:burn_object' && d?.item === id && d.tok === rec.tok;
    });
    if (!live) errs.push(`item ${id} (${e.def}): its burn timer is not pending`);
  }
}

/**
 * The vanilla artifact table's rows and their base objects (content's artilist.ts ARTIFACTS, in
 * table order; testkit's src may not import content, a test keeps the two equal).
 */
export const ARTIFACT_BASES: Readonly<Record<string, string>> = {
  'nh:excalibur': 'nh:long_sword',
  'nh:stormbringer': 'nh:runesword',
  'nh:mjollnir': 'nh:war_hammer',
  'nh:cleaver': 'nh:battle_axe',
  'nh:grimtooth': 'nh:orcish_dagger',
  'nh:orcrist': 'nh:elven_broadsword',
  'nh:sting': 'nh:elven_dagger',
  'nh:magicbane': 'nh:athame',
  'nh:frost_brand': 'nh:long_sword',
  'nh:fire_brand': 'nh:long_sword',
  'nh:dragonbane': 'nh:broadsword',
  'nh:demonbane': 'nh:silver_mace',
  'nh:werebane': 'nh:silver_saber',
  'nh:grayswandir': 'nh:silver_saber',
  'nh:giantslayer': 'nh:long_sword',
  'nh:ogresmasher': 'nh:war_hammer',
  'nh:trollsbane': 'nh:morning_star',
  'nh:vorpal_blade': 'nh:long_sword',
  'nh:snickersnee': 'nh:katana',
  'nh:sunsword': 'nh:long_sword',
  'nh:heart_of_ahriman': 'nh:luckstone',
  'nh:sceptre_of_might': 'nh:mace',
  'nh:staff_of_aesculapius': 'nh:quarterstaff',
  'nh:mitre_of_holiness': 'nh:helm_of_brilliance',
  'nh:longbow_of_diana': 'nh:bow',
  'nh:master_key_of_thievery': 'nh:skeleton_key',
  'nh:tsurugi_of_muramasa': 'nh:tsurugi',
  'nh:platinum_yendorian_express_card': 'nh:credit_card',
  'nh:eye_of_the_aethiopica': 'nh:amulet_of_esp',
};

const ARTI_ORIGINS = ['wish', 'gift', 'viadip', 'named', 'lvldef', 'bones', 'random'];

/**
 * Artifacts (m20): every object that is an artifact is a row of the table on that row's base
 * object, alone (quantity 1), named, and marked existing in `modData.nh.arti.exist`; no two live
 * objects are the same artifact (C keeps a destroyed one existing, so an entry needs no object).
 * Every `exist` entry is a row with one known origin; `disco` lists existing rows, once each.
 */
function checkArtifacts(state: GameState, ids: readonly number[], errs: string[]): void {
  const nh = state.modData['nh'] as { arti?: unknown } | undefined;
  const raw = nh?.arti;
  let exist: Record<string, unknown> = {};
  if (raw !== undefined) {
    const a = raw as { exist?: unknown; disco?: unknown };
    if (!isTable(a) || !isTable(a.exist) || !Array.isArray(a.disco)) {
      errs.push('modData.nh.arti is not { exist: {}, disco: [] }');
      return;
    }
    exist = a.exist;
    for (const id of Object.keys(exist).sort()) {
      if (ARTIFACT_BASES[id] === undefined) errs.push(`artifact ${id}: exists but has no row`);
      const info = exist[id] as { origin?: unknown; found?: unknown } | null;
      if (!isTable(info) || !ARTI_ORIGINS.includes(String(info.origin)))
        errs.push(`artifact ${id}: bad existence record ${JSON.stringify(info)}`);
      else if (info.found !== undefined && info.found !== true)
        errs.push(`artifact ${id}: found is ${JSON.stringify(info.found)}`);
    }
    const seen = new Set<string>();
    for (const d of a.disco) {
      if (typeof d !== 'string' || exist[d] === undefined)
        errs.push(`artifact ${String(d)}: discovered but not existing`);
      else if (seen.has(d)) errs.push(`artifact ${d}: discovered twice`);
      else seen.add(d);
    }
  }
  const holder = new Map<string, number>();
  for (const id of ids) {
    const e = state.entities[String(id)];
    const art = e?.c.item?.artifact;
    if (!e?.c.item || art === undefined) continue;
    const base = ARTIFACT_BASES[art];
    if (base === undefined) errs.push(`item ${id}: artifact ${art} has no row`);
    else if (e.def !== base) errs.push(`item ${id}: artifact ${art} is a ${e.def}, not a ${base}`);
    if (e.c.item.quantity !== 1)
      errs.push(`item ${id}: artifact ${art} has quantity ${e.c.item.quantity}`);
    if (!e.c.item.name) errs.push(`item ${id}: artifact ${art} has no name`);
    if (exist[art] === undefined) errs.push(`item ${id}: artifact ${art} is not marked existing`);
    const other = holder.get(art);
    if (other !== undefined) errs.push(`items ${other} and ${id} are both ${art}`);
    else holder.set(art, id);
  }
}

/** Iron bars, where objects may lie. ref: src/trap.c isclearpath() (ZAP_POS) */
const IRON_BARS = 'nh:iron_bars';
/** Fort Ludios's dungeon (content levelflags.ts LUDIOS). */
const LUDIOS = 'nh:ludios';
/** The Elemental Planes: entered from DL1's up stairs with the Amulet, no stairs back (m23). */
const PLANES = 'nh:planes';

/** Returns a list of violated invariants; empty means the state is healthy. */
export function checkInvariants(
  state: GameState,
  registry: Registry,
  opts: InvariantOpts = {},
): string[] {
  const errs: string[] = [];
  // one canonical form serves both the plain-data check and the round trip below
  let canon: string | null = null;
  try {
    canon = canonicalJson(state);
  } catch {
    errs.push('state is not JSON-plain');
  }
  const ids = sortedIds(state);

  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (!lv) continue;
    const n = lv.width * lv.height;
    if (lv.cells.length !== n) errs.push(`level ${lid}: cells length ${lv.cells.length} != ${n}`);
    if (lv.lit.length !== n) errs.push(`level ${lid}: lit length ${lv.lit.length} != ${n}`);
    for (const c of lv.cells) {
      if (!Number.isInteger(c) || c < 0 || c >= lv.palette.length) {
        errs.push(`level ${lid}: palette index ${c} out of range 0..${lv.palette.length - 1}`);
        break;
      }
    }
    for (const id of lv.palette) {
      if (!registry.hasTerrain(id))
        errs.push(`level ${lid}: palette terrain '${id}' is not registered`);
    }
    const mem = state.memory[lid];
    if (mem) {
      if (mem.length !== n) errs.push(`memory ${lid}: length ${mem.length} != ${n}`);
      for (const m of mem) {
        if (!Number.isInteger(m) || m < -1 || m >= lv.palette.length) {
          errs.push(`memory ${lid}: value ${m} out of range`);
          break;
        }
      }
    } else if (lid === state.currentLevel) {
      errs.push(`memory ${lid}: missing for current level`);
    }
  }

  // The engulfer holding the hero shares her square, as in C (place_monster(mtmp, u.ux, u.uy));
  // it is the only creature allowed to (content's modData.nh.uswallow, kept with u.ustuck).
  const nh = state.modData['nh'] as { uswallow?: { mon?: unknown } | null } | undefined;
  const engulfer = typeof nh?.uswallow?.mon === 'number' ? nh.uswallow.mon : null;
  const seen = new Map<string, number>();
  const ww = opts.wallwalk;
  if (ww) noteWallwalkers(state, registry, ww);
  for (const id of ids) {
    const e = state.entities[String(id)];
    if (!e) continue;
    if (e.id !== id) errs.push(`entity key ${id} has id ${e.id}`);
    if (e.c.hp) {
      const { cur, max } = e.c.hp;
      const heroDead = id === state.playerId && state.gameOver !== null;
      if (!Number.isInteger(cur) || !Number.isInteger(max) || max < 1) {
        errs.push(`entity ${id}: bad hp ${cur}/${max}`);
      } else if (cur > max || (cur <= 0 && !heroDead)) {
        errs.push(`entity ${id} (${e.def}): hp ${cur}/${max} out of range`);
      }
    }
    if (e.c.monster && !registry.isMonster(e.def))
      errs.push(`entity ${id}: def '${e.def}' is not a registered monster`);
    // pets: tameness (mtame) is 1..20, and a tame monster is peaceful (ref: include/monst.h)
    const tame = e.c.monster?.tame;
    if (tame !== undefined) {
      if (!Number.isInteger(tame) || tame < 1 || tame > 20)
        errs.push(`entity ${id}: tameness ${tame} out of range 1..20`);
      if (!e.c.monster?.peaceful) errs.push(`entity ${id}: tame but not peaceful`);
    }
    if (e.c.actor && !Number.isFinite(e.c.actor.energy))
      errs.push(`entity ${id}: energy ${e.c.actor.energy} is not finite`);
    else if (e.c.actor && !Number.isInteger(e.c.actor.energy))
      errs.push(`entity ${id}: energy ${e.c.actor.energy} is not an integer`);
    const p = e.c.pos;
    if (!p) continue;
    const lv = state.levels[p.level];
    if (!lv) {
      errs.push(`entity ${id}: on unknown level '${p.level}'`);
      continue;
    }
    if (!inBounds(lv, p.x, p.y)) {
      errs.push(`entity ${id}: out of bounds at ${p.x},${p.y} on ${p.level}`);
      continue;
    }
    const { blocked, door, pal } = blockedAt(state, registry, p);
    if (blocked) {
      // a monster that passes walls (a ghost) may stand in stone and walls (ref: src/mon.c
      // mfndpos()); an amorphous one (a fog cloud, a vampire shifted into one) flows under a
      // closed or locked door and may stop there (src/monmove.c can_ooze()); one that changed
      // form there stays until it steps out, as do the objects dropped there (the record)
      const form = e.c.monster ? passes(registry, e.def) : { wall: false, door: false };
      const cell = `${p.level}:${p.x},${p.y}`;
      const ok = e.c.item
        ? // objects may lie on iron bars (a rolling boulder trap's launch spot: isclearpath()'s
          // ZAP_POS() lets it be there)
          pal === IRON_BARS || ww?.cells.has(cell) === true
        : form.wall || (door && form.door) || ww?.spots.has(`${id}@${cell}`) === true;
      if (!ok) errs.push(`entity ${id}: on impassable cell (${pal ?? '?'}) at ${p.x},${p.y}`);
    }
    // Objects pile up; only creatures need a cell to themselves.
    if (e.c.item) continue;
    const key = `${p.level}:${p.x},${p.y}`;
    const other = seen.get(key);
    const swallowPair =
      engulfer !== null &&
      ((other === state.playerId && id === engulfer) ||
        (other === engulfer && id === state.playerId));
    if (other !== undefined && !swallowPair)
      errs.push(`entities ${other} and ${id} share cell ${key}`);
    else seen.set(key, id);
  }

  // Items: exactly one place (floor, carrier or container), a living carrier, unique inventory
  // letters per carrier.
  const letters = new Map<string, number>();
  for (const id of ids) {
    const e = state.entities[String(id)];
    const item = e?.c.item;
    if (!e || !item) continue;
    if (!registry.isObject(e.def))
      errs.push(`item ${id}: def '${e.def}' is not a registered object`);
    if (!Number.isInteger(item.quantity) || item.quantity < 1)
      errs.push(`item ${id}: quantity ${item.quantity} is not a positive integer`);
    const places =
      Number(e.c.pos !== undefined) +
      Number(item.carriedBy !== null) +
      Number(item.containedIn !== undefined);
    if (places !== 1)
      errs.push(
        `item ${id}: must be in exactly one place: on the floor, carried or in a container`,
      );
    if (item.containedIn !== undefined) checkContained(state, registry, id, item, errs);
    if (item.carriedBy !== null) {
      if (!state.entities[String(item.carriedBy)])
        errs.push(`item ${id}: carried by missing entity ${item.carriedBy}`);
      if (item.letter !== null) {
        const k = `${item.carriedBy}:${item.letter}`;
        const other = letters.get(k);
        if (other !== undefined) errs.push(`items ${other} and ${id} share letter ${k}`);
        else letters.set(k, id);
      }
    } else if (item.equipped !== null) {
      // A floor item may keep its last letter (obj->invlet), so it gets it back when picked up.
      errs.push(`item ${id}: not carried but equipped`);
    }
  }

  checkEquipment(state, registry, ids, errs);
  checkProps(state, ids, errs);
  checkDoors(state, registry, errs, opts.doorsChecked);
  checkTraps(state, registry, errs);
  checkStairsReachable(state, registry, errs);
  checkBranches(state, registry, errs);
  checkLudios(state, errs);
  checkSpecialLevels(state, registry, errs);
  checkBoulders(state, registry, errs);
  checkMonsterMemory(state, registry, errs);
  checkFleeing(state, errs);
  checkSpellState(state, errs);
  checkCharacter(state, registry, errs);
  checkWorms(state, ids, errs);
  checkPriests(state, errs);
  checkFountains(state, errs);
  checkEngravings(state, registry, errs);
  checkGraves(state, errs);
  checkVaults(state, errs);
  checkShopkeepers(state, errs);
  checkShopItems(state, ids, errs);
  checkLight(state, ids, errs);
  checkArtifacts(state, ids, errs);

  const player = state.entities[String(state.playerId)];
  if (!player) errs.push(`player entity ${state.playerId} missing`);
  else {
    if (!player.c.actor) errs.push('player has no actor component');
    if (!player.c.pos) errs.push('player has no pos component');
    else if (player.c.pos.level !== state.currentLevel) {
      errs.push(`player on '${player.c.pos.level}' but currentLevel is '${state.currentLevel}'`);
    }
  }

  if (player?.c.hunger && !Number.isInteger(player.c.hunger.nutrition))
    errs.push(`hero nutrition ${player.c.hunger.nutrition} is not an integer`);
  // content's nomul() sets until = turn + 1 + n and its endOfTurn hook deletes the component once
  // turn >= until, so after a step a helpless hero must still have time left.
  for (const id of ids) {
    const h = state.entities[String(id)]?.c.helpless;
    if (h && (!Number.isInteger(h.until) || (h.until <= state.turn && !state.gameOver)))
      errs.push(`entity ${id}: helpless until ${h.until} but the turn is ${state.turn}`);
  }

  if (state.pendingPrompt && state.gameOver) errs.push('pendingPrompt and gameOver are both set');
  if (state.occupation !== null) {
    const occ = state.occupation;
    if (!occ || typeof occ !== 'object' || typeof occ.action?.type !== 'string')
      errs.push('occupation has no valid action');
    else if (occ.action.type === 'continue' || occ.action.type === 'answer')
      errs.push(`occupation action '${occ.action.type}' cannot continue`);
    else if (occ.action.type === 'mod') {
      const id = occ.action.action;
      if (!registry.actions.some((a) => a.id === id))
        errs.push(`occupation action '${id}' is not registered`);
    }
    if (state.pendingPrompt) errs.push('occupation is set while a prompt is pending');
    if (state.gameOver) errs.push('occupation is set after game over');
  }
  const heroPos = player?.c.pos;
  if (heroPos && state.levels[state.currentLevel] && heroPos.level !== state.currentLevel) {
    errs.push(`hero level '${heroPos.level}' != currentLevel '${state.currentLevel}'`);
  }

  const cur = state.levels[state.currentLevel];
  if (!cur) errs.push(`current level '${state.currentLevel}' missing`);
  else {
    const n = cur.width * cur.height;
    for (let i = 0; i < state.visible.length; i++) {
      const v = state.visible[i] as number;
      if (!Number.isInteger(v) || v < 0 || v >= n) {
        errs.push(`visible[${i}]=${v} out of range`);
        break;
      }
      if (i > 0 && v <= (state.visible[i - 1] as number)) {
        errs.push(`visible not strictly ascending at ${i}`);
        break;
      }
    }
  }

  for (let i = 1; i < state.timers.length; i++) {
    const a = state.timers[i - 1];
    const b = state.timers[i];
    if (a && b && (a.at > b.at || (a.at === b.at && a.seq >= b.seq))) {
      errs.push(`timers not sorted by (at,seq) at index ${i}`);
      break;
    }
  }

  if (canon !== null) {
    const back = JSON.parse(JSON.stringify(state)) as GameState;
    if (canonicalJson(back) !== canon) errs.push('JSON round-trip changes the state hash');
  }
  return errs;
}

const INVLET = /^[$a-zA-Z#]$/;

/**
 * A contained item's container is an existing container item (or a statue, which holds the
 * possessions of the monster turned to stone: C's Has_contents()), and following containers
 * upward ends at an item that is not contained (no nesting loop).
 */
function checkContained(
  state: GameState,
  registry: Registry,
  id: number,
  item: ItemComponent,
  errs: string[],
): void {
  const box = state.entities[String(item.containedIn)];
  if (
    !box?.c.item ||
    !registry.isObject(box.def) ||
    (!registry.object(box.def).container && box.def !== 'nh:statue')
  ) {
    errs.push(`item ${id}: contained in ${item.containedIn ?? '?'}, which is not a container item`);
    return;
  }
  const seen = new Set<number>([id]);
  for (let cur = box; cur.c.item?.containedIn !== undefined;) {
    if (seen.has(cur.id)) {
      errs.push(`item ${id}: containers nest in a loop`);
      return;
    }
    seen.add(cur.id);
    const up = state.entities[String(cur.c.item.containedIn)];
    if (!up) return; // reported for `cur` itself
    cur = up;
  }
}

/** Whether an item of `def` may occupy `slot`: anything is wielded, armor goes in its own slot. */
function slotFits(def: ObjectDef, slot: EquipSlot): boolean {
  if (slot === 'weapon') return true;
  if (slot === 'ringL' || slot === 'ringR') return def.class === 'ring';
  if (slot === 'amulet') return def.class === 'amulet';
  // ref: src/do_wear.c Blindf_on(): blindfolds, towels and lenses are tools
  if (slot === 'blindfold') return def.class === 'tool';
  return def.armor?.slot === slot;
}

/**
 * Carriers and equipment: a carried item's carrier is the hero or a monster standing on a level
 * (or migrating, with no position),
 * every equipped item is carried, a carrier has at most one wielded weapon and one piece of armor
 * per slot (and the slot matches the item's def), and the hero's items have valid letters.
 * Weight conservation is not checked: weights are derived from the items, never stored, so there
 * is no redundant total to keep in sync.
 */
function checkEquipment(
  state: GameState,
  registry: Registry,
  ids: readonly number[],
  errs: string[],
): void {
  const slots = new Map<string, number>();
  for (const id of ids) {
    const e = state.entities[String(id)];
    const item = e?.c.item;
    if (!e || !item || item.carriedBy === null) continue;
    const carrier = state.entities[String(item.carriedBy)];
    if (carrier && item.carriedBy !== state.playerId) {
      // a monster without a position is migrating (it fell to a level not visited yet)
      const p = carrier.c.pos;
      if (p ? !state.levels[p.level] : !carrier.c.monster)
        errs.push(`item ${id}: carrier ${item.carriedBy} is not on a level`);
    }
    if (item.carriedBy === state.playerId) {
      if (item.letter === null || !INVLET.test(item.letter))
        errs.push(
          `item ${id}: hero inventory letter '${item.letter ?? 'null'}' is not in $a-zA-Z#`,
        );
    }
    if (item.equipped === null) continue;
    const k = `${item.carriedBy}:${item.equipped}`;
    const other = slots.get(k);
    if (other !== undefined) errs.push(`items ${other} and ${id} both occupy slot ${k}`);
    else slots.set(k, id);
    if (registry.isObject(e.def)) {
      const def = registry.object(e.def);
      // anything may be wielded; armor goes in its own slot, rings on a hand, and so on
      if (!slotFits(def, item.equipped)) {
        errs.push(
          `item ${id}: '${e.def}' (${def.class}) worn in slot ${item.equipped}, not its slot`,
        );
      }
    }
  }
}

/**
 * Entity props are `{ intrinsic: boolean, timeout: integer >= 0 }` (timeout is the turn a timed
 * effect ends, 0 = none). Content's props module prunes an entry that holds nothing, so a
 * non-intrinsic entry with timeout 0 must not linger.
 */
function checkProps(state: GameState, ids: readonly number[], errs: string[]): void {
  for (const id of ids) {
    const props = state.entities[String(id)]?.c.props;
    if (props === undefined) continue;
    for (const name of Object.keys(props).sort()) {
      const p = props[name];
      if (
        !p ||
        typeof p !== 'object' ||
        typeof p.intrinsic !== 'boolean' ||
        !Number.isInteger(p.timeout) ||
        p.timeout < 0
      ) {
        errs.push(`entity ${id}: prop '${name}' is malformed: ${JSON.stringify(p)}`);
      } else if (!p.intrinsic && p.timeout === 0) {
        errs.push(`entity ${id}: prop '${name}' holds nothing but was not pruned`);
      }
    }
  }
}

/**
 * Doors sit in walls: every door terrain (closed, locked, open, doorway, broken) has solid cells
 * on both sides along one axis, whatever the generator did. Only generated levels are checked in
 * full; the rule holds for scenario levels with a door in a wall too. Levels in `checked` are
 * skipped (digging may open the walls beside a door later); the others are added to it.
 */
function checkDoors(
  state: GameState,
  registry: Registry,
  errs: string[],
  checked?: Set<string>,
): void {
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (!lv || checked?.has(lid)) continue;
    checked?.add(lid);
    if (lv.def === ROGUE_LEVEL) checkRogueDoors(lid, lv.palette, lv.cells, registry, errs);
    const door: boolean[] = lv.palette.map(
      (t) => registry.hasTerrain(t) && !!registry.terrain(t).door,
    );
    if (!door.some(Boolean)) continue;
    const solid = (x: number, y: number): boolean => {
      if (!inBounds(lv, x, y)) return true;
      const t = lv.palette[lv.cells[cellIndex(lv, x, y)] ?? -1];
      return t === undefined || !registry.hasTerrain(t) || !registry.terrain(t).passable;
    };
    for (let y = 0; y < lv.height; y++) {
      for (let x = 0; x < lv.width; x++) {
        if (!door[lv.cells[cellIndex(lv, x, y)] ?? -1]) continue;
        if (!((solid(x, y - 1) && solid(x, y + 1)) || (solid(x - 1, y) && solid(x + 1, y)))) {
          errs.push(
            `level ${lid}: door '${lv.palette[lv.cells[cellIndex(lv, x, y)] ?? 0]}' at ${x},${y} has no walls on opposite sides`,
          );
          return;
        }
      }
    }
  }
}

/** The Rogue level's LevelDef (content levelflags.ts ROGUE). */
const ROGUE_LEVEL = 'nh:rogue-level';

/**
 * The Rogue level as made (m21): no door square has a door, every one a doorway or a secret door
 * with nothing behind it, so never a locked one (makeroguerooms()'s `dodoor()` then D_NODOOR).
 * Checked once per level with the doors: in play, opening magic on a secret door there makes a
 * closed door, as C's doorlock() does. ref: src/extralev.c roguecorr()
 */
function checkRogueDoors(
  lid: string,
  palette: readonly DefId[],
  cells: readonly number[],
  registry: Registry,
  errs: string[],
): void {
  const bad = new Set(
    palette.flatMap((t, i) => {
      const door = registry.hasTerrain(t) ? registry.terrain(t).door : undefined;
      return (door !== undefined && door !== 'doorway') || t.startsWith('nh:sdoor_locked')
        ? [i]
        : [];
    }),
  );
  const at = cells.findIndex((c) => bad.has(c));
  if (at >= 0)
    errs.push(`level ${lid}: Rogue level square ${at} has a door ('${palette[cells[at] ?? 0]}')`);
}

/**
 * Traps: a registered def on plain floor (no door, stairs, wall or hidden terrain), at most one
 * per cell, and `level.traps` sorted by cell index as core's placeTrapOn keeps it.
 */
function checkTraps(state: GameState, registry: Registry, errs: string[]): void {
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (!lv) continue;
    let last = -1;
    for (const t of lv.traps) {
      if (!registry.isTrap(t.def)) errs.push(`level ${lid}: trap '${t.def}' is not registered`);
      if (!isPlainFloor(registry, lv, t.x, t.y)) {
        const id = inBounds(lv, t.x, t.y)
          ? lv.palette[lv.cells[cellIndex(lv, t.x, t.y)] ?? -1]
          : '';
        errs.push(
          `level ${lid}: trap '${t.def}' at ${t.x},${t.y} is not on plain floor (${id ?? '?'})`,
        );
        continue;
      }
      const i = cellIndex(lv, t.x, t.y);
      if (i <= last) errs.push(`level ${lid}: traps not sorted by cell, or two on ${t.x},${t.y}`);
      last = i;
    }
  }
}

/**
 * Remembered monsters: keys are in-bounds cell indices of a known level, values legend keys: a
 * registered monster, appearance (a marker such as the remembered-unseen `I`, a warning digit),
 * object or terrain (what a monster was shown as: a mimic's disguise).
 */
function checkMonsterMemory(state: GameState, registry: Registry, errs: string[]): void {
  for (const lid of Object.keys(state.monsterMemory).sort()) {
    const lv = state.levels[lid];
    const mem = state.monsterMemory[lid];
    if (!lv) {
      errs.push(`monsterMemory: unknown level '${lid}'`);
      continue;
    }
    if (!mem) continue;
    const n = lv.width * lv.height;
    for (const k of Object.keys(mem).sort()) {
      const i = Number(k);
      if (!Number.isInteger(i) || String(i) !== k || i < 0 || i >= n) {
        errs.push(`monsterMemory ${lid}: key '${k}' is not a cell index below ${n}`);
        break;
      }
      const def = mem[k];
      if (
        def === undefined ||
        !(
          registry.isMonster(def) ||
          registry.isAppearance(def) ||
          registry.isObject(def) ||
          registry.terrains.some((t) => t.id === def)
        )
      ) {
        errs.push(
          `monsterMemory ${lid}: '${String(def)}' at ${k} is not a registered monster or legend key`,
        );
        break;
      }
    }
  }
}

/**
 * Content keeps the fleeing monsters in `modData.nh.mflee` as `{ [monsterId]: fleetim }` and
 * prunes entries of the dead at the end of every turn, so each key names a living monster and
 * each value is a non-negative integer. A pending prompt or a hero action that takes no time
 * does not reach endOfTurn, but nothing kills a monster without taking time.
 */
function checkFleeing(state: GameState, errs: string[]): void {
  const nh = state.modData['nh'];
  const t =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? (nh as Record<string, unknown>)['mflee']
      : undefined;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errs.push('modData.nh.mflee is not an object');
    return;
  }
  const table = t as Record<string, unknown>;
  for (const k of Object.keys(table).sort()) {
    const v = table[k];
    if (!state.entities[k]?.c.monster) errs.push(`mflee: '${k}' is not a monster`);
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0)
      errs.push(`mflee: monster ${k} has flee time ${String(v)}`);
  }
}

const isTable = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/**
 * Spell state: the hero's energy (`modData.nh.pw`, written at newGame) keeps
 * `0 <= uen <= uenmax`; `uenpeak` ("highest value of uenmax so far") is not checked against
 * `uenmax`, since C itself lets uenmax pass it: newman() sets `u.uenmax = enmax` and a confused
 * scroll of charging raises `u.uenmax = u.uen`, neither touching uenpeak (ref: src/polyself.c
 * newman(), src/read.c seffect_charging()); her spell state (`modData.nh.uspell`, absent while all 0) holds
 * non-negative whole numbers; the monsters' spell delays (`mspecUsed`, positive turns),
 * confusion (`mconf`, true) and hiding (`mundetected`, true) name living monsters.
 */
/**
 * Long worms (content's `modData.nh.worms` / `wormTail`): every tail segment entity
 * (`nh:long_worm_tail`) is a bare positioned entity (no monster, actor or hit points) listed in
 * the record of a living worm on its level, and every record lists only such segments, each linked
 * back to it. (Segments are not required to be adjacent: as in C, a worm whose head is moved
 * without its tail, a pet swapping places with her, leaves it behind until it moves on.)
 */
function checkWorms(state: GameState, ids: readonly number[], errs: string[]): void {
  const nh = state.modData['nh'] as
    { worms?: Record<string, { segs?: unknown }>; wormTail?: Record<string, unknown> } | undefined;
  const worms = nh?.worms ?? {};
  const back = nh?.wormTail ?? {};
  const listed = new Map<number, number>();
  for (const k of Object.keys(worms).sort()) {
    const head = state.entities[k];
    if (!head?.c.monster) {
      errs.push(`worms: '${k}' is not a living monster`);
      continue;
    }
    const segs = worms[k]?.segs;
    if (!Array.isArray(segs)) {
      errs.push(`worms: ${k} has no segment list`);
      continue;
    }
    for (const s of segs) {
      const seg = typeof s === 'number' ? state.entities[String(s)] : undefined;
      if (!seg || seg.def !== 'nh:long_worm_tail') {
        errs.push(`worms: ${k} lists ${String(s)}, not a tail segment`);
        continue;
      }
      listed.set(seg.id, Number(k));
      if (back[String(seg.id)] !== Number(k))
        errs.push(`wormTail: segment ${seg.id} does not point back to worm ${k}`);
      if (seg.c.pos?.level !== head.c.pos?.level)
        errs.push(`worms: segment ${seg.id} of worm ${k} is not on its level`);
    }
  }
  for (const id of ids) {
    const e = state.entities[String(id)];
    if (e?.def !== 'nh:long_worm_tail') continue;
    if (e.c.monster || e.c.actor || e.c.hp) errs.push(`tail segment ${id} is a monster`);
    if (!listed.has(id)) errs.push(`tail segment ${id} belongs to no living worm`);
  }
}

function checkSpellState(state: GameState, errs: string[]): void {
  const nh = state.modData['nh'];
  if (!isTable(nh)) return;
  const pw = nh['pw'];
  if (pw !== undefined) {
    if (!isTable(pw)) errs.push('modData.nh.pw is not an object');
    else {
      const { uen, uenmax, uenpeak } = pw;
      if (!isCount(uen) || !isCount(uenmax) || !isCount(uenpeak))
        errs.push(`pw: bad fields ${JSON.stringify(pw)}`);
      else if (uen > uenmax) errs.push(`pw: not 0 <= uen ${uen} <= uenmax ${uenmax}`);
    }
  }
  const us = nh['uspell'];
  if (us !== undefined) {
    if (!isTable(us)) errs.push('modData.nh.uspell is not an object');
    else {
      const keys = ['uspellprot', 'uspmtime', 'usptime', 'umconf'];
      if (!keys.every((k) => isCount(us[k]))) errs.push(`uspell: bad fields ${JSON.stringify(us)}`);
      else if (keys.every((k) => us[k] === 0)) errs.push('uspell: kept while every field is 0');
    }
  }
  for (const key of ['mspecUsed', 'mconf', 'mundetected'] as const) {
    const t = nh[key];
    if (t === undefined) continue;
    if (!isTable(t)) {
      errs.push(`modData.nh.${key} is not an object`);
      continue;
    }
    for (const k of Object.keys(t).sort()) {
      const v = t[k];
      if (!state.entities[k]?.c.monster) errs.push(`${key}: '${k}' is not a monster`);
      if (key !== 'mspecUsed' ? v !== true : !isCount(v) || v === 0)
        errs.push(`${key}: monster ${k} has ${String(v)}`);
    }
  }
}

/**
 * The hero's character (m22): her starting role, race, gender and alignment (the player
 * component) go together as the roles and races registered allow (core's okRole()..okAlign(),
 * C's ok_role()..ok_align()); and no skill is above its maximum (content's `modData.nh.skills`
 * against `skillMax`, the role's limits as skill_init() set them: absent = restricted).
 */
function checkCharacter(state: GameState, registry: Registry, errs: string[]): void {
  const pc = state.entities[String(state.playerId)]?.c.player;
  if (pc && !okCharacter(registry, pc))
    errs.push(
      `hero: character ${pc.role} ${pc.race} ${pc.gender} ${pc.align} is not allowed by her role`,
    );
  const nh = state.modData['nh'];
  if (!isTable(nh) || !isTable(nh['skills'])) return;
  const skills = nh['skills'];
  const max = isTable(nh['skillMax']) ? nh['skillMax'] : {};
  for (const k of Object.keys(skills).sort()) {
    const lvl = skills[k];
    const top = max[k] ?? 0;
    if (!isCount(lvl) || !isCount(top))
      errs.push(`skill ${k}: bad level ${String(lvl)}/${String(top)}`);
    else if (lvl > top) errs.push(`skill ${k}: level ${lvl} above its maximum ${top}`);
  }
}

/** content's altar terrains by shrine alignment (align.h: lawful 1, neutral 0, chaotic -1, A_NONE) */
const ALTAR_OF: Readonly<Record<string, string>> = {
  '1': 'nh:altar_lawful',
  '0': 'nh:altar_neutral',
  '-1': 'nh:altar_chaotic',
  '-128': 'nh:altar_unaligned',
};

/**
 * Fountain state (`modData.nh.fountains`, `{ [levelId]: { [cellIndex]: bits } }`): every entry
 * is a fountain cell of an existing level with non-zero bits (an entry is dropped at 0).
 */
function checkFountains(state: GameState, errs: string[]): void {
  const nh = state.modData['nh'];
  const t =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? (nh as Record<string, unknown>)['fountains']
      : undefined;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errs.push('modData.nh.fountains is not an object');
    return;
  }
  const table = t as Record<string, Record<string, unknown>>;
  for (const lid of Object.keys(table).sort()) {
    const lv = state.levels[lid];
    if (!lv) {
      errs.push(`fountains: level '${lid}' does not exist`);
      continue;
    }
    const cells = table[lid] ?? {};
    for (const k of Object.keys(cells).sort()) {
      const bits = cells[k];
      if (typeof bits !== 'number' || !Number.isInteger(bits) || bits <= 0 || bits > 7)
        errs.push(`fountains: ${lid} cell ${k} has bad bits ${String(bits)}`);
      if (lv.palette[lv.cells[Number(k)] ?? -1] !== 'nh:fountain')
        errs.push(`fountains: ${lid} cell ${k} is not a fountain`);
    }
  }
}

const ENGR_TYPES = ['dust', 'engrave', 'burn', 'mark', 'blood', 'headstone'];

/**
 * Engravings (`modData.nh.engr`, `{ [levelId]: { [cellIndex]: Engr } }`): every entry is on an
 * existing level, has a known type and a text that is not empty, and lies on an ACCESSIBLE()
 * square (a door, or a passable square that is not liquid: never stone, a wall, a tree, iron
 * bars, a secret door or corridor, water or lava). Empty level tables are dropped.
 */
function checkEngravings(state: GameState, registry: Registry, errs: string[]): void {
  const nh = state.modData['nh'];
  const t =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? (nh as Record<string, unknown>)['engr']
      : undefined;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errs.push('modData.nh.engr is not an object');
    return;
  }
  const table = t as Record<string, Record<string, unknown>>;
  for (const lid of Object.keys(table).sort()) {
    const lv = state.levels[lid];
    if (!lv) {
      errs.push(`engr: level '${lid}' does not exist`);
      continue;
    }
    const cells = table[lid] ?? {};
    const keys = Object.keys(cells).sort((a, b) => Number(a) - Number(b));
    if (keys.length === 0) errs.push(`engr: ${lid} has an empty table`);
    for (const k of keys) {
      const e = cells[k] as { text?: unknown; type?: unknown } | undefined;
      const i = Number(k);
      if (!Number.isInteger(i) || i < 0 || i >= lv.cells.length) {
        errs.push(`engr: ${lid} cell ${k} is off the map`);
        continue;
      }
      if (typeof e?.text !== 'string' || e.text.length === 0)
        errs.push(`engr: ${lid} cell ${k} has no text`);
      if (typeof e?.type !== 'string' || !ENGR_TYPES.includes(e.type))
        errs.push(`engr: ${lid} cell ${k} has a bad type ${String(e?.type)}`);
      const tid = lv.palette[lv.cells[i] ?? -1];
      const def = tid !== undefined && registry.hasTerrain(tid) ? registry.terrain(tid) : null;
      if (!def || def.liquid !== undefined || (!def.passable && def.door === undefined))
        errs.push(`engr: ${lid} (${i % lv.width},${Math.floor(i / lv.width)}) is on ${tid}`);
    }
  }
}

/**
 * Disturbed graves (`modData.nh.graves`, `{ [levelId]: cellIndex[] }`): each list is on an
 * existing level, not empty, sorted without repeats, and every cell in it is a grave.
 */
function checkGraves(state: GameState, errs: string[]): void {
  const nh = state.modData['nh'];
  const t =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? (nh as Record<string, unknown>)['graves']
      : undefined;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errs.push('modData.nh.graves is not an object');
    return;
  }
  const table = t as Record<string, unknown>;
  for (const lid of Object.keys(table).sort()) {
    const lv = state.levels[lid];
    const cells = table[lid];
    if (!lv) {
      errs.push(`graves: level '${lid}' does not exist`);
      continue;
    }
    if (!Array.isArray(cells) || cells.length === 0) {
      errs.push(`graves: ${lid} has no list`);
      continue;
    }
    cells.forEach((c: unknown, j) => {
      if (j > 0 && !((cells[j - 1] as number) < (c as number)))
        errs.push(`graves: ${lid} is not sorted`);
      if (typeof c !== 'number' || lv.palette[lv.cells[c] ?? -1] !== 'nh:grave')
        errs.push(`graves: ${lid} cell ${String(c)} is not a grave`);
    });
  }
}

/**
 * Vaults: no level keeps level generation's transient requests (`vaultSpot`, `vaultTeleSpot`,
 * consumed by the first `newLevel` hook, never saved), and every hidden vault teleporter
 * (`modData.nh.vaultTele`, `{ [levelId]: cellIndex }`) waits on a secret corridor of an
 * existing level.
 */
function checkVaults(state: GameState, errs: string[]): void {
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (lv && ('vaultSpot' in lv || 'vaultTeleSpot' in lv))
      errs.push(`level '${lid}' kept a vault request`);
  }
  const nh = state.modData['nh'];
  const t =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? (nh as Record<string, unknown>)['vaultTele']
      : undefined;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errs.push('modData.nh.vaultTele is not an object');
    return;
  }
  const table = t as Record<string, unknown>;
  for (const lid of Object.keys(table).sort()) {
    const lv = state.levels[lid];
    const cell = table[lid];
    if (!lv) errs.push(`vaultTele: level '${lid}' does not exist`);
    else if (typeof cell !== 'number' || lv.palette[lv.cells[cell] ?? -1] !== 'nh:scorr')
      errs.push(`vaultTele: ${lid} cell ${String(cell)} is not a secret corridor`);
  }
}

/**
 * Temple priests (`modData.nh.epri`, keyed by monster id) are living monsters; one that is
 * peaceful and on his shrine level, with his shrine intact (a shrine altar of his alignment),
 * stands in his temple room (pri_move() never leaves it).
 */
function checkPriests(state: GameState, errs: string[]): void {
  const nh = state.modData['nh'];
  const t =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? (nh as Record<string, unknown>)['epri']
      : undefined;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errs.push('modData.nh.epri is not an object');
    return;
  }
  const table = t as Record<string, unknown>;
  for (const k of Object.keys(table).sort()) {
    const mon = state.entities[k];
    const e = table[k] as
      { shroom?: number; shralign?: number; shrpos?: Pos; shrlevel?: string } | undefined;
    if (!mon?.c.monster) {
      errs.push(`epri: '${k}' is not a monster`);
      continue;
    }
    const p = mon.c.pos;
    const lv = e?.shrlevel === undefined ? undefined : state.levels[e.shrlevel];
    if (!e || !lv || !e.shrpos || e.shroom === undefined) {
      errs.push(`epri: priest ${k} has no shrine level, spot or room`);
      continue;
    }
    if (!mon.c.monster.peaceful || !p || p.level !== lv.id) continue;
    const { x, y } = e.shrpos;
    const altar = lv.palette[lv.cells[cellIndex(lv, x, y)] ?? -1];
    const intact =
      altar === ALTAR_OF[String(e.shralign)] &&
      lv.shrines?.some((sp) => sp.x === x && sp.y === y) === true;
    if (intact && !inRooms(lv, p.x, p.y).includes(e.shroom))
      errs.push(`priest ${k} (peaceful, shrine intact) is outside his temple at ${p.x},${p.y}`);
  }
}

/**
 * Shopkeepers (`modData.nh.eshk`, keyed by monster id) are living monsters with a shop room on
 * their shop level; one that is peaceful, not following the hero and on his shop level stands
 * in his shop, its walls or its door (shk_move() keeps him by the door).
 */
function checkShopkeepers(state: GameState, errs: string[]): void {
  const nh = state.modData['nh'];
  const t =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? (nh as Record<string, unknown>)['eshk']
      : undefined;
  if (t === undefined) return;
  if (!t || typeof t !== 'object' || Array.isArray(t)) {
    errs.push('modData.nh.eshk is not an object');
    return;
  }
  const table = t as Record<string, unknown>;
  for (const k of Object.keys(table).sort()) {
    const mon = state.entities[k];
    const e = table[k] as
      | { shoproom?: number; shoplevel?: string; following?: boolean; shk?: Pos; shd?: Pos }
      | undefined;
    if (!mon?.c.monster) {
      errs.push(`eshk: '${k}' is not a monster`);
      continue;
    }
    const lv = e?.shoplevel === undefined ? undefined : state.levels[e.shoplevel];
    const room = e?.shoproom === undefined ? undefined : lv?.rooms[e.shoproom];
    if (!e || !lv || !room || !e.shk || !e.shd) {
      errs.push(`eshk: shopkeeper ${k} has no shop level, room, spot or door`);
      continue;
    }
    const p = mon.c.pos;
    if (!mon.c.monster.peaceful || e.following || !p || p.level !== lv.id) continue;
    if (!inRooms(lv, p.x, p.y).includes(e.shoproom ?? -1))
      errs.push(`shopkeeper ${k} (peaceful, not following) is outside his shop at ${p.x},${p.y}`);
  }
}

/**
 * Shop flags on items (ref: src/mkobj.c shop_obj_sanity()): never both; an unpaid item is
 * carried by the hero (or inside something she carries) or lies inside a shop's walls (its
 * door, his spot), and a live line of some shopkeeper's bill (`modData.nh.eshk[..].bill`)
 * names it; a no-charge item lies (or is inside a container that lies) on a shop's floor or
 * walls, or is carried by a monster, and is on no bill.
 */
function checkShopItems(state: GameState, ids: readonly number[], errs: string[]): void {
  const nh = state.modData['nh'];
  const table =
    nh && typeof nh === 'object' && !Array.isArray(nh)
      ? ((nh as Record<string, unknown>)['eshk'] as Record<string, unknown> | undefined)
      : undefined;
  const billed = new Set<number>();
  const shops: { level: string; room: number }[] = [];
  for (const k of Object.keys(table ?? {}).sort()) {
    const e = table?.[k] as
      | { shoplevel?: string; shoproom?: number; bill?: { oid?: number; useup?: boolean }[] }
      | undefined;
    if (e?.shoplevel !== undefined && e.shoproom !== undefined)
      shops.push({ level: e.shoplevel, room: e.shoproom });
    for (const b of e?.bill ?? []) if (!b.useup && b.oid !== undefined) billed.add(b.oid);
  }
  const inShop = (p: Pos & { level: string }): boolean => {
    const lv = state.levels[p.level];
    if (!lv) return false;
    const rooms = inRooms(lv, p.x, p.y);
    return shops.some((s) => s.level === p.level && rooms.includes(s.room));
  };
  for (const id of ids) {
    const item = state.entities[String(id)]?.c.item;
    if (!item || (!item.unpaid && !item.noCharge)) continue;
    // the outermost container
    let top = state.entities[String(id)];
    for (let n = 0; top?.c.item?.containedIn !== undefined && n < 100; n++)
      top = state.entities[String(top.c.item.containedIn)];
    const where = top?.c.pos ?? null;
    const carrier = top?.c.item?.carriedBy ?? null;
    if (item.unpaid && item.noCharge) errs.push(`item ${id}: both unpaid and no charge`);
    else if (item.unpaid) {
      if (carrier !== state.playerId && !(where && inShop(where)))
        errs.push(`item ${id}: unpaid but neither carried by the hero nor in a shop`);
      else if (!billed.has(id)) errs.push(`item ${id}: unpaid but on no bill`);
    } else {
      if (carrier === state.playerId) errs.push(`item ${id}: no charge but carried by the hero`);
      else if (carrier === null && !(where && inShop(where)))
        errs.push(`item ${id}: no charge but not in a shop`);
      else if (billed.has(id)) errs.push(`item ${id}: no charge but on a bill`);
    }
  }
}

/**
 * A level's stairs (up, down and branch) can be reached from each other: walking over passable
 * terrain, doors of any kind and hidden terrain (secret doors and corridors a player can find),
 * never diagonally into or out of a door that is not an empty doorway, or hidden terrain.
 */
function checkStairsReachable(state: GameState, registry: Registry, errs: string[]): void {
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (!lv) continue;
    const stairs: Pos[] = [];
    for (const p of [lv.up, lv.down, lv.branch?.pos]) if (p) stairs.push(p);
    const first = stairs[0];
    if (stairs.length < 2 || !first) continue;
    const walk: boolean[] = [];
    const square: boolean[] = [];
    for (const id of lv.palette) {
      const t = registry.hasTerrain(id) ? registry.terrain(id) : null;
      const hidden = t?.looksLike !== undefined;
      walk.push(!!t && (t.passable || t.door !== undefined || hidden));
      square.push(!!t && ((t.door !== undefined && t.door !== 'doorway') || hidden));
    }
    const at = (x: number, y: number): number => lv.cells[cellIndex(lv, x, y)] ?? -1;
    const seen = new Set([cellIndex(lv, first.x, first.y)]);
    const queue: Pos[] = [first];
    for (let p = queue.shift(); p; p = queue.shift()) {
      const fromSquare = square[at(p.x, p.y)] === true;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          const x = p.x + dx;
          const y = p.y + dy;
          if (!inBounds(lv, x, y)) continue;
          const i = cellIndex(lv, x, y);
          const c = at(x, y);
          if (seen.has(i) || !walk[c]) continue;
          if (dx !== 0 && dy !== 0 && (fromSquare || square[c])) continue;
          seen.add(i);
          queue.push({ x, y });
        }
    }
    for (const p of stairs) {
      if (!seen.has(cellIndex(lv, p.x, p.y)))
        errs.push(`level ${lid}: stairs at ${p.x},${p.y} unreachable from ${first.x},${first.y}`);
    }
  }
}

/**
 * Branch stairs match the dungeon layout: a dungeon's branch to another dungeon is on exactly the
 * level the layout says (on stairs leading the branch's way, to the child's entry level) and on no
 * other level of the parent, and the child's entry level has the stairs back the other way to it.
 * Only generated levels are checked.
 */
function checkBranches(state: GameState, registry: Registry, errs: string[]): void {
  const lids = Object.keys(state.levels).sort();
  const parentOf = new Map<
    string,
    { dungeon: string; dlevel: number; dir: 'up' | 'down'; childOnly: boolean }
  >();
  const entryOf = new Map<string, number>();
  for (const d of state.dungeons) {
    entryOf.set(d.id, d.entry ?? 1);
    for (const b of d.branches)
      parentOf.set(b.to, {
        dungeon: d.id,
        dlevel: b.dlevel,
        dir: b.dir ?? 'down',
        childOnly: b.stairs === 'child',
      });
  }
  for (const lid of lids) {
    const lv = state.levels[lid];
    const b = lv?.branch;
    if (!lv || !b) continue;
    const id = lv.palette[lv.cells[cellIndex(lv, b.pos.x, b.pos.y)] ?? -1];
    const stairs = id !== undefined && registry.hasTerrain(id) ? registry.terrain(id).stairs : null;
    if (stairs !== b.dir)
      errs.push(`level ${lid}: branch stairs ${b.dir} at ${b.pos.x},${b.pos.y} are on '${id}'`);
    const child = parentOf.get(b.to.dungeon);
    const parent = parentOf.get(lv.dungeon);
    if (child?.dungeon === lv.dungeon && child.dlevel === lv.dlevel) {
      if (child.childOnly)
        errs.push(`level ${lid}: branch to '${b.to.dungeon}' has no stairs here`);
      else if (b.dir !== child.dir || b.to.dlevel !== entryOf.get(b.to.dungeon))
        errs.push(`level ${lid}: branch to '${b.to.dungeon}' is not in the layout`);
    } else if (
      parent?.dungeon !== b.to.dungeon ||
      parent.dlevel !== b.to.dlevel ||
      lv.dlevel !== entryOf.get(lv.dungeon) ||
      b.dir === parent.dir
    ) {
      errs.push(`level ${lid}: branch back to '${b.to.dungeon}' is not in the layout`);
    }
  }
  // every generated level that the layout gives a branch has it
  for (const lid of lids) {
    const lv = state.levels[lid];
    if (!lv) continue;
    const wanted = [...parentOf].find(
      ([child, p]) =>
        (!p.childOnly && p.dungeon === lv.dungeon && p.dlevel === lv.dlevel) ||
        (child === lv.dungeon && lv.dlevel === entryOf.get(child)),
    );
    // Fort Ludios's way back is a magic portal, not stairs (its branch floats: m21), which
    // checkLudios() checks; the Planes have no way back at all (dungeon.lua's "no_down":
    // C's BR_NO_END2, the plane's stairs lifted by its fixup)
    if (wanted && !lv.branch && wanted[0] !== LUDIOS && wanted[0] !== PLANES)
      errs.push(`level ${lid}: the layout's branch stairs are missing`);
  }
}

/** The magic portal's TrapDef id (content portal.ts MAGIC_PORTAL). */
const MAGIC_PORTAL = 'nh:magic_portal';
/** The vault's room type (content vaultstate.ts VAULT). */
const VAULT = 'nh:vault';

/**
 * Fort Ludios's portals (m21): its branch floats until a vault gets the portal
 * (`modData.nh.knox = { dlevel }`, content knoxstate.ts). Before that no level has a portal to
 * the fort, and the fort has none back. After it, every portal to the fort is the one on the
 * main-dungeon level `modData.nh.knox` names, in its vault; that level, once made, has it; the
 * fort, once made, has exactly one portal, leading back to that level.
 * ref: src/mklev.c mk_knox_portal(), place_branch()
 */
function checkLudios(state: GameState, errs: string[]): void {
  const nh = state.modData['nh'] as Record<string, unknown> | undefined;
  const k = nh?.['knox'] as { dlevel?: unknown } | undefined;
  if (k !== undefined && typeof k.dlevel !== 'number') {
    errs.push('modData.nh.knox has no dlevel');
    return;
  }
  const main = state.dungeons[0];
  const source = typeof k?.dlevel === 'number' && main ? `dlvl${k.dlevel}` : null;
  if (k && main?.id !== 'nh:main')
    errs.push('modData.nh.knox set in a game without the main dungeon');
  const dstOf = (data: unknown): { dungeon?: unknown; dlevel?: unknown } =>
    ((data as { dst?: unknown } | undefined)?.dst ?? {}) as { dungeon?: unknown; dlevel?: unknown };
  let toFort = 0;
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (!lv) continue;
    const portals = lv.traps.filter((t) => t.def === MAGIC_PORTAL);
    if (lv.dungeon === LUDIOS) {
      const back = portals.filter((t) => {
        const d = dstOf(t.data);
        return d.dungeon === main?.id && d.dlevel === k?.dlevel;
      });
      if (source && (portals.length !== 1 || back.length !== 1))
        errs.push(`level ${lid}: Fort Ludios has no single portal back to ${source}`);
      if (!source && portals.length > 0)
        errs.push(`level ${lid}: Fort Ludios has a portal before any vault has one`);
      continue;
    }
    for (const t of portals) {
      if (dstOf(t.data).dungeon !== LUDIOS) continue;
      toFort++;
      const inVault = lv.rooms.some(
        (r) => r.type === VAULT && t.x >= r.lx && t.x <= r.hx && t.y >= r.ly && t.y <= r.hy,
      );
      if (lid !== source)
        errs.push(`level ${lid}: a portal to Fort Ludios, but knox names ${source}`);
      if (!inVault)
        errs.push(`level ${lid}: the portal to Fort Ludios at ${t.x},${t.y} is not in a vault`);
    }
  }
  if (toFort > 1) errs.push(`${toFort} portals to Fort Ludios`);
  if (source && state.levels[source] && toFort === 0)
    errs.push(`level ${source}: knox names it but it has no portal to Fort Ludios`);
}

/**
 * Special levels match the dungeon layout: each placed special level is one of its dungeon's
 * `DungeonDef.special` entries, at most once, inside its level range; one that cannot be left
 * out (chance 100) is placed; and a generated level is built from one of the variants exactly
 * when the layout puts the special level there, with `Level.town` set for a town.
 */
/**
 * Boulders (`ObjectDef.boulder`) lie on floor the hero could walk on (never in walls, stone or a
 * closed door) or on iron bars (a rolling boulder trap's launch spot, as C's mkroll_launch()), and `Level.sokoban` is set only on a level built from a LevelDef with
 * `flags.sokoban` (the rules may be lifted in play, so a level from such a def may lack it).
 * Monsters on boulder squares are not a state invariant: in C an explicitly placed monster (as
 * Orcish Town's orcs at `rndcoord()` spots) or one that survives a scroll of earth's boulder
 * shares the square; `boulderMoveErrors` checks that no monster *moves* onto a boulder.
 */
function checkBoulders(state: GameState, registry: Registry, errs: string[]): void {
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (!e?.c.item || !p || !registry.isObject(e.def) || registry.object(e.def).boulder !== true)
      continue;
    const lv = state.levels[p.level];
    if (!lv || !inBounds(lv, p.x, p.y)) continue; // reported with the entity
    const t = lv.palette[lv.cells[cellIndex(lv, p.x, p.y)] ?? -1];
    if (
      t === undefined ||
      !registry.hasTerrain(t) ||
      (!registry.terrain(t).passable && t !== IRON_BARS)
    )
      errs.push(`boulder ${id}: on non-passable '${t ?? '?'}' at ${p.x},${p.y} on ${p.level}`);
  }
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (lv?.sokoban === undefined) continue;
    const def = lv.def;
    const flagged =
      def !== undefined && registry.levels.some((l) => l.id === def && l.flags?.sokoban === true);
    if (lv.sokoban !== true || !flagged)
      errs.push(`level ${lid}: sokoban flag on a level not built from a sokoban LevelDef`);
  }
}

/** Cell keys (`level:x,y`) of every floor boulder. */
export function boulderCells(state: GameState, registry: Registry): Set<string> {
  const out = new Set<string>();
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (e?.c.item && p && registry.isObject(e.def) && registry.object(e.def).boulder === true)
      out.add(`${p.level}:${p.x},${p.y}`);
  }
  return out;
}

/**
 * Monsters other than the hero that moved during a step onto a square holding a boulder both
 * before and after it (a boulder dropped on a monster, or one broken under it, does not count).
 * `before` maps monster ids, and the hero's, to their cell keys and `bouldersBefore` is
 * `boulderCells` from before the step. A pet that swapped places with the hero onto the boulder
 * she had squeezed onto is allowed: C lets a very small pet do it, and the port lets any pet (see
 * DEVIATIONS, Swapping with a pet), and so may a monster that passes walls (ALLOW_ROCK) or
 * throws rocks (a giant: goodpos() lets it onto a boulder, as when it dodges a kick next to her).
 * ref: src/mon.c mfndpos(), maybe_mnexto(); src/teleport.c goodpos(); src/hack.c
 * domove_swap_with_pet()
 */
export function boulderMoveErrors(
  state: GameState,
  registry: Registry,
  before: ReadonlyMap<number, string>,
  bouldersBefore: ReadonlySet<string>,
): string[] {
  const errs: string[] = [];
  let after: Set<string> | null = null;
  const heroWas = before.get(state.playerId);
  for (const [id, was] of before) {
    const p = state.entities[String(id)]?.c.pos;
    if (!p || id === state.playerId) continue;
    const key = `${p.level}:${p.x},${p.y}`;
    if (key === was || key === heroWas || !bouldersBefore.has(key)) continue;
    const def = state.entities[String(id)]?.def;
    if (
      def !== undefined &&
      registry.isMonster(def) &&
      (registry.monster(def).flags.includes('wallwalk') ||
        registry.monster(def).flags.includes('rockthrow'))
    )
      continue;
    after ??= boulderCells(state, registry);
    if (after.has(key)) errs.push(`monster ${id} moved onto a boulder at ${key}`);
  }
  return errs;
}

function checkSpecialLevels(state: GameState, registry: Registry, errs: string[]): void {
  for (const d of state.dungeons) {
    const def = registry.dungeons.find((x) => x.id === d.id);
    if (!def) continue;
    const specials = def.special ?? [];
    const seen = new Set<string>();
    for (const s of d.special) {
      const sd = specials.find((x) => x.id === s.id);
      if (!sd) {
        errs.push(`dungeon ${d.id}: special level '${s.id}' is not in its DungeonDef`);
        continue;
      }
      if (seen.has(s.id)) errs.push(`dungeon ${d.id}: special level '${s.id}' placed twice`);
      seen.add(s.id);
      if (d.levels !== null) {
        // a chained level counts from where its chain level went (m17: the Wizard's Tower)
        const chainAt =
          sd.chain === undefined ? undefined : d.special.find((x) => x.id === sd.chain)?.dlevel;
        if (sd.chain !== undefined && chainAt === undefined) {
          errs.push(`dungeon ${d.id}: special level '${s.id}' chains to a missing '${sd.chain}'`);
          continue;
        }
        const lo =
          chainAt !== undefined
            ? chainAt + sd.base
            : sd.base < 0
              ? d.levels + sd.base + 1
              : sd.base;
        const hi = lo + (sd.range ?? 1) - 1;
        if (s.dlevel < Math.max(1, lo) || s.dlevel > Math.min(d.levels, hi))
          errs.push(
            `dungeon ${d.id}: special level '${s.id}' on ${s.dlevel}, outside ${lo}..${hi}`,
          );
      }
    }
    for (const sd of specials)
      if ((sd.chance ?? 100) >= 100 && !seen.has(sd.id))
        errs.push(`dungeon ${d.id}: special level '${sd.id}' is missing from the layout`);
  }
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    const layout = lv && state.dungeons.find((d) => d.id === lv.dungeon);
    const def = layout && registry.dungeons.find((x) => x.id === layout.id);
    if (!lv || !layout || !def) continue;
    const placed = layout.special.find((s) => s.dlevel === lv.dlevel);
    const sd = placed && def.special?.find((x) => x.id === placed.id);
    if (sd) {
      if (lv.def === undefined || !sd.variants.includes(lv.def))
        errs.push(`level ${lid}: '${String(lv.def)}' is not a variant of '${sd.id}'`);
      if ((lv.town === true) !== (sd.town === true))
        errs.push(`level ${lid}: town is ${String(lv.town)} on '${sd.id}'`);
    } else {
      const built = lv.def;
      // (m17: a special level's stand-in may be the dungeon's own filler or maze filler)
      const ordinary = built === def.filler || built === def.mazeFiller?.def;
      if (built !== undefined && !ordinary && def.special?.some((x) => x.variants.includes(built)))
        errs.push(`level ${lid}: built from special variant '${built}' off the layout's place`);
    }
  }
}
