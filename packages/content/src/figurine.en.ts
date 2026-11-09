// English text for figurines. ref: src/objnam.c xname() FIGURINE; src/apply.c use_figurine(),
// figurine_location_checks(), fig_transform(); src/dog.c make_familiar(); src/zap.c
// stone_to_flesh_obj()
export const figurineMessagesEn: Record<string, string> = {
  'nh:figurine.of': 'figurine of {mon|an}',
  'nh:figurine.of.plural': 'figurines of {mon|an}',

  // applying one
  'figurine.direction': 'In what direction?',
  'figurine.no_room': "You don't have enough room in here.",
  'figurine.cannot_put': 'You cannot put the figurine there.',
  'figurine.in_tree': 'You cannot place a figurine in a tree!',
  'figurine.in_rock': 'You cannot place a figurine in solid rock!',
  'figurine.on_boulder': 'You cannot fit the figurine on the boulder.',
  'figurine.transforms': 'You {how} and it {supposedly}transforms.',
  'figurine.how.beside': 'set the figurine beside you',
  'figurine.how.toss': 'toss the figurine into the air',
  'figurine.how.ground': 'set the figurine on the ground',
  'figurine.supposedly': 'supposedly ',
  'figurine.shatters': 'The figurine writhes and then shatters into pieces!',
  'figurine.bad_feeling': 'You get a bad feeling about this.',

  // transforming on its own
  'figurine.who': '{mon|an}',
  'figurine.pack_feel': 'You feel something {verb} from your pack!',
  'figurine.pack_see': 'You see {who} {verb} out of your pack{vanish}!',
  'figurine.suddenly_vanishes': '{fig|An} suddenly vanishes!',
  'figurine.floor_see': 'You see a figurine transform into {who}{vanish}!',
  'figurine.minvent_see': 'You see {who} {verb} out of {from}{vanish}!',
  'figurine.from_pack': "{mon|an}'s pack",
  'figurine.thin_air': 'thin air',
  'figurine.and_hide': ' and {verb} under {obj}',
  'figurine.and_vanish': ' and vanish',

  // stone to flesh
  'figurine.animates': 'The figurine animates!',
  'figurine.flesh_animates': 'The figurine turns to flesh and animates!',
};
