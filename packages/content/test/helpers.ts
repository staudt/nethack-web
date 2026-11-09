import {
  createEngine,
  getPlayer,
  newMemory,
  type DefId,
  type GameState,
  type Level,
  type MonsterDef,
  type Pos,
} from '@nh/core';
import { T, vanillaMod } from '../src/index';
import { quiet } from './itemHelpers';

const CHARS: Record<string, DefId> = {
  ' ': T.stone,
  '|': T.vwall,
  '-': T.hwall,
  '.': T.floor,
  '+': T.door_closed,
  X: T.door_locked,
  o: T.doorway,
};

/**
 * Builds a lit level from ASCII rows with the hero at '@'; generated monsters are cleared and
 * random monster generation is off.
 */
export function setup(rows: string[], seed = 1) {
  const engine = createEngine([vanillaMod]);
  const { state } = engine.newGame({ seed });
  quiet(state);
  for (const id of Object.keys(state.entities))
    if (Number(id) !== state.playerId) delete state.entities[id];
  state.currentLevel = 'dlvl1';
  const height = rows.length;
  const width = Math.max(...rows.map((r) => r.length));
  const palette: DefId[] = [T.stone, T.floor];
  const cells: number[] = [];
  let start: Pos = { x: 0, y: 0 };
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      let ch = rows[y]?.[x] ?? ' ';
      if (ch === '@') {
        start = { x, y };
        ch = '.';
      }
      const id = CHARS[ch] ?? T.stone;
      let i = palette.indexOf(id);
      if (i === -1) i = palette.push(id) - 1;
      cells.push(i);
    }
  const level: Level = {
    id: 'dlvl1',
    depth: 1,
    dungeon: 'nh:main',
    dlevel: 1,
    width,
    height,
    palette,
    cells,
    lit: cells.map(() => 1),
    rooms: [],
    traps: [],
    branch: null,
    up: null,
    down: null,
  };
  state.levels['dlvl1'] = level;
  state.memory['dlvl1'] = newMemory(level);
  delete state.objectMemory['dlvl1']; // the generated level's memories do not carry over
  delete state.monsterMemory['dlvl1'];
  const hero = getPlayer(state);
  if (hero.c.pos) Object.assign(hero.c.pos, { level: 'dlvl1', x: start.x, y: start.y });
  if (hero.c.hp) hero.c.hp = { cur: 500, max: 500 };
  const wait = () => engine.stepAll(state, { type: 'wait' });
  wait();
  return { engine, state, level, wait };
}

export function addMon(
  state: GameState,
  def: MonsterDef | string,
  x: number,
  y: number,
  o: { asleep?: boolean; peaceful?: boolean; energy?: number } = {},
): number {
  const defId = typeof def === 'string' ? def : def.id;
  const id = state.nextEntityId++;
  state.entities[String(id)] = {
    id,
    def: defId as DefId,
    c: {
      pos: { level: 'dlvl1', x, y },
      actor: { energy: o.energy ?? 0, speed: 12 },
      hp: { cur: 5, max: 5 },
      monster: {
        level: 0,
        peaceful: o.peaceful ?? false,
        asleep: o.asleep ?? false,
        lastHero: null,
      },
    },
  };
  return id;
}

export const posOf = (s: GameState, id: number): Pos => {
  const p = s.entities[String(id)]?.c.pos;
  return { x: p?.x ?? -1, y: p?.y ?? -1 };
};

/**
 * Every item rnd_defensive_item(), rnd_offensive_item() and rnd_misc_item() can give a monster
 * being made (m14 step 7): starting-gear tests that check m_initweap()'s and m_initinv()'s own
 * items leave these out.
 */
export const MUSE_ITEMS: ReadonlySet<string> = new Set([
  'nh:scroll_of_teleportation',
  'nh:wand_of_teleportation',
  'nh:scroll_of_create_monster',
  'nh:wand_of_create_monster',
  'nh:potion_of_healing',
  'nh:potion_of_extra_healing',
  'nh:potion_of_full_healing',
  'nh:wand_of_digging',
  'nh:wand_of_death',
  'nh:scroll_of_earth',
  'nh:wand_of_striking',
  'nh:potion_of_acid',
  'nh:potion_of_confusion',
  'nh:potion_of_blindness',
  'nh:potion_of_sleeping',
  'nh:potion_of_paralysis',
  'nh:wand_of_magic_missile',
  'nh:wand_of_sleep',
  'nh:wand_of_fire',
  'nh:wand_of_cold',
  'nh:wand_of_lightning',
  'nh:potion_of_polymorph',
  'nh:wand_of_polymorph',
  'nh:amulet_of_life_saving',
  'nh:potion_of_speed',
  'nh:wand_of_speed_monster',
  'nh:potion_of_invisibility',
  'nh:wand_of_make_invisible',
  'nh:potion_of_gain_level',
]);
