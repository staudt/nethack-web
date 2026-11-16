// m22 step 9: choosing a character. ref: src/role.c genl_player_setup()
import {
  characterChoices,
  createEngine,
  createHost,
  loadMods,
  okCharacter,
  welcomeParams,
  type Character,
  type DefId,
  type FromCore,
  type GameEvent,
} from '@nh/core';
import { messagesEn, vanillaMod, wizardMod } from '@nh/content';
import { translate, type MenuEntry } from '@nh/ui';
import { describe, expect, test } from 'vitest';
import {
  chooseCharacter,
  pickPrompt,
  prefsFromWords,
  rigidRoleChecks,
  selectionLine,
  type CharacterPrefs,
} from '../src/character';

const registry = loadMods([vanillaMod]);
const cs = characterChoices(registry);
const t = (key: string): string => translate({ en: messagesEn }, 'en', key);
const id = (k: string): DefId => `nh:role_${k}`;
const race = (k: string): DefId => `nh:race_${k}`;

/** A seeded stand-in for the app's random numbers. */
function lcg(seed: number): (n: number) => number {
  let x = seed >>> 0 || 1;
  return (n) => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x % n;
  };
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Runs the flow with fake sheets; `sheet()` is the one on screen, `tap(key)` picks a row. */
function run(prefs: CharacterPrefs = {}, rn2 = lcg(1), name?: string) {
  let sheet: { title: string; entries: MenuEntry[]; onClose?: () => void } | null = null;
  const titles: string[] = [];
  let result: Character | null | undefined;
  const done = chooseCharacter(
    {
      showText: (title, entries, onClose) => {
        titles.push(title);
        sheet = { title, entries, ...(onClose ? { onClose } : {}) };
      },
      t,
      rn2,
      name,
    },
    cs,
    prefs,
  ).then((c) => {
    result = c;
  });
  const current = (): { title: string; entries: MenuEntry[]; onClose?: () => void } => {
    if (!sheet) throw new Error('no sheet');
    return sheet;
  };
  return {
    done,
    titles,
    sheet: current,
    result: () => result,
    labels: () => current().entries.map((e) => e.label),
    tap: async (key: string): Promise<void> => {
      const e = current().entries.find((x) => x.key === key);
      if (!e) throw new Error(`no row ${key} in ${current().title}`);
      e.run();
      await settle();
    },
    close: async (): Promise<void> => {
      current().onClose?.();
      await settle();
    },
  };
}

describe('Shall I pick ... for you?', () => {
  test('the prompt names what is left to pick, as build_plselection_prompt()', () => {
    const p = (prefs: CharacterPrefs): string =>
      pickPrompt(cs, t, rigidRoleChecks(cs, prefs, lcg(1)));
    expect(p({})).toBe("Shall I pick character's race, role, gender and alignment for you? [ynaq]");
    // a Valkyrie is female: race and alignment are left
    expect(p({ role: id('valkyrie') })).toBe(
      "Shall I pick your Valkyrie's race and alignment for you? [ynaq]",
    );
    // an orc is chaotic
    expect(p({ race: race('orc') })).toBe(
      "Shall I pick your orc's role and gender for you? [ynaq]",
    );
    // an elven Wizard is chaotic: only the gender
    expect(p({ role: id('wizard'), race: race('elf') })).toBe(
      "Shall I pick your chaotic elven Wizard's gender for you? [ynaq]",
    );
    expect(p({ role: id('priest'), race: race('human') })).toBe(
      "Shall I pick your human Priest/Priestess's gender and alignment for you? [ynaq]",
    );
  });

  test('q or Close quits; y and a pick everything at random, only y asks "Is this ok?"', async () => {
    const q = run();
    await q.tap('q');
    await q.done;
    expect(q.result()).toBeNull();
    const esc = run();
    await esc.close();
    await esc.done;
    expect(esc.result()).toBeNull();

    for (let seed = 1; seed <= 300; seed++) {
      const a = run({}, lcg(seed));
      await a.tap('a');
      await a.done;
      const c = a.result();
      if (!c) throw new Error('no character');
      expect(okCharacter(cs, c)).toBe(true);
      expect(a.titles).toHaveLength(1);
    }
    const y = run({}, lcg(9), 'Brunhilde');
    await y.tap('y');
    expect(y.sheet().title).toBe('Is this ok? [ynq]');
    expect(y.labels()[0]).toMatch(/^Brunhilde the (lawful|neutral|chaotic) (male|female) \w+ \w+$/);
    expect(y.labels().slice(2)).toEqual([
      'y - Yes; start game',
      'n - No; choose role again',
      'q - Quit',
    ]);
    await y.tap('y');
    await y.done;
    expect(okCharacter(cs, y.result() as Character)).toBe(true);
  });

  test('random picks reach every role and every race', async () => {
    const roles = new Set<string>();
    const races = new Set<string>();
    for (let seed = 1; seed <= 400; seed++) {
      const a = run({}, lcg(seed));
      await a.tap('a');
      await a.done;
      roles.add(a.result()?.role ?? '');
      races.add(a.result()?.race ?? '');
    }
    expect(roles.size).toBe(13);
    expect(races.size).toBe(5);
  });
});

describe('the menus', () => {
  test('the role menu: C order, letters, names with their female forms, Random and the extras', async () => {
    const f = run();
    await f.tap('n');
    expect(f.sheet().title).toBe('Pick a role or profession');
    expect(f.labels()).toEqual([
      '<role> <race> <gender> <alignment>',
      'a - an Archeologist',
      'b - a Barbarian',
      'c - a Caveman/Cavewoman',
      'h - a Healer',
      'k - a Knight',
      'm - a Monk',
      'p - a Priest/Priestess',
      'r - a Rogue',
      'R - a Ranger',
      's - a Samurai',
      't - a Tourist',
      'v - a Valkyrie',
      'w - a Wizard',
      '* - Random',
      ' ',
      '/ - Pick race first',
      '" - Pick gender first',
      '[ - Pick alignment first',
      'q - Quit',
    ]);
  });

  test('a dwarvish Valkyrie: the race menu, the forced gender and alignment, "Is this ok?"', async () => {
    const f = run({}, lcg(1), 'Brunhilde');
    await f.tap('n');
    await f.tap('v');
    expect(f.sheet().title).toBe('Pick a race or species');
    expect(f.labels()).toEqual([
      'Valkyrie <race> female <alignment>',
      'h - human',
      'd - dwarf',
      '* - Random',
      ' ',
      '? - Pick another role first',
      '    role forces female',
      '[ - Pick alignment first',
      'q - Quit',
    ]);
    // a dwarf is lawful: no alignment menu
    await f.tap('d');
    expect(f.sheet().title).toBe('Is this ok? [ynq]');
    expect(f.labels()[0]).toBe('Brunhilde the lawful female dwarven Valkyrie');
    await f.tap('y');
    await f.done;
    expect(f.result()).toEqual({
      role: id('valkyrie'),
      race: race('dwarf'),
      gender: 'female',
      align: 1,
    });
  });

  test('a Samurai: no race menu; the gender menu says what the role forces', async () => {
    const f = run();
    await f.tap('n');
    await f.tap('s');
    expect(f.sheet().title).toBe('Pick a gender or sex');
    expect(f.labels()).toEqual([
      'Samurai human <gender> lawful',
      'm - male',
      'f - female',
      '* - Random',
      ' ',
      '? - Pick another role first',
      '    role forces human',
      '    role forces lawful',
      'q - Quit',
    ]);
    await f.tap('f');
    expect(f.sheet().title).toBe('Is this ok? [ynq]');
    // no name: the selection line
    expect(f.labels()[0]).toBe('Samurai human female lawful');
  });

  test('race first: an orc leaves the roles that allow one, with C letters', async () => {
    const f = run();
    await f.tap('n');
    await f.tap('/');
    expect(f.sheet().title).toBe('Pick a race or species');
    expect(f.labels().filter((l) => / - [a-z]+$/.test(l))).toEqual([
      'h - human',
      'e - elf',
      'd - dwarf',
      'g - gnome',
      'o - orc',
    ]);
    await f.tap('o');
    expect(f.sheet().title).toBe('Pick a role or profession');
    expect(f.labels().slice(0, 5)).toEqual([
      '<role> orc <gender> <alignment>',
      'b - a Barbarian',
      'r - a Rogue',
      'R - a Ranger',
      'w - a Wizard',
    ]);
    await f.tap('R');
    expect(f.sheet().title).toBe('Pick a gender or sex');
    expect(f.labels()).toContain('    race forces chaotic');
    await f.tap('*');
    expect(f.sheet().title).toBe('Is this ok? [ynq]');
    // n: the menus again from nothing
    await f.tap('n');
    expect(f.sheet().title).toBe('Pick a role or profession');
    expect(f.labels()[0]).toBe('<role> <race> <gender> <alignment>');
    await f.tap('q');
    await f.done;
    expect(f.result()).toBeNull();
  });

  test('a female Priestess: the menus use the female name once the gender is known', async () => {
    const f = run();
    await f.tap('n');
    await f.tap('"');
    await f.tap('f');
    expect(f.sheet().title).toBe('Pick a role or profession');
    expect(f.labels()).toContain('c - a Cavewoman');
    expect(f.labels()).toContain('p - a Priestess');
    // a female Valkyrie is still on the list; no male-only role exists
    expect(f.labels()).toContain('v - a Valkyrie');
  });

  test('every manual pick is an allowed combination', async () => {
    // walk the menus taking the first row each time, then the last
    for (const which of ['first', 'last'] as const) {
      for (const roleKey of ['a', 'b', 'c', 'h', 'k', 'm', 'p', 'r', 'R', 's', 't', 'v', 'w']) {
        const f = run();
        await f.tap('n');
        await f.tap(roleKey);
        while (f.sheet().title !== 'Is this ok? [ynq]') {
          const rows = f.sheet().entries.filter((e) => e.key && /^[a-z] - [a-z]+$/.test(e.label));
          const row = which === 'first' ? rows[0] : rows[rows.length - 1];
          if (!row?.key) throw new Error(`no value row in ${f.sheet().title}`);
          await f.tap(row.key);
        }
        await f.tap('y');
        await f.done;
        expect(okCharacter(cs, f.result() as Character)).toBe(true);
      }
    }
  });
});

describe('options and URL words', () => {
  test("words as C's str2role(), str2race(), str2gend(), str2align()", () => {
    expect(prefsFromWords(cs, t, { role: 'val', race: 'dwa', gender: 'f', align: 'l' })).toEqual({
      role: id('valkyrie'),
      race: race('dwarf'),
      gender: 'female',
      align: 1,
    });
    const role = (w: string): unknown => prefsFromWords(cs, t, { role: w }).role;
    expect(role('r')).toBe(id('rogue'));
    expect(role('Ran')).toBe(id('ranger'));
    expect(role('cavewoman')).toBe(id('caveman'));
    expect(role('PRIESTESS')).toBe(id('priest'));
    expect(role('nh:role_wizard')).toBe(id('wizard'));
    expect(role('random')).toBe('random');
    expect(role('*')).toBe('random');
    expect(role('xyz')).toBeUndefined();
    expect(prefsFromWords(cs, t, { race: 'elven', align: 'cha', gender: 'male' })).toEqual({
      race: race('elf'),
      align: -1,
      gender: 'male',
    });
    expect(prefsFromWords(cs, t, { align: '0', gender: 'x' })).toEqual({ align: 0 });
  });

  test('all four fixed: no sheet at all; an impossible fixed facet is asked again', async () => {
    const f = run({ role: id('valkyrie'), race: race('dwarf'), gender: 'female', align: 1 });
    await f.done;
    expect(f.titles).toEqual([]);
    expect(f.result()).toEqual({
      role: id('valkyrie'),
      race: race('dwarf'),
      gender: 'female',
      align: 1,
    });
    // a male Valkyrie cannot be: the only gender left is taken
    const m = run({ role: id('valkyrie'), race: race('human'), gender: 'male', align: 0 });
    await m.done;
    expect(m.result()).toMatchObject({ gender: 'female' });
  });

  test('fixed facets skip their menus; "random" ones are picked within the others', async () => {
    const f = run({ role: id('wizard'), race: race('elf') });
    expect(f.sheet().title).toBe("Shall I pick your chaotic elven Wizard's gender for you? [ynaq]");
    await f.tap('n');
    expect(f.sheet().title).toBe('Pick a gender or sex');
    await f.tap('m');
    await f.tap('y');
    await f.done;
    expect(f.result()).toEqual({
      role: id('wizard'),
      race: race('elf'),
      gender: 'male',
      align: -1,
    });

    for (let seed = 1; seed <= 40; seed++) {
      const r = run(
        { role: 'random', race: race('orc'), gender: 'random', align: 'random' },
        lcg(seed),
      );
      await r.done;
      const c = r.result() as Character;
      expect([id('barbarian'), id('rogue'), id('ranger'), id('wizard')]).toContain(c.role);
      expect(c).toMatchObject({ race: race('orc'), align: -1 });
    }
  });

  test('the selection line', () => {
    expect(selectionLine(cs, t, {})).toBe('<role> <race> <gender> <alignment>');
    const c = { role: id('caveman'), race: race('gnome'), gender: 'female', align: 0 } as const;
    expect(selectionLine(cs, t, c)).toBe('Cavewoman gnome female neutral');
    expect(selectionLine(cs, t, c, 'Ayla')).toBe('Ayla the neutral female gnomish Cavewoman');
  });
});

describe('the welcome', () => {
  const text = (e: GameEvent | undefined): string =>
    e?.type === 'msg' ? translate({ en: messagesEn }, 'en', e.key, e.params) : '';
  const engine = createEngine([vanillaMod]);
  const first = (c: Partial<Character>): string =>
    text(engine.newGame({ seed: 1, character: c }).events[0]);

  test('a new game: alignment, gender only when the role has both and no female name, race, role', () => {
    expect(first({})).toBe('Hello, welcome to NetHack! You are a neutral human Valkyrie.');
    expect(first({ role: id('archeologist'), gender: 'female', align: 1 })).toBe(
      'Hello, welcome to NetHack! You are a lawful female human Archeologist.',
    );
    expect(first({ role: id('wizard'), race: race('elf'), gender: 'male' })).toBe(
      'Hello, welcome to NetHack! You are a chaotic male elven Wizard.',
    );
    expect(first({ role: id('priest'), race: race('elf'), gender: 'female' })).toBe(
      'Hello, welcome to NetHack! You are a chaotic elven Priestess.',
    );
  });

  test('a restored game', () => {
    const c = { role: id('wizard'), race: race('elf'), gender: 'male', align: -1 } as const;
    expect(
      text({ type: 'msg', key: 'welcome.back', params: welcomeParams(registry, c, false) }),
    ).toBe('Hello, welcome back to NetHack! You are an elven Wizard.');
  });

  test('the worker game with the wizard mod starts with the chosen character', () => {
    const out: FromCore[] = [];
    const host = createHost([vanillaMod, wizardMod], (m) => out.push(m));
    host.handle({
      t: 'new',
      seed: 2,
      width: 80,
      height: 21,
      character: { role: id('samurai'), race: race('human'), gender: 'female', align: 1 },
    });
    const v = out[0];
    expect(v?.t === 'view' && text(v.events[0])).toBe(
      'Hello, welcome to NetHack! You are a lawful female human Samurai.',
    );
  });
});
