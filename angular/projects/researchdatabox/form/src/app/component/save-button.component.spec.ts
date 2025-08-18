import {FormConfig} from '@researchdatabox/sails-ng-common';
import {SaveButtonComponent} from './save-button.component';
import {TextFieldComponent} from './textfield.component';

import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

let formConfig: FormConfig;

describe('SaveButtonComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      TextFieldComponent,
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
            class: 'TextFieldModel',
            config: {
              value: 'hello world saved!',
              defaultValue: 'hello world default!'
            }
          },
          component: {
            class: 'TextFieldComponent'
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
    console.log(`SaveButtonComponent created: ${component}`);
    expect(component).toBeDefined();
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
    // Simulate the save button click
    const saveButton = fixture.nativeElement.querySelector('button');
    saveButton.click();
    fixture.detectChanges();
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
    // Assert that saveForm was not called
    expect(formComponent.saveForm).not.toHaveBeenCalled();
  });
});