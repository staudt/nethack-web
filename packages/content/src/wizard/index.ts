import type { Mod } from '@nh/core';
import { wizCast } from './cast';
import { wizBeforeGameOver, wizDie } from './die';
import { wizGenesis } from './genesis';
import { wizIdentify } from './identify';
import { wizLevelchange } from './levelchange';
import { wizLevelport } from './levelport';
import { wizMap } from './map';
import { wizTeleport } from './teleport';
import { wizWhere } from './where';
import { wizWish } from './wish';

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
    api.defineAction(wizTeleport);
    api.defineAction(wizWish);
    api.defineAction(wizIdentify);
    api.defineAction(wizGenesis);
    api.defineAction(wizLevelchange);
    api.defineAction(wizCast);
    api.defineAction(wizDie);
    api.on('beforeGameOver', wizBeforeGameOver);
  },
};

export { OPEN_DUNGEON_LEVELS, WIZ_LEVELPORT, levelportLevels, wizLevelport } from './levelport';
export { WIZ_MAP, doMapping } from './map';
export { WIZ_TELEPORT, wizTeleport } from './teleport';
export { WIZ_WHERE, printDungeon } from './where';
export { WIZ_IDENTIFY, wizIdentify } from './identify';
export { WIZ_WISH, wizWish } from './wish';
export {
  WIZ_GENESIS,
  createParticular,
  parseGenesis,
  wizGenesis,
  type GenesisSpec,
} from './genesis';
export { WIZ_DIE, wizBeforeGameOver, wizDie } from './die';
export { WIZ_CAST, wizCast } from './cast';
export { WIZ_LEVELCHANGE, wizLevelchange } from './levelchange';
