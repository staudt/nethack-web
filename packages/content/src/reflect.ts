// The hero's reflection and where it comes from. A leaf over props.ts and o_init.ts.
// ref: src/muse.c ureflects()
import { getPlayer, inventoryOf, type Ctx, type DefId, type Msg } from '@nh/core';
import { discover } from './o_init';
import { P, hasExtrinsic, hasFromForm } from './props';

/**
 * Whether the hero reflects; when she does and `key` is given, says it with `what` set to the
 * reflecting thing, checked from the outermost to the innermost: her shield (the shield of
 * reflection, learned), her amulet ("medallion", learned), her body armor, her form's scales.
 * ref: src/muse.c ureflects() (no artifact weapons or dragon scales here)
 */
export function ureflects(
  ctx: Pick<Ctx, 'state' | 'defs' | 'emit'>,
  key: string | null,
  params: Msg['params'] = {},
): boolean {
  const h = getPlayer(ctx.state);
  const worn = (slot: string) =>
    inventoryOf(ctx.state, h.id).find(
      (o) => o.c.item?.equipped === slot && ctx.defs.object(o.def).prop === P.REFLECTING,
    );
  let what: string;
  let learn: DefId | null = null;
  const shield = hasExtrinsic(h, P.REFLECTING) ? worn('shield') : undefined;
  const amulet = hasExtrinsic(h, P.REFLECTING) ? worn('amulet') : undefined;
  const suit = hasExtrinsic(h, P.REFLECTING) ? worn('body') : undefined;
  if (shield) {
    what = 'shield';
    learn = shield.def;
  } else if (amulet) {
    what = 'medallion';
    learn = amulet.def;
  } else if (suit) what = 'armor';
  else if (hasFromForm(h, P.REFLECTING)) what = 'scales';
  else return false;
  if (key) {
    ctx.emit({ type: 'msg', key, params: { ...params, what: { key: `reflect.what.${what}` } } });
    if (learn) discover(ctx, learn);
  }
  return true;
}
