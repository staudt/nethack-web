// English for the quest pager's params (the generated texts are quest.en.ts).
// ref: src/questpgr.c convert_arg(), ldrname(), neminame(), qtext_pronoun()
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
};
