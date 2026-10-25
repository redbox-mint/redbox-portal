import { createFormAndWaitForReady, createTestbedModule, FormComponentProps } from "../helpers.spec";
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ValidationSummaryFieldComponent } from "./validation-summary.component";
import { FormConfigFrame, GroupFormComponentDefinitionFrame, TabFieldComponentConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from "./simple-input.component";
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { TabComponent } from './tab.component';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FormComponentEventType } from '../form-state/events/form-component-event.types';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { By } from '@angular/platform-browser';
import { TypeaheadModule, TypeaheadMatch } from 'ngx-bootstrap/typeahead';
import { TypeaheadInputComponent } from './typeahead-input.component';

const editableProps: FormComponentProps = {
  oid: 'oid-generated-validation-summary', recordType: 'rdmp', editMode: true,
  formName: 'default-1.0-draft', downloadAndCreateOnInit: false,
};

describe('ValidationSummaryFieldComponent', () => {
  let translationService: { translationMap: Record<string, string>; t: (key: string) => string };

  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "ValidationSummaryFieldComponent": ValidationSummaryFieldComponent,
        "SimpleInputComponent": SimpleInputComponent,
        "GroupFieldComponent": GroupFieldComponent,
        "RepeatableComponent": RepeatableComponent,
        "RepeatableElementLayoutComponent": RepeatableElementLayoutComponent,
        "TypeaheadInputComponent": TypeaheadInputComponent,
      },
      imports: { TypeaheadModule: TypeaheadModule.forRoot() }
    });

    translationService = TestBed.inject(TranslationService as any);
    translationService.translationMap = translationService.translationMap || {};
    translationService.translationMap['@dmpt-form-validation-summary-valid'] = 'The form is valid.';
    spyOn(translationService, 't').and.callFake((key: string) => translationService.translationMap[key] ?? key);
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });

  for (const repeatable of [false, true]) {
    for (const hydrated of [false, true]) {
      it(`refreshes required person errors after ${hydrated ? 'hydration' : 'lookup autofill'} and clear (${repeatable ? 'repeatable row' : 'group'})`, async () => {
        const initialPerson = hydrated ? { name: 'Selected Person', email: 'selected@example.invalid' } : { name: null, email: null };
        const person: GroupFormComponentDefinitionFrame = {
          name: 'person',
          component: { class: 'GroupComponent', config: { componentDefinitions: [
            { name: 'name', component: { class: 'TypeaheadInputComponent', config: {
              sourceType: 'static', valueMode: 'value', requireSelection: true,
              staticOptions: [{ label: 'Selected Person', value: 'Selected Person', raw: { email: 'selected@example.invalid' } }],
            } }, model: { class: 'TypeaheadInputModel', config: { value: null } } },
            { name: 'email', component: { class: 'SimpleInputComponent', config: {
              readonly: true, onItemSelect: { rawPath: 'email' },
            } }, model: { class: 'SimpleInputModel', config: {} } },
          ] } },
          model: { class: 'GroupModel', config: { value: initialPerson, validators: [
            { class: 'required', config: { anyOfFields: ['name'] }, message: 'Name required' },
            { class: 'required', config: { anyOfFields: ['email'] }, message: 'Email required' },
          ] } },
        };
        const formConfig: FormConfigFrame = {
          name: 'lookup-required-summary', enabledValidationGroups: ['all'],
          componentDefinitions: [
            repeatable ? {
              name: 'people', component: { class: 'RepeatableComponent', config: { elementTemplate: person } },
              model: { class: 'RepeatableModel', config: { value: [initialPerson] } },
            } : person,
            { name: 'validation_summary', component: { class: 'ValidationSummaryComponent' } },
          ],
        };
        const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
        const control = formComponent.form!.get(repeatable ? ['people', 0] : 'person')!;
        const root = fixture.nativeElement as HTMLElement;
        const lookup = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).componentInstance as TypeaheadInputComponent;
        if (!hydrated) {
          expect(control.invalid).toBeTrue();
          expect(root.querySelector('.validation-summary')?.textContent).toContain('Email required');

          fixture.ngZone!.run(() => lookup.onSelect({ item: { label: 'Selected Person', value: 'Selected Person', raw: { email: 'selected@example.invalid' } } } as TypeaheadMatch));
        }
        await fixture.whenStable();
        fixture.detectChanges();
        expect(control.getRawValue()).toEqual({ name: 'Selected Person', email: 'selected@example.invalid' });
        expect(control.valid).toBeTrue();
        expect(root.querySelector('.validation-summary')).toBeNull();

        const input = fixture.debugElement.query(By.directive(TypeaheadInputComponent)).nativeElement.querySelector('input') as HTMLInputElement;
        fixture.ngZone!.run(() => {
          input.value = 'Unmatched edit';
          input.dispatchEvent(new Event('input'));
        });
        fixture.detectChanges();
        await fixture.whenStable();
        fixture.ngZone!.run(() => input.dispatchEvent(new Event('blur')));
        await fixture.whenStable();
        fixture.detectChanges();
        expect(input.value).toBe('Selected Person');
        expect(control.getRawValue()).toEqual({ name: 'Selected Person', email: 'selected@example.invalid' });
        expect(root.querySelector('.validation-summary')).toBeNull();

        fixture.ngZone!.run(() => {
          input.value = '';
          input.dispatchEvent(new Event('input'));
        });
        // A real user input renders before blur. It must not rehydrate the old
        // selected name while the sibling-selection consumer clears the email.
        fixture.detectChanges();
        await fixture.whenStable();
        expect(input.value).toBe('');
        expect(control.getRawValue()).toEqual({ name: null, email: null });
        fixture.ngZone!.run(() => input.dispatchEvent(new Event('blur')));
        await fixture.whenStable();
        fixture.detectChanges();
        expect(control.getRawValue()).toEqual({ name: null, email: null });
        expect(control.invalid).toBeTrue();
        expect(root.querySelector('.validation-summary')?.textContent).toContain('Name required');
        expect(root.querySelector('.validation-summary')?.textContent).toContain('Email required');
      });
    }
  }

  it('hides inline and summary editing prompts in view mode while retaining invalid model state', async () => {
    const formConfig: FormConfigFrame = {
      name: 'readonly-invalid-record', enabledValidationGroups: ['all'],
      componentDefinitions: [
        { name: 'required_field', component: { class: 'SimpleInputComponent' },
          model: { class: 'SimpleInputModel', config: { value: '', validators: [{ class: 'required' }] } },
          layout: { class: 'DefaultLayout', config: { label: 'Required field' } } },
        { name: 'validation_summary', component: { class: 'ValidationSummaryComponent' } }
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { ...editableProps, editMode: false });
    const control = formComponent.form!.get('required_field')!;
    const root = fixture.nativeElement as HTMLElement;
    expect(control.hasError('required')).toBeTrue();
    expect(formComponent.form!.invalid).toBeTrue();
    expect(root.querySelector('.validation-summary')).toBeNull();
    expect(root.querySelector('redbox-field-error-summary')).toBeNull();

    formComponent.editMode.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(root.querySelector('.validation-summary [data-validation-error-class="required"]')).not.toBeNull();
    expect(root.querySelector('redbox-field-error-summary')?.textContent).toContain('@validator-error-required');
    expect(control.hasError('required')).toBeTrue();
    expect(formComponent.enabledValidationGroups).toEqual(['all']);
  });

  it('should reveal tabs implemented by a dynamically loaded component instance', () => {
    const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    const component = fixture.componentInstance as any;
    const selectTab = jasmine.createSpy('selectTab');
    spyOn(component, 'findComponentEntryByName').and.callFake((name: string) =>
      name === 'mainTab'
        ? {
            compConfigJson: { component: { class: 'TabComponent' } },
            component: { selectTab },
          }
        : undefined,
    );

    component.revealTabParents(['mainTab', 'storage', 'field']);

    expect(selectTab).toHaveBeenCalledOnceWith('storage');
  });

  it('should cancel a deferred validation refresh when destroyed', fakeAsync(() => {
    const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    const component = fixture.componentInstance as any;
    const queueRefreshSpy = spyOn(component, 'queueValidationErrorsRefresh');

    component.deferValidationErrorsRefresh();
    fixture.destroy();
    tick(0);

    expect(queueRefreshSpy).not.toHaveBeenCalled();
  }));

  it('should hide the valid banner by default when the form has no errors', async () => {
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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);

    // assert
    const nativeEl: HTMLElement = fixture.nativeElement;
    expect(nativeEl.querySelector('div.alert-info')).toBeNull();
  });

  it('should display "The form is valid." when showWhenValid is enabled', async () => {
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
          component: {
            class: "ValidationSummaryComponent",
            config: {
              showWhenValid: true
            }
          }
        },
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);

    const nativeEl: HTMLElement = fixture.nativeElement;
    const el = nativeEl.querySelector('div.alert-info');
    expect(el?.textContent).toContain('The form is valid.');
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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);

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
    expect(await validationSummary.allValidationErrorsDisplay()).toEqual([
      {
        id: 'form-item-id-text-1-event',
        message: null,
        errors: [{ class: 'required', message: "@validator-error-required", params: { required: true, actual: '' } }],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['text_1_event'],
          angularComponents: ['text_1_event'],
          angularComponentsJsonPointer: '/text_1_event',
          layout: ['text_1_event-layout'],
          layoutJsonPointer: '/text_1_event-layout'
        }
      }
    ]);
  });

  it('should translate validation summary ids when a language entry exists', async () => {
    translationService.translationMap['form-item-id-text-1-event'] = 'Translated Text Field';
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

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);

    const link = (fixture.nativeElement as HTMLElement).querySelector('a[data-validation-summary-id="form-item-id-text-1-event"]');
    expect(link?.textContent).toContain('Translated Text Field');
  });

  it('should not keep a stale required error for a hydrated repeatable field', async () => {
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
        {
          name: 'contributor_dmp_permissions',
          model: {
            class: 'RepeatableModel',
            config: {
              value: [
                { name: 'Existing User', email: 'existing@example.edu', role: 'View&Edit' }
              ],
              validators: [{ class: 'required' }]
            }
          },
          component: {
            class: 'RepeatableComponent',
            config: {
              elementTemplate: {
                name: '',
                model: {
                  class: 'SimpleInputModel',
                  config: {}
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
              label: '@dmpt-user-permissions-tab-dmp-permissions'
            }
          }
        },
      ]
    };

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    await fixture.whenStable();
    fixture.detectChanges();

    const validationSummary = fixture.componentInstance.componentDefArr[0].component as ValidationSummaryFieldComponent;
    const summaryErrors = await validationSummary.allValidationErrorsDisplay();
    expect(summaryErrors.map((summary) => summary.id)).not.toContain('form-item-id-contributor-dmp-permissions');
    expect(fixture.nativeElement.querySelector('[data-validation-summary-id="form-item-id-contributor-dmp-permissions"]')).toBeNull();
  });

  it('should remove a validation summary item when the field becomes valid while the form remains invalid', async () => {
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

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
    const validationSummary = fixture.componentInstance.componentDefArr[2].component as ValidationSummaryFieldComponent;
    const initialSummaryErrors = await validationSummary.allValidationErrorsDisplay();
    expect(initialSummaryErrors.map((summary) => summary.id)).toContain('form-item-id-text-1-event');
    expect(initialSummaryErrors.map((summary) => summary.id)).toContain('form-item-id-text-2-event');

    formComponent.form?.get('text_1_event')?.setValue('Valid project name');
    await fixture.whenStable();
    fixture.detectChanges();

    const updatedSummaryErrors = await validationSummary.allValidationErrorsDisplay();
    expect(formComponent.form?.status).toBe('INVALID');
    expect(updatedSummaryErrors.map((summary) => summary.id)).not.toContain('form-item-id-text-1-event');
    expect(updatedSummaryErrors.map((summary) => summary.id)).toContain('form-item-id-text-2-event');
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
    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const validationSummary = fixture.componentInstance.componentDefArr[2].component as ValidationSummaryFieldComponent;
    const summaryErrors = await validationSummary.allValidationErrorsDisplay();

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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);
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
            }
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
    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
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
            }
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

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
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

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
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

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
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
        }
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

    const { fixture: fixtureWithoutTabLabel } = await createFormAndWaitForReady(formConfigWithoutTabLabel, editableProps);
    const { fixture: fixtureWithTabLabel } = await createFormAndWaitForReady(formConfigWithTabLabel, editableProps);

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

    const { fixture } = await createFormAndWaitForReady(formConfig, editableProps);
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('.validation-summary-item a');
    expect(link).toBeTruthy();
    expect(link?.textContent?.trim()).toBe('Repeatable TextField with default wrapper defined');
  });

  it('should include form component errors', async () => {
    const formConfig: FormConfigFrame = {
      name: 'testing',
      debugValue: true,
      domElementType: 'form',
      defaultComponentConfig: {
        defaultComponentCssClasses: 'row',
      },
      editCssClasses: "redbox-form form",
      validators : [
        {
          class: 'pattern',
          config: {pattern: '[0-9]+', description: "must be a number"},
        },
        {
          class: 'different-values',
          config: {controlNames: ['text_1_event', 'text_2_event']},
          targetField: {formConfig: ['componentDefinitions', 0]},
        },
      ],
      componentDefinitions: [
        {
          name: 'text_1_event',
          model: {
            class: 'SimpleInputModel',
            config: {value: ''},
          },
          component: {class: 'SimpleInputComponent'}
        },
        {
          name: 'text_2_event',
          model: {
            class: 'SimpleInputModel',
            config: {value: '', validators: [{class: 'required'}]},
          },
          component: {class: 'SimpleInputComponent'}
        },
        {
          name: 'validation_summary_1',
          component: { class: "ValidationSummaryComponent" }
        },
      ]
    };
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, editableProps);

    // Trigger 'queueValidationErrorsRefresh' by making a change to the form.
    const control = fixture.componentInstance.componentDefArr[0].model?.formControl;
    control?.setValue('change value');
    control?.setValue('');
    formComponent.form!.markAsDirty();
    fixture.detectChanges();
    await fixture.whenStable();

    const summaryComponent = fixture.componentInstance.componentDefArr[2].component as ValidationSummaryFieldComponent;

    expect(await summaryComponent.allValidationErrorsDisplay()).toEqual([
      {
        id: null,
        message:  '@validator-error-form-level',
        errors: [
          {
            class: 'pattern', message: '@validator-error-pattern', params: {
              requiredPattern: '^[0-9]+$',
              description: 'must be a number',
              actual: '[object Object]',
            },
          }
        ],
        lineagePaths: {
          formConfig: [],
          dataModel: [],
          angularComponents: [],
          layout: [],
          angularComponentsJsonPointer: '',
          layoutJsonPointer: ''
        }
      },
      {
        id: 'form-item-id-text-2-event',
        message: null,
        errors: [{class: 'required', message: '@validator-error-required', params: {required: true, actual: ''}}],
        lineagePaths: {
          formConfig: ['componentDefinitions', 1],
          dataModel: ['text_2_event'],
          angularComponents: ['text_2_event'],
          layout: ['text_2_event-layout'],
          angularComponentsJsonPointer: '/text_2_event',
          layoutJsonPointer: '/text_2_event-layout'
        }
      },
      {
        id: 'form-item-id-text-1-event',
        message: null,
        errors: [
          {
            class: 'different-values', message: '@validator-error-different-values', params: {
              controlNames: ['text_1_event', 'text_2_event'], controlCount: 2, valueCount: 1, values: ['']
            },
            targetField: {formConfig: ['componentDefinitions', 0]},
          }
        ],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0],
          dataModel: ['text_1_event'],
          angularComponents: ['text_1_event'],
          layout: ['text_1_event-layout'],
          angularComponentsJsonPointer: '/text_1_event',
          layoutJsonPointer: '/text_1_event-layout'
        }
      },
    ]);

    const nativeEl: HTMLElement = fixture.nativeElement;
    const summaryItems = nativeEl.querySelectorAll('.validation-summary-item');
    expect(summaryItems.length).toEqual(3);
    expect(Array.from(summaryItems).map(l => l.textContent?.trim())).toEqual([
      '@validator-error-form-level@validator-error-pattern',
      'form-item-id-text-2-event@validator-error-required',
      'form-item-id-text-1-event@validator-error-different-values',
    ]);
  });
});
