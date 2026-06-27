import type { OniPublishingSiteConfig } from '../../configmodels/OniPublishing';
import {
  DatastreamServiceLike,
  OcflModuleLike,
  OcflStorageLike,
  OniCrateBuildResult,
  OniOcflRepository,
  OniPublishInput,
  ResolvedOniPublishingConfigData,
  StorageDiskLike,
  StorageManagerLike,
} from './types';
import { createStorageManagerOcflStoreClass } from './flydriveOcflStore';

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resolveStorageManager(): StorageManagerLike {
  if (typeof StorageManagerService !== 'undefined') {
    return StorageManagerService as unknown as StorageManagerLike;
  }
  const serviceName = String(sails.config?.storage?.serviceName ?? '');
  const storageManager = serviceName
    ? (sails.services?.[serviceName] as unknown as StorageManagerLike | undefined)
    : undefined;
  if (storageManager == null || typeof storageManager.disk !== 'function') {
    throw new Error('StorageManagerService is not available for Oni flydrive publishing');
  }
  return storageManager;
}

async function resolveStorageDisk(storageManager: StorageManagerLike, diskName: string): Promise<StorageDiskLike> {
  if (storageManager.isBootstrapped?.() === false && typeof storageManager.bootstrap === 'function') {
    await storageManager.bootstrap();
  }
  return storageManager.disk(diskName);
}

function resolveDatastreamService(): DatastreamServiceLike {
  const serviceName = String(sails.config?.record?.datastreamService ?? '');
  const datastreamService = serviceName
    ? (sails.services?.[serviceName] as unknown as DatastreamServiceLike | undefined)
    : undefined;
  if (datastreamService == null || typeof datastreamService.getDatastream !== 'function') {
    throw new Error('Datastream service is not configured for Oni publishing');
  }
  return datastreamService;
}

function getStorageDriver(storageConfig: unknown): string {
  return String((storageConfig as { driver?: unknown } | null | undefined)?.driver ?? '');
}

async function importOcflModule(): Promise<OcflModuleLike> {
  const importModule = new Function('moduleName', 'return import(moduleName)') as (
    moduleName: string
  ) => Promise<unknown>;
  const imported = await importModule('@ocfl/ocfl');
  const moduleRecord = imported as Record<string, unknown>;
  const candidate = (moduleRecord.default ?? imported) as Record<string, unknown>;
  if (typeof candidate.Ocfl !== 'function' || typeof candidate.OcflStore !== 'function') {
    throw new Error('@ocfl/ocfl did not expose Ocfl and OcflStore constructors');
  }
  return candidate as unknown as OcflModuleLike;
}

async function ensureStorageRoot(storage: OcflStorageLike): Promise<void> {
  try {
    await storage.load();
  } catch (error) {
    if (asError(error).message !== 'Invalid storage root') {
      throw error;
    }
    await storage.create();
    await storage.load();
  }
}

function createRootCollectionCrate(config: ResolvedOniPublishingConfigData): Record<string, unknown> {
  const root = config.rootCollection;
  return {
    '@context': 'https://w3id.org/ro/crate/1.1/context',
    '@graph': [
      {
        '@id': config.metadata.jsonldFilename,
        '@type': 'CreativeWork',
        about: { '@id': root.rootCollectionId },
        conformsTo: { '@id': 'https://w3id.org/ro/crate/1.1' },
      },
      {
        '@id': root.rootCollectionId,
        '@type': root.dsType,
        identifier: root.targetRepoColId,
        name: root.targetRepoColName,
        description: root.targetRepoColDescription,
        license: root.defaultLicense,
      },
    ],
  };
}

class FlydriveOniRepository implements OniOcflRepository {
  private storagePromise: Promise<OcflStorageLike> | null = null;

  constructor(
    private readonly config: ResolvedOniPublishingConfigData,
    private readonly site: OniPublishingSiteConfig,
    private readonly storageManager: StorageManagerLike = resolveStorageManager()
  ) {}

  private async getStorage(): Promise<OcflStorageLike> {
    if (this.storagePromise != null) {
      return this.storagePromise;
    }
    const storageConfig = this.site.storage;
    const storageDriver = getStorageDriver(storageConfig);
    if (storageDriver !== 'flydrive') {
      throw new Error(`Oni site storage driver '${storageDriver}' is not supported by FlydriveOniRepository`);
    }

    this.storagePromise = (async () => {
      const ocfl = await importOcflModule();
      const disk = await resolveStorageDisk(this.storageManager, storageConfig.diskName);
      const storeClass = createStorageManagerOcflStoreClass(ocfl.OcflStore);
      const storeOptions = {
        disk,
        root: storageConfig.rootPath,
        workspace: storageConfig.workspacePath,
        prefix: storageConfig.prefix,
        keyEncoding: storageConfig.keyEncoding,
      };
      const flydriveOcfl = new ocfl.Ocfl(storeClass, storeOptions);
      return flydriveOcfl.storage(
        {
          root: storageConfig.rootPath,
          workspace: storageConfig.workspacePath,
          ocflVersion: '1.1',
          layout: {
            extensionName: '000N-path-direct-storage-layout',
          },
        },
        storeOptions
      );
    })().catch(error => {
      this.storagePromise = null;
      throw error;
    });
    return this.storagePromise;
  }

  async ensureStorageRoot(): Promise<void> {
    await ensureStorageRoot(await this.getStorage());
  }

  async ensureRootCollection(config: ResolvedOniPublishingConfigData): Promise<void> {
    const storage = await this.getStorage();
    const rootCollectionObject = storage.object(config.rootCollection.rootCollectionId);
    const crateJson = JSON.stringify(createRootCollectionCrate(config), null, 2);
    await rootCollectionObject.update(async transaction => {
      await transaction.write(config.metadata.jsonldFilename, crateJson, 'utf8');
    }, 'REPLACE');
  }

  async writeDatasetObject(crate: OniCrateBuildResult, input: OniPublishInput): Promise<void> {
    const storage = await this.getStorage();
    const datastreamService = resolveDatastreamService();
    const object = storage.object(crate.rootId);
    const crateJson = JSON.stringify(crate.crateJson, null, 2);
    await object.update(async transaction => {
      await transaction.write(this.config.metadata.jsonldFilename, crateJson, 'utf8');
      for (const attachment of crate.attachments) {
        const datastream = await datastreamService.getDatastream(crate.dataRecordOid, attachment.fileId);
        if (datastream.readstream != null) {
          await transaction.write(attachment.logicalPath, datastream.readstream);
        } else {
          const body = datastream.body ?? '';
          await transaction.write(
            attachment.logicalPath,
            typeof body === 'string' || body instanceof Uint8Array ? body : Buffer.from(String(body))
          );
        }
      }
    }, 'REPLACE');
    sails.log.verbose(`OniService:: wrote OCFL object ${crate.rootId} for publication ${input.oid}`);
  }
}

export function createOniRepository(
  config: ResolvedOniPublishingConfigData,
  site: OniPublishingSiteConfig,
  storageManager?: StorageManagerLike
): OniOcflRepository {
  const storageDriver = getStorageDriver(site.storage);
  if (storageDriver !== 'flydrive') {
    throw new Error(
      `Oni publishing site storage driver '${storageDriver}' is not supported. Configure site.storage.driver as 'flydrive'.`
    );
  }
  return new FlydriveOniRepository(config, site, storageManager);
}
