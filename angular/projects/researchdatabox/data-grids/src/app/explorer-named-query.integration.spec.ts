import { APP_BASE_HREF, CommonModule } from '@angular/common';
import { HTTP_INTERCEPTORS, HttpClient, HttpErrorResponse } from '@angular/common/http';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { AgGridAngular } from 'ag-grid-angular';
import {
  AdminTabsDirective,
  ConfigService,
  CsrfInterceptor,
  I18NextPipe,
  LoggerService,
  TranslationService,
  UtilityService,
} from '@researchdatabox/portal-ng-common';
import type { GraphqlNamedQueryDescription, NamedQueryPromotionDraft } from '@researchdatabox/sails-ng-common';
import { GraphqlDraftEditorComponent } from '../../../named-query-editor/src/app/graphql-draft-editor.component';
import { NamedQueryApiService } from '../../../named-query-editor/src/app/named-query-api.service';
import { DATA_GRID_SOURCE, DataGridSource } from './data-grid-source';
import { DataGridsComponent } from './data-grids.component';
import { ExplorerNamedQueryComponent } from './explorer-named-query.component';
import { editorSchema } from './graphql-query';
import { scope, testSdl, validGrid } from './data-grid.testing';

function prepared(): NamedQueryPromotionDraft {
  return {
    definition: {
      source: 'graphql',
      name: '',
      graphql: {
        document:
          'query Current($type: String!, $first: Int) { records(recordType: $type, first: $first) { nodes { oid title } } }',
        variables: {},
        resultPath: ['records', 'nodes'],
        mappings: { oid: ['oid'], title: ['title'] },
        provenance: { explorerId: '0123456789abcdef01234567', explorerRevision: 4 },
      },
    },
    variableValues: { type: 'plan', first: 50 },
  };
}
function described(valid: boolean): GraphqlNamedQueryDescription {
  return {
    source: 'graphql',
    valid,
    diagnostics: [],
    parameters: [],
    capabilities: { lookup: false, diagnostics: [] },
    result: { recordType: '', stage: '', precision: 'none', completeness: 'unavailable', fields: [] },
  };
}

describe('Explorer publishing workspace', () => {
  let fixture: ComponentFixture<DataGridsComponent>;
  let explorer: DataGridsComponent;
  let source: jasmine.SpyObj<Required<DataGridSource>>;
  let api: jasmine.SpyObj<NamedQueryApiService>;
  const id = '0123456789abcdef01234567';
  beforeEach(async () => {
    source = jasmine.createSpyObj<Required<DataGridSource>>('explorer', [
      'catalogue',
      'list',
      'query',
      'save',
      'read',
      'remove',
      'prepareNamedQuery',
      'raw',
    ]);
    source.catalogue.and.resolveTo({ scopes: [structuredClone(scope)], persistence: true });
    source.list.and.resolveTo({ grids: [], next: null });
    source.prepareNamedQuery.and.resolveTo(prepared());
    source.save.and.callFake(async definition => ({ ...definition, id, revision: 5 }));
    api = jasmine.createSpyObj<NamedQueryApiService>('named queries', [
      'waitForInit',
      'describe',
      'create',
      'get',
      'reviewUpdate',
      'update',
      'preview',
    ]);
    api.waitForInit.and.resolveTo(api);
    api.describe.and.resolveTo(described(true));
    api.create.and.resolveTo({ name: 'Current' });
    await TestBed.configureTestingModule({
      imports: [DataGridsComponent],
      providers: [
        { provide: DATA_GRID_SOURCE, useValue: source },
        { provide: NamedQueryApiService, useValue: api },
        {
          provide: TranslationService,
          useValue: {
            t: (key: string) => key,
            isInitializing: () => false,
            waitForInit: async () => undefined,
            translationChanges$: of(undefined),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DataGridsComponent);
    explorer = fixture.componentInstance;
    fixture.nativeElement.setAttribute('can-create-named-query', 'true');
    await explorer.load();
    spyOn(explorer, 'ngOnInit');
    explorer.open({ ...validGrid(), name: 'Current', id, revision: 4 }, false);
    await render();
  });
  afterEach(() => {
    fixture.destroy();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  });
  async function render() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function open() {
    await explorer.createNamedQuery();
    await render();
    await new Promise(resolve => setTimeout(resolve, 30));
    await render();
    return fixture.debugElement.query(By.directive(ExplorerNamedQueryComponent))
      .componentInstance as ExplorerNamedQueryComponent;
  }
  it('keeps the explorer and breadcrumb mounted under a focused, cancellable side panel', async () => {
    const origin = JSON.stringify(explorer.activeDefinition),
      url = window.location.href;
    fixture.nativeElement.querySelector('.explorer-header-actions button:nth-child(2)').focus();
    const child = await open();
    const workspace = fixture.nativeElement.querySelector('#explorer-workspace');
    expect(workspace.hidden).toBeFalse();
    expect(workspace.hasAttribute('inert')).toBeTrue();
    expect(workspace.querySelector('.rb-admin-crumbs')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('[role="dialog"]').contains(document.activeElement)).toBeTrue();
    expect(child.draft.graphql.provenance?.explorerId).toBe(id);
    child.cancel();
    await render();
    expect(explorer.promotion).toBeNull();
    expect(JSON.stringify(explorer.activeDefinition)).toBe(origin);
    expect(window.location.href).toBe(url);
    expect(source.save).not.toHaveBeenCalled();
  });
  it('prefills saved values as fixed parameters and paging without errors on open', async () => {
    const child = await open();
    expect(child.draft.name).toBe('Current');
    expect(child.error).toBe('');
    expect<unknown>(child.draft.graphql.variables['type']).toEqual({ ownership: 'fixed', value: 'plan' });
    expect(child.parameterRows.find(row => row.variable === 'first')?.paging).toBeTrue();
    expect(fixture.nativeElement.textContent).not.toContain('Blocking error');
    expect(child.canSave).toBeTrue();
  });
  it('renders delayed validation completion in the OnPush publishing panel', async () => {
    let resolve!: (value: GraphqlNamedQueryDescription) => void;
    api.describe.and.returnValue(new Promise(yes => (resolve = yes)));
    const child = await open();
    expect(child.saveButton!.nativeElement.disabled).toBeTrue();
    resolve(described(true));
    await render();
    expect(child.saveButton!.nativeElement.disabled).toBeFalse();
    expect(child.initializing).toBeFalse();
  });
  it('saves dirty queries before preparing an exact linked revision', async () => {
    explorer.draft!.name = 'Changed';
    await explorer.createNamedQuery();
    await render();
    expect(explorer.saveOpen).toBeTrue();
    expect(source.prepareNamedQuery).not.toHaveBeenCalled();
    explorer.saveName = 'Changed';
    await explorer.confirmSave();
    await render();
    expect(source.save.calls.mostRecent().args[0].name).toBe('Changed');
    expect(source.prepareNamedQuery.calls.mostRecent().args[0].revision).toBe(5);
    expect(explorer.promotion).not.toBeNull();
  });
  it('does not publish after a revision-conflict save', async () => {
    explorer.draft!.name = 'Changed';
    source.save.and.rejectWith(new Error('conflict'));
    await explorer.createNamedQuery();
    explorer.saveName = 'Changed';
    await explorer.confirmSave();
    expect(explorer.saveOpen).toBeTrue();
    expect(source.prepareNamedQuery).not.toHaveBeenCalled();
    expect(explorer.dirty).toBeTrue();
  });
  for (const status of [401, 403, 500, 503, 504])
    it(`keeps origin on preparation failure ${status}`, async () => {
      const origin = JSON.stringify(explorer.activeDefinition);
      source.prepareNamedQuery.and.rejectWith(new HttpErrorResponse({ status }));
      await explorer.createNamedQuery();
      expect(explorer.promotion).toBeNull();
      expect(explorer.promotionError).not.toBe('');
      expect(JSON.stringify(explorer.activeDefinition)).toBe(origin);
    });
  it('ignores prepared state after destruction', async () => {
    let resolve!: (value: NamedQueryPromotionDraft) => void;
    source.prepareNamedQuery.and.returnValue(new Promise(yes => (resolve = yes)));
    const work = explorer.createNamedQuery();
    fixture.destroy();
    resolve(prepared());
    await work;
    expect(explorer.promotion).toBeNull();
  });
  it('opens a focus-contained panel while preparation is pending and ignores a late result after cancellation', async () => {
    let resolve!: (value: NamedQueryPromotionDraft) => void;
    source.prepareNamedQuery.and.returnValue(new Promise(yes => (resolve = yes)));
    const work = explorer.createNamedQuery();
    await render();
    await new Promise(yes => setTimeout(yes, 30));
    await render();
    const child = fixture.debugElement.query(By.directive(ExplorerNamedQueryComponent))
      .componentInstance as ExplorerNamedQueryComponent;
    expect(child.initializing).toBeTrue();
    expect(child.dirty).toBeFalse();
    expect(fixture.nativeElement.querySelector('[role="dialog"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('rb-named-query-basics')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('rb-named-query-parameters')).toBeNull();
    expect(fixture.nativeElement.querySelector('rb-named-query-lookup-fields')).toBeNull();
    child.cancel();
    await render();
    resolve(prepared());
    await work;
    expect(explorer.promotion).toBeNull();
    expect(explorer.promotionOpening).toBeFalse();
  });
  it('renders plain-language sort, all-stage and sentence-case condition summaries', async () => {
    const input = prepared();
    input.definition.graphql.document =
      'query($sort:[Sort!],$stages:[String!],$filters:[Filter!]){records(sort:$sort,stages:$stages,filters:$filters){nodes{oid}}}';
    input.variableValues = {
      sort: [{ field: 'title', direction: 'ASC' }],
      stages: null,
      filters: [{ field: 'title', contains: 'Hunter' }],
    };
    source.prepareNamedQuery.and.resolveTo(input);
    const child = await open();
    expect(child.parameterRows.find(r => r.variable === 'stages')?.displayValue).toBe('data-grids-all-stages');
    expect(child.parameterRows.find(r => r.variable === 'sort')?.displayValue).toBe('Title, data-grids-ascending');
    expect(child.parameterRows.find(r => r.variable === 'condition_1')?.label).not.toContain('Contains');
  });
  it('rejects a prepared handoff if the query changed while it was loading', async () => {
    let resolve!: (value: NamedQueryPromotionDraft) => void;
    source.prepareNamedQuery.and.returnValue(new Promise(yes => (resolve = yes)));
    const work = explorer.createNamedQuery();
    explorer.draft!.name = 'Later';
    resolve(prepared());
    await work;
    expect(explorer.promotion).toBeNull();
    expect(explorer.promotionError).toBe('promotion-query-changed');
  });
  it('confirms discarding panel edits without mutating the saved query', async () => {
    const child = await open(),
      origin = JSON.stringify(explorer.activeDefinition);
    child.draft.description = 'Detached';
    child.changed();
    child.cancel();
    await render();
    expect(child.confirmCancel).toBeTrue();
    child.keepEditing();
    expect(explorer.promotion).not.toBeNull();
    child.cancel();
    child.discard();
    await render();
    expect(explorer.promotion).toBeNull();
    expect(JSON.stringify(explorer.activeDefinition)).toBe(origin);
  });
  it('creates through the existing API and refreshes publication badges', async () => {
    const child = await open();
    await child.save();
    await render();
    expect(api.create).toHaveBeenCalled();
    expect(explorer.promotionSaved).toBeTrue();
    expect(source.list.calls.count()).toBeGreaterThan(1);
  });
  it('previews general queries through the scoped explorer reader and lookup queries through the named-query API', async () => {
    const child = await open();
    source.raw.and.resolveTo({ records: { nodes: [{ oid: 'first', title: 'Title' }] } });
    await child.preview();
    expect(source.raw).toHaveBeenCalledWith(child.draft.graphql.document, { type: 'plan', first: 50 });
    expect(child.previewResult).toEqual([{ 'data-grids-oid': 'first', Title: 'Title' }]);
    expect(api.preview).not.toHaveBeenCalled();
    child.draft.graphql.lookup = {
      mode: 'firstPage',
      collectionPath: ['records'],
      hasNextPagePath: ['records', 'hasNextPage'],
      firstVariable: 'first',
      afterVariable: 'after',
      searchParameter: 'search',
    };
    api.preview.and.resolveTo({ valid: true, records: [{ oid: 'second', title: 'Mapped' }] } as any);
    await child.preview();
    expect(api.preview).toHaveBeenCalled();
    expect(child.previewResult).toEqual([{ oid: 'second', title: 'Mapped' }]);
  });
  it('ignores a stale preview after a binding changes and keeps transport errors safe', async () => {
    const child = await open();
    let resolve!: (data: Record<string, unknown>) => void;
    source.raw.and.returnValue(new Promise(yes => (resolve = yes)));
    const work = child.preview();
    child.changed();
    resolve({ records: { nodes: [{ oid: 'stale' }] } });
    await work;
    expect(child.previewResult).toBeNull();
    await child.validate();
    source.raw.and.rejectWith(Error('private transport data'));
    await child.preview();
    expect(child.previewError).toBe('nq-section-preview-failed');
  });
  it('requires the reviewed breaking-update token for an existing named query', async () => {
    explorer.draft!.publishedAs = [{ name: 'linked', publishedRevision: 3, changedSincePublished: true }];
    // Publication metadata is read-only and does not constitute an unsaved definition edit.
    spyOn(window, 'confirm').and.returnValue(true);
    explorer.open({ ...explorer.draft! }, false);
    api.get.and.resolveTo({ ...prepared().definition, name: 'linked' });
    api.reviewUpdate.and.resolveTo({ required: true, confirmation: 'review-token', usedBy: [] } as any);
    api.update.and.resolveTo({ name: 'linked' });
    const child = await open();
    expect(child.updateName).toBe('linked');
    expect(child.canSave)
      .withContext(JSON.stringify({ error: child.error, description: child.description, init: child.initializing }))
      .toBeTrue();
    await child.save();
    expect(child.pendingUpdate).not.toBeNull();
    expect(api.update).not.toHaveBeenCalled();
    await child.confirmUpdate();
    expect(api.update).toHaveBeenCalledWith('linked', jasmine.any(Object), 'review-token');
  });
  it('invalidates reviewed changes and ignores validation responses after destruction', async () => {
    const child = await open();
    let resolve!: (value: GraphqlNamedQueryDescription) => void;
    api.describe.and.returnValue(new Promise(yes => (resolve = yes)));
    const validation = child.validate();
    child.changed();
    resolve(described(true));
    await validation;
    expect(child.description).toBeNull();
    expect(child.canSave).toBeFalse();
    const validation2 = child.validate();
    fixture.destroy();
    resolve(described(true));
    await validation2;
    expect(api.create).not.toHaveBeenCalled();
  });
  it('retains the panel and renders safe messages on denied or duplicate writes', async () => {
    const child = await open();
    api.create.and.rejectWith(new HttpErrorResponse({ status: 403, error: 'secret' }));
    await child.save();
    expect(child.error).toBe('data-grids-promotion-denied');
    expect(explorer.promotion).not.toBeNull();
    api.create.and.rejectWith(new HttpErrorResponse({ status: 409 }));
    await child.save();
    expect(child.error).toBe('data-grids-promotion-name-exists');
  });
});

describe('Fresh promotion with real API initialization and CSRF', () => {
  let fixture: ComponentFixture<ExplorerNamedQueryComponent> | undefined;
  let http: HttpTestingController;
  const base = '/context/brand/portal/api/named-query';
  beforeEach(async () => {
    fixture = undefined;
    await TestBed.configureTestingModule({
      imports: [HttpClientTestingModule, ExplorerNamedQueryComponent],
      providers: [
        NamedQueryApiService,
        {
          provide: ConfigService,
          useFactory: (client: HttpClient, root: string) =>
            new ConfigService(client, root, document.implementation.createHTMLDocument('Fresh explorer')),
          deps: [HttpClient, APP_BASE_HREF],
        },
        UtilityService,
        LoggerService,
        { provide: APP_BASE_HREF, useValue: '/context' },
        { provide: HTTP_INTERCEPTORS, useClass: CsrfInterceptor, multi: true },
        {
          provide: TranslationService,
          useValue: {
            t: (key: string) => key,
            isInitializing: () => false,
            waitForInit: async () => undefined,
            translationChanges$: of(undefined),
          },
        },
      ],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => {
    fixture?.destroy();
    http.verify();
  });
  function open(): ExplorerNamedQueryComponent {
    fixture = TestBed.createComponent(ExplorerNamedQueryComponent);
    fixture.componentRef.setInput('prepared', prepared());
    fixture.detectChanges();
    return fixture.componentInstance;
  }
  function finishConfig(): void {
    http.expectOne('/context/csrfToken').flush({ _csrf: 'page-session-token' });
    http
      .expectOne(request => request.url.startsWith('/context/dynamic/apiClientConfig?'))
      .flush({
        baseUrl: '',
        branding: 'brand',
        portal: 'portal',
      });
    flushMicrotasks();
  }

  it('waits for fresh configuration before schema/description, then saves using scoped URLs and current CSRF', fakeAsync(() => {
    const component = open();
    expect(TestBed.inject(NamedQueryApiService).brandingAndPortalUrl).toBe('');
    component.draft.name = 'latest_unsaved';
    component.changed();
    tick(300);
    http.expectNone(request => request.url.includes('/api/named-query'));
    expect(component.canSave).toBeFalse();
    expect(component.initializing).toBeTrue();
    finishConfig();
    const description = http.expectOne(`${base}/editor/describe`);
    expect(description.request.method).toBe('POST');
    expect(description.request.headers.get('X-CSRF-Token')).toBe('page-session-token');
    expect(description.request.headers.get('X-Source')).toBe('jsclient');
    expect(description.request.body.definition.name).toBe('latest_unsaved');
    description.flush({ data: described(false) });
    flushMicrotasks();
    component.draft.graphql.variables = {
      type: { ownership: 'fixed', value: 'plan' },
      first: { ownership: 'fixed', value: 50 },
    };
    component.changed();
    tick(250);
    http.expectOne(`${base}/editor/describe`).flush({ data: described(true) });
    flushMicrotasks();
    expect(component.canSave).toBeTrue();
    TestBed.inject(ConfigService).csrfToken = 'refreshed-session-token';
    const saved = jasmine.createSpy('saved');
    component.saved.subscribe(saved);
    void component.save();
    const validation = http.expectOne(`${base}/editor/describe`);
    expect(validation.request.headers.get('X-CSRF-Token')).toBe('refreshed-session-token');
    validation.flush({ data: described(true) });
    flushMicrotasks();
    const create = http.expectOne(base);
    expect(create.request.method).toBe('POST');
    expect(create.request.headers.get('X-CSRF-Token')).toBe('refreshed-session-token');
    expect(create.request.body.name).toBe('latest_unsaved');
    create.flush({ data: { name: 'latest_unsaved' } });
    flushMicrotasks();
    expect(saved).toHaveBeenCalledOnceWith('latest_unsaved');
    expect(component.initializing).toBeFalse();
  }));

  it('retains the detached draft and shows initialization failure without issuing unscoped requests', fakeAsync(() => {
    const component = open();
    const snapshot = JSON.stringify(component.draft);
    http.expectOne('/context/csrfToken').flush({}, { status: 503, statusText: 'Unavailable' });
    flushMicrotasks();
    fixture!.detectChanges();
    expect(component.initializing).toBeFalse();
    expect(component.canSave).toBeFalse();
    expect(JSON.stringify(component.draft)).toBe(snapshot);
    expect(fixture!.nativeElement.querySelector('[role="alert"]').textContent).toContain(
      'data-grids-promotion-init-failed'
    );
    component.draft.name = 'still_detached';
    component.changed();
    void component.validate();
    void component.save();
    tick(300);
    expect(component.error).toBe('data-grids-promotion-init-failed');
    http.expectNone(request => request.url.includes('/api/named-query'));
  }));

  it('does not start API requests after cancellation destroys an editor waiting for configuration', fakeAsync(() => {
    open();
    fixture!.destroy();
    fixture = undefined;
    finishConfig();
    http.expectNone(request => request.url.includes('/api/named-query'));
  }));
});
