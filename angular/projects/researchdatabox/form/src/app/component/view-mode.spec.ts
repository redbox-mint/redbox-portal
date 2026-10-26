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
import { DefaultLayoutComponent } from './default-layout.component';
import { InlineLayoutComponent } from './inline-layout.component';
import { ValidationErrors } from '@angular/forms';

describe('View mode editing prompts', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: { ContentComponent, SimpleInputComponent, SaveButtonComponent, DeleteButtonComponent,
        ValidationSummaryFieldComponent, SuggestedValidationSummaryFieldComponent },
      providers: { ConfirmationDialogService },
    });
  });

  for (const layout of ['DefaultLayout', 'InlineLayout'] as const) {
    it(`loads invalid records in view first with ${layout} and restores hard and suggested prompts in edit`, async () => {
      const { fixture, formComponent } = await createFormAndWaitForReady({
        name: 'view-first', enabledValidationGroups: ['all'],
        validationGroups: {
          all: { description: 'Hard validation', initialMembership: 'all' },
          recommended: { description: 'Recommendations', initialMembership: 'none' },
        },
        componentDefinitions: [
          { name: 'answer', model: { class: 'SimpleInputModel', config: {
            value: '', validators: [{ class: 'required' }],
          } }, component: { class: 'SimpleInputComponent' }, layout: { class: layout } },
          { name: 'recommended', model: { class: 'SimpleInputModel', config: {
            value: '', validators: [{ class: 'required', groups: { include: ['recommended'], exclude: ['all'] } }],
          } }, component: { class: 'SimpleInputComponent' } },
          { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
          { name: 'suggestions', component: { class: 'SuggestedValidationSummaryComponent', config: { enabledValidationGroups: ['recommended'] } } },
          { name: 'save', component: { class: 'SaveButtonComponent', config: { targetStep: 'next', forceSave: true } } },
        ],
      }, { editMode: false });
      const element: HTMLElement = fixture.nativeElement;
      const control = formComponent.form!.get('answer')!;
      const errors = control.errors;
      const validator = control.validator;
      const suggested = formComponent.componentDefArr[3].component as SuggestedValidationSummaryFieldComponent;
      const save = formComponent.componentDefArr[4].component as SaveButtonComponent;
      const saveForm = spyOn(formComponent, 'saveForm');
      const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish').and.callThrough();
      expect(control.invalid).toBeTrue();
      expect(formComponent.form!.get('recommended')!.errors).toBeNull();
      expect((await suggested.allValidationErrorsDisplay()).length).toBeGreaterThan(0);
      expect(element.querySelector('[role="alert"], redbox-field-error-summary, .rb-form-save-button')).toBeNull();
      formComponent.editMode.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.querySelector('.validation-summary')).not.toBeNull();
      expect(element.querySelector('.suggested-validation-summary')).not.toBeNull();
      expect(element.querySelector('redbox-field-error-summary')).not.toBeNull();
      expect((element.querySelector('.rb-form-save-button button') as HTMLButtonElement).disabled).toBeTrue();
      await save.save();
      await fixture.whenStable();
      expect(publish.calls.allArgs().filter(([event]) => event.type === 'form.save.requested')).toEqual([]);
      expect(saveForm).not.toHaveBeenCalled();
      formComponent.editMode.set(false);
      fixture.detectChanges();
      expect(element.querySelector('[role="alert"], redbox-field-error-summary, .rb-form-save-button')).toBeNull();
      expect(control.errors).toBe(errors);
      expect(control.validator).toBe(validator);
      expect(control.value).toBe('');
    });

    it(`keeps custom before/after template hooks using ${layout} free of view-mode errors`, async () => {
      TestBed.overrideComponent(SimpleInputComponent, { set: { template: `
        <ng-container *ngTemplateOutlet="getTemplateRef('before')"/>
        <span class="custom-answer">{{ model?.formControl?.value }}</span>
        <ng-container *ngTemplateOutlet="getTemplateRef('after')"/>
      ` } });
      const { fixture, formComponent } = await createFormAndWaitForReady({
        name: 'custom-hooks', enabledValidationGroups: ['all'], componentDefinitions: [{
          name: 'answer', model: { class: 'SimpleInputModel', config: {
            value: 'kept', validators: [{ class: 'minLength', config: { minLength: 10 } }],
          } }, component: { class: 'SimpleInputComponent' }, layout: { class: layout, config: { label: 'Answer' } },
        }],
      }, { editMode: false });
      const element: HTMLElement = fixture.nativeElement;
      expect(element.querySelector('.custom-answer')?.textContent).toBe('kept');
      expect(element.querySelector('redbox-field-error-summary')).toBeNull();
      formComponent.editMode.set(true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(element.querySelector('redbox-field-error-summary .rb-form-field-error-summary__primary')).not.toBeNull();
      const fieldLayout = formComponent.componentDefArr[0].layout as DefaultLayoutComponent<string> | InlineLayoutComponent<string>;
      fieldLayout.setProperty('visible', false);
      fixture.detectChanges();
      expect(element.querySelector('redbox-field-error-summary')).toBeNull();
      fieldLayout.setProperty('visible', true);
      fixture.detectChanges();
      expect(element.querySelector('redbox-field-error-summary .rb-form-field-error-summary__primary')).not.toBeNull();
      formComponent.editMode.set(false);
      fixture.detectChanges();
      expect(element.querySelector('redbox-field-error-summary')).toBeNull();
      expect(element.querySelector('.custom-answer')?.textContent).toBe('kept');
    });

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
      const { fixture, formComponent } = await createFormAndWaitForReady(config, { oid: 'mode-test', editMode: true });
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
    ] }, { oid: 'valid-actions', editMode: true });
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

  it('retains an in-flight validator, dirty/touched state and answers across mode switches', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'pending-mode', componentDefinitions: [
        { name: 'answer', model: { class: 'SimpleInputModel', config: { value: 'answer' } }, component: { class: 'SimpleInputComponent' } },
        { name: 'save', component: { class: 'SaveButtonComponent', config: { targetStep: 'next', forceSave: true } } },
      ],
    }, { editMode: true });
    const control = formComponent.form!.get('answer')!;
    const save = formComponent.componentDefArr[1].component as SaveButtonComponent;
    const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish').and.callThrough();
    let resolve!: (errors: ValidationErrors | null) => void;
    control.setAsyncValidators(() => new Promise<ValidationErrors | null>(done => { resolve = done; }));
    const validator = control.asyncValidator;
    control.markAsDirty();
    control.markAsTouched();
    control.updateValueAndValidity();
    formComponent.broadcastFormStatus(false);
    fixture.detectChanges();
    expect(control.pending).toBeTrue();
    expect(save.disabled()).toBeTrue();
    formComponent.editMode.set(false);
    fixture.detectChanges();
    await save.save();
    expect(control.pending).toBeTrue();
    expect(control.asyncValidator).toBe(validator);
    expect(control.dirty).toBeTrue();
    expect(control.touched).toBeTrue();
    expect(control.value).toBe('answer');
    formComponent.editMode.set(true);
    fixture.detectChanges();
    expect(save.disabled()).toBeTrue();
    resolve({ remote: { message: 'Remote validation failed' } });
    await fixture.whenStable();
    expect(control.invalid).toBeTrue();
    expect(control.hasError('remote')).toBeTrue();
    expect(control.asyncValidator).toBe(validator);
    expect(publish.calls.allArgs().filter(([event]) => event.type === 'form.save.requested')).toEqual([]);
  });

  it('keeps configured hidden Save and summary components hidden after returning to edit', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({
      name: 'hidden-mode', componentDefinitions: [
        { name: 'save', component: { class: 'SaveButtonComponent', config: { visible: false, targetStep: 'next' } } },
        { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { visible: false, showWhenValid: true } } },
        { name: 'suggestions', component: { class: 'SuggestedValidationSummaryComponent', config: { visible: false, showWhenValid: true } } },
      ],
    }, { editMode: false });
    for (const editMode of [true, false, true]) {
      formComponent.editMode.set(editMode);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.rb-form-save-button')).toBeNull();
      for (const selector of ['redbox-validation-summary-field', 'redbox-suggested-validation-summary-field']) {
        const wrapper = (fixture.nativeElement.querySelector(selector) as HTMLElement).closest('redbox-form-base-wrapper')!;
        expect(getComputedStyle(wrapper).display).toBe('none');
      }
    }
  });

  it('hides even the configured valid summary banner in view mode', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady({ name: 'valid-view', componentDefinitions: [
      { name: 'summary', component: { class: 'ValidationSummaryComponent', config: { showWhenValid: true } } },
      { name: 'suggestions', component: { class: 'SuggestedValidationSummaryComponent', config: { showWhenValid: true } } },
    ] }, { editMode: false });
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    formComponent.editMode.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('.alert-info').length).toBe(2);
    formComponent.editMode.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});
