/**
 * Datastores Config Interface
 * Auto-generated from config/datastores.js
 * 
 * Note: The actual datastores configuration requires the sails-mongo adapter.
 * This file only provides TypeScript interfaces for type checking.
 */

/**
 * MongoDB datastore configuration
 */
export interface MongoDatastore {
    /** The Waterline/Sails adapter (requires runtime require('sails-mongo')) */
    adapter: any;

    /** MongoDB connection URL */
    url: string;

    /** Optional: MongoDB authentication username */
    user?: string;

    /** Optional: MongoDB authentication password */
    password?: string;

    /** Optional: Database name (can also be in URL) */
    database?: string;

    /** Optional: MongoDB host */
    host?: string;

    /** Optional: MongoDB port */
    port?: number;
}

/**
 * Datastores configuration interface for sails.config.datastores
 */
export interface DatastoresConfig {
    /** Primary MongoDB datastore */
    mongodb: MongoDatastore;

    /** ReDBox storage MongoDB datastore */
    redboxStorage: MongoDatastore;

    /** Allow additional named datastores */
    [datastoreName: string]: MongoDatastore;
}

// Note: Default values are NOT exported as they require runtime require('sails-mongo').
// The original config/datastores.js file must be kept for runtime functionality.
