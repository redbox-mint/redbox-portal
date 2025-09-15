// import {FormConfig} from '@researchdatabox/sails-ng-common';

import {SaveButtonComponent} from './save-button.component';
import {SimpleInputComponent} from './simpleinput.component';
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import {FormStatus, FormConfig} from '@researchdatabox/sails-ng-common';

let formConfig: FormConfig;

describe('SaveButtonComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      SimpleInputComponent,
      SaveButtonComponent
    ]);
    formConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              defaultValue: 'hello world default!'
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
                skipValidation: true
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
    formComponent.status.set(FormStatus.VALIDATION_PENDING);
    fixture.detectChanges();
    await fixture.whenStable();
    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeTrue();
  });

  it('should disable save button when form status is SAVING', async () => {
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    formComponent.status.set(FormStatus.SAVING);
    fixture.detectChanges();
    await fixture.whenStable();
    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeTrue();
  });

  it('should enable save button when form status is READY and valid/dirty', async () => {
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    formComponent.status.set(FormStatus.READY);
    // Simulate valid and dirty
    const textField = fixture.nativeElement.querySelector('input');
    textField.value = 'new value';
    textField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    const saveButton = fixture.nativeElement.querySelector('button');
    expect(saveButton.disabled).toBeFalse();
  });

  it('should not call saveForm when disabled', async () => {
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    formComponent.status.set(FormStatus.VALIDATION_PENDING);
    fixture.detectChanges();
    spyOn<any>(formComponent, 'saveForm');
    const saveButton = fixture.nativeElement.querySelector('button');
    saveButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(formComponent.saveForm).not.toHaveBeenCalled();
  });

  it('clicking save button should save form', async () => {
    const {fixture, formComponent, componentDefinitions} = await createFormAndWaitForReady(formConfig);
    // Intercept the formComponent.saveForm method
    spyOn<any>(formComponent, 'saveForm');
    // Simulate a change in the text field
    const textField = fixture.nativeElement.querySelector('input');
    textField.value = 'new value';
    textField.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    // Simulate the save button click
    const saveButton = fixture.nativeElement.querySelector('button');
    saveButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    // Assert that saveForm was called with the expected params
    expect(formComponent.saveForm).toHaveBeenCalledWith(true, 'next_step', true);
  });

  it('clicking save button should be disabled when the form is unchanged', async () => {
    const {fixture, formComponent, componentDefinitions} = await createFormAndWaitForReady(formConfig);
    // Intercept the formComponent.saveForm method
    spyOn<any>(formComponent, 'saveForm');
    // Simulate the save button click
    const saveButton = fixture.nativeElement.querySelector('button');
    saveButton.click();
    fixture.detectChanges();
    await fixture.whenStable();
    // Assert that saveForm was not called
    expect(formComponent.saveForm).not.toHaveBeenCalled();
  });
});