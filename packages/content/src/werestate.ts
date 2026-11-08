// Lycanthropy state and the were creatures' two forms. A leaf module: the hero's u.ulycn kept in
// the content mod's data, the form tables, the def swap (C's set_mon_data()) and the true form
// restored at death. were.ts (changing form, summoning help) sits above it.
// ref: include/you.h u.ulycn; src/were.c counter_were(), were_beastie(), set_ulycn(),
// you_unwere(); src/mon.c mondead() "restore chameleon, lycanthropes to true form at death";
// include/mondata.h is_were()
import type { Ctx, DefId, Entity, MonsterDef } from '@nh/core';

interface WereData {
  /** u.ulycn: the beast form whose lycanthropy the hero has caught (absent: NON_PM) */
  ulycn?: DefId;
}

const data = (state: Ctx['state'], create: boolean): WereData | null => {
  const md = state.modData;
  let d = md['nh'] as unknown as WereData | undefined;
  if (typeof d !== 'object' || d === null) {
    if (!create) return null;
    d = {};
    md['nh'] = d as unknown as (typeof md)[string];
  }
  return d;
};

/** u.ulycn: the beast form of the hero's lycanthropy, or null (NON_PM). */
export const ulycn = (state: Readonly<Ctx['state']>): DefId | null =>
  data(state as Ctx['state'], false)?.ulycn ?? null;

/**
 * Lycanthropy is being caught (`which`, the beast form) or cured (null), with no shape change.
 * ref: src/were.c set_ulycn() (set_uasmon()'s Drain_resistance follows from u.ulycn: see
 * resistsDrliHero())
 */
export function setUlycn(ctx: Pick<Ctx, 'state'>, which: DefId | null): void {
  if (which !== null) {
    const d = data(ctx.state, true);
    if (d) d.ulycn = which;
  } else {
    const d = data(ctx.state, false);
    if (d && d.ulycn !== undefined) delete d.ulycn;
  }
}

/**
 * The hero is cured of lycanthropy: "You feel purified." when `purify`. The polymorphed half
 * (rehumanize() from beast form, or the u.mtimedone countdown) is 7f.
 * ref: src/were.c you_unwere()
 */
export function youUnwere(ctx: Pick<Ctx, 'state' | 'emit'>, purify: boolean): void {
  if (purify) {
    ctx.emit({ type: 'msg', key: 'were.purified' });
    setUlycn(ctx, null); // cure lycanthropy
  }
  // 7f: `if (!Unchanging && is_were(youmonst.data) && ...) rehumanize()`
}

/** ref: include/mondata.h is_were() (M2_WERE) */
export const isWere = (def: MonsterDef): boolean => def.flags.includes('were');

/** ref: include/mondata.h is_human() (M2_HUMAN): a were creature's human form */
export const isHumanForm = (def: MonsterDef): boolean => def.flags.includes('human');

/** ref: src/were.c counter_were(): the other form of a were creature */
const COUNTER_WERE: Readonly<Record<string, string>> = {
  'nh:werewolf': 'nh:human_werewolf',
  'nh:human_werewolf': 'nh:werewolf',
  'nh:werejackal': 'nh:human_werejackal',
  'nh:human_werejackal': 'nh:werejackal',
  'nh:wererat': 'nh:human_wererat',
  'nh:human_wererat': 'nh:wererat',
};

/** The other form of a were creature, or null (NON_PM). ref: src/were.c counter_were() */
export const counterWere = (id: string): DefId | null => (COUNTER_WERE[id] as DefId) ?? null;

/**
 * The were creature's beast form a monster like it belongs to (rats to the wererat, jackals,
 * foxes and coyotes to the werejackal, wolves, wargs and winter wolves to the werewolf), or null.
 * ref: src/were.c were_beastie() (for the polymorphed hero: 7f)
 */
export function wereBeastie(id: string): DefId | null {
  switch (id) {
    case 'nh:wererat':
    case 'nh:sewer_rat':
    case 'nh:giant_rat':
    case 'nh:rabid_rat':
      return 'nh:wererat' as DefId;
    case 'nh:werejackal':
    case 'nh:jackal':
    case 'nh:fox':
    case 'nh:coyote':
      return 'nh:werejackal' as DefId;
    case 'nh:werewolf':
    case 'nh:wolf':
    case 'nh:warg':
    case 'nh:winter_wolf':
    case 'nh:winter_wolf_cub':
      return 'nh:werewolf' as DefId;
    default:
      return null;
  }
}

/**
 * The monster becomes `def`: its type and with it its speed (the movement the brain gains is the
 * actor's speed). ref: src/mon.c set_mon_data() (no polymorph bookkeeping: m10's growUp() keeps
 * its own swap, see the m9 plan's step 7 notes)
 */
export function setMonData(mon: Entity, def: MonsterDef): void {
  mon.def = def.id;
  if (mon.c.actor) mon.c.actor.speed = def.speed;
}

/**
 * A dying were creature in beast form goes back to its human form first, so the kill is counted
 * and the corpse made as the human. ref: src/mon.c mondead()
 */
export function restoreWereForm(ctx: Pick<Ctx, 'defs'>, mon: Entity): void {
  const def = ctx.defs.monster(mon.def);
  if (!isWere(def) || isHumanForm(def)) return;
  const human = counterWere(mon.def);
  if (human && ctx.defs.isMonster(human)) setMonData(mon, ctx.defs.monster(human));
}
