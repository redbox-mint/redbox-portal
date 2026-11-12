import assert from 'node:assert/strict';
import { reportDisplayValue, choiceValue } from '@researchdatabox/sails-ng-common';
import { Services } from '../../src/services/ReportsService';
import { reportStructure } from '../../src/utilities/ReportConfigAssistance';

describe('Report screen formatting across sources', () => {
  const reports = new Services.Reports();
  it('formats ISO dates consistently without changing full CSV values', () => {
    const date = '2025-03-01T00:00:00.000Z';
    assert.equal(reportDisplayValue(date, { format: 'date' }), '1 Mar 2025');
    assert.equal(
      reports.getEntryValue(
        { date },
        { label: 'Date', property: 'date', format: 'date' },
        undefined,
        {},
        undefined,
        true
      ),
      '1 Mar 2025'
    );
    assert.equal(reports.getEntryValue({ date }, { label: 'Date', property: 'date', format: 'date' }), date);
  });
  it('keeps existing configurations, invalid dates and empty values unchanged', () => {
    for (const value of ['2025-03-01T00:00:00.000Z', 'not_required', 'invalid', null, ''])
      assert.equal(reportDisplayValue(value, {}), value);
    assert.equal(reportDisplayValue('bad', { format: 'date' }), 'bad');
    assert.equal(reportDisplayValue(null, { format: 'datetime' }), null);
  });
  it('uses the same catalogue choice resolver as the explorer', () => {
    const choices = [{ value: 'not_required', label: 'Not required' }];
    assert.deepEqual(choiceValue(choices, ['not_required', 'other']), ['Not required', 'other']);
    assert.equal(
      reports.getEntryValue(
        { status: 'not_required' },
        { label: 'Status', property: 'status', valueLabels: choices },
        undefined,
        {},
        undefined,
        true
      ),
      'Not required'
    );
    assert.equal(
      reports.getEntryValue({ status: 'not_required' }, { label: 'Status', property: 'status', valueLabels: choices }),
      'not_required'
    );
  });
  it('lets explicit display and CSV templates retain precedence', () => {
    const col = {
      label: 'Date',
      property: 'date',
      format: 'date' as const,
      template: '<b>{{date}}</b>',
      exportTemplate: 'CSV {{date}}',
    };
    assert.equal(
      reports.getEntryValue({ date: '2025-03-01' }, col, undefined, {}, undefined, true),
      '<b>2025-03-01</b>'
    );
    assert.equal(reports.getEntryValue({ date: '2025-03-01' }, col), 'CSV 2025-03-01');
  });
  it('formats date/time in UTC and renders lists on separate screen lines', () => {
    assert.match(String(reportDisplayValue('2025-03-01T13:45:00Z', { format: 'datetime' })), /1 Mar 2025.*01:45/);
    assert.equal(
      reports.getColValue(
        { dates: ['2025-03-01', '2025-04-02'] },
        { label: 'Dates', property: 'dates', format: 'date', multivalue: true },
        {},
        undefined,
        true
      ),
      '1 Mar 2025<br>2 Apr 2025'
    );
  });
  it('validates optional formats and choice label shapes', () => {
    const config = {
      name: 'test',
      title: 'Test',
      reportSource: 'database',
      databaseQuery: { queryName: 'query' },
      columns: [{ label: 'Date', property: 'date', format: 'bad', valueLabels: [{ value: 1, label: 2 }] }],
    };
    assert.deepEqual(
      reportStructure(config).map(d => d.field),
      ['columns.0.format', 'columns.0.valueLabels']
    );
  });
  it('formats a single value once when the multiple-values option is enabled', () => {
    assert.equal(
      reports.getColValue(
        { date: '2025-03-01' },
        { label: 'Date', property: 'date', format: 'date', multivalue: true },
        {},
        undefined,
        true
      ),
      '1 Mar 2025'
    );
  });
});
