import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { get } from 'lodash';
import * as sinon from 'sinon';
import {
  flattenContextFields,
  storedRecordFields,
  storedRecordPath,
  lookupPath,
  namedQueryMappingFields,
  queryResultFields,
  reportDisplayTemplateFields,
  reportCsvTemplateFields,
  type EditorContextSchema,
  type ContextSchemaField,
} from '@researchdatabox/sails-ng-common';
import { Services as QueryServices } from '../../src/services/NamedQueryService';
import { ReportConfig, ReportFilterType } from '../../src/model/config/ReportConfig';
import { Services as ReportServices } from '../../src/services/ReportsService';
import type { BrandingModel } from '../../src/model';
import { createMockSails, setupServiceTestGlobals, cleanupServiceTestGlobals } from './testHelper';

interface Fixture {
  metadataSchema: EditorContextSchema;
  storedRecord: Record<string, unknown>;
  mapping: Record<string, string>;
  resultMetadata: Record<string, unknown>;
}
const fixture: Fixture = JSON.parse(readFileSync(join(__dirname, '../fixtures/schema-assist/contexts.json'), 'utf8'));
const metadata = flattenContextFields(fixture.metadataSchema, 'record-schema');
const find = (fields: ContextSchemaField[], path: string) => fields.find(f => f.path === path)!;

describe('query and report context adapters against execution', () => {
  let query: QueryServices.NamedQueryService;
  let reports: ReportServices.Reports;
  beforeEach(() => {
    setupServiceTestGlobals(createMockSails({ config: { namedQuery: { supportedCollections: ['record'] } } }));
    query = new QueryServices.NamedQueryService();
    reports = new ReportServices.Reports();
  });
  afterEach(() => {
    cleanupServiceTestGlobals();
    Reflect.deleteProperty(global, 'Record');
    sinon.restore();
  });

  it('keeps schema-relative, Mongo, direct mapping and rendered paths distinct, including hook namespaces and arrays', () => {
    assert.ok(find(metadata, 'title'));
    const stored = storedRecordFields(metadata);
    assert.equal(get(fixture.storedRecord, storedRecordPath(find(stored, 'metadata.title').path)!), 'Project');
    assert.equal(get(fixture.storedRecord, storedRecordPath('metadata.[dc:accessRights]')!), 'open');
    assert.equal(storedRecordPath('metadata.[literal.dot]'), null);
    assert.equal(storedRecordPath('metadata.authors[].name'), 'metadata.authors.name');
    const mappings = namedQueryMappingFields(stored);
    for (const path of ['record.metadata.title', 'record.metadata.[dc:accessRights]']) {
      assert.ok(find(mappings, path));
      assert.equal(
        query.runTemplate(path, { record: fixture.storedRecord }),
        query.runTemplate('{{' + path + '}}', { record: fixture.storedRecord })
      );
    }
    assert.equal(find(mappings, 'record.metadata.budget').type, 'number');
    assert.equal(query.runTemplate('record.metadata.budget', { record: fixture.storedRecord }), 125);
    assert.equal(query.runTemplate('{{record.metadata.budget}}', { record: fixture.storedRecord }), '125');
    assert.equal(find(stored, 'dateCreated').format, undefined);
    assert.equal(
      stored.some(f => /viewUrl|imports|portal|sailsConfig/.test(f.path)),
      false
    );
  });

  it('matches the actual result wrapper with and without mappings', async () => {
    const cursor = {
      sort() {
        return this;
      },
      skip() {
        return this;
      },
      limit() {
        return this;
      },
      async toArray() {
        return [structuredClone(fixture.storedRecord)];
      },
    };
    const collection = {
      async countDocuments() {
        return 1;
      },
      find: () => cursor,
    };
    const model = { native: (callback: (error: null, value: typeof collection) => void) => callback(null, collection) };
    Object.assign(global, { Record: model });
    sails.models ??= {};
    Object.assign(sails.models, { record: model });
    const brand = { id: 'a' } as BrandingModel;
    for (const mapping of [fixture.mapping, {}]) {
      const result = await query.performNamedQuery('', mapping, 'record', {}, {}, {}, brand, 0, 10);
      const row = result.records[0];
      assert.deepEqual(Object.keys(row).sort(), ['oid', 'title', 'metadata', 'dateCreated', 'lastSaveDate'].sort());
      assert.equal(row.oid, 'fixture-oid');
      assert.equal(row.title, 'Project');
      assert.equal(get(row, Object.keys(mapping).length ? 'metadata.projectTitle' : 'metadata.title'), 'Project');
      const described = queryResultFields('record', metadata, mapping);
      for (const f of described.filter(f => f.type !== 'unknown' && !f.path.includes('[]')))
        assert.notEqual(get(row, lookupPath(f.path)!), undefined, f.path);
    }
  });

  it('retains source types only for direct mappings, and describes array children and unknown hooks honestly', () => {
    const result = queryResultFields('record', metadata, fixture.mapping);
    assert.equal(find(result, 'metadata.[dotted.alias]').type, 'string');
    assert.equal(lookupPath('metadata.[dotted.alias]'), 'metadata["dotted.alias"]');
    assert.equal(lookupPath('record.metadata.[dc:accessRights]'), 'record.metadata["dc:accessRights"]');
    assert.equal(lookupPath('record.metadata.authors[].name'), null);
    assert.equal(
      result.some(f => f.path === 'metadata.dotted'),
      false
    );
    assert.equal(find(result, 'metadata.cost').type, 'number');
    assert.equal(find(result, 'metadata.renderedCost').type, 'string');
    assert.equal(find(result, 'metadata.team').isArray, true);
    assert.equal(find(result, 'metadata.team[].name').type, 'string');
    assert.equal(find(result, 'metadata.dynamic').type, 'unknown');
    assert.equal(
      find(queryResultFields('record', metadata, { invalid: 'record..metadata.budget' }), 'metadata.invalid').type,
      'unknown'
    );
    assert.equal(find(result, 'metadata.published').format, undefined);
    assert.equal(
      queryResultFields('user', metadata).some(f => f.path === 'metadata.title'),
      false
    );
    assert.equal(
      find(queryResultFields('user', metadata, { cost: 'record.metadata.budget' }), 'metadata.cost').type,
      'unknown'
    );
  });

  it('treats report text/date bindings as query parameter keys rather than record paths', () => {
    const report = new ReportConfig();
    report.filter = [
      {
        type: ReportFilterType.text,
        paramName: 'projectTitle',
        property: 'metadata.title',
        messsage: '',
        database: null,
      },
      {
        type: ReportFilterType.dateRange,
        paramName: 'created',
        property: 'dateCreated',
        messsage: '',
        database: { fromProperty: 'createdAfter', toProperty: 'createdBefore' },
      },
    ];
    const values: Record<string, string> = {
      projectTitle: 'Project',
      created_fromDate: '2026-01-01',
      created_toDate: '2026-02-01',
    };
    const parameters = reports.buildNamedQueryParamMap({ param: (key: string) => values[key] }, report);
    assert.deepEqual(parameters, { projectTitle: 'Project', createdAfter: '2026-01-01', createdBefore: '2026-02-01' });
    assert.equal(Object.hasOwn(parameters, 'dateCreated'), false);
  });

  it('describes display and CSV separately and executes CSV with value, column and optional data at the root', () => {
    const rows = queryResultFields('record', metadata, fixture.mapping);
    assert.equal(
      find(reportDisplayTemplateFields(rows, 'metadata.cost', false), 'recordTableMeta.val').type,
      'undefined'
    );
    assert.equal(find(reportCsvTemplateFields(rows, 'metadata.cost', false), 'recordTableMeta.val').type, 'number');
    for (const adapter of [reportDisplayTemplateFields, reportCsvTemplateFields]) {
      const fields = adapter(rows, 'metadata.team', true);
      assert.equal(find(fields, 'recordTableMeta.val').type, 'object');
      assert.equal(find(fields, 'recordTableMeta.val.name').type, 'string');
      assert.ok(find(fields, 'optTemplateData.brandingAndPortalUrl'));
      assert.equal(
        fields.some(f => f.path.startsWith('record.')),
        false
      );
    }
    const row = { oid: 'fixture-oid', metadata: fixture.resultMetadata };
    const scalar = {
      property: 'metadata.cost',
      label: 'Cost',
      template: '{{metadata.projectTitle}}:{{recordTableMeta.val}}',
      exportTemplate:
        'CSV:{{recordTableMeta.col.label}}:{{recordTableMeta.val}}:{{optTemplateData.brandingAndPortalUrl}}',
    };
    assert.equal(reports.getColValue(row, scalar, { brandingAndPortalUrl: '/a/rdmp' }), 'CSV:Cost:125:/a/rdmp');
    assert.equal(reports.getColValue(row, { ...scalar, exportTemplate: '' }, {}), 'Project:125');
    const team = {
      property: 'metadata.team',
      label: 'Team',
      multivalue: true,
      template: '{{recordTableMeta.val.name}};',
    };
    assert.equal(reports.getColValue(row, team, {}), 'Ada;Grace;');
  });
});
