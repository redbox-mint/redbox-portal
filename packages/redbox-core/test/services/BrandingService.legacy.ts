// Explicit retained Express adapter cases, removed with FM-043.
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

  describe('explicit page context after HTTP extraction', () => {
    const locals = (root = '', brand = 'mybrand', portal = 'myportal', faviconUrl = '/mybrand/myportal/images/favicon') => pageLocals({
      root, origin: 'http://localhost:1500', brand: { name: brand }, portal,
      typeface: null, faviconUrl, settings: {}, config: {}, t: key => key,
      param: () => undefined, bundleHash: () => '', hasRole: () => false,
    }, {}).page;

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

  });
});
