import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import { of } from 'rxjs';
import * as sinon from 'sinon';
import {
  allowedResource,
  asScopeKey,
  deniedResource,
  freezeAuthorizationContext,
  type AuthorizationDecision,
} from '../../src/authorization';
import { Controllers } from '../../src/controllers/AsynchController';

const BRAND = { id: 'brand-a', name: 'Brand A' };
const SCOPE = asScopeKey('record.read');

function decision(allowed: boolean, reasonCode: AuthorizationDecision['reasonCode']): AuthorizationDecision {
  return { allowed, reasonCode, requiredScope: SCOPE, brandId: BRAND.id };
}

function context(options: { active?: boolean; scopes?: readonly (typeof SCOPE)[] } = {}) {
  const scopes = options.scopes ?? [SCOPE];
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: options.active ?? true,
      userId: 'user-1',
      username: 'user-one',
    },
    brand: { ...BRAND, exists: true, authorized: true },
    grantedScopeKeys: scopes,
    effectiveScopeKeys: scopes,
  });
}

function request() {
  const attachedContext = context();
  return {
    method: 'GET',
    path: '/brand-a/rdmp/asynch/subscribe',
    params: { branding: BRAND.name, portal: 'rdmp', roomId: 'record-1' },
    query: {},
    body: {},
    headers: {},
    isSocket: true,
    user: { id: 'user-1', username: 'user-one', roles: [] },
    authorization: attachedContext,
    options: {
      routeId: 'asynch-subscribe',
      authorization: { kind: 'scope', scope: SCOPE },
      controller: 'AsynchController',
      action: 'subscribe',
    },
    param(name: string) {
      return this.params[name];
    },
  } as unknown as Sails.Req;
}

function response() {
  const res: Record<string, sinon.SinonStub> = {};
  res.badRequest = sinon.stub().returns(res);
  res.status = sinon.stub().returns(res);
  res.type = sinon.stub().returns(res);
  res.json = sinon.stub().returns(res);
  return res as unknown as Sails.Res;
}

function authorizeCurrentBrand(current: ReturnType<typeof context>) {
  if (!current.principal.active) return decision(false, 'principal-inactive');
  return current.effectiveScopeKeys.includes(SCOPE) ? decision(true, 'allowed') : decision(false, 'scope-missing');
}

describe('AsynchController privileged socket events', () => {
  it('revalidates every privileged event before reading payloads or asynchronous state', async () => {
    const resolveUserContext = sinon.stub().resolves(context({ active: false, scopes: [] }));
    const authorizeBrandEntity = sinon.stub().callsFake(authorizeCurrentBrand);
    const asynchronousState = {
      start: sinon.stub(),
      get: sinon.stub(),
      finish: sinon.stub(),
      update: sinon.stub(),
    };
    const previousSails = globalThis.sails;
    const previousAsynchsService = Reflect.get(globalThis, 'AsynchsService');
    try {
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        services: {
          ...(previousSails?.services ?? {}),
          recordsservice: {
            getAuthorizedMeta: sinon.stub(),
            authorizeRecordCollection: sinon.stub(),
          },
          authorizationservice: { resolveUserContext, authorizeBrandEntity },
        },
        sockets: { join: sinon.stub(), leave: sinon.stub(), broadcast: sinon.stub() },
      };
      Reflect.set(globalThis, 'AsynchsService', asynchronousState);

      const controller = new Controllers.Asynch();
      const res = response();
      const handlers = [
        controller.start.bind(controller),
        controller.stop.bind(controller),
        controller.update.bind(controller),
        controller.progress.bind(controller),
        controller.subscribe.bind(controller),
      ];

      for (const handler of handlers) await handler(request(), res);

      assert.equal(resolveUserContext.callCount, handlers.length);
      assert.equal(authorizeBrandEntity.callCount, handlers.length);
      assert.equal((res.status as unknown as sinon.SinonStub).callCount, handlers.length);
      assert.equal(
        (res.status as unknown as sinon.SinonStub).getCalls().every(call => call.calledWithExactly(401)),
        true
      );
      assert.equal(asynchronousState.start.called, false);
      assert.equal(asynchronousState.get.called, false);
      assert.equal(asynchronousState.finish.called, false);
      assert.equal(asynchronousState.update.called, false);
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      if (previousAsynchsService === undefined) Reflect.deleteProperty(globalThis, 'AsynchsService');
      else Reflect.set(globalThis, 'AsynchsService', previousAsynchsService);
      sinon.restore();
    }
  });

  it('re-resolves assignments on every event and denies the first event after scope revocation', async () => {
    const getAuthorizedMeta = sinon.stub().resolves(
      allowedResource(decision(true, 'allowed'), {
        redboxOid: 'record-1',
        metaMetadata: { brandId: BRAND.id },
      })
    );
    const authorizeRecordCollection = sinon.stub().returns(allowedResource(decision(true, 'allowed'), BRAND));
    const resolveUserContext = sinon.stub();
    resolveUserContext.onFirstCall().resolves(context());
    resolveUserContext.onSecondCall().resolves(context({ scopes: [] }));
    const authorizeBrandEntity = sinon.stub().callsFake(authorizeCurrentBrand);
    const join = sinon.stub().callsFake((_req, _room, callback) => callback());
    const previousSails = globalThis.sails;
    const previousBrandingService = Reflect.get(globalThis, 'BrandingService');
    const previousAsynchsService = Reflect.get(globalThis, 'AsynchsService');
    try {
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        services: {
          ...(previousSails?.services ?? {}),
          recordsservice: { getAuthorizedMeta, authorizeRecordCollection },
          authorizationservice: { resolveUserContext, authorizeBrandEntity },
        },
        sockets: { join, leave: sinon.stub(), broadcast: sinon.stub() },
      };
      Reflect.set(globalThis, 'BrandingService', { getBrandFromReq: sinon.stub().returns(BRAND) });
      const progressLookup = sinon.stub().returns(of([]));
      Reflect.set(globalThis, 'AsynchsService', { get: progressLookup });

      const controller = new Controllers.Asynch();
      const sendResp = sinon.stub(controller as unknown as { sendResp: (...args: unknown[]) => unknown }, 'sendResp');
      const res = response();

      await controller.subscribe(request(), res);
      await controller.subscribe(request(), res);

      assert.equal(resolveUserContext.callCount, 2);
      assert.deepEqual(resolveUserContext.firstCall.args, ['user-1', BRAND.id, 'session', undefined]);
      assert.equal(authorizeBrandEntity.callCount, 2);
      assert.equal(getAuthorizedMeta.callCount, 1, 'revoked action scope must fail before record lookup');
      assert.equal(authorizeRecordCollection.callCount, 1);
      assert.equal(join.callCount, 1, 'the revoked event must not join the room');
      assert.equal(progressLookup.callCount, 0, 'an in-brand ACL denial must not trigger alternate identifier lookups');
      assert.equal((res.status as unknown as sinon.SinonStub).calledOnceWithExactly(403), true);
      assert.equal((res.json as unknown as sinon.SinonStub).firstCall.args[0].code, 'resource-denied');
      assert.equal(sendResp.callCount, 1);
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      if (previousBrandingService === undefined) Reflect.deleteProperty(globalThis, 'BrandingService');
      else Reflect.set(globalThis, 'BrandingService', previousBrandingService);
      if (previousAsynchsService === undefined) Reflect.deleteProperty(globalThis, 'AsynchsService');
      else Reflect.set(globalThis, 'AsynchsService', previousAsynchsService);
      sinon.restore();
    }
  });

  it('rechecks the record ACL on every event after refreshing the principal', async () => {
    const getAuthorizedMeta = sinon.stub();
    getAuthorizedMeta.onFirstCall().resolves(
      allowedResource(decision(true, 'allowed'), {
        redboxOid: 'record-1',
        metaMetadata: { brandId: BRAND.id },
      })
    );
    getAuthorizedMeta.onSecondCall().resolves(deniedResource(decision(false, 'record-acl-denied')));
    const authorizeRecordCollection = sinon.stub().returns(allowedResource(decision(true, 'allowed'), BRAND));
    const resolveUserContext = sinon.stub().resolves(context());
    const authorizeBrandEntity = sinon.stub().callsFake(authorizeCurrentBrand);
    const join = sinon.stub().callsFake((_req, _room, callback) => callback());
    const previousSails = globalThis.sails;
    const previousBrandingService = Reflect.get(globalThis, 'BrandingService');
    const previousAsynchsService = Reflect.get(globalThis, 'AsynchsService');
    try {
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        services: {
          ...(previousSails?.services ?? {}),
          recordsservice: { getAuthorizedMeta, authorizeRecordCollection },
          authorizationservice: { resolveUserContext, authorizeBrandEntity },
        },
        sockets: { join, leave: sinon.stub(), broadcast: sinon.stub() },
      };
      Reflect.set(globalThis, 'BrandingService', { getBrandFromReq: sinon.stub().returns(BRAND) });
      Reflect.set(globalThis, 'AsynchsService', { get: sinon.stub().returns(of([])) });

      const controller = new Controllers.Asynch();
      const sendResp = sinon.stub(controller as unknown as { sendResp: (...args: unknown[]) => unknown }, 'sendResp');
      const res = response();

      await controller.subscribe(request(), res);
      await controller.subscribe(request(), res);

      assert.equal(resolveUserContext.callCount, 2);
      assert.equal(getAuthorizedMeta.callCount, 2);
      assert.equal(authorizeRecordCollection.callCount, 2);
      assert.equal(join.callCount, 1);
      assert.equal((sendResp.secondCall.args[2] as { status?: number }).status, 403);
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      if (previousBrandingService === undefined) Reflect.deleteProperty(globalThis, 'BrandingService');
      else Reflect.set(globalThis, 'BrandingService', previousBrandingService);
      if (previousAsynchsService === undefined) Reflect.deleteProperty(globalThis, 'AsynchsService');
      else Reflect.set(globalThis, 'AsynchsService', previousAsynchsService);
      sinon.restore();
    }
  });

  it('maps a freshly disabled socket principal to authentication-required', async () => {
    const resolveUserContext = sinon.stub().resolves(context({ active: false, scopes: [] }));
    const authorizeBrandEntity = sinon.stub().callsFake(authorizeCurrentBrand);
    const getAuthorizedMeta = sinon.stub();
    const authorizeRecordCollection = sinon.stub();
    const previousSails = globalThis.sails;
    const previousBrandingService = Reflect.get(globalThis, 'BrandingService');
    const previousAsynchsService = Reflect.get(globalThis, 'AsynchsService');
    try {
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        services: {
          ...(previousSails?.services ?? {}),
          recordsservice: { getAuthorizedMeta, authorizeRecordCollection },
          authorizationservice: { resolveUserContext, authorizeBrandEntity },
        },
        sockets: { join: sinon.stub(), leave: sinon.stub(), broadcast: sinon.stub() },
      };
      Reflect.set(globalThis, 'BrandingService', { getBrandFromReq: sinon.stub().returns(BRAND) });
      Reflect.set(globalThis, 'AsynchsService', { get: sinon.stub().returns(of([])) });

      const controller = new Controllers.Asynch();
      const res = response();

      await controller.subscribe(request(), res);

      assert.equal((res.status as unknown as sinon.SinonStub).calledOnceWithExactly(401), true);
      assert.equal((res.json as unknown as sinon.SinonStub).firstCall.args[0].code, 'authentication-required');
      assert.equal(getAuthorizedMeta.called, false);
      assert.equal(authorizeRecordCollection.called, false);
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      if (previousBrandingService === undefined) Reflect.deleteProperty(globalThis, 'BrandingService');
      else Reflect.set(globalThis, 'BrandingService', previousBrandingService);
      if (previousAsynchsService === undefined) Reflect.deleteProperty(globalThis, 'AsynchsService');
      else Reflect.set(globalThis, 'AsynchsService', previousAsynchsService);
      sinon.restore();
    }
  });
});
