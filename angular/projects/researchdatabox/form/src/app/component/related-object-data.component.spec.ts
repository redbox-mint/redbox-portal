import { RelatedDataStateService } from '../form-state/related-records/related-data-state.service';
import { SimpleInputComponent } from './simple-input.component';
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { FormControl, FormGroup } from '@angular/forms';
import { EMPTY } from 'rxjs';
import { RecordService } from '@researchdatabox/portal-ng-common';
import { RelatedMetadata, RelatedMetadataEntry } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { fakeAsync, flushMicrotasks, tick, TestBed } from '@angular/core/testing';
import { HandlebarsTemplateService, UtilityService } from '@researchdatabox/portal-ng-common';
import { FormConfigFrame, handlebarsCompile, jsonataCompileAndEvaluate } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule, DynamicAssetOptions } from '../helpers.spec';
import { FieldValueChangedEvent, FormComponentEventType } from '../form-state/events/form-component-event.types';
import { RelatedObjectDataComponent } from './related-object-data.component';

describe('RelatedObjectDataComponent', () => {
  let utilityService: UtilityService;
  let recordService: jasmine.SpyObj<RecordService>;

  beforeEach(async () => {
    recordService = jasmine.createSpyObj('RecordService', ['resolveRelatedMetadata', 'update', 'create']);
    await createTestbedModule({
      declarations: { RelatedObjectDataComponent, SimpleInputComponent, GroupFieldComponent, RepeatableComponent, RepeatableElementLayoutComponent },
      providers: { RecordService: { provide: RecordService, useValue: recordService }, UtilityService: null, HandlebarsTemplateService: { provide: HandlebarsTemplateService, useValue: {} } },
    });
    utilityService = TestBed.inject(UtilityService);
  });

  for (const mode of ['edit', 'view']) {
  it(`publishes hidden bootstrap data to scalar, group and repeatable consumers in ${mode} mode`, fakeAsync(() => {
    let expressionGate: Promise<void> | undefined;
    const expression = (template: string) => [{ name: template, config: {
      conditionKind: 'jsonpointer' as const, condition: '/source::field.value.changed',
      runOnFormReady: false, hasTemplate: true, template, target: 'model.value',
    } }];
    const formConfig: FormConfigFrame = {
      name: 'related-consumers',
      relatedRecords: { displayTargets: [], relations: [], sources: [{
        relationId: 'activities', componentPointer: '/source', referenceTokens: ['selection'],
        referenceFingerprint: JSON.stringify({ values: ['A'], invalidIndices: [] }),
        initialResult: { status: 'resolved', issues: [], records: [{ redboxOid: 'A',
          metadata: { title: 'Current activity' }, metaMetadata: { type: 'activity', brandId: 'default' } }] },
      }] },
      componentDefinitions: [
        { name: 'selection', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel', config: { value: 'A' } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities' } },
          layout: { class: 'DefaultLayout', config: { visible: false } } },
        { name: 'scalar', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' },
          expressions: expression('event.value.records[0].metadata.title') },
        { name: 'group', component: { class: 'GroupComponent', config: { componentDefinitions: [{ name: 'title',
          component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } }] } },
          model: { class: 'GroupModel' }, expressions: expression('event.value.records[0].metadata') },
        { name: 'titles', component: { class: 'RepeatableComponent', config: { allowZeroRows: true,
          elementTemplate: { name: '', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } } } },
          model: { class: 'RepeatableModel', config: { value: [] } }, expressions: expression('event.value.records.metadata.title[]') },
      ],
    };
    // The server retains these live metadata subtrees as read-only controls in view mode.
    // References must remain in raw values and target models must receive source events.
    if (mode === 'view') {
      for (const field of formConfig.componentDefinitions!) {
        if (!field.model) continue;
        field.component.config = { ...field.component.config, readonly: true, disabled: true };
      }
    }
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key, path, context) => {
        const expression = path.reduce<any>((value, token) => value[token], formConfig);
        return expressionGate && expression === 'event.value.records[0].metadata.title'
          ? expressionGate.then(() => jsonataCompileAndEvaluate(expression, context))
          : jsonataCompileAndEvaluate(expression, context);
      },
    }] };
    let result!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(formConfig, undefined, undefined, assets).then(value => { result = value; });
    flushMicrotasks();
    tick();
    const raw = result.formComponent.form!.getRawValue();
    expect(raw.scalar).toBe('Current activity');
    expect(raw.group).toEqual({ title: 'Current activity' });
    expect(raw.titles).toEqual(['Current activity']);
    expect(Object.prototype.hasOwnProperty.call(raw, 'source')).toBeFalse();
    // Re-publish completed source data while both an expression and a real repeatable setter wait.
    let releaseExpression!: () => void;
    expressionGate = new Promise<void>(resolve => { releaseExpression = resolve; });
    const titles = result.formComponent.form!.get('titles') as any;
    const originalSetter = titles.setCustomValue.bind(titles);
    let releaseRepeatable!: () => void;
    const repeatableGate = new Promise<void>(resolve => { releaseRepeatable = resolve; });
    spyOn(titles, 'setCustomValue').and.callFake(async (value: unknown, options: unknown) => {
      await repeatableGate;
      await originalSetter(value, options);
    });
    titles.setValue(['Previous activity'], { emitEvent: false });
    const source = result.formComponent.componentDefArr[1].component as RelatedObjectDataComponent;
    let fetchRendered = false;
    void source.refreshRelatedData(true, true).then(() => { fetchRendered = true; });
    flushMicrotasks();
    expect(fetchRendered).toBeTrue();
    expect(result.formComponent.relatedState).toBe('pending');
    releaseExpression(); flushMicrotasks();
    expect(result.formComponent.relatedState).toBe('pending');
    expect(titles.setCustomValue).toHaveBeenCalled();
    releaseRepeatable(); flushMicrotasks(); tick(); result.fixture.detectChanges();
    expect(result.formComponent.relatedState).toBe('ready');
    expect(result.formComponent.form!.getRawValue().titles).toEqual(['Current activity']);
    expect(result.fixture.nativeElement.getAttribute('data-rb-related-state')).toBe('ready');

  }));

  }

  for (const delayedWork of ['expressions', 'repeatable setter']) {
  it(`ignores delayed loading ${delayedWork} after targets receive resolved data`, fakeAsync(() => {
    let releaseLoading!: () => void;
    const loading = new Promise<void>(resolve => { releaseLoading = resolve; });
    let resolveRequest!: (value: RelatedMetadata) => void;
    recordService.resolveRelatedMetadata.and.returnValue(new Promise<RelatedMetadata>(resolve => { resolveRequest = resolve; }));
    const entry = (title: string): RelatedMetadataEntry => ({ status: 'resolved', issues: [], records: [{
      redboxOid: 'A', metadata: { title }, metaMetadata: { type: 'activity', brandId: 'default' },
    }] });
    const expression = (template: string) => [{ name: template, config: {
      conditionKind: 'jsonpointer' as const, condition: '/source::field.value.changed',
      runOnFormReady: false, hasTemplate: true, template, target: 'model.value',
    } }];
    const config: FormConfigFrame = { name: 'delayed-related-loading',
      relatedRecords: { displayTargets: [], relations: [], sources: [{
        relationId: 'activities', componentPointer: '/source', referenceTokens: ['selection'],
        initialResult: entry('Previous'), referenceFingerprint: JSON.stringify({ values: ['A'], invalidIndices: [] }),
      }] }, componentDefinitions: [
        { name: 'selection', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel', config: { value: 'A' } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities' } } },
        { name: 'scalar', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' },
          expressions: expression('event.value.loading ? "" : event.value.records[0].metadata.title') },
        { name: 'group', component: { class: 'GroupComponent', config: { componentDefinitions: [{ name: 'title',
          component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } }] } },
          model: { class: 'GroupModel' }, expressions: expression('{"title": event.value.loading ? "" : event.value.records[0].metadata.title}') },
        { name: 'titles', component: { class: 'RepeatableComponent', config: { allowZeroRows: true,
          elementTemplate: { name: '', component: { class: 'SimpleInputComponent' }, model: { class: 'SimpleInputModel' } } } },
          model: { class: 'RepeatableModel', config: { value: [] } }, expressions: expression('event.value.loading ? [] : event.value.records.metadata.title[]') },
      ],
    };
    let result!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(config, undefined, undefined, { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key, path, context) => {
        const template = path.reduce<any>((value, token) => value[token], config);
        return delayedWork === 'expressions' && context.event?.value?.loading
          ? loading.then(() => jsonataCompileAndEvaluate(template, context))
          : jsonataCompileAndEvaluate(template, context);
      },
    }] }).then(value => { result = value; });
    flushMicrotasks(); tick();
    const source = result.formComponent.componentDefArr[1].component as RelatedObjectDataComponent;
    if (delayedWork === 'repeatable setter') {
      const titles = result.formComponent.form!.get('titles') as any;
      const originalSetter = titles.setCustomValue.bind(titles);
      spyOn(titles, 'setCustomValue').and.callFake(async (value: unknown[], options: unknown) => {
        if (!value.length) await loading;
        await originalSetter(value, options);
      });
    }
    void source.refreshRelatedData(true); flushMicrotasks();
    resolveRequest({ activities: entry('Current') }); flushMicrotasks(); tick();
    const expected = { selection: 'A', scalar: 'Current', group: { title: 'Current' }, titles: ['Current'] };
    expect(result.formComponent.form!.getRawValue()).toEqual(expected);
    releaseLoading(); flushMicrotasks(); tick();
    expect(result.formComponent.form!.getRawValue()).toEqual(expected);
    expect(result.formComponent.relatedState).toBe('ready');
    result.fixture.destroy();
  }));
  }

  for (const editMode of [false, true]) {
    it(`keeps legacy disabled readonly group children unregistered (editMode=${editMode})`, async () => {
      const config: FormConfigFrame = { name: 'legacy-disabled-readonly-group', componentDefinitions: [{
        name: 'legacy', model: { class: 'GroupModel', config: { value: { excluded: 'saved' } } },
        component: { class: 'GroupComponent', config: { componentDefinitions: [{
          name: 'excluded', model: { class: 'SimpleInputModel' },
          component: { class: 'SimpleInputComponent', config: { readonly: true, disabled: true } },
        }] } },
      }] };
      const { formComponent } = await createFormAndWaitForReady(config, { editMode });
      const group = formComponent.form!.get('legacy')!;
      expect(group.get('excluded')).toBeNull();
      expect(group.value).toEqual({});
      expect(group.getRawValue()).toEqual({});
      expect(formComponent.form!.pristine).toBeTrue();
    });
  }

  for (const disabledBy of ['model', 'component', 'layout']) {
  it(`keeps an unrelated readonly group child disabled by ${disabledBy} unregistered in an opted-in view`, async () => {
    const config: FormConfigFrame = { name: 'unrelated-disabled-view',
      relatedRecords: { displayTargets: [{ metadataPointer: '/declared', relationId: 'activities' }],
        relations: [{ relationId: 'activities', referenceTokens: ['reference'] }], sources: [] },
      componentDefinitions: [{ name: 'legacy', model: { class: 'GroupModel', config: { value: { excluded: 'saved' } } },
        component: { class: 'GroupComponent', config: { componentDefinitions: [{
          name: 'excluded', model: { class: 'SimpleInputModel', config: { disabled: disabledBy === 'model' } },
          component: { class: 'SimpleInputComponent', config: { readonly: true, disabled: disabledBy === 'component' } },
          layout: { class: 'DefaultLayout', config: { disabled: disabledBy === 'layout' } },
        }] } } }],
    };
    const { formComponent } = await createFormAndWaitForReady(config, { editMode: false });
    const group = formComponent.form!.get('legacy')!;
    expect(group.get('excluded')).toBeNull();
    expect(group.getRawValue()).toEqual({});
    expect(formComponent.form!.pristine).toBeTrue();
  });

  }

  it('hydrates disabled view reference groups and populates date groups from matching bootstrap data', fakeAsync(() => {
    const input = (name: string): any => ({ name, model: { class: 'SimpleInputModel', config: {} },
      component: { class: 'SimpleInputComponent', config: { readonly: true, disabled: true, relatedViewPreserved: true } },
      layout: { class: 'DefaultLayout', config: { disabled: false } } });
    const group = (name: string, fields: string[]): any => ({ name, model: { class: 'GroupModel', config: {} },
      component: { class: 'GroupComponent', config: { readonly: true, disabled: true, relatedViewPreserved: true,
        componentDefinitions: fields.map(input) } } });
    const records = ['A', 'B'].map(oid => ({ redboxOid: oid,
      metaMetadata: { type: 'activity', brandId: 'default' },
      metadata: { title: `Activity ${oid}`, startDate: '2026-02-01', endDate: '2026-03-01' } }));
    const dates = group('dates', ['title', 'startDate', 'endDate']);
    dates.expressions = [{ name: 'populate', config: { conditionKind: 'jsonpointer',
      condition: '/source::field.value.changed', runOnFormReady: false, hasTemplate: true,
      target: 'model.value', template: 'event.value.records[0].metadata' } }];
    const config: FormConfigFrame = { name: 'related-view-groups',
      relatedRecords: { displayTargets: [], relations: [], sources: [{ relationId: 'activities',
        componentPointer: '/source', referenceTokens: ['activities'], oidTokens: ['oid'],
        referenceFingerprint: JSON.stringify({ values: ['A', 'B'], invalidIndices: [] }),
        initialResult: { status: 'resolved', issues: [], records },
      }] }, componentDefinitions: [
        { name: 'activities', model: { class: 'RepeatableModel', config: { value: [{ oid: 'A' }, { oid: 'B' }] } },
          component: { class: 'RepeatableComponent', config: { readonly: true, disabled: true, relatedViewPreserved: true,
            allowZeroRows: true, addButtonShow: true, elementTemplate: group('', ['oid']) } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: {
          relationId: 'activities', template: '{{#each relatedObjects}}<b>{{title}}</b>{{/each}}' } } },
        dates,
      ] };
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key, path, context) => {
        const template = path.reduce<any>((value, token) => value[token], config);
        return path.includes('expressions') ? jsonataCompileAndEvaluate(template, context) : handlebarsCompile(template)(context);
      },
    }] };
    let result!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(config, { editMode: false }, undefined, assets).then(value => { result = value; });
    flushMicrotasks(); tick(); result.fixture.detectChanges();
    expect(result.formComponent.form!.getRawValue().activities).toEqual([{ oid: 'A' }, { oid: 'B' }]);
    expect(result.formComponent.form!.getRawValue().dates).toEqual(records[0].metadata);
    const values = Array.from(result.fixture.nativeElement.querySelectorAll('input') as NodeListOf<HTMLInputElement>).map(input => input.value);
    expect(values).toEqual(['A', 'B', 'Activity A', '2026-02-01', '2026-03-01']);
    expect(result.fixture.nativeElement.textContent).toContain('Activity B');
    expect(recordService.resolveRelatedMetadata).not.toHaveBeenCalled();
    expect(result.formComponent.relatedState).toBe('ready');
    expect(result.formComponent.form!.pristine).toBeTrue();
    expect(result.fixture.nativeElement.querySelector('.rb-form-repeatable__add')).toBeNull();
    expect(result.fixture.nativeElement.querySelector('.rb-form-repeatable-item__remove')).toBeNull();
  }));

  it('keeps populated and empty view repeatables immutable without dirty or save requests', fakeAsync(() => {
    const config: FormConfigFrame = { name: 'readonly-related-view',
      relatedRecords: { displayTargets: [], relations: [], sources: [{
        relationId: 'activities', componentPointer: '/source', referenceTokens: ['selection'],
        referenceFingerprint: JSON.stringify({ values: ['A'], invalidIndices: [] }),
        initialResult: { status: 'resolved', issues: [], records: [{ redboxOid: 'A',
          metadata: { title: 'Activity A' }, metaMetadata: { type: 'activity', brandId: 'default' } }] },
      }] }, componentDefinitions: [
        { name: 'selection', component: { class: 'SimpleInputComponent', config: { readonly: true, disabled: true } },
          model: { class: 'SimpleInputModel', config: { value: 'A' } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities' } } },
        { name: 'titles', model: { class: 'RepeatableModel', config: { value: [] } },
          component: { class: 'RepeatableComponent', config: { readonly: true, disabled: true, allowZeroRows: true,
            elementTemplate: { name: '', model: { class: 'SimpleInputModel' },
              component: { class: 'SimpleInputComponent', config: { readonly: true, disabled: true } } } } },
          expressions: [{ name: 'populate', config: { conditionKind: 'jsonpointer',
            condition: '/source::field.value.changed', runOnFormReady: false, hasTemplate: true,
            target: 'model.value', template: 'event.value.records.metadata.title[]' } }] },
      ] };
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key, path, context) => jsonataCompileAndEvaluate(path.reduce<any>((value, token) => value[token], config), context),
    }] };
    let result!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(config, { editMode: false }, undefined, assets).then(value => { result = value; });
    flushMicrotasks(); tick();
    const form = result.formComponent.form!;
    const repeatable = result.formComponent.componentDefArr[2].component as RepeatableComponent;
    const save = spyOn(result.formComponent, 'saveForm').and.stub();
    const dirty = jasmine.createSpy('dirty');
    const sub = TestBed.inject(FormComponentEventBus).select$(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST).subscribe(dirty);
    expect(form.getRawValue().titles).toEqual(['Activity A']);
    const entry = (repeatable as any).compDefMapEntries[0];
    repeatable.removeElementFn(entry)();
    void repeatable.appendNewElement('Injected');
    flushMicrotasks(); tick(); result.fixture.detectChanges();
    expect(form.getRawValue().titles).toEqual(['Activity A']);
    expect(result.fixture.nativeElement.querySelector('.rb-form-repeatable-item__remove')).toBeNull();
    form.get('selection')!.setValue('');
    flushMicrotasks(); tick(); result.fixture.detectChanges();
    expect(form.getRawValue().titles).toEqual([]);
    expect(form.get('titles')!.disabled).toBeTrue();
    const add = result.fixture.nativeElement.querySelector('.rb-form-repeatable__add') as HTMLButtonElement;
    expect(add).toBeNull();
    void repeatable.appendNewElement('Injected');
    flushMicrotasks(); tick();
    expect(form.getRawValue().titles).toEqual([]);
    expect(form.pristine).toBeTrue();
    expect(dirty).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(recordService.update).not.toHaveBeenCalled();
    expect(recordService.create).not.toHaveBeenCalled();
    sub.unsubscribe();
  }));

  it('terminates an A-to-B-to-A reference expression loop and permits a fresh explicit refresh', fakeAsync(() => {
    const resultFor = (oid: string): RelatedMetadataEntry => ({ status: 'resolved', issues: [], records: [{
      redboxOid: oid, metadata: { title: oid }, metaMetadata: { type: 'activity', brandId: 'default' },
    }] });
    recordService.resolveRelatedMetadata.and.callFake(async request => {
      // Bound the regression even if cause propagation breaks and keeps toggling.
      if (recordService.resolveRelatedMetadata.calls.count() > 6) throw new Error('Feedback loop');
      return { activities: resultFor(request.references!['activities'] as string) };
    });
    const config: FormConfigFrame = { name: 'feedback',
      relatedRecords: { displayTargets: [], relations: [], sources: [{ relationId: 'activities',
        componentPointer: '/source', referenceTokens: ['selection'], initialResult: resultFor('A'),
        referenceFingerprint: JSON.stringify({ values: ['A'], invalidIndices: [] }),
      }] },
      componentDefinitions: [
        { name: 'selection', component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { value: 'A' } }, expressions: [{ name: 'toggle', config: {
            conditionKind: 'jsonpointer', condition: '/source::field.value.changed', runOnFormReady: false,
            hasTemplate: true, target: 'model.value',
            template: 'event.value.status = "resolved" ? (event.value.records[0].redboxOid = "A" ? "B" : "A") : formData.selection',
          } }] },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: { relationId: 'activities' } } },
      ],
    };
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key, path, context) => jsonataCompileAndEvaluate(path.reduce<any>((value, token) => value[token], config), context),
    }] };
    const events: FieldValueChangedEvent[] = [];
    const subscription = TestBed.inject(FormComponentEventBus).select$(FormComponentEventType.FIELD_VALUE_CHANGED)
      .subscribe(event => { if (event.fieldId === '/source') events.push(event); });
    let result!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(config, undefined, undefined, assets).then(value => { result = value; });
    flushMicrotasks(); tick();
    expect(result.formComponent.form!.getRawValue().selection).toBe('B');
    expect(recordService.resolveRelatedMetadata).toHaveBeenCalledTimes(1);
    const loading = events.find(event => event.value.loading)!;
    const completed = events.find(event => event.value.records[0]?.redboxOid === 'B')!;
    expect(loading.expressionChain!.length).toBeGreaterThan(1);
    expect(completed.expressionChain).toEqual(loading.expressionChain);
    const source = result.formComponent.componentDefArr[1].component as RelatedObjectDataComponent;
    void source.refreshRelatedData(true);
    flushMicrotasks(); tick();
    expect(result.formComponent.form!.getRawValue().selection).toBe('A');
    expect(recordService.resolveRelatedMetadata).toHaveBeenCalledTimes(3);
    subscription.unsubscribe();
  }));

  for (const matches of [false, true]) {
    it(`${matches ? 'renders matching bootstrap data after acceptance' : 'never renders mismatched server buckets while fetching the current selection'}`, fakeAsync(() => {
      const entry = (oid: string): RelatedMetadataEntry => ({ status: 'resolved', issues: [], records: [{
        redboxOid: oid, metadata: { title: `${oid} title` }, metaMetadata: { type: 'activity', brandId: 'default' },
      }] });
      let complete!: (value: RelatedMetadata) => void;
      recordService.resolveRelatedMetadata.and.returnValue(new Promise<RelatedMetadata>(resolve => { complete = resolve; }));
      const rendered: string[][] = [];
      const config: FormConfigFrame = { name: 'snapshot', relatedRecords: { displayTargets: [], relations: [], sources: [{
        relationId: 'activities', componentPointer: '/source', referenceTokens: ['selection'],
        initialResult: entry('A'), referenceFingerprint: JSON.stringify({ values: ['A'], invalidIndices: [] }),
      }] }, componentDefinitions: [
        { name: 'selection', component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { value: matches ? 'A' : 'B' } } },
        { name: 'source', component: { class: 'RelatedObjectDataComponent', config: {
          relationId: 'activities', template: 'compiled server-side',
          relatedObjects: [{ oid: 'A', title: 'UNVALIDATED snapshot' }], accessDeniedOids: ['old-denied'], failedOids: ['old-failed'],
        } } },
      ] };
      const assets: DynamicAssetOptions = { entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
        callable: (_key, _path, context) => {
          rendered.push(context.relatedObjects.map((item: { title: string }) => item.title));
          expect(context.accessDeniedOids).toEqual([]);
          expect(context.failedOids).toEqual([]);
          return handlebarsCompile('{{#each relatedObjects}}<b>{{title}}</b>{{/each}}')(context);
        },
      }] };
      let result!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
      void createFormAndWaitForReady(config, undefined, undefined, assets).then(value => { result = value; });
      flushMicrotasks(); tick();
      expect(rendered[0]).toEqual([]);
      expect(rendered.flat()).not.toContain('UNVALIDATED snapshot');
      if (matches) {
        expect(recordService.resolveRelatedMetadata).not.toHaveBeenCalled();
        expect(result.fixture.nativeElement.textContent).toContain('A title');
      } else {
        expect(recordService.resolveRelatedMetadata).toHaveBeenCalledTimes(1);
        expect(rendered.every(titles => titles.length === 0)).toBeTrue();
        expect(result.fixture.nativeElement.textContent).not.toContain('A title');
        complete({ activities: entry('B') });
        flushMicrotasks(); tick(); result.fixture.detectChanges();
        expect(result.fixture.nativeElement.textContent).toContain('B title');
        expect(rendered.flat()).not.toContain('A title');
      }
    }));
  }

  it('renders server-injected related object buckets without requiring content', async () => {
    const assets: DynamicAssetOptions = { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/oid-generated-',
      callable: (_key: string, _path: (string | number)[], context: Record<string, unknown>) =>
        handlebarsCompile('{{#each relatedObjects}}<b>{{title}}</b>{{/each}}{{#each accessDeniedOids}}<i>denied:{{this}}</i>{{/each}}{{#each failedOids}}<u>failed:{{this}}</u>{{/each}}')(context),
    }] };
    const formConfig: FormConfigFrame = {
      name: 'testing',
      componentDefinitions: [{ name: 'related', component: { class: 'RelatedObjectDataComponent', config: {
        template: 'compiled server-side',
        relatedObjects: [{ oid: 'one', title: 'One' }],
        accessDeniedOids: ['two'],
        failedOids: ['three'],
      } } }],
    };
    const { fixture } = await createFormAndWaitForReady(formConfig, undefined, undefined, assets);
    expect(fixture.nativeElement.hasAttribute('data-rb-related-state')).toBeFalse();
    expect(utilityService.getDynamicImport).toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('One');
    expect(fixture.nativeElement.textContent).toContain('denied:two');
    expect(fixture.nativeElement.textContent).toContain('failed:three');
  });
});

describe('RelatedObjectDataComponent request lifecycle', () => {
  let component: RelatedObjectDataComponent;
  let service: jasmine.SpyObj<RecordService>;
  let bus: jasmine.SpyObj<FormComponentEventBus>;
  let form: FormGroup;
  const resolved = (title: string): RelatedMetadataEntry => ({ status: 'resolved', issues: [], records: [{
    redboxOid: title, metadata: { title }, metaMetadata: { type: 'activity', brandId: 'default' },
  }] });
  const pending = () => {
    let resolve!: (value: RelatedMetadata) => void;
    const promise = new Promise<RelatedMetadata>(done => { resolve = done; });
    return { promise, resolve };
  };
  beforeEach(async () => {
    service = jasmine.createSpyObj('RecordService', ['resolveRelatedMetadata']);
    bus = jasmine.createSpyObj('FormComponentEventBus', ['publish', 'select$']);
    bus.select$.and.returnValue(EMPTY);
    await createTestbedModule({ declarations: { RelatedObjectDataComponent }, providers: {
      RelatedDataStateService: { provide: RelatedDataStateService, useClass: RelatedDataStateService },
      RecordService: { provide: RecordService, useValue: service },
      FormComponentEventBus: { provide: FormComponentEventBus, useValue: bus },
      HandlebarsTemplateService: { provide: HandlebarsTemplateService, useValue: {} },
    } });
    component = TestBed.createComponent(RelatedObjectDataComponent).componentInstance;
    form = new FormGroup({ 'canonical/reference': new FormControl('A') });
    spyOnProperty(component as any, 'formComponent', 'get').and.returnValue({
      form, trimmedParams: { oid: () => 'root', recordType: () => 'plan' },
    });
    (component as any).descriptor = {
      relationId: 'activities', componentPointer: '/hidden/source', referenceTokens: ['canonical/reference'],
    };
  });
  function lastValue() { return bus.publish.calls.mostRecent().args[0] as unknown as { value: RelatedMetadataEntry & { loading?: boolean } }; }

  it('skips whole-form snapshots and cloning when an unrelated value changes', async () => {
    service.resolveRelatedMetadata.and.resolveTo({ activities: resolved('A') });
    await component.refreshRelatedData();
    const snapshot = spyOn(form, 'getRawValue').and.callThrough();
    const clone = spyOn(globalThis, 'structuredClone').and.callThrough();
    form.addControl('unrelated', new FormControl({ large: 'independent value' }));
    await component.refreshRelatedData();
    expect(snapshot).not.toHaveBeenCalled();
    expect(clone).not.toHaveBeenCalled();
    expect(service.resolveRelatedMetadata).toHaveBeenCalledTimes(1);
  });

  it('snapshots disabled nested object references before asynchronous rendering', fakeAsync(() => {
    const reference = { oid: 'A', label: 'Original' };
    form.setControl('canonical/reference', new FormGroup({ selection: new FormControl(reference) }));
    form.disable();
    Object.assign((component as any).descriptor, { referenceTokens: ['canonical/reference', 'selection'], oidTokens: ['oid'] });
    let releaseRender!: () => void;
    const render = new Promise<void>(resolve => { releaseRender = resolve; });
    spyOn(component as any, 'refreshContent').and.returnValue(render);
    service.resolveRelatedMetadata.and.resolveTo({ activities: resolved('A') });
    void component.refreshRelatedData(); flushMicrotasks();
    reference.oid = 'B';
    releaseRender(); flushMicrotasks();
    expect(service.resolveRelatedMetadata.calls.mostRecent().args[0].references).toEqual({ activities: { oid: 'A', label: 'Original' } });
  }));

  it('clears immediately and ignores delayed A after B, including disabled references', fakeAsync(() => {
    const a = pending(); const b = pending();
    service.resolveRelatedMetadata.and.returnValues(a.promise, b.promise);
    form.disable();
    const first = component.refreshRelatedData();
    expect(lastValue().value.loading).toBeTrue();
    flushMicrotasks();
    form.get('canonical/reference')!.setValue('B');
    const second = component.refreshRelatedData();
    flushMicrotasks();
    const state = TestBed.inject(RelatedDataStateService);
    expect(state.state).toBe('pending');
    b.resolve({ activities: resolved('B') }); flushMicrotasks();
    expect(state.state).toBe('ready');
    a.resolve({ activities: resolved('A') }); flushMicrotasks();
    expect(state.state).toBe('ready');
    expect(lastValue().value.records[0].redboxOid).toBe('B');
    expect(service.resolveRelatedMetadata.calls.mostRecent().args[0].references).toEqual({ activities: 'B' });
  }));

  it('reuses only a matching bootstrap result and explicitly refreshes the same ID', async () => {
    Object.assign((component as any).descriptor, { initialResult: resolved('initial'),
      referenceFingerprint: JSON.stringify({ values: ['A'], invalidIndices: [] }) });
    await component.refreshRelatedData(false, true);
    expect(service.resolveRelatedMetadata).not.toHaveBeenCalled();
    expect(lastValue().value.records[0].redboxOid).toBe('initial');
    service.resolveRelatedMetadata.and.resolveTo({ activities: resolved('fresh') });
    await component.refreshRelatedData(true);
    expect(lastValue().value.records[0].redboxOid).toBe('fresh');
  });

  it('snapshots expression and behaviour causes for loading and completion', async () => {
    service.resolveRelatedMetadata.and.resolveTo({ activities: resolved('A') });
    const origin = { expressionChain: ['expression'], behaviourChain: [2] };
    const refresh = component.refreshRelatedData(false, false, origin);
    origin.expressionChain.push('later-expression');
    origin.behaviourChain.push(3);
    await refresh;
    for (const call of bus.publish.calls.all()) {
      expect(call.args[0]).toEqual(jasmine.objectContaining({
        expressionChain: ['expression', 'RelatedObjectDataComponent:/hidden/source'], behaviourChain: [2],
      }));
    }
    expect(bus.publish).toHaveBeenCalledTimes(2);
  });

  it('unlinks without reading and invalidates an in-flight result', fakeAsync(() => {
    const a = pending(); service.resolveRelatedMetadata.and.returnValue(a.promise);
    const first = component.refreshRelatedData(); flushMicrotasks();
    form.get('canonical/reference')!.setValue(null);
    void component.refreshRelatedData(); flushMicrotasks();
    a.resolve({ activities: resolved('A') }); flushMicrotasks();
    expect(lastValue().value).toEqual({ status: 'empty', records: [], issues: [] });
    expect(service.resolveRelatedMetadata).toHaveBeenCalledTimes(1);
  }));

  it('keeps template rendering pending after fetch completion and records required failures', fakeAsync(() => {
    const response = pending();
    service.resolveRelatedMetadata.and.returnValue(response.promise);
    let releaseRender!: () => void;
    const render = new Promise<void>(resolve => { releaseRender = resolve; });
    spyOn(component as any, 'refreshContent').and.callFake(() => lastValue().value.loading ? Promise.resolve() : render);
    (component as any).descriptor.required = true;
    void component.refreshRelatedData(); flushMicrotasks();
    response.resolve({ activities: { status: 'unavailable', records: [], issues: [] } });
    flushMicrotasks();
    expect(TestBed.inject(RelatedDataStateService).state).toBe('pending');
    releaseRender(); flushMicrotasks();
    expect(TestBed.inject(RelatedDataStateService).state).toBe('error');
  }));

  it('publishes a safe failure without previous values', async () => {
    service.resolveRelatedMetadata.and.resolveTo({ activities: resolved('A') });
    await component.refreshRelatedData();
    service.resolveRelatedMetadata.and.rejectWith(new Error('private source details'));
    form.get('canonical/reference')!.setValue('B');
    await component.refreshRelatedData();
    expect(lastValue().value).toEqual({ status: 'failed', records: [], issues: [{ code: 'source-read-failed' }] });
  });

  it('does not publish after destruction', fakeAsync(() => {
    const a = pending(); service.resolveRelatedMetadata.and.returnValue(a.promise);
    const first = component.refreshRelatedData(); flushMicrotasks();
    expect(TestBed.inject(RelatedDataStateService).state).toBe('pending');
    component.ngOnDestroy();
    expect(TestBed.inject(RelatedDataStateService).state).toBe('ready');
    const count = bus.publish.calls.count();
    a.resolve({ activities: resolved('A') }); flushMicrotasks();
    void component.refreshRelatedData(true); flushMicrotasks();
    expect(bus.publish.calls.count()).toBe(count);
  }));
});
