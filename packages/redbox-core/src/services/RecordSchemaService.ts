import { createHash } from 'node:crypto';
import { metrics, type Attributes } from '@opentelemetry/api';
import { VALIDATION_OPERATION_NAME_PATTERN, type FormComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

import { Services as services } from '../CoreService';
import {
  recordSchema as defaultRecordSchemaConfig,
  type RecordSchemaConfig,
  type RecordSchemaConfigurationProblemReason,
  type RecordSchemaIntegrationPinConfig,
  MAX_RECORD_SCHEMA_INTEGRATION_PINS,
  normalizeRecordSchemaConfig,
  validateRecordSchemaConfig,
} from '../config/recordSchema.config';
import type {
  RecordSchemaArtifactInput,
  RecordSchemaArtifactModel,
  RecordSchemaArtifactSummary,
  RecordSchemaAuthorizationGrantQuery,
  RecordSchemaCreateGrantReferenceInput,
  RecordSchemaGrantReferenceInput,
  RecordSchemaPinReferenceInput,
  RecordSchemaRetentionReason,
  RecordSchemaRetentionReportEntry,
  RecordSchemaSaveReferenceInput,
  RecordSchemaUpdateGrantReferenceInput,
} from '../model/storage/record-schema';
import type { RecordSchemaProblem, ResolveRecordSchemaResult } from '../model/record-contract';
import {
  compileRecordJsonSchemaArtifact,
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  getDiscoveredRecordContractContributorComponentTypes,
  getDiscoveredRecordContractContributorRegistrationIssues,
  getDiscoveredRecordContractContributorRegistry,
  identifyRecordJsonSchema,
  normalizeRedboxCanonicalJsonV1,
  normalizeRecordJsonSchemaDocument,
  parseRecordJsonSchemaEtag,
  RecordContractCompiler,
  RecordContractContextResolutionError,
  RecordJsonSchemaCompilationError,
  RecordJsonSchemaDocumentLimitError,
  RecordJsonSchemaIdentityError,
  RecordJsonSchemaRendererError,
  RecordSchemaValidatorCache,
  RECORD_CONTRACT_REGISTRATION_CODES,
  renderRecordJsonSchema,
  serializeRedboxCanonicalJsonV1,
  type ContractJsonObject,
  type ContractJsonValue,
  type PublishedRecordJsonSchemaDocument,
  type RecordContractCompileFailureKind,
  type RecordContractContext,
  type RecordContractContextActor,
  type RecordContractContextFailureKind,
  type RecordContractCreateContext,
  type RecordContractCreateContextRequest,
  type RecordContractContributorRegistry,
  type RecordContractDiagnostic,
  type RecordContractFormBuildResult,
  type RecordContractEffectiveForm,
  type RecordContractFormat,
  type RecordContractRegistrationCode,
  type RecordContractRegistrationIssue,
  type RecordContractUpdateContext,
  type RecordContractUpdateContextRequest,
  type RecordJsonSchemaEtag,
  type RecordJsonSchemaEtagParseFailureReason,
  type RecordJsonSchemaValidationIssue,
  type RecordJsonSchemaValidationResult,
  type RecordSchemaProblemCode,
} from '../record-contract';
import {
  getMissingRecordSchemaStorageCapabilities,
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  type StorageService,
  type RecordSchemaStorageCapabilityMethod,
} from '../StorageService';
import { RECORD_SCHEMA_PROBLEM_CODES } from '../record-contract/codes';
import type { StorageServiceResponse } from '../StorageServiceResponse';
import type { ConfiguredRecordContractFormCandidate, FormRecordAccessContext } from './FormsService';
import type { ILogger } from '../Logger';
import {
  isInternalRecordSchemaCreateAuthorizationCapability,
  isInternalRecordSchemaUpdateAuthorizationCapability,
} from './internal-record-schema-authorization';

declare const RedboxJavaStorageService: unknown;

export const RECORD_SCHEMA_LIFECYCLE_ERROR_CODE = 'record-schema.lifecycle-failed' as const;

export type RecordSchemaPinProblemReason =
  | RecordSchemaConfigurationProblemReason
  | 'normalized-non-empty'
  | 'maximum-length'
  | 'digest'
  | 'schema-kind'
  | 'datetime'
  | 'operation';

export type RecordSchemaLifecycleFinding =
  | {
      readonly category: 'configuration';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID;
      readonly path: string;
      readonly reason: RecordSchemaConfigurationProblemReason | 'unreadable';
    }
  | {
      readonly category: 'storage';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE;
      readonly method: RecordSchemaStorageCapabilityMethod;
    }
  | {
      readonly category: 'contributor';
      readonly code:
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_DUPLICATE;
      readonly registrationCode: RecordContractRegistrationCode;
      readonly key: string;
    }
  | {
      readonly category: 'coverage';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.UNSUPPORTED_COMPONENT;
      readonly componentType: string;
    }
  | {
      readonly category: 'form';
      readonly code: RecordSchemaProblemCode;
      readonly form: string;
      readonly stage: 'candidate' | 'compiler' | 'renderer' | 'artifact';
    }
  | {
      readonly category: 'pin';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID;
      readonly path: string;
      readonly reason: RecordSchemaPinProblemReason;
    };

export interface RecordSchemaServiceDependencies {
  readonly getConfig: () => unknown;
  readonly getStorageProvider: () => unknown;
  readonly getContributorRegistry: () => RecordContractContributorRegistry | undefined;
  readonly getContributorRegistrationIssues: () => readonly RecordContractRegistrationIssue[];
  readonly getContributorComponentTypes: () => readonly string[];
  readonly getConfiguredFormCandidates: () => readonly ConfiguredRecordContractFormCandidate[];
  readonly resolveContractContext: (
    request: RecordContractCreateContextRequest | RecordContractUpdateContextRequest
  ) => Promise<RecordContractContext>;
  readonly buildContractFormConfig: (
    context: RecordContractContext,
    recordAccessContext?: FormRecordAccessContext
  ) => Promise<RecordContractFormBuildResult>;
  readonly authorizeCreate: (context: RecordContractCreateContext, caller: FormRecordAccessContext) => Promise<boolean>;
  readonly authorizeUpdate: (context: RecordContractUpdateContext, caller: FormRecordAccessContext) => Promise<boolean>;
  readonly telemetryLogger?: Pick<ILogger, 'info' | 'error'>;
  readonly clock: () => number;
}

interface RecordSchemaLifecycleInspection {
  readonly disabled: boolean;
  readonly config?: RecordSchemaConfig;
  readonly registry?: RecordContractContributorRegistry;
  readonly findings: readonly RecordSchemaLifecycleFinding[];
}

const CATEGORY_ORDER: Readonly<Record<RecordSchemaLifecycleFinding['category'], number>> = {
  configuration: 0,
  storage: 1,
  contributor: 2,
  coverage: 3,
  form: 4,
  pin: 5,
};

const DUPLICATE_REGISTRATION_CODES: ReadonlySet<RecordContractRegistrationCode> = new Set([
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_KEY,
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_NAMESPACE,
]);

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_DIAGNOSTIC_IDENTIFIER = /^[A-Za-z0-9@._:/-]{1,200}$/;
const RECORD_SCHEMA_REFERENCE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,511}$/;
export const RECORD_SCHEMA_CONFIGURED_FORM_MAX_CANDIDATES = 1_000;
const RECORD_SCHEMA_RETENTION_REFERENCE_LIMIT = 1_000;
const RECORD_SCHEMA_RETENTION_REPORT_MAX_DIGESTS = 100;
export const RECORD_SCHEMA_RETENTION_REPORT_DEFAULT_PAGE_SIZE = 100;
export const RECORD_SCHEMA_RETENTION_REPORT_MAX_PAGE_SIZE = 100;
const RECORD_SCHEMA_STRICT_ALL_OPERATION = 'strict-all';
const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1_000;
/** Maximum exact startup finding count exposed in one structured log event. */
export const RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX = 100;

const recordSchemaMeter = metrics.getMeter('redbox.record-schema');
const recordSchemaCompileDuration = recordSchemaMeter.createHistogram('redbox.record_schema.compile.duration', {
  description: 'Record-schema compilation duration.',
  unit: 'ms',
});
const recordSchemaCompileOutcomes = recordSchemaMeter.createCounter('redbox.record_schema.compile.outcomes', {
  description: 'Record-schema compilation outcomes.',
  unit: '{compile}',
});
const recordSchemaCacheResults = recordSchemaMeter.createCounter('redbox.record_schema.cache.results', {
  description: 'Record-schema validator cache results.',
  unit: '{lookup}',
});
const recordSchemaCompleteness = recordSchemaMeter.createCounter('redbox.record_schema.completeness', {
  description: 'Resolved record-schema completeness.',
  unit: '{schema}',
});
const recordSchemaResolverOutcomes = recordSchemaMeter.createCounter('redbox.record_schema.resolver.outcomes', {
  description: 'Record-schema resolver outcomes.',
  unit: '{resolution}',
});
const recordSchemaValidationResults = recordSchemaMeter.createCounter('redbox.record_schema.validation.results', {
  description: 'Record-schema structural validation results.',
  unit: '{validation}',
});
const recordSchemaValidationProblems = recordSchemaMeter.createCounter('redbox.record_schema.validation.problems', {
  description: 'Record-schema structural validation problems by stable code.',
  unit: '{problem}',
});
const recordSchemaPreconditionMismatches = recordSchemaMeter.createCounter(
  'redbox.record_schema.precondition.mismatches',
  { description: 'Record-schema update precondition mismatches.', unit: '{mismatch}' }
);
const recordSchemaPersistence = recordSchemaMeter.createCounter('redbox.record_schema.persistence', {
  description: 'Record-schema artifact and grant persistence outcomes.',
  unit: '{write}',
});
const recordSchemaUsageReferences = recordSchemaMeter.createCounter('redbox.record_schema.usage_references', {
  description: 'Record-schema save and pin usage-reference outcomes.',
  unit: '{reference}',
});
const recordSchemaTelemetryCodes: ReadonlySet<string> = new Set(Object.values(RECORD_SCHEMA_PROBLEM_CODES));
const RECORD_SCHEMA_RESOLVER_OUTCOMES: ReadonlySet<string> = new Set([
  'resolved',
  'partial',
  'unavailable',
  'context-failed',
  'limit-exceeded',
  'compiler-failed',
  'meta-validation-failed',
  'storage-failed',
  'denied',
  'missing-oid',
  'invalid-precondition',
  'precondition-failed',
  'invalid-request',
  'not-found',
  'invalid-contract',
  'not-modified',
]);
const RECORD_SCHEMA_COMPILE_OUTCOMES: ReadonlySet<string> = new Set([
  'resolved',
  'context-failed',
  'unavailable',
  'limit-exceeded',
  'compiler-failed',
  'meta-validation-failed',
  'unexpected-failure',
]);
const RECORD_SCHEMA_USAGE_REFERENCE_OUTCOMES: ReadonlySet<string> = new Set([
  'recorded',
  'write-failed',
  'invalid-input',
  'disabled',
  'unavailable',
  'materialized',
  'failed',
  'limit-exceeded',
]);

type RecordSchemaTelemetryKind = 'create' | 'update' | 'unknown';
type RecordSchemaLogContext =
  | 'resolve-create'
  | 'resolve-create-context'
  | 'resolve-create-authorization'
  | 'resolve-update'
  | 'resolve-update-context'
  | 'resolve-update-authorization'
  | 'resolve-immutable'
  | 'resolve-immutable-storage-provider'
  | 'resolve-immutable-artifact-read'
  | 'resolve-immutable-grant-list'
  | 'resolve-immutable-grant-contract'
  | 'resolve-immutable-artifact-touch'
  | 'validation-compile'
  | 'validation-run'
  | 'save-reference'
  | 'save-reference-storage-provider'
  | 'save-reference-storage'
  | 'integration-pin-maintenance'
  | 'integration-pin-storage-provider'
  | 'integration-pin-write'
  | 'integration-pin-startup'
  | 'integration-pins'
  | 'retention-artifact-list'
  | 'retention-artifact-read'
  | 'retention-storage-provider'
  | 'retention-reference-read'
  | 'retention-reference-overflow-read'
  | 'compile'
  | 'compile-form-build'
  | 'compile-contributors'
  | 'compile-renderer'
  | 'compile-artifact'
  | 'cache-populate'
  | 'compile-normalization'
  | 'persist-artifact'
  | 'persist-grant'
  | 'persist-storage-provider'
  | 'runtime-configuration'
  | 'startup-configuration'
  | 'startup-storage'
  | 'startup-contributors'
  | 'startup-registry'
  | 'startup-coverage'
  | 'startup-configured-forms'
  | 'lifecycle';
type RecordSchemaSafeLogValues =
  | Readonly<{ error_type: 'error' | 'non-error' }>
  | Readonly<{
      status: 'passed' | 'failed' | 'disabled';
      finding_count?: number;
      finding_count_bucket?: 'overflow';
    }>
  | Readonly<Record<string, never>>;

function metricKind(value: unknown): RecordSchemaTelemetryKind {
  return value === 'create' || value === 'update' ? value : 'unknown';
}

function recordCounter(
  counter: Readonly<{ add: (value: number, attributes?: Attributes) => void }>,
  attributes: Attributes
): void {
  try {
    counter.add(1, attributes);
  } catch {
    // Telemetry must never alter service results.
  }
}

function recordDuration(durationMs: number, attributes: Attributes): void {
  try {
    recordSchemaCompileDuration.record(Number.isFinite(durationMs) && durationMs >= 0 ? durationMs : 0, attributes);
  } catch {
    // Telemetry must never alter service results.
  }
}

function telemetryCode(value: unknown): string {
  return typeof value === 'string' && recordSchemaTelemetryCodes.has(value) ? value : 'none';
}

function telemetryDimension(value: unknown, allowlist: ReadonlySet<string>, fallback: string): string {
  return typeof value === 'string' && allowlist.has(value) ? value : fallback;
}

function safeErrorType(error: unknown): 'error' | 'non-error' {
  return error instanceof Error ? 'error' : 'non-error';
}

function unreadableConfigurationFinding(): RecordSchemaLifecycleFinding {
  return {
    category: 'configuration',
    code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    path: 'recordSchema',
    reason: 'unreadable',
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isReflectable(value: unknown): value is object {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

function configuredRecordSchema(): unknown {
  const configured = sails.config.recordSchema;
  if (configured === undefined) return defaultRecordSchemaConfig;
  if (!isObjectRecord(configured)) return configured;

  // Sails environment overrides can replace the nested config object rather
  // than deep-merging it with config/recordSchema.js. Preserve partial
  // overrides while keeping the required defaults available to runtime
  // validation. An explicitly supplied non-object nested value remains
  // untouched so malformed configuration is still reported as invalid.
  const hasOwn = (property: string): boolean => Object.prototype.hasOwnProperty.call(configured, property);
  const configuredLimits = hasOwn('limits') ? configured.limits : undefined;
  const configuredRetention = hasOwn('retention') ? configured.retention : undefined;
  return {
    ...defaultRecordSchemaConfig,
    ...configured,
    limits:
      configuredLimits === undefined
        ? defaultRecordSchemaConfig.limits
        : isObjectRecord(configuredLimits)
          ? { ...defaultRecordSchemaConfig.limits, ...configuredLimits }
          : configuredLimits,
    retention:
      configuredRetention === undefined
        ? defaultRecordSchemaConfig.retention
        : isObjectRecord(configuredRetention)
          ? { ...defaultRecordSchemaConfig.retention, ...configuredRetention }
          : configuredRetention,
  };
}

function configuredStorageProvider(): unknown {
  const storageConfig = sails.config.storage;
  if (isObjectRecord(storageConfig)) {
    const serviceName = storageConfig.serviceName;
    if (typeof serviceName === 'string' && serviceName.trim() !== '') {
      return sails.services?.[serviceName];
    }
  }
  return typeof RedboxJavaStorageService === 'undefined' ? undefined : RedboxJavaStorageService;
}

interface RecordEditAuthorizationCapability {
  readonly hasEditAccess: (
    brand: FormRecordAccessContext['brand'],
    user: FormRecordAccessContext['user'],
    roles: FormRecordAccessContext['user']['roles'],
    record: Readonly<Record<string, unknown>>
  ) => boolean;
}

interface RecordCreateAuthorizationCapability {
  readonly hasCreateAccess: (
    brand: FormRecordAccessContext['brand'],
    user: FormRecordAccessContext['user'],
    roles: FormRecordAccessContext['user']['roles'],
    recordType: string,
    workflowStep: string
  ) => Promise<boolean>;
}

function hasRecordEditAuthorizationCapability(value: unknown): value is RecordEditAuthorizationCapability {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    return typeof Reflect.get(value, 'hasEditAccess') === 'function';
  } catch {
    return false;
  }
}

function hasRecordCreateAuthorizationCapability(value: unknown): value is RecordCreateAuthorizationCapability {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    return typeof Reflect.get(value, 'hasCreateAccess') === 'function';
  } catch {
    return false;
  }
}

function recordsAuthorizationService(): unknown {
  const configured = sails.services?.recordsservice;
  return configured === undefined && typeof RecordsService !== 'undefined' ? RecordsService : configured;
}

function recordEditAuthorizationService(): RecordEditAuthorizationCapability | undefined {
  const candidate = recordsAuthorizationService();
  return hasRecordEditAuthorizationCapability(candidate) ? candidate : undefined;
}

async function authorizeCreateWithRecordsService(
  context: RecordContractCreateContext,
  caller: FormRecordAccessContext
): Promise<boolean> {
  const recordsService = recordsAuthorizationService();
  if (!hasRecordCreateAuthorizationCapability(recordsService)) {
    throw new Error('Record create authorization is unavailable.');
  }
  const username = typeof caller.user?.username === 'string' ? caller.user.username.trim() : '';
  const brandId = typeof caller.brand?.id === 'string' ? caller.brand.id.trim() : '';
  if (!username || brandId !== context.publicContext.brand || !context.resolution.actor.authenticated) {
    return false;
  }
  const roles = Array.isArray(caller.user.roles) ? caller.user.roles : [];
  return await recordsService.hasCreateAccess(
    caller.brand,
    caller.user,
    roles,
    context.publicContext.recordType,
    context.publicContext.workflowStep
  );
}

async function authorizeUpdateWithRecordsService(
  context: RecordContractUpdateContext,
  caller: FormRecordAccessContext
): Promise<boolean> {
  const recordsService = recordEditAuthorizationService();
  if (!recordsService) {
    throw new Error('Record edit authorization is unavailable.');
  }
  const username = typeof caller.user?.username === 'string' ? caller.user.username.trim() : '';
  const brandId = typeof caller.brand?.id === 'string' ? caller.brand.id.trim() : '';
  if (!username || brandId !== context.publicContext.brand || !context.resolution.actor.authenticated) {
    return false;
  }
  const roles = Array.isArray(caller.user.roles) ? caller.user.roles : [];
  return recordsService.hasEditAccess(caller.brand, caller.user, roles, context.resolution.existingRecord);
}

const DEFAULT_DEPENDENCIES: RecordSchemaServiceDependencies = {
  getConfig: configuredRecordSchema,
  getStorageProvider: configuredStorageProvider,
  getContributorRegistry: getDiscoveredRecordContractContributorRegistry,
  getContributorRegistrationIssues: getDiscoveredRecordContractContributorRegistrationIssues,
  getContributorComponentTypes: getDiscoveredRecordContractContributorComponentTypes,
  getConfiguredFormCandidates: () => FormsService.listConfiguredRecordContractForms(),
  resolveContractContext: request => RecordValidationService.resolveContractContext(request),
  buildContractFormConfig: (context, recordAccessContext) =>
    FormsService.buildContractFormConfig(context, recordAccessContext),
  authorizeCreate: authorizeCreateWithRecordsService,
  authorizeUpdate: authorizeUpdateWithRecordsService,
  clock: () => Date.now(),
};

function findingSortKey(finding: RecordSchemaLifecycleFinding): string {
  switch (finding.category) {
    case 'configuration':
      return `${finding.path}\u0000${finding.reason}`;
    case 'storage': {
      const methodIndex = RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS.indexOf(finding.method);
      return `${String(methodIndex).padStart(2, '0')}\u0000${finding.method}`;
    }
    case 'contributor':
      return `${finding.registrationCode}\u0000${finding.key}`;
    case 'coverage':
      return finding.componentType;
    case 'form':
      return `${finding.form}\u0000${finding.stage}\u0000${finding.code}`;
    case 'pin':
      return `${finding.path}\u0000${finding.reason}`;
  }
}

function sortFindings(findings: readonly RecordSchemaLifecycleFinding[]): RecordSchemaLifecycleFinding[] {
  return [...findings].sort(
    (left, right) =>
      CATEGORY_ORDER[left.category] - CATEGORY_ORDER[right.category] ||
      compareText(findingSortKey(left), findingSortKey(right))
  );
}

function diagnosticIdentifier(value: string): string {
  return SAFE_DIAGNOSTIC_IDENTIFIER.test(value) ? value : '<invalid-identifier>';
}

function findingMessage(finding: RecordSchemaLifecycleFinding): string {
  switch (finding.category) {
    case 'configuration':
      return `${finding.code} [${finding.path}]: configuration is invalid (${finding.reason}).`;
    case 'storage':
      return `${finding.code} [${finding.method}]: required record-schema storage method is unavailable.`;
    case 'contributor':
      return `${finding.code} [${diagnosticIdentifier(finding.key)}]: contributor registration is invalid (${finding.registrationCode}).`;
    case 'coverage':
      return `${finding.code} [${finding.componentType}]: core component has no registered record-contract contributor.`;
    case 'form':
      return `${finding.code} [${finding.form}]: configured form compilation failed (${finding.stage}).`;
    case 'pin':
      return `${finding.code} [${finding.path}]: configured integration pin is invalid (${finding.reason}).`;
  }
}

export class RecordSchemaLifecycleError extends Error {
  public readonly code = RECORD_SCHEMA_LIFECYCLE_ERROR_CODE;
  public readonly findings: readonly RecordSchemaLifecycleFinding[];

  public constructor(findings: readonly RecordSchemaLifecycleFinding[]) {
    const sorted = sortFindings(findings);
    super(
      `RecordSchemaService initialization failed with ${sorted.length} fatal finding(s):\n${sorted
        .map(finding => `- ${findingMessage(finding)}`)
        .join('\n')}`
    );
    this.name = 'RecordSchemaLifecycleError';
    this.findings = Object.freeze(sorted.map(finding => Object.freeze({ ...finding })));
  }
}

function configurationFindings(value: unknown): RecordSchemaLifecycleFinding[] {
  const validation: ReturnType<typeof validateRecordSchemaConfig> = validateRecordSchemaConfig(value);
  if (validation.valid) {
    return [];
  }

  const rawPins = isObjectRecord(value) && Array.isArray(value.integrationPins) ? value.integrationPins : undefined;
  const findings: RecordSchemaLifecycleFinding[] = [];
  for (const problem of validation.problems) {
    if (!problem.path.startsWith('recordSchema.integrationPins')) {
      findings.push({
        category: 'configuration',
        code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        path: problem.path,
        reason: problem.reason,
      });
      continue;
    }

    const itemMatch = /^recordSchema\.integrationPins\.(\d+)$/.exec(problem.path);
    if (itemMatch && rawPins && isObjectRecord(rawPins[Number(itemMatch[1])])) {
      continue;
    }
    findings.push({
      category: 'pin',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
      path: problem.path,
      reason: problem.reason,
    });
  }
  return findings;
}

function pinFinding(path: string, reason: RecordSchemaPinProblemReason): RecordSchemaLifecycleFinding {
  return {
    category: 'pin',
    code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    path,
    reason,
  };
}

function validatePinText(
  pin: Record<string, unknown>,
  index: number,
  property: string,
  maximumLength: number
): RecordSchemaLifecycleFinding[] {
  const path = `recordSchema.integrationPins.${index}.${property}`;
  const value = pin[property];
  if (value === undefined) {
    return [pinFinding(path, 'required')];
  }
  if (typeof value !== 'string') {
    return [pinFinding(path, 'type')];
  }
  if (value.length === 0 || value !== value.trim()) {
    return [pinFinding(path, 'normalized-non-empty')];
  }
  if (value.length > maximumLength) {
    return [pinFinding(path, 'maximum-length')];
  }
  return [];
}

function integrationPinFindings(value: unknown): RecordSchemaLifecycleFinding[] {
  if (!isObjectRecord(value) || !Array.isArray(value.integrationPins)) {
    return [];
  }
  if (value.integrationPins.length > MAX_RECORD_SCHEMA_INTEGRATION_PINS) {
    return [];
  }

  const findings: RecordSchemaLifecycleFinding[] = [];
  value.integrationPins.forEach((candidate, index) => {
    if (!isObjectRecord(candidate)) {
      return;
    }
    for (const property of ['digest', 'brand', 'portal', 'recordType', 'owner'] as const) {
      findings.push(...validatePinText(candidate, index, property, 512));
    }
    findings.push(...validatePinText(candidate, index, 'purpose', 2_048));

    const digest = candidate.digest;
    if (typeof digest === 'string' && digest === digest.trim() && digest.length > 0 && !DIGEST_PATTERN.test(digest)) {
      findings.push(pinFinding(`recordSchema.integrationPins.${index}.digest`, 'digest'));
    }
    if (candidate.schemaKind !== 'create' && candidate.schemaKind !== 'update') {
      findings.push(
        pinFinding(
          `recordSchema.integrationPins.${index}.schemaKind`,
          candidate.schemaKind === undefined ? 'required' : 'schema-kind'
        )
      );
    }
    const operation = candidate.operation;
    if (operation === undefined) {
      findings.push(pinFinding(`recordSchema.integrationPins.${index}.operation`, 'required'));
    } else if (typeof operation !== 'string' || !VALIDATION_OPERATION_NAME_PATTERN.test(operation.trim())) {
      findings.push(pinFinding(`recordSchema.integrationPins.${index}.operation`, 'operation'));
    }
    if (candidate.expiresAt !== undefined) {
      const expiresAt = candidate.expiresAt;
      if (
        typeof expiresAt !== 'string' ||
        expiresAt.length === 0 ||
        expiresAt !== expiresAt.trim() ||
        !canonicalInstant(expiresAt)
      ) {
        findings.push(pinFinding(`recordSchema.integrationPins.${index}.expiresAt`, 'datetime'));
      }
    }
  });
  return findings;
}

const RFC_3339_INSTANT_PATTERN =
  /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function canonicalInstant(value: string): Date | undefined {
  if (!RFC_3339_INSTANT_PATTERN.test(value)) return undefined;
  const [year, month, day] = value
    .slice(0, 10)
    .split('-')
    .map(component => Number(component));
  if (day > new Date(Date.UTC(year, month, 0)).getUTCDate()) return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const date = new Date(milliseconds);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function configuredFindings(value: unknown): RecordSchemaLifecycleFinding[] {
  try {
    return [...configurationFindings(value), ...integrationPinFindings(value)];
  } catch {
    return [unreadableConfigurationFinding()];
  }
}

function storageFindings(provider: unknown): RecordSchemaLifecycleFinding[] {
  let missing: readonly RecordSchemaStorageCapabilityMethod[];
  try {
    missing = getMissingRecordSchemaStorageCapabilities(provider);
  } catch {
    missing = RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS;
  }
  return missing.map(method => ({
    category: 'storage',
    code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
    method,
  }));
}

function contributorFindings(issues: readonly RecordContractRegistrationIssue[]): RecordSchemaLifecycleFinding[] {
  return issues.map(issue => ({
    category: 'contributor',
    code: DUPLICATE_REGISTRATION_CODES.has(issue.code)
      ? RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_DUPLICATE
      : RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID,
    registrationCode: issue.code,
    key: diagnosticIdentifier(issue.key),
  }));
}

function unavailableContributorStateIssue(): RecordContractRegistrationIssue {
  return {
    code: RECORD_CONTRACT_REGISTRATION_CODES.INVALID_EXPORT,
    key: 'registry',
    detail: 'Contributor discovery state is unavailable.',
  };
}

function coverageFindings(componentTypes: readonly string[]): RecordSchemaLifecycleFinding[] {
  const covered = new Set(componentTypes);
  return Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY)
    .filter(componentType => !covered.has(componentType))
    .map(componentType => ({
      category: 'coverage',
      code: RECORD_SCHEMA_PROBLEM_CODES.UNSUPPORTED_COMPONENT,
      componentType,
    }));
}

function isDisabled(value: unknown): boolean {
  const normalized = normalizeRecordSchemaConfig(value);
  return isObjectRecord(normalized) && normalized.enabled === false;
}

export interface ResolveCreateRecordSchemaRequest {
  /** Internal persisted brand identifier used for authoritative form and record lookup. */
  readonly brand: string;
  /** Canonical public branding route segment. Defaults to `brand` for internal compatibility. */
  readonly branding?: string;
  readonly portal: string;
  readonly recordType: string;
  readonly operation?: string;
  readonly targetStep?: string;
  /** Trusted current caller used by the authoritative record-create ACL path. */
  readonly caller: FormRecordAccessContext;
  /** Process-local capability issued after the normal record-create boundary authorizes this write. */
  readonly internalAuthorizationCapability?: unknown;
}

export interface RecordSchemaCreateResolutionMetadata {
  readonly schemaKind: 'create';
  readonly contractFormat: RecordContractFormat;
  readonly completeness: 'complete' | 'partial';
  readonly byteLength: number;
  readonly etag: RecordJsonSchemaEtag;
  readonly context: RecordContractCreateContext['publicContext'];
}

interface RecordSchemaCreateResolutionSuccessBase {
  readonly document: PublishedRecordJsonSchemaDocument;
  readonly digest: string;
  readonly metadata: RecordSchemaCreateResolutionMetadata;
  readonly grant: RecordSchemaCreateGrantReferenceInput;
}

export interface CompleteRecordSchemaCreateResolution extends RecordSchemaCreateResolutionSuccessBase {
  readonly kind: 'resolved';
  readonly metadata: RecordSchemaCreateResolutionMetadata & { readonly completeness: 'complete' };
}

export interface PartialRecordSchemaCreateResolution extends RecordSchemaCreateResolutionSuccessBase {
  readonly kind: 'partial';
  readonly metadata: RecordSchemaCreateResolutionMetadata & { readonly completeness: 'partial' };
}

export interface RecordSchemaCreateContextFailure {
  readonly kind: 'context-failed';
  readonly failureKind: RecordContractContextFailureKind;
  readonly diagnosticCodes: readonly string[];
  readonly reason?: 'empty-effective-form';
}

export interface RecordSchemaCreateCompilerFailure {
  readonly kind: 'compiler-failed';
  readonly failureKind: Exclude<RecordContractCompileFailureKind, 'limit-exceeded'> | 'renderer';
  readonly code: RecordSchemaProblemCode;
  readonly diagnostics: readonly RecordContractDiagnostic[];
}

export interface RecordSchemaCreateMetaValidationFailure {
  readonly kind: 'meta-validation-failed';
  readonly reason: 'metaschema' | 'compile' | 'identity' | 'artifact';
  readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT;
  readonly issues: readonly RecordJsonSchemaValidationIssue[];
}

export interface RecordSchemaCreateLimitFailure {
  readonly kind: 'limit-exceeded';
  readonly stage: 'compiler' | 'artifact';
  readonly code: RecordSchemaProblemCode;
  readonly diagnostics: readonly RecordContractDiagnostic[];
  readonly byteLength?: number;
  readonly maximum?: number;
}

export interface RecordSchemaArtifactStorageFailure {
  readonly kind: 'storage-failed';
  readonly stage: 'artifact';
  readonly code:
    | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE
    | typeof RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED
    | typeof RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION;
}

export interface RecordSchemaGrantStorageFailure {
  readonly kind: 'storage-failed';
  readonly stage: 'grant';
  /** The artifact write succeeded before the grant was attempted. Retrying reuses this immutable identity. */
  readonly artifact: Readonly<{
    digest: string;
    persisted: true;
  }>;
  readonly grantReferenceKey: string;
}

export type RecordSchemaGrantWriteFailure = RecordSchemaGrantStorageFailure & RecordSchemaReferenceWriteFailure;

export type RecordSchemaCreateStorageFailure = RecordSchemaArtifactStorageFailure | RecordSchemaGrantWriteFailure;

export interface RecordSchemaCreateUnavailableFailure {
  readonly kind: 'unavailable';
  readonly stage: 'configuration' | 'contributors';
  readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID | typeof RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE;
}

export type ResolveCreateRecordSchemaResult =
  | CompleteRecordSchemaCreateResolution
  | PartialRecordSchemaCreateResolution
  | RecordSchemaCreateContextFailure
  | RecordSchemaCreateCompilerFailure
  | RecordSchemaCreateMetaValidationFailure
  | RecordSchemaCreateLimitFailure
  | RecordSchemaCreateStorageFailure
  | RecordSchemaCreateUnavailableFailure;

export interface ResolveUpdateRecordSchemaRequest {
  /** Internal persisted brand identifier used for authoritative form and record lookup. */
  readonly brand: string;
  /** Canonical public branding route segment. Defaults to `brand` for internal compatibility. */
  readonly branding?: string;
  readonly portal: string;
  readonly oid: string;
  readonly operation?: string;
  /** Optional raw If-Match value evaluated against the resolved update schema before persistence. */
  readonly ifMatch?: string;
  /** Trusted current caller and brand used by the existing record-access and form-access paths. */
  readonly caller: FormRecordAccessContext;
  /** Process-local capability issued only after the internal service mutation boundary authorizes this write. */
  readonly internalAuthorizationCapability?: unknown;
}

export interface RecordSchemaUpdateResolutionMetadata {
  readonly schemaKind: 'update';
  readonly contractFormat: RecordContractFormat;
  readonly completeness: 'complete' | 'partial';
  readonly byteLength: number;
  readonly etag: RecordJsonSchemaEtag;
  readonly context: RecordContractUpdateContext['publicContext'];
}

interface RecordSchemaUpdateResolutionSuccessBase {
  readonly document: PublishedRecordJsonSchemaDocument;
  readonly digest: string;
  readonly metadata: RecordSchemaUpdateResolutionMetadata;
  readonly grant: RecordSchemaUpdateGrantReferenceInput;
}

export interface CompleteRecordSchemaUpdateResolution extends RecordSchemaUpdateResolutionSuccessBase {
  readonly kind: 'resolved';
  readonly metadata: RecordSchemaUpdateResolutionMetadata & { readonly completeness: 'complete' };
}

export interface PartialRecordSchemaUpdateResolution extends RecordSchemaUpdateResolutionSuccessBase {
  readonly kind: 'partial';
  readonly metadata: RecordSchemaUpdateResolutionMetadata & { readonly completeness: 'partial' };
}

export interface RecordSchemaUpdateDeniedFailure {
  readonly kind: 'denied';
  readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN;
}

export interface RecordSchemaUpdateMissingOidFailure {
  readonly kind: 'missing-oid';
  readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND;
}

export type RecordSchemaUpdateContextFailure = RecordSchemaCreateContextFailure;
export type RecordSchemaUpdateCompilerFailure = RecordSchemaCreateCompilerFailure;
export type RecordSchemaUpdateMetaValidationFailure = RecordSchemaCreateMetaValidationFailure;
export type RecordSchemaUpdateLimitFailure = RecordSchemaCreateLimitFailure;
export type RecordSchemaUpdateStorageFailure = RecordSchemaCreateStorageFailure;
export type RecordSchemaUpdateUnavailableFailure = RecordSchemaCreateUnavailableFailure;

export interface RecordSchemaUpdateInvalidPreconditionFailure {
  readonly kind: 'invalid-precondition';
  readonly condition: 'if-match';
  readonly reason: RecordJsonSchemaEtagParseFailureReason;
  readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST;
}

export interface RecordSchemaUpdatePreconditionFailure {
  readonly kind: 'precondition-failed';
  readonly condition: 'if-match';
  readonly reason: 'mismatch';
  readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.PRECONDITION_FAILED;
}

export type ResolveUpdateRecordSchemaResult =
  | CompleteRecordSchemaUpdateResolution
  | PartialRecordSchemaUpdateResolution
  | RecordSchemaUpdateDeniedFailure
  | RecordSchemaUpdateMissingOidFailure
  | RecordSchemaUpdateContextFailure
  | RecordSchemaUpdateCompilerFailure
  | RecordSchemaUpdateMetaValidationFailure
  | RecordSchemaUpdateLimitFailure
  | RecordSchemaUpdateStorageFailure
  | RecordSchemaUpdateUnavailableFailure
  | RecordSchemaUpdateInvalidPreconditionFailure
  | RecordSchemaUpdatePreconditionFailure;

export interface ResolveImmutableRecordSchemaRequest {
  /** Internal persisted brand identifier used for authoritative authorization. */
  readonly brand: string;
  /** Canonical public branding route segment. Defaults to `brand` for internal compatibility. */
  readonly branding?: string;
  readonly portal: string;
  readonly digest: string;
  /** Trusted current caller and brand used by the authoritative context and record-access paths. */
  readonly caller: FormRecordAccessContext;
  /** Optional raw If-None-Match value evaluated only after current authorization succeeds. */
  readonly ifNoneMatch?: string;
}

/** Immutable invalid contracts retain whether equivalent caller authorization was established first. */
export type ResolveImmutableRecordSchemaResult =
  | Exclude<ResolveRecordSchemaResult, { readonly kind: 'invalid-contract' }>
  | {
      readonly kind: 'invalid-contract';
      readonly authorization: 'unverified' | 'authorized';
      readonly problem: RecordSchemaProblem;
    };

export interface PersistRecordSchemaSaveUsageRequest {
  readonly digest: string;
  readonly brand: string;
  readonly portal: string;
  readonly schemaKind: 'create' | 'update';
  readonly recordType: string;
  readonly oid: string;
  readonly operation: string;
  /** Stable save/audit identity. It contributes only to the hashed reference key and is never persisted raw. */
  readonly saveIdentity: string;
}

export interface RecordSchemaReferenceIdentity {
  readonly digest: string;
  readonly referenceKey: string;
}

export type RecordSchemaReferenceWriteFailure = {
  readonly failureKind:
    | 'storage-unavailable'
    | 'artifact-not-found'
    | 'invalid-reference'
    | 'reference-key-collision'
    | 'digest-collision'
    | 'invalid-state';
  readonly code:
    | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE
    | typeof RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_NOT_FOUND
    | typeof RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_INVALID
    | typeof RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_KEY_COLLISION
    | typeof RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION
    | typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT
    | typeof RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED;
  readonly retryable: boolean;
};

export type PersistRecordSchemaSaveUsageResult =
  | {
      readonly kind: 'recorded';
      readonly reference: RecordSchemaReferenceIdentity;
    }
  | {
      readonly kind: 'invalid-input';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST;
    }
  | {
      readonly kind: 'disabled';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE;
    }
  | {
      readonly kind: 'unavailable';
      readonly stage: 'configuration' | 'storage';
      readonly code:
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID
        | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE;
    }
  | ({
      readonly kind: 'write-failed';
      readonly stage: 'save-reference';
      readonly reference: RecordSchemaReferenceIdentity;
    } & RecordSchemaReferenceWriteFailure);

export type ValidateResolvedRecordSchemaResult =
  | ({ readonly kind: 'validated' } & RecordJsonSchemaValidationResult)
  | {
      readonly kind: 'invalid-input';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST;
    }
  | {
      readonly kind: 'unavailable';
      readonly code:
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID
        | typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT
        | typeof RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE;
    };

export type RecordSchemaPinMaterializationEntry = RecordSchemaReferenceIdentity &
  ({ readonly status: 'materialized' } | ({ readonly status: 'write-failed' } & RecordSchemaReferenceWriteFailure));

export type MaterializeRecordSchemaIntegrationPinsResult =
  | {
      readonly kind: 'materialized';
      readonly pins: readonly RecordSchemaPinMaterializationEntry[];
    }
  | {
      readonly kind: 'failed';
      readonly pins: readonly RecordSchemaPinMaterializationEntry[];
    }
  | {
      readonly kind: 'disabled';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE;
    }
  | {
      readonly kind: 'unavailable';
      readonly stage: 'configuration' | 'storage';
      readonly code:
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID
        | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE;
    }
  | {
      readonly kind: 'limit-exceeded';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED;
      readonly maximum: number;
    };

export type RecordSchemaRetentionReportRequest =
  | {
      readonly mode: 'targeted';
      readonly now: Date;
      /** Compatibility path for bounded reports over a known digest set. */
      readonly digests: readonly string[];
      readonly limit?: never;
      readonly cursor?: never;
    }
  | {
      readonly mode: 'paginated';
      readonly now: Date;
      readonly digests?: never;
      /** Page size for storage-owned artifact scans. */
      readonly limit?: number;
      /** Exclusive digest cursor for storage-owned artifact scans. */
      readonly cursor?: string;
    };

export type RecordSchemaRetentionReportResult =
  | {
      readonly kind: 'reported';
      readonly now: Date;
      readonly minimumAgeDays: number;
      readonly entries: readonly RecordSchemaRetentionReportEntry[];
      readonly missingDigests: readonly string[];
      readonly page?: {
        readonly limit: number;
        readonly nextCursor?: string;
      };
    }
  | {
      readonly kind: 'invalid-input';
      readonly reason: 'shape' | 'digest' | 'datetime' | 'limit';
      readonly code:
        | typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST
        | typeof RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED;
    }
  | {
      readonly kind: 'disabled';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE;
    }
  | {
      readonly kind: 'unavailable';
      readonly stage: 'configuration' | 'storage';
      readonly code:
        | typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID
        | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE;
    }
  | {
      readonly kind: 'invalid-state';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT;
    }
  | {
      readonly kind: 'limit-exceeded';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED;
      readonly digest: string;
    }
  | {
      readonly kind: 'limit-exceeded';
      readonly code: typeof RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED;
      readonly scope: 'artifact-page';
    };

type RecordSchemaResolutionFailure =
  | RecordSchemaCreateContextFailure
  | RecordSchemaCreateCompilerFailure
  | RecordSchemaCreateMetaValidationFailure
  | RecordSchemaCreateLimitFailure
  | RecordSchemaCreateStorageFailure
  | RecordSchemaCreateUnavailableFailure;

interface RecordSchemaPipelineSuccessBase<Grant extends RecordSchemaGrantReferenceInput> {
  readonly document: PublishedRecordJsonSchemaDocument;
  readonly digest: string;
  readonly grant: Grant;
  readonly contractFormat: RecordContractFormat;
  readonly byteLength: number;
  readonly etag: RecordJsonSchemaEtag;
}

type RecordSchemaPipelineSuccess<Grant extends RecordSchemaGrantReferenceInput> =
  | (RecordSchemaPipelineSuccessBase<Grant> & {
      readonly kind: 'resolved';
      readonly completeness: 'complete';
    })
  | (RecordSchemaPipelineSuccessBase<Grant> & {
      readonly kind: 'partial';
      readonly completeness: 'partial';
    });

type RecordSchemaPipelineResult<Grant extends RecordSchemaGrantReferenceInput> =
  | RecordSchemaPipelineSuccess<Grant>
  | RecordSchemaResolutionFailure;

interface RecordSchemaCompiledContextBase {
  readonly document: PublishedRecordJsonSchemaDocument;
  readonly digest: string;
  readonly artifactInput: RecordSchemaArtifactInput;
  readonly contractFormat: RecordContractFormat;
  readonly byteLength: number;
  readonly etag: RecordJsonSchemaEtag;
}

type RecordSchemaCompiledContext =
  | (RecordSchemaCompiledContextBase & {
      readonly kind: 'resolved';
      readonly completeness: 'complete';
    })
  | (RecordSchemaCompiledContextBase & {
      readonly kind: 'partial';
      readonly completeness: 'partial';
    });

type RecordSchemaCompilationResult = RecordSchemaCompiledContext | RecordSchemaResolutionFailure;

type RecordSchemaCreateStorageProvider = Required<
  Pick<StorageService, 'putRecordSchemaArtifact' | 'putRecordSchemaReference'>
>;

type RecordSchemaImmutableStorageProvider = Required<
  Pick<
    StorageService,
    'getRecordSchemaArtifact' | 'findRecordSchemaGrantForAuthorization' | 'touchRecordSchemaArtifact'
  >
>;

type RecordSchemaReferenceStorageProvider = Required<Pick<StorageService, 'putRecordSchemaReference'>>;

type RecordSchemaTargetedRetentionStorageProvider = Required<
  Pick<StorageService, 'getRecordSchemaArtifact' | 'listRecordSchemaReferences'>
>;

type RecordSchemaPagedRetentionStorageProvider = Required<
  Pick<StorageService, 'listRecordSchemaArtifacts' | 'listRecordSchemaReferences'>
>;

type RecordSchemaRetentionStorageProvider = Required<Pick<StorageService, 'listRecordSchemaReferences'>> &
  Partial<Required<Pick<StorageService, 'getRecordSchemaArtifact' | 'listRecordSchemaArtifacts'>>>;

function createStorageProvider(value: unknown): RecordSchemaCreateStorageProvider | undefined {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return undefined;
  }
  try {
    return typeof Reflect.get(value, 'putRecordSchemaArtifact') === 'function' &&
      typeof Reflect.get(value, 'putRecordSchemaReference') === 'function'
      ? (value as RecordSchemaCreateStorageProvider)
      : undefined;
  } catch {
    return undefined;
  }
}

function isImmutableStorageProvider(value: unknown): value is RecordSchemaImmutableStorageProvider {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  try {
    return (
      typeof Reflect.get(value, 'getRecordSchemaArtifact') === 'function' &&
      typeof Reflect.get(value, 'findRecordSchemaGrantForAuthorization') === 'function' &&
      typeof Reflect.get(value, 'touchRecordSchemaArtifact') === 'function'
    );
  } catch {
    return false;
  }
}

function isReferenceStorageProvider(value: unknown): value is RecordSchemaReferenceStorageProvider {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  try {
    return typeof Reflect.get(value, 'putRecordSchemaReference') === 'function';
  } catch {
    return false;
  }
}

function isTargetedRetentionStorageProvider(value: unknown): value is RecordSchemaTargetedRetentionStorageProvider {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  try {
    return (
      typeof Reflect.get(value, 'getRecordSchemaArtifact') === 'function' &&
      typeof Reflect.get(value, 'listRecordSchemaReferences') === 'function'
    );
  } catch {
    return false;
  }
}

function isPagedRetentionStorageProvider(value: unknown): value is RecordSchemaPagedRetentionStorageProvider {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false;
  }
  try {
    return (
      typeof Reflect.get(value, 'listRecordSchemaArtifacts') === 'function' &&
      typeof Reflect.get(value, 'listRecordSchemaReferences') === 'function'
    );
  } catch {
    return false;
  }
}

function storageResponseSucceeded(response: StorageServiceResponse | null | undefined): boolean {
  try {
    return response?.success === true;
  } catch {
    return false;
  }
}

function storageResponseCode(response: StorageServiceResponse | null | undefined): string | undefined {
  try {
    const details = response?.details;
    if (!isObjectRecord(details)) {
      return undefined;
    }
    return typeof details.code === 'string' ? details.code : undefined;
  } catch {
    return undefined;
  }
}

function referenceWriteFailure(
  response?: StorageServiceResponse,
  unavailableCode:
    | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE
    | typeof RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED = RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE
): RecordSchemaReferenceWriteFailure {
  switch (storageResponseCode(response)) {
    case RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_NOT_FOUND:
      return {
        failureKind: 'artifact-not-found',
        code: RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_NOT_FOUND,
        retryable: false,
      };
    case RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_INVALID:
      return {
        failureKind: 'invalid-reference',
        code: RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_INVALID,
        retryable: false,
      };
    case RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_KEY_COLLISION:
      return {
        failureKind: 'reference-key-collision',
        code: RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_KEY_COLLISION,
        retryable: false,
      };
    case RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION:
      return { failureKind: 'digest-collision', code: RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION, retryable: false };
    case RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT:
      return { failureKind: 'invalid-state', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT, retryable: false };
    default:
      return {
        failureKind: 'storage-unavailable',
        code: unavailableCode,
        retryable: true,
      };
  }
}

const INVALID_DATA_PROPERTY = Symbol('invalid-data-property');

function ownDataProperty(value: Record<string, unknown>, property: string): unknown | typeof INVALID_DATA_PROPERTY {
  const descriptor = Object.getOwnPropertyDescriptor(value, property);
  return descriptor && 'value' in descriptor ? descriptor.value : INVALID_DATA_PROPERTY;
}

type BoundedArraySnapshot =
  | { readonly kind: 'values'; readonly values: readonly unknown[] }
  | { readonly kind: 'overflow' }
  | { readonly kind: 'invalid' };

/** Consume at most maximum + 1 actual iterator values; array length is not trusted. */
function boundedArraySnapshot(value: unknown, maximum: number): BoundedArraySnapshot {
  if (!Array.isArray(value)) return { kind: 'invalid' };
  try {
    const iteratorFactory = Reflect.get(value, Symbol.iterator);
    if (typeof iteratorFactory !== 'function') return { kind: 'invalid' };
    const iterator: unknown = Reflect.apply(iteratorFactory, value, []);
    if (!isReflectable(iterator)) return { kind: 'invalid' };
    const next = Reflect.get(iterator, 'next');
    if (typeof next !== 'function') return { kind: 'invalid' };
    const values: unknown[] = [];
    for (let index = 0; index <= maximum; index += 1) {
      const step: unknown = Reflect.apply(next, iterator, []);
      if (!isReflectable(step)) return { kind: 'invalid' };
      const done = Reflect.get(step, 'done');
      if (done === true) return { kind: 'values', values: Object.freeze(values) };
      if (done !== false && done !== undefined) return { kind: 'invalid' };
      if (index === maximum) {
        const close = Reflect.get(iterator, 'return');
        if (typeof close === 'function') {
          try {
            Reflect.apply(close, iterator, []);
          } catch {
            // Overflow is already deterministic; iterator cleanup failure cannot change it.
          }
        }
        return { kind: 'overflow' };
      }
      values.push(Reflect.get(step, 'value'));
    }
    return { kind: 'overflow' };
  } catch {
    return { kind: 'invalid' };
  }
}

type RecordSchemaConfigSnapshot =
  | { readonly kind: 'snapshot'; readonly value: unknown }
  | { readonly kind: 'pin-limit' }
  | { readonly kind: 'unreadable' };

function snapshotProperties(source: Record<string, unknown>, properties: readonly string[]): Record<string, unknown> {
  return Object.fromEntries(properties.map(property => [property, ownDataProperty(source, property)]));
}

/** Copy only configured contract fields so later getters/iterators cannot mutate validated state. */
function snapshotRecordSchemaConfig(value: unknown): RecordSchemaConfigSnapshot {
  try {
    if (!isObjectRecord(value)) return { kind: 'snapshot', value };
    const enabled = Reflect.get(value, 'enabled');
    const snapshot = snapshotProperties(value, ['unknownProperties', 'contractFormat', 'cacheMaxEntries']);
    snapshot.enabled = enabled;
    const limits = ownDataProperty(value, 'limits');
    snapshot.limits = isObjectRecord(limits)
      ? snapshotProperties(limits, [
          'maxDepth',
          'maxProperties',
          'maxDocumentBytes',
          'maxDiagnostics',
          'contributorTimeoutMs',
        ])
      : limits;
    const retention = ownDataProperty(value, 'retention');
    snapshot.retention = isObjectRecord(retention) ? snapshotProperties(retention, ['minimumAgeDays']) : retention;

    const integrationPins = ownDataProperty(value, 'integrationPins');
    if (integrationPins !== INVALID_DATA_PROPERTY && integrationPins !== undefined) {
      const bounded = boundedArraySnapshot(integrationPins, MAX_RECORD_SCHEMA_INTEGRATION_PINS);
      if (bounded.kind === 'overflow') return { kind: 'pin-limit' };
      if (bounded.kind === 'invalid') return { kind: 'unreadable' };
      snapshot.integrationPins = bounded.values.map(pin => {
        if (!isObjectRecord(pin)) return pin;
        const pinSnapshot = snapshotProperties(pin, [
          'digest',
          'brand',
          'portal',
          'schemaKind',
          'recordType',
          'operation',
          'owner',
          'purpose',
        ]);
        const expiresAt = ownDataProperty(pin, 'expiresAt');
        if (expiresAt !== INVALID_DATA_PROPERTY) pinSnapshot.expiresAt = expiresAt;
        return pinSnapshot;
      });
    }
    return { kind: 'snapshot', value: snapshot };
  } catch {
    return { kind: 'unreadable' };
  }
}

function boundedNormalizedText(
  value: Record<string, unknown>,
  property: string,
  maximumLength = 512
): string | undefined {
  const candidate = ownDataProperty(value, property);
  return typeof candidate === 'string' &&
    candidate.length > 0 &&
    candidate.length <= maximumLength &&
    candidate === candidate.trim()
    ? candidate
    : undefined;
}

interface ParsedConfiguredFormCandidate {
  readonly name: string;
  readonly form: RecordContractEffectiveForm;
  readonly reusableFormDefinitions: Readonly<Record<string, readonly FormComponentDefinitionFrame[]>>;
}

function isConfiguredForm(value: unknown): value is RecordContractEffectiveForm {
  if (!isObjectRecord(value)) return false;
  return Array.isArray(ownDataProperty(value, 'componentDefinitions'));
}

function isReusableFormDefinitions(
  value: unknown
): value is Readonly<Record<string, readonly FormComponentDefinitionFrame[]>> {
  if (!isObjectRecord(value)) return false;
  try {
    return Object.keys(value).every(name => Array.isArray(ownDataProperty(value, name)));
  } catch {
    return false;
  }
}

function parseConfiguredFormCandidate(value: unknown): ParsedConfiguredFormCandidate | undefined {
  try {
    if (!isObjectRecord(value)) return undefined;
    const name = boundedNormalizedText(value, 'name', 200);
    const form = ownDataProperty(value, 'form');
    const reusableFormDefinitions = ownDataProperty(value, 'reusableFormDefinitions');
    if (
      !name ||
      !SAFE_DIAGNOSTIC_IDENTIFIER.test(name) ||
      !isConfiguredForm(form) ||
      !isReusableFormDefinitions(reusableFormDefinitions)
    ) {
      return undefined;
    }
    return Object.freeze({ name, form, reusableFormDefinitions });
  } catch {
    return undefined;
  }
}

function configuredFormFinding(
  form: string,
  stage: Extract<RecordSchemaLifecycleFinding, { category: 'form' }>['stage'],
  code: RecordSchemaProblemCode
): RecordSchemaLifecycleFinding {
  return Object.freeze({
    category: 'form',
    code,
    form: diagnosticIdentifier(form),
    stage,
  });
}

function parseSaveUsageRequest(value: unknown): PersistRecordSchemaSaveUsageRequest | undefined {
  try {
    if (!isObjectRecord(value)) {
      return undefined;
    }
    const digest = boundedNormalizedText(value, 'digest', 64);
    const brand = boundedNormalizedText(value, 'brand');
    const portal = boundedNormalizedText(value, 'portal');
    const recordType = boundedNormalizedText(value, 'recordType');
    const oid = boundedNormalizedText(value, 'oid');
    const operation = boundedNormalizedText(value, 'operation');
    const saveIdentity = boundedNormalizedText(value, 'saveIdentity');
    const schemaKind = ownDataProperty(value, 'schemaKind');
    if (
      !digest ||
      !DIGEST_PATTERN.test(digest) ||
      !brand ||
      !portal ||
      !recordType ||
      !oid ||
      !operation ||
      !VALIDATION_OPERATION_NAME_PATTERN.test(operation) ||
      !saveIdentity ||
      !RECORD_SCHEMA_REFERENCE_KEY_PATTERN.test(saveIdentity) ||
      (schemaKind !== 'create' && schemaKind !== 'update')
    ) {
      return undefined;
    }
    return Object.freeze({
      digest,
      brand,
      portal,
      schemaKind,
      recordType,
      oid,
      operation,
      saveIdentity,
    });
  } catch {
    return undefined;
  }
}

interface ParsedResolvedSchemaValidationRequest {
  readonly digest: string;
  readonly schemaKind: 'create' | 'update';
  readonly document: PublishedRecordJsonSchemaDocument;
  readonly input: unknown;
}

function parseResolvedSchemaValidationRequest(value: unknown): ParsedResolvedSchemaValidationRequest | undefined {
  try {
    if (!isObjectRecord(value)) return undefined;
    const digest = ownDataProperty(value, 'digest');
    const schemaKind = ownDataProperty(value, 'schemaKind');
    const document = ownDataProperty(value, 'document');
    const input = ownDataProperty(value, 'input');
    if (
      typeof digest !== 'string' ||
      !DIGEST_PATTERN.test(digest) ||
      (schemaKind !== 'create' && schemaKind !== 'update') ||
      !isObjectRecord(document) ||
      input === INVALID_DATA_PROPERTY
    ) {
      return undefined;
    }
    return Object.freeze({
      digest,
      schemaKind,
      document: document as PublishedRecordJsonSchemaDocument,
      input,
    });
  } catch {
    return undefined;
  }
}

function hashedReferenceKey(prefix: 'save' | 'pin', identity: ContractJsonObject): string {
  return `${prefix}:${createHash('sha256').update(serializeRedboxCanonicalJsonV1(identity), 'utf8').digest('hex')}`;
}

function createSaveReference(request: PersistRecordSchemaSaveUsageRequest): RecordSchemaSaveReferenceInput {
  const persisted = {
    digest: request.digest,
    brand: request.brand,
    portal: request.portal,
    schemaKind: request.schemaKind,
    recordType: request.recordType,
    operation: request.operation,
    oid: request.oid,
  } as const;
  return Object.freeze({
    referenceKey: hashedReferenceKey('save', {
      ...persisted,
      kind: 'save',
      saveIdentity: request.saveIdentity,
    }),
    ...persisted,
    kind: 'save',
  });
}

function integrationPinReference(pin: RecordSchemaIntegrationPinConfig): RecordSchemaPinReferenceInput {
  const expiresAt = pin.expiresAt === undefined ? undefined : canonicalInstant(pin.expiresAt);
  if (pin.expiresAt !== undefined && !expiresAt) {
    throw new Error('Integration pin expiry is invalid.');
  }
  const persisted = {
    digest: pin.digest,
    brand: pin.brand,
    portal: pin.portal,
    schemaKind: pin.schemaKind,
    recordType: pin.recordType,
    operation: pin.operation.trim(),
    owner: pin.owner,
    purpose: pin.purpose,
    ...(expiresAt ? { expiresAt } : {}),
  } as const;
  return Object.freeze({
    referenceKey: hashedReferenceKey('pin', {
      digest: persisted.digest,
      brand: persisted.brand,
      portal: persisted.portal,
      schemaKind: persisted.schemaKind,
      recordType: persisted.recordType,
      operation: persisted.operation,
      owner: persisted.owner,
      purpose: persisted.purpose,
      ...(expiresAt ? { expiresAt: expiresAt.toISOString() } : {}),
      kind: 'pin',
    }),
    ...persisted,
    kind: 'pin',
  });
}

function configuredPinReferences(config: RecordSchemaConfig): readonly RecordSchemaPinReferenceInput[] {
  const referencesByKey = new Map<string, RecordSchemaPinReferenceInput>();
  for (const pin of config.integrationPins ?? []) {
    const reference = integrationPinReference(pin);
    referencesByKey.set(reference.referenceKey, reference);
  }
  return Object.freeze(
    [...referencesByKey.values()].sort((left, right) => compareText(left.referenceKey, right.referenceKey))
  );
}

type ParsedRetentionReportRequest =
  | {
      readonly ok: true;
      readonly request:
        | {
            readonly kind: 'targeted';
            readonly digests: readonly string[];
            readonly now: Date;
          }
        | {
            readonly kind: 'page';
            readonly cursor?: string;
            readonly limit: number;
            readonly now: Date;
          };
    }
  | { readonly ok: false; readonly reason: 'shape' | 'digest' | 'datetime' | 'limit' };

function parseRetentionReportRequest(value: unknown): ParsedRetentionReportRequest {
  try {
    if (!isObjectRecord(value)) {
      return { ok: false, reason: 'shape' };
    }
    const rawNow = ownDataProperty(value, 'now');
    if (!(rawNow instanceof Date) || Number.isNaN(rawNow.getTime())) {
      return { ok: false, reason: 'datetime' };
    }
    const modeDescriptor = Object.getOwnPropertyDescriptor(value, 'mode');
    const digestsDescriptor = Object.getOwnPropertyDescriptor(value, 'digests');
    const limitDescriptor = Object.getOwnPropertyDescriptor(value, 'limit');
    const cursorDescriptor = Object.getOwnPropertyDescriptor(value, 'cursor');
    if (
      modeDescriptor === undefined ||
      !('value' in modeDescriptor) ||
      (digestsDescriptor !== undefined && !('value' in digestsDescriptor)) ||
      (limitDescriptor !== undefined && !('value' in limitDescriptor)) ||
      (cursorDescriptor !== undefined && !('value' in cursorDescriptor))
    ) {
      return { ok: false, reason: 'shape' };
    }
    if (modeDescriptor.value === 'targeted') {
      if (digestsDescriptor === undefined || limitDescriptor !== undefined || cursorDescriptor !== undefined) {
        return { ok: false, reason: 'shape' };
      }
      const boundedDigests = boundedArraySnapshot(digestsDescriptor.value, RECORD_SCHEMA_RETENTION_REPORT_MAX_DIGESTS);
      if (boundedDigests.kind === 'invalid') {
        return { ok: false, reason: 'shape' };
      }
      if (boundedDigests.kind === 'overflow') {
        return { ok: false, reason: 'limit' };
      }
      const uniqueDigests = [...new Set(boundedDigests.values)];
      if (uniqueDigests.some(digest => typeof digest !== 'string' || !DIGEST_PATTERN.test(digest))) {
        return { ok: false, reason: 'digest' };
      }
      const digests = uniqueDigests.filter((digest): digest is string => typeof digest === 'string');
      return {
        ok: true,
        request: Object.freeze({
          kind: 'targeted',
          digests: Object.freeze(digests.sort(compareText)),
          now: new Date(rawNow.getTime()),
        }),
      };
    }

    if (modeDescriptor.value !== 'paginated' || digestsDescriptor !== undefined) {
      return { ok: false, reason: 'shape' };
    }

    const limit = limitDescriptor?.value ?? RECORD_SCHEMA_RETENTION_REPORT_DEFAULT_PAGE_SIZE;
    if (
      typeof limit !== 'number' ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > RECORD_SCHEMA_RETENTION_REPORT_MAX_PAGE_SIZE
    ) {
      return { ok: false, reason: 'limit' };
    }
    const cursor = cursorDescriptor?.value;
    if (cursor !== undefined && (typeof cursor !== 'string' || !DIGEST_PATTERN.test(cursor))) {
      return { ok: false, reason: 'digest' };
    }
    return {
      ok: true,
      request: Object.freeze({
        kind: 'page',
        ...(typeof cursor === 'string' ? { cursor } : {}),
        limit,
        now: new Date(rawNow.getTime()),
      }),
    };
  } catch {
    return { ok: false, reason: 'shape' };
  }
}

function isValidDate(value: unknown): value is Date {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

function hasOwnReferenceField(reference: Record<string, unknown>, field: string): boolean {
  return Object.getOwnPropertyDescriptor(reference, field) !== undefined;
}

type RetentionReferenceEvidence = 'grant' | 'save' | 'active-pin' | 'expired-pin';

function retentionReferenceEvidence(
  reference: unknown,
  expectedDigest: string,
  now: Date
): RetentionReferenceEvidence | undefined {
  if (!isObjectRecord(reference)) return undefined;
  const referenceKey = boundedNormalizedText(reference, 'referenceKey');
  const digest = boundedNormalizedText(reference, 'digest', 64);
  const brand = boundedNormalizedText(reference, 'brand');
  const portal = boundedNormalizedText(reference, 'portal');
  const recordType = boundedNormalizedText(reference, 'recordType');
  const operation = boundedNormalizedText(reference, 'operation', 64);
  const schemaKind = ownDataProperty(reference, 'schemaKind');
  const kind = ownDataProperty(reference, 'kind');
  const createdAt = ownDataProperty(reference, 'createdAt');
  const updatedAt = ownDataProperty(reference, 'updatedAt');
  if (
    !referenceKey ||
    !RECORD_SCHEMA_REFERENCE_KEY_PATTERN.test(referenceKey) ||
    digest !== expectedDigest ||
    !brand ||
    !portal ||
    !recordType ||
    !operation ||
    !VALIDATION_OPERATION_NAME_PATTERN.test(operation) ||
    (schemaKind !== 'create' && schemaKind !== 'update') ||
    !isValidDate(createdAt) ||
    !isValidDate(updatedAt)
  ) {
    return undefined;
  }
  if (kind === 'grant') {
    if (
      hasOwnReferenceField(reference, 'owner') ||
      hasOwnReferenceField(reference, 'purpose') ||
      hasOwnReferenceField(reference, 'expiresAt') ||
      (schemaKind === 'create' && hasOwnReferenceField(reference, 'oid')) ||
      (schemaKind === 'update' && !boundedNormalizedText(reference, 'oid'))
    ) {
      return undefined;
    }
    return 'grant';
  }
  if (kind === 'save') {
    if (
      hasOwnReferenceField(reference, 'owner') ||
      hasOwnReferenceField(reference, 'purpose') ||
      hasOwnReferenceField(reference, 'expiresAt')
    ) {
      return undefined;
    }
    return boundedNormalizedText(reference, 'oid') ? 'save' : undefined;
  }
  if (
    kind !== 'pin' ||
    hasOwnReferenceField(reference, 'oid') ||
    !boundedNormalizedText(reference, 'owner') ||
    !boundedNormalizedText(reference, 'purpose', 2_048)
  ) {
    return undefined;
  }
  const expiresAt = ownDataProperty(reference, 'expiresAt');
  if (expiresAt === INVALID_DATA_PROPERTY || expiresAt === undefined) return 'active-pin';
  if (!isValidDate(expiresAt)) return undefined;
  return expiresAt.getTime() > now.getTime() ? 'active-pin' : 'expired-pin';
}

function retentionArtifactSummary(artifact: unknown, expectedDigest?: string): RecordSchemaArtifactSummary | undefined {
  try {
    if (!isObjectRecord(artifact)) return undefined;
    const digest = ownDataProperty(artifact, 'digest');
    const createdAt = ownDataProperty(artifact, 'createdAt');
    if (
      typeof digest !== 'string' ||
      !DIGEST_PATTERN.test(digest) ||
      (expectedDigest !== undefined && digest !== expectedDigest) ||
      !isValidDate(createdAt)
    ) {
      return undefined;
    }
    return Object.freeze({ digest, createdAt: new Date(createdAt.getTime()) });
  } catch {
    return undefined;
  }
}

function retentionEntry(
  artifact: unknown,
  references: unknown,
  expectedDigest: string,
  now: Date,
  minimumAgeDays: number
): RecordSchemaRetentionReportEntry | undefined {
  try {
    if (!Array.isArray(references)) return undefined;
    const summary = retentionArtifactSummary(artifact, expectedDigest);
    if (!summary) return undefined;
    const { digest, createdAt } = summary;
    let grantCount = 0;
    let saveCount = 0;
    let activePinCount = 0;
    for (const reference of references) {
      const evidence = retentionReferenceEvidence(reference, digest, now);
      if (evidence === 'grant') {
        grantCount += 1;
      } else if (evidence === 'save') {
        saveCount += 1;
      } else if (evidence === 'active-pin') {
        activePinCount += 1;
      } else if (evidence !== 'expired-pin') {
        return undefined;
      }
    }

    const ageDays = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / MILLISECONDS_PER_DAY));
    const reasons: RecordSchemaRetentionReason[] = [];
    if (ageDays < minimumAgeDays) reasons.push('minimum-age');
    if (grantCount > 0) reasons.push('grant-reference');
    if (saveCount > 0) reasons.push('save-reference');
    if (activePinCount > 0) reasons.push('active-pin');
    return Object.freeze({
      digest,
      createdAt: new Date(createdAt.getTime()),
      ageDays,
      grantCount,
      saveCount,
      activePinCount,
      reasons: Object.freeze(reasons),
      eligibleForDeletion: reasons.length === 0,
    });
  } catch {
    return undefined;
  }
}

function isContractJsonObject(value: ContractJsonValue): value is ContractJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCreateContractContext(context: RecordContractContext): context is RecordContractCreateContext {
  return context.publicContext.kind === 'create';
}

function isUpdateContractContext(context: RecordContractContext): context is RecordContractUpdateContext {
  return context.publicContext.kind === 'update';
}

function publicBranding(request: { readonly brand: string; readonly branding?: string }): string {
  const branding = typeof request.branding === 'string' ? request.branding.trim() : '';
  return branding || request.brand;
}

function createContextWithPublicBrand(
  context: RecordContractCreateContext,
  branding: string
): RecordContractCreateContext {
  if (context.publicContext.brand === branding) return context;
  return Object.freeze({
    publicContext: Object.freeze({ ...context.publicContext, brand: branding }),
    resolution: context.resolution,
  });
}

function updateContextWithPublicBrand(
  context: RecordContractUpdateContext,
  branding: string
): RecordContractUpdateContext {
  if (context.publicContext.brand === branding) return context;
  return Object.freeze({
    publicContext: Object.freeze({ ...context.publicContext, brand: branding }),
    resolution: context.resolution,
  });
}

function callerActor(caller: FormRecordAccessContext): RecordContractContextActor {
  const username = typeof caller.user?.username === 'string' ? caller.user.username.trim() : '';
  const rawRoles = Array.isArray(caller.user?.roles) ? caller.user.roles : [];
  const roles = [
    ...new Set(
      rawRoles.map(role => (typeof role?.name === 'string' ? role.name.trim() : '')).filter(role => role.length > 0)
    ),
  ].sort(compareText);
  return Object.freeze({
    authenticated: username.length > 0,
    roles: Object.freeze(roles),
  });
}

type RecordSchemaGrantReferenceModel = RecordSchemaGrantReferenceInput;

type ParsedImmutableGrant =
  | { readonly kind: 'grant'; readonly grant: RecordSchemaGrantReferenceModel }
  | { readonly kind: 'irrelevant' }
  | { readonly kind: 'invalid' };

function parseImmutableGrant(value: unknown, request: ResolveImmutableRecordSchemaRequest): ParsedImmutableGrant {
  try {
    if (!isObjectRecord(value)) return { kind: 'invalid' };
    const referenceKey = boundedNormalizedText(value, 'referenceKey');
    const digest = boundedNormalizedText(value, 'digest', 64);
    const brand = boundedNormalizedText(value, 'brand');
    const portal = boundedNormalizedText(value, 'portal');
    const recordType = boundedNormalizedText(value, 'recordType');
    const operation = boundedNormalizedText(value, 'operation', 64);
    const kind = ownDataProperty(value, 'kind');
    const schemaKind = ownDataProperty(value, 'schemaKind');
    if (
      !referenceKey ||
      !RECORD_SCHEMA_REFERENCE_KEY_PATTERN.test(referenceKey) ||
      !digest ||
      !DIGEST_PATTERN.test(digest) ||
      !brand ||
      !portal ||
      !recordType ||
      !operation ||
      !VALIDATION_OPERATION_NAME_PATTERN.test(operation) ||
      kind !== 'grant' ||
      (schemaKind !== 'create' && schemaKind !== 'update') ||
      hasOwnReferenceField(value, 'owner') ||
      hasOwnReferenceField(value, 'purpose') ||
      hasOwnReferenceField(value, 'expiresAt')
    ) {
      return { kind: 'invalid' };
    }
    if (digest !== request.digest || brand !== publicBranding(request) || portal !== request.portal) {
      return { kind: 'irrelevant' };
    }
    const oid = ownDataProperty(value, 'oid');
    if (schemaKind === 'create') {
      if (oid !== INVALID_DATA_PROPERTY) return { kind: 'invalid' };
      return {
        kind: 'grant',
        grant: Object.freeze({
          referenceKey,
          digest,
          brand,
          portal,
          kind: 'grant',
          schemaKind: 'create',
          recordType,
          operation,
        }),
      };
    }
    if (typeof oid !== 'string' || !oid || oid !== oid.trim() || oid.length > 512) {
      return { kind: 'invalid' };
    }
    return {
      kind: 'grant',
      grant: Object.freeze({
        referenceKey,
        digest,
        brand,
        portal,
        kind: 'grant',
        schemaKind: 'update',
        recordType,
        operation,
        oid,
      }),
    };
  } catch {
    return { kind: 'invalid' };
  }
}

function immutableProblemInstance(request: ResolveImmutableRecordSchemaRequest): string {
  return `/${encodeURIComponent(publicBranding(request))}/${encodeURIComponent(request.portal)}/api/records/schemas/${encodeURIComponent(request.digest)}`;
}

function immutableProblem(
  request: ResolveImmutableRecordSchemaRequest,
  values: Readonly<{
    type: string;
    title: string;
    status: RecordSchemaProblem['status'];
    detail: string;
    code: RecordSchemaProblem['code'];
  }>
): RecordSchemaProblem {
  return Object.freeze({
    ...values,
    instance: immutableProblemInstance(request),
  });
}

function invalidDigestResult(request: ResolveImmutableRecordSchemaRequest): ResolveImmutableRecordSchemaResult {
  return Object.freeze({
    kind: 'invalid-request',
    problem: immutableProblem(request, {
      type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
      title: 'Record schema request is invalid',
      status: 400,
      detail: 'The record schema digest must be a lowercase 64-character SHA-256 hexadecimal value.',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
    }),
  });
}

function invalidImmutableConditionalResult(
  request: ResolveImmutableRecordSchemaRequest
): ResolveImmutableRecordSchemaResult {
  return Object.freeze({
    kind: 'invalid-request',
    problem: immutableProblem(request, {
      type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
      title: 'Record schema request is invalid',
      status: 400,
      detail: 'If-None-Match must contain one supported strong record schema ETag.',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
    }),
  });
}

function immutableNotFoundResult(request: ResolveImmutableRecordSchemaRequest): ResolveImmutableRecordSchemaResult {
  return Object.freeze({
    kind: 'not-found',
    problem: immutableProblem(request, {
      type: 'https://redboxresearchdata.com/problems/record-schema-not-found',
      title: 'Record schema was not found',
      status: 404,
      detail: 'No accessible schema was found.',
      code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
    }),
  });
}

function immutableUnavailableResult(
  request: ResolveImmutableRecordSchemaRequest,
  code:
    | typeof RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID
    | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE
    | typeof RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE
): ResolveImmutableRecordSchemaResult {
  return Object.freeze({
    kind: 'unavailable',
    problem: immutableProblem(request, {
      type: 'https://redboxresearchdata.com/problems/record-schema-unavailable',
      title: 'Record schema is unavailable',
      status: 503,
      detail: 'Record schema retrieval is currently unavailable.',
      code,
    }),
  });
}

function immutableInvalidContractResult(
  request: ResolveImmutableRecordSchemaRequest,
  authorization: 'unverified' | 'authorized'
): ResolveImmutableRecordSchemaResult {
  return Object.freeze({
    kind: 'invalid-contract',
    authorization,
    problem: immutableProblem(request, {
      type: 'https://redboxresearchdata.com/problems/record-schema-invalid-contract',
      title: 'Record schema contract is invalid',
      status: 422,
      detail: 'The stored schema artifact failed its immutable identity check.',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
    }),
  });
}

function immutableGrantInvalidContractResult(
  request: ResolveImmutableRecordSchemaRequest
): ResolveImmutableRecordSchemaResult {
  return Object.freeze({
    kind: 'invalid-contract',
    authorization: 'unverified',
    problem: immutableProblem(request, {
      type: 'https://redboxresearchdata.com/problems/record-schema-invalid-contract',
      title: 'Record schema contract is invalid',
      status: 422,
      detail: 'Stored schema authorization data is invalid.',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
    }),
  });
}

function immutableGrantOperation(operation: string): string | undefined {
  return operation === RECORD_SCHEMA_STRICT_ALL_OPERATION ? undefined : operation;
}

function immutableCreateTargetStep(artifact: RecordSchemaArtifactModel): string | undefined {
  const context = artifact.document['x-redbox-context'];
  if (!isObjectRecord(context) || context.kind !== 'create') {
    return undefined;
  }
  return typeof context.workflowStep === 'string' ? context.workflowStep : undefined;
}

function immutableAuthorizationQuery(
  artifact: RecordSchemaArtifactModel,
  request: ResolveImmutableRecordSchemaRequest
): RecordSchemaAuthorizationGrantQuery | undefined {
  const context = artifact.document['x-redbox-context'];
  if (!isObjectRecord(context)) return undefined;
  const schemaKind = ownDataProperty(context, 'kind');
  const brand = boundedNormalizedText(context, 'brand');
  const portal = boundedNormalizedText(context, 'portal');
  const recordType = boundedNormalizedText(context, 'recordType');
  const operation = boundedNormalizedText(context, 'operation', 64);
  const recordBrandId = String(request.caller.brand?.id ?? '').trim();
  const username = String(request.caller.user?.username ?? '').trim();
  if (
    (schemaKind !== 'create' && schemaKind !== 'update') ||
    brand !== publicBranding(request) ||
    portal !== request.portal ||
    !recordType ||
    !operation ||
    !VALIDATION_OPERATION_NAME_PATTERN.test(operation) ||
    !recordBrandId ||
    !username
  ) {
    return undefined;
  }

  const roleNames = new Set<string>();
  if (schemaKind === 'update') {
    const roles = Array.isArray(request.caller.user.roles) ? request.caller.user.roles : [];
    const brandRoles = Array.isArray(request.caller.brand.roles) ? request.caller.brand.roles : [];
    const configuredRoleNamesById = new Map<string, string>();
    for (const configuredRole of brandRoles) {
      if (!isObjectRecord(configuredRole)) continue;
      const configuredName = boundedNormalizedText(configuredRole, 'name');
      const configuredId = boundedNormalizedText(configuredRole, 'id');
      if (configuredName && configuredId) configuredRoleNamesById.set(configuredId, configuredName);
    }
    for (const actorRole of roles) {
      if (!isObjectRecord(actorRole)) continue;
      const name = boundedNormalizedText(actorRole, 'name');
      const id = boundedNormalizedText(actorRole, 'id');
      if (!name || !id) continue;
      if (configuredRoleNamesById.get(id) === name) {
        roleNames.add(name);
      }
    }
  }

  return Object.freeze({
    digest: request.digest,
    brand,
    portal,
    schemaKind,
    recordType,
    operation,
    recordBrandId,
    username,
    roleNames: Object.freeze([...roleNames].sort(compareText)),
  });
}

function verifiedImmutableArtifact(
  artifact: RecordSchemaArtifactModel,
  expected: RecordSchemaCompiledContext
): RecordSchemaArtifactModel | undefined {
  try {
    const normalized = normalizeRecordJsonSchemaDocument(artifact.document);
    const identity = identifyRecordJsonSchema(normalized, Number.MAX_SAFE_INTEGER);
    if (
      artifact.digest !== expected.digest ||
      identity.digest !== expected.digest ||
      serializeRedboxCanonicalJsonV1(identity.document) !== serializeRedboxCanonicalJsonV1(expected.document) ||
      artifact.contractFormat !== expected.contractFormat ||
      artifact.completeness !== expected.completeness ||
      artifact.byteLength !== identity.byteLength
    ) {
      return undefined;
    }
    const immutableDocument = normalizeRedboxCanonicalJsonV1(identity.document);
    if (!isContractJsonObject(immutableDocument)) {
      return undefined;
    }
    return Object.freeze({
      digest: artifact.digest,
      document: immutableDocument,
      contractFormat: artifact.contractFormat,
      completeness: artifact.completeness,
      byteLength: artifact.byteLength,
      createdAt: artifact.createdAt,
      updatedAt: artifact.updatedAt,
      ...(artifact.lastAccessedAt ? { lastAccessedAt: artifact.lastAccessedAt } : {}),
    });
  } catch {
    return undefined;
  }
}

function createGrantReference(
  artifact: Readonly<Pick<RecordSchemaArtifactInput, 'digest'>>,
  context: RecordContractCreateContext['publicContext']
): RecordSchemaCreateGrantReferenceInput {
  const common = {
    digest: artifact.digest,
    brand: context.brand,
    portal: context.portal,
    recordType: context.recordType,
    operation: context.operation,
  } as const;
  const identity = serializeRedboxCanonicalJsonV1({
    ...common,
    kind: 'grant',
    schemaKind: 'create',
  });
  return Object.freeze({
    referenceKey: `grant:create:${createHash('sha256').update(identity, 'utf8').digest('hex')}`,
    ...common,
    kind: 'grant',
    schemaKind: 'create',
  });
}

function createUpdateGrantReference(
  artifact: Readonly<Pick<RecordSchemaArtifactInput, 'digest'>>,
  context: RecordContractUpdateContext
): RecordSchemaUpdateGrantReferenceInput {
  const common = {
    digest: artifact.digest,
    brand: context.publicContext.brand,
    portal: context.publicContext.portal,
    recordType: context.publicContext.recordType,
    operation: context.publicContext.operation,
    oid: context.resolution.oid,
  } as const;
  const identity = serializeRedboxCanonicalJsonV1({
    ...common,
    kind: 'grant',
    schemaKind: 'update',
  });
  return Object.freeze({
    referenceKey: `grant:update:${createHash('sha256').update(identity, 'utf8').digest('hex')}`,
    ...common,
    kind: 'grant',
    schemaKind: 'update',
  });
}

function emptyDiagnostics(): readonly RecordContractDiagnostic[] {
  return Object.freeze([]);
}

function emptyValidationIssues(): readonly RecordJsonSchemaValidationIssue[] {
  return Object.freeze([]);
}

export namespace Services {
  /** Performs record-schema lifecycle checks and caller-effective create/update/immutable resolution. */
  export class RecordSchema extends services.Core.Service {
    protected override _exportedMethods = [
      'init',
      'bootstrap',
      'resolveCreate',
      'resolveUpdate',
      'resolveImmutable',
      'validateResolvedArtifact',
      'persistSaveUsageReference',
      'materializeIntegrationPins',
      'bootstrapIntegrationPins',
      'reportRetention',
    ];
    protected override logHeader = 'RecordSchemaService::';
    private readonly dependencies: RecordSchemaServiceDependencies;
    private validatorCache: RecordSchemaValidatorCache | undefined;
    private validatorCacheMaximum: number | undefined;

    public constructor(overrides: Partial<RecordSchemaServiceDependencies> = {}) {
      super();
      this.dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
    }

    private safeLog(
      level: 'info' | 'error',
      event: 'record_schema_unexpected_failure' | 'record_schema_startup_check',
      context: RecordSchemaLogContext,
      values: RecordSchemaSafeLogValues = {}
    ): void {
      try {
        const logger = this.dependencies.telemetryLogger ?? this.logger;
        logger[level](event, Object.freeze({ event, context, ...values }));
      } catch {
        // Logging must never alter service results or startup failure ordering.
      }
    }

    private logUnexpected(context: RecordSchemaLogContext, error: unknown): void {
      this.safeLog('error', 'record_schema_unexpected_failure', context, {
        error_type: safeErrorType(error),
      });
    }

    private clock(): number {
      try {
        const value = this.dependencies.clock();
        return Number.isFinite(value) ? value : 0;
      } catch {
        return 0;
      }
    }

    private cacheFor(maximum: number): RecordSchemaValidatorCache {
      if (!this.validatorCache || this.validatorCacheMaximum !== maximum) {
        this.validatorCache = new RecordSchemaValidatorCache(maximum);
        this.validatorCacheMaximum = maximum;
      }
      return this.validatorCache;
    }

    private observeResolver<T extends { readonly kind: string }>(schemaKind: RecordSchemaTelemetryKind, result: T): T {
      recordCounter(recordSchemaResolverOutcomes, {
        schema_kind: schemaKind,
        outcome: telemetryDimension(result.kind, RECORD_SCHEMA_RESOLVER_OUTCOMES, 'unexpected-failure'),
      });
      if (schemaKind !== 'unknown' && (result.kind === 'resolved' || result.kind === 'partial')) {
        recordCounter(recordSchemaCompleteness, {
          schema_kind: schemaKind,
          completeness: result.kind === 'partial' ? 'partial' : 'complete',
        });
      }
      return result;
    }

    /** Resolve, compile, persist, and grant one caller-effective create schema. */
    public async resolveCreate(request: ResolveCreateRecordSchemaRequest): Promise<ResolveCreateRecordSchemaResult> {
      try {
        return this.observeResolver('create', await this.resolveCreateInternal(request));
      } catch (error) {
        this.logUnexpected('resolve-create', error);
        throw error;
      }
    }

    private async resolveCreateInternal(
      request: ResolveCreateRecordSchemaRequest
    ): Promise<ResolveCreateRecordSchemaResult> {
      const config = this.resolveRuntimeConfig();
      if (!config) {
        return {
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        };
      }
      if (!config.enabled) {
        return {
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
        };
      }

      let internalContext: RecordContractCreateContext;
      try {
        const resolvedContext = await this.dependencies.resolveContractContext({
          kind: 'create',
          brand: request.brand,
          portal: request.portal,
          recordType: request.recordType,
          operation: request.operation,
          targetStep: request.targetStep,
          actor: callerActor(request.caller),
        });
        if (!isCreateContractContext(resolvedContext)) {
          return this.contextFailure('not-resolvable');
        }
        internalContext = resolvedContext;
      } catch (error) {
        if (error instanceof RecordContractContextResolutionError) {
          return this.contextFailure(error.failureKind, error.diagnosticCodes);
        }
        this.logUnexpected('resolve-create-context', error);
        return this.contextFailure('unavailable');
      }

      let authorized = isInternalRecordSchemaCreateAuthorizationCapability(request.internalAuthorizationCapability);
      if (!authorized) {
        try {
          authorized = await this.dependencies.authorizeCreate(internalContext, request.caller);
        } catch (error) {
          this.logUnexpected('resolve-create-authorization', error);
          return this.contextFailure('unavailable');
        }
      }
      if (!authorized) {
        return this.contextFailure('forbidden');
      }

      const context = createContextWithPublicBrand(internalContext, publicBranding(request));

      const pipeline = await this.compileAndPersist(config, context, artifact =>
        createGrantReference(artifact, context.publicContext)
      );
      if (pipeline.kind !== 'resolved' && pipeline.kind !== 'partial') {
        return pipeline;
      }
      const resolutionBase = {
        document: pipeline.document,
        digest: pipeline.digest,
        grant: pipeline.grant,
      } as const;
      if (pipeline.kind === 'partial') {
        return Object.freeze({
          kind: 'partial',
          ...resolutionBase,
          metadata: Object.freeze({
            schemaKind: 'create',
            contractFormat: pipeline.contractFormat,
            completeness: 'partial',
            byteLength: pipeline.byteLength,
            etag: pipeline.etag,
            context: context.publicContext,
          }),
        });
      }
      return Object.freeze({
        kind: 'resolved',
        ...resolutionBase,
        metadata: Object.freeze({
          schemaKind: 'create',
          contractFormat: pipeline.contractFormat,
          completeness: 'complete',
          byteLength: pipeline.byteLength,
          etag: pipeline.etag,
          context: context.publicContext,
        }),
      });
    }

    /** Resolve, authorize, compile, persist, and grant one caller-effective update-delta schema. */
    public async resolveUpdate(request: ResolveUpdateRecordSchemaRequest): Promise<ResolveUpdateRecordSchemaResult> {
      try {
        return this.observeResolver('update', await this.resolveUpdateInternal(request));
      } catch (error) {
        this.logUnexpected('resolve-update', error);
        throw error;
      }
    }

    private async resolveUpdateInternal(
      request: ResolveUpdateRecordSchemaRequest
    ): Promise<ResolveUpdateRecordSchemaResult> {
      const config = this.resolveRuntimeConfig();
      if (!config) {
        return {
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        };
      }
      if (!config.enabled) {
        return {
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
        };
      }

      let internalContext: RecordContractUpdateContext;
      try {
        const resolvedContext = await this.dependencies.resolveContractContext({
          kind: 'update',
          brand: request.brand,
          portal: request.portal,
          oid: request.oid,
          operation: request.operation,
          actor: callerActor(request.caller),
        });
        if (!isUpdateContractContext(resolvedContext)) {
          return this.contextFailure('not-resolvable');
        }
        internalContext = resolvedContext;
      } catch (error) {
        if (error instanceof RecordContractContextResolutionError) {
          if (error.failureKind === 'not-found' && error.diagnosticCodes.length === 0) {
            return {
              kind: 'missing-oid',
              code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
            };
          }
          return this.contextFailure(error.failureKind, error.diagnosticCodes);
        }
        this.logUnexpected('resolve-update-context', error);
        return this.contextFailure('unavailable');
      }

      let authorized = isInternalRecordSchemaUpdateAuthorizationCapability(request.internalAuthorizationCapability);
      if (!authorized) {
        try {
          authorized = await this.dependencies.authorizeUpdate(internalContext, request.caller);
        } catch (error) {
          this.logUnexpected('resolve-update-authorization', error);
          return this.contextFailure('unavailable');
        }
      }
      if (!authorized) {
        return {
          kind: 'denied',
          code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
        };
      }

      const context = updateContextWithPublicBrand(internalContext, publicBranding(request));

      const compilation = await this.compileContext(config, context, request.caller);
      if (compilation.kind !== 'resolved' && compilation.kind !== 'partial') {
        return compilation;
      }

      const ifMatch = parseRecordJsonSchemaEtag(request.ifMatch);
      if (ifMatch.kind === 'invalid') {
        return Object.freeze({
          kind: 'invalid-precondition',
          condition: 'if-match',
          reason: ifMatch.reason,
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
        });
      }
      if (ifMatch.kind === 'parsed' && ifMatch.digest !== compilation.digest) {
        recordCounter(recordSchemaPreconditionMismatches, {
          schema_kind: 'update',
          condition: 'if-match',
        });
        return Object.freeze({
          kind: 'precondition-failed',
          condition: 'if-match',
          reason: 'mismatch',
          code: RECORD_SCHEMA_PROBLEM_CODES.PRECONDITION_FAILED,
        });
      }

      const pipeline = await this.persistCompilation(compilation, artifact =>
        createUpdateGrantReference(artifact, context)
      );
      if (pipeline.kind !== 'resolved' && pipeline.kind !== 'partial') {
        return pipeline;
      }
      const resolutionBase = {
        document: pipeline.document,
        digest: pipeline.digest,
        grant: pipeline.grant,
      } as const;
      if (pipeline.kind === 'partial') {
        return Object.freeze({
          kind: 'partial',
          ...resolutionBase,
          metadata: Object.freeze({
            schemaKind: 'update',
            contractFormat: pipeline.contractFormat,
            completeness: 'partial',
            byteLength: pipeline.byteLength,
            etag: pipeline.etag,
            context: context.publicContext,
          }),
        });
      }
      return Object.freeze({
        kind: 'resolved',
        ...resolutionBase,
        metadata: Object.freeze({
          schemaKind: 'update',
          contractFormat: pipeline.contractFormat,
          completeness: 'complete',
          byteLength: pipeline.byteLength,
          etag: pipeline.etag,
          context: context.publicContext,
        }),
      });
    }

    /** Retrieve one immutable artifact only after current equivalent authorization succeeds. */
    public async resolveImmutable(
      request: ResolveImmutableRecordSchemaRequest
    ): Promise<ResolveImmutableRecordSchemaResult> {
      try {
        return this.observeResolver('unknown', await this.resolveImmutableInternal(request));
      } catch (error) {
        this.logUnexpected('resolve-immutable', error);
        throw error;
      }
    }

    private async resolveImmutableInternal(
      request: ResolveImmutableRecordSchemaRequest
    ): Promise<ResolveImmutableRecordSchemaResult> {
      if (typeof request.digest !== 'string' || !DIGEST_PATTERN.test(request.digest)) {
        return invalidDigestResult(request);
      }

      const actor = callerActor(request.caller);
      const callerBrand = typeof request.caller.brand?.id === 'string' ? request.caller.brand.id.trim() : '';
      if (callerBrand !== request.brand || !actor.authenticated) {
        return immutableNotFoundResult(request);
      }

      const config = this.resolveRuntimeConfig();
      if (!config) {
        return immutableUnavailableResult(request, RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID);
      }
      if (!config.enabled) {
        return immutableUnavailableResult(request, RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE);
      }

      let storageValue: unknown;
      try {
        storageValue = this.dependencies.getStorageProvider();
      } catch (error) {
        this.logUnexpected('resolve-immutable-storage-provider', error);
        storageValue = undefined;
      }
      if (!isImmutableStorageProvider(storageValue)) {
        return immutableUnavailableResult(request, RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE);
      }
      const storage = storageValue;

      let artifact: RecordSchemaArtifactModel | null;
      try {
        artifact = await storage.getRecordSchemaArtifact(request.digest);
      } catch (error) {
        this.logUnexpected('resolve-immutable-artifact-read', error);
        return immutableUnavailableResult(request, RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE);
      }
      if (!artifact) {
        return immutableNotFoundResult(request);
      }
      if (!isObjectRecord(artifact) || ownDataProperty(artifact, 'digest') !== request.digest) {
        return immutableInvalidContractResult(request, 'unverified');
      }

      const authorizationQuery = immutableAuthorizationQuery(artifact, request);
      if (!authorizationQuery) {
        return immutableGrantInvalidContractResult(request);
      }

      let afterReferenceKey: string | undefined;
      let authorizedCompilation: RecordSchemaCompiledContext | undefined;
      // Each lookup is bounded and cursor-indexed; only null exhaustion is a conclusive denial.
      while (!authorizedCompilation) {
        let rawGrant: unknown;
        try {
          rawGrant = await storage.findRecordSchemaGrantForAuthorization(
            afterReferenceKey === undefined
              ? authorizationQuery
              : Object.freeze({ ...authorizationQuery, afterReferenceKey })
          );
        } catch (error) {
          this.logUnexpected('resolve-immutable-grant-list', error);
          return immutableUnavailableResult(request, RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE);
        }
        if (rawGrant === null) {
          return immutableNotFoundResult(request);
        }
        const parsedGrant = parseImmutableGrant(rawGrant, request);
        if (
          parsedGrant.kind !== 'grant' ||
          parsedGrant.grant.schemaKind !== authorizationQuery.schemaKind ||
          parsedGrant.grant.recordType !== authorizationQuery.recordType ||
          parsedGrant.grant.operation !== authorizationQuery.operation ||
          (afterReferenceKey !== undefined && compareText(parsedGrant.grant.referenceKey, afterReferenceKey) <= 0)
        ) {
          this.safeLog('error', 'record_schema_unexpected_failure', 'resolve-immutable-grant-contract', {
            error_type: 'non-error',
          });
          return immutableGrantInvalidContractResult(request);
        }
        authorizedCompilation = await this.resolveImmutableGrant(
          config,
          artifact,
          parsedGrant.grant,
          request.caller,
          actor,
          request.brand
        );
        afterReferenceKey = parsedGrant.grant.referenceKey;
      }

      const immutableArtifact = verifiedImmutableArtifact(artifact, authorizedCompilation);
      if (!immutableArtifact) {
        return immutableInvalidContractResult(request, 'authorized');
      }

      const ifNoneMatch = parseRecordJsonSchemaEtag(request.ifNoneMatch);
      if (ifNoneMatch.kind === 'invalid') {
        return invalidImmutableConditionalResult(request);
      }
      const notModified = ifNoneMatch.kind === 'parsed' && ifNoneMatch.digest === authorizedCompilation.digest;
      let touch: StorageServiceResponse | undefined;
      try {
        touch = await storage.touchRecordSchemaArtifact(request.digest);
      } catch (error) {
        this.logUnexpected('resolve-immutable-artifact-touch', error);
        return immutableUnavailableResult(request, RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE);
      }
      if (!storageResponseSucceeded(touch)) {
        return immutableUnavailableResult(request, RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE);
      }

      return Object.freeze({
        kind: notModified ? 'not-modified' : 'resolved',
        artifact: immutableArtifact,
      });
    }

    /** Validate raw input against an already resolved immutable artifact without exposing validator internals. */
    public validateResolvedArtifact(request: unknown): ValidateResolvedRecordSchemaResult {
      const parsed = parseResolvedSchemaValidationRequest(request);
      if (!parsed) {
        recordCounter(recordSchemaValidationResults, { schema_kind: 'unknown', result: 'invalid-input' });
        return Object.freeze({ kind: 'invalid-input', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST });
      }

      const config = this.resolveRuntimeConfig();
      if (!config || !config.enabled) {
        recordCounter(recordSchemaValidationResults, {
          schema_kind: parsed.schemaKind,
          result: 'unavailable',
        });
        return Object.freeze({
          kind: 'unavailable',
          code: config ? RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE : RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }

      let identity: ReturnType<typeof identifyRecordJsonSchema>;
      try {
        identity = identifyRecordJsonSchema(parsed.document, config.limits.maxDocumentBytes);
      } catch {
        recordCounter(recordSchemaValidationResults, {
          schema_kind: parsed.schemaKind,
          result: 'unavailable',
        });
        recordCounter(recordSchemaValidationProblems, {
          schema_kind: parsed.schemaKind,
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        });
        return Object.freeze({ kind: 'unavailable', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
      }
      if (identity.digest !== parsed.digest) {
        recordCounter(recordSchemaValidationResults, {
          schema_kind: parsed.schemaKind,
          result: 'unavailable',
        });
        recordCounter(recordSchemaValidationProblems, {
          schema_kind: parsed.schemaKind,
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        });
        return Object.freeze({ kind: 'unavailable', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
      }

      const cache = this.cacheFor(config.cacheMaxEntries);
      let cached = cache.get(parsed.digest);
      recordCounter(recordSchemaCacheResults, {
        schema_kind: parsed.schemaKind,
        result: cached ? 'hit' : 'miss',
      });
      if (!cached) {
        const startedAt = this.clock();
        try {
          const artifact = compileRecordJsonSchemaArtifact(identity.document, {
            maxDocumentBytes: config.limits.maxDocumentBytes,
            maxValidationErrors: config.limits.maxDiagnostics,
          });
          cache.set(artifact);
          cached = cache.get(parsed.digest);
          recordDuration(this.clock() - startedAt, {
            schema_kind: parsed.schemaKind,
            phase: 'validation',
            outcome: 'resolved',
          });
          recordCounter(recordSchemaCompileOutcomes, {
            schema_kind: parsed.schemaKind,
            phase: 'validation',
            outcome: 'resolved',
          });
        } catch (error) {
          this.logUnexpected('validation-compile', error);
          recordDuration(this.clock() - startedAt, {
            schema_kind: parsed.schemaKind,
            phase: 'validation',
            outcome: 'failed',
          });
          recordCounter(recordSchemaCompileOutcomes, {
            schema_kind: parsed.schemaKind,
            phase: 'validation',
            outcome: 'failed',
          });
          recordCounter(recordSchemaValidationResults, {
            schema_kind: parsed.schemaKind,
            result: 'unavailable',
          });
          return Object.freeze({ kind: 'unavailable', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
        }
      }
      if (!cached) {
        recordCounter(recordSchemaValidationResults, {
          schema_kind: parsed.schemaKind,
          result: 'unavailable',
        });
        return Object.freeze({ kind: 'unavailable', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
      }

      let validation: RecordJsonSchemaValidationResult;
      try {
        validation = cached.validator.validate(parsed.input);
      } catch (error) {
        this.logUnexpected('validation-run', error);
        recordCounter(recordSchemaValidationResults, {
          schema_kind: parsed.schemaKind,
          result: 'unavailable',
        });
        return Object.freeze({ kind: 'unavailable', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
      }
      recordCounter(recordSchemaValidationResults, {
        schema_kind: parsed.schemaKind,
        result: validation.valid ? 'valid' : 'invalid',
      });
      if (!validation.valid) {
        for (const code of new Set(validation.issues.map(issue => telemetryCode(issue.code)))) {
          recordCounter(recordSchemaValidationProblems, { schema_kind: parsed.schemaKind, code });
        }
      }
      return Object.freeze({ kind: 'validated', ...validation });
    }

    /** Persist or refresh one post-save usage reference without changing the normal record-save path. */
    public async persistSaveUsageReference(request: unknown): Promise<PersistRecordSchemaSaveUsageResult> {
      let result: PersistRecordSchemaSaveUsageResult;
      try {
        result = await this.persistSaveUsageReferenceInternal(request);
      } catch (error) {
        this.logUnexpected('save-reference', error);
        result = Object.freeze({
          kind: 'unavailable',
          stage: 'storage',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        });
      }
      recordCounter(recordSchemaUsageReferences, {
        reference_kind: 'save',
        outcome: telemetryDimension(result.kind, RECORD_SCHEMA_USAGE_REFERENCE_OUTCOMES, 'unavailable'),
        code: telemetryCode('code' in result ? result.code : undefined),
      });
      return result;
    }

    private async persistSaveUsageReferenceInternal(request: unknown): Promise<PersistRecordSchemaSaveUsageResult> {
      const parsed = parseSaveUsageRequest(request);
      if (!parsed) {
        return Object.freeze({
          kind: 'invalid-input',
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
        });
      }

      const config = this.resolveRuntimeConfig();
      if (!config) {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }
      if (!config.enabled) {
        return Object.freeze({
          kind: 'disabled',
          code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
        });
      }

      let storageValue: unknown;
      try {
        storageValue = this.dependencies.getStorageProvider();
      } catch (error) {
        this.logUnexpected('save-reference-storage-provider', error);
        storageValue = undefined;
      }
      if (!isReferenceStorageProvider(storageValue)) {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'storage',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        });
      }

      const reference = createSaveReference(parsed);
      const identity = Object.freeze({ digest: reference.digest, referenceKey: reference.referenceKey });
      let response: StorageServiceResponse | undefined;
      try {
        response = await storageValue.putRecordSchemaReference(reference);
      } catch (error) {
        this.logUnexpected('save-reference-storage', error);
        return Object.freeze({
          kind: 'write-failed',
          stage: 'save-reference',
          ...referenceWriteFailure(),
          reference: identity,
        });
      }
      if (!storageResponseSucceeded(response)) {
        return Object.freeze({
          kind: 'write-failed',
          stage: 'save-reference',
          ...referenceWriteFailure(response),
          reference: identity,
        });
      }
      return Object.freeze({ kind: 'recorded', reference: identity });
    }

    /** Idempotently materialize the allowlisted fields of configured integration pins. */
    public async materializeIntegrationPins(): Promise<MaterializeRecordSchemaIntegrationPinsResult> {
      let result: MaterializeRecordSchemaIntegrationPinsResult;
      try {
        result = await this.materializeIntegrationPinsInternal();
      } catch (error) {
        this.logUnexpected('integration-pin-maintenance', error);
        result = Object.freeze({
          kind: 'unavailable',
          stage: 'storage',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        });
      }
      if (result.kind === 'materialized' || result.kind === 'failed') {
        for (const pin of result.pins) {
          recordCounter(recordSchemaUsageReferences, {
            reference_kind: 'pin',
            outcome: telemetryDimension(pin.status, RECORD_SCHEMA_USAGE_REFERENCE_OUTCOMES, 'unavailable'),
            code: telemetryCode(pin.status === 'write-failed' ? pin.code : undefined),
          });
        }
      } else {
        recordCounter(recordSchemaUsageReferences, {
          reference_kind: 'pin',
          outcome: telemetryDimension(result.kind, RECORD_SCHEMA_USAGE_REFERENCE_OUTCOMES, 'unavailable'),
          code: telemetryCode(result.code),
        });
      }
      return result;
    }

    private async materializeIntegrationPinsInternal(): Promise<MaterializeRecordSchemaIntegrationPinsResult> {
      let rawConfig: unknown;
      try {
        rawConfig = this.dependencies.getConfig();
      } catch {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }
      const configSnapshot = snapshotRecordSchemaConfig(rawConfig);
      if (configSnapshot.kind === 'pin-limit') {
        return Object.freeze({
          kind: 'limit-exceeded',
          code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
          maximum: MAX_RECORD_SCHEMA_INTEGRATION_PINS,
        });
      }
      if (configSnapshot.kind === 'unreadable') {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }
      rawConfig = configSnapshot.value;
      let validation: ReturnType<typeof validateRecordSchemaConfig>;
      try {
        validation = validateRecordSchemaConfig(rawConfig);
      } catch {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }
      if (!validation.valid) {
        const capped = validation.problems.some(
          problem => problem.path === 'recordSchema.integrationPins' && problem.reason === 'maximum-items'
        );
        return capped
          ? Object.freeze({
              kind: 'limit-exceeded' as const,
              code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
              maximum: MAX_RECORD_SCHEMA_INTEGRATION_PINS,
            })
          : Object.freeze({
              kind: 'unavailable' as const,
              stage: 'configuration' as const,
              code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
            });
      }
      let findings: readonly RecordSchemaLifecycleFinding[];
      try {
        findings = configuredFindings(rawConfig);
      } catch {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }
      if (findings.length > 0) {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }
      if (!validation.config.enabled) {
        return Object.freeze({
          kind: 'disabled',
          code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
        });
      }

      let storageValue: unknown;
      try {
        storageValue = this.dependencies.getStorageProvider();
      } catch (error) {
        this.logUnexpected('integration-pin-storage-provider', error);
        storageValue = undefined;
      }
      if (!isReferenceStorageProvider(storageValue)) {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'storage',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        });
      }

      let references: readonly RecordSchemaPinReferenceInput[];
      try {
        references = configuredPinReferences(validation.config);
      } catch {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }

      const pins: RecordSchemaPinMaterializationEntry[] = [];
      let failed = false;
      for (const reference of references) {
        let response: StorageServiceResponse | undefined;
        try {
          response = await storageValue.putRecordSchemaReference(reference);
        } catch (error) {
          this.logUnexpected('integration-pin-write', error);
          response = undefined;
        }
        if (storageResponseSucceeded(response)) {
          pins.push(
            Object.freeze({ digest: reference.digest, referenceKey: reference.referenceKey, status: 'materialized' })
          );
        } else {
          failed = true;
          pins.push(
            Object.freeze({
              digest: reference.digest,
              referenceKey: reference.referenceKey,
              status: 'write-failed',
              ...referenceWriteFailure(response),
            })
          );
        }
      }
      const immutablePins = Object.freeze(pins);
      return failed
        ? Object.freeze({
            kind: 'failed',
            pins: immutablePins,
          })
        : Object.freeze({ kind: 'materialized', pins: immutablePins });
    }

    /** Awaited during core bootstrap so configured pins exist before application readiness. */
    public async bootstrapIntegrationPins(): Promise<void> {
      let result: MaterializeRecordSchemaIntegrationPinsResult;
      try {
        result = await this.materializeIntegrationPins();
      } catch (error) {
        this.logUnexpected('integration-pin-startup', error);
        this.safeLog('info', 'record_schema_startup_check', 'integration-pins', { status: 'failed' });
        throw error;
      }
      if (result.kind === 'materialized' || result.kind === 'disabled') {
        this.safeLog('info', 'record_schema_startup_check', 'integration-pins', {
          status: result.kind === 'disabled' ? 'disabled' : 'passed',
        });
        return;
      }
      this.safeLog('info', 'record_schema_startup_check', 'integration-pins', { status: 'failed' });
      const codes =
        result.kind === 'failed'
          ? result.pins
              .filter(
                (pin): pin is Extract<RecordSchemaPinMaterializationEntry, { status: 'write-failed' }> =>
                  pin.status === 'write-failed'
              )
              .map(pin => pin.code)
              .sort(compareText)
          : [result.code];
      throw new Error(`Configured record schema integration pins were not materialized (${codes.join(',')}).`);
    }

    /** Produce a deterministic, non-destructive retention dry run for a bounded candidate digest set. */
    public async reportRetention(request: unknown): Promise<RecordSchemaRetentionReportResult> {
      const parsed = parseRetentionReportRequest(request);
      if (!parsed.ok) {
        return Object.freeze({
          kind: 'invalid-input',
          reason: parsed.reason,
          code:
            parsed.reason === 'limit'
              ? RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED
              : RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
        });
      }

      const config = this.resolveRuntimeConfig();
      if (!config) {
        return Object.freeze({
          kind: 'unavailable',
          stage: 'configuration',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        });
      }
      if (!config.enabled) {
        return Object.freeze({
          kind: 'disabled',
          code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
        });
      }

      let storageValue: unknown;
      try {
        storageValue = this.dependencies.getStorageProvider();
      } catch (error) {
        this.logUnexpected('retention-storage-provider', error);
        storageValue = undefined;
      }
      let storage: RecordSchemaRetentionStorageProvider;
      if (parsed.request.kind === 'targeted') {
        if (!isTargetedRetentionStorageProvider(storageValue)) {
          return Object.freeze({
            kind: 'unavailable',
            stage: 'storage',
            code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
          });
        }
        storage = storageValue;
      } else {
        if (!isPagedRetentionStorageProvider(storageValue)) {
          return Object.freeze({
            kind: 'unavailable',
            stage: 'storage',
            code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
          });
        }
        storage = storageValue;
      }

      const artifacts: RecordSchemaArtifactSummary[] = [];
      const missingDigests: string[] = [];
      let page: { readonly limit: number; readonly nextCursor?: string } | undefined;
      if (parsed.request.kind === 'targeted') {
        for (const digest of parsed.request.digests) {
          let artifact: unknown;
          try {
            artifact = await storage.getRecordSchemaArtifact?.(digest);
          } catch (error) {
            this.logUnexpected('retention-artifact-read', error);
            return Object.freeze({
              kind: 'unavailable',
              stage: 'storage',
              code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
            });
          }
          if (artifact === null) {
            missingDigests.push(digest);
            continue;
          }
          const summary = retentionArtifactSummary(artifact, digest);
          if (!summary) {
            return Object.freeze({
              kind: 'invalid-state',
              code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
            });
          }
          artifacts.push(summary);
        }
      } else {
        let listedArtifacts: unknown;
        try {
          listedArtifacts = await storage.listRecordSchemaArtifacts?.({
            ...(parsed.request.cursor ? { afterDigest: parsed.request.cursor } : {}),
            limit: parsed.request.limit + 1,
          });
        } catch (error) {
          this.logUnexpected('retention-artifact-list', error);
          return Object.freeze({
            kind: 'unavailable',
            stage: 'storage',
            code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
          });
        }
        const boundedArtifacts = boundedArraySnapshot(listedArtifacts, parsed.request.limit + 1);
        if (boundedArtifacts.kind === 'invalid') {
          return Object.freeze({
            kind: 'invalid-state',
            code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          });
        }
        if (boundedArtifacts.kind === 'overflow') {
          return Object.freeze({
            kind: 'limit-exceeded',
            code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
            scope: 'artifact-page',
          });
        }
        let previousDigest = parsed.request.cursor;
        for (const artifact of boundedArtifacts.values) {
          const summary = retentionArtifactSummary(artifact);
          if (!summary || (previousDigest !== undefined && compareText(summary.digest, previousDigest) <= 0)) {
            return Object.freeze({
              kind: 'invalid-state',
              code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
            });
          }
          artifacts.push(summary);
          previousDigest = summary.digest;
        }
        const hasMore = artifacts.length > parsed.request.limit;
        if (hasMore) artifacts.pop();
        page = Object.freeze({
          limit: parsed.request.limit,
          ...(hasMore && artifacts.length > 0 ? { nextCursor: artifacts[artifacts.length - 1].digest } : {}),
        });
      }

      const entries: RecordSchemaRetentionReportEntry[] = [];
      for (const artifact of artifacts) {
        const digest = artifact.digest;
        let references: unknown;
        try {
          references = await storage.listRecordSchemaReferences({
            digest,
            includeExpiredPins: true,
            limit: RECORD_SCHEMA_RETENTION_REFERENCE_LIMIT,
            offset: 0,
          });
        } catch (error) {
          this.logUnexpected('retention-reference-read', error);
          return Object.freeze({
            kind: 'unavailable',
            stage: 'storage',
            code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
          });
        }

        const boundedReferences = boundedArraySnapshot(references, RECORD_SCHEMA_RETENTION_REFERENCE_LIMIT);
        if (boundedReferences.kind === 'invalid') {
          return Object.freeze({
            kind: 'invalid-state',
            code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          });
        }
        if (boundedReferences.kind === 'overflow') {
          return Object.freeze({
            kind: 'limit-exceeded',
            code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
            digest,
          });
        }
        const referenceCount = boundedReferences.values.length;
        if (referenceCount === RECORD_SCHEMA_RETENTION_REFERENCE_LIMIT) {
          let overflow: unknown;
          try {
            overflow = await storage.listRecordSchemaReferences({
              digest,
              includeExpiredPins: true,
              limit: 1,
              offset: RECORD_SCHEMA_RETENTION_REFERENCE_LIMIT,
            });
          } catch (error) {
            this.logUnexpected('retention-reference-overflow-read', error);
            return Object.freeze({
              kind: 'unavailable',
              stage: 'storage',
              code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
            });
          }
          const boundedOverflow = boundedArraySnapshot(overflow, 0);
          if (boundedOverflow.kind === 'invalid') {
            return Object.freeze({
              kind: 'invalid-state',
              code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
            });
          }
          if (boundedOverflow.kind === 'overflow') {
            return Object.freeze({
              kind: 'limit-exceeded',
              code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
              digest,
            });
          }
        }

        const entry = retentionEntry(
          artifact,
          boundedReferences.values,
          digest,
          parsed.request.now,
          config.retention.minimumAgeDays
        );
        if (!entry) {
          return Object.freeze({
            kind: 'invalid-state',
            code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          });
        }
        entries.push(entry);
      }

      return Object.freeze({
        kind: 'reported',
        now: new Date(parsed.request.now.getTime()),
        minimumAgeDays: config.retention.minimumAgeDays,
        entries: Object.freeze(entries),
        missingDigests: Object.freeze(missingDigests),
        ...(page ? { page } : {}),
      });
    }

    private async resolveImmutableGrant(
      config: RecordSchemaConfig,
      artifact: RecordSchemaArtifactModel,
      grant: RecordSchemaGrantReferenceModel,
      caller: FormRecordAccessContext,
      actor: RecordContractContextActor,
      internalBrand: string
    ): Promise<RecordSchemaCompiledContext | undefined> {
      let internalContext: RecordContractContext;
      try {
        internalContext = await this.dependencies.resolveContractContext(
          grant.schemaKind === 'create'
            ? {
                kind: 'create',
                brand: internalBrand,
                portal: grant.portal,
                recordType: grant.recordType,
                operation: immutableGrantOperation(grant.operation),
                targetStep: immutableCreateTargetStep(artifact),
                actor,
              }
            : {
                kind: 'update',
                brand: internalBrand,
                portal: grant.portal,
                oid: grant.oid,
                operation: immutableGrantOperation(grant.operation),
                actor,
              }
        );
      } catch {
        return undefined;
      }

      let context: RecordContractContext;
      if (grant.schemaKind === 'create') {
        if (!isCreateContractContext(internalContext)) return undefined;
        context = createContextWithPublicBrand(internalContext, grant.brand);
      } else {
        if (!isUpdateContractContext(internalContext)) return undefined;
        context = updateContextWithPublicBrand(internalContext, grant.brand);
      }

      if (
        context.publicContext.kind !== grant.schemaKind ||
        context.publicContext.brand !== grant.brand ||
        context.publicContext.portal !== grant.portal ||
        context.publicContext.recordType !== grant.recordType ||
        context.publicContext.operation !== grant.operation
      ) {
        return undefined;
      }

      let recordAccessContext: FormRecordAccessContext | undefined;
      if (grant.schemaKind === 'create') {
        if (!isCreateContractContext(context) || !isCreateContractContext(internalContext)) {
          return undefined;
        }
        try {
          if (!(await this.dependencies.authorizeCreate(internalContext, caller))) {
            return undefined;
          }
        } catch {
          return undefined;
        }
      } else {
        if (
          !isUpdateContractContext(context) ||
          !isUpdateContractContext(internalContext) ||
          context.resolution.oid !== grant.oid
        ) {
          return undefined;
        }
        try {
          if (!(await this.dependencies.authorizeUpdate(internalContext, caller))) {
            return undefined;
          }
        } catch {
          return undefined;
        }
        recordAccessContext = caller;
      }

      const compilation = await this.compileContext(config, context, recordAccessContext);
      return (compilation.kind === 'resolved' || compilation.kind === 'partial') && compilation.digest === grant.digest
        ? compilation
        : undefined;
    }

    private async compileContext(
      config: RecordSchemaConfig,
      context: RecordContractContext,
      recordAccessContext?: FormRecordAccessContext
    ): Promise<RecordSchemaCompilationResult> {
      const schemaKind = metricKind(context.publicContext.kind);
      const startedAt = this.clock();
      try {
        const result = await this.compileContextUnobserved(config, context, recordAccessContext);
        const outcome = telemetryDimension(
          result.kind === 'resolved' || result.kind === 'partial' ? 'resolved' : result.kind,
          RECORD_SCHEMA_COMPILE_OUTCOMES,
          'unexpected-failure'
        );
        const attributes = { schema_kind: schemaKind, phase: 'resolution', outcome } as const;
        recordDuration(this.clock() - startedAt, attributes);
        recordCounter(recordSchemaCompileOutcomes, attributes);
        return result;
      } catch (error) {
        this.logUnexpected('compile', error);
        const attributes = { schema_kind: schemaKind, phase: 'resolution', outcome: 'unexpected-failure' } as const;
        recordDuration(this.clock() - startedAt, attributes);
        recordCounter(recordSchemaCompileOutcomes, attributes);
        throw error;
      }
    }

    private async compileContextUnobserved(
      config: RecordSchemaConfig,
      context: RecordContractContext,
      recordAccessContext?: FormRecordAccessContext
    ): Promise<RecordSchemaCompilationResult> {
      let formBuild: RecordContractFormBuildResult;
      try {
        formBuild = await this.dependencies.buildContractFormConfig(context, recordAccessContext);
      } catch (error) {
        this.logUnexpected('compile-form-build', error);
        return this.contextFailure('not-resolvable');
      }
      if (!formBuild.ok) {
        return this.contextFailure('not-resolvable', [], formBuild.reason);
      }

      let registry: RecordContractContributorRegistry | undefined;
      try {
        registry = this.dependencies.getContributorRegistry();
      } catch (error) {
        this.logUnexpected('compile-contributors', error);
        registry = undefined;
      }
      if (!registry) {
        return {
          kind: 'unavailable',
          stage: 'contributors',
          code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
        };
      }

      const compiler = new RecordContractCompiler(registry, config.limits);
      const compileResult = await compiler.compile({
        form: formBuild.effectiveForm,
        context: context.publicContext,
        reusableFormDefinitions: context.resolution.reusableFormDefinitions,
      });
      if (compileResult.kind === 'failed') {
        if (compileResult.failureKind === 'limit-exceeded') {
          return {
            kind: 'limit-exceeded',
            stage: 'compiler',
            code: compileResult.code,
            diagnostics: compileResult.diagnostics,
          };
        }
        return {
          kind: 'compiler-failed',
          failureKind: compileResult.failureKind,
          code: compileResult.code,
          diagnostics: compileResult.diagnostics,
        };
      }
      if (Object.keys(compileResult.contract.root.properties).length === 0) {
        return this.contextFailure('not-resolvable', [], 'empty-effective-form');
      }

      let rendered: ReturnType<typeof renderRecordJsonSchema>;
      try {
        rendered = renderRecordJsonSchema(compileResult.contract);
      } catch (error) {
        if (!(error instanceof RecordJsonSchemaRendererError)) {
          this.logUnexpected('compile-renderer', error);
        }
        return {
          kind: 'compiler-failed',
          failureKind: 'renderer',
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          diagnostics:
            error instanceof RecordJsonSchemaRendererError
              ? Object.freeze([
                  Object.freeze({
                    code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
                    severity: 'error' as const,
                    message: 'The compiled record contract could not be rendered.',
                  }),
                ])
              : emptyDiagnostics(),
        };
      }

      let artifact: ReturnType<typeof compileRecordJsonSchemaArtifact>;
      try {
        artifact = compileRecordJsonSchemaArtifact(rendered, {
          maxDocumentBytes: config.limits.maxDocumentBytes,
          maxValidationErrors: config.limits.maxDiagnostics,
        });
      } catch (error) {
        if (error instanceof RecordJsonSchemaDocumentLimitError) {
          return {
            kind: 'limit-exceeded',
            stage: 'artifact',
            code: error.code,
            diagnostics: emptyDiagnostics(),
            byteLength: error.byteLength,
            maximum: error.maxDocumentBytes,
          };
        }
        if (error instanceof RecordJsonSchemaCompilationError) {
          return {
            kind: 'meta-validation-failed',
            reason: error.reason,
            code: error.code,
            issues: error.issues,
          };
        }
        if (error instanceof RecordJsonSchemaIdentityError && error.reason === 'invalid-limit') {
          return {
            kind: 'limit-exceeded',
            stage: 'artifact',
            code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
            diagnostics: emptyDiagnostics(),
          };
        }
        this.logUnexpected('compile-artifact', error);
        return {
          kind: 'meta-validation-failed',
          reason: error instanceof RecordJsonSchemaIdentityError ? 'identity' : 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          issues: emptyValidationIssues(),
        };
      }

      try {
        this.cacheFor(config.cacheMaxEntries).set(artifact);
      } catch (error) {
        this.logUnexpected('cache-populate', error);
      }

      let persistedDocumentValue: ContractJsonValue;
      try {
        persistedDocumentValue = normalizeRedboxCanonicalJsonV1(artifact.document);
      } catch (error) {
        this.logUnexpected('compile-normalization', error);
        return {
          kind: 'meta-validation-failed',
          reason: 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          issues: emptyValidationIssues(),
        };
      }
      if (!isContractJsonObject(persistedDocumentValue)) {
        return {
          kind: 'meta-validation-failed',
          reason: 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          issues: emptyValidationIssues(),
        };
      }

      const artifactInput: RecordSchemaArtifactInput = Object.freeze({
        digest: artifact.digest,
        document: persistedDocumentValue,
        contractFormat: config.contractFormat,
        completeness: compileResult.contract.completeness,
        byteLength: artifact.byteLength,
      });

      const compilationBase = {
        document: artifact.document,
        digest: artifact.digest,
        artifactInput,
        contractFormat: config.contractFormat,
        byteLength: artifact.byteLength,
        etag: artifact.etag,
      } as const;
      if (compileResult.contract.completeness === 'partial') {
        return Object.freeze({
          kind: 'partial',
          completeness: 'partial',
          ...compilationBase,
        });
      }
      return Object.freeze({
        kind: 'resolved',
        completeness: 'complete',
        ...compilationBase,
      });
    }

    private async compileAndPersist<Grant extends RecordSchemaGrantReferenceInput>(
      config: RecordSchemaConfig,
      context: RecordContractContext,
      createGrant: (artifact: Readonly<Pick<RecordSchemaArtifactInput, 'digest'>>) => Grant,
      recordAccessContext?: FormRecordAccessContext
    ): Promise<RecordSchemaPipelineResult<Grant>> {
      const compilation = await this.compileContext(config, context, recordAccessContext);
      if (compilation.kind !== 'resolved' && compilation.kind !== 'partial') {
        return compilation;
      }

      return this.persistCompilation(compilation, createGrant);
    }

    private async persistCompilation<Grant extends RecordSchemaGrantReferenceInput>(
      compilation: RecordSchemaCompiledContext,
      createGrant: (artifact: Readonly<Pick<RecordSchemaArtifactInput, 'digest'>>) => Grant
    ): Promise<RecordSchemaPipelineResult<Grant>> {
      let storageValue: unknown;
      try {
        storageValue = this.dependencies.getStorageProvider();
      } catch (error) {
        this.logUnexpected('persist-storage-provider', error);
        storageValue = undefined;
      }
      const storage = createStorageProvider(storageValue);
      if (!storage) {
        recordCounter(recordSchemaPersistence, {
          resource: 'artifact',
          outcome: 'failed',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        });
        return {
          kind: 'storage-failed',
          stage: 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        };
      }

      let artifactWrite: StorageServiceResponse | undefined;
      try {
        artifactWrite = await storage.putRecordSchemaArtifact(compilation.artifactInput);
      } catch (error) {
        this.logUnexpected('persist-artifact', error);
        recordCounter(recordSchemaPersistence, {
          resource: 'artifact',
          outcome: 'failed',
          code: RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED,
        });
        return {
          kind: 'storage-failed',
          stage: 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED,
        };
      }
      if (!storageResponseSucceeded(artifactWrite)) {
        const code =
          storageResponseCode(artifactWrite) === RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION
            ? RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION
            : RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED;
        recordCounter(recordSchemaPersistence, { resource: 'artifact', outcome: 'failed', code });
        return {
          kind: 'storage-failed',
          stage: 'artifact',
          code,
        };
      }
      recordCounter(recordSchemaPersistence, { resource: 'artifact', outcome: 'persisted', code: 'none' });

      const grant = createGrant(compilation.artifactInput);
      let grantWrite: StorageServiceResponse | undefined;
      try {
        grantWrite = await storage.putRecordSchemaReference(grant);
      } catch (error) {
        this.logUnexpected('persist-grant', error);
        recordCounter(recordSchemaPersistence, {
          resource: 'grant',
          outcome: 'failed',
          code: RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED,
        });
        return {
          kind: 'storage-failed',
          stage: 'grant',
          ...referenceWriteFailure(undefined, RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED),
          artifact: Object.freeze({ digest: compilation.digest, persisted: true }),
          grantReferenceKey: grant.referenceKey,
        };
      }
      if (!storageResponseSucceeded(grantWrite)) {
        const failure = referenceWriteFailure(grantWrite, RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED);
        recordCounter(recordSchemaPersistence, {
          resource: 'grant',
          outcome: 'failed',
          code: telemetryCode(failure.code),
        });
        return {
          kind: 'storage-failed',
          stage: 'grant',
          ...failure,
          artifact: Object.freeze({ digest: compilation.digest, persisted: true }),
          grantReferenceKey: grant.referenceKey,
        };
      }
      recordCounter(recordSchemaPersistence, { resource: 'grant', outcome: 'persisted', code: 'none' });

      const resolutionBase = {
        document: compilation.document,
        digest: compilation.digest,
        grant,
        contractFormat: compilation.contractFormat,
        byteLength: compilation.byteLength,
        etag: compilation.etag,
      } as const;
      if (compilation.kind === 'partial') {
        return Object.freeze({
          kind: 'partial',
          completeness: 'partial',
          ...resolutionBase,
        });
      }
      return Object.freeze({
        kind: 'resolved',
        completeness: 'complete',
        ...resolutionBase,
      });
    }

    private async configuredFormFindings(
      config: RecordSchemaConfig,
      registry: RecordContractContributorRegistry
    ): Promise<readonly RecordSchemaLifecycleFinding[]> {
      let rawCandidates: unknown;
      try {
        rawCandidates = this.dependencies.getConfiguredFormCandidates();
      } catch (error) {
        this.logUnexpected('startup-configured-forms', error);
        rawCandidates = undefined;
      }
      const candidates = boundedArraySnapshot(rawCandidates, RECORD_SCHEMA_CONFIGURED_FORM_MAX_CANDIDATES);
      if (candidates.kind !== 'values') {
        const code =
          candidates.kind === 'overflow'
            ? RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED
            : RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT;
        const findings = [configuredFormFinding('registry', 'candidate', code)];
        this.safeLog('info', 'record_schema_startup_check', 'startup-configured-forms', {
          status: 'failed',
          finding_count: findings.length,
        });
        return findings;
      }

      const compiler = new RecordContractCompiler(registry, config.limits);
      const findings: RecordSchemaLifecycleFinding[] = [];
      for (const [index, value] of candidates.values.entries()) {
        const parsed = parseConfiguredFormCandidate(value);
        const fallbackName = `candidate-${index}`;
        if (!parsed) {
          findings.push(configuredFormFinding(fallbackName, 'candidate', RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT));
          continue;
        }

        const startedAt = this.clock();
        let outcome = 'resolved';
        try {
          const compiled = await compiler.compile({
            form: parsed.form,
            reusableFormDefinitions: parsed.reusableFormDefinitions,
            context: {
              brand: 'startup',
              portal: 'startup',
              kind: 'create',
              recordType: 'configured-form',
              workflowStep: 'startup',
              form: parsed.name,
              operation: RECORD_SCHEMA_STRICT_ALL_OPERATION,
              unknownProperties: config.unknownProperties,
              enforcement: 'shadow',
            },
          });
          if (compiled.kind === 'failed') {
            outcome = compiled.failureKind === 'limit-exceeded' ? 'limit-exceeded' : 'compiler-failed';
            findings.push(configuredFormFinding(parsed.name, 'compiler', compiled.code));
            continue;
          }
          if (Object.keys(compiled.contract.root.properties).length === 0) {
            outcome = 'compiler-failed';
            findings.push(configuredFormFinding(parsed.name, 'compiler', RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT));
            continue;
          }

          let rendered: ReturnType<typeof renderRecordJsonSchema>;
          try {
            rendered = renderRecordJsonSchema(compiled.contract);
          } catch (error) {
            if (!(error instanceof RecordJsonSchemaRendererError)) {
              this.logUnexpected('compile-renderer', error);
            }
            outcome = 'compiler-failed';
            findings.push(configuredFormFinding(parsed.name, 'renderer', RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT));
            continue;
          }
          try {
            compileRecordJsonSchemaArtifact(rendered, {
              maxDocumentBytes: config.limits.maxDocumentBytes,
              maxValidationErrors: config.limits.maxDiagnostics,
            });
          } catch (error) {
            outcome = error instanceof RecordJsonSchemaDocumentLimitError ? 'limit-exceeded' : 'meta-validation-failed';
            findings.push(
              configuredFormFinding(
                parsed.name,
                'artifact',
                error instanceof RecordJsonSchemaDocumentLimitError
                  ? error.code
                  : RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT
              )
            );
          }
        } catch (error) {
          this.logUnexpected('startup-configured-forms', error);
          outcome = 'unexpected-failure';
          findings.push(configuredFormFinding(parsed.name, 'compiler', RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT));
        } finally {
          const attributes = {
            schema_kind: 'unknown',
            phase: 'startup',
            outcome: telemetryDimension(outcome, RECORD_SCHEMA_COMPILE_OUTCOMES, 'unexpected-failure'),
          } as const;
          recordDuration(this.clock() - startedAt, attributes);
          recordCounter(recordSchemaCompileOutcomes, attributes);
        }
      }

      if (findings.length > 0) {
        this.safeLog('info', 'record_schema_startup_check', 'startup-configured-forms', {
          status: 'failed',
          finding_count: Math.min(findings.length, RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX),
          ...(findings.length > RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX
            ? { finding_count_bucket: 'overflow' as const }
            : {}),
        });
        return findings;
      }
      this.safeLog('info', 'record_schema_startup_check', 'startup-configured-forms', {
        status: 'passed',
        finding_count: 0,
      });
      return findings;
    }

    /** Run the complete enabled lifecycle gate after storage is ready and before application readiness. */
    public async bootstrap(): Promise<void> {
      const inspection = this.inspectLifecycle();
      if (inspection.disabled) {
        this.safeLog('info', 'record_schema_startup_check', 'lifecycle', {
          status: 'disabled',
          finding_count: 0,
        });
        return;
      }

      const findings = [...inspection.findings];
      if (inspection.config && inspection.registry) {
        findings.push(...(await this.configuredFormFindings(inspection.config, inspection.registry)));
      }
      if (findings.length > 0) {
        this.logLifecycleFailure(findings);
        throw new RecordSchemaLifecycleError(findings);
      }

      this.safeLog('info', 'record_schema_startup_check', 'lifecycle', {
        status: 'passed',
        finding_count: 0,
      });
      await this.bootstrapIntegrationPins();
    }

    private resolveRuntimeConfig(): RecordSchemaConfig | undefined {
      try {
        const snapshot = snapshotRecordSchemaConfig(this.dependencies.getConfig());
        if (snapshot.kind !== 'snapshot') return undefined;
        const validation = validateRecordSchemaConfig(snapshot.value);
        return validation.valid ? validation.config : undefined;
      } catch (error) {
        this.logUnexpected('runtime-configuration', error);
        return undefined;
      }
    }

    private contextFailure(
      failureKind: RecordContractContextFailureKind,
      diagnosticCodes: readonly string[] = [],
      reason?: 'empty-effective-form'
    ): RecordSchemaCreateContextFailure {
      return Object.freeze({
        kind: 'context-failed',
        failureKind,
        diagnosticCodes: Object.freeze([...diagnosticCodes]),
        ...(reason ? { reason } : {}),
      });
    }

    private inspectLifecycle(): RecordSchemaLifecycleInspection {
      let config: unknown;
      let configReadFailed = false;
      try {
        config = this.dependencies.getConfig();
        if (isDisabled(config)) {
          return { disabled: true, findings: [] };
        }
      } catch (error) {
        this.logUnexpected('startup-configuration', error);
        configReadFailed = true;
      }

      const snapshot = configReadFailed ? undefined : snapshotRecordSchemaConfig(config);
      const findings: RecordSchemaLifecycleFinding[] =
        !snapshot || snapshot.kind === 'unreadable'
          ? [unreadableConfigurationFinding()]
          : snapshot.kind === 'pin-limit'
            ? [pinFinding('recordSchema.integrationPins', 'maximum-items')]
            : configuredFindings(snapshot.value);
      let validatedConfig: RecordSchemaConfig | undefined;
      if (snapshot?.kind === 'snapshot') {
        try {
          const validation = validateRecordSchemaConfig(snapshot.value);
          if (validation.valid) validatedConfig = validation.config;
        } catch (error) {
          this.logUnexpected('startup-configuration', error);
        }
      }

      let storageProvider: unknown;
      try {
        storageProvider = this.dependencies.getStorageProvider();
      } catch (error) {
        this.logUnexpected('startup-storage', error);
        storageProvider = undefined;
      }
      findings.push(...storageFindings(storageProvider));

      let contributorStateUnavailable = false;
      let registrationIssues: readonly RecordContractRegistrationIssue[] = [];
      try {
        registrationIssues = this.dependencies.getContributorRegistrationIssues();
      } catch (error) {
        this.logUnexpected('startup-contributors', error);
        contributorStateUnavailable = true;
      }
      findings.push(...contributorFindings(registrationIssues));

      let registry: RecordContractContributorRegistry | undefined;
      try {
        registry = this.dependencies.getContributorRegistry();
      } catch (error) {
        this.logUnexpected('startup-registry', error);
        registry = undefined;
        contributorStateUnavailable = true;
      }
      if (!registry && registrationIssues.length === 0) {
        contributorStateUnavailable = true;
      }

      let componentTypes: readonly string[] = [];
      try {
        componentTypes = this.dependencies.getContributorComponentTypes();
      } catch (error) {
        this.logUnexpected('startup-coverage', error);
        contributorStateUnavailable = true;
      }
      if (contributorStateUnavailable) {
        findings.push(...contributorFindings([unavailableContributorStateIssue()]));
      }
      findings.push(...coverageFindings(componentTypes));

      return {
        disabled: false,
        ...(validatedConfig ? { config: validatedConfig } : {}),
        ...(registry ? { registry } : {}),
        findings,
      };
    }

    private logLifecycleFailure(findings: readonly RecordSchemaLifecycleFinding[]): void {
      this.safeLog('info', 'record_schema_startup_check', 'lifecycle', {
        status: 'failed',
        finding_count: Math.min(findings.length, RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX),
        ...(findings.length > RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX
          ? { finding_count_bucket: 'overflow' as const }
          : {}),
      });
    }

    public override init(): void {
      const inspection = this.inspectLifecycle();
      if (inspection.disabled) {
        this.safeLog('info', 'record_schema_startup_check', 'lifecycle', {
          status: 'disabled',
          finding_count: 0,
        });
        return;
      }
      if (inspection.findings.length > 0) {
        this.logLifecycleFailure(inspection.findings);
        throw new RecordSchemaLifecycleError(inspection.findings);
      }
      this.safeLog('info', 'record_schema_startup_check', 'lifecycle', {
        status: 'passed',
        finding_count: 0,
      });
    }
  }
}
