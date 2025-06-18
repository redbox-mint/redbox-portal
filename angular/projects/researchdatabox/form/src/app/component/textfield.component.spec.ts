import {FormConfig} from '@researchdatabox/sails-ng-common';
import {TextFieldComponent} from "./textfield.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('TextFieldComponent', () => {
  let configService: any;
  let translationService: any;
  beforeEach(async () => {
    const testbedModuleResult = await createTestbedModule([
      TextFieldComponent,
    ]);
    configService = testbedModuleResult.configService;
    translationService = testbedModuleResult.translationService;
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(TextFieldComponent);
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
            name: 'text_1_for_the_form',
            class: 'TextFieldModel',
            config: {
              value: 'hello world!',
              defaultValue: 'hello world!'
            }
          },
          component: {
            class: 'TextFieldComponent'
          }
        }
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('input[type="text"]');
    expect(inputElement).toBeTruthy();
  });

});
