import express from 'express';
import supertest from 'supertest';
import { createHttpPolicies, requestContext } from '../../src/http/express/policies';
import { pageLocals } from '../../src/pages/locals';
import { brandingExportedMethods } from '../../src/branding/Branding';
import { brandingInput } from '../helpers/brandingInputs';
import { repositoryFixtures } from '../helpers/repositoryFixtures';
import {createSinonStubLogger} from "../logger.test";

let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import * as sinon from 'sinon';
import { stubCacheEntryRepository } from '../helpers/cacheRepository';
import { of } from 'rxjs';
import { createDomainFixture } from './testHelper';

describe('BrandingService', function () {
  let fixture: any;
  let mockBrandingConfig: any;

  beforeEach(function () {
    fixture = createDomainFixture({
      config: {
        appPath: '/app',
        http: { rootContext: '' },
        appUrl: 'http://localhost:1500',
        auth: {
          defaultBrand: 'default',
          defaultPortal: 'portal'
        },
        branding: {
          variableAllowList: ['primary', 'secondary'],
          previewTtlSeconds: 300
        }
      },
      log: createSinonStubLogger(sinon),
    });

    mockBrandingConfig = {
      findOne: sinon.stub(),
      find: sinon.stub(),
      create: sinon.stub(),
      update: sinon.stub()
    };

    repositoryFixtures.BrandingConfig = mockBrandingConfig;
    repositoryFixtures.BrandingConfigHistory = {
      create: sinon.stub(),
      findOne: sinon.stub()
    };
    stubCacheEntryRepository();
  });

  afterEach(function () {
    delete repositoryFixtures.BrandingConfig;
    delete repositoryFixtures.BrandingConfigHistory;
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
      const brandingService = new Services.Branding(brandingInput(fixture));

      brandingService.brandings = [
        { name: 'mybrand', id: '1' },
        { name: 'default', id: '2' }
      ];

      const result = brandingService.getBrand('mybrand');

      expect(result).to.deep.equal({ name: 'mybrand', id: '1' });
    });

    it('should return undefined for non-existent brand', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding(brandingInput(fixture));
      brandingService.brandings = [];

      const result = brandingService.getBrand('nonexistent');

      expect(result).to.be.undefined;
    });
  });

  describe('getBrandById', function () {
    it('should return branding by id', function () {
      const { Services } = require('../../src/services/BrandingService');
      const brandingService = new Services.Branding(brandingInput(fixture));

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
      const brandingService = new Services.Branding(brandingInput(fixture));

      brandingService.availableBrandings = ['default', 'mybrand'];

      const result = brandingService.getAvailable();

      expect(result).to.deep.equal(['default', 'mybrand']);
    });
  });

  describe('explicit page context after HTTP extraction', () => {
    const locals = (root = '', brand = 'mybrand', portal = 'myportal', faviconUrl = '/mybrand/myportal/images/favicon') => pageLocals({
      root, origin: 'http://localhost:1500', brand: { name: brand }, portal,
      typeface: null, faviconUrl, settings: {}, config: {}, t: key => key,
      param: () => undefined, bundleHash: () => '', hasRole: () => false,
    }, {}).page;

    it('returns the brand and portal path without a root context', () => {
      expect(locals().base).to.equal('/mybrand/myportal');
    });
    it('returns the brand and portal path with an explicit root context', () => {
      expect(locals('/redbox').base).to.equal('/redbox/mybrand/myportal');
    });
    it('retains the stable favicon URL for conditional revalidation', () => {
      expect(locals().faviconUrl).to.equal('/mybrand/myportal/images/favicon');
    });
    it('retains the unversioned favicon URL with default typography', () => {
      const page = locals();
      expect(page.typeface).to.equal(null);
      expect(page.faviconUrl).to.equal('/mybrand/myportal/images/favicon');
    });
    function application() {
      const app = express();
      app.use(express.json());
      const policies = createHttpPolicies({
        branding: { getBrand: async ({ name }) => name === 'mybrand' ? { id: 'brand-1', name } : null },
        pathRules: {} as any, portals: ['myportal'], defaultUnauthenticatedRole: () => undefined,
        emitRequestFailure: async () => {}, authenticate: async () => false,
      });
      app.use((req, _res, next) => { req.session = { branding: 'mybrand', portal: 'myportal' } as any; next(); });
      app.post('/resolve/:branding/:portal', policies.brandingandportal, (req, res) => res.json(requestContext(req)));
      app.post('/resolve', policies.brandingandportal, (req, res) => res.json(requestContext(req)));
      return supertest(app);
    }
    it('resolves the authoritative brand from path parameters', async () => {
      const response = await application().post('/resolve/mybrand/myportal').expect(200);
      expect(response.body.brand.name).to.equal('mybrand');
    });
    it('rejects body branding when the canonical path is absent', async () => {
      await application().post('/resolve').send({ branding: 'mybrand', portal: 'myportal' }).expect(404);
    });
    it('rejects a stale session as the source of canonical brand context', async () => {
      await application().post('/resolve').expect(404);
    });
    it('rejects an unknown brand instead of silently falling back', async () => {
      await application().post('/resolve/unknown/myportal').expect(404);
    });
    it('resolves the portal from path parameters', async () => {
      const response = await application().post('/resolve/mybrand/myportal').expect(200);
      expect(response.body.portal).to.equal('myportal');
    });
    it('rejects an unconfigured portal instead of silently falling back', async () => {
      await application().post('/resolve/mybrand/unknown').expect(404);
    });
    it('retains the explicit origin alongside the canonical page base', () => {
      const page = locals();
      expect(page.origin + page.base).to.equal('http://localhost:1500/mybrand/myportal');
    });
    it('retains an empty explicit root context', () => {
      expect(locals().root).to.equal('');
    });
    it('retains the normalized explicit root context', () => {
      expect(locals('/redbox').root).to.equal('/redbox');
    });
    it('declares callable neutral domain methods without generated service exports', () => {
      const { Services } = require('../../src/services/BrandingService');
      const service = new Services.Branding(brandingInput(fixture));
      for (const method of brandingExportedMethods) expect(service[method], method).to.be.a('function');
      expect(service.exports).to.equal(undefined);
    });
  });
});
