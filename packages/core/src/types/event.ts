import type { DefId, EntityId, Json, Msg, Params, Pos } from './common';

/** One cell of a ray and its direction of travel there. */
export interface RayStep {
  x: number;
  y: number;
  dx: number;
  dy: number;
}

export type GameEvent =
  | { type: 'msg'; key: string; params?: Params }
  | { type: 'moved'; id: EntityId; from: Pos; to: Pos }
  | { type: 'doorOpened'; pos: Pos }
  | { type: 'blocked'; pos: Pos; terrain: DefId }
  | { type: 'turnEnded'; turn: number }
  | { type: 'searched' }
  /**
   * A thrown or fired object flying (ref: src/display.c tmp_at() with delay_output()). `path` is
   * the cells it crosses that the hero can see, in order; `g` is its shown id (appearance).
   */
  | { type: 'projectile'; g: DefId; path: Pos[] }
  /**
   * A ray (ref: src/zap.c dobuzz() with tmp_at(DISP_BEAM)): it grows one cell at a time and stays
   * drawn until it ends. `path` is the cells the hero sees it cross, in order, each with the ray's
   * direction there, so a bounce shows as a turn; `kind` names the ray (e.g. `fire`), `fg` is its
   * color.
   */
  | { type: 'ray'; kind: string; fg: string; path: RayStep[] }
  /**
   * An informational list for the player (discoveries); the UI shows it in a sheet. `ask` (a
   * message key) is a yes/no/quit question the UI asks first, skipping the list on no and every
   * later asking list on quit: the end-of-game disclosure (ref: src/end.c disclose()). The
   * answers change nothing in the game, so they never become actions.
   */
  | { type: 'list'; titleKey: string; items: Msg[]; ask?: string }
  | { type: 'mod'; mod: string; name: string; data: Json };
