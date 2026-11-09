// Spiders spinning webs and the hero cutting a web she force-fights. The web trap itself (being
// caught, escaping, tearing, burning, #untrap) is in trap.ts, untrap.ts and buzz.ts.
// ref: src/monmove.c holds_up_web(), count_webbing_walls(), soko_allow_web(), maybe_spin_web();
// src/hack.c domove_fight_web(); src/weapon.c weapon_descr(); src/zap.c bhit()
import {
  cellIndex,
  cellRules,
  getLevel,
  getPlayer,
  inBounds,
  isPlainFloor,
  trapAt,
  type Ctx,
  type Entity,
  type Level,
  type Msg,
} from '@nh/core';
import { blockersOf } from './boulder';
import { clearPath } from './clearpath';
import { inAnyShop } from './eshk';
import { monWep } from './mongear';
import { isFrozen, mspecUsed, setMspecUsed } from './mstate';
import { canSpotMon, monNam } from './perception';
import { addShopDamage } from './shopdamage';
import { BARE_HANDED, P_UNSKILLED, isBlade, skillLevel, useSkill } from './skills';
import { isSokoban } from './sokoban';
import { acurrstr } from './stats';
import { T, isObstructedId, terrainIdAt } from './terrain';
import { xnameOf } from './objnam';
import { TRAP, cansee, deltrap, maketrap, webmaker } from './trap';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/**
 * Something a web can hang from: off the map, rock, a wall, a tree, a secret door or corridor,
 * an up staircase or ladder, or iron bars. ref: src/monmove.c holds_up_web()
 */
function holdsUpWeb(ctx: Ctx, level: Level, x: number, y: number): boolean {
  if (!inBounds(level, x, y)) return true;
  const id = terrainIdAt(level, x, y);
  if (isObstructedId(id) || id === T.iron_bars) return true;
  return id !== undefined && ctx.defs.terrain(id).stairs === 'up';
}

/** The walls in the four cardinal directions that could hold up a web. ref: count_webbing_walls() */
export function countWebbingWalls(ctx: Ctx, level: Level, x: number, y: number): number {
  return (
    Number(holdsUpWeb(ctx, level, x, y - 1)) +
    Number(holdsUpWeb(ctx, level, x + 1, y)) +
    Number(holdsUpWeb(ctx, level, x, y + 1)) +
    Number(holdsUpWeb(ctx, level, x - 1, y))
  );
}

/**
 * Webs that would interfere with solving Sokoban are rejected: on an unsolved Sokoban level the
 * spinner must see the up stairs ("we really want 'is in same chamber as stairs up'").
 * ref: src/monmove.c soko_allow_web()
 */
function sokoAllowWeb(ctx: Ctx, level: Level, mon: Entity): boolean {
  if (!isSokoban(level)) return true;
  const p = mon.c.pos;
  if (!p) return false;
  const opaque = cellRules(level, ctx.defs).opaque;
  const blocked = blockersOf(ctx, level.id);
  for (let y = 0; y < level.height; y++)
    for (let x = 0; x < level.width; x++) {
      const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
      if (id === undefined || ctx.defs.terrain(id).stairs !== 'up') continue;
      // stairway_find_dir(TRUE): the first up stairway; m_cansee()
      return clearPath(level, opaque, p.x, p.y, x, y, blocked);
    }
  return false;
}

/**
 * After it moved, a cave or giant spider may spin a web on its square: `rn2(1000)` below
 * `(giant ? 15 : 5) * (walls + 1) - 3 * webs on the level`; "The giant spider spins a web." when
 * the square is seen (the web is then seen too), and it cannot spin again for `d(4, 4)` turns. A
 * web spun in a shop is damage the keeper repairs. ref: src/monmove.c maybe_spin_web() (3.7)
 */
export function maybeSpinWeb(ctx: Ctx, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  const p = mon.c.pos;
  if (!webmaker(def) || !p) return;
  const level = getLevel(ctx.state, p.level);
  // helpless(): asleep or unable to move
  if (mon.c.monster?.asleep || isFrozen(ctx, mon.id) || mspecUsed(ctx, mon.id)) return;
  if (trapAt(level, p.x, p.y) || !sokoAllowWeb(ctx, level, mon)) return;
  // maketrap() fails on stairs; core keeps traps off doorways too (checked before the roll, which
  // C draws even there)
  const floor = isPlainFloor(ctx.defs, level, p.x, p.y);
  const webs = level.traps.filter((t) => t.def === TRAP.web).length; // count_traps(WEB)
  const prob =
    (def.id === 'nh:giant_spider' ? 15 : 5) * (countWebbingWalls(ctx, level, p.x, p.y) + 1) -
    3 * webs;
  if (ctx.rng.rn2(1000) >= prob || !floor) return;
  const trap = maketrap(ctx, level.id, p.x, p.y, TRAP.web);
  setMspecUsed(ctx, mon.id, ctx.rng.d(4, 4)); // 4..16
  if (cansee(ctx, level.id, p.x, p.y)) {
    if (canSpotMon(ctx, mon)) say(ctx, 'trap.web.spins', { mon: monNam(ctx, mon) });
    else say(ctx, 'trap.web.something_spins');
    trap.seen = true;
  }
  if (inAnyShop(level, p.x, p.y) && level.id === ctx.state.currentLevel)
    addShopDamage(ctx, p.x, p.y, 0);
}

/** ROCK and is_graystone() */
const GRAYSTONES: readonly string[] = [
  'nh:rock',
  'nh:luckstone',
  'nh:loadstone',
  'nh:touchstone',
  'nh:flint',
];

/**
 * How a weapon is called in "You can't cut a web with a club!" and "You find you must drop your
 * club!": its skill's name (singular), else the object's class ("tool", "gem"...; a corpse, tin,
 * egg, statue, boulder, towel or tin opener by its own name), as a '@' message reference.
 * ref: src/weapon.c weapon_descr()
 */
export function weaponDescr(ctx: Pick<Ctx, 'defs'>, obj: Entity): string {
  const def = ctx.defs.object(obj.def);
  const w = def.weapon;
  let what: string;
  if (w) {
    if (w.role === 'ammo')
      what =
        w.skill === 'sling'
          ? GRAYSTONES.includes(def.id)
            ? '@web.descr.stone'
            : def.class === 'gem'
              ? '@web.descr.gem'
              : `@web.class.${def.class}`
          : w.skill === 'bow'
            ? '@web.descr.arrow'
            : w.skill === 'crossbow'
              ? '@web.descr.bolt'
              : `@skill.${w.skill}`;
    else if (w.skill === 'polearms')
      what = '@web.descr.polearm'; // makesingular()
    else if (def.id === 'nh:grappling_hook') what = '@web.descr.hook';
    else if (def.id === 'nh:dwarvish_mattock') what = '@web.descr.mattock';
    else what = `@skill.${w.skill}`;
  } else if (
    [
      'nh:corpse',
      'nh:tin',
      'nh:egg',
      'nh:statue',
      'nh:boulder',
      'nh:towel',
      'nh:tin_opener',
    ].includes(def.id)
  )
    what = `@${def.nameKey}`;
  else what = `@web.class.${def.class}`;
  return what;
}

/**
 * "You can't cut a web with a club!": weapon_descr(); armor and food stand alone; one is "a X",
 * several "Xs". ref: src/hack.c domove_fight_web()
 */
function cantCutMsg(ctx: Ctx, obj: Entity): Msg {
  const def = ctx.defs.object(obj.def);
  const w = def.weapon;
  const what = weaponDescr(ctx, obj);
  // "armor", "food" and "venom" as-is; else an() or makeplural()
  if (!w && (def.class === 'armor' || def.class === 'food') && what.startsWith('@web.class.'))
    return { key: 'web.cant_cut', params: { what } };
  return {
    key: (obj.c.item?.quantity ?? 1) === 1 ? 'web.cant_cut_an' : 'web.cant_cut_pl',
    params: { what },
  };
}

/**
 * Force-fighting a seen web at (x, y) (no monster there): bare-handed she punches through 1 time
 * in `45 - 5 * (skill - 2)` scaled by Strength, with a blade she cuts through when `rn2(20)` is
 * at most `acurrstr() - 2 + spe + (skill - 2)`, else "You hack/thrash ineffectually at some of
 * the strands."; any other weapon cannot cut it. A success trains the skill and removes the web.
 * Returns true if the web took the move. ref: src/hack.c domove_fight_web() (no Sting, fire
 * artifacts or dual wielding)
 */
export function fightWeb(ctx: Ctx, level: Level, x: number, y: number): boolean {
  const trap = inBounds(level, x, y) ? trapAt(level, x, y) : undefined;
  if (!trap || trap.def !== TRAP.web || !trap.seen) return false;
  const hero = getPlayer(ctx.state);
  const uwep = monWep(ctx, hero.id);
  const wdef = uwep ? ctx.defs.object(uwep.def) : null;
  // uwep_skill_type(): P_NONE (restricted) for a wielded non-weapon
  const wtype = uwep ? (wdef?.weapon?.skill ?? null) : BARE_HANDED;
  // minus_2: restricted or unskilled: -1, basic: 0, skilled: 1, expert: 2, master: 3, ...
  const wskillMinus2 = Math.max(wtype === null ? 0 : skillLevel(ctx, wtype), P_UNSKILLED) - 2;
  // higher value is worse for player; for weaponless, adjust the chance to succeed rather than
  // maybe make two tries
  const roll = ctx.rng.rn2(uwep ? 20 : 45 - 5 * wskillMinus2);
  if (uwep && wdef && !isBlade(wdef)) {
    const m = cantCutMsg(ctx, uwep);
    say(ctx, m.key, m.params);
    return true;
  }
  const str = acurrstr(hero.c.attributes?.str ?? 10);
  if (roll > str - 2 + (uwep ? (uwep.c.item?.spe ?? 0) + wskillMinus2 : 0)) {
    say(ctx, uwep ? 'web.hack' : 'web.thrash');
    return true;
  }
  say(ctx, uwep ? 'web.cut' : 'web.punch');
  // doesn't break "never hit with a wielded weapon" conduct
  if (wtype !== null) useSkill(ctx, wtype, 1);
  deltrap(ctx, level.id, trap);
  return true;
}

/**
 * A thrown or kicked object flying over a web with no monster on it gets stuck there 1 time in 3
 * ("The dagger gets stuck in a web!" when seen; the web is then seen). True if it stops.
 * ref: src/zap.c bhit() THROWN_WEAPON, KICKED_WEAPON
 */
export function stuckInWeb(ctx: Ctx, level: Level, x: number, y: number, obj: Entity): boolean {
  const t = trapAt(level, x, y);
  if (t?.def !== TRAP.web || ctx.rng.rn2(3) !== 0) return false;
  if (cansee(ctx, level.id, x, y)) {
    say(ctx, 'trap.web.obj_stuck', { obj: xnameOf(ctx.state, ctx.defs, obj) });
    t.seen = true;
  }
  return true;
}
