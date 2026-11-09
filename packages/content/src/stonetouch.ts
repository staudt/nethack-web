// Touching a cockatrice corpse (or a cockatrice) with bare skin: instant petrification. Kept
// apart from stoning.ts (which sits above the eating and death code) so that the item actions
// (wielding, picking up, throwing, kicking) can call it without an import cycle.
// ref: src/trap.c instapetrify(); src/pickup.c fatal_corpse_mistake(); src/wield.c
// cant_wield_corpse(); src/dothrow.c throw_obj(); src/dokick.c really_kick_object()
import { getPlayer, type Ctx, type Entity, type Msg } from '@nh/core';
import { done } from './end';
import { whichArmor } from './mongear';
import { P, hasProp } from './props';
import { touchPetrifies } from './stonestate';
import { uPolyStoneGolem } from './upoly';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const hero = (ctx: Ctx): Entity => getPlayer(ctx.state);

/** The corpse's name as a message, singular ("cockatrice corpse"). */
export const corpseName = (corpse: Entity): Msg => ({
  key: 'nh:corpse',
  params: { mon: `@${corpse.c.item?.corpseOf ?? ''}` },
});

/** A corpse that petrifies whoever touches it (a cockatrice's or a chickatrice's). */
export function petrifyingCorpse(ctx: Pick<Ctx, 'defs'>, obj: Entity): boolean {
  const of = obj.c.item?.corpseOf;
  return (
    obj.def === 'nh:corpse' &&
    of !== undefined &&
    ctx.defs.isMonster(of) &&
    touchPetrifies(ctx.defs.monster(of))
  );
}

/** The hero touches the corpse with bare hands (or feet): no gloves, no resistance. */
const bareTouch = (ctx: Ctx, obj: Entity, slot: 'gloves' | 'boots'): boolean =>
  petrifyingCorpse(ctx, obj) &&
  !whichArmor(ctx, ctx.state.playerId, slot) &&
  !hasProp(hero(ctx), P.STONE_RES);

/**
 * The hero turns to stone at once ("You turn to stone..."), unless she resists petrification.
 * `killer` is the death reason key. A golem form becomes a stone golem instead.
 * ref: src/trap.c instapetrify()
 */
export function instapetrify(ctx: Ctx, killer: string): void {
  if (hasProp(hero(ctx), P.STONE_RES)) return;
  if (uPolyStoneGolem(ctx)) return;
  say(ctx, 'stone.you_turn');
  done(ctx, killer, 'stoning');
}

/**
 * Picking up (or otherwise handling) a cockatrice corpse bare-handed: "Touching a cockatrice
 * corpse is a fatal mistake." Returns true when it killed her (the caller stops; she may have
 * been life-saved). `remotely`: telekinesis. ref: src/pickup.c fatal_corpse_mistake()
 */
export function fatalCorpseMistake(ctx: Ctx, obj: Entity, remotely = false): boolean {
  if (remotely || !bareTouch(ctx, obj, 'gloves')) return false;
  say(ctx, 'stone.fatal_mistake', { item: corpseName(obj) });
  instapetrify(ctx, `@killer.ston.corpse.${obj.c.item?.corpseOf ?? ''}`);
  return true;
}

/**
 * Wielding a cockatrice corpse without gloves: "You wield the cockatrice corpse in your bare
 * hands." and she turns to stone; it is not wielded. ref: src/wield.c cant_wield_corpse()
 */
export function cantWieldCorpse(ctx: Ctx, obj: Entity): boolean {
  if (!bareTouch(ctx, obj, 'gloves')) return false;
  say(ctx, 'stone.wield_bare', { item: corpseName(obj) });
  instapetrify(ctx, `@killer.ston.wielding.${obj.c.item?.corpseOf ?? ''}`);
  return true;
}

/**
 * Throwing (`'throw'`, gloves protect) or kicking (`'kick'`, boots protect) a cockatrice corpse
 * bare-handed or barefoot: "You throw the cockatrice corpse with your bare hands." and she turns
 * to stone. Returns true when she touched it. ref: src/dothrow.c throw_obj(), src/dokick.c
 * really_kick_object()
 */
export function bareCorpseTouch(ctx: Ctx, obj: Entity, how: 'throw' | 'kick'): boolean {
  if (!bareTouch(ctx, obj, how === 'throw' ? 'gloves' : 'boots')) return false;
  say(ctx, `stone.${how}_bare`, { item: corpseName(obj) });
  instapetrify(
    ctx,
    `@killer.ston.${how === 'throw' ? 'throwing' : 'kicking'}.${obj.c.item?.corpseOf ?? ''}`,
  );
  return true;
}
