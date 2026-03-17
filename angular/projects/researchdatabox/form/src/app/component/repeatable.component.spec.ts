import {FormConfigFrame} from '@researchdatabox/sails-ng-common';
import {ContentComponent} from './content.component';
import {SimpleInputComponent} from './simple-input.component';
import {RepeatableComponent, RepeatableElementLayoutComponent} from "./repeatable.component";
import {GroupFieldComponent} from './group.component';
import {createFormAndWaitForReady, createTestbedModule} from "../helpers.spec";
import {fakeAsync, flushMicrotasks, TestBed, tick} from "@angular/core/testing";
import {FormComponentEventBus, FormComponentEventType} from "../form-state";


describe('RepeatableComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "ContentComponent": ContentComponent,
        "RepeatableComponent": RepeatableComponent,
        "RepeatableElementLayoutComponent": RepeatableElementLayoutComponent,
        "GroupFieldComponent": GroupFieldComponent,
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
      debugValue: false,
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
      layout: ["repeatable_1-layout", "0"],
      layoutJsonPointer: "/repeatable_1-layout/0",
      dataModel: ["repeatable_1", '0'],
      formConfig: ["componentDefinitions", 0, "component", "config", "elementTemplate"],
    });
  });

  it('should emit FORM_DEFINITION_CHANGED event when an element is appended', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: false,
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
    const eventBus = TestBed.inject(FormComponentEventBus) as FormComponentEventBus;
    const emittedEvents: any[] = [];
    const subscription = eventBus.select$(FormComponentEventType.FORM_DEFINITION_CHANGED).subscribe((event: unknown) => {
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

  it('should mark the main form dirty when a repeatable item is removed', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_delete_dirty',
      componentDefinitions: [
        {
          name: 'repeatable_delete_dirty',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['one', 'two']
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
                    value: 'one',
                  }
                },
                component: {
                  class: 'SimpleInputComponent'
                }
              },
            },
          },
        },
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;
    const repeatableEntries = (repeatable as any).compDefMapEntries as any[];
    const eventBus = TestBed.inject(FormComponentEventBus) as FormComponentEventBus;
    const emittedEvents: any[] = [];
    const subscription = eventBus.select$(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST).subscribe((event: unknown) => {
      emittedEvents.push(event);
    });

    expect(formComponent.form?.dirty).toBeFalse();
    (repeatable as any).removeElementFn(repeatableEntries[0])();
    await fixture.whenStable();

    expect(emittedEvents.length).toBe(1);
    expect(emittedEvents[0].type).toBe(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST);
    expect(emittedEvents[0].fieldId).toBe('repeatable_delete_dirty');
    expect(emittedEvents[0].reason).toBe('repeatable.element.removed');
    expect(formComponent.form?.dirty).toBeTrue();
    expect(formComponent.form?.pristine).toBeFalse();
    subscription.unsubscribe();
  });

  it('should replace repeatable elements silently when emitEvent is false', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_silent_replace',
      componentDefinitions: [
        {
          name: 'repeatable_silent_replace',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['one', 'two']
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
                  }
                },
                component: {
                  class: 'SimpleInputComponent'
                }
              },
            },
          },
        },
      ]
    };

    const {fixture, formComponent} = await createFormAndWaitForReady(formConfig);
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;
    const eventBus = TestBed.inject(FormComponentEventBus) as FormComponentEventBus;
    const definitionEvents: any[] = [];
    const dirtyEvents: any[] = [];
    const definitionSub = eventBus.select$(FormComponentEventType.FORM_DEFINITION_CHANGED).subscribe((event: unknown) => {
      definitionEvents.push(event);
    });
    const dirtySub = eventBus.select$(FormComponentEventType.FORM_STATUS_DIRTY_REQUEST).subscribe((event: unknown) => {
      dirtyEvents.push(event);
    });

    expect(formComponent.form?.dirty).toBeFalse();

    await repeatable.model?.formControl?.setCustomValue(['replacement'], { emitEvent: false });
    await fixture.whenStable();

    expect(repeatable.formFieldCompMapEntries.length).toBe(1);
    expect(repeatable.model?.getValue()).toEqual(['replacement']);
    expect(definitionEvents).toEqual([]);
    expect(dirtyEvents).toEqual([]);
    expect(formComponent.form?.dirty).toBeFalse();

    definitionSub.unsubscribe();
    dirtySub.unsubscribe();
  });

  it('should throw a descriptive error when setCustomValue is used without a custom setter and the value length does not match', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_set_custom_value_fallback',
      componentDefinitions: [
        {
          name: 'repeatable_set_custom_value_fallback',
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
                name: '',
                model: {
                  class: 'SimpleInputModel',
                  config: {
                    value: '',
                  }
                },
                component: {
                  class: 'SimpleInputComponent'
                }
              },
            },
          },
        },
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;
    const control = repeatable.model?.formControl as any;

    control.customValueSetter = undefined;

    await expectAsync(control.setCustomValue(['one', 'two'])).toBeRejectedWithError(
      'RepeatableFormArray.setCustomValue requires 1 values to match the current control count when no customValueSetter is registered, but received 2.'
    );
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
              value: ['one', 'two']
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

  it('should support zero-row repeatables with hidden add button', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_zero_rows',
      componentDefinitions: [
        {
          name: 'repeatable_zero_rows',
          model: {
            class: 'RepeatableModel',
            config: {
              value: []
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              addButtonShow: false,
              allowZeroRows: true,
              hideWhenZeroRows: true,
              elementTemplate: {
                name: "",
                model: {
                  class: 'SimpleInputModel',
                  config: {
                    value: '',
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
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelectorAll('input[type="text"]')).toHaveSize(0);
    expect(compiled.querySelector('.rb-form-repeatable__add')).toBeFalsy();
  });

  it('should keep migrated legacy vocab repeatables ready when initialising nested group rows', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_legacy_vocab',
      componentDefinitions: [
        {
          name: 'dc:subject_anzsrc:for-2008',
          model: {
            class: 'RepeatableModel',
            config: {
              value: [
                {
                  'rdf:resource': 'http://purl.org/asc/1297.0/2008/for/060701',
                  type: 'for',
                  name: '060701 - Phycology (incl. Marine Grasses)',
                  label: 'Phycology (incl. Marine Grasses)',
                  notation: '060701',
                  geneaology: ['06', '0607']
                }
              ]
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              addButtonShow: false,
              allowZeroRows: true,
              hideWhenZeroRows: true,
              elementTemplate: {
                name: '',
                component: {
                  class: 'GroupComponent',
                  config: {
                    componentDefinitions: [
                      {
                        name: 'name',
                        component: { class: 'SimpleInputComponent' },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'rdf:resource',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'type',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'label',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'notation',
                        component: { class: 'SimpleInputComponent', config: { type: 'hidden' } },
                        model: { class: 'SimpleInputModel', config: {} },
                      },
                      {
                        name: 'geneaology',
                        component: {
                          class: 'RepeatableComponent',
                          config: {
                            addButtonShow: false,
                            allowZeroRows: true,
                            hideWhenZeroRows: true,
                            visible: false,
                            elementTemplate: {
                              name: '',
                              component: {
                                class: 'SimpleInputComponent',
                                config: { type: 'hidden' },
                              },
                              model: {
                                class: 'SimpleInputModel',
                                config: {},
                              },
                            },
                          },
                        },
                        model: {
                          class: 'RepeatableModel',
                          config: {},
                        },
                      },
                    ],
                  },
                },
                model: {
                  class: 'GroupModel',
                  config: {},
                },
              },
            },
          },
        },
      ]
    };

    const {fixture} = await createFormAndWaitForReady(formConfig);
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;

    expect(repeatable.status()).toBe('READY');
    expect(repeatable.viewInitialised()).toBeTrue();
    expect(repeatable.model?.getValue()).toEqual([
      jasmine.objectContaining({
        name: '060701 - Phycology (incl. Marine Grasses)',
        notation: '060701',
        geneaology: ['06', '0607']
      })
    ]);
  });

  it('should render shared field error summary for repeatable element validation errors', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_validation',
      componentDefinitions: [
        {
          name: 'repeatable_validation',
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
                name: "",
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
            },
          }
        },
      ]
    };
    const {fixture} = await createFormAndWaitForReady(formConfig);
    expect(fixture.nativeElement.querySelector('redbox-field-error-summary')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.rb-form-field-error-summary')).toBeTruthy();
  });

  it('hides remove button when only one repeatable item exists', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_single_item_remove',
      componentDefinitions: [
        {
          name: 'repeatable_single',
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

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const removeButtons = fixture.nativeElement.querySelectorAll('.rb-form-repeatable-item__remove');
    expect(removeButtons.length).toBe(0);
  });

  it('shows remove buttons when repeatable item count is greater than one', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_multiple_item_remove',
      componentDefinitions: [
        {
          name: 'repeatable_multi',
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

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;
    await repeatable.appendNewElement('two');
    await fixture.whenStable();

    const removeButtons = fixture.nativeElement.querySelectorAll('.rb-form-repeatable-item__remove');
    expect(removeButtons.length).toBe(2);
  });

  it('hides remove buttons again after removing back to one item', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_remove_back_to_one',
      componentDefinitions: [
        {
          name: 'repeatable_back_to_one',
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

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;
    await repeatable.appendNewElement('two');
    await fixture.whenStable();

    const removeButton = fixture.nativeElement.querySelector('.rb-form-repeatable-item__remove') as HTMLButtonElement;
    removeButton.click();
    await fixture.whenStable();

    const removeButtons = fixture.nativeElement.querySelectorAll('.rb-form-repeatable-item__remove');
    expect(removeButtons.length).toBe(0);
  });

  it('shows remove button on single row when allowZeroRows is true', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_allow_zero_single_remove',
      componentDefinitions: [
        {
          name: 'repeatable_allow_zero',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['one']
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              allowZeroRows: true,
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

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const removeButtons = fixture.nativeElement.querySelectorAll('.rb-form-repeatable-item__remove');
    expect(removeButtons.length).toBe(1);
  });

  it('hides repeatable rows dynamically when the final row is deleted', fakeAsync(() => {
    const formConfig: FormConfigFrame = {
      name: 'testing_repeatable_dynamic_hide',
      componentDefinitions: [
        {
          name: 'repeatable_dynamic_hide',
          model: {
            class: 'RepeatableModel',
            config: {
              value: ['one']
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              addButtonShow: false,
              allowZeroRows: true,
              hideWhenZeroRows: true,
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
          },
        },
      ]
    };

    let fixture: any;
    createFormAndWaitForReady(formConfig).then(result => {
      fixture = result.fixture;
    });
    flushMicrotasks();
    tick();

    let rowsContainer = fixture.nativeElement.querySelector('.rb-form-repeatable__items') as HTMLElement;
    expect(rowsContainer).toBeTruthy();
    expect(rowsContainer.classList.contains('d-none')).toBeFalse();

    const repeatable = fixture.componentInstance.componentDefArr[0].component as RepeatableComponent;
    repeatable.appendNewElement('two').then(() => {
      tick();
      flushMicrotasks();
      fixture.detectChanges();
    });
    tick();
    flushMicrotasks();

    let repeatableEntries = (repeatable as any).compDefMapEntries as any[];
    while (repeatableEntries.length > 0) {
      (repeatable as any).removeElementFn(repeatableEntries[0])();
      tick();
      flushMicrotasks();
      fixture.detectChanges();
      tick();
      repeatableEntries = (repeatable as any).compDefMapEntries as any[];
    }

    rowsContainer = fixture.nativeElement.querySelector('.rb-form-repeatable__items') as HTMLElement;
    expect(rowsContainer.classList.contains('d-none')).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('.rb-form-repeatable-item').length).toBe(0);
  }));

});
