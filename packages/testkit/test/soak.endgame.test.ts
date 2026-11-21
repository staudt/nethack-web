import { describe } from 'vitest';
import { endgameSoaks } from './helpers/endgame';

// The hero starts on each plane (endgameStartMod) with the Amulet and the bot plays there, with
// every invariant checked as it goes (no monster or object on rock, the hero on a passable cell
// or in the water) and the bubbles kept in bounds.
// (Water and the Astral Plane run in soak.endgame2.test.ts, on another worker)
describe('soak in the endgame', () => {
  endgameSoaks(['earth', 'air', 'fire']);
});
