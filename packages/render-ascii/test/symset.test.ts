import { expect, test } from 'vitest';
import { legendGlyph } from '../src/index';

// m21 Q3: a client mod's setGlyph() override applies only while no symbol set is in force; the
// legend core sent (already resolved through the set) is drawn as it is.
test('legendGlyph: overrides only without a symset, else the legend', () => {
  const legend = { 'nh:dagger': { ch: ')', fg: '#aaaaaa' } };
  const overrides = new Map([['nh:dagger', { ch: 'D', fg: '#fff' }]]);
  expect(legendGlyph('nh:dagger', legend, overrides, undefined)).toEqual({ ch: 'D', fg: '#fff' });
  expect(legendGlyph('nh:dagger', legend, overrides, 'nh:rogue-symset')).toEqual(
    legend['nh:dagger'],
  );
  expect(legendGlyph('nh:none', legend, overrides, undefined)).toBeUndefined();
});
