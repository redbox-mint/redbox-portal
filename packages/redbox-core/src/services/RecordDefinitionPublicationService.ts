import { activeRecordDefinitions } from './RecordDefinitionRuntimeService';
import { randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isProxy } from 'node:util/types';
import {
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_LABEL_MAX_LENGTH,
  RECORD_DEFINITION_NOTE_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_PATTERN,
  RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionCanonicalHash,
  parseRecordDefinitionKey,
  type DraftRecordDefinitionAggregateDto,
  type FormValidationGroups,
  type PublishableRecordDefinitionAggregateDto,
  type RecordDefinitionActorDto,
  type RecordDefinitionBrandId,
  type RecordDefinitionCanonicalHash,
  type RecordDefinitionConflictDto,
  type RecordDefinitionDraftDto,
  type RecordDefinitionHistorySummaryDto,
  type RecordDefinitionImpactReportDto,
  type RecordDefinitionKey,
  type RecordDefinitionPublicationRequestDto,
  type RecordDefinitionRetirementRequestDto,
  type RecordDefinitionRevisionDto,
  type RecordDefinitionRevisionId,
  type RecordDefinitionRevisionSourceDto,
  type RecordDefinitionRollbackRequestDto,
  type RecordDefinitionStructuralChangeDto,
  type RecordDefinitionValidationReportDto,
  type RecordTypeIdentityDto,
  type ValidationOperationDefinition,
  type WorkflowStageKey,
} from '@researchdatabox/sails-ng-common';
import { boundedValidationPreflight } from '../boundedValidation';
import { Services as services } from '../CoreService';
import type { RedboxActionRegistry } from '../action-registry';
import type { StorageCapabilityProvider } from '../RecordStorageConcurrency';
import {
  PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  RECORD_DEFINITION_CONTRACT_LIMITS,
  RECORD_DEFINITION_REVISION_NUMBER_MAX,
  RECORD_DEFINITION_VALIDATION_LIMITS,
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  hashRecordDefinition,
  recordDefinitionConflictSchema,
  recordDefinitionDraftSchema,
  recordDefinitionHistorySummarySchema,
  recordDefinitionImpactReportSchema,
  recordDefinitionPublicationRequestSchema,
  recordDefinitionRetirementRequestSchema,
  recordDefinitionRevisionSchema,
  recordDefinitionRollbackRequestSchema,
  recordDefinitionValidationReportSchema,
  recordTypeIdentitySchema,
  validateRecordDefinitionForPublication,
  type RecordDefinitionFormCapability,
  type RecordDefinitionStageReferenceCount,
} from '../record-workflow-administration';
import type { RuntimeValue } from '../runtimeValues';
import { isRuntimeArray, isRuntimeRecord } from '../runtimeValues';
import type { FormAttributes } from '../waterline-models/Form';
import type { RecordDefinitionDraftAttributes } from '../waterline-models/RecordDefinitionDraft';
import type { RecordDefinitionHistoryAttributes } from '../waterline-models/RecordDefinitionHistory';
import type { RecordDefinitionLifecycleOperationAckAttributes } from '../waterline-models/RecordDefinitionLifecycleOperationAck';
import type { RecordDefinitionRevisionAttributes } from '../waterline-models/RecordDefinitionRevision';
import type { RoleAttributes } from '../waterline-models/Role';
import type {
  RecordDefinitionLifecycleOperation,
  RecordDefinitionRetirementLifecycleOperation,
  RecordDefinitionRevisionLifecycleOperation,
  RecordTypeCreationFence,
  RecordTypeAttributes,
} from '../waterline-models/RecordType';
import { coreRecordActionRegistry } from './record-actions/coordinator';

const OPERATION_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const HISTORY_ID_PATTERN = /^rdh_[a-f0-9]{32}$/u;
const ACK_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
const OPERATION_CLEAR_RECONCILIATION_ATTEMPTS = 8;
const HISTORY_LIST_DEFAULT = 50;
export const RECORD_DEFINITION_HISTORY_LIST_MAX = 100;
const REVISION_HISTORY_OPERATIONS = ['publish', 'rollback', 'migration', 'bootstrap'] as const;

type RevisionHistoryOperation = (typeof REVISION_HISTORY_OPERATIONS)[number];

export type RecordDefinitionPublicationLifecycleErrorCode =
  | 'active-revision-not-found'
  | 'draft-not-found'
  | 'invalid-actor'
  | 'invalid-history-request'
  | 'invalid-identity'
  | 'invalid-publication-request'
  | 'invalid-retirement-request'
  | 'invalid-rollback-request'
  | 'publication-validation-failed'
  | 'record-type-already-active'
  | 'record-type-already-retired'
  | 'record-type-not-found'
  | 'record-type-retired'
  | 'revision-limit-reached'
  | 'revision-not-found'
  | 'storage-consistency-error';

const issuedLifecycleErrors = new WeakSet<object>();

/** Safe B05 failure; submitted definitions, persistence details, and secret values are never echoed. */
export class RecordDefinitionPublicationLifecycleError extends Error {
  public readonly code: RecordDefinitionPublicationLifecycleErrorCode;
  public readonly validation: RecordDefinitionValidationReportDto | null;
  public readonly impact: RecordDefinitionImpactReportDto | null;

  constructor(
    code: RecordDefinitionPublicationLifecycleErrorCode,
    message: string,
    validation: RecordDefinitionValidationReportDto | null = null,
    impact: RecordDefinitionImpactReportDto | null = null
  ) {
    super(message);
    this.name = 'RecordDefinitionPublicationLifecycleError';
    this.code = code;
    this.validation = validation;
    this.impact = impact;
  }
}

export interface RecordDefinitionPublicationApplied {
  readonly ok: true;
  readonly identity: RecordTypeIdentityDto;
  readonly revision: RecordDefinitionRevisionDto;
  readonly history: RecordDefinitionHistorySummaryDto;
  readonly validation: RecordDefinitionValidationReportDto;
  readonly impact: RecordDefinitionImpactReportDto;
}

export interface RecordDefinitionPublicationConflict {
  readonly ok: false;
  readonly current: RecordTypeIdentityDto;
  readonly conflict: RecordDefinitionConflictDto;
}

export type RecordDefinitionPublicationResult =
  | RecordDefinitionPublicationApplied
  | RecordDefinitionPublicationConflict;

export interface RecordDefinitionRevisionHistoryEntry {
  readonly revision: RecordDefinitionRevisionDto;
  readonly history: RecordDefinitionHistorySummaryDto;
}

export interface RecordDefinitionRetirementApplied {
  readonly ok: true;
  readonly identity: RecordTypeIdentityDto;
  readonly historyId: string;
}

export interface RecordDefinitionRetirementConflict {
  readonly ok: false;
  readonly current: RecordTypeIdentityDto;
  readonly conflict: RecordDefinitionConflictDto;
}

export type RecordDefinitionRetirementResult = RecordDefinitionRetirementApplied | RecordDefinitionRetirementConflict;

export interface RecordDefinitionPublicationAuthoritySnapshot {
  readonly actionRegistry: RedboxActionRegistry;
  readonly roles: readonly string[];
  readonly forms: readonly RecordDefinitionFormCapability[];
  readonly availableRecordTypeKeys: readonly RecordDefinitionKey[];
  readonly storageCapabilityProvider: StorageCapabilityProvider | null;
  readonly stageReferences: readonly RecordDefinitionStageReferenceCount[];
}

export interface RecordDefinitionPublicationAuthorityRequest {
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly definition: DraftRecordDefinitionAggregateDto;
  readonly activeDefinition: PublishableRecordDefinitionAggregateDto | null;
}

/** Code-owned authority seam. It is never populated from an administration request. */
export interface RecordDefinitionPublicationAuthority {
  load(request: RecordDefinitionPublicationAuthorityRequest): Promise<RecordDefinitionPublicationAuthoritySnapshot>;
}

export interface RecordDefinitionValidationPreview {
  readonly ok: true;
  readonly validation: RecordDefinitionValidationReportDto;
  readonly impact: RecordDefinitionImpactReportDto;
}

export interface RecordDefinitionPublicationServiceExports {
  validateDraft(
    brandId: string,
    key: string,
    request: RecordDefinitionPublicationRequestDto
  ): Promise<RecordDefinitionValidationPreview | RecordDefinitionPublicationConflict>;
  publish(
    brandId: string,
    recordTypeKey: string,
    request: RecordDefinitionPublicationRequestDto,
    actor: RecordDefinitionActorDto
  ): Promise<RecordDefinitionPublicationResult>;
  listHistory(
    brandId: string,
    recordTypeKey: string,
    limit?: number
  ): Promise<readonly RecordDefinitionHistorySummaryDto[]>;
  getRevision(
    brandId: string,
    recordTypeKey: string,
    revisionNumber: number
  ): Promise<RecordDefinitionRevisionHistoryEntry | null>;
  rollback(
    brandId: string,
    recordTypeKey: string,
    request: RecordDefinitionRollbackRequestDto,
    actor: RecordDefinitionActorDto
  ): Promise<RecordDefinitionPublicationResult>;
  retire(
    brandId: string,
    recordTypeKey: string,
    request: RecordDefinitionRetirementRequestDto,
    actor: RecordDefinitionActorDto
  ): Promise<RecordDefinitionRetirementResult>;
  unretire(
    brandId: string,
    recordTypeKey: string,
    request: RecordDefinitionRetirementRequestDto,
    actor: RecordDefinitionActorDto
  ): Promise<RecordDefinitionRetirementResult>;
}

interface ExecutableQuery<Value> extends PromiseLike<Value> {
  usingConnection(connection: Sails.Connection): ExecutableQuery<Value>;
}

const PUBLICATION_READ_META = Object.freeze({ skipRecordVerification: true });

interface BoundedFindQuery<Value> extends ExecutableQuery<Value> {
  meta(options: { skipRecordVerification: true }): BoundedFindQuery<Value>;
  limit(maximum: number): BoundedFindQuery<Value>;
  sort(criteria: string): BoundedFindQuery<Value>;
}

interface PublicationMongoCollection {
  createIndex(
    attributes: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ expireAfterSeconds?: number; name: string; unique?: boolean }>
  ): Promise<string>;
  findOne(filter: Readonly<Record<string, RuntimeValue>>): Promise<PublicationMongoIdentityRow | null>;
  updateOne(
    filter: Readonly<Record<string, RuntimeValue>>,
    update: Readonly<{ $set: Readonly<Record<string, RuntimeValue>> }>
  ): Promise<RuntimeValue>;
}

interface PublicationMongoManager {
  collection(name: string): PublicationMongoCollection;
}

interface PublicationMongoIdentityRow {
  readonly definitionId?: RuntimeValue;
  readonly definitionLifecycleOperation?: RuntimeValue;
  readonly definitionLifecycleToken?: RuntimeValue;
  readonly draftLifecycleKind?: RuntimeValue;
  readonly draftLifecycleOperation?: RuntimeValue;
  readonly draftLifecycleToken?: RuntimeValue;
  readonly name?: RuntimeValue;
  readonly version?: RuntimeValue;
}

interface PublicationCoordinates {
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly identity: RecordTypeAttributes;
  readonly draft: RecordDefinitionDraftDto | null;
  readonly active: RecordDefinitionRevisionDto | null;
}

interface ValidPublicationArtifacts {
  readonly definition: PublishableRecordDefinitionAggregateDto;
  readonly canonicalHash: RecordDefinitionCanonicalHash;
  readonly actionContracts: RecordDefinitionRevisionDto['actionContracts'];
  readonly validation: RecordDefinitionValidationReportDto;
  readonly impact: RecordDefinitionImpactReportDto;
}

interface RevisionOperationArtifacts extends ValidPublicationArtifacts {
  readonly revision: RecordDefinitionRevisionDto;
  readonly historyRow: RecordDefinitionHistoryAttributes;
  readonly history: RecordDefinitionHistorySummaryDto;
}

interface RevisionHistoryMetadata {
  readonly row: RecordDefinitionHistoryAttributes;
  readonly summary: RecordDefinitionHistorySummaryDto;
}

function lifecycleError(
  code: RecordDefinitionPublicationLifecycleErrorCode,
  message: string,
  validation: RecordDefinitionValidationReportDto | null = null,
  impact: RecordDefinitionImpactReportDto | null = null
): never {
  const error = new RecordDefinitionPublicationLifecycleError(code, message, validation, impact);
  issuedLifecycleErrors.add(error);
  throw error;
}

function normalizePublicLifecycleError(error: RuntimeValue): never {
  if (typeof error === 'object' && error !== null && issuedLifecycleErrors.has(error)) throw error;
  return lifecycleError('storage-consistency-error', 'The record-definition publication storage state is unavailable.');
}

function parseBrandAndKey(
  brandId: string,
  recordTypeKey: string
): { readonly brandId: RecordDefinitionBrandId; readonly recordTypeKey: RecordDefinitionKey } {
  if (typeof brandId !== 'string' || typeof recordTypeKey !== 'string') {
    return lifecycleError('invalid-identity', 'The record-definition identity is invalid.');
  }
  try {
    return {
      brandId: parseRecordDefinitionBrandId(brandId),
      recordTypeKey: parseRecordDefinitionKey(recordTypeKey),
    };
  } catch {
    return lifecycleError('invalid-identity', 'The record-definition identity is invalid.');
  }
}

function hasSafeDisplayText(value: string, maximum: number): boolean {
  if (value.length === 0 || value.length > maximum || value.trim().length === 0) return false;
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint !== undefined && (codePoint <= 31 || codePoint === 127)) return false;
  }
  return true;
}

function parseActor(actor: RecordDefinitionActorDto): RecordDefinitionActorDto {
  const preflight = boundedValidationPreflight(actor, {
    maxBytes: 2_048,
    maxDepth: 2,
    maxStringLength: RECORD_DEFINITION_LABEL_MAX_LENGTH,
    maxPropertyNameLength: 32,
    maxWork: 16,
    arrayCardinalityLimit: () => 0,
    objectCardinalityLimit: () => 2,
  });
  if (!preflight.ok || actor === null || typeof actor !== 'object' || Array.isArray(actor)) {
    return lifecycleError('invalid-actor', 'The publication actor is invalid.');
  }
  const keys = Object.keys(actor);
  if (Reflect.ownKeys(actor).length !== keys.length || keys.some(key => key !== 'id' && key !== 'displayName')) {
    return lifecycleError('invalid-actor', 'The publication actor is invalid.');
  }
  const idDescriptor = Object.getOwnPropertyDescriptor(actor, 'id');
  const displayNameDescriptor = Object.getOwnPropertyDescriptor(actor, 'displayName');
  const id = idDescriptor?.value as RuntimeValue;
  const displayName = displayNameDescriptor?.value as RuntimeValue;
  if (
    idDescriptor?.enumerable !== true ||
    typeof id !== 'string' ||
    id.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
    !RECORD_DEFINITION_REFERENCE_PATTERN.test(id)
  ) {
    return lifecycleError('invalid-actor', 'The publication actor is invalid.');
  }
  if (
    displayNameDescriptor !== undefined &&
    (displayNameDescriptor.enumerable !== true ||
      typeof displayName !== 'string' ||
      !hasSafeDisplayText(displayName, RECORD_DEFINITION_LABEL_MAX_LENGTH))
  ) {
    return lifecycleError('invalid-actor', 'The publication actor is invalid.');
  }
  return Object.freeze({ id, ...(typeof displayName === 'string' ? { displayName: displayName.trim() } : {}) });
}

function storedDataProperty<Row extends object, Key extends keyof Row>(row: Row, key: Key): Row[Key] {
  try {
    if (isProxy(row)) return lifecycleError('storage-consistency-error', 'Stored record-definition data is invalid.');
    const descriptor = Object.getOwnPropertyDescriptor(row, key);
    if (descriptor === undefined) return undefined as Row[Key];
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return lifecycleError('storage-consistency-error', 'Stored record-definition data is invalid.');
    }
    return descriptor.value as Row[Key];
  } catch {
    return lifecycleError('storage-consistency-error', 'Stored record-definition data is invalid.');
  }
}

function runtimeDataProperty(value: RuntimeValue, key: string): RuntimeValue {
  if (!isRuntimeRecord(value) || isProxy(value)) {
    return lifecycleError('storage-consistency-error', 'Stored validation authority data is invalid.');
  }
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined) return undefined;
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return lifecycleError('storage-consistency-error', 'Stored validation authority data is invalid.');
    }
    return descriptor.value;
  } catch {
    return lifecycleError('storage-consistency-error', 'Stored validation authority data is invalid.');
  }
}

function timestamp(value: RuntimeValue): string {
  const parsed =
    value instanceof Date
      ? value
      : typeof value === 'string' || typeof value === 'number'
        ? new Date(value)
        : new Date(Number.NaN);
  if (!Number.isFinite(parsed.getTime())) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition metadata is invalid.');
  }
  return parsed.toISOString();
}

function relationId(value: RuntimeValue): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (typeof value !== 'object' || isProxy(value)) return null;
  try {
    const descriptor = Object.getOwnPropertyDescriptor(value, 'id');
    const id = descriptor?.value as RuntimeValue;
    return descriptor !== undefined &&
      descriptor.get === undefined &&
      descriptor.set === undefined &&
      (typeof id === 'string' || typeof id === 'number')
      ? String(id)
      : null;
  } catch {
    return null;
  }
}

function storedRelationId<Row extends object, Key extends keyof Row>(row: Row, key: Key): string | null {
  return relationId(storedDataProperty(row, key) as RuntimeValue);
}

function nonNegativeVersion(value: RuntimeValue): number {
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > RECORD_DEFINITION_REVISION_NUMBER_MAX
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition version metadata is invalid.');
  }
  return value;
}

function positiveRevision(value: RuntimeValue, allowNull: true): number | null;
function positiveRevision(value: RuntimeValue, allowNull?: false): number;
function positiveRevision(value: RuntimeValue, allowNull = false): number | null {
  if (value === null && allowNull) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > RECORD_DEFINITION_REVISION_NUMBER_MAX
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition revision metadata is invalid.');
  }
  return value;
}

function isRevisionOperation(
  operation: RecordDefinitionLifecycleOperation
): operation is RecordDefinitionRevisionLifecycleOperation {
  return operation.kind === 'publish' || operation.kind === 'rollback';
}

function isRevisionHistoryOperation(value: RuntimeValue): value is RevisionHistoryOperation {
  return REVISION_HISTORY_OPERATIONS.some(operation => operation === value);
}

function projectIdentityRow(row: RecordTypeAttributes): RecordTypeAttributes {
  return {
    id: storedDataProperty(row, 'id'),
    schemaVersion: storedDataProperty(row, 'schemaVersion'),
    definitionId: storedDataProperty(row, 'definitionId'),
    branding: storedDataProperty(row, 'branding'),
    name: storedDataProperty(row, 'name'),
    key: storedDataProperty(row, 'key'),
    packageType: storedDataProperty(row, 'packageType'),
    searchCore: storedDataProperty(row, 'searchCore'),
    activeRevisionId: storedDataProperty(row, 'activeRevisionId'),
    activeRevisionNumber: storedDataProperty(row, 'activeRevisionNumber'),
    draftId: storedDataProperty(row, 'draftId'),
    version: storedDataProperty(row, 'version'),
    draftLifecycleToken: storedDataProperty(row, 'draftLifecycleToken'),
    draftLifecycleKind: storedDataProperty(row, 'draftLifecycleKind'),
    draftLifecycleOperation: storedDataProperty(row, 'draftLifecycleOperation'),
    definitionLifecycleToken: storedDataProperty(row, 'definitionLifecycleToken'),
    definitionLifecycleOperation: storedDataProperty(row, 'definitionLifecycleOperation'),
    recordCreationToken: storedDataProperty(row, 'recordCreationToken'),
    recordCreationFence: storedDataProperty(row, 'recordCreationFence'),
    retiredAt: storedDataProperty(row, 'retiredAt'),
    retiredBy: storedDataProperty(row, 'retiredBy'),
    retirementReason: storedDataProperty(row, 'retirementReason'),
    createdBy: storedDataProperty(row, 'createdBy'),
    updatedBy: storedDataProperty(row, 'updatedBy'),
  };
}

function projectDraftRow(row: RecordDefinitionDraftAttributes): RecordDefinitionDraftAttributes {
  return {
    id: storedDataProperty(row, 'id'),
    schemaVersion: storedDataProperty(row, 'schemaVersion'),
    branding: storedDataProperty(row, 'branding'),
    recordType: storedDataProperty(row, 'recordType'),
    recordTypeId: storedDataProperty(row, 'recordTypeId'),
    recordTypeKey: storedDataProperty(row, 'recordTypeKey'),
    version: storedDataProperty(row, 'version'),
    lifecycleOperationToken: storedDataProperty(row, 'lifecycleOperationToken'),
    baseRevisionId: storedDataProperty(row, 'baseRevisionId'),
    baseRevisionNumber: storedDataProperty(row, 'baseRevisionNumber'),
    definition: storedDataProperty(row, 'definition'),
    validation: storedDataProperty(row, 'validation'),
    createdAt: storedDataProperty(row, 'createdAt'),
    createdBy: storedDataProperty(row, 'createdBy'),
    updatedAt: storedDataProperty(row, 'updatedAt'),
    updatedBy: storedDataProperty(row, 'updatedBy'),
  };
}

function projectRevisionRow(row: RecordDefinitionRevisionAttributes): RecordDefinitionRevisionAttributes {
  return {
    id: storedDataProperty(row, 'id'),
    schemaVersion: storedDataProperty(row, 'schemaVersion'),
    branding: storedDataProperty(row, 'branding'),
    recordType: storedDataProperty(row, 'recordType'),
    recordTypeId: storedDataProperty(row, 'recordTypeId'),
    recordTypeKey: storedDataProperty(row, 'recordTypeKey'),
    revisionNumber: storedDataProperty(row, 'revisionNumber'),
    canonicalHash: storedDataProperty(row, 'canonicalHash'),
    definition: storedDataProperty(row, 'definition'),
    actionContracts: storedDataProperty(row, 'actionContracts'),
    source: storedDataProperty(row, 'source'),
    publicationNote: storedDataProperty(row, 'publicationNote'),
    publishedAt: storedDataProperty(row, 'publishedAt'),
    publishedBy: storedDataProperty(row, 'publishedBy'),
    createdAt: storedDataProperty(row, 'createdAt'),
    createdBy: storedDataProperty(row, 'createdBy'),
  };
}

function projectHistoryRow(row: RecordDefinitionHistoryAttributes): RecordDefinitionHistoryAttributes {
  return {
    id: storedDataProperty(row, 'id'),
    schemaVersion: storedDataProperty(row, 'schemaVersion'),
    branding: storedDataProperty(row, 'branding'),
    recordType: storedDataProperty(row, 'recordType'),
    recordTypeId: storedDataProperty(row, 'recordTypeId'),
    recordTypeKey: storedDataProperty(row, 'recordTypeKey'),
    operation: storedDataProperty(row, 'operation'),
    operationId: storedDataProperty(row, 'operationId'),
    expectedIdentityVersion: storedDataProperty(row, 'expectedIdentityVersion'),
    resultingIdentityVersion: storedDataProperty(row, 'resultingIdentityVersion'),
    expectedDraftVersion: storedDataProperty(row, 'expectedDraftVersion'),
    expectedActiveRevisionNumber: storedDataProperty(row, 'expectedActiveRevisionNumber'),
    revision: storedDataProperty(row, 'revision'),
    revisionNumber: storedDataProperty(row, 'revisionNumber'),
    canonicalHash: storedDataProperty(row, 'canonicalHash'),
    source: storedDataProperty(row, 'source'),
    occurredAt: storedDataProperty(row, 'occurredAt'),
    actor: storedDataProperty(row, 'actor'),
    note: storedDataProperty(row, 'note'),
    validation: storedDataProperty(row, 'validation'),
    impact: storedDataProperty(row, 'impact'),
    changes: storedDataProperty(row, 'changes'),
    redactions: storedDataProperty(row, 'redactions'),
    truncated: storedDataProperty(row, 'truncated'),
    createdAt: storedDataProperty(row, 'createdAt'),
  };
}

function projectAckRow(
  row: RecordDefinitionLifecycleOperationAckAttributes
): RecordDefinitionLifecycleOperationAckAttributes {
  return {
    id: storedDataProperty(row, 'id'),
    branding: storedDataProperty(row, 'branding'),
    recordType: storedDataProperty(row, 'recordType'),
    recordTypeId: storedDataProperty(row, 'recordTypeId'),
    recordTypeKey: storedDataProperty(row, 'recordTypeKey'),
    kind: storedDataProperty(row, 'kind'),
    identityVersion: storedDataProperty(row, 'identityVersion'),
    historyId: storedDataProperty(row, 'historyId'),
    revisionNumber: storedDataProperty(row, 'revisionNumber'),
    identity: storedDataProperty(row, 'identity'),
    operation: storedDataProperty(row, 'operation'),
    expiresAt: storedDataProperty(row, 'expiresAt'),
  };
}

function freezeRuntimeTree(value: RuntimeValue): void {
  if (value === null || typeof value !== 'object') return;
  const pending: object[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) continue;
    seen.add(current);
    for (const key of Object.keys(current)) {
      const descriptor = Object.getOwnPropertyDescriptor(current, key);
      if (descriptor !== undefined && descriptor.get === undefined && descriptor.set === undefined) {
        const child = descriptor.value as RuntimeValue;
        if (child !== null && typeof child === 'object') pending.push(child);
      }
    }
    Object.freeze(current);
  }
}

function immutableValue<Value>(value: Value): Readonly<Value> {
  const copy = structuredClone(value);
  freezeRuntimeTree(copy as RuntimeValue);
  return copy;
}

function activeRevisionNumber(
  identity: RecordTypeAttributes,
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): number | null {
  const number = storedDataProperty(identity, 'activeRevisionNumber') ?? null;
  const id = storedRelationId(identity, 'activeRevisionId');
  if ((number === null) !== (id === null)) {
    return lifecycleError('storage-consistency-error', 'Stored active-revision metadata is invalid.');
  }
  if (number === null || id === null) return null;
  const parsed = positiveRevision(number);
  if (id !== deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, parsed)) {
    return lifecycleError('storage-consistency-error', 'Stored active-revision metadata is invalid.');
  }
  return parsed;
}

function ownedIdentity(
  identity: RecordTypeAttributes,
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): RecordTypeAttributes {
  const id = storedDataProperty(identity, 'id');
  const definitionId = deriveRecordDefinitionId({ brandId, recordTypeKey });
  if (
    typeof id !== 'string' ||
    id.length === 0 ||
    id.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
    storedRelationId(identity, 'branding') !== brandId ||
    storedDataProperty(identity, 'name') !== recordTypeKey ||
    storedDataProperty(identity, 'definitionId') !== definitionId
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition ownership is invalid.');
  }
  nonNegativeVersion(storedDataProperty(identity, 'version') ?? 0);
  activeRevisionNumber(identity, brandId, recordTypeKey);
  const draftToken = storedDataProperty(identity, 'draftLifecycleToken') ?? null;
  const draftOperation = storedDataProperty(identity, 'draftLifecycleOperation') ?? null;
  if ((draftToken === null) !== (draftOperation === null)) {
    return lifecycleError('storage-consistency-error', 'Stored draft lifecycle metadata is invalid.');
  }
  recordCreationFence(identity);
  return identity;
}

function recordCreationFence(identity: RecordTypeAttributes): RecordTypeCreationFence | null {
  const token = storedDataProperty(identity, 'recordCreationToken') ?? null;
  const value = storedDataProperty(identity, 'recordCreationFence') ?? null;
  if (token === null && value === null) return null;
  if (typeof token !== 'string' || !OPERATION_TOKEN_PATTERN.test(token) || !isRuntimeRecord(value) || isProxy(value)) {
    return lifecycleError('storage-consistency-error', 'Stored record-creation lifecycle metadata is invalid.');
  }
  const fenceToken = runtimeDataProperty(value, 'token');
  const recordOid = runtimeDataProperty(value, 'recordOid');
  const acquiredAt = timestamp(runtimeDataProperty(value, 'acquiredAt'));
  if (
    fenceToken !== token ||
    typeof recordOid !== 'string' ||
    recordOid.length === 0 ||
    recordOid.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
    !RECORD_DEFINITION_REFERENCE_PATTERN.test(recordOid)
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-creation lifecycle metadata is invalid.');
  }
  return Object.freeze({ token, recordOid, acquiredAt });
}

function storedActor(value: RuntimeValue): RecordDefinitionActorDto {
  try {
    return parseActor(value as RecordDefinitionActorDto);
  } catch {
    return lifecycleError('storage-consistency-error', 'Stored record-definition actor metadata is invalid.');
  }
}

function lifecycleOperation(
  identity: RecordTypeAttributes,
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): RecordDefinitionLifecycleOperation | null {
  const tokenValue = storedDataProperty(identity, 'definitionLifecycleToken') ?? null;
  const operationValue = storedDataProperty(identity, 'definitionLifecycleOperation') ?? null;
  if (tokenValue === null && operationValue === null) return null;
  if (
    typeof tokenValue !== 'string' ||
    !OPERATION_TOKEN_PATTERN.test(tokenValue) ||
    operationValue === null ||
    typeof operationValue !== 'object' ||
    isProxy(operationValue)
  ) {
    return lifecycleError('storage-consistency-error', 'Stored definition lifecycle metadata is invalid.');
  }
  const preflight = boundedValidationPreflight(operationValue, {
    maxBytes: 16_384,
    maxDepth: 4,
    maxStringLength: RECORD_DEFINITION_NOTE_MAX_LENGTH,
    maxPropertyNameLength: 64,
    maxWork: 128,
    arrayCardinalityLimit: () => 0,
    objectCardinalityLimit: () => 16,
  });
  if (!preflight.ok) {
    return lifecycleError('storage-consistency-error', 'Stored definition lifecycle metadata is invalid.');
  }
  const token = runtimeDataProperty(operationValue, 'token');
  const kind = runtimeDataProperty(operationValue, 'kind');
  const phase = runtimeDataProperty(operationValue, 'phase');
  const expectedIdentityVersion = nonNegativeVersion(runtimeDataProperty(operationValue, 'expectedIdentityVersion'));
  const identityVersion = nonNegativeVersion(runtimeDataProperty(operationValue, 'identityVersion'));
  const expectedActiveRevisionNumber = positiveRevision(
    runtimeDataProperty(operationValue, 'expectedActiveRevisionNumber'),
    true
  );
  const expectedDraftVersionValue = runtimeDataProperty(operationValue, 'expectedDraftVersion');
  const historyId = runtimeDataProperty(operationValue, 'historyId');
  const occurredAt = timestamp(runtimeDataProperty(operationValue, 'occurredAt'));
  const actor = storedActor(runtimeDataProperty(operationValue, 'actor'));
  const noteValue = runtimeDataProperty(operationValue, 'note');
  if (
    token !== tokenValue ||
    (kind !== 'publish' && kind !== 'rollback' && kind !== 'retire' && kind !== 'unretire') ||
    (phase !== 'reserved' && phase !== 'activated') ||
    identityVersion !== expectedIdentityVersion + 1 ||
    identityVersion !== nonNegativeVersion(storedDataProperty(identity, 'version') ?? 0) ||
    (phase === 'reserved' && expectedActiveRevisionNumber !== activeRevisionNumber(identity, brandId, recordTypeKey)) ||
    typeof historyId !== 'string' ||
    !HISTORY_ID_PATTERN.test(historyId) ||
    (noteValue !== undefined &&
      (typeof noteValue !== 'string' || !hasSafeDisplayText(noteValue, RECORD_DEFINITION_NOTE_MAX_LENGTH)))
  ) {
    return lifecycleError('storage-consistency-error', 'Stored definition lifecycle metadata is invalid.');
  }
  const normalizedPhase: RecordDefinitionLifecycleOperation['phase'] = phase;
  const base = {
    token,
    kind,
    phase: normalizedPhase,
    expectedIdentityVersion,
    identityVersion,
    expectedActiveRevisionNumber,
    historyId,
    occurredAt,
    actor,
    ...(typeof noteValue === 'string' ? { note: noteValue } : {}),
  };
  if (kind === 'retire' || kind === 'unretire') {
    if (expectedDraftVersionValue !== null) {
      return lifecycleError('storage-consistency-error', 'Stored retirement lifecycle metadata is invalid.');
    }
    return Object.freeze({ ...base, kind, expectedDraftVersion: null });
  }
  const expectedDraftVersion =
    kind === 'publish'
      ? nonNegativeVersion(expectedDraftVersionValue)
      : expectedDraftVersionValue === null
        ? null
        : lifecycleError('storage-consistency-error', 'Stored rollback lifecycle metadata is invalid.');
  const targetRevisionNumber = positiveRevision(runtimeDataProperty(operationValue, 'targetRevisionNumber'));
  const targetRevisionId = runtimeDataProperty(operationValue, 'targetRevisionId');
  const canonicalHashValue = runtimeDataProperty(operationValue, 'canonicalHash');
  const source = runtimeDataProperty(operationValue, 'source');
  let canonicalHash: RecordDefinitionCanonicalHash;
  if (typeof canonicalHashValue !== 'string') {
    return lifecycleError('storage-consistency-error', 'Stored publication lifecycle metadata is invalid.');
  }
  try {
    canonicalHash = parseRecordDefinitionCanonicalHash(canonicalHashValue);
  } catch {
    return lifecycleError('storage-consistency-error', 'Stored publication lifecycle metadata is invalid.');
  }
  const expectedRevisionId = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, targetRevisionNumber);
  if (targetRevisionId !== expectedRevisionId || source === null || typeof source !== 'object' || isProxy(source)) {
    return lifecycleError('storage-consistency-error', 'Stored publication lifecycle metadata is invalid.');
  }
  const sourceOperation = runtimeDataProperty(source, 'operation');
  const sourceRevisionNumber = positiveRevision(runtimeDataProperty(source, 'sourceRevisionNumber'), true);
  if (
    (kind === 'publish' && sourceOperation !== 'publish') ||
    (kind === 'rollback' && sourceOperation !== 'rollback') ||
    (kind === 'rollback' && sourceRevisionNumber === null) ||
    (sourceRevisionNumber !== expectedActiveRevisionNumber && kind === 'publish')
  ) {
    return lifecycleError('storage-consistency-error', 'Stored publication lifecycle metadata is invalid.');
  }
  const normalizedSource: RecordDefinitionRevisionSourceDto =
    kind === 'rollback'
      ? { operation: 'rollback', sourceRevisionNumber: positiveRevision(sourceRevisionNumber) }
      : { operation: 'publish', sourceRevisionNumber };
  return Object.freeze({
    ...base,
    kind,
    expectedDraftVersion: kind === 'publish' ? expectedDraftVersion : null,
    targetRevisionId: expectedRevisionId,
    targetRevisionNumber,
    canonicalHash,
    source: Object.freeze(normalizedSource),
  });
}

function draftDefinitionFromPublished(
  definition: PublishableRecordDefinitionAggregateDto
): DraftRecordDefinitionAggregateDto {
  return immutableValue({ ...definition, definitionState: 'draft-incomplete' }) as DraftRecordDefinitionAggregateDto;
}

function scopedValidationReport(
  report: RecordDefinitionValidationReportDto,
  scope: 'publication' | 'rollback'
): RecordDefinitionValidationReportDto {
  const value = immutableValue({ ...report, scope }) as RecordDefinitionValidationReportDto;
  return Object.freeze(value);
}

function conflict(
  code: RecordDefinitionConflictDto['code'],
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey,
  expectedVersion: number | null,
  currentVersion: number | null,
  expectedActiveRevisionNumber: number | null,
  currentActiveRevisionNumber: number | null
): RecordDefinitionConflictDto {
  const resource: RecordDefinitionConflictDto['resource'] =
    code === 'identity-version-conflict' ? 'identity' : code === 'draft-version-conflict' ? 'draft' : 'active-revision';
  const candidate: RecordDefinitionConflictDto = {
    schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
    code,
    resource,
    brandId,
    recordTypeKey,
    expectedVersion,
    currentVersion,
    expectedActiveRevisionNumber,
    currentActiveRevisionNumber,
    message:
      code === 'identity-version-conflict'
        ? 'The record type changed after the submitted editor version was loaded.'
        : code === 'draft-version-conflict'
          ? 'The shared draft changed after the submitted editor version was loaded.'
          : 'The active revision changed after the submitted editor version was loaded.',
  };
  const inspected = recordDefinitionConflictSchema.safeParse(candidate);
  if (!inspected.success) {
    return lifecycleError('storage-consistency-error', 'Conflict metadata could not be constructed safely.');
  }
  return Object.freeze(inspected.data);
}

function safeCatalogClone<Value>(value: RuntimeValue): Value {
  const preflight = boundedValidationPreflight(value, {
    maxBytes: RECORD_DEFINITION_CONTRACT_LIMITS.maxContractBytes,
    maxDepth: RECORD_DEFINITION_CONTRACT_LIMITS.maxDepth,
    maxStringLength: RECORD_DEFINITION_CONTRACT_LIMITS.maxStringLength,
    maxPropertyNameLength: RECORD_DEFINITION_CONTRACT_LIMITS.maxPropertyNameLength,
    maxWork: RECORD_DEFINITION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => RECORD_DEFINITION_CONTRACT_LIMITS.maxTransferFields,
    objectCardinalityLimit: () => RECORD_DEFINITION_CONTRACT_LIMITS.maxObjectProperties,
  });
  if (!preflight.ok) {
    return lifecycleError('storage-consistency-error', 'Stored validation authority data is invalid.');
  }
  return structuredClone(value) as RuntimeValue as Value;
}

function safelyEqualStoredJson(stored: RuntimeValue, expected: RuntimeValue): boolean {
  const inspected = boundedValidationPreflight(stored, {
    maxBytes: RECORD_DEFINITION_CONTRACT_LIMITS.maxContractBytes,
    maxDepth: RECORD_DEFINITION_CONTRACT_LIMITS.maxDepth,
    maxStringLength: RECORD_DEFINITION_CONTRACT_LIMITS.maxStringLength,
    maxPropertyNameLength: RECORD_DEFINITION_CONTRACT_LIMITS.maxPropertyNameLength,
    maxWork: RECORD_DEFINITION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => RECORD_DEFINITION_VALIDATION_LIMITS.maxChanges,
    objectCardinalityLimit: () => RECORD_DEFINITION_CONTRACT_LIMITS.maxObjectProperties,
  });
  return inspected.ok && isDeepStrictEqual(stored, expected);
}

export class DefaultRecordDefinitionPublicationAuthority implements RecordDefinitionPublicationAuthority {
  private boundedQuery<Value>(query: RuntimeValue): BoundedFindQuery<Value> {
    return query as object as BoundedFindQuery<Value>;
  }

  private async roles(brandId: RecordDefinitionBrandId): Promise<readonly string[]> {
    // B11 migration preparation shares this authority. Waterline's verifier logs raw
    // malformed values, so B11 validates original rows itself with bounded diagnostics.
    const query = this.boundedQuery<RoleAttributes[]>(Role.find({ branding: brandId }))
      .meta(PUBLICATION_READ_META)
      .limit(RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries + 1);
    const rows = await query;
    if (rows.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries) {
      return lifecycleError('storage-consistency-error', 'Stored role authority data is invalid.');
    }
    const roles = rows.map(row => {
      const rowBrand = storedRelationId(row, 'branding');
      const name = storedDataProperty(row, 'name') as RuntimeValue;
      if (
        rowBrand !== brandId ||
        typeof name !== 'string' ||
        name.length === 0 ||
        name.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
        !RECORD_DEFINITION_REFERENCE_PATTERN.test(name)
      ) {
        return lifecycleError('storage-consistency-error', 'Stored role authority data is invalid.');
      }
      return name;
    });
    if (new Set(roles).size !== roles.length) {
      return lifecycleError('storage-consistency-error', 'Stored role authority data is invalid.');
    }
    return Object.freeze(roles);
  }

  private async forms(brandId: RecordDefinitionBrandId): Promise<readonly RecordDefinitionFormCapability[]> {
    const query = this.boundedQuery<FormAttributes[]>(Form.find({ branding: brandId }))
      .meta(PUBLICATION_READ_META)
      .limit(RECORD_DEFINITION_VALIDATION_LIMITS.maxFormCapabilities + 1);
    const rows = await query;
    if (rows.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxFormCapabilities) {
      return lifecycleError('storage-consistency-error', 'Stored form authority data is invalid.');
    }
    const forms = rows.map(row => {
      const rowBrand = storedRelationId(row, 'branding');
      const reference = storedDataProperty(row, 'name') as RuntimeValue;
      const configuration = storedDataProperty(row, 'configuration') as RuntimeValue;
      if (
        rowBrand !== brandId ||
        typeof reference !== 'string' ||
        reference.length === 0 ||
        reference.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
        !RECORD_DEFINITION_REFERENCE_PATTERN.test(reference) ||
        !isRuntimeRecord(configuration) ||
        isProxy(configuration)
      ) {
        return lifecycleError('storage-consistency-error', 'Stored form authority data is invalid.');
      }
      const validationOperations = runtimeDataProperty(configuration, 'validationOperations');
      const validationGroups = runtimeDataProperty(configuration, 'validationGroups');
      if (
        (validationOperations !== undefined &&
          (!isRuntimeRecord(validationOperations) || isProxy(validationOperations))) ||
        (validationGroups !== undefined && (!isRuntimeRecord(validationGroups) || isProxy(validationGroups)))
      ) {
        return lifecycleError('storage-consistency-error', 'Stored form authority data is invalid.');
      }
      return Object.freeze({
        reference,
        validationOperations:
          validationOperations === undefined
            ? Object.freeze({})
            : safeCatalogClone<Readonly<Record<string, ValidationOperationDefinition>>>(validationOperations),
        validationGroups:
          validationGroups === undefined
            ? Object.freeze({})
            : safeCatalogClone<Readonly<FormValidationGroups>>(validationGroups),
      });
    });
    if (new Set(forms.map(form => form.reference)).size !== forms.length) {
      return lifecycleError('storage-consistency-error', 'Stored form authority data is invalid.');
    }
    return Object.freeze(forms);
  }

  private async recordTypeKeys(brandId: RecordDefinitionBrandId): Promise<readonly RecordDefinitionKey[]> {
    const query = this.boundedQuery<RecordTypeAttributes[]>(RecordType.find({ branding: brandId }))
      .meta(PUBLICATION_READ_META)
      .limit(RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries + 1);
    const rows = await query;
    if (rows.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxCatalogEntries) {
      return lifecycleError('storage-consistency-error', 'Stored record-type authority data is invalid.');
    }
    return Object.freeze(
      rows.map(row => {
        const rowBrand = storedRelationId(row, 'branding');
        const key = storedDataProperty(row, 'name') as RuntimeValue;
        if (rowBrand !== brandId || typeof key !== 'string') {
          return lifecycleError('storage-consistency-error', 'Stored record-type authority data is invalid.');
        }
        try {
          return parseRecordDefinitionKey(key);
        } catch {
          return lifecycleError('storage-consistency-error', 'Stored record-type authority data is invalid.');
        }
      })
    );
  }

  private storageCapabilityProvider(): StorageCapabilityProvider | null {
    const serviceName = sails.config.storage.serviceName;
    const service = serviceName ? sails.services[serviceName] : undefined;
    return service === undefined ? null : (service as object as StorageCapabilityProvider);
  }

  private async stageReferences(
    request: RecordDefinitionPublicationAuthorityRequest
  ): Promise<readonly RecordDefinitionStageReferenceCount[]> {
    const stageKeys = new Set<WorkflowStageKey>();
    for (const stage of request.activeDefinition?.stages ?? []) stageKeys.add(stage.key);
    if (stageKeys.size > RECORD_DEFINITION_CONTRACT_LIMITS.maxStages) {
      return lifecycleError('storage-consistency-error', 'Stored stage-reference authority data is invalid.');
    }
    const references: RecordDefinitionStageReferenceCount[] = [];
    for (const stageKey of [...stageKeys].sort()) {
      const query = Record.count({
        'metaMetadata.brandId': request.brandId,
        'metaMetadata.type': request.recordTypeKey,
        'workflow.stage': stageKey,
      }).meta({ enableExperimentalDeepTargets: true });
      const recordCount = await query;
      if (!Number.isSafeInteger(recordCount) || recordCount < 0) {
        return lifecycleError('storage-consistency-error', 'Stored stage-reference authority data is invalid.');
      }
      references.push(Object.freeze({ stageKey, recordCount }));
    }
    return Object.freeze(references);
  }

  public async load(
    request: RecordDefinitionPublicationAuthorityRequest
  ): Promise<RecordDefinitionPublicationAuthoritySnapshot> {
    const actionRegistry = sails.config.actionRegistry ?? coreRecordActionRegistry();
    return Object.freeze({
      actionRegistry,
      roles: await this.roles(request.brandId),
      forms: await this.forms(request.brandId),
      availableRecordTypeKeys: await this.recordTypeKeys(request.brandId),
      storageCapabilityProvider: this.storageCapabilityProvider(),
      stageReferences: await this.stageReferences(request),
    });
  }
}

export namespace Services {
  /** Immutable publication/history and stable-identity retirement lifecycle. */
  export class RecordDefinitionPublication extends services.Core.Service {
    protected override _exportedMethods: string[] = [
      'publish',
      'validateDraft',
      'listHistory',
      'getRevision',
      'rollback',
      'retire',
      'unretire',
    ];
    private publicationIndexSetup: Promise<void> | null = null;
    private readonly authority: RecordDefinitionPublicationAuthority;

    constructor(authority: RecordDefinitionPublicationAuthority = new DefaultRecordDefinitionPublicationAuthority()) {
      super();
      this.authority = authority;
    }

    private execute<Value>(query: ExecutableQuery<Value>, connection?: Sails.Connection): PromiseLike<Value> {
      return connection === undefined ? query : query.usingConnection(connection);
    }

    private async ensurePublicationIndexes(): Promise<void> {
      if (this.publicationIndexSetup !== null) return this.publicationIndexSetup;
      const setup = (async (): Promise<void> => {
        const manager = RecordDefinitionRevision.getDatastore().manager as object as PublicationMongoManager;
        if (manager === null || typeof manager !== 'object' || typeof manager.collection !== 'function') {
          return lifecycleError('storage-consistency-error', 'Publication index storage is unavailable.');
        }
        const revision = manager.collection('recorddefinitionrevision');
        const history = manager.collection('recorddefinitionhistory');
        const acknowledgement = manager.collection('recorddefinitionlifecycleoperationack');
        await Promise.all([
          revision.createIndex(
            { recordType: 1, revisionNumber: 1 },
            { name: 'recorddefinitionrevision_record_type_number', unique: true }
          ),
          history.createIndex({ operationId: 1 }, { name: 'recorddefinitionhistory_operation', unique: true }),
          history.createIndex(
            { recordType: 1, resultingIdentityVersion: 1 },
            { name: 'recorddefinitionhistory_record_type_identity_version', unique: true }
          ),
          acknowledgement.createIndex(
            { recordType: 1, identityVersion: 1 },
            { name: 'recorddefinitionlifecycleoperationack_record_type_version', unique: true }
          ),
          acknowledgement.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: 'recorddefinitionlifecycleoperationack_expiry' }
          ),
        ]);
      })();
      this.publicationIndexSetup = setup;
      try {
        await setup;
      } catch (error) {
        if (this.publicationIndexSetup === setup) this.publicationIndexSetup = null;
        throw error;
      }
    }

    private async findIdentity(
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection
    ): Promise<RecordTypeAttributes | null> {
      const query = RecordType.findOne({ branding: brandId, name: recordTypeKey }) as object as ExecutableQuery<
        RecordTypeAttributes | null | undefined
      >;
      const row = await this.execute(query, connection);
      return row === null || row === undefined ? null : ownedIdentity(projectIdentityRow(row), brandId, recordTypeKey);
    }

    private async findDraft(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection
    ): Promise<RecordDefinitionDraftDto | null> {
      const pointer = storedRelationId(identity, 'draftId');
      if (pointer === null) return null;
      const expected = deriveRecordDefinitionDraftId({ brandId, recordTypeKey });
      if (pointer !== expected) {
        return lifecycleError('storage-consistency-error', 'Stored draft ownership is invalid.');
      }
      const query = RecordDefinitionDraft.findOne({
        id: expected,
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
      }) as object as ExecutableQuery<RecordDefinitionDraftAttributes | null | undefined>;
      const stored = await this.execute(query, connection);
      if (stored === null || stored === undefined) {
        return lifecycleError('storage-consistency-error', 'The record type points to a missing draft.');
      }
      const row = projectDraftRow(stored);
      const candidate: RecordDefinitionDraftDto = {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        id: storedDataProperty(row, 'id'),
        recordTypeId: storedDataProperty(row, 'recordTypeId'),
        brandId,
        recordTypeKey,
        version: storedDataProperty(row, 'version'),
        baseRevisionNumber: storedDataProperty(row, 'baseRevisionNumber') ?? null,
        definition: storedDataProperty(row, 'definition'),
        updatedAt: timestamp(storedDataProperty(row, 'updatedAt')),
        updatedBy: storedActor(storedDataProperty(row, 'updatedBy')),
        validation: storedDataProperty(row, 'validation') ?? null,
      };
      const inspected = recordDefinitionDraftSchema.safeParse(candidate);
      if (
        !inspected.success ||
        storedRelationId(row, 'branding') !== brandId ||
        storedRelationId(row, 'recordType') !== storedDataProperty(identity, 'id')
      ) {
        return lifecycleError('storage-consistency-error', 'Stored draft data is invalid.');
      }
      return immutableValue(inspected.data) as RecordDefinitionDraftDto;
    }

    private revisionDto(
      rowValue: RecordDefinitionRevisionAttributes,
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey
    ): RecordDefinitionRevisionDto {
      const row = projectRevisionRow(rowValue);
      const publicationNote = storedDataProperty(row, 'publicationNote');
      const candidate: RecordDefinitionRevisionDto = {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        id: storedDataProperty(row, 'id'),
        brandId,
        recordTypeKey,
        revisionNumber: storedDataProperty(row, 'revisionNumber'),
        canonicalHash: storedDataProperty(row, 'canonicalHash'),
        definition: storedDataProperty(row, 'definition'),
        actionContracts: storedDataProperty(row, 'actionContracts'),
        source: storedDataProperty(row, 'source'),
        publishedAt: timestamp(storedDataProperty(row, 'publishedAt')),
        publishedBy: storedActor(storedDataProperty(row, 'publishedBy')),
        ...(publicationNote === undefined || publicationNote === '' ? {} : { publicationNote }),
      };
      const inspected = recordDefinitionRevisionSchema.safeParse(candidate);
      if (
        !inspected.success ||
        storedDataProperty(row, 'recordTypeId') !== storedDataProperty(identity, 'definitionId') ||
        storedRelationId(row, 'branding') !== brandId ||
        storedRelationId(row, 'recordType') !== storedDataProperty(identity, 'id') ||
        hashRecordDefinition(inspected.data.definition) !== inspected.data.canonicalHash
      ) {
        return lifecycleError('storage-consistency-error', 'Stored record-definition revision is invalid.');
      }
      return immutableValue(inspected.data) as RecordDefinitionRevisionDto;
    }

    private async findRevision(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      revisionNumber: number,
      connection?: Sails.Connection
    ): Promise<RecordDefinitionRevisionDto | null> {
      const id = deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, revisionNumber);
      const query = RecordDefinitionRevision.findOne({
        id,
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
        revisionNumber,
      }) as object as ExecutableQuery<RecordDefinitionRevisionAttributes | null | undefined>;
      const row = await this.execute(query, connection);
      return row === null || row === undefined ? null : this.revisionDto(row, identity, brandId, recordTypeKey);
    }

    private async activeRevision(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection
    ): Promise<RecordDefinitionRevisionDto | null> {
      const number = activeRevisionNumber(identity, brandId, recordTypeKey);
      if (number === null) return null;
      const revision = await this.findRevision(identity, brandId, recordTypeKey, number, connection);
      if (revision === null) {
        return lifecycleError('active-revision-not-found', 'The active record-definition revision was not found.');
      }
      return revision;
    }

    private historyMetadata(
      rowValue: RecordDefinitionHistoryAttributes,
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey
    ): RevisionHistoryMetadata {
      const row = projectHistoryRow(rowValue);
      const revisionNumber = positiveRevision(storedDataProperty(row, 'revisionNumber'));
      const revisionId = storedRelationId(row, 'revision');
      const canonicalHash = storedDataProperty(row, 'canonicalHash');
      const source = storedDataProperty(row, 'source');
      const validation = storedDataProperty(row, 'validation');
      const impact = storedDataProperty(row, 'impact');
      const changes = storedDataProperty(row, 'changes') ?? Object.freeze([]);
      const redactions = storedDataProperty(row, 'redactions') ?? Object.freeze([]);
      const inspectedValidation = recordDefinitionValidationReportSchema.safeParse(validation);
      const inspectedImpact = recordDefinitionImpactReportSchema.safeParse(impact);
      if (
        revisionId !== deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, revisionNumber) ||
        typeof canonicalHash !== 'string' ||
        source === undefined ||
        validation === undefined ||
        impact === undefined ||
        !inspectedValidation.success ||
        !inspectedImpact.success ||
        !isRuntimeArray(changes) ||
        !isRuntimeArray(redactions) ||
        changes.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxChanges ||
        redactions.length > RECORD_DEFINITION_VALIDATION_LIMITS.maxIssues ||
        storedDataProperty(row, 'recordTypeId') !== storedDataProperty(identity, 'definitionId') ||
        storedRelationId(row, 'branding') !== brandId ||
        storedRelationId(row, 'recordType') !== storedDataProperty(identity, 'id')
      ) {
        return lifecycleError('storage-consistency-error', 'Stored definition history is invalid.');
      }
      const actor = storedActor(storedDataProperty(row, 'actor'));
      const note = storedDataProperty(row, 'note');
      const durableValidation = inspectedValidation.data;
      const durableImpact = inspectedImpact.data;
      const validationErrorCount = durableValidation.issues.filter(issue => issue.severity === 'error').length;
      const validationWarningCount = durableValidation.issues.filter(issue => issue.severity === 'warning').length;
      const candidate: RecordDefinitionHistorySummaryDto = {
        schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
        id: storedDataProperty(row, 'id'),
        brandId,
        recordTypeKey,
        revision: {
          id: revisionId as RecordDefinitionRevisionId,
          revisionNumber,
          canonicalHash: parseRecordDefinitionCanonicalHash(canonicalHash),
        },
        source,
        publishedAt: timestamp(storedDataProperty(row, 'occurredAt')),
        publishedBy: actor,
        ...(note === undefined || note === '' ? {} : { publicationNote: note }),
        validation: {
          status: durableValidation.status,
          errorCount: validationErrorCount,
          warningCount: validationWarningCount,
        },
        impact: { status: durableImpact.status, affectedRecordCount: durableImpact.affectedRecordCount },
        changes: changes as object as readonly RecordDefinitionStructuralChangeDto[],
        redactions: redactions as object as RecordDefinitionHistorySummaryDto['redactions'],
        truncated: storedDataProperty(row, 'truncated') === true,
      };
      const inspected = recordDefinitionHistorySummarySchema.safeParse(candidate);
      if (!inspected.success) {
        return lifecycleError('storage-consistency-error', 'Stored definition history is invalid.');
      }
      return Object.freeze({ row, summary: immutableValue(inspected.data) as RecordDefinitionHistorySummaryDto });
    }

    private async findHistoryById(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      id: string,
      connection?: Sails.Connection
    ): Promise<RecordDefinitionHistoryAttributes | null> {
      const query = RecordDefinitionHistory.findOne({
        id,
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
      }) as object as ExecutableQuery<RecordDefinitionHistoryAttributes | null | undefined>;
      const row = await this.execute(query, connection);
      return row === null || row === undefined ? null : projectHistoryRow(row);
    }

    private async findRevisionHistory(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      revisionNumber: number,
      connection?: Sails.Connection
    ): Promise<RevisionHistoryMetadata | null> {
      const query = RecordDefinitionHistory.findOne({
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
        revisionNumber,
        operation: { in: REVISION_HISTORY_OPERATIONS },
      }) as object as ExecutableQuery<RecordDefinitionHistoryAttributes | null | undefined>;
      const row = await this.execute(query, connection);
      return row === null || row === undefined ? null : this.historyMetadata(row, identity, brandId, recordTypeKey);
    }

    private async validatedRevisionHistorySummary(
      row: RecordDefinitionHistoryAttributes,
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      revisionValue?: RecordDefinitionRevisionDto
    ): Promise<RecordDefinitionHistorySummaryDto> {
      const history = this.historyMetadata(row, identity, brandId, recordTypeKey);
      const revision =
        revisionValue ??
        (await this.findRevision(identity, brandId, recordTypeKey, history.summary.revision.revisionNumber));
      const historyOperation = storedDataProperty(history.row, 'operation');
      if (
        revision === null ||
        revision.id !== history.summary.revision.id ||
        revision.canonicalHash !== history.summary.revision.canonicalHash ||
        !isRevisionHistoryOperation(historyOperation) ||
        historyOperation !== revision.source.operation ||
        !safelyEqualStoredJson(revision.source as RuntimeValue, history.summary.source as RuntimeValue)
      ) {
        return lifecycleError('storage-consistency-error', 'Stored definition history has no matching revision.');
      }
      return history.summary;
    }

    private identityDto(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      draft: RecordDefinitionDraftDto | null,
      active: RecordDefinitionRevisionDto | null
    ): RecordTypeIdentityDto {
      const retiredAtValue = storedDataProperty(identity, 'retiredAt');
      const retiredByValue = storedDataProperty(identity, 'retiredBy');
      const retirementReason = storedDataProperty(identity, 'retirementReason');
      const packageType = storedDataProperty(identity, 'packageType');
      const searchCore = storedDataProperty(identity, 'searchCore');
      if (
        typeof packageType !== 'string' ||
        !RECORD_DEFINITION_REFERENCE_PATTERN.test(packageType) ||
        typeof searchCore !== 'string' ||
        !RECORD_DEFINITION_REFERENCE_PATTERN.test(searchCore)
      ) {
        return lifecycleError('storage-consistency-error', 'Stored deployment metadata is invalid.');
      }
      const retirement =
        retiredAtValue == null && retiredByValue == null && retirementReason == null
          ? null
          : retiredAtValue == null || retiredByValue == null
            ? lifecycleError('storage-consistency-error', 'Stored retirement metadata is invalid.')
            : {
                retiredAt: timestamp(retiredAtValue),
                retiredBy: storedActor(retiredByValue),
                ...(retirementReason == null ? {} : { reason: retirementReason }),
              };
      const candidate: RecordTypeIdentityDto = {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        id: deriveRecordDefinitionId({ brandId, recordTypeKey }),
        brandId,
        key: recordTypeKey,
        deployment: { packageType, searchCore },
        version: nonNegativeVersion(storedDataProperty(identity, 'version') ?? 0),
        activeRevision:
          active === null
            ? null
            : {
                id: active.id,
                revisionNumber: active.revisionNumber,
                canonicalHash: active.canonicalHash,
              },
        draft:
          draft === null
            ? null
            : {
                id: draft.id,
                version: draft.version,
                baseRevisionNumber: draft.baseRevisionNumber,
                updatedAt: draft.updatedAt,
                updatedBy: draft.updatedBy,
              },
        retirement,
      };
      const inspected = recordTypeIdentitySchema.safeParse(candidate);
      if (!inspected.success) {
        return lifecycleError('storage-consistency-error', 'Stored record-type status is invalid.');
      }
      return immutableValue(inspected.data) as RecordTypeIdentityDto;
    }

    private async coordinates(
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey
    ): Promise<PublicationCoordinates> {
      const found = await this.findIdentity(brandId, recordTypeKey);
      if (found === null) return lifecycleError('record-type-not-found', 'The record type was not found.');
      const settled = await this.settleIdentity(found, brandId, recordTypeKey);
      if ((storedDataProperty(settled, 'draftLifecycleToken') ?? null) !== null) {
        return lifecycleError('storage-consistency-error', 'A draft lifecycle operation is still settling.');
      }
      return Object.freeze({
        brandId,
        recordTypeKey,
        identity: settled,
        draft: await this.findDraft(settled, brandId, recordTypeKey),
        active: await this.activeRevision(settled, brandId, recordTypeKey),
      });
    }

    private currentConflict(
      coordinates: PublicationCoordinates,
      expectedIdentityVersion: number,
      expectedDraftVersion: number | null,
      expectedActiveRevisionNumber: number | null
    ): RecordDefinitionPublicationConflict | null {
      const currentIdentityVersion = nonNegativeVersion(storedDataProperty(coordinates.identity, 'version') ?? 0);
      const currentActiveRevisionNumber = coordinates.active?.revisionNumber ?? null;
      if (currentActiveRevisionNumber !== expectedActiveRevisionNumber) {
        return Object.freeze({
          ok: false,
          current: this.identityDto(
            coordinates.identity,
            coordinates.brandId,
            coordinates.recordTypeKey,
            coordinates.draft,
            coordinates.active
          ),
          conflict: conflict(
            'active-revision-conflict',
            coordinates.brandId,
            coordinates.recordTypeKey,
            expectedActiveRevisionNumber,
            currentActiveRevisionNumber,
            expectedActiveRevisionNumber,
            currentActiveRevisionNumber
          ),
        });
      }
      if (expectedDraftVersion !== null && coordinates.draft?.version !== expectedDraftVersion) {
        return Object.freeze({
          ok: false,
          current: this.identityDto(
            coordinates.identity,
            coordinates.brandId,
            coordinates.recordTypeKey,
            coordinates.draft,
            coordinates.active
          ),
          conflict: conflict(
            'draft-version-conflict',
            coordinates.brandId,
            coordinates.recordTypeKey,
            expectedDraftVersion,
            coordinates.draft?.version ?? null,
            expectedActiveRevisionNumber,
            currentActiveRevisionNumber
          ),
        });
      }
      if (currentIdentityVersion !== expectedIdentityVersion) {
        return Object.freeze({
          ok: false,
          current: this.identityDto(
            coordinates.identity,
            coordinates.brandId,
            coordinates.recordTypeKey,
            coordinates.draft,
            coordinates.active
          ),
          conflict: conflict(
            'identity-version-conflict',
            coordinates.brandId,
            coordinates.recordTypeKey,
            expectedIdentityVersion,
            currentIdentityVersion,
            expectedActiveRevisionNumber,
            currentActiveRevisionNumber
          ),
        });
      }
      return null;
    }

    private async validate(
      coordinates: PublicationCoordinates,
      definition: DraftRecordDefinitionAggregateDto,
      draftVersion: number,
      scope: 'publication' | 'rollback'
    ): Promise<ValidPublicationArtifacts> {
      const authority = await this.authority.load({
        brandId: coordinates.brandId,
        recordTypeKey: coordinates.recordTypeKey,
        definition,
        activeDefinition: coordinates.active?.definition ?? null,
      });
      const validation = validateRecordDefinitionForPublication({
        brandId: coordinates.brandId,
        recordTypeKey: coordinates.recordTypeKey,
        draftVersion,
        activeRevisionNumber: coordinates.active?.revisionNumber ?? null,
        definition,
        actionRegistry: authority.actionRegistry,
        roles: authority.roles,
        administrativeRole: 'Admin',
        forms: authority.forms,
        availableRecordTypeKeys: authority.availableRecordTypeKeys,
        storageCapabilityProvider: authority.storageCapabilityProvider,
        activeDefinition: coordinates.active?.definition ?? null,
        stageReferences: authority.stageReferences,
      });
      const report = scopedValidationReport(validation.report, scope);
      if (!validation.ok) {
        return lifecycleError(
          'publication-validation-failed',
          scope === 'rollback'
            ? 'The historical revision is not safe to publish under the current authority.'
            : 'The shared draft is not safe to publish.',
          report,
          validation.impact
        );
      }
      return Object.freeze({
        definition: validation.definition,
        canonicalHash: validation.canonicalHash,
        actionContracts: validation.actionContracts,
        validation: report,
        impact: validation.impact,
      });
    }

    private async nextRevisionNumber(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey
    ): Promise<number> {
      const query = (
        RecordDefinitionRevision.find({
          branding: brandId,
          recordType: storedDataProperty(identity, 'id'),
          recordTypeId: storedDataProperty(identity, 'definitionId'),
          recordTypeKey,
        }) as object as BoundedFindQuery<RecordDefinitionRevisionAttributes[]>
      )
        .sort('revisionNumber DESC')
        .limit(1);
      const rows = await query;
      if (rows.length === 0) return 1;
      const latest = positiveRevision(storedDataProperty(projectRevisionRow(rows[0]), 'revisionNumber'));
      if (latest >= RECORD_DEFINITION_REVISION_NUMBER_MAX) {
        return lifecycleError('revision-limit-reached', 'The record-definition revision limit has been reached.');
      }
      return latest + 1;
    }

    private newRevisionOperation(
      kind: 'publish' | 'rollback',
      coordinates: PublicationCoordinates,
      expectedIdentityVersion: number,
      expectedDraftVersion: number | null,
      targetRevisionNumber: number,
      canonicalHash: RecordDefinitionCanonicalHash,
      source: RecordDefinitionRevisionSourceDto,
      actor: RecordDefinitionActorDto,
      note?: string
    ): RecordDefinitionRevisionLifecycleOperation {
      const token = randomUUID();
      return Object.freeze({
        token,
        kind,
        phase: 'reserved',
        expectedIdentityVersion,
        identityVersion: expectedIdentityVersion + 1,
        expectedDraftVersion,
        expectedActiveRevisionNumber: coordinates.active?.revisionNumber ?? null,
        historyId: `rdh_${token.replace(/-/gu, '')}`,
        occurredAt: new Date().toISOString(),
        actor,
        ...(note === undefined ? {} : { note }),
        targetRevisionId: deriveRecordDefinitionRevisionId(coordinates, targetRevisionNumber),
        targetRevisionNumber,
        canonicalHash,
        source,
      });
    }

    private newRetirementOperation(
      kind: 'retire' | 'unretire',
      coordinates: PublicationCoordinates,
      expectedIdentityVersion: number,
      actor: RecordDefinitionActorDto,
      note?: string
    ): RecordDefinitionRetirementLifecycleOperation {
      const token = randomUUID();
      return Object.freeze({
        token,
        kind,
        phase: 'reserved',
        expectedIdentityVersion,
        identityVersion: expectedIdentityVersion + 1,
        expectedDraftVersion: null,
        expectedActiveRevisionNumber: coordinates.active?.revisionNumber ?? null,
        historyId: `rdh_${token.replace(/-/gu, '')}`,
        occurredAt: new Date().toISOString(),
        actor,
        ...(note === undefined ? {} : { note }),
      });
    }

    private async reserve(
      coordinates: PublicationCoordinates,
      operation: RecordDefinitionLifecycleOperation
    ): Promise<RecordTypeAttributes | null> {
      await this.ensurePublicationIndexes();
      const activeId = coordinates.active?.id ?? null;
      try {
        await this.identityMongoCollection().updateOne(
          {
            name: coordinates.recordTypeKey,
            definitionId: storedDataProperty(coordinates.identity, 'definitionId'),
            draftId: storedRelationId(coordinates.identity, 'draftId'),
            activeRevisionId: activeId,
            activeRevisionNumber: operation.expectedActiveRevisionNumber,
            version: operation.expectedIdentityVersion,
            secretMutationToken: null,
            draftLifecycleToken: null,
            draftLifecycleKind: null,
            draftLifecycleOperation: null,
            definitionLifecycleToken: null,
            definitionLifecycleOperation: null,
            recordCreationToken: null,
          },
          {
            $set: {
              version: operation.identityVersion,
              updatedAt: new Date(),
              updatedBy: operation.actor,
              definitionLifecycleToken: operation.token,
              definitionLifecycleOperation: operation,
            },
          }
        );
      } catch {
        // The identity reservation may have committed before its acknowledgement was lost.
      }
      const current = await this.findIdentity(coordinates.brandId, coordinates.recordTypeKey);
      if (current === null) {
        return lifecycleError('storage-consistency-error', 'The reserved record type disappeared unexpectedly.');
      }
      const currentOperation = lifecycleOperation(current, coordinates.brandId, coordinates.recordTypeKey);
      if (currentOperation?.token === operation.token) return current;
      if (currentOperation !== null) {
        await this.completeOperation(current, coordinates.brandId, coordinates.recordTypeKey, currentOperation);
      }
      return null;
    }

    private revisionCreateValues(
      identity: RecordTypeAttributes,
      operation: RecordDefinitionRevisionLifecycleOperation,
      artifacts: ValidPublicationArtifacts
    ): RecordDefinitionRevisionAttributes {
      return {
        id: operation.targetRevisionId,
        schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
        branding: storedRelationId(identity, 'branding') as string,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(
          identity,
          'definitionId'
        ) as RecordDefinitionRevisionAttributes['recordTypeId'],
        recordTypeKey: storedDataProperty(identity, 'name') as RecordDefinitionKey,
        revisionNumber: operation.targetRevisionNumber,
        canonicalHash: operation.canonicalHash,
        definition: artifacts.definition,
        actionContracts: artifacts.actionContracts,
        source: operation.source,
        ...(operation.note === undefined ? {} : { publicationNote: operation.note }),
        publishedAt: operation.occurredAt,
        publishedBy: operation.actor,
        createdBy: operation.actor,
      };
    }

    private async ensureRevision(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionRevisionLifecycleOperation,
      artifacts: ValidPublicationArtifacts
    ): Promise<RecordDefinitionRevisionDto> {
      const values = this.revisionCreateValues(identity, operation, artifacts);
      const query = RecordDefinitionRevision.create(
        values
      ).fetch() as object as ExecutableQuery<RecordDefinitionRevisionAttributes>;
      try {
        await this.execute(query);
      } catch {
        // A unique immutable revision may already exist or its acknowledgement may have been lost.
      }
      const revision = await this.findRevision(identity, brandId, recordTypeKey, operation.targetRevisionNumber);
      if (
        revision === null ||
        revision.id !== operation.targetRevisionId ||
        revision.canonicalHash !== operation.canonicalHash ||
        revision.source.operation !== operation.source.operation ||
        revision.source.sourceRevisionNumber !== operation.source.sourceRevisionNumber ||
        revision.publishedAt !== operation.occurredAt ||
        !isDeepStrictEqual(revision.publishedBy, operation.actor) ||
        !isDeepStrictEqual(revision.definition, artifacts.definition) ||
        !isDeepStrictEqual(revision.actionContracts, artifacts.actionContracts)
      ) {
        return lifecycleError('storage-consistency-error', 'The immutable publication revision is unavailable.');
      }
      return revision;
    }

    private historyCreateValues(
      identity: RecordTypeAttributes,
      operation: RecordDefinitionLifecycleOperation,
      revision: RecordDefinitionRevisionDto | null,
      validation?: RecordDefinitionValidationReportDto,
      impact?: RecordDefinitionImpactReportDto
    ): RecordDefinitionHistoryAttributes {
      const retirementChange: RecordDefinitionStructuralChangeDto = Object.freeze({
        path: '/retirement',
        kind: operation.kind === 'retire' ? 'added' : 'removed',
      });
      return {
        id: operation.historyId,
        schemaVersion: RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
        branding: storedRelationId(identity, 'branding') as string,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId') as RecordDefinitionHistoryAttributes['recordTypeId'],
        recordTypeKey: storedDataProperty(identity, 'name') as RecordDefinitionKey,
        operation: operation.kind,
        operationId: operation.token,
        expectedIdentityVersion: operation.expectedIdentityVersion,
        resultingIdentityVersion: operation.identityVersion,
        expectedDraftVersion: operation.expectedDraftVersion,
        expectedActiveRevisionNumber: operation.expectedActiveRevisionNumber,
        revision: revision?.id ?? null,
        revisionNumber: revision?.revisionNumber ?? null,
        canonicalHash: revision?.canonicalHash ?? null,
        ...(revision === null ? {} : { source: revision.source }),
        occurredAt: operation.occurredAt,
        actor: operation.actor,
        ...(operation.note === undefined ? {} : { note: operation.note }),
        ...(validation === undefined ? {} : { validation }),
        ...(impact === undefined ? {} : { impact }),
        changes: impact?.changes ?? Object.freeze([retirementChange]),
        redactions: impact?.redactions ?? Object.freeze([]),
        truncated: impact?.truncated ?? false,
      };
    }

    private historyMatchesOperation(
      identity: RecordTypeAttributes,
      row: RecordDefinitionHistoryAttributes,
      operation: RecordDefinitionLifecycleOperation,
      revision: RecordDefinitionRevisionDto | null,
      validation?: RecordDefinitionValidationReportDto,
      impact?: RecordDefinitionImpactReportDto
    ): boolean {
      const expected = this.historyCreateValues(identity, operation, revision, validation, impact);
      const storedNote = row.note === '' ? undefined : row.note;
      const storedSource = row.source ?? undefined;
      const storedValidation = row.validation ?? undefined;
      const storedImpact = row.impact ?? undefined;
      return (
        row.id === expected.id &&
        row.operation === expected.operation &&
        row.operationId === expected.operationId &&
        row.expectedIdentityVersion === expected.expectedIdentityVersion &&
        row.resultingIdentityVersion === expected.resultingIdentityVersion &&
        row.expectedDraftVersion === expected.expectedDraftVersion &&
        row.expectedActiveRevisionNumber === expected.expectedActiveRevisionNumber &&
        storedRelationId(row, 'revision') === relationId(expected.revision as RuntimeValue) &&
        row.revisionNumber === expected.revisionNumber &&
        row.canonicalHash === expected.canonicalHash &&
        safelyEqualStoredJson(storedSource as RuntimeValue, expected.source as RuntimeValue) &&
        timestamp(row.occurredAt) === operation.occurredAt &&
        safelyEqualStoredJson(row.actor, expected.actor) &&
        storedNote === expected.note &&
        safelyEqualStoredJson(storedValidation as RuntimeValue, expected.validation as RuntimeValue) &&
        safelyEqualStoredJson(storedImpact as RuntimeValue, expected.impact as RuntimeValue) &&
        safelyEqualStoredJson(row.changes as RuntimeValue, expected.changes as RuntimeValue) &&
        safelyEqualStoredJson(row.redactions as RuntimeValue, expected.redactions as RuntimeValue) &&
        row.truncated === expected.truncated
      );
    }

    private async ensureHistory(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionLifecycleOperation,
      revision: RecordDefinitionRevisionDto | null,
      validation?: RecordDefinitionValidationReportDto,
      impact?: RecordDefinitionImpactReportDto
    ): Promise<RecordDefinitionHistoryAttributes> {
      const values = this.historyCreateValues(identity, operation, revision, validation, impact);
      const query = RecordDefinitionHistory.create(
        values
      ).fetch() as object as ExecutableQuery<RecordDefinitionHistoryAttributes>;
      try {
        await this.execute(query);
      } catch {
        // The immutable history row may already exist or its acknowledgement may have been lost.
      }
      const stored = await this.findHistoryById(identity, brandId, recordTypeKey, operation.historyId);
      if (stored === null || !this.historyMatchesOperation(identity, stored, operation, revision, validation, impact)) {
        return lifecycleError('storage-consistency-error', 'Durable publication history could not be confirmed.');
      }
      return stored;
    }

    private async publicationArtifacts(
      coordinates: PublicationCoordinates,
      operation: RecordDefinitionRevisionLifecycleOperation
    ): Promise<ValidPublicationArtifacts> {
      let definition: DraftRecordDefinitionAggregateDto;
      let draftVersion: number;
      if (operation.kind === 'publish') {
        if (coordinates.draft === null || coordinates.draft.version !== operation.expectedDraftVersion) {
          return lifecycleError('storage-consistency-error', 'The reserved shared draft changed unexpectedly.');
        }
        definition = coordinates.draft.definition;
        draftVersion = coordinates.draft.version;
      } else {
        const sourceRevision = await this.findRevision(
          coordinates.identity,
          coordinates.brandId,
          coordinates.recordTypeKey,
          positiveRevision(operation.source.sourceRevisionNumber)
        );
        if (sourceRevision === null) {
          return lifecycleError('revision-not-found', 'The rollback source revision was not found.');
        }
        definition = draftDefinitionFromPublished(sourceRevision.definition);
        draftVersion = coordinates.draft?.version ?? 0;
      }
      const validated = await this.validate(
        coordinates,
        definition,
        draftVersion,
        operation.kind === 'rollback' ? 'rollback' : 'publication'
      );
      if (validated.canonicalHash !== operation.canonicalHash) {
        return lifecycleError('storage-consistency-error', 'The reserved publication definition changed unexpectedly.');
      }
      return validated;
    }

    private async activateRevision(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionRevisionLifecycleOperation
    ): Promise<RecordTypeAttributes> {
      const activated: RecordDefinitionRevisionLifecycleOperation = Object.freeze({ ...operation, phase: 'activated' });
      const expectedActiveId =
        operation.expectedActiveRevisionNumber === null
          ? null
          : deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, operation.expectedActiveRevisionNumber);
      try {
        await this.identityMongoCollection().updateOne(
          {
            name: recordTypeKey,
            definitionId: storedDataProperty(identity, 'definitionId'),
            activeRevisionId: expectedActiveId,
            activeRevisionNumber: operation.expectedActiveRevisionNumber,
            version: operation.identityVersion,
            secretMutationToken: null,
            draftLifecycleToken: null,
            definitionLifecycleToken: operation.token,
            recordCreationToken: null,
          },
          {
            $set: {
              activeRevisionId: operation.targetRevisionId,
              activeRevisionNumber: operation.targetRevisionNumber,
              updatedAt: new Date(),
              updatedBy: operation.actor,
              definitionLifecycleOperation: activated,
            },
          }
        );
      } catch {
        // The active-pointer CAS may have committed before its acknowledgement was lost.
      }
      activeRecordDefinitions().invalidate(brandId, recordTypeKey);
      const current = await this.findIdentity(brandId, recordTypeKey);
      if (current === null) {
        return lifecycleError('storage-consistency-error', 'The activated record type disappeared unexpectedly.');
      }
      const currentOperation = lifecycleOperation(current, brandId, recordTypeKey);
      if (
        currentOperation?.token === operation.token &&
        currentOperation.phase === 'activated' &&
        activeRevisionNumber(current, brandId, recordTypeKey) === operation.targetRevisionNumber
      ) {
        return current;
      }
      const acknowledgement = await this.findAck(identity, brandId, recordTypeKey, activated);
      if (acknowledgement !== null) return current;
      return lifecycleError('storage-consistency-error', 'The active revision could not be changed safely.');
    }

    private async activateRetirement(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionRetirementLifecycleOperation
    ): Promise<RecordTypeAttributes> {
      const activated: RecordDefinitionRetirementLifecycleOperation = Object.freeze({
        ...operation,
        phase: 'activated',
      });
      const expectedRetired = operation.kind === 'retire' ? null : storedDataProperty(identity, 'retiredAt');
      try {
        await this.identityMongoCollection().updateOne(
          {
            name: recordTypeKey,
            definitionId: storedDataProperty(identity, 'definitionId'),
            activeRevisionNumber: operation.expectedActiveRevisionNumber,
            version: operation.identityVersion,
            retiredAt: expectedRetired,
            secretMutationToken: null,
            draftLifecycleToken: null,
            definitionLifecycleToken: operation.token,
            recordCreationToken: null,
          },
          {
            $set: {
              retiredAt: operation.kind === 'retire' ? operation.occurredAt : null,
              retiredBy: operation.kind === 'retire' ? operation.actor : null,
              retirementReason: operation.kind === 'retire' ? (operation.note ?? null) : null,
              updatedAt: new Date(),
              updatedBy: operation.actor,
              definitionLifecycleOperation: activated,
            },
          }
        );
      } catch {
        // The retirement CAS may have committed before its acknowledgement was lost.
      }
      const current = await this.findIdentity(brandId, recordTypeKey);
      if (current === null) {
        return lifecycleError('storage-consistency-error', 'The retired record type disappeared unexpectedly.');
      }
      const currentOperation = lifecycleOperation(current, brandId, recordTypeKey);
      const isRetired = storedDataProperty(current, 'retiredAt') != null;
      if (
        currentOperation?.token === operation.token &&
        currentOperation.phase === 'activated' &&
        isRetired === (operation.kind === 'retire')
      ) {
        return current;
      }
      const acknowledgement = await this.findAck(identity, brandId, recordTypeKey, activated);
      if (acknowledgement !== null) return current;
      return lifecycleError('storage-consistency-error', 'The retirement state could not be changed safely.');
    }

    private async findAck(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionLifecycleOperation
    ): Promise<RecordDefinitionLifecycleOperationAckAttributes | null> {
      const query = RecordDefinitionLifecycleOperationAck.findOne({
        id: operation.token,
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
        kind: operation.kind,
        identityVersion: operation.identityVersion,
        historyId: operation.historyId,
        revisionNumber:
          operation.kind === 'publish' || operation.kind === 'rollback' ? operation.targetRevisionNumber : null,
      }) as object as ExecutableQuery<RecordDefinitionLifecycleOperationAckAttributes | null | undefined>;
      const rowValue = await this.execute(query);
      if (rowValue === null || rowValue === undefined) return null;
      const row = projectAckRow(rowValue);
      const expiry = storedDataProperty(row, 'expiresAt');
      const inspectedIdentity = recordTypeIdentitySchema.safeParse(storedDataProperty(row, 'identity'));
      const storedOperation = storedDataProperty(row, 'operation');
      if (
        storedDataProperty(row, 'id') !== operation.token ||
        storedRelationId(row, 'branding') !== brandId ||
        storedRelationId(row, 'recordType') !== storedDataProperty(identity, 'id') ||
        storedDataProperty(row, 'recordTypeId') !== storedDataProperty(identity, 'definitionId') ||
        storedDataProperty(row, 'recordTypeKey') !== recordTypeKey ||
        storedDataProperty(row, 'kind') !== operation.kind ||
        storedDataProperty(row, 'identityVersion') !== operation.identityVersion ||
        storedDataProperty(row, 'historyId') !== operation.historyId ||
        storedDataProperty(row, 'revisionNumber') !==
          (isRevisionOperation(operation) ? operation.targetRevisionNumber : null) ||
        !safelyEqualStoredJson(storedOperation as RuntimeValue, operation) ||
        !(expiry instanceof Date) ||
        !Number.isFinite(expiry.getTime()) ||
        expiry.getTime() <= Date.now() ||
        !inspectedIdentity.success ||
        inspectedIdentity.data.id !== storedDataProperty(identity, 'definitionId') ||
        inspectedIdentity.data.brandId !== brandId ||
        inspectedIdentity.data.key !== recordTypeKey ||
        inspectedIdentity.data.version !== operation.identityVersion
      ) {
        return lifecycleError('storage-consistency-error', 'Stored publication acknowledgement is invalid.');
      }
      const authoritativeIdentity = await this.findIdentity(brandId, recordTypeKey);
      if (
        authoritativeIdentity === null ||
        nonNegativeVersion(storedDataProperty(authoritativeIdentity, 'version') ?? 0) !== operation.identityVersion
      ) {
        return lifecycleError('storage-consistency-error', 'Stored publication acknowledgement is invalid.');
      }
      const draft = await this.findDraft(authoritativeIdentity, brandId, recordTypeKey);
      const active = await this.activeRevision(authoritativeIdentity, brandId, recordTypeKey);
      const expectedIdentity = this.identityDto(authoritativeIdentity, brandId, recordTypeKey, draft, active);
      if (!isDeepStrictEqual(inspectedIdentity.data, expectedIdentity)) {
        return lifecycleError('storage-consistency-error', 'Stored publication acknowledgement is invalid.');
      }
      const history = await this.findHistoryById(authoritativeIdentity, brandId, recordTypeKey, operation.historyId);
      if (history === null) {
        return lifecycleError('storage-consistency-error', 'Stored publication acknowledgement is invalid.');
      }
      if (isRevisionOperation(operation)) {
        const revision = await this.findRevision(
          authoritativeIdentity,
          brandId,
          recordTypeKey,
          operation.targetRevisionNumber
        );
        const validation = storedDataProperty(history, 'validation');
        const impact = storedDataProperty(history, 'impact');
        if (
          revision === null ||
          validation === undefined ||
          impact === undefined ||
          !recordDefinitionValidationReportSchema.safeParse(validation).success ||
          !recordDefinitionImpactReportSchema.safeParse(impact).success ||
          !this.historyMatchesOperation(authoritativeIdentity, history, operation, revision, validation, impact)
        ) {
          return lifecycleError('storage-consistency-error', 'Stored publication acknowledgement is invalid.');
        }
      } else if (!this.historyMatchesOperation(authoritativeIdentity, history, operation, null)) {
        return lifecycleError('storage-consistency-error', 'Stored publication acknowledgement is invalid.');
      }
      return Object.freeze({
        ...row,
        identity: immutableValue(inspectedIdentity.data) as RecordTypeIdentityDto,
        operation: immutableValue(operation) as RecordDefinitionLifecycleOperation,
      });
    }

    private async persistAck(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionLifecycleOperation
    ): Promise<RecordDefinitionLifecycleOperationAckAttributes> {
      const existing = await this.findAck(identity, brandId, recordTypeKey, operation);
      if (existing !== null) return existing;
      const draft = await this.findDraft(identity, brandId, recordTypeKey);
      const active = await this.activeRevision(identity, brandId, recordTypeKey);
      const snapshot = this.identityDto(identity, brandId, recordTypeKey, draft, active);
      const revisionNumber =
        operation.kind === 'publish' || operation.kind === 'rollback' ? operation.targetRevisionNumber : null;
      const query = RecordDefinitionLifecycleOperationAck.create({
        id: operation.token,
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
        kind: operation.kind,
        identityVersion: operation.identityVersion,
        historyId: operation.historyId,
        revisionNumber,
        identity: snapshot,
        operation,
        expiresAt: new Date(Date.now() + ACK_RETENTION_MS),
      }).fetch() as object as ExecutableQuery<RecordDefinitionLifecycleOperationAckAttributes>;
      try {
        await this.execute(query);
      } catch {
        // A durable acknowledgement may already exist or its create acknowledgement may have been lost.
      }
      const acknowledgement = await this.findAck(identity, brandId, recordTypeKey, operation);
      if (acknowledgement === null) {
        return lifecycleError('storage-consistency-error', 'The lifecycle completion could not be acknowledged.');
      }
      return acknowledgement;
    }

    private identityMongoCollection(): PublicationMongoCollection {
      const manager = RecordType.getDatastore().manager as object as PublicationMongoManager;
      if (manager === null || typeof manager !== 'object' || typeof manager.collection !== 'function') {
        return lifecycleError('storage-consistency-error', 'Publication identity storage is unavailable.');
      }
      const collection = manager.collection('recordtype');
      if (
        collection === null ||
        typeof collection !== 'object' ||
        typeof collection.findOne !== 'function' ||
        typeof collection.updateOne !== 'function'
      ) {
        return lifecycleError('storage-consistency-error', 'Publication identity storage is unavailable.');
      }
      return collection;
    }

    private async rawIdentityLifecycleState(
      identity: RecordTypeAttributes,
      recordTypeKey: RecordDefinitionKey
    ): Promise<PublicationMongoIdentityRow> {
      const definitionId = storedDataProperty(identity, 'definitionId');
      const row = await this.identityMongoCollection().findOne({ definitionId, name: recordTypeKey });
      if (
        row === null ||
        storedDataProperty(row, 'definitionId') !== definitionId ||
        storedDataProperty(row, 'name') !== recordTypeKey
      ) {
        return lifecycleError('storage-consistency-error', 'The completed record type disappeared unexpectedly.');
      }
      return row;
    }

    private rawLifecycleNamespacesAreClear(row: PublicationMongoIdentityRow): boolean {
      return (
        storedDataProperty(row, 'definitionLifecycleToken') === null &&
        storedDataProperty(row, 'definitionLifecycleOperation') === null &&
        storedDataProperty(row, 'draftLifecycleToken') === null &&
        storedDataProperty(row, 'draftLifecycleKind') === null &&
        storedDataProperty(row, 'draftLifecycleOperation') === null
      );
    }

    private async clearOperation(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionLifecycleOperation
    ): Promise<void> {
      const definitionId = storedDataProperty(identity, 'definitionId');
      const identityCollection = this.identityMongoCollection();
      for (let attempt = 0; attempt < OPERATION_CLEAR_RECONCILIATION_ATTEMPTS; attempt += 1) {
        try {
          await identityCollection.updateOne(
            {
              definitionId,
              name: recordTypeKey,
              version: operation.identityVersion,
              secretMutationToken: null,
              draftLifecycleToken: null,
              definitionLifecycleToken: operation.token,
            },
            { $set: { definitionLifecycleToken: null, definitionLifecycleOperation: null } }
          );
        } catch {
          // The durable acknowledgement makes the token-owned clear safe to retry.
        }
        const rawIdentity = await this.rawIdentityLifecycleState(identity, recordTypeKey);
        const rawVersion = nonNegativeVersion(storedDataProperty(rawIdentity, 'version') ?? 0);
        if (rawVersion < operation.identityVersion) {
          return lifecycleError('storage-consistency-error', 'The completed record type changed unexpectedly.');
        }
        if (this.rawLifecycleNamespacesAreClear(rawIdentity)) return;
        if (attempt + 1 < OPERATION_CLEAR_RECONCILIATION_ATTEMPTS) {
          await new Promise<void>(resolve => setImmediate(resolve));
        }
      }
      return lifecycleError('storage-consistency-error', 'The completed lifecycle fences could not be cleared.');
    }

    private publicationResult(
      acknowledgement: RecordDefinitionLifecycleOperationAckAttributes,
      artifacts: RevisionOperationArtifacts
    ): RecordDefinitionPublicationApplied {
      return Object.freeze({
        ok: true,
        identity: immutableValue(acknowledgement.identity) as RecordTypeIdentityDto,
        revision: artifacts.revision,
        history: artifacts.history,
        validation: artifacts.validation,
        impact: artifacts.impact,
      });
    }

    private async completeRevisionOperation(
      identityValue: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operationValue: RecordDefinitionRevisionLifecycleOperation
    ): Promise<RecordDefinitionPublicationApplied> {
      let identity = identityValue;
      let operation = operationValue;
      const coordinates: PublicationCoordinates = Object.freeze({
        brandId,
        recordTypeKey,
        identity,
        draft: await this.findDraft(identity, brandId, recordTypeKey),
        active: await this.activeRevision(identity, brandId, recordTypeKey),
      });
      if (operation.phase === 'activated') {
        activeRecordDefinitions().invalidate(brandId, recordTypeKey);
        const acknowledgement = await this.findAck(identity, brandId, recordTypeKey, operation);
        const revision = await this.findRevision(identity, brandId, recordTypeKey, operation.targetRevisionNumber);
        const history = await this.findRevisionHistory(
          identity,
          brandId,
          recordTypeKey,
          operation.targetRevisionNumber
        );
        const validation = history?.row.validation;
        const impact = history?.row.impact;
        if (
          revision === null ||
          history === null ||
          history.row.id !== operation.historyId ||
          validation === undefined ||
          impact === undefined ||
          !this.historyMatchesOperation(identity, history.row, operation, revision, validation, impact)
        ) {
          return lifecycleError('storage-consistency-error', 'Activated publication evidence is incomplete.');
        }
        const completedAck = acknowledgement ?? (await this.persistAck(identity, brandId, recordTypeKey, operation));
        await this.clearOperation(identity, brandId, recordTypeKey, operation);
        return this.publicationResult(completedAck, {
          definition: revision.definition,
          canonicalHash: revision.canonicalHash,
          actionContracts: revision.actionContracts,
          revision,
          historyRow: history.row,
          history: history.summary,
          validation,
          impact,
        });
      }

      const validated = await this.publicationArtifacts(coordinates, operation);
      const revision = await this.ensureRevision(identity, brandId, recordTypeKey, operation, validated);
      const historyRow = await this.ensureHistory(
        identity,
        brandId,
        recordTypeKey,
        operation,
        revision,
        validated.validation,
        validated.impact
      );
      identity = await this.activateRevision(identity, brandId, recordTypeKey, operation);
      const activatedOperation = lifecycleOperation(identity, brandId, recordTypeKey);
      if (
        activatedOperation === null ||
        activatedOperation.token !== operation.token ||
        (activatedOperation.kind !== 'publish' && activatedOperation.kind !== 'rollback') ||
        activatedOperation.phase !== 'activated'
      ) {
        const acknowledgedOperation: RecordDefinitionRevisionLifecycleOperation = Object.freeze({
          ...operation,
          phase: 'activated',
        });
        const acknowledgement = await this.findAck(identity, brandId, recordTypeKey, acknowledgedOperation);
        if (acknowledgement === null) {
          return lifecycleError('storage-consistency-error', 'Publication activation could not be recovered.');
        }
        await this.clearOperation(identity, brandId, recordTypeKey, acknowledgedOperation);
        const history = this.historyMetadata(historyRow, identity, brandId, recordTypeKey);
        return this.publicationResult(acknowledgement, {
          ...validated,
          revision,
          historyRow,
          history: history.summary,
        });
      }
      operation = activatedOperation;
      const acknowledgement = await this.persistAck(identity, brandId, recordTypeKey, operation);
      await this.clearOperation(identity, brandId, recordTypeKey, operation);
      const history = this.historyMetadata(historyRow, identity, brandId, recordTypeKey);
      return this.publicationResult(acknowledgement, {
        ...validated,
        revision,
        historyRow,
        history: history.summary,
      });
    }

    private async completeRetirementOperation(
      identityValue: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operationValue: RecordDefinitionRetirementLifecycleOperation
    ): Promise<RecordDefinitionRetirementApplied> {
      let identity = identityValue;
      let operation = operationValue;
      if (operation.phase === 'reserved') {
        await this.ensureHistory(identity, brandId, recordTypeKey, operation, null);
        identity = await this.activateRetirement(identity, brandId, recordTypeKey, operation);
        const activated = lifecycleOperation(identity, brandId, recordTypeKey);
        if (
          activated === null ||
          activated.token !== operation.token ||
          (activated.kind !== 'retire' && activated.kind !== 'unretire') ||
          activated.phase !== 'activated'
        ) {
          const acknowledgedOperation: RecordDefinitionRetirementLifecycleOperation = Object.freeze({
            ...operation,
            phase: 'activated',
          });
          const acknowledgement = await this.findAck(identity, brandId, recordTypeKey, acknowledgedOperation);
          if (acknowledgement === null) {
            return lifecycleError('storage-consistency-error', 'Retirement activation could not be recovered.');
          }
          await this.clearOperation(identity, brandId, recordTypeKey, acknowledgedOperation);
          return Object.freeze({ ok: true, identity: acknowledgement.identity, historyId: operation.historyId });
        }
        operation = activated;
      }
      const history = await this.findHistoryById(identity, brandId, recordTypeKey, operation.historyId);
      if (history === null || !this.historyMatchesOperation(identity, history, operation, null)) {
        return lifecycleError('storage-consistency-error', 'Activated retirement history is incomplete.');
      }
      const acknowledgement = await this.persistAck(identity, brandId, recordTypeKey, operation);
      await this.clearOperation(identity, brandId, recordTypeKey, operation);
      return Object.freeze({ ok: true, identity: acknowledgement.identity, historyId: operation.historyId });
    }

    private async completeOperation(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionLifecycleOperation
    ): Promise<RecordDefinitionPublicationApplied | RecordDefinitionRetirementApplied> {
      return isRevisionOperation(operation)
        ? this.completeRevisionOperation(identity, brandId, recordTypeKey, operation)
        : this.completeRetirementOperation(identity, brandId, recordTypeKey, operation);
    }

    private async settleIdentity(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey
    ): Promise<RecordTypeAttributes> {
      const operation = lifecycleOperation(identity, brandId, recordTypeKey);
      if (operation === null) return identity;
      await this.completeOperation(identity, brandId, recordTypeKey, operation);
      const settled = await this.findIdentity(brandId, recordTypeKey);
      if (settled === null || lifecycleOperation(settled, brandId, recordTypeKey) !== null) {
        return lifecycleError('storage-consistency-error', 'The definition lifecycle operation is still settling.');
      }
      return settled;
    }

    private async boundedLifecycleOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
      try {
        return await operation();
      } catch (error) {
        return normalizePublicLifecycleError(error as RuntimeValue);
      }
    }

    public async validateDraft(
      brandIdValue: string,
      recordTypeKeyValue: string,
      requestValue: RecordDefinitionPublicationRequestDto
    ): Promise<RecordDefinitionValidationPreview | RecordDefinitionPublicationConflict> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        const inspected = recordDefinitionPublicationRequestSchema.safeParse(requestValue);
        if (!inspected.success) return lifecycleError('invalid-publication-request', 'Invalid validation request.');
        const request = inspected.data;
        const coordinates = await this.coordinates(brandId, recordTypeKey);
        const conflict = this.currentConflict(
          coordinates,
          request.expectedIdentityVersion,
          request.expectedDraftVersion,
          request.expectedActiveRevisionNumber
        );
        if (conflict !== null) return conflict;
        if (coordinates.draft === null) return lifecycleError('draft-not-found', 'The shared draft was not found.');
        const result = await this.validate(
          coordinates,
          coordinates.draft.definition,
          coordinates.draft.version,
          'publication'
        );
        return Object.freeze({ ok: true, validation: result.validation, impact: result.impact });
      });
    }

    public async publish(
      brandIdValue: string,
      recordTypeKeyValue: string,
      requestValue: RecordDefinitionPublicationRequestDto,
      actorValue: RecordDefinitionActorDto
    ): Promise<RecordDefinitionPublicationResult> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        const actor = parseActor(actorValue);
        const inspectedRequest = recordDefinitionPublicationRequestSchema.safeParse(requestValue);
        if (!inspectedRequest.success) {
          return lifecycleError('invalid-publication-request', 'The publication request is invalid.');
        }
        const request = inspectedRequest.data;
        const coordinates = await this.coordinates(brandId, recordTypeKey);
        const existingConflict = this.currentConflict(
          coordinates,
          request.expectedIdentityVersion,
          request.expectedDraftVersion,
          request.expectedActiveRevisionNumber
        );
        if (existingConflict !== null) return existingConflict;
        if (coordinates.draft === null)
          return lifecycleError('draft-not-found', 'The record type has no shared draft.');
        if (storedDataProperty(coordinates.identity, 'retiredAt') != null) {
          return lifecycleError('record-type-retired', 'A retired record type cannot be published.');
        }
        const validated = await this.validate(
          coordinates,
          coordinates.draft.definition,
          coordinates.draft.version,
          'publication'
        );
        const targetRevisionNumber = await this.nextRevisionNumber(coordinates.identity, brandId, recordTypeKey);
        const operation = this.newRevisionOperation(
          'publish',
          coordinates,
          request.expectedIdentityVersion,
          request.expectedDraftVersion,
          targetRevisionNumber,
          validated.canonicalHash,
          { operation: 'publish', sourceRevisionNumber: request.expectedActiveRevisionNumber },
          actor,
          request.publicationNote
        );
        const reserved = await this.reserve(coordinates, operation);
        if (reserved === null) {
          const current = await this.coordinates(brandId, recordTypeKey);
          return (
            this.currentConflict(
              current,
              request.expectedIdentityVersion,
              request.expectedDraftVersion,
              request.expectedActiveRevisionNumber
            ) ?? lifecycleError('storage-consistency-error', 'The publication reservation could not be resolved.')
          );
        }
        return this.completeRevisionOperation(reserved, brandId, recordTypeKey, operation);
      });
    }

    public async listHistory(
      brandIdValue: string,
      recordTypeKeyValue: string,
      limitValue: number = HISTORY_LIST_DEFAULT
    ): Promise<readonly RecordDefinitionHistorySummaryDto[]> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        if (!Number.isSafeInteger(limitValue) || limitValue < 1 || limitValue > RECORD_DEFINITION_HISTORY_LIST_MAX) {
          return lifecycleError('invalid-history-request', 'The history list bound is invalid.');
        }
        const identityValue = await this.findIdentity(brandId, recordTypeKey);
        if (identityValue === null) return lifecycleError('record-type-not-found', 'The record type was not found.');
        const identity = await this.settleIdentity(identityValue, brandId, recordTypeKey);
        const query = (
          RecordDefinitionHistory.find({
            branding: brandId,
            recordType: storedDataProperty(identity, 'id'),
            recordTypeId: storedDataProperty(identity, 'definitionId'),
            recordTypeKey,
            operation: { in: REVISION_HISTORY_OPERATIONS },
          }) as object as BoundedFindQuery<RecordDefinitionHistoryAttributes[]>
        )
          .sort('revisionNumber DESC')
          .limit(limitValue);
        const rows = await query;
        const summaries: RecordDefinitionHistorySummaryDto[] = [];
        for (const row of rows) {
          summaries.push(await this.validatedRevisionHistorySummary(row, identity, brandId, recordTypeKey));
        }
        return Object.freeze(summaries);
      });
    }

    public async getRevision(
      brandIdValue: string,
      recordTypeKeyValue: string,
      revisionNumberValue: number
    ): Promise<RecordDefinitionRevisionHistoryEntry | null> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        if (
          !Number.isSafeInteger(revisionNumberValue) ||
          revisionNumberValue < 1 ||
          revisionNumberValue > RECORD_DEFINITION_REVISION_NUMBER_MAX
        ) {
          return lifecycleError('invalid-history-request', 'The history revision number is invalid.');
        }
        const identityValue = await this.findIdentity(brandId, recordTypeKey);
        if (identityValue === null) return null;
        const identity = await this.settleIdentity(identityValue, brandId, recordTypeKey);
        const revision = await this.findRevision(identity, brandId, recordTypeKey, revisionNumberValue);
        if (revision === null) return null;
        const historyRow = await this.findRevisionHistory(identity, brandId, recordTypeKey, revisionNumberValue);
        if (historyRow === null) {
          return lifecycleError('storage-consistency-error', 'The immutable revision has no durable history.');
        }
        const history = await this.validatedRevisionHistorySummary(
          historyRow.row,
          identity,
          brandId,
          recordTypeKey,
          revision
        );
        return Object.freeze({ revision, history });
      });
    }

    public async rollback(
      brandIdValue: string,
      recordTypeKeyValue: string,
      requestValue: RecordDefinitionRollbackRequestDto,
      actorValue: RecordDefinitionActorDto
    ): Promise<RecordDefinitionPublicationResult> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        const actor = parseActor(actorValue);
        const inspectedRequest = recordDefinitionRollbackRequestSchema.safeParse(requestValue);
        if (!inspectedRequest.success) {
          return lifecycleError('invalid-rollback-request', 'The rollback request is invalid.');
        }
        const request = inspectedRequest.data;
        const coordinates = await this.coordinates(brandId, recordTypeKey);
        const existingConflict = this.currentConflict(
          coordinates,
          request.expectedIdentityVersion,
          null,
          request.expectedActiveRevisionNumber
        );
        if (existingConflict !== null) return existingConflict;
        if (storedDataProperty(coordinates.identity, 'retiredAt') != null) {
          return lifecycleError('record-type-retired', 'A retired record type cannot be rolled back.');
        }
        const sourceRevision = await this.findRevision(
          coordinates.identity,
          brandId,
          recordTypeKey,
          request.sourceRevisionNumber
        );
        if (sourceRevision === null)
          return lifecycleError('revision-not-found', 'The rollback revision was not found.');
        const validated = await this.validate(
          coordinates,
          draftDefinitionFromPublished(sourceRevision.definition),
          coordinates.draft?.version ?? 0,
          'rollback'
        );
        const targetRevisionNumber = await this.nextRevisionNumber(coordinates.identity, brandId, recordTypeKey);
        const operation = this.newRevisionOperation(
          'rollback',
          coordinates,
          request.expectedIdentityVersion,
          null,
          targetRevisionNumber,
          validated.canonicalHash,
          { operation: 'rollback', sourceRevisionNumber: request.sourceRevisionNumber },
          actor,
          request.reason
        );
        const reserved = await this.reserve(coordinates, operation);
        if (reserved === null) {
          const current = await this.coordinates(brandId, recordTypeKey);
          return (
            this.currentConflict(
              current,
              request.expectedIdentityVersion,
              null,
              request.expectedActiveRevisionNumber
            ) ?? lifecycleError('storage-consistency-error', 'The rollback reservation could not be resolved.')
          );
        }
        return this.completeRevisionOperation(reserved, brandId, recordTypeKey, operation);
      });
    }

    private async changeRetirement(
      kind: 'retire' | 'unretire',
      brandIdValue: string,
      recordTypeKeyValue: string,
      requestValue: RecordDefinitionRetirementRequestDto,
      actorValue: RecordDefinitionActorDto
    ): Promise<RecordDefinitionRetirementResult> {
      const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
      const actor = parseActor(actorValue);
      const inspectedRequest = recordDefinitionRetirementRequestSchema.safeParse(requestValue);
      if (!inspectedRequest.success) {
        return lifecycleError('invalid-retirement-request', 'The retirement request is invalid.');
      }
      const request = inspectedRequest.data;
      const coordinates = await this.coordinates(brandId, recordTypeKey);
      const existingConflict = this.currentConflict(
        coordinates,
        request.expectedIdentityVersion,
        null,
        coordinates.active?.revisionNumber ?? null
      );
      if (existingConflict !== null) return existingConflict;
      const currentlyRetired = storedDataProperty(coordinates.identity, 'retiredAt') != null;
      if (kind === 'retire' && currentlyRetired) {
        return lifecycleError('record-type-already-retired', 'The record type is already retired.');
      }
      if (kind === 'unretire' && !currentlyRetired) {
        return lifecycleError('record-type-already-active', 'The record type is not retired.');
      }
      const operation = this.newRetirementOperation(
        kind,
        coordinates,
        request.expectedIdentityVersion,
        actor,
        request.reason
      );
      const reserved = await this.reserve(coordinates, operation);
      if (reserved === null) {
        const current = await this.coordinates(brandId, recordTypeKey);
        const currentIdentityVersion = nonNegativeVersion(storedDataProperty(current.identity, 'version') ?? 0);
        return Object.freeze({
          ok: false,
          current: this.identityDto(current.identity, brandId, recordTypeKey, current.draft, current.active),
          conflict: conflict(
            'identity-version-conflict',
            brandId,
            recordTypeKey,
            request.expectedIdentityVersion,
            currentIdentityVersion,
            coordinates.active?.revisionNumber ?? null,
            current.active?.revisionNumber ?? null
          ),
        });
      }
      return this.completeRetirementOperation(reserved, brandId, recordTypeKey, operation);
    }

    public async retire(
      brandIdValue: string,
      recordTypeKeyValue: string,
      requestValue: RecordDefinitionRetirementRequestDto,
      actorValue: RecordDefinitionActorDto
    ): Promise<RecordDefinitionRetirementResult> {
      return this.boundedLifecycleOperation(() =>
        this.changeRetirement('retire', brandIdValue, recordTypeKeyValue, requestValue, actorValue)
      );
    }

    public async unretire(
      brandIdValue: string,
      recordTypeKeyValue: string,
      requestValue: RecordDefinitionRetirementRequestDto,
      actorValue: RecordDefinitionActorDto
    ): Promise<RecordDefinitionRetirementResult> {
      return this.boundedLifecycleOperation(() =>
        this.changeRetirement('unretire', brandIdValue, recordTypeKeyValue, requestValue, actorValue)
      );
    }
  }
}

declare global {
  const RecordDefinitionPublicationService: Services.RecordDefinitionPublication;
}
