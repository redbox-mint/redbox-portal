import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer, request as httpRequest } from 'node:http';
import { createServer as createHttpsServer, get as httpsGet } from 'node:https';
import { tmpdir } from 'node:os';
import { gzipSync } from 'node:zlib';
import path from 'node:path';
import sinon from 'sinon';
import { getFormRoute } from '../../../src/api-routes/groups/forms';
import { brandingDraftRoute } from '../../../src/api-routes/groups/branding';
import { listFigshareSourcesRoute } from '../../../src/api-routes/groups/figshare-vocabulary';
import { importVocabularyRoute, listVocabularyRoute } from '../../../src/api-routes/groups/vocabulary';
import {
  createUserRoute,
  findUserRoute,
  updateUserRoute,
  disableUserRoute,
} from '../../../src/api-routes/groups/users';
import { updateMetaRoute, deleteRecordRoute, addUserEditRoute } from '../../../src/api-routes/groups/records';
import { indexRecordRoute } from '../../../src/api-routes/groups/search';
import { identityAdministrationRoutes } from '../../../src/http/identityRoutes';
import { datastreamReadRoutes } from '../../../src/http/datastreamRoutes';
import { formVocabularyRoutes } from '../../../src/http/integrationRoutes';
import { recordMutationRoutes } from '../../../src/http/mutationRoutes';
import { recordReadRoutes } from '../../../src/http/readRoutes';
import { uploadDeclarations } from '../../../src/http/uploadRoutes';
import { metadataReadRoutes } from '../../../src/http/referenceRoutes';
import { bindControllerFactory } from '../../../src/http/controllers';
import { getIdentityRepositories } from '../../../src/persistence/identity/runtime';
import { coreRouteName } from '../../../src/http/fastify/routes';
import { HttpRouteRegistry } from '../../../src/http/fastify/registry';
import { StaticOwnershipTable } from '../../../src/http/fastify/staticOwnership';
import { referenceOrigin, referenceProductionFixture } from './referenceProductionFixture';
import {
  seedMutationState,
  session,
  settleMutationWork,
  wire,
  type Fixture,
  type Wire,
} from './mutationDifferentialSupport';
import { assertGolden, golden, goldenControls } from './goldenContracts';
import { observeNoSideEffects, withoutSideEffects } from './noSideEffects';
import { actorClearsAfterAdmission } from './authorizationActionHook';

const family = 'retirementRequestPolicy';
const brand = '/default/rdmp';
const bearer = { Authorization: 'Bearer pilot-api-token', Origin: referenceOrigin };
const id = '000000000000000000000015';
const self = identityAdministrationRoutes.find(
  route => route.controller === 'UserController' && route.action === 'update'
)!;
const list = recordReadRoutes.find(route => route.path.endsWith('/listRecords'))!;
const request = (
  f: Fixture,
  url: string,
  method: string,
  version: string,
  headers: Record<string, string> = bearer,
  body?: unknown
) =>
  wire(
    f.url + url,
    method,
    {
      ...headers,
      'X-ReDBox-API-Version': version,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body === undefined ? undefined : JSON.stringify(body)
  );
function stable(result: Wire) {
  const headers = { ...result.headers };
  for (const key of ['date', 'connection', 'keep-alive', 'x-request-id']) delete headers[key];
  if (headers['set-cookie'])
    headers['set-cookie'] = (headers['set-cookie'] as string[]).map(value =>
      value.replace(/^([^=]+)=[^;]+/, '$1=<session>').replace(/Expires=[^;]+/i, 'Expires=<time>')
    );
  const text = result.text.replace(
    /("(?:createdAt|updatedAt|lastLogin)":")\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z(?=")/g,
    (_match, field: string) => field + '0000-00-00T00:00:00.000Z'
  );
  return { ...result, headers, text };
}
const v = ['1.0', '2.0'];
const expected = (result: Wire, status: number, matcher: RegExp) => {
  assert.equal(result.status, status, result.text);
  assert.match(result.text, matcher);
  assert.equal(result.headers.etag, undefined);
};

describe('Target and input allowlists on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  let login: Awaited<ReturnType<typeof session>>;
  before(async () => {
    f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [
        getFormRoute,
        findUserRoute,
        createUserRoute,
        updateUserRoute,
        disableUserRoute,
        self,
        indexRecordRoute,
        updateMetaRoute,
        deleteRecordRoute,
        addUserEditRoute,
        list,
      ],
    });
    login = await session(f);
    await settleMutationWork(f);
  });
  after(async () => f?.close());
  async function observeDenial(
    name: string,
    version: string,
    run: () => Promise<Wire>,
    status: number,
    diagnostic: RegExp
  ) {
    const result = await withoutSideEffects(f, run);
    expected(result, status, diagnostic);
    assertGolden(family, `${name}/${version}`, { wire: stable(result), state: { unchanged: true } });
  }
  for (const version of v) {
    it(`assigns a known role from the brand catalogue in API ${version}`, async () => {
      const username = 'assigned-researcher-' + version;
      const result = await request(f, brand + '/api/users', 'PUT', version, bearer, {
        username,
        name: 'Assigned researcher',
        email: username + '@example.invalid',
        password: 'unused',
        roles: ['Researcher'],
      });
      assert.equal(result.status, 201, result.text);
      const identities = getIdentityRepositories(f.owner);
      const researcher = await identities.one('role', { name: 'Researcher', branding: f.brand.id });
      assert(researcher);
      const user = await identities.one('user', { username }, { populate: ['roles'] });
      assert(user);
      assert.deepEqual(
        (user.roles as { id: string; name: string }[]).map(({ id, name }) => ({ id, name })),
        [{ id: researcher.id, name: 'Researcher' }]
      );
    });
    it(`refuses a role outside the brand catalogue in API ${version}`, async () =>
      observeDenial(
        'unknown-role',
        version,
        () =>
          request(f, brand + '/api/users', 'POST', version, bearer, {
            id,
            name: 'Do not save',
            email: 'fixture@example.invalid',
            password: 'unused',
            roles: ['Unknown-role-in-brand'],
          }),
        400,
        /Unknown role for brand/
      ));
    it(`refuses to disable the authenticated administrator in API ${version}`, async () =>
      observeDenial(
        'disable-self',
        version,
        () => request(f, brand + '/api/users/' + id + '/disable', 'POST', version, bearer, {}),
        400,
        /cannot disable your own account/i
      ));
    it(`refuses role changes through self-service in API ${version}`, async () =>
      observeDenial(
        'self-role',
        version,
        () =>
          wire(
            f.url + brand + '/user/update',
            'POST',
            { ...login, Origin: referenceOrigin, 'Content-Type': 'application/json', 'X-ReDBox-API-Version': version },
            JSON.stringify({ details: { name: 'Do not save', roles: ['Researcher'] } })
          ),
        400,
        /Profile updates cannot change roles/
      ));
    it(`refuses an unlisted account search field in API ${version}`, async () => {
      const allowed = await request(f, brand + '/api/users/find?searchBy=username&query=pilot-admin', 'GET', version);
      assert.equal(allowed.status, 200, allowed.text);
      assert.match(allowed.text, /pilot-admin/);
      await observeDenial(
        'identity-search-field',
        version,
        () => request(f, brand + '/api/users/find?searchBy=roles&query=Admin', 'GET', version),
        400,
        /Invalid user search field/
      );
    });
    it(`refuses indexing a foreign record in API ${version}`, async () =>
      observeDenial(
        'index-foreign',
        version,
        () => request(f, brand + '/api/search/index?oid=foreign-record', 'POST', version, bearer, {}),
        404,
        /Record not found/
      ));
    it(`indexes only the same-tenant control through the production search handoff in API ${version}`, async () => {
      const observe = sinon.createSandbox();
      const search = f.data.search.get();
      const index = observe.spy(search, 'index');
      const enqueue = observe.spy(f.data.queue.get(), 'now');
      const delivered = Promise.withResolvers<void>();
      // Observe the real queue worker, but stop before it can populate the
      // shared Solr index used by exact read expectations.
      const solr = observe.stub(search, 'solrAddOrUpdate').callsFake(async job => {
        assert.equal(job.attrs.data.redboxOid, 'reference-record');
        delivered.resolve();
      });
      try {
        const action = (oid: string) => request(f, brand + '/api/search/index?oid=' + oid, 'POST', version, bearer, {});
        const denied = await withoutSideEffects(f, () => action('foreign-record'));
        expected(denied, 404, /Record not found/);
        sinon.assert.notCalled(index);
        sinon.assert.notCalled(enqueue);
        sinon.assert.notCalled(solr);

        const allowed = await action('reference-record');
        assert.equal(allowed.status, 200, allowed.text);
        await delivered.promise;
        sinon.assert.calledOnce(index);
        sinon.assert.calledWith(index, 'reference-record', sinon.match.has('redboxOid', 'reference-record'));
        sinon.assert.calledOnce(enqueue);
        sinon.assert.calledOnce(solr);
      } finally {
        observe.restore();
      }
    });
    it(`conceals a foreign record during metadata PUT in API ${version}`, async () =>
      observeDenial(
        'metadata-foreign',
        version,
        () =>
          request(f, brand + '/api/records/metadata/foreign-record', 'PUT', version, bearer, { title: 'Cannot write' }),
        400,
        /cannot find existing record/i
      ));
    it(`conceals a foreign record during deletion in API ${version}`, async () =>
      observeDenial(
        'delete-foreign',
        version,
        () => request(f, brand + '/api/records/metadata/foreign-record', 'DELETE', version),
        404,
        /Record not found/
      ));
    it(`refuses blank ACL subjects in API ${version}`, async () =>
      observeDenial(
        'acl-subject',
        version,
        () =>
          request(f, brand + '/api/records/permissions/edit/reference-record', 'POST', version, bearer, {
            users: [' '],
          }),
        400,
        /Invalid permission subjects/
      ));
    it(`refuses an unsupported list filter mode in API ${version}`, async () => {
      const allowed = await request(f, brand + '/listRecords?filterMode=equal', 'GET', version);
      assert.equal(allowed.status, 200, allowed.text);
      await observeDenial(
        'list-filter-mode',
        version,
        () => request(f, brand + '/listRecords?filterMode=unlisted', 'GET', version),
        400,
        /Invalid filter mode/
      );
    });
    it(`does not discover workflow operations from a foreign record in API ${version}`, async () => {
      const forms = f.data.reference.forms.get();
      const discovery = sinon.spy(forms, 'discoverValidationOperations');
      try {
        const url = brand + '/api/forms/get?name=dataRecord&editable=true&oid=';
        const local = await request(f, url + 'reference-record', 'GET', version);
        assert.equal(local.status, 200, local.text);
        sinon.assert.calledOnce(discovery);
        const foreign = await request(f, url + 'foreign-record', 'GET', version);
        assert.equal(foreign.status, 200, foreign.text);
        sinon.assert.calledOnce(discovery);
        assert.doesNotMatch(foreign.text, /foreign-record|"validationOperations":\[\{/);
        assertGolden(family, `foreign-form/${version}`, {
          wire: [local, foreign].map(stable),
          state: { discoveryCalls: discovery.callCount },
        });
      } finally {
        discovery.restore();
      }
    });
  }
});

describe('Action and parser target selection on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  let login: Awaited<ReturnType<typeof session>>;
  const browserSession = async () => (login ??= await session(f));
  before(async () => {
    const browserUpdate = recordMutationRoutes.find(route => route.path.endsWith('/recordmeta/:oid'))!;
    const browserCreate = recordMutationRoutes.find(route => route.path.endsWith('/recordmeta/:recordType'))!;
    f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [updateMetaRoute, browserUpdate, browserCreate, ...datastreamReadRoutes],
    });
  });
  after(async () => f?.close());

  it('refuses a browser metadata create with an unregistered record type', async () => {
    const signedIn = await browserSession();
    const result = await withoutSideEffects(f, () =>
      request(
        f,
        brand + '/recordmeta/unregistered-fixture-type',
        'POST',
        '2.0',
        {
          ...signedIn,
          Origin: referenceOrigin,
        },
        { title: 'Must not be created' }
      )
    );
    assert.equal(result.status, 400, result.text);
    assert.deepEqual(JSON.parse(result.text), { errors: [{ detail: 'Record Type provided is not valid' }], meta: {} });
    assert.equal(result.headers.etag, undefined);
  });

  for (const [variant, path] of [
    ['API', '/api/records/metadata/reference-record'],
    ['browser', '/recordmeta/reference-record'],
  ] as const)
    it(`refuses to dispatch a ${variant} metadata update for an unregistered stored record type`, async () => {
      const signedIn = await browserSession();
      const records = f.client.db().collection('record');
      const filter = { redboxOid: 'reference-record' };
      const original = await records.findOne(filter);
      assert(original);
      assert.equal(
        (await records.updateOne(filter, { $set: { 'metaMetadata.type': 'unregistered-fixture-type' } })).modifiedCount,
        1
      );
      const before = await records.findOne(filter);
      const writes = sinon.spy(f.data.records.get(), 'updateMeta');
      const audit = sinon.spy(f.data.users.get(), 'addUserAuditEvent');
      try {
        const response = await withoutSideEffects(f, () =>
          request(
            f,
            brand + path,
            'PUT',
            '2.0',
            { ...signedIn, Origin: referenceOrigin },
            {
              title: 'Must not be saved',
            }
          )
        );
        assert.equal(response.status, 400, response.text);
        assert.deepEqual(JSON.parse(response.text), {
          errors: [{ detail: 'Record Type provided is not valid' }],
          meta: {},
        });
        assert.equal(response.headers.etag, undefined);
        sinon.assert.notCalled(writes);
        sinon.assert.notCalled(audit);
        assert.deepEqual(await records.findOne(filter), before);
      } finally {
        writes.restore();
        audit.restore();
        await records.replaceOne(filter, original);
      }
    });

  it('refuses a browser download without an attachment identifier before listing attachments', async () => {
    const lookup = sinon.spy(f.data.records.get(), 'getAttachments');
    try {
      const result = await request(
        f,
        brand + '/record/reference-record/datastream',
        'GET',
        '1.0',
        await browserSession()
      );
      const archived = golden(
        'security-ordering',
        'FM-016 FM-004 simultaneous-failure action-prelude differential datastream visible authorization before identifier #0'
      ) as { status: number; text: string };
      assert.equal(result.status, archived.status);
      assert.equal(result.text, archived.text);
      assert.equal(result.headers.etag, undefined);
      sinon.assert.notCalled(lookup);
    } finally {
      lookup.restore();
    }
  });

  for (const [label, contentType, encoding, body] of [
    ['unsupported JSON charset', 'application/json; charset=iso-8859-1', undefined, '{}'],
    ['unsupported form charset', 'application/x-www-form-urlencoded; charset=utf-16le', undefined, 'title=ignored'],
    ['unregistered UTF charset', 'application/json; charset=utf-unregistered', undefined, '{}'],
    ['unknown encoding', 'application/json', 'unregistered', '{}'],
  ] as const)
    it(`rejects ${label} before dispatching the update`, async () => {
      const writes = sinon.spy(f.data.records.get(), 'updateMeta');
      try {
        const response = await withoutSideEffects(f, () =>
          wire(
            f.url + brand + '/api/records/metadata/reference-record',
            'PUT',
            {
              ...bearer,
              'Content-Type': contentType,
              ...(encoding ? { 'Content-Encoding': encoding } : {}),
            },
            body
          )
        );
        const archived =
          label === 'unsupported JSON charset' || label === 'unknown encoding'
            ? (golden(
                'security',
                `FM-016 retained ordinary parser differential before policy execution ${label} #0`
              ) as { status: number; text: string })
            : { status: 415, text: '{"message":"Invalid request","details":""}' };
        assert.equal(response.status, archived.status);
        assert.equal(response.text, archived.text);
        assert.equal(response.headers.etag, undefined);
        sinon.assert.notCalled(writes);
      } finally {
        writes.restore();
      }
    });

  it('accepts configured form and compressed JSON parsers on the production update route', async () => {
    const url = f.url + brand + '/api/records/metadata/reference-record';
    const form = await wire(
      url,
      'PUT',
      { ...bearer, 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' },
      'title=Form'
    );
    assert.equal(form.status, 200, form.text);
    const body = gzipSync(JSON.stringify({ title: 'Compressed JSON' }));
    const response = await fetch(url, {
      method: 'PUT',
      headers: { ...bearer, 'Content-Type': 'application/json; charset=utf-8', 'Content-Encoding': 'gzip' },
      body: new Uint8Array(body),
    });
    assert.equal(response.status, 200, await response.text());
    assert.equal((await f.data.storage().getMeta('reference-record'))?.metadata?.title, 'Compressed JSON');
  });
});

describe('Owned fallback and token Origin gates on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  before(async () => {
    f = await referenceProductionFixture(true, { '*': ['noCache', 'brandingAndPortal'] }, undefined, {
      declarations: [getFormRoute],
    });
  });
  after(async () => f?.close());
  it('refuses a foreign origin at the unselected Socket.IO owner', async () => {
    const path = '/portal-socket.io/engine.io?EIO=4&transport=polling';
    const refusal = await withoutSideEffects(f, () => wire(f.url + path, 'GET', { Origin: 'https://other.invalid' }));
    expected(refusal, 403, /Access Denied/);
    const control = await withoutSideEffects(f, () => wire(f.url + path, 'GET', { Origin: referenceOrigin }));
    assert.equal(control.status, 501, control.text);
    assertGolden(family, 'unselected-origin', [refusal, control].map(stable));
  });
  it('withholds the unmounted progress handler when no actor was resolved', async () => {
    const result = await wire(f.url + brand + '/asynch', 'GET');
    expected(result, 401, /Authentication required/);
    assert.equal(result.headers['www-authenticate'], undefined);
    assertGolden(family, 'unselected-actor', stable(result));
  });
  it('excludes an absolute target from raw ownership and a wrong method from grant ownership', async () => {
    const origin = new URL(f.url);
    const path = origin.pathname + '/portal-socket.io/engine.io?EIO=4&transport=polling';
    const send = (method: string, target: string) =>
      new Promise<Wire>((resolve, reject) => {
        const request = httpRequest(
          origin.origin,
          { method, path: target, agent: false, headers: { Origin: 'https://other.invalid' } },
          reply => {
            let text = '';
            reply.setEncoding('utf8');
            reply.on('data', chunk => (text += chunk));
            reply.once('end', () => resolve({ status: reply.statusCode!, headers: reply.headers, text }));
            reply.once('error', reject);
          }
        );
        request.once('error', reject);
        request.setTimeout(10000, () => request.destroy(new Error('Wire deadline')));
        request.end();
      });
    const malformed = await withoutSideEffects(f, () => send('GET', 'http://%ZZ@outside.invalid' + path));
    assert.equal(malformed.status, 404, malformed.text);
    assert.equal(malformed.headers['content-security-policy'], "default-src 'none'");
    assert.match(malformed.text, /<pre>Cannot GET resource<\/pre>/);
    assert.doesNotMatch(malformed.text, /outside\.invalid|%ZZ|engine\.io/);
    const owner = await withoutSideEffects(f, () => send('GET', path));
    expected(owner, 403, /Access Denied/);
    const grant = origin.pathname + brand + '/asynch/socket-token';
    const post = await withoutSideEffects(f, () => send('POST', grant));
    assert.equal(post.status, 403, post.text);
    for (const denied of [
      await withoutSideEffects(f, () => send('GET', 'http://outside.invalid' + path)),
      await withoutSideEffects(f, () => send('GET', grant)),
    ]) {
      assert.equal(denied.status, 404, denied.text);
      assert.deepEqual(JSON.parse(denied.text), { error: 'not-found' });
      assert.equal(denied.headers['www-authenticate'], undefined);
      assert.equal(denied.headers['set-cookie'], undefined);
    }
  });
  it('will not mint a CSRF token or session for a foreign origin', async () => {
    const store = f.client.db().collection('referenceSessions');
    const before = await store.find().toArray();
    const result = await withoutSideEffects(f, () =>
      wire(f.url + '/csrfToken', 'GET', { Origin: 'https://other.invalid' })
    );
    expected(result, 403, /Cross-origin request denied/);
    assert.equal(result.headers['set-cookie'], undefined);
    assert.deepEqual(await store.find().toArray(), before);
    assertGolden(family, 'csrf-origin', { wire: stable(result), state: { sessionsUnchanged: true } });
  });
});

describe('Portal and installed fallback selection on the production host', function () {
  this.timeout(120000);
  let f: Fixture;
  let providerFile: string;
  const dispatch = sinon.spy();
  before(async () => {
    f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [
        getFormRoute,
        ...metadataReadRoutes.filter(route => ['getDashboardView', 'getDashboardViewSettings'].includes(route.action)),
      ],
      httpBindings: () => [bindControllerFactory(require(providerFile).reviewFallbackController, dispatch)],
      artifacts: async (_directory, providerDirectory) => {
        providerFile = path.join(providerDirectory, 'index.cjs');
        const contents = await readFile(providerFile, 'utf8');
        await writeFile(
          providerFile,
          `const reviewFallbackController = {name:'ReviewFallbackController', actions:['read','miss'],
            create: dispatch => ({
              read: (request, reply) => { dispatch(request.raw.url); return reply.send({selected:'review-fallback'}); },
              miss: (_request, reply) => reply.callNotFound()
            })};
            exports.reviewFallbackController=reviewFallbackController;
          ` +
            contents.replace(
              'apiVersion:',
              `controllers:[reviewFallbackController],
            routes:[{name:'review-call-not-found', path:'/fallback/known', method:'get',
              controller:'ReviewFallbackController', action:'miss', access:{kind:'public'}}],
            fallbacks:[{name:'fm043-review-fallback', prefix:'/', controller:'ReviewFallbackController',
              action:'read', access:{kind:'public'}}],apiVersion:`
            )
        );
      },
    });
  });
  after(async () => f?.close());

  it('returns the archived 404 for an unknown portal or brand without action dispatch', async () => {
    const lookup = sinon.spy(f.data.reference.forms.get(), 'getFormByName');
    const route = coreRouteName(getFormRoute.method, getFormRoute.path);
    const target = '/api/forms/get?name=dataRecord';
    try {
      for (const [scope, scenario] of [
        ['/default/missing', 'unknown-portal'],
        ['/missing/rdmp', 'unknown-brand'],
      ]) {
        const result = await request(f, scope + target, 'GET', '1.0');
        assert.equal(result.status, 404);
        assertGolden('reference', `${route}:${scenario}`, stable(result));
        sinon.assert.notCalled(lookup);
      }
      const allowed = await request(f, brand + target, 'GET', '1.0');
      assert.equal(allowed.status, 200, allowed.text);
      sinon.assert.calledWith(lookup, 'dataRecord');
    } finally {
      lookup.restore();
    }
  });

  it('rejects malformed and protected fallback targets without dispatching an installed action', async () => {
    const sandbox = sinon.createSandbox();
    dispatch.resetHistory();
    const routesToFallback = sandbox.spy(StaticOwnershipTable.prototype, 'hasFallback');
    const protectedTarget = sandbox.spy(HttpRouteRegistry.prototype, 'protects');
    try {
      const requestUri = new URL(f.url);
      const send = (target: string, method = 'GET') =>
        new Promise<Wire>((resolve, reject) => {
          const outgoing = httpRequest(
            requestUri.origin,
            { path: requestUri.pathname + target + '?name=dataRecord', method, agent: false },
            reply => {
              let text = '';
              reply.setEncoding('utf8');
              reply.on('data', chunk => (text += chunk));
              reply.once('end', () => resolve({ status: reply.statusCode!, headers: reply.headers, text }));
              reply.once('error', reject);
            }
          );
          outgoing.once('error', reject);
          outgoing.setTimeout(10000, () => outgoing.destroy(new Error('Fallback wire deadline')));
          outgoing.end();
        });
      for (const malformed of ['/fallback/%2fprivate', '/fallback//nested', '/fallback/../nested']) {
        routesToFallback.resetHistory();
        protectedTarget.resetHistory();
        const result = await send(malformed);
        assert.equal(result.status, 404, result.text);
        assert.deepEqual(JSON.parse(result.text), { error: 'not-found' });
        assert.equal(result.headers['set-cookie'], undefined);
        assert(routesToFallback.returned(true), 'malformed path must reach the selector');
        sinon.assert.notCalled(protectedTarget); // Rejected before lookup, not because the path is reserved.
        sinon.assert.notCalled(dispatch);
      }
      const methodMiss = await send('/fallback/record', 'HEAD');
      assert.equal(methodMiss.status, 404);
      assert.equal(methodMiss.text, '');
      sinon.assert.notCalled(dispatch);

      for (const protectedPath of ['/js/fm043-missing.js', '/fallback/known']) {
        protectedTarget.resetHistory();
        const reserved = await send(protectedPath);
        assert.equal(reserved.status, 404, reserved.text);
        assert.deepEqual(JSON.parse(reserved.text), { error: 'not-found' });
        if (protectedPath.startsWith('/js/')) assert(protectedTarget.returned(true));
        sinon.assert.notCalled(dispatch);
      }

      const allowed = await send('/fallback/record');
      assert.equal(allowed.status, 200, allowed.text);
      assert.deepEqual(JSON.parse(allowed.text), { selected: 'review-fallback' });
      sinon.assert.calledOnceWithExactly(dispatch, requestUri.pathname + '/fallback/record?name=dataRecord');
    } finally {
      sandbox.restore();
    }
  });

  it('refuses dashboard views with an unregistered fetch mode before rendering settings', async () => {
    const types = f.data.reference.dashboards.get();
    const resolved = types.getDashboardView('referenceView');
    assert(resolved?.steps?.[0]);
    const readView = sinon.stub(types, 'getDashboardView');
    readView.withArgs('referenceView').returns({
      ...resolved,
      steps: resolved.steps.map(step => ({ ...step, fetchMode: 'unregistered' as typeof step.fetchMode })),
    });
    const runtime = sinon.spy(f.data.reference.dashboardConfig.get(), 'getRuntimeSettings');
    try {
      for (const url of ['/dashboard/view/referenceView', '/dashboard/settings/view/referenceView']) {
        const result = await request(f, brand + url, 'GET', '1.0');
        assert.equal(result.status, 404, result.text);
        assert.deepEqual(JSON.parse(result.text), { message: 'Dashboard view provided is not valid', details: '' });
        sinon.assert.notCalled(runtime);
      }
      assert.equal(readView.callCount, 2);
      readView.withArgs('referenceView').returns(resolved);
      for (const url of ['/dashboard/view/referenceView', '/dashboard/settings/view/referenceView']) {
        const allowed = await request(f, brand + url, 'GET', '1.0');
        assert.equal(allowed.status, 200, allowed.text);
      }
    } finally {
      readView.restore();
      runtime.restore();
    }
  });

  it('rejects malformed route captures before form or fallback dispatch', async () => {
    const lookup = sinon.spy(f.data.reference.forms.get(), 'getFormByName');
    dispatch.resetHistory();
    try {
      for (const method of ['GET', 'POST', 'OPTIONS']) {
        const send = () => request(f, '/%ZZ/rdmp/api/forms/get?name=dataRecord', method, '1.0');
        const result = method === 'POST' ? await withoutSideEffects(f, send) : await send();
        assert.equal(result.status, 400, result.text);
        assert.deepEqual(JSON.parse(result.text), { message: 'Invalid request', details: '' });
        sinon.assert.notCalled(lookup);
        sinon.assert.notCalled(dispatch);
      }
    } finally {
      lookup.restore();
    }
  });
});

describe('Static asset selection on the production host', function () {
  this.timeout(120000);
  it('does not serve an installed asset outside its mount or on POST', async () => {
    const marker = '/* round-six asset selection control */';
    const f = await referenceProductionFixture(true, undefined, undefined, {
      declarations: [getFormRoute],
      pages: {},
      artifacts: async directory => {
        const js = path.join(directory, 'assets', 'js');
        await mkdir(js, { recursive: true });
        await writeFile(path.join(js, 'review-control.js'), marker);
      },
    });
    try {
      const target = '/js/review-control.js';
      const allowed = await wire(f.url + target, 'GET');
      assert.equal(allowed.status, 200, allowed.text);
      assert.equal(allowed.text, marker);
      const origin = new URL(f.url).origin;
      for (const result of [
        await wire(origin + target, 'GET'),
        await wire(origin + '/bogusx' + target, 'GET'),
        await withoutSideEffects(f, () => wire(f.url + target, 'POST')),
      ]) {
        assert.equal(result.status, 404, result.text);
        assert(!result.text.includes(marker));
        assert.equal(result.headers.etag, undefined);
      }
    } finally {
      await f.close();
    }
  });
});

describe('Reduced production policy denials', function () {
  this.timeout(120000);
  for (const actor of ['none', 'foreign'] as const)
    describe(actor + ' actor', function () {
      let f: Fixture;
      let authenticated: Awaited<ReturnType<typeof session>>;
      before(async () => {
        f = await referenceProductionFixture(
          true,
          { '*': ['noCache', 'brandingAndPortal', ...(actor === 'foreign' ? ['browserActor'] : [])] },
          undefined,
          {
            declarations: [self, deleteRecordRoute],
            configuration: {
              auth: { roles: [{ name: 'Admin' }, { name: 'Researcher' }, { name: 'Guest' }], rules: [] },
            },
          }
        );
        authenticated = await session(f);
      });
      after(async () => f?.close());
      for (const version of v)
        for (const [kind, method, path, body] of [
          ['self-service', 'POST', '/user/update', { details: { name: 'Do not update' } }],
          ['record mutation', 'DELETE', '/api/records/metadata/reference-record', undefined],
        ] as const)
          it(`refuses ${kind} with no earlier actor/brand policy denial in API ${version}`, async () => {
            const result = await withoutSideEffects(f, () =>
              request(
                f,
                brand + path,
                method,
                version,
                {
                  ...authenticated,
                  Origin: referenceOrigin,
                  Authorization: actor === 'foreign' ? 'Bearer foreign-token' : 'Bearer pilot-api-token',
                },
                body
              )
            );
            expected(
              result,
              actor === 'none' ? 401 : 403,
              actor === 'none' ? /Authentication required/ : /Access Denied/
            );
            assert.equal(result.headers['www-authenticate'], undefined);
            assertGolden(family, `${kind}/${actor}/${version}`, { wire: stable(result), state: { unchanged: true } });
            if (actor === 'foreign' && kind === 'self-service') {
              // A resolved foreign actor has no roles in this request brand.
              // The eligible actor proves the role predicate also admits a
              // nonempty same-brand role list in the same reduced policy.
              const name = 'Eligible self-service control ' + version;
              const allowed = await request(
                f,
                brand + path,
                method,
                version,
                {
                  ...authenticated,
                  ...bearer,
                },
                { details: { name } }
              );
              assert.equal(allowed.status, 200, allowed.text);
              const account = await f.client.db().collection('user').findOne({ username: 'pilot-admin' });
              assert.equal(account?.name, name);
            }
          });
    });

  const vocabulary = formVocabularyRoutes.find(route => route.action === 'get')!;
  for (const [name, policies, status] of [
    ['guest JSON path policy', ['noCache', 'brandingAndPortal', 'checkAuth'], 403],
    ['browser session required', ['noCache', 'brandingAndPortal', 'browserAuthenticated'], 302],
    ['false policy', false, 403],
  ] as const)
    it('applies the ' + name, async () => {
      const selected = policies === false ? false : [...policies];
      const f = await referenceProductionFixture(true, { '*': selected }, undefined, { declarations: [vocabulary] });
      try {
        const result = await wire(
          f.url + brand + '/vocab/not-dispatched',
          'GET',
          name === 'guest JSON path policy' ? { 'Content-Type': 'application/json' } : {}
        );
        assert.equal(result.status, status, result.text);
        if (name === 'guest JSON path policy') assert.deepEqual(JSON.parse(result.text), { message: 'Access Denied' });
        if (name === 'guest JSON path policy') {
          const html = await wire(f.url + brand + '/vocab/not-dispatched', 'GET', { Accept: 'text/html' });
          assert.equal(html.status, 302, html.text);
          assert.equal(html.headers.location, '/portal/default/rdmp/user/login');
        }
        if (name === 'browser session required')
          assert.equal(result.headers.location, '/portal/default/rdmp/user/login');
        if (name === 'false policy') assert.equal(result.text, '');
        assertGolden(family, name, stable(result));
      } finally {
        await f.close();
      }
    });
});

describe('Late action actor rechecks on the production host', function () {
  this.timeout(120000);
  for (const [name, declaration, target, body, controlStatus] of [
    ['Figshare sources', listFigshareSourcesRoute, '/api/figshare-vocabularies/sources', undefined, 200],
    ['vocabulary list', listVocabularyRoute, '/api/vocabulary', undefined, 200],
    ['RVA import', importVocabularyRoute, '/api/vocabulary/import', { rvaId: ' ' }, 400],
  ] as const)
    it(`refuses ${name} when the actor is cleared after host admission`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [declaration],
        hooksModule: require.resolve('./authorizationActionHook'),
      });
      try {
        const clears = actorClearsAfterAdmission.count;
        const send = (headers: Record<string, string>) =>
          request(f, brand + target, declaration.method.toUpperCase(), '2.0', headers, body);
        const denied = await withoutSideEffects(f, () => send({ ...bearer, 'x-fm043-action-actor': 'clear' }), {
          collections: ['vocabulary', 'vocabularyentry'],
        });
        assert.equal(actorClearsAfterAdmission.count, clears + 1);
        assert.equal(denied.status, 401, denied.text);
        assert.equal(denied.headers['www-authenticate'], undefined);
        assert.deepEqual(JSON.parse(denied.text), { errors: [{ detail: 'Authentication required' }], meta: {} });
        const allowed =
          controlStatus >= 400
            ? await withoutSideEffects(f, () => send(bearer), { collections: ['vocabulary', 'vocabularyentry'] })
            : await send(bearer);
        assert.equal(allowed.status, controlStatus, allowed.text);
        if (name === 'RVA import')
          assert.deepEqual(JSON.parse(allowed.text), {
            errors: [{ detail: 'Invalid RVA vocabulary or version id' }],
            meta: {},
          });
      } finally {
        await f.close();
      }
    });
  for (const version of v)
    it(`refuses a branding draft when the actor is cleared after host admission in API ${version}`, async () => {
      const f = await referenceProductionFixture(true, undefined, undefined, {
        declarations: [brandingDraftRoute],
        hooksModule: require.resolve('./authorizationActionHook'),
      });
      const branding = f.data.reference.branding.get();
      const save = sinon.spy(branding, 'saveDraft');
      try {
        const before = await branding.getAdminState('default');
        const clears = actorClearsAfterAdmission.count;
        const draft = { expectedDraftRevision: before.draft.revision, variables: {} };
        const target = brand + '/api/branding/draft';
        const denied = await withoutSideEffects(
          f,
          () =>
            request(
              f,
              target,
              'POST',
              version,
              {
                ...bearer,
                'x-fm043-action-actor': 'clear',
              },
              draft
            ),
          { collections: ['branding', 'brandingconfig'] }
        );
        assert.equal(actorClearsAfterAdmission.count, clears + 1);
        assert.equal(denied.status, 401, denied.text);
        assert.equal(denied.headers['www-authenticate'], undefined);
        assert.equal(denied.headers.etag, undefined);
        assert.match(String(denied.headers['content-type']), /^application\/json/);
        assert.deepEqual(
          JSON.parse(denied.text),
          version === '2.0'
            ? {
                errors: [{ detail: 'Authentication required' }],
                meta: {},
              }
            : { message: 'Authentication required', details: '' }
        );
        sinon.assert.notCalled(save);
        assert.deepEqual(await branding.getAdminState('default'), before);
        const allowed = await request(f, target, 'POST', version, bearer, draft);
        assert.equal(allowed.status, 200, allowed.text);
        sinon.assert.calledOnce(save);
        assert.equal((await branding.getAdminState('default')).draft.revision, before.draft.revision + 1);
      } finally {
        save.restore();
        await f.close();
      }
    });
});

describe('Production denial effect observer', function () {
  this.timeout(120000);
  for (const transport of ['node:http', 'node:https', 'fetch'] as const)
    it(
      transport === 'fetch'
        ? 'detects Undici fetch to another listener'
        : `detects ${transport} to another listener with a Host override`,
      async () => {
        let host: string | undefined;
        const handler = (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => {
          host = req.headers.host;
          res.end('destination reached');
        };
        let server: ReturnType<typeof createServer> | ReturnType<typeof createHttpsServer> | undefined;
        let directory: string | undefined;
        const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [getFormRoute] });
        try {
          if (transport === 'node:https') {
            directory = await mkdtemp(path.join(tmpdir(), 'fm043-observer-'));
            const key = path.join(directory, 'key.pem');
            const cert = path.join(directory, 'cert.pem');
            execFileSync(
              'openssl',
              [
                'req',
                '-x509',
                '-newkey',
                'rsa:2048',
                '-nodes',
                '-days',
                '1',
                '-subj',
                '/CN=fixture-provider.invalid',
                '-keyout',
                key,
                '-out',
                cert,
              ],
              { stdio: 'ignore', timeout: 10000 }
            );
            server = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, handler);
          } else server = createServer(handler);
          const listener = server;
          await new Promise<void>((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
          const address = listener.address();
          assert(address && typeof address === 'object');
          const effects = await observeNoSideEffects(f);
          try {
            const headers = { Host: new URL(f.url).host };
            const origin = `${transport === 'node:https' ? 'https' : 'http'}://127.0.0.1:${address.port}`;
            if (transport === 'fetch') {
              assert.equal(await (await fetch(origin)).text(), 'destination reached');
            } else if (transport === 'node:http') {
              assert.equal((await wire(origin, 'GET', headers)).text, 'destination reached');
            } else {
              const text = await new Promise<string>((resolve, reject) => {
                httpsGet(origin, { headers, rejectUnauthorized: false }, res => {
                  let content = '';
                  res.setEncoding('utf8').on('data', part => {
                    content += part;
                  });
                  res.once('end', () => resolve(content));
                  res.once('error', reject);
                }).once('error', reject);
              });
              assert.equal(text, 'destination reached');
            }
            assert.equal(host, transport === 'fetch' ? new URL(origin).host : headers.Host);
            assert.deepEqual(await effects.differences(), ['outbound HTTP']);
          } finally {
            effects.restore();
          }
        } finally {
          const listener = server;
          if (listener) await new Promise<void>(resolve => listener.close(() => resolve()));
          await f.close();
          if (directory) await rm(directory, { recursive: true, force: true });
        }
      }
    );

  it('detects attachment finalization and storage writes from a successful multipart upload', async () => {
    const route = uploadDeclarations.find(route => route.action === 'addDataStreams')!;
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [route] });
    try {
      await seedMutationState(f, await session(f));
      const effects = await observeNoSideEffects(f);
      try {
        const result = await wire(
          f.url + brand + '/api/records/datastreams/reference-record',
          'POST',
          { ...bearer, 'Content-Type': 'multipart/form-data; boundary=observer-control' },
          '--observer-control\r\nContent-Disposition: form-data; name="attachmentFields"; filename="control.txt"\r\n' +
            'Content-Type: text/plain\r\n\r\nattachment control\r\n--observer-control--\r\n'
        );
        assert.equal(result.status, 200, result.text);
        const found = await effects.differences();
        assert(found.includes('attachments:addDatastreams'), found.join(', '));
        assert(found.includes('storage:updateMeta'), found.join(', '));
      } finally {
        effects.restore();
      }
    } finally {
      await f.close();
    }
  });

  it('detects profile, audit, record, queue, Solr, storage, staging, outbound and session effects', async () => {
    const f = await referenceProductionFixture(true, undefined, undefined, { declarations: [self, deleteRecordRoute] });
    const outbound = createServer((_req, res) => res.end('observer control'));
    try {
      await new Promise<void>((resolve, reject) => outbound.once('error', reject).listen(0, '127.0.0.1', resolve));
      const address = outbound.address();
      assert(address && typeof address === 'object');
      const login = await session(f);
      await seedMutationState(f, login);
      const effects = await observeNoSideEffects(f);
      try {
        const profile = await request(
          f,
          brand + '/user/update',
          'POST',
          '1.0',
          { ...login, Origin: referenceOrigin },
          {
            details: { name: 'Observer profile control' },
          }
        );
        assert.equal(profile.status, 200, profile.text);
        const deletion = await request(f, brand + '/api/records/metadata/reference-record', 'DELETE', '1.0');
        assert.equal(deletion.status, 200, deletion.text);
        await f.data.disks.get().stagingDisk().put('observer-control', 'data');
        assert.equal((await wire(f.url + '/csrfToken', 'GET')).status, 200);
        assert.equal(await (await fetch(`http://127.0.0.1:${address.port}/`)).text(), 'observer control');
        const found = await effects.differences();
        for (const name of [
          'profile:updateUserDetails',
          'audit:addUserAuditEvent',
          'record:delete',
          'queue:now',
          'index:remove',
          'solr:solrDelete',
          'staging:put',
          'staging contents',
          'outbound HTTP',
          'session',
          'mongo:record',
          'mongo:useraudit',
        ])
          assert(found.includes(name), `Missing effect ${name}: ${found.join(', ')}`);
        assert(
          found.some(name => name.startsWith('storage:')),
          'record deletion must reach storage'
        );
        await assert.rejects(() => effects.assertNone(), /Prohibited side effects after draining/);
      } finally {
        effects.restore();
      }
    } finally {
      await new Promise<void>(resolve => outbound.close(() => resolve()));
      await f.close();
    }
  });
});

goldenControls(family);
