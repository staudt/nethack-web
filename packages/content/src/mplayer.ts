// The player monsters: the archeologists, barbarians ... wizards of the Astral Plane (and of
// des.monster's player-monster kinds), with their role's gear, the endgame's better gear and
// stats, and their taunts. ref: src/mplayer.c
//
// Monsters have no given names here (DEVIATIONS.md "The Riders and the player monsters (m23 step
// 9)"): get_mplname()'s draws are made and the first name it picks is kept in
// `modData.nh.mplname` (by entity id, forgotten with the monster) so that dev_name() can avoid a
// name already in use, as C compares the given names; the monster is still called by its kind.
// Grease is not ported (the roll is made); a missing object is skipped.
import {
  getLevel,
  sortedIds,
  type Ctx,
  type DefId,
  type Entity,
  type EntityId,
  type GameState,
  type Json,
  type Level,
  type MonsterDef,
  type ObjectDef,
  type Pos,
} from '@nh/core';
import { mkArtifactConvert } from './artistate';
import { gemLedger, REAL_GEMS, rndClass } from './gem';
import { setMonFemale } from './gender';
import { goodposDef, makemon } from './generation';
import { addToInventory, mksobj } from './items';
import { inEndgame } from './levelflags';
import { mkobj } from './mkobj';
import { isMplayer, MPLAYERS } from './mondata';
import { mDoWear, mkmonmoney, mongets } from './mongear';
import { rndDefensiveItem, rndMiscItem, rndOffensiveItem } from './musestate';
import { roleMonId } from './roletab';
import { urole } from './urole';

/**
 * "These are the names of those who contributed to the development of NetHack 3.2/3.3/3.4/3.6."
 * (the empty last entry is part of C's array and can be drawn). ref: src/mplayer.c developers[]
 */
const DEVELOPERS: readonly string[] = [
  // devteam
  'Alex', 'Dave', 'Dean', 'Derek', 'Eric', 'Izchak', 'Janet', 'Jessie', 'Ken', 'Kevin', 'Michael',
  'Mike', 'Pasi', 'Pat', 'Patric', 'Paul', 'Sean', 'Steve', 'Timo', 'Warwick',
  // PC team
  'Bill', 'Eric', 'Keizo', 'Ken', 'Kevin', 'Michael', 'Mike', 'Paul', 'Stephen', 'Steve', 'Timo',
  'Yitzhak',
  // Amiga team
  'Andy', 'Gregg', 'Janne', 'Keni', 'Mike', 'Olaf', 'Richard',
  // Mac team
  'Andy', 'Chris', 'Dean', 'Jon', 'Jonathan', 'Kevin', 'Wang',
  // Atari team
  'Eric', 'Marvin', 'Warwick',
  // NT team
  'Alex', 'Dion', 'Michael',
  // OS/2 team
  'Helge', 'Ron', 'Timo',
  // VMS team
  'Joshua', 'Pat', '',
]; // prettier-ignore

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The first names of the named player monsters (`modData.nh.mplname`). */
function nameTable(ctx: Pick<Ctx, 'state'>, create: boolean): Table | null {
  const md = (ctx.state as GameState).modData;
  let nh = md['nh'];
  if (!isObj(nh)) {
    if (!create) return null;
    nh = {};
    md['nh'] = nh;
  }
  let t = nh['mplname'];
  if (!isObj(t)) {
    if (!create) return null;
    t = {};
    nh['mplname'] = t;
  }
  return t;
}

/** A player monster's first name ('' when it has none). */
export function mplayerName(ctx: Pick<Ctx, 'state'>, id: EntityId): string {
  const n = nameTable(ctx, false)?.[String(id)];
  return typeof n === 'string' ? n : '';
}

/**
 * A random developer name that no player monster of the level already has (C compares the
 * start of each given name), or null after 100 tries. ref: src/mplayer.c dev_name()
 */
function devName(ctx: Ctx, level: Level): string | null {
  const mplayers: EntityId[] = [];
  for (const id of sortedIds(ctx.state)) {
    const e = ctx.state.entities[String(id)];
    if (e?.c.monster && e.c.pos?.level === level.id && isMplayer({ id: e.def })) mplayers.push(id);
  }
  let dev: string;
  let m = 0;
  let match: boolean;
  do {
    const d = DEVELOPERS[ctx.rng.rn2(DEVELOPERS.length)] ?? '';
    dev = d;
    match = mplayers.some((id) => mplayerName(ctx, id).startsWith(d));
    m++;
  } while (match && m < 100); // m for insurance
  return match ? null : dev;
}

/**
 * The player monster's name: a developer's first name, "Eve" or "Maud" for a female kind (Janet
 * keeps hers), "Adam"/"Eve" when none is free; Janet and the female kinds are female. The rank
 * title C appends ("Adam the Stripling") is not kept (no monster names here).
 * ref: src/mplayer.c get_mplname()
 */
function getMplname(ctx: Ctx, mon: Entity, def: MonsterDef, level: Level): void {
  const fmlkind = def.flags.includes('female');
  const devnam = devName(ctx, level);
  let nam: string;
  if (devnam === null) nam = fmlkind ? 'Eve' : 'Adam';
  else if (fmlkind && devnam !== 'Janet') nam = ctx.rng.rn2(2) ? 'Maud' : 'Eve';
  else nam = devnam;
  setMonFemale(ctx, mon.id, fmlkind || nam === 'Janet');
  const t = nameTable(ctx, true);
  if (t) t[String(mon.id)] = nam;
}

/** The object types first..last in objects.h order (rnd_class()'s range). */
function objRange(ctx: Pick<Ctx, 'defs'>, first: DefId, last: DefId): DefId[] {
  const all = ctx.defs.objects;
  const i = all.findIndex((o) => o.id === first);
  const j = all.findIndex((o) => o.id === last);
  if (i < 0 || j < i) return [];
  return all.slice(i, j + 1).map((o) => o.id);
}

/** rnd_class(first, last): by probability, uniformly when all are 0. ref: src/objnam.c */
function rndRange(ctx: Ctx, first: DefId, last: DefId, ledger = 0): DefId | null {
  const ids = objRange(ctx, first, last);
  return ids.length ? rndClass(ctx.rng, ctx.defs, ids, ledger) : null;
}

const objDef = (ctx: Pick<Ctx, 'defs'>, id: DefId | null): ObjectDef | null =>
  id !== null && ctx.defs.isObject(id) ? ctx.defs.object(id) : null;

/**
 * A piece of the endgame's armor: never eroded, a third erodeproof, a third cursed, a third
 * blessed (after the curse: blessed wins), +0..+4 mostly, +4..+7 a third of 9 in 10, else -1..-3.
 * ref: src/mplayer.c mk_mplayer_armor()
 */
function mkMplayerArmor(ctx: Ctx, mon: Entity, typ: DefId | null): void {
  if (typ === null) return;
  const def = objDef(ctx, typ);
  if (!def) return;
  const id = mksobj(ctx, def, { init: false, artif: false });
  const it = ctx.state.entities[String(id)]?.c.item;
  if (!it) return;
  delete it.erosion;
  if (!ctx.rng.rn2(3)) it.erodeproof = true;
  if (!ctx.rng.rn2(3)) it.buc = 'cursed';
  if (!ctx.rng.rn2(3)) it.buc = 'blessed';
  // "Most players who get to the endgame who have cursed equipment have it because the wizard or
  // other monsters cursed it, so its chances of having plusses is the same as usual...."
  it.spe = ctx.rng.rn2(10)
    ? ctx.rng.rn2(3)
      ? ctx.rng.rn2(5)
      : ctx.rng.rn2(4) + 4
    : -ctx.rng.rnd(3);
  addToInventory(ctx, mon.id, id);
}

/** ref: src/weapon.c rwep[] (monmightthrowwep()): the missiles a monster might throw. */
const RWEP: readonly string[] = [
  'nh:dwarvish_spear', 'nh:silver_spear', 'nh:elven_spear', 'nh:spear', 'nh:orcish_spear',
  'nh:javelin', 'nh:shuriken', 'nh:ya', 'nh:silver_arrow', 'nh:elven_arrow', 'nh:arrow',
  'nh:orcish_arrow', 'nh:crossbow_bolt', 'nh:silver_dagger', 'nh:elven_dagger', 'nh:dagger',
  'nh:orcish_dagger', 'nh:knife', 'nh:flint_stone', 'nh:rock', 'nh:loadstone', 'nh:luckstone',
  'nh:dart', 'nh:cream_pie',
]; // prettier-ignore

/**
 * Makes a player monster of kind `def` at `pos`: level 1..16 (15..30 in the endgame's `special`
 * case) with d(level, 10) + 30 hit points (+ 1..30 more when special), hostile; a long sword or a
 * random spear-to-bullwhip weapon, dragon scale mail, a cloak, a helmet and a shield by the role's
 * rules; when special a name, the cheap plastic imitation of the Amulet ("that's why they are
 * stuck in the endgame"), a +4..+8 weapon that is half the time an artifact of its kind, the armor,
 * gloves and boots (mk_mplayer_armor()), a luckstone or loadstone 1 time in 10, gems, gold and
 * random objects; then 1..3 each of offensive, defensive and misc items.
 * ref: src/mplayer.c mk_mplayer()
 */
export function mkMplayer(
  ctx: Ctx,
  def: MonsterDef,
  pos: Pos,
  special: boolean,
  levelId: string = ctx.state.currentLevel,
): EntityId | null {
  if (!isMplayer(def)) return null;
  const level = getLevel(ctx.state, levelId);
  if (!inEndgame(ctx.state, level)) special = false;
  const id = makemon(ctx, def, pos, { level: level.id, adjacentOk: true });
  const mon = id === null ? undefined : ctx.state.entities[String(id)];
  const m = mon?.c.monster;
  if (!mon || !m || id === null) return null;
  const rng = ctx.rng;
  m.level = special ? rng.rn2(16) + 15 : rng.rnd(16);
  const hp = rng.d(m.level, 10) + (special ? 30 + rng.rnd(30) : 30);
  mon.c.hp = { cur: hp, max: hp };
  if (special) {
    getMplname(ctx, mon, def, level);
    mongets(ctx, id, 'nh:fake_amulet_of_yendor');
  }
  m.peaceful = false; // set_malign(): malign follows (luck.ts)

  // default equipment; much of it will be overridden below
  const STRANGE = null;
  let weapon: DefId | null = !rng.rn2(2)
    ? 'nh:long_sword'
    : rndRange(ctx, 'nh:spear', 'nh:bullwhip');
  let armor: DefId | null = rndRange(
    ctx,
    'nh:gray_dragon_scale_mail',
    'nh:yellow_dragon_scale_mail',
  );
  let cloak: DefId | null = !rng.rn2(8)
    ? STRANGE
    : rndRange(ctx, 'nh:oilskin_cloak', 'nh:cloak_of_displacement');
  let helm: DefId | null = !rng.rn2(8)
    ? STRANGE
    : rndRange(ctx, 'nh:elven_leather_helm', 'nh:helm_of_telepathy');
  let shield: DefId | null = !rng.rn2(8)
    ? STRANGE
    : rndRange(ctx, 'nh:elven_shield', 'nh:shield_of_reflection');
  const plateOrChain = (): DefId | null => rndRange(ctx, 'nh:plate_mail', 'nh:chain_mail');
  const brillianceOrTelepathy = (): DefId =>
    rng.rn2(2) ? 'nh:helm_of_brilliance' : 'nh:helm_of_telepathy';

  switch (def.id) {
    case 'nh:archeologist':
      if (rng.rn2(2)) weapon = 'nh:bullwhip';
      break;
    case 'nh:barbarian':
      if (rng.rn2(2)) {
        weapon = rng.rn2(2) ? 'nh:two_handed_sword' : 'nh:battle_axe';
        shield = STRANGE;
      }
      if (rng.rn2(2)) armor = plateOrChain();
      if (helm === 'nh:helm_of_brilliance') helm = STRANGE;
      break;
    case 'nh:caveman':
      if (rng.rn2(4)) weapon = 'nh:mace';
      else if (rng.rn2(2)) weapon = 'nh:club';
      if (helm === 'nh:helm_of_brilliance') helm = STRANGE;
      break;
    case 'nh:healer':
      if (rng.rn2(4)) weapon = 'nh:quarterstaff';
      else if (rng.rn2(2)) weapon = rng.rn2(2) ? 'nh:unicorn_horn' : 'nh:scalpel';
      if (rng.rn2(4)) helm = brillianceOrTelepathy();
      if (rng.rn2(2)) shield = STRANGE;
      break;
    case 'nh:knight':
      if (rng.rn2(4)) weapon = 'nh:long_sword';
      if (rng.rn2(2)) armor = plateOrChain();
      break;
    case 'nh:monk':
      weapon = !rng.rn2(3) ? 'nh:shuriken' : STRANGE;
      armor = STRANGE;
      cloak = 'nh:robe';
      if (rng.rn2(2)) shield = STRANGE;
      break;
    case 'nh:cleric':
      if (rng.rn2(2)) weapon = 'nh:mace';
      if (rng.rn2(2)) armor = plateOrChain();
      if (rng.rn2(4)) cloak = 'nh:robe';
      if (rng.rn2(4)) helm = brillianceOrTelepathy();
      if (rng.rn2(2)) shield = STRANGE;
      break;
    case 'nh:ranger':
      if (rng.rn2(2)) weapon = 'nh:elven_dagger';
      break;
    case 'nh:rogue':
      if (rng.rn2(2)) weapon = rng.rn2(2) ? 'nh:short_sword' : 'nh:orcish_dagger';
      break;
    case 'nh:samurai':
      if (rng.rn2(2)) weapon = 'nh:katana';
      break;
    case 'nh:tourist':
      // Defaults are just fine
      break;
    case 'nh:valkyrie':
      if (rng.rn2(2)) weapon = 'nh:war_hammer';
      if (rng.rn2(2)) armor = plateOrChain();
      break;
    case 'nh:wizard':
      if (rng.rn2(4)) weapon = rng.rn2(2) ? 'nh:quarterstaff' : 'nh:athame';
      if (rng.rn2(2)) {
        armor = rng.rn2(2) ? 'nh:black_dragon_scale_mail' : 'nh:silver_dragon_scale_mail';
        cloak = 'nh:cloak_of_magic_resistance';
      }
      if (rng.rn2(4)) helm = 'nh:helm_of_brilliance';
      shield = STRANGE;
      break;
    default:
      weapon = STRANGE; // "bad mplayer monster"
      break;
  }

  const wdef = objDef(ctx, weapon);
  if (wdef) {
    const oid = mksobj(ctx, wdef, { init: true, artif: false });
    const otmp = ctx.state.entities[String(oid)];
    const it = otmp?.c.item;
    if (otmp && it) {
      delete it.erosion;
      it.spe = special ? rng.rn2(5) + 4 : rng.rn2(4);
      if (!rng.rn2(3)) it.erodeproof = true;
      else rng.rn2(2); // `otmp->greased = 1`: no grease here
      // mk_artifact() with otmp and A_NONE will never return Null
      if (special && rng.rn2(2)) mkArtifactConvert(ctx, wdef.id, it, false);
      // usually increase stack size if stackable weapon
      if (wdef.merge && it.artifact === undefined && RWEP.includes(wdef.id))
        it.quantity += rng.rn2(wdef.weapon?.skill === 'spear' ? 4 : 8);
      // mplayers knew better than to overenchant Magicbane
      if (it.artifact === 'nh:magicbane') it.spe = rng.rnd(4);
      addToInventory(ctx, id, oid);
    }
  }

  if (special) {
    if (!rng.rn2(10)) mongets(ctx, id, rng.rn2(3) ? 'nh:luckstone' : 'nh:loadstone');
    mkMplayerArmor(ctx, mon, armor);
    mkMplayerArmor(ctx, mon, cloak);
    mkMplayerArmor(ctx, mon, helm);
    mkMplayerArmor(ctx, mon, shield);
    if (weapon === 'nh:war_hammer')
      // valkyrie: wimpy weapon or Mjollnir
      mkMplayerArmor(ctx, mon, 'nh:gauntlets_of_power');
    else if (rng.rn2(8))
      mkMplayerArmor(ctx, mon, rndRange(ctx, 'nh:leather_gloves', 'nh:gauntlets_of_dexterity'));
    if (rng.rn2(8)) mkMplayerArmor(ctx, mon, rndRange(ctx, 'nh:low_boots', 'nh:levitation_boots'));
    mDoWear(ctx, id, true);

    let quan = rng.rn2(3) ? rng.rn2(3) : rng.rn2(16);
    const gems = REAL_GEMS.filter((g) => ctx.defs.isObject(g));
    const ledger = gemLedger(ctx.state, level.id);
    while (quan-- > 0) mongets(ctx, id, rndClass(rng, ctx.defs, gems, ledger));
    // "To get the gold "right" would mean a player can double his gold supply by killing one
    // mplayer.  Not good."
    mkmonmoney(ctx, id, rng.rn2(1000));
    quan = rng.rn2(10);
    while (quan-- > 0) {
      const oid = mkobj(ctx, 'random', { artif: false });
      if (oid !== null) addToInventory(ctx, id, oid);
    }
  }
  let quan = rng.rnd(3);
  while (quan-- > 0) {
    const o = rndOffensiveItem(ctx, id);
    if (o) mongets(ctx, id, o);
  }
  quan = rng.rnd(3);
  while (quan-- > 0) {
    const o = rndDefensiveItem(ctx, id);
    if (o) mongets(ctx, id, o);
  }
  quan = rng.rnd(3);
  while (quan-- > 0) {
    const o = rndMiscItem(ctx, id);
    if (o) mongets(ctx, id, o);
  }
  return id;
}

/**
 * `num` player monsters of random roles, each on a random free spot (50 tries each; when one
 * finds none, no more are made). "If special, the size of num should not be bigger than the
 * number of _non-repeated_ names in the developers array, otherwise a bunch of Adams and Eves
 * will fill up the overflow." ref: src/mplayer.c create_mplayers()
 */
export function createMplayers(ctx: Ctx, num: number, special: boolean): void {
  const level = getLevel(ctx.state);
  while (num > 0) {
    let tryct = 0;
    // roll for character class
    const pm = MPLAYERS[ctx.rng.rn2(MPLAYERS.length)] as DefId;
    if (!ctx.defs.isMonster(pm)) return;
    const def = ctx.defs.monster(pm);
    // roll for an available location
    let x: number;
    let y: number;
    do {
      x = ctx.rng.rn2(level.width - 4) + 2; // rn1(COLNO - 4, 2)
      y = ctx.rng.rnd(level.height - 2); // rnd(ROWNO - 2)
    } while (!goodposDef(ctx, level, x, y, def) && tryct++ <= 50);
    // if pos not found in 50 tries, don't bother to continue
    if (tryct > 50) return;
    mkMplayer(ctx, def, { x, y }, special, level.id);
    num--;
  }
}

const SAME_CLASS: readonly string[] = [
  'mplayer.talk.cant_win',
  'mplayer.talk.dont_deserve',
  'mplayer.talk.honor',
];
const OTHER_CLASS: readonly string[] = [
  'mplayer.talk.low_life',
  'mplayer.talk.fight',
  'mplayer.talk.say',
];

/**
 * A hostile player monster's taunt in the endgame: "Talk? -- I can't win, and neither will you!"
 * to a hero of its own role, "Talk? -- Fight, scum!" and the like to another. False for a
 * peaceful one ("will drop to humanoid talk"). ref: src/mplayer.c mplayer_talk()
 */
export function mplayerTalk(ctx: Ctx, mon: Entity): boolean {
  if (mon.c.monster?.peaceful) return false;
  const same = mon.def === roleMonId(urole(ctx.state));
  const lines = same ? SAME_CLASS : OTHER_CLASS;
  ctx.emit({ type: 'msg', key: lines[ctx.rng.rn2(3)] ?? 'mplayer.talk.fight' });
  return true;
}
