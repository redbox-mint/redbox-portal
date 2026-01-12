/**
 * Config Types Index
 * 
 * Exports all config interfaces and default values for sails.config typing.
 * These are used by redbox-loader.js to generate shim files in config/.
 */

// Export individual config interfaces and values
export * from './api.config';
export * from './appmode.config';
export * from './record.config';
export * from './datacite.config';
export * from './vocab.config';
export * from './datastores.config';
export * from './sockets.config';
export * from './static_assets.config';
export * from './http.config';
export * from './i18n.config';
export * from './search.config';
export * from './namedQuery.config';
export * from './action.config';
export * from './dynamicasset.config';
export * from './peopleSearch.config';
export * from './reusableFormDefinitions.config';
export * from './log.config';
export * from './ng2.config';

// Import config values for the Config namespace
import { api, ReDBoxAPIConfig } from './api.config';
import { appmode, AppModeConfig } from './appmode.config';
import { record, RecordConfig } from './record.config';
import { datacite, DataciteConfig } from './datacite.config';
import { vocab, VocabConfig } from './vocab.config';
import { DatastoresConfig } from './datastores.config';
import { sockets, SocketsConfig } from './sockets.config';
import { static_assets, StaticAssetsConfig } from './static_assets.config';
import { HttpConfig } from './http.config';
import { i18n, I18nConfig } from './i18n.config';
import { search, SearchConfig } from './search.config';
import { namedQuery, NamedQueryConfig } from './namedQuery.config';
import { action, ActionConfig } from './action.config';
import { dynamicasset, DynamicAssetConfig } from './dynamicasset.config';
import { peopleSearch, PeopleSearchConfig } from './peopleSearch.config';
import { reusableFormDefinitions, ReusableFormDefinitionsConfig } from './reusableFormDefinitions.config';
import { LogConfig } from './log.config';
import { ng2, Ng2Config } from './ng2.config';

/**
 * Branding-aware config function type
 * Returns branding-specific configuration based on brand name
 */
export type BrandingAwareFunction = (brandName?: string) => Record<string, unknown>;

/**
 * Auth config for authentication settings
 */
export interface AuthConfig {
    active: string[];
    default?: string;
    loginPath: string;
    postLogoutRedir?: string;
    [key: string]: unknown;
}

/**
 * Passport strategy config with authenticate method
 */
export interface PassportConfig {
    authenticate: (strategy: string, options?: any) => (req: any, res: any, next?: any) => void;
    [strategyName: string]: unknown;
}

/**
 * Aggregate interface for sails.config
 * Provides type-safe access to all configuration values
 */
export interface SailsConfig {
    // Core config keys (migrated)
    api: ReDBoxAPIConfig;
    appmode: AppModeConfig;
    record: RecordConfig;
    datacite: DataciteConfig;
    vocab: VocabConfig;
    datastores: DatastoresConfig;
    sockets: SocketsConfig;
    static_assets: StaticAssetsConfig;
    http: HttpConfig;
    i18n: I18nConfig;
    search: SearchConfig;
    namedQuery: NamedQueryConfig;
    action: ActionConfig;
    dynamicasset: DynamicAssetConfig;
    peopleSearch: PeopleSearchConfig;
    reusableFormDefinitions: ReusableFormDefinitionsConfig;
    log: LogConfig;
    ng2: Ng2Config;

    // Auth-related configs
    auth: AuthConfig;
    passport: PassportConfig;

    // Runtime/function configs
    brandingAware: BrandingAwareFunction;

    // Sails built-in configs
    appPath: string;
    appUrl: string;
    environment: string;
    port: number;

    // Runtime state (can be set at runtime)
    startupMinute?: number;
}

/**
 * Config namespace containing all default config values
 * Used by redbox-loader.js for shim generation
 */
export const Config = {
    api,
    appmode,
    record,
    datacite,
    vocab,
    sockets,
    static_assets,
    i18n,
    search,
    namedQuery,
    action,
    dynamicasset,
    peopleSearch,
    reusableFormDefinitions,
    ng2,
} as const;

// Type for the Config object
export type ConfigType = typeof Config;
