import type { OniPublishingSiteConfig } from '../../configmodels/OniPublishing';
import type { DatastreamService } from '../../DatastreamService';
import type { Services as StorageManagerServices } from '../StorageManagerService';
import type { Readable } from 'node:stream';
import { Context, Effect, Layer } from 'effect';
import {
  OcflModuleAdapter,
  OcflStorageAdapter,
  OniCrateBuildResult,
  OniOcflRepository,
  OniPublishInput,
  ResolvedOniPublishingConfigData,
} from './types';
import { createStorageManagerOcflStoreClass } from './flydriveOcflStore';
import { createRootCollectionCrate } from './crate';
import { runEffectProgram } from '../integration-v2/runtime';

export const OniDatastreamServiceTag = Context.GenericTag<DatastreamService>('redbox/OniDatastreamService');

export function makeOniDatastreamLayer(service: DatastreamService) {
  return Layer.succeed(OniDatastreamServiceTag, service);
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function resolveStorageManager(): StorageManagerServices.StorageManager {
  if (typeof StorageManagerService !== 'undefined') {
    return StorageManagerService;
  }
  const serviceName = String(sails.config?.storage?.serviceName ?? '');
  const storageManager = serviceName
    ? (sails.services?.[serviceName] as unknown as StorageManagerServices.StorageManager | undefined)
    : undefined;
  if (storageManager == null || typeof storageManager.disk !== 'function') {
    throw new Error('StorageManagerService is not available for Oni flydrive publishing');
  }
  return storageManager;
}

async function resolveStorageDisk(
  storageManager: StorageManagerServices.StorageManager,
  diskName: string
): Promise<StorageManagerServices.IDisk> {
  if (storageManager.isBootstrapped?.() === false && typeof storageManager.bootstrap === 'function') {
    await storageManager.bootstrap();
  }
  return storageManager.disk(diskName);
}

function getStorageDriver(storageConfig: unknown): string {
  return String((storageConfig as { driver?: unknown } | null | undefined)?.driver ?? '');
}

async function importOcflModule(): Promise<OcflModuleAdapter> {
  const moduleName = '@ocfl/ocfl';
  const imported = await import(moduleName);
  const moduleRecord = imported as Record<string, unknown>;
  const candidate = (moduleRecord.default ?? imported) as Record<string, unknown>;
  if (typeof candidate.Ocfl !== 'function' || typeof candidate.OcflStore !== 'function') {
    throw new Error('@ocfl/ocfl did not expose Ocfl and OcflStore constructors');
  }
  return candidate as unknown as OcflModuleAdapter;
}

function isInvalidStorageRootError(error: unknown): boolean {
  return asError(error).message.toLowerCase().includes('invalid storage root');
}

function isMissingObjectError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException;
  const code = String(err.code ?? '').toUpperCase();
  const message = asError(error).message.toLowerCase();
  return (
    code === 'ENOENT' || code.includes('NOT_FOUND') || message.includes('not found') || message.includes('no such file')
  );
}

async function ensureStorageRoot(storage: OcflStorageAdapter): Promise<void> {
  try {
    await storage.load();
  } catch (error) {
    if (!isInvalidStorageRootError(error)) {
      throw error;
    }
    await storage.create();
    await storage.load();
  }
}

class FlydriveOniRepository implements OniOcflRepository {
  private storagePromise: Promise<OcflStorageAdapter> | null = null;

  constructor(
    private readonly config: ResolvedOniPublishingConfigData,
    private readonly site: OniPublishingSiteConfig,
    private readonly datastreamLayer: Layer.Layer<DatastreamService>,
    private readonly storageManager: StorageManagerServices.StorageManager = resolveStorageManager()
  ) {}

  private async getStorage(): Promise<OcflStorageAdapter> {
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

  async ensureRootCollection(config: ResolvedOniPublishingConfigData, _site?: OniPublishingSiteConfig): Promise<void> {
    const storage = await this.getStorage();
    const rootCollectionObject = storage.object(config.rootCollection.rootCollectionId);
    try {
      await rootCollectionObject.load();
      return;
    } catch (error) {
      if (!isMissingObjectError(error)) {
        throw error;
      }
    }
    const crateJson = JSON.stringify(createRootCollectionCrate(config), null, 2);
    await rootCollectionObject.update(async transaction => {
      await transaction.write(config.metadata.jsonldFilename, crateJson, 'utf8');
    }, 'REPLACE');
  }

  async writeDatasetObject(crate: OniCrateBuildResult, input: OniPublishInput): Promise<void> {
    const storage = await this.getStorage();
    const object = storage.object(crate.rootId);
    const crateJson = JSON.stringify(crate.crateJson, null, 2);
    await object.update(async transaction => {
      await transaction.write(this.config.metadata.jsonldFilename, crateJson, 'utf8');
      for (const attachment of crate.attachments) {
        const datastream = await runEffectProgram(
          Effect.gen(function* () {
            const service = yield* OniDatastreamServiceTag;
            return yield* Effect.tryPromise({
              try: () => service.getDatastream(crate.dataRecordOid, attachment.fileId),
              catch: error => error,
            });
          }).pipe(Effect.provide(this.datastreamLayer))
        );
        if (datastream.readstream != null) {
          await transaction.write(attachment.logicalPath, datastream.readstream as Readable);
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
  datastreamService: DatastreamService,
  storageManager?: StorageManagerServices.StorageManager
): OniOcflRepository {
  const storageDriver = getStorageDriver(site.storage);
  if (storageDriver !== 'flydrive') {
    throw new Error(
      `Oni publishing site storage driver '${storageDriver}' is not supported. Configure site.storage.driver as 'flydrive'.`
    );
  }
  return new FlydriveOniRepository(config, site, makeOniDatastreamLayer(datastreamService), storageManager);
}
