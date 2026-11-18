import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Subject } from 'rxjs';
import { AgGridAngular } from 'ag-grid-angular';
import { AdminTabsDirective, I18NextPipe, TranslationService } from '@researchdatabox/portal-ng-common';
import { ExplorerNamedQueryComponent } from './explorer-named-query.component';
import { DataGridsComponent } from './data-grids.component';
import {
  DATA_GRID_SOURCE,
  DataGridSource,
  GridRawResponse,
  GridRequestError,
  GridSourceUnavailable,
} from './data-grid-source';
import { GridDefinition, GridPage, GridScope } from './data-grid.model';
import { editorSchema, rawDefinition } from './graphql-query';
import { testSdl } from './data-grid.testing';
import { parseSavedQuery } from './record-grid.protocol';
import { scope, validGrid } from './data-grid.testing';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
const page = (oid = 'a', next = false): GridPage => ({
  rows: [{ oid, values: { title: `Record ${oid}` } }],
  pageInfo: { hasNextPage: next, endCursor: next ? `after-${oid}` : null },
});

describe('Data grid editor', () => {
  let fixture: ComponentFixture<DataGridsComponent>;
  let component: DataGridsComponent;
  let source: jasmine.SpyObj<DataGridSource>;
  const translation = {
    t: (key: string) => key,
    waitForInit: async () => translation,
    isInitializing: () => false,
    translationChanges$: new Subject<void>(),
  };

  beforeEach(async () => {
    source = jasmine.createSpyObj<DataGridSource>('source', ['catalogue', 'list', 'query', 'save', 'read', 'remove']);
    source.catalogue.and.resolveTo({ scopes: [structuredClone(scope)], persistence: true });
    source.list.and.resolveTo({ grids: [], next: null });
    source.query.and.resolveTo(page());
    source.save.and.callFake(async grid => ({ ...grid, id: 'saved' }));
    await TestBed.configureTestingModule({
      imports: [
        DataGridsComponent,
        CommonModule,
        FormsModule,
        AgGridAngular,
        I18NextPipe,
        AdminTabsDirective,
        ExplorerNamedQueryComponent,
      ],
      providers: [
        { provide: DATA_GRID_SOURCE, useValue: source },
        { provide: TranslationService, useValue: translation },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DataGridsComponent);
    component = fixture.componentInstance;
    // Run initialization explicitly to keep request-race tests deterministic.
    await component.load();
  });

  afterEach(() => {
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    fixture.destroy();
  });

  it('reuses the loaded grid across JSON views and subsequent queries', async () => {
    spyOn(component, 'ngOnInit');
    component.open(validGrid(), false);
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const grid = fixture.nativeElement.querySelector('ag-grid-angular');
    expect(grid).not.toBeNull();
    [...fixture.nativeElement.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'data-grids-json-view')
      .click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ag-grid-angular')).toBe(grid);
    expect(grid.closest('[hidden]')).not.toBeNull();
    component.open(validGrid(), false);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ag-grid-angular')).toBe(grid);
    await component.preview();
    [...fixture.nativeElement.querySelectorAll('button')]
      .find(b => b.textContent.trim() === 'data-grids-grid-view')
      .click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('ag-grid-angular')).toBe(grid);
    expect(grid.closest('[hidden]')).toBeNull();
  });

  it('renders an asynchronous query completion with OnPush after a real Run action', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    component.open(validGrid(), false);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const response = deferred<GridPage>();
    source.query.and.returnValue(response.promise);
    const run = [...fixture.nativeElement.querySelectorAll('button')].find(
      b => b.textContent.trim() === 'data-grids-run'
    );
    run.click();
    fixture.detectChanges();
    expect(run.disabled).toBeTrue();
    response.resolve({
      rows: [{ oid: 'async', values: { title: 'Async result' } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await fixture.whenStable();
    expect(run.disabled).toBeFalse();
    expect(fixture.nativeElement.querySelector('.explorer-panel-footer [role="status"]').textContent).toContain(
      'data-grids-results-current'
    );
  });

  it('returns focus to Edit columns after the detached panel releases its inert workspace', async () => {
    spyOn(component, 'ngOnInit');
    component.open(validGrid(), false);
    fixture.detectChanges();
    const trigger = component.columnsButton!.nativeElement;
    trigger.focus();
    trigger.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    fixture.nativeElement.querySelector('rb-explorer-columns .offcanvas-header button').click();
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(document.activeElement).toBe(trigger);
    expect(trigger.closest('[inert]')).toBeNull();
  });

  it('discovers fields alongside stage choices and retains the stage fallback if broad discovery fails', async () => {
    const stages = deferred<GridScope[]>();
    source.stages = jasmine.createSpy().and.returnValue(stages.promise);
    source.fields = jasmine.createSpy().and.rejectWith(new GridRequestError('catalogue-limit'));
    component.open(validGrid(), false);
    component.catalogue!.scopes[0].workflowStage = undefined;
    const loading = component.chooseScope(scope.id);
    expect(source.fields).toHaveBeenCalled();
    stages.resolve([{ ...scope, id: 'review', workflowStage: 'review' }]);
    await loading;
    expect(component.error).toBe('catalogue-limit');
    expect(component.catalogue!.scopes.some(scope => scope.workflowStage === 'review')).toBeTrue();
  });

  it('reuses the current scope catalogue on rail navigation while retaining explicit refresh', async () => {
    source.fields = jasmine.createSpy('fields').and.resolveTo([structuredClone(scope)]);
    source.read.and.resolveTo({ ...validGrid(), id: 'saved', revision: 1 });
    await component.reopen({ id: 'saved' });
    expect(source.fields).not.toHaveBeenCalled();
    await component.chooseScope(component.scope!.id);
    expect(source.fields).toHaveBeenCalledTimes(1);
    expect(component.scope!.fields.length).toBeGreaterThan(0);
  });

  it('uses neutral current-results status, choice labels and a wider primary column without changing stored values', async () => {
    component.open({
      ...validGrid(),
      columns: ['title', 'status'],
      filters: [{ fieldId: 'title', expectedScalarType: 'STRING', operator: 'contains', values: ['saved'] }],
    });
    source.query.and.resolveTo({
      rows: [{ oid: 'a', values: { title: 'A long project title', status: 'draft' } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await component.preview();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.explorer-panel-footer [role="status"]').textContent).toContain(
      'data-grids-results-current'
    );
    const status = component.columnDefs.find(c => c.colId === 'status')!;
    expect((status.cellRenderer as Function)({ value: 'draft' }).textContent).toBe('Draft');
    expect<unknown>(component.rows[0].values['status']).toBe('draft');
    expect(component.columnDefs[0].flex).toBeGreaterThan(status.flex!);
    expect(component.conditionLabel({ fieldId: 'status', operator: 'eq', values: ['draft'] })).toContain('Draft');
    fixture.nativeElement.querySelector('.explorer-chip-remove').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.explorer-panel-footer [role="status"]').textContent).toContain(
      'data-grids-results-stale'
    );
  });
  it('groups GraphQL fields and searches short labels, paths and group names', () => {
    component.open(validGrid());
    component.scope!.fields[0].groupPath = ['Project'];
    component.schemaSearch = 'Project';
    expect(component.graphqlFieldGroups[0].label).toBe('Project');
    expect(component.graphqlFieldGroups[0].fields[0].label).toBe('Title');
  });
  it('renders the unavailable state without fabricated records or API calls', async () => {
    source.catalogue.and.rejectWith(new GridSourceUnavailable());
    source.list.calls.reset();
    await component.load();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('data-grids-unavailable-heading');
    expect(fixture.nativeElement.querySelector('.rb-admin-page-actions button').disabled).toBeTrue();
    expect(source.list).not.toHaveBeenCalled();
    expect(source.query).not.toHaveBeenCalled();
  });
  it('distinguishes a failed request from an unavailable integration', async () => {
    source.catalogue.and.rejectWith(new Error('network'));
    await component.load();
    expect(component.unavailable).toBeFalse();
    expect(component.error).toBe('load-failed');
  });
  it('keeps persistence disabled while permitting an unsaved preview when supported', async () => {
    source.catalogue.and.resolveTo({ scopes: [scope], persistence: false });
    source.list.calls.reset();
    await component.load();
    component.open(validGrid());
    component.draft!.name = 'Changed';
    expect(component.canPreview).toBeTrue();
    expect(component.canSave).toBeFalse();
    await component.save();
    expect(source.save).not.toHaveBeenCalled();
    expect(source.list).not.toHaveBeenCalled();
  });
  it('adds, reorders and removes columns; refuses repeating fields', () => {
    component.open(validGrid());
    component.toggleColumn('budget');
    component.moveColumn(1, -1);
    expect(component.draft!.columns).toEqual(['budget', 'title']);
    component.toggleColumn('title');
    component.toggleColumn('people');
    expect(component.draft!.columns).toEqual(['budget']);
  });
  it('resets typed values when a filter field or operation changes', () => {
    component.open(validGrid());
    component.addFilter();
    const filter = component.draft!.filters[0];
    component.chooseFilterField(filter, 'budget');
    component.chooseOperator(filter, 'between');
    expect(filter.values).toEqual(['', '']);
    component.chooseFilterField(filter, 'active');
    expect(filter.operator).toBe('eq');
    expect(filter.values).toEqual(['']);
  });
  it('retains stale saved fields for repair and blocks query and save', async () => {
    const grid = validGrid();
    grid.columns.push('deleted-field');
    component.open(grid);
    expect(component.issues.some(issue => issue.key === 'unavailable-column')).toBeTrue();
    await component.preview();
    await component.save();
    expect(source.query).not.toHaveBeenCalled();
    expect(source.save).not.toHaveBeenCalled();
    component.toggleColumn('deleted-field');
    expect(component.canPreview).toBeTrue();
  });
  it('renders selected columns and typed filter controls', async () => {
    component.open(validGrid());
    component.columnsOpen = true;
    component.addFilter();
    // Avoid starting BaseComponent dependency initialization a second time.
    spyOn(component, 'ngOnInit');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.explorer-chips').textContent).toContain('Title');
    expect(fixture.nativeElement.querySelector('#filter-field-0')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#grid-stage').value).toBe(scope.id);
  });
  it('keeps short child labels consistent and makes paths searchable separately', async () => {
    spyOn(component, 'ngOnInit');
    const fields = component.catalogue!.scopes[0].fields;
    for (const parent of ['owner', 'contact'])
      fields.push({
        id: `metadata:/${parent}/name`,
        path: `/${parent}/name`,
        label: 'Name',
        type: 'text',
        selectable: true,
        operators: [],
        sortable: false,
      });
    const columns = ['metadata:/owner/name', 'metadata:/contact/name'];
    component.open({ ...validGrid(), columns });
    component.columnsOpen = true;
    source.query.and.resolveTo({
      rows: [{ oid: 'a', values: { [columns[0]]: 'A'.repeat(110), [columns[1]]: 'B'.repeat(110) } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    for (const parent of ['owner', 'contact']) {
      const label = 'Name';
      expect(component.fieldLabel(`metadata:/${parent}/name`)).toBe(label);
      expect(fixture.nativeElement.querySelector('#columns-panel').textContent).toContain(label);
      expect(fixture.nativeElement.querySelector('.explorer-chips').textContent).toContain(label);

      expect(component.columnDefs.some(column => column.headerName === label)).toBeTrue();
      expect(fixture.nativeElement.querySelector('ag-grid-angular').textContent).toContain(label);
    }
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('.ag-cell button');
    expect(button.getAttribute('aria-label')).toContain('Name');
    button.click();
    const dialog = document.querySelector<HTMLDialogElement>('dialog.grid-cell-detail')!;
    expect(dialog.querySelector('h2')!.textContent).toBe('Name');
    dialog.close();
    await new Promise(resolve => setTimeout(resolve, 30));
    component.fieldSearch = 'contact';
    expect(component.visibleFields.map(field => field.id)).toEqual([columns[1]]);
  });
  it('keeps absent raw fields distinct from explicit nulls through getters and renderers', async () => {
    spyOn(component, 'ngOnInit');
    component.open(validGrid());
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.document = component.rawDraft.document.replace(
      'oid recordType workflowStep',
      'oid title workflowStep'
    );
    source.raw = jasmine.createSpy().and.resolveTo({
      records: {
        nodes: [{ oid: 'a', title: null, workflowStep: null }, { oid: 'b' }],
        hasNextPage: false,
        endCursor: null,
      },
    });
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const grid: HTMLElement = fixture.nativeElement.querySelector('ag-grid-angular');
    const rows = grid.querySelectorAll('.ag-row');
    expect(rows[0].querySelector('[col-id="title"]')!.textContent).toBe('data-grids-cell-null');
    expect(rows[1].querySelector('[col-id="title"]')!.textContent).toBe('data-grids-cell-missing');
    expect(rows[0].querySelector('[col-id="workflowStep"]')!.textContent).toBe('data-grids-cell-null');
    expect(rows[1].querySelector('[col-id="workflowStep"]')!.textContent).toBe('data-grids-cell-missing');
  });
  it('preserves nullable title-child semantics without breaking ordinary title and OID links', async () => {
    spyOn(component, 'ngOnInit');
    component.catalogue!.scopes[0].fields.push(
      {
        id: 'metadata:/owner/title',
        path: '/owner/title',
        label: 'Owner title',
        type: 'text',
        selectable: true,
        operators: [],
        sortable: false,
      },
      { id: 'record:oid', label: 'OID', type: 'text', selectable: true, operators: [], sortable: false }
    );
    component.open({ ...validGrid(), columns: ['metadata:/owner/title', 'title', 'record:oid'] });
    source.query.and.resolveTo({
      rows: [
        { oid: 'abc/def', values: { 'metadata:/owner/title': null, title: '<img src=x>', 'record:oid': 'abc/def' } },
        { oid: 'missing', values: { title: 'Missing child', 'record:oid': 'missing' } },
        { oid: 'empty', values: { 'metadata:/owner/title': '', title: 'Empty child', 'record:oid': 'empty' } },
      ],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.ag-row');
    for (const [index, marker] of ['null', 'missing', 'empty-text'].entries()) {
      const cell = rows[index].querySelector('[col-id="metadata:/owner/title"]')!;
      expect(cell.textContent).toBe('data-grids-cell-' + marker);
      expect(cell.querySelector('a')).toBeNull();
    }
    const title = rows[0].querySelector('[col-id="title"] a')!;
    expect(title.textContent).toBe('<img src=x>');
    expect(title.querySelector('img')).toBeNull();
    expect(title.getAttribute('href')).toContain('abc%2Fdef');
    expect(rows[0].querySelector('[col-id="record:oid"] a')!.getAttribute('href')).toContain('abc%2Fdef');
    expect(component.recordLink(0, 'oid').textContent).toBe('0');
    expect(component.recordLink(false, 'oid').textContent).toBe('data-grids-cell-false');
  });
  it('keeps a declared object with title in its label inspectable', async () => {
    const id = 'metadata:/person';
    component.catalogue!.scopes[0].fields.push({
      id,
      label: 'Person title details',
      type: 'structured',
      selectable: true,
      operators: [],
      sortable: false,
    });
    component.open({ ...validGrid(), columns: [id] });
    const value = { name: 'One', email: 'one@example.invalid' };
    source.query.and.resolveTo({
      rows: [{ oid: 'one', values: { [id]: value } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await component.preview();
    const render = component.columnDefs[0].cellRenderer as (params: { value: typeof value }) => HTMLElement;
    const cell = render({ value });
    expect(cell.tagName).toBe('BUTTON');
    expect(cell.textContent).toBe('data-grids-cell-view-group');
    expect(cell.getAttribute('aria-label')).toContain('Person title details');
    expect(cell.querySelector('a')).toBeNull();
  });
  it('inspects empty raw objects distinctly from missing and null cells, including nested empties', async () => {
    spyOn(component, 'ngOnInit');
    source.schema = jasmine
      .createSpy()
      .and.resolveTo(testSdl.replace('type Record {', 'scalar JSON\ntype Record { payload: JSON '));
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.document = component.rawDraft.document.replace('oid recordType workflowStep', 'oid payload');
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    source.raw = jasmine.createSpy().and.resolveTo({
      records: {
        nodes: [
          { oid: 'one', payload: {} },
          { oid: 'two' },
          { oid: 'three', payload: null },
          { oid: 'four', payload: { child: {} } },
        ],
        hasNextPage: false,
        endCursor: null,
      },
    });
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const rows: NodeListOf<HTMLElement> = fixture.nativeElement.querySelectorAll('.ag-row');
    expect(rows[1].querySelector('[col-id="payload"]')!.textContent).toBe('data-grids-cell-missing');
    expect(rows[2].querySelector('[col-id="payload"]')!.textContent).toBe('data-grids-cell-null');
    for (const [index, column] of [
      [0, 'payload'],
      [3, 'payload.child'],
    ] as const) {
      rows[index].querySelector<HTMLButtonElement>(`[col-id="${column}"] button`)!.click();
      const dialog = document.querySelector<HTMLDialogElement>('dialog.grid-cell-detail')!;
      expect(dialog.textContent).toContain('data-grids-cell-empty-object');
      dialog.close();
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  });
  it('renders AG Grid rows as text and keeps its headers from sorting a server page', async () => {
    spyOn(component, 'ngOnInit');
    component.open(validGrid());
    const unsafe = '<img src=x onerror=alert(1)>';
    source.query.and.resolveTo({
      rows: [{ oid: 'a', values: { title: unsafe } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const grid: HTMLElement = fixture.nativeElement.querySelector('ag-grid-angular');
    expect(grid.querySelector('.ag-cell')?.textContent).toBe(unsafe);
    expect(grid.querySelector('.ag-cell img')).toBeNull();
    grid.querySelector<HTMLElement>('.ag-header-cell')!.click();
    expect(source.query.calls.count()).toBe(1);
    expect(component.defaultColDef.sortable).toBeFalse();
  });
  it('renders repeated cells in Community Grid and opens paired details from its cell keyboard', async () => {
    spyOn(component, 'ngOnInit');
    const people = component.catalogue!.scopes[0].fields.find(field => field.id === 'people')!;
    people.selectable = true;
    component.open({ ...validGrid(), columns: ['people'] });
    source.query.and.resolveTo({
      rows: [{ oid: 'a', values: { people: [{ name: 'One', email: 'one@example.invalid' }, { name: 'Two' }] } }],
      pageInfo: { hasNextPage: false, endCursor: null },
    });
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const cell: HTMLElement = fixture.nativeElement.querySelector('.ag-cell');
    expect(cell.querySelector('button')).not.toBeNull();
    cell.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    const dialog = document.querySelector<HTMLDialogElement>('dialog.grid-cell-detail')!;
    expect(dialog.open).toBeTrue();
    expect(dialog.querySelector('tbody')!.children.length).toBe(2);
    expect(dialog.textContent).toContain('one@example.invalid');
    expect(dialog.textContent).toContain('data-grids-cell-missing');
    dialog.close();
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(document.querySelector('dialog.grid-cell-detail')).toBeNull();
  });
  it('shows the localized empty result without AG Grid’s default English overlay', async () => {
    spyOn(component, 'ngOnInit');
    component.open(validGrid());
    source.query.and.resolveTo({ rows: [], pageInfo: { hasNextPage: false, endCursor: null } });
    await component.preview();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('data-grids-no-results');
    expect(fixture.nativeElement.textContent).not.toContain('No Rows To Show');
  });
  it('keeps results permanently present and exposes the columns panel with accessible controls', async () => {
    spyOn(component, 'ngOnInit');
    component.open(validGrid());
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#results-heading')).not.toBeNull();
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('[aria-controls="columns-panel"]');
    button.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(fixture.nativeElement.querySelector('#field-search')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[aria-label="data-grids-remove-column: Title"]')).not.toBeNull();
  });
  it('uses opaque cursors for next and previous pages without local sorting', async () => {
    component.open(validGrid());
    source.query.and.returnValues(
      Promise.resolve(page('a', true)),
      Promise.resolve(page('b', true)),
      Promise.resolve(page('a', true))
    );
    await component.preview();
    await component.preview(1);
    expect(source.query.calls.argsFor(1)[0].after).toBe('after-a');
    expect(component.page).toBe(1);
    await component.preview(0);
    expect(source.query.calls.argsFor(2)[0].after).toBeNull();
    expect(component.defaultColDef.sortable).toBeFalse();
    expect(component.defaultColDef.filter).toBeFalse();
  });
  it('discards in-flight results and resets pagination after a filter edit', async () => {
    component.open(validGrid());
    const pending = deferred<GridPage>();
    source.query.and.returnValue(pending.promise);
    const request = component.preview();
    component.addFilter();
    pending.resolve(page('old', true));
    await request;
    expect(component.rows).toEqual([]);
    expect(component.hasPreview).toBeFalse();
    expect(component.page).toBe(0);
    expect(component.hasNext).toBeFalse();
  });
  it('shows current partial diagnostics in both views and distinguishes failed cells from genuine null', async () => {
    component.open(validGrid(), false);
    const failure = {
      code: 'HISTORICAL_VALUE_TYPE',
      path: ['records', 'nodes', 0, 'metadata', 'alias'],
      row: 0,
      oid: 'partial-record',
      fieldId: 'title',
      label: 'Title',
    };
    const result: GridPage = {
      rows: [
        { oid: 'partial-record', values: { title: null }, errors: [failure] },
        { oid: 'null-record', values: { title: null } },
        { oid: 'usable-record', values: { title: 'Usable title' } },
      ],
      errors: [failure],
      response: { data: { records: { nodes: ['controlled fixture'] } }, errors: [failure] },
      pageInfo: { hasNextPage: false, endCursor: null },
    };
    source.query.and.resolveTo(result);
    await component.preview();
    expect(component.hasPreview).toBeTrue();
    expect(component.resultsStale).toBeFalse();
    expect(component.previewError).toBe('');
    const render = component.columnDefs[0].cellRenderer;
    expect(render({ data: result.rows[0], value: null }).textContent).toContain('HISTORICAL_VALUE_TYPE');
    expect(render({ data: result.rows[1], value: null }).textContent).not.toContain('HISTORICAL_VALUE_TYPE');
    expect<unknown>(component.rows[2].values['title']).toBe('Usable title');
    spyOn(component, 'ngOnInit');
    component.responseView = 'json';
    fixture.detectChanges();
    const content = fixture.nativeElement.textContent;
    expect(content).toContain('HISTORICAL_VALUE_TYPE');
    expect(content).toContain('partial-record');
    expect(content).toContain('Title');
    expect(component.jsonResponse).toEqual(result.response!);
    component.changed();
    expect(component.resultsStale).toBeTrue();
    source.query.and.rejectWith(new GridRequestError('preview-failed'));
    await component.preview();
    expect(component.fieldErrors).toEqual([]);
    expect(component.jsonResponse).toBeNull();
    expect(component.hasPreview).toBeFalse();
  });
  it('ignores partial rows and diagnostics from an out-of-order visual response', async () => {
    component.open(validGrid(), false);
    const pending = deferred<GridPage>();
    source.query.and.returnValue(pending.promise);
    const first = component.preview();
    component.changed();
    source.query.and.resolveTo(page('current'));
    await component.preview();
    pending.resolve({ ...page('late'), errors: [{ code: 'FIELD_ERROR', path: [] }] });
    await first;
    expect(component.rows[0].oid).toBe('current');
    expect(component.fieldErrors).toEqual([]);
    expect(component.resultsStale).toBeFalse();
  });
  it('clears stale rows when fetching the next page fails', async () => {
    component.open(validGrid());
    source.query.and.resolveTo(page('a', true));
    await component.preview();
    source.query.and.rejectWith(new Error('failed'));
    await component.preview(1);
    expect(component.page).toBe(0);
    expect(component.rows).toEqual([]);
    expect(component.hasPreview).toBeFalse();
    expect(component.previewError).toBe('preview-failed');
  });
  it('discards late scope discovery and keeps preview blocked while fields load', async () => {
    const pending = deferred<GridScope[]>();
    source.fields = jasmine.createSpy('fields').and.returnValue(pending.promise);
    component.open();
    component.draft!.name = 'Example';
    const loading = component.chooseScope(scope.id);
    expect(component.loadingFields).toBeTrue();
    expect(component.canPreview).toBeFalse();
    spyOn(window, 'confirm').and.returnValue(true);
    component.close();
    pending.resolve([{ ...scope, fields: [], revision: 'late' }]);
    await loading;
    expect(component.draft).toBeNull();
    expect(component.loadingFields).toBeFalse();
    expect(component.catalogue!.scopes[0].revision).not.toBe('late');
  });
  it('keeps only the latest workflow scope discovery response', async () => {
    const first = deferred<GridScope[]>();
    const second = deferred<GridScope[]>();
    const review = { ...structuredClone(scope), id: 'review', workflowStage: 'review' };
    component.catalogue!.scopes.push(review);
    source.fields = jasmine.createSpy('fields').and.returnValues(first.promise, second.promise);
    component.open();
    const a = component.chooseScope(scope.id);
    const b = component.chooseScope(review.id);
    second.resolve([{ ...review, revision: 'current' }]);
    await b;
    first.resolve([{ ...scope, revision: 'stale' }]);
    await a;
    expect(component.scope?.revision).toBe('current');
    expect(component.catalogue!.scopes[0].revision).not.toBe('stale');
    expect(component.loadingFields).toBeFalse();
  });
  it('shows actionable query errors without server details', async () => {
    component.open(validGrid());
    source.query.and.rejectWith(new GridRequestError('cursor-expired'));
    await component.preview();
    expect(component.previewError).toBe('cursor-expired');
    expect(component.rows).toEqual([]);
  });
  it('ignores late catalogue and query responses after destruction', async () => {
    component.open(validGrid());
    const pending = deferred<GridPage>();
    source.query.and.returnValue(pending.promise);
    const request = component.preview();
    component.ngOnDestroy();
    pending.resolve(page());
    await request;
    expect(component.rows).toEqual([]);
  });
  it('keeps concurrent edits dirty after saving the earlier snapshot', async () => {
    component.open(validGrid());
    component.draft!.name = 'Before save';
    const pending = deferred<GridDefinition>();
    source.save.and.returnValue(pending.promise);
    const request = component.save();
    component.draft!.name = 'After save';
    component.changed();
    pending.resolve({ ...validGrid(), id: 'saved', name: 'Before save' });
    await request;
    expect(component.draft!.name).toBe('After save');
    expect(component.dirty).toBeTrue();
    expect(component.notice).toBe('');
  });
  it('preserves edits after a failed save and clears dirty state after success', async () => {
    component.open(validGrid());
    component.draft!.name = 'Changed';
    source.save.and.rejectWith(new Error('failed'));
    await component.save();
    expect(component.draft!.name).toBe('Changed');
    expect(component.dirty).toBeTrue();
    source.save.and.callFake(async grid => ({ ...grid, id: 'saved' }));
    await component.save();
    expect(component.dirty).toBeFalse();
    expect(component.notice).toBe('saved');
  });
  it('reopens stage-specific saved grids with fresh discovery and results after a hard reload', async () => {
    const saved = { ...validGrid(), id: '123456789012345678901234', revision: 3 };
    source.read!.and.resolveTo(saved);
    source.fields = jasmine.createSpy('fields').and.resolveTo([structuredClone(scope)]);
    source.catalogue.and.resolveTo({ scopes: [{ ...scope, workflowStage: undefined, fields: [] }], persistence: true });
    component.draft = null;
    window.history.replaceState(null, '', '#grid=' + saved.id);
    await component.load();
    expect(source.read).toHaveBeenCalledWith(saved.id);
    expect(source.fields).toHaveBeenCalled();
    expect(component.activeDefinition).toEqual(saved);
    expect(component.dirty).toBeFalse();
    expect(component.rows).toEqual(page().rows);
    expect(component.editorOpen).toBeTrue();
  });
  it('keeps stale saved fields repairable and does not query them on reopen', async () => {
    const saved = { ...validGrid(), id: '123456789012345678901234', revision: 1, columns: ['removed'] };
    source.read!.and.resolveTo(saved);
    await component.reopen(saved, true);
    expect(component.draft?.columns).toEqual(['removed']);
    expect(component.issues.length).toBeGreaterThan(0);
    expect(component.dirty).toBeFalse();
    expect(source.query).not.toHaveBeenCalled();
  });
  it('retains edits on revision conflict and uses the committed revision after an in-flight edit', async () => {
    component.open(validGrid());
    component.draft!.name = 'Changed';
    source.save.and.rejectWith(new GridRequestError('revision-conflict'));
    await component.save();
    expect(component.error).toBe('revision-conflict');
    expect(component.dirty).toBeTrue();
    const pending = deferred<GridDefinition>();
    source.save.and.returnValue(pending.promise);
    const saving = component.save();
    component.draft!.name = 'Later edit';
    pending.resolve({ ...validGrid(), id: '123456789012345678901234', revision: 2, name: 'Changed' });
    await saving;
    expect(component.draft!.revision).toBe(2);
    expect(component.dirty).toBeTrue();
  });
  it('preserves catalogue entries on delete failure and removes them after success', async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    const saved = { ...validGrid(), id: '123456789012345678901234', revision: 1 };
    component.saved = [saved];
    source.remove!.and.rejectWith(new GridRequestError('revision-conflict'));
    await component.remove(saved);
    expect(component.saved).toEqual([saved]);
    expect(component.error).toBe('revision-conflict');
    source.remove!.and.resolveTo();
    await component.remove(saved);
    expect(component.saved).toEqual([]);
  });
  it('preserves stage choices when all-stage fields exceed their bound, then permits narrowing', async () => {
    const all = { ...structuredClone(scope), id: 'all', workflowStage: undefined, fields: [] };
    component.catalogue = { scopes: [all], persistence: true };
    source.stages = jasmine.createSpy('stages').and.resolveTo([structuredClone(scope)]);
    source.fields = jasmine.createSpy('fields').and.rejectWith(new GridRequestError('catalogue-limit'));
    component.open();
    await component.chooseScope(all.id);
    expect(component.error).toBe('catalogue-limit');
    expect(component.catalogue.scopes.some(item => item.workflowStage === 'draft')).toBeTrue();
    const narrowed = component.catalogue.scopes.find(item => item.workflowStage === 'draft')!;
    source.fields = jasmine.createSpy('fields').and.resolveTo([structuredClone(scope)]);
    await component.chooseScope(narrowed.id);
    expect(component.error).toBe('');
    expect(component.scope?.fields.length).toBeGreaterThan(0);
    expect(component.draft?.columns.length).toBeGreaterThan(0);
  });
  it('requires explicit filter-type repair on reopen and clears the previous operands', async () => {
    const saved = { ...validGrid(), id: '123456789012345678901234', revision: 1 };
    saved.filters = [{ fieldId: 'title', expectedScalarType: 'NUMBER', operator: 'eq', values: ['1.0'] }];
    source.read.and.resolveTo(saved);
    await component.reopen(saved, true);
    expect(component.dirty).toBeFalse();
    expect(source.query).not.toHaveBeenCalled();
    expect(component.canPreview).toBeFalse();
    const filter = component.draft!.filters[0];
    expect(component.filterTypeChanged(filter)).toBeTrue();
    component.chooseFilterField(filter, filter.fieldId);
    expect(filter.expectedScalarType).toBe('STRING');
    expect(filter.values).toEqual(['']);
    expect(component.filterTypeChanged(filter)).toBeFalse();
    expect(component.dirty).toBeTrue();
  });
  it('keeps earlier catalogue pages available if loading more fails and can retry', async () => {
    const first = { ...validGrid(), id: '123456789012345678901234', revision: 1 };
    const last = { ...first, id: '223456789012345678901234' };
    component.saved = [first];
    component.nextSaved = first.id;
    source.list.and.rejectWith(new GridRequestError('persistence-failed'));
    await component.loadMore();
    expect(component.saved).toEqual([first]);
    expect(component.nextSaved).toBe(first.id);
    source.list.and.resolveTo({ grids: [last], next: null });
    await component.loadMore();
    expect(component.saved).toEqual([first, last]);
    expect(component.nextSaved).toBeNull();
  });
  it('blocks changed sort semantics on reopen until the current type is explicitly accepted', async () => {
    const saved = {
      ...validGrid(),
      id: '123456789012345678901234',
      revision: 1,
      sort: { fieldId: 'title', direction: 'asc' as const, expectedScalarType: 'NUMBER' as const },
    };
    source.read.and.resolveTo(saved);
    await component.reopen(saved, true);
    expect(component.sortTypeChanged).toBeTrue();
    expect(component.dirty).toBeFalse();
    expect(component.canPreview).toBeFalse();
    expect(source.query).not.toHaveBeenCalled();
    component.chooseSort('title');
    expect(component.draft?.sort?.expectedScalarType).toBe('STRING');
    expect(component.sortTypeChanged).toBeFalse();
    expect(component.dirty).toBeTrue();
    expect(component.canPreview).toBeTrue();
  });
  it('keeps executed rows visibly stale after edits and never treats saving as running', async () => {
    component.open(validGrid());
    await component.preview();
    component.toggleColumn('budget');
    expect(component.rows.length).toBe(1);
    expect(component.resultsStale).toBeTrue();
    component.draft!.name = 'Saved change';
    await component.save();
    expect(source.query.calls.count()).toBe(1);
    expect(component.resultsStale).toBeTrue();
    expect(component.lastExecuted?.mode).not.toBe('graphql');
    await component.preview();
    expect(component.resultsStale).toBeFalse();
  });
  it('keeps one saved identity and dirty state when viewing generated GraphQL; publication refresh is read-only', async () => {
    component.open({ ...validGrid(), id: '123456789012345678901234', revision: 4 }, false);
    const raw = rawDefinition();
    raw.variables['type'] = 'plan';
    source.generate = jasmine.createSpy().and.resolveTo({ query: raw.document, variables: raw.variables });
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    expect(component.dirty).toBeFalse();
    expect(component.activeDefinition?.mode).not.toBe('graphql');
    component.draft!.publishedAs = [{ name: 'linked', publishedRevision: 3, changedSincePublished: true }];
    expect(component.dirty).toBeFalse();
    component.unlink();
    expect(component.activeDefinition?.id).toBe('123456789012345678901234');
    expect(component.dirty).toBeTrue();
    await component.switchMode('visual');
    expect(component.activeDefinition?.mode).toBe('graphql');
  });
  it('revalidates edited source, variables and refreshed schemas without repeating unchanged validation', async () => {
    component.open(validGrid());
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    const first = component.rawErrors;
    expect(component.rawErrors).toBe(first);
    component.variablesText = '[]';
    const invalidVariables = component.rawErrors;
    expect(invalidVariables.length).toBeGreaterThan(0);
    expect(invalidVariables).not.toBe(first);
    component.variablesText = '{}';
    component.rawDraft.document = '{ records(recordType:"plan") { nodes { oid } } }';
    const valid = component.rawErrors;
    expect(valid).toEqual([]);
    component.rawDraft.document = '{ invented }';
    expect(component.rawErrors.length).toBeGreaterThan(0);
    component.rawDraft.document = '{ records(recordType:"plan") { nodes { oid } } }';
    await component.loadSchema();
    expect(component.rawErrors).toEqual([]);
    expect(component.rawErrors).not.toBe(valid);
  });
  it('reloads the scoped schema when an unlinked query selects another record type', async () => {
    component.open(validGrid());
    const schemaSpy = jasmine
      .createSpy()
      .and.callFake((requested?: GridScope) =>
        Promise.resolve(
          requested?.recordType === 'organisation'
            ? testSdl.replace('workflowStep: String,', 'payload: String,')
            : testSdl
        )
      );
    source.schema = schemaSpy;
    const editor = component as unknown as { refreshRawSchema(): Promise<boolean> };
    await component.switchMode('graphql');
    component.rawDraft.document = '{ records(recordType:"plan") { nodes { oid } } }';
    component.unlink();
    await editor.refreshRawSchema();
    expect((schemaSpy.calls.mostRecent().args[0] as GridScope | undefined)?.recordType).toBe('plan');
    component.rawDraft.document = '{ records(recordType:"organisation") { nodes { oid payload } } }';
    component.rawChanged();
    await editor.refreshRawSchema();
    const scopeArg = schemaSpy.calls.mostRecent().args[0] as GridScope | undefined;
    expect(scopeArg?.recordType).toBe('organisation');
    expect(scopeArg?.workflowStage).toBeUndefined();
    expect(component.rawErrors).toEqual([]);
    expect(component.schemaError).toBe('');
  });
  describe('raw workflow-stage schema discovery', () => {
    const stageSdl = testSdl.replace('recordType: String!,', 'recordType: String!, workflowStages: [String!],');
    const draftCollection = 'records(recordType: "dataPublication", workflowStages: ["draft"]) { nodes { oid } }';
    const draftQuery = `{ ${draftCollection} }`;
    const variableQuery =
      'query($stages: [String!]) { records(recordType: "dataPublication", workflowStages: $stages) { nodes { oid } } }';

    for (const { name, document, variables, workflowStage } of [
      { name: 'one literal stage', document: draftQuery, variables: {}, workflowStage: 'draft' },
      {
        name: 'one stage from variables',
        document: variableQuery,
        variables: { stages: ['draft'] },
        workflowStage: 'draft',
      },
      { name: 'multiple stages', document: draftQuery.replace('["draft"]', '["draft", "review"]'), variables: {} },
      { name: 'a missing stage variable', document: variableQuery, variables: {} },
      {
        name: 'a second collection without a stage restriction',
        document: `{ draft: ${draftCollection} all: records(recordType: "dataPublication") { nodes { oid } } }`,
        variables: {},
      },
      {
        name: 'collections restricted to different stages',
        document: `{ draft: ${draftCollection} review: ${draftCollection.replace('"draft"', '"review"')} }`,
        variables: {},
      },
    ]) {
      it(`loads the expected scope for a raw query with ${name}`, async () => {
        const schema = jasmine.createSpy().and.resolveTo(stageSdl);
        source.schema = schema;
        const id = '000000000000000000000001';
        source.read.and.resolveTo({ ...rawDefinition(), id, document, variables });

        await component.reopen({ id });

        expect(schema).toHaveBeenCalledTimes(1);
        const requested = schema.calls.mostRecent().args[0] as GridScope | undefined;
        expect(requested?.recordType).toBe('dataPublication');
        expect(requested?.workflowStage).toBe(workflowStage);
        expect(component.rawErrors).toEqual([]);
      });
    }

    it('refreshes the scoped schema when the raw editor changes the stage restriction', async () => {
      const reviewSdl = stageSdl.replace('workflowStep: String,', 'payload: String,');
      const schema = jasmine
        .createSpy()
        .and.callFake(async (requested?: GridScope) => (requested?.workflowStage === 'review' ? reviewSdl : stageSdl));
      source.schema = schema;
      const id = '000000000000000000000001';
      source.read.and.resolveTo({ ...rawDefinition(), id, document: draftQuery, variables: {} });
      await component.reopen({ id });
      expect(schema).toHaveBeenCalledOnceWith(jasmine.objectContaining({ workflowStage: 'draft' }));

      component.rawDraft.document = draftQuery
        .replace('"draft"', '"review"')
        .replace('nodes { oid }', 'nodes { oid payload }');
      component.rawChanged();
      expect(schema).toHaveBeenCalledWith(
        jasmine.objectContaining({ recordType: 'dataPublication', workflowStage: 'review' })
      );
      const editor = component as unknown as { refreshRawSchema(): Promise<boolean> };
      expect(await editor.refreshRawSchema()).toBeTrue();
      expect(schema).toHaveBeenCalledTimes(2);
      expect(component.schemaSdl).toBe(reviewSdl);
      expect(component.rawErrors).toEqual([]);
    });
  });
  it('blocks raw preview and save when scoped schema discovery fails, then allows both after retry', async () => {
    component.open(validGrid(), false);
    const schema = jasmine.createSpy().and.resolveTo(testSdl);
    source.schema = schema;
    const rawResponse = jasmine.createSpy().and.resolveTo({ data: { records: { nodes: [{ oid: 'one' }] } } });
    source.rawResponse = rawResponse;
    await component.switchMode('graphql');
    component.rawDraft.document = '{ records(recordType:"plan") { nodes { oid } } }';
    component.unlink();
    await component.loadSchema();

    const previousSchema = component.schema;
    const pending = deferred<string>();
    schema.calls.reset();
    schema.and.returnValue(pending.promise);
    component.rawDraft.document = '{ records(recordType:"organisation") { nodes { oid } } }';
    component.rawChanged();
    const previewing = component.preview();
    const saving = component.save();
    expect(schema).toHaveBeenCalledOnceWith(jasmine.objectContaining({ recordType: 'organisation' }));
    expect(component.schema).toBe(previousSchema);
    expect(component.rawErrors).toEqual([]);
    expect(rawResponse).not.toHaveBeenCalled();
    expect(source.save).not.toHaveBeenCalled();

    pending.reject(new Error('Schema discovery failed'));
    await Promise.all([previewing, saving]);
    expect(component.schema).toBe(previousSchema);
    expect(component.schemaSdl).toBe(testSdl);
    expect(component.schemaError).toBe('schema-unavailable');
    expect(component.previewError).toBe('schema-unavailable');
    expect(component.error).toBe('schema-unavailable');
    expect(rawResponse).not.toHaveBeenCalled();
    expect(source.save).not.toHaveBeenCalled();

    schema.and.resolveTo(testSdl);
    await component.loadSchema();
    expect(component.schema).not.toBe(previousSchema);
    expect(component.schemaError).toBe('');
    await component.preview();
    await component.save();
    expect(rawResponse).toHaveBeenCalledTimes(1);
    expect(source.save).toHaveBeenCalledTimes(1);
    expect(component.previewError).toBe('');
    expect(component.error).toBe('');
  });
  it('reuses the loaded global schema when an unlinked edit stops identifying a single record type', async () => {
    component.open(validGrid(), false);
    const globalSdl = testSdl.replace('type Query {', 'type Query { record(oid: ID!): Record,');
    const pending = deferred<string>();
    const schema = jasmine.createSpy().and.callFake((requested?: GridScope) => {
      if (!requested) return Promise.resolve(globalSdl);
      return requested.workflowStage ? Promise.resolve(testSdl) : pending.promise;
    });
    source.schema = schema;
    const editor = component as unknown as { refreshRawSchema(): Promise<boolean> };
    await component.switchMode('graphql');
    component.rawDraft.document = '{ record(oid:"one") { oid } }';
    component.unlink();
    expect(await editor.refreshRawSchema()).toBeTrue();
    expect(schema).toHaveBeenCalledTimes(2);
    expect(schema.calls.mostRecent().args[0]).toBeUndefined();

    component.rawDraft.document = '{ records(recordType:"plan") { nodes { oid } } }';
    component.rawChanged();
    const scopedRefresh = editor.refreshRawSchema();
    component.rawDraft.document = '{ record(oid:"two") { oid } }';
    component.rawChanged();
    expect(await editor.refreshRawSchema()).toBeTrue();
    expect(schema).toHaveBeenCalledTimes(3);

    pending.resolve(testSdl);
    await scopedRefresh;
    expect(component.schemaSdl).toBe(globalSdl);
    expect(component.rawErrors).toEqual([]);
    expect(schema).toHaveBeenCalledTimes(3);
  });
  it('loads the schema while visual generation is still pending', async () => {
    component.open(validGrid());
    let finish!: (value: { query: string; variables: Record<string, never> }) => void;
    source.generate = jasmine.createSpy().and.returnValue(new Promise(resolve => (finish = resolve)));
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    const switching = component.switchMode('graphql');
    expect(source.schema).toHaveBeenCalled();
    finish({ query: '{ records(recordType:"plan") { nodes { oid } } }', variables: {} });
    await switching;
    expect(component.rawErrors).toEqual([]);
  });
  it('keeps GraphQL canonical and Visual read-only after unlink across view switches', async () => {
    component.open(validGrid());
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.document = '{ records(recordType:"plan") { nodes { oid } } }';
    component.rawChanged();
    await component.switchMode('visual');
    expect(component.draft!.columns).toEqual(['title']);
    await component.switchMode('graphql');
    component.unlink();
    expect(component.rawDraft.document).toContain('recordType:"plan"');
  });
  for (const generated of [false, true])
    it(
      'retains raw partial rows, safe JSON and failed cells with ' +
        (generated ? 'generated field labels' : 'arbitrary response aliases'),
      async () => {
        component.open(validGrid(), false);
        source.schema = jasmine.createSpy().and.resolveTo(testSdl);
        await component.switchMode('graphql');
        component.unlink();
        const alias = generated ? 'g_hash' : 'custom';
        component.rawDraft.document = component.rawDraft.document.replace(
          'oid recordType workflowStep',
          `oid ${alias}: workflowStep`
        );
        component.rawDraft.variables['type'] = 'plan';
        component.variablesText = JSON.stringify(component.rawDraft.variables);
        if (generated)
          component.scope!.fields[0].selections = [
            { variant: '', selection: 'g_hash: workflowStep', responsePath: ['g_hash'] },
          ];
        const data = {
          records: {
            nodes: [
              { oid: 'broken', [alias]: null },
              { oid: 'empty', [alias]: null },
              { oid: 'usable', [alias]: 'Draft' },
            ],
            hasNextPage: false,
            endCursor: null,
          },
        };
        source.raw = jasmine.createSpy().and.rejectWith(new Error('legacy method must not be called'));
        source.rawResponse = jasmine
          .createSpy()
          .and.resolveTo({ data, errors: [{ code: 'HISTORICAL_VALUE_TYPE', path: ['records', 'nodes', 0, alias] }] });
        await component.preview();
        expect(component.previewError).toBe('');
        expect(component.rows.length).toBe(3);
        expect<unknown>(component.rows[2].values[alias]).toBe('Draft');
        expect(component.fieldErrors[0].oid).toBe('broken');
        expect(component.fieldErrors[0].label).toBe(generated ? 'Title' : undefined);
        const render = component.columnDefs.find(column => column.colId === alias)!.cellRenderer;
        expect(render({ data: component.rows[0], value: null }).textContent).toContain('HISTORICAL_VALUE_TYPE');
        expect(render({ data: component.rows[1], value: null }).textContent).not.toContain('HISTORICAL_VALUE_TYPE');
        expect(component.jsonResponse).toEqual({ data, errors: component.fieldErrors });
        spyOn(component, 'ngOnInit');
        component.responseView = 'json';
        fixture.detectChanges();
        expect(fixture.nativeElement.textContent).toContain(generated ? 'Title' : 'records.nodes.0.custom');
        expect(fixture.nativeElement.textContent).toContain('broken');
        component.rawDraft.document += '\n# edited';
        component.rawChanged();
        expect(component.resultsStale).toBeTrue();
        source.rawResponse = jasmine.createSpy().and.rejectWith(new GridRequestError('query-unavailable'));
        await component.preview();
        expect(component.hasPreview).toBeFalse();
        expect(component.fieldErrors).toEqual([]);
        expect(component.jsonResponse).toBeNull();
      }
    );
  it('maps nested generated list errors and nullable parents while retaining unmapped JSON', async () => {
    component.open(validGrid(), false);
    source.schema = jasmine
      .createSpy()
      .and.resolveTo(
        testSdl.replace('type Record {', 'type Metadata { g_hash: [String] } type Record { metadata: Metadata,')
      );
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.document = component.rawDraft.document.replace(
      'oid recordType workflowStep',
      'oid metadata { g_hash }'
    );
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    component.scope!.fields[0].selections = [
      { variant: '', selection: 'metadata { g_hash }', responsePath: ['metadata', 'g_hash'] },
    ];
    const data = {
      records: {
        nodes: [
          { oid: 'nested', metadata: { g_hash: ['usable', null] } },
          { oid: 'parent', metadata: null },
          { oid: 'empty', metadata: { g_hash: null } },
        ],
        hasNextPage: false,
        endCursor: null,
      },
    };
    source.rawResponse = jasmine.createSpy().and.resolveTo({
      data,
      errors: [
        { code: 'HISTORICAL_VALUE_TYPE', path: ['records', 'nodes', 0, 'metadata', 'g_hash', 1] },
        { code: 'FIELD_ERROR', path: ['records', 'nodes', 1, 'metadata'] },
      ],
    });
    await component.preview();
    expect(component.fieldErrors.map(error => error.label)).toEqual(['Title', 'Title']);
    expect(component.fieldErrors.map(error => error.oid)).toEqual(['nested', 'parent']);
    const render = component.columnDefs.find(column => column.colId === 'metadata.g_hash')!.cellRenderer;
    expect(render({ data: component.rows[0], value: ['usable', null] }).textContent).toContain('HISTORICAL_VALUE_TYPE');
    expect(render({ data: component.rows[1], value: null }).textContent).toContain('FIELD_ERROR');
    expect(render({ data: component.rows[2], value: null }).textContent).not.toContain('FIELD_ERROR');
    component.selectResultPath('missing');
    expect(component.responseView).toBe('json');
    expect(component.hasPreview).toBeTrue();
    expect(component.fieldErrors.length).toBe(2);
    expect(component.jsonResponse!['data']).toEqual(data);
  });
  it('discards an out-of-order raw partial response and its diagnostics', async () => {
    component.open(validGrid(), false);
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    const pending = deferred<GridRawResponse>();
    source.rawResponse = jasmine.createSpy().and.returnValue(pending.promise);
    const running = component.preview();
    component.rawDraft.document += '\n# edited';
    component.rawChanged();
    pending.resolve({
      data: { records: { nodes: [{ oid: 'old' }] } },
      errors: [{ code: 'HISTORICAL_VALUE_TYPE', path: ['records', 'nodes', 0, 'workflowStep'] }],
    });
    await running;
    expect(component.fieldErrors).toEqual([]);
    expect(component.hasPreview).toBeFalse();
  });
  it('reopens raw queries into results with real variables, mapping and cursor navigation', async () => {
    const saved = { ...rawDefinition('Raw plans'), id: '123456789012345678901234', revision: 1 };
    saved.variables['type'] = 'plan';
    source.read.and.resolveTo(saved);
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    const raw = jasmine
      .createSpy()
      .and.resolveTo({ records: { nodes: [{ oid: 'a' }], hasNextPage: true, endCursor: 'cursor-a' } });
    source.raw = raw;
    await component.reopen(saved, true);
    expect(component.editorOpen).toBeTrue();
    expect(component.mode).toBe('graphql');
    expect(component.dirty).toBeFalse();
    expect<unknown>(component.rows[0].values['oid']).toBe('a');
    raw.and.resolveTo({ records: { nodes: [{ oid: 'b' }], hasNextPage: false, endCursor: null } });
    await component.preview(1);
    expect(raw.calls.mostRecent().args[1].after).toBe('cursor-a');
    component.variablesText = '{';
    component.rawChanged();
    expect(component.canPreview).toBeFalse();
    expect(component.resultsStale).toBeTrue();
  });
  it('falls back to complete JSON when arbitrary metadata names would collide in grid paths', async () => {
    spyOn(component, 'ngOnInit');
    source.schema = jasmine
      .createSpy()
      .and.resolveTo(testSdl.replace('type Record {', 'scalar JSON\ntype Record { payload: JSON '));
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.document = component.rawDraft.document.replace('oid recordType workflowStep', 'oid payload');
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    for (const nodes of [
      [{ oid: 'one', payload: { 'a.b': 1, a: { b: 2 }, groups: [[{ 'name.email': 'kept' }]] } }],
      [
        { oid: 'one', payload: { a: { b: 2 } } },
        { oid: 'two', payload: { 'a.b': 1 } },
      ],
    ]) {
      const data = { records: { nodes, hasNextPage: false, endCursor: null } };
      source.raw = jasmine.createSpy().and.resolveTo(data);
      component.responseView = 'grid';
      await component.preview();
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(component.rows).toEqual([]);
      expect(component.columnDefs).toEqual([]);
      expect(component.responseView).toBe('json');
      expect(component.previewError).toBe('result-path-invalid');
      expect(JSON.stringify(component.jsonResponse)).toBe(JSON.stringify(data));
      const json: HTMLElement = fixture.nativeElement.querySelector('.explorer-results pre');
      expect(json.textContent).toContain('"a.b": 1');
      expect(json.textContent).toContain('"b": 2');
    }
  });
  it('discards stale raw responses, preserves save failures and uses JSON for unmapped shapes', async () => {
    source.raw = jasmine.createSpy();
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    const pending = deferred<Record<string, unknown>>();
    source.raw = jasmine.createSpy().and.returnValue(pending.promise);
    const running = component.preview();
    component.rawDraft.document += '\n# changed';
    component.rawChanged();
    pending.resolve({ records: { nodes: [{ oid: 'late' }], hasNextPage: false, endCursor: null } });
    await running;
    expect(component.hasPreview).toBeFalse();
    component.rawDraft.resultPath = ['missing'];
    source.raw = jasmine.createSpy().and.resolveTo({ records: { nodes: [], hasNextPage: false, endCursor: null } });
    await component.preview();
    expect(component.responseView).toBe('json');
    expect(component.jsonResponse).not.toBeNull();
    source.save.and.rejectWith(new GridRequestError('revision-conflict'));
    component.rawDraft.name = 'Raw';
    await component.save();
    expect(component.error).toBe('revision-conflict');
    expect(component.rawDraft.name).toBe('Raw');
  });
  it('builds safe record links from the actual OID in the current portal', () => {
    const link = component.recordLink('<script>', 'abc/def');
    expect(link.textContent).toBe('<script>');
    expect(link.querySelector('script')).toBeNull();
    expect(link.getAttribute('href')).toContain('abc%2Fdef');
  });
  it('generates a mirror then saves explicitly unlinked GraphQL without running it', async () => {
    component.open(validGrid());
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    const raw = rawDefinition();
    raw.variables['type'] = 'plan';
    source.generate = jasmine.createSpy().and.resolveTo({ query: raw.document, variables: raw.variables });
    await component.switchMode('graphql');
    component.unlink();
    expect(component.mode).toBe('graphql');
    expect(component.draft!.columns).toEqual(['title']);
    expect(component.rawDraft.id).toBeUndefined();
    component.rawDraft.name = 'Generated plans';
    await component.save();
    expect(source.save.calls.mostRecent().args[0].mode).toBe('graphql');
    expect(source.query).not.toHaveBeenCalled();
    expect(component.dirty).toBeFalse();
    component.rawDraft.document += '\n# edit';
    component.rawChanged();
    spyOn(window, 'confirm').and.returnValue(false);
    await component.switchMode('graphql');
    component.unlink();
    expect(component.rawDraft.document).toContain('# edit');
  });
  it('opens a native naming dialog and renames without executing the query', async () => {
    spyOn(component, 'ngOnInit');
    component.open({ ...validGrid(), id: '123456789012345678901234', revision: 1 });
    fixture.detectChanges();
    component.beginSave();
    await fixture.whenStable();
    const dialog: HTMLDialogElement = fixture.nativeElement.querySelector('dialog');
    expect(dialog.open).toBeTrue();
    component.saveName = 'Renamed query';
    await component.confirmSave();
    expect(source.save.calls.mostRecent().args[0].name).toBe('Renamed query');
    expect(source.query).not.toHaveBeenCalled();
    expect(dialog.open).toBeFalse();
  });
  it('retains the executed visual page and stale status after an edit is undone', async () => {
    component.open(validGrid());
    source.query.and.returnValues(
      Promise.resolve(page('a', true)),
      Promise.resolve(page('b', true)),
      Promise.resolve(page('fresh', true))
    );
    await component.preview();
    await component.preview(1);
    component.toggleColumn('budget');
    component.toggleColumn('budget');
    expect(component.page).toBe(1);
    expect(component.rows[0].oid).toBe('b');
    expect(component.resultsStale).toBeTrue();
    await component.preview(2);
    expect(source.query.calls.count()).toBe(2);
    await component.preview();
    expect(component.page).toBe(0);
    expect(component.rows[0].oid).toBe('fresh');
    expect(component.resultsStale).toBeFalse();
    expect(source.query.calls.mostRecent().args[0].after).toBeNull();
  });
  it('retains the executed raw page after variable reformatting and mapping edits until rerun', async () => {
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    const raw = jasmine
      .createSpy()
      .and.returnValues(
        Promise.resolve({ records: { nodes: [{ oid: 'a' }], hasNextPage: true, endCursor: 'next-a' } }),
        Promise.resolve({ records: { nodes: [{ oid: 'b' }], hasNextPage: true, endCursor: 'next-b' } }),
        Promise.resolve({ records: { nodes: [{ oid: 'fresh' }], hasNextPage: false, endCursor: null } })
      );
    source.raw = raw;
    await component.preview();
    await component.preview(1);
    component.variablesText = JSON.stringify(component.rawDraft.variables, null, 4);
    component.rawChanged();
    expect(component.page).toBe(1);
    expect<unknown>(component.rows[0].values['oid']).toBe('b');
    expect(component.resultsStale).toBeTrue();
    component.selectResultPath('records.nodes');
    expect(component.resultsStale).toBeTrue();
    expect(component.page).toBe(1);
    await component.preview(2);
    expect(raw.calls.count()).toBe(2);
    await component.preview();
    expect(component.page).toBe(0);
    expect(component.resultsStale).toBeFalse();
  });
  it('does not render record links for misleading raw OID aliases', async () => {
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    await component.switchMode('graphql');
    component.unlink();
    component.rawDraft.document = component.rawDraft.document.replace(
      'oid recordType workflowStep',
      'oid: recordType title: oid'
    );
    component.rawDraft.variables['type'] = 'plan';
    component.variablesText = JSON.stringify(component.rawDraft.variables);
    source.raw = jasmine.createSpy().and.resolveTo({
      records: { nodes: [{ oid: 'plan', title: 'actual-oid' }], hasNextPage: false, endCursor: null },
    });
    await component.preview();
    expect(component.rows[0].recordOid).toBeUndefined();
    for (const column of component.columnDefs) {
      const render = column.cellRenderer as (params: { value: string }) => HTMLElement;
      expect(render({ value: 'value' }).tagName).toBe('SPAN');
    }
  });
  for (const mode of ['visual', 'graphql'] as const)
    it('preserves ' + mode + ' identity when Save as fails, then updates the original revision', async () => {
      const id = '123456789012345678901234';
      const saved =
        mode === 'visual' ? { ...validGrid(), id, revision: 4 } : { ...rawDefinition('Original'), id, revision: 4 };
      if (saved.mode === 'graphql') saved.variables['type'] = 'plan';
      source.read.and.resolveTo(saved);
      source.schema = jasmine.createSpy().and.resolveTo(testSdl);
      await component.reopen(saved);
      const oldUrl = window.location.hash;
      source.save.and.rejectWith(new GridRequestError('persistence-failed'));
      component.beginSave(true);
      component.saveName = 'Copy';
      await component.confirmSave();
      expect(source.save.calls.mostRecent().args[0].id).toBeUndefined();
      expect(component.activeDefinition?.id).toBe(id);
      expect(component.activeDefinition?.revision).toBe(4);
      expect(component.activeDefinition?.name).toBe(saved.name);
      expect(window.location.hash).toBe(oldUrl);
      component.saveOpen = false;
      component.beginSave();
      component.saveName = 'Updated original';
      source.save.and.callFake(async query => ({ ...query, id, revision: 5 }));
      await component.confirmSave();
      expect(source.save.calls.mostRecent().args[0].id).toBe(id);
      expect(source.save.calls.mostRecent().args[0].revision).toBe(4);
      expect(component.activeDefinition?.revision).toBe(5);
      expect(component.activeDefinition?.name).toBe('Updated original');
    });
  it('loads the catalogue with the deepest variables the server accepts', async () => {
    let nested: import('./data-grid.model').JsonValue = 'leaf';
    for (let i = 0; i < 30; i++) nested = { nested };
    const saved = parseSavedQuery({
      ...rawDefinition('Boundary query'),
      id: '123456789012345678901234',
      revision: 1,
      variables: { extra: nested },
    });
    source.list.and.resolveTo({ grids: [saved], next: null });
    await component.load();
    expect(component.catalogue).not.toBeNull();
    expect(component.error).toBe('');
    expect(component.saved).toEqual([saved]);
  });
  it('opens an independent GraphQL draft from the named-query creation deep link', async () => {
    window.history.replaceState(null, '', '#new=graphql');
    source.schema = jasmine.createSpy().and.resolveTo(testSdl);
    component.draft = null;
    await component.load();
    expect(component.activeDefinition?.mode).toBe('graphql');
    expect(component.unlinked).toBeTrue();
    expect(component.activeDefinition?.id).toBeUndefined();
    expect(source.read).not.toHaveBeenCalled();
  });
  it('guards navigation away from unsaved edits', () => {
    component.open(validGrid());
    component.draft!.name = 'Changed';
    spyOn(window, 'confirm').and.returnValue(false);
    component.close();
    expect(component.draft).not.toBeNull();
    const event = new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent;
    component.beforeUnload(event);
    expect(event.defaultPrevented).toBeTrue();
  });
});
