// The device's options: the player's name, the run speed and what the end of the game
// discloses. Client-side only, never in GameState or saves (ref: src/options.c; doc/Guidebook
// `name`, `runmode`, `disclose`). The movement keys (`nh.keys`, keys.ts) and the zoom (`nh.zoom`,
// the UI's) keep their own storage keys.
//
// Storage: localStorage `nh.options` = { version: 1, name?, runmode?, disclose? }. Reading never
// throws: missing, broken or unknown data reads as the defaults, field by field.
import type { Disclose, KeyLayout, MenuEntry } from '@nh/ui';

/** C's runmode values (flags.runmode RUN_TPORT, RUN_LEAP, RUN_STEP, RUN_CRAWL). */
export type RunMode = 'teleport' | 'run' | 'walk' | 'crawl';

export interface ClientOptions {
  name?: string;
  runmode?: RunMode;
  disclose?: Disclose;
}

export const OPTIONS_KEY = 'nh.options';
/** C's PL_NSIZ - 1. */
export const NAME_MAX = 31;
export const RUNMODES: readonly RunMode[] = ['teleport', 'run', 'walk', 'crawl'];
export const DISCLOSES: readonly Disclose[] = ['ask', 'all', 'none'];
/** Today's pace; C's default is 'run'. */
export const DEFAULT_RUNMODE: RunMode = 'walk';

const isRunMode = (v: unknown): v is RunMode => RUNMODES.includes(v as RunMode);
const isDisclose = (v: unknown): v is Disclose => DISCLOSES.includes(v as Disclose);

/** A name as stored: trimmed, at most {@link NAME_MAX} characters; blank is no name. */
export function cleanName(text: string): string | undefined {
  const n = text.trim().slice(0, NAME_MAX).trim();
  return n === '' ? undefined : n;
}

export function loadOptions(s: Pick<Storage, 'getItem'> | null): ClientOptions {
  let raw: unknown;
  try {
    const text = s?.getItem(OPTIONS_KEY);
    if (!text) return {};
    raw = JSON.parse(text);
  } catch {
    return {};
  }
  if (typeof raw !== 'object' || raw === null) return {};
  const o = raw as Record<string, unknown>;
  if (o['version'] !== 1) return {};
  const name = typeof o['name'] === 'string' ? cleanName(o['name']) : undefined;
  return {
    ...(name !== undefined ? { name } : {}),
    ...(isRunMode(o['runmode']) ? { runmode: o['runmode'] } : {}),
    ...(isDisclose(o['disclose']) ? { disclose: o['disclose'] } : {}),
  };
}

/** False when storage is missing or refuses (the options then last for this page only). */
export function saveOptions(s: Pick<Storage, 'setItem'> | null, o: ClientOptions): boolean {
  if (!s) return false;
  try {
    s.setItem(OPTIONS_KEY, JSON.stringify({ version: 1, ...o }));
    return true;
  } catch {
    return false;
  }
}

/**
 * The UI's delay between the moves of a run, travel or meal, from the walk pace (one
 * delay_output() per step). Teleport draws nothing until she stops (no delay here; the browser
 * may still paint some steps), run updates every 7th step (one delay per 7 steps, spread over
 * them), crawl adds four more delays per step.
 * ref: src/hack.c runmode_delay_output()
 */
export function runmodeDelay(mode: RunMode, walkMs: number): number {
  switch (mode) {
    case 'teleport':
      return 0;
    case 'run':
      return Math.round(walkMs / 7);
    case 'walk':
      return walkMs;
    case 'crawl':
      return walkMs * 5;
  }
}

const RUNMODE_TEXT: Record<RunMode, string> = {
  teleport: 'teleport (fastest: only where she stops)',
  run: 'run (fast)',
  walk: 'walk (every step)',
  crawl: 'crawl (slow)',
};
const DISCLOSE_TEXT: Record<Disclose, string> = {
  ask: 'ask about each list',
  all: 'show every list',
  none: 'show nothing',
};
const LAYOUT_TEXT: Record<KeyLayout, string> = {
  numpad: 'number pad (k kicks)',
  vi: 'vi keys (hjkl move)',
};

export interface OptionsDeps {
  showText(title: string, entries: MenuEntry[], onClose?: () => void): void;
  askText(title: string, initial: string, maxLength: number): Promise<string | null>;
  get(): ClientOptions;
  /** Stores the options and applies them. */
  set(o: ClientOptions): void;
  layout: KeyLayout;
  /** Saves the game, remembers the other layout and reloads (keys are bound at start-up). */
  switchLayout(): void;
  resetZoom(): void;
}

/** A sheet of choices; the current one is marked. Picking or Close goes back to Options. */
function choose<T extends string>(
  d: OptionsDeps,
  title: string,
  values: readonly T[],
  text: Record<T, string>,
  current: T,
  pick: (v: T) => void,
  back: () => void,
): void {
  d.showText(
    title,
    values.map((v) => ({
      label: `${text[v]}${v === current ? '  ✓' : ''}`,
      run: () => {
        pick(v);
        back();
      },
    })),
    back,
  );
}

/** The Options sheet: each row opens its choice and comes back; Close runs `onClose`. */
export function openOptions(d: OptionsDeps, onClose?: () => void): void {
  const o = d.get();
  const again = (): void => openOptions(d, onClose);
  const runmode = o.runmode ?? DEFAULT_RUNMODE;
  const disclose = o.disclose ?? 'ask';
  const entries: MenuEntry[] = [
    {
      label: `Name: ${o.name ?? '(not set)'}`,
      run: () => {
        // ref: src/role.c the "Who are you?" prompt (askname)
        void d.askText('Who are you?', o.name ?? '', NAME_MAX).then((text) => {
          if (text !== null) {
            const next = { ...d.get() };
            const name = cleanName(text);
            if (name === undefined) delete next.name;
            else next.name = name;
            d.set(next);
          }
          again();
        });
      },
    },
    {
      label: `Run speed: ${runmode}`,
      run: () =>
        choose(
          d,
          'Run speed',
          RUNMODES,
          RUNMODE_TEXT,
          runmode,
          (v) => d.set({ ...d.get(), runmode: v }),
          again,
        ),
    },
    {
      label: `End of game: ${DISCLOSE_TEXT[disclose]}`,
      run: () =>
        choose(
          d,
          'At the end of the game',
          DISCLOSES,
          DISCLOSE_TEXT,
          disclose,
          (v) => d.set({ ...d.get(), disclose: v }),
          again,
        ),
    },
    {
      label: `Movement keys: ${LAYOUT_TEXT[d.layout]}`,
      run: () =>
        choose(
          d,
          'Movement keys (reloads)',
          ['numpad', 'vi'] as const,
          LAYOUT_TEXT,
          d.layout,
          (v) => {
            if (v !== d.layout) d.switchLayout();
          },
          again,
        ),
    },
    {
      label: 'Reset zoom',
      run: () => {
        d.resetZoom();
        again();
      },
    },
  ];
  d.showText('Options', entries, onClose);
}
