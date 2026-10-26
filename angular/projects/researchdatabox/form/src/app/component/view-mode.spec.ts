import { TestBed } from '@angular/core/testing';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { SuggestedValidationSummaryFieldComponent } from './suggested-validation-summary.component';
import { ContentComponent } from './content.component';
import { SimpleInputComponent } from './simple-input.component';
import { SaveButtonComponent } from './save-button.component';
import { DeleteButtonComponent } from './delete-button.component';
import { ValidationSummaryFieldComponent } from './validation-summary.component';
import { ConfirmationDialogService } from '../confirmation-dialog.service';
import { FormComponentEventBus } from '../form-state';

describe('View mode editing prompts', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: { ContentComponent, SimpleInputComponent, SaveButtonComponent, DeleteButtonComponent,
        ValidationSummaryFieldComponent, SuggestedValidationSummaryFieldComponent },
      providers: { ConfirmationDialogService },
    });
  });

  for (const layout of ['DefaultLayout', 'InlineLayout'] as const) {
    it(`retains invalid answers while hiding ${layout} errors, summary and Save in view mode`, async () => {
      const config: FormConfigFrame = {
        name: 'mode-test', enabledValidationGroups: ['submit'],
        componentDefinitions: [
          { name: 'answer', model: { class: 'SimpleInputModel', config: {
            value: 'retained answer', validators: [{ class: 'minLength', config: { minLength: 30 } }],
          } }, component: { class: 'SimpleInputComponent' }, layout: { class: layout, config: { label: 'Answer' } } },
          { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { showWhenValid: true } } },
          { name: 'save', component: { class: 'SaveButtonComponent', config: { targetStep: 'next' } } },
          { name: 'delete', component: { class: 'DeleteButtonComponent', config: { confirmationMessage: 'Delete?' } } },
          { name: 'content', component: { class: 'ContentComponent', config: { content: 'Visible content' } } },
          { name: 'suggestions', component: { class: 'SuggestedValidationSummaryComponent', config: { showWhenValid: true } } },
        ],
      };
      const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: 'mode-test', editMode: true } as any);
      const control = formComponent.form!.get('answer')!;
      // Use a real invalid control so presentation cannot mask a lost validation state.
      expect(control.invalid).toBeTrue();
      formComponent.broadcastFormStatus(false);
      fixture.detectChanges();
      await fixture.whenStable();
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.validation-summary')).not.toBeNull();
      expect(element.querySelector('redbox-field-error-summary')).not.toBeNull();
      expect(element.querySelectorAll('.rb-form-save-button, .rb-form-delete-button').length).toBe(2);
      const errors = control.errors;
      const value = formComponent.form!.getRawValue();
      const content = formComponent.componentDefArr[4].component as ContentComponent;
      content.setProperty('visible', false);
      formComponent.editMode.set(false);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.querySelector('.rb-form-content')).toBeNull();
      expect(element.querySelector('.validation-summary, .suggested-validation-summary, .alert-info, redbox-field-error-summary')).toBeNull();
      expect(element.querySelector('.rb-form-save-button')).toBeNull();
      expect(element.querySelector('.rb-form-delete-button')).not.toBeNull();
      const bus = TestBed.inject(FormComponentEventBus);
      const publish = spyOn(bus, 'publish');
      const confirm = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm').and.resolveTo(true);
      await (formComponent.componentDefArr[2].component as SaveButtonComponent).save();
      expect(publish).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
      expect(control.errors).toBe(errors);
      expect(control.invalid).toBeTrue();
      expect(formComponent.form!.getRawValue()).toEqual(value);
      formComponent.editMode.set(true);
      content.setProperty('visible', true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.querySelector('.validation-summary')).not.toBeNull();
      expect(element.querySelector('redbox-field-error-summary')).not.toBeNull();
      expect(element.querySelector('.rb-form-content')?.textContent).toBe('Visible content');
      expect(control.value).toBe('retained answer');
    });
  }

  it('blocks Save in view mode while retaining confirmed Delete and edit-mode actions', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({ name: 'valid-actions', componentDefinitions: [
      { name: 'save', component: { class: 'SaveButtonComponent', config: { targetStep: 'next' } } },
      { name: 'delete', component: { class: 'DeleteButtonComponent', config: { confirmationMessage: 'Delete?' } } },
      { name: 'answer', model: { class: 'SimpleInputModel', config: { value: 'valid answer' } }, component: { class: 'SimpleInputComponent' } },
    ] }, { oid: 'valid-actions', editMode: true } as any);
    expect(formComponent.form!.valid).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('button:not([disabled])').length).toBe(2);
    const save = formComponent.componentDefArr[0].component as SaveButtonComponent;
    const remove = formComponent.componentDefArr[1].component as DeleteButtonComponent;
    const confirm = spyOn(TestBed.inject(ConfirmationDialogService), 'confirm').and.resolveTo(true);
    const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish');
    formComponent.editMode.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.rb-form-save-button')).toBeNull();
    expect((fixture.nativeElement.querySelector('.rb-form-delete-button button') as HTMLButtonElement | null)?.disabled).toBeFalse();
    await save.save();
    expect(publish).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    await remove.delete();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(publish.calls.allArgs().map(args => args[0].type)).toEqual(['form.delete.requested']);
    publish.calls.reset();
    confirm.calls.reset();
    formComponent.editMode.set(true);
    fixture.detectChanges();
    await save.save();
    await remove.delete();
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(publish.calls.allArgs().map(args => args[0].type)).toEqual(['form.save.requested', 'form.delete.requested']);
  });

  it('hides even the configured valid summary banner in view mode', async () => {
    const { fixture } = await createFormAndWaitForReady({ name: 'valid-view', componentDefinitions: [
      { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { showWhenValid: true } } },
      { name: 'suggestions', component: { class: 'SuggestedValidationSummaryComponent', config: { showWhenValid: true } } },
    ] }, { editMode: false } as any);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});
