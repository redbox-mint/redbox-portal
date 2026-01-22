/**
 * Storage Config Interface
 * (sails.config.storage)
 * 
 * Storage service configuration.
 */

export interface StorageConfig {
    /** Name of the storage service to use */
    serviceName: string;
}

export const storage: StorageConfig = {
    serviceName: 'mongostorageservice',
};
