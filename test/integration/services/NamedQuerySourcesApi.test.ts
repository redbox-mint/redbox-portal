import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import supertest from 'supertest';
import { firstValueFrom } from 'rxjs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { recordGraphql } from '@researchdatabox/redbox-core';

/** Actual HTTP/policy/Waterline coverage with the deployed read schema. */
describe('named query source CRUD API', function () {
  const prefix = `/default/rdmp/api/named-query`;
  const name = `sources_${randomUUID().replace(/-/g, '')}`;
  const token = randomUUID();
  const database = { name, collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
  const graphql = {
    name,
    source: 'graphql',
    graphql: {
      document: 'query { records(recordType: "rdmp") { nodes { oid workflowStep } } }',
      variables: {},
      resultPath: ['records', 'nodes'],
      mappings: { oid: ['oid'], title: ['workflowStep'] },
    },
  };
  let originalConfig: typeof sails.config.recordGraphql;
  let editorSession: supertest.Agent;
  let csrf: string;
  let securityBefore: typeof sails.config.security.csrf;
  let adminId: string | undefined;
  let previousToken: string | null | undefined;
  let brand: ReturnType<typeof BrandingService.getBrand>;
  const request = () => supertest(sails.hooks.http.app);
  const editorAuth = () => ({ ...auth(), 'X-CSRF-Token': csrf });
  const auth = () => ({ Authorization: `Bearer ${token}`, 'X-ReDBox-Api-Version': '2.0' });
  before(async () => {
    originalConfig = sails.config.recordGraphql;
    sails.config.recordGraphql = { ...recordGraphql, enabled: true };
    brand = BrandingService.getBrand('default');
    securityBefore = sails.config.security.csrf;
    sails.config.security.csrf = true;
    editorSession = supertest.agent(sails.hooks.http.app);
    const loginToken = (await editorSession.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    await editorSession
      .post('/user/login_local')
      .set('X-Source', 'jsclient')
      .set('X-CSRF-Token', loginToken ?? '')
      .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
      .expect(200);
    csrf = (await editorSession.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    // Restore the harness setting: explicit editor routes still require this token,
    // while sessionless bearer CRUD keeps its established CSRF exemption.
    sails.config.security.csrf = securityBefore;
    const admin = await User.findOne({ username: 'admin' });
    assert.ok(admin);
    adminId = admin.id;
    previousToken = admin.token;
    await firstValueFrom(UsersService.setUserKey(adminId, token));
  });
  after(async () => {
    sails.config.recordGraphql = originalConfig;
    sails.config.security.csrf = securityBefore;
    if (brand) await NamedQuery.destroy({ key: `${brand.id}_${name}` });
    if (adminId) await User.update({ id: adminId }, { token: previousToken });
  });
  it('round trips legacy database and GraphQL CRUD with brand ownership and source replacement', async () => {
    await request().post(prefix).set(auth()).send(database).expect(201);
    const legacy = (await request().get(`${prefix}/${name}`).set(auth()).expect(200)).body.data;
    assert.equal(legacy.source, undefined);
    assert.deepEqual(legacy.mongoQuery, {});
    await request().put(`${prefix}/${name}`).set(auth()).send(legacy).expect(200);
    const review = (await editorSession.post(`${prefix}/${name}/review-update`).set(editorAuth()).send({ definition: graphql }).expect(200)).body.data;
    await request().put(`${prefix}/${name}`).set(auth()).set('X-ReDBox-Named-Query-Confirmation', review.confirmation).send(graphql).expect(200);
    const read = (await request().get(`${prefix}/${name}`).set(auth()).expect(200)).body.data;
    assert.equal(read.source, 'graphql');
    assert.deepEqual(read.graphql, graphql.graphql);
    assert.equal(Object.hasOwn(read, 'collectionName'), false);
    const row = await NamedQuery.findOne({ key: `${brand.id}_${name}` });
    assert.ok(row);
    assert.equal(String(row.branding), String(brand.id));
    await request().put(`${prefix}/${name}`).set(auth()).send(read).expect(200);
    const list = (await request().get(prefix).set(auth()).expect(200)).body.data;
    assert.ok(
      list.some((value: { name: string; source?: string }) => value.name === name && value.source === 'graphql')
    );
    await request().delete(`${prefix}/${name}`).set(auth()).expect(200);
    await request().get(`${prefix}/${name}`).set(auth()).expect(404);
  });
  it('returns 400 for unknown sources and contradictions without creating a record', async () => {
    for (const invalid of [
      { ...database, source: 'remote' },
      { ...database, graphql: graphql.graphql },
      { ...graphql, mongoQuery: {} },
    ]) {
      await request().post(prefix).set(auth()).send(invalid).expect(400);
    }
    assert.equal(await NamedQuery.findOne({ key: `${brand.id}_${name}` }), undefined);
  });
  it('blocks invalid definitions at CRUD and preview, keeps schema-drifted definitions readable and deletable', async () => {
    const invalid = { ...graphql, graphql: { ...graphql.graphql, document: '{ removedPrivateField }' } };
    const rejected = await request().post(prefix).set(auth()).send(invalid).expect(400);
    assert.ok(rejected.body.meta.diagnostics.some((d: { code: string }) => d.code === 'GRAPHQL_SCHEMA'));
    assert.equal(await NamedQuery.findOne({ key: `${brand.id}_${name}` }), undefined);
    const validation = (
      await editorSession.post(`${prefix}/editor/validate`).set(editorAuth()).send({ definition: invalid }).expect(200)
    ).body.data;
    assert.equal(validation.valid, false);
    assert.equal(validation.source, 'graphql');
    await request().post(prefix).set(auth()).send(graphql).expect(201);
    await request().put(`${prefix}/${name}`).set(auth()).send(invalid).expect(400);
    // Simulate schema drift without using the guarded authoring API.
    await NamedQuery.updateOne({ key: `${brand.id}_${name}` }).set({ graphql: JSON.stringify(invalid.graphql) });
    await request().get(`${prefix}/${name}`).set(auth()).expect(200);
    await request().get(prefix).set(auth()).expect(200);
    const description = (await request().get(`${prefix}/${name}/description`).set(auth()).expect(200)).body.data;
    assert.equal(description.valid, false);
    assert.ok(description.diagnostics.some((d: { code: string }) => d.code === 'GRAPHQL_SCHEMA'));
    const preview = await editorSession
      .post(`${prefix}/editor/preview`)
      .set(editorAuth())
      .send({ definition: invalid })
      .expect(422);
    assert.ok(
      preview.body.meta.diagnostics.some(
        (d: { code: string; line: number }) => d.code === 'GRAPHQL_SCHEMA' && d.line > 0
      )
    );
    await request().delete(`${prefix}/${name}`).set(auth()).expect(200);
  });
  it('describes valid non-lookup definitions and refuses incompatible first-page execution', async () => {
    const response = await editorSession
      .post(`${prefix}/editor/describe`)
      .set(editorAuth())
      .send({ definition: graphql })
      .expect(200);
    assert.equal(response.body.data.valid, true);
    assert.equal(response.body.data.capabilities.lookup, false);
    await editorSession.post(`${prefix}/editor/preview`).set(editorAuth()).send({ definition: graphql }).expect(422);
    await request().post(prefix).set(auth()).send(graphql).expect(201);
    await request().get('/default/rdmp/api/report/namedQuery').set(auth()).query({ queryName: name }).expect(422);
    await request().delete(`${prefix}/${name}`).set(auth()).expect(200);
  });
  it('returns a field-specific preview parameter diagnostic without reflecting the supplied value', async () => {
    const definition = {
      ...graphql,
      graphql: {
        ...graphql.graphql,
        document: 'query($count: Int) { records(recordType: "rdmp", first: $count) { nodes { oid workflowStep } } }',
        variables: { count: { ownership: 'consumer', parameter: 'count', inputType: 'Int', required: false } },
      },
    };
    const response = await editorSession
      .post(`${prefix}/editor/preview`)
      .set(editorAuth())
      .send({ definition, parameters: { count: 'PRIVATE_INVALID_COUNT' } })
      .expect(400);
    const diagnostic = response.body.meta.diagnostics[0];
    assert.equal(diagnostic.field, 'parameters.count');
    assert.equal(diagnostic.code, 'INVALID_GRAPHQL_PARAMETER');
    assert.match(diagnostic.reason, /declared input type/);
    assert.ok(!JSON.stringify(response.body).includes('PRIVATE_INVALID_COUNT'));
  });
  it('imports trusted startup files without caller or enabled endpoint, skips invalid neighbours and grants no execution', async () => {
    const root = await fs.mkdtemp(path.resolve('.tmp/t04-http-bootstrap-'));
    const bootstrapBefore = sails.config.bootstrap.bootstrapDataPath;
    const configBefore = sails.config.recordGraphql;
    try {
      await fs.mkdir(path.join(root, 'namedqueries'));
      await fs.writeFile(path.join(root, 'namedqueries', `${name}.json`), JSON.stringify(graphql));
      await fs.writeFile(
        path.join(root, 'namedqueries', `${name}_invalid.json`),
        JSON.stringify({ ...graphql, graphql: { ...graphql.graphql, document: '{ removedPrivateField }' } })
      );
      sails.config.bootstrap.bootstrapDataPath = root;
      sails.config.recordGraphql = { ...recordGraphql, enabled: false };
      await NamedQueryService.bootstrapData(brand);
      const imported = await NamedQueryService.getNamedQueryConfig(brand, name);
      assert.equal(imported?.source, 'graphql');
      assert.equal(await NamedQueryService.getNamedQueryConfig(brand, `${name}_invalid`), null);
      await assert.rejects(NamedQueryService.performNamedQueryFromConfig(imported, {}, brand, 0, 25));
      await fs.access(path.join(root, 'namedqueries', `${name}_invalid.json`));
      await NamedQueryService.bootstrapData(brand);
      assert.equal((await NamedQueryService.getNamedQueryConfig(brand, name))?.source, 'graphql');
    } finally {
      sails.config.bootstrap.bootstrapDataPath = bootstrapBefore;
      sails.config.recordGraphql = configBefore;
      await NamedQuery.destroy({ key: `${brand.id}_${name}` });
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
