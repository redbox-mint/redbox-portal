import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { inspect } from 'node:util';
import ts from 'typescript';
import * as PublicActionRegistry from '../src/action-registry';
import {
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_CONTRACT_SCHEMA_VERSION,
  ACTION_PLAN_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
  ACTION_SECRET_LIMITS,
  ActionPlanValidationError,
  ActionSecretProviderError,
  actionSecretParameterSchema,
  actionRegistrationSource,
  buildActionRegistry,
  createActionSecretProvider,
  createActionSecretSlotIdentity,
  deriveStableActionBindingId,
  deriveStableActionSecretSlotId,
  parseActionBinding,
  parseActionContext,
  parseActionDefinitionId,
  parseActionSecretSlotId,
  resolveActionPlan,
  resolveActionHandlerSecrets,
  type ActionBinding,
  type ActionHandler,
  type ActionParameterDefinition,
  type ActionParameterValues,
  type ActionRegistrationDescriptor,
  type ActionSecretProvider,
  type ActionSecretProviderErrorCode,
  type ActionSecretSlotIdentity,
  type ActionSecretStorage,
  type RedboxActionRegistry,
  type ResolvedActionPlanBinding,
} from '../src/action-registry';
import {
  createActionSecretExecutionBoundary,
  type ActionSecretExecutionBoundary,
} from '../src/action-registry/secrets';

const brandId = 'brand-alpha';
const recordTypeKey = 'rdmp';
const actionId = parseActionDefinitionId('org.redbox.secret-action');
const scope = {
  context: 'record-lifecycle' as const,
  mode: 'onCreate' as const,
  phase: 'pre' as const,
};

function binding(
  stableKey = 'primary',
  parameters: ActionParameterValues = {
    label: { kind: 'literal', value: 'safe-label' },
    credential: { kind: 'secret', configured: true },
  }
): ActionBinding {
  const id = deriveStableActionBindingId({
    recordTypeKey,
    scope,
    actionId,
    contractVersion: 1,
    stableKey,
  });
  return parseActionBinding({
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id,
    stableKey,
    actionId,
    contractVersion: 1,
    scope,
    parameters,
    order: 10,
  });
}

function descriptor(parameters?: readonly ActionParameterDefinition[]): ActionRegistrationDescriptor {
  return {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: actionId,
    contractVersion: 1,
    title: 'Secret action',
    description: 'An action used to verify handler-only secret resolution.',
    category: 'test',
    handler: () => ({ schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' }),
    contexts: ['record-lifecycle'],
    modes: ['onCreate'],
    phases: ['pre'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: parameters ?? [
        { name: 'label', title: 'Label', kind: 'string', required: false },
        { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true },
      ],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: [],
      safeFields: [],
    },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: {
      timeout: { defaultMs: 1_000, minMs: 100, maxMs: 2_000 },
      retry: { allowed: false },
    },
  };
}

function actionRegistry(parameters?: readonly ActionParameterDefinition[]): RedboxActionRegistry {
  const register = (): readonly ActionRegistrationDescriptor[] => [descriptor(parameters)];
  return buildActionRegistry([
    actionRegistrationSource('@researchdatabox/action-secret-test', 'actions/index', register),
  ]);
}

function actionPlan(actionBinding: ActionBinding): object {
  return {
    schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
    recordTypeKey,
    bindings: [actionBinding],
  };
}

function firstResolvedBinding(plan: { readonly bindings: readonly ResolvedActionPlanBinding[] }) {
  const resolved = plan.bindings[0];
  if (resolved === undefined) {
    assert.fail('Expected one resolved action-plan binding.');
  }
  return resolved;
}

function publiclyValidatedBinding(
  registry: RedboxActionRegistry,
  actionBinding: ActionBinding = binding()
): ResolvedActionPlanBinding {
  return firstResolvedBinding(resolveActionPlan(registry, actionPlan(actionBinding)));
}

function actionSecretExecution(
  provider: ActionSecretProvider,
  parameters?: readonly ActionParameterDefinition[]
): ActionSecretExecutionBoundary {
  return createActionSecretExecutionBoundary(provider, actionRegistry(parameters));
}

function trustedBinding(
  execution: ActionSecretExecutionBoundary,
  actionBinding: ActionBinding = binding()
): ResolvedActionPlanBinding {
  return firstResolvedBinding(execution.resolvePlan(actionPlan(actionBinding)));
}

function actionContext() {
  return parseActionContext({
    schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
    executionId: 'execution-1',
    correlationId: 'correlation-1',
    timestamp: '2026-08-28T00:00:00.000Z',
    brandId,
    recordTypeKey,
    scope,
    actor: null,
    record: {},
    priorOutputs: [],
  });
}

function slot(
  actionBinding: Pick<ActionBinding, 'id'> = binding(),
  parameterName = 'credential',
  ownerBrandId = brandId
): ActionSecretSlotIdentity {
  return createActionSecretSlotIdentity({
    brandId: ownerBrandId,
    recordTypeKey,
    bindingId: actionBinding.id,
    parameterName,
  });
}

class MemoryActionSecretStorage implements ActionSecretStorage {
  readonly values = new Map<string, string>();
  readonly operations: string[] = [];
  failWith?: string;

  async replace(secretSlot: ActionSecretSlotIdentity, value: string): Promise<void> {
    this.operations.push('replace');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    this.values.set(secretSlot.id, value);
  }

  async clear(secretSlot: ActionSecretSlotIdentity): Promise<void> {
    this.operations.push('clear');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    this.values.delete(secretSlot.id);
  }

  async resolve(secretSlot: ActionSecretSlotIdentity): Promise<string | undefined> {
    this.operations.push('resolve');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    return this.values.get(secretSlot.id);
  }

  async isConfigured(secretSlot: ActionSecretSlotIdentity): Promise<boolean> {
    this.operations.push('configured');
    if (this.failWith !== undefined) {
      throw new Error(this.failWith);
    }
    return this.values.has(secretSlot.id);
  }
}

interface ObservedStorageAccess {
  readonly operation: 'replace' | 'clear' | 'resolve' | 'configured';
  readonly slot: ActionSecretSlotIdentity;
  readonly value?: string;
}

class AsyncObservedActionSecretStorage implements ActionSecretStorage {
  readonly values = new Map<string, string>();
  readonly accesses: ObservedStorageAccess[] = [];

  async replace(secretSlot: ActionSecretSlotIdentity, value: string): Promise<void> {
    await Promise.resolve();
    this.accesses.push({ operation: 'replace', slot: secretSlot, value });
    this.values.set(secretSlot.id, value);
  }

  async clear(secretSlot: ActionSecretSlotIdentity): Promise<void> {
    await Promise.resolve();
    this.accesses.push({ operation: 'clear', slot: secretSlot });
    this.values.delete(secretSlot.id);
  }

  async resolve(secretSlot: ActionSecretSlotIdentity): Promise<string | undefined> {
    await Promise.resolve();
    this.accesses.push({ operation: 'resolve', slot: secretSlot });
    return this.values.get(secretSlot.id);
  }

  async isConfigured(secretSlot: ActionSecretSlotIdentity): Promise<boolean> {
    await Promise.resolve();
    this.accesses.push({ operation: 'configured', slot: secretSlot });
    return this.values.has(secretSlot.id);
  }
}

async function expectProviderError(
  operation: Promise<unknown>,
  code: ActionSecretProviderErrorCode,
  excludedText?: string
): Promise<ActionSecretProviderError> {
  try {
    await operation;
    assert.fail(`Expected ${code}.`);
  } catch (error) {
    assert.equal(error instanceof ActionSecretProviderError, true);
    const providerError = error as ActionSecretProviderError;
    assert.equal(providerError.code, code);
    assert.equal(providerError.message.length <= 160, true);
    const serialized = JSON.stringify(providerError);
    if (excludedText !== undefined) {
      assert.equal(providerError.message.includes(excludedText), false);
      assert.equal(serialized.includes(excludedText), false);
      assert.equal(providerError.stack?.includes(excludedText) ?? false, false);
    }
    return providerError;
  }
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

describe('action secret parameter provider boundary', () => {
  it('derives stable slots from every ownership component', () => {
    const primaryBinding = binding();
    const base = slot(primaryBinding);
    const repeated = slot(primaryBinding);
    const variants = [
      slot(primaryBinding, 'credential', 'brand-beta'),
      createActionSecretSlotIdentity({
        brandId,
        recordTypeKey: 'data-record',
        bindingId: primaryBinding.id,
        parameterName: 'credential',
      }),
      slot(binding('secondary')),
      slot(primaryBinding, 'apiToken'),
    ];

    assert.equal(base.id, repeated.id);
    assert.equal(Object.isFrozen(base), true);
    assert.equal(new Set(variants.map(variant => variant.id)).size, variants.length);
    assert.equal(
      variants.every(variant => variant.id !== base.id),
      true
    );
    assert.notEqual(
      deriveStableActionSecretSlotId({
        brandId: 'brand:alpha',
        recordTypeKey,
        bindingId: primaryBinding.id,
        parameterName: 'credential',
      }),
      deriveStableActionSecretSlotId({
        brandId: 'brand',
        recordTypeKey: `alpha:${recordTypeKey}`,
        bindingId: primaryBinding.id,
        parameterName: 'credential',
      })
    );
    assert.throws(() => parseActionSecretSlotId('acts_not-a-valid-slot'), ActionSecretProviderError);
  });

  it('denies caller-created public plans while authorizing only trusted application execution bindings', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const secretSlot = slot(actionBinding);
    const access = { requesterBrandId: brandId, slot: secretSlot };
    const applicationRegistry = actionRegistry();
    const callerRegistry = actionRegistry();
    const publicApplicationBinding = publiclyValidatedBinding(applicationRegistry, actionBinding);
    const callerBinding = publiclyValidatedBinding(callerRegistry, actionBinding);
    const execution = createActionSecretExecutionBoundary(provider, applicationRegistry);

    await provider.replace({ ...access, value: 'execution-only-secret' });
    const resolveCount = storage.operations.filter(operation => operation === 'resolve').length;
    for (const resolvedBinding of [publicApplicationBinding, callerBinding]) {
      await expectProviderError(
        provider.resolveForHandler({ ...access, resolvedBinding }),
        'handler-secret-access-denied'
      );
      await expectProviderError(
        resolveActionHandlerSecrets(provider, actionContext(), resolvedBinding),
        'handler-secret-access-denied'
      );
    }
    assert.equal(storage.operations.filter(operation => operation === 'resolve').length, resolveCount);

    const executionBinding = trustedBinding(execution, actionBinding);
    const secrets = await execution.resolveHandlerSecrets(actionContext(), executionBinding);
    assert.equal(secrets.credential?.reveal(), 'execution-only-secret');
    await expectProviderError(
      provider.resolveForHandler({ ...access, resolvedBinding: { ...executionBinding } }),
      'handler-secret-access-denied'
    );
    assert.throws(
      () => createActionSecretExecutionBoundary(provider, callerRegistry),
      (error: object) => error instanceof ActionSecretProviderError && error.code === 'handler-secret-access-denied'
    );
    assert.equal(Object.hasOwn(PublicActionRegistry, 'createActionSecretExecutionBoundary'), false);
  });

  it('retains omitted and blank writes, replaces non-blank values, and clears only explicitly', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const resolvedBinding = trustedBinding(actionSecretExecution(provider));
    const secretSlot = slot(resolvedBinding.binding);
    const access = { requesterBrandId: brandId, slot: secretSlot };

    await provider.replace({ ...access, value: 'first-secret' });
    assert.equal(await provider.isConfigured(access), true);
    assert.equal(await provider.write(access), 'retained');
    assert.equal(await provider.write({ ...access, value: '  \t ' }), 'retained');
    assert.equal(storage.operations.filter(operation => operation === 'replace').length, 1);

    assert.equal(await provider.write({ ...access, value: 'second-secret' }), 'replaced');
    const resolved = await provider.resolveForHandler({
      ...access,
      resolvedBinding,
    });
    assert.equal(resolved?.reveal(), 'second-secret');
    assert.equal(String(resolved), '[REDACTED]');
    assert.equal(JSON.stringify(resolved), '"[REDACTED]"');

    await expectProviderError(provider.replace({ ...access, value: '' }), 'invalid-secret-value');
    assert.equal(await provider.isConfigured(access), true);

    await provider.clear(access);
    assert.equal(await provider.isConfigured(access), false);
    await expectProviderError(
      provider.resolveForHandler({ ...access, resolvedBinding }),
      'required-secret-not-configured'
    );
  });

  it('resolves only descriptor-declared secret parameters for a handler', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const resolvedBinding = trustedBinding(actionSecretExecution(provider), actionBinding);
    const credentialSlot = slot(actionBinding);
    const labelSlot = slot(actionBinding, 'label');
    await provider.replace({ requesterBrandId: brandId, slot: credentialSlot, value: 'handler-secret' });
    await provider.replace({ requesterBrandId: brandId, slot: labelSlot, value: 'must-not-resolve' });

    const secrets = await resolveActionHandlerSecrets(provider, { brandId, recordTypeKey }, resolvedBinding);
    assert.deepEqual(Object.keys(secrets), ['credential']);
    assert.equal(secrets.credential?.reveal(), 'handler-secret');
    assert.equal(Object.isFrozen(secrets), true);
    assert.equal(JSON.stringify(secrets).includes('handler-secret'), false);
    assert.equal(storage.operations.filter(operation => operation === 'resolve').length, 1);

    let receivedSecret = '';
    let receivedNames: string[] = [];
    const handler: ActionHandler = (_context, _parameters, handlerSecrets) => {
      if (handlerSecrets === undefined) {
        assert.fail('Expected typed secrets on the validated execution path.');
      }
      receivedNames = Object.keys(handlerSecrets);
      receivedSecret = handlerSecrets.credential?.reveal() ?? '';
      return { schemaVersion: 1, kind: 'no-change' };
    };
    await handler(actionContext(), actionBinding.parameters, secrets);
    assert.deepEqual(receivedNames, ['credential']);
    assert.equal(receivedSecret, 'handler-secret');

    await expectProviderError(
      provider.resolveForHandler({
        requesterBrandId: brandId,
        slot: labelSlot,
        resolvedBinding,
      }),
      'handler-secret-access-denied'
    );
    assert.equal(storage.operations.filter(operation => operation === 'resolve').length, 1);
  });

  it('fails closed when a descriptor-required slot is absent and omits an absent optional slot', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const resolvedBinding = trustedBinding(actionSecretExecution(provider), actionBinding);

    await expectProviderError(
      resolveActionHandlerSecrets(provider, { brandId, recordTypeKey }, resolvedBinding),
      'required-secret-not-configured'
    );

    const optional = descriptor([
      { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: false },
    ]);
    const optionalProvider = createActionSecretProvider(storage);
    const optionalBinding = trustedBinding(
      actionSecretExecution(optionalProvider, optional.parameterSchema.parameters),
      binding('primary', {})
    );
    assert.deepEqual(
      await resolveActionHandlerSecrets(optionalProvider, { brandId, recordTypeKey }, optionalBinding),
      {}
    );
  });

  it('denies cross-brand reads, state checks, writes, retained no-ops, and clears before storage access', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const resolvedBinding = trustedBinding(actionSecretExecution(provider));
    const secretSlot = slot(resolvedBinding.binding);
    const ownerAccess = { requesterBrandId: brandId, slot: secretSlot };
    await provider.replace({ ...ownerAccess, value: 'owned-secret' });
    const operationCount = storage.operations.length;
    const deniedAccess = { requesterBrandId: 'brand-beta', slot: secretSlot };

    await expectProviderError(provider.write(deniedAccess), 'cross-brand-secret-access');
    await expectProviderError(provider.replace({ ...deniedAccess, value: 'replacement' }), 'cross-brand-secret-access');
    await expectProviderError(provider.clear(deniedAccess), 'cross-brand-secret-access');
    await expectProviderError(provider.isConfigured(deniedAccess), 'cross-brand-secret-access');
    await expectProviderError(
      provider.resolveForHandler({
        ...deniedAccess,
        resolvedBinding,
      }),
      'cross-brand-secret-access'
    );

    assert.equal(storage.operations.length, operationCount);
    assert.equal(await provider.isConfigured(ownerAccess), true);
  });

  it('passes provider-owned immutable slot snapshots to every asynchronous storage method', async () => {
    const storage = new AsyncObservedActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const resolvedBinding = trustedBinding(actionSecretExecution(provider));
    const canonicalSlot = slot(resolvedBinding.binding);
    const mutatedSlot = createActionSecretSlotIdentity({
      brandId: 'brand-beta',
      recordTypeKey: 'data-record',
      bindingId: binding('secondary').id,
      parameterName: 'apiToken',
    });

    const mutateAfterCall = (request: { requesterBrandId: string; slot: ActionSecretSlotIdentity }): void => {
      request.requesterBrandId = 'brand-beta';
      Object.assign(request.slot, mutatedSlot);
    };
    const mutableRequest = (): { requesterBrandId: string; slot: ActionSecretSlotIdentity } => ({
      requesterBrandId: brandId,
      slot: { ...canonicalSlot },
    });

    const writeRequest = { ...mutableRequest(), value: 'write-secret' };
    const writeOperation = provider.write(writeRequest);
    mutateAfterCall(writeRequest);
    writeRequest.value = 'mutated-write-secret';
    assert.equal(await writeOperation, 'replaced');

    const replaceRequest = { ...mutableRequest(), value: 'replace-secret' };
    const replaceOperation = provider.replace(replaceRequest);
    mutateAfterCall(replaceRequest);
    replaceRequest.value = 'mutated-replace-secret';
    await replaceOperation;

    const clearRequest = mutableRequest();
    const clearOperation = provider.clear(clearRequest);
    mutateAfterCall(clearRequest);
    await clearOperation;

    storage.values.set(canonicalSlot.id, 'resolve-secret');
    const resolveRequest = { ...mutableRequest(), resolvedBinding };
    const resolveOperation = provider.resolveForHandler(resolveRequest);
    mutateAfterCall(resolveRequest);
    assert.equal((await resolveOperation)?.reveal(), 'resolve-secret');

    const configuredRequest = mutableRequest();
    const configuredOperation = provider.isConfigured(configuredRequest);
    mutateAfterCall(configuredRequest);
    assert.equal(await configuredOperation, true);

    assert.deepEqual(
      storage.accesses.map(access => access.operation),
      ['replace', 'replace', 'clear', 'resolve', 'configured']
    );
    assert.deepEqual(
      storage.accesses.filter(access => access.operation === 'replace').map(access => access.value),
      ['write-secret', 'replace-secret']
    );
    for (const access of storage.accesses) {
      assert.equal(access.slot.id, canonicalSlot.id);
      assert.equal(access.slot.brandId, brandId);
      assert.equal(access.slot.recordTypeKey, recordTypeKey);
      assert.equal(access.slot.bindingId, resolvedBinding.binding.id);
      assert.equal(access.slot.parameterName, 'credential');
      assert.equal(Object.isFrozen(access.slot), true);
      assert.notEqual(access.slot, canonicalSlot);
    }
  });

  it('rejects tampered slots and forged trusted-execution provenance before storage access', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const resolvedBinding = trustedBinding(actionSecretExecution(provider), actionBinding);
    const credentialSlot = slot(actionBinding);
    const access = { requesterBrandId: brandId, slot: credentialSlot };

    await expectProviderError(
      provider.isConfigured({ ...access, slot: { ...credentialSlot, parameterName: 'apiToken' } }),
      'invalid-secret-slot'
    );

    const forgedBindings = [
      { ...resolvedBinding },
      { ...resolvedBinding, binding: binding('secondary') },
      {
        ...resolvedBinding,
        descriptor: {
          ...resolvedBinding.descriptor,
          parameterSchema: descriptor([
            { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true },
          ]).parameterSchema,
        },
      },
    ];
    for (const forgedBinding of forgedBindings) {
      await expectProviderError(
        provider.resolveForHandler({
          ...access,
          resolvedBinding: forgedBinding as ResolvedActionPlanBinding,
        }),
        'handler-secret-access-denied'
      );
    }

    await expectProviderError(
      resolveActionHandlerSecrets(provider, { brandId, recordTypeKey: 'data-record' }, resolvedBinding),
      'handler-secret-access-denied'
    );

    assert.deepEqual(storage.operations, []);
  });

  it('honours configured markers and fails closed on storage contradictions', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const optionalParameters: readonly ActionParameterDefinition[] = [
      { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: false },
    ];
    const execution = actionSecretExecution(provider, optionalParameters);

    const configuredFalse = trustedBinding(
      execution,
      binding('configured-false', { credential: { kind: 'secret', configured: false } })
    );
    const falseSlot = slot(configuredFalse.binding);
    await provider.replace({ requesterBrandId: brandId, slot: falseSlot, value: 'stale-secret' });
    const resolveCount = storage.operations.filter(operation => operation === 'resolve').length;
    assert.deepEqual(await resolveActionHandlerSecrets(provider, actionContext(), configuredFalse), {});
    assert.equal(storage.operations.filter(operation => operation === 'resolve').length, resolveCount);

    const markerOmitted = trustedBinding(execution, binding('marker-omitted', {}));
    const omittedSlot = slot(markerOmitted.binding);
    await provider.replace({ requesterBrandId: brandId, slot: omittedSlot, value: 'other-stale-secret' });
    assert.deepEqual(await resolveActionHandlerSecrets(provider, actionContext(), markerOmitted), {});
    assert.equal(storage.operations.filter(operation => operation === 'resolve').length, resolveCount);

    const configuredTrue = trustedBinding(
      execution,
      binding('configured-true', { credential: { kind: 'secret', configured: true } })
    );
    await expectProviderError(
      resolveActionHandlerSecrets(provider, actionContext(), configuredTrue),
      'secret-configured-state-mismatch'
    );

    assert.throws(
      () =>
        trustedBinding(
          actionSecretExecution(createActionSecretProvider(storage), descriptor().parameterSchema.parameters),
          binding('required-false', { credential: { kind: 'secret', configured: false } })
        ),
      ActionPlanValidationError
    );
  });

  it('keeps resolved-secret redaction resistant to prototype and instance tampering', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const resolvedBinding = trustedBinding(actionSecretExecution(provider));
    const secretSlot = slot(resolvedBinding.binding);
    const sentinel = 'prototype-must-not-leak-this';
    await provider.replace({ requesterBrandId: brandId, slot: secretSlot, value: sentinel });
    const secret = await provider.resolveForHandler({
      requesterBrandId: brandId,
      slot: secretSlot,
      resolvedBinding,
    });
    if (secret === undefined) {
      assert.fail('Expected a resolved secret.');
    }

    const prototype = Object.getPrototypeOf(secret);
    assert.equal(Object.isFrozen(prototype), true);
    assert.equal(
      Reflect.set(prototype, 'toJSON', () => secret.reveal()),
      false
    );
    assert.equal(Reflect.defineProperty(secret, 'toJSON', { value: () => secret.reveal() }), false);
    assert.equal(Reflect.setPrototypeOf(secret, { toJSON: () => secret.reveal() }), false);
    assert.equal(JSON.stringify(secret), '"[REDACTED]"');
    assert.equal(JSON.stringify(secret).includes(sentinel), false);
  });

  it('keeps existing two-argument ActionHandler calls source compatible', async () => {
    const handler: ActionHandler = () => ({
      schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
      kind: 'no-change',
    });
    assert.deepEqual(await handler(actionContext(), binding().parameters), {
      schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
      kind: 'no-change',
    });
  });

  it('normalizes adapter failures and rejects oversized values without disclosing material', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const resolvedBinding = trustedBinding(actionSecretExecution(provider));
    const access = { requesterBrandId: brandId, slot: slot(resolvedBinding.binding) };
    const sentinel = 'provider-failure-raw-secret';
    storage.failWith = `adapter exposed ${sentinel}`;

    const error = await expectProviderError(
      provider.replace({ ...access, value: sentinel }),
      'secret-provider-failure',
      sentinel
    );
    assert.equal('cause' in error, false);
    const forgedError = new ActionSecretProviderError(sentinel as ActionSecretProviderErrorCode);
    assert.equal(forgedError.code, 'secret-provider-failure');
    assert.equal(JSON.stringify(forgedError).includes(sentinel), false);

    storage.failWith = undefined;
    const oversized = 's'.repeat(ACTION_SECRET_LIMITS.maxSecretBytes + 1);
    await expectProviderError(provider.replace({ ...access, value: oversized }), 'invalid-secret-value', oversized);
    assert.equal(storage.values.size, 0);
  });

  it('redacts adapter causes across clear, resolve, and configured-state failures', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const resolvedBinding = trustedBinding(actionSecretExecution(provider));
    const access = { requesterBrandId: brandId, slot: slot(resolvedBinding.binding) };
    const sentinel = 'adapter-cause-secret';
    storage.failWith = `adapter exposed ${sentinel}`;
    const operations = [
      () => provider.clear(access),
      () => provider.isConfigured(access),
      () => provider.resolveForHandler({ ...access, resolvedBinding }),
    ];

    for (const operation of operations) {
      const error = await expectProviderError(operation(), 'secret-provider-failure', sentinel);
      assert.equal('cause' in error, false);
    }
  });

  it('keeps raw values out of binding, descriptor, resolved-secret, and error serialization', async () => {
    const storage = new MemoryActionSecretStorage();
    const provider = createActionSecretProvider(storage);
    const actionBinding = binding();
    const resolvedBinding = trustedBinding(actionSecretExecution(provider), actionBinding);
    const secretSlot = slot(actionBinding);
    const sentinel = 'never-serialize-this-secret';
    assert.equal(
      actionSecretParameterSchema.safeParse({
        name: 'credential',
        title: 'Credential',
        kind: 'secret',
        writeOnly: true,
        required: true,
        defaultValue: sentinel,
      }).success,
      false
    );
    assert.throws(() =>
      parseActionBinding({
        ...actionBinding,
        parameters: {
          credential: { kind: 'secret', configured: true, value: sentinel },
        },
      })
    );
    await provider.replace({ requesterBrandId: brandId, slot: secretSlot, value: sentinel });
    const secrets = await resolveActionHandlerSecrets(provider, { brandId, recordTypeKey }, resolvedBinding);

    const publicMaterial = JSON.stringify({
      binding: actionBinding,
      descriptor: descriptor(),
      diagnostics: { configured: await provider.isConfigured({ requesterBrandId: brandId, slot: secretSlot }) },
      handlerSecrets: secrets,
    });
    assert.equal(publicMaterial.includes(sentinel), false);
    assert.equal(publicMaterial.includes('[REDACTED]'), true);
    assert.equal(inspect(secrets).includes(sentinel), false);
  });

  it('emits no any or unknown type nodes from A06 runtime sources', () => {
    const sourceDirectory = path.resolve(__dirname, '../src/action-registry');
    const runtimeFiles = ['contracts.ts', 'index.ts', 'plan.ts', 'secrets.ts'];
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
      assert.equal(declaration.outputText.includes('createActionSecretExecutionBoundary'), false);
      assert.equal(declaration.outputText.includes('ActionSecretExecutionBoundary'), false);
    }

    assert.deepEqual(failures, []);
  });
});
