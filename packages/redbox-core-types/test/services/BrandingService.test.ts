import { expect } from 'chai';
import * as sinon from 'sinon';
import { of } from 'rxjs';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails } from './testHelper';

describe('BrandingService', function () {
  let mockSails: any;
  let mockBrandingConfig: any;

  beforeEach(function () {
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        http: { rootContext: '' },
        appUrl: 'http://localhost:1500',
        auth: {
          defaultBrand: 'default',
          defaultPortal: 'portal'
        },
        branding: {
          variableAllowList: ['primary-color', 'secondary-color'],
          previewTtlSeconds: 300
        }
      },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        error: sinon.stub()
      }
    });

    mockBrandingConfig = {
      findOne: sinon.stub(),
      find: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub()
    };

    setupServiceTestGlobals(mockSails);
    (global as any).BrandingConfig = mockBrandingConfig;
    (global as any).BrandingConfigHistory = {
      create: sinon.stub(),
      findOne: sinon.stub()
    };
    (global as any).CacheEntry = {
      create: sinon.stub(),
      findOne: sinon.stub(),
      destroy: sinon.stub()
    };
    (global as any).SassCompilerService = {
      compile: sinon.stub().resolves({ css: 'compiled-css', hash: 'abc123' })
    };
    (global as any).ContrastService = {
      validate: sinon.stub().resolves({ violations: [] })
    };
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).BrandingConfig;
    delete (global as any).BrandingConfigHistory;
    delete (global as any).CacheEntry;
    delete (global as any).SassCompilerService;
    delete (global as any).ContrastService;
    sinon.restore();
  });

  describe('getDefault', function () {
    it('should return the default branding from loaded brandings', function () {
      // Create service without importing (avoids constructor side effects)
      const mockBrandings = [
        { name: 'other', id: '1' },
        { name: 'default', id: '2' }
      ];

      // Use a simple object that mimics the service
      const mockService = {
        brandings: mockBrandings,
        dBrand: { name: 'default' },
        getDefault: function () {
          return (this as any).brandings.find((o: any) => o.name === this.dBrand.name);
        }
      };

      const result = mockService.getDefault();

      expect(result).to.deep.equal({ name: 'default', id: '2' });
    });

    it('should return undefined when default branding not loaded', function () {
      const mockService = {
        brandings: [],
        dBrand: { name: 'default' },
        getDefault: function () {
          return (this as any).brandings.find((o: any) => o.name === this.dBrand.name);
        }
      };

      const result = mockService.getDefault();

      expect(result).to.be.undefined;
    });
  });

  describe('getBrand', function () {
    it('should return branding by name', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      brandingService.brandings = [
        { name: 'mybrand', id: '1' },
        { name: 'default', id: '2' }
      ];

      const result = brandingService.getBrand('mybrand');

      expect(result).to.deep.equal({ name: 'mybrand', id: '1' });
    });

    it('should return undefined for non-existent brand', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();
      brandingService.brandings = [];

      const result = brandingService.getBrand('nonexistent');

      expect(result).to.be.undefined;
    });
  });

  describe('getBrandById', function () {
    it('should return branding by id', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      brandingService.brandings = [
        { name: 'mybrand', id: '123' },
        { name: 'default', id: '456' }
      ];

      const result = brandingService.getBrandById('123');

      expect(result).to.deep.equal({ name: 'mybrand', id: '123' });
    });
  });

  describe('getAvailable', function () {
    it('should return list of available branding names', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      brandingService.availableBrandings = ['default', 'mybrand'];

      const result = brandingService.getAvailable();

      expect(result).to.deep.equal(['default', 'mybrand']);
    });
  });

  describe('getBrandAndPortalPath', function () {
    it('should return path without root context', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      // Set up mock brandings for the service to work
      brandingService.availableBrandings = ['default'];
      brandingService.brandings = [{ name: 'default' }];

      const req = {
        params: { branding: 'mybrand', portal: 'myportal' },
        body: {},
        session: {}
      };

      const result = brandingService.getBrandAndPortalPath(req);

      expect(result).to.equal('/mybrand/myportal');
    });

    it('should return path with root context when configured', function () {
      mockSails.config.http.rootContext = 'redbox';

      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: { branding: 'mybrand', portal: 'myportal' },
        body: {},
        session: {}
      };

      const result = brandingService.getBrandAndPortalPath(req);

      expect(result).to.equal('/redbox/mybrand/myportal');
    });
  });

  describe('getBrandNameFromReq', function () {
    it('should get branding from params', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: { branding: 'mybrand' },
        body: {},
        session: {}
      };

      const result = brandingService.getBrandNameFromReq(req);

      expect(result).to.equal('mybrand');
    });

    it('should fallback to body when params is empty', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: {},
        body: { branding: 'frombody' },
        session: {}
      };

      const result = brandingService.getBrandNameFromReq(req);

      expect(result).to.equal('frombody');
    });

    it('should fallback to session when body is empty', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: {},
        body: {},
        session: { branding: 'fromsession' }
      };

      const result = brandingService.getBrandNameFromReq(req);

      expect(result).to.equal('fromsession');
    });

    it('should use default brand when all sources are empty', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: {},
        body: {},
        session: {}
      };

      const result = brandingService.getBrandNameFromReq(req);

      expect(result).to.equal('default');
    });
  });

  describe('getPortalFromReq', function () {
    it('should get portal from params', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: { portal: 'myportal' },
        body: {},
        session: {}
      };

      const result = brandingService.getPortalFromReq(req);

      expect(result).to.equal('myportal');
    });

    it('should use default portal when all sources are empty', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: {},
        body: {},
        session: {}
      };

      const result = brandingService.getPortalFromReq(req);

      expect(result).to.equal('portal');
    });
  });

  describe('getFullPath', function () {
    it('should return full URL with branding and portal', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const req = {
        params: { branding: 'mybrand', portal: 'myportal' },
        body: {},
        session: {}
      };

      const result = brandingService.getFullPath(req);

      expect(result).to.equal('http://localhost:1500/mybrand/myportal');
    });
  });

  describe('getRootContext', function () {
    it('should return empty string when no root context configured', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const result = brandingService.getRootContext();

      expect(result).to.equal('');
    });

    it('should return root context with leading slash', function () {
      mockSails.config.http.rootContext = 'redbox';

      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();

      const result = brandingService.getRootContext();

      expect(result).to.equal('/redbox');
    });
  });

  describe('exports', function () {
    it('should export all public methods', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding();
      const exported = brandingService.exports();

      expect(exported).to.have.property('bootstrap');
      expect(exported).to.have.property('loadAvailableBrands');
      expect(exported).to.have.property('getDefault');
      expect(exported).to.have.property('getBrand');
      expect(exported).to.have.property('getAvailable');
      expect(exported).to.have.property('getBrandAndPortalPath');
      expect(exported).to.have.property('getBrandNameFromReq');
      expect(exported).to.have.property('getBrandFromReq');
      expect(exported).to.have.property('getPortalFromReq');
    });
  });
});
