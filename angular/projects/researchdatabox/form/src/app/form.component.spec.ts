import {fakeAsync, flushMicrotasks, TestBed, tick} from '@angular/core/testing';
import { Location } from '@angular/common';
import { ApplicationRef } from '@angular/core';
import { HttpTestingController } from '@angular/common/http/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { FormComponent } from './form.component';
import { FormConfigFrame, jsonataCompileAndEvaluate } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './component/simple-input.component';
import { ContentComponent } from './component/content.component';
import { GroupFieldComponent } from './component/group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './component/repeatable.component';
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
  createFieldValueChangedEvent,
  createFormDefinitionChangedEvent,
  createFormDeleteSuccessEvent,
  createFormSaveExecuteEvent,
  createFormSaveSuccessEvent,
  createFormStatusDirtyRequestEvent,
  createFormValidationGroupsChangeRequestEvent,
  FormComponentEventType,
  FormRedirectRequestedEvent,
  FormSaveSuccessEvent,
  FormValidationBroadcastEvent,
} from './form-state';


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

  type Field = NonNullable<FormConfigFrame['componentDefinitions']>[number];
  const contributorList = (value: unknown[], disabled = false, extraFields: Field[] = []): Field => ({
    name: 'creators',
    model: { class: 'RepeatableModel', config: { value } },
    expressions: [{
      name: 'enable-from-record',
      config: { target: 'field.disabled', template: 'false', condition: '/dataRecord::field.value.changed', runOnFormReady: false },
    }],
    component: {
      class: 'RepeatableComponent',
      config: {
        allowZeroRows: true,
        disabled,
        elementTemplate: {
          name: '',
          model: { class: 'GroupModel', config: {} },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                { name: 'name', model: { class: 'SimpleInputModel', config: {} }, component: { class: 'SimpleInputComponent' } },
                ...extraFields,
              ],
            },
          },
        },
      },
    },
  });

  beforeEach(async () => {
    setWindowSearch('?formDebug=1');
    await createTestbedModule(
      {
        declarations: {
          "SimpleInputComponent": SimpleInputComponent,
          "ContentComponent": ContentComponent,
          "GroupFieldComponent": GroupFieldComponent,
          "RepeatableComponent": RepeatableComponent,
          "RepeatableElementLayoutComponent": RepeatableElementLayoutComponent,
        }
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

  for (const testCase of [
    { error: new HttpErrorResponse({ status: 404, url: '/default/rdmp/record/form/auto/deleted-oid' }), message: 'missing-record' },
    { error: new HttpErrorResponse({ status: 404, url: '/default/rdmp/record/metadata/deleted-oid' }), message: 'missing-record' },
    { error: new HttpErrorResponse({ status: 500, url: '/default/rdmp/record/form/auto/oid-1' }), message: 'form-load-error' },
    { error: new HttpErrorResponse({ status: 404, url: '/default/rdmp/dynamicAsset/formTemplates/rdmp' }), message: 'form-load-error' },
    { error: new HttpErrorResponse({ status: 404 }), message: 'form-load-error' },
    { error: new Error('Unable to initialize form components'), message: 'form-load-error' },
  ]) {
    it(`replaces the spinner with an alert for ${testCase.error.message}`, async () => {
      spyOn(TestBed.inject(FormService), 'downloadFormComponents').and.rejectWith(testCase.error);
      const fixture = TestBed.createComponent(FormComponent);
      fixture.componentInstance.oid.set('deleted-oid');
      fixture.autoDetectChanges();
      await fixture.whenStable();

      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.rb-form-loading')).toBeNull();
      expect(element.querySelector('.rb-form-shell__main--loading')).toBeNull();
      expect(element.querySelector('[role="alert"]')?.textContent)
        .toContain(TestBed.inject(TranslationService).t(testCase.message));
      expect(fixture.componentInstance.componentsLoaded()).toBeFalse();
    });
  }

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
    bus.publish(createFormSaveExecuteEvent({ force: true, enabledValidationGroups: ["none"], targetStep: 'S1' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith({
      force: true, targetStep: 'S1', enabledValidationGroups: ["none"],
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
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);

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

    expect(updateSpy).toHaveBeenCalledOnceWith('oid-123', { async_field: 'ready' }, '', { formSave: true });
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
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);

    const savePromise = formComponent.saveForm();
    await Promise.resolve();

    expect(formComponent.form.pending).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();

    resolveValidation?.();
    await savePromise;

    expect(updateSpy).toHaveBeenCalledOnceWith('oid-123', { async_field: 'ready' }, '', { formSave: true });
  });

  it('saves without delay when validation is already settled', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({
      settled_field: new FormControl('ready'),
    });
    formComponent.oid.set('oid-123');
    formComponent.form.markAsDirty();
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);

    await formComponent.saveForm();

    expect(updateSpy).toHaveBeenCalledOnceWith('oid-123', { settled_field: 'ready' }, '', { formSave: true });
  });

  it('does not save invalid forms when forced', async () => {
    const fixture = TestBed.createComponent(FormComponent);
    const formComponent = fixture.componentInstance;
    formComponent.form = new FormGroup({
      required_field: new FormControl('', Validators.required),
    });
    formComponent.form.updateValueAndValidity();
    formComponent.oid.set('oid-123');
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);

    await formComponent.saveForm({force: true, targetStep: 'review'});

    expect(formComponent.form.invalid).toBeTrue();
    expect(updateSpy).not.toHaveBeenCalled();
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
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);
    const bus = TestBed.inject(FormComponentEventBus);
    const failureEvents: any[] = [];
    const sub = bus.select$(FormComponentEventType.FORM_SAVE_FAILURE).subscribe(event => failureEvents.push(event));

    try {
      await formComponent.saveForm();

      expect(updateSpy).not.toHaveBeenCalled();
      expect(failureEvents.length).toBe(1);
      expect(failureEvents[0].error).toBe('Form validation timed out. Please try again.');
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
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);

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
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);

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
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);
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
    const updateSpy = spyOn(formComponent.recordService, 'update').and.resolveTo({ success: true } as any);

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
      const navigate = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
      (formComponent.recordService as any).brandingAndPortalUrl = 'http://localhost/default/rdmp';
      spyOn(formComponent.recordService, 'create').and.resolveTo({
        success: true,
        oid: 'oid-123'
      } as any);

      await formComponent.saveForm({force: true});

      expect(formComponent.oid()).toBe('oid-123');
      expect(formComponent.formName()).toBe('');
      expect(replaceStateSpy).toHaveBeenCalledWith('/default/rdmp/record/edit/oid-123');
      expect(navigate).toHaveBeenCalledOnceWith('/default/rdmp/record/edit/oid-123', true);

      expect(events.length).toBe(1);
      expect(events[0].type).toEqual(FormComponentEventType.FORM_SAVE_SUCCESS);
      expect(events[0].savedData).toEqual({text_create: 'create value'});
      expect(events[0].oid).toEqual('oid-123');
      expect(events[0].response).toEqual({success: true, oid: 'oid-123'});
      expect(events[0].closeOnSave).toEqual(undefined);
      expect(events[0].redirectLocation).toEqual(undefined);
      expect(events[0].redirectDelaySeconds).toEqual(undefined);
    } finally {
      sub.unsubscribe();
    }
  });

  it('opens the persisted draft when Save and Close has no previous page', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'create-close-fallback',
      componentDefinitions: [{
        name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft title' } },
        component: { class: 'SimpleInputComponent' },
      }],
    }, { oid: '', recordType: 'rdmp', editMode: true, formName: '', downloadAndCreateOnInit: false });
    spyOn(formComponent.recordService, 'create').and.resolveTo({
      success: true, oid: 'created-draft', message: '', data: null,
    });
    spyOn<any>(formComponent, 'canNavigateBack').and.returnValue(false);
    const navigate = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
    const redirect = spyOn(formComponent, 'doRedirect').and.stub();
    const replaceUrl = spyOn(fixture.debugElement.injector.get(Location), 'replaceState').and.stub();

    await formComponent.saveForm({ force: true, closeOnSave: true });

    const editPath = jasmine.stringMatching(/\/record\/edit\/created-draft$/);
    expect(replaceUrl).toHaveBeenCalledOnceWith(editPath);
    expect(navigate).toHaveBeenCalledOnceWith(editPath, true);
    expect(redirect).not.toHaveBeenCalled();
  });

  it('opens the persisted editor when Back restores a create-and-close page', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'create-restore',
      componentDefinitions: [{
        name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft title' } },
        component: { class: 'SimpleInputComponent' },
      }],
    }, { oid: '', recordType: 'rdmp', editMode: true, formName: '', downloadAndCreateOnInit: false });
    const navigate = spyOn<any>(formComponent, 'changeLocationHref').and.stub();
    const redirect = spyOn(formComponent, 'doRedirect').and.stub();
    const replaceUrl = spyOn(fixture.debugElement.injector.get(Location), 'replaceState').and.stub();
    spyOn(formComponent.recordService, 'create').and.resolveTo({
      success: true, oid: 'restored-draft', message: '', data: null,
    });

    await formComponent.saveForm({ force: true, closeOnSave: true, redirectLocation: '/dashboard' });
    fixture.detectChanges();
    const editPath = jasmine.stringMatching(/\/record\/edit\/restored-draft$/);
    expect(redirect).toHaveBeenCalledWith(jasmine.objectContaining({ redirectLocation: '/dashboard' }));
    expect(replaceUrl).toHaveBeenCalledOnceWith(editPath);
    expect(fixture.nativeElement.querySelector('.rb-form-components').inert).toBeTrue();
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }));
    expect(navigate).not.toHaveBeenCalled();

    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
    expect(navigate).toHaveBeenCalledOnceWith(editPath, true);
  });

  it('keeps the create form inert while saving and restores it after a create failure', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'create-lock',
      componentDefinitions: [{
        name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Submitted' } },
        component: { class: 'SimpleInputComponent' },
      }],
    }, { oid: '', recordType: 'rdmp', editMode: true, formName: '', downloadAndCreateOnInit: false });

    let failCreate!: (error: Error) => void;
    const create = spyOn(formComponent.recordService, 'create').and.returnValue(new Promise((_resolve, reject) => {
      failCreate = reject;
    }));
    const editor: HTMLElement = fixture.nativeElement;
    const fields = editor.querySelector<HTMLElement>('.rb-form-components')!;
    const originalForm = formComponent.form;
    const pending = formComponent.saveForm({ force: true });
    fixture.detectChanges();
    expect(fields.inert).toBeTrue();
    await formComponent.saveForm({ force: true });
    expect(create).toHaveBeenCalledOnceWith({ title: 'Submitted' }, 'rdmp', '');

    failCreate(new Error('Create request failed'));
    await pending;
    fixture.detectChanges();
    expect(fields.inert).toBeFalse();
    expect(formComponent.form).toBe(originalForm);
    expect(formComponent.form?.get('title')?.value).toBe('Submitted');
    expect(formComponent.form?.dirty).toBeTrue();
  });

  it('shows an editor load error at the saved draft URL if navigation cannot start', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'create-navigation-error',
      componentDefinitions: [{
        name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Submitted' } },
        component: { class: 'SimpleInputComponent' },
      }],
    }, { oid: '', recordType: 'rdmp', editMode: true, formName: '', downloadAndCreateOnInit: false });
    const create = spyOn(formComponent.recordService, 'create').and.resolveTo({
      success: true, oid: 'draft', message: '', data: null,
    });
    const replaceUrl = spyOn(fixture.debugElement.injector.get(Location), 'replaceState').and.stub();
    spyOn<any>(formComponent, 'changeLocationHref').and.throwError('Navigation failed');
    const update = spyOn(formComponent.recordService, 'update');

    await formComponent.saveForm({ force: true });
    fixture.detectChanges();
    expect(replaceUrl).toHaveBeenCalledOnceWith(jasmine.stringMatching(/\/record\/edit\/draft$/));
    expect(formComponent.oid()).toBe('draft');
    expect(formComponent.saveResponse()?.success).toBeTrue();
    const editor: HTMLElement = fixture.nativeElement;
    expect(editor.querySelector('.rb-form-shell__main [role="alert"]')?.textContent)
      .toContain(TestBed.inject(TranslationService).t('form-load-error'));
    expect(editor.querySelector<HTMLElement>('.rb-form-components')?.hidden).toBeTrue();

    await formComponent.saveForm({ force: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(update).not.toHaveBeenCalled();
  });

  it('saves an existing creator and a group child after enablement', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        contributorList([{ name: 'Original creator' }], true),
        {
          name: 'details',
          model: {
            class: 'GroupModel',
            config: { value: { conditional: 'Before', sibling: 'Before', creators: [{ name: 'Nested creator' }] } },
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'conditional',
                  model: { class: 'SimpleInputModel', config: { disabled: true } },
                  component: { class: 'SimpleInputComponent', config: { disabled: true } },
                  expressions: [{
                    name: 'enable',
                    config: { target: 'component.disabled', hasTemplate: true, template: 'false', condition: '/dataRecord::field.value.changed', runOnFormReady: false },
                  }],
                },
                { name: 'sibling', model: { class: 'SimpleInputModel', config: {} }, component: { class: 'SimpleInputComponent' } },
                contributorList([]),
              ],
            },
          },
        },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(structuredClone(config), {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    }, undefined, {
      entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/',
        callable: () => false,
      }],
    });

    const form = formComponent.form!;
    expect(form.get('creators')?.disabled).toBeTrue();
    expect(form.get('details.conditional')?.disabled).toBeTrue();
    const bus = TestBed.inject(FormComponentEventBus);
    fixture.ngZone!.run(() => bus.publish(createFieldValueChangedEvent({
      fieldId: '/dataRecord', sourceId: '*', value: false,
    })));
    await fixture.whenStable();
    expect(form.get('details.conditional')?.enabled).toBeTrue();
    form.get(['creators', 0, 'name'])?.setValue('Edited creator');
    form.get('details.conditional')?.setValue('Enabled and edited');
    form.get('details.sibling')?.setValue('Edited sibling');
    form.markAsDirty();
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null,
    });

    await formComponent.saveForm();

    expect(update).toHaveBeenCalledOnceWith('publication', {
      creators: [{ name: 'Edited creator' }],
      details: { conditional: 'Enabled and edited', sibling: 'Edited sibling', creators: [{ name: 'Nested creator' }] },
    }, '', { formSave: true });
  });

  it('sends a retained row position instead of the value of a disabled row', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        contributorList([{ name: 'Disabled' }, { name: 'Editable' }]),
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    const rowProofs = { '["creators"]': ['first', 'second'] };
    formComponent.formDefMap!.formConfigMeta = { oid: 'publication', rowProofs };
    formComponent.form!.get(['creators', 0])!.disable();
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: rowProofs,
    });

    await formComponent.saveForm({ force: true });

    expect(update).toHaveBeenCalledOnceWith('publication', {
      title: 'Draft', creators: [null, { name: 'Editable' }],
    }, '', { formSave: true, rowEdits: { '["creators"]': [
      { source: 0, proof: 'first', retain: true }, { source: 1, proof: 'second' },
    ] } });

    const rows = formComponent.getComponentDefByName('creators')?.component as RepeatableComponent;
    const layout = rows.formFieldCompMapEntries[1].layout as RepeatableElementLayoutComponent<unknown>;
    layout.removeFn!();
    expect(formComponent.form!.get('creators')?.disabled).toBeTrue();
    update.and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { '["creators"]': ['first'] },
    });
    await formComponent.saveForm({ force: true });
    await formComponent.saveForm({ force: true });
    const retained = { formSave: true, rowEdits: { '["creators"]': [{ source: 0, proof: 'first', retain: true }] } };
    expect(update.calls.argsFor(1)).toEqual(['publication', { title: 'Draft', creators: [null] }, '', retained]);
    expect(update.calls.argsFor(2)).toEqual(['publication', { title: 'Draft', creators: [null] }, '', retained]);
  });

  it('saves removal of the last enabled row through an aggregate-disabled group', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        {
          name: 'details',
          model: { class: 'GroupModel', config: { value: { creators: [{ name: 'Disabled' }, { name: 'Remove' }] } } },
          component: { class: 'GroupComponent', config: { componentDefinitions: [contributorList([])] } },
        },
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    const path = '["details","creators"]';
    formComponent.formDefMap!.formConfigMeta = {
      oid: 'publication', rowProofs: { [path]: ['first', 'second'] },
    };
    const details = formComponent.getComponentDefByName('details')?.component as GroupFieldComponent;
    const rows = details.formFieldCompMapEntries.find(entry => entry.compConfigJson.name === 'creators')?.component as RepeatableComponent;
    formComponent.form!.get(['details', 'creators', 0])!.disable();
    const layout = rows.formFieldCompMapEntries[1].layout as RepeatableElementLayoutComponent<unknown>;
    layout.removeFn!();
    expect(formComponent.form!.get('details.creators')?.disabled).toBeTrue();
    expect(formComponent.form!.get('details')?.disabled).toBeTrue();

    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { [path]: ['first'] },
    });
    await formComponent.saveForm({ force: true });
    expect(update).toHaveBeenCalledOnceWith('publication', { title: 'Draft', details: { creators: [null] } }, '', {
      formSave: true, rowEdits: { [path]: [{ source: 0, proof: 'first', retain: true }] },
    });

    details.setDisabled(true);
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(1)).toEqual(['publication', { title: 'Draft' }, '', { formSave: true }]);
  });

  it('persists visible move and remove actions for a repeatable with read-only values', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        ...['orderedReadOnly', 'readOnlyDefaults'].map(name => ({
          name,
          model: { class: 'RepeatableModel' as const, config: { value: ['First', 'Second'] } },
          component: {
            class: 'RepeatableComponent' as const,
            config: { allowZeroRows: true, canSort: true, elementTemplate: {
              name: '',
              model: { class: 'SimpleInputModel' as const, config: { disabled: true } },
              component: { class: 'SimpleInputComponent' as const },
            } },
          },
        })),
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    const path = '["orderedReadOnly"]';
    formComponent.formDefMap!.formConfigMeta = {
      oid: 'publication', editableRowPaths: [path, '["readOnlyDefaults"]'], rowProofs: { [path]: ['first', 'second'] },
    };
    fixture.detectChanges();
    const editor: HTMLElement = fixture.nativeElement;
    expect(editor.querySelector('.rb-form-repeatable__add')).toBeNull();
    expect(editor.querySelectorAll('.rb-form-repeatable-item__remove').length).toBe(2);
    const moveDown = editor.querySelector<HTMLButtonElement>('.rb-form-repeatable-item__move-down')!;
    expect(moveDown.disabled).toBeFalse();
    moveDown.click();
    fixture.detectChanges();

    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { [path]: ['second-now-first', 'first-now-second'] },
    });
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(0)).toEqual(['publication', { title: 'Draft', orderedReadOnly: [null, null] }, '', {
      formSave: true, rowEdits: { [path]: [{ source: 1, proof: 'second', retain: true }, { source: 0, proof: 'first', retain: true }] },
    }]);

    const remove = editor.querySelectorAll<HTMLButtonElement>('.rb-form-repeatable-item__remove')[1];
    expect(remove.disabled).toBeFalse();
    remove.click();
    fixture.detectChanges();
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(1)).toEqual(['publication', { title: 'Draft', orderedReadOnly: [null] }, '', {
      formSave: true, rowEdits: { [path]: [{ source: 0, proof: 'second-now-first', retain: true }] },
    }]);
    editor.querySelector<HTMLButtonElement>('.rb-form-repeatable-item__remove')!.click();
    fixture.detectChanges();
    update.and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { [path]: [] },
    });
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(2)).toEqual(['publication', { title: 'Draft', orderedReadOnly: [] }, '', {
      formSave: true, rowEdits: { [path]: [] },
    }]);
    formComponent.form!.get('title')!.setValue('Edited after removal');
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(3)).toEqual(['publication', { title: 'Edited after removal' }, '', { formSave: true }]);
  });

  it('preserves a read-only list whose rendered rows have no form controls during a workflow save', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        {
          name: 'displayRows',
          model: { class: 'RepeatableModel', config: { value: ['First', 'Second'] } },
          component: {
            class: 'RepeatableComponent',
            config: { allowZeroRows: true, canSort: true, elementTemplate: {
              name: '',
              component: { class: 'ContentComponent', config: { disabled: true, content: 'Display only' } },
            } },
          },
        },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    const path = '["displayRows"]';
    formComponent.formDefMap!.formConfigMeta = {
      oid: 'publication', editableRowPaths: [path], rowProofs: { [path]: ['first', 'second'] },
    };
    fixture.detectChanges();
    const editor: HTMLElement = fixture.nativeElement;
    expect(editor.querySelectorAll('redbox-content').length).toBe(2);
    expect(formComponent.form!.get('displayRows')?.value).toEqual([]);
    expect(editor.querySelector('.rb-form-repeatable-item__remove')).toBeNull();
    expect(editor.querySelector('.rb-form-repeatable-item__move-down')).toBeNull();

    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null,
    });
    formComponent.form!.get('title')!.setValue('Edited');
    await formComponent.saveForm({ force: true, targetStep: 'review' });
    expect(update).toHaveBeenCalledOnceWith('publication', { title: 'Edited' }, 'review', { formSave: true });
  });

  it('restricts read-only row actions and saving while the parent model is explicitly disabled', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        {
          name: 'details',
          model: { class: 'GroupModel', config: { value: { readOnlyRows: ['First', 'Second'] } } },
          component: {
            class: 'GroupComponent',
            config: { componentDefinitions: [{
              name: 'readOnlyRows',
              model: { class: 'RepeatableModel' },
              component: {
                class: 'RepeatableComponent',
                config: { allowZeroRows: true, canSort: true, elementTemplate: {
                  name: '',
                  model: { class: 'SimpleInputModel', config: { disabled: true } },
                  component: { class: 'SimpleInputComponent' },
                } },
              },
            }] },
          },
        },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    const path = '["details","readOnlyRows"]';
    const rowProofs = { [path]: ['first', 'second'] };
    formComponent.formDefMap!.formConfigMeta = { oid: 'publication', editableRowPaths: [path], rowProofs };
    fixture.detectChanges();
    const editor: HTMLElement = fixture.nativeElement;
    const details = formComponent.getComponentDefByName('details')!;
    expect(details.model?.formControl?.disabled).toBeTrue();
    expect(editor.querySelector<HTMLButtonElement>('.rb-form-repeatable-item__remove')?.disabled).toBeFalse();

    // This is the same model setter used by the model.disabled expression target.
    details.model!.setDisabled(true);
    fixture.detectChanges();
    expect(editor.querySelector('.rb-form-repeatable-item__remove')).toBeNull();
    expect(editor.querySelector('.rb-form-repeatable-item__move-down')).toBeNull();

    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: rowProofs,
    });
    formComponent.form!.get('title')!.setValue('Edited');
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(0)).toEqual(['publication', { title: 'Edited' }, '', { formSave: true }]);

    details.model!.setDisabled(false);
    fixture.detectChanges();
    editor.querySelector<HTMLButtonElement>('.rb-form-repeatable-item__remove')!.click();
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(1)).toEqual(['publication', {
      title: 'Edited', details: { readOnlyRows: [null] },
    }, '', { formSave: true, rowEdits: { [path]: [{ source: 1, proof: 'second', retain: true }] } }]);
  });

  it('omits a repeatable whose row template is statically disabled', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        {
          name: 'displayOnly',
          model: { class: 'RepeatableModel', config: { value: ['Keep'] } },
          component: {
            class: 'RepeatableComponent',
            config: { elementTemplate: {
              name: '',
              model: { class: 'SimpleInputModel', config: { disabled: true } },
              component: { class: 'SimpleInputComponent' },
              layout: { class: 'RepeatableElementLayout', config: { disabled: true } },
            } },
          },
        },
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    formComponent.formDefMap!.formConfigMeta = { oid: 'publication', rowProofs: {} };
    expect(formComponent.form!.get(['displayOnly', 0])?.value).toBe('Keep');
    expect(formComponent.form!.get(['displayOnly', 0])?.disabled).toBeTrue();
    formComponent.form!.get('title')!.setValue('Edited');

    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null,
    });
    await formComponent.saveForm({ force: true });
    expect(update).toHaveBeenCalledOnceWith('publication', { title: 'Edited' }, '', { formSave: true });
  });

  it('omits an enabled repeatable with no editable row fields on successive saves', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        {
          name: 'displayOnly',
          model: { class: 'RepeatableModel', config: { value: [{ name: 'Keep' }] } },
          component: {
            class: 'RepeatableComponent',
            config: { elementTemplate: {
              name: '',
              model: { class: 'GroupModel', config: {} },
              component: { class: 'GroupComponent', config: { componentDefinitions: [{
                name: 'name',
                model: { class: 'SimpleInputModel', config: { disabled: true } },
                component: { class: 'SimpleInputComponent' },
              }] } },
            } },
          },
        },
      ],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    formComponent.formDefMap!.formConfigMeta = { oid: 'publication', rowProofs: {}, editableRowPaths: [] };
    expect(formComponent.form!.get(['displayOnly', 0])).toBeInstanceOf(FormGroup);
    fixture.detectChanges();
    const editor: HTMLElement = fixture.nativeElement;
    expect(editor.querySelector('.rb-form-repeatable__add')).toBeNull();
    expect(editor.querySelector('.rb-form-repeatable-item__remove')).toBeNull();
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null,
    });
    const title = formComponent.form!.get('title')!;
    for (const value of ['First edit', 'Second edit']) {
      title.setValue(value);
      await formComponent.saveForm({ force: true });
    }

    expect(update.calls.allArgs()).toEqual([
      ['publication', { title: 'First edit' }, '', { formSave: true }],
      ['publication', { title: 'Second edit' }, '', { formSave: true }],
    ]);
  });

  const creatorImportConfig = (initial: { name: string }[], disabled = false) => {
    const oidTemplate = 'event.value.oid';
    const template = '$map(event.value.contributor_ci, function($creator) {{"name": $creator.family_name}})';
    const enableTemplate = 'event.value ? false : true';
    const creators = contributorList(initial, disabled);
    creators.expressions = [{
      name: 'enable-creators-from-data-record',
      config: {
        conditionKind: 'jsonpointer', condition: '/dataRecord::field.value.changed', runOnFormReady: true,
        target: 'field.disabled', hasTemplate: true, template: enableTemplate,
      },
    }, {
      name: 'creators-from-data-record',
      config: {
        conditionKind: 'jsonpointer', condition: '/dataRecordGetter::field.value.changed', runOnFormReady: false,
        target: 'model.value', hasTemplate: true, template,
      },
    }];
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [creators],
      behaviours: [{
        name: 'fetch-selected-data-record',
        conditionKind: 'jsonpointer', condition: '/dataRecord::field.value.changed', runOnFormReady: false,
        processors: [
          { type: 'jsonataTransform', config: { hasTemplate: true, template: oidTemplate } },
          { type: 'fetchMetadata' },
        ],
        actions: [{
          type: 'emitEvent',
          config: { eventType: 'field.value.changed', fieldId: '/dataRecordGetter', sourceId: '*' },
        }],
      }],
    };
    const assets: DynamicAssetOptions = {
      entries: [{
        urlKeyStart: 'http://localhost/default/rdmp/dynamicAsset/formCompiledItems/',
        callable: (_key, path, context) => jsonataCompileAndEvaluate(
          path.includes('processors') ? oidTemplate : path[path.length - 3] === 0 ? enableTemplate : template, context
        ),
      }],
    };
    return { config, assets };
  };

  const createCreatorImportForm = async (initial: { name: string }[], disabled = false) => {
    const { config, assets } = creatorImportConfig(initial, disabled);
    const { fixture, formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    }, undefined, assets);
    const fetch = spyOn(formComponent.recordService, 'getRecordMeta');
    const bus = TestBed.inject(FormComponentEventBus);
    let selectedOid = 'data-original';
    const select = async (oid: string) => {
      fixture.ngZone!.run(() => bus.publish(createFieldValueChangedEvent({
        fieldId: '/dataRecord', sourceId: '*', value: { oid }, previousValue: { oid: selectedOid },
      })));
      selectedOid = oid;
      await fixture.whenStable();
      formComponent.form!.markAsDirty();
    };
    return { formComponent, fetch, select };
  };

  it('retains disabled creators and row proofs across selector enablement, reselection, and import', async () => {
    const { formComponent, fetch, select } = await createCreatorImportForm([
      { name: 'Old creator' }, { name: 'Disabled creator' },
    ], true);
    const path = '["creators"]';
    formComponent.formDefMap!.formConfigMeta = {
      oid: 'publication', editableRowPaths: [path], rowProofs: { [path]: ['old', 'disabled'] },
    };
    const repeatable = formComponent.getComponentDefByName('creators')!.component as RepeatableComponent;
    const protectedRow = repeatable.formFieldCompMapEntries[1].model!;
    protectedRow.setDisabled(true);
    expect(repeatable.isDisabled).toBeTrue();
    const setDisabled = repeatable.setDisabled.bind(repeatable);
    const enablement = new Promise<void>(resolve => {
      spyOn(repeatable, 'setDisabled').and.callFake((disabled, opts) => {
        setDisabled(disabled, opts);
        if (!disabled) resolve();
      });
    });
    fetch.withArgs('data-original').and.callFake(async () => {
      await enablement;
      expect(repeatable.isDisabled).toBeFalse();
      expect(protectedRow.formControl?.disabled).toBeTrue();
      return { contributor_ci: [{ family_name: 'Original singleton from source' }] };
    });
    fetch.withArgs('data-1').and.resolveTo({ contributor_ci: [{ family_name: 'Alpha' }, { family_name: 'Beta' }] });
    fetch.withArgs('data-2').and.resolveTo({ contributor_ci: [{ family_name: 'Next import' }] });
    fetch.withArgs('data-missing-creators').and.resolveTo({ title: 'No supplied creator list' });
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null,
      savedRowProofs: { [path]: ['old', 'disabled'] },
    });
    await select('data-original');
    expect(fetch).toHaveBeenCalledWith('data-original');
    await formComponent.saveForm();
    expect(update).toHaveBeenCalledOnceWith(
      'publication', { creators: [{ name: 'Old creator' }, null] }, '',
      { formSave: true, rowEdits: { [path]: [{ source: 0, proof: 'old' }, { source: 1, proof: 'disabled', retain: true }] } },
    );
    update.calls.reset();
    update.and.resolveTo({
      success: true, oid: 'publication', message: '', data: null,
      savedRowProofs: { [path]: ['disabled-rebased', 'alpha', 'beta'] },
    });

    protectedRow.setDisabled(false);
    protectedRow.formControl!.disable();
    repeatable.setDisabled(true);
    await select('data-1');
    expect(fetch).toHaveBeenCalledWith('data-1');
    await formComponent.saveForm();
    expect(update.calls.argsFor(0)).toEqual([
      'publication', { creators: [null, { name: 'Alpha' }, { name: 'Beta' }] }, '',
      { formSave: true, rowEdits: { [path]: [{ source: 1, proof: 'disabled', retain: true }, null, null] } },
    ]);

    await select('data-missing-creators');
    formComponent.form!.get(['creators', 1, 'name'])!.setValue('Edited Alpha');
    await formComponent.saveForm();
    expect(update.calls.argsFor(1)).toEqual([
      'publication', { creators: [null, { name: 'Edited Alpha' }, { name: 'Beta' }] }, '',
      { formSave: true, rowEdits: { [path]: [
        { source: 0, proof: 'disabled-rebased', retain: true }, { source: 1, proof: 'alpha' }, { source: 2, proof: 'beta' },
      ] } },
    ]);

    await select('data-2');
    update.and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { [path]: ['retained', 'next'] },
    });
    await formComponent.saveForm({ targetStep: 'review' });
    expect(update.calls.argsFor(2)).toEqual([
      'publication', { creators: [null, { name: 'Next import' }] }, 'review',
      { formSave: true, rowEdits: { [path]: [{ source: 0, proof: 'disabled-rebased', retain: true }, null] } },
    ]);
  });

  it('sends an explicit replacement for a changed linked record with identical visible creators', async () => {
    const { formComponent, fetch, select } = await createCreatorImportForm([{ name: 'Same visible name' }]);
    const path = '["creators"]';
    formComponent.formDefMap!.formConfigMeta = {
      oid: 'publication', editableRowPaths: [path], rowProofs: { [path]: ['outgoing'] },
    };
    fetch.withArgs('other-record').and.resolveTo({ contributor_ci: [{ family_name: 'Same visible name' }] });
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { [path]: ['incoming'] },
    });
    await select('other-record');
    await formComponent.saveForm({ targetStep: 'review' });
    expect(update).toHaveBeenCalledOnceWith(
      'publication', { creators: [{ name: 'Same visible name' }] }, 'review',
      { formSave: true, rowEdits: { [path]: [null] } },
    );
  });

  it('retries a failed linked-record import for the same OID before review', async () => {
    const { formComponent, fetch, select } = await createCreatorImportForm([{ name: 'Previous creator' }]);
    const path = '["creators"]';
    formComponent.formDefMap!.formConfigMeta = {
      oid: 'publication', editableRowPaths: [path], rowProofs: { [path]: ['previous'] },
    };
    let attempts = 0;
    fetch.withArgs('new-source').and.callFake(async () => {
      if (++attempts === 1) throw new Error('Unable to load the selected record');
      return { contributor_ci: [{ family_name: 'New creator' }] };
    });
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { [path]: ['incoming'] },
    });

    await select('new-source');
    expect(formComponent.form!.get(['creators', 0, 'name'])?.value).toBe('Previous creator');
    await select('new-source');
    await formComponent.saveForm({ targetStep: 'review' });
    expect(update).toHaveBeenCalledOnceWith(
      'publication', { creators: [{ name: 'New creator' }] }, 'review',
      { formSave: true, rowEdits: { [path]: [null] } },
    );

    formComponent.form!.get(['creators', 0, 'name'])!.setValue('Edited imported creator');
    await select('new-source');
    await formComponent.saveForm();
    expect(update.calls.argsFor(1)).toEqual([
      'publication', { creators: [{ name: 'Edited imported creator' }] }, '',
      { formSave: true, rowEdits: { [path]: [{ source: 0, proof: 'incoming' }] } },
    ]);
  });

  for (const failure of ['HTTP fetch', 'creator expression', 'row application'] as const) {
    it(`blocks first save after a failed ${failure} and applies the same-OID retry`, async () => {
      const { config, assets } = creatorImportConfig([{ name: 'Previous creator' }]);
      const evaluate = assets.entries[0].callable;
      let failExpression = failure === 'creator expression';
      assets.entries[0].callable = async (key, path, context) => {
        if (failExpression && path.includes('expressions') && path[path.length - 3] === 1) {
          failExpression = false;
          throw new Error('Temporary creator template failure');
        }
        return evaluate(key, path, context);
      };
      const { fixture, formComponent } = await createFormAndWaitForReady(config, {
        oid: '', formName: '', recordType: 'dataPublication', editMode: true, downloadAndCreateOnInit: false,
      }, undefined, assets);
      const repeatable = formComponent.getComponentDefByName('creators')!.component as RepeatableComponent;
      if (failure === 'row application') {
        let failApplication = true;
        const append = repeatable.appendNewElement.bind(repeatable);
        spyOn(repeatable, 'appendNewElement').and.callFake(async (...args) => {
          await append(...args);
          if (failApplication) {
            failApplication = false;
            throw new Error('Temporary creator row failure');
          }
        });
      }
      let failFetch = failure === 'HTTP fetch';
      const fetch = spyOn(formComponent.recordService, 'getRecordMeta').and.callFake(async () => {
        if (failFetch) {
          failFetch = false;
          throw new Error('Temporary HTTP failure');
        }
        return { contributor_ci: [{ family_name: 'Imported creator' }] };
      });
      const create = spyOn(formComponent.recordService, 'create').and.resolveTo({
        success: true, oid: 'new-draft', message: '', data: null,
      });
      spyOn<any>(formComponent, 'changeLocationHref').and.stub();
      spyOn(fixture.debugElement.injector.get(Location), 'replaceState').and.stub();
      const bus = TestBed.inject(FormComponentEventBus);
      const select = async (previous: string) => {
        fixture.ngZone!.run(() => bus.publish(createFieldValueChangedEvent({
          fieldId: '/dataRecord', sourceId: '*', value: { oid: 'new-link' }, previousValue: { oid: previous },
        })));
        await fixture.whenStable();
      };
      await select('old-link');
      expect(formComponent.form!.get('creators')?.value).toEqual([{ name: 'Previous creator' }]);
      await formComponent.saveForm({ force: true });
      expect(create).not.toHaveBeenCalled();

      await select('new-link');
      expect(fetch.calls.allArgs()).toEqual([['new-link'], ['new-link']]);
      await formComponent.saveForm({ force: true });
      expect(create).toHaveBeenCalledOnceWith({ creators: [{ name: 'Imported creator' }] }, 'dataPublication', '');
    });
  }

  it('loads persisted row proofs after create before a linked record import and review save', async () => {
    setWindowSearch('?dataRecordOid=old-source');
    const createForm = creatorImportConfig([{ name: 'Same name' }]);
    createForm.config.behaviours![0].debounceMs = 25;
    const createEditor = await createFormAndWaitForReady(createForm.config, {
      oid: '', formName: '', recordType: 'dataPublication', editMode: true, downloadAndCreateOnInit: false,
    }, undefined, createForm.assets);
    const create = spyOn(createEditor.formComponent.recordService, 'create').and.resolveTo({
      success: true, oid: 'persisted-draft', message: '', data: null,
    });
    const navigate = spyOn<any>(createEditor.formComponent, 'changeLocationHref').and.stub();
    spyOn(createEditor.fixture.debugElement.injector.get(Location), 'replaceState').and.stub();
    expect(createEditor.formComponent.getRequestParam('dataRecordOid')).toBe('old-source');

    const bus = TestBed.inject(FormComponentEventBus);
    let finishFetch!: (metadata: Record<string, unknown>) => void;
    let fetchStarted!: () => void;
    const fetching = new Promise<void>(resolve => { fetchStarted = resolve; });
    const fetch = spyOn(createEditor.formComponent.recordService, 'getRecordMeta').and.callFake(() => {
      fetchStarted();
      return new Promise(resolve => { finishFetch = resolve; });
    });
    createEditor.fixture.ngZone!.run(() => {
      bus.publish(createFieldValueChangedEvent({
        fieldId: '/dataRecord', sourceId: '*', value: { oid: 'old-source' },
      }));
      bus.publish(createFieldValueChangedEvent({
        fieldId: '/dataRecord', sourceId: '*', value: { oid: 'old-source' }, previousValue: { oid: 'old-source' },
      }));
      bus.publish(createFieldValueChangedEvent({
        fieldId: '/unrelated', sourceId: '*', value: 'Unrelated edit',
      }));
    });
    await createEditor.formComponent.saveForm({ force: true });
    expect(fetch).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    await fetching;
    await createEditor.formComponent.saveForm({ force: true });
    expect(create).not.toHaveBeenCalled();
    finishFetch({ contributor_ci: [{ family_name: 'Imported before create' }] });
    await createEditor.fixture.whenStable();

    // A successful fetch with no creators settles the import without replacing the current list.
    fetch.and.resolveTo({});
    createEditor.fixture.ngZone!.run(() => bus.publish(createFieldValueChangedEvent({
      fieldId: '/dataRecord', sourceId: '*', value: { oid: 'source-without-creators' }, previousValue: { oid: 'old-source' },
    })));
    await createEditor.fixture.whenStable();
    expect(fetch).toHaveBeenCalledWith('source-without-creators');
    await createEditor.formComponent.saveForm({ force: true });
    expect(create).toHaveBeenCalledOnceWith({ creators: [{ name: 'Imported before create' }] }, 'dataPublication', '');
    expect(navigate).toHaveBeenCalledOnceWith(jasmine.stringMatching(/\/record\/edit\/persisted-draft$/), true);
    const editUrl = new URL(navigate.calls.first().args[0], window.location.origin);
    expect(editUrl.searchParams.has('dataRecordOid')).toBeFalse();
    expect(createEditor.formComponent.getRequestParam('dataRecordOid')).toBeUndefined();
    createEditor.fixture.destroy();
    const appComponents = TestBed.inject(ApplicationRef).components;
    const closed = appComponents.indexOf(createEditor.fixture.componentRef);
    if (closed >= 0) appComponents.splice(closed, 1);
    setWindowSearch(editUrl.search);

    // The persisted edit form can include rows or metadata added by save hooks.
    const { config, assets } = creatorImportConfig([{ name: 'Imported before create' }, { name: 'Disabled creator' }]);
    const loadCondition = '$exists(runtimeContext.requestParams.dataRecordOid)';
    const loadOid = 'runtimeContext.requestParams.dataRecordOid';
    config.behaviours!.push({
      name: 'import-on-form-ready',
      conditionKind: 'jsonata_query', condition: loadCondition, runOnFormReady: true,
      processors: [
        { type: 'jsonataTransform', config: { hasTemplate: true, template: loadOid } },
        { type: 'fetchMetadata' },
      ],
      actions: [{ type: 'emitEvent', config: {
        eventType: 'field.value.changed', fieldId: '/dataRecordGetter', sourceId: '*',
      } }],
    });
    const evaluate = assets.entries[0].callable;
    assets.entries[0].callable = (key, path, context) =>
      path[0] === 'behaviours' && path[1] === 1
        ? jsonataCompileAndEvaluate(path.includes('processors') ? loadOid : loadCondition, context)
        : evaluate(key, path, context);
    setUpDynamicAssets(assets);
    const fixture = TestBed.createComponent(FormComponent);
    ensureApplicationRefFormComponent(fixture.componentRef);
    const editor = fixture.componentInstance;
    editor.oid.set(editUrl.pathname.split('/').pop()!);
    editor.recordType.set('dataPublication');
    editor.formName.set('');
    editor.editMode.set(true);
    editor.downloadAndCreateOnInit.set(false);
    fixture.autoDetectChanges();
    await fixture.whenStable();

    fetch.calls.reset();
    fetch.and.resolveTo({ contributor_ci: [{ family_name: 'Same name' }] });
    const path = '["creators"]';
    const load = editor.downloadAndCreateFormComponents();
    const request = TestBed.inject(HttpTestingController).expectOne(req =>
      req.url.includes('/record/form/auto/persisted-draft?') &&
      new URL(req.url).searchParams.get('rowEdits') === 'true' &&
      new URL(req.url).searchParams.get('edit') === 'true'
    );
    request.flush({
      data: config,
      meta: { oid: 'persisted-draft', editableRowPaths: [path], rowProofs: { [path]: ['outgoing', 'disabled'] } },
    });
    await load;
    await fixture.whenStable();
    expect(fetch).not.toHaveBeenCalled();
    editor.form!.get(['creators', 1])!.disable();

    fixture.ngZone!.run(() => bus.publish(createFieldValueChangedEvent({
      fieldId: '/dataRecord', sourceId: '*', value: { oid: 'new-source' }, previousValue: { oid: 'old-source' },
    })));
    await fixture.whenStable();
    expect(fetch).toHaveBeenCalledOnceWith('new-source');
    const update = spyOn(editor.recordService, 'update').and.resolveTo({
      success: true, oid: 'persisted-draft', message: '', data: null,
      savedRowProofs: { [path]: ['disabled-rebased', 'incoming'] },
    });
    await editor.saveForm({ force: true });
    expect(update).toHaveBeenCalledOnceWith(
      'persisted-draft', { creators: [null, { name: 'Same name' }] }, '',
      { formSave: true, rowEdits: { [path]: [{ source: 1, proof: 'disabled', retain: true }, null] } },
    );

    editor.form!.get(['creators', 1, 'name'])!.setValue('Edited after import');
    await editor.saveForm({ force: true, targetStep: 'review' });
    expect(update.calls.argsFor(1)).toEqual([
      'persisted-draft', { creators: [null, { name: 'Edited after import' }] }, 'review',
      { formSave: true, rowEdits: { [path]: [{ source: 0, proof: 'disabled-rebased', retain: true }, { source: 1, proof: 'incoming' }] } },
    ]);
  });

  it('keeps replacement and descendant lists in the same tracking mode across saves', async () => {
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        { name: 'title', model: { class: 'SimpleInputModel', config: { value: 'Draft' } }, component: { class: 'SimpleInputComponent' } },
        contributorList([{ name: 'Old creator', notes: [{ name: 'Old note' }] }], false, [
          { ...contributorList([]), name: 'notes' },
        ]),
        { ...contributorList([{ name: 'Reviewer' }]), name: 'reviewers' },
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    const rowProofs = { '["creators"]': ['creator'], '["creators",0,"notes"]': ['note'], '["reviewers"]': ['reviewer'] };
    formComponent.formDefMap!.formConfigMeta = {
      oid: 'publication', rowProofs, editableRowPaths: ['["creators"]', '["creators",null,"notes"]', '["reviewers"]'],
    };
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: rowProofs,
    });
    await formComponent.saveForm({ force: true });
    expect(update.calls.argsFor(0)[3]).toEqual({ formSave: true, rowEdits: {
      '["creators"]': [{ source: 0, proof: 'creator' }],
      '["creators",0,"notes"]': [{ source: 0, proof: 'note' }],
      '["reviewers"]': [{ source: 0, proof: 'reviewer' }],
    } });
    update.calls.reset();

    const parent = formComponent.getComponentDefByName('creators')?.component as RepeatableComponent;
    const creators = [{ name: 'New creator', notes: [{ name: 'New note' }] }];
    await parent.replaceAllElements(creators);
    expect(formComponent.form!.get('creators')?.value).toEqual(creators);
    update.and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs: { '["reviewers"]': ['reviewer'] },
    });
    const title = formComponent.form!.get('title')!;
    for (const value of ['First edit', 'Second edit']) {
      title.setValue(value);
      await formComponent.saveForm({ force: true });
    }
    const options = { formSave: true, rowEdits: { '["reviewers"]': [{ source: 0, proof: 'reviewer' }] } };
    const reviewers = [{ name: 'Reviewer' }];
    expect(update.calls.allArgs()).toEqual([
      ['publication', { title: 'First edit', creators, reviewers }, '', options],
      ['publication', { title: 'Second edit', creators, reviewers }, '', options],
    ]);
  });

  it('serializes a title edit with hydrated repeatables and disabled children', async () => {
    const textField = (name: string, value?: string): Field => ({
      name,
      model: { class: 'SimpleInputModel', config: { value } },
      component: { class: 'SimpleInputComponent' },
    });
    const config: FormConfigFrame = {
      name: 'publication-draft',
      componentDefinitions: [
        textField('title', 'Before'),
        contributorList([{ name: 'Alpha', conditional: 'First', notes: [] }, { name: 'Alpha', conditional: 'Second', notes: [] }], false, [
          textField('optionalNote'),
          {
            name: 'conditional',
            model: { class: 'SimpleInputModel', config: { disabled: true } },
            component: { class: 'SimpleInputComponent' },
            expressions: [{
              name: 'enable',
              config: { target: 'model.disabled', template: 'false', condition: '/dataRecord::field.value.changed', runOnFormReady: false },
            }],
          },
          {
            name: 'notes',
            model: { class: 'RepeatableModel', config: {} },
            component: {
              class: 'RepeatableComponent',
              config: {
                elementTemplate: {
                  name: '',
                  model: { class: 'GroupModel', config: {} },
                  component: {
                    class: 'GroupComponent',
                    config: { componentDefinitions: [
                      textField('text'),
                      {
                        name: 'details',
                        model: { class: 'RepeatableModel', config: {} },
                        component: { class: 'RepeatableComponent', config: { elementTemplate: textField('') } },
                      },
                    ] },
                  },
                },
              },
            },
          },
        ]),
      ],
    };
    const { formComponent } = await createFormAndWaitForReady(config, {
      oid: 'publication', editMode: true, formName: '', recordType: 'dataPublication', downloadAndCreateOnInit: false,
    });
    const rowProofs = {
      '["creators"]': ['first', 'second'],
      '["creators",0,"notes"]': [],
      '["creators",1,"notes"]': [],
    };
    formComponent.formDefMap!.formConfigMeta = { oid: 'publication', rowProofs };
    const savedRowProofs = { ...rowProofs, '["creators",0,"notes",0,"details"]': [], '["creators",1,"notes",0,"details"]': [] };
    const title = formComponent.form!.get('title')!;
    title.setValue('Edited');
    title.markAsDirty();
    const update = spyOn(formComponent.recordService, 'update').and.resolveTo({
      success: true, oid: 'publication', message: '', data: null, savedRowProofs,
    });

    await formComponent.saveForm();
    await formComponent.saveForm({ force: true });

    const creator = { name: 'Alpha', optionalNote: null, notes: [{ text: null, details: [null] }] };
    const options = {
      formSave: true, rowEdits: {
        '["creators"]': [{ source: 0, proof: 'first' }, { source: 1, proof: 'second' }],
        '["creators",0,"notes"]': [null],
        '["creators",0,"notes",0,"details"]': [null],
        '["creators",1,"notes"]': [null],
        '["creators",1,"notes",0,"details"]': [null],
      },
    };
    const expected: Parameters<typeof formComponent.recordService.update> = ['publication', { title: 'Edited', creators: [creator, creator] }, '', options];
    expect(update.calls.allArgs()).toEqual([expected, expected]);
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

    const { fixture } = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelectorAll('redbox-form-debug-panel').length).toBe(0);
  });

  it('renders event stream debug section when debug mode is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-debug-visible',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'event_stream_debug',
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
    await ensureDebugPanelOpen(fixture);
    const eventsTabButton = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-debug-tabs button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Events');
    eventsTabButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();
    const headings = Array.from(fixture.nativeElement.querySelectorAll('h5') as NodeListOf<HTMLHeadingElement>).map(item => item.textContent?.trim() ?? '');
    expect(headings).toContain('Event Stream Debug');
  });

  it('captures published events in debug stream', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-capture',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'capture_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    const initialLength = formComponent.debugEvents().length;

    bus.publish(createFieldValueChangedEvent({ fieldId: 'capture_event', value: 'updated', sourceId: 'capture-source' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const events = formComponent.debugEvents();
    expect(events.length).toBeGreaterThan(initialLength);
    expect(events[events.length - 1].type).toBe(FormComponentEventType.FIELD_VALUE_CHANGED);
  });

  it('does not append events while paused', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-paused',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'pause_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    formComponent.debugEventPaused.set(true);
    const initialLength = formComponent.debugEvents().length;

    bus.publish(createFieldValueChangedEvent({ fieldId: 'pause_event', value: 'updated', sourceId: 'pause-source' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.debugEvents().length).toBe(initialLength);
  });

  it('clears captured debug events', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-clear',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'clear_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'clear_event', value: 'updated', sourceId: 'clear-source' }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(formComponent.debugEvents().length).toBeGreaterThan(0);

    formComponent.clearDebugEvents();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.debugEvents().length).toBe(0);
  });

  it('filters events by type', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-type-filter',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'type_filter_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'type_filter_event', value: 'updated', sourceId: 'source-a' }));
    bus.publish(createFormDefinitionChangedEvent({ sourceId: 'source-b' }));
    fixture.detectChanges();
    await fixture.whenStable();

    formComponent.debugEventFilterType.set(FormComponentEventType.FIELD_VALUE_CHANGED);
    const filtered = formComponent.getFilteredDebugEvents();
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(event => event.type === FormComponentEventType.FIELD_VALUE_CHANGED)).toBeTrue();
  });

  it('filters events by field and source identifiers', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-id-filters',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'field_alpha',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'field_alpha', value: 'updated', sourceId: 'source-primary' }));
    bus.publish(createFieldValueChangedEvent({ fieldId: 'field_beta', value: 'updated', sourceId: 'source-secondary' }));
    fixture.detectChanges();
    await fixture.whenStable();

    formComponent.debugEventFilterFieldId.set('alpha');
    formComponent.debugEventFilterSourceId.set('primary');
    const filtered = formComponent.getFilteredDebugEvents();
    expect(filtered.length).toBe(1);
    expect(filtered[0].fieldId).toBe('field_alpha');
    expect(filtered[0].sourceId).toBe('source-primary');
  });

  it('enforces max debug event history by trimming oldest entries', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-max-items',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'max_items_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    formComponent.clearDebugEvents();
    formComponent.setDebugEventMaxItems(2);

    bus.publish(createFieldValueChangedEvent({ fieldId: 'max_items_event', value: '1', sourceId: 's1' }));
    bus.publish(createFieldValueChangedEvent({ fieldId: 'max_items_event', value: '2', sourceId: 's2' }));
    bus.publish(createFieldValueChangedEvent({ fieldId: 'max_items_event', value: '3', sourceId: 's3' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const events = formComponent.debugEvents();
    expect(events.length).toBe(2);
    expect(events[0].payload['value']).toBe('2');
    expect(events[1].payload['value']).toBe('3');
  });

  it('renders event payload as text content without html evaluation', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-safe-payload',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'safe_payload_event',
          model: {
            class: 'SimpleInputModel',
            config: { value: 'x' }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    await ensureDebugPanelOpen(fixture);
    const bus = TestBed.inject(FormComponentEventBus);
    const dangerousPayload = '<img src=x onerror=alert(1)>';
    formComponent.clearDebugEvents();

    bus.publish(createFieldValueChangedEvent({ fieldId: 'safe_payload_event', value: dangerousPayload, sourceId: 'safe-source' }));
    fixture.detectChanges();
    await fixture.whenStable();

    const eventsTabButton = Array.from(fixture.nativeElement.querySelectorAll('.rb-form-debug-tabs button') as NodeListOf<HTMLButtonElement>)
      .find((button) => button.textContent?.trim() === 'Events');
    eventsTabButton?.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const expandButton = fixture.nativeElement.querySelector('.rb-form-debug-event-expand') as HTMLButtonElement;
    expandButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const payloadPre = fixture.nativeElement.querySelector('.rb-form-debug-event-payload') as HTMLElement;
    expect(payloadPre.textContent).toContain('onerror=alert(1)');
    expect(payloadPre.querySelector('img')).toBeNull();
  });

  it('populates initial translated config snapshot for provided-config path', async () => {
    const formConfig: FormConfigFrame = {
      name: 'initial-snapshot-provided',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_snapshot',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'snapshot value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const initialConfig = formComponent.debugTranslatedFormConfigInitial();
    expect(initialConfig['name']).toBe('initial-snapshot-provided');
  });

  it('populates initial translated config snapshot for download path', async () => {
    const formConfig: FormConfigFrame = {
      name: 'initial-snapshot-download',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_snapshot_download',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'snapshot value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    setUpDynamicAssets();
    const fixture = TestBed.createComponent(FormComponent);

    ensureApplicationRefFormComponent(fixture.componentRef);

    const formComponent = fixture.componentInstance;
    formComponent.downloadAndCreateOnInit.set(false);
    formComponent.oid.set('oid-download-path');
    formComponent.recordType.set('rdmp');
    formComponent.editMode.set(true);
    formComponent.formName.set('default-1.0-draft');
    fixture.autoDetectChanges();
    await fixture.whenStable();

    const formService = TestBed.inject(FormService);
    const parentLineagePaths = formService.buildLineagePaths({
      angularComponents: [],
      dataModel: [],
      formConfig: ['componentDefinitions'],
      layout: [],
    });
    const map = await formService.createFormComponentsMap(formConfig, parentLineagePaths);
    const downloadSpy = spyOn(formService, 'downloadFormComponents').and.resolveTo(map);

    await formComponent.downloadAndCreateFormComponents();
    await fixture.whenStable();

    expect(downloadSpy).toHaveBeenCalled();
    expect(formComponent.debugTranslatedFormConfigInitial()['name']).toBe('initial-snapshot-download');
  });

  it('updates translated config current snapshot on FORM_DEFINITION_CHANGED event', async () => {
    const formConfig: FormConfigFrame = {
      name: 'definition-change-debug',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_initial',
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

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    formComponent.formDefMap?.formConfig?.componentDefinitions?.push({
      name: 'text_added',
      model: {
        class: 'SimpleInputModel',
        config: {
          value: 'new'
        }
      },
      component: {
        class: 'SimpleInputComponent'
      }
    } as any);

    bus.publish(createFormDefinitionChangedEvent({}));
    fixture.detectChanges();
    await fixture.whenStable();

    const current = formComponent.debugTranslatedFormConfigCurrent();
    expect((current['componentDefinitions'] as unknown[]).length).toBe(2);
  });

  it('updates model current/previous snapshots and changed paths after value change', async () => {
    const formConfig: FormConfigFrame = {
      name: 'model-snapshots',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_model',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'before'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    formComponent.form?.get('text_model')?.setValue('after');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.debugModelCurrent()['text_model']).toBe('after');
    expect(formComponent.debugModelPrevious()['text_model']).toBe('before');
    expect(formComponent.debugModelChangedPaths()).toContain('text_model');
  });

  it('returns dotted/bracket changed paths for nested structures', async () => {
    const formConfig: FormConfigFrame = {
      name: 'path-diff-format',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_diff_format',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'x'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const { formComponent } = await createFormAndWaitForReady(formConfig);
    const changedPaths = (formComponent as any).computeChangedPaths(
      { contributors: [{ name: 'old' }] },
      { contributors: [{ name: 'new' }] },
      { maxDepth: 5, maxPaths: 200 }
    );
    expect(changedPaths).toContain('contributors[0].name');
  });

  it('renders expand controls and detail rows in component debug table', async () => {
    const formConfig: FormConfigFrame = {
      name: 'expand-row',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_expand',
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
    const expandButton = fixture.nativeElement.querySelector('.rb-form-debug-expand') as HTMLButtonElement;
    expect(expandButton).toBeTruthy();
    expandButton.click();
    fixture.detectChanges();
    await fixture.whenStable();

    const detailRow = fixture.nativeElement.querySelector('.rb-form-debug-detail') as HTMLElement;
    expect(detailRow).toBeTruthy();
    expect(detailRow.textContent).toContain('Component Attributes');
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

  it('tracks FORM_DEFINITION_CHANGED debug subscription in subMaps and cleans up on destroy', async () => {
    const formConfig: FormConfigFrame = {
      name: 'debug-subscription-cleanup',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'text_sub_cleanup',
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

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const bus = TestBed.inject(FormComponentEventBus);
    expect(formComponent.subMaps['formDefinitionChangedDebugSub']).toBeTruthy();
    formComponent.ngOnDestroy();
    expect(() => bus.publish(createFormDefinitionChangedEvent({}))).not.toThrow();
    fixture.destroy();
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

  it('tracks debugEventStreamSub in subMaps and cleanup is safe on destroy', async () => {
    const formConfig: FormConfigFrame = {
      name: 'event-stream-subscription-cleanup',
      debugValue: true,
      componentDefinitions: [
        {
          name: 'event_sub_cleanup',
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
    expect(formComponent.subMaps['debugEventStreamSub']).toBeTruthy();
    formComponent.ngOnDestroy();
    expect(() => bus.publish(createFieldValueChangedEvent({ fieldId: 'event_sub_cleanup', value: 'v' }))).not.toThrow();
    fixture.destroy();
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
