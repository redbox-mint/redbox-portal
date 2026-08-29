import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import * as sinon from 'sinon';
import {
  asScopeKey,
  freezeAuthorizationContext,
  type AuthorizationContext,
  type AuthorizationDecision,
  type ScopeKey,
} from '../../src/authorization';
import { Services } from '../../src/services/RecordsService';

const BRAND_A = { id: 'brand-a', name: 'Brand A' };

function context(scopes: readonly string[]): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'user-1',
      username: 'user-one',
    },
    brand: { id: BRAND_A.id, name: BRAND_A.name, exists: true, authorized: true },
    grantedScopeKeys: scopes.map(asScopeKey),
    effectiveScopeKeys: scopes.map(asScopeKey),
  });
}

function decision(scope: ScopeKey, allowed: boolean, reasonCode: AuthorizationDecision['reasonCode']) {
  return Object.freeze({ allowed, reasonCode, requiredScope: scope, brandId: BRAND_A.id });
}

describe('RecordsService Phase 7 resource gates', () => {
  it('evaluates the route and base action before loading a record', async () => {
    const getMeta = sinon.stub().resolves({
      redboxOid: 'record-1',
      metaMetadata: { brandId: BRAND_A.id },
      authorization: { view: ['user-one'] },
    });
    const actionCalls: string[] = [];
    const granted = new Set(['record.audit.read', 'record.read']);
    const authorizationService = {
      authorizeAction(_context: AuthorizationContext, scope: ScopeKey) {
        actionCalls.push(scope);
        const allowed = granted.has(scope);
        return decision(scope, allowed, allowed ? 'allowed' : 'scope-missing');
      },
      authorizeBrandEntity(_context: AuthorizationContext, scope: ScopeKey, entityBrandId: string | undefined) {
        return decision(
          scope,
          entityBrandId === BRAND_A.id,
          entityBrandId === BRAND_A.id ? 'allowed' : 'resource-not-found'
        );
      },
      authorizeRecord: sinon.stub().resolves(decision(asScopeKey('record.read'), true, 'allowed')),
      hasScope: sinon.stub().returns(false),
    };
    const previousSails = globalThis.sails;
    const previousBrandingService = Reflect.get(globalThis, 'BrandingService');
    try {
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        services: { ...(previousSails?.services ?? {}), authorizationservice: authorizationService },
      };
      Reflect.set(globalThis, 'BrandingService', {
        getBrandById: sinon.stub().withArgs(BRAND_A.id).returns(BRAND_A),
      });
      const service = new Services.Records();
      (service as unknown as { storageService: { getMeta: typeof getMeta } }).storageService = { getMeta };

      const result = await service.getAuthorizedMeta(
        context(['record.audit.read', 'record.read']),
        asScopeKey('record.audit.read'),
        'record-1',
        'read'
      );
      assert.equal(result.allowed, true);
      assert.deepEqual(actionCalls, ['record.audit.read', 'record.read']);
      assert.equal(getMeta.callCount, 1);

      granted.delete('record.audit.read');
      actionCalls.length = 0;
      const routeDenied = await service.getAuthorizedMeta(
        context(['record.read']),
        asScopeKey('record.audit.read'),
        'record-2',
        'read'
      );
      assert.equal(routeDenied.allowed, false);
      assert.deepEqual(actionCalls, ['record.audit.read']);
      assert.equal(getMeta.callCount, 1, 'a denied action must not cause an identifier lookup');

      granted.add('record.audit.read');
      granted.delete('record.read');
      actionCalls.length = 0;
      const baseDenied = await service.getAuthorizedMeta(
        context(['record.audit.read']),
        asScopeKey('record.audit.read'),
        'record-3',
        'read'
      );
      assert.equal(baseDenied.allowed, false);
      assert.deepEqual(actionCalls, ['record.audit.read', 'record.read']);
      assert.equal(getMeta.callCount, 1, 'a missing base record scope must not cause an identifier lookup');
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
      if (previousBrandingService === undefined) Reflect.deleteProperty(globalThis, 'BrandingService');
      else Reflect.set(globalThis, 'BrandingService', previousBrandingService);
    }
  });

  it('preserves direct-user, edit-implies-view and immutable same-brand role ACL semantics', () => {
    const previousSails = globalThis.sails;
    try {
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        services: {
          ...(previousSails?.services ?? {}),
          authorizationservice: {
            authorizeAction: sinon.stub(),
            authorizeBrandEntity: sinon.stub(),
            authorizeRecord: sinon.stub(),
            hasScope: sinon.stub().returns(false),
          },
        },
      };
      const service = new Services.Records();
      const record = {
        metaMetadata: { brandId: BRAND_A.id },
        authorization: {
          view: [],
          edit: ['direct-editor'],
          viewRoles: [],
          editRoles: ['Researcher'],
        },
      };

      assert.equal(service.hasViewAccess(BRAND_A, { username: 'direct-editor' }, [], record), true);
      assert.equal(service.hasEditAccess(BRAND_A, { username: 'direct-editor' }, [], record), true);
      const foreignRecord = { ...record, metaMetadata: { brandId: 'brand-b' } };
      assert.equal(service.hasViewAccess(BRAND_A, { username: 'direct-editor' }, [], foreignRecord), false);
      assert.equal(service.hasEditAccess(BRAND_A, { username: 'direct-editor' }, [], foreignRecord), false);
      const unbrandedRecord = { ...record, metaMetadata: {} };
      assert.equal(service.hasViewAccess(BRAND_A, { username: 'direct-editor' }, [], unbrandedRecord), false);
      assert.equal(service.hasEditAccess(BRAND_A, { username: 'direct-editor' }, [], unbrandedRecord), false);
      assert.equal(
        service.hasEditAccess(
          BRAND_A,
          { username: 'another-user' },
          [{ key: 'Researcher', name: 'Renamed label', branding: { id: BRAND_A.id } }],
          record
        ),
        true
      );
      assert.equal(
        service.hasEditAccess(
          BRAND_A,
          { username: 'another-user' },
          [{ key: 'Researcher', branding: { id: 'brand-b' } }],
          record
        ),
        false
      );
      assert.equal(
        service.hasEditAccess(BRAND_A, { username: 'another-user' }, [{ key: 'Researcher' }], record),
        false,
        'global/system role keys must not implicitly match a brand record ACL'
      );
      assert.equal(
        service.hasEditAccess(BRAND_A, { username: 'another-user' }, [{ key: 'Researcher', branding: BRAND_A.id }], {
          ...record,
          metaMetadata_brandId: BRAND_A.id,
          metaMetadata: undefined,
        }),
        true,
        'flat Solr brand fields must use the same same-brand ACL decision'
      );
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
    }
  });

  it('limits broad ACL bypass to records owned by the active brand', () => {
    const previousSails = globalThis.sails;
    try {
      (globalThis as unknown as { sails: unknown }).sails = {
        ...previousSails,
        services: {
          ...(previousSails?.services ?? {}),
          authorizationservice: {
            authorizeAction: sinon.stub(),
            authorizeBrandEntity: sinon.stub(),
            authorizeRecord: sinon.stub(),
            hasScope: sinon
              .stub()
              .callsFake((_context: AuthorizationContext, scope: ScopeKey) =>
                ['record.read.all', 'record.update.all'].includes(scope)
              ),
          },
        },
      };
      const service = new Services.Records();
      const authority = context(['record.read', 'record.read.all', 'record.update', 'record.update.all']);
      const deniedAcl = { authorization: { view: [], edit: [], viewRoles: [], editRoles: [] } };

      assert.equal(
        service.hasViewAccess(
          BRAND_A,
          { username: 'user-one' },
          [],
          {
            ...deniedAcl,
            metaMetadata: { brandId: BRAND_A.id },
          },
          authority
        ),
        true
      );
      assert.equal(
        service.hasEditAccess(
          BRAND_A,
          { username: 'user-one' },
          [],
          {
            ...deniedAcl,
            metaMetadata: { brandId: BRAND_A.id },
          },
          authority
        ),
        true
      );
      assert.equal(
        service.hasViewAccess(
          BRAND_A,
          { username: 'user-one' },
          [],
          {
            ...deniedAcl,
            metaMetadata: { brandId: 'brand-b' },
          },
          authority
        ),
        false
      );
      assert.equal(
        service.hasEditAccess(
          BRAND_A,
          { username: 'user-one' },
          [],
          {
            ...deniedAcl,
            metaMetadata: { brandId: 'brand-b' },
          },
          authority
        ),
        false
      );
    } finally {
      (globalThis as unknown as { sails: unknown }).sails = previousSails;
    }
  });
});
