// Naming an object type: #name / #call. ref: src/do_name.c docallcmd() 'o', docall(),
// objtyp_is_callable(), call_ok(); the name shows in xname() as "potion called X" (objnam.ts).
import {
  inventoryOf,
  type ActionDef,
  type Ctx,
  type Entity,
  type Json,
  type ObjectDef,
} from '@nh/core';
import { invOption } from './itemactions';
import { nhData } from './items';
import { isKnown } from './o_init';
import { xnameOf } from './objnam';

/** ref: include/global.h PL_PSIZ: the longest player-given name */
const PL_PSIZ = 63;

/** Classes whose unidentified types can be called (the ones our data has with descriptions). */
const CALLABLE: readonly ObjectDef['class'][] = [
  'potion',
  'scroll',
  'weapon',
  'armor',
  'ring',
  'amulet',
];

/**
 * Whether the type can be given a name. ref: src/do_name.c objtyp_is_callable(): it has a
 * description (an appearance or `descKey`) and is not identified yet, or it already has a name
 * (so it can be renamed or cleared even after it is identified, as call_ok() allows).
 */
function callable(ctx: Pick<Ctx, 'state' | 'defs'>, def: ObjectDef): boolean {
  if (nhData(ctx).called?.[def.id] !== undefined) return true;
  if (!CALLABLE.includes(def.class)) return false;
  const described = def.descKey !== undefined || ctx.state.appearances[def.id] !== undefined;
  return described && !isKnown(ctx.state, ctx.defs, def);
}

/** The callable stacks in the hero's inventory, one per type. */
function candidates(ctx: Ctx): Entity[] {
  const seen = new Set<string>();
  return inventoryOf(ctx.state, ctx.state.playerId).filter((e) => {
    if (seen.has(e.def) || !callable(ctx, ctx.defs.object(e.def))) return false;
    seen.add(e.def);
    return true;
  });
}

/**
 * The name as NetHack stores it: whitespace runs collapse to one space and the ends are trimmed
 * (mungspaces()). A leading '@' is dropped because message parameters starting with it are
 * read as message keys.
 */
function mungspaces(s: string): string {
  return s
    .slice(0, PL_PSIZ)
    .replace(/[\t\n ]+/g, ' ')
    .trim()
    .replace(/^@+/, '');
}

interface CallData {
  item: number;
}

export const callAction: ActionDef = {
  id: 'nh:call',
  labelKey: 'action.nh:call',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: 'nh:call' }, labelKey: 'action.nh:call' }]
      : [],
  // ref: docallcmd() case 'o': getobj("call", call_ok), then docall() -> getlin("Call a ruby potion:")
  perform(ctx) {
    const list = candidates(ctx);
    if (list.length === 0) {
      ctx.emit({ type: 'msg', key: 'call.nothing' });
      return 0;
    }
    ctx.ask(
      {
        id: 'call-pick',
        kind: 'menu',
        key: 'call.pick',
        cancellable: true,
        options: list.map((e) => invOption(ctx, e)),
      },
      'nh:call',
      null,
    );
    return 0;
  },
  answer(ctx, value, raw) {
    const data = raw as unknown as CallData | null;
    if (data === null) {
      // the item was chosen: ask for the name
      const e = typeof value === 'number' ? ctx.state.entities[String(value)] : undefined;
      if (!e?.c.item || e.c.item.carriedBy !== ctx.state.playerId) return 0;
      if (!callable(ctx, ctx.defs.object(e.def))) return 0;
      // ref: docall_xname(): the name as for one item, "Call a ruby potion:"
      const one: Entity = { ...e, c: { ...e.c, item: { ...e.c.item, quantity: 1 } } };
      ctx.ask(
        {
          id: 'call-name',
          kind: 'text',
          key: 'call.prompt',
          params: { item: xnameOf(ctx.state, ctx.defs, one) },
          maxLength: PL_PSIZ,
        },
        'nh:call',
        { item: e.id } satisfies CallData as unknown as Json,
      );
      return 0;
    }
    // ref: docall(): an empty answer (or Escape) cancels; blanks only remove the name
    if (typeof value !== 'string' || value === '') return 0;
    const e = ctx.state.entities[String(data.item)];
    if (!e) return 0;
    const defId = e.def;
    const nh = nhData(ctx);
    const name = mungspaces(value);
    if (name === '') {
      if (nh.called) delete nh.called[defId];
    } else {
      (nh.called ??= {})[defId] = name;
    }
    return 0;
  },
};

export const CALL_ACTIONS: readonly ActionDef[] = [callAction];
