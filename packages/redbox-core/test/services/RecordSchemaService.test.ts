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
  BrandingModel,
  type ContractJsonObject,
  type ContractJsonValue,
  createCoreRecordContractContributors,
  normalizeRedboxCanonicalJsonV1,
  RecordContractContextResolutionError,
  type RecordContractContext,
  type RecordContractContributorRegistration,
  type RecordContractCreateContext,
  type RecordContractEffectiveForm,
  RecordContractContributorRegistry,
  RoleModel,
  RECORD_CONTRACT_REGISTRATION_CODES,
  RECORD_SCHEMA_PROBLEM_CODES,
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  recordSchema,
  type RecordJsonSchemaEtag,
  type RecordSchemaArtifactModel,
  type RecordSchemaGrantReferenceInput,
  resetDiscoveredRecordContractContributorRegistry,
  setDiscoveredRecordContractContributorRegistry,
  StorageServiceResponse,
  UserModel,
} from '../../src';
import {
  RECORD_SCHEMA_LIFECYCLE_ERROR_CODE,
  RecordSchemaLifecycleError,
  type ResolveImmutableRecordSchemaRequest,
  type RecordSchemaServiceDependencies,
  Services,
} from '../../src/services/RecordSchemaService';
import { RecordSchemaService, ServiceExports } from '../../src/services';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import type { RecordContractUpdateContext } from '../../src/record-contract';

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

function updateContext(
  oid = 'oid-1',
  publicOverrides: Partial<RecordContractUpdateContext['publicContext']> = {},
  existingRecordOverrides: Readonly<Record<string, unknown>> = {}
): RecordContractUpdateContext {
  const publicContext = {
    brand: 'brand-1',
    portal: 'portal-1',
    kind: 'update' as const,
    recordType: 'dataset',
    workflowStep: 'draft',
    form: 'dataset-draft',
    operation: 'strict-all',
    unknownProperties: 'allow' as const,
    enforcement: 'shadow' as const,
    ...publicOverrides,
  };
  return {
    publicContext,
    resolution: {
      sourceFormFingerprint: 'b'.repeat(64),
      sourceForm: {
        name: publicContext.form,
        componentDefinitions: [],
      },
      reusableFormDefinitions: {},
      actor: { authenticated: true, roles: ['Researcher'] },
      formMode: 'edit',
      contextVariables: {},
      oid,
      existingRecord: {
        redboxOid: oid,
        metadata: { title: 'Existing title' },
        metaMetadata: {
          brandId: publicContext.brand,
          type: publicContext.recordType,
          form: publicContext.form,
        },
        workflow: { stage: publicContext.workflowStep },
        authorization: { edit: ['alice'], editRoles: ['Researcher'] },
        ...existingRecordOverrides,
      },
    },
  };
}

function updateCaller(username = 'alice', roleName = 'Researcher', brandId = 'brand-1'): FormRecordAccessContext {
  const role = new RoleModel();
  role.id = `role-${roleName.toLowerCase()}`;
  role.name = roleName;
  const brand = new BrandingModel();
  brand.id = brandId;
  brand.name = brandId;
  brand.roles = [role];
  const user = new UserModel();
  user.id = `user-${username}`;
  user.username = username;
  user.name = username;
  user.email = `${username}@example.test`;
  user.roles = [role];
  return { brand, user };
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

function updateResolutionFixture(
  context: RecordContractUpdateContext = updateContext(),
  overrides: Partial<RecordSchemaServiceDependencies> = {}
) {
  const putRecordSchemaArtifact = sinon.stub().resolves(storageResponse(true));
  const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
  const storageProvider = { putRecordSchemaArtifact, putRecordSchemaReference };
  const resolveContractContext = sinon.stub().resolves(context);
  const buildContractFormConfig = sinon.stub().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
  const authorizeUpdate = sinon.stub().resolves(true);
  const service = new Services.RecordSchema({
    getConfig: () => enabledConfig(),
    getStorageProvider: () => storageProvider,
    getContributorRegistry: () => coreRegistry(),
    resolveContractContext,
    buildContractFormConfig,
    authorizeUpdate,
    ...overrides,
  });
  return {
    service,
    context,
    resolveContractContext,
    buildContractFormConfig,
    authorizeUpdate,
    putRecordSchemaArtifact,
    putRecordSchemaReference,
  };
}

interface ImmutableSeed {
  readonly artifact: RecordSchemaArtifactModel;
  readonly context: RecordContractContext;
  readonly grant: RecordSchemaGrantReferenceInput;
}

function isContractDocument(value: ContractJsonValue): value is ContractJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function immutableSeedDocument(document: unknown): ContractJsonObject {
  const normalized = normalizeRedboxCanonicalJsonV1(document);
  if (!isContractDocument(normalized)) {
    throw new Error('Expected an immutable seed document object.');
  }
  return normalized;
}

async function createImmutableSeed(): Promise<ImmutableSeed> {
  const fixture = createResolutionFixture();
  const result = await fixture.service.resolveCreate({
    brand: 'brand-1',
    portal: 'portal-1',
    recordType: 'dataset',
    actor: { authenticated: true, roles: ['Researcher'] },
  });
  if (result.kind !== 'resolved' && result.kind !== 'partial') {
    throw new Error('Expected an immutable create seed artifact.');
  }
  const storedAt = new Date('2026-08-24T00:00:00.000Z');
  return {
    context: fixture.context,
    grant: result.grant,
    artifact: {
      digest: result.digest,
      document: immutableSeedDocument(result.document),
      contractFormat: result.metadata.contractFormat,
      completeness: result.metadata.completeness,
      byteLength: result.metadata.byteLength,
      createdAt: storedAt,
      updatedAt: storedAt,
    },
  };
}

async function createImmutableUpdateSeed(): Promise<ImmutableSeed> {
  const fixture = updateResolutionFixture();
  const result = await fixture.service.resolveUpdate({
    brand: 'brand-1',
    portal: 'portal-1',
    oid: 'oid-1',
    caller: updateCaller(),
  });
  if (result.kind !== 'resolved' && result.kind !== 'partial') {
    throw new Error('Expected an immutable update seed artifact.');
  }
  const storedAt = new Date('2026-08-24T00:00:00.000Z');
  return {
    context: fixture.context,
    grant: result.grant,
    artifact: {
      digest: result.digest,
      document: immutableSeedDocument(result.document),
      contractFormat: result.metadata.contractFormat,
      completeness: result.metadata.completeness,
      byteLength: result.metadata.byteLength,
      createdAt: storedAt,
      updatedAt: storedAt,
    },
  };
}

function immutableResolutionFixture(seed: ImmutableSeed, overrides: Partial<RecordSchemaServiceDependencies> = {}) {
  const getRecordSchemaArtifact = sinon.stub().resolves(seed.artifact);
  const listRecordSchemaReferences = sinon.stub().resolves([seed.grant]);
  const touchRecordSchemaArtifact = sinon.stub().resolves(storageResponse(true));
  const storageProvider = {
    getRecordSchemaArtifact,
    listRecordSchemaReferences,
    touchRecordSchemaArtifact,
  };
  const resolveContractContext = sinon.stub().resolves(seed.context);
  const buildContractFormConfig = sinon.stub().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
  const authorizeUpdate = sinon.stub().resolves(true);
  const service = new Services.RecordSchema({
    getConfig: () => enabledConfig(),
    getStorageProvider: () => storageProvider,
    getContributorRegistry: () => coreRegistry(),
    resolveContractContext,
    buildContractFormConfig,
    authorizeUpdate,
    ...overrides,
  });
  return {
    service,
    getRecordSchemaArtifact,
    listRecordSchemaReferences,
    touchRecordSchemaArtifact,
    resolveContractContext,
    buildContractFormConfig,
    authorizeUpdate,
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
    expect(ServiceExports.RecordSchemaService).to.have.property('resolveUpdate').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('resolveImmutable').that.is.a('function');
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

describe('RecordSchemaService update resolution', function () {
  afterEach(function () {
    sinon.restore();
  });

  const caller = updateCaller();
  const request = {
    brand: 'brand-1',
    portal: 'portal-1',
    oid: 'oid-1',
    caller,
  } as const;

  it('authorizes, resolves, and persists a caller-effective partial-delta schema and private update grant', async function () {
    const fixture = updateResolutionFixture();

    const result = await fixture.service.resolveUpdate(request);

    expect(result.kind).to.equal('resolved');
    if (result.kind !== 'resolved') {
      throw new Error('Expected a complete update schema resolution.');
    }
    expect(result.document.properties).to.have.property('title');
    expect(result.document).not.to.have.property('required');
    expect(result.document['x-redbox-context']).to.deep.include({
      kind: 'update',
      workflowStep: 'draft',
      form: 'dataset-draft',
      operation: 'strict-all',
    });
    expect(result.metadata).to.deep.include({
      schemaKind: 'update',
      contractFormat: 'redbox-record-contract/1',
      completeness: 'complete',
      context: fixture.context.publicContext,
    });
    expect(result.grant).to.deep.include({
      digest: result.digest,
      kind: 'grant',
      schemaKind: 'update',
      brand: 'brand-1',
      portal: 'portal-1',
      recordType: 'dataset',
      operation: 'strict-all',
      oid: 'oid-1',
    });
    expect(
      fixture.resolveContractContext.calledOnceWithExactly({
        kind: 'update',
        brand: 'brand-1',
        portal: 'portal-1',
        oid: 'oid-1',
        operation: undefined,
        actor: { authenticated: true, roles: ['Researcher'] },
      })
    ).to.equal(true);
    expect(fixture.authorizeUpdate.calledOnceWithExactly(fixture.context, caller)).to.equal(true);
    expect(fixture.authorizeUpdate.calledBefore(fixture.buildContractFormConfig)).to.equal(true);
    expect(fixture.buildContractFormConfig.calledOnceWithExactly(fixture.context, caller)).to.equal(true);
    expect(fixture.putRecordSchemaArtifact.calledOnce).to.equal(true);
    expect(fixture.putRecordSchemaReference.calledOnceWithExactly(result.grant)).to.equal(true);

    const serializedDocument = JSON.stringify(result.document);
    const serializedArtifact = JSON.stringify(fixture.putRecordSchemaArtifact.firstCall.firstArg.document);
    for (const privateValue of ['oid-1', 'alice', 'alice@example.test', 'role-researcher', 'Researcher']) {
      expect(serializedDocument).not.to.include(privateValue);
      expect(serializedArtifact).not.to.include(privateValue);
    }
  });

  it('accepts an exact If-Match against the current full-document digest before persisting', async function () {
    const fixture = updateResolutionFixture();
    const initial = await fixture.service.resolveUpdate(request);
    if (initial.kind !== 'resolved') {
      throw new Error('Expected an initial complete update schema resolution.');
    }
    fixture.putRecordSchemaArtifact.resetHistory();
    fixture.putRecordSchemaReference.resetHistory();

    const result = await fixture.service.resolveUpdate({
      ...request,
      ifMatch: `"sha256:${initial.digest}"`,
    });

    expect(result.kind).to.equal('resolved');
    expect(fixture.putRecordSchemaArtifact.calledOnce).to.equal(true);
    expect(fixture.putRecordSchemaReference.calledOnce).to.equal(true);
  });

  it('returns a typed stale If-Match failure before artifact or grant persistence', async function () {
    const fixture = updateResolutionFixture();

    const result = await fixture.service.resolveUpdate({
      ...request,
      ifMatch: `"sha256:${'b'.repeat(64)}"`,
    });

    expect(result).to.deep.equal({
      kind: 'precondition-failed',
      condition: 'if-match',
      reason: 'mismatch',
      code: RECORD_SCHEMA_PROBLEM_CODES.PRECONDITION_FAILED,
    });
    expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
    expect(fixture.putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('compares If-Match with the newly resolved document rather than a prior schema', async function () {
    const fixture = updateResolutionFixture();
    const initial = await fixture.service.resolveUpdate(request);
    if (initial.kind !== 'resolved') {
      throw new Error('Expected an initial complete update schema resolution.');
    }
    fixture.buildContractFormConfig.resolves({ ok: true, effectiveForm: simpleForm(['changed-title']) });
    fixture.putRecordSchemaArtifact.resetHistory();
    fixture.putRecordSchemaReference.resetHistory();

    const result = await fixture.service.resolveUpdate({
      ...request,
      ifMatch: `"sha256:${initial.digest}"`,
    });

    expect(result.kind).to.equal('precondition-failed');
    expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
    expect(fixture.putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('returns typed invalid If-Match outcomes for malformed, weak, list, and wildcard values without persistence', async function () {
    const values = [
      { value: 'arbitrary-tag', reason: 'malformed' },
      { value: `W/"sha256:${'a'.repeat(64)}"`, reason: 'weak' },
      {
        value: `"sha256:${'a'.repeat(64)}", "sha256:${'b'.repeat(64)}"`,
        reason: 'list',
      },
      { value: '*', reason: 'wildcard' },
    ] as const;

    for (const { value, reason } of values) {
      const fixture = updateResolutionFixture();

      const result = await fixture.service.resolveUpdate({ ...request, ifMatch: value });

      expect(result).to.deep.equal({
        kind: 'invalid-precondition',
        condition: 'if-match',
        reason,
        code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
      });
      expect(fixture.putRecordSchemaArtifact.notCalled, value).to.equal(true);
      expect(fixture.putRecordSchemaReference.notCalled, value).to.equal(true);
    }
  });

  it('does not evaluate If-Match before missing, denied, context, or compiler failures', async function () {
    let conditionalEvaluations = 0;
    const conditionalRequest = {
      ...request,
      get ifMatch(): string {
        conditionalEvaluations += 1;
        return `"sha256:${DIGEST}"`;
      },
    };
    const missing = updateResolutionFixture(updateContext(), {
      resolveContractContext: sinon.stub().rejects(new RecordContractContextResolutionError('not-found')),
    });
    const denied = updateResolutionFixture(updateContext(), { authorizeUpdate: sinon.stub().resolves(false) });
    const contextFailure = updateResolutionFixture(updateContext(), {
      resolveContractContext: sinon.stub().rejects(new RecordContractContextResolutionError('not-resolvable')),
    });
    const compilerFailure = updateResolutionFixture(updateContext(), {
      getContributorRegistry: () => coreRegistry(['SimpleInputComponent']),
    });

    const results = await Promise.all([
      missing.service.resolveUpdate(conditionalRequest),
      denied.service.resolveUpdate(conditionalRequest),
      contextFailure.service.resolveUpdate(conditionalRequest),
      compilerFailure.service.resolveUpdate(conditionalRequest),
    ]);

    expect(results.map(result => result.kind)).to.deep.equal([
      'missing-oid',
      'denied',
      'context-failed',
      'compiler-failed',
    ]);
    expect(conditionalEvaluations).to.equal(0);
    for (const fixture of [missing, denied, contextFailure, compilerFailure]) {
      expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
      expect(fixture.putRecordSchemaReference.notCalled).to.equal(true);
    }
  });

  it('delegates current edit authorization to RecordsService before form construction', async function () {
    const context = updateContext();
    const resolveContractContext = sinon.stub().resolves(context);
    const buildContractFormConfig = sinon.stub().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
    const putRecordSchemaArtifact = sinon.stub().resolves(storageResponse(true));
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    const hasEditAccess = sinon.stub().returns(true);
    const priorServices = sails.services;
    const serviceRegistry = sails.services ?? {};
    const priorRecordsService = serviceRegistry.recordsservice;
    sails.services = serviceRegistry;
    serviceRegistry.recordsservice = { hasEditAccess };
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ putRecordSchemaArtifact, putRecordSchemaReference }),
      getContributorRegistry: () => coreRegistry(),
      resolveContractContext,
      buildContractFormConfig,
    });

    try {
      const result = await service.resolveUpdate(request);

      expect(result.kind).to.equal('resolved');
      expect(
        hasEditAccess.calledOnceWithExactly(
          caller.brand,
          caller.user,
          caller.user.roles,
          context.resolution.existingRecord
        )
      ).to.equal(true);
      expect(hasEditAccess.calledBefore(buildContractFormConfig)).to.equal(true);
    } finally {
      if (priorRecordsService === undefined) {
        delete serviceRegistry.recordsservice;
      } else {
        serviceRegistry.recordsservice = priorRecordsService;
      }
      sails.services = priorServices;
    }
  });

  it('returns typed denied and missing-OID outcomes without compiling or persisting', async function () {
    const authorizeUpdate = sinon.stub().resolves(false);
    const denied = updateResolutionFixture(updateContext(), { authorizeUpdate });

    const deniedResult = await denied.service.resolveUpdate(request);

    expect(deniedResult).to.deep.equal({
      kind: 'denied',
      code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
    });
    expect(denied.buildContractFormConfig.notCalled).to.equal(true);
    expect(denied.putRecordSchemaArtifact.notCalled).to.equal(true);
    expect(denied.putRecordSchemaReference.notCalled).to.equal(true);

    const resolveMissing = sinon.stub().rejects(new RecordContractContextResolutionError('not-found'));
    const missing = updateResolutionFixture(updateContext(), { resolveContractContext: resolveMissing });

    const missingResult = await missing.service.resolveUpdate(request);

    expect(missingResult).to.deep.equal({
      kind: 'missing-oid',
      code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
    });
    expect(missing.authorizeUpdate.notCalled).to.equal(true);
    expect(missing.buildContractFormConfig.notCalled).to.equal(true);
    expect(missing.putRecordSchemaArtifact.notCalled).to.equal(true);
    expect(missing.putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('uses the authoritative current workflow stage and form for each record', async function () {
    const draft = updateResolutionFixture(updateContext('oid-draft'));
    const reviewContext = updateContext('oid-review', {
      workflowStep: 'review',
      form: 'dataset-review',
    });
    const review = updateResolutionFixture(reviewContext, {
      buildContractFormConfig: async () => ({
        ok: true,
        effectiveForm: simpleForm(['review_notes']),
      }),
    });

    const draftResult = await draft.service.resolveUpdate({ ...request, oid: 'oid-draft' });
    const reviewResult = await review.service.resolveUpdate({ ...request, oid: 'oid-review' });

    expect(draftResult.kind).to.equal('resolved');
    expect(reviewResult.kind).to.equal('resolved');
    if (draftResult.kind !== 'resolved' || reviewResult.kind !== 'resolved') {
      throw new Error('Expected both update contexts to resolve.');
    }
    expect(draftResult.document['x-redbox-context']).to.deep.include({
      workflowStep: 'draft',
      form: 'dataset-draft',
    });
    expect(reviewResult.document['x-redbox-context']).to.deep.include({
      workflowStep: 'review',
      form: 'dataset-review',
    });
    expect(reviewResult.document.properties).to.have.property('review_notes');
    expect(reviewResult.digest).not.to.equal(draftResult.digest);
  });

  it('persists normalized operations and rejects unauthorized operations before edit authorization', async function () {
    const normalized = updateResolutionFixture(updateContext('oid-1', { operation: 'submit' }));

    const normalizedResult = await normalized.service.resolveUpdate({ ...request, operation: ' submit ' });

    expect(normalizedResult.kind).to.equal('resolved');
    if (normalizedResult.kind !== 'resolved') {
      throw new Error('Expected the normalized update operation to resolve.');
    }
    expect(normalized.resolveContractContext.firstCall.firstArg.operation).to.equal(' submit ');
    expect(normalizedResult.metadata.context.operation).to.equal('submit');
    expect(normalizedResult.grant.operation).to.equal('submit');

    const resolveUnauthorized = sinon
      .stub()
      .rejects(
        new RecordContractContextResolutionError('forbidden', ['record-validation-operation-role-unauthorized'])
      );
    const unauthorized = updateResolutionFixture(updateContext(), {
      resolveContractContext: resolveUnauthorized,
    });

    const unauthorizedResult = await unauthorized.service.resolveUpdate({ ...request, operation: 'publish' });

    expect(unauthorizedResult).to.deep.equal({
      kind: 'context-failed',
      failureKind: 'forbidden',
      diagnosticCodes: ['record-validation-operation-role-unauthorized'],
    });
    expect(unauthorized.authorizeUpdate.notCalled).to.equal(true);
    expect(unauthorized.putRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('deduplicates identical public documents while retaining distinct private OIDs in grants', async function () {
    const firstContext = updateContext('oid-1', {}, { metadata: { title: 'First private value' } });
    const secondContext = updateContext('oid-2', {}, { metadata: { title: 'Second private value' } });
    const resolveContractContext = sinon.stub();
    resolveContractContext.onFirstCall().resolves(firstContext);
    resolveContractContext.onSecondCall().resolves(secondContext);
    const fixture = updateResolutionFixture(firstContext, { resolveContractContext });

    const first = await fixture.service.resolveUpdate(request);
    const second = await fixture.service.resolveUpdate({ ...request, oid: 'oid-2' });

    expect(first.kind).to.equal('resolved');
    expect(second.kind).to.equal('resolved');
    if (first.kind !== 'resolved' || second.kind !== 'resolved') {
      throw new Error('Expected both identical public update contracts to resolve.');
    }
    expect(first.digest).to.equal(second.digest);
    expect(first.document).to.deep.equal(second.document);
    expect(fixture.putRecordSchemaArtifact.callCount).to.equal(2);
    expect(fixture.putRecordSchemaArtifact.firstCall.firstArg).to.deep.equal(
      fixture.putRecordSchemaArtifact.secondCall.firstArg
    );
    expect(first.grant.oid).to.equal('oid-1');
    expect(second.grant.oid).to.equal('oid-2');
    expect(first.grant.referenceKey).not.to.equal(second.grant.referenceKey);
    expect(JSON.stringify(first.document)).not.to.include('oid-1');
    expect(JSON.stringify(second.document)).not.to.include('oid-2');
  });

  it('returns typed compiler and limit failures without persistence', async function () {
    const missingContributor = updateResolutionFixture(updateContext(), {
      getContributorRegistry: () => coreRegistry(['SimpleInputComponent']),
    });

    const compilerResult = await missingContributor.service.resolveUpdate(request);

    expect(compilerResult.kind).to.equal('compiler-failed');
    if (compilerResult.kind !== 'compiler-failed') {
      throw new Error('Expected an update compiler failure.');
    }
    expect(compilerResult.code).to.equal(RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT);
    expect(missingContributor.putRecordSchemaArtifact.notCalled).to.equal(true);

    const limited = updateResolutionFixture(updateContext(), {
      getConfig: () =>
        enabledConfig({
          limits: { ...recordSchema.limits, maxProperties: 1 },
        }),
      buildContractFormConfig: async () => ({
        ok: true,
        effectiveForm: simpleForm(['title', 'description']),
      }),
    });

    const limitResult = await limited.service.resolveUpdate(request);

    expect(limitResult.kind).to.equal('limit-exceeded');
    if (limitResult.kind !== 'limit-exceeded') {
      throw new Error('Expected an update schema limit failure.');
    }
    expect(limitResult).to.deep.include({
      stage: 'compiler',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_PROPERTIES,
    });
    expect(limited.putRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('distinguishes update artifact and grant persistence failures', async function () {
    const artifactFailure = updateResolutionFixture();
    artifactFailure.putRecordSchemaArtifact.resolves(storageResponse(false));

    const artifactResult = await artifactFailure.service.resolveUpdate(request);

    expect(artifactResult).to.deep.equal({
      kind: 'storage-failed',
      stage: 'artifact',
      code: RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_WRITE_FAILED,
    });
    expect(artifactFailure.putRecordSchemaReference.notCalled).to.equal(true);

    const grantFailure = updateResolutionFixture();
    grantFailure.putRecordSchemaReference.resolves(storageResponse(false));

    const grantResult = await grantFailure.service.resolveUpdate(request);

    expect(grantResult).to.deep.equal({
      kind: 'storage-failed',
      stage: 'grant',
      code: RECORD_SCHEMA_PROBLEM_CODES.GRANT_WRITE_FAILED,
    });
    expect(grantFailure.putRecordSchemaArtifact.calledOnce).to.equal(true);
    expect(grantFailure.putRecordSchemaReference.calledOnce).to.equal(true);
  });
});

describe('RecordSchemaService immutable resolution', function () {
  afterEach(function () {
    sinon.restore();
  });

  function requestFor(
    seed: ImmutableSeed,
    caller: FormRecordAccessContext = updateCaller()
  ): ResolveImmutableRecordSchemaRequest {
    return {
      brand: 'brand-1',
      portal: 'portal-1',
      digest: seed.artifact.digest,
      caller,
    };
  }

  function etagFor(seed: ImmutableSeed): RecordJsonSchemaEtag {
    return `"sha256:${seed.artifact.digest}"`;
  }

  it('rejects malformed digests before configuration, storage, authorization, or form work', async function () {
    const getConfig = sinon.stub().throws(new Error('configuration must not be inspected'));
    const getStorageProvider = sinon.stub().throws(new Error('storage must not be inspected'));
    const resolveContractContext = sinon.stub().throws(new Error('authorization must not run'));
    const buildContractFormConfig = sinon.stub().throws(new Error('form construction must not run'));
    const service = new Services.RecordSchema({
      getConfig,
      getStorageProvider,
      resolveContractContext,
      buildContractFormConfig,
    });

    const result = await service.resolveImmutable({
      brand: 'brand-1',
      portal: 'portal-1',
      digest: 'A'.repeat(64),
      caller: updateCaller(),
    });

    expect(result.kind).to.equal('invalid-request');
    if (result.kind !== 'invalid-request') {
      throw new Error('Expected a malformed immutable digest result.');
    }
    expect(result.problem).to.deep.include({
      status: 400,
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
    });
    expect(getConfig.notCalled).to.equal(true);
    expect(getStorageProvider.notCalled).to.equal(true);
    expect(resolveContractContext.notCalled).to.equal(true);
    expect(buildContractFormConfig.notCalled).to.equal(true);
  });

  it('returns the safe typed not-found result for a missing artifact without looking up grants', async function () {
    const seed = await createImmutableSeed();
    const fixture = immutableResolutionFixture(seed);
    fixture.getRecordSchemaArtifact.resolves(null);

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('not-found');
    if (result.kind !== 'not-found') {
      throw new Error('Expected a missing immutable artifact result.');
    }
    expect(result.problem).to.deep.include({
      status: 404,
      detail: 'No accessible schema was found.',
      code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
    });
    expect(fixture.listRecordSchemaReferences.notCalled).to.equal(true);
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('denies cross-brand and cross-portal grants without revealing their existence', async function () {
    const seed = await createImmutableSeed();
    const fixture = immutableResolutionFixture(seed);
    const crossBrand: RecordSchemaGrantReferenceInput = {
      ...seed.grant,
      referenceKey: 'cross-brand',
      brand: 'brand-2',
    };
    const crossPortal: RecordSchemaGrantReferenceInput = {
      ...seed.grant,
      referenceKey: 'cross-portal',
      portal: 'portal-2',
    };
    fixture.listRecordSchemaReferences.resolves([crossBrand, crossPortal]);

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('not-found');
    expect(
      fixture.listRecordSchemaReferences.calledOnceWithExactly({
        digest: seed.artifact.digest,
        kind: 'grant',
        brand: 'brand-1',
        portal: 'portal-1',
        limit: 1_000,
        offset: 0,
      })
    ).to.equal(true);
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('returns the same not-found result for a cross-brand caller before storage lookup', async function () {
    const seed = await createImmutableSeed();
    const fixture = immutableResolutionFixture(seed);

    const result = await fixture.service.resolveImmutable(
      requestFor(seed, updateCaller('alice', 'Researcher', 'brand-2'))
    );

    expect(result.kind).to.equal('not-found');
    expect(fixture.getRecordSchemaArtifact.notCalled).to.equal(true);
    expect(fixture.listRecordSchemaReferences.notCalled).to.equal(true);
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('re-evaluates current update access so access loss denies and later access gain authorizes', async function () {
    const seed = await createImmutableUpdateSeed();
    const caller = updateCaller('bob');
    const fixture = immutableResolutionFixture(seed);
    fixture.authorizeUpdate.onFirstCall().resolves(false);
    fixture.authorizeUpdate.onSecondCall().resolves(true);

    const denied = await fixture.service.resolveImmutable(requestFor(seed, caller));
    const authorized = await fixture.service.resolveImmutable(requestFor(seed, caller));

    expect(denied.kind).to.equal('not-found');
    expect(authorized.kind).to.equal('resolved');
    expect(fixture.authorizeUpdate.callCount).to.equal(2);
    expect(fixture.buildContractFormConfig.calledOnceWithExactly(seed.context, caller)).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.calledOnceWithExactly(seed.artifact.digest)).to.equal(true);
  });

  it('delegates an anonymous create context to the current authoritative resolver', async function () {
    const seed = await createImmutableSeed();
    const baseContext = createContext();
    const anonymousContext: RecordContractCreateContext = {
      ...baseContext,
      resolution: {
        ...baseContext.resolution,
        actor: { authenticated: false, roles: ['Anonymous'] },
      },
    };
    const resolveContractContext = sinon.stub().resolves(anonymousContext);
    const fixture = immutableResolutionFixture(seed, { resolveContractContext });
    const caller = updateCaller('', 'Anonymous');

    const result = await fixture.service.resolveImmutable(requestFor(seed, caller));

    expect(result.kind).to.equal('resolved');
    expect(
      resolveContractContext.calledOnceWithExactly({
        kind: 'create',
        brand: 'brand-1',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: undefined,
        targetStep: 'draft',
        actor: { authenticated: false, roles: ['Anonymous'] },
      })
    ).to.equal(true);
  });

  it('tries equivalent grants in order until one current context authorizes', async function () {
    const seed = await createImmutableSeed();
    const firstGrant: RecordSchemaGrantReferenceInput = {
      referenceKey: 'grant:update:first-denied',
      digest: seed.artifact.digest,
      brand: 'brand-1',
      portal: 'portal-1',
      kind: 'grant',
      schemaKind: 'update',
      recordType: 'dataset',
      operation: 'strict-all',
      oid: 'oid-denied',
    };
    const fixture = immutableResolutionFixture(seed);
    fixture.listRecordSchemaReferences.resolves([firstGrant, seed.grant]);
    fixture.resolveContractContext.onFirstCall().resolves(updateContext('oid-denied'));
    fixture.resolveContractContext.onSecondCall().resolves(seed.context);
    fixture.authorizeUpdate.resolves(false);

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('resolved');
    expect(fixture.resolveContractContext.callCount).to.equal(2);
    expect(fixture.authorizeUpdate.calledOnce).to.equal(true);
    expect(fixture.buildContractFormConfig.calledOnceWithExactly(seed.context, undefined)).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.calledOnce).to.equal(true);
  });

  it('continues scoped grant lookup until a later page contains a currently accessible context', async function () {
    const seed = await createImmutableUpdateSeed();
    const inaccessibleGrants: RecordSchemaGrantReferenceInput[] = Array.from({ length: 1_000 }, (_, index) => ({
      referenceKey: `grant:update:inaccessible-${index}`,
      digest: seed.artifact.digest,
      brand: 'brand-1',
      portal: 'portal-1',
      kind: 'grant',
      schemaKind: 'update',
      recordType: 'dataset',
      operation: 'strict-all',
      oid: `oid-inaccessible-${index}`,
    }));
    const fixture = immutableResolutionFixture(seed);
    fixture.listRecordSchemaReferences.onFirstCall().resolves(inaccessibleGrants);
    fixture.listRecordSchemaReferences.onSecondCall().resolves([seed.grant]);
    const caller = updateCaller();

    const result = await fixture.service.resolveImmutable(requestFor(seed, caller));

    expect(result.kind).to.equal('resolved');
    expect(fixture.listRecordSchemaReferences.callCount).to.equal(2);
    expect(
      fixture.listRecordSchemaReferences.secondCall.calledWithExactly({
        digest: seed.artifact.digest,
        kind: 'grant',
        brand: 'brand-1',
        portal: 'portal-1',
        limit: 1_000,
        offset: 1_000,
      })
    ).to.equal(true);
    expect(fixture.resolveContractContext.callCount).to.equal(1_001);
    expect(fixture.authorizeUpdate.calledOnce).to.equal(true);
    expect(fixture.buildContractFormConfig.calledOnceWithExactly(seed.context, caller)).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.calledOnce).to.equal(true);
  });

  it('treats a missing or deleted update context exactly like an inaccessible artifact', async function () {
    const seed = await createImmutableUpdateSeed();
    const fixture = immutableResolutionFixture(seed);
    fixture.resolveContractContext.rejects(new RecordContractContextResolutionError('not-found'));

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('not-found');
    if (result.kind !== 'not-found') {
      throw new Error('Expected a missing update context to be hidden.');
    }
    expect(result.problem).to.deep.include({
      status: 404,
      detail: 'No accessible schema was found.',
      code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
    });
    expect(fixture.authorizeUpdate.notCalled).to.equal(true);
    expect(fixture.buildContractFormConfig.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('hides current caller-effective digest drift before conditional evaluation or access-time touch', async function () {
    const seed = await createImmutableUpdateSeed();
    const buildContractFormConfig = sinon.stub().resolves({
      ok: true,
      effectiveForm: simpleForm(['changed-title']),
    });
    const fixture = immutableResolutionFixture(seed, { buildContractFormConfig });
    let conditionalEvaluated = false;
    const request: ResolveImmutableRecordSchemaRequest = {
      ...requestFor(seed),
      get ifNoneMatch(): string {
        conditionalEvaluated = true;
        return etagFor(seed);
      },
    };

    const result = await fixture.service.resolveImmutable(request);

    expect(result.kind).to.equal('not-found');
    expect(fixture.authorizeUpdate.calledOnce).to.equal(true);
    expect(buildContractFormConfig.calledOnce).to.equal(true);
    expect(conditionalEvaluated).to.equal(false);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('does not evaluate an exact conditional or touch access time before authorization', async function () {
    const seed = await createImmutableUpdateSeed();
    const fixture = immutableResolutionFixture(seed);
    fixture.authorizeUpdate.resolves(false);
    let conditionalEvaluated = false;
    const request: ResolveImmutableRecordSchemaRequest = {
      ...requestFor(seed),
      get ifNoneMatch(): string {
        conditionalEvaluated = true;
        return etagFor(seed);
      },
    };

    const result = await fixture.service.resolveImmutable(request);

    expect(result.kind).to.equal('not-found');
    expect(conditionalEvaluated).to.equal(false);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('evaluates an authorized exact conditional before touching and returns no private grant or OID context', async function () {
    const seed = await createImmutableUpdateSeed();
    const events: string[] = [];
    const fixture = immutableResolutionFixture(seed, {
      authorizeUpdate: async () => {
        events.push('authorize');
        return true;
      },
      buildContractFormConfig: async () => {
        events.push('form');
        return { ok: true, effectiveForm: runtimeSimpleForm() };
      },
    });
    fixture.touchRecordSchemaArtifact.callsFake(async () => {
      events.push('touch');
      return storageResponse(true);
    });
    const request: ResolveImmutableRecordSchemaRequest = {
      ...requestFor(seed),
      get ifNoneMatch(): string {
        events.push('conditional');
        return etagFor(seed);
      },
    };

    const result = await fixture.service.resolveImmutable(request);

    expect(result.kind).to.equal('not-modified');
    if (result.kind !== 'not-modified') {
      throw new Error('Expected an authorized conditional immutable result.');
    }
    expect(events).to.deep.equal(['authorize', 'form', 'conditional', 'touch']);
    expect(result.artifact).not.to.have.property('grant');
    expect(result.artifact).not.to.have.property('oid');
    const serializedDocument = JSON.stringify(result.artifact.document);
    for (const privateValue of ['oid-1', 'alice', 'alice@example.test', 'role-researcher', 'Researcher']) {
      expect(serializedDocument).not.to.include(privateValue);
    }
    expect(Object.isFrozen(result.artifact)).to.equal(true);
    expect(Object.isFrozen(result.artifact.document)).to.equal(true);
  });

  it('returns resolved for absent or stale If-None-Match and touches only after evaluation', async function () {
    const seed = await createImmutableUpdateSeed();
    const absent = immutableResolutionFixture(seed);

    const absentResult = await absent.service.resolveImmutable(requestFor(seed));

    expect(absentResult.kind).to.equal('resolved');
    expect(absent.touchRecordSchemaArtifact.calledOnceWithExactly(seed.artifact.digest)).to.equal(true);

    const stale = immutableResolutionFixture(seed);
    const staleResult = await stale.service.resolveImmutable({
      ...requestFor(seed),
      ifNoneMatch: `"sha256:${'b'.repeat(64)}"`,
    });

    expect(staleResult.kind).to.equal('resolved');
    expect(stale.touchRecordSchemaArtifact.calledOnceWithExactly(seed.artifact.digest)).to.equal(true);
  });

  it('rejects malformed, weak, list, and wildcard If-None-Match only after authorization and without touching', async function () {
    const seed = await createImmutableUpdateSeed();
    const values = [
      'arbitrary-tag',
      `W/"sha256:${seed.artifact.digest}"`,
      `"sha256:${seed.artifact.digest}", "sha256:${'b'.repeat(64)}"`,
      '*',
    ];

    for (const ifNoneMatch of values) {
      const fixture = immutableResolutionFixture(seed);

      const result = await fixture.service.resolveImmutable({ ...requestFor(seed), ifNoneMatch });

      expect(result.kind, ifNoneMatch).to.equal('invalid-request');
      if (result.kind !== 'invalid-request') {
        throw new Error('Expected an invalid immutable conditional result.');
      }
      expect(result.problem).to.deep.include({
        status: 400,
        code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
      });
      expect(fixture.authorizeUpdate.calledOnce, ifNoneMatch).to.equal(true);
      expect(fixture.buildContractFormConfig.calledOnce, ifNoneMatch).to.equal(true);
      expect(fixture.touchRecordSchemaArtifact.notCalled, ifNoneMatch).to.equal(true);
    }
  });
});
