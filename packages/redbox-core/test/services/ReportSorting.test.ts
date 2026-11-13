import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NamedQueryResponseRecord } from '../../src/services/NamedQueryService';
import * as sinon from 'sinon';
import { reportSortFields, requestedReportSort } from '../../src/services/reports/sorting';
import { ReportConfig, ReportSource } from '../../src/model/config/ReportConfig';
import { NamedQueryConfig } from '../../src/services/NamedQueryService';
import { Services } from '../../src/services/ReportsService';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';

const brand = { id: 'brand-1' } as any;
const request = (values: Record<string, unknown> = {}) =>
  ({ param: (key: string) => values[key] }) as Sails.ReqParamProvider;
const column = (property: string, extra = {}) => ({
  property,
  label: property,
  hide: false,
  template: '',
  exportTemplate: '',
  ...extra,
});
const db = Object.assign(new ReportConfig(), {
  name: 'sorting',
  reportSource: ReportSource.database,
  databaseQuery: { queryName: 'safeQuery', secret: 'not exposed' },
  columns: [
    'title',
    'dateCreated',
    'lastSaveDate',
    'metadata.alias',
    'metadata.computed',
    'missing',
    'metadata.__proto__.x',
  ].map(p => column(p)),
});
const named = new NamedQueryConfig({
  collectionName: 'record',
  resultObjectMapping: { alias: '{{record.metadata.name}}', computed: '{{uppercase record.metadata.name}}' },
  sort: [{ lastSaveDate: 'DESC' }],
});
const schema = {
  'add-field': [
    { name: 'title', type: 'text_general', indexed: true, stored: true },
    { name: 'code', type: 'string', indexed: true, stored: true, multiValued: false },
    { name: 'tags', type: 'string', indexed: true, stored: true, multiValued: true },
  ],
  'add-dynamic-field': [{ name: 'date_*', type: 'pdate', indexed: true, stored: true }],
  'add-copy-field': [],
};
const solr = Object.assign(new ReportConfig(), {
  name: 'sorting',
  reportSource: ReportSource.solr,
  solrQuery: { searchCore: 'default', baseQuery: 'q=*:*&sort=code asc' },
  columns: ['title', 'code', 'tags', 'date_created', 'unknown', 'code desc,id'].map(p => column(p)),
});

describe('Report server sorting', () => {
  beforeEach(() => {
    setupServiceTestGlobals(
      createMockSails({
        config: { search: { serviceName: 'solrsearchservice' }, solr: { cores: { default: { schema } } } },
      })
    );
    (global as any).BrandingService = { getFullPath: () => 'http://portal' };
    (global as any).NamedQueryService = {
      getNamedQueryConfig: sinon.stub().resolves(named),
      performNamedQueryFromConfig: sinon
        .stub()
        .resolves({ summary: { numFound: 2, page: 2 }, records: [{ title: 'A' }, { title: 'Z' }] }),
    };
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    for (const key of ['RBReport', 'NamedQueryService', 'BrandingService']) Reflect.deleteProperty(globalThis, key);
    sinon.restore();
  });

  for (const directory of ['bootstrap-data', 'support/resources/development/bootstrap-data']) {
    it(`maps the stock RDMP modified date and sorts before paging and CSV (${directory})`, async () => {
      const root = resolve(__dirname, '../../../..', directory);
      const report = Object.assign(new ReportConfig(), JSON.parse(readFileSync(resolve(root, 'reports/rdmpRecords.json'), 'utf8')), { name: 'rdmpRecords' });
      const query = new NamedQueryConfig(JSON.parse(readFileSync(resolve(root, 'namedqueries/listRDMPRecords.json'), 'utf8')));
      const modified = report.columns.find(c => c.label === 'Date Modified')!;
      const row = new NamedQueryResponseRecord({ oid: 'record-1', title: 'RDMP', metadata: {},
        lastSaveDate: '2026-11-05T12:00:00.000Z', dateCreated: '2026-11-01T12:00:00.000Z' });
      assert.equal((row as any)[modified.property], row.lastSaveDate);
      assert.equal(reportSortFields(report, query).get(modified.property), 'lastSaveDate');
      (global as any).RBReport = { findOne: () => createQueryObject(report) };
      (NamedQueryService.getNamedQueryConfig as sinon.SinonStub).resolves(query);
      const execute = NamedQueryService.performNamedQueryFromConfig as sinon.SinonStub;
      execute.resolves({ summary: { numFound: 1, page: 1 }, records: [row] });
      const service = new Services.Reports();
      const dto = await service.getReportDto(report as any, brand);
      assert.equal(dto.columns.find(c => c.property === modified.property)?.sortable, true);
      for (const direction of ['asc', 'desc']) {
        const req = request({ sortField: modified.property, sortDirection: direction });
        await service.getResults(brand, 'rdmpRecords', req, 10, 5);
        assert.deepEqual(execute.lastCall.args[0].sort, [{ lastSaveDate: direction.toUpperCase() }]);
        assert.deepEqual(execute.lastCall.args.slice(3, 5), [10, 5]);
        const csv = await service.getCSVResult(brand, 'rdmpRecords', req);
        assert.deepEqual(execute.lastCall.args[0].sort, [{ lastSaveDate: direction.toUpperCase() }]);
        assert.ok(JSON.stringify(csv).includes('2026-11-05'));
      }
      assert.deepEqual(query.sort, [{ lastSaveDate: 'DESC' }]);
    });
  }

  it('maps database envelope and direct output aliases, excluding computed and unsafe fields', () => {
    assert.deepEqual(
      [...reportSortFields(db, named)],
      [
        ['title', 'metadata.title'],
        ['dateCreated', 'dateCreated'],
        ['lastSaveDate', 'lastSaveDate'],
        ['metadata.alias', 'metadata.name'],
      ]
    );
    assert.deepEqual(
      [
        ...reportSortFields(
          Object.assign(new ReportConfig(), { reportSource: 'database', columns: [column('metadata.title')] }),
          new NamedQueryConfig({ collectionName: 'record' })
        ),
      ],
      [['metadata.title', 'metadata.title']]
    );
  });

  it('maps user and other collection output fields to their actual stored paths', () => {
    const report = Object.assign(new ReportConfig(), {
      reportSource: 'database',
      columns: ['title', 'metadata.name', 'lastSaveDate', 'dateCreated'].map(p => column(p)),
    });
    assert.deepEqual(
      [...reportSortFields(report, new NamedQueryConfig({ collectionName: 'user' }))],
      [
        ['metadata.name', 'name'],
        ['lastSaveDate', 'updatedAt'],
        ['dateCreated', 'createdAt'],
      ]
    );
    assert.deepEqual(
      [...reportSortFields(report, new NamedQueryConfig({ collectionName: 'custom' }))],
      [
        ['metadata.name', 'name'],
        ['lastSaveDate', 'lastSaveDate'],
        ['dateCreated', 'dateCreated'],
      ]
    );
  });

  it('allows only schema-supported single-value Solr fields, including dynamic dates', () => {
    assert.deepEqual(
      [...reportSortFields(solr, undefined, schema)],
      [
        ['code', 'code'],
        ['date_created', 'date_created'],
      ]
    );
    assert.equal(reportSortFields(solr).size, 0);
  });

  it('ignores missing, malformed, hidden, multivalue and injected sort input for both sources', () => {
    for (const fields of [reportSortFields(db, named), reportSortFields(solr, undefined, schema)]) {
      for (const params of [
        {},
        { sortField: { $where: 'x' }, sortDirection: 'asc' },
        { sortField: ['title'], sortDirection: 'asc' },
        { sortField: 'title desc,id', sortDirection: 'asc' },
        { sortField: 'title', sortDirection: { $gt: '' } },
        { sortField: 'title', sortDirection: 'ASC' },
      ]) {
        assert.equal(requestedReportSort(request(params), fields), undefined);
      }
    }
    const hidden = Object.assign(new ReportConfig(), {
      ...db,
      columns: [column('title', { hide: true }), column('metadata.alias', { multivalue: true })],
    });
    assert.equal(reportSortFields(hidden, named).size, 0);
  });

  it('applies database sort before paging and identically to CSV without mutating the named query', async () => {
    (global as any).RBReport = { findOne: () => createQueryObject(db) };
    const service = new Services.Reports();
    const execute = NamedQueryService.performNamedQueryFromConfig as sinon.SinonStub;
    for (const direction of ['asc', 'desc']) {
      const req = request({ sortField: 'metadata.alias', sortDirection: direction });
      await service.getResults(brand, 'sorting', req, 10, 5);
      assert.deepEqual(execute.lastCall.args[0].sort, [{ 'metadata.name': direction.toUpperCase() }]);
      assert.deepEqual(execute.lastCall.args.slice(3, 5), [10, 5]);
      await service.getCSVResult(brand, 'sorting', req);
      assert.deepEqual(execute.lastCall.args[0].sort, [{ 'metadata.name': direction.toUpperCase() }]);
    }
    await service.getResults(brand, 'sorting', request());
    assert.equal(execute.lastCall.args[0], named);
    assert.deepEqual(named.sort, [{ lastSaveDate: 'DESC' }]);
  });

  it('maps Solr clauses in both directions and uses the same clause for CSV', async () => {
    (global as any).RBReport = { findOne: () => createQueryObject(solr) };
    const search = sinon.stub().resolves({ response: { numFound: 1, start: 10, docs: [{ code: 'A' }] } });
    (sails.services as any).solrsearchservice = { searchAdvanced: search };
    const service = new Services.Reports();
    for (const direction of ['asc', 'desc']) {
      const req = request({ sortField: 'code', sortDirection: direction });
      await service.getResults(brand, 'sorting', req, 10, 5);
      assert.deepEqual(search.lastCall.args[2].getAll('sort'), [`code ${direction}`]);
      assert.equal(search.lastCall.args[2].get('start'), '10');
      await service.getCSVResult(brand, 'sorting', req);
      assert.deepEqual(search.lastCall.args[2].getAll('sort'), [`code ${direction}`]);
    }
    await service.getResults(brand, 'sorting', request({ sortField: 'title', sortDirection: 'asc' }));
    assert.deepEqual(search.lastCall.args[2].getAll('sort'), ['code asc', 'date_object_modified desc']);
  });

  it('exposes only safe viewer source metadata and column capabilities', async () => {
    const service = new Services.Reports();
    const dto = await service.getReportDto(db as any, brand);
    assert.deepEqual(dto.databaseQuery, { queryName: 'safeQuery' });
    assert.equal(dto.reportSource, 'database');
    assert.equal(dto.columns.find(c => c.property === 'metadata.computed')?.sortable, false);
    assert.equal(dto.columns.find(c => c.property === 'title')?.sortable, true);
    assert.equal('solrQuery' in dto, false);
    assert.equal('mongoQuery' in dto, false);
    const solrDto = await service.getReportDto(solr as any, brand);
    assert.equal(solrDto.reportSource, 'solr');
    assert.equal(solrDto.databaseQuery, null);
    assert.equal('solrQuery' in solrDto, false);
  });
});
