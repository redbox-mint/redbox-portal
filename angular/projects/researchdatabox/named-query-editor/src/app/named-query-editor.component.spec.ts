import { SavedQueryChooserComponent } from './saved-query-chooser.component';
import {
  validateNamedQueryName,
  NamedQueryNameFieldComponent,
  NamedQueryBasicsSectionComponent,
  NamedQueryParametersSectionComponent,
  NamedQueryLookupSectionComponent,
  NamedQueryPreviewSectionComponent,
  AdminSourceCardComponent,
} from '@researchdatabox/portal-ng-common';
import { GraphqlDraftEditorComponent } from './graphql-draft-editor.component';
import { GraphqlSchemaComponent } from './graphql-schema.component';
import { GraphqlJsonInputComponent } from './graphql-json-input.component';
import { AdminTabsDirective } from '@researchdatabox/portal-ng-common';
import { Subject } from 'rxjs';
import { AdminDiscardDialogComponent, AdminModalDirective, AdminCountPipe } from '@researchdatabox/portal-ng-common';
import { QueryAssistanceModule } from './query-assistance.module';
import {
  TranslationService as AssistanceTranslationService,
  FieldTreeComponent,
  SchemaTargetSelectorComponent,
} from '@researchdatabox/portal-ng-common';
import { of } from 'rxjs';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import { By } from '@angular/platform-browser';
import { CdkTrapFocus, A11yModule } from '@angular/cdk/a11y';
import { NamedQueryEditorComponent } from './named-query-editor.component';
import { NamedQueryApiService, NamedQueryDefinition } from './named-query-api.service';
import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { NqListComponent } from './nq-list/nq-list.component';
import { NqDetailComponent } from './nq-detail/nq-detail.component';
import { QueryParamEditorComponent } from './query-param-editor/query-param-editor.component';
import { ResultMappingEditorComponent } from './result-mapping-editor/result-mapping-editor.component';
import { SortEditorComponent } from './sort-editor/sort-editor.component';
import { MongoQueryEditorComponent } from './mongo-query-editor/mongo-query-editor.component';
import { RelatedFilterEditorComponent } from './related-filter-editor/related-filter-editor.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

class NamedQueryApiServiceStub {
  async graphqlRead() { return { data: { records: { nodes: [] } } }; }
  async graphqlSchema() { return { sdl: 'type Query { visible: String }' }; }
  async describe() { return { source: 'graphql', valid: true, diagnostics: [], parameters: [], operationVariables: [], result: { recordType: '', stage: '', precision: 'none', completeness: 'unavailable', fields: [] } }; }

  async schemaTargets() {
    return { recordTypes: [] };
  }
  async fields(context: { collectionName: string }) {
    return {
      collectionName: context.collectionName,
      recordType: '',
      stage: '',
      precision: 'none',
      completeness: 'unavailable',
      fields: [],
      envelopeFields: [],
      mappingFields: [],
    };
  }
  async preview() { return { records: [], diagnostics: [], limit: 20, truncated: false }; }
  async reviewUpdate() { return { required: false, changes: [], usedBy: [], usageComplete: false }; }
  async validate() {
    return { valid: true, diagnostics: [] };
  }

  async waitForInit(): Promise<this> {
    return this;
  }
  async list(): Promise<NamedQueryDefinition[]> {
    return [];
  }
  async getCollections(): Promise<string[]> {
    return ['record', 'user'];
  }
  async get(_name: string): Promise<NamedQueryDefinition> {
    return { name: _name, collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
  }
  async create(_data: NamedQueryDefinition): Promise<{ name: string }> {
    return { name: _data.name || '' };
  }
  async update(_name: string, _data: NamedQueryDefinition): Promise<{ name: string }> {
    return { name: _name };
  }
  async delete(_name: string): Promise<{ name: string }> {
    return { name: _name };
  }
}

class TranslationServiceStub {
  translationChanges$ = new Subject<void>();
  isInitializing() { return false; }
  async waitForInit(): Promise<this> { return this; }
  t(value: string, defaultValue?: string | Record<string, unknown>, options?: Record<string, unknown>): string {
    const template = typeof defaultValue === 'string' ? defaultValue : value;
    options = typeof defaultValue === 'object' ? defaultValue : options;
    if (!options) {
      return template;
    }
    return Object.entries(options).reduce((result, [key, optionValue]) => {
      return result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), String(optionValue));
    }, template);
  }
}

describe('NamedQueryEditorComponent', () => {
  beforeEach(async () => {
    spyOn(window, 'confirm').and.returnValue(true);
    await TestBed.configureTestingModule({
      declarations: [
        NamedQueryEditorComponent,
        NqListComponent,
        NqDetailComponent,
        QueryParamEditorComponent,
        ResultMappingEditorComponent,
        SortEditorComponent,
        MongoQueryEditorComponent,
        RelatedFilterEditorComponent,
        I18NextPipeStub,
      ],
      imports: [AdminSourceCardComponent, NamedQueryNameFieldComponent, SavedQueryChooserComponent, NamedQueryBasicsSectionComponent, NamedQueryParametersSectionComponent, NamedQueryLookupSectionComponent, NamedQueryPreviewSectionComponent, GraphqlDraftEditorComponent, GraphqlSchemaComponent, GraphqlJsonInputComponent, AdminTabsDirective, AdminDiscardDialogComponent, AdminModalDirective, AdminCountPipe, QueryAssistanceModule, FieldTreeComponent, SchemaTargetSelectorComponent, FormsModule, A11yModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '/' },
        { provide: NamedQueryApiService, useClass: NamedQueryApiServiceStub },
        { provide: TranslationService, useClass: TranslationServiceStub },
        LoggerService,
      ],
    }).compileComponents();
  });

  for (const source of ['database', 'graphql'] as const) {
    for (const [name, reason] of [['active research plans', 'spaces'], ['collections', 'reserved'], ['a'.repeat(121), 'long'], ['', 'required']]) {
      it(`focuses ${source} name on Save for ${reason} and keeps untouched required quiet`, async () => {
        const fixture = TestBed.createComponent(NamedQueryEditorComponent), component = fixture.componentInstance;
        fixture.detectChanges(); await component.waitForInit(); component.newQuery();
        if (source === 'graphql') component.changeSource('graphql');
        component.draft.name = name; fixture.detectChanges(); await fixture.whenStable(); fixture.detectChanges();
        const input = Array.from(fixture.nativeElement.querySelectorAll('[data-named-query-name]')).find((e: any) => e.getClientRects().length) as HTMLInputElement;
        if (!name) expect(input.getAttribute('aria-invalid')).toBeNull();
        const button = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement;
        expect(button.disabled).toBeFalse(); button.click(); fixture.detectChanges();
        await fixture.whenStable(); fixture.detectChanges();
        expect(input.getAttribute('aria-invalid')).toBe('true');
        expect(document.activeElement).toBe(input);
        expect(input.closest('rb-named-query-name')!.querySelector('.invalid-feedback')!.textContent).toContain(reason);
        if (name) {
          (input.closest('rb-named-query-name')!.querySelector('button') as HTMLButtonElement).click(); fixture.detectChanges();
          expect(validateNamedQueryName(component.draft.name)).toBeNull();
          expect(component.draft.name).not.toBe(name);
        }
        fixture.destroy();
      });
    }
  }
  it('uses local name feedback without scheduling remote validation for an invalid new name', fakeAsync(() => {
    const f = TestBed.createComponent(NamedQueryEditorComponent), c = f.componentInstance;
    const api = TestBed.inject(NamedQueryApiService), validate = spyOn(api, 'validate').and.callThrough();
    c.isEditing = true; c.isNew = true; c.draft.name = 'has spaces'; c.scheduleValidation(); tick(500);
    expect(validate).not.toHaveBeenCalled(); expect(c.validating).toBeFalse();
    f.destroy();
  }));
  function deferred<T>() {
    let resolve!: (value: T) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
  }
  function graphqlDraft(name = 'gql') {
    return { name, source: 'graphql' as const, graphql: { document: 'query Q($search: String = "rdmp") { records(recordType: $search) { nodes { oid } } }',
      variables: { search: { ownership: 'consumer' as const, parameter: 'search', inputType: 'String', required: false } }, resultPath: ['records', 'nodes'] } };
  }
  it('round trips separate source buffers and saves only the selected GraphQL fields', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService); const create = spyOn(api, 'create').and.resolveTo({ name: 'separate' });
    fixture.detectChanges(); await component.waitForInit(); component.newQuery();
    component.draft.name = 'separate'; component.draft.collectionName = 'record'; component.draft.mongoQuery = { original: true }; component.draftChanged();
    fixture.detectChanges(); component.changeSource('graphql');
    Object.assign(component.graphqlBuffer.graphql, graphqlDraft().graphql); component.draftChanged(); fixture.detectChanges();
    component.changeSource('database'); expect(component.draft.mongoQuery).toEqual({ original: true });
    component.draft.mongoQuery = { unsaved: false }; component.changeSource('graphql');
    expect(component.graphqlBuffer.graphql.document).toContain('query Q'); expect(component.draft.name).toBe('separate');
    await component.save();
    expect(create).toHaveBeenCalled(); const saved = create.calls.mostRecent().args[0];
    expect(saved.source).toBe('graphql'); expect(Object.hasOwn(saved, 'mongoQuery')).toBeFalse(); expect(Object.hasOwn(saved, 'usedBy')).toBeFalse();
    expect(component.isEditing).toBeFalse();
  });
  it('retains invalid GraphQL JSON through source switching and blocks only the active source', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    fixture.detectChanges(); await component.waitForInit(); component.newQuery(); component.draft.name = 'buffers'; component.draft.collectionName = 'record';
    component.changeSource('graphql'); Object.assign(component.graphqlBuffer.graphql, graphqlDraft().graphql); fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(GraphqlDraftEditorComponent)).componentInstance as GraphqlDraftEditorComponent;
    editor.tab = 'mappings'; fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#nq-graphql-panel-mappings textarea') as HTMLTextAreaElement;
    input.value = '["unfinished"'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(component.pendingInput).toBeTrue(); component.changeSource('database'); fixture.detectChanges(); expect(component.pendingInput).toBeFalse();
    component.changeSource('graphql'); fixture.detectChanges(); expect(input.value).toBe('["unfinished"'); expect(component.pendingInput).toBeTrue(); expect(component.canSave).toBeFalse();
  });
  for (const [variable, label] of [
    ['resultPath', 'named-query-graphql-result-path'],
    ['mapping', 'named-query-graphql-mapping-title'],
    ['lookup', 'named-query-graphql-collectionPath'],
  ]) it(`keeps invalid ${variable} path text blocking Save after a same-named variable ownership change`, async () => {
      const fixture = TestBed.createComponent(NamedQueryEditorComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await component.waitForInit();
      component.newQuery();
      component.draft.name = 'collisions';
      component.changeSource('graphql');
      Object.assign(component.activeGraphqlBuffer.graphql, graphqlDraft().graphql);
      component.activeGraphqlBuffer.graphql.document = `query Q($${variable}: String) { records(recordType: "rdmp") { nodes { oid } } }`;
      component.activeGraphqlBuffer.graphql.variables = {};
      fixture.detectChanges();
      const editor = fixture.debugElement.query(By.directive(GraphqlDraftEditorComponent))
        .componentInstance as GraphqlDraftEditorComponent;
      editor.classify(variable, 'consumer');
      editor.toggleLookup(true);
      editor.tab = 'mappings';
      fixture.detectChanges();
      await fixture.whenStable();
      const json = fixture.debugElement
        .queryAll(By.directive(GraphqlJsonInputComponent))
        .map(node => node.componentInstance as GraphqlJsonInputComponent)
        .find(control => control.label === label)!;
      const textarea = fixture.nativeElement.querySelector('#' + json.id) as HTMLTextAreaElement;
      textarea.value = '["unfinished"';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      expect(json.invalid).toBeTrue();
      expect(component.pendingInput).toBeTrue();
      editor.tab = 'variables';
      fixture.detectChanges();
      await fixture.whenStable();
      const ownership = fixture.nativeElement.querySelector('#nq-owner-' + variable) as HTMLSelectElement;
      ownership.value = 'omitted';
      ownership.dispatchEvent(new Event('change', { bubbles: true }));
      fixture.detectChanges();
      expect(json.invalid).toBeTrue();
      expect(textarea.value).toBe('["unfinished"');
      expect(component.pendingInput).toBeTrue();
      expect(component.canSave).toBeFalse();
      expect((fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement).disabled).toBeFalse();
    });
  it('retains pending database JSON while editing the independent GraphQL buffer', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges(); await component.waitForInit(); component.newQuery();
    component.draft.name = 'rawBuffers'; component.draft.collectionName = 'record'; fixture.detectChanges();
    const database = fixture.debugElement.query(By.directive(MongoQueryEditorComponent)).componentInstance as MongoQueryEditorComponent;
    database.toggleRawJson(); database.rawJsonText = '{ invalid'; database.rawChanged();
    expect(component.pendingInput).toBeTrue(); component.changeSource('graphql');
    Object.assign(component.graphqlBuffer.graphql, graphqlDraft().graphql); fixture.detectChanges();
    expect(component.pendingInput).toBeFalse(); component.changeSource('database'); fixture.detectChanges();
    expect(database.rawJsonText).toBe('{ invalid'); expect(database.useRawJson).toBeTrue();
    expect(component.pendingInput).toBeTrue(); expect(component.canSave).toBeFalse();
  });
  it('opens malformed saved GraphQL shapes for safe repair without a template crash', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    spyOn(api, 'get').and.resolveTo(JSON.parse('{"name":"repair","source":"graphql","graphql":{"document":null,"variables":null,"mappings":"broken","lookup":"broken","resultPath":null}}'));
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('repair'); fixture.detectChanges(); await fixture.whenStable();
    expect(component.activeGraphqlBuffer.graphql.document).toBe('');
    expect(component.activeGraphqlBuffer.graphql.lookup).toBeUndefined();
    expect(component.activeGraphqlBuffer.graphql.mappings).toEqual({}); expect(component.canSave).toBeFalse();
  });
  it('cancels source replacement without persistence and restores save focus after a trapped dialog', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService); const update = spyOn(api, 'update').and.resolveTo({ name: 'existing' });
    spyOn(api, 'reviewUpdate').and.resolveTo({ required: true, changes: ['source'], usedBy: [{ type: 'form', name: 'Known form', path: '/record/form/known' }], usageComplete: false, confirmation: 'reviewed' });
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('existing'); component.changeSource('graphql'); Object.assign(component.graphqlBuffer.graphql, graphqlDraft().graphql); fixture.detectChanges();
    const save = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement; save.focus(); await component.save(); fixture.detectChanges(); await fixture.whenStable();
    const dialog = fixture.nativeElement.querySelector('[aria-labelledby="nq-review-title"]') as HTMLElement;
    expect(dialog.getAttribute('aria-modal')).toBe('true'); expect(dialog.textContent).toContain('Known form'); expect(dialog.textContent).toContain('named-query-untracked-callers-note');
    expect(fixture.nativeElement.querySelector('.nq-workspace').hasAttribute('inert')).toBeTrue();
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); fixture.detectChanges(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(component.pendingReview).toBeNull(); expect(update).not.toHaveBeenCalled(); expect(component.isEditing).toBeTrue(); expect(document.activeElement).toBe(save);
  });
  it('opens review usage links in a new tab without a dirty-document discard prompt', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    spyOn(api, 'reviewUpdate').and.resolveTo({ required: true, changes: ['source'],
      usedBy: [{ type: 'form', name: 'Known form', path: '/record/form/known' }], usageComplete: false, confirmation: 'bound' });
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('existing');
    component.changeSource('graphql'); Object.assign(component.graphqlBuffer.graphql, graphqlDraft().graphql);
    component.draftChanged(); fixture.detectChanges(); await component.save(); fixture.detectChanges();
    const link = fixture.nativeElement.querySelector('[aria-labelledby="nq-review-title"] a') as HTMLAnchorElement;
    expect(link.target).toBe('_blank');
    // Suppress the browser default only; the real document capture guard still runs.
    link.addEventListener('click', event => event.preventDefault());
    (window.confirm as jasmine.Spy).calls.reset();
    link.click();
    expect(window.confirm).not.toHaveBeenCalled();
    expect(component.pendingReview).not.toBeNull(); expect(component.isEditing).toBeTrue();
  });
  for (const phase of ['validation', 'review'] as const) {
    for (const change of ['draft', 'pendingInput'] as const) {
      it(`explains ${change} changes during deferred ${phase} and restores a focus cue`, async () => {
        const fixture = TestBed.createComponent(NamedQueryEditorComponent);
        const component = fixture.componentInstance;
        const api = TestBed.inject(NamedQueryApiService);
        fixture.detectChanges();
        await component.waitForInit();
        await component.openQuery('existing');
        fixture.detectChanges();
        const validation = deferred<Awaited<ReturnType<NamedQueryApiService['validate']>>>();
        const review = deferred<Awaited<ReturnType<NamedQueryApiService['reviewUpdate']>>>();
        spyOn(api, 'validate').and.returnValue(validation.promise);
        const reviewSpy = spyOn(api, 'reviewUpdate').and.returnValue(review.promise);
        const update = spyOn(api, 'update');
        const save = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement;
        save.focus();
        const saving = component.save();
        fixture.detectChanges();
        if (phase === 'review') {
          validation.resolve({ valid: true, diagnostics: [] });
          await new Promise(resolve => setTimeout(resolve, 0));
          expect(reviewSpy).toHaveBeenCalledTimes(1);
        }
        if (change === 'draft') {
          component.draft.description = 'Edited while awaiting response';
          component.draftChanged();
        } else component.pendingInput = true;
        fixture.detectChanges();
        if (phase === 'validation') validation.resolve({ valid: true, diagnostics: [] });
        else review.resolve({ required: false, changes: [], usedBy: [], usageComplete: false });
        await saving;
        fixture.detectChanges();
        await new Promise(resolve => setTimeout(resolve, 0));
        expect(component.error).toContain('The draft changed');
        expect(fixture.nativeElement.querySelector('[role="alert"]').textContent).toContain('The draft changed');
        expect(update).not.toHaveBeenCalled();
        expect(component.pendingReview).toBeNull();
        if (change === 'pendingInput')
          expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#nq-save-blocker'));
        else expect(document.activeElement).toBe(save);
        if (phase === 'validation') expect(reviewSpy).not.toHaveBeenCalled();
      });
    }
  }
  it('captures Save focus before deferred validation/review and restores it after cancellation or a failed confirmed save', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('existing'); fixture.detectChanges(); await fixture.whenStable();
    const validation = deferred<Awaited<ReturnType<NamedQueryApiService['validate']>>>();
    const reviewed = deferred<Awaited<ReturnType<NamedQueryApiService['reviewUpdate']>>>();
    spyOn(api, 'validate').and.returnValue(validation.promise);
    spyOn(api, 'reviewUpdate').and.returnValue(reviewed.promise);
    const save = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement;
    save.focus(); const saving = component.save(); fixture.detectChanges(); expect(save.disabled).toBeTrue();
    const oldTabindex = document.body.getAttribute('tabindex'); document.body.setAttribute('tabindex', '-1'); document.body.focus();
    validation.resolve({ valid: true, diagnostics: [] }); await new Promise(resolve => setTimeout(resolve, 0));
    reviewed.resolve({ required: true, changes: ['document'], usedBy: [], usageComplete: false, confirmation: 'bound' });
    await saving; fixture.detectChanges(); await fixture.whenStable();
    component.cancelSaveReview(); fixture.detectChanges(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(save.disabled).toBeFalse(); expect(document.activeElement).toBe(save);
    await component.save(); fixture.detectChanges(); await fixture.whenStable();
    const update = deferred<{ name: string }>(); spyOn(api, 'update').and.returnValue(update.promise);
    const confirming = component.confirmSaveReview(); fixture.detectChanges(); expect(save.disabled).toBeTrue();
    document.body.focus();
    await new Promise(resolve => setTimeout(resolve, 0)); expect(document.activeElement).not.toBe(save);
    update.reject(new Error('Save rejected')); await confirming; fixture.detectChanges(); await new Promise(resolve => setTimeout(resolve, 0));
    expect(component.error).toContain('Save rejected'); expect(save.disabled).toBeFalse(); expect(document.activeElement).toBe(save);
    if (oldTabindex === null) document.body.removeAttribute('tabindex'); else document.body.setAttribute('tabindex', oldTabindex);
  });
  for (const phase of ['create', 'update', 'validation'] as const) {
    it(`restores focus after deferred ordinary ${phase} failure with controls rendered`, async () => {
      const fixture = TestBed.createComponent(NamedQueryEditorComponent);
      const component = fixture.componentInstance;
      const api = TestBed.inject(NamedQueryApiService);
      fixture.detectChanges();
      await component.waitForInit();
      if (phase === 'create') {
        component.newQuery();
        component.draft.name = 'new-query';
        component.draft.collectionName = 'record';
      } else await component.openQuery('existing');
      fixture.detectChanges();
      const validation = deferred<Awaited<ReturnType<NamedQueryApiService['validate']>>>();
      spyOn(api, 'validate').and.returnValue(validation.promise);
      const write = deferred<{ name: string }>();
      const create = spyOn(api, 'create').and.returnValue(write.promise);
      const update = spyOn(api, 'update').and.returnValue(write.promise);
      const save = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement;
      save.focus();
      const saving = component.save();
      fixture.detectChanges();
      expect(save.disabled).toBeTrue();
      save.blur();
      await new Promise(yes => setTimeout(yes, 0));
      expect(document.activeElement).not.toBe(save);
      validation.resolve({
        valid: phase !== 'validation',
        diagnostics:
          phase === 'validation'
            ? [
                {
                  code: 'INVALID',
                  severity: 'error',
                  field: 'mongoQuery',
                  reason: 'Invalid current definition',
                  line: 0,
                  column: 0,
                },
              ]
            : [],
      });
      if (phase !== 'validation') {
        await new Promise(yes => setTimeout(yes, 0));
        expect(phase === 'create' ? create : update).toHaveBeenCalledTimes(1);
        expect(document.activeElement).not.toBe(save);
        write.reject(new Error('Rejected current definition'));
      }
      await saving;
      fixture.detectChanges();
      await new Promise(yes => setTimeout(yes, 0));
      expect(component.isEditing).toBeTrue();
      if (phase === 'validation') {
        expect(save.disabled).toBeFalse();
        expect(component.canSave).toBeFalse();
        expect(create).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        expect(document.activeElement).toBe(fixture.nativeElement.querySelector('#nq-save-blocker'));
      } else {
        expect(save.disabled).toBeFalse();
        expect(document.activeElement).toBe(save);
      }
      fixture.destroy();
    });
  }
  it('does not restore failed-save focus or write after destruction during validation', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('existing'); fixture.detectChanges();
    const validation = deferred<Awaited<ReturnType<NamedQueryApiService['validate']>>>();
    spyOn(api, 'validate').and.returnValue(validation.promise); const update = spyOn(api, 'update');
    const save = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement;
    save.focus(); const saving = component.save(); fixture.detectChanges(); const focus = spyOn(save, 'focus').and.callThrough();
    fixture.destroy(); validation.resolve({ valid: true, diagnostics: [] }); await saving; await new Promise(yes => setTimeout(yes, 0));
    expect(focus).not.toHaveBeenCalled(); expect(update).not.toHaveBeenCalled();
  });
  it('does not restore failed-save focus after a successful write while newer edits remain open', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('existing'); fixture.detectChanges();
    const write = deferred<{ name: string }>(); spyOn(api, 'update').and.returnValue(write.promise);
    const save = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement;
    save.focus(); const saving = component.save(); fixture.detectChanges(); save.blur();
    await new Promise(yes => setTimeout(yes, 0)); component.draft.description = 'Newer unsaved edit';
    const focus = spyOn(save, 'focus').and.callThrough(); write.resolve({ name: 'existing' });
    await saving; fixture.detectChanges(); await new Promise(yes => setTimeout(yes, 0));
    expect(component.isEditing).toBeTrue(); expect(focus).not.toHaveBeenCalled(); fixture.destroy();
  });
  it('does not restore success focus after destruction during the post-save catalogue refresh', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('existing'); fixture.detectChanges();
    const list = deferred<Awaited<ReturnType<NamedQueryApiService['list']>>>();
    spyOn(api, 'list').and.returnValue(list.promise); spyOn(api, 'update').and.resolveTo({ name: 'existing' });
    const save = fixture.nativeElement.querySelector('#named-query-save') as HTMLButtonElement;
    save.focus(); const saving = component.save(); fixture.detectChanges();
    await new Promise(yes => setTimeout(yes, 0));
    const close = spyOn(component, 'closeEditModal').and.callThrough();
    fixture.destroy(); list.resolve([]); await saving; await new Promise(yes => setTimeout(yes, 0));
    expect(close).not.toHaveBeenCalled();
  });
  it('uses a labelled editing region inside the portal main landmark', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    fixture.detectChanges(); await component.waitForInit(); component.newQuery(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('main')).toBeNull();
    expect(fixture.nativeElement.querySelector('.nq-workspace[aria-labelledby="named-query-workspace-title"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('#named-query-workspace-title')).not.toBeNull(); fixture.destroy();
  });
  it('ignores a database schema-target failure after successful GraphQL assistance', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    const targets = deferred<Awaited<ReturnType<NamedQueryApiService['schemaTargets']>>>();
    spyOn(api, 'schemaTargets').and.returnValue(targets.promise);
    fixture.detectChanges();
    await component.waitForInit();
    component.newQuery();
    component.assistanceError = 'Old database warning';
    component.error = 'Old database error';
    component.changeSource('graphql');
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(component.graphqlSdl).toBe('');
    expect(component.assistanceError).toBe('');
    expect(component.error).toBe('');
    targets.reject(new Error('Delayed database failure'));
    await new Promise(resolve => setTimeout(resolve, 0));
    fixture.detectChanges();
    expect(component.graphqlSdl).toBe('');
    expect(component.assistanceError).toBe('');
    expect(component.schemaError).toBe('');
    expect(fixture.nativeElement.textContent).not.toContain('Guidance unavailable');
  });
  it('ignores GraphQL schema errors after switching back to database assistance', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    const schema = deferred<Awaited<ReturnType<NamedQueryApiService['graphqlSchema']>>>();
    spyOn(api, 'graphqlSchema').and.returnValue(schema.promise);
    fixture.detectChanges(); await component.waitForInit(); component.newQuery(); component.changeSource('graphql');
    component.schemaError = 'Old GraphQL error'; component.changeSource('database');
    schema.reject(new Error('Delayed GraphQL failure')); await new Promise(resolve => setTimeout(resolve, 0)); fixture.detectChanges();
    expect(component.schemaLoading).toBeFalse(); expect(component.schemaError).toBe(''); expect(component.assistanceError).toBe('');
  });
  it('requires review again when a draft changes, and uses only the acknowledgement for the accepted draft', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance; const api = TestBed.inject(NamedQueryApiService);
    const update = spyOn(api, 'update').and.resolveTo({ name: 'existing' });
    const review = spyOn(api, 'reviewUpdate').and.resolveTo({ required: true, changes: ['parameters'], usedBy: [], usageComplete: false, confirmation: 'first' });
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('existing');
    component.draft.description = 'first'; await component.save(); expect(component.pendingReview).not.toBeNull();
    component.draft.description = 'second'; component.draftChanged(); await component.confirmSaveReview(); expect(update).not.toHaveBeenCalled(); expect(component.error).toContain('draft changed');
    review.and.resolveTo({ required: true, changes: ['parameters'], usedBy: [], usageComplete: false, confirmation: 'second' });
    await component.save(); await component.confirmSaveReview(); expect(update.calls.mostRecent().args[2]).toBe('second'); expect(component.isEditing).toBeFalse();
  });
  it('keeps schema-drifted definitions editable, displays capability reasons and retains a failed preview draft', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance; const api = TestBed.inject(NamedQueryApiService);
    spyOn(api, 'get').and.resolveTo(graphqlDraft('stale'));
    const diagnostic = { code: 'DUPLICATE_PARAMETER', field: 'graphql.variables.search', reason: 'Use a unique consumer parameter distinct from transport and server paging names.', severity: 'error' as const, line: 0, column: 0 };
    spyOn(api, 'describe').and.resolveTo({ source: 'graphql', valid: false, diagnostics: [diagnostic], parameters: [], operationVariables: [], result: { recordType: '', stage: '', precision: 'none', completeness: 'unavailable', fields: [] } });
    spyOn(api, 'preview').and.rejectWith({ error: { errors: [{ detail: 'COLLECTION_LIMIT' }] } });
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('stale'); await component.validateDraft(); fixture.detectChanges();
    expect(component.canSave).toBeFalse(); expect(fixture.nativeElement.textContent).toContain(diagnostic.reason);
    expect(fixture.nativeElement.textContent).not.toContain('named-query-diagnostic-location');
    const snapshot = JSON.stringify(component.draft); await component.preview(); expect(component.error).toContain('COLLECTION_LIMIT'); expect(JSON.stringify(component.draft)).toBe(snapshot);
  });
  it('shows valid nonlookup capability separately from saving and never executes on validation', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance; const api = TestBed.inject(NamedQueryApiService);
    spyOn(api, 'get').and.resolveTo(graphqlDraft());
    spyOn(api, 'describe').and.resolveTo({ source: 'graphql', valid: true, diagnostics: [], parameters: [], operationVariables: [], result: { recordType: '', stage: '', precision: 'none', completeness: 'unavailable', fields: [] }, capabilities: { lookup: false, diagnostics: [{ code: 'LOOKUP_MAPPING', field: 'graphql.mappings.title', reason: 'Provide a lookup label.', severity: 'warning', line: 0, column: 0 }] } });
    const preview = spyOn(api, 'preview'); const update = spyOn(api, 'update').and.resolveTo({ name: 'gql' });
    fixture.detectChanges(); await component.waitForInit(); await component.openQuery('gql'); await component.validateDraft(); fixture.detectChanges();
    expect(component.canSave).toBeTrue(); expect(fixture.nativeElement.textContent).toContain('nq-ux-checks-passed');
    expect(component.capabilities?.lookup).toBeFalse();
    expect(fixture.nativeElement.textContent).not.toContain('Provide a lookup label.');
    expect(fixture.nativeElement.querySelector('.nq-workspace.rb-ws')).toBeNull();
    expect(preview).not.toHaveBeenCalled(); await component.save(); expect(update).toHaveBeenCalled();
  });
  it('uses one caller-scoped description for GraphQL checks and ignores a stale response', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    fixture.detectChanges(); await component.waitForInit(); component.newQuery(); component.changeSource('graphql');
    const validate = spyOn(api, 'validate').and.callThrough();
    const pending = deferred<Awaited<ReturnType<NamedQueryApiService['describe']>>>();
    const describe = spyOn(api, 'describe').and.returnValue(pending.promise);
    const validating = component.validateDraft();
    expect(describe).toHaveBeenCalledTimes(1); expect(validate).not.toHaveBeenCalled();
    component.changeSource('database');
    pending.resolve({ source: 'graphql', valid: false, diagnostics: [{code: 'GRAPHQL_SCHEMA', field: 'graphql.document', severity: 'error', reason: 'Old source', line: 0, column: 0}], parameters: [], operationVariables: [], result: { recordType: '', stage: '', precision: 'none', completeness: 'unavailable', fields: [] } });
    await validating;
    expect(component.description).toBeNull(); expect(component.diagnostics).toEqual([]);
    fixture.destroy();
  });
  it('keeps malformed GraphQL preview input blocked after a rendered binding default edit until corrected', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService); const preview = spyOn(api, 'preview').and.callThrough();
    fixture.detectChanges(); await component.waitForInit(); component.newQuery(); component.changeSource('graphql');
    Object.assign(component.activeGraphqlBuffer.graphql, graphqlDraft().graphql); component.draftChanged(); fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(GraphqlDraftEditorComponent)).componentInstance as GraphqlDraftEditorComponent;
    editor.tab = 'variables'; fixture.detectChanges(); await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('.nq-test-parameters textarea') as HTMLTextAreaElement;
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(button => button.textContent?.includes('named-query-preview'))!;
    input.value = '"last valid"'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    input.value = '{unfinished'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(component.testParameters['search']).toBe('last valid'); expect(component.previewInputInvalid).toBeTrue();
    const defaultInput = fixture.debugElement.queryAll(By.directive(GraphqlJsonInputComponent))
      .find(node => node.componentInstance.label === 'named-query-graphql-default')!.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    defaultInput.value = '"new default"'; defaultInput.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.nq-test-parameters textarea')).toBe(input);
    expect(input.value).toBe('{unfinished'); expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(component.previewInputInvalid).toBeTrue(); expect(button.disabled).toBeTrue();
    const type = fixture.nativeElement.querySelector('#nq-type-search') as HTMLInputElement;
    type.value = 'String!'; type.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.nq-test-parameters textarea')).toBe(input);
    expect(input.value).toBe('{unfinished'); expect(component.previewInputInvalid).toBeTrue(); expect(button.disabled).toBeTrue();
    button.click(); await component.preview(); expect(preview).not.toHaveBeenCalled();
    input.value = '"corrected"'; input.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(component.previewInputInvalid).toBeFalse(); expect(button.disabled).toBeFalse();
    button.click(); await fixture.whenStable();
    expect(preview).toHaveBeenCalledTimes(1); expect(preview.calls.mostRecent().args[0].parameters).toEqual({ search: 'corrected' });
  });
  for (const transition of ['name', 'ownership', 'source'])
    it(`clears invalid GraphQL preview state when the ${transition} transition removes its control`, async () => {
      const fixture = TestBed.createComponent(NamedQueryEditorComponent);
      const component = fixture.componentInstance;
      fixture.detectChanges();
      await component.waitForInit();
      component.newQuery();
      component.changeSource('graphql');
      Object.assign(component.activeGraphqlBuffer.graphql, graphqlDraft().graphql);
      component.draftChanged();
      fixture.detectChanges();
      const editor = fixture.debugElement.query(By.directive(GraphqlDraftEditorComponent))
        .componentInstance as GraphqlDraftEditorComponent;
      editor.tab = 'variables';
      fixture.detectChanges();
      await fixture.whenStable();
      const input = fixture.nativeElement.querySelector('.nq-test-parameters textarea') as HTMLTextAreaElement;
      input.value = '"last valid"';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      input.value = '{unfinished';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      expect(component.previewInputInvalid).toBeTrue();
      if (transition === 'name') {
        const name = fixture.nativeElement.querySelector('#nq-parameter-search') as HTMLInputElement;
        name.value = 'renamed';
        name.dispatchEvent(new Event('input', { bubbles: true }));
        fixture.detectChanges();
      } else if (transition === 'ownership') {
        const owner = fixture.nativeElement.querySelector('#nq-owner-search') as HTMLSelectElement;
        owner.value = 'fixed';
        owner.dispatchEvent(new Event('change', { bubbles: true }));
        fixture.detectChanges();
        expect(component.previewInputInvalid).toBeFalse();
        owner.value = 'consumer';
        owner.dispatchEvent(new Event('change', { bubbles: true }));
        fixture.detectChanges();
      } else {
        component.databaseBuffer.queryParams = { search: { type: 'string', path: 'search', whenUndefined: 'ignore' } };
        component.changeSource('database');
        fixture.detectChanges();
        expect(component.previewInputInvalid).toBeFalse();
        component.changeSource('graphql');
        fixture.detectChanges();
      }
      await fixture.whenStable();
      fixture.detectChanges();
      expect(input.isConnected).toBeFalse();
      const current = fixture.nativeElement.querySelector('.nq-test-parameters textarea') as HTMLTextAreaElement;
      expect(current).not.toBe(input);
      expect(current.value).toBe('');
      expect(current.getAttribute('aria-invalid')).toBe('false');
      expect(component.previewInputInvalid).toBeFalse();
      expect(component.testParameters).toEqual({});
    });
  for (const transition of ['parse failure', 'missing operation', 'removed declaration'])
    it(`reconciles default validity after ${transition} destroys and recreates its GraphQL control`, async () => {
      const fixture = TestBed.createComponent(NamedQueryEditorComponent);
      const component = fixture.componentInstance;
      const api = TestBed.inject(NamedQueryApiService);
      const preview = spyOn(api, 'preview').and.callThrough();
      fixture.detectChanges();
      await component.waitForInit();
      component.newQuery();
      component.draft.name = 'lifecycle';
      component.changeSource('graphql');
      Object.assign(component.activeGraphqlBuffer.graphql, graphqlDraft().graphql);
      component.draftChanged();
      fixture.detectChanges();
      const editor = fixture.debugElement.query(By.directive(GraphqlDraftEditorComponent))
        .componentInstance as GraphqlDraftEditorComponent;
      editor.tab = 'variables';
      editor.setDefault('search', 'stored default');
      fixture.detectChanges();
      await fixture.whenStable();
      const defaultInput = () =>
        fixture.debugElement
          .queryAll(By.directive(GraphqlJsonInputComponent))
          .find(node => node.componentInstance.label === 'named-query-graphql-default')
          ?.nativeElement.querySelector('textarea') as HTMLTextAreaElement | undefined;
      const input = defaultInput()!;
      const test = fixture.nativeElement.querySelector('.nq-test-parameters textarea') as HTMLTextAreaElement;
      test.value = '"current search"';
      test.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      input.value = '{unfinished';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      expect(component.pendingInput).toBeTrue();
      await component.preview();
      expect(preview).not.toHaveBeenCalled();
      editor.tab = 'document';
      fixture.detectChanges();
      const document = fixture.nativeElement.querySelector('#nq-graphql-document') as HTMLTextAreaElement;
      const operation = fixture.nativeElement.querySelector('#nq-graphql-operation') as HTMLInputElement;
      const original = component.activeGraphqlBuffer.graphql.document;
      if (transition === 'missing operation') {
        operation.value = 'Missing';
        operation.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.value =
          transition === 'parse failure' ? 'query Q(' : 'query Q { records(recordType: "rdmp") { nodes { oid } } }';
        document.dispatchEvent(new Event('input', { bubbles: true }));
      }
      fixture.detectChanges();
      await fixture.whenStable();
      expect(input.isConnected).toBeFalse();
      expect(defaultInput()).toBeUndefined();
      if (transition === 'missing operation') {
        operation.value = '';
        operation.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        document.value = original;
        document.dispatchEvent(new Event('input', { bubbles: true }));
      }
      fixture.detectChanges();
      await fixture.whenStable();
      editor.tab = 'variables';
      fixture.detectChanges();
      const current = defaultInput()!;
      expect(current).not.toBe(input);
      expect(current.value).toBe('"stored default"');
      expect(current.getAttribute('aria-invalid')).toBe('false');
      expect(fixture.nativeElement.querySelectorAll('nq-graphql-draft-editor [aria-invalid="true"]').length).toBe(0);
      expect(component.pendingInput).toBeFalse();
      expect(component.canSave).toBeTrue();
      expect(component.previewInputInvalid).toBeFalse();
      const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>).find(
        button => button.textContent?.includes('named-query-preview')
      )!;
      expect(button.disabled).toBeFalse();
      expect(preview).not.toHaveBeenCalled();
      button.click();
      await fixture.whenStable();
      expect(preview).toHaveBeenCalledTimes(1);
      const request = preview.calls.mostRecent().args[0];
      expect(request.definition).toEqual(
        jasmine.objectContaining({
          graphql: jasmine.objectContaining({
            document: original,
            variables: jasmine.objectContaining({
              search: jasmine.objectContaining({ defaultValue: JSON.parse(current.value) }),
            }),
          }),
        })
      );
      expect(request.parameters).toEqual({ search: JSON.parse(test.value) });
    });
  it('retains other mounted GraphQL JSON errors across document, operation, source and ownership changes', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService); const preview = spyOn(api, 'preview').and.callThrough();
    fixture.detectChanges(); await component.waitForInit(); component.newQuery(); component.draft.name = 'mounted'; component.changeSource('graphql');
    Object.assign(component.activeGraphqlBuffer.graphql, graphqlDraft().graphql); component.draftChanged(); fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(GraphqlDraftEditorComponent)).componentInstance as GraphqlDraftEditorComponent;
    editor.tab = 'mappings'; fixture.detectChanges();
    editor.tab = 'variables'; fixture.detectChanges(); await fixture.whenStable();
    const path = fixture.debugElement.queryAll(By.directive(GraphqlJsonInputComponent))
      .find(node => node.componentInstance.label === 'named-query-graphql-result-path')!.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    const input = fixture.debugElement.queryAll(By.directive(GraphqlJsonInputComponent))
      .find(node => node.componentInstance.label === 'named-query-graphql-default')!.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    for (const control of [path, input]) { control.value = '{unfinished'; control.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges(); }
    const document = fixture.nativeElement.querySelector('#nq-graphql-document') as HTMLTextAreaElement;
    const operation = fixture.nativeElement.querySelector('#nq-graphql-operation') as HTMLInputElement;
    const original = component.activeGraphqlBuffer.graphql.document;
    // Selecting the same declared variable retains the invalid default control.
    operation.value = 'Q'; operation.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    document.value = original + ' query Other($search: String) { records(recordType: $search) { nodes { oid } } }';
    document.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    operation.value = 'Other'; operation.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(input.isConnected).toBeTrue(); expect(input.value).toBe('{unfinished'); expect(component.pendingInput).toBeTrue();
    component.changeSource('database'); fixture.detectChanges(); expect(component.pendingInput).toBeFalse();
    expect(input.isConnected).toBeTrue(); expect(input.getAttribute('aria-invalid')).toBe('true');
    component.changeSource('graphql'); fixture.detectChanges(); expect(component.pendingInput).toBeTrue();
    expect(input.isConnected).toBeTrue(); expect(input.value).toBe('{unfinished');
    document.value = 'query('; document.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(input.isConnected).toBeFalse(); expect(path.isConnected).toBeTrue(); expect(component.pendingInput).toBeTrue();
    document.value = original; document.dispatchEvent(new Event('input', { bubbles: true }));
    operation.value = ''; operation.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    component.changeSource('database'); fixture.detectChanges(); expect(component.pendingInput).toBeFalse();
    component.changeSource('graphql'); fixture.detectChanges(); expect(component.pendingInput).toBeTrue();
    const owner = fixture.nativeElement.querySelector('#nq-owner-search') as HTMLSelectElement;
    owner.value = 'fixed'; owner.dispatchEvent(new Event('change', { bubbles: true })); fixture.detectChanges();
    expect(path.isConnected).toBeTrue(); expect(path.value).toBe('{unfinished'); expect(path.getAttribute('aria-invalid')).toBe('true');
    expect(component.pendingInput).toBeTrue(); expect(component.previewInputInvalid).toBeTrue();
    await component.preview(); expect(preview).not.toHaveBeenCalled();
    path.value = '["records", "nodes"]'; path.dispatchEvent(new Event('input', { bubbles: true })); fixture.detectChanges();
    expect(component.pendingInput).toBeFalse(); expect(component.previewInputInvalid).toBeFalse();
  });
  it('lists invalid catalogue rows safely without treating their source as a database query', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent); const component = fixture.componentInstance; const api = TestBed.inject(NamedQueryApiService);
    spyOn(api, 'list').and.resolveTo([{ name: 'damaged', source: { untrusted: true }, valid: false, diagnostics: [] }]);
    const get = spyOn(api, 'get'); fixture.detectChanges(); await component.waitForInit(); fixture.detectChanges();
    expect(component.uniqueCollections).toBe(0); expect(fixture.nativeElement.textContent).toContain('named-query-invalid-source');
    await component.openQuery('damaged'); expect(get).not.toHaveBeenCalled();
  });

  it('creates and initializes', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    expect(component).toBeTruthy();
    expect(component.queries).toEqual([]);
  });

  it('loads supported collections on init', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    expect(component.collections).toEqual(['record', 'user']);
  });

  it('keeps a legacy collection value selectable in the detail dropdown', () => {
    const detail = new NqDetailComponent();
    detail.collections = ['record', 'user'];
    detail.draft = {
      name: 'q',
      collectionName: 'legacyCollection',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    expect(detail.collectionOptions).toEqual(['legacyCollection', 'record', 'user']);
  });

  it('computes totalQueries and uniqueCollections', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'list').and.resolveTo([
      { name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'q2', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'q3', collectionName: 'c2', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    expect(component.totalQueries).toBe(3);
    expect(component.uniqueCollections).toBe(2);
  });

  it('combines collection segments with search and keeps all collection choices', () => {
    const component = TestBed.createComponent(NamedQueryEditorComponent).componentInstance;
    component.queries = [
      { name: 'alpha', collectionName: 'record' },
      { name: 'beta', collectionName: 'user' },
      { name: 'gamma', collectionName: 'record' }
    ] as any;
    component.onListQueryChanged({ searchTerm: 'a', collection: 'record' });
    expect(component.filteredQueries.map(q => q.name)).toEqual(['alpha', 'gamma']);
    expect(component.presentCollections).toEqual(['record', 'user']);
    component.onListQueryChanged({ searchTerm: '', collection: 'user' });
    expect(component.filteredQueries.map(q => q.name)).toEqual(['beta']);
    component.onListQueryChanged({ searchTerm: '' });
    expect(component.filteredQueries.length).toBe(3);
  });

  it('filters queries by search term', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'list').and.resolveTo([
      { name: 'alpha', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'beta', collectionName: 'c2', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    component.onListQueryChanged({ searchTerm: 'alp' });
    expect(component.filteredQueries.length).toBe(1);
    expect(component.filteredQueries[0].name).toBe('alpha');

    component.onListQueryChanged({ searchTerm: '' });
    expect(component.filteredQueries.length).toBe(2);
  });

  it('opens new query workspace', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.newQuery();
    expect(component.isNew).toBeTrue();
    expect(component.isEditing).toBeTrue();
    expect(component.draft.name).toBe('');
  });

  it('canSave requires collection name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isEditing = true;
    component.isNew = true;
    component.draft = { name: '', collectionName: '', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    expect(component.canSave).toBeFalse();

    component.draft.name = 'new-query';
    expect(component.canSave).toBeFalse();

    component.draft.collectionName = 'records';
    expect(component.canSave).toBeTrue();
  });

  it('canSave requires URL-safe name for new queries', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isEditing = true;
    component.isNew = true;
    component.draft = {
      name: 'foo/bar',
      collectionName: 'records',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    expect(component.canSave).toBeFalse();

    component.draft.name = 'valid_name-123';
    expect(component.canSave).toBeTrue();
  });

  it('opens existing query', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'get').and.resolveTo({
      name: 'existing',
      collectionName: 'c1',
      mongoQuery: { a: 1 },
      queryParams: { p: { type: 'string', path: 'path', whenUndefined: 'ignore' } },
      resultObjectMapping: { r: 'v' },
    });

    fixture.detectChanges();
    await component.waitForInit();
    await component.openQuery('existing');

    expect(component.isNew).toBeFalse();
    expect(component.draft.name).toBe('existing');
    expect(component.isEditing).toBeTrue();
  });

  it('shows error when opening query fails', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'get').and.rejectWith(new Error('Not found'));

    fixture.detectChanges();
    await component.waitForInit();
    await component.openQuery('missing');

    expect(component.error).toContain('Not found');
  });

  it('creates a new query on save', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    const createSpy = spyOn(api, 'create').and.resolveTo({ name: 'new-query' });
    spyOn(api, 'list').and.resolveTo([
      { name: 'new-query', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    component.newQuery();
    component.draft.name = 'new-query';
    component.draft.collectionName = 'records';
    await component.save();

    expect(createSpy).toHaveBeenCalled();
    expect(component.message).toContain('new-query');
    expect(component.isEditing).toBeFalse();
  });

  it('updates an existing query on save', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    const updateSpy = spyOn(api, 'update').and.resolveTo({ name: 'existing' });
    spyOn(api, 'list').and.resolveTo([
      { name: 'existing', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = false;
    component.isEditing = true;
    component.draft = {
      name: 'existing',
      collectionName: 'records',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    await component.save();

    expect(updateSpy).toHaveBeenCalledWith('existing', jasmine.any(Object), undefined);
    expect(component.message).toContain('existing');
  });

  it('shows validation error when saving without required fields', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = true;
    component.isEditing = true;
    component.draft = { name: '', collectionName: '', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    await component.save();

    expect(component.error).toBe('named-query-error-name-required');
  });

  it('shows validation error when saving with reserved name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = true;
    component.isEditing = true;
    component.draft = {
      name: 'collections',
      collectionName: 'records',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    await component.save();

    expect(component.error).toContain('reserved');
  });

  it('shows validation error when saving with invalid name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = true;
    component.isEditing = true;
    component.draft = {
      name: 'foo/bar',
      collectionName: 'records',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    await component.save();

    expect(component.error).toBe('named-query-error-name-invalid');
  });

  it('shows backend error on save failure', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'create').and.rejectWith(new Error('Conflict'));

    fixture.detectChanges();
    await component.waitForInit();

    component.newQuery();
    component.draft.name = 'dup';
    component.draft.collectionName = 'records';
    await component.save();

    expect(component.error).toContain('Conflict');
  });

  it('opens and cancels delete modal without deleting', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    const deleteSpy = spyOn(api, 'delete').and.callThrough();

    fixture.detectChanges();
    await component.waitForInit();

    component.requestDelete('q1');
    expect(component.isDeleteModalOpen).toBeTrue();
    expect(component.pendingDeleteName).toBe('q1');

    component.cancelDelete();
    expect(component.isDeleteModalOpen).toBeFalse();
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('deletes query when confirmed', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    const deleteSpy = spyOn(api, 'delete').and.resolveTo({ name: 'q1' });
    spyOn(api, 'list').and.resolveTo([]);

    fixture.detectChanges();
    await component.waitForInit();

    component.requestDelete('q1');
    await component.confirmDelete();

    expect(deleteSpy).toHaveBeenCalledWith('q1');
    expect(component.message).toContain('q1');
    expect(component.isDeleteModalOpen).toBeFalse();
  });

  it('closes workspace if deleted query was selected', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'delete').and.resolveTo({ name: 'q1' });
    spyOn(api, 'list').and.resolveTo([]);

    fixture.detectChanges();
    await component.waitForInit();

    component.selectedQuery = {
      name: 'q1',
      collectionName: 'c',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    component.isEditing = true;
    component.requestDelete('q1');
    await component.confirmDelete();

    expect(component.isEditing).toBeFalse();
    expect(component.selectedQuery).toBeNull();
  });

  it('shows error when delete fails', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'delete').and.rejectWith(new Error('Forbidden'));

    fixture.detectChanges();
    await component.waitForInit();

    component.requestDelete('q1');
    await component.confirmDelete();

    expect(component.error).toContain('Forbidden');
  });

  it('restores focus after confirming deletion', fakeAsync(() => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'delete').and.resolveTo({ name: 'q1' });
    spyOn(api, 'list').and.resolveTo([]);

    fixture.detectChanges();

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const activeElementSpy = spyOnProperty(document, 'activeElement', 'get').and.returnValue(trigger);
    const focusSpy = spyOn(trigger, 'focus');

    component.requestDelete('q1');
    component.confirmDelete();
    flushMicrotasks();
    tick();

    expect(focusSpy).toHaveBeenCalled();

    activeElementSpy.and.callThrough();
    document.body.removeChild(trigger);
  }));

  it('auto-clears message after timeout', async () => {
    jasmine.clock().install();
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;

    fixture.detectChanges();
    await component.waitForInit();

    component.newQuery();
    component.draft.name = 'test';
    component.draft.collectionName = 'c';

    const api = TestBed.inject(NamedQueryApiService);
    spyOn(api, 'create').and.resolveTo({ name: 'test' });
    spyOn(api, 'list').and.resolveTo([]);
    await component.save();

    expect(component.message).toBeTruthy();
    jasmine.clock().tick(5001);
    expect(component.message).toBe('');
    jasmine.clock().uninstall();
  });

  it('clears message timer on ngOnDestroy', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.message = 'hello';
    (component as any).messageTimer = setTimeout(() => {}, 1000);
    component.ngOnDestroy();
    expect((component as any).messageTimer).toBeNull();
  });

  it('does nothing when requestDelete is called with empty name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.requestDelete('');
    expect(component.isDeleteModalOpen).toBeFalse();
  });

  it('closes workspace', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isEditing = true;
    component.closeEditModal();
    expect(component.isEditing).toBeFalse();
  });

  it('returns pendingDeleteDisplayName', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    expect(component.pendingDeleteDisplayName).toBe('');
    component.pendingDeleteName = 'test';
    expect(component.pendingDeleteDisplayName).toBe('test');
  });

  it('computes uniqueCollections ignoring undefined names', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'list').and.resolveTo([
      { name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'q2', collectionName: undefined as any, mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'q3', collectionName: '', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    expect(component.uniqueCollections).toBe(1);
  });

  it('canSave is false when workspace is closed', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isEditing = false;
    component.isNew = true;
    component.draft = {
      name: 'test',
      collectionName: 'records',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    expect(component.canSave).toBeFalse();
  });

  it('shows collection required when saving existing without collection', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = false;
    component.isEditing = true;
    component.draft = {
      name: 'existing',
      collectionName: '',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    await component.save();

    expect(component.error).toBe('named-query-error-collection-required');
  });

  it('filters by collection name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'list').and.resolveTo([
      { name: 'alpha', collectionName: 'special', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'beta', collectionName: 'normal', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    component.onListQueryChanged({ searchTerm: 'special' });
    expect(component.filteredQueries.length).toBe(1);
    expect(component.filteredQueries[0].name).toBe('alpha');
  });

  it('does nothing when confirming delete with no pending name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.pendingDeleteName = null;
    await component.confirmDelete();
    expect(component.isDeleteModalOpen).toBeFalse();
  });

  it('clones query with undefined nested properties', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    const result = (component as any).cloneQuery({
      name: 'q',
      collectionName: 'c',
      mongoQuery: undefined,
      queryParams: undefined,
      resultObjectMapping: undefined,
      sort: undefined,
      relatedRecordFilters: undefined,
    });
    expect(result.mongoQuery).toEqual({});
    expect(result.queryParams).toEqual({});
    expect(result.resultObjectMapping).toEqual({});
    expect(result.sort).toEqual([]);
    expect(result.relatedRecordFilters).toEqual([]);
  });

  it('sanitizes query with empty optional fields', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    const result = (component as any).sanitizeQuery({
      name: '',
      collectionName: '',
      mongoQuery: undefined,
      queryParams: undefined,
      resultObjectMapping: undefined,
      sort: [],
      expandRelations: true,
      relatedRecordFilters: [],
    });
    expect(result.name).toBeUndefined();
    expect(result.collectionName).toBe('');
    expect(result.brandIdFieldPath).toBeUndefined();
    expect(result.mongoQuery).toEqual({});
    expect(result.queryParams).toEqual({});
    expect(result.resultObjectMapping).toEqual({});
    expect(result.sort).toBeUndefined();
    expect(result.expandRelations).toBeTrue();
    expect(result.relatedRecordFilters).toBeUndefined();
  });

  it('clears existing timer when setting a new message', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    const clearSpy = spyOn(globalThis, 'clearTimeout');
    (component as any).messageTimer = 123 as any;
    (component as any).setMessage('hello');
    expect(clearSpy).toHaveBeenCalledWith(123);
  });

  it('handles non-HTMLElement activeElement', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    const body = document.body;
    spyOnProperty(document, 'activeElement', 'get').and.returnValue(body);
    component.newQuery();
    expect((component as any).editModalTrigger).toBe(body);
  });

  it('does not restore edit trigger when null', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    (component as any).editModalTrigger = null;
    component.closeEditModal();
    expect(component.isEditing).toBeFalse();
  });

  it('does not restore edit trigger when removed from DOM', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    const el = document.createElement('button');
    (component as any).editModalTrigger = el;
    const focusSpy = spyOn(el, 'focus');
    component.closeEditModal();
    expect(focusSpy).not.toHaveBeenCalled();
  });

  it('extracts nested error message', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    const msg = (component as any).asErrorMessage({ error: { message: 'nested' } });
    expect(msg).toBe('nested');
  });
  it('warns that external API callers are untracked when no configured consumer uses the query', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    component.queries = [{ name: 'unused', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {}, usedBy: [] }];
    component.requestDelete('unused');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="alertdialog"]');
    expect(dialog.querySelector('[data-testid="untracked-callers-note"]').textContent).toContain('named-query-untracked-callers-note');
    expect(dialog.querySelector('.rb-admin-danger-confirm').disabled).toBeFalse();
    fixture.destroy();
  });

  it('lists consumers in the delete dialog and prevents deletion of an in-use query', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    const remove = spyOn(TestBed.inject(NamedQueryApiService), 'delete');
    component.queries = [{ name: 'query', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {},
      usedBy: [{ type: 'report', name: 'List RDMP records', path: '/admin/report/rdmpRecords' }] }];
    component.requestDelete('query');
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('[role="alertdialog"]');
    expect(dialog.textContent).toContain('named-query-in-use-warning');
    expect(dialog.querySelector('a').textContent).toContain('List RDMP records');
    expect(dialog.querySelector('[data-testid="untracked-callers-note"]')).toBeNull();
    expect(dialog.querySelector('.rb-admin-danger-confirm').disabled).toBeTrue();
    await component.confirmDelete();
    expect(remove).not.toHaveBeenCalled();
    expect(component.isDeleteModalOpen).toBeTrue();
    component.cancelDelete();
  });

  it('shows the server explanation if a new reference blocks a stale-list deletion', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);
    spyOn(api, 'delete').and.rejectWith({ message: 'Http failure response', error: {
      errors: [{ detail: 'Named query is in use. Remove its configured references before deleting it.' }]
    } });
    fixture.detectChanges();
    await component.waitForInit();
    component.requestDelete('query');
    await component.confirmDelete();
    expect(component.error).toContain('Remove its configured references');
  });

  it('omits an empty named-query table and clears filters including a pending search', fakeAsync(() => {
    const fixture = TestBed.createComponent(NqListComponent);
    const list = fixture.componentInstance;
    list.query = { searchTerm: 'missing', collection: 'record' };
    list.searchTerm = 'missing';
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('thead')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('admin-no-filter-results');
    const changed = spyOn(list.queryChanged, 'emit');
    list.onSearchTermChanged('pending');
    fixture.nativeElement.querySelector('.rb-admin-empty button').click();
    tick(300);
    expect(changed).toHaveBeenCalledOnceWith({ searchTerm: '', collection: '' });
    fixture.destroy();
  }));

  it('blocks dismissal while saving and retains the workspace after failure', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    component.newQuery();
    component.draft = {
      name: 'pending',
      collectionName: 'record',
      mongoQuery: {},
      queryParams: {},
      resultObjectMapping: {},
    };
    let reject!: (error: Error) => void;
    const create = spyOn(TestBed.inject(NamedQueryApiService), 'create').and.returnValue(
      new Promise((_, fail) => (reject = fail))
    );
    const pending = component.save();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(component.saving).toBeTrue();
    expect(component.canSave).toBeFalse();
    component.closeEditModal();
    expect(component.isEditing).toBeTrue();
    reject(new Error('Save rejected'));
    await pending;
    expect(create).toHaveBeenCalledTimes(1);
    expect(component.saving).toBeFalse();
    expect(component.isEditing).toBeTrue();
    expect(component.error).toContain('Save rejected');
  });
  it('opens the create chooser without discarding the list or choosing a database source', async () => {
    const f = TestBed.createComponent(NamedQueryEditorComponent);
    f.detectChanges();
    await f.componentInstance.waitForInit();
    f.nativeElement.querySelector('#named-query-create').click();
    f.detectChanges();
    expect(f.componentInstance.chooserOpen).toBeTrue();
    expect(f.componentInstance.isEditing).toBeFalse();
    f.destroy();
  });
  for (const state of ['linked', 'changed', 'missing', 'handwritten']) it(`renders the ${state} source safely and loads schema only on demand`, async () => {
      const f = TestBed.createComponent(NamedQueryEditorComponent);
      const c = f.componentInstance;
      const api = TestBed.inject(NamedQueryApiService);
      const draft = graphqlDraft('plans') as import('./named-query-api.service').NamedQueryDefinition;
      if (draft.source === 'graphql' && state !== 'handwritten')
        draft.sourceSavedQuery = {
          id: 'a'.repeat(24),
          publishedRevision: 1,
          revision: 2,
          name: state === 'missing' ? null : 'Research plans',
          recordType: null,
          recordTypeLabel: 'Research plans',
          mode: 'graphql',
          updatedAt: '2026-11-11T12:00:00.000Z',
          updatedBy: { username: 'admin', displayName: 'Local Admin' },
          missing: state === 'missing',
          changedSincePublished: state === 'changed',
        };
      spyOn(api, 'get').and.resolveTo(draft);
      const schema = spyOn(api, 'graphqlSchema').and.callThrough();
      f.detectChanges();
      await c.waitForInit();
      await c.openQuery('plans');
      await c.loadGraphqlPresentation();
      f.detectChanges();
      const source = f.nativeElement.querySelector('#nq-section-source') as HTMLElement;
      expect(schema).not.toHaveBeenCalled();
      expect(source.textContent).not.toContain('graphql.variables');
      expect(source.textContent).not.toContain('Blocking error');
      const crumbs = f.nativeElement.querySelectorAll('.nq-graphql-workspace .rb-admin-crumbs a');
      expect(crumbs[1].getAttribute('href')).toContain('/admin/named-query');
      expect(f.nativeElement.querySelector('.nq-graphql-workspace .rb-admin-crumbs button')).toBeNull();
      expect(f.nativeElement.querySelector('.nq-workspace.rb-ws')).toBeNull();
      expect(source.querySelector('select option[value="database"]')).toBeNull();
      if (state === 'handwritten') {
        expect(source.querySelector('#nq-graphql-document')?.hasAttribute('readonly')).toBeFalse();
        expect(f.nativeElement.querySelector('#nq-section-basics select option[value="database"]')).not.toBeNull();
      }
      else {
        expect(source.querySelector('nq-graphql-draft-editor')).toBeNull();
        expect(source.querySelector('textarea')?.readOnly).toBeTrue();
        expect(f.nativeElement.querySelector('#nq-section-basics select option[value="database"]')).toBeNull();
        if (state !== 'missing') expect(source.textContent).toContain('nq-ux-updated-by');
      }
      if (state === 'missing') expect(source.textContent).toContain('nq-ux-source-missing-help');
      if (state === 'changed') expect(source.textContent).toContain('nq-ux-review-update');
      expect(f.nativeElement.querySelector('.rb-admin-save-bar')).not.toBeNull();
      f.destroy();
    });
  it('prepares saved values as fixed bindings, retains false/zero and keeps the exact source revision', async () => {
    const f = TestBed.createComponent(NamedQueryEditorComponent);
    const c = f.componentInstance;
    f.detectChanges();
    await c.waitForInit();
    await c.chooseSavedSource({
      summary: {
        id: 'a'.repeat(24),
        revision: 4,
        name: 'active research plans',
        recordType: null,
        recordTypeLabel: null,
        mode: 'graphql',
        updatedAt: null,
        updatedBy: null,
        publishedAs: [],
      },
      prepared: {
        definition: {
          source: 'graphql',
          graphql: {
            document: 'query Q($flag:Boolean,$count:Int){records(recordType:"rdmp",first:$count){nodes{oid}}}',
            variables: {},
            resultPath: ['records', 'nodes'],
            provenance: { explorerId: 'a'.repeat(24), explorerRevision: 4, explorerPortal: 'rdmp' },
          },
        },
        variableValues: { flag: false, count: 0 },
      },
    });
    expect(JSON.stringify(c.activeGraphqlBuffer.graphql.variables['flag'])).toBe(
      JSON.stringify({ ownership: 'fixed', value: false })
    );
    expect(JSON.stringify(c.activeGraphqlBuffer.graphql.variables['count'])).toBe(
      JSON.stringify({ ownership: 'fixed', value: 0 })
    );
    expect(c.activeGraphqlBuffer.name).toBe('active_research_plans');
    expect(c.linkedSource?.publishedRevision).toBe(4);
    expect(c.dirty).toBeTrue();
    expect(c.isNew).toBeTrue();
    f.destroy();
  });
  it('updates fixed source values while retaining compatible consumer contracts and mappings', async () => {
    const f = TestBed.createComponent(NamedQueryEditorComponent);
    const c = f.componentInstance;
    f.detectChanges();
    await c.waitForInit();
    c.isEditing = true;
    c.isNew = false;
    c.chooserReplacing = true;
    c.draft = {
      source: 'graphql',
      name: 'published',
      description: 'Keep this',
      graphql: {
        document: 'query Q($condition_1:String,$search:String){records(recordType:"rdmp"){nodes{oid}}}',
        variables: {
          condition_1: { ownership: 'fixed', value: 'Old' },
          search: { ownership: 'consumer', parameter: 'term', inputType: 'String', required: false },
        },
        resultPath: ['records', 'nodes'],
        mappings: { oid: ['oid'] },
      },
    };
    await c.chooseSavedSource({
      summary: {
        id: 'a'.repeat(24),
        revision: 5,
        name: 'Latest',
        recordType: null,
        recordTypeLabel: null,
        mode: 'graphql',
        updatedAt: null,
        updatedBy: null,
        publishedAs: [],
      },
      prepared: {
        definition: {
          source: 'graphql',
          graphql: {
            document: 'query Q($condition_1:String,$search:String){records(recordType:"rdmp"){nodes{oid}}}',
            variables: {},
            resultPath: ['records', 'nodes'],
          },
        },
        variableValues: { condition_1: 'New', search: 'Saved' },
      },
    });
    expect(JSON.stringify(c.activeGraphqlBuffer.graphql.variables['condition_1'])).toBe(JSON.stringify({ ownership: 'fixed', value: 'New' }));
    expect(JSON.stringify(c.activeGraphqlBuffer.graphql.variables['search'])).toBe(JSON.stringify({ ownership: 'consumer', parameter: 'term', inputType: 'String', required: false }));
    expect(c.activeGraphqlBuffer.graphql.mappings).toEqual({ oid: ['oid'] });
    expect(c.draft.name).toBe('published');
    expect(c.isNew).toBeFalse();
    expect(c.sourceDraftUpdated).toBeTrue();
    expect(c.dirty).toBeTrue();
    f.destroy();
  });
  it('discards a general GraphQL preview that completes after the draft changes', async () => {
    const f = TestBed.createComponent(NamedQueryEditorComponent);
    const c = f.componentInstance;
    f.detectChanges();
    await c.waitForInit();
    c.draft = {
      source: 'graphql',
      name: 'draft',
      graphql: {
        document: '{records(recordType:"rdmp"){nodes{oid}}}',
        variables: {},
        resultPath: ['records', 'nodes'],
      },
    };
    let resolve!: (result: { data: Record<string, unknown> }) => void;
    spyOn(TestBed.inject(NamedQueryApiService), 'graphqlRead').and.returnValue(new Promise(yes => (resolve = yes)));
    const pending = c.previewGraphql();
    // Dynamic import finishes before the request starts.
    while (!resolve) await new Promise(yes => setTimeout(yes, 0));
    c.draftChanged();
    resolve({ data: { records: { nodes: [{ oid: 'stale' }] } } });
    await pending;
    expect(c.rawGraphqlPreview).toBeNull();
    expect(c.previewing).toBeFalse();
    f.destroy();
  });
  it('keeps diagnostics as sentences without exposing technical location keys', () => {
    const f = TestBed.createComponent(NamedQueryEditorComponent);
    f.componentInstance.diagnostics = [
      {
        code: 'REQUIRED_VARIABLE',
        field: 'graphql.variables.type',
        severity: 'error',
        reason: 'Choose a value for the record type.',
        line: 0,
        column: 0,
      },
    ];
    f.componentInstance.isEditing = true;
    f.componentInstance.draft = {
      source: 'graphql',
      name: 'plans',
      graphql: {
        document: '{records(recordType:"rdmp"){nodes{oid}}}',
        variables: {},
        resultPath: ['records', 'nodes'],
      },
    };
    f.detectChanges();
    const diagnostics = f.nativeElement.querySelector('#nq-checks-title').parentElement.parentElement.textContent;
    expect(diagnostics).toContain('Choose a value for the record type.');
    expect(diagnostics).not.toContain('graphql.variables.type');
    expect(diagnostics).not.toContain('named-query-blocking');
    f.destroy();
  });

});
