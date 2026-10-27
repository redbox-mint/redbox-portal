import { PersistenceError } from '../../persistence/errors';
interface Workers {
  draining: boolean;
  active: Set<Promise<unknown>>;
  registered?: boolean;
}
const key: unique symbol = Symbol.for('@researchdatabox/redbox-core/figshare-workers/v1');
type Owner = Sails.Application & { [key]?: Workers };
function stateFor(app: Sails.Application): Workers {
  const owner = app as Owner;
  if (!owner[key]) Object.defineProperty(owner, key, { value: { draining: false, active: new Set() } });
  return owner[key]!;
}
/** Track complete accepted jobs across storage, remote HTTP and final checkpoints. */
export function figshareWork<T>(app: Sails.Application, run: () => Promise<T>): Promise<T> {
  const state = stateFor(app);
  if (state.draining) return Promise.reject(new PersistenceError('lifecycle', 'Figshare workers are draining.'));
  const pending = Promise.resolve().then(run);
  state.active.add(pending);
  void pending.then(
    () => state.active.delete(pending),
    () => state.active.delete(pending)
  );
  return pending;
}
export async function drainFigshareWorkers(app: Sails.Application): Promise<void> {
  const state = stateFor(app);
  state.draining = true;
  await Promise.allSettled(state.active);
}
export function initializeFigshareWorkers(app: Sails.Application): void {
  const state = stateFor(app);
  if (state.registered) return;
  state.registered = true;
  const previous = app.config.beforeShutdown;
  app.config.beforeShutdown = callback => {
    void drainFigshareWorkers(app).then(() => {
      try {
        if (previous) previous(callback);
        else callback();
      } catch (error) {
        callback(error);
      }
    }, callback);
  };
}
