import type { Mod } from '@nh/core';
import { wizLevelport } from './levelport';
import { wizMap } from './map';
import { wizWhere } from './where';

/**
 * Wizard mode (NetHack's `-D` debug mode) as a separate game mod: the debug commands, offered on
 * `{ kind: 'self' }`. Not part of `vanillaMod`; a save made with it needs it to load.
 * ref: src/cmd.c extcmdlist (WIZMODECMD entries), src/wizcmds.c
 */
export const wizardMod: Mod = {
  id: 'wiz',
  version: '0.1.0',
  dependsOn: ['nh'],
  register(api) {
    api.defineAction(wizMap);
    api.defineAction(wizWhere);
    api.defineAction(wizLevelport);
  },
};

export { OPEN_DUNGEON_LEVELS, WIZ_LEVELPORT, levelportLevels, wizLevelport } from './levelport';
export { WIZ_MAP, doMapping } from './map';
export { WIZ_WHERE, printDungeon } from './where';
