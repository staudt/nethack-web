import type { PlayerAction } from './action';
import type { DefId, Json, ModRef } from './common';
import type { Alignment, Character, Gender } from './entity';
import type { GameEvent } from './event';
import type { Prompt } from './prompt';
import type { CoreQuery } from './query';
import type { ViewUpdate } from './view';
import type { GameState } from './state';

export interface Replay {
  seed: number;
  width: number;
  height: number;
  mods: ModRef[];
  /** The character the game started with (always concrete: random picks are resolved first). */
  character: Character;
  actions: PlayerAction[];
}

/** A role as the character menus see it (plain data from a RoleDef). */
export interface RoleChoice {
  id: DefId;
  nameKey: string;
  nameKeyFemale?: string;
  races: DefId[];
  genders: Gender[];
  aligns: Alignment[];
}

/** A race as the character menus see it (plain data from a RaceDef). */
export interface RaceChoice {
  id: DefId;
  nameKey: string;
  adjKey: string;
  genders: Gender[];
  aligns: Alignment[];
}

/** What a new game can start as: the roles in menu order, the races in registration order. */
export interface CharacterChoices {
  roles: RoleChoice[];
  races: RaceChoice[];
}

export interface SaveFile {
  format: 'nh-ts';
  version: 10;
  mods: ModRef[];
  state: GameState;
  replay: Replay;
}

export type ToCore =
  /**
   * Starts a game. `character` fields left out take the defaults (the first registered role, then
   * the first race, gender and alignment the others allow); a forbidden combination is an error.
   */
  | { t: 'new'; seed: number; width: number; height: number; character?: Partial<Character> }
  /** Asks for the character menus' data; answered by `choices` with the same id, game or not. */
  | { t: 'choices'; id: number }
  | { t: 'load'; save: string }
  | { t: 'act'; action: PlayerAction }
  | { t: 'query'; id: number; q: keyof CoreQuery; args: Json[] }
  | { t: 'save' }
  | { t: 'hash' };

export type FromCore =
  | {
      t: 'view';
      view: ViewUpdate;
      events: GameEvent[];
      prompt: Prompt | null;
      /** A multi-turn action is in progress; the client sends `continue` (after a delay) or cancels. */
      continuing: boolean;
    }
  | { t: 'reply'; id: number; result: Json }
  | { t: 'saved'; save: string }
  | { t: 'hash'; hash: string }
  | ({ t: 'choices'; id: number } & CharacterChoices)
  | { t: 'error'; message: string };
