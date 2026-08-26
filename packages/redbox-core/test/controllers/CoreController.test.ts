let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { Readable } from 'node:stream';
import * as sinon from 'sinon';
import { Controllers } from '../../src/CoreController';
import {BuildResponseType} from "../../src";

interface CoreResponseFixture {
  readonly response: Sails.Res;
  readonly set: sinon.SinonStub<[field: string | Record<string, string>, value?: string], Sails.Res>;
  readonly status: sinon.SinonStub<[statusCode: number], Sails.Res>;
  readonly json: sinon.SinonStub<[body: unknown], Sails.Res>;
}

interface LoggerFixture {
  readonly error: sinon.SinonStub<[message: string, error: Error], void>;
}

function coreRequestFixture(apiVersion: string): Sails.Req {
  const request: Sails.Req = Object.create(null);
  Reflect.set(request, 'headers', { 'X-ReDBox-Api-Version': apiVersion });
  Reflect.set(request, 'query', {});
  return request;
}

function coreResponseFixture(): CoreResponseFixture {
  const response: Sails.Res = Object.create(null);
  const set = sinon.stub<[field: string | Record<string, string>, value?: string], Sails.Res>().returns(response);
  const status = sinon.stub<[statusCode: number], Sails.Res>().returns(response);
  const json = sinon.stub<[body: unknown], Sails.Res>().returns(response);
  Reflect.set(response, 'set', set);
  Reflect.set(response, 'status', status);
  Reflect.set(response, 'json', json);
  return { response, set, status, json };
}

function loggerFixture(): LoggerFixture {
  return { error: sinon.stub<[message: string, error: Error], void>() };
}

describe('CoreController sendResp wrappers', () => {
  let controller: any;
  let originalSails: any;
  let originalTranslationService: any;

  beforeEach(() => {
    originalSails = (global as any).sails;
    originalTranslationService = (global as any).TranslationService;

    (global as any).sails = {
      config: {},
      log: { verbose: sinon.stub(), error: sinon.stub(), debug: sinon.stub() }
    };

    (global as any).TranslationService = { t: (s: any) => s };
    (global as any)._ = require('lodash');

    class TestController extends Controllers.Core.Controller {
      public callSendResp(req: any, res: any, buildResponse?: any) {
        return this.sendResp(req, res, buildResponse);
      }
    }

    controller = new TestController();
  });

  describe('document title helpers', () => {
    beforeEach(() => {
      (global as any).TranslationService = {
        t: sinon.stub().callsFake((key: string) => key === 'default-title' ? 'Site' : key),
      };
    });

    it('formats Page | Site when page title is present', () => {
      expect(controller.formatDocumentTitle('Page')).to.equal('Page | Site');
    });

    it('falls back to site when page title is empty', () => {
      expect(controller.formatDocumentTitle('   ')).to.equal('Site');
    });

    it('avoids Site | Site when page title matches site', () => {
      expect(controller.formatDocumentTitle('Site')).to.equal('Site');
    });

    it('uses request locals when formatting the site title', () => {
      const locals = {
        TranslationService: {
          t: sinon.stub().callsFake((key: string) => key === 'default-title' ? 'Branded Site' : key),
        },
      };

      expect(controller.formatDocumentTitle('Page', locals)).to.equal('Page | Branded Site');
    });

    it('uses request locals when resolving page title keys', () => {
      const locals = {
        pageTitleKey: 'dashboard-title',
        TranslationService: {
          t: sinon.stub().callsFake((key: string) => key === 'dashboard-title' ? 'Branded Dashboard' : key),
        },
      };

      expect(controller.resolvePageTitleFromLocals(locals)).to.equal('Branded Dashboard');
    });
  });

  afterEach(() => {
    sinon.restore();
    (global as any).sails = originalSails;
    (global as any).TranslationService = originalTranslationService;
  });

  it('sends v1 success with data when no v1 provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', data: { a: 1 } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(200)).to.be.true;
    expect(res.json.calledWith({ a: 1 })).to.be.true;
  });

  it('sends v1 success with v1 body when provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', data: { a: 1 }, v1: { special: true } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(200)).to.be.true;
    expect(res.json.calledWith({ special: true })).to.be.true;
  });

  it('sends v1 error format when displayErrors provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', displayErrors: [{ title: 'T', detail: 'D' }], status: 400 };

    controller.callSendResp(req, res, buildResponse);

    expect(res.json.called).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.be.an('object');
    expect(arg.message || arg).to.exist;
  });

  it('sends v2 success with data/meta', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', data: { b: 2 }, meta: { page: 1 } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(200)).to.be.true;
    expect(res.json.calledWith({ data: { b: 2 }, meta: { page: 1 } })).to.be.true;
  });

  it('sends v2 error array when displayErrors provided', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', displayErrors: [{ code: 'ERR' }], status: 500, meta: { ok: false } };

    controller.callSendResp(req, res, buildResponse);

    expect(res.json.called).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.have.property('errors');
    expect(arg).to.have.property('meta');
  });

  it('sends error response when given a display error with status 200 and no overall status (unexpected but possible)', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', displayErrors: [{ code: 'ERR', status: "200" }] };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(500)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.have.property('errors');
  });

  it('sends error response when given an error with status 200 (unexpected but possible)', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const buildResponse: BuildResponseType = { format: 'json', errors: [new Error()], status: 200 };

    controller.callSendResp(req, res, buildResponse);

    expect(res.status.calledWith(500)).to.be.true;
    expect(res.json.calledOnce).to.be.true;
    const arg = res.json.firstCall.args[0];
    expect(arg).to.have.property('errors');
  });

  it('sends schema JSON raw with exact headers and status for v1 and v2', () => {
    const schema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: 'object',
      properties: { title: { type: 'string' } },
    };
    for (const apiVersion of ['1.0', '2.0']) {
      const req: any = { headers: { 'X-ReDBox-Api-Version': apiVersion }, query: {} };
      const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
      const buildResponse: BuildResponseType = {
        format: 'raw-json',
        mediaType: 'application/schema+json',
        status: 201,
        headers: { ETag: '"sha256:digest"', Vary: 'Authorization' },
        data: schema,
      };

      controller.callSendResp(req, res, buildResponse);

      expect(res.status.calledOnceWithExactly(201)).to.be.true;
      expect(res.set.firstCall.calledWithExactly({ ETag: '"sha256:digest"', Vary: 'Authorization' })).to.be.true;
      expect(res.set.secondCall.calledWithExactly('Content-Type', 'application/schema+json')).to.be.true;
      expect(res.json.calledOnceWithExactly(schema)).to.be.true;
      expect(res.json.firstCall.args[0]).not.to.have.property('data');
      expect(res.json.firstCall.args[0]).not.to.have.property('meta');
    }
  });

  it('sends the same raw Problem Details body and media type without an API envelope for v1 and v2', () => {
    const problem = {
      type: 'https://redboxresearchdata.com/problems/record-schema-not-found',
      title: 'Record schema was not found',
      status: 404,
      detail: 'No accessible schema was found.',
      instance: '/default/default/api/records/schemas/missing',
      code: 'record-schema.not-found',
    };
    for (const apiVersion of ['1.0', '2.0']) {
      const req: any = { headers: { 'X-ReDBox-Api-Version': apiVersion }, query: {} };
      const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
      const buildResponse: BuildResponseType = {
        format: 'raw-json',
        mediaType: 'application/problem+json',
        status: 404,
        data: problem,
      };

      controller.callSendResp(req, res, buildResponse);

      expect(res.status.calledOnceWithExactly(404)).to.be.true;
      expect(res.set.secondCall.calledWithExactly('Content-Type', 'application/problem+json')).to.be.true;
      expect(res.json.calledOnceWithExactly(problem)).to.be.true;
      expect(res.json.firstCall.args[0]).not.to.have.property('errors');
      expect(res.json.firstCall.args[0]).not.to.have.property('meta');
      expect(res.json.firstCall.args[0]).not.to.have.property('data');
    }
  });

  it('logs raw response errors and promotes the status without replacing the raw body', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
    const problem = {
      type: 'https://redboxresearchdata.com/problems/record-schema-unavailable',
      title: 'Record schema is unavailable',
      status: 503,
      detail: 'The schema capability is temporarily unavailable.',
      instance: '/default/default/api/records/schemas/create/dataset',
      code: 'record-schema.storage-unavailable',
    };
    const internalError = new Error('internal-only');
    const buildResponse: BuildResponseType = {
      format: 'raw-json',
      mediaType: 'application/problem+json',
      errors: [internalError],
      data: problem,
    };

    controller.callSendResp(req, res, buildResponse);

    expect((global as any).sails.log.error.calledWith('Collected error in sendResp:', internalError)).to.be.true;
    expect(res.status.calledOnceWithExactly(500)).to.be.true;
    expect(res.json.calledOnceWithExactly(problem)).to.be.true;
  });

  it('logs an unexpected resolver error while preserving an explicit safe 503 Problem Details response', () => {
    const req = coreRequestFixture('2.0');
    const res = coreResponseFixture();
    const logger = loggerFixture();
    Reflect.set(sails.log, 'error', logger.error);
    const problem = {
      type: 'https://redboxresearchdata.com/problems/record-schema-unavailable',
      title: 'Record schema is unavailable',
      status: 503,
      detail: 'The record schema capability is temporarily unavailable.',
      instance: '/default/rdmp/api/records/schemas/create/dataset',
      code: 'record-schema.unavailable',
    };
    const internalError = new Error('private exception text');

    controller.callSendResp(req, res.response, {
      format: 'raw-json',
      mediaType: 'application/problem+json',
      status: 503,
      errors: [internalError],
      data: problem,
    });

    expect(logger.error.calledWith('Collected error in sendResp:', internalError)).to.be.true;
    expect(res.status.calledOnceWithExactly(503)).to.be.true;
    expect(res.set.secondCall.calledWithExactly('Content-Type', 'application/problem+json')).to.be.true;
    expect(res.json.calledOnceWithExactly(problem)).to.be.true;
    expect(JSON.stringify(res.json.firstCall.args[0])).not.to.include(internalError.message);
  });

  it('rejects unsupported raw media types at runtime', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '2.0' }, query: {} };
    const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };

    controller.callSendResp(req, res, {
      format: 'raw-json',
      mediaType: 'text/html',
      headers: { 'Content-Type': 'text/html' },
      data: { unsafe: true },
    });

    expect(res.status.calledWith(500)).to.be.true;
    expect(res.set.lastCall.calledWithExactly('Content-Type', 'application/json')).to.be.true;
    expect(res.json.calledOnceWithExactly({ errors: [{ detail: 'Check server logs.' }], meta: {} })).to.be.true;
    expect((global as any).sails.log.error.calledWithMatch('Rejected unsupported raw JSON response')).to.be.true;
  });

  it('rejects raw strings and stream-like objects at runtime', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };

    for (const data of [
      'not-json-object',
      new Date('2026-01-01T00:00:00.000Z'),
      Readable.from(['not-a-json-document']),
    ]) {
      const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
      controller.callSendResp(req, res, {
        format: 'raw-json',
        mediaType: 'application/schema+json',
        data,
      });

      expect(res.status.calledWith(500)).to.be.true;
      expect(res.set.neverCalledWith('Content-Type', 'application/schema+json')).to.be.true;
      expect(res.json.calledOnceWithExactly({ errors: [{ detail: 'Check server logs.' }], meta: {} })).to.be.true;
    }
  });

  it('rejects nested values that JSON serialization would silently rewrite', () => {
    const req: any = { headers: { 'X-ReDBox-Api-Version': '1.0' }, query: {} };
    const sparseArray = new Array(1);
    const accessorObject = {};
    Object.defineProperty(accessorObject, 'value', { enumerable: true, get: () => 'hidden execution' });

    for (const data of [{ values: sparseArray }, { nested: accessorObject }, { value: Number.NaN }]) {
      const res: any = { set: sinon.stub(), status: sinon.stub().returnsThis(), json: sinon.stub() };
      controller.callSendResp(req, res, {
        format: 'raw-json',
        mediaType: 'application/schema+json',
        data,
      });

      expect(res.status.calledWith(500)).to.be.true;
      expect(res.json.calledOnceWithExactly({ errors: [{ detail: 'Check server logs.' }], meta: {} })).to.be.true;
    }
  });
});
