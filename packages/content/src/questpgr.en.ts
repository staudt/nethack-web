// English for the quest pager's params and quest.c's own one-off lines (the generated texts are
// quest.en.ts). ref: src/questpgr.c convert_arg(), ldrname(), neminame(), qtext_pronoun();
// src/quest.c; src/do.c goto_level(); src/zap.c zap_updown(); src/dothrow.c thitmonst(); src/mon.c
// xkilled()
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
  // finish_quest(): an Amulet or an invocation item thrown at the leader
  'quest.mere_imitation': '"Sorry to say, this is a mere imitation of the true Amulet of Yendor."',
  'quest.found_it': '"Ah, I see you\'ve found {obj}."',
  // thitmonst(): her artifact or a relic thrown at her leader
  'quest.catches': '{mon|The} catches {obj}.',
  'quest.part_finished': '"{obj|S} part in this is finished."',
  'quest.guard_it': '"We will guard it in case it is ever needed again, {god} forbid."',
  'quest.hands_back': '{mon|The} hands {obj} back to you.',
  'quest.tosses_back': '{mon|The} tosses {obj} back to you.',
  // xkilled(): her leader or a guardian killed
  'quest.bad_idea': 'That was a bad idea...',
  'quest.probably_bad_idea': 'That was probably a bad idea...',
  'quest.whoopsie': 'Whoopsie-daisy!',
  // is_pure()'s wizard-mode lines
  'quest.wiz.instead': 'You are currently {cur} instead of {orig}.',
  'quest.wiz.converted': 'You have converted.',
  'quest.wiz.record': 'You are currently {cur} and require {req}.',
  'quest.wiz.adjust': 'adjust?',
};
