import {FormConfig} from '@researchdatabox/sails-ng-common';
import {RadioInputComponent} from "./radio-input.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('RadioInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      RadioInputComponent,
    ]);
  });
  
  it('should create component', () => {
    let fixture = TestBed.createComponent(RadioInputComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  
  it('should render RadioInput component with options', async () => {
    const formConfig: FormConfig = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'radio_test',
          model: {
            class: 'RadioInputModel',
            config: {
              defaultValue: 'option1'
            }
          },
          component: {
            class: 'RadioInputComponent',
            config: {
              options: [
                { label: 'Option 1', value: 'option1' },
                { label: 'Option 2', value: 'option2' },
                { label: 'Option 3', value: 'option3' }
              ]
            }
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    const compiled = fixture.nativeElement as HTMLElement;
    
    // Check that the first option is selected by default
    const checkedRadio = compiled.querySelector('input[type="radio"]:checked') as HTMLInputElement;
    expect(checkedRadio).toBeTruthy();
    expect(checkedRadio.id).toEqual('radio_test-option1');
    
    // Check that all options have proper labels
    const radioInputs = compiled.querySelectorAll('input[type="radio"]');
    expect(radioInputs.length).toEqual(3);
    const labels = compiled.querySelectorAll('label');
    expect(labels.length).toEqual(3);
    expect(labels[0].textContent?.trim()).toEqual('Option 1');
    expect(labels[1].textContent?.trim()).toEqual('Option 2');
    expect(labels[2].textContent?.trim()).toEqual('Option 3');
  });
});
