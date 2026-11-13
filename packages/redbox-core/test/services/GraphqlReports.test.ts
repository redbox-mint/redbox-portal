import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import type { BuildResponseType } from '../../src/model';
import sinon from 'sinon';
import type { GraphqlNamedQueryDefinition } from '@researchdatabox/sails-ng-common';
import { gridHarness, gridCaller, gridContracts } from '../fixtures/record-grid.fixtures';
import { fieldName, metadataTypeName } from '../../src/record-graphql/renderer';
import { executeGraphqlNamedQuery } from '../../src/services/named-query/graphql-execution';
import { createMockSails, createQueryObject } from './testHelper';
import {
  graphqlQueryVersion,
  graphqlReportPage,
  graphqlReportCsv,
  GraphqlReportError,
  graphqlQueryVersionMatches,
} from '../../src/services/reports/graphql';
import { Services } from '../../src/services/ReportsService';
import { Controllers } from '../../src/controllers/ReportController';
import { ReportSource } from '../../src/model/config/ReportConfig';
import type { ReadCaller } from '../../src/record-graphql/read-record';
import type { RecordGraphqlResponse } from '../../src/services/RecordGraphqlService';
import { GraphqlNamedQueryConfig } from '../../src/services/NamedQueryService';

class ReportControllerHarness extends Controllers.Report {
  public override sendResp(req: Sails.Req, res: Sails.Res, options?: BuildResponseType): Response {
    return super.sendResp(req, res, options);
  }
  public override updateChronicle(_req: Sails.Req): void {}
}

const definition = (): GraphqlNamedQueryDefinition => ({
  name: 'scoped',
  source: 'graphql',
  graphql: {
    document:
      'query($search:String = "fixture",$first:Int,$after:String){records(filters:[{field:"metadata:/title",contains:$search}],recordType:"grid-fixture",first:$first,after:$after){nodes{oid workflowStep}hasNextPage endCursor}}',
    variables: { search: { ownership: 'consumer', parameter: 'search', inputType: 'String', required: false } },
    resultPath: ['records', 'nodes'],
    mappings: { oid: ['oid'], title: ['workflowStep'], metadata: [] },
    lookup: {
      mode: 'firstPage',
      searchParameter: 'search',
      collectionPath: ['records'],
      hasNextPagePath: ['records', 'hasNextPage'],
      endCursorPath: ['records', 'endCursor'],
      firstVariable: 'first',
      afterVariable: 'after',
    },
  },
});
const code = (expected: string) => (error: unknown) =>
  error instanceof Error && 'code' in error && error.code === expected;

const executionChanges: Array<[string, (query: GraphqlNamedQueryDefinition & { branding?: string }) => void]> = [
  [
    'name',
    query => {
      query.name = 'renamed';
    },
  ],
  [
    'branding',
    query => {
      query.branding = 'other';
    },
  ],
  [
    'document',
    query => {
      query.graphql.document = query.graphql.document.replace('oid workflowStep', 'oid');
    },
  ],
  [
    'operation name',
    query => {
      query.graphql.operationName = 'Other';
    },
  ],
  [
    'variable binding',
    query => {
      query.graphql.variables.search = {
        ownership: 'consumer',
        parameter: 'title',
        inputType: 'String',
        required: false,
      };
    },
  ],
  [
    'variable default',
    query => {
      query.graphql.variables.search = {
        ownership: 'consumer',
        parameter: 'search',
        inputType: 'String',
        required: false,
        defaultValue: 'other',
      };
    },
  ],
  [
    'variable ownership',
    query => {
      query.graphql.variables.search = { ownership: 'fixed', value: 'fixture' };
    },
  ],
  [
    'fixed variable value',
    query => {
      query.graphql.variables.first = { ownership: 'fixed', value: 10 };
    },
  ],
  [
    'variable type',
    query => {
      query.graphql.variables.search = { ownership: 'consumer', parameter: 'search', inputType: 'ID', required: false };
    },
  ],
  [
    'required variable',
    query => {
      query.graphql.variables.search = {
        ownership: 'consumer',
        parameter: 'search',
        inputType: 'String',
        required: true,
      };
    },
  ],
  [
    'mapping',
    query => {
      query.graphql.mappings!.title = ['oid'];
    },
  ],
  [
    'resultPath',
    query => {
      query.graphql.resultPath = ['records'];
    },
  ],
  [
    'lookup',
    query => {
      query.graphql.lookup!.afterVariable = 'next';
    },
  ],
];

// Reproduce the persisted pre-v2 algorithm independently of the version matcher.
function legacyQueryVersion(query: unknown): string {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .map(key => [key, canonical(Reflect.get(value, key))])
      );
    return value;
  };
  return createHash('sha256')
    .update(JSON.stringify(canonical(query)))
    .digest('hex');
}

describe('GraphQL report query versions', () => {
  const resolved = () => new GraphqlNamedQueryConfig({ ...definition(), branding: 'default', key: 'default_scoped' });
  it('uses a namespaced version stable across persistence and key order', () => {
    const query = resolved();
    assert.match(graphqlQueryVersion(query), /^v2:[a-f0-9]{64}$/);
    const persisted = JSON.parse(JSON.stringify(query));
    persisted.graphql.variables.search = {
      required: false,
      inputType: 'String',
      parameter: 'search',
      ownership: 'consumer',
    };
    assert.equal(graphqlQueryVersion(persisted), graphqlQueryVersion(query));
  });
  it('keeps the version after a description-only change', () => {
    const query = resolved();
    query.description = 'Original description';
    const version = graphqlQueryVersion(query);
    query.description = 'Clearer description';
    assert.equal(graphqlQueryVersion(query), version);
  });
  it('keeps the version after a provenance-only change', () => {
    const query = resolved();
    query.graphql.provenance = { explorerId: 'original', explorerRevision: 1, explorerPortal: 'rdmp' };
    const version = graphqlQueryVersion(query);
    query.graphql.provenance = { explorerId: 'copy', explorerRevision: 2, explorerPortal: 'other' };
    assert.equal(graphqlQueryVersion(query), version);
  });
  it('excludes derived storage keys and descriptive source links', () => {
    const query: GraphqlNamedQueryDefinition & { branding: string; key: string } = {
      ...resolved(),
      sourceSavedQuery: null,
    };
    const version = graphqlQueryVersion(query);
    query.key = 'derived-key';
    query.sourceSavedQuery = {
      id: 'copy',
      publishedRevision: 1,
      revision: 2,
      name: 'Renamed explorer',
      recordType: 'grid-fixture',
      recordTypeLabel: 'Fixture',
      mode: 'graphql',
      updatedAt: null,
      updatedBy: null,
      missing: false,
      changedSincePublished: true,
    };
    assert.equal(graphqlQueryVersion(query), version);
  });
  for (const [field, change] of executionChanges)
    it(`changes the version after a change to ${field}`, () => {
      const query = resolved();
      const version = graphqlQueryVersion(query);
      change(query);
      assert.notEqual(graphqlQueryVersion(query), version);
    });
  it('accepts legacy hashes only for the exact current full definition', () => {
    const query = resolved();
    const legacy = legacyQueryVersion(query);
    assert.equal(graphqlQueryVersionMatches(query, legacy), true);
    assert.equal(graphqlQueryVersionMatches(query, undefined), false);
    assert.equal(graphqlQueryVersionMatches(query, 'v3:' + legacy), false);
    query.description = 'Changed since legacy save';
    assert.equal(graphqlQueryVersionMatches(query, legacy), false);
  });
});

describe('GraphQL reports security and bounded export', () => {
  const names = ['sails', 'RecordGraphqlService', 'NamedQueryService', 'RBReport', 'BrandingService', 'ReportsService'];
  let originals: Map<string, PropertyDescriptor | undefined>;
  let h: ReturnType<typeof gridHarness>;
  let query: GraphqlNamedQueryDefinition;
  let report: ReturnType<typeof makeReport>;
  let service: Services.Reports;
  let execute: sinon.SinonSpy;
  function makeReport() {
    return {
      id: 'report-1',
      name: 'report',
      title: 'Fixture',
      reportSource: ReportSource.database,
      databaseQuery: { queryName: 'scoped', queryVersion: graphqlQueryVersion(query) },
      solrQuery: null,
      filter: [],
      columns: [{ label: 'OID', property: 'oid', hide: false, template: '', exportTemplate: '' }],
    };
  }
  beforeEach(() => {
    originals = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
    h = gridHarness(Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')));
    query = definition();
    report = makeReport();
    Reflect.set(
      globalThis,
      'sails',
      createMockSails({
        config: {
          recordGraphql: {
            enabled: true,
            cursorSecret: h.environment.cursorSecret,
            reportExport: { maxRows: 1000, maxPages: 100, timeoutMs: 5000, maxBytes: 1048576 },
          },
        },
      })
    );
    execute = sinon.spy(async (caller: ReadCaller, body: { query: string; variables: Record<string, unknown> }) => {
      const result = await h.query(body.query, body.variables, caller);
      return { status: result.status, data: result.body };
    });
    Reflect.set(globalThis, 'RecordGraphqlService', { getReadSchema: async () => h.schema, execute });
    Reflect.set(globalThis, 'NamedQueryService', { getNamedQueryConfig: async () => query });
    Reflect.set(globalThis, 'RBReport', { findOne: () => createQueryObject(report) });
    Reflect.set(globalThis, 'BrandingService', {
      getBrand: () => gridCaller.brand,
      getFullPath: () => '/default/rdmp',
    });
    service = new Services.Reports();
    Reflect.set(globalThis, 'ReportsService', service);
  });
  afterEach(() => {
    sinon.restore();
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  });
  const author = {
    brand: gridCaller.brand,
    user: { id: 'viewer', username: 'viewer', type: 'local', name: 'Viewer', email: 'viewer@example.test', roles: [] },
  };
  const preview = () =>
    service.previewConfig(
      gridCaller.brand,
      { ...report, readOnly: false, canEdit: true, canDelete: true, canPreview: true },
      { param: () => undefined },
      {
        portal: gridCaller.portal,
        caller: author,
        graphqlCaller: gridCaller,
      }
    );
  function activePlans() {
    const original = gridContracts()[0];
    const ethics = 'uon:ethicsApprovalStatus';
    const start = 'dc:coverage_vivo:DateTimeInterval_vivo:start';
    const contract: ReturnType<typeof gridContracts>[number] = {
      ...original,
      context: { ...original.context, recordType: 'rdmp', workflowStep: 'active', form: 'active-form' },
      root: {
        ...original.root,
        properties: {
          ...original.root.properties,
          [ethics]: { kind: 'scalar', scalarType: 'string', nullable: true },
          [start]: { kind: 'scalar', scalarType: 'string', nullable: true },
        },
      },
    };
    h = gridHarness(
      Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0')),
      [contract]
    );
    for (const record of h.records.values()) {
      record.metaMetadata.type = 'rdmp';
      record.metaMetadata.form = 'active-form';
      record.workflow.stage = 'active';
      record.metadata[ethics] = 'Approved';
      record.metadata[start] = '2026-01-01';
    }
    const variant = metadataTypeName(contract);
    query = {
      name: 'ActivePlans',
      source: 'graphql',
      graphql: {
        document: `query GridPage($type: String!, $stages: [String!], $sort: [RecordSortInput!], $first: Int, $after: String) {
          records(recordType: $type, workflowStages: $stages, filters: [], sort: $sort, first: $first, after: $after) {
            nodes { oid workflowStep metadata { __typename
              ... on ${variant} { explorer_field_1: title }
              ... on ${variant} { explorer_field_2: ${fieldName(ethics)} }
              ... on ${variant} { explorer_field_3: ${fieldName(start)} }
            } }
            hasNextPage endCursor
          }
        }`,
        variables: {
          type: { ownership: 'fixed', value: 'rdmp' },
          stages: { ownership: 'fixed', value: ['active'] },
          sort: { ownership: 'fixed', value: [{ field: 'metadata:/title', direction: 'ASC' }] },
          first: { ownership: 'fixed', value: 25 },
          after: { ownership: 'fixed', value: null },
        },
        resultPath: ['records', 'nodes'],
        mappings: { oid: ['oid'], metadata: ['metadata'] },
      },
    };
    report.databaseQuery = { queryName: 'ActivePlans', queryVersion: graphqlQueryVersion(query) };
  }
  it('describes ActivePlans without lookup title/search mappings and offers all repeated-fragment fields', async () => {
    activePlans();
    const description = await service.describeQuery(
      gridCaller.brand,
      gridCaller.portal,
      author,
      report.databaseQuery.queryName
    );
    assert.equal(description.valid, true, JSON.stringify(description.diagnostics));
    assert.ok(description.compatibleQueryVersions?.includes(legacyQueryVersion(query)));
    assert.deepEqual(description.diagnostics, []);
    assert.deepEqual(
      description.result.fields.map(field => field.path),
      ['oid', 'metadata', 'metadata.explorer_field_1', 'metadata.explorer_field_2', 'metadata.explorer_field_3']
    );
    assert.equal((await service.validateConfig(gridCaller.brand, gridCaller.portal, author, report)).valid, true);
  });
  it('runs two ActivePlans pages, CSV and preview without a title mapping', async () => {
    activePlans();
    report.columns.push(
      ...[1, 2, 3].map(i => ({
        label: `Field ${i}`,
        property: `metadata.explorer_field_${i}`,
        hide: false,
        template: '',
        exportTemplate: '',
      }))
    );
    const before = structuredClone(query);
    const page = await graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 25, gridCaller);
    assert.equal(page.records.length, 25);
    assert.equal(Object.hasOwn(page.records[0], 'title'), false);
    assert.equal(page.pagination.hasNextPage, true);
    const next = await graphqlReportPage(
      gridCaller.brand,
      report,
      query,
      {},
      page.pagination.nextCursor,
      25,
      gridCaller
    );
    assert.equal(next.pagination.start, 25);
    assert.equal(next.records[0].oid, '25');
    const csv = await service.getCSVResult(
      gridCaller.brand,
      'report',
      { param: () => undefined },
      0,
      undefined,
      undefined, gridCaller
    );
    assert.equal(csv.trim().split('\n').length, 61);
    assert.match(csv, /00,00,Approved,2026-01-01/);
    const sample = await preview();
    assert.equal(sample.valid, true);
    assert.equal(sample.records.length, 25);
    assert.deepEqual(
      sample.renderedRows[0].cells.map(cell => cell.export),
      ['00', '00', 'Approved', '2026-01-01']
    );
    assert.deepEqual(query, before);
  });
  it('keeps unpaged queries blocked in describe, page, CSV and preview', async () => {
    activePlans();
    query.graphql.document = query.graphql.document.replace('hasNextPage endCursor', 'hasNextPage');
    report.databaseQuery.queryVersion = graphqlQueryVersion(query);
    await assert.rejects(
      service.describeQuery(gridCaller.brand, gridCaller.portal, author, report.databaseQuery.queryName),
      code('GRAPHQL_REPORT_PAGING_REQUIRED')
    );
    await assert.rejects(
      graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 25, gridCaller),
      code('GRAPHQL_REPORT_PAGING_REQUIRED')
    );
    await assert.rejects(
      service.getCSVResult(gridCaller.brand, 'report', { param: () => undefined }, 0, undefined, undefined, gridCaller),
      code('GRAPHQL_REPORT_PAGING_REQUIRED')
    );
    await assert.rejects(preview(), code('GRAPHQL_REPORT_PAGING_REQUIRED'));
  });
  it('still refuses ActivePlans as a typeahead query without title/search mappings', async () => {
    activePlans();
    await assert.rejects(
      executeGraphqlNamedQuery(query, {}, gridCaller.brand, 0, 25, gridCaller),
      code('GRAPHQL_LOOKUP_UNSUPPORTED')
    );
  });
  it('keeps invalid configured paging blocked even when lookup mappings are also missing', async () => {
    activePlans();
    query.graphql.lookup = {
      mode: 'firstPage',
      collectionPath: ['records'],
      firstVariable: 'first',
      afterVariable: 'after',
      hasNextPagePath: ['records', 'hasNextPage'],
      endCursorPath: ['records', 'hasNextPage'],
      searchParameter: 'search',
    };
    delete query.graphql.variables.first;
    delete query.graphql.variables.after;
    report.databaseQuery.queryVersion = graphqlQueryVersion(query);
    const description = await service.describeQuery(
      gridCaller.brand,
      gridCaller.portal,
      author,
      report.databaseQuery.queryName
    );
    assert.equal(description.valid, false);
    assert.ok(description.diagnostics.some(item => item.code === 'GRAPHQL_REPORT_PAGING_REQUIRED'));
    await assert.rejects(
      graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 25, gridCaller),
      code('GRAPHQL_REPORT_PAGING_REQUIRED')
    );
  });
  it('does not require lookup identifier mappings for reports either', async () => {
    activePlans();
    delete query.graphql.mappings!.oid;
    report.databaseQuery.queryVersion = graphqlQueryVersion(query);
    assert.equal(
      (await service.describeQuery(gridCaller.brand, gridCaller.portal, author, report.databaseQuery.queryName)).valid,
      true
    );
    assert.equal(
      (await graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 25, gridCaller)).records.length,
      25
    );
  });
  for (const legacy of [false, true]) {
    it(`runs page, CSV and preview with ${legacy ? 'an unchanged legacy' : 'a v2'} binding`, async () => {
      if (legacy) report.databaseQuery.queryVersion = legacyQueryVersion(query);
      const page = await service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 0, 25, undefined, gridCaller);
      assert.equal(page.records.length, 25);
      const csv = await service.getCSVResult(
        gridCaller.brand,
        'report',
        { param: () => undefined },
        0,
        undefined,
        undefined, gridCaller
      );
      assert.equal(csv.trim().split('\n').length, 61);
      assert.equal((await preview()).records.length, 25);
      assert.equal((await service.validateConfig(gridCaller.brand, gridCaller.portal, author, report)).valid, true);
    });
    for (const [field, change] of executionChanges)
      it(`rejects ${field} drift in page, CSV and preview with ${legacy ? 'a legacy' : 'a v2'} binding`, async () => {
        if (legacy) report.databaseQuery.queryVersion = legacyQueryVersion(query);
        change(query);
        const conflict = (error: unknown) =>
          error instanceof GraphqlReportError && error.code === 'REPORT_QUERY_CHANGED' && error.status === 409;
        await assert.rejects(
          service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 0, 25, undefined, gridCaller),
          conflict
        );
        await assert.rejects(
          service.getCSVResult(gridCaller.brand, 'report', { param: () => undefined }, 0, undefined, undefined, gridCaller),
          conflict
        );
        await assert.rejects(preview(), conflict);
        assert.equal(execute.callCount, 0);
      });
  }
  it('keeps page continuations, CSV and preview usable after descriptive changes', async () => {
    const page = await graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 25, gridCaller);
    query.description = 'Updated description';
    query.graphql.provenance = { explorerId: 'copy', explorerRevision: 2, explorerPortal: 'rdmp' };
    const next = await graphqlReportPage(
      gridCaller.brand,
      report,
      query,
      {},
      page.pagination.nextCursor,
      25,
      gridCaller
    );
    assert.equal(next.pagination.start, 25);
    assert.equal((await preview()).records.length, 25);
    const csv = await service.getCSVResult(
      gridCaller.brand,
      'report',
      { param: () => undefined },
      0,
      undefined,
      undefined, gridCaller
    );
    assert.equal(csv.trim().split('\n').length, 61);
  });
  it('supports general explorer publications without requiring a lookup search parameter', async () => {
    query.graphql.document =
      'query($first:Int,$after:String){records(recordType:"grid-fixture",first:$first,after:$after){nodes{oid workflowStep}hasNextPage endCursor}}';
    query.graphql.variables = { first: { ownership: 'fixed', value: 50 }, after: { ownership: 'fixed', value: null } };
    delete query.graphql.lookup;
    report = makeReport();
    const page = await service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 0, 25, undefined, gridCaller);
    assert.equal(page.records.length, 25);
    const csv = await service.getCSVResult(
      gridCaller.brand,
      'report',
      { param: () => undefined },
      0,
      undefined,
      undefined, gridCaller
    );
    assert.equal(csv.trim().split('\n').length, 61);
  });
  it('uses the viewer and actual per-record ACL filtering in rows and complete CSV', async () => {
    h.denied.add('01');
    h.denied.add('28');
    const page = await service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 0, 25, undefined, gridCaller);
    assert.equal(page.total, null);
    assert.ok(!page.records.some(row => row.oid === '01'));
    const csv = await service.getCSVResult(
      gridCaller.brand,
      'report',
      { param: () => undefined },
      0,
      undefined,
      undefined, gridCaller
    );
    assert.equal(csv.trim().split('\n').length, 59);
    assert.ok(!/^01\r?$/m.test(csv));
    assert.ok(!/^28\r?$/m.test(csv));
    assert.ok(/^59\r?$/m.test(csv));
    assert.ok(execute.getCalls().every(call => call.args[0] === gridCaller));
  });
  for (const caller of [
    undefined,
    { ...gridCaller, portal: '' },
    { ...gridCaller, brand: { ...gridCaller.brand, id: 'other' } },
    { ...gridCaller, user: {} },
  ])
    it('fails closed without a complete trusted matching viewer context', async () => {
      await assert.rejects(
        service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 0, 25, undefined, caller),
        code('GRAPHQL_CONTEXT_REQUIRED')
      );
      await assert.rejects(
        service.getCSVResult(gridCaller.brand, 'report', { param: () => undefined }, 0, undefined, undefined, caller),
        code('GRAPHQL_CONTEXT_REQUIRED')
      );
      assert.equal(execute.callCount, 0);
    });
  it('pages once per request using opaque report tokens and rejects offsets', async () => {
    const first = await graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 2, gridCaller);
    assert.equal(execute.callCount, 1);
    assert.equal(first.pagination.start, 0);
    const next = await graphqlReportPage(
      gridCaller.brand,
      report,
      query,
      {},
      first.pagination.nextCursor,
      2,
      gridCaller
    );
    assert.equal(execute.callCount, 2);
    assert.equal(next.pagination.start, 2);
    assert.notDeepEqual(next.records, first.records);
    await assert.rejects(
      service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 2, 2, undefined, gridCaller),
      /REPORT_OFFSET_UNSUPPORTED/
    );
  });
  it('rejects tampered, raw engine, noncanonical and oversized cursors before execution', async () => {
    const page = await graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 2, gridCaller);
    const token = page.pagination.nextCursor!;
    for (const value of [
      token.slice(0, 20) + '!' + token.slice(21),
      token.slice(0, 20) + (token[20] === 'A' ? 'B' : 'A') + token.slice(21),
      token + '=',
      'x'.repeat(17000),
      (await execute.lastCall.returnValue).data.data.records.endCursor,
      {},
      12,
    ]) {
      if (value === null) continue;
      await assert.rejects(
        graphqlReportPage(gridCaller.brand, report, query, {}, value, 2, gridCaller),
        code('REPORT_CURSOR_INVALID')
      );
    }
    assert.equal(execute.callCount, 1);
  });
  it('binds continuation to report, query version, parameters, page size, user, roles, brand and portal', async () => {
    const page = await graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 2, gridCaller),
      token = page.pagination.nextCursor;
    const alternatives: Array<[typeof report, Record<string, unknown>, number, ReadCaller]> = [
      [{ ...report, name: 'other' }, {}, 2, gridCaller],
      [{ ...report, title: 'changed' }, {}, 2, gridCaller],
      [report, { search: 'other' }, 2, gridCaller],
      [report, {}, 3, gridCaller],
      [report, {}, 2, { ...gridCaller, user: { username: 'another' } }],
      [report, {}, 2, { ...gridCaller, roles: [{ name: 'Other' }] }],
      [report, {}, 2, { ...gridCaller, portal: 'other' }],
    ];
    for (const [r, p, size, caller] of alternatives)
      await assert.rejects(
        graphqlReportPage(gridCaller.brand, r, query, p, token, size, caller),
        code('REPORT_CURSOR_INVALID')
      );
    query.graphql.variables = { unused: { ownership: 'omitted' } };
    await assert.rejects(
      graphqlReportPage(gridCaller.brand, report, query, {}, token, 2, gridCaller),
      code('REPORT_QUERY_CHANGED')
    );
    assert.equal(execute.callCount, 1);
  });
  it('expires issued report cursors', async () => {
    const page = await graphqlReportPage(gridCaller.brand, report, query, {}, undefined, 2, gridCaller);
    const clock = sinon.useFakeTimers({ now: Date.now() + 3600001, toFake: ['Date'] });
    try {
      await assert.rejects(
        graphqlReportPage(gridCaller.brand, report, query, {}, page.pagination.nextCursor, 2, gridCaller),
        code('REPORT_CURSOR_INVALID')
      );
    } finally {
      clock.restore();
    }
  });
  for (const [key, value, error] of [
    ['maxRows', 26, 'REPORT_EXPORT_ROW_LIMIT'],
    ['maxPages', 1, 'REPORT_EXPORT_PAGE_LIMIT'],
    ['maxBytes', 20, 'REPORT_EXPORT_BYTE_LIMIT'],
  ] as const)
    it(`returns an explicit ${key} error and no partial CSV`, async () => {
      sails.config.recordGraphql.reportExport![key] = value;
      let rendered = false;
      await assert.rejects(
        graphqlReportCsv(gridCaller.brand, report, query, {}, gridCaller, () => {
          rendered = true;
          return 'partial';
        }),
        code(error)
      );
      assert.equal(rendered, false);
    });
  it('returns a complete CSV at exactly the configured row/page bounds', async () => {
    sails.config.recordGraphql.reportExport!.maxRows = 60;
    sails.config.recordGraphql.reportExport!.maxPages = 3;
    const csv = await service.getCSVResult(
      gridCaller.brand,
      'report',
      { param: () => undefined },
      0,
      undefined,
      undefined, gridCaller
    );
    assert.equal(csv.trim().split('\n').length, 61);
  });
  it('bounds pending execution by the export wall-clock deadline', async () => {
    sails.config.recordGraphql.reportExport!.timeoutMs = 10;
    Reflect.set(globalThis, 'RecordGraphqlService', { getReadSchema: () => new Promise(() => {}), execute });
    await assert.rejects(
      service.getCSVResult(gridCaller.brand, 'report', { param: () => undefined }, 0, undefined, undefined, gridCaller),
      code('REPORT_EXPORT_TIMEOUT')
    );
    assert.equal(execute.callCount, 0);
  });
  it('detects source changes between export pages and before sending the completed file', async () => {
    const original = execute;
    const initialQuery = structuredClone(query);
    let changeOnPage = 1;
    Reflect.set(globalThis, 'RecordGraphqlService', {
      getReadSchema: async () => h.schema,
      execute: async (...args: Parameters<typeof RecordGraphqlService.execute>) => {
        const result = await original(...args);
        if (execute.callCount === changeOnPage)
          query = { ...query, graphql: { ...query.graphql, document: query.graphql.document + ' ' } };
        return result;
      },
    });
    for (changeOnPage of [1, 3]) {
      query = structuredClone(initialQuery);
      execute.resetHistory();
      await assert.rejects(
        service.getCSVResult(gridCaller.brand, 'report', { param: () => undefined }, 0, undefined, undefined, gridCaller),
        code('REPORT_QUERY_CHANGED')
      );
      assert.equal(execute.callCount, changeOnPage);
    }
  });
  it('rechecks current record ACLs and reads changed values during a live export', async () => {
    report.columns.push({ label: 'Title', property: 'title', hide: false, template: '', exportTemplate: '' });
    const original = execute;
    Reflect.set(globalThis, 'RecordGraphqlService', {
      getReadSchema: async () => h.schema,
      execute: async (...args: Parameters<typeof RecordGraphqlService.execute>) => {
        const result = await original(...args);
        if (execute.callCount === 1) {
          h.denied.add('40');
          h.records.get('41')!.workflow.stage = 'published';
          h.records.get('41')!.metaMetadata.form = 'published-form';
        }
        return result;
      },
    });
    const csv = await service.getCSVResult(
      gridCaller.brand,
      'report',
      { param: () => undefined },
      0,
      undefined,
      undefined, gridCaller
    );
    assert.ok(!/^40,/m.test(csv));
    assert.match(csv, /^41,published\r?$/m);
    assert.ok(!/^41,draft\r?$/m.test(csv));
    assert.equal(csv.trim().split('\n').length, 60);
  });
  it('rejects a nonadvancing engine continuation instead of looping', async () => {
    Reflect.set(globalThis, 'RecordGraphqlService', {
      getReadSchema: async () => h.schema,
      execute: async (
        _caller: ReadCaller,
        body: { variables: Record<string, unknown> }
      ): Promise<RecordGraphqlResponse> => ({
        status: 200,
        data: {
          data: {
            records: {
              nodes: Array.from({ length: Number(body.variables.first) }, () => ({ oid: 'a', workflowStep: 'draft' })),
              hasNextPage: true,
              endCursor: 'repeated',
            },
          },
        },
      }),
    });
    await assert.rejects(
      service.getCSVResult(gridCaller.brand, 'report', { param: () => undefined }, 0, undefined, undefined, gridCaller),
      code('REPORT_CURSOR_INVALID')
    );
  });
  it('requires version binding on persisted and previewed GraphQL reports', async () => {
    report.databaseQuery.queryVersion = 'old';
    await assert.rejects(
      service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 0, 25, undefined, gridCaller),
      code('REPORT_QUERY_CHANGED')
    );
  });
  it('rejects a bound query changed to a database source before execution', async () => {
    Reflect.set(globalThis, 'NamedQueryService', {
      getNamedQueryConfig: async () => ({ name: 'scoped', collection: 'record' }),
    });
    await assert.rejects(
      service.getResults(gridCaller.brand, 'report', { param: () => undefined }, 0, 25, undefined, gridCaller),
      code('REPORT_QUERY_CHANGED')
    );
    await assert.rejects(
      service.getCSVResult(gridCaller.brand, 'report', { param: () => undefined }, 0, undefined, undefined, gridCaller),
      code('REPORT_QUERY_CHANGED')
    );
    assert.equal(execute.callCount, 0);
  });
  it('derives controller caller from authenticated request state, ignoring supplied body identity', async () => {
    const controller = new ReportControllerHarness();
    const send = sinon.stub(controller, 'sendResp').callsFake((_req, res) => res);
    sinon.stub(controller, 'updateChronicle');
    const request = {
      session: { branding: 'default', portal: gridCaller.portal },
      isAuthenticated: () => true,
      user: { ...gridCaller.user, roles: gridCaller.roles },
      param: (key: string) => (key === 'name' ? 'report' : undefined),
      body: { user: { username: 'admin' }, roles: [{ name: 'Admin' }] },
    };
    const attachment = sinon.spy();
    const response = {
      attachment,
      set: sinon.stub().returnsThis(),
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
    await controller.downloadCSV(request as unknown as Sails.Req, response as unknown as Sails.Res);
    assert.equal(attachment.callCount, 1);
    assert.equal(send.callCount, 0);
    assert.equal(execute.firstCall.args[0].user.username, gridCaller.user.username);
    assert.equal(execute.firstCall.args[0].portal, gridCaller.portal);
  });
  it('controller returns a safe limit error with no attachment', async () => {
    sails.config.recordGraphql.reportExport!.maxRows = 1;
    const controller = new ReportControllerHarness();
    sinon.stub(controller, 'updateChronicle');
    const send = sinon.stub(controller, 'sendResp').callsFake((_req, res) => res);
    const response = {
      attachment: sinon.spy(),
      set: sinon.stub().returnsThis(),
      status: sinon.stub().returnsThis(),
      send: sinon.stub().returnsThis(),
    };
    const request = {
      session: { branding: 'default', portal: gridCaller.portal },
      isAuthenticated: () => true,
      user: { ...gridCaller.user, roles: gridCaller.roles },
      param: (key: string) => (key === 'name' ? 'report' : undefined),
    };
    await controller.downloadCSV(request as unknown as Sails.Req, response as unknown as Sails.Res);
    assert.equal(response.attachment.callCount, 0);
    assert.equal(send.firstCall.args[2]!.status, 413);
    assert.deepEqual(send.firstCall.args[2]!.data, { status: false, message: 'REPORT_EXPORT_ROW_LIMIT' });
  });
});
