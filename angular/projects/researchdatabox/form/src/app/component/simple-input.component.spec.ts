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

});
