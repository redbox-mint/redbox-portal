import { Component, ViewChild } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import {
  flattenContextFields,
  namedQueryMappingFields,
  queryResultFields,
  storedRecordFields,
  storedRecordPathFields,
  storedRecordPath,
  reportDisplayTemplateFields,
} from '@researchdatabox/sails-ng-common';
import { FieldTreeComponent } from './field-tree.component';
import { AutocompleteComponent } from './autocomplete.component';
import { SchemaTargetSelectorComponent } from './schema-target-selector.component';
import { LatestRequest } from './latest-request';
import { TranslationService } from '../translation.service';
import { RecordTableComponent } from '../record-table.component';
import { HandlebarsTemplateService } from '../handlebars-template.service';
import { LoggerService } from '../logger.service';
import { UtilityService } from '../utility.service';
import { fieldInsertion } from './field-tree';

@Component({
  standalone: true,
  imports: [FieldTreeComponent, AutocompleteComponent, SchemaTargetSelectorComponent],
  template: `
    <rb-schema-target-selector
      [targets]="targets"
      [selection]="null"
      (choose)="selection = $event"
    ></rb-schema-target-selector>
    <rb-field-tree
      [fields]="fields"
      [initialExpanded]="['metadata']"
      [insertion]="insertPath"
      (insert)="inserted = $event"
    ></rb-field-tree>
    <input #path />
    <rb-field-autocomplete [target]="path" [source]="source" mode="path"></rb-field-autocomplete>
  `,
})
class QueryIntegration {
  @ViewChild(FieldTreeComponent) tree!: FieldTreeComponent;
  fields = storedRecordFields(
    flattenContextFields({ properties: { title: { type: 'string', title: 'Project title' } } })
  );
  source = {
    fields: storedRecordPathFields(
      flattenContextFields({ properties: { title: { type: 'string' }, 'hook:field': { type: 'string' } } })
    ),
    roots: [],
    helpers: [],
  };
  insertPath = (node: { path: string }) => storedRecordPath(node.path);
  inserted = '';
  selection: unknown = null;
  targets = [{ id: 'rdmp', label: 'Research plan', stages: [{ id: 'draft', label: 'Draft', starting: true }] }];
}
const translation = {
  translationChanges$: of(),
  isInitializing: () => false,
  init: () => of(true),
  t: (key: string) => key,
  i18next: { t: (key: string) => key },
};

describe('shared assistance with a query integration', () => {
  it('selects guidance explicitly and inserts a stored path through the same tree as email', async () => {
    await TestBed.configureTestingModule({
      imports: [QueryIntegration],
      providers: [{ provide: TranslationService, useValue: translation }],
    }).compileComponents();
    const fixture = TestBed.createComponent(QueryIntegration);
    fixture.detectChanges();
    const host = fixture.componentInstance;
    expect(host.selection).toBeNull();
    expect(host.tree.roots).toEqual([]);
    const title = host.tree.rows.find(row => row.node.path === 'metadata.title')!.node;
    host.tree.choose(title);
    expect(host.inserted).toBe('metadata.title');
    // The insertion adapter changes syntax; the shared tree has no feature roots or policies.
    expect(fieldInsertion({ ...title, path: 'record.metadata.title' })).toBe('{{record.metadata.title}}');
    const type = fixture.nativeElement.querySelector('select') as HTMLSelectElement;
    type.value = 'rdmp';
    type.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(host.selection).toEqual({ recordType: 'rdmp', stage: 'draft' });
    const input = fixture.nativeElement.querySelector('input:not([type="search"])') as HTMLInputElement;
    input.value = 'metadata.t';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(input.value).toBe('metadata.title');
    input.value = 'metadata.hook:';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    fixture.detectChanges();
    expect(input.value).toBe('metadata.hook:field');
    expect(host.fields.some(field => field.path.startsWith('imports') || field.path.startsWith('record'))).toBeFalse();
  });
});

describe('LatestRequest', () => {
  it('rejects late results and errors after a context switch, item switch or teardown', async () => {
    const guard = new LatestRequest();
    const first = guard.next();
    const second = guard.next();
    const results: string[] = [];
    if (guard.isCurrent(second)) results.push('new context');
    await Promise.resolve();
    if (guard.isCurrent(first)) results.push('stale context');
    guard.invalidate();
    if (guard.isCurrent(second)) results.push('old item');
    const destroyed = guard.next();
    guard.invalidate();
    if (guard.isCurrent(destroyed)) results.push('destroyed');
    expect(results).toEqual(['new context']);
  });
});

// Characterize the actual display runtime, separately from ReportsService's CSV tests.
describe('report display context contract', () => {
  it('passes scalar/array values exactly as described without inventing an email record root', () => {
    const template = jasmine
      .createSpy('compileAndRunTemplate')
      .and.callFake((_template: string, context: Record<string, unknown>) => context);
    TestBed.configureTestingModule({
      declarations: [RecordTableComponent],
      providers: [
        { provide: LoggerService, useValue: {} },
        { provide: UtilityService, useValue: {} },
        { provide: HandlebarsTemplateService, useValue: { compileAndRunTemplate: template } },
      ],
    }).overrideComponent(RecordTableComponent, { set: { template: '' } });
    const table = TestBed.createComponent(RecordTableComponent).componentInstance;
    const scalar = {
      property: 'metadata.cost',
      label: 'Cost',
      hide: false,
      multivalue: false,
      template: '{{recordTableMeta.val}}',
    };
    const team = {
      property: 'metadata.team',
      label: 'Team',
      hide: false,
      multivalue: true,
      template: '{{recordTableMeta.val.name}}',
    };
    table.columnConfig = [scalar, team];
    table.reportName = 'fixture';
    table.optTemplateData = { brandingAndPortalUrl: '/default/rdmp' };
    const row = { oid: 'fixture-oid', metadata: { cost: 125, team: [{ name: 'Ada' }] } };
    table.getColValue(row, scalar);
    let context = template.calls.mostRecent().args[1];
    expect(context.recordTableMeta.val).toBeUndefined();
    expect(context.metadata.cost).toBe(125);
    expect(context.record).toBeUndefined();
    table.getColValue(row, team);
    context = template.calls.mostRecent().args[1];
    expect(context.recordTableMeta.val.name).toBe('Ada');
    expect(context.recordTableMeta.col).toEqual(team);
    expect(context.optTemplateData.brandingAndPortalUrl).toBe('/default/rdmp');
    const fields = reportDisplayTemplateFields(
      queryResultFields('record', flattenContextFields({ properties: { cost: { type: 'number' } } })),
      'metadata.cost',
      false
    );
    expect(fields.find(field => field.path === 'recordTableMeta.val')?.type).toBe('undefined');
    const wholeTeam = { ...team, multivalue: false };
    table.getColValue(row, wholeTeam);
    context = template.calls.mostRecent().args[1];
    expect(context.recordTableMeta.val).toBeUndefined();
    expect(context.metadata.team).toEqual([{ name: 'Ada' }]);
    const arrayFields = reportDisplayTemplateFields(
      queryResultFields('record', flattenContextFields({
        properties: { team: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' } } } } },
      })),
      'metadata.team',
      false
    );
    expect(arrayFields.find(field => field.path === 'recordTableMeta.val')?.type).toBe('undefined');
    expect(arrayFields.some(field => field.path.startsWith('recordTableMeta.val[]'))).toBeFalse();
  });
});
