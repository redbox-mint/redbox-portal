import type { PersistenceOwner } from './owner';
import { PersistenceError } from './errors';
import {
  initializePersistence,
  persistenceReady,
  persistenceOperation,
  registerPersistenceResource,
  cleanupPersistenceAfterFailure,
} from './runtime';

interface GroupState {
  repository?: object;
  starting?: Promise<void>;
}
const key: unique symbol = Symbol.for('@researchdatabox/redbox-core/persistence-groups/v1');
type Application = PersistenceOwner & { [key]?: Map<string, GroupState> };
function stateFor(app: PersistenceOwner, name: string): GroupState {
  const owner = app as Application;
  if (!owner[key]) Object.defineProperty(owner, key, { value: new Map() });
  if (!owner[key]!.has(name)) owner[key]!.set(name, {});
  return owner[key]!.get(name)!;
}

/** Wrap external methods only. Internal calls retain their concrete owner and admission. */
function guarded<T extends object>(
  owner: T,
  run: (method: () => Promise<unknown>, name: string) => Promise<unknown>
): T {
  const result = Object.create(owner) as T;
  const names = new Set(Object.keys(owner));
  for (
    let prototype = Object.getPrototypeOf(owner);
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  )
    Object.getOwnPropertyNames(prototype)
      .filter(name => name !== 'constructor')
      .forEach(name => names.add(name));
  for (const name of names) {
    const value: unknown = Reflect.get(owner, name);
    if (typeof value === 'function')
      Object.defineProperty(result, name, {
        enumerable: true, configurable: true, writable: true,
        value: (...args: unknown[]) => run(() => Reflect.apply(value, owner, args), name),
      });
    else if (value && typeof value === 'object' && Object.getPrototypeOf(owner) === Object.prototype)
      Object.defineProperty(result, name, { enumerable: true, configurable: true, writable: true, value: guarded(value, run) });
  }
  return result;
}

/** One registry, readiness check and drain boundary for every repository group. Factories stay lazy. */
export function definePersistenceGroup<T extends object>(
  name: string,
  create: (app: PersistenceOwner) => Promise<T>,
  failure?: (error: unknown, method: string) => never
): { initialize(app: PersistenceOwner): Promise<void>; get(app?: PersistenceOwner): T } {
  return {
    async initialize(app) {
      const state = stateFor(app, name);
      if (state.starting) return state.starting;
      if (state.repository && persistenceReady(app)) return;
      state.starting = (async () => {
        await initializePersistence(app);
        registerPersistenceResource(app, 'group:' + name, {
          async drain() {
            await state.starting?.catch(() => {});
          },
          async close() {
            state.repository = undefined;
          },
        });
        const concrete = await create(app);
        const repository = guarded(concrete, (operation, method) => {
          if (state.repository !== repository)
            return Promise.reject(
              new PersistenceError(
                'lifecycle',
                `This ${name} repository is no longer active. Resolve the active ${name} repository after initialization.`
              )
            );
          const pending = persistenceOperation(app, operation);
          return failure ? pending.catch(error => failure(error, method)) : pending;
        });
        state.repository = repository;
      })();
      try {
        await state.starting;
      } catch (error) {
        await cleanupPersistenceAfterFailure(app);
        throw error;
      } finally {
        state.starting = undefined;
      }
    },
    get(app) {
      const application = app ?? (typeof sails === 'undefined' ? undefined : sails);
      const state = application && stateFor(application, name);
      if (!application || !state?.repository || state.starting || !persistenceReady(application))
        throw new PersistenceError(
          'not-initialized',
          `${name} persistence has not been initialized. Await persistence initialization before accessing repositories.`
        );
      return state.repository as T;
    },
  };
}
