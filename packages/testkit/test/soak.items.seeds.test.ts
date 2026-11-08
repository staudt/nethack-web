import { describe } from 'vitest';
import { itemSoaks } from './helpers/soak';

describe('item soak', () => {
  itemSoaks([102, 105]); // 105 throws (m7f-d step 1: 102 and 103 no longer did)
});
