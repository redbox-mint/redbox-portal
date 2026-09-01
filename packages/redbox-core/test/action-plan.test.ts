import assert from 'node:assert/strict';
import {
  ACTION_CONTRACT_LIMITS,
  ACTION_CONTRACT_SCHEMA_VERSION,
  ACTION_PLAN_SCHEMA_VERSION,
  ACTION_RESULT_SCHEMA_VERSION,
  ActionPlanValidationError,
  RedboxActionRegistry,
  actionPlanSchema,
  actionRegistrationSource,
  buildActionRegistry,
  deriveStableActionBindingId,
  parseActionBinding,
  parseActionDefinitionId,
  resolveActionPlan,
  validateActionPlan,
  type ActionAvailability,
  type ActionBinding,
  type ActionBindingId,
  type ActionBindingScope,
  type ActionDependency,
  type ActionDescriptorMetadata,
  type ActionExecutionMode,
  type ActionExecutionPhase,
  type ActionExecutionPolicyBounds,
  type ActionHandler,
  type ActionInvocationContextKind,
  type ActionOutputField,
  type ActionParameterDefinition,
  type ActionParameterValues,
  type ActionPlanValidationIssue,
  type ActionPlanValidationResult,
  type ActionRegistrationDescriptor,
  type InvalidActionPlan,
  type ResolvedActionPlan,
} from '../src/action-registry';

const lifecycleCreatePre: ActionBindingScope = {
  context: 'record-lifecycle',
  mode: 'onCreate',
  phase: 'pre',
};

interface DescriptorOptions {
  readonly availability?: ActionAvailability;
  readonly allowRepeatedBindings?: boolean;
  readonly contexts?: ActionInvocationContextKind[];
  readonly modes?: ActionExecutionMode[];
  readonly phases?: ActionExecutionPhase[];
  readonly parameters?: ActionParameterDefinition[];
  readonly outputFields?: ActionOutputField[];
  readonly safeFields?: string[];
  readonly executionPolicy?: ActionExecutionPolicyBounds;
  readonly handler?: ActionHandler;
}

interface BindingOptions {
  readonly contractVersion?: number;
  readonly stableKey?: string;
  readonly scope?: ActionBindingScope;
  readonly parameters?: ActionParameterValues;
  readonly order?: number;
  readonly dependencies?: ActionDependency[];
  readonly id?: ActionBindingId;
}

const noChangeHandler: ActionHandler = () => ({
  schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
  kind: 'no-change',
});

function actionDescriptor(actionId: string, options: DescriptorOptions = {}): ActionRegistrationDescriptor {
  return {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: parseActionDefinitionId(actionId),
    contractVersion: 1,
    title: 'Plan test action',
    description: 'An action used to verify complete plan validation.',
    category: 'test',
    handler: options.handler ?? noChangeHandler,
    contexts: options.contexts ?? ['record-lifecycle'],
    modes: options.modes ?? ['onCreate'],
    phases: options.phases ?? ['pre'],
    allowRepeatedBindings: options.allowRepeatedBindings ?? false,
    availability: options.availability,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: options.parameters ?? [],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: options.outputFields ?? [],
      safeFields: options.safeFields ?? [],
    },
    resultContract: { allowedKinds: ['no-change'] },
    executionPolicy: options.executionPolicy ?? {
      timeout: { defaultMs: 1_000, minMs: 100, maxMs: 2_000 },
      retry: { allowed: false },
    },
  };
}

function actionRegistry(...descriptors: ActionRegistrationDescriptor[]): RedboxActionRegistry {
  const register = (): readonly ActionRegistrationDescriptor[] => descriptors;
  return buildActionRegistry([
    actionRegistrationSource('@researchdatabox/action-plan-test', 'actions/index', register),
  ]);
}

function bindingId(
  actionId: string,
  stableKey: string,
  scope: ActionBindingScope = lifecycleCreatePre,
  contractVersion = 1
): ActionBindingId {
  return deriveStableActionBindingId({
    recordTypeKey: 'rdmp',
    scope,
    actionId,
    contractVersion,
    stableKey,
  });
}

function actionBinding(actionId: string, options: BindingOptions = {}): ActionBinding {
  const scope = options.scope ?? lifecycleCreatePre;
  const stableKey = options.stableKey ?? 'primary';
  const contractVersion = options.contractVersion ?? 1;
  return parseActionBinding({
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: options.id ?? bindingId(actionId, stableKey, scope, contractVersion),
    stableKey,
    actionId,
    contractVersion,
    scope,
    parameters: options.parameters ?? {},
    order: options.order ?? 10,
    dependencies: options.dependencies,
  });
}

function actionPlan(bindings: readonly ActionBinding[]): object {
  return {
    schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
    recordTypeKey: 'rdmp',
    bindings,
  };
}

function nestedObjectAtDepth(depth: number): object {
  let value: object = {};
  for (let currentDepth = 1; currentDepth < depth; currentDepth += 1) {
    value = { nested: value };
  }
  return value;
}

function invalidResult(result: ActionPlanValidationResult): InvalidActionPlan {
  if (result.ok) {
    assert.fail('Expected action plan validation to fail.');
  }
  return result;
}

function resolvedResult(result: ActionPlanValidationResult): ResolvedActionPlan {
  if (!result.ok) {
    assert.fail('Expected action plan validation to succeed.');
  }
  return result.plan;
}

function issueCodes(issues: readonly ActionPlanValidationIssue[]): string[] {
  return issues.map(issue => issue.code);
}

function firstResolvedBinding(plan: ResolvedActionPlan) {
  const binding = plan.bindings[0];
  if (binding === undefined) {
    assert.fail('Expected one resolved action binding.');
  }
  return binding;
}

function descriptorFromRegistry(registry: RedboxActionRegistry, actionId: string): ActionDescriptorMetadata {
  const descriptor = registry.getDescriptor(actionId);
  if (descriptor === undefined) {
    assert.fail('Expected a registered action descriptor.');
  }
  return descriptor;
}

describe('action registry lookup and plan validation', () => {
  it('looks up only an exact action ID and contract version and distinguishes all availability outcomes', () => {
    const registry = actionRegistry(
      actionDescriptor('org.redbox.available-action'),
      actionDescriptor('org.redbox.retired-action', { availability: 'retired' })
    );

    const available = registry.lookup('org.redbox.available-action', 1);
    assert.equal(available.status, 'available');
    if (available.status === 'available') {
      assert.equal(available.descriptor.id, 'org.redbox.available-action');
      assert.equal(typeof available.handler, 'function');
    }

    const unsupported = registry.lookup('org.redbox.available-action', 2);
    assert.equal(unsupported.status, 'unsupported');
    if (unsupported.status === 'unsupported') {
      assert.equal(unsupported.requestedContractVersion, 2);
      assert.equal(unsupported.supportedContractVersion, 1);
    }

    assert.deepEqual(registry.lookup('org.redbox.unregistered-action', 1), { status: 'unknown' });
    assert.equal(registry.lookup('org.redbox.retired-action', 1).status, 'retired');
    assert.equal(registry.getHandler('org.redbox.available-action', 2), undefined);
    assert.equal(registry.getHandler('org.redbox.retired-action', 1), undefined);
    assert.equal(descriptorFromRegistry(registry, 'org.redbox.available-action').availability, 'active');
  });

  it('copies caller-owned registry storage so later map and entry mutation cannot change lookup metadata', () => {
    const sourceRegistry = actionRegistry(actionDescriptor('org.redbox.copied-action'));
    const descriptor = descriptorFromRegistry(sourceRegistry, 'org.redbox.copied-action');
    const entry = { descriptor, handler: noChangeHandler };
    const callerActions = new Map([[descriptor.id, entry]]);
    const registry = new RedboxActionRegistry(callerActions);
    const replacementHandler: ActionHandler = () => ({
      schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
      kind: 'reject',
      code: 'changed',
      message: 'Caller mutation must not replace the registered handler.',
    });

    entry.handler = replacementHandler;
    callerActions.clear();

    assert.equal(registry.size, 1);
    assert.equal(registry.descriptorMetadata.length, 1);
    assert.equal(registry.lookup('org.redbox.copied-action', 1).status, 'available');
    assert.equal(registry.getHandler('org.redbox.copied-action', 1), noChangeHandler);
  });

  it('resolves an empty plan and a populated plan without invoking handlers', () => {
    let invocationCount = 0;
    const handler: ActionHandler = () => {
      invocationCount += 1;
      return { schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' };
    };
    const registry = actionRegistry(actionDescriptor('org.redbox.safe-action', { handler }));
    const empty = resolvedResult(validateActionPlan(registry, actionPlan([])));
    const populated = resolveActionPlan(registry, actionPlan([actionBinding('org.redbox.safe-action')]));

    assert.deepEqual(empty.bindings, []);
    assert.equal(populated.bindings.length, 1);
    assert.equal(firstResolvedBinding(populated).descriptor.id, 'org.redbox.safe-action');
    assert.equal(invocationCount, 0);
    assert.equal(Object.isFrozen(populated), true);
    assert.equal(Object.isFrozen(populated.bindings), true);
  });

  it('reports unknown, retired, and unsupported action references safely with known provenance', () => {
    const registry = actionRegistry(
      actionDescriptor('org.redbox.supported-action'),
      actionDescriptor('org.redbox.retired-plan-action', { availability: 'retired' })
    );
    const result = invalidResult(
      validateActionPlan(
        registry,
        actionPlan([
          actionBinding('org.redbox.unregistered-action', { stableKey: 'missing', order: 10 }),
          actionBinding('org.redbox.supported-action', { stableKey: 'version', order: 20, contractVersion: 2 }),
          actionBinding('org.redbox.retired-plan-action', { stableKey: 'retired', order: 30 }),
        ])
      )
    );

    assert.deepEqual(issueCodes(result.issues), ['unknown-action', 'unsupported-action', 'retired-action']);
    const serialized = JSON.stringify(result.issues);
    assert.equal(serialized.includes('services'), false);
    assert.equal(serialized.includes('function'), false);
    assert.equal(serialized.includes('@researchdatabox/action-plan-test'), true);
    assert.throws(
      () => resolveActionPlan(registry, actionPlan([actionBinding('org.redbox.unregistered-action')])),
      ActionPlanValidationError
    );
  });

  it('rejects malformed plans, unknown properties, duplicate dependency declarations, and the size boundary plus one', () => {
    const registry = actionRegistry(actionDescriptor('org.redbox.repeatable-action', { allowRepeatedBindings: true }));
    const boundaryBindings: ActionBinding[] = [];
    for (let index = 0; index < ACTION_CONTRACT_LIMITS.maxPlanBindings; index += 1) {
      boundaryBindings.push(
        actionBinding('org.redbox.repeatable-action', { stableKey: `binding-${index}`, order: index })
      );
    }
    const malformedBinding = {
      ...actionBinding('org.redbox.repeatable-action'),
      moduleName: 'persisted/module/path',
    };
    const source = actionBinding('org.redbox.repeatable-action', { stableKey: 'source', order: 1 });
    const validDependent = actionBinding('org.redbox.repeatable-action', {
      stableKey: 'dependent',
      order: 2,
      dependencies: [{ bindingId: source.id, condition: 'success' }],
    });
    const duplicateDependencies = {
      ...validDependent,
      dependencies: [
        { bindingId: source.id, condition: 'success' },
        { bindingId: source.id, condition: 'success' },
      ],
    };

    assert.equal(validateActionPlan(registry, actionPlan(boundaryBindings)).ok, true);
    assert.deepEqual(
      issueCodes(
        invalidResult(
          validateActionPlan(registry, actionPlan([...boundaryBindings, actionBinding('org.redbox.repeatable-action')]))
        ).issues
      ),
      ['invalid-action-plan']
    );
    assert.equal(
      invalidResult(
        validateActionPlan(registry, {
          schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
          recordTypeKey: 'rdmp',
          bindings: [malformedBinding],
        })
      ).issues[0]?.path,
      '$.bindings[0]'
    );
    assert.equal(
      invalidResult(
        validateActionPlan(registry, {
          schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
          recordTypeKey: 'rdmp',
          bindings: [source, duplicateDependencies],
        })
      ).issues.some(issue => issue.code === 'invalid-action-plan'),
      true
    );
  });

  it('rejects hostile oversized arrays and records before traversing their children', () => {
    const registry = actionRegistry(actionDescriptor('org.redbox.preflight-action'));
    let arrayElementReads = 0;
    const oversizedBindings = new Array<object>(ACTION_CONTRACT_LIMITS.maxPlanBindings + 10_000);
    Object.defineProperty(oversizedBindings, 0, {
      enumerable: true,
      get: () => {
        arrayElementReads += 1;
        return {};
      },
    });

    const oversizedArrayResult = invalidResult(
      validateActionPlan(registry, {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'rdmp',
        bindings: oversizedBindings,
      })
    );
    assert.equal(oversizedArrayResult.issues.length, 1);
    assert.equal(oversizedArrayResult.issues.length <= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues, true);
    assert.equal(arrayElementReads, 0);

    let parameterValueReads = 0;
    const oversizedParameters: Record<string, object> = {};
    for (let index = 0; index <= ACTION_CONTRACT_LIMITS.maxParameters + 10_000; index += 1) {
      Object.defineProperty(oversizedParameters, `parameter${index}`, {
        enumerable: true,
        get: () => {
          parameterValueReads += 1;
          return { kind: 'literal', value: null };
        },
      });
    }
    const oversizedRecordResult = invalidResult(
      validateActionPlan(registry, {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'rdmp',
        bindings: [{ ...actionBinding('org.redbox.preflight-action'), parameters: oversizedParameters }],
      })
    );
    assert.equal(oversizedRecordResult.issues.length, 1);
    assert.equal(oversizedRecordResult.issues.length <= ACTION_CONTRACT_LIMITS.maxPlanValidationIssues, true);
    assert.equal(parameterValueReads, 0);
  });

  it('uses the same getter-safe preflight for the public plan validator and semantic validation', () => {
    const registry = actionRegistry(actionDescriptor('org.redbox.getter-action'));
    let getterReads = 0;
    const hostileBinding = { ...actionBinding('org.redbox.getter-action') };
    Object.defineProperty(hostileBinding, 'parameters', {
      enumerable: false,
      get: () => {
        getterReads += 1;
        return {};
      },
    });
    const hostilePlan = {
      schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
      recordTypeKey: 'rdmp',
      bindings: [hostileBinding],
    };

    assert.equal(actionPlanSchema.safeParse(hostilePlan).success, false);
    assert.equal(validateActionPlan(registry, hostilePlan).ok, false);
    assert.equal(getterReads, 0);
  });

  it('accepts the nested JSON depth boundary and rejects boundary plus one through both plan paths', () => {
    const registry = actionRegistry(
      actionDescriptor('org.redbox.nested-boundary-action', {
        parameters: [{ name: 'payload', title: 'Payload', kind: 'object', required: true }],
      })
    );
    const boundaryPlan = actionPlan([
      actionBinding('org.redbox.nested-boundary-action', {
        parameters: {
          payload: { kind: 'literal', value: nestedObjectAtDepth(ACTION_CONTRACT_LIMITS.maxJsonDepth) },
        },
      }),
    ]);
    const oversizedPlan = actionPlan([
      {
        ...actionBinding('org.redbox.nested-boundary-action'),
        parameters: {
          payload: { kind: 'literal', value: nestedObjectAtDepth(ACTION_CONTRACT_LIMITS.maxJsonDepth + 1) },
        },
      },
    ]);

    assert.equal(actionPlanSchema.safeParse(boundaryPlan).success, true);
    assert.equal(validateActionPlan(registry, boundaryPlan).ok, true);
    assert.equal(actionPlanSchema.safeParse(oversizedPlan).success, false);
    assert.equal(validateActionPlan(registry, oversizedPlan).ok, false);
  });

  it('rejects aggregate-byte and structural-depth excesses during preflight', () => {
    const registry = actionRegistry();
    const oversizedByBytes: Record<string, string> = {};
    for (let index = 0; index < 9; index += 1) {
      oversizedByBytes[`payload${index}`] = 'x'.repeat(ACTION_CONTRACT_LIMITS.maxStringValueLength);
    }
    const byteResult = invalidResult(
      validateActionPlan(registry, {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'rdmp',
        bindings: [],
        ...oversizedByBytes,
      })
    );
    assert.equal(byteResult.issues.length, 1);
    assert.equal(byteResult.issues[0]?.path, '$');
    assert.equal(byteResult.issues[0]?.message.includes('aggregate byte limit'), true);

    let deeplyNested: object = {};
    for (let depth = 0; depth <= ACTION_CONTRACT_LIMITS.maxPlanDepth; depth += 1) {
      deeplyNested = { nested: deeplyNested };
    }
    const depthResult = invalidResult(
      validateActionPlan(registry, {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'rdmp',
        bindings: [],
        nested: deeplyNested,
      })
    );
    assert.equal(depthResult.issues.length, 1);
    assert.equal(depthResult.issues[0]?.message.includes('structural depth limit'), true);
  });

  it('stops shared-reference expansion at the validation work limit', () => {
    const registry = actionRegistry();
    const leaf: object = {};
    const firstLevel = Array.from({ length: ACTION_CONTRACT_LIMITS.maxArrayItems }, () => leaf);
    const secondLevel = Array.from({ length: ACTION_CONTRACT_LIMITS.maxArrayItems }, () => firstLevel);
    const thirdLevel = Array.from({ length: ACTION_CONTRACT_LIMITS.maxArrayItems }, () => secondLevel);
    const input = {
      schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
      recordTypeKey: 'rdmp',
      bindings: [],
      hostileSharedGraph: thirdLevel,
    };

    assert.equal(actionPlanSchema.safeParse(input).success, false);
    const result = invalidResult(validateActionPlan(registry, input));
    assert.equal(result.issues.length, 1);
    assert.equal(result.issues[0]?.message.includes('validation work limit'), true);
  });

  it('caps malformed-shape issues globally after structural limits pass', () => {
    const registry = actionRegistry();
    const malformedBindings = Array.from({ length: ACTION_CONTRACT_LIMITS.maxPlanBindings }, () => ({}));
    const result = invalidResult(
      validateActionPlan(registry, {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'rdmp',
        bindings: malformedBindings,
      })
    );

    assert.equal(result.issues.length, ACTION_CONTRACT_LIMITS.maxPlanValidationIssues);
    assert.equal(
      result.issues.every(issue => issue.code === 'invalid-action-plan'),
      true
    );
  });

  it('rejects duplicate plan entries and duplicate execution orders independently', () => {
    const registry = actionRegistry(actionDescriptor('org.redbox.duplicate-action', { allowRepeatedBindings: true }));
    const first = actionBinding('org.redbox.duplicate-action', { stableKey: 'first', order: 10 });
    const sameOrder = actionBinding('org.redbox.duplicate-action', { stableKey: 'second', order: 10 });
    const result = invalidResult(validateActionPlan(registry, actionPlan([first, first, sameOrder])));

    assert.equal(issueCodes(result.issues).includes('duplicate-plan-entry'), true);
    assert.equal(issueCodes(result.issues).filter(code => code === 'duplicate-action-order').length, 2);
  });

  it('enforces allowRepeatedBindings within an attachment and permits configured repeats or other attachments', () => {
    const disallowedRegistry = actionRegistry(actionDescriptor('org.redbox.single-action'));
    const repeatableRegistry = actionRegistry(
      actionDescriptor('org.redbox.repeatable-plan-action', { allowRepeatedBindings: true })
    );
    const disallowed = [
      actionBinding('org.redbox.single-action', { stableKey: 'first', order: 10 }),
      actionBinding('org.redbox.single-action', { stableKey: 'second', order: 20 }),
    ];
    const allowed = [
      actionBinding('org.redbox.repeatable-plan-action', { stableKey: 'first', order: 10 }),
      actionBinding('org.redbox.repeatable-plan-action', { stableKey: 'second', order: 20 }),
      actionBinding('org.redbox.repeatable-plan-action', {
        stableKey: 'update',
        order: 10,
        scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' },
      }),
    ];
    const repeatedAcrossAttachmentsRegistry = actionRegistry(
      actionDescriptor('org.redbox.repeatable-plan-action', {
        allowRepeatedBindings: true,
        modes: ['onCreate', 'onUpdate'],
      })
    );

    assert.deepEqual(issueCodes(invalidResult(validateActionPlan(disallowedRegistry, actionPlan(disallowed))).issues), [
      'repeated-action-not-allowed',
    ]);
    assert.equal(validateActionPlan(repeatableRegistry, actionPlan(allowed)).ok, false);
    assert.equal(validateActionPlan(repeatedAcrossAttachmentsRegistry, actionPlan(allowed)).ok, true);
  });

  it('validates context, lifecycle mode, and phase as separate applicability dimensions', () => {
    const registry = actionRegistry(actionDescriptor('org.redbox.scoped-action', { allowRepeatedBindings: true }));
    const result = invalidResult(
      validateActionPlan(
        registry,
        actionPlan([
          actionBinding('org.redbox.scoped-action', {
            stableKey: 'context',
            order: 10,
            scope: { context: 'queued-record-action', mode: 'onCreate', phase: 'pre', scopeId: 'queue-1' },
          }),
          actionBinding('org.redbox.scoped-action', {
            stableKey: 'mode',
            order: 10,
            scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' },
          }),
          actionBinding('org.redbox.scoped-action', {
            stableKey: 'phase',
            order: 10,
            scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' },
          }),
        ])
      )
    );

    assert.deepEqual(issueCodes(result.issues), [
      'unsupported-action-context',
      'unsupported-action-mode',
      'unsupported-action-phase',
    ]);
    assert.equal(
      result.issues.every(issue => issue.action?.provenance?.moduleName === 'actions/index'),
      true
    );
  });

  it('validates every parameter and applies server-owned defaults to the immutable resolved binding', () => {
    const parameters: ActionParameterDefinition[] = [
      { name: 'label', title: 'Label', kind: 'string', required: true, minLength: 2, maxLength: 8 },
      { name: 'count', title: 'Count', kind: 'number', required: false, integer: true, defaultValue: 3 },
      { name: 'enabled', title: 'Enabled', kind: 'boolean', required: false, defaultValue: true },
      {
        name: 'mode',
        title: 'Mode',
        kind: 'enum',
        required: false,
        options: [{ value: 'safe', label: 'Safe' }],
        defaultValue: 'safe',
      },
      {
        name: 'tags',
        title: 'Tags',
        kind: 'array',
        required: false,
        items: { kind: 'string', minLength: 1 },
        defaultValue: ['one'],
      },
      { name: 'options', title: 'Options', kind: 'object', required: false, defaultValue: { nested: true } },
      {
        name: 'condition',
        title: 'Condition',
        kind: 'jsonata',
        required: false,
        defaultExpression: '$true',
      },
      {
        name: 'message',
        title: 'Message',
        kind: 'handlebars',
        destination: 'plain-text',
        required: false,
        defaultTemplate: 'Hello',
      },
      { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true },
    ];
    const registry = actionRegistry(actionDescriptor('org.redbox.parameter-action', { parameters }));
    const resolved = resolveActionPlan(
      registry,
      actionPlan([
        actionBinding('org.redbox.parameter-action', {
          parameters: {
            label: { kind: 'literal', value: 'valid' },
            credential: { kind: 'secret', configured: true },
          },
        }),
      ])
    );
    const resolvedBinding = firstResolvedBinding(resolved);
    const effective = resolvedBinding.binding.parameters;

    assert.deepEqual(effective, {
      label: { kind: 'literal', value: 'valid' },
      count: { kind: 'literal', value: 3 },
      enabled: { kind: 'literal', value: true },
      mode: { kind: 'literal', value: 'safe' },
      tags: { kind: 'literal', value: ['one'] },
      options: { kind: 'literal', value: { nested: true } },
      condition: { kind: 'jsonata', expression: '$true' },
      message: { kind: 'handlebars', template: 'Hello' },
      credential: { kind: 'secret', configured: true },
    });
    assert.equal(Object.isFrozen(effective), true);
    assert.equal(Object.isFrozen(effective.tags), true);
    const options = effective.options;
    if (options === undefined || options.kind !== 'literal' || typeof options.value !== 'object') {
      assert.fail('Expected the default object parameter.');
    }
    assert.equal(Object.isFrozen(options.value), true);
    assert.equal(resolvedBinding.preparedParameters.condition?.kind, 'jsonata');
    assert.equal(resolvedBinding.preparedParameters.message?.kind, 'handlebars');
    assert.equal(Object.isFrozen(resolvedBinding.preparedParameters), true);
  });

  it('rejects unsafe expression and template parameters before a handler can run', () => {
    const parameters: ActionParameterDefinition[] = [
      { name: 'condition', title: 'Condition', kind: 'jsonata', required: true },
      {
        name: 'message',
        title: 'Message',
        kind: 'handlebars',
        destination: 'html-text',
        required: true,
      },
    ];
    const registry = actionRegistry(actionDescriptor('org.redbox.unsafe-expression-action', { parameters }));
    const result = invalidResult(
      validateActionPlan(
        registry,
        actionPlan([
          actionBinding('org.redbox.unsafe-expression-action', {
            parameters: {
              condition: { kind: 'jsonata', expression: '$eval("1 + 1")' },
              message: { kind: 'handlebars', template: '{{get record "constructor"}}' },
            },
          }),
        ])
      )
    );

    assert.deepEqual(issueCodes(result.issues), ['invalid-jsonata-expression', 'invalid-handlebars-template']);
    assert.equal(JSON.stringify(result.issues).includes('$eval'), false);
    assert.equal(JSON.stringify(result.issues).includes('constructor'), false);
  });

  it('enforces the global array-item boundary when a descriptor omits maxItems', () => {
    const parameters: ActionParameterDefinition[] = [
      {
        name: 'items',
        title: 'Items',
        kind: 'array',
        required: true,
        items: { kind: 'number', integer: true },
      },
    ];
    const registry = actionRegistry(actionDescriptor('org.redbox.global-array-limit', { parameters }));
    const boundaryItems: number[] = [];
    for (let index = 0; index < ACTION_CONTRACT_LIMITS.maxArrayItems; index += 1) {
      boundaryItems.push(index);
    }
    const oversizedItems = [...boundaryItems, ACTION_CONTRACT_LIMITS.maxArrayItems];
    const boundaryBinding = actionBinding('org.redbox.global-array-limit', {
      parameters: { items: { kind: 'literal', value: boundaryItems } },
    });

    assert.equal(resolveActionPlan(registry, actionPlan([boundaryBinding])).bindings.length, 1);
    assert.equal(
      validateActionPlan(registry, {
        schemaVersion: ACTION_PLAN_SCHEMA_VERSION,
        recordTypeKey: 'rdmp',
        bindings: [{ ...boundaryBinding, parameters: { items: { kind: 'literal', value: oversizedItems } } }],
      }).ok,
      false
    );
  });

  it('returns all parameter rejection categories without serializing submitted values', () => {
    const parameters: ActionParameterDefinition[] = [
      { name: 'label', title: 'Label', kind: 'string', required: true, minLength: 2 },
      { name: 'count', title: 'Count', kind: 'number', required: false, integer: true },
      {
        name: 'mode',
        title: 'Mode',
        kind: 'enum',
        required: false,
        options: [{ value: 'safe', label: 'Safe' }],
      },
      { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true },
    ];
    const registry = actionRegistry(actionDescriptor('org.redbox.invalid-parameter-action', { parameters }));
    const result = invalidResult(
      validateActionPlan(
        registry,
        actionPlan([
          actionBinding('org.redbox.invalid-parameter-action', {
            parameters: {
              count: { kind: 'literal', value: 1.5 },
              mode: { kind: 'literal', value: 'submitted-sensitive-value' },
              credential: { kind: 'secret', configured: false },
              extra: { kind: 'literal', value: 'must-not-appear' },
            },
          }),
        ])
      )
    );

    assert.equal(issueCodes(result.issues).includes('missing-action-parameter'), true);
    assert.equal(issueCodes(result.issues).filter(code => code === 'invalid-action-parameter').length, 3);
    assert.equal(issueCodes(result.issues).includes('unexpected-action-parameter'), true);
    assert.equal(JSON.stringify(result.issues).includes('submitted-sensitive-value'), false);
    assert.equal(JSON.stringify(result.issues).includes('must-not-appear'), false);
  });

  it('enforces every execution policy override bound', () => {
    const executionPolicy: ActionExecutionPolicyBounds = {
      timeout: { defaultMs: 1_000, minMs: 100, maxMs: 2_000 },
      retry: { allowed: true, defaultMaxAttempts: 1, maxAttempts: 3, maxDelayMs: 1_000 },
    };
    const registry = actionRegistry(
      actionDescriptor('org.redbox.policy-action', { allowRepeatedBindings: true, executionPolicy })
    );
    const result = invalidResult(
      validateActionPlan(
        registry,
        actionPlan([
          parseActionBinding({
            ...actionBinding('org.redbox.policy-action', { stableKey: 'timeout', order: 10 }),
            policyOverrides: { timeoutMs: 2_001 },
          }),
          parseActionBinding({
            ...actionBinding('org.redbox.policy-action', { stableKey: 'attempts', order: 20 }),
            policyOverrides: { retry: { maxAttempts: 4, idempotent: true } },
          }),
          parseActionBinding({
            ...actionBinding('org.redbox.policy-action', { stableKey: 'delay', order: 30 }),
            policyOverrides: {
              retry: {
                maxAttempts: 3,
                idempotent: true,
                schedule: { type: 'fixed', delayMs: 1_001 },
              },
            },
          }),
        ])
      )
    );

    assert.equal(issueCodes(result.issues).filter(code => code === 'action-policy-exceeds-bounds').length, 3);
  });

  it('accepts only earlier same-attachment dependency references and exposes only declared safe prior outputs', () => {
    const registry = actionRegistry(
      actionDescriptor('org.redbox.producer-action', {
        outputFields: [
          { name: 'reference', title: 'Reference', kind: 'string', required: false },
          { name: 'privateData', title: 'Private data', kind: 'json', required: false },
        ],
        safeFields: ['reference'],
      }),
      actionDescriptor('org.redbox.consumer-action', { allowRepeatedBindings: true })
    );
    const producer = actionBinding('org.redbox.producer-action', { order: 10 });
    const outputConsumer = actionBinding('org.redbox.consumer-action', {
      stableKey: 'output',
      order: 30,
      dependencies: [{ bindingId: producer.id, condition: 'output-equals', field: 'reference', value: 'expected' }],
    });
    const successConsumer = actionBinding('org.redbox.consumer-action', {
      stableKey: 'success',
      order: 20,
      dependencies: [{ bindingId: producer.id, condition: 'success' }],
    });
    const resolved = resolveActionPlan(registry, actionPlan([outputConsumer, producer, successConsumer]));

    assert.deepEqual(
      resolved.bindings.map(entry => entry.binding.order),
      [10, 20, 30]
    );
    assert.deepEqual(resolved.bindings[1]?.priorOutputs, []);
    assert.deepEqual(resolved.bindings[2]?.priorOutputs, [{ bindingId: producer.id, fields: ['reference'] }]);
    assert.equal(Object.isFrozen(resolved.bindings[2]?.priorOutputs), true);
  });

  it('rejects missing, forward, cross-attachment, unsafe-output, mistyped, and cyclic dependencies', () => {
    const supportedModes: ActionExecutionMode[] = ['onCreate', 'onUpdate'];
    const registry = actionRegistry(
      actionDescriptor('org.redbox.dependency-action', {
        allowRepeatedBindings: true,
        modes: supportedModes,
        outputFields: [
          { name: 'reference', title: 'Reference', kind: 'string', required: false },
          { name: 'privateData', title: 'Private data', kind: 'json', required: false },
        ],
        safeFields: ['reference'],
      })
    );
    const missingId = bindingId('org.redbox.dependency-action', 'not-in-plan');
    const firstId = bindingId('org.redbox.dependency-action', 'first');
    const secondId = bindingId('org.redbox.dependency-action', 'second');
    const bindings = [
      actionBinding('org.redbox.dependency-action', {
        stableKey: 'missing',
        order: 40,
        dependencies: [{ bindingId: missingId, condition: 'success' }],
      }),
      actionBinding('org.redbox.dependency-action', {
        stableKey: 'unsafe',
        order: 30,
        dependencies: [{ bindingId: firstId, condition: 'output-equals', field: 'privateData', value: null }],
      }),
      actionBinding('org.redbox.dependency-action', {
        stableKey: 'mistyped',
        order: 35,
        dependencies: [{ bindingId: firstId, condition: 'output-equals', field: 'reference', value: 42 }],
      }),
      actionBinding('org.redbox.dependency-action', {
        stableKey: 'cross',
        order: 50,
        dependencies: [{ bindingId: firstId, condition: 'success' }],
        scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' },
      }),
      actionBinding('org.redbox.dependency-action', {
        stableKey: 'first',
        order: 10,
        dependencies: [{ bindingId: secondId, condition: 'success' }],
      }),
      actionBinding('org.redbox.dependency-action', {
        stableKey: 'second',
        order: 20,
        dependencies: [{ bindingId: firstId, condition: 'success' }],
      }),
    ];
    const result = invalidResult(validateActionPlan(registry, actionPlan(bindings)));
    const codes = issueCodes(result.issues);

    assert.equal(codes.includes('missing-action-dependency'), true);
    assert.equal(codes.includes('forward-action-dependency'), true);
    assert.equal(codes.includes('cross-attachment-action-dependency'), true);
    assert.equal(codes.includes('unsafe-prior-output-reference'), true);
    assert.equal(codes.includes('invalid-prior-output-comparison'), true);
  });

  it('validates deterministically, does not mutate caller bindings, and emits only bounded path-addressed errors', () => {
    const registry = actionRegistry(actionDescriptor('org.redbox.deterministic-action'));
    const first = actionBinding('org.redbox.deterministic-action', { stableKey: 'first', order: 10 });
    const second = actionBinding('org.redbox.deterministic-action', { stableKey: 'second', order: 10 });
    const input = actionPlan([first, second]);
    const firstResult = invalidResult(validateActionPlan(registry, input));
    const secondResult = invalidResult(validateActionPlan(registry, input));

    assert.deepEqual(firstResult.issues, secondResult.issues);
    assert.equal(Object.isFrozen(first), false);
    assert.equal(
      firstResult.issues.every(issue => issue.path.startsWith('$.bindings[')),
      true
    );
    assert.equal(
      firstResult.issues.every(issue => issue.message.length <= 120),
      true
    );
    assert.equal(
      firstResult.issues.every(issue => Object.isFrozen(issue)),
      true
    );
  });

  it('orders mixed-case issue paths by code units rather than the process locale', () => {
    const registry = actionRegistry(actionDescriptor('org.redbox.issue-order-action'));
    const result = invalidResult(
      validateActionPlan(
        registry,
        actionPlan([
          actionBinding('org.redbox.issue-order-action', {
            parameters: {
              alpha: { kind: 'literal', value: null },
              Beta: { kind: 'literal', value: null },
              beta: { kind: 'literal', value: null },
              Alpha: { kind: 'literal', value: null },
            },
          }),
        ])
      )
    );

    assert.deepEqual(
      result.issues.map(issue => issue.path),
      [
        '$.bindings[0].parameters.Alpha',
        '$.bindings[0].parameters.Beta',
        '$.bindings[0].parameters.alpha',
        '$.bindings[0].parameters.beta',
      ]
    );
  });
});
