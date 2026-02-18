import { TestBed } from '@angular/core/testing';
import { ValidationSummaryFieldComponent } from "./validation-summary.component";
import { FormConfigFrame, TabFieldComponentConfigFrame } from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { SimpleInputComponent } from "./simple-input.component";
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { TabComponent } from './tab.component';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FormComponentEventType } from '../form-state/events/form-component-event.types';

describe('ValidationSummaryFieldComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "ValidationSummaryFieldComponent": ValidationSummaryFieldComponent,
        "SimpleInputComponent": SimpleInputComponent,
        "GroupFieldComponent": GroupFieldComponent,
        "RepeatableComponent": RepeatableComponent,
        "RepeatableElementLayoutComponent": RepeatableElementLayoutComponent,
      }
    });
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
  it('should display "The form is valid."', async () => {
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
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // assert
    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-info')!;
    expect(el.textContent).toContain('The form is valid.');
  });
  it('should contain one failed validation for the required text field that is empty', async () => {
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
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);

    // assert
    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-danger');
    const link = el?.querySelector('a[data-validation-summary-id="form-item-id-text-1-event"]');
    const errorItem = el?.querySelector('li[data-validation-error-class="required"][data-validation-error-message="@validator-error-required"]');
    expect(link).toBeTruthy();
    expect(link?.textContent).toContain('form-item-id-text-1-event');
    expect(errorItem).toBeTruthy();

    // Ensure the expected failures have the expected lineage paths.
    const validationSummary = fixture.componentInstance.componentDefArr[1].component as ValidationSummaryFieldComponent;
    expect(validationSummary.allValidationErrorsDisplay).toEqual([
      {
        id: 'form-item-id-text-1-event',
        message: null,
        errors: [{ class: 'required', message: "@validator-error-required", params: { required: true, actual: '' } }],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['text_1_event'],
          angularComponents: ['text_1_event'],
          angularComponentsJsonPointer: '/text_1_event'
        }
      }
    ]);
  });

  it('should produce unique error track keys across summaries for matching errors', async () => {
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
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'text_2_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [
                { class: 'required' },
              ]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture } = await createFormAndWaitForReady(formConfig);
    const validationSummary = fixture.componentInstance.componentDefArr[2].component as ValidationSummaryFieldComponent;
    const summaryErrors = validationSummary.allValidationErrorsDisplay;

    // assert
    expect(summaryErrors.length).toBe(2);
    const firstError = summaryErrors[0].errors[0];
    const secondError = summaryErrors[1].errors[0];
    expect(firstError.class).toBe(secondError.class);
    expect(firstError.message).toBe(secondError.message);

    const firstTrackKey = validationSummary.trackValidationError(firstError, 0);
    const secondTrackKey = validationSummary.trackValidationError(secondError, 0);
    expect(firstTrackKey).toEqual(secondTrackKey);
  });

  it('should publish field focus request event when clicking a validation summary link', async () => {
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
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {
              value: '',
              validators: [{ class: 'required' }]
            }
          },
          component: {
            class: 'SimpleInputComponent'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const eventBus = TestBed.inject(FormComponentEventBus);
    const publishSpy = spyOn(eventBus, 'publish').and.callThrough();
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('a[data-validation-summary-id="form-item-id-text-1-event"]') as HTMLAnchorElement | null;

    expect(link).toBeTruthy();
    link?.click();

    expect(publishSpy).toHaveBeenCalled();
    const focusRequest = publishSpy.calls.allArgs()
      .map(args => args[0] as any)
      .find((event) => event.type === FormComponentEventType.FIELD_FOCUS_REQUEST);
    expect(focusRequest).toBeTruthy();
    expect(focusRequest.fieldId).toBe('form-item-id-text-1-event');
    expect(focusRequest.targetElementId).toBe('form-item-id-text-1-event');
    expect(focusRequest.lineagePath).toEqual(['text_1_event']);
    expect(focusRequest.source).toBe('validation-summary');
    expect(focusRequest.sourceId).toBe(formComponent.eventScopeId);
  });

  it('should reveal hidden tab and focus field when clicking a validation summary link', async () => {
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
          name: 'main_tab',
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  name: 'tab1',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: true,
                      componentDefinitions: [
                        {
                          name: 'textfield_1',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: 'Tab one'
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  name: 'tab2',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: false,
                      componentDefinitions: [
                        {
                          name: 'textfield_2',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: '',
                              validators: [
                                { class: 'required' },
                              ]
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
            } as TabFieldComponentConfigFrame
          },
          layout: {
            class: 'TabLayout'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    // act
    const { fixture } = await createFormAndWaitForReady(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const mainTab = fixture.componentInstance.componentDefArr[0].component as TabComponent;
    expect(mainTab.activeTabId).toBe('tab1');

    const link = nativeEl.querySelector('a[data-validation-summary-id="form-item-id-textfield-2"]') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    link?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    // assert
    expect(mainTab.activeTabId).toBe('tab2');
    const inputInTab2 = nativeEl.querySelector('#tab2-tab-content input[type="text"]') as HTMLInputElement | null;
    expect(inputInTab2).toBeTruthy();
    expect(document.activeElement).toBe(inputInTab2);
  });

  it('should reveal hidden tab and focus repeatable field when clicking a validation summary link', async () => {
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
          name: 'main_tab',
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  name: 'tab1',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: true,
                      componentDefinitions: [
                        {
                          name: 'textfield_1',
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: 'Tab one'
                            }
                          },
                          component: {
                            class: 'SimpleInputComponent'
                          }
                        }
                      ]
                    }
                  }
                },
                {
                  name: 'tab2',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: false,
                      componentDefinitions: [
                        {
                          name: 'repeatable_textfield_1',
                          model: {
                            class: 'RepeatableModel',
                            config: {
                              value: ['']
                            }
                          },
                          component: {
                            class: 'RepeatableComponent',
                            config: {
                              elementTemplate: {
                                name: '',
                                model: {
                                  class: 'SimpleInputModel',
                                  config: {
                                    value: '',
                                    validators: [{ class: 'required' }]
                                  }
                                },
                                component: {
                                  class: 'SimpleInputComponent'
                                }
                              }
                            }
                          },
                          layout: {
                            class: 'DefaultLayout',
                            config: {
                              label: 'Repeatable TextField with default wrapper defined'
                            }
                          }
                        }
                      ]
                    }
                  }
                }
              ]
            } as TabFieldComponentConfigFrame
          },
          layout: {
            class: 'TabLayout'
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const mainTab = fixture.componentInstance.componentDefArr[0].component as TabComponent;
    expect(mainTab.activeTabId).toBe('tab1');

    const link = nativeEl.querySelector('a[data-validation-summary-id^="form-item-id-repeatable-textfield-1-"]') as HTMLAnchorElement | null;
    expect(link).toBeTruthy();
    link?.click();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(mainTab.activeTabId).toBe('tab2');
    const repeatableInput = nativeEl.querySelector('#tab2-tab-content input[type="text"]') as HTMLInputElement | null;
    expect(repeatableInput).toBeTruthy();
    expect(document.activeElement).toBe(repeatableInput);
  });

  it('should render grouped field labels with parent context in validation summary', async () => {
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
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayout',
            config: {
              label: 'Group label',
            },
          },
          model: {
            class: 'GroupModel',
            config: {
              defaultValue: {},
            },
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'text_1_event',
                  layout: {
                    class: 'DefaultLayout',
                    config: {
                      label: 'TextField with default wrapper defined',
                    },
                  },
                  model: {
                    class: 'SimpleInputModel',
                    config: {
                      value: '',
                      validators: [{ class: 'required' }]
                    }
                  },
                  component: {
                    class: 'SimpleInputComponent'
                  }
                },
              ]
            }
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('.validation-summary-item a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Group label - TextField with default wrapper defined');
  });

  it('should include nested group labels in validation summary labels', async () => {
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
          name: 'group_1_component',
          layout: {
            class: 'DefaultLayout',
            config: { label: 'People' },
          },
          model: {
            class: 'GroupModel',
            config: { defaultValue: {} },
          },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'group_2_component',
                  layout: {
                    class: 'DefaultLayout',
                    config: { label: '@dmpt-people-tab-record-administrator' },
                  },
                  model: {
                    class: 'GroupModel',
                    config: { defaultValue: {} },
                  },
                  component: {
                    class: 'GroupComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'email_field',
                          layout: {
                            class: 'DefaultLayout',
                            config: { label: 'Email' },
                          },
                          model: {
                            class: 'SimpleInputModel',
                            config: {
                              value: '',
                              validators: [{ class: 'required' }],
                            }
                          },
                          component: { class: 'SimpleInputComponent' }
                        },
                      ]
                    }
                  }
                },
              ]
            }
          }
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('.validation-summary-item a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('People - @dmpt-people-tab-record-administrator - Email');
  });

  it('should include tab labels only when includeTabLabel is true', async () => {
    const createTabComponentDefinition = (): any => ({
      name: 'main_tab',
      component: {
        class: 'TabComponent',
        config: {
          tabs: [
            {
              name: 'project_tab',
              layout: {
                class: 'TabContentLayout',
                config: { buttonLabel: 'Project' }
              },
              component: {
                class: 'TabContentComponent',
                config: {
                  componentDefinitions: [
                    {
                      name: 'project_name',
                      layout: {
                        class: 'DefaultLayout',
                        config: { label: 'Project name' }
                      },
                      model: {
                        class: 'SimpleInputModel',
                        config: {
                          value: '',
                          validators: [{ class: 'required' }]
                        }
                      },
                      component: { class: 'SimpleInputComponent' }
                    },
                  ]
                }
              }
            }
          ]
        } as TabFieldComponentConfigFrame
      },
      layout: { class: 'TabLayout' }
    });

    const formConfigWithoutTabLabel: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: { defaultComponentCssClasses: 'row' },
      editCssClasses: "redbox-form form",
      componentDefinitions: [
        createTabComponentDefinition(),
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const formConfigWithTabLabel: FormConfigFrame = {
      ...formConfigWithoutTabLabel,
      componentDefinitions: [
        createTabComponentDefinition(),
        {
          name: 'validation_summary_1',
          component: {
            class: "ValidationSummaryComponent",
            config: { includeTabLabel: true } as any
          }
        },
      ]
    };

    const { fixture: fixtureWithoutTabLabel } = await createFormAndWaitForReady(formConfigWithoutTabLabel);
    const { fixture: fixtureWithTabLabel } = await createFormAndWaitForReady(formConfigWithTabLabel);

    const linkWithoutTabLabel = (fixtureWithoutTabLabel.nativeElement as HTMLElement).querySelector('.validation-summary-item a');
    expect(linkWithoutTabLabel?.textContent?.trim()).toBe('Project name');

    const linkWithTabLabel = (fixtureWithTabLabel.nativeElement as HTMLElement).querySelector('.validation-summary-item a');
    expect(linkWithTabLabel?.textContent?.trim()).toBe('Project - Project name');
  });

  it('should use repeatable parent label instead of form-item-id when repeatable element has no own label', async () => {
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
          name: 'repeatable_textfield_1',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['not-matching-prefix'],
            },
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                model: {
                  class: 'SimpleInputModel',
                  config: {
                    validators: [
                      {
                        class: 'pattern',
                        config: {
                          pattern: /^prefix.*/,
                          description: 'must start with prefix',
                        },
                      },
                    ],
                  },
                },
                component: {
                  class: 'SimpleInputComponent',
                },
                layout: {
                  class: 'RepeatableElementLayout',
                },
              },
            },
          },
          layout: {
            class: 'DefaultLayout',
            config: {
              label: 'Repeatable TextField with default wrapper defined',
            },
          },
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('.validation-summary-item a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Repeatable TextField with default wrapper defined');
  });

});
