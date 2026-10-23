import { RecordTypes } from '../../recordTypes';
import { getReferenceRepositories } from '../../persistence/reference/runtime';
import type { StorageCapabilityProvider } from '../../RecordStorageConcurrency';

/** All legacy discovery stays here; the domain receives only its needed operations. */
export class LegacyRecordTypes extends RecordTypes {
  public constructor(app: Sails.Application = sails) {
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
    return {
      bootstrap: this.bootstrap.bind(this),
      create: this.create.bind(this),
      get: this.get.bind(this),
      getAll: this.getAll.bind(this),
      getAllCache: this.getAllCache.bind(this),
      assertConcurrentModificationCapability: this.assertConcurrentModificationCapability.bind(this),
      resolveConcurrentModificationMode: this.resolveConcurrentModificationMode.bind(this),
      resolveConcurrentModificationPolicy: this.resolveConcurrentModificationPolicy.bind(this),
    };
  }
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
