import { attachSailsApplication } from './application';
import { initializeReferencePersistence } from '../../persistence/reference/runtime';
import type { BrandingModel } from '../../model/storage/BrandingModel';
import { RecordTypes } from '../../recordTypes';
import { getReferenceRepositories } from '../../persistence/reference/runtime';
import type { StorageCapabilityProvider } from '../../RecordStorageConcurrency';

/** All legacy discovery stays here; the domain receives only its needed operations. */
export class LegacyRecordTypes extends RecordTypes {
  public constructor(private readonly app: Sails.Application = sails) {
    super({
      repository: {
        listForBrand: (...args) => getReferenceRepositories(app).recordTypes.listForBrand(...args),
        findByName: (...args) => getReferenceRepositories(app).recordTypes.findByName(...args),
        createDefinition: (...args) => getReferenceRepositories(app).recordTypes.createDefinition(...args),
        removeForBrand: (...args) => getReferenceRepositories(app).recordTypes.removeForBrand(...args),
      },
      config: {
        get appmode() {
          return app.config.appmode;
        },
        get recordtype() {
          return app.config.recordtype;
        },
        get recordSchema() {
          return app.config.recordSchema;
        },
      },
      log: app.log,
      storageCapability: () => {
        const name = app.config.storage?.serviceName;
        return name ? (app.services?.[name] as StorageCapabilityProvider | undefined) : undefined;
      },
    });
  }

  public exports(): Record<string, unknown> {
    return exportsFor(
      () => this,
      brand => bootstrapSailsRecordTypes(this.app, brand, this)
    );
  }
}

/** A lazy shim can be generated/read before Sails installs its global application. */
function exportsFor(
  resolve: () => RecordTypes,
  bootstrap: (brand: Pick<BrandingModel, 'id'>) => Promise<ReturnType<RecordTypes['getAllCache']>>
) {
  return {
    bootstrap,
    create: (...args: Parameters<RecordTypes['create']>) => resolve().create(...args),
    get: (...args: Parameters<RecordTypes['get']>) => resolve().get(...args),
    getAll: (...args: Parameters<RecordTypes['getAll']>) => resolve().getAll(...args),
    getAllCache: () => resolve().getAllCache(),
    assertConcurrentModificationCapability: (
      ...args: Parameters<RecordTypes['assertConcurrentModificationCapability']>
    ) => resolve().assertConcurrentModificationCapability(...args),
    resolveConcurrentModificationMode: (...args: Parameters<RecordTypes['resolveConcurrentModificationMode']>) =>
      resolve().resolveConcurrentModificationMode(...args),
    resolveConcurrentModificationPolicy: (...args: Parameters<RecordTypes['resolveConcurrentModificationPolicy']>) =>
      resolve().resolveConcurrentModificationPolicy(...args),
  };
}

export function sailsRecordTypesExports(): Record<string, unknown> {
  return exportsFor(
    () => sailsRecordTypes(sails),
    brand => bootstrapSailsRecordTypes(sails, brand)
  );
}

export async function bootstrapSailsRecordTypes(
  app: Sails.Application,
  brand: Pick<BrandingModel, 'id'>,
  instance = sailsRecordTypes(app)
) {
  const owned = Reflect.get(app, key) as LegacyRecordTypes | undefined;
  if (owned && owned !== instance)
    throw new Error('A converted RecordTypes instance is already owned by this application.');
  if (!owned) Object.defineProperty(app, key, { value: instance });
  const application = attachSailsApplication(app, [
    {
      name: 'recordTypes',
      create: () => ({
        initialize: async () => {
          await initializeReferencePersistence(app);
          await instance.initialize(brand);
        },
        close: () => instance.close(),
      }),
    },
  ]);
  await application.initialize();
  return instance.getAllCache();
}

const key = Symbol.for('@researchdatabox/redbox-core/legacy-record-types/v1');
/** Owned by the legacy application, never the process-wide service cache. */
export function sailsRecordTypes(app: Sails.Application): LegacyRecordTypes {
  let instance = Reflect.get(app, key) as LegacyRecordTypes | undefined;
  if (!instance) {
    instance = new LegacyRecordTypes(app);
    Object.defineProperty(app, key, { value: instance });
  }
  return instance;
}
