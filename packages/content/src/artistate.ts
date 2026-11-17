// Which artifacts exist this game, how they came to be and which the hero has discovered (C's
// artiexist[] and artidisco[]), and objects becoming artifacts: oname(), artifact_exists() and
// mk_artifact() for a given object. A leaf (core, artilist, aligntyp, urole): the item creator,
// the namer and the shop prices ask it.
//
// State: `modData.nh.arti = { exist: { [artifactId]: { origin, found? } }, disco: artifactId[] }`
// (absent = nothing exists, nothing discovered). An artifact "exists" from its creation on, even
// after the object is destroyed, as in C; only a refused wish un-creates it. `disco` keeps C's
// discovery order. Every iteration is in table order, never object key order.
//
// hack_artifacts() is not stored: artiAlign()/artiRole() work the role's gift and quest artifact
// out from the hero's starting character every time (C redoes it on every restore too).
// ref: src/artifact.c hack_artifacts(), mk_artifact(), artifact_name(), exist_artifact(),
// artifact_exists(), found_artifact(), find_artifact(), nartifact_exist(), artifact_origin(),
// discover_artifact(), undiscovered_artifact(), arti_cost(), is_art(), get_artifact();
// src/do_name.c oname()
import {
  inventoryOf,
  type Ctx,
  type DefId,
  type Entity,
  type GameState,
  type ItemComponent,
  type Json,
  type Registry,
} from '@nh/core';
import { A_NONE } from './aligntyp';
import { ARTIFACTS, QUEST_ARTIFACT, artifactRowOrNull, type ArtifactDef } from './artilist';
import { roleIs, urole, type RoleKey } from './urole';

/** How an artifact came to exist (C's arti_info origin bits; exactly one). */
export type ArtiOrigin = 'wish' | 'gift' | 'viadip' | 'named' | 'lvldef' | 'bones' | 'random';

/** One existing artifact (C's arti_info: `exists` is having an entry). */
export interface ArtiInfo {
  origin: ArtiOrigin;
  /** The hero knows it exists (found). */
  found?: true;
}

/** `modData.nh.arti` */
export interface ArtiState {
  exist: Record<string, ArtiInfo>;
  /** C's artidisco[]: the discovered artifacts, in discovery order. */
  disco: DefId[];
}

type Table = { [k: string]: Json };
const isObj = (v: unknown): v is Table => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The stored state, or null when nothing was ever written. */
function readArti(state: Readonly<GameState>): ArtiState | null {
  const nh = state.modData['nh'];
  const a = isObj(nh) ? nh['arti'] : undefined;
  return isObj(a) ? (a as unknown as ArtiState) : null;
}

/** The state to change (created when absent). */
function arti(ctx: Pick<Ctx, 'state'>): ArtiState {
  const md = ctx.state.modData;
  let nh = md['nh'];
  if (!isObj(nh)) {
    nh = {};
    md['nh'] = nh;
  }
  let a = nh['arti'];
  if (!isObj(a)) {
    a = { exist: {}, disco: [] };
    nh['arti'] = a;
  }
  return a as unknown as ArtiState;
}

/** The artifact an object is, or null. ref: src/artifact.c get_artifact() */
export function artiOf(obj: Entity | null | undefined): ArtifactDef | null {
  return artifactRowOrNull(obj?.c.item?.artifact);
}

/** ref: src/artifact.c is_art() */
export const isArt = (obj: Entity | null | undefined, id: DefId): boolean =>
  obj?.c.item?.artifact === id;

/** The hero wields that artifact. ref: include/artifact.h u_wield_art() */
export function uWieldArt(state: Readonly<GameState>, id: DefId): boolean {
  return inventoryOf(state, state.playerId).some(
    (o) => o.c.item?.equipped === 'weapon' && o.c.item.artifact === id,
  );
}

/** The artifact exists this game (artiexist[].exists). */
export const artiExists = (state: Readonly<GameState>, id: DefId): boolean =>
  readArti(state)?.exist[id] !== undefined;

/** How it came to exist, or null. */
export const artiInfo = (state: Readonly<GameState>, id: DefId): ArtiInfo | null =>
  readArti(state)?.exist[id] ?? null;

/** The artifact of this base object and exact name exists. ref: src/artifact.c exist_artifact() */
export function existArtifact(state: Readonly<GameState>, base: DefId, name: string): boolean {
  if (!name) return false;
  const a = ARTIFACTS.find((r) => r.base === base && r.name === name);
  return a !== undefined && artiExists(state, a.id);
}

/** How many artifacts exist. ref: src/artifact.c nartifact_exist() */
export function nartifactExist(state: Readonly<GameState>): number {
  return ARTIFACTS.filter((a) => artiExists(state, a.id)).length;
}

/** fuzzymatch(s1, s2, " -", TRUE): equal ignoring case, spaces and dashes. ref: src/hacklib.c */
const fuzzy = (s: string): string => s.replace(/[ -]/g, '').toLowerCase();

/**
 * The artifact a player's string names ("the" optional on both sides; case-blind; `fuzzy` also
 * ignores spaces and dashes), or null. ref: src/artifact.c artifact_name()
 */
export function artifactName(name: string, fuzzyMatch: boolean): ArtifactDef | null {
  const n = name.replace(/^the /i, '');
  for (const a of ARTIFACTS) {
    const an = a.name.replace(/^the /i, '');
    if (fuzzyMatch ? fuzzy(n) === fuzzy(an) : n.toLowerCase() === an.toLowerCase()) return a;
  }
  return null;
}

/** The name with a leading "The" lowercased. ref: src/objnam.c bare_artifactname() */
export const bareArtifactName = (a: ArtifactDef): string => a.name.replace(/^The /, 'the ');

/**
 * Records that the artifact exists and how (one origin, and `found` when the hero knows of it).
 * ref: src/artifact.c artifact_origin()
 */
export function artifactOrigin(
  ctx: Pick<Ctx, 'state'>,
  id: DefId,
  origin: ArtiOrigin,
  knowArti = false,
): void {
  arti(ctx).exist[id] = knowArti ? { origin, found: true } : { origin };
}

/** The hero now knows the artifact exists. ref: src/artifact.c found_artifact(), find_artifact() (no livelog) */
export function findArtifact(ctx: Pick<Ctx, 'state'>, obj: Entity): void {
  const id = obj.c.item?.artifact;
  const info = id === undefined ? undefined : readArti(ctx.state)?.exist[id];
  if (id !== undefined && info && !info.found) arti(ctx).exist[id] = { ...info, found: true };
}

/**
 * The object becomes, or stops being, the artifact of its type with this exact name: `mod` true
 * creates it (`artifact` set, `age` 0, the origin recorded), false un-creates it (a refused
 * wish: the row can be made again). ref: src/artifact.c artifact_exists()
 */
export function artifactExistsItem(
  ctx: Pick<Ctx, 'state'>,
  base: DefId,
  it: ItemComponent,
  name: string,
  mod: boolean,
  origin: ArtiOrigin = 'random',
  knowArti = false,
): void {
  if (!name) return;
  const a = ARTIFACTS.find((r) => r.base === base && r.name === name);
  if (!a) return;
  if (mod) it.artifact = a.id;
  else delete it.artifact;
  it.age = 0;
  if (mod) artifactOrigin(ctx, a.id, origin, knowArti);
  else delete arti(ctx).exist[a.id];
}

/** C's PL_PSIZ: a name is at most 62 characters. ref: include/global.h */
export const PL_PSIZ = 63;

/**
 * Names an object (an empty name removes it). An artifact keeps its name, and a name that is an
 * existing artifact's (on its base type) is refused; a name that is a row's on its base type
 * makes the object that artifact. The callers refresh a wielded artifact's intrinsics and an
 * unpaid one's cost. ref: src/do_name.c oname()
 */
export function onameItem(
  ctx: Pick<Ctx, 'state'>,
  base: DefId,
  it: ItemComponent,
  name: string,
  origin: ArtiOrigin = 'random',
  knowArti = false,
): void {
  const nm = name.length + 1 > PL_PSIZ ? name.slice(0, PL_PSIZ - 1) : name;
  // If named artifact exists in the game, do not create another. Also trying to create an
  // artifact shouldn't de-artifact it (e.g. Excalibur from prayer). In this case the object
  // will retain its current name.
  if (it.artifact !== undefined || (nm && existArtifact(ctx.state, base, nm))) return;
  if (nm) it.name = nm;
  else delete it.name;
  if (nm) artifactExistsItem(ctx, base, it, nm, true, origin, knowArti);
}

/** oname() on an object. ref: src/do_name.c oname() */
export function oname(
  ctx: Pick<Ctx, 'state'>,
  obj: Entity,
  name: string,
  origin: ArtiOrigin = 'random',
  knowArti = false,
): void {
  const it = obj.c.item;
  if (it) onameItem(ctx, obj.def, it, name, origin, knowArti);
}

/** A refused wish: the artifact no longer exists and the object is plain again. */
export function uncreateArtifact(ctx: Pick<Ctx, 'state'>, obj: Entity): void {
  const it = obj.c.item;
  if (it?.name) artifactExistsItem(ctx, obj.def, it, it.name, false);
}

/** Adds an identified artifact to the discoveries. ref: src/artifact.c discover_artifact() */
export function discoverArtifact(ctx: Pick<Ctx, 'state'>, id: DefId): void {
  const d = arti(ctx).disco;
  if (!d.includes(id)) d.push(id);
}

/** Whether the artifact is not yet discovered. ref: src/artifact.c undiscovered_artifact() */
export const undiscoveredArtifact = (state: Readonly<GameState>, id: DefId): boolean =>
  !(readArti(state)?.disco ?? []).includes(id);

/** The discovered artifacts in discovery order. */
export const discoveredArtifacts = (state: Readonly<GameState>): readonly DefId[] =>
  readArti(state)?.disco ?? [];

/** The hero's starting alignment (flags.initalign; u.ualignbase[A_ORIGINAL]). */
const initAlign = (state: Readonly<GameState>): number =>
  state.entities[String(state.playerId)]?.c.player?.align ?? 0;

/** The hero's quest artifact (urole.questarti). */
export const questArtifactId = (state: Readonly<GameState>): DefId => QUEST_ARTIFACT[urole(state)];

/**
 * The row's alignment after hack_artifacts(): her role's aligned gift artifact and her quest
 * artifact take her starting alignment. ref: src/artifact.c hack_artifacts()
 */
export function artiAlign(state: Readonly<GameState>, a: ArtifactDef): number {
  // Fix up the alignments of "gift" artifacts
  if (a.role !== null && roleIs(state, a.role) && a.align !== A_NONE) return initAlign(state);
  // Fix up the quest artifact
  if (questArtifactId(state) === a.id) return initAlign(state);
  return a.align;
}

/**
 * The row's role after hack_artifacts(): Excalibur can be used by any lawful character, not just
 * knights; her quest artifact is her role's. ref: src/artifact.c hack_artifacts()
 */
export function artiRole(state: Readonly<GameState>, a: ArtifactDef): RoleKey | null {
  if (questArtifactId(state) === a.id) return urole(state);
  if (a.id === 'nh:excalibur' && !roleIs(state, 'knight')) return null;
  return a.role;
}

/** `Role_if(a->role)` over the hacked table (NON_PM is never her role). */
export const artiRoleIs = (state: Readonly<GameState>, a: ArtifactDef): boolean => {
  const r = artiRole(state, a);
  return r !== null && roleIs(state, r);
};

/**
 * The price an artifact sells for: its row's cost, or 100 times its base's when that is 0.
 * ref: src/artifact.c arti_cost()
 */
export function artiCost(defs: Registry, obj: Entity): number {
  const base = defs.object(obj.def).cost;
  const a = artiOf(obj);
  if (!a) return base;
  return a.cost ? a.cost : 100 * base;
}

/**
 * mk_artifact(otmp, A_NONE, 99, adjust_spe): turns a new object into a random artifact of its
 * type that does not exist yet and is not NOGEN (`rn2(n)` among them, in table order), with no
 * erosion and its gen_spe added when the result stays within -10..9; with none eligible the object
 * stays as it is. Unique objects (oc_unique) never get one this way: none is an artifact base
 * here. ref: src/artifact.c mk_artifact()
 */
export function mkArtifactConvert(
  ctx: Pick<Ctx, 'state' | 'rng'>,
  base: DefId,
  it: ItemComponent,
  adjustSpe: boolean,
): void {
  const maxGift = 99;
  const eligible = ARTIFACTS.filter(
    (a) =>
      !artiExists(ctx.state, a.id) &&
      !a.spfx.includes('nogen') &&
      !(a.giftValue > maxGift && !artiRoleIs(ctx.state, a)) &&
      a.base === base,
  );
  if (eligible.length === 0) return;
  const a = eligible[ctx.rng.rn2(eligible.length)];
  if (!a) return;
  // prevent erosion from generating
  delete it.erosion;
  onameItem(ctx, base, it, a.name);
  // set existence and reason for creation bits; 'random' is default
  artifactOrigin(ctx, a.id, 'random');
  if (adjustSpe) {
    // clamped into the "normal" range to prevent an outside chance of +12 artifacts generating
    const newSpe = it.spe + a.genSpe;
    if (newSpe >= -10 && newSpe < 10) it.spe = newSpe;
  }
}
