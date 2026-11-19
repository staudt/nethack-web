// Naming: #name / #call. "What do you want to name?" offers C's two inventory entries: a
// particular object (do_oname(): its own name, which can make an artifact) and the type of an
// object (docall(): "potion called X"). ref: src/do_name.c docallcmd() 'i' and 'o', do_oname(),
// name_ok(), name_from_player(), docall(), objtyp_is_callable(), call_ok(); the names show in
// xname() as "dagger named X" and "potion called X" (objnam.ts).
import {
  inventoryOf,
  type ActionDef,
  type Ctx,
  type Entity,
  type Json,
  type ObjectDef,
} from '@nh/core';
import { onameObj, restrictName } from './artiname';
import { PL_PSIZ, artifactName, existArtifact } from './artistate';
import { wipeoutText } from './engr';
import { invOption } from './itemactions';
import { nhData } from './items';
import { isKnown } from './o_init';
import { xnameOf } from './objnam';

/** Classes whose unidentified types can be called (the ones our data has with descriptions). */
const CALLABLE: readonly ObjectDef['class'][] = [
  'potion',
  'scroll',
  'weapon',
  'armor',
  'ring',
  'amulet',
  'wand',
  'spellbook',
  'gem',
];

/**
 * Whether the type can be given a name. ref: src/do_name.c objtyp_is_callable(): it has a
 * description (an appearance or `descKey`) and is not identified yet, or it already has a name
 * (so it can be renamed or cleared even after it is identified, as call_ok() allows); never
 * either Amulet of Yendor.
 */
function callable(ctx: Pick<Ctx, 'state' | 'defs'>, def: ObjectDef): boolean {
  // "the Amulet doesn't like being called names": calling a real and a fake one distinct names
  // would tell which is which
  if (def.id === 'nh:amulet_of_yendor' || def.id === 'nh:fake_amulet_of_yendor') return false;
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
 * (mungspaces()), then it is cut to PL_PSIZ - 1 characters; null for an empty answer or Escape
 * (cancel). A leading '@' is dropped because message parameters starting with it are read as
 * message keys. ref: src/do_name.c name_from_player()
 */
function nameFromPlayer(value: Json): string | null {
  if (typeof value !== 'string' || value === '') return null;
  return value
    .replace(/[\t\n ]+/g, ' ')
    .trim()
    .slice(0, PL_PSIZ - 1)
    .replace(/^@+/, '')
    .trim();
}

/** What the prompt chain carries (null: the type pick, `item`: the type's name). */
type CallData = { item: number } | { step: 'what' } | { step: 'obj' } | { oname: number };

const ask = (ctx: Ctx, prompt: Parameters<Ctx['ask']>[0], data: CallData | null): void =>
  ctx.ask(prompt, 'nh:call', data as unknown as Json);

/** The hero's object with this id, or null. */
function carried(ctx: Ctx, value: Json): Entity | null {
  const e = typeof value === 'number' ? ctx.state.entities[String(value)] : undefined;
  return e?.c.item && e.c.item.carriedBy === ctx.state.playerId ? e : null;
}

/**
 * The objects that can be named, likely ones first: anything but gold; artifacts are listed last
 * (GETOBJ_DOWNPLAY: naming them fails; every object is seen here, dknown).
 * ref: src/do_name.c name_ok()
 */
function nameables(ctx: Ctx): Entity[] {
  const inv = inventoryOf(ctx.state, ctx.state.playerId).filter(
    (e) => ctx.defs.object(e.def).class !== 'coin',
  );
  return [
    ...inv.filter((e) => e.c.item?.artifact === undefined),
    ...inv.filter((e) => e.c.item?.artifact !== undefined),
  ];
}

/** ref: docallcmd() case 'o': getobj("call", call_ok), then docall() */
function pickType(ctx: Ctx): void {
  const list = candidates(ctx);
  if (list.length === 0) {
    ctx.emit({ type: 'msg', key: 'call.nothing' });
    return;
  }
  ask(
    ctx,
    {
      id: 'call-pick',
      kind: 'menu',
      key: 'call.pick',
      cancellable: true,
      options: list.map((e) => invOption(ctx, e)),
    },
    null,
  );
}

/** ref: docallcmd() case 'i': getobj("name", name_ok), then do_oname() */
function pickObject(ctx: Ctx): void {
  const list = nameables(ctx);
  if (list.length === 0) {
    ctx.emit({ type: 'msg', key: 'name.nothing' });
    return;
  }
  ask(
    ctx,
    {
      id: 'name-pick',
      kind: 'menu',
      key: 'name.pick',
      cancellable: true,
      options: list.map((e) => invOption(ctx, e)),
    },
    { step: 'obj' },
  );
}

/**
 * do_oname()'s question: "What do you want to name this elven dagger?" ("these" for a stack),
 * with the object's xname(). The current name is not offered as a default answer (C does that
 * only with EDIT_GETLIN, off by default). ref: src/do_name.c do_oname(), safe_oname()
 */
function askObjectName(ctx: Ctx, obj: Entity): void {
  const plural = (obj.c.item?.quantity ?? 1) > 1;
  ask(
    ctx,
    {
      id: 'name-text',
      kind: 'text',
      key: plural ? 'name.prompt.plural' : 'name.prompt',
      params: { item: xnameOf(ctx.state, ctx.defs, obj) },
      maxLength: PL_PSIZ,
    },
    { oname: obj.id },
  );
}

/**
 * Names one object: an artifact resists; an artifact name the object may not have (restricted,
 * or that artifact already exists) makes the hand slip and scuff one or two letters of it
 * ("While engraving, your hand slips." / "You engrave: "Stimg"."), and the object gets the
 * scuffed name; the right name on the right type makes the artifact (canonical capitalisation;
 * found and known); an all-blank name removes the name. The slip's count comes from the
 * cosmetic rng, as C's rnd_on_display_rng(2), and its letters from the game rng, as C's
 * wipeout_text(). No illiteracy conduct and no livelog. ref: src/do_name.c do_oname()
 */
function doOname(ctx: Ctx, obj: Entity, name: string): void {
  const it = obj.c.item;
  if (!it) return;
  if (it.artifact !== undefined) {
    // this used to give "The artifact seems to resist the attempt." but resisting is definite
    ctx.emit({
      type: 'msg',
      key: it.name ? 'name.resists' : 'name.resists_artifact',
      params: it.name ? { name: `=${it.name}` } : {},
    });
    return;
  }
  let buf = name;
  // relax restrictions over proper capitalization for artifacts
  const a = artifactName(buf, true);
  if (a && (restrictName(ctx, obj, a.name) || existArtifact(ctx.state, obj.def, a.name))) {
    // substitute canonical spelling before slippage; for "the Foo of Bar", only scuff "Foo of
    // Bar" (it must eventually change a nonspace: the name is a valid artifact name)
    const the = /^the /i.exec(a.name)?.[0] ?? '';
    let rest = a.name.slice(the.length);
    const orig = rest;
    do rest = wipeoutText(ctx.rng, rest, ctx.cosmetic.rnd(2), 0);
    while (rest === orig);
    buf = the + rest;
    ctx.emit({ type: 'msg', key: 'name.slips' });
    ctx.emit({ type: 'msg', key: 'name.engrave', params: { text: `=${buf}` } });
  } else if (a && a.base === obj.def) {
    // naming will change it into an artifact so use canonical capitalization (Sting or Orcrist)
    buf = a.name;
  }
  onameObj(ctx, obj, buf.replace(/^@+/, ''), 'named', true);
}

export const callAction: ActionDef = {
  id: 'nh:call',
  labelKey: 'action.nh:call',
  handles: 'mod',
  offer: (_ctx, target) =>
    target.kind === 'self'
      ? [{ action: { type: 'mod', action: 'nh:call' }, labelKey: 'action.nh:call' }]
      : [],
  // ref: docallcmd(): "What do you want to name?" (of its entries, the two for the inventory)
  perform(ctx) {
    if (inventoryOf(ctx.state, ctx.state.playerId).length === 0) {
      ctx.emit({ type: 'msg', key: 'name.nothing' });
      return 0;
    }
    ask(
      ctx,
      {
        id: 'call-what',
        kind: 'menu',
        key: 'call.what',
        cancellable: true,
        options: [
          { value: 'i', key: 'call.what.object', letter: 'i' },
          { value: 'o', key: 'call.what.type', letter: 'o' },
        ],
      },
      { step: 'what' },
    );
    return 0;
  },
  answer(ctx, value, raw) {
    const data = raw as unknown as CallData | null;
    if (data === null) {
      // the type's item was chosen: ask for the name
      const e = carried(ctx, value);
      if (!e?.c.item || !callable(ctx, ctx.defs.object(e.def))) return 0;
      // ref: docall_xname(): the name as for one item, "Call a ruby potion:"
      const one: Entity = { ...e, c: { ...e.c, item: { ...e.c.item, quantity: 1 } } };
      ask(
        ctx,
        {
          id: 'call-name',
          kind: 'text',
          key: 'call.prompt',
          params: { item: xnameOf(ctx.state, ctx.defs, one) },
          maxLength: PL_PSIZ,
        },
        { item: e.id },
      );
      return 0;
    }
    if ('step' in data) {
      if (data.step === 'what') {
        if (value === 'i') pickObject(ctx);
        else if (value === 'o') pickType(ctx);
        return 0;
      }
      const e = carried(ctx, value);
      if (e && ctx.defs.object(e.def).class !== 'coin') askObjectName(ctx, e);
      return 0;
    }
    // ref: name_from_player(): an empty answer (or Escape) cancels; blanks only remove the name
    const name = nameFromPlayer(value);
    if (name === null) return 0;
    if ('oname' in data) {
      const e = carried(ctx, data.oname);
      if (e) doOname(ctx, e, name);
      return 0;
    }
    const e = ctx.state.entities[String(data.item)];
    if (!e) return 0;
    const defId = e.def;
    const nh = nhData(ctx);
    if (name === '') {
      if (nh.called) delete nh.called[defId];
    } else {
      (nh.called ??= {})[defId] = name;
    }
    return 0;
  },
};

export const CALL_ACTIONS: readonly ActionDef[] = [callAction];
