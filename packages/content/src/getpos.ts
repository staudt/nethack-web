import {
  getLevel,
  inBounds,
  type Ctx,
  type DefId,
  type Json,
  type Params,
  type Pos,
} from '@nh/core';

/**
 * The content side of the position prompt: NetHack's getpos(), which asks the player for a map
 * cell. The UI draws the cursor (its getpos state machine); content only asks and checks.
 */

export interface AskPositionOptions {
  /** The prompt id (default `'position'`). */
  id?: string;
  params?: Params;
  /** Where the cursor starts (getpos()'s `ccp` on entry); default: the hero. */
  start?: Pos;
  /**
   * Cells to highlight and jump between (getpos_sethilite()'s getvalid). A hint only: the
   * handler re-checks the answer. List only cells the hero knows of.
   */
  valid?: readonly Pos[];
}

/**
 * Ends the step with a position prompt answered to `handler`'s `answer()` with `{ x, y }` or
 * null (ESC). Cells outside the level are dropped from `start` and `valid`.
 * ref: src/getpos.c getpos(), getpos_sethilite()
 */
export function askPosition(
  ctx: Ctx,
  key: string,
  handler: DefId,
  data: Json,
  opts: AskPositionOptions = {},
): void {
  const level = getLevel(ctx.state);
  const on = (p: Pos): boolean => inBounds(level, p.x, p.y);
  const start = opts.start && on(opts.start) ? { x: opts.start.x, y: opts.start.y } : null;
  const valid = opts.valid?.filter(on).map((p) => ({ x: p.x, y: p.y }));
  ctx.ask(
    {
      id: opts.id ?? 'position',
      kind: 'position',
      key,
      ...(opts.params ? { params: opts.params } : {}),
      ...(start ? { start } : {}),
      ...(valid ? { valid } : {}),
    },
    handler,
    data,
  );
}

/** A position prompt's answer as a cell, or null when cancelled (the engine checked its shape). */
export function positionAnswer(value: Json): Pos | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  return typeof x === 'number' && typeof y === 'number' ? { x, y } : null;
}
