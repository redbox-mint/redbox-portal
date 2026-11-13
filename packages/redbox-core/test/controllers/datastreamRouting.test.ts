import { expect } from 'chai';
import express from 'express';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import * as sinon from 'sinon';
import { Controllers as BrowserControllers } from '../../src/controllers/RecordController';
import { Controllers as ApiControllers } from '../../src/controllers/webservice/RecordController';
import { routes, type RouteTarget } from '../../src/config/routes.config';
import { policies, type ControllerPolicies } from '../../src/config/policies.config';
import { brandingAndPortal } from '../../src/policies/brandingAndPortal';
import { checkAuth } from '../../src/policies/checkAuth';
import { isWebServiceAuthenticated } from '../../src/policies/isWebServiceAuthenticated';
import { validateApiContractRequest } from '../../src/policies/validateApiContractRequest';
import { createMockSails } from '../services/testHelper';

type Middleware = (req: Sails.Req, res: Sails.Res, next: Sails.NextFunction) => void;
interface RoutingSails {
  _actions: Record<string, (req: Sails.Req, res: Sails.Res) => Promise<unknown>>;
  _actionMiddleware: Record<string, Middleware[]>;
  router: {
    bind(address: string, target: RouteTarget): void;
    _privateRouter: express.RequestHandler;
  };
}
const { Sails: SailsApp } = require('sails') as { Sails: new () => RoutingSails };

describe('Protected datastream routing through Sails', function () {
  const globalNames = ['sails', 'BrandingService', 'TranslationService', 'RolesService', 'PathRulesService'];
  const brand = { id: 'brand-a', name: 'default' };
  const record = { redboxOid: 'synthetic-record', metaMetadata: { brandId: brand.id }, metadata: {} };
  const filename = 'synthetic-report.pdf';
  const bytes = Buffer.from('%PDF synthetic routing fixture');
  let originals: unknown[];
  let server: Server;
  let baseUrl: string;
  let authenticated: boolean;
  let records: { getMeta: sinon.SinonStub; getAttachments: sinon.SinonStub; hasViewAccess: sinon.SinonStub };
  let getDatastream: sinon.SinonStub;

  for (const kind of ['browser', 'api'] as const) {
    describe(kind, function () {
      const controllerName = kind === 'browser' ? 'RecordController' : 'webservice/RecordController';
      const actionIdentity = `${kind === 'browser' ? '' : 'webservice/'}record/getdatastream`;
      const address =
        kind === 'browser'
          ? 'get /:branding/:portal/record/:oid/datastream*'
          : 'get /:branding/:portal/api/records/datastreams/:oid/:datastreamId';
      const url =
        kind === 'browser'
          ? `/default/rdmp/record/synthetic-record/datastream/${filename}?datastreamId=${filename}`
          : `/default/rdmp/api/records/datastreams/synthetic-record/${filename}`;

      beforeEach(async function () {
        originals = globalNames.map(name => Reflect.get(globalThis, name));
        authenticated = true;
        records = {
          getMeta: sinon.stub().resolves(record),
          getAttachments: sinon.stub().resolves([{ fileId: filename, name: filename, mimeType: 'application/pdf' }]),
          hasViewAccess: sinon.stub().returns(true),
        };
        getDatastream = sinon.stub().resolves({ body: bytes });
        Reflect.set(
          globalThis,
          'sails',
          createMockSails({
            config: {
              // Invalid bearer credentials continue to path authorization as a guest.
              passport: {
                authenticate: (_strategy: string, callback: (error: null, user: false) => void) => () =>
                  callback(null, false),
              },
            },
          })
        );
        Reflect.set(globalThis, 'BrandingService', { getBrand: () => brand });
        Reflect.set(globalThis, 'TranslationService', { t: (key: string) => key });
        Reflect.set(globalThis, 'RolesService', { getDefUnathenticatedRole: () => ({ name: 'Guest' }) });
        Reflect.set(globalThis, 'PathRulesService', {
          getRulesFromPath: () => [{ path: address }],
          canRead: (_rules: unknown, roles: Array<{ name: string }>) => roles.some(role => role.name === 'Reader'),
        });

        const controller = kind === 'browser' ? new BrowserControllers.Record() : new ApiControllers.Record();
        // Use the real controllers and their brand, membership and access checks;
        // storage and records are local fixtures, with no application lift.
        Object.assign(controller, {
          recordsService: records,
          RecordsService: records,
          datastreamService: { getDatastream },
          DatastreamService: { getDatastream },
        });
        const appSails = new SailsApp();
        appSails._actions[actionIdentity] = controller.getDataStream.bind(controller);
        const controllerPolicies = policies[controllerName] as ControllerPolicies;
        const chain = controllerPolicies.getDataStream ?? controllerPolicies['*'];
        expect(chain).to.be.an('array').that.includes('checkAuth').and.includes('isWebServiceAuthenticated');
        const activePolicies: Record<string, Middleware> = {
          brandingAndPortal,
          checkAuth,
          isWebServiceAuthenticated,
          validateApiContractRequest,
        };
        // Presentation and session setup are supplied by the HTTP fixture.
        appSails._actionMiddleware[actionIdentity] = (chain as string[]).map(
          name => activePolicies[name] ?? ((_req, _res, next) => next())
        );
        appSails.router.bind(address, routes[address]);

        const app = express();
        app.use((req, _res, next) => {
          Object.assign(req, {
            session: {},
            user: authenticated ? { username: 'synthetic-reader', roles: [{ name: 'Reader' }] } : undefined,
            isAuthenticated: () => authenticated,
            param: (name: string) => req.params[name] ?? req.query[name],
          });
          next();
        });
        app.use(appSails.router._privateRouter);
        server = createServer(app);
        server.listen(0, '127.0.0.1');
        await once(server, 'listening');
        const listening = server.address();
        if (!listening || typeof listening === 'string') throw new Error('Expected an ephemeral HTTP port');
        baseUrl = `http://127.0.0.1:${listening.port}`;
      });

      afterEach(async function () {
        if (server?.listening)
          await new Promise<void>((resolve, reject) => server.close(error => (error ? reject(error) : resolve())));
        globalNames.forEach((name, index) => Reflect.set(globalThis, name, originals[index]));
        sinon.restore();
      });

      it('dispatches a filename with an extension and downloads authorized bytes', async function () {
        const response = await fetch(baseUrl + url);
        expect(response.status, await response.clone().text()).to.equal(200);
        expect(Buffer.from(await response.arrayBuffer())).to.deep.equal(bytes);
        expect(response.headers.get('content-disposition')).to.include(filename);
        sinon.assert.calledOnceWithExactly(records.getMeta, 'synthetic-record');
        sinon.assert.calledOnceWithExactly(
          records.hasViewAccess,
          brand,
          { username: 'synthetic-reader', roles: [{ name: 'Reader' }] },
          [{ name: 'Reader' }],
          record
        );
        sinon.assert.calledOnceWithExactly(getDatastream, 'synthetic-record', filename, {
          username: 'synthetic-reader',
        });
      });

      it('runs path authorization before the controller for an unauthenticated caller', async function () {
        authenticated = false;
        const response = await fetch(baseUrl + url, { headers: { 'content-type': 'application/json' } });
        expect(response.status, await response.clone().text()).to.equal(403);
        await response.text();
        sinon.assert.notCalled(records.getMeta);
        sinon.assert.notCalled(getDatastream);
      });

      it('denies record access before attachment lookup or byte retrieval', async function () {
        records.hasViewAccess.returns(false);
        const response = await fetch(baseUrl + url);
        expect(response.status, await response.clone().text()).to.equal(403);
        expect(response.headers.has('content-disposition')).to.equal(false);
        await response.text();
        sinon.assert.calledOnce(records.hasViewAccess);
        sinon.assert.notCalled(records.getAttachments);
        sinon.assert.notCalled(getDatastream);
      });

      it('does not retrieve attachments from a different brand', async function () {
        records.getMeta.resolves({ ...record, metaMetadata: { brandId: 'another-brand' } });
        const response = await fetch(baseUrl + url);
        expect(response.status, await response.clone().text()).to.equal(404);
        await response.text();
        sinon.assert.notCalled(records.hasViewAccess);
        sinon.assert.notCalled(getDatastream);
      });

      it('requires stored datastream membership before retrieving bytes', async function () {
        records.getAttachments.resolves([]);
        const response = await fetch(baseUrl + url);
        expect(response.status, await response.clone().text()).to.equal(404);
        await response.text();
        sinon.assert.calledOnce(records.hasViewAccess);
        sinon.assert.notCalled(getDatastream);
      });

      if (kind === 'api') {
        it('preserves authorization and not-found statuses in API v2 error responses', async function () {
          for (const status of [403, 404]) {
            records.hasViewAccess.returns(status !== 403);
            records.getAttachments.resolves([]);
            const response = await fetch(baseUrl + url, { headers: { 'x-redbox-api-version': '2.0' } });
            expect(response.status, await response.clone().text()).to.equal(status);
            expect(await response.json())
              .to.have.property('errors')
              .that.is.an('array')
              .with.length(1);
            sinon.assert.notCalled(getDatastream);
          }
        });
      }

      if (kind === 'browser') {
        it('retains the browser query-string download URL', async function () {
          const response = await fetch(
            `${baseUrl}/default/rdmp/record/synthetic-record/datastream?datastreamId=${filename}`
          );
          expect(response.status, await response.clone().text()).to.equal(200);
          expect(Buffer.from(await response.arrayBuffer())).to.deep.equal(bytes);
        });
      }
    });
  }
});
