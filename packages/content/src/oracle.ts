// The Oracle level: the centre room with the Delphi subroom (four fountains around the peaceful
// Oracle), five random rooms and random corridors. A leaf module (core types only).
// ref: dat/oracle.lua
//
// Not ported (DEVIATIONS "The Oracle"): the eight centaur statues of the centre room (no
// statues), `noflip` (no level flipping), consultations (#chat).
import type { DefId, LevelContent, LevelDef } from '@nh/core';

/** The Delphi room type. ref: include/mkroom.h DELPHI */
export const DELPHI: DefId = 'nh:delphi';
/** The Oracle monster. ref: include/monsters.h PM_ORACLE */
export const ORACLE: DefId = 'nh:oracle';

const OBJ: LevelContent = { kind: 'object' };
const MON: LevelContent = { kind: 'monster' };
const TRAP: LevelContent = { kind: 'trap' };

/**
 * oracle.lua. As in the Minetown `des.room` levels the map starts as dark stone (makemaz() leaves
 * the level so before the lua runs). `des.door({ state="nodoor", wall="all" })` is one doorway on
 * any wall (W_ANY, as "random"). ref: dat/oracle.lua; src/sp_lev.c lspo_door(), create_door()
 */
export const ORACLE_LEVEL: LevelDef = {
  id: 'nh:oracle_level', // 'nh:oracle' is the monster (one id namespace)
  init: { style: 'solidfill', fg: 'nh:stone', lit: false },
  rooms: [
    {
      lit: true,
      x: 3,
      y: 3,
      xalign: 'center',
      yalign: 'center',
      w: 11,
      h: 9,
      rooms: [
        {
          type: DELPHI,
          lit: true,
          x: 4,
          y: 3,
          w: 3,
          h: 3,
          features: [
            { kind: 'fountain', x: 0, y: 1 },
            { kind: 'fountain', x: 1, y: 0 },
            { kind: 'fountain', x: 1, y: 2 },
            { kind: 'fountain', x: 2, y: 1 },
          ],
          contents: [{ kind: 'monster', id: ORACLE, x: 1, y: 1 }],
          doors: [{ state: 'nodoor' }],
        },
      ],
      contents: [MON, MON],
    },
    { stairs: ['up'], contents: [OBJ] },
    { stairs: ['down'], contents: [OBJ, TRAP, MON, MON] },
    { contents: [OBJ, OBJ, MON] },
    { contents: [OBJ, TRAP, MON] },
    { contents: [OBJ, TRAP, MON] },
  ],
  corridors: 'random',
};
