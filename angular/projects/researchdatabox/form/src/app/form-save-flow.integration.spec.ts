import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import * as FormActions from './form-state/state/form.actions';
import { createFormAndWaitForReady, createTestbedModule } from './helpers.spec';
import { SimpleInputComponent } from './component/simple-input.component';
import { SaveButtonComponent } from './component/save-button.component';
import { FormComponentEventBus } from './form-state/events';
import { DynamicScriptResponse, FormConfigFrame, isTypeFieldDefinitionName, SaveButtonFieldComponentDefinitionFrame } from '@researchdatabox/sails-ng-common';

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

  for (const switchToView of [true, false]) {
    it(`checks mode after redirect resolution (${switchToView ? 'view then edit' : 'stays in edit'})`, async () => {
      const saveDefinition = formConfig.componentDefinitions?.[1]?.component;
      if (!isTypeFieldDefinitionName<SaveButtonFieldComponentDefinitionFrame>(saveDefinition, 'SaveButtonComponent')) {
        throw new Error('Missing Save config');
      }
      saveDefinition.config = { ...saveDefinition.config, redirectLocation: '/record/{{oid}}' };
      const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });
      const save = formComponent.componentDefArr[1].component as SaveButtonComponent;
      const saveForm = spyOn(formComponent, 'saveForm');
      const evaluate = jasmine.createSpy('evaluate').and.returnValue('/record/resolved');
      let resolve!: (items: DynamicScriptResponse) => void;
      const compiledItems = new Promise<DynamicScriptResponse>(done => { resolve = done; });
      let resolvingRedirect!: () => void;
      const redirectStarted = new Promise<void>(done => { resolvingRedirect = done; });
      const getCompiledItems = spyOn(formComponent, 'getRecordCompiledItems').and.callFake(() => {
        resolvingRedirect();
        return compiledItems;
      });
      const eventBus = TestBed.inject(FormComponentEventBus);
      const requested: string[] = [];
      const executed: string[] = [];
      const submitted: string[] = [];
      const subscriptions = [
        eventBus.select$('form.save.requested').subscribe(event => requested.push(event.type)),
        eventBus.select$('form.save.execute').subscribe(event => executed.push(event.type)),
        TestBed.inject(Actions).subscribe(action => {
          if (action.type === FormActions.submitForm.type) submitted.push(action.type);
        }),
      ];
      try {
        expect(save.disabled()).toBeFalse();
        const saving = save.save();
        // Confirmation is also asynchronous, including when no dialog is configured.
        // Exercise the separate guard after redirect resolution has actually begun.
        await redirectStarted;
        expect(getCompiledItems).toHaveBeenCalledTimes(1);
        expect(requested).toEqual([]);
        if (switchToView) formComponent.editMode.set(false);
        resolve({ evaluate });
        await saving;
        await fixture.whenStable();
        if (switchToView) {
          expect(requested).toEqual([]);
          expect(submitted).toEqual([]);
          expect(executed).toEqual([]);
          expect(saveForm).not.toHaveBeenCalled();
          formComponent.editMode.set(true);
          fixture.detectChanges();
          await save.save();
          await fixture.whenStable();
        }
        expect(evaluate).toHaveBeenCalled();
        expect(requested).toEqual(['form.save.requested']);
        expect(submitted).toEqual([FormActions.submitForm.type]);
        expect(executed).toEqual(['form.save.execute']);
        expect(saveForm).toHaveBeenCalledTimes(1);
        expect(saveForm).toHaveBeenCalledWith(jasmine.objectContaining({
          force: true, operation: 'submit-for-review', targetStep: 'next_step',
          redirectLocation: '/record/resolved', enabledValidationGroups: ['all', 'review-submit'],
        }));
      } finally {
        subscriptions.forEach(subscription => subscription.unsubscribe());
      }
    });
  }

  it('does not publish Save after an immediate redirect promise yields to view mode', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });
    const save = formComponent.componentDefArr[1].component as SaveButtonComponent;
    const saveForm = spyOn(formComponent, 'saveForm');
    const publish = spyOn(TestBed.inject(FormComponentEventBus), 'publish').and.callThrough();
    const saving = save.save();
    formComponent.editMode.set(false);
    await saving;
    await fixture.whenStable();
    expect(publish.calls.allArgs().filter(([event]) => event.type === 'form.save.requested')).toEqual([]);
    expect(saveForm).not.toHaveBeenCalled();
  });

  it('clicking Save triggers requested -> submitForm -> execute -> FormComponent.saveForm', async () => {
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });

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
