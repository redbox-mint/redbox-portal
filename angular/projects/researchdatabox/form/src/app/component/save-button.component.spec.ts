import {SaveButtonComponent} from './save-button.component';
import {SimpleInputComponent} from './simple-input.component';
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import { Store } from '@ngrx/store';
import * as FormActions from '../form-state/state/form.actions';
import { FormConfigFrame} from '@researchdatabox/sails-ng-common';
import { FormComponentEventBus } from '../form-state/events';

let formConfig: FormConfigFrame;

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
                label: 'Save',
                targetStep: 'next_step',
                forceSave: true,
            }
          }
        }
      ]
    };
  });


  it('should create SaveButtonComponent', () => {
    let fixture = TestBed.createComponent(SaveButtonComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  it('should disable save button when form status is VALIDATION_PENDING', async () => {
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    // Dispatch validation pending action instead of direct mutation
    store.dispatch(FormActions.formValidationPending());
    fixture.detectChanges();
    await fixture.whenStable();
    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeTrue();
  });

  it('should disable save button when form status is SAVING', async () => {
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    // Dispatch submit action to trigger SAVING status
    store.dispatch(FormActions.submitForm({ force: false }));
    fixture.detectChanges();
    await fixture.whenStable();
    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeTrue();
  });

  it('should enable save button when form status is READY and valid/dirty', async () => {
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    // Status should already be READY after form loads successfully
    // Simulate valid and dirty
    const textField = fixture.nativeElement.querySelector('input');
    textField.value = 'new value';
    textField.dispatchEvent(new Event('input'));
    await fixture.whenStable();

    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeFalse();
  });

  it('should not publish save requested when disabled', async () => {
    const {fixture} = await createFormAndWaitForReady(formConfig);
    const store = TestBed.inject(Store);
    const eventBus = TestBed.inject(FormComponentEventBus);
    const events: any[] = [];
    const sub = eventBus.select$('form.save.requested').subscribe(e => events.push(e));
    try {
      // Set status to VALIDATION_PENDING to disable button
      store.dispatch(FormActions.formValidationPending());
      fixture.detectChanges();
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
    const {fixture} = await createFormAndWaitForReady(formConfig);
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
      expect(events[0].targetStep).toBe('next_step');
      expect(events[0].enabledValidationGroups).toEqual(["none"]);
      // name configured for the component in formConfig
      expect(events[0].sourceId).toBe('save_button');
    } finally {
      sub.unsubscribe();
    }
  });

  it('clicking save button should not publish when the form is unchanged', async () => {
    const {fixture} = await createFormAndWaitForReady(formConfig);
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

  it('should render save button wrapper class used by action row', async () => {
    const {fixture} = await createFormAndWaitForReady(formConfig);
    const wrapper = fixture.nativeElement.querySelector('.rb-form-save-button');
    expect(wrapper).toBeTruthy();
  });
});
