import {FormConfig} from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from "./textfield.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('SimpleInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      SimpleInputComponent,
    ]);
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(SimpleInputComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render TextField component', async () => {
    // arrange
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
              defaultValue: 'hello world saved!'
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        }
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect((inputElement as HTMLInputElement).value).toEqual('hello world saved!');
  });

});
