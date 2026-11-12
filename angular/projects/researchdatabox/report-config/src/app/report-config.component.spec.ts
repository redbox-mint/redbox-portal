import { ChangeDetectorRef } from '@angular/core';
import { Pipe, PipeTransform } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import {
  AdminSidePanelComponent,
  AdminSourceCardComponent,
  ColumnsPanelComponent,
  AdminOverflowDirective,
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
import { RecordGridService } from '../../../data-grids/src/app/record-grid.service';
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
    field('metadata.[dc:title]'),
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
  let gridApi: { waitForInit: jasmine.Spy; read: jasmine.Spy; fields: jasmine.Spy; selections: jasmine.Spy };
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
    let filterEdit = false;
    if (/^#filter-/.test(selector)) {
      component.openFilter(Number(selector.split('-').pop()));
      render();
      filterEdit = true;
    }
    const input = query(selector) as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event(input.tagName === 'SELECT' ? 'change' : 'input'));
    if (filterEdit) component.doneFilter();
    render();
  };
  beforeEach(async () => {
    api = new ApiStub();
    gridApi = jasmine.createSpyObj('RecordGridService', ['waitForInit', 'read', 'fields', 'selections']);
    gridApi.waitForInit.and.resolveTo();
    await TestBed.configureTestingModule({
      declarations: [ReportConfigComponent, TranslationPipe],
      imports: [
        CommonModule,
        FormsModule,
        AdminSidePanelComponent,
        AdminSourceCardComponent,
        ColumnsPanelComponent,
        AdminOverflowDirective,
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
        { provide: RecordGridService, useValue: gridApi },
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
    expect(component.parameters.map(p => p.key)).toContain('createdAfter');
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
    expect(query('a[href*="/admin/named-query"]')).toBeTruthy();
  });
  it('preserves an unlisted legacy query as a selectable option', async () => {
    await edit({ ...report(), databaseQuery: { queryName: 'hookQuery' } });
    expect(Array.from((query('#report-named-query') as HTMLSelectElement).options).map(o => o.value)).toContain(
      'hookQuery'
    );
  });
  it('selecting output fields does not add columns until the explicit action', async () => {
    await edit();
    component.columnsOpen = true;
    render();
    const panel = fixture.debugElement.query(By.directive(ColumnsPanelComponent))
      .componentInstance as ColumnsPanelComponent;
    panel.toggle('oid');
    expect(component.selectedReport!.columns.length).toBe(1);
    component.applyColumns(panel.columns);
    expect(component.selectedReport!.columns.length).toBe(2);
    expect(component.columnsOpen).toBeFalse();
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
    component.openFilter(0);
    render();
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
    component.openFilter(0);
    render();
    expect(query('#filter-from-0').closest('label')!.textContent).toContain('report-filter-from-parameter');
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
    component.editColumn(0);
    render();
    const editors = fixture.debugElement
      .queryAll(By.directive(ReportTemplateInputComponent))
      .map(d => d.componentInstance as ReportTemplateInputComponent);
    expect(editors.length).toBe(2);
    expect(
      editors.find(e => e.kind === 'display')!.source.fields.find(f => f.path === 'recordTableMeta.val')!.type
    ).toBe('undefined');
    expect(editors.find(e => e.kind === 'csv')!.source.fields.find(f => f.path === 'recordTableMeta.val')!.type).toBe(
      'string'
    );
    expect(component.dirty).toBeFalse();
  });
  it('updates autocomplete contexts after property or multivalue edits and explains arrays', async () => {
    await edit();
    component.editColumn(0);
    component.columnDraft!.property = 'metadata.tags';
    component.columnDraft!.multivalue = true;
    render();
    for (const editor of fixture.debugElement.queryAll(By.directive(ReportTemplateInputComponent)))
      expect(
        editor.componentInstance.source.fields.find((f: ContextSchemaField) => f.path === 'recordTableMeta.val').type
      ).toBe('string');
    expect(component.columnFields.some(f => f.path === 'metadata.tags')).toBeTrue();
    expect(component.columnFields.some(f => f.path === 'metadata')).toBeFalse();
  });
  it('inserts a friendly field without changing the saved column until Done', async () => {
    await edit();
    component.editColumn(0);
    render();
    const editor = fixture.debugElement.queryAll(By.directive(ReportTemplateInputComponent))[0];
    const button = editor.nativeElement.querySelector('[data-template-field="oid"]');
    expect(button.textContent).toContain('data-grids-oid');
    button.click();
    render();
    expect(component.columnDraft!.template).toContain('{{oid}}');
    expect(component.selectedReport!.columns[0].template).toBe('{{metadata.projectTitle}}');
    component.doneColumn();
    expect(component.selectedReport!.columns[0].template).toContain('{{oid}}');
  });
  it('autocompletes a real report row field from the keyboard', async () => {
    await edit();
    component.editColumn(0);
    render();
    const input = query('#report-display-template') as HTMLTextAreaElement;
    input.focus();
    input.value = '{{metadata.pro';
    input.setSelectionRange(input.value.length, input.value.length);
    input.dispatchEvent(new Event('input'));
    render();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    render();
    expect(component.columnDraft!.template).toBe('{{metadata.projectTitle}}');
  });
  it('places structured diagnostics beside the relevant filter, column and each template', async () => {
    await edit();
    api.validate.and.resolveTo({
      valid: true,
      diagnostics: ['filter.0.paramName', 'columns.0.property', 'columns.0.template', 'columns.0.exportTemplate'].map(
        f => diagnostic(f)
      ),
    });
    await component.validateDraft();
    component.editColumn(0);
    render();
    for (const location of ['columns.0.property', 'columns.0.template', 'columns.0.exportTemplate'])
      expect(query(`[data-location="${location}"]`)).toBeTruthy();
    component.columnDraft = null;
    component.openFilter(0);
    render();
    expect(query('[data-location="filter.0.paramName"]')).toBeTruthy();
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
    component.openFilter(0);
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
    component.previewMode = 'csv';
    render();
    const cells = fixture.nativeElement.querySelectorAll('.report-export-preview td');
    expect(cells.length).toBe(2);
    expect(cells[1].textContent.trim()).toBe('<b>Export text</b>');
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
    expect(query('.report-truncation').textContent).toContain('report-ux-preview-bounded');
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
    component.openFilter(0);
    render();
    expect(query('[data-location="filter.0.paramName"]')).toBeTruthy();
    component.filterDraft = null;
    component.editColumn(0);
    render();
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
      expect(!!input.getAttribute('aria-label') || !!query(`label[for="${input.id}"]`) || !!input.closest('label'))
        .withContext(input.outerHTML)
        .toBeTrue();
    component.editColumn(0);
    render();
    expect(fixture.debugElement.queryAll(By.directive(CodeEditorComponent)).length).toBe(2);
  });
  it('a report reopened during post-save list reload must retain the saved edits', async () => {
    await edit(component.reports[0]);
    change('#report-title', 'Saved title');
    const reload = deferred<ReportConfigDto[]>();
    api.list.and.returnValue(reload.promise);
    api.update.and.resolveTo({ ...report(), title: 'Saved title' });
    const saving = component.saveReport();
    await settle();
    render();
    expect(query('.report-workspace')).toBeTruthy();
    expect(query('.report-actions button')).toBeNull();
    expect(component.isSaving).toBeTrue();
    expect(component.reports.find(r => r.name === 'report')!.title).toBe('Saved title');
    // Cancel can still expose the list during reload; it must already contain the server response.
    component.cancelEdit();
    render();
    query('.report-row-actions button:not(:disabled)').click();
    await settle();
    expect(component.selectedReport!.title).toBe('Saved title');
    reload.resolve([{ ...report(), title: 'Saved title' }]);
    await saving;
    expect(component.selectedReport!.title).toBe('Saved title');
    await component.saveReport();
    expect(api.update).toHaveBeenCalledTimes(2);
    expect(api.update.calls.mostRecent().args[0].title)
      .withContext('a second no-op save must not revert the successful first save')
      .toBe('Saved title');
  });

  it('a failed post-save reload must be reported to the user', async () => {
    await edit();
    change('#report-title', 'Saved title');
    api.list.and.rejectWith({ error: { message: 'Refresh failed' } });
    await component.saveReport();
    expect(component.errorMessage).toBe('Refresh failed');
    expect(component.selectedReport!.title).toBe('Saved title');
    expect(component.isSaving).toBeFalse();
    render();
    expect(text()).toContain('Refresh failed');
  });

  it('refreshing guidance during slow save validation must not silently discard Save', async () => {
    await edit();
    change('#report-title', 'Please save this');
    const validatingSave = deferred<any>();
    api.validate.and.returnValue(validatingSave.promise);
    const saving = component.saveReport();
    api.validate.and.resolveTo({ valid: true, diagnostics: [] });
    component.onWindowFocus();
    await settle();
    validatingSave.resolve({ valid: true, diagnostics: [] });
    await saving;
    expect(api.update).toHaveBeenCalled();
  });

  it('preview during slow save validation must not silently discard Save', async () => {
    await edit();
    change('#report-title', 'Please save this');
    const validatingSave = deferred<any>();
    api.validate.and.returnValue(validatingSave.promise);
    const saving = component.saveReport();
    await component.previewReport();
    validatingSave.resolve({ valid: true, diagnostics: [] });
    await saving;
    expect(api.update).toHaveBeenCalled();
  });

  for (const literal of ['literal.alias', 'dc:title']) {
    it(`offers and inserts the literal ${literal} output alias in column autocomplete`, async () => {
      await edit();
      component.editColumn(0);
      render();
      const input = query('#report-column-path') as HTMLInputElement;
      change('#report-column-path', 'metadata.');
      input.scrollIntoView({ block: 'center' });
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      const autocomplete = fixture.debugElement
        .queryAll(By.directive(AutocompleteComponent))
        .map(d => d.componentInstance as AutocompleteComponent)
        .find(c => c.target === input)!;
      autocomplete.update(true);
      expect(autocomplete.items.map(i => i.value)).toContain('metadata.projectTitle');
      const index = autocomplete.items.findIndex(i => i.value === `metadata.[${literal}]`);
      expect(index).toBeGreaterThanOrEqual(0);
      autocomplete.active = index;
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
      expect(component.columnDraft!.property).toBe(`metadata["${literal}"]`);
    });
  }

  it('explicitly refreshing assistance cannot cancel Save validation', async () => {
    await edit();
    const validation = deferred<any>();
    api.validate.and.returnValue(validation.promise);
    const pending = component.saveReport();
    api.validate.and.resolveTo({ valid: true, diagnostics: [] });
    await component.refreshAssistance();
    validation.resolve({ valid: true, diagnostics: [] });
    await pending;
    expect(api.update).toHaveBeenCalledTimes(1);
  });

  it('shows why Save stopped when the draft changes during validation', async () => {
    await edit();
    const validation = deferred<any>();
    api.validate.and.returnValue(validation.promise);
    const pending = component.saveReport();
    change('#report-title', 'Later edit');
    validation.resolve({ valid: true, diagnostics: [] });
    await pending;
    expect(api.update).not.toHaveBeenCalled();
    expect(component.selectedReport!.title).toBe('Later edit');
    expect(component.errorMessage).toBe('report-save-draft-changed');
    expect(component.isSaving).toBeFalse();
  });

  it('ignores Save validation after switching items, including its diagnostics', async () => {
    await edit();
    const validation = deferred<any>();
    api.validate.and.returnValue(validation.promise);
    const pending = component.saveReport();
    api.validate.and.resolveTo({ valid: true, diagnostics: [] });
    await edit(report('other'));
    validation.resolve({ valid: false, diagnostics: [diagnostic('title', 'error')] });
    await pending;
    expect(api.update).not.toHaveBeenCalled();
    expect(component.selectedReport!.name).toBe('other');
    expect(component.diagnostics).toEqual([]);
    expect(component.isSaving).toBeFalse();
  });

  it('honors blocking Save validation even after assistance refresh validates successfully', async () => {
    await edit();
    const validation = deferred<any>();
    api.validate.and.returnValue(validation.promise);
    const pending = component.saveReport();
    api.validate.and.resolveTo({ valid: true, diagnostics: [] });
    await component.refreshAssistance();
    validation.resolve({ valid: false, diagnostics: [diagnostic('title', 'error')] });
    await pending;
    expect(api.update).not.toHaveBeenCalled();
    expect(component.saveBlocked).toBeTrue();
    expect(component.diagnostics).toEqual([diagnostic('title', 'error')]);
    expect(component.isSaving).toBeFalse();
  });

  it('preserves later edits while the saved list reload is pending', async () => {
    await edit();
    change('#report-title', 'Saved title');
    const reload = deferred<ReportConfigDto[]>();
    api.list.and.returnValue(reload.promise);
    api.update.and.resolveTo({ ...report(), title: 'Saved title' });
    const pending = component.saveReport();
    await settle();
    change('#report-title', 'Later edit');
    reload.resolve([{ ...report(), title: 'Saved title' }]);
    await pending;
    expect(component.selectedReport!.title).toBe('Later edit');
    expect(component.dirty).toBeTrue();
    expect(component.isSaving).toBeFalse();
  });

  it('reconciles a created report before a failed refresh without creating it again on retry', async () => {
    component.createReport();
    render();
    change('#report-name', 'created');
    change('#report-title', 'Created title');
    api.create.and.resolveTo({ ...report('created'), title: 'Created title' });
    api.list.and.rejectWith({ error: { message: 'Refresh failed' } });
    await component.saveReport();
    expect(component.reports.find(r => r.name === 'created')!.title).toBe('Created title');
    expect(component.isNewReport).toBeFalse();
    expect(component.errorMessage).toBe('Refresh failed');
    api.list.and.resolveTo(component.reports);
    await component.saveReport();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledTimes(1);
  });
  it('pins a newly selected GraphQL query and previews its first page without saving', async () => {
    await edit();
    api.describeQuery.and.resolveTo({ ...description(), source: 'graphql', queryVersion: 'version-one' });
    component.selectQuery('other');
    await settle();
    render();
    expect(component.selectedReport?.databaseQuery?.queryVersion).toBe('version-one');
    expect(api.preview).toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
    expect(api.update).not.toHaveBeenCalled();
    expect(component.previewResult).not.toBeNull();
  });
  it('requires explicit review when the named query version changes', async () => {
    const saved = report();
    saved.databaseQuery!.queryVersion = 'version-one';
    api.describeQuery.and.resolveTo({ ...description(), source: 'graphql', queryVersion: 'version-two' });
    await edit(saved);
    expect(component.queryVersionChanged).toBeTrue();
    expect(component.selectedReport?.databaseQuery?.queryVersion).toBe('version-one');
    expect(api.preview).not.toHaveBeenCalled();
    component.reviewQueryVersion();
    await settle();
    expect(component.queryVersionChanged).toBeFalse();
    expect(api.preview).toHaveBeenCalled();
  });
  it('chooses GraphQL columns and filters with labels while preserving paths and caller parameter keys', async () => {
    await edit();
    component.description = { ...description(), source: 'graphql', queryVersion: 'one' };
    component.selectedReport!.columns = [];
    component.toggleOutput('metadata.projectTitle', true);
    component.addSelectedColumns();
    component.addParameterFilter(component.parameters[0]);
    await settle();
    render();
    expect(component.selectedReport!.columns[0]).toEqual({ label: 'Project title', property: 'metadata.projectTitle' });
    component.editColumn(0);
    render();
    expect(query('#report-column-field')).not.toBeNull();
    expect(component.selectedReport!.filter.filter(filter => filter.paramName === 'titleSearch').length).toBe(1);
    expect(component.parameterLabel(component.parameters[0])).toBe('Title Search');
  });

  const graphqlReportCodes = [
    'GRAPHQL_REPORT_PAGING_REQUIRED',
    'GRAPHQL_LOOKUP_UNSUPPORTED',
    'GRAPHQL_CONTEXT_REQUIRED',
    'GRAPHQL_OFFSET_UNSUPPORTED',
    'GRAPHQL_PAGE_INVALID',
    'GRAPHQL_EXECUTION_FAILED',
    'GRAPHQL_RESULT_INVALID',
    'GRAPHQL_ROW_INVALID',
    'GRAPHQL_DISABLED',
    'UNAVAILABLE',
    'QUERY_TIMEOUT',
    'QUERY_LIMIT',
    'COLLECTION_LIMIT',
    'INVALID_GRAPHQL_NAMED_QUERY',
    'INVALID_GRAPHQL_PARAMETER',
    'REPORT_QUERY_CHANGED',
    'REPORT_CURSOR_INVALID',
    'REPORT_EXPORT_ROW_LIMIT',
    'REPORT_EXPORT_PAGE_LIMIT',
    'REPORT_EXPORT_BYTE_LIMIT',
    'REPORT_EXPORT_TIMEOUT',
    'REPORT_OFFSET_UNSUPPORTED',
    'REPORT_PAGE_INVALID',
    'REPORT_CURSOR_UNAVAILABLE',
    'REPORT_LIMIT_CONFIG_INVALID',
    'INPUT_LIMIT',
    'COMPLEXITY_LIMIT',
    'MAPPING_LIMIT',
    'PREVIEW_TIMEOUT',
    'FORBIDDEN',
  ];
  for (const code of graphqlReportCodes) {
    it(`translates the known GraphQL report code ${code} in preview failures`, async () => {
      await edit();
      const key = 'report-graphql-error-' + code;
      spyOn(TestBed.inject(TranslationService), 't').and.callFake((value: string) =>
        value === key ? 'Specific translated explanation' : value
      );
      api.preview.and.rejectWith({ error: { message: code } });
      await component.previewReport();
      expect(component.errorMessage).toBe('Specific translated explanation');
    });
  }
  for (const envelope of [
    { message: 'GRAPHQL_REPORT_PAGING_REQUIRED' },
    { data: { message: 'GRAPHQL_REPORT_PAGING_REQUIRED' } },
    { message: 'failure', errors: [{ code: 'GRAPHQL_REPORT_PAGING_REQUIRED' }] },
  ]) {
    it('shows the paging remedy when description fails with a known code', async () => {
      const key = 'report-graphql-error-GRAPHQL_REPORT_PAGING_REQUIRED';
      spyOn(TestBed.inject(TranslationService), 't').and.callFake((value: string) =>
        value === key ? 'Re-publish this query from the Record explorer.' : value
      );
      api.describeQuery.and.rejectWith({ error: envelope });
      await edit();
      expect(component.assistanceError).toBe('Re-publish this query from the Record explorer.');
      expect(component.errorMessage).toBe('');
    });
  }
  it('does not automatically preview a GraphQL query whose description is blocked', async () => {
    api.describeQuery.and.resolveTo({
      ...description(),
      source: 'graphql',
      valid: false,
      queryVersion: 'version-one',
      diagnostics: [
        {
          ...diagnostic('databaseQuery.queryName', 'error'),
          code: 'GRAPHQL_REPORT_PAGING_REQUIRED',
          reason: 'report-graphql-paging-required',
        },
      ],
    });
    await edit();
    expect(api.preview).not.toHaveBeenCalled();
    expect(component.errorMessage).toBe('');
  });

  it('labels ActivePlans repeated inline-fragment output fields from the explorer catalogue', async () => {
    const fields = [
      { id: 'record:oid', label: 'OID', type: 'text', selectable: true, selections: [{ responsePath: ['oid'] }] },
      {
        id: 'metadata:/title',
        label: 'Title',
        type: 'text',
        selectable: true,
        selections: [{ responsePath: ['metadata', 'catalogue_title'] }],
      },
      {
        id: 'metadata:/uon:ethicsApprovalStatus',
        groupPath: ['Ethical considerations'],
        label: 'Ethics approval status',
        type: 'text',
        selectable: true,
        selections: [{ responsePath: ['metadata', 'catalogue_ethics'] }],
      },
      {
        id: 'metadata:/dc:coverage_vivo:DateTimeInterval_vivo:start',
        label: 'Start Date',
        type: 'date',
        selectable: true,
        selections: [{ responsePath: ['metadata', 'catalogue_start'] }],
      },
    ];
    gridApi.read.and.resolveTo({ mode: 'visual', workflowStage: 'active', columns: fields.map(f => f.id) });
    gridApi.fields.and.resolveTo([{ fields }]);
    gridApi.selections.and.resolveTo(fields);
    const output = [
      field('oid', 'string', 'Oid'),
      field('metadata', 'object', 'Metadata'),
      ...[1, 2, 3].map(i => field('metadata.explorer_field_' + i, 'string', 'Explorer field ' + i)),
    ];
    api.describeQuery.and.resolveTo({
      ...description(),
      source: 'graphql',
      queryVersion: 'version-one',
      result: { ...description().result, fields: output },
    });
    component.namedQueries = [
      {
        name: 'query',
        source: 'graphql',
        sourceSavedQuery: { id: 'active-source', name: 'UON — Active research plans' },
        graphql: {
          document: `query($type:String!,$stages:[String!],$sort:[RecordSortInput!],$first:Int,$after:String){
          records(recordType:$type,workflowStages:$stages,sort:$sort,first:$first,after:$after){
            nodes{oid metadata{
              ... on ActiveMetadata {explorer_field_1:title}
              ... on ActiveMetadata {explorer_field_2:rb_75006f006e003a0065007400680069006300730041007000700072006f00760061006c00530074006100740075007300}
              ... on ActiveMetadata {explorer_field_3:rb_640063003a0063006f007600650072006100670065005f007600690076006f003a004400610074006500540069006d00650049006e00740065007200760061006c005f007600690076006f003a0073007400610072007400}
            }}hasNextPage endCursor}}`,
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
      },
    ];
    await edit();
    await component.refreshAssistance();
    expect(gridApi.fields.calls.mostRecent().args[0].workflowStage).toBe('active');
    expect(component.pickerFields.find(f => f.id === 'metadata.explorer_field_2')!.groupPath).toEqual([
      'Ethical considerations',
    ]);
    expect(component.fieldLabel('oid')).toBe('data-grids-oid');
    expect(component.fields.map(f => f.title)).toEqual([
      'OID',
      'Metadata',
      'Title',
      'Ethics approval status',
      'Start Date',
    ]);
    component.selectedReport!.columns = [];
    for (const path of output.slice(2).map(f => f.path)) component.toggleOutput(path, true);
    component.addSelectedColumns();
    expect(component.selectedReport!.columns.map(c => [c.label, c.property])).toEqual([
      ['Title', 'metadata.explorer_field_1'],
      ['Ethics approval status', 'metadata.explorer_field_2'],
      ['Start Date', 'metadata.explorer_field_3'],
    ]);
  });
  it('keeps the Reports crumb as a link and honours discard and modified clicks', async () => {
    await edit();
    component.selectedReport!.title = 'Unsaved';
    render();
    const crumb = fixture.nativeElement.querySelector('.rb-admin-crumbs a[href$="/admin/reports"]');
    expect(crumb).not.toBeNull();
    confirm.and.returnValue(false);
    const event = new MouseEvent('click', { cancelable: true });
    component.reportsCrumb(event);
    expect(event.defaultPrevented).toBeTrue();
    expect(component.selectedReport).not.toBeNull();
    const modified = new MouseEvent('click', { ctrlKey: true, cancelable: true });
    component.reportsCrumb(modified);
    expect(modified.defaultPrevented).toBeFalse();
    confirm.and.returnValue(true);
    component.reportsCrumb(new MouseEvent('click'));
    expect(component.selectedReport).toBeNull();
  });
  it('suggests filters inside a detached Add panel and commits them only on Done', async () => {
    await edit();
    const before = JSON.stringify(component.selectedReport!.filter);
    expect(query('.report-parameter-actions')).toBeNull();
    component.openFilter();
    component.suggestFilter(component.parameters[1]);
    render();
    expect(query('#report-filter-suggestions')).not.toBeNull();
    expect(component.filterDraft!.type).toBe('date-range');
    expect(component.filterDraft!.database).toEqual({ fromProperty: 'createdAfter', toProperty: 'createdBefore' });
    expect(JSON.stringify(component.selectedReport!.filter)).toBe(before);
    component.doneFilter();
    expect(component.selectedReport!.filter.length).toBe(2);
    component.openFilter(0);
    render();
    expect(query('#report-filter-suggestions')).toBeNull();
  });
  it('inserts Current item and the report web address with the real template syntax', async () => {
    await edit();
    component.editColumn(0);
    component.columnDraft!.multivalue = true;
    render();
    const editor = fixture.debugElement.queryAll(By.directive(ReportTemplateInputComponent))[0];
    editor.nativeElement.querySelector('[data-template-field="recordTableMeta.val"]').click();
    render();
    editor.nativeElement.querySelector('[data-template-field="optTemplateData.brandingAndPortalUrl"]').click();
    render();
    expect(component.columnDraft!.template).toContain('{{recordTableMeta.val}}');
    expect(component.columnDraft!.template).toContain('{{optTemplateData.brandingAndPortalUrl}}');
    editor.nativeElement.querySelector('[data-template-report-url]').click();
    render();
    expect(component.columnDraft!.template).toContain('{{optTemplateData.brandingAndPortalUrl}}/admin/report/report');
    expect(editor.nativeElement.querySelector('[data-template-field="recordTableMeta.col.property"]')).toBeNull();
    expect(component.dirty).toBeFalse();
  });
});

describe('WP7 shared report interactions', () => {
  let c: ReportConfigComponent;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: ChangeDetectorRef, useValue: { markForCheck: () => undefined } }],
    });
    c = TestBed.runInInjectionContext(
      () =>
        new ReportConfigComponent(
          { nativeElement: { getAttribute: () => 'true', querySelectorAll: () => [] } } as any,
          {} as any,
          { warn: () => undefined } as any,
          { t: (k: string, args: any) => (args ? JSON.stringify(args) : k) } as any,
          { validate: async () => ({ valid: true, diagnostics: [] }) } as any
        )
    );
    c.selectedReport = report();
    c.description = description();
  });
  afterEach(() => c?.ngOnDestroy());
  it('keeps panel edits detached until Done and preserves original templates', () => {
    const original = structuredClone(c.selectedReport);
    c.editColumn(0);
    c.columnDraft!.format = 'date';
    c.columnDraft!.label = 'Changed';
    expect(c.selectedReport).toEqual(original);
    c.columnDraft = null;
    expect(c.selectedReport).toEqual(original);
    c.editColumn(0);
    c.columnDraft!.format = 'date';
    c.doneColumn();
    expect(c.selectedReport!.columns[0].format).toBe('date');
    expect(c.selectedReport!.columns[0].template).toBe(original!.columns[0].template);
  });
  it('reuses existing columns in picker order and excludes object containers', () => {
    const column = c.selectedReport!.columns[0];
    c.applyColumns(['oid', column.property]);
    expect(c.selectedReport!.columns[1]).toBe(column);
    expect(c.columnFields.some(f => f.path === 'metadata')).toBeFalse();
    expect(c.selectedReport!.columns[0].label).toBe('data-grids-oid');
  });
  it('announces keyboard reordering and prevents moving outside the table', fakeAsync(() => {
    c.selectedReport!.columns.push({ label: 'OID', property: 'oid' });
    const event = new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, cancelable: true });
    c.reorderColumn(event, 0);
    tick();
    expect(event.defaultPrevented).toBeTrue();
    expect(c.selectedReport!.columns.map(col => col.label)).toEqual(['OID', 'Title']);
    expect(c.columnAnnouncement).toContain('Title');
    c.moveColumn(0, -1);
    expect(c.selectedReport!.columns[0].label).toBe('OID');
    flush();
  }));
  it('debounces automatic preview and cancels obsolete scheduled work on teardown', fakeAsync(() => {
    const preview = spyOn(c, 'previewReport').and.resolveTo();
    c.draftChanged();
    tick(300);
    c.draftChanged();
    tick(599);
    expect(preview).not.toHaveBeenCalled();
    tick(1);
    expect(preview).toHaveBeenCalledTimes(1);
    c.draftChanged();
    c.ngOnDestroy();
    tick(600);
    expect(preview).toHaveBeenCalledTimes(1);
  }));
  it('accepts unchanged legacy query versions and still blocks changed definitions', () => {
    c.selectedReport!.databaseQuery!.queryVersion = 'legacy';
    c.description = {
      ...description(),
      source: 'graphql',
      queryVersion: 'v2:new',
      compatibleQueryVersions: ['v2:new', 'legacy'],
    };
    expect(c.queryVersionChanged).toBeFalse();
    c.description.compatibleQueryVersions = ['v2:new', 'different'];
    expect(c.queryVersionChanged).toBeTrue();
  });
  it('renders only ten preview rows and includes hidden columns only in CSV mode', () => {
    c.previewResult = preview();
    c.previewResult.renderedRows = Array.from({ length: 25 }, () => preview().renderedRows[0]);
    c.selectedReport!.columns.push({ label: 'Hidden', property: 'oid', hide: true });
    expect(c.previewRows.length).toBe(10);
    expect(c.previewColumns.length).toBe(1);
    c.previewMode = 'csv';
    expect(c.previewColumns.length).toBe(2);
  });
  it('separates GraphQL source counts from the database storage adapter', () => {
    c.reports = [report(), report('other')];
    c.namedQueries = [{ name: 'query', source: 'graphql' }];
    expect(c.graphqlReports).toBe(2);
    expect(c.databaseReports).toBe(0);
    c.setSourceFilter('graphql');
    expect(c.filteredReports.length).toBe(2);
  });
  it('explains custom-column checks by heading without exposing developer paths', () => {
    const message = c.checkMessage({
      code: 'UNKNOWN_OUTPUT_COLUMN',
      field: 'columns.0.property',
      reason: 'metadata.<alias>',
      severity: 'warning',
      line: 0,
      column: 0,
    });
    expect(message).toContain('Title');
    expect(message).not.toContain('metadata');
  });
});
