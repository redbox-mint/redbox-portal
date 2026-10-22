import { initializePersistence } from './runtime';
/** Groups add their qualified index contracts when their repositories are activated. */
export async function prepareSelectedPersistenceIndexes(app: Sails.Application, mode: 'inspect' | 'ensure') {
  await initializePersistence(app);
  return { mode, ready: true, groups: [] };
}
