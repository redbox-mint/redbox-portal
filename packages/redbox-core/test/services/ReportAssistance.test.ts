import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import * as sinon from 'sinon';
import csvParser = require('csv-parser');
import {
  flattenContextFields,
  handlebarsCompile,
  handlebarsInstance,
  type FieldDescription,
  type ReportConfigDto,
} from '@researchdatabox/sails-ng-common';
import { Services as ReportServices } from '../../src/services/ReportsService';
import { Services as EditorServices } from '../../src/services/NamedQueryEditorService';
import { Services as QueryServices, NamedQueryConfig } from '../../src/services/NamedQueryService';
import { Services as SanitizerServices } from '../../src/services/DomSanitizerService';
import { BrandingModel } from '../../src/model/storage/BrandingModel';
import type { FormRecordAccessContext } from '../../src/services/FormsService';
import { dompurify } from '../../src/config/dompurify.config';
import { NAMED_QUERY_PREVIEW_LIMITS, NamedQueryExecutionBudget } from '../../src/utilities/NamedQueryPreview';
import { reportStructure, reportTemplateAdvice } from '../../src/utilities/ReportConfigAssistance';
import {
  createMockSails,
  createMockModel,
  createQueryObject,
  setupServiceTestGlobals,
  cleanupServiceTestGlobals,
} from './testHelper';

const brand = Object.assign(new BrandingModel(), { id: 'a', name: 'brand-a' });
const caller: FormRecordAccessContext = {
  brand,
  user: {
    id: 'author',
    username: 'author',
    name: 'Author',
    type: 'local',
    email: '',
    roles: [{ id: 'reports', name: 'ReportAuthor' }],
  },
};
const schema: FieldDescription = {
  recordType: 'rdmp',
  stage: 'draft',
  precision: 'record-schema',
  completeness: 'complete',
  fields: flattenContextFields(
    {
      type: 'object',
      properties: {
        title: { type: 'string' },
        count: { type: 'number' },
        people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
        payload: { type: 'string' },
        items: { type: 'array', items: { type: 'number' } },
      },
    },
    'record-schema'
  ),
};
const definition = () =>
  new NamedQueryConfig({
    name: 'selected',
    collectionName: 'record',
    mongoQuery: { 'metaMetadata.type': 'rdmp' },
    queryParams: {
      title: { path: 'metadata.title', type: 'string', whenUndefined: 'ignore' },
      createdAfter: { path: 'dateCreated', type: 'date', queryType: '$gte', whenUndefined: 'ignore' },
      createdBefore: { path: 'dateCreated', type: 'date', queryType: '$lte', whenUndefined: 'ignore' },
      count: { path: 'metadata.count', type: 'number', whenUndefined: 'ignore' },
      days: { path: 'dateCreated', type: 'date', queryType: '$gte', format: 'days', whenUndefined: 'ignore' },
    },
    resultObjectMapping: {
      projectTitle: 'record.metadata.title',
      people: 'record.metadata.people',
      count: 'record.metadata.count',
      dynamic: 'record.metadata.custom',
    },
  });
const config = (): ReportConfigDto => ({
  name: 'draft',
  title: 'Draft report',
  reportSource: 'database',
  databaseQuery: { queryName: 'selected' },
  solrQuery: null,
  filter: [
    { type: 'text', paramName: 'title', message: '', property: '' },
    {
      type: 'date-range',
      paramName: 'created',
      message: '',
      property: 'legacy-unused-record-path',
      database: { fromProperty: 'createdAfter', toProperty: 'createdBefore' },
    },
  ],
  columns: [{ label: 'Title', property: 'metadata.projectTitle' }],
  readOnly: false,
  canEdit: true,
  canDelete: true,
  canPreview: true,
});

describe('Report authoring assistance', () => {
  let reports: ReportServices.Reports;
  let executor: QueryServices.NamedQueryService;
  let editor: EditorServices.NamedQueryEditor;
  let saved: NamedQueryConfig;
  let fields: sinon.SinonStub;
  let lookup: sinon.SinonStub;
  let collection: { countDocuments: sinon.SinonStub; find: sinon.SinonStub };
  let cursor: { sort: sinon.SinonStub; skip: sinon.SinonStub; limit: sinon.SinonStub; toArray: sinon.SinonStub };
  let model: { findOne: sinon.SinonStub; create: sinon.SinonStub; updateOne: sinon.SinonStub };
  let previous: Map<string, unknown>;
  const req = (parameters: Record<string, unknown> = {}) => ({
    param: (key: string) => parameters[key] as string | undefined,
  });
  const validate = (draft: unknown = config()) => reports.validateConfig(brand, 'rdmp', caller, draft);
  const preview = (draft = config(), parameters: Record<string, unknown> = {}) =>
    reports.previewConfig(brand, draft, req(parameters), { portal: 'rdmp', caller });
  const rows = (records: Array<Record<string, unknown>>, total = records.length) => {
    cursor.toArray.resolves(records);
    collection.countDocuments.resolves(total);
  };
  beforeEach(() => {
    previous = new Map(
      [
        'NamedQueryService',
        'NamedQueryEditorService',
        'ReportsService',
        'DomSanitizerService',
        'RBReport',
        'BrandingService',
      ].map(name => [name, Reflect.get(globalThis, name)])
    );
    saved = definition();
    fields = sinon.stub().resolves(structuredClone(schema));
    cursor = {
      sort: sinon.stub().returnsThis(),
      skip: sinon.stub().returnsThis(),
      limit: sinon.stub().returnsThis(),
      toArray: sinon.stub().resolves([]),
    };
    collection = { countDocuments: sinon.stub().resolves(0), find: sinon.stub().returns(cursor) };
    model = {
      findOne: sinon.stub().resolves(null),
      create: sinon.stub().returns(createQueryObject({ ...config(), id: 'new' })),
      updateOne: sinon.stub().returns({ set: sinon.stub().resolves({ ...config(), id: 'new' }) }),
    };
    setupServiceTestGlobals(
      createMockSails({
        config: { dompurify },
        services: { fielddescriptionsservice: { describeFields: fields } },
        models: {
          record: { native: (callback: (error: null, value: typeof collection) => void) => callback(null, collection) },
        },
      })
    );
    reports = new ReportServices.Reports();
    executor = new QueryServices.NamedQueryService();
    editor = new EditorServices.NamedQueryEditor();
    lookup = sinon
      .stub(executor, 'getNamedQueryConfig')
      .callsFake(async selectedBrand => (selectedBrand.id === brand.id ? saved : null));
    Object.assign(globalThis, {
      NamedQueryService: executor,
      NamedQueryEditorService: editor,
      ReportsService: reports,
      RBReport: model,
      DomSanitizerService: new SanitizerServices.DomSanitizer(),
      BrandingService: { getFullPath: () => '/brand-a/rdmp' },
    });
  });
  afterEach(() => {
    sinon.restore();
    cleanupServiceTestGlobals();
    for (const [name, value] of previous) Reflect.set(globalThis, name, value);
  });

  it('describes the saved brand-effective query with report roles and separate display/CSV val contexts', async () => {
    const result = await reports.describeQuery(brand, 'rdmp', caller, 'selected', 'metadata.projectTitle');
    assert(lookup.calledWith(brand, 'selected'));
    assert.equal(result.parameters.find(item => item.key === 'createdAfter')?.path, 'dateCreated');
    assert.equal(result.result.fields.find(item => item.path === 'metadata.projectTitle')?.type, 'string');
    assert.equal(
      result.templateContexts.display.fields.find(item => item.path === 'recordTableMeta.val')?.type,
      'undefined'
    );
    assert.equal(result.templateContexts.csv.fields.find(item => item.path === 'recordTableMeta.val')?.type, 'string');
    assert.equal(
      result.templateContexts.csv.fields.find(item => item.path === 'recordTableMeta.col.hide')?.type,
      'boolean'
    );
    assert(!result.templateContexts.csv.fields.some(item => item.path.startsWith('record.')));
    assert.equal(fields.firstCall.args[2].user, caller.user);
  });
  it('describes multivalue item and whole-array CSV descendants', async () => {
    const whole = await reports.describeQuery(brand, 'rdmp', caller, 'selected', 'metadata.people');
    assert(whole.templateContexts.csv.fields.some(item => item.path === 'recordTableMeta.val[].name'));
    assert(!whole.templateContexts.display.fields.some(item => item.path === 'recordTableMeta.val[].name'));
    const item = await reports.describeQuery(brand, 'rdmp', caller, 'selected', 'metadata.people', true);
    for (const fields of [item.templateContexts.display.fields, item.templateContexts.csv.fields])
      assert(fields.some(field => field.path === 'recordTableMeta.val.name'));
  });
  it('accepts createdAfter as the date binding and metadata.projectTitle as the mapping column', async () => {
    assert.deepEqual(await validate(), { valid: true, diagnostics: [] });
  });
  for (const [field, key] of [
    ['paramName', 'deletedText'],
    ['fromProperty', 'dateCreated'],
    ['toProperty', 'deletedDate'],
  ] as const)
    it(`diagnoses missing parameter key ${key} at ${field}, without changing the draft`, async () => {
      const draft = config();
      if (field === 'paramName') draft.filter[0].paramName = key;
      else draft.filter[1].database![field] = key;
      const before = JSON.stringify(draft);
      const result = await validate(draft);
      assert.equal(result.valid, true);
      assert(result.diagnostics.some(item => item.code === 'UNKNOWN_QUERY_PARAMETER' && item.field.endsWith(field)));
      assert.equal(JSON.stringify(draft), before);
    });
  for (const key of ['count', 'days'])
    it(`warns when a date filter binds to incompatible parameter ${key}`, async () => {
      const draft = config();
      draft.filter[1].database!.fromProperty = key;
      assert((await validate(draft)).diagnostics.some(item => item.code === 'INCOMPATIBLE_DATE_PARAMETER'));
    });
  it('rechecks changed or deleted saved parameters and mappings without rewriting report edits', async () => {
    const draft = config();
    const before = JSON.stringify(draft);
    assert.deepEqual((await validate(draft)).diagnostics, []);
    delete saved.queryParams.createdAfter;
    delete saved.resultObjectMapping.projectTitle;
    const result = await validate(draft);
    assert(result.diagnostics.some(item => item.field === 'filter.1.database.fromProperty'));
    assert(result.diagnostics.some(item => item.code === 'UNKNOWN_OUTPUT_COLUMN'));
    assert.equal(JSON.stringify(draft), before);
    assert(!model.create.called && !model.updateOne.called);
  });
  for (const property of ['projectTitle', 'metadata.removedAlias', 'record.metadata.title'])
    it(`warns about column ${property} outside the result description`, async () => {
      const draft = config();
      draft.columns[0].property = property;
      assert((await validate(draft)).diagnostics.some(item => item.code === 'UNKNOWN_OUTPUT_COLUMN'));
    });
  it('keeps unknown dynamic descendants and partial hook fields editable without false diagnostics', async () => {
    const draft = config();
    draft.columns[0].property = 'metadata.dynamic.clientField';
    assert.deepEqual((await validate(draft)).diagnostics, []);
    saved.resultObjectMapping = {};
    fields.resolves({ ...schema, completeness: 'partial' });
    draft.columns[0].property = 'metadata.hook:custom';
    assert.deepEqual((await validate(draft)).diagnostics, []);
  });
  it('retains non-record output guidance without inheriting record metadata', async () => {
    saved.collectionName = 'user';
    saved.resultObjectMapping = {};
    const result = await reports.describeQuery(brand, 'rdmp', caller, 'selected');
    assert(!result.result.fields.some(item => item.path === 'metadata.title'));
    assert(!fields.called);
  });
  for (const key of ['template', 'exportTemplate'] as const)
    it(`returns advisory syntax and reference diagnostics for ${key}`, async () => {
      const draft = config();
      draft.columns[0][key] = '{{#each metadata.people}}';
      assert(
        (await validate(draft)).diagnostics.some(item => item.code === 'TEMPLATE_SYNTAX' && item.severity === 'warning')
      );
      draft.columns[0][key] = '{{metadata.deletedAlias}}';
      assert((await validate(draft)).diagnostics.some(item => item.code === 'UNKNOWN_TEMPLATE_REFERENCE'));
    });
  it('resolves each/with scopes, block aliases, @root and parent paths without false warnings', async () => {
    const draft = config();
    draft.columns[0].template =
      '{{#each metadata.people as |person index|}}{{person.name}}{{name}}{{@root.title}}{{../title}}{{/each}}{{#with metadata}}{{projectTitle}}{{/with}}';
    assert.deepEqual((await validate(draft)).diagnostics, []);
  });
  for (const template of [
    '{{#reviewContext}}{{customValue}}{{/reviewContext}}',
    '{{#reviewContext}}{{customValue}}{{else}}{{inverseValue}}{{/reviewContext}}',
    '{{#reviewContext as |provided|}}{{provided.customValue}}{{customValue}}{{/reviewContext}}',
    '{{#each (reviewItems) as |item|}}{{item.customValue}}{{customValue}}{{/each}}',
    '{{#with (reviewContextValue)}}{{customValue}}{{/with}}',
    '{{#with (unregisteredValue)}}{{dynamicValue}}{{/with}}',
  ])
    it(`treats helper-produced contexts as unknown: ${template}`, async () => {
      handlebarsInstance().registerHelper('reviewContext', function (options: Handlebars.HelperOptions) {
        const value = { customValue: 'works' };
        return options.fn(value, { blockParams: [value] });
      });
      handlebarsInstance().registerHelper('reviewItems', () => [{ customValue: 'works' }]);
      handlebarsInstance().registerHelper('reviewContextValue', () => ({ customValue: 'works' }));
      try {
        const draft = config();
        draft.columns[0].template = template;
        assert.deepEqual((await validate(draft)).diagnostics, []);
      } finally {
        for (const name of ['reviewContext', 'reviewItems', 'reviewContextValue'])
          handlebarsInstance().unregisterHelper(name);
      }
    });
  it('keeps builtin if/unless, each/with inverse scopes and root references known', () => {
    const context = flattenContextFields(
      {
        type: 'object',
        properties: {
          title: { type: 'string' },
          people: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } },
        },
      },
      'record-schema'
    );
    const advice = (template: string) => reportTemplateAdvice(template, context, 'columns.0.template', true, false);
    assert.deepEqual(
      advice(
        '{{#if title}}{{title}}{{/if}}{{#unless title}}{{title}}{{/unless}}{{#each people}}{{name}}{{else}}{{title}}{{/each}}{{#with people}}{{else}}{{title}}{{/with}}'
      ),
      []
    );
    for (const template of [
      '{{#if title}}{{missing}}{{/if}}',
      '{{#unless title}}{{missing}}{{/unless}}',
      '{{#each people}}{{missing}}{{/each}}',
      '{{#with people}}{{missing}}{{/with}}',
      '{{#each (reviewItems)}}{{@root.missing}}{{/each}}',
    ])
      assert(
        advice(template).some(item => item.code === 'UNKNOWN_TEMPLATE_REFERENCE'),
        template
      );
  });
  it('explains arrays without multivalue and accepts explicit per-item handling', async () => {
    const draft = config();
    draft.columns[0].property = 'metadata.people';
    assert(
      (await validate(draft)).diagnostics.some(
        item => item.code === 'ARRAY_WITHOUT_MULTIVALUE' && item.reason.includes('whole array')
      )
    );
    draft.columns[0].multivalue = true;
    draft.columns[0].template = '{{recordTableMeta.val.name}}';
    assert.deepEqual((await validate(draft)).diagnostics, []);
  });
  it('accepts numeric array lookups and warns when a column attempts implicit item traversal', async () => {
    const draft = config();
    draft.columns[0].property = 'metadata.people[0].name';
    draft.columns[0].template = '{{metadata.people.0.name}}';
    assert.deepEqual((await validate(draft)).diagnostics, []);
    draft.columns[0].property = 'metadata.people.name';
    assert((await validate(draft)).diagnostics.some(item => item.code === 'UNKNOWN_OUTPUT_COLUMN'));
  });
  it('returns structural blockers for missing required config while preserving legacy syntax saves', async () => {
    assert.equal((await validate({})).valid, false);
    assert(reportStructure({ ...config(), columns: [{ property: 'title' }] }).some(item => item.severity === 'error'));
    const draft = config();
    draft.columns[0].template = '{{#each broken}}';
    await reports.createConfig(brand, draft);
    assert(model.create.calledOnce);
    assert.equal((await validate(draft)).valid, true);
  });
  it('reports a deleted query and never reads another brand definition', async () => {
    lookup.resolves(null);
    assert.equal((await validate()).diagnostics[0].code, 'QUERY_NOT_FOUND');
    await assert.rejects(
      reports.describeQuery(Object.assign(new BrandingModel(), { id: 'b' }), 'rdmp', caller, 'selected'),
      /FORBIDDEN/
    );
  });
  it('keeps Solr reports read-only and does not execute their queries in preview', async () => {
    const draft = config();
    draft.reportSource = 'solr';
    assert.equal((await validate(draft)).valid, false);
    await assert.rejects(preview(draft), /Only database reports/);
    assert(!collection.find.called && !fields.called);
  });

  it('renders untrusted display and export cells with real CSV fallback, escaping and formula protection', async () => {
    const draft = config();
    draft.columns = [
      {
        label: 'Link',
        property: 'metadata.projectTitle',
        template:
          '<a href="{{optTemplateData.brandingAndPortalUrl}}/{{oid}}" onclick="alert(1)">{{metadata.projectTitle}}</a><script>alert(2)</script>',
        exportTemplate: '{{recordTableMeta.val}}',
      },
      { label: 'Count', property: 'metadata.count', template: 'value={{recordTableMeta.val}};{{metadata.count}}' },
      { label: 'Hidden', property: 'title', hide: true },
    ];
    rows([
      { redboxOid: 'one', metadata: { title: '=café & <study>, "quoted"', count: 5 }, metaMetadata: { brandId: 'a' } },
    ]);
    const result = await preview(draft);
    assert.equal(result.total, 1);
    assert.equal(result.success, true);
    assert.equal(
      result.renderedRows[0].cells[0].untrustedDisplayHtml,
      '<a href="/brand-a/rdmp/one" onclick="alert(1)">&#x3D;café &amp; &lt;study&gt;, &quot;quoted&quot;</a><script>alert(2)</script>'
    );
    assert.equal(result.renderedRows[0].cells[0].export, '\'=café & <study>, "quoted"');
    assert.equal(result.renderedRows[0].cells[1].untrustedDisplayHtml, 'value=;5');
    assert.equal(result.renderedRows[0].cells[1].export, 'value=5;5');
    const data = reports.getDataRows(draft, result.records, { brandingAndPortalUrl: '/brand-a/rdmp' });
    assert.deepEqual(
      result.renderedRows.map(row => row.cells.map(cell => cell.export)),
      data
    );
    // The complete export operation also applies CSV quoting/newlines after these values.
    model.findOne.returns(createQueryObject(draft));
    const csv = await reports.getCSVResult(brand, 'draft', req());
    const parsed: Record<string, string>[] = [];
    await new Promise<void>((resolve, reject) =>
      Readable.from([csv])
        .pipe(csvParser())
        .on('data', row => parsed.push(row))
        .on('end', resolve)
        .on('error', reject)
    );
    assert.equal(parsed[0].Link, result.renderedRows[0].cells[0].export);
    assert.equal(parsed[0].Count, result.renderedRows[0].cells[1].export);
    assert(!fields.called, 'preview must not perform unbounded schema/hook reads');
  });
  it('returns live-table markup as explicitly untrusted HTML without server sanitization', async () => {
    const draft = config();
    draft.columns[0].template =
      '<img src="/logo.png" alt="Logo"><table><tbody><tr><td>Value</td></tr></tbody></table><code>code</code><script>alert(1)</script>';
    rows([{ metadata: { title: 'A' } }]);
    const result = await preview(draft);
    assert.equal(result.renderedRows[0].cells[0].untrustedDisplayHtml, draft.columns[0].template);
    // PR 5 must use Angular [innerHTML], the same sanitization boundary as the live table.
    assert(!Object.hasOwn(result.renderedRows[0].cells[0], 'display'));
  });
  it('renders native dates against the browser JSON row for plain and templated display', async () => {
    const draft = config();
    draft.columns = [
      { label: 'Date', property: 'dateCreated' },
      { label: 'Template Date', property: 'dateCreated', template: '{{dateCreated}}' },
      { label: 'Nested Date', property: 'metadata.dynamic.date', template: '{{metadata.dynamic.date}}' },
    ];
    const date = new Date('2026-05-01T00:00:00Z');
    rows([{ dateCreated: date, metadata: { custom: { date } } }]);
    const result = await preview(draft);
    const browserRow = JSON.parse(JSON.stringify(result.records[0]));
    assert.equal(result.renderedRows[0].cells[0].untrustedDisplayHtml, browserRow.dateCreated);
    assert.equal(
      result.renderedRows[0].cells[1].untrustedDisplayHtml,
      handlebarsCompile('{{dateCreated}}')(browserRow)
    );
    assert.equal(result.renderedRows[0].cells[2].untrustedDisplayHtml, browserRow.metadata.dynamic.date);
  });
  it('casts untemplated native dates exactly like CSV while CSV templates keep native dates', async () => {
    const draft = config();
    draft.columns = [
      { label: 'Date', property: 'dateCreated' },
      { label: 'CSV Date', property: 'dateCreated', exportTemplate: '{{dateCreated}}' },
      { label: 'Fallback Date', property: 'dateCreated', template: '{{dateCreated}}' },
    ];
    const date = new Date('2026-05-01T00:00:00Z');
    rows([{ dateCreated: date }]);
    const result = await preview(draft);
    model.findOne.returns(createQueryObject(draft));
    const csv = await reports.getCSVResult(brand, 'draft', req());
    const parsed: Record<string, string>[] = [];
    await new Promise<void>((resolve, reject) =>
      Readable.from([csv])
        .pipe(csvParser())
        .on('data', row => parsed.push(row))
        .on('end', resolve)
        .on('error', reject)
    );
    assert.deepEqual(
      result.renderedRows[0].cells.map(cell => cell.export),
      Object.values(parsed[0])
    );
    assert.equal(result.renderedRows[0].cells[0].export, '1777593600000');
    assert.equal(result.renderedRows[0].cells[1].export, String(date));
    assert.equal(result.renderedRows[0].cells[2].export, String(date));
  });
  it('uses CSV casting for booleans, numbers, objects, arrays, blanks and quoted multiline text', async () => {
    saved.resultObjectMapping = {};
    const values = {
      yes: true,
      no: false,
      count: 42,
      object: { nested: 'A,B' },
      array: ['A', 'B'],
      blank: null,
      text: 'A,"B"\nC',
    };
    const draft = config();
    draft.columns = Object.keys(values).map(key => ({ label: key, property: `metadata.${key}` }));
    rows([{ metadata: values }]);
    const result = await preview(draft);
    model.findOne.returns(createQueryObject(draft));
    const csv = await reports.getCSVResult(brand, 'draft', req());
    const parsed: Record<string, string>[] = [];
    await new Promise<void>((resolve, reject) =>
      Readable.from([csv])
        .pipe(csvParser())
        .on('data', row => parsed.push(row))
        .on('end', resolve)
        .on('error', reject)
    );
    assert.deepEqual(
      result.renderedRows[0].cells.map(cell => cell.export),
      Object.values(parsed[0])
    );
  });
  it('preserves multivalue item rendering and the whole-array CSV value contract', async () => {
    const draft = config();
    draft.columns = [
      {
        label: 'People',
        property: 'metadata.people',
        multivalue: true,
        template: '<b>{{recordTableMeta.val.name}}</b>',
        exportTemplate: '{{recordTableMeta.val.name}};',
      },
      { label: 'Whole', property: 'metadata.people', template: '{{#each recordTableMeta.val}}{{name}};{{/each}}' },
    ];
    rows([{ redboxOid: 'one', metadata: { people: [{ name: 'A & B' }, { name: 'C' }] } }]);
    const result = await preview(draft);
    assert.deepEqual(result.renderedRows[0].cells, [
      { untrustedDisplayHtml: '<b>A &amp; B</b><b>C</b>', export: 'A & B;C;' },
      { untrustedDisplayHtml: '', export: 'A & B;C;' },
    ]);
  });
  it('matches escaped display templates against the shared runtime compiler before sanitization', async () => {
    const draft = config();
    draft.columns[0].template = '<b>{{metadata.projectTitle}}</b>';
    rows([{ metadata: { title: 'A & <B>' } }]);
    const result = await preview(draft);
    assert.equal(
      result.renderedRows[0].cells[0].untrustedDisplayHtml,
      handlebarsCompile(draft.columns[0].template)(result.records[0])
    );
  });
  it('returns explicit blank display/export cells for absent values, as CSV serializes them', async () => {
    const draft = config();
    draft.columns[0].property = 'metadata.count';
    rows([{ metadata: { title: 'A' } }]);
    const result = await preview(draft);
    assert.deepEqual(result.renderedRows[0].cells[0], { untrustedDisplayHtml: '', export: '' });
    assert(JSON.stringify(result).includes('"export":""'));
  });
  it('renders legacy invalid templates as empty cells and returns syntax warnings', async () => {
    const draft = config();
    draft.columns[0].template = '{{#each broken}}';
    rows([{ metadata: { title: 'A' } }]);
    const result = await preview(draft);
    assert.equal(result.success, true);
    assert.deepEqual(result.renderedRows[0].cells[0], { untrustedDisplayHtml: '', export: '' });
    assert(result.diagnostics.some(item => item.code === 'TEMPLATE_SYNTAX'));
  });
  it('caps samples at 100 with backwards-compatible totals and explicit row truncation', async () => {
    rows(
      Array.from({ length: 100 }, (_, i) => ({ redboxOid: `oid-${i}`, metadata: { title: `Title ${i}` } })),
      101
    );
    const result = await preview();
    assert.equal(result.records.length, 100);
    assert.equal(result.renderedRows.length, 100);
    assert.equal(result.total, 101);
    assert.equal(result.recordsPerPage, 100);
    assert.equal(result.pageNum, 1);
    assert.equal(result.deadlineEnforced, true);
    assert.equal(cursor.limit.firstCall.args[0], 100);
    assert.deepEqual(result.truncationReasons, ['rows']);
    assert(collection.find.firstCall.args[1].maxTimeMS <= 5000);
    assert.equal(collection.find.firstCall.args[0]['metaMetadata.brandId'], 'a');
  });
  it('drops whole rows when raw and rendered values together exceed response bytes', async () => {
    rows([{ metadata: { title: 'é'.repeat(100000) } }]);
    const result = await preview();
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.renderedRows, []);
    assert.deepEqual(result.truncationReasons, ['bytes']);
    assert(Buffer.byteLength(JSON.stringify({ data: result })) <= NAMED_QUERY_PREVIEW_LIMITS.responseBytes);
  });
  it('bounds template amplification before concatenation, including nested each/with and helper inputs', async () => {
    saved.resultObjectMapping = {};
    rows([{ metadata: { payload: 'x'.repeat(10000), items: Array(100).fill(0) } }]);
    for (const template of [
      '{{#each metadata.items}}{{@root.metadata.payload}}{{/each}}',
      '{{#with metadata}}{{#each items}}{{#each @root.metadata.items}}{{@root.metadata.payload}}{{/each}}{{/each}}{{/with}}',
    ]) {
      const draft = config();
      draft.columns = [{ label: 'Amplify', property: 'metadata.payload', template }];
      const result = await preview(draft);
      assert.deepEqual(result.records, []);
      assert.deepEqual(result.truncationReasons, ['bytes']);
    }
  });
  it('bounds input size and complexity before executing', async () => {
    const draft = config();
    draft.columns[0].template = 'x'.repeat(140000);
    await assert.rejects(preview(draft), /INPUT_LIMIT/);
    assert(!collection.find.called);
  });
  it('counts report filter input bytes and bounds repeated whole-array coercion', async () => {
    await assert.rejects(preview(config(), { title: 'x'.repeat(140000) }), /INPUT_LIMIT/);
    saved.resultObjectMapping = {};
    rows([{ metadata: { items: Array(1000).fill('example') } }]);
    const draft = config();
    draft.columns = [{ label: 'Items', property: 'metadata.items', multivalue: true }];
    const result = await preview(draft);
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.truncationReasons, ['bytes']);
  });
  it('refuses excessive template complexity even after saturating displayed warnings, before I/O', async () => {
    const draft = config();
    draft.columns = Array.from({ length: 201 }, (_, i) => ({
      label: `Bad ${i}`,
      property: 'title',
      template: '{{broken',
    }));
    draft.columns.push({ label: 'Too complex', property: 'title', template: '{{title}}'.repeat(257) });
    const result = await preview(draft);
    assert.equal(result.valid, false);
    assert(result.diagnostics.some(item => item.code === 'PREVIEW_TEMPLATE_COMPLEXITY' && item.severity === 'error'));
    assert(result.diagnostics.length <= 200);
    assert(!collection.find.called);
  });
  it('preserves relation expansion through the saved executor and reports the missing DB deadline', async () => {
    saved.expandRelations = true;
    saved.resultObjectMapping.related = 'record.relationships.label';
    const related = sinon.stub().resolves({ label: 'Expanded relation' });
    sails.services.recordsservice = { getRelatedRecords: related };
    rows([{ redboxOid: 'one', metadata: { title: 'A' } }]);
    const draft = config();
    draft.columns = [{ label: 'Related', property: 'metadata.related' }];
    const result = await preview(draft);
    assert.equal(result.success, true);
    assert.equal(result.deadlineEnforced, false);
    assert.equal(result.renderedRows[0].cells[0].untrustedDisplayHtml, 'Expanded relation');
    assert(related.calledOnceWithExactly('one', brand));
    assert.equal(collection.find.firstCall.args[1], undefined);
    assert.equal(cursor.limit.firstCall.args[0], 100);
  });
  it('preserves related-filter reads and parameter substitution through the saved executor', async () => {
    saved.relatedRecordFilters = [
      { collectionName: 'related', mongoQuery: { 'metadata.title': '' }, localField: 'relatedId', foreignField: 'id' },
    ];
    const find = sinon.stub().returns(createQueryObject([{ id: 'joined' }]));
    sails.models.related = { ...createMockModel('related'), find };
    rows([{ metadata: { title: 'A' } }]);
    const result = await preview(config(), { title: 'Needle' });
    assert.equal(result.success, true);
    assert.equal(result.deadlineEnforced, false);
    assert.deepEqual(find.firstCall.args[0].where, { 'metadata.title': 'Needle' });
    assert.deepEqual(collection.find.firstCall.args[0].relatedId, { $in: ['joined'] });
    assert.equal((result.records[0].metadata as Record<string, unknown>).projectTitle, 'A');
  });
  it('preserves user collection previews, role scoping and sensitive-field removal', async () => {
    saved.collectionName = 'user';
    saved.mongoQuery = {};
    saved.queryParams = {};
    saved.resultObjectMapping = { projectTitle: 'record.name', password: 'record.password', token: 'record.token' };
    const find = sinon.stub().returns(
      createQueryObject([
        { id: 'ours', name: 'Our author', password: 'secret', token: 'secret', roles: [{ branding: brand.id }] },
        { id: 'theirs', name: 'Other author', roles: [{ branding: 'b' }] },
      ])
    );
    sails.models.user = { ...createMockModel('user'), find };
    const result = await preview();
    assert.equal(result.success, true);
    assert.equal(result.deadlineEnforced, false);
    assert.equal(result.total, 1);
    assert.equal((result.records[0].metadata as Record<string, unknown>).projectTitle, 'Our author');
    assert(!JSON.stringify(result).includes('secret'));
    assert(!collection.find.called && !fields.called);
  });
  it('preserves brand-scoped custom collection previews', async () => {
    saved.collectionName = 'custom';
    saved.mongoQuery = {};
    saved.queryParams = {};
    saved.resultObjectMapping = { projectTitle: 'record.name' };
    const find = sinon.stub().returns(createQueryObject([{ id: 'custom-one', name: 'Custom output' }]));
    sails.models.custom = {
      ...createMockModel('custom'),
      attributes: { branding: {} },
      count: sinon.stub().returns(createQueryObject(1)),
      find,
    };
    const result = await preview();
    assert.equal(result.success, true);
    assert.equal(result.deadlineEnforced, false);
    assert.equal(result.renderedRows[0].cells[0].untrustedDisplayHtml, 'Custom output');
    assert.equal(find.firstCall.args[0].where.branding, brand.id);
    assert.equal(find.firstCall.args[0].limit, 100);
  });
  it('keeps fallback report rows and rendering within row and byte limits', async () => {
    saved.expandRelations = true;
    rows(
      Array.from({ length: 100 }, (_, i) => ({ metadata: { title: `Title ${i}` } })),
      101
    );
    const result = await preview();
    assert.equal(result.records.length, 100);
    assert.deepEqual(result.truncationReasons, ['rows']);
    rows([{ metadata: { title: 'é'.repeat(100000) } }]);
    const oversized = await preview();
    assert.deepEqual(oversized.records, []);
    assert.deepEqual(oversized.truncationReasons, ['bytes']);
    assert(Buffer.byteLength(JSON.stringify({ data: oversized })) <= oversized.limits.responseBytes);
    saved.resultObjectMapping = {};
    rows([{ metadata: { payload: 'x'.repeat(10000), items: Array(100).fill(0) } }]);
    const draft = config();
    draft.columns = [
      {
        label: 'Amplify',
        property: 'metadata.payload',
        template: '{{#each metadata.items}}{{@root.metadata.payload}}{{/each}}',
      },
    ];
    assert.deepEqual((await preview(draft)).truncationReasons, ['bytes']);
  });
  it('starts the rendering deadline after legacy query execution returns', async () => {
    saved.expandRelations = true;
    rows([{ metadata: { title: 'A' } }]);
    const clock = sinon.useFakeTimers({ toFake: ['Date'] });
    const perform = executor.performNamedQueryFromConfig.bind(executor);
    sinon.stub(executor, 'performNamedQueryFromConfig').callsFake(async (...args) => {
      const result = await perform(...args);
      clock.tick(6000);
      return result;
    });
    const result = await preview();
    assert.equal(result.success, true);
    assert.equal(result.deadlineEnforced, false);
    assert.equal(result.renderedRows[0].cells[0].untrustedDisplayHtml, 'A');
  });
  it('checks authenticated brand context before fallback execution', async () => {
    saved.expandRelations = true;
    await assert.rejects(
      reports.previewConfig(brand, config(), req(), {
        portal: 'rdmp',
        caller: { ...caller, brand: Object.assign(new BrandingModel(), { id: 'b' }) },
      }),
      /FORBIDDEN/
    );
    assert(!collection.find.called);
  });
  it('interrupts synchronous report helpers with the shared execution deadline', () => {
    handlebarsInstance().registerHelper('reportSpin', () => {
      while (true) {
        /* VM deadline */
      }
    });
    try {
      const budget = new NamedQueryExecutionBudget(25);
      assert.throws(
        () =>
          budget.run(() =>
            reports.getDataRows(
              { columns: [{ label: 'Spin', property: 'title', template: '{{reportSpin}}' }] },
              [{}],
              {},
              budget
            )
          ),
        /PREVIEW_TIMEOUT/
      );
    } finally {
      handlebarsInstance().unregisterHelper('reportSpin');
    }
  });
});
