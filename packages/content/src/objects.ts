// ref: include/objects.h (NetHack 5.0). Armor AC here is the bonus (10 - the ARMOR() ac argument).
import type { AppearanceDef, ObjectDef } from '@nh/core';

// Colors as in include/color.h (HI_ aliases resolved).
const BLACK = '#555555';
const BRIGHT_BLUE = '#5555ff';
const BRIGHT_GREEN = '#55ff55';
const BRIGHT_MAGENTA = '#ff55ff';
const BROWN = '#aa5500';
const CYAN = '#33bbbb';
const GRAY = '#aaaaaa';
const GREEN = '#33aa33';
const MAGENTA = '#bb44bb';
const ORANGE = '#ff8800';
const RED = '#cc3333';
const WHITE = '#ffffff';
const YELLOW = '#ffff55';
const BLUE = '#3355cc';
const BRIGHT_CYAN = '#55ffff';

/** Charged rings (oc_charged): their enchantment shows and matters. ref: include/objects.h RING() `spec` */
export const CHARGED_RINGS: ReadonlySet<string> = new Set([
  'nh:ring_of_adornment',
  'nh:ring_of_gain_strength',
  'nh:ring_of_gain_constitution',
  'nh:ring_of_increase_accuracy',
  'nh:ring_of_increase_damage',
  'nh:ring_of_protection',
]);

/** A wand def. ref: include/objects.h WAND(): weight 7, oc_charged, oc_dir */
const wand = (
  slug: string,
  prob: number,
  cost: number,
  magic: boolean,
  dir: 'nodir' | 'immediate' | 'ray',
  material: string,
  fg: string,
): ObjectDef => ({
  id: `nh:wand_of_${slug}`,
  nameKey: `nh:wand_of_${slug}`,
  class: 'wand',
  glyph: { ch: '/', fg },
  prob,
  weight: 7,
  cost,
  material,
  merge: false,
  magic,
  delay: 0,
  wand: { dir },
});

/**
 * A spellbook def. ref: include/objects.h SPELL(): weight 50, cost level * 100, oc_delay is the
 * study delay, no merging, paper; `desc` is the fixed description of blank paper only (the others
 * are shuffled, see o_init.ts SPELLBOOK_CLASSES).
 */
const spellbook = (
  slug: string,
  prob: number,
  delay: number,
  level: number,
  magic: boolean,
  fg: string,
  desc: string | null = null,
): ObjectDef => ({
  id: `nh:spellbook_of_${slug}`,
  nameKey: `nh:spellbook_of_${slug}`,
  ...(desc ? { descKey: `nh:${desc}.desc` } : {}),
  class: 'spellbook',
  glyph: { ch: '+', fg },
  prob,
  weight: 50,
  cost: level * 100,
  material: 'paper',
  merge: false,
  magic,
  delay,
  spellbook: { level },
});

/**
 * A tool def. ref: include/objects.h TOOL(), CONTAINER(), EYEWEAR(): no merging (only the
 * candles are mrg: `extra`), no delay; `desc` is the fixed description of a tool that starts unidentified.
 */
const tool = (
  slug: string,
  prob: number,
  weight: number,
  cost: number,
  material: string,
  fg: string,
  magic: boolean,
  desc: string | null,
  extra: Partial<ObjectDef> = {},
): ObjectDef => ({
  id: `nh:${slug}`,
  nameKey: `nh:${slug}`,
  ...(desc ? { descKey: `nh:${desc}.desc` } : {}),
  class: 'tool',
  glyph: { ch: '(', fg },
  prob,
  weight,
  cost,
  material,
  merge: false,
  magic,
  delay: 0,
  ...extra,
});

/**
 * A gem, a piece of glass or a gray stone. ref: include/objects.h GEM(): weight 1, sdam and ldam
 * 3, sling ammo (-P_SLING), merging, not magic; ROCK() gray stones override the weight and the
 * magic bit. `desc` is the colour ("white"): the description key is `nh:<desc>_gem` or, for
 * mineral stones, `nh:<desc>_stone` (xname()'s GEM_CLASS "gem"/"stone" word).
 */
const gem = (
  slug: string,
  desc: string,
  prob: number,
  cost: number,
  material: 'gemstone' | 'glass' | 'mineral',
  fg: string,
  extra: Partial<ObjectDef> = {},
): ObjectDef => ({
  id: `nh:${slug}`,
  nameKey: `nh:${slug}`,
  descKey: `nh:${desc}_${material === 'mineral' ? 'stone' : 'gem'}`,
  class: 'gem',
  glyph: { ch: '*', fg },
  prob,
  weight: 1,
  cost,
  material,
  merge: true,
  magic: false,
  delay: 0,
  weapon: {
    small: [1, 3],
    large: [1, 3],
    hitBonus: 0,
    skill: 'sling',
    bimanual: false,
    kind: 'whack',
    role: 'ammo',
  },
  ...extra,
});

export const OBJECTS: readonly ObjectDef[] = [
  // ---- weapons ----
  // ref: objects.h WEAPON("dagger", NoDes, 1, 1, 0, 30, 10, 4, 4, 3, 2, P, P_DAGGER, IRON, HI_METAL, DAGGER)
  {
    id: 'nh:dagger',
    nameKey: 'nh:dagger',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 30,
    weight: 10,
    cost: 4,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 4],
      large: [1, 3],
      hitBonus: 2,
      skill: 'dagger',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("elven dagger", "runed dagger", 0, 1, 0, 10, 10, 4, 5, 3, 2, P, P_DAGGER, WOOD, HI_WOOD, ELVEN_DAGGER)
  {
    id: 'nh:elven_dagger',
    nameKey: 'nh:elven_dagger',
    descKey: 'nh:elven_dagger.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: BROWN },
    prob: 10,
    weight: 10,
    cost: 4,
    material: 'wood',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 5],
      large: [1, 3],
      hitBonus: 2,
      skill: 'dagger',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("orcish dagger", "crude dagger", 0, 1, 0, 12, 10, 4, 3, 3, 2, P, P_DAGGER, IRON, CLR_BLACK, ORCISH_DAGGER)
  {
    id: 'nh:orcish_dagger',
    nameKey: 'nh:orcish_dagger',
    descKey: 'nh:orcish_dagger.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: BLACK },
    prob: 12,
    weight: 10,
    cost: 4,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 3],
      large: [1, 3],
      hitBonus: 2,
      skill: 'dagger',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("knife", NoDes, 1, 1, 0, 20, 5, 4, 3, 2, 0, P|S, P_KNIFE, IRON, HI_METAL, KNIFE)
  {
    id: 'nh:knife',
    nameKey: 'nh:knife',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 20,
    weight: 5,
    cost: 4,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 3],
      large: [1, 2],
      hitBonus: 0,
      skill: 'knife',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("spear", NoDes, 1, 1, 0, 50, 30, 3, 6, 8, 0, P, P_SPEAR, IRON, HI_METAL, SPEAR)
  {
    id: 'nh:spear',
    nameKey: 'nh:spear',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 50,
    weight: 30,
    cost: 3,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 8],
      hitBonus: 0,
      skill: 'spear',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("dwarvish spear", "stout spear", 0, 1, 0, 12, 35, 3, 8, 8, 0, P, P_SPEAR, IRON, HI_METAL, DWARVISH_SPEAR)
  {
    id: 'nh:dwarvish_spear',
    nameKey: 'nh:dwarvish_spear',
    descKey: 'nh:dwarvish_spear.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 12,
    weight: 35,
    cost: 3,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 8],
      large: [1, 8],
      hitBonus: 0,
      skill: 'spear',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("short sword", NoDes, 1, 0, 0, 8, 30, 10, 6, 8, 0, P, P_SHORT_SWORD, IRON, HI_METAL, SHORT_SWORD)
  {
    id: 'nh:short_sword',
    nameKey: 'nh:short_sword',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 8,
    weight: 30,
    cost: 10,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 8],
      hitBonus: 0,
      skill: 'short_sword',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("orcish short sword", "crude short sword", 0, 0, 0, 3, 30, 10, 5, 8, 0, P, P_SHORT_SWORD, IRON, CLR_BLACK, ORCISH_SHORT_SWORD)
  {
    id: 'nh:orcish_short_sword',
    nameKey: 'nh:orcish_short_sword',
    descKey: 'nh:orcish_short_sword.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: BLACK },
    prob: 3,
    weight: 30,
    cost: 10,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 5],
      large: [1, 8],
      hitBonus: 0,
      skill: 'short_sword',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("dwarvish short sword", "broad short sword", 0, 0, 0, 2, 30, 10, 7, 8, 0, P, P_SHORT_SWORD, IRON, HI_METAL, DWARVISH_SHORT_SWORD)
  {
    id: 'nh:dwarvish_short_sword',
    nameKey: 'nh:dwarvish_short_sword',
    descKey: 'nh:dwarvish_short_sword.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 2,
    weight: 30,
    cost: 10,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 7],
      large: [1, 8],
      hitBonus: 0,
      skill: 'short_sword',
      bimanual: false,
      kind: 'pierce',
    },
  },
  // ref: objects.h WEAPON("scimitar", "curved sword", 0, 0, 0, 15, 40, 15, 8, 8, 0, S, P_SABER, IRON, HI_METAL, SCIMITAR)
  {
    id: 'nh:scimitar',
    nameKey: 'nh:scimitar',
    descKey: 'nh:scimitar.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 15,
    weight: 40,
    cost: 15,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 8],
      large: [1, 8],
      hitBonus: 0,
      skill: 'saber',
      bimanual: false,
      kind: 'slash',
    },
  },
  // ref: objects.h WEAPON("long sword", NoDes, 1, 0, 0, 50, 40, 15, 8, 12, 0, S, P_LONG_SWORD, IRON, HI_METAL, LONG_SWORD)
  {
    id: 'nh:long_sword',
    nameKey: 'nh:long_sword',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 50,
    weight: 40,
    cost: 15,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 8],
      large: [1, 12],
      hitBonus: 0,
      skill: 'long_sword',
      bimanual: false,
      kind: 'slash',
    },
  },
  // ref: objects.h WEAPON("axe", NoDes, 1, 0, 0, 40, 60, 8, 6, 4, 0, S, P_AXE, IRON, HI_METAL, AXE)
  {
    id: 'nh:axe',
    nameKey: 'nh:axe',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 40,
    weight: 60,
    cost: 8,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 4],
      hitBonus: 0,
      skill: 'axe',
      bimanual: false,
      kind: 'slash',
    },
  },
  // ref: objects.h WEAPON("dwarvish mattock", "broad pick", 0, 0, 1, 13, 120, 50, 12, 8, -1, B, P_PICK_AXE, IRON, HI_METAL, DWARVISH_MATTOCK)
  {
    id: 'nh:dwarvish_mattock',
    nameKey: 'nh:dwarvish_mattock',
    descKey: 'nh:dwarvish_mattock.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 13,
    weight: 120,
    cost: 50,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 12],
      large: [1, 8],
      hitBonus: -1,
      skill: 'pick_axe',
      bimanual: true,
      kind: 'whack',
    },
  },
  // ref: objects.h WEAPON("aklys", "thonged club", 0, 0, 0, 8, 15, 4, 6, 3, 0, B, P_CLUB, IRON, HI_METAL, AKLYS)
  {
    id: 'nh:aklys',
    nameKey: 'nh:aklys',
    descKey: 'nh:aklys.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 8,
    weight: 15,
    cost: 4,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 3],
      hitBonus: 0,
      skill: 'club',
      bimanual: false,
      kind: 'whack',
    },
  },
  // ref: objects.h WEAPON("mace", NoDes, 1, 0, 0, 40, 30, 5, 6, 6, 0, B, P_MACE, IRON, HI_METAL, MACE)
  {
    id: 'nh:mace',
    nameKey: 'nh:mace',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 40,
    weight: 30,
    cost: 5,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 6],
      hitBonus: 0,
      skill: 'mace',
      bimanual: false,
      kind: 'whack',
    },
  },
  // ref: objects.h WEAPON("club", NoDes, 1, 0, 0, 12, 30, 3, 6, 3, 0, B, P_CLUB, WOOD, HI_WOOD, CLUB)
  {
    id: 'nh:club',
    nameKey: 'nh:club',
    class: 'weapon',
    glyph: { ch: ')', fg: BROWN },
    prob: 12,
    weight: 30,
    cost: 3,
    material: 'wood',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 3],
      hitBonus: 0,
      skill: 'club',
      bimanual: false,
      kind: 'whack',
    },
  },

  // ---- missiles, ammunition and launchers (ammo and missiles merge; launchers do not) ----
  // ref: objects.h WEAPON("dart", NoDes, 1, 1, 0, 60, 1, 2, 3, 2, 0, P, -P_DART, IRON, HI_METAL, DART)
  {
    id: 'nh:dart',
    nameKey: 'nh:dart',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 60,
    weight: 1,
    cost: 2,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 3],
      large: [1, 2],
      hitBonus: 0,
      skill: 'dart',
      bimanual: false,
      kind: 'pierce',
      role: 'missile',
    },
  },
  // ref: objects.h PROJECTILE("arrow", NoDes, 1, 55, 1, 2, 6, 6, 0, IRON, -P_BOW, HI_METAL, ARROW)
  {
    id: 'nh:arrow',
    nameKey: 'nh:arrow',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 55,
    weight: 1,
    cost: 2,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 6],
      hitBonus: 0,
      skill: 'bow',
      bimanual: false,
      kind: 'pierce',
      role: 'ammo',
    },
  },
  // ref: objects.h PROJECTILE("elven arrow", "runed arrow", 0, 20, 1, 2, 7, 6, 0, WOOD, -P_BOW, HI_WOOD, ELVEN_ARROW)
  {
    id: 'nh:elven_arrow',
    nameKey: 'nh:elven_arrow',
    descKey: 'nh:elven_arrow.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: BROWN },
    prob: 20,
    weight: 1,
    cost: 2,
    material: 'wood',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 7],
      large: [1, 6],
      hitBonus: 0,
      skill: 'bow',
      bimanual: false,
      kind: 'pierce',
      role: 'ammo',
    },
  },
  // ref: objects.h PROJECTILE("orcish arrow", "crude arrow", 0, 20, 1, 2, 5, 6, 0, IRON, -P_BOW, CLR_BLACK, ORCISH_ARROW)
  {
    id: 'nh:orcish_arrow',
    nameKey: 'nh:orcish_arrow',
    descKey: 'nh:orcish_arrow.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: BLACK },
    prob: 20,
    weight: 1,
    cost: 2,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 5],
      large: [1, 6],
      hitBonus: 0,
      skill: 'bow',
      bimanual: false,
      kind: 'pierce',
      role: 'ammo',
    },
  },
  // ref: objects.h PROJECTILE("crossbow bolt", NoDes, 1, 55, 1, 2, 4, 6, 0, IRON, -P_CROSSBOW, HI_METAL, CROSSBOW_BOLT)
  {
    id: 'nh:crossbow_bolt',
    nameKey: 'nh:crossbow_bolt',
    class: 'weapon',
    glyph: { ch: ')', fg: CYAN },
    prob: 55,
    weight: 1,
    cost: 2,
    material: 'iron',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 4],
      large: [1, 6],
      hitBonus: 0,
      skill: 'crossbow',
      bimanual: false,
      kind: 'pierce',
      role: 'ammo',
    },
  },
  // ref: objects.h BOW("bow", NoDes, 1, 24, 30, 60, 0, WOOD, P_BOW, HI_WOOD, BOW)
  {
    id: 'nh:bow',
    nameKey: 'nh:bow',
    class: 'weapon',
    glyph: { ch: ')', fg: BROWN },
    prob: 24,
    weight: 30,
    cost: 60,
    material: 'wood',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 2],
      large: [1, 2],
      hitBonus: 0,
      skill: 'bow',
      bimanual: false,
      kind: 'whack',
      role: 'launcher',
    },
  },
  // ref: objects.h BOW("elven bow", "runed bow", 0, 12, 30, 60, 0, WOOD, P_BOW, HI_WOOD, ELVEN_BOW)
  {
    id: 'nh:elven_bow',
    nameKey: 'nh:elven_bow',
    descKey: 'nh:elven_bow.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: BROWN },
    prob: 12,
    weight: 30,
    cost: 60,
    material: 'wood',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 2],
      large: [1, 2],
      hitBonus: 0,
      skill: 'bow',
      bimanual: false,
      kind: 'whack',
      role: 'launcher',
    },
  },
  // ref: objects.h BOW("orcish bow", "crude bow", 0, 12, 30, 60, 0, WOOD, P_BOW, CLR_BLACK, ORCISH_BOW)
  {
    id: 'nh:orcish_bow',
    nameKey: 'nh:orcish_bow',
    descKey: 'nh:orcish_bow.desc',
    class: 'weapon',
    glyph: { ch: ')', fg: BLACK },
    prob: 12,
    weight: 30,
    cost: 60,
    material: 'wood',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 2],
      large: [1, 2],
      hitBonus: 0,
      skill: 'bow',
      bimanual: false,
      kind: 'whack',
      role: 'launcher',
    },
  },
  // ref: objects.h BOW("crossbow", NoDes, 1, 45, 50, 40, 0, WOOD, P_CROSSBOW, HI_WOOD, CROSSBOW)
  {
    id: 'nh:crossbow',
    nameKey: 'nh:crossbow',
    class: 'weapon',
    glyph: { ch: ')', fg: BROWN },
    prob: 45,
    weight: 50,
    cost: 40,
    material: 'wood',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 2],
      large: [1, 2],
      hitBonus: 0,
      skill: 'crossbow',
      bimanual: false,
      kind: 'whack',
      role: 'launcher',
    },
  },
  // ref: objects.h BOW("sling", NoDes, 1, 40, 3, 20, 0, LEATHER, P_SLING, HI_LEATHER, SLING)
  {
    id: 'nh:sling',
    nameKey: 'nh:sling',
    class: 'weapon',
    glyph: { ch: ')', fg: BROWN },
    prob: 40,
    weight: 3,
    cost: 20,
    material: 'leather',
    merge: false,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 2],
      large: [1, 2],
      hitBonus: 0,
      skill: 'sling',
      bimanual: false,
      kind: 'whack',
      role: 'launcher',
    },
  },

  // ---- gems, glass and gray stones, in objects.h order (o_init.c setgemprobs() depends on it:
  // the real gems are FIRST_REAL_GEM..LAST_REAL_GEM, then FIRST_GLASS_GEM..LAST_GLASS_GEM) ----
  // ref: objects.h GEM("dilithium crystal", "white", 2, 1, 4500, 15, 5, GEMSTONE, CLR_WHITE)
  gem('dilithium_crystal', 'white', 2, 4500, 'gemstone', WHITE),
  // ref: objects.h GEM("diamond", "white", 3, 1, 4000, 15, 10, GEMSTONE, CLR_WHITE)
  gem('diamond', 'white', 3, 4000, 'gemstone', WHITE),
  // ref: objects.h GEM("ruby", "red", 4, 1, 3500, 15, 9, GEMSTONE, CLR_RED)
  gem('ruby', 'red', 4, 3500, 'gemstone', RED),
  // ref: objects.h GEM("jacinth", "orange", 3, 1, 3250, 15, 9, GEMSTONE, CLR_ORANGE)
  gem('jacinth', 'orange', 3, 3250, 'gemstone', ORANGE),
  // ref: objects.h GEM("sapphire", "blue", 4, 1, 3000, 15, 9, GEMSTONE, CLR_BLUE)
  gem('sapphire', 'blue', 4, 3000, 'gemstone', BLUE),
  // ref: objects.h GEM("black opal", "black", 3, 1, 2500, 15, 8, GEMSTONE, CLR_BLACK)
  gem('black_opal', 'black', 3, 2500, 'gemstone', BLACK),
  // ref: objects.h GEM("emerald", "green", 5, 1, 2500, 15, 8, GEMSTONE, CLR_GREEN)
  gem('emerald', 'green', 5, 2500, 'gemstone', GREEN),
  // ref: objects.h GEM("turquoise", "green", 6, 1, 2000, 15, 6, GEMSTONE, CLR_GREEN)
  gem('turquoise', 'green', 6, 2000, 'gemstone', GREEN),
  // ref: objects.h GEM("citrine", "yellow", 4, 1, 1500, 15, 6, GEMSTONE, CLR_YELLOW)
  gem('citrine', 'yellow', 4, 1500, 'gemstone', YELLOW),
  // ref: objects.h GEM("aquamarine", "green", 6, 1, 1500, 15, 8, GEMSTONE, CLR_GREEN)
  gem('aquamarine', 'green', 6, 1500, 'gemstone', GREEN),
  // ref: objects.h GEM("amber", "yellowish brown", 8, 1, 1000, 15, 2, GEMSTONE, CLR_BROWN)
  gem('amber', 'yellowish_brown', 8, 1000, 'gemstone', BROWN),
  // ref: objects.h GEM("topaz", "yellowish brown", 10, 1, 900, 15, 8, GEMSTONE, CLR_BROWN)
  gem('topaz', 'yellowish_brown', 10, 900, 'gemstone', BROWN),
  // ref: objects.h GEM("jet", "black", 6, 1, 850, 15, 7, GEMSTONE, CLR_BLACK)
  gem('jet', 'black', 6, 850, 'gemstone', BLACK),
  // ref: objects.h GEM("opal", "white", 12, 1, 800, 15, 6, GEMSTONE, CLR_WHITE)
  gem('opal', 'white', 12, 800, 'gemstone', WHITE),
  // ref: objects.h GEM("chrysoberyl", "yellow", 8, 1, 700, 15, 5, GEMSTONE, CLR_YELLOW)
  gem('chrysoberyl', 'yellow', 8, 700, 'gemstone', YELLOW),
  // ref: objects.h GEM("garnet", "red", 12, 1, 700, 15, 7, GEMSTONE, CLR_RED)
  gem('garnet', 'red', 12, 700, 'gemstone', RED),
  // ref: objects.h GEM("amethyst", "violet", 14, 1, 600, 15, 7, GEMSTONE, CLR_MAGENTA)
  gem('amethyst', 'violet', 14, 600, 'gemstone', MAGENTA),
  // ref: objects.h GEM("jasper", "red", 15, 1, 500, 15, 7, GEMSTONE, CLR_RED)
  gem('jasper', 'red', 15, 500, 'gemstone', RED),
  // ref: objects.h GEM("fluorite", "violet", 15, 1, 400, 15, 4, GEMSTONE, CLR_MAGENTA)
  gem('fluorite', 'violet', 15, 400, 'gemstone', MAGENTA),
  // ref: objects.h GEM("obsidian", "black", 9, 1, 200, 15, 6, GEMSTONE, CLR_BLACK)
  gem('obsidian', 'black', 9, 200, 'gemstone', BLACK),
  // ref: objects.h GEM("agate", "orange", 12, 1, 200, 15, 6, GEMSTONE, CLR_ORANGE)
  gem('agate', 'orange', 12, 200, 'gemstone', ORANGE),
  // ref: objects.h GEM("jade", "green", 10, 1, 300, 15, 6, GEMSTONE, CLR_GREEN)
  gem('jade', 'green', 10, 300, 'gemstone', GREEN),
  // ref: objects.h GEM("worthless piece of white glass", "white", 77, 1, 0, 6, 5, GLASS, CLR_WHITE)
  gem('worthless_piece_of_white_glass', 'white', 77, 0, 'glass', WHITE),
  // ref: objects.h GEM("worthless piece of blue glass", "blue", 77, 1, 0, 6, 5, GLASS, CLR_BLUE)
  gem('worthless_piece_of_blue_glass', 'blue', 77, 0, 'glass', BLUE),
  // ref: objects.h GEM("worthless piece of red glass", "red", 77, 1, 0, 6, 5, GLASS, CLR_RED)
  gem('worthless_piece_of_red_glass', 'red', 77, 0, 'glass', RED),
  // ref: objects.h GEM("worthless piece of yellowish brown glass", "yellowish brown", 77, 1, 0, 6, 5, GLASS, CLR_BROWN)
  gem('worthless_piece_of_yellowish_brown_glass', 'yellowish_brown', 77, 0, 'glass', BROWN),
  // ref: objects.h GEM("worthless piece of orange glass", "orange", 76, 1, 0, 6, 5, GLASS, CLR_ORANGE)
  gem('worthless_piece_of_orange_glass', 'orange', 76, 0, 'glass', ORANGE),
  // ref: objects.h GEM("worthless piece of yellow glass", "yellow", 77, 1, 0, 6, 5, GLASS, CLR_YELLOW)
  gem('worthless_piece_of_yellow_glass', 'yellow', 77, 0, 'glass', YELLOW),
  // ref: objects.h GEM("worthless piece of black glass", "black", 76, 1, 0, 6, 5, GLASS, CLR_BLACK)
  gem('worthless_piece_of_black_glass', 'black', 76, 0, 'glass', BLACK),
  // ref: objects.h GEM("worthless piece of green glass", "green", 77, 1, 0, 6, 5, GLASS, CLR_GREEN)
  gem('worthless_piece_of_green_glass', 'green', 77, 0, 'glass', GREEN),
  // ref: objects.h GEM("worthless piece of violet glass", "violet", 77, 1, 0, 6, 5, GLASS, CLR_MAGENTA)
  gem('worthless_piece_of_violet_glass', 'violet', 77, 0, 'glass', MAGENTA),
  // ref: objects.h ROCK("luckstone", "gray", 0, 10, 10, 60, 3, 3, 1, 10, 7, MINERAL, CLR_GRAY, LUCKSTONE)
  gem('luckstone', 'gray', 10, 60, 'mineral', GRAY, { weight: 10, magic: true }),
  // ref: objects.h ROCK("loadstone", "gray", 0, 10, 500, 1, 3, 3, 1, 10, 6, MINERAL, CLR_GRAY, LOADSTONE)
  gem('loadstone', 'gray', 10, 1, 'mineral', GRAY, { weight: 500, magic: true }),
  // ref: objects.h ROCK("touchstone", "gray", 0, 8, 10, 45, 3, 3, 1, 10, 6, MINERAL, CLR_GRAY, TOUCHSTONE)
  gem('touchstone', 'gray', 8, 45, 'mineral', GRAY, { weight: 10, magic: true }),
  // ---- stones fired from a sling (gems class; rock and flint merge) ----
  // ref: objects.h ROCK("flint", "gray", 0, 10, 10, 1, 6, 6, 0, 10, 7, MINERAL, CLR_GRAY, FLINT)
  {
    id: 'nh:flint_stone',
    nameKey: 'nh:flint_stone',
    descKey: 'nh:gray_stone',
    class: 'gem',
    glyph: { ch: '*', fg: GRAY },
    prob: 10,
    weight: 10,
    cost: 1,
    material: 'mineral',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 6],
      large: [1, 6],
      hitBonus: 0,
      skill: 'sling',
      bimanual: false,
      kind: 'whack',
      role: 'ammo',
    },
  },
  // ref: objects.h ROCK("rock", NoDes, 1, 100, 10, 0, 3, 3, 0, 10, 7, MINERAL, CLR_GRAY, ROCK)
  {
    id: 'nh:rock',
    nameKey: 'nh:rock',
    class: 'gem',
    glyph: { ch: '*', fg: GRAY },
    prob: 100,
    weight: 10,
    cost: 0,
    material: 'mineral',
    merge: true,
    magic: false,
    delay: 0,
    weapon: {
      small: [1, 3],
      large: [1, 3],
      hitBonus: 0,
      skill: 'sling',
      bimanual: false,
      kind: 'whack',
      role: 'ammo',
    },
  },
  // ---- ROCK_CLASS ----
  // ref: objects.h OBJECT(OBJ("boulder", NoDes), BITS(1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, P_NONE,
  // MINERAL), 0, ROCK_CLASS, 100, 0, 6000, 0, 20, 20, 0, 0, 2000, HI_MINERAL, BOULDER). ROCK_CLASS
  // is not in mkobjprobs[], so no random object is a boulder. Glyph '0' (the common `boulder`
  // option) rather than the class's '`' (DEVIATIONS.md). Its d20 damage is for thrown boulders
  // (giants), which do not exist.
  {
    id: 'nh:boulder',
    nameKey: 'nh:boulder',
    class: 'rock',
    glyph: { ch: '0', fg: GRAY },
    prob: 100,
    weight: 6000,
    cost: 0,
    material: 'mineral',
    merge: false,
    magic: false,
    delay: 0,
    boulder: true,
  },
  // ref: objects.h OBJECT(OBJ("statue", NoDes), BITS(1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, P_NONE,
  // MINERAL), 0, ROCK_CLASS, 900, 0, 2500, 0, 20, 20, 0, 0, 2500, CLR_WHITE, STATUE). Only
  // monsters turned to stone make one (monstone()): its `corpseOf` is the monster and it holds
  // the monster's possessions (`containedIn`, as C's Has_contents(); it is not a container the
  // hero can open). Shown as the class's '`' for now: 7f-c gives statues the monster's shape.
  {
    id: 'nh:statue',
    nameKey: 'nh:statue',
    class: 'rock',
    glyph: { ch: '`', fg: WHITE },
    prob: 900,
    weight: 2500,
    cost: 0,
    material: 'mineral',
    merge: false,
    magic: false,
    delay: 0,
  },

  // ---- venom: only made when a monster spits (VENOM_CLASS is not in mkobj's class table) ----
  // ref: objects.h OBJECT(OBJ("splash of blinding venom", "splash of venom"), ..., VENOM_CLASS, 500, 0, 1, 0, 0, 0, 0, 0, 0, HI_ORGANIC, BLINDING_VENOM)
  {
    id: 'nh:splash_of_blinding_venom',
    nameKey: 'nh:splash_of_blinding_venom',
    class: 'venom',
    glyph: { ch: '.', fg: BROWN },
    prob: 500,
    weight: 1,
    cost: 0,
    material: 'liquid',
    merge: true,
    magic: false,
    delay: 0,
  },
  // ref: objects.h OBJECT(OBJ("splash of acid venom", "splash of venom"), ..., VENOM_CLASS, 500, 0, 1, 0, 6, 6, 0, 0, 0, HI_ORGANIC, ACID_VENOM)
  // (its d6 damage, oc_wsdam/oc_wldam, is in dmgval.ts: it has no weapon skill)
  {
    id: 'nh:splash_of_acid_venom',
    nameKey: 'nh:splash_of_acid_venom',
    class: 'venom',
    glyph: { ch: '.', fg: BROWN },
    prob: 500,
    weight: 1,
    cost: 0,
    material: 'liquid',
    merge: true,
    magic: false,
    delay: 0,
  },

  // ---- armor (ac = 10 - macro ac argument; mc = macro can argument; armor never merges) ----
  // ref: objects.h SHIELD("small shield", "wooden shield", 0, 0, 0, 0, 6, 0, 30, 3, 9, 0, WOOD, HI_WOOD, SMALL_SHIELD)
  {
    id: 'nh:small_shield',
    nameKey: 'nh:small_shield',
    descKey: 'nh:small_shield.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BROWN },
    prob: 6,
    weight: 30,
    cost: 3,
    material: 'wood',
    merge: false,
    magic: false,
    delay: 0,
    armor: { slot: 'shield', ac: 1, mc: 0 },
  },
  // ref: objects.h ARMOR("elven mithril-coat", NoDes, 1, 0, 0, 0, 15, 1, 150, 240, 5, 2, ARM_SUIT, MITHRIL, HI_SILVER, ELVEN_MITHRIL_COAT)
  {
    id: 'nh:elven_mithril_coat',
    nameKey: 'nh:elven_mithril_coat',
    class: 'armor',
    glyph: { ch: '[', fg: GRAY },
    prob: 15,
    weight: 150,
    cost: 240,
    material: 'mithril',
    merge: false,
    magic: false,
    delay: 1,
    armor: { slot: 'body', ac: 5, mc: 2 },
  },
  // ref: objects.h ARMOR("dwarvish mithril-coat", NoDes, 1, 0, 0, 0, 10, 1, 150, 240, 4, 2, ARM_SUIT, MITHRIL, HI_SILVER, DWARVISH_MITHRIL_COAT)
  {
    id: 'nh:dwarvish_mithril_coat',
    nameKey: 'nh:dwarvish_mithril_coat',
    class: 'armor',
    glyph: { ch: '[', fg: GRAY },
    prob: 10,
    weight: 150,
    cost: 240,
    material: 'mithril',
    merge: false,
    magic: false,
    delay: 1,
    armor: { slot: 'body', ac: 6, mc: 2 },
  },
  // ref: objects.h ARMOR("leather armor", NoDes, 1, 0, 0, 0, 75, 3, 150, 5, 8, 1, ARM_SUIT, LEATHER, HI_LEATHER, LEATHER_ARMOR)
  {
    id: 'nh:leather_armor',
    nameKey: 'nh:leather_armor',
    class: 'armor',
    glyph: { ch: '[', fg: BROWN },
    prob: 75,
    weight: 150,
    cost: 5,
    material: 'leather',
    merge: false,
    magic: false,
    delay: 3,
    armor: { slot: 'body', ac: 2, mc: 1 },
  },
  // ref: objects.h ARMOR("orcish chain mail", "crude chain mail", 0, 0, 0, 0, 19, 5, 300, 75, 6, 1, ARM_SUIT, IRON, CLR_BLACK, ORCISH_CHAIN_MAIL)
  {
    id: 'nh:orcish_chain_mail',
    nameKey: 'nh:orcish_chain_mail',
    descKey: 'nh:orcish_chain_mail.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BLACK },
    prob: 19,
    weight: 300,
    cost: 75,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 5,
    armor: { slot: 'body', ac: 4, mc: 1 },
  },
  // ref: objects.h ARMOR("ring mail", NoDes, 1, 0, 0, 0, 66, 5, 250, 100, 7, 1, ARM_SUIT, IRON, HI_METAL, RING_MAIL)
  {
    id: 'nh:ring_mail',
    nameKey: 'nh:ring_mail',
    class: 'armor',
    glyph: { ch: '[', fg: CYAN },
    prob: 66,
    weight: 250,
    cost: 100,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 5,
    armor: { slot: 'body', ac: 3, mc: 1 },
  },
  // ref: objects.h CLOAK("mummy wrapping", NoDes, 1, 0, 0, 0, 0, 3, 2, 10, 1, CLOTH, CLR_GRAY, MUMMY_WRAPPING)
  {
    id: 'nh:mummy_wrapping',
    nameKey: 'nh:mummy_wrapping',
    class: 'armor',
    glyph: { ch: '[', fg: GRAY },
    prob: 0,
    weight: 3,
    cost: 2,
    material: 'cloth',
    merge: false,
    magic: false,
    delay: 0,
    armor: { slot: 'cloak', ac: 0, mc: 1 },
  },
  // ref: objects.h CLOAK("orcish cloak", "coarse mantelet", 0, 0, 0, 8, 0, 10, 40, 10, 1, CLOTH, CLR_BLACK, ORCISH_CLOAK)
  {
    id: 'nh:orcish_cloak',
    nameKey: 'nh:orcish_cloak',
    descKey: 'nh:orcish_cloak.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BLACK },
    prob: 8,
    weight: 10,
    cost: 40,
    material: 'cloth',
    merge: false,
    magic: false,
    delay: 0,
    armor: { slot: 'cloak', ac: 0, mc: 1 },
  },
  // ref: objects.h CLOAK("dwarvish cloak", "hooded cloak", 0, 0, 0, 8, 0, 10, 50, 10, 1, CLOTH, HI_CLOTH, DWARVISH_CLOAK)
  {
    id: 'nh:dwarvish_cloak',
    nameKey: 'nh:dwarvish_cloak',
    descKey: 'nh:dwarvish_cloak.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BROWN },
    prob: 8,
    weight: 10,
    cost: 50,
    material: 'cloth',
    merge: false,
    magic: false,
    delay: 0,
    armor: { slot: 'cloak', ac: 0, mc: 1 },
  },
  // ref: objects.h CLOAK("robe", NoDes, 1, 1, 0, 6, 0, 15, 50, 8, 2, CLOTH, CLR_RED, ROBE)
  {
    id: 'nh:robe',
    nameKey: 'nh:robe',
    class: 'armor',
    glyph: { ch: '[', fg: RED },
    prob: 6,
    weight: 15,
    cost: 50,
    material: 'cloth',
    merge: false,
    magic: true,
    delay: 0,
    armor: { slot: 'cloak', ac: 2, mc: 2 },
  },
  // ref: objects.h CLOAK("cloak of invisibility", "opera cloak", 0, 1, INVIS, 12, 0, 10, 60, 9, 1, CLOTH, CLR_BRIGHT_MAGENTA, CLOAK_OF_INVISIBILITY)
  {
    id: 'nh:cloak_of_invisibility',
    nameKey: 'nh:cloak_of_invisibility',
    descKey: 'nh:cloak_of_invisibility.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BRIGHT_MAGENTA },
    prob: 12,
    weight: 10,
    cost: 60,
    material: 'cloth',
    merge: false,
    magic: true,
    delay: 0,
    armor: { slot: 'cloak', ac: 1, mc: 1 },
    prop: 'invis',
  },
  // ref: objects.h HELM("orcish helm", "iron skull cap", 0, 0, 0, 6, 1, 30, 10, 9, 0, IRON, CLR_BLACK, ORCISH_HELM)
  {
    id: 'nh:orcish_helm',
    nameKey: 'nh:orcish_helm',
    descKey: 'nh:orcish_helm.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BLACK },
    prob: 6,
    weight: 30,
    cost: 10,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 1,
    armor: { slot: 'helm', ac: 1, mc: 0 },
  },
  // ref: objects.h HELM("dwarvish iron helm", "hard hat", 0, 0, 0, 6, 1, 40, 20, 8, 0, IRON, HI_METAL, DWARVISH_IRON_HELM)
  {
    id: 'nh:dwarvish_iron_helm',
    nameKey: 'nh:dwarvish_iron_helm',
    descKey: 'nh:dwarvish_iron_helm.desc',
    class: 'armor',
    glyph: { ch: '[', fg: CYAN },
    prob: 6,
    weight: 40,
    cost: 20,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 1,
    armor: { slot: 'helm', ac: 2, mc: 0 },
  },
  // ref: objects.h BOOTS("iron shoes", "hard shoes", 0, 0, 0, 7, 2, 50, 16, 8, 0, IRON, HI_METAL, IRON_SHOES)
  {
    id: 'nh:iron_shoes',
    nameKey: 'nh:iron_shoes',
    descKey: 'nh:iron_shoes.desc',
    class: 'armor',
    glyph: { ch: '[', fg: CYAN },
    prob: 7,
    weight: 50,
    cost: 16,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 2,
    armor: { slot: 'boots', ac: 2, mc: 0 },
  },
  // ref: objects.h BOOTS("jumping boots", "hiking boots", 0, 1, JUMPING, 12, 2, 20, 50, 9, 0, LEATHER, HI_LEATHER, JUMPING_BOOTS)
  // (the only boots of the shuffled range here, so the description stays: o_init.ts SHUFFLED)
  {
    id: 'nh:jumping_boots',
    nameKey: 'nh:jumping_boots',
    descKey: 'nh:jumping_boots.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BROWN },
    prob: 12,
    weight: 20,
    cost: 50,
    material: 'leather',
    merge: false,
    magic: true,
    delay: 2,
    armor: { slot: 'boots', ac: 1, mc: 0 },
    prop: 'jumping',
  },
  // ref: objects.h SHIELD("Uruk-hai shield", "white-handed shield", 0, 0, 0, 0, 2, 0, 50, 7, 9, 0, IRON, HI_METAL, URUK_HAI_SHIELD)
  {
    id: 'nh:uruk_hai_shield',
    nameKey: 'nh:uruk_hai_shield',
    descKey: 'nh:uruk_hai_shield.desc',
    class: 'armor',
    glyph: { ch: '[', fg: CYAN },
    prob: 2,
    weight: 50,
    cost: 7,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    armor: { slot: 'shield', ac: 1, mc: 0 },
  },
  // ref: objects.h SHIELD("orcish shield", "red-eyed shield", 0, 0, 0, 0, 2, 0, 50, 7, 9, 0, IRON, CLR_RED, ORCISH_SHIELD)
  {
    id: 'nh:orcish_shield',
    nameKey: 'nh:orcish_shield',
    descKey: 'nh:orcish_shield.desc',
    class: 'armor',
    glyph: { ch: '[', fg: RED },
    prob: 2,
    weight: 50,
    cost: 7,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    armor: { slot: 'shield', ac: 1, mc: 0 },
  },
  // ref: objects.h SHIELD("dwarvish roundshield", "large round shield", 0, 0, 0, 0, 3, 0, 100, 10, 8, 0, IRON, HI_METAL, DWARVISH_ROUNDSHIELD)
  {
    id: 'nh:dwarvish_roundshield',
    nameKey: 'nh:dwarvish_roundshield',
    descKey: 'nh:dwarvish_roundshield.desc',
    class: 'armor',
    glyph: { ch: '[', fg: CYAN },
    prob: 3,
    weight: 100,
    cost: 10,
    material: 'iron',
    merge: false,
    magic: false,
    delay: 0,
    armor: { slot: 'shield', ac: 2, mc: 0 },
  },
  // ref: objects.h GLOVES("leather gloves", "old gloves", 0, 0, 0, 15, 1, 10, 8, 9, 0, LEATHER, HI_LEATHER, LEATHER_GLOVES)
  {
    id: 'nh:leather_gloves',
    nameKey: 'nh:leather_gloves',
    descKey: 'nh:leather_gloves.desc',
    class: 'armor',
    glyph: { ch: '[', fg: BROWN },
    prob: 15,
    weight: 10,
    cost: 8,
    material: 'leather',
    merge: false,
    magic: false,
    delay: 1,
    armor: { slot: 'gloves', ac: 1, mc: 0 },
  },

  // ---- rings (weight 3, prob 1, magic; appearances and colors are shuffled, so no descKey;
  // the material is that of the ring's own description, see DEVIATIONS) ----
  // ref: objects.h RING("adornment", "wooden", ADORNED, 100, 1, 1, ...)
  {
    id: 'nh:ring_of_adornment',
    nameKey: 'nh:ring_of_adornment',
    class: 'ring',
    glyph: { ch: '=', fg: BROWN },
    prob: 1,
    weight: 3,
    cost: 100,
    material: 'wood',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'adorned',
  },
  // ref: objects.h RING("gain strength", "granite", 0, 150, 1, 1, ...)
  {
    id: 'nh:ring_of_gain_strength',
    nameKey: 'nh:ring_of_gain_strength',
    class: 'ring',
    glyph: { ch: '=', fg: GRAY },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'mineral',
    merge: false,
    magic: true,
    delay: 0,
  },
  // ref: objects.h RING("gain constitution", "opal", 0, 150, 1, 1, ...)
  {
    id: 'nh:ring_of_gain_constitution',
    nameKey: 'nh:ring_of_gain_constitution',
    class: 'ring',
    glyph: { ch: '=', fg: GRAY },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'mineral',
    merge: false,
    magic: true,
    delay: 0,
  },
  // ref: objects.h RING("increase accuracy", "clay", 0, 150, 1, 1, ...)
  {
    id: 'nh:ring_of_increase_accuracy',
    nameKey: 'nh:ring_of_increase_accuracy',
    class: 'ring',
    glyph: { ch: '=', fg: RED },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'mineral',
    merge: false,
    magic: true,
    delay: 0,
  },
  // ref: objects.h RING("increase damage", "coral", 0, 150, 1, 1, ...)
  {
    id: 'nh:ring_of_increase_damage',
    nameKey: 'nh:ring_of_increase_damage',
    class: 'ring',
    glyph: { ch: '=', fg: ORANGE },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'mineral',
    merge: false,
    magic: true,
    delay: 0,
  },
  // ref: objects.h RING("protection", "black onyx", PROTECTION, 100, 1, 1, ...)
  {
    id: 'nh:ring_of_protection',
    nameKey: 'nh:ring_of_protection',
    class: 'ring',
    glyph: { ch: '=', fg: BLACK },
    prob: 1,
    weight: 3,
    cost: 100,
    material: 'mineral',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'protection',
  },
  // ref: objects.h RING("regeneration", "moonstone", REGENERATION, 200, 1, 0, ...)
  {
    id: 'nh:ring_of_regeneration',
    nameKey: 'nh:ring_of_regeneration',
    class: 'ring',
    glyph: { ch: '=', fg: GRAY },
    prob: 1,
    weight: 3,
    cost: 200,
    material: 'mineral',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'regeneration',
  },
  // ref: objects.h RING("searching", "tiger eye", SEARCHING, 200, 1, 0, ...)
  {
    id: 'nh:ring_of_searching',
    nameKey: 'nh:ring_of_searching',
    class: 'ring',
    glyph: { ch: '=', fg: BROWN },
    prob: 1,
    weight: 3,
    cost: 200,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'searching',
  },
  // ref: objects.h RING("stealth", "jade", STEALTH, 100, 1, 0, ...)
  {
    id: 'nh:ring_of_stealth',
    nameKey: 'nh:ring_of_stealth',
    class: 'ring',
    glyph: { ch: '=', fg: GREEN },
    prob: 1,
    weight: 3,
    cost: 100,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'stealth',
  },
  // ref: objects.h RING("sustain ability", "bronze", FIXED_ABIL, 100, 1, 0, ...)
  {
    id: 'nh:ring_of_sustain_ability',
    nameKey: 'nh:ring_of_sustain_ability',
    class: 'ring',
    glyph: { ch: '=', fg: YELLOW },
    prob: 1,
    weight: 3,
    cost: 100,
    material: 'copper',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'fixed_abil',
  },
  // ref: objects.h RING("levitation", "agate", LEVITATION, 200, 1, 0, ...)
  {
    id: 'nh:ring_of_levitation',
    nameKey: 'nh:ring_of_levitation',
    class: 'ring',
    glyph: { ch: '=', fg: RED },
    prob: 1,
    weight: 3,
    cost: 200,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'levitation',
  },
  // ref: objects.h RING("hunger", "topaz", HUNGER, 100, 1, 0, ...)
  {
    id: 'nh:ring_of_hunger',
    nameKey: 'nh:ring_of_hunger',
    class: 'ring',
    glyph: { ch: '=', fg: CYAN },
    prob: 1,
    weight: 3,
    cost: 100,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'hunger',
  },
  // ref: objects.h RING("aggravate monster", "sapphire", AGGRAVATE_MONSTER, 150, 1, 0, ...)
  {
    id: 'nh:ring_of_aggravate_monster',
    nameKey: 'nh:ring_of_aggravate_monster',
    class: 'ring',
    glyph: { ch: '=', fg: BLUE },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'aggravate_monster',
  },
  // ref: objects.h RING("conflict", "ruby", CONFLICT, 300, 1, 0, ...)
  {
    id: 'nh:ring_of_conflict',
    nameKey: 'nh:ring_of_conflict',
    class: 'ring',
    glyph: { ch: '=', fg: RED },
    prob: 1,
    weight: 3,
    cost: 300,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'conflict',
  },
  // ref: objects.h RING("warning", "diamond", WARNING, 100, 1, 0, ...)
  {
    id: 'nh:ring_of_warning',
    nameKey: 'nh:ring_of_warning',
    class: 'ring',
    glyph: { ch: '=', fg: WHITE },
    prob: 1,
    weight: 3,
    cost: 100,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'warning',
  },
  // ref: objects.h RING("poison resistance", "pearl", POISON_RES, 150, 1, 0, ...)
  {
    id: 'nh:ring_of_poison_resistance',
    nameKey: 'nh:ring_of_poison_resistance',
    class: 'ring',
    glyph: { ch: '=', fg: WHITE },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'bone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'poison_res',
  },
  // ref: objects.h RING("fire resistance", "iron", FIRE_RES, 200, 1, 0, ...)
  {
    id: 'nh:ring_of_fire_resistance',
    nameKey: 'nh:ring_of_fire_resistance',
    class: 'ring',
    glyph: { ch: '=', fg: CYAN },
    prob: 1,
    weight: 3,
    cost: 200,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'fire_res',
  },
  // ref: objects.h RING("cold resistance", "brass", COLD_RES, 150, 1, 0, ...)
  {
    id: 'nh:ring_of_cold_resistance',
    nameKey: 'nh:ring_of_cold_resistance',
    class: 'ring',
    glyph: { ch: '=', fg: YELLOW },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'copper',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'cold_res',
  },
  // ref: objects.h RING("shock resistance", "copper", SHOCK_RES, 150, 1, 0, ...)
  {
    id: 'nh:ring_of_shock_resistance',
    nameKey: 'nh:ring_of_shock_resistance',
    class: 'ring',
    glyph: { ch: '=', fg: YELLOW },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'copper',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'shock_res',
  },
  // ref: objects.h RING("free action", "twisted", FREE_ACTION, 200, 1, 0, ...)
  {
    id: 'nh:ring_of_free_action',
    nameKey: 'nh:ring_of_free_action',
    class: 'ring',
    glyph: { ch: '=', fg: CYAN },
    prob: 1,
    weight: 3,
    cost: 200,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'free_action',
  },
  // ref: objects.h RING("slow digestion", "steel", SLOW_DIGESTION, 200, 1, 0, ...)
  {
    id: 'nh:ring_of_slow_digestion',
    nameKey: 'nh:ring_of_slow_digestion',
    class: 'ring',
    glyph: { ch: '=', fg: CYAN },
    prob: 1,
    weight: 3,
    cost: 200,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'slow_digestion',
  },
  // ref: objects.h RING("teleportation", "silver", TELEPORT, 200, 1, 0, ...)
  {
    id: 'nh:ring_of_teleportation',
    nameKey: 'nh:ring_of_teleportation',
    class: 'ring',
    glyph: { ch: '=', fg: GRAY },
    prob: 1,
    weight: 3,
    cost: 200,
    material: 'silver',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'teleport',
  },
  // ref: objects.h RING("teleport control", "gold", TELEPORT_CONTROL, 300, 1, 0, ...)
  {
    id: 'nh:ring_of_teleport_control',
    nameKey: 'nh:ring_of_teleport_control',
    class: 'ring',
    glyph: { ch: '=', fg: YELLOW },
    prob: 1,
    weight: 3,
    cost: 300,
    material: 'gold',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'teleport_control',
  },
  // ref: objects.h RING("polymorph", "ivory", POLYMORPH, 300, 1, 0, 4, BONE, CLR_WHITE, RIN_POLYMORPH)
  {
    id: 'nh:ring_of_polymorph',
    nameKey: 'nh:ring_of_polymorph',
    class: 'ring',
    glyph: { ch: '=', fg: WHITE },
    prob: 1,
    weight: 3,
    cost: 300,
    material: 'bone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'polymorph',
  },
  // ref: objects.h RING("polymorph control", "emerald", POLYMORPH_CONTROL, 300, 1, 0, 8, GEMSTONE, CLR_BRIGHT_GREEN, RIN_POLYMORPH_CONTROL)
  {
    id: 'nh:ring_of_polymorph_control',
    nameKey: 'nh:ring_of_polymorph_control',
    class: 'ring',
    glyph: { ch: '=', fg: BRIGHT_GREEN },
    prob: 1,
    weight: 3,
    cost: 300,
    material: 'gemstone',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'polymorph_control',
  },
  // ref: objects.h RING("invisibility", "wire", INVIS, 150, 1, 0, 5, IRON, HI_METAL, RIN_INVISIBILITY)
  {
    id: 'nh:ring_of_invisibility',
    nameKey: 'nh:ring_of_invisibility',
    class: 'ring',
    glyph: { ch: '=', fg: CYAN },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'invis',
  },
  // ref: objects.h RING("see invisible", "engagement", SEE_INVIS, 150, 1, 0, 5, IRON, HI_METAL, RIN_SEE_INVISIBLE)
  {
    id: 'nh:ring_of_see_invisible',
    nameKey: 'nh:ring_of_see_invisible',
    class: 'ring',
    glyph: { ch: '=', fg: CYAN },
    prob: 1,
    weight: 3,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'see_invis',
  },

  // ---- amulets (iron, weight 20, cost 150, magic; appearances are shuffled) ----
  // ref: objects.h AMULET("amulet of ESP", "circular", TELEPAT, 120)
  {
    id: 'nh:amulet_of_esp',
    nameKey: 'nh:amulet_of_esp',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 120,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'telepat',
  },
  // ref: objects.h AMULET("amulet of life saving", "spherical", LIFESAVED, 75)
  {
    id: 'nh:amulet_of_life_saving',
    nameKey: 'nh:amulet_of_life_saving',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 75,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'lifesaved',
  },
  // ref: objects.h AMULET("amulet of strangulation", "oval", STRANGLED, 115)
  {
    id: 'nh:amulet_of_strangulation',
    nameKey: 'nh:amulet_of_strangulation',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 115,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'strangled',
  },
  // ref: objects.h AMULET("amulet of restful sleep", "triangular", SLEEPY, 115)
  {
    id: 'nh:amulet_of_restful_sleep',
    nameKey: 'nh:amulet_of_restful_sleep',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 115,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'sleepy',
  },
  // ref: objects.h AMULET("amulet versus poison", "pyramidal", POISON_RES, 115)
  {
    id: 'nh:amulet_versus_poison',
    nameKey: 'nh:amulet_versus_poison',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 115,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'poison_res',
  },
  // ref: objects.h AMULET("amulet of change", "square", 0, 115, AMULET_OF_CHANGE)
  {
    id: 'nh:amulet_of_change',
    nameKey: 'nh:amulet_of_change',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 115,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
  },
  // ref: objects.h AMULET("amulet of unchanging", "concave", UNCHANGING, 60, AMULET_OF_UNCHANGING)
  {
    id: 'nh:amulet_of_unchanging',
    nameKey: 'nh:amulet_of_unchanging',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 60,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'unchanging',
  },
  // ref: objects.h AMULET("amulet of reflection", "hexagonal", REFLECTING, 75)
  {
    id: 'nh:amulet_of_reflection',
    nameKey: 'nh:amulet_of_reflection',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 75,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'reflecting',
  },
  // ref: objects.h AMULET("amulet of magical breathing", "octagonal", MAGICAL_BREATHING, 75)
  {
    id: 'nh:amulet_of_magical_breathing',
    nameKey: 'nh:amulet_of_magical_breathing',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 75,
    weight: 20,
    cost: 150,
    material: 'iron',
    merge: false,
    magic: true,
    delay: 0,
    prop: 'magical_breathing',
  },
  // ref: objects.h OBJECT(OBJ("cheap plastic imitation of the Amulet of Yendor", "Amulet of Yendor"), ... PLASTIC, 0, AMULET_CLASS, 0, 0, 20, 0, ...)
  {
    id: 'nh:fake_amulet_of_yendor',
    nameKey: 'nh:fake_amulet_of_yendor',
    descKey: 'nh:fake_amulet_of_yendor.desc',
    class: 'amulet',
    glyph: { ch: '"', fg: CYAN },
    prob: 0,
    weight: 20,
    cost: 0,
    material: 'plastic',
    merge: false,
    magic: false,
    delay: 0,
  },

  // ---- wands (weight 7, charged; appearances are shuffled, so no descKey; the material is
  // that of the wand's own description, see DEVIATIONS) ----
  // ref: objects.h WAND("light", "glass", 95, 100, 1, NODIR, GLASS, ...)
  wand('light', 95, 100, true, 'nodir', 'glass', BRIGHT_CYAN),
  // ref: objects.h WAND("secret door detection", "balsa", 50, 150, 1, NODIR, WOOD, ...)
  wand('secret_door_detection', 50, 150, true, 'nodir', 'wood', BROWN),
  // ref: objects.h WAND("enlightenment", "crystal", 15, 150, 1, NODIR, GLASS, HI_GLASS, ...)
  wand('enlightenment', 15, 150, true, 'nodir', 'glass', BRIGHT_CYAN),
  // ref: objects.h WAND("create monster", "maple", 50, 200, 1, NODIR, WOOD, ...)
  wand('create_monster', 50, 200, true, 'nodir', 'wood', BROWN),
  // ref: objects.h WAND("wishing", "pine", 5, 500, 1, NODIR, WOOD, HI_WOOD, ...)
  wand('wishing', 5, 500, true, 'nodir', 'wood', BROWN),
  // ref: objects.h WAND("stasis", "redwood", 45, 150, 1, NODIR, WOOD, CLR_RED, ...)
  wand('stasis', 45, 150, true, 'nodir', 'wood', RED),
  // ref: objects.h WAND("nothing", "oak", 25, 100, 0, IMMEDIATE, WOOD, ...)
  wand('nothing', 25, 100, false, 'immediate', 'wood', BROWN),
  // ref: objects.h WAND("striking", "ebony", 30, 150, 1, IMMEDIATE, WOOD, ...)
  wand('striking', 30, 150, true, 'immediate', 'wood', BROWN),
  // ref: objects.h WAND("make invisible", "marble", 45, 150, 1, IMMEDIATE, MINERAL, HI_MINERAL, ...)
  wand('make_invisible', 45, 150, true, 'immediate', 'mineral', GRAY),
  // ref: objects.h WAND("slow monster", "tin", 50, 150, 1, IMMEDIATE, METAL, ...)
  wand('slow_monster', 50, 150, true, 'immediate', 'metal', CYAN),
  // ref: objects.h WAND("speed monster", "brass", 50, 150, 1, IMMEDIATE, COPPER, ...)
  wand('speed_monster', 50, 150, true, 'immediate', 'copper', YELLOW),
  // ref: objects.h WAND("undead turning", "copper", 50, 150, 1, IMMEDIATE, COPPER, HI_COPPER, ...)
  wand('undead_turning', 50, 150, true, 'immediate', 'copper', YELLOW),
  // ref: objects.h WAND("polymorph", "silver", 45, 200, 1, IMMEDIATE, SILVER, HI_SILVER, WAN_POLYMORPH)
  wand('polymorph', 45, 200, true, 'immediate', 'silver', GRAY),
  // ref: objects.h WAND("cancellation", "platinum", 45, 200, 1, IMMEDIATE, PLATINUM, CLR_WHITE, ...)
  wand('cancellation', 45, 200, true, 'immediate', 'platinum', WHITE),
  // ref: objects.h WAND("teleportation", "iridium", 45, 200, 1, IMMEDIATE, METAL, CLR_BRIGHT_CYAN, ...)
  wand('teleportation', 45, 200, true, 'immediate', 'metal', BRIGHT_CYAN),
  // ref: objects.h WAND("opening", "zinc", 30, 150, 1, IMMEDIATE, METAL, ...)
  wand('opening', 30, 150, true, 'immediate', 'metal', CYAN),
  // ref: objects.h WAND("locking", "aluminum", 30, 150, 1, IMMEDIATE, METAL, ...)
  wand('locking', 30, 150, true, 'immediate', 'metal', CYAN),
  // ref: objects.h WAND("probing", "uranium", 30, 150, 1, IMMEDIATE, METAL, ...)
  wand('probing', 30, 150, true, 'immediate', 'metal', CYAN),
  // ref: objects.h WAND("digging", "iron", 40, 150, 1, RAY, IRON, HI_METAL, ...)
  wand('digging', 40, 150, true, 'ray', 'iron', CYAN),
  // ref: objects.h WAND("magic missile", "steel", 50, 150, 1, RAY, IRON, ...)
  wand('magic_missile', 50, 150, true, 'ray', 'iron', CYAN),
  // ref: objects.h WAND("fire", "hexagonal", 40, 175, 1, RAY, IRON, ...)
  wand('fire', 40, 175, true, 'ray', 'iron', CYAN),
  // ref: objects.h WAND("cold", "short", 40, 175, 1, RAY, IRON, ...)
  wand('cold', 40, 175, true, 'ray', 'iron', CYAN),
  // ref: objects.h WAND("sleep", "runed", 50, 175, 1, RAY, IRON, ...)
  wand('sleep', 50, 175, true, 'ray', 'iron', CYAN),
  // ref: objects.h WAND("death", "long", 5, 500, 1, RAY, IRON, HI_METAL, ...)
  wand('death', 5, 500, true, 'ray', 'iron', CYAN),
  // ref: objects.h WAND("lightning", "curved", 40, 175, 1, RAY, IRON, ...)
  wand('lightning', 40, 175, true, 'ray', 'iron', CYAN),

  // ---- tools (TOOL_CLASS '('; only candles merge; appearances are not shuffled, so the
  // described ones carry a fixed descKey: "bag", "key", "candle", "lamp", "whistle") ----
  // ref: objects.h CONTAINER("large box", NoDes, 1, 0, 0, 40, 350, 8, WOOD, HI_WOOD, LARGE_BOX)
  tool('large_box', 40, 350, 8, 'wood', BROWN, false, null, {
    container: { capacity: null, box: true },
  }),
  // ref: objects.h CONTAINER("chest", NoDes, 1, 0, 0, 35, 600, 16, WOOD, HI_WOOD, CHEST)
  tool('chest', 35, 600, 16, 'wood', BROWN, false, null, {
    container: { capacity: null, box: true },
  }),
  // ref: objects.h CONTAINER("sack", "bag", 0, 0, 0, 35, 15, 2, CLOTH, HI_CLOTH, SACK)
  tool('sack', 35, 15, 2, 'cloth', BROWN, false, 'bag', {
    container: { capacity: null, box: false },
  }),
  // ref: objects.h CONTAINER("oilskin sack", "bag", 0, 0, 0, 5, 15, 100, CLOTH, HI_CLOTH, OILSKIN_SACK)
  tool('oilskin_sack', 5, 15, 100, 'cloth', BROWN, false, 'bag', {
    container: { capacity: null, box: false },
  }),
  // ref: objects.h CONTAINER("bag of holding", "bag", 0, 1, 0, 20, 15, 100, CLOTH, HI_CLOTH, BAG_OF_HOLDING)
  tool('bag_of_holding', 20, 15, 100, 'cloth', BROWN, true, 'bag', {
    container: { capacity: null, box: false, holding: true },
  }),
  // ref: objects.h TOOL("skeleton key", "key", 0, 0, 0, 0, 80, 3, 10, IRON, HI_METAL, SKELETON_KEY)
  tool('skeleton_key', 80, 3, 10, 'iron', CYAN, false, 'key'),
  // ref: objects.h TOOL("lock pick", NoDes, 1, 0, 0, 0, 60, 4, 20, IRON, HI_METAL, LOCK_PICK)
  tool('lock_pick', 60, 4, 20, 'iron', CYAN, false, null),
  // ref: objects.h TOOL("credit card", NoDes, 1, 0, 0, 0, 15, 1, 10, PLASTIC, CLR_WHITE, CREDIT_CARD)
  tool('credit_card', 15, 1, 10, 'plastic', WHITE, false, null),
  // candles merge (mergable(): only when their ages are close); they cannot be lit yet
  // ref: objects.h TOOL("tallow candle", "candle", 0, 1, 0, 0, 20, 2, 10, WAX, CLR_WHITE, TALLOW_CANDLE)
  tool('tallow_candle', 20, 2, 10, 'wax', WHITE, false, 'candle', { merge: true }),
  // ref: objects.h TOOL("wax candle", "candle", 0, 1, 0, 0, 5, 2, 20, WAX, CLR_WHITE, WAX_CANDLE)
  tool('wax_candle', 5, 2, 20, 'wax', WHITE, false, 'candle', { merge: true }),
  // ref: objects.h TOOL("brass lantern", NoDes, 1, 0, 0, 0, 30, 30, 12, COPPER, CLR_YELLOW, BRASS_LANTERN)
  tool('brass_lantern', 30, 30, 12, 'copper', YELLOW, false, null),
  // ref: objects.h TOOL("oil lamp", "lamp", 0, 0, 0, 0, 45, 20, 10, COPPER, CLR_YELLOW, OIL_LAMP)
  tool('oil_lamp', 45, 20, 10, 'copper', YELLOW, false, 'lamp'),
  // ref: objects.h EYEWEAR("blindfold", NoDes, 1, BLINDED, 50, 2, 20, CLOTH, CLR_BLACK, BLINDFOLD)
  tool('blindfold', 50, 2, 20, 'cloth', BLACK, false, null, { prop: 'blinded' }),
  // made only by #untrap (and wishes); setting them (use_trap()) is not ported
  // ref: objects.h TOOL("land mine", NoDes, 1, 0, 0, 0, 0, 200, 180, IRON, CLR_RED, LAND_MINE)
  tool('land_mine', 0, 200, 180, 'iron', RED, false, null),
  // ref: objects.h TOOL("beartrap", NoDes, 1, 0, 0, 0, 0, 200, 60, IRON, HI_METAL, BEARTRAP)
  tool('beartrap', 0, 200, 60, 'iron', CYAN, false, null),
  // ref: objects.h TOOL("tin whistle", "whistle", 0, 0, 0, 0, 100, 3, 10, METAL, HI_METAL, TIN_WHISTLE)
  tool('tin_whistle', 100, 3, 10, 'metal', CYAN, false, 'whistle'),
  // ref: objects.h TOOL("magic whistle", "whistle", 0, 0, 1, 0, 30, 3, 10, METAL, HI_METAL, MAGIC_WHISTLE)
  tool('magic_whistle', 30, 3, 10, 'metal', CYAN, true, 'whistle'),
  // tools useful as weapons (is_weptool(): a tool with a weapon skill)
  // ref: objects.h WEPTOOL("pick-axe", NoDes, 1, 0, 0, 20, 100, 50, 6, 3, WHACK, P_PICK_AXE, IRON, HI_METAL, PICK_AXE)
  tool('pick_axe', 20, 100, 50, 'iron', CYAN, false, null, {
    weapon: {
      small: [1, 6],
      large: [1, 3],
      // WEPTOOL() passes its strike mode (WHACK = 4) as oc_hitbon too; hitval() adds it
      hitBonus: 4,
      skill: 'pick_axe',
      bimanual: false,
      kind: 'whack',
    },
  }),
  // ---- food (all food merges; cost = nutrition / 20 + 5 as in the FOOD() macro) ----
  // ref: objects.h FOOD("food ration", 380, 5, 20, 0, VEGGY, 800, HI_ORGANIC, FOOD_RATION)
  {
    id: 'nh:food_ration',
    nameKey: 'nh:food_ration',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 380,
    weight: 20,
    cost: 45,
    material: 'veggy',
    merge: true,
    magic: false,
    delay: 5,
    food: { nutrition: 800 },
  },
  // ref: objects.h FOOD("cram ration", 20, 3, 15, 0, VEGGY, 600, HI_ORGANIC, CRAM_RATION)
  {
    id: 'nh:cram_ration',
    nameKey: 'nh:cram_ration',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 20,
    weight: 15,
    cost: 35,
    material: 'veggy',
    merge: true,
    magic: false,
    delay: 3,
    food: { nutrition: 600 },
  },
  // ref: objects.h FOOD("lembas wafer", 20, 2, 5, 0, VEGGY, 800, CLR_WHITE, LEMBAS_WAFER)
  {
    id: 'nh:lembas_wafer',
    nameKey: 'nh:lembas_wafer',
    class: 'food',
    glyph: { ch: '%', fg: WHITE },
    prob: 20,
    weight: 5,
    cost: 45,
    material: 'veggy',
    merge: true,
    magic: false,
    delay: 2,
    food: { nutrition: 800 },
  },
  // ref: objects.h FOOD("tripe ration", 140, 2, 10, 0, FLESH, 200, CLR_BROWN, TRIPE_RATION)
  {
    id: 'nh:tripe_ration',
    nameKey: 'nh:tripe_ration',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 140,
    weight: 10,
    cost: 15,
    material: 'flesh',
    merge: true,
    magic: false,
    delay: 2,
    food: { nutrition: 200 },
  },
  // ref: objects.h FOOD("apple", 15, 1, 2, 0, VEGGY, 50, CLR_RED, APPLE)
  {
    id: 'nh:apple',
    nameKey: 'nh:apple',
    class: 'food',
    glyph: { ch: '%', fg: RED },
    prob: 15,
    weight: 2,
    cost: 7,
    material: 'veggy',
    merge: true,
    magic: false,
    delay: 1,
    food: { nutrition: 50 },
  },
  // ref: objects.h FOOD("carrot", 15, 1, 2, 0, VEGGY, 50, CLR_ORANGE, CARROT)
  {
    id: 'nh:carrot',
    nameKey: 'nh:carrot',
    class: 'food',
    glyph: { ch: '%', fg: ORANGE },
    prob: 15,
    weight: 2,
    cost: 7,
    material: 'veggy',
    merge: true,
    magic: false,
    delay: 1,
    food: { nutrition: 50 },
  },
  // ref: objects.h FOOD("corpse", 0, 1, 0, 0, FLESH, 0, CLR_BROWN, CORPSE); weight and nutrition are per monster at runtime
  {
    id: 'nh:corpse',
    nameKey: 'nh:corpse',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 0,
    weight: 0,
    cost: 5,
    material: 'flesh',
    merge: true,
    magic: false,
    delay: 1,
    food: { nutrition: 0 },
  },
  // ref: objects.h FOOD("meatball", 0, 1, 1, 0, FLESH, 5, CLR_BROWN, MEATBALL)
  // (this one and the next three are made only by stone to flesh: stoneflesh.ts)
  {
    id: 'nh:meatball',
    nameKey: 'nh:meatball',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 0,
    weight: 1,
    cost: 5,
    material: 'flesh',
    merge: true,
    magic: false,
    delay: 1,
    food: { nutrition: 5 },
  },
  // ref: objects.h FOOD("meat stick", 0, 1, 1, 0, FLESH, 5, CLR_BROWN, MEAT_STICK)
  {
    id: 'nh:meat_stick',
    nameKey: 'nh:meat_stick',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 0,
    weight: 1,
    cost: 5,
    material: 'flesh',
    merge: true,
    magic: false,
    delay: 1,
    food: { nutrition: 5 },
  },
  // ref: objects.h FOOD("enormous meatball", 0, 20, 400, 0, FLESH, 2000, CLR_BROWN, ENORMOUS_MEATBALL)
  // (formerly "huge chunk of meat")
  {
    id: 'nh:enormous_meatball',
    nameKey: 'nh:enormous_meatball',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 0,
    weight: 400,
    cost: 105,
    material: 'flesh',
    merge: true,
    magic: false,
    delay: 20,
    food: { nutrition: 2000 },
  },
  // ref: objects.h OBJECT(OBJ("meat ring", NoDes), BITS(1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, FLESH), 0, FOOD_CLASS, 0, 1, 5, 1, 0, 0, 0, 0, 5, CLR_BROWN, MEAT_RING)
  {
    id: 'nh:meat_ring',
    nameKey: 'nh:meat_ring',
    class: 'food',
    glyph: { ch: '%', fg: BROWN },
    prob: 0,
    weight: 5,
    cost: 1,
    material: 'flesh',
    merge: false,
    magic: false,
    delay: 1,
    food: { nutrition: 5 },
  },

  // ---- coin ----
  // ref: objects.h COIN("gold piece", 1000, GOLD, 1, GOLD_PIECE)
  {
    id: 'nh:gold_piece',
    nameKey: 'nh:gold_piece',
    class: 'coin',
    glyph: { ch: '$', fg: YELLOW },
    prob: 1000,
    weight: 1,
    cost: 1,
    material: 'gold',
    merge: true,
    magic: false,
    delay: 0,
  },

  // ---- potions (glass, weight 20, merge; known-name potions have no descKey) ----
  // in objects.h order, so the probability walk matches mkobj()
  // ref: objects.h POTION("confusion", "orange", 1, ..., 40, 100, CLR_ORANGE, POT_CONFUSION)
  {
    id: 'nh:potion_of_confusion',
    nameKey: 'nh:potion_of_confusion',
    class: 'potion',
    glyph: { ch: '!', fg: ORANGE },
    prob: 40,
    weight: 20,
    cost: 100,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("blindness", "yellow", 1, ..., 30, 150, CLR_YELLOW, POT_BLINDNESS)
  {
    id: 'nh:potion_of_blindness',
    nameKey: 'nh:potion_of_blindness',
    class: 'potion',
    glyph: { ch: '!', fg: YELLOW },
    prob: 30,
    weight: 20,
    cost: 150,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("hallucination", "sky blue", 1, ..., 30, 100, CLR_CYAN, POT_HALLUCINATION)
  {
    id: 'nh:potion_of_hallucination',
    nameKey: 'nh:potion_of_hallucination',
    class: 'potion',
    glyph: { ch: '!', fg: CYAN },
    prob: 30,
    weight: 20,
    cost: 100,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("invisibility", "brilliant blue", 1, INVIS, 40, 150, CLR_BRIGHT_BLUE, POT_INVISIBILITY)
  {
    id: 'nh:potion_of_invisibility',
    nameKey: 'nh:potion_of_invisibility',
    class: 'potion',
    glyph: { ch: '!', fg: BRIGHT_BLUE },
    prob: 40,
    weight: 20,
    cost: 150,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("see invisible", "magenta", 1, SEE_INVIS, 40, 50, CLR_MAGENTA, POT_SEE_INVISIBLE)
  {
    id: 'nh:potion_of_see_invisible',
    nameKey: 'nh:potion_of_see_invisible',
    class: 'potion',
    glyph: { ch: '!', fg: MAGENTA },
    prob: 40,
    weight: 20,
    cost: 50,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("healing", "purple-red", 1, 0, 115, 20, CLR_MAGENTA, POT_HEALING)
  {
    id: 'nh:potion_of_healing',
    nameKey: 'nh:potion_of_healing',
    class: 'potion',
    glyph: { ch: '!', fg: MAGENTA },
    prob: 115,
    weight: 20,
    cost: 20,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("extra healing", "puce", 1, 0, 45, 100, CLR_RED, POT_EXTRA_HEALING)
  {
    id: 'nh:potion_of_extra_healing',
    nameKey: 'nh:potion_of_extra_healing',
    class: 'potion',
    glyph: { ch: '!', fg: RED },
    prob: 45,
    weight: 20,
    cost: 100,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("sleeping", "effervescent", 1, ..., 40, 100, CLR_GRAY, POT_SLEEPING)
  {
    id: 'nh:potion_of_sleeping',
    nameKey: 'nh:potion_of_sleeping',
    class: 'potion',
    glyph: { ch: '!', fg: GRAY },
    prob: 40,
    weight: 20,
    cost: 100,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("full healing", "black", 1, 0, 10, 200, CLR_BLACK, POT_FULL_HEALING)
  {
    id: 'nh:potion_of_full_healing',
    nameKey: 'nh:potion_of_full_healing',
    class: 'potion',
    glyph: { ch: '!', fg: BLACK },
    prob: 10,
    weight: 20,
    cost: 200,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("polymorph", "golden", 1, 0, 10, 200, CLR_YELLOW, POT_POLYMORPH)
  {
    id: 'nh:potion_of_polymorph',
    nameKey: 'nh:potion_of_polymorph',
    class: 'potion',
    glyph: { ch: '!', fg: YELLOW },
    prob: 10,
    weight: 20,
    cost: 200,
    material: 'glass',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h POTION("booze", "brown", 0, ..., 40, 50, CLR_BROWN, POT_BOOZE)
  {
    id: 'nh:potion_of_booze',
    nameKey: 'nh:potion_of_booze',
    class: 'potion',
    glyph: { ch: '!', fg: BROWN },
    prob: 40,
    weight: 20,
    cost: 50,
    material: 'glass',
    merge: true,
    magic: false,
    delay: 0,
  },
  // ref: objects.h POTION("water", "clear", 0, 0, 80, 100, CLR_CYAN, POT_WATER)
  {
    id: 'nh:potion_of_water',
    nameKey: 'nh:potion_of_water',
    descKey: 'nh:potion_of_water.desc',
    class: 'potion',
    glyph: { ch: '!', fg: CYAN },
    prob: 80,
    weight: 20,
    cost: 100,
    material: 'glass',
    merge: true,
    magic: false,
    delay: 0,
  },

  // ---- scrolls (paper, weight 5, merge; appearances are shuffled so no descKey) ----
  // ref: objects.h SCROLL("identify", "KERNOD WEL", 1, 180, 20, SCR_IDENTIFY)
  {
    id: 'nh:scroll_of_identify',
    nameKey: 'nh:scroll_of_identify',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 180,
    weight: 5,
    cost: 20,
    material: 'paper',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h SCROLL("enchant weapon", "DAIYEN FOOELS", 1, 80, 60, SCR_ENCHANT_WEAPON)
  {
    id: 'nh:scroll_of_enchant_weapon',
    nameKey: 'nh:scroll_of_enchant_weapon',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 80,
    weight: 5,
    cost: 60,
    material: 'paper',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h SCROLL("enchant armor", "ZELGO MER", 1, 63, 80, SCR_ENCHANT_ARMOR)
  {
    id: 'nh:scroll_of_enchant_armor',
    nameKey: 'nh:scroll_of_enchant_armor',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 63,
    weight: 5,
    cost: 80,
    material: 'paper',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h SCROLL("remove curse", "PRATYAVAYAH", 1, 65, 80, SCR_REMOVE_CURSE)
  {
    id: 'nh:scroll_of_remove_curse',
    nameKey: 'nh:scroll_of_remove_curse',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 65,
    weight: 5,
    cost: 80,
    material: 'paper',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h SCROLL("light", "VERR YED HORRE", 1, 90, 50, SCR_LIGHT)
  {
    id: 'nh:scroll_of_light',
    nameKey: 'nh:scroll_of_light',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 90,
    weight: 5,
    cost: 50,
    material: 'paper',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h SCROLL("teleportation", "VENZAR BORGAVVE", 1, 55, 100, SCR_TELEPORTATION)
  {
    id: 'nh:scroll_of_teleportation',
    nameKey: 'nh:scroll_of_teleportation',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 55,
    weight: 5,
    cost: 100,
    material: 'paper',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h SCROLL("earth", "KIRJE", 1, 18, 200, SCR_EARTH)
  {
    id: 'nh:scroll_of_earth',
    nameKey: 'nh:scroll_of_earth',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 18,
    weight: 5,
    cost: 200,
    material: 'paper',
    merge: true,
    magic: true,
    delay: 0,
  },
  // ref: objects.h SCROLL("blank paper", "unlabeled", 0, 28, 60, SCR_BLANK_PAPER): a fixed
  // description, so it stays out of the shuffled labels
  {
    id: 'nh:scroll_of_blank_paper',
    nameKey: 'nh:scroll_of_blank_paper',
    descKey: 'nh:scroll_of_blank_paper.desc',
    class: 'scroll',
    glyph: { ch: '?', fg: WHITE },
    prob: 28,
    weight: 5,
    cost: 60,
    material: 'paper',
    merge: true,
    magic: false,
    delay: 0,
  },

  // ---- spellbooks (weight 50, cost level * 100; appearances are shuffled, so no descKey;
  // a subset of the books plus blank paper) ----
  // ref: objects.h SPELL("sleep", "mottled", P_ENCHANTMENT_SPELL, 30, 1, 3, 1, RAY, HI_PAPER, SPE_SLEEP)
  spellbook('sleep', 30, 1, 3, true, WHITE),
  // ref: objects.h SPELL("light", "cloth", P_DIVINATION_SPELL, 45, 1, 1, 1, NODIR, HI_CLOTH, SPE_LIGHT)
  spellbook('light', 45, 1, 1, true, BROWN),
  // ref: objects.h SPELL("detect monsters", "leathery", P_DIVINATION_SPELL, 43, 1, 1, 1, NODIR, HI_LEATHER, ...)
  spellbook('detect_monsters', 43, 1, 1, true, BROWN),
  // ref: objects.h SPELL("healing", "white", P_HEALING_SPELL, 40, 2, 1, 1, IMMEDIATE, CLR_WHITE, SPE_HEALING)
  spellbook('healing', 40, 2, 1, true, WHITE),
  // ref: objects.h SPELL("force bolt", "red", P_ATTACK_SPELL, 30, 2, 1, 1, IMMEDIATE, CLR_RED, ...)
  spellbook('force_bolt', 30, 2, 1, true, RED),
  // ref: objects.h SPELL("confuse monster", "orange", P_ENCHANTMENT_SPELL, 49, 2, 1, 1, IMMEDIATE, CLR_ORANGE, ...)
  spellbook('confuse_monster', 49, 2, 1, true, ORANGE),
  // ref: objects.h SPELL("cure blindness", "yellow", P_HEALING_SPELL, 25, 2, 2, 1, IMMEDIATE, CLR_YELLOW, ...)
  spellbook('cure_blindness', 25, 2, 2, true, YELLOW),
  // ref: objects.h SPELL("polymorph", "silver", P_MATTER_SPELL, 10, 8, 6, 1, IMMEDIATE, HI_SILVER, SPE_POLYMORPH)
  spellbook('polymorph', 10, 8, 6, true, GRAY),
  // ref: objects.h SPELL("protection", "dull", P_CLERIC_SPELL, 18, 3, 1, 1, NODIR, HI_PAPER, ...)
  spellbook('protection', 18, 3, 1, true, WHITE),
  // ref: objects.h SPELL("jumping", "thin", P_ESCAPE_SPELL, 20, 3, 1, 1, IMMEDIATE, HI_PAPER, SPE_JUMPING)
  spellbook('jumping', 20, 3, 1, true, WHITE),
  // ref: objects.h SPELL("stone to flesh", "thick", P_HEALING_SPELL, 15, 1, 3, 1, IMMEDIATE, HI_PAPER, SPE_STONE_TO_FLESH)
  spellbook('stone_to_flesh', 15, 1, 3, true, WHITE),
  // ref: objects.h SPELL("blank paper", "plain", P_NONE, 18, 0, 0, 0, 0, HI_PAPER, SPE_BLANK_PAPER)
  spellbook('blank_paper', 18, 0, 0, false, WHITE, 'plain_spellbook'),
];

/** Shuffled potion descriptions, one per potion except water (ref: objects.h POTION() descriptions). */
const potionLook = (slug: string, fg: string): AppearanceDef => ({
  id: `nh:${slug}_potion`,
  nameKey: `nh:${slug}_potion`,
  class: 'potion',
  glyph: { ch: '!', fg },
});

/** Shuffled scroll labels (ref: objects.h SCROLL() labels and XTRA_SCROLL_LABEL()). */
const scrollLabel = (slug: string): AppearanceDef => ({
  id: `nh:scroll_labeled_${slug}`,
  nameKey: `nh:scroll_labeled_${slug}`,
  class: 'scroll',
  glyph: { ch: '?', fg: WHITE },
});

/** Shuffled ring descriptions with their colors (ref: objects.h RING() descriptions). */
const ringLook = (slug: string, fg: string): AppearanceDef => ({
  id: `nh:${slug}_ring`,
  nameKey: `nh:${slug}_ring`,
  class: 'ring',
  glyph: { ch: '=', fg },
});

/** Shuffled amulet descriptions (ref: objects.h AMULET() descriptions, all HI_METAL). */
const amuletLook = (slug: string): AppearanceDef => ({
  id: `nh:${slug}_amulet`,
  nameKey: `nh:${slug}_amulet`,
  class: 'amulet',
  glyph: { ch: '"', fg: CYAN },
});

/** Shuffled wand descriptions with their colors (ref: objects.h WAND() descriptions). */
const wandLook = (slug: string, fg: string): AppearanceDef => ({
  id: `nh:${slug}_wand`,
  nameKey: `nh:${slug}_wand`,
  class: 'wand',
  glyph: { ch: '/', fg },
});

/** Shuffled spellbook descriptions with their colors (ref: objects.h SPELL() descriptions). */
const bookLook = (slug: string, fg: string): AppearanceDef => ({
  id: `nh:${slug}_spellbook`,
  nameKey: `nh:${slug}_spellbook`,
  class: 'spellbook',
  glyph: { ch: '+', fg },
});

export const APPEARANCES: readonly AppearanceDef[] = [
  // ---- potion descriptions ----
  potionLook('ruby', RED), // gain ability
  potionLook('pink', BRIGHT_MAGENTA), // restore ability
  potionLook('orange', ORANGE), // confusion
  potionLook('yellow', YELLOW), // blindness
  potionLook('emerald', BRIGHT_GREEN), // paralysis
  potionLook('dark_green', GREEN), // speed
  potionLook('cyan', CYAN), // levitation
  potionLook('sky_blue', CYAN), // hallucination
  potionLook('brilliant_blue', BRIGHT_BLUE), // invisibility
  potionLook('magenta', MAGENTA), // see invisible
  potionLook('purple_red', MAGENTA), // healing
  potionLook('puce', RED), // extra healing
  potionLook('milky', WHITE), // gain level
  potionLook('swirly', BROWN), // enlightenment
  potionLook('bubbly', WHITE), // monster detection
  potionLook('smoky', GRAY), // object detection
  potionLook('cloudy', WHITE), // gain energy
  potionLook('effervescent', GRAY), // sleeping
  potionLook('black', BLACK), // full healing
  potionLook('golden', YELLOW), // polymorph
  potionLook('brown', BROWN), // booze
  potionLook('fizzy', CYAN), // sickness
  potionLook('dark', BLACK), // fruit juice
  potionLook('white', WHITE), // acid
  potionLook('murky', BROWN), // oil

  // ---- scroll labels: labeled scrolls, then XTRA_SCROLL_LABEL extras (mail and blank paper are fixed) ----
  scrollLabel('zelgo_mer'), // enchant armor
  scrollLabel('juyed_awk_yacc'), // destroy armor
  scrollLabel('nr_9'), // confuse monster
  scrollLabel('xixaxa_xoxaxa_xuxaxa'), // scare monster
  scrollLabel('pratyavayah'), // remove curse
  scrollLabel('daiyen_fooels'), // enchant weapon
  scrollLabel('lep_gex_ven_zea'), // create monster
  scrollLabel('prirutsenie'), // taming
  scrollLabel('elbib_yloh'), // genocide
  scrollLabel('verr_yed_horre'), // light
  scrollLabel('venzar_borgavve'), // teleportation
  scrollLabel('tharr'), // gold detection
  scrollLabel('yum_yum'), // food detection
  scrollLabel('kernod_wel'), // identify
  scrollLabel('elam_ebow'), // magic mapping
  scrollLabel('duam_xnaht'), // amnesia
  scrollLabel('andova_begarin'), // fire
  scrollLabel('kirje'), // earth
  scrollLabel('ve_forbryderne'), // punishment
  scrollLabel('hackem_muche'), // charging
  scrollLabel('velox_neb'), // stinking cloud
  scrollLabel('foobie_bletch'),
  scrollLabel('temov'),
  scrollLabel('garven_deh'),
  scrollLabel('read_me'),
  scrollLabel('etaoin_shrdlu'),
  scrollLabel('lorem_ipsum'),
  scrollLabel('fnord'),
  scrollLabel('ko_bate'),
  scrollLabel('abra_ka_dabra'),
  scrollLabel('ashpd_sodalg'),
  scrollLabel('zlorfik'),
  scrollLabel('gnik_sisi_vle'),
  scrollLabel('hapax_legomenon'),
  scrollLabel('eiris_sazun_idisi'),
  scrollLabel('phol_ende_wodan'),
  scrollLabel('ghoti'),
  scrollLabel('mapiro_mahama_diromat'),
  scrollLabel('vas_corp_bet_mani'),
  scrollLabel('xor_ota'),
  scrollLabel('strc_prst_skrz_krk'),

  // ---- ring descriptions, in objects.h order ----
  ringLook('wooden', BROWN),
  ringLook('granite', GRAY),
  ringLook('opal', GRAY),
  ringLook('clay', RED),
  ringLook('coral', ORANGE),
  ringLook('black_onyx', BLACK),
  ringLook('moonstone', GRAY),
  ringLook('tiger_eye', BROWN),
  ringLook('jade', GREEN),
  ringLook('bronze', YELLOW),
  ringLook('agate', RED),
  ringLook('topaz', CYAN),
  ringLook('sapphire', BLUE),
  ringLook('ruby', RED),
  ringLook('diamond', WHITE),
  ringLook('pearl', WHITE),
  ringLook('iron', CYAN),
  ringLook('brass', YELLOW),
  ringLook('copper', YELLOW),
  ringLook('twisted', CYAN),
  ringLook('steel', CYAN),
  ringLook('silver', GRAY),
  ringLook('gold', YELLOW),
  ringLook('ivory', WHITE),
  ringLook('emerald', BRIGHT_GREEN),
  ringLook('wire', CYAN),
  ringLook('engagement', CYAN),
  ringLook('shiny', BRIGHT_CYAN),

  // ---- amulet descriptions, in objects.h order (ESP .. flying) ----
  amuletLook('circular'),
  amuletLook('spherical'),
  amuletLook('oval'),
  amuletLook('triangular'),
  amuletLook('pyramidal'),
  amuletLook('square'),
  amuletLook('concave'),
  amuletLook('hexagonal'),
  amuletLook('octagonal'),
  amuletLook('perforated'),
  amuletLook('cubical'),

  // ---- wand descriptions, in objects.h order (light .. lightning, then the extras) ----
  wandLook('glass', BRIGHT_CYAN),
  wandLook('balsa', BROWN),
  wandLook('crystal', BRIGHT_CYAN),
  wandLook('maple', BROWN),
  wandLook('pine', BROWN),
  wandLook('redwood', RED),
  wandLook('oak', BROWN),
  wandLook('ebony', BROWN),
  wandLook('marble', GRAY),
  wandLook('tin', CYAN),
  wandLook('brass', YELLOW),
  wandLook('copper', YELLOW),
  wandLook('silver', GRAY),
  wandLook('platinum', WHITE),
  wandLook('iridium', BRIGHT_CYAN),
  wandLook('zinc', CYAN),
  wandLook('aluminum', CYAN),
  wandLook('uranium', CYAN),
  wandLook('iron', CYAN),
  wandLook('steel', CYAN),
  wandLook('hexagonal', CYAN),
  wandLook('short', CYAN),
  wandLook('runed', CYAN),
  wandLook('long', CYAN),
  wandLook('curved', CYAN),
  wandLook('forked', BROWN),
  wandLook('spiked', CYAN),
  wandLook('jeweled', GRAY),

  // ---- spellbook descriptions, in objects.h order (dig .. chain lightning) ----
  bookLook('parchment', BROWN),
  bookLook('vellum', BROWN),
  bookLook('ragged', WHITE),
  bookLook('dog_eared', WHITE),
  bookLook('mottled', WHITE),
  bookLook('stained', WHITE),
  bookLook('cloth', BROWN),
  bookLook('leathery', BROWN),
  bookLook('white', WHITE),
  bookLook('pink', BRIGHT_MAGENTA),
  bookLook('red', RED),
  bookLook('orange', ORANGE),
  bookLook('yellow', YELLOW),
  bookLook('velvet', MAGENTA),
  bookLook('light_green', BRIGHT_GREEN),
  bookLook('dark_green', GREEN),
  bookLook('turquoise', BRIGHT_CYAN),
  bookLook('cyan', CYAN),
  bookLook('light_blue', BRIGHT_BLUE),
  bookLook('dark_blue', BLUE),
  bookLook('indigo', BLUE),
  bookLook('magenta', MAGENTA),
  bookLook('purple', MAGENTA),
  bookLook('violet', MAGENTA),
  bookLook('tan', BROWN),
  bookLook('plaid', GREEN),
  bookLook('light_brown', BROWN),
  bookLook('dark_brown', BROWN),
  bookLook('gray', GRAY),
  bookLook('wrinkled', WHITE),
  bookLook('dusty', WHITE),
  bookLook('bronze', YELLOW),
  bookLook('copper', YELLOW),
  bookLook('silver', GRAY),
  bookLook('gold', YELLOW),
  bookLook('glittering', WHITE),
  bookLook('shining', WHITE),
  bookLook('dull', WHITE),
  bookLook('thin', WHITE),
  bookLook('thick', WHITE),
  bookLook('checkered', GRAY),
];
