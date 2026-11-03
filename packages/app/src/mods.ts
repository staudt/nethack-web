import type { Params } from './params';

/** Game mod ids the app can load, in load order. The worker maps them to the mods. */
export const VANILLA = 'nh';
export const WIZARD = 'wiz';

/** The mods for a new game: wizard mode (`wizard=1`) adds the wizard mod after vanilla. */
export const newGameMods = (wizard: boolean): string[] => (wizard ? [VANILLA, WIZARD] : [VANILLA]);

/** The mod ids a save was made with, or null if the text is not a readable save. */
export function savedModIds(text: string): string[] | null {
  try {
    const file = JSON.parse(text) as { mods?: unknown };
    if (!Array.isArray(file.mods)) return null;
    const ids = file.mods.map((m) => (m as { id?: unknown } | null)?.id);
    return ids.every((id): id is string => typeof id === 'string') ? ids : null;
  } catch {
    return null;
  }
}

export type BootPlan =
  { kind: 'load'; save: string; mods: string[] } | { kind: 'new'; mods: string[] };

/**
 * What to do at start-up. A stored save is resumed with the mods it was made with, so a wizard
 * game stays a wizard game and a normal one stays normal whatever the URL says, except that
 * `new=1`, an explicit seed or size, or `wizard=1` over a save made without the wizard mod
 * starts a new game (whose autosave then replaces the stored one).
 */
export function bootPlan(p: Params, save: string | null): BootPlan {
  const fresh: BootPlan = { kind: 'new', mods: newGameMods(p.wizard) };
  if (p.forceNew || p.explicit || save === null) return fresh;
  const mods = savedModIds(save);
  // An unreadable save is handed to the core anyway: its error starts a new game.
  if (mods === null) return { kind: 'load', save, mods: newGameMods(p.wizard) };
  if (p.wizard && !mods.includes(WIZARD)) return fresh;
  return { kind: 'load', save, mods };
}

/** The mods to load a save chosen from the menu with: its own, else the URL's choice. */
export const modsForSave = (save: string, wizard: boolean): string[] =>
  savedModIds(save) ?? newGameMods(wizard);
