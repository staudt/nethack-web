// The expensive camera: its flash blinds what it is pointed at.
// ref: src/apply.c use_camera(), do_blinding_ray(); src/zap.c bhit() FLASHED_LIGHT,
// zapyourself() EXPENSIVE_CAMERA, lightdamage(), flashburn(); src/uhitm.c flash_hits_mon()
//
// Not ported: being underwater ("would void the warranty"), see_monster_closeup() (no monster
// encyclopedia), the light shown along the beam, a gremlin hero's light damage (as the broken
// wand of light), monster blindness (flash_hits_mon() as zap.ts has it).
import {
  DIRS,
  NORMAL_SPEED,
  cellIndex,
  getLevel,
  getPlayer,
  inBounds,
  type Ctx,
  type DefId,
  type Dir,
  type Entity,
  type Json,
  type Msg,
} from '@nh/core';
import { flashburn } from './buzz';
import { uswallow } from './engulfstate';
import { monInvisible } from './invis';
import { mApType } from './mimicstate';
import { consumeObjCharge } from './music';
import { monNam } from './perception';
import { ceilingKey } from './read';
import { rawDir } from './stethoscope';
import { surfaceKey } from './terrain';
import { mAt } from './wormstate';
import { ZAP_DIRECTIONS, flashHitsMon } from './zap';

export const EXPENSIVE_CAMERA: DefId = 'nh:expensive_camera';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The data of the camera's direction question. */
export const isCameraData = (data: Json): data is { camera: number } =>
  data !== null &&
  typeof data === 'object' &&
  !Array.isArray(data) &&
  typeof data['camera'] === 'number';

/** Applying a camera: "In what direction?". ref: src/apply.c use_camera() */
export function useCamera(ctx: Ctx, obj: Entity, handler: DefId): number {
  ctx.ask(
    {
      id: 'camera-direction',
      kind: 'direction',
      key: 'zap.direction',
      options: [...ZAP_DIRECTIONS],
    },
    handler,
    { camera: obj.id },
  );
  return 0;
}

/**
 * The picture taken toward `value`: with no charges "Nothing happens."; else a charge is used
 * and a cursed camera 1 time in 2, or one aimed at herself, flashes her (blinded for 5 +
 * rnd(25) turns unless she resists); from inside an engulfer "You take a picture of the purple
 * worm's stomach.", up or down "You take a picture of the floor."; else the flash goes out until
 * it meets a monster (an invisible one is flashed and passed through, a mimic posing as an
 * object is passed by) or a wall or closed door. ref: src/apply.c use_camera()
 */
export function answerCamera(ctx: Ctx, value: Json, data: Json): number {
  if (!isCameraData(data)) return 0;
  const obj = ctx.state.entities[String(data.camera)];
  const it = obj?.c.item;
  if (!obj || !it || it.carriedBy !== ctx.state.playerId) return 0;
  const dir = rawDir(value);
  if (dir === undefined) return 0; // ECMD_CANCEL
  if (it.spe <= 0) {
    say(ctx, 'zap.nothing_happens');
    return NORMAL_SPEED;
  }
  consumeObjCharge(ctx, obj);
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  const hp = getPlayer(ctx.state).c.pos;
  if (it.buc === 'cursed' && !ctx.rng.rn2(2)) {
    flashSelf(ctx);
  } else if (engulfer) {
    say(ctx, 'camera.picture_stomach', { mon: monNam(ctx, engulfer) });
  } else if ((dir === 'up' || dir === 'down') && hp) {
    const level = getLevel(ctx.state);
    say(ctx, 'camera.picture', {
      what:
        dir === 'down'
          ? surfaceKey(ctx, level, hp.x, hp.y)
          : `@${ceilingKey(ctx, level, hp.x, hp.y)}`,
    });
  } else if (dir === 'self') {
    flashSelf(ctx);
  } else if (dir !== 'up' && dir !== 'down') {
    doBlindingRay(ctx, dir);
  }
  return NORMAL_SPEED;
}

/**
 * The camera flashes the hero. ref: src/zap.c zapyourself() EXPENSIVE_CAMERA: damage 5,
 * lightdamage() (only a gremlin is hurt: not ported), plus rnd(25), as flashburn()'s duration.
 */
function flashSelf(ctx: Ctx): void {
  const damage = 5 + ctx.rng.rnd(25);
  flashburn(ctx, damage);
}

/**
 * The flash travels until it meets a monster, which flash_hits_mon() handles; an invisible one
 * is flashed on the way and the light goes on. ref: src/apply.c do_blinding_ray(); src/zap.c
 * bhit() FLASHED_LIGHT (range COLNO: the level's width)
 */
function doBlindingRay(ctx: Ctx, dir: Dir): void {
  const level = getLevel(ctx.state);
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return;
  const d = DIRS[dir];
  let { x, y } = hp;
  let range = level.width;
  while (range-- > 0) {
    x += d.x;
    y += d.y;
    if (!inBounds(level, x, y)) break;
    let mon: Entity | null = mAt(ctx.state, level.id, x, y);
    // a mimic posing as an object is not "seen" by the light
    if (mon && mApType(ctx, mon.id) === 'object') mon = null;
    if (mon) {
      // notonhead: a worm's tail is not flashed (flash_hits_mon() returns at once)
      const onHead = mon.c.pos?.x === x && mon.c.pos.y === y;
      if (!monInvisible(ctx, mon)) {
        if (onHead) flashHitsMon(ctx, mon);
        return;
      }
      if (onHead) flashHitsMon(ctx, mon);
    }
    const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
    const t = id === undefined ? undefined : ctx.defs.terrain(id);
    // !ZAP_POS(typ) || closed_door(x, y)
    if (!t || !(t.passable || t.door !== undefined) || t.door === 'closed' || t.door === 'locked')
      break;
  }
}
