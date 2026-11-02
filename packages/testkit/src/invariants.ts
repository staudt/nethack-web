import {
  cellIndex,
  inBounds,
  isJsonPlain,
  isPlainFloor,
  sortedIds,
  stateHash,
  type EquipSlot,
  type GameState,
  type ItemComponent,
  type ObjectDef,
  type Registry,
} from '@nh/core';

/** Returns a list of violated invariants; empty means the state is healthy. */
export function checkInvariants(state: GameState, registry: Registry): string[] {
  const errs: string[] = [];
  const plain = isJsonPlain(state);
  if (!plain) errs.push('state is not JSON-plain');

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

  const seen = new Map<string, number>();
  for (const id of sortedIds(state)) {
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
    const pal = lv.palette[lv.cells[cellIndex(lv, p.x, p.y)] ?? -1];
    if (pal === undefined || !registry.hasTerrain(pal) || !registry.terrain(pal).passable) {
      errs.push(`entity ${id}: on impassable cell (${pal ?? '?'}) at ${p.x},${p.y}`);
    }
    // Objects pile up; only creatures need a cell to themselves.
    if (e.c.item) continue;
    const key = `${p.level}:${p.x},${p.y}`;
    const other = seen.get(key);
    if (other !== undefined) errs.push(`entities ${other} and ${id} share cell ${key}`);
    else seen.set(key, id);
  }

  // Items: exactly one place (floor, carrier or container), a living carrier, unique inventory
  // letters per carrier.
  const letters = new Map<string, number>();
  for (const id of sortedIds(state)) {
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

  checkEquipment(state, registry, errs);
  checkProps(state, errs);
  checkDoors(state, registry, errs);
  checkTraps(state, registry, errs);
  checkMonsterMemory(state, registry, errs);
  checkFleeing(state, errs);

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
  for (const id of sortedIds(state)) {
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

  if (plain) {
    const back = JSON.parse(JSON.stringify(state)) as GameState;
    if (stateHash(back) !== stateHash(state)) errs.push('JSON round-trip changes the state hash');
  }
  return errs;
}

const INVLET = /^[$a-zA-Z#]$/;

/**
 * A contained item's container is an existing container item, and following containers upward
 * ends at an item that is not contained (no nesting loop).
 */
function checkContained(
  state: GameState,
  registry: Registry,
  id: number,
  item: ItemComponent,
  errs: string[],
): void {
  const box = state.entities[String(item.containedIn)];
  if (!box?.c.item || !registry.isObject(box.def) || !registry.object(box.def).container) {
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
function checkEquipment(state: GameState, registry: Registry, errs: string[]): void {
  const slots = new Map<string, number>();
  for (const id of sortedIds(state)) {
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
function checkProps(state: GameState, errs: string[]): void {
  for (const id of sortedIds(state)) {
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
 * full; the rule holds for scenario levels with a door in a wall too.
 */
function checkDoors(state: GameState, registry: Registry, errs: string[]): void {
  for (const lid of Object.keys(state.levels).sort()) {
    const lv = state.levels[lid];
    if (!lv) continue;
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

/** Remembered monsters: keys are in-bounds cell indices of a known level, values registered monsters. */
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
      if (def === undefined || !registry.isMonster(def)) {
        errs.push(`monsterMemory ${lid}: '${String(def)}' at ${k} is not a registered monster`);
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
