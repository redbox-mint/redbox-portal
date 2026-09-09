import {
  RECORD_DEFINITION_API_SCHEMA_VERSION,
  RECORD_DEFINITION_LABEL_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_MAX_LENGTH,
  RECORD_DEFINITION_REFERENCE_PATTERN,
  RECORD_DEFINITION_REPORT_SCHEMA_VERSION,
  parseRecordDefinitionBrandId,
  parseRecordDefinitionCanonicalHash,
  parseRecordDefinitionKey,
  type DraftRecordDefinitionAggregateDto,
  type RecordDefinitionActionBindingDto,
  type RecordDefinitionActionParameterValuesDto,
  type RecordDefinitionActorDto,
  type RecordDefinitionBrandId,
  type RecordDefinitionConflictDto,
  type RecordDefinitionDraftDto,
  type RecordDefinitionDraftSaveRequestDto,
  type RecordDefinitionKey,
  type RecordDefinitionRevisionId,
  type RecordDefinitionRevisionPointerDto,
  type RecordDefinitionValidationReportDto,
  type RecordTypeIdentityDto,
  type PublishableRecordDefinitionAggregateDto,
  type WorkflowTransitionId,
} from '@researchdatabox/sails-ng-common';
import { randomBytes, randomUUID } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { isProxy } from 'node:util/types';
import { deriveStableActionBindingId } from '../action-registry';
import { boundedValidationPreflight } from '../boundedValidation';
import { Services as services } from '../CoreService';
import {
  PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
  RECORD_DEFINITION_REVISION_NUMBER_MAX,
  deriveRecordDefinitionDraftId,
  deriveRecordDefinitionId,
  deriveRecordDefinitionRevisionId,
  deriveWorkflowTransitionId,
  inspectPublishableRecordDefinitionAggregate,
  recordDefinitionConflictSchema,
  recordDefinitionDraftSaveRequestSchema,
  recordDefinitionDraftSchema,
  recordTypeIdentitySchema,
  validateRecordDefinitionDraftPayload,
} from '../record-workflow-administration';
import type { RuntimeValue } from '../runtimeValues';
import type { RecordDefinitionDraftAttributes } from '../waterline-models/RecordDefinitionDraft';
import type { RecordDefinitionDraftOperationAckAttributes } from '../waterline-models/RecordDefinitionDraftOperationAck';
import type { RecordDefinitionRevisionAttributes } from '../waterline-models/RecordDefinitionRevision';
import type {
  RecordDefinitionDraftLifecycleOperation,
  RecordDefinitionDraftLifecycleOperationKind,
  RecordTypeAttributes,
} from '../waterline-models/RecordType';

export type RecordDefinitionDraftLifecycleErrorCode =
  | 'active-revision-conflict'
  | 'active-revision-not-found'
  | 'clone-target-must-differ'
  | 'draft-not-found'
  | 'draft-reset-requires-active-revision'
  | 'draft-validation-failed'
  | 'invalid-actor'
  | 'invalid-draft-save-request'
  | 'invalid-identity'
  | 'record-type-already-exists'
  | 'record-type-not-found'
  | 'storage-consistency-error';

const issuedLifecycleErrors = new WeakSet<object>();

/** Safe lifecycle failure; submitted definitions and storage errors are never echoed. */
export class RecordDefinitionDraftLifecycleError extends Error {
  public readonly code: RecordDefinitionDraftLifecycleErrorCode;
  public readonly validation: RecordDefinitionValidationReportDto | null;

  constructor(
    code: RecordDefinitionDraftLifecycleErrorCode,
    message: string,
    validation: RecordDefinitionValidationReportDto | null = null
  ) {
    super(message);
    this.name = 'RecordDefinitionDraftLifecycleError';
    this.code = code;
    this.validation = validation;
  }
}

export interface RecordDefinitionDraftCloneResult {
  readonly identity: RecordTypeIdentityDto;
  readonly draft: RecordDefinitionDraftDto;
}

export interface RecordDefinitionDraftMutationApplied {
  readonly ok: true;
  readonly draft: RecordDefinitionDraftDto;
}

export interface RecordDefinitionDraftMutationConflict {
  readonly ok: false;
  readonly current: RecordDefinitionDraftDto;
  readonly conflict: RecordDefinitionConflictDto;
}

export type RecordDefinitionDraftMutationResult =
  | RecordDefinitionDraftMutationApplied
  | RecordDefinitionDraftMutationConflict;

export interface RecordDefinitionDraftServiceExports {
  list(brandId: string, after?: string): Promise<readonly RecordTypeIdentityDto[]>;
  clone(
    brandId: string,
    sourceRecordTypeKey: string,
    targetRecordTypeKey: string,
    actor: RecordDefinitionActorDto,
    expectedActiveRevisionNumber?: number | null
  ): Promise<RecordDefinitionDraftCloneResult>;
  get(brandId: string, recordTypeKey: string): Promise<RecordDefinitionDraftDto | null>;
  save(
    brandId: string,
    recordTypeKey: string,
    request: RecordDefinitionDraftSaveRequestDto,
    actor: RecordDefinitionActorDto
  ): Promise<RecordDefinitionDraftMutationResult>;
  discard(
    brandId: string,
    recordTypeKey: string,
    expectedDraftVersion: number,
    expectedActiveRevisionNumber: number | null,
    actor: RecordDefinitionActorDto
  ): Promise<RecordDefinitionDraftMutationResult>;
  getStatus(brandId: string, recordTypeKey: string): Promise<RecordTypeIdentityDto | null>;
}

interface ActiveDefinitionSnapshot {
  readonly id: RecordDefinitionRevisionId;
  readonly revisionNumber: number;
  readonly canonicalHash: RecordDefinitionRevisionPointerDto['canonicalHash'];
  readonly definition: PublishableRecordDefinitionAggregateDto;
}

interface DraftMutationCoordinates {
  readonly brandId: RecordDefinitionBrandId;
  readonly recordTypeKey: RecordDefinitionKey;
  readonly identity: RecordTypeAttributes;
  readonly draft: RecordDefinitionDraftAttributes;
  readonly activeRevisionNumber: number | null;
}

interface CloneAttemptOwnership {
  createStarted: boolean;
  readonly identityId: string;
  readonly token: string;
  operation: RecordDefinitionDraftLifecycleOperation | null;
}

interface DraftMutationState {
  readonly baseRevisionId: RecordDefinitionRevisionId | null;
  readonly baseRevisionNumber: number | null;
  readonly definition: DraftRecordDefinitionAggregateDto;
  readonly updatedBy: RecordDefinitionActorDto;
  readonly validation: RecordDefinitionValidationReportDto;
  readonly version: number;
}

interface ResolvedIdentityDraft {
  readonly draft: RecordDefinitionDraftAttributes | null;
  readonly identity: RecordTypeAttributes;
  readonly settled: boolean;
}

interface MaterializedLifecycleOperation {
  readonly draft: RecordDefinitionDraftAttributes;
  readonly identity: RecordTypeAttributes;
  readonly operationDraft: RecordDefinitionDraftDto;
  readonly cloneIdentity: RecordTypeIdentityDto | null;
  readonly settled: boolean;
}

interface LifecycleOperationAck {
  readonly cloneIdentity: RecordTypeIdentityDto | null;
  readonly draft: RecordDefinitionDraftDto;
}

interface OperationAckMongoCollection {
  createIndex(
    attributes: Readonly<Record<string, 1 | -1>>,
    options: Readonly<{ expireAfterSeconds?: number; name: string; unique?: boolean }>
  ): Promise<string>;
}

interface OperationAckMongoManager {
  collection(name: string): OperationAckMongoCollection;
}

interface DraftIdentityMongoCollection {
  updateOne(
    filter: Readonly<Record<string, RuntimeValue>>,
    update: Readonly<{ $set: Readonly<Record<string, RuntimeValue>> }>
  ): Promise<RuntimeValue>;
}

interface DraftIdentityMongoManager {
  collection(name: string): DraftIdentityMongoCollection;
}

function lifecycleError(
  code: RecordDefinitionDraftLifecycleErrorCode,
  message: string,
  validation: RecordDefinitionValidationReportDto | null = null
): never {
  const error = new RecordDefinitionDraftLifecycleError(code, message, validation);
  issuedLifecycleErrors.add(error);
  throw error;
}

function normalizePublicLifecycleError(error: RuntimeValue): never {
  if (typeof error === 'object' && error !== null && issuedLifecycleErrors.has(error)) {
    throw error;
  }
  return lifecycleError('storage-consistency-error', 'The record-definition lifecycle storage state is unavailable.');
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
    return lifecycleError('invalid-actor', 'The draft actor is invalid.');
  }
  const keys = Object.keys(actor);
  if (keys.some(key => key !== 'id' && key !== 'displayName')) {
    return lifecycleError('invalid-actor', 'The draft actor is invalid.');
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
    return lifecycleError('invalid-actor', 'The draft actor is invalid.');
  }
  if (
    displayNameDescriptor !== undefined &&
    (displayNameDescriptor.enumerable !== true ||
      typeof displayName !== 'string' ||
      !hasSafeDisplayText(displayName, RECORD_DEFINITION_LABEL_MAX_LENGTH))
  ) {
    return lifecycleError('invalid-actor', 'The draft actor is invalid.');
  }
  return Object.freeze({
    id,
    ...(typeof displayName === 'string' ? { displayName: displayName.trim() } : {}),
  });
}

function positiveRevisionOrNull(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isSafeInteger(value) || value < 1 || value > RECORD_DEFINITION_REVISION_NUMBER_MAX) {
    return lifecycleError('invalid-draft-save-request', 'The active-revision precondition is invalid.');
  }
  return value;
}

function draftVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= RECORD_DEFINITION_REVISION_NUMBER_MAX) {
    return lifecycleError('invalid-draft-save-request', 'The draft-version precondition is invalid.');
  }
  return value;
}

function storedDataProperty<Row extends object, Key extends keyof Row>(row: Row, key: Key): Row[Key] {
  try {
    if (isProxy(row)) {
      return lifecycleError('storage-consistency-error', 'Stored record-definition data is invalid.');
    }
    const descriptor = Object.getOwnPropertyDescriptor(row, key);
    if (descriptor === undefined) {
      return undefined as Row[Key];
    }
    if (descriptor.get !== undefined || descriptor.set !== undefined) {
      return lifecycleError('storage-consistency-error', 'Stored record-definition data is invalid.');
    }
    const value = descriptor.value as RuntimeValue;
    return value as Row[Key];
  } catch {
    return lifecycleError('storage-consistency-error', 'Stored record-definition data is invalid.');
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

function storedBrandId<Row extends { branding: RuntimeValue }>(row: Row): RecordDefinitionBrandId {
  const id = storedRelationId(row, 'branding');
  if (id === null) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition ownership is invalid.');
  }
  try {
    return parseRecordDefinitionBrandId(id);
  } catch {
    return lifecycleError('storage-consistency-error', 'Stored record-definition ownership is invalid.');
  }
}

function projectRecordTypeRow(row: RecordTypeAttributes): RecordTypeAttributes {
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

function projectOperationAckRow(
  row: RecordDefinitionDraftOperationAckAttributes
): RecordDefinitionDraftOperationAckAttributes {
  return {
    id: storedDataProperty(row, 'id'),
    branding: storedDataProperty(row, 'branding'),
    recordType: storedDataProperty(row, 'recordType'),
    recordTypeId: storedDataProperty(row, 'recordTypeId'),
    recordTypeKey: storedDataProperty(row, 'recordTypeKey'),
    kind: storedDataProperty(row, 'kind'),
    identityVersion: storedDataProperty(row, 'identityVersion'),
    draftVersion: storedDataProperty(row, 'draftVersion'),
    expectedActiveRevisionNumber: storedDataProperty(row, 'expectedActiveRevisionNumber'),
    draft: storedDataProperty(row, 'draft'),
    cloneIdentity: storedDataProperty(row, 'cloneIdentity'),
    expiresAt: storedDataProperty(row, 'expiresAt'),
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

const LIFECYCLE_OPERATION_TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const LIFECYCLE_OPERATION_ACK_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

function storedActor(value: RuntimeValue): RecordDefinitionActorDto {
  try {
    return parseActor(value as RecordDefinitionActorDto);
  } catch {
    return lifecycleError('storage-consistency-error', 'Stored record-definition actor metadata is invalid.');
  }
}

function storedRevisionNumber(value: RuntimeValue, allowNull: boolean): number | null {
  if (value === null && allowNull) return null;
  if (
    typeof value !== 'number' ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > RECORD_DEFINITION_REVISION_NUMBER_MAX
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition lifecycle metadata is invalid.');
  }
  return value;
}

function lifecycleOperation(
  identity: RecordTypeAttributes,
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): RecordDefinitionDraftLifecycleOperation | null {
  const tokenValue = storedDataProperty(identity, 'draftLifecycleToken') ?? null;
  const kindValue = storedDataProperty(identity, 'draftLifecycleKind') ?? null;
  const operationValue = storedDataProperty(identity, 'draftLifecycleOperation') ?? null;
  if (tokenValue === null && kindValue === null && operationValue === null) return null;
  if (
    typeof tokenValue !== 'string' ||
    !LIFECYCLE_OPERATION_TOKEN_PATTERN.test(tokenValue) ||
    (kindValue !== 'clone' && kindValue !== 'discard' && kindValue !== 'save') ||
    operationValue === null ||
    typeof operationValue !== 'object' ||
    Array.isArray(operationValue) ||
    isProxy(operationValue)
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition lifecycle metadata is invalid.');
  }

  const operation = operationValue as RecordDefinitionDraftLifecycleOperation;
  const token = storedDataProperty(operation, 'token');
  const kind = storedDataProperty(operation, 'kind');
  const identityVersion = storedDataProperty(operation, 'identityVersion');
  const expectedDraftVersion = storedDataProperty(operation, 'expectedDraftVersion');
  const expectedActiveRevisionNumber = storedRevisionNumber(
    storedDataProperty(operation, 'expectedActiveRevisionNumber'),
    true
  );
  const stateValue = storedDataProperty(operation, 'state');
  if (
    token !== tokenValue ||
    kind !== kindValue ||
    !Number.isSafeInteger(identityVersion) ||
    identityVersion < 0 ||
    identityVersion > RECORD_DEFINITION_REVISION_NUMBER_MAX ||
    identityVersion !== (storedDataProperty(identity, 'version') ?? 0) ||
    !Number.isSafeInteger(expectedDraftVersion) ||
    expectedDraftVersion < 0 ||
    expectedDraftVersion >= RECORD_DEFINITION_REVISION_NUMBER_MAX ||
    expectedActiveRevisionNumber !== storedActiveRevisionNumber(identity, brandId, recordTypeKey) ||
    stateValue === null ||
    typeof stateValue !== 'object' ||
    Array.isArray(stateValue) ||
    isProxy(stateValue)
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition lifecycle metadata is invalid.');
  }

  const state = stateValue as RecordDefinitionDraftLifecycleOperation['state'];
  const version = storedDataProperty(state, 'version');
  const expectedNextVersion = kind === 'clone' ? 0 : expectedDraftVersion + 1;
  const baseRevisionIdValue = storedDataProperty(state, 'baseRevisionId');
  const baseRevisionNumber = storedRevisionNumber(storedDataProperty(state, 'baseRevisionNumber'), true);
  const expectedBaseRevisionId =
    baseRevisionNumber === null
      ? null
      : deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, baseRevisionNumber);
  const baseRevisionId = baseRevisionIdValue === expectedBaseRevisionId ? expectedBaseRevisionId : null;
  if (
    version !== expectedNextVersion ||
    (baseRevisionIdValue !== null && typeof baseRevisionIdValue !== 'string') ||
    baseRevisionIdValue !== expectedBaseRevisionId ||
    (kind === 'clone' &&
      (identityVersion !== 0 ||
        expectedDraftVersion !== 0 ||
        expectedActiveRevisionNumber !== null ||
        baseRevisionId !== null))
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition lifecycle state is invalid.');
  }

  const validation = validateRecordDefinitionDraftPayload({
    brandId,
    recordTypeKey,
    draftVersion: version,
    activeRevisionNumber: expectedActiveRevisionNumber,
    definition: storedDataProperty(state, 'definition'),
  });
  if (!validation.ok) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition lifecycle state is invalid.');
  }
  const updatedBy = storedActor(storedDataProperty(state, 'updatedBy'));
  return Object.freeze({
    token,
    kind,
    identityVersion,
    expectedDraftVersion,
    expectedActiveRevisionNumber,
    state: Object.freeze({
      baseRevisionId,
      baseRevisionNumber,
      definition: validation.definition,
      updatedBy,
      validation: validation.report,
      version,
    }),
  });
}

function ensureNoDefinitionLifecycleOperation(identity: RecordTypeAttributes): void {
  const token = storedDataProperty(identity, 'definitionLifecycleToken') ?? null;
  const operation = storedDataProperty(identity, 'definitionLifecycleOperation') ?? null;
  if (token !== null || operation !== null) {
    return lifecycleError(
      'storage-consistency-error',
      'A record-definition publication or retirement operation is still settling.'
    );
  }
}

function newLifecycleOperation(
  token: string,
  kind: RecordDefinitionDraftLifecycleOperationKind,
  identityVersion: number,
  expectedDraftVersion: number,
  expectedActiveRevisionNumber: number | null,
  state: DraftMutationState
): RecordDefinitionDraftLifecycleOperation {
  return Object.freeze({
    token,
    kind,
    identityVersion,
    expectedDraftVersion,
    expectedActiveRevisionNumber,
    state: Object.freeze({ ...state }),
  });
}

function draftMatchesLifecycleOperation(
  draft: RecordDefinitionDraftAttributes,
  operation: RecordDefinitionDraftLifecycleOperation
): boolean {
  const dto = draftDto(draft);
  return (
    storedDataProperty(draft, 'lifecycleOperationToken') === operation.token &&
    storedRelationId(draft, 'baseRevisionId') === operation.state.baseRevisionId &&
    dto.version === operation.state.version &&
    dto.baseRevisionNumber === operation.state.baseRevisionNumber &&
    isDeepStrictEqual(dto.definition, operation.state.definition) &&
    isDeepStrictEqual(dto.updatedBy, operation.state.updatedBy) &&
    isDeepStrictEqual(dto.validation, operation.state.validation)
  );
}

function storedActiveRevisionNumber(
  identity: RecordTypeAttributes,
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): number | null {
  const revisionNumber = storedDataProperty(identity, 'activeRevisionNumber') ?? null;
  const revisionId = storedRelationId(identity, 'activeRevisionId');
  if ((revisionNumber === null) !== (revisionId === null)) {
    return lifecycleError('storage-consistency-error', 'Stored active-revision metadata is invalid.');
  }
  if (revisionNumber === null || revisionId === null) return null;
  if (
    !Number.isSafeInteger(revisionNumber) ||
    revisionNumber < 1 ||
    revisionNumber > RECORD_DEFINITION_REVISION_NUMBER_MAX ||
    revisionId !== deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, revisionNumber)
  ) {
    return lifecycleError('storage-consistency-error', 'Stored active-revision metadata is invalid.');
  }
  return revisionNumber;
}

function ownedIdentity(
  identity: RecordTypeAttributes,
  brandId: RecordDefinitionBrandId,
  recordTypeKey: RecordDefinitionKey
): RecordTypeAttributes {
  const expectedId = deriveRecordDefinitionId({ brandId, recordTypeKey });
  const rowId = storedDataProperty(identity, 'id');
  const version = storedDataProperty(identity, 'version') ?? 0;
  if (
    typeof rowId !== 'string' ||
    rowId.length === 0 ||
    rowId.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
    storedRelationId(identity, 'branding') !== brandId ||
    storedDataProperty(identity, 'name') !== recordTypeKey ||
    storedDataProperty(identity, 'definitionId') !== expectedId ||
    !Number.isSafeInteger(version) ||
    Number(version) < 0 ||
    Number(version) > RECORD_DEFINITION_REVISION_NUMBER_MAX
  ) {
    return lifecycleError('storage-consistency-error', 'Stored record-definition ownership is invalid.');
  }
  return identity;
}

function draftDto(row: RecordDefinitionDraftAttributes): RecordDefinitionDraftDto {
  const brandId = storedBrandId(row);
  const recordTypeKey = storedDataProperty(row, 'recordTypeKey');
  const baseRevisionNumber = storedDataProperty(row, 'baseRevisionNumber') ?? null;
  const baseRevisionId = storedRelationId(row, 'baseRevisionId');
  if (
    (baseRevisionNumber === null) !== (baseRevisionId === null) ||
    (baseRevisionNumber !== null &&
      (baseRevisionNumber < 1 ||
        baseRevisionNumber > RECORD_DEFINITION_REVISION_NUMBER_MAX ||
        !Number.isSafeInteger(baseRevisionNumber) ||
        baseRevisionId !== deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, baseRevisionNumber)))
  ) {
    return lifecycleError('storage-consistency-error', 'Stored draft base-revision metadata is invalid.');
  }
  const candidate: RecordDefinitionDraftDto = {
    schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
    id: storedDataProperty(row, 'id'),
    recordTypeId: storedDataProperty(row, 'recordTypeId'),
    brandId,
    recordTypeKey,
    version: storedDataProperty(row, 'version'),
    baseRevisionNumber,
    definition: storedDataProperty(row, 'definition'),
    updatedAt: timestamp(storedDataProperty(row, 'updatedAt')),
    updatedBy: storedActor(storedDataProperty(row, 'updatedBy')),
    validation: storedDataProperty(row, 'validation') ?? null,
  };
  const inspected = recordDefinitionDraftSchema.safeParse(candidate);
  if (!inspected.success) {
    return lifecycleError('storage-consistency-error', 'Stored draft data is invalid.');
  }
  return Object.freeze(inspected.data);
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

function mutationConflict(
  current: RecordDefinitionDraftDto,
  metadata: RecordDefinitionConflictDto
): RecordDefinitionDraftMutationConflict {
  return Object.freeze({ ok: false, current, conflict: metadata });
}

function activeConflict(
  coordinates: DraftMutationCoordinates,
  expectedActiveRevisionNumber: number | null
): RecordDefinitionDraftMutationConflict {
  return mutationConflict(
    draftDto(coordinates.draft),
    conflict(
      'active-revision-conflict',
      coordinates.brandId,
      coordinates.recordTypeKey,
      expectedActiveRevisionNumber,
      coordinates.activeRevisionNumber,
      expectedActiveRevisionNumber,
      coordinates.activeRevisionNumber
    )
  );
}

function versionConflict(
  coordinates: DraftMutationCoordinates,
  expectedDraftVersion: number,
  expectedActiveRevisionNumber: number | null
): RecordDefinitionDraftMutationConflict {
  return mutationConflict(
    draftDto(coordinates.draft),
    conflict(
      'draft-version-conflict',
      coordinates.brandId,
      coordinates.recordTypeKey,
      expectedDraftVersion,
      coordinates.draft.version,
      expectedActiveRevisionNumber,
      coordinates.activeRevisionNumber
    )
  );
}

function identityConflict(
  coordinates: DraftMutationCoordinates,
  expectedIdentityVersion: number
): RecordDefinitionDraftMutationConflict {
  return mutationConflict(
    draftDto(coordinates.draft),
    conflict(
      'identity-version-conflict',
      coordinates.brandId,
      coordinates.recordTypeKey,
      expectedIdentityVersion,
      storedDataProperty(coordinates.identity, 'version') ?? 0,
      coordinates.activeRevisionNumber,
      coordinates.activeRevisionNumber
    )
  );
}

function cloneParameters(
  parameters: RecordDefinitionActionParameterValuesDto
): RecordDefinitionActionParameterValuesDto {
  const clone: Record<string, RecordDefinitionActionParameterValuesDto[string]> = {};
  for (const [name, parameter] of Object.entries(parameters)) {
    clone[name] =
      parameter.kind === 'secret'
        ? Object.freeze({ kind: 'secret', configured: false })
        : Object.freeze(structuredClone(parameter));
  }
  return Object.freeze(clone);
}

function cloneDefinitionForNewIdentity(
  source: PublishableRecordDefinitionAggregateDto,
  brandId: RecordDefinitionBrandId,
  targetRecordTypeKey: RecordDefinitionKey
): DraftRecordDefinitionAggregateDto {
  const transitionIds = new Map<string, WorkflowTransitionId>();
  const transitions = source.transitions.map(transition => {
    const id = deriveWorkflowTransitionId({
      brandId,
      recordTypeKey: targetRecordTypeKey,
      stableKey: transition.id,
    });
    transitionIds.set(transition.id, id);
    return Object.freeze({ ...structuredClone(transition), id });
  });

  const bindingIds = new Map<string, string>();
  const bindingsWithoutDependencies = source.actionBindings.map(binding => {
    const scope =
      binding.scope.context === 'workflow-transition'
        ? Object.freeze({
            ...binding.scope,
            scopeId:
              transitionIds.get(binding.scope.scopeId) ??
              lifecycleError('storage-consistency-error', 'The active definition contains an invalid action scope.'),
          })
        : Object.freeze({ ...binding.scope });
    const id = deriveStableActionBindingId({
      recordTypeKey: targetRecordTypeKey,
      scope,
      actionId: binding.actionId,
      contractVersion: binding.contractVersion,
      stableKey: binding.stableKey,
    });
    bindingIds.set(binding.id, id);
    return Object.freeze({
      ...structuredClone(binding),
      id,
      scope,
      parameters: cloneParameters(binding.parameters),
      dependencies: undefined,
    });
  });

  const actionBindings: RecordDefinitionActionBindingDto[] = bindingsWithoutDependencies.map((binding, index) => {
    const sourceBinding = source.actionBindings[index];
    const dependencies = sourceBinding.dependencies?.map(dependency => {
      const bindingId = bindingIds.get(dependency.bindingId);
      if (bindingId === undefined) {
        return lifecycleError(
          'storage-consistency-error',
          'The active definition contains an invalid action dependency.'
        );
      }
      return Object.freeze({ ...structuredClone(dependency), bindingId });
    });
    const clone: RecordDefinitionActionBindingDto = {
      ...binding,
      ...(dependencies === undefined ? {} : { dependencies: Object.freeze(dependencies) }),
    };
    return Object.freeze(clone);
  });

  return {
    schemaVersion: source.schemaVersion,
    definitionState: 'draft-incomplete',
    recordType: structuredClone(source.recordType),
    stages: Object.freeze(source.stages.map(stage => Object.freeze(structuredClone(stage)))),
    transitions: Object.freeze(transitions),
    actionBindings: Object.freeze(actionBindings),
  };
}

function draftDefinitionFromActive(active: PublishableRecordDefinitionAggregateDto): DraftRecordDefinitionAggregateDto {
  return {
    schemaVersion: active.schemaVersion,
    definitionState: 'draft-incomplete',
    recordType: structuredClone(active.recordType),
    stages: Object.freeze(active.stages.map(stage => Object.freeze(structuredClone(stage)))),
    transitions: Object.freeze(active.transitions.map(transition => Object.freeze(structuredClone(transition)))),
    actionBindings: Object.freeze(active.actionBindings.map(binding => Object.freeze(structuredClone(binding)))),
  };
}

function requireSafeDeploymentReference(value: string | undefined): string {
  if (
    typeof value !== 'string' ||
    value.length > RECORD_DEFINITION_REFERENCE_MAX_LENGTH ||
    !RECORD_DEFINITION_REFERENCE_PATTERN.test(value)
  ) {
    return lifecycleError('storage-consistency-error', 'Stored deployment metadata is invalid.');
  }
  return value;
}

export namespace Services {
  /** Shared, brand-scoped draft lifecycle. It never mutates active revisions or runtime configuration. */
  export class RecordDefinitionDraftLifecycle extends services.Core.Service {
    protected override _exportedMethods: string[] = ['clone', 'get', 'save', 'discard', 'getStatus', 'list'];
    private operationAckIndexSetup: Promise<void> | null = null;

    private execute<Value>(query: Sails.WaterlinePromise<Value>, connection?: Sails.Connection): Promise<Value> {
      return connection === undefined ? query : query.usingConnection(connection);
    }

    private async ensureOperationAckIndexes(): Promise<void> {
      if (this.operationAckIndexSetup !== null) return this.operationAckIndexSetup;
      const setup = (async (): Promise<void> => {
        const manager = RecordDefinitionDraftOperationAck.getDatastore().manager as OperationAckMongoManager;
        if (manager === null || typeof manager !== 'object' || typeof manager.collection !== 'function') {
          return lifecycleError('storage-consistency-error', 'Draft lifecycle acknowledgement storage is unavailable.');
        }
        const collection = manager.collection('recorddefinitiondraftoperationack');
        if (collection === null || typeof collection !== 'object' || typeof collection.createIndex !== 'function') {
          return lifecycleError('storage-consistency-error', 'Draft lifecycle acknowledgement storage is unavailable.');
        }
        await Promise.all([
          collection.createIndex(
            { recordType: 1, identityVersion: 1 },
            { name: 'recorddefinitiondraftoperationack_record_type_version', unique: true }
          ),
          collection.createIndex(
            { branding: 1, recordTypeKey: 1, identityVersion: 1 },
            { name: 'recorddefinitiondraftoperationack_brand_key_version', unique: true }
          ),
          collection.createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0, name: 'recorddefinitiondraftoperationack_expiry' }
          ),
        ]);
      })();
      this.operationAckIndexSetup = setup;
      try {
        await setup;
      } catch (error) {
        if (this.operationAckIndexSetup === setup) this.operationAckIndexSetup = null;
        throw error;
      }
    }

    private identityMongoCollection(): DraftIdentityMongoCollection {
      const manager = RecordType.getDatastore().manager as object as DraftIdentityMongoManager;
      if (manager === null || typeof manager !== 'object' || typeof manager.collection !== 'function') {
        return lifecycleError('storage-consistency-error', 'Draft identity storage is unavailable.');
      }
      const collection = manager.collection('recordtype');
      if (collection === null || typeof collection !== 'object' || typeof collection.updateOne !== 'function') {
        return lifecycleError('storage-consistency-error', 'Draft identity storage is unavailable.');
      }
      return collection;
    }

    private async findIdentity(
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection
    ): Promise<RecordTypeAttributes | null> {
      const query = RecordType.findOne({
        branding: brandId,
        name: recordTypeKey,
      }) as Sails.WaterlinePromise<RecordTypeAttributes | null | undefined>;
      const identity = await this.execute(query, connection);
      return identity === null || identity === undefined
        ? null
        : ownedIdentity(projectRecordTypeRow(identity), brandId, recordTypeKey);
    }

    private async findDraft(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection,
      allowMissing = false
    ): Promise<RecordDefinitionDraftAttributes | null> {
      const expectedDraftId = deriveRecordDefinitionDraftId({ brandId, recordTypeKey });
      const pointer = storedRelationId(identity, 'draftId');
      if (pointer === null) return null;
      if (pointer !== expectedDraftId) {
        return lifecycleError('storage-consistency-error', 'Stored draft ownership is invalid.');
      }
      const query = RecordDefinitionDraft.findOne({
        id: expectedDraftId,
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
      }) as Sails.WaterlinePromise<RecordDefinitionDraftAttributes | null | undefined>;
      const storedDraft = await this.execute(query, connection);
      const draft = storedDraft === null || storedDraft === undefined ? null : projectDraftRow(storedDraft);
      if (draft === null) {
        if (allowMissing) return null;
        return lifecycleError('storage-consistency-error', 'The record type points to a missing draft.');
      }
      if (
        storedRelationId(draft, 'branding') !== brandId ||
        storedRelationId(draft, 'recordType') !== storedDataProperty(identity, 'id')
      ) {
        return lifecycleError('storage-consistency-error', 'Stored draft ownership is invalid.');
      }
      return draft;
    }

    private async activeSnapshot(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection
    ): Promise<ActiveDefinitionSnapshot | null> {
      const activeRevisionNumber = storedActiveRevisionNumber(identity, brandId, recordTypeKey);
      const activeRevisionId = storedRelationId(identity, 'activeRevisionId');
      if (activeRevisionNumber === null || activeRevisionId === null) return null;
      const expectedActiveRevisionId = deriveRecordDefinitionRevisionId(
        { brandId, recordTypeKey },
        activeRevisionNumber
      );
      if (activeRevisionId !== expectedActiveRevisionId) {
        return lifecycleError('storage-consistency-error', 'Stored active-revision metadata is invalid.');
      }
      const query = RecordDefinitionRevision.findOne({
        id: expectedActiveRevisionId,
        branding: brandId,
        recordType: storedDataProperty(identity, 'id'),
        recordTypeId: storedDataProperty(identity, 'definitionId'),
        recordTypeKey,
        revisionNumber: activeRevisionNumber,
      }) as Sails.WaterlinePromise<RecordDefinitionRevisionAttributes | null | undefined>;
      const storedRevision = await this.execute(query, connection);
      const revision =
        storedRevision === null || storedRevision === undefined ? null : projectRevisionRow(storedRevision);
      if (revision === null) {
        return lifecycleError('active-revision-not-found', 'The active record-definition revision was not found.');
      }
      const inspected = inspectPublishableRecordDefinitionAggregate(revision.definition);
      if (
        !inspected.success ||
        revision.id !== expectedActiveRevisionId ||
        revision.recordTypeId !== identity.definitionId ||
        revision.recordTypeKey !== recordTypeKey ||
        storedRelationId(revision, 'branding') !== brandId ||
        storedRelationId(revision, 'recordType') !== storedDataProperty(identity, 'id')
      ) {
        return lifecycleError('storage-consistency-error', 'Stored active-revision data is invalid.');
      }
      let canonicalHash: RecordDefinitionRevisionPointerDto['canonicalHash'];
      try {
        const storedHash = storedDataProperty(revision, 'canonicalHash');
        if (typeof storedHash !== 'string') {
          return lifecycleError('storage-consistency-error', 'Stored active-revision data is invalid.');
        }
        canonicalHash = parseRecordDefinitionCanonicalHash(storedHash);
      } catch {
        return lifecycleError('storage-consistency-error', 'Stored active-revision data is invalid.');
      }
      return Object.freeze({
        id: expectedActiveRevisionId,
        revisionNumber: activeRevisionNumber,
        canonicalHash,
        definition: inspected.data,
      });
    }

    private async findOperationAck(
      identityId: string,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionDraftLifecycleOperation,
      connection?: Sails.Connection
    ): Promise<LifecycleOperationAck | null> {
      await this.ensureOperationAckIndexes();
      const recordTypeId = deriveRecordDefinitionId({ brandId, recordTypeKey });
      const query = RecordDefinitionDraftOperationAck.findOne({
        id: operation.token,
        branding: brandId,
        recordType: identityId,
        recordTypeId,
        recordTypeKey,
        kind: operation.kind,
        identityVersion: operation.identityVersion,
        draftVersion: operation.state.version,
        expectedActiveRevisionNumber: operation.expectedActiveRevisionNumber,
      }) as Sails.WaterlinePromise<RecordDefinitionDraftOperationAckAttributes | null | undefined>;
      const storedAck = await this.execute(query, connection);
      if (storedAck === null || storedAck === undefined) return null;
      const ack = projectOperationAckRow(storedAck);
      const expiresAt = storedDataProperty(ack, 'expiresAt');
      if (!(expiresAt instanceof Date) || !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now()) {
        return lifecycleError('storage-consistency-error', 'Stored draft lifecycle acknowledgement is invalid.');
      }

      const inspectedDraft = recordDefinitionDraftSchema.safeParse(storedDataProperty(ack, 'draft'));
      if (!inspectedDraft.success) {
        return lifecycleError('storage-consistency-error', 'Stored draft lifecycle acknowledgement is invalid.');
      }
      const draft = Object.freeze(inspectedDraft.data);
      if (
        draft.id !== deriveRecordDefinitionDraftId({ brandId, recordTypeKey }) ||
        draft.recordTypeId !== recordTypeId ||
        draft.brandId !== brandId ||
        draft.recordTypeKey !== recordTypeKey ||
        draft.version !== operation.state.version ||
        draft.baseRevisionNumber !== operation.state.baseRevisionNumber ||
        !isDeepStrictEqual(draft.definition, operation.state.definition) ||
        !isDeepStrictEqual(draft.updatedBy, operation.state.updatedBy) ||
        !isDeepStrictEqual(draft.validation, operation.state.validation)
      ) {
        return lifecycleError('storage-consistency-error', 'Stored draft lifecycle acknowledgement is invalid.');
      }

      const cloneIdentityValue = storedDataProperty(ack, 'cloneIdentity') ?? null;
      if (operation.kind !== 'clone') {
        if (cloneIdentityValue !== null) {
          return lifecycleError('storage-consistency-error', 'Stored draft lifecycle acknowledgement is invalid.');
        }
        return Object.freeze({ draft, cloneIdentity: null });
      }
      const inspectedIdentity = recordTypeIdentitySchema.safeParse(cloneIdentityValue);
      if (
        !inspectedIdentity.success ||
        inspectedIdentity.data.brandId !== brandId ||
        inspectedIdentity.data.key !== recordTypeKey ||
        inspectedIdentity.data.version !== operation.identityVersion ||
        inspectedIdentity.data.activeRevision !== null ||
        inspectedIdentity.data.draft === null ||
        inspectedIdentity.data.draft.id !== draft.id ||
        inspectedIdentity.data.draft.version !== draft.version ||
        inspectedIdentity.data.draft.baseRevisionNumber !== draft.baseRevisionNumber ||
        inspectedIdentity.data.draft.updatedAt !== draft.updatedAt ||
        !isDeepStrictEqual(inspectedIdentity.data.draft.updatedBy, draft.updatedBy)
      ) {
        return lifecycleError('storage-consistency-error', 'Stored draft lifecycle acknowledgement is invalid.');
      }
      return Object.freeze({ draft, cloneIdentity: Object.freeze(inspectedIdentity.data) });
    }

    private async persistOperationAck(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionDraftLifecycleOperation,
      draft: RecordDefinitionDraftAttributes,
      connection?: Sails.Connection
    ): Promise<LifecycleOperationAck> {
      const identityId = storedDataProperty(identity, 'id');
      const recordTypeId = deriveRecordDefinitionId({ brandId, recordTypeKey });
      const completedDraft = draftDto(draft);
      const cloneIdentity =
        operation.kind === 'clone' ? this.identityDto(identity, brandId, recordTypeKey, completedDraft, null) : null;
      const createQuery = RecordDefinitionDraftOperationAck.create({
        id: operation.token,
        branding: brandId,
        recordType: identityId,
        recordTypeId,
        recordTypeKey,
        kind: operation.kind,
        identityVersion: operation.identityVersion,
        draftVersion: operation.state.version,
        expectedActiveRevisionNumber: operation.expectedActiveRevisionNumber,
        draft: completedDraft,
        cloneIdentity,
        expiresAt: new Date(Date.now() + LIFECYCLE_OPERATION_ACK_RETENTION_MS),
      }).fetch() as Sails.WaterlinePromise<RecordDefinitionDraftOperationAckAttributes>;
      try {
        await this.execute(createQuery, connection);
      } catch {
        // The unique acknowledgement may already exist or its create acknowledgement may be lost.
      }
      const acknowledgement = await this.findOperationAck(identityId, brandId, recordTypeKey, operation, connection);
      if (acknowledgement === null) {
        return lifecycleError(
          'storage-consistency-error',
          'The committed draft lifecycle operation could not be acknowledged safely.'
        );
      }
      return acknowledgement;
    }

    private async materializeLifecycleOperation(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionDraftLifecycleOperation,
      connection?: Sails.Connection
    ): Promise<RecordDefinitionDraftAttributes> {
      let draft = await this.findDraft(identity, brandId, recordTypeKey, connection, true);
      const identityId = storedDataProperty(identity, 'id');
      const recordTypeId = storedDataProperty(identity, 'definitionId');
      const draftId = deriveRecordDefinitionDraftId({ brandId, recordTypeKey });
      if (draft === null && operation.kind === 'clone') {
        const createQuery = RecordDefinitionDraft.create({
          id: draftId,
          schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
          branding: brandId,
          recordType: identityId,
          recordTypeId,
          recordTypeKey,
          version: operation.state.version,
          lifecycleOperationToken: operation.token,
          baseRevisionId: operation.state.baseRevisionId,
          baseRevisionNumber: operation.state.baseRevisionNumber,
          definition: operation.state.definition,
          validation: operation.state.validation,
          createdBy: operation.state.updatedBy,
          updatedBy: operation.state.updatedBy,
        }).fetch() as Sails.WaterlinePromise<RecordDefinitionDraftAttributes>;
        try {
          await this.execute(createQuery, connection);
        } catch {
          // A create acknowledgement can be lost; the authoritative read below resolves it.
        }
        draft = await this.findDraft(identity, brandId, recordTypeKey, connection, true);
      } else if (
        draft !== null &&
        operation.kind !== 'clone' &&
        storedDataProperty(draft, 'version') === operation.expectedDraftVersion &&
        !draftMatchesLifecycleOperation(draft, operation)
      ) {
        const updateQuery = RecordDefinitionDraft.updateOne({
          id: draftId,
          branding: brandId,
          recordType: identityId,
          recordTypeId,
          recordTypeKey,
          version: operation.expectedDraftVersion,
        }).set({
          ...operation.state,
          lifecycleOperationToken: operation.token,
        }) as Sails.WaterlinePromise<RecordDefinitionDraftAttributes | null>;
        try {
          await this.execute(updateQuery, connection);
        } catch {
          // A materialization acknowledgement can be lost; the authoritative read below resolves it.
        }
        draft = await this.findDraft(identity, brandId, recordTypeKey, connection, true);
      }
      if (draft === null || !draftMatchesLifecycleOperation(draft, operation)) {
        return lifecycleError(
          'storage-consistency-error',
          'The committed draft lifecycle operation could not be materialized safely.'
        );
      }
      return draft;
    }

    private async reconcileLifecycleOperation(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      operation: RecordDefinitionDraftLifecycleOperation,
      connection?: Sails.Connection
    ): Promise<MaterializedLifecycleOperation> {
      const identityId = storedDataProperty(identity, 'id');
      const existingAck = await this.findOperationAck(identityId, brandId, recordTypeKey, operation, connection);
      const acknowledgement =
        existingAck ??
        (await this.persistOperationAck(
          identity,
          brandId,
          recordTypeKey,
          operation,
          await this.materializeLifecycleOperation(identity, brandId, recordTypeKey, operation, connection),
          connection
        ));
      const activeRevisionId =
        operation.expectedActiveRevisionNumber === null
          ? null
          : deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, operation.expectedActiveRevisionNumber);
      const clearQuery = RecordType.updateOne({
        id: identityId,
        branding: brandId,
        name: recordTypeKey,
        definitionId: storedDataProperty(identity, 'definitionId'),
        draftId: storedDataProperty(identity, 'draftId'),
        activeRevisionId,
        activeRevisionNumber: operation.expectedActiveRevisionNumber,
        version: operation.identityVersion,
        draftLifecycleToken: operation.token,
        draftLifecycleKind: operation.kind,
        definitionLifecycleToken: null,
      }).set({
        draftLifecycleToken: null,
        draftLifecycleKind: null,
        draftLifecycleOperation: null,
      }) as Sails.WaterlinePromise<RecordTypeAttributes | null>;
      try {
        await this.execute(clearQuery, connection);
      } catch {
        // Clearing is idempotent; an ambiguous acknowledgement is resolved by the read below.
      }
      const currentIdentity = await this.findIdentity(brandId, recordTypeKey, connection);
      if (
        currentIdentity === null ||
        storedDataProperty(currentIdentity, 'id') !== identityId ||
        (storedDataProperty(currentIdentity, 'version') ?? 0) < operation.identityVersion
      ) {
        return lifecycleError('storage-consistency-error', 'The committed draft lifecycle state changed unexpectedly.');
      }
      const currentOperation = lifecycleOperation(currentIdentity, brandId, recordTypeKey);
      if (currentOperation !== null && currentOperation.token !== operation.token) {
        const advanced = await this.reconcileLifecycleOperation(
          currentIdentity,
          brandId,
          recordTypeKey,
          currentOperation,
          connection
        );
        return Object.freeze({
          ...advanced,
          operationDraft: acknowledgement.draft,
          cloneIdentity: acknowledgement.cloneIdentity,
        });
      }
      const currentDraft = await this.findDraft(currentIdentity, brandId, recordTypeKey, connection);
      if (currentDraft === null) {
        return lifecycleError('storage-consistency-error', 'The committed draft lifecycle state is missing its draft.');
      }
      return Object.freeze({
        draft: currentDraft,
        identity: currentIdentity,
        operationDraft: acknowledgement.draft,
        cloneIdentity: acknowledgement.cloneIdentity,
        settled: currentOperation === null,
      });
    }

    private async resolveIdentityDraft(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection
    ): Promise<ResolvedIdentityDraft> {
      ensureNoDefinitionLifecycleOperation(identity);
      const operation = lifecycleOperation(identity, brandId, recordTypeKey);
      if (operation !== null) {
        return this.reconcileLifecycleOperation(identity, brandId, recordTypeKey, operation, connection);
      }
      const draft = await this.findDraft(identity, brandId, recordTypeKey, connection);
      return Object.freeze({ identity, draft, settled: true });
    }

    private async mutationCoordinates(
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      connection?: Sails.Connection
    ): Promise<DraftMutationCoordinates> {
      const identity = await this.findIdentity(brandId, recordTypeKey, connection);
      if (identity === null) {
        return lifecycleError('record-type-not-found', 'The record type was not found.');
      }
      const resolved = await this.resolveIdentityDraft(identity, brandId, recordTypeKey, connection);
      if (!resolved.settled) {
        return lifecycleError('storage-consistency-error', 'A committed draft lifecycle operation is still settling.');
      }
      if (resolved.draft === null) {
        return lifecycleError('draft-not-found', 'The record type has no shared draft.');
      }
      return Object.freeze({
        brandId,
        recordTypeKey,
        identity: resolved.identity,
        draft: resolved.draft,
        activeRevisionNumber: storedActiveRevisionNumber(resolved.identity, brandId, recordTypeKey),
      });
    }

    private async commitDraftMutation(
      coordinates: DraftMutationCoordinates,
      expectedDraftVersion: number,
      expectedActiveRevisionNumber: number | null,
      state: DraftMutationState,
      kind: 'discard' | 'save',
      connection?: Sails.Connection
    ): Promise<RecordDefinitionDraftMutationResult> {
      const identityId = storedDataProperty(coordinates.identity, 'id');
      const identityVersion = storedDataProperty(coordinates.identity, 'version') ?? 0;
      if (identityVersion >= RECORD_DEFINITION_REVISION_NUMBER_MAX) {
        return lifecycleError('storage-consistency-error', 'The record-type version cannot be advanced safely.');
      }
      const committedIdentityVersion = identityVersion + 1;
      const token = randomUUID();
      const operation = newLifecycleOperation(
        token,
        kind,
        committedIdentityVersion,
        expectedDraftVersion,
        expectedActiveRevisionNumber,
        state
      );
      await this.ensureOperationAckIndexes();
      const activeRevisionId =
        expectedActiveRevisionNumber === null
          ? null
          : deriveRecordDefinitionRevisionId(
              { brandId: coordinates.brandId, recordTypeKey: coordinates.recordTypeKey },
              expectedActiveRevisionNumber
            );
      try {
        await this.identityMongoCollection().updateOne(
          {
            name: coordinates.recordTypeKey,
            definitionId: storedDataProperty(coordinates.identity, 'definitionId'),
            draftId: storedDataProperty(coordinates.draft, 'id'),
            activeRevisionId,
            activeRevisionNumber: expectedActiveRevisionNumber,
            version: identityVersion,
            secretMutationToken: null,
            draftLifecycleToken: null,
            draftLifecycleKind: null,
            draftLifecycleOperation: null,
            definitionLifecycleToken: null,
            definitionLifecycleOperation: null,
          },
          {
            $set: {
              version: committedIdentityVersion,
              updatedAt: new Date(),
              updatedBy: state.updatedBy,
              draftLifecycleToken: token,
              draftLifecycleKind: kind,
              draftLifecycleOperation: operation,
            },
          }
        );
      } catch {
        // The identity CAS may have committed despite a lost acknowledgement; read it authoritatively below.
      }

      const committedIdentity = await this.findIdentity(coordinates.brandId, coordinates.recordTypeKey, connection);
      if (committedIdentity !== null && storedDataProperty(committedIdentity, 'id') === identityId) {
        const acknowledgement = await this.findOperationAck(
          identityId,
          coordinates.brandId,
          coordinates.recordTypeKey,
          operation,
          connection
        );
        if (acknowledgement !== null) {
          return Object.freeze({ ok: true, draft: acknowledgement.draft });
        }
        const committedOperation = lifecycleOperation(
          committedIdentity,
          coordinates.brandId,
          coordinates.recordTypeKey
        );
        if (committedOperation !== null && committedOperation.token === token) {
          const resolved = await this.reconcileLifecycleOperation(
            committedIdentity,
            coordinates.brandId,
            coordinates.recordTypeKey,
            committedOperation,
            connection
          );
          return Object.freeze({ ok: true, draft: resolved.operationDraft });
        }
      }

      const current = await this.mutationCoordinates(coordinates.brandId, coordinates.recordTypeKey, connection);
      if (current.activeRevisionNumber !== expectedActiveRevisionNumber) {
        return activeConflict(current, expectedActiveRevisionNumber);
      }
      if (storedDataProperty(current.draft, 'version') !== expectedDraftVersion) {
        return versionConflict(current, expectedDraftVersion, expectedActiveRevisionNumber);
      }
      if (storedDataProperty(current.identity, 'version') !== identityVersion) {
        return identityConflict(current, identityVersion);
      }
      return lifecycleError('storage-consistency-error', 'The draft mutation could not be committed safely.');
    }

    private identityDto(
      identity: RecordTypeAttributes,
      brandId: RecordDefinitionBrandId,
      recordTypeKey: RecordDefinitionKey,
      draft: RecordDefinitionDraftDto | null,
      active: ActiveDefinitionSnapshot | null
    ): RecordTypeIdentityDto {
      const retiredAtValue = storedDataProperty(identity, 'retiredAt');
      const retiredByValue = storedDataProperty(identity, 'retiredBy');
      const retirementReason = storedDataProperty(identity, 'retirementReason');
      const retiredAt = retiredAtValue == null ? null : timestamp(retiredAtValue);
      const candidate: RecordTypeIdentityDto = {
        schemaVersion: RECORD_DEFINITION_API_SCHEMA_VERSION,
        id: deriveRecordDefinitionId({ brandId, recordTypeKey }),
        brandId,
        key: recordTypeKey,
        deployment: {
          packageType: requireSafeDeploymentReference(identity.packageType),
          searchCore: requireSafeDeploymentReference(identity.searchCore),
        },
        version: storedDataProperty(identity, 'version') ?? 0,
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
        retirement:
          retiredAt === null || retiredByValue == null
            ? null
            : {
                retiredAt,
                retiredBy: storedActor(retiredByValue),
                ...(retirementReason == null ? {} : { reason: retirementReason }),
              },
      };
      const inspected = recordTypeIdentitySchema.safeParse(candidate);
      if (!inspected.success) {
        return lifecycleError('storage-consistency-error', 'Stored record-type status is invalid.');
      }
      return Object.freeze(inspected.data);
    }

    private cloneResultFromAck(acknowledgement: LifecycleOperationAck): RecordDefinitionDraftCloneResult {
      if (acknowledgement.cloneIdentity === null) {
        return lifecycleError('storage-consistency-error', 'The cloned record type acknowledgement is invalid.');
      }
      return Object.freeze({
        identity: acknowledgement.cloneIdentity,
        draft: acknowledgement.draft,
      });
    }

    private async boundedLifecycleOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
      try {
        return await operation();
      } catch (error) {
        return normalizePublicLifecycleError(error as RuntimeValue);
      }
    }

    private async cloneInternal(
      brandIdValue: string,
      sourceRecordTypeKeyValue: string,
      targetRecordTypeKeyValue: string,
      actorValue: RecordDefinitionActorDto,
      expectedActiveRevisionNumber?: number | null
    ): Promise<RecordDefinitionDraftCloneResult> {
      const source = parseBrandAndKey(brandIdValue, sourceRecordTypeKeyValue);
      const target = parseBrandAndKey(brandIdValue, targetRecordTypeKeyValue);
      const actor = parseActor(actorValue);
      if (source.recordTypeKey === target.recordTypeKey) {
        return lifecycleError('clone-target-must-differ', 'A cloned record type must use a new key.');
      }

      const ownership: CloneAttemptOwnership = {
        createStarted: false,
        identityId: randomBytes(12).toString('hex'),
        token: randomUUID(),
        operation: null,
      };
      try {
        const sourceIdentity = await this.findIdentity(source.brandId, source.recordTypeKey);
        if (sourceIdentity === null) {
          return lifecycleError('record-type-not-found', 'The source record type was not found.');
        }
        const resolvedSource = await this.resolveIdentityDraft(sourceIdentity, source.brandId, source.recordTypeKey);
        const sourceActive = await this.activeSnapshot(resolvedSource.identity, source.brandId, source.recordTypeKey);
        if (sourceActive === null) {
          return lifecycleError('active-revision-not-found', 'Only an active record type can be cloned.');
        }
        if (
          expectedActiveRevisionNumber !== undefined &&
          sourceActive.revisionNumber !== positiveRevisionOrNull(expectedActiveRevisionNumber)
        ) {
          return lifecycleError('active-revision-conflict', 'The source active revision changed.');
        }
        const existingTarget = await this.findIdentity(target.brandId, target.recordTypeKey);
        if (existingTarget !== null) {
          await this.resolveIdentityDraft(existingTarget, target.brandId, target.recordTypeKey);
          return lifecycleError('record-type-already-exists', 'The target record type already exists.');
        }

        const targetRecordTypeId = deriveRecordDefinitionId(target);
        const targetDraftId = deriveRecordDefinitionDraftId(target);
        const candidateDefinition = cloneDefinitionForNewIdentity(
          sourceActive.definition,
          target.brandId,
          target.recordTypeKey
        );
        const validation = validateRecordDefinitionDraftPayload({
          brandId: target.brandId,
          recordTypeKey: target.recordTypeKey,
          draftVersion: 0,
          activeRevisionNumber: null,
          definition: candidateDefinition,
        });
        if (!validation.ok) {
          return lifecycleError(
            'draft-validation-failed',
            'The cloned active definition is not safe to save as a draft.',
            validation.report
          );
        }
        const operation = newLifecycleOperation(ownership.token, 'clone', 0, 0, null, {
          baseRevisionId: null,
          baseRevisionNumber: null,
          definition: validation.definition,
          validation: validation.report,
          version: 0,
          updatedBy: actor,
        });
        ownership.operation = operation;
        await this.ensureOperationAckIndexes();

        ownership.createStarted = true;
        const identityQuery = RecordType.create({
          id: ownership.identityId,
          schemaVersion: PERSISTED_RECORD_DEFINITION_SCHEMA_VERSION,
          definitionId: targetRecordTypeId,
          name: target.recordTypeKey,
          branding: target.brandId,
          packageType: requireSafeDeploymentReference(storedDataProperty(sourceIdentity, 'packageType')),
          searchCore: requireSafeDeploymentReference(storedDataProperty(sourceIdentity, 'searchCore')),
          activeRevisionId: null,
          activeRevisionNumber: null,
          draftId: targetDraftId,
          version: 0,
          draftLifecycleToken: ownership.token,
          draftLifecycleKind: 'clone',
          draftLifecycleOperation: operation,
          definitionLifecycleToken: null,
          definitionLifecycleOperation: null,
          createdBy: actor,
          updatedBy: actor,
        }).fetch() as Sails.WaterlinePromise<RecordTypeAttributes>;
        try {
          await this.execute(identityQuery);
        } catch {
          // A unique create can commit before its acknowledgement is lost; reconcile it below.
        }

        const createdIdentity = await this.findIdentity(target.brandId, target.recordTypeKey);
        if (createdIdentity === null) {
          return lifecycleError('storage-consistency-error', 'The cloned record type could not be stored safely.');
        }
        if (storedDataProperty(createdIdentity, 'id') !== ownership.identityId) {
          return lifecycleError('record-type-already-exists', 'The target record type already exists.');
        }
        const acknowledgement = await this.findOperationAck(
          ownership.identityId,
          target.brandId,
          target.recordTypeKey,
          operation
        );
        if (acknowledgement !== null) return this.cloneResultFromAck(acknowledgement);
        const createdOperation = lifecycleOperation(createdIdentity, target.brandId, target.recordTypeKey);
        if (createdOperation === null || createdOperation.token !== ownership.token) {
          return lifecycleError('storage-consistency-error', 'The cloned record type ownership is invalid.');
        }
        const resolved = await this.reconcileLifecycleOperation(
          createdIdentity,
          target.brandId,
          target.recordTypeKey,
          createdOperation
        );
        return this.cloneResultFromAck({
          cloneIdentity: resolved.cloneIdentity,
          draft: resolved.operationDraft,
        });
      } catch (error) {
        if (!ownership.createStarted) throw error;
        let currentIdentity: RecordTypeAttributes | null;
        try {
          currentIdentity = await this.findIdentity(target.brandId, target.recordTypeKey);
        } catch {
          // The token-owned identity, if present, is intentionally left for safe roll-forward recovery.
          return lifecycleError('storage-consistency-error', 'The cloned draft could not be stored safely.');
        }
        if (currentIdentity === null) {
          return lifecycleError('storage-consistency-error', 'The cloned draft could not be stored safely.');
        }
        if (storedDataProperty(currentIdentity, 'id') !== ownership.identityId) {
          return lifecycleError('record-type-already-exists', 'The target record type already exists.');
        }
        if (ownership.operation === null) {
          return lifecycleError('storage-consistency-error', 'The cloned record type ownership is invalid.');
        }
        try {
          const acknowledgement = await this.findOperationAck(
            ownership.identityId,
            target.brandId,
            target.recordTypeKey,
            ownership.operation
          );
          if (acknowledgement !== null) return this.cloneResultFromAck(acknowledgement);
          const currentOperation = lifecycleOperation(currentIdentity, target.brandId, target.recordTypeKey);
          if (currentOperation !== null && currentOperation.token === ownership.token) {
            const resolved = await this.reconcileLifecycleOperation(
              currentIdentity,
              target.brandId,
              target.recordTypeKey,
              currentOperation
            );
            return this.cloneResultFromAck({
              cloneIdentity: resolved.cloneIdentity,
              draft: resolved.operationDraft,
            });
          }
        } catch {
          // The token-owned identity remains authoritative and recoverable after this request fails.
          return lifecycleError('storage-consistency-error', 'The cloned draft could not be stored safely.');
        }
        return lifecycleError('record-type-already-exists', 'The target record type already exists.');
      }
    }

    public async clone(
      brandIdValue: string,
      sourceRecordTypeKeyValue: string,
      targetRecordTypeKeyValue: string,
      actorValue: RecordDefinitionActorDto,
      expectedActiveRevisionNumber?: number | null
    ): Promise<RecordDefinitionDraftCloneResult> {
      return this.boundedLifecycleOperation(() =>
        this.cloneInternal(
          brandIdValue,
          sourceRecordTypeKeyValue,
          targetRecordTypeKeyValue,
          actorValue,
          expectedActiveRevisionNumber
        )
      );
    }

    public async get(brandIdValue: string, recordTypeKeyValue: string): Promise<RecordDefinitionDraftDto | null> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        const identity = await this.findIdentity(brandId, recordTypeKey);
        if (identity === null) return null;
        const resolved = await this.resolveIdentityDraft(identity, brandId, recordTypeKey);
        return resolved.draft === null ? null : draftDto(resolved.draft);
      });
    }

    public async save(
      brandIdValue: string,
      recordTypeKeyValue: string,
      requestValue: RecordDefinitionDraftSaveRequestDto,
      actorValue: RecordDefinitionActorDto
    ): Promise<RecordDefinitionDraftMutationResult> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        const actor = parseActor(actorValue);
        const inspectedRequest = recordDefinitionDraftSaveRequestSchema.safeParse(requestValue);
        if (!inspectedRequest.success) {
          return lifecycleError('invalid-draft-save-request', 'The draft save request is invalid.');
        }
        const request = inspectedRequest.data;
        const coordinates = await this.mutationCoordinates(brandId, recordTypeKey);
        const currentDraft = draftDto(coordinates.draft);
        if (request.expectedActiveRevisionNumber !== coordinates.activeRevisionNumber) {
          return activeConflict(coordinates, request.expectedActiveRevisionNumber);
        }
        if (request.expectedDraftVersion !== storedDataProperty(coordinates.draft, 'version')) {
          return versionConflict(coordinates, request.expectedDraftVersion, request.expectedActiveRevisionNumber);
        }

        const nextVersion = draftVersion(request.expectedDraftVersion) + 1;
        const validation = validateRecordDefinitionDraftPayload({
          brandId,
          recordTypeKey,
          draftVersion: nextVersion,
          activeRevisionNumber: coordinates.activeRevisionNumber,
          definition: request.definition,
        });
        if (!validation.ok) {
          return lifecycleError(
            'draft-validation-failed',
            'The draft definition failed save-time safety validation.',
            validation.report
          );
        }
        return this.commitDraftMutation(
          coordinates,
          request.expectedDraftVersion,
          request.expectedActiveRevisionNumber,
          {
            baseRevisionId:
              currentDraft.baseRevisionNumber === null
                ? null
                : deriveRecordDefinitionRevisionId({ brandId, recordTypeKey }, currentDraft.baseRevisionNumber),
            baseRevisionNumber: currentDraft.baseRevisionNumber,
            definition: validation.definition,
            validation: validation.report,
            version: nextVersion,
            updatedBy: actor,
          },
          'save'
        );
      });
    }

    public async discard(
      brandIdValue: string,
      recordTypeKeyValue: string,
      expectedDraftVersionValue: number,
      expectedActiveRevisionNumberValue: number | null,
      actorValue: RecordDefinitionActorDto
    ): Promise<RecordDefinitionDraftMutationResult> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        const actor = parseActor(actorValue);
        const expectedDraftVersion = draftVersion(expectedDraftVersionValue);
        const expectedActiveRevisionNumber = positiveRevisionOrNull(expectedActiveRevisionNumberValue);
        const coordinates = await this.mutationCoordinates(brandId, recordTypeKey);
        if (expectedActiveRevisionNumber !== coordinates.activeRevisionNumber) {
          return activeConflict(coordinates, expectedActiveRevisionNumber);
        }
        if (expectedDraftVersion !== storedDataProperty(coordinates.draft, 'version')) {
          return versionConflict(coordinates, expectedDraftVersion, expectedActiveRevisionNumber);
        }
        const active = await this.activeSnapshot(coordinates.identity, brandId, recordTypeKey);
        if (active === null) {
          return lifecycleError(
            'draft-reset-requires-active-revision',
            'A draft without an active revision cannot be reset.'
          );
        }
        const nextVersion = expectedDraftVersion + 1;
        const validation = validateRecordDefinitionDraftPayload({
          brandId,
          recordTypeKey,
          draftVersion: nextVersion,
          activeRevisionNumber: active.revisionNumber,
          definition: draftDefinitionFromActive(active.definition),
        });
        if (!validation.ok) {
          return lifecycleError(
            'draft-validation-failed',
            'The active definition could not be reconstructed as a safe draft.',
            validation.report
          );
        }
        return this.commitDraftMutation(
          coordinates,
          expectedDraftVersion,
          expectedActiveRevisionNumber,
          {
            baseRevisionId: active.id,
            baseRevisionNumber: active.revisionNumber,
            definition: validation.definition,
            validation: validation.report,
            version: nextVersion,
            updatedBy: actor,
          },
          'discard'
        );
      });
    }

    /** Keyset pagination; never return mutable Waterline rows or another brand's identities. */
    public async list(brandIdValue: string, after: string = ''): Promise<readonly RecordTypeIdentityDto[]> {
      return this.boundedLifecycleOperation(async () => {
        const brandId = parseRecordDefinitionBrandId(brandIdValue);
        if (after !== '') parseRecordDefinitionKey(after);
        const rows = await (
          RecordType.find({
            branding: brandId,
            definitionId: { '!=': null },
            ...(after === '' ? {} : { name: { '>': after } }),
          }) as object as {
            sort(order: string): { limit(count: number): Promise<RecordTypeAttributes[]> };
          }
        )
          .sort('name ASC')
          .limit(100);
        const result: RecordTypeIdentityDto[] = [];
        for (const row of rows) {
          const key = storedDataProperty(row, 'name');
          if (typeof key !== 'string' || storedBrandId(row) !== brandId) {
            return lifecycleError('storage-consistency-error', 'Stored identity is invalid.');
          }
          const identity = await this.getStatus(brandId, key);
          if (identity !== null) result.push(identity);
        }
        return Object.freeze(result);
      });
    }

    public async getStatus(brandIdValue: string, recordTypeKeyValue: string): Promise<RecordTypeIdentityDto | null> {
      return this.boundedLifecycleOperation(async () => {
        const { brandId, recordTypeKey } = parseBrandAndKey(brandIdValue, recordTypeKeyValue);
        const identity = await this.findIdentity(brandId, recordTypeKey);
        if (identity === null) return null;
        const resolved = await this.resolveIdentityDraft(identity, brandId, recordTypeKey);
        const active = await this.activeSnapshot(resolved.identity, brandId, recordTypeKey);
        return this.identityDto(
          resolved.identity,
          brandId,
          recordTypeKey,
          resolved.draft === null ? null : draftDto(resolved.draft),
          active
        );
      });
    }
  }
}

declare global {
  const RecordDefinitionDraftService: Services.RecordDefinitionDraftLifecycle;
}
