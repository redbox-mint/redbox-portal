import {FormConfigFrame} from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from './simple-input.component';
import {RepeatableComponent, RepeatableElementLayoutComponent} from "./repeatable.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";


describe('RepeatableComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "RepeatableComponent": RepeatableComponent,
        "RepeatableElementLayoutComponent": RepeatableElementLayoutComponent,
      }
    });
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(RepeatableComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render the repeatable and array components', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          name: 'repeatable_1',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['hello world from repeatable!'],
              defaultValue: ['hello world from repeatable, default!']
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: "",
                model: {
                  class: 'SimpleInputModel',
                  config: {
                    defaultValue: 'hello world from elementTemplate!',
                  }
                },
                component: {
                  class: 'SimpleInputComponent'
                }
              },
            },
          },
          layout: {
            class: 'DefaultLayout',
            config: {
              label: 'Repeatable TextField with default wrapper defined',
              helpText: 'Repeatable component help text',
            }
          },
        },
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // assert
    const compiled = fixture.nativeElement as HTMLElement;
    let inputElements = compiled.querySelectorAll('input[type="text"]');
    expect(inputElements).toHaveSize(1);

    // add another element
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;
    await repeatable?.appendNewElement();

    // Wait until the change detection has completed.
    await fixture.whenStable();

    // check that another element was added
    inputElements = compiled.querySelectorAll('input[type="text"]');
    expect(inputElements).toHaveSize(2);

  });

});
