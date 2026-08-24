import './sails';

export { Attachment } from './Attachment';
export { Controllers } from './CoreController';
export { Services } from './CoreService';
export { Datastream } from './Datastream';
export { StorageServiceResponse, StorageMutationResponse } from './StorageServiceResponse';
export {
  RecordSaveResponse,
  RecordSaveTracker,
  RECORD_VALIDATION_BYPASS_REASONS,
  createRecordSaveContext,
  isInternalRecordValidationBypass,
  isCanonicalSaveRequestId,
  isRecordValidationBypassReason,
  normalizeRecordConcurrencyContext,
  parsePublicValidationOperation,
  readSaveRequestId,
  recordSaveDisplayErrors,
  recordSaveFailureStatus,
  recordSaveProblem,
  resolveStorageMutationState,
} from './RecordSaveResponse';
export type {
  RecordConcurrencyContext,
  RecordSaveContext,
  RecordSaveOperation,
  RecordSaveRouteFamily,
  InternalRecordValidationBypass,
  RecordValidationBypassReason,
  StorageMutationLogger,
  PublicValidationOperationParseResult,
  RecordSaveDisplayError,
} from './RecordSaveResponse';
export { formatRecordFormFingerprint } from './RecordFormFingerprint';
export { emitRecordConcurrencyEvent, recordConcurrencyMetricLabels } from './RecordConcurrencyObservability';
export type {
  RecordConcurrencyEvent,
  RecordConcurrencyEventKind,
  RecordConcurrencyPreconditionResult,
} from './RecordConcurrencyObservability';
export {
  RECORD_HTTP_HEADERS,
  parsePublicRecordConcurrencyRequest,
  recordRepresentationConcurrency,
  recordRepresentationRevision,
  recordSaveResultHeaderOption,
  recordSaveResultHeaders,
} from './RecordHttpConcurrency';
export type {
  PublicRecordConcurrencyRequestErrorCode,
  PublicRecordConcurrencyRequestOptions,
  PublicRecordConcurrencyRequestResult,
  RecordRepresentationConcurrency,
} from './RecordHttpConcurrency';
export { normalizeAttachmentStagingFileId } from './AttachmentStagingIdentity';
export {
  FULL_RECORD_STORAGE_CONCURRENCY_CAPABILITIES,
  INITIAL_RECORD_REVISION,
  RECORD_STORAGE_CONCURRENCY_CAPABILITY_VERSION,
  RecordConcurrencyCapabilityError,
  assertFullRecordStorageConcurrencyCapability,
  assertStorageConcurrencyCapabilityForMode,
  hasFullRecordStorageConcurrencyCapability,
  nextRecordRevision,
  normalizeRecordStorageMutationOptions,
} from './RecordStorageConcurrency';
export type {
  RecordMutationPrecondition,
  RecordStorageConcurrencyCapabilities,
  RecordStorageMutationOptions,
  StorageCapabilityProvider,
  StorageMutationNonApplicationReason,
  StorageServiceCapabilities,
} from './RecordStorageConcurrency';
// Behavioural conformance checks hook-provided storage adapters run against
// their own dialect before declaring the record-concurrency capability.
export { STORAGE_CONCURRENCY_CONFORMANCE_CHECKS } from './testing/storageConcurrencyConformance';
export type {
  RecordConcurrencyAdapter,
  StorageConcurrencyConformanceCheck,
  StorageConcurrencyConformanceHarness,
} from './testing/storageConcurrencyConformance';
// Shared concurrency policy/result contracts are re-exported here so server
// code has one import site for record-save contracts.
export {
  DEFAULT_RECORD_CONCURRENT_MODIFICATION_CONFIG,
  DEFAULT_RECORD_CONCURRENT_MODIFICATION_MODE,
  coerceRecordConcurrentModificationConfig,
  isRecordConcurrencyMetadata,
  isRecordConcurrencyProblemCode,
  isRecordConcurrencyResolution,
  isRecordConcurrentModificationConfig,
  isRecordConcurrentModificationMode,
  isRecordEntityTag,
  isRecordFormFingerprint,
  isRecordRevision,
  resolveRecordConcurrentModificationConfig,
  resolveRecordConcurrentModificationMode,
  sanitizeRecordConcurrencyMetadata,
  validateRecordConcurrentModificationConfig,
  RECORD_CONCURRENCY_PROBLEM_CODES,
  RECORD_CONCURRENCY_RESOLUTIONS,
  RECORD_CONCURRENT_MODIFICATION_MODES,
} from '@researchdatabox/sails-ng-common';
export type {
  RecordConcurrencyMetadata,
  RecordConcurrencyProblemCode,
  RecordConcurrencyResolution,
  RecordConcurrentModificationConfigValidation,
} from '@researchdatabox/sails-ng-common';
export { formatRecordEntityTag, parseRecordEntityTag } from './RecordEntityTag';
export type {
  ParsedRecordEntityTag,
  RecordEntityTag,
  RecordEntityTagParseFailureReason,
  RecordEntityTagParseResult,
} from './RecordEntityTag';
export { DatastreamServiceResponse } from './DatastreamServiceResponse';

export { DatastreamService } from './DatastreamService';
export { QueueService } from './QueueService';
export { RecordsService } from './RecordsService';
export { HarvestRunService } from './HarvestRunService';
export type {
  RecordRelationshipExpandOptions,
  RecordRelationshipGraph,
  RecordRelationshipEdge,
  RecordMetaWithRelationships,
  LegacyRelatedRecordsResponse,
  RecordTypeLookupSummary,
} from './RecordsService';
export { classifyRecordWrite, recordWriteRequiresFormValidation } from './RecordWriteClassification';
export type { RecordWriteClassification } from './RecordWriteClassification';
export { SearchService } from './SearchService';
export {
  StorageService,
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  getMissingRecordSchemaStorageCapabilities,
} from './StorageService';
export type { RecordSchemaStorageCapabilityMethod } from './StorageService';
export { RecordAuditParams } from './RecordAuditParams';
export { IntegrationAuditParams } from './IntegrationAuditParams';
export type {
  IntegrationOutcome,
  IntegrationOutcomeSeverity,
  IntegrationStatusSummary,
  IntegrationStatusRecordContext,
  IntegrationOutcomeMapper,
} from './services/IntegrationAuditService';
export * from './model/storage/HarvestRunModel';
export { ILogger } from './Logger';

export * from './model';
export * from './record-contract';
export * from './decorator';
export * from './decorators';

export {
  compareHookPrecedence,
  discoverRedboxHookPackages,
  getHookPrecedenceOrder,
  getHookProcessingOrder,
  readHookLoadPriority,
} from './hooks/hookDiscovery';
export type {
  RedboxHookDiscoveryOptions,
  RedboxHookOrderConfig,
  RedboxHookPackageMetadata,
} from './hooks/hookDiscovery';
export {
  discoverRedboxHookResources,
  getHookAssetRoots,
  getHookViewRoots,
  resolveHookAssetFile,
  resolveHookViewFile,
} from './hooks/hookResources';
export type { RedboxHookResource, ResolvedHookFile } from './hooks/hookResources';

export { WaterlineModels } from './waterline-models';
export * from './transformers/ExportJSONTransformer';

export * from './configmodels/ConfigModels';
export * from './configmodels/MenuConfig';
export * from './configmodels/HomePanelConfig';
export * from './configmodels/AdminSidebarConfig';
export * from './configmodels/FigsharePublishing';
export * from './configmodels/RaidPublishing';
export { mintRaidProgram, runRaidProgram } from './services/raid-v2/runtime';
export * from './services/raid-v2/errors';
export * from './services/raid-v2/tags';
export type * from './services/raid-v2/types';
export * from './configmodels/OniPublishing';
export {
  DoiPublishing,
  DOI_PUBLISHING_SCHEMA,
  createDefaultBinding,
  fromDoiPublishingFormModel,
  resolveDoiConnectionPassword,
  toDoiPublishingFormModel,
} from './configmodels/DoiPublishing';
export type {
  DoiPublishingConfigData,
  DoiPublishingFormData,
  DoiProfile,
  DoiProfileFormEntry,
  DoiCreatorMapping,
  DoiContributorMapping,
  DoiTitleMapping,
  DoiSubjectMapping,
  DoiDateMapping,
  DoiIdentifierMapping,
  DoiRelatedIdentifierMapping,
  DoiRightsMapping,
  DoiDescriptionMapping,
  DoiGeoLocationMapping,
  DoiFundingReferenceMapping,
  DoiRelatedItemMapping,
} from './configmodels/DoiPublishing';
export * from './configmodels/AppConfig.interface';
export * from './configmodels/AuthorizedDomainsEmails';
export * from './configmodels/SystemMessage';

export { Policies } from './policies';

export { FormConfigExports } from './form-config';

import * as Middleware from './middleware/redboxSession';
export { Middleware };

import * as Responses from './responses';
export { Responses };

// Config types and default values
export * from './config';
export * from './action-execution';
export { Config, SailsConfig } from './config';

// Bootstrap functions
export { coreBootstrap, preLiftSetup, BootstrapProvider } from './bootstrap';
export {
  discoverRecordContractContributorRegistry,
  generateAllShims,
  mergeRedboxConfig,
} from './loader/index';
export type { LoaderOptions, GenerateAllShimsResult, RedboxMigration } from './loader/index';
export { createGeneratedBootstrap } from './loader/bootstrapShimRuntime';
export type { GeneratedHookBootstrap } from './loader/bootstrapShimRuntime';
export { runPendingMigrations } from './loader/MigrationRunner';

// Shims for backward compatibility
export * from './shims';

// Sails hooks
export * from './hooks';

// Services
export { ServiceExports } from './services';
export * from './services';

// Controllers
export {
  ControllerExports,
  WebserviceControllerExports,
  ControllerNames,
  WebserviceControllerNames,
} from './controllers';
export * from './controllers';

// Visitors
export * from './visitor/attachment-fields.visitor';
export * from './visitor/client.visitor';
export * from './visitor/construct.visitor';
export * from './visitor/context-variables.visitor';
export * from './visitor/data-value.visitor';
export * from './visitor/json-type-def.visitor';
export * from './visitor/migrate-config-v4-v5.visitor';
export * from './visitor/template.visitor';
export * from './visitor/validator.visitor';
export * from './visitor/vocab-inline.visitor';
export * from './utilities/ContextVariableUtils';
export * from './visitor/visitor-helpers';
export * from './api-routes';
