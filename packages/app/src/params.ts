export interface Params {
  seed: number;
  width: number;
  height: number;
  /** `new=1`: ignore any save. */
  forceNew: boolean;
  /** `wizard=1`: new games load the wizard mod (wizard mode). */
  wizard: boolean;
  /**
   * `role`, `race`, `gender`, `align`: the new game's character, as C's command line options
   * (`?role=val&race=dwa&gender=f&align=l`: a prefix of a name, a file code or "random"; read by
   * the character menus). Absent keys are left out.
   */
  character: CharacterWords;
  /** URL explicitly names a seed, size or character facet, so a new game is wanted. */
  explicit: boolean;
}

export interface CharacterWords {
  role?: string;
  race?: string;
  gender?: string;
  align?: string;
}

export const DEFAULT_W = 80;
export const DEFAULT_H = 21;

const clampSize = (raw: string | null, def: number): number => {
  if (raw === null || !/^\d+$/.test(raw.trim())) return def;
  return Math.min(1000, Math.max(10, Number(raw)));
};

export function parseParams(search: string, randomSeed: () => number): Params {
  const q = new URLSearchParams(search);
  const rawSeed = q.get('seed');
  const seedOk = rawSeed !== null && /^\d+$/.test(rawSeed.trim()) && Number(rawSeed) <= 0xffffffff;
  const seed = seedOk ? Number(rawSeed) : randomSeed();
  const character: CharacterWords = {};
  for (const k of ['role', 'race', 'gender', 'align'] as const) {
    const v = q.get(k)?.trim();
    if (v) character[k] = v;
  }
  return {
    seed,
    width: clampSize(q.get('w'), DEFAULT_W),
    height: clampSize(q.get('h'), DEFAULT_H),
    forceNew: q.get('new') === '1',
    wizard: q.get('wizard') === '1',
    character,
    explicit: seedOk || q.has('w') || q.has('h') || Object.keys(character).length > 0,
  };
}
