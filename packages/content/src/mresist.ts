// A monster's resistance to an element: its own (the kind's mresists), the artifact it wields,
// the items it wears or wields that confer the resistance, the alchemy smock's pair, and the
// artifacts it carries. A leaf (core, artidef, props' names): the monster attack code, passive
// responses and the artifact attacks share it. ref: src/mondata.c Resists_Elem() for a monster
// (include/monst.h resists_fire() ... resists_ston()); the hero's side is her properties
import { inventoryOf, type Ctx, type Entity } from '@nh/core';
import { defended, defends, defendsWhenCarried } from './artidef';
import { isVampshifter } from './chamstate';
import { P } from './props';

/** A kind's resistance name (MonsterDef.resists) with its property and damage type. */
const ELEM: Readonly<Record<string, { prop: string; ad: string }>> = {
  fire: { prop: P.FIRE_RES, ad: 'fire' },
  cold: { prop: P.COLD_RES, ad: 'cold' },
  sleep: { prop: P.SLEEP_RES, ad: 'slee' },
  disint: { prop: P.DISINT_RES, ad: 'disn' },
  elec: { prop: P.SHOCK_RES, ad: 'elec' },
  poison: { prop: P.POISON_RES, ad: 'drst' },
  acid: { prop: P.ACID_RES, ad: 'acid' },
  ston: { prop: P.STONE_RES, ad: 'ston' },
};

/**
 * The monster resists `mr` (a MonsterDef.resists name: 'fire', 'cold', 'sleep', 'disint',
 * 'elec', 'poison', 'acid', 'ston'): its kind does, or the artifact it wields defends against
 * it, or something it wears or wields (W_ARMOR | W_ACCESSORY | W_WEP) confers it, or a worn
 * alchemy smock (poison and acid), or an artifact it carries defends against it.
 * ref: src/mondata.c Resists_Elem() (no monster intrinsics from eating: the port has none)
 */
export function resists(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity, mr: string): boolean {
  if (ctx.defs.monster(mon.def).resists.includes(mr)) return true;
  const el = ELEM[mr];
  if (!el) return false;
  const inv = inventoryOf(ctx.state, mon.id);
  // check for resistance granted by wielded weapon
  const wep = inv.find((o) => o.c.item?.equipped === 'weapon');
  if (wep?.c.item?.artifact !== undefined && defends(el.ad, wep)) return true;
  // check for resistance granted by worn or carried items
  return inv.some((o) => {
    const slot = o.c.item?.equipped;
    return (
      (!!slot && ctx.defs.object(o.def).prop === el.prop) ||
      // worn apron confers a pair of resistances
      (slot === 'cloak' && o.def === 'nh:alchemy_smock' && (mr === 'poison' || mr === 'acid')) ||
      (o.c.item?.artifact !== undefined && defendsWhenCarried(el.ad, o))
    );
  });
}

/**
 * Whether a monster resists level drain: undead, demons, were creatures, Death and vampire
 * shapeshifters, or one protected against it (defended(): a wielded Excalibur or Stormbringer,
 * black dragon scales). ref: src/mondata.c resists_drli() (the hero's side is exper.ts
 * resistsDrliHero())
 */
export function resistsDrli(ctx: Pick<Ctx, 'state' | 'defs'>, mon: Entity): boolean {
  const def = ctx.defs.monster(mon.def);
  const flags = def.flags;
  if (
    flags.includes('undead') ||
    flags.includes('demon') ||
    flags.includes('were') ||
    def.id === 'nh:death' ||
    isVampshifter(ctx, mon)
  )
    return true;
  return defended(ctx, mon.id, 'drli');
}
