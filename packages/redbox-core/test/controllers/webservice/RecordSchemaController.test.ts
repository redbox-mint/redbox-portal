import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as sinon from 'sinon';

import { Controllers } from '../../../src/controllers/webservice/RecordSchemaController';
import { WebserviceControllerExports, WebserviceControllerNames } from '../../../src/controllers';
import {
  getImmutableRecordSchemaRoute,
  resolveCreateRecordSchemaRoute,
  resolveUpdateRecordSchemaRoute,
  validateApiRouteRequest,
} from '../../../src/api-routes';
import type { ApiRouteDefinition } from '../../../src/api-routes';
import type { BuildResponseType } from '../../../src/model';

let expect: Chai.ExpectStatic;

type ResolverStubs = {
  resolveCreate: sinon.SinonStub;
  resolveUpdate: sinon.SinonStub;
  resolveImmutable: sinon.SinonStub;
};

type TestGlobals = typeof globalThis & {
  sails: unknown;
  BrandingService: unknown;
  _: unknown;
};

type SendRespBoundary = {
  sendResp(req: Sails.Req, res: Sails.Res, response?: BuildResponseType): unknown;
};

function validatedRequest(
  route: ApiRouteDefinition,
  raw: Pick<Sails.Req, 'params' | 'query' | 'headers'>,
  user: globalThis.Record<string, unknown> = {
    id: 'user-1',
    username: 'alice',
    roles: [
      { id: 'role-z', name: 'Zeta' },
      { id: 'role-a', name: 'Alpha' },
      { id: 'role-z-duplicate', name: 'Zeta' },
      { id: 'role-empty', name: ' ' },
    ],
  }
): Sails.Req {
  const validated = validateApiRouteRequest(raw as Sails.Req, route);
  assert.equal(validated.valid, true, validated.valid ? undefined : JSON.stringify(validated.issues));
  if (!validated.valid) throw new Error('Expected request contract validation to succeed.');

  const request = {
    apiRequest: {
      params: validated.params,
      query: validated.query,
      headers: validated.headers,
      body: validated.body,
      files: validated.files,
    },
    user,
  } as globalThis.Record<string, unknown>;

  for (const rawProperty of ['params', 'query', 'headers', 'body']) {
    Object.defineProperty(request, rawProperty, {
      configurable: true,
      get() {
        throw new Error(`raw req.${rawProperty} should not be used`);
      },
    });
  }

  return request as unknown as Sails.Req;
}

function fakeResponse(): Sails.Res {
  return {
    json: sinon.stub(),
  } as unknown as Sails.Res;
}

describe('Webservice RecordSchemaController', function () {
  const testGlobals = globalThis as unknown as TestGlobals;
  let controller: Controllers.RecordSchema;
  let resolver: ResolverStubs;
  let sendResp: sinon.SinonStub;
  let priorSails: unknown;
  let priorBrandingService: unknown;
  let priorLodash: unknown;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    priorSails = testGlobals.sails;
    priorBrandingService = testGlobals.BrandingService;
    priorLodash = testGlobals._;

    resolver = {
      resolveCreate: sinon.stub(),
      resolveUpdate: sinon.stub(),
      resolveImmutable: sinon.stub(),
    };
    testGlobals.sails = {
      config: {},
      services: { recordschemaservice: resolver },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: sinon.stub(),
        trace: sinon.stub(),
      },
    };
    testGlobals.BrandingService = {
      getBrand: sinon
        .stub()
        .callsFake((name: string) => (name === 'default' ? { id: 'brand-1', name: 'default' } : undefined)),
    };
    testGlobals._ = require('lodash');

    controller = new Controllers.RecordSchema();
    controller.RecordSchemaService = resolver as never;
    sendResp = sinon.stub(controller as unknown as SendRespBoundary, 'sendResp');
  });

  afterEach(function () {
    sinon.restore();
    testGlobals.sails = priorSails;
    testGlobals.BrandingService = priorBrandingService;
    testGlobals._ = priorLodash;
  });

  it('uses the generated webservice init, export, and shim conventions', function () {
    controller.init();

    expect(controller.RecordSchemaService).to.equal(resolver);
    expect(controller.exports()).to.include.keys('init', 'create', 'update', 'immutable');
    expect(WebserviceControllerNames).to.include('RecordSchemaController');
    expect(WebserviceControllerExports.RecordSchemaController).to.include.keys('init', 'create', 'update', 'immutable');
  });

  it('delegates create using only normalized validated input and safe actor facts', async function () {
    const document = { type: 'object' };
    const result = { kind: 'resolved', document };
    resolver.resolveCreate.resolves(result);
    const req = validatedRequest(resolveCreateRecordSchemaRoute, {
      params: { branding: ' default ', portal: ' portal-1 ', recordType: ' dataset ' },
      query: { operation: ' submit ' },
      headers: {},
    });
    const res = fakeResponse();

    await controller.create(req, res);

    expect(
      (testGlobals.BrandingService as { getBrand: sinon.SinonStub }).getBrand.calledOnceWithExactly('default')
    ).to.equal(true);
    expect(
      resolver.resolveCreate.calledOnceWithExactly({
        brand: 'brand-1',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'submit',
        actor: { authenticated: true, roles: ['Alpha', 'Zeta'] },
      })
    ).to.equal(true);
    expect(sendResp.calledOnceWithExactly(req, res, { data: document })).to.equal(true);
    expect((res.json as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('delegates update with the resolved brand and authenticated caller context', async function () {
    const document = { type: 'object' };
    const result = { kind: 'partial', document };
    resolver.resolveUpdate.resolves(result);
    const user = {
      id: 'user-1',
      username: 'alice',
      roles: [{ id: 'role-1', name: 'Researcher' }],
    };
    const req = validatedRequest(
      resolveUpdateRecordSchemaRoute,
      {
        params: { branding: 'default', portal: ' portal-1 ', oid: ' record-1 ' },
        query: {},
        headers: {},
      },
      user
    );
    const res = fakeResponse();

    await controller.update(req, res);

    expect(
      resolver.resolveUpdate.calledOnceWithExactly({
        brand: 'brand-1',
        portal: 'portal-1',
        oid: 'record-1',
        operation: undefined,
        caller: {
          brand: { id: 'brand-1', name: 'default' },
          user,
        },
      })
    ).to.equal(true);
    expect(sendResp.calledOnceWithExactly(req, res, { data: document })).to.equal(true);
    expect((res.json as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('delegates immutable retrieval with only the validated conditional header', async function () {
    const digest = 'a'.repeat(64);
    const etag = `"sha256:${digest}"`;
    const document = { type: 'object' };
    const result = { kind: 'resolved', artifact: { digest, document } };
    resolver.resolveImmutable.resolves(result);
    const user = {
      id: 'user-1',
      username: 'alice',
      roles: [{ id: 'role-1', name: 'Researcher' }],
    };
    const req = validatedRequest(
      getImmutableRecordSchemaRoute,
      {
        params: { branding: 'default', portal: 'portal-1', digest },
        query: {},
        headers: { 'if-none-match': etag, authorization: 'Bearer private-token' },
      },
      user
    );
    const res = fakeResponse();

    await controller.immutable(req, res);

    expect(
      resolver.resolveImmutable.calledOnceWithExactly({
        brand: 'brand-1',
        portal: 'portal-1',
        digest,
        caller: {
          brand: { id: 'brand-1', name: 'default' },
          user,
        },
        ifNoneMatch: etag,
      })
    ).to.equal(true);
    expect(sendResp.calledOnceWithExactly(req, res, { data: document })).to.equal(true);
    expect((res.json as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('does not expose typed service failure details before the approved HTTP mapping exists', async function () {
    const result = {
      kind: 'invalid-request',
      problem: {
        type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
        title: 'Record schema request is invalid',
        status: 400,
        detail: 'The schema request was malformed.',
        instance: '/default/portal-1/api/records/schemas/bad',
        code: 'record-schema.invalid-request',
      },
    };
    resolver.resolveImmutable.resolves(result);
    const req = validatedRequest(getImmutableRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', digest: 'a'.repeat(64) },
      query: {},
      headers: {},
    });
    const res = fakeResponse();

    await controller.immutable(req, res);

    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]).to.include({ status: 500 });
    expect(sendResp.firstCall.args[2].errors).to.have.length(1);
    expect(sendResp.firstCall.args[2].errors[0].message).to.equal('Record schema resolution failed.');
    expect(sendResp.firstCall.args[2]).not.to.have.property('data');
    expect(JSON.stringify(sendResp.firstCall.args[2])).not.to.include(result.problem.detail);
    expect((res.json as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('does not delegate when validated request context is missing', async function () {
    const req = { method: 'GET', path: '/schema' } as unknown as Sails.Req;
    const res = fakeResponse();

    await controller.create(req, res);

    expect(resolver.resolveCreate.notCalled).to.equal(true);
    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]).to.include({ status: 500 });
    expect(sendResp.firstCall.args[2].errors).to.have.length(1);
    expect(sendResp.firstCall.args[2].errors[0]).to.be.instanceOf(Error);
    expect((res.json as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('uses sendResp for unexpected resolver errors from every action', async function () {
    const error = new Error('private resolver failure');
    resolver.resolveCreate.rejects(error);
    resolver.resolveUpdate.rejects(error);
    resolver.resolveImmutable.rejects(error);
    const cases = [
      {
        run: (req: Sails.Req, res: Sails.Res) => controller.create(req, res),
        request: validatedRequest(resolveCreateRecordSchemaRoute, {
          params: { branding: 'default', portal: 'portal-1', recordType: 'dataset' },
          query: {},
          headers: {},
        }),
      },
      {
        run: (req: Sails.Req, res: Sails.Res) => controller.update(req, res),
        request: validatedRequest(resolveUpdateRecordSchemaRoute, {
          params: { branding: 'default', portal: 'portal-1', oid: 'record-1' },
          query: {},
          headers: {},
        }),
      },
      {
        run: (req: Sails.Req, res: Sails.Res) => controller.immutable(req, res),
        request: validatedRequest(getImmutableRecordSchemaRoute, {
          params: { branding: 'default', portal: 'portal-1', digest: 'a'.repeat(64) },
          query: {},
          headers: {},
        }),
      },
    ];

    for (const testCase of cases) {
      sendResp.resetHistory();
      const res = fakeResponse();

      await testCase.run(testCase.request, res);

      expect(sendResp.calledOnce).to.equal(true);
      expect(sendResp.firstCall.args[2]).to.deep.equal({ status: 500, errors: [error] });
      expect((res.json as sinon.SinonStub).notCalled).to.equal(true);
    }
  });

  it('contains no compiler, storage, or direct response implementation', function () {
    const source = readFileSync(
      resolve(__dirname, '../../../src/controllers/webservice/RecordSchemaController.ts'),
      'utf8'
    );

    expect(source).not.to.match(/RecordContractCompiler|compileRecord|StorageService|RedboxJavaStorageService/);
    expect(source).not.to.match(/\bres\s*\.\s*json\s*\(/);
  });
});
