/**
 * Storage Config Interface
 * (sails.config.storage)
 *
 * Storage service configuration with Flydrive v2 disk support.
 */

export interface FSDriverOptions {
  root: string;
  visibility?: string;
}

export interface S3DriverOptions {
  key: string;
  secret: string;
  bucket: string;
  region: string;
  endpoint?: string;
  visibility?: string;
  [key: string]: unknown;
}

export type DiskConfig = { driver: 'fs'; config: FSDriverOptions } | { driver: 's3'; config: S3DriverOptions };

export interface StorageConfig {
  /** Name of the storage service to use */
  serviceName: string;
  /** Default disk name (used when no specific disk is requested) */
  defaultDisk?: string;
  /** Name of the staging disk (where TUS uploads land) */
  stagingDisk?: string;
  /** Name of the primary disk (where files are permanently stored) */
  primaryDisk?: string;
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
