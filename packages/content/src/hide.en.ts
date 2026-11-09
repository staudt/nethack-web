// English text for hiding monsters. ref: src/mon.c hideunder(); src/uhitm.c attack_checks();
// src/mhitu.c hitmu(); src/hack.c spoteffects(); src/detect.c mfind0(); src/dokick.c kick_monster();
// src/mhitm.c mattackm()
export const hideMessagesEn: Record<string, string> = {
  'hide.see_hide': 'You see {mon|the} hide under {item|an}.',
  'hide.wait_hiding_under': "Wait!  There's {mon|an} hiding under {item|an}!",
  'hide.wait_something_hiding_under': "Wait!  There's something hiding under {item|an}!",
  'hide.wait_hidden_monster': "Wait!  There's a hidden monster there!",
  'hide.halluc.tame': 'A tame {mon} appears!',
  'hide.halluc.wild': 'A wild {mon} appears!',
  'hide.halluc.tame_unseen': 'A tame creature is present!',
  'hide.halluc.wild_unseen': 'A wild creature is present!',
  'hide.was_hidden_under': '{mon|An} was hidden under {item|an}!',
  'hide.something_was_hidden_under': 'Something was hidden under {item|an}!',
  'hide.something': 'something',
  'hide.drops_from_ceiling': '{mon|An} suddenly drops from the {ceiling}!',
  'hide.glances_off': 'Its blow glances off your {helm}.',
  'hide.almost_hit_falling': 'You are almost hit by a falling {mon}!',
  'hide.hit_falling': 'You are hit by a falling {mon}!',
  'hide.jumps_near': '{mon|The} jumps near you from the {ceiling}.',
  'hide.you_surprise': 'You surprise {mon|an}!',
  'hide.you_surprise_something': 'You surprise something!',
  'hide.attacks_by_surprise': '{mon|An} attacks you by surprise!',
  'hide.you_find': 'You find {mon|an}.',
  'hide.you_find_pet': 'You find {mon|the}.',
  'hide.there_is_here': 'There is {mon|an} here.',
  'hide.something_hidden_here': 'There is something hidden here.',
  'hide.suddenly_notice': 'Suddenly, you notice {mon|an}.',
};
