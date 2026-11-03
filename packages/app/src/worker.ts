/// <reference lib="webworker" />
import type { FromCore } from '@nh/core';
import { vanillaMod, wizardMod } from '@nh/content';
import { VANILLA, WIZARD } from './mods';
import { createModHost } from './modhost';
import type { ToWorker } from './remote';

const ctx = self as unknown as DedicatedWorkerGlobalScope;
const host = createModHost(
  { [VANILLA]: vanillaMod, [WIZARD]: wizardMod },
  [VANILLA],
  (m: FromCore) => ctx.postMessage(m),
);
ctx.onmessage = (e: MessageEvent<ToWorker>) => host.handle(e.data);
