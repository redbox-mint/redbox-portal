import { createFormAndWaitForReady, createTestbedModule } from "../helpers.spec";
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { ValidationSummaryFieldComponent } from "./validation-summary.component";
import { FormConfigFrame, TabFieldComponentConfigFrame, ValidationSummaryFieldComponentConfigFrame } from '@researchdatabox/sails-ng-common';
import { SimpleInputComponent } from "./simple-input.component";
import { GroupFieldComponent } from './group.component';
import { RepeatableComponent, RepeatableElementLayoutComponent } from './repeatable.component';
import { TabComponent } from './tab.component';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { FormComponentEventType } from '../form-state/events/form-component-event.types';
import { TranslationService } from '@researchdatabox/portal-ng-common';

describe('ValidationSummaryFieldComponent', () => {
  let translationService: { translationMap: Record<string, string>; t: (key: string) => string };

  it('opens a closed accordion panel and focuses its invalid field from the summary', async () => {
    const config: FormConfigFrame = { name: 'closed-panel-focus', componentDefinitions: [
      { name: 'panels', layout: { class: 'AccordionLayout' }, component: { class: 'AccordionComponent', config: { startingOpenMode: 'first-open', panels: [
        { name: 'intro', layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'Introduction' } }, component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [] } } },
        { name: 'details', layout: { class: 'AccordionPanelLayout', config: { buttonLabel: 'Details' } }, component: { class: 'AccordionPanelComponent', config: { componentDefinitions: [
          { name: 'required', layout: { class: 'DefaultLayout', config: { label: 'Required detail' } }, model: { class: 'SimpleInputModel', config: { value: '', validators: [{ class: 'required' }] } }, component: { class: 'SimpleInputComponent' } },
        ] } } },
      ] } } },
      { name: 'errors', component: { class: 'ValidationSummaryComponent' } },
    ] };
    const { fixture } = await createFormAndWaitForReady(config, { editMode: true });
    const nativeEl: HTMLElement = fixture.nativeElement;
    const button = Array.from(nativeEl.querySelectorAll('button[aria-expanded]')).find(element => element.textContent?.includes('Details'));
    expect(button?.getAttribute('aria-expanded')).toBe('false');
    nativeEl.querySelector<HTMLAnchorElement>('a[data-validation-summary-id]')?.click();
    await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(nativeEl.querySelector('input'));
  });

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

  describe('deferErrorsOnNewRecord', () => {
    async function createDeferredForm(
      config: ValidationSummaryFieldComponentConfigFrame = { deferErrorsOnNewRecord: true },
      props: { oid?: string } = { oid: '' },
      required = true,
    ) {
      return createFormAndWaitForReady({
        name: 'defer-new-record',
        componentDefinitions: [
          {
            name: 'title',
            model: { class: 'SimpleInputModel', config: { value: '', validators: required ? [{ class: 'required' }] : [] } },
            component: { class: 'SimpleInputComponent' },
            layout: { class: 'DefaultLayout', config: { label: 'Title' } },
          },
          {
            name: 'optional',
            model: { class: 'SimpleInputModel', config: { value: '' } },
            component: { class: 'SimpleInputComponent' },
          },
          {
            name: 'summary',
            component: { class: 'ValidationSummaryComponent', config },
          },
        ],
      }, { editMode: true, ...props });
    }

    function expectTitleError(root: HTMLElement): void {
      expect(root.querySelector('.validation-summary')).not.toBeNull();
      expect(root.querySelector('.validation-summary-item a')?.textContent).toBe('Title');
      expect(root.querySelector('[data-validation-error-class="required"]')).not.toBeNull();
    }

    it('T1: hides an untouched new record summary while retaining its validation errors', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      expect(formComponent.form!.pristine).toBeTrue();
      expect(formComponent.form!.untouched).toBeTrue();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      const summary = formComponent.componentDefArr[2].component as ValidationSummaryFieldComponent;
      const errors = await summary.allValidationErrorsDisplay();
      expect(errors.length).toBe(1);
      expect(errors[0].errors.some(error => error.class === 'required')).toBeTrue();
    });

    it('T2: reveals the required field after a control is touched without a value change', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });

    it('T3: reveals the required field after editing a different, optional field', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      const optional = formComponent.form!.get('optional')!;
      optional.setValue('An edit');
      optional.markAsDirty();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });

    for (const [testId, eventType] of [
      ['T4', FormComponentEventType.FORM_SAVE_REQUESTED],
      ['T5', FormComponentEventType.FORM_SAVE_FAILURE],
    ] as const) {
      it(`${testId}: reveals errors on ${eventType}`, async () => {
        const { fixture, formComponent } = await createDeferredForm();
        // A requested save must reveal errors even if no failure event follows.
        spyOn(formComponent, 'saveForm').and.resolveTo();
        expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
        TestBed.inject(FormComponentEventBus).publish({ type: eventType });
        await fixture.whenStable();
        expectTitleError(fixture.nativeElement);
      });
    }

    for (const eventType of [
      FormComponentEventType.FORM_SAVE_REQUESTED,
      FormComponentEventType.FORM_SAVE_FAILURE,
    ] as const) {
      it(`ignores ${eventType} from another form and accepts its own scope`, async () => {
        const { fixture, formComponent } = await createDeferredForm();
        spyOn(formComponent, 'saveForm').and.resolveTo();
        const bus = TestBed.inject(FormComponentEventBus);
        bus.publish({ type: eventType, formScopeId: 'another-form' });
        await fixture.whenStable();
        fixture.detectChanges();
        expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
        expect(formComponent.form!.pristine).toBeTrue();
        expect(formComponent.form!.untouched).toBeTrue();

        bus.publish({ type: eventType, formScopeId: formComponent.eventScopeId });
        await fixture.whenStable();
        fixture.detectChanges();
        expectTitleError(fixture.nativeElement);
      });
    }

    it('T6: shows errors on load for an existing record with the flag enabled', async () => {
      const { fixture, formComponent } = await createDeferredForm({ deferErrorsOnNewRecord: true }, {});
      expect(formComponent.trimmedParams.oid()).not.toBe('');
      expectTitleError(fixture.nativeElement);
    });

    it('T7: shows errors on load for a new record without the flag', async () => {
      const { fixture } = await createDeferredForm({});
      expectTitleError(fixture.nativeElement);
    });

    it('T8: defers the valid info box until a field is touched', async () => {
      const { fixture, formComponent } = await createDeferredForm({
        deferErrorsOnNewRecord: true, showWhenValid: true,
      }, { oid: '' }, false);
      expect(fixture.nativeElement.querySelector('.alert-info')).toBeNull();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('.alert-info')?.textContent.trim()).toBe('The form is valid.');
    });

    const deferredStateCases: Array<[ValidationSummaryFieldComponentConfigFrame, string, boolean]> = [
      [{ deferErrorsOnNewRecord: true, showWhenValid: true }, '', true],
      [{ deferErrorsOnNewRecord: true, showWhenValid: true }, 'existing-record', false],
      [{ showWhenValid: true }, '', false],
    ];
    for (const [config, oid, expected] of deferredStateCases) {
      it(`sets the deferred state to ${expected} before the first refresh (flag ${config.deferErrorsOnNewRecord === true}, oid '${oid}')`, () => {
        const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
        const component = fixture.componentInstance as any;
        spyOnProperty(component, 'formComponent', 'get').and.returnValue({
          trimmedParams: { oid: () => oid },
          form: undefined,
        });
        component.setPropertiesFromComponentMapEntry({
          compConfigJson: { name: 'summary', component: { class: 'ValidationSummaryComponent', config } },
        });
        expect(component.errorDisplayDeferred).toBe(expected);
      });
    }

    it('T9: keeps errors visible after the form becomes pristine and untouched again', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      formComponent.form!.get('title')!.markAsTouched();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
      formComponent.form!.markAsPristine();
      formComponent.form!.markAsUntouched();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });

    for (const interaction of ['touch', 'edit'] as const) {
      it(`latches a ${interaction} even when the form is reset before the queued refresh`, async () => {
        const { fixture, formComponent } = await createDeferredForm();
        const control = formComponent.form!.get('optional')!;
        if (interaction === 'touch') {
          control.markAsTouched();
        } else {
          control.setValue('An edit');
          control.markAsDirty();
        }
        formComponent.form!.markAsPristine();
        formComponent.form!.markAsUntouched();
        await fixture.whenStable();
        expectTitleError(fixture.nativeElement);
      });
    }

    it('shows errors on load for a new record with the flag explicitly false', async () => {
      const { fixture } = await createDeferredForm({ deferErrorsOnNewRecord: false });
      expectTitleError(fixture.nativeElement);
    });

    it('shows errors after a new record receives its first saved oid', async () => {
      const { fixture, formComponent } = await createDeferredForm();
      expect(fixture.nativeElement.querySelector('.validation-summary')).toBeNull();
      formComponent.oid.set('first-saved-record');
      formComponent.form!.updateValueAndValidity();
      await fixture.whenStable();
      expectTitleError(fixture.nativeElement);
    });
  });

  it('renders translated HTML labels as text inside the summary link, retaining raw metadata and error text', async () => {
    translationService.translationMap['@research-label'] = 'Research with <a href="https://example.org" target="_blank" rel="noopener">DFAT &amp; Australia&#39;s partners</a>?';
    const { fixture } = await createFormAndWaitForReady({
      name: 'html-labels',
      componentDefinitions: [
        {
          name: 'research',
          model: { class: 'SimpleInputModel', config: { value: '', validators: [{ class: 'required' }] } },
          component: { class: 'SimpleInputComponent' },
          layout: { class: 'DefaultLayout', config: { label: '@research-label' } },
        },
        { name: 'summary', component: { class: 'ValidationSummaryComponent' } },
      ],
    }, { editMode: true });
    const root: HTMLElement = fixture.nativeElement;
    const link = root.querySelector('.validation-summary-item a');
    expect(link?.textContent).toBe("Research with DFAT & Australia's partners?");
    expect(link?.querySelector('a')).toBeNull();
    expect(link?.textContent).not.toContain('<a href');
    expect(link?.getAttribute('data-validation-summary-message')).toBe('@research-label');
    // The original field continues to render the linked label intentionally.
    expect(root.querySelector('.rb-form-field-label a')?.textContent).toBe("DFAT & Australia's partners");

    const summary = fixture.componentInstance.componentDefArr[1].component as ValidationSummaryFieldComponent;
    summary.validationErrorsDisplay$.next([{
      id: 'server-field', message: translationService.translationMap['@research-label'],
      errors: [{ class: 'server', message: 'Keep literal <value> &amp; text', params: {} }],
      lineagePaths: { formConfig: [], angularComponents: [], dataModel: [], layout: [] },
    }]);
    fixture.detectChanges();
    expect(root.querySelector('.validation-summary-item a')?.textContent).toBe("Research with DFAT & Australia's partners?");
    expect(root.querySelector('.validation-summary-errors li')?.textContent).toBe('Keep literal <value> &amp; text');
  });

  for (const source of ['form config', 'component entries']) {
    it(`converts tab, group and leaf lineage labels from ${source} before joining and deduplicating`, () => {
      const component = TestBed.createComponent(ValidationSummaryFieldComponent).componentInstance;
      const leaf = { name: 'field', component: { class: 'SimpleInputComponent' }, layout: { config: { label: '<a href="/field">Field &amp; partners</a>' } } };
      const group = { name: 'group', component: { class: 'GroupComponent', config: { componentDefinitions: [leaf] } }, layout: { config: { label: '<b>Group</b>' } } };
      const tab = { name: 'tab', component: { class: 'TabContentComponent', config: { componentDefinitions: [group] } }, layout: { config: { buttonLabel: '<em>Tab</em>' } } };
      const leafEntry = { compConfigJson: leaf };
      const groupEntry = { compConfigJson: group, component: { formFieldCompMapEntries: [leafEntry] } };
      const tabEntry = { compConfigJson: tab, component: { formFieldCompMapEntries: [groupEntry] } };
      spyOnProperty(component as any, 'formComponent', 'get').and.returnValue({
        formDefMap: source === 'form config' ? { formConfig: { componentDefinitions: [tab] } } : undefined,
        componentDefArr: [tabEntry],
      });
      (component as any).formFieldCompMapEntry = { compConfigJson: { component: { config: { includeTabLabel: true } } } };
      expect(component.getValidationSummaryLabel({
        id: 'field', message: '<strong>Field &amp; partners</strong>', errors: [],
        lineagePaths: {
          formConfig: ['componentDefinitions', 0, 'component', 'config', 'componentDefinitions', 0, 'component', 'config', 'componentDefinitions', 0],
          angularComponents: ['tab', 'group', 'field'], dataModel: [], layout: [],
        },
      })).toBe('Tab - Group - Field & partners');
    });
  }

  it('focuses the linked element when a summary has no component lineage', fakeAsync(() => {
    const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
    const input = document.createElement('input');
    input.id = 'summary-target-without-lineage';
    fixture.nativeElement.appendChild(input);
    const scrollSpy = spyOn(input, 'scrollIntoView');
    const publishSpy = spyOn(TestBed.inject(FormComponentEventBus), 'publish');
    const event = new MouseEvent('click', { cancelable: true });

    fixture.componentInstance.onValidationSummaryClick(event, {
      id: input.id, message: 'Required field', errors: [],
      lineagePaths: { angularComponents: [], dataModel: [], formConfig: [], layout: [] },
    });
    tick(0);

    expect(event.defaultPrevented).toBeTrue();
    expect(document.activeElement).toBe(input);
    expect(scrollSpy).toHaveBeenCalledOnceWith({ behavior: 'smooth', block: 'center' });
    expect(publishSpy).not.toHaveBeenCalled();
  }));

  for (const targetId of [null, 'missing-summary-target']) {
    it(`leaves focus unchanged when a summary has no lineage and target ${targetId}`, fakeAsync(() => {
      const fixture = TestBed.createComponent(ValidationSummaryFieldComponent);
      const input = document.createElement('input');
      fixture.nativeElement.appendChild(input);
      input.focus();

      fixture.componentInstance.onValidationSummaryClick(new MouseEvent('click'), {
        id: targetId, message: 'Unavailable field', errors: [],
        lineagePaths: { angularComponents: [], dataModel: [], formConfig: [], layout: [] },
      });
      tick(0);

      expect(document.activeElement).toBe(input);
    }));
  }

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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });

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

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });

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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });

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

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });

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

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });
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

    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });
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
    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });
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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });
    const nativeEl: HTMLElement = fixture.nativeElement;
    const link = nativeEl.querySelector('a[data-validation-summary-id="form-item-id-text-1-event"]') as HTMLAnchorElement | null;
    const input = nativeEl.querySelector<HTMLInputElement>('input')!;
    const focusSpy = spyOn(input, 'focus').and.callThrough();

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
    await fixture.whenStable();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    expect(document.activeElement).toBe(input);
    expect(focusSpy).toHaveBeenCalledTimes(1);
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
    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });
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

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });
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

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });
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

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });
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

    const { fixture: fixtureWithoutTabLabel } = await createFormAndWaitForReady(formConfigWithoutTabLabel, { editMode: true });
    const { fixture: fixtureWithTabLabel } = await createFormAndWaitForReady(formConfigWithTabLabel, { editMode: true });

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

    const { fixture } = await createFormAndWaitForReady(formConfig, { editMode: true });
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
    const { fixture, formComponent } = await createFormAndWaitForReady(formConfig, { editMode: true });

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
