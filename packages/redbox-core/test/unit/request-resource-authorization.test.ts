import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  asScopeKey,
  freezeAuthorizationContext,
  requireRequestBrandId,
  requireRequestResourceAuthorization,
} from '../../src';
import { resetResolvedApiRouteCache } from '../../src/api-routes';

function context(authorized = true) {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: { category: 'authenticated', authMethod: 'session', active: true, userId: 'user-1' },
    brand: {
      requestedIdentifier: 'brand-a',
      id: 'brand-a-id',
      name: 'brand-a',
      exists: true,
      authorized,
    },
    grantedScopeKeys: [asScopeKey('record.read')],
    effectiveScopeKeys: [asScopeKey('record.read')],
  });
}

function request() {
  return {
    method: 'GET',
    path: '/brand-a/rdmp/api/records/record-1',
    params: { branding: 'brand-a', portal: 'rdmp', oid: 'record-1' },
    query: { branding: 'brand-b' },
    body: { branding: 'brand-b' },
    headers: {},
    authorization: context(),
    options: {
      routeId: 'record-get',
      controller: 'webservice/RecordController',
      action: 'getMeta',
      authorization: { kind: 'scope', scope: asScopeKey('record.read') },
    },
  } as unknown as Sails.Req;
}

describe('request resource authorization extraction', () => {
  it('memoizes the server-resolved context and scoped route without consulting payload branding', () => {
    const req = request();
    const first = requireRequestResourceAuthorization(req);
    req.body = { branding: 'brand-c' };
    req.query = { branding: 'brand-c' };
    const second = requireRequestResourceAuthorization(req);

    assert.equal(first, second);
    assert.equal(first.context.brand?.id, 'brand-a-id');
    assert.equal(first.requiredScope, 'record.read');
    assert.equal(first.routeId, 'record-get');
    assert.equal(requireRequestBrandId(req), 'brand-a-id');
  });

  it('fails closed when a resource action is not backed by a scoped route or authorized brand', () => {
    const publicReq = request();
    publicReq.options!.authorization = { kind: 'public', reason: 'test' };
    assert.throws(
      () => requireRequestResourceAuthorization(publicReq),
      /requires an explicit scoped route declaration/
    );

    const unauthorizedBrandReq = request();
    unauthorizedBrandReq.authorization = context(false);
    assert.throws(() => requireRequestBrandId(unauthorizedBrandReq), /authorized brand context/);
  });

  it('treats explicit runtime target authorization as authoritative over the central contract map', () => {
    const req = request();
    req.path = '/brand-a/rdmp/api/records/metadata/record-1';
    req.options!.authorization = { kind: 'scope', scope: asScopeKey('record.update') };
    req.options!.routeId = 'explicit-record-update';

    const authorization = requireRequestResourceAuthorization(req);

    assert.equal(authorization.requiredScope, 'record.update');
    assert.equal(authorization.routeId, 'explicit-record-update');
  });

  it('falls back to the central contract map when framework route metadata is absent', () => {
    resetResolvedApiRouteCache();
    const req = request();
    req.path = '/brand-a/rdmp/api/records/metadata/record-1';
    req.route = 'get /:branding/:portal/api/records/metadata/:oid';
    req.options = {};

    const authorization = requireRequestResourceAuthorization(req);

    assert.equal(authorization.requiredScope, 'record.read');
    assert.match(authorization.routeId, /RecordController#getMeta/u);
    resetResolvedApiRouteCache();
  });

  it('fails closed when neither an explicit target nor a central/configured route resolves', () => {
    resetResolvedApiRouteCache();
    const req = request();
    req.path = '/__authorization_unmapped_resource__';
    req.route = undefined;
    req.options = {};

    assert.throws(() => requireRequestResourceAuthorization(req), /requires an explicit scoped route declaration/u);
    resetResolvedApiRouteCache();
  });
});
