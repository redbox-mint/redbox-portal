import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { A11yModule } from '@angular/cdk/a11y';
import { Pipe, PipeTransform } from '@angular/core';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import {
  FieldTreeComponent,
  SchemaTargetSelectorComponent,
  LoggerService,
  TranslationService,
  CodeEditorComponent,
} from '@researchdatabox/portal-ng-common';
import {
  ContextSchemaField,
  NamedQueryFieldDescription,
  NamedQueryPreview,
  NamedQueryDescription,
  EditorDiagnostic,
  namedQueryMappingFields,
  storedRecordFields,
} from '@researchdatabox/sails-ng-common';
import { NamedQueryEditorComponent } from './named-query-editor.component';
import { NamedQueryApiService, NamedQueryDefinition } from './named-query-api.service';
import { NqListComponent } from './nq-list/nq-list.component';
import { NqDetailComponent } from './nq-detail/nq-detail.component';
import { MongoQueryEditorComponent } from './mongo-query-editor/mongo-query-editor.component';
import { QueryParamEditorComponent } from './query-param-editor/query-param-editor.component';
import { ResultMappingEditorComponent } from './result-mapping-editor/result-mapping-editor.component';
import { SortEditorComponent } from './sort-editor/sort-editor.component';
import { RelatedFilterEditorComponent } from './related-filter-editor/related-filter-editor.component';
import {
  QueryAssistanceModule,
  QueryPathInputComponent,
  QueryMappingValueComponent,
  QueryTypedValueComponent,
} from './query-assistance.module';

@Pipe({ name: 'i18next', standalone: false })
class TranslationPipe implements PipeTransform {
  transform(key: string): string {
    return key;
  }
}
const metadata: ContextSchemaField[] = [
  {
    path: 'title',
    title: 'Title',
    type: 'string',
    required: true,
    isArray: false,
    source: 'record-schema',
    enum: ['One', 'Two'],
  },
  { path: 'contributors', type: 'array', itemType: 'object', required: false, isArray: true },
  { path: 'contributors[].name', type: 'string', required: false, isArray: false },
];
function fields(collectionName = 'record', recordType = 'rdmp'): NamedQueryFieldDescription {
  const stored = collectionName === 'record' ? storedRecordFields(recordType ? metadata : []) : [];
  return {
    collectionName,
    recordType,
    stage: '',
    precision: recordType ? 'record-schema' : 'none',
    completeness: recordType ? 'complete' : 'unavailable',
    fields: stored.filter(f => f.path.startsWith('metadata')),
    envelopeFields: stored.filter(f => !f.path.startsWith('metadata')),
    mappingFields: namedQueryMappingFields(stored),
  };
}
function definition(name = 'query'): NamedQueryDefinition {
  return {
    name,
    collectionName: 'record',
    mongoQuery: { 'metadata.title': 'One' },
    queryParams: { title: { path: 'metadata.title', type: 'string', whenUndefined: 'ignore' } },
    resultObjectMapping: { projectTitle: 'record.metadata.title' },
    sort: [{ 'metadata.title': 'ASC' }],
  };
}
function previewResult(valid = true): NamedQueryPreview {
  return {
    valid,
    diagnostics: [],
    records: valid ? [{ oid: '1', metadata: { projectTitle: 'One' } }] : [],
    summary: { numFound: 1, start: 0, page: 1 },
    truncated: false,
    truncationReasons: [],
    limits: {
      inputBytes: 262144,
      depth: 40,
      nodes: 10000,
      timeMs: 3000,
      rows: 25,
      responseBytes: 262144,
      scanRows: 500,
      mappings: 100,
    },
  };
}
function description(): NamedQueryDescription {
  return {
    valid: true,
    diagnostics: [],
    collectionName: 'record',
    parameters: [],
    result: {
      recordType: '',
      stage: '',
      precision: 'none',
      completeness: 'partial',
      fields: [{ ...metadata[0], path: 'metadata.projectTitle' }],
    },
  };
}
function diagnostic(field: string, severity: 'error' | 'warning', suggestion?: string): EditorDiagnostic {
  return { field, severity, suggestion, code: 'TEST', reason: 'Check this field', line: 1, column: 1 };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { resolve, reject, promise };
}

class ApiStub {
  waitForInit = async () => this;
  list = jasmine.createSpy('list').and.resolveTo([]);
  getCollections = async () => ['record', 'user'];
  get = jasmine.createSpy('get').and.callFake(async (name: string) => definition(name));
  create = jasmine.createSpy('create').and.resolveTo({ name: 'query' });
  update = jasmine.createSpy('update').and.resolveTo({ name: 'query' });
  schemaTargets = jasmine.createSpy('targets').and.resolveTo({
    recordTypes: [{ id: 'rdmp', label: 'Plan', stages: [{ id: 'draft', label: 'Draft', starting: true }] }],
  });
  fields = jasmine
    .createSpy('fields')
    .and.callFake(async (context: { collectionName: string; recordType?: string }) =>
      fields(context.collectionName, context.recordType || '')
    );
  validate = jasmine.createSpy('validate').and.resolveTo({ valid: true, diagnostics: [] });
  describe = jasmine.createSpy('describe').and.callFake(async () => description());
  preview = jasmine.createSpy('preview').and.callFake(async () => previewResult());
}

describe('Schema-assisted named query workspace behaviours', () => {
  let fixture: ComponentFixture<NamedQueryEditorComponent>;
  let component: NamedQueryEditorComponent;
  let api: ApiStub;
  beforeEach(async () => {
    api = new ApiStub();
    await TestBed.configureTestingModule({
      declarations: [
        NamedQueryEditorComponent,
        NqListComponent,
        NqDetailComponent,
        MongoQueryEditorComponent,
        QueryParamEditorComponent,
        ResultMappingEditorComponent,
        SortEditorComponent,
        RelatedFilterEditorComponent,
        TranslationPipe,
      ],
      imports: [FormsModule, A11yModule, QueryAssistanceModule, FieldTreeComponent, SchemaTargetSelectorComponent],
      providers: [
        LoggerService,
        { provide: NamedQueryApiService, useValue: api },
        {
          provide: TranslationService,
          useValue: {
            waitForInit: async () => undefined,
            t: (key: string, fallback?: string) => fallback || key,
            isInitializing: () => false,
            translationChanges$: of(undefined),
          },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(NamedQueryEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await component.waitForInit();
    await component.openQuery('query');
    await component.chooseGuidance({ recordType: 'rdmp' });
    fixture.detectChanges();
  });
  afterEach(() => fixture.destroy());

  it('changes type/stage guidance without changing or saving any predicate', async () => {
    const before = JSON.stringify(component.draft);
    await component.chooseGuidance({ recordType: 'project', stage: 'published' });
    expect(JSON.stringify(component.draft)).toBe(before);
    expect(component.dirty).toBeFalse();
    await component.save();
    const payload = api.update.calls.mostRecent().args[1];
    expect(payload.guidance).toBeUndefined();
    expect(payload.recordType).toBeUndefined();
    expect(payload.mongoQuery).toEqual(definition().mongoQuery);
  });

  it('infers only an exact, unparameterized, unambiguous type constraint', async () => {
    for (const query of [
      { 'metaMetadata.type': 'rdmp' },
      { 'metaMetadata.type': { $in: ['rdmp', 'project'] } },
      { $or: [{ 'metaMetadata.type': 'rdmp' }] },
    ]) {
      api.get.and.resolveTo({ ...definition(), mongoQuery: query });
      await component.openQuery('other');
      expect(component.guidance?.recordType || null).toBe(
        typeof query['metaMetadata.type'] === 'string' ? 'rdmp' : null
      );
    }
    api.get.and.resolveTo({
      ...definition(),
      mongoQuery: { 'metaMetadata.type': 'rdmp' },
      queryParams: { type: { path: 'metaMetadata.type', type: 'string', whenUndefined: 'ignore' } },
    });
    await component.openQuery('parameterized');
    expect(component.guidance).toBeNull();
  });

  it('adds the displayed type constraint explicitly while preserving complex existing predicates', () => {
    component.draft.mongoQuery = {
      $or: [{ x: { $elemMatch: { score: { $gte: 3 } } } }, { 'metaMetadata.type': 'other' }],
    };
    const previous = JSON.parse(JSON.stringify(component.draft.mongoQuery));
    component.addTypeConstraint();
    expect(component.draft.mongoQuery).toEqual({ $and: [previous, { 'metaMetadata.type': 'rdmp' }] });
    expect(component.dirty).toBeTrue();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('named-query-scope-notice');
  });

  it('inserts stored paths in conditions, parameters and sort, and wrapped paths beside mapping aliases', () => {
    const detail = fixture.debugElement.query(By.directive(NqDetailComponent)).componentInstance as NqDetailComponent;
    const mongo = fixture.debugElement.query(By.directive(MongoQueryEditorComponent))
      .componentInstance as MongoQueryEditorComponent;
    const param = fixture.debugElement.query(By.directive(QueryParamEditorComponent))
      .componentInstance as QueryParamEditorComponent;
    const sort = fixture.debugElement.query(By.directive(SortEditorComponent)).componentInstance as SortEditorComponent;
    const mapping = fixture.debugElement.query(By.directive(ResultMappingEditorComponent))
      .componentInstance as ResultMappingEditorComponent;
    const storedPath = fixture.debugElement
      .queryAll(By.directive(QueryPathInputComponent))
      .map(d => d.componentInstance as QueryPathInputComponent)
      .find(c => c.kind === 'stored')!;
    const node = { path: 'metadata.title' } as Parameters<typeof storedPath.insertion>[0];
    expect(storedPath.insertion(node)).toBe('metadata.title');
    mongo.newPath = storedPath.insertion(node)!;
    mongo.newValue = 'Two';
    mongo.addEntry();
    expect(component.draft.mongoQuery['metadata.title']).toBe('Two');
    param.onFieldChange(param.entries[0], 'path', storedPath.insertion(node));
    sort.newField = storedPath.insertion(node)!;
    sort.addEntry();
    expect(component.draft.queryParams['title'].path).toBe('metadata.title');
    expect(component.draft.sort?.at(-1)).toEqual({ 'metadata.title': 'ASC' });
    const mappingControl = fixture.debugElement.query(By.directive(QueryMappingValueComponent))
      .componentInstance as QueryMappingValueComponent;
    const direct = new QueryPathInputComponent();
    direct.kind = 'mapping';
    expect(direct.insertion({ path: 'record.metadata.title' } as Parameters<typeof direct.insertion>[0])).toBe(
      'record.metadata.title'
    );
    expect(
      mappingControl.templateInsertion({ path: 'record.metadata.title' } as Parameters<
        typeof mappingControl.templateInsertion
      >[0])
    ).toBe('{{record.metadata.title}}');
    expect(mapping.entries[0].key).toBe('projectTitle');
    expect(detail.mappingFields.some(f => f.path === 'record.metadata.title')).toBeTrue();
  });

  it('offers keyboard-operable field buttons and template autocomplete with the actual record root', () => {
    const wrapper = fixture.debugElement.query(By.directive(QueryPathInputComponent));
    const tree = wrapper.query(By.directive(FieldTreeComponent)).componentInstance as FieldTreeComponent;
    tree.onSearch('metadata.title');
    fixture.detectChanges();
    const button = wrapper.nativeElement.querySelector('.et-field-name') as HTMLButtonElement;
    expect(button.tagName).toBe('BUTTON');
    button.click();
    fixture.detectChanges();
    expect((wrapper.componentInstance as QueryPathInputComponent).value).toBe('metadata.title');
    const mapping = fixture.debugElement.query(By.directive(QueryMappingValueComponent))
      .componentInstance as QueryMappingValueComponent;
    mapping.template = true;
    fixture.detectChanges();
    const editor = fixture.debugElement.query(By.directive(CodeEditorComponent))
      .componentInstance as CodeEditorComponent;
    expect(editor.completions?.roots).toEqual(['record']);
    expect(editor.completions?.fields.some(f => f.path === 'record.metadata.title')).toBeTrue();
  });

  it('describes enums, compatible operators and array operations without inserting a scalar comparison', () => {
    const input = new QueryPathInputComponent();
    input.fields = component.fields;
    input.value = 'metadata.title';
    expect(input.selected?.enum).toEqual(['One', 'Two']);
    expect(input.operators(input.selected!)).toContain('$regex');
    input.value = 'metadata.contributors';
    expect(input.selected?.isArray).toBeTrue();
    expect(component.draft.mongoQuery['metadata.contributors']).toBeUndefined();
  });

  it('keeps foreign guidance separate and uses foreign and local join paths', async () => {
    component.draft.relatedRecordFilters = [
      { collectionName: 'record', mongoQuery: {}, localField: 'metadata.title', foreignField: 'metadata.title' },
    ];
    await component.foreignContextChanged({ index: 0, collectionName: 'record', selection: { recordType: 'project' } });
    expect(component.guidance?.recordType).toBe('rdmp');
    expect(component.relatedGuidance['0'].recordType).toBe('project');
    fixture.detectChanges();
    const related = fixture.debugElement.query(By.directive(RelatedFilterEditorComponent))
      .componentInstance as RelatedFilterEditorComponent;
    expect(related.foreignFields['0'].some(f => f.path === 'metadata.title')).toBeTrue();
    related.onFieldChange(related.filters[0], 'localField', 'redboxOid');
    related.onFieldChange(related.filters[0], 'foreignField', 'metadata.title');
    expect(component.draft.relatedRecordFilters[0].localField).toBe('redboxOid');
    expect(component.draft.relatedRecordFilters[0].foreignField).toBe('metadata.title');
  });

  it('places warnings/errors and suggested corrections beside the affected entry and template', async () => {
    api.validate.and.resolveTo({
      valid: false,
      diagnostics: [
        diagnostic('mongoQuery.metadata.title', 'warning', 'metadata.title'),
        diagnostic('queryParams.title.type', 'warning'),
        diagnostic('resultObjectMapping.projectTitle', 'error'),
      ],
    });
    await component.validateDraft();
    fixture.detectChanges();
    const mongo = fixture.debugElement.query(By.directive(MongoQueryEditorComponent));
    const param = fixture.debugElement.query(By.directive(QueryParamEditorComponent));
    const mapping = fixture.debugElement.query(By.directive(ResultMappingEditorComponent));
    expect(mongo.nativeElement.querySelector('.text-warning').textContent).toContain('metadata.title');
    expect(param.nativeElement.querySelector('[data-location="queryParams.title.type"]')).toBeTruthy();
    expect(mapping.nativeElement.querySelector('.text-danger').textContent).toContain('named-query-blocking');
    expect(component.canSave).toBeFalse();
    expect(component.draft.mongoQuery['metadata.title']).toBe('One');
  });

  it('keeps advisory schema warnings nonblocking', async () => {
    api.validate.and.resolveTo({ valid: true, diagnostics: [diagnostic('mongoQuery.metadata.title', 'warning')] });
    await component.validateDraft();
    expect(component.canSave).toBeTrue();
  });

  it('only previews explicitly with entered parameter names and describes the report result shape', async () => {
    component.draftChanged();
    await component.validateDraft();
    expect(api.preview).not.toHaveBeenCalled();
    component.testParameterChanged('title', 'Two');
    await component.preview();
    fixture.detectChanges();
    expect(api.preview.calls.mostRecent().args[0].parameters).toEqual({ title: 'Two' });
    expect(fixture.nativeElement.textContent).toContain('named-query-real-data');
    expect(fixture.nativeElement.querySelector('.nq-results table').textContent).toContain('projectTitle');
    expect(fixture.nativeElement.textContent).toContain('metadata.projectTitle');
    expect(fixture.nativeElement.textContent).toContain('named-query-preview-json');
  });

  it('displays preview refusals with blocking reasons and keeps ordinary saving available', async () => {
    const result = previewResult(false);
    result.diagnostics = [diagnostic('relatedRecordFilters', 'error')];
    api.preview.and.resolveTo(result);
    await component.preview();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('named-query-preview-refused');
    expect(fixture.nativeElement.textContent).toContain('Check this field');
    expect(component.canSave).toBeTrue();
    expect(fixture.nativeElement.querySelector('.nq-results table')).toBeNull();
  });

  it('displays row/byte truncation and inspectable bounded response JSON', async () => {
    const result = previewResult();
    result.truncated = true;
    result.truncationReasons = ['rows', 'bytes'];
    api.preview.and.resolveTo(result);
    await component.preview();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('named-query-truncated');
    expect(text).toContain('rows, bytes');
    expect(text).toContain('25');
  });

  it('ignores a stale item fetch after a newer item opens', async () => {
    const slow = deferred<NamedQueryDefinition>();
    api.get.and.callFake((name: string) => (name === 'old' ? slow.promise : Promise.resolve(definition(name))));
    const pending = component.openQuery('old');
    await component.openQuery('new');
    slow.resolve(definition('old'));
    await pending;
    expect(component.draft.name).toBe('new');
  });

  it('ignores stale field responses after guidance changes, including stale errors', async () => {
    const slow = deferred<NamedQueryFieldDescription>();
    api.fields.and.returnValue(slow.promise);
    const pending = component.chooseGuidance({ recordType: 'old' });
    api.fields.and.resolveTo(fields('record', 'new'));
    await component.chooseGuidance({ recordType: 'new' });
    slow.reject(new Error('old failure'));
    await pending;
    expect(component.fieldDescription?.recordType).toBe('new');
    expect(component.assistanceError).toBe('');
  });

  it('ignores stale diagnostics after switching items', async () => {
    const slow = deferred<{ valid: boolean; diagnostics: EditorDiagnostic[] }>();
    api.validate.and.returnValue(slow.promise);
    const pending = component.validateDraft();
    await component.openQuery('new');
    slow.resolve({ valid: false, diagnostics: [diagnostic('mongoQuery', 'error')] });
    await pending;
    expect(component.draft.name).toBe('new');
    expect(component.diagnostics).toEqual([]);
    expect(component.validating).toBeFalse();
  });

  it('ignores stale preview rows and descriptions after a guidance switch', async () => {
    const slow = deferred<NamedQueryPreview>();
    api.preview.and.returnValue(slow.promise);
    const pending = component.preview();
    await component.chooseGuidance({ recordType: 'new' });
    slow.resolve(previewResult());
    await pending;
    expect(component.previewResult).toBeNull();
    expect(component.description).toBeNull();
    expect(component.previewing).toBeFalse();
  });

  it('ignores stale preview errors and clears results when the draft or test values change', async () => {
    const slow = deferred<NamedQueryPreview>();
    api.preview.and.returnValue(slow.promise);
    const pending = component.preview();
    component.testParameterChanged('title', 'new');
    slow.reject(new Error('old preview'));
    await pending;
    expect(component.error).toBe('');
    expect(component.previewResult).toBeNull();
    expect(component.previewing).toBeFalse();
    api.preview.and.resolveTo(previewResult());
    await component.preview();
    component.draftChanged();
    expect(component.previewResult).toBeNull();
  });

  it('blocks cancel, item navigation, a new query and portal links when discarding is declined', async () => {
    const confirm = spyOn(window, 'confirm').and.returnValue(false);
    component.draft.name = 'changed';
    component.closeEditModal();
    component.newQuery();
    await component.openQuery('other');
    expect(component.isEditing).toBeTrue();
    expect(component.draft.name).toBe('changed');
    expect(confirm.calls.count()).toBe(3);
    const anchor = document.createElement('a');
    anchor.href = '/elsewhere';
    document.body.appendChild(anchor);
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    anchor.dispatchEvent(event);
    anchor.remove();
    expect(event.defaultPrevented).toBeTrue();
  });

  it('protects beforeunload, including unapplied raw edits, and clears dirty state after save', async () => {
    let event = new Event('beforeunload', { cancelable: true });
    component.beforeUnload(event as BeforeUnloadEvent);
    expect(event.defaultPrevented).toBeFalse();
    component.inputChanged();
    event = new Event('beforeunload', { cancelable: true });
    component.beforeUnload(event as BeforeUnloadEvent);
    expect(event.defaultPrevented).toBeTrue();
    await component.save();
    expect(component.dirty).toBeFalse();
  });

  it('keeps complex raw Mongo expressions through raw/structured switches and unrelated edits', () => {
    const editor = fixture.debugElement.query(By.directive(MongoQueryEditorComponent))
      .componentInstance as MongoQueryEditorComponent;
    const complex = {
      $or: [{ value: { $not: { $regex: 'abc' } } }, { scores: { $elemMatch: { $gte: 2 } } }],
      $expr: { $eq: [{ $size: '$names' }, 3] },
    };
    editor.toggleRawJson();
    editor.rawJsonText = JSON.stringify(complex);
    editor.toggleRawJson();
    expect(component.draft.mongoQuery).toEqual(complex);
    editor.newPath = 'metadata.title';
    editor.newValue = 'New';
    editor.addEntry();
    editor.toggleRawJson();
    editor.toggleRawJson();
    expect(component.draft.mongoQuery['$or']).toEqual(complex.$or);
    expect(component.draft.mongoQuery['$expr']).toEqual(complex.$expr);
  });

  it('retains invalid raw text across section changes and prevents saving or previewing the old query', () => {
    const editor = fixture.debugElement.query(By.directive(MongoQueryEditorComponent))
      .componentInstance as MongoQueryEditorComponent;
    editor.toggleRawJson();
    editor.rawJsonText = '{ invalid';
    editor.rawChanged();
    editor.toggleRawJson();
    const detail = fixture.debugElement.query(By.directive(NqDetailComponent)).componentInstance as NqDetailComponent;
    detail.setTab('params');
    fixture.detectChanges();
    detail.setTab('mongo');
    fixture.detectChanges();
    expect(editor.useRawJson).toBeTrue();
    expect(editor.rawJsonText).toBe('{ invalid');
    expect(component.canSave).toBeFalse();
    expect(component.previewInputInvalid).toBeTrue();
  });

  it('preserves custom configuration and explicit parameter type/format/template overrides', async () => {
    const legacy = { ...definition(), brandIdFieldPath: 'tenant.id', hookOption: { custom: true } };
    legacy.queryParams['title'] = {
      type: 'date',
      path: 'dateCreated',
      whenUndefined: 'defaultValue',
      defaultValue: -7,
      format: 'days',
      template: '{{value}}',
    };
    api.get.and.resolveTo(legacy);
    await component.openQuery('legacy');
    fixture.detectChanges();
    const params = fixture.debugElement.query(By.directive(QueryParamEditorComponent))
      .componentInstance as QueryParamEditorComponent;
    params.onFieldChange(params.entries[0], 'path', 'lastSaveDate');
    await component.save();
    const payload = api.update.calls.mostRecent().args[1];
    expect(payload.hookOption).toEqual({ custom: true });
    expect(payload.brandIdFieldPath).toBe('tenant.id');
    expect(payload.queryParams.title).toEqual({ ...legacy.queryParams['title'], path: 'lastSaveDate' });
  });

  it('provides typed defaults without silently coercing stored values and explains date offsets', () => {
    const control = new QueryTypedValueComponent();
    control.type = 'date';
    control.format = 'days';
    control.value = -7;
    control.ngOnChanges();
    const emit = spyOn(control.valueChange, 'emit');
    expect(emit).not.toHaveBeenCalled();
    control.type = 'object';
    control.changeJson('{"limit": 3}');
    expect(emit).toHaveBeenCalledWith({ limit: 3 });
    control.changeJson('[]');
    expect(control.error).toBeTrue();
    control.type = 'array';
    control.changeJson('[1,2]');
    expect(emit).toHaveBeenCalledWith([1, 2]);
  });

  it('never attaches record fields to a user collection and retains manual paths/templates', async () => {
    component.draft.collectionName = 'user';
    await component.collectionChanged();
    await component.chooseGuidance({ recordType: 'rdmp' });
    fixture.detectChanges();
    expect(component.guidance).toBeNull();
    expect(component.fields).toEqual([]);
    expect(component.mappingFields.some(f => f.path.startsWith('record.metadata'))).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('named-query-manual-collection');
    expect(component.draft.resultObjectMapping['projectTitle']).toBe('record.metadata.title');
    expect(api.fields.calls.mostRecent().args[0]).toEqual({ collectionName: 'user' });
  });

  it('keeps manual editing available if schema capabilities are missing', async () => {
    api.fields.and.rejectWith(new Error('not installed'));
    await component.chooseGuidance({ recordType: 'missing' });
    expect(component.fields).toEqual([]);
    expect(component.canSave).toBeTrue();
    expect(component.assistanceError).toContain('Manual editing');
  });
  it('rejects late foreign fields after removing a related filter', async () => {
    component.draft.relatedRecordFilters = [
      { collectionName: 'record', mongoQuery: {}, localField: '', foreignField: '' },
    ];
    const slow = deferred<NamedQueryFieldDescription>();
    api.fields.and.returnValue(slow.promise);
    const pending = component.foreignContextChanged({
      index: 0,
      collectionName: 'record',
      selection: { recordType: 'project' },
    });
    component.draft.relatedRecordFilters = [];
    await component.foreignContextChanged({ index: -1, collectionName: '' });
    slow.resolve(fields());
    await pending;
    expect(component.foreignFields).toEqual({});
    expect(component.relatedGuidance).toEqual({});
  });

  it('rejects late target discovery after switching items', async () => {
    const slow = deferred<{ recordTypes: [] }>();
    api.schemaTargets.and.returnValue(slow.promise);
    const pending = component.loadTargets();
    api.schemaTargets.and.resolveTo({ recordTypes: [{ id: 'new', label: 'New', stages: [] }] });
    await component.openQuery('new');
    slow.resolve({ recordTypes: [] });
    await pending;
    expect(component.targets[0].id).toBe('new');
  });

  it('drops the old editor pending input state when another query opens', async () => {
    const editor = fixture.debugElement.query(By.directive(MongoQueryEditorComponent))
      .componentInstance as MongoQueryEditorComponent;
    editor.toggleRawJson();
    editor.rawJsonText = '{ unfinished';
    editor.rawChanged();
    spyOn(window, 'confirm').and.returnValue(true);
    await component.openQuery('new');
    fixture.detectChanges();
    const next = fixture.debugElement.query(By.directive(MongoQueryEditorComponent))
      .componentInstance as MongoQueryEditorComponent;
    expect(next).not.toBe(editor);
    expect(next.useRawJson).toBeFalse();
    expect(next.rawJsonText).toBe('');
    expect(component.pendingInput).toBeFalse();
  });

  it('keeps invalid test JSON visible and prevents preview until corrected', () => {
    component.draft.queryParams['options'] = { path: 'metadata.options', type: 'object', whenUndefined: 'ignore' };
    fixture.detectChanges();
    const controls = fixture.debugElement.queryAll(By.directive(QueryTypedValueComponent));
    const testValue = controls
      .map(c => c.componentInstance as QueryTypedValueComponent)
      .find(c => c.label === 'options')!;
    testValue.changeJson('{ invalid');
    fixture.detectChanges();
    fixture.detectChanges();
    expect(testValue.jsonValue).toBe('{ invalid');
    expect(component.previewInputInvalid).toBeTrue();
    testValue.changeJson('{"enabled":true}');
    expect(component.previewInputInvalid).toBeFalse();
  });

  it('never replaces a complex condition with an empty object during invalid structured editing', () => {
    const editor = fixture.debugElement.query(By.directive(MongoQueryEditorComponent))
      .componentInstance as MongoQueryEditorComponent;
    editor.toggleRawJson();
    editor.rawJsonText = '{"$expr":{"$eq":["$a","$b"]}}';
    editor.toggleRawJson();
    editor.onValueChange(editor.entries[0], '{ incomplete');
    expect(component.draft.mongoQuery).toEqual({ $expr: { $eq: ['$a', '$b'] } });
    expect(component.pendingInput).toBeTrue();
  });

  it('blocks a structural error found immediately before save without executing a preview', async () => {
    api.validate.and.resolveTo({ valid: false, diagnostics: [diagnostic('collectionName', 'error')] });
    await component.save();
    expect(api.update).not.toHaveBeenCalled();
    expect(api.preview).not.toHaveBeenCalled();
    expect(component.saving).toBeFalse();
  });

  it('retains a draft when it changes while save validation is pending', async () => {
    const slow = deferred<{ valid: boolean; diagnostics: EditorDiagnostic[] }>();
    api.validate.and.returnValue(slow.promise);
    const pending = component.save();
    component.draft.mongoQuery = { changed: true };
    component.draftChanged();
    slow.resolve({ valid: true, diagnostics: [] });
    await pending;
    expect(api.update).not.toHaveBeenCalled();
    expect(component.draft.mongoQuery).toEqual({ changed: true });
    expect(component.dirty).toBeTrue();
  });
  it('retains invalid typed default text when another parameter is added', () => {
    component.draft.queryParams = {
      ...component.draft.queryParams,
      options: {
        type: 'object',
        path: 'metadata.options',
        whenUndefined: 'defaultValue',
        defaultValue: { enabled: true },
      },
    };
    fixture.detectChanges();
    const paramsElement = fixture.debugElement.query(By.directive(QueryParamEditorComponent));
    const params = paramsElement.componentInstance as QueryParamEditorComponent;
    const typed = paramsElement
      .queryAll(By.directive(QueryTypedValueComponent))
      .map(d => d.componentInstance as QueryTypedValueComponent)
      .find(c => c.type === 'object')!;
    typed.changeJson('{ unfinished');
    params.startAdd();
    params.newParam.key = 'another';
    params.addParam();
    fixture.detectChanges();
    expect(
      paramsElement.queryAll(By.directive(QueryTypedValueComponent)).some(d => d.componentInstance === typed)
    ).toBeTrue();
    expect(typed.jsonValue).toBe('{ unfinished');
    expect(component.pendingInput).toBeTrue();
  });

  it('keeps record type and stage selection in the panel out of the dirty draft', () => {
    const selector = fixture.debugElement.query(By.directive(SchemaTargetSelectorComponent));
    const select = selector.nativeElement.querySelector('select') as HTMLSelectElement;
    select.value = 'rdmp';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(component.dirty).toBeFalse();
  });
});
