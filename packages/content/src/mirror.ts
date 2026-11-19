// The mirror: applied at herself she sees how she looks; aimed at a monster it may stone Medusa,
// freeze a floating eye, confuse an umber hulk, be taken by a nymph or frighten a beast.
// ref: src/apply.c use_mirror(), beautiful(); src/zap.c bhit() INVIS_BEAM
//
// Not ported (DEVIATIONS.md "Mirrors"): infravision (no monster is seen only by it), body parts
// of other forms (always "face"), a called name for the looking glass.
import {
  DIRS,
  NORMAL_SPEED,
  cellIndex,
  getLevel,
  getPlayer,
  inBounds,
  type Ctx,
  type DefId,
  type Entity,
  type Json,
  type Msg,
} from '@nh/core';
import { haseyes } from './adtyping';
import { isVampire, isVampshifter } from './chamstate';
import { uswallow } from './engulfstate';
import { monGender, polyGender } from './gender';
import { hcolor } from './hcolor';
import { MAXULEV } from './hero';
import { isSick } from './hunger';
import { removeFromInventory } from './items';
import { canseemon, heroInvisible, monInvisible, perceives, seeInvisible } from './invis';
import { humanoid, isDemon, isUnicorn } from './mondata';
import { monflee } from './monflee';
import { frozenTime, isCancelled, isFrozen, mcansee, paralyzeMonst, setMConfused } from './mstate';
import { monReflects } from './musestate';
import { nomul } from './nomul';
import { isKnown } from './o_init';
import { monNam } from './perception';
import { P, hasProp, makeConfused, timeoutLeft } from './props';
import { ceilingKey } from './read';
import { mpickobj, removeWornItem } from './steal';
import { rawDir } from './stethoscope';
import { xkilledStoned } from './stoning';
import { surfaceKey } from './terrain';
import { teleRestrict } from './teleport';
import { rlocMon } from './trap';
import { heroForm } from './upoly';
import { uinwater } from './uwater';
import { mAt } from './wormstate';
import { ZAP_DIRECTIONS } from './zap';

export const MIRROR: DefId = 'nh:mirror';

const MEDUSA: DefId = 'nh:medusa';
const FLOATING_EYE: DefId = 'nh:floating_eye';
const UMBER_HULK: DefId = 'nh:umber_hulk';
const AMOROUS_DEMONS: readonly DefId[] = ['nh:incubus', 'nh:succubus'];

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

/** The data of the mirror's direction question. */
export const isMirrorData = (data: Json): data is { mirror: number } =>
  data !== null &&
  typeof data === 'object' &&
  !Array.isArray(data) &&
  typeof data['mirror'] === 'number';

/** Applying a mirror: "In what direction?". ref: src/apply.c use_mirror() getdir() */
export function useMirror(ctx: Ctx, obj: Entity, handler: DefId): number {
  ctx.ask(
    {
      id: 'mirror-direction',
      kind: 'direction',
      key: 'zap.direction',
      options: [...ZAP_DIRECTIONS],
    },
    handler,
    { mirror: obj.id },
  );
  return 0;
}

/**
 * How the hero looks by her Charisma: "sublime" (25) down to "hideous" (3), with "beautiful" /
 * "handsome" and "winsome" / "amiable" by her (polymorphed) gender. ref: src/apply.c beautiful()
 */
export function beautiful(ctx: Pick<Ctx, 'state'>): string {
  const cha = getPlayer(ctx.state).c.attributes?.cha ?? 10;
  const female = polyGender(ctx.state) === 1;
  const word =
    cha >= 25
      ? 'sublime'
      : cha >= 19
        ? 'splendorous'
        : cha >= 16
          ? female
            ? 'beautiful'
            : 'handsome'
          : cha >= 14
            ? female
              ? 'winsome'
              : 'amiable'
            : cha >= 11
              ? 'cute'
              : cha >= 9
                ? 'plain'
                : cha >= 6
                  ? 'homely'
                  : cha >= 4
                    ? 'ugly'
                    : 'hideous';
  return `@mirror.visage.${word}`;
}

/** "mirror" once mirrors are known, else "looking glass". ref: simpleonames() */
const mirrorName = (ctx: Ctx): string =>
  isKnown(ctx.state, ctx.defs, ctx.defs.object(MIRROR)) ? '@nh:mirror' : '@nh:mirror.desc';

/** She looks at herself. ref: src/apply.c use_mirror() `!u.dx && !u.dy && !u.dz` */
function mirrorSelf(ctx: Ctx, useeit: boolean, mirror: string): number {
  const h = getPlayer(ctx.state);
  const visage = beautiful(ctx);
  if (!useeit) {
    say(ctx, 'mirror.cant_see_face', { visage });
    return NORMAL_SPEED;
  }
  const form = heroForm(ctx);
  const halluc = hasProp(h, P.HALLUC);
  if (form?.id === FLOATING_EYE) {
    if (hasProp(h, P.FREE_ACTION)) {
      say(ctx, 'mirror.stiffen');
      return NORMAL_SPEED;
    }
    say(ctx, halluc ? 'mirror.stares_back' : 'mirror.frozen_self', { mirror });
    if (!halluc || !ctx.rng.rn2(4)) {
      const ulevel = h.c.experience?.level ?? 1;
      // gazing into a mirror; the default "You can move again."
      return (
        NORMAL_SPEED +
        nomul(ctx, ctx.rng.rnd(MAXULEV + 6 - ulevel), 'helpless.gazing_mirror', {
          key: 'eat.can_move_again',
        })
      );
    }
    return NORMAL_SPEED;
  }
  if (form && isVampire(form)) say(ctx, 'mirror.no_reflection_you');
  else if (form?.id === UMBER_HULK) {
    say(ctx, 'mirror.not_you');
    makeConfused(ctx, timeoutLeft(ctx.state, h, P.CONFUSION) + ctx.rng.d(3, 4), false);
  } else if (halluc) say(ctx, 'mirror.look', { how: hcolor(ctx, 'blue') });
  else if (isSick(ctx)) say(ctx, 'mirror.look', { how: '@mirror.peaked' });
  else if (['weak', 'fainting', 'fainted', 'starved'].includes(h.c.hunger?.state ?? ''))
    say(ctx, 'mirror.look', { how: '@mirror.undernourished' });
  else if (form) say(ctx, 'mirror.look_like', { form: `@${form.id}` });
  else say(ctx, 'mirror.as_ever', { visage });
  return NORMAL_SPEED;
}

/**
 * The first monster in direction `d` within the level's width, stopping at a wall or a closed
 * door; `notonhead` when it is a worm's tail. ref: src/zap.c bhit() INVIS_BEAM
 */
function mirrorTarget(
  ctx: Ctx,
  d: { x: number; y: number },
): { mon: Entity; onHead: boolean } | null {
  const level = getLevel(ctx.state);
  const hp = getPlayer(ctx.state).c.pos;
  if (!hp) return null;
  let { x, y } = hp;
  let range = level.width;
  while (range-- > 0) {
    x += d.x;
    y += d.y;
    if (!inBounds(level, x, y)) return null;
    const mon = mAt(ctx.state, level.id, x, y);
    if (mon) return { mon, onHead: mon.c.pos?.x === x && mon.c.pos.y === y };
    const id = level.palette[level.cells[cellIndex(level, x, y)] ?? 0];
    const t = id === undefined ? undefined : ctx.defs.terrain(id);
    if (!t || !(t.passable || t.door !== undefined) || t.door === 'closed' || t.door === 'locked')
      return null;
  }
  return null;
}

/**
 * The mirror held toward `value`: cursed, 1 time in 2 "The mirror fogs up and doesn't reflect!";
 * at herself see mirrorSelf(); engulfed "You reflect the purple worm's stomach."; underwater
 * "You reflect the murky water."; up or down "You reflect the floor."; else at the first monster
 * that way (one with eyes, not a worm's tail): asleep, blinded, not noticing an invisible
 * hero's mirror, a vampire or ghost without reflection; Medusa sees her gaze reflected and is
 * stoned (unless she reflects it); a floating eye is frozen `d(level, 70)` turns more (120 one
 * time in 4); an umber hulk confuses itself; a nymph or amorous demon admires itself and takes
 * the mirror away; a beast (not a unicorn, humanoid or demon) is frightened 4 times in 5 (no
 * reaction from a frozen one); else it ignores its reflection. ref: src/apply.c use_mirror()
 */
export function answerMirror(ctx: Ctx, value: Json, data: Json): number {
  if (!isMirrorData(data)) return 0;
  const obj = ctx.state.entities[String(data.mirror)];
  const it = obj?.c.item;
  if (!obj || !it || it.carriedBy !== ctx.state.playerId) return 0;
  const dir = rawDir(value);
  if (dir === undefined) return 0; // ECMD_CANCEL
  const h = getPlayer(ctx.state);
  const blind = hasProp(h, P.BLINDED);
  const invisMirror = heroInvisible(ctx.state);
  const useeit = !blind && (!invisMirror || seeInvisible(ctx.state));
  const mirror = mirrorName(ctx);
  if (it.buc === 'cursed' && !ctx.rng.rn2(2)) {
    if (!blind) say(ctx, 'mirror.fogs', { mirror });
    else say(ctx, 'invoke.nothing_seems');
    return NORMAL_SPEED;
  }
  if (dir === 'self') return mirrorSelf(ctx, useeit, mirror);
  const sw = uswallow(ctx);
  const engulfer = sw ? ctx.state.entities[String(sw.mon)] : undefined;
  if (engulfer) {
    if (useeit) say(ctx, 'mirror.reflect_stomach', { mon: monNam(ctx, engulfer) });
    return NORMAL_SPEED;
  }
  if (uinwater(ctx)) {
    if (useeit) say(ctx, hasProp(h, P.HALLUC) ? 'mirror.fish_makeup' : 'mirror.murky_water');
    return NORMAL_SPEED;
  }
  const hp = h.c.pos;
  if (dir === 'up' || dir === 'down') {
    if (useeit && hp) {
      const level = getLevel(ctx.state);
      say(ctx, 'mirror.reflect', {
        what:
          dir === 'down'
            ? surfaceKey(ctx, level, hp.x, hp.y)
            : `@${ceilingKey(ctx, level, hp.x, hp.y)}`,
      });
    }
    return NORMAL_SPEED;
  }
  const target = mirrorTarget(ctx, DIRS[dir]);
  if (!target || !haseyes(ctx, target.mon) || !target.onHead) return NORMAL_SPEED;
  mirrorAtMonster(ctx, obj, target.mon, invisMirror, mirror);
  return NORMAL_SPEED;
}

/** What a monster does with the hero's reflection (see answerMirror()). */
function mirrorAtMonster(
  ctx: Ctx,
  obj: Entity,
  mon: Entity,
  invisMirror: boolean,
  mirror: string,
): void {
  const m = mon.c.monster;
  if (!m) return;
  const h = getPlayer(ctx.state);
  const def = ctx.defs.monster(mon.def);
  const vis = canseemon(ctx, mon);
  const name = monNam(ctx, mon);
  const minvis = monInvisible(ctx, mon);
  // whether monster is able to use its vision-based capabilities
  const monable = !isCancelled(ctx, mon.id) && (!minvis || perceives(def));
  const mlet = def.glyph.ch;
  if (m.asleep) {
    if (vis) say(ctx, 'mirror.too_tired', { mon: name, mirror });
  } else if (!mcansee(ctx, mon.id)) {
    if (vis) say(ctx, 'mirror.cant_see_anything', { mon: name });
  } else if (invisMirror && !perceives(def)) {
    if (vis) say(ctx, 'mirror.fails_to_notice', { mon: name, mirror });
  } else if (mlet === 'V' || mlet === ' ' || isVampshifter(ctx, mon)) {
    if (vis) say(ctx, 'mirror.no_reflection', { mon: name });
  } else if (monable && mon.def === MEDUSA) {
    if (monReflects(ctx, mon, 'muse.reflect.gaze_away')) return;
    if (vis) say(ctx, 'stone.is_turned', { mon: name });
    say(ctx, 'combat.you_kill', { mon: name }); // killed(mtmp): xkilled(XKILL_GIVEMSG)
    xkilledStoned(ctx, mon);
  } else if (monable && mon.def === FLOATING_EYE) {
    const damd = def.attacks[0]?.d ?? 70;
    let tmp = ctx.rng.d(m.level, damd);
    if (!ctx.rng.rn2(4)) tmp = 120;
    if (vis) say(ctx, 'mirror.frozen', { mon: name });
    else say(ctx, 'mirror.hear_stop');
    paralyzeMonst(ctx, mon.id, frozenTime(ctx, mon.id) + tmp);
  } else if (monable && mon.def === UMBER_HULK) {
    if (vis) say(ctx, 'mirror.confuses_itself', { mon: name });
    setMConfused(ctx, mon.id, true);
  } else if (monable && (mlet === 'n' || AMOROUS_DEMONS.includes(mon.def))) {
    if (vis) {
      // "<mon> admires herself in your mirror." "She takes it!"
      const g = monGender(ctx, mon);
      say(ctx, `mirror.admires.${g}`, { mon: name, mirror });
      say(ctx, `mirror.takes_it.${g}`);
    } else say(ctx, 'mirror.steals', { mirror });
    // setnotworn(): in case mirror was wielded
    if (obj.c.item?.equipped) removeWornItem(ctx, obj);
    removeFromInventory(ctx, obj.id); // freeinv()
    mpickobj(ctx, mon.id, obj);
    if (!teleRestrict(ctx, mon)) rlocMon(ctx, mon, true);
  } else if (
    !isUnicorn(def) &&
    !humanoid(def) &&
    !isDemon(def) &&
    (!minvis || perceives(def)) &&
    ctx.rng.rn2(5)
  ) {
    if (isFrozen(ctx, mon.id)) {
      if (vis) say(ctx, 'mirror.no_reaction', { mon: name });
      else say(ctx, 'mirror.silly');
    } else {
      if (vis) say(ctx, 'mirror.frightened', { mon: name });
      monflee(ctx, mon.id, ctx.rng.d(2, 4), false, false);
    }
  } else if (!hasProp(h, P.BLINDED)) {
    if (minvis && !seeInvisible(ctx.state)) {
      // (nothing)
    } else if (minvis && !perceives(def)) say(ctx, 'mirror.doesnt_notice', { mon: name });
    else say(ctx, 'mirror.ignores', { mon: name });
  }
}
