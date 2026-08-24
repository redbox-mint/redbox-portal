import { createHash } from 'node:crypto';

import { Services as services } from '../CoreService';
import {
  recordSchema as defaultRecordSchemaConfig,
  type RecordSchemaConfig,
  type RecordSchemaConfigurationProblemReason,
  validateRecordSchemaConfig,
} from '../config/recordSchema.config';
import type {
  RecordSchemaArtifactInput,
  RecordSchemaCreateGrantReferenceInput,
  RecordSchemaGrantReferenceInput,
  RecordSchemaUpdateGrantReferenceInput,
} from '../model/storage/record-schema';
import {
  compileRecordJsonSchemaArtifact,
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  getDiscoveredRecordContractContributorComponentTypes,
  getDiscoveredRecordContractContributorRegistrationIssues,
  getDiscoveredRecordContractContributorRegistry,
  normalizeRedboxCanonicalJsonV1,
  RecordContractCompiler,
  RecordContractContextResolutionError,
  RecordJsonSchemaCompilationError,
  RecordJsonSchemaDocumentLimitError,
  RecordJsonSchemaIdentityError,
  RecordJsonSchemaRendererError,
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
  type RecordContractFormat,
  type RecordContractRegistrationCode,
  type RecordContractRegistrationIssue,
  type RecordContractUpdateContext,
  type RecordContractUpdateContextRequest,
  type RecordJsonSchemaEtag,
  type RecordJsonSchemaValidationIssue,
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
import type { FormRecordAccessContext } from './FormsService';

declare const RedboxJavaStorageService: unknown;

export const RECORD_SCHEMA_LIFECYCLE_ERROR_CODE = 'record-schema.lifecycle-failed' as const;

export type RecordSchemaPinProblemReason =
  | RecordSchemaConfigurationProblemReason
  | 'normalized-non-empty'
  | 'maximum-length'
  | 'digest'
  | 'schema-kind'
  | 'datetime';

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
  readonly resolveContractContext: (
    request: RecordContractCreateContextRequest | RecordContractUpdateContextRequest
  ) => Promise<RecordContractContext>;
  readonly buildContractFormConfig: (
    context: RecordContractContext,
    recordAccessContext?: FormRecordAccessContext
  ) => Promise<RecordContractFormBuildResult>;
  readonly authorizeUpdate: (context: RecordContractUpdateContext, caller: FormRecordAccessContext) => Promise<boolean>;
}

const CATEGORY_ORDER: Readonly<Record<RecordSchemaLifecycleFinding['category'], number>> = {
  configuration: 0,
  storage: 1,
  contributor: 2,
  coverage: 3,
  pin: 4,
};

const DUPLICATE_REGISTRATION_CODES: ReadonlySet<RecordContractRegistrationCode> = new Set([
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_KEY,
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
  RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_NAMESPACE,
]);

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_DIAGNOSTIC_IDENTIFIER = /^[A-Za-z0-9@._:/-]{1,200}$/;

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

function configuredRecordSchema(): unknown {
  return sails.config.recordSchema === undefined ? defaultRecordSchemaConfig : sails.config.recordSchema;
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

function hasRecordEditAuthorizationCapability(value: unknown): value is RecordEditAuthorizationCapability {
  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) return false;
  try {
    return typeof Reflect.get(value, 'hasEditAccess') === 'function';
  } catch {
    return false;
  }
}

function recordEditAuthorizationService(): RecordEditAuthorizationCapability | undefined {
  const configured = sails.services?.recordsservice;
  const candidate = configured === undefined && typeof RecordsService !== 'undefined' ? RecordsService : configured;
  return hasRecordEditAuthorizationCapability(candidate) ? candidate : undefined;
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
  resolveContractContext: request => RecordValidationService.resolveContractContext(request),
  buildContractFormConfig: (context, recordAccessContext) =>
    FormsService.buildContractFormConfig(context, recordAccessContext),
  authorizeUpdate: authorizeUpdateWithRecordsService,
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

  const findings: RecordSchemaLifecycleFinding[] = [];
  value.integrationPins.forEach((candidate, index) => {
    if (!isObjectRecord(candidate)) {
      return;
    }
    for (const property of ['digest', 'brand', 'portal', 'recordType', 'operation', 'owner'] as const) {
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
    if (candidate.expiresAt !== undefined) {
      const expiresAt = candidate.expiresAt;
      if (
        typeof expiresAt !== 'string' ||
        expiresAt.length === 0 ||
        expiresAt !== expiresAt.trim() ||
        Number.isNaN(Date.parse(expiresAt))
      ) {
        findings.push(pinFinding(`recordSchema.integrationPins.${index}.expiresAt`, 'datetime'));
      }
    }
  });
  return findings;
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
  return isObjectRecord(value) && value.enabled === false;
}

export interface ResolveCreateRecordSchemaRequest {
  readonly brand: string;
  readonly portal: string;
  readonly recordType: string;
  readonly operation?: string;
  readonly targetStep?: string;
  readonly actor: RecordContractContextActor;
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

export interface RecordSchemaCreateStorageFailure {
  readonly kind: 'storage-failed';
  readonly stage: 'artifact' | 'grant';
  readonly code:
    | typeof RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE
    | typeof RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED
    | typeof RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED
    | typeof RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION;
}

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
  readonly brand: string;
  readonly portal: string;
  readonly oid: string;
  readonly operation?: string;
  /** Trusted current caller and brand used by the existing record-access and form-access paths. */
  readonly caller: FormRecordAccessContext;
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
  | RecordSchemaUpdateUnavailableFailure;

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
  RecordSchemaPipelineSuccess<Grant> | RecordSchemaResolutionFailure;

type RecordSchemaCreateStorageProvider = Required<
  Pick<StorageService, 'putRecordSchemaArtifact' | 'putRecordSchemaReference'>
>;

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

function isContractJsonObject(value: ContractJsonValue): value is ContractJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCreateContractContext(context: RecordContractContext): context is RecordContractCreateContext {
  return context.publicContext.kind === 'create';
}

function isUpdateContractContext(context: RecordContractContext): context is RecordContractUpdateContext {
  return context.publicContext.kind === 'update';
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
  /** Performs record-schema lifecycle checks and caller-effective create/update resolution. */
  export class RecordSchema extends services.Core.Service {
    protected override _exportedMethods = ['init', 'resolveCreate', 'resolveUpdate'];
    protected override logHeader = 'RecordSchemaService::';
    private readonly dependencies: RecordSchemaServiceDependencies;

    public constructor(overrides: Partial<RecordSchemaServiceDependencies> = {}) {
      super();
      this.dependencies = { ...DEFAULT_DEPENDENCIES, ...overrides };
    }

    /** Resolve, compile, persist, and grant one caller-effective create schema. */
    public async resolveCreate(request: ResolveCreateRecordSchemaRequest): Promise<ResolveCreateRecordSchemaResult> {
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

      let context: RecordContractCreateContext;
      try {
        const resolvedContext = await this.dependencies.resolveContractContext({
          kind: 'create',
          brand: request.brand,
          portal: request.portal,
          recordType: request.recordType,
          operation: request.operation,
          targetStep: request.targetStep,
          actor: request.actor,
        });
        if (!isCreateContractContext(resolvedContext)) {
          return this.contextFailure('not-resolvable');
        }
        context = resolvedContext;
      } catch (error) {
        if (error instanceof RecordContractContextResolutionError) {
          return this.contextFailure(error.failureKind, error.diagnosticCodes);
        }
        return this.contextFailure('unavailable');
      }

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

      let context: RecordContractUpdateContext;
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
        context = resolvedContext;
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
        return this.contextFailure('unavailable');
      }

      let authorized: boolean;
      try {
        authorized = await this.dependencies.authorizeUpdate(context, request.caller);
      } catch {
        return this.contextFailure('unavailable');
      }
      if (!authorized) {
        return {
          kind: 'denied',
          code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
        };
      }

      const pipeline = await this.compileAndPersist(
        config,
        context,
        artifact => createUpdateGrantReference(artifact, context),
        request.caller
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

    private async compileAndPersist<Grant extends RecordSchemaGrantReferenceInput>(
      config: RecordSchemaConfig,
      context: RecordContractContext,
      createGrant: (artifact: Readonly<Pick<RecordSchemaArtifactInput, 'digest'>>) => Grant,
      recordAccessContext?: FormRecordAccessContext
    ): Promise<RecordSchemaPipelineResult<Grant>> {
      let formBuild: RecordContractFormBuildResult;
      try {
        formBuild = await this.dependencies.buildContractFormConfig(context, recordAccessContext);
      } catch {
        return this.contextFailure('not-resolvable');
      }
      if (!formBuild.ok) {
        return this.contextFailure('not-resolvable', [], formBuild.reason);
      }

      let registry: RecordContractContributorRegistry | undefined;
      try {
        registry = this.dependencies.getContributorRegistry();
      } catch {
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
        return {
          kind: 'meta-validation-failed',
          reason: error instanceof RecordJsonSchemaIdentityError ? 'identity' : 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
          issues: emptyValidationIssues(),
        };
      }

      let persistedDocumentValue: ContractJsonValue;
      try {
        persistedDocumentValue = normalizeRedboxCanonicalJsonV1(artifact.document);
      } catch {
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

      let storageValue: unknown;
      try {
        storageValue = this.dependencies.getStorageProvider();
      } catch {
        storageValue = undefined;
      }
      const storage = createStorageProvider(storageValue);
      if (!storage) {
        return {
          kind: 'storage-failed',
          stage: 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        };
      }

      const artifactInput: RecordSchemaArtifactInput = Object.freeze({
        digest: artifact.digest,
        document: persistedDocumentValue,
        contractFormat: config.contractFormat,
        completeness: compileResult.contract.completeness,
        byteLength: artifact.byteLength,
      });
      let artifactWrite: StorageServiceResponse | undefined;
      try {
        artifactWrite = await storage.putRecordSchemaArtifact(artifactInput);
      } catch {
        return {
          kind: 'storage-failed',
          stage: 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED,
        };
      }
      if (!storageResponseSucceeded(artifactWrite)) {
        return {
          kind: 'storage-failed',
          stage: 'artifact',
          code:
            storageResponseCode(artifactWrite) === RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION
              ? RECORD_SCHEMA_PROBLEM_CODES.DIGEST_COLLISION
              : RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED,
        };
      }

      const grant = createGrant(artifactInput);
      let grantWrite: StorageServiceResponse | undefined;
      try {
        grantWrite = await storage.putRecordSchemaReference(grant);
      } catch {
        return {
          kind: 'storage-failed',
          stage: 'grant',
          code: RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED,
        };
      }
      if (!storageResponseSucceeded(grantWrite)) {
        return {
          kind: 'storage-failed',
          stage: 'grant',
          code: RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED,
        };
      }

      const resolutionBase = {
        document: artifact.document,
        digest: artifact.digest,
        grant,
        contractFormat: config.contractFormat,
        byteLength: artifact.byteLength,
        etag: artifact.etag,
      } as const;
      if (compileResult.contract.completeness === 'partial') {
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

    private resolveRuntimeConfig(): RecordSchemaConfig | undefined {
      try {
        const validation = validateRecordSchemaConfig(this.dependencies.getConfig());
        return validation.valid ? validation.config : undefined;
      } catch {
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

    public override init(): void {
      let config: unknown;
      let configReadFailed = false;
      try {
        config = this.dependencies.getConfig();
        if (isDisabled(config)) {
          return;
        }
      } catch {
        configReadFailed = true;
      }

      const findings: RecordSchemaLifecycleFinding[] = configReadFailed
        ? [unreadableConfigurationFinding()]
        : configuredFindings(config);

      let storageProvider: unknown;
      try {
        storageProvider = this.dependencies.getStorageProvider();
      } catch {
        storageProvider = undefined;
      }
      findings.push(...storageFindings(storageProvider));

      let contributorStateUnavailable = false;
      let registrationIssues: readonly RecordContractRegistrationIssue[] = [];
      try {
        registrationIssues = this.dependencies.getContributorRegistrationIssues();
      } catch {
        contributorStateUnavailable = true;
      }
      findings.push(...contributorFindings(registrationIssues));

      let registry: RecordContractContributorRegistry | undefined;
      try {
        registry = this.dependencies.getContributorRegistry();
      } catch {
        registry = undefined;
        contributorStateUnavailable = true;
      }
      if (!registry && registrationIssues.length === 0) {
        contributorStateUnavailable = true;
      }

      let componentTypes: readonly string[] = [];
      try {
        componentTypes = this.dependencies.getContributorComponentTypes();
      } catch {
        contributorStateUnavailable = true;
      }
      if (contributorStateUnavailable) {
        findings.push(...contributorFindings([unavailableContributorStateIssue()]));
      }
      findings.push(...coverageFindings(componentTypes));

      if (findings.length > 0) {
        throw new RecordSchemaLifecycleError(findings);
      }
      this.logger.verbose(`${this.logHeader} lifecycle checks passed.`);
    }
  }
}
