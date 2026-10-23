import type { PersistenceOwner } from '../../persistence/owner';
import { registerPersistenceResource } from '../../persistence/runtime';

const key = Symbol.for('@researchdatabox/redbox-core/legacy-configuration-work/v1');
interface ConfigurationWork {
  readonly writes: Promise<void>[];
  accepting: boolean;
}

/** Comparison-only writes join the same owner's cleanup, even if a caller ignores the return value. */
export function trackLegacyConfigurationWork(owner: PersistenceOwner, operation: () => Promise<void>): Promise<void> {
  let state = Reflect.get(owner, key) as ConfigurationWork | undefined;
  if (!state) {
    state = { writes: [], accepting: true };
    const writes = state.writes;
    registerPersistenceResource(owner, 'legacy-configuration', {
      drain: async () => {
        state!.accepting = false;
        await Promise.allSettled(writes);
      },
      close: async () => {},
    });
    Object.defineProperty(owner, key, { value: state });
  }
  if (!state.accepting) throw new Error('Legacy configuration work is draining.');
  const work = Promise.resolve().then(operation);
  state.writes.push(work);
  // Startup awaits failures explicitly; ownership draining must still await every sibling.
  void work.catch(() => {});
  return work;
}

export async function awaitLegacyConfigurationWork(owner: PersistenceOwner): Promise<void> {
  const state = Reflect.get(owner, key) as ConfigurationWork | undefined;
  if (!state) return;
  let observed = 0;
  while (observed < state.writes.length) {
    const batch = state.writes.slice(observed);
    observed += batch.length;
    const results = await Promise.allSettled(batch);
    if (results.some(result => result.status === 'rejected'))
      throw new Error(
        'Legacy branded configuration writes failed. Review the named override diagnostics before activation.'
      );
  }
}
