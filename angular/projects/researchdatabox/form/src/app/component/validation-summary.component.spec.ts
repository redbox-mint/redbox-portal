import {TestBed} from '@angular/core/testing';
import {ValidationSummaryFieldComponent} from "./validation-summary.component";
import {FormConfig} from '@researchdatabox/portal-ng-common';
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {formValidatorsSharedDefinitions} from "../validators";
import {TextFieldComponent} from "./textfield.component";

describe('ValidationSummaryFieldComponent', () => {
  let configService: any;
  let translationService: any;
  beforeEach(async () => {
    const testbedModuleResult = await createTestbedModule([
      ValidationSummaryFieldComponent,
      TextFieldComponent,
    ]);
    configService = testbedModuleResult.configService;
    translationService = testbedModuleResult.translationService;
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should display "The form is valid."', async () => {
    // arrange
    const formConfig: FormConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'validation_summary_1',
          model: {name: 'validation_summary_2', class: 'ValidationSummaryFieldModel'},
          component: {class: "ValidationSummaryFieldComponent"}
        },
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-info')!;
    expect(el.textContent).toContain('The form is valid.');
  });
  it('should contain one failed validation for the required text field that is empty', async () => {
    // arrange
    const formConfig: FormConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      validatorDefinitions: formValidatorsSharedDefinitions,
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            name: 'text_1_for_the_form',
            class: 'TextFieldModel',
            config: {
              value: 'hello world!',
              defaultValue: '',
              validators: [
                { name: 'required' },
              ]
            }
          },
          component: {
            class: 'TextFieldComponent'
          }
        },
        {
          name: 'validation_summary_1',
          model: {name: 'validation_summary_2', class: 'ValidationSummaryFieldModel'},
          component: {class: "ValidationSummaryFieldComponent"}
        },
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-danger')!;
    expect(el.textContent).toContain('The form is not valid blah blah.');
  });
});
