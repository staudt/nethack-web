import type { DefId, Json, Params, Pos } from './common';

/** A question the core asks the player; answered with a `{ type: 'answer' }` action. */
export interface Prompt {
  id: string;
  /**
   * 'text' is answered with a string (at most `maxLength` characters), or null to cancel.
   * 'position' asks for a map cell of the hero's level (NetHack's getpos()): it is answered with
   * `{ x, y }` (integers inside the level) or null to cancel; the engine refuses anything else.
   */
  kind: 'yn' | 'direction' | 'menu' | 'text' | 'position';
  key: string;
  params?: Params;
  options?: PromptOption[];
  /**
   * Menu prompts only: the player may choose several options; the answer is the array of chosen
   * values, where an option with `max` may instead be answered as `{ value, count }`.
   */
  multi?: boolean;
  /** Text prompts: the longest answer accepted. */
  maxLength?: number;
  /**
   * Text prompts: the answer is a whole number (an amount of gold), so the UI offers a number
   * pad and accepts digits only. The answer is still a string; the handler parses it.
   */
  numeric?: boolean;
  /**
   * Single-select menus and yn prompts: the player may dismiss it (NetHack's ESC), which answers
   * `null`. Multi menus, direction and text prompts can always be cancelled.
   */
  cancellable?: boolean;
  /** Position prompts: where the cursor starts (default: the hero). */
  start?: Pos;
  /**
   * Position prompts: cells to highlight and jump between (NetHack's getpos_hilitefunc and
   * getvalid). Only a hint: any cell may be picked and the handler checks the answer itself, so
   * it must list only cells the hero knows of.
   */
  valid?: Pos[];
}

export interface PromptOption {
  value: Json;
  key: string;
  params?: Params;
  /** Shown glyph id (an item's appearance), for menus of objects. */
  glyph?: DefId;
  /** The key that picks this option, e.g. an item's inventory letter (already part of its label). */
  letter?: string;
  /** Multi menus: a count from 1 to `max` may be chosen for this option (a stack size). */
  max?: number;
}
