import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import supertest from 'supertest';
import sinon from 'sinon';
import { firstValueFrom } from 'rxjs';
import { recordGraphql, SOLR_RECORD_GRID_FIELDS, migrateFormConfigVerify, ConstructFormConfigVisitor, ValidatorFormConfigVisitor } from '@researchdatabox/redbox-core';

/** Real Sails policies, bearer/session auth, Waterline/Mongo and Solr execution. */
describe('GraphQL named query execution over HTTP', function () {
  this.timeout(180_000);
  const suffix = randomUUID().replace(/-/g, '');
  const name = `execution_${suffix}`;
  const alias = `executionAlias_${suffix}`;
  const username = `named-viewer-${suffix}`;
  const token = `named-viewer-token-${suffix}`;
  const adminToken = `named-admin-token-${suffix}`;
  const base = '/default/rdmp';
  const main = `main-${suffix}`;
  const sparse = `sparse-${suffix}`;
  const ids = Array.from({ length: 28 }, (_, i) => `${main}-${String(i).padStart(3, '0')}`);
  const sparseIds = Array.from({ length: 201 }, (_, i) => `${sparse}-${String(i).padStart(3, '0')}`);
  const rules: string[] = [];
  let app;
  let brand;
  let foreign;
  let userId;
  let role;
  let admin;
  let previousToken;
  let originalConfig;
  let originalQueries;
  let solrUrl;
  let session: supertest.Agent;
  let csrf: string;
  let definition;
  const request = () => supertest(app);
  const auth = (bearer = token) => ({ Authorization: `Bearer ${bearer}`, 'X-ReDBox-Api-Version': '2.0' });
  const rest = (parameters: object = {}, bearer = token, root = base) =>
    request()
      .get(`${root}/api/report/namedQuery`)
      .set(auth(bearer))
      .query({ queryName: name, search: main, ...parameters });
  const vocab = (parameters: object = {}, bearer = token, root = base) =>
    request()
      .get(`${root}/query/vocab/${alias}`)
      .set(auth(bearer))
      .query({ search: main, ...parameters });
  const preview = (input = definition, parameters: object = { search: main }) =>
    session
      .post(`${base}/api/named-query/editor/preview`)
      .set({ ...auth(adminToken), 'X-CSRF-Token': csrf })
      .send({ definition: input, parameters });
  async function ruleFor(path: string, roleId = role.id, target = brand) {
    const rule = await PathRule.create({ path, role: roleId, branding: target.id, can_read: true }).fetch();
    rules.push(String(rule.id));
  }
  before(async () => {
    app = sails.hooks.http.app;
    brand = BrandingService.getDefault();
    originalConfig = sails.config.recordGraphql;
    originalQueries = sails.config.vocab.queries;
    sails.config.recordGraphql = { ...recordGraphql, enabled: true, cursorSecret: `named-query-secret-${suffix}` };
    admin = await User.findOne({ username: 'admin' });
    previousToken = admin.token;
    await firstValueFrom(UsersService.setUserKey(admin.id, adminToken));
    role = RolesService.getRole(brand, 'Researcher');
    const user = await firstValueFrom(
      UsersService.addLocalUser(username, 'Named query viewer', `${username}@example.edu.au`, 'RBTest123!')
    );
    userId = user.id;
    await firstValueFrom(UsersService.updateUserRoles(userId, [role.id]));
    await firstValueFrom(UsersService.setUserKey(userId, token));
    for (const portal of ['rdmp', 'alternate']) {
      await ruleFor(`/default/${portal}/api/report/namedQuery`);
      await ruleFor(`/default/${portal}/query/vocab/${alias}`);
    }
    foreign = await BrandingConfig.create({ name: `namedforeign${suffix}` }).fetch();
    await ruleFor(`/${foreign.name}/rdmp/api/report/namedQuery`, role.id, foreign);
    await ruleFor(`/${foreign.name}/rdmp/query/vocab/${alias}`, role.id, foreign);
    await firstValueFrom(BrandingService.loadAvailableBrands(null));
    await firstValueFrom(PathRulesService.loadRules());
    const options = sails.config.solr.cores.default.options;
    solrUrl = `${options.https ? 'https' : 'http'}://${options.host}:${options.port}/solr/${options.core}`;
    const live = (await axios.get(`${solrUrl}/schema`)).data.schema;
    const missing = SOLR_RECORD_GRID_FIELDS.filter(field => !live.fields.some(found => found.name === field.name));
    if (missing.length) await axios.post(`${solrUrl}/schema`, { 'add-field': missing });
    const created = await Record.createEach(
      [...ids, ...sparseIds].map((oid, index) => ({
        redboxOid: oid,
        metadata: { title: `Label ${index}`, private_note: `PRIVATE_DATA_${suffix}` },
        metaMetadata: {
          brandId: index === 27 ? foreign.id : brand.id,
          type: 'dataPublication',
          form: 'dataPublication-1.0-draft',
          searchCore: 'default',
        },
        workflow: { stage: 'draft' },
        authorization: {
          view: index === 26 ? [] : index < 25 ? [username, 'admin'] : [username],
          edit: [],
          viewRoles: index === 26 ? [role.name] : [],
          editRoles: [],
        },
      }))
    ).fetch();
    const search = sails.services.solrsearchservice;
    await axios.post(
      `${solrUrl}/update`,
      created.map(row => search.preIndex({ ...row, storage_id: row.id })),
      { params: { commit: true } }
    );
    // Stale permitted Solr hits with current denied stored ACLs must hit the
    // existing 200-candidate bound rather than produce an empty successful page.
    await Record.update({ redboxOid: sparseIds }).set({
      authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
    });
    definition = {
      name,
      source: 'graphql',
      graphql: {
        document: `query Lookup($search: String!, $first: Int = 50, $after: String = "bad-default") {
          matches: records(recordType:"dataPublication", workflowStages:["draft"], filters:[{field:"record:oid",contains:$search}], first:$first, after:$after) {
            items:nodes { id:oid label:workflowStep } more:hasNextPage cursor:endCursor
          }
        }`,
        variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String!', required: true } },
        resultPath: ['matches', 'items'],
        mappings: { oid: ['id'], title: ['label'], metadata: [] },
        lookup: {
          mode: 'firstPage',
          collectionPath: ['matches'],
          hasNextPagePath: ['matches', 'more'],
          endCursorPath: ['matches', 'cursor'],
          firstVariable: 'first',
          afterVariable: 'after',
          searchParameter: 'search',
        },
      },
    };
    await request().post(`${base}/api/named-query`).set(auth(adminToken)).send(definition).expect(201);
    sails.config.vocab.queries = {
      ...originalQueries,
      [alias]: {
        querySource: 'database',
        databaseQuery: { queryName: name },
        queryField: { property: 'search', type: 'text' },
      },
    };
    const securityBefore = sails.config.security.csrf;
    try {
      sails.config.security.csrf = true;
      session = supertest.agent(app);
      const loginCsrf = (await session.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
      await session
        .post('/user/login_local')
        .set('X-Source', 'jsclient')
        .set('X-CSRF-Token', loginCsrf ?? '')
        .send({ username: 'admin', password: 'rbadmin', branding: 'default', portal: 'rdmp' })
        .expect(200);
      csrf = (await session.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    } finally {
      sails.config.security.csrf = securityBefore;
    }
  });
  afterEach(() => sinon.restore());
  after(async () => {
    sails.config.recordGraphql = originalConfig;
    sails.config.vocab.queries = originalQueries;
    if (solrUrl)
      await axios.post(`${solrUrl}/update`, { delete: { query: `redbox_grid_oid:*${suffix}*` }, commit: {} });
    await Record.destroy({ redboxOid: [...ids, ...sparseIds] });
    await NamedQuery.destroy({ name });
    await RBReport.destroy({ name });
    if (userId) await User.destroy({ id: userId });
    if (admin) await User.updateOne({ id: admin.id }).set({ token: previousToken });
    if (rules.length) await PathRule.destroy({ id: rules });
    if (foreign) await BrandingConfig.destroy({ id: foreign.id });
    await firstValueFrom(BrandingService.loadAvailableBrands(null));
    await firstValueFrom(PathRulesService.loadRules());
  });
  it('executes saved REST/vocabulary and direct-config preview under real ordinary/admin users', async () => {
    const engine = sinon.spy(sails.services.recordgraphqlservice, 'execute');
    for (const route of [rest, vocab]) {
      const initial = await route();
      assert.equal(
        initial.status,
        200,
        engine.called ? JSON.stringify(await engine.lastCall.returnValue) : JSON.stringify(initial.body)
      );
      assert.equal(initial.body.data.records.length, 25);
      const ordinary = await route({ rows: 100 }).expect(200);
      const result = ordinary.body.data;
      assert.equal(result.source, 'graphql');
      assert.equal(result.records.length, 25);
      assert.deepEqual(result.summary, { numFound: null, start: 0, page: 1 });
      assert.deepEqual(result.pagination, { mode: 'firstPage', hasNextPage: true });
      assert.ok(result.records.every(row => ids.slice(0, 27).includes(row.oid)));
      const caller = engine.lastCall.args[0];
      assert.equal(caller.user.username, username);
      assert.ok(caller.roles.some(r => r.id === role.id));
      assert.equal(caller.brand.id, brand.id);
      assert.equal(caller.portal, 'rdmp');
      assert.match(ordinary.headers['cache-control'], /no-store|no-cache/);
      await route({ rows: 2 }, adminToken).expect(200);
      assert.equal(engine.lastCall.args[0].user.username, 'admin');
      assert.equal((await route({ search: ids[25] }).expect(200)).body.data.records.length, 1);
      assert.deepEqual((await route({ search: ids[25] }, adminToken).expect(200)).body.data.records, []);
    }
    const direct = await preview().expect(200);
    assert.equal(direct.body.data.source, 'graphql');
    assert.equal(direct.body.data.records.length, 25);
    assert.equal(direct.body.data.summary.numFound, null);
    assert.equal(engine.lastCall.args[0].user.username, 'admin');
  });
  it('keeps zero, smaller, 25 and more-than-25 pages honest and rejects offset/fractional bounds', async () => {
    for (const route of [rest, vocab]) {
      const empty = (await route({ search: `no-match-${suffix}` }).expect(200)).body.data;
      assert.deepEqual(empty.records, []);
      assert.equal(empty.pagination.hasNextPage, false);
      assert.equal(empty.summary.numFound, null);
      const one = (await route({ search: ids[0], rows: 25 }).expect(200)).body.data;
      assert.equal(one.records.length, 1);
      assert.equal(one.pagination.hasNextPage, false);
      const small = (await route({ rows: 3 }).expect(200)).body.data;
      assert.equal(small.records.length, 3);
      assert.equal(small.pagination.hasNextPage, true);
      for (const parameters of [{ start: 1 }, { rows: 1.5 }, { rows: 'NaN' }]) await route(parameters).expect(400);
    }
  });
  it('preserves database lookup pages of 50, smaller pages and empty searches over HTTP', async () => {
    const databaseName = `${name}_database`;
    const databaseAlias = `${alias}_database`;
    try {
      await request().post(`${base}/api/named-query`).set(auth(adminToken)).send({
        name: databaseName, source: 'database', collectionName: 'record',
        brandIdFieldPath: 'metaMetadata.brandId', mongoQuery: { redboxOid: { contains: sparse } },
        queryParams: {}, resultObjectMapping: {},
      }).expect(201);
      sails.config.vocab.queries[databaseAlias] = {
        querySource: 'database', databaseQuery: { queryName: databaseName },
        queryField: { property: 'search', type: 'text' },
      };
      for (const search of [sparse, '', '   ']) {
        const response = await request().get(`${base}/query/vocab/${databaseAlias}`).set(auth(adminToken))
          .query({ search, start: 0, rows: 50 }).expect(200);
        assert.equal(response.body.data.records.length, 50);
        assert.equal(response.body.data.summary.numFound, sparseIds.length);
        assert.equal(response.body.data.pagination, undefined);
      }
      const small = await request().get(`${base}/query/vocab/${databaseAlias}`).set(auth(adminToken))
        .query({ search: sparse, start: 0, rows: 3 }).expect(200);
      assert.equal(small.body.data.records.length, 3);
    } finally {
      delete sails.config.vocab.queries[databaseAlias];
      await NamedQuery.destroy({ name: databaseName });
    }
  });
  it('suppresses empty lookup execution and inspects JSON-authored aliases before form use', async () => {
    const engine = sinon.spy(sails.services.recordgraphqlservice, 'execute');
    const empty = (await vocab({ search: '' }).expect(200)).body.data;
    assert.deepEqual(empty.records, []);
    assert.equal(empty.summary.numFound, null);
    assert.equal(empty.pagination.hasNextPage, false);
    assert.equal(engine.callCount, 0);
    await vocab({ search: '', start: 1 }).expect(400);
    const config = JSON.parse(JSON.stringify({ name: 'lookup-json', componentDefinitions: [{ name: 'lookup',
      component: { class: 'TypeaheadInputComponent', config: { sourceType: 'namedQuery', queryId: alias, minChars: 0 } },
      model: { class: 'TypeaheadInputModel', config: {} } }] }));
    await migrateFormConfigVerify(config, sails.log, { branding: 'default', portal: 'rdmp' });
    const compatible = await FormsService.buildClientFormConfig(config, 'edit', ['Researcher'], {}, {}, 'default');
    assert.deepEqual(compatible.componentDefinitions[0].component.config.lookupDiagnostics, []);
    const before = sails.config.vocab.queries[alias];
    try {
      sails.config.vocab.queries[alias] = { ...before, queryField: { property: 'wrongSearch', type: 'text' } };
      await assert.rejects(
        migrateFormConfigVerify(config, sails.log, { branding: 'default', portal: 'rdmp' }),
        /Invalid named query lookup configuration: LOOKUP_SEARCH_BINDING/
      );
      const invalid = await FormsService.buildClientFormConfig(config, 'edit', ['Researcher'], {}, {}, 'default');
      assert.equal(invalid.componentDefinitions[0].component.config.lookupDiagnostics[0].code, 'LOOKUP_SEARCH_BINDING');
      // The record validator must not block saves because a lookup alias drifted.
      const form = await new ConstructFormConfigVisitor(sails.log).start({ data: config, formMode: 'edit' });
      form.componentDefinitions[0].component.config.lookupDiagnostics = invalid.componentDefinitions[0].component.config.lookupDiagnostics;
      assert.deepEqual(await new ValidatorFormConfigVisitor(sails.log).start({ form }), []);
      await vocab().expect(422);
      assert.equal(engine.callCount, 0);
    } finally { sails.config.vocab.queries[alias] = before; }
  });
  it('proves exhaustion at exactly 25 visible matches without inventing a total', async () => {
    const revoked = await Record.find({ redboxOid: [ids[25], ids[26]] });
    try {
      await Record.update({ redboxOid: [ids[25], ids[26]] }).set({ authorization: { view: [], edit: [], viewRoles: [], editRoles: [] } });
      const result = (await vocab().expect(200)).body.data;
      assert.equal(result.records.length, 25);
      assert.equal(result.pagination.hasNextPage, false);
      assert.equal(result.summary.numFound, null);
    } finally { for (const record of revoked) await Record.update({ redboxOid: record.redboxOid }).set({ authorization: record.authorization }); }
  });
  it('rejects anonymous/invalid tokens and cannot override trusted identity/scope with REST parameters', async () => {
    for (const path of [`${base}/api/report/namedQuery?queryName=${name}`, `${base}/query/vocab/${alias}`]) {
      const result = await request()
        .get(path)
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json');
      assert.ok([401, 403].includes(result.status), JSON.stringify(result.body));
      await request()
        .get(path)
        .set(auth('invalid'))
        .set('Accept', 'application/json')
        .set('Content-Type', 'application/json')
        .expect(403);
    }
    for (const key of ['user', 'roles', 'brand', 'portal']) await rest({ [key]: 'admin' }).expect(400);
  });
  it('propagates alternate portal scope and separates foreign brand query/schema caches', async () => {
    const schema = sinon.spy(sails.services.recordgraphqlservice, 'getReadSchema');
    const engine = sinon.spy(sails.services.recordgraphqlservice, 'execute');
    await rest().expect(200);
    await rest({}, token, '/default/alternate').expect(200);
    assert.equal(engine.lastCall.args[0].portal, 'alternate');
    assert.equal(schema.lastCall.args[0].portal, 'alternate');
    await vocab({}, token, '/default/alternate').expect(200);
    assert.equal(engine.lastCall.args[0].portal, 'alternate');
    const foreignRoot = `/${foreign.name}/rdmp`;
    await rest({}, token, foreignRoot).expect(400); // no cross-brand name lookup
    // Invalid imported definition in a brand with no configured read variants;
    // a warm default-brand schema must not validate/execute it in that brand.
    await NamedQuery.create({
      name,
      source: 'graphql',
      branding: foreign.id,
      graphql: JSON.stringify(definition.graphql),
    });
    const rejected = await rest({}, token, foreignRoot).expect(422);
    assert.ok(!JSON.stringify(rejected.body).includes(main));
    assert.equal(schema.lastCall.args[0].brand.id, foreign.id);
    assert.equal(engine.lastCall.args[0].brand.id, brand.id);
    await rest().expect(200);
  });
  it('uses current record/role ACLs on every call and never exposes foreign-brand records', async () => {
    const exact = (await rest({ search: ids[26] }).expect(200)).body.data;
    assert.equal(exact.records[0].oid, ids[26]); // role-only permission, no username grant
    await Record.updateOne({ redboxOid: ids[26] }).set({
      authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
    });
    for (const route of [rest, vocab]) {
      assert.deepEqual((await route({ search: ids[26] }).expect(200)).body.data.records, []);
      assert.deepEqual((await route({ search: ids[27] }).expect(200)).body.data.records, []);
    }
    await Record.updateOne({ redboxOid: ids[25] }).set({
      authorization: { view: [], edit: [], viewRoles: [], editRoles: [] },
    });
    const exactly25 = (await rest({ rows: 25 }).expect(200)).body.data;
    assert.equal(exactly25.records.length, 25);
    assert.equal(exactly25.pagination.hasNextPage, false);
    assert.equal(exactly25.summary.numFound, null);
    await rest({ search: ids[26] }, adminToken).expect(200);
  });
  it('fails context omission at the service boundary reached through real HTTP', async () => {
    const service = sails.services.namedqueryservice;
    const original = service.performNamedQueryFromConfig;
    const execute = sinon.spy(sails.services.recordgraphqlservice, 'execute');
    // Fault injection models a hook/adapter accidentally dropping trusted context.
    sinon
      .stub(service, 'performNamedQueryFromConfig')
      .callsFake((config, params, scope, start, rows, user, budget) =>
        original(config, params, scope, start, rows, user, budget)
      );
    await rest().expect(401);
    await vocab().expect(401);
    assert.equal(execute.callCount, 0);
    const loaded = await NamedQueryService.getNamedQueryConfig(brand, name);
    await assert.rejects(
      NamedQueryService.performNamedQueryFromConfig(loaded, { search: main }, brand, 0, 25, { username: 'admin' })
    );
  });
  it('rejects private fields, partial GraphQL data and scan failures with safe errors on saved/direct paths', async () => {
    const actual = await NamedQueryService.getNamedQueryConfig(brand, name);
    assert.equal(actual.source, 'graphql');
    const caller = { brand, portal: 'rdmp', user: { ...admin, roles: brand.roles }, roles: brand.roles };
    const sdl = await sails.services.recordgraphqlservice.describeReadSchema(caller);
    const type = /type (M_dataPublication_draft_[a-f0-9]+)/.exec(sdl)?.[1];
    assert.ok(type);
    const privateDefinition = structuredClone(definition);
    privateDefinition.graphql.document = privateDefinition.graphql.document.replace(
      'id:oid label:workflowStep',
      `id:oid label:workflowStep metadata { ... on ${type} { private_note } }`
    );
    await preview(privateDefinition).expect(422);
    await NamedQuery.updateOne({ key: `${brand.id}_${name}` }).set({
      graphql: JSON.stringify(privateDefinition.graphql),
    });
    const denied = await rest().expect(422);
    assert.ok(!JSON.stringify(denied.body).includes('private_note'));
    assert.ok(!JSON.stringify(denied.body).includes(`PRIVATE_DATA_${suffix}`));
    // Keep the frontend's misconfiguration classification tied to the actual
    // versioned vocabulary error bodies for saved-definition/schema drift.
    for (const version of ['1.0', '2.0']) {
      const invalidLookup = await vocab().set('X-ReDBox-Api-Version', version).expect(422);
      assert.deepEqual(
        invalidLookup.body,
        version === '1.0'
          ? { message: 'INVALID_GRAPHQL_NAMED_QUERY', details: '' }
          : { errors: [{ code: 'INVALID_GRAPHQL_NAMED_QUERY', title: 'INVALID_GRAPHQL_NAMED_QUERY' }], meta: {} }
      );
    }
    await NamedQuery.updateOne({ key: `${brand.id}_${name}` }).set({ graphql: JSON.stringify(definition.graphql) });
    const partial = structuredClone(definition);
    partial.graphql.document = partial.graphql.document.replace(/}\s*$/, ` denied:record(oid:"${ids[27]}"){oid} }`);
    const failed = await preview(partial).expect(422); // admin still cannot read foreign brand
    assert.ok(!failed.body.data);
    for (const route of [rest, vocab]) {
      const bounded = await route({ search: sparse }).expect(422);
      assert.ok(JSON.stringify(bounded.body).includes('COLLECTION_LIMIT'));
      assert.ok(!bounded.body.data);
    }
  });
  it('rejects unversioned reports and retains the first-page accumulation guard', async () => {
    const report = {
      name,
      title: 'Versioned GraphQL report',
      reportSource: 'database',
      databaseQuery: { queryName: name },
      columns: [],
      filter: [],
    };
    const execute = sinon.spy(sails.services.recordgraphqlservice, 'execute');
    await request().post(`${base}/api/report-config`).set(auth(adminToken)).send(report).expect(409);
    await RBReport.create({ ...report, branding: brand.id }); // legacy/imported report
    for (const path of ['admin/getReportResults', 'admin/downloadReportCSV']) {
      const response = await session.get(`${base}/${path}`).set(auth(adminToken)).query({ name }).expect(409);
      assert.equal(response.body.errors[0].code, 'REPORT_QUERY_CHANGED');
    }
    const saved = await NamedQueryService.getNamedQueryConfig(brand, name);
    await assert.rejects(
      NamedQueryService.performNamedQueryFromConfigResults(saved, {}, brand, name),
      /database\/report adapters do not support/
    );
    assert.equal(execute.callCount, 0);
  });
  it('runs cursor report pages and complete CSV as an authorized ordinary viewer over HTTP',async()=>{
    const description=await session.get(`${base}/api/report-config/named-query/${name}/description`).set(auth(adminToken)).expect(200);
    const version=description.body.data.queryVersion;assert.equal(typeof version,'string');
    const report={name,title:'GraphQL HTTP report fixture',reportSource:'database',databaseQuery:{queryName:name,queryVersion:version},solrQuery:null,filter:[{type:'text',paramName:'search',message:'Search',property:''}],columns:[{label:'OID',property:'oid'}]};
    await request().put(`${base}/api/report-config/${name}`).set(auth(adminToken)).send(report).expect(200);
    await session.post(`${base}/api/report-config/preview`).set(auth(adminToken)).query({search:main}).send(report).expect(403);
    const previewed=await session.post(`${base}/api/report-config/preview`).set({...auth(adminToken),'X-CSRF-Token':csrf}).query({search:main}).send(report).expect(200);
    assert.equal(previewed.body.data.total,null);assert.equal(previewed.body.data.records.length,25);
    await Record.updateOne({redboxOid:ids[25]}).set({authorization:{view:[username],edit:[],viewRoles:[],editRoles:[]}});
    for(const path of ['admin/getReport','admin/getReportResults','admin/downloadReportCSV'])await ruleFor(`${base}/${path}`);
    await firstValueFrom(PathRulesService.loadRules());
    const viewer=supertest.agent(app);const loginCsrf=(await viewer.get('/csrfToken?branding=default&portal=rdmp')).body._csrf;
    await viewer.post('/user/login_local').set({'X-Source':'jsclient','X-CSRF-Token':loginCsrf}).send({username,password:'RBTest123!',branding:'default',portal:'rdmp'}).expect(200);
    const engine=sinon.spy(sails.services.recordgraphqlservice,'execute');
    const first=await viewer.get(`${base}/admin/getReportResults`).set('X-Source','jsclient').query({name,search:main,rows:25}).expect(200);
    assert.equal(first.body.total,null);assert.equal(first.body.records.length,25);assert.equal(first.body.pagination.hasNextPage,true);
    assert.equal(engine.lastCall.args[0].user.username,username);
    const cursor=first.body.pagination.nextCursor;
    const second=await viewer.get(`${base}/admin/getReportResults`).set('X-Source','jsclient').query({name,search:main,rows:25,cursor}).expect(200);
    assert.deepEqual(second.body.records.map(row=>row.oid),[ids[25]]);assert.equal(second.body.pagination.start,25);
    for(const candidate of [cursor.slice(0,20)+'!'+cursor.slice(21),cursor+'='])await viewer.get(`${base}/admin/getReportResults`).set('X-Source','jsclient').query({name,search:main,rows:25,cursor:candidate}).expect(400);
    await session.get(`${base}/admin/getReportResults`).set(auth(adminToken)).query({name,search:main,rows:25,cursor}).expect(400);
    const csv=await viewer.get(`${base}/admin/downloadReportCSV`).set('X-Source','jsclient').query({name,search:main}).expect(200);
    assert.match(csv.headers['content-type'],/text\/csv/);assert.equal(csv.text.trim().split('\n').length,27);assert.ok(csv.text.includes(ids[25]));assert.ok(!csv.text.includes(ids[26]));assert.ok(!csv.text.includes(ids[27]));
    const previous=sails.config.recordGraphql.reportExport;
    try {sails.config.recordGraphql.reportExport={maxRows:25,maxPages:400,timeoutMs:30000,maxBytes:16777216};
      const limited=await viewer.get(`${base}/admin/downloadReportCSV`).set('X-Source','jsclient').query({name,search:main}).expect(413);
      assert.equal(limited.body.message,'REPORT_EXPORT_ROW_LIMIT');assert.ok(!limited.headers['content-disposition']);
    } finally {sails.config.recordGraphql.reportExport=previous;}
    const changed={...definition.graphql,document:definition.graphql.document+' '};
    await NamedQuery.updateOne({key:`${brand.id}_${name}`}).set({graphql:JSON.stringify(changed)});
    try {await viewer.get(`${base}/admin/getReportResults`).set('X-Source','jsclient').query({name,search:main}).expect(409);}finally{await NamedQuery.updateOne({key:`${brand.id}_${name}`}).set({graphql:JSON.stringify(definition.graphql)});}
    const anonymous=await request().get(`${base}/admin/getReportResults`).set('Accept','application/json').query({name,search:main}).expect(302);
    assert.match(anonymous.headers.location,/user\/login/);
  });

});
