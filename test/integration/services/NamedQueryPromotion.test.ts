import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';
import axios from 'axios';
import type { Db } from 'mongodb';
import { recordGraphql, SOLR_RECORD_GRID_FIELDS } from '@researchdatabox/redbox-core';
import type { NamedQueryPromotionDraft, GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';

/** Real browser session, CSRF, path rules, current discovery and Mongo persistence. */
describe('Explorer named-query promotion HTTP', function () {
  this.timeout(120_000);
  const prefix = '/default/rdmp/api/named-query';
  const grids = '/default/rdmp/app/data-grids';
  const fixture = `promotion_${randomUUID().replace(/-/g, '')}`;
  let session: supertest.Agent;
  let csrf: string;
  const token = randomUUID();
  let adminId: string;
  let previousToken: string | null | undefined;
  let originalConfig: typeof sails.config.recordGraphql;
  let originalCsrf: typeof sails.config.security.csrf;
  const headers = () => ({ 'X-CSRF-Token': csrf, 'X-ReDBox-Api-Version': '2.0', 'X-Source': 'jsclient' });
  const db = () => SavedGrid.getDatastore().manager as Db;
  const visual = () => ({
    version: 1,
    name: fixture,
    recordType: 'dataPublication',
    columns: ['record:oid', 'record:workflowStep'],
    filters: [],
    sort: null,
    pageSize: 25,
  });
  const raw = () => ({
    version: 1,
    mode: 'graphql',
    name: fixture,
    document:
      'query Current($type: String!, $filters: [RecordFilterInput!], $first: Int, $after: String) { matches: records(recordType: $type, filters: $filters, first: $first, after: $after) { items: nodes { identity: oid label: workflowStep } hasNextPage endCursor } }',
    variables: { type: 'dataPublication', filters: [], first: 25, after: null },
    resultPath: ['matches', 'items'],
  });
  const prepare = async (exploration: unknown): Promise<NamedQueryPromotionDraft> =>
    (await session.post(`${prefix}/editor/from-explorer`).set(headers()).send({ exploration }).expect(200)).body.data;
  const classify = (prepared: NamedQueryPromotionDraft, name: string): GraphqlNamedQueryDefinition => {
    const candidate = structuredClone(prepared.definition);
    candidate.name = name;
    for (const [key, value] of Object.entries(prepared.variableValues))
      candidate.graphql.variables[key] = { ownership: 'fixed', value: structuredClone(value) };
    // The visual generator declares optional stages even when the exploration has no restriction.
    if (candidate.graphql.document.includes('$stages:') && !Object.hasOwn(candidate.graphql.variables, 'stages'))
      candidate.graphql.variables.stages = { ownership: 'omitted' };
    return candidate;
  };
  before(async () => {
    originalConfig = sails.config.recordGraphql;
    sails.config.recordGraphql = {
      ...recordGraphql,
      enabled: true,
      cursorSecret: 't09-promotion-secret-0123456789abcdef',
    };
    // The committed general harness starts Solr before runtime grid fields exist.
    // Add only the parent's declared fields inside this disposable test project.
    const options = sails.config.solr.cores.default.options;
    const solrUrl = `${options.https ? 'https' : 'http'}://${options.host}:${options.port}/solr/${options.core}`;
    const live: { fields: Array<{ name: string }> } = (await axios.get(`${solrUrl}/schema`)).data.schema;
    const missing = SOLR_RECORD_GRID_FIELDS.filter(field => !live.fields.some(found => found.name === field.name));
    if (missing.length) await axios.post(`${solrUrl}/schema`, { 'add-field': missing });
    originalCsrf = sails.config.security.csrf;
    sails.config.security.csrf = true;
    session = supertest.agent(sails.hooks.http.app);
    const loginCsrf = (await session.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    await session
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', loginCsrf)
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);
    csrf = (await session.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    sails.config.security.csrf = originalCsrf;
    const admin = await User.findOne({ username: 'admin' });
    assert.ok(admin);
    adminId = admin.id;
    previousToken = admin.token;
    await firstValueFrom(UsersService.setUserKey(adminId, token));
  });
  after(async () => {
    await NamedQuery.destroy({ name: { startsWith: fixture } });
    await db().collection(SavedGrid.tableName).deleteMany({ 'definition.name': fixture });
    if (adminId) await User.update({ id: adminId }, { token: previousToken });
    sails.config.recordGraphql = originalConfig;
    sails.config.security.csrf = originalCsrf;
  });
  for (const mode of ['visual', 'graphql'] as const)
    it(`prepares current unsaved ${mode} values, cancels without persistence and saves independent nonlookup definitions`, async () => {
      const page = await session.get('/default/rdmp/admin/data-grids').expect(200);
      assert.ok(page.text.includes('can-create-named-query="true"'));
      const original = mode === 'visual' ? visual() : raw();
      const saved = (await session.post(grids).set(headers()).send({ definition: original }).expect(200)).body.data;
      const before = (await session.get(`${grids}/${saved.id}`).set(headers()).expect(200)).body.data;
      const current = structuredClone(saved);
      if (mode === 'visual') {
        current.columns = ['record:oid'];
        current.filters = [
          { fieldId: 'record:oid', expectedScalarType: 'STRING', operator: 'eq', values: ['CURRENT_UNSAVED'] },
        ];
      } else current.variables.filters = [{ field: 'record:oid', eq: { text: 'CURRENT_UNSAVED' } }];
      const counts = [await NamedQuery.count({}), await SavedGrid.count({})];
      const prepared = await prepare(current);
      assert.deepEqual(prepared.definition.graphql.variables, {});
      assert.deepEqual(prepared.definition.graphql.provenance, {
        explorerId: saved.id,
        explorerRevision: saved.revision,
        explorerPortal: 'rdmp',
      });
      assert.ok(JSON.stringify(prepared.variableValues).includes('CURRENT_UNSAVED'));
      assert.ok(!prepared.definition.graphql.document.includes('CURRENT_UNSAVED'));
      assert.deepEqual((await session.get(`${grids}/${saved.id}`).set(headers()).expect(200)).body.data, before);
      assert.deepEqual([await NamedQuery.count({}), await SavedGrid.count({})], counts, 'open/cancel must not write');
      const unclassified = { ...prepared.definition, name: `${fixture}_${mode}` };
      await session.post(prefix).set(headers()).send(unclassified).expect(400);
      const candidate = classify(prepared, `${fixture}_${mode}`);
      const described = (
        await session.post(`${prefix}/editor/describe`).set(headers()).send({ definition: candidate }).expect(200)
      ).body.data;
      assert.equal(described.valid, true, JSON.stringify(described));
      assert.equal(described.capabilities.lookup, false);
      await session.post(prefix).set(headers()).send(candidate).expect(201);
      await session.post(prefix).set(headers()).send(candidate).expect(409);
      const publishedAs = [{ name: candidate.name, publishedRevision: saved.revision, changedSincePublished: false }];
      assert.deepEqual((await session.get(`${grids}/${saved.id}`).set(headers()).expect(200)).body.data, { ...before, publishedAs });
      const catalogue = (await session.get(`${prefix}/editor/saved-queries`).query({ q: fixture, mode }).set(headers()).expect(200)).body.data;
      assert.deepEqual(catalogue.grids.find((grid: { id: string }) => grid.id === saved.id).publishedAs, publishedAs);
      const named = (await session.get(`${prefix}/${candidate.name}`).set(headers()).expect(200)).body.data;
      assert.deepEqual(named.graphql, candidate.graphql);
      assert.equal(named.sourceSavedQuery.name, original.name);
      assert.equal(named.sourceSavedQuery.mode, mode);
      assert.equal(named.sourceSavedQuery.changedSincePublished, false);
      assert.equal(named.sourceSavedQuery.updatedBy.username, 'admin');
      const selected = (await session.post(`${prefix}/editor/from-saved-query`).set(headers()).send({ id: saved.id, revision: saved.revision }).expect(200)).body.data;
      assert.deepEqual(selected.definition.graphql.provenance, candidate.graphql.provenance);
      // Later explorer edits update only that saved exploration and its revision.
      const explorerEdit = structuredClone(original);
      if ('variables' in explorerEdit) explorerEdit.variables.first = 50;
      else explorerEdit.pageSize = 50;
      await session
        .put(`${grids}/${saved.id}`)
        .set(headers())
        .send({ revision: saved.revision, definition: explorerEdit })
        .expect(200);
      assert.deepEqual(
        (await session.get(`${prefix}/${candidate.name}`).set(headers()).expect(200)).body.data.graphql,
        candidate.graphql
      );
      assert.equal((await session.get(`${prefix}/${candidate.name}`).set(headers()).expect(200)).body.data.sourceSavedQuery.changedSincePublished, true);
      await session.post(`${prefix}/editor/from-saved-query`).set(headers()).send({ id: saved.id, revision: saved.revision }).expect(409);
      // Later named-query changes are immediate but do not touch the explorer.
      const explorerAfterEdit = (await session.get(`${grids}/${saved.id}`).set(headers()).expect(200)).body.data;
      const edited = structuredClone(candidate);
      edited.graphql.document += '\n# Independent named-query edit';
      const review = (
        await session
          .post(`${prefix}/${candidate.name}/review-update`)
          .set(headers())
          .send({ definition: edited })
          .expect(200)
      ).body.data;
      await session
        .put(`${prefix}/${candidate.name}`)
        .set(headers())
        .set('X-ReDBox-Named-Query-Confirmation', review.confirmation)
        .send(edited)
        .expect(200);
      assert.deepEqual(
        (await session.get(`${grids}/${saved.id}`).set(headers()).expect(200)).body.data,
        explorerAfterEdit
      );
      // Informational provenance is no execution/read dependency: preparation also accepts an unsaved origin.
      const unsaved = structuredClone(current);
      delete unsaved.id;
      delete unsaved.revision;
      assert.equal((await prepare(unsaved)).definition.graphql.provenance, undefined);
      await session
        .delete(`${grids}/${saved.id}`)
        .set(headers())
        .send({ revision: explorerAfterEdit.revision })
        .expect(200);
      assert.equal(
        (await session.post(`${prefix}/editor/describe`).set(headers()).send({ definition: edited }).expect(200)).body
          .data.valid,
        true,
        'source provenance must not require the original exploration to exist'
      );
      const missing = (await session.get(`${prefix}/${candidate.name}`).set(headers()).expect(200)).body.data.sourceSavedQuery;
      assert.equal(missing.missing, true);
      assert.equal(missing.changedSincePublished, null);
      // Retaining the link remains editable after deletion without implicit relinking.
      await session.put(`${prefix}/${candidate.name}`).set(headers()).send(edited).expect(200);
    });
  it('lists scoped summaries with search, mode and stable 100-row paging; rejects cross-scope source links', async () => {
    const brand = BrandingService.getBrand('default');
    const collection = db().collection(SavedGrid.tableName);
    const batch = Array.from({ length: 101 }, () => ({ brandId: String(brand.id), portal: 'rdmp', revision: 1, definition: raw() }));
    await collection.insertMany(batch);
    const elsewhere = await collection.insertMany([
      { brandId: String(brand.id), portal: 'elsewhere', revision: 1, definition: raw() },
      { brandId: 'another-brand', portal: 'rdmp', revision: 1, definition: raw() },
    ]);
    const page = (await session.get(`${prefix}/editor/saved-queries`).query({ q: fixture, mode: 'graphql' }).set(headers()).expect(200)).body.data;
    assert.equal(page.grids.length, 100);
    assert.equal(page.next, page.grids.at(-1).id);
    assert.equal(Object.hasOwn(page.grids[0], 'document'), false);
    assert.equal(page.grids[0].recordType, 'dataPublication');
    const next = (await session.get(`${prefix}/editor/saved-queries`).query({ q: fixture, mode: 'graphql', after: page.next }).set(headers()).expect(200)).body.data;
    assert.equal(next.grids.length, 1); assert.equal(next.next, null);
    for (const query of [{ mode: 'invalid' }, { after: 'invalid' }, { q: 'x'.repeat(121) }])
      await session.get(`${prefix}/editor/saved-queries`).query(query).set(headers()).expect(400);
    const id = String(elsewhere.insertedIds[0]);
    await session.post(`${prefix}/editor/from-saved-query`).set(headers()).send({ id, revision: 1 }).expect(404);
    const invalid = classify(await prepare(raw()), `${fixture}_scope`);
    invalid.graphql.provenance = { explorerId: id, explorerRevision: 1, explorerPortal: 'rdmp' };
    await session.post(prefix).set(headers()).send(invalid).expect(404);
    await collection.deleteMany({ 'definition.name': fixture });
  });
  it('requires an actual admin session for saved sources and CSRF for draft creation', async () => {
    for (const authorization of [undefined, `Bearer ${token}`]) {
      const list = supertest(sails.hooks.http.app).get(`${prefix}/editor/saved-queries`).set('X-ReDBox-Api-Version', '2.0');
      if (authorization) list.set('Authorization', authorization);
      await list.expect(403);
      const draft = supertest(sails.hooks.http.app).post(`${prefix}/editor/from-saved-query`).send({ id: '0123456789abcdef01234567', revision: 1 });
      if (authorization) draft.set('Authorization', authorization);
      await draft.expect(403);
    }
    await session.post(`${prefix}/editor/from-saved-query`).set('X-ReDBox-Api-Version', '2.0')
      .send({ id: '0123456789abcdef01234567', revision: 1 }).expect(403);
    const username = `${fixture}_researcher`;
    await firstValueFrom(UsersService.addLocalUser(username, 'WP1 HTTP Researcher', `${username}@example.invalid`, 'GridTest123!'));
    const user = await User.findOne({ username });
    assert.ok(user);
    try {
      const brand = BrandingService.getBrand('default');
      await firstValueFrom(UsersService.updateUserRoles(user.id, RolesService.getRoleIds(brand.roles, ['Researcher'])));
      const researcher = supertest.agent(sails.hooks.http.app);
      const security = sails.config.security.csrf;
      try {
        sails.config.security.csrf = true;
        const loginCsrf = (await researcher.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
        await researcher.post('/user/login_local').set('X-Source', 'jsclient').set('X-CSRF-Token', loginCsrf)
          .send({ username, password: 'GridTest123!', branding: 'default', portal: 'rdmp' }).expect(200);
      } finally { sails.config.security.csrf = security; }
      const researcherCsrf = (await researcher.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
      await researcher.get(`${prefix}/editor/saved-queries`).set('X-ReDBox-Api-Version', '2.0').expect(403);
      await researcher.post(`${prefix}/editor/from-saved-query`).set(headers()).set('X-CSRF-Token', researcherCsrf)
        .send({ id: '0123456789abcdef01234567', revision: 1 }).expect(403);
    } finally { await User.destroy({ id: user.id }); }
  });
  it('requires independent destination CREATE for both preparation modes and actual save despite explorer access', async () => {
    const brand = BrandingService.getBrand('default');
    const rules = PathRulesService.getRulesFromPath(prefix, brand);
    assert.ok(rules?.length);
    const paths = rules.map(rule => rule.path).filter((path): path is string => typeof path === 'string');
    const matching = await db()
      .collection(PathRule.tableName)
      .find({ path: { $in: paths } })
      .toArray();
    assert.ok(matching.length);
    try {
      for (const row of matching)
        await db()
          .collection(PathRule.tableName)
          .updateOne({ _id: row._id }, { $set: { can_read: true, can_update: false } });
      await firstValueFrom(PathRulesService.bootstrap(undefined, []));
      await session.get(grids).set(headers()).expect(200);
      const page = await session.get('/default/rdmp/admin/data-grids').expect(200);
      assert.ok(page.text.includes('can-create-named-query="false"'));
      const before = [await NamedQuery.count({}), await SavedGrid.count({})];
      await session.post(`${prefix}/editor/from-saved-query`).set(headers())
        .send({ id: '0123456789abcdef01234567', revision: 1 }).expect(403);
      for (const exploration of [visual(), raw()]) {
        const response = await session
          .post(`${prefix}/editor/from-explorer`)
          .set(headers())
          .send({ exploration })
          .expect(403);
        assert.equal(response.body.errors[0].code, 'NAMED_QUERY_CREATE_FORBIDDEN');
        assert.ok(!JSON.stringify(response.body).includes('query Current'));
      }
      await session
        .post(prefix)
        .set(headers())
        .send({
          name: `${fixture}_denied`,
          collectionName: 'record',
          mongoQuery: {},
          queryParams: {},
          resultObjectMapping: {},
        })
        .expect(403);
      assert.deepEqual([await NamedQuery.count({}), await SavedGrid.count({})], before);
    } finally {
      for (const row of matching) await db().collection(PathRule.tableName).replaceOne({ _id: row._id }, row);
      await firstValueFrom(PathRulesService.bootstrap(undefined, []));
    }
  });
  it('refuses anonymous/no-CSRF preparation and invalid saves without revising the original', async () => {
    await supertest(sails.hooks.http.app)
      .post(`${prefix}/editor/from-explorer`)
      .send({ exploration: raw() })
      .expect(403);
    await supertest(sails.hooks.http.app)
      .post(`${prefix}/editor/from-explorer`)
      .set('Authorization', `Bearer ${token}`)
      .send({ exploration: raw() })
      .expect(403);
    await session
      .post(`${prefix}/editor/from-explorer`)
      .set('X-ReDBox-Api-Version', '2.0')
      .send({ exploration: raw() })
      .expect(403);
    const before = [await NamedQuery.count({}), await SavedGrid.count({})];
    const prepared = await prepare(raw());
    const invalid = classify(prepared, `${fixture}_invalid`);
    invalid.graphql.document = 'query { privateSentinel }';
    await session.post(prefix).set(headers()).send(invalid).expect(400);
    assert.deepEqual([await NamedQuery.count({}), await SavedGrid.count({})], before);
    const response = await session
      .post(`${prefix}/editor/from-explorer`)
      .set(headers())
      .send({ exploration: { ...visual(), columns: ['missing'] } })
      .expect(400);
    assert.equal(response.body.errors[0].code, 'schema-changed');
  });
});
