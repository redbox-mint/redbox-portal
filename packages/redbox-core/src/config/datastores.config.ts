/**
 * Datastores Config
 * (sails.config.datastores)
 * 
 * Database adapter configuration for Sails.
 */

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
    /** Socket inactivity limit for all datastore operations; also releases permits held by stalled audit writes. */
    socketTimeoutMS?: number;
}

export interface DatastoresConfig {
    [datastoreName: string]: DatastoreAdapterConfig;
}

export const datastores: DatastoresConfig = {
    mongodb: {
        adapter: sailsMongo,
        url: 'mongodb://localhost:27017/redbox-portal',
        socketTimeoutMS: 120000
    },
    redboxStorage: {
        adapter: sailsMongo,
        url: 'mongodb://mongodb:27017/redbox-storage',
        socketTimeoutMS: 120000
    }
};
