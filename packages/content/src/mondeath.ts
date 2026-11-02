// What happens to the world when a monster dies by the hero's hand.
// ref: src/mon.c xkilled(), mondead(), m_detach()
import { getPlayer, type Ctx, type Entity, type EntityId, type Msg } from '@nh/core';
import { nonliving } from './mondata';
import { canSpotMon, monNam } from './perception';
import { xkilledCorpse } from './corpses';
import { placeOnFloor, weight } from './items';
import { mkobj } from './mkobj';
import { forgetMonster, relobj } from './mongear';
import { forgetMState } from './mstate';
import { xkilledPenalties } from './luck';

/**
 * The monster dies and is removed. Its possessions fall where it stood (mondead() ->
 * m_detach() -> relobj(), before anything else is made), then, for a kill by the hero, the
 * 1 in 6 "treasure drop" and the corpse are made on top of them.
 * ref: src/mon.c xkilled(): `!rn2(6) && !(G_NOCORPSE) && not on the hero && not a Kop` makes
 * mkobj(RANDOM_CLASS, TRUE). Food is deleted unless the monster collects things (M2_COLLECT);
 * small monsters (smaller than MZ_HUMAN) do not leave heavy (owt > 30) or bulky (oc_big =
 * bimanual here) objects. Then corpse_chance() and make_corpse().
 */
export function monsterDied(ctx: Ctx, monId: EntityId, byHero: boolean): void {
  const e = ctx.state.entities[String(monId)];
  if (!e?.c.monster) return;
  const def = ctx.defs.monster(e.def);
  const at = e.c.pos ? { ...e.c.pos } : undefined;
  if (byHero) xkilledPenalties(ctx, e); // ref: xkilled(): punish bad behavior, alignment
  relobj(ctx, monId, at);
  forgetMonster(ctx, monId);
  forgetMState(ctx, monId);
  ctx.remove(monId);
  if (!byHero || !at) return;

  const hero = getPlayer(ctx.state).c.pos;
  const onHero = hero?.level === at.level && hero.x === at.x && hero.y === at.y;
  if (
    ctx.rng.rn2(6) === 0 &&
    !def.genFlags.includes('nocorpse') &&
    !onHero &&
    def.glyph.ch !== 'K'
  ) {
    const id = mkobj(ctx, 'random', { level: at.level });
    const item = id === null ? undefined : ctx.state.entities[String(id)];
    if (id !== null && item) {
      const od = ctx.defs.object(item.def);
      const small = def.size === 'tiny' || def.size === 'small';
      if (od.class === 'food' && !def.flags.includes('collect')) ctx.remove(id);
      else if (small && (weight(ctx.defs, item) > 30 || od.weapon?.bimanual === true))
        ctx.remove(id);
      else placeOnFloor(ctx, id, at.level, at.x, at.y);
    }
  }
  xkilledCorpse(ctx, def, at);
}

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const ent = (ctx: Ctx, id: EntityId): Entity | undefined => ctx.state.entities[String(id)];

/**
 * The monster dies by another monster's hand (or a monster's missile): "The X is killed!" when
 * the hero sees its square, a sad feeling for an unseen pet; its things drop and a corpse may
 * be left (no treasure drop, no experience). ref: src/mon.c monkilled() -> mondied()
 */
export function monkilled(ctx: Ctx, id: EntityId, fltxt: boolean): void {
  const mon = ent(ctx, id);
  if (!mon?.c.monster) return;
  const def = ctx.defs.monster(mon.def);
  if (fltxt && canSpotMon(ctx, mon))
    say(ctx, nonliving(def) ? 'mhitm.is_destroyed' : 'mhitm.is_killed', { mon: monNam(ctx, mon) });
  else if ((mon.c.monster.tame ?? 0) > 0) say(ctx, 'mhitm.sad_feeling');
  mondied(ctx, id);
}

/** ref: src/mon.c mondied(): mondead() and maybe a corpse */
export function mondied(ctx: Ctx, id: EntityId): void {
  const mon = ent(ctx, id);
  if (!mon?.c.monster) return;
  const def = ctx.defs.monster(mon.def);
  const at = mon.c.pos ? { ...mon.c.pos } : undefined;
  relobj(ctx, id, at);
  forgetMonster(ctx, id);
  forgetMState(ctx, id);
  ctx.remove(id);
  if (at) xkilledCorpse(ctx, def, at);
}
