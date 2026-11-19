// The four unique relics of the endgame: the Amulet of Yendor, the Bell of Opening, the Candelabrum
// of Invocation and the Book of the Dead (oc_unique objects; the Bell's row comes with m23 step 4).
// Who has them is read from inventories, never stored (u.uhave is C's bookkeeping of addinv() and
// freeinv(); the relics cannot be put in containers). Below everything but core and artistate.ts.
// ref: include/objects.h; include/you.h struct u_have; src/pickup.c in_container(); src/zap.c
// obj_resists(); src/wizard.c mon_has_special(), mon_has_amulet()
import { inventoryOf, type DefId, type Entity, type EntityId, type GameState } from '@nh/core';
import { anyQuestArtifact } from './artistate';

/** ref: include/objects.h AMULET_OF_YENDOR */
export const AMULET_OF_YENDOR: DefId = 'nh:amulet_of_yendor';
/** ref: include/objects.h BELL_OF_OPENING */
export const BELL_OF_OPENING: DefId = 'nh:bell_of_opening';
/** ref: include/objects.h CANDELABRUM_OF_INVOCATION */
export const CANDELABRUM: DefId = 'nh:candelabrum_of_invocation';
/** ref: include/objects.h SPE_BOOK_OF_THE_DEAD */
export const BOOK_OF_THE_DEAD: DefId = 'nh:book_of_the_dead';

/**
 * The real Amulet, the Bell, the Candelabrum or the Book: they cannot be put in a container ("The
 * Candelabrum of Invocation cannot be confined in such trappings."), always resist destruction and
 * are offered to #invoke (oc_unique). ref: src/pickup.c in_container(); src/zap.c obj_resists();
 * src/artifact.c invoke_ok()
 */
export const isUniqueRelic = (def: DefId): boolean =>
  def === AMULET_OF_YENDOR ||
  def === CANDELABRUM ||
  def === BELL_OF_OPENING ||
  def === BOOK_OF_THE_DEAD;

/**
 * The monster carries the Amulet, the Bell, the Candelabrum, the Book or a quest artifact: it
 * does not leave the dungeon (mon_escape()), and Vlad keeps his own shape to carry the
 * Candelabrum (pickvampshape()). ref: src/wizard.c mon_has_special()
 */
export function monHasSpecial(state: Readonly<GameState>, id: EntityId): boolean {
  return inventoryOf(state, id).some((o) => isUniqueRelic(o.def) || anyQuestArtifact(o));
}

/** The relics u.uhave counts. ref: include/you.h struct u_have (amulet, bell, book, menorah) */
export type Uhave = 'amulet' | 'bell' | 'menorah' | 'book';

const UHAVE: Readonly<Record<Uhave, DefId>> = {
  amulet: AMULET_OF_YENDOR,
  bell: BELL_OF_OPENING,
  menorah: CANDELABRUM,
  book: BOOK_OF_THE_DEAD,
};

/**
 * The hero carries the real Amulet (the imitation never counts), the Bell, the Candelabrum or the
 * Book. ref: include/you.h u.uhave (set by src/invent.c addinv_core1(), cleared by
 * freeinv_core())
 */
export function uHave(state: Readonly<GameState>, what: Uhave): boolean {
  const def = UHAVE[what];
  return inventoryOf(state, state.playerId).some((o) => o.def === def);
}

/** The real Amulet the monster carries, or null. ref: src/wizard.c mon_has_amulet() */
export function monHasAmulet(state: Readonly<GameState>, id: EntityId): Entity | null {
  return inventoryOf(state, id).find((o) => o.def === AMULET_OF_YENDOR) ?? null;
}
