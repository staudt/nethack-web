// Monsters that tunnel (dwarves): which squares they may dig into, wielding a pick first, and
// the square they stepped into giving way. A leaf below monster movement (monmove.ts imports it):
// core, terrain, level flags, boulders, items and monster gear only (no trap.ts, no dig.ts).
// dig.ts shares mayDig() and the wall conversion from here.
// ref: src/dig.c mdig_tunnel(), draft_message(); src/hack.c may_dig(); src/monmove.c
// m_digweapon_check(); src/mon.c mfndpos() ALLOW_DIG, mon_allowflags(); src/weapon.c
// mon_wield_item() NEED_PICK_AXE, NEED_AXE, NEED_PICK_OR_AXE
//
// Not ported (DEVIATIONS "Digging"): shop damage (add_damage()), tree fruit (rnd_treefruit_at(): no fruit objects), the Rogue level; mon->weapon_check
// is not kept, so a digger that found nothing to wield is not left wanting a pick.
import {
  getPlayer,
  inTown,
  type Ctx,
  type DefId,
  type Entity,
  type Level,
  type MonsterDef,
  type ObjectDef,
} from '@nh/core';
import { BOULDER, ROCK } from './boulder';
import { doorTrapped } from './btrapstate';
import { blowDoor, mbTrapped } from './btrapped';
import { mksobj } from './items';
import { cavernous, levelFlags, nonDiggable } from './levelflags';
import { uState } from './luck';
import { heroSees, minvent, monFlag, monWep, monWield, whichArmor } from './mongear';
import { P, hasProp } from './props';
import {
  T,
  isObstructedId,
  isSdoorId,
  isStwallId,
  isWallId,
  setTerrain,
  terrainIdAt,
} from './terrain';

const say = (ctx: Ctx, key: string): void => ctx.emit({ type: 'msg', key });

/** Stone, walls and trees inside a non-diggable area cannot be dug. ref: src/hack.c may_dig() */
export function mayDig(ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): boolean {
  const id = terrainIdAt(level, x, y);
  return !((isStwallId(id) || id === T.tree) && nonDiggable(ctx, level, x, y));
}

/**
 * What a room wall dug through becomes: floor on maze levels, corridor on cavernous levels
 * outside town, else an empty doorway (DOOR, D_NODOOR). ref: src/dig.c dig(), mdig_tunnel()
 */
export function wallDugTo(ctx: Pick<Ctx, 'defs'>, level: Level, x: number, y: number): DefId {
  if (levelFlags(ctx, level).maze) return T.floor;
  if (cavernous(ctx, level) && !inTown(level, x, y)) return T.corr;
  return T.doorway;
}

/** ref: include/obj.h is_pick(): a weapon or tool of the pick-axe skill */
export const isPick = (def: ObjectDef): boolean =>
  (def.class === 'weapon' || def.class === 'tool') && def.weapon?.skill === 'pick_axe';

/** ref: include/obj.h is_axe() */
export const isAxe = (def: ObjectDef): boolean =>
  (def.class === 'weapon' || def.class === 'tool') && def.weapon?.skill === 'axe';

/** ref: include/mondata.h tunnels(): M1_TUNNEL */
export const tunnels = (def: MonsterDef): boolean => def.flags.includes('tunnel');

/** ref: include/mondata.h needspick(): M1_NEEDPICK */
export const needsPick = (def: MonsterDef): boolean => def.flags.includes('needpick');

const PICK_AXE: DefId = 'nh:pick_axe';
const MATTOCK: DefId = 'nh:dwarvish_mattock';
const AXE: DefId = 'nh:axe';
const BATTLE_AXE: DefId = 'nh:battle_axe';

/** The first carried object of that kind. ref: src/invent.c m_carrying() */
const mCarrying = (ctx: Ctx, mon: Entity, otyp: DefId): Entity | null =>
  minvent(ctx, mon.id).find((o) => o.def === otyp) ?? null;

/** ref: include/obj.h mwelded() */
const welded = (o: Entity | null): boolean =>
  o?.c.item?.buc === 'cursed' && o.c.item.equipped === 'weapon';

/**
 * What the tunneller can dig into this turn: rock and walls (`rock`) and trees (`tree`). One
 * that needs no pick digs anything; one with a welded weapon (that gave up wielding) only what
 * that weapon digs; otherwise a pick-axe (or a mattock, without a shield) for rock and an axe
 * (or a battle-axe, without a shield) for trees. ref: src/mon.c mfndpos() ALLOW_DIG
 */
export function digAbility(ctx: Ctx, mon: Entity): { rock: boolean; tree: boolean } {
  const def = ctx.defs.monster(mon.def);
  if (!needsPick(def)) return { rock: true, tree: true };
  const mw = monWep(ctx, mon.id);
  if (mw && mw.c.item?.buc === 'cursed' && monFlag(ctx, 'nowep', mon.id)) {
    const od = ctx.defs.object(mw.def);
    return { rock: isPick(od), tree: isAxe(od) };
  }
  const shield = whichArmor(ctx, mon.id, 'shield') !== null;
  return {
    rock: !!mCarrying(ctx, mon, PICK_AXE) || (!!mCarrying(ctx, mon, MATTOCK) && !shield),
    tree: !!mCarrying(ctx, mon, AXE) || (!!mCarrying(ctx, mon, BATTLE_AXE) && !shield),
  };
}

const closedDoorId = (ctx: Pick<Ctx, 'defs'>, id: DefId | undefined): boolean => {
  const door = id === undefined ? undefined : ctx.defs.terrain(id).door;
  return door === 'closed' || door === 'locked';
};

/**
 * Before stepping to (nx, ny), a monster that needs a pick to tunnel wields one: a pick-axe (or,
 * without a shield, a mattock) for rock and walls, an axe for trees, and for a closed door
 * whichever of the mattock, battle-axe, pick-axe or axe it has (C's test there is always true).
 * True if that took its move. ref: src/monmove.c m_digweapon_check(); src/weapon.c
 * mon_wield_item() NEED_PICK_AXE, NEED_AXE, NEED_PICK_OR_AXE ("wields" with a '.': it only
 * plans to dig)
 */
export function mDigweaponCheck(ctx: Ctx, mon: Entity, nx: number, ny: number): boolean {
  const def = ctx.defs.monster(mon.def);
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  const mw = monWep(ctx, mon.id);
  if (!level || !tunnels(def) || !needsPick(def) || welded(mw)) return false;
  const id = terrainIdAt(level, nx, ny);
  const door = closedDoorId(ctx, id);
  // may_dig() is also true on open ground, where nothing is wanted
  if (!door && !mayDig(ctx, level, nx, ny)) return false;
  const shield = whichArmor(ctx, mon.id, 'shield') !== null;
  let obj: Entity | null;
  if (door) {
    obj = mCarrying(ctx, mon, MATTOCK) ?? mCarrying(ctx, mon, BATTLE_AXE);
    if (!obj || shield) obj = mCarrying(ctx, mon, PICK_AXE) ?? mCarrying(ctx, mon, AXE);
  } else if (id === T.tree) {
    if (mw && isAxe(ctx.defs.object(mw.def))) return false;
    obj = mCarrying(ctx, mon, BATTLE_AXE);
    if (!obj || shield) obj = mCarrying(ctx, mon, AXE);
  } else if (isStwallId(id)) {
    if (mw && isPick(ctx.defs.object(mw.def))) return false;
    obj = mCarrying(ctx, mon, PICK_AXE);
    if (!obj && !shield) obj = mCarrying(ctx, mon, MATTOCK);
  } else return false;
  if (!obj) return false;
  return monWield(ctx, mon.id, obj, false);
}

/** Asleep, fainted or knocked out. ref: src/hack.c unconscious() (Unaware) */
function unaware(ctx: Ctx): boolean {
  const r = getPlayer(ctx.state).c.helpless?.reasonKey;
  return r === 'helpless.asleep' || r === 'helpless.fainted' || r === 'helpless.rotten_food';
}

const DRAFT_REACTION = ['enlisting', 'marching', 'protesting', 'fleeing'] as const;

/**
 * "You feel an unexpected draft." (a door broken) or "You feel a draft." (a secret corridor
 * opened); hallucinating, "You feel like you are 4-F." / "...1-A." or "You feel like marching."
 * and the like. ref: src/dig.c draft_message()
 */
function draftMessage(ctx: Ctx, unexpected: boolean): void {
  const hero = getPlayer(ctx.state);
  const halluc = hasProp(hero, P.HALLUC);
  if (unexpected) {
    if (!halluc) return say(ctx, 'mdig.unexpected_draft');
    const a = hero.c.attributes;
    const unfit =
      !!a && (a.str < 6 || a.dex < 6 || a.con < 6 || a.cha < 6 || a.int < 6 || a.wis < 6);
    return say(ctx, unfit ? 'mdig.draft_4f' : 'mdig.draft_1a');
  }
  if (!halluc) return say(ctx, 'mdig.draft');
  const u = uState(ctx.state);
  const sgn = Math.sign(u.alignType);
  let dridx = ctx.rng.rn2(2) + 1 - sgn; // rn1(2, 1 - sgn(u.ualign.type))
  if (u.alignRecord < 4) dridx += ctx.rng.rn2(3) + sgn - 1; // STRIDENT
  say(ctx, `mdig.draft_like.${DRAFT_REACTION[dridx] ?? 'marching'}`);
}

/**
 * The tunneller's square gives way after it stepped there: a secret door or a closed door is
 * broken ("You feel an unexpected draft." one time in three), a secret corridor opens ("You feel
 * a draft."), a wall becomes an opening (floor on maze levels, corridor on cavernous ones outside
 * town; "You hear crashing rock." one time in five), a tree becomes floor, rock becomes corridor
 * and leaves a rock (3 in 12) or a boulder (1 in 12); a trapped door blows up (mb_trapped()).
 * Returns true if the monster died. ref: src/dig.c mdig_tunnel()
 */
export function mdigTunnel(ctx: Ctx, mon: Entity): boolean {
  const p = mon.c.pos;
  const level = p ? ctx.state.levels[p.level] : undefined;
  if (!p || !level) return false;
  const pile = ctx.rng.rnd(12);
  let id = terrainIdAt(level, p.x, p.y);
  // cvt_sdoor_to_door(): a closed (or locked) door
  if (isSdoorId(id)) id = T.door_closed;
  // eats away door if present & closed or locked (no shop damage)
  if (closedDoorId(ctx, id)) {
    if (doorTrapped(ctx, level.id, p.x, p.y)) {
      const sawit = heroSees(ctx, p); // canseemon()
      blowDoor(ctx, level, p.x, p.y); // D_NODOOR
      return mbTrapped(ctx, mon, sawit || heroSees(ctx, p));
    }
    setTerrain(level, p.x, p.y, T.doorway); // D_BROKEN
    // (flags.verbose) "not too often.."
    if (!unaware(ctx) && ctx.rng.rn2(3) === 0) draftMessage(ctx, true);
    return false;
  }
  if (id === T.scorr) {
    setTerrain(level, p.x, p.y, T.corr);
    draftMessage(ctx, false);
    return false;
  }
  if (!isObstructedId(id)) return false; // no dig
  // only rock, trees and walls fall through to this point; mfndpos() never lets it in elsewhere
  if (!mayDig(ctx, level, p.x, p.y)) return false;
  if (isWallId(id)) {
    if (ctx.rng.rn2(5) === 0) say(ctx, 'mdig.crashing_rock'); // flags.verbose
    setTerrain(level, p.x, p.y, wallDugTo(ctx, level, p.x, p.y));
  } else if (id === T.tree) {
    setTerrain(level, p.x, p.y, T.floor); // (no tree fruit: pile is not used)
  } else {
    setTerrain(level, p.x, p.y, T.corr);
    if (pile < 5)
      mksobj(ctx, ctx.defs.object(pile === 1 ? BOULDER : ROCK), {
        at: { level: level.id, x: p.x, y: p.y },
      });
  }
  return false;
}
