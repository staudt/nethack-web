// The dungeons and their branches. ref: dat/dungeon.lua
import type { DungeonDef } from '@nh/core';

/**
 * The Dungeons of Doom. NetHack gives it `rn1(5, 25)` levels with the Castle at the bottom;
 * without the Castle this port keeps it endless (see DEVIATIONS.md and `DUNGEON_BOTTOM`).
 */
export const DUNGEONS: readonly DungeonDef[] = [{ id: 'nh:main', nameKey: 'nh:main' }];
