// The end of the game: the pack identified and the disclosure lists, plus the statuses the UI's
// tombstone and "Goodbye" summary read. ref: src/end.c really_done() (the identify loop),
// disclose(), container_contents()
//
// The questions themselves ("Do you want your possessions identified?") are asked by the UI:
// each list event carries its question in `ask`, and the answers change nothing in the game.
// Not ported: the shopkeeper's `taken` variant, Schroedinger's cat, conduct,
// achievements and the dungeon overview (nothing tracks them), dumplog.
import {
  contents,
  getLevel,
  inventoryOf,
  type Ctx,
  type Entity,
  type GameOver,
  type ModApi,
  type Msg,
  type ObjectClass,
} from '@nh/core';
import { enlightenment } from './enlightenment';
import { endHow } from './endstate';
import { heroFemale } from './gender';
import { setCknown, setLknown } from './items';
import { xnameOf } from './objnam';
import { fullyIdentify } from './read';
import { uState } from './luck';
import { deepestLevel, finalGold, finalScore } from './urexp';
import { genocidedLines, goneCounts, vanquishedLines } from './vanquished';
import { RACES_TAB } from './racetab';
import { ROLES_TAB } from './roletab';
import { urace, urole } from './urole';
import { uHave } from './uhave';

/** ref: include/objects.h FAKE_AMULET_OF_YENDOR */
const FAKE_AMULET = 'nh:fake_amulet_of_yendor';

/** Below every other hook, so it runs only once nothing cancels the game over. */
export const END_PRIORITY = -1000;

/** The order classes are listed in. ref: src/options.c def_inv_order */
const INV_ORDER: readonly ObjectClass[] = [
  'coin',
  'amulet',
  'weapon',
  'armor',
  'food',
  'scroll',
  'spellbook',
  'potion',
  'ring',
  'wand',
  'tool',
  'gem',
  'rock',
];

const letterOf = (e: Entity): string => e.c.item?.letter ?? '';

/**
 * ref: src/end.c really_done(): every carried object's type discovered and the object fully
 * known, before any question (whatever the answers), and container_contents(invent, TRUE, ...)
 * does the same for what the containers hold, nested ones included.
 */
function identifyAll(ctx: Ctx, list: readonly Entity[]): void {
  for (const e of list) {
    fullyIdentify(ctx, e);
    if (ctx.defs.object(e.def).container) {
      setCknown(ctx, e.id, true);
      setLknown(ctx, e.id, true);
      identifyAll(ctx, contents(ctx.state, e.id));
    }
  }
}

/** "Contents of the sack:" and its items, then the containers inside it. ref: container_contents() */
function containerLines(ctx: Ctx, list: readonly Entity[], out: Msg[]): void {
  for (const box of list) {
    if (!ctx.defs.object(box.def).container) continue;
    const inside = contents(ctx.state, box.id);
    if (inside.length === 0) continue; // reportempty FALSE
    out.push({ key: 'end.contents', params: { box: xnameOf(ctx.state, ctx.defs, box) } });
    for (const e of inside)
      out.push({ key: 'end.contents_item', params: { item: ctx.defs.itemName(ctx.state, e) } });
    containerLines(ctx, inside, out);
  }
}

/**
 * The inventory as display_inventory() shows it (class headings, then `a - <name>` by letter),
 * then each container's contents. ref: src/invent.c display_inventory(); src/end.c
 * container_contents(invent, TRUE, TRUE, FALSE)
 */
export function inventoryLines(ctx: Ctx): Msg[] {
  const inv = inventoryOf(ctx.state, ctx.state.playerId);
  const out: Msg[] = [];
  const rank = (e: Entity): number => {
    const i = INV_ORDER.indexOf(ctx.defs.object(e.def).class);
    return i < 0 ? INV_ORDER.length : i;
  };
  const sorted = [...inv].sort(
    (a, b) =>
      rank(a) - rank(b) || (letterOf(a) < letterOf(b) ? -1 : letterOf(a) > letterOf(b) ? 1 : 0),
  );
  let cls: ObjectClass | null = null;
  for (const e of sorted) {
    const c = ctx.defs.object(e.def).class;
    if (c !== cls) {
      out.push({ key: `end.class.${c}` });
      cls = c;
    }
    out.push({
      key: 'inv.menu_item',
      params: { letter: letterOf(e), item: ctx.defs.itemName(ctx.state, e) },
    });
  }
  containerLines(ctx, inv, out);
  return out;
}

/**
 * The game is over (no hook cancelled it): identify the pack, then emit the disclosure lists
 * in C's order, each with its question. ref: src/end.c really_done(), disclose()
 */
export function finalDisclosure(ctx: Ctx, _over: GameOver): 'continue' {
  const inv = inventoryOf(ctx.state, ctx.state.playerId);
  identifyAll(ctx, inv);
  // ref: disclose(): `if (invent && ...)`: no question without possessions
  if (inv.length > 0)
    ctx.emit({
      type: 'list',
      ask: 'end.ask.inventory',
      titleKey: 'end.inventory',
      items: inventoryLines(ctx),
    });
  ctx.emit({
    type: 'list',
    ask: 'end.ask.attributes',
    titleKey: 'end.attributes',
    items: enlightenment(ctx),
  });
  // ref: list_vanquished(): no question when nothing died
  const vanq = vanquishedLines(ctx.state, ctx.defs);
  if (vanq.length > 0)
    ctx.emit({ type: 'list', ask: 'end.ask.vanquished', titleKey: 'end.vanquished', items: vanq });
  // ref: list_genocided(): at game over genocides and extinctions both; no question when
  // neither happened
  const geno = genocidedLines(ctx.state, ctx.defs, true);
  if (geno.length > 0) {
    const n = goneCounts(ctx.state, ctx.defs, true);
    const which = !n.genocided ? 'extinct' : n.extinct ? 'genocided_extinct' : 'genocided';
    ctx.emit({ type: 'list', ask: `end.ask.${which}`, titleKey: `end.${which}`, items: geno });
  }
  return 'continue';
}

/** aligns[1 - u.ualign.type].filecode. ref: src/role.c aligns[] */
const alignCode = (t: number): string => (t > 0 ? 'Law' : t < 0 ? 'Cha' : 'Neu');

/** The game-over hook and the statuses that exist only after game over. */
export function registerEnd(api: ModApi): void {
  api.on('beforeGameOver', finalDisclosure, { priority: END_PRIORITY });
  api.defineStatus({
    id: 'nh:end_how',
    field: 'endHow',
    value: (state) => (state.gameOver ? endHow(state) : null),
  });
  // ref: really_done(): "You died in <dungeons[u.uz.dnum].dname>"
  api.defineStatus({
    id: 'nh:end_dungeon',
    field: 'endDungeon',
    value: (state, defs) => (state.gameOver ? defs.dungeon(getLevel(state).dungeon).nameKey : null),
  });
  // "Goodbye <name> the <role>...": botl.ts's `role` and `goodbye` statuses
  // ref: really_done(): the final `u.urexp` ("with N points")
  api.defineStatus({
    id: 'nh:score',
    field: 'score',
    value: (state, defs) => (state.gameOver ? finalScore(state, defs) : null),
  });
  // ref: really_done(): `umoney` with hidden_gold(), for "and N pieces of gold" and the stone
  api.defineStatus({
    id: 'nh:end_gold',
    field: 'endGold',
    value: (state, defs) => (state.gameOver ? finalGold(state, defs) : null),
  });
  // ref: src/end.c done(): " (with the Amulet)", else for an escape " (with a fake Amulet)"
  // (carried, not in a container), after the killer of the score list's entry (the tombstone is
  // drawn before it is added)
  api.defineStatus({
    id: 'nh:death_suffix',
    field: 'deathSuffix',
    value(state) {
      if (!state.gameOver) return null;
      if (uHave(state, 'amulet')) return 'end.with_amulet';
      const fake = inventoryOf(state, state.playerId).some((o) => o.def === FAKE_AMULET);
      return endHow(state) === 'escaped' && fake ? 'end.with_fake_amulet' : null;
    },
  });
  // ref: src/topten.c topten(): `maxlvl = deepest_lev_reached(TRUE)`
  api.defineStatus({
    id: 'nh:max_depth',
    field: 'maxDepth',
    value: (state) => (state.gameOver ? deepestLevel(state) : null),
  });
  // ref: src/topten.c topten(): "Val-Hum-Fem-Neu" (role, race, gender, alignment file codes;
  // roletab.ts, racetab.ts); her gender is flags.female (gender.ts)
  api.defineStatus({
    id: 'nh:plcode',
    field: 'plcode',
    value(state) {
      if (!state.gameOver) return null;
      const role = ROLES_TAB[urole(state)].filecode;
      const race = RACES_TAB[urace(state)].filecode;
      const gend = heroFemale(state) ? 'Fem' : 'Mal';
      return `${role}-${race}-${gend}-${alignCode(uState(state).alignType)}`;
    },
  });
}
