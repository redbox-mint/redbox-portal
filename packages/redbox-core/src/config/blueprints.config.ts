/**
 * Blueprints Config Interface
 * (sails.config.blueprints)
 * 
 * Configuration for Sails blueprint routes and request options.
 */

export interface BlueprintsConfig {
    /** Enable action routes for controller methods */
    actions?: boolean;

    /** Enable RESTful routes for CRUD operations */
    rest?: boolean;

    /** Enable shortcut routes (should be disabled in production) */
    shortcuts?: boolean;

    /** Optional mount path for all blueprint routes */
    prefix?: string;

    /** Optional mount path for REST blueprint routes only */
    restPrefix?: string;

    /** Whether to pluralize controller names in routes */
    pluralize?: boolean;

    /** Whether to populate model fetches with associated data */
    populate?: boolean;

    /** Whether to run Model.watch() in find/findOne actions */
    autoWatch?: boolean;

    /** Default number of records in "find" response */
    defaultLimit?: number;
}

export const blueprints: BlueprintsConfig = {
    actions: false,
    rest: false,
    shortcuts: false,
};
