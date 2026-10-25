import { createFormAndWaitForReady, createTestbedModule, FormComponentProps } from './helpers.spec';
import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import * as FormActions from './form-state/state/form.actions';
import { SimpleInputComponent } from './component/simple-input.component';
import { SaveButtonComponent } from './component/save-button.component';
import { ValidationSummaryFieldComponent } from './component/validation-summary.component';
import { FormComponentEventBus } from './form-state/events';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { HttpTestingController } from '@angular/common/http/testing';

/**
 * Task 16: End-to-end integration test for the save orchestration flow
 * Flow: SaveButton click -> EventBus(form.save.requested) -> NgRx submitForm ->
 *       FormEffects publishes form.save.execute -> FormComponent.saveForm(options)
 */
describe('Form Save Flow Integration', () => {
  let formConfig: FormConfigFrame;

  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        'SimpleInputComponent': SimpleInputComponent,
        'SaveButtonComponent': SaveButtonComponent,
        'ValidationSummaryFieldComponent': ValidationSummaryFieldComponent,
      },
    });

    formConfig = {
      name: 'save-flow-e2e',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: 'redbox-form form',
      enabledValidationGroups: ["none"],
      componentDefinitions: [
        {
          name: 'text_input',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'initial value',
            },
          },
          component: {
            class: 'SimpleInputComponent',
          },
        },
        {
          name: 'save_button',
          component: {
            class: 'SaveButtonComponent',
            config: {
              label: 'Save',
              operation: 'submit-for-review',
              targetStep: 'next_step',
              forceSave: true,
              enabledValidationGroups: ['all', 'review-submit'],
            },
          },
        },
      ],
    };
  });

  for (const oid of ['', 'oid-save-invalid-publication']) {
    it(`validates an incomplete publication attempt without ${oid ? 'update' : 'create'} HTTP`, async () => {
      formConfig.enabledValidationGroups = ['all'];
      formConfig.componentDefinitions![0].model!.config = { value: '', validators: [{ class: 'required' }] };
      formConfig.componentDefinitions![1].component!.config = {
        label: 'Submit for Publication', targetStep: 'queued', allowValidationAttempt: true
      };
      formConfig.componentDefinitions!.push({ name: 'validation_summary', component: { class: 'ValidationSummaryComponent' } });
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, {
        oid, recordType: 'rdmp', editMode: true,
        formName: 'default-1.0-draft', downloadAndCreateOnInit: false,
      } satisfies FormComponentProps);
      const save = spyOn(formComponent, 'saveForm').and.callThrough();
      const create = spyOn(formComponent.recordService, 'create').and.stub();
      const update = spyOn(formComponent.recordService, 'update').and.stub();
      const eventBus = TestBed.inject(FormComponentEventBus);
      const publish = spyOn(eventBus, 'publish').and.callThrough();
      const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
      expect(formComponent.form!.invalid).toBeTrue();
      expect(button.disabled).toBeFalse();
      button.click();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(publish).toHaveBeenCalledWith(jasmine.objectContaining({
        type: 'form.save.requested', targetStep: 'queued', enabledValidationGroups: ['all']
      }));
      expect(save).toHaveBeenCalledWith(jasmine.objectContaining({ targetStep: 'queued', enabledValidationGroups: ['all'] }));
      expect(formComponent.enabledValidationGroups).toEqual(['all']);
      expect(formComponent.form!.get('text_input')!.hasError('required')).toBeTrue();
      expect(publish).toHaveBeenCalledWith(jasmine.objectContaining({ type: 'form.save.failure', error: '@dmpt-form-invalid' }));
      expect(fixture.nativeElement.querySelector('.validation-summary [data-validation-error-class="required"]')).not.toBeNull();
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
      TestBed.inject(HttpTestingController).expectNone(request => /recordmeta|api\/records\/metadata/.test(request.url));
    });
  }

  it('clicking Save triggers requested -> submitForm -> execute -> FormComponent.saveForm', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, {
      oid: 'oid-save-flow', recordType: 'rdmp', editMode: true,
      formName: 'default-1.0-draft', downloadAndCreateOnInit: false,
    } satisfies FormComponentProps);

    // Arrange: observe events and actions across the whole pipeline
    const eventBus = TestBed.inject(FormComponentEventBus);
    const requestedEvents: any[] = [];
    const executeEvents: any[] = [];
    const requestedSub = eventBus.select$('form.save.requested').subscribe(e => requestedEvents.push(e));
    const executeSub = eventBus.select$('form.save.execute').subscribe(e => executeEvents.push(e));

    const actions$ = TestBed.inject(Actions);
    const observedActions: any[] = [];
    const actionsSub = actions$.subscribe(a => observedActions.push(a));

    // Spy on the terminal method
    spyOn(formComponent as any, 'saveForm');

    try {
      // Make the form dirty so the Save button is enabled
      // Use DOM event to trigger Angular's form change detection
      const inputElement = fixture.nativeElement.querySelector('input');
      inputElement.value = 'new value';
      inputElement.dispatchEvent(new Event('input'));

      await fixture.whenStable();

      // Sanity check: button should be enabled now
      const preClickButton: HTMLButtonElement = fixture.nativeElement.querySelector('button');
      expect(preClickButton.disabled).toBeFalse();

      // Act: click the Save button
      preClickButton.click();
      fixture.detectChanges();
      await fixture.whenStable();

      // Assert: 1) requested event published by SaveButton
      expect(requestedEvents.length).toBe(1);
      expect(requestedEvents[0].type).toBe('form.save.requested');
      expect(requestedEvents[0].force).toBe(true);
      expect(requestedEvents[0].operation).toBe('submit-for-review');
      expect(requestedEvents[0].targetStep).toBe('next_step');
      expect(requestedEvents[0].enabledValidationGroups).toEqual(['all', 'review-submit']);

      // Assert: 2) NgRx submitForm action observed (promotion by adapter effect)
      const sawSubmitForm = observedActions.some(a => a.type === FormActions.submitForm.type);
      expect(sawSubmitForm).toBeTrue();
      expect(observedActions.find(a => a.type === FormActions.submitForm.type)?.operation)
        .toBe('submit-for-review');

      // Assert: 3) execute event published by FormEffects
      expect(executeEvents.length).toBe(1);
      expect(executeEvents[0].type).toBe('form.save.execute');
      expect(executeEvents[0].operation).toBe('submit-for-review');

      // Assert: 4) FormComponent.saveForm invoked with expected args
      expect(formComponent.saveForm).toHaveBeenCalledWith({
        force: true, operation: 'submit-for-review', targetStep: 'next_step',
        enabledValidationGroups: ['all', 'review-submit'],
        closeOnSave: undefined, redirectLocation: undefined, redirectDelaySeconds: undefined,
      });
    } finally {
      requestedSub.unsubscribe();
      executeSub.unsubscribe();
      actionsSub.unsubscribe();
    }
  });
});
