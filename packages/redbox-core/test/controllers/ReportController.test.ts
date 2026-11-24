import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { Controllers as AdminReports } from '../../src/controllers/ReportController';
import { Controllers as WebserviceReports } from '../../src/controllers/webservice/ReportController';
import { NamedQueryParameterError } from '../../src/queries/namedQueryParameters';
import { NamedQueryConfig, Services } from '../../src/services/NamedQueryService';

describe('Report controller named-query errors', () => {
  const brand = { id: 'brand-1' };
  const message = 'filter must be a valid JSON object';
  const originalGlobals = new Map<string, PropertyDescriptor | undefined>();
  const req = {
    session: { branding: 'default' },
    param: () => undefined,
    apiRequest: { query: { queryName: 'report', filter: '{"status":' } },
  } as unknown as Sails.Req;

  beforeEach(() => {
    const namedQueryService = new Services.NamedQueryService();
    const config = new NamedQueryConfig({
      collectionName: 'record',
      queryParams: { filter: { type: 'object', path: 'metadata' } },
    });
    const error = new NamedQueryParameterError(message);
    const mocks = {
      sails: { log: { debug: sinon.stub(), error: sinon.stub(), verbose: sinon.stub() } },
      BrandingService: { getBrand: () => brand },
      NamedQueryService: {
        getNamedQueryConfig: async () => config,
        performNamedQueryFromConfig: namedQueryService.performNamedQueryFromConfig.bind(namedQueryService),
      },
      ReportsService: {
        getResults: sinon.stub().rejects(error),
        getCSVResult: sinon.stub().rejects(error),
        previewConfig: sinon.stub().rejects(error),
      },
    };
    for (const [key, mock] of Object.entries(mocks)) {
      originalGlobals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
      Reflect.set(globalThis, key, mock);
    }
  });

  afterEach(() => {
    for (const [key, descriptor] of originalGlobals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    originalGlobals.clear();
  });

  function captureResponse() {
    const status = sinon.stub();
    const json = sinon.stub();
    const res = { status, json, set: sinon.stub() } as unknown as Sails.Res;
    return { res, status, json };
  }

  it('returns 400 when the webservice cannot parse an object parameter', async () => {
    const { res, status, json } = captureResponse();

    await new WebserviceReports.Report().executeNamedQuery(req, res);

    sinon.assert.calledOnceWithExactly(status, 400);
    assert.equal(json.firstCall.args[0].message, message);
  });

  for (const action of ['getResults', 'downloadCSV', 'previewConfig'] as const) {
    it(`returns 400 when the named query rejects an admin ${action} parameter`, async () => {
      const controller = new AdminReports.Report();
      const { res, status, json } = captureResponse();

      if (action === 'getResults') {
        await new Promise<void>(resolve => controller.getResults(req, res).add(resolve));
      } else {
        await controller[action](req, res);
      }

      sinon.assert.calledOnceWithExactly(status, 400);
      assert.equal(json.firstCall.args[0].message, message);
    });
  }
});
