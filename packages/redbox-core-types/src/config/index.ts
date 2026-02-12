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
// Auth config
export * from './auth.config';
// Sails core configs
export * from './blueprints.config';
export * from './cors.config';
export * from './security.config';
export * from './globals.config';
export * from './models.config';
export * from './orm.config';
export * from './policies.config';
export * from './session.config';
export * from './views.config';
export * from './routes.config';
export * from './bootstrap.config';
// Feature configs
export * from './queue.config';
export * from './storage.config';
export * from './orcid.config';
export * from './mint.config';
export * from './jsonld.config';
export * from './emailnotification.config';
export * from './agendaQueue.config';
export * from './crontab.config';
export * from './solr.config';
export * from './form.config';
export * from './webpack.config';
// Security configs
export * from './csp.config';
export * from './dompurify.config';
export * from './redboxSession.config';
// Complex/Large configs (interface-only)
export * from './branding.config';
export * from './brandingConfigurationDefaults.config';
export * from './raid.config';
export * from './report.config';
export * from './figshareAPI.config';
export * from './figshareRedboxFORMapping.config';
export * from './recordtype.config';
export * from './workflow.config';
// Miscellaneous configs
export * from './autoreload.config';
export * from './custom.config';
export * from './dynamicconfig.config';
export * from './dashboardtype.config';
export * from './datapubs.config';
export * from './workspacetype.config';
export * from './lognamespace.config';
export * from './redboxToCkan.config';
export * from './figshareAPIEnv.config';
export * from './typescript.config';
export * from './custom_cache.config';
export * from './validators.config';

// Import config values for the Config namespace
import { api, ReDBoxAPIConfig } from './api.config';
import { appmode, AppModeConfig } from './appmode.config';
import { record, RecordConfig } from './record.config';
import { datacite, DataciteConfig } from './datacite.config';
import { vocab, VocabConfig } from './vocab.config';
import { sockets, SocketsConfig } from './sockets.config';
import { static_assets, StaticAssetsConfig } from './static_assets.config';
import { http, HttpConfig } from './http.config';
import { i18n, I18nConfig } from './i18n.config';
import { search, SearchConfig } from './search.config';
import { namedQuery, NamedQueryConfig } from './namedQuery.config';
import { action, ActionConfig } from './action.config';
import { dynamicasset, DynamicAssetConfig } from './dynamicasset.config';
import { peopleSearch, PeopleSearchConfig } from './peopleSearch.config';
import { reusableFormDefinitions, ReusableFormDefinitions } from './reusableFormDefinitions.config';
import { log, LogConfig } from './log.config';
import { ng2, Ng2Config } from './ng2.config';
// Sails core config imports
import { blueprints, BlueprintsConfig } from './blueprints.config';
import { datastores, DatastoresConfig } from './datastores.config';
import { cors, CorsConfig } from './cors.config';
import { redboxSession, RedboxSessionConfig } from './redboxSession.config';
import { security, SecurityConfig } from './security.config';
import { globals, GlobalsConfig } from './globals.config';
import { models, ModelsConfig } from './models.config';
import { orm, OrmConfig } from './orm.config';
import { policies, PoliciesConfig } from './policies.config';
import { session, SessionConfigOrDisabled } from './session.config';
import { views, ViewsConfig } from './views.config';
import { routes, RoutesConfig } from './routes.config';
import { BootstrapConfig } from './bootstrap.config';
// Feature config imports
import { queue, QueueConfig } from './queue.config';
import { storage, StorageConfig } from './storage.config';
import { orcid, OrcidConfig } from './orcid.config';
import { mint, MintConfig } from './mint.config';
import { jsonld, JsonLdConfig } from './jsonld.config';
import { emailnotification, EmailNotificationConfig } from './emailnotification.config';
import { agendaQueue, AgendaQueueConfig } from './agendaQueue.config';
import { crontab, CrontabConfig } from './crontab.config';
import { solr, SolrSearchConfig } from './solr.config';
import { FormConfig } from './form.config';
import { webpack, WebpackConfig } from './webpack.config';
// Security config imports
import { csp, ContentSecurityPolicyConfig } from './csp.config';
import { dompurify, DomPurifyConfig } from './dompurify.config';

// Auth config import
import { auth } from './auth.config';
import type { NextFunction, Request, Response } from 'express';
// Complex/Large config imports (interface-only)
import { BrandingConfig, branding } from './branding.config';
import { BrandingConfigurationDefaultsConfig, brandingConfigurationDefaults, BrandAuthConfig, AuthBootstrapConfig } from './brandingConfigurationDefaults.config';
import { RaidConfig, raid } from './raid.config';
import { ReportsConfig, reports } from './report.config';
import { FigshareApiConfig, figshareAPI } from './figshareAPI.config';
import { FigshareReDBoxFORMappingConfig, figshareReDBoxFORMapping } from './figshareRedboxFORMapping.config';
import { RecordTypeConfig, recordtype } from './recordtype.config';
import { WorkflowConfig, workflow } from './workflow.config';
// Miscellaneous config imports
import { autoreload, AutoreloadConfig } from './autoreload.config';
import { custom, CustomConfig } from './custom.config';
import { dynamicconfig, DynamicConfigConfig } from './dynamicconfig.config';
import { dashboardtype, DashboardTypeConfig } from './dashboardtype.config';
import { datapubs, DataPubsConfig } from './datapubs.config';
import { workspacetype, WorkspaceTypeConfig } from './workspacetype.config';
import { lognamespace, LogNamespaceConfig } from './lognamespace.config';
import { redboxToCkan, RedboxToCkanConfig } from './redboxToCkan.config';
import { figshareAPIEnv, FigshareApiEnvConfig } from './figshareAPIEnv.config';
import { typescript, TypeScriptHookConfig } from './typescript.config';
import { custom_cache, CustomCacheConfig } from './custom_cache.config';
import { validators, ValidatorsConfig } from './validators.config';
import { AuthorizedDomainsEmails } from '../configmodels/AuthorizedDomainsEmails';

/**
 * Branding-aware config function type
 * Returns branding-specific configuration based on brand name
 */
export type BrandingAwareFunction = (brandName?: string) => BrandingConfigurationDefaultsConfig & {
    authorizedDomainsEmails?: AuthorizedDomainsEmails;
};

/**
 * Auth config for authentication settings
 */
export type AuthConfig = AuthBootstrapConfig & BrandAuthConfig;

/**
 * Passport strategy config with authenticate method
 */
export interface PassportConfig {
    authenticate: (
        strategy: string,
        options?: Record<string, unknown>
    ) => (req: Request, res: Response, next?: NextFunction) => void;
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
    reusableFormDefinitions: ReusableFormDefinitions;
    log: LogConfig;
    ng2: Ng2Config;

    // Sails core configs
    blueprints: BlueprintsConfig;
    cors: CorsConfig;
    redboxSession: RedboxSessionConfig;
    security: SecurityConfig;
    globals: GlobalsConfig;
    models: ModelsConfig;
    orm: OrmConfig;
    policies: PoliciesConfig;
    session: SessionConfigOrDisabled;
    views: ViewsConfig;
    routes: RoutesConfig;
    bootstrap: BootstrapConfig;

    // Feature configs
    queue: QueueConfig;
    storage: StorageConfig;
    orcid: OrcidConfig;
    mint: MintConfig;
    jsonld: JsonLdConfig;
    emailnotification: EmailNotificationConfig;
    agendaQueue: AgendaQueueConfig;
    crontab: CrontabConfig;
    solr: SolrSearchConfig;
    form: FormConfig;
    webpack: WebpackConfig;

    // Security configs
    csp: ContentSecurityPolicyConfig;
    dompurify: DomPurifyConfig;


    // Complex/Large configs
    branding: BrandingConfig;
    brandingConfigurationDefaults: BrandingConfigurationDefaultsConfig;
    raid: RaidConfig;
    reports: ReportsConfig;
    figshareAPI: FigshareApiConfig;
    figshareReDBoxFORMapping: FigshareReDBoxFORMappingConfig;
    recordtype: RecordTypeConfig;
    workflow: WorkflowConfig;

    // Miscellaneous configs
    autoreload: AutoreloadConfig;
    custom: CustomConfig;
    dynamicconfig: DynamicConfigConfig;
    dashboardtype: DashboardTypeConfig;
    datapubs: DataPubsConfig;
    workspacetype: WorkspaceTypeConfig;
    lognamespace: LogNamespaceConfig;
    redboxToCkan: RedboxToCkanConfig;
    figshareAPIEnv: FigshareApiEnvConfig;
    typescript: TypeScriptHookConfig;
    custom_cache: CustomCacheConfig;
    validators: ValidatorsConfig;

    // Auth-related configs
    auth: AuthConfig;
    passport: PassportConfig;

    // Runtime/function configs
    brandingAware: BrandingAwareFunction;

    // Legacy/runtime flags
    angularDev?: string | boolean;
    workspacetype_services?: string[];

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
    http,
    i18n,
    search,
    namedQuery,
    action,
    dynamicasset,
    peopleSearch,
    reusableFormDefinitions,
    log,
    ng2,
    webpack,
    // Auth config
    auth,
    // Sails core configs with default values
    blueprints,
    cors,
    security,
    globals,
    datastores,
    models,
    orm,
    session,
    views,
    routes,
    policies,
    // Feature configs with default values
    queue,
    storage,
    orcid,
    mint,
    jsonld,
    emailnotification,
    agendaQueue,
    crontab,
    solr,
    // Security configs with default values
    csp,
    dompurify,
    // Miscellaneous configs with default values
    autoreload,
    custom,
    dynamicconfig,
    dashboardtype,
    datapubs,
    workspacetype,
    lognamespace,
    redboxToCkan,
    figshareAPIEnv,
    typescript,
    custom_cache,
    redboxSession,
    brandingConfigurationDefaults,
    reports,
    branding,
    raid,
    recordtype,
    workflow,
    figshareAPI,
    figshareReDBoxFORMapping,
    validators,
} as const;

// Type for the Config object
export type ConfigType = typeof Config;
