import assert from 'node:assert/strict';
import sinon from 'sinon';
import type { GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
import { gridHarness, gridCaller } from '../fixtures/record-grid.fixtures';
import { metadataTypeName } from '../../src/record-graphql/renderer';
import { namedQueryExecutionResultSchema } from '../../src/api-routes/schemas/named-query';
import { Services } from '../../src/services/NamedQueryService';
import { Services as EditorServices } from '../../src/services/NamedQueryEditorService';
import { Services as GraphqlServices } from '../../src/services/RecordGraphqlService';
import { recordGraphql, type RecordGraphqlConfig } from '../../src/config/recordGraphql.config';
import { RecordContractContributorRegistry, createCoreRecordContractContributors } from '../../src/record-contract';
import { Controllers } from '../../src/controllers/webservice/NamedQueryController';
import {
  executeGraphqlNamedQuery,
  GraphqlNamedQueryExecutionError,
} from '../../src/services/named-query/graphql-execution';
import { NamedQueryExecutionBudget } from '../../src/utilities/NamedQueryPreview';
import { GraphqlNamedQueryValidationError } from '../../src/services/named-query/graphql-validation';
import type { ReadCaller } from '../../src/record-graphql/read-record';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

const definition = (): GraphqlNamedQueryDefinition => ({
  source: 'graphql',
  graphql: {
    document: `query Lookup($search: String = "a", $first: Int = 50, $after: String = "untrusted-default") {
      matches: records(recordType: "grid-fixture", workflowStages: ["draft"],
        filters: [{field:"metadata:/title", contains:$search}], first:$first, after:$after) {
        items:nodes { id:oid label:workflowStep dateCreated:createdOn lastSaveDate:lastModified } more:hasNextPage cursor:endCursor
      }
    }`,
    variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String', required: false } },
    resultPath: ['matches', 'items'],
    mappings: {
      oid: ['id'],
      title: ['label'],
      metadata: [],
      dateCreated: ['dateCreated'],
      lastSaveDate: ['lastSaveDate'],
    },
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
});
const validData = (items: unknown[] = [{ id: 'a', label: 'A' }]) => ({
  data: { matches: { items, more: false, cursor: null } },
});
const code = (expected: string, status?: number) => (error: unknown) =>
  error instanceof GraphqlNamedQueryExecutionError &&
  error.code === expected &&
  (status === undefined || error.status === status);

/** Run the actual schema compiler, then change config before the actual execute call. */
function configFlipReadService(next: Partial<RecordGraphqlConfig> = { enabled: false }) {
  const config = { ...recordGraphql, enabled: true };
  const read = sinon.spy(async () => null);
  const registry = new RecordContractContributorRegistry(
    createCoreRecordContractContributors().map(contributor => ({ contributor, source: 'core' as const }))
  );
  class ConfigFlipRecordGraphql extends GraphqlServices.RecordGraphql {
    public override async getReadSchema(caller: ReadCaller) {
      const schema = await super.getReadSchema(caller);
      Object.assign(config, next);
      return schema;
    }
  }
  const service = new ConfigFlipRecordGraphql({
    getConfig: () => config,
    getContributorRegistry: () => registry,
    getCandidates: async () => [
      {
        recordType: 'grid-fixture',
        workflowStep: 'draft',
        form: 'draft-form',
        configuration: {
          name: 'draft-form',
          type: 'grid-fixture',
          componentDefinitions: [
            {
              name: 'title',
              component: { class: 'SimpleInputComponent' },
              model: { class: 'SimpleInputModel', config: {} },
            },
          ],
        },
      },
    ],
    getReusableDefinitions: () => ({}),
    getRecord: read,
  });
  return { service, read };
}

describe('GraphQL named query execution boundary', () => {
  let previous: Record<string, unknown>;
  let h: ReturnType<typeof gridHarness>;
  let engine: { getReadSchema: sinon.SinonStub; execute: sinon.SinonStub };
  beforeEach(() => {
    previous = Object.fromEntries(
      [
        'RecordGraphqlService',
        'NamedQueryService',
        'NamedQueryEditorService',
        'BrandingService',
        'TranslationService',
      ].map(k => [k, Reflect.get(globalThis, k)])
    );
    setupServiceTestGlobals(createMockSails());
    h = gridHarness(Array.from({ length: 26 }, (_, i) => `a-${i}`));
    engine = { getReadSchema: sinon.stub().resolves(h.schema), execute: sinon.stub() };
    engine.execute.callsFake(async (scope: ReadCaller, body: { query: string; variables: Record<string, unknown> }) => {
      const result = await h.query(body.query, body.variables, scope);
      return { status: result.status, data: JSON.parse(JSON.stringify(result.body)) };
    });
    Object.assign(globalThis, { RecordGraphqlService: engine, NamedQueryService: new Services.NamedQueryService() });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    Object.assign(globalThis, previous);
  });
  const run = (
    input = definition(),
    params: Record<string, unknown> = {},
    start: number | undefined = 0,
    rows: number | undefined = 25,
    caller = gridCaller
  ) => executeGraphqlNamedQuery(input, params, gridCaller.brand, start, rows, caller);

  it('uses in-process Yoga with alias mappings, clamps pages and overrides operation paging defaults', async () => {
    for (const requested of [undefined, 25, 1000, 3]) {
      const result = await run(definition(), {}, 0, requested);
      assert.equal(result.records.length, requested === 3 ? 3 : 25);
      assert.deepEqual(result.summary, { numFound: null, start: 0, page: 1 });
      assert.deepEqual(result.pagination, { mode: 'firstPage', hasNextPage: true });
      assert.equal(result.source, 'graphql');
      assert.equal(result.records[0].oid, 'a-0');
      assert.equal(result.records[0].title, 'draft');
      assert.equal(engine.execute.lastCall.args[0], gridCaller);
      assert.equal(engine.execute.lastCall.args[1].variables.after, null);
      assert.equal(Object.hasOwn(engine.execute.lastCall.args[1].variables, 'search'), false);
      assert.ok(engine.execute.lastCall.args[2] <= Date.now() + 5000);
    }
  });
  it('dispatches inline configuration by source without entering the database executor', async () => {
    const service = new Services.NamedQueryService();
    const database = sinon.spy(service, 'performNamedQuery');
    const result = await service.performNamedQueryFromConfig(
      definition(),
      { search: 'a', rows: '2' },
      gridCaller.brand,
      0,
      25,
      gridCaller.user,
      undefined,
      gridCaller
    );
    assert.equal(result.source, 'graphql');
    assert.equal(result.records.length, 2);
    assert.equal(database.called, false);
    await assert.rejects(
      service.performNamedQueryFromConfig(
        definition(),
        { start: '1' },
        gridCaller.brand,
        0,
        25,
        undefined,
        undefined,
        gridCaller
      ),
      code('GRAPHQL_OFFSET_UNSUPPORTED')
    );
  });
  it('fails missing user/role/brand/portal and mismatched brand before schema or execution', async () => {
    for (const property of ['user', 'roles', 'brand', 'portal']) {
      const scope = { ...gridCaller };
      Reflect.deleteProperty(scope, property);
      await assert.rejects(run(definition(), {}, 0, 25, scope), code('GRAPHQL_CONTEXT_REQUIRED'));
    }
    await assert.rejects(
      run(definition(), {}, 0, 25, { ...gridCaller, brand: { ...gridCaller.brand, name: 'foreign' } }),
      code('GRAPHQL_CONTEXT_REQUIRED')
    );
    const query = new Services.NamedQueryService();
    await assert.rejects(
      query.performNamedQueryFromConfig(definition(), {}, gridCaller.brand, 0, 25, gridCaller.user),
      code('GRAPHQL_CONTEXT_REQUIRED')
    );
    assert.equal(engine.getReadSchema.called, false);
    assert.equal(engine.execute.called, false);
  });
  it('rejects offsets and invalid row bounds without execution', async () => {
    for (const start of [-1, 1, 0.1, NaN, Infinity])
      await assert.rejects(run(definition(), {}, start), code('GRAPHQL_OFFSET_UNSUPPORTED'));
    for (const rows of [0, -1, 1.5, NaN, Infinity])
      await assert.rejects(run(definition(), {}, 0, rows), code('GRAPHQL_PAGE_INVALID'));
    assert.equal(engine.execute.called, false);
  });
  it('revalidates direct definitions and consumer inputs before dispatch', async () => {
    const invalid = definition();
    invalid.graphql.document = '{ privateField }';
    for (const input of [
      invalid,
      { ...definition(), graphql: { ...definition().graphql, mappings: { title: ['label'] } } },
    ])
      await assert.rejects(run(input));
    for (const params of [{ roles: [] }, { brand: 'other' }, { after: 'cursor' }, { search: { unsafe: 'value' } }])
      await assert.rejects(run(definition(), params));
    assert.equal(engine.execute.called, false);
  });
  it('returns empty success with unknown total and rechecks permissions rather than caching results', async () => {
    assert.equal((await run()).records.length, 25);
    h.records.forEach(record => h.denied.add(record.redboxOid));
    const result = await run();
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.pagination, { mode: 'firstPage', hasNextPage: false });
    assert.equal(result.summary.numFound, null);
    assert.equal(engine.execute.callCount, 2);
  });
  it('preserves missing, null, false, zero, empty text and empty optional lists without placeholders', async () => {
    // Deliberately adversarial engine payloads exercise normalization separately
    // from schema typing; real schema/resolver/ACL behavior is covered above/HTTP.
    const input = definition();
    input.graphql.mappings!.metadata = ['dateCreated'];
    for (const value of [undefined, null, false, 0, '', []]) {
      engine.execute.resolves({
        status: 200,
        data: validData([{ id: 0, label: 'label', ...(value !== undefined ? { dateCreated: value } : {}) }]),
      });
      const row = (await run(input)).records[0];
      assert.equal(row.oid, '0');
      assert.equal(Object.hasOwn(row, 'metadata'), value !== undefined);
      assert.deepEqual(row.metadata, value);
      assert.equal(Object.hasOwn(row, 'lastSaveDate'), false);
    }
  });
  for (const target of ['dateCreated', 'lastSaveDate'] as const)
    it(`round-trips real Yoga ${target} mappings through the REST response schema`, async () => {
      const input = definition();
      const document = input.graphql.document.replace(
        'dateCreated:createdOn lastSaveDate:lastModified',
        `values:metadata { ... on ${metadataTypeName(h.contracts[0])} { active } }`
      );
      delete input.graphql.mappings!.dateCreated;
      delete input.graphql.mappings!.lastSaveDate;
      input.graphql.mappings![target] = ['values', 'active'];
      for (const value of [undefined, null, true, false]) {
        // A conditional optional selection stays absent; selected nullable
        // Boolean values retain their actual Yoga values on the wire.
        input.graphql.document =
          value === undefined ? document.replace('active }', 'active @skip(if:true) }') : document;
        for (const record of h.records.values()) record.metadata.active = value;
        const result = await run(input, {}, 0, 1);
        const row = result.records[0];
        assert.equal(Object.hasOwn(row, target), value !== undefined);
        assert.deepEqual(row[target], value);
        assert.deepEqual(namedQueryExecutionResultSchema.parse(result), result);
        assert.deepEqual(namedQueryExecutionResultSchema.parse(JSON.parse(JSON.stringify(result))), result);
      }
    });
  it('rejects null, missing, inherited and invalid identifiers/labels as whole-result failures', async () => {
    for (const row of [
      null,
      [],
      'x',
      {},
      { id: null, label: 'L' },
      { id: '', label: 'L' },
      { id: ' ', label: 'L' },
      { id: {}, label: 'L' },
      { id: 1.5, label: 'L' },
      { id: 'x', label: null },
      { id: 'x', label: 42 },
      { id: 'x', label: ' ' },
      Object.create({ id: 'inherited', label: 'L' }),
    ]) {
      engine.execute.resolves({ status: 200, data: validData([{ id: 'good', label: 'Good' }, row]) });
      await assert.rejects(run(), code('GRAPHQL_ROW_INVALID'));
    }
  });
  it('rejects malformed list, continuation and overlong pages rather than trimming or inventing success', async () => {
    for (const data of [
      {},
      { data: null },
      { data: { matches: { items: null, more: false, cursor: null } } },
      { data: { matches: { items: {}, more: false, cursor: null } } },
      { data: { matches: { items: [], more: 'false', cursor: null } } },
      { data: { matches: { items: [], more: true, cursor: null } } },
      { data: { matches: { items: [], more: false, cursor: 'invented' } } },
      validData(Array.from({ length: 26 }, () => ({ id: 'x', label: 'L' }))),
    ]) {
      engine.execute.resolves({ status: 200, data });
      await assert.rejects(run(), code('GRAPHQL_RESULT_INVALID'));
    }
  });
  for (const [status, errorCode, expected, expectedStatus] of [
    [200, 'COLLECTION_LIMIT', 'COLLECTION_LIMIT', 422],
    [200, 'PRIVATE_FIELD', 'GRAPHQL_EXECUTION_FAILED', 422],
    [503, 'QUERY_TIMEOUT', 'QUERY_TIMEOUT', 503],
    [413, 'QUERY_LIMIT', 'QUERY_LIMIT', 413],
    [500, 'SECRET', 'GRAPHQL_EXECUTION_FAILED', 422],
    [503, 'GRAPHQL_DISABLED', 'GRAPHQL_DISABLED', 503],
    [503, 'UNAVAILABLE', 'UNAVAILABLE', 503],
    [500, 'UNAVAILABLE', 'GRAPHQL_EXECUTION_FAILED', 422],
    [200, 'GRAPHQL_DISABLED', 'GRAPHQL_EXECUTION_FAILED', 422],
  ] as const)
    it(`rejects partial/non-success ${status} ${errorCode} safely`, async () => {
      const response = {
        status,
        data: { ...validData(), errors: [{ message: 'PRIVATE QUERY VALUE', extensions: { code: errorCode } }] },
      };
      engine.execute.resolves(response);
      await assert.rejects(run(), error => code(expected, expectedStatus)(error) && !String(error).includes('PRIVATE'));
    });
  it('enforces response/mapped byte bounds and a deadline including schema validation', async () => {
    engine.execute.resolves({ status: 200, data: validData([{ id: 'x', label: 'x'.repeat(262144) }]) });
    await assert.rejects(run(), code('QUERY_LIMIT'));
    const expanded = definition();
    expanded.graphql.mappings!.dateCreated = ['label'];
    expanded.graphql.mappings!.lastSaveDate = ['label'];
    engine.execute.resolves({ status: 200, data: validData([{ id: 'x', label: 'x'.repeat(80000) }]) });
    await assert.rejects(run(expanded), code('QUERY_LIMIT'));
    engine.getReadSchema.callsFake(() => new Promise(resolve => setTimeout(() => resolve(h.schema), 25)));
    engine.execute.resetHistory();
    await assert.rejects(
      executeGraphqlNamedQuery(definition(), {}, gridCaller.brand, 0, 25, gridCaller, new NamedQueryExecutionBudget(5)),
      code('QUERY_TIMEOUT')
    );
    assert.equal(engine.execute.called, false);
  });
  it('conceals unexpected validator/engine exceptions from ordinary consumers', async () => {
    engine.execute.rejects(new Error('PRIVATE GRAPHQL_DISABLED engine detail'));
    await assert.rejects(
      run(),
      error => code('GRAPHQL_EXECUTION_FAILED', 422)(error) && !String(error).includes('PRIVATE')
    );
  });
  it('returns unavailable when the real record read service is disabled before schema inspection', async () => {
    const disabled = new GraphqlServices.RecordGraphql({ getConfig: () => ({ ...recordGraphql, enabled: false }) });
    const execute = sinon.spy(disabled, 'execute');
    Reflect.set(globalThis, 'RecordGraphqlService', disabled);
    await assert.rejects(run(), code('GRAPHQL_DISABLED', 503));
    assert.equal(execute.called, false);
  });
  for (const [next, expected] of [
    [{ enabled: false }, 'GRAPHQL_DISABLED'],
    [{ cacheEntries: 0 }, 'UNAVAILABLE'],
  ] as const)
    it(`preserves the real ${expected} service response when configuration changes after inspection`, async () => {
      const actual = configFlipReadService(next);
      const execute = sinon.spy(actual.service, 'execute');
      Reflect.set(globalThis, 'RecordGraphqlService', actual.service);
      await assert.rejects(run(), code(expected, 503));
      assert.equal(execute.calledOnce, true);
      const response = await execute.firstCall.returnValue;
      assert.equal(response.status, 503);
      assert.deepEqual(response.data, {
        errors: [
          {
            message: expected === 'GRAPHQL_DISABLED' ? 'Record GraphQL is disabled.' : 'Record GraphQL is unavailable.',
            extensions: { code: expected },
          },
        ],
      });
      assert.equal(actual.read.called, false);
    });
  it('preserves ordinary schema-unavailable validation diagnostics', async () => {
    engine.getReadSchema.rejects(new Error('PRIVATE GRAPHQL_DISABLED schema detail'));
    await assert.rejects(
      run(),
      error =>
        error instanceof GraphqlNamedQueryValidationError &&
        error.diagnostics[0].code === 'GRAPHQL_SCHEMA_UNAVAILABLE' &&
        !JSON.stringify(error).includes('PRIVATE')
    );
    assert.equal(engine.execute.called, false);
  });
  for (const stage of [
    'disabled schema',
    'disabled execution',
    'unavailable execution',
    'unexpected execution',
  ] as const)
    it(`preserves the safe ${stage} status/code through both preview response versions`, async () => {
      if (stage === 'disabled schema')
        Reflect.set(
          globalThis,
          'RecordGraphqlService',
          new GraphqlServices.RecordGraphql({ getConfig: () => ({ ...recordGraphql, enabled: false }) })
        );
      else if (stage === 'unexpected execution') engine.execute.rejects(new Error('PRIVATE engine detail'));
      Object.assign(globalThis, {
        BrandingService: { getBrand: () => gridCaller.brand },
        NamedQueryEditorService: new EditorServices.NamedQueryEditor(),
        TranslationService: { t: (value: string) => value },
      });
      const controller = new Controllers.NamedQuery();
      const status = stage === 'unexpected execution' ? 422 : 503;
      const expected =
        stage === 'unexpected execution'
          ? 'GRAPHQL_EXECUTION_FAILED'
          : stage === 'unavailable execution'
            ? 'UNAVAILABLE'
            : 'GRAPHQL_DISABLED';
      for (const version of ['1.0', '2.0']) {
        if (stage === 'disabled execution' || stage === 'unavailable execution')
          Reflect.set(
            globalThis,
            'RecordGraphqlService',
            configFlipReadService(stage === 'disabled execution' ? { enabled: false } : { cacheEntries: 0 }).service
          );
        const session: Partial<Sails.Req['session']> = { branding: gridCaller.brand.name, portal: gridCaller.portal };
        const req: Partial<Sails.Req> = {
          method: 'POST',
          session: session as Sails.Req['session'],
          user: { ...gridCaller.user, roles: gridCaller.roles },
          body: { definition: definition() },
          headers: { 'x-redbox-api-version': version },
          param: () => gridCaller.portal,
        };
        const res = {
          status: sinon.stub().returnsThis(),
          set: sinon.stub().returnsThis(),
          json: sinon.stub().returnsThis(),
        };
        const response: Partial<Sails.Res> = res;
        await controller.previewDraft(req as Sails.Req, response as Sails.Res);
        assert.equal(res.status.lastCall.args[0], status);
        const body = res.json.lastCall.args[0];
        assert.equal(version === '2.0' ? body.errors[0].code : body.message, expected);
        assert.ok(!JSON.stringify(body).includes('PRIVATE'));
        assert.equal(res.set.lastCall.args[0]['Cache-Control'], 'no-store');
      }
    });
  it('previews through the same first-page adapter and real caller context', async () => {
    const editor = new EditorServices.NamedQueryEditor();
    const caller: FormRecordAccessContext = {
      brand: gridCaller.brand,
      user: { id: 'viewer', username: 'viewer', type: 'local', name: '', email: '', roles: [] },
    };
    const result = await editor.previewDraft(gridCaller.brand, 'rdmp', caller, {
      definition: definition(),
      parameters: { search: 'a' },
    });
    assert.equal(result.source, 'graphql');
    assert.equal(result.summary.numFound, null);
    assert.equal(result.truncated, true);
    assert.equal(result.limits.rows, 25);
    assert.equal(engine.execute.lastCall.args[0].user, caller.user);
    await assert.rejects(
      editor.previewDraft(gridCaller.brand, 'rdmp', caller, { definition: definition(), parameters: { rows: 100 } })
    );
  });
});
