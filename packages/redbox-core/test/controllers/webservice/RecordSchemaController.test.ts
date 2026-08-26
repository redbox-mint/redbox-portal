import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import lodash from 'lodash';
import * as sinon from 'sinon';

import { Controllers } from '../../../src/controllers/webservice/RecordSchemaController';
import { WebserviceControllerExports, WebserviceControllerNames } from '../../../src/controllers';
import {
  getImmutableRecordSchemaRoute,
  resolveCreateRecordSchemaRoute,
  resolveUpdateRecordSchemaRoute,
  validateApiRouteRequest,
} from '../../../src/api-routes';
import { BrandingModel, RoleModel, UserModel } from '../../../src/model';
import { JSON_SCHEMA_DRAFT_2020_12 } from '../../../src/record-contract';
import type { ApiRouteDefinition } from '../../../src/api-routes';
import type { BuildResponseType } from '../../../src/model';
import type { RecordSchemaService } from '../../../src';
import type {
  ContractJsonObject,
  PublishedRecordJsonSchemaDocument,
  RecordContractCompleteness,
  RecordContractPublicContext,
  RecordContractSchemaKind,
} from '../../../src/record-contract';
import type { LoDashStatic } from 'lodash';

let expect: Chai.ExpectStatic;

type ResolverStubs = {
  resolveCreate: sinon.SinonStub<
    Parameters<RecordSchemaService.Services.RecordSchema['resolveCreate']>,
    ReturnType<RecordSchemaService.Services.RecordSchema['resolveCreate']>
  >;
  resolveUpdate: sinon.SinonStub<
    Parameters<RecordSchemaService.Services.RecordSchema['resolveUpdate']>,
    ReturnType<RecordSchemaService.Services.RecordSchema['resolveUpdate']>
  >;
  resolveImmutable: sinon.SinonStub<
    Parameters<RecordSchemaService.Services.RecordSchema['resolveImmutable']>,
    ReturnType<RecordSchemaService.Services.RecordSchema['resolveImmutable']>
  >;
};

type TestGlobals = typeof globalThis & {
  sails: unknown;
  BrandingService: unknown;
  _: LoDashStatic;
};

type SendRespBoundary = {
  sendResp(req: Sails.Req, res: Sails.Res, response?: BuildResponseType): unknown;
};

function role(id: string, name: string): RoleModel {
  const value = new RoleModel();
  value.id = id;
  value.name = name;
  return value;
}

function requestUser(roles: RoleModel[]): UserModel {
  const user = new UserModel();
  user.id = 'user-1';
  user.username = 'alice';
  user.roles = roles;
  return user;
}

type SchemaContext<Kind extends RecordContractSchemaKind> = Omit<RecordContractPublicContext, 'kind'> & {
  readonly kind: Kind;
};

function schemaContext<Kind extends RecordContractSchemaKind>(schemaKind: Kind): SchemaContext<Kind> {
  return {
    brand: 'brand-1',
    portal: 'portal-1',
    kind: schemaKind,
    recordType: 'dataset',
    workflowStep: 'draft',
    form: 'dataset-draft',
    operation: 'strict-all',
    unknownProperties: 'allow',
    enforcement: 'shadow',
  };
}

function schemaDocument<Kind extends RecordContractSchemaKind>(
  context: SchemaContext<Kind>,
  completeness: RecordContractCompleteness
): PublishedRecordJsonSchemaDocument & { readonly 'x-redbox-context': SchemaContext<Kind> } {
  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: `https://example.test/schemas/${context.kind}`,
    type: 'object',
    'x-redbox-contract-format': 'redbox-record-contract/1',
    'x-redbox-context': context,
    'x-redbox-completeness': completeness,
    'x-redbox-validation': [],
    'x-redbox-diagnostics': [],
  };
}

function validatedRequest(
  route: ApiRouteDefinition,
  raw: Pick<Sails.Req, 'params' | 'query' | 'headers'>,
  user: globalThis.Record<string, unknown> = requestUser([
    role('role-z', 'Zeta'),
    role('role-a', 'Alpha'),
    role('role-z-duplicate', 'Zeta'),
    role('role-empty', ' '),
  ])
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
  let priorLodash: LoDashStatic;
  let resolvedBrand: BrandingModel;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    priorSails = testGlobals.sails;
    priorBrandingService = testGlobals.BrandingService;
    priorLodash = testGlobals._;

    resolver = {
      resolveCreate: sinon.stub<
        Parameters<RecordSchemaService.Services.RecordSchema['resolveCreate']>,
        ReturnType<RecordSchemaService.Services.RecordSchema['resolveCreate']>
      >(),
      resolveUpdate: sinon.stub<
        Parameters<RecordSchemaService.Services.RecordSchema['resolveUpdate']>,
        ReturnType<RecordSchemaService.Services.RecordSchema['resolveUpdate']>
      >(),
      resolveImmutable: sinon.stub<
        Parameters<RecordSchemaService.Services.RecordSchema['resolveImmutable']>,
        ReturnType<RecordSchemaService.Services.RecordSchema['resolveImmutable']>
      >(),
    };
    resolvedBrand = new BrandingModel();
    resolvedBrand.id = 'brand-1';
    resolvedBrand.name = 'default';
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
      getBrand: sinon.stub().callsFake((name: string) => (name === 'default' ? resolvedBrand : undefined)),
    };
    testGlobals._ = lodash;

    controller = new Controllers.RecordSchema();
    controller.RecordSchemaService = resolver;
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
    const digest = 'b'.repeat(64);
    const context = schemaContext('create');
    const document = schemaDocument(context, 'complete');
    const result: Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveCreate']>> = {
      kind: 'resolved',
      document,
      digest,
      metadata: {
        schemaKind: 'create',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'complete',
        byteLength: 1,
        etag: `"sha256:${digest}"`,
        context,
      },
      grant: {
        referenceKey: 'grant-create',
        digest,
        brand: 'brand-1',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'strict-all',
        kind: 'grant',
        schemaKind: 'create',
      },
    };
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
    const digest = 'c'.repeat(64);
    const context = schemaContext('update');
    const document = schemaDocument(context, 'partial');
    const result: Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveUpdate']>> = {
      kind: 'partial',
      document,
      digest,
      metadata: {
        schemaKind: 'update',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'partial',
        byteLength: 1,
        etag: `"sha256:${digest}"`,
        context,
      },
      grant: {
        referenceKey: 'grant-update',
        digest,
        brand: 'brand-1',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'strict-all',
        kind: 'grant',
        schemaKind: 'update',
        oid: 'record-1',
      },
    };
    resolver.resolveUpdate.resolves(result);
    const user = requestUser([role('role-1', 'Researcher')]);
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
          brand: resolvedBrand,
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
    const document: ContractJsonObject = { type: 'object' };
    const now = new Date('2026-08-26T00:00:00.000Z');
    const result: Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveImmutable']>> = {
      kind: 'resolved',
      artifact: {
        digest,
        document,
        contractFormat: 'redbox-record-contract/1',
        completeness: 'complete',
        byteLength: 1,
        createdAt: now,
        updatedAt: now,
      },
    };
    resolver.resolveImmutable.resolves(result);
    const user = requestUser([role('role-1', 'Researcher')]);
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
          brand: resolvedBrand,
          user,
        },
        ifNoneMatch: etag,
      })
    ).to.equal(true);
    expect(sendResp.calledOnceWithExactly(req, res, { data: document })).to.equal(true);
    expect((res.json as sinon.SinonStub).notCalled).to.equal(true);
  });

  it('does not expose typed service failure details before the approved HTTP mapping exists', async function () {
    const result: Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveImmutable']>> = {
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

  it('does not fabricate an access user when authenticated caller context is missing', async function () {
    const req = validatedRequest(
      resolveUpdateRecordSchemaRoute,
      {
        params: { branding: 'default', portal: 'portal-1', oid: 'record-1' },
        query: {},
        headers: {},
      },
      {}
    );
    const res = fakeResponse();

    await controller.update(req, res);

    expect(resolver.resolveUpdate.notCalled).to.equal(true);
    expect(sendResp.calledOnce).to.equal(true);
    expect(sendResp.firstCall.args[2]).to.include({ status: 500 });
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
