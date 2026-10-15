import { AsyncLocalStorage } from 'node:async_hooks';
import type { RequestChronicleHelper } from './RequestChronicle';

// Development can load both source and compiled copies of core. They must share
// the same context, just as the helper on req.options shares its symbol brand.
const contextKey = Symbol.for('@researchdatabox/redbox-core/requestChronicleContext');
const state = globalThis as typeof globalThis & {
  [contextKey]?: AsyncLocalStorage<RequestChronicleHelper | undefined>;
};
const context = (state[contextKey] ??= new AsyncLocalStorage<RequestChronicleHelper | undefined>());

/** The HTTP request that owns the current async work, including work after its response. */
export function currentRequestChronicle(): RequestChronicleHelper | undefined {
  return context.getStore();
}

/** Run downstream middleware in an isolated context without changing the caller's context. */
export function runWithRequestChronicle<T>(helper: RequestChronicleHelper | undefined, work: () => T): T {
  return context.run(helper, work);
}
