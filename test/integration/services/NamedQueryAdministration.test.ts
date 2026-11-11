import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';
import { recordGraphql } from '@researchdatabox/redbox-core';

/** Real routes, policy/CSRF, Mongo persistence and confirmation binding. */
describe('named query administration save review', function () {
  const prefix = '/default/rdmp/api/named-query';
  const name = `admin_${randomUUID().replace(/-/g, '')}`;
  const token = randomUUID();
  const database = {
    name,
    collectionName: 'user',
    mongoQuery: { username: 'admin' },
    queryParams: {},
    resultObjectMapping: { username: 'record.username' },
  };
  const graphql = {
    name,
    source: 'graphql',
    graphql: {
      document:
        'query Q($search: String! = "rdmp", $first: Int, $after: String) { records(recordType: $search, first: $first, after: $after) { nodes { oid workflowStep } hasNextPage } }',
      variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String!', required: true } },
      resultPath: ['records', 'nodes'],
      mappings: { oid: ['oid'], title: ['workflowStep'] },
      lookup: {
        mode: 'firstPage',
        collectionPath: ['records'],
        hasNextPagePath: ['records', 'hasNextPage'],
        firstVariable: 'first',
        afterVariable: 'after',
        searchParameter: 'search',
      },
    },
  };
  let session: supertest.Agent;
  let csrf = '';
  let adminId: string;
  let previousToken: string | null | undefined;
  let originalConfig: typeof sails.config.recordGraphql;
  let securityBefore: typeof sails.config.security.csrf;
  const auth = () => ({ Authorization: `Bearer ${token}`, 'X-ReDBox-Api-Version': '2.0' });
  const editorAuth = () => ({ ...auth(), 'X-CSRF-Token': csrf });
  const request = () => supertest(sails.hooks.http.app);
  const review = async (definition: unknown) =>
    (await session.post(`${prefix}/${name}/review-update`).set(editorAuth()).send({ definition }).expect(200)).body
      .data;
  before(async () => {
    originalConfig = sails.config.recordGraphql;
    sails.config.recordGraphql = { ...recordGraphql, enabled: true };
    securityBefore = sails.config.security.csrf;
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
    sails.config.security.csrf = securityBefore;
    const admin = await User.findOne({ username: 'admin' });
    assert.ok(admin);
    adminId = admin.id;
    previousToken = admin.token;
    await firstValueFrom(UsersService.setUserKey(adminId, token));
  });
  beforeEach(async () => {
    await NamedQuery.destroy({ name });
    await request().post(prefix).set(auth()).send(database).expect(201);
  });
  after(async () => {
    await NamedQuery.destroy({ name });
    if (adminId) await User.update({ id: adminId }, { token: previousToken });
    sails.config.recordGraphql = originalConfig;
    sails.config.security.csrf = securityBefore;
  });
  it('requires server acknowledgement of the exact source replacement and stores only that source', async () => {
    for (const version of ['1.0', '2.0']) {
      const refused = await request()
        .put(`${prefix}/${name}`)
        .set({ ...auth(), 'X-ReDBox-Api-Version': version })
        .send(graphql)
        .expect(409);
      assert.equal(
        version === '1.0' ? refused.body.message : refused.body.errors[0].code,
        'NAMED_QUERY_CONFIRMATION_REQUIRED'
      );
    }
    const reviewed = await review(graphql);
    assert.deepEqual(reviewed.changes, ['source']);
    assert.equal(reviewed.usageComplete, false);
    assert.equal((await request().get(`${prefix}/${name}`).set(auth()).expect(200)).body.data.collectionName, 'user');
    const changed = { ...graphql, description: 'Edited after review' };
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', reviewed.confirmation)
      .send(changed)
      .expect(409);
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', reviewed.confirmation)
      .send(graphql)
      .expect(200);
    const saved = (await request().get(`${prefix}/${name}`).set(auth()).expect(200)).body.data;
    assert.deepEqual(saved.graphql, graphql.graphql);
    assert.equal(Object.hasOwn(saved, 'collectionName'), false);
    const row = await NamedQuery.findOne({ name });
    assert.ok(row);
    assert.equal(row.mongoQuery, null);
    assert.equal(row.queryParams, null);
    const reversed = await review(database);
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', reversed.confirmation)
      .send(database)
      .expect(200);
    assert.equal((await NamedQuery.findOne({ name }))?.graphql, null);
  });
  it('rejects stale saved-state acknowledgement and protects review with the session CSRF boundary', async () => {
    await session.post(`${prefix}/${name}/review-update`).set(auth()).send({ definition: graphql }).expect(403);
    const reviewed = await review(graphql);
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .send({ ...database, description: 'Concurrent saved edit' })
      .expect(200);
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', reviewed.confirmation)
      .send(graphql)
      .expect(409);
    assert.equal((await NamedQuery.findOne({ name }))?.source, null);
  });
  it('enforces parameter/default/required-mapping review and permits a valid nonlookup save', async () => {
    const replaced = await review(graphql);
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', replaced.confirmation)
      .send(graphql)
      .expect(200);
    const changed = structuredClone(graphql);
    changed.graphql.document = changed.graphql.document.replace('"rdmp"', '"other"');
    await request().put(`${prefix}/${name}`).set(auth()).send(changed).expect(409);
    const operationDefaultReview = await review(changed);
    assert.ok(operationDefaultReview.changes.includes('parameters'));
    // Existing acknowledgement cannot approve a different mapping/default change.
    delete changed.graphql.mappings.title;
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', operationDefaultReview.confirmation)
      .send(changed)
      .expect(409);
    const finalReview = await review(changed);
    assert.ok(finalReview.changes.includes('mappings'));
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', finalReview.confirmation)
      .send(changed)
      .expect(200);
    const described = (
      await session.post(`${prefix}/editor/describe`).set(editorAuth()).send({ definition: changed }).expect(200)
    ).body.data;
    assert.equal(described.valid, true);
    assert.equal(described.capabilities.lookup, false);
    assert.equal(described.parameters[0].hasOperationDefault, true);
    assert.equal(described.parameters[0].omissionSatisfied, true);
    await session.post(`${prefix}/editor/preview`).set(editorAuth()).send({ definition: changed }).expect(422);
  });
  it('requires exact confirmation for document-only loss of effective lookup mappings', async () => {
    const lookup = structuredClone(graphql);
    lookup.graphql.document = lookup.graphql.document.replace(
      'recordType: $search',
      'recordType: "rdmp", filters: [{field: "title", contains: $search}]'
    );
    const baseline = (
      await session.post(`${prefix}/editor/describe`).set(editorAuth()).send({ definition: lookup }).expect(200)
    ).body.data;
    assert.equal(baseline.valid, true);
    assert.equal(baseline.capabilities.lookup, true);
    const replaced = await review(lookup);
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', replaced.confirmation)
      .send(lookup)
      .expect(200);
    const changed = structuredClone(lookup);
    changed.graphql.document = changed.graphql.document.replace('oid workflowStep', 'oid workflowStep @skip(if: true)');
    const description = (
      await session.post(`${prefix}/editor/describe`).set(editorAuth()).send({ definition: changed }).expect(200)
    ).body.data;
    assert.equal(description.valid, true);
    assert.equal(description.capabilities.lookup, false);
    assert.ok(
      description.capabilities.diagnostics.some((diagnostic: { code: string }) => diagnostic.code === 'LOOKUP_MAPPING')
    );
    for (const version of ['1.0', '2.0']) {
      const refused = await request()
        .put(`${prefix}/${name}`)
        .set({ ...auth(), 'X-ReDBox-Api-Version': version })
        .send(changed)
        .expect(409);
      assert.equal(
        version === '1.0' ? refused.body.message : refused.body.errors[0].code,
        'NAMED_QUERY_CONFIRMATION_REQUIRED'
      );
    }
    assert.equal(JSON.parse((await NamedQuery.findOne({ name }))!.graphql!).document, lookup.graphql.document);
    const reviewed = await review(changed);
    assert.equal(reviewed.required, true);
    assert.deepEqual(reviewed.changes, ['document']);
    assert.equal(reviewed.usageComplete, false);
    const changedAgain = structuredClone(changed);
    changedAgain.graphql.document = changedAgain.graphql.document.replace('if: true', 'if: false');
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', reviewed.confirmation)
      .send(changedAgain)
      .expect(409);
    await request()
      .put(`${prefix}/${name}`)
      .set(auth())
      .set('X-ReDBox-Named-Query-Confirmation', reviewed.confirmation)
      .send(changed)
      .expect(200);
    assert.equal(JSON.parse((await NamedQuery.findOne({ name }))!.graphql!).document, changed.graphql.document);
  });
  it('applies ordinary saved database edits immediately and preserves name uniqueness/deletion', async () => {
    await request().post(prefix).set(auth()).send(database).expect(409);
    const before = (await request().get('/default/rdmp/api/report/namedQuery').set(auth()).query({ queryName: name }))
      .body.data;
    assert.ok(before.records.length > 0);
    const changed = { ...database, mongoQuery: { username: `absent_${name}` } };
    await request().put(`${prefix}/${name}`).set(auth()).send(changed).expect(200);
    const after = (
      await request().get('/default/rdmp/api/report/namedQuery').set(auth()).query({ queryName: name }).expect(200)
    ).body.data;
    assert.deepEqual(after.records, []);
    await request().delete(`${prefix}/${name}`).set(auth()).expect(200);
  });
  it('supplies actual read-schema assistance through named-query permissions without execution', async () => {
    await request().get(`${prefix}/editor/graphql-schema`).expect(403);
    const schema = (await request().get(`${prefix}/editor/graphql-schema`).set(auth()).expect(200)).body.data;
    assert.match(schema.sdl, /type Query/);
    assert.match(schema.sdl, /records\(/);
  });
});
