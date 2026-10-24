import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import {
  createApiRouteResolver,
  registerCoreApiRoutes,
  validateApiRouteRequest,
  type ApiRequestInput,
} from '../../src/api-routes';
import { mountRecordSchemaReadRoutes } from '../../src/http/express/recordSchemaReads';
import { mountRecordMutationRoutes, type RecordMutationHttpInput } from '../../src/http/express/recordMutations';
import { httpAction } from '../../src/http/express/middleware';
import { httpRouteFixture } from '../helpers/httpRouteFixture';

const resolve = createApiRouteResolver(registerCoreApiRoutes());
function validate(path: string, input: ApiRequestInput = {}) {
  const req = {
    method: 'GET',
    path,
    params: { branding: 'default', portal: 'portal' },
    query: {},
    headers: {},
    ...input,
  };
  const route = resolve(req);
  assert(route, `Missing test route ${path}`);
  return { route, result: validateApiRouteRequest(req, route) };
}

describe('API contracts without an ambient validation policy', () => {
  it('returns the resolved route and normalized request on success', () => {
    const { route, result } = validate('/default/portal/api/admin/config');
    assert.equal(route.path, '/:branding/:portal/api/admin/config');
    assert.equal(result.valid, true);
    if (!result.valid) throw new Error('Unexpected invalid request');
    assert.deepEqual(result.params, { branding: 'default', portal: 'portal' });
    assert.deepEqual(result.query, {});
  });
  it('rejects invalid params before dispatch', () => {
    const { result } = validate('/default/portal/api/admin/config/theme');
    assert.equal(result.valid, false);
    if (result.valid) throw new Error('Missing configKey accepted');
    assert(result.issues.some(issue => issue.path === 'params.configKey'));
  });
  it('rejects an absent required query', () => {
    const { result } = validate('/default/portal/api/recordtypes/get');
    assert.equal(result.valid, false);
    if (result.valid) throw new Error('Missing query accepted');
    assert(result.issues.some(issue => issue.path === 'query.name'));
  });
  it('returns sanitized operation failures over actual HTTP in both API versions', async () => {
    const f = await httpRouteFixture((router, input) =>
      mountRecordMutationRoutes(router, {
        ...input,
        records: {},
        recordTypes: {},
        workflows: {},
        forms: {},
        contextVariables: {},
        schemaEnabled: true,
      } as RecordMutationHttpInput)
    );
    try {
      for (const version of ['1.0', '2.0']) {
        const response = await f.request(
          '/default/portal/api/records/metadata/dataset?operation=malformed%20operation%20secret',
          {
            method: 'POST',
            headers: { 'x-redbox-api-version': version },
            body: {},
          }
        );
        assert.equal(response.status, 400);
        assert.match(response.text, /record-validation-operation-invalid/);
        assert(!response.text.includes('malformed operation secret'));
      }
    } finally {
      await f.close();
    }
  });
  for (const [name, path, headers] of [
    ['digest', '/default/portal/api/records/schemas/' + 'A'.repeat(64), {}],
    ['operation', '/default/portal/api/records/schemas/create/dataset?operation=malformed%20operation', {}],
    [
      'If-None-Match',
      '/default/portal/api/records/schemas/update/record-1',
      { 'if-none-match': `W/"sha256:${'a'.repeat(64)}"` },
    ],
  ] as const) {
    it(`returns raw 400 Problem Details for malformed schema ${name} in both API versions`, async () => {
      const f = await httpRouteFixture((router, input) =>
        mountRecordSchemaReadRoutes(router, {
          ...input,
          schemas: {
            resolveCreate: async () => {
              throw new Error('Invalid requests must not dispatch');
            },
            resolveUpdate: async () => {
              throw new Error('Invalid requests must not dispatch');
            },
            resolveImmutable: async () => {
              throw new Error('Invalid requests must not dispatch');
            },
          },
        })
      );
      try {
        for (const version of ['1.0', '2.0']) {
          const response = await f.request(path, { headers: { ...headers, 'x-redbox-api-version': version } });
          assert.equal(response.status, 400);
          assert.match(response.headers.get('content-type')!, /^application\/problem\+json/);
          assert.equal(response.headers.get('cache-control'), 'private, no-cache');
          assert.equal(response.headers.get('vary'), 'Authorization');
          assert.deepEqual(response.body, {
            type: 'https://redboxresearchdata.com/problems/record-schema-invalid-request',
            title: 'Record schema request is invalid',
            status: 400,
            detail: 'The record schema request is malformed.',
            instance: path.split('?')[0],
            code: 'record-schema.invalid-request',
          });
        }
      } finally {
        await f.close();
      }
    });
  }
  it('rejects repeated If-Match on update and transition contracts in both API versions', () => {
    const etag = `"sha256:${'a'.repeat(64)}"`;
    for (const version of ['1.0', '2.0'])
      for (const transition of [false, true]) {
        const path = transition
          ? '/default/portal/api/records/workflow/step/published/record-1'
          : '/default/portal/api/records/metadata/record-1';
        const { result } = validate(path, {
          method: transition ? 'POST' : 'PUT',
          params: {
            branding: 'default',
            portal: 'portal',
            oid: 'record-1',
            ...(transition ? { targetStep: 'published' } : {}),
          },
          headers: { 'x-redbox-api-version': version, 'if-match': [etag, etag] },
          body: {},
        });
        assert.equal(result.valid, false);
        assert.match(JSON.stringify(result), /If-Match/);
      }
  });
  it('rejects a missing required body', () => {
    const { result } = validate('/default/portal/api/admin/config/theme', {
      method: 'POST',
      params: { branding: 'default', portal: 'portal', configKey: 'theme' },
    });
    assert.equal(result.valid, false);
    assert.match(JSON.stringify(result), /Body is required/);
  });
  it('rejects pre-parsed files with an unsupported MIME type', () => {
    const { result } = validate('/default/portal/api/branding/logo', {
      method: 'POST',
      files: { logo: [{ type: 'image/gif', size: 1024 }] },
    });
    assert.equal(result.valid, false);
    assert.match(JSON.stringify(result), /Unsupported mime type/);
  });
  it('leaves unregistered routes unresolved for the HTTP router to return 404', async () => {
    assert.equal(resolve({ method: 'GET', path: '/default/portal/api/does-not-exist' }), undefined);
    const f = await httpRouteFixture(() => {});
    try {
      assert.equal((await f.request('/default/portal/api/does-not-exist')).status, 404);
    } finally {
      await f.close();
    }
  });
  it('does not emit request identifiers or digests in logs for unregistered routes', async () => {
    const f = await httpRouteFixture(() => {});
    try {
      const response = await f.request('/default/portal/api/not-registered/private-record-oid/' + 'a'.repeat(64));
      assert.equal(response.status, 404);
      assert.equal(f.log.error.called, false);
    } finally {
      await f.close();
    }
  });
  it('sanitizes unexpected validation failures at the actual HTTP error boundary', async () => {
    const privateOid = 'private-record-oid';
    const digest = 'b'.repeat(64);
    const secret = 'private-validation-error';
    const f = await httpRouteFixture(router => {
      router.get(
        '/:branding/:portal/api/records/schemas/update/:oid',
        httpAction(async (req, res) => {
          const route = resolve(req)!;
          Object.defineProperty(req, 'params', {
            configurable: true,
            get: () => {
              throw new Error(secret);
            },
            set: value => Object.defineProperty(req, 'params', { configurable: true, writable: true, value }),
          });
          res.json(validateApiRouteRequest(req, route));
        })
      );
    });
    try {
      const response = await f.request(`/default/portal/api/records/schemas/update/${privateOid}?digest=${digest}`);
      assert.equal(response.status, 500);
      assert.equal(response.body.message, 'Internal server error');
      const output =
        response.text +
        inspect(['error', 'warn', 'info'].flatMap(level => f.log[level].getCalls().map(call => call.args)));
      for (const privateValue of [privateOid, digest, secret]) assert(!output.includes(privateValue));
    } finally {
      await f.close();
    }
  });
  it('distinguishes collection and keyed admin configuration routes', () => {
    const list = resolve({ method: 'GET', path: '/default/portal/api/admin/config' })!;
    const keyed = resolve({ method: 'GET', path: '/default/portal/api/admin/config/theme' })!;
    assert.equal(list.path, '/:branding/:portal/api/admin/config');
    assert.equal(keyed.path, '/:branding/:portal/api/admin/config/:configKey');
    assert.equal(list.action, 'getAppConfig');
    assert.equal(keyed.action, 'getAppConfig');
  });
});
