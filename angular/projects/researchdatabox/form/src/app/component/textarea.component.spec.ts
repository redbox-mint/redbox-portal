import {FormConfig} from '@researchdatabox/sails-ng-common';
import {TextareaComponent} from "./textarea.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('TextareaComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      TextareaComponent,
    ]);
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(TextareaComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render Textarea component', async () => {

    const formConfig: FormConfig = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'textarea_test',
          model: {
            class: 'TextareaModel',
            config: {
              defaultValue: 'Text area hello world test text'
            }
          },
          component: {
            class: 'TextareaComponent'
          }
        }
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('textarea');
    expect((inputElement as HTMLTextAreaElement).value).toEqual('Text area hello world test text');
  });

});
