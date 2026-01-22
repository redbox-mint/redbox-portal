/**
 * Datastores Config
 * (sails.config.datastores)
 * 
 * Database adapter configuration for Sails.
 */

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sailsMongo = require('sails-mongo');

export interface DatastoreAdapterConfig {
    adapter: unknown;
    url: string;
    // Optional connection properties
    user?: string;
    password?: string;
    host?: string;
    port?: number;
    database?: string;
}

export interface DatastoresConfig {
    [datastoreName: string]: DatastoreAdapterConfig;
}

export const datastores: DatastoresConfig = {
    mongodb: {
        adapter: sailsMongo,
        url: 'mongodb://localhost:27017/redbox-portal'
    },
    redboxStorage: {
        adapter: sailsMongo,
        url: 'mongodb://mongodb:27017/redbox-storage'
    }
};
