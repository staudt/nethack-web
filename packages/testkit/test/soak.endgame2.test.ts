import { describe } from 'vitest';
import { endgameSoaks } from './helpers/endgame';

// The endgame soak on the Plane of Water and the Astral Plane (see soak.endgame.test.ts), in
// its own file so it runs on a parallel worker.
describe('soak in the endgame', () => {
  endgameSoaks(['water', 'astral']);
});
