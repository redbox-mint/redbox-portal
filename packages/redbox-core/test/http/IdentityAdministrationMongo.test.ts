import { createServer } from 'node:http';
import { once } from 'node:events';
import { Services as Vocabulary } from '../../src/vocabulary/Vocabulary';
import { Services as Rva } from '../../src/vocabulary/RvaImport';
import { ensureVocabularyPersistenceIndexes } from '../../src/persistence/vocabulary/preflight';
import { initializeVocabularyPersistence, getVocabularyRepositories } from '../../src/persistence/vocabulary/runtime';
import { mountVocabularyIntegrationRoutes } from '../../src/http/express/vocabularyIntegrations';
import type { PoliciesConfig } from '../../src/config/policies.config';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { firstValueFrom, of, from } from 'rxjs';
import { nothingLogger } from '@researchdatabox/sails-ng-common';
import { AuthenticationAccounts } from '../../src/authentication/Accounts';
import { Services as Users, type UserAdministrationInput } from '../../src/identity/Users';
import { Services as Roles } from '../../src/identity/Roles';
import { Services as Queries } from '../../src/queries/NamedQueries';
import { Services as Reports } from '../../src/queries/Reports';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import { RoleModel } from '../../src/model/storage/RoleModel';
import { getReferenceRepositories } from '../../src/persistence/reference/runtime';
import { executeNamedQuery, namedQueryTarget } from '../../src/persistence/reference/NamedQueryExecution';
import { registerPersistenceResource } from '../../src/persistence/runtime';
import { resolveExtensions } from '../../src/extensions/resolution';
import { bindExtensionFactory } from '../../src/extensions/composition';
import { pilotPolicyChain } from '../../src/http/express/policies';
import { createHttpCsrf, mountCsrfTokenRoute } from '../../src/http/express/csrf';
import { mountIdentityAdministrationRoutes } from '../../src/http/express/identityAdministration';
import { mountQueryWriteRoutes } from '../../src/http/express/queryWrites';
import { pilotFixture } from './pilotFixture';

async function administrationFixture(denyAlias = false, failPreparation = false) {
  let vocabulary!: Vocabulary.VocabularyService;
  let providerGate:
    | {
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  let providerCalls = 0;
  let providerFails = false;
  let metadataFails = false;
  let users!: Users.Users;
  let roles!: Roles.Roles;
  let queries!: Queries.NamedQueryService;
  let reports!: Reports.Reports;
  let writes = 0;
  let failRoles = false;
  let failAudit = false;
  let delayed:
    | {
        entered: ReturnType<typeof Promise.withResolvers<void>>;
        release: ReturnType<typeof Promise.withResolvers<void>>;
      }
    | undefined;
  const f = await pilotFixture({
    rootContext: '/portal',
    prepareRoutes: async (router, f, policies) => {
      const provider = createServer(async (req, res) => {
        providerCalls++;
        if (providerGate) {
          providerGate.entered.resolve();
          await providerGate.release.promise;
        }
        res.setHeader('Content-Type', 'application/json');
        if (providerFails) {
          res.statusCode = 503;
          res.end(JSON.stringify({ error: 'private provider credentials' }));
          return;
        }
        if (req.url?.includes('/api/resource/vocabularies/'))
          res.end(
            JSON.stringify({
              id: 1,
              title: 'RVA fixture',
              slug: 'rva-fixture',
              version: [{ id: 101, status: 'current' }],
            })
          );
        else if (req.url?.includes('/conceptTree'))
          res.end(
            JSON.stringify([{ id: 'alpha', label: metadataFails ? 'Updated before failure' : 'Alpha', notation: 'A' }])
          );
        else {
          res.statusCode = 404;
          res.end('{}');
        }
      });
      registerPersistenceResource(f.owner, 'rva-fixture-provider', {
        close: () =>
          new Promise<void>((resolve, reject) => provider.close(error => (error ? reject(error) : resolve()))),
      });
      provider.listen(0, '127.0.0.1');
      await once(provider, 'listening');
      const address = provider.address();
      assert(address && typeof address === 'object');
      await ensureVocabularyPersistenceIndexes(f.owner);
      await initializeVocabularyPersistence(f.owner);
      const vocabularyRepository = getVocabularyRepositories(f.owner);
      vocabulary = new Vocabulary.VocabularyService({
        repository: vocabularyRepository,
        config: {},
        log: nothingLogger,
        getBrand: name => [f.brand, f.otherBrand].find(brand => brand.id === name || brand.name === name) ?? null,
        defaultBrand: () => 'default',
      });
      const rva = new Rva.RvaImport({
        repository: {
          getVocabulary: (...args) => vocabularyRepository.getVocabulary(...args),
          reviseVocabulary: (...args) => {
            if (metadataFails) return Promise.reject(new Error('private metadata credentials'));
            return vocabularyRepository.reviseVocabulary(...args);
          },
        },
        vocabulary,
        log: nothingLogger,
        defaultBrand: () => f.brand.id,
        baseUrl: () => 'http://127.0.0.1:' + address.port,
      });
      assert.equal(providerCalls, 0, 'Construction cannot activate external work');
      const brand = Object.assign(new BrandingModel(), f.brand, { roles: [f.role, f.reader] });
      const reader = Object.assign(new RoleModel(), f.reader);
      const accounts = new AuthenticationAccounts({
        repository: f.identities,
        log: nothingLogger,
        defaultBrand: () => brand,
        getBrand: () => brand,
        authConfig: () => ({}),
        defaultAuthenticatedRole: () => reader,
        nestedRoles: () => [reader],
        authorizedEmails: () => ({ enabled: false }),
        resolveHook: () => {
          throw new Error('Unregistered fixture hook');
        },
        event: () => {},
      });
      class HookUsers extends Users.Users {
        public async initialize() {}
        public async close() {}
        public constructor(input: UserAdministrationInput) {
          super(input);
          const update = this.updateUserRoles;
          this.updateUserRoles = (...args) => {
            if (failRoles) return from(Promise.reject(new Error('private role database failure')));
            return update(...args);
          };
          const audit = this.addUserAuditEvent;
          this.addUserAuditEvent = (...args) => {
            if (failAudit) throw new Error('private audit database failure');
            return audit(...args);
          };
        }
        public override async disableUser(...args: Parameters<Users.Users['disableUser']>) {
          writes++;
          if (delayed) {
            delayed.entered.resolve();
            await delayed.release.promise;
          }
          await super.disableUser(...args);
        }
      }
      const core = {
        name: 'users',
        create: (_input: UserAdministrationInput): HookUsers => {
          throw new Error('Replaced core must not construct');
        },
      };
      const hook = {
        name: 'users',
        replaces: true as const,
        create: (input: UserAdministrationInput) => new HookUsers(input),
      };
      const resolved = resolveExtensions([
        { name: 'core', root: process.cwd(), declaration: { apiVersion: 1, modules: [core] } },
        { name: 'identity-hook', root: process.cwd(), declaration: { apiVersion: 1, modules: [hook] } },
      ]);
      assert.equal(resolved.modules[0]!.declaration, hook);
      users = bindExtensionFactory(hook, {
        repository: f.identities,
        accounts,
        log: nothingLogger,
        defaultBrand: () => brand,
      })();
      roles = new Roles.Roles({
        repository: f.identities,
        log: nothingLogger,
        auth: () => ({}),
        roles: () => [],
        defaultBrand: () => brand,
        refreshBrand: async () => {},
        loadBrands: () => of(brand),
      });
      const refs = getReferenceRepositories(f.owner);
      queries = new Queries.NamedQueryService({
        queries: refs.namedQueries,
        log: nothingLogger,
        config: { namedQuery: { supportedCollections: ['user'] } },
        target: name => namedQueryTarget(f.owner, name),
        execute: (request, count) => executeNamedQuery(f.owner, request, count),
      });
      reports = new Reports.Reports({
        reports: refs.reports,
        namedQueries: queries,
        search: {
          searchAdvanced: () => {
            throw new Error('Not a query execution fixture');
          },
        },
        config: {},
        log: nothingLogger,
        portalUrl: () => '/default/rdmp',
      });
      registerPersistenceResource(f.owner, 'administration-reports', { close: async () => reports.close() });
      const csrf = createHttpCsrf({
        origins: ['http://127.0.0.1'],
        authenticateBearer: token => f.identity.bearer(token),
      });
      mountCsrfTokenRoute(router, csrf);
      const policyConfiguration: PoliciesConfig = {
        '*': [...pilotPolicyChain],
        ...(denyAlias ? { AdminController: { generateUserKey: false } } : {}),
      };
      mountIdentityAdministrationRoutes(router, {
        users,
        roles,
        csrf,
        policyConfiguration,
        policies,
        log: nothingLogger,
      });
      mountQueryWriteRoutes(router, {
        queries,
        reports,
        csrf,
        policyConfiguration,
        policies,
        log: nothingLogger,
        audit: (actor, action, context) => users.addUserAuditEvent(actor, action, context),
      });
      mountVocabularyIntegrationRoutes(router, {
        vocabulary,
        rva,
        csrf,
        policies,
        policyConfiguration,
        log: nothingLogger,
        audit: (actor, action, context) => users.addUserAuditEvent(actor, action, context),
      });
      if (failPreparation) {
        assert.equal(providerCalls, 0, 'Failed initialization cannot activate provider work');
        throw new Error('Deliberate administration initialization failure');
      }
    },
  });
  return {
    ...f,
    users,
    vocabulary,
    providerCalls: () => providerCalls,
    delayProvider() {
      providerGate = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
      return providerGate;
    },
    providerFails(value: boolean) {
      providerFails = value;
    },
    metadataFails(value: boolean) {
      metadataFails = value;
    },
    roles,
    queries,
    reports,
    writes: () => writes,
    failRoles(value: boolean) {
      failRoles = value;
    },
    failAudit(value: boolean) {
      failAudit = value;
    },
    delay() {
      delayed = { entered: Promise.withResolvers<void>(), release: Promise.withResolvers<void>() };
      return delayed;
    },
  };
}

describe('owned identity and query administration on Mongo HTTP', function () {
  this.timeout(45000);
  let f: Awaited<ReturnType<typeof administrationFixture>>;
  let cookie = '',
    token = '',
    targetId = '',
    foreignId = '',
    aliasId = '',
    foreignRoleId = '';
  const base = '/default/rdmp';
  before(async () => {
    f = await administrationFixture();
    const foreignRole = await f.identities.create('role', { name: 'ForeignAdmin', branding: f.otherBrand.id });
    foreignRoleId = foreignRole.id;
    targetId = (
      await f.identities.create('user', {
        username: 'managed',
        name: 'Managed',
        email: 'managed@example.invalid',
        type: 'local',
        roles: [f.reader.id, foreignRole.id],
      })
    ).id;
    foreignId = (
      await f.identities.create('user', {
        username: 'foreign',
        name: 'Foreign',
        email: 'foreign@example.invalid',
        type: 'local',
        roles: [foreignRole.id],
      })
    ).id;
    aliasId = (
      await f.identities.create('user', {
        username: 'alias',
        name: 'Alias',
        email: 'alias@example.invalid',
        type: 'local',
        roles: [f.reader.id],
        accountLinkState: 'linked-alias',
        linkedPrimaryUserId: targetId,
      })
    ).id;
    const login = await fetch(f.url + '/__test/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
    });
    assert.equal(login.status, 200);
    cookie = login.headers.get('set-cookie')!.split(';')[0]!;
    await login.text();
    const response = await fetch(f.url + '/csrfToken', { headers: { Cookie: cookie } });
    token = ((await response.json()) as { _csrf: string })._csrf;
  });
  after(async () => {
    await f?.close();
  });
  const session = () => ({ Cookie: cookie, 'X-CSRF-Token': token });
  async function request(
    route: string,
    body: unknown = {},
    method = 'POST',
    headers: Record<string, string> = f.headers
  ) {
    const response = await fetch(f.url + route, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      ...(method === 'GET' || method === 'HEAD' ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(10000),
    });
    const text = await response.text();
    return { response, body: (text ? JSON.parse(text) : {}) as Record<string, unknown> };
  }
  async function persisted(id = targetId) {
    return f.identities.one('user', { id }, { populate: ['roles'] });
  }
  const query = { collectionName: 'user', mongoQuery: {}, queryParams: {}, resultObjectMapping: { name: 'name' } };
  const report = {
    name: 'managed_report',
    title: 'Managed report',
    reportSource: 'database',
    databaseQuery: { queryName: 'managed_query' },
    columns: [{ label: 'Name', property: 'name' }],
  };
  it('creates, retries and updates users without exposing secrets or replacing foreign memberships', async () => {
    const payload = {
      username: 'created',
      name: 'Created',
      email: 'created@example.invalid',
      password: 'synthetic-password',
      roles: ['Researcher'],
    };
    const created = await request(base + '/api/users?apiVersion=2.0', payload, 'PUT');
    assert.equal(created.response.status, 201, JSON.stringify(created.body));
    const id = (created.body.data as { id: string }).id;
    assert(!JSON.stringify(created.body).includes('synthetic-password'));
    const retry = await request(base + '/api/users', payload, 'PUT');
    assert.equal(retry.response.status, 201);
    assert.equal(retry.body.id, id);
    const updated = await request(base + '/api/users', {
      id: targetId,
      name: 'Changed',
      email: '',
      password: '',
      roles: ['Admin'],
    });
    assert.equal(updated.response.status, 201, JSON.stringify(updated.body));
    assert.equal((await persisted())!.name, 'Changed');
    assert.deepEqual(
      ((await persisted())!.roles ?? []).map(role => (role as { id: string }).id).sort(),
      [f.role.id, foreignRoleId].sort()
    );
  });
  it('disables/enables through the selected override and both aliases, persisting audits and repeat semantics', async () => {
    for (const prefix of ['/api', '/admin']) {
      const headers = prefix === '/api' ? f.headers : session();
      for (const action of ['disable', 'disable', 'enable']) {
        const response = await request(base + prefix + '/users/' + targetId + '/' + action, {}, 'POST', headers);
        assert.equal(response.response.status, 200, JSON.stringify(response.body));
        assert.equal((await persisted())!.loginDisabled, action === 'disable');
      }
    }
    assert.equal(f.writes(), 4);
    assert.equal(await f.native.db().collection('useraudit').countDocuments({ action: 'disable-user' }), 4);
    assert.equal((await request(base + '/api/users/' + f.user.id + '/disable')).response.status, 400);
    assert.equal((await request(base + '/api/users/' + aliasId + '/disable')).response.status, 400);
    assert.equal((await request(base + '/api/users/' + aliasId + '/enable')).response.status, 400);
  });
  it('generates/revokes hashed API tokens through API, admin and self routes', async () => {
    for (const [generate, revoke, body, headers] of [
      ['/api/users/token/generate?id=' + targetId, '/api/users/token/revoke?id=' + targetId, {}, f.headers],
      ['/admin/users/genKey', '/admin/users/revokeKey', { userid: targetId }, session()],
      ['/user/genKey', '/user/revokeKey', { userid: foreignId }, session()],
    ] as const) {
      const generated = await request(base + generate, body, 'POST', headers);
      assert.equal(generated.response.status, 200, JSON.stringify(generated.body));
      const raw = String(generated.body.token ?? generated.body.message);
      const actor = await f.identity.bearer(raw);
      assert(actor);
      assert.equal(actor.id, generate.startsWith('/user/') ? f.user.id : targetId);
      assert.notEqual((await persisted(actor.id))!.token, raw);
      assert.equal((await request(base + revoke, body, 'POST', headers)).response.status, 200);
      assert.equal(await f.identity.bearer(raw), false);
    }
    // Self revoke removed the fixture admin token; restore a fresh one for subsequent API cases.
    const renewed = await request(base + '/user/genKey', {}, 'POST', session());
    f.headers.Authorization = 'Bearer ' + renewed.body.message;
  });
  it('preserves admin/profile payloads, resolves roles in the current brand and ignores forged target IDs on self routes', async () => {
    const created = await request(
      base + '/admin/users/newUser',
      {
        username: 'browser-created',
        details: {
          name: 'Browser',
          email: 'browser@example.invalid',
          password: 'synthetic-password',
          roles: ['Researcher'],
        },
      },
      'POST',
      session()
    );
    assert.equal(created.response.status, 200, JSON.stringify(created.body));
    const updated = await request(
      base + '/admin/users/update',
      { userid: targetId, details: { name: 'Browser changed', roles: ['Researcher'] } },
      'POST',
      session()
    );
    assert.equal(updated.response.status, 200);
    assert.equal(
      (await request(base + '/admin/roles/user', { userid: targetId, roles: ['Admin'] }, 'POST', session())).response
        .status,
      200
    );
    assert.deepEqual(
      ((await persisted())!.roles ?? []).map(role => (role as { id: string }).id).sort(),
      [f.role.id, foreignRoleId].sort()
    );
    assert.equal(
      (await request(base + '/user/update', { userid: foreignId, details: { name: 'My profile' } }, 'POST', session()))
        .response.status,
      200
    );
    assert.equal((await persisted(f.user.id))!.name, 'My profile');
    assert.notEqual((await persisted(foreignId))!.name, 'My profile');
    assert.equal(
      (await request(base + '/user/update', { details: { name: 'Bad', roles: ['Admin'] } }, 'POST', session())).response
        .status,
      400
    );
    assert.equal((await request(base + '/api/roles/NewRole', {})).response.status, 200);
    assert.equal((await request(base + '/api/roles/NewRole', {})).response.status, 200);
    for (const route of ['/api/roles', '/admin/roles/get']) {
      const result = await request(base + route, {}, 'GET');
      assert.equal(result.response.status, 200);
      assert(JSON.stringify(result.body).includes('NewRole'));
      assert(!JSON.stringify(result.body).includes('ForeignAdmin'));
    }
  });
  it('refuses unauthenticated, foreign-brand/object, wrong-role, malformed and invalid CSRF writes before the override', async () => {
    const path = base + '/admin/users/' + targetId + '/disable';
    const count = f.writes();
    for (const [route, headers, status] of [
      [path, {}, 401],
      [path, { Cookie: cookie }, 403],
      [path, { Cookie: cookie, 'X-CSRF-Token': 'invalid' }, 403],
      [path, f.headers, 403],
      [path.replace('/default/', '/other/'), session(), 403],
      [base + '/api/users/' + targetId + '/disable', { Cookie: cookie }, 403],
      [base + '/api/users/' + foreignId + '/disable', f.headers, 403],
      [base + '/api/users/token/generate?id=' + foreignId, f.headers, 403],
      [base + '/api/users/token/generate?id[x]=bad', f.headers, 400],
      [base + '/api/users/' + targetId + '/disable', { Authorization: 'Bearer forged' }, 401],
    ] as const)
      assert.equal((await request(route, {}, 'POST', headers)).response.status, status, route);
    await f.identities.replaceMemberships('user', f.user.id, [f.reader.id]);
    try {
      assert.equal((await request(path, {}, 'POST', session())).response.status, 403);
      assert.equal((await request(base + '/api/roles/Escalated')).response.status, 403);
    } finally {
      await f.identities.replaceMemberships('user', f.user.id, [f.role.id]);
    }
    assert.equal(f.writes(), count);
    assert.equal((await request(base + '/api/users', [], 'PUT')).response.status, 400);
    assert.equal(
      (
        await request(base + '/api/users', {
          id: targetId,
          name: 'No effect',
          email: '',
          password: '',
          roles: ['ForeignAdmin'],
        })
      ).response.status,
      400
    );
    assert.notEqual((await persisted())!.name, 'No effect');
  });
  it('retains committed account/profile changes and reports role or audit failures without leaking backend details', async () => {
    f.failRoles(true);
    try {
      const created = await request(
        base + '/api/users',
        {
          username: 'partial',
          name: 'Partial',
          email: 'partial@example.invalid',
          password: 'synthetic-password',
          roles: ['Researcher'],
        },
        'PUT'
      );
      assert.equal(created.response.status, 201, JSON.stringify(created.body));
      const updated = await request(base + '/api/users', {
        id: targetId,
        name: 'Committed profile',
        email: '',
        password: '',
        roles: ['Researcher'],
      });
      assert.equal(updated.response.status, 500);
      assert(!JSON.stringify(updated.body).includes('private'));
      assert.equal((await persisted())!.name, 'Committed profile');
    } finally {
      f.failRoles(false);
    }
    f.failAudit(true);
    try {
      assert.equal((await request(base + '/api/users/' + targetId + '/disable')).response.status, 500);
      assert.equal((await persisted())!.loginDisabled, true);
    } finally {
      f.failAudit(false);
    }
    assert.equal((await request(base + '/api/users/' + targetId + '/enable')).response.status, 200);
  });
  it('creates, updates and deletes tenant-qualified named queries and both report configuration aliases with audit', async () => {
    assert.equal((await request(base + '/api/named-query', { name: 'managed_query', ...query })).response.status, 201);
    assert.equal((await request(base + '/api/named-query', { name: 'managed_query', ...query })).response.status, 409);
    assert.equal((await request(base + '/api/named-query/managed_query', query, 'PUT')).response.status, 200);
    for (const prefix of ['/api', '/admin']) {
      const headers = prefix === '/api' ? f.headers : session();
      const path = base + prefix + '/report-config';
      assert.equal((await request(path, report, 'POST', headers)).response.status, 201);
      assert.equal((await request(path, report, 'POST', headers)).response.status, 409);
      assert.equal(
        (await request(path + '/managed_report', { ...report, title: 'Updated' }, 'PUT', headers)).response.status,
        200
      );
      assert.equal((await request(path + '/managed_report', {}, 'DELETE', headers)).response.status, 200);
      assert.equal((await request(path + '/managed_report', {}, 'DELETE', headers)).response.status, 404);
    }
    assert.equal((await request(base + '/api/named-query/managed_query', {}, 'DELETE')).response.status, 200);
    assert.equal((await request(base + '/api/named-query/managed_query', {}, 'DELETE')).response.status, 404);
    assert(await f.native.db().collection('useraudit').countDocuments({ action: 'createQuery' }));
  });
  it('rejects query/report definition mutations for forbidden, missing, reserved and malformed definitions', async () => {
    const route = base + '/api/named-query';
    for (const name of ['collections', '../invalid'])
      assert.equal((await request(route, { name, ...query })).response.status, 400);
    assert.equal((await request(route, [])).response.status, 400);
    assert.equal((await request(route, { name: 'forbidden', ...query }, 'POST', {})).response.status, 401);
    assert.equal(
      (await request(route, { name: 'forbidden', ...query }, 'POST', { Cookie: cookie })).response.status,
      403
    );
    assert.equal(
      (await request(route.replace('/default/', '/other/'), { name: 'forbidden', ...query })).response.status,
      403
    );
    assert.equal((await request(base + '/api/report-config', report)).response.status, 400);
    assert.equal((await request(base + '/api/report-config/no', report, 'PUT')).response.status, 404);
    await f.identities.replaceMemberships('user', f.user.id, [f.reader.id]);
    try {
      assert.equal((await request(route, { name: 'forbidden', ...query })).response.status, 403);
    } finally {
      await f.identities.replaceMemberships('user', f.user.id, [f.role.id]);
    }
  });
  it('imports/syncs RVA through actual HTTP and Mongo, denying foreign objects before provider calls', async () => {
    const before = f.providerCalls();
    assert.equal(before, 0);
    const imported = await request(base + '/api/vocabulary/import?apiVersion=2.0', { rvaId: '1' });
    assert.equal(imported.response.status, 200, JSON.stringify(imported.body));
    const id = (imported.body.data as { id: string }).id;
    assert.equal((await f.vocabulary.getById(id))!.branding, f.brand.id);
    assert.equal((await f.vocabulary.getTree(id))[0]!.label, 'Alpha');
    const synced = await request(base + '/admin/vocabulary/' + id + '/sync', { versionId: '101' }, 'POST', session());
    assert.equal(synced.response.status, 200, JSON.stringify(synced.body));
    const other = await f.vocabulary.create({
      name: 'Foreign RVA',
      branding: f.otherBrand.id,
      source: 'rva',
      sourceId: '1',
    });
    const calls = f.providerCalls();
    assert.equal((await request(base + '/api/vocabulary/' + other.id + '/sync')).response.status, 404);
    assert.equal((await request(base + '/api/vocabulary/import', { rvaId: '1' }, 'POST', {})).response.status, 401);
    assert.equal(
      (await request(base + '/admin/vocabulary/import', { rvaId: '1' }, 'POST', { Cookie: cookie })).response.status,
      403
    );
    assert.equal(
      (
        await request(base + '/admin/vocabulary/import', { rvaId: '1' }, 'POST', {
          Cookie: cookie,
          'X-CSRF-Token': 'invalid',
        })
      ).response.status,
      403
    );
    assert.equal((await request(base + '/api/vocabulary/import', { rvaId: {} })).response.status, 400);
    assert.equal(
      (await request(base + '/api/vocabulary/import', { rvaId: '1', versionId: 'invalid' })).response.status,
      400
    );
    await f.identities.replaceMemberships('user', f.user.id, [f.reader.id]);
    try {
      assert.equal((await request(base + '/api/vocabulary/import', { rvaId: '1' })).response.status, 403);
    } finally {
      await f.identities.replaceMemberships('user', f.user.id, [f.role.id]);
    }
    assert.equal(f.providerCalls(), calls);
    f.providerFails(true);
    try {
      const failed = await request(base + '/api/vocabulary/' + id + '/sync');
      assert.equal(failed.response.status, 400);
      assert(!JSON.stringify(failed.body).includes('private'));
      assert.equal((await f.vocabulary.getTree(id))[0]!.label, 'Alpha');
    } finally {
      f.providerFails(false);
    }
    f.metadataFails(true);
    try {
      assert.equal((await request(base + '/api/vocabulary/' + id + '/sync')).response.status, 400);
      assert.equal((await f.vocabulary.getTree(id))[0]!.label, 'Updated before failure');
    } finally {
      f.metadataFails(false);
    }
    assert.equal((await request(base + '/api/vocabulary/' + id + '/sync')).response.status, 200);
    assert.equal((await f.vocabulary.getTree(id)).length, 1, 'Retry updates the existing identifier');
    assert.equal(
      (await request(base + '/admin/vocabulary/import', { rvaId: '2' }, 'POST', session())).response.status,
      200
    );
    assert(await f.native.db().collection('useraudit').countDocuments({ action: 'sync-vocabulary' }));
  });
  it('retains original browser action policy overrides and rejects account linking without the owned writer before effects', async () => {
    const blocked = await administrationFixture(true);
    try {
      const login = await fetch(blocked.url + '/__test/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'pilot-admin', password: 'pilot-password' }),
      });
      const cookie = login.headers.get('set-cookie')!.split(';')[0]!;
      await login.text();
      const tokenResponse = await fetch(blocked.url + '/csrfToken', { headers: { Cookie: cookie } });
      const token = ((await tokenResponse.json()) as { _csrf: string })._csrf;
      const response = await fetch(blocked.url + base + '/admin/users/genKey', {
        method: 'POST',
        headers: { Cookie: cookie, 'X-CSRF-Token': token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ userid: blocked.user.id }),
      });
      assert.equal(response.status, 403);
      await response.text();
      await assert.rejects(
        firstValueFrom(blocked.users.linkAccounts(blocked.user.id, 'missing', 'pilot-admin', blocked.brand.id)),
        /owned record mutation provider/
      );
      assert.equal(await blocked.native.db().collection('userlink').countDocuments(), 0);
      assert.equal(blocked.providerCalls(), 0);
    } finally {
      await blocked.close();
    }
  });
  it('runs existing API-token Bruno cases against persisted identities', async () => {
    const collection = path.resolve('../../test/bruno');
    const token = f.headers.Authorization.slice('Bearer '.length);
    const result = await promisify(execFile)(
      process.execPath,
      [
        path.join(collection, 'node_modules/@usebruno/cli/bin/bru.js'),
        'run',
        '1 - REST API/2 - User Management/Generate API Researcher User API Token.bru',
        '1 - REST API/2 - User Management/Revoke API Researcher User API Token.bru',
        '--env',
        'int-test',
        '--env-var',
        'host=' + f.url,
        '--env-var',
        'token=' + token,
        '--env-var',
        'apiUserId=' + targetId,
        '--reporter-skip-all-headers',
      ],
      { cwd: collection, timeout: 30000, maxBuffer: 1024 * 1024 }
    );
    console.log(result.stdout);
    assert.equal((await persisted())!.hasApiKey, false);
  });
  it('loads no legacy controller, compatibility service, core barrel or Sails', () => {
    assert.equal(Reflect.get(globalThis, 'sails'), undefined);
    assert.deepEqual(
      Object.keys(require.cache).filter(file =>
        /\/redbox-core\/src\/(?:compat\/|controllers\/|(?:index|CoreBase|CoreService|CoreController)\.ts$)|\/node_modules\/sails\//.test(
          file
        )
      ),
      []
    );
  });
  it('retains admitted provider HTTP work after client abort until persistence and audit complete', async () => {
    const slow = await administrationFixture();
    const gate = slow.delayProvider();
    const abort = new AbortController();
    const pending = fetch(slow.url + base + '/api/vocabulary/import', {
      method: 'POST',
      headers: { ...slow.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rvaId: '1' }),
      signal: abort.signal,
    }).catch(() => undefined);
    try {
      await Promise.race([
        gate.entered.promise,
        pending.then(async response => {
          throw new Error('Provider work was not entered: ' + response?.status + ' ' + (await response?.text()));
        }),
      ]);
      abort.abort();
      await pending;
      await assert.rejects(slow.host.stop({ deadlineMs: 30 }));
      gate.release.resolve();
      await slow.host.stop();
      assert.equal(await slow.native.db().collection('vocabulary').countDocuments({ source: 'rva' }), 1);
      assert.equal(await slow.native.db().collection('useraudit').countDocuments({ action: 'import-vocabulary' }), 1);
    } finally {
      gate.release.resolve();
      abort.abort();
      await pending;
      await slow.close();
    }
  });
  it('cleans up failed administration initialization without activating provider work', async () => {
    await assert.rejects(administrationFixture(false, true), /Deliberate administration initialization failure/);
  });
  it('retains an aborted mutation through failed stop and persists before cleanup', async () => {
    const slow = await administrationFixture();
    const target = await slow.identities.create('user', {
      username: 'slow-managed',
      name: 'Slow',
      email: 'slow@example.invalid',
      type: 'local',
      roles: [slow.reader.id],
    });
    const gate = slow.delay();
    const abort = new AbortController();
    const pending = fetch(slow.url + base + '/api/users/' + target.id + '/disable', {
      method: 'POST',
      headers: slow.headers,
      signal: abort.signal,
    }).catch(() => undefined);
    try {
      await gate.entered.promise;
      abort.abort();
      await pending;
      await assert.rejects(slow.host.stop({ deadlineMs: 30 }));
      assert.equal(slow.host.status().stopFailed, true);
      gate.release.resolve();
      await slow.host.stop();
      assert.equal(
        (await slow.native.db().collection('user').findOne({ username: 'slow-managed' }))!.loginDisabled,
        true
      );
    } finally {
      gate.release.resolve();
      abort.abort();
      await pending;
      await slow.close();
    }
  });
});
