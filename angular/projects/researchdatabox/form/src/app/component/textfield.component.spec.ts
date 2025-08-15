import {FormConfig} from '@researchdatabox/sails-ng-common';
import {TextInputComponent} from "./textfield.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('TextInputComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      TextInputComponent,
    ]);
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(TextInputComponent);
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
            class: 'TextInputModel',
            config: {
              value: 'hello world saved!',
              defaultValue: 'hello world default!'
            }
          },
          component: {
            class: 'TextInputComponent'
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
