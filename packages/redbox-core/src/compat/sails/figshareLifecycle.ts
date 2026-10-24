import { FigshareWorkers } from '../../integrations/figshare/Workers';
const key: unique symbol = Symbol.for('@researchdatabox/redbox-core/comparison/figshare-workers/v1');
type Owner = Sails.Application & { [key]?: { workers: FigshareWorkers; registered: boolean } };
function stateFor(app: Sails.Application) {
  const owner = app as Owner;
  if (!owner[key])
    Object.defineProperty(owner, key, {
      value: { workers: new FigshareWorkers(run => Promise.resolve().then(run)), registered: false },
    });
  return owner[key]!;
}
export function figshareWork<T>(app: Sails.Application, run: () => Promise<T>): Promise<T> {
  return stateFor(app).workers.work(run);
}
export function drainFigshareWorkers(app: Sails.Application): Promise<void> {
  return stateFor(app).workers.drain();
}
export function initializeFigshareWorkers(app: Sails.Application): void {
  const state = stateFor(app);
  if (state.registered) return;
  state.registered = true;
  const previous = app.config.beforeShutdown;
  app.config.beforeShutdown = callback => {
    void state.workers.drain().then(() => {
      try {
        if (previous) previous(callback);
        else callback();
      } catch (error) {
        callback(error);
      }
    }, callback);
  };
}
