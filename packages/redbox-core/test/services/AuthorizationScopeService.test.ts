import { strict as assert } from 'node:assert';
import { afterEach, describe, it } from 'mocha';
import { asRoleKey, asScopeKey, freezeAuthorizationContext, type AuthorizationContext } from '../../src/authorization';
import { Services } from '../../src/services/AuthorizationScopeService';

function actor(scopeKeys: readonly string[]): AuthorizationContext {
  return freezeAuthorizationContext({
    contextType: 'brand',
    principal: {
      category: 'authenticated',
      authMethod: 'session',
      active: true,
      userId: 'operator-1',
      username: 'operator',
    },
    brand: { requestedIdentifier: 'brand-1', id: 'brand-1', name: 'Brand 1', exists: true, authorized: true },
    roles: [],
    compatibilityRoles: [],
    grantedScopeKeys: scopeKeys.map(asScopeKey),
    effectiveScopeKeys: scopeKeys.map(asScopeKey),
    scopeProvenance: [],
  });
}

function queryResult<T>(rows: T, capture?: (criteria: Record<string, unknown>) => void) {
  return (criteria: Record<string, unknown> = {}) => {
    capture?.(criteria);
    const query = {
      sort() {
        return query;
      },
      limit() {
        return Promise.resolve(rows);
      },
    };
    return query;
  };
}

afterEach(() => {
  for (const name of ['AuthorizationScope', 'RoleTemplate', 'RoleTemplateRevision']) {
    Reflect.deleteProperty(globalThis, name);
  }
});

describe('AuthorizationScopeService contract queries', () => {
  it('returns a bounded deterministic scope page and a continuation key', async () => {
    let criteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'AuthorizationScope', {
      find: queryResult(
        [
          {
            id: 'scope-1',
            key: 'authorization.role.read',
            namespace: 'authorization',
            label: 'Read roles',
            description: 'Read roles.',
            risk: 'read',
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1',
            status: 'active',
            lastSeenGeneration: 'generation',
            metadataVersion: 1,
          },
          {
            id: 'scope-2',
            key: 'authorization.scope.read',
            namespace: 'authorization',
            label: 'Read scopes',
            description: 'Read scopes.',
            risk: 'read',
            sourceType: 'core',
            sourcePackage: '@researchdatabox/redbox-core',
            sourceVersion: '1',
            status: 'active',
            lastSeenGeneration: 'generation',
            metadataVersion: 1,
          },
        ],
        value => {
          criteria = value;
        }
      ),
    });
    const service = new Services.AuthorizationScopeService();
    const page = await service.listCatalog({
      actor: actor(['authorization.scope.read']),
      cursor: 'authorization.audit.read',
      limit: 1,
      namespace: 'authorization',
      risk: 'read',
      search: 'read',
      sourceType: 'core',
      status: 'active',
    });

    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].key, asScopeKey('authorization.role.read'));
    assert.equal(page.nextCursor, 'authorization.role.read');
    assert.deepEqual(criteria, {
      key: { '>': 'authorization.audit.read' },
      namespace: 'authorization',
      risk: 'read',
      sourceType: 'core',
      status: 'active',
      or: [
        { key: { contains: 'read' } },
        { label: { contains: 'read' } },
        { description: { contains: 'read' } },
        { sourcePackage: { contains: 'read' } },
      ],
    });
    assert.equal(Object.isFrozen(page), true);
    assert.equal(Object.isFrozen(page.items), true);
  });

  it('lists templates and reads one immutable revision without leaking an absent template', async () => {
    const template = {
      id: 'template-1',
      key: 'researcher',
      displayName: 'Researcher',
      description: 'Research role',
      currentRevision: 2,
      protectedKind: 'none',
      status: 'active',
      version: 2,
    };
    const revision = {
      id: 'revision-2',
      template: 'template-1',
      revision: 2,
      scopeKeys: [asScopeKey('record.read')],
      publishedBy: 'operator-1',
      publishedAt: '2026-08-29T00:00:00.000Z',
    };
    Reflect.set(globalThis, 'RoleTemplate', {
      find: queryResult([template]),
      findOne: ({ key }: { key: string }) => Promise.resolve(key === 'researcher' ? template : undefined),
    });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      find: () => ({ sort: () => Promise.resolve([revision]) }),
      findOne: ({ revision: requestedRevision }: { revision: number }) =>
        Promise.resolve(requestedRevision === 2 ? revision : undefined),
    });
    const service = new Services.AuthorizationScopeService();
    const authorizedActor = actor(['authorization.role.read']);

    const page = await service.listTemplates({ actor: authorizedActor, limit: 10 });
    assert.equal(page.items.length, 1);
    assert.equal(page.items[0].key, asRoleKey('researcher'));
    assert.equal('scopeKeys' in page.items[0].revisions[0], false);
    assert.equal(page.items[0].revisionsTruncated, false);
    assert.equal(page.items[0].revisions[0].publishedAt, '2026-08-29T00:00:00.000Z');

    const found = await service.getTemplateRevision(authorizedActor, 'researcher', 2);
    assert.equal(found.templateKey, 'researcher');
    assert.equal(found.revision, 2);
    assert.deepEqual(found.scopeKeys, [asScopeKey('record.read')]);

    await assert.rejects(
      service.getTemplateRevision(authorizedActor, 'missing', 2),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.not-found'
    );
  });

  it('bounds nested template revision summaries to the latest numeric window', async () => {
    const template = {
      id: 'template-1',
      key: 'researcher',
      displayName: 'Researcher',
      description: 'Research role',
      currentRevision: 25,
      protectedKind: 'none',
      status: 'active',
      version: 25,
    };
    let revisionCriteria: Record<string, unknown> | undefined;
    Reflect.set(globalThis, 'RoleTemplate', { find: queryResult([template]) });
    Reflect.set(globalThis, 'RoleTemplateRevision', {
      find: (criteria: Record<string, unknown>) => {
        revisionCriteria = criteria;
        return {
          sort: () =>
            Promise.resolve(
              Array.from({ length: 20 }, (_value, index) => ({
                id: `revision-${25 - index}`,
                template: template.id,
                revision: 25 - index,
                scopeKeys: [asScopeKey('record.read')],
                publishedBy: 'operator-1',
                publishedAt: '2026-08-29T00:00:00.000Z',
              }))
            ),
        };
      },
    });

    const page = await new Services.AuthorizationScopeService().listTemplates({
      actor: actor(['authorization.role.read']),
      limit: 1,
    });

    assert.equal(page.items[0].revisions.length, 20);
    assert.equal(page.items[0].revisionsTruncated, true);
    assert.equal('scopeKeys' in page.items[0].revisions[0], false);
    assert.deepEqual(revisionCriteria, {
      or: [{ template: 'template-1', revision: { '>=': 6 } }],
    });
  });

  it('rejects catalog reads without the matching effective scope before querying storage', async () => {
    let queried = false;
    Reflect.set(globalThis, 'AuthorizationScope', {
      find: () => {
        queried = true;
        throw new Error('must not query');
      },
    });
    const service = new Services.AuthorizationScopeService();

    await assert.rejects(
      service.listCatalog({ actor: actor([]) }),
      (error: unknown) =>
        typeof error === 'object' && error !== null && 'code' in error && error.code === 'authorization.scope-denied'
    );
    assert.equal(queried, false);
  });
});
