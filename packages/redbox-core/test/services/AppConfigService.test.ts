let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { APP_CONFIG_SECRET_MASK, Services } from '../../src/services/AppConfigService';
import { ConfigModels } from '../../src/configmodels/ConfigModels';
import { DoiPublishing, fromDoiPublishingFormModel, toDoiPublishingFormModel } from '../../src/configmodels/DoiPublishing';
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
      updateOne: sinon.stub().returns({ set: sinon.stub().callsFake(() => mockDeferred({ configData: {} })) })
    };

    (global as any).BrandingService = {
      getAvailable: sinon.stub().returns(['default']),
      getBrand: sinon.stub().returns({ id: 'brand1', name: 'default' })
    };

    sinon.stub(ConfigModels, 'getConfigKeys').returns([]);
    sinon.stub(ConfigModels, 'getModelInfo').returns({ modelName: 'MockModel', class: class MockModel { } });

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

  describe('secret fields', function () {
    it('should mask secret fields when reading config', async function () {
      class SecretModel {
        connection = { token: 'secret-token' };
      }
      (ConfigModels.getModelInfo as sinon.SinonStub).returns({
        modelName: 'SecretModel',
        class: SecretModel,
        secretFields: ['connection.token']
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
        secretFields: ['connection.token']
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
        configData: { connection: { token: 'secret-token' } }
      });
      expect(result.connection.token).to.equal(APP_CONFIG_SECRET_MASK);
    });

    it('should prefer the most recently updated duplicate config record when loading app config', async function () {
      (ConfigModels.getConfigKeys as sinon.SinonStub).returns(['doiPublishing']);
      (ConfigModels.getModelInfo as sinon.SinonStub).callsFake((key: string) => {
        if (key === 'doiPublishing') {
          return {
            modelName: 'DoiPublishing',
            class: DoiPublishing
          };
        }
        return {
          modelName: 'MockModel',
          class: class MockModel { }
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
                retryOnMethods: ['get', 'put', 'patch', 'delete']
              }
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true
            },
            profiles: {}
          }
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
                retryOnMethods: ['get', 'put', 'patch', 'delete']
              }
            },
            operations: {
              createEvent: 'publish',
              updateEvent: 'publish',
              allowDeleteDraft: true,
              allowStateChange: true
            },
            profiles: {}
          }
        }
      ];

      (global as any).AppConfig.find = sinon.stub().callsFake((criteria: Record<string, unknown>) => {
        const records = duplicateRecords.filter((record) => {
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
                  type: 'array'
                }
              }
            },
            formAdapter: {
              toForm: toDoiPublishingFormModel,
              fromForm: fromDoiPublishingFormModel
            }
          };
        }
        return {
          modelName: 'MockModel',
          class: class MockModel { }
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
            citationDoiPath: 'metadata.citation_doi'
          },
          validation: {
            requireUrl: true,
            requirePublisher: true,
            requirePublicationYear: true,
            requireCreators: true,
            requireTitles: true
          }
        } as any
      };
      service.brandingAppConfigMap = {
        default: {
          doiPublishing
        }
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
