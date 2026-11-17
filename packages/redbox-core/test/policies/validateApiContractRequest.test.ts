import assert from 'node:assert/strict';
import sinon from 'sinon';


import path from 'node:path';
import { registerCoreApiRoutes, validateApiRouteRequest, type ApiRequestInput } from '../../src/api-routes';
let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
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
describe('API contracts without an ambient validation policy', function () {

it('returns the resolved route and normalized request on success', () => {
    const { route, result } = validate('/:branding/:portal/api/admin/config');
    assert.equal(route.path, '/:branding/:portal/api/admin/config');
    assert.equal(result.valid, true);
    if (!result.valid) throw new Error('Unexpected invalid request');
    assert.deepEqual(result.params, { branding: 'default', portal: 'portal' });
    assert.deepEqual(result.query, {});
  });
it('rejects invalid params before dispatch', () => {
    const { result } = validate('/:branding/:portal/api/admin/config/:configKey');
    assert.equal(result.valid, false);
    if (result.valid) throw new Error('Missing configKey accepted');
    assert(result.issues.some(issue => issue.path === 'params.configKey'));
  });
it('rejects an absent required query', () => {
    const { result } = validate('/:branding/:portal/api/recordtypes/get');
    assert.equal(result.valid, false);
    if (result.valid) throw new Error('Missing query accepted');
    assert(result.issues.some(issue => issue.path === 'query.name'));
  });
it('rejects repeated If-Match on update and transition contracts in both API versions', () => {
    const etag = `"sha256:${'a'.repeat(64)}"`;
    for (const version of ['1.0', '2.0'])
      for (const transition of [false, true]) {
        const path = transition
          ? '/:branding/:portal/api/records/workflow/step/:targetStep/:oid'
          : '/:branding/:portal/api/records/metadata/:oid';
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
    const { result } = validate('/:branding/:portal/api/admin/config/:configKey', {
      method: 'POST',
      params: { branding: 'default', portal: 'portal', configKey: 'theme' },
    });
    assert.equal(result.valid, false);
    assert.match(JSON.stringify(result), /Body is required/);
  });
it('rejects pre-parsed files with an unsupported MIME type', () => {
    const { result } = validate('/:branding/:portal/api/branding/logo', {
      method: 'POST',
      files: { logo: [{ type: 'image/gif', size: 1024 }] },
    });
    assert.equal(result.valid, false);
    assert.match(JSON.stringify(result), /Unsupported mime type/);
  });
afterEach(() => sinon.restore());
});
