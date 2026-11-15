import { describe } from 'vitest';
import { itemSoaks } from './helpers/soak';

describe('item soak', () => {
  itemSoaks([102, 106]); // 106 throws (m15 step 2: 105 no longer did; m7f-d step 1: 102, 103)
});
