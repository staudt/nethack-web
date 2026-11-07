import type { ClientMod, PlayerAction } from '@nh/core';
import { messagesEn } from '@nh/content';
import { createAsciiRenderer } from '@nh/render-ascii';
import { createUi, movementKeys } from '@nh/ui';
import {
  extendedCommands,
  keyHelpEn,
  loadLayout,
  lookOptions,
  numpadKeys,
  runPrefixes,
  runKeys,
  saveLayout,
  vanillaKeys,
  wizardKeys,
} from './keys';
import { WIZARD, bootPlan, modsForSave, newGameMods, savedSeed } from './mods';
import { parseParams } from './params';
import { createRemote, type Remote } from './remote';
import { addScore, isoDate, loadScores, scoreRows, type ScoreResult } from './scores';
import { clearSave, loadSave, writeSave } from './storage';
import pkg from '../package.json';

const AUTOSAVE_EVERY = 25;

const randomSeed = (): number => crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
const params = parseParams(location.search, randomSeed);

const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
const remote: Remote = createRemote({
  postMessage: (m) => worker.postMessage(m),
  addEventListener: (t, fn) => worker.addEventListener(t, fn),
});

let size = { w: params.width, h: params.height };
let started = false;
let acts = 0;
let dead = false;
let loading = false;
/** The game mods of the current game include the wizard mod: show the status-line marker. */
let wizard = false;
let wizardKeysBound = false;
/** The current game's seed, for its score entry. */
let seed: number | null = null;
/** The last finished game's place on the score list. */
let lastScore: ScoreResult | null = null;

/** Names the game mods for the next new game or load (from the URL or the save, never state). */
function useMods(ids: string[]): void {
  wizard = ids.includes(WIZARD);
  // Wizard keys (^f, ^w, ...) once a wizard game starts; they shadow browser shortcuts.
  if (wizard && !wizardKeysBound) {
    wizardKeysBound = true;
    wizardKeys.register(ui.api);
  }
  remote.setMods(ids);
}

function startNew(): void {
  dead = false;
  loading = false;
  acts = 0;
  started = true;
  lastScore = null;
  useMods(newGameMods(params.wizard));
  seed = randomSeed();
  remote.newGame(seed, size.w, size.h);
}

/** Loads a save with the mods it was made with. */
function loadText(text: string, mods: string[] = modsForSave(text, params.wizard)): void {
  loading = true;
  seed = savedSeed(text);
  useMods(mods);
  remote.load(text);
}

// Count acts so we can autosave without blocking the UI.
const rawAct = remote.act.bind(remote);
remote.act = (action: PlayerAction) => {
  rawAct(action);
  if (++acts % AUTOSAVE_EVERY === 0) void saveNow();
};

async function saveNow(): Promise<boolean> {
  if (!started || dead) return false;
  try {
    await writeSave(await remote.save());
    return true;
  } catch {
    return false;
  }
}

const storage = ((): Storage | null => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
})();
/** Number pad by default (k kicks); vi keys (hjkl move) as a remembered setting. */
const layout = loadLayout(storage);

/** The high-score list: the last game's place on it, if it has just ended. */
function showScores(own: ScoreResult | null, back?: () => void): void {
  ui.showText('High scores', scoreRows(loadScores(storage), own), back);
}

const appMenuMod: ClientMod = {
  id: 'app',
  version: '0.1.0',
  register(api) {
    api.addMenuItem({
      id: 'app.new',
      labelKey: 'ui.newgame',
      run: () => {
        void clearSave().then(startNew);
      },
    });
    api.addMenuItem({
      id: 'app.save',
      labelKey: 'ui.save',
      run: () => {
        void saveNow().then((ok) => {
          if (ok) ui.notify('ui.saved');
        });
      },
    });
    api.addMenuItem({
      id: 'app.load',
      labelKey: 'ui.load',
      run: () => {
        void loadSave().then((text) => {
          if (text === null) ui.notify('ui.nosave');
          else {
            loadText(text);
          }
        });
      },
    });
    api.addMenuItem({
      id: 'app.scores',
      labelKey: 'app.scores',
      run: () => showScores(null),
    });
    api.addMenuItem({
      id: 'app.keys',
      labelKey: layout === 'numpad' ? 'app.keys.to_vi' : 'app.keys.to_numpad',
      run: () => {
        // Keys are bound at start-up: save, remember the choice and reload.
        saveLayout(storage, layout === 'numpad' ? 'vi' : 'numpad');
        void saveNow().then(() => location.reload());
      },
    });
  },
};

const root = document.getElementById('app');
if (!root) throw new Error('missing #app');

const ui = createUi({
  root,
  renderer: createAsciiRenderer(),
  game: remote,
  mods: [
    movementKeys(layout),
    vanillaKeys,
    ...(layout === 'numpad' ? [numpadKeys] : []),
    runKeys(layout),
    appMenuMod,
    extendedCommands(remote),
  ],
  ...runPrefixes,
  ...lookOptions,
  onNewGame: () => void clearSave().then(startNew),
  // ref: src/end.c really_done(): `if (!wizard) topten()`
  onGameOver: (s) => {
    const entry = {
      ...s,
      points: s.points ?? 0,
      date: isoDate(new Date()),
      seed,
      version: pkg.version,
    };
    lastScore = { entry, rank: wizard ? null : addScore(storage, entry), wizard };
  },
  endEntries: () => [{ labelKey: 'app.scores', run: (back) => showScores(lastScore, back) }],
});
ui.api.addMessages('en', messagesEn);
ui.api.addMessages('en', keyHelpEn);
ui.api.addMessages('en', {
  'app.keys.to_vi': 'Keys: use vi keys (hjkl move)',
  'app.keys.to_numpad': 'Keys: use number pad (k kicks)',
  'app.scores': 'High scores',
  'ui.status.wizard': 'Wizard',
});

remote.onView((m) => {
  if (loading) {
    loading = false;
    ui.notify('ui.loaded');
  }
  if (m.view.status['dead'] !== undefined && !dead) {
    // NetHack deletes the save on death; stop autosaving.
    dead = true;
    void clearSave();
  }
  if (m.view.kind === 'full') size = { w: m.view.width, h: m.view.height };
  // The wizard marker is a status word from the app's own mod list, not from the game state.
  const view = wizard ? { ...m.view, status: { ...m.view.status, wizard: 1 } } : m.view;
  ui.update(view, m.events, m.prompt, m.continuing);
});
remote.onError((e) => {
  if (loading) {
    // The save could not be restored (e.g. an older save version).
    ui.notify('ui.save_incompatible');
    void clearSave().then(startNew);
    return;
  }
  ui.notify('ui.error', { message: e });
});

const flush = (): void => void saveNow();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flush();
});
addEventListener('pagehide', flush);

async function boot(): Promise<void> {
  const stored = params.forceNew || params.explicit ? null : await loadSave();
  const plan = bootPlan(params, stored);
  started = true;
  if (plan.kind === 'load') {
    loadText(plan.save, plan.mods);
    return;
  }
  if (params.forceNew) await clearSave();
  seed = params.seed;
  useMods(plan.mods);
  remote.newGame(params.seed, params.width, params.height);
}

void boot();

(window as unknown as { webhack: unknown }).webhack = {
  hash: () => remote.hash(),
  save: () => remote.save(),
  remote,
};
