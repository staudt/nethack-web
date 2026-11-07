/**
 * Offer priority (`Offer.priority`) for actions the place suggests: stairs underfoot, a pile to
 * pick up, a box to loot or unlock, food to eat here, a door to open. They head the touch menus,
 * before the actions that are always there. Not from NetHack: menu ordering is ours.
 */
export const HERE = 10;

/** Offer priority for actions that belong at the end of a menu (#quit). Not from NetHack. */
export const LAST = -100;
