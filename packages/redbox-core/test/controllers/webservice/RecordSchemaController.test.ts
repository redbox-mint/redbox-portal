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
import * as sinon from 'sinon';

import { httpRouteFixture } from '../../helpers/httpRouteFixture';
import { mountRecordSchemaReadRoutes, recordSchemaReadRoutes } from '../../../src/http/express/recordSchemaReads';
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
import type {
  RecordSchemaArtifactModel,
  RecordSchemaAuthorizationGrantQuery,
  RecordSchemaGrantReferenceInput,
  RecordSchemaService,
} from '../../../src';
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
      findRecordSchemaGrantForAuthorization: async (query: RecordSchemaAuthorizationGrantQuery) => {
        if (query.afterReferenceKey === undefined) return grants[0] ?? null;
        for (const grant of grants) {
          if (grant === null || typeof grant !== 'object') continue;
          const referenceKey = Reflect.get(grant, 'referenceKey');
          if (typeof referenceKey === 'string' && referenceKey > query.afterReferenceKey) return grant;
        }
        return null;
      },
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

const defaultRequestUser = requestUser([
  role('role-z', 'Zeta'),
  role('role-a', 'Alpha'),
  role('role-z-duplicate', 'Zeta'),
]);

describe('Owned record schema HTTP', function () {
  let f: Awaited<ReturnType<typeof httpRouteFixture>>;
  let resolver: Record<string, sinon.SinonStub>;
  let response: Awaited<ReturnType<typeof f.request>>;
  const digest = 'a'.repeat(64);
  const instance = (
    action: string,
    value = action === 'immutable' ? digest : action === 'create' ? 'dataset' : 'record-1'
  ) => `/default/portal-1/api/records/schemas/${action === 'immutable' ? value : action + '/' + value}`;
  function resolved(kind: 'create' | 'update', selectedDigest = digest) {
    const context = schemaContext(kind);
    return {
      kind: 'resolved',
      document: schemaDocument(context, 'complete', selectedDigest),
      digest: selectedDigest,
      metadata: { etag: schemaEtag(selectedDigest) },
    };
  }
  async function request(
    action: string,
    options: { value?: string; query?: Record<string, string>; headers?: Record<string, string> } = {}
  ) {
    response = await f.request(instance(action, options.value) + '?' + new URLSearchParams(options.query), {
      headers: options.headers,
    });
    return response;
  }
  function headers(expected: Record<string, string>) {
    for (const [name, value] of Object.entries(expected)) assert.equal(response.headers.get(name), value, name);
  }
  function problem(kind: ExpectedProblemKind, pathname: string, code?: RecordSchemaProblemCode) {
    const expected = expectedProblemDescriptors[kind];
    assert.equal(response.status, expected.status);
    assert.deepEqual(response.body, { ...expected, instance: pathname, code: code ?? expected.code });
    assert.match(response.headers.get('Content-Type')!, /^application\/problem\+json/);
    headers({ 'Cache-Control': RECORD_SCHEMA_RESPONSE_CACHE_CONTROL, Vary: RECORD_SCHEMA_RESPONSE_VARY });
    assert.equal(response.body.errors, undefined);
    assert.equal(response.body.data, undefined);
  }
  beforeEach(async function () {
    resolver = { resolveCreate: sinon.stub(), resolveUpdate: sinon.stub(), resolveImmutable: sinon.stub() };
    f = await httpRouteFixture((router, input) =>
      mountRecordSchemaReadRoutes(router, { ...input, schemas: resolver as any })
    );
    Object.assign(f.input, { portals: ['portal-1'] });
    f.authenticate.resolves({
      ...f.actor,
      type: 'local',
      name: 'Alice Example',
      email: 'alice@example.test',
      roles: [
        { id: 'role-z', name: 'Zeta', brandId: f.brand.id },
        { id: 'role-a', name: 'Alpha', brandId: f.brand.id },
        { id: 'role-z-duplicate', name: 'Zeta', brandId: f.brand.id },
      ],
    });
  });
  afterEach(async function () {
    await f.close();
    sinon.restore();
  });
  it('registers create, update and immutable routes without generated shims', function () {
    assert.deepEqual(
      recordSchemaReadRoutes.map(route => route.action),
      ['create', 'update', 'immutable']
    );
    assert.ok(recordSchemaReadRoutes.every(route => route.method === 'get'));
  });
  it('delegates create with normalized validated input and the selected authenticated caller', async function () {
    const result = resolved('create', 'b'.repeat(64));
    resolver.resolveCreate.resolves(result);
    await request('create', { value: ' dataset ', query: { operation: ' submit ' } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, result.document);
    const input = resolver.resolveCreate.firstCall.args[0];
    assert.equal(input.recordType, 'dataset');
    assert.equal(input.operation, 'submit');
    assert.equal(input.brand, 'brand-1');
    assert.equal(input.branding, 'default');
    assert.equal(input.portal, 'portal-1');
    assert.equal(input.caller.user.username, 'alice');
    assert.equal(input.caller.user.token, undefined);
    assert.deepEqual(input.caller.user.additionalAttributes, {});
    assert.deepEqual(
      input.caller.user.roles.map((r: any) => [r.id, r.name, r.branding.id]),
      [
        ['role-z', 'Zeta', 'brand-1'],
        ['role-a', 'Alpha', 'brand-1'],
        ['role-z-duplicate', 'Zeta', 'brand-1'],
      ]
    );
    headers(successfulSchemaHeaders(result.metadata.etag, `/default/portal-1/api/records/schemas/${result.digest}`));
  });
  it('delegates update with resolved brand and authenticated caller context', async function () {
    const result = { ...resolved('update', 'c'.repeat(64)), kind: 'partial' };
    resolver.resolveUpdate.resolves(result);
    await request('update', { value: ' record-1 ' });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, result.document);
    const input = resolver.resolveUpdate.firstCall.args[0];
    assert.equal(input.oid, 'record-1');
    assert.equal(input.operation, undefined);
    assert.equal(input.brand, f.brand.id);
    assert.equal(input.caller.user.username, 'alice');
    headers(successfulSchemaHeaders(result.metadata.etag, `/default/portal-1/api/records/schemas/${result.digest}`));
  });
  it('delegates immutable retrieval with the validated conditional header and sends raw JSON', async function () {
    resolver.resolveImmutable.resolves({ kind: 'resolved', artifact: { digest, document: { type: 'object' } } });
    const stale = schemaEtag('f'.repeat(64));
    await request('immutable', { headers: { 'If-None-Match': ` ${stale} `, Authorization: 'Bearer private-token' } });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { type: 'object' });
    assert.equal(resolver.resolveImmutable.firstCall.args[0].ifNoneMatch, stale);
    assert.equal(resolver.resolveImmutable.firstCall.args[0].caller.user.token, undefined);
    headers(successfulSchemaHeaders(schemaEtag(digest)));
  });
  for (const action of ['create', 'update'] as const) {
    it(`returns bodyless 304 after an exact authorized ${action} ETag match`, async function () {
      resolver[action === 'create' ? 'resolveCreate' : 'resolveUpdate'].resolves(resolved(action));
      await request(action, { headers: { 'If-None-Match': ` \t${schemaEtag(digest)}\t ` } });
      assert.equal(response.status, 304);
      assert.equal(response.text, '');
      headers(successfulSchemaHeaders(schemaEtag(digest), `/default/portal-1/api/records/schemas/${digest}`));
    });
  }
  it('uses the public branding route segment in Links for 200 and 304', async function () {
    for (const action of ['create', 'update'] as const) {
      resolver[action === 'create' ? 'resolveCreate' : 'resolveUpdate'].resolves(resolved(action));
      await request(action, { headers: action === 'update' ? { 'If-None-Match': schemaEtag(digest) } : {} });
      assert.equal(response.status, action === 'create' ? 200 : 304);
      assert.equal(
        response.headers.get('Link'),
        recordSchemaCanonicalLink(`/default/portal-1/api/records/schemas/${digest}`)
      );
    }
  });
  it('returns bodyless 304 for an immutable cache hit authorized before ETag evaluation', async function () {
    resolver.resolveImmutable.resolves({ kind: 'not-modified', artifact: { digest, document: { type: 'object' } } });
    await request('immutable', { headers: { 'If-None-Match': schemaEtag(digest) } });
    assert.equal(response.status, 304);
    assert.equal(response.text, '');
    headers(successfulSchemaHeaders(schemaEtag(digest)));
    assert.equal(resolver.resolveImmutable.firstCall.args[0].ifNoneMatch, schemaEtag(digest));
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

    for (const testCase of cases) {
      resolver.resolveCreate.resolves(testCase.result);
      await request('create');
      problem(testCase.problemKind, instance, testCase.code);
      assert.ok(!/private|empty-effective-form/.test(response.text));
    }
  });
  it('makes denied and missing-OID update outcomes identical generic 404 responses', async function () {
    resolver.resolveUpdate.resolves({ kind: 'denied', code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN });
    await request('update');
    problem('not-found', instance('update'));
    const denied = response.body;
    resolver.resolveUpdate.resolves({ kind: 'missing-oid', code: RECORD_SCHEMA_PROBLEM_CODES.NOT_FOUND });
    await request('update');
    problem('not-found', instance('update'));
    assert.deepEqual(response.body, denied);
    assert.ok(!response.text.includes(RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN));
  });
  it('gives update context failure kinds precedence over private diagnostics', async function () {
    resolver.resolveUpdate.resolves({
      kind: 'context-failed',
      failureKind: 'forbidden',
      diagnosticCodes: [RECORD_SCHEMA_PROBLEM_CODES.LIMIT_EXCEEDED, 'private-record-id-record-1'],
    });
    await request('update');
    problem('forbidden', instance('update'));
    assert.ok(!response.text.includes('private-record-id'));
  });
  it('makes inaccessible and missing immutable artifacts identical 404 before conditional handling', async function () {
    let denied: unknown;
    for (const kind of ['forbidden', 'not-found']) {
      resolver.resolveImmutable.resolves({
        kind,
        problem: {
          status: 403,
          detail: 'private grant, user, role, OID and exception detail',
          instance: '/brand-1/internal',
          code: RECORD_SCHEMA_PROBLEM_CODES.FORBIDDEN,
        },
      });
      await request('immutable', { headers: { 'If-None-Match': schemaEtag(digest) } });
      problem('not-found', instance('immutable'));
      assert.ok(!/private|brand-1|user|role|OID|exception/.test(response.text));
      if (denied) assert.deepEqual(response.body, denied);
      else denied = response.body;
    }
  });
  it('returns 404 for a form-visible immutable grant when current create ACL access is absent', async function () {
    const seed = await immutableControllerSeed();
    const boundary = immutableControllerService(seed, seed.artifact, [seed.grant], true, false);
    resolver.resolveImmutable.callsFake(boundary.service.resolveImmutable.bind(boundary.service));
    await request('immutable', { value: seed.artifact.digest });
    problem('not-found', instance('immutable', seed.artifact.digest));
    sinon.assert.calledOnce(boundary.resolveContractContext);
    sinon.assert.calledOnce(boundary.authorizeCreate);
  });
  it('hides pre-authorization corruption but preserves authorized invalid-contract responses', async function () {
    const seed = await immutableControllerSeed();
    const selectedDigest = seed.artifact.digest;
    const cases = [
      { artifact: null, grants: [], equivalent: false },
      { artifact: { digest: 'b'.repeat(64) }, grants: [seed.grant], equivalent: false },
      { artifact: seed.artifact, grants: [{ kind: 'grant', digest: selectedDigest }], equivalent: false },
      {
        artifact: { ...seed.artifact, document: { ...seed.artifact.document, title: 'Tampered after persistence' } },
        grants: [seed.grant],
        equivalent: true,
      },
    ];
    let missing: unknown;
    for (const c of cases) {
      const boundary = immutableControllerService(seed, c.artifact, c.grants, c.equivalent);
      resolver.resolveImmutable.callsFake(boundary.service.resolveImmutable.bind(boundary.service));
      await request('immutable', { value: selectedDigest });
      problem(c.equivalent ? 'invalid-contract' : 'not-found', instance('immutable', selectedDigest));
      if (!c.equivalent) {
        if (missing) assert.deepEqual(response.body, missing);
        else missing = response.body;
        sinon.assert.notCalled(boundary.resolveContractContext);
      } else sinon.assert.calledOnce(boundary.resolveContractContext);
    }
  });
  it('gives immutable result kinds precedence over conflicting embedded Problem Details statuses', async function () {
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
    await request('immutable');
    problem('unavailable', instance('immutable'), RECORD_SCHEMA_PROBLEM_CODES.STORAGE_UNAVAILABLE);
    assert.ok(!/internal|Wrong|exception|brand-1/.test(response.text));
  });
  it('refuses missing route context before delegation', async function () {
    const r = await f.request('/schema');
    assert.equal(r.status, 404);
    sinon.assert.notCalled(resolver.resolveCreate);
  });
  it('returns truthful 401 Problem Details for absent authentication before every delegation', async function () {
    f.authenticate.resolves(undefined);
    for (const [action, method] of [
      ['create', 'resolveCreate'],
      ['update', 'resolveUpdate'],
      ['immutable', 'resolveImmutable'],
    ]) {
      await request(action);
      problem('authentication-required', instance(action));
      sinon.assert.notCalled(resolver[method]);
    }
  });
  it('refuses partial or malformed client actor hints without authoritative authentication', async function () {
    f.authenticate.resolves(undefined);
    for (const user of [
      { id: 'user-1', username: 'alice', roles: [] },
      { ...defaultRequestUser, username: ' ' },
      { ...defaultRequestUser, roles: [{ id: 'role-1', name: 42 }] },
    ]) {
      for (const [action, method] of [
        ['create', 'resolveCreate'],
        ['update', 'resolveUpdate'],
        ['immutable', 'resolveImmutable'],
      ]) {
        await request(action, { headers: { 'X-User': JSON.stringify(user) } });
        problem('authentication-required', instance(action));
        sinon.assert.notCalled(resolver[method]);
        assert.ok(!response.text.includes('private-token'));
      }
    }
  });
  it('keeps Error and non-Error failures out of diagnostics and public responses', async function () {
    const privateDetails = {
      oid: 'oid-1',
      token: 'private-token',
      record: { title: 'private-record-value' },
      ajvErrors: [{ keyword: 'required', instancePath: '/private-field' }],
      validatorDetails: { validator: 'private-validator', schemaPath: '#/private-schema' },
    };
    for (const failure of [
      Object.assign(new Error('private resolver failure'), privateDetails),
      { message: 'private non-error', ...privateDetails },
    ]) {
      for (const [action, method] of [
        ['create', 'resolveCreate'],
        ['update', 'resolveUpdate'],
        ['immutable', 'resolveImmutable'],
      ]) {
        resolver[method].callsFake(async () => {
          throw failure;
        });
        f.log.error.resetHistory();
        await request(action);
        problem('unavailable', instance(action));
        assert.ok(!/private|oid-1/.test(response.text));
        assert.ok(!/private|oid-1/.test(JSON.stringify(f.log.error.args)));
      }
    }
  });
  it('keeps compiler and storage implementations outside the HTTP owner', function () {
    const source = readFileSync(resolve(__dirname, '../../../src/http/express/recordSchemaReads.ts'), 'utf8');
    assert.ok(!/RecordContractCompiler|compileRecord|StorageService|RedboxJavaStorageService/.test(source));
    assert.ok(!source.includes('compat/'));
  });
});
