import { describe, expect, test, vi } from 'vitest';
import { characterChoices, loadMods } from '@nh/core';
import { messagesEn, vanillaMod } from '@nh/content';
import { translate, type MenuEntry } from '@nh/ui';
import {
  NAME_MAX,
  OPTIONS_KEY,
  characterWords,
  cleanName,
  loadOptions,
  openOptions,
  runmodeDelay,
  saveOptions,
  type ClientOptions,
  type OptionsDeps,
} from '../src/options';

const mem = () => {
  const data: Record<string, string> = {};
  return {
    data,
    getItem: (k: string) => data[k] ?? null,
    setItem: (k: string, v: string) => void (data[k] = v),
  };
};
const throwing = {
  getItem: () => {
    throw new Error('denied');
  },
  setItem: () => {
    throw new Error('denied');
  },
};

describe('options storage', () => {
  test('defaults with no storage, nothing stored, a throwing or a broken store', () => {
    expect(loadOptions(null)).toEqual({});
    expect(loadOptions(mem())).toEqual({});
    expect(loadOptions(throwing)).toEqual({});
    const s = mem();
    for (const bad of ['{', 'null', '7', '{"version":2,"name":"X"}', '{"name":"X"}']) {
      s.data[OPTIONS_KEY] = bad;
      expect(loadOptions(s)).toEqual({});
    }
    expect(saveOptions(null, { name: 'X' })).toBe(false);
    expect(saveOptions(throwing, { name: 'X' })).toBe(false);
  });

  test('saved options load back; unknown values fall back field by field', () => {
    const s = mem();
    const o: ClientOptions = { name: 'Brunhilde', runmode: 'crawl', disclose: 'none' };
    expect(saveOptions(s, o)).toBe(true);
    expect(JSON.parse(s.data[OPTIONS_KEY] ?? '')).toEqual({ version: 1, ...o });
    expect(loadOptions(s)).toEqual(o);
    s.data[OPTIONS_KEY] = JSON.stringify({ version: 1, name: 3, runmode: 'fly', disclose: 'all' });
    expect(loadOptions(s)).toEqual({ disclose: 'all' });
  });

  test('the character options load back; bad values are dropped', () => {
    const s = mem();
    const o: ClientOptions = { role: 'nh:role_wizard', race: 'random', gender: 'male', align: -1 };
    expect(saveOptions(s, o)).toBe(true);
    expect(loadOptions(s)).toEqual(o);
    expect(characterWords(o)).toEqual({
      role: 'nh:role_wizard',
      race: 'random',
      gender: 'male',
      align: '-1',
    });
    s.data[OPTIONS_KEY] = JSON.stringify({ version: 1, role: '', race: 7, gender: 'f', align: 2 });
    expect(loadOptions(s)).toEqual({});
    s.data[OPTIONS_KEY] = JSON.stringify({ version: 1, gender: 'random', align: 0 });
    expect(loadOptions(s)).toEqual({ gender: 'random', align: 0 });
  });

  test('names are trimmed, capped at 31 characters, blank is none', () => {
    expect(cleanName('  Brunhilde ')).toBe('Brunhilde');
    expect(cleanName('   ')).toBeUndefined();
    expect(cleanName('x'.repeat(40))).toHaveLength(NAME_MAX);
    const s = mem();
    s.data[OPTIONS_KEY] = JSON.stringify({ version: 1, name: 'y'.repeat(50) });
    expect(loadOptions(s).name).toHaveLength(31);
  });

  test('runmode -> step delay: teleport none, run a seventh, walk as given, crawl five times', () => {
    expect(runmodeDelay('teleport', 60)).toBe(0);
    expect(runmodeDelay('run', 60)).toBe(9);
    expect(runmodeDelay('walk', 60)).toBe(60);
    expect(runmodeDelay('crawl', 60)).toBe(300);
  });
});

describe('options sheet', () => {
  const character = {
    choices: characterChoices(loadMods([vanillaMod])),
    t: (k: string): string => translate({ en: messagesEn }, 'en', k),
  };
  const setup = (
    start: ClientOptions = {},
    answer: string | null = null,
    withCharacter = false,
  ) => {
    let opts = start;
    const sheets: { title: string; entries: MenuEntry[]; onClose?: (() => void) | undefined }[] =
      [];
    const d: OptionsDeps = {
      showText: (title, entries, onClose) => void sheets.push({ title, entries, onClose }),
      askText: vi.fn(() => Promise.resolve(answer)),
      get: () => opts,
      set: vi.fn((o: ClientOptions) => void (opts = o)),
      layout: 'numpad',
      switchLayout: vi.fn(),
      resetZoom: vi.fn(),
      ...(withCharacter ? { character } : {}),
    };
    const last = () => sheets[sheets.length - 1];
    const tap = (label: string) => {
      const e = last()?.entries.find((x) => x.label.startsWith(label));
      if (!e) throw new Error(`no row ${label}`);
      e.run();
    };
    return { d, sheets, last, tap, opts: () => opts };
  };

  test('rows show the current values', () => {
    const m = setup({ name: 'Brunhilde', runmode: 'crawl' });
    openOptions(m.d);
    expect(m.last()?.title).toBe('Options');
    expect(m.last()?.entries.map((e) => e.label)).toEqual([
      'Name: Brunhilde',
      'Run speed: crawl',
      'End of game: ask about each list',
      'Movement keys: number pad (k kicks)',
      'Reset zoom',
    ]);
  });

  test('a run speed is picked, stored and Options comes back with it', () => {
    const m = setup();
    openOptions(m.d);
    m.tap('Run speed');
    expect(m.last()?.title).toBe('Run speed');
    expect(m.last()?.entries.find((e) => e.label.endsWith('✓'))?.label).toMatch(/^walk/);
    m.tap('crawl');
    expect(m.opts()).toEqual({ runmode: 'crawl' });
    expect(m.last()?.title).toBe('Options');
    expect(m.last()?.entries[1]?.label).toBe('Run speed: crawl');
    m.tap('End of game');
    m.tap('show nothing');
    expect(m.opts()).toEqual({ runmode: 'crawl', disclose: 'none' });
  });

  test('the name is asked with the current one; blank clears it, Cancel keeps it', async () => {
    const m = setup({ name: 'Old', disclose: 'all' }, '  Brunhilde  ');
    openOptions(m.d);
    m.tap('Name');
    expect(m.d.askText).toHaveBeenCalledWith('Who are you?', 'Old', 31);
    await Promise.resolve();
    expect(m.opts()).toEqual({ name: 'Brunhilde', disclose: 'all' });
    expect(m.last()?.entries[0]?.label).toBe('Name: Brunhilde');
    const n = setup({ name: 'Old' }, ' ');
    openOptions(n.d);
    n.tap('Name');
    await Promise.resolve();
    expect(n.opts()).toEqual({});
    const c = setup({ name: 'Old' }, null);
    openOptions(c.d);
    c.tap('Name');
    await Promise.resolve();
    expect(c.d.set).not.toHaveBeenCalled();
    expect(c.last()?.title).toBe('Options');
  });

  test('movement keys switch only to the other layout; reset zoom; Close', () => {
    const onClose = vi.fn();
    const m = setup();
    openOptions(m.d, onClose);
    m.tap('Movement keys');
    m.tap('number pad');
    expect(m.d.switchLayout).not.toHaveBeenCalled();
    m.tap('Movement keys');
    m.tap('vi keys');
    expect(m.d.switchLayout).toHaveBeenCalledOnce();
    m.tap('Reset zoom');
    expect(m.d.resetZoom).toHaveBeenCalledOnce();
    m.last()?.onClose?.();
    expect(onClose).toHaveBeenCalledOnce();
  });

  test('role, race, gender and alignment: ask, random or a value', () => {
    const m = setup({ race: 'nh:race_elf', align: 'random' }, null, true);
    openOptions(m.d);
    expect(m.last()?.entries.map((e) => e.label)).toEqual([
      'Name: (not set)',
      'Run speed: walk',
      'End of game: ask about each list',
      'Role: ask',
      'Race: elf',
      'Gender: ask',
      'Alignment: random',
      'Movement keys: number pad (k kicks)',
      'Reset zoom',
    ]);
    m.tap('Role');
    expect(m.last()?.title).toBe('Role');
    const labels = m.last()?.entries.map((e) => e.label) ?? [];
    expect(labels.slice(0, 4)).toEqual(['ask each game  ✓', 'random', 'Archeologist', 'Barbarian']);
    expect(labels).toHaveLength(15);
    m.tap('Wizard');
    expect(m.opts()).toEqual({ role: 'nh:role_wizard', race: 'nh:race_elf', align: 'random' });
    expect(m.last()?.entries[3]?.label).toBe('Role: Wizard');
    m.tap('Gender');
    m.tap('female');
    m.tap('Alignment');
    m.tap('ask each game');
    expect(m.opts()).toEqual({ role: 'nh:role_wizard', race: 'nh:race_elf', gender: 'female' });
  });
});
