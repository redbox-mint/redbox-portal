import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';
import type { Db } from 'mongodb';
import { recordGraphql, SOLR_RECORD_GRID_FIELDS } from '@researchdatabox/redbox-core';
import axios from 'axios';

/** Run in the lifted Docker Mocha suite with the GraphQL parent enabled and Solr ready.
 * Can also be loaded by Mocha inside an existing isolated runtime (no bootstrap/drop).
 * Uses real registered HTTP actions, Passport sessions, CSRF middleware and Mongo. */
describe('Saved-grid HTTP and Mongo integration', function () {
  this.timeout(120_000);
  const prefix = `saved-grid-http-${randomUUID()}-`;
  const portal = 'rdmp';
  const otherPortal = `grid-it-${randomUUID()}`;
  let admin: supertest.Agent, anonymous: supertest.Agent, researcher: supertest.Agent;
  let token: string, researcherToken: string;
  let researcherId: string, foreignBrandId: string, foreignBrandName: string, foreignRoleId: string;
  let brandId: string;
  const base = `/default/${portal}/app/data-grids`;
  const otherBase = `/default/${otherPortal}/app/data-grids`;
  let fixture = 0;
  let originalGraphql: typeof sails.config.recordGraphql;
  let originalCsrf: typeof sails.config.security.csrf;
  const definition = () => ({
    version: 1,
    name: `${prefix}${++fixture}`,
    recordType: 'dataPublication',
    columns: ['record:oid'],
    filters: [],
    sort: null,
    pageSize: 25,
  });
  const db = () => SavedGrid.getDatastore().manager as Db;
  const request = (agent: supertest.Agent, method: 'get' | 'post' | 'put' | 'delete', path: string, csrf?: string) => {
    const req = agent[method](path)
      .set('X-Source', 'jsclient')
      .set('Accept', 'application/json')
      .set('X-ReDBox-Api-Version', '2.0');
    return csrf === undefined ? req : req.set('X-CSRF-Token', csrf);
  };
  const denied = (agent: supertest.Agent) => (response: supertest.Response) => {
    if (agent === anonymous && response.status === 302) {
      assert.equal(response.headers.location, '/default/rdmp/user/login');
      assert.ok(!response.body?.data);
    } else assert.equal(response.status, 403);
  };
  const login = async (agent: supertest.Agent, username: string, password: string) => {
    const before = await agent.get('/csrfToken?branding=default&portal=rdmp').expect(200);
    await agent
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', before.body._csrf)
      .send({ username, password, branding: 'default', portal })
      .expect(200);
    const after = await agent.get('/csrfToken?branding=default&portal=rdmp').expect(200);
    assert.equal(typeof after.body._csrf, 'string');
    return after.body._csrf as string;
  };
  const create = async (path = base) => {
    const response = await request(admin, 'post', path, token).send({ definition: definition() }).expect(200);
    assert.match(response.body.data.id, /^[a-f0-9]{24}$/);
    return response.body.data;
  };

  before(async function () {
    originalCsrf = sails.config.security.csrf;
    if (typeof RecordGraphqlService === 'undefined') {
      this.skip(); // The admin-design base alone intentionally has no GraphQL implementation.
    }
    originalGraphql = sails.config.recordGraphql;
    sails.config.recordGraphql = { ...recordGraphql, ...originalGraphql, enabled: true, cursorSecret: 'saved-grid-http-secret-0123456789abcdef' };
    // Exercise browser mutations even when the shared harness disables global CSRF.
    sails.config.security.csrf = true;
    assert.ok(sails.config.security.csrf, 'Run with RBPORTAL_TEST_CSRF=true / security.csrf=true');
    assert.ok(SavedGrid && SavedGridService, 'Regenerate shims and build core before running');
    const options = sails.config.solr.cores.default.options;
    const solrUrl = `${options.https ? 'https' : 'http'}://${options.host}:${options.port}/solr/${options.core}`;
    const live: { fields: Array<{ name: string }> } = (await axios.get(`${solrUrl}/schema`)).data.schema;
    const missing = SOLR_RECORD_GRID_FIELDS.filter(field => !live.fields.some(found => found.name === field.name));
    if (missing.length) await axios.post(`${solrUrl}/schema`, { 'add-field': missing });
    const app = sails.hooks.http.app;
    admin = supertest.agent(app);
    anonymous = supertest.agent(app);
    researcher = supertest.agent(app);
    token = await login(
      admin,
      process.env.RBPORTAL_TEST_ADMIN_USER ?? 'admin',
      process.env.RBPORTAL_TEST_ADMIN_PASSWORD ?? 'rbadmin'
    );
    const brand = BrandingService.getDefault();
    brandId = String(brand.id);
    const username = `${prefix}researcher`;
    await firstValueFrom(
      UsersService.addLocalUser(username, 'Saved grid HTTP researcher', `${username}@example.invalid`, 'GridTest123!')
    );
    const user = await User.findOne({ username });
    assert.ok(user);
    researcherId = String(user.id);
    await firstValueFrom(UsersService.updateUserRoles(user.id, RolesService.getRoleIds(brand.roles, ['Researcher'])));
    researcherToken = await login(researcher, username, 'GridTest123!');
    const foreign = await BrandingConfig.create({ name: `${prefix}brand` }).fetch();
    foreignBrandId = String(foreign.id);
    foreignBrandName = String(foreign.name);
    const role = await Role.create({ name: 'Admin', branding: foreignBrandId }).fetch();
    foreignRoleId = String(role.id);
    await BrandingConfig.addToCollection(foreignBrandId, 'roles').members([foreignRoleId]);
    await firstValueFrom(BrandingService.loadAvailableBrands(undefined));
  });
  after(async function () {
    sails.config.security.csrf = originalCsrf;
    if (originalGraphql) sails.config.recordGraphql = originalGraphql;
    if (typeof SavedGrid !== 'undefined')
      await db()
        .collection(SavedGrid.tableName)
        .deleteMany({ 'definition.name': { $regex: `^${prefix}` } });
    if (researcherId) await User.destroy({ id: researcherId });
    if (foreignRoleId) await Role.destroy({ id: foreignRoleId });
    if (foreignBrandId) {
      await BrandingConfig.destroy({ id: foreignBrandId });
      await firstValueFrom(BrandingService.loadAvailableBrands(undefined));
    }
  });

  it('enforces browser Admin sessions and valid CSRF tokens through the actual policy chain', async () => {
    for (const [agent, csrf] of [
      [anonymous, undefined],
      [researcher, researcherToken],
    ] as const) {
      await request(agent, 'get', base).expect(denied(agent));
      await request(agent, 'get', `${base}/scopes/dataPublication`).expect(denied(agent));
      await request(agent, 'post', base, csrf).send({ definition: definition() }).expect(denied(agent));
    }
    await request(admin, 'post', base).send({ definition: definition() }).expect(403);
    await request(admin, 'post', base, 'incorrect-csrf-token').send({ definition: definition() }).expect(403);
    const saved = await create();
    await request(admin, 'put', `${base}/${saved.id}`).send({ revision: 1, definition: definition() }).expect(403);
    await request(admin, 'delete', `${base}/${saved.id}`).send({ revision: 1 }).expect(403);
    assert.equal((await SavedGrid.findOne({ id: saved.id })).revision, 1);
  });
  it('uses real scoped schema assistance and validates/persists raw read-only GraphQL queries', async () => {
    await request(anonymous, 'get', `${base}/schema`).expect(denied(anonymous));
    await request(researcher, 'get', `${base}/schema`).expect(403);
    const schema = await request(admin, 'get', `${base}/schema`).expect(200);
    assert.ok(schema.body.data.sdl.includes('type Query'));
    assert.ok(schema.body.data.sdl.includes('records('));
    const raw = {
      version: 1,
      mode: 'graphql',
      name: `${prefix}raw`,
      document:
        'query Explore($type: String!, $first: Int, $after: String) { records(recordType:$type,first:$first,after:$after) { nodes { oid recordType } hasNextPage endCursor } }',
      variables: { type: 'dataPublication', first: 25, after: null },
      resultPath: ['records', 'nodes'],
    };
    await request(admin, 'post', base).send({ definition: raw }).expect(403);
    const saved = (await request(admin, 'post', base, token).send({ definition: raw }).expect(200)).body.data;
    assert.equal(saved.mode, 'graphql');
    const executed = await request(admin, 'post', `/default/${portal}/api/graphql`, token)
      .send({ query: saved.document, variables: saved.variables })
      .expect(200);
    assert.equal(executed.body.errors, undefined);
    assert.ok(Array.isArray(executed.body.data.records.nodes));
    assert.deepEqual((await request(admin, 'get', `${base}/${saved.id}`).expect(200)).body.data, saved);
    const stored = await SavedGrid.findOne({ id: saved.id });
    assert.ok(stored && stored.definition.mode === 'graphql');
    assert.deepEqual(stored.definition.variables, raw.variables);
    await request(admin, 'get', `${otherBase}/${saved.id}`).expect(404);
    const listed = (await request(admin, 'get', base).expect(200)).body.data.grids;
    assert.ok(listed.some((row: { id: string; mode?: string }) => row.id === saved.id && row.mode === 'graphql'));
    for (const patch of [
      { document: 'mutation { deleteRecord(oid:"x") }' },
      { document: '{ __schema { queryType { name } } }' },
      { document: '{ inventedField }' },
      { variables: { type: 'dataPublication', first: 'wrong' } },
      { variables: { type: 'dataPublication', first: 25, after: 'saved-cursor' } },
      { document: '{ records(recordType:"dataPublication", first: 99999) { nodes { oid } } }' },
    ])
      await request(admin, 'put', `${base}/${saved.id}`, token)
        .send({ revision: 1, definition: { ...raw, ...patch } })
        .expect(400);
    assert.equal((await SavedGrid.findOne({ id: saved.id })).revision, 1);
    const update = await request(admin, 'put', `${base}/${saved.id}`, token)
      .send({ revision: 1, definition: { ...raw, name: `${prefix}raw-edited` } })
      .expect(200);
    assert.equal(update.body.data.revision, 2);
    await request(admin, 'delete', `${base}/${saved.id}`, token).send({ revision: 2 }).expect(200);
  });
  it('rejects deep variables before writes so create/update cannot poison catalogue loading', async () => {
    const nested = (depth: number, array: boolean) => {
      let value: unknown = 'leaf';
      for (let i = 0; i < depth; i++) value = array ? [value] : { nested: value };
      return value;
    };
    for (const array of [false, true]) {
      const raw = {
        version: 1,
        mode: 'graphql',
        name: `${prefix}depth-${array}`,
        document: '{ records(recordType:"dataPublication", first:25) { nodes { oid } } }',
        variables: { extra: nested(30, array) },
        resultPath: ['records', 'nodes'],
      };
      const saved = (await request(admin, 'post', otherBase, token).send({ definition: raw }).expect(200)).body.data;
      const before = await SavedGrid.count({});
      for (const depth of [31, 32]) {
        const invalid = { ...raw, variables: { extra: nested(depth, array) } };
        await request(admin, 'post', otherBase, token).send({ definition: invalid }).expect(400);
        await request(admin, 'put', `${otherBase}/${saved.id}`, token)
          .send({ revision: 1, definition: invalid })
          .expect(400);
      }
      assert.equal(await SavedGrid.count({}), before);
      const read = (await request(admin, 'get', `${otherBase}/${saved.id}`).expect(200)).body.data;
      assert.equal(read.revision, 1);
      assert.deepEqual(read.variables, raw.variables);
      const listed = (await request(admin, 'get', otherBase).expect(200)).body.data.grids;
      assert.ok(listed.some((grid: { id: string }) => grid.id === saved.id));
    }
  });
  it('serializes CRUD/list responses and persists through the registered Mongo model', async () => {
    const stageResponse = await request(admin, 'get', `${base}/scopes/dataPublication`).expect(200);
    assert.ok(Array.isArray(stageResponse.body.data.stages));
    const saved = await create();
    assert.equal(saved.revision, 1);
    const row = await SavedGrid.findOne({ id: saved.id });
    assert.equal(row.brandId, brandId);
    assert.equal(row.portal, portal);
    assert.equal(row.definition.name, saved.name);
    const read = await request(admin, 'get', `${base}/${saved.id}`).expect(200);
    assert.deepEqual(read.body.data, saved);
    assert.equal(read.headers['cache-control'], 'no-store');
    const changed = {
      ...definition(),
      sort: { fieldId: 'record:oid', direction: 'asc', expectedScalarType: 'STRING' },
    };
    const update = await request(admin, 'put', `${base}/${saved.id}`, token)
      .send({ revision: 1, definition: changed })
      .expect(200);
    assert.equal(update.body.data.revision, 2);
    assert.deepEqual(update.body.data.sort, changed.sort);
    assert.deepEqual((await request(admin, 'get', `${base}/${saved.id}`).expect(200)).body.data, update.body.data);
    const listed = await request(admin, 'get', base).expect(200);
    assert.ok(Array.isArray(listed.body.data.grids));
    assert.ok('next' in listed.body.data);
    await request(admin, 'delete', `${base}/${saved.id}`, token).send({ revision: 2 }).expect(200);
    await request(admin, 'get', `${base}/${saved.id}`).expect(404);
    assert.equal(await SavedGrid.findOne({ id: saved.id }), undefined);
  });
  it('isolates portal namespaces and forbids another brand while ignoring query/body scope overrides', async () => {
    const saved = await create();
    const other = await create(otherBase);
    await request(admin, 'get', `${otherBase}/${saved.id}`).expect(404);
    await request(admin, 'get', `${base}/${other.id}`).expect(404);
    await request(admin, 'put', `${otherBase}/${saved.id}`, token)
      .send({ revision: 1, definition: definition() })
      .expect(404);
    await request(admin, 'delete', `${otherBase}/${saved.id}`, token).send({ revision: 1 }).expect(404);
    const list = await request(admin, 'get', otherBase).expect(200);
    assert.ok(list.body.data.grids.some((grid: { id: string }) => grid.id === other.id));
    assert.ok(!list.body.data.grids.some((grid: { id: string }) => grid.id === saved.id));
    const foreignBase = `/${foreignBrandName}/${portal}/app/data-grids`;
    await request(admin, 'get', foreignBase).expect(403);
    await request(admin, 'get', `${foreignBase}/${saved.id}`).expect(403);
    await request(admin, 'post', foreignBase, token).send({ definition: definition() }).expect(403);
    await request(admin, 'put', `${foreignBase}/${saved.id}`, token)
      .send({ revision: 1, definition: definition() })
      .expect(403);
    await request(admin, 'delete', `${foreignBase}/${saved.id}`, token).send({ revision: 1 }).expect(403);
    await request(admin, 'post', base, token).send({ definition: definition(), brandId: foreignBrandId }).expect(400);
    const read = await request(
      admin,
      'get',
      `${base}/${saved.id}?brandId=${foreignBrandId}&portal=${otherPortal}`
    ).expect(200);
    assert.equal(read.body.data.id, saved.id);
  });
  it('bounds HTTP catalogue pages and keeps entries above 500 accessible with real Mongo cursors', async () => {
    await SavedGrid.createEach(
      Array.from({ length: 501 }, () => ({ brandId, portal: otherPortal, definition: definition(), revision: 1 }))
    ).fetch();
    const ids = new Set<string>();
    let next: string | null = null;
    let pages = 0;
    do {
      const response = await request(admin, 'get', otherBase + (next ? `?after=${next}` : '')).expect(200);
      const page = response.body.data;
      assert.ok(page.grids.length <= 100);
      for (const grid of page.grids) {
        assert.ok(!ids.has(grid.id));
        ids.add(grid.id);
      }
      assert.ok(page.next === null || /^[a-f0-9]{24}$/.test(page.next));
      if (page.next) assert.notEqual(page.next, next);
      next = page.next;
      pages++;
      assert.ok(pages < 20, 'Pagination must terminate');
    } while (next);
    assert.ok(ids.size >= 501);
    assert.ok(pages >= 6);
    const last = [...ids].at(-1)!;
    await request(admin, 'get', `${otherBase}/${last}`).expect(200);
    await request(admin, 'delete', `${otherBase}/${last}`, token).send({ revision: 1 }).expect(200);
    await request(admin, 'get', `${otherBase}?after=invalid`).expect(400);
  });
  it('admits one concurrent revision update and one concurrent delete, using real atomic Mongo selectors', async () => {
    const saved = await create();
    const updates = await Promise.all(
      [1, 2].map(() =>
        request(admin, 'put', `${base}/${saved.id}`, token).send({ revision: 1, definition: definition() })
      )
    );
    assert.deepEqual(updates.map(response => response.status).sort(), [200, 409]);
    const winner = updates.find(response => response.status === 200)!.body.data;
    const row = await SavedGrid.findOne({ id: saved.id });
    assert.equal(row.revision, 2);
    assert.equal(row.definition.name, winner.name);
    await request(admin, 'delete', `${base}/${saved.id}`, token).send({ revision: 1 }).expect(409);
    const deletes = await Promise.all(
      [1, 2].map(() => request(admin, 'delete', `${base}/${saved.id}`, token).send({ revision: 2 }))
    );
    assert.deepEqual(deletes.map(response => response.status).sort(), [200, 404]);
    assert.equal(await SavedGrid.findOne({ id: saved.id }), undefined);
    // An update/delete race from the same revision also permits exactly one winner.
    const racing = await create();
    const race = await Promise.all([
      request(admin, 'put', `${base}/${racing.id}`, token).send({ revision: 1, definition: definition() }),
      request(admin, 'delete', `${base}/${racing.id}`, token).send({ revision: 1 }),
    ]);
    assert.equal(race.filter(response => response.status === 200).length, 1);
    assert.ok(race.every(response => [200, 404, 409].includes(response.status)));
  });
  it('rejects raw definitions and mismatched sort types through HTTP without changing the stored revision', async () => {
    const saved = await create();
    await request(admin, 'put', `${base}/${saved.id}`, token)
      .send({ revision: 1, definition: { ...definition(), query: '{ records { oid } }' } })
      .expect(400);
    const sort = await request(admin, 'put', `${base}/${saved.id}`, token)
      .send({
        revision: 1,
        definition: {
          ...definition(),
          sort: { fieldId: 'record:oid', direction: 'asc', expectedScalarType: 'NUMBER' },
        },
      })
      .expect(400);
    assert.equal(sort.body.errors[0].code, 'sort-type-changed');
    assert.equal((await SavedGrid.findOne({ id: saved.id })).revision, 1);
  });
});
