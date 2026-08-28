import assert from 'node:assert/strict';
import {
  ACTION_CONTRACT_SCHEMA_VERSION,
  ACTION_CONTEXT_SCHEMA_VERSION,
  ACTION_CONTRACT_LIMITS,
  ACTION_RESULT_SCHEMA_VERSION,
  ActionContractValidationError,
  actionArrayParameterSchema,
  actionBindingSchema,
  actionFailureResultSchema,
  actionHandlebarsParameterSchema,
  actionJsonObjectSchema,
  actionJsonValueSchema,
  actionObjectParameterSchema,
  actionParameterValueSchema,
  actionPatchOperationSchema,
  actionPatchSchema,
  actionSuccessResultSchema,
  deriveStableActionBindingId,
  parseActionBinding,
  parseActionContext,
  parseActionDefinition,
  parseActionResult,
  sortActionBindings,
  validateActionBindingCollection,
  validateActionDefinitionCollection,
  validateActionResultForDefinition,
  type ActionBindingScope,
} from '../src/action-registry';

const lifecycleScope: ActionBindingScope = {
  context: 'record-lifecycle',
  mode: 'onCreate',
  phase: 'pre',
};

function definitionInput(): object {
  return {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: 'org.redbox.test-action',
    contractVersion: 1,
    title: 'Test action',
    description: 'A strict test action.',
    category: 'test',
    provenance: {
      packageName: '@researchdatabox/test',
      moduleName: 'actions/test-action',
    },
    handler: () => ({ schemaVersion: ACTION_RESULT_SCHEMA_VERSION, kind: 'no-change' }),
    contexts: ['record-lifecycle'],
    modes: ['onCreate'],
    phases: ['pre'],
    allowRepeatedBindings: false,
    parameterSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      parameters: [
        { name: 'label', title: 'Label', kind: 'string', required: true },
        { name: 'count', title: 'Count', kind: 'number', integer: true },
        { name: 'enabled', title: 'Enabled', kind: 'boolean' },
        {
          name: 'mode',
          title: 'Mode',
          kind: 'enum',
          options: [
            { value: 'safe', label: 'Safe' },
            { value: 'fast', label: 'Fast' },
          ],
        },
        { name: 'options', title: 'Options', kind: 'object' },
        {
          name: 'tags',
          title: 'Tags',
          kind: 'array',
          required: true,
          items: {
            kind: 'enum',
            options: [
              { value: 'reviewed', label: 'Reviewed' },
              { value: 'published', label: 'Published' },
            ],
          },
          minItems: 1,
          maxItems: 2,
        },
        { name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true },
        { name: 'selector', title: 'Selector', kind: 'jsonata' },
        { name: 'message', title: 'Message', kind: 'handlebars', destination: 'plain-text' },
      ],
    },
    outputSchema: {
      schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
      fields: [{ name: 'reference', title: 'Reference', kind: 'string', required: false }],
      safeFields: ['reference'],
    },
    resultContract: {
      allowedKinds: ['no-change', 'patch', 'reject'],
      patch: { allowedPathPrefixes: ['/metadata'], maxOperations: 4 },
    },
    executionPolicy: {
      timeout: { defaultMs: 1_000, minMs: 100, maxMs: 2_000 },
      retry: { allowed: false },
    },
  };
}

function bindingParametersInput(): object {
  return {
    label: { kind: 'literal', value: 'hello' },
    count: { kind: 'literal', value: 2 },
    enabled: { kind: 'literal', value: true },
    mode: { kind: 'literal', value: 'safe' },
    options: { kind: 'literal', value: { nested: true } },
    tags: { kind: 'literal', value: ['reviewed'] },
    credential: { kind: 'secret', configured: true },
    selector: { kind: 'jsonata', expression: '$.title' },
    message: { kind: 'handlebars', template: '{{title}}' },
  };
}

function bindingInput(scope: ActionBindingScope = lifecycleScope, stableKey = 'primary'): object {
  return {
    schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
    id: deriveStableActionBindingId({
      recordTypeKey: 'rdmp',
      scope,
      actionId: 'org.redbox.test-action',
      contractVersion: 1,
      stableKey,
    }),
    stableKey,
    actionId: 'org.redbox.test-action',
    contractVersion: 1,
    scope,
    parameters: bindingParametersInput(),
    order: 10,
  };
}

interface ResultCompatibilityCase {
  readonly name: string;
  readonly scope: ActionBindingScope;
  readonly patchAllowed: boolean;
}

const resultCompatibilityCases: readonly ResultCompatibilityCase[] = [
  {
    name: 'create pre',
    scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'pre' },
    patchAllowed: true,
  },
  {
    name: 'create postSync',
    scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'postSync' },
    patchAllowed: true,
  },
  {
    name: 'create post',
    scope: { context: 'record-lifecycle', mode: 'onCreate', phase: 'post' },
    patchAllowed: false,
  },
  {
    name: 'update pre',
    scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'pre' },
    patchAllowed: true,
  },
  {
    name: 'update postSync',
    scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'postSync' },
    patchAllowed: true,
  },
  {
    name: 'update post',
    scope: { context: 'record-lifecycle', mode: 'onUpdate', phase: 'post' },
    patchAllowed: false,
  },
  {
    name: 'delete pre',
    scope: { context: 'record-lifecycle', mode: 'onDelete', phase: 'pre' },
    patchAllowed: false,
  },
  {
    name: 'delete postSync',
    scope: { context: 'record-lifecycle', mode: 'onDelete', phase: 'postSync' },
    patchAllowed: false,
  },
  {
    name: 'delete post',
    scope: { context: 'record-lifecycle', mode: 'onDelete', phase: 'post' },
    patchAllowed: false,
  },
  {
    name: 'transition pre',
    scope: {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: 'draft-to-review',
    },
    patchAllowed: true,
  },
  {
    name: 'transition postSync',
    scope: {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'postSync',
      scopeId: 'draft-to-review',
    },
    patchAllowed: true,
  },
  {
    name: 'transition post',
    scope: {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'post',
      scopeId: 'draft-to-review',
    },
    patchAllowed: false,
  },
];

function serializedStringArrayByteLength(values: readonly string[]): number {
  return values.reduce(
    (byteLength, value, index) => byteLength + Buffer.byteLength(value, 'utf8') + 2 + (index === 0 ? 0 : 1),
    2
  );
}

function nestedObjectAtDepth(depth: number): object {
  let value: object = {};
  for (let currentDepth = 1; currentDepth < depth; currentDepth += 1) {
    value = { nested: value };
  }
  return value;
}

describe('action registry contracts', () => {
  it('parses every supported parameter kind and rejects unknown descriptor keys', () => {
    assert.equal(parseActionDefinition(definitionInput()).parameterSchema.parameters.length, 9);
    assert.equal(actionObjectParameterSchema.safeParse({ name: 'data', title: 'Data', kind: 'object' }).success, true);
    const handlebarsParameter = actionHandlebarsParameterSchema.safeParse({
      name: 'message',
      title: 'Message',
      kind: 'handlebars',
    });
    assert.equal(handlebarsParameter.success, true);
    if (handlebarsParameter.success) {
      assert.equal(handlebarsParameter.data.destination, 'plain-text');
    }
    assert.equal(
      actionArrayParameterSchema.safeParse({
        name: 'roles',
        title: 'Roles',
        kind: 'array',
        items: { kind: 'string' },
      }).success,
      true
    );
    assert.throws(() => parseActionDefinition({ ...definitionInput(), unsafe: true }), ActionContractValidationError);
  });

  it('enforces required array parameters and permits omission only when a valid default exists', () => {
    const requiredArray = {
      name: 'roles',
      title: 'Roles',
      kind: 'array',
      required: true,
      items: { kind: 'enum', options: [{ value: 'admin', label: 'Administrator' }] },
      minItems: 1,
    };
    const requiredDefinition = parseActionDefinition({
      ...definitionInput(),
      parameterSchema: {
        schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
        parameters: [requiredArray],
      },
    });
    const omittedBinding = parseActionBinding({ ...bindingInput(), parameters: {} });

    assert.throws(
      () => validateActionBindingCollection('rdmp', [requiredDefinition], [omittedBinding]),
      ActionContractValidationError
    );

    const defaultedDefinition = parseActionDefinition({
      ...definitionInput(),
      parameterSchema: {
        schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
        parameters: [{ ...requiredArray, defaultValue: ['admin'] }],
      },
    });
    assert.doesNotThrow(() => validateActionBindingCollection('rdmp', [defaultedDefinition], [omittedBinding]));

    assert.throws(
      () =>
        parseActionDefinition({
          ...definitionInput(),
          parameterSchema: {
            schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
            parameters: [{ ...requiredArray, defaultValue: [] }],
          },
        }),
      ActionContractValidationError
    );
    assert.throws(
      () =>
        parseActionDefinition({
          ...definitionInput(),
          parameterSchema: {
            schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
            parameters: [{ ...requiredArray, defaultValue: ['researcher'] }],
          },
        }),
      ActionContractValidationError
    );
  });

  it('rejects defaults that violate declared string and number constraints', () => {
    assert.throws(
      () =>
        parseActionDefinition({
          ...definitionInput(),
          parameterSchema: {
            schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
            parameters: [{ name: 'label', title: 'Label', kind: 'string', minLength: 3, defaultValue: 'no' }],
          },
        }),
      ActionContractValidationError
    );
    assert.throws(
      () =>
        parseActionDefinition({
          ...definitionInput(),
          parameterSchema: {
            schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
            parameters: [{ name: 'count', title: 'Count', kind: 'number', integer: true, defaultValue: 1.5 }],
          },
        }),
      ActionContractValidationError
    );
    assert.throws(
      () =>
        parseActionDefinition({
          ...definitionInput(),
          parameterSchema: {
            schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
            parameters: [{ name: 'count', title: 'Count', kind: 'number', maximum: 2, defaultValue: 3 }],
          },
        }),
      ActionContractValidationError
    );
  });

  it('rejects array defaults above the aggregate JSON byte limit and accepts the exact boundary', () => {
    const fullLengthItems = Array.from({ length: 7 }, () => 'x'.repeat(ACTION_CONTRACT_LIMITS.maxStringValueLength));
    const boundaryItemLength =
      ACTION_CONTRACT_LIMITS.maxJsonBytes -
      fullLengthItems.length * ACTION_CONTRACT_LIMITS.maxStringValueLength -
      3 * (fullLengthItems.length + 1) -
      1;
    const boundaryDefault = [...fullLengthItems, 'x'.repeat(boundaryItemLength)];
    const oversizedDefault = [...fullLengthItems, 'x'.repeat(boundaryItemLength + 1)];
    const parameter = {
      name: 'payloads',
      title: 'Payloads',
      kind: 'array',
      items: { kind: 'string' },
    };

    assert.equal(serializedStringArrayByteLength(boundaryDefault), ACTION_CONTRACT_LIMITS.maxJsonBytes);
    assert.equal(serializedStringArrayByteLength(oversizedDefault), ACTION_CONTRACT_LIMITS.maxJsonBytes + 1);
    assert.equal(actionArrayParameterSchema.safeParse({ ...parameter, defaultValue: boundaryDefault }).success, true);
    assert.equal(actionArrayParameterSchema.safeParse({ ...parameter, defaultValue: oversizedDefault }).success, false);
  });

  it('rejects array defaults above the aggregate JSON depth limit and accepts the exact boundary', () => {
    const parameter = {
      name: 'payloads',
      title: 'Payloads',
      kind: 'array',
      items: { kind: 'object' },
    };
    const boundaryDefault = [nestedObjectAtDepth(ACTION_CONTRACT_LIMITS.maxJsonDepth - 1)];
    const overlyDeepDefault = [nestedObjectAtDepth(ACTION_CONTRACT_LIMITS.maxJsonDepth)];

    assert.equal(actionJsonValueSchema.safeParse(overlyDeepDefault[0]).success, true);
    assert.equal(actionArrayParameterSchema.safeParse({ ...parameter, defaultValue: boundaryDefault }).success, true);
    assert.equal(
      actionArrayParameterSchema.safeParse({ ...parameter, defaultValue: overlyDeepDefault }).success,
      false
    );
  });

  it('requires an explicit binding scope and validates typed parameter values', () => {
    const definition = parseActionDefinition(definitionInput());
    const binding = parseActionBinding(bindingInput());

    assert.throws(() => parseActionBinding({ ...bindingInput(), scope: undefined }), ActionContractValidationError);
    assert.throws(
      () =>
        validateActionBindingCollection(
          'rdmp',
          [definition],
          [
            parseActionBinding({
              ...bindingInput(),
              parameters: { ...binding.parameters, count: { kind: 'literal', value: 2.5 } },
            }),
          ]
        ),
      ActionContractValidationError
    );
  });

  it('validates binding values against parameter kinds, enum vocabulary, and literal size bounds', () => {
    const definition = parseActionDefinition(definitionInput());
    const validParameters = parseActionBinding(bindingInput()).parameters;

    for (const parameters of [
      { ...validParameters, label: { kind: 'jsonata', expression: '$.title' } },
      { ...validParameters, mode: { kind: 'literal', value: 'unsafe' } },
      { ...validParameters, tags: { kind: 'literal', value: ['unknown'] } },
      { ...validParameters, tags: { kind: 'literal', value: ['reviewed', 'published', 'reviewed'] } },
    ]) {
      const binding = parseActionBinding({ ...bindingInput(), parameters });
      assert.throws(
        () => validateActionBindingCollection('rdmp', [definition], [binding]),
        ActionContractValidationError
      );
    }

    const boundedDefinition = parseActionDefinition({
      ...definitionInput(),
      parameterSchema: {
        schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
        parameters: [{ name: 'label', title: 'Label', kind: 'string', maxLength: 4 }],
      },
    });
    const oversizedBinding = parseActionBinding({
      ...bindingInput(),
      parameters: { label: { kind: 'literal', value: 'hello' } },
    });
    assert.throws(
      () => validateActionBindingCollection('rdmp', [boundedDefinition], [oversizedBinding]),
      ActionContractValidationError
    );

    assert.throws(
      () =>
        parseActionBinding({
          ...bindingInput(),
          parameters: {
            label: {
              kind: 'literal',
              value: 'x'.repeat(ACTION_CONTRACT_LIMITS.maxStringValueLength + 1),
            },
          },
        }),
      ActionContractValidationError
    );
  });

  it('uses the global array-item limit when a parameter omits maxItems', () => {
    const definition = parseActionDefinition({
      ...definitionInput(),
      parameterSchema: {
        schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
        parameters: [
          {
            name: 'items',
            title: 'Items',
            kind: 'array',
            required: true,
            items: { kind: 'number', integer: true },
          },
        ],
      },
    });
    const boundaryItems: number[] = [];
    for (let index = 0; index < ACTION_CONTRACT_LIMITS.maxArrayItems; index += 1) {
      boundaryItems.push(index);
    }
    const boundaryBinding = parseActionBinding({
      ...bindingInput(),
      parameters: { items: { kind: 'literal', value: boundaryItems } },
    });
    assert.doesNotThrow(() => validateActionBindingCollection('rdmp', [definition], [boundaryBinding]));
    assert.throws(
      () =>
        parseActionBinding({
          ...bindingInput(),
          parameters: {
            items: {
              kind: 'literal',
              value: [...boundaryItems, ACTION_CONTRACT_LIMITS.maxArrayItems],
            },
          },
        }),
      ActionContractValidationError
    );
  });

  it('requires required secret bindings to be configured', () => {
    const definition = parseActionDefinition({
      ...definitionInput(),
      parameterSchema: {
        schemaVersion: ACTION_CONTRACT_SCHEMA_VERSION,
        parameters: [{ name: 'credential', title: 'Credential', kind: 'secret', writeOnly: true, required: true }],
      },
    });
    const binding = parseActionBinding({
      ...bindingInput(),
      parameters: { credential: { kind: 'secret', configured: false } },
    });

    assert.throws(
      () => validateActionBindingCollection('rdmp', [definition], [binding]),
      ActionContractValidationError
    );
  });

  it('includes transition scope in stable IDs and sorts without mutating bindings', () => {
    const firstScope: ActionBindingScope = {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: 'draft-to-review',
    };
    const secondScope: ActionBindingScope = { ...firstScope, scopeId: 'review-to-final' };
    const first = deriveStableActionBindingId({
      recordTypeKey: 'rdmp',
      scope: firstScope,
      actionId: 'org.redbox.test-action',
      contractVersion: 1,
      stableKey: 'notify',
    });
    const second = deriveStableActionBindingId({
      recordTypeKey: 'rdmp',
      scope: secondScope,
      actionId: 'org.redbox.test-action',
      contractVersion: 1,
      stableKey: 'notify',
    });
    const bindings = [
      { id: second, order: 20, scope: secondScope },
      { id: first, order: 10, scope: firstScope },
    ];

    assert.notEqual(first, second);
    assert.deepEqual(
      sortActionBindings(bindings).map(binding => binding.id),
      [first, second]
    );
    assert.equal(bindings[0].id, second);
  });

  it('uses a closed success/failure union and safe JSON Patch operations', () => {
    const definition = parseActionDefinition(definitionInput());
    assert.equal(
      actionSuccessResultSchema.safeParse({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'patch',
        patch: [{ op: 'replace', path: '/metadata/title', value: 'New title' }],
      }).success,
      true
    );
    assert.equal(
      actionFailureResultSchema.safeParse({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'reject',
        code: 'not-allowed',
        message: 'The transition is not allowed.',
      }).success,
      true
    );
    assert.equal(actionPatchSchema.safeParse([{ op: 'remove', path: '/__proto__/polluted' }]).success, false);
    assert.equal(
      actionSuccessResultSchema.safeParse({
        schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
        kind: 'patch',
        patch: [{ op: 'move', path: '/metadata/title', from: '/title' }],
      }).success,
      false
    );
    assert.throws(
      () =>
        validateActionResultForDefinition(
          parseActionResult({
            schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
            kind: 'patch',
            patch: [{ op: 'replace', path: '/private/title', value: 'Unsafe' }],
          }),
          definition,
          lifecycleScope
        ),
      ActionContractValidationError
    );
  });

  it('rejects patch-capable descriptors with only non-mutating modes or phases', () => {
    assert.throws(
      () =>
        parseActionDefinition({
          ...definitionInput(),
          phases: ['post'],
        }),
      ActionContractValidationError
    );
    assert.throws(
      () =>
        parseActionDefinition({
          ...definitionInput(),
          modes: ['onDelete'],
        }),
      ActionContractValidationError
    );

    for (const compatibility of [
      { modes: ['onCreate'], phases: ['post'] },
      { modes: ['onDelete'], phases: ['pre', 'postSync'] },
    ]) {
      assert.doesNotThrow(() =>
        parseActionDefinition({
          ...definitionInput(),
          ...compatibility,
          resultContract: { allowedKinds: ['no-change', 'reject'] },
        })
      );
    }
  });

  it('enforces patch compatibility for every action binding mode and phase', () => {
    const definition = parseActionDefinition({
      ...definitionInput(),
      contexts: ['record-lifecycle', 'workflow-transition'],
      modes: ['onCreate', 'onUpdate', 'onDelete', 'onTransitionWorkflow'],
      phases: ['pre', 'postSync', 'post'],
    });
    const patchResult = parseActionResult({
      schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
      kind: 'patch',
      patch: [{ op: 'replace', path: '/metadata/title', value: 'New title' }],
    });
    const noChangeResult = parseActionResult({
      schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
      kind: 'no-change',
    });

    for (const testCase of resultCompatibilityCases) {
      if (testCase.patchAllowed) {
        assert.doesNotThrow(
          () => validateActionResultForDefinition(patchResult, definition, testCase.scope),
          testCase.name
        );
      } else {
        assert.throws(
          () => validateActionResultForDefinition(patchResult, definition, testCase.scope),
          ActionContractValidationError,
          testCase.name
        );
      }
      assert.doesNotThrow(
        () => validateActionResultForDefinition(noChangeResult, definition, testCase.scope),
        testCase.name
      );
    }
  });

  it('requires transition data to match the context scope', () => {
    const scope: ActionBindingScope = {
      context: 'workflow-transition',
      mode: 'onTransitionWorkflow',
      phase: 'pre',
      scopeId: 'draft-to-review',
    };
    const context = {
      schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
      executionId: 'execution-1',
      correlationId: 'correlation-1',
      timestamp: '2026-08-26T12:00:00Z',
      brandId: 'default',
      recordTypeKey: 'rdmp',
      scope,
      actor: { id: 'user-1', roles: ['admin'] },
      record: { oid: 'record-1', current: {}, candidate: {} },
      transition: {
        scopeId: 'another-transition',
        sourceStage: 'draft',
        targetStage: 'review',
      },
      priorOutputs: [],
    };

    assert.throws(() => parseActionContext(context), ActionContractValidationError);
  });

  it('rejects unsafe fields in prior action outputs', () => {
    const binding = parseActionBinding(bindingInput());

    assert.throws(
      () =>
        parseActionContext({
          schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
          executionId: 'execution-1',
          correlationId: 'correlation-1',
          timestamp: '2026-08-26T12:00:00Z',
          brandId: 'default',
          recordTypeKey: 'rdmp',
          scope: lifecycleScope,
          actor: { id: 'user-1', roles: ['admin'] },
          record: { oid: 'record-1', current: {}, candidate: {} },
          priorOutputs: [
            {
              bindingId: binding.id,
              output: {
                schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
                fields: { reference: 'safe-reference' },
                unsafe: 'must-not-reach-a-handler',
              },
            },
          ],
        }),
      ActionContractValidationError
    );
  });

  it('rejects prototype-related keys nested in prior action output fields', () => {
    const binding = parseActionBinding(bindingInput());

    const dangerousNestedValues: object[] = [
      { envelope: { ['__proto__']: { polluted: true } } },
      { envelope: [{ constructor: { polluted: true } }] },
      { envelope: { nested: { prototype: { polluted: true } } } },
      { envelope: { 'constructor.prototype.polluted': true } },
    ];

    for (const value of dangerousNestedValues) {
      assert.throws(
        () =>
          parseActionContext({
            schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
            executionId: 'execution-1',
            correlationId: 'correlation-1',
            timestamp: '2026-08-26T12:00:00Z',
            brandId: 'default',
            recordTypeKey: 'rdmp',
            scope: lifecycleScope,
            actor: { id: 'user-1', roles: ['admin'] },
            record: { oid: 'record-1', current: {}, candidate: {} },
            priorOutputs: [
              {
                bindingId: binding.id,
                output: {
                  schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
                  fields: { reference: value },
                },
              },
            ],
          }),
        ActionContractValidationError
      );
    }
  });

  it('rejects prior action output fields above the aggregate JSON byte limit', () => {
    const binding = parseActionBinding(bindingInput());
    const fieldValue = 'x'.repeat(Math.floor(ACTION_CONTRACT_LIMITS.maxJsonBytes / 2));

    assert.throws(
      () =>
        parseActionContext({
          schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
          executionId: 'execution-1',
          correlationId: 'correlation-1',
          timestamp: '2026-08-26T12:00:00Z',
          brandId: 'default',
          recordTypeKey: 'rdmp',
          scope: lifecycleScope,
          actor: { id: 'user-1', roles: ['admin'] },
          record: { oid: 'record-1', current: {}, candidate: {} },
          priorOutputs: [
            {
              bindingId: binding.id,
              output: {
                schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
                fields: { first: fieldValue, second: fieldValue },
              },
            },
          ],
        }),
      ActionContractValidationError
    );
  });

  it('accepts the documented safe prior action output shape', () => {
    const binding = parseActionBinding(bindingInput());
    const context = parseActionContext({
      schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
      executionId: 'execution-1',
      correlationId: 'correlation-1',
      timestamp: '2026-08-26T12:00:00Z',
      brandId: 'default',
      recordTypeKey: 'rdmp',
      scope: lifecycleScope,
      actor: { id: 'user-1', roles: ['admin'] },
      record: { oid: 'record-1', current: {}, candidate: {} },
      priorOutputs: [
        {
          bindingId: binding.id,
          output: {
            schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
            fields: {
              reference: {
                identifier: 'safe-reference',
                metadata: {
                  title: 'Ordinary nested JSON',
                  contributors: [{ name: 'Ada', affiliations: ['QCIF'] }],
                },
              },
            },
          },
        },
      ],
    });

    assert.deepEqual(context.priorOutputs, [
      {
        bindingId: binding.id,
        output: {
          schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
          fields: {
            reference: {
              identifier: 'safe-reference',
              metadata: {
                title: 'Ordinary nested JSON',
                contributors: [{ name: 'Ada', affiliations: ['QCIF'] }],
              },
            },
          },
        },
      },
    ]);
  });

  it('enforces the prior action output field-count limit at 64 fields', () => {
    const binding = parseActionBinding(bindingInput());
    const boundaryFields: Record<string, number> = {};
    for (let index = 0; index < ACTION_CONTRACT_LIMITS.maxOutputFields; index += 1) {
      boundaryFields[`field${index}`] = index;
    }
    const contextInput = {
      schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
      executionId: 'execution-1',
      correlationId: 'correlation-1',
      timestamp: '2026-08-26T12:00:00Z',
      brandId: 'default',
      recordTypeKey: 'rdmp',
      scope: lifecycleScope,
      actor: { id: 'user-1', roles: ['admin'] },
      record: { oid: 'record-1', current: {}, candidate: {} },
      priorOutputs: [
        {
          bindingId: binding.id,
          output: {
            schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
            fields: boundaryFields,
          },
        },
      ],
    };

    const context = parseActionContext(contextInput);
    assert.equal(Object.keys(context.priorOutputs[0].output.fields).length, ACTION_CONTRACT_LIMITS.maxOutputFields);
    assert.throws(
      () =>
        parseActionContext({
          ...contextInput,
          priorOutputs: [
            {
              bindingId: binding.id,
              output: {
                schemaVersion: ACTION_RESULT_SCHEMA_VERSION,
                fields: { ...boundaryFields, field64: 64 },
              },
            },
          ],
        }),
      ActionContractValidationError
    );
  });

  it('deeply freezes parsed action contexts', () => {
    const context = parseActionContext({
      schemaVersion: ACTION_CONTEXT_SCHEMA_VERSION,
      executionId: 'execution-1',
      correlationId: 'correlation-1',
      timestamp: '2026-08-26T12:00:00Z',
      brandId: 'default',
      recordTypeKey: 'rdmp',
      scope: lifecycleScope,
      actor: { id: 'user-1', roles: ['admin'] },
      record: { current: { nested: { values: [1] } } },
      priorOutputs: [],
    });

    assert.equal(Object.isFrozen(context), true);
    assert.equal(Object.isFrozen(context.record.current?.nested), true);
    assert.equal(Object.isFrozen(context.actor?.roles), true);
    assert.throws(() => context.actor?.roles.push('reviewer'), TypeError);
  });

  it('returns a safeParse failure for excessively deep JSON', () => {
    let deeplyNested: object = {};
    for (let depth = 0; depth < 10_000; depth += 1) {
      deeplyNested = { nested: deeplyNested };
    }

    assert.equal(actionJsonValueSchema.safeParse(deeplyNested).success, false);
  });

  it('enforces the canonical array-item boundary recursively across JSON-bearing validators', () => {
    const boundary = Array.from({ length: ACTION_CONTRACT_LIMITS.maxArrayItems }, (_, index) => index);
    const oversized = [...boundary, ACTION_CONTRACT_LIMITS.maxArrayItems];

    const cases = [
      {
        boundary,
        oversized,
        validate: (value: object | number[]): boolean => actionJsonValueSchema.safeParse(value).success,
      },
      {
        boundary: { nested: boundary },
        oversized: { nested: oversized },
        validate: (value: object | number[]): boolean => actionJsonValueSchema.safeParse(value).success,
      },
      {
        boundary: { nested: boundary },
        oversized: { nested: oversized },
        validate: (value: object | number[]): boolean => actionJsonObjectSchema.safeParse(value).success,
      },
      {
        boundary: { kind: 'literal', value: { nested: boundary } },
        oversized: { kind: 'literal', value: { nested: oversized } },
        validate: (value: object | number[]): boolean => actionParameterValueSchema.safeParse(value).success,
      },
      {
        boundary: { op: 'replace', path: '/metadata/items', value: { nested: boundary } },
        oversized: { op: 'replace', path: '/metadata/items', value: { nested: oversized } },
        validate: (value: object | number[]): boolean => actionPatchOperationSchema.safeParse(value).success,
      },
    ];

    for (const testCase of cases) {
      assert.equal(testCase.validate(testCase.boundary), true);
      assert.equal(testCase.validate(testCase.oversized), false);
    }
  });

  it('rejects getter-backed action inputs before invoking accessors', () => {
    let jsonGetterReads = 0;
    const hostileJson: object = {};
    Object.defineProperty(hostileJson, 'nested', {
      enumerable: false,
      get: () => {
        jsonGetterReads += 1;
        return [];
      },
    });

    let bindingGetterReads = 0;
    const hostileBinding = { ...bindingInput() };
    Object.defineProperty(hostileBinding, 'parameters', {
      enumerable: false,
      get: () => {
        bindingGetterReads += 1;
        return bindingParametersInput();
      },
    });

    assert.equal(actionJsonValueSchema.safeParse(hostileJson).success, false);
    assert.equal(actionBindingSchema.safeParse(hostileBinding).success, false);
    assert.throws(() => parseActionBinding(hostileBinding), ActionContractValidationError);
    assert.equal(jsonGetterReads, 0);
    assert.equal(bindingGetterReads, 0);
  });

  it('enforces policy override bounds and collision-free derived IDs', () => {
    const definition = parseActionDefinition(definitionInput());
    const binding = parseActionBinding({
      ...bindingInput(),
      policyOverrides: { timeoutMs: 2_001 },
    });

    assert.throws(
      () => validateActionBindingCollection('rdmp', [definition], [binding]),
      ActionContractValidationError
    );

    const validBinding = parseActionBinding(bindingInput());
    assert.throws(
      () => validateActionBindingCollection('rdmp', [definition], [validBinding, validBinding]),
      ActionContractValidationError
    );
    assert.throws(() => validateActionDefinitionCollection([definition, definition]), ActionContractValidationError);
  });
});
