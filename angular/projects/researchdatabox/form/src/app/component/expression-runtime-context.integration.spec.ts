import { By } from '@angular/platform-browser';
import { Location } from '@angular/common';
import { RecordActionResult } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { createFormDefinitionReadyEvent } from '../form-state/events/form-component-event.types';
import { TestBed } from '@angular/core/testing';
import { FormConfigFrame, jsonataCompile } from '@researchdatabox/sails-ng-common';
import { FormComponentsMap, FormService } from '../form.service';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { ContentComponent } from './content.component';
import { SimpleInputComponent } from './simple-input.component';

// The role/status template is the SCU submitted-record field lock. The source
// pointer is local to this minimal fixture; lifecycle matching is unchanged.
const template = '($not(("Admin" in runtimeContext.user.roles or "Librarians" in runtimeContext.user.roles)) and formData.scu_rdmp_editable_status = "view")';

describe('Expression runtime context integration', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent, ContentComponent } });
  });

  for (const editMode of [false, true]) {
    it(`round3 keeps template-free visibility on readiness in editMode=${editMode} and applies later values`, async () => {
      const config: FormConfigFrame = { name: 'template-free-ready', componentDefinitions: [
        { name: 'source', model: { class: 'SimpleInputModel', config: { value: false as never } },
          component: { class: 'SimpleInputComponent', config: { type: 'hidden' } } },
        { name: 'answer', component: { class: 'ContentComponent', config: { visible: false, content: 'Conditional answer' } },
          expressions: [{ name: 'copy-source', config: { condition: '/source::field.value.changed',
            target: 'component.visible', runInViewMode: true } as never }] },
      ] };
      const { fixture, formComponent } = await createFormAndWaitForReady(config, { editMode });
      await new Promise<void>(resolve => setTimeout(resolve, 20));
      await fixture.whenStable(); fixture.detectChanges();
      const content = fixture.debugElement.query(By.directive(ContentComponent)).componentInstance as ContentComponent;
      expect(content.isVisible).toBeFalse();
      expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('Conditional answer');
      formComponent.form!.get('source')!.setValue(true);
      await fixture.whenStable(); fixture.detectChanges();
      expect(content.isVisible).toBeTrue();
      formComponent.form!.get('source')!.setValue(false);
      await fixture.whenStable(); fixture.detectChanges();
      expect(content.isVisible).toBeFalse();
      fixture.destroy();
    });
  }

  for (const scenario of [
    { editMode: false, runOnFormReady: true, expected: true },
    { editMode: true, runOnFormReady: true, expected: true },
    { editMode: false, runOnFormReady: false, expected: false },
  ]) {
    it(`copies an initially true retained source with runOnFormReady=${scenario.runOnFormReady} in editMode=${scenario.editMode}`, async () => {
      const config: FormConfigFrame = { name: 'template-free-initial', componentDefinitions: [
        { name: 'source', model: { class: 'SimpleInputModel', config: { value: true as never } },
          component: { class: 'SimpleInputComponent', config: { type: 'hidden' } } },
        { name: 'answer', component: { class: 'ContentComponent', config: { visible: false, content: 'Conditional answer' } },
          expressions: [{ name: 'copy-source', config: { condition: '/source::field.value.changed',
            target: 'component.visible', runInViewMode: true, runOnFormReady: scenario.runOnFormReady } as never }] },
      ] };
      const { fixture } = await createFormAndWaitForReady(config, { editMode: scenario.editMode });
      await new Promise<void>(resolve => setTimeout(resolve, 20));
      await fixture.whenStable(); fixture.detectChanges();
      const content = fixture.debugElement.query(By.directive(ContentComponent)).componentInstance as ContentComponent;
      expect(content.isVisible).toBe(scenario.expected);
      fixture.destroy();
    });
  }

  for (const scenario of [
    { name: 'flagged view rule', editMode: false, flagged: true, ready: true, expected: 2 },
    { name: 'unflagged view rule', editMode: false, flagged: false, ready: true, expected: 0 },
    { name: 'view rule opting out of form ready', editMode: false, flagged: true, ready: false, expected: 0 },
    { name: 'flagged edit rule with a model-free source', editMode: true, flagged: true, ready: true, expected: 0 },
    { name: 'flagged edit rule with a modeled source', editMode: true, flagged: true, ready: true, modeled: true, expected: 2 },
    { name: 'flagged view rule with a retained modeled source', editMode: false, flagged: true, ready: true, modeled: true, expected: 2 },
  ]) {
    it(`initializes ${scenario.name}`, async () => {
      const authority = { record: { type: 'rdmp', metadata: { show: true } } };
      const service = TestBed.inject(FormService);
      const createMap = service.createFormComponentsMap.bind(service);
      spyOn(service, 'createFormComponentsMap').and.callFake((config, paths, meta, mode, concurrency) =>
        createMap(config, paths, { ...meta, runtimeContext: authority }, mode, concurrency),
      );
      const config: FormConfigFrame = {
        name: 'saved-visibility',
        componentDefinitions: [
          ...('modeled' in scenario ? [{ name: 'source', model: { class: 'SimpleInputModel' as const, config: { value: 'yes' } },
            component: { class: 'SimpleInputComponent' as const, config: { type: 'hidden' as const } } }] : [{
            name: 'source', component: { class: 'ContentComponent' as const, config: { content: 'Source without a model' } },
          }]),
          // Retained inputs still publish their own initial events. They must not
          // initialize the flagged rule again or substitute for its source.
          ...['title', 'other'].map(name => ({ name,
            model: { class: 'SimpleInputModel' as const, config: { value: name } },
            component: { class: 'SimpleInputComponent' as const, config: { type: 'hidden' as const } },
          })),
          { name: 'saved', component: { class: 'ContentComponent', config: { visible: false, content: 'Saved answer' } },
            expressions: ['first', 'second'].map(name => ({ name, config: {
              conditionKind: 'jsonpointer' as const, condition: '/source::field.value.changed',
              target: 'component.visible', runInViewMode: scenario.flagged,
              runOnFormReady: scenario.ready, hasTemplate: true,
              template: 'runtimeContext.record.metadata.show',
            } })),
          },
        ],
      };
      const calls: string[] = [];
      let active = 0;
      let maxActive = 0;
      const { fixture, formComponent } = await createFormAndWaitForReady(config, { editMode: scenario.editMode }, undefined, {
        entries: [{
          urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/',
          callable: async (_keyString, key, context) => {
            calls.push(JSON.stringify(key));
            maxActive = Math.max(maxActive, ++active);
            await new Promise<void>(resolve => setTimeout(resolve, 0));
            active--;
            return jsonataCompile('runtimeContext.record.metadata.show').evaluate(context);
          },
        }],
      });
      await new Promise<void>(resolve => setTimeout(resolve, 20));
      await fixture.whenStable();
      fixture.detectChanges();
      const contents = fixture.debugElement.queryAll(By.directive(ContentComponent));
      const content = contents[contents.length - 1].componentInstance as ContentComponent;
      expect(config.componentDefinitions![3].component.config!.visible).toBeFalse();
      expect(formComponent.form!.get('source') !== null).toBe('modeled' in scenario);
      expect(content.isVisible).toBe(scenario.expected > 0);
      expect(calls.length).toBe(scenario.expected);
      if (scenario.expected) {
        expect(calls[0]).toContain('\"expressions\",0,\"config\",\"template\"');
        expect(calls[1]).toContain('\"expressions\",1,\"config\",\"template\"');
        expect(maxActive).toBe(1);
        expect((fixture.nativeElement as HTMLElement).textContent).toContain('Saved answer');
      }
      if (scenario.name === 'flagged view rule') {
        // A second ready notification for this binding must not initialize it
        // again. Replacing the form creates new bindings and initializes once.
        TestBed.inject(FormComponentEventBus).publish(createFormDefinitionReadyEvent({}));
        await fixture.whenStable();
        expect(calls.length).toBe(2);
        await formComponent.downloadAndCreateFormComponents(config);
        await new Promise<void>(resolve => setTimeout(resolve, 20));
        await fixture.whenStable();
        expect(calls.length).toBe(4);
        expect(maxActive).toBe(1);
      }
      fixture.destroy();
    });
  }

  for (const scenario of [
    { kind: 'jsonata' as const, condition: 'false', visible: false },
    { kind: 'jsonata' as const, condition: 'true', visible: true },
    { kind: 'jsonata_query' as const, condition: '$exists(querySource.missing)', visible: false },
    { kind: 'jsonata_query' as const, condition: '$exists(querySource)', visible: true },
    { kind: 'jsonpointer' as const, condition: undefined, visible: true },
  ]) {
    it(`honours the view-ready predicate ${scenario.kind}: ${scenario.condition}`, async () => {
      const service = TestBed.inject(FormService);
      const createMap = service.createFormComponentsMap.bind(service);
      spyOn(service, 'createFormComponentsMap').and.callFake((config, paths, meta, mode, concurrency) =>
        createMap(config, paths, { ...meta, runtimeContext: { record: { type: 'rdmp' } } }, mode, concurrency));
      const config: FormConfigFrame = { name: 'ready-predicate', componentDefinitions: [
        { name: 'answer', component: { class: 'ContentComponent', config: { visible: false, content: 'Answer' } },
          expressions: [{ name: 'conditional', config: {
            conditionKind: scenario.kind, condition: scenario.condition,
            runInViewMode: true, hasTemplate: true, template: 'true', target: 'component.visible',
          } }] },
      ] };
      const evaluations: string[] = [];
      const { fixture } = await createFormAndWaitForReady(config, { editMode: false }, undefined, { entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/',
        callable: async (_keyString, key, context) => {
          const property = String(key[key.length - 1]);
          evaluations.push(property);
          return jsonataCompile(property === 'condition' ? scenario.condition! : 'true').evaluate(context);
        },
      }] });
      await new Promise<void>(resolve => setTimeout(resolve, 20));
      await fixture.whenStable();
      fixture.detectChanges();
      const content = fixture.debugElement.query(By.directive(ContentComponent)).componentInstance as ContentComponent;
      expect(content.isVisible).toBe(scenario.visible);
      expect(evaluations.filter(property => property === 'template').length).toBe(scenario.visible ? 1 : 0);
      if (scenario.condition !== undefined) expect(evaluations[0]).toBe('condition');
      TestBed.inject(FormComponentEventBus).publish(createFormDefinitionReadyEvent({}));
      await fixture.whenStable();
      expect(evaluations.filter(property => property === 'template').length).toBe(scenario.visible ? 1 : 0);
      fixture.destroy();
    });
  }

  for (const roles of [[], ['Researcher'], ['Admin'], ['Librarians']]) {
    it(`uses server roles ${JSON.stringify(roles)} for initial and later field expressions`, async () => {
      const authority = { user: { roles }, record: { type: 'rdmp', hasEditAccess: true } };
      const service = TestBed.inject(FormService);
      const createMap = service.createFormComponentsMap.bind(service);
      spyOn(service, 'createFormComponentsMap').and.callFake((config, paths, meta, mode, concurrency) =>
        createMap(config, paths, { ...meta, runtimeContext: authority }, mode, concurrency));
      const config: FormConfigFrame = { name: 'runtime-context', componentDefinitions: [
        { name: 'scu_rdmp_editable_status', model: { class: 'SimpleInputModel', config: { value: 'view' } }, component: { class: 'SimpleInputComponent', config: { type: 'hidden' } } },
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } }, component: { class: 'SimpleInputComponent' }, expressions: [{ name: 'role-lock', config: {
          conditionKind: 'jsonpointer', condition: '/scu_rdmp_editable_status::field.value.changed', target: 'field.disabled', hasTemplate: true, template, runOnFormReady: true,
        } }] },
      ] };
      const contexts: unknown[] = [];
      const { fixture, formComponent } = await createFormAndWaitForReady(config, {
        oid: 'current-oid', recordType: 'rdmp', editMode: true, formName: 'runtime-context', downloadAndCreateOnInit: false,
      }, undefined, { entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/current-oid',
        callable: (_keyString, _key, context) => {
          contexts.push(structuredClone(context.runtimeContext));
          return jsonataCompile(template).evaluate(context);
        },
      }] });
      // Drain asynchronous compiled-expression evaluation before inspecting the DOM.
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      await fixture.whenStable();
      fixture.detectChanges();
      const input = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
      const initiallyLocked = !roles.some(role => ['Admin', 'Librarians'].includes(role));
      expect(input.disabled).toBe(initiallyLocked);
      expect(contexts.length).toBeGreaterThan(0);
      expect(contexts[0]).toEqual({ ...authority, oid: 'current-oid', requestParams: {} });

      formComponent.form!.get('scu_rdmp_editable_status')!.setValue('edit');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(input.disabled).toBeFalse();
      const afterEditCount = contexts.length;
      formComponent.form!.get('scu_rdmp_editable_status')!.setValue('view');
      await fixture.whenStable();
      fixture.detectChanges();
      expect(input.disabled).toBe(initiallyLocked);
      expect(contexts.length).toBeGreaterThan(afterEditCount);
      expect(contexts.every(context => JSON.stringify(context) === JSON.stringify(contexts[0]))).toBeTrue();
      expect(formComponent.form!.get('title')!.value).toBe('Loaded title');
    });
  }
  it('isolates initial query context, getters and content templates from mutable server metadata', async () => {
    const authority = { user: { roles: ['Researcher'] }, record: { type: 'rdmp', hasEditAccess: false } };
    const workflow = { stage: 'draft' };
    const service = TestBed.inject(FormService);
    const createMap = service.createFormComponentsMap.bind(service);
    spyOn(service, 'createFormComponentsMap').and.callFake((config, paths, meta, mode, concurrency) =>
      createMap(config, paths, { ...meta, runtimeContext: authority, workflow }, mode, concurrency));
    const config: FormConfigFrame = { name: 'isolated-context', componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Original' } }, component: { class: 'SimpleInputComponent' } },
      { name: 'content', component: { class: 'ContentComponent', config: { content: {}, template: '{{oid}}' } } },
    ] };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: 'current-oid' }, undefined, { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/current-oid',
      callable: (_keyString, _key, context) => {
        const data = context as {
          runtimeContext: typeof authority;
          workflow: typeof workflow;
          formData: { title?: string };
        };
        data.runtimeContext.user.roles.push('Admin');
        data.runtimeContext.record.hasEditAccess = true;
        data.workflow.stage = 'spoofed';
        if (data.formData.title) data.formData.title = 'Corrupted';
        return 'rendered';
      },
    }] });
    expect(authority).toEqual({ user: { roles: ['Researcher'] }, record: { type: 'rdmp', hasEditAccess: false } });
    expect(workflow.stage).toBe('draft');
    expect(formComponent.form!.getRawValue()['title']).toBe('Original');
    formComponent.refreshRequestParamsFromUrl('http://localhost/?source=a&source=b');
    const context = formComponent.getExpressionRuntimeContext() as typeof authority & { requestParams: { source: string[] } };
    context.user.roles.push('Librarians');
    context.requestParams.source.push('mutated');
    const query = formComponent.getQuerySource()!.runtimeContext as typeof context;
    query.record.hasEditAccess = true;
    query.requestParams.source.push('query-mutated');
    expect(formComponent.getExpressionRuntimeContext()).toEqual({ ...authority, oid: 'current-oid', requestParams: { source: ['a', 'b'] } });
    expect(authority.record.hasEditAccess).toBeFalse();
    fixture.destroy();
  });

  it('replaces a loaded record and keeps a pending old expression out of the new form', async () => {
    let authority = { user: { roles: ['Researcher'] }, record: { type: 'rdmp', hasEditAccess: false } };
    const service = TestBed.inject(FormService);
    const createMap = service.createFormComponentsMap.bind(service);
    spyOn(service, 'createFormComponentsMap').and.callFake((config, paths, meta, mode, concurrency) =>
      createMap(config, paths, { ...meta, runtimeContext: authority }, mode, concurrency));
    let release!: (value: string) => void;
    let started!: () => void;
    const pending = new Promise<string>(resolve => { release = resolve; });
    const evaluating = new Promise<void>(resolve => { started = resolve; });
    const config: FormConfigFrame = { name: 'first', componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'First' } }, component: { class: 'SimpleInputComponent' }, expressions: [{ name: 'delayed', config: {
        target: 'model.value', hasTemplate: true, template: 'value', condition: '/title::field.value.changed', conditionKind: 'jsonpointer', runOnFormReady: false,
      } }] },
    ] };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: 'first-oid' }, undefined, { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/',
      callable: () => { started(); return pending; },
    }] });
    formComponent.form!.get('title')!.setValue('Trigger');
    await evaluating;
    authority = { user: { roles: ['Admin'] }, record: { type: 'dataset', hasEditAccess: true } };
    formComponent.oid.set('second-oid');
    await formComponent.downloadAndCreateFormComponents({ name: 'second', componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Second' } }, component: { class: 'SimpleInputComponent' } },
    ] });
    release('Stale result');
    await fixture.whenStable();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(1);
    expect(formComponent.form!.get('title')!.value).toBe('Second');
    expect(formComponent.getQuerySource()!.runtimeContext).toEqual({ ...authority, oid: 'second-oid', requestParams: {} });
    fixture.destroy();
  });

  for (const outcome of ['resolves', 'rejects']) {
    it(`keeps the newer record and authority when an earlier download ${outcome} last`, async () => {
      const config = (value: string): FormConfigFrame => ({ name: value, componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value } }, component: { class: 'SimpleInputComponent' } },
      ] });
      const { fixture, formComponent } = await createFormAndWaitForReady(config('Initial'), { oid: 'initial-oid' });
      const service = TestBed.inject(FormService);
      const paths = service.buildLineagePaths({ angularComponents: [], dataModel: [], formConfig: ['componentDefinitions'], layout: [] });
      const older = await service.createFormComponentsMap(config('Older'), paths, {
        runtimeContext: { user: { roles: ['Researcher'] }, record: { type: 'rdmp', hasEditAccess: false } },
      });
      const authority = { user: { roles: ['Admin'] }, record: { type: 'dataset', hasEditAccess: true } };
      const newer = await service.createFormComponentsMap(config('Newer'), paths, { runtimeContext: authority });
      let release!: (map: FormComponentsMap) => void;
      let reject!: (error: Error) => void;
      const pending = new Promise<FormComponentsMap>((resolve, fail) => { release = resolve; reject = fail; });
      spyOn(service, 'downloadFormComponents').and.callFake(oid => oid === 'older-oid' ? pending : Promise.resolve(newer));
      formComponent.oid.set('older-oid');
      const loadingOlder = formComponent.downloadAndCreateFormComponents();
      expect(formComponent.componentDefArr).toEqual([]);
      formComponent.refreshRequestParamsFromUrl('http://localhost/?source=newer');
      expect(formComponent.getQuerySource()).toBeUndefined();
      formComponent.oid.set('newer-oid');
      await formComponent.downloadAndCreateFormComponents();
      if (outcome === 'resolves') release(older);
      else reject(new Error('Superseded download failed'));
      await expectAsync(loadingOlder).toBeResolved();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(formComponent.form!.get('title')!.value).toBe('Newer');
      expect(formComponent.getExpressionRuntimeContext()).toEqual({ ...authority, oid: 'newer-oid', requestParams: { source: 'newer' } });
      expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(1);
      fixture.destroy();
    });
  }

  it('does not reconnect a replaced field that finishes initializing after the next record loads', async () => {
    const config = (value: string): FormConfigFrame => ({ name: value, componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel', config: { value } }, component: { class: 'SimpleInputComponent' } },
    ] });
    const { fixture, formComponent } = await createFormAndWaitForReady(config('Initial'), { oid: 'initial-oid' });
    const service = TestBed.inject(FormService);
    const paths = service.buildLineagePaths({ angularComponents: [], dataModel: [], formConfig: ['componentDefinitions'], layout: [] });
    const older = await service.createFormComponentsMap({ ...config('Older'), componentDefinitions: [
      ...config('Older').componentDefinitions!,
      { name: 'oldExtra', model: { class: 'SimpleInputModel', config: { value: 'Old extra' } }, component: { class: 'SimpleInputComponent' } },
    ] }, paths);
    const newer = await service.createFormComponentsMap(config('Newer'), paths);
    spyOn(service, 'downloadFormComponents').and.callFake(oid => Promise.resolve(oid === 'older-oid' ? older : newer));
    let release!: () => void;
    let started!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const initializing = new Promise<void>(resolve => { started = resolve; });
    const init = SimpleInputComponent.prototype.initComponent;
    spyOn(SimpleInputComponent.prototype, 'initComponent').and.callFake(async function(this: SimpleInputComponent, entry) {
      await init.call(this, entry);
      if (entry?.model?.formControl?.value === 'Older') {
        started();
        await pending;
      }
    });
    formComponent.oid.set('older-oid');
    const loadingOlder = formComponent.downloadAndCreateFormComponents();
    await initializing;
    formComponent.oid.set('newer-oid');
    await formComponent.downloadAndCreateFormComponents();
    release();
    await loadingOlder;
    const staleValues: unknown[] = [];
    const subscription = TestBed.inject(FormComponentEventBus).select$('field.value.changed').subscribe(event => staleValues.push(event.value));
    older.components[0].model!.formControl!.setValue('Stale field change');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(staleValues).toEqual([]);
    expect(formComponent.form!.get('title')!.value).toBe('Newer');
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('input[type="text"]').length).toBe(1);
    subscription.unsubscribe();
    fixture.destroy();
  });

  it('discards a form download that completes after its host is destroyed', async () => {
    const config: FormConfigFrame = { name: 'pending-record', componentDefinitions: [
      { name: 'title', model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' } },
    ] };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: 'initial-oid' });
    const service = TestBed.inject(FormService);
    const downloaded = await service.createFormComponentsMap(config, service.buildLineagePaths({ angularComponents: [], dataModel: [], formConfig: ['componentDefinitions'], layout: [] }));
    let release!: (map: FormComponentsMap) => void;
    const pending = new Promise<FormComponentsMap>(resolve => { release = resolve; });
    spyOn(service, 'downloadFormComponents').and.returnValue(pending);
    const loading = formComponent.downloadAndCreateFormComponents();
    fixture.destroy();
    release(downloaded);
    await expectAsync(loading).toBeResolved();
    expect(formComponent.formDefMap).toBeUndefined();
    expect(formComponent.componentDefArr).toEqual([]);
  });

  it('publishes the created OID to save-success observers and later field expressions', async () => {
    const contexts: unknown[] = [];
    const config: FormConfigFrame = { name: 'create-context', componentDefinitions: [
      { name: 'source', model: { class: 'SimpleInputModel', config: { value: 'Before' } }, component: { class: 'SimpleInputComponent' } },
      { name: 'target', model: { class: 'SimpleInputModel' }, component: { class: 'SimpleInputComponent' }, expressions: [{ name: 'copy', config: {
        target: 'model.value', condition: '/source::field.value.changed', conditionKind: 'jsonpointer', hasTemplate: true, template: 'runtimeContext.oid', runOnFormReady: false,
      } }] },
    ] };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: '', editMode: true }, undefined, { entries: [{
      urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp/',
      callable: (_keyString, _key, context) => {
        const runtime = (context as { runtimeContext: { oid: string } }).runtimeContext;
        contexts.push(structuredClone(runtime));
        return runtime.oid;
      },
    }] });
    const response = Object.assign(new RecordActionResult(), { success: true, oid: 'created-oid', outcome: 'saved' as const });
    spyOn(response, 'isComplete').and.returnValue(true);
    spyOn(formComponent.recordService, 'create').and.resolveTo(response);
    spyOn(TestBed.inject(Location), 'replaceState').and.stub();
    const observed: unknown[] = [];
    const subscription = TestBed.inject(FormComponentEventBus).select$('form.save.success').subscribe(() => {
      observed.push(formComponent.getQuerySource()?.runtimeContext);
    });
    await formComponent.saveForm({ force: true });
    expect(observed).toEqual([{ oid: 'created-oid', requestParams: {} }]);
    contexts.length = 0;
    formComponent.form!.get('source')!.setValue('After');
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    await fixture.whenStable();
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.every(context => (context as { oid: string }).oid === 'created-oid')).toBeTrue();
    expect(formComponent.form!.get('target')!.value).toBe('created-oid');
    subscription.unsubscribe();
    fixture.destroy();
  });

});
