import { createSinonStubLogger } from './logger.test';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { ApplicationRuntime } from '../src/application';

import { ApiRouteDefinition, createApiRouteResolver, getMergedApiRoutes } from '../src/api-routes';
import {
  CORE_RECORD_CONTRACT_COMPONENT_INVENTORY,
  createCoreRecordContractContributors,
  RecordContractContributorRegistry,
  RECORD_CONTRACT_REGISTRATION_CODES,
  RECORD_SCHEMA_PROBLEM_CODES,
  RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS,
  recordSchema,
  StorageServiceResponse,
  type RecordContractContributorRegistration,
} from '../src';
import {
  RecordSchemaLifecycleError,
  Services as RecordSchemaServices,
  type RecordSchemaServiceDependencies,
} from '../src/services/RecordSchemaService';

describe('owned bootstrap ordering', function () {
  const applications: ApplicationRuntime[] = [];
  afterEach(async () => {
    for (const app of applications.splice(0)) await app.stop();
    sinon.restore();
  });
  it('awaits module initialization before resolving the route snapshot', async function () {
    const route: ApiRouteDefinition = {
      method: 'get', path: '/:branding/:portal/api/hooks/late',
      controller: 'hook/LateController', action: 'show', summary: 'Late hook route',
    };
    const config = { apiRoutesHooks: [] as Array<() => ApiRouteDefinition[]> };
    const request = { method: 'GET', path: '/default/rdmp/api/hooks/late' };
    let resolve = createApiRouteResolver(getMergedApiRoutes(config));
    const init = sinon.stub().callsFake(async () => {
      await Promise.resolve();
      expect(resolve(request)).to.equal(undefined);
      config.apiRoutesHooks = [() => [route]];
    });
    const app = new ApplicationRuntime({ config: {}, log: createSinonStubLogger(sinon) }, [
      { name: 'late-routes', create: () => ({ initialize: init, close: async () => {} }) },
    ], { postBootstrap: [{ name: 'route-snapshot', run: async () => {
      resolve = createApiRouteResolver(getMergedApiRoutes(config));
    } }] });
    applications.push(app);
    await app.initialize();
    const resolved = resolve(request);
    expect(init.calledOnce).to.equal(true);
    expect(resolved?.path).to.equal(route.path);
    expect(resolved?.controller).to.equal(route.controller);
    expect(resolved?.action).to.equal(route.action);
  });

  it('defers record-schema validation to the post-storage readiness gate', async function () {
    let finishStorage!: () => void;
    const pending = new Promise<void>(resolve => { finishStorage = resolve; });
    const storageInit = sinon.stub().returns(pending);
    const recordSchemaInit = sinon.stub().resolves();
    const app = new ApplicationRuntime({ config: {}, log: createSinonStubLogger(sinon) }, [
      { name: 'storage', create: () => ({ initialize: storageInit, close: async () => {} }) },
    ], { postBootstrap: [{ name: 'record-schema', run: recordSchemaInit }] });
    applications.push(app);
    const startup = app.initialize();
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(storageInit.calledOnce).to.equal(true);
    expect(recordSchemaInit.notCalled).to.equal(true);
    finishStorage();
    await startup;
    expect(recordSchemaInit.calledOnce).to.equal(true);
  });
});

describe('record schema bootstrap lifecycle', function () {
  before(async () => { expect = (await import('chai')).expect; });
  afterEach(() => sinon.restore());

  function enabledRecordSchemaConfig(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      ...structuredClone(recordSchema),
      enabled: true,
      ...overrides,
    };
  }

  function successfulStorageResponse(): StorageServiceResponse {
    const response = new StorageServiceResponse();
    response.success = true;
    return response;
  }

  function validIntegrationPin(): Record<string, unknown> {
    return {
      digest: 'a'.repeat(64),
      brand: 'default',
      portal: 'rdmp',
      schemaKind: 'create',
      recordType: 'rdmp',
      operation: 'strict-all',
      owner: 'integration-owner',
      purpose: 'Retain the integration contract.',
      expiresAt: '2027-01-01T00:00:00.000Z',
    };
  }

  function completeRecordSchemaStorage(): Record<string, sinon.SinonStub> {
    return Object.fromEntries(
      RECORD_SCHEMA_STORAGE_CAPABILITY_METHODS.map(method => [
        method,
        sinon.stub().resolves(successfulStorageResponse()),
      ])
    );
  }

  function coreContributorRegistry(excluded: readonly string[] = []): RecordContractContributorRegistry {
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

  function recordSchemaLiftService(
    overrides: Partial<RecordSchemaServiceDependencies> = {}
  ): RecordSchemaServices.RecordSchema {
    const registry = coreContributorRegistry();
    return new RecordSchemaServices.RecordSchema({
      getConfig: () => enabledRecordSchemaConfig(),
      getStorageProvider: () => completeRecordSchemaStorage(),
      getContributorRegistry: () => registry,
      getContributorRegistrationIssues: () => [],
      getContributorComponentTypes: () => registeredComponentTypes(registry),
      getConfiguredFormCandidates: () => [],
      ...overrides,
    });
  }

  async function runRecordSchemaLift(service: RecordSchemaServices.RecordSchema): Promise<void> {
    const app = new ApplicationRuntime({ config: {}, log: createSinonStubLogger(sinon) }, [], {
      postBootstrap: [{ name: 'record-schema', run: () => service.bootstrap() }],
    });
    try { await app.initialize(); } finally { await app.stop(); }
  }

  async function captureLiftFailure(service: RecordSchemaServices.RecordSchema): Promise<RecordSchemaLifecycleError> {
    try {
      await runRecordSchemaLift(service);
    } catch (error) {
      if (error instanceof RecordSchemaLifecycleError) return error;
      throw error;
    }
    throw new Error('Expected record-schema lift validation to fail.');
  }

  it('awaits record-schema startup and propagates startup failure', async function () {
    let complete: (() => void) | undefined;
    const pending = new Promise<void>(resolve => {
      complete = resolve;
    });
    const bootstrap = sinon.stub().returns(pending);
    const owner = () => ({ config: {}, log: createSinonStubLogger(sinon) });
    const app = new ApplicationRuntime(owner(), [], {
      postBootstrap: [{ name: 'record-schema', run: bootstrap }],
    });
    let settled = false;
    const startup = app.initialize().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).to.equal(false);
    complete?.();
    await startup;
    expect(bootstrap.calledOnce).to.equal(true);
    await app.stop();

    const failure = new Error('configured form compilation failed');
    bootstrap.rejects(failure);
    let caught: unknown;
    try {
      const failing = new ApplicationRuntime(owner(), [], {
        postBootstrap: [{ name: 'record-schema', run: bootstrap }],
      });
      try { await failing.initialize(); } finally { await failing.stop(); }
    } catch (error) {
      caught = error;
    }
    expect(caught).to.equal(failure);
  });

  it('allows disabled record schemas to lift with legacy storage', async function () {
    const getStorageProvider = sinon.stub().throws(new Error('legacy storage must remain untouched'));
    const service = recordSchemaLiftService({
      getConfig: () => ({ enabled: false }),
      getStorageProvider,
      getContributorRegistry: () => {
        throw new Error('contributors must remain untouched');
      },
    });

    await runRecordSchemaLift(service);

    expect(getStorageProvider.notCalled).to.equal(true);
  });

  it('allows enabled record schemas to lift with complete startup dependencies', async function () {
    const storage = completeRecordSchemaStorage();
    await runRecordSchemaLift(
      recordSchemaLiftService({
        getConfig: () => enabledRecordSchemaConfig({ integrationPins: [validIntegrationPin()] }),
        getStorageProvider: () => storage,
      })
    );

    expect(storage.putRecordSchemaReference.calledOnce).to.equal(true);
  });

  it('blocks lift when enabled storage lacks a required capability', async function () {
    const storage = completeRecordSchemaStorage();
    delete storage.putRecordSchemaArtifact;

    const error = await captureLiftFailure(
      recordSchemaLiftService({
        getStorageProvider: () => storage,
      })
    );

    expect(error.findings).to.deep.include({
      category: 'storage',
      code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
      method: 'putRecordSchemaArtifact',
    });
  });

  it('blocks lift for duplicate contributor registration', async function () {
    const error = await captureLiftFailure(
      recordSchemaLiftService({
        getContributorRegistry: () => undefined,
        getContributorRegistrationIssues: () => [
          {
            code: RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
            key: 'DuplicateHookComponent',
            detail: 'Component type is already registered.',
          },
        ],
      })
    );

    expect(error.findings).to.deep.include({
      category: 'contributor',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_DUPLICATE,
      registrationCode: RECORD_CONTRACT_REGISTRATION_CODES.DUPLICATE_COMPONENT,
      key: 'DuplicateHookComponent',
    });
  });

  it('blocks lift for an uncovered persisted core component', async function () {
    const uncovered = Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY)[0];
    const registry = coreContributorRegistry([uncovered]);

    const error = await captureLiftFailure(
      recordSchemaLiftService({
        getContributorRegistry: () => registry,
        getContributorComponentTypes: () => registeredComponentTypes(registry),
      })
    );

    expect(error.findings).to.deep.include({
      category: 'coverage',
      code: RECORD_SCHEMA_PROBLEM_CODES.UNSUPPORTED_COMPONENT,
      componentType: uncovered,
    });
  });

  it('blocks lift for a malformed configured integration pin', async function () {
    const error = await captureLiftFailure(
      recordSchemaLiftService({
        getConfig: () =>
          enabledRecordSchemaConfig({
            integrationPins: [
              {
                digest: 'malformed',
                brand: 'default',
                portal: 'rdmp',
                schemaKind: 'create',
                recordType: 'rdmp',
                operation: 'strict-all',
                owner: 'integration-owner',
                purpose: 'Retain the integration contract.',
              },
            ],
          }),
      })
    );

    expect(error.findings).to.deep.include({
      category: 'pin',
      code: RECORD_SCHEMA_PROBLEM_CODES.CONFIG_INVALID,
      path: 'recordSchema.integrationPins.0.digest',
      reason: 'digest',
    });
  });

  it('allows a partial custom component contract to lift', async function () {
    const service = recordSchemaLiftService({
      getConfiguredFormCandidates: () => [
        {
          name: 'custom-form',
          reusableFormDefinitions: {},
          form: {
            name: 'custom-form',
            componentDefinitions: [
              {
                name: 'custom_value',
                module: '@example/redbox-hook-custom',
                component: { class: 'ExampleHookComponent' },
                model: { class: 'ExampleHookModel', config: {} },
              },
            ],
          },
        },
      ],
    });

    await runRecordSchemaLift(service);
  });

  it('aggregates and stably sorts fatal lift diagnostics across available checks', async function () {
    const storage = completeRecordSchemaStorage();
    delete storage.putRecordSchemaArtifact;
    const uncovered = Object.keys(CORE_RECORD_CONTRACT_COMPONENT_INVENTORY)[0];
    const registry = coreContributorRegistry([uncovered]);
    const service = recordSchemaLiftService({
      getConfig: () => enabledRecordSchemaConfig({ integrationPins: [{ ...validIntegrationPin(), digest: 'bad' }] }),
      getStorageProvider: () => storage,
      getContributorRegistry: () => registry,
      getContributorComponentTypes: () => registeredComponentTypes(registry),
      getConfiguredFormCandidates: () => [
        {
          name: 'broken-form',
          reusableFormDefinitions: {},
          form: {
            name: 'broken-form',
            componentDefinitions: [{ name: 'broken', component: {}, model: {} }],
          },
        },
      ],
    });

    const first = await captureLiftFailure(service);
    const second = await captureLiftFailure(service);

    expect(first.findings.map(finding => finding.category)).to.deep.equal(['storage', 'coverage', 'form', 'pin']);
    expect(first.message).to.equal(second.message);
  });

  it('keeps application initialization pending until record-schema startup finishes after storage readiness', async function () {
    const events: string[] = [];
    let finishPins!: () => void;
    const pinWrite = new Promise<void>(resolve => { finishPins = resolve; });
    const app = new ApplicationRuntime({ config: {}, log: createSinonStubLogger(sinon) }, [], {
      coreBootstrap: [{ name: 'storage-ready', run: async () => { events.push('storage-ready'); } }],
      postBootstrap: [
        { name: 'record-schema', run: async () => {
          events.push('record-schema-started');
          await pinWrite;
          events.push('record-schema-finished');
        } },
        { name: 'ready', run: async () => { events.push('ready'); } },
      ],
    });
    try {
      let settled = false;
      const startup = app.initialize().then(() => { settled = true; });
      await new Promise<void>(resolve => setImmediate(resolve));
      expect(events).to.deep.equal(['storage-ready', 'record-schema-started']);
      expect(settled).to.equal(false);
      expect(app.status().ready).to.equal(false);
      finishPins();
      await startup;
      expect(events).to.deep.equal(['storage-ready', 'record-schema-started', 'record-schema-finished', 'ready']);
    } finally { await app.stop(); }
  });
});
