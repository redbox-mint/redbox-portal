import {TestBed} from '@angular/core/testing';
import {FormComponent} from './form.component';
import {FormConfigFrame} from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from './component/simple-input.component';
import {createFormAndWaitForReady, createTestbedModule} from "./helpers.spec";

describe('FormComponent', () => {
  beforeEach(async () => {
    await createTestbedModule(
      {
        declarations: {
          "SimpleInputComponent": SimpleInputComponent
        }
      });
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render basic form config', async () => {
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
              defaultValue: 'hello world!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect(inputElement).toBeTruthy();
  });

});
