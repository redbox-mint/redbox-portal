import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import {
  AutocompleteComponent,
  CodeEditorComponent,
  FieldTreeComponent,
  LoggerService,
  TranslationService,
} from '@researchdatabox/portal-ng-common';
import {
  type ContextSchemaField,
  type EditorDiagnostic,
  type ReportConfigDto,
  type ReportConfigPreviewDto,
  type ReportNamedQueryDescription,
  reportCsvTemplateFields,
  reportDisplayTemplateFields,
} from '@researchdatabox/sails-ng-common';
import { ReportConfigComponent } from './report-config.component';
import { ReportConfigService } from './report-config.service';
import { ReportDiagnosticsComponent, ReportTemplateInputComponent } from './report-assistance.component';

@Pipe({ name: 'i18next', standalone: false })
class TranslationPipe implements PipeTransform {
  transform(key: string): string {
    return key;
  }
}

const field = (path: string, type = 'string', title?: string): ContextSchemaField => ({
  path,
  type,
  title,
  required: false,
  isArray: type === 'array',
  ...(type === 'array' ? { itemType: 'string' } : {}),
});
function description(): ReportNamedQueryDescription {
  const fields = [
    field('oid'),
    field('metadata', 'object'),
    field('metadata.projectTitle', 'string', 'Project title'),
    field('metadata.tags', 'array', 'Tags'),
    field('metadata.tags[]'),
    field('metadata.[literal.alias]'),
  ];
  const result = {
    fields,
    recordType: 'rdmp',
    stage: 'draft',
    precision: 'record-schema' as const,
    completeness: 'complete' as const,
  };
  return {
    valid: true,
    diagnostics: [],
    collectionName: 'record',
    name: 'query',
    parameters: [
      { key: 'titleSearch', path: 'metadata.title', type: 'string', required: false },
      { key: 'createdAfter', path: 'dateCreated', type: 'date', queryType: '$gte', format: 'ISODate', required: false },
      { key: 'createdBefore', path: 'dateCreated', type: 'date', queryType: '$lte', required: false },
      { key: 'daysAgo', path: 'dateCreated', type: 'date', queryType: '$gte', format: 'days', required: false },
      { key: 'count', path: 'metadata.count', type: 'number', required: false },
    ],
    result,
    templateContexts: {
      display: { ...result, fields: reportDisplayTemplateFields(fields, '', false) },
      csv: { ...result, fields: reportCsvTemplateFields(fields, '', false) },
    },
  };
}
function report(name = 'report'): ReportConfigDto {
  return {
    name,
    title: 'Report',
    reportSource: 'database',
    databaseQuery: { queryName: 'query' },
    solrQuery: null,
    filter: [{ type: 'text', paramName: 'titleSearch', message: 'Title', property: 'legacy-path' }],
    columns: [
      {
        label: 'Title',
        property: 'metadata.projectTitle',
        template: '{{metadata.projectTitle}}',
        exportTemplate: '{{recordTableMeta.val}}',
      },
    ],
    readOnly: false,
    canEdit: true,
    canDelete: true,
    canPreview: true,
  };
}
function preview(): ReportConfigPreviewDto {
  return {
    total: 1,
    pageNum: 1,
    recordsPerPage: 25,
    success: true,
    valid: true,
    diagnostics: [],
    records: [{ metadata: { projectTitle: 'Real title' } }],
    renderedRows: [{ cells: [{ untrustedDisplayHtml: '<b>Real title</b>', export: 'CSV title' }] }],
    truncated: false,
    truncationReasons: [],
    deadlineEnforced: true,
    limits: { rows: 25, responseBytes: 262144, inputBytes: 262144, timeMs: 3000 },
  };
}
function diagnostic(location: string, severity: 'error' | 'warning' = 'warning'): EditorDiagnostic {
  return {
    field: location,
    severity,
    code: 'TEST',
    reason: 'Check binding',
    line: 1,
    column: 2,
    suggestion: 'manualSuggestion',
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
class ApiStub {
  brandingAndPortalUrl = '/brand/portal';
  waitForInit = async () => this;
  list = jasmine
    .createSpy('list')
    .and.resolveTo([
      report(),
      { ...report('solr'), reportSource: 'solr', readOnly: true, canEdit: false, canDelete: false, canPreview: false },
    ]);
  listNamedQueries = jasmine.createSpy('listNamedQueries').and.resolveTo([{ name: 'query' }, { name: 'other' }]);
  describeQuery = jasmine.createSpy('describe').and.callFake(async () => description());
  validate = jasmine.createSpy('validate').and.resolveTo({ valid: true, diagnostics: [] });
  preview = jasmine.createSpy('preview').and.callFake(async () => preview());
  create = jasmine.createSpy('create').and.resolveTo(report());
  update = jasmine.createSpy('update').and.resolveTo(report());
  delete = jasmine.createSpy('delete').and.resolveTo({ deleted: true });
}

describe('Report configuration workspace', () => {
  let fixture: ComponentFixture<ReportConfigComponent>;
  let component: ReportConfigComponent;
  let api: ApiStub;
  let confirm: jasmine.Spy;
  const settle = async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  };
  const render = () => fixture.detectChanges();
  const query = (selector: string) => fixture.nativeElement.querySelector(selector) as HTMLElement;
  const text = () => fixture.nativeElement.textContent as string;
  const edit = async (value = report()) => {
    component.editReport(value);
    await settle();
    render();
  };
  const change = (selector: string, value: string) => {
    const input = query(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    render();
  };
  beforeEach(async () => {
    api = new ApiStub();
    await TestBed.configureTestingModule({
      declarations: [ReportConfigComponent, TranslationPipe],
      imports: [
        CommonModule,
        FormsModule,
        AutocompleteComponent,
        ReportDiagnosticsComponent,
        ReportTemplateInputComponent,
      ],
      providers: [
        { provide: LoggerService, useValue: { error: () => undefined, warn: () => undefined } },
        {
          provide: TranslationService,
          useValue: {
            waitForInit: async () => undefined,
            isInitializing: () => false,
            translationChanges$: of(),
            t: (key: string) => key,
          },
        },
        { provide: ReportConfigService, useValue: api },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(ReportConfigComponent);
    component = fixture.componentInstance;
    confirm = spyOn(window, 'confirm').and.returnValue(true);
    render();
    await component.waitForInit();
    render();
  });
  afterEach(() => fixture.destroy());

  it('keeps the list as the entry point, filters by source/search and counts reports', async () => {
    await component.loadReports();
    render();
    expect(component.totalReports).toBe(2);
    expect(component.databaseReports).toBe(1);
    expect(component.solrReports).toBe(1);
    component.setSourceFilter('solr');
    expect(component.filteredReports.map(r => r.name)).toEqual(['solr']);
    component.setSourceFilter('all');
    component.searchText = 'report';
    component.applyFilter();
    expect(component.filteredReports.length).toBe(2);
    expect(query('.report-workspace')).toBeNull();
    expect(query('#report-create')).toBeTruthy();
  });
  it('loads query choices nonfatally', async () => {
    await component.loadNamedQueries();
    expect(component.namedQueries.length).toBe(2);
    api.listNamedQueries.and.rejectWith(new Error('denied'));
    await component.loadNamedQueries();
    expect(component.namedQueries).toEqual([]);
  });
  it('allows a saved query name when query administration listing is unavailable', async () => {
    api.listNamedQueries.and.rejectWith({ status: 403 });
    await component.loadNamedQueries();
    await edit();
    change('#report-named-query', 'reportAuthorQuery');
    await settle();
    expect(component.selectedReport!.databaseQuery!.queryName).toBe('reportAuthorQuery');
    expect(api.describeQuery).toHaveBeenCalledWith('reportAuthorQuery');
    expect(query('a[href$="/admin/named-query"]')).toBeNull();
  });
  it('allows repairing missing legacy date bindings without populating them on load', async () => {
    const value = report();
    value.filter[0].type = 'date-range';
    await edit(value);
    expect(component.selectedReport!.filter[0].database).toBeUndefined();
    expect(component.dirty).toBeFalse();
    change('#filter-from-0', 'createdAfter');
    change('#filter-to-0', 'createdBefore');
    expect(component.selectedReport!.filter[0].database).toEqual({
      fromProperty: 'createdAfter',
      toProperty: 'createdBefore',
    });
  });
  it('selecting a query immediately describes parameters and output fields without executing', async () => {
    await component.loadNamedQueries();
    await edit();
    change('#report-named-query', 'other');
    await settle();
    render();
    expect(api.describeQuery).toHaveBeenCalledWith('other');
    expect(text()).toContain('createdAfter');
    expect(text()).toContain('metadata.projectTitle');
    expect(api.preview).not.toHaveBeenCalled();
    expect(query('.modal')).toBeNull();
  });
  it('hides manage-query links without explicit page permission', async () => {
    await edit();
    expect(query('a[href$="/admin/named-query"]')).toBeNull();
  });
  it('shows manage-query links only with explicit page permission', async () => {
    component.canManageQueries = true;
    await edit();
    expect(query('a[href$="/admin/named-query"]')).toBeTruthy();
  });
  it('preserves an unlisted legacy query as a selectable option', async () => {
    await edit({ ...report(), databaseQuery: { queryName: 'hookQuery' } });
    expect(Array.from((query('#report-named-query') as HTMLSelectElement).options).map(o => o.value)).toContain(
      'hookQuery'
    );
  });
  it('selecting output fields does not add columns until the explicit action', async () => {
    await edit();
    const checkbox = fixture.nativeElement.querySelector('.report-output-list input') as HTMLInputElement;
    checkbox.click();
    render();
    expect(component.selectedReport!.columns.length).toBe(1);
    expect(component.selectedOutputs.size).toBe(1);
    component.addSelectedColumns();
    expect(component.selectedReport!.columns.length).toBe(2);
    expect(component.selectedOutputs.size).toBe(0);
  });
  it('adds suggested labels and real report paths, preserving existing columns', async () => {
    const original = report();
    await edit(original);
    component.toggleOutput('metadata.projectTitle', true);
    component.addSelectedColumns();
    expect(component.selectedReport!.columns).toEqual([
      ...original.columns,
      { label: 'Project title', property: 'metadata.projectTitle' },
    ]);
    expect(original.columns.length).toBe(1);
  });
  it('uses lodash bracket syntax for literal output aliases and excludes array item lookups', async () => {
    await edit();
    component.toggleOutput('metadata.[literal.alias]', true);
    component.addSelectedColumns();
    expect(component.selectedReport!.columns[1].property).toBe('metadata["literal.alias"]');
    expect(component.outputs.some(f => f.path.includes('[]'))).toBeFalse();
  });
  it('searches output fields by label and path', async () => {
    await edit();
    component.outputSearch = 'Project title';
    expect(component.outputs.map(f => f.path)).toEqual(['metadata.projectTitle']);
    component.outputSearch = 'metadata.tags';
    expect(component.outputs.map(f => f.path)).toEqual(['metadata.tags']);
  });
  it('keeps label, ordering, hidden and multivalue controls editable', async () => {
    await edit();
    component.addColumn();
    render();
    change('#column-label-1', 'Second');
    component.selectedReport!.columns[1].hide = true;
    component.selectedReport!.columns[1].multivalue = true;
    component.moveColumn(1, -1);
    expect(component.selectedReport!.columns[0]).toEqual({
      label: 'Second',
      property: '',
      hide: true,
      multivalue: true,
    });
    component.removeColumn(0);
    expect(component.selectedReport!.columns[0].label).toBe('Title');
  });
  it('suggests text bindings by parameter key while allowing free text', async () => {
    await edit();
    const choices = Array.from(fixture.nativeElement.querySelectorAll('#report-parameters option')).map(
      (o: any) => o.value
    );
    expect(choices).toContain('createdAfter');
    expect(choices).not.toContain('dateCreated');
    change('#filter-param-0', 'customHookParameter');
    expect(component.selectedReport!.filter[0].paramName).toBe('customHookParameter');
  });
  it('offers compatible date parameters and excludes day offsets and known non-date types', async () => {
    await edit();
    expect(component.dateParameters.map(p => p.key)).toEqual(['titleSearch', 'createdAfter', 'createdBefore']);
    expect(component.datePair()!.from.key).toBe('createdAfter');
  });
  it('requires confirmation before binding the date pair and persists keys rather than target paths', async () => {
    await edit();
    const filter = component.selectedReport!.filter[0];
    filter.type = 'date-range';
    component.filterTypeChanged(filter);
    confirm.and.returnValue(false);
    component.suggestDatePair(filter);
    expect(filter.database).toEqual({ fromProperty: '', toProperty: '' });
    confirm.and.returnValue(true);
    component.suggestDatePair(filter);
    expect(confirm.calls.mostRecent().args[0]).toContain('createdAfter');
    expect(filter.database).toEqual({ fromProperty: 'createdAfter', toProperty: 'createdBefore' });
    await component.saveReport();
    expect(api.update.calls.mostRecent().args[0].filter[0].database.fromProperty).toBe('createdAfter');
  });
  it('shows separate From and To controls backed by compatible parameter choices', async () => {
    const value = report();
    value.filter[0] = {
      ...value.filter[0],
      type: 'date-range',
      database: { fromProperty: 'oldFrom', toProperty: 'oldTo' },
    };
    await edit(value);
    change('#filter-from-0', 'createdAfter');
    change('#filter-to-0', 'createdBefore');
    expect(component.selectedReport!.filter[0].database).toEqual({
      fromProperty: 'createdAfter',
      toProperty: 'createdBefore',
    });
    expect(query('label[for="filter-from-0"]').textContent).toBe('report-filter-from-parameter');
  });
  it('does not suggest ambiguous, mismatched or unknown date pairs', async () => {
    await edit();
    const d = component.description!;
    d.parameters.push({ ...d.parameters[2], key: 'anotherTo' });
    expect(component.datePair()).toBeNull();
    d.parameters.pop();
    d.parameters[2].path = 'lastSaveDate';
    expect(component.datePair()).toBeNull();
    d.parameters[2].path = 'dateCreated';
    d.parameters[2].type = 'unknown';
    expect(component.datePair()).toBeNull();
  });
  it('keeps existing date bindings while editing unrelated fields and switching filter type', async () => {
    const value = report();
    value.filter[0].database = { fromProperty: 'legacyFrom', toProperty: 'legacyTo' };
    await edit(value);
    change('#filter-label-0', 'Changed label');
    component.filterTypeChanged(component.selectedReport!.filter[0]);
    expect(component.selectedReport!.filter[0].database).toEqual(value.filter[0].database);
  });
  it('uses shared template editors with distinct actual display and CSV value contexts', async () => {
    await edit();
    const editors = fixture.debugElement
      .queryAll(By.directive(ReportTemplateInputComponent))
      .map(d => d.componentInstance as ReportTemplateInputComponent);
    expect(editors.length).toBe(2);
    const display = editors.find(e => e.kind === 'display')!,
      csv = editors.find(e => e.kind === 'csv')!;
    expect(display.source.fields.find(f => f.path === 'recordTableMeta.val')!.type).toBe('undefined');
    expect(csv.source.fields.find(f => f.path === 'recordTableMeta.val')!.type).toBe('string');
    expect(display.source.fields.some(f => f.path === 'metadata.projectTitle')).toBeTrue();
    expect(csv.source.fields.some(f => f.path === 'optTemplateData.brandingAndPortalUrl')).toBeTrue();
    expect(display.source.roots).not.toContain('record');
    expect(csv.source.roots).not.toContain('imports');
  });
  it('updates autocomplete contexts after property or multivalue edits and explains arrays', async () => {
    await edit();
    change('#column-property-0', 'metadata.tags');
    expect(text()).toContain('report-array-help');
    component.selectedReport!.columns[0].multivalue = true;
    render();
    const editors = fixture.debugElement.queryAll(By.directive(ReportTemplateInputComponent));
    for (const editor of editors)
      expect(
        editor.componentInstance.source.fields.find((f: ContextSchemaField) => f.path === 'recordTableMeta.val').type
      ).toBe('string');
  });
  it('inserts a template field through the keyboard-operable shared field tree', async () => {
    await edit();
    for (const details of fixture.nativeElement.querySelectorAll('.report-templates, .report-templates details'))
      details.open = true;
    const editor = fixture.debugElement.queryAll(By.directive(ReportTemplateInputComponent))[0];
    const tree = editor.query(By.directive(FieldTreeComponent));
    const node = tree.componentInstance.nodes.find((n: any) => n.path === 'oid');
    tree.componentInstance.choose(node);
    render();
    expect(component.selectedReport!.columns[0].template).toContain('{{oid}}');
    expect(document.activeElement?.id).toBe('column-display-0');
  });
  it('autocompletes a real report row field from the keyboard', async () => {
    await edit();
    const input = query('#column-display-0') as HTMLTextAreaElement;
    input.focus();
    input.value = '{{metadata.pro';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input'));
    render();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    render();
    expect(component.selectedReport!.columns[0].template).toBe('{{metadata.projectTitle}}');
  });
  it('places structured diagnostics beside the relevant filter, column and each template', async () => {
    await edit();
    api.validate.and.resolveTo({
      valid: true,
      diagnostics: [
        diagnostic('filter.0.paramName'),
        diagnostic('columns.0.property'),
        diagnostic('columns.0.template'),
        diagnostic('columns.0.exportTemplate'),
      ],
    });
    await component.validateDraft();
    render();
    for (const location of [
      'filter.0.paramName',
      'columns.0.property',
      'columns.0.template',
      'columns.0.exportTemplate',
    ])
      expect(query(`[data-location="${location}"]`)).toBeTruthy();
    expect(query('[data-filter="0"] [data-location="filter.0.paramName"]')).toBeTruthy();
    expect(query('[data-column="0"] [data-location="columns.0.template"]')).toBeTruthy();
    expect(text()).toContain('report-advisory');
    expect(text()).toContain('manualSuggestion');
    expect(component.selectedReport).toEqual(report());
  });
  it('shows date binding diagnostics next to their separate bound controls', async () => {
    const value = report();
    value.filter[0] = { ...value.filter[0], type: 'date-range', database: { fromProperty: 'bad', toProperty: 'bad2' } };
    await edit(value);
    api.validate.and.resolveTo({
      valid: true,
      diagnostics: [diagnostic('filter.0.database.fromProperty'), diagnostic('filter.0.database.toProperty')],
    });
    await component.validateDraft();
    render();
    expect(query('[data-location="filter.0.database.fromProperty"]')).toBeTruthy();
    expect(query('[data-location="filter.0.database.toProperty"]')).toBeTruthy();
  });
  it('blocks invalid saves while keeping advisory diagnostics nonblocking', async () => {
    await edit();
    api.validate.and.resolveTo({ valid: false, diagnostics: [diagnostic('name', 'error')] });
    await component.saveReport();
    render();
    expect(api.update).not.toHaveBeenCalled();
    expect(text()).toContain('report-blocking');
    api.validate.and.resolveTo({ valid: true, diagnostics: [diagnostic('columns.0.template')] });
    await component.saveReport();
    expect(api.update).toHaveBeenCalled();
  });
  it('debounces validation on edits without automatically executing previews', fakeAsync(() => {
    component.editReport(report());
    flush();
    api.validate.calls.reset();
    component.selectedReport!.title = 'One';
    component.draftChanged();
    tick(200);
    component.selectedReport!.title = 'Two';
    component.draftChanged();
    tick(399);
    expect(api.validate).not.toHaveBeenCalled();
    tick(1);
    expect(api.validate).toHaveBeenCalledTimes(1);
    expect(api.preview).not.toHaveBeenCalled();
    flush();
  }));
  it('previews unsaved templates, filters and columns only from the explicit action', async () => {
    await edit();
    change('#column-label-0', 'Unsaved title');
    component.selectedReport!.columns[0].template = '<em>{{metadata.projectTitle}}</em>';
    component.previewFilterValues = { titleSearch: 'draft' };
    expect(api.preview).not.toHaveBeenCalled();
    await component.previewReport();
    render();
    expect(api.preview.calls.mostRecent().args).toEqual([component.selectedReport, { titleSearch: 'draft' }]);
    expect(api.update).not.toHaveBeenCalled();
    expect(query('.report-display-preview th').textContent).toBe('Unsaved title');
    expect(query('.report-display-preview td b').textContent).toBe('Real title');
  });
  it('uses Angular innerHTML sanitization for untrusted display HTML, stripping script and onerror', async () => {
    await edit();
    const result = preview();
    result.renderedRows[0].cells[0].untrustedDisplayHtml =
      '<b>Allowed</b><script>window.reportInjected=true</script><img src="x" onerror="window.reportInjected=true"><a href="javascript:alert(1)">Link</a>';
    api.preview.and.resolveTo(result);
    await component.previewReport();
    render();
    const cell = query('.report-display-preview td');
    expect(cell.querySelector('b')!.textContent).toBe('Allowed');
    expect(cell.querySelector('script')).toBeNull();
    expect(cell.querySelector('img')!.hasAttribute('onerror')).toBeFalse();
    expect(cell.querySelector('a')!.getAttribute('href')).toContain('unsafe:');
    expect((window as any).reportInjected).toBeUndefined();
  });
  it('shows export values as text including hidden columns and keeps raw results inspectable', async () => {
    const value = report();
    value.columns.push({ label: 'Hidden', property: 'oid', hide: true });
    await edit(value);
    const result = preview();
    result.renderedRows[0].cells.push({ untrustedDisplayHtml: '<i>Hidden HTML</i>', export: '<b>Export text</b>' });
    api.preview.and.resolveTo(result);
    await component.previewReport();
    render();
    expect(fixture.nativeElement.querySelectorAll('.report-display-preview td').length).toBe(1);
    const cells = fixture.nativeElement.querySelectorAll('.report-export-preview td');
    expect(cells.length).toBe(2);
    expect(cells[1].textContent).toBe('<b>Export text</b>');
    expect(cells[1].querySelector('b')).toBeNull();
    expect(query('.report-raw-results pre').textContent).toContain('Real title');
  });
  it('uses the legacy text/date preview input names without changing saved bindings', async () => {
    const value = report();
    value.filter.push({
      type: 'date-range',
      paramName: 'dateRange',
      message: 'Created',
      property: '',
      database: { fromProperty: 'createdAfter', toProperty: 'createdBefore' },
    });
    await edit(value);
    change('#preview-text-0', 'draft');
    change('#preview-from-1', '2026-01-01');
    change('#preview-to-1', '2026-02-01');
    await component.previewReport();
    expect(api.preview.calls.mostRecent().args[1]).toEqual({
      titleSearch: 'draft',
      dateRange_fromDate: '2026-01-01',
      dateRange_toDate: '2026-02-01',
    });
    expect(component.selectedReport!.filter).toEqual(value.filter);
  });
  it('shows truncation reasons and the missing deadline notice', async () => {
    await edit();
    const result = preview();
    result.truncated = true;
    result.truncationReasons = ['rows', 'bytes'];
    result.deadlineEnforced = false;
    api.preview.and.resolveTo(result);
    await component.previewReport();
    render();
    expect(query('.report-truncation').textContent).toContain('rows, bytes');
    expect(query('.report-deadline').textContent).toContain('report-preview-no-deadline');
  });
  it('omits truncation and deadline warnings for an untruncated bounded preview', async () => {
    await edit();
    await component.previewReport();
    render();
    expect(query('.report-truncation')).toBeNull();
    expect(query('.report-deadline')).toBeNull();
  });
  it('shows preview-only refusals and diagnostics without blocking legacy saves', async () => {
    await edit();
    const result = preview();
    result.valid = false;
    result.success = false;
    result.renderedRows = [];
    result.diagnostics = [diagnostic('columns.0.template', 'error')];
    api.preview.and.resolveTo(result);
    await component.previewReport();
    render();
    expect(text()).toContain('report-preview-refused');
    expect(component.saveBlocked).toBeFalse();
    await component.saveReport();
    expect(api.update).toHaveBeenCalled();
  });
  it('changes the query without deleting columns, rewriting templates or replacing filter keys', async () => {
    await edit();
    const before = JSON.parse(JSON.stringify(component.selectedReport));
    api.validate.and.resolveTo({
      valid: true,
      diagnostics: [diagnostic('filter.0.paramName'), diagnostic('columns.0.property')],
    });
    component.selectQuery('other');
    await settle();
    render();
    expect(component.selectedReport!.filter).toEqual(before.filter);
    expect(component.selectedReport!.columns).toEqual(before.columns);
    expect(query('[data-location="filter.0.paramName"]')).toBeTruthy();
    expect(query('[data-location="columns.0.property"]')).toBeTruthy();
  });
  it('refreshes descriptions after external edits on focus and the explicit action, preserving draft edits', async () => {
    await edit();
    change('#column-label-0', 'Unsaved');
    api.describeQuery.calls.reset();
    component.onWindowFocus();
    await settle();
    expect(api.describeQuery).toHaveBeenCalledTimes(1);
    await component.refreshAssistance();
    expect(api.describeQuery).toHaveBeenCalledTimes(2);
    expect(component.selectedReport!.columns[0].label).toBe('Unsaved');
  });
  it('keeps editing and legacy saving available when assistance endpoints fail', async () => {
    api.describeQuery.and.rejectWith(new Error('unavailable'));
    api.validate.and.rejectWith(new Error('unavailable'));
    await edit();
    expect(component.assistanceError).toBe('report-assistance-unavailable');
    expect(component.validationError).toBe('report-validation-unavailable');
    change('#report-title', 'Still editable');
    await component.saveReport();
    expect(api.update.calls.mostRecent().args[0].title).toBe('Still editable');
  });
  it('rejects late descriptions from the previously selected query', async () => {
    const old = deferred<ReportNamedQueryDescription>();
    api.describeQuery.and.returnValue(old.promise);
    component.editReport(report());
    api.describeQuery.and.resolveTo({ ...description(), name: 'new' });
    component.selectQuery('other');
    await settle();
    old.resolve(description());
    await settle();
    expect(component.description!.name).toBe('new');
  });
  it('rejects late description errors and busy-state changes after switching reports', async () => {
    const old = deferred<ReportNamedQueryDescription>(),
      current = deferred<ReportNamedQueryDescription>();
    api.describeQuery.and.returnValue(old.promise);
    component.editReport(report());
    api.describeQuery.and.returnValue(current.promise);
    component.editReport(report('new'));
    old.reject(new Error('late'));
    await settle();
    expect(component.assistanceError).toBe('');
    expect(component.describing).toBeTrue();
    current.resolve(description());
    await settle();
    expect(component.describing).toBeFalse();
  });
  it('rejects late validation diagnostics after draft edits', async () => {
    await edit();
    const old = deferred<any>();
    api.validate.and.returnValue(old.promise);
    const pending = component.validateDraft();
    component.selectedReport!.title = 'New draft';
    component.draftChanged();
    old.resolve({ valid: false, diagnostics: [diagnostic('name', 'error')] });
    await pending;
    expect(component.diagnostics).toEqual([]);
    expect(component.saveBlocked).toBeFalse();
  });
  it('rejects late validation responses after changing queries', async () => {
    await edit();
    const old = deferred<any>();
    api.validate.and.returnValue(old.promise);
    const pending = component.validateDraft();
    api.validate.and.resolveTo({ valid: true, diagnostics: [diagnostic('columns.0.property')] });
    component.selectQuery('other');
    await settle();
    old.resolve({ valid: false, diagnostics: [diagnostic('name', 'error')] });
    await pending;
    expect(component.diagnostics.map(d => d.field)).toEqual(['columns.0.property']);
    expect(component.saveBlocked).toBeFalse();
  });
  it('rejects late previews after switching reports', async () => {
    await edit();
    const old = deferred<ReportConfigPreviewDto>();
    api.preview.and.returnValue(old.promise);
    const pending = component.previewReport();
    component.editReport(report('new'));
    old.resolve(preview());
    await pending;
    expect(component.previewResult).toBeNull();
    expect(component.isPreviewing).toBeFalse();
    expect(component.selectedReport!.name).toBe('new');
  });
  it('rejects late previews after switching queries', async () => {
    await edit();
    const old = deferred<ReportConfigPreviewDto>();
    api.preview.and.returnValue(old.promise);
    const pending = component.previewReport();
    component.selectQuery('other');
    old.resolve(preview());
    await pending;
    expect(component.previewResult).toBeNull();
  });
  it('keeps the current preview busy when an obsolete request fails', async () => {
    await edit();
    const old = deferred<ReportConfigPreviewDto>(),
      current = deferred<ReportConfigPreviewDto>();
    api.preview.and.returnValue(old.promise);
    const first = component.previewReport();
    api.preview.and.returnValue(current.promise);
    const second = component.previewReport();
    old.reject(new Error('obsolete'));
    await first;
    expect(component.isPreviewing).toBeTrue();
    expect(component.errorMessage).toBe('');
    current.resolve(preview());
    await second;
    expect(component.previewResult).toEqual(preview());
  });
  it('invalidates a preview when the unsaved configuration or preview filter values change', async () => {
    await edit();
    const old = deferred<ReportConfigPreviewDto>();
    api.preview.and.returnValue(old.promise);
    const pending = component.previewReport();
    change('#preview-text-0', 'changed');
    old.resolve(preview());
    await pending;
    expect(component.previewResult).toBeNull();
    api.preview.and.callFake(async () => preview());
    await component.previewReport();
    change('#column-label-0', 'Edited');
    expect(component.previewResult).toBeNull();
  });
  it('protects cancel, create and switching reports when unsaved changes are declined', async () => {
    await edit();
    change('#report-title', 'Unsaved');
    confirm.and.returnValue(false);
    component.cancelEdit();
    component.createReport();
    component.editReport(report('other'));
    expect(component.selectedReport!.title).toBe('Unsaved');
    expect(component.selectedReport!.name).toBe('report');
    expect(confirm).toHaveBeenCalledTimes(3);
  });
  it('discards only after explicit confirmation and keeps source objects unchanged', async () => {
    const source = report();
    await edit(source);
    change('#report-title', 'Unsaved');
    component.cancelEdit();
    expect(confirm).toHaveBeenCalled();
    expect(component.selectedReport).toBeNull();
    expect(source.title).toBe('Report');
  });
  it('protects beforeunload only when the persistent draft changed', async () => {
    await edit();
    const clean = { preventDefault: jasmine.createSpy(), returnValue: undefined } as any;
    component.beforeUnload(clean);
    expect(clean.preventDefault).not.toHaveBeenCalled();
    component.previewFilterValues['titleSearch'] = 'preview only';
    expect(component.dirty).toBeFalse();
    component.selectedReport!.title = 'Unsaved';
    component.beforeUnload(clean);
    expect(clean.preventDefault).toHaveBeenCalled();
    expect(clean.returnValue).toBe('');
  });
  it('protects portal link navigation when abandoning changes is declined', async () => {
    await edit();
    component.selectedReport!.title = 'Unsaved';
    confirm.and.returnValue(false);
    const anchor = document.createElement('a');
    anchor.href = '/elsewhere';
    const event = { target: anchor, preventDefault: jasmine.createSpy(), stopPropagation: jasmine.createSpy() } as any;
    component.guardNavigation(event);
    expect(event.preventDefault).toHaveBeenCalled();
  });
  it('does not prompt for a no-op draft or changes to assistance state', async () => {
    await edit();
    component.toggleOutput('oid', true);
    component.helpOpen = false;
    component.outputSearch = 'title';
    component.cancelEdit();
    expect(confirm).not.toHaveBeenCalled();
    expect(component.selectedReport).toBeNull();
  });
  it('keeps Solr reports viewable read-only and never calls editing endpoints', async () => {
    await component.loadReports();
    render();
    const solr = component.reports.find(r => r.name === 'solr')!;
    expect(component.openReport(solr)).toContain('/admin/report/solr');
    component.editReport(solr);
    expect(component.selectedReport).toBeNull();
    component.selectedReport = solr;
    component.addColumn();
    component.addFilter();
    await component.saveReport();
    await component.previewReport();
    await component.deleteReport(solr);
    expect(api.update).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
    expect(api.delete).not.toHaveBeenCalled();
    expect(solr.columns.length).toBe(1);
  });
  it('round-trips existing optional, legacy and hook config unchanged on a no-op save', async () => {
    const value: any = report();
    delete value.columns[0].template;
    delete value.columns[0].exportTemplate;
    value.hookOption = { literal: true };
    value.columns[0].hookColumn = 'x';
    value.filter[0].database = null;
    value.filter[0].hookFilter = { key: 'legacy' };
    const original = JSON.parse(JSON.stringify(value));
    await edit(value);
    expect(component.dirty).toBeFalse();
    await component.saveReport();
    expect(api.update.calls.mostRecent().args[0]).toEqual(original);
    expect(value).toEqual(original);
    expect(confirm).not.toHaveBeenCalled();
  });
  it('preserves edits made during a save and resets the baseline to the saved snapshot', async () => {
    await edit();
    const saved = deferred<ReportConfigDto>();
    api.update.and.returnValue(saved.promise);
    const pending = component.saveReport();
    await settle();
    component.selectedReport!.title = 'Later edit';
    component.draftChanged();
    saved.resolve(report());
    await pending;
    expect(component.selectedReport!.title).toBe('Later edit');
    expect(component.dirty).toBeTrue();
    expect(component.isSaving).toBeFalse();
  });
  it('does not allow an old save to close another report', async () => {
    await edit();
    const saved = deferred<ReportConfigDto>();
    api.update.and.returnValue(saved.promise);
    const pending = component.saveReport();
    await settle();
    component.editReport(report('new'));
    saved.resolve(report());
    await pending;
    expect(component.selectedReport!.name).toBe('new');
  });
  it('retains the draft and clears saving state after a save failure', async () => {
    await edit();
    api.update.and.rejectWith({ error: { message: 'Save failed' } });
    await component.saveReport();
    expect(component.selectedReport).toEqual(report());
    expect(component.errorMessage).toBe('Save failed');
    expect(component.isSaving).toBeFalse();
  });
  it('invalidates assistance and preview requests on teardown', async () => {
    await edit();
    const pending = deferred<ReportConfigPreviewDto>();
    api.preview.and.returnValue(pending.promise);
    const request = component.previewReport();
    component.ngOnDestroy();
    pending.resolve(preview());
    await request;
    expect(component.previewResult).toBeNull();
  });
  it('provides associated labels for templates and all editable text/select controls', async () => {
    await edit();
    for (const input of Array.from(
      fixture.nativeElement.querySelectorAll('input:not([type="checkbox"]), select, textarea')
    ) as HTMLElement[])
      expect(!!input.getAttribute('aria-label') || !!query(`label[for="${input.id}"]`))
        .withContext(input.outerHTML)
        .toBeTrue();
    expect(fixture.debugElement.queryAll(By.directive(CodeEditorComponent)).length).toBe(2);
  });
});
