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
  MAX_RECORD_SCHEMA_INTEGRATION_PINS,
  type ContractJsonObject,
  type ContractJsonValue,
  createCoreRecordContractContributors,
  normalizeRedboxCanonicalJsonV1,
  serializeRedboxCanonicalJsonV1,
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
  type RecordSchemaAuthorizationGrantQuery,
  type RecordSchemaGrantReferenceInput,
  type RecordSchemaReferenceModel,
  resetDiscoveredRecordContractContributorRegistry,
  setDiscoveredRecordContractContributorRegistry,
  StorageServiceResponse,
  UserModel,
} from '../../src';
import {
  RECORD_SCHEMA_LIFECYCLE_ERROR_CODE,
  RECORD_SCHEMA_RETENTION_REPORT_DEFAULT_PAGE_SIZE,
  RECORD_SCHEMA_RETENTION_REPORT_MAX_PAGE_SIZE,
  RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX,
  RecordSchemaLifecycleError,
  type ResolveImmutableRecordSchemaRequest,
  type RecordSchemaServiceDependencies,
  Services,
} from '../../src/services/RecordSchemaService';
import {
  issueInternalRecordSchemaCreateAuthorizationCapability,
  issueInternalRecordSchemaUpdateAuthorizationCapability,
} from '../../src/services/internal-record-schema-authorization';
import { RecordSchemaService, ServiceExports } from '../../src/services';
import { Services as RecordsServices } from '../../src/services/RecordsService';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import type { RecordContractUpdateContext } from '../../src/record-contract';
import { clearCapturedOpenTelemetryMeasurements, getCapturedOpenTelemetryMeasurements } from '../setup';
import { createRecordContractFixture } from '../fixtures/record-contract.fixtures';

const DIGEST = 'a'.repeat(64);
type RecordSchemaLifecycleOverrides = NonNullable<ConstructorParameters<typeof Services.RecordSchema>[0]>;

function enabledConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...structuredClone(recordSchema),
    enabled: true,
    ...overrides,
  };
}

function zeroLengthArrayYielding(values: readonly unknown[]): unknown[] {
  const deceptive: unknown[] = [];
  Object.defineProperty(deceptive, Symbol.iterator, {
    value: () => values[Symbol.iterator](),
  });
  return deceptive;
}

function ensureTestSails(): () => void {
  const prior = Reflect.get(global, 'sails');
  if (prior === undefined) Reflect.set(global, 'sails', { config: {}, services: {} });
  return () => {
    if (prior === undefined) Reflect.deleteProperty(global, 'sails');
    else Reflect.set(global, 'sails', prior);
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
    getConfiguredFormCandidates: () => [],
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

async function captureAsyncLifecycleError(run: () => Promise<unknown>): Promise<RecordSchemaLifecycleError> {
  try {
    await run();
  } catch (error) {
    if (error instanceof RecordSchemaLifecycleError) return error;
    throw error;
  }
  throw new Error('Expected RecordSchemaService startup to fail.');
}

async function captureAsyncError(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    if (error instanceof Error) return error;
    throw new Error('Expected an Error rejection.');
  }
  throw new Error('Expected the operation to reject.');
}

function validPin(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    digest: DIGEST,
    brand: 'default',
    portal: 'rdmp',
    schemaKind: 'create',
    recordType: 'rdmp',
    operation: 'strict-all',
    owner: 'integration-owner',
    purpose: 'Retain the contract used by the integration.',
    expiresAt: '2027-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function storageResponse(success: boolean, code?: string): StorageServiceResponse {
  const response = new StorageServiceResponse();
  response.success = success;
  if (code) response.details = { code };
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
  const authorizeCreate = sinon.stub().resolves(true);
  const service = new Services.RecordSchema({
    getConfig: () => enabledConfig(),
    getStorageProvider: () => storageProvider,
    getContributorRegistry: () => coreRegistry(),
    resolveContractContext,
    buildContractFormConfig,
    authorizeCreate,
    ...overrides,
  });
  return {
    service,
    context,
    resolveContractContext,
    buildContractFormConfig,
    authorizeCreate,
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

async function createImmutableSeed(branding?: string): Promise<ImmutableSeed> {
  const fixture = createResolutionFixture();
  const result = await fixture.service.resolveCreate({
    brand: 'brand-1',
    branding,
    portal: 'portal-1',
    recordType: 'dataset',
    caller: updateCaller(),
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
  const findRecordSchemaGrantForAuthorization = sinon
    .stub()
    .callsFake(async (query: RecordSchemaAuthorizationGrantQuery) =>
      query.afterReferenceKey === undefined ? seed.grant : null
    );
  const listRecordSchemaReferences = sinon.stub().resolves([seed.grant]);
  const touchRecordSchemaArtifact = sinon.stub().resolves(storageResponse(true));
  const storageProvider = {
    getRecordSchemaArtifact,
    findRecordSchemaGrantForAuthorization,
    listRecordSchemaReferences,
    touchRecordSchemaArtifact,
  };
  const resolveContractContext = sinon.stub().resolves(seed.context);
  const buildContractFormConfig = sinon.stub().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
  const authorizeCreate = sinon.stub().resolves(true);
  const authorizeUpdate = sinon.stub().resolves(true);
  const service = new Services.RecordSchema({
    getConfig: () => enabledConfig(),
    getStorageProvider: () => storageProvider,
    getContributorRegistry: () => coreRegistry(),
    resolveContractContext,
    buildContractFormConfig,
    authorizeCreate,
    authorizeUpdate,
    ...overrides,
  });
  return {
    service,
    getRecordSchemaArtifact,
    findRecordSchemaGrantForAuthorization,
    listRecordSchemaReferences,
    touchRecordSchemaArtifact,
    resolveContractContext,
    buildContractFormConfig,
    authorizeCreate,
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

  it('normalizes a disabled environment boolean string before the legacy startup short circuit', function () {
    const getStorageProvider = sinon.stub().throws(new Error('legacy storage must not be inspected'));
    const service = lifecycleService({
      getConfig: () => ({ enabled: 'false' }),
      getStorageProvider,
    });

    expect(() => service.init()).not.to.throw();
    expect(getStorageProvider.notCalled).to.equal(true);
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

  it('normalizes an enabled environment boolean string before startup validation', function () {
    const getStorageProvider = sinon.stub().returns(completeStorageProvider());
    const service = lifecycleService({
      getConfig: () => enabledConfig({ enabled: 'true' }),
      getStorageProvider,
    });

    expect(() => service.init()).not.to.throw();
    expect(getStorageProvider.calledOnce).to.equal(true);
  });

  it('retains the typed startup diagnostic for an invalid environment boolean value', function () {
    const service = lifecycleService({ getConfig: () => enabledConfig({ enabled: 'yes' }) });

    const error = captureLifecycleError(() => service.init());

    expect(error.findings).to.deep.include({
      category: 'configuration',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
      path: 'recordSchema.enabled',
      reason: 'type',
    });
  });

  it('candidate-independently compiles every configured form before awaited startup completes', async function () {
    const getConfiguredFormCandidates = sinon.stub().returns([
      { name: 'configured-a', form: simpleForm(['title']), reusableFormDefinitions: {} },
      { name: 'configured-b', form: simpleForm(['description']), reusableFormDefinitions: {} },
    ]);
    const resolveContractContext = sinon.stub().throws(new Error('authoritative context must remain lazy'));
    const buildContractFormConfig = sinon.stub().throws(new Error('caller-effective construction must remain lazy'));
    const service = lifecycleService({
      getConfiguredFormCandidates,
      resolveContractContext,
      buildContractFormConfig,
    });

    service.init();
    await service.bootstrap();

    expect(getConfiguredFormCandidates.calledOnceWithExactly()).to.equal(true);
    expect(resolveContractContext.notCalled).to.equal(true);
    expect(buildContractFormConfig.notCalled).to.equal(true);
  });

  it('fails awaited startup with a typed safe finding for an invalid configured form candidate', async function () {
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    const storage = { ...completeStorageProvider(), putRecordSchemaReference };
    const service = lifecycleService({
      getStorageProvider: () => storage,
      getConfiguredFormCandidates: () => [
        { name: 'valid-form', form: simpleForm(), reusableFormDefinitions: {} },
        {
          name: 'invalid-form',
          form: {
            name: 'invalid-form',
            componentDefinitions: [{ name: 'broken', component: {}, model: {} }],
          },
          reusableFormDefinitions: {},
        },
      ],
    });

    service.init();
    const error = await captureAsyncLifecycleError(() => service.bootstrap());

    expect(error.findings).to.deep.equal([
      {
        category: 'form',
        code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
        form: 'invalid-form',
        stage: 'compiler',
      },
    ]);
    expect(error.message).not.to.include('broken');
    expect(putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('awaits configured integration-pin writes and fails before startup can complete', async function () {
    const storage = completeStorageProvider();
    let completeWrite: ((response: StorageServiceResponse) => void) | undefined;
    storage.putRecordSchemaReference.callsFake(
      () =>
        new Promise<StorageServiceResponse>(resolve => {
          completeWrite = resolve;
        })
    );
    const service = lifecycleService({
      getConfig: () => enabledConfig({ integrationPins: [validPin()] }),
      getStorageProvider: () => storage,
    });

    service.init();
    let settled = false;
    const startup = service.bootstrapIntegrationPins().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).to.equal(false);
    if (!completeWrite) {
      throw new Error('Expected startup to await a configured pin write.');
    }
    completeWrite(storageResponse(true));
    await startup;
    expect(settled).to.equal(true);

    storage.putRecordSchemaReference.resolves(storageResponse(false, 'record-schema.artifact-not-found'));
    const error = await captureAsyncError(() => service.bootstrapIntegrationPins());
    expect(error.message).to.include('record-schema.artifact-not-found');
  });

  it('uses the configured Sails storage service and discovered contributor state', function () {
    const restoreSails = ensureTestSails();
    const serviceName = 'recordSchemaLifecycleTestStorage';
    const priorServices = sails.services;
    const serviceRegistry = sails.services ?? {};
    sails.services = serviceRegistry;
    const originalRecordSchema = Reflect.get(sails.config, 'recordSchema');
    const originalStorage = Reflect.get(sails.config, 'storage');
    const originalStorageService = Reflect.get(serviceRegistry, serviceName);
    const hadRecordSchema = Reflect.has(sails.config, 'recordSchema');
    const hadStorage = Reflect.has(sails.config, 'storage');
    const hadStorageService = Reflect.has(serviceRegistry, serviceName);

    Reflect.set(sails.config, 'recordSchema', enabledConfig({ integrationPins: [validPin()] }));
    Reflect.set(sails.config, 'storage', { serviceName });
    Reflect.set(serviceRegistry, serviceName, completeStorageProvider());
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
        ? Reflect.set(serviceRegistry, serviceName, originalStorageService)
        : Reflect.deleteProperty(serviceRegistry, serviceName);
      sails.services = priorServices;
      restoreSails();
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
    expect(ServiceExports.RecordSchemaService).to.have.property('bootstrap').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('resolveCreate').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('resolveUpdate').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('resolveImmutable').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('persistSaveUsageReference').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('materializeIntegrationPins').that.is.a('function');
    expect(ServiceExports.RecordSchemaService).to.have.property('reportRetention').that.is.a('function');
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
    caller: updateCaller(),
  } as const;

  it('denies create-schema generation when form and operation context resolve but create ACL access does not', async function () {
    const fixture = createResolutionFixture();
    fixture.authorizeCreate.resolves(false);

    const result = await fixture.service.resolveCreate(request);

    expect(result).to.deep.equal({
      kind: 'context-failed',
      failureKind: 'forbidden',
      diagnosticCodes: [],
    });
    expect(fixture.authorizeCreate.calledOnceWithExactly(fixture.context, request.caller)).to.equal(true);
    expect(fixture.buildContractFormConfig.notCalled).to.equal(true);
    expect(fixture.putRecordSchemaArtifact.notCalled).to.equal(true);
    expect(fixture.putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('delegates current create ACL authorization to RecordsService before form construction', async function () {
    const restoreSails = ensureTestSails();
    const context = createContext();
    const resolveContractContext = sinon.stub().resolves(context);
    const buildContractFormConfig = sinon.stub().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
    const putRecordSchemaArtifact = sinon.stub().resolves(storageResponse(true));
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    const hasCreateAccess = sinon.stub().resolves(true);
    const priorServices = sails.services;
    const serviceRegistry = sails.services ?? {};
    const priorRecordsService = serviceRegistry.recordsservice;
    sails.services = serviceRegistry;
    serviceRegistry.recordsservice = { hasCreateAccess };
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ putRecordSchemaArtifact, putRecordSchemaReference }),
      getContributorRegistry: () => coreRegistry(),
      resolveContractContext,
      buildContractFormConfig,
    });

    try {
      const result = await service.resolveCreate(request);

      expect(result.kind).to.equal('resolved');
      expect(
        hasCreateAccess.calledOnceWithExactly(
          request.caller.brand,
          request.caller.user,
          request.caller.user.roles,
          'dataset',
          'draft'
        )
      ).to.equal(true);
      expect(hasCreateAccess.calledBefore(buildContractFormConfig)).to.equal(true);
    } finally {
      if (priorRecordsService === undefined) {
        delete serviceRegistry.recordsservice;
      } else {
        serviceRegistry.recordsservice = priorRecordsService;
      }
      sails.services = priorServices;
      restoreSails();
    }
  });

  it('accepts only an issued internal create capability after the normal save boundary authorizes', async function () {
    const trusted = createResolutionFixture();
    trusted.authorizeCreate.resolves(false);

    const resolved = await trusted.service.resolveCreate({
      ...request,
      internalAuthorizationCapability: issueInternalRecordSchemaCreateAuthorizationCapability(),
    });

    expect(resolved.kind).to.equal('resolved');
    expect(trusted.authorizeCreate.notCalled).to.equal(true);
    expect(trusted.putRecordSchemaArtifact.calledOnce).to.equal(true);

    const forged = createResolutionFixture();
    forged.authorizeCreate.resolves(false);
    const denied = await forged.service.resolveCreate({
      ...request,
      internalAuthorizationCapability: { kind: 'record-schema-service-create' },
    });

    expect(denied.kind).to.equal('context-failed');
    if (denied.kind !== 'context-failed') throw new Error('Expected a forged create capability to be denied.');
    expect(denied.failureKind).to.equal('forbidden');
    expect(forged.authorizeCreate.calledOnce).to.equal(true);
    expect(forged.putRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('keeps representative create/update bytes stable across fresh randomized service instances', async function () {
    function shuffled<T>(values: readonly T[], seed: number): T[] {
      const result = [...values];
      let state = seed >>> 0;
      for (let index = result.length - 1; index > 0; index -= 1) {
        state = (Math.imul(state, 1_103_515_245) + 12_345) >>> 0;
        const swapIndex = state % (index + 1);
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
      }
      return result;
    }

    function withRandomizedObjectInsertionOrder<T>(value: T, seed: number): T {
      let nextSeed = seed;
      const visit = (candidate: unknown): unknown => {
        if (Array.isArray(candidate)) return candidate.map(item => visit(item));
        if (candidate === null || typeof candidate !== 'object') return candidate;
        const entries = shuffled(Object.entries(candidate), nextSeed);
        nextSeed += 1;
        return Object.fromEntries(entries.map(([key, nested]) => [key, visit(nested)]));
      };
      return visit(value) as T;
    }

    async function compileWithFreshService(kind: 'create' | 'update', seed: number) {
      const fixture = withRandomizedObjectInsertionOrder(createRecordContractFixture(), seed);
      const publicContextOverrides = {
        brand: 'default',
        portal: 'main',
        recordType: 'record-contract-fixture',
        workflowStep: 'draft',
        form: fixture.form.name,
        operation: 'submit',
        unknownProperties: 'declared' as const,
        enforcement: 'shadow' as const,
      };
      const baseContext =
        kind === 'create'
          ? createContext(publicContextOverrides)
          : updateContext('record-contract-fixture-oid', publicContextOverrides);
      const context = withRandomizedObjectInsertionOrder(
        {
          ...baseContext,
          resolution: {
            ...baseContext.resolution,
            sourceForm: fixture.form,
            reusableFormDefinitions: fixture.reusableFormDefinitions,
          },
        },
        seed + 1
      ) as RecordContractContext;
      const registrations = createCoreRecordContractContributors().map(contributor => ({
        contributor,
        source: 'core' as const,
      }));
      const service = new Services.RecordSchema({
        getConfig: () => enabledConfig({ unknownProperties: 'declared' }),
        getStorageProvider: () => ({
          putRecordSchemaArtifact: sinon.stub().resolves(storageResponse(true)),
          putRecordSchemaReference: sinon.stub().resolves(storageResponse(true)),
        }),
        getContributorRegistry: () => new RecordContractContributorRegistry(shuffled(registrations, seed + 2)),
        resolveContractContext: sinon.stub().resolves(context),
        buildContractFormConfig: sinon.stub().resolves({ ok: true, effectiveForm: fixture.form }),
        authorizeCreate: sinon.stub().resolves(true),
        authorizeUpdate: sinon.stub().resolves(true),
      });
      const result =
        kind === 'create'
          ? await service.resolveCreate({
              brand: 'default',
              portal: 'main',
              recordType: 'record-contract-fixture',
              operation: 'submit',
              caller: updateCaller(),
            })
          : await service.resolveUpdate({
              brand: 'default',
              portal: 'main',
              oid: 'record-contract-fixture-oid',
              operation: 'submit',
              caller: updateCaller(),
            });
      if (result.kind !== 'partial') {
        throw new Error(`The representative ${kind} fixture did not resolve as a partial schema.`);
      }
      return {
        canonicalJson: serializeRedboxCanonicalJsonV1(result.document),
        digest: result.digest,
        byteLength: result.metadata.byteLength,
      };
    }

    const expectedDigests = {
      create: '86864e1a72938e4a6b7c2e834c4dde441d1050da4fa4aafe2ba1ab5c8afd4403',
      update: 'cb6f59e636553cebad5e122de33084574afda991f37521118482989d46e00325',
    } as const;
    for (const kind of ['create', 'update'] as const) {
      const first = await compileWithFreshService(kind, 17);
      const second = await compileWithFreshService(kind, 83);
      expect(first.canonicalJson).to.equal(second.canonicalJson);
      expect(first.digest).to.equal(second.digest).and.equal(expectedDigests[kind]);
      expect(first.byteLength).to.equal(second.byteLength);
    }
  });

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
      actor: { authenticated: true, roles: ['Researcher'] },
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

  it('publishes the canonical branding scope while retaining the Mongo brand id for context resolution', async function () {
    const fixture = createResolutionFixture();

    const result = await fixture.service.resolveCreate({
      ...request,
      branding: 'default',
    });

    expect(result.kind).to.equal('resolved');
    if (result.kind !== 'resolved') {
      throw new Error('Expected a complete create schema resolution.');
    }
    expect(fixture.resolveContractContext.calledOnce).to.equal(true);
    expect(fixture.resolveContractContext.firstCall.firstArg).to.deep.include({ brand: 'brand-1' });
    expect(result.metadata.context.brand).to.equal('default');
    expect(result.document['x-redbox-context'].brand).to.equal('default');
    expect(result.document.$id).to.equal(`/default/portal-1/api/records/schemas/${result.digest}`);
    expect(result.grant.brand).to.equal('default');
    expect(fixture.putRecordSchemaReference.calledOnceWithExactly(result.grant)).to.equal(true);
  });

  it('persists the artifact before every grant attempt and converges after a retry', async function () {
    const events: string[] = [];
    const putRecordSchemaArtifact = sinon.stub().callsFake(async () => {
      events.push('artifact');
      return storageResponse(true);
    });
    const putRecordSchemaReference = sinon.stub();
    putRecordSchemaReference.onFirstCall().callsFake(async () => {
      events.push('grant');
      return storageResponse(false);
    });
    putRecordSchemaReference.onSecondCall().callsFake(async () => {
      events.push('grant');
      return storageResponse(true);
    });
    const fixture = createResolutionFixture({
      getStorageProvider: () => ({ putRecordSchemaArtifact, putRecordSchemaReference }),
    });

    const failed = await fixture.service.resolveCreate(request);
    const retried = await fixture.service.resolveCreate(request);

    expect(failed.kind).to.equal('storage-failed');
    if (failed.kind !== 'storage-failed' || failed.stage !== 'grant') {
      throw new Error('Expected a grant-stage storage failure.');
    }
    expect(retried.kind).to.equal('resolved');
    if (retried.kind !== 'resolved') {
      throw new Error('Expected the idempotent retry to resolve.');
    }
    expect(events).to.deep.equal(['artifact', 'grant', 'artifact', 'grant']);
    expect(failed.artifact).to.deep.equal({ digest: retried.digest, persisted: true });
    expect(failed.grantReferenceKey).to.equal(retried.grant.referenceKey);
    expect(putRecordSchemaArtifact.firstCall.firstArg).to.deep.equal(putRecordSchemaArtifact.secondCall.firstArg);
    expect(putRecordSchemaReference.firstCall.firstArg).to.deep.equal(putRecordSchemaReference.secondCall.firstArg);
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
      failureKind: 'storage-unavailable',
      retryable: true,
      artifact: {
        digest: grantFailure.putRecordSchemaArtifact.firstCall.firstArg.digest,
        persisted: true,
      },
      grantReferenceKey: grantFailure.putRecordSchemaReference.firstCall.firstArg.referenceKey,
    });
    expect(grantFailure.putRecordSchemaArtifact.calledOnce).to.equal(true);
    expect(grantFailure.putRecordSchemaReference.calledOnce).to.equal(true);
  });

  it('preserves permanent grant-reference storage failures after artifact persistence', async function () {
    for (const [code, failureKind] of [
      [RECORD_SCHEMA_PROBLEM_CODES.ARTIFACT_NOT_FOUND, 'artifact-not-found'],
      [RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_INVALID, 'invalid-reference'],
      [RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_KEY_COLLISION, 'reference-key-collision'],
      [RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT, 'invalid-state'],
    ] as const) {
      const fixture = createResolutionFixture();
      fixture.putRecordSchemaReference.resolves(storageResponse(false, code));

      const result = await fixture.service.resolveCreate(request);

      expect(result.kind).to.equal('storage-failed');
      if (result.kind !== 'storage-failed' || result.stage !== 'grant') {
        throw new Error('Expected a grant storage failure.');
      }
      expect(result).to.deep.include({ failureKind, code, retryable: false });
      expect(fixture.putRecordSchemaArtifact.calledBefore(fixture.putRecordSchemaReference)).to.equal(true);
    }
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

  it('accepts only an issued internal service capability while retaining contract compilation and persistence', async function () {
    const noUserCaller = { ...caller, user: {} as UserModel };
    const trusted = updateResolutionFixture();
    trusted.authorizeUpdate.resolves(false);

    const resolved = await trusted.service.resolveUpdate({
      ...request,
      caller: noUserCaller,
      internalAuthorizationCapability: issueInternalRecordSchemaUpdateAuthorizationCapability(),
    });

    expect(resolved.kind).to.equal('resolved');
    expect(trusted.authorizeUpdate.notCalled).to.equal(true);
    expect(trusted.buildContractFormConfig.calledOnceWithExactly(trusted.context, noUserCaller)).to.equal(true);
    expect(trusted.putRecordSchemaArtifact.calledOnce).to.equal(true);
    expect(trusted.putRecordSchemaReference.calledOnce).to.equal(true);

    const forged = updateResolutionFixture();
    forged.authorizeUpdate.resolves(false);
    const denied = await forged.service.resolveUpdate({
      ...request,
      caller: noUserCaller,
      internalAuthorizationCapability: { kind: 'record-schema-service-update' },
    });

    expect(denied.kind).to.equal('denied');
    expect(forged.authorizeUpdate.calledOnceWithExactly(forged.context, noUserCaller)).to.equal(true);
    expect(forged.buildContractFormConfig.notCalled).to.equal(true);
    expect(forged.putRecordSchemaArtifact.notCalled).to.equal(true);
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
    const restoreSails = ensureTestSails();
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
      restoreSails();
    }
  });

  it('authorizes DOI, Workspace, and RAiD initiating actors through the real update resolver flow', async function () {
    const restoreSails = ensureTestSails();
    const context = updateContext(
      'oid-1',
      {},
      {
        authorization: {
          edit: ['doi-owner', 'workspace-owner', 'raid-owner'],
          editRoles: [],
        },
      }
    );
    const resolveContractContext = sinon.stub().resolves(context);
    const buildContractFormConfig = sinon.stub().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
    const putRecordSchemaArtifact = sinon.stub().resolves(storageResponse(true));
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    const recordsService = new RecordsServices.Records();
    const hasEditAccess = sinon.spy(recordsService, 'hasEditAccess');
    const priorServices = sails.services;
    const serviceRegistry = sails.services ?? {};
    const priorRecordsService = serviceRegistry.recordsservice;
    sails.services = serviceRegistry;
    serviceRegistry.recordsservice = {
      hasEditAccess: (...args: unknown[]) => Reflect.apply(recordsService.hasEditAccess, recordsService, args),
    };
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ putRecordSchemaArtifact, putRecordSchemaReference }),
      getContributorRegistry: () => coreRegistry(),
      resolveContractContext,
      buildContractFormConfig,
    });

    try {
      for (const username of ['doi-owner', 'workspace-owner', 'raid-owner']) {
        const result = await service.resolveUpdate({
          ...request,
          caller: updateCaller(username),
        });
        expect(result.kind, username).to.equal('resolved');
      }

      const missingActor = await service.resolveUpdate({
        ...request,
        caller: updateCaller(''),
      });
      const unauthorizedActor = await service.resolveUpdate({
        ...request,
        caller: updateCaller('ordinary-caller'),
      });
      expect(missingActor).to.deep.equal({
        kind: 'denied',
        code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
      });
      expect(unauthorizedActor).to.deep.equal(missingActor);
      expect(hasEditAccess.callCount).to.equal(4);
      expect(buildContractFormConfig.callCount).to.equal(3);
      expect(putRecordSchemaArtifact.callCount).to.equal(3);
    } finally {
      if (priorRecordsService === undefined) {
        delete serviceRegistry.recordsservice;
      } else {
        serviceRegistry.recordsservice = priorRecordsService;
      }
      sails.services = priorServices;
      restoreSails();
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
      failureKind: 'storage-unavailable',
      retryable: true,
      artifact: {
        digest: grantFailure.putRecordSchemaArtifact.firstCall.firstArg.digest,
        persisted: true,
      },
      grantReferenceKey: grantFailure.putRecordSchemaReference.firstCall.firstArg.referenceKey,
    });
    expect(grantFailure.putRecordSchemaArtifact.calledOnce).to.equal(true);
    expect(grantFailure.putRecordSchemaReference.calledOnce).to.equal(true);
  });
});

describe('RecordSchemaService reference orchestration and retention reporting', function () {
  afterEach(function () {
    sinon.restore();
  });

  it('rejects retention request discriminator mismatches before reading storage', async function () {
    const getStorageProvider = sinon.stub();
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider,
    });
    const now = new Date('2026-08-24T00:00:00.000Z');

    expect(await service.reportRetention({ mode: 'targeted', now, digests: [DIGEST], limit: 1 })).to.deep.equal({
      kind: 'invalid-input',
      reason: 'shape',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
    });
    expect(await service.reportRetention({ mode: 'paginated', now, digests: [DIGEST] })).to.deep.equal({
      kind: 'invalid-input',
      reason: 'shape',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
    });
    expect(getStorageProvider.notCalled).to.equal(true);
  });

  it('creates an idempotent post-save usage reference without persisting the raw save identity', async function () {
    const putRecordSchemaReference = sinon.stub();
    putRecordSchemaReference.onFirstCall().resolves(storageResponse(false));
    putRecordSchemaReference.onSecondCall().resolves(storageResponse(true));
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });
    const request = {
      digest: DIGEST,
      brand: 'brand-1',
      portal: 'portal-1',
      schemaKind: 'update',
      recordType: 'dataset',
      oid: 'oid-1',
      operation: 'submit',
      saveIdentity: 'audit-123',
      rawSecret: 'never-persist-this-secret',
    };

    const failed = await service.persistSaveUsageReference(request);
    const retried = await service.persistSaveUsageReference(request);

    expect(failed.kind).to.equal('write-failed');
    expect(retried.kind).to.equal('recorded');
    if (failed.kind !== 'write-failed' || retried.kind !== 'recorded') {
      throw new Error('Expected a failed save-reference write followed by an idempotent retry.');
    }
    expect(failed.reference).to.deep.equal(retried.reference);
    expect(putRecordSchemaReference.firstCall.firstArg).to.deep.equal(putRecordSchemaReference.secondCall.firstArg);
    expect(putRecordSchemaReference.firstCall.firstArg).to.deep.include({
      digest: DIGEST,
      kind: 'save',
      schemaKind: 'update',
      oid: 'oid-1',
    });
    expect(putRecordSchemaReference.firstCall.firstArg).not.to.have.property('saveIdentity');
    expect(JSON.stringify(putRecordSchemaReference.firstCall.firstArg)).not.to.include('never-persist-this-secret');

    const invalid = await service.persistSaveUsageReference({
      ...request,
      saveIdentity: 'x'.repeat(513),
    });
    expect(invalid).to.deep.equal({
      kind: 'invalid-input',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
    });
    expect(putRecordSchemaReference.callCount).to.equal(2);
  });

  it('preserves typed save-reference storage failure semantics and contains hostile responses', async function () {
    const putRecordSchemaReference = sinon.stub();
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });
    const request = {
      digest: DIGEST,
      brand: 'brand-1',
      portal: 'portal-1',
      schemaKind: 'update',
      recordType: 'dataset',
      oid: 'oid-1',
      operation: 'submit',
      saveIdentity: 'audit-123',
    };
    putRecordSchemaReference.onFirstCall().resolves(storageResponse(false, 'record-schema.artifact-not-found'));
    putRecordSchemaReference.onSecondCall().resolves(
      new Proxy(new StorageServiceResponse(), {
        get: () => {
          throw new Error('hostile response');
        },
      })
    );

    const missingArtifact = await service.persistSaveUsageReference(request);
    const unreadableResponse = await service.persistSaveUsageReference(request);

    expect(missingArtifact).to.deep.include({
      kind: 'write-failed',
      stage: 'save-reference',
      failureKind: 'artifact-not-found',
      code: 'record-schema.artifact-not-found',
      retryable: false,
    });
    expect(unreadableResponse).to.deep.include({
      kind: 'write-failed',
      stage: 'save-reference',
      failureKind: 'storage-unavailable',
      code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
      retryable: true,
    });
    expect(putRecordSchemaReference.firstCall.firstArg).to.deep.equal(putRecordSchemaReference.secondCall.firstArg);
  });

  it('rejects the literal invalid save-reference operation publish now before storage', async function () {
    const putRecordSchemaReference = sinon.stub();
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });

    expect(
      await service.persistSaveUsageReference({
        digest: DIGEST,
        brand: 'brand-1',
        portal: 'portal-1',
        schemaKind: 'update',
        recordType: 'dataset',
        oid: 'oid-1',
        operation: 'publish now',
        saveIdentity: 'audit-123',
      })
    ).to.deep.equal({ kind: 'invalid-input', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST });
    expect(putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('snapshots config before validation so later hostile reads cannot escape typed results', async function () {
    const liveConfig = () => {
      const config = enabledConfig({ integrationPins: [] });
      let reads = 0;
      return new Proxy(config, {
        get: (target, property, receiver) => {
          reads += 1;
          if (reads > 1) throw new Error('config became hostile');
          return Reflect.get(target, property, receiver);
        },
      });
    };
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    const service = new Services.RecordSchema({
      getConfig: liveConfig,
      getStorageProvider: () => ({
        putRecordSchemaReference,
        getRecordSchemaArtifact: async () => null,
        listRecordSchemaReferences: async () => [],
      }),
    });

    expect(
      await service.persistSaveUsageReference({
        digest: DIGEST,
        brand: 'brand-1',
        portal: 'portal-1',
        schemaKind: 'update',
        recordType: 'dataset',
        oid: 'oid-1',
        operation: 'publish',
        saveIdentity: 'audit-123',
      })
    ).to.deep.include({ kind: 'recorded' });
    expect(await service.materializeIntegrationPins()).to.deep.equal({ kind: 'materialized', pins: [] });
    expect(
      await service.reportRetention({
        mode: 'targeted',
        digests: [DIGEST],
        now: new Date('2026-08-24T00:00:00.000Z'),
      })
    ).to.deep.include({ kind: 'reported', missingDigests: [DIGEST] });
  });

  it('returns total typed config outcomes for disabled, invalid, and hostile maintenance config', async function () {
    const putRecordSchemaReference = sinon.stub();
    const reportRequest = {
      mode: 'targeted',
      digests: [DIGEST],
      now: new Date('2026-08-24T00:00:00.000Z'),
    } as const;
    const disabled = new Services.RecordSchema({
      getConfig: () => ({ ...enabledConfig(), enabled: false }),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });
    const invalid = new Services.RecordSchema({
      getConfig: () => enabledConfig({ cacheMaxEntries: 0 }),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });
    const hostileConfig = new Proxy(enabledConfig(), {
      get: () => {
        throw new Error('hostile config');
      },
    });
    const hostile = new Services.RecordSchema({
      getConfig: () => hostileConfig,
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });

    expect(await disabled.materializeIntegrationPins()).to.deep.equal({
      kind: 'disabled',
      code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
    });
    expect(await disabled.reportRetention(reportRequest)).to.deep.equal({
      kind: 'disabled',
      code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
    });
    expect(await invalid.materializeIntegrationPins()).to.deep.equal({
      kind: 'unavailable',
      stage: 'configuration',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    });
    expect(await hostile.materializeIntegrationPins()).to.deep.equal({
      kind: 'unavailable',
      stage: 'configuration',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    });
    expect(await hostile.reportRetention(reportRequest)).to.deep.equal({
      kind: 'unavailable',
      stage: 'configuration',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
    });
    expect(putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('caps configured pins before hashing or storage work', async function () {
    const putRecordSchemaReference = sinon.stub();
    const integrationPins = Array.from({ length: MAX_RECORD_SCHEMA_INTEGRATION_PINS + 1 }, (_, index) =>
      validPin({ owner: `owner-${index}` })
    );
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig({ integrationPins }),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });

    expect(await service.materializeIntegrationPins()).to.deep.equal({
      kind: 'limit-exceeded',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
      maximum: MAX_RECORD_SCHEMA_INTEGRATION_PINS,
    });
    expect(putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('caps actual configured pin iteration when array length is deceptive', async function () {
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    const integrationPins = zeroLengthArrayYielding(
      Array.from({ length: MAX_RECORD_SCHEMA_INTEGRATION_PINS + 1 }, (_, index) =>
        validPin({ owner: `owner-${index}` })
      )
    );
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig({ integrationPins }),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });

    expect(await service.materializeIntegrationPins()).to.deep.equal({
      kind: 'limit-exceeded',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
      maximum: MAX_RECORD_SCHEMA_INTEGRATION_PINS,
    });
    expect(putRecordSchemaReference.notCalled).to.equal(true);
  });

  it('requires canonical timezone-qualified pin expiries and canonical operation names', async function () {
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    for (const pin of [
      validPin({ expiresAt: '2027-01-01T00:00:00.000', operation: 'strict-all' }),
      validPin({ expiresAt: '2027-01-01T00:00:00.000Z', operation: '__strict_all__' }),
      validPin({ expiresAt: '2027-01-01T00:00:00.000Z', operation: 'publish now' }),
    ]) {
      const service = new Services.RecordSchema({
        getConfig: () => enabledConfig({ integrationPins: [pin] }),
        getStorageProvider: () => ({ putRecordSchemaReference }),
      });
      expect(await service.materializeIntegrationPins()).to.deep.equal({
        kind: 'unavailable',
        stage: 'configuration',
        code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
      });
    }

    const priorTimezone = process.env.TZ;
    try {
      const references: RecordSchemaReferenceModel[] = [];
      const captureReference = sinon.stub().callsFake(async reference => {
        references.push({
          ...reference,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
        });
        return storageResponse(true);
      });
      const config = enabledConfig({
        integrationPins: [
          validPin({ expiresAt: '2027-01-01T00:00:00.000Z', operation: ' strict-all ' }),
          validPin({ expiresAt: '2027-01-01T10:30:00.000+10:30', operation: 'strict-all' }),
        ],
      });
      process.env.TZ = 'UTC';
      await new Services.RecordSchema({
        getConfig: () => config,
        getStorageProvider: () => ({ putRecordSchemaReference: captureReference }),
      }).materializeIntegrationPins();
      process.env.TZ = 'Australia/Adelaide';
      await new Services.RecordSchema({
        getConfig: () => config,
        getStorageProvider: () => ({ putRecordSchemaReference: captureReference }),
      }).materializeIntegrationPins();

      expect(captureReference.callCount).to.equal(2);
      expect(captureReference.firstCall.firstArg).to.deep.equal(captureReference.secondCall.firstArg);
      expect(captureReference.firstCall.firstArg.operation).to.equal('strict-all');
      expect(captureReference.firstCall.firstArg.expiresAt).to.deep.equal(new Date('2027-01-01T00:00:00.000Z'));
    } finally {
      process.env.TZ = priorTimezone;
    }
    expect(JSON.stringify(putRecordSchemaReference.args)).not.to.include('2027-01-01T00:00:00.000');
  });

  it('materializes configured pins in stable order, deduplicates retries, and redacts extra secret fields', async function () {
    const putRecordSchemaReference = sinon.stub().resolves(storageResponse(true));
    const secondDigest = 'b'.repeat(64);
    const firstPin = validPin({
      owner: 'owner-a',
      purpose: 'Retain integration A.',
      rawClientSecret: 'pin-secret-must-not-leak',
    });
    const secondPin = validPin({
      digest: secondDigest,
      owner: 'owner-b',
      purpose: 'Retain integration B.',
      expiresAt: undefined,
    });
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig({ integrationPins: [secondPin, firstPin, { ...secondPin }] }),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });

    const first = await service.materializeIntegrationPins();
    const second = await service.materializeIntegrationPins();

    expect(first.kind).to.equal('materialized');
    expect(second).to.deep.equal(first);
    if (first.kind !== 'materialized') {
      throw new Error('Expected configured integration pins to materialize.');
    }
    expect(first.pins).to.have.length(2);
    expect(first.pins.map(pin => pin.referenceKey)).to.deep.equal([...first.pins.map(pin => pin.referenceKey)].sort());
    expect(putRecordSchemaReference.callCount).to.equal(4);
    expect(putRecordSchemaReference.firstCall.firstArg.referenceKey).to.equal(first.pins[0].referenceKey);
    expect(putRecordSchemaReference.secondCall.firstArg.referenceKey).to.equal(first.pins[1].referenceKey);
    expect(putRecordSchemaReference.thirdCall.firstArg).to.deep.equal(putRecordSchemaReference.firstCall.firstArg);
    expect(putRecordSchemaReference.getCall(3).firstArg).to.deep.equal(putRecordSchemaReference.secondCall.firstArg);
    expect(JSON.stringify(first)).not.to.include('pin-secret-must-not-leak');
    expect(JSON.stringify(putRecordSchemaReference.args)).not.to.include('pin-secret-must-not-leak');
  });

  it('reports partial pin writes with their exact permanent and retryable failure semantics', async function () {
    const putRecordSchemaReference = sinon.stub();
    putRecordSchemaReference.onFirstCall().resolves(storageResponse(false, 'record-schema.reference-key-collision'));
    putRecordSchemaReference.onSecondCall().rejects(new Error('temporary outage'));
    const service = new Services.RecordSchema({
      getConfig: () =>
        enabledConfig({
          integrationPins: [validPin({ owner: 'one' }), validPin({ owner: 'two' })],
        }),
      getStorageProvider: () => ({ putRecordSchemaReference }),
    });

    const result = await service.materializeIntegrationPins();

    expect(result.kind).to.equal('failed');
    if (result.kind !== 'failed') throw new Error('Expected partial pin write failure.');
    expect(
      result.pins.map(pin => ({
        status: pin.status,
        ...('code' in pin
          ? {
              code: pin.code,
              failureKind: pin.failureKind,
              retryable: pin.retryable,
            }
          : {}),
      }))
    ).to.deep.equal([
      {
        status: 'write-failed',
        code: RECORD_SCHEMA_PROBLEM_CODES.REFERENCE_KEY_COLLISION,
        failureKind: 'reference-key-collision',
        retryable: false,
      },
      {
        status: 'write-failed',
        code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        failureKind: 'storage-unavailable',
        retryable: true,
      },
    ]);
    expect(putRecordSchemaReference.callCount).to.equal(2);
  });

  it('bounds retention input and reference overflow without destructive or excess reads', async function () {
    const digest = 'e'.repeat(64);
    const getRecordSchemaArtifact = sinon.stub().resolves({
      digest,
      document: { type: 'object' },
      contractFormat: 'redbox-record-contract/1',
      completeness: 'complete',
      byteLength: 17,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    });
    const reference = {
      referenceKey: 'save',
      digest,
      brand: 'brand',
      portal: 'portal',
      kind: 'save' as const,
      schemaKind: 'update' as const,
      recordType: 'dataset',
      operation: 'submit',
      oid: 'oid',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const listRecordSchemaReferences = sinon.stub();
    listRecordSchemaReferences.onFirstCall().resolves(Array.from({ length: 1_000 }, () => reference));
    listRecordSchemaReferences.onSecondCall().resolves([reference]);
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ getRecordSchemaArtifact, listRecordSchemaReferences }),
    });

    expect(
      await service.reportRetention({
        mode: 'targeted',
        digests: Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(64, '0')),
        now: new Date('2026-08-24T00:00:00.000Z'),
      })
    ).to.deep.equal({
      kind: 'invalid-input',
      reason: 'limit',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
    });
    expect(getRecordSchemaArtifact.notCalled).to.equal(true);

    expect(
      await service.reportRetention({
        mode: 'targeted',
        digests: [digest],
        now: new Date('2026-08-24T00:00:00.000Z'),
      })
    ).to.deep.equal({
      kind: 'limit-exceeded',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
      digest,
    });
    expect(listRecordSchemaReferences.args.map(args => args[0])).to.deep.equal([
      { digest, includeExpiredPins: true, limit: 1_000, offset: 0 },
      { digest, includeExpiredPins: true, limit: 1, offset: 1_000 },
    ]);
  });

  it('bounds actual digest and reference iteration when array lengths are deceptive', async function () {
    const getRecordSchemaArtifact = sinon.stub().resolves(null);
    const noReadService = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ getRecordSchemaArtifact, listRecordSchemaReferences: sinon.stub() }),
    });
    const deceptiveDigests = zeroLengthArrayYielding(
      Array.from({ length: 101 }, (_, index) => index.toString(16).padStart(64, '0'))
    );

    expect(
      await noReadService.reportRetention({
        mode: 'targeted',
        digests: deceptiveDigests,
        now: new Date('2026-08-24T00:00:00.000Z'),
      })
    ).to.deep.equal({
      kind: 'invalid-input',
      reason: 'limit',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
    });
    expect(getRecordSchemaArtifact.notCalled).to.equal(true);

    const reference = {
      referenceKey: 'grant',
      digest: DIGEST,
      brand: 'brand',
      portal: 'portal',
      kind: 'grant' as const,
      schemaKind: 'create' as const,
      recordType: 'dataset',
      operation: 'strict-all',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const listRecordSchemaReferences = sinon
      .stub()
      .resolves(zeroLengthArrayYielding(Array.from({ length: 1_001 }, () => reference)));
    const boundedService = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({
        getRecordSchemaArtifact: async () => ({
          digest: DIGEST,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        listRecordSchemaReferences,
      }),
    });

    expect(
      await boundedService.reportRetention({
        mode: 'targeted',
        digests: [DIGEST],
        now: new Date('2026-08-24T00:00:00.000Z'),
      })
    ).to.deep.equal({
      kind: 'limit-exceeded',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
      digest: DIGEST,
    });
    expect(listRecordSchemaReferences.calledOnce).to.equal(true);
  });

  it('rejects incomplete persisted references instead of treating them as retention evidence', async function () {
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({
        getRecordSchemaArtifact: async () => ({
          digest: DIGEST,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        listRecordSchemaReferences: async () => [{ digest: DIGEST, kind: 'grant' }],
      }),
    });

    expect(
      await service.reportRetention({
        mode: 'targeted',
        digests: [DIGEST],
        now: new Date('2026-08-24T00:00:00.000Z'),
      })
    ).to.deep.equal({ kind: 'invalid-state', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
  });

  it('rejects discriminator-specific forbidden reference fields', async function () {
    const storedAt = new Date('2026-01-01T00:00:00.000Z');
    const common = {
      digest: DIGEST,
      brand: 'brand',
      portal: 'portal',
      recordType: 'dataset',
      operation: 'publish',
      createdAt: storedAt,
      updatedAt: storedAt,
    };
    const save = {
      ...common,
      referenceKey: `save:${'a'.repeat(64)}`,
      kind: 'save',
      schemaKind: 'update',
      oid: 'oid',
    };
    const malformedReferences = [
      { ...save, owner: 'forbidden-owner' },
      { ...save, purpose: 'forbidden-purpose' },
      { ...save, expiresAt: new Date('2027-01-01T00:00:00.000Z') },
      {
        ...common,
        referenceKey: 'grant:create:forbidden-oid',
        kind: 'grant',
        schemaKind: 'create',
        oid: 'forbidden-oid',
      },
      {
        ...common,
        referenceKey: 'pin:forbidden-oid',
        kind: 'pin',
        schemaKind: 'update',
        oid: 'forbidden-oid',
        owner: 'integration-owner',
        purpose: 'integration-purpose',
      },
    ];

    const results = await Promise.all(
      malformedReferences.map(reference =>
        new Services.RecordSchema({
          getConfig: () => enabledConfig(),
          getStorageProvider: () => ({
            getRecordSchemaArtifact: async () => ({ digest: DIGEST, createdAt: storedAt }),
            listRecordSchemaReferences: async () => [reference],
          }),
        }).reportRetention({
          mode: 'targeted',
          digests: [DIGEST],
          now: new Date('2026-08-24T00:00:00.000Z'),
        })
      )
    );

    expect(results).to.deep.equal(
      malformedReferences.map(() => ({
        kind: 'invalid-state',
        code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
      }))
    );
  });

  it('rejects a persisted referenceKey outside the canonical storage grammar', async function () {
    const storedAt = new Date('2026-01-01T00:00:00.000Z');
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({
        getRecordSchemaArtifact: async () => ({ digest: DIGEST, createdAt: storedAt }),
        listRecordSchemaReferences: async () => [
          {
            referenceKey: 'bad key',
            digest: DIGEST,
            brand: 'brand',
            portal: 'portal',
            kind: 'save',
            schemaKind: 'update',
            recordType: 'dataset',
            operation: 'publish',
            oid: 'oid',
            createdAt: storedAt,
            updatedAt: storedAt,
          },
        ],
      }),
    });

    expect(
      await service.reportRetention({
        mode: 'targeted',
        digests: [DIGEST],
        now: new Date('2026-08-24T00:00:00.000Z'),
      })
    ).to.deep.equal({ kind: 'invalid-state', code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT });
  });

  it('contains throwing storage and hostile artifact/reference models as typed retention results', async function () {
    const request = {
      mode: 'targeted',
      digests: [DIGEST],
      now: new Date('2026-08-24T00:00:00.000Z'),
    } as const;
    const throwing = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({
        getRecordSchemaArtifact: async () => {
          throw new Error('storage failed');
        },
        listRecordSchemaReferences: sinon.stub(),
      }),
    });
    expect(await throwing.reportRetention(request)).to.deep.equal({
      kind: 'unavailable',
      stage: 'storage',
      code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
    });

    const hostileArtifact = new Proxy(
      {},
      {
        getOwnPropertyDescriptor: () => {
          throw new Error('hostile artifact');
        },
      }
    );
    const malformedArtifact = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({
        getRecordSchemaArtifact: async () => hostileArtifact,
        listRecordSchemaReferences: async () => [],
      }),
    });
    expect(await malformedArtifact.reportRetention(request)).to.deep.equal({
      kind: 'invalid-state',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
    });

    const hostileReferences = new Proxy([], {
      get: (target, property, receiver) => {
        if (property === 'length') throw new Error('hostile references');
        return Reflect.get(target, property, receiver);
      },
    });
    const malformedReferences = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({
        getRecordSchemaArtifact: async () => ({
          digest: DIGEST,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
        }),
        listRecordSchemaReferences: async () => hostileReferences,
      }),
    });
    expect(await malformedReferences.reportRetention(request)).to.deep.equal({
      kind: 'invalid-state',
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
    });
  });

  it('paginates storage-owned artifact summaries with stable cursors and bounded redacted output', async function () {
    const now = new Date('2026-08-24T00:00:00.000Z');
    const digests = ['a'.repeat(64), 'b'.repeat(64), 'c'.repeat(64)];
    const artifacts = digests.map((digest, index) => ({
      digest,
      createdAt: new Date(`2026-0${index + 1}-01T00:00:00.000Z`),
      document: { title: `private-schema-${index}` },
    }));
    const listRecordSchemaArtifacts = sinon
      .stub()
      .callsFake(async (query: { afterDigest?: string; limit: number }) =>
        artifacts.filter(artifact => !query.afterDigest || artifact.digest > query.afterDigest).slice(0, query.limit)
      );
    const listRecordSchemaReferences = sinon.stub().resolves([]);
    const deleteRecordSchemaArtifactIfUnreferenced = sinon.stub();
    const service = new Services.RecordSchema({
      getConfig: () => enabledConfig({ retention: { minimumAgeDays: 30 } }),
      getStorageProvider: () => ({
        listRecordSchemaArtifacts,
        listRecordSchemaReferences,
        deleteRecordSchemaArtifactIfUnreferenced,
      }),
    });

    const first = await service.reportRetention({ mode: 'paginated', now, limit: 2 });
    const repeated = await service.reportRetention({ mode: 'paginated', now, limit: 2 });
    const second = await service.reportRetention({ mode: 'paginated', now, limit: 2, cursor: digests[1] });

    expect(repeated).to.deep.equal(first);
    expect(first).to.deep.include({
      kind: 'reported',
      minimumAgeDays: 30,
      missingDigests: [],
      page: { limit: 2, nextCursor: digests[1] },
    });
    expect(second).to.deep.include({
      kind: 'reported',
      missingDigests: [],
      page: { limit: 2 },
    });
    if (first.kind !== 'reported' || second.kind !== 'reported') {
      throw new Error('Expected paginated retention reports.');
    }
    expect(first.entries.map(entry => entry.digest)).to.deep.equal(digests.slice(0, 2));
    expect(second.entries.map(entry => entry.digest)).to.deep.equal(digests.slice(2));
    expect(listRecordSchemaArtifacts.args.map(args => args[0])).to.deep.equal([
      { limit: 3 },
      { limit: 3 },
      { afterDigest: digests[1], limit: 3 },
    ]);
    expect(JSON.stringify([first, second])).not.to.include('private-schema');
    expect(deleteRecordSchemaArtifactIfUnreferenced.notCalled).to.equal(true);

    expect(
      await service.reportRetention({
        mode: 'paginated',
        now,
        limit: RECORD_SCHEMA_RETENTION_REPORT_MAX_PAGE_SIZE + 1,
      })
    ).to.deep.equal({
      kind: 'invalid-input',
      reason: 'limit',
      code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
    });
    expect(await service.reportRetention({ mode: 'paginated', now })).to.deep.include({
      kind: 'reported',
      page: { limit: RECORD_SCHEMA_RETENTION_REPORT_DEFAULT_PAGE_SIZE },
    });
  });

  it('reports retention reasons and deletion eligibility deterministically without documents or deletion calls', async function () {
    const now = new Date('2026-08-24T00:00:00.000Z');
    const digestA = 'a'.repeat(64);
    const digestB = 'b'.repeat(64);
    const digestC = 'c'.repeat(64);
    const missingDigest = 'd'.repeat(64);
    const artifact = (digest: string, createdAt: string): RecordSchemaArtifactModel => ({
      digest,
      document: { type: 'object', title: `private-${digest.slice(0, 1)}` },
      contractFormat: 'redbox-record-contract/1',
      completeness: 'complete',
      byteLength: 37,
      createdAt: new Date(createdAt),
      updatedAt: new Date(createdAt),
    });
    const artifacts = new Map<string, RecordSchemaArtifactModel>([
      [digestA, artifact(digestA, '2026-08-14T00:00:00.000Z')],
      [digestB, artifact(digestB, '2026-01-01T00:00:00.000Z')],
      [digestC, artifact(digestC, '2026-01-01T00:00:00.000Z')],
    ]);
    const storedAt = new Date('2026-01-01T00:00:00.000Z');
    const references = new Map<string, RecordSchemaReferenceModel[]>([
      [
        digestA,
        [
          {
            referenceKey: 'save-a',
            digest: digestA,
            brand: 'brand-1',
            portal: 'portal-1',
            kind: 'save',
            schemaKind: 'update',
            recordType: 'dataset',
            operation: 'submit',
            oid: 'private-oid',
            createdAt: storedAt,
            updatedAt: storedAt,
          },
          {
            referenceKey: 'grant-a',
            digest: digestA,
            brand: 'brand-1',
            portal: 'portal-1',
            kind: 'grant',
            schemaKind: 'create',
            recordType: 'dataset',
            operation: 'strict-all',
            createdAt: storedAt,
            updatedAt: storedAt,
          },
          {
            referenceKey: 'pin-a',
            digest: digestA,
            brand: 'brand-1',
            portal: 'portal-1',
            kind: 'pin',
            schemaKind: 'create',
            recordType: 'dataset',
            operation: 'strict-all',
            owner: 'integration-owner',
            purpose: 'private-pin-purpose',
            expiresAt: new Date('2027-01-01T00:00:00.000Z'),
            createdAt: storedAt,
            updatedAt: storedAt,
          },
        ],
      ],
      [
        digestB,
        [
          {
            referenceKey: 'expired-pin-b',
            digest: digestB,
            brand: 'brand-1',
            portal: 'portal-1',
            kind: 'pin',
            schemaKind: 'create',
            recordType: 'dataset',
            operation: 'strict-all',
            owner: 'integration-owner',
            purpose: 'expired-private-purpose',
            expiresAt: new Date('2026-01-02T00:00:00.000Z'),
            createdAt: storedAt,
            updatedAt: storedAt,
          },
        ],
      ],
      [digestC, []],
    ]);
    const getRecordSchemaArtifact = sinon.stub().callsFake(async (digest: string) => artifacts.get(digest) ?? null);
    const listRecordSchemaReferences = sinon
      .stub()
      .callsFake(async (query: { digest?: string }) => references.get(query.digest ?? '') ?? []);
    const deleteRecordSchemaArtifactIfUnreferenced = sinon.stub();
    const service = new Services.RecordSchema({
      getConfig: () =>
        enabledConfig({
          retention: { minimumAgeDays: 30 },
        }),
      getStorageProvider: () => ({
        getRecordSchemaArtifact,
        listRecordSchemaReferences,
        deleteRecordSchemaArtifactIfUnreferenced,
      }),
    });
    const request = {
      mode: 'targeted',
      digests: [digestC, digestA, missingDigest, digestB, digestA],
      now,
    } as const;

    const first = await service.reportRetention(request);
    const second = await service.reportRetention(request);

    expect(first.kind).to.equal('reported');
    expect(second).to.deep.equal(first);
    if (first.kind !== 'reported') {
      throw new Error('Expected a deterministic retention report.');
    }
    expect(first.entries.map(entry => entry.digest)).to.deep.equal([digestA, digestB, digestC]);
    expect(first.missingDigests).to.deep.equal([missingDigest]);
    expect(first.entries[0]).to.deep.include({
      ageDays: 10,
      grantCount: 1,
      saveCount: 1,
      activePinCount: 1,
      reasons: ['minimum-age', 'grant-reference', 'save-reference', 'active-pin'],
      eligibleForDeletion: false,
    });
    expect(first.entries[1]).to.deep.include({
      grantCount: 0,
      saveCount: 0,
      activePinCount: 0,
      reasons: [],
      eligibleForDeletion: true,
    });
    expect(first.entries[2]).to.deep.include({
      reasons: [],
      eligibleForDeletion: true,
    });
    expect(JSON.stringify(first)).not.to.include('private-pin-purpose');
    expect(JSON.stringify(first)).not.to.include('private-oid');
    expect(deleteRecordSchemaArtifactIfUnreferenced.notCalled).to.equal(true);
    expect(listRecordSchemaReferences.args.map(args => args[0])).to.deep.equal([
      { digest: digestA, includeExpiredPins: true, limit: 1_000, offset: 0 },
      { digest: digestB, includeExpiredPins: true, limit: 1_000, offset: 0 },
      { digest: digestC, includeExpiredPins: true, limit: 1_000, offset: 0 },
      { digest: digestA, includeExpiredPins: true, limit: 1_000, offset: 0 },
      { digest: digestB, includeExpiredPins: true, limit: 1_000, offset: 0 },
      { digest: digestC, includeExpiredPins: true, limit: 1_000, offset: 0 },
    ]);
  });
});

describe('RecordSchemaService telemetry', function () {
  const createRequest = {
    brand: 'brand-1',
    portal: 'portal-1',
    recordType: 'dataset',
    caller: updateCaller(),
  } as const;

  beforeEach(function () {
    clearCapturedOpenTelemetryMeasurements();
  });

  afterEach(function () {
    sinon.restore();
    clearCapturedOpenTelemetryMeasurements();
  });

  it('emits exact low-cardinality compile, cache, resolver, validation, and persistence metrics', async function () {
    const resolutionClock = sinon.stub();
    resolutionClock.onFirstCall().returns(10);
    resolutionClock.onSecondCall().returns(17);
    const fixture = createResolutionFixture({ clock: resolutionClock });

    const resolved = await fixture.service.resolveCreate(createRequest);
    if (resolved.kind !== 'resolved') throw new Error('Expected a resolved schema for telemetry coverage.');

    const validationClock = sinon.stub();
    validationClock.onFirstCall().returns(20);
    validationClock.onSecondCall().returns(25);
    const validator = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      clock: validationClock,
    });
    const validationRequest = {
      digest: resolved.digest,
      schemaKind: 'create',
      document: resolved.document,
    } as const;

    expect(validator.validateResolvedArtifact({ ...validationRequest, input: { title: 'safe' } })).to.deep.equal({
      kind: 'validated',
      valid: true,
      issues: [],
      truncated: false,
    });
    const invalid = validator.validateResolvedArtifact({ ...validationRequest, input: { title: 42 } });
    expect(invalid.kind).to.equal('validated');
    if (invalid.kind !== 'validated' || invalid.valid)
      throw new Error('Expected a typed structural validation failure.');
    expect(invalid.issues.map(issue => issue.code)).to.deep.equal([RECORD_SCHEMA_PROBLEM_CODES.TYPE]);

    expect(getCapturedOpenTelemetryMeasurements()).to.deep.equal([
      {
        name: 'redbox.record_schema.compile.duration',
        value: 7,
        attributes: { schema_kind: 'create', phase: 'resolution', outcome: 'resolved' },
      },
      {
        name: 'redbox.record_schema.compile.outcomes',
        value: 1,
        attributes: { schema_kind: 'create', phase: 'resolution', outcome: 'resolved' },
      },
      {
        name: 'redbox.record_schema.persistence',
        value: 1,
        attributes: { resource: 'artifact', outcome: 'persisted', code: 'none' },
      },
      {
        name: 'redbox.record_schema.persistence',
        value: 1,
        attributes: { resource: 'grant', outcome: 'persisted', code: 'none' },
      },
      {
        name: 'redbox.record_schema.resolver.outcomes',
        value: 1,
        attributes: { schema_kind: 'create', outcome: 'resolved' },
      },
      {
        name: 'redbox.record_schema.completeness',
        value: 1,
        attributes: { schema_kind: 'create', completeness: 'complete' },
      },
      {
        name: 'redbox.record_schema.cache.results',
        value: 1,
        attributes: { schema_kind: 'create', result: 'miss' },
      },
      {
        name: 'redbox.record_schema.compile.duration',
        value: 5,
        attributes: { schema_kind: 'create', phase: 'validation', outcome: 'resolved' },
      },
      {
        name: 'redbox.record_schema.compile.outcomes',
        value: 1,
        attributes: { schema_kind: 'create', phase: 'validation', outcome: 'resolved' },
      },
      {
        name: 'redbox.record_schema.validation.results',
        value: 1,
        attributes: { schema_kind: 'create', result: 'valid' },
      },
      {
        name: 'redbox.record_schema.cache.results',
        value: 1,
        attributes: { schema_kind: 'create', result: 'hit' },
      },
      {
        name: 'redbox.record_schema.validation.results',
        value: 1,
        attributes: { schema_kind: 'create', result: 'invalid' },
      },
      {
        name: 'redbox.record_schema.validation.problems',
        value: 1,
        attributes: { schema_kind: 'create', code: RECORD_SCHEMA_PROBLEM_CODES.TYPE },
      },
    ]);
  });

  it('emits precondition and usage-reference metrics without sensitive attributes', async function () {
    const update = updateResolutionFixture();
    const precondition = await update.service.resolveUpdate({
      brand: 'brand-1',
      portal: 'portal-1',
      oid: 'private-oid',
      caller: updateCaller(),
      ifMatch: `"sha256:${'b'.repeat(64)}"`,
    });
    expect(precondition.kind).to.equal('precondition-failed');

    const save = new Services.RecordSchema({
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({ putRecordSchemaReference: async () => storageResponse(true) }),
    });
    const usage = await save.persistSaveUsageReference({
      digest: DIGEST,
      brand: 'brand',
      portal: 'portal',
      schemaKind: 'update',
      recordType: 'dataset',
      operation: 'publish',
      oid: 'private-oid',
      saveIdentity: 'private-save-identity',
    });
    expect(usage.kind).to.equal('recorded');

    const relevant = getCapturedOpenTelemetryMeasurements().filter(measurement =>
      ['redbox.record_schema.precondition.mismatches', 'redbox.record_schema.usage_references'].includes(
        measurement.name
      )
    );
    expect(relevant).to.deep.equal([
      {
        name: 'redbox.record_schema.precondition.mismatches',
        value: 1,
        attributes: { schema_kind: 'update', condition: 'if-match' },
      },
      {
        name: 'redbox.record_schema.usage_references',
        value: 1,
        attributes: { reference_kind: 'save', outcome: 'recorded', code: 'none' },
      },
    ]);
    expect(JSON.stringify(relevant)).not.to.include('private-oid');
    expect(JSON.stringify(relevant)).not.to.include(DIGEST);
    expect(JSON.stringify(relevant)).not.to.include('private-save-identity');
  });

  it('logs unexpected maintenance and startup failures with safe fixed context only', async function () {
    const telemetryLogger = { info: sinon.stub(), error: sinon.stub() };
    const secret = 'private-oid alice@example.test secret-save-identity';
    lifecycleService({ telemetryLogger }).init();
    const maintenance = new Services.RecordSchema({
      telemetryLogger,
      getConfig: () => enabledConfig(),
      getStorageProvider: () => ({
        putRecordSchemaReference: async () => {
          throw new Error(secret);
        },
      }),
    });
    await maintenance.persistSaveUsageReference({
      digest: DIGEST,
      brand: 'brand',
      portal: 'portal',
      schemaKind: 'update',
      recordType: 'dataset',
      operation: 'publish',
      oid: 'private-oid',
      saveIdentity: 'secret-save-identity',
    });

    const startup = lifecycleService({
      telemetryLogger,
      getConfig: () => {
        throw new Error(secret);
      },
    });
    captureLifecycleError(() => startup.init());

    expect(telemetryLogger.error.args).to.deep.equal([
      [
        'record_schema_unexpected_failure',
        {
          event: 'record_schema_unexpected_failure',
          context: 'save-reference-storage',
          error_type: 'error',
        },
      ],
      [
        'record_schema_unexpected_failure',
        {
          event: 'record_schema_unexpected_failure',
          context: 'startup-configuration',
          error_type: 'error',
        },
      ],
    ]);
    expect(telemetryLogger.info.args).to.deep.equal([
      [
        'record_schema_startup_check',
        { event: 'record_schema_startup_check', context: 'lifecycle', status: 'passed', finding_count: 0 },
      ],
      [
        'record_schema_startup_check',
        { event: 'record_schema_startup_check', context: 'lifecycle', status: 'failed', finding_count: 1 },
      ],
    ]);
    expect(JSON.stringify({ errors: telemetryLogger.error.args, info: telemetryLogger.info.args })).not.to.include(
      secret
    );
  });

  it('caps startup finding counts and marks overflow without changing lifecycle findings', function () {
    const telemetryLogger = { info: sinon.stub(), error: sinon.stub() };
    const findingTotal = RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX + 1;
    const service = lifecycleService({
      telemetryLogger,
      getContributorRegistrationIssues: () =>
        Array.from({ length: findingTotal }, (_, index) => ({
          code: RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
          key: `DuplicateComponent${index}`,
          detail: 'Duplicate component registration.',
        })),
    });

    const error = captureLifecycleError(() => service.init());

    expect(error.findings).to.have.length(findingTotal);
    expect(telemetryLogger.info.args).to.deep.equal([
      [
        'record_schema_startup_check',
        {
          event: 'record_schema_startup_check',
          context: 'lifecycle',
          status: 'failed',
          finding_count: RECORD_SCHEMA_STARTUP_LOG_FINDING_COUNT_MAX,
          finding_count_bucket: 'overflow',
        },
      ],
    ]);
  });

  it('logs every converted resolver and storage exception with an exact safe context', async function () {
    const telemetryLogger = { info: sinon.stub(), error: sinon.stub() };
    const secret = 'private-oid alice@example.test raw-error-text';
    const caller = updateCaller();
    const seed = await createImmutableSeed();
    const request: ResolveImmutableRecordSchemaRequest = {
      brand: 'brand-1',
      portal: 'portal-1',
      digest: seed.artifact.digest,
      caller,
    };
    const immutableStorage = (
      getRecordSchemaArtifact: () => Promise<RecordSchemaArtifactModel>,
      findRecordSchemaGrantForAuthorization: () => Promise<unknown>,
      touchRecordSchemaArtifact: () => Promise<StorageServiceResponse>
    ) => ({ getRecordSchemaArtifact, findRecordSchemaGrantForAuthorization, touchRecordSchemaArtifact });

    await new Services.RecordSchema({
      telemetryLogger,
      getConfig: () => enabledConfig(),
      getStorageProvider: () => {
        throw new Error(secret);
      },
    }).resolveImmutable(request);
    await new Services.RecordSchema({
      telemetryLogger,
      getConfig: () => enabledConfig(),
      getStorageProvider: () =>
        immutableStorage(
          async () => {
            throw new Error(secret);
          },
          async () => null,
          async () => storageResponse(true)
        ),
    }).resolveImmutable(request);
    await new Services.RecordSchema({
      telemetryLogger,
      getConfig: () => enabledConfig(),
      getStorageProvider: () =>
        immutableStorage(
          async () => seed.artifact,
          async () => {
            throw new Error(secret);
          },
          async () => storageResponse(true)
        ),
    }).resolveImmutable(request);
    const touchFailure = immutableResolutionFixture(seed, {
      telemetryLogger,
      getStorageProvider: () =>
        immutableStorage(
          async () => seed.artifact,
          async () => seed.grant,
          async () => {
            throw new Error(secret);
          }
        ),
    });
    await touchFailure.service.resolveImmutable(request);

    await new Services.RecordSchema({
      telemetryLogger,
      getConfig: () => enabledConfig(),
      getStorageProvider: () => {
        throw new Error(secret);
      },
    }).persistSaveUsageReference({
      digest: DIGEST,
      brand: 'brand',
      portal: 'portal',
      schemaKind: 'update',
      recordType: 'dataset',
      operation: 'publish',
      oid: 'private-oid',
      saveIdentity: 'private-save-identity',
    });
    await new Services.RecordSchema({
      telemetryLogger,
      getConfig: () => enabledConfig({ integrationPins: [validPin()] }),
      getStorageProvider: () => {
        throw new Error(secret);
      },
    }).materializeIntegrationPins();
    await createResolutionFixture({
      telemetryLogger,
      getStorageProvider: () => {
        throw new Error(secret);
      },
    }).service.resolveCreate(createRequest);

    expect(telemetryLogger.error.args).to.deep.equal(
      [
        'resolve-immutable-storage-provider',
        'resolve-immutable-artifact-read',
        'resolve-immutable-grant-list',
        'resolve-immutable-artifact-touch',
        'save-reference-storage-provider',
        'integration-pin-storage-provider',
        'persist-storage-provider',
      ].map(context => [
        'record_schema_unexpected_failure',
        { event: 'record_schema_unexpected_failure', context, error_type: 'error' },
      ])
    );
    expect(telemetryLogger.info.args).to.deep.equal([]);
    expect(JSON.stringify(telemetryLogger.error.args)).not.to.include(secret);
    expect(JSON.stringify(telemetryLogger.error.args)).not.to.include(DIGEST);
  });

  it('keeps typed results, lifecycle errors, and startup ordering when CoreService logger acquisition throws', async function () {
    const restoreSails = ensureTestSails();
    const testSails = Reflect.get(global, 'sails') as { config: Record<string, unknown> };
    const safeLogger = { info: sinon.stub(), error: sinon.stub() };
    const secret = 'logger-factory private-oid raw-error-text';
    const saveRequest = {
      digest: DIGEST,
      brand: 'brand',
      portal: 'portal',
      schemaKind: 'update',
      recordType: 'dataset',
      operation: 'publish',
      oid: 'private-oid',
      saveIdentity: 'private-save-identity',
    } as const;
    const storageFailure = () => ({
      putRecordSchemaReference: async () => {
        throw new Error(secret);
      },
    });
    const priorLogConfig = Reflect.get(testSails.config, 'log');
    Reflect.set(testSails.config, 'log', {});
    try {
      const baselineSave = new Services.RecordSchema({
        telemetryLogger: safeLogger,
        getConfig: () => enabledConfig(),
        getStorageProvider: storageFailure,
      });
      const throwingSave = new Services.RecordSchema({
        getConfig: () => enabledConfig(),
        getStorageProvider: storageFailure,
      });
      const baselineLifecycle = lifecycleService({
        telemetryLogger: safeLogger,
        getConfig: () => {
          throw new Error(secret);
        },
      });
      const throwingLifecycle = lifecycleService({
        getConfig: () => {
          throw new Error(secret);
        },
      });
      const throwingSuccessfulLifecycle = lifecycleService();
      const startupEvents: string[] = [];
      const throwingStartup = lifecycleService({
        getConfig: () => enabledConfig({ integrationPins: [validPin()] }),
        getStorageProvider: () => ({
          putRecordSchemaReference: async () => {
            startupEvents.push('pin-write');
            throw new Error(secret);
          },
        }),
      });

      await new Promise<void>(resolve => setImmediate(resolve));
      const throwingLoggerFactory = sinon.stub().throws(new Error(secret));
      Reflect.set(testSails.config, 'log', {
        createNamespaceLogger: throwingLoggerFactory,
        customLogger: {},
      });
      const baselineResult = await baselineSave.persistSaveUsageReference(saveRequest);
      const throwingResult = await throwingSave.persistSaveUsageReference(saveRequest);
      expect(throwingResult).to.deep.equal(baselineResult);

      const baselineError = captureLifecycleError(() => baselineLifecycle.init());
      const throwingError = captureLifecycleError(() => throwingLifecycle.init());
      expect({
        code: throwingError.code,
        message: throwingError.message,
        findings: throwingError.findings,
      }).to.deep.equal({
        code: baselineError.code,
        message: baselineError.message,
        findings: baselineError.findings,
      });

      expect(() => throwingSuccessfulLifecycle.init()).not.to.throw();
      await throwingSuccessfulLifecycle.bootstrap();

      const startupError = await captureAsyncError(() => throwingStartup.bootstrapIntegrationPins());
      startupEvents.push('startup-rejected');
      expect(startupEvents).to.deep.equal(['pin-write', 'startup-rejected']);
      expect(startupError.message).to.equal(
        'Configured record schema integration pins were not materialized (record-schema.storage-unavailable).'
      );
      expect(throwingLoggerFactory.callCount).to.be.greaterThan(0);
    } finally {
      Reflect.set(testSails.config, 'log', priorLogConfig);
      restoreSails();
    }
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
    expect(fixture.findRecordSchemaGrantForAuthorization.notCalled).to.equal(true);
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('uses public branding for immutable grant lookup and the Mongo brand id for context resolution', async function () {
    const seed = await createImmutableSeed('default');
    const fixture = immutableResolutionFixture(seed);

    const result = await fixture.service.resolveImmutable({
      ...requestFor(seed),
      branding: 'default',
    });

    expect(result.kind).to.equal('resolved');
    expect(
      fixture.findRecordSchemaGrantForAuthorization.calledOnceWithExactly({
        digest: seed.artifact.digest,
        brand: 'default',
        portal: 'portal-1',
        schemaKind: 'create',
        recordType: 'dataset',
        operation: 'strict-all',
        recordBrandId: 'brand-1',
        username: 'alice',
        roleNames: [],
      })
    ).to.equal(true);
    expect(fixture.resolveContractContext.calledOnce).to.equal(true);
    expect(fixture.resolveContractContext.firstCall.firstArg).to.deep.include({ brand: 'brand-1' });
  });

  it('denies cross-brand and cross-portal grants without revealing their existence', async function () {
    const seed = await createImmutableSeed();
    const fixture = immutableResolutionFixture(seed);
    fixture.findRecordSchemaGrantForAuthorization.resolves(null);

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('not-found');
    expect(
      fixture.findRecordSchemaGrantForAuthorization.calledOnceWithExactly({
        digest: seed.artifact.digest,
        brand: 'brand-1',
        portal: 'portal-1',
        schemaKind: 'create',
        recordType: 'dataset',
        operation: 'strict-all',
        recordBrandId: 'brand-1',
        username: 'alice',
        roleNames: [],
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
    expect(fixture.findRecordSchemaGrantForAuthorization.notCalled).to.equal(true);
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

  it('hides a targeted immutable create when the target transition role is denied exactly like a missing artifact', async function () {
    const seed = await createImmutableSeed();
    const caller = updateCaller('visible-without-target-transition');
    const fixture = immutableResolutionFixture(seed);
    fixture.authorizeCreate.resolves(false);
    const missing = immutableResolutionFixture(seed);
    missing.getRecordSchemaArtifact.resolves(null);

    const [result, missingResult] = await Promise.all([
      fixture.service.resolveImmutable(requestFor(seed, caller)),
      missing.service.resolveImmutable(requestFor(seed, caller)),
    ]);

    expect(result.kind).to.equal('not-found');
    expect(missingResult.kind).to.equal('not-found');
    if (result.kind !== 'not-found' || missingResult.kind !== 'not-found') {
      throw new Error('Expected targeted transition denial and missing artifact to remain indistinguishable.');
    }
    expect(result.problem).to.deep.equal(missingResult.problem);
    expect(fixture.authorizeCreate.calledOnceWithExactly(seed.context, caller)).to.equal(true);
    expect(fixture.buildContractFormConfig.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
    expect(missing.findRecordSchemaGrantForAuthorization.notCalled).to.equal(true);
  });

  it('hides immutable artifacts from anonymous callers before artifact or grant lookup', async function () {
    const seed = await createImmutableSeed();
    const fixture = immutableResolutionFixture(seed);
    const caller = updateCaller('', 'Anonymous');

    const result = await fixture.service.resolveImmutable(requestFor(seed, caller));

    expect(result.kind).to.equal('not-found');
    expect(fixture.getRecordSchemaArtifact.notCalled).to.equal(true);
    expect(fixture.findRecordSchemaGrantForAuthorization.notCalled).to.equal(true);
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
  });

  it('uses one indexed authorization lookup and resolves only the selected current context', async function () {
    const seed = await createImmutableUpdateSeed();
    const fixture = immutableResolutionFixture(seed);

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('resolved');
    expect(
      fixture.findRecordSchemaGrantForAuthorization.calledOnceWithExactly({
        digest: seed.artifact.digest,
        brand: 'brand-1',
        portal: 'portal-1',
        schemaKind: 'update',
        recordType: 'dataset',
        operation: 'strict-all',
        recordBrandId: 'brand-1',
        username: 'alice',
        roleNames: ['Researcher'],
      })
    ).to.equal(true);
    expect(fixture.listRecordSchemaReferences.notCalled).to.equal(true);
    expect(fixture.resolveContractContext.calledOnce).to.equal(true);
    expect(fixture.authorizeUpdate.calledOnce).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.calledOnce).to.equal(true);
  });

  it('returns the same public not-found result for an indexed authorization miss as for a missing artifact', async function () {
    const seed = await createImmutableUpdateSeed();
    const fixture = immutableResolutionFixture(seed);
    fixture.findRecordSchemaGrantForAuthorization.resolves(null);
    const missing = immutableResolutionFixture(seed);
    missing.getRecordSchemaArtifact.resolves(null);

    const [result, missingResult] = await Promise.all([
      fixture.service.resolveImmutable(requestFor(seed)),
      missing.service.resolveImmutable(requestFor(seed)),
    ]);

    expect(result.kind).to.equal('not-found');
    expect(missingResult.kind).to.equal('not-found');
    if (result.kind !== 'not-found' || missingResult.kind !== 'not-found') {
      throw new Error('Expected indistinguishable inaccessible and missing results.');
    }
    expect(result.problem).to.deep.equal(missingResult.problem);
    expect(result.problem).to.deep.include({
      status: 404,
      detail: 'No accessible schema was found.',
      code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
    });
    expect(fixture.findRecordSchemaGrantForAuthorization.calledOnce).to.equal(true);
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
    expect(missing.findRecordSchemaGrantForAuthorization.notCalled).to.equal(true);
  });

  it('bounds an indexed authorization lookup failure as an availability result without resolving contexts', async function () {
    const seed = await createImmutableUpdateSeed();
    const fixture = immutableResolutionFixture(seed);
    fixture.findRecordSchemaGrantForAuthorization.rejects(new Error('private storage timeout'));

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('unavailable');
    if (result.kind !== 'unavailable') throw new Error('Expected bounded authorization lookup unavailability.');
    expect(result.problem.code).to.equal(RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE);
    expect(fixture.findRecordSchemaGrantForAuthorization.calledOnce).to.equal(true);
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
  });

  it('returns typed failures for malformed grant provider results and stored grants', async function () {
    const seed = await createImmutableSeed();
    const telemetryLogger = { info: sinon.stub(), error: sinon.stub() };
    const malformedPage = immutableResolutionFixture(seed, { telemetryLogger });
    malformedPage.findRecordSchemaGrantForAuthorization.resolves({ page: [] });

    const unavailable = await malformedPage.service.resolveImmutable(requestFor(seed));

    expect(unavailable.kind).to.equal('invalid-contract');
    if (unavailable.kind !== 'invalid-contract') throw new Error('Expected hidden invalid authorization data.');
    expect(unavailable.authorization).to.equal('unverified');

    const malformedGrant = immutableResolutionFixture(seed, { telemetryLogger });
    malformedGrant.findRecordSchemaGrantForAuthorization.resolves({ kind: 'grant', digest: seed.artifact.digest });

    const invalid = await malformedGrant.service.resolveImmutable(requestFor(seed));

    expect(invalid.kind).to.equal('invalid-contract');
    if (invalid.kind !== 'invalid-contract') throw new Error('Expected invalid stored authorization data.');
    expect(invalid.problem).to.deep.include({
      status: 422,
      code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
    });
    expect(malformedGrant.resolveContractContext.notCalled).to.equal(true);
    expect(telemetryLogger.error.args).to.deep.equal([
      [
        'record_schema_unexpected_failure',
        {
          event: 'record_schema_unexpected_failure',
          context: 'resolve-immutable-grant-contract',
          error_type: 'non-error',
        },
      ],
      [
        'record_schema_unexpected_failure',
        {
          event: 'record_schema_unexpected_failure',
          context: 'resolve-immutable-grant-contract',
          error_type: 'non-error',
        },
      ],
    ]);
    expect(JSON.stringify(telemetryLogger.error.args)).not.to.include(seed.artifact.digest);
  });

  it('contains hostile grant-shaped provider results as a preauthorization 404-compatible failure', async function () {
    const seed = await createImmutableSeed();
    const fixture = immutableResolutionFixture(seed);
    const throwingPage: unknown[] = [];
    Object.defineProperty(throwingPage, Symbol.iterator, {
      value: () => ({
        next: () => {
          throw new Error('private provider iterator failure');
        },
      }),
    });
    fixture.findRecordSchemaGrantForAuthorization.resolves(throwingPage);

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('invalid-contract');
    if (result.kind !== 'invalid-contract') throw new Error('Expected hidden invalid authorization data.');
    expect(result.authorization).to.equal('unverified');
    expect(fixture.resolveContractContext.notCalled).to.equal(true);
    expect(fixture.touchRecordSchemaArtifact.notCalled).to.equal(true);
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

  it('continues past a drifted update grant when a later equivalent grant is currently valid', async function () {
    const seed = await createImmutableUpdateSeed();
    if (seed.grant.schemaKind !== 'update') throw new Error('Expected an immutable update grant.');
    const laterGrant: RecordSchemaGrantReferenceInput = {
      ...seed.grant,
      referenceKey: `${seed.grant.referenceKey}.later`,
      oid: 'oid-2',
    };
    const buildContractFormConfig = sinon.stub();
    buildContractFormConfig.onFirstCall().resolves({
      ok: true,
      effectiveForm: simpleForm(['changed-title']),
    });
    buildContractFormConfig.onSecondCall().resolves({ ok: true, effectiveForm: runtimeSimpleForm() });
    const resolveContractContext = sinon.stub();
    resolveContractContext.onFirstCall().resolves(updateContext('oid-1'));
    resolveContractContext.onSecondCall().resolves(updateContext('oid-2'));
    const fixture = immutableResolutionFixture(seed, { buildContractFormConfig, resolveContractContext });
    fixture.findRecordSchemaGrantForAuthorization.callsFake(async (query: RecordSchemaAuthorizationGrantQuery) => {
      if (query.afterReferenceKey === undefined) return seed.grant;
      return query.afterReferenceKey === seed.grant.referenceKey ? laterGrant : null;
    });

    const result = await fixture.service.resolveImmutable(requestFor(seed));

    expect(result.kind).to.equal('resolved');
    expect(resolveContractContext.callCount).to.equal(2);
    expect(fixture.authorizeUpdate.callCount).to.equal(2);
    expect(buildContractFormConfig.callCount).to.equal(2);
    expect(fixture.touchRecordSchemaArtifact.calledOnceWithExactly(seed.artifact.digest)).to.equal(true);
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
