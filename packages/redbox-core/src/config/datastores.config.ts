/**
 * Datastores Config
 * (configuration.datastores)
 *
 * Application-owned MongoDB connection configuration.
 */

export interface DatastoreAdapterConfig {
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
    url: 'mongodb://localhost:27017/redbox-portal',
  },
  redboxStorage: {
    url: 'mongodb://mongodb:27017/redbox-storage',
  },
};
