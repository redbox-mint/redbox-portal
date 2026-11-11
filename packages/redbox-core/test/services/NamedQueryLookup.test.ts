import assert from 'node:assert/strict';
import sinon from 'sinon';
import type { FormConfigFrame, GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
import { gridHarness, gridCaller } from '../fixtures/record-grid.fixtures';
import { Services as NamedServices, GraphqlNamedQueryConfig } from '../../src/services/NamedQueryService';
import { Services } from '../../src/services/FormVocabularyService';
import { ConstructFormConfigVisitor } from '../../src/visitor/construct.visitor';
import { VocabInlineFormConfigVisitor } from '../../src/visitor/vocab-inline.visitor';
import { ValidatorFormConfigVisitor } from '../../src/visitor/validator.visitor';
import { ClientFormConfigVisitor } from '../../src/visitor/client.visitor';
import { migrateFormConfigVerify } from '../../src/visitor/visitor-helpers';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';
import type { ReadCaller } from '../../src/record-graphql/read-record';
import { createSinonStubLogger } from '../logger.test';

const definition = (): GraphqlNamedQueryDefinition => ({
  source: 'graphql',
  name: 'lookup',
  graphql: {
    document: `query Lookup($search: String!, $first:Int, $after:String) {
    records(recordType:"grid-fixture", workflowStages:["draft"], filters:[{field:"record:oid",contains:$search}], first:$first, after:$after) {
      nodes { oid workflowStep } hasNextPage endCursor
    }
  }`,
    variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String!', required: true } },
    resultPath: ['records', 'nodes'],
    mappings: { oid: ['oid'], title: ['workflowStep'] },
    lookup: {
      mode: 'firstPage',
      collectionPath: ['records'],
      hasNextPagePath: ['records', 'hasNextPage'],
      endCursorPath: ['records', 'endCursor'],
      firstVariable: 'first',
      afterVariable: 'after',
      searchParameter: 'search',
    },
  },
});

describe('named query lookup consumer contracts', () => {
  let previous: Record<string, unknown>;
  let service: Services.FormVocabulary;
  let named: NamedServices.NamedQueryService;
  let saved: GraphqlNamedQueryDefinition;
  let h: ReturnType<typeof gridHarness>;
  let engine: { getReadSchema: sinon.SinonStub; getBootstrapReadSchema: sinon.SinonStub; execute: sinon.SinonStub };
  const logger = createSinonStubLogger(sinon);
  beforeEach(() => {
    previous = Object.fromEntries(
      [
        'RecordGraphqlService',
        'NamedQueryService',
        'FormVocabularyService',
        'BrandingService',
        'VocabularyService',
      ].map(key => [key, Reflect.get(globalThis, key)])
    );
    setupServiceTestGlobals(
      createMockSails({
        config: {
          auth: { defaultBrand: 'default', defaultPortal: 'rdmp' },
          vocab: {
            queries: {
              party: {
                querySource: 'database',
                databaseQuery: { queryName: 'lookup' },
                queryField: { property: 'search', type: 'text' },
              },
            },
          },
        },
      })
    );
    h = gridHarness(Array.from({ length: 26 }, (_, i) => `match-${i}`));
    saved = definition();
    named = new NamedServices.NamedQueryService();
    sinon
      .stub(named, 'getNamedQueryConfig')
      .callsFake(async () => new GraphqlNamedQueryConfig({ name: 'lookup', graphql: saved.graphql }));
    engine = {
      getReadSchema: sinon.stub().resolves(h.schema),
      getBootstrapReadSchema: sinon.stub().resolves(h.schema),
      execute: sinon.stub(),
    };
    engine.execute.callsFake(
      async (caller: ReadCaller, body: { query: string; variables: Record<string, unknown> }) => {
        const result = await h.query(body.query, body.variables, caller);
        return { status: result.status, data: JSON.parse(JSON.stringify(result.body)) };
      }
    );
    service = new Services.FormVocabulary();
    Object.assign(globalThis, {
      RecordGraphqlService: engine,
      NamedQueryService: named,
      FormVocabularyService: service,
      BrandingService: { getBrand: () => gridCaller.brand },
    });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    Object.assign(globalThis, previous);
  });
  const run = (search = 'match', start = 0, rows = 25, caller: ReadCaller | undefined = gridCaller) =>
    service.findRecords('party', gridCaller.brand, search, start, rows, {}, caller);

  it('keeps the database selector, dispatches the resolved source and carries a genuine bounded envelope', async () => {
    for (const rows of [3, 25, 100]) {
      const result = await run('match', 0, rows);
      assert.ok(!Array.isArray(result));
      assert.equal(result.source, 'graphql');
      assert.equal((result.records as unknown[]).length, Math.min(rows, 25));
      assert.deepEqual(result.summary, { numFound: null, start: 0, page: 1 });
      assert.deepEqual(result.pagination, { mode: 'firstPage', hasNextPage: true });
      assert.equal(engine.execute.lastCall.args[1].variables.after, null);
    }
  });
  it('suppresses empty searches before execution and rejects offsets even for empty input', async () => {
    assert.deepEqual(await run(''), {
      source: 'graphql',
      records: [],
      summary: { numFound: null, start: 0, page: 1 },
      pagination: { mode: 'firstPage', hasNextPage: false },
    });
    assert.equal(engine.execute.callCount, 0);
    await assert.rejects(run('', 1), { code: 'GRAPHQL_OFFSET_UNSUPPORTED' });
    await assert.rejects(service.findRecords('party', gridCaller.brand, '', 0, 25, {}), {
      code: 'GRAPHQL_CONTEXT_REQUIRED',
    });
  });
  it('reports valid non-lookup definitions during selection and rejects their runtime use', async () => {
    delete saved.graphql.lookup;
    saved.graphql.variables.first = { ownership: 'omitted' };
    saved.graphql.variables.after = { ownership: 'omitted' };
    const diagnostics = await service.inspectNamedQueryLookup('party', gridCaller.brand, 'rdmp');
    assert.ok(diagnostics.length);
    assert.ok(diagnostics.every(item => item.capability === 'lookup'));
    await assert.rejects(run(), { code: 'GRAPHQL_LOOKUP_CONFIG_INVALID' });
    assert.equal(engine.execute.callCount, 0);
  });
  it('validates alias search binding, wrapper fields and template incompatibility without executing records', async () => {
    const config = sails.config.vocab.queries.party;
    config.queryField.property = 'wrong';
    assert.equal(
      (await service.inspectNamedQueryLookup('party', gridCaller.brand, 'rdmp'))[0].code,
      'LOOKUP_SEARCH_BINDING'
    );
    config.queryField.property = 'search';
    assert.equal(
      (await service.inspectNamedQueryLookup('party', gridCaller.brand, 'rdmp', { valueField: 'title' }))[0].code,
      'LOOKUP_RESULT_FIELDS'
    );
    config.resultObjectMapping = { label: '{{title}}' };
    assert.equal(
      (await service.inspectNamedQueryLookup('party', gridCaller.brand, 'rdmp'))[0].code,
      'GRAPHQL_VOCAB_MAPPING_UNSUPPORTED'
    );
    assert.equal(engine.execute.callCount, 0);
  });
  it('validates JSON-authored lookups at the real config entrypoint, independently of record-save validation', async () => {
    const frame: FormConfigFrame = {
      name: 'json-form',
      componentDefinitions: [
        {
          name: 'lookup',
          component: {
            class: 'TypeaheadInputComponent',
            config: { sourceType: 'namedQuery', queryId: 'party', minChars: 0, lookupDiagnostics: [] },
          },
          model: { class: 'TypeaheadInputModel', config: {} },
        },
      ],
    };
    for (const compatible of [true, false]) {
      if (!compatible) delete saved.graphql.lookup;
      const json: FormConfigFrame = JSON.parse(JSON.stringify(frame));
      if (compatible) {
        await migrateFormConfigVerify(json, logger);
      } else {
        await assert.rejects(migrateFormConfigVerify(json, logger), /Invalid named query lookup configuration/);
      }
      assert.ok(engine.getBootstrapReadSchema.calledWith(gridCaller.brand, 'rdmp'));
      assert.equal(engine.getReadSchema.callCount, compatible ? 0 : 1);
      const form = await new ConstructFormConfigVisitor(logger).start({
        data: JSON.parse(JSON.stringify(frame)),
        formMode: 'edit',
      });
      await new VocabInlineFormConfigVisitor(logger).resolveVocabs(form, 'default', { lookupCaller: gridCaller });
      const errors = await new ValidatorFormConfigVisitor(logger).start({ form });
      // Client diagnostics describe lookup availability, not the saved record's validity.
      assert.deepEqual(errors, []);
      assert.ok(engine.getReadSchema.calledWith(gridCaller));
      const client = await new ClientFormConfigVisitor(logger).start({ form, formMode: 'edit', userRoles: [] });
      assert.ok(client);
      const config = client.componentDefinitions[0].component?.config;
      assert.ok(config && 'lookupDiagnostics' in config);
      assert.equal(Array.isArray(config.lookupDiagnostics) && config.lookupDiagnostics.length > 0, !compatible);
      assert.equal(engine.execute.callCount, 0);
    }
  });
  it('warns without refusing configuration when runtime schema inspection is unavailable', async () => {
    engine.getBootstrapReadSchema.rejects(new Error('Schema temporarily unavailable'));
    logger.warn.resetHistory();
    const form = await migrateFormConfigVerify(
      {
        name: 'unavailable',
        componentDefinitions: [
          {
            name: 'lookup',
            component: { class: 'TypeaheadInputComponent', config: { sourceType: 'namedQuery', queryId: 'party' } },
            model: { class: 'TypeaheadInputModel', config: {} },
          },
        ],
      },
      logger
    );
    assert.ok(form);
    assert.ok(logger.warn.calledWithMatch(/compatibility is unverified: LOOKUP_CONFIG_UNAVAILABLE/));
    assert.equal(engine.execute.callCount, 0);
  });
  it('uses explicit trusted brand/portal scope for config inspection without executing or borrowing a caller', async () => {
    const target = { ...gridCaller.brand, id: 'scoped-brand' };
    const getBrand = sinon.stub().withArgs('scoped').returns(target);
    const getEntries = sinon.stub().rejects(new Error('Config inspection must not fetch inline entries'));
    Object.assign(globalThis, { BrandingService: { getBrand }, VocabularyService: { getEntries } });
    const json: FormConfigFrame = JSON.parse(
      JSON.stringify({
        name: 'scoped-config',
        componentDefinitions: [
          {
            name: 'lookup',
            component: {
              class: 'TypeaheadInputComponent',
              config: { sourceType: 'namedQuery', queryId: 'party' },
            },
            model: { class: 'TypeaheadInputModel', config: {} },
          },
        ],
      })
    );
    json.componentDefinitions.push({
      name: 'inline-options',
      component: { class: 'DropdownInputComponent', config: { inlineVocab: true, vocabRef: 'not-fetched' } },
      model: { class: 'DropdownInputModel', config: {} },
    });
    await migrateFormConfigVerify(json, logger, { branding: 'scoped', portal: 'alternate' });
    assert.equal(getEntries.callCount, 0);
    assert.ok(getBrand.calledOnceWithExactly('scoped'));
    assert.ok(engine.getBootstrapReadSchema.calledOnceWithExactly(target, 'alternate'));
    assert.equal(engine.getReadSchema.callCount, 0);
    assert.equal(engine.execute.callCount, 0);
  });
});
