import {TestBed} from '@angular/core/testing';
import {FormComponent} from './form.component';
import {FormConfig} from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from './component/simpleinput.component';
import {createFormAndWaitForReady, createTestbedModule} from "./helpers.spec";

describe('FormComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      SimpleInputComponent,
    ]);
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(FormComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it('should render basic form config', async () => {
    const formConfig: FormConfig = {
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
              value: 'hello world!',
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
