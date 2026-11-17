import { TestBed } from '@angular/core/testing';
import { LoggerService } from '@researchdatabox/portal-ng-common';
import { FormServerSyncService } from '../../form-server-sync.service';
import { signal } from '@angular/core';
import { rebaseRecordValues, retainRelatedDisplayValues } from '@researchdatabox/sails-ng-common';
import { FormArray, FormControl, FormGroup } from '@angular/forms';
import { FormComponent } from '../../form.component';
import { FormService } from '../../form.service';
import { RelatedFormDescriptors, projectRelatedDisplayMetadata } from '@researchdatabox/sails-ng-common';

// Record the actual default random seed without changing Karma/Jasmine options.
jasmine.getEnv().addReporter({ jasmineStarted: info => console.info(`RR-12 Jasmine random=${info.order.random} seed=${info.order.seed}`) });

const contract: RelatedFormDescriptors = {
  displayTargets: [{ metadataPointer: '/group/title', relationId: 'activity' }, { metadataPointer: '/rows', relationId: 'activity' }],
  relations: [{ relationId: 'activity', referenceTokens: ['reference'] }], sources: [],
};

describe('FormComponent related display submission and comparison', () => {
  let component: any;
  beforeEach(() => {
    component = Object.create(FormComponent.prototype);
    component.formService = { shouldIncludeInFormControlMap: () => true };
    component.formDefMap = { formConfig: { relatedRecords: contract }, completeGroupMap: {} };
    component.form = new FormGroup({
      reference: new FormControl('a'),
      group: new FormGroup({ title: new FormControl('source'), local: new FormControl('answer') }),
      rows: new FormControl([{ value: 'source' }]),
    });
  });

  it('serializes enabled/disabled nested and repeatable targets identically; refresh is no local change', () => {
    const initial = component.getPersistedFormValue();
    component.form.controls.group.controls.title.disable();
    component.form.controls.rows.disable();
    component.form.controls.group.controls.title.setValue('refreshed');
    component.form.controls.rows.setValue([{ value: 'refreshed' }]);
    expect(component.getPersistedFormValue()).toEqual(initial);
    expect(JSON.stringify(initial)).toBe('{"reference":"a","group":{"local":"answer"}}');
    expect(component.form.getRawValue().group.title).toBe('refreshed');
  });

  it('keeps local edits and explicitly unlinked null values', () => {
    component.form.controls.group.controls.local.setValue('local edit');
    expect(component.getPersistedFormValue().group.local).toBe('local edit');
    component.form.controls.reference.setValue(null);
    component.form.controls.rows.setValue(null);
    expect(component.getPersistedFormValue().rows).toBeNull();
    expect(component.getPersistedFormValue().group.title).toBe('source');
  });

  it('omits disabled unrelated fields and nested local siblings using the legacy value view', () => {
    component.form.addControl('notes', new FormControl('disabled notes'));
    component.form.get('notes').disable();
    component.form.get('group.local').disable();
    const value = component.getPersistedFormValue();
    expect(value).toEqual({ reference: 'a' });
    expect(JSON.stringify(value)).not.toContain('disabled notes');
    expect(component.form.getRawValue().notes).toBe('disabled notes');
  });

  it('uses disabled references for activation without submitting unrelated raw values', () => {
    component.form.get('reference').disable();
    expect(component.getPersistedFormValue()).toEqual({ group: { local: 'answer' } });
    expect(component.form.get('group.title').value).toBe('source');
  });

  it('keeps disabled targets omitted when unlinked, following ordinary local semantics', () => {
    component.form.get('reference').setValue(null);
    component.form.get('rows').disable();
    expect(component.getPersistedFormValue()).toEqual({ reference: null, group: { title: 'source', local: 'answer' } });
  });

  it('retains byte-identical legacy serialization with descriptors absent', () => {
    delete component.formDefMap.formConfig.relatedRecords;
    component.form.controls.rows.disable();
    expect(JSON.stringify(component.getPersistedFormValue())).toBe(JSON.stringify(component.form.value));
  });

  it('projects server copies and current controls to the same baseline', () => {
    const server = { reference: 'a', group: { title: 'old copy', local: 'answer' }, rows: null };
    expect(component.getPersistedFormValue()).toEqual(component.projectLocalMetadata(server));
    const controls = retainRelatedDisplayValues({ ...server, group: { title: 'old copy', local: 'server edit' } }, component.form.getRawValue(), contract);
    expect(controls['group']).toEqual({ title: 'source', local: 'server edit' });
    expect(projectRelatedDisplayMetadata(controls, contract)['group']).toEqual({ local: 'server edit' });
  });
});

describe('related display conflict candidates', () => {
  it('merges unrelated local/server edits without a false transient deletion; still detects real overlaps', () => {
    const base = projectRelatedDisplayMetadata({ reference: 'a', group: { title: 'stored' }, local: 'before', other: 'before' }, contract);
    const local = projectRelatedDisplayMetadata({ reference: 'a', group: { title: 'fresh' }, local: 'edited', other: 'before' }, contract);
    const latest = projectRelatedDisplayMetadata({ reference: 'a', local: 'before', other: 'server' }, contract);
    const merged = rebaseRecordValues(base, local, latest);
    expect(merged.unresolvedOverlaps.length).toBe(0);
    expect(merged.candidate).toEqual({ reference: 'a', local: 'edited', other: 'server' });
    expect(rebaseRecordValues(base, local, { ...latest, local: 'conflicting' }).unresolvedOverlaps.length).toBeGreaterThan(0);
  });

  it('blocks both local and server reference changes from automatic/manual rebase', () => {
    const component: any = Object.create(FormComponent.prototype);
    component.formDefMap = { formConfig: { relatedRecords: contract } };
    const baseline: any = { metadata: { reference: 'a' } };
    const conflict: any = { latest: { reference: 'a' } };
    const identity = { oid: 'o', recordType: 'r', formName: 'f' };
    expect(component.planLocalConflictRebase(baseline, conflict, { reference: null }, 'fingerprint', identity).eligible).toBeFalse();
    expect(component.planLocalConflictRebase(baseline, { latest: { reference: 'b' } }, { reference: 'a' }, 'fingerprint', identity).eligible).toBeFalse();
  });

  it('projects a confirmed saved baseline without altering the server response', () => {
    const component: any = Object.create(FormComponent.prototype);
    component.formDefMap = { formConfig: { relatedRecords: contract }, updateConcurrency: () => {} };
    component.trimmedParams = { oid: () => 'o', recordType: () => 'r', formName: () => 'f' };
    component.recordBaselineState = signal(null);
    component.formConflictState = signal(null);
    component.formConflictReviewState = signal(null);
    const metadata = { reference: 'a', group: { title: 'stored copy', local: 'answer' }, rows: null };
    component.adoptConfirmedSaveBaseline({ metadata, oid: 'o' }, {}, null);
    expect(component.recordBaselineState().metadata).toEqual({ reference: 'a', group: { local: 'answer' } });
    expect(metadata.group.title).toBe('stored copy');
  });
});

describe('related display unrelated-local-edit runtime scenario', () => {
  beforeEach(async () => {
    const { createTestbedModule } = await import('../../helpers.spec');
    const { SimpleInputComponent } = await import('../../component/simple-input.component');
    await createTestbedModule({ declarations: { SimpleInputComponent } });
  });

  async function dirtyRequestForm() {
    const { createFormAndWaitForReady } = await import('../../helpers.spec');
    return createFormAndWaitForReady({
      name: 'related-dirty-intent', type: 'rdmp', serverSyncOnSave: 'never',
      relatedRecords: { displayTargets: [{ metadataPointer: '/title', relationId: 'activity' }],
        relations: [{ relationId: 'activity', referenceTokens: ['reference'] }], sources: [] },
      componentDefinitions: ['reference', 'title', 'notes'].map(name => ({ name,
        model: { class: 'SimpleInputModel' as const, config: { value: name === 'reference' ? 'a' : 'loaded' } },
        component: { class: 'SimpleInputComponent' as const },
      })),
    }, { oid: 'dirty-root', recordType: 'rdmp', formName: 'draft', editMode: true, downloadAndCreateOnInit: false });
  }

  it('honours dirty requests for unchanged unrelated notes and suppresses only active target requests', async () => {
    const { formComponent } = await dirtyRequestForm();
    const { createFormStatusDirtyRequestEvent } = await import('../events/form-component-event.types');
    const bus = (formComponent as any).eventBus;
    bus.publish(createFormStatusDirtyRequestEvent({ fieldId: 'title' }));
    expect(formComponent.form!.pristine).toBeTrue();
    bus.publish(createFormStatusDirtyRequestEvent({ fieldId: 'notes' }));
    expect(formComponent.form!.get('notes')!.dirty).toBeTrue();
    expect(formComponent.form!.dirty).toBeTrue();
  });

  it('submits dirty-but-equal non-target notes using legacy save gating', async () => {
    const { formComponent } = await dirtyRequestForm();
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, outcome: 'saved', metadata: { reference: 'a', notes: 'loaded' },
      isComplete: () => true, wasPersisted: () => true,
    } as any);
    formComponent.form!.get('notes')!.markAsDirty();
    await formComponent.saveForm();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.calls.mostRecent().args[1]).toEqual({ reference: 'a', notes: 'loaded' });
  });

  it('saves only the local answer after source refresh and adopts a projected saved baseline', async () => {
    const { createFormAndWaitForReady } = await import('../../helpers.spec');
    const relatedRecords: RelatedFormDescriptors = {
      displayTargets: [{ metadataPointer: '/title', relationId: 'activity' }],
      relations: [{ relationId: 'activity', referenceTokens: ['reference'] }], sources: [],
    };
    const { formComponent } = await createFormAndWaitForReady({
      name: 'related-display-runtime', type: 'rdmp', relatedRecords,
      serverSyncOnSave: 'never',
      componentDefinitions: ['reference', 'title', 'notes'].map(name => ({
        name, model: { class: 'SimpleInputModel' as const, config: { value: name === 'reference' ? 'a' : 'loaded' } },
        component: { class: 'SimpleInputComponent' as const },
      })),
    }, { oid: 'related-root', recordType: 'rdmp', formName: 'draft', editMode: true, downloadAndCreateOnInit: false });
    const response: any = {
      success: true, outcome: 'saved', metadata: { reference: 'a', title: 'retained old copy', notes: 'local edit' },
      isComplete: () => true, wasPersisted: () => true,
    };
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo(response);
    formComponent.form!.get('title')!.setValue('fresh source');
    formComponent.form!.get('title')!.markAsDirty();
    await formComponent.saveForm();
    expect(update).not.toHaveBeenCalled();
    formComponent.form!.get('notes')!.setValue('local edit');
    formComponent.form!.get('notes')!.markAsDirty();
    await formComponent.saveForm();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.calls.mostRecent().args[1]).toEqual({ reference: 'a', notes: 'local edit' });
    expect(formComponent.recordBaseline()?.metadata).toEqual({ reference: 'a', notes: 'local edit' });
    expect(formComponent.form!.get('title')!.value).toBe('fresh source');
  });
});

describe('related display real server sync regressions', () => {
  let component: any;
  let service: import('../../form-server-sync.service').FormServerSyncService;
  beforeEach(async () => {
    const { TestBed } = await import('@angular/core/testing');
    const { LoggerService } = await import('@researchdatabox/portal-ng-common');
    const { FormServerSyncService } = await import('../../form-server-sync.service');
    TestBed.configureTestingModule({ providers: [FormServerSyncService,
      { provide: FormService, useValue: { shouldIncludeInFormControlMap: () => true } },
      { provide: LoggerService, useValue: { warn: jasmine.createSpy('warn') } },
    ] });
    service = TestBed.inject(FormServerSyncService);
    component = Object.create(FormComponent.prototype);
    component.form = new FormGroup({ reference: new FormControl<string | null>('a'),
      group: new FormGroup({ title: new FormControl<unknown>('source A'), local: new FormControl('answer') }),
      rows: new FormControl<unknown>(['source A']),
    });
    component.formDefMap = { formConfig: { relatedRecords: contract }, completeGroupMap: {}, withFormControl: component.form.controls };
  });

  async function sync(server: Record<string, unknown>) {
    const sent = component.getPersistedFormValue();
    await service.applyServerMetadata(sent, server, component.formDefMap, component.form, 'preserveLocalEdits');
  }

  it('keeps a newer unrelated notes edit when always-sync receives an unchanged server echo', async () => {
    component.form.addControl('notes', new FormControl('sent notes'));
    const sent = component.getPersistedFormValue();
    component.form.get('notes').setValue('newer local notes');
    component.form.get('notes').markAsDirty();
    const result = await service.applyServerMetadata(sent, { ...sent, notes: 'sent notes' },
      component.formDefMap, component.form, 'always');
    expect(component.form.get('notes').value).toBe('newer local notes');
    expect(component.form.get('notes').dirty).toBeTrue();
    expect(result.skipped).toContain({ name: 'notes', reason: 'unchanged' });
  });

  it('preserves dirty unrelated notes even when its value equals the sent value', async () => {
    component.form.addControl('notes', new FormControl('sent notes'));
    const sent = component.getPersistedFormValue();
    component.form.get('notes').markAsDirty();
    const result = await service.applyServerMetadata(sent, { ...sent, notes: 'changed server notes' },
      component.formDefMap, component.form, 'preserveLocalEdits');
    expect(component.form.get('notes').value).toBe('sent notes');
    expect(component.form.get('notes').dirty).toBeTrue();
    expect(result.skipped).toContain({ name: 'notes', reason: 'local-edit' });
  });

  it('keeps legacy echo and dirty protection for local siblings inside a target ancestor', async () => {
    const sent = component.getPersistedFormValue();
    component.form.get('group.local').setValue('new local');
    await service.applyServerMetadata(sent, sent, component.formDefMap, component.form, 'always');
    expect(component.form.get('group.local').value).toBe('new local');
    component.form.get('group.local').setValue('answer');
    component.form.get('group.local').markAsDirty();
    const result = await service.applyServerMetadata(sent,
      { ...sent, group: { local: 'server changed' } }, component.formDefMap, component.form, 'preserveLocalEdits');
    expect(component.form.get('group.local').value).toBe('answer');
    expect(result.skipped).toContain({ name: 'group', reason: 'local-edit' });
  });

  it('dispatches one accepted custom group setter with the complete merged value', async () => {
    const group = component.form.get('group');
    const setter = jasmine.createSpy('group setter').and.callFake((value, options) => group.setValue(value, options));
    group.setCustomValue = setter;
    const sent = component.getPersistedFormValue();
    await service.applyServerMetadata(sent, { reference: 'a', group: { local: 'new local', title: 'stored copy' } },
      component.formDefMap, component.form, 'preserveLocalEdits');
    expect(setter).toHaveBeenCalledOnceWith({ local: 'new local', title: 'source A' }, { emitEvent: false });
  });

  it('does not inject descriptor targets without rendered controls into an accepted group setter', async () => {
    const group = component.form.get('group');
    group.removeControl('title');
    const setter = jasmine.createSpy('role-filtered group setter').and.callFake((value, options) => group.setValue(value, options));
    group.setCustomValue = setter;
    await sync({ reference: 'a', group: { local: 'server normalized', title: 'stored copy' } });
    expect(setter).toHaveBeenCalledOnceWith({ local: 'server normalized' }, { emitEvent: false });
    expect(group.getRawValue()).toEqual({ local: 'server normalized' });
  });

  it('normalizes all local siblings atomically and validates the group only once with its complete state', async () => {
    const group = component.form.get('group');
    group.addControl('other', new FormControl('old other'));
    const sent = component.getPersistedFormValue();
    group.get('local').setValue('pristine programmatic');
    const states: unknown[] = [];
    group.setValidators(() => { states.push(group.getRawValue()); return null; });
    await service.applyServerMetadata(sent,
      { reference: 'a', group: { local: 'answer', other: 'new other' } },
      component.formDefMap, component.form, 'preserveLocalEdits');
    expect(group.get('local').value).toBe('answer');
    expect(group.get('other').value).toBe('new other');
    expect(states).toEqual([{ title: 'source A', local: 'answer', other: 'new other' }]);
  });

  it('uses one accepted group setter and an empty control plus absent marker for an omitted target', async () => {
    const group = component.form.get('group');
    const setter = jasmine.createSpy('accepted group setter').and.callFake((value, options) => group.setValue(value, options));
    group.setCustomValue = setter;
    await sync({ reference: null, group: { local: 'server normalized' } });
    expect(setter).toHaveBeenCalledOnceWith({ local: 'server normalized', title: null }, { emitEvent: false });
    expect(group.get('title').value).toBeNull();
    expect(component.getPersistedFormValue()).toEqual({ reference: null, group: { local: 'server normalized' } });
    group.get('title').setValue('deliberate local answer');
    group.get('title').markAsDirty();
    expect(component.getPersistedFormValue()).toEqual({ reference: null,
      group: { local: 'server normalized', title: 'deliberate local answer' } });
  });

  it('submits an explicit user null after an omitted target was cleared', async () => {
    await sync({ reference: null, group: { local: 'server normalized' } });
    component.form.get('group.title').markAsDirty();
    expect(component.getPersistedFormValue().group.title).toBeNull();
  });

  it('clears the absent marker for a later explicit server null on an unlinked target', async () => {
    await sync({ reference: null, group: { local: 'server normalized' } });
    await sync({ reference: null, group: { local: 'server normalized', title: null }, rows: null });
    expect(component.getPersistedFormValue()).toEqual({ reference: null,
      group: { local: 'server normalized', title: null }, rows: null });
  });

  it('replaces targets inside a preserved group without invoking its custom setter', async () => {
    const group = component.form.get('group');
    const setter = jasmine.createSpy('preserved group setter');
    group.setCustomValue = setter;
    group.markAsDirty();
    await sync({ reference: 'b', group: { title: 'source B', local: 'server normalized' } });
    expect(setter).not.toHaveBeenCalled();
    expect(group.getRawValue()).toEqual({ title: 'source B', local: 'answer' });
    expect(group.dirty).toBeTrue();
  });

  it('keeps legacy dirty protection for unlinked targets', async () => {
    component.form.get('reference').setValue(null);
    const sent = component.getPersistedFormValue();
    component.form.get('rows').markAsDirty();
    const result = await service.applyServerMetadata(sent,
      { ...sent, rows: ['server local'] }, component.formDefMap, component.form, 'preserveLocalEdits');
    expect(component.form.get('rows').value).toEqual(['source A']);
    expect(result.skipped).toContain({ name: 'rows', reason: 'local-edit' });
  });

  it('preserves local siblings when their group was explicitly dirtied with pristine children', async () => {
    const sent = component.getPersistedFormValue();
    component.form.get('group').markAsDirty();
    expect(component.form.get('group.local').pristine).toBeTrue();
    await service.applyServerMetadata(sent, { reference: 'a', group: { local: 'server normalized' } },
      component.formDefMap, component.form, 'preserveLocalEdits');
    expect(component.form.get('group.local').value).toBe('answer');
    expect(component.form.get('group').dirty).toBeTrue();
    expect(component.form.get('group.title').value).toBe('source A');
  });

  it('accepts server normalization after a pristine programmatic local sibling change', async () => {
    const sent = component.getPersistedFormValue();
    component.form.get('group.local').setValue('programmatic local');
    expect(component.form.get('group').pristine).toBeTrue();
    await service.applyServerMetadata(sent, { reference: 'a', group: { local: 'server normalized' } },
      component.formDefMap, component.form, 'preserveLocalEdits');
    expect(component.form.get('group.local').value).toBe('server normalized');
    expect(component.form.get('group.title').value).toBe('source A');
  });

  it('clears omitted targets when server changes A to B', async () => {
    await sync({ reference: 'b', group: { local: 'answer' } });
    expect(component.form.get('group.title').value).toBeNull();
    expect(component.form.get('rows').value).toBeNull();
    expect(component.getPersistedFormValue()).toEqual({ reference: 'b', group: { local: 'answer' } });
  });

  it('clears omitted targets on server unlink and never submits the old copy as local input', async () => {
    await sync({ reference: null, group: { local: 'answer' } });
    expect(component.form.get('group.title').value).toBeNull();
    expect(component.form.get('rows').value).toBeNull();
    expect(component.getPersistedFormValue()).toEqual({ reference: null, group: { local: 'answer' } });
  });

  it('treats an omitted reference as unlink, keeping absence distinct from null', async () => {
    await sync({ group: { local: 'answer' } });
    expect(component.form.get('reference').value).toBeUndefined();
    expect(component.form.get('group.title').value).toBeNull();
    expect(component.getPersistedFormValue()).toEqual({ group: { local: 'answer' } });
    expect(JSON.stringify(component.getPersistedFormValue())).toBe('{"group":{"local":"answer"}}');
  });

  it('clears a target in an omitted group without deleting an unrelated local sibling', async () => {
    await sync({ reference: null });
    expect(component.getPersistedFormValue()).toEqual({ reference: null, group: { local: 'answer' } });
  });

  it('accepts explicit server local values, including null, on unlink', async () => {
    await sync({ reference: null, group: { title: 'server local answer', local: 'answer' }, rows: null });
    expect(component.getPersistedFormValue()).toEqual({ reference: null,
      group: { title: 'server local answer', local: 'answer' }, rows: null });
  });

  it('replaces local answers on server link and retains only unchanged active displays', async () => {
    component.form.get('reference').setValue(null);
    await sync({ reference: 'b', group: { title: 'server B', local: 'answer' }, rows: ['server B'] });
    expect(component.form.get('group.title').value).toBe('server B');
    expect(component.form.get('rows').value).toEqual(['server B']);
    await sync({ reference: 'b', group: { title: 'stored copy', local: 'server local' } });
    expect(component.form.get('group.title').value).toBe('server B');
    expect(component.form.get('group.local').value).toBe('server local');
  });

  async function populate(control: import('@angular/forms').AbstractControl, value: unknown) {
    const { executeBehaviourAction } = await import('../behaviours/behaviour-actions');
    const { FieldPathKind } = await import('@researchdatabox/sails-ng-common');
    const entry = { model: { formControl: control }, lineagePaths: { angularComponentsJsonPointer: '/target' } };
    component.getQuerySource = () => ({ jsonPointerSource: { target: { metadata: { formFieldEntry: entry } } } });
    await executeBehaviourAction({ type: 'setValue', config: { fieldPathKind: FieldPathKind.Logical } } as any,
      { value } as any, { fieldResolverContext: { formComponent: component },
        getLogicalFieldEntry: () => entry, logger: { warn: () => {} },
      } as any);
  }

  it('keeps active behaviour-populated child, group and form pristine; local/unlinked/legacy writes stay dirty', async () => {
    await populate(component.form.get('group.title'), 'fresh source');
    expect(component.form.get('group.title').pristine).toBeTrue();
    expect(component.form.get('group').pristine).toBeTrue();
    expect(component.form.pristine).toBeTrue();
    await populate(component.form.get('group.local'), 'local edit');
    expect(component.form.get('group.local').dirty).toBeTrue();
    component.form.markAsPristine();
    component.form.get('reference').setValue(null);
    await populate(component.form.get('group.title'), 'unlinked local');
    expect(component.form.dirty).toBeTrue();
    component.form.markAsPristine();
    delete component.formDefMap.formConfig.relatedRecords;
    await populate(component.form.get('group.title'), 'legacy write');
    expect(component.form.dirty).toBeTrue();
  });

  it('syncs a LOCAL sibling after source-only population during an in-flight save, even with old transient dirty flags', async () => {
    const sent = component.getPersistedFormValue();
    await populate(component.form.get('group.title'), 'fresh while saving');
    // Covers controls already dirtied by an earlier source population path.
    component.form.get('group.title').markAsDirty();
    const result = await service.applyServerMetadata(sent,
      { reference: 'a', group: { title: 'stored old copy', local: 'server normalized local' } },
      component.formDefMap, component.form, 'preserveLocalEdits');
    expect(result.skipped.some(item => item.name === 'group' && item.reason === 'local-edit')).toBeFalse();
    expect(component.form.get('group.local').value).toBe('server normalized local');
    expect(component.form.get('group.title').value).toBe('fresh while saving');
    expect(component.form.pristine).toBeTrue();
  });

  it('keeps a source refresh emitted while an asynchronous group sync is pending without suppressing its LOCAL sibling', async () => {
    const sent = component.getPersistedFormValue();
    const group = component.form.get('group');
    group.get('title').disable({ emitEvent: false });
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    let started!: () => void;
    const entered = new Promise<void>(resolve => started = resolve);
    let first = true;
    group.setCustomValue = async (value: unknown, options: any) => {
      if (first) { first = false; started(); await gate; }
      group.setValue(value, options);
    };
    const syncPending = service.applyServerMetadata(sent,
      { reference: 'a', group: { local: 'server local' } }, component.formDefMap, component.form, 'preserveLocalEdits');
    await entered;
    group.get('title').setValue('source refresh while sync awaits');
    release();
    const result = await syncPending;
    expect(group.get('title').value).toBe('source refresh while sync awaits');
    expect(group.get('local').value).toBe('server local');
    expect(result.skipped.some(item => item.reason === 'local-edit-during-sync')).toBeFalse();
    expect(component.form.pristine).toBeTrue();
  });

  it('retains legacy in-flight protection for a non-target write even when its value is unchanged', async () => {
    const sent = component.getPersistedFormValue();
    const group = component.form.get('group');
    let release!: () => void;
    const gate = new Promise<void>(resolve => release = resolve);
    let started!: () => void;
    const entered = new Promise<void>(resolve => started = resolve);
    let first = true;
    group.setCustomValue = async (value: unknown, options: any) => {
      if (first) { first = false; started(); await gate; }
      group.setValue(value, options);
    };
    const pending = service.applyServerMetadata(sent, { reference: 'a', group: { local: 'server normalized' } },
      component.formDefMap, component.form, 'preserveLocalEdits');
    await entered;
    group.get('local').setValue('answer');
    group.get('local').markAsDirty();
    release();
    const result = await pending;
    expect(group.get('local').value).toBe('answer');
    expect(group.dirty).toBeTrue();
    expect(result.skipped).toContain({ name: 'group', reason: 'local-edit-during-sync' });
  });

  it('preserves a changed local reference and its display while a response for the sent reference arrives', async () => {
    const sent = component.getPersistedFormValue();
    component.form.get('reference').setValue('c');
    component.form.get('reference').markAsDirty();
    component.form.get('group.title').setValue('source C');
    await service.applyServerMetadata(sent,
      { reference: 'b', group: { title: 'source B', local: 'answer' } }, component.formDefMap, component.form, 'preserveLocalEdits');
    expect(component.form.get('reference').value).toBe('c');
    expect(component.form.get('group.title').value).toBe('source C');
  });

  it('clears the old source after server unlink even when a local sibling edit preserves the group', async () => {
    const ancestorSetter = jasmine.createSpy('preserved ancestor setter');
    component.form.get('group').setCustomValue = ancestorSetter;
    const sent = component.getPersistedFormValue();
    await populate(component.form.get('group.local'), 'user edit during save');
    await service.applyServerMetadata(sent,
      { reference: null, group: { local: 'server value' } }, component.formDefMap, component.form, 'preserveLocalEdits');
    expect(component.form.get('group.title').value).toBeNull();
    expect(component.getPersistedFormValue()).toEqual({ reference: null, group: { local: 'user edit during save' } });
    expect(component.form.get('group.local').dirty).toBeTrue();
    expect(ancestorSetter).not.toHaveBeenCalled();
  });

  it('preserves a real local sibling edit made during the save', async () => {
    const sent = component.getPersistedFormValue();
    await populate(component.form.get('group.title'), 'fresh source');
    await populate(component.form.get('group.local'), 'user edit during save');
    const result = await service.applyServerMetadata(sent,
      { reference: 'a', group: { local: 'server value' } }, component.formDefMap, component.form, 'preserveLocalEdits');
    expect(result.skipped).toContain({ name: 'group', reason: 'local-edit' });
    expect(component.form.get('group.local').value).toBe('user edit during save');
    expect(component.form.dirty).toBeTrue();
  });
});

describe('RR12 nested sync and atomic compatibility regressions', () => {
 let c: any; let sync: FormServerSyncService;
 beforeEach(() => {
  TestBed.configureTestingModule({providers:[FormServerSyncService,{provide:FormService,useValue:{shouldIncludeInFormControlMap:()=>true}},{provide:LoggerService,useValue:{warn:()=>{}}}]});
  sync=TestBed.inject(FormServerSyncService);
  c=Object.create(FormComponent.prototype);
  c.form=new FormGroup({reference:new FormControl<any>('a'),group:new FormGroup({title:new FormControl<any>('display'),local:new FormControl('old'),other:new FormControl('old other')}),notes:new FormControl('notes')});
  c.formDefMap={formConfig:{relatedRecords:{displayTargets:[{metadataPointer:'/group/title',relationId:'r'}],relations:[{relationId:'r',referenceTokens:['reference']}],sources:[]}},completeGroupMap:{},withFormControl:c.form.controls};
 });
 const server=(reference:any='a', extras:any={})=>({reference,group:{local:'old',other:'normalized',...extras},notes:'notes'});
 it('accepts once with full validator state, restoring pristine local sibling',async()=>{
  const sent=c.getPersistedFormValue(); const g=c.form.get('group'); g.get('local').setValue('programmatic');
  const states:any[]=[];g.setValidators(()=>{states.push(g.getRawValue());return null;});
  g.setCustomValue=jasmine.createSpy().and.callFake((v:any,o:any)=>g.setValue(v,o));
  await sync.applyServerMetadata(sent,server(),c.formDefMap,c.form,'preserveLocalEdits');
  expect(g.setCustomValue).toHaveBeenCalledOnceWith({local:'old',other:'normalized',title:'display'},{emitEvent:false});
  expect(states).toEqual([{title:'display',local:'old',other:'normalized'}]);
 });
 it('preserves directly dirty ancestor and clears only target on unlink',async()=>{
  const sent=c.getPersistedFormValue();const g=c.form.get('group');g.markAsDirty();g.setCustomValue=jasmine.createSpy();
  await sync.applyServerMetadata(sent,server(null),c.formDefMap,c.form,'preserveLocalEdits');
  expect(g.setCustomValue).not.toHaveBeenCalled();expect(g.getRawValue()).toEqual({title:null,local:'old',other:'old other'});
  expect(c.getPersistedFormValue().group).toEqual({local:'old',other:'old other'});
 });
 it('clears absence on explicit null user edit and keeps it after pristine reset',async()=>{
  await sync.applyServerMetadata(c.getPersistedFormValue(),server(null),c.formDefMap,c.form,'always');
  const t=c.form.get('group.title');t.markAsDirty();expect(c.getPersistedFormValue().group.title).toBeNull();
  c.form.markAsPristine();expect(c.getPersistedFormValue().group.title).toBeNull();
 });
 it('later server value clears absence, without touching notes',async()=>{
  await sync.applyServerMetadata(c.getPersistedFormValue(),server(null),c.formDefMap,c.form,'always');
  c.form.get('notes').disable();
  await sync.applyServerMetadata(c.getPersistedFormValue(),server(null,{title:'local answer'}),c.formDefMap,c.form,'always');
  expect(c.getPersistedFormValue().group.title).toBe('local answer');expect(c.getPersistedFormValue().notes).toBeUndefined();
 });
 it('control replacement does not inherit the absent marker',async()=>{
  await sync.applyServerMetadata(c.getPersistedFormValue(),server(null),c.formDefMap,c.form,'always');
  c.form.get('group').setControl('title',new FormControl('configured default'));
  expect(c.getPersistedFormValue().group.title).toBe('configured default');
 });
 for(const mode of ['always','preserveLocalEdits'] as const) it('keeps unchanged dirty notes in '+mode,async()=>{
  const sent=c.getPersistedFormValue();c.form.get('notes').setValue('edited');c.form.get('notes').markAsDirty();
  await sync.applyServerMetadata(sent,server(),c.formDefMap,c.form,mode);expect(c.form.get('notes').value).toBe('edited');expect(c.form.get('notes').dirty).toBeTrue();
 });
 it('legacy and target-free group retain atomic legacy dispatch',async()=>{
  delete c.formDefMap.formConfig.relatedRecords;const g=c.form.get('group');g.setCustomValue=jasmine.createSpy().and.callFake((v:any,o:any)=>g.setValue(v,o));
  await sync.applyServerMetadata(c.form.value,server('a',{title:'server'}),c.formDefMap,c.form,'always');expect(g.setCustomValue).toHaveBeenCalledTimes(1);expect(g.get('title').value).toBe('server');
 });
 it('replaces a target when its reference is inside the same accepted ancestor',async()=>{
  const g=c.form.get('group');g.addControl('reference',new FormControl('a'));
  c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens=['group','reference'];
  const sent=c.getPersistedFormValue();
  await sync.applyServerMetadata(sent,{reference:'a',group:{reference:'b',title:'source B',local:'old',other:'normalized'},notes:'notes'},c.formDefMap,c.form,'always');
  expect(g.get('reference').value).toBe('b');expect(g.get('title').value).toBe('source B');
 });
 it('clears and marks an omitted target when its reference unlinks inside the accepted ancestor',async()=>{
  const g=c.form.get('group');g.addControl('reference',new FormControl('a'));
  c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens=['group','reference'];
  await sync.applyServerMetadata(c.getPersistedFormValue(),{reference:'a',group:{reference:null,local:'old',other:'normalized'},notes:'notes'},c.formDefMap,c.form,'always');
  expect(g.get('title').value).toBeNull();expect(c.getPersistedFormValue().group.title).toBeUndefined();
 });

 it('accepts explicit local target on nested reference unlink without reviving displayed source',async()=>{
  const g=c.form.get('group');g.addControl('reference',new FormControl('a'));
  c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens=['group','reference'];
  await sync.applyServerMetadata(c.getPersistedFormValue(),{reference:'a',group:{reference:null,title:'explicit local answer',local:'old',other:'normalized'},notes:'notes'},c.formDefMap,c.form,'always');
  expect(c.getPersistedFormValue().group.title).toBe('explicit local answer');
 });

 it('clears a repeatable target inside an accepted native group without submitting its old display rows',async()=>{
  const g=c.form.get('group');const rows=new FormArray([new FormControl('display row')]);
  (rows as any).setCustomValue=jasmine.createSpy().and.callFake((value:any[],options:any)=>{rows.clear(options);for(const item of value) rows.push(new FormControl(item),options);});
  g.setControl('title',rows);
  const result=await sync.applyServerMetadata(c.getPersistedFormValue(),server(null),c.formDefMap,c.form,'always');
  expect(result.skipped.some(item=>item.reason==='set-failed')).toBeFalse();
  expect(rows.getRawValue()).toEqual([]);expect(c.getPersistedFormValue().group.title).toBeUndefined();
 });

 it('omits failed pristine display rows but submits a genuine subsequent local edit', async () => {
  const group = c.form.get('group');
  const rows = new FormArray([new FormControl('stale display row')]);
  (rows as any).setCustomValue = () => { throw new Error('row replacement failed'); };
  group.setControl('title', rows);
  const result = await sync.applyServerMetadata(c.getPersistedFormValue(), server(null),
    c.formDefMap, c.form, 'always');
  expect(result.skipped.some(item => item.reason === 'set-failed')).toBeTrue();
  expect(rows.getRawValue()).toEqual(['stale display row']);
  expect(c.serverSyncRequiresReview(result)).toBeTrue();
  expect(c.getPersistedFormValue().group.title).toBeUndefined();
  rows.at(0).setValue('genuine user answer');
  rows.at(0).markAsDirty();
  expect(c.getPersistedFormValue().group.title).toEqual(['genuine user answer']);
  expect(group.get('other').value).toBe('normalized');
 });

 for (const dirty of [false, true]) it(
  'uses the legacy reference ancestor outcome when its sibling is ' + (dirty ? 'dirty' : 'pristine'), async () => {
   c.form.addControl('refs', new FormGroup({ reference: new FormControl('a'), note: new FormControl('old note') }));
   c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens = ['refs', 'reference'];
   const sent = c.getPersistedFormValue();
   if (dirty) {
    c.form.get('refs.note').setValue('user note');
    c.form.get('refs.note').markAsDirty();
   }
   const result = await sync.applyServerMetadata(sent, {
    ...server('a', { title: 'source B' }), refs: { reference: 'b', note: 'normalized note' },
   }, c.formDefMap, c.form, 'preserveLocalEdits');
   expect(result.skipped.some(item => item.reason === 'set-failed')).toBeFalse();
   expect(c.form.get('refs.reference').value).toBe(dirty ? 'a' : 'b');
   expect(c.form.get('group.title').value).toBe(dirty ? 'display' : 'source B');
  });

 it('continues after one target fails in a preserved group with two unlinked relations', async () => {
  const group = c.form.get('group');
  const rows = new FormArray([new FormControl('stale first')]);
  (rows as any).setCustomValue = () => { throw new Error('first failed'); };
  group.setControl('title', rows);
  group.addControl('second', new FormControl('stale second'));
  c.form.addControl('secondReference', new FormControl('x'));
  c.formDefMap.formConfig.relatedRecords.displayTargets.push({ metadataPointer: '/group/second', relationId: 'second' });
  c.formDefMap.formConfig.relatedRecords.relations.push({ relationId: 'second', referenceTokens: ['secondReference'] });
  const sent = c.getPersistedFormValue();
  group.get('local').setValue('user local');
  group.get('local').markAsDirty();
  const result = await sync.applyServerMetadata(sent, { ...server(null), secondReference: null },
   c.formDefMap, c.form, 'preserveLocalEdits');
  expect(c.serverSyncRequiresReview(result)).toBeTrue();
  expect(group.get('second').value).toBeNull();
  expect(c.getPersistedFormValue().group).toEqual({ local: 'user local', other: 'old other' });
  expect(rows.pristine).toBeTrue();
 });

 for (const explicitEmpty of [false, true]) it(
  'reloads an unlinked failed repeatable with ' + (explicitEmpty ? 'explicit empty rows' : 'absent rows'), async () => {
   const group = c.form.get('group');
   const rows = new FormArray([new FormControl('stale row')]);
   (rows as any).setCustomValue = () => { throw new Error('unlink failed'); };
   group.setControl('title', rows);
   const failed = await sync.applyServerMetadata(c.getPersistedFormValue(), server(null),
    c.formDefMap, c.form, 'always');
   expect(c.serverSyncRequiresReview(failed)).toBeTrue();
   (rows as any).setCustomValue = (value: string[], options: any) => {
    rows.clear(options);
    for (const item of value) rows.push(new FormControl(item), options);
   };
   const result = await sync.replaceWithServerMetadata(server(null, explicitEmpty ? { title: [] } : {}),
    c.formDefMap, c.form);
   expect(c.serverSyncRequiresReview(result)).toBeFalse();
   expect(rows.getRawValue()).toEqual([]);
   expect(c.getPersistedFormValue().group.title).toEqual(explicitEmpty ? [] : undefined);
   rows.push(new FormControl('new after reload'));
   rows.markAsDirty();
   expect(c.getPersistedFormValue().group.title).toEqual(['new after reload']);
  });

 for (const preserved of [false, true]) for (const [before, after] of [[0, 3], [3, 1]]) it(
  (preserved ? 'preserves' : 'atomically accepts') + ' siblings while resizing display rows from ' + before + ' to ' + after, async () => {
   const rows = new FormArray(Array.from({ length: before }, () => new FormControl('old display')));
   (rows as any).setCustomValue = (value: string[], options: any) => {
    rows.clear(options);
    for (const item of value) rows.push(new FormControl(item), options);
   };
   const group = c.form.get('group');
   group.setControl('title', rows);
   if (preserved) group.markAsDirty();
   group.setCustomValue = jasmine.createSpy().and.callFake((value: any, options: any) => group.setValue(value, options));
   const incoming = Array.from({ length: after }, (_, index) => 'B ' + index);
   const result = await sync.applyServerMetadata(c.getPersistedFormValue(), server('b', { title: incoming }),
    c.formDefMap, c.form, preserved ? 'preserveLocalEdits' : 'always');
   expect(c.serverSyncRequiresReview(result)).toBeFalse();
   expect(group.setCustomValue).toHaveBeenCalledTimes(preserved ? 0 : 1);
   expect(group.get('other').value).toBe(preserved ? 'old other' : 'normalized');
   expect(rows.getRawValue()).toEqual(incoming);
   expect(c.getPersistedFormValue().group.title).toBeUndefined();
  });

 it('retains A display when the reference ancestor setter throws', async () => {
  const refs = new FormGroup({ reference: new FormControl('a'), note: new FormControl('old') });
  c.form.addControl('refs', refs);
  c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens = ['refs', 'reference'];
  (refs as any).setCustomValue = () => { throw new Error('reference ancestor failed'); };
  const result = await sync.applyServerMetadata(c.getPersistedFormValue(), {
   ...server('a', { title: 'source B' }), refs: { reference: 'b', note: 'new' },
  }, c.formDefMap, c.form, 'always');
  expect(c.serverSyncRequiresReview(result)).toBeTrue();
  expect(refs.get('reference')!.value).toBe('a');
  expect(c.form.get('group.title').value).toBe('display');
 });

 it('observes C restored after an edit during the awaited reference ancestor setter', async () => {
  const refs = new FormGroup({ reference: new FormControl('a'), note: new FormControl('old') });
  c.form.addControl('refs', refs);
  c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens = ['refs', 'reference'];
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let start!: () => void;
  const started = new Promise<void>(resolve => start = resolve);
  let first = true;
  (refs as any).setCustomValue = async (value: any, options: any) => {
   if (first) { first = false; start(); await gate; }
   refs.setValue(value, options);
  };
  const pending = sync.applyServerMetadata(c.getPersistedFormValue(), {
   ...server('a', { title: 'source B' }), refs: { reference: 'b', note: 'new' },
  }, c.formDefMap, c.form, 'always');
  await started;
  refs.get('reference')!.setValue('c');
  refs.get('reference')!.markAsDirty();
  release();
  const result = await pending;
  expect(result.skipped).toContain({ name: 'refs', reason: 'local-edit-during-sync' });
  expect(refs.get('reference')!.value).toBe('c');
  expect(c.form.get('group.title').value).toBeNull();
  expect(c.getPersistedFormValue().group.title).toBeUndefined();
 });

 it('discards a late B display if the reference changes to C during the target setter', async () => {
  const target = c.form.get('group.title');
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let start!: () => void;
  const started = new Promise<void>(resolve => start = resolve);
  let first = true;
  target.setCustomValue = async (value: any, options: any) => {
   if (first) { first = false; start(); await gate; }
   target.setValue(value, options);
  };
  c.form.get('group').markAsDirty(); // Force a target-only write in the preserved ancestor.
  const pending = sync.applyServerMetadata(c.getPersistedFormValue(), server('b', { title: 'source B' }),
   c.formDefMap, c.form, 'preserveLocalEdits');
  await started;
  c.form.get('reference').setValue('c');
  c.form.get('reference').markAsDirty();
  release();
  const result = await pending;
  expect(result.skipped).toContain({ name: 'group', reason: 'local-edit-during-sync' });
  expect(c.form.get('reference').value).toBe('c');
  expect(target.value).toBeNull();
  expect(c.getPersistedFormValue().group.title).toBeUndefined();
 });

 for (const unlink of [false, true]) it(
  'gives an accepted ancestor one complete validated state on ' + (unlink ? 'unlink' : 'A to B'), async () => {
   const group = c.form.get('group');
   group.addControl('reference', new FormControl('a'));
   c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens = ['group', 'reference'];
   const states: unknown[] = [];
   group.setValidators(() => { states.push(group.getRawValue()); return null; });
   group.setCustomValue = jasmine.createSpy().and.callFake((value: any, options: any) => group.setValue(value, options));
   const incomingGroup = { reference: unlink ? null : 'b', local: 'old', other: 'normalized',
    ...(unlink ? {} : { title: 'source B' }) };
   const result = await sync.applyServerMetadata(c.getPersistedFormValue(), {
    reference: 'a', group: incomingGroup, notes: 'notes',
   }, c.formDefMap, c.form, 'always');
   const complete = { ...incomingGroup, title: unlink ? null : 'source B' };
   expect(c.serverSyncRequiresReview(result)).toBeFalse();
   expect(group.setCustomValue).toHaveBeenCalledOnceWith(complete, { emitEvent: false });
   expect(states).toEqual([complete]);
   expect(group.getRawValue()).toEqual(complete);
   if (unlink) expect(c.getPersistedFormValue().group.title).toBeUndefined();
  });

 for (const race of [false, true]) it(
  'corrects an accepted ancestor whose reference setter retains A' + (race ? ' and observes C during correction' : ''), async () => {
   const group = c.form.get('group');
   group.addControl('reference', new FormControl('a'));
   c.formDefMap.formConfig.relatedRecords.relations[0].referenceTokens = ['group', 'reference'];
   group.setCustomValue = jasmine.createSpy().and.callFake((value: any, options: any) => {
    group.setValue(value, options);
    // A custom setter did not adopt the expected reference. The accepted
    // atomic write has already installed B's title, so correction is required.
    group.get('reference').setValue('a', options);
   });
   const target = group.get('title');
   let release!: () => void;
   const gate = new Promise<void>(resolve => release = resolve);
   let start!: () => void;
   const started = new Promise<void>(resolve => start = resolve);
   let first = true;
   target.setCustomValue = jasmine.createSpy().and.callFake(async (value: any, options: any) => {
    if (first) { first = false; start(); if (race) await gate; }
    target.setValue(value, options);
   });
   const pending = sync.applyServerMetadata(c.getPersistedFormValue(), {
    reference: 'a', group: { reference: 'b', title: 'source B', local: 'old', other: 'normalized' }, notes: 'notes',
   }, c.formDefMap, c.form, 'always');
   await started;
   if (race) {
    group.get('reference').setValue('c');
    group.get('reference').markAsDirty();
    release();
   }
   const result = await pending;
   expect(group.setCustomValue).toHaveBeenCalledOnceWith(
    { reference: 'b', title: 'source B', local: 'old', other: 'normalized' }, { emitEvent: false });
   expect(target.setCustomValue).toHaveBeenCalledWith('display', { emitEvent: false });
   expect(group.get('reference').value).toBe(race ? 'c' : 'a');
   expect(target.value).toBe(race ? null : 'display');
   expect(c.getPersistedFormValue().group.title).toBeUndefined();
   expect(group.get('other').value).toBe('normalized');
   if (race) expect(result.skipped).toContain({ name: 'group', reason: 'local-edit-during-sync' });
  });

 it('restores a genuine unlinked local edit made during the target setter and requests review', async () => {
  const target = c.form.get('group.title');
  c.form.get('group').markAsDirty();
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let start!: () => void;
  const started = new Promise<void>(resolve => start = resolve);
  let first = true;
  target.setCustomValue = async (value: any, options: any) => {
   if (first) { first = false; start(); await gate; }
   target.setValue(value, options);
  };
  const pending = sync.applyServerMetadata(c.getPersistedFormValue(), server(null, { title: 'server local' }),
   c.formDefMap, c.form, 'preserveLocalEdits');
  await started;
  target.setValue('genuine local answer');
  target.markAsDirty();
  release();
  const result = await pending;
  expect(result.skipped).toContain({ name: 'group', reason: 'local-edit-during-sync' });
  expect(c.serverSyncRequiresReview(result)).toBeTrue();
  expect(target.value).toBe('genuine local answer');
  expect(target.dirty).toBeTrue();
  expect(c.getPersistedFormValue().group.title).toBe('genuine local answer');
 });

 it('preserves a user answer during a standalone unlinked target setter', async () => {
  const target = new FormControl('display');
  c.form.addControl('standalone', target);
  c.formDefMap.formConfig.relatedRecords.displayTargets = [{ metadataPointer: '/standalone', relationId: 'r' }];
  let release!: () => void;
  const gate = new Promise<void>(resolve => release = resolve);
  let start!: () => void;
  const started = new Promise<void>(resolve => start = resolve);
  let first = true;
  (target as any).setCustomValue = async (value: any, options: any) => {
   if (first) { first = false; start(); await gate; }
   target.setValue(value, options);
  };
  const pending = sync.applyServerMetadata(c.getPersistedFormValue(), {
   ...server(null, { title: 'ordinary group title' }), standalone: 'server local',
  }, c.formDefMap, c.form, 'always');
  await started;
  target.setValue('standalone user answer');
  target.markAsDirty();
  release();
  const result = await pending;
  expect(result.skipped).toContain({ name: 'standalone', reason: 'local-edit-during-sync' });
  expect(target.value).toBe('standalone user answer');
  expect(c.getPersistedFormValue().standalone).toBe('standalone user answer');
 });

});
