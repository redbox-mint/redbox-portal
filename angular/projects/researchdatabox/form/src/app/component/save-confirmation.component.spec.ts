import { TestBed } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { HttpTestingController } from '@angular/common/http/testing';
import { Store } from '@ngrx/store';
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

function formConfig(message: string | undefined = 'Move this record?'): FormConfigFrame {
  return { name: 'confirmation-test', enabledValidationGroups: ['all'], componentDefinitions: [
    { name: 'answer', component: { class: 'SimpleInputComponent' },
      model: { class: 'SimpleInputModel', config: { value: 'retained answer' } } },
    { name: 'confirmActive', component: { class: 'SaveButtonComponent', config: {
      label: 'Activate', targetStep: 'active', operation: 'activate', closeOnSave: true,
      enabledValidationGroups: ['all'], redirectDelaySeconds: 5,
      confirmationTitle: 'Activate RDMP?', confirmationMessage: message,
      confirmButtonMessage: 'Activate now', cancelButtonMessage: 'Keep editing',
    } } },
  ] };
}

describe('SaveButton native confirmation', () => {
  beforeEach(async () => {
    await createTestbedModule({ declarations: { SimpleInputComponent, SaveButtonComponent } });
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
});
