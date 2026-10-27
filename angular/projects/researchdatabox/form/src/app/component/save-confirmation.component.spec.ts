import { TestBed } from '@angular/core/testing';
import { DynamicScriptResponse, FormConfigFrame, SaveButtonFieldComponentConfigFrame } from '@researchdatabox/sails-ng-common';
import { HttpTestingController } from '@angular/common/http/testing';
import { Store } from '@ngrx/store';
import { Actions } from '@ngrx/effects';
import { createFormAndWaitForReady, createTestbedModule, FormComponentProps } from '../helpers.spec';
import { SaveButtonComponent } from './save-button.component';
import { SimpleInputComponent } from './simple-input.component';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import { FormComponentEventBus } from '../form-state/events';
import * as FormActions from '../form-state/state/form.actions';

const props: FormComponentProps = {
  oid: 'confirmation-test', recordType: 'rdmp', editMode: true,
  formName: 'confirmation-test', downloadAndCreateOnInit: false,
};

function formConfig(message: string | undefined = 'Move this record?', overrides: Partial<SaveButtonFieldComponentConfigFrame> = {}): FormConfigFrame {
  return { name: 'confirmation-test', enabledValidationGroups: ['all'], componentDefinitions: [
    { name: 'answer', component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { value: 'retained answer', validators: [{ class: 'required' }] } } },
    { name: 'confirmActive', component: { class: 'SaveButtonComponent', config: {
      label: 'Activate', targetStep: 'active', operation: 'activate', closeOnSave: true,
      enabledValidationGroups: ['all'], redirectDelaySeconds: 5,
      confirmationTitle: 'Activate RDMP?', confirmationMessage: message,
      confirmButtonMessage: 'Activate now', cancelButtonMessage: 'Keep editing',
      ...overrides,
    } } },
  ] };
}

describe('SaveButton native confirmation', () => {
  let translationMap: Record<string, string>;
  beforeEach(async () => {
    const { translationService } = await createTestbedModule({ declarations: { SimpleInputComponent, SaveButtonComponent } });
    translationMap = translationService.translationMap;
  });

  it('cancels without a save/action event or save call, then confirms through the existing save flow', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig(), props);
    const save = spyOn(formComponent, 'saveForm').and.stub();
    const bus = TestBed.inject(FormComponentEventBus);
    const publish = spyOn(bus, 'publish').and.callThrough();
    const dialog = TestBed.inject(ConfirmationDialogService);
    const before = formComponent.form!.getRawValue();
    const button = fixture.nativeElement.querySelector('.rb-form-save-button button') as HTMLButtonElement;
    TestBed.inject(HttpTestingController).match(() => true); // Exclude fixture initialization requests.
    publish.calls.reset();
    button.click();
    fixture.detectChanges();
    expect(publish).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(fixture.nativeElement.querySelector('.modal-title').textContent).toContain('Activate RDMP?');
    expect(fixture.nativeElement.querySelector('.modal-body').textContent).toContain('Move this record?');
    const cancel = fixture.nativeElement.querySelector('.modal-footer .btn-secondary') as HTMLButtonElement;
    expect(cancel.textContent).toContain('Keep editing');
    cancel.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(publish).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
    expect(dialog.dialog()).toBeNull();
    TestBed.inject(HttpTestingController).expectNone(() => true);
    expect(formComponent.form!.getRawValue()).toEqual(before);
    button.click();
    fixture.detectChanges();
    const confirm = fixture.nativeElement.querySelector('.modal-footer .btn-primary') as HTMLButtonElement;
    expect(confirm.textContent).toContain('Activate now');
    confirm.click();
    await fixture.whenStable();
    const requests = publish.calls.allArgs().map(args => args[0]).filter(event => event.type === 'form.save.requested');
    expect(requests.length).toBe(1);
    expect(requests[0]).toEqual(jasmine.objectContaining({
      type: 'form.save.requested', sourceId: 'confirmActive', targetStep: 'active', operation: 'activate',
      force: true, closeOnSave: true, redirectDelaySeconds: 5, enabledValidationGroups: ['all'],
    }));
    expect(save).toHaveBeenCalledTimes(1);
    expect(dialog.dialog()).toBeNull();
  });

  for (const message of [undefined, '', '   ']) {
    it(`saves normally without a dialog for message ${JSON.stringify(message)}`, async () => {
      const config = formConfig('');
      const definition = config.componentDefinitions![1].component;
      Object.assign(definition.config!, { confirmationMessage: message });
      const { formComponent } = await createFormAndWaitForReady(config, props);
      const save = spyOn(formComponent, 'saveForm').and.stub();
      const confirm = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm');
      await (formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent).save();
      expect(confirm).not.toHaveBeenCalled();
      expect(save).toHaveBeenCalledTimes(1);
    });
  }

  it('does not open a dialog when the existing validation guard disables saving', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig(), props);
    formComponent.form!.get('answer')!.setErrors({ required: true });
    formComponent.broadcastFormStatus(false);
    fixture.detectChanges();
    await fixture.whenStable();
    const confirm = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm');
    const save = spyOn(formComponent, 'saveForm').and.stub();
    await (formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent).save();
    expect(confirm).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it('rechecks the existing pending-validation guard after confirmation', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig(), props);
    const save = spyOn(formComponent, 'saveForm').and.stub();
    const pending = (formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent).save();
    TestBed.inject(Store).dispatch(FormActions.formValidationPending());
    fixture.detectChanges();
    TestBed.inject(ConfirmationDialogService).resolve(true);
    await pending;
    expect(save).not.toHaveBeenCalled();
  });

  for (const pendingStage of ['confirmation', 'redirect']) {
    it(`does not apply an old button's workflow action to a replacement record after ${pendingStage}`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig(
        pendingStage === 'confirmation' ? 'Move old record?' : '',
        { redirectLocation: pendingStage === 'redirect' ? '/record/{{oid}}' : undefined },
      ), props);
      let confirm!: (accepted: boolean) => void;
      let templates!: (response: DynamicScriptResponse) => void;
      const confirmation = new Promise<boolean>(resolve => { confirm = resolve; });
      const compiled = new Promise<DynamicScriptResponse>(resolve => { templates = resolve; });
      const confirmSpy = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm').and.returnValue(confirmation);
      const compileSpy = spyOn(formComponent, 'getRecordCompiledItems').and.returnValue(compiled);
      const save = spyOn(formComponent, 'saveForm').and.stub();
      const button = formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent;
      const pending = button.save();
      await Promise.resolve();
      // Browser template preparation adds an asynchronous step before compilation.
      if (pendingStage === 'redirect') await new Promise<void>(resolve => setTimeout(resolve, 0));
      expect(pendingStage === 'confirmation' ? confirmSpy : compileSpy).toHaveBeenCalledTimes(1);
      formComponent.oid.set('replacement-oid');
      await formComponent.downloadAndCreateFormComponents(formConfig(''));
      confirm(true);
      templates({ evaluate: () => '/record/old-oid' });
      await pending;
      expect(save).not.toHaveBeenCalled();
      fixture.destroy();
    });
  }

  it('renders translated title, message, Yes/No labels and configured button styling in the real dialog', async () => {
    Object.assign(translationMap, {
      '@confirm-title': 'Activate RDMP?', '@confirm-message': 'Move this record?',
      '@confirm-yes': 'Yes', '@confirm-no': 'No',
    });
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig('  @confirm-message  ', {
      confirmationTitle: '@confirm-title', confirmButtonMessage: '@confirm-yes', cancelButtonMessage: '@confirm-no',
      buttonCssClasses: '  btn-warning   workflow-action  ',
    }), { editMode: true });
    const save = spyOn(formComponent, 'saveForm');
    const pending = (formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent).save();
    fixture.detectChanges();
    const element: HTMLElement = fixture.nativeElement;
    expect(element.querySelector('.modal-title')?.textContent).toBe('Activate RDMP?');
    expect(element.querySelector('.modal-body')?.textContent).toContain('Move this record?');
    const buttons = element.querySelectorAll<HTMLButtonElement>('.modal-footer button');
    expect(buttons[0].textContent?.trim()).toBe('No');
    expect(buttons[1].textContent?.trim()).toBe('Yes');
    expect(buttons[1].className).toBe('btn btn-warning workflow-action');
    buttons[0].click();
    await pending;
    expect(save).not.toHaveBeenCalled();
  });

  it('cancels before redirect lookup, Save events, actions or HTTP while preserving answers and validation state', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig('Move this record?', {
      redirectLocation: '/record/{{oid}}',
    }), { editMode: true });
    const save = spyOn(formComponent, 'saveForm');
    const templates = spyOn(formComponent, 'getRecordCompiledItems');
    const bus = TestBed.inject(FormComponentEventBus);
    const events: string[] = [];
    const actions: string[] = [];
    const subscriptions = [
      bus.select$('form.save.requested').subscribe(event => events.push(event.type)),
      bus.select$('form.save.execute').subscribe(event => events.push(event.type)),
      TestBed.inject(Actions).subscribe(action => {
        if (action.type === FormActions.submitForm.type) actions.push(action.type);
      }),
    ];
    try {
      TestBed.inject(HttpTestingController).match(() => true);
      const control = formComponent.form!.get('answer')!;
      const pending = (formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent).save();
      control.markAsDirty();
      control.markAsTouched();
      control.setErrors({ retained: { message: 'Keep this error' } });
      const errors = control.errors;
      const validator = control.validator;
      const asyncValidator = control.asyncValidator;
      const answers = formComponent.form!.getRawValue();
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.modal-footer .btn-secondary') as HTMLButtonElement).click();
      await pending;
      await fixture.whenStable();
      expect(templates).not.toHaveBeenCalled();
      expect(events).toEqual([]);
      expect(actions).toEqual([]);
      expect(save).not.toHaveBeenCalled();
      TestBed.inject(HttpTestingController).expectNone(() => true);
      expect(formComponent.form!.getRawValue()).toEqual(answers);
      expect(control.errors).toBe(errors);
      expect(control.validator).toBe(validator);
      expect(control.asyncValidator).toBe(asyncValidator);
      expect(control.dirty).toBeTrue();
      expect(control.touched).toBeTrue();
    } finally {
      subscriptions.forEach(subscription => subscription.unsubscribe());
    }
  });

  for (const state of ['view', 'disabled', 'pending', 'invalid', 'saving'] as const) {
    it(`blocks an accepted confirmation when the form becomes ${state}, before redirect resolution`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig('Move this record?', {
        redirectLocation: '/record/{{oid}}', forceSave: true,
      }), { editMode: true });
      const button = formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent;
      const save = spyOn(formComponent, 'saveForm');
      const templates = spyOn(formComponent, 'getRecordCompiledItems');
      const pending = button.save();
      expect(TestBed.inject(ConfirmationDialogService).dialog()).not.toBeNull();
      if (state === 'view') formComponent.editMode.set(false);
      if (state === 'disabled') button.setProperty('disabled', true);
      if (state === 'pending') TestBed.inject(Store).dispatch(FormActions.formValidationPending());
      if (state === 'invalid') {
        formComponent.form!.get('answer')!.setErrors({ required: true });
        formComponent.broadcastFormStatus(false);
      }
      if (state === 'saving') {
        TestBed.inject(Store).dispatch(FormActions.submitForm({ force: true }));
        save.calls.reset(); // Ignore the independent save that put the form in SAVING.
      }
      const events: string[] = [];
      const actions: string[] = [];
      const subscriptions = [
        TestBed.inject(FormComponentEventBus).select$('form.save.requested').subscribe(event => events.push(event.type)),
        TestBed.inject(FormComponentEventBus).select$('form.save.execute').subscribe(event => events.push(event.type)),
        TestBed.inject(Actions).subscribe(action => {
          if (action.type === FormActions.submitForm.type) actions.push(action.type);
        }),
      ];
      try {
        fixture.detectChanges();
        expect(button.disabled()).toBeTrue();
        TestBed.inject(ConfirmationDialogService).resolve(true);
        await pending;
        await fixture.whenStable();
        expect(templates).not.toHaveBeenCalled();
        expect(events).toEqual([]);
        expect(actions).toEqual([]);
        expect(save).not.toHaveBeenCalled();
      } finally {
        subscriptions.forEach(subscription => subscription.unsubscribe());
      }
    });
  }

  it('blocks a standard Save that becomes pristine while confirmation is open', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig('Save?', { targetStep: undefined }), { editMode: true });
    const save = spyOn(formComponent, 'saveForm');
    const button = formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent;
    formComponent.form!.markAsDirty();
    formComponent.broadcastFormStatus(false);
    const pending = button.save();
    expect(TestBed.inject(ConfirmationDialogService).dialog()).not.toBeNull();
    formComponent.form!.markAsPristine();
    formComponent.broadcastFormStatus(false);
    fixture.detectChanges();
    TestBed.inject(ConfirmationDialogService).resolve(true);
    await pending;
    expect(save).not.toHaveBeenCalled();
  });

  for (const switchToView of [false, true]) {
    it(`preserves the confirmed Save pipeline and post-redirect guard (${switchToView ? 'switches to view' : 'edit'})`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig('Move this record?', {
        redirectLocation: '/record/{{oid}}',
      }), { editMode: true });
      const button = formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent;
      const save = spyOn(formComponent, 'saveForm');
      let resolve!: (items: DynamicScriptResponse) => void;
      const items = new Promise<DynamicScriptResponse>(done => { resolve = done; });
      let started!: () => void;
      const redirectStarted = new Promise<void>(done => { started = done; });
      const templates = spyOn(formComponent, 'getRecordCompiledItems').and.callFake(() => { started(); return items; });
      const events: string[] = [];
      const actions: string[] = [];
      const subscriptions = [
        TestBed.inject(FormComponentEventBus).select$('form.save.requested').subscribe(event => events.push(event.type)),
        TestBed.inject(FormComponentEventBus).select$('form.save.execute').subscribe(event => events.push(event.type)),
        TestBed.inject(Actions).subscribe(action => {
          if (action.type === FormActions.submitForm.type) actions.push(action.type);
        }),
      ];
      try {
        const pending = button.save();
        expect(templates).not.toHaveBeenCalled();
        TestBed.inject(ConfirmationDialogService).resolve(true);
        await redirectStarted;
        expect(templates).toHaveBeenCalledTimes(1);
        expect(events).toEqual([]);
        expect(actions).toEqual([]);
        if (switchToView) formComponent.editMode.set(false);
        resolve({ evaluate: () => '/record/resolved' });
        await pending;
        await fixture.whenStable();
        if (switchToView) {
          expect(events).toEqual([]);
          expect(actions).toEqual([]);
          expect(save).not.toHaveBeenCalled();
        } else {
          // Effects publish execute synchronously while requested is still being delivered.
          expect(events).toEqual(jasmine.arrayWithExactContents(['form.save.requested', 'form.save.execute']));
          expect(actions).toEqual([FormActions.submitForm.type]);
          expect(save).toHaveBeenCalledOnceWith({
            force: true, operation: 'activate', targetStep: 'active', closeOnSave: true,
            redirectLocation: '/record/resolved', redirectDelaySeconds: 5, enabledValidationGroups: ['all'],
          });
        }
      } finally {
        subscriptions.forEach(subscription => subscription.unsubscribe());
      }
    });
  }

  for (const differentButton of [false, true]) {
    it(`replaces an unresolved confirmation from ${differentButton ? 'another' : 'the same'} Save button`, async () => {
      const config = formConfig();
      if (differentButton) config.componentDefinitions!.push({ name: 'otherSave', component: {
        class: 'SaveButtonComponent', config: { targetStep: 'review', operation: 'review', confirmationMessage: 'Review instead?' },
      } });
      const { fixture, formComponent } = await createFormAndWaitForReady(config, { editMode: true });
      const save = spyOn(formComponent, 'saveForm');
      const first = formComponent.getComponentDefByName('confirmActive')!.component as SaveButtonComponent;
      const latest = differentButton ? formComponent.getComponentDefByName('otherSave')!.component as SaveButtonComponent : first;
      const pendingFirst = first.save();
      const pendingLatest = latest.save();
      await pendingFirst;
      expect(save).not.toHaveBeenCalled();
      expect(TestBed.inject(ConfirmationDialogService).dialog()?.message).toBe(differentButton ? 'Review instead?' : 'Move this record?');
      TestBed.inject(ConfirmationDialogService).resolve(true);
      await pendingLatest;
      await fixture.whenStable();
      expect(save).toHaveBeenCalledTimes(1);
      expect(save).toHaveBeenCalledWith(jasmine.objectContaining({
        operation: differentButton ? 'review' : 'activate', targetStep: differentButton ? 'review' : 'active',
      }));
    });
  }
});
