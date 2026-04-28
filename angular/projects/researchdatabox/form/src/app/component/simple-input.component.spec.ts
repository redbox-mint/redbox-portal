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

  it('should be possible to disable the form control', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'text_1',
          model: {class: 'SimpleInputModel', config: {value: 'valid value'}},
          component: {class: 'SimpleInputComponent', config: {}}
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const inputComp = formComponent.componentDefArr[0]?.component as SimpleInputComponent | undefined;
    expect(inputComp?.isDisabled).toBeFalse();
    expect(formComponent.form?.value).toEqual({text_1: 'valid value'});

    inputComp?.setDisabled(true, {onlySelf: true});

    await fixture.whenStable();
    fixture.detectChanges();

    expect(inputComp?.isDisabled).toBeTrue();
    expect(formComponent.form?.controls['text_1']?.disabled).toEqual(true);
    expect(formComponent.form?.controls['text_1']).toEqual(inputComp?.model?.formControl);

    // The form by default would be disabled when all the controls in the form are disabled.
    // However, by passing 'onlySelf: true', the form remains enabled.
    expect(formComponent.form?.disabled).toBeFalse();
    // TODO: We expect the form value to not include the value for the disabled control, but 'text_1' is still present.
    //       This is because if all a control's nested controls are disabled, then all the control values are included.
    //       This is the case regardless of whether the parent control itself is disabled or enabled.
    // expect(formComponent.form?.value).toEqual({});

    inputComp?.setDisabled(false);
    expect(inputComp?.isDisabled).toBeFalse();
    expect(formComponent.form?.value).toEqual({text_1: 'valid value'});
  });
});
