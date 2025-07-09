
import {FormConfig} from '@researchdatabox/sails-ng-common';
import {TextFieldComponent} from './textfield.component';
import {GroupFieldComponent} from "./groupfield.component";
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";


describe('GroupFieldComponent', () => {
  beforeEach(async () => {
    await createTestbedModule([
      TextFieldComponent,
      GroupFieldComponent,
    ]);
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(GroupFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render the group and child components', async () => {
    // arrange
    const formConfig: FormConfig = {
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        {
          // first group component
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayoutComponent',
            config: {
              label: 'GroupField label',
              helpText: 'GroupField help',
              labelRequiredStr: '*',
              cssClassesMap: {},
            }
          },
          model: {
            name: 'group_1_model',
            class: 'GroupFieldModel',
            config: {
              defaultValue: {},
            }
          },
          component: {
            class: 'GroupFieldComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'text_3',
                  layout: {
                    class: 'DefaultLayoutComponent',
                    config: {
                      label: 'TextField with default wrapper defined',
                      helpText: 'This is a help text',
                      labelRequiredStr: '*',
                      cssClassesMap: {},
                    }
                  },
                  model: {
                    class: 'TextFieldModel',
                    config: {
                      value: 'hello world 3!',
                    }
                  },
                  component: {
                    class: 'TextFieldComponent'
                  }
                },
                {
                  name: 'text_4',
                  model: {
                    class: 'TextFieldModel',
                    config: {
                      value: 'hello world 4!',
                      defaultValue: 'hello world 4!'
                    }
                  },
                  component: {
                    class: 'TextFieldComponent'
                  }
                },
                {
                  // second group component, nested in first group component
                  name: 'group_2_component',
                  layout: {
                    class: 'DefaultLayoutComponent',
                    config: {
                      label: 'GroupField 2 label',
                      helpText: 'GroupField 2 help',
                      labelRequiredStr: '*',
                      cssClassesMap: {},
                    }
                  },
                  model: {
                    name: 'group_2_model',
                    class: 'GroupFieldModel',
                    config: {
                      defaultValue: {},
                    }
                  },
                  component: {
                    class: 'GroupFieldComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'text_5',
                          layout: {
                            class: 'DefaultLayoutComponent',
                            config: {
                              label: 'TextField with default wrapper defined',
                              helpText: 'This is a help text',
                              labelRequiredStr: '*',
                              cssClassesMap: {},
                            }
                          },
                          model: {
                            class: 'TextFieldModel',
                            config: {
                              value: 'hello world 5!',
                            }
                          },
                          component: {
                            class: 'TextFieldComponent'
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            }
          }
        }
      ]
    };

    // act
    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);

    // assert
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElements = compiled.querySelectorAll('input[type="text"]');
    expect(inputElements).toHaveSize(3);
  });

});
