import { describe, expect, test, vi } from 'vitest';
import type { MenuEntry } from '@nh/ui';
import type { ClientOptions } from '../src/options';
import { openTitle, type TitleDeps } from '../src/title';

/** Fake sheets: the last one shown, and the answers the name prompt will get. */
function fake(opts: ClientOptions, answers: (string | null)[]) {
  let sheet: { title: string; entries: MenuEntry[]; onClose?: () => void } | null = null;
  const asked: string[] = [];
  const d: TitleDeps = {
    showText: (title, entries, onClose) => {
      sheet = { title, entries, ...(onClose ? { onClose } : {}) };
    },
    askText: (title) => {
      asked.push(title);
      return Promise.resolve(answers.shift() ?? null);
    },
    getOptions: () => opts,
    setOptions: vi.fn((o: ClientOptions) => {
      opts = o;
    }),
    play: vi.fn(),
    scores: vi.fn(),
    help: vi.fn(),
    options: vi.fn(),
  };
  const tap = (label: string): void => {
    const e = sheet?.entries.find((x) => x.label === label);
    if (!e) throw new Error(`no row ${label}`);
    e.run();
  };
  return { d, tap, asked, sheet: () => sheet, opts: () => opts };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

describe('title screen', () => {
  test('lists Play, Wizard mode, High scores, Help and Options; Close shows it again', () => {
    const f = fake({}, []);
    openTitle(f.d);
    const labels = f
      .sheet()
      ?.entries.filter((e) => e.text !== true)
      .map((e) => e.label);
    expect(labels).toEqual(['Play', 'Wizard mode', 'High scores', 'Help', 'Options']);
    const first = f.sheet();
    first?.onClose?.();
    expect(f.sheet()).not.toBe(first);
    expect(f.sheet()?.title).toBe(first?.title);
  });

  test('Play asks "Who are you?" the first time, stores the name, then plays', async () => {
    const f = fake({ runmode: 'crawl' }, ['  ', 'Brunhilde']);
    openTitle(f.d);
    f.tap('Play');
    await settle();
    // a blank answer asks again, as askname() does
    expect(f.asked).toEqual(['Who are you?', 'Who are you?']);
    expect(f.opts()).toEqual({ runmode: 'crawl', name: 'Brunhilde' });
    expect(f.d.play).toHaveBeenCalledWith(false);
  });

  test('Play with a stored name starts at once; Cancel on the name goes back to the title', async () => {
    const named = fake({ name: 'Brunhilde' }, []);
    openTitle(named.d);
    named.tap('Play');
    expect(named.asked).toEqual([]);
    expect(named.d.play).toHaveBeenCalledWith(false);

    const f = fake({}, [null]);
    openTitle(f.d);
    f.tap('Play');
    await settle();
    expect(f.d.play).not.toHaveBeenCalled();
    expect(f.sheet()?.entries.map((e) => e.label)).toContain('Wizard mode');
  });

  test('Wizard mode plays the wizard game; the other rows open their sheet and come back', () => {
    const f = fake({}, []);
    openTitle(f.d);
    f.tap('Wizard mode');
    expect(f.d.play).toHaveBeenCalledWith(true);
    for (const [label, fn] of [
      ['High scores', f.d.scores],
      ['Help', f.d.help],
      ['Options', f.d.options],
    ] as const) {
      f.tap(label);
      const back = vi.mocked(fn).mock.calls[0]?.[0];
      expect(typeof back).toBe('function');
    }
  });
});
