// The title screen: what the app shows when there is no game to resume (a new device, after a
// finished game, after New game). Play asks "Who are you?" the first time; the name is a device
// option, never game state. ref: src/allmain.c newgame(); src/role.c the name prompt (askname)
import type { MenuEntry } from '@nh/ui';
import { NAME_MAX, cleanName, type ClientOptions } from './options';

export interface TitleDeps {
  showText(title: string, entries: MenuEntry[], onClose?: () => void): void;
  askText(title: string, initial: string, maxLength: number): Promise<string | null>;
  getOptions(): ClientOptions;
  /** Stores the options and applies them. */
  setOptions(o: ClientOptions): void;
  /** Starts a new game; `wizard` loads the wizard mod (the runtime twin of `?wizard=1`). */
  play(wizard: boolean): void;
  /** These open their sheet; closing it runs `back` (the title again). */
  scores(back: () => void): void;
  help(back: () => void): void;
  options(back: () => void): void;
}

/**
 * Asks "Who are you?" when the device has no name, stores the answer, then runs `go`. A blank
 * answer asks again (askname() loops until it gets a name); Cancel runs `back`.
 */
export function askName(d: TitleDeps, go: () => void, back: () => void): void {
  if (d.getOptions().name !== undefined) {
    go();
    return;
  }
  void d.askText('Who are you?', '', NAME_MAX).then((text) => {
    if (text === null) {
      back();
      return;
    }
    const name = cleanName(text);
    if (name === undefined) {
      askName(d, go, back);
      return;
    }
    d.setOptions({ ...d.getOptions(), name });
    go();
  });
}

/** The title sheet. There is no game behind it, so closing it shows it again. */
export function openTitle(d: TitleDeps): void {
  const again = (): void => openTitle(d);
  d.showText(
    'webhack',
    [
      { label: 'A TypeScript port of NetHack.', run: () => {}, text: true },
      { label: 'Play', run: () => askName(d, () => d.play(false), again) },
      { label: 'Wizard mode', run: () => d.play(true) },
      { label: 'High scores', run: () => d.scores(again) },
      { label: 'Help', run: () => d.help(again) },
      { label: 'Options', run: () => d.options(again) },
    ],
    again,
  );
}
