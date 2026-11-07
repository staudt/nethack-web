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
export { boulderCells, boulderMoveErrors, checkInvariants, type InvariantOpts } from './invariants';
export { boulderPushesSince, boulderSnapshot, soak } from './soak';
export type { BoulderSnapshot, SoakOptions, SoakResult, SoakViolation } from './soak';
export { branchStartMod, soakKitMod, specialStartMod } from './kitmod';
