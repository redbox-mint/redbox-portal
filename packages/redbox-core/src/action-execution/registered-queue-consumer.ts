import {
  actionJsonObjectSchema,
  parseActionBinding,
  parseActionContext,
  type ActionContext,
  type ActionJsonObject,
} from '../action-registry/contracts';
import { ACTION_CONTEXT_SCHEMA_VERSION, ACTION_PLAN_SCHEMA_VERSION } from '../action-registry/limits';
import {
  deriveStableActionBindingId,
  type ActionBindingScope,
  type ActionExecutionMode,
} from '../action-registry/identifiers';
import {
  parseRegisteredRecordActionQueueJob,
  type RegisteredRecordActionQueuePayload,
} from '../action-registry/registeredActionQueue';
import type { RedboxActionRegistry } from '../action-registry/registration';
import type { ActionSecretProvider } from '../action-registry/secrets';
import type { RuntimeValue } from '../runtimeValues';
import { createActionExecutionOperation } from './executor';
import { ActionDomainFailure, ActionValidationFailure } from './failure';
import { createRegisteredActionExecutor } from './registered-executor';
import type { ActionExecutionResult } from './types';

export interface RegisteredRecordActionQueueConsumerDependencies {
  readonly registry: RedboxActionRegistry;
  readonly provider: ActionSecretProvider;
  readonly loadRecord: (oid: string, mode: ActionExecutionMode) => Promise<RuntimeValue>;
}

function invalidQueueExecution(): never {
  throw new ActionValidationFailure('Registered record action queue execution is invalid.');
}

function revisionOf(record: Readonly<ActionJsonObject>): number {
  const revision = record.revision ?? 0;
  if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) {
    return invalidQueueExecution();
  }
  return revision;
}

async function authoritativeRecord(
  payload: RegisteredRecordActionQueuePayload,
  dependencies: RegisteredRecordActionQueueConsumerDependencies
): Promise<ActionJsonObject> {
  const oid = payload.context.record.oid;
  const identity = payload.context.record.candidate;
  if (oid === undefined || identity === undefined) {
    return invalidQueueExecution();
  }
  const loadedResult = actionJsonObjectSchema.safeParse(await dependencies.loadRecord(oid, payload.context.scope.mode));
  if (!loadedResult.success) {
    return invalidQueueExecution();
  }
  const loaded = loadedResult.data;
  if ((loaded.redboxOid !== undefined && loaded.redboxOid !== oid) || revisionOf(loaded) !== revisionOf(identity)) {
    return invalidQueueExecution();
  }
  return loaded;
}

function executionContext(
  payload: RegisteredRecordActionQueuePayload,
  record: Readonly<ActionJsonObject>
): ActionContext {
  return parseActionContext({
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId: payload.context.executionId,
    correlationId: payload.context.correlationId,
    ...(payload.context.requestId === undefined ? {} : { requestId: payload.context.requestId }),
    timestamp: payload.context.timestamp,
    brandId: payload.context.brandId,
    recordTypeKey: payload.context.recordTypeKey,
    scope: payload.context.scope,
    actor: null,
    record: { oid: payload.context.record.oid, current: record, candidate: record },
    priorOutputs: [],
  });
}

function actionPlan(payload: RegisteredRecordActionQueuePayload) {
  const scope: ActionBindingScope = payload.context.scope;
  const stableKey = 'registered-queue-consumer';
  const binding = parseActionBinding({
    schemaVersion: 1,
    id: deriveStableActionBindingId({
      recordTypeKey: payload.context.recordTypeKey,
      scope,
      actionId: payload.actionId,
      contractVersion: payload.contractVersion,
      stableKey,
    }),
    stableKey,
    actionId: payload.actionId,
    contractVersion: payload.contractVersion,
    scope,
    parameters: payload.parameters,
    order: 0,
  });
  return Object.freeze({
    schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
    recordTypeKey: payload.context.recordTypeKey,
    bindings: Object.freeze([binding]),
  });
}

export async function consumeRegisteredRecordActionQueueJob(
  job: RuntimeValue,
  dependencies: RegisteredRecordActionQueueConsumerDependencies
): Promise<ActionExecutionResult> {
  const payload = parseRegisteredRecordActionQueueJob(job);
  const lookup = dependencies.registry.lookup(payload.actionId, payload.contractVersion);
  if (lookup.status !== 'available') {
    return invalidQueueExecution();
  }
  const record = await authoritativeRecord(payload, dependencies);
  const context = executionContext(payload, record);
  const operation = createActionExecutionOperation(context.scope.mode, context.requestId, context.record.oid, {
    uuid: () => context.executionId,
    now: () => new Date(context.timestamp),
  });
  const completed = new Promise<void>(resolve => {
    operation.onDetachedComplete = resolve;
  });
  createRegisteredActionExecutor(dependencies.registry, dependencies.provider).dispatchDetached(
    actionPlan(payload),
    context,
    operation
  );
  await completed;
  const result = operation.detachedResults?.[0];
  if (result === undefined || result.actionId !== payload.actionId || result.status !== 'succeeded') {
    throw new ActionDomainFailure(
      'Queued registered action execution failed.',
      result?.failure?.code ?? 'queued-action-execution-failed'
    );
  }
  return result;
}
