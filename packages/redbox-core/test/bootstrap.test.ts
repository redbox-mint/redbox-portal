let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { of } from 'rxjs';

import { bootstrapRecordSchema, coreBootstrap, preLiftSetup } from '../src/bootstrap';
import { ApiRouteDefinition, resetResolvedApiRouteCache, resolveApiRouteForRequest } from '../src/api-routes';
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

function createReq(overrides: Partial<Sails.Req> = {}): Sails.Req {
  return {
    method: 'GET',
    path: '/default/rdmp/api/hooks/late',
    originalUrl: '/default/rdmp/api/hooks/late',
    url: '/default/rdmp/api/hooks/late',
    route: { path: '/:branding/:portal/api/hooks/late' },
    params: { branding: 'default', portal: 'rdmp' },
    query: {},
    headers: {},
    session: { branding: 'default', portal: 'rdmp' } as Sails.Req['session'],
    isAuthenticated: (() => true) as Sails.Req['isAuthenticated'],
    ...overrides,
  } as Sails.Req;
}

describe('bootstrap pre-lift setup', function () {
  let originalSails: unknown;
  let originalLodash: unknown;

  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(function () {
    originalSails = (global as Record<string, unknown>).sails;
    originalLodash = (global as Record<string, unknown>)._;
    resetResolvedApiRouteCache();
  });

  afterEach(function () {
    sinon.restore();
    resetResolvedApiRouteCache();
    (global as Record<string, unknown>).sails = originalSails;
    (global as Record<string, unknown>)._ = originalLodash;
  });

  it('awaits service initialization before clearing the resolved route cache', async function () {
    const lateHookRoute: ApiRouteDefinition = {
      method: 'get',
      path: '/:branding/:portal/api/hooks/late',
      controller: 'hook/LateController',
      action: 'show',
      summary: 'Late hook route',
    };
    const lateHookReq = createReq();

    const sailsConfig: Record<string, unknown> = {
      security: { csrf: true },
      bootstrap: {},
      environment: 'development',
      ng2: { force_bundle: false, use_bundled: false },
      log: { customLogger: { level: 'info' }, level: 'info' },
      appmode: { bootstrapAlways: false },
      apiRoutesHooks: [],
    };

    const init = sinon.stub().callsFake(async () => {
      await Promise.resolve();
      expect(resolveApiRouteForRequest(lateHookReq)).to.equal(undefined);
      sailsConfig.apiRoutesHooks = [() => [lateHookRoute]];
    });

    (global as Record<string, unknown>).sails = {
      config: sailsConfig,
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        error: sinon.stub(),
        warn: sinon.stub(),
        info: sinon.stub(),
        trace: sinon.stub(),
      },
      services: {
        laterouteservice: { init },
      },
      _actions: {},
    };
    (global as Record<string, unknown>)._ = require('lodash');

    await preLiftSetup();

    const resolvedRoute = resolveApiRouteForRequest(lateHookReq);

    expect(init.calledOnce).to.equal(true);
    expect(resolvedRoute?.path).to.equal(lateHookRoute.path);
    expect(resolvedRoute?.controller).to.equal(lateHookRoute.controller);
    expect(resolvedRoute?.action).to.equal(lateHookRoute.action);
  });

  it('defers record-schema validation to the post-storage readiness gate', async function () {
    const storageInit = sinon.stub().resolves();
    const recordSchemaInit = sinon.stub().throws(new Error('record schema validation ran too early'));
    (global as Record<string, unknown>).sails = {
      config: {
        security: { csrf: true },
        bootstrap: {},
        environment: 'development',
        ng2: { force_bundle: false, use_bundled: false },
        log: { customLogger: { level: 'info' }, level: 'info' },
        appmode: { bootstrapAlways: false },
        apiRoutesHooks: [],
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        error: sinon.stub(),
        warn: sinon.stub(),
        info: sinon.stub(),
        trace: sinon.stub(),
      },
      services: {
        mongostorageservice: { init: storageInit },
        recordschemaservice: { init: recordSchemaInit },
      },
      _actions: {},
    };
    (global as Record<string, unknown>)._ = require('lodash');

    await preLiftSetup();

    expect(storageInit.calledOnce).to.equal(true);
    expect(recordSchemaInit.notCalled).to.equal(true);
  });
});

describe('record schema bootstrap lifecycle', function () {
  let originalSails: unknown;
  let originalLodash: unknown;
  let originalAppConfigService: unknown;

  before(async function () {
    const chai = await import('chai');
    expect = chai.expect;
  });

  beforeEach(function () {
    originalSails = (global as Record<string, unknown>).sails;
    originalLodash = (global as Record<string, unknown>)._;
    originalAppConfigService = (global as Record<string, unknown>).AppConfigService;
  });

  afterEach(function () {
    sinon.restore();
    (global as Record<string, unknown>).sails = originalSails;
    (global as Record<string, unknown>)._ = originalLodash;
    (global as Record<string, unknown>).AppConfigService = originalAppConfigService;
  });

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
    (global as Record<string, unknown>).sails = {
      services: {
        recordschemaservice: {
          bootstrap: service.bootstrap.bind(service),
        },
      },
    };
    await bootstrapRecordSchema();
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
    (global as Record<string, unknown>).sails = {
      services: { recordschemaservice: { bootstrap } },
    };
    let settled = false;
    const startup = bootstrapRecordSchema().then(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(settled).to.equal(false);
    complete?.();
    await startup;
    expect(bootstrap.calledOnce).to.equal(true);

    const failure = new Error('configured form compilation failed');
    bootstrap.rejects(failure);
    let caught: unknown;
    try {
      await bootstrapRecordSchema();
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

  it('keeps the real core bootstrap pending until record-schema startup finishes after storage readiness', async function () {
    const events: string[] = [];
    let finishPins: (() => void) | undefined;
    const pinWrite = new Promise<void>(resolve => {
      finishPins = resolve;
    });
    const immediate = async () => undefined;
    const brandingservice = {
      bootstrap: () => of({ id: 'default' }),
      getDefault: () => ({ id: 'default' }),
    };
    const log = {
      verbose: sinon.stub().callsFake((message: string) => {
        if (message === 'Bootstrap complete!') events.push('ready');
      }),
      debug: sinon.stub(),
      info: sinon.stub(),
      error: sinon.stub(),
    };
    (global as Record<string, unknown>)._ = require('lodash');
    (global as Record<string, unknown>).AppConfigService = {
      getAppConfigurationForBrand: sinon.stub(),
    };
    (global as Record<string, unknown>).sails = {
      config: { crontab: { enabled: false } },
      log,
      services: {
        brandingservice,
        rolesservice: { bootstrap: () => of([]), getRolesWithBrand: () => of([]) },
        reportsservice: { bootstrapData: immediate },
        namedqueryservice: { bootstrapData: immediate },
        usersservice: { bootstrap: () => of({ defUser: {}, defRoles: [] }) },
        pathrulesservice: { bootstrap: () => of(undefined) },
        recordtypesservice: { bootstrap: async () => [] },
        dashboardtypesservice: { bootstrap: immediate },
        workflowstepsservice: { bootstrap: async () => [] },
        formsservice: { bootstrap: immediate },
        recordsservice: {
          auditRecordValidationRollout: immediate,
          bootstrapData: immediate,
          checkRedboxRunning: async () => {
            events.push('storage-ready');
            return true;
          },
        },
        vocabularyservice: { bootstrapData: immediate },
        i18nentriesservice: { bootstrap: immediate },
        translationservice: { bootstrap: immediate },
        appconfigservice: { bootstrap: immediate },
        figsharevocabularyservice: { bootstrapData: immediate },
        agendaqueueservice: { init: immediate },
        workspacetypesservice: { bootstrap: () => of(undefined) },
        cacheservice: { bootstrap: immediate },
        recordschemaservice: {
          bootstrap: async () => {
            events.push('record-schema-started');
            await pinWrite;
            events.push('record-schema-finished');
          },
        },
      },
    };

    let settled = false;
    const startup = coreBootstrap().then(() => {
      settled = true;
    });
    await new Promise<void>(resolve => setImmediate(resolve));
    expect(events).to.deep.equal(['storage-ready', 'record-schema-started']);
    expect(settled).to.equal(false);
    finishPins?.();
    await startup;
    expect(events).to.deep.equal(['storage-ready', 'record-schema-started', 'record-schema-finished', 'ready']);
  });
});
