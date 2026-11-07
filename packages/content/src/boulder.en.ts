// English text for boulders: pushing, squeezing, fighting.
// ref: src/hack.c moverock_core(), dopush(), cannot_push(), cannot_push_msg(), test_move(),
// domove_fight_empty()
export const boulderMessagesEn: Record<string, string> = {
  'action.push': 'Push the boulder',
  'boulder.next': 'next {name}',
  'boulder.feels_like': 'That feels like a boulder.',
  'boulder.push': 'With great effort you move {what|the}.',
  'boulder.in_vain': 'You try to move {what|the}, but in vain.',
  'boulder.mon_other_side': "There's {mon|an} on the other side.",
  'boulder.hear_monster': 'You hear a monster behind {what|the}.',
  'boulder.perhaps': "Perhaps that's why you cannot move it.",
  'boulder.squeeze': 'However, you can squeeze yourself into a small opening.',
  'boulder.plugs_hole': '{what|The} falls into and plugs a hole in the {surface}!',
  'boulder.plugs_trapdoor': '{what|The} triggers and plugs a trap door in the {surface}!',
  'boulder.kerplunk': 'Kerplunk!  You no longer feel {what|the}.',
  'surface.floor': 'floor',
  'surface.ground': 'ground',
  'move.carrying_too_much': 'You are carrying too much to get through.',
  'fight.harmless_obj': 'You harmlessly attack {what|an}.',
};
