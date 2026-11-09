// A monster whose new form cannot wear its armor: big forms break out of suits, cloaks and shirts,
// small ones slip out of them, handless or tiny ones drop gloves and shields, horned ones lose
// helmets, slithy ones and centaurs their boots. Used by newcham() and new_were(); a leaf over
// mongear, invis and items. ref: src/worn.c mon_break_armor(), m_lose_armor(); src/mondata.c
// sliparm(), breakarm(), num_horns(); include/obj.h WrappingAllowed(), is_flimsy()
//
// Not ported: dragon scales and mail merging (none exist), artifact cloaks, saddles and steeds.
import { getLevel, type Ctx, type Entity, type MonsterDef, type Msg } from '@nh/core';
import { bypassObj } from './bypass';
import { eshkOf } from './eshk';
import { updateMonInvis } from './invis';
import { placeOnFloor } from './items';
import { monWep, whichArmor } from './mongear';
import { monNam } from './perception';
import { surfaceKey } from './terrain';
import { cansee } from './trap';
import { isFlimsy } from './material';
import {
  breakarm,
  hasHorns,
  isWhirlyDef,
  nohands,
  sliparm,
  verysmall,
  wrappingAllowed,
} from './mondata';

const say = (ctx: Ctx, key: string, params?: Msg['params']): void =>
  ctx.emit({ type: 'msg', key, ...(params ? { params } : {}) });

const has = (def: MonsterDef, f: string): boolean => def.flags.includes(f);

export { breakarm, hasHorns, isWhirlyDef, sliparm };

/** ref: src/objnam.c cloak_simple_name() (no alchemy smock) */
export const cloakName = (obj: Entity): string =>
  obj.def === 'nh:robe'
    ? '@monarm.cloak.robe'
    : obj.def === 'nh:mummy_wrapping'
      ? '@monarm.cloak.wrapping'
      : '@monarm.cloak.cloak';

/** mhis()/mhim() from the species (no monster has a gender here), a shopkeeper's own. */
function pronouns(ctx: Ctx, mon: Entity, def: MonsterDef): { his: string; him: string } {
  const e = eshkOf(ctx, mon.id);
  const female = e ? e.female === true : has(def, 'female');
  if (!e && has(def, 'neuter')) return { his: '@pronoun.its', him: '@pronoun.it' };
  return female
    ? { his: '@pronoun.her', him: '@pronoun.her' }
    : { his: '@pronoun.his', him: '@pronoun.him' };
}

/**
 * The worn item comes off the monster: used up (m_useup()) or dropped where it stands
 * (m_lose_armor(), bypassed by the current zap when `polyspot`); either way its worn effects end
 * (update_mon_extrinsics()).
 */
function loseWorn(ctx: Ctx, mon: Entity, obj: Entity, destroy: boolean, polyspot: boolean): void {
  const it = obj.c.item;
  if (!it) return;
  it.equipped = null;
  updateMonInvis(ctx, mon, obj, false);
  if (destroy) {
    ctx.remove(obj.id);
    return;
  }
  const p = mon.c.pos;
  if (!p) return;
  if (polyspot) bypassObj(obj.id);
  placeOnFloor(ctx, obj.id, p.level, p.x, p.y);
}

/**
 * The monster's new form loses what it cannot wear: "The jackal breaks out of its armor!" (or
 * "You hear a cracking sound."), "The jackal's cloak tears apart!", "The jackal's shirt rips to
 * shreds!" (used up, a mummy wrapping on a form that allows it stays); a small, whirly or
 * noncorporeal form lets its suit, cloak and shirt fall ("The gnome's armor falls around him!");
 * a handless or tiny form drops gloves and shield, a horned one its helmet (unless flimsy), a
 * slithy one or a centaur its boots. ref: src/worn.c mon_break_armor()
 */
export function monBreakArmor(ctx: Ctx, mon: Entity, polyspot: boolean): void {
  const p = mon.c.pos;
  if (!p) return;
  const mdat = ctx.defs.monster(mon.def);
  const vis = cansee(ctx, p.level, p.x, p.y);
  const handlessOrTiny = nohands(mdat) || verysmall(mdat);
  const { his, him } = pronouns(ctx, mon, mdat);
  const name = (): string => monNam(ctx, mon);
  const worn = (slot: 'body' | 'cloak' | 'shirt' | 'helm' | 'gloves' | 'boots' | 'shield') =>
    whichArmor(ctx, mon.id, slot);
  let otmp: Entity | null;

  if (breakarm(mdat)) {
    if ((otmp = worn('body'))) {
      if (vis) say(ctx, 'monarm.mon_breaks_out', { mon: name(), his });
      else say(ctx, 'monarm.hear_cracking');
      loseWorn(ctx, mon, otmp, true, polyspot);
    }
    // a mummy wrapping adapts to small and very big sizes
    if ((otmp = worn('cloak')) && (otmp.def !== 'nh:mummy_wrapping' || !wrappingAllowed(mdat))) {
      if (vis) say(ctx, 'monarm.cloak_tears', { mon: name(), cloak: cloakName(otmp) });
      else say(ctx, 'monarm.hear_ripping');
      loseWorn(ctx, mon, otmp, true, polyspot);
    }
    if ((otmp = worn('shirt'))) {
      if (vis) say(ctx, 'monarm.shirt_rips', { mon: name() });
      else say(ctx, 'monarm.hear_ripping');
      loseWorn(ctx, mon, otmp, true, polyspot);
    }
  } else if (sliparm(mdat)) {
    const passesThruClothes = mdat.size !== 'tiny' && mdat.size !== 'small';
    if ((otmp = worn('body'))) {
      if (vis) say(ctx, 'monarm.armor_falls', { mon: name(), him });
      else say(ctx, 'monarm.hear_thud');
      loseWorn(ctx, mon, otmp, false, polyspot);
    }
    if ((otmp = worn('cloak')) && (otmp.def !== 'nh:mummy_wrapping' || !wrappingAllowed(mdat))) {
      if (vis)
        say(ctx, isWhirlyDef(mdat) ? 'monarm.cloak_unsupported' : 'monarm.shrinks_out', {
          mon: name(),
          his,
          cloak: cloakName(otmp),
        });
      loseWorn(ctx, mon, otmp, false, polyspot);
    }
    if ((otmp = worn('shirt'))) {
      if (vis)
        say(ctx, passesThruClothes ? 'monarm.seeps_through' : 'monarm.too_small_shirt', {
          mon: name(),
          his,
        });
      loseWorn(ctx, mon, otmp, false, polyspot);
    }
  }
  if (handlessOrTiny) {
    // [caller needs to handle weapon checks]
    if ((otmp = worn('gloves'))) {
      if (vis)
        say(ctx, monWep(ctx, mon.id) ? 'monarm.drops_gloves_weapon' : 'monarm.drops_gloves', {
          mon: name(),
          his,
        });
      loseWorn(ctx, mon, otmp, false, polyspot);
    }
    if ((otmp = worn('shield'))) {
      if (vis) say(ctx, 'monarm.no_shield', { mon: name(), his });
      else say(ctx, 'monarm.hear_clank');
      loseWorn(ctx, mon, otmp, false, polyspot);
    }
  }
  if (handlessOrTiny || hasHorns(mdat)) {
    // flimsy test for horns matches polyself handling
    if ((otmp = worn('helm')) && (handlessOrTiny || !isFlimsy(ctx.defs.object(otmp.def)))) {
      if (vis)
        say(ctx, 'monarm.helmet_falls', {
          mon: name(),
          surface: surfaceKey(ctx, getLevel(ctx.state, p.level), p.x, p.y),
        });
      else say(ctx, 'monarm.hear_clank');
      loseWorn(ctx, mon, otmp, false, polyspot);
    }
  }
  if (handlessOrTiny || has(mdat, 'slithy') || mdat.glyph.ch === 'C') {
    if ((otmp = worn('boots'))) {
      if (vis) {
        if (isWhirlyDef(mdat)) say(ctx, 'monarm.boots_fall_away', { mon: name() });
        else
          say(ctx, verysmall(mdat) ? 'monarm.boots_slide' : 'monarm.boots_pushed', {
            mon: name(),
            his,
          });
      }
      loseWorn(ctx, mon, otmp, false, polyspot);
    }
  }
  // (no saddles or steeds)
}
