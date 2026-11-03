// English messages for wizard mode (ref: src/wizcmds.c, src/dungeon.c print_dungeon())
export const wizardMessagesEn: Record<string, string> = {
  'action.wiz:map': 'Wizard: map the level',
  'action.wiz:where': 'Wizard: dungeon overview',
  'action.wiz:levelport': 'Wizard: level teleport',
  'wiz.levelport.pickDungeon': 'Teleport to which dungeon?',
  'wiz.levelport.pickLevel': 'To what level of {dungeon} do you want to teleport?',
  'wiz.levelport.level': 'Level {dlevel} (Dlvl {depth})',
  'wiz.levelport.here': 'Level {dlevel} (Dlvl {depth}) <- you are here',
  'wiz.levelport.arrive': 'You materialize on a different level!',
  'wiz.where.levels': '{dungeon}: levels {start} to {end}',
  'wiz.where.level': '{dungeon}: level {start}',
  'wiz.where.open': '{dungeon}: levels {start} and below',
  'wiz.where.branch': '   Stairs down to {dungeon}: {depth}',
};
