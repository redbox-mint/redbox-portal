
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './simple-input.component';
import { GroupFieldComponent } from "./group.component";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { TestBed } from "@angular/core/testing";


describe('GroupFieldComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "GroupFieldComponent": GroupFieldComponent,
      }
    });
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(GroupFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should render the group and child components', async () => {
    // arrange
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
          // first group component
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayout',
            config: {
              label: 'GroupField label',
              helpText: 'GroupField help',
              labelRequiredStr: '*',
              cssClassesMap: {},
            }
          },
          model: {
            class: 'GroupModel',
            config: {
              value: {},
            }
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'text_3',
                  layout: {
                    class: 'DefaultLayout',
                    config: {
                      label: 'TextField with default wrapper defined',
                      helpText: 'This is a help text',
                      labelRequiredStr: '*',
                      cssClassesMap: {},
                    }
                  },
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: 'hello world 3!',
                    }
                  },
                  component: {
                    class: 'SimpleInputComponent'
                  }
                },
                {
                  name: 'text_4',
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: 'hello world 4!'
                    }
                  },
                  component: {
                    class: 'SimpleInputComponent'
                  }
                },
                {
                  // second group component, nested in first group component
                  name: 'group_2_component',
                  layout: {
                    class: 'DefaultLayout',
                    config: {
                      label: 'GroupField 2 label',
                      helpText: 'GroupField 2 help',
                      labelRequiredStr: '*',
                      cssClassesMap: {},
                    }
                  },
                  model: {
                    class: 'GroupModel',
                    config: {
                      value: {},
                    }
                  },
                  component: {
                    class: 'GroupComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'text_5',
                          layout: {
                            class: 'DefaultLayout',
                            config: {
                              label: 'TextField with default wrapper defined',
                              helpText: 'This is a help text',
                              labelRequiredStr: '*',
                              cssClassesMap: {},
                            }
                          },
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: 'hello world 5!',
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // assert
    // Ensure all expected html elements were created.
    const compiled = fixture.nativeElement as HTMLElement;
    const inputElements = compiled.querySelectorAll('input[type="text"]');
    expect(inputElements).toHaveSize(3);

    // Check a sample lineage path
    const group = fixture.componentInstance.componentDefArr[0].component as GroupFieldComponent;
    expect(group.formFieldCompMapEntries.length).toBe(3);

    const group2 = group.formFieldCompMapEntries[2].component;
    expect(group2?.formFieldCompMapEntries?.length).toBe(1);
    expect(group2?.formFieldCompMapEntries[0]?.lineagePaths).toEqual({
      angularComponents: ["group_1_component", "group_2_component", "text_5"],
      angularComponentsJsonPointer: "/group_1_component/group_2_component/text_5",
      dataModel: ["group_1_component", "group_2_component", "text_5"],
      formConfig: ["componentDefinitions", 0, "component", "config", "componentDefinitions", 2],
    });
  });

  it('should disable the form control if disabled is true in config', async () => {
    // arrange
    const formConfig: FormConfigFrame = {
      name: 'testing_disabled',
      componentDefinitions: [
        {
          name: 'disabled_group',
          model: {
            class: 'GroupModel',
            config: {
              disabled: true,
              value: {},
            }
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'child_text',
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: 'child value'
                    }
                  },
                  component: {
                    class: 'SimpleInputComponent'
                  }
                }
              ]
            }
          }
        }
      ]
    };

    // act
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // assert
    const groupModel = fixture.componentInstance.componentDefArr[0].model;
    expect(groupModel?.formControl?.disabled).toBe(true);
    expect(formComponent.form?.contains('disabled_group') ?? false).toBe(false);
  });

  it('should not register disabled child controls in parent group form control', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_disabled_child',
      componentDefinitions: [
        {
          name: 'parent_group',
          model: {
            class: 'GroupModel',
            config: {
              value: {},
            }
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'disabled_child_text',
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: 'child value',
                      disabled: true,
                    }
                  },
                  component: {
                    class: 'SimpleInputComponent'
                  }
                }
              ]
            }
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);

    const groupModel = fixture.componentInstance.componentDefArr[0].model;
    expect(groupModel?.formControl?.get('disabled_child_text')).toBeNull();
  });
});
