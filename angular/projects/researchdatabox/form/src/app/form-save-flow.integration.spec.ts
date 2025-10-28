import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import * as FormActions from './form-state/state/form.actions';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { SimpleInputComponent } from './component/simple-input.component';
import { SaveButtonComponent } from './component/save-button.component';
import { FormComponentEventBus } from './form-state/events';
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';

/**
 * Task 16: End-to-end integration test for the save orchestration flow
 * Flow: SaveButton click -> EventBus(form.save.requested) -> NgRx submitForm ->
 *       FormEffects publishes form.save.execute -> FormComponent.saveForm(force, targetStep, skipValidation)
 */
describe('Form Save Flow Integration', () => {
  let formConfig: FormConfigFrame;

  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        'SimpleInputComponent': SimpleInputComponent,
        'SaveButtonComponent': SaveButtonComponent,
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
      componentDefinitions: [
        {
          name: 'text_input',
          model: {
            class: 'SimpleInputModel',
            config: {
              defaultValue: 'initial value',
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
              targetStep: 'next_step',
              forceSave: true,
              skipValidation: true,
            },
          },
        },
      ],
    };
  });

  it('clicking Save triggers requested -> submitForm -> execute -> FormComponent.saveForm', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

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
      // Prefer setting the FormControl programmatically to ensure valueChanges and dirty state propagate reliably
      formComponent.form?.get('text_input')?.setValue('new value');
      // Explicitly mark the form dirty to satisfy SaveButton gating
      formComponent.form?.markAsDirty();
      formComponent.form?.updateValueAndValidity();
      
      fixture.detectChanges();
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
      expect(requestedEvents[0].targetStep).toBe('next_step');
      expect(requestedEvents[0].skipValidation).toBe(true);

      // Assert: 2) NgRx submitForm action observed (promotion by adapter effect)
      const sawSubmitForm = observedActions.some(a => a.type === FormActions.submitForm.type);
      expect(sawSubmitForm).toBeTrue();

      // Assert: 3) execute event published by FormEffects
      expect(executeEvents.length).toBe(1);
      expect(executeEvents[0].type).toBe('form.save.execute');

      // Assert: 4) FormComponent.saveForm invoked with expected args
      expect(formComponent.saveForm).toHaveBeenCalledWith(true, 'next_step', true);
    } finally {
      requestedSub.unsubscribe();
      executeSub.unsubscribe();
      actionsSub.unsubscribe();
    }
  });
});
