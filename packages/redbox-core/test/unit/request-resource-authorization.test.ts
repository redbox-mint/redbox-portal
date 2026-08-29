import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import {
  asScopeKey,
  freezeAuthorizationContext,
  requireRequestBrandId,
  requireRequestResourceAuthorization,
} from '../../src';

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
});
