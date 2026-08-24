import { expect } from 'chai';
import * as sinon from 'sinon';

import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  createCoreRecordContractContributors,
  type RecordContractContributorRegistration,
  RecordContractContributorRegistry,
  RECORD_CONTRACT_REGISTRATION_CODES,
  RECORD_SCHEMA_PROBLEM_CODES,
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  recordSchema,
  resetDiscoveredRecordContractContributorRegistry,
  setDiscoveredRecordContractContributorRegistry,
} from '../../src';
import {
  RECORD_SCHEMA_LIFECYCLE_ERROR_CODE,
  RecordSchemaLifecycleError,
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
  });
});
