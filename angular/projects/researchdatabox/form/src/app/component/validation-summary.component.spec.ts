import {TestBed} from '@angular/core/testing';
import {ValidationSummaryFieldComponent} from "./validation-summary.component";
import {FormConfigFrame} from '@researchdatabox/sails-ng-common';
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {SimpleInputComponent} from "./simple-input.component";

describe('ValidationSummaryFieldComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "ValidationSummaryFieldComponent": ValidationSummaryFieldComponent,
        "SimpleInputComponent": SimpleInputComponent,
      }
    });
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should display "The form is valid."', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'validation_summary_1',
          component: {class: "ValidationSummaryComponent"}
        },
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // assert
    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-info')!;
    expect(el.textContent).toContain('The form is valid.');
  });
  it('should contain one failed validation for the required text field that is empty', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
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
              value: '',
              validators: [
                {class: 'required'},
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: {class: "ValidationSummaryComponent"}
        },
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // assert
    const nativeEl: HTMLElement = fixture.nativeElement;
    console.log(nativeEl);
    const el = nativeEl.querySelector('div.alert-danger');
    expect(el?.innerHTML).toContain('<ul><li><!--container--><a href="#form-item-id-text-1-event">form-item-id-text-1-event</a>');
  });
  it('should have the expected lineage paths', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
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
              value: '',
              validators: [
                {class: 'required'},
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: {class: "ValidationSummaryComponent"}
        },
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // assert

    // Ensure expected validation failures show as links.
    const nativeEl: HTMLElement = fixture.nativeElement;
    console.log(nativeEl);
    const el = nativeEl.querySelector('div.alert-danger');
    expect(el?.innerHTML).toContain('<ul><li><!--container--><a href="#form-item-id-text-1-event">form-item-id-text-1-event</a>');

    // Ensure the expected failures have the expected lineage paths.
    const validationSummary = fixture.componentInstance.componentDefArr[1].component as ValidationSummaryFieldComponent;
    expect(validationSummary.allValidationErrorsDisplay).toEqual([
      {
        id: 'form-item-id-text-1-event',
        message: null,
        errors: [{class: 'required', message: "@validator-error-required", params: {}}],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['text_1_event'],
          angularComponents: ['text_1_event'],
          angularComponentsJsonPointer: '/text_1_event'
        }
      }
    ])    ;
  });
});
