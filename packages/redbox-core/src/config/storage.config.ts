/**
 * Storage Config Interface
 * (sails.config.storage)
 *
 * Storage service configuration with Flydrive v2 disk support.
 */

export type Visibility = 'public' | 'private';

export interface FSDriverOptions {
  root: string;
  visibility?: Visibility;
}

export interface S3DriverOptions {
  key: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  bucketEndpoint?: boolean;
  tls?: boolean;
  useAccelerateEndpoint?: boolean;
  supportsACL?: boolean;
  visibility?: Visibility;
  [key: string]: unknown;
}

export interface GridFSDriverOptions {
  datastore?: string;
  url?: string;
  databaseName?: string;
  bucketName?: string;
  visibility?: Visibility;
}

export type DiskConfig =
  | { driver: 'fs'; config: FSDriverOptions }
  | { driver: 's3'; config: S3DriverOptions }
  | { driver: 'gridfs'; config: GridFSDriverOptions };

export interface StorageConfig {
  /** Name of the storage service to use */
  serviceName: string;
  /** Default disk name (used when no specific disk is requested) */
  defaultDisk?: string;
  /** Name of the staging disk (where TUS uploads land) */
  stagingDisk?: string;
  /** Name of the primary disk (where files are permanently stored) */
  primaryDisk?: string;
  /** Prefix for object keys in the primary disk */
  keyPrefix?: string;
  /** Map of disk names to their driver configurations */
  disks?: {
    [key: string]: DiskConfig;
  };
}

export const storage: StorageConfig = {
  serviceName: 'mongostorageservice',
  defaultDisk: 'primary',
  stagingDisk: 'staging',
  primaryDisk: 'primary',
  keyPrefix: 'attachments/',
  disks: {
    staging: {
      driver: 'fs',
      config: {
        root: '/attachments/staging',
      },
    },
    primary: {
      driver: 'fs',
      config: {
        root: '/attachments/primary',
      },
    },
  },
};
