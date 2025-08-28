import {FormConfig} from '@researchdatabox/sails-ng-common';
import {ContentComponent} from "./content.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";

describe('ContentComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      ContentComponent,
    ]);
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(ContentComponent);
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
          component: {
            class: 'ContentComponent',
            config: {
              content: 'My first text block component!!!',
              template: '<h3>{{content}}</h3>'
            }
          }
        }
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // Now run your expectations
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElement = compiled.querySelector('h3');
    expect((inputElement as HTMLInputElement).value).toEqual('My first text block component!!!');
  });

});
