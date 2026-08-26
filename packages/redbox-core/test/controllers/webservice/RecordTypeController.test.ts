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
      config: {},
      log: {
        error: sinon.stub(),
      },
    });
    Reflect.set(globalThis, 'BrandingService', {
      getBrand: sinon.stub().returns({ id: 'brand-1', name: 'internal-brand' }),
      getBrandNameFromReq: sinon.stub().returns('public brand'),
      getPortalFromReq: sinon.stub().returns('portal/subpath'),
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
});
