// English text for mimics. ref: src/uhitm.c that_is_a_mimic(); src/objects.h STRANGE_OBJECT;
// src/defsym.h S_grave
import { MONSTERS } from './monsters';
import { statueAppearanceId } from './statuestate';

export const mimicMessagesEn: Record<string, string> = {
  'nh:strange_object': 'strange object',
  'nh:grave': 'grave',
  'mimic.a': '{mon|an}',
  'mimic.a_sleeping': 'a sleeping {mon}',
  'mimic.a_monster': 'a monster',
  'mimic.wait_thats': "Wait!  That's {what}!",
  'mimic.furniture_is': 'That {thing} actually is {what}!',
  'mimic.object_is': 'That {obj} is {what}!',
  'mimic.objects_are': 'Those {obj|plural} are {what}!',
  'mimic.wait_that_is_really': 'Wait!  That {shown} is really {what}!',
  // a mimic posing as a statue is drawn as the statue of its monster (C's statue glyphs)
  ...Object.fromEntries(MONSTERS.map((m) => [statueAppearanceId(m.id), 'statue'])),
};
