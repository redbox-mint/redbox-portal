import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  FormConfig,
  SimpleInputFieldComponentConfig,
  SimpleInputFieldComponentDefinition,
  SimpleInputFieldModelConfig,
  SimpleInputFieldModelDefinition,
  SimpleInputFormComponentDefinition,
} from '@researchdatabox/sails-ng-common';
import lodash from 'lodash';
import * as sinon from 'sinon';

import { Controllers } from '../../../src/controllers/webservice/RecordSchemaController';
import { WebserviceControllerExports, WebserviceControllerNames } from '../../../src/controllers';
import {
  createCoreRecordContractContributors,
  normalizeRedboxCanonicalJsonV1,
  recordSchema,
  RecordContractContributorRegistry,
  StorageServiceResponse,
} from '../../../src';
import {
  getImmutableRecordSchemaRoute,
  resolveCreateRecordSchemaRoute,
  resolveUpdateRecordSchemaRoute,
  validateApiRouteRequest,
} from '../../../src/api-routes';
import {
  recordSchemaCanonicalLink,
  RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
  RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
  RECORD_SCHEMA_RESPONSE_VARY,
} from '../../../src/api-routes/record-schema-response';
import { BrandingModel } from '../../../src/model';
import { JSON_SCHEMA_DRAFT_2020_12, RECORD_SCHEMA_PROBLEM_CODES } from '../../../src/record-contract';
import type { ApiRouteDefinition } from '../../../src/api-routes';
import type { BuildResponseType } from '../../../src/model';
import type { RecordSchemaArtifactModel, RecordSchemaGrantReferenceInput, RecordSchemaService } from '../../../src';
import { Services as RecordSchemaServices } from '../../../src/services/RecordSchemaService';
import type { FormRecordAccessRole, FormRecordAccessUser } from '../../../src/services/FormsService';
import type {
  ContractJsonObject,
  ContractJsonValue,
  RecordContractContext,
  RecordContractContributorRegistration,
  PublishedRecordJsonSchemaDocument,
  RecordContractCompleteness,
  RecordContractPublicContext,
  RecordContractSchemaKind,
  RecordJsonSchemaEtag,
  RecordSchemaProblemCode,
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
  completeness: RecordContractCompleteness,
  digest: string
): PublishedRecordJsonSchemaDocument & { readonly 'x-redbox-context': SchemaContext<Kind> } {
  return {
    $schema: JSON_SCHEMA_DRAFT_2020_12,
    $id: `/${context.brand}/${context.portal}/api/records/schemas/${digest}`,
    type: 'object',
    'x-redbox-contract-format': 'redbox-record-contract/1',
    'x-redbox-context': context,
    'x-redbox-completeness': completeness,
    'x-redbox-validation': [],
    'x-redbox-diagnostics': [],
  };
}

function successfulSchemaHeaders(etag: string, canonicalUrl?: string): Record<string, string> {
  const headers: Record<string, string> = {
    ETag: etag,
    'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
    Vary: RECORD_SCHEMA_RESPONSE_VARY,
  };
  if (canonicalUrl !== undefined) headers.Link = recordSchemaCanonicalLink(canonicalUrl);
  return headers;
}

function schemaEtag(digest: string): RecordJsonSchemaEtag {
  return `"sha256:${digest}"`;
}

type ExpectedProblemKind =
  | 'invalid-request'
  | 'authentication-required'
  | 'forbidden'
  | 'not-found'
  | 'not-resolvable'
  | 'limit-exceeded'
  | 'invalid-contract'
  | 'unavailable';

const expectedProblemDescriptors = {
  'invalid-request': {
    type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
    title: 'Record schema request is invalid',
    status: 400,
    detail: 'The record schema request is malformed.',
    code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_REQUEST,
  },
  'authentication-required': {
    type: 'https://redboxresearchdata.com/problems/record-schema-authentication-required',
    title: 'Authentication is required',
    status: 401,
    detail: 'Authentication is required to resolve a record schema.',
    code: RECORD_SCHEMA_PROBLEM_CODES.AUTHENTICATION_REQUIRED,
  },
  forbidden: {
    type: 'https://redboxresearchdata.com/problems/record-schema-forbidden',
    title: 'Record schema request is not authorized',
    status: 403,
    detail: 'The record schema request is not authorized.',
    code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
  },
  'not-found': {
    type: 'https://redboxresearchdata.com/problems/record-schema-not-found',
    title: 'Record schema was not found',
    status: 404,
    detail: 'No accessible record schema or resolution context was found.',
    code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
  },
  'not-resolvable': {
    type: 'https://redboxresearchdata.com/problems/record-schema-not-resolvable',
    title: 'Record schema could not be resolved',
    status: 409,
    detail: 'The record schema could not be resolved from the authoritative context.',
    code: RECORD_SCHEMA_PROBLEM_CODES.NOT_RESOLVABLE,
  },
  'limit-exceeded': {
    type: 'https://redboxresearchdata.com/problems/record-schema-limit-exceeded',
    title: 'Record schema limit exceeded',
    status: 413,
    detail: 'The record schema exceeds configured complexity or output limits.',
    code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED,
  },
  'invalid-contract': {
    type: 'https://redboxresearchdata.com/problems/record-schema-invalid-contract',
    title: 'Record schema contract is invalid',
    status: 422,
    detail: 'The record schema contract is invalid.',
    code: RECORD_SCHEMA_PROBLEM_CODES.INVALID_CONTRACT,
  },
  unavailable: {
    type: 'https://redboxresearchdata.com/problems/record-schema-unavailable',
    title: 'Record schema is unavailable',
    status: 503,
    detail: 'The record schema capability is temporarily unavailable.',
    code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
  },
} as const;

function expectedProblem(
  kind: ExpectedProblemKind,
  instance: string,
  code: RecordSchemaProblemCode = expectedProblemDescriptors[kind].code
) {
  return {
    ...expectedProblemDescriptors[kind],
    instance,
    code,
  };
}

function expectedProblemResponse(
  kind: ExpectedProblemKind,
  instance: string,
  code?: RecordSchemaProblemCode,
  errors?: Error[]
): BuildResponseType {
  const problem = expectedProblem(kind, instance, code);
  return {
    format: 'raw-json',
    mediaType: RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
    status: problem.status,
    data: problem,
    headers: {
      'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
      Vary: RECORD_SCHEMA_RESPONSE_VARY,
    },
    ...(errors ? { errors } : {}),
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

function enabledRecordSchemaConfig(): Record<string, unknown> {
  return {
    ...structuredClone(recordSchema),
    enabled: true,
  };
}

function recordSchemaCoreRegistry(): RecordContractContributorRegistry {
  const registrations: RecordContractContributorRegistration[] = createCoreRecordContractContributors().map(
    contributor => ({ contributor, source: 'core' })
  );
  return new RecordContractContributorRegistry(registrations);
}

function successfulStorageResponse(): StorageServiceResponse {
  const response = new StorageServiceResponse();
  response.success = true;
  return response;
}

function isContractDocument(value: ContractJsonValue): value is ContractJsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function immutableControllerDocument(document: unknown): ContractJsonObject {
  const normalized = normalizeRedboxCanonicalJsonV1(document);
  if (!isContractDocument(normalized)) {
    throw new Error('Expected an immutable controller test document.');
  }
  return normalized;
}

interface ImmutableControllerSeed {
  readonly artifact: RecordSchemaArtifactModel;
  readonly context: RecordContractContext;
  readonly grant: RecordSchemaGrantReferenceInput;
}

function immutableControllerContext(): RecordContractContext {
  const publicContext = schemaContext('create');
  return {
    publicContext,
    resolution: {
      sourceFormFingerprint: 'a'.repeat(64),
      sourceForm: {
        name: publicContext.form,
        componentDefinitions: [],
      },
      reusableFormDefinitions: {},
      actor: { authenticated: true, roles: ['Alpha', 'Zeta'] },
      formMode: 'edit',
      contextVariables: {},
    },
  };
}

function immutableControllerEffectiveForm(): FormConfig {
  const form = new FormConfig();
  form.name = 'dataset-draft';
  const field = new SimpleInputFormComponentDefinition();
  field.name = 'title';
  field.component = new SimpleInputFieldComponentDefinition();
  field.component.config = new SimpleInputFieldComponentConfig();
  field.model = new SimpleInputFieldModelDefinition();
  field.model.config = new SimpleInputFieldModelConfig();
  form.componentDefinitions = [field];
  return form;
}

async function immutableControllerSeed(): Promise<ImmutableControllerSeed> {
  const context = immutableControllerContext();
  const service = new RecordSchemaServices.RecordSchema({
    getConfig: enabledRecordSchemaConfig,
    getStorageProvider: () => ({
      putRecordSchemaArtifact: async () => successfulStorageResponse(),
      putRecordSchemaReference: async () => successfulStorageResponse(),
    }),
    getContributorRegistry: recordSchemaCoreRegistry,
    resolveContractContext: async () => context,
    authorizeCreate: async () => true,
    buildContractFormConfig: async () => ({
      ok: true,
      effectiveForm: immutableControllerEffectiveForm(),
    }),
  });
  const result = await service.resolveCreate({
    brand: 'brand-1',
    branding: 'default',
    portal: 'portal-1',
    recordType: 'dataset',
    caller: {
      brand: Object.assign(new BrandingModel(), { id: 'brand-1', name: 'default' }),
      user: defaultRequestUser,
    },
  });
  if (result.kind !== 'resolved' && result.kind !== 'partial') {
    throw new Error('Expected an immutable controller test seed.');
  }
  const storedAt = new Date('2026-08-24T00:00:00.000Z');
  return {
    context,
    grant: result.grant,
    artifact: {
      digest: result.digest,
      document: immutableControllerDocument(result.document),
      contractFormat: result.metadata.contractFormat,
      completeness: result.metadata.completeness,
      byteLength: result.metadata.byteLength,
      createdAt: storedAt,
      updatedAt: storedAt,
    },
  };
}

function immutableControllerService(
  seed: ImmutableControllerSeed,
  artifact: unknown,
  grants: readonly unknown[],
  equivalentAuthorization: boolean,
  createAuthorization = equivalentAuthorization
) {
  const resolveContractContext = sinon.stub();
  if (equivalentAuthorization) {
    resolveContractContext.resolves(seed.context);
  } else {
    resolveContractContext.rejects(new Error('inaccessible equivalent context'));
  }
  const authorizeCreate = sinon.stub().resolves(createAuthorization);
  const service = new RecordSchemaServices.RecordSchema({
    getConfig: enabledRecordSchemaConfig,
    getStorageProvider: () => ({
      getRecordSchemaArtifact: async () => artifact,
      listRecordSchemaReferences: async () => grants,
      touchRecordSchemaArtifact: async () => successfulStorageResponse(),
    }),
    getContributorRegistry: recordSchemaCoreRegistry,
    resolveContractContext,
    authorizeCreate,
    buildContractFormConfig: async () => ({
      ok: true,
      effectiveForm: immutableControllerEffectiveForm(),
    }),
  });
  return { service, resolveContractContext, authorizeCreate };
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
  readonly unexpectedFailureContext: 'controller-create' | 'controller-update' | 'controller-immutable';
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
      unexpectedFailureContext: 'controller-create',
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
      unexpectedFailureContext: 'controller-update',
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
      unexpectedFailureContext: 'controller-immutable',
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
  let logError: sinon.SinonStub;
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
    logError = sinon.stub();
    Reflect.set(globalThis, 'sails', {
      config: {},
      services: { recordschemaservice: resolver },
      log: {
        verbose: sinon.stub(),
        debug: sinon.stub(),
        info: sinon.stub(),
        warn: sinon.stub(),
        error: logError,
        trace: sinon.stub(),
      },
    });
    Reflect.set(globalThis, 'BrandingService', { getBrand, getRootContext: sinon.stub().returns('') });
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

  it('delegates create with normalized validated input and the resolved authenticated caller', async function () {
    const digest = 'b'.repeat(64);
    const etag = schemaEtag(digest);
    const context = schemaContext('create');
    const document = schemaDocument(context, 'complete', digest);
    const result: Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveCreate']>> = {
      kind: 'resolved',
      document,
      digest,
      metadata: {
        schemaKind: 'create',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'complete',
        byteLength: 1,
        etag,
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
      headers: { 'If-None-Match': `"sha256:${'f'.repeat(64)}"` },
    });
    const res = responseAdapter();

    await controller.create(req, res);

    expect(getBrand.calledOnceWithExactly('default')).to.equal(true);
    expect(
      resolver.resolveCreate.calledOnceWithExactly({
        brand: 'brand-1',
        branding: 'default',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'submit',
        caller: {
          brand: resolvedBrand,
          user: defaultRequestUser,
        },
      })
    ).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({
      req,
      res,
      response: {
        format: 'raw-json',
        mediaType: RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
        data: document,
        headers: successfulSchemaHeaders(etag, `/default/portal-1/api/records/schemas/${digest}`),
      },
    });
  });

  it('delegates update with the resolved brand and authenticated caller context', async function () {
    const digest = 'c'.repeat(64);
    const etag = schemaEtag(digest);
    const context = schemaContext('update');
    const document = schemaDocument(context, 'partial', digest);
    const result: Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveUpdate']>> = {
      kind: 'partial',
      document,
      digest,
      metadata: {
        schemaKind: 'update',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'partial',
        byteLength: 1,
        etag,
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
        branding: 'default',
        portal: 'portal-1',
        oid: 'record-1',
        operation: undefined,
        caller: {
          brand: resolvedBrand,
          user,
        },
      })
    ).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({
      req,
      res,
      response: {
        format: 'raw-json',
        mediaType: RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
        data: document,
        headers: successfulSchemaHeaders(etag, `/default/portal-1/api/records/schemas/${digest}`),
      },
    });
  });

  it('delegates immutable retrieval with only the validated conditional header and sends raw schema JSON', async function () {
    const digest = 'a'.repeat(64);
    const etag = schemaEtag(digest);
    const staleEtag = `"sha256:${'f'.repeat(64)}"`;
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
        headers: { authorization: 'Bearer private-token', 'if-none-match': ` ${staleEtag} ` },
      },
      { user }
    );
    const res = responseAdapter();

    await controller.immutable(req, res);

    expect(
      resolver.resolveImmutable.calledOnceWithExactly({
        brand: 'brand-1',
        branding: 'default',
        portal: 'portal-1',
        digest,
        caller: {
          brand: resolvedBrand,
          user,
        },
        ifNoneMatch: staleEtag,
      })
    ).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({
      req,
      res,
      response: {
        format: 'raw-json',
        mediaType: RECORD_SCHEMA_RESPONSE_MEDIA_TYPE,
        data: document,
        headers: successfulSchemaHeaders(etag),
      },
    });
  });

  it('returns bodyless 304 with resolver headers after an exact authorized create ETag match', async function () {
    const digest = 'd'.repeat(64);
    const etag = schemaEtag(digest);
    const context = schemaContext('create');
    const document = schemaDocument(context, 'complete', digest);
    resolver.resolveCreate.resolves({
      kind: 'resolved',
      document,
      digest,
      metadata: {
        schemaKind: 'create',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'complete',
        byteLength: 1,
        etag,
        context,
      },
      grant: {
        referenceKey: 'grant-create-not-modified',
        digest,
        brand: 'brand-1',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'strict-all',
        kind: 'grant',
        schemaKind: 'create',
      },
    });
    const req = validatedRequest(resolveCreateRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', recordType: 'dataset' },
      query: {},
      headers: { 'If-None-Match': ` \t${etag}\t ` },
    });
    const res = responseAdapter();

    await controller.create(req, res);

    expect(resolver.resolveCreate.calledOnce).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({
      req,
      res,
      response: {
        status: 304,
        headers: successfulSchemaHeaders(etag, `/default/portal-1/api/records/schemas/${digest}`),
      },
    });
  });

  it('returns bodyless 304 with resolver headers after an exact authorized update ETag match', async function () {
    const digest = 'e'.repeat(64);
    const etag = schemaEtag(digest);
    const context = schemaContext('update');
    const document = schemaDocument(context, 'partial', digest);
    resolver.resolveUpdate.resolves({
      kind: 'partial',
      document,
      digest,
      metadata: {
        schemaKind: 'update',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'partial',
        byteLength: 1,
        etag,
        context,
      },
      grant: {
        referenceKey: 'grant-update-not-modified',
        digest,
        brand: 'brand-1',
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'strict-all',
        kind: 'grant',
        schemaKind: 'update',
        oid: 'record-1',
      },
    });
    const req = validatedRequest(resolveUpdateRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', oid: 'record-1' },
      query: {},
      headers: { 'If-None-Match': etag },
    });
    const res = responseAdapter();

    await controller.update(req, res);

    expect(resolver.resolveUpdate.calledOnce).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({
      req,
      res,
      response: {
        status: 304,
        headers: successfulSchemaHeaders(etag, `/default/portal-1/api/records/schemas/${digest}`),
      },
    });
  });

  it('uses the public branding route segment in resolver Links for 200 and 304 responses', async function () {
    const digest = 'f'.repeat(64);
    const etag = schemaEtag(digest);
    const canonicalLink = `</default/portal-1/api/records/schemas/${digest}>; rel="canonical"; type="application/schema+json"`;
    const createContext = schemaContext('create');
    const createDocument = schemaDocument(createContext, 'complete', digest);
    resolver.resolveCreate.resolves({
      kind: 'resolved',
      document: createDocument,
      digest,
      metadata: {
        schemaKind: 'create',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'complete',
        byteLength: 1,
        etag,
        context: createContext,
      },
      grant: {
        referenceKey: 'grant-create-public-link',
        digest,
        brand: resolvedBrand.id,
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'strict-all',
        kind: 'grant',
        schemaKind: 'create',
      },
    });
    const createReq = validatedRequest(resolveCreateRecordSchemaRoute, {
      params: { branding: resolvedBrand.name, portal: 'portal-1', recordType: 'dataset' },
      query: {},
      headers: {},
    });

    await controller.create(createReq, responseAdapter());

    expect(createDocument.$id).to.equal(`/brand-1/portal-1/api/records/schemas/${digest}`);
    expect(onlySentResponse(controller).response.headers?.Link).to.equal(canonicalLink);

    resetControllerHistory(controller, resolver);
    const updateContext = schemaContext('update');
    const updateDocument = schemaDocument(updateContext, 'partial', digest);
    resolver.resolveUpdate.resolves({
      kind: 'partial',
      document: updateDocument,
      digest,
      metadata: {
        schemaKind: 'update',
        contractFormat: 'redbox-record-contract/1',
        completeness: 'partial',
        byteLength: 1,
        etag,
        context: updateContext,
      },
      grant: {
        referenceKey: 'grant-update-public-link',
        digest,
        brand: resolvedBrand.id,
        portal: 'portal-1',
        recordType: 'dataset',
        operation: 'strict-all',
        kind: 'grant',
        schemaKind: 'update',
        oid: 'record-1',
      },
    });
    const updateReq = validatedRequest(resolveUpdateRecordSchemaRoute, {
      params: { branding: resolvedBrand.name, portal: 'portal-1', oid: 'record-1' },
      query: {},
      headers: { 'If-None-Match': etag },
    });

    await controller.update(updateReq, responseAdapter());

    expect(onlySentResponse(controller).response).to.deep.include({ status: 304 });
    expect(onlySentResponse(controller).response.headers?.Link).to.equal(canonicalLink);
  });

  it('returns bodyless 304 for an immutable service cache hit authorized before ETag evaluation', async function () {
    const digest = 'a'.repeat(64);
    const etag = schemaEtag(digest);
    const now = new Date('2026-08-26T00:00:00.000Z');
    resolver.resolveImmutable.resolves({
      kind: 'not-modified',
      artifact: {
        digest,
        document: { type: 'object' },
        contractFormat: 'redbox-record-contract/1',
        completeness: 'complete',
        byteLength: 1,
        createdAt: now,
        updatedAt: now,
      },
    });
    const req = validatedRequest(getImmutableRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', digest },
      query: {},
      headers: { 'If-None-Match': etag },
    });
    const res = responseAdapter();

    await controller.immutable(req, res);

    expect(
      resolver.resolveImmutable.calledOnceWithExactly({
        brand: 'brand-1',
        branding: 'default',
        portal: 'portal-1',
        digest,
        caller: { brand: resolvedBrand, user: defaultRequestUser },
        ifNoneMatch: etag,
      })
    ).to.equal(true);
    expect(onlySentResponse(controller)).to.deep.equal({
      req,
      res,
      response: {
        status: 304,
        headers: successfulSchemaHeaders(etag),
      },
    });
  });

  it('maps create service failures to deterministic 400, 403, 409, 413, 422, and 503 Problem Details', async function () {
    const instance = '/default/portal-1/api/records/schemas/create/dataset';
    const cases: Array<{
      result: Awaited<ReturnType<RecordSchemaService.Services.RecordSchema['resolveCreate']>>;
      problemKind: ExpectedProblemKind;
      code?: RecordSchemaProblemCode;
    }> = [
      {
        result: {
          kind: 'context-failed',
          failureKind: 'invalid-request',
          diagnosticCodes: ['private-invalid-request-diagnostic'],
        },
        problemKind: 'invalid-request',
      },
      {
        result: {
          kind: 'context-failed',
          failureKind: 'not-resolvable',
          diagnosticCodes: ['private-context-diagnostic'],
          reason: 'empty-effective-form',
        },
        problemKind: 'not-resolvable',
      },
      {
        result: {
          kind: 'context-failed',
          failureKind: 'forbidden',
          diagnosticCodes: ['private-create-acl-diagnostic'],
        },
        problemKind: 'forbidden',
      },
      {
        result: {
          kind: 'limit-exceeded',
          stage: 'compiler',
          code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DEPTH,
          diagnostics: [{ code: 'private-limit-diagnostic', severity: 'error', message: 'private limit detail' }],
        },
        problemKind: 'limit-exceeded',
        code: RECORD_SCHEMA_PROBLEM_CODES.LIMIT_DEPTH,
      },
      {
        result: {
          kind: 'compiler-failed',
          failureKind: 'contributor-failed',
          code: RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID,
          diagnostics: [{ code: 'private-contributor-diagnostic', severity: 'error', message: 'private detail' }],
        },
        problemKind: 'invalid-contract',
        code: RECORD_SCHEMA_PROBLEM_CODES.CONTRIBUTOR_INVALID,
      },
      {
        result: {
          kind: 'storage-failed',
          stage: 'artifact',
          code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
        },
        problemKind: 'unavailable',
        code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
      },
    ];
    const req = validatedRequest(resolveCreateRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', recordType: 'dataset' },
      query: {},
      headers: {},
    });

    for (const testCase of cases) {
      resetControllerHistory(controller, resolver);
      resolver.resolveCreate.resolves(testCase.result);

      await controller.create(req, responseAdapter());

      const response = onlySentResponse(controller).response;
      expect(response).to.deep.equal(expectedProblemResponse(testCase.problemKind, instance, testCase.code));
      expect(JSON.stringify(response.data)).not.to.match(/private|empty-effective-form/);
      expect(response.headers).to.deep.equal({
        'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
        Vary: RECORD_SCHEMA_RESPONSE_VARY,
      });
    }
  });

  it('makes denied and missing-OID update outcomes identical generic 404 responses', async function () {
    const req = validatedRequest(resolveUpdateRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', oid: 'record-1' },
      query: {},
      headers: {},
    });
    resolver.resolveUpdate.resolves({ kind: 'denied', code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN });

    await controller.update(req, responseAdapter());
    const denied = onlySentResponse(controller).response;

    resetControllerHistory(controller, resolver);
    resolver.resolveUpdate.resolves({ kind: 'missing-oid', code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND });
    await controller.update(req, responseAdapter());
    const missing = onlySentResponse(controller).response;

    expect(denied).to.deep.equal(
      expectedProblemResponse('not-found', '/default/portal-1/api/records/schemas/update/record-1')
    );
    expect(missing).to.deep.equal(denied);
    expect(JSON.stringify(denied)).not.to.include(RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN);
  });

  it('gives update context failure kinds precedence over private diagnostics', async function () {
    const req = validatedRequest(resolveUpdateRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', oid: 'record-1' },
      query: {},
      headers: {},
    });

    resolver.resolveUpdate.resolves({
      kind: 'context-failed',
      failureKind: 'forbidden',
      diagnosticCodes: [RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED, 'private-record-id-record-1'],
    });

    await controller.update(req, responseAdapter());

    const precedenceResponse = onlySentResponse(controller).response;
    expect(precedenceResponse).to.deep.equal(
      expectedProblemResponse('forbidden', '/default/portal-1/api/records/schemas/update/record-1')
    );
    expect(JSON.stringify(precedenceResponse)).not.to.include('private-record-id');
  });

  it('makes inaccessible and missing immutable artifacts identical 404 responses before conditional handling', async function () {
    const digest = 'a'.repeat(64);
    const etag = schemaEtag(digest);
    const instance = `/default/portal-1/api/records/schemas/${digest}`;
    const req = validatedRequest(getImmutableRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', digest },
      query: {},
      headers: { 'If-None-Match': etag },
    });
    const hostileProblem = {
      type: 'https://internal.example/problems/existence-leak',
      title: 'Private artifact exists',
      status: 403 as const,
      detail: 'private grant, user, role, OID and exception detail',
      instance: `/brand-1/internal/${digest}`,
      code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
    };

    resolver.resolveImmutable.resolves({ kind: 'forbidden', problem: hostileProblem });
    await controller.immutable(req, responseAdapter());
    const inaccessible = onlySentResponse(controller).response;

    resetControllerHistory(controller, resolver);
    resolver.resolveImmutable.resolves({
      kind: 'not-found',
      problem: {
        ...hostileProblem,
        status: 404,
        code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND,
      },
    });
    await controller.immutable(req, responseAdapter());
    const missing = onlySentResponse(controller).response;

    expect(inaccessible).to.deep.equal(expectedProblemResponse('not-found', instance));
    expect(missing).to.deep.equal(inaccessible);
    expect(JSON.stringify(inaccessible.data)).not.to.match(/private|brand-1|user|role|OID|exception/);
    expect(inaccessible.headers).to.deep.equal({
      'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL,
      Vary: RECORD_SCHEMA_RESPONSE_VARY,
    });
  });

  it('returns 404 when an immutable create grant is form-visible but current create ACL access is absent', async function () {
    const seed = await immutableControllerSeed();
    const boundary = immutableControllerService(seed, seed.artifact, [seed.grant], true, false);
    controller.RecordSchemaService = boundary.service;
    const req = validatedRequest(getImmutableRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', digest: seed.artifact.digest },
      query: {},
      headers: {},
    });

    await controller.immutable(req, responseAdapter());

    expect(onlySentResponse(controller).response).to.deep.equal(
      expectedProblemResponse('not-found', `/default/portal-1/api/records/schemas/${seed.artifact.digest}`)
    );
    expect(boundary.resolveContractContext.calledOnce).to.equal(true);
    expect(boundary.authorizeCreate.calledOnce).to.equal(true);
  });

  it('hides pre-authorization immutable corruption but preserves authorized invalid-contract responses', async function () {
    const seed = await immutableControllerSeed();
    const digest = seed.artifact.digest;
    const instance = `/default/portal-1/api/records/schemas/${digest}`;
    const req = validatedRequest(getImmutableRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', digest },
      query: {},
      headers: {},
    });
    const corruptedArtifactBeforeAuthorization = { digest: 'b'.repeat(64) };
    const corruptedGrantBeforeAuthorization = { kind: 'grant', digest };
    const corruptedArtifactAfterAuthorization: RecordSchemaArtifactModel = {
      ...seed.artifact,
      document: {
        ...seed.artifact.document,
        title: 'Tampered after persistence',
      },
    };
    const cases = [
      {
        name: 'missing',
        artifact: null,
        grants: [],
        equivalentAuthorization: false,
      },
      {
        name: 'inaccessible corrupt artifact',
        artifact: corruptedArtifactBeforeAuthorization,
        grants: [seed.grant],
        equivalentAuthorization: false,
      },
      {
        name: 'inaccessible corrupt grant',
        artifact: seed.artifact,
        grants: [corruptedGrantBeforeAuthorization],
        equivalentAuthorization: false,
      },
      {
        name: 'authorized invalid contract',
        artifact: corruptedArtifactAfterAuthorization,
        grants: [seed.grant],
        equivalentAuthorization: true,
      },
    ] as const;
    const responses = new Map<string, BuildResponseType>();

    for (const testCase of cases) {
      controller.resetSentResponses();
      const boundary = immutableControllerService(
        seed,
        testCase.artifact,
        testCase.grants,
        testCase.equivalentAuthorization
      );
      controller.RecordSchemaService = boundary.service;

      await controller.immutable(req, responseAdapter());

      responses.set(testCase.name, onlySentResponse(controller).response);
      if (!testCase.equivalentAuthorization) {
        expect(boundary.resolveContractContext.notCalled, testCase.name).to.equal(true);
      } else {
        expect(boundary.resolveContractContext.calledOnce, testCase.name).to.equal(true);
      }
    }

    const missing = responses.get('missing');
    expect(missing).to.deep.equal(expectedProblemResponse('not-found', instance));
    expect(responses.get('inaccessible corrupt artifact')).to.deep.equal(missing);
    expect(responses.get('inaccessible corrupt grant')).to.deep.equal(missing);
    expect(responses.get('authorized invalid contract')).to.deep.equal(
      expectedProblemResponse('invalid-contract', instance)
    );
  });

  it('gives immutable result kinds precedence over conflicting embedded Problem Details statuses', async function () {
    const digest = 'b'.repeat(64);
    const instance = `/default/portal-1/api/records/schemas/${digest}`;
    const req = validatedRequest(getImmutableRecordSchemaRoute, {
      params: { branding: 'default', portal: 'portal-1', digest },
      query: {},
      headers: {},
    });
    resolver.resolveImmutable.resolves({
      kind: 'unavailable',
      problem: {
        type: 'https://internal.example/wrong',
        title: 'Wrong embedded status',
        status: 400,
        detail: 'private exception text',
        instance: '/brand-1/private',
        code: RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE,
      },
    });

    await controller.immutable(req, responseAdapter());

    const response = onlySentResponse(controller).response;
    expect(response).to.deep.equal(
      expectedProblemResponse('unavailable', instance, RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE)
    );
    expect(JSON.stringify(response)).not.to.match(/internal|Wrong|exception|brand-1/);
  });

  it('does not delegate when validated request context is missing', async function () {
    const req = requestAdapter();
    req.user = defaultRequestUser;
    const res = responseAdapter();

    await controller.create(req, res);

    expect(resolver.resolveCreate.notCalled).to.equal(true);
    const sent = onlySentResponse(controller);
    expect(sent.response).to.include({ status: 503, mediaType: RECORD_SCHEMA_PROBLEM_MEDIA_TYPE });
    expect(sent.response).not.to.have.property('errors');
    expect(JSON.stringify(sent.response)).not.to.include('Validated request string is required');
  });

  it('returns truthful 401 Problem Details for a missing authenticated user before every delegation', async function () {
    for (const testCase of controllerActionCases(controller, resolver, {})) {
      resetControllerHistory(controller, resolver);
      const res = responseAdapter();

      await testCase.run(testCase.request, res);

      expect(testCase.resolver.notCalled).to.equal(true);
      const sent = onlySentResponse(controller);
      expect(sent.response).to.include({
        format: 'raw-json',
        mediaType: RECORD_SCHEMA_PROBLEM_MEDIA_TYPE,
        status: 401,
      });
      expect(sent.response.data).to.deep.include({
        type: 'https://redboxresearchdata.com/problems/record-schema-authentication-required',
        title: 'Authentication is required',
        status: 401,
        code: RECORD_SCHEMA_PROBLEM_CODES.AUTHENTICATION_REQUIRED,
      });
      expect(sent.response).not.to.have.property('errors');
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
        expect(sent.response).to.include({ status: 401, mediaType: RECORD_SCHEMA_PROBLEM_MEDIA_TYPE });
        expect(sent.response).not.to.have.property('errors');
        expect(JSON.stringify(sent.response)).not.to.include('private-token');
      }
    }
  });

  it('logs only the allowlisted event, controller context, and error type for Error and non-Error failures', async function () {
    const privateFailureDetails = {
      oid: 'oid-1',
      token: 'private-token',
      record: { title: 'private-record-value' },
      ajvErrors: [{ keyword: 'required', instancePath: '/private-field' }],
      validatorDetails: { validator: 'private-validator', schemaPath: '#/private-schema' },
    };
    const failures = [
      {
        value: Object.assign(new Error('private resolver failure for oid-1 with private-token'), privateFailureDetails),
        errorType: 'error',
      },
      {
        value: {
          message: 'private non-error resolver failure for oid-1 with private-token',
          ...privateFailureDetails,
        },
        errorType: 'non-error',
      },
    ] as const;
    const privateFailureContent =
      /private resolver|private non-error|oid-1|private-token|private-record-value|required|private-field|private-validator|private-schema/;

    for (const failure of failures) {
      for (const testCase of controllerActionCases(controller, resolver)) {
        controller.resetSentResponses();
        logError.resetHistory();
        testCase.resolver.rejects(failure.value);
        const res = responseAdapter();

        await testCase.run(testCase.request, res);

        const response = onlySentResponse(controller).response;
        expect(response).to.include({ status: 503, mediaType: RECORD_SCHEMA_PROBLEM_MEDIA_TYPE });
        expect(response).not.to.have.property('errors');
        expect(response.data).to.deep.include({
          title: 'Record schema is unavailable',
          status: 503,
          detail: 'The record schema capability is temporarily unavailable.',
          code: RECORD_SCHEMA_PROBLEM_CODES.UNAVAILABLE,
        });
        expect(JSON.stringify(response)).not.to.match(privateFailureContent);
        expect(
          logError.calledOnceWithExactly('record_schema_unexpected_failure', {
            event: 'record_schema_unexpected_failure',
            context: testCase.unexpectedFailureContext,
            error_type: failure.errorType,
          })
        ).to.equal(true);
        expect(JSON.stringify(logError.firstCall.args)).not.to.match(privateFailureContent);
      }
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
