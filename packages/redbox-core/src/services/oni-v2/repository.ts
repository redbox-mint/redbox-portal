import type { OniPublishingSiteConfig } from '../../configmodels/OniPublishing';
import type { DatastreamService } from '../../DatastreamService';
import type { Services as StorageManagerServices } from '../StorageManagerService';
import { Readable } from 'node:stream';
import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';
import {
  OcflModuleAdapter,
  OcflStorageAdapter,
  OniCrateBuildResult,
  OniOcflRecoveryRepository,
  OniOcflCommitExpectation,
  OniPublishInput,
  ResolvedOniPublishingConfigData,
} from './types';
import { createStorageManagerOcflStoreClass } from './flydriveOcflStore';
import { createRootCollectionCrate } from './crate';
import { runEffectProgram } from '../integration-v2/runtime';
import { ocflObjectReader, readOniOcflObject, reconcileOniOcflCommit, sha256 } from './ocflReconciliation';
import { OniWriter } from './writer';

type OniDatastreamReader = Pick<DatastreamService, 'getDatastream'>;
export const OniDatastreamServiceTag = Context.Service<OniDatastreamReader>('redbox/OniDatastreamService');

export function makeOniDatastreamLayer(service: OniDatastreamReader) {
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
  if (
    typeof candidate.OcflStore !== 'function' ||
    (typeof candidate.implementOcfl !== 'function' && typeof candidate.Ocfl !== 'function')
  ) {
    throw new Error('@ocfl/ocfl did not expose a supported implementation factory and OcflStore constructor');
  }
  return candidate as unknown as OcflModuleAdapter;
}

function isInvalidStorageRootError(error: unknown): boolean {
  return asError(error).message.toLowerCase().includes('invalid storage root');
}

function isMissingObjectError(error: unknown): boolean {
  const err = error as NodeJS.ErrnoException;
  const code = String(err.code ?? err.name ?? '').toUpperCase();
  const message = asError(error).message.toLowerCase();
  return (
    code === 'ENOENT' ||
    code.includes('NOT_FOUND') ||
    code.includes('NOSUCHKEY') ||
    message.includes('not found') ||
    message.includes('no such file') ||
    message.includes('does not exist')
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

class FlydriveOniRepository implements OniOcflRecoveryRepository {
  private storagePromise: Promise<OcflStorageAdapter> | null = null;
  private inspectionStore?: InstanceType<ReturnType<typeof createStorageManagerOcflStoreClass>>;
  private writer?: OniWriter;
  private quiesced = false;

  async writerQuiesced(): Promise<boolean> {
    return this.quiesced;
  }

  private async write(run: () => Promise<void>): Promise<void> {
    if (this.writer) throw new Error('Concurrent Oni repository writers are forbidden');
    const writer = new OniWriter();
    this.writer = writer;
    this.quiesced = false;
    try {
      await run();
    } finally {
      this.quiesced = await writer.settle();
      this.writer = undefined;
    }
  }

  constructor(
    private readonly config: ResolvedOniPublishingConfigData,
    private readonly site: OniPublishingSiteConfig,
    private readonly datastreamLayer: Layer.Layer<OniDatastreamReader>,
    private readonly storageManager: StorageManagerServices.StorageManager = resolveStorageManager(),
    private readonly loadOcflModule: () => Promise<OcflModuleAdapter> = importOcflModule,
    private readonly canonicalStorageIdentity?: string
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
      const ocfl = await this.loadOcflModule();
      const disk = await resolveStorageDisk(this.storageManager, storageConfig.diskName);
      const BaseStore = createStorageManagerOcflStoreClass(ocfl.OcflStore);
      const tracked = <T>(run: () => Promise<T>): Promise<T> => (this.writer ? this.writer.track(run) : run());
      const storeClass = class extends BaseStore {
        override writeFile(...args: Parameters<InstanceType<typeof BaseStore>['writeFile']>) {
          return tracked(() => super.writeFile(...args));
        }
        override copyFile(...args: Parameters<InstanceType<typeof BaseStore>['copyFile']>) {
          return tracked(() => super.copyFile(...args));
        }
        override move(...args: Parameters<InstanceType<typeof BaseStore>['move']>) {
          return tracked(() => super.move(...args));
        }
        override remove(...args: Parameters<InstanceType<typeof BaseStore>['remove']>) {
          return tracked(() => super.remove(...args));
        }
      };
      const storeOptions = {
        disk,
        root: storageConfig.rootPath,
        workspace: storageConfig.workspacePath,
        prefix: storageConfig.prefix,
        keyEncoding: storageConfig.keyEncoding,
      };
      this.inspectionStore = new storeClass(storeOptions);
      const flydriveOcfl =
        typeof ocfl.implementOcfl === 'function'
          ? ocfl.implementOcfl(storeClass, storeOptions)
          : new ocfl.Ocfl!(storeClass, storeOptions);
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
    await this.write(async () => ensureStorageRoot(await this.getStorage()));
  }

  async inspectStorageRoot(): Promise<'present' | 'absent'> {
    const storage = await this.getStorage();
    try {
      await storage.load();
      return 'present';
    } catch (error) {
      if (!isInvalidStorageRootError(error)) throw error;
      const store = this.inspectionStore;
      if (!store) throw new Error('OCFL inspection store unavailable');
      // Invalid root is not proof of absence. Partial initialization, arbitrary
      // retained bytes, failed listings and unfinished workspace evidence refuse.
      for (const path of [this.site.storage.rootPath, this.site.storage.workspacePath].filter(Boolean)) {
        if (await store.hasDirectoryEntries(path))
          throw new Error('OCFL storage root or workspace contains unverified content');
      }
      return 'absent';
    }
  }

  async readObject(objectId: string) {
    const storage = await this.getStorage();
    await storage.load();
    const object = ocflObjectReader(storage.object(objectId));
    const store = this.inspectionStore;
    if (!store) throw new Error('OCFL inspection store unavailable');
    const storageIdentity = this.canonicalStorageIdentity ?? sha256(JSON.stringify(this.site.storage));
    return readOniOcflObject(object, objectId, storageIdentity, this.config.metadata.jsonldFilename, async () => {
      const files: string[] = [];
      for await (const file of await store.list(object.root, { recursive: true })) files.push(file.path);
      const workspaceEntries: string[] = [];
      if (object.workspace) {
        // S3-compatible stores can retain empty prefixes after all keys are
        // deleted. Stored bytes, rather than empty prefixes, indicate a writer.
        for await (const file of await store.list(object.workspace, { recursive: true }))
          workspaceEntries.push(file.path);
      }
      return {
        files,
        rootEntries: await store.readdir(object.root),
        workspaceEntries,
      };
    });
  }

  async reconcileCommit(input: OniOcflCommitExpectation) {
    return reconcileOniOcflCommit(input, () => this.readObject(input.prior.objectId));
  }

  async ensureRootCollection(config: ResolvedOniPublishingConfigData, _site?: OniPublishingSiteConfig): Promise<void> {
    await this.write(() => this.writeRootCollection(config));
  }

  private async writeRootCollection(config: ResolvedOniPublishingConfigData): Promise<void> {
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
    await this.write(() => this.writeDataset(crate, input));
  }

  private async writeDataset(crate: OniCrateBuildResult, input: OniPublishInput): Promise<void> {
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
          await transaction.write(attachment.logicalPath, Readable.toWeb(new Readable().wrap(datastream.readstream)));
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
  datastreamService: OniDatastreamReader,
  storageManager?: StorageManagerServices.StorageManager,
  loadOcflModule?: () => Promise<OcflModuleAdapter>,
  canonicalStorageIdentity?: string
): OniOcflRecoveryRepository {
  const storageDriver = getStorageDriver(site.storage);
  if (storageDriver !== 'flydrive') {
    throw new Error(
      `Oni publishing site storage driver '${storageDriver}' is not supported. Configure site.storage.driver as 'flydrive'.`
    );
  }
  return new FlydriveOniRepository(
    config,
    site,
    makeOniDatastreamLayer(datastreamService),
    storageManager,
    loadOcflModule,
    canonicalStorageIdentity
  );
}
