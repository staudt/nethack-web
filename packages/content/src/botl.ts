// The first status line's words: the hero's rank title (or her form's name while polymorphed)
// and her alignment; and the role's farewell for the end screen.
// ref: src/botl.c do_statusline1(), xlev_to_rank(), rank_of(); src/role.c Goodbye()
import type { GameState, ModApi, Registry } from '@nh/core';
import { getPlayer } from '@nh/core';
import { AMOROUS_DEMON, SUCCUBUS, heroFemale } from './gender';
import { endHow } from './endstate';
import { uState } from './luck';
import { rankTitleKey, roleNameKey } from './roletab';
import { heroFormId } from './upoly';
import { urole } from './urole';

/** Experience level (1..30) to rank index (0..8). ref: src/botl.c xlev_to_rank() */
export const xlevToRank = (xlev: number): number =>
  xlev <= 2 ? 0 : xlev <= 30 ? Math.trunc((xlev + 2) / 4) : 8;

/**
 * The rank title key of experience level `lev` for the hero's role (female when she is and the
 * rank has a female title). Every role has all nine titles, so rank_of()'s fallbacks to a lower
 * rank or the role's name never apply. ref: src/botl.c rank_of()
 */
export function rankOf(state: Readonly<GameState>, lev: number, female: boolean): string {
  return rankTitleKey(urole(state), xlevToRank(lev) + 1, female);
}

/** The role's farewell. ref: src/role.c Goodbye() */
export function goodbyeKey(state: Readonly<GameState>): string {
  const role = urole(state);
  return role === 'knight' || role === 'samurai' || role === 'tourist' || role === 'valkyrie'
    ? `goodbye.${role}`
    : 'goodbye.default';
}

/**
 * The hero's title on the first status line: her rank, or while polymorphed her form's name
 * (pmname() by her gender; the ui capitalises its words as do_statusline1() does).
 */
function titleKey(state: Readonly<GameState>, defs: Registry): string {
  const form = heroFormId(state);
  const female = heroFemale(state);
  if (form !== null && defs.isMonster(form))
    return form === AMOROUS_DEMON && female ? SUCCUBUS : defs.monster(form).nameKey;
  return rankOf(state, getPlayer(state).c.experience?.level ?? 1, female);
}

export function registerBotl(api: ModApi): void {
  // "Name the Stripling": the rank title. ref: src/botl.c do_statusline1() rank()
  api.defineStatus({
    id: 'nh:rank',
    field: 'rank',
    value: (state, defs) => (state.gameOver ? null : titleKey(state, defs)),
  });
  // "Neutral" at the end of the first line. ref: src/botl.c do_statusline1()
  api.defineStatus({
    id: 'nh:align',
    field: 'align',
    value: (state) => {
      if (state.gameOver) return null;
      const a = uState(state).alignType;
      return a < 0
        ? 'status.align.chaotic'
        : a === 0
          ? 'status.align.neutral'
          : 'status.align.lawful';
    },
  });
  // the end screen: "Farvel <name> the Valkyrie..." ref: src/end.c really_done()
  api.defineStatus({
    id: 'nh:goodbye',
    field: 'goodbye',
    value: (state) => (state.gameOver ? goodbyeKey(state) : null),
  });
  // the role's name there and on the stone, female when she is (Cavewoman, Priestess); after an
  // ascension "Demigod" or "Demigoddess"
  api.defineStatus({
    id: 'nh:role',
    field: 'role',
    value: (state) =>
      !state.gameOver
        ? null
        : endHow(state) === 'ascended'
          ? heroFemale(state)
            ? 'end.demigoddess'
            : 'end.demigod'
          : roleNameKey(urole(state), heroFemale(state)),
  });
}
