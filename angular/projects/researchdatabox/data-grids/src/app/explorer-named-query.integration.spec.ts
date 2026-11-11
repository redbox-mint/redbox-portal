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

describe('Explorer detached named-query promotion', () => {
  let fixture: ComponentFixture<DataGridsComponent>;
  let explorer: DataGridsComponent;
  let source: jasmine.SpyObj<Required<DataGridSource>>;
  let api: jasmine.SpyObj<NamedQueryApiService>;
  let handoff: NamedQueryPromotionDraft;
  beforeEach(async () => {
    handoff = prepared();
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
    source.prepareNamedQuery!.and.resolveTo(handoff);
    api = jasmine.createSpyObj<NamedQueryApiService>('named queries', [
      'waitForInit',
      'graphqlSchema',
      'describe',
      'create',
    ]);
    api.waitForInit.and.resolveTo(api);
    api.graphqlSchema.and.resolveTo({ sdl: testSdl });
    api.describe.and.resolveTo(described(false));
    api.create.and.resolveTo({ name: 'independent' });
    await TestBed.configureTestingModule({
      declarations: [DataGridsComponent],
      imports: [CommonModule, FormsModule, AgGridAngular, I18NextPipe, AdminTabsDirective, ExplorerNamedQueryComponent],
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
    explorer.open({ ...validGrid(), id: '0123456789abcdef01234567', revision: 4 });
    explorer.draft!.name = 'Current unsaved name';
    fixture.detectChanges();
    await fixture.whenStable();
  });
  afterEach(() => {
    fixture.destroy();
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
  });
  function origin() {
    return JSON.stringify({
      draft: explorer.draft,
      raw: explorer.rawDraft,
      values: explorer.variablesText,
      mode: explorer.mode,
      url: window.location.href,
    });
  }
  async function render() {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  async function open() {
    await explorer.createNamedQuery();
    await render();
    return fixture.debugElement.query(By.directive(ExplorerNamedQueryComponent))
      .componentInstance as ExplorerNamedQueryComponent;
  }
  function editor() {
    return fixture.debugElement.query(By.directive(GraphqlDraftEditorComponent))
      .componentInstance as GraphqlDraftEditorComponent;
  }
  async function ready(child: ExplorerNamedQueryComponent) {
    const input = fixture.nativeElement.querySelector('#nq-graphql-name') as HTMLInputElement;
    input.value = 'independent';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await render();
    editor().tab = 'variables';
    await render();
    for (const key of ['type', 'first']) {
      const select = fixture.nativeElement.querySelector('#nq-owner-' + key) as HTMLSelectElement;
      select.value = 'fixed';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    api.describe.and.resolveTo(described(true));
    await child.validate();
    await render();
  }
  for (const mode of ['visual', 'graphql'] as const) {
    it(`uses current unsaved ${mode} values and cancels without changing the explorer or URL`, async () => {
      if (mode === 'graphql') {
        explorer.mode = 'graphql';
        explorer.schema = editorSchema(testSdl);
        explorer.rawDraft = {
          version: 1,
          mode: 'graphql',
          id: '0123456789abcdef01234567',
          revision: 4,
          name: 'Current raw name',
          document: 'query Current($type: String!) { records(recordType: $type) { nodes { oid } } }',
          variables: { type: 'STALE_PARSED_VALUE' },
          resultPath: ['records', 'nodes'],
        };
        explorer.variablesText = '{"type":"CURRENT_UNSAVED_VALUE"}';
      } else {
        explorer.draft!.columns.push('budget');
        explorer.draft!.pageSize = 50;
        explorer.draft!.filters = [
          { fieldId: 'title', expectedScalarType: 'STRING', operator: 'contains', values: ['CURRENT_UNSAVED_VALUE'] },
        ];
      }
      const before = origin();
      const child = await open();
      const sent = source.prepareNamedQuery!.calls.mostRecent().args[0];
      expect(sent === explorer.activeDefinition).toBeFalse();
      if (sent.mode === 'graphql') expect<unknown>(sent.variables['type']).toBe('CURRENT_UNSAVED_VALUE');
      else {
        expect(sent.columns).toEqual(['title', 'budget']);
        expect(sent.filters[0].values).toEqual(['CURRENT_UNSAVED_VALUE']);
      }
      expect(child.draft.name).toBe('');
      expect(child.draft.graphql.variables).toEqual({});
      expect(fixture.nativeElement.querySelector('#promotion-save').disabled).toBeTrue();
      expect(fixture.nativeElement.querySelector('#explorer-workspace').hidden).toBeTrue();
      expect(fixture.nativeElement.querySelector('#explorer-workspace').hasAttribute('inert')).toBeTrue();
      expect(document.activeElement).toBe(fixture.nativeElement.querySelector('rb-explorer-named-query h2'));
      child.draft.description = 'Detached edits';
      child.changed();
      await render();
      child.cancel();
      await render();
      const dialog = fixture.nativeElement.querySelector('[role="alertdialog"]') as HTMLElement;
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.textContent).toContain('data-grids-promotion-discard-help');
      expect(dialog.contains(document.activeElement)).toBeTrue();
      dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await render();
      expect(child.confirmCancel).toBeFalse();
      expect(explorer.promotion).not.toBeNull();
      child.cancel();
      await render();
      child.discard();
      await render();
      expect(explorer.promotion).toBeNull();
      expect(origin()).toBe(before);
      expect(source.save).not.toHaveBeenCalled();
      expect(source.query).not.toHaveBeenCalled();
      expect(source.raw).not.toHaveBeenCalled();
      expect(api.create).not.toHaveBeenCalled();
      expect(document.activeElement?.textContent).toContain('data-grids-create-named-query');
    });
  }
  it('checks the destination permission independently and preserves the origin on denied or failed preparation', async () => {
    fixture.nativeElement.setAttribute('can-create-named-query', 'false');
    const before = origin();
    expect(explorer.canPreview).toBeTrue();
    expect(explorer.canPromote).toBeFalse();
    await explorer.createNamedQuery();
    expect(source.prepareNamedQuery).not.toHaveBeenCalled();
    fixture.nativeElement.setAttribute('can-create-named-query', 'true');
    for (const status of [403, 500]) {
      source.prepareNamedQuery!.and.rejectWith(new HttpErrorResponse({ status }));
      await explorer.createNamedQuery();
      await render();
      expect(explorer.promotion).toBeNull();
      expect(origin()).toBe(before);
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        status === 403 ? 'promotion-denied' : 'promotion-open-failed'
      );
    }
    expect(source.save).not.toHaveBeenCalled();
    expect(api.create).not.toHaveBeenCalled();
  });
  for (const status of [403, 500])
    it(`announces deferred preparation outside inert controls and restores focus after ${status}`, fakeAsync(() => {
      const before = origin();
      let reject!: (reason: unknown) => void;
      source.prepareNamedQuery.and.returnValue(
        new Promise((_, fail) => {
          reject = fail;
        })
      );
      const trigger = explorer.promotionButton!.nativeElement;
      trigger.focus();
      void explorer.createNamedQuery();
      fixture.detectChanges();
      const progress = fixture.nativeElement.querySelector('#explorer-promotion-status [role="status"]') as HTMLElement;
      expect(progress.textContent).toContain('data-grids-promotion-opening');
      expect(progress.closest('[inert], [hidden], [aria-hidden="true"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('#explorer-workspace').hasAttribute('inert')).toBeTrue();
      expect(trigger.disabled).toBeTrue();
      trigger.blur();
      reject(new HttpErrorResponse({ status }));
      flushMicrotasks();
      tick(0);
      fixture.detectChanges();
      const error = fixture.nativeElement.querySelector('#explorer-promotion-status [role="alert"]') as HTMLElement;
      expect(error.textContent).toContain(status === 403 ? 'promotion-denied' : 'promotion-open-failed');
      expect(error.closest('[inert], [hidden], [aria-hidden="true"]')).toBeNull();
      expect(fixture.nativeElement.querySelector('#explorer-workspace').hasAttribute('inert')).toBeFalse();
      expect(document.activeElement).toBe(trigger);
      expect(origin()).toBe(before);
      expect(source.save).not.toHaveBeenCalled();
      expect(api.create).not.toHaveBeenCalled();
    }));
  it('blocks invalid current raw JSON without falling back to previously parsed variables', async () => {
    explorer.mode = 'graphql';
    explorer.schema = editorSchema(testSdl);
    explorer.rawDraft.document = 'query { records(recordType: "plan") { nodes { oid } } }';
    explorer.variablesText = '{unfinished';
    expect(explorer.canPromote).toBeFalse();
    await explorer.createNamedQuery();
    expect(source.prepareNamedQuery).not.toHaveBeenCalled();
    expect(source.save).not.toHaveBeenCalled();
  });
  it('deep copies candidate mappings and fixed values while leaving consumer defaults explicit', async () => {
    handoff.variableValues['first'] = { nested: [false, 0] };
    const child = await open();
    const draftEditor = editor();
    expect(draftEditor.ownership('first')).toBe('');
    draftEditor.classify('first', 'consumer');
    expect(Object.hasOwn(draftEditor.binding('first')!, 'defaultValue')).toBeFalse();
    draftEditor.classify('first', 'fixed');
    expect(draftEditor.fixed('first') === handoff.variableValues['first']).toBeFalse();
    handoff.variableValues['first'] = { nested: ['origin edited'] };
    handoff.definition.graphql.mappings!.oid!.push('origin changed');
    expect(JSON.stringify(draftEditor.fixed('first'))).toBe('{"nested":[false,0]}');
    expect(child.draft.graphql.mappings!.oid).toEqual(['oid']);
    child.draft.graphql.mappings!.title!.push('detached changed');
    expect(handoff.definition.graphql.mappings!.title).toEqual(['title']);
  });
  for (const status of [403, 409, 500])
    it(`keeps the detached editor and explorer intact after save ${status}`, async () => {
      const before = origin();
      const child = await open();
      await ready(child);
      expect(child.canSave).toBeTrue();
      api.create.and.rejectWith(new HttpErrorResponse({ status }));
      const candidate = JSON.stringify(child.draft);
      await child.save();
      await render();
      expect(JSON.stringify(child.draft)).toBe(candidate);
      expect(explorer.promotion).not.toBeNull();
      expect(origin()).toBe(before);
      const key = status === 403 ? 'denied' : status === 409 ? 'name-exists' : 'save-failed';
      expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain(
        'data-grids-promotion-' + key
      );
      expect(source.save).not.toHaveBeenCalled();
    });
  it('permits a valid nonlookup save, leaving the original exploration unchanged', async () => {
    const before = origin();
    const child = await open();
    await ready(child);
    expect(child.description?.capabilities?.lookup).toBeFalse();
    expect(child.canSave).toBeTrue();
    await child.save();
    await render();
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.create.calls.mostRecent().args[0].source).toBe('graphql');
    expect(explorer.promotion).toBeNull();
    expect(explorer.promotionSaved).toBeTrue();
    expect(origin()).toBe(before);
    expect(source.save).not.toHaveBeenCalled();
  });
  it('keeps malformed detached path text pending and blocks persistence', async () => {
    const child = await open();
    await ready(child);
    editor().tab = 'mappings';
    await render();
    const textarea = fixture.nativeElement.querySelector('#nq-graphql-panel-mappings textarea') as HTMLTextAreaElement;
    textarea.value = '["unfinished"';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    await render();
    expect(child.pendingInput).toBeTrue();
    expect(child.canSave).toBeFalse();
    await child.save();
    expect(api.create).not.toHaveBeenCalled();
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
    const schema = http.expectOne(`${base}/editor/graphql-schema`);
    const description = http.expectOne(`${base}/editor/describe`);
    expect(schema.request.headers.get('X-CSRF-Token')).toBe('page-session-token');
    expect(description.request.method).toBe('POST');
    expect(description.request.headers.get('X-CSRF-Token')).toBe('page-session-token');
    expect(description.request.headers.get('X-Source')).toBe('jsclient');
    expect(description.request.body.definition.name).toBe('latest_unsaved');
    schema.flush({ data: { sdl: testSdl } });
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
