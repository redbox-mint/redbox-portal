import { Location } from '@angular/common';
import { RecordActionResult } from '@researchdatabox/portal-ng-common';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
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
