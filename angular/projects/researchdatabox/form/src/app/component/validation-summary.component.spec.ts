import {TestBed} from '@angular/core/testing';
import {ValidationSummaryFieldComponent} from "./validation-summary.component";
import {FormConfig} from '@researchdatabox/sails-ng-common';
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {formValidatorsSharedDefinitions} from "../../../../../../../typescript/config/validators";
import {SimpleInputComponent} from "./simpleinput.component";

describe('ValidationSummaryFieldComponent', () => {
  beforeEach(async () => {
   await createTestbedModule([
      ValidationSummaryFieldComponent,
      SimpleInputComponent,
    ]);
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
          model: {class: 'ValidationSummaryFieldModel', config: {}},
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
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              defaultValue: '',
              validators: [
                { name: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          model: { class: 'ValidationSummaryFieldModel', config: {}},
          component: {class: "ValidationSummaryFieldComponent"}
        },
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    const nativeEl: HTMLElement = fixture.nativeElement;
    console.log(nativeEl);
    const el = nativeEl.querySelector('div.alert-danger');
    expect(el?.innerHTML).toContain('<ul><li><a href="#form-item-id-text-1-event"></a>');
  });
});
