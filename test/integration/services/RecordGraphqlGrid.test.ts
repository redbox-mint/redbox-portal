import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';
import { recordGraphql } from '@researchdatabox/redbox-core';

describe('GraphQL grid over Sails and Mongo', function () {
  this.timeout(180_000);
  const suffix = randomUUID().replace(/-/g, '');
  const path = '/default/rdmp/api/graphql';
  const username = `grid-${suffix}`;
  const token = `grid-token-${suffix}`;
  const oids = ['a', 'hidden-b', 'c', 'hidden-d', 'e', 'f', 'foreign', 'unregistered-stage', 'published'].map(
    key => `grid-${key}-${suffix}`
  );
  let app;
  let configBefore;
  let formBefore;
  let formId;
  let userId;
  let ruleId;
  let brand;
  const prefixRows: Array<{ oid: string; title: unknown; visible: boolean }> = [];
  const unicodeCases: Array<[string, string[], string[]]> = [
    ['ΟΣΑ', ['ΟΣ'], ['οσ', 'ος']],
    ['UON-ΟΣΑ', ['uon-ΟΣ'], ['uon-οσ', 'uon-ος']],
    ['École', ['É'], ['é', 'E\u0301']],
    ['İSTANBUL', ['İs'], ['is', 'i\u0307']],
    ['ıSTANBUL', ['ıs'], ['is', 'İ']],
    ['ßeta', ['ßE'], ['ss', 'ẞ']],
    ['ẞeta', ['ẞE'], ['ss', 'ß']],
    ['SSeta', ['ss', 'SS'], ['ß', 'ẞ']],
    ['E\u0301cole', ['e\u0301'], ['é', 'É']],
    ['ＡBc', ['Ａb'], ['ａ', 'Ab']],
    ['A—B\u00a0C', ['a—b\u00a0'], ['a-b', 'a—b ']],
    ['\t\n\0\x7fAb', ['\t\n\0\x7fa'], [' Ab']],
    ['😀Ab', ['😀a'], ['😁']],
  ];
  const literalPrefixes = ['*', '?', '\\', '"', '[brackets]', ':', '/', ' ', 'OR *:*', '{!prefix f=id v=*}'];
  const prefixPage = (p: unknown, first = 25, extra: object[] = []) =>
    send(page, {
      first,
      filters: [{ field: 'metadata:/title', iprefix: p }, ...extra],
    });
  function prefixRow(title: unknown, visible = true) {
    const row = { oid: `grid-prefix-${String(prefixRows.length).padStart(3, '0')}-${suffix}`, title, visible };
    prefixRows.push(row);
    return row;
  }
  const unicodeRows = unicodeCases.map(([stored]) => prefixRow(stored));
  const literalRows = literalPrefixes.map(p => prefixRow(`${p}Tail`));
  const boundaryRows = Array.from({ length: 26 }, (_, i) =>
    prefixRow(`Boundary-${i < 25 ? 'Exact25' : 'Other'}-${suffix}`)
  );
  prefixRow(`Boundary-Exact25-${suffix}`, false);
  const sparsePrefix = `Sparse-${suffix}`;
  for (let i = 0; i < 201; i++) prefixRow(sparsePrefix, false);
  const emptyRows = ['', null, 42, { nested: 'text' }].map(value => prefixRow(value));
  const send = (query: string, variables: object = {}, bearer = token) =>
    supertest(app)
      .post(path)
      .set('Authorization', `Bearer ${bearer}`)
      .set('Accept', 'application/graphql-response+json')
      .send({ query, variables });
  const catalogue = `query { recordFields(recordType:"dataPublication",workflowStages:["draft"],ids:["metadata:/title","metadata:/amount","metadata:/active","metadata:/eventDate"]) { revision fields { id label labelKey scalarType filterable operators sortable selections { selection responsePath } } } }`;
  const page = `query($after:String,$filters:[RecordFilterInput!],$sort:[RecordSortInput!],$first:Int=2) { records(recordType:"dataPublication", workflowStages:["draft"], filters:$filters,sort:$sort,first:$first,after:$after) { nodes { oid workflowStep } hasNextPage endCursor } }`;
  const onlyOurRows = [{ field: 'metadata:/title', eq: { text: `Equal-${suffix}` } }];

  before(async () => {
    app = sails.hooks.http.app;
    brand = BrandingService.getDefault();
    configBefore = sails.config.recordGraphql;
    sails.config.recordGraphql = { ...recordGraphql, enabled: true, cursorSecret: `grid-integration-secret-${suffix}` };
    const form = await firstValueFrom(FormsService.getFormByName('dataPublication-1.0-draft', true, brand.id));
    assert.ok(form?.configuration);
    formBefore = form.configuration;
    formId = form.id;
    await Form.updateOne({ id: formId }).set({
      configuration: {
        ...form.configuration,
        componentDefinitions: [
          ...form.configuration.componentDefinitions,
          {
            name: 'details',
            component: {
              class: 'GroupComponent',
              config: {
                componentDefinitions: [
                  {
                    name: 'note',
                    component: { class: 'SimpleInputComponent' },
                    model: { class: 'SimpleInputModel', config: {} },
                  },
                ],
              },
            },
          },
          {
            name: 'people',
            component: {
              class: 'RepeatableComponent',
              config: {
                elementTemplate: {
                  name: 'person',
                  component: {
                    class: 'GroupComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'name',
                          component: { class: 'SimpleInputComponent' },
                          model: { class: 'SimpleInputModel', config: {} },
                        },
                      ],
                    },
                  },
                },
              },
            },
            model: { class: 'RepeatableModel', config: {} },
          },
          {
            name: 'count',
            component: { class: 'SimpleInputComponent', config: { type: 'number' } },
            model: { class: 'SimpleInputModel', config: { validators: [{ class: 'integer' }] } },
          },
          {
            name: 'amount',
            component: { class: 'SimpleInputComponent', config: { type: 'number', label: 'Amount' } },
            model: { class: 'SimpleInputModel', config: {} },
          },
          {
            name: 'active',
            component: { class: 'CheckboxInputComponent', config: { booleanMode: true } },
            model: { class: 'CheckboxInputModel', config: {} },
          },
          {
            name: 'eventDate',
            component: { class: 'DateInputComponent' },
            model: { class: 'DateInputModel', config: {} },
          },
        ],
      },
    });
    const role = RolesService.getRole(brand, 'Researcher');
    const user = await firstValueFrom(
      UsersService.addLocalUser(username, 'Grid viewer', `${username}@example.edu.au`, 'RBTest123!')
    );
    userId = user.id;
    await firstValueFrom(UsersService.updateUserRoles(userId, [role.id]));
    await firstValueFrom(UsersService.setUserKey(userId, token));
    const rule = await PathRule.create({ path, role: role.id, branding: brand.id, can_read: true }).fetch();
    ruleId = rule.id;
    await firstValueFrom(PathRulesService.loadRules());
    for (const [index, oid] of oids.entries()) {
      await Record.create({
        redboxOid: oid,
        metadata: {
          title: `Equal-${suffix}`,
          amount: index === 5 ? null : index,
          active: index % 2 === 0,
          details: { note: 'nested-value' },
          people: [{ name: 'One' }, { name: 'Two' }],
          eventDate: `2026-01-0${index + 1}T00:00:00.000Z`,
        },
        metaMetadata: {
          brandId: index === 6 ? 'foreign-brand' : brand.id,
          type: 'dataPublication',
          form: index === 8 ? 'dataPublication-1.0-published' : 'dataPublication-1.0-draft',
          searchCore: 'default',
        },
        workflow: { stage: index === 7 ? `unregistered-${suffix}` : index === 8 ? 'published' : 'draft' },
        authorization: { view: index === 1 || index === 3 ? [] : [username], edit: [], viewRoles: [], editRoles: [] },
      });
    }
    await Record.createEach(
      prefixRows.map(row => ({
        redboxOid: row.oid,
        metadata: { title: row.title },
        metaMetadata: {
          brandId: brand.id,
          type: 'dataPublication',
          form: 'dataPublication-1.0-draft',
          searchCore: 'default',
        },
        workflow: { stage: 'draft' },
        authorization: { view: row.visible ? [username] : [], edit: [], viewRoles: [], editRoles: [] },
      }))
    ).fetch();
  });
  after(async () => {
    await Record.destroy({ redboxOid: [...oids, ...prefixRows.map(row => row.oid)] });
    if (formId && formBefore) await Form.updateOne({ id: formId }).set({ configuration: formBefore });
    if (userId) await User.destroy({ id: userId });
    if (ruleId) await PathRule.destroy({ id: ruleId });
    if (configBefore !== undefined) sails.config.recordGraphql = configBefore;
    await firstValueFrom(PathRulesService.loadRules());
  });
  it('uses real bearer authentication and route rules for both collection and catalogue', async () => {
    for (const query of [catalogue, '{ records(recordType:"dataPublication"){hasNextPage} }']) {
      assert.equal((await send(query, {}, 'invalid')).status, 401);
      const response = await send(query);
      assert.equal(response.status, 200, JSON.stringify(response.body));
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
    }
  });
  it('requires route read permission for both discovery and collections', async () => {
    await PathRule.updateOne({ id: ruleId }).set({ can_read: false });
    await firstValueFrom(PathRulesService.loadRules());
    try {
      for (const query of [catalogue, page]) {
        const response = await send(query);
        assert.equal(response.status, 403, JSON.stringify(response.body));
        assert.equal(response.body.data, undefined);
      }
    } finally {
      await PathRule.updateOne({ id: ruleId }).set({ can_read: true });
      await firstValueFrom(PathRulesService.loadRules());
    }
  });
  it('discovers contract capabilities and executes server-generated metadata selections', async () => {
    const response = await send(catalogue);
    assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
    const entries = response.body.data.recordFields.fields;
    const title = entries.find(field => field.id === 'metadata:/title');
    assert.equal(title.sortable, true);
    assert.equal(title.labelKey, '@title');
    assert.ok(title.operators.includes('EQ'));
    assert.ok(title.operators.includes('IPREFIX'));
    assert.ok(!entries.find(field => field.id === 'metadata:/amount').operators.includes('IPREFIX'));
    assert.equal(entries.find(field => field.id === 'metadata:/eventDate').scalarType, 'DATETIME');
    const result = await send(
      `query($filters:[RecordFilterInput!]) { records(recordType:"dataPublication",workflowStages:["draft"],filters:$filters,first:1) { nodes { oid metadata { ${title.selections[0].selection} } } } }`,
      { filters: onlyOurRows }
    );
    assert.equal(result.body.errors, undefined, JSON.stringify(result.body));
    const value = title.selections[0].responsePath.reduce(
      (value, key) => value[key],
      result.body.data.records.nodes[0]
    );
    assert.equal(value, `Equal-${suffix}`);
  });
  it('executes ASCII-insensitive prefix rather than substring and retains current caller visibility', async () => {
    for (const p of [`EQUAL-${suffix}`, `eQuAl-${suffix}`, 'e']) {
      const result = await prefixPage(p, 50);
      assert.equal(result.body.errors, undefined, JSON.stringify(result.body));
      const ids = result.body.data.records.nodes.map(row => row.oid);
      assert.ok(ids.includes(oids[0]) && ids.includes(oids[2]));
      for (const excluded of [oids[1], oids[3], oids[6], oids[7], oids[8]]) assert.ok(!ids.includes(excluded));
    }
    const substring = await prefixPage(`qual-${suffix}`);
    assert.equal(substring.body.errors, undefined, JSON.stringify(substring.body));
    assert.deepEqual(substring.body.data.records.nodes, []);
    // A permission change takes effect without indexing.
    const authorization = (await RecordsService.getMeta(oids[0])).authorization;
    await Record.updateOne({ redboxOid: oids[0] }).set({ authorization: { ...authorization, view: [] } });
    try {
      const result = await prefixPage(`equal-${suffix}`, 50);
      assert.equal(result.body.errors, undefined, JSON.stringify(result.body));
      assert.ok(!result.body.data.records.nodes.some(row => row.oid === oids[0]));
    } finally {
      await Record.updateOne({ redboxOid: oids[0] }).set({ authorization });
    }
  });
  it('matches positive literal wildcard, quote, backslash, bracket and search-syntax prefixes in real Mongo', async () => {
    for (const [i, p] of literalPrefixes.entries()) {
      const response = await prefixPage(p, 50);
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      assert.deepEqual(
        response.body.data.records.nodes.map(row => row.oid),
        [literalRows[i].oid],
        JSON.stringify(p)
      );
    }
    for (const p of [`Equal-${suffix}*`, `Equal-${suffix}?`, '" OR *:*', '{!lucene}*:*']) {
      const response = await prefixPage(p);
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      assert.deepEqual(response.body.data.records.nodes, []);
    }
  });
  it('preserves exact non-ASCII case, combining sequences, supplementary characters and controls', async () => {
    for (const [i, [, matches, misses]] of unicodeCases.entries()) {
      const scope = [{ field: 'record:oid', eq: { text: unicodeRows[i].oid } }];
      for (const p of [...matches, ...misses]) {
        const response = await prefixPage(p, 25, scope);
        assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
        assert.deepEqual(
          response.body.data.records.nodes.map(row => row.oid),
          matches.includes(p) ? [unicodeRows[i].oid] : [],
          JSON.stringify(p)
        );
      }
    }
    for (const row of emptyRows) {
      const response = await prefixPage('a', 25, [{ field: 'record:oid', eq: { text: row.oid } }]);
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      assert.deepEqual(response.body.data.records.nodes, []);
    }
  });
  it('proves 25 versus 26 visible prefix matches and excludes sparse inaccessible records in Mongo', async () => {
    const exact = await prefixPage(`boundary-exact25-${suffix}`);
    assert.equal(exact.body.errors, undefined, JSON.stringify(exact.body));
    assert.deepEqual(
      exact.body.data.records.nodes.map(row => row.oid),
      boundaryRows.slice(0, 25).map(row => row.oid)
    );
    assert.equal(exact.body.data.records.hasNextPage, false);
    assert.equal(exact.body.data.records.endCursor, null);
    const more = await prefixPage('boundary-');
    assert.equal(more.body.errors, undefined, JSON.stringify(more.body));
    assert.equal(more.body.data.records.nodes.length, 25);
    assert.equal(more.body.data.records.hasNextPage, true);
    assert.ok(more.body.data.records.endCursor);
    assert.ok(!JSON.stringify(more.body).includes('total'));
    const sparse = await prefixPage(sparsePrefix);
    assert.equal(sparse.body.errors, undefined, JSON.stringify(sparse.body));
    assert.deepEqual(sparse.body.data.records.nodes, []);
    assert.equal(sparse.body.data.records.hasNextPage, false);
  });
  it('rejects empty, malformed and oversized query prefixes and unsupported bindings through HTTP', async () => {
    for (const p of ['', '\ud800', '\udfff', 'x\ud800y', 'a'.repeat(257), 'é'.repeat(129), null]) {
      const response = await prefixPage(p);
      assert.equal(response.body.errors?.[0].extensions.code, 'INVALID_FILTER_VALUE', JSON.stringify(response.body));
      assert.equal(response.body.data.records, null);
    }
    for (const p of ['a'.repeat(256), 'é'.repeat(128), '😀'.repeat(64)]) {
      const response = await prefixPage(p);
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      assert.deepEqual(response.body.data.records.nodes, []);
    }
    for (const field of ['metadata:/amount', 'metadata:/active', 'metadata:/eventDate']) {
      const response = await send(page, { filters: [{ field, iprefix: 'a' }] });
      assert.equal(response.body.errors?.[0].extensions.code, 'UNSUPPORTED_FILTER', JSON.stringify(response.body));
      assert.equal(response.body.data.records, null);
    }
  });
  it('fills stable pages across inaccessible equal-sort hits without exposing counts', async () => {
    const variables = { filters: onlyOurRows, sort: [{ field: 'metadata:/title', direction: 'ASC' }] };
    const first = await send(page, variables);
    assert.equal(first.body.errors, undefined, JSON.stringify(first.body));
    assert.equal(first.body.data.records.nodes.length, 2);
    assert.equal(first.body.data.records.hasNextPage, true);
    assert.deepEqual((await send(page, variables)).body.data.records.nodes, first.body.data.records.nodes);
    const second = await send(page, { ...variables, after: first.body.data.records.endCursor });
    assert.equal(second.body.errors, undefined, JSON.stringify(second.body));
    const rows = [...first.body.data.records.nodes, ...second.body.data.records.nodes];
    assert.deepEqual(rows.map(row => row.oid).sort(), [oids[0], oids[2], oids[4], oids[5]].sort());
    assert.equal(second.body.data.records.hasNextPage, false);
    assert.equal(second.body.data.records.endCursor, null);
    assert.ok(!JSON.stringify(first.body).includes('total'));
    assert.ok(!JSON.stringify(rows).includes(oids[1]));
  });
  it('executes typed numeric, date and boolean filters in Mongo with explicit sorting', async () => {
    const result = await send(page, {
      filters: [
        ...onlyOurRows,
        { field: 'metadata:/amount', between: { from: { number: 2 }, to: { number: 5 } } },
        { field: 'metadata:/active', eq: { boolean: true } },
        { field: 'metadata:/eventDate', gt: { dateTime: '2026-01-02T12:00:00+12:00' } },
      ],
      sort: [{ field: 'metadata:/amount', direction: 'DESC' }],
      first: 50,
    });
    assert.equal(result.body.errors, undefined, JSON.stringify(result.body));
    assert.deepEqual(
      result.body.data.records.nodes.map(row => row.oid),
      [oids[4], oids[2]]
    );
  });
  it('executes literal contains, IN, missing-value and exclusive range semantics', async () => {
    for (const filter of [
      { field: 'metadata:/title', contains: suffix.slice(0, 10) },
      { field: 'metadata:/title', in: [{ text: `Equal-${suffix}` }, { text: 'other' }] },
    ]) {
      const response = await send(page, { filters: [...onlyOurRows, filter], first: 50 });
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      assert.equal(response.body.data.records.nodes.length, 4);
    }
    const missing = await send(page, { filters: [...onlyOurRows, { field: 'metadata:/amount', exists: false }] });
    assert.equal(missing.body.errors, undefined, JSON.stringify(missing.body));
    assert.deepEqual(
      missing.body.data.records.nodes.map(row => row.oid),
      [oids[5]]
    );
    const range = await send(page, {
      filters: [
        ...onlyOurRows,
        { field: 'metadata:/amount', gt: { number: 0 } },
        { field: 'metadata:/amount', lt: { number: 4 } },
      ],
    });
    assert.equal(range.body.errors, undefined, JSON.stringify(range.body));
    assert.deepEqual(
      range.body.data.records.nodes.map(row => row.oid),
      [oids[2]]
    );
  });
  it('limits omitted and empty stage scopes to configured stages in Mongo and storage', async () => {
    const query = `query($stages:[String!],$filters:[RecordFilterInput!]){records(recordType:"dataPublication",workflowStages:$stages,filters:$filters,first:50){nodes{oid workflowStep} hasNextPage endCursor}}`;
    const filters = [{ field: 'record:oid', in: oids.map(text => ({ text })) }];
    for (const stages of [undefined, [], ['draft']]) {
      const response = await send(query, { filters, stages });
      assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
      const expected = [oids[0], oids[2], oids[4], oids[5], ...(stages?.length ? [] : [oids[8]])];
      assert.deepEqual(response.body.data.records.nodes.map(row => row.oid).sort(), expected.sort());
      assert.equal(response.body.data.records.hasNextPage, false);
      assert.equal(response.body.data.records.endCursor, null);
    }
  });
  it('rejects invalid timestamp components through the authenticated HTTP contract', async () => {
    for (const dateTime of ['2026-01-01T00:00:00+99:99', '2026-01-01T24:00:00Z', '2026-01-01T00:00:00-01:60']) {
      const response = await send(page, { filters: [{ field: 'metadata:/eventDate', eq: { dateTime } }] });
      assert.equal(response.body.errors?.[0].extensions.code, 'INVALID_FILTER_VALUE', JSON.stringify(response.body));
      assert.equal(response.body.data.records, null);
    }
  });
  it('keeps disabled endpoint behavior for collection and catalogue requests', async () => {
    sails.config.recordGraphql.enabled = false;
    try {
      for (const query of [catalogue, page]) assert.equal((await send(query)).status, 503);
    } finally {
      sails.config.recordGraphql.enabled = true;
    }
  });
  it('rejects injection syntax as literal data and rejects invalid capabilities and cursors', async () => {
    const literal = await send(page, { filters: [{ field: 'metadata:/title', eq: { text: '" OR *:*' } }] });
    assert.equal(literal.body.errors, undefined);
    assert.deepEqual(literal.body.data.records.nodes, []);
    for (const variables of [
      { filters: [{ field: 'metadata:/undeclared', exists: true }] },
      { sort: [{ field: 'metadata:/active', direction: 'ASC' }], after: 'invalid' },
      { first: 51 },
    ]) {
      const result = await send(page, variables);
      assert.ok(result.body.errors);
      assert.equal(result.body.data.records, null);
    }
  });
  async function fixture(
    metadata: object,
    authorization = { view: [username], edit: [], viewRoles: [], editRoles: [] },
    overrides: object = {}
  ) {
    const row = prefixRow('fixture');
    await Record.create({
      redboxOid: row.oid,
      metadata,
      metaMetadata: { brandId: brand.id, type: 'dataPublication', form: 'dataPublication-1.0-draft' },
      workflow: { stage: 'draft' },
      authorization,
      ...overrides,
    });
    return row.oid;
  }
  const idsFilter = (ids: string[]) => ({ field: 'record:oid', in: ids.map(text => ({ text })) });
  const resultIds = response => {
    assert.equal(response.body.errors, undefined, JSON.stringify(response.body));
    return response.body.data.records.nodes.map(row => row.oid);
  };
  it('reads current Mongo writes while the configured search provider and Solr config are unavailable', async () => {
    const search = sails.config.search.serviceName;
    const solr = sails.config.solr;
    sails.config.search.serviceName = 'not-installed';
    sails.config.solr = undefined;
    try {
      const oid = await fixture({ title: 'before-write', amount: 10 });
      const discovery = await send(catalogue);
      assert.equal(discovery.body.errors, undefined, JSON.stringify(discovery.body));
      const filters = [idsFilter([oid]), { field: 'metadata:/title', eq: { text: 'before-write' } }];
      assert.deepEqual(resultIds(await send(page, { filters })), [oid]);
      await Record.updateOne({ redboxOid: oid }).set({ metadata: { title: 'after-write', amount: 11 } });
      assert.deepEqual(resultIds(await send(page, { filters })), []);
      assert.deepEqual(
        resultIds(await send(page, { filters: [idsFilter([oid]), { field: 'metadata:/amount', eq: { number: 11 } }] })),
        [oid]
      );
    } finally {
      sails.config.search.serviceName = search;
      sails.config.solr = solr;
    }
  });
  it('applies ACLs inside Mongo before hydration even if the defensive access override is permissive', async () => {
    const originalAccess = RecordsService.hasViewAccess;
    const originalRead = RecordsService.getMeta;
    const hydrated: string[] = [];
    RecordsService.hasViewAccess = () => true;
    RecordsService.getMeta = async oid => {
      hydrated.push(oid);
      return originalRead.call(RecordsService, oid);
    };
    try {
      assert.deepEqual(
        resultIds(await send(page, { filters: [idsFilter(oids)], first: 50 })),
        [oids[0], oids[2], oids[4], oids[5]].sort()
      );
      for (const oid of [oids[1], oids[3], oids[6], oids[7], oids[8]]) assert.ok(!hydrated.includes(oid));
    } finally {
      RecordsService.hasViewAccess = originalAccess;
      RecordsService.getMeta = originalRead;
    }
  });
  it('matches canonical role IDs, viewer/editor grants and legacy ACLs without implicit Admin or public access', async () => {
    const empty = { view: [], edit: [], viewRoles: [], editRoles: [] };
    const userView = await fixture({ title: 'acl' }, { ...empty, view: ['acl-reader'] });
    const userEdit = await fixture({ title: 'acl' }, { ...empty, edit: ['acl-reader'] });
    const researcher = await fixture({ title: 'acl' }, { ...empty, viewRoles: ['Researcher'] });
    const admin = await fixture({ title: 'acl' }, { ...empty, editRoles: ['Admin'] });
    const guest = await fixture({ title: 'acl' }, { ...empty, viewRoles: ['Guest'] });
    const nobody = await fixture({ title: 'acl' }, empty);
    const legacy = await fixture({ title: 'acl' }, null, { authorization_view: 'acl-reader' });
    // Nested authorization takes precedence over a legacy grant.
    const shadowed = await fixture({ title: 'acl' }, empty);
    const native = Record.getDatastore().manager.collection(Record.tableName);
    await native.updateOne({ redboxOid: legacy }, { $set: { authorization_view: 'acl-reader' } });
    await native.updateOne({ redboxOid: shadowed }, { $set: { authorization_view: 'acl-reader' } });
    const ids = [userView, userEdit, researcher, admin, guest, nobody, legacy, shadowed];
    for (const [roleName, granted] of [
      ['Researcher', researcher],
      ['Admin', admin],
      ['Guest', guest],
    ]) {
      const role = RolesService.getRole(brand, roleName);
      assert.ok(role, roleName);
      const caller = {
        brand,
        portal: 'rdmp',
        user: { id: 'acl-reader', username: 'acl-reader' },
        roles: [{ id: role.id }],
      };
      const response = await RecordGraphqlService.execute(caller, {
        query: page,
        variables: { filters: [idsFilter(ids)], first: 50 },
      });
      assert.deepEqual(resultIds({ body: response.data }).sort(), [userView, userEdit, granted, legacy].sort());
      const impostor = await RecordGraphqlService.execute(
        { ...caller, roles: [{ id: 'wrong-id', name: roleName }] },
        { query: page, variables: { filters: [idsFilter(ids)], first: 50 } }
      );
      assert.deepEqual(resultIds({ body: impostor.data }).sort(), [userView, userEdit, legacy].sort());
    }
  });
  it('paginates duplicate and null keys in both directions, treating invalid scalar storage as missing', async () => {
    const ids: string[] = [];
    for (const amount of [null, undefined, '3', [3], { value: 3 }, 3, 3, 8])
      ids.push(await fixture({ title: 'sort-null', ...(amount === undefined ? {} : { amount }) }));
    for (const direction of ['ASC', 'DESC']) {
      const rows: string[] = [];
      let after: string | null = null;
      for (let n = 0; n < 6; n++) {
        const response = await send(page, {
          filters: [idsFilter(ids)],
          sort: [{ field: 'metadata:/amount', direction }],
          first: 2,
          after,
        });
        const current = resultIds(response);
        assert.ok(current.length > 0, JSON.stringify(response.body));
        rows.push(...current);
        if (!response.body.data.records.hasNextPage) {
          assert.equal(response.body.data.records.endCursor, null);
          break;
        }
        after = response.body.data.records.endCursor;
        assert.ok(after);
      }
      assert.deepEqual(rows, direction === 'ASC' ? ids : [ids[7], ids[5], ids[6], ...ids.slice(0, 5)]);
      assert.equal(new Set(rows).size, ids.length);
    }
    assert.deepEqual(
      resultIds(
        await send(page, { filters: [idsFilter(ids), { field: 'metadata:/amount', gt: { number: 2 } }], first: 50 })
      ),
      ids.slice(5)
    );
    assert.deepEqual(
      resultIds(
        await send(page, { filters: [idsFilter(ids), { field: 'metadata:/amount', exists: false }], first: 50 })
      ),
      ids.slice(0, 5)
    );
  });
  it('enforces integer and boolean storage types with compound keyset sorting', async () => {
    const ids: string[] = [];
    for (const [count, active] of [
      [null, null],
      [2.5, 'true'],
      ['2', 1],
      [2, true],
      [2, false],
      [3, true],
    ])
      ids.push(await fixture({ title: 'compound', count, active }));
    const sort = [
      { field: 'metadata:/count', direction: 'ASC' },
      { field: 'metadata:/active', direction: 'DESC' },
    ];
    const first = await send(page, { filters: [idsFilter(ids)], sort, first: 3 });
    assert.deepEqual(resultIds(first), ids.slice(0, 3));
    assert.equal(first.body.data.records.hasNextPage, true);
    const last = await send(page, {
      filters: [idsFilter(ids)],
      sort,
      first: 3,
      after: first.body.data.records.endCursor,
    });
    assert.deepEqual(resultIds(last), ids.slice(3));
    assert.equal(last.body.data.records.hasNextPage, false);
    assert.deepEqual(
      resultIds(
        await send(page, {
          filters: [
            idsFilter(ids),
            { field: 'metadata:/count', in: [{ number: 2 }, { number: 3 }] },
            { field: 'metadata:/active', in: [{ boolean: true }] },
          ],
          first: 50,
        })
      ),
      [ids[3], ids[5]]
    );
    for (const number of [2.5, Number.MAX_SAFE_INTEGER + 1]) {
      const response = await send(page, { filters: [{ field: 'metadata:/count', eq: { number } }] });
      assert.equal(response.body.errors?.[0].extensions.code, 'INVALID_FILTER_VALUE');
    }
  });
  it('normalizes stored dates across BSON, offsets, UTC, date-only and legacy local formats', async () => {
    const ids: string[] = [];
    for (const eventDate of [
      '2026-01-02T12:00:00+12:00',
      '2026-01-02T00:00:00Z',
      '2026-01-02',
      '2026-01-02T00:00:00',
      '2026-02-30',
      '2026-01-02T24:00:00Z',
      1767312000000,
      ['2026-01-02'],
      null,
    ])
      ids.push(await fixture({ title: 'date-normalization', eventDate }));
    const bson = await fixture({ title: 'date-bson' });
    await Record.getDatastore()
      .manager.collection(Record.tableName)
      .updateOne({ redboxOid: bson }, { $set: { 'metadata.eventDate': new Date('2026-01-02T00:00:00Z') } });
    ids.push(bson);
    const match = await send(page, {
      filters: [idsFilter(ids), { field: 'metadata:/eventDate', eq: { dateTime: '2026-01-02T00:00:00Z' } }],
      first: 50,
    });
    assert.deepEqual(resultIds(match), [...ids.slice(0, 4), bson]);
    const missing = await send(page, {
      filters: [idsFilter(ids), { field: 'metadata:/eventDate', exists: false }],
      first: 50,
    });
    assert.deepEqual(resultIds(missing), ids.slice(4, 9));
    const sort = [{ field: 'metadata:/eventDate', direction: 'ASC' }];
    const seen: string[] = [];
    let after: string | null = null;
    for (let n = 0; n < 6; n++) {
      const response = await send(page, { filters: [idsFilter(ids)], sort, first: 2, after });
      const current = resultIds(response);
      assert.ok(current.length);
      seen.push(...current);
      if (!response.body.data.records.hasNextPage) break;
      after = response.body.data.records.endCursor;
      assert.ok(after);
    }
    assert.deepEqual(seen, [...ids.slice(4, 9), ...ids.slice(0, 4), bson]);
  });
  it('uses declared nested scalar paths and rejects arrays, undeclared paths and wrong filter types', async () => {
    const catalogueResponse = await send(
      '{recordFields(recordType:"dataPublication",workflowStages:["draft"]){fields{id path repeating filterable sortable selections{selection responsePath}}}}'
    );
    assert.equal(catalogueResponse.body.errors, undefined, JSON.stringify(catalogueResponse.body));
    const fields = catalogueResponse.body.data.recordFields.fields;
    assert.equal(fields.find(field => field.id === 'metadata:/details/note').filterable, true);
    assert.equal(fields.find(field => field.id === 'metadata:/people').filterable, false);
    assert.ok(fields.some(field => field.repeating && !field.filterable && !field.sortable));
    const valid = await fixture({ details: { note: '$literal.*[x]' } });
    const array = await fixture({ details: [{ note: '$literal.*[x]' }] });
    assert.deepEqual(
      resultIds(
        await send(page, {
          filters: [idsFilter([valid, array]), { field: 'metadata:/details/note', eq: { text: '$literal.*[x]' } }],
        })
      ),
      [valid]
    );
    for (const filter of [
      { field: 'metadata:/details/note', contains: '.*[x]' },
      { field: 'metadata:/details/note', iprefix: '$LITERAL.' },
    ])
      assert.deepEqual(resultIds(await send(page, { filters: [idsFilter([valid, array]), filter] })), [valid]);
    for (const filter of [
      { field: 'metadata:/people', exists: true },
      { field: 'metadata:/details.$where', exists: true },
      { field: 'metadata:/amount', eq: { text: '3' } },
      { field: 'metadata:/active', gt: { boolean: true } },
      { field: 'metadata:/eventDate', eq: { dateTime: '2026-02-30T00:00:00Z' } },
      { field: 'metadata:/amount', between: { from: { number: 3 }, to: { number: 2 } } },
    ]) {
      const response = await send(page, { filters: [filter] });
      assert.ok(response.body.errors, JSON.stringify(filter));
      assert.equal(response.body.data.records, null);
    }
  });
  it('binds encrypted continuations to actor, brand, scope, sort, filters and read schema', async () => {
    const variables = { filters: onlyOurRows, first: 1 };
    const response = await send(page, variables);
    const cursor = response.body.data.records.endCursor;
    assert.ok(cursor);
    for (const changed of [
      { after: cursor.slice(0, -6) + 'ABCDEF' },
      { after: cursor, filters: [...onlyOurRows, { field: 'metadata:/active', exists: true }] },
      { after: cursor, sort: [{ field: 'metadata:/title', direction: 'DESC' }] },
      { after: cursor, first: 2 },
    ]) {
      const result = await send(page, { ...variables, ...changed });
      assert.equal(result.body.errors?.[0].extensions.code, 'INVALID_CURSOR', JSON.stringify(result.body));
    }
    const role = RolesService.getRole(brand, 'Researcher');
    for (const caller of [
      { brand, portal: 'rdmp', user: { id: userId, username: 'different-actor' }, roles: [{ id: role.id }] },
      {
        brand: { ...brand, id: 'foreign-brand' },
        portal: 'rdmp',
        user: { id: userId, username },
        roles: [{ id: role.id }],
      },
    ]) {
      const result = await RecordGraphqlService.execute(caller, {
        query: page,
        variables: { ...variables, after: cursor },
      });
      assert.equal(
        result.data.errors?.[0].extensions.code,
        caller.brand.id === brand.id ? 'INVALID_CURSOR' : 'UNKNOWN_RECORD_TYPE',
        JSON.stringify(result)
      );
    }
    const changedType = await send(page.replace('recordType:"dataPublication"', 'recordType:"rdmp"'), {
      ...variables,
      filters: [idsFilter(oids.slice(0, 2))],
      after: cursor,
    });
    assert.equal(changedType.body.errors?.[0].extensions.code, 'INVALID_CURSOR', JSON.stringify(changedType.body));
    const changedStage = await send(
      'query($after:String,$filters:[RecordFilterInput!]){records(recordType:"dataPublication",workflowStages:["published"],first:1,after:$after,filters:$filters){hasNextPage}}',
      { after: cursor, filters: onlyOurRows }
    );
    assert.equal(changedStage.body.errors?.[0].extensions.code, 'INVALID_CURSOR', JSON.stringify(changedStage.body));
    const form = await Form.findOne({ id: formId });
    await Form.updateOne({ id: formId }).set({
      configuration: {
        ...form.configuration,
        componentDefinitions: [
          ...form.configuration.componentDefinitions,
          { name: 'newSchemaField', component: { class: 'SimpleInputComponent' } },
        ],
      },
    });
    try {
      const changedSchema = await send(page, { ...variables, after: cursor });
      assert.equal(
        changedSchema.body.errors?.[0].extensions.code,
        'INVALID_CURSOR',
        JSON.stringify(changedSchema.body)
      );
    } finally {
      await Form.updateOne({ id: formId }).set({ configuration: form.configuration });
    }
  });
  it('fails clearly for unsupported providers, storage failures and sparse defensive overrides', async () => {
    const storage = sails.services[sails.config.storage.serviceName];
    const execute = storage.executeRecordCollection;
    storage.executeRecordCollection = undefined;
    try {
      const result = await send(page);
      assert.equal(result.body.errors?.[0].extensions.code, 'COLLECTION_UNAVAILABLE', JSON.stringify(result.body));
    } finally {
      storage.executeRecordCollection = execute;
    }
    storage.executeRecordCollection = async () => {
      throw new Error('Mongo offline: private details');
    };
    try {
      const result = await send(page);
      assert.equal(result.body.errors?.[0].extensions.code, 'STORAGE_UNAVAILABLE', JSON.stringify(result.body));
      assert.ok(!JSON.stringify(result.body).includes('private details'));
    } finally {
      storage.executeRecordCollection = execute;
    }
    const access = RecordsService.hasViewAccess;
    RecordsService.hasViewAccess = (...args) =>
      !String(args[3].metadata.title).startsWith('Boundary-') && access.apply(RecordsService, args);
    try {
      const result = await prefixPage('boundary-');
      assert.deepEqual(resultIds(result), []);
      assert.equal(result.body.data.records.hasNextPage, false);
    } finally {
      RecordsService.hasViewAccess = access;
    }
    // Work-bound exhaustion is an error, never a false empty page or continuation.
    const count = 201;
    const prefix = `override-${suffix}`;
    await Record.createEach(
      Array.from({ length: count }, () => {
        const row = prefixRow(prefix);
        return {
          redboxOid: row.oid,
          metadata: { title: prefix },
          metaMetadata: { brandId: brand.id, type: 'dataPublication', form: 'dataPublication-1.0-draft' },
          workflow: { stage: 'draft' },
          authorization: { view: [username] },
        };
      })
    );
    RecordsService.hasViewAccess = (...args) =>
      !String(args[3].metadata.title).startsWith(prefix) && access.apply(RecordsService, args);
    try {
      const result = await prefixPage(prefix);
      assert.equal(result.body.errors?.[0].extensions.code, 'COLLECTION_LIMIT', JSON.stringify(result.body));
      assert.equal(result.body.data.records, null);
    } finally {
      RecordsService.hasViewAccess = access;
    }
  });
});
