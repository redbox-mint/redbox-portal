import { HttpTestingController } from '@angular/common/http/testing';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { Store } from '@ngrx/store';
import { FormConfigFrame, FormStatus } from '@researchdatabox/sails-ng-common';
import english from '../../../../../../../language-defaults/en/translation.json';
import { FormServerSyncService } from '../form-server-sync.service';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import * as FormActions from '../form-state/state/form.actions';
import {
  createFormDeleteSuccessEvent,
  createFormSaveFailureEvent,
  createFormSaveSuccessEvent,
  createFormValidationBroadcastEvent,
  FormComponentEventBus,
  FormStateFacade,
} from '../form-state';
import { SaveButtonComponent } from './save-button.component';
import { SaveStatusComponent } from './save-status.component';
import { SimpleInputComponent } from './simple-input.component';

let formConfig: FormConfigFrame;

describe('SaveStatusComponent', () => {
  beforeEach(async () => {
    const { translationService } = await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "SaveButtonComponent": SaveButtonComponent,
        "SaveStatusComponent": SaveStatusComponent,
      }
    });
    Object.assign(translationService.translationMap, {
      '@dmpt-form-save-error': 'Error while saving: ',
      '@dmpt-form-invalid': 'The form is invalid. Please correct the errors and try again.',
      '@dmpt-form-save-warning-create': 'The record was saved, but some follow-up processing could not be completed.',
      '@dmpt-form-save-warning-update': english['@dmpt-form-save-warning-update'],
      '@dmpt-form-save-schema-warning': english['@dmpt-form-save-schema-warning'],
      '@dmpt-form-save-advisory': 'Saved. The server reported these suggestions or adjustments:',
      '@dmpt-form-save-unknown-create': english['@dmpt-form-save-unknown-create'],
      '@dmpt-form-save-unknown-update': 'We couldn’t confirm whether your changes were saved. Reference: {{requestId}}.',
      '@storage-workspace-save-warning': 'The storage request could not be completed. Request ID: {{requestId}}. Please contact support for help.',
      '@record-save-save-not-applied': 'The changes were not saved.',
      '@record-save-failed': english['@record-save-failed'],
      '@record-save-not-dispatched': english['@record-save-not-dispatched'],
      '@record-save-record-validation-timeout': english['@record-save-record-validation-timeout'],
      '@form-server-sync-review-message': english['@form-server-sync-review-message'],
      '@form-save-request-reference': english['@form-save-request-reference'],
    });
    formConfig = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      enabledValidationGroups: ['none'],
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'hello world default!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'save_status',
          component: {
            class: 'SaveStatusComponent',
            config: {
              successDisplayDurationMs: 3000
            }
          }
        }
      ]
    };
  });

  it('should create SaveStatusComponent', () => {
    const fixture = TestBed.createComponent(SaveStatusComponent);
    expect(fixture.componentInstance).toBeDefined();
  });

  function invalidSaveConfig(showClientValidationFailure?: boolean): FormConfigFrame {
    return {
      ...formConfig,
      enabledValidationGroups: ['all'],
      componentDefinitions: [
        { name: 'title', component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { value: '', validators: [{ class: 'required' }] } } },
        { name: 'save_status', component: { class: 'SaveStatusComponent', config: { showClientValidationFailure } } },
      ],
    };
  }

  for (const configured of [undefined, true]) {
    it(`shows the client validation failure when the option is ${configured ?? 'omitted'}`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(invalidSaveConfig(configured), { editMode: true });
      const update = spyOn(formComponent.recordService, 'update');

      TestBed.inject(Store).dispatch(FormActions.submitForm({ force: true }));
      await fixture.whenStable();

      expect(update).not.toHaveBeenCalled();
      expect(TestBed.inject(FormStateFacade).error()).toBe('@dmpt-form-invalid');
      const error = fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger');
      expect(error?.textContent).toContain('Error while saving:');
      expect(error?.textContent).toContain('The form is invalid. Please correct the errors and try again.');
    });
  }

  it('clears a stale message after client validation prevents a save when feedback is disabled', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(invalidSaveConfig(false), { editMode: true });
    const store = TestBed.inject(Store);
    const facade = TestBed.inject(FormStateFacade);
    const update = spyOn(formComponent.recordService, 'update');
    const save = spyOn(formComponent, 'saveForm').and.resolveTo();
    store.dispatch(FormActions.submitForm({ force: true }));
    await fixture.whenStable();
    store.dispatch(FormActions.submitFormFailure({ error: 'Previous save error' }));
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')?.textContent)
      .toContain('Previous save error');

    save.and.callThrough();
    store.dispatch(FormActions.submitForm({ force: true }));
    await fixture.whenStable();

    expect(update).not.toHaveBeenCalled();
    expect(facade.isSaving()).toBeFalse();
    expect(facade.error()).toBe('@dmpt-form-invalid');
    expect(fixture.nativeElement.querySelector('.rb-form-save-status')).toBeNull();
  });

  it('shows a server failure with its prefix even when client validation feedback is disabled', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(invalidSaveConfig(false), { editMode: true });
    spyOn(formComponent, 'saveForm').and.resolveTo();
    TestBed.inject(Store).dispatch(FormActions.submitForm({ force: true }));
    await fixture.whenStable();

    TestBed.inject(FormComponentEventBus).publish(createFormSaveFailureEvent({
      formScopeId: formComponent.eventScopeId,
      error: '@dmpt-form-invalid',
      response: { outcome: 'not-saved' },
    }));
    await fixture.whenStable();

    const error = fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger');
    expect(error?.textContent).toContain('Error while saving:');
    expect(error?.textContent).toContain('The form is invalid.');
  });

  for (const { label, status, statusText, validationPhase, hasOtherProblem, hasOtherIssue, primaryMessage, unconfirmedCreate } of [
    {
      label: 'shows the post-save validation timeout and permits retry after HTTP 200',
      status: 200,
      statusText: 'OK',
      validationPhase: 'post-save',
    },
    { label: 'shows the validation timeout and permits retry after HTTP 500', status: 500, statusText: 'Internal Server Error' },
    {
      label: 'keeps the primary save error when another problem reports a validation timeout',
      status: 500,
      statusText: 'Internal Server Error',
      hasOtherProblem: true,
      primaryMessage: '@record-save-save-not-applied',
    },
    {
      label: 'keeps the generic save error when a timeout accompanies another problem',
      status: 500,
      statusText: 'Internal Server Error',
      hasOtherProblem: true,
    },
    {
      label: 'keeps the generic save error when the top-level timeout accompanies another problem',
      status: 500,
      statusText: 'Internal Server Error',
      hasOtherProblem: true,
      primaryMessage: '@record-save-record-validation-timeout',
    },
    {
      label: 'keeps the generic save error when a timeout shares its problem with another issue',
      status: 500,
      statusText: 'Internal Server Error',
      hasOtherIssue: true,
    },
    {
      label: 'keeps the unconfirmed-create message when the response also reports a timeout',
      status: 500,
      statusText: 'Internal Server Error',
      primaryMessage: '@record-save-record-validation-timeout',
      unconfirmedCreate: true,
    },
  ]) {
    it(label, fakeAsync(() => {
      const config: FormConfigFrame = {
        ...formConfig,
        componentDefinitions: [
          ...formConfig.componentDefinitions!,
          { name: 'save_button', component: { class: 'SaveButtonComponent' } },
        ],
      };
      let mounted!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
      const formProps = unconfirmedCreate ? { editMode: true, oid: '' } : { editMode: true };
      void createFormAndWaitForReady(config, formProps).then(result => { mounted = result; });
      tick(250);

      const { fixture, formComponent } = mounted;
      const root: HTMLElement = fixture.nativeElement;
      const input = root.querySelector<HTMLInputElement>('redbox-simpleinput input')!;
      const button = root.querySelector<HTMLButtonElement>('redbox-form-save-button button')!;
      const errorBanner = () => root.querySelector('.rb-form-save-status.alert-danger');
      const http = TestBed.inject(HttpTestingController);
      const target = unconfirmedCreate ? formComponent.recordType() : formComponent.oid();
      const url = `${formComponent.recordService.brandingAndPortalUrl}/recordmeta/${target}`;
      const saveRequest = { method: unconfirmedCreate ? 'POST' : 'PUT', url };
      const issue = { code: 'record-validation-timeout', message: '@record-save-record-validation-timeout' };
      const otherIssue = { code: 'save-not-applied', message: '@record-save-save-not-applied' };
      const timeoutProblem = {
        kind: 'system',
        phase: validationPhase ?? 'pre-save',
        issues: hasOtherIssue ? [issue, otherIssue] : [issue],
      };
      const timeoutResult = {
        success: false,
        outcome: unconfirmedCreate ? 'unknown' : 'not-saved',
        message: primaryMessage ?? '@record-save-failed',
        problems: hasOtherProblem ? [
          { kind: 'system', phase: 'persistence', issues: [otherIssue] },
          timeoutProblem,
        ] : [timeoutProblem],
      };

      input.value = 'My unsaved edits';
      input.dispatchEvent(new Event('input'));
      tick();
      fixture.detectChanges();
      expect(button.disabled).toBeFalse();

      button.click();
      tick();
      fixture.detectChanges();
      const request = http.expectOne(saveRequest);
      expect(request.request.body).toEqual({ text_1_event: 'My unsaved edits' });
      request.flush(status === 500
        ? { meta: timeoutResult, errors: [{ code: issue.code, title: issue.message }] }
        : timeoutResult, { status, statusText });
      tick();
      fixture.detectChanges();

      const visibleMessage = errorBanner()?.textContent?.replace(/\s+/g, ' ').trim();
      expect(input.value).toBe('My unsaved edits');
      expect(formComponent.hasChangesToSave()).toBeTrue();
      http.expectNone(saveRequest);
      if (unconfirmedCreate) {
        const warning = root.querySelector('.rb-form-save-status.alert-warning');
        expect(warning?.textContent).toContain('We couldn’t confirm whether the record was created.');
        expect(visibleMessage).toBeUndefined();
        return;
      }

      const otherMessage = primaryMessage === '@record-save-save-not-applied'
        ? 'The changes were not saved.'
        : english['@record-save-failed'];
      expect(visibleMessage).toBe(hasOtherProblem || hasOtherIssue
        ? `Error while saving: ${otherMessage}`
        : 'Validation timed out. Please try again.');
      expect(button.disabled).toBeFalse();

      // Let the duplicate-click throttle expire before the user retries.
      tick(250);
      button.click();
      tick();
      fixture.detectChanges();
      expect(errorBanner()).toBeNull();
      const retry = http.expectOne(saveRequest);
      expect(retry.request.body).toEqual({ text_1_event: 'My unsaved edits' });
      retry.flush({
        outcome: 'saved',
        oid: formComponent.oid(),
        completion: { attachments: { status: 'not-required', items: [] } },
      });
      tick();
      fixture.detectChanges();
      expect(root.querySelector('.rb-form-save-status.alert-success')).not.toBeNull();
      expect(formComponent.hasChangesToSave()).toBeFalse();
      tick(3000);
    }));
  }

  it('keeps a server validation failure visible when interactive validation settles', fakeAsync(() => {
    let mounted!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(formConfig).then(result => { mounted = result; });
    // Let the event-bus adapter finish throttling the initial validation broadcasts.
    tick(250);
    const { fixture, formComponent } = mounted;
    const store = TestBed.inject(Store);
    const facade = TestBed.inject(FormStateFacade);
    const eventBus = TestBed.inject(FormComponentEventBus);
    const error = 'RDMP contributor validation failed';
    const root: HTMLElement = fixture.nativeElement;
    const banner = () => root.querySelector('.rb-form-save-status.alert-danger');
    const startSave = () => {
      store.dispatch(FormActions.submitForm({ force: true }));
      tick();
      fixture.detectChanges();
    };
    spyOn(formComponent, 'saveForm').and.resolveTo();
    startSave();

    eventBus.publish(createFormSaveFailureEvent({
      formScopeId: formComponent.eventScopeId,
      error,
      response: { outcome: 'not-saved' },
    }));
    tick();
    fixture.detectChanges();
    expect(facade.status()).toBe(FormStatus.VALIDATION_ERROR);
    expect(banner()?.textContent).toContain(error);

    eventBus.publish(createFormValidationBroadcastEvent({ isValid: true }));
    tick();
    fixture.detectChanges();
    expect(facade.status()).toBe(FormStatus.READY);
    expect(facade.error()).toBe(error);
    expect(banner()?.textContent).toContain(error);

    startSave();
    expect(facade.error()).toBeNull();
    expect(banner()).toBeNull();
    expect(root.querySelector('.rb-form-save-status.alert-info')).not.toBeNull();

    store.dispatch(FormActions.submitFormSuccess({ savedData: {}, lastSavedAt: new Date().toISOString() }));
    tick();
    fixture.detectChanges();
    expect(banner()).toBeNull();
    expect(root.querySelector('.rb-form-save-status.alert-success')).not.toBeNull();
    tick(3000);
  }));

  it('clears the error banner when conflict recovery clears the failure', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    store.dispatch(FormActions.submitFormFailure({ error: 'This record has changed' }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')).toBeTruthy();
    store.dispatch(FormActions.submitFormSuccess({ savedData: {}, lastSavedAt: new Date().toISOString() }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')).toBeFalsy();
  });

  it('should show saving status while save is in progress', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.submitForm({
      force: true,
      operation: 'publish',
      enabledValidationGroups: ['all', 'publish'],
    }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-info')).toBeTruthy();
  }));

  it('should show save success after a successful save', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    store.dispatch(FormActions.submitFormSuccess({ savedData: {}, lastSavedAt: new Date().toISOString() }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-success');
    expect(el).toBeTruthy();
  });

  for (const { label, closeOnSave, incompleteProcessing, hasSchema = true } of [
    { label: 'after Save' },
    { label: 'after cancelled Save & Close', closeOnSave: true },
    { label: 'with incomplete indexing and a schema warning', incompleteProcessing: true },
    { label: 'with incomplete indexing and no schema warning', incompleteProcessing: true, hasSchema: false },
    { label: 'with only an advisory', hasSchema: false },
  ]) {
    it(`shows the save diagnostics alongside sync review ${label}`, fakeAsync(() => {
      let mounted!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
      void createFormAndWaitForReady(formConfig, { editMode: true }).then(result => { mounted = result; });
      tick(250);
      const { fixture, formComponent } = mounted;
      const root: HTMLElement = fixture.nativeElement;
      const http = TestBed.inject(HttpTestingController);
      const control = formComponent.form!.get('text_1_event')!;
      const oid = formComponent.oid();
      const url = formComponent.recordService.brandingAndPortalUrl;
      const navigate = spyOn(formComponent as unknown as { changeLocationHref(url: string): void }, 'changeLocationHref');
      spyOn(TestBed.inject(FormServerSyncService), 'applyServerMetadata').and.resolveTo({
        patched: [], skipped: [{ name: 'text_1_event', reason: 'set-failed' }],
      });

      TestBed.inject(Store).dispatch(FormActions.submitForm({
        force: true, closeOnSave, ...(closeOnSave ? { redirectLocation: '/next', redirectDelaySeconds: 1 } : {}),
      }));
      tick();
      fixture.detectChanges();
      const request = http.expectOne({ method: 'PUT', url: `${url}/recordmeta/${oid}` });
      const requestId = request.request.headers.get('X-ReDBox-Save-Request-Id')!;
      request.flush({ meta: {
        outcome: hasSchema || incompleteProcessing ? 'saved-with-warnings' : 'saved',
        oid, metadata: { text_1_event: 'Server value' },
        problems: [
          ...(hasSchema ? [{ kind: 'validation', source: 'schema', phase: 'schema', issues: [{ message: 'Type mismatch' }] }] : []),
          ...(incompleteProcessing ? [{ kind: 'processing', phase: 'post-save', issues: [{ message: 'Indexing failed' }] }] : []),
          { kind: 'validation', source: 'advisory', phase: 'pre-save', issues: [{ message: 'Consider a FoR code' }] },
        ],
      } });
      tick();
      fixture.detectChanges();

      if (closeOnSave) {
        expect(root.querySelector('.rb-form-save-status.alert-warning')?.textContent).toContain(requestId);
        control.setValue('Late edit');
        control.markAsDirty();
        tick(1000);
        fixture.detectChanges();
      }

      expect(navigate).not.toHaveBeenCalled();
      const review = root.querySelector('.rb-form-save-status.alert-danger');
      expect(review?.textContent).toContain(english['@form-server-sync-review-message']);
      expect(review?.textContent).toContain(requestId);
      const warnings = Array.from(root.querySelectorAll('.rb-form-save-status.alert-warning'), warning => warning.textContent ?? '');
      const schemaWarning = warnings.find(warning => warning.includes('schema check reported a problem'));
      const processingWarning = warnings.find(warning => warning.includes('some follow-up processing could not be completed'));
      expect(schemaWarning).toEqual(hasSchema ? jasmine.stringContaining(requestId) : undefined);
      expect(processingWarning).toEqual(incompleteProcessing ? jasmine.stringContaining(requestId) : undefined);
      expect(root.querySelector('.rb-form-save-status.alert-info li')?.textContent).toContain('Consider a FoR code');
    }));
  }

  it('clears diagnostics from the previous save when a retry fails before dispatch', fakeAsync(() => {
    let mounted!: Awaited<ReturnType<typeof createFormAndWaitForReady>>;
    void createFormAndWaitForReady(formConfig, { editMode: true }).then(result => { mounted = result; });
    tick(250);
    const { fixture, formComponent } = mounted;
    const root: HTMLElement = fixture.nativeElement;
    const store = TestBed.inject(Store);
    const http = TestBed.inject(HttpTestingController);
    const oid = formComponent.oid();
    const saveRequest = { method: 'PUT', url: `${formComponent.recordService.brandingAndPortalUrl}/recordmeta/${oid}` };
    spyOn(TestBed.inject(FormServerSyncService), 'applyServerMetadata').and.resolveTo({
      patched: [], skipped: [{ name: 'text_1_event', reason: 'set-failed' }],
    });

    store.dispatch(FormActions.submitForm({ force: true }));
    tick();
    fixture.detectChanges();
    const request = http.expectOne(saveRequest);
    const requestId = request.request.headers.get('X-ReDBox-Save-Request-Id')!;
    request.flush({ meta: {
      outcome: 'saved-with-warnings', oid, metadata: { text_1_event: 'Server value' },
      problems: [
        { kind: 'validation', source: 'schema', phase: 'schema', issues: [{ message: 'Type mismatch' }] },
        { kind: 'validation', source: 'advisory', phase: 'pre-save', issues: [{ message: 'Consider a FoR code' }] },
      ],
    } });
    tick();
    fixture.detectChanges();
    expect(root.querySelector('.rb-form-save-status.alert-warning')?.textContent).toContain(requestId);
    expect(root.querySelector('.rb-form-save-status.alert-info li')?.textContent).toContain('Consider a FoR code');

    spyOn(formComponent.recordService, 'update').and.throwError('Could not build the request');
    store.dispatch(FormActions.submitForm({ force: true }));
    tick();
    fixture.detectChanges();

    http.expectNone(saveRequest);
    expect(root.querySelector('.rb-form-save-status.alert-danger')?.textContent)
      .toContain(english['@record-save-not-dispatched']);
    expect(root.querySelector('.rb-form-save-status.alert-warning')).toBeNull();
    expect(root.querySelector('.rb-form-save-status.alert-info')).toBeNull();
  }));

  it('should keep a persisted warning visible through SaveStatusComponent', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({
      force: true,
      operation: 'publish',
      enabledValidationGroups: ['all', 'publish'],
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    eventBus.publish(createFormSaveSuccessEvent({
      operation: 'create',
      requestId: '88888888-8888-4888-8888-888888888888',
      response: { outcome: 'saved-with-warnings' },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-warning');
    expect(el?.textContent).toContain('follow-up processing');
    expect(el?.textContent).toContain('The record was saved');
    expect(el?.textContent).not.toContain('88888888-8888-4888-8888-888888888888');
  });

  it('should describe schema-only warnings without suggesting unfinished processing', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    eventBus.publish(createFormSaveSuccessEvent({
      operation: 'update',
      response: {
        outcome: 'saved-with-warnings',
        problems: [{ kind: 'validation', source: 'schema', phase: 'schema', issues: [{ message: 'Type mismatch' }] }],
      },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-warning');
    expect(el?.textContent).toContain('schema check reported a problem');
    expect(el?.textContent).not.toContain('follow-up processing');
  });

  it('should show both warnings when schema issues accompany incomplete post-save work', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    eventBus.publish(createFormSaveSuccessEvent({
      operation: 'update',
      response: {
        outcome: 'saved-with-warnings',
        problems: [
          { kind: 'validation', source: 'schema', phase: 'schema', issues: [{ message: 'Type mismatch' }] },
          { kind: 'processing', phase: 'post-save', issues: [{ message: 'Hook failed' }] },
        ],
      },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    const warnings = fixture.nativeElement.querySelectorAll('.rb-form-save-status.alert-warning');
    expect(warnings.length).toBe(2);
    expect(warnings[0].textContent).toContain('follow-up processing');
    expect(warnings[1].textContent).toContain('schema check reported a problem');
  });

  it('should show advisory details without an incomplete-save warning', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    eventBus.publish(createFormSaveSuccessEvent({
      operation: 'create',
      response: {
        outcome: 'saved',
        problems: [{ kind: 'validation', source: 'advisory', phase: 'pre-save', issues: [{ message: 'Consider a FoR code' }] }],
      },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-success')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-warning')).toBeFalsy();
    const advisory = fixture.nativeElement.querySelector('.rb-form-save-status.alert-info');
    expect(advisory?.textContent).toContain('Saved. The server reported these suggestions or adjustments:');
    expect(advisory?.textContent).toContain('Consider a FoR code');
  });

  it('should keep an unknown save outcome visible through SaveStatusComponent', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    eventBus.publish(createFormSaveFailureEvent({
      error: 'The save could not be confirmed.',
      operation: 'update',
      requestId: '99999999-9999-4999-8999-999999999999',
      response: { outcome: 'unknown' },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-warning');
    expect(el?.textContent).toContain('couldn’t confirm');
    expect(el?.textContent).toContain('99999999-9999-4999-8999-999999999999');
  });

  it('should use a configured warning translation code', async () => {
    const saveStatus = formConfig.componentDefinitions.find(component => component.name === 'save_status');
    (saveStatus?.component?.config as Record<string, unknown>)['warningMessageCreate'] = '@storage-workspace-save-warning';
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    await fixture.whenStable();

    eventBus.publish(createFormSaveSuccessEvent({
      operation: 'create',
      requestId: '77777777-7777-4777-8777-777777777777',
      response: { outcome: 'saved-with-warnings' },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-warning');
    expect(el?.textContent).toContain('The storage request could not be completed');
    expect(el?.textContent).toContain('77777777-7777-4777-8777-777777777777');
    expect(el?.textContent).not.toContain('follow-up processing');
  });

  it('should ignore a scoped save event when no save operation is pending', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const eventBus = TestBed.inject(FormComponentEventBus);

    eventBus.publish(createFormSaveSuccessEvent({
      formScopeId: formComponent.eventScopeId,
      operation: 'update',
      response: { outcome: 'saved' },
    }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-success')).toBeFalsy();
  });

  it('should keep save success visible for the configured duration before hiding it', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    const store = TestBed.inject(Store);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    tick();
    store.dispatch(FormActions.submitFormSuccess({ savedData: {}, lastSavedAt: new Date().toISOString() }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-success')).toBeTruthy();
  }));

  it('should show save failure after a failed save', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.submitForm({ force: true }));
    tick();
    store.dispatch(FormActions.submitFormFailure({ error: '@record-save-save-not-applied' }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger');
    expect(el?.textContent).toContain('The changes were not saved');
  }));

  it('should keep save failure visible until another save starts', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    const store = TestBed.inject(Store);
    spyOn(formComponent, 'saveForm').and.returnValue(new Promise(() => {}));
    store.dispatch(FormActions.submitForm({ force: true }));
    tick();
    store.dispatch(FormActions.submitFormFailure({ error: 'Boom' }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')).toBeTruthy();

    tick(5000);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')).toBeTruthy();

    store.dispatch(FormActions.submitForm({ force: true }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-info')).toBeTruthy();
  }));

  it('should not show a save failure for validation errors outside a save operation', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.formValidationFailure({ error: 'Validation failed' }));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelector('.rb-form-save-status.alert-danger')).toBeFalsy();
  });

  it('should show deleting status while delete is in progress', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    spyOn(formComponent, 'deleteRecord').and.returnValue(new Promise(() => {}));
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.deleteRecord({ closeOnDelete: false }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-info');
    expect(el).toBeTruthy();
    expect(el?.querySelector('.fa-spinner')).toBeTruthy();
  }));

  it('should show delete success after a successful delete event', fakeAsync(() => {
    let fixture: any;
    let formComponent: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
      formComponent = result.formComponent;
    });
    tick();

    spyOn(formComponent, 'deleteRecord').and.returnValue(new Promise(() => {}));
    const eventBus = TestBed.inject(FormComponentEventBus);
    const store = TestBed.inject(Store);
    store.dispatch(FormActions.deleteRecord({ closeOnDelete: false }));
    tick();
    eventBus.publish(createFormDeleteSuccessEvent({ oid: 'oid-1' }));
    fixture.detectChanges();
    tick();
    fixture.detectChanges();

    const el = fixture.nativeElement.querySelector('.rb-form-save-status.alert-success');
    expect(el).toBeTruthy();
  }));
});
