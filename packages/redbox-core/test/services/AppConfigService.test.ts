let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import * as sinon from 'sinon';
import { APP_CONFIG_SECRET_MASK, Services } from '../../src/services/AppConfigService';
import { ConfigModels } from '../../src/configmodels/ConfigModels';
import {
  DoiPublishing,
  fromDoiPublishingFormModel,
  toDoiPublishingFormModel,
} from '../../src/configmodels/DoiPublishing';
import { normalizeSiemConfiguration, SiemConfigurationError } from '../../src/configmodels/SiemConfiguration';
import { Controllers as AppConfigControllers } from '../../src/controllers/AppConfigController';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('AppConfigService', function () {
  let service: Services.AppConfigs;
  let mockSails: any;

  beforeEach(function () {
    mockSails = createMockSails();
    setupServiceTestGlobals(mockSails);

    const mockDeferred = (result: unknown) => {
      const p: any = Promise.resolve(result);
      p.exec = sinon.stub().yields(null, result);
      return p;
    };

    (global as any).AppConfig = {
      find: sinon.stub().callsFake(() => mockDeferred([])),
      findOne: sinon.stub().callsFake(() => mockDeferred(null)),
      create: sinon.stub().callsFake((data: Record<string, unknown>) => mockDeferred({ configData: {}, ...data })),
      updateOne: sinon.stub().returns({ set: sinon.stub().callsFake(() => mockDeferred({ configData: {} })) }),
    };

    (global as any).BrandingService = {
      getAvailable: sinon.stub().returns(['default']),
      getBrand: sinon.stub().returns({ id: 'brand1', name: 'default' }),
    };

    sinon.stub(ConfigModels, 'getConfigKeys').returns([]);
    sinon.stub(ConfigModels, 'getModelInfo').returns({ modelName: 'MockModel', class: class MockModel {} });

    service = new Services.AppConfigs();
    service.brandingAppConfigMap = {};
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).AppConfig;
    delete (global as any).BrandingService;
    sinon.restore(); // Restores ConfigModels stubs
  });

  describe('bootstrap', function () {
    it('should load config for brands', async function () {
      await service.bootstrap();
      // Should populate brandingAppConfigMap
      const config = service.getAppConfigurationForBrand('default');
      expect(config).to.not.be.undefined;
    });
  });

  describe('createConfig', function () {
    it('reports override presence and resets only the requested brand/key before reloading defaults', async function () {
      const destroy = sinon.stub().resolves([]);
      Object.assign(AppConfig, { destroy });
      const branding = { id: 'brand1', name: 'default' } as import('../../src/model/storage/BrandingModel').BrandingModel;
      const refresh = sinon.stub(service, 'refreshBrandingAppConfigMap').resolves();
      const read = sinon.stub(service, 'getAppConfigByBrandAndKey').resolves({ enabled: false });

      expect(await service.hasConfigOverride('brand1', 'systemMessage')).to.equal(false);
      expect(await service.resetConfigOverride(branding, 'systemMessage')).to.deep.equal({ enabled: false });
      expect(destroy.calledOnceWithExactly({ branding: 'brand1', configKey: 'systemMessage' })).to.equal(true);
      expect(refresh.calledOnceWithExactly(branding)).to.equal(true);
      expect(read.calledOnceWithExactly('brand1', 'systemMessage')).to.equal(true);
      expect(destroy.calledBefore(refresh)).to.equal(true);
    });

    it('should create new config', async function () {
      // Need to populate map first or mock refreshBrandingAppConfigMap
      // We can just rely on refreshBrandingAppConfigMap calling loadAppConfigurationModel which works with mocks

      const data = { key: 'val' };
      const result = await service.createConfig('default', 'key', data);

      expect(result).to.deep.equal(data);
      expect((global as any).AppConfig.create.called).to.be.true;
    });

    it('should throw if config exists', async function () {
      const mockDeferred = (result: unknown) => {
        const p: any = Promise.resolve(result);
        p.exec = sinon.stub().yields(null, result);
        return p;
      };

      (global as any).AppConfig.find.callsFake(() => mockDeferred([{}]));
      try {
        await service.createConfig('default', 'key', {});
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e instanceof Error ? e.message : String(e)).to.contain('already exists');
      }
    });
  });

  describe('retired dashboard keys', function () {
    it('refuses generic writes to legacy dashboard configuration keys', async function () {
      for (const configKey of ['dashboardTableConfig', 'dashboardConfigLegacySnapshot']) {
        for (const write of [
          () => service.createOrUpdateConfig({ id: 'brand1', name: 'default' } as any, configKey, { recordTypes: {} }),
          () => service.createConfig('default', configKey, { recordTypes: {} }),
        ]) {
          try {
            await write();
            expect.fail('write should be refused');
          } catch (error: any) {
            expect(error.status).to.equal(410);
            expect(error.code).to.equal('legacy-operation-retired');
          }
        }
      }
      expect((global as any).AppConfig.create.called).to.equal(false);
      expect((global as any).AppConfig.updateOne.called).to.equal(false);
    });
  });

  describe('secret fields', function () {
    it('should mask secret fields when reading config', async function () {
      class SecretModel {
        connection = { token: 'secret-token' };
      }
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SecretModel',
        class: SecretModel,
        secretFields: ['connection.token'],
      });
      (global as any).AppConfig.findOne = sinon.stub().callsFake(() => {
        const p: any = Promise.resolve({ configData: { connection: { token: 'secret-token' } } });
        p.exec = sinon.stub().yields(null, { configData: { connection: { token: 'secret-token' } } });
        return p;
      });

      const result: any = await service.getAppConfigByBrandAndKey('brand1', 'figsharePublishing');
      expect(result.connection.token).to.equal(APP_CONFIG_SECRET_MASK);
    });

    it('should preserve existing secrets when the mask placeholder is submitted', async function () {
      class SecretModel {
        connection = { token: '' };
      }
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SecretModel',
        class: SecretModel,
        secretFields: ['connection.token'],
      });

      const existingRecord = { configData: { connection: { token: 'secret-token' } } };
      const updateSet = sinon.stub().callsFake((data: Record<string, unknown>) => {
        const updatedRecord = { configData: data.configData };
        const p: any = Promise.resolve(updatedRecord);
        p.exec = sinon.stub().yields(null, updatedRecord);
        return p;
      });

      (global as any).AppConfig.find = sinon.stub().callsFake(() => {
        const p: any = Promise.resolve([existingRecord]);
        p.exec = sinon.stub().yields(null, [existingRecord]);
        return p;
      });
      (global as any).AppConfig.updateOne = sinon.stub().returns({ set: updateSet });

      const result: any = await service.createOrUpdateConfig(
        { id: 'brand1', name: 'default' } as any,
        'figsharePublishing',
        { connection: { token: APP_CONFIG_SECRET_MASK } }
      );

      expect(updateSet.calledOnce).to.be.true;
      expect(updateSet.firstCall.args[0]).to.deep.equal({
        configData: { connection: { token: 'secret-token' } },
      });
      expect(result.connection.token).to.equal(APP_CONFIG_SECRET_MASK);
    });

    it('should mask and preserve SIEM destination array secrets', async function () {
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SiemConfiguration',
        class: class SiemConfigurationMock {},
        secretFields: [
          'destinations[].token',
          'destinations[].password',
          'destinations[].headers.Authorization',
          'destinations[].headers.X-Splunk-Token',
        ],
      });

      const existingRecord = {
        configData: {
          enabled: true,
          destinations: [
            {
              id: 'splunk',
              name: 'Splunk',
              enabled: true,
              adapterType: 'splunk-hec-json',
              endpointUrl: 'https://splunk.example/services/collector',
              token: 'stored-token',
              password: 'stored-password',
              headers: {
                Authorization: 'Bearer stored-auth',
                'X-Splunk-Token': 'stored-splunk-token',
                Accept: 'application/json',
              },
            },
          ],
        },
      };
      const updateSet = sinon.stub().callsFake((data: Record<string, unknown>) => {
        const updatedRecord = { configData: data.configData };
        const p: any = Promise.resolve(updatedRecord);
        p.exec = sinon.stub().yields(null, updatedRecord);
        return p;
      });

      (global as any).AppConfig.find = sinon.stub().callsFake(() => {
        const p: any = Promise.resolve([existingRecord]);
        p.exec = sinon.stub().yields(null, [existingRecord]);
        return p;
      });
      (global as any).AppConfig.findOne = sinon.stub().callsFake(() => {
        const p: any = Promise.resolve(existingRecord);
        p.exec = sinon.stub().yields(null, existingRecord);
        return p;
      });
      (global as any).AppConfig.updateOne = sinon.stub().returns({ set: updateSet });

      const maskedRead: any = await service.getAppConfigByBrandAndKey('brand1', 'siem');
      expect(maskedRead.destinations[0].token).to.equal(APP_CONFIG_SECRET_MASK);
      expect(maskedRead.destinations[0].password).to.equal(APP_CONFIG_SECRET_MASK);
      expect(maskedRead.destinations[0].headers.Authorization).to.equal(APP_CONFIG_SECRET_MASK);
      expect(maskedRead.destinations[0].headers['X-Splunk-Token']).to.equal(APP_CONFIG_SECRET_MASK);
      expect(maskedRead.destinations[0].headers.Accept).to.equal('application/json');

      const result: any = await service.createOrUpdateConfig({ id: 'brand1', name: 'default' } as any, 'siem', {
        enabled: true,
        destinations: [
          {
            id: 'splunk',
            name: 'Splunk',
            enabled: true,
            adapterType: 'splunk-hec-json',
            endpointUrl: 'https://splunk.example/services/collector',
            token: APP_CONFIG_SECRET_MASK,
            password: APP_CONFIG_SECRET_MASK,
            headers: {
              Authorization: APP_CONFIG_SECRET_MASK,
              'X-Splunk-Token': APP_CONFIG_SECRET_MASK,
              Accept: 'text/plain',
            },
          },
        ],
      });

      expect(updateSet.firstCall.args[0].configData.destinations[0].token).to.equal('stored-token');
      expect(updateSet.firstCall.args[0].configData.destinations[0].password).to.equal('stored-password');
      expect(updateSet.firstCall.args[0].configData.destinations[0].headers.Authorization).to.equal(
        'Bearer stored-auth'
      );
      expect(updateSet.firstCall.args[0].configData.destinations[0].headers['X-Splunk-Token']).to.equal(
        'stored-splunk-token'
      );
      expect(updateSet.firstCall.args[0].configData.destinations[0].headers.Accept).to.equal('text/plain');
      expect(result.destinations[0].token).to.equal(APP_CONFIG_SECRET_MASK);
    });

    it('should preserve SIEM destination secrets by id when destinations are reordered', async function () {
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SiemConfiguration',
        class: class SiemConfigurationMock {},
        secretFields: ['destinations[].token'],
      });

      const existingRecord = {
        configData: {
          destinations: [
            { id: 'splunk', token: 'splunk-token' },
            { id: 'otel', token: 'otel-token' },
          ],
        },
      };
      const updateSet = sinon.stub().callsFake((data: Record<string, unknown>) => {
        const updatedRecord = { configData: data.configData };
        const p: any = Promise.resolve(updatedRecord);
        p.exec = sinon.stub().yields(null, updatedRecord);
        return p;
      });

      (global as any).AppConfig.find = sinon.stub().callsFake(() => {
        const p: any = Promise.resolve([existingRecord]);
        p.exec = sinon.stub().yields(null, [existingRecord]);
        return p;
      });
      (global as any).AppConfig.updateOne = sinon.stub().returns({ set: updateSet });

      await service.createOrUpdateConfig({ id: 'brand1', name: 'default' } as any, 'siem', {
        destinations: [
          { id: 'otel', token: APP_CONFIG_SECRET_MASK },
          { id: 'splunk', token: APP_CONFIG_SECRET_MASK },
        ],
      });

      expect(updateSet.firstCall.args[0].configData.destinations[0].token).to.equal('otel-token');
      expect(updateSet.firstCall.args[0].configData.destinations[1].token).to.equal('splunk-token');
    });

    it('should prefer the most recently updated duplicate config record when loading app config', async function () {
      (ConfigModels.getConfigKeys as sinon.SinonStub).returns(['doiPublishing']);
      (ConfigModels.getModelInfo as sinon.SinonStub).callsFake((key: string) => {
        if (key === 'doiPublishing') {
          return {
            modelName: 'DoiPublishing',
            class: DoiPublishing,
          };
        }
        return {
          modelName: 'MockModel',
          class: class MockModel {},
        };
      });

      const duplicateRecords = [
        {
          branding: 'brand1',
          configKey: 'doiPublishing',
          updatedAt: '2026-04-15T03:00:00.000Z',
          configData: {
            enabled: true,
            defaultProfile: 'dataPublication',
            connection: {
              baseUrl: 'https://api.test.datacite.org',
              username: 'old-user',
              password: null,
              timeoutMs: 30000,
              retry: {
                maxAttempts: 3,
                baseDelayMs: 500,
                maxDelayMs: 4000,
                retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnMethods: ['get', 'put', 'patch', 'delete'],
              },
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true,
            },
            profiles: {},
          },
        },
        {
          branding: 'brand1',
          configKey: 'doiPublishing',
          updatedAt: '2026-04-15T03:04:11.122Z',
          configData: {
            enabled: true,
            defaultProfile: 'dataPublication',
            connection: {
              baseUrl: 'https://api.test.datacite.org',
              username: 'new-user',
              password: 'new-password',
              timeoutMs: 30000,
              retry: {
                maxAttempts: 3,
                baseDelayMs: 500,
                maxDelayMs: 4000,
                retryOnStatusCodes: [408, 429, 500, 502, 503, 504],
                retryOnMethods: ['get', 'put', 'patch', 'delete'],
              },
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true,
            },
            profiles: {},
          },
        },
      ];

      (global as any).AppConfig.find = sinon.stub().callsFake((criteria: Record<string, unknown>) => {
        const records = duplicateRecords.filter(record => {
          return Object.entries(criteria).every(([key, value]) => (record as Record<string, unknown>)[key] === value);
        });
        const p: any = Promise.resolve(records);
        p.exec = sinon.stub().yields(null, records);
        return p;
      });

      const loaded: any = await service.loadAppConfigurationModel('brand1');

      expect(loaded.doiPublishing.connection.username).to.equal('new-user');
      expect(loaded.doiPublishing.connection.password).to.equal('new-password');
    });
  });

  describe('form adapters', function () {
    it('should convert doiPublishing profiles between map and array form shapes', async function () {
      class DoiPublishingFormMock {
        static getFieldOrder() {
          return ['profiles'];
        }
      }

      (ConfigModels.getModelInfo as sinon.SinonStub).callsFake((key: string) => {
        if (key === 'doiPublishing') {
          return {
            modelName: 'DoiPublishing',
            class: DoiPublishingFormMock,
            schema: {
              type: 'object',
              properties: {
                profiles: {
                  type: 'array',
                },
              },
            },
            formAdapter: {
              toForm: toDoiPublishingFormModel,
              fromForm: fromDoiPublishingFormModel,
            },
          };
        }
        return {
          modelName: 'MockModel',
          class: class MockModel {},
        };
      });

      const doiPublishing = new DoiPublishing();
      doiPublishing.profiles = {
        dataPublication: {
          enabled: true,
          label: 'Data Publication',
          metadata: {} as any,
          writeBack: {
            citationUrlPath: 'metadata.citation_url',
            citationDoiPath: 'metadata.citation_doi',
          },
          validation: {
            requireUrl: true,
            requirePublisher: true,
            requirePublicationYear: true,
            requireCreators: true,
            requireTitles: true,
          },
        } as any,
      };
      service.brandingAppConfigMap = {
        default: {
          doiPublishing,
        },
      } as any;

      const branding = { id: 'brand1', name: 'default' } as any;
      const appConfigForm: any = await service.getAppConfigForm(branding, 'doiPublishing');

      expect(Array.isArray(appConfigForm.model.profiles)).to.equal(true);
      expect(appConfigForm.model.profiles[0].name).to.equal('dataPublication');

      const savedConfig: any = await service.createConfig('default', 'doiPublishing', appConfigForm.model);
      expect(savedConfig.profiles.dataPublication).to.exist;
      expect(savedConfig.profiles.dataPublication.name).to.be.undefined;
    });
  });
});

describe('SIEM secret-header policy', () => {
  let service: Services.AppConfigs;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    service = new Services.AppConfigs();
    sinon.stub(ConfigModels, 'getModelInfo').returns({ modelName: 'Siem', class: class {} });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
  });
  const stored = {
    destinations: [
      {
        id: 'first',
        headers: {
          Authorization: 'first-auth',
          'X-Api-Key': 'first-key',
          'X-Private': 'private',
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      },
      { id: 'second', headers: { authorization: 'second-auth', 'x-api-key': 'second-key' } },
    ],
  };
  it('masks arbitrary secret headers regardless of casing and keeps Accept public', () => {
    const masked = Reflect.apply(Reflect.get(service, 'maskSecretFields'), service, ['siem', stored]);
    expect(masked.destinations[0].headers.Authorization).to.equal(APP_CONFIG_SECRET_MASK);
    expect(masked.destinations[0].headers['X-Api-Key']).to.equal(APP_CONFIG_SECRET_MASK);
    expect(masked.destinations[0].headers['X-Private']).to.equal(APP_CONFIG_SECRET_MASK);
    expect(masked.destinations[0].headers.Accept).to.equal('application/json');
    expect(masked.destinations[0].headers['Content-Type']).to.equal('application/json');
    expect(masked.destinations[1].headers.authorization).to.equal(APP_CONFIG_SECRET_MASK);
  });
  it('matches preserved headers by destination ID and case after reordering; explicitly clears secrets', () => {
    const merged = Reflect.apply(Reflect.get(service, 'mergeSecretFields'), service, [
      'siem',
      {
        destinations: [
          { id: 'second', headers: { Authorization: APP_CONFIG_SECRET_MASK, 'X-API-KEY': APP_CONFIG_SECRET_MASK } },
          { id: 'first', headers: { authorization: APP_CONFIG_SECRET_MASK, 'x-api-key': '__CLEAR_SECRET__' } },
          { id: 'new', headers: { Authorization: APP_CONFIG_SECRET_MASK } },
        ],
      },
      stored,
    ]);
    expect(merged.destinations[0].headers).to.deep.equal({ Authorization: 'second-auth', 'X-API-KEY': 'second-key' });
    expect(merged.destinations[1].headers).to.deep.equal({ authorization: 'first-auth' });
    expect(merged.destinations[2].headers).to.deep.equal({});
  });
  it('masks configured runtime defaults when there is no stored row', async () => {
    Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([]) });
    Reflect.set(sails.config, 'brandingConfigurationDefaults', { siem: stored });
    const result = await service.getAppConfigByBrandAndKey('brand', 'siem');
    expect(JSON.stringify(result)).not.to.include('first-auth');
    expect(JSON.stringify(result)).not.to.include('first-key');
  });
  it('masks reserved literal header names in legacy stored config reads', async () => {
    const headers = JSON.parse(
      '{"constructor":"legacy-constructor","prototype":"legacy-prototype","__proto__":"legacy-proto","Accept":"visible"}'
    );
    const legacy = { destinations: [{ id: 'legacy', headers }] };
    Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([{ configData: legacy }]) });
    const result = await service.getAppConfigByBrandAndKey('brand', 'siem');
    expect(JSON.stringify(result)).not.to.include('legacy-constructor');
    expect(JSON.stringify(result)).not.to.include('legacy-prototype');
    expect(JSON.stringify(result)).not.to.include('legacy-proto');
    expect(JSON.stringify(result)).to.include('visible');
    expect(headers.constructor).to.equal('legacy-constructor');
    expect(Object.getPrototypeOf(headers)).to.equal(Object.prototype);
  });
});

describe('SIEM generic AppConfig persistence validation', () => {
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
  });
  it('rejects invalid configuration through the registered form adapter before writes', async () => {
    setupServiceTestGlobals(createMockSails());
    const create = sinon.stub();
    const updateOne = sinon.stub();
    Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([]), create, updateOne });
    const service = new Services.AppConfigs();
    const brand = Object.assign(createMockSails(), { id: 'brand', name: 'default' });
    let rejected = false;
    try {
      await service.createOrUpdateConfig(brand, 'siem', { delivery: { batchSize: -1 } });
    } catch (error) {
      rejected = error instanceof Error && error.message.includes('batchSize');
    }
    expect(rejected).to.equal(true);
    expect(create.called).to.equal(false);
    expect(updateOne.called).to.equal(false);
  });
});

// Exercise the public persistence entry point with the real SIEM model registration.
describe('SIEM credentials remain bound to their collector target', () => {
  const target = { id: 'one', adapterType: 'cef', endpointUrl: 'https://collector.example/ingest' };
  const stored = {
    destinations: [
      {
        ...target,
        token: 'original-token',
        password: 'original-password',
        headers: { 'X-Private': 'original-private', 'X-Api-Key': 'original-key', 'X-Test': 'original-test' },
      },
    ],
  };
  let service: Services.AppConfigs;
  let create: sinon.SinonStub;
  let updateOne: sinon.SinonStub;
  let set: sinon.SinonStub;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails());
    service = new Services.AppConfigs();
    create = sinon.stub();
    set = sinon.stub().callsFake(async data => data);
    updateOne = sinon.stub().returns({ set });
    Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([{ configData: stored }]), create, updateOne });
    sinon.stub(service, 'refreshBrandingAppConfigMap').resolves();
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
  });
  const brand = () => Object.assign(createMockSails(), { id: 'brand', name: 'default' });
  for (const change of [
    { endpointUrl: 'https://edited.example/ingest' },
    { endpointUrl: 'https://collector.example/another-path' },
    { endpointUrl: 'https://collector.example/ingest?target=edited' },
    { adapterType: 'leef' },
  ]) {
    for (const secret of [
      { token: APP_CONFIG_SECRET_MASK },
      { password: APP_CONFIG_SECRET_MASK },
      { headers: { 'x-private': APP_CONFIG_SECRET_MASK } },
      { headers: { 'x-api-key': APP_CONFIG_SECRET_MASK } },
      { headers: { 'x-test': APP_CONFIG_SECRET_MASK } },
    ]) {
      it(`rejects changed target ${JSON.stringify(change)} with ${JSON.stringify(secret)} before writes`, async () => {
        let message = '';
        try {
          await service.createOrUpdateConfig(brand(), 'siem', { destinations: [{ ...target, ...change, ...secret }] });
        } catch (error) {
          message = error instanceof Error ? error.message : String(error);
        }
        expect(message).to.include('Replace or explicitly clear every masked credential');
        expect(create.called).to.equal(false);
        expect(updateOne.called).to.equal(false);
      });
    }
  }
  it('masks custom X-Test headers on public reads and restores their masks on same-target saves', async () => {
    const config = {
      destinations: [
        {
          ...target,
          headers: {
            'X-Test': 'staging-secret',
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'User-Agent': 'ReDBox',
          },
        },
      ],
    };
    Reflect.set(global, 'AppConfig', {
      find: sinon.stub().resolves([{ configData: config }]),
      create,
      updateOne,
    });
    const masked = normalizeSiemConfiguration(await service.getAppConfigByBrandAndKey('brand', 'siem'));
    expect(masked.destinations[0].headers['X-Test']).to.equal(APP_CONFIG_SECRET_MASK);
    expect(masked.destinations[0].headers.Accept).to.equal('application/json');
    expect(masked.destinations[0].headers['Content-Type']).to.equal('application/json');
    expect(masked.destinations[0].headers['User-Agent']).to.equal('ReDBox');
    expect(JSON.stringify(masked)).not.to.include('staging-secret');
    await service.createOrUpdateConfig(brand(), 'siem', {
      destinations: [{ ...target, headers: { 'x-test': APP_CONFIG_SECRET_MASK, Accept: 'text/plain' } }],
    });
    expect(set.firstCall.args[0].configData.destinations[0].headers).to.deep.equal({
      'x-test': 'staging-secret',
      Accept: 'text/plain',
    });
  });
  it('saves an adapter switch with hidden credentials omitted and visible credentials replaced', async () => {
    await service.createOrUpdateConfig(brand(), 'siem', {
      destinations: [
        {
          ...target,
          adapterType: 'splunk-hec-json',
          token: 'replacement-token',
          headers: { 'X-Private': '', 'X-Api-Key': '' },
        },
      ],
    });
    const destination = set.firstCall.args[0].configData.destinations[0];
    expect(destination.token).to.equal('replacement-token');
    expect(destination.password).to.equal(undefined);
    expect(destination.headers).to.deep.equal({ 'X-Private': '', 'X-Api-Key': '' });
    expect(JSON.stringify(destination)).not.to.include('original-');
  });
  it('saves a token-to-text adapter switch without restoring the omitted token', async () => {
    Reflect.set(global, 'AppConfig', {
      find: sinon
        .stub()
        .resolves([
          { configData: { destinations: [{ ...target, adapterType: 'splunk-hec-json', token: 'original-token' }] } },
        ]),
      create,
      updateOne,
    });
    await service.createOrUpdateConfig(brand(), 'siem', {
      destinations: [{ ...target, username: 'replacement-user', password: 'replacement-password' }],
    });
    const destination = set.firstCall.args[0].configData.destinations[0];
    expect(destination.adapterType).to.equal('cef');
    expect(destination.token).to.equal(undefined);
    expect(destination.username).to.equal('replacement-user');
    expect(destination.password).to.equal('replacement-password');
    expect(JSON.stringify(destination)).not.to.include('original-token');
  });
  it('allows explicit replacement and clearing of credentials for an edited target', async () => {
    await service.createOrUpdateConfig(brand(), 'siem', {
      destinations: [
        {
          ...target,
          endpointUrl: 'https://edited.example/ingest',
          token: 'replacement-token',
          password: '__CLEAR_SECRET__',
          headers: { 'X-Private': '__CLEAR_SECRET__', 'X-Api-Key': 'replacement-key' },
        },
      ],
    });
    const destination = set.firstCall.args[0].configData.destinations[0];
    expect(destination.token).to.equal('replacement-token');
    expect(destination.password).to.equal(undefined);
    expect(destination.headers).to.deep.equal({ 'X-Api-Key': 'replacement-key' });
    expect(JSON.stringify(destination)).not.to.include('original-');
  });
  it('rejects moving masked runtime-default credentials on the first persisted save', async () => {
    Reflect.set(global, 'AppConfig', { find: sinon.stub().resolves([]), create, updateOne });
    sinon.stub(service, 'getAppConfigurationForBrand').returns(Object.assign(createMockSails(), { siem: stored }));
    let message = '';
    try {
      await service.createOrUpdateConfig(brand(), 'siem', {
        destinations: [{ ...target, endpointUrl: 'https://edited.example/ingest', token: APP_CONFIG_SECRET_MASK }],
      });
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).to.include('Replace or explicitly clear');
    expect(create.called).to.equal(false);
    expect(updateOne.called).to.equal(false);
  });
  it('preserves same-target masks through routine edits and header casing changes', async () => {
    await service.createOrUpdateConfig(brand(), 'siem', {
      destinations: [
        {
          ...target,
          name: 'Renamed collector',
          enabled: false,
          token: APP_CONFIG_SECRET_MASK,
          password: APP_CONFIG_SECRET_MASK,
          headers: { 'x-private': APP_CONFIG_SECRET_MASK },
        },
      ],
    });
    const destination = set.firstCall.args[0].configData.destinations[0];
    expect(destination.token).to.equal('original-token');
    expect(destination.password).to.equal('original-password');
    expect(destination.headers).to.deep.equal({ 'x-private': 'original-private' });
  });
  it('returns a 400 from generic AppConfig save for credential target validation errors', async () => {
    const badRequest = sinon.stub();
    const serverError = sinon.stub();
    sails.services.appconfigservice = {
      createOrUpdateConfig: sinon
        .stub()
        .rejects(new SiemConfigurationError('Replace or explicitly clear every masked credential')),
    };
    sails.services.brandingservice = { getBrand: () => brand() };
    const req = Object.assign(createMockSails(), {
      session: { branding: 'default' },
      param: () => 'siem',
      body: stored,
    });
    const res = Object.assign(createMockSails(), { badRequest, serverError });
    await new AppConfigControllers.AppConfig().saveAppConfig(req, res);
    expect(badRequest.calledOnceWith('Replace or explicitly clear every masked credential')).to.equal(true);
    expect(serverError.called).to.equal(false);
  });
});
