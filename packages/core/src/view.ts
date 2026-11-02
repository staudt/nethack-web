import { inventoryOf, isItem, shownId, topObjectEntities } from './objects';
import { senses, shownAs } from './perception';
import { getLevel, getPlayer } from './state';
import type { DefId, Glyph } from './types/common';
import type { Registry } from './types/mod';
import type { GameState } from './types/state';
import type {
  Status,
  ViewCell,
  ViewDelta,
  ViewEntity,
  ViewItem,
  ViewSnapshot,
  ViewUpdate,
} from './types/view';
import { sortedIds } from './util';

/** Bottom-line values (ref: src/botl.c); absent components are simply left out. */
function statusOf(registry: Registry, state: GameState, depth: number): Status {
  const c = getPlayer(state).c;
  const status: Status = { dlvl: depth, turn: state.turn };
  if (c.hp) Object.assign(status, { hp: c.hp.cur, hpmax: c.hp.max });
  if (c.experience) Object.assign(status, { xl: c.experience.level, xp: c.experience.points });
  if (c.attributes) Object.assign(status, c.attributes);
  if (state.gameOver) {
    const g = state.gameOver;
    Object.assign(status, {
      dead: g.kind,
      killer: g.killer,
      endTurn: g.turn,
      endDepth: g.depth,
      endLevel: g.level,
    });
  }
  for (const d of registry.statuses) {
    const v = d.value(state, registry);
    if (v === null) delete status[d.field];
    else status[d.field] = v;
  }
  return status;
}

/** Builds the full player-facing view of the game. Never exposes unseen state. */
export function buildSnapshot(registry: Registry, state: GameState): ViewSnapshot {
  const level = getLevel(state);
  const player = getPlayer(state);
  const pos = player.c.pos;
  if (!pos) throw new Error('Player has no position');

  const glyphs: [DefId, Glyph][] = [
    ...registry.terrains.map((t): [DefId, Glyph] => [t.id, t.glyph]),
    ...registry.roles.map((r): [DefId, Glyph] => [r.id, r.glyph]),
    ...registry.monsters.map((m): [DefId, Glyph] => [m.id, m.glyph]),
    ...registry.objects.map((o): [DefId, Glyph] => [o.id, o.glyph]),
    ...registry.appearances.map((a): [DefId, Glyph] => [a.id, a.glyph]),
    ...registry.traps.map((t): [DefId, Glyph] => [t.id, t.glyph]),
  ];
  glyphs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const legend: Record<DefId, Glyph> = {};
  for (const [id, g] of glyphs) legend[id] = { ch: g.ch, fg: g.fg };

  // Clients see hidden terrain as what it looks like.
  const shown = level.palette.map((id) => registry.terrain(id).looksLike ?? id);
  const memory = state.memory[level.id];
  const visible = state.visible;
  const n = level.width * level.height;
  const liveObjects = topObjectEntities(registry, state, level);
  const objMemory = state.objectMemory[level.id];
  const monMemory = state.monsterMemory[level.id];
  // ref: src/display.c map_trap(): a seen trap stays on the map, under any object
  const traps = new Map<number, DefId>();
  for (const t of level.traps) if (t.seen) traps.set(t.y * level.width + t.x, t.def);
  const cells: ViewCell[] = new Array<ViewCell>(n);
  let vp = 0;
  for (let i = 0; i < n; i++) {
    while (vp < visible.length && (visible[vp] as number) < i) vp++;
    const v = vp < visible.length && visible[vp] === i;
    const m = memory?.[i] ?? -1;
    const cell: ViewCell = { g: m >= 0 ? (shown[m] ?? null) : null, v };
    const live = v ? liveObjects.get(i) : undefined;
    const o = live
      ? shownAs(registry, state, live, shownId(state, live.def))
      : v
        ? undefined
        : objMemory?.[String(i)];
    if (o !== undefined) cell.o = o;
    const mm = v ? undefined : monMemory?.[String(i)];
    if (mm !== undefined) cell.m = mm;
    const t = traps.get(i);
    if (t !== undefined) cell.t = t;
    cells[i] = cell;
  }

  const isVis = new Set(visible);
  const entities: ViewEntity[] = [];
  for (const id of sortedIds(state)) {
    const e = state.entities[String(id)];
    const p = e?.c.pos;
    if (!e || !p || p.level !== level.id || isItem(registry, e)) continue;
    if (e.id === state.playerId) {
      entities.push({ id: e.id, g: e.def, x: p.x, y: p.y });
      continue;
    }
    if (!isVis.has(p.y * level.width + p.x) && !senses(registry, state, e)) continue;
    const ve: ViewEntity = { id: e.id, g: shownAs(registry, state, e, e.def), x: p.x, y: p.y };
    if ((e.c.monster?.tame ?? 0) > 0) ve.tame = true;
    entities.push(ve);
  }

  return {
    kind: 'full',
    levelId: level.id,
    width: level.width,
    height: level.height,
    legend,
    cells,
    entities,
    player: { id: player.id, x: pos.x, y: pos.y },
    turn: state.turn,
    status: statusOf(registry, state, level.depth),
    inventory: inventoryOf(state, player.id).map((e): ViewItem => {
      const item = e.c.item;
      return {
        id: e.id,
        letter: item?.letter ?? null,
        g: shownId(state, e.def),
        cls: registry.object(e.def).class,
        name: registry.itemName(state, e),
        equipped: item?.equipped ?? null,
      };
    }),
  };
}

/** A delta when the level shape is unchanged, otherwise the full snapshot. */
export function diffSnapshot(prev: ViewSnapshot, next: ViewSnapshot): ViewUpdate {
  if (prev.levelId !== next.levelId || prev.width !== next.width || prev.height !== next.height)
    return next;
  const cells: [number, ViewCell][] = [];
  for (let i = 0; i < next.cells.length; i++) {
    const a = prev.cells[i] as ViewCell;
    const b = next.cells[i] as ViewCell;
    if (a.g !== b.g || a.v !== b.v || a.o !== b.o || a.m !== b.m || a.t !== b.t) cells.push([i, b]);
  }
  const delta: ViewDelta = {
    kind: 'delta',
    turn: next.turn,
    cells,
    entities: next.entities,
    player: next.player,
    status: next.status,
    inventory: next.inventory,
  };
  return delta;
}

/** Pure: returns a new snapshot; does not mutate `prev`. */
export function applyUpdate(prev: ViewSnapshot | null, u: ViewUpdate): ViewSnapshot {
  if (u.kind === 'full') return u;
  if (!prev) throw new Error('Cannot apply a delta without a previous snapshot');
  const cells = prev.cells.slice();
  for (const [i, c] of u.cells) cells[i] = c;
  return {
    ...prev,
    cells,
    entities: u.entities,
    player: u.player,
    status: u.status,
    turn: u.turn,
    inventory: u.inventory,
  };
}
