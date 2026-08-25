import {fakeAsync, flushMicrotasks, TestBed, tick} from '@angular/core/testing';
import { Location } from '@angular/common';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormComponent } from './form.component';
import { FormDebugStateService } from './form-debug/form-debug-state.service';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { RecordActionResult } from '@researchdatabox/portal-ng-common';
import { SimpleInputComponent } from './component/simple-input.component';
import { GroupFieldComponent } from './component/group.component';
import {
  createFormAndWaitForReady,
  createTestbedModule,
  DynamicAssetOptions,
  ensureApplicationRefFormComponent,
  setUpDynamicAssets,
} from "./helpers.spec";
import { FormService } from './form.service';
import {
  FormComponentEventBus,
  createFormDeleteSuccessEvent,
  createFormSaveExecuteEvent,
  createFormSaveSuccessEvent,
  createFormStatusDirtyRequestEvent,
  createFormValidationGroupsChangeRequestEvent,
  FormComponentEventType,
  FormRedirectRequestedEvent,
  FormSaveFailureEvent,
  FormSaveSuccessEvent,
  FormValidationBroadcastEvent,
} from './form-state';

function persistedSaveResponse(overrides: Record<string, unknown> = {}): any {
  return {
    success: true,
    outcome: 'saved',
    isComplete: () => true,
    wasPersisted: () => true,
    ...overrides,
  };
}

function staleSaveResponse(overrides: Partial<RecordActionResult> = {}): RecordActionResult {
  const result = new RecordActionResult();
  result.success = false;
  result.oid = 'oid-123';
  result.outcome = 'not-saved';
  result.requestId = '11111111-1111-4111-8111-111111111111';
  result.concurrencyOutcome = 'stale';
  result.metadata = { title: 'Latest title' };
  result.problems = [
    {
      kind: 'conflict',
      phase: 'persistence',
      issues: [{ code: 'record-revision-stale', message: 'The record changed.' }],
    },
  ];
  result.concurrency = {
    revision: 5,
    currentRevision: 5,
    entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
    formFingerprint: 'sha256:form_1',
  };
  return Object.assign(result, overrides);
}

function retryFailureResponse(outcome: 'not-saved' | 'unknown'): RecordActionResult {
  const result = new RecordActionResult();
  result.success = false;
  result.oid = 'oid-123';
  result.outcome = outcome;
  result.requestId = '22222222-2222-4222-8222-222222222222';
  result.concurrencyOutcome = outcome === 'unknown' ? 'unknown' : 'none';
  result.problems = outcome === 'unknown'
    ? [{ kind: 'system', phase: 'response', issues: [{ code: 'save-outcome-unknown', message: 'Reload required.' }] }]
    : [{ kind: 'validation', phase: 'pre-save', issues: [{ code: 'title-invalid', message: 'Fix title.', field: 'title' }] }];
  return result;
}

function conflictSaveResponse(
  concurrencyOutcome: 'precondition-required' | 'form-changed' | 'deleted' | 'authorization-lost',
  overrides: Partial<RecordActionResult> = {}
): RecordActionResult {
  const result = new RecordActionResult();
  result.success = false;
  result.oid = concurrencyOutcome === 'authorization-lost' ? '' : 'oid-123';
  result.outcome = 'not-saved';
  result.requestId = '33333333-3333-4333-8333-333333333333';
  result.concurrencyOutcome = concurrencyOutcome;
  result.metadata = null;
  result.problems = [
    {
      kind: concurrencyOutcome === 'authorization-lost' ? 'authorization' : 'conflict',
      phase: 'pre-save',
      issues: [
        {
          code:
            concurrencyOutcome === 'precondition-required'
              ? 'record-precondition-required'
              : concurrencyOutcome === 'form-changed'
                ? 'form-definition-changed'
                : concurrencyOutcome === 'deleted'
                  ? 'record-deleted'
                  : 'record-validation-edit-unauthorized',
          message: 'The save was rejected.',
        },
      ],
    },
  ];
  result.concurrency = {
    revision: 5,
    currentRevision: 5,
    entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
    formFingerprint: 'sha256:form_1',
  };
  return Object.assign(result, overrides);
}

async function createConcurrencyTestForm() {
  const result = await createFormAndWaitForReady(
    {
      name: 'concurrency-rebase',
      type: 'rdmp',
      componentDefinitions: [
        {
          name: 'title',
          model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } },
          component: { class: 'SimpleInputComponent' },
        },
        {
          name: 'notes',
          model: { class: 'SimpleInputModel', config: { value: 'Loaded notes' } },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    },
    {
      oid: 'oid-123',
      recordType: 'rdmp',
      editMode: true,
      formName: 'rdmp-draft',
      downloadAndCreateOnInit: false,
    }
  );
  result.formComponent.formDefMap?.updateConcurrency({
    entityTag: `"rb-record-v1.4.${'a'.repeat(43)}"`,
    revision: 4,
    formFingerprint: 'sha256:form_1',
  });
  (result.formComponent as any).captureLoadedRecordBaseline();
  return result;
}

describe('FormComponent', () => {
  const setWindowSearch = (search?: string) => {
    const url = new URL(window.location.href);
    url.search = search ?? '';
    window.history.replaceState({}, '', url.toString());
  };

  const setFormDebugUrl = (value?: string) => {
    const url = new URL(window.location.href);
    url.searchParams.delete('formDebug');
    if (value) {
      url.searchParams.set('formDebug', value);
    }
    window.history.replaceState({}, '', url.toString());
  };

  const ensureDebugPanelOpen = async (fixture: { nativeElement: HTMLElement; detectChanges: () => void; whenStable: () => Promise<any> }) => {
    const launchButton = fixture.nativeElement.querySelector('.rb-form-debug-launch') as HTMLButtonElement | null;
    if (launchButton) {
      launchButton.click();
      fixture.detectChanges();
      await fixture.whenStable();
    }
  };

  beforeEach(async () => {
    setWindowSearch('');
    setFormDebugUrl('1');
    const { translationService } = await createTestbedModule(
      {
        declarations: {
          "SimpleInputComponent": SimpleInputComponent,
          "GroupFieldComponent": GroupFieldComponent,
        }
      });
    Object.assign(translationService.translationMap, {
      '@form-conflict-stale-title': 'This record has changed',
      '@form-conflict-stale-message': 'Your edits are still available.',
      '@form-conflict-review-action': 'Review changes',
      '@form-conflict-discard-action': 'Reload latest and discard mine',
      '@form-conflict-export-action': 'Download my edits',
      '@form-conflict-load-current-form-action': 'Load current form',
      '@form-conflict-review-heading': 'Review changes',
      '@form-conflict-review-instructions': 'Choose which value to keep.',
      '@form-conflict-whole-repeatable': 'Whole repeatable',
      '@form-conflict-whole-repeatable-help': 'Resolve this list as one value.',
      '@form-conflict-mine': 'Mine',
      '@form-conflict-latest': 'Latest',
      '@form-conflict-save-resolution': 'Save resolved changes',
      '@form-conflict-choices-required': 'Choose every value.',
      '@form-conflict-discard-warning-title': 'Discard your edits?',
      '@form-conflict-discard-warning-message': 'Reload and permanently discard your unsaved edits?',
      '@form-conflict-discard-warning-confirm': 'Discard my edits',
      '@form-conflict-discard-warning-cancel': 'Keep editing',
      '@form-conflict-navigation-warning': 'Leaving will discard unresolved changes.',
    });
  });

  afterEach(() => {
    setWindowSearch('');
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render basic form config', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'hello world!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect(inputElement).toBeTruthy();
  });

  it('retains an immutable loaded baseline and sends its exact tag, revision, and fingerprint', async () => {
    const formConfig: FormConfigFrame = {
      name: 'concurrency-load',
      type: 'rdmp',
      componentDefinitions: [
        {
          name: 'title',
          model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: 'oid-123',
      recordType: 'rdmp',
      editMode: true,
      formName: 'rdmp-draft',
      downloadAndCreateOnInit: false,
    });
    const loadedTag = `"rb-record-v1.4.${'a'.repeat(43)}"`;
    formComponent.formDefMap?.updateConcurrency({
      entityTag: loadedTag,
      revision: 4,
      formFingerprint: 'sha256:form_1',
    });
    (formComponent as any).captureLoadedRecordBaseline();

    const baseline = formComponent.recordBaseline();
    expect(baseline).toEqual(
      jasmine.objectContaining({
        oid: 'oid-123',
        recordType: 'rdmp',
        formName: 'rdmp-draft',
        metadata: { title: 'Loaded title' },
        entityTag: loadedTag,
        revision: 4,
        formFingerprint: 'sha256:form_1',
        trusted: true,
      })
    );
    expect(Object.isFrozen(baseline?.metadata)).toBeTrue();

    formComponent.form?.get('title')?.setValue('Local title');
    formComponent.form?.get('title')?.markAsDirty();
    expect(formComponent.recordBaseline()?.metadata['title']).toBe('Loaded title');
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(
      persistedSaveResponse({
        oid: 'oid-123',
        metadata: { title: 'Local title' },
        concurrency: {
          revision: 5,
          entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
          formFingerprint: 'sha256:form_1',
        },
      })
    );

    await formComponent.saveForm();

    expect(updateSpy).toHaveBeenCalledOnceWith(
      'oid-123',
      { title: 'Local title' },
      '',
      undefined,
      { entityTag: loadedTag, revision: 4, formFingerprint: 'sha256:form_1' }
    );
    expect(formComponent.recordBaseline()).toEqual(
      jasmine.objectContaining({
        metadata: { title: 'Local title' },
        revision: 5,
        entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
      })
    );
    expect(formComponent.conflictState()).toBeNull();
  });

  it('captures base/local/latest conflict state without losing edits made in flight', async () => {
    const formConfig: FormConfigFrame = {
      name: 'concurrency-conflict',
      type: 'rdmp',
      componentDefinitions: [
        {
          name: 'title',
          model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: 'oid-123',
      recordType: 'rdmp',
      editMode: true,
      formName: 'rdmp-draft',
      downloadAndCreateOnInit: false,
    });
    const loadedTag = `"rb-record-v1.4.${'a'.repeat(43)}"`;
    formComponent.formDefMap?.updateConcurrency({
      entityTag: loadedTag,
      revision: 4,
      formFingerprint: 'sha256:form_1',
    });
    (formComponent as any).captureLoadedRecordBaseline();
    formComponent.form?.get('title')?.setValue('Sent title');
    formComponent.form?.get('title')?.markAsDirty();

    let resolveSave!: (value: RecordActionResult) => void;
    const updateSpy = spyOn(formComponent.recordService, 'update').and.callFake(
      () => new Promise<RecordActionResult>(resolve => (resolveSave = resolve))
    );
    const savePromise = formComponent.saveForm();
    await Promise.resolve();
    formComponent.form?.get('title')?.setValue('Edited while saving');
    formComponent.form?.get('title')?.markAsDirty();
    resolveSave(staleSaveResponse());
    await savePromise;

    expect(formComponent.form?.get('title')?.value).toBe('Edited while saving');
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(formComponent.form?.dirty).toBeTrue();
    expect(formComponent.conflictState()).toEqual(
      jasmine.objectContaining({
        requestId: '11111111-1111-4111-8111-111111111111',
        base: { title: 'Loaded title' },
        local: { title: 'Edited while saving' },
        latest: { title: 'Latest title' },
        baseRevision: 4,
        latestRevision: 5,
        baseEntityTag: loadedTag,
        latestEntityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
        baseFormFingerprint: 'sha256:form_1',
        latestFormFingerprint: 'sha256:form_1',
        status: 'stale',
        autoRetryAttempted: false,
      })
    );
    expect(formComponent.recordBaseline()?.metadata).toEqual({ title: 'Loaded title' });
  });

  it('keeps conflict state component-scoped and never creates it for unknown outcomes', () => {
    const firstFixture = TestBed.createComponent(FormComponent);
    const secondFixture = TestBed.createComponent(FormComponent);
    const first = firstFixture.componentInstance;
    const second = secondFixture.componentInstance;
    first.form = new FormGroup({ title: new FormControl('First local') });
    second.form = new FormGroup({ title: new FormControl('Second local') });
    first.oid.set('oid-first');
    second.oid.set('oid-second');
    (first as any).captureLoadedRecordBaseline();
    (second as any).captureLoadedRecordBaseline();

    (first as any).captureConflictResponse(staleSaveResponse({ oid: 'oid-first' }));
    const unknown = new RecordActionResult();
    unknown.outcome = 'unknown';
    unknown.concurrencyOutcome = 'unknown';
    (second as any).captureConflictResponse(unknown);
    (second as any).captureConflictResponse(staleSaveResponse({ oid: '' }));

    expect(first.conflictState()?.local).toEqual({ title: 'First local' });
    expect(second.conflictState()).toBeNull();
  });

  it('adopts latest state only through an explicit recovery decision', async () => {
    const formConfig: FormConfigFrame = {
      name: 'concurrency-adopt',
      type: 'rdmp',
      componentDefinitions: [
        {
          name: 'title',
          model: { class: 'SimpleInputModel', config: { value: 'Loaded title' } },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: 'oid-123',
      recordType: 'rdmp',
      editMode: true,
      formName: 'rdmp-draft',
      downloadAndCreateOnInit: false,
    });
    formComponent.formDefMap?.updateConcurrency({
      entityTag: `"rb-record-v1.4.${'a'.repeat(43)}"`,
      revision: 4,
      formFingerprint: 'sha256:form_1',
    });
    (formComponent as any).captureLoadedRecordBaseline();
    formComponent.form?.get('title')?.setValue('Mine');
    (formComponent as any).captureConflictResponse(staleSaveResponse());

    expect(formComponent.conflictState()).not.toBeNull();
    expect(formComponent.form?.get('title')?.value).toBe('Mine');
    expect(await formComponent.adoptLatestConflict('discard')).toBeTrue();
    expect(formComponent.form?.get('title')?.value).toBe('Latest title');
    expect(formComponent.form?.pristine).toBeTrue();
    expect(formComponent.conflictState()).toBeNull();
    expect(formComponent.recordBaseline()).toEqual(
      jasmine.objectContaining({ metadata: { title: 'Latest title' }, revision: 5 })
    );
  });

  it('does not clear an explicit discard conflict when a required replacement fails', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    (formComponent as any).captureConflictResponse(staleSaveResponse());
    spyOn((formComponent as any).serverSyncService, 'replaceWithServerMetadata').and.resolveTo({
      patched: ['notes'],
      skipped: [{ name: 'title', reason: 'set-failed' }],
    });

    expect(await formComponent.adoptLatestConflict('discard')).toBeFalse();
    expect(formComponent.conflictState()?.status).toBe('reviewing');
    expect(formComponent.form?.dirty).toBeTrue();
    expect(formComponent.recordBaseline()).toEqual(jasmine.objectContaining({ revision: 4 }));
  });

  it('does not let an obsolete async discard clear a replacement conflict or baseline', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    (formComponent as any).captureConflictResponse(staleSaveResponse());
    let finishSync!: (value: { patched: string[]; skipped: never[] }) => void;
    spyOn((formComponent as any).serverSyncService, 'replaceWithServerMetadata').and.returnValue(
      new Promise(resolve => {
        finishSync = resolve;
      })
    );
    const adoption = formComponent.adoptLatestConflict('discard');
    await Promise.resolve();
    const replacementConflict = {
      ...formComponent.conflictState()!,
      latestRevision: 6,
      status: 'stale' as const,
    };
    (formComponent as any).formConflictState.set(replacementConflict);
    const replacementBaseline = { ...formComponent.recordBaseline()!, revision: 6 };
    (formComponent as any).recordBaselineState.set(replacementBaseline);

    finishSync({ patched: ['title'], skipped: [] });

    expect(await adoption).toBeFalse();
    expect(formComponent.conflictState()).toBe(replacementConflict);
    expect(formComponent.recordBaseline()).toBe(replacementBaseline);
  });

  it('always mounts the accessible conflict presenter, keeps controls usable, and confirms discard', async () => {
    const { fixture, formComponent } = await createConcurrencyTestForm();
    const shell = fixture.nativeElement as HTMLElement;
    expect(shell.querySelector('redbox-form-conflict-presenter')).not.toBeNull();
    expect((shell.querySelector('.rb-form-conflict') as HTMLElement).hidden).toBeTrue();

    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    spyOn(formComponent.recordService, 'update').and.resolveTo(
      staleSaveResponse({ metadata: { title: 'Latest title', notes: 'Loaded notes' } })
    );
    await formComponent.saveForm();
    fixture.detectChanges();

    const banner = shell.querySelector('.rb-form-conflict') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(banner.querySelector('[role="alert"]')).not.toBeNull();
    expect(banner.textContent).toContain('This record has changed');
    const titleInput = shell.querySelector('input[type="text"]') as HTMLInputElement;
    expect(titleInput.disabled).toBeFalse();
    titleInput.value = 'Still editing';
    titleInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(formComponent.form?.get('title')?.value).toBe('Still editing');

    const reviewButton = Array.from(banner.querySelectorAll('button')).find(button =>
      button.textContent?.includes('Review changes')
    ) as HTMLButtonElement;
    reviewButton.click();
    fixture.detectChanges();
    expect(shell.querySelector('.rb-form-conflict-review[role="region"]')).not.toBeNull();
    expect(shell.querySelectorAll('.rb-form-conflict-review input[type="radio"]')).toHaveSize(2);

    const discardButton = Array.from(banner.querySelectorAll('button')).find(button =>
      button.textContent?.includes('Reload latest')
    ) as HTMLButtonElement;
    discardButton.click();
    fixture.detectChanges();
    const dialog = shell.querySelector('redbox-confirmation-dialog .modal') as HTMLElement;
    expect(dialog).not.toBeNull();
    expect(dialog.textContent).toContain('permanently discard');
    const confirmButton = dialog.querySelector('.btn-danger') as HTMLButtonElement;
    confirmButton.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(formComponent.form?.get('title')?.value).toBe('Latest title');
    expect(formComponent.conflictState()).toBeNull();
    expect((shell.querySelector('.rb-form-conflict') as HTMLElement).hidden).toBeTrue();
  });

  it('submits mine/latest manual resolution with retained local changes and no force request option', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    formComponent.form?.get('notes')?.setValue('My local notes');
    formComponent.form?.get('notes')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Latest title', notes: 'Loaded notes' } })),
      Promise.resolve(
        persistedSaveResponse({
          oid: 'oid-123',
          requestId: '22222222-2222-4222-8222-222222222222',
          metadata: { title: 'Mine', notes: 'My local notes' },
          concurrency: {
            revision: 6,
            entityTag: `"rb-record-v1.6.${'c'.repeat(43)}"`,
            formFingerprint: 'sha256:form_1',
            resolution: 'client-manually-resolved',
            resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
          },
        })
      )
    );

    await formComponent.saveForm();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    formComponent.reviewConflictChanges();
    const review = formComponent.conflictReview();
    expect(review?.items).toHaveSize(1);
    expect(review?.candidateWithNonOverlappingChanges).toEqual({
      title: 'Latest title',
      notes: 'My local notes',
    });

    await formComponent.submitManualConflictResolution({ [review!.items[0].id]: 'mine' });

    expect(updateSpy).toHaveBeenCalledTimes(2);
    const manualArgs = updateSpy.calls.argsFor(1);
    expect(manualArgs).toEqual([
      'oid-123',
      { title: 'Mine', notes: 'My local notes' },
      '',
      undefined,
      {
        entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
        revision: 5,
        formFingerprint: 'sha256:form_1',
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
      },
    ]);
    expect(manualArgs[4]).toBeDefined();
    expect(Object.hasOwn(manualArgs[4]!, 'force')).toBeFalse();
    expect(formComponent.conflictState()).toBeNull();
    expect(formComponent.recordBaseline()?.metadata).toEqual({ title: 'Mine', notes: 'My local notes' });
  });

  it('keeps the original baseline after invalid manual resolution and submits a corrected retry', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Latest title', notes: 'Loaded notes' } })),
      Promise.resolve(
        persistedSaveResponse({
          oid: 'oid-123',
          requestId: '22222222-2222-4222-8222-222222222222',
          metadata: { title: 'Mine', notes: 'Loaded notes' },
          concurrency: {
            revision: 6,
            entityTag: `"rb-record-v1.6.${'c'.repeat(43)}"`,
            formFingerprint: 'sha256:form_1',
            resolution: 'client-manually-resolved',
            resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
          },
        })
      )
    );

    await formComponent.saveForm();
    formComponent.reviewConflictChanges();
    const review = formComponent.conflictReview();
    const title = formComponent.form?.get('title');
    title?.setValidators(Validators.minLength(10));
    title?.updateValueAndValidity();

    const invalidResult = await formComponent.submitManualConflictResolution({ [review!.items[0].id]: 'mine' });

    expect(invalidResult).toBeFalse();
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(formComponent.form?.invalid).toBeTrue();
    expect(formComponent.conflictState()?.status).toBe('reviewing');
    expect(formComponent.recordBaseline()).toEqual(
      jasmine.objectContaining({
        metadata: { title: 'Loaded title', notes: 'Loaded notes' },
        revision: 4,
        entityTag: `"rb-record-v1.4.${'a'.repeat(43)}"`,
      })
    );

    title?.setValidators(Validators.minLength(3));
    title?.updateValueAndValidity();
    const correctedResult = await formComponent.submitManualConflictResolution({ [review!.items[0].id]: 'mine' });

    expect(correctedResult).toBeTrue();
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.calls.argsFor(1)[4]).toEqual(
      jasmine.objectContaining({
        entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
        revision: 5,
        resolution: 'client-manually-resolved',
      })
    );
    expect(formComponent.conflictState()).toBeNull();
    expect(formComponent.recordBaseline()?.revision).toBe(6);
  });

  it('automatically rebases one ordinary no-overlap conflict against the latest exact tag', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const retryRequestId = '22222222-2222-4222-8222-222222222222';
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Loaded title', notes: 'Latest notes' } })),
      Promise.resolve(
        persistedSaveResponse({
          oid: 'oid-123',
          requestId: retryRequestId,
          metadata: { title: 'Mine', notes: 'Latest notes' },
          concurrency: {
            revision: 6,
            entityTag: `"rb-record-v1.6.${'c'.repeat(43)}"`,
            formFingerprint: 'sha256:form_1',
            resolution: 'client-auto-merged',
            resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
          },
        })
      )
    );

    await formComponent.saveForm();

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.calls.argsFor(1)).toEqual([
      'oid-123',
      { title: 'Mine', notes: 'Latest notes' },
      '',
      undefined,
      {
        entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
        revision: 5,
        formFingerprint: 'sha256:form_1',
        resolution: 'client-auto-merged',
        resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
      },
    ]);
    expect(formComponent.saveResponse()?.requestId).toBe(retryRequestId);
    expect(formComponent.recordBaseline()).toEqual(
      jasmine.objectContaining({ metadata: { title: 'Mine', notes: 'Latest notes' }, revision: 6 })
    );
    expect(formComponent.conflictState()).toBeNull();
  });

  it('parks an automatic rebase when a required server control patch fails', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(
      staleSaveResponse({ metadata: { title: 'Loaded title', notes: 'Latest notes' } })
    );
    spyOn((formComponent as any).serverSyncService, 'applyServerMetadata').and.resolveTo({
      patched: ['title'],
      skipped: [{ name: 'notes', reason: 'set-failed' }],
    });
    const successEvents: FormSaveSuccessEvent[] = [];
    const successSub = TestBed.inject(FormComponentEventBus)
      .select$(FormComponentEventType.FORM_SAVE_SUCCESS)
      .subscribe(event => successEvents.push(event));

    try {
      await formComponent.saveForm();

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(successEvents).toEqual([]);
      expect(formComponent.conflictState()?.status).toBe('reviewing');
      expect(formComponent.form?.dirty).toBeTrue();
      expect(formComponent.recordBaseline()).toEqual(
        jasmine.objectContaining({ metadata: { title: 'Loaded title', notes: 'Loaded notes' }, revision: 4 })
      );
    } finally {
      successSub.unsubscribe();
    }
  });

  it('replans an automatic rebase without overwriting an edit made during asynchronous replacement', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Loaded title', notes: 'Latest notes' } })),
      Promise.resolve(
        persistedSaveResponse({
          oid: 'oid-123',
          metadata: { title: 'Mine after stale', notes: 'Latest notes' },
          concurrency: {
            revision: 6,
            entityTag: `"rb-record-v1.6.${'c'.repeat(43)}"`,
            formFingerprint: 'sha256:form_1',
          },
        })
      )
    );
    const serverSync = (formComponent as any).serverSyncService;
    const originalApply = serverSync.applyServerMetadata.bind(serverSync);
    let releaseReplacement!: () => void;
    let replacementStarted!: () => void;
    const replacementGate = new Promise<void>(resolve => (releaseReplacement = resolve));
    const started = new Promise<void>(resolve => (replacementStarted = resolve));
    let firstReplacement = true;
    spyOn(serverSync, 'applyServerMetadata').and.callFake(async (...args: any[]) => {
      if (firstReplacement) {
        firstReplacement = false;
        replacementStarted();
        await replacementGate;
      }
      return originalApply(...args);
    });

    const saving = formComponent.saveForm();
    await started;
    formComponent.form?.get('title')?.setValue('Mine after stale');
    formComponent.form?.get('title')?.markAsDirty();
    releaseReplacement();
    await saving;

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.calls.argsFor(1)[1]).toEqual({ title: 'Mine after stale', notes: 'Latest notes' });
    expect(formComponent.form?.value).toEqual({ title: 'Mine after stale', notes: 'Latest notes' });
    expect(formComponent.conflictState()).toBeNull();
  });

  it('returns a rejected automatic retry to an actionable review state', async () => {
    const { fixture, formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Loaded title', notes: 'Latest notes' } })),
      Promise.resolve(retryFailureResponse('not-saved'))
    );

    await formComponent.saveForm();
    fixture.detectChanges();

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(formComponent.conflictState()?.status).toBe('reviewing');
    expect(formComponent.form?.dirty).toBeTrue();
    expect(formComponent.saveResponse()?.outcome).toBe('not-saved');
    expect(fixture.nativeElement.textContent).toContain('Download my edits');
  });

  it('requires reload after an unknown automatic retry without leaving recovery disabled', async () => {
    const { fixture, formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Loaded title', notes: 'Latest notes' } })),
      Promise.resolve(retryFailureResponse('unknown'))
    );

    await formComponent.saveForm();
    fixture.detectChanges();

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(formComponent.conflictState()).toEqual(
      jasmine.objectContaining({ status: 'reviewing', retryRecovery: 'reload-required' })
    );
    expect(formComponent.recordBaseline()).toEqual(jasmine.objectContaining({ trusted: false }));
    expect(formComponent.recordBaseline()?.entityTag).toBeUndefined();
    expect(formComponent.recordBaseline()?.revision).toBeUndefined();
    expect(formComponent.form?.dirty).toBeTrue();
    expect(formComponent.manualConflictMergeAllowed).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Download my edits');
    expect(fixture.nativeElement.textContent).toContain('Load current form');

    const recoverySteps: string[] = [];
    spyOn(formComponent, 'exportConflictLocalValues').and.callFake(() => {
      recoverySteps.push('export');
      (formComponent as any).conflictExportCompleted = true;
      return '{}';
    });
    spyOn<any>(formComponent, 'reloadWindow').and.callFake(() => recoverySteps.push('reload'));
    formComponent.reloadCurrentFormAfterConflict();
    expect(recoverySteps).toEqual(['export', 'reload']);
  });

  it('adopts latest without a retry when an ordinary local value is already current', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(
      staleSaveResponse({ metadata: { title: 'Mine', notes: 'Latest notes' } })
    );
    const successEvents: FormSaveSuccessEvent[] = [];
    const successSub = TestBed.inject(FormComponentEventBus)
      .select$(FormComponentEventType.FORM_SAVE_SUCCESS)
      .subscribe(event => successEvents.push(event));

    try {
      await formComponent.saveForm();

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(formComponent.form?.value).toEqual({ title: 'Mine', notes: 'Latest notes' });
      expect(formComponent.form?.pristine).toBeTrue();
      expect(formComponent.recordBaseline()).toEqual(
        jasmine.objectContaining({ metadata: { title: 'Mine', notes: 'Latest notes' }, revision: 5 })
      );
      expect(formComponent.conflictState()).toBeNull();
      expect(formComponent.saveResponse()?.concurrency?.resolution).toBe('already-current');
      expect(successEvents).toHaveSize(1);
      expect(successEvents[0].response?.concurrency?.resolution).toBe('already-current');
    } finally {
      successSub.unsubscribe();
    }
  });

  it('keeps already-current adoption actionable when sync reports an edit during replacement', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(
      staleSaveResponse({ metadata: { title: 'Mine', notes: 'Latest notes' } })
    );
    spyOn((formComponent as any).serverSyncService, 'applyServerMetadata').and.resolveTo({
      patched: ['notes'],
      skipped: [{ name: 'title', reason: 'local-edit-during-sync' }],
    });
    const successEvents: FormSaveSuccessEvent[] = [];
    const successSub = TestBed.inject(FormComponentEventBus)
      .select$(FormComponentEventType.FORM_SAVE_SUCCESS)
      .subscribe(event => successEvents.push(event));

    try {
      await formComponent.saveForm();

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(successEvents).toEqual([]);
      expect(formComponent.conflictState()?.status).toBe('reviewing');
      expect(formComponent.recordBaseline()).toEqual(jasmine.objectContaining({ revision: 4 }));
      expect(formComponent.saveResponse()?.concurrency?.resolution).not.toBe('already-current');
    } finally {
      successSub.unsubscribe();
    }
  });

  it('does not publish save success or advance the baseline when post-save server sync requires review', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const response = persistedSaveResponse({
      oid: 'oid-123',
      metadata: { title: 'Server-normalized', notes: 'Loaded notes' },
      concurrency: {
        revision: 5,
        entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
        formFingerprint: 'sha256:form_1',
      },
    });
    spyOn(formComponent.recordService, 'update').and.resolveTo(response);
    spyOn((formComponent as any).serverSyncService, 'applyServerMetadata').and.resolveTo({
      patched: [],
      skipped: [{ name: 'title', reason: 'set-failed' }],
    });
    const successEvents: FormSaveSuccessEvent[] = [];
    const failureEvents: FormSaveFailureEvent[] = [];
    const eventBus = TestBed.inject(FormComponentEventBus);
    const successSub = eventBus
      .select$(FormComponentEventType.FORM_SAVE_SUCCESS)
      .subscribe(event => successEvents.push(event));
    const failureSub = eventBus
      .select$(FormComponentEventType.FORM_SAVE_FAILURE)
      .subscribe(event => failureEvents.push(event));

    try {
      await formComponent.saveForm();

      expect(successEvents).toEqual([]);
      expect(failureEvents).toHaveSize(1);
      expect(failureEvents[0].error).toBe('@form-server-sync-review-message');
      expect(formComponent.recordBaseline()).toEqual(jasmine.objectContaining({ revision: 4 }));
      expect(formComponent.form?.dirty).toBeTrue();
      expect(formComponent.saveResponse()).toBe(response);
    } finally {
      successSub.unsubscribe();
      failureSub.unsubscribe();
    }
  });

  it('parks an already-current conflict when an edit arrives during adoption without publishing save success', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(
      staleSaveResponse({ metadata: { title: 'Mine', notes: 'Latest notes' } })
    );
    const serverSync = (formComponent as any).serverSyncService;
    const originalApply = serverSync.applyServerMetadata.bind(serverSync);
    let releaseAdoption!: () => void;
    let adoptionStarted!: () => void;
    const adoptionGate = new Promise<void>(resolve => (releaseAdoption = resolve));
    const started = new Promise<void>(resolve => (adoptionStarted = resolve));
    spyOn(serverSync, 'applyServerMetadata').and.callFake(async (...args: any[]) => {
      adoptionStarted();
      await adoptionGate;
      return originalApply(...args);
    });
    const successEvents: FormSaveSuccessEvent[] = [];
    const failureEvents: FormSaveFailureEvent[] = [];
    const eventBus = TestBed.inject(FormComponentEventBus);
    const successSub = eventBus
      .select$(FormComponentEventType.FORM_SAVE_SUCCESS)
      .subscribe(event => successEvents.push(event));
    const failureSub = eventBus
      .select$(FormComponentEventType.FORM_SAVE_FAILURE)
      .subscribe(event => failureEvents.push(event));

    try {
      const saving = formComponent.saveForm();
      await started;
      formComponent.form?.get('title')?.setValue('Edited during adoption');
      formComponent.form?.get('title')?.markAsDirty();
      releaseAdoption();
      await saving;

      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(successEvents).toHaveSize(0);
      expect(failureEvents).toHaveSize(1);
      expect(failureEvents[0].error).toBe('@form-conflict-reviewing-message');
      expect(formComponent.conflictState()?.status).toBe('reviewing');
      expect(formComponent.form?.dirty).toBeTrue();
      expect(formComponent.form?.get('title')?.value).toBe('Edited during adoption');
      expect(formComponent.saveResponse()?.outcome).toBe('not-saved');
      expect(formComponent.saveResponse()?.concurrency?.resolution).not.toBe('already-current');
    } finally {
      successSub.unsubscribe();
      failureSub.unsubscribe();
    }
  });

  it('hands a second race to review without a third automatic request, then resubmits a manual resolution', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Loaded title', notes: 'First latest' } })),
      Promise.resolve(
        staleSaveResponse({
          requestId: '22222222-2222-4222-8222-222222222222',
          metadata: { title: 'Loaded title', notes: 'Second latest' },
          concurrency: {
            revision: 6,
            currentRevision: 6,
            entityTag: `"rb-record-v1.6.${'c'.repeat(43)}"`,
            formFingerprint: 'sha256:form_1',
            resolution: 'client-auto-merged',
            resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
          },
        })
      ),
      Promise.resolve(
        persistedSaveResponse({
          oid: 'oid-123',
          requestId: '33333333-3333-4333-8333-333333333333',
          metadata: { title: 'Mine', notes: 'Second latest' },
          concurrency: {
            revision: 7,
            entityTag: `"rb-record-v1.7.${'d'.repeat(43)}"`,
            formFingerprint: 'sha256:form_1',
            resolution: 'client-manually-resolved',
            resolutionOfRequestId: '22222222-2222-4222-8222-222222222222',
          },
        })
      )
    );

    await formComponent.saveForm();

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(formComponent.conflictState()).toEqual(
      jasmine.objectContaining({
        requestId: '22222222-2222-4222-8222-222222222222',
        base: { title: 'Loaded title', notes: 'First latest' },
        local: { title: 'Mine', notes: 'First latest' },
        latest: { title: 'Loaded title', notes: 'Second latest' },
        baseRevision: 5,
        latestRevision: 6,
        status: 'reviewing',
        autoRetryAttempted: true,
      })
    );

    expect(formComponent.conflictReview()?.items).toHaveSize(0);
    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(await formComponent.submitManualConflictResolution({})).toBeTrue();
    expect(updateSpy).toHaveBeenCalledTimes(3);
    expect(updateSpy.calls.argsFor(2)).toEqual([
      'oid-123',
      { title: 'Mine', notes: 'Second latest' },
      '',
      undefined,
      {
        entityTag: `"rb-record-v1.6.${'c'.repeat(43)}"`,
        revision: 6,
        formFingerprint: 'sha256:form_1',
        resolution: 'client-manually-resolved',
        resolutionOfRequestId: '22222222-2222-4222-8222-222222222222',
      },
    ]);
    expect(formComponent.conflictState()).toBeNull();
  });

  it('does not infer named intent complete and retries it only after another explicit save', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Mine');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValues(
      Promise.resolve(staleSaveResponse({ metadata: { title: 'Mine', notes: 'Latest notes' } })),
      Promise.resolve(
        persistedSaveResponse({
          oid: 'oid-123',
          requestId: '22222222-2222-4222-8222-222222222222',
          metadata: { title: 'Mine', notes: 'Latest notes' },
          concurrency: {
            revision: 6,
            entityTag: `"rb-record-v1.6.${'c'.repeat(43)}"`,
            formFingerprint: 'sha256:form_1',
          },
        })
      )
    );

    await formComponent.saveForm({ force: true, operation: 'submit' });

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(formComponent.conflictState()?.status).toBe('stale');

    await formComponent.saveForm({ force: true, operation: 'submit' });

    expect(updateSpy).toHaveBeenCalledTimes(2);
    expect(updateSpy.calls.argsFor(1)).toEqual([
      'oid-123',
      { title: 'Mine', notes: 'Latest notes' },
      '',
      'submit',
      {
        entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
        revision: 5,
        formFingerprint: 'sha256:form_1',
        resolution: 'client-auto-merged',
        resolutionOfRequestId: '11111111-1111-4111-8111-111111111111',
      },
    ]);
    expect(formComponent.conflictState()).toBeNull();
  });

  it('keeps an unversioned tab in comparison-only review after a typed 428', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.formDefMap?.updateConcurrency({});
    (formComponent as any).captureLoadedRecordBaseline();
    formComponent.form?.get('title')?.setValue('Mine from old tab');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(
      conflictSaveResponse('precondition-required', {
        metadata: { title: 'Latest title', notes: 'Latest notes' },
      })
    );

    await formComponent.saveForm();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(updateSpy.calls.argsFor(0)).toEqual([
      'oid-123',
      { title: 'Mine from old tab', notes: 'Loaded notes' },
      '',
      undefined,
      {},
    ]);
    expect(formComponent.conflictState()).toEqual(
      jasmine.objectContaining({
        cause: 'precondition-required',
        status: 'reviewing',
        base: { title: 'Loaded title', notes: 'Loaded notes' },
        local: { title: 'Mine from old tab', notes: 'Loaded notes' },
        latest: { title: 'Latest title', notes: 'Latest notes' },
      })
    );
    expect(formComponent.conflictReview()).not.toBeNull();
    expect(formComponent.manualConflictMergeAllowed).toBeFalse();
    expect(await formComponent.submitManualConflictResolution({})).toBeFalse();
    expect(updateSpy).toHaveBeenCalledTimes(1);
  });

  it('turns stale fingerprint drift into form-changed state and preserves local values before reload', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Unsaved title');
    formComponent.form?.get('title')?.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(
      staleSaveResponse({
        metadata: { title: 'Unsafe to merge through the old form', notes: 'Latest notes' },
        concurrency: {
          revision: 5,
          currentRevision: 5,
          entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
          formFingerprint: 'sha256:form_2',
        },
      })
    );

    await formComponent.saveForm();

    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(formComponent.conflictState()).toEqual(
      jasmine.objectContaining({
        cause: 'form-changed',
        status: 'form-changed',
        local: { title: 'Unsaved title', notes: 'Loaded notes' },
        baseFormFingerprint: 'sha256:form_1',
        latestFormFingerprint: 'sha256:form_2',
      })
    );
    expect(formComponent.conflictReview()).toBeNull();
    expect(formComponent.manualConflictMergeAllowed).toBeFalse();
    expect(await formComponent.submitManualConflictResolution({})).toBeFalse();

    (formComponent as any).window = null;
    const exported = JSON.parse(formComponent.exportConflictLocalValues()!);
    expect(exported).toEqual({
      oid: 'oid-123',
      recordType: 'rdmp',
      formName: 'rdmp-draft',
      unsavedValues: { title: 'Unsaved title', notes: 'Loaded notes' },
    });
    const reloadSteps: string[] = [];
    spyOn(formComponent, 'exportConflictLocalValues').and.callFake(() => {
      reloadSteps.push('export');
      (formComponent as any).conflictExportCompleted = true;
      return JSON.stringify(exported);
    });
    const reloadSpy = spyOn<any>(formComponent, 'reloadWindow').and.callFake(() => reloadSteps.push('reload'));
    formComponent.reloadCurrentFormAfterConflict();
    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(reloadSteps).toEqual(['export', 'reload']);
  });

  it('keeps typed form-definition drift non-mergeable even when the response repeats the old fingerprint', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Unsaved title');
    (formComponent as any).captureConflictResponse(
      conflictSaveResponse('form-changed', {
        metadata: { title: 'Latest title' },
      })
    );

    expect(formComponent.conflictState()).toEqual(
      jasmine.objectContaining({ cause: 'form-changed', status: 'form-changed', local: jasmine.any(Object) })
    );
    expect(formComponent.manualConflictMergeAllowed).toBeFalse();
    expect(formComponent.conflictReview()).toBeNull();
  });

  it('keeps deleted and permission-lost outcomes authoritative and retains no returned latest state', async () => {
    for (const variant of ['deleted', 'authorization-lost'] as const) {
      const { fixture, formComponent } = await createConcurrencyTestForm();
      formComponent.form?.get('title')?.setValue(`Local ${variant}`);
      const response = conflictSaveResponse(variant, {
        data: { privateEnvelopeValue: 'PRIVATE_DATA_MUST_NOT_BE_RETAINED' },
        metadata: { title: 'LATEST_VALUE_MUST_NOT_RENDER', privateField: 'PRIVATE_VALUE_MUST_NOT_RENDER' },
        concurrency: {
          revision: 9,
          currentRevision: 9,
          entityTag: `"rb-record-v1.9.${'e'.repeat(43)}"`,
          formFingerprint: 'sha256:drift_must_not_override_privacy_outcome',
        },
      });
      (formComponent as any).captureConflictResponse(response);
      fixture.detectChanges();

      expect(formComponent.conflictState()).toEqual(
        jasmine.objectContaining({
          cause: variant === 'deleted' ? 'deleted' : 'permission-lost',
          status: variant === 'deleted' ? 'deleted' : 'permission-lost',
          local: jasmine.objectContaining({ title: `Local ${variant}` }),
          latest: null,
        })
      );
      expect(formComponent.conflictState()?.latestRevision).toBeUndefined();
      expect(formComponent.conflictState()?.latestEntityTag).toBeUndefined();
      expect(formComponent.conflictState()?.latestFormFingerprint).toBeUndefined();
      expect(formComponent.conflictReview()).toBeNull();
      expect(response.metadata).toBeNull();
      expect(response.data).toBeNull();
      expect(response.concurrency).toBeUndefined();
      expect(fixture.nativeElement.textContent).not.toContain('LATEST_VALUE_MUST_NOT_RENDER');
      expect(fixture.nativeElement.textContent).not.toContain('PRIVATE_VALUE_MUST_NOT_RENDER');
      expect(fixture.nativeElement.querySelector('.rb-form-conflict-review')).toBeNull();
    }
  });

  it('exports before reloading when a stale response has no trusted same-form fingerprint', async () => {
    const { fixture, formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Unsaved title');
    (formComponent as any).captureConflictResponse(
      staleSaveResponse({
        concurrency: {
          revision: 5,
          currentRevision: 5,
          entityTag: `"rb-record-v1.5.${'b'.repeat(43)}"`,
        },
      })
    );
    fixture.detectChanges();

    expect(formComponent.conflictState()?.cause).toBe('record-stale');
    expect(formComponent.manualConflictMergeAllowed).toBeFalse();
    expect(fixture.nativeElement.textContent).toContain('Load current form');

    const steps: string[] = [];
    spyOn(formComponent, 'exportConflictLocalValues').and.callFake(() => {
      steps.push('export');
      (formComponent as any).conflictExportCompleted = true;
      return '{}';
    });
    spyOn<any>(formComponent, 'reloadWindow').and.callFake(() => steps.push('reload'));
    formComponent.reloadCurrentFormAfterConflict();

    expect(steps).toEqual(['export', 'reload']);
  });

  it('warns before navigation for unresolved memory-only work and bypasses only the explicit exported reload', async () => {
    const { formComponent } = await createConcurrencyTestForm();
    formComponent.form?.get('title')?.setValue('Unsaved title');
    (formComponent as any).captureConflictResponse(conflictSaveResponse('form-changed'));
    const localStorageSpy = spyOn(window.localStorage, 'setItem');
    const sessionStorageSpy = spyOn(window.sessionStorage, 'setItem');
    (formComponent as any).window = null;

    const firstEvent = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: '' } as any;
    expect(formComponent.protectUnresolvedConflictNavigation(firstEvent)).toBe(
      'Leaving will discard unresolved changes.'
    );
    expect(firstEvent.preventDefault).toHaveBeenCalledTimes(1);
    expect(firstEvent.returnValue).toBe('Leaving will discard unresolved changes.');

    const reloadSpy = spyOn<any>(formComponent, 'reloadWindow');
    formComponent.reloadCurrentFormAfterConflict();
    expect(reloadSpy).not.toHaveBeenCalled();
    const explicitReloadEvent = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: '' } as any;
    expect(formComponent.protectUnresolvedConflictNavigation(explicitReloadEvent)).toBe(
      'Leaving will discard unresolved changes.'
    );
    expect(explicitReloadEvent.preventDefault).toHaveBeenCalledTimes(1);

    const laterEvent = { preventDefault: jasmine.createSpy('preventDefault'), returnValue: '' } as any;
    expect(formComponent.protectUnresolvedConflictNavigation(laterEvent)).toBe(
      'Leaving will discard unresolved changes.'
    );
    expect(localStorageSpy).not.toHaveBeenCalled();
    expect(sessionStorageSpy).not.toHaveBeenCalled();
  });

  it('cleans one-shot navigation state on destroy', async () => {
    const { fixture, formComponent } = await createConcurrencyTestForm();

    (formComponent as any).allowConflictNavigationOnce = true;
    fixture.destroy();
    expect((formComponent as any).allowConflictNavigationOnce).toBeFalse();
    expect((formComponent as any).window).toBeNull();
  });

  it('parses request params on startup and exposes accessors', () => {
    setWindowSearch('?focusTabId=tab2&workspace=active&flag&multi=a&multi=b&empty=');

    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;

    expect(formComponent.requestParams()).toEqual({
      focusTabId: 'tab2',
      workspace: 'active',
      flag: true,
      multi: ['a', 'b'],
      empty: ''
    });
    expect(formComponent.getRequestParam('focusTabId')).toBe('tab2');
    expect(formComponent.getRequestParam('missing')).toBeUndefined();
  });

  it('refreshRequestParamsFromUrl updates the runtime request params', () => {
    setWindowSearch('?initial=one');

    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    expect(formComponent.requestParams()).toEqual({ initial: 'one' });

    setWindowSearch('?flag&multi=one&multi=two&empty=');
    formComponent.refreshRequestParamsFromUrl();

    expect(formComponent.requestParams()).toEqual({
      flag: true,
      multi: ['one', 'two'],
      empty: ''
    });
  });

  it('returns an empty request-param map when the URL has no query string', () => {
    setWindowSearch('');

    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;

    expect(formComponent.requestParams()).toEqual({});
  });

  it('should call saveForm when form.save.execute is published (Task 15)', async () => {
    // Ensure initComponent runs so the EventBus subscription is created
    const formConfig: FormConfigFrame = {
      name: 'save-exec-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_exec',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'trigger save exec'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    const spy = spyOn(formComponent, 'saveForm').and.stub();

    // Publish execute command after subscription is in place
    bus.publish(createFormSaveExecuteEvent({
      force: true,
      enabledValidationGroups: ["none"],
      operation: 'submit',
      targetStep: 'S1',
    }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      force: true, operation: 'submit', targetStep: 'S1', enabledValidationGroups: ["none"],
      closeOnSave: undefined, redirectLocation: undefined, redirectDelaySeconds: undefined,
    });
  });

  it('broadcastFormStatus publishes current validation status and refreshes the status signal', async () => {
    const formConfig: FormConfigFrame = {
      name: 'broadcast-form-status',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_status',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'status value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormValidationBroadcastEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_VALIDATION_BROADCAST).subscribe(event => events.push(event));

    try {
      formComponent.broadcastFormStatus();

      expect(events.length).toBe(1);
      expect(events[0].isValid).toBe(formComponent.dataStatus.valid);
      expect(events[0].errors).toBe(formComponent.dataStatus.errors);
      expect(events[0].status).toEqual(formComponent.dataStatus);
      expect(formComponent.formGroupStatus()).toEqual(formComponent.dataStatus);
    } finally {
      sub.unsubscribe();
    }
  });

  it('broadcasts the settled result of form-level async validation without restarting it', async () => {
    const formConfig: FormConfigFrame = {
      name: 'async-form-validator-status-broadcast',
      debugValue: false,
      defaultComponentConfig: { defaultComponentCssClasses: 'row' },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'async_field',
          model: { class: 'SimpleInputModel', config: { value: 'ready' } },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const broadcasts: FormValidationBroadcastEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_VALIDATION_BROADCAST)
      .subscribe(event => broadcasts.push(event));
    let validatorCalls = 0;

    try {
      formComponent.form!.setAsyncValidators([
        async () => {
          validatorCalls += 1;
          await Promise.resolve();
          return null;
        },
      ]);
      formComponent.form!.updateValueAndValidity();
      await fixture.whenStable();

      expect(validatorCalls).toBe(1);
      expect(formComponent.form!.status).toBe('VALID');
      expect(broadcasts.length).toBeGreaterThan(0);
      const settledBroadcast = broadcasts[broadcasts.length - 1];
      expect(settledBroadcast?.status?.pending).toBeFalse();
      expect(settledBroadcast?.isValid).toBeTrue();
    } finally {
      sub.unsubscribe();
    }
  });

  it('broadcastFormStatus is a no-op when the form has not been created yet', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    const bus = TestBed.inject(FormComponentEventBus);
    const publishSpy = spyOn(bus, 'publish').and.callThrough();

    formComponent.broadcastFormStatus();

    expect(publishSpy).not.toHaveBeenCalled();
  });

  it('broadcasts refreshed validation status after validation groups change', async () => {
    const formConfig: FormConfigFrame = {
      name: 'validation-group-status-broadcast',
      debugValue: false,
      validationGroups: {
        none: { description: '', initialMembership: 'none' },
        tester: { description: '' }
      },
      enabledValidationGroups: ['none'],
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'required_when_tester',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required', groups: { include: ['tester'] } }
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormValidationBroadcastEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_VALIDATION_BROADCAST).subscribe(event => events.push(event));

    try {
      expect(formComponent.form?.valid).toBeTrue();

      bus.publish(createFormValidationGroupsChangeRequestEvent({
        initial: 'current',
        groups: { include: ['tester'] }
      }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(formComponent.enabledValidationGroups).toEqual(['none', 'tester']);
      expect(formComponent.form?.valid).toBeFalse();
      expect(events.length).toBeGreaterThanOrEqual(1);
      expect(events[events.length - 1].isValid).toBeFalse();
      expect(events[events.length - 1].status).toEqual(formComponent.dataStatus);
      expect(formComponent.formGroupStatus()).toEqual(formComponent.dataStatus);
    } finally {
      sub.unsubscribe();
    }
  });

  it('allows legacy callers to invoke saveForm directly (Task 17)', async () => {
    const formConfig: FormConfigFrame = {
      name: 'legacy-save',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_legacy',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'legacy value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const submitSpy = spyOn(formComponent, 'saveForm').and.stub();
    await formComponent.saveForm({
      force: true,
        targetStep: 'legacy-step',
      enabledValidationGroups:  ['none'],
    });
    expect(submitSpy).toHaveBeenCalledWith({
      force: true,
      targetStep: 'legacy-step',
      enabledValidationGroups:  ['none'],
    });
  });

  it('waits for pending async validation before saving', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    let resolveValidation: (() => void) | undefined;
    let validatorRuns = 0;
    const asyncValidator = () => {
      validatorRuns += 1;
      if (validatorRuns === 1) {
        return new Promise<null>(resolve => {
          resolveValidation = () => resolve(null);
        });
      }
      return new Promise<null>(() => undefined);
    };
    formComponent.form = new FormGroup({
      async_field: new FormControl('ready'),
    }, {
      asyncValidators: [asyncValidator],
    });
    formComponent.oid.set('oid-123');
    formComponent.form.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());

    let saveCompleted = false;
    const savePromise = formComponent.saveForm().then(() => {
      saveCompleted = true;
    });
    await Promise.resolve();

    expect(formComponent.form.pending).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();
    expect(saveCompleted).toBeFalse();

    resolveValidation?.();
    await savePromise;

    expect(updateSpy).toHaveBeenCalledOnceWith('oid-123', { async_field: 'ready' }, '', undefined, {});
    expect(saveCompleted).toBeTrue();
    expect(validatorRuns).toBe(1);
  });

  it('waits for pending async validation started without emitting form events', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    let resolveValidation: (() => void) | undefined;
    const asyncValidator = () => new Promise<null>(resolve => {
      resolveValidation = () => resolve(null);
    });
    formComponent.form = new FormGroup({
      async_field: new FormControl('ready'),
    });
    formComponent.form.setAsyncValidators([asyncValidator]);
    formComponent.form.updateValueAndValidity({ emitEvent: false });
    formComponent.oid.set('oid-123');
    formComponent.form.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());

    const savePromise = formComponent.saveForm();
    await Promise.resolve();

    expect(formComponent.form.pending).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();

    resolveValidation?.();
    await savePromise;

    expect(updateSpy).toHaveBeenCalledOnceWith('oid-123', { async_field: 'ready' }, '', undefined, {});
  });

  it('saves without delay when validation is already settled', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({
      settled_field: new FormControl('ready'),
    });
    formComponent.oid.set('oid-123');
    formComponent.form.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());

    await formComponent.saveForm();

    expect(updateSpy).toHaveBeenCalledOnceWith('oid-123', { settled_field: 'ready' }, '', undefined, {});
  });

  it('does not save invalid forms when forced', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({
      required_field: new FormControl('', Validators.required),
    });
    formComponent.form.updateValueAndValidity();
    formComponent.oid.set('oid-123');
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());

    await formComponent.saveForm({force: true, targetStep: 'review'});

    expect(formComponent.form.invalid).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('replaces prior server errors with uniquely keyed translated save issues', function () {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    const control = new FormControl('value');
    control.setErrors({ required: true, 'server#old': { class: 'server' } });
    formComponent.form = new FormGroup({ title: control });

    (formComponent as any).clearServerSaveProblems();
    (formComponent as any).applyServerSaveProblems({
      requestId: 'request-1',
      problems: [{
        kind: 'validation',
        phase: 'pre-save',
        issues: [
          { field: 'title', message: '@record-save-failed' },
          { pointer: '/metadata/title', message: '@record-save-invalid-hook-configuration' },
        ],
      }],
    });

    expect(control.errors?.['required']).toBeTrue();
    expect(control.errors?.['server#old']).toBeUndefined();
    expect(control.errors?.['server#0']).toEqual({ class: 'server', message: '@record-save-failed', params: {} });
    expect(control.errors?.['server#1']).toEqual({ class: 'server', message: '@record-save-invalid-hook-configuration', params: {} });
  });

  it('leaves ambiguous repeatable pointer suffixes at form level', function () {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    const first = new FormControl('one');
    const second = new FormControl('two');
    formComponent.form = new FormGroup({ repeatable: new FormGroup({}) });
    formComponent.componentDefArr = [
      { name: 'title', compConfigJson: {} as any, model: { formControl: first } as any, lineagePaths: { dataModel: ['repeatable', 0, 'title'] } as any },
      { name: 'title', compConfigJson: {} as any, model: { formControl: second } as any, lineagePaths: { dataModel: ['repeatable', 1, 'title'] } as any },
    ];

    (formComponent as any).applyServerSaveProblems({
      problems: [{
        kind: 'validation',
        phase: 'pre-save',
        issues: [{ pointer: '/metadata/missing/title', message: '@record-save-failed' }],
      }],
    });

    expect(first.errors).toBeNull();
    expect(second.errors).toBeNull();
    expect(formComponent.form.errors?.['server#0']).toEqual({
      class: 'server',
      message: '@record-save-failed',
      params: {},
    });
  });

  it('maps server validator ownership and metadata to the configured target field', function () {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    const source = new FormControl('source');
    const target = new FormControl('target');
    formComponent.form = new FormGroup({ source, target });
    formComponent.componentDefArr = [
      {
        name: 'source',
        compConfigJson: { name: 'source' } as any,
        model: { formControl: source } as any,
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['source'],
          angularComponents: ['source'],
          angularComponentsJsonPointer: '/source',
        } as any,
      },
      {
        name: 'target',
        compConfigJson: { name: 'target' } as any,
        model: { formControl: target } as any,
        lineagePaths: {
          formConfig: ['componentDefinitions', 1],
          dataModel: ['target'],
          angularComponents: ['details', 'target'],
          angularComponentsJsonPointer: '/details/target',
        } as any,
      },
    ];
    const bus = TestBed.inject(FormComponentEventBus);
    const focusEvents: any[] = [];
    const sub = bus.select$(FormComponentEventType.FIELD_FOCUS_REQUEST).subscribe(event => focusEvents.push(event));

    try {
      (formComponent as any).applyServerSaveProblems({
        requestId: 'request-target',
        problems: [{
          kind: 'validation',
          phase: 'pre-save',
          issues: [{
            pointer: '/source',
            message: '@validator-error-min-length',
            class: 'minLength',
            params: { requiredLength: 3, actualLength: 2 },
            targetField: { formConfig: ['componentDefinitions', 1] },
            lineagePaths: { angularComponents: ['source'] },
          }],
        }],
      });

      expect(source.errors).toBeNull();
      expect(target.errors?.['server#0']).toEqual({
        class: 'minLength',
        message: '@validator-error-min-length',
        params: { requiredLength: 3, actualLength: 2 },
        targetField: { formConfig: ['componentDefinitions', 1] },
      });
      expect(focusEvents.length).toBe(1);
      expect(focusEvents[0].lineagePath).toEqual(['details', 'target']);
      expect(focusEvents[0].requestId).toBe('request-target');
    } finally {
      sub.unsubscribe();
    }
  });

  it('uses server lineage to select one nested repeatable field without a pointer', function () {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    const first = new FormControl('one');
    const second = new FormControl('two');
    formComponent.form = new FormGroup({ repeatable: new FormGroup({}) });
    formComponent.componentDefArr = [
      {
        name: 'title',
        compConfigJson: { name: 'title' } as any,
        model: { formControl: first } as any,
        lineagePaths: {
          dataModel: ['repeatable', 0, 'title'],
          angularComponents: ['repeatable', 0, 'title'],
        } as any,
      },
      {
        name: 'title',
        compConfigJson: { name: 'title' } as any,
        model: { formControl: second } as any,
        lineagePaths: {
          dataModel: ['repeatable', 1, 'title'],
          angularComponents: ['repeatable', 1, 'title'],
        } as any,
      },
    ];

    (formComponent as any).applyServerSaveProblems({
      problems: [{
        kind: 'validation',
        phase: 'pre-save',
        issues: [{
          message: '@validator-error-required',
          lineagePaths: { dataModel: ['repeatable', 1, 'title'] },
        }],
      }],
    });

    expect(first.errors).toBeNull();
    expect(second.errors?.['server#0']).toEqual({
      class: 'server',
      message: '@validator-error-required',
      params: {},
    });
  });

  it('emits the unknown outcome language key without pre-translating it', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({ title: new FormControl('changed') });
    formComponent.form.markAsDirty();
    formComponent.oid.set('oid-123');
    spyOn(formComponent.recordService, 'update').and.resolveTo({
      outcome: 'unknown',
      requestId: 'request-unknown',
      isComplete: () => false,
      wasPersisted: () => false,
    } as any);
    const bus = TestBed.inject(FormComponentEventBus);
    const failureEvents: any[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_SAVE_FAILURE).subscribe(event => failureEvents.push(event));

    try {
      await formComponent.saveForm();

      expect(failureEvents.length).toBe(1);
      expect(failureEvents[0].error).toBe('@dmpt-form-save-unknown-update');
      expect(failureEvents[0].requestId).toBe('request-unknown');
    } finally {
      sub.unsubscribe();
    }
  });

  it('emits a persisted warning without requesting close or redirect', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({ title: new FormControl('changed') });
    formComponent.form.markAsDirty();
    formComponent.oid.set('oid-123');
    spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse({
      outcome: 'saved-with-warnings',
      isComplete: () => false,
      requestId: 'request-warning',
      metadata: { postSaveSyncWarning: 'true' },
    }));
    const bus = TestBed.inject(FormComponentEventBus);
    const successEvents: FormSaveSuccessEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_SAVE_SUCCESS).subscribe(event => successEvents.push(event));

    try {
      await formComponent.saveForm({ closeOnSave: true, redirectLocation: '/next', redirectDelaySeconds: 5 });

      expect(successEvents.length).toBe(1);
      expect(successEvents[0].response?.outcome).toBe('saved-with-warnings');
      expect(successEvents[0].requestId).toBe('request-warning');
      expect(successEvents[0].closeOnSave).toBeUndefined();
      expect(successEvents[0].redirectLocation).toBeUndefined();
      expect(formComponent.saveResponse()?.outcome).toBe('saved-with-warnings');
    } finally {
      sub.unsubscribe();
    }
  });

  it('reports undefined and unmodified forms as distinct save failures', async () => {
    const undefinedFixture = TestBed.createComponent(FormComponent);
    const undefinedComponent = undefinedFixture.componentInstance;
    const undefinedBus = TestBed.inject(FormComponentEventBus);
    const undefinedFailures: any[] = [];
    const undefinedSub = undefinedBus.select$(FormComponentEventType.FORM_SAVE_FAILURE)
      .subscribe(event => undefinedFailures.push(event));

    await undefinedComponent.saveForm();

    expect(undefinedFailures[undefinedFailures.length - 1]?.error).toBe('@dmpt-form-not-defined');
    undefinedSub.unsubscribe();

    const modifiedFixture = TestBed.createComponent(FormComponent);
    const modifiedComponent = modifiedFixture.componentInstance;
    modifiedComponent.form = new FormGroup({ title: new FormControl('unchanged') });
    const modifiedBus = TestBed.inject(FormComponentEventBus);
    const modifiedFailures: any[] = [];
    const modifiedSub = modifiedBus.select$(FormComponentEventType.FORM_SAVE_FAILURE)
      .subscribe(event => modifiedFailures.push(event));

    await modifiedComponent.saveForm();

    expect(modifiedFailures[modifiedFailures.length - 1]?.error).toBe('@dmpt-form-not-modified');
    modifiedSub.unsubscribe();
  });

  it('maps angular JSON pointers to lineage-aware focus requests', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    const control = new FormControl('value');
    formComponent.form = new FormGroup({ title: control });
    formComponent.componentDefArr = [{
      name: 'title',
      compConfigJson: {},
      model: { formControl: control },
      lineagePaths: {
        angularComponents: ['section', 'title'],
        angularComponentsJsonPointer: '/section/title',
        dataModel: ['title'],
      },
    } as any];
    const bus = TestBed.inject(FormComponentEventBus);
    const focusEvents: any[] = [];
    const sub = bus.select$(FormComponentEventType.FIELD_FOCUS_REQUEST).subscribe(event => focusEvents.push(event));

    try {
      (formComponent as any).applyServerSaveProblems({
        requestId: 'request-focus',
        problems: [{
          kind: 'validation',
          phase: 'pre-save',
          issues: [{ pointer: '/section/title', message: '@record-save-failed' }],
        }],
      });

      expect(control.errors?.['server#0']).toBeDefined();
      expect(focusEvents.length).toBe(1);
      expect(focusEvents[0].lineagePath).toEqual(['section', 'title']);
      expect(focusEvents[0].requestId).toBe('request-focus');
      expect(focusEvents[0].source).toBe('server-save-validation');
    } finally {
      sub.unsubscribe();
    }
  });

  it('treats saved-with-warnings as a persisted operation save without closing the form', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({ title: new FormControl('changed') });
    formComponent.form.markAsDirty();
    formComponent.oid.set('oid-123');
    const response = persistedSaveResponse({
      outcome: 'saved-with-warnings',
      requestId: 'request-warning',
      isComplete: () => false,
    });
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(response);
    const bus = TestBed.inject(FormComponentEventBus);
    const successEvents: FormSaveSuccessEvent[] = [];
    const failureEvents: any[] = [];
    const successSub = bus.select$(FormComponentEventType.FORM_SAVE_SUCCESS)
      .subscribe(event => successEvents.push(event));
    const failureSub = bus.select$(FormComponentEventType.FORM_SAVE_FAILURE)
      .subscribe(event => failureEvents.push(event));

    try {
      await formComponent.saveForm({
        force: true,
        operation: 'publish',
        targetStep: 'published',
        enabledValidationGroups: ['all', 'publish'],
        closeOnSave: true,
      });

      expect(updateSpy).toHaveBeenCalledOnceWith(
        'oid-123',
        { title: 'changed' },
        'published',
        'publish',
        {}
      );
      expect(successEvents.length).toBe(1);
      expect(successEvents[0].response?.outcome).toBe('saved-with-warnings');
      expect(successEvents[0].closeOnSave).toBeUndefined();
      expect(failureEvents).toEqual([]);
    } finally {
      successSub.unsubscribe();
      failureSub.unsubscribe();
    }
  });

  it('fails save when pending async validation times out', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    (formComponent as any).pendingValidationTimeoutMs = 1;
    formComponent.form = new FormGroup({
      async_field: new FormControl('ready'),
    }, {
      asyncValidators: [() => new Promise<null>(() => undefined)],
    });
    formComponent.oid.set('oid-123');
    formComponent.form.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());
    const bus = TestBed.inject(FormComponentEventBus);
    const failureEvents: any[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_SAVE_FAILURE).subscribe(event => failureEvents.push(event));

    try {
      await formComponent.saveForm();

      expect(updateSpy).not.toHaveBeenCalled();
      expect(failureEvents.length).toBe(1);
      expect(failureEvents[0].error).toBe('@dmpt-form-validation-timeout');
    } finally {
      sub.unsubscribe();
    }
  });

  it('does not save when destroyed while async validation is pending', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({
      async_field: new FormControl('ready'),
    }, {
      asyncValidators: [() => new Promise<null>(() => undefined)],
    });
    formComponent.oid.set('oid-123');
    formComponent.form.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());

    const savePromise = formComponent.saveForm();
    await Promise.resolve();
    expect(formComponent.form.pending).toBeTrue();

    formComponent.ngOnDestroy();
    await savePromise;

    expect(updateSpy).not.toHaveBeenCalled();
  });

  // Exercises the pending-validation save path under the full production
  // subscription stack. createFormAndWaitForReady wires up formGroupChangesSub
  // (form.events -> broadcastFormStatus), which the bare-FormGroup tests above
  // skip. When the validator resolves, Angular emits a StatusChangeEvent in the
  // same Angular tick that saveForm() resumes; this test pins down that the
  // resulting broadcastFormStatus call does not deadlock or torpedo the save.
  it('completes save when async validation resolves with form.events subscription live', async () => {
    const formConfig: FormConfigFrame = {
      name: 'async-validation-broadcast-subscription',
      debugValue: false,
      defaultComponentConfig: { defaultComponentCssClasses: 'row' },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'async_field',
          model: { class: 'SimpleInputModel', config: { value: 'ready' } },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // Single barrier shared across every call to the async validator: any
    // re-trigger (including broadcastFormStatus -> updateValueAndValidity) awaits
    // the same promise, so the form stays pending until we explicitly release it.
    let releaseBarrier!: (value: null) => void;
    const barrier = new Promise<null>(resolve => { releaseBarrier = resolve; });
    const asyncValidator = () => barrier;

    formComponent.form!.markAsDirty();
    formComponent.form!.setAsyncValidators([asyncValidator]);
    formComponent.form!.updateValueAndValidity();
    await Promise.resolve();
    expect(formComponent.form!.pending).toBeTrue();

    const broadcastSpy = spyOn(formComponent, 'broadcastFormStatus').and.callThrough();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());

    const bus = TestBed.inject(FormComponentEventBus);
    const successEvents: FormSaveSuccessEvent[] = [];
    const failureEvents: any[] = [];
    const validationBroadcasts: FormValidationBroadcastEvent[] = [];
    const successSub = bus.select$(FormComponentEventType.FORM_SAVE_SUCCESS).subscribe(evt => successEvents.push(evt));
    const failureSub = bus.select$(FormComponentEventType.FORM_SAVE_FAILURE).subscribe(evt => failureEvents.push(evt));
    const broadcastEventSub = bus.select$(FormComponentEventType.FORM_VALIDATION_BROADCAST)
      .subscribe(evt => validationBroadcasts.push(evt));

    try {
      const savePromise = formComponent.saveForm();
      await Promise.resolve();
      expect(updateSpy).not.toHaveBeenCalled();
      expect(formComponent.form!.pending).toBeTrue();

      const broadcastCallsBeforeResolve = broadcastSpy.calls.count();
      const broadcastEventsBeforeResolve = validationBroadcasts.length;

      releaseBarrier(null);
      await savePromise;

      // The formGroupChangesSub subscription must have fired broadcastFormStatus
      // at least once between releasing the barrier and the save completing.
      // That call publishes a FORM_VALIDATION_BROADCAST with the already-settled
      // status (it does not re-run validators on this path); if publishing that
      // broadcast interfered with the save resumption we would either see no
      // update call or a FORM_SAVE_FAILURE.
      expect(broadcastSpy.calls.count()).toBeGreaterThan(broadcastCallsBeforeResolve);
      expect(validationBroadcasts.length).toBeGreaterThan(broadcastEventsBeforeResolve);
      expect(updateSpy).toHaveBeenCalledTimes(1);
      expect(updateSpy.calls.mostRecent().args[1]).toEqual({ async_field: 'ready' });
      expect(successEvents.length).toBe(1);
      expect(failureEvents.length).toBe(0);
    } finally {
      successSub.unsubscribe();
      failureSub.unsubscribe();
      broadcastEventSub.unsubscribe();
    }
  });

  it('applies requested validation groups before saving', async () => {
    const formConfig: FormConfigFrame = {
      name: 'grouped-save-validation',
      debugValue: false,
      enabledValidationGroups: ['all', 'value-driven'],
      validationGroups: {
        all: {
          description: 'Default validation group.',
          initialMembership: 'all',
        },
        'value-driven': {
          description: 'A group enabled by form values before review submit.',
          initialMembership: 'none',
        },
        'submit-for-review': {
          description: 'Review submission validation group.',
          initialMembership: 'none',
        },
      },
      componentDefinitions: [
        {
          name: 'dirty_field',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'dirty value',
            },
          },
          component: {
            class: 'SimpleInputComponent',
          },
        },
        {
          name: 'review_required',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                {
                  class: 'required',
                  groups: {
                    include: ['submit-for-review'],
                    exclude: ['all'],
                  },
                },
              ],
            },
          },
          component: {
            class: 'SimpleInputComponent',
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());
    formComponent.form?.markAsDirty();

    expect(formComponent.form?.valid).toBeTrue();

    await formComponent.saveForm({
      targetStep: 'queued',
      enabledValidationGroups: ['all', 'value-driven', 'submit-for-review'],
    });

    expect(formComponent.enabledValidationGroups).toEqual(['all', 'value-driven', 'submit-for-review']);
    expect(formComponent.form?.valid).toBeFalse();
    expect(formComponent.form?.get('review_required')?.hasError('required')).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();

    await formComponent.saveForm({
      targetStep: 'queued',
      enabledValidationGroups: ['all', 'value-driven', 'submit-for-review'],
    });

    expect(formComponent.enabledValidationGroups).toEqual(['all', 'value-driven', 'submit-for-review']);
    expect(formComponent.form?.valid).toBeFalse();
    expect(updateSpy).not.toHaveBeenCalled();

    formComponent.form?.get('dirty_field')?.setValue('changed again');
    await fixture.whenStable();

    expect(formComponent.enabledValidationGroups).toEqual(['all', 'value-driven']);
    expect(formComponent.form?.get('review_required')?.hasError('required')).toBeFalse();
    expect(formComponent.form?.valid).toBeTrue();
  });

  it('restores nested group validity after temporary save validation', async () => {
    const formConfig: FormConfigFrame = {
      name: 'nested-grouped-save-validation',
      debugValue: false,
      enabledValidationGroups: ['none'],
      validationGroups: {
        none: {
          description: 'Allow incomplete draft saves.',
          initialMembership: 'none',
        },
        activation: {
          description: 'Validate fields required for activation.',
          initialMembership: 'all',
        },
      },
      componentDefinitions: [
        {
          name: 'description',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'Original description' },
          },
          component: { class: 'SimpleInputComponent' },
        },
        {
          name: 'contributor_ci',
          model: { class: 'GroupModel' },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'name',
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: '',
                      validators: [{ class: 'required' }],
                    },
                  },
                  component: { class: 'SimpleInputComponent' },
                },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo(persistedSaveResponse());

    expect(formComponent.form?.valid).toBeTrue();

    await formComponent.saveForm({
      force: true,
      targetStep: 'active',
      enabledValidationGroups: ['activation'],
    });

    expect(formComponent.form?.valid).toBeFalse();
    expect(formComponent.form?.get('contributor_ci')?.valid).toBeFalse();
    expect(updateSpy).not.toHaveBeenCalled();

    formComponent.form?.get('description')?.setValue('Changed description');
    await fixture.whenStable();

    expect(formComponent.enabledValidationGroups).toEqual(['none']);
    expect(formComponent.form?.get('contributor_ci.name')?.hasError('required')).toBeFalse();
    expect(formComponent.form?.get('contributor_ci')?.valid).toBeTrue();
    expect(formComponent.form?.valid).toBeTrue();
  });

  it('compares validation groups independent of order', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance as unknown as {
      validationGroupNamesEqual: (first: string[], second: string[]) => boolean;
    };

    expect(formComponent.validationGroupNamesEqual(['all', 'value-driven'], ['value-driven', 'all'])).toBeTrue();
    expect(formComponent.validationGroupNamesEqual(['all', 'value-driven'], ['all', 'submit-for-review'])).toBeFalse();
  });

  it('omits disabled controls from Form Values Debug data', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-filter-disabled',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'enabled_text',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'enabled value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'disabled_group',
          model: {
            class: 'GroupModel',
            config: {
              disabled: true,
              value: {}
            }
          },
          component: {
            class: 'GroupComponent',
            config: {
              disabled: true,
              componentDefinitions: []
            }
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const debugValues = formComponent.getDebugFormValue();

    expect(debugValues['enabled_text']).toBe('enabled value');
    expect(debugValues['disabled_group']).toBeUndefined();
  });

  it('updates URL to edit path and publishes event after successful create', async () => {
    const formConfig: FormConfigFrame = {
      name: 'create-url-update',
      debugValue: false,
      componentDefinitions: [
        {
          name: 'text_create',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'create value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: '',
      recordType: 'rdmp',
      editMode: true,
      formName: 'default-1.0-draft',
      downloadAndCreateOnInit: false
    });
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormSaveSuccessEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_SAVE_SUCCESS).subscribe(event => events.push(event));

    try {
      const location = fixture.debugElement.injector.get(Location);
      const replaceStateSpy = spyOn(location, 'replaceState').and.stub();
      (formComponent.recordService as any).brandingAndPortalUrl = 'http://localhost/default/rdmp';
      spyOn(formComponent.recordService, 'create').and.resolveTo(persistedSaveResponse({ oid: 'oid-123' }));

      await formComponent.saveForm({force: true});

      expect(formComponent.oid()).toBe('oid-123');
      expect(replaceStateSpy).toHaveBeenCalledWith('/default/rdmp/record/edit/oid-123');

      expect(events.length).toBe(1);
      expect(events[0].type).toEqual(FormComponentEventType.FORM_SAVE_SUCCESS);
      expect(events[0].savedData).toEqual({text_create: 'create value'});
      expect(events[0].oid).toEqual('oid-123');
      expect(events[0].response).toEqual(jasmine.objectContaining({ success: true, oid: 'oid-123', outcome: 'saved' }));
      expect(events[0].modelSnapshot).toEqual({text_create: 'create value'});
      expect(events[0].closeOnSave).toEqual(undefined);
      expect(events[0].redirectLocation).toEqual(undefined);
      expect(events[0].redirectDelaySeconds).toEqual(undefined);
    } finally {
      sub.unsubscribe();
    }
  });

  it('preserves edits made during a never-sync save and emits the current model snapshot', async () => {
    const formConfig: FormConfigFrame = {
      name: 'save-never-sync',
      debugValue: false,
      serverSyncOnSave: 'never',
      componentDefinitions: [
        {
          name: 'text_never_sync',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'initial value' },
          },
          component: { class: 'SimpleInputComponent' },
        },
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: 'oid-123',
      recordType: 'rdmp',
      editMode: true,
      formName: 'save-never-sync',
      downloadAndCreateOnInit: false,
    });
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormSaveSuccessEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_SAVE_SUCCESS).subscribe(event => events.push(event));
    let resolveUpdate!: (response: any) => void;
    const updatePromise = new Promise<any>(resolve => { resolveUpdate = resolve; });
    const updateSpy = spyOn(formComponent.recordService, 'update').and.returnValue(updatePromise);

    try {
      const control = formComponent.form!.get('text_never_sync')!;
      control.setValue('sent value');
      control.markAsDirty();
      formComponent.form!.markAsDirty();
      const savePromise = formComponent.saveForm();

      expect(updateSpy).toHaveBeenCalledOnceWith('oid-123', { text_never_sync: 'sent value' }, '', undefined, {});
      control.setValue('edited during save');
      control.markAsDirty();
      resolveUpdate(persistedSaveResponse({
        oid: 'oid-123',
        metadata: { text_never_sync: 'server value' },
      }));
      await savePromise;

      expect(control.value).toBe('edited during save');
      expect(control.dirty).toBeTrue();
      expect(events.length).toBe(1);
      expect(events[0].modelSnapshot).toEqual({text_never_sync: 'edited during save'});
    } finally {
      sub.unsubscribe();
    }
  });

  it('renders the debug panel component when URL debug mode is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-layout',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_debug_layout',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const debugPanels = fixture.nativeElement.querySelectorAll('redbox-form-debug-panel');
    expect(debugPanels.length).toBe(1);
  });

  it('renders translated config debug section when debug mode is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'translated-config-debug',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_translated_config',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    await ensureDebugPanelOpen(fixture);
    const configTabButton = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-debug-tabs button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Config');
    configTabButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const headings = Array.from(fixture.nativeElement.querySelectorAll('h4') as NodeListOf<HTMLHeadingElement>).map(item => item.textContent?.trim() ?? '');
    expect(headings).toContain('Form Debug');
    const subheadings = Array.from(fixture.nativeElement.querySelectorAll('h5') as NodeListOf<HTMLHeadingElement>).map(item => item.textContent?.trim() ?? '');
    expect(subheadings).toContain('Translated Form Config Debug');
  });

  it('hides all debug sections when debug mode is disabled', async () => {
    setFormDebugUrl();
    const formConfig: FormConfigFrame = {
      name: 'debug-hidden',
      debugValue: false,
      componentDefinitions: [
        {
          name: 'text_hidden',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelectorAll('redbox-form-debug-panel').length).toBe(0);
    expect(fixture.nativeElement.querySelectorAll('.rb-form-debug-expand').length).toBe(0);
  });

  it('enables debug UI when formDebug query param is true-like', async () => {
    setFormDebugUrl('YES');
    const formConfig: FormConfigFrame = {
      name: 'debug-query-enabled',
      componentDefinitions: [
        {
          name: 'text_query_enabled',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelectorAll('redbox-form-debug-panel').length).toBe(1);
  });

  it('does not enable debug UI for invalid formDebug query param values', async () => {
    setFormDebugUrl('off');
    const debugState = TestBed.inject(FormDebugStateService);
    debugState.refreshFromUrl();
    const formConfig: FormConfigFrame = {
      name: 'debug-query-disabled',
      componentDefinitions: [
        {
          name: 'text_query_disabled',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(
      formConfig,
      undefined,
      { formDebugParam: 'off' }
    );
    formComponent.debugState.isDebugEnabled.set(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('redbox-form-debug-panel').length).toBe(0);
  });

  it('shows loading indicator before components are loaded', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit.set(false);
    fixture.autoDetectChanges();
    await fixture.whenStable();

    const loadingElement = fixture.nativeElement.querySelector('.rb-form-loading');
    expect(loadingElement).toBeTruthy();
  });

  it('hides loading indicator after components are loaded', async () => {
    const formConfig: FormConfigFrame = {
      name: 'loading-indicator-hidden',
      componentDefinitions: [
        {
          name: 'text_loading_hidden',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const fixture = TestBed.createComponent(FormComponent);

    ensureApplicationRefFormComponent(fixture.componentRef);

    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit.set(false);
    fixture.autoDetectChanges();
    await fixture.whenStable();

    setUpDynamicAssets();
    await formComponent.downloadAndCreateFormComponents(formConfig);
    fixture.detectChanges();
    await fixture.whenStable();

    const loadingElement = fixture.nativeElement.querySelector('.rb-form-loading');
    expect(loadingElement).toBeNull();
  });

  it('marks the form dirty when a FORM_STATUS_DIRTY_REQUEST event is published', async () => {
    const formConfig: FormConfigFrame = {
      name: 'dirty-request-event',
      componentDefinitions: [
        {
          name: 'text_dirty_request',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    expect(formComponent.form?.dirty).toBeFalse();
    bus.publish(createFormStatusDirtyRequestEvent({ fieldId: 'text_dirty_request', sourceId: 'test-spec', reason: 'user-delete' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.form?.dirty).toBeTrue();
    expect(formComponent.form?.get('text_dirty_request')?.dirty).toBeTrue();
    expect(formComponent.subMaps['formStatusDirtyRequestSub']).toBeTruthy();
  });

  it('changes enabledValidationGroups when requested', async () => {
    const formConfig: FormConfigFrame = {
      name: 'validation-groups-change-request-form',
      debugValue: true,
      validationGroups: {
        "none": {description: "", initialMembership:"none"},
        "tester": {description: ""}
      },
      enabledValidationGroups: ["none"],
      componentDefinitions: [
        {
          name: 'text_1',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'value', validators: [
              {class: "minLength", config: { minLength: 3 }, groups:{include: ["tester"]}}
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          },
          expressions: [
            {
              name: 'text_1_set_validation_groups',
              config: {
                template: '{"initial": "current", "groups": {"include":["tester"]}}',
                condition: "/text_1::field.value.changed",
                conditionKind: "jsonpointer",
                target: 'form.enabledValidationGroups',
                hasTemplate: true,
              },
            },
          ]
        }
      ]
    };
    const dynamicAssetOptions: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: "http://localhost/default/rdmp/dynamicAsset/formCompiledItems/rdmp",
        callable: function (keyStr: string, key: (string | number)[], context: any, extra?: any) {
          switch (keyStr) {
            case "componentDefinitions__0__expressions__0__config__template":
              return {"initial": "current", "groups": {"include":["tester"]}};
            default:
              throw new Error(`Unknown key: ${keyStr}`);
          }
        }
      }]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(
      formConfig, undefined, undefined, dynamicAssetOptions);
    const compiled = fixture.nativeElement as HTMLElement;

    const events: any[] = [];
    const eventBus = TestBed.inject(FormComponentEventBus);
    const sub = eventBus.selectAll$().subscribe(e => events.push(e));

    try {
      const inputEl = compiled.querySelector<HTMLInputElement>('input');
      if (!inputEl){
        throw new Error("could not find inputEl");
      }

      expect(inputEl.value).toEqual("value");

      inputEl.value = "new-value";
      inputEl.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await fixture.whenStable();

      fixture.detectChanges();
      await fixture.whenStable();

      expect(events.length).withContext(JSON.stringify(events)).toBeGreaterThanOrEqual(5);

      const validationChangeEvents = events.filter(
        event => event.type === FormComponentEventType.FORM_VALIDATION_CHANGE_REQUEST
      );
      expect(validationChangeEvents.length).withContext(JSON.stringify(events)).toBeGreaterThanOrEqual(1);

      const event = validationChangeEvents[validationChangeEvents.length - 1];
      expect(event.type).toEqual(FormComponentEventType.FORM_VALIDATION_CHANGE_REQUEST);
      expect(event.initial).toEqual("current");
      expect(event.groups).toEqual({"include":["tester"]});

      expect(formComponent.enabledValidationGroups).toEqual(["none", "tester"]);
    } finally {
      sub?.unsubscribe();
    }
  });

  it('should publish a redirect requested event and redirect on save success and closeOnSave is truthy', fakeAsync(async () => {
    const formConfig: FormConfigFrame = {
      name: 'save-exec-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_exec',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'trigger save exec'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormRedirectRequestedEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_REDIRECT_REQUESTED).subscribe(event => events.push(event));

    try {
      const location = fixture.debugElement.injector.get(Location);
      const changeLocationHrefSpy = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
      const locationHistoryGoSpy = spyOn(location, 'historyGo').and.stub();
      bus.publish(createFormSaveSuccessEvent({
        closeOnSave: true,
        redirectLocation: 'redirect-location/one',
        redirectDelaySeconds: 2,
      }));

      fixture.detectChanges();
      await fixture.whenStable();

      flushMicrotasks();
      tick(2000);

      fixture.detectChanges();
      await fixture.whenStable();

      expect(changeLocationHrefSpy).toHaveBeenCalledWith('redirect-location/one');
      expect(locationHistoryGoSpy).not.toHaveBeenCalled();
      expect(events.length).toEqual(1);
      expect(events[0].historyDelta).toEqual(undefined);
      expect(events[0].redirectLocation).toEqual('redirect-location/one');
      expect(events[0].redirectDelaySeconds).toEqual(2);
    } finally {
      sub?.unsubscribe();
    }
  }));
  it('should publish a redirect requested event and redirect on delete success and closeOnDelete is truthy', fakeAsync(async () => {
    const formConfig: FormConfigFrame = {
      name: 'save-exec-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_exec',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'trigger save exec'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormRedirectRequestedEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_REDIRECT_REQUESTED).subscribe(event => events.push(event));

    try {
      const location = fixture.debugElement.injector.get(Location);
      const changeLocationHrefSpy = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
      const locationHistoryGoSpy = spyOn(location, 'historyGo').and.stub();
      bus.publish(createFormDeleteSuccessEvent({
        closeOnDelete: true,
        redirectDelaySeconds: 2,
      }));

      fixture.detectChanges();
      await fixture.whenStable();

      flushMicrotasks();
      tick(2000);

      fixture.detectChanges();
      await fixture.whenStable();

      expect(changeLocationHrefSpy).not.toHaveBeenCalled();
      expect(locationHistoryGoSpy).toHaveBeenCalledWith(-1);
      expect(events.length).toEqual(1);
      expect(events[0].historyDelta).toEqual(-1);
      expect(events[0].redirectLocation).toEqual(undefined);
      expect(events[0].redirectDelaySeconds).toEqual(2);
    } finally {
      sub?.unsubscribe();
    }
  }));
  it('should not publish a redirect requested event on save success and closeOnSave is falsy', async () => {
    const formConfig: FormConfigFrame = {
      name: 'save-exec-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_exec',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'trigger save exec'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormRedirectRequestedEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_REDIRECT_REQUESTED).subscribe(event => events.push(event));

    try {
      const location = fixture.debugElement.injector.get(Location);
      const changeLocationHrefSpy = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
      const locationHistoryGoSpy = spyOn(location, 'historyGo').and.stub();
      bus.publish(createFormSaveSuccessEvent({
        redirectLocation: 'redirect-location/two',
        redirectDelaySeconds: 10,
      }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(changeLocationHrefSpy).not.toHaveBeenCalled();
      expect(locationHistoryGoSpy).not.toHaveBeenCalled();
      expect(events.length).toEqual(0);
    } finally {
      sub?.unsubscribe();
    }
  });
  it('should not publish a redirect requested event on delete success and closeOnDelete is falsy', async () => {
    const formConfig: FormConfigFrame = {
      name: 'save-exec-test',
      debugValue: false,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      componentDefinitions: [
        {
          name: 'text_exec',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'trigger save exec'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const events: FormRedirectRequestedEvent[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_REDIRECT_REQUESTED).subscribe(event => events.push(event));

    try {
      const location = fixture.debugElement.injector.get(Location);
      const changeLocationHrefSpy = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
      const locationHistoryGoSpy = spyOn(location, 'historyGo').and.stub();
      bus.publish(createFormDeleteSuccessEvent({
        closeOnDelete: false,
        redirectDelaySeconds: 2,
      }));

      fixture.detectChanges();
      await fixture.whenStable();

      expect(changeLocationHrefSpy).not.toHaveBeenCalled();
      expect(locationHistoryGoSpy).not.toHaveBeenCalled();
      expect(events.length).toEqual(0);
    } finally {
      sub?.unsubscribe();
    }
  });
});
