let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { Services } from '../../src/services/AppConfigService';
import { ConfigModels } from '../../src/configmodels/ConfigModels';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('AppConfigService', function() {
  let service: Services.AppConfigs;
  let mockSails: any;

  beforeEach(function() {
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
    sinon.stub(ConfigModels, 'getModelInfo').returns({ modelName: 'MockModel', class: class MockModel {} });

    service = new Services.AppConfigs();
    service.brandingAppConfigMap = {};
  });

  afterEach(function() {
    cleanupServiceTestGlobals();
    delete (global as any).AppConfig;
    delete (global as any).BrandingService;
    sinon.restore(); // Restores ConfigModels stubs
  });

  describe('bootstrap', function() {
    it('should load config for brands', async function() {
      await service.bootstrap();
      // Should populate brandingAppConfigMap
      const config = service.getAppConfigurationForBrand('default');
      expect(config).to.not.be.undefined;
    });
  });

  describe('createConfig', function() {
    it('should create new config', async function() {
      // Need to populate map first or mock refreshBrandingAppConfigMap
      // We can just rely on refreshBrandingAppConfigMap calling loadAppConfigurationModel which works with mocks
      
      const data = { key: 'val' };
      const result = await service.createConfig('default', 'key', JSON.stringify(data));
      
      expect(result).to.equal(JSON.stringify(data));
      expect((global as any).AppConfig.create.called).to.be.true;
    });

    it('should throw if config exists', async function() {
      const mockDeferred = (result: unknown) => {
        const p: any = Promise.resolve(result);
        p.exec = sinon.stub().yields(null, result);
        return p;
      };
      
      (global as any).AppConfig.findOne.callsFake(() => mockDeferred({}));
      try {
        await service.createConfig('default', 'key', '{}');
        expect.fail('Should have thrown');
      } catch (e: unknown) {
        expect(e instanceof Error ? e.message : String(e)).to.contain('already exists');
      }
    });
  });
});
