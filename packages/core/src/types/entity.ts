import type { DefId, EntityId, LevelId, Pos } from './common';

/** Movement points per normal-speed action. ref: include/permonst.h NORMAL_SPEED */
export const NORMAL_SPEED = 12;

export interface PosComponent {
  level: LevelId;
  x: number;
  y: number;
}

export interface ActorComponent {
  energy: number;
  speed: number;
}

export interface PlayerComponent {
  role: DefId;
}

export interface HpComponent {
  cur: number;
  max: number;
}

/** NetHack encoding: 3..25, with strength 18/xx stored as 19..118 (ref: include/attrib.h STR18). */
export interface AttributesComponent {
  str: number;
  int: number;
  wis: number;
  dex: number;
  con: number;
  cha: number;
}

export interface ExperienceComponent {
  level: number;
  points: number;
}

/** Dice as [count, sides]. */
export type Dice = [n: number, d: number];

export interface MonsterComponent {
  level: number;
  peaceful: boolean;
  asleep: boolean;
  /** Where the monster last saw the hero, for tracking. */
  lastHero: Pos | null;
  /**
   * Tameness 1..20 (mtame); absent when not tame. A tame monster is also `peaceful`.
   * ref: include/monst.h mtame
   */
  tame?: number;
}

/** ref: include/objclass.h enum obj_armor_types */
export type ArmorSlot = 'body' | 'cloak' | 'shirt' | 'helm' | 'gloves' | 'boots' | 'shield';

/** Worn or wielded slots; rings go on either hand (ref: include/prop.h W_RINGL, W_RINGR, W_AMUL, W_TOOL). */
export type EquipSlot = 'weapon' | ArmorSlot | 'ringL' | 'ringR' | 'amulet' | 'blindfold';

/** An erosion level, 0 (none) to 3 (thoroughly). ref: include/obj.h MAX_ERODE */
export type ErosionLevel = 0 | 1 | 2 | 3;

export type Buc = 'blessed' | 'uncursed' | 'cursed';

/**
 * An object instance (ref: include/obj.h struct obj). An item is in exactly one place: on the
 * floor (`pos` set, `carriedBy` null), carried (`carriedBy` set, no `pos`) or inside a container
 * (`containedIn` set, no `pos`, `carriedBy` null). Core's `putIn`/`takeOut` move items into and
 * out of containers.
 */
export interface ItemComponent {
  quantity: number;
  buc: Buc;
  /** Enchantment or charges (obj->spe). */
  spe: number;
  /** What the hero knows about this instance (obj->bknown, obj->known). */
  known: { buc: boolean; spe: boolean };
  carriedBy: EntityId | null;
  /** Inventory letter (hero's items). Kept on the floor so a picked-up item gets it back (obj->invlet). */
  letter: string | null;
  equipped: EquipSlot | null;
  /** Placement sequence (from `state.seq`); the highest on a cell is the top of the pile. */
  placed: number;
  /** Corpses and statues: the monster it was or shows (obj->corpsenm). */
  corpseOf?: DefId;
  /** Turn the object was created (obj->age), for rotting. */
  age?: number;
  /** Nutrition left in partly eaten food (obj->oeaten). */
  eaten?: number;
  /**
   * The container item this one is inside (obj->ocontainer, where == OBJ_CONTAINED). A mod may
   * also let a non-container item hold others (vanilla statues, whose contents are put in by
   * content, not by `putIn`).
   */
  containedIn?: EntityId;
  /** A locked box (obj->olocked). */
  locked?: true;
  /** A box whose lock is broken (obj->obroken). */
  broken?: true;
  /** A lit lamp or other light source (obj->lamplit). */
  lit?: true;
  /** Rust/burn/rot (e1, obj->oeroded) and corrosion (e2, obj->oeroded2). */
  erosion?: { e1: ErosionLevel; e2: ErosionLevel };
  /** Fixed: rustproof, fireproof... (obj->oerodeproof). */
  erodeproof?: true;
  /** Times a wand or tool was recharged (obj->recharged). */
  recharged?: number;
  /** On a shopkeeper's bill: the hero has it but has not paid for it (obj->unpaid). */
  unpaid?: true;
  /** Lies in a shop but is not for sale: the hero's own, or bitten into (obj->no_charge). */
  noCharge?: true;
}

/** ref: src/eat.c hunger states (u.uhs) */
export type HungerState =
  'satiated' | 'not_hungry' | 'hungry' | 'weak' | 'fainting' | 'fainted' | 'starved';

export interface HungerComponent {
  /** u.uhunger */
  nutrition: number;
  state: HungerState;
}

/** The entity cannot act until `until` (ref: src/hack.c nomul() with negative multi). */
export interface HelplessComponent {
  until: number;
  /** Message key describing why (multi_reason). */
  reasonKey: string;
}

/**
 * An intrinsic or timed property (ref: include/prop.h, youprop.h). Keys are content-defined,
 * e.g. 'cold_res', 'stunned'. `timeout` is the turn it ends, 0 for none.
 */
export interface PropState {
  intrinsic: boolean;
  timeout: number;
}

/** All components are plain data. */
export interface Components {
  pos?: PosComponent;
  actor?: ActorComponent;
  player?: PlayerComponent;
  hp?: HpComponent;
  attributes?: AttributesComponent;
  experience?: ExperienceComponent;
  monster?: MonsterComponent;
  item?: ItemComponent;
  hunger?: HungerComponent;
  helpless?: HelplessComponent;
  props?: Record<string, PropState>;
}

export interface Entity {
  id: EntityId;
  def: DefId;
  c: Components;
}
