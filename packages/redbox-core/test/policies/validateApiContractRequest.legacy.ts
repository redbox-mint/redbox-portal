// Explicit retained Express adapter cases; removed by FM-043.
import assert from 'node:assert/strict';
import { inspect } from 'node:util';
import { registerCoreApiRoutes, validateApiRouteRequest, type ApiRequestInput } from '../../src/api-routes';
import { mountRecordSchemaReadRoutes } from '../../src/http/express/recordSchemaReads';
import { mountRecordMutationRoutes, type RecordMutationHttpInput } from '../../src/http/express/recordMutations';
import { httpAction } from '../../src/http/express/middleware';
import { httpRouteFixture } from '../helpers/httpRouteFixture';

const routes = registerCoreApiRoutes();
function validate(path: string, input: ApiRequestInput = {}) {
  const req = {
    method: 'GET',
    path,
    params: { branding: 'default', portal: 'portal' },
    query: {},
    headers: {},
    ...input,
  };
  const route = routes.find(route => route.path === path && route.method === req.method.toLowerCase());
  assert(route, `Missing test route ${path}`);
  return { route, result: validateApiRouteRequest(req, route) };
}

describe('API contracts without an ambient validation policy', () => {
  
  
  
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
  
  
  
  it('leaves unregistered routes unresolved for the HTTP router to return 404', async () => {
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
          const route = routes.find(route => route.path === '/:branding/:portal/api/records/schemas/update/:oid')!;
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
});
