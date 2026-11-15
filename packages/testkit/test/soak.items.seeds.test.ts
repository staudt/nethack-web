import { describe } from 'vitest';
import { itemSoaks } from './helpers/soak';

describe('item soak', () => {
  // 103 throws with and without m16 step 7's grave roll (106 stopped throwing then; m15 step 2:
  // 105 no longer did; m7f-d step 1: 102, 103)
  itemSoaks([102, 103]);
});
