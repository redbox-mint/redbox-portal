import { ApplicationRuntime, type ApplicationModuleFactory } from '../../application';
import { cleanupPersistence, cleanupPersistenceAfterFailure } from '../../persistence/runtime';

const key = Symbol.for('@researchdatabox/redbox-core/sails-application/v1');

/** Only the converted module set uses this runtime; other bootstrap/caches remain legacy. */
export function attachSailsApplication(
  app: Sails.Application,
  factories: readonly ApplicationModuleFactory[]
): ApplicationRuntime {
  let application = getSailsApplication(app);
  if (!application) {
    application = new ApplicationRuntime(app, factories);
    Object.defineProperty(app, key, { value: application });
  }
  return application;
}

export function getSailsApplication(app: Sails.Application): ApplicationRuntime | undefined {
  return Reflect.get(app, key) as ApplicationRuntime | undefined;
}

export async function activateSailsApplication(app: Sails.Application): Promise<void> {
  await getSailsApplication(app)?.activate();
}

export async function stopSailsApplication(app: Sails.Application): Promise<void> {
  const application = getSailsApplication(app);
  if (application) await application.stop();
  else await cleanupPersistence(app);
}

export async function stopSailsApplicationAfterFailure(app: Sails.Application): Promise<void> {
  if (!getSailsApplication(app)) return cleanupPersistenceAfterFailure(app);
  try {
    await stopSailsApplication(app);
  } catch {
    app.log.warn('Application cleanup failed after legacy startup failure; resources remain owned.');
  }
}
