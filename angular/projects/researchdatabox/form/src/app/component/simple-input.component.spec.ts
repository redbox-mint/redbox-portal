import {FormConfigFrame} from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from "./simple-input.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('SimpleInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({declarations: {"SimpleInputComponent": SimpleInputComponent}});
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(SimpleInputComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render TextField component', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
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
              value: 'hello world saved!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect((inputElement as HTMLInputElement).value).toEqual('hello world saved!');
  });

  it('should not add is-valid class by default', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_default_valid_state',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'valid value'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    const {formComponent} = await createFormAndWaitForReady(formConfig);
    const inputComp = formComponent.componentDefArr[0]?.component as SimpleInputComponent | undefined;
    expect(inputComp).toBeTruthy();
    expect(inputComp?.showValidIndicator).toBeFalse();
    expect(inputComp?.showValidState).toBeFalse();
  });

  it('should add is-valid class when showValidIndicator is enabled', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_show_valid_state',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: 'valid value'
            }
          },
          component: {
            class: 'SimpleInputComponent',
            config: {
              showValidIndicator: true
            }
          }
        }
      ]
    };

    const {formComponent} = await createFormAndWaitForReady(formConfig);
    const inputComp = formComponent.componentDefArr[0]?.component as SimpleInputComponent | undefined;
    expect(inputComp).toBeTruthy();
    expect(inputComp?.showValidIndicator).toBeTrue();
    expect(inputComp?.showValidState).toBeTrue();
  });

});
