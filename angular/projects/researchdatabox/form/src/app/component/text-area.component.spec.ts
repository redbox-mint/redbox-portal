import {FormConfig} from '@researchdatabox/sails-ng-common';
import {TextAreaComponent} from "./text-area.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('TextAreaComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      TextAreaComponent,
    ]);
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(TextAreaComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render Textarea component', async () => {

    const formConfig: FormConfigFrame = {
      debugValue: true,
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'textarea_test',
          model: {
            class: 'TextAreaModel',
            config: {
              defaultValue: 'Text area hello world test text'
            }
          },
          component: {
            class: 'TextAreaComponent'
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
