
import { FormConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from './simple-input.component';
import { GroupFieldComponent } from "./group.component";
import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { TestBed } from "@angular/core/testing";
import { FormComponentEventBus, FormComponentEventType } from "../form-state";
import { TabContentComponent } from './tab.component';
import { TypeaheadModule } from 'ngx-bootstrap/typeahead';
import { TypeaheadInputComponent } from './typeahead-input.component';
import type { TypeaheadMatch } from 'ngx-bootstrap/typeahead';
import { TabComponent } from './tab.component';


describe('GroupFieldComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "SimpleInputComponent": SimpleInputComponent,
        "GroupFieldComponent": GroupFieldComponent,
        "TabContentComponent": TabContentComponent,
        "TabComponent": TabComponent,
        "TypeaheadInputComponent": TypeaheadInputComponent,
      },
      imports: {
        "TypeaheadModule": TypeaheadModule.forRoot(),
      },
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
      debugValue: false,
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
      layout: ["group_1_component-layout", "group_2_component-layout", "text_5-layout"],
      layoutJsonPointer: "/group_1_component-layout/group_2_component-layout/text_5-layout",
      dataModel: ["group_1_component", "group_2_component", "text_5"],
      formConfig: ["componentDefinitions", 0, "component", "config", "componentDefinitions", 2, "component", "config", "componentDefinitions", 0],
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

  it('should render rb-form-group container for child layout spacing', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing_group_css',
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
              componentDefinitions: []
            }
          }
        }
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig);
    const groupContainer = fixture.nativeElement.querySelector('.rb-form-group');
    expect(groupContainer).toBeTruthy();
  });

  it('reproduces non-repeatable group child changes across a reusable component boundary', async () => {
    const formConfig: FormConfigFrame = {
      name: 'group-child-change-repro',
      componentDefinitions: [
        {
          name: 'contributor',
          model: { class: 'GroupModel', config: { value: { name: 'Original', email: 'original@example.org' } } },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'reusable_fields',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'name',
                          model: { class: 'SimpleInputModel', config: {} },
                          component: { class: 'SimpleInputComponent' },
                        },
                        {
                          name: 'email',
                          model: { class: 'SimpleInputModel', config: {} },
                          component: { class: 'SimpleInputComponent' },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const eventBus = TestBed.inject(FormComponentEventBus);
    const allValueEvents: Array<{ fieldId: string; sourceId?: string; value?: unknown }> = [];
    const groupEvents: typeof allValueEvents = [];
    const subscription = eventBus.select$(FormComponentEventType.FIELD_VALUE_CHANGED).subscribe(event => {
      allValueEvents.push(event);
      if (event.fieldId.endsWith('/contributor')) {
        groupEvents.push(event);
      }
    });

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    expect(formComponent.form?.value).toEqual({
      contributor: { name: 'Original', email: 'original@example.org' },
    });
    expect(formComponent.form?.pristine).toBeTrue();
    // Form startup publishes one canonical initial-value event; control
    // attachment and hydration must not publish additional user-change events.
    expect(groupEvents).toHaveSize(1);
    expect(groupEvents[0].sourceId).toBe('form.definition.ready');
    expect(allValueEvents.every(event => event.sourceId === FormComponentEventType.FORM_DEFINITION_READY)).toBeTrue();
    const groupControl = formComponent.form?.get('contributor');
    expect(groupControl).toBeTruthy();
    let childChanges = 0;
    let groupChanges = 0;
    let rootChanges = 0;
    const childSub = groupControl!.get('name')!.valueChanges.subscribe(() => childChanges++);
    const groupSub = groupControl!.valueChanges.subscribe(() => groupChanges++);
    const rootSub = formComponent.form!.valueChanges.subscribe(() => rootChanges++);
    const eventCountBeforeEdit = allValueEvents.length;
    const initialInputs = fixture.nativeElement.querySelectorAll('input[type="text"]');
    expect(initialInputs[0].value).toBe('Original');
    expect(initialInputs[1].value).toBe('original@example.org');

    const nameInput = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    nameInput.value = 'Updated';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.form?.value).toEqual({
      contributor: { name: 'Updated', email: 'original@example.org' },
    });
    expect(formComponent.getDebugFormValue()).toEqual({
      contributor: { name: 'Updated', email: 'original@example.org' },
    });
    expect(formComponent.form?.dirty).toBeTrue();
    const broadcastGroupEvents = groupEvents.filter(event => event.sourceId === '*');
    expect(broadcastGroupEvents).toHaveSize(1);
    expect(broadcastGroupEvents[0].value).toEqual({ name: 'Updated', email: 'original@example.org' });
    expect([childChanges, groupChanges, rootChanges]).toEqual([1, 1, 1]);
    const editEvents = allValueEvents.slice(eventCountBeforeEdit);
    expect(editEvents.filter(event => event.sourceId === '*').map(event => event.fieldId)).toEqual([
      jasmine.stringMatching(/\/name$/), jasmine.stringMatching(/\/contributor$/),
    ]);
    expect(editEvents.filter(event => event.sourceId !== '*')).toHaveSize(2);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect([childChanges, groupChanges, rootChanges, allValueEvents.length]).toEqual([1, 1, 1, eventCountBeforeEdit + 4]);

    const emailInput = fixture.nativeElement.querySelectorAll('input[type="text"]')[1] as HTMLInputElement;
    emailInput.value = '';
    emailInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(formComponent.getDebugFormValue()).toEqual({
      contributor: { name: 'Updated', email: '' },
    });

    childSub.unsubscribe();
    groupSub.unsubscribe();
    rootSub.unsubscribe();
    subscription.unsubscribe();
  });

  it('serializes typeahead sibling autofill inside a non-repeatable group', async () => {
    const formConfig: FormConfigFrame = {
      name: 'group-typeahead-selection',
      componentDefinitions: [
        {
          name: 'contributor',
          model: { class: 'GroupModel', config: { value: { name: '', email: '' } } },
          component: {
            class: 'GroupComponent',
            config: {
              componentDefinitions: [
                {
                  name: 'reusable_fields',
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'name',
                          model: { class: 'TypeaheadInputModel', config: {} },
                          component: {
                            class: 'TypeaheadInputComponent',
                            config: {
                              sourceType: 'static',
                              staticOptions: [{ label: 'Ada Lovelace', value: 'Ada Lovelace', raw: { email: 'ada@example.org' } }],
                            },
                          },
                        },
                        {
                          name: 'email',
                          model: { class: 'SimpleInputModel', config: {} },
                          component: {
                            class: 'SimpleInputComponent',
                            config: { onItemSelect: { rawPath: 'email' } },
                          },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const typeahead = fixture.debugElement.query(
      node => node.componentInstance instanceof TypeaheadInputComponent
    ).componentInstance as TypeaheadInputComponent;
    const groupControl = formComponent.form!.get('contributor')!;
    let groupChanges = 0;
    let rootChanges = 0;
    let emailChanges = 0;
    const groupSub = groupControl.valueChanges.subscribe(() => groupChanges++);
    const rootSub = formComponent.form!.valueChanges.subscribe(() => rootChanges++);
    const emailSub = groupControl.get('email')!.valueChanges.subscribe(() => emailChanges++);
    const allValueEvents: Array<{ fieldId: string; sourceId?: string; value?: unknown }> = [];
    const groupEvents: typeof allValueEvents = [];
    const eventSub = TestBed.inject(FormComponentEventBus)
      .select$(FormComponentEventType.FIELD_VALUE_CHANGED)
      .subscribe(event => {
        allValueEvents.push(event);
        if (event.fieldId.endsWith('/contributor')) groupEvents.push(event);
      });

    typeahead.onSelect({
      item: { label: 'Ada Lovelace', value: 'Ada Lovelace', raw: { email: 'ada@example.org' } },
    } as TypeaheadMatch);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.getDebugFormValue()).toEqual({
      contributor: { name: 'Ada Lovelace', email: 'ada@example.org' },
    });
    expect(fixture.nativeElement.querySelectorAll('input[type="text"]')[0].value).toBe('Ada Lovelace');
    expect(fixture.nativeElement.querySelectorAll('input[type="text"]')[1].value).toBe('ada@example.org');
    expect(formComponent.form?.dirty).toBeTrue();
    const settledCounts = [emailChanges, groupChanges, rootChanges, allValueEvents.length];
    expect(groupControl.value).toEqual({ name: 'Ada Lovelace', email: 'ada@example.org' });
    expect(groupEvents.map(event => event.sourceId)).toEqual(['*', jasmine.stringMatching(/\/contributor$/)]);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect([emailChanges, groupChanges, rootChanges, allValueEvents.length]).toEqual(settledCounts);
    // Sibling autofill uses a silent control write. Its explicit notification
    // does not restart Angular propagation through the containing group.
    expect(groupChanges).toBe(1);
    expect(rootChanges).toBe(1);
    expect(emailChanges).toBe(0);
    groupSub.unsubscribe();
    rootSub.unsubscribe();
    emailSub.unsubscribe();
    eventSub.unsubscribe();
  });

  it('settles reciprocal field expressions inside a reusable group', async () => {
    const formConfig: FormConfigFrame = {
      name: 'group-reciprocal-expressions',
      componentDefinitions: [{
        name: 'contributor',
        model: { class: 'GroupModel', config: { value: { name: '', email: '' } } },
        component: { class: 'GroupComponent', config: { componentDefinitions: [{
          name: 'reusable_fields',
          component: { class: 'TabContentComponent', config: { componentDefinitions: [
            {
              name: 'name',
              model: { class: 'SimpleInputModel', config: {} },
              component: { class: 'SimpleInputComponent' },
              expressions: [{ name: 'copy-email-to-name', config: {
                conditionKind: 'jsonpointer',
                condition: '/contributor/reusable_fields/email::field.value.changed',
                target: 'model.value',
                template: '',
                runOnFormReady: false,
              } }],
            },
            {
              name: 'email',
              model: { class: 'SimpleInputModel', config: {} },
              component: { class: 'SimpleInputComponent' },
              expressions: [{ name: 'copy-name-to-email', config: {
                conditionKind: 'jsonpointer',
                condition: '/contributor/reusable_fields/name::field.value.changed',
                target: 'model.value',
                template: '',
                runOnFormReady: false,
              } }],
            },
          ] } },
        }] } },
      }],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    const group = formComponent.form!.get('contributor')!;
    const events: string[] = [];
    const busSub = TestBed.inject(FormComponentEventBus)
      .select$(FormComponentEventType.FIELD_VALUE_CHANGED)
      .subscribe(event => { if (event.sourceId === '*') events.push(event.fieldId); });
    let groupChanges = 0;
    const groupSub = group.valueChanges.subscribe(() => groupChanges++);

    const nameInput = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    nameInput.value = 'Ada';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(group.value).toEqual({ name: 'Ada', email: 'Ada' });
    expect(groupChanges).toBe(1);
    expect(events).toHaveSize(2);
    const settledEvents = events.length;
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(events.length).toBe(settledEvents);
    expect(groupChanges).toBe(1);
    busSub.unsubscribe();
    groupSub.unsubscribe();
  });

  it('keeps a reusable tab group as the canonical form value when another tab has a scalar carrier', async () => {
    const formConfig: FormConfigFrame = {
      name: 'group-reusable-tab-carrier',
      componentDefinitions: [
        {
          name: 'mainTab',
          component: {
            class: 'TabComponent',
            config: {
              tabs: [
                {
                  name: 'people',
                  layout: { class: 'TabContentLayout', config: { buttonLabel: 'People' } },
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      selected: true,
                      componentDefinitions: [
                        {
                          name: 'contributor',
                          model: { class: 'GroupModel', config: { value: { name: 'Original', email: 'original@example.org' } } },
                          component: {
                            class: 'GroupComponent',
                            config: {
                              componentDefinitions: [
                                {
                                  name: 'reusable_fields',
                                  component: {
                                    class: 'TabContentComponent',
                                    config: {
                                      componentDefinitions: [
                                        {
                                          name: 'name',
                                          model: { class: 'SimpleInputModel', config: {} },
                                          component: { class: 'SimpleInputComponent' },
                                        },
                                        {
                                          name: 'email',
                                          model: { class: 'SimpleInputModel', config: {} },
                                          component: { class: 'SimpleInputComponent' },
                                        },
                                      ],
                                    },
                                  },
                                },
                              ],
                            },
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  name: 'compliance',
                  layout: { class: 'TabContentLayout', config: { buttonLabel: 'Compliance' } },
                  component: {
                    class: 'TabContentComponent',
                    config: {
                      componentDefinitions: [
                        {
                          name: 'contributor',
                          model: { class: 'SimpleInputModel', config: { value: '' } },
                          component: { class: 'SimpleInputComponent' },
                        },
                      ],
                    },
                  },
                },
              ],
            },
          },
        },
      ],
    };

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig);
    expect(formComponent.form?.value.contributor).toEqual({ name: 'Original', email: 'original@example.org' });
    expect(formComponent.form?.pristine).toBeTrue();

    const nameInput = fixture.nativeElement.querySelector('input[type="text"]') as HTMLInputElement;
    nameInput.value = 'Updated';
    nameInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(formComponent.getDebugFormValue()['contributor']).toEqual({
      name: 'Updated',
      email: 'original@example.org',
    });
    expect(formComponent.form?.dirty).toBeTrue();
  });
});
