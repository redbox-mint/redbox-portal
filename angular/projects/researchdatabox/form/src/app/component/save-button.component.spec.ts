import { createFormAndWaitForReady, createTestbedModule, FormComponentProps } from "../helpers.spec";
import { SaveButtonComponent } from './save-button.component';
import { SimpleInputComponent } from './simple-input.component';
import { TestBed } from "@angular/core/testing";
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import * as FormActions from '../form-state/state/form.actions';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events';
import { TranslationService } from "@researchdatabox/portal-ng-common";
import { ConfirmationDialogService } from '../confirmation-dialog.service';

let formConfig: FormConfigFrame;
const editableProps: FormComponentProps = {
  oid: 'oid-generated-save-test', recordType: 'rdmp', editMode: true,
  formName: 'default-1.0-draft', downloadAndCreateOnInit: false,
};

describe('SaveButtonComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "SaveButtonComponent": SaveButtonComponent,
      }
    });
    formConfig = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      enabledValidationGroups: ["none"],
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
          name: 'save_button',
          component: {
            class: 'SaveButtonComponent',
            config: {
              label: '@save-button-default',
              labelSaving: "@save-button-saving",
              operation: 'submit-for-review',
              targetStep: 'next_step',
              forceSave: true,
            }
          }
        }
      ]
    };
  });

  it('waits for native confirmation, cancels without a request, then confirms exactly one configured transition', async () => {
    Object.assign(formConfig.componentDefinitions![1].component.config!, {
      confirmationMessage: 'Move this record?', confirmationTitle: 'Confirm move',
      cancelButtonMessage: 'Keep editing', confirmButtonMessage: 'Move now',
    });
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
    spyOn(formComponent, 'saveForm').and.stub();
    const dialog = TestBed.inject(ConfirmationDialogService);
    const events: unknown[] = [];
    const sub = TestBed.inject(FormComponentEventBus).select$('form.save.requested').subscribe(event => events.push(event));
    const before = formComponent.form!.getRawValue();
    try {
      const button = fixture.nativeElement.querySelector('redbox-form-save-button button') as HTMLButtonElement;
      button.click();
      fixture.detectChanges();
      expect(events.length).toBe(0);
      expect(dialog.dialog()?.title).toBe('Confirm move');
      expect(fixture.nativeElement.querySelector('[role="dialog"]').textContent).toContain('Move this record?');
      const cancel = fixture.nativeElement.querySelector('.modal-footer .btn-secondary') as HTMLButtonElement;
      expect(cancel.textContent).toContain('Keep editing');
      cancel.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(events.length).toBe(0);
      expect(formComponent.form!.getRawValue()).toEqual(before);
      expect(formComponent.saveForm).not.toHaveBeenCalled();
      expect(dialog.dialog()).toBeNull();
      button.click();
      fixture.detectChanges();
      const confirm = fixture.nativeElement.querySelector('.modal-footer .btn-primary') as HTMLButtonElement;
      expect(confirm.textContent).toContain('Move now');
      confirm.click();
      await fixture.whenStable();
      expect(events.length).toBe(1);
      expect(events[0]).toEqual(jasmine.objectContaining({type: 'form.save.requested', targetStep: 'next_step', operation: 'submit-for-review', force: true}));
    } finally { sub.unsubscribe(); }
  });

  for (const guard of ['source', 'view', 'saving', 'pending']) {
    it(`rechecks the ${guard} guard after a pending confirmation`, async () => {
      Object.assign(formConfig.componentDefinitions![1].component.config!, { confirmationMessage: 'Confirm?' });
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
      spyOn(formComponent, 'saveForm').and.stub();
      const component = formComponent.getComponentDefByName('save_button')!.component as SaveButtonComponent;
      const dialog = TestBed.inject(ConfirmationDialogService);
      const events: unknown[] = [];
      const sub = TestBed.inject(FormComponentEventBus).select$('form.save.requested').subscribe(event => events.push(event));
      try {
        const pending = component.save();
        expect(dialog.dialog()?.visible).toBeTrue();
        if (guard === 'source') component.setDisabled(true);
        if (guard === 'view') formComponent.editMode.set(false);
        if (guard === 'saving') TestBed.inject(Store).dispatch(FormActions.submitForm({ force: true }));
        if (guard === 'pending') TestBed.inject(Store).dispatch(FormActions.formValidationPending());
        fixture.detectChanges();
        await fixture.whenStable();
        dialog.resolve(true);
        await pending;
        expect(events.length).toBe(0);
      } finally { sub.unsubscribe(); }
    });
  }

  it('does not open a confirmation for an ordinary unconfigured save', async () => {
    const { formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
    const confirm = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm');
    spyOn(formComponent, 'saveForm').and.stub();
    const component = formComponent.getComponentDefByName('save_button')!.component as SaveButtonComponent;
    await component.save();
    expect(confirm).not.toHaveBeenCalled();
  });


  for (const targetStep of [undefined, 'next_step']) {
    it(`does not render or publish ${targetStep ? 'workflow' : 'ordinary'} saves in view mode`, async () => {
      formConfig.componentDefinitions![1].component!.config = { label: 'Save', forceSave: true, targetStep };
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { ...editableProps, editMode: false });
      const component = formComponent.getComponentDefByName('save_button')!.component as SaveButtonComponent;
      const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish');
      const before = formComponent.form!.getRawValue();
      expect(fixture.nativeElement.querySelector('redbox-form-save-button button')).toBeNull();
      expect(component.disabled()).toBeTrue();
      component.setDisabled(false);
      await component.save();
      expect(publish).not.toHaveBeenCalled();
      expect(formComponent.form!.getRawValue()).toEqual(before);
      // The form's signal, rather than a cached field-config mode, owns this.
      formComponent.editMode.set(true);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('redbox-form-save-button button')).not.toBeNull();
      expect(component.disabled()).toBeFalse();
    });
  }

  for (const scenario of ['server action', 'local form', 'server field']) {
    it(`permits a different save after an action rejection, but keeps ${scenario} validation scoped`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
      const form = formComponent.form!;
      form.markAsDirty();
      if (scenario === 'server field') {
        form.get('text_1_event')!.setErrors({ 'server#0': { message: 'Invalid field' } });
      } else {
        form.setErrors(scenario === 'server action'
          ? { 'server#0': { message: 'Only the CI can activate' } }
          : { required: true });
      }
      formComponent.broadcastFormStatus(false);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('button').disabled).toBe(scenario !== 'server action');
    });
  }

  it('keeps save disabled after an action rejection when a nested control makes its parent group invalid', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
    const form = formComponent.form!;
    const nestedGroup = new FormGroup({
      requiredField: new FormControl('', Validators.required),
    });
    form.addControl('nested', nestedGroup);
    form.markAsDirty();
    form.setErrors({ 'server#0': { message: 'Only the CI can activate' } });

    formComponent.broadcastFormStatus(false);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(nestedGroup.controls.requiredField.hasError('required')).toBeTrue();
    expect(nestedGroup.errors).toBeNull();
    expect(nestedGroup.valid).toBeFalse();
    expect(formComponent.canRetryFormLevelServerErrors()).toBeFalse();
    expect(fixture.nativeElement.querySelector('button').disabled).toBeTrue();
  });

  it('allows an incomplete pristine draft to request its own validation groups', async () => {
    formConfig.enabledValidationGroups = ['all'];
    formConfig.componentDefinitions![0].model!.config = {
      value: '', validators: [{ class: 'required' }],
    };
    formConfig.componentDefinitions![1].component.config = {
      label: 'Save draft', forceSave: true, enabledValidationGroups: [],
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
    spyOn(formComponent, 'saveForm');
    const requested: any[] = [];
    const sub = TestBed.inject(FormComponentEventBus).select$('form.save.requested').subscribe(event => requested.push(event));
    try {
      expect(formComponent.form!.valid).toBeFalse();
      expect(formComponent.form!.pristine).toBeTrue();
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(button.disabled).toBeFalse();
      button.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(requested.length).toBe(1);
      expect(requested[0].enabledValidationGroups).toEqual([]);
      expect(requested[0].force).toBeTrue();
    } finally { sub.unsubscribe(); }
  });

  for (const allowValidationAttempt of [undefined, false, true]) {
    it(`keeps invalid workflow-button availability opt-in (${allowValidationAttempt})`, async () => {
      formConfig.enabledValidationGroups = ['all'];
      formConfig.componentDefinitions![0].model!.config = { value: '', validators: [{ class: 'required' }] };
      formConfig.componentDefinitions![1].component!.config = { label: 'Submit', targetStep: 'queued', allowValidationAttempt };
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
      formComponent.broadcastFormStatus(false);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(formComponent.form!.invalid).toBeTrue();
      expect((fixture.nativeElement.querySelector('button') as HTMLButtonElement).disabled).toBe(allowValidationAttempt !== true);
      expect(formComponent.enabledValidationGroups).toEqual(['all']);
    });
  }

  for (const guard of ['source', 'pending', 'saving', 'view']) {
    it(`keeps the ${guard} guard authoritative when invalid validation attempts are allowed`, async () => {
      formConfig.enabledValidationGroups = ['all'];
      formConfig.componentDefinitions![0].model!.config = { value: '', validators: [{ class: 'required' }] };
      formConfig.componentDefinitions![1].component!.config = {
        label: 'Submit', targetStep: 'queued', allowValidationAttempt: true, disabled: guard === 'source'
      };
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { ...editableProps, editMode: guard !== 'view' });
      spyOn(formComponent, 'saveForm').and.stub();
      const component = formComponent.getComponentDefByName('save_button')!.component as SaveButtonComponent;
      const store = TestBed.inject(Store);
      if (guard === 'pending') store.dispatch(FormActions.formValidationPending());
      if (guard === 'saving') store.dispatch(FormActions.submitForm({ force: true }));
      fixture.detectChanges();
      await fixture.whenStable();
      const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish');
      expect(component.disabled()).toBeTrue();
      await component.save();
      expect(publish).not.toHaveBeenCalled();
      expect(formComponent.enabledValidationGroups).toEqual(['all']);
      if (guard === 'view') expect(fixture.nativeElement.querySelector('button')).toBeNull();
      if (guard === 'source') {
        component.setDisabled(false);
        fixture.detectChanges();
        expect(component.disabled()).toBeFalse();
        component.setDisabled(true);
        fixture.detectChanges();
        expect(component.disabled()).toBeTrue();
      }
    });
  }

  it('honors configured disabled and subsequent expression updates even for forced transitions', async () => {
    formConfig.componentDefinitions![1].component.config!.disabled = true;
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
    const component = formComponent.componentDefArr[1].component as SaveButtonComponent;
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    expect(button.disabled).toBeTrue();
    component.setDisabled(false);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(button.disabled).toBeFalse();
    component.setDisabled(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(button.disabled).toBeTrue();
  });

  it('should create SaveButtonComponent', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const component = fixture.nativeElement.querySelector('redbox-form-save-button');
    expect(component).toBeTruthy();
  });

  it('should disable save button when form status is VALIDATION_PENDING', async () => {
    const translationService = TestBed.inject(TranslationService) as any;
    translationService.translationMap['@save-button-default'] = 'Save';
    translationService.translationMap['@save-button-saving'] = 'Saving';

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const store = TestBed.inject(Store);
    // Dispatch validation pending action instead of direct mutation
    store.dispatch(FormActions.formValidationPending());
    fixture.detectChanges();
    await fixture.whenStable();
    TestBed.tick();
    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeTrue();

    expect(saveButton.textContent).toEqual("Save");
  });

  it('should disable save button when form status is SAVING', async () => {
    const translationService = TestBed.inject(TranslationService) as any;
    translationService.translationMap['@save-button-default'] = 'Save';
    translationService.translationMap['@save-button-saving'] = 'Saving';

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);

    // TODO: how to get a protected / private property?
    const saveButtonComponent = fixture.componentInstance.componentDefArr[1].component as any;
    const currentLabelSpy = spyOn(saveButtonComponent, 'currentLabel').and.callThrough();
    const translateSpy = spyOn(saveButtonComponent, 'translate').and.callThrough();

    const store = TestBed.inject(Store);
    // Make the form dirty so saveForm doesn't immediately reject
    const textField = fixture.nativeElement.querySelector('input');
    textField.value = 'new value';
    textField.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    // Dispatch submit action to trigger SAVING status
    store.dispatch(FormActions.submitForm({ force: false }));
    fixture.detectChanges();
    await fixture.whenStable();

    TestBed.tick();
    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeTrue();

    fixture.detectChanges();
    await fixture.whenStable();

    // console.log(JSON.stringify({
    //   translateSpy: translateSpy.calls.all().map(i => i.args),
    //   currentLabelSpy: currentLabelSpy.calls.all().map(i => i.args)
    // }));

    expect(translateSpy).toHaveBeenCalled();
    expect(currentLabelSpy).toHaveBeenCalled();

    // TODO: the effect doesn't seem to trigger - how to test the change from Save to Saving?
    // expect(saveButton.textContent).toEqual("Saving");

  });

  it('should enable save button when form status is READY and valid/dirty', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
    // Status should already be READY after form loads successfully
    // Simulate valid and dirty
    const textField = fixture.nativeElement.querySelector('input');
    textField.value = 'new value';
    textField.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeFalse();

    expect(saveButton.textContent).toEqual("@save-button-default");
  });

  it('should not publish save requested when disabled', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus.select$('form.save.requested').subscribe(e => events.push(e));
    try {
      // Set status to VALIDATION_PENDING to disable button
      store.dispatch(FormActions.formValidationPending());
      fixture.detectChanges();
      await fixture.whenStable();
      TestBed.tick();
      const saveButton = fixture.nativeElement.querySelector('button');
      saveButton.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(events.length).toBe(0);
    } finally {
      sub.unsubscribe();
    }
  });

  it('clicking save button should publish form.save.requested with config options', async () => {
    const saveButtonConfig = formConfig.componentDefinitions?.[1]?.component?.config as Record<string, unknown>;
    saveButtonConfig['closeOnSave'] = true;
    saveButtonConfig['redirectLocation'] = 'redirect-location/one';
    saveButtonConfig['redirectDelaySeconds'] = 2;

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus.select$('form.save.requested').subscribe(e => events.push(e));
    try {
      // Simulate a change in the text field to make form dirty
      const textField = fixture.nativeElement.querySelector('input');
      textField.value = 'new value';
      textField.dispatchEvent(new Event('input'));

      await fixture.whenStable();

      // Simulate the save button click
      const saveButton = fixture.nativeElement.querySelector('button');
      saveButton.click();

      await fixture.whenStable();
      // Assert the event payload
      expect(events.length).toBe(1);
      expect(events[0].type).toBe('form.save.requested');
      expect(events[0].force).toBe(true);
      expect(events[0].operation).toBe('submit-for-review');
      expect(events[0].targetStep).toBe('next_step');
      expect(events[0].closeOnSave).toBe(true);
      expect(events[0].redirectLocation).toBe('redirect-location/one');
      expect(events[0].redirectDelaySeconds).toBe(2);
      expect(events[0].enabledValidationGroups).toEqual(["none"]);
      // name configured for the component in formConfig
      expect(events[0].sourceId).toBe('save_button');
    } finally {
      sub.unsubscribe();
    }
  });

  it('clicking save button should not publish when the form is unchanged', async () => {
    const saveButtonConfig = formConfig.componentDefinitions?.[1]?.component?.config as Record<string, unknown>;
    delete saveButtonConfig['targetStep'];
    delete saveButtonConfig['forceSave'];

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus.select$('form.save.requested').subscribe(e => events.push(e));
    try {
      // Simulate the save button click without changing inputs (pristine)
      const saveButton = fixture.nativeElement.querySelector('button');
      saveButton.click();
      fixture.detectChanges();
      await fixture.whenStable();
      // Assert that no event was published
      expect(events.length).toBe(0);
    } finally {
      sub.unsubscribe();
    }
  });

  it('clicking target step save button should publish when the form is unchanged', async () => {
    const saveButtonConfig = formConfig.componentDefinitions?.[1]?.component?.config as Record<string, unknown>;
    delete saveButtonConfig['forceSave'];

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus.select$('form.save.requested').subscribe(e => events.push(e));
    try {
      fixture.detectChanges();
      await fixture.whenStable();

      const saveButton = fixture.nativeElement.querySelector('button');
      expect(saveButton.disabled).toBeFalse();

      saveButton.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(events.length).toBe(1);
      expect(events[0].force).toBe(true);
      expect(events[0].operation).toBe('submit-for-review');
      expect(events[0].targetStep).toBe('next_step');
      expect(events[0].enabledValidationGroups).toEqual(["none"]);
    } finally {
      sub.unsubscribe();
    }
  });

  it('keeps save buttons without an operation compatible', async () => {
    const saveButtonConfig = formConfig.componentDefinitions?.[1]?.component?.config as Record<string, unknown>;
    delete saveButtonConfig['operation'];

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus.select$('form.save.requested').subscribe(event => events.push(event));
    try {
      const saveButton = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      saveButton.click();
      fixture.detectChanges();
      await fixture.whenStable();

      expect(events.length).toBe(1);
      expect(events[0].operation).toBeUndefined();
      expect(events[0].enabledValidationGroups).toEqual(['none']);
    } finally {
      sub.unsubscribe();
    }
  });

  it('should disable standard save button on initial load when the form is pristine', async () => {
    const saveButtonConfig = formConfig.componentDefinitions?.[1]?.component?.config as Record<string, unknown>;
    delete saveButtonConfig['targetStep'];
    delete saveButtonConfig['forceSave'];

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    fixture.detectChanges();
    await fixture.whenStable();

    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeTrue();
  });

  it('should render save button wrapper class used by action row', async () => {
    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const wrapper = fixture.nativeElement.querySelector('.rb-form-save-button');
    expect(wrapper).toBeTruthy();
  });
});
