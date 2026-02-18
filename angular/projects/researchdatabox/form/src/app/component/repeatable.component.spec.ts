import {FormConfigFrame} from '@researchdatabox/sails-ng-common';
import {SimpleInputComponent} from './simple-input.component';
import {RepeatableComponent, RepeatableElementLayoutComponent} from "./repeatable.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import {FormComponentEventBus, FormComponentEventType} from "../form-state";


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
              value: ['hello world from repeatable!']
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
                    value: 'hello world from elementTemplate!',
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

    // Ensure lineage paths are as expected.
    expect(repeatable.formFieldCompMapEntries.length).toBe(2);
    expect(repeatable.formFieldCompMapEntries[0].lineagePaths).toEqual({
      angularComponents: ["repeatable_1", "0"],
      angularComponentsJsonPointer: "/repeatable_1/0",
      dataModel: ["repeatable_1", '0'],
      formConfig: ["componentDefinitions", 0, "component", "config", "elementTemplate"],
    });
  });

  it('should emit FORM_DEFINITION_CHANGED event when an element is appended', async () => {
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
              value: ['initial value']
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
                    value: 'element value',
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
              label: 'Repeatable TextField',
            }
          },
        },
      ]
    };

    // act - create the form
    const {fixture} = await createFormAndWaitForReady(formConfig);

    // Get the event bus and subscribe to FORM_DEFINITION_CHANGED events
    const eventBus = TestBed.inject(FormComponentEventBus);
    const emittedEvents: any[] = [];
    const subscription = eventBus.select$(FormComponentEventType.FORM_DEFINITION_CHANGED).subscribe(event => {
      emittedEvents.push(event);
    });

    // Get the repeatable component
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;

    // append a new element
    await repeatable?.appendNewElement();
    await fixture.whenStable();

    // assert that the FORM_DEFINITION_CHANGED event was emitted
    expect(emittedEvents.length).toBeGreaterThan(0);
    expect(emittedEvents[0].type).toBe(FormComponentEventType.FORM_DEFINITION_CHANGED);
    expect(emittedEvents[0].sourceId).toBe('repeatable_1');

    // cleanup
    subscription.unsubscribe();
  });

  it('should render repeatable wrapper classes', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_css',
      componentDefinitions: [
        {
          name: 'repeatable_css',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['one']
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
                    value: 'one',
                  }
                },
                component: {
                  class: 'SimpleInputComponent'
                }
              },
            },
          }
        },
      ]
    };
    const {fixture} = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelector('.rb-form-repeatable')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.rb-form-repeatable-item')).toBeTruthy();
  });

});
