// English text for the Watch. ref: src/mon.c angry_guards(), peacefuls_respond();
// src/monmove.c watch_on_duty(), mon_yells(); src/dokick.c watchman_thief_arrest(),
// watchman_door_damage()
export const watchMessagesEn: Record<string, string> = {
  'watch.yells': '{mon|An} yells:',
  'watch.someone_yells': 'You hear someone yell:',
  'watch.stop_damaging_door': '"Hey, stop damaging that door!"',
  'watch.halt_vandal': '"Halt, vandal!  You\'re under arrest!"',
  'watch.halt_thief': '"Halt, thief!  You\'re under arrest!"',
  'watch.stop_picking': '"Hey, stop picking that lock!"',
  'watch.halt_arrest': '"Halt!  You\'re under arrest!"',
  'watch.guard_wakes': 'The guard wakes up.',
  'watch.guards_wake': 'The guards wake up.',
  'watch.guard_angry': 'The guard gets angry!',
  'watch.guards_angry': 'The guards get angry!',
  'watch.guard_approaching': 'An angry guard is approaching!',
  'watch.guards_approaching': 'Angry guards are approaching!',
  'watch.whistle': "You hear the shrill sound of a guard's whistle.",
  'watch.whistles': "You hear the shrill sound of guards' whistles.",
};
