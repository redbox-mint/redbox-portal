import { Services as services } from '../CoreService';
import { StorageConfig, DiskConfig, storage as defaultStorageConfig } from '../config/storage.config';

/**
 * StorageManagerService
 *
 * Wraps Flydrive v2 to provide a multi-disk storage abstraction.
 * Configures disks based on sails.config.storage and exposes
 * accessors for staging and primary disks.
 *
 * Flydrive is ESM-only; we load it via processDynamicImports().
 */
export namespace Services {
  type DiskConstructor = new (driver: unknown) => IDisk;
  type FSDriverConstructor = new (opts: { location: string | URL; visibility?: string }) => unknown;
  type S3DriverConstructor = new (opts: Record<string, unknown>) => unknown;

  type FlydriveModule = { Disk: DiskConstructor };
  type FSDriverModule = { FSDriver: FSDriverConstructor };
  type S3DriverModule = { S3Driver: S3DriverConstructor };

  const isFlydriveModule = (value: unknown): value is FlydriveModule => {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.Disk === 'function';
  };

  const isFSDriverModule = (value: unknown): value is FSDriverModule => {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.FSDriver === 'function';
  };

  const isS3DriverModule = (value: unknown): value is S3DriverModule => {
    if (typeof value !== 'object' || value === null) {
      return false;
    }
    const record = value as Record<string, unknown>;
    return typeof record.S3Driver === 'function';
  };

  /**
   * Internal interface matching the Flydrive Disk public API surface
   * that we actually use. This avoids referencing ESM-only types at
   * compile-time while preserving type-safety for callers.
   */
  export interface IDisk {
    exists(key: string): Promise<boolean>;
    get(key: string): Promise<string>;
    getStream(key: string): Promise<import('node:stream').Readable>;
    getBytes(key: string): Promise<Uint8Array>;
    getMetaData(
      key: string
    ): Promise<{ contentType?: string; contentLength: number; etag: string; lastModified: Date }>;
    put(key: string, contents: string | Uint8Array, options?: Record<string, unknown>): Promise<void>;
    putStream(key: string, contents: import('node:stream').Readable, options?: Record<string, unknown>): Promise<void>;
    copy(source: string, destination: string, options?: Record<string, unknown>): Promise<void>;
    copyFromFs(source: string | URL, destination: string, options?: Record<string, unknown>): Promise<void>;
    move(source: string, destination: string, options?: Record<string, unknown>): Promise<void>;
    moveFromFs(source: string | URL, destination: string, options?: Record<string, unknown>): Promise<void>;
    delete(key: string): Promise<void>;
    deleteAll(prefix?: string): Promise<void>;
    listAll(
      prefix?: string,
      options?: { recursive?: boolean; paginationToken?: string }
    ): Promise<{
      paginationToken?: string;
      objects: Iterable<unknown>;
    }>;
  }

  export class StorageManager extends services.Core.Service {
    protected _exportedMethods: string[] = ['init', 'bootstrap', 'disk', 'stagingDisk', 'primaryDisk', 'isBootstrapped'];

    protected logHeader: string = 'StorageManagerService::';

    // Flydrive module references (loaded dynamically since ESM-only)
    private _DiskConstructor: DiskConstructor | null = null;
    private _FSDriver: FSDriverConstructor | null = null;
    private _S3Driver: S3DriverConstructor | null = null;

    // Map of instantiated disks, keyed by disk name
    private _disks: Map<string, IDisk> = new Map();
    private _bootstrapped: boolean = false;
    private _bootstrapPromise: Promise<void> | null = null;
    private _initRegistered: boolean = false;

    public override init(): void {
      if (this._initRegistered) {
        return;
      }

      this._initRegistered = true;
      this.registerSailsHook('after', 'ready', async () => {
        try {
          await this.bootstrap();
        } catch (err) {
          this.logger.error(`${this.logHeader} Failed during bootstrap from init():`, err);
        }
      });
    }

    protected override async processDynamicImports(): Promise<void> {
      try {
        const flydriveModule: unknown = await import('flydrive');
        if (isFlydriveModule(flydriveModule)) {
          this._DiskConstructor = flydriveModule.Disk;
        } else {
          this.logger.verbose(`${this.logHeader} Flydrive module missing Disk export`);
        }
      } catch (err) {
        this._DiskConstructor = null;
        this.logger.error(`${this.logHeader} Failed to import flydrive module`, err);
      }
      // Use variables for subpath imports to prevent TypeScript from trying to resolve
      // them at compile-time (flydrive uses package.json exports which require moduleResolution: nodenext)
      const fsDriverPath = 'flydrive/drivers/fs';
      const s3DriverPath = 'flydrive/drivers/s3';
      try {
        const fsModule: unknown = await import(/* webpackIgnore: true */ fsDriverPath);
        if (isFSDriverModule(fsModule)) {
          this._FSDriver = fsModule.FSDriver;
        }
      } catch {
        this.logger.verbose(`${this.logHeader} FSDriver not available`);
      }
      try {
        const s3Module: unknown = await import(/* webpackIgnore: true */ s3DriverPath);
        if (isS3DriverModule(s3Module)) {
          this._S3Driver = s3Module.S3Driver;
        }
      } catch {
        this.logger.verbose(`${this.logHeader} S3Driver not available`);
      }
    }

    /**
     * Bootstrap the storage manager.
     * Validates config and creates Disk instances for each configured disk.
     * Called during service initialization (after Sails is ready).
     */
    public async bootstrap(): Promise<void> {
      if (this._bootstrapped) {
        return;
      }

      if (this._bootstrapPromise) {
        await this._bootstrapPromise;
        return;
      }

      this._bootstrapPromise = this.performBootstrap();
      try {
        await this._bootstrapPromise;
      } catch (err) {
        this._bootstrapPromise = null;
        throw err;
      }
    }

    private getMergedStorageConfig(): StorageConfig {
      const rawStorageConfig = (sails.config?.storage || {}) as StorageConfig;
      return {
        ...defaultStorageConfig,
        ...rawStorageConfig,
        disks:
          rawStorageConfig.disks && Object.keys(rawStorageConfig.disks).length > 0
            ? rawStorageConfig.disks
            : defaultStorageConfig.disks,
      };
    }

    private async performBootstrap(): Promise<void> {
      if (this._bootstrapped) {
        return;
      }

      const storageConfig = this.getMergedStorageConfig();

      if (!storageConfig.disks || Object.keys(storageConfig.disks).length === 0) {
        throw new Error('StorageManagerService: no disks configured in storage.disks and no defaults available');
      }

      // Validate that staging and primary disk names reference configured disks
      const diskNames = Object.keys(storageConfig.disks);
      if (storageConfig.stagingDisk && !diskNames.includes(storageConfig.stagingDisk)) {
        throw new Error(
          `StorageManagerService: stagingDisk '${storageConfig.stagingDisk}' is not defined in storage.disks`
        );
      }
      if (storageConfig.primaryDisk && !diskNames.includes(storageConfig.primaryDisk)) {
        throw new Error(
          `StorageManagerService: primaryDisk '${storageConfig.primaryDisk}' is not defined in storage.disks`
        );
      }

      // Create disks
      for (const [name, diskConf] of Object.entries(storageConfig.disks)) {
        const driver = this.createDriver(name, diskConf);
        if (this._DiskConstructor) {
          const disk = new this._DiskConstructor(driver);
          this._disks.set(name, disk);
        } else {
          throw new Error('StorageManagerService: Flydrive Disk constructor unavailable');
        }
      }

      this._bootstrapped = true;
      this.logger.verbose(`${this.logHeader} Bootstrapped with disks: ${Array.from(this._disks.keys()).join(', ')}`);
    }

    /**
     * Create a Flydrive driver from a DiskConfig entry.
     */
    private createDriver(name: string, diskConf: DiskConfig): unknown {
      switch (diskConf.driver) {
        case 'fs': {
          if (!this._FSDriver) {
            throw new Error(`StorageManagerService: FSDriver not available but disk '${name}' requires it`);
          }
          return new this._FSDriver({
            location: diskConf.config.root,
            visibility: diskConf.config.visibility || 'public',
          });
        }
        case 's3': {
          if (!this._S3Driver) {
            throw new Error(`StorageManagerService: S3Driver not available but disk '${name}' requires it`);
          }
          return new this._S3Driver({
            credentials: {
              accessKeyId: diskConf.config.key,
              secretAccessKey: diskConf.config.secret,
            },
            region: diskConf.config.region,
            bucket: diskConf.config.bucket,
            endpoint: diskConf.config.endpoint,
            visibility: diskConf.config.visibility || 'public',
          });
        }
        default: {
          const unknownConfig = diskConf as DiskConfig;
          throw new Error(`StorageManagerService: Unknown driver '${unknownConfig.driver}' for disk '${name}'`);
        }
      }
    }

    /**
     * Get a disk by name.
     * @throws Error if disk is not found.
     */
    public disk(name: string): IDisk {
      const d = this._disks.get(name);
      if (!d) {
        throw new Error(
          `StorageManagerService: disk '${name}' is not registered. Available: ${Array.from(this._disks.keys()).join(', ')}`
        );
      }
      return d;
    }

    /**
     * Get the staging disk (where TUS uploads land).
     */
    public stagingDisk(): IDisk {
      const mergedStorage = this.getMergedStorageConfig();
      const stagingName = mergedStorage.stagingDisk ?? 'staging';
      return this.disk(stagingName);
    }

    /**
     * Get the primary disk (permanent file storage).
     */
    public primaryDisk(): IDisk {
      const mergedStorage = this.getMergedStorageConfig();
      const primaryName = mergedStorage.primaryDisk ?? 'primary';
      return this.disk(primaryName);
    }

    /**
     * Check if the manager has been bootstrapped.
     */
    public isBootstrapped(): boolean {
      return this._bootstrapped;
    }
  }
}

declare global {
  const StorageManagerService: Services.StorageManager;
}
