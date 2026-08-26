import { expect } from 'chai';
import { AllDefs, FormComponentDefinitionKind } from '@researchdatabox/sails-ng-common';
import { performance } from 'perf_hooks';
import type {
  FormComponentDefinitionFrame,
  FormConfigFrame,
  ReusableFormDefinitions,
} from '@researchdatabox/sails-ng-common';

import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  createCoreRecordContractContributors,
  RecordContractCompiler,
  RecordContractContributorRegistry,
  RECORD_SCHEMA_PROBLEM_CODES,
  recordContractPointer,
  recordSchema,
} from '../../../src';
import type {
  ContractNode,
  RecordContractComponentContributor,
  RecordContractContributorRegistration,
  RecordContractExtensionContributor,
  RecordContractPublicContext,
  RecordSchemaLimitsConfig,
} from '../../../src';
import { createRecordContractFixture } from '../../fixtures/record-contract.fixtures';

const publicContext: RecordContractPublicContext = {
  brand: 'default',
  portal: 'default',
  kind: 'create',
  recordType: 'dataset',
  workflowStep: 'draft',
  form: 'test-form',
  operation: 'submit',
  unknownProperties: 'allow',
  enforcement: 'shadow',
};

const generousLimits: RecordSchemaLimitsConfig = {
  ...recordSchema.limits,
  contributorTimeoutMs: 100,
};

class RuntimeBoundaryValue {
  public readonly stable = true;
}

class RuntimeReusableFormComponent implements FormComponentDefinitionFrame {
  public readonly name = 'runtime-reusable';
  public readonly component = { class: 'SimpleInputComponent', config: {} };
}

class RuntimeComponentContribution {
  public readonly kind = 'node';
  public readonly node: ContractNode = { kind: 'scalar', nullable: false, scalarType: 'string' };
}

function registrations(
  additional: readonly (RecordContractComponentContributor | RecordContractExtensionContributor)[] = [],
  excludedCoreType?: string
): RecordContractContributorRegistration[] {
  return [
    ...createCoreRecordContractContributors()
      .filter(contributor => contributor.componentType !== excludedCoreType)
      .map(contributor => ({ contributor, source: 'core' as const })),
    ...additional.map(contributor => ({
      contributor,
      source: 'hook' as const,
      packageName: '@test/record-contract-hook',
    })),
  ];
}

function compiler(
  limits: RecordSchemaLimitsConfig = generousLimits,
  additional: readonly (RecordContractComponentContributor | RecordContractExtensionContributor)[] = [],
  excludedCoreType?: string
): RecordContractCompiler {
  return new RecordContractCompiler(
    new RecordContractContributorRegistry(registrations(additional, excludedCoreType)),
    limits
  );
}

function form(
  componentDefinitions: readonly FormComponentDefinitionFrame[],
  overrides: Partial<FormConfigFrame> = {}
): FormConfigFrame {
  return {
    name: 'record-contract-test-form',
    type: 'record-contract-test',
    componentDefinitions: [...componentDefinitions],
    ...overrides,
  } as FormConfigFrame;
}

function field(
  name: string,
  componentType: string,
  componentConfig: Record<string, unknown> = {},
  modelConfig: Record<string, unknown> = {}
): FormComponentDefinitionFrame {
  return {
    name,
    component: { class: componentType, config: componentConfig },
    model: { class: `${componentType}Model`, config: modelConfig },
  } as FormComponentDefinitionFrame;
}

function hookContributor(
  componentType: string,
  compile: RecordContractComponentContributor['compile']
): RecordContractComponentContributor {
  return {
    kind: 'component',
    key: `test.${componentType.toLowerCase()}`,
    version: '1',
    componentType,
    ownedPointers: [''],
    nullability: 'configuration',
    compile,
  };
}

function expectCompiled(result: Awaited<ReturnType<RecordContractCompiler['compile']>>) {
  expect(result.kind).to.equal('compiled');
  if (result.kind !== 'compiled') {
    throw new Error(`Expected compilation, received ${result.code}.`);
  }
  return result.contract;
}

function expectFailure(result: Awaited<ReturnType<RecordContractCompiler['compile']>>, code: string): void {
  expect(result.kind).to.equal('failed');
  if (result.kind === 'failed') {
    expect(result.code).to.equal(code);
  }
}

describe('RecordContractCompiler and core contributors', function () {
  it('keeps a closed classification and contributor for every currently registered core form component', async function () {
    const registeredCoreTypes = AllDefs.filter(definition => definition.kind === FormComponentDefinitionKind)
      .map(definition => definition.class)
      .sort();
    const inventoryTypes = Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY).sort();
    const contributors = createCoreRecordContractContributors();

    expect(inventoryTypes).to.deep.equal(registeredCoreTypes);
    expect(contributors.map(contributor => contributor.componentType)).to.deep.equal(inventoryTypes);

    for (const contributor of contributors) {
      const contribution = await contributor.compile({
        component: field('isolated', contributor.componentType),
        pointer: recordContractPointer('/isolated'),
        publicContext,
        compileChildren: async (_children, _parent, options) => ({
          kind: 'object',
          nullable: false,
          properties: {},
          unknownProperties: 'allow',
          ...(options?.definitionKey ? { definitionKey: options.definitionKey } : {}),
        }),
      });
      expect(['node', 'non-persisting']).to.include(contribution.kind);
    }
  });

  it('compiles the representative fixture into deterministic dialect-neutral IR', async function () {
    const fixture = createRecordContractFixture();
    const request = {
      form: fixture.form,
      reusableFormDefinitions: fixture.reusableFormDefinitions,
      extensionMetadata: fixture.namespacedExtensionMetadata,
      context: publicContext,
    };
    const first = expectCompiled(await compiler().compile(request));
    const second = expectCompiled(await compiler().compile(structuredClone(request)));

    expect(first).to.deep.equal(second);
    expect(first.root.properties.fixture_heading).to.equal(undefined);
    expect(first.root.properties.title).to.include({ kind: 'scalar', scalarType: 'string' });
    expect(first.root.properties.amount).to.include({ kind: 'scalar', scalarType: 'number' });
    expect(first.root.properties.count).to.include({ kind: 'scalar', scalarType: 'integer' });
    expect(first.root.properties.is_public).to.include({ kind: 'scalar', scalarType: 'boolean' });
    expect(first.root.properties.fixed_choice).to.deep.include({ enum: ['alpha', 'beta'] });
    expect(first.root.properties.details.kind).to.equal('object');
    expect(first.root.properties.contributors.kind).to.equal('array');
    expect(first.root.properties.contact_email.kind).to.equal('scalar');
    expect(first.definitions['contact-details-v1']).to.include({
      kind: 'object',
      definitionKey: 'contact-details-v1',
    });
    expect(first.root.properties.access_questions.kind).to.equal('object');
    if (first.root.properties.access_questions.kind === 'object') {
      expect(first.root.properties.access_questions.properties.consent.kind).to.equal('conditional');
    }
    expect(first.root.properties.custom_hook_value).to.include({
      kind: 'any',
      reason: 'unsupported-component',
    });
    expect(first.completeness).to.equal('partial');
    expect(first.diagnostics.map(diagnostic => diagnostic.code)).to.include.members([
      'x-redbox-unsupported-component',
      'record-contract.core-permissive-shape',
      'record-contract.unrepresentable-condition',
    ]);

    const serialized = JSON.stringify(first);
    expect(serialized).not.to.include('$schema');
    expect(serialized).not.to.include('$defs');
    expect(serialized).not.to.include('additionalProperties');
  });

  it('compiles the configured data record form with RegExp validator configuration', async function () {
    const configuredFormModule = require('../../../../redbox-hook-dev/src/form-config/dataRecord-1.0-draft') as {
      default: FormConfigFrame;
    };
    const configuredForm = configuredFormModule.default;

    const contract = expectCompiled(
      await compiler().compile({
        form: configuredForm,
        context: { ...publicContext, form: configuredForm.name },
      })
    );

    const patternSummaries = contract.validatorSummaries.filter(summary => summary.code === 'form.pattern');
    expect(patternSummaries.map(summary => summary.pointers)).to.deep.equal([
      [recordContractPointer('/repeatable_textfield_1/__record_schema_item')],
      [recordContractPointer('/text_7')],
    ]);
    expect(JSON.stringify(contract)).not.to.include('prefix.*');
  });

  it('compiles an anonymous repeatable element template without changing the form input', async function () {
    const repeatable = field('aliases', 'RepeatableComponent', {
      elementTemplate: field('', 'SimpleInputComponent'),
    });
    const request = {
      form: form([repeatable]),
      context: publicContext,
    };
    const before = structuredClone(request);

    const contract = expectCompiled(await compiler().compile(request));

    expect(request).to.deep.equal(before);
    expect(contract.root.properties.aliases).to.deep.include({ kind: 'array', nullable: false });
    if (contract.root.properties.aliases.kind === 'array') {
      expect(contract.root.properties.aliases.items).to.include({ kind: 'scalar', scalarType: 'string' });
    }
    expect(contract.fieldOwners).to.have.property('/aliases/__record_schema_item');
  });

  it('snapshots compiler inputs and exposes only an immutable allowlisted public context', async function () {
    let observedContextKeys: string[] = [];
    let observedPattern: unknown;
    let componentMutationAccepted = true;
    let contextMutationAccepted = true;
    const inspecting = hookContributor('InspectingComponent', context => {
      observedContextKeys = Object.keys(context.publicContext).sort();
      observedPattern = context.component.model?.config?.validators?.[0]?.config?.pattern;
      componentMutationAccepted = context.component.component.config
        ? Reflect.set(context.component.component.config, 'mutated', true)
        : true;
      contextMutationAccepted = Reflect.set(context.publicContext, 'oid', 'should-not-leak');
      return { kind: 'node', node: { kind: 'scalar', nullable: false, scalarType: 'string' } };
    });
    const requestContext: RecordContractPublicContext = { ...publicContext };
    Object.defineProperties(requestContext, {
      oid: { enumerable: true, value: 'private-oid' },
      roles: { enumerable: true, value: ['Admin'] },
      actor: { enumerable: true, value: { username: 'private-user' } },
      record: { enumerable: true, value: { metadata: { title: 'private-record-value' } } },
      request: { enumerable: true, value: { authorization: 'private-request-value' } },
      sourceForm: { enumerable: true, value: { name: 'private-source-form' } },
      contextVariables: { enumerable: true, value: { privateContextValue: 'private-context-value' } },
    });
    const request = {
      form: form([
        field(
          'inspected',
          'InspectingComponent',
          { stable: true },
          {
            validators: [{ class: 'pattern', config: { pattern: /prefix.*/i } }],
          }
        ),
      ]),
      context: requestContext,
    };
    const before = structuredClone(request);

    const contract = expectCompiled(await compiler(generousLimits, [inspecting]).compile(request));

    expect(request).to.deep.equal(before);
    expect(observedPattern).to.deep.equal({ source: 'prefix.*', flags: 'i' });
    expect(Object.isFrozen(observedPattern)).to.equal(true);
    expect(componentMutationAccepted).to.equal(false);
    expect(contextMutationAccepted).to.equal(false);
    expect(observedContextKeys).to.deep.equal(
      [
        'brand',
        'enforcement',
        'form',
        'kind',
        'operation',
        'portal',
        'recordType',
        'unknownProperties',
        'workflowStep',
      ].sort()
    );
    expect(contract.context).to.deep.equal(publicContext);
    expect(contract.context).not.to.have.property('oid');
    expect(Object.isFrozen(contract.context)).to.equal(true);
    expect(JSON.stringify(contract.context)).not.to.match(
      /private-(?:oid|user|record-value|request-value|source-form|context-value)/
    );
  });

  it('keeps the runtime-form bridge isolated from reusable, extension, and contributor inputs', async function () {
    const reusableResult = await compiler().compile({
      form: form([]),
      context: publicContext,
      reusableFormDefinitions: { runtime: [new RuntimeReusableFormComponent()] },
    });
    expectFailure(reusableResult, RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT);

    const extensionResult = await compiler().compile({
      form: form([]),
      context: publicContext,
      extensionMetadata: { 'test:runtime': new RuntimeBoundaryValue() },
    });
    expectFailure(extensionResult, RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT);

    const runtimeContributor = hookContributor('RuntimeOutputComponent', () => new RuntimeComponentContribution());
    const contributorResult = await compiler(generousLimits, [runtimeContributor]).compile({
      form: form([field('runtime', 'RuntimeOutputComponent')]),
      context: publicContext,
    });
    expectFailure(contributorResult, RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_FAILED);
  });

  it('uses escaped pointers, detects form path collisions, and traverses non-persisting wrappers', async function () {
    const wrapped = field('layout', 'TabContentComponent', {
      componentDefinitions: [field('a/b~c', 'SimpleInputComponent')],
    });
    const contract = expectCompiled(
      await compiler().compile({
        form: form([wrapped]),
        context: publicContext,
      })
    );

    expect(contract.root.properties.layout).to.equal(undefined);
    expect(contract.root.properties['a/b~c']).to.include({ kind: 'scalar' });
    expect(contract.fieldOwners).to.have.property('/a~1b~0c');

    const duplicate = await compiler().compile({
      form: form([field('duplicate', 'SimpleInputComponent'), field('duplicate', 'TextAreaComponent')]),
      context: publicContext,
    });
    expectFailure(duplicate, RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT);
    if (duplicate.kind === 'failed') {
      expect(duplicate.diagnostics.map(diagnostic => diagnostic.code)).to.include(
        'record-contract.path-ownership-collision'
      );
    }
  });

  it('expands reusable definitions with stable identity and rejects missing definitions and cycles', async function () {
    const reusableField = {
      ...field('placeholder', 'ReusableComponent'),
      overrides: { reusableFormName: 'details-v1' },
    } as FormComponentDefinitionFrame;
    const reusableFormDefinitions: ReusableFormDefinitions = {
      'details-v1': [
        {
          name: 'expanded',
          component: { class: 'SimpleInputComponent', config: {} },
          model: { class: 'SimpleInputModel', config: {} },
        },
      ],
    };
    const contract = expectCompiled(
      await compiler().compile({
        form: form([reusableField]),
        reusableFormDefinitions,
        context: publicContext,
      })
    );
    expect(contract.root.properties.expanded.kind).to.equal('scalar');
    expect(contract.definitions['details-v1']).to.include({ definitionKey: 'details-v1' });

    expectFailure(
      await compiler().compile({ form: form([reusableField]), context: publicContext }),
      RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT
    );

    const cyclicDefinitions: ReusableFormDefinitions = {
      a: [
        {
          name: 'a',
          overrides: { reusableFormName: 'b' },
          component: { class: 'ReusableComponent', config: { componentDefinitions: [] } },
        },
      ],
      b: [
        {
          name: 'b',
          overrides: { reusableFormName: 'a' },
          component: { class: 'ReusableComponent', config: { componentDefinitions: [] } },
        },
      ],
    };
    expectFailure(
      await compiler().compile({
        form: form([{ ...reusableField, overrides: { reusableFormName: 'a' } }]),
        reusableFormDefinitions: cyclicDefinitions,
        context: publicContext,
      }),
      RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT
    );
  });

  it('redacts validator implementation/configuration and preserves fields with runtime expressions', async function () {
    const expressionField = {
      ...field(
        'conditional',
        'SimpleInputComponent',
        {},
        {
          validators: [
            { class: 'required', groups: { include: ['submit'] } },
            { class: 'secret-validator', config: { token: 'never-expose-this' } },
          ],
        }
      ),
      expressions: [
        {
          name: 'hidden',
          config: { template: '$contains(secret)', target: 'field.visible' },
        },
      ],
    } as FormComponentDefinitionFrame;
    const contract = expectCompiled(
      await compiler().compile({
        form: form([expressionField], {
          validationOperations: {
            submit: { label: 'Submit', enabledValidationGroups: ['submit'], roles: ['Researcher'] },
          },
        }),
        context: publicContext,
      })
    );

    expect(contract.root.properties.conditional.kind).to.equal('scalar');
    expect(contract.completeness).to.equal('partial');
    expect(contract.validatorSummaries.map(summary => summary.code)).to.deep.equal(['form.custom', 'form.required']);
    expect(contract.validatorSummaries.find(summary => summary.code === 'form.required')?.operations).to.deep.equal([
      'submit',
    ]);
    const serialized = JSON.stringify(contract.validatorSummaries);
    expect(serialized).not.to.include('secret-validator');
    expect(serialized).not.to.include('never-expose-this');
    expect(serialized).not.to.include('$contains');
  });

  it('keeps unknown custom components permissive but fails uncovered core component coverage', async function () {
    const custom = expectCompiled(
      await compiler().compile({
        form: form([field('hook_value', 'UnregisteredHookComponent')]),
        context: publicContext,
      })
    );
    expect(custom.root.properties.hook_value).to.include({ kind: 'any', nullable: true });
    expect(custom.completeness).to.equal('partial');

    const uncovered = await compiler(generousLimits, [], 'SimpleInputComponent').compile({
      form: form([field('core_value', 'SimpleInputComponent')]),
      context: publicContext,
    });
    expectFailure(uncovered, RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT);
    if (uncovered.kind === 'failed') {
      expect(uncovered.diagnostics[0]?.code).to.equal('record-contract.uncovered-core-component');
    }
  });

  it('applies namespaced extensions independently of registration order', async function () {
    const alpha: RecordContractExtensionContributor = {
      kind: 'extension',
      key: 'test.alpha-extension',
      version: '1',
      namespace: 'test:alpha',
      root: recordContractPointer('/test:alpha'),
      nullability: 'non-null',
      compile: ({ metadata }) => ({
        node: {
          kind: 'object',
          nullable: false,
          properties: {
            value: { kind: 'scalar', nullable: false, scalarType: 'string' },
          },
          unknownProperties: 'declared',
          ...(metadata ? { annotations: { extensions: { 'test:metadata': metadata } } } : {}),
        },
      }),
    };
    const zeta: RecordContractExtensionContributor = {
      ...alpha,
      key: 'test.zeta-extension',
      namespace: 'test:zeta',
      root: recordContractPointer('/test:zeta'),
    };
    const request = {
      form: form([]),
      extensionMetadata: { 'test:alpha': { stable: true } },
      context: publicContext,
    };
    const forward = expectCompiled(await compiler(generousLimits, [alpha, zeta]).compile(request));
    const reverseRegistry = new RecordContractContributorRegistry(registrations([zeta, alpha]).reverse());
    const reverse = expectCompiled(await new RecordContractCompiler(reverseRegistry, generousLimits).compile(request));

    expect(reverse).to.deep.equal(forward);
    expect(Object.keys(forward.root.properties)).to.deep.equal(['test:alpha', 'test:zeta']);
  });

  it('returns typed failures for malformed, throwing, and oversized contributor output', async function () {
    const invalidNode: ContractNode = { kind: 'scalar', nullable: false, scalarType: 'string' };
    Object.defineProperty(invalidNode, 'nullable', { value: 'yes' });
    const malformed = hookContributor('MalformedComponent', () => ({
      kind: 'node',
      node: invalidNode,
    }));
    const throwing = hookContributor('ThrowingComponent', () => {
      throw new Error('private contributor failure');
    });
    const oversized = hookContributor('OversizedComponent', () => ({
      kind: 'node',
      node: {
        kind: 'any',
        nullable: false,
        annotations: { description: 'x'.repeat(1_000) },
      },
    }));

    for (const [componentType, contributor] of [
      ['MalformedComponent', malformed],
      ['ThrowingComponent', throwing],
    ] as const) {
      const result = await compiler(generousLimits, [contributor]).compile({
        form: form([field('value', componentType)]),
        context: publicContext,
      });
      expectFailure(result, RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_FAILED);
      if (result.kind === 'failed') {
        expect(JSON.stringify(result.diagnostics)).not.to.include('private contributor failure');
      }
    }

    const result = await compiler({ ...generousLimits, maxDocumentBytes: 200 }, [oversized]).compile({
      form: form([field('value', 'OversizedComponent')]),
      context: publicContext,
    });
    expectFailure(result, RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DOCUMENT_BYTES);
  });

  it('enforces depth, property, diagnostic, and timeout limits at the boundary without truncation', async function () {
    const nested = field('group', 'GroupComponent', {
      componentDefinitions: [field('child', 'SimpleInputComponent')],
    });
    expectCompiled(
      await compiler({ ...generousLimits, maxDepth: 3 }).compile({
        form: form([nested]),
        context: publicContext,
      })
    );
    expectFailure(
      await compiler({ ...generousLimits, maxDepth: 2 }).compile({ form: form([nested]), context: publicContext }),
      RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DEPTH
    );

    const twoFields = form([field('one', 'SimpleInputComponent'), field('two', 'SimpleInputComponent')]);
    expectCompiled(
      await compiler({ ...generousLimits, maxProperties: 2 }).compile({
        form: twoFields,
        context: publicContext,
      })
    );
    expectFailure(
      await compiler({ ...generousLimits, maxProperties: 1 }).compile({ form: twoFields, context: publicContext }),
      RECORD_SCHEMA_PROBLEM_CODES.LIMIT_PROPERTIES
    );

    const customFields = form([field('one', 'CustomOneComponent'), field('two', 'CustomTwoComponent')]);
    expectCompiled(
      await compiler({ ...generousLimits, maxDiagnostics: 2 }).compile({
        form: customFields,
        context: publicContext,
      })
    );
    expectFailure(
      await compiler({ ...generousLimits, maxDiagnostics: 1 }).compile({
        form: customFields,
        context: publicContext,
      }),
      RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DIAGNOSTICS
    );

    const slow = hookContributor('SlowComponent', async context => {
      await new Promise(resolve => setTimeout(resolve, 30));
      await context.compileChildren([field('late', 'SimpleInputComponent')], context.pointer);
      return { kind: 'node', node: { kind: 'scalar', nullable: false, scalarType: 'string' } };
    });
    expectCompiled(
      await compiler({ ...generousLimits, contributorTimeoutMs: 60 }, [slow]).compile({
        form: form([field('slow', 'SlowComponent')]),
        context: publicContext,
      })
    );
    const timedOut = await compiler({ ...generousLimits, contributorTimeoutMs: 5 }, [slow]).compile({
      form: form([field('slow', 'SlowComponent')]),
      context: publicContext,
    });
    expectFailure(timedOut, RECORD_SCHEMA_PROBLEM_CODES.LIMIT_CONTRIBUTOR_TIMEOUT);
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(timedOut.kind).to.equal('failed');
  });

  it('charges synchronous contributor execution against the elapsed timeout budget', async function () {
    const blocking = hookContributor('BlockingComponent', () => {
      const stopAt = performance.now() + 15;
      let iterations = 0;
      while (performance.now() < stopAt) {
        iterations += 1;
      }
      return {
        kind: 'node',
        node: { kind: 'scalar', nullable: false, scalarType: iterations > 0 ? 'string' : 'boolean' },
      };
    });

    const result = await compiler({ ...generousLimits, contributorTimeoutMs: 2 }, [blocking]).compile({
      form: form([field('blocking', 'BlockingComponent')]),
      context: publicContext,
    });

    expectFailure(result, RECORD_SCHEMA_PROBLEM_CODES.LIMIT_CONTRIBUTOR_TIMEOUT);
  });

  it('bounds nested contributor nodes by full IR depth and property counts', async function () {
    const deeplyNested = hookContributor('DeepOutputComponent', () => ({
      kind: 'node',
      node: {
        kind: 'object',
        nullable: false,
        unknownProperties: 'allow',
        properties: {
          nested: {
            kind: 'object',
            nullable: false,
            unknownProperties: 'allow',
            properties: {
              leaf: { kind: 'scalar', nullable: false, scalarType: 'string' },
            },
          },
        },
      },
    }));
    expectCompiled(
      await compiler({ ...generousLimits, maxDepth: 3 }, [deeplyNested]).compile({
        form: form([field('deep', 'DeepOutputComponent')]),
        context: publicContext,
      })
    );
    expectFailure(
      await compiler({ ...generousLimits, maxDepth: 2 }, [deeplyNested]).compile({
        form: form([field('deep', 'DeepOutputComponent')]),
        context: publicContext,
      }),
      RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DEPTH
    );

    const wide = hookContributor('WideOutputComponent', () => ({
      kind: 'node',
      node: {
        kind: 'object',
        nullable: false,
        unknownProperties: 'allow',
        properties: {
          first: { kind: 'scalar', nullable: false, scalarType: 'string' },
          second: { kind: 'scalar', nullable: false, scalarType: 'string' },
        },
      },
    }));
    expectCompiled(
      await compiler({ ...generousLimits, maxProperties: 3 }, [wide]).compile({
        form: form([field('wide', 'WideOutputComponent')]),
        context: publicContext,
      })
    );
    expectFailure(
      await compiler({ ...generousLimits, maxProperties: 2 }, [wide]).compile({
        form: form([field('wide', 'WideOutputComponent')]),
        context: publicContext,
      }),
      RECORD_SCHEMA_PROBLEM_CODES.LIMIT_PROPERTIES
    );
  });
});
