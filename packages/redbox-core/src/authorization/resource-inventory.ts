/**
 * Maintained Phase 0 resource operation inventory.
 *
 * Code-backed companion to
 * `support/wiki/Authorization-Resource-Gate-Inventory.md`. Each row names a
 * concrete service/controller operation so
 * `test/authorization/resource-inventory.test.ts` can reconcile the inventory
 * exactly against the implementation: ID-only reads remain internal storage
 * primitives, brand-bearing writes carry the request brand, list/search/export
 * paths apply the brand predicate, internal jobs carry an immutable authority
 * envelope, and vocabulary import/sync/export run through the authorized
 * vocabulary wrapper plus the Figshare brand contract (no dedicated
 * `importAuthorized`/`syncAuthorized`/`exportAuthorized` methods).
 */

export type ResourceOperationClassification =
  | 'brand-bearing'
  | 'id-only-internal'
  | 'list-search-export'
  | 'internal-job'
  | 'vocabulary-export-adapter';

export interface ResourceOperationInventoryRow {
  readonly family: string;
  readonly service: string;
  readonly operation: string;
  readonly classification: ResourceOperationClassification;
  readonly notes: string;
}

export const RESOURCE_FAMILIES: readonly string[] = Object.freeze([
  'active-deleted-records',
  'record-acl-search-storage-exports',
  'attachments-audit-related-integration-audit-schemas-forms',
  'vocabularies-entries',
  'figshare-rva-state-crosswalks',
  'forms-record-types-workflows',
  'dashboard-types-config',
  'reports-exports',
  'named-queries',
  'app-navigation-config',
  'branding-assets',
  'translation-bundles',
  'harvest-integration-state',
  'user-management-linking',
  'user-jobs-async-progress',
  'websocket-events',
  'hook-entities',
]);

/**
 * Explicitly excluded operations: exported/prototype members that are not
 * brand-owned resource operations, with the reason recorded so the
 * bidirectional reconciliation in
 * `test/authorization/resource-inventory.test.ts` fails on silent additions.
 */
export interface ResourceExcludedOperation {
  readonly operation: string;
  readonly reason: string;
}

export const RESOURCE_EXCLUDED_OPERATIONS: readonly ResourceExcludedOperation[] = Object.freeze([
  Object.freeze({
    operation: 'VocabularyService#convertToType',
    reason: 'Inherited Core.Service utility, not a vocabulary operation.',
  }),
  Object.freeze({
    operation: 'AsynchController#index',
    reason: 'Pure view render (sendView asynch/index); no resource read or write.',
  }),
  Object.freeze({
    operation: 'AsynchController#unsubscribe',
    reason: 'Socket room teardown only (sails.sockets.leave); no resource authority.',
  }),
  // Inherited service utilities: present on every service export surface.
  ...[
    'RecordsService',
    'UsersService',
    'AsynchsService',
    'ReportsService',
    'NamedQueryService',
    'AppConfigService',
    'BrandingService',
    'HarvestRunService',
    'IntegrationAuditService',
    'FormsService',
    'RecordTypesService',
    'WorkflowStepsService',
    'DashboardConfigService',
    'DashboardTypesService',
    'FigshareVocabularyService',
    'SolrSearchService',
  ].map(service =>
    Object.freeze({
      operation: `${service}#convertToType`,
      reason: 'Inherited Core.Service DTO utility, not a resource operation.',
    })
  ),
  // Service lifecycle hooks and readiness probes: no request handling.
  Object.freeze({
    operation: 'RecordsService#init',
    reason: 'Sails service lifecycle hook wiring storage and trigger services; no request handling.',
  }),
  Object.freeze({
    operation: 'IntegrationAuditService#init',
    reason: 'Inherited service lifecycle hook; no request handling.',
  }),
  Object.freeze({
    operation: 'SolrSearchService#init',
    reason: 'Inherited service lifecycle hook; no request handling.',
  }),
  Object.freeze({
    operation: 'RecordsService#checkRedboxRunning',
    reason: 'Storage-plugin readiness probe; reports configuration state, no resource authority.',
  }),
  Object.freeze({
    operation: 'RecordsService#transitionWorkflowStep',
    reason:
      'Deprecated stub that always throws, directing callers to the split metadata/trigger entries; retained in exports only.',
  }),
  // Static configuration reads: no brand-owned resource.
  Object.freeze({
    operation: 'NamedQueryService#getSupportedCollections',
    reason: 'Static sails.config.namedQuery collection-name read; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AppConfigService#registerConfigModel',
    reason: 'In-memory config-model registry write; no storage or brand-owned resource.',
  }),
  Object.freeze({
    operation: 'IntegrationAuditService#registerOutcomeMapper',
    reason: 'In-memory integration outcome-mapper registry; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'FormsService#listConfiguredRecordContractForms',
    reason: 'Static reusable-form-definition registry read; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'DashboardConfigService#getDefaultDashboardTableConfig',
    reason: 'Static default dashboard table config; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'DashboardTypesService#getDashboardView',
    reason: 'Static sails.config.dashboardview read; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'DashboardTypesService#getDashboardViewStep',
    reason: 'Static dashboard-view step read over sails.config.dashboardview; no brand-owned resource.',
  }),
  // Branding URL and routing helpers: presentation only, no resource authority.
  Object.freeze({
    operation: 'BrandingService#getBrandAndPortalPath',
    reason: 'Brand/portal URL path builder; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingService#getPortalFromReq',
    reason: 'Route portal parameter reader; routing presentation only, never brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingService#getFullPath',
    reason: 'Absolute application URL builder; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingService#getRootContext',
    reason: 'HTTP root-context config read; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingService#getFaviconUrl',
    reason: 'Favicon URL builder; presentation only, no resource authority.',
  }),
  // Controller lifecycle hooks: no request handling.
  ...[
    'RecordController#init',
    'RecordAuditController#init',
    'webservice/RecordController#init',
    'webservice/SearchController#init',
    'WorkspaceTypesController#init',
    'EmailController#init',
    'BrandingController#init',
    'webservice/RecordSchemaController#init',
  ].map(operation =>
    Object.freeze({
      operation,
      reason: 'Sails controller lifecycle hook wiring service handles; no request handling.',
    })
  ),
  // Pure view renders: route scope enforced upstream, no controller resource access.
  ...[
    'AdminController#harvestRunsIndex',
    'AdminController#rolesIndex',
    'AdminController#usersIndex',
    'AppConfigController#editAppConfig',
    'DashboardConfigController#editor',
    'NamedQueryController#editor',
    'ReportController#render',
    'RenderViewController#render',
    'UserController#login',
    'UserController#profile',
  ].map(operation =>
    Object.freeze({
      operation,
      reason: 'Pure view render (sendView); route scope enforced upstream, no controller resource read or write.',
    })
  ),
  // Public branding assets and API docs: no legacy PathRule grant, anonymous expectation.
  ...[
    'BrandingController#renderCss',
    'BrandingController#renderImage',
    'BrandingController#renderFavicon',
    'BrandingController#renderApiB',
    'BrandingController#renderSwaggerJSON',
    'BrandingController#renderSwaggerYAML',
    'BrandingController#renderPreviewCss',
    'BrandingController#createPreview',
    'DynamicAssetController#get',
  ].map(operation =>
    Object.freeze({
      operation,
      reason:
        'Public asset or API-doc render with no legacy PathRule grant; anonymous expectation, no brand-owned resource.',
    })
  ),
  // Pre-auth session and login handshakes: outside the authorized resource surface.
  ...[
    'UserController#openidConnectLogin',
    'UserController#aafLogin',
    'UserController#localLogin',
    'UserController#redirLogin',
    'UserController#redirPostLogin',
    'UserController#beginOidc',
  ].map(operation =>
    Object.freeze({
      operation,
      reason: 'Pre-auth login handshake; establishes the session, never reads or writes brand-owned resources.',
    })
  ),
  Object.freeze({
    operation: 'UserController#info',
    reason:
      'Authenticated session introspection returning the request principal without token; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'UserController#getPostLoginUrl',
    reason: 'Post-login redirect URL builder; routing helper with no resource authority.',
  }),
  Object.freeze({
    operation: 'UserController#respond',
    reason: 'Inherited deprecated ajax/normal response dispatcher; no resource authority.',
  }),
  // Infrastructure dispatch: notification delivery and generic action fan-out carry no brand-owned resource.
  Object.freeze({
    operation: 'EmailController#sendNotification',
    reason: 'Outbound notification dispatch via the email service; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'webservice/AuthorizationController#getReadiness',
    reason: 'Rollout readiness report over authorization inventories; deployment state only, no brand-owned resource.',
  }),
  // Phase 0.5 deterministic service discovery: every export of every
  // production service module must be inventoried or explicitly excluded, so
  // newly added services and operations fail reconciliation until classified.
  // The entries below cover non-resource service surfaces (infrastructure,
  // integration dispatch, pure helpers, and authorization-operation plumbing)
  // at service granularity; brand-owned resource operations live in
  // RESOURCE_OPERATION_INVENTORY above.
  // AgendaQueueService: Background job-queue plumbing; no brand-owned resource read or write.
  Object.freeze({
    operation: 'AgendaQueueService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#defineJob',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#every',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#init',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#jobs',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#moveCompletedJobsToHistory',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#now',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#sampleFunctionToDemonstrateHowToDefineAJobFunction',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'AgendaQueueService#schedule',
    reason: 'Background job-queue plumbing; no brand-owned resource read or write.',
  }),
  // AttachmentMetadataService: Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.
  Object.freeze({
    operation: 'AttachmentMetadataService#authorizeStagingCleanup',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#beginStagingCleanup',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#claimExpiredStagingCleanup',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#completeStagingCleanup',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#deleteByStorageKey',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#findByOid',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#findOneByStorageKey',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#findUnresolvedByOid',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#findUnresolvedByStagingFileId',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#hasCleanupClaim',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#markDeleted',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#markMutation',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#prepareMutations',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#rebindOid',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#recordAccess',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#recoverStagingCleanup',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#releaseStagingCleanup',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'AttachmentMetadataService#upsert',
    reason:
      'Attachment staging metadata helpers invoked within authorized record flows; no independent brand authority.',
  }),
  // AuthorizationAuditService: Authorization audit event plumbing; attempt telemetry only, no brand-owned resource.
  Object.freeze({
    operation: 'AuthorizationAuditService#applyRetention',
    reason: 'Authorization audit event plumbing; attempt telemetry only, no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationAuditService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationAuditService#createSucceededEvent',
    reason: 'Authorization audit event plumbing; attempt telemetry only, no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationAuditService#createSucceededEventOnce',
    reason: 'Authorization audit event plumbing; attempt telemetry only, no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationAuditService#probeTransactions',
    reason: 'Authorization audit event plumbing; attempt telemetry only, no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationAuditService#queryEvents',
    reason: 'Authorization audit event plumbing; attempt telemetry only, no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationAuditService#recordAttempt',
    reason: 'Authorization audit event plumbing; attempt telemetry only, no brand-owned resource.',
  }),
  // AuthorizationBootstrapService: Authorization bootstrap seeding; no request path.
  Object.freeze({
    operation: 'AuthorizationBootstrapService#bootstrap',
    reason: 'Authorization bootstrap seeding; no request path.',
  }),
  Object.freeze({
    operation: 'AuthorizationBootstrapService#recoverSystemAdministrator',
    reason: 'Non-HTTP operator recovery for a lost system administrator; no request path.',
  }),
  Object.freeze({
    operation: 'AuthorizationBootstrapService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  // AuthorizationConfigurationService: Authorization configuration export helper; no brand-owned resource.
  Object.freeze({
    operation: 'AuthorizationConfigurationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationConfigurationService#exportConfiguration',
    reason: 'Authorization configuration export helper; no brand-owned resource.',
  }),
  // AuthorizationMigrationService: Authorization migration and drift-report tooling; no request resource authority.
  Object.freeze({
    operation: 'AuthorizationMigrationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationMigrationService#migrateUserAssignments',
    reason: 'Authorization migration and drift-report tooling; no request resource authority.',
  }),
  Object.freeze({
    operation: 'AuthorizationMigrationService#reconcileBrandRoles',
    reason: 'Authorization migration and drift-report tooling; no request resource authority.',
  }),
  Object.freeze({
    operation: 'AuthorizationMigrationService#reportDrift',
    reason: 'Authorization migration and drift-report tooling; no request resource authority.',
  }),
  Object.freeze({
    operation: 'AuthorizationMigrationService#run',
    reason: 'Authorization migration and drift-report tooling; no request resource authority.',
  }),
  // AuthorizationPersistenceService: Authorization assignment persistence plumbing behind the guarded writers; no direct brand authority.
  Object.freeze({
    operation: 'AuthorizationPersistenceService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationPersistenceService#createRoleAssignment',
    reason: 'Authorization assignment persistence plumbing behind the guarded writers; no direct brand authority.',
  }),
  Object.freeze({
    operation: 'AuthorizationPersistenceService#init',
    reason: 'Authorization assignment persistence plumbing behind the guarded writers; no direct brand authority.',
  }),
  // AuthorizationReadinessService: Rollout readiness reporting; deployment state only, no brand-owned resource.
  Object.freeze({
    operation: 'AuthorizationReadinessService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationReadinessService#getOperatorReport',
    reason: 'Rollout readiness reporting; deployment state only, no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationReadinessService#getReport',
    reason: 'Rollout readiness reporting; deployment state only, no brand-owned resource.',
  }),
  // AuthorizationRolloutService: Rollout request evaluation against route configuration; no brand-owned resource.
  Object.freeze({
    operation: 'AuthorizationRolloutService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationRolloutService#evaluateRequest',
    reason: 'Rollout request evaluation against route configuration; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationRolloutService#validateRouteConfiguration',
    reason: 'Rollout request evaluation against route configuration; no brand-owned resource.',
  }),
  // AuthorizationScopeService: Authorization scope catalog plumbing; no brand-owned resource.
  Object.freeze({
    operation: 'AuthorizationScopeService#bootstrap',
    reason: 'Authorization scope catalog plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationScopeService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationScopeService#getRegistry',
    reason: 'Authorization scope catalog plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationScopeService#getTemplateRevision',
    reason: 'Authorization scope catalog plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationScopeService#listCatalog',
    reason: 'Authorization scope catalog plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationScopeService#listTemplates',
    reason: 'Authorization scope catalog plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationScopeService#reconcileDeclaredCatalog',
    reason: 'Authorization scope catalog plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'AuthorizationScopeService#reconcileOrphans',
    reason: 'Authorization scope catalog plumbing; no brand-owned resource.',
  }),
  // AuthorizationService: Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.
  Object.freeze({
    operation: 'AuthorizationService#authorizeAction',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#authorizeBrandEntity',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#authorizeRecord',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#explainDecision',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#getEffectiveRoles',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#getEffectiveScopes',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#hasScope',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#resolveRequestContext',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'AuthorizationService#resolveUserContext',
    reason:
      'Authorization decision primitives resolving request context; authorization-operation surface, not a brand-owned resource operation.',
  }),
  // BrandingLogoService: Branding logo binary cache and storage helpers; presentation assets only, no brand authority.
  Object.freeze({
    operation: 'BrandingLogoService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#extForContentType',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#faviconStorageKey',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getBinary',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getBinaryAsync',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getCacheTtlMs',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getCurrentFaviconBinary',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getFaviconMaxBytes',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getFromCache',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getLegacyGridFsBinary',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#getMaxBytes',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#isLegacyGridFsObjectId',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#isStorageNotFoundError',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#isSvg',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#logoStorageKey',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#pruneExpiredEntries',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#putFavicon',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#putLogo',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#sanitizeAndValidate',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#scheduleSupersededFaviconCleanup',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  Object.freeze({
    operation: 'BrandingLogoService#setCache',
    reason: 'Branding logo binary cache and storage helpers; presentation assets only, no brand authority.',
  }),
  // BrandingThemeCssService: Branding theme CSS variable plumbing; presentation only, no resource authority.
  Object.freeze({
    operation: 'BrandingThemeCssService#buildCompatibilityCss',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#buildRootCss',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#generate',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#getAllowedVariableKeys',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#getVariableValue',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#normalizeHex',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#normalizeVariables',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#resolveToken',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  Object.freeze({
    operation: 'BrandingThemeCssService#validateVariables',
    reason: 'Branding theme CSS variable plumbing; presentation only, no resource authority.',
  }),
  // CacheService: Ephemeral cache get/set plus static asset hash; no brand-owned resource.
  Object.freeze({
    operation: 'CacheService#bootstrap',
    reason: 'Ephemeral cache get/set plus static asset hash; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'CacheService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'CacheService#get',
    reason: 'Ephemeral cache get/set plus static asset hash; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'CacheService#getNgAppFileHash',
    reason: 'Ephemeral cache get/set plus static asset hash; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'CacheService#set',
    reason: 'Ephemeral cache get/set plus static asset hash; no brand-owned resource.',
  }),
  // ConfigService: Static configuration readers; no brand-owned resource.
  Object.freeze({
    operation: 'ConfigService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'ConfigService#getBrand',
    reason: 'Static configuration readers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'ConfigService#mergeHookConfig',
    reason: 'Static configuration readers; no brand-owned resource.',
  }),
  // ContrastService: Pure color-contrast math helpers; no resource authority.
  Object.freeze({
    operation: 'ContrastService#calculateRatio',
    reason: 'Pure color-contrast math helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'ContrastService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'ContrastService#getLuminance',
    reason: 'Pure color-contrast math helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'ContrastService#suggestCompliant',
    reason: 'Pure color-contrast math helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'ContrastService#validate',
    reason: 'Pure color-contrast math helpers; no resource authority.',
  }),
  // DoiService: External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.
  Object.freeze({
    operation: 'DoiService#addDoiDataToRecord',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#changeDoiState',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'DoiService#deleteDoi',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#getAuthenticationString',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#init',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#lookupDataciteDois',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#publishDoi',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#publishDoiTrigger',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#publishDoiTriggerSync',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'DoiService#updateDoiTriggerSync',
    reason: 'External DOI integration dispatch; runs inside authorized record flows, no independent brand authority.',
  }),
  // DomSanitizerService: Pure HTML/SVG sanitization helpers; no resource authority.
  Object.freeze({
    operation: 'DomSanitizerService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'DomSanitizerService#getDOMPurifyConfig',
    reason: 'Pure HTML/SVG sanitization helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'DomSanitizerService#getMaxBytes',
    reason: 'Pure HTML/SVG sanitization helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'DomSanitizerService#inspectSvgStructure',
    reason: 'Pure HTML/SVG sanitization helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'DomSanitizerService#sanitize',
    reason: 'Pure HTML/SVG sanitization helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'DomSanitizerService#sanitizeWithProfile',
    reason: 'Pure HTML/SVG sanitization helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'DomSanitizerService#validateHrefAttributes',
    reason: 'Pure HTML/SVG sanitization helpers; no resource authority.',
  }),
  // EmailService: Outbound email dispatch and template rendering; no brand-owned resource read or write.
  Object.freeze({
    operation: 'EmailService#buildFromTemplate',
    reason: 'Outbound email dispatch and template rendering; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'EmailService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'EmailService#evaluateProperties',
    reason: 'Outbound email dispatch and template rendering; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'EmailService#runTemplate',
    reason: 'Outbound email dispatch and template rendering; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'EmailService#sendMessage',
    reason: 'Outbound email dispatch and template rendering; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'EmailService#sendRecordNotification',
    reason: 'Outbound email dispatch and template rendering; no brand-owned resource read or write.',
  }),
  Object.freeze({
    operation: 'EmailService#sendTemplate',
    reason: 'Outbound email dispatch and template rendering; no brand-owned resource read or write.',
  }),
  // FigshareService: External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.
  Object.freeze({
    operation: 'FigshareService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'FigshareService#createUpdateFigshareArticle',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#deleteFilesFromRedbox',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#deleteFilesFromRedboxTrigger',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#init',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#preparePublication',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#publishAfterUploadFilesJob',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#publishIfNeeded',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#queueDeleteFiles',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#queuePublishAfterUploadFiles',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#syncAssets',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#syncEmbargo',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#syncMetadata',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#syncRecordWithFigshare',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#transitionRecordWorkflowFromFigshareArticlePropertiesJob',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#uploadFilesToFigshareArticle',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FigshareService#writeBack',
    reason: 'External Figshare integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  // FormPayloadPrehydrateService: Form payload prehydration helpers invoked within authorized record flows; no independent brand authority.
  Object.freeze({
    operation: 'FormPayloadPrehydrateService#build',
    reason: 'Form payload prehydration helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FormPayloadPrehydrateService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'FormPayloadPrehydrateService#extractTargets',
    reason: 'Form payload prehydration helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'FormPayloadPrehydrateService#resolveVocabTrees',
    reason: 'Form payload prehydration helpers invoked within authorized record flows; no independent brand authority.',
  }),
  // FormRecordConsistencyService: Pure form/record merge and schema-build helpers; carry no brand authority.
  Object.freeze({
    operation: 'FormRecordConsistencyService#arrayStartsWithArray',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#buildDataModelDefaultForFormConfig',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#buildSchemaForFormConfig',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#compareRecords',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#extractRawTemplates',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#mergeRecord',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#mergeRecordClientFormConfig',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#mergeRecordMetadataPermitted',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#projectMetadataClientFormConfig',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#stripModelValuesFromFormConfig',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#toKeysEntries',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  Object.freeze({
    operation: 'FormRecordConsistencyService#validateRecordValuesForFormConfig',
    reason: 'Pure form/record merge and schema-build helpers; carry no brand authority.',
  }),
  // FormVocabularyService: External vocabulary lookup helpers; no brand-owned resource.
  Object.freeze({
    operation: 'FormVocabularyService#buildNamedQueryParamMap',
    reason: 'External vocabulary lookup helpers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'FormVocabularyService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'FormVocabularyService#findInExternalService',
    reason: 'External vocabulary lookup helpers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'FormVocabularyService#findInServiceLookup',
    reason: 'External vocabulary lookup helpers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'FormVocabularyService#findRecords',
    reason: 'External vocabulary lookup helpers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'FormVocabularyService#getResultObjectMappings',
    reason: 'External vocabulary lookup helpers; no brand-owned resource.',
  }),
  // I18nEntriesService: Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.
  Object.freeze({
    operation: 'I18nEntriesService#addMissingDefaultEntriesFromBundle',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#bootstrap',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#buildUid',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#composeNamespace',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#deleteEntry',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#flatten',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#getBundle',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#getEntry',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#getLanguageDisplayName',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#listBundles',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#listEntries',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#loadCentralizedMeta',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#loadLanguageNames',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#normalizeContentFormat',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#removeNested',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#resolveBrandingId',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#sanitizeTranslationValue',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#setBundle',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#setEntry',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#setNested',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#syncEntriesFromBundle',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#unflatten',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'I18nEntriesService#updateBundleEnabled',
    reason:
      'Translation entry tree helpers invoked through the authorized translation wrapper; no independent brand authority.',
  }),
  // IntegrationNotificationService: Outbound integration notification dispatch; no brand-owned resource.
  Object.freeze({
    operation: 'IntegrationNotificationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'IntegrationNotificationService#dispatch',
    reason: 'Outbound integration notification dispatch; no brand-owned resource.',
  }),
  // NavigationService: Static navigation and menu configuration resolvers; no brand-owned resource.
  Object.freeze({
    operation: 'NavigationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'NavigationService#getDefaultAdminSidebarConfig',
    reason: 'Static navigation and menu configuration resolvers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'NavigationService#getDefaultHomePanelConfig',
    reason: 'Static navigation and menu configuration resolvers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'NavigationService#getDefaultMenuConfig',
    reason: 'Static navigation and menu configuration resolvers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'NavigationService#resolveAdminSidebar',
    reason: 'Static navigation and menu configuration resolvers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'NavigationService#resolveHomePanels',
    reason: 'Static navigation and menu configuration resolvers; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'NavigationService#resolveMenu',
    reason: 'Static navigation and menu configuration resolvers; no brand-owned resource.',
  }),
  // OniService: External ONI integration dispatch; no independent brand authority.
  Object.freeze({
    operation: 'OniService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'OniService#exportDataset',
    reason: 'External ONI integration dispatch; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'OniService#getConfig',
    reason: 'External ONI integration dispatch; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'OniService#init',
    reason: 'External ONI integration dispatch; no independent brand authority.',
  }),
  // OrcidService: External ORCID lookup; no brand-owned resource.
  Object.freeze({
    operation: 'OrcidService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'OrcidService#searchOrcid',
    reason: 'External ORCID lookup; no brand-owned resource.',
  }),
  // PathRulesService: Legacy path-rule evaluation primitives; carry no brand-owned resource themselves.
  Object.freeze({
    operation: 'PathRulesService#bootstrap',
    reason: 'Legacy path-rule evaluation primitives; carry no brand-owned resource themselves.',
  }),
  Object.freeze({
    operation: 'PathRulesService#canRead',
    reason: 'Legacy path-rule evaluation primitives; carry no brand-owned resource themselves.',
  }),
  Object.freeze({
    operation: 'PathRulesService#canWrite',
    reason: 'Legacy path-rule evaluation primitives; carry no brand-owned resource themselves.',
  }),
  Object.freeze({
    operation: 'PathRulesService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'PathRulesService#getRulesFromPath',
    reason: 'Legacy path-rule evaluation primitives; carry no brand-owned resource themselves.',
  }),
  // RDMPService: Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.
  Object.freeze({
    operation: 'RDMPService#addWorkspaceToRecord',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#assignPermissions',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#checkTotalSizeOfFilesInRecord',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#complexAssignPermissions',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'RDMPService#init',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#processRecordCounters',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#queueTriggerCall',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#queuedTriggerSubscriptionHandler',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#removeWorkspaceFromRecord',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#restoreUserBasedPermissions',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#runTemplates',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RDMPService#stripUserBasedPermissions',
    reason: 'Legacy record-permission batch helpers invoked within authorized flows; no independent brand authority.',
  }),
  // RaidService: External RAID integration dispatch; runs inside authorized flows, no independent brand authority.
  Object.freeze({
    operation: 'RaidService#buildContribVal',
    reason: 'External RAID integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RaidService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'RaidService#getContributors',
    reason: 'External RAID integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RaidService#mintPostCreateRetryHandler',
    reason: 'External RAID integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RaidService#mintRetryJob',
    reason: 'External RAID integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RaidService#mintTrigger',
    reason: 'External RAID integration dispatch; runs inside authorized flows, no independent brand authority.',
  }),
  // RecordSchemaService: Record schema resolution helpers invoked within authorized record flows; no independent brand authority.
  Object.freeze({
    operation: 'RecordSchemaService#bootstrap',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#bootstrapIntegrationPins',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#init',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#materializeIntegrationPins',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#persistSaveUsageReference',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#reportRetention',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#resolveCreate',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#resolveImmutable',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#resolveUpdate',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RecordSchemaService#validateResolvedArtifact',
    reason: 'Record schema resolution helpers invoked within authorized record flows; no independent brand authority.',
  }),
  // RecordValidationService: Record validation and shadow-report diagnostics; no brand-owned resource.
  Object.freeze({
    operation: 'RecordValidationService#clearCaches',
    reason: 'Record validation and shadow-report diagnostics; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'RecordValidationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'RecordValidationService#discoverOperations',
    reason: 'Record validation and shadow-report diagnostics; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'RecordValidationService#getCacheStats',
    reason: 'Record validation and shadow-report diagnostics; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'RecordValidationService#getShadowReport',
    reason: 'Record validation and shadow-report diagnostics; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'RecordValidationService#registerMetricsHooks',
    reason: 'Record validation and shadow-report diagnostics; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'RecordValidationService#resolve',
    reason: 'Record validation and shadow-report diagnostics; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'RecordValidationService#resolveContractContext',
    reason: 'Record validation and shadow-report diagnostics; no brand-owned resource.',
  }),
  // RoleAdministrationService: Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.
  Object.freeze({
    operation: 'RoleAdministrationService#applyBulkAssignments',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#applyBulkTemplateUpgrade',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#applyConfigurationImport',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#applyRoleScopes',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#applyRoleTemplateUpgrade',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#applyScopeAdoption',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#createRole',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#deleteRole',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#getRole',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#grantAssignment',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#inactivateRole',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#listAssignments',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#listRoles',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewBulkAssignments',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewBulkTemplateUpgrade',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewConfigurationImport',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewRoleDeletion',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewRoleInactivation',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewRoleScopes',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewRoleTemplateUpgrade',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewScopeAdoption',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#previewTemplateRevision',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#publishTemplateRevision',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#replaceExternalAssignments',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#revokeAssignment',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#suppressAssignment',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#unsuppressAssignment',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RoleAdministrationService#updateRole',
    reason:
      'Authorization contract writers and previews; authorization-operation surface, not a brand-owned resource operation.',
  }),
  // RolesService: Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.
  Object.freeze({
    operation: 'RolesService#bootstrap',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getAdmin',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getAdminFromBrand',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getAdminFromRoles',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getDefAuthenticatedRole',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getDefUnathenticatedRole',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getRole',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getRoleByName',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getRoleIds',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getRoleWithName',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  Object.freeze({
    operation: 'RolesService#getRolesWithBrand',
    reason:
      'Role lookup plumbing behind the guarded writers; authorization-operation surface, not a brand-owned resource operation.',
  }),
  // RvaImportService: External RVA import dispatch through the authorized vocabulary wrapper; no independent brand authority.
  Object.freeze({
    operation: 'RvaImportService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'RvaImportService#importRvaVocabulary',
    reason: 'External RVA import dispatch through the authorized vocabulary wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RvaImportService#searchRva',
    reason: 'External RVA import dispatch through the authorized vocabulary wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'RvaImportService#syncRvaVocabulary',
    reason: 'External RVA import dispatch through the authorized vocabulary wrapper; no independent brand authority.',
  }),
  // SassCompilerService: Sass compilation helpers; presentation build only, no resource authority.
  Object.freeze({
    operation: 'SassCompilerService#compile',
    reason: 'Sass compilation helpers; presentation build only, no resource authority.',
  }),
  Object.freeze({
    operation: 'SassCompilerService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'SassCompilerService#getAllowedVariableKeys',
    reason: 'Sass compilation helpers; presentation build only, no resource authority.',
  }),
  Object.freeze({
    operation: 'SassCompilerService#normalizeHex',
    reason: 'Sass compilation helpers; presentation build only, no resource authority.',
  }),
  Object.freeze({
    operation: 'SassCompilerService#validateVariables',
    reason: 'Sass compilation helpers; presentation build only, no resource authority.',
  }),
  // StandardDatastreamService: Datastream storage helpers invoked within authorized record flows; no independent brand authority.
  Object.freeze({
    operation: 'StandardDatastreamService#addAndRemoveDatastreams',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#addDatastream',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#addDatastreams',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#getDatastream',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#listDatastreams',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#removeDatastream',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#removeStagedDatastream',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#stagingDatastreamExists',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'StandardDatastreamService#updateDatastream',
    reason: 'Datastream storage helpers invoked within authorized record flows; no independent brand authority.',
  }),
  // StorageManagerService: Storage disk configuration plumbing; no brand-owned resource.
  Object.freeze({
    operation: 'StorageManagerService#bootstrap',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#disk',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#getDiskConfig',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#getMergedStorageConfig',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#getStagingDiskConfig',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#init',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#isBootstrapped',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#primaryDisk',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'StorageManagerService#stagingDisk',
    reason: 'Storage disk configuration plumbing; no brand-owned resource.',
  }),
  // TemplateService: Pure client template and mapping builders; no resource authority.
  Object.freeze({
    operation: 'TemplateService#buildClientHandlebars',
    reason: 'Pure client template and mapping builders; no resource authority.',
  }),
  Object.freeze({
    operation: 'TemplateService#buildClientJsonata',
    reason: 'Pure client template and mapping builders; no resource authority.',
  }),
  Object.freeze({
    operation: 'TemplateService#buildClientMapping',
    reason: 'Pure client template and mapping builders; no resource authority.',
  }),
  Object.freeze({
    operation: 'TemplateService#buildKeyString',
    reason: 'Pure client template and mapping builders; no resource authority.',
  }),
  Object.freeze({
    operation: 'TemplateService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  // TranslationService: i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.
  Object.freeze({
    operation: 'TranslationService#bootstrap',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TranslationService#clearInstances',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TranslationService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'TranslationService#getAvailableLanguagesForBranding',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TranslationService#getI18nextForBranding',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TranslationService#handle',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TranslationService#reloadResources',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TranslationService#t',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TranslationService#tInter',
    reason: 'i18next instance plumbing behind the authorized translation wrapper; no independent brand authority.',
  }),
  // TriggerService: Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.
  Object.freeze({
    operation: 'TriggerService#applyFieldLevelPermissions',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TriggerService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'TriggerService#runHooksSync',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TriggerService#runTemplatesOnRelatedRecord',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TriggerService#transitionWorkflow',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TriggerService#userHasRoleEditPermission',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TriggerService#validateFieldMapUsingRegex',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TriggerService#validateFieldUsingRegex',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'TriggerService#validateFieldsUsingTemplate',
    reason:
      'Record trigger and field-validation helpers invoked within authorized flows; no independent brand authority.',
  }),
  // ViewUtilsService: Pure view display helpers; no resource authority.
  Object.freeze({
    operation: 'ViewUtilsService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'ViewUtilsService#displayValue',
    reason: 'Pure view display helpers; no resource authority.',
  }),
  Object.freeze({
    operation: 'ViewUtilsService#resolvePartialPath',
    reason: 'Pure view display helpers; no resource authority.',
  }),
  // WorkspaceAsyncService: Workspace async-job plumbing within the job authority envelope; no independent brand authority.
  Object.freeze({
    operation: 'WorkspaceAsyncService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'WorkspaceAsyncService#loop',
    reason: 'Workspace async-job plumbing within the job authority envelope; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceAsyncService#pending',
    reason: 'Workspace async-job plumbing within the job authority envelope; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceAsyncService#start',
    reason: 'Workspace async-job plumbing within the job authority envelope; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceAsyncService#status',
    reason: 'Workspace async-job plumbing within the job authority envelope; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceAsyncService#update',
    reason: 'Workspace async-job plumbing within the job authority envelope; no independent brand authority.',
  }),
  // WorkspaceService: Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.
  Object.freeze({
    operation: 'WorkspaceService#addWorkspaceToRecord',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#createWorkspaceInfo',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#createWorkspaceRecord',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#getRecordMeta',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#getWorkspaces',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#infoFormUserId',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#mapToRecord',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#provisionerUser',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#removeAppFromUserId',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#removeWorkspaceFromRecord',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#updateRecordMeta',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#updateWorkspaceInfo',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#userInfo',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  Object.freeze({
    operation: 'WorkspaceService#workspaceAppFromUserId',
    reason: 'Workspace provisioning helpers invoked within authorized record flows; no independent brand authority.',
  }),
  // WorkspaceTypesService: Workspace-type configuration reads; no brand-owned resource.
  Object.freeze({
    operation: 'WorkspaceTypesService#bootstrap',
    reason: 'Workspace-type configuration reads; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'WorkspaceTypesService#convertToType',
    reason: 'Inherited Core.Service DTO utility, not a resource operation.',
  }),
  Object.freeze({
    operation: 'WorkspaceTypesService#create',
    reason: 'Workspace-type configuration reads; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'WorkspaceTypesService#get',
    reason: 'Workspace-type configuration reads; no brand-owned resource.',
  }),
  Object.freeze({
    operation: 'WorkspaceTypesService#getOne',
    reason: 'Workspace-type configuration reads; no brand-owned resource.',
  }),
]);

export const RESOURCE_OPERATION_INVENTORY: readonly ResourceOperationInventoryRow[] = Object.freeze([
  // Active and deleted records: brand-bearing reads/writes.
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getAuthorizedMeta',
    classification: 'brand-bearing',
    notes: 'Record read resolves parent record with route capability, brand, and ACL.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getAuthorizedDeletedRecordMeta',
    classification: 'brand-bearing',
    notes: 'Deleted-record read uses the same brand plus ACL composition.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'authorizeRecordCollection',
    classification: 'list-search-export',
    notes: 'Collection reads apply the brand predicate before pagination/search/count/export.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getMeta',
    classification: 'id-only-internal',
    notes: 'ID-only storage primitive; controllers must use getAuthorizedMeta with brand context.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getDeletedRecordMeta',
    classification: 'id-only-internal',
    notes: 'ID-only deleted-record primitive; authorized wrapper owns brand/ACL.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getRecords',
    classification: 'list-search-export',
    notes: 'List path; brand predicate required before pagination.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'searchFuzzy',
    classification: 'list-search-export',
    notes: 'Search path; same effective keys and brand predicate as direct reads.',
  },
  // Record ACL / storage / Solr / exports share the same keys.
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'searchFuzzy',
    classification: 'list-search-export',
    notes: 'Solr filters receive the same effective role keys and brand predicate.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'exportAllPlans',
    classification: 'list-search-export',
    notes: 'Export execution applies record collection plus ACL filtering.',
  },
  // Attachments / audit / related / integration audit / schemas.
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordsService',
    operation: 'getAttachments',
    classification: 'brand-bearing',
    notes: 'Record-adjacent read resolves the parent record first.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordsService',
    operation: 'getRelatedRecords',
    classification: 'brand-bearing',
    notes: 'Related-record read resolves the parent record first.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordsService',
    operation: 'getRecordAudit',
    classification: 'brand-bearing',
    notes: 'Audit read resolves the parent record first.',
  },
  // Vocabularies and entries: authorized wrappers plus internal primitives.
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'listAuthorized',
    classification: 'brand-bearing',
    notes: 'Brand-authorized vocabulary list.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getAuthorizedByIdOrSlug',
    classification: 'brand-bearing',
    notes: 'ID/slug read constrained to the active brand.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'createAuthorized',
    classification: 'brand-bearing',
    notes: 'Create derives brand from context; payload branding ignored.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'updateAuthorized',
    classification: 'brand-bearing',
    notes: 'Update preserves stored brand; cannot transfer ownership.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'deleteAuthorized',
    classification: 'brand-bearing',
    notes: 'Delete constrained to the active brand.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'reorderEntriesAuthorized',
    classification: 'brand-bearing',
    notes: 'Reorder runs after the parent vocabulary passes its authorized wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getAuthorizedTree',
    classification: 'brand-bearing',
    notes: 'Tree read runs through the authorized wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'requireAuthorizedBrandOperation',
    classification: 'brand-bearing',
    notes: 'Explicit brand-operation gate for vocabulary mutations.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getById',
    classification: 'id-only-internal',
    notes: 'Raw ID-only primitive for authorized wrappers and background jobs only.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getByIdOrSlug',
    classification: 'id-only-internal',
    notes: 'Raw ID/slug primitive for authorized wrappers only.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getEntries',
    classification: 'id-only-internal',
    notes: 'Entry read accepts explicit brand/parent ID after parent authorization.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getChildren',
    classification: 'id-only-internal',
    notes:
      'Entry-child read constrained by explicit vocabulary ID; must run after the parent vocabulary passes its authorized wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getEntryByNotation',
    classification: 'id-only-internal',
    notes:
      'Entry lookup by notation constrained by explicit vocabulary ID; must run after the parent vocabulary passes its authorized wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getAncestorChain',
    classification: 'id-only-internal',
    notes:
      'Ancestor read constrained by explicit vocabulary/entry IDs; must run after the parent vocabulary passes its authorized wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'expandPaths',
    classification: 'id-only-internal',
    notes:
      'Path expansion over explicitly supplied entries; must run after the parent vocabulary passes its authorized wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'create',
    classification: 'id-only-internal',
    notes:
      'Raw create storage primitive for authorized wrappers and bootstrap only; controllers must use createAuthorized with context brand.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'update',
    classification: 'id-only-internal',
    notes: 'Raw update storage primitive for authorized wrappers only; controllers must use updateAuthorized.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'reorderEntries',
    classification: 'id-only-internal',
    notes: 'Raw reorder storage primitive for authorized wrappers only; controllers must use reorderEntriesAuthorized.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'delete',
    classification: 'id-only-internal',
    notes: 'Raw delete storage primitive for authorized wrappers only; controllers must use deleteAuthorized.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'assertMutableVocabulary',
    classification: 'id-only-internal',
    notes: 'Externally-managed mirror guard invoked by authorized wrappers before writes.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'normalizeEntry',
    classification: 'id-only-internal',
    notes: 'Pure entry normalization helper; carries no brand authority.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'validateParent',
    classification: 'id-only-internal',
    notes: 'Parent-cycle guard invoked with the authorized vocabulary ID.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'bootstrapData',
    classification: 'internal-job',
    notes: 'Bootstrap seeding from configured bootstrap files with default branding; no request path.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'getTree',
    classification: 'id-only-internal',
    notes: 'Raw tree primitive; must follow getAuthorizedTree parent check.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'upsertEntries',
    classification: 'id-only-internal',
    notes: 'Storage primitive for wrappers and background jobs only.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyService',
    operation: 'list',
    classification: 'id-only-internal',
    notes: 'Raw list primitive for wrappers and background jobs only.',
  },
  // Vocabulary import/sync/export have no dedicated Authorized methods.
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'manager',
    classification: 'brand-bearing',
    notes: 'Admin vocabulary manager view gated by requireAuthorizedBrandOperation before rendering.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'list',
    classification: 'brand-bearing',
    notes: 'UI list runs through listAuthorized with request context and scope.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'UI read runs through getAuthorizedTree with request context and scope.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'UI create runs through createAuthorized; payload branding is not authority.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'update',
    classification: 'brand-bearing',
    notes: 'UI update runs through updateAuthorized; stored brand is preserved.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'delete',
    classification: 'brand-bearing',
    notes: 'UI delete runs through deleteAuthorized constrained to the active brand.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'list',
    classification: 'brand-bearing',
    notes: 'API list runs through listAuthorized with request context and scope.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'API read runs through the authorized vocabulary wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'API create runs through createAuthorized; brand derives from context.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'update',
    classification: 'brand-bearing',
    notes: 'API update runs through updateAuthorized; stored brand is preserved.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'reorder',
    classification: 'brand-bearing',
    notes:
      'API reorder runs through reorderEntriesAuthorized after the parent vocabulary passes its authorized wrapper.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'delete',
    classification: 'brand-bearing',
    notes: 'API delete runs through deleteAuthorized constrained to the active brand.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'import',
    classification: 'vocabulary-export-adapter',
    notes: 'API import runs through the authorized vocabulary wrapper plus Figshare brand contract.',
  },
  {
    family: 'vocabularies-entries',
    service: 'webservice/VocabularyController',
    operation: 'sync',
    classification: 'vocabulary-export-adapter',
    notes: 'API sync runs through the authorized vocabulary wrapper plus Figshare brand contract.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'import',
    classification: 'vocabulary-export-adapter',
    notes: 'Import runs through the authorized vocabulary wrapper plus Figshare brand contract.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'sync',
    classification: 'vocabulary-export-adapter',
    notes: 'Sync runs through the authorized vocabulary wrapper plus Figshare brand contract.',
  },
  {
    family: 'vocabularies-entries',
    service: 'VocabularyController',
    operation: 'export',
    classification: 'vocabulary-export-adapter',
    notes:
      'No dedicated exportAuthorized method exists; export runs through the authorized vocabulary wrapper plus Figshare brand contract.',
  },
  // Figshare / RVA state and crosswalks carry explicit brand.
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'createPreview',
    classification: 'brand-bearing',
    notes: 'Catalogue/preview/apply carry explicit brand ID.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'applyPreview',
    classification: 'brand-bearing',
    notes: 'Apply carries explicit brand ID; payload brand is not authority.',
  },
  // Forms, record types, workflows.
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'getForm',
    classification: 'brand-bearing',
    notes: 'Form lookup supplies the active brand.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'Record-type lookup supplies the active brand.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'WorkflowStepsService',
    operation: 'getAllForRecordType',
    classification: 'brand-bearing',
    notes: 'Workflow steps reachable only through brand-constrained record type.',
  },
  // Dashboard types and config.
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getDashboardConfigInfo',
    classification: 'brand-bearing',
    notes: 'Dashboard config merges only the active brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'Dashboard type lookup uses explicit brand.',
  },
  // Reports and exports.
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'getResults',
    classification: 'brand-bearing',
    notes: 'Report execution uses brand-keyed identity plus record collection filtering.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'getCSVResult',
    classification: 'list-search-export',
    notes: 'CSV export path applies the same brand plus ACL filtering.',
  },
  // Named queries.
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'performNamedQueryFromConfig',
    classification: 'brand-bearing',
    notes: 'Named-query execution resolves config by active-brand key.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'list',
    classification: 'list-search-export',
    notes: 'Config list constrained by active brand.',
  },
  // App and navigation configuration.
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'getAppConfigurationForBrand',
    classification: 'brand-bearing',
    notes: 'Reads cannot select another brand through route/body data.',
  },
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'createOrUpdateConfig',
    classification: 'brand-bearing',
    notes: 'Create/update derives brand from request context.',
  },
  // Branding configuration and assets.
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'getBrandFromReq',
    classification: 'brand-bearing',
    notes: 'Authoritative HTTP brand source for all families.',
  },
  // Translation entries and bundles.
  {
    family: 'translation-bundles',
    service: 'TranslationController',
    operation: 'getNamespace',
    classification: 'brand-bearing',
    notes: 'Protected REST endpoints resolve the authorization brand.',
  },
  {
    family: 'translation-bundles',
    service: 'TranslationController',
    operation: 'getLanguages',
    classification: 'brand-bearing',
    notes: 'Language list resolves branding from the request brand parameter.',
  },
  {
    family: 'translation-bundles',
    service: 'TranslationController',
    operation: 'listEntriesApp',
    classification: 'brand-bearing',
    notes: 'Entry list derives branding from the request via getBrandFromReq.',
  },
  {
    family: 'translation-bundles',
    service: 'TranslationController',
    operation: 'setEntryApp',
    classification: 'brand-bearing',
    notes: 'Entry write derives branding from the request via getBrandFromReq.',
  },
  {
    family: 'translation-bundles',
    service: 'TranslationController',
    operation: 'getBundleApp',
    classification: 'brand-bearing',
    notes: 'Bundle read derives branding from the request via getBrandFromReq.',
  },
  {
    family: 'translation-bundles',
    service: 'TranslationController',
    operation: 'setBundleApp',
    classification: 'brand-bearing',
    notes: 'Bundle write derives branding from the request via getBrandFromReq.',
  },
  // Harvest and integration state.
  {
    family: 'harvest-integration-state',
    service: 'HarvestRunService',
    operation: 'listRuns',
    classification: 'list-search-export',
    notes: 'Run list includes brand predicate.',
  },
  {
    family: 'harvest-integration-state',
    service: 'HarvestRunService',
    operation: 'getRun',
    classification: 'brand-bearing',
    notes: 'Run/chunk/event lookup includes brand.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'getAuditLog',
    classification: 'brand-bearing',
    notes: 'Audit lookup requires accessible parent record plus brand.',
  },
  // User management and account linking.
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getUserForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user read; cross-brand yields opaque 404.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getUsersForBrand',
    classification: 'list-search-export',
    notes: 'List/search queries are brand-constrained and capped.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getUserWithId',
    classification: 'id-only-internal',
    notes: 'ID-only lookup; brand-owned callers must use getUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'searchLinkCandidates',
    classification: 'list-search-export',
    notes: 'Link-candidate search is brand-constrained and capped.',
  },
  // User-triggered jobs and async progress carry an immutable envelope.
  {
    family: 'user-jobs-async-progress',
    service: 'AsynchsService',
    operation: 'start',
    classification: 'internal-job',
    notes: 'Queue payload persists actor, brand, operation, and exact scopes.',
  },
  {
    family: 'user-jobs-async-progress',
    service: 'AsynchController',
    operation: 'start',
    classification: 'internal-job',
    notes: 'Job start re-authorizes the privileged socket message and persists the immutable authority envelope.',
  },
  {
    family: 'user-jobs-async-progress',
    service: 'AsynchController',
    operation: 'stop',
    classification: 'internal-job',
    notes: 'Job stop re-authorizes the message, constrains lookup by brand, and verifies actor ownership.',
  },
  {
    family: 'user-jobs-async-progress',
    service: 'AsynchController',
    operation: 'update',
    classification: 'internal-job',
    notes: 'Job update re-authorizes the message, constrains lookup by brand, and verifies actor ownership.',
  },
  {
    family: 'user-jobs-async-progress',
    service: 'AsynchsService',
    operation: 'get',
    classification: 'internal-job',
    notes: 'Progress lookup is brand-constrained and bounded.',
  },
  // Privileged WebSocket events re-resolve per message.
  {
    family: 'websocket-events',
    service: 'AsynchController',
    operation: 'subscribe',
    classification: 'internal-job',
    notes: 'Each message re-resolves principal, assignments, route, record, brand, and ACL.',
  },
  {
    family: 'websocket-events',
    service: 'AsynchController',
    operation: 'progress',
    classification: 'internal-job',
    notes: 'Progress messages re-resolve authority; handshake context is presentation only.',
  },
  // Records: writes, brand-scoped reads, predicates, and internal pipeline.
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Record create takes the request brand plus actor; route capability is authorized before the storage write.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'updateMeta',
    classification: 'brand-bearing',
    notes: 'Record update takes the request brand plus actor; authorized flows supply the save context.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'updateMetaInternal',
    classification: 'internal-job',
    notes:
      'Internal save entry for integration services (DOI/Figshare/harvest); runs with the calling flow authority via an options envelope, not a request entry point.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'mutateMetaInternal',
    classification: 'internal-job',
    notes:
      'Internal recompute/mutation entry for account-link authorization rewrites; runs with the calling flow authority via an options envelope.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'getRecordFormFingerprint',
    classification: 'id-only-internal',
    notes: 'Pure form-fingerprint computation over a supplied record and type; carries no brand authority.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'getResolvedPermissionsSummary',
    classification: 'id-only-internal',
    notes: 'ID-only permission summary over getMeta; controllers invoke it only after resolving the authorized record.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'hasCreateAccess',
    classification: 'brand-bearing',
    notes: 'Create authorization predicate evaluated with request brand, user, roles, and record type.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'hasEditAccess',
    classification: 'brand-bearing',
    notes: 'Edit authorization predicate evaluated with request brand, user, roles, and record.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'hasTransitionRoleAuthorization',
    classification: 'brand-bearing',
    notes: 'Workflow transition predicate evaluated against the step transitionRoles configuration.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'hasViewAccess',
    classification: 'brand-bearing',
    notes: 'View authorization predicate evaluated with request brand, user, roles, and record.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'createBatch',
    classification: 'internal-job',
    notes:
      'Storage batch-create entry delegating to the storage service with a service-actor audit context; no controller entry point.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'provideUserAccessAndRemovePendingAccess',
    classification: 'brand-bearing',
    notes: 'Pending-access record grant invoked by the account-link flow after brand checks.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getMetaWithRelationships',
    classification: 'brand-bearing',
    notes: 'Relationship-expanding record read constrained by the supplied brand.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordsService',
    operation: 'getRecordTypeSummary',
    classification: 'brand-bearing',
    notes: 'Record-type lookup summary constrained by the supplied brand.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'delete',
    classification: 'brand-bearing',
    notes:
      'Record delete invoked by controllers only after the authorized-record flow plus brand ownership and edit-access checks.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'restoreRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record restore carrying the request brand, user, and save context.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'destroyDeletedRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record destroy carrying the request brand, user, and save context.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getDeletedRecords',
    classification: 'list-search-export',
    notes: 'Deleted-record list carrying workflow state, roles, and brand predicate.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'getDeletedRecord',
    classification: 'brand-bearing',
    notes: 'Tombstone read constrained by the supplied brand.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'recoverLifecycleOperation',
    classification: 'internal-job',
    notes: 'Background tombstone lifecycle recovery worker; no request entry point.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'recoverLifecycleOperations',
    classification: 'internal-job',
    notes: 'Bounded background tombstone recovery sweep; no request entry point.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'updateNotificationLog',
    classification: 'internal-job',
    notes: 'Save-flow notification log/flag stamper over a record candidate; no controller entry point.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'triggerPreSaveTriggers',
    classification: 'internal-job',
    notes: 'Pre-save trigger fan-out running inside authorized create/update flows.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'triggerPostSaveTriggers',
    classification: 'internal-job',
    notes: 'Post-save trigger fan-out running inside authorized create/update flows.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'triggerPostSaveSyncTriggers',
    classification: 'internal-job',
    notes: 'Synchronous post-save trigger fan-out running inside authorized save flows.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'triggerPreSaveTransitionWorkflowTriggers',
    classification: 'internal-job',
    notes: 'Pre-save workflow-transition trigger fan-out running inside authorized transition flows.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'triggerPostSaveTransitionWorkflowTriggers',
    classification: 'internal-job',
    notes: 'Post-save workflow-transition trigger fan-out running inside authorized transition flows.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'auditRecordValidationRollout',
    classification: 'internal-job',
    notes: 'Record-validation rollout audit helper; no request entry point.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordsService',
    operation: 'cleanupAbandonedAttachmentStaging',
    classification: 'internal-job',
    notes: 'Abandoned attachment-staging janitor; no request entry point.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'appendToRecord',
    classification: 'brand-bearing',
    notes: 'Related-record link mutation invoked by integration/workspace flows with explicit target record.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'removeFromRecord',
    classification: 'brand-bearing',
    notes: 'Related-record unlink mutation invoked by workspace flows with explicit target record.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'authorizeBrandOperation',
    classification: 'brand-bearing',
    notes: 'Brand-operation gate resolving the request authorization context against a required scope.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordsService',
    operation: 'storeRecordAudit',
    classification: 'internal-job',
    notes: 'Queue-driven record-audit persistence worker; no request entry point.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'reconcilePostCommitSave',
    classification: 'internal-job',
    notes: 'Post-commit save reconciliation worker consuming the persisted job envelope.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'exists',
    classification: 'id-only-internal',
    notes: 'ID-only storage existence probe for authorized flows; carries no brand authority.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordsService',
    operation: 'setWorkflowStepRelatedMetadata',
    classification: 'brand-bearing',
    notes: 'Deprecated workflow-step metadata helper superseded by transitionWorkflowStepMetadata.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordsService',
    operation: 'transitionWorkflowStepMetadata',
    classification: 'brand-bearing',
    notes: 'Workflow-step metadata transition invoked within authorized record flows.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordsService',
    operation: 'handleUpdateDataStream',
    classification: 'internal-job',
    notes: 'Datastream update helper invoked within authorized record flows via the datastream service.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordsService',
    operation: 'bootstrapData',
    classification: 'internal-job',
    notes: 'Bootstrap seeding from configured bootstrap files; no request path.',
  },
  // User management and account linking: remaining exported operations.
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'updateUserRoles',
    classification: 'brand-bearing',
    notes: 'Same-brand role-set application through the guarded writer with explicit brandId option.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'updateUserDetails',
    classification: 'brand-bearing',
    notes:
      'Legacy detail update defaulting to the default brand; brand-owned callers must use updateUserDetailsForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'updateUserDetailsForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user detail update resolving the target through getUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getUserWithUsername',
    classification: 'id-only-internal',
    notes: 'Username lookup without brand scope; brand-owned callers must use findUserForBrand or getUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'addLocalUser',
    classification: 'brand-bearing',
    notes: 'Local user create under the default brand; role assignment flows through updateUserRoles with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'setUserKey',
    classification: 'id-only-internal',
    notes: 'Legacy unscoped API-key setter; brand-owned callers must use setUserKeyForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'hasRole',
    classification: 'id-only-internal',
    notes: 'Pure role-membership predicate over a supplied user object; carries no brand authority.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'findUsersWithName',
    classification: 'list-search-export',
    notes: 'Brand-constrained user search by name.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'findUsersWithEmail',
    classification: 'list-search-export',
    notes: 'Brand-constrained user search by email.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'findUsersWithQuery',
    classification: 'list-search-export',
    notes: 'Brand-constrained user search backing the name/email finders.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'UsersService',
    operation: 'findAndAssignAccessToRecords',
    classification: 'brand-bearing',
    notes: 'Pending-access record grant resolving the effective user before assigning.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getUsers',
    classification: 'list-search-export',
    notes: 'Unscoped capped user list; brand-owned callers must use getUsersForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'findUserForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user lookup by search field; cross-brand yields no result.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getEffectiveUser',
    classification: 'brand-bearing',
    notes: 'Linked-alias resolution to the effective primary user for brand-owned flows.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getLinkedAccounts',
    classification: 'brand-bearing',
    notes: 'Linked-account read for a primary user; brand variant resolves through getLinkedAccountsForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getLinkedAccountsForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained linked-account read resolving the target through getUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'linkAccounts',
    classification: 'brand-bearing',
    notes:
      'Brand-constrained account link carrying actor and brandId; secondary alias cleanup preserves foreign roles.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'addUserAuditEvent',
    classification: 'internal-job',
    notes: 'User audit event writer invoked by login/logout and account flows.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'checkAuthorizedEmail',
    classification: 'id-only-internal',
    notes: 'Email-domain authorization predicate; carries no resource authority.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'enrichUsersWithEffectiveDisabledState',
    classification: 'id-only-internal',
    notes: 'Pure enrichment helper computing effective disabled state over supplied users.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'disableUser',
    classification: 'brand-bearing',
    notes: 'Legacy unscoped disable; brand-owned callers must use disableUserForBrand with opaque 404.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'disableUserForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained disable resolving the target through getUserForBrand with opaque 404.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'enableUser',
    classification: 'brand-bearing',
    notes: 'Legacy unscoped enable; brand-owned callers must use enableUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'enableUserForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained enable resolving the target through getUserForBrand with opaque 404.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getUserAudit',
    classification: 'id-only-internal',
    notes: 'Unscoped user audit read; brand-owned callers must use getUserAuditForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'getUserAuditForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user audit read resolving the target through getUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'setUserKeyForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained API-key setter resolving the target through getUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'UsersService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Bootstrap seeding of default users and roles; no request path.',
  },
  // Async jobs.
  {
    family: 'user-jobs-async-progress',
    service: 'AsynchsService',
    operation: 'update',
    classification: 'internal-job',
    notes: 'Progress-record mutation within the job authority envelope.',
  },
  {
    family: 'user-jobs-async-progress',
    service: 'AsynchsService',
    operation: 'finish',
    classification: 'internal-job',
    notes: 'Progress completion mutation within the job authority envelope.',
  },
  // Reports and named queries: remaining exported operations.
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Report create carrying the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'findAllReportsForBrand',
    classification: 'list-search-export',
    notes: 'Brand-constrained report list backing config reads.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'Brand-keyed report read backing config and execution paths.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'getReportDto',
    classification: 'id-only-internal',
    notes: 'Pure report DTO mapper over a supplied model; carries no brand authority.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'listConfigs',
    classification: 'list-search-export',
    notes: 'Brand-constrained report-config list.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'getConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed report-config read.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'createConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed report-config create with mutable-config validation.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'updateConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed report-config update with mutable-config validation.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'deleteConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed report-config delete.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'previewConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed report-config preview execution.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'extractReportTemplates',
    classification: 'brand-bearing',
    notes: 'Template-compile input extraction for a brand-keyed report.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'getDataRows',
    classification: 'id-only-internal',
    notes: 'Pure CSV data-row builder over supplied report config and rows.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'getCSVHeaderRow',
    classification: 'id-only-internal',
    notes: 'Pure CSV header builder over a supplied report config.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsService',
    operation: 'bootstrapData',
    classification: 'internal-job',
    notes: 'Bootstrap seeding of report definitions; no request path.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'getNamedQueryConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed named-query config read.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'performNamedQuery',
    classification: 'id-only-internal',
    notes: 'Raw named-query executor; callers supply the brand predicate through the brandId field path.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'performNamedQueryFromConfigResults',
    classification: 'brand-bearing',
    notes: 'Config-driven named-query execution carrying the active brand.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Brand-keyed named-query create.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'update',
    classification: 'brand-bearing',
    notes: 'Brand-keyed named-query update.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'delete',
    classification: 'brand-bearing',
    notes: 'Brand-keyed named-query delete.',
  },
  {
    family: 'named-queries',
    service: 'NamedQueryService',
    operation: 'bootstrapData',
    classification: 'internal-job',
    notes: 'Bootstrap seeding of named-query definitions; no request path.',
  },
  // App and branding configuration: remaining exported operations.
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'getAllConfigurationForBrand',
    classification: 'brand-bearing',
    notes: 'Brand-constrained configuration record list.',
  },
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'loadAppConfigurationModel',
    classification: 'brand-bearing',
    notes: 'Merged application configuration model load for a brandId.',
  },
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'getAppConfigForm',
    classification: 'brand-bearing',
    notes: 'Brand-scoped configuration form schema read.',
  },
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'getAppConfigByBrandAndKey',
    classification: 'brand-bearing',
    notes: 'Latest configuration record read for a brandId plus config key.',
  },
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'createConfig',
    classification: 'brand-bearing',
    notes: 'Configuration record create resolving the brand from the supplied brand name.',
  },
  {
    family: 'app-navigation-config',
    service: 'AppConfigService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Configuration cache bootstrap; no request path.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'loadAvailableBrands',
    classification: 'brand-bearing',
    notes: 'Brand catalogue load backing brand resolution.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'getDefault',
    classification: 'brand-bearing',
    notes: 'Default brand read from the loaded brand catalogue.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'getBrand',
    classification: 'brand-bearing',
    notes: 'Brand read by name from the loaded brand catalogue.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'getAvailable',
    classification: 'brand-bearing',
    notes: 'Available brand-name list backing brand selection.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'getBrandNameFromReq',
    classification: 'brand-bearing',
    notes: 'Authoritative request-brand reader preferring the authorization context brand.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'getBrandById',
    classification: 'brand-bearing',
    notes: 'Brand read by id from the loaded brand catalogue.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'getBrandingFromDB',
    classification: 'brand-bearing',
    notes: 'Brand configuration read from storage by name.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'saveDraft',
    classification: 'brand-bearing',
    notes: 'Brand theme draft write carrying branding, variables, and actor.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'preview',
    classification: 'brand-bearing',
    notes: 'Brand theme preview creation carrying branding and portal.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'fetchPreview',
    classification: 'brand-bearing',
    notes: 'Brand theme preview read by token with TTL enforcement.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'publish',
    classification: 'brand-bearing',
    notes: 'Brand theme publish carrying branding, portal, actor, and expected version.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'rollback',
    classification: 'brand-bearing',
    notes: 'Brand theme rollback carrying history id, actor, and brand id.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'refreshBrandingCache',
    classification: 'brand-bearing',
    notes: 'Brand cache refresh reloading a brand by id with roles populated.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Brand catalogue bootstrap; no request path.',
  },
  // Harvest and integration state: remaining exported operations.
  {
    family: 'harvest-integration-state',
    service: 'HarvestRunService',
    operation: 'submitCompatibilityRecords',
    classification: 'brand-bearing',
    notes: 'Harvest record submission carrying brand, record type, user, and save context.',
  },
  {
    family: 'harvest-integration-state',
    service: 'HarvestRunService',
    operation: 'submitLegacyRecords',
    classification: 'brand-bearing',
    notes: 'Legacy harvest record submission carrying brand, record type, user, and save context.',
  },
  {
    family: 'harvest-integration-state',
    service: 'HarvestRunService',
    operation: 'submitChunk',
    classification: 'brand-bearing',
    notes: 'Harvest chunk submission carrying brand, record type, user, and save context.',
  },
  {
    family: 'harvest-integration-state',
    service: 'HarvestRunService',
    operation: 'runExists',
    classification: 'brand-bearing',
    notes: 'Brand-predicated harvest-run existence check.',
  },
  {
    family: 'harvest-integration-state',
    service: 'HarvestRunService',
    operation: 'listRunEvents',
    classification: 'list-search-export',
    notes: 'Brand-predicated harvest-run event list.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'startAudit',
    classification: 'internal-job',
    notes: 'Audit-span constructor for integration flows; persistence flows through the audit store worker.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'completeAudit',
    classification: 'internal-job',
    notes: 'Audit-span completion helper; persistence flows through the audit store worker.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'failAudit',
    classification: 'internal-job',
    notes: 'Audit-span failure helper; persistence flows through the audit store worker.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'getTraceAuditLog',
    classification: 'brand-bearing',
    notes: 'Integration audit trace read keyed by the request oid.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'getStatusSummary',
    classification: 'brand-bearing',
    notes: 'Integration status summary read keyed by the request oid.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'getStatusSummaryWithOutcomes',
    classification: 'brand-bearing',
    notes: 'Outcome-mapped status summary read over getStatusSummary.',
  },
  {
    family: 'harvest-integration-state',
    service: 'IntegrationAuditService',
    operation: 'storeIntegrationAudit',
    classification: 'internal-job',
    notes: 'Queue-driven integration-audit persistence worker; no request entry point.',
  },
  // Forms, record types, workflows, dashboards: remaining exported operations.
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'getFormByName',
    classification: 'brand-bearing',
    notes: 'Form read by name constrained by the resolved branding id.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'flattenFields',
    classification: 'id-only-internal',
    notes: 'Pure field-tree flatten helper over supplied fields; carries no brand authority.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'filterFieldsHasEditAccess',
    classification: 'id-only-internal',
    notes: 'In-memory field filter over supplied fields and edit-access flag.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'listForms',
    classification: 'list-search-export',
    notes: 'Form list constrained by the optional branding id.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'inferSchemaFromMetadata',
    classification: 'id-only-internal',
    notes: 'Pure schema inference over supplied record metadata.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'generateFormFromSchema',
    classification: 'brand-bearing',
    notes: 'Schema-driven form build carrying the request brand and record type.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'getFormByStartingWorkflowStep',
    classification: 'brand-bearing',
    notes: 'Starting-step form read carrying the request brand and record type.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'buildClientFormConfig',
    classification: 'brand-bearing',
    notes: 'Client form build filtered by the supplied user roles and record metadata.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'buildContractFormConfig',
    classification: 'brand-bearing',
    notes: 'Contract form build over the resolved record-contract context.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'discoverValidationOperations',
    classification: 'brand-bearing',
    notes: 'Validation-operation discovery for editable forms carrying user and record context.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'toPublicForm',
    classification: 'id-only-internal',
    notes: 'Pure public-form projection stripping internal validation operations.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'FormsService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Form bootstrap for a workflow step and branding id; no request path.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Record-type create carrying the request brand with schema config assertion.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'getAll',
    classification: 'list-search-export',
    notes: 'Brand-constrained record-type list.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'getAllCache',
    classification: 'id-only-internal',
    notes: 'In-memory record-type cache read populated by brand-scoped bootstrap.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'assertConcurrentModificationCapability',
    classification: 'id-only-internal',
    notes: 'Storage capability assertion for a concurrency mode; no resource read or write.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'resolveConcurrentModificationMode',
    classification: 'brand-bearing',
    notes: 'Brand-keyed concurrency-mode resolution over the stored policy.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'resolveConcurrentModificationPolicy',
    classification: 'brand-bearing',
    notes: 'Brand-keyed concurrency-policy resolution over the stored record type.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordTypesService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Record-type bootstrap for the default brand; no request path.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'WorkflowStepsService',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Workflow-step create reachable through the brand-constrained record type.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'WorkflowStepsService',
    operation: 'get',
    classification: 'id-only-internal',
    notes:
      'Workflow-step read by an already-resolved record type; reachable only through brand-constrained record type.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'WorkflowStepsService',
    operation: 'getFirst',
    classification: 'id-only-internal',
    notes:
      'Starting-step read by an already-resolved record type; reachable only through brand-constrained record type.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'WorkflowStepsService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Workflow-step bootstrap for seeded record types; no request path.',
  },
  // Dashboards: remaining exported operations.
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getDashboardOverrides',
    classification: 'brand-bearing',
    notes: 'Brand-keyed dashboard override read backing merged config resolution.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'saveDashboardOverrides',
    classification: 'brand-bearing',
    notes: 'Brand-keyed dashboard override write with normalization.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getWorkflowStateDashboardConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed workflow-state dashboard config read.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'saveWorkflowStateDashboardConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed workflow-state dashboard config write.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getDashboardViewStepConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed dashboard view-step config read.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'saveDashboardViewStepConfig',
    classification: 'brand-bearing',
    notes: 'Brand-keyed dashboard view-step config write.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getEffectiveDashboardType',
    classification: 'brand-bearing',
    notes: 'Effective dashboard-type resolution carrying the request brand and record or view context.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getMergedDashboardTableConfig',
    classification: 'brand-bearing',
    notes: 'Merged dashboard table config read carrying brand, record type, and workflow stage.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getMergedDashboardViewTableConfig',
    classification: 'brand-bearing',
    notes: 'Merged dashboard view-table config read carrying brand, view, and step.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'getMergedDashboardTypeFormatRules',
    classification: 'brand-bearing',
    notes: 'Dashboard format-rule read for a brand-keyed dashboard type.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardConfigService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Dashboard-config bootstrap; no request path.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Dashboard-type create carrying the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'createDashboardType',
    classification: 'brand-bearing',
    notes: 'Dashboard-type create with normalized input carrying the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'getAll',
    classification: 'list-search-export',
    notes: 'Brand-constrained dashboard-type list.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'getAllDashboardTypeDefinitions',
    classification: 'list-search-export',
    notes: 'Normalized brand-constrained dashboard-type definition list.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'getDashboardTypeDefinition',
    classification: 'brand-bearing',
    notes: 'Brand-keyed dashboard-type definition read.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'updateDashboardType',
    classification: 'brand-bearing',
    notes: 'Brand-keyed dashboard-type update.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'deleteDashboardType',
    classification: 'brand-bearing',
    notes: 'Brand-keyed dashboard-type delete.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'getDashboardTableConfig',
    classification: 'brand-bearing',
    notes: 'Dashboard table config read carrying brand, record type, and workflow stage.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'getRecordTypeDashboardConfig',
    classification: 'brand-bearing',
    notes: 'Dashboard config read resolved through the brand-keyed record type.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'extractDashboardTemplates',
    classification: 'brand-bearing',
    notes: 'Template-compile input extraction for a brand-keyed dashboard config.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'extractDashboardViewTemplates',
    classification: 'brand-bearing',
    notes: 'Template-compile input extraction for a brand-keyed dashboard view.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DashboardTypesService',
    operation: 'bootstrap',
    classification: 'internal-job',
    notes: 'Dashboard-type bootstrap for the default brand; no request path.',
  },
  // Figshare/RVA state and crosswalks: remaining exported operations.
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'discoverTaxonomies',
    classification: 'brand-bearing',
    notes: 'Taxonomy discovery carrying scope input plus actor context with brand.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'getPreview',
    classification: 'brand-bearing',
    notes: 'Preview page read constrained by the run brand in the actor context.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'cloneMirror',
    classification: 'brand-bearing',
    notes: 'Source mirror clone carrying clone input plus actor context with brand.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'listSources',
    classification: 'list-search-export',
    notes: 'Brand-constrained Figshare source list.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'getSource',
    classification: 'brand-bearing',
    notes: 'Source read constrained by the source brand in the actor context.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'listSourceCategories',
    classification: 'list-search-export',
    notes: 'Brand-constrained mirrored-category option list for a source.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'listSyncRuns',
    classification: 'list-search-export',
    notes: 'Brand-constrained sync-run list.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'listCrosswalks',
    classification: 'list-search-export',
    notes: 'Brand-constrained crosswalk summary list.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'getCrosswalk',
    classification: 'brand-bearing',
    notes: 'Crosswalk read constrained by the crosswalk brand in the actor context.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'getCrosswalkUsage',
    classification: 'brand-bearing',
    notes: 'Crosswalk usage read constrained by the crosswalk brand in the actor context.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'createCrosswalk',
    classification: 'brand-bearing',
    notes: 'Crosswalk create carrying name, local vocabulary, and source plus actor context with brand.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'listCrosswalkLocalEntries',
    classification: 'list-search-export',
    notes: 'Brand-constrained crosswalk local-entry option list.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'listCrosswalkMappings',
    classification: 'list-search-export',
    notes: 'Brand-constrained crosswalk mapping list.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'saveMappings',
    classification: 'brand-bearing',
    notes: 'Crosswalk mapping write carrying revision plus actor context with brand.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'approveCrosswalk',
    classification: 'brand-bearing',
    notes: 'Crosswalk revision approval carrying actor context with brand.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'deleteCrosswalk',
    classification: 'brand-bearing',
    notes: 'Crosswalk delete constrained by usage plus actor context with brand.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'resolveCategories',
    classification: 'id-only-internal',
    notes: 'Crosswalk-target category resolution over explicit input; must run after brand authorization.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'resolveCrosswalkValues',
    classification: 'id-only-internal',
    notes: 'Crosswalk value resolution over explicit input; must run after brand authorization.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'FigshareVocabularyService',
    operation: 'bootstrapData',
    classification: 'internal-job',
    notes: 'Figshare vocabulary bootstrap imports; no request path.',
  },
  // Solr search and indexing: remaining exported operations.
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'index',
    classification: 'internal-job',
    notes: 'Index-request entry enqueueing the Solr add/update job for an authorized record.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'remove',
    classification: 'internal-job',
    notes: 'Index-removal entry enqueueing the Solr delete job.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'removeByBrand',
    classification: 'internal-job',
    notes: 'Brand-constrained index-removal entry requiring an explicit brand id.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'solrAddOrUpdate',
    classification: 'internal-job',
    notes: 'Queue-driven Solr add/update worker consuming the persisted job envelope.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'solrDelete',
    classification: 'internal-job',
    notes: 'Queue-driven Solr delete worker consuming the persisted job envelope.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'searchAdvanced',
    classification: 'id-only-internal',
    notes: 'Raw Solr query primitive; authorized callers must apply the brand predicate through searchFuzzy.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'SolrSearchService',
    operation: 'preIndex',
    classification: 'id-only-internal',
    notes: 'Pure index-document transformer over a supplied Solr document.',
  },
  // Record workflow-action dispatcher: runs the configured action service.
  {
    family: 'record-acl-search-storage-exports',
    service: 'ActionController',
    operation: 'callService',
    classification: 'brand-bearing',
    notes: 'Dispatches the configured record action service function with request context and no-cache response.',
  },
  // UI record controller: every exported action resolves the request brand
  // and routes through the authorized-record flow (getRecord resolves via
  // getAuthorizedRecord, plus brand ownership and role-access checks).
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'view',
    classification: 'brand-bearing',
    notes: 'Authorized record view render resolving brand, authorized record, and view access before sendView.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'edit',
    classification: 'brand-bearing',
    notes: 'Record edit render resolving brand and the authorized record before sendView.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordController',
    operation: 'getForm',
    classification: 'brand-bearing',
    notes: 'Starting-step form read delegating to FormsService with request brand and authorized record.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Record create request entry delegating to the internal create flow with brand and authorization.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'update',
    classification: 'brand-bearing',
    notes: 'Record update request entry delegating to the internal update flow with brand and authorization.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordController',
    operation: 'stepTo',
    classification: 'brand-bearing',
    notes: 'Workflow-step transition request entry resolving brand and the authorized record.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordController',
    operation: 'search',
    classification: 'list-search-export',
    notes: 'Record search applying the authorization context plus brand predicate before collection read.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordController',
    operation: 'getType',
    classification: 'brand-bearing',
    notes: 'Record-type read delegating to RecordTypesService with the request brand.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordController',
    operation: 'getWorkflowSteps',
    classification: 'brand-bearing',
    notes: 'Workflow-step list resolving the brand-keyed record type before step read.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'getMeta',
    classification: 'brand-bearing',
    notes: 'Record meta read resolving brand and the authorized record.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'getMetaDefault',
    classification: 'brand-bearing',
    notes: 'Default-create meta read resolving brand, authorization, and the starting-step form.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordController',
    operation: 'doAttachment',
    classification: 'brand-bearing',
    notes: 'Attachment request entry resolving brand and the authorized record before the storage write.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordController',
    operation: 'getAttachments',
    classification: 'brand-bearing',
    notes: 'Attachment read resolving brand and the authorized record.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordController',
    operation: 'getPermissions',
    classification: 'brand-bearing',
    notes: 'Permission summary read resolving brand and the authorized record with update mode.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordController',
    operation: 'getPermissionsInternal',
    classification: 'brand-bearing',
    notes: 'Internal permission summary read resolving the authorized record with update mode.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordController',
    operation: 'getDataStream',
    classification: 'brand-bearing',
    notes: 'Datastream read resolving brand and the authorized record with view access.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'RecordController',
    operation: 'getAllTypes',
    classification: 'list-search-export',
    notes: 'Record-type list delegating to RecordTypesService with the request brand.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'delete',
    classification: 'brand-bearing',
    notes: 'Record delete resolving brand and the authorized record plus ownership and edit-access checks.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordController',
    operation: 'getRelatedRecords',
    classification: 'brand-bearing',
    notes: 'Related-record read resolving the authorized record before relationship expansion and access filtering.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'render',
    classification: 'brand-bearing',
    notes: 'Record view render resolving the request brand and record-type routing before sendView.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'RecordController',
    operation: 'getRecordList',
    classification: 'list-search-export',
    notes: 'Record dashboard list applying the authorization context plus brand predicate.',
  },
  {
    family: 'app-navigation-config',
    service: 'RecordController',
    operation: 'listWorkspaces',
    classification: 'brand-bearing',
    notes: 'Workspace dashboard redirect carrying the request brand path.',
  },
  {
    family: 'dashboard-types-config',
    service: 'RecordController',
    operation: 'getAllDashboardTypes',
    classification: 'list-search-export',
    notes: 'Dashboard-type list delegating to DashboardTypesService with the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'RecordController',
    operation: 'getDashboardType',
    classification: 'brand-bearing',
    notes: 'Dashboard-type read delegating to DashboardTypesService with the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'RecordController',
    operation: 'getDashboardView',
    classification: 'brand-bearing',
    notes: 'Dashboard-view read delegating to DashboardTypesService with request view parameters.',
  },
  {
    family: 'dashboard-types-config',
    service: 'RecordController',
    operation: 'redirectLegacyConsolidatedDashboard',
    classification: 'brand-bearing',
    notes: 'Legacy dashboard redirect carrying the request brand path with authorization.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'renderDeletedRecords',
    classification: 'brand-bearing',
    notes: 'Deleted-record view render resolving the authorization context before sendView.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'getDeletedRecordList',
    classification: 'list-search-export',
    notes: 'Deleted-record list applying the authorization context plus brand predicate.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'getDeletedRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record read resolving brand and the authorized deleted record.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'restoreRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record restore resolving brand and the authorized deleted record.',
  },
  {
    family: 'active-deleted-records',
    service: 'RecordController',
    operation: 'destroyDeletedRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record destroy resolving brand and the authorized deleted record.',
  },
  {
    family: 'dashboard-types-config',
    service: 'RecordController',
    operation: 'renderDashboardView',
    classification: 'brand-bearing',
    notes: 'Dashboard-view render resolving the brand-keyed dashboard view before sendView.',
  },
  // Admin UI controller: user/role administration entries.
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'getBrandRoles',
    classification: 'brand-bearing',
    notes: 'Brand role read with users populated, filtered by hiddenRoles, carrying deprecation successor headers.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'getUsers',
    classification: 'list-search-export',
    notes: 'Brand-constrained user list with link-state enrichment and hidden-user filtering.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'updateUserRoles',
    classification: 'brand-bearing',
    notes: 'Compatibility adapter translating role names to same-brand ids and delegating with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'updateUserDetails',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user update merging foreign-brand ids before delegating with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'addLocalUser',
    classification: 'brand-bearing',
    notes: 'Local user create translating requested role names and delegating with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'generateUserKey',
    classification: 'brand-bearing',
    notes: 'Brand-constrained API-key issuance resolving the target through requireUserInBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'revokeUserKey',
    classification: 'brand-bearing',
    notes: 'Brand-constrained API-key revocation resolving the target through requireUserInBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'searchLinkCandidates',
    classification: 'list-search-export',
    notes: 'Brand-constrained link-candidate search with opaque 404 for foreign primary users.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'getUserLinks',
    classification: 'brand-bearing',
    notes: 'Brand-constrained linked-account read for a user id.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'getUserAudit',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user audit read resolving the target through requireUserInBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'linkAccounts',
    classification: 'brand-bearing',
    notes: 'Brand-constrained account link carrying primary/secondary ids plus actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'disableUser',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user disable carrying actor and brand with self-disable guard.',
  },
  {
    family: 'user-management-linking',
    service: 'AdminController',
    operation: 'enableUser',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user enable carrying actor and brand.',
  },
  // App-config UI controller.
  {
    family: 'app-navigation-config',
    service: 'AppConfigController',
    operation: 'getAppConfigForm',
    classification: 'brand-bearing',
    notes: 'Brand-scoped configuration form read via the branding service.',
  },
  {
    family: 'app-navigation-config',
    service: 'AppConfigController',
    operation: 'saveAppConfig',
    classification: 'brand-bearing',
    notes: 'Brand-scoped configuration save via the branding service.',
  },
  // Branding app controller: theme configuration entries.
  {
    family: 'branding-assets',
    service: 'BrandingAppController',
    operation: 'config',
    classification: 'brand-bearing',
    notes: 'Brand theme config read resolving the request brand.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingAppController',
    operation: 'draft',
    classification: 'brand-bearing',
    notes: 'Brand theme draft write delegating to BrandingService.saveDraft with actor.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingAppController',
    operation: 'preview',
    classification: 'brand-bearing',
    notes: 'Brand theme preview delegating to BrandingService.preview with brand and portal.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingAppController',
    operation: 'publish',
    classification: 'brand-bearing',
    notes: 'Brand theme publish delegating to BrandingService.publish with actor.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingAppController',
    operation: 'logo',
    classification: 'brand-bearing',
    notes: 'Brand logo read resolving the request brand.',
  },
  {
    family: 'branding-assets',
    service: 'BrandingAppController',
    operation: 'favicon',
    classification: 'brand-bearing',
    notes: 'Brand favicon read resolving the request brand.',
  },
  // Dynamic assets and export entries.
  {
    family: 'forms-record-types-workflows',
    service: 'DynamicAssetController',
    operation: 'getFormCompiledItems',
    classification: 'brand-bearing',
    notes: 'Compiled form-item read carrying request brand, record type, and mode.',
  },
  {
    family: 'reports-exports',
    service: 'DynamicAssetController',
    operation: 'getAdminReportTemplates',
    classification: 'brand-bearing',
    notes: 'Report template read delegating to ReportsService with the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DynamicAssetController',
    operation: 'getRecordDashboardTemplates',
    classification: 'brand-bearing',
    notes: 'Dashboard template read delegating to DashboardTypesService with the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'DynamicAssetController',
    operation: 'getDashboardViewTemplates',
    classification: 'brand-bearing',
    notes: 'Dashboard view-template read delegating to DashboardTypesService with the request brand.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'ExportController',
    operation: 'index',
    classification: 'list-search-export',
    notes: 'Export index resolving the authorization context plus record collection before render.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'ExportController',
    operation: 'downloadRecs',
    classification: 'list-search-export',
    notes: 'Record export download applying the authorization context plus ACL-filtered collection.',
  },
  // Form-vocabulary entries: brand-derived vocabulary reads.
  {
    family: 'vocabularies-entries',
    service: 'FormVocabularyController',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'Vocabulary entry read with branding derived from the request via getBrandFromReq.',
  },
  {
    family: 'vocabularies-entries',
    service: 'FormVocabularyController',
    operation: 'entries',
    classification: 'brand-bearing',
    notes: 'Vocabulary entry list with branding derived from the request via getBrandFromReq.',
  },
  {
    family: 'vocabularies-entries',
    service: 'FormVocabularyController',
    operation: 'children',
    classification: 'brand-bearing',
    notes: 'Vocabulary child read with branding derived from the request via getBrandFromReq.',
  },
  {
    family: 'vocabularies-entries',
    service: 'FormVocabularyController',
    operation: 'expandPath',
    classification: 'brand-bearing',
    notes: 'Vocabulary path expansion with branding derived from the request via getBrandFromReq.',
  },
  {
    family: 'vocabularies-entries',
    service: 'FormVocabularyController',
    operation: 'getRecords',
    classification: 'list-search-export',
    notes: 'Query-backed record read with validated pagination parameters.',
  },
  {
    family: 'vocabularies-entries',
    service: 'FormVocabularyController',
    operation: 'externalEntries',
    classification: 'brand-bearing',
    notes: 'External vocabulary entry read via the form-vocabulary service with provider parameters.',
  },
  {
    family: 'vocabularies-entries',
    service: 'FormVocabularyController',
    operation: 'serviceEntries',
    classification: 'brand-bearing',
    notes: 'Service-backed vocabulary entry read with validated pagination parameters.',
  },
  // Record audit entries: parent-record authorized audit reads.
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordAuditController',
    operation: 'render',
    classification: 'brand-bearing',
    notes: 'Audit view render resolving the authorization context for the request oid.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordAuditController',
    operation: 'getAuditData',
    classification: 'brand-bearing',
    notes: 'Record audit read resolving the authorization context for the request oid.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordAuditController',
    operation: 'getPermissionsData',
    classification: 'brand-bearing',
    notes: 'Permission data read resolving the authorized record for the request oid.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordAuditController',
    operation: 'getIntegrationAuditData',
    classification: 'brand-bearing',
    notes: 'Integration audit read resolving the authorization context for the request oid.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'RecordAuditController',
    operation: 'getIntegrationStatusData',
    classification: 'brand-bearing',
    notes: 'Integration status read resolving the authorization context for the request oid.',
  },
  // Report UI entries.
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'Report read resolving the request brand before model and result resolution.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'getResults',
    classification: 'brand-bearing',
    notes: 'Report execution resolving the request brand before result computation.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'downloadCSV',
    classification: 'list-search-export',
    notes: 'Report CSV download resolving the request brand before CSV computation.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'listConfigs',
    classification: 'list-search-export',
    notes: 'Report-config list resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'getConfig',
    classification: 'brand-bearing',
    notes: 'Report-config read resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'createConfig',
    classification: 'brand-bearing',
    notes: 'Report-config create resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'updateConfig',
    classification: 'brand-bearing',
    notes: 'Report-config update resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'deleteConfig',
    classification: 'brand-bearing',
    notes: 'Report-config delete resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'ReportController',
    operation: 'previewConfig',
    classification: 'brand-bearing',
    notes: 'Report-config preview resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'ReportsController',
    operation: 'render',
    classification: 'brand-bearing',
    notes: 'Report admin view render resolving the request brand before listing brand reports.',
  },
  // User session controller: account entries.
  {
    family: 'user-management-linking',
    service: 'UserController',
    operation: 'update',
    classification: 'brand-bearing',
    notes: 'Self-profile update constrained to the authenticated principal.',
  },
  {
    family: 'user-management-linking',
    service: 'UserController',
    operation: 'generateUserKey',
    classification: 'brand-bearing',
    notes: 'Self API-key issuance for the authenticated principal with brand context.',
  },
  {
    family: 'user-management-linking',
    service: 'UserController',
    operation: 'revokeUserKey',
    classification: 'brand-bearing',
    notes: 'Self API-key revocation for the authenticated principal with brand context.',
  },
  {
    family: 'user-management-linking',
    service: 'UserController',
    operation: 'find',
    classification: 'list-search-export',
    notes: 'Brand-constrained user search delegating to findUsersWithName.',
  },
  {
    family: 'user-management-linking',
    service: 'UserController',
    operation: 'logout',
    classification: 'brand-bearing',
    notes: 'Session logout recording a user audit event before session destroy.',
  },
  // Workspace entries: brand-aware job control.
  {
    family: 'user-jobs-async-progress',
    service: 'WorkspaceAsyncController',
    operation: 'start',
    classification: 'internal-job',
    notes: 'Workspace job start carrying the authorization principal, brand, and operation id.',
  },
  {
    family: 'user-jobs-async-progress',
    service: 'WorkspaceAsyncController',
    operation: 'loop',
    classification: 'internal-job',
    notes: 'Workspace async pump processing queued workspace jobs under their stored authority.',
  },
  {
    family: 'user-jobs-async-progress',
    service: 'WorkspaceAsyncController',
    operation: 'status',
    classification: 'internal-job',
    notes: 'Workspace job status read keyed by the request record type.',
  },
  {
    family: 'app-navigation-config',
    service: 'WorkspaceTypesController',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'Workspace-type read resolving the request brand.',
  },
  {
    family: 'app-navigation-config',
    service: 'WorkspaceTypesController',
    operation: 'getOne',
    classification: 'brand-bearing',
    notes: 'Single workspace-type read resolving the request brand and type name.',
  },
  {
    family: 'app-navigation-config',
    service: 'WorkspaceTypesController',
    operation: 'uploadLogo',
    classification: 'brand-bearing',
    notes: 'Workspace-type logo upload resolving the request brand and type name.',
  },
  {
    family: 'app-navigation-config',
    service: 'WorkspaceTypesController',
    operation: 'renderImage',
    classification: 'brand-bearing',
    notes: 'Workspace-type image render resolving the request brand and type name.',
  },
  // Webservice admin/config entries.
  {
    family: 'translation-bundles',
    service: 'webservice/AdminController',
    operation: 'refreshCachedResources',
    classification: 'brand-bearing',
    notes: 'Translation resource cache refresh via the translation service.',
  },
  {
    family: 'app-navigation-config',
    service: 'webservice/AdminController',
    operation: 'setAppConfig',
    classification: 'brand-bearing',
    notes: 'Configuration write resolving the request brand before createOrUpdateConfig.',
  },
  {
    family: 'app-navigation-config',
    service: 'webservice/AdminController',
    operation: 'getAppConfig',
    classification: 'brand-bearing',
    notes: 'Configuration read resolving the request brand.',
  },
  {
    family: 'app-navigation-config',
    service: 'webservice/AppConfigController',
    operation: 'getAppConfig',
    classification: 'brand-bearing',
    notes: 'Configuration read resolving the request brand before brand-and-key lookup.',
  },
  {
    family: 'app-navigation-config',
    service: 'webservice/AppConfigController',
    operation: 'saveAppConfig',
    classification: 'brand-bearing',
    notes: 'Configuration write resolving the request brand before createOrUpdateConfig.',
  },
  // Contract authorization API: every action executes with the request
  // authorization context (actor plus brand) through RoleAdministrationService
  // or the scope service, mapping errors to contract problems.
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'getMe',
    classification: 'brand-bearing',
    notes: 'Authenticated principal projection of the request authorization context.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'listScopes',
    classification: 'list-search-export',
    notes: 'Scope catalog list executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'listTemplates',
    classification: 'list-search-export',
    notes: 'Role template list executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'getTemplateRevision',
    classification: 'brand-bearing',
    notes: 'Template revision read executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'publishTemplateRevision',
    classification: 'brand-bearing',
    notes: 'Template revision publish executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'listRoles',
    classification: 'list-search-export',
    notes: 'Role catalog list executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'createRole',
    classification: 'brand-bearing',
    notes: 'Role create executing with the request actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'getRole',
    classification: 'brand-bearing',
    notes: 'Role read executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'updateRole',
    classification: 'brand-bearing',
    notes: 'Role update executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'previewRoleScopes',
    classification: 'brand-bearing',
    notes: 'Role scope preview executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'applyRoleScopes',
    classification: 'brand-bearing',
    notes: 'Role scope apply executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'previewScopeAdoption',
    classification: 'brand-bearing',
    notes: 'Scope adoption preview executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'applyScopeAdoption',
    classification: 'brand-bearing',
    notes: 'Scope adoption apply executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'previewRoleTemplateUpgrade',
    classification: 'brand-bearing',
    notes: 'Role template upgrade preview executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'applyRoleTemplateUpgrade',
    classification: 'brand-bearing',
    notes: 'Role template upgrade apply executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'previewBulkTemplateUpgrade',
    classification: 'brand-bearing',
    notes: 'Bulk template upgrade preview executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'applyBulkTemplateUpgrade',
    classification: 'brand-bearing',
    notes: 'Bulk template upgrade apply executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'previewRoleInactivation',
    classification: 'brand-bearing',
    notes: 'Role inactivation preview executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'inactivateRole',
    classification: 'brand-bearing',
    notes: 'Role inactivation executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'deleteRole',
    classification: 'brand-bearing',
    notes: 'Role deletion executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'listAssignments',
    classification: 'list-search-export',
    notes: 'Assignment catalog list executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'grantAssignment',
    classification: 'brand-bearing',
    notes: 'Assignment grant executing with the request actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'revokeAssignment',
    classification: 'brand-bearing',
    notes: 'Assignment revoke executing with the request actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'suppressAssignment',
    classification: 'brand-bearing',
    notes: 'Assignment suppression executing with the request actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'unsuppressAssignment',
    classification: 'brand-bearing',
    notes: 'Assignment unsuppression executing with the request actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'previewBulkAssignments',
    classification: 'brand-bearing',
    notes: 'Bulk assignment preview executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'applyBulkAssignments',
    classification: 'brand-bearing',
    notes: 'Bulk assignment apply executing with the request actor plus confirmation.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'listAudit',
    classification: 'list-search-export',
    notes: 'Administration audit event list executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'explainDecision',
    classification: 'brand-bearing',
    notes: 'Authorization decision explanation for the request context.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'exportConfiguration',
    classification: 'brand-bearing',
    notes: 'Authorization configuration export executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'previewImport',
    classification: 'brand-bearing',
    notes: 'Configuration import preview executing with the request actor.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/AuthorizationController',
    operation: 'applyImport',
    classification: 'brand-bearing',
    notes: 'Configuration import apply executing with the request actor plus confirmation.',
  },
  // Webservice branding entries.
  {
    family: 'branding-assets',
    service: 'webservice/BrandingController',
    operation: 'draft',
    classification: 'brand-bearing',
    notes: 'Brand theme draft write resolving the request brand before saveDraft.',
  },
  {
    family: 'branding-assets',
    service: 'webservice/BrandingController',
    operation: 'preview',
    classification: 'brand-bearing',
    notes: 'Brand theme preview resolving the request brand before preview.',
  },
  {
    family: 'branding-assets',
    service: 'webservice/BrandingController',
    operation: 'publish',
    classification: 'brand-bearing',
    notes: 'Brand theme publish resolving the request brand before publish.',
  },
  {
    family: 'branding-assets',
    service: 'webservice/BrandingController',
    operation: 'rollback',
    classification: 'brand-bearing',
    notes: 'Brand theme rollback resolving the request brand before rollback.',
  },
  {
    family: 'branding-assets',
    service: 'webservice/BrandingController',
    operation: 'logo',
    classification: 'brand-bearing',
    notes: 'Brand logo read resolving the request brand.',
  },
  {
    family: 'branding-assets',
    service: 'webservice/BrandingController',
    operation: 'favicon',
    classification: 'brand-bearing',
    notes: 'Brand favicon read resolving the request brand.',
  },
  {
    family: 'branding-assets',
    service: 'webservice/BrandingController',
    operation: 'history',
    classification: 'brand-bearing',
    notes: 'Brand theme history read resolving the request brand.',
  },
  // Webservice dashboard entries.
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getConfigInfo',
    classification: 'brand-bearing',
    notes: 'Dashboard config info read delegating to DashboardConfigService.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getDefaults',
    classification: 'brand-bearing',
    notes: 'Merged dashboard default read resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getOverrides',
    classification: 'brand-bearing',
    notes: 'Dashboard override read resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'saveOverrides',
    classification: 'brand-bearing',
    notes: 'Dashboard override write resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getDashboardTypes',
    classification: 'list-search-export',
    notes: 'Dashboard-type list resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'createDashboardType',
    classification: 'brand-bearing',
    notes: 'Dashboard-type create resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getDashboardType',
    classification: 'brand-bearing',
    notes: 'Dashboard-type read resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'updateDashboardType',
    classification: 'brand-bearing',
    notes: 'Dashboard-type update resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'deleteDashboardType',
    classification: 'brand-bearing',
    notes: 'Dashboard-type delete resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'saveWorkflowStateDashboardConfig',
    classification: 'brand-bearing',
    notes: 'Workflow-state dashboard config write resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'saveDashboardViewStepConfig',
    classification: 'brand-bearing',
    notes: 'Dashboard view-step config write resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getMergedConfig',
    classification: 'brand-bearing',
    notes: 'Merged dashboard config read resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getMergedViewConfig',
    classification: 'brand-bearing',
    notes: 'Merged dashboard view-config read resolving the request brand.',
  },
  {
    family: 'dashboard-types-config',
    service: 'webservice/DashboardConfigController',
    operation: 'getMergedTypeFormatRules',
    classification: 'brand-bearing',
    notes: 'Dashboard format-rule read resolving the request brand.',
  },
  // Webservice export entry.
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/ExportController',
    operation: 'downloadRecs',
    classification: 'list-search-export',
    notes: 'Record export download applying validated params plus the ACL-filtered collection.',
  },
  // Webservice Figshare entries.
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'list',
    classification: 'list-search-export',
    notes: 'Crosswalk list delegating to FigshareVocabularyService with validated query.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'get',
    classification: 'brand-bearing',
    notes: 'Crosswalk read delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Crosswalk create delegating to FigshareVocabularyService with validated body.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'usage',
    classification: 'brand-bearing',
    notes: 'Crosswalk usage read delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'listLocalEntries',
    classification: 'list-search-export',
    notes: 'Crosswalk local-entry list delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'listMappings',
    classification: 'list-search-export',
    notes: 'Crosswalk mapping list delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'saveMappings',
    classification: 'brand-bearing',
    notes: 'Crosswalk mapping write delegating to FigshareVocabularyService with validated params and body.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'approve',
    classification: 'brand-bearing',
    notes: 'Crosswalk approval delegating to FigshareVocabularyService with validated params and body.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareCrosswalkController',
    operation: 'delete',
    classification: 'brand-bearing',
    notes: 'Crosswalk delete delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'listCatalogues',
    classification: 'list-search-export',
    notes: 'Figshare catalogue list delegating to FigshareVocabularyService with validated query.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'listSources',
    classification: 'list-search-export',
    notes: 'Figshare source list delegating to FigshareVocabularyService with validated query.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'getSource',
    classification: 'brand-bearing',
    notes: 'Figshare source read delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'listSourceCategories',
    classification: 'list-search-export',
    notes: 'Figshare source-category list delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'createSourcePreview',
    classification: 'brand-bearing',
    notes: 'Figshare source preview create delegating to FigshareVocabularyService with validated params and body.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'cloneSource',
    classification: 'brand-bearing',
    notes: 'Figshare source mirror clone delegating to FigshareVocabularyService with validated params and body.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'listSyncRuns',
    classification: 'list-search-export',
    notes: 'Figshare sync-run list delegating to FigshareVocabularyService with validated query.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'createPreview',
    classification: 'brand-bearing',
    notes: 'Figshare catalogue preview create carrying explicit brand scope plus actor context.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'getPreview',
    classification: 'brand-bearing',
    notes: 'Figshare preview read delegating to FigshareVocabularyService with validated params.',
  },
  {
    family: 'figshare-rva-state-crosswalks',
    service: 'webservice/FigshareVocabularyController',
    operation: 'applyPreview',
    classification: 'brand-bearing',
    notes: 'Figshare preview apply delegating to FigshareVocabularyService with validated params and body.',
  },
  // Webservice form/harvest/audit/named-query entries.
  {
    family: 'forms-record-types-workflows',
    service: 'webservice/FormManagementController',
    operation: 'getForm',
    classification: 'brand-bearing',
    notes: 'Form read resolving the request brand before FormsService lookup.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'webservice/FormManagementController',
    operation: 'listForms',
    classification: 'list-search-export',
    notes: 'Public form list resolving the request brand before FormsService read.',
  },
  {
    family: 'harvest-integration-state',
    service: 'webservice/HarvestRunController',
    operation: 'listRuns',
    classification: 'list-search-export',
    notes: 'Harvest-run list resolving the authorization context plus brand predicate.',
  },
  {
    family: 'harvest-integration-state',
    service: 'webservice/HarvestRunController',
    operation: 'getRun',
    classification: 'brand-bearing',
    notes: 'Harvest-run read resolving the authorization context plus brand.',
  },
  {
    family: 'harvest-integration-state',
    service: 'webservice/HarvestRunController',
    operation: 'listRunEvents',
    classification: 'list-search-export',
    notes: 'Harvest-run event list resolving the authorization context plus brand.',
  },
  {
    family: 'harvest-integration-state',
    service: 'webservice/IntegrationAuditController',
    operation: 'getAuditLog',
    classification: 'brand-bearing',
    notes: 'Integration audit read keyed by the request oid with validated status filter.',
  },
  {
    family: 'named-queries',
    service: 'webservice/NamedQueryController',
    operation: 'listQueries',
    classification: 'list-search-export',
    notes: 'Named-query list resolving the request brand.',
  },
  {
    family: 'named-queries',
    service: 'webservice/NamedQueryController',
    operation: 'getCollections',
    classification: 'brand-bearing',
    notes: 'Supported-collection read serving the brand-scoped query builder.',
  },
  {
    family: 'named-queries',
    service: 'webservice/NamedQueryController',
    operation: 'getQuery',
    classification: 'brand-bearing',
    notes: 'Named-query read resolving the request brand.',
  },
  {
    family: 'named-queries',
    service: 'webservice/NamedQueryController',
    operation: 'createQuery',
    classification: 'brand-bearing',
    notes: 'Named-query create resolving the request brand.',
  },
  {
    family: 'named-queries',
    service: 'webservice/NamedQueryController',
    operation: 'updateQuery',
    classification: 'brand-bearing',
    notes: 'Named-query update resolving the request brand.',
  },
  {
    family: 'named-queries',
    service: 'webservice/NamedQueryController',
    operation: 'deleteQuery',
    classification: 'brand-bearing',
    notes: 'Named-query delete resolving the request brand.',
  },
  // Webservice record entries: brand-aware API over the record services.
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Record create resolving the request brand before the authorized create flow.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'updateMeta',
    classification: 'brand-bearing',
    notes: 'Record update resolving the request brand before the authorized update flow.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'updateObjectMeta',
    classification: 'brand-bearing',
    notes: 'Record object update resolving the request brand before the authorized update flow.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'getMeta',
    classification: 'brand-bearing',
    notes: 'Record meta read constraining the response by the record brand.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'webservice/RecordController',
    operation: 'getRecordAudit',
    classification: 'brand-bearing',
    notes: 'Record audit read resolving the request brand before the authorized audit read.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'getObjectMeta',
    classification: 'brand-bearing',
    notes: 'Record object read resolving the request brand before the authorized read.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'addUserEdit',
    classification: 'brand-bearing',
    notes: 'Record edit-access grant resolving the request brand before the ACL mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'removeUserEdit',
    classification: 'brand-bearing',
    notes: 'Record edit-access revoke resolving the request brand before the ACL mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'addUserView',
    classification: 'brand-bearing',
    notes: 'Record view-access grant resolving the request brand before the ACL mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'removeUserView',
    classification: 'brand-bearing',
    notes: 'Record view-access revoke resolving the request brand before the ACL mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'getPermissions',
    classification: 'brand-bearing',
    notes: 'Record permission read resolving the request brand before the authorized summary.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'getDataStream',
    classification: 'brand-bearing',
    notes: 'Record datastream read resolving the request brand before the authorized read.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'addDataStreams',
    classification: 'brand-bearing',
    notes: 'Record datastream write resolving the request brand before the authorized mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'listRecords',
    classification: 'list-search-export',
    notes: 'Record list resolving the request brand plus ACL-filtered collection.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'listDeletedRecords',
    classification: 'list-search-export',
    notes: 'Deleted-record list resolving the request brand plus ACL-filtered collection.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'getDeletedRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record read delegating to getAuthorizedDeletedRecordMeta with the request brand.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'deleteRecord',
    classification: 'brand-bearing',
    notes: 'Record delete resolving the request brand before the authorized delete flow.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'destroyDeletedRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record destroy delegating to RecordsService with the request brand.',
  },
  {
    family: 'active-deleted-records',
    service: 'webservice/RecordController',
    operation: 'restoreRecord',
    classification: 'brand-bearing',
    notes: 'Deleted-record restore delegating to RecordsService with the request brand.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'webservice/RecordController',
    operation: 'transitionWorkflow',
    classification: 'brand-bearing',
    notes: 'Workflow transition resolving the request brand before the authorized transition flow.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'listDatastreams',
    classification: 'list-search-export',
    notes: 'Datastream list resolving the request brand before the authorized read.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'addRoleEdit',
    classification: 'brand-bearing',
    notes: 'Record role edit-access grant resolving the request brand before the ACL mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'removeRoleEdit',
    classification: 'brand-bearing',
    notes: 'Record role edit-access revoke resolving the request brand before the ACL mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'addRoleView',
    classification: 'brand-bearing',
    notes: 'Record role view-access grant resolving the request brand before the ACL mutation.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/RecordController',
    operation: 'removeRoleView',
    classification: 'brand-bearing',
    notes: 'Record role view-access revoke resolving the request brand before the ACL mutation.',
  },
  {
    family: 'harvest-integration-state',
    service: 'webservice/RecordController',
    operation: 'harvest',
    classification: 'brand-bearing',
    notes: 'Harvest submission resolving the authorization context plus record type before ingest.',
  },
  {
    family: 'harvest-integration-state',
    service: 'webservice/RecordController',
    operation: 'legacyHarvest',
    classification: 'brand-bearing',
    notes: 'Legacy harvest submission resolving the authorization context plus record type before ingest.',
  },
  // Webservice record-schema/type/report/search/translation/user entries.
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'webservice/RecordSchemaController',
    operation: 'create',
    classification: 'brand-bearing',
    notes: 'Record-schema create resolving branding, portal, and record type before the schema resolver.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'webservice/RecordSchemaController',
    operation: 'update',
    classification: 'brand-bearing',
    notes: 'Record-schema update resolving branding, portal, and record type before the schema resolver.',
  },
  {
    family: 'attachments-audit-related-integration-audit-schemas-forms',
    service: 'webservice/RecordSchemaController',
    operation: 'immutable',
    classification: 'brand-bearing',
    notes: 'Record-schema immutability read resolving branding and record type before the schema resolver.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'webservice/RecordTypeController',
    operation: 'getRecordType',
    classification: 'brand-bearing',
    notes: 'Record-type read delegating to RecordTypesService with the request brand.',
  },
  {
    family: 'forms-record-types-workflows',
    service: 'webservice/RecordTypeController',
    operation: 'listRecordTypes',
    classification: 'list-search-export',
    notes: 'Record-type list delegating to RecordTypesService with the request brand.',
  },
  {
    family: 'named-queries',
    service: 'webservice/ReportController',
    operation: 'executeNamedQuery',
    classification: 'brand-bearing',
    notes: 'Named-query execution resolving the request brand before config-driven run.',
  },
  {
    family: 'reports-exports',
    service: 'webservice/ReportController',
    operation: 'listConfigs',
    classification: 'list-search-export',
    notes: 'Report-config list resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'webservice/ReportController',
    operation: 'getConfig',
    classification: 'brand-bearing',
    notes: 'Report-config read resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'webservice/ReportController',
    operation: 'createConfig',
    classification: 'brand-bearing',
    notes: 'Report-config create resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'webservice/ReportController',
    operation: 'updateConfig',
    classification: 'brand-bearing',
    notes: 'Report-config update resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'webservice/ReportController',
    operation: 'deleteConfig',
    classification: 'brand-bearing',
    notes: 'Report-config delete resolving the request brand.',
  },
  {
    family: 'reports-exports',
    service: 'webservice/ReportController',
    operation: 'previewConfig',
    classification: 'brand-bearing',
    notes: 'Report-config preview resolving the request brand.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/SearchController',
    operation: 'search',
    classification: 'list-search-export',
    notes: 'Collection search resolving the authorization context plus brand predicate.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/SearchController',
    operation: 'index',
    classification: 'brand-bearing',
    notes: 'Single-record index request resolving the authorized record with update mode before enqueue.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/SearchController',
    operation: 'indexAll',
    classification: 'list-search-export',
    notes: 'Collection-wide index sweep resolving the authorized record collection with update mode.',
  },
  {
    family: 'record-acl-search-storage-exports',
    service: 'webservice/SearchController',
    operation: 'removeAll',
    classification: 'brand-bearing',
    notes: 'Collection-wide index removal resolving the authorized record collection.',
  },
  {
    family: 'translation-bundles',
    service: 'webservice/TranslationController',
    operation: 'listEntries',
    classification: 'brand-bearing',
    notes: 'Translation entry list resolving the request brand.',
  },
  {
    family: 'translation-bundles',
    service: 'webservice/TranslationController',
    operation: 'getEntry',
    classification: 'brand-bearing',
    notes: 'Translation entry read resolving the request brand.',
  },
  {
    family: 'translation-bundles',
    service: 'webservice/TranslationController',
    operation: 'setEntry',
    classification: 'brand-bearing',
    notes: 'Translation entry write resolving the request brand.',
  },
  {
    family: 'translation-bundles',
    service: 'webservice/TranslationController',
    operation: 'deleteEntry',
    classification: 'brand-bearing',
    notes: 'Translation entry delete resolving the request brand.',
  },
  {
    family: 'translation-bundles',
    service: 'webservice/TranslationController',
    operation: 'getBundle',
    classification: 'brand-bearing',
    notes: 'Translation bundle read resolving the request brand.',
  },
  {
    family: 'translation-bundles',
    service: 'webservice/TranslationController',
    operation: 'setBundle',
    classification: 'brand-bearing',
    notes: 'Translation bundle write resolving the request brand.',
  },
  {
    family: 'translation-bundles',
    service: 'webservice/TranslationController',
    operation: 'updateBundleEnabled',
    classification: 'brand-bearing',
    notes: 'Translation bundle flag write resolving the request brand with resource reload.',
  },
  // Webservice user-management entries.
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'listUsers',
    classification: 'list-search-export',
    notes: 'Brand-constrained user list via validated query.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'getUser',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user read resolving the target through findUserForBrand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'createUser',
    classification: 'brand-bearing',
    notes: 'User create translating role names to same-brand ids and delegating with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'updateUser',
    classification: 'brand-bearing',
    notes: 'User update translating role names to same-brand ids and delegating with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'generateAPIToken',
    classification: 'brand-bearing',
    notes: 'Brand-constrained API-token issuance resolving the target with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'revokeAPIToken',
    classification: 'brand-bearing',
    notes: 'Brand-constrained API-token revocation resolving the target with brandId.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'searchLinkCandidates',
    classification: 'list-search-export',
    notes: 'Brand-constrained link-candidate search.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'getUserLinks',
    classification: 'brand-bearing',
    notes: 'Brand-constrained linked-account read.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'linkAccounts',
    classification: 'brand-bearing',
    notes: 'Brand-constrained account link carrying actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'getUserAudit',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user audit read.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'listSystemRoles',
    classification: 'list-search-export',
    notes: 'Brand-constrained system-role list resolving the request brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'createSystemRole',
    classification: 'brand-bearing',
    notes: 'System-role create routing through RoleAdministrationService with request actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'disableUser',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user disable carrying actor and brand.',
  },
  {
    family: 'user-management-linking',
    service: 'webservice/UserManagementController',
    operation: 'enableUser',
    classification: 'brand-bearing',
    notes: 'Brand-constrained user enable carrying actor and brand.',
  },
  // Hook-owned entities declare ownership before merge.
  {
    family: 'hook-entities',
    service: 'HookLoader',
    operation: 'registerRedboxModels',
    classification: 'brand-bearing',
    notes:
      'Hook model registration contract: a hook dependency declaring sails.hasModels must export registerRedboxModels(); the loader records hookModels[modelName] = { module } ownership and generateModelShims embeds require(module).registerRedboxModels()[name] with globalId. Future hook models must declare global/brand ownership and a brand-aware contract.',
  },
]);
