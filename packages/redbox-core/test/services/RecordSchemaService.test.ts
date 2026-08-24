import { expect } from 'chai';
import * as sinon from 'sinon';
import {
  FormConfig,
  SimpleInputFieldComponentConfig,
  SimpleInputFieldComponentDefinition,
  SimpleInputFieldModelConfig,
  SimpleInputFieldModelDefinition,
  SimpleInputFormComponentDefinition,
  type FormComponentDefinitionFrame,
  type QuestionTreeFormComponentDefinitionFrame,
  type SimpleInputFormComponentDefinitionFrame,
} from '@researchdatabox/sails-ng-common';

import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  createCoreRecordContractContributors,
  RecordContractContextResolutionError,
  type RecordContractContributorRegistration,
  type RecordContractCreateContext,
  type RecordContractEffectiveForm,
  RecordContractContributorRegistry,
  RECORD_CONTRACT_REGISTRATION_CODES,
  RECORD_SCHEMA_PROBLEM_CODES,
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  recordSchema,
  resetDiscoveredRecordContractContributorRegistry,
  setDiscoveredRecordContractContributorRegistry,
  StorageServiceResponse,
} from '../../src';
import {
  RECORD_SCHEMA_LIFECYCLE_ERROR_CODE,
  RecordSchemaLifecycleError,
  type RecordSchemaServiceDependencies,
  Services,
} from '../../src/services/RecordSchemaService';
import { RecordSchemaService, ServiceExports } from '../../src/services';

const DIGEST = 'a'.repeat(64);
type RecordSchemaLifecycleOverrides = NonNullable<ConstructorParameters<typeof Services.RecordSchema>[0]>;

function enabledConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...structuredClone(recordSchema),
    enabled: true,
    ...overrides,
  };
}

function completeStorageProvider(): Record<string, sinon.SinonStub> {
  return Object.fromEntries(RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS.map(method => [method, sinon.stub()]));
}

function coreRegistry(excluded: readonly string[] = []): RecordContractContributorRegistry {
  const registrations: RecordContractContributorRegistration[] = createCoreRecordContractContributors()
    .filter(contributor => !excluded.includes(contributor.componentType))
    .map(contributor => ({ contributor, source: 'core' }));
  return new RecordContractContributorRegistry(registrations);
}

function registeredComponentTypes(registry: RecordContractContributorRegistry): readonly string[] {
  return registry
    .registrations()
    .flatMap(registration =>
      registration.contributor.kind === 'component' ? [registration.contributor.componentType] : []
    );
}

function lifecycleService(overrides: RecordSchemaLifecycleOverrides = {}): Services.RecordSchema {
  const registry = coreRegistry();
  return new Services.RecordSchema({
    getConfig: () => enabledConfig(),
    getStorageProvider: () => completeStorageProvider(),
    getContributorRegistry: () => registry,
    getContributorRegistrationIssues: () => [],
    getContributorComponentTypes: () => registeredComponentTypes(registry),
    ...overrides,
  });
}

function captureLifecycleError(run: () => void): RecordSchemaLifecycleError {
  try {
    run();
  } catch (error) {
    if (error instanceof RecordSchemaLifecycleError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected RecordSchemaService initialization to fail.');
}

function validPin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    digest: DIGEST,
    brand: 'default',
    portal: 'rdmp',
    schemaKind: 'create',
    recordType: 'rdmp',
    operation: '__strict_all__',
    owner: 'integration-owner',
    purpose: 'Retain the contract used by the integration.',
    expiresAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function storageResponse(success: boolean): StorageServiceResponse {
  const response = new StorageServiceResponse();
  response.success = success;
  return response;
}

function createContext(
  overrides: Partial<RecordContractCreateContext['publicContext']> = {}
): RecordContractCreateContext {
  const publicContext = {
    brand: 'brand-1',
    portal: 'portal-1',
    kind: 'create' as const,
    recordType: 'dataset',
    workflowStep: 'draft',
    form: 'dataset-draft',
    operation: 'strict-all',
    unknownProperties: 'allow' as const,
    enforcement: 'shadow' as const,
    ...overrides,
  };
  return {
    publicContext,
    resolution: {
      sourceFormFingerprint: 'a'.repeat(64),
      sourceForm: {
        name: publicContext.form,
        componentDefinitions: [],
      },
      reusableFormDefinitions: {},
      actor: { authenticated: true, roles: ['Researcher'] },
      formMode: 'edit',
      contextVariables: {},
    },
  };
}

function simpleForm(fieldNames: readonly string[] = ['title']): RecordContractEffectiveForm {
  const componentDefinitions: SimpleInputFormComponentDefinitionFrame[] = fieldNames.map(name => ({
    name,
    component: { class: 'SimpleInputComponent', config: { type: 'text' } },
    model: { class: 'SimpleInputModel', config: {} },
  }));
  return {
    name: 'dataset-draft',
    componentDefinitions,
  };
}

function runtimeSimpleForm(): RecordContractEffectiveForm {
  const form = new FormConfig();
  form.name = 'dataset-draft';
  const field = new SimpleInputFormComponentDefinition();
  field.name = 'title';
  field.component = new SimpleInputFieldComponentDefinition();
  field.component.config = new SimpleInputFieldComponentConfig();
  field.model = new SimpleInputFieldModelDefinition();
  field.model.config = new SimpleInputFieldModelConfig();
  form.componentDefinitions = [field];
  return form;
}

function conditionalForm(): RecordContractEffectiveForm {
  const conditional: QuestionTreeFormComponentDefinitionFrame = {
    name: 'access',
    component: {
      class: 'QuestionTreeComponent',
      config: {
        availableOutcomes: [],
        questions: [
          {
            id: 'sensitive',
            answersMin: 1,
            answersMax: 1,
            answers: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
            rules: { op: 'true' },
          },
          {
            id: 'consent',
            answersMin: 1,
            answersMax: 1,
            answers: [
              { value: 'yes', label: 'Yes' },
              { value: 'no', label: 'No' },
            ],
            rules: { op: 'in', q: 'sensitive', a: ['yes'] },
          },
        ],
        componentDefinitions: [],
      },
    },
    model: { class: 'QuestionTreeModel', config: {} },
  };
  return {
    name: 'dataset-draft',
    componentDefinitions: [conditional],
  };
}

function customComponentForm(): RecordContractEffectiveForm {
  const title: SimpleInputFormComponentDefinitionFrame = {
    name: 'title',
    component: { class: 'SimpleInputComponent', config: { type: 'text' } },
    model: { class: 'SimpleInputModel', config: {} },
  };
  const custom: FormComponentDefinitionFrame = {
    name: 'custom_value',
    module: '@example/redbox-hook-custom',
    component: { class: 'ExampleHookComponent' },
    model: { class: 'ExampleHookModel', config: {} },
  };
  return {
    name: 'dataset-draft',
    componentDefinitions: [title, custom],
  };
}

function createResolutionFixture(overrides: Partial<RecordSchemaServiceDependencies> = {}) {
  const context = createContext();
  const putRecordSchemaArtifact = sinon.stub().resolves(storageResponse(true));
  const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
  const storageProvider = { putRecordSchemaArtifact, putRecordSchemaReference };
  const resolveContractContext = sinon.stub().resolves(context);
  const buildContractFormConfig = sinon.stub().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
  const service = new Services.RecordSchema({
    getConfig: () => enabledConfig(),
    getStorageProvider: () => storageProvider,
    getContributorRegistry: () => coreRegistry(),
    resolveContractContext,
    buildContractFormConfig,
    ...overrides,
  });
  return {
    service,
    context,
    resolveContractContext,
    buildContractFormConfig,
    putRecordSchemaArtifact,
    putRecordSchemaReference,
  };
}

describe('RecordSchemaService lifecycle checks', function () {
  afterEach(function () {
    sinon.restore();
    resetDiscoveredRecordContractContributorRegistry();
  });

  it('initializes disabled configuration as a no-op for legacy storage', function () {
    const getStorageProvider = sinon.stub().throws(new Error('legacy storage must not be inspected'));
    const getContributorRegistry = sinon.stub().throws(new Error('contributors must not be inspected'));
    const getContributorRegistrationIssues = sinon.stub().throws(new Error('contributors must not be inspected'));
    const getContributorComponentTypes = sinon.stub().throws(new Error('contributors must not be inspected'));
    const service = lifecycleService({
      getConfig: () => ({ enabled: false }),
      getStorageProvider,
      getContributorRegistry,
      getContributorRegistrationIssues,
      getContributorComponentTypes,
    });

    expect(() => service.init()).not.to.throw();
    expect(getStorageProvider.notCalled).to.equal(true);
    expect(getContributorRegistry.notCalled).to.equal(true);
    expect(getContributorRegistrationIssues.notCalled).to.equal(true);
    expect(getContributorComponentTypes.notCalled).to.equal(true);
  });

  it('accepts enabled configuration with complete storage, contributors, coverage, and pins', function () {
    const getStorageProvider = sinon.stub().returns(completeStorageProvider());
    const service = lifecycleService({
      getConfig: () => enabledConfig({ integrationPins: [validPin()] }),
      getStorageProvider,
    });

    expect(() => service.init()).not.to.throw();
    expect(getStorageProvider.calledOnce).to.equal(true);
    expect(Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY)).to.have.length(
      createCoreRecordContractContributors().length
    );
  });

  it('uses the configured Sails storage service and discovered contributor state', function () {
    const serviceName = 'recordSchemaLifecycleTestStorage';
    const originalRecordSchema = Reflect.get(sails.config, 'recordSchema');
    const originalStorage = Reflect.get(sails.config, 'storage');
    const originalStorageService = Reflect.get(sails.services, serviceName);
    const hadRecordSchema = Reflect.has(sails.config, 'recordSchema');
    const hadStorage = Reflect.has(sails.config, 'storage');
    const hadStorageService = Reflect.has(sails.services, serviceName);

    Reflect.set(sails.config, 'recordSchema', enabledConfig({ integrationPins: [validPin()] }));
    Reflect.set(sails.config, 'storage', { serviceName });
    Reflect.set(sails.services, serviceName, completeStorageProvider());
    setDiscoveredRecordContractContributorRegistry(coreRegistry());

    try {
      expect(() => new Services.RecordSchema().init()).not.to.throw();
    } finally {
      hadRecordSchema
        ? Reflect.set(sails.config, 'recordSchema', originalRecordSchema)
        : Reflect.deleteProperty(sails.config, 'recordSchema');
      hadStorage
        ? Reflect.set(sails.config, 'storage', originalStorage)
        : Reflect.deleteProperty(sails.config, 'storage');
      hadStorageService
        ? Reflect.set(sails.services, serviceName, originalStorageService)
        : Reflect.deleteProperty(sails.services, serviceName);
    }
  });

  it('reports every invalid configuration setting without coercion', function () {
    const service = lifecycleService({
      getConfig: () =>
        enabledConfig({
          cacheMaxEntries: 0,
          limits: {
            ...recordSchema.limits,
            maxDepth: 1.5,
          },
        }),
    });

    const error = captureLifecycleError(() => service.init());

    expect(error.code).to.equal(RECORD_SCHEMA_LIFECYCLE_ERROR_CODE);
    expect(error.findings).to.deep.equal([
      {
        category: 'configuration',
        code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        path: 'recordSchema.cacheMaxEntries',
        reason: 'positive-integer',
      },
      {
        category: 'configuration',
        code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
        path: 'recordSchema.limits.maxDepth',
        reason: 'positive-integer',
      },
    ]);
  });

  it('reports every missing storage method in stable capability order', function () {
    const provider = completeStorageProvider();
    delete provider.putRecordSchemaArtifact;
    delete provider.touchRecordSchemaArtifact;
    delete provider.deleteRecordSchemaArtifactIfUnreferenced;
    const service = lifecycleService({ getStorageProvider: () => provider });

    const error = captureLifecycleError(() => service.init());

    expect(error.findings).to.deep.equal(
      ['putRecordSchemaArtifact', 'touchRecordSchemaArtifact', 'deleteRecordSchemaArtifactIfUnreferenced'].map(
        method => ({
          category: 'storage',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
          method,
        })
      )
    );
  });

  it('reports the complete capability when no enabled storage provider is available', function () {
    const service = lifecycleService({ getStorageProvider: () => undefined });

    const error = captureLifecycleError(() => service.init());

    expect(error.findings.map(finding => (finding.category === 'storage' ? finding.method : undefined))).to.deep.equal(
      RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS
    );
  });

  it('reports invalid and duplicate contributor registrations with safe stable diagnostics', function () {
    const service = lifecycleService({
      getContributorRegistry: () => undefined,
      getContributorRegistrationIssues: () => [
        {
          code: RECORD_CONTRACT_REGISTRATION_CODES.INVALID_KEY,
          key: 'private registration secret',
          detail: 'private hook exception secret',
        },
        {
          code: RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
          key: 'DuplicateHookComponent',
          detail: 'Component type is already registered.',
        },
      ],
    });

    const error = captureLifecycleError(() => service.init());

    expect(error.findings.map(finding => finding.code)).to.deep.equal([
      RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_DUPLICATE,
      RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID,
    ]);
    expect(error.message).to.include('[DuplicateHookComponent]');
    expect(error.message).to.include('[<invalid-identifier>]');
    expect(error.findings.flatMap(finding => (finding.category === 'contributor' ? [finding.key] : []))).to.deep.equal([
      'DuplicateHookComponent',
      '<invalid-identifier>',
    ]);
    expect(error.message).not.to.include('private registration secret');
    expect(error.message).not.to.include('private hook exception secret');
    expect(JSON.stringify(error.findings)).not.to.include('private registration secret');
  });

  it('reports every uncovered core component in component-type order', function () {
    const registry = coreRegistry(['TextAreaComponent', 'SimpleInputComponent']);
    const service = lifecycleService({
      getContributorRegistry: () => registry,
      getContributorComponentTypes: () => registeredComponentTypes(registry),
    });

    const error = captureLifecycleError(() => service.init());

    expect(error.findings).to.deep.equal([
      {
        category: 'coverage',
        code: RECORD_SCHEMA_PROBLEM_CODES.UNSUPPORTED_COMPONENT,
        componentType: 'SimpleInputComponent',
      },
      {
        category: 'coverage',
        code: RECORD_SCHEMA_PROBLEM_CODES.UNSUPPORTED_COMPONENT,
        componentType: 'TextAreaComponent',
      },
    ]);
  });

  it('reports configured pin field failures by path without exposing configured values', function () {
    const service = lifecycleService({
      getConfig: () =>
        enabledConfig({
          integrationPins: [
            validPin({
              digest: 'PRIVATE-DIGEST',
              brand: '',
              owner: ' private-owner',
              purpose: 'private retention purpose',
              expiresAt: 'private-expiry-value',
            }),
          ],
        }),
    });

    const error = captureLifecycleError(() => service.init());

    expect(error.findings.map(finding => finding.category)).to.deep.equal(['pin', 'pin', 'pin', 'pin']);
    expect(
      error.findings.map(finding => (finding.category === 'pin' ? `${finding.path}:${finding.reason}` : ''))
    ).to.deep.equal([
      'recordSchema.integrationPins.0.brand:normalized-non-empty',
      'recordSchema.integrationPins.0.digest:digest',
      'recordSchema.integrationPins.0.expiresAt:datetime',
      'recordSchema.integrationPins.0.owner:normalized-non-empty',
    ]);
    expect(error.message).not.to.include('PRIVATE-DIGEST');
    expect(error.message).not.to.include('private-owner');
    expect(error.message).not.to.include('private retention purpose');
    expect(error.message).not.to.include('private-expiry-value');
  });

  it('aggregates all fatal categories in deterministic lifecycle order', function () {
    const provider = completeStorageProvider();
    delete provider.getRecordSchemaArtifact;
    delete provider.listRecordSchemaReferences;
    const service = lifecycleService({
      getConfig: () =>
        enabledConfig({
          cacheMaxEntries: 0,
          integrationPins: [validPin({ expiresAt: 'invalid-expiry' })],
        }),
      getStorageProvider: () => provider,
      getContributorRegistry: () => undefined,
      getContributorComponentTypes: () => registeredComponentTypes(coreRegistry(['SimpleInputComponent'])),
      getContributorRegistrationIssues: () => [
        {
          code: RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
          key: 'DuplicateHookComponent',
          detail: 'Component type is already registered.',
        },
      ],
    });

    const first = captureLifecycleError(() => service.init());
    const second = captureLifecycleError(() => service.init());

    expect(first.findings.map(finding => finding.category)).to.deep.equal([
      'configuration',
      'storage',
      'storage',
      'contributor',
      'coverage',
      'pin',
    ]);
    expect(first.message).to.equal(second.message);
    expect(Object.isFrozen(first.findings)).to.equal(true);
    expect(first.message.split('\n')).to.have.length(first.findings.length + 1);
  });

  it('normalizes unreadable dependency state into one deterministic typed lifecycle error', function () {
    const unreadableConfig: Record<string, unknown> = {};
    Object.defineProperty(unreadableConfig, 'enabled', {
      get: () => {
        throw new Error('private config secret');
      },
    });
    const service = lifecycleService({
      getConfig: () => unreadableConfig,
      getStorageProvider: () => {
        throw new Error('private storage secret');
      },
      getContributorRegistry: () => {
        throw new Error('private registry secret');
      },
      getContributorRegistrationIssues: () => {
        throw new Error('private registration secret');
      },
      getContributorComponentTypes: () => {
        throw new Error('private coverage secret');
      },
    });

    const first = captureLifecycleError(() => service.init());
    const second = captureLifecycleError(() => service.init());

    expect(first.findings.filter(finding => finding.category === 'configuration')).to.have.length(1);
    expect(first.findings.filter(finding => finding.category === 'storage')).to.have.length(
      RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS.length
    );
    expect(first.findings.filter(finding => finding.category === 'contributor')).to.have.length(1);
    expect(first.findings.filter(finding => finding.category === 'coverage')).to.have.length(
      Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY).length
    );
    expect(first.message).to.equal(second.message);
    expect(first.message).not.to.include('private');
  });

  it('is exported through the existing service index', function () {
    expect(RecordSchemaService.Services.RecordSchema).to.equal(Services.RecordSchema);
    expect(ServiceExports.RecordSchemaService).to.have.property('init').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('resolveCreate').that.is.a('function');
  });
});

describe('RecordSchemaService create resolution', function () {
  afterEach(function () {
    sinon.restore();
  });

  const request = {
    brand: 'brand-1',
    portal: 'portal-1',
    recordType: 'dataset',
    actor: { authenticated: true, roles: ['Researcher'] },
  } as const;

  it('resolves, compiles, meta-validates, and idempotently persists a complete create schema and grant', async function () {
    const fixture = createResolutionFixture();

    const first = await fixture.service.resolveCreate({ ...request, targetStep: 'draft' });
    const second = await fixture.service.resolveCreate({ ...request, targetStep: 'draft' });

    expect(first.kind).to.equal('resolved');
    expect(second.kind).to.equal('resolved');
    if (first.kind !== 'resolved' || second.kind !== 'resolved') {
      throw new Error('Expected complete create schema resolutions.');
    }
    expect(first.document.$schema).to.equal('https://json-schema.org/draft/2020-12/schema');
    expect(first.document.properties).to.have.property('title');
    expect(first.digest).to.match(/^[a-f0-9]{64}$/);
    expect(first.digest).to.equal(second.digest);
    expect(first.metadata).to.deep.include({
      schemaKind: 'create',
      contractFormat: 'redbox-record-contract/1',
      completeness: 'complete',
      context: fixture.context.publicContext,
    });
    expect(first.metadata.etag).to.equal(`"sha256:${first.digest}"`);
    expect(first.metadata.byteLength).to.be.greaterThan(0);
    expect(first.grant).to.deep.include({
      digest: first.digest,
      kind: 'grant',
      schemaKind: 'create',
      brand: 'brand-1',
      portal: 'portal-1',
      recordType: 'dataset',
      operation: 'strict-all',
    });
    expect(first.grant.referenceKey).to.equal(second.grant.referenceKey);
    expect(fixture.resolveContractContext.firstCall.firstArg).to.deep.include({
      kind: 'create',
      brand: 'brand-1',
      portal: 'portal-1',
      recordType: 'dataset',
      targetStep: 'draft',
      actor: request.actor,
    });
    expect(fixture.putRecordSchemaArtifact.callCount).to.equal(2);
    expect(fixture.putRecordSchemaArtifact.firstCall.firstArg).to.deep.include({
      digest: first.digest,
      document: first.document,
      completeness: 'complete',
    });
    expect(fixture.putRecordSchemaReference.callCount).to.equal(2);
    expect(fixture.putRecordSchemaReference.firstCall.firstArg).to.deep.equal(first.grant);
  });

  it('keeps a representable conditional create form stable across resolutions', async function () {
    const fixture = createResolutionFixture({
      buildContractFormConfig: async () => ({ ok: true, effectiveForm: conditionalForm() }),
    });

    const first = await fixture.service.resolveCreate(request);
    const second = await fixture.service.resolveCreate(request);

    expect(first.kind).to.equal('resolved');
    expect(second.kind).to.equal('resolved');
    if (first.kind !== 'resolved' || second.kind !== 'resolved') {
      throw new Error('Expected stable conditional create schemas.');
    }
    expect(first.digest).to.equal(second.digest);
    expect(first.document).to.deep.equal(second.document);
    expect(first.document.properties?.access).to.have.property('allOf');
  });

  it('returns typed partial success for an unsupported custom field while persisting its diagnostic schema', async function () {
    const fixture = createResolutionFixture({
      buildContractFormConfig: async () => ({ ok: true, effectiveForm: customComponentForm() }),
    });

    const result = await fixture.service.resolveCreate(request);

    expect(result.kind).to.equal('partial');
    if (result.kind !== 'partial') {
      throw new Error('Expected a partial create schema resolution.');
    }
    expect(result.metadata.completeness).to.equal('partial');
    expect(result.document['x-redbox-completeness']).to.equal('partial');
    expect(result.document.properties?.title).to.deep.include({ type: 'string' });
    expect(result.document.properties?.custom_value).to.deep.include({
      'x-redbox-unsupported-component': 'ExampleHookComponent',
    });
    expect(result.document['x-redbox-diagnostics']).to.deep.include({
      code: 'x-redbox-unsupported-component',
      severity: 'warning',
      message: 'A custom component has no registered record-contract contributor and remains permissive.',
      pointer: '/custom_value',
      componentType: 'ExampleHookComponent',
    });
    expect(fixture.putRecordSchemaArtifact.firstCall.firstArg.completeness).to.equal('partial');
    expect(fixture.putRecordSchemaReference.calledOnce).to.equal(true);
  });

  it('returns a typed missing-record-type context failure without compiling or persisting', async function () {
    const fixture = createResolutionFixture({
      resolveContractContext: async () => {
        throw new RecordContractContextResolutionError('not-found', ['record-validation-record-type-not-found']);
      },
    });

    const result = await fixture.service.resolveCreate(request);

    expect(result).to.deep.equal({
      kind: 'context-failed',
      failureKind: 'not-found',
      diagnosticCodes: ['record-validation-record-type-not-found'],
    });
    expect(fixture.buildContractFormConfig.notCalled).to.equal(true);
    expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('returns a typed forbidden context failure for an unauthorized operation', async function () {
    const fixture = createResolutionFixture({
      resolveContractContext: async () => {
        throw new RecordContractContextResolutionError('forbidden', ['record-validation-operation-role-unauthorized']);
      },
    });

    const result = await fixture.service.resolveCreate({ ...request, operation: 'submit' });

    expect(result).to.deep.equal({
      kind: 'context-failed',
      failureKind: 'forbidden',
      diagnosticCodes: ['record-validation-operation-role-unauthorized'],
    });
    expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('does not compile or persist when caller-effective form construction is empty', async function () {
    const fixture = createResolutionFixture({
      buildContractFormConfig: async () => ({ ok: false, reason: 'empty-effective-form' }),
    });

    const result = await fixture.service.resolveCreate(request);

    expect(result).to.deep.equal({
      kind: 'context-failed',
      failureKind: 'not-resolvable',
      diagnosticCodes: [],
      reason: 'empty-effective-form',
    });
    expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
    expect(fixture.putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('returns the exact typed compiler limit failure and does not truncate or persist', async function () {
    const fixture = createResolutionFixture({
      getConfig: () =>
        enabledConfig({
          limits: { ...recordSchema.limits, maxProperties: 1 },
        }),
      buildContractFormConfig: async () => ({ ok: true, effectiveForm: simpleForm(['title', 'description']) }),
    });

    const result = await fixture.service.resolveCreate(request);

    expect(result.kind).to.equal('limit-exceeded');
    if (result.kind !== 'limit-exceeded') {
      throw new Error('Expected a create schema limit failure.');
    }
    expect(result).to.deep.include({
      stage: 'compiler',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_PROPERTIES,
    });
    expect(result.diagnostics).to.have.length(1);
    expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('distinguishes artifact and grant persistence failures', async function () {
    const artifactFailure = createResolutionFixture();
    artifactFailure.putRecordSchemaArtifact.resolves(storageResponse(false));

    const artifactResult = await artifactFailure.service.resolveCreate(request);

    expect(artifactResult).to.deep.equal({
      kind: 'storage-failed',
      stage: 'artifact',
      code: RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED,
    });
    expect(artifactFailure.putRecordSchemaReference.notCalled).to.equal(true);

    const grantFailure = createResolutionFixture();
    grantFailure.putRecordSchemaReference.resolves(storageResponse(false));

    const grantResult = await grantFailure.service.resolveCreate(request);

    expect(grantResult).to.deep.equal({
      kind: 'storage-failed',
      stage: 'grant',
      code: RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED,
    });
    expect(grantFailure.putRecordSchemaArtifact.calledOnce).to.equal(true);
    expect(grantFailure.putRecordSchemaReference.calledOnce).to.equal(true);
  });

  it('returns a typed unavailable result when storage capability inspection throws', async function () {
    const fixture = createResolutionFixture({
      getStorageProvider: () =>
        new Proxy(
          {},
          {
            get: () => {
              throw new Error('unsafe storage getter');
            },
          }
        ),
    });

    const result = await fixture.service.resolveCreate(request);

    expect(result).to.deep.equal({
      kind: 'storage-failed',
      stage: 'artifact',
      code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
    });
  });

  it('returns a typed write failure when a storage response cannot be inspected', async function () {
    const fixture = createResolutionFixture();
    fixture.putRecordSchemaArtifact.resolves(
      new Proxy(new StorageServiceResponse(), {
        get: () => {
          throw new Error('unsafe storage response getter');
        },
      })
    );

    const result = await fixture.service.resolveCreate(request);

    expect(result).to.deep.equal({
      kind: 'storage-failed',
      stage: 'artifact',
      code: RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED,
    });
  });
});
