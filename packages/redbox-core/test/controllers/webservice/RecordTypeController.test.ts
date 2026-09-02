import assert from 'node:assert/strict';
import type { Response } from 'express';
import { of } from 'rxjs';
import * as sinon from 'sinon';

import { Controllers } from '../../../src/controllers/webservice/RecordTypeController';
import type { BuildResponseType } from '../../../src/model';

interface CapturedResponse {
  readonly req: Sails.Req;
  readonly res: Sails.Res;
  readonly response: BuildResponseType;
}

interface JsonResponseFixture {
  readonly response: Sails.Res;
  readonly json: sinon.SinonStub<[body: unknown], Sails.Res>;
}

function jsonResponseFixture(): JsonResponseFixture {
  const response: Sails.Res = Object.create(null);
  const set = sinon.stub<[field: string | Record<string, string>, value?: string], Sails.Res>().returns(response);
  const status = sinon.stub<[statusCode: number], Sails.Res>().returns(response);
  const json = sinon.stub<[body: unknown], Sails.Res>().returns(response);
  Reflect.set(response, 'set', set);
  Reflect.set(response, 'status', status);
  Reflect.set(response, 'json', json);
  return { response, json };
}

class TestRecordTypeController extends Controllers.RecordType {
  readonly sentResponses: CapturedResponse[] = [];

  protected override sendResp(req: Sails.Req, res: Sails.Res, response?: BuildResponseType): Response {
    this.sentResponses.push({ req, res, response: response ?? {} });
    return res as unknown as Response;
  }
}

describe('Webservice RecordTypeController schema discovery', function () {
  let controller: TestRecordTypeController;
  let originalSails: unknown;
  let originalBrandingService: unknown;
  let originalRecordTypesService: unknown;
  let getRecordType: sinon.SinonStub;
  let getAllRecordTypes: sinon.SinonStub;

  beforeEach(function () {
    originalSails = Reflect.get(globalThis, 'sails');
    originalBrandingService = Reflect.get(globalThis, 'BrandingService');
    originalRecordTypesService = Reflect.get(globalThis, 'RecordTypesService');
    getRecordType = sinon.stub();
    getAllRecordTypes = sinon.stub();

    Reflect.set(globalThis, 'sails', {
      config: { http: { rootContext: '' }, recordSchema: { enabled: true } },
      log: {
        verbose: sinon.stub(),
        error: sinon.stub(),
      },
    });
    Reflect.set(globalThis, 'BrandingService', {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'internal-brand' }),
      getBrandNameFromReq: sinon.stub().returns('public brand'),
      getPortalFromReq: sinon.stub().returns('portal/subpath'),
      getRootContext: sinon.stub().returns(''),
    });
    Reflect.set(globalThis, 'RecordTypesService', {
      get: getRecordType,
      getAll: getAllRecordTypes,
    });
    controller = new TestRecordTypeController();
  });

  afterEach(function () {
    sinon.restore();
    Reflect.set(globalThis, 'sails', originalSails);
    Reflect.set(globalThis, 'BrandingService', originalBrandingService);
    Reflect.set(globalThis, 'RecordTypesService', originalRecordTypesService);
  });

  it('adds a public create resolver to one record type without replacing existing fields', async function () {
    const storedRecordType = {
      name: 'data set',
      packageType: 'dataset-package',
      searchable: true,
      recordSchema: { unknownProperties: 'declared' },
    };
    getRecordType.returns(of(storedRecordType));
    const req = {
      apiRequest: { params: {}, query: { name: 'data set' }, headers: {}, body: {}, files: {} },
      session: { branding: 'public brand', portal: 'portal/subpath' },
    } as unknown as Sails.Req;

    await controller.getRecordType(req, {} as Sails.Res);

    assert.equal(controller.sentResponses.length, 1);
    assert.deepEqual(controller.sentResponses[0].response.data, {
      ...storedRecordType,
      recordSchemaCreateResolver: '/public%20brand/portal%2Fsubpath/api/records/schemas/create/data%20set',
    });
    assert.equal(Reflect.has(storedRecordType, 'recordSchemaCreateResolver'), false);
    assert.equal(JSON.stringify(controller.sentResponses[0].response.data).includes('/api/forms/get'), false);
  });

  it('adds schema discovery when the enabled flag comes from an environment string', async function () {
    Reflect.set(sails.config.recordSchema, 'enabled', 'true');
    getRecordType.returns(of({ name: 'dataset', packageType: 'dataset-package' }));
    const req = {
      apiRequest: { params: {}, query: { name: 'dataset' }, headers: {}, body: {}, files: {} },
      session: { branding: 'public brand', portal: 'portal/subpath' },
    } as unknown as Sails.Req;

    await controller.getRecordType(req, {} as Sails.Res);

    assert.equal(
      Reflect.get(controller.sentResponses[0].response.data ?? {}, 'recordSchemaCreateResolver'),
      '/public%20brand/portal%2Fsubpath/api/records/schemas/create/dataset'
    );
  });

  it('adds one bounded create resolver to each listed record type without form configuration', async function () {
    const storedRecordTypes = [
      { name: 'dataset', packageType: 'dataset-package' },
      { name: 'publication', packageType: 'publication-package' },
    ];
    getAllRecordTypes.returns(of(storedRecordTypes));
    const req = {
      apiRequest: { params: {}, query: {}, headers: {}, body: {}, files: {} },
      session: { branding: 'public brand', portal: 'portal/subpath' },
    } as unknown as Sails.Req;

    await controller.listRecordTypes(req, {} as Sails.Res);

    const response = controller.sentResponses[0].response.data as {
      readonly summary: { readonly numFound: number };
      readonly records: readonly globalThis.Record<string, unknown>[];
    };
    assert.equal(response.summary.numFound, 2);
    assert.deepEqual(
      response.records.map(recordType => recordType.recordSchemaCreateResolver),
      [
        '/public%20brand/portal%2Fsubpath/api/records/schemas/create/dataset',
        '/public%20brand/portal%2Fsubpath/api/records/schemas/create/publication',
      ]
    );
    assert.equal(JSON.stringify(response.records).includes('/api/forms/get'), false);
    assert.equal(JSON.stringify(response.records).includes('configuration'), false);
    assert.equal(
      storedRecordTypes.some(recordType => Reflect.has(recordType, 'recordSchemaCreateResolver')),
      false
    );
  });

  for (const apiVersion of ['1.0', '2.0'] as const) {
    it(`retains the prior ${apiVersion} response shapes when record schemas are disabled`, async function () {
      Reflect.set(sails.config.recordSchema, 'enabled', false);
      const storedRecordType = { name: 'dataset', packageType: 'dataset-package', searchable: true };
      const storedRecordTypes = [storedRecordType, { name: 'publication', packageType: 'publication-package' }];
      getRecordType.returns(of(storedRecordType));
      getAllRecordTypes.returns(of(storedRecordTypes));
      const versionHeaders = { 'x-redbox-api-version': apiVersion };
      const singleRequest = {
        apiRequest: { params: {}, query: { name: 'dataset' }, headers: versionHeaders, body: {}, files: {} },
        headers: versionHeaders,
        query: {},
        session: { branding: 'public brand', portal: 'portal/subpath' },
      } as unknown as Sails.Req;
      const listRequest = {
        apiRequest: { params: {}, query: {}, headers: versionHeaders, body: {}, files: {} },
        headers: versionHeaders,
        query: {},
        session: { branding: 'public brand', portal: 'portal/subpath' },
      } as unknown as Sails.Req;
      const respondingController = new Controllers.RecordType();
      const singleResponse = jsonResponseFixture();
      const listResponse = jsonResponseFixture();

      await respondingController.getRecordType(singleRequest, singleResponse.response);
      await respondingController.listRecordTypes(listRequest, listResponse.response);

      const singleBody = singleResponse.json.firstCall.args[0] as {
        readonly data?: typeof storedRecordType;
      };
      const singleData = apiVersion === '1.0' ? singleBody : singleBody.data;
      assert.equal(singleData, storedRecordType);
      assert.equal(Reflect.has(singleData ?? {}, 'recordSchemaCreateResolver'), false);

      const listBody = listResponse.json.firstCall.args[0] as {
        readonly data?: {
          readonly records: readonly globalThis.Record<string, unknown>[];
          readonly summary: { readonly numFound: number };
        };
        readonly records?: readonly globalThis.Record<string, unknown>[];
        readonly summary?: { readonly numFound: number };
      };
      const listData = apiVersion === '1.0' ? listBody : listBody.data;
      assert.equal(listData?.summary?.numFound, 2);
      assert.deepEqual(listData?.records, storedRecordTypes);
      assert.equal(
        listData?.records?.some(recordType => Reflect.has(recordType, 'recordSchemaCreateResolver')),
        false
      );
    });
  }
});
