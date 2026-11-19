// English for the quest pager's params and quest.c's own one-off lines (the generated texts are
// quest.en.ts). ref: src/questpgr.c convert_arg(), ldrname(), neminame(), qtext_pronoun();
// src/quest.c; src/do.c goto_level(); src/zap.c zap_updown()
export const questPgrMessagesEn: Record<string, string> = {
  // a quest text window has no title (deliver_by_window())
  'quest.title': '',
  // ldrname(), neminame(): "the " unless a personal name
  'quest.the': 'the {name}',
  'quest.sister': 'sister',
  'quest.brother': 'brother',
  'quest.daughter': 'daughter',
  'quest.son': 'son',
  // %x: `Blind ? "sense" : "see"`
  'quest.sense': 'sense',
  'quest.see': 'see',
  // a plural artifact name's pronouns (the Eyes of the Overworld)
  'pronoun.they': 'they',
  'pronoun.their': 'their',
  // quest.c's and goto_level()'s own lines
  'quest.descend_blocked': 'A mysterious force prevents you from descending.',
  'quest.stairs_ripple': 'The stairs seem to ripple momentarily.',
  'quest.prisoner_speaks': '{mon|The} speaks:',
  'quest.finally_free': '"I\'m finally free!"',
  // is_pure()'s wizard-mode lines
  'quest.wiz.instead': 'You are currently {cur} instead of {orig}.',
  'quest.wiz.converted': 'You have converted.',
  'quest.wiz.record': 'You are currently {cur} and require {req}.',
  'quest.wiz.adjust': 'adjust?',
};
