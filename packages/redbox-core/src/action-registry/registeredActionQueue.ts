import { boundedValidationPreflight } from '../boundedValidation';
import { REGISTERED_RECORD_ACTION_JOB_NAME } from '../config/agendaQueue.config';
import { isRuntimeRecord, type RuntimeRecord, type RuntimeValue } from '../runtimeValues';
import { ActionValidationFailure } from '../action-execution/failure';
import {
  actionParameterValuesSchema,
  parseActionContext,
  type ActionContext,
  type ActionJsonObject,
  type ActionParameterValues,
} from './contracts';
import { actionDefinitionIdSchema, type ActionDefinitionId } from './identifiers';
import { ACTION_CONTRACT_LIMITS, ACTION_CONTEXT_SCHEMA_VERSION } from './limits';

export const REGISTERED_RECORD_ACTION_PAYLOAD_SCHEMA_VERSION = 1 as const;
export const QUEUE_DISPATCH_ACTION_ID = 'redbox.core.queue.dispatch-record-action' as const;

export interface RegisteredRecordActionQueuePayload {
  readonly schemaVersion: typeof REGISTERED_RECORD_ACTION_PAYLOAD_SCHEMA_VERSION;
  readonly kind: 'registered-record-action';
  readonly actionId: ActionDefinitionId;
  readonly contractVersion: number;
  readonly parameters: Readonly<ActionParameterValues>;
  readonly context: Readonly<ActionContext>;
}

interface RegisteredRecordActionQueuePayloadInput {
  readonly actionId: ActionDefinitionId;
  readonly contractVersion: number;
  readonly parameters: Readonly<ActionParameterValues>;
  readonly context: Readonly<ActionContext>;
}

const PAYLOAD_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'actionId',
  'contractVersion',
  'parameters',
  'context',
] as const);
const RECORD_KEYS = Object.freeze(['oid', 'candidate'] as const);
const IDENTITY_KEYS = Object.freeze(['redboxOid', 'revision'] as const);

function invalidQueuePayload(): never {
  throw new ActionValidationFailure('Registered record action queue payload is invalid.');
}

function hasExactKeys(value: RuntimeRecord, allowedKeys: readonly string[]): boolean {
  const keys = Object.keys(value);
  return keys.length === allowedKeys.length && keys.every(key => allowedKeys.includes(key));
}

function ownDataValue(value: RuntimeRecord, key: string): RuntimeValue {
  const descriptor = Object.getOwnPropertyDescriptor(value, key);
  return descriptor !== undefined && 'value' in descriptor ? descriptor.value : undefined;
}

function freezeRuntimeTree<Value extends object>(value: Value): Value {
  const pending: object[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || seen.has(current)) {
      continue;
    }
    seen.add(current);
    for (const child of Object.values(current)) {
      if (child !== null && typeof child === 'object') {
        pending.push(child);
      }
    }
    Object.freeze(current);
  }
  return value;
}

function queueRevision(candidate: Readonly<ActionJsonObject>): number {
  const revision = candidate.revision ?? 0;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    return invalidQueuePayload();
  }
  return revision;
}

function recordIdentity(context: Readonly<ActionContext>): Readonly<ActionJsonObject> {
  const candidate = context.record.candidate;
  const oid = context.record.oid;
  if (candidate === undefined || oid === undefined || oid.trim() === '') {
    return invalidQueuePayload();
  }
  const candidateOid = candidate.redboxOid;
  if (candidateOid !== undefined && candidateOid !== oid) {
    return invalidQueuePayload();
  }
  return Object.freeze({ redboxOid: oid, revision: queueRevision(candidate) });
}

function queuedContext(context: Readonly<ActionContext>): ActionContext {
  const identity = recordIdentity(context);
  return parseActionContext({
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId: context.executionId,
    correlationId: context.correlationId,
    ...(context.requestId === undefined ? {} : { requestId: context.requestId }),
    timestamp: context.timestamp,
    brandId: context.brandId,
    recordTypeKey: context.recordTypeKey,
    scope: {
      context: 'queued-record-action',
      mode: context.scope.mode,
      phase: context.scope.phase,
      ...('scopeId' in context.scope && context.scope.scopeId !== undefined ? { scopeId: context.scope.scopeId } : {}),
    },
    actor: null,
    record: { oid: identity.redboxOid, candidate: identity },
    priorOutputs: [],
  });
}

export function createRegisteredRecordActionQueuePayload(
  input: RegisteredRecordActionQueuePayloadInput
): RegisteredRecordActionQueuePayload {
  return parseRegisteredRecordActionQueuePayload({
    schemaVersion: REGISTERED_RECORD_ACTION_PAYLOAD_SCHEMA_VERSION,
    kind: 'registered-record-action',
    actionId: input.actionId,
    contractVersion: input.contractVersion,
    parameters: input.parameters,
    context: queuedContext(input.context),
  });
}

function validatePersistedContext(context: ActionContext): void {
  if (
    context.scope.context !== 'queued-record-action' ||
    context.scope.phase !== 'post' ||
    context.actor !== null ||
    context.priorOutputs.length !== 0 ||
    context.transition !== undefined ||
    context.record.current !== undefined ||
    !hasExactKeys(context.record, RECORD_KEYS)
  ) {
    invalidQueuePayload();
  }
  const candidate = context.record.candidate;
  if (
    candidate === undefined ||
    !hasExactKeys(candidate, IDENTITY_KEYS) ||
    candidate.redboxOid !== context.record.oid
  ) {
    invalidQueuePayload();
  }
  queueRevision(candidate);
}

export function parseRegisteredRecordActionQueuePayload(value: RuntimeValue): RegisteredRecordActionQueuePayload {
  const preflight = boundedValidationPreflight(value, {
    maxBytes: ACTION_CONTRACT_LIMITS.maxContractBytes,
    maxDepth: ACTION_CONTRACT_LIMITS.maxPlanDepth,
    maxStringLength: ACTION_CONTRACT_LIMITS.maxStringValueLength,
    maxPropertyNameLength: ACTION_CONTRACT_LIMITS.maxIdentifierLength,
    maxWork: ACTION_CONTRACT_LIMITS.maxValidationWork,
    arrayCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxArrayItems,
    objectCardinalityLimit: () => ACTION_CONTRACT_LIMITS.maxObjectProperties,
  });
  if (!preflight.ok || !isRuntimeRecord(value) || !hasExactKeys(value, PAYLOAD_KEYS)) {
    return invalidQueuePayload();
  }
  if (
    ownDataValue(value, 'schemaVersion') !== REGISTERED_RECORD_ACTION_PAYLOAD_SCHEMA_VERSION ||
    ownDataValue(value, 'kind') !== 'registered-record-action'
  ) {
    return invalidQueuePayload();
  }
  const actionIdResult = actionDefinitionIdSchema.safeParse(ownDataValue(value, 'actionId'));
  const contractVersion = ownDataValue(value, 'contractVersion');
  const parametersResult = actionParameterValuesSchema.safeParse(ownDataValue(value, 'parameters'));
  if (
    !actionIdResult.success ||
    actionIdResult.data === QUEUE_DISPATCH_ACTION_ID ||
    typeof contractVersion !== 'number' ||
    !Number.isSafeInteger(contractVersion) ||
    contractVersion < 1 ||
    !parametersResult.success ||
    Object.values(parametersResult.data).some(parameter => parameter.kind === 'secret')
  ) {
    return invalidQueuePayload();
  }
  let context: ActionContext;
  try {
    context = parseActionContext(ownDataValue(value, 'context'));
  } catch {
    return invalidQueuePayload();
  }
  validatePersistedContext(context);
  return Object.freeze({
    schemaVersion: REGISTERED_RECORD_ACTION_PAYLOAD_SCHEMA_VERSION,
    kind: 'registered-record-action',
    actionId: actionIdResult.data,
    contractVersion,
    parameters: freezeRuntimeTree(parametersResult.data),
    context,
  });
}

export function parseRegisteredRecordActionQueueJob(value: RuntimeValue): RegisteredRecordActionQueuePayload {
  if (!isRuntimeRecord(value)) {
    return invalidQueuePayload();
  }
  const attrs = ownDataValue(value, 'attrs');
  if (!isRuntimeRecord(attrs) || ownDataValue(attrs, 'name') !== REGISTERED_RECORD_ACTION_JOB_NAME) {
    return invalidQueuePayload();
  }
  return parseRegisteredRecordActionQueuePayload(ownDataValue(attrs, 'data'));
}
