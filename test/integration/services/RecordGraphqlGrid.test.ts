import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import axios from 'axios';
import { firstValueFrom } from 'rxjs';
import supertest from 'supertest';
import { recordGraphql, SOLR_RECORD_GRID_FIELDS } from '@researchdatabox/redbox-core';

describe('GraphQL grid over Sails and Solr', function () {
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
  let coreBefore;
  let formBefore;
  let formId;
  let userId;
  let ruleId;
  let url;
  let brand;
  const fields = {
    title: `grid_title_${suffix}`,
    amount: `grid_amount_${suffix}`,
    active: `grid_active_${suffix}`,
    eventDate: `grid_date_${suffix}`,
  };
  const prefixField = {
    name: `grid_title_iprefix_v1_${suffix}`,
    type: 'string',
    indexed: true,
    stored: false,
    multiValued: false,
    docValues: false,
  };
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
    coreBefore = sails.config.solr.cores.default;
    sails.config.recordGraphql = { ...recordGraphql, enabled: true, cursorSecret: `grid-integration-secret-${suffix}` };
    sails.config.solr.cores.default = {
      ...coreBefore,
      recordGraphqlFields: Object.fromEntries(
        Object.entries(fields).map(([path, field]) => [`metadata:/${path}`, field])
      ),
      recordGraphqlCaseInsensitivePrefixFields: { 'metadata:/title': prefixField.name },
      schema: { ...coreBefore.schema, 'add-field': [...coreBefore.schema['add-field'], prefixField] },
      preIndex: {
        ...coreBefore.preIndex,
        copy: [
          ...(coreBefore.preIndex?.copy ?? []),
          ...Object.entries(fields).map(([source, dest]) => ({ source: `metadata.${source}`, dest })),
        ],
      },
    };
    const options = coreBefore.options;
    url = `${options.https ? 'https' : 'http'}://${options.host}:${options.port}/solr/${options.core}`;
    const live = (await axios.get(`${url}/schema`)).data.schema;
    const definitions = [
      ...SOLR_RECORD_GRID_FIELDS,
      prefixField,
      ...Object.entries(fields).map(([key, name]) => ({
        name,
        type: key === 'amount' ? 'pdouble' : key === 'eventDate' ? 'pdate' : key === 'active' ? 'boolean' : 'string',
        indexed: true,
        stored: true,
        multiValued: false,
        docValues: true,
      })),
    ];
    const missing = definitions.filter(field => !live.fields.some(found => found.name === field.name));
    if (missing.length) await axios.post(`${url}/schema`, { 'add-field': missing });
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
      await sails.services.solrsearchservice.solrAddOrUpdate({ attrs: { data: await RecordsService.getMeta(oid) } });
    }
    // Use the real protected pre-index pipeline and one bulk Solr commit for these
    // isolated fixtures; repeated per-document commits obscure the bounded-query tests.
    const created = await Record.createEach(
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
    const documents = created.map(record =>
      sails.services.solrsearchservice.preIndex({ ...record, storage_id: record.id })
    );
    await axios.post(`${url}/update`, documents, { params: { commit: true } });
  });
  after(async () => {
    if (url) {
      await axios.post(`${url}/update`, { delete: { query: `redbox_grid_oid:*${suffix}` }, commit: {} });
    }
    await Record.destroy({ redboxOid: [...oids, ...prefixRows.map(row => row.oid)] });
    if (formId && formBefore) await Form.updateOne({ id: formId }).set({ configuration: formBefore });
    if (userId) await User.destroy({ id: userId });
    if (ruleId) await PathRule.destroy({ id: ruleId });
    if (configBefore !== undefined) sails.config.recordGraphql = configBefore;
    if (coreBefore) sails.config.solr.cores.default = coreBefore;
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
  it('discovers real index capabilities and executes server-generated metadata selections', async () => {
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
    // Indexed permissions remain hints: revoke storage access without reindexing.
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
  it('withdraws discovery and rejects execution when the opt-in or live copy-rule guarantee is absent', async () => {
    const core = sails.config.solr.cores.default;
    const mapping = core.recordGraphqlCaseInsensitivePrefixFields;
    const assertUnsupported = async () => {
      const discovery = await send(catalogue);
      assert.equal(discovery.body.errors, undefined, JSON.stringify(discovery.body));
      const title = discovery.body.data.recordFields.fields.find(field => field.id === 'metadata:/title');
      assert.ok(title.operators.includes('EQ'));
      assert.ok(!title.operators.includes('IPREFIX'));
      const response = await prefixPage('equal-');
      assert.equal(response.body.errors?.[0].extensions.code, 'UNSUPPORTED_FILTER', JSON.stringify(response.body));
      assert.equal(response.body.data.records, null);
    };
    delete core.recordGraphqlCaseInsensitivePrefixFields;
    try {
      await assertUnsupported();
    } finally {
      core.recordGraphqlCaseInsensitivePrefixFields = mapping;
    }
    const copy = { source: fields.title, dest: prefixField.name };
    await axios.post(`${url}/schema`, { 'add-copy-field': copy });
    try {
      await assertUnsupported();
    } finally {
      await axios.post(`${url}/schema`, { 'delete-copy-field': copy });
    }
    const restored = await send(catalogue);
    assert.equal(restored.body.errors, undefined, JSON.stringify(restored.body));
    assert.ok(
      restored.body.data.recordFields.fields.find(field => field.id === 'metadata:/title').operators.includes('IPREFIX')
    );
  });
  it('matches positive literal wildcard, quote, backslash, bracket and search-syntax prefixes in real Solr', async () => {
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
  it('proves 25 versus 26 visible prefix matches and keeps sparse ACL failure explicit', async () => {
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
    assert.equal(sparse.body.errors?.[0].extensions.code, 'COLLECTION_LIMIT', JSON.stringify(sparse.body));
    assert.equal(sparse.body.data.records, null);
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
    for (const field of ['record:oid', 'metadata:/amount', 'metadata:/active', 'metadata:/eventDate']) {
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
  it('executes typed numeric, date and boolean filters in Solr with explicit sorting', async () => {
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
  it('limits omitted and empty stage scopes to configured stages in Solr and storage', async () => {
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
    // Simulate an index that still claims a configured stage after storage moved.
    const stored = await RecordsService.getMeta(oids[7]);
    await sails.services.solrsearchservice.solrAddOrUpdate({
      attrs: { data: { ...stored, workflow: { stage: 'draft' } } },
    });
    const stale = await send(query, { filters });
    assert.equal(stale.body.errors, undefined, JSON.stringify(stale.body));
    assert.ok(!stale.body.data.records.nodes.some(row => row.oid === oids[7]));
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
});
