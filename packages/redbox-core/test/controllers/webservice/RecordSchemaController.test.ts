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
import { BrandingModel } from '../../../src/model';
import { JSON_SCHEMA_DRAFT_2020_12 } from '../../../src/record-contract';
import type { ApiRouteDefinition } from '../../../src/api-routes';
import type { BuildResponseType } from '../../../src/model';
import type { RecordSchemaService } from '../../../src';
import type { FormRecordAccessRole, FormRecordAccessUser } from '../../../src/services/FormsService';
import type {
  ContractJsonObject,
  PublishedRecordJsonSchemaDocument,
  RecordContractCompleteness,
  RecordContractPublicContext,
  RecordContractSchemaKind,
} from '../../../src/record-contract';

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

interface CapturedSendResponse {
  readonly req: Sails.Req;
  readonly res: Sails.Res;
  readonly response: BuildResponseType;
}

class TestRecordSchemaController extends Controllers.RecordSchema {
  readonly sentResponses: CapturedSendResponse[] = [];

  protected override sendResp(req: Sails.Req, res: Sails.Res, response?: BuildResponseType): Sails.Res {
    this.sentResponses.push({ req, res, response: response ?? {} });
    return res;
  }

  resetSentResponses(): void {
    this.sentResponses.length = 0;
  }
}

function onlySentResponse(controller: TestRecordSchemaController): CapturedSendResponse {
  assert.equal(controller.sentResponses.length, 1, 'Expected exactly one sendResp call.');
  const sent = controller.sentResponses[0];
  if (!sent) throw new Error('Expected one captured sendResp call.');
  return sent;
}

function role(id: string, name: string): FormRecordAccessRole {
  return { id, name };
}

function requestUser(roles: FormRecordAccessRole[]): FormRecordAccessUser {
  return {
    id: 'user-1',
    username: 'alice',
    type: 'local',
    name: 'Alice Example',
    email: 'alice@example.test',
    roles,
    token: 'private-token',
    additionalAttributes: { privateGroup: 'private-value' },
  };
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

function requestAdapter(): Sails.Req {
  const request: Sails.Req = Object.create(null);
  Reflect.set(request, 'method', 'GET');
  Reflect.set(request, 'path', '/schema');
  Reflect.set(request, 'originalUrl', '/schema');
  Reflect.set(request, 'params', {});
  Reflect.set(request, 'query', {});
  Reflect.set(request, 'headers', {});
  return request;
}

function responseAdapter(): Sails.Res {
  const response: Sails.Res = Object.create(null);
  return response;
}

interface ValidatedRequestOptions {
  readonly user?: globalThis.Record<string, unknown>;
}

const defaultRequestUser = requestUser([
  role('role-z', 'Zeta'),
  role('role-a', 'Alpha'),
  role('role-z-duplicate', 'Zeta'),
]);

function validatedRequest(
  route: ApiRouteDefinition,
  raw: Pick<Sails.Req, 'params' | 'query' | 'headers'>,
  options: ValidatedRequestOptions = { user: defaultRequestUser }
): Sails.Req {
  const rawRequest = requestAdapter();
  Reflect.set(rawRequest, 'params', raw.params);
  Reflect.set(rawRequest, 'query', raw.query);
  Reflect.set(rawRequest, 'headers', raw.headers);
  const validated = validateApiRouteRequest(rawRequest, route);
  assert.equal(validated.valid, true, validated.valid ? undefined : JSON.stringify(validated.issues));
  if (!validated.valid) throw new Error('Expected request contract validation to succeed.');

  const request = requestAdapter();
  request.apiRequest = {
    params: validated.params,
    query: validated.query,
    headers: validated.headers,
    body: validated.body,
    files: validated.files,
  };
  if (options.user !== undefined) request.user = options.user;

  for (const rawProperty of ['params', 'query', 'headers', 'body']) {
    Object.defineProperty(request, rawProperty, {
      configurable: true,
      get() {
        throw new Error(`raw req.${rawProperty} should not be used`);
      },
    });
  }

  return request;
}

function restoreGlobal(name: string, priorValue: unknown): void {
  if (priorValue === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }
  Reflect.set(globalThis, name, priorValue);
}

interface ControllerActionCase {
  readonly run: (req: Sails.Req, res: Sails.Res) => Promise<unknown>;
  readonly request: Sails.Req;
  readonly resolver: sinon.SinonStub;
}

function controllerActionCases(
  controller: TestRecordSchemaController,
  resolver: ResolverStubs,
  options?: ValidatedRequestOptions
): ControllerActionCase[] {
  return [
    {
      run: (req, res) => controller.create(req, res),
      request: validatedRequest(
        resolveCreateRecordSchemaRoute,
        {
          params: { branding: 'default', portal: 'portal-1', recordType: 'dataset' },
          query: {},
          headers: {},
        },
        options
      ),
      resolver: resolver.resolveCreate,
    },
    {
      run: (req, res) => controller.update(req, res),
      request: validatedRequest(
        resolveUpdateRecordSchemaRoute,
        {
          params: { branding: 'default', portal: 'portal-1', oid: 'record-1' },
          query: {},
          headers: {},
        },
        options
      ),
      resolver: resolver.resolveUpdate,
    },
    {
      run: (req, res) => controller.immutable(req, res),
      request: validatedRequest(
        getImmutableRecordSchemaRoute,
        {
          params: { branding: 'default', portal: 'portal-1', digest: 'a'.repeat(64) },
          query: {},
          headers: {},
        },
        options
      ),
      resolver: resolver.resolveImmutable,
    },
  ];
}

function resetControllerHistory(controller: TestRecordSchemaController, resolver: ResolverStubs): void {
  controller.resetSentResponses();
  resolver.resolveCreate.resetHistory();
  resolver.resolveUpdate.resetHistory();
  resolver.resolveImmutable.resetHistory();
}

describe('Webservice RecordSchemaController', function () {
  let controller: TestRecordSchemaController;
  let resolver: ResolverStubs;
  let getBrand: sinon.SinonStub<[string], BrandingModel | undefined>;
  let priorSails: unknown;
  let priorBrandingService: unknown;
  let priorLodash: unknown;
  let resolvedBrand: BrandingModel;

  before(async function () {
    expect = (await import('chai')).expect;
  });

  beforeEach(function () {
    priorSails = Reflect.get(globalThis, 'sails');
    priorBrandingService = Reflect.get(globalThis, 'BrandingService');
    priorLodash = Reflect.get(globalThis, '_');

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
    getBrand = sinon.stub<[string], BrandingModel | undefined>();
    getBrand.callsFake(name => (name === 'default' ? resolvedBrand : undefined));
    Reflect.set(globalThis, 'sails', {
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
    });
    Reflect.set(globalThis, 'BrandingService', { getBrand });
    Reflect.set(globalThis, '_', lodash);

    controller = new TestRecordSchemaController();
    controller.RecordSchemaService = resolver;
  });

  afterEach(function () {
    sinon.restore();
    restoreGlobal('sails', priorSails);
    restoreGlobal('BrandingService', priorBrandingService);
    restoreGlobal('_', priorLodash);
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
    const res = responseAdapter();

    await controller.create(req, res);

    expect(getBrand.calledOnceWithExactly('default')).to.equal(true);
    expect(
      resolver.resolveCreate.calledOnceWithExactly({
        brand: 'brand-1',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'submit',
        actor: { authenticated: true, roles: ['Alpha', 'Zeta'] },
      })
    ).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({ req, res, response: { data: document } });
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
      { user }
    );
    const res = responseAdapter();

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
    expect(onlySentResponse(controller)).to.deep.equal({ req, res, response: { data: document } });
  });

  it('delegates immutable retrieval without reading or forwarding request headers', async function () {
    const digest = 'a'.repeat(64);
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
        headers: { authorization: 'Bearer private-token' },
      },
      { user }
    );
    const res = responseAdapter();

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
      })
    ).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({ req, res, response: { data: document } });
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
    const res = responseAdapter();

    await controller.immutable(req, res);

    const sent = onlySentResponse(controller);
    const errors = sent.response.errors ?? [];
    expect(sent.response).to.include({ status: 500 });
    expect(errors).to.have.length(1);
    expect(errors[0]?.message).to.equal('Record schema resolution failed.');
    expect(sent.response).not.to.have.property('data');
    expect(JSON.stringify(sent.response)).not.to.include(result.problem.detail);
  });

  it('does not delegate when validated request context is missing', async function () {
    const req = requestAdapter();
    req.user = defaultRequestUser;
    const res = responseAdapter();

    await controller.create(req, res);

    expect(resolver.resolveCreate.notCalled).to.equal(true);
    const sent = onlySentResponse(controller);
    expect(sent.response).to.include({ status: 500 });
    expect(sent.response.errors ?? []).to.have.length(1);
    expect(sent.response.errors?.[0]).to.be.instanceOf(Error);
  });

  it('rejects a missing authenticated user consistently before every delegation', async function () {
    for (const testCase of controllerActionCases(controller, resolver, {})) {
      resetControllerHistory(controller, resolver);
      const res = responseAdapter();

      await testCase.run(testCase.request, res);

      expect(testCase.resolver.notCalled).to.equal(true);
      const sent = onlySentResponse(controller);
      expect(sent.response).to.include({ status: 500 });
      expect(sent.response.errors?.[0]?.message).to.equal('Authenticated user context is required.');
    }
  });

  it('rejects partial and malformed authenticated users consistently before every delegation', async function () {
    const malformedUsers: globalThis.Record<string, unknown>[] = [
      { id: 'user-1', username: 'alice', roles: [] },
      { ...defaultRequestUser, username: ' ' },
      { ...defaultRequestUser, roles: [{ id: 'role-1', name: 42 }] },
    ];

    for (const user of malformedUsers) {
      for (const testCase of controllerActionCases(controller, resolver, { user })) {
        resetControllerHistory(controller, resolver);
        const res = responseAdapter();

        await testCase.run(testCase.request, res);

        expect(testCase.resolver.notCalled).to.equal(true);
        const sent = onlySentResponse(controller);
        expect(sent.response).to.include({ status: 500 });
        expect(sent.response.errors?.[0]?.message).to.equal('Authenticated user context is required.');
      }
    }
  });

  it('uses sendResp for unexpected resolver errors from every action', async function () {
    const error = new Error('private resolver failure');
    resolver.resolveCreate.rejects(error);
    resolver.resolveUpdate.rejects(error);
    resolver.resolveImmutable.rejects(error);

    for (const testCase of controllerActionCases(controller, resolver)) {
      controller.resetSentResponses();
      const res = responseAdapter();

      await testCase.run(testCase.request, res);

      expect(onlySentResponse(controller).response).to.deep.equal({ status: 500, errors: [error] });
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
