/**
 * Models Config Interface
 * (sails.config.models)
 * 
 * Default model configuration for Waterline ORM.
 */

export interface ModelAttributeConfig {
    type: string;
    autoCreatedAt?: boolean;
    autoUpdatedAt?: boolean;
    columnName?: string;
}

export interface ModelsConfig {
    /** Default datastore/connection for models */
    datastore?: string;

    /** Legacy connection property (deprecated, use datastore) */
    connection?: string | null;

    /** Schema migration strategy: 'safe' | 'alter' | 'drop' */
    migrate?: 'safe' | 'alter' | 'drop';

    /** Fetch records on update operations */
    fetchRecordsOnUpdate?: boolean;

    /** Fetch records on create operations */
    fetchRecordsOnCreate?: boolean;

    /** Fetch records on createEach operations */
    fetchRecordsOnCreateEach?: boolean;

    /** Fetch records on destroy operations */
    fetchRecordsOnDestroy?: boolean;

    /** Default attributes for all models */
    attributes?: {
        createdAt?: ModelAttributeConfig;
        updatedAt?: ModelAttributeConfig;
        id?: ModelAttributeConfig;
        [key: string]: ModelAttributeConfig | undefined;
    };
}

export const models: ModelsConfig = {
    datastore: 'mongodb',
    connection: null,
    migrate: 'safe',
    fetchRecordsOnUpdate: true,
    fetchRecordsOnCreate: true,
    fetchRecordsOnCreateEach: true,
    attributes: {
        createdAt: { type: 'string', autoCreatedAt: true },
        updatedAt: { type: 'string', autoUpdatedAt: true },
        id: { type: 'string', columnName: '_id' },
    },
};
