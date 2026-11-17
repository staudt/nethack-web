export const TESTKIT_VERSION = 1;

export { createScenario, runScenario, DEFAULT_LEGEND } from './scenario';
export type {
  AsciiLegend,
  ItemOpts,
  ItemSpec,
  ScenarioBuilder,
  ScenarioFn,
  ScenarioOptions,
  ScenarioResult,
} from './scenario';
export { runReplay, recordGame } from './replay';
export type { ReplayResult } from './replay';
export {
  ARTIFACT_BASES,
  boulderCells,
  boulderMoveErrors,
  checkInvariants,
  noteWallwalkers,
  wallwalkRecord,
  type InvariantOpts,
  type WallwalkRecord,
} from './invariants';
export { boulderPushesSince, boulderSnapshot, soak } from './soak';
export type { BoulderSnapshot, SoakOptions, SoakResult, SoakViolation } from './soak';
export { branchStartMod, soakKitMod, specialStartMod } from './kitmod';
