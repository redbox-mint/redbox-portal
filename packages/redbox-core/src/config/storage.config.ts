/**
 * Storage Config Interface
 * (configuration.storage)
 *
 * Storage service configuration with Flydrive v2 disk support.
 */

export type Visibility = 'public' | 'private';

export interface FSDriverOptions {
  root: string;
  visibility?: Visibility;
}

export interface S3DriverOptions {
  /** Omit explicit credentials to use the AWS default credential provider chain. */
  key?: string;
  secret?: string;
  bucket: string;
  /** Omit to use the AWS region provider chain. */
  region?: string;
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
  /** Additional/overridden storage indexes inspected by explicit maintenance. */
  mongodb?: {
    indices?: import('mongodb').IndexDescription[];
    deletedRecordIndices?: import('mongodb').IndexDescription[];
    recordIdentityIndices?: import('mongodb').IndexDescription[];
  };
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
    'figshare-staging': {
      driver: 'fs',
      config: {
        root: '/attachments/figshare-staging',
      },
    },
  },
};
