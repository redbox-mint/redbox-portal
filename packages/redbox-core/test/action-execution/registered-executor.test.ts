import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { ActionExecutionDependencies } from '../../src/action-execution';
import {
  ActionPlanValidationError,
  ActionTransientFailure,
  createActionExecutionOperation,
  createActionExecutionSupervisor,
  projectRecordHookExecutionAuditSummary,
} from '../../src/action-execution';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_CONTRACT_SCHEMA_VERSION,
  ACTION_PLAN_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
  actionRegistrationSource,
  buildActionRegistry,
  createActionSecretProvider,
  createActionSecretSlotIdentity,
  deriveStableActionBindingId,
  parseActionBinding,
  parseActionDefinitionId,
  type ActionBinding,
  type ActionBindingScope,
  type ActionDefinitionId,
  type ActionHandler,
  type ActionJsonObject,
  type ActionOutputField,
  type ActionParameterDefinition,
  type ActionParameterValues,
  type ActionRegistrationDescriptor,
  type ActionResult,
  type ActionSecretProvider,
  type ActionSecretSlotIdentity,
  type ActionSecretStorage,
  type RedboxActionRegistry,
} from '../../src/action-registry';
import * as PublicActionExecution from '../../src/action-execution';
import * as PublicActionRegistry from '../../src/action-registry';
import {
  createRegisteredActionExecutor,
  type RegisteredActionExecutor,
} from '../../src/action-execution/registered-executor';

interface DescriptorOptions {
  readonly id: string;
  readonly handler: ActionHandler;
  readonly scope: ActionBindingScope;
  readonly parameters?: readonly ActionParameterDefinition[];
  readonly outputFields?: readonly ActionOutputField[];
  readonly safeFields?: readonly string[];
  readonly allowedKinds?: readonly ActionResult['kind'][];
  readonly patchPrefixes?: readonly string[];
  readonly retry?:
    | { readonly allowed: false }
    | {
        readonly allowed: true;
        readonly defaultMaxAttempts: number;
        readonly maxAttempts: number;
        readonly maxDelayMs: number;
      };
  readonly timeout?: { readonly defaultMs: number; readonly minMs: number; readonly maxMs: number };
}

class MemorySecretStorage implements ActionSecretStorage {
  readonly values = new Map<string, string>();

  async replace(slot: ActionSecretSlotIdentity, value: string): Promise<void> {
    this.values.set(slot.id, value);
  }

  async clear(slot: ActionSecretSlotIdentity): Promise<void> {
    this.values.delete(slot.id);
  }

  async resolve(slot: ActionSecretSlotIdentity): Promise<string | undefined> {
    return this.values.get(slot.id);
  }

  async isConfigured(slot: ActionSecretSlotIdentity): Promise<boolean> {
    return this.values.has(slot.id);
  }
}

function descriptor(options: DescriptorOptions): ActionRegistrationDescriptor {
  const id = parseActionDefinitionId(options.id);
  const allowedKinds = options.allowedKinds ?? ['no-change'];
  return {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id,
    contractVersion: 1,
    title: options.id,
    description: `Registered executor test action ${options.id}.`,
    category: 'test',
    handler: options.handler,
    contexts: [options.scope.context],
    modes: [options.scope.mode],
    phases: [options.scope.phase],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: options.parameters ?? [],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: options.outputFields ?? [],
      safeFields: options.safeFields ?? [],
    },
    resultContract: {
      allowedKinds,
      ...(allowedKinds.includes('patch')
        ? {
            patch: {
              allowedPathPrefixes: options.patchPrefixes ?? ['/metadata'],
              maxOperations: 10,
            },
          }
        : {}),
    },
    executionPolicy: {
      timeout: options.timeout ?? { defaultMs: 1_000, minMs: 10, maxMs: 2_000 },
      retry: options.retry ?? { allowed: false },
    },
  };
}

function registry(descriptors: readonly ActionRegistrationDescriptor[]): RedboxActionRegistry {
  const register = (): readonly ActionRegistrationDescriptor[] => descriptors;
  return buildActionRegistry([actionRegistrationSource('@researchdatabox/a08-test', 'actions/index', register)]);
}

function binding(
  recordTypeKey: string,
  actionId: ActionDefinitionId,
  scope: ActionBindingScope,
  stableKey: string,
  order: number,
  options: {
    readonly parameters?: ActionParameterValues;
    readonly dependencies?: ActionBinding['dependencies'];
    readonly policyOverrides?: ActionBinding['policyOverrides'];
  } = {}
): ActionBinding {
  return parseActionBinding({
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: deriveStableActionBindingId({ recordTypeKey, scope, actionId, contractVersion: 1, stableKey }),
    stableKey,
    actionId,
    contractVersion: 1,
    scope,
    parameters: options.parameters ?? {},
    order,
    ...(options.dependencies === undefined ? {} : { dependencies: options.dependencies }),
    ...(options.policyOverrides === undefined ? {} : { policyOverrides: options.policyOverrides }),
  });
}

function plan(recordTypeKey: string, bindings: readonly ActionBinding[]): object {
  return { schemaVersion: ACTION_PLAN_SCHEMA_VERSION, recordTypeKey, bindings };
}

function actionContext(
  executionId: string,
  scope: ActionBindingScope,
  candidate: ActionJsonObject,
  options: { readonly brandId?: string; readonly recordTypeKey?: string; readonly oid?: string } = {}
): object {
  return {
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId,
    correlationId: 'correlation-a08',
    timestamp: '2026-08-28T00:00:00.000Z',
    brandId: options.brandId ?? 'brand-alpha',
    recordTypeKey: options.recordTypeKey ?? 'dataset',
    scope,
    actor: { id: 'actor-1', username: 'tester', roles: ['Admin'] },
    record: {
      ...(options.oid === undefined ? {} : { oid: options.oid }),
      current: { metadata: { title: 'Current' } },
      candidate,
    },
    priorOutputs: [],
  };
}

function executorHarness(
  descriptors: readonly ActionRegistrationDescriptor[],
  dependencies: ActionExecutionDependencies = {}
): {
  readonly registry: RedboxActionRegistry;
  readonly storage: MemorySecretStorage;
  readonly provider: ActionSecretProvider;
  readonly executor: RegisteredActionExecutor;
} {
  const applicationRegistry = registry(descriptors);
  const storage = new MemorySecretStorage();
  const provider = createActionSecretProvider(storage);
  return {
    registry: applicationRegistry,
    storage,
    provider,
    executor: createRegisteredActionExecutor(applicationRegistry, provider, dependencies),
  };
}

function tick(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

function forbiddenTypeKeywords(sourceFile: ts.SourceFile): readonly string[] {
  const failures: string[] = [];
  const visit = (node: ts.Node): void => {
    if (node.kind === ts.SyntaxKind.AnyKeyword || node.kind === ts.SyntaxKind.UnknownKeyword) {
      const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      failures.push(
        `${sourceFile.fileName}:${position.line + 1}:${position.character + 1}:${node.getText(sourceFile)}`
      );
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return failures;
}

describe('registered action executor', () => {
  const preScope: ActionBindingScope = {
    context: 'record-lifecycle',
    mode: 'onCreate',
    phase: 'pre',
  };
  const postSyncScope: ActionBindingScope = {
    context: 'record-lifecycle',
    mode: 'onUpdate',
    phase: 'postSync',
  };
  const postScope: ActionBindingScope = {
    context: 'record-lifecycle',
    mode: 'onCreate',
    phase: 'post',
  };

  it('isolates direct mutation and threads only validated patches through sequential actions', async () => {
    const authoritative = { metadata: { title: 'Original' } };
    let observerTitle = '';
    const mutateId = parseActionDefinitionId('org.redbox.a08.mutate');
    const observeId = parseActionDefinitionId('org.redbox.a08.observe');
    const descriptors = [
      descriptor({
        id: mutateId,
        scope: preScope,
        allowedKinds: ['patch'],
        patchPrefixes: ['/metadata'],
        handler: context => {
          const metadata = context.record.candidate?.metadata as Record<string, string>;
          assert.equal(Object.isFrozen(context), true);
          assert.equal(Object.isFrozen(context.record.candidate), true);
          try {
            metadata.title = 'Direct mutation';
          } catch {
            // Strict-mode mutation of the frozen public copy is expected.
          }
          return {
            schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
            kind: 'patch',
            patch: [{ op: 'replace', path: '/metadata/title', value: 'Patched' }],
          };
        },
      }),
      descriptor({
        id: observeId,
        scope: preScope,
        handler: context => {
          observerTitle = String((context.record.candidate?.metadata as Record<string, string>).title);
          return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
        },
      }),
    ];
    const first = binding('dataset', mutateId, preScope, 'mutate', 10);
    const second = binding('dataset', observeId, preScope, 'observe', 20);
    const operation = createActionExecutionOperation('onCreate');
    const harness = executorHarness(descriptors);

    const outcome = await harness.executor.runSequential(
      plan('dataset', [first, second]),
      actionContext(operation.executionId, preScope, authoritative),
      operation
    );

    assert.deepEqual(authoritative, { metadata: { title: 'Original' } });
    assert.deepEqual(outcome.candidate, { metadata: { title: 'Patched' } });
    assert.equal(observerTitle, 'Patched');
    assert.deepEqual(
      outcome.report.actions.map(action => action.status),
      ['succeeded', 'succeeded']
    );
    assert.equal(operation.reports[0], outcome.report);
  });

  it('fails invalid patch application and malformed replacements closed before later side effects', async () => {
    let laterInvocations = 0;
    const patchId = parseActionDefinitionId('org.redbox.a08.invalid-patch');
    const laterId = parseActionDefinitionId('org.redbox.a08.after-invalid');
    const invalidPatch = descriptor({
      id: patchId,
      scope: preScope,
      allowedKinds: ['patch'],
      patchPrefixes: ['/metadata'],
      handler: () => ({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'patch',
        patch: [{ op: 'replace', path: '/metadata/missing/title', value: 'unsafe' }],
      }),
    });
    const later = descriptor({
      id: laterId,
      scope: preScope,
      handler: () => {
        laterInvocations += 1;
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const operation = createActionExecutionOperation('onCreate');
    const harness = executorHarness([invalidPatch, later]);
    const outcome = await harness.executor.runSequential(
      plan('dataset', [
        binding('dataset', patchId, preScope, 'invalid', 10),
        binding('dataset', laterId, preScope, 'later', 20),
      ]),
      actionContext(operation.executionId, preScope, { metadata: { title: 'Original' } }),
      operation
    );

    assert.deepEqual(outcome.candidate, { metadata: { title: 'Original' } });
    assert.equal(laterInvocations, 0);
    assert.deepEqual(
      outcome.report.actions.map(action => action.status),
      ['failed', 'skipped']
    );
    assert.deepEqual(outcome.report.actions[0]?.failure, {
      kind: 'validation',
      code: 'action-validation-failed',
    });

    const replacementId = parseActionDefinitionId('org.redbox.a08.invalid-replacement');
    const malformedReplacement = descriptor({
      id: replacementId,
      scope: preScope,
      allowedKinds: ['replace'],
      handler: (() => ({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'replace',
        candidate: { metadata: { title: undefined } },
      })) as never,
    });
    const replacementOperation = createActionExecutionOperation('onCreate');
    const replacementHarness = executorHarness([malformedReplacement]);
    const replacement = await replacementHarness.executor.runSequential(
      plan('dataset', [binding('dataset', replacementId, preScope, 'replacement', 10)]),
      actionContext(replacementOperation.executionId, preScope, { metadata: { title: 'Authoritative' } }),
      replacementOperation
    );
    assert.deepEqual(replacement.candidate, { metadata: { title: 'Authoritative' } });
    assert.equal(replacement.report.actions[0]?.status, 'failed');
  });

  it('fails malformed detached replacements without changing the persisted snapshot', async () => {
    const actionId = parseActionDefinitionId('org.redbox.a08.detached-invalid-replacement');
    const action = descriptor({
      id: actionId,
      scope: postScope,
      allowedKinds: ['replace'],
      handler: (() => ({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'replace',
        candidate: { metadata: { title: undefined } },
      })) as never,
    });
    const operation = createActionExecutionOperation('onCreate');
    const completed = new Promise<void>(resolve => {
      operation.onDetachedComplete = resolve;
    });
    const harness = executorHarness([action]);
    const outcome = harness.executor.dispatchDetached(
      plan('dataset', [binding('dataset', actionId, postScope, 'invalid-replacement', 10)]),
      actionContext(operation.executionId, postScope, { metadata: { title: 'Persisted' } }),
      operation
    );

    await completed;
    assert.deepEqual(outcome.candidate, { metadata: { title: 'Persisted' } });
    assert.deepEqual(operation.detachedResults?.[0]?.failure, {
      kind: 'validation',
      code: 'action-validation-failed',
    });
  });

  it('exposes only bounded descriptor-safe redacted outputs to dependencies', async () => {
    const producerId = parseActionDefinitionId('org.redbox.a08.safe-output');
    const consumerId = parseActionDefinitionId('org.redbox.a08.safe-consumer');
    let priorOutput: ActionJsonObject | undefined;
    const outputFields: readonly ActionOutputField[] = [
      { name: 'publicLabel', title: 'Public', kind: 'string', required: true },
      { name: 'apiToken', title: 'Token', kind: 'string', required: true },
      { name: 'details', title: 'Details', kind: 'json', required: true },
    ];
    const producer = descriptor({
      id: producerId,
      scope: preScope,
      outputFields,
      safeFields: ['publicLabel', 'apiToken', 'details'],
      handler: () => ({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'no-change',
        output: {
          schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
          fields: {
            publicLabel: 'visible',
            apiToken: 'must-not-project',
            details: { visible: true, secretToken: 'must-not-project' },
          },
        },
      }),
    });
    const producerBinding = binding('dataset', producerId, preScope, 'producer', 10);
    const consumer = descriptor({
      id: consumerId,
      scope: preScope,
      handler: context => {
        priorOutput = context.priorOutputs[0]?.output.fields;
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const consumerBinding = binding('dataset', consumerId, preScope, 'consumer', 20, {
      dependencies: [
        {
          bindingId: producerBinding.id,
          condition: 'output-equals',
          field: 'details',
          value: { visible: true },
        },
      ],
    });
    const operation = createActionExecutionOperation('onCreate');
    const harness = executorHarness([producer, consumer]);
    const outcome = await harness.executor.runSequential(
      plan('dataset', [producerBinding, consumerBinding]),
      actionContext(operation.executionId, preScope, { metadata: { title: 'Safe' } }),
      operation
    );

    assert.deepEqual(priorOutput, { details: { visible: true } });
    assert.deepEqual(outcome.safeOutputs[0]?.output.fields, {
      publicLabel: 'visible',
      details: { visible: true },
    });
    assert.equal(JSON.stringify([priorOutput, outcome.safeOutputs]).includes('must-not-project'), false);
    assert.equal(Object.isFrozen(outcome.safeOutputs[0]?.output.fields), true);
  });

  it('records unmet dependencies as skips while independent sequential actions continue', async () => {
    const producerId = parseActionDefinitionId('org.redbox.a08.dependency-producer');
    const skippedId = parseActionDefinitionId('org.redbox.a08.dependency-skipped');
    const independentId = parseActionDefinitionId('org.redbox.a08.dependency-independent');
    const invoked: string[] = [];
    const producer = descriptor({
      id: producerId,
      scope: preScope,
      outputFields: [{ name: 'ready', title: 'Ready', kind: 'boolean', required: true }],
      safeFields: ['ready'],
      handler: () => ({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'no-change',
        output: { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, fields: { ready: false } },
      }),
    });
    const producerBinding = binding('dataset', producerId, preScope, 'producer', 10);
    const skipped = descriptor({
      id: skippedId,
      scope: preScope,
      handler: () => {
        invoked.push('skipped');
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const independent = descriptor({
      id: independentId,
      scope: preScope,
      handler: () => {
        invoked.push('independent');
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const skippedBinding = binding('dataset', skippedId, preScope, 'skipped', 20, {
      dependencies: [{ bindingId: producerBinding.id, condition: 'output-equals', field: 'ready', value: true }],
    });
    const operation = createActionExecutionOperation('onCreate');
    const harness = executorHarness([producer, skipped, independent]);
    const outcome = await harness.executor.runSequential(
      plan('dataset', [
        producerBinding,
        skippedBinding,
        binding('dataset', independentId, preScope, 'independent', 30),
      ]),
      actionContext(operation.executionId, preScope, { metadata: { title: 'Dependencies' } }),
      operation
    );

    assert.deepEqual(invoked, ['independent']);
    assert.deepEqual(
      outcome.report.actions.map(action => action.status),
      ['succeeded', 'skipped', 'succeeded']
    );
    assert.equal(outcome.report.actions[1]?.skippedReason, 'trigger_disabled');
  });

  it('rejects malformed and unknown complete plans before any handler side effect', async () => {
    const knownId = parseActionDefinitionId('org.redbox.a08.known');
    const unknownId = parseActionDefinitionId('org.redbox.a08.unknown');
    let sideEffects = 0;
    const known = descriptor({
      id: knownId,
      scope: preScope,
      handler: () => {
        sideEffects += 1;
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const unknownBinding = binding('dataset', unknownId, postScope, 'unknown', 10);
    const operation = createActionExecutionOperation('onCreate');
    const harness = executorHarness([known]);

    await assert.rejects(
      harness.executor.runSequential(
        plan('dataset', [binding('dataset', knownId, preScope, 'known', 10), unknownBinding]),
        actionContext(operation.executionId, preScope, { metadata: { title: 'No side effects' } }),
        operation
      ),
      ActionPlanValidationError
    );
    await assert.rejects(
      harness.executor.runSequential(
        { schemaVersion: ACTION_PLAN_SCHEMA_VERSION, recordTypeKey: 'dataset', bindings: {} },
        actionContext(operation.executionId, preScope, { metadata: { title: 'Malformed' } }),
        operation
      ),
      ActionPlanValidationError
    );
    assert.equal(sideEffects, 0);
    assert.deepEqual(operation.reports, []);
  });

  it('retains retry, timeout, idempotency, and non-cooperative cancellation metadata', async () => {
    const retryId = parseActionDefinitionId('org.redbox.a08.retry');
    let attempts = 0;
    const retryAction = descriptor({
      id: retryId,
      scope: preScope,
      retry: { allowed: true, defaultMaxAttempts: 2, maxAttempts: 3, maxDelayMs: 100 },
      handler: () => {
        attempts += 1;
        if (attempts === 1) {
          throw new ActionTransientFailure('temporary provider failure');
        }
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const retryOperation = createActionExecutionOperation('onCreate');
    const retryHarness = executorHarness([retryAction]);
    const retried = await retryHarness.executor.runSequential(
      plan('dataset', [binding('dataset', retryId, preScope, 'retry', 10)]),
      actionContext(retryOperation.executionId, preScope, { metadata: { title: 'Retry' } }),
      retryOperation
    );
    assert.equal(retried.report.actions[0]?.attempts, 2);
    assert.equal(retried.report.actions[0]?.status, 'succeeded');

    const timeoutId = parseActionDefinitionId('org.redbox.a08.timeout');
    let timeoutInvocations = 0;
    const timeoutAction = descriptor({
      id: timeoutId,
      scope: preScope,
      timeout: { defaultMs: 10, minMs: 5, maxMs: 50 },
      retry: { allowed: true, defaultMaxAttempts: 2, maxAttempts: 2, maxDelayMs: 0 },
      handler: () => {
        timeoutInvocations += 1;
        return new Promise<ActionResult>(() => undefined);
      },
    });
    const timeoutOperation = createActionExecutionOperation('onCreate');
    const timeoutHarness = executorHarness([timeoutAction]);
    const timedOut = await timeoutHarness.executor.runSequential(
      plan('dataset', [
        binding('dataset', timeoutId, preScope, 'timeout', 10, {
          policyOverrides: {
            retry: { maxAttempts: 2, retryOn: ['timeout'], idempotent: true },
          },
        }),
      ]),
      actionContext(timeoutOperation.executionId, preScope, { metadata: { title: 'Timeout' } }),
      timeoutOperation
    );
    assert.equal(timeoutInvocations, 1);
    assert.equal(timedOut.report.actions[0]?.attempts, 1);
    assert.deepEqual(timedOut.report.actions[0]?.failure, {
      kind: 'timeout',
      code: 'action-timeout',
      cancellationCooperative: false,
    });
  });

  it('uses the interruptible A05 worker for managed parameters before invoking handlers', async function () {
    this.timeout(5_000);
    const expressionId = parseActionDefinitionId('org.redbox.a08.expression-timeout');
    let handlerInvocations = 0;
    const expressionAction = descriptor({
      id: expressionId,
      scope: preScope,
      parameters: [{ name: 'value', title: 'Value', kind: 'jsonata', required: true }],
      timeout: { defaultMs: 1_000, minMs: 100, maxMs: 2_000 },
      handler: () => {
        handlerInvocations += 1;
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const operation = createActionExecutionOperation('onCreate');
    const harness = executorHarness([expressionAction]);
    const outcome = await harness.executor.runSequential(
      plan('dataset', [
        binding('dataset', expressionId, preScope, 'expression', 10, {
          parameters: {
            value: {
              kind: 'jsonata',
              expression: '($loop := function($x){$loop($x)}; $loop(1))',
            },
          },
        }),
      ]),
      actionContext(operation.executionId, preScope, { metadata: { title: 'Expression' } }),
      operation
    );

    assert.equal(handlerInvocations, 0);
    assert.equal(outcome.report.actions[0]?.status, 'timed_out');
    assert.equal(outcome.report.actions[0]?.failure?.cancellationCooperative, true);
  });

  it('keeps postSync fail-fast and detached post dependency/return semantics', async () => {
    const rejectId = parseActionDefinitionId('org.redbox.a08.postsync-reject');
    const neverId = parseActionDefinitionId('org.redbox.a08.postsync-never');
    let postSyncNever = 0;
    const reject = descriptor({
      id: rejectId,
      scope: postSyncScope,
      allowedKinds: ['reject'],
      handler: () => ({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'reject',
        code: 'post-sync-rejected',
        message: 'Post-sync rejected the candidate.',
      }),
    });
    const never = descriptor({
      id: neverId,
      scope: postSyncScope,
      handler: () => {
        postSyncNever += 1;
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const postSyncOperation = createActionExecutionOperation('onUpdate');
    const postSyncHarness = executorHarness([reject, never]);
    const postSync = await postSyncHarness.executor.runSequential(
      plan('dataset', [
        binding('dataset', rejectId, postSyncScope, 'reject', 10),
        binding('dataset', neverId, postSyncScope, 'never', 20),
      ]),
      actionContext(postSyncOperation.executionId, postSyncScope, { metadata: { title: 'Persisted' } }),
      postSyncOperation
    );
    assert.equal(postSyncNever, 0);
    assert.deepEqual(
      postSync.report.actions.map(action => action.status),
      ['failed', 'skipped']
    );
    assert.deepEqual(postSync.candidate, { metadata: { title: 'Persisted' } });

    const producerId = parseActionDefinitionId('org.redbox.a08.detached-producer');
    const consumerId = parseActionDefinitionId('org.redbox.a08.detached-consumer');
    const independentId = parseActionDefinitionId('org.redbox.a08.detached-independent');
    const events: string[] = [];
    let resolveProducer!: () => void;
    const producer = descriptor({
      id: producerId,
      scope: postScope,
      allowedKinds: ['replace'],
      outputFields: [{ name: 'ready', title: 'Ready', kind: 'boolean', required: true }],
      safeFields: ['ready'],
      handler: () => {
        events.push('producer');
        return new Promise<ActionResult>(resolve => {
          resolveProducer = () =>
            resolve({
              schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
              kind: 'replace',
              candidate: { metadata: { title: 'Detached replacement' } },
              output: { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, fields: { ready: true } },
            });
        });
      },
    });
    const producerBinding = binding('dataset', producerId, postScope, 'producer', 10);
    const consumer = descriptor({
      id: consumerId,
      scope: postScope,
      handler: context => {
        events.push(`consumer:${String((context.record.candidate?.metadata as ActionJsonObject).title)}`);
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const independent = descriptor({
      id: independentId,
      scope: postScope,
      handler: () => {
        events.push('independent');
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const consumerBinding = binding('dataset', consumerId, postScope, 'consumer', 20, {
      dependencies: [{ bindingId: producerBinding.id, condition: 'output-equals', field: 'ready', value: true }],
    });
    const detachedOperation = createActionExecutionOperation('onCreate');
    let detachedComplete!: () => void;
    const completed = new Promise<void>(resolve => {
      detachedComplete = resolve;
    });
    detachedOperation.onDetachedComplete = detachedComplete;
    const detachedHarness = executorHarness([producer, consumer, independent]);
    const detached = detachedHarness.executor.dispatchDetached(
      plan('dataset', [
        producerBinding,
        consumerBinding,
        binding('dataset', independentId, postScope, 'independent', 30),
      ]),
      actionContext(detachedOperation.executionId, postScope, { metadata: { title: 'Persisted' } }),
      detachedOperation
    );

    assert.equal(detached.report.status, 'dispatched');
    assert.deepEqual(detached.candidate, { metadata: { title: 'Persisted' } });
    await tick();
    assert.deepEqual(events, ['producer', 'independent']);
    resolveProducer();
    await completed;
    assert.deepEqual(events, ['producer', 'independent', 'consumer:Persisted']);
    assert.deepEqual(detachedOperation.detachedResults?.map(result => result.status).sort(), [
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    assert.equal(JSON.stringify(detachedOperation).includes('Detached replacement'), false);
  });

  it('interrupts supervised detached work during shutdown with safe terminal metadata', async () => {
    const actionId = parseActionDefinitionId('org.redbox.a08.shutdown');
    const supervisor = createActionExecutionSupervisor();
    const completed: Array<{ status: string; cooperative?: boolean }> = [];
    const dependencies: ActionExecutionDependencies = {
      supervisor,
      onDetachedActionComplete: (_context, result) => {
        completed.push({
          status: result.status,
          cooperative: result.failure?.cancellationCooperative,
        });
      },
    };
    const action = descriptor({
      id: actionId,
      scope: postScope,
      handler: () => new Promise<ActionResult>(() => undefined),
    });
    const operation = createActionExecutionOperation('onCreate');
    const harness = executorHarness([action], dependencies);
    harness.executor.dispatchDetached(
      plan('dataset', [binding('dataset', actionId, postScope, 'shutdown', 10)]),
      actionContext(operation.executionId, postScope, { metadata: { title: 'Shutdown' } }),
      operation
    );
    await tick();
    supervisor?.interruptAll?.();
    await new Promise(resolve => setTimeout(resolve, 25));

    assert.deepEqual(completed, [{ status: 'interrupted', cooperative: false }]);
    assert.equal(operation.detachedPending, 0);
    assert.deepEqual(projectRecordHookExecutionAuditSummary(operation).counts, { interrupted: 1 });
  });

  it('preserves report schema compatibility and resolves secrets only through the internal A06 bridge', async () => {
    const actionId = parseActionDefinitionId('org.redbox.a08.secret');
    let revealed = '';
    const action = descriptor({
      id: actionId,
      scope: preScope,
      parameters: [{ name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true }],
      handler: (_context, _parameters, secrets) => {
        revealed = secrets?.credential?.reveal() ?? '';
        return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
      },
    });
    const secretBinding = binding('dataset', actionId, preScope, 'secret', 10, {
      parameters: { credential: { kind: 'secret', configured: true } },
    });
    const operation = createActionExecutionOperation('onCreate', 'request-a08', 'record-a08');
    const harness = executorHarness([action]);
    const slot = createActionSecretSlotIdentity({
      brandId: 'brand-alpha',
      recordTypeKey: 'dataset',
      bindingId: secretBinding.id,
      parameterName: 'credential',
    });
    await harness.provider.replace({ requesterBrandId: 'brand-alpha', slot, value: 'provider-bound-secret' });
    const outcome = await harness.executor.runSequential(
      plan('dataset', [secretBinding]),
      {
        ...actionContext(operation.executionId, preScope, { metadata: { title: 'Secret' } }, { oid: 'record-a08' }),
        requestId: 'request-a08',
      },
      operation
    );

    assert.equal(revealed, 'provider-bound-secret');
    assert.equal(JSON.stringify([outcome, operation]).includes('provider-bound-secret'), false);
    assert.deepEqual(Object.keys(outcome.report).sort(), [
      'actions',
      'completedAt',
      'context',
      'counts',
      'durationMs',
      'executionId',
      'phaseExecutionId',
      'schemaVersion',
      'startedAt',
      'status',
    ]);
    assert.equal(outcome.report.schemaVersion, 1);
    assert.equal(Object.hasOwn(PublicActionExecution, 'createRegisteredActionExecutor'), false);
    assert.equal(Object.hasOwn(PublicActionRegistry, 'createActionSecretExecutionBoundary'), false);
  });

  it('emits no any or unknown type nodes from A08 runtime sources or declarations', () => {
    const sourceDirectory = path.resolve(__dirname, '../../src/action-execution');
    const runtimeFiles = [
      'types.ts',
      'failure.ts',
      'policy.ts',
      'legacy-result.ts',
      'executor.ts',
      'audit.ts',
      'registered-executor.ts',
      'index.ts',
    ];
    const failures: string[] = [];

    for (const fileName of runtimeFiles) {
      const sourcePath = path.join(sourceDirectory, fileName);
      const sourceText = fs.readFileSync(sourcePath, 'utf8');
      const sourceFile = ts.createSourceFile(sourcePath, sourceText, ts.ScriptTarget.ES2024, true, ts.ScriptKind.TS);
      failures.push(...forbiddenTypeKeywords(sourceFile));

      const declaration = ts.transpileDeclaration(sourceText, {
        fileName: sourcePath,
        compilerOptions: {
          target: ts.ScriptTarget.ES2024,
          module: ts.ModuleKind.NodeNext,
          moduleResolution: ts.ModuleResolutionKind.NodeNext,
          strict: true,
          declaration: true,
          declarationMap: false,
          stripInternal: true,
        },
      });
      const diagnostics = declaration.diagnostics ?? [];
      assert.equal(
        diagnostics.length,
        0,
        ts.formatDiagnostics(diagnostics, {
          getCanonicalFileName: name => name,
          getCurrentDirectory: () => process.cwd(),
          getNewLine: () => '\n',
        })
      );
      const declarationFile = ts.createSourceFile(
        sourcePath.replace(/\.ts$/, '.d.ts'),
        declaration.outputText,
        ts.ScriptTarget.ES2024,
        true,
        ts.ScriptKind.TS
      );
      failures.push(...forbiddenTypeKeywords(declarationFile));
      if (fileName === 'registered-executor.ts') {
        assert.equal(declaration.outputText.includes('createRegisteredActionExecutor'), false);
        assert.equal(declaration.outputText.includes('ActionSecretExecutionBoundary'), false);
      }
    }

    const emittedTypes = fs.readFileSync(path.resolve(__dirname, '../../dist/action-execution/types.d.ts'), 'utf8');
    const emittedTypeFile = ts.createSourceFile(
      'dist/action-execution/types.d.ts',
      emittedTypes,
      ts.ScriptTarget.ES2024,
      true,
      ts.ScriptKind.TS
    );
    failures.push(...forbiddenTypeKeywords(emittedTypeFile));
    assert.deepEqual(failures, []);
  });
});
