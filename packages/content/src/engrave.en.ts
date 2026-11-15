// English text for engravings and looking here. ref: src/engrave.c read_engr_at();
// src/invent.c look_here(), dolook()
export const engraveMessagesEn: Record<string, string> = {
  'action.nh:look': 'Look here',

  // read_engr_at(): what is there, then the text (a quoted data string with its end punctuation)
  'engr.here_dust': 'Something is written here in the dust.',
  'engr.here_frost': 'Something is written here in the frost.',
  'engr.here_engraved': 'Something is engraved here on the {surface}.',
  'engr.here_burned': 'Some text has been burned into the {surface} here.',
  'engr.here_melted': 'Some text has been melted into the {surface} here.',
  'engr.here_graffiti': "There's some graffiti on the {surface} here.",
  'engr.here_blood': 'You see a message scrawled in blood here.',
  'engr.you_read': 'You read: {text}',
  'engr.you_feel': 'You feel the words: {text}',

  // look_here()
  'look.trap': 'There is {trap|an} here.',
  'look.none': 'You see no objects here.',
  'look.none_feel': 'You feel no objects here.',
  'look.one_feel': 'You feel here {item|an}.',
  'look.things': 'Things that are here:',
  'look.things_feel': 'Things that you feel here:',
  'look.feel_here': 'You try to feel what is here.',
  'look.feel_on': 'You try to feel what is lying here on the {surface}.',
  'look.feel_beneath': 'You try to feel what is lying beneath you.',
  'look.ice_here': 'There is ice here.',
  'look.feel_on_ice': 'You try to feel what is on it.',
  'look.cant_reach_it': "But you can't reach it!",
  'look.stomach': 'You look around to see what is lying in {mon|the_s} stomach.',
  'look.stomach_feel': 'You try to feel what is lying in {mon|the_s} stomach.',
};
