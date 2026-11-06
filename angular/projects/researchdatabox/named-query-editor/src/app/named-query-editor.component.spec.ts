import { Subject } from 'rxjs';
import { AdminDiscardDialogComponent, AdminModalDirective, AdminCountPipe } from '@researchdatabox/portal-ng-common';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import { A11yModule } from '@angular/cdk/a11y';
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
  async waitForInit(): Promise<this> { return this; }
  async list(): Promise<NamedQueryDefinition[]> { return []; }
  async getCollections(): Promise<string[]> { return ['record', 'user']; }
  async get(_name: string): Promise<NamedQueryDefinition> {
    return { name: _name, collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
  }
  async create(_data: NamedQueryDefinition): Promise<{ name: string }> { return { name: _data.name || '' }; }
  async update(_name: string, _data: NamedQueryDefinition): Promise<{ name: string }> { return { name: _name }; }
  async delete(_name: string): Promise<{ name: string }> { return { name: _name }; }
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
        I18NextPipeStub
      ],
      imports: [AdminDiscardDialogComponent, AdminModalDirective, AdminCountPipe, FormsModule, A11yModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '/' },
        { provide: NamedQueryApiService, useClass: NamedQueryApiServiceStub },
        { provide: TranslationService, useClass: TranslationServiceStub },
        LoggerService
      ]
    }).compileComponents();
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
    detail.draft = { name: 'q', collectionName: 'legacyCollection', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    expect(detail.collectionOptions).toEqual(['legacyCollection', 'record', 'user']);
  });

  it('computes totalQueries and uniqueCollections', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'list').and.resolveTo([
      { name: 'q1', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'q2', collectionName: 'c1', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'q3', collectionName: 'c2', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
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
      { name: 'beta', collectionName: 'c2', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    component.onListQueryChanged({ searchTerm: 'alp' });
    expect(component.filteredQueries.length).toBe(1);
    expect(component.filteredQueries[0].name).toBe('alpha');

    component.onListQueryChanged({ searchTerm: '' });
    expect(component.filteredQueries.length).toBe(2);
  });

  it('opens new query modal', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.newQuery();
    expect(component.isNew).toBeTrue();
    expect(component.isEditModalOpen).toBeTrue();
    expect(component.draft.name).toBe('');
  });

  it('canSave requires collection name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isEditModalOpen = true;
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

    component.isEditModalOpen = true;
    component.isNew = true;
    component.draft = { name: 'foo/bar', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
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
      resultObjectMapping: { r: 'v' }
    });

    fixture.detectChanges();
    await component.waitForInit();
    await component.openQuery('existing');

    expect(component.isNew).toBeFalse();
    expect(component.draft.name).toBe('existing');
    expect(component.isEditModalOpen).toBeTrue();
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
      { name: 'new-query', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    component.newQuery();
    component.draft.name = 'new-query';
    component.draft.collectionName = 'records';
    await component.save();

    expect(createSpy).toHaveBeenCalled();
    expect(component.message).toContain('new-query');
    expect(component.isEditModalOpen).toBeFalse();
  });

  it('updates an existing query on save', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    const updateSpy = spyOn(api, 'update').and.resolveTo({ name: 'existing' });
    spyOn(api, 'list').and.resolveTo([
      { name: 'existing', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = false;
    component.isEditModalOpen = true;
    component.draft = { name: 'existing', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    await component.save();

    expect(updateSpy).toHaveBeenCalledWith('existing', jasmine.any(Object));
    expect(component.message).toContain('existing');
  });

  it('shows validation error when saving without required fields', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = true;
    component.isEditModalOpen = true;
    component.draft = { name: '', collectionName: '', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    await component.save();

    expect(component.error).toContain('name is required');
  });

  it('shows validation error when saving with reserved name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = true;
    component.isEditModalOpen = true;
    component.draft = { name: 'collections', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    await component.save();

    expect(component.error).toContain('reserved');
  });

  it('shows validation error when saving with invalid name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = true;
    component.isEditModalOpen = true;
    component.draft = { name: 'foo/bar', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    await component.save();

    expect(component.error).toContain('URL safe');
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

  it('closes edit modal if deleted query was selected', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'delete').and.resolveTo({ name: 'q1' });
    spyOn(api, 'list').and.resolveTo([]);

    fixture.detectChanges();
    await component.waitForInit();

    component.selectedQuery = { name: 'q1', collectionName: 'c', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    component.isEditModalOpen = true;
    component.requestDelete('q1');
    await component.confirmDelete();

    expect(component.isEditModalOpen).toBeFalse();
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

  it('closes edit modal', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.newQuery();
    component.closeEditModal();
    expect(component.isEditModalOpen).toBeFalse();
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
      { name: 'q3', collectionName: '', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
    ]);

    fixture.detectChanges();
    await component.waitForInit();

    expect(component.uniqueCollections).toBe(1);
  });

  it('canSave is false when edit modal is closed', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isEditModalOpen = false;
    component.isNew = true;
    component.draft = { name: 'test', collectionName: 'records', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    expect(component.canSave).toBeFalse();
  });

  it('shows collection required when saving existing without collection', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();

    component.isNew = false;
    component.isEditModalOpen = true;
    component.draft = { name: 'existing', collectionName: '', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    await component.save();

    expect(component.error).toContain('Collection name is required');
  });

  it('filters by collection name', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(NamedQueryApiService);

    spyOn(api, 'list').and.resolveTo([
      { name: 'alpha', collectionName: 'special', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} },
      { name: 'beta', collectionName: 'normal', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} }
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
      relatedRecordFilters: undefined
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
      relatedRecordFilters: []
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
    expect(component.isEditModalOpen).toBeFalse();
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

  it('blocks duplicate saves and dismissal while pending, then retains the draft on failure', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    component.newQuery();
    component.draft = { name: 'pending', collectionName: 'record', mongoQuery: {}, queryParams: {}, resultObjectMapping: {} };
    let reject!: (error: Error) => void;
    const create = spyOn(TestBed.inject(NamedQueryApiService), 'create').and.returnValue(new Promise((_, fail) => reject = fail));
    const pending = component.save();
    expect(component.isSaving).toBeTrue();
    expect(component.canSave).toBeFalse();
    component.closeEditModal();
    await component.save();
    expect(create).toHaveBeenCalledTimes(1);
    expect(component.isEditModalOpen).toBeTrue();
    reject(new Error('Save rejected'));
    await pending;
    expect(component.isSaving).toBeFalse();
    expect(component.isEditModalOpen).toBeTrue();
    expect(component.draft.name).toBe('pending');
    expect(component.error).toContain('Save rejected');
  });

  it('requires confirmation to dismiss a dirty editor and retains edits when keeping it open', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    fixture.detectChanges(); await component.waitForInit();
    component.newQuery(); component.closeEditModal();
    expect(component.isEditModalOpen).toBeFalse();
    await component.openQuery('test'); component.draft.collectionName = 'edited';
    component.closeEditModal(); fixture.detectChanges(); await fixture.whenStable();
    expect(component.confirmDiscard).toBeTrue();
    const confirm = fixture.nativeElement.querySelector('rb-admin-discard-dialog');
    confirm.querySelector('[cdkFocusInitial]').click(); fixture.detectChanges();
    expect(component.isEditModalOpen).toBeTrue();
    expect(component.draft.collectionName).toBe('edited');
    component.closeEditModal(); component.closeEditModal(true);
    expect(component.isEditModalOpen).toBeFalse();
    expect(component.confirmDiscard).toBeFalse();
    fixture.destroy();
  });
  it('also protects unparsed JSON input in a new query', async () => {
    const fixture = TestBed.createComponent(NamedQueryEditorComponent);
    const component = fixture.componentInstance;
    component.newQuery(); component.editorInput = true; component.closeEditModal();
    expect(component.confirmDiscard).toBeTrue();
    expect(component.isEditModalOpen).toBeTrue();
    fixture.destroy();
  });
});
