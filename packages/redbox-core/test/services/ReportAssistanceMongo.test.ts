import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { MongoClient, type Collection } from 'mongodb';
import * as sinon from 'sinon';
import type { ReportConfigDto } from '@researchdatabox/sails-ng-common';
import { Services as Reports } from '../../src/services/ReportsService';
import { Services as Queries, NamedQueryConfig } from '../../src/services/NamedQueryService';
import { Services as Editors } from '../../src/services/NamedQueryEditorService';
import { Services as Sanitizers } from '../../src/services/DomSanitizerService';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import { dompurify } from '../../src/config/dompurify.config';
import { setupServiceTestGlobals, cleanupServiceTestGlobals, createMockSails, createQueryObject } from './testHelper';

describe('Report assistance native Mongo execution', () => {
  let client: MongoClient;
  let collection: Collection;
  let reports: Reports.Reports;
  let query: NamedQueryConfig;
  let commands: Array<{ name: string; maxTimeMS?: number }>;
  let previous: Map<string, unknown>;
  const brand = Object.assign(new BrandingModel(), { id: 'report-test-brand', name: 'report-test-brand' });
  const caller: FormRecordAccessContext = {
    brand,
    user: {
      id: 'reports',
      username: 'reports',
      type: 'local',
      name: 'Reports',
      email: '',
      roles: [{ id: 'reports', name: 'ReportAuthor' }],
    },
  };
  const draft: ReportConfigDto = {
    name: 'unsaved',
    title: 'Unsaved',
    reportSource: 'database',
    databaseQuery: { queryName: 'selected' },
    solrQuery: null,
    filter: [
      {
        type: 'date-range',
        paramName: 'created',
        property: '',
        message: '',
        database: { fromProperty: 'createdAfter', toProperty: 'createdBefore' },
      },
    ],
    columns: [
      {
        label: 'Title',
        property: 'metadata.projectTitle',
        template: '<b>{{metadata.projectTitle}}</b>',
        exportTemplate: '{{recordTableMeta.val}}',
      },
    ],
    readOnly: false,
    canEdit: true,
    canDelete: true,
    canPreview: true,
  };
  const request = {
    param: (key: string) => ({ created_fromDate: '2026-01-01T00:00:00Z', created_toDate: '2026-12-31T23:59:59Z' })[key],
  };
  const preview = () => reports.previewConfig(brand, draft, request, { portal: 'rdmp', caller });
  before(async function () {
    const url = process.env.NAMED_QUERY_TEST_MONGO_URL;
    if (!url) this.skip();
    client = new MongoClient(url, { monitorCommands: true });
    client.on('commandStarted', event =>
      commands?.push({ name: event.commandName, maxTimeMS: event.command.maxTimeMS })
    );
    await client.connect();
    collection = client.db('redbox_report_assist_regression').collection(`report_${randomUUID().replace(/-/g, '')}`);
    await collection.insertMany([
      ...Array.from({ length: 102 }, (_, i) => ({
        redboxOid: `ours-${i}`,
        metadata: { title: i === 0 ? '=SUM(1,2)' : `Ours ${i}` },
        dateCreated: new Date('2026-05-01'),
        metaMetadata: { brandId: brand.id },
        authorization: { view: [] },
      })),
      {
        redboxOid: 'theirs',
        metadata: { title: 'Other brand' },
        dateCreated: new Date('2026-05-01'),
        metaMetadata: { brandId: 'other-brand' },
      },
      {
        redboxOid: 'too-old',
        metadata: { title: 'Old' },
        dateCreated: new Date('2020-05-01'),
        metaMetadata: { brandId: brand.id },
      },
    ]);
  });
  beforeEach(() => {
    previous = new Map(
      [
        'NamedQueryService',
        'NamedQueryEditorService',
        'ReportsService',
        'DomSanitizerService',
        'BrandingService',
        'RBReport',
      ].map(name => [name, Reflect.get(globalThis, name)])
    );
    commands = [];
    query = new NamedQueryConfig({
      collectionName: 'record',
      mongoQuery: {},
      queryParams: {
        createdAfter: { type: 'date', path: 'dateCreated', queryType: '$gte', whenUndefined: 'ignore' },
        createdBefore: { type: 'date', path: 'dateCreated', queryType: '$lte', whenUndefined: 'ignore' },
      },
      resultObjectMapping: { projectTitle: 'record.metadata.title' },
    });
    setupServiceTestGlobals(
      createMockSails({
        config: { dompurify },
        models: {
          record: { native: (callback: (error: null, value: typeof collection) => void) => callback(null, collection) },
        },
      })
    );
    reports = new Reports.Reports();
    const executor = new Queries.NamedQueryService();
    sinon
      .stub(executor, 'getNamedQueryConfig')
      .callsFake(async selectedBrand => (selectedBrand.id === brand.id ? query : null));
    Object.assign(globalThis, {
      NamedQueryService: executor,
      NamedQueryEditorService: new Editors.NamedQueryEditor(),
      ReportsService: reports,
      DomSanitizerService: new Sanitizers.DomSanitizer(),
      BrandingService: { getFullPath: () => '/brand/rdmp' },
      RBReport: { findOne: () => createQueryObject(draft) },
    });
  });
  afterEach(async () => {
    if (client && process.env.NAMED_QUERY_TEST_MONGO_FAILPOINTS === 'true')
      await client.db('admin').command({ configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'off' });
    sinon.restore();
    cleanupServiceTestGlobals();
    for (const [name, value] of previous ?? []) Reflect.set(globalThis, name, value);
  });
  after(async () => {
    if (collection) await collection.drop();
    if (client) await client.close();
  });

  it('uses parameter keys for date coercion, enforces brand scope and sends server deadlines', async () => {
    const result = await preview();
    assert.equal(result.total, 102);
    assert.equal(result.records.length, 100);
    assert.equal(result.truncated, true);
    assert.deepEqual(result.truncationReasons, ['rows']);
    assert(result.records.every(record => String(record.oid).startsWith('ours-')));
    assert(result.renderedRows[0].cells[0].display.startsWith('<b>'));
    const reads = commands.filter(command => ['aggregate', 'find'].includes(command.name));
    assert.equal(reads.length, 2);
    assert(reads.every(command => command.maxTimeMS && command.maxTimeMS > 0 && command.maxTimeMS <= 5000));
  });
  it('preserves the existing administrative record-access behavior and real CSV values', async () => {
    const sample = await preview();
    // Existing saved report execution has brand scoping, without per-record view ACL filtering.
    const saved = await reports.getResults(brand, 'saved', request, 0, 100);
    assert.deepEqual(
      sample.records,
      saved.records.map(record => ({ ...record }))
    );
    assert.equal(sample.total, saved.total);
    const csv = await reports.getCSVResult(brand, 'saved', request, 0, 100);
    assert(csv.includes('"\'=SUM(1,2)"'));
    assert(sample.renderedRows.some(row => row.cells[0].export === "'=SUM(1,2)"));
  });
  it('cannot load or execute another brand saved query', async () => {
    const other = Object.assign(new BrandingModel(), { id: 'other-brand', name: 'other-brand' });
    await assert.rejects(
      reports.previewConfig(other, draft, request, { portal: 'rdmp', caller: { ...caller, brand: other } }),
      /not found/
    );
    assert.equal(commands.length, 0);
  });
  it('inherits native Mongo server timeout errors', async function () {
    if (process.env.NAMED_QUERY_TEST_MONGO_FAILPOINTS !== 'true') this.skip();
    await client.db('admin').command({ configureFailPoint: 'maxTimeAlwaysTimeOut', mode: 'alwaysOn' });
    await assert.rejects(preview(), /PREVIEW_TIMEOUT/);
  });
});
